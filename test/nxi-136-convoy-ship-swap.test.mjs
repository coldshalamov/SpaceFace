// NXI-136 — return freight to the correct site when the player changes ships.
// Contract: a claim relay leg is keyed on its durable shipment/site identity
// (bodyId / convoyId / worldRecordId / destStationId), never on the player's current hull.
// Swapping the active ship mid-leg must not redirect the freight into a player hold, must not
// duplicate it, and must not reset the leg — including through a player-hull loss. Exercised
// through the real owners: traffic manifests and unloads the carrier, ships flips the active
// hull through the docked-shipyard path, cargo parks the holds, claims settles the leg.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { createDomainMirroringProfile } from '../scripts/lib/simReadModel.mjs';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { claims } from '../src/systems/claims.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { economy } from '../src/systems/economy.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { cargo as cargoSystem, addCargo, reservedCargoQuantity } from '../src/systems/cargo.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const SEED = 9021;
const CLAIM_SECTOR = 'sector_io_reach';
const RELAY_GOOD = 'cmdty_refined_metals';

function bootConvoy(seed = SEED, sectorId = CLAIM_SECTOR) {
  const sim = createSimulation({ seed, systems: [
    world, spawnBudget, npcJobsRuntime, economy, traffic, claims, ships, cargoSystem,
  ] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 500000;
  state.player.researchedNodes = ['tech_outpost_charter'];
  state.onboarding = { active: false, finished: true };
  const player = sim.spawn(makeShipEntitySpec('ship_hornet', {
    team: 0, pos: sectorLocalToGlobalForSector({ x: 200, z: 0 }, sectorId),
  }));
  player.isPlayer = true;
  state.playerId = player.id;
  sim.registry.get('world').enterSector(sectorId);
  return sim;
}

function commissionRelay(sim, { sectorId = CLAIM_SECTOR, localPos = { x: 200, z: 0 }, dispatchImmediately = true } = {}) {
  const { state } = sim;
  const owner = sim.registry.get('claims');
  const poi = SECTORS.find((s) => s.id === sectorId).pois.find((p) => p.claimable);
  assert.ok(poi, `${sectorId} ships a claimable body`);
  assert.equal(owner.claim({ ...poi, pos: sectorLocalToGlobalForSector(localPos, sectorId) }), true);
  const body = state.claims.bodies[state.claims.bodies.length - 1];
  assert.equal(owner.buildModule(body.id, 'mod_depot'), true, 'depot module builds');
  assert.equal(owner.specialize(body.id, 'spec_relay'), true, 'relay commissions');
  addCargo(state, RELAY_GOOD, 60);
  const moved = owner.deliverToClaim(body.id, RELAY_GOOD, 60);
  assert.ok(moved >= 20, `relay store holds a dispatchable load (got ${moved})`);
  if (dispatchImmediately) body.spec.nextDispatchAt = state.simTime;
  return body;
}

function liveConvoyHulls(sim, convoyId) {
  const out = [];
  for (const ent of sim.state.entities.values()) {
    const mark = ent && ent.data && ent.data.claimConvoy;
    if (mark && mark.convoyId === convoyId && ent.alive !== false) out.push(ent);
  }
  return out;
}

// The real ship-change path: the player owns a second hull record, berths at a station with a
// live shipyard service (the world freeze gates on ui.docked), the UI intent flips the active
// hull through ships → ship:parkedHoldSwap → cargo, then the player undocks and the sim resumes.
function giveSecondHull(state) {
  state.player.moduleInventory = [];
  state.player.activeShipIndex = 0;
  state.player.ownedShips = [
    { defId: 'ship_hornet', fittings: [] },
    { defId: 'ship_kestrel', fittings: [] },
  ];
}

function swapToSecondHull(sim) {
  const { state, bus } = sim;
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios'; // live shipyard service — hull access
  bus.emit('ui:setActiveShip', { index: 1 });
  assert.equal(state.player.activeShipIndex, 1, 'the active hull actually changed');
  assert.equal(state.entities.get(state.playerId).data.defId, 'ship_kestrel',
    'the player entity re-derived onto the new hull');
  state.ui.docked = false;
  state.ui.dockedStationId = null;
}

function playerHeldUnits(state, goodId) {
  const live = (state.player.cargo.items || {})[goodId] || 0;
  const parked = (state.player.ownedShips || []).reduce((sum, s) =>
    sum + ((s.cargo && s.cargo.items && s.cargo.items[goodId]) || 0), 0);
  return { live, parked };
}

function berthUnload(sim, body, convoy) {
  sim.bus.emit('npcjobs:unload', {
    event: 'npcjobs:unload', kind: 'hauler', jobId: `job:${convoy.worldRecordId}`,
    completed: true, destination: `dest:${convoy.destStationId}`,
    payload: {
      claimConvoy: {
        bodyId: body.id, convoyId: convoy.convoyId, destStationId: convoy.destStationId,
      },
    },
  });
}

test('a worker relay dispatch sells its own cargo once and preserves the active delivery', async (t) => {
  const host = createSimHost();
  t.after(() => host.shutdown());
  const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  await host.init({ profile: 'production', seed: SEED, bridgeAll: true,
    domainMirroring: createDomainMirroringProfile('station'), scenarioContract });
  const { state, bus, registry, runtime } = host.host;
  const sectorId = 'sector_ceres_belt';
  state.mode = 'flight';
  state.player.credits = 500000;
  state.player.researchedNodes = ['tech_outpost_charter'];
  state.onboarding = { active: false, finished: true };
  const pilot = runtime.spawn(makeShipEntitySpec('ship_hornet', { team: 0, isPlayer: true }));
  state.playerId = pilot.id;
  registry.get('world').enterSector(sectorId);
  const prospect = SECTORS.find(sector => sector.id === sectorId).pois.find(poi => poi.id === 'poi_claim_rookery');
  const body = commissionRelay({ state, registry }, { sectorId, localPos: prospect.pos, dispatchImmediately: false });
  addCargo(state, RELAY_GOOD, 8);
  state.missions.active.push({ type: 'cargo_delivery', status: 'active', preloadedCargo: true,
    params: { cmdtyId: RELAY_GOOD, qty: 8, sealAccounted: true, sealedRemaining: 8 } });

  let tick = 0;
  const request = async (expectedConvoySeq) => {
    const command = createSimCommandRing();
    command.pushRpc(tick + 1, 'claimsCall', { method: 'requestRelayDispatch', bodyId: body.id, expectedConvoySeq });
    return host.tick({ tick: ++tick, steps: 0, commands: command.drain() });
  };
  const previousSchedule = body.spec.nextDispatchAt;
  assert.ok(previousSchedule > state.simTime);
  const stale = await request(1);
  assert.equal(stale.rpcAcks[0].result.ok, false);
  assert.equal(body.spec.nextDispatchAt, previousSchedule);
  const accepted = await request(0);
  assert.equal(accepted.rpcAcks[0].result.ok, true);
  assert.equal(body.spec.nextDispatchAt, state.simTime);
  assert.ok(accepted.domainUpdates.some(update => update.segs.join('.') === 'claims'),
    'the paused reply publishes the changed claim to the Base mirror');
  assert.equal(body.spec.convoy, null, 'the modal dispatch only schedules the next flight tick');

  runtime.runTicks(240);
  const convoy = body.spec.convoy;
  assert.ok(convoy?.manifested);
  assert.equal(convoy.destStationId, 'station_ceres');
  assert.equal(convoy.qty, 60);
  assert.ok(convoy.worldRecordId);
  assert.equal(liveConvoyHulls({ state }, convoy.convoyId).length, 1);
  const economyOwner = registry.get('economy');
  const entry = economyOwner.ensureMarket(convoy.destStationId)[RELAY_GOOD];
  const stock = entry.stock;
  const credits = state.player.credits;
  const quote = economyOwner.quote(convoy.destStationId, RELAY_GOOD, 'sell', 1);
  assert.equal(quote.reason, 'mission_cargo_locked', 'the same commodity in the personal hold cannot sell');
  const unit = economyOwner.priceOf(convoy.destStationId, RELAY_GOOD, 'sell', { operationCustody: true });
  assert.ok(unit > 0);
  const berth = () => berthUnload({ bus }, body, convoy);
  berth();
  berth();
  const sales = body.spec.receipts.filter(row => row.kind === 'convoy_sold');
  assert.equal(sales.length, 1);
  assert.equal(sales[0].data.qty, convoy.qty);
  assert.equal(state.player.credits - credits, Math.round(convoy.qty * unit * (1 - sales[0].data.saleFee)));
  assert.equal(entry.stock - stock, convoy.qty);
  assert.equal(state.player.cargo.items[RELAY_GOOD], 8);
  assert.equal(reservedCargoQuantity(state, RELAY_GOOD), 8);
  assert.equal(body.spec.convoy, null);
  assert.equal((await request(0)).rpcAcks[0].result.ok, false, 'the finished sequence cannot queue a new trip');
});

test('changing ships mid-leg leaves the convoy on its shipment identity and settles it once', () => {
  const sim = bootConvoy();
  try {
    const { state, bus } = sim;
    giveSecondHull(state);
    const body = commissionRelay(sim);
    sim.runTicks(240); // dispatch window + traffic maintenance passes
    const convoy = body.spec.convoy;
    assert.ok(convoy && convoy.convoyId, 'claims dispatched a convoy leg');
    assert.equal(convoy.manifested, true, 'traffic manifested the carrier');
    const hull = state.entities.get(convoy.entityId);
    assert.ok(hull && hull.data.claimConvoy, 'the carrier is a live stamped hull');
    const manifestBefore = hull.data.cargoManifest;
    const legBefore = { ...convoy };
    const storeBefore = body.spec.store.input[RELAY_GOOD] || 0;

    // The player changes hulls while the convoy is en route.
    swapToSecondHull(sim);

    // The leg is unchanged — keyed on the shipment, not the hull the player now flies.
    assert.equal(body.spec.convoy, convoy, 'the leg record is the same object, not re-keyed');
    assert.equal(convoy.convoyId, legBefore.convoyId);
    assert.equal(convoy.entityId, legBefore.entityId, 'still bound to the same carrier hull');
    assert.equal(convoy.destStationId, legBefore.destStationId, 'destination did not move');
    assert.equal(convoy.qty, legBefore.qty);
    const hulls = liveConvoyHulls(sim, convoy.convoyId);
    assert.equal(hulls.length, 1, 'still exactly one carrier — the swap spawned no second hull');
    assert.equal(hulls[0], hull, 'the same hull keeps hauling');
    assert.equal(hull.data.cargoManifest, manifestBefore, 'the manifest was not re-stocked');
    assert.equal(hull.data.cargoManifest.totalQty, legBefore.qty,
      'the freight is still aboard the carrier, not siphoned into a player hold');
    assert.deepEqual(playerHeldUnits(state, RELAY_GOOD), { live: 0, parked: 0 },
      'no convoy freight leaked into the live or parked player holds');

    // The leg still completes at its own berth — once.
    const docked = [];
    bus.on('claim:convoyDocked', (p) => docked.push(p));
    berthUnload(sim, body, convoy);
    assert.equal(docked.length, 1, 'the berth unload settled the leg exactly once');
    assert.equal(docked[0].qty, legBefore.qty, 'the whole aboard quantity arrived');
    assert.equal(body.spec.convoy, null, 'the leg closed');
    const result = (body.spec.receipts || []).filter((r) =>
      r.kind === 'convoy_sold' || r.kind === 'convoy_returned');
    assert.equal(result.length, 1, 'one settlement receipt — sale or return, never both');
    assert.equal(result[0].data.qty, legBefore.qty);
    const storeAfter = body.spec.store.input[RELAY_GOOD] || 0;
    if (result[0].kind === 'convoy_returned') {
      assert.equal(storeAfter - storeBefore, legBefore.qty,
        'returned freight landed at the site store exactly once');
    } else {
      assert.equal(storeAfter, storeBefore, 'sold freight did not also restock the site');
    }
    assert.deepEqual(playerHeldUnits(state, RELAY_GOOD), { live: 0, parked: 0 },
      'settled freight never routed through a player hold');
    assert.equal(hull.alive, false, 'the completed carrier retired');
  } finally { sim.dispose(); }
});

test('returned freight lands at the shipment site — never in the player’s new hull', () => {
  const sim = bootConvoy();
  try {
    const { state, bus } = sim;
    giveSecondHull(state);
    const body = commissionRelay(sim);
    sim.runTicks(240);
    const convoy = body.spec.convoy;
    assert.ok(convoy && convoy.convoyId, 'leg dispatched');
    const hull = state.entities.get(convoy.entityId);
    assert.ok(hull && hull.data.claimConvoy, 'carrier manifested');

    // No listed sell price at the destination — the honest path is return-to-site.
    delete state.economy.markets[convoy.destStationId][RELAY_GOOD];
    const storeBefore = body.spec.store.input[RELAY_GOOD] || 0;
    const creditsBefore = state.player.credits;

    swapToSecondHull(sim);

    const docked = [];
    bus.on('claim:convoyDocked', (p) => docked.push(p));
    berthUnload(sim, body, convoy);
    assert.equal(docked.length, 1);
    const returned = (body.spec.receipts || []).filter((r) => r.kind === 'convoy_returned');
    assert.equal(returned.length, 1, 'the freight returned to the site, named as a return');
    assert.equal(returned[0].data.qty, convoy.qty);
    assert.equal(body.spec.store.input[RELAY_GOOD] - storeBefore, convoy.qty,
      'the site store received the whole shipment exactly once');
    assert.deepEqual(playerHeldUnits(state, RELAY_GOOD), { live: 0, parked: 0 },
      'returned freight is site inventory — zero units in any player hull');
    assert.equal(state.player.credits, creditsBefore, 'a return pays nothing');

    // The retired hull keeps its manifest as the delivered record — but a repeated berth
    // unload cannot settle the closed leg a second time.
    docked.length = 0;
    berthUnload(sim, body, convoy);
    assert.equal(docked.length, 0, 'the concluded leg cannot be settled twice');
    assert.equal(body.spec.store.input[RELAY_GOOD] - storeBefore, convoy.qty,
      'no second copy of the freight materialized');
    assert.equal(
      (body.spec.receipts || []).filter((r) => r.kind === 'convoy_returned').length, 1,
      'still exactly one return receipt');
  } finally { sim.dispose(); }
});

test('losing the player hull does not reset convoy ownership or spill its freight', () => {
  const sim = bootConvoy();
  try {
    const { state, bus } = sim;
    const body = commissionRelay(sim);
    sim.runTicks(240);
    const convoy = body.spec.convoy;
    assert.ok(convoy && convoy.convoyId, 'leg dispatched');
    const hull = state.entities.get(convoy.entityId);
    assert.ok(hull && hull.data.claimConvoy, 'carrier manifested');
    const playerEnt = state.entities.get(state.playerId);

    // The player hull dies mid-leg — the lifecycle event any respawn flow would raise.
    playerEnt.alive = false;
    bus.emit('entity:killed', {
      id: playerEnt.id, killerId: 777, sectorId: CLAIM_SECTOR, entity: playerEnt,
    });
    sim.runTicks(60); // let traffic/claims maintenance see the player-free world

    assert.equal(body.spec.convoy, convoy, 'the leg record survived the player loss');
    assert.ok(convoy.convoyId, 'the convoy id is still bound');
    assert.equal(convoy.entityId, hull.id, 'still owned by its carrier record, not the player');
    const hulls = liveConvoyHulls(sim, convoy.convoyId);
    assert.equal(hulls.length, 1, 'one carrier, unretired by the player kill');
    assert.equal(hull.data.cargoManifest && hull.data.cargoManifest.totalQty, convoy.qty,
      'the freight is still aboard its carrier');
    assert.equal(body.spec.totals.lostU, 0, 'no phantom loss was booked');
    assert.equal((body.spec.receipts || []).some((r) => r.kind === 'convoy_lost'), false,
      'no convoy_lost receipt — the player’s hull is not the convoy');
  } finally { sim.dispose(); }
});
