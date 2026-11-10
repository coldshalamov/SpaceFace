// NXI-136 — return freight to the correct site when the player changes ships.
// Contract: a claim relay leg is keyed on its durable shipment/site identity
// (bodyId / convoyId / worldRecordId / destStationId), never on the player's current hull.
// Swapping the active ship mid-leg must not redirect the freight into a player hold, must not
// duplicate it, and must not reset the leg — including through a player-hull loss. Exercised
// through the real owners: traffic manifests and unloads the carrier, ships flips the active
// hull through the docked-shipyard path, cargo parks the holds, claims settles the leg.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { claims } from '../src/systems/claims.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { economy } from '../src/systems/economy.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { cargo as cargoSystem, addCargo } from '../src/systems/cargo.js';
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

function commissionRelay(sim, { sectorId = CLAIM_SECTOR, localPos = { x: 200, z: 0 } } = {}) {
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
  body.spec.nextDispatchAt = state.simTime;
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
