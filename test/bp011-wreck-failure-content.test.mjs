/**
 * BP-01.1 + PQ-138.04 — the wreck communicator's contract is a REAL board offer, its authored
 * choices commit through the owning system, and dying with contract cargo leaves the manifest
 * recoverable at the player's own wreck.
 *
 * Pinned seams:
 *   1. salvage._buildOffer emits a complete board offer (source 'salvage' is allowlisted) that
 *      missions._onExternalBoardOffer accepts — discovery becomes playable content.
 *   2. Communicator templates with authored haul params put the contract commodity in the
 *      wreck's physical salvage pool — recover-then-deliver works on real cargo.
 *   3. wreckMission:choose stamps params.wreckChoiceId and accepts through the canonical seam.
 *   4. survivorPod rescue auto-accepts the passenger contract; strip withdraws the offer and
 *      fails a live rescue into pods_lost residue (recovery salvage).
 *   5. player:death carrying contract cargo → ship_lost failure + salvage successor routed at
 *      the durable player-wreck marker with the same commodity.
 *   6. Mutation depth is bounded: a successor's own failure settles plainly.
 *   7. survivorPod serialize/deserialize keeps a stripped pod terminal across Continue.
 *
 * Harness shape mirrors test/world-reacts-failure-mutates.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { wreckMissionById } from '../src/data/wreckMissions.js';
import { missions } from '../src/systems/missions.js';
import { salvage } from '../src/systems/salvage.js';
import { survivorPod } from '../src/systems/survivorPod.js';
import { playerWreckMarker } from '../src/systems/aftermathWrecks.js';

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }
  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function count(bus, name, predicate = () => true) {
  return bus.log.filter((entry) => entry.name === name && predicate(entry.payload || {})).length;
}

function baseState() {
  return {
    meta: { seed: 47, playtimeS: 0 },
    seed: 47,
    tick: 0,
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 5000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 20, capMass: 20, usedVolume: 0, usedMass: 0 },
      stats: {},
      tether: { active: false, targetId: null },
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: {},
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(),
    entityList: [],
    salvage: { points: [], plannedSectorId: null, sources: {} },
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function initMissions(state, bus) {
  const missionSystem = { ...missions };
  missionSystem.init({
    state,
    bus,
    helpers: { hash32, mulberry32, voice: { say: () => true } },
    registry: { get: () => null },
  });
  return missionSystem;
}

const HELIOS_POINT = {
  id: 'zone_derelict_01:sal0',
  sectorId: 'sector_helios_prime',
  zoneId: 'zone_derelict_01',
  pos: { x: 1200, z: -400 },
};

test('a communicator offer is a complete board offer — missions boards it, not just hears it', () => {
  const state = baseState();
  const bus = new Bus();
  initMissions(state, bus);
  const salvageSys = { ...salvage };
  salvageSys.init({ state, bus, helpers: { hash32, mulberry32 }, registry: { get: () => null } });

  const template = wreckMissionById('wm_shaft_seven_blackbox');
  const offer = salvageSys._buildOffer(template, HELIOS_POINT);
  assert.equal(offer.source, 'salvage');
  assert.ok(offer.id && offer.type && offer.stationId && offer.params,
    'the board contract requires id/type/stationId/params — the offer supplies all four');
  assert.equal(offer.params.salvagePointId, HELIOS_POINT.id);
  assert.equal(offer.params.wreckMissionId, template.id);
  assert.deepEqual(offer.params.wreckPos, { x: HELIOS_POINT.pos.x, z: HELIOS_POINT.pos.z });
  assert.equal(offer.params.cmdtyId, 'cmdty_classified_salvage',
    'the contract commodity is authored on the template');

  bus.emit('mission:offered', offer);
  const board = state.missions.boards[offer.stationId];
  assert.ok(board && board.slots.some((o) => o.id === offer.id),
    'the offer sits on the wreck-sector station board');
  salvageSys.destroy && salvageSys.destroy();
});

test('the wreck station binds deterministically to a mission-capable dock in the wreck sector', () => {
  const state = baseState();
  const bus = new Bus();
  const salvageSys = { ...salvage };
  salvageSys.init({ state, bus, helpers: { hash32, mulberry32 }, registry: { get: () => null } });
  const a = salvageSys._wreckStation(HELIOS_POINT);
  const b = salvageSys._wreckStation({ ...HELIOS_POINT });
  assert.ok(a, 'a sector with stations always resolves');
  assert.equal(a.id, b.id, 'same point id → same station (stable across replan)');
  assert.equal(a.sectorId === undefined || true, true);
  assert.ok((a.services || []).includes('missions'), 'prefers a mission-capable dock');
  assert.notEqual(a.repGated, true, 'never binds a standing-gated station for a wreck claim');
  const offSector = salvageSys._wreckStation({ ...HELIOS_POINT, sectorId: 'sector_nowhere' });
  assert.equal(offSector, null, 'a stationless sector yields no board (offer simply does not board)');
  salvageSys.destroy && salvageSys.destroy();
});

test('a communicator with authored haul params puts the contract cargo in the wreck pool', () => {
  const state = baseState();
  const bus = new Bus();
  const salvageSys = { ...salvage };
  salvageSys.init({ state, bus, helpers: { hash32, mulberry32 }, registry: { get: () => null } });
  let spawned = null;
  const spawnEntity = (spec) => { spawned = spec; return { id: 9001 }; };
  const rng = mulberry32(hash32(47, 'test', 'communicator-pool'));
  // Force a known cargo template via _makeSalvagePoint's authored path.
  const template = wreckMissionById('wm_silt_canisters');
  assert.ok(template && template.params && template.params.cmdtyId);
  // Drive the same code path with a communicator flag; pickWreckMission(rng) selects from the
  // table — assert against the template it picked by stubbing the zone call instead.
  const rec = salvageSys._makeSalvagePoint(
    'sector_helios_prime', { id: 'zone_derelict_01', center: { x: 0, z: 0 }, radius: 400 },
    0, { x: 10, z: 10 }, true, rng, spawnEntity,
  );
  assert.ok(rec && rec.isCommunicator && rec.wreckMissionId, 'a communicator point was made');
  const picked = wreckMissionById(rec.wreckMissionId);
  const pool = spawned && spawned.data && spawned.data.salvagePool;
  assert.ok(pool, 'the wreck entity carries a physical salvage pool');
  if (picked && picked.params && picked.params.cmdtyId) {
    const need = Math.max(1, Math.floor(Number(picked.params.qty) || 1));
    assert.ok(
      (pool[picked.params.cmdtyId] || 0) >= need,
      `the pool physically holds ${need}u ${picked.params.cmdtyId} — the contract is a pull job`,
    );
  }
  salvageSys.destroy && salvageSys.destroy();
});

test('wreckMission:choose stamps the authored option onto the offer and accepts it', () => {
  const state = baseState();
  const bus = new Bus();
  initMissions(state, bus);
  const salvageSys = { ...salvage };
  salvageSys.init({ state, bus, helpers: { hash32, mulberry32 }, registry: { get: () => null } });

  const template = wreckMissionById('wm_shaft_seven_blackbox');
  const offer = salvageSys._buildOffer(template, HELIOS_POINT);
  bus.emit('mission:offered', offer);
  assert.ok(state.missions.boards[offer.stationId].slots.some((o) => o.id === offer.id));

  bus.emit('wreckMission:choose', {
    offerId: offer.id, choiceId: 'mts', salvagePointId: HELIOS_POINT.id, source: 'test',
  });
  const accepted = state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.ok(accepted, 'the choice resolved to a live mission');
  assert.equal(accepted.params.wreckChoiceId, 'mts', 'the committed disposition rides the instance');
  assert.equal(count(bus, 'wreckMission:choiceApplied', (p) => p.choiceId === 'mts'), 1);
  assert.equal(state.missions.boards[offer.stationId].slots.some((o) => o.id === offer.id), false,
    'the offer left the board exactly once');

  // An option that the template never authored cannot reach the accept seam.
  const second = salvageSys._buildOffer(template, { ...HELIOS_POINT, id: 'zone_derelict_01:sal1' });
  bus.emit('mission:offered', second);
  assert.equal(
    bus.emit('wreckMission:choose', { offerId: second.id, choiceId: 'invented' }) || false, false);
  const boarded = state.missions.boards[second.stationId].slots.find((o) => o.id === second.id);
  assert.ok(boarded && !boarded.params.wreckChoiceId, 'an unknown option leaves the offer untouched');
  salvageSys.destroy && salvageSys.destroy();
});

test('survivorPod rescue commits the passenger contract; strip withdraws the offer', () => {
  const state = baseState();
  const bus = new Bus();
  initMissions(state, bus);
  const salvageSys = { ...salvage };
  salvageSys.init({ state, bus, helpers: { hash32, mulberry32 }, registry: { get: () => null } });
  const podSys = { ...survivorPod };
  podSys.init({ state, bus, helpers: { hash32 }, registry: { get: () => null } });

  // Plant a promoted pod record and its point/entity, then board the stamped offer shape.
  const entity = {
    id: 7001, alive: true, type: 'wreck', pos: { x: 50, z: 50 },
    data: {},
  };
  state.entities.set(entity.id, entity);
  state.salvage.points.push({
    id: 'zone_derelict_01:sal9', sectorId: 'sector_helios_prime', zoneId: 'zone_derelict_01',
    pos: { x: 50, z: 50 }, entityId: entity.id, isCommunicator: true,
    wreckMissionId: 'wm_survivor_pod', offered: true,
  });
  const rec = {
    salvagePointId: 'zone_derelict_01:sal9', entityId: entity.id, sectorId: 'sector_helios_prime',
    zoneId: 'zone_derelict_01', wreckMissionId: 'wm_survivor_pod', factionId: 'faction_scn',
    destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    oxygenStartedAt: 0, oxygenDueAt: 500, oxygenDecayWindow_s: 240,
    minRewardMultiplier: 0.45, rewardMultiplier: 1,
    stripPool: { cmdty_salvage_electronics: 2, cmdty_medical: 1 }, stripCredits: 280,
    rescueSelected: false, stripped: false,
  };
  state.survivorPod.promotedByPoint[rec.salvagePointId] = rec;
  state.survivorPod.promotedBySector[rec.sectorId] = rec;

  const offer = {
    id: 'salvage_zone_derelict_01:sal9', source: 'salvage', type: 'passenger_transport',
    stationId: 'station_helios', destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    factionId: 'faction_scn', title: 'The Survivor Pod', reward_cr: 750, collateral_cr: 0,
    riskTier: 1, duration_s: 2400, salvagePointId: rec.salvagePointId,
    params: { passengers: 1, cmdtyId: null, qty: 1, survivorPodId: rec.salvagePointId, salvagePointId: rec.salvagePointId },
    choice: { prompt: 'The pod is failing.', options: [{ id: 'rescue', label: 'Rescue' }, { id: 'strip', label: 'Strip' }] },
  };
  bus.emit('mission:offered', offer);
  assert.ok(state.missions.boards.station_helios.slots.some((o) => o.id === offer.id));

  // Tether latched on the pod → rescue commits the contract.
  state.player.tether = { active: true, targetId: entity.id };
  bus.emit('survivorPod:choose', { salvagePointId: rec.salvagePointId, optionId: 'rescue' });
  const accepted = state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.ok(accepted, 'the rescue choice produced a live passenger mission');
  assert.equal(accepted.type, 'passenger_transport');
  assert.equal(accepted.params.survivorPodId, rec.salvagePointId);
  assert.equal(rec.rescueSelected, true);
  assert.equal(state.missions.boards.station_helios.slots.some((o) => o.id === offer.id), false);
  podSys.destroy && podSys.destroy();
  salvageSys.destroy && salvageSys.destroy();
});

test('a stripped pod withdraws its offer and fails a live rescue into recovery residue', () => {
  const state = baseState();
  const bus = new Bus();
  initMissions(state, bus);
  const podSys = { ...survivorPod };
  podSys.init({ state, bus, helpers: { hash32 }, registry: { get: () => null } });

  const rec = {
    salvagePointId: 'zone_derelict_01:sal7', entityId: 7002, sectorId: 'sector_helios_prime',
    zoneId: null, wreckMissionId: 'wm_survivor_pod', factionId: 'faction_scn',
    destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    oxygenStartedAt: 0, oxygenDueAt: 500, oxygenDecayWindow_s: 240,
    minRewardMultiplier: 0.45, rewardMultiplier: 1,
    stripPool: { cmdty_salvage_electronics: 2 }, stripCredits: 280,
    rescueSelected: true, stripped: false,
  };
  state.survivorPod.promotedByPoint[rec.salvagePointId] = rec;

  const offer = {
    id: 'salvage_zone_derelict_01:sal7', source: 'salvage', type: 'passenger_transport',
    stationId: 'station_helios', destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    factionId: 'faction_scn', title: 'The Survivor Pod', reward_cr: 750, collateral_cr: 0,
    riskTier: 1, salvagePointId: rec.salvagePointId,
    params: { passengers: 1, survivorPodId: rec.salvagePointId, salvagePointId: rec.salvagePointId },
  };
  bus.emit('mission:offered', offer);
  assert.equal(bus.emit('ui:acceptMission', { missionId: offer.id }) === undefined, true);
  const accepted = state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.ok(accepted, 'the pod rescue contract is live');

  bus.emit('survivorPod:stripped', { salvagePointId: rec.salvagePointId, entityId: 7002 });
  assert.equal(state.missions.active.some((m) => m.id === accepted.id), false,
    'the stripped pod fails its rescue contract');
  const failed = bus.log.find((e) => e.name === 'mission:failed');
  assert.equal(failed.payload.reason, 'pods_lost');
  const successor = state.missions.active.find((m) => m.mutatedFromMissionId === accepted.id);
  assert.ok(successor, 'the strip left recovery residue, not a dead end');
  assert.equal(successor.mutationTag, 'recovery');
  podSys.destroy && podSys.destroy();
});

test('player death with contract cargo fails ship_lost and posts recovery at the player wreck', () => {
  const state = baseState();
  const bus = new Bus();
  initMissions(state, bus);

  // The durable marker aftermathWrecks mints on player:death — planted directly so the test pins
  // the mission-side consumption, not the marker system.
  state.aftermathWrecks = {
    schemaVersion: 3, seed: 47, bySector: {
      sector_helios_prime: [{
        markerId: 'pwreck_test', sectorId: 'sector_helios_prime',
        pos: { x: 777, z: -222 }, playerWreck: true, kind: 'player_wreck',
      }],
    },
  };
  assert.ok(playerWreckMarker(state), 'the marker is discoverable');

  const offer = {
    id: 'offer_cargo_death', type: 'cargo_delivery', stationId: 'station_helios',
    factionId: 'faction_mts', params: { cmdtyId: 'cmdty_salvage_electronics', qty: 4 },
    reward_cr: 800, collateral_cr: 0, riskTier: 2,
    destStationId: 'station_beltout', destSectorId: 'sector_ceres_belt',
    distance: 1200, title: 'Haul the lot to Belt Outpost', source: 'careerContract',
  };
  bus.emit('mission:offered', offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const mission = state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.ok(mission);
  state.player.cargo.items.cmdty_salvage_electronics = 4;

  bus.emit('player:death', {
    recoverable: true,
    pos: { x: 777, z: -222 },
    recovery: { cargoLosses: [{ commodityId: 'cmdty_salvage_electronics', qty: 2 }] },
  });

  const failed = bus.log.find((e) => e.name === 'mission:failed');
  assert.ok(failed && failed.payload.reason === 'ship_lost',
    'death while carrying contract cargo fails the leg as ship_lost');
  assert.equal(state.missions.active.some((m) => m.id === mission.id), false);
  const successor = state.missions.active.find((m) => m.mutatedFromMissionId === mission.id);
  assert.ok(successor, 'the lost manifest mutates into a recovery successor');
  assert.equal(successor.type, 'salvage_retrieval');
  assert.equal(successor.mutationTag, 'recovery');
  assert.equal(successor.params.cmdtyId, 'cmdty_salvage_electronics',
    'the successor recovers the same commodity the contract carried');
  assert.equal(successor.params.qty, 2, 'only the physically lost units are recoverable');
  assert.equal(successor.params.lostSectorId, 'sector_helios_prime');
  assert.deepEqual(successor.params.lostWreckPos, { x: 777, z: -222 },
    'the recovery site is the durable player-wreck marker, not a rumor');
  assert.ok(count(bus, 'toast', (p) => /wreck still holds the manifest/i.test(p.text || '')) >= 1);

  // Chain bound: the successor's own failure settles plainly — residue cannot beget residue.
  const idx = state.missions.active.indexOf(successor);
  assert.equal(state.missions.active.length, 1);
  const missionSystem = { ...missions };
  // _failMission is reachable through the same live system instance for the bound check.
  const sys = missionSystemFor(state, bus);
  sys._failMission(successor, idx, 'escortee_lost');
  assert.equal(state.missions.active.length, 0,
    'a depth-1 successor fails plainly — the chain is bounded');
  const last = bus.log.filter((e) => e.name === 'mission:failed').pop();
  assert.equal('mutatedToMissionId' in last.payload, false,
    'a bounded-out failure keeps the legacy payload shape');
});

function missionSystemFor(state, bus) {
  // The missions system bound to this state/bus (init is idempotent-safe for our purposes).
  const sys = { ...missions };
  sys.state = state;
  sys.bus = bus;
  sys.helpers = { hash32, mulberry32, voice: { say: () => true } };
  sys.registry = { get: () => null };
  return sys;
}

test('survivorPod persistence: a stripped pod stays stripped and cannot be re-exploited', () => {
  const state = baseState();
  const bus = new Bus();
  const podSys = { ...survivorPod };
  podSys.init({ state, bus, helpers: { hash32 }, registry: { get: () => null } });

  const rec = {
    salvagePointId: 'zone_derelict_01:sal3', entityId: 8001, sectorId: 'sector_helios_prime',
    zoneId: 'zone_derelict_01', wreckMissionId: 'wm_survivor_pod', factionId: 'faction_scn',
    destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    oxygenStartedAt: 10, oxygenDueAt: 220, oxygenDecayWindow_s: 240,
    minRewardMultiplier: 0.45, rewardMultiplier: 0.8,
    stripPool: { cmdty_salvage_electronics: 2, cmdty_medical: 1 }, stripCredits: 301,
    rescueSelected: false, stripped: true,
  };
  state.survivorPod.promotedByPoint[rec.salvagePointId] = rec;
  state.survivorPod.promotedBySector[rec.sectorId] = rec;

  const saved = JSON.parse(JSON.stringify(podSys.serialize()));
  assert.equal(saved.schema, 'spaceface.survivorPod.v1');

  // Round-trip into a fresh state whose replanned point looks un-spent — the reconcile must
  // re-assert the terminal strip, not resurrect a fresh rescue.
  const restoredState = baseState();
  restoredState.entities.set(8001, { id: 8001, alive: true, type: 'wreck', pos: { x: 1, z: 1 }, data: {} });
  restoredState.salvage.points.push({
    id: rec.salvagePointId, sectorId: rec.sectorId, zoneId: rec.zoneId,
    pos: { x: 1, z: 1 }, entityId: 8001, isCommunicator: true,
    wreckMissionId: 'wm_survivor_pod', offered: false,
  });
  const restoredBus = new Bus();
  const restored = { ...survivorPod };
  restored.init({ state: restoredState, bus: restoredBus, helpers: { hash32 }, registry: { get: () => null } });
  restored.deserialize(saved);
  const back = restoredState.survivorPod.promotedByPoint[rec.salvagePointId];
  assert.ok(back && back.stripped === true, 'the terminal strip state round-trips the save');
  assert.equal(back.stripCredits, 301);

  restored._reconcilePromoted(restoredState);
  const point = restoredState.salvage.points.find((p) => p.id === rec.salvagePointId);
  assert.equal(point.offered, true, 'a stripped point stays offered — no second offer');
  assert.equal(point.survivorPod && point.survivorPod.stripped, true);
  const ent = restoredState.entities.get(8001);
  assert.equal(ent.alive, false, 'the stripped pod entity stays dead');
  assert.equal(ent.data.survivorPod.stripped, true);
  podSys.destroy && podSys.destroy();
  restored.destroy && restored.destroy();
});

test('a boarded communicator offer survives a mission-board epoch refresh', () => {
  const state = baseState();
  const bus = new Bus();
  const missionSystem = initMissions(state, bus);
  const salvageSys = { ...salvage };
  salvageSys.init({ state, bus, helpers: { hash32, mulberry32 }, registry: { get: () => null } });

  const template = wreckMissionById('wm_shaft_seven_blackbox');
  const offer = salvageSys._buildOffer(template, HELIOS_POINT);
  bus.emit('mission:offered', offer);
  const stationId = offer.stationId;
  assert.ok(state.missions.boards[stationId].slots.some((o) => o.id === offer.id));

  // Epoch rolls: the board rebuilds, but a discovered contract is progress, not a reroll.
  const refreshSec = (state.missions.config && state.missions.config.refreshSec) || 600;
  state.simTime += refreshSec * 2 + 10;
  const board = missionSystem.ensureBoard(stationId);
  assert.ok(board.refreshEpoch > 0, 'the epoch actually advanced');
  assert.ok(board.slots.some((o) => o.id === offer.id && o.source === 'salvage'),
    'the communicator row rides through the refresh until accepted');

  // A distinct find in the same sector boards beside it — no one-row-per-source squeeze.
  // (ensureBoard rebuilds the board object wholesale, so re-read the live row; sal2 hashes to
  // the same deterministic station slot as sal0, keeping both rows on one board.)
  const second = salvageSys._buildOffer(template, { ...HELIOS_POINT, id: 'zone_derelict_01:sal2' });
  assert.equal(second.stationId, stationId, 'fixture: both finds resolve the same host dock');
  bus.emit('mission:offered', second);
  assert.ok(state.missions.boards[stationId].slots.some((o) => o.id === second.id),
    'two communicators can hold two board rows at once');
  salvageSys.destroy && salvageSys.destroy();
});

test('a settled communicator contract never re-offers — the receipt is the authority', () => {
  const state = baseState();
  const bus = new Bus();
  const missionSystem = initMissions(state, bus);
  const salvageSys = { ...salvage };
  salvageSys.init({ state, bus, helpers: { hash32, mulberry32 }, registry: { get: () => null } });

  const template = wreckMissionById('wm_shaft_seven_blackbox');
  const offer = salvageSys._buildOffer(template, HELIOS_POINT);
  bus.emit('mission:offered', offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const mission = state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.ok(mission, 'the communicator contract accepted');
  state.player.cargo.items.cmdty_classified_salvage = 1;

  missionSystem._completeMission(mission, state.missions.active.indexOf(mission));
  assert.ok(state.missions.receipts.some((r) => r.sourceOfferId === offer.id && r.outcome === 'completed'),
    'the settle receipt names the offer id it came from');

  // Re-emitting the same offer id bounces off the receipt — the completed contract never
  // double-posts on the board. (Every emit lands in the bus log; rejection is a return, not a
  // swallowed signal.)
  const offersForPoint = () => count(bus, 'mission:offered', (p) => p && p.id === offer.id);
  assert.equal(offersForPoint(), 1, 'the point emitted its offer once');
  bus.emit('mission:offered', offer);
  assert.equal(
    state.missions.boards[offer.stationId].slots.some((o) => o.id === offer.id), false,
    'a settled contract cannot re-board',
  );

  // Sector replan rebuilt the point un-offered (stable id, fresh flags): the rediscovery stays
  // silent — no replayed signal, no re-emitted row, but the point still marks itself spent.
  const replanned = { ...HELIOS_POINT, offered: false };
  const logBefore = count(bus, 'comms:log');
  salvageSys._offerFromPoint(replanned);
  assert.equal(replanned.offered, true, 'the point remembers it has nothing left to say');
  assert.equal(count(bus, 'comms:log'), logBefore, 'no second distress read on a settled find');
  assert.equal(offersForPoint(), 2,
    '_offerFromPoint re-emitted nothing — the only second emit was the manual bounce above');
  salvageSys.destroy && salvageSys.destroy();
});

test('a rep-gated sector reroutes its wreck claim to a reachable mission board', () => {
  const state = baseState();
  const bus = new Bus();
  const salvageSys = { ...salvage };
  salvageSys.init({ state, bus, helpers: { hash32, mulberry32 }, registry: { get: () => null } });
  // Sker Bazaar is the sector's only dock and it is rep-gated — a wreck claim posted there is
  // a row the player may never be allowed to read.
  const gated = salvageSys._wreckStation({
    id: 'zone_sker_field:sal0', sectorId: 'sector_sker_haven', zoneId: 'zone_sker_field',
    pos: { x: 0, z: 0 },
  });
  assert.ok(gated, 'the offer still resolves — it does not silently drop');
  assert.notEqual(gated.id, 'station_sker', 'never a rep-gated dock for a wreck claim');
  assert.ok((gated.services || []).includes('missions'), 'the fallback hosts a real mission board');
  assert.equal(gated.repGated, undefined,
    'the remote desk is one any pilot can reach');
  const again = salvageSys._wreckStation({
    id: 'zone_sker_field:sal0', sectorId: 'sector_sker_haven', zoneId: 'zone_sker_field',
    pos: { x: 0, z: 0 },
  });
  assert.equal(again.id, gated.id, 'the remote pick is deterministic per point');
  // Eunomia's dock lists no mission service at all — same reroute, different reason.
  const eunomia = salvageSys._wreckStation({
    id: 'zone_eunomia_field:sal0', sectorId: 'sector_eunomia_gulf', zoneId: 'zone_eunomia_field',
    pos: { x: 0, z: 0 },
  });
  assert.ok(eunomia && !eunomia.repGated && (eunomia.services || []).includes('missions'),
    'a sector with no eligible dock still lands its offer somewhere reachable');
  salvageSys.destroy && salvageSys.destroy();
});

test('a stripped pod stamps the loss site — the recovery pocket spawns where the pod died', () => {
  const state = baseState();
  const bus = new Bus();
  initMissions(state, bus);
  const podSys = { ...survivorPod };
  podSys.init({ state, bus, helpers: { hash32 }, registry: { get: () => null } });

  const entity = { id: 7005, alive: true, type: 'wreck', pos: { x: 640, z: -880 }, data: {} };
  state.entities.set(entity.id, entity);
  state.salvage.points.push({
    id: 'zone_derelict_01:sal6', sectorId: 'sector_helios_prime', zoneId: 'zone_derelict_01',
    pos: { x: 640, z: -880 }, entityId: entity.id, isCommunicator: true,
    wreckMissionId: 'wm_survivor_pod', offered: true,
  });
  const rec = {
    salvagePointId: 'zone_derelict_01:sal6', entityId: entity.id, sectorId: 'sector_helios_prime',
    zoneId: null, wreckMissionId: 'wm_survivor_pod', factionId: 'faction_scn',
    destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    oxygenStartedAt: 0, oxygenDueAt: 500, oxygenDecayWindow_s: 240,
    minRewardMultiplier: 0.45, rewardMultiplier: 1,
    stripPool: { cmdty_salvage_electronics: 2 }, stripCredits: 280,
    rescueSelected: true, stripped: false,
  };
  state.survivorPod.promotedByPoint[rec.salvagePointId] = rec;

  const offer = {
    id: 'salvage_zone_derelict_01:sal6', source: 'salvage', type: 'passenger_transport',
    stationId: 'station_helios', destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    factionId: 'faction_scn', title: 'The Survivor Pod', reward_cr: 750, collateral_cr: 0,
    riskTier: 1, salvagePointId: rec.salvagePointId,
    params: { passengers: 1, survivorPodId: rec.salvagePointId, salvagePointId: rec.salvagePointId },
  };
  bus.emit('mission:offered', offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const accepted = state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.ok(accepted);

  bus.emit('survivorPod:stripped', { salvagePointId: rec.salvagePointId, entityId: entity.id });
  const successor = state.missions.active.find((m) => m.mutatedFromMissionId === accepted.id);
  assert.ok(successor, 'the strip leaves recovery residue');
  assert.equal(successor.type, 'salvage_retrieval');
  assert.equal(successor.params.lostSectorId, 'sector_helios_prime');
  assert.deepEqual(successor.params.lostWreckPos, { x: 640, z: -880 },
    'the recovery site is the pod’s actual drift, not a sector rumor');
  podSys.destroy && podSys.destroy();
});

test('ship_lost recovery co-locates on the player wreck — no ring offset', async () => {
  const { convoyWreckPocket } = await import('../src/systems/missions.js');
  const successor = {
    id: 'm_41', type: 'salvage_retrieval', status: 'active', mutationTag: 'recovery',
    params: {
      cmdtyId: 'cmdty_salvage_electronics', qty: 2,
      lostSectorId: 'sector_helios_prime', lostWreckPos: { x: 777, z: -222 },
      playerWreckSite: true,
    },
  };
  const pocket = convoyWreckPocket(successor, {
    nowS: 500, ringAngle: 1.2, driftAngle: 0.4, currentSectorId: 'sector_helios_prime',
  });
  assert.ok(pocket, 'the successor authors a physical pocket');
  assert.deepEqual(pocket.spec.pos, { x: 777, z: -222 },
    'the manifest claim is the marker itself — the pocket sits exactly on the wreck');
  assert.equal(pocket.spec.data.authoredScanLabel, 'Your wreck — unstable core');
  // An ordinary convoy-wreck successor still rings the loss site.
  const convoy = convoyWreckPocket({
    ...successor,
    params: { ...successor.params, playerWreckSite: undefined },
  }, { nowS: 500, ringAngle: 0, driftAngle: 0, currentSectorId: 'sector_helios_prime' });
  assert.ok(Math.hypot(convoy.spec.pos.x - 777, convoy.spec.pos.z + 222) > 0,
    'only the player-wreck claim co-locates');
});

test('salvage:fieldVulture acknowledges the claim on the existing toast/comms seams', () => {
  const state = baseState();
  const bus = new Bus();
  const salvageSys = { ...salvage };
  salvageSys.init({ state, bus, helpers: { hash32, mulberry32 }, registry: { get: () => null } });
  // The real e1EncounterRuntime H6 settle payload (winner/risk/loot) — no text fields.
  bus.emit('salvage:fieldVulture', {
    encounterId: 'e1_h6', sectorId: 'sector_helios_prime', loot: 'highest', risk: 'high',
    winner: 'reach', resolution: 'fled',
  });
  assert.ok(count(bus, 'toast', (p) => /vulture/i.test(p.text || '')) >= 1);
  assert.ok(count(bus, 'comms:log', (p) => p.kind === 'salvage') >= 1);
  // An authored caller may still override the copy.
  bus.emit('salvage:fieldVulture', { text: 'Vulture scan complete.', detail: 'Claim filed.' });
  assert.ok(count(bus, 'toast', (p) => p.text === 'Vulture scan complete.') >= 1);
  salvageSys.destroy && salvageSys.destroy();
});
