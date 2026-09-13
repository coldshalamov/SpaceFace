import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { TETHYS_BLACK_MARKET_DISCOVERY as DISCOVERY, TETHYS_BLACK_MARKET_RUN as RUN, frontierRumorOffer, hasTethysBlackMarketAccess, normalizeFrontierRumorState, tethysBlackMarketRun } from '../src/data/frontierRumors.js';
import { physics } from '../src/core/physics.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { heat } from '../src/systems/heat.js';
import { dropKickCargoPod, DROP_KICK_CRUISE_SPEED } from '../src/systems/jettisonImpulse.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { lootShards } from '../src/systems/lootShards.js';
import { pirateDisguise } from '../src/systems/pirateDisguise.js';
import { scanner } from '../src/systems/scanner.js';
import { world } from '../src/systems/world.js';
import * as marketScreen from '../src/ui/station/screens/market.js';
import { buildReply } from '../src/ui/station/barContacts.js';
import { RESIDENCY_TIER } from '../src/data/sectorCoordinates.js';
import { resolveDockDeny } from '../src/ui/dockDenyBanner.js';

const SEED = 17704;
const GOOD = 'cmdty_narcotics';
const UNITS = 8;
const OUTLAW = 'station_smuggler';

const SYSTEMS = [world, cargo, economy, scanner, lootShards, pirateDisguise, lawSecurity, heat, physics];

function contactAndEnter(sim) {
  const { state, bus } = sim;
  const worldSys = sim.registry.get('world');
  const player = state.entities.get(state.playerId);
  worldSys.enterSector(DISCOVERY.sectorId);
  const offer = frontierRumorOffer(state, DISCOVERY.stationId);
  state.ui.dockedStationId = DISCOVERY.stationId;
  bus.emit('ui:purchaseFrontierRumor', { stationId: DISCOVERY.stationId, rumorId: offer.id });
  state.ui.dockedStationId = null;
  const buoy = state.entityList.find((e) => e.alive && e.data?.poiId === DISCOVERY.poiId);
  place(player, buoy.pos.x, buoy.pos.z);
  state.input.actions = { scanPulse: true };
  sim.step();
  bus.emit('signal:investigate', { signalId: `signal:poi:${DISCOVERY.poiId}` });
  sim.step();
  assert.equal(tethysBlackMarketRun(state)?.phase, 'available');
  assert.equal(hasTethysBlackMarketAccess(state), false, 'contact and heist opportunity alone never grant market access');
  worldSys.enterSector(RUN.sectorId);
  return state.entityList.find((e) => e.alive && e.data?.tethysEntranceMemberId === RUN.parcelId);
}

function ship(pos, { team = 0, mass = 18, radius = 14, dynamic = true, data = {} } = {}) {
  return {
    type: 'ship', team, pos, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius, mass, hull: 400, hullMax: 400, collides: true,
    factionId: team === 0 ? 'player' : 'faction_scn', flags: {},
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: 80, dynamic, ccd: true, material: 'ship', revision: 0 },
    data: { defId: 'ship_kestrel', ...data },
  };
}

function place(entity, x, z) {
  Object.assign(entity.pos, { x, z });
  if (entity.prevPos) Object.assign(entity.prevPos, { x, z });
  Object.assign(entity.vel, { x: 0, z: 0 });
  if (entity.physicsBody) entity.physicsBody.revision += 1;
}

test(`seed ${SEED}: physical smuggling reaches the outlaw market, pays a visible wash cut, and changes its own quote`, async () => {
  const sim = createSimulation({ seed: SEED, systems: SYSTEMS, updateOrder: SYSTEMS.filter((s) => s !== world) });
  const { state, bus } = sim;
  const physicsSys = sim.registry.get('physics');
  try {
    state.mode = 'flight';
    state.player.credits = 10_000;
    state.player.cargo.capVolume = 40;
    const player = sim.spawn(ship({ x: -19, z: 28 }));
    state.playerId = player.id;
    assert.equal(await physicsSys.prepareBackend(state), true);
    const market = sim.registry.get('economy');
    const trades = [];
    const scans = [];
    const accessGrants = [];
    bus.on('economy:tradeCompleted', (receipt) => trades.push(receipt));
    bus.on('contraband:scanned', (receipt) => scans.push(receipt));
    bus.on('frontierRumor:blackMarketAccess', (receipt) => accessGrants.push(receipt));

    // The normal rumor/pulse/investigate path supplies the run in actual Pallas residency.
    assert.equal(market.quote(OUTLAW, GOOD, 'buy', UNITS).reason, 'black_market_locked');
    assert.equal(market.execute(OUTLAW, GOOD, 'buy', UNITS).reason, 'black_market_locked');
    const pod = contactAndEnter(sim);
    assert.ok(pod);
    assert.equal(resolveDockDeny(state, OUTLAW)?.reason, 'private');
    assert.equal(resolveDockDeny(state, OUTLAW)?.factionId, 'faction_quiet');
    assert.equal(market.quote('station_helios', GOOD, 'sell', UNITS).reason, 'untraded');
    assert.equal(state.player.cargo.items[GOOD] || 0, 0);
    place(player, pod.pos.x - 40, pod.pos.z + 60);
    state.ui.dockedStationId = OUTLAW;
    const beforeDeniedWash = state.player.credits;
    assert.equal(sim.registry.get('pirateDisguise').launderAtDock({ stationId: OUTLAW }).reason, 'black_market_locked');
    assert.equal(state.player.credits, beforeDeniedWash);
    assert.equal(pod.data.legality, 'contraband');
    state.ui.dockedStationId = null;
    sim.step();
    assert.equal(dropKickCargoPod(sim.helpers, state, pod, 0, DROP_KICK_CRUISE_SPEED), true);
    for (let tick = 0; tick < 220 && !pod.data.caughtByNet; tick += 1) sim.step();
    assert.equal(pod.data.customsConeEntered, true, 'cargo physically crossed customs');
    assert.equal(pod.data.caughtByNet, true, 'cargo reached the outlaw catch body');
    assert.equal(scans.length, 0, 'the fast transit beats scan dwell');
    assert.equal(hasTethysBlackMarketAccess(state), true);
    assert.equal(resolveDockDeny(state, OUTLAW), null, 'valid delivery immediately opens the resident berth');
    const delivered = tethysBlackMarketRun(state).deliveredAt;
    bus.emit('cargo:caughtByNet', { podId: pod.id, netId: pod.data.caughtByNetId });
    assert.equal(tethysBlackMarketRun(state).deliveredAt, delivered, 'replayed catch does not grant twice');
    assert.equal(accessGrants.length, 1, 'the durable access receipt is emitted exactly once');

    // Dock alongside the delivered pod. The existing wash changes its papers and charges once.
    place(player, pod.pos.x + 40, pod.pos.z);
    const creditsBeforeWash = state.player.credits;
    state.ui.dockedStationId = OUTLAW;
    bus.emit('dock:docked', { stationId: OUTLAW });
    assert.equal(pod.data.laundered, true);
    assert.equal(pod.data.legality, 'legal');
    const wash = state.player.launderLedger[0];
    assert.equal(wash.cut, 616);
    assert.equal(state.player.credits, creditsBeforeWash - wash.cut);
    bus.emit('dock:launder', { stationId: OUTLAW });
    assert.equal(state.player.launderLedger.length, 1, 'repeated dock intents cannot re-charge washed cargo');

    // Collection's public synchronous acceptance seam returns the exact pod quantity to the hold.
    const pickup = { pickupId: pod.id, collectorId: player.id, ...pod.data };
    bus.emit('pickup:collected', pickup);
    assert.equal(pickup.acceptedAmount, UNITS);
    sim.helpers.removeEntity(pod.id);
    const listing = state.economy.markets[OUTLAW][GOOD];
    const stockBefore = listing.stock;
    const quoteBefore = market.quote(OUTLAW, GOOD, 'sell', UNITS);
    bus.emit('ui:sell', { commodityId: GOOD, qty: UNITS });
    const sale = trades.at(-1);
    assert.equal(sale.side, 'sell');
    assert.equal(sale.total, quoteBefore.total);
    assert.equal(listing.stock, stockBefore + UNITS);
    assert.equal(state.player.cargo.items[GOOD] || 0, 0);
    assert.equal(state.player.credits, creditsBeforeWash - wash.cut + sale.total);
    const nextQuote = market.quote(OUTLAW, GOOD, 'sell', UNITS);
    assert.ok(nextQuote.total < quoteBefore.total, 'the player supply lowers the next executable quote');
    assert.equal(state.economy.marketIntel[OUTLAW].snapshot[GOOD].stock, listing.stock);

    assert.equal(typeof marketScreen.marketLaunderLedgerHtml, 'function', 'the market must present the wash ledger');
    const visibleLedger = marketScreen.marketLaunderLedgerHtml(state);
    assert.match(visibleLedger, /Laundering ledger/);
    assert.match(visibleLedger, /Narcotics/);
    assert.match(visibleLedger, /8 u/);
    assert.match(visibleLedger, /616 cr/);
    assert.match(visibleLedger, /35%/);
    assert.equal(marketScreen.marketLaunderLedgerHtml({ ...state, player: JSON.parse(JSON.stringify(state.player)) }), visibleLedger,
      'the persisted player ledger renders the same receipt after a JSON round trip');
    state.ui.dockedStationId = 'station_helios';
    assert.equal(marketScreen.marketLaunderLedgerHtml(state), '', 'another berth cannot claim this wash');
    const savedWorld = JSON.parse(JSON.stringify(sim.registry.get('world').serialize()));
    for (const entity of [...state.entityList]) if (entity.id !== state.playerId) sim.helpers.removeEntity(entity.id);
    sim.registry.get('world').deserialize(savedWorld);
    sim.registry.get('world').enterSector(RUN.sectorId, { restoreDurableRecords: true });
    assert.equal(hasTethysBlackMarketAccess(state), true, 'earned access survives actual world reload');
    assert.equal(resolveDockDeny(state, OUTLAW), null, 'the reloaded berth materializes unlocked');
    assert.equal(state.entityList.some((e) => e.alive && e.data?.tethysEntranceMemberId === RUN.parcelId), false,
      'delivered and collected cargo cannot be supplied again');
    console.log(`PQ-177.04 seed=${SEED} customs=evaded delivered=${UNITS} wash=${wash.cut} sale=${sale.total} nextSale=${nextQuote.total} stock=${stockBefore}->${listing.stock}`);
  } finally {
    physicsSys._disableSg02DynamicAuthority();
    sim.dispose();
  }
});

async function bootRun() {
  const sim = createSimulation({ seed: SEED, systems: SYSTEMS, updateOrder: SYSTEMS.filter((s) => s !== world) });
  sim.state.mode = 'flight';
  sim.state.player.credits = 20_000;
  const player = sim.spawn(ship({ x: 0, z: 0 }));
  sim.state.playerId = player.id;
  assert.equal(await sim.registry.get('physics').prepareBackend(sim.state), true);
  const pod = contactAndEnter(sim);
  place(player, pod.pos.x - 90, pod.pos.z + 100);
  return { sim, pod, player, worldSys: sim.registry.get('world') };
}

function disposeRun(sim) {
  sim.registry.get('physics')._disableSg02DynamicAuthority();
  sim.dispose();
}

test('the live run rejects fabricated, unrelated, altered, and customs-scanned deliveries', async () => {
  const { sim, pod, player, worldSys } = await bootRun();
  const { state, bus } = sim;
  try {
    const net = state.entities.get(worldSys._tethysRunEntities.receiver);
    bus.emit('cargo:caughtByNet', { podId: pod.id, netId: net.id });
    assert.equal(hasTethysBlackMarketAccess(state), false, 'an event alone has no physical catch');
    const unrelated = sim.spawn(ship({ ...net.pos }, { data: { outlawCatchNet: true } }));
    bus.emit('cargo:caughtByNet', { podId: pod.id, netId: unrelated.id });
    assert.equal(hasTethysBlackMarketAccess(state), false, 'generic nets have no run identity');
    const genericPod = sim.spawn({ ...pod, id: undefined, data: { ...pod.data } });
    bus.emit('cargo:caughtByNet', { podId: genericPod.id, netId: net.id });
    assert.equal(hasTethysBlackMarketAccess(state), false, 'copying stable tags cannot replace the live linked parcel');
    sim.helpers.removeEntity(genericPod.id);
    sim.helpers.removeEntity(unrelated.id);

    const cutter = state.entities.get(worldSys._tethysRunEntities.scanner);
    place(pod, cutter.pos.x + 55, cutter.pos.z + 12);
    place(player, cutter.pos.x - 100, cutter.pos.z + 100);
    for (let i = 0; i < 55; i++) sim.step();
    assert.equal(pod.data.customsConeEntered, true);
    assert.equal(pod.data.customsScanned, true, 'slow transit is scanned by the real customs system');
    place(pod, net.pos.x - net.radius - pod.radius + 1, net.pos.z);
    sim.step();
    assert.equal(pod.data.caughtByNet, true);
    assert.equal(hasTethysBlackMarketAccess(state), false, 'the matching but scanned parcel never grants access');
    assert.equal(sim.registry.get('economy').quote(OUTLAW, GOOD, 'sell', 8).reason, 'black_market_locked');
    assert.equal(sim.registry.get('pirateDisguise').launderAtDock({ stationId: OUTLAW }).reason, 'black_market_locked');
    const save = worldSys.serialize();
    assert.equal(save.frontierRumors.byId[DISCOVERY.rumorId].entranceRun.parcel.data.customsScanned, true);
  } finally { disposeRun(sim); }
});

test('one supplied parcel and the lock survive residency eviction and world save/reload without duplicate owners', async () => {
  const { sim, pod, worldSys } = await bootRun();
  const { state } = sim;
  try {
    const run = tethysBlackMarketRun(state);
    const suppliedAt = run.suppliedAt;
    const initialPos = { x: pod.pos.x, z: pod.pos.z };
    worldSys.enterSector(RUN.sectorId, { noTeleport: true });
    assert.equal(state.entityList.filter((e) => e.alive && e.data?.tethysEntranceMemberId === RUN.parcelId).length, 1);
    worldSys._setSectorTier(RUN.sectorId, RESIDENCY_TIER.RECORD_ONLY);
    assert.equal(state.entityList.filter((e) => e.alive && e.data?.tethysEntranceRunId === RUN.runId).length, 0,
      'all three bodies leave actual residency together');
    worldSys._setSectorTier(RUN.sectorId, RESIDENCY_TIER.FULL);
    let restoredPod = state.entities.get(worldSys._tethysRunEntities.parcel);
    assert.ok(restoredPod?.alive, 'the same supplied parcel rematerializes');
    assert.deepEqual({ x: restoredPod.pos.x, z: restoredPod.pos.z }, initialPos);
    assert.equal(tethysBlackMarketRun(state).suppliedAt, suppliedAt);
    const saved = JSON.parse(JSON.stringify(worldSys.serialize()));
    assert.equal(Object.values(saved.records?.byId || {}).some((row) => row.data?.tethysEntranceRunId === RUN.runId), false);
    assert.equal(restoredPod.flags.persistent, false, 'save entity list cannot become a second persistence owner');
    for (const entity of [...state.entityList]) if (entity.id !== state.playerId) sim.helpers.removeEntity(entity.id);
    worldSys.deserialize(saved);
    worldSys.enterSector(RUN.sectorId, { restoreDurableRecords: true });
    restoredPod = state.entities.get(worldSys._tethysRunEntities.parcel);
    assert.equal(restoredPod.data.amount, UNITS);
    assert.deepEqual({ x: restoredPod.pos.x, z: restoredPod.pos.z }, initialPos);
    assert.equal(hasTethysBlackMarketAccess(state), false);
    assert.equal(resolveDockDeny(state, OUTLAW)?.reason, 'private', 'Continue keeps the berth sealed before delivery');
    assert.equal(state.entityList.filter((e) => e.alive && e.data?.tethysEntranceMemberId === RUN.parcelId).length, 1);
    sim.helpers.removeEntity(restoredPod.id);
    const lostSave = JSON.parse(JSON.stringify(worldSys.serialize()));
    assert.equal(lostSave.frontierRumors.byId[DISCOVERY.rumorId].entranceRun.parcel, null);
    for (const entity of [...state.entityList]) if (entity.id !== state.playerId) sim.helpers.removeEntity(entity.id);
    worldSys.deserialize(lostSave);
    worldSys.enterSector(RUN.sectorId, { restoreDurableRecords: true });
    assert.equal(state.entityList.some((e) => e.alive && e.data?.tethysEntranceMemberId === RUN.parcelId), false,
      'a lost or collected parcel is not a fresh supply after Continue');
    assert.equal(hasTethysBlackMarketAccess(state), false);
  } finally { disposeRun(sim); }
});

test('legacy contacted rumors get an available entrance run; only delivered access survives normalization', () => {
  const sim = createSimulation({ seed: SEED, systems: [economy] });
  try {
    const offer = frontierRumorOffer(sim.state, DISCOVERY.stationId);
    const legacy = { ...offer, phase: 'contacted', contactId: DISCOVERY.contactId, opportunity: { type: 'heist_intercept', status: 'completed' } };
    sim.state.world.frontierRumors = normalizeFrontierRumorState({ byId: { [offer.id]: legacy } });
    assert.equal(tethysBlackMarketRun(sim.state).phase, 'available');
    assert.equal(hasTethysBlackMarketAccess(sim.state), false, 'completing the separate heist never opens this berth');
    const delivered = { ...legacy, entranceRun: { ...RUN, phase: 'delivered', deliveredAt: 42, parcel: null } };
    sim.state.world.frontierRumors = normalizeFrontierRumorState(JSON.parse(JSON.stringify({ byId: { [offer.id]: delivered } })));
    assert.equal(hasTethysBlackMarketAccess(sim.state), true);
    assert.equal(tethysBlackMarketRun(sim.state).deliveredAt, 42);
    assert.equal(sim.registry.get('economy').quote(OUTLAW, GOOD, 'sell', UNITS).ok, true);
    assert.match(buildReply('barkeep', 'rumors', { state: sim.state, bus: sim.bus }, DISCOVERY.stationId).text, /entrance parcel arrived clean/);
  } finally { sim.dispose(); }
});
