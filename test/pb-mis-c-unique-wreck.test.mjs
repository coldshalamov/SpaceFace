// PB-MIS-C (SF-141 + SF-149 + SF-150): the unique-wreck trio as real gameplay.
//   SF-141 — the Choir-Tender site is WARM: two living crew, loose attended freight, and a
//     reactor clock; rescue-first (tow), cargo-first (pods), or the knitbot handover all read
//     the same durable outcomes.
//   SF-149 — the `choir_vigil` SP1 chain is three physically different visits to that same
//     place: survey ring, the warm disruption, and a return to the outcome the site carries.
//   SF-150 — encounter closure releases temporary ownership only: durable actors, custody
//     pods, and world-owned traffic leave the roster alive instead of taking a kill order.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import {
  placementForUniqueWreck,
  programSeedFor,
  uniqueWreckById,
} from '../src/data/uniqueWrecks.js';
import { normalizeUniqueWreckState } from '../src/systems/uniqueWrecks.js';
import { SET_PIECE_MISSIONS, validateSetPieceMissionCatalog } from '../src/data/missions.js';
import { buildSetPieceMissionOffers } from '../src/systems/setPieceMissionOffers.js';
import { missions } from '../src/systems/missions.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

const META_SEED = 4242;
const PROGRAM_SEED = programSeedFor(META_SEED);
const WRECK_ID = 'wreck_choir_tender';
const SECTOR = 'sector_helios_prime';
const WRECK = uniqueWreckById(WRECK_ID);
const PLACEMENT = placementForUniqueWreck(PROGRAM_SEED, WRECK_ID, SECTOR);

function flightSim({ systems = [uniqueWrecks, missions], helpers = {} } = {}) {
  const sim = createSimulation({ seed: META_SEED, systems, helpers });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  state.player.credits = 50000;
  return { sim, state, bus, player };
}

function own(state) { return state.player.uniqueWrecks; }
function bearing(state) { return own(state).bearings[WRECK_ID]; }
function warmPods(state) {
  return state.entityList.filter((entity) => entity.alive !== false
    && entity.data && entity.data.warmPodId && entity.data.warmWreckId === WRECK_ID);
}
function liveWreckEntity(state) {
  return state.entityList.find((entity) => entity.alive !== false
    && entity.type === 'wreck' && entity.data && entity.data.uniqueWreckId === WRECK_ID) || null;
}
function mintBearing(state, bus) {
  bus.emit('news:headline', {
    sourceRef: 'news.tragedy_at_helios', wreckId: WRECK_ID,
    text: 'Relief freighter lost at the Helios yard.', channelId: 'news',
  });
  return bearing(state);
}
function fixBearing(state, bus) {
  bus.emit('scan:pulse', { pos: { ...PLACEMENT.exactGlobal } });
  return bearing(state);
}
function openingOffer(state, archetypeId) {
  return buildSetPieceMissionOffers(state, {
    archetypeId, startEpoch: 3, stageIndex: 0, branchId: null, attempt: 0,
  })[0];
}
function activeSetPieceMission(state, archetypeId) {
  return (state.missions.active || []).find((mission) => (
    mission && mission.cause && mission.cause.archetypeId === archetypeId
  )) || null;
}
function boardOffersFor(state, chainId, stageIndex) {
  return Object.values(state.missions.boards || {}).flatMap((board) => board.slots || [])
    .filter((row) => row && row.cause && row.cause.chainId === chainId
      && row.cause.stageIndex === stageIndex);
}

// ─── SF-141: warm wreck ────────────────────────────────────────────────────────

test(`seed ${META_SEED}: the Choir-Tender spill is physical, attended, and one-shot`, () => {
  const { sim, state, bus } = flightSim();
  try {
    mintBearing(state, bus);
    fixBearing(state, bus);
    assert.equal(bearing(state).phase, 'fixed');

    const pods = warmPods(state);
    assert.equal(pods.length, 3, 'the three authored relief pods are on the field');
    const byId = new Map(pods.map((pod) => [pod.data.warmPodId, pod]));
    for (const spec of WRECK.warm.cargoPods) {
      const pod = byId.get(spec.id);
      assert.ok(pod, `${spec.id} materialized`);
      assert.equal(pod.data.commodityId, spec.commodityId);
      assert.equal(pod.data.amount, spec.amount);
      assert.equal(pod.flags.persistent, true, 'warm freight survives sector transitions');
      // Ownership rides the durable record id — a recycable entity id could not carry the
      // theft claim past the owner's death mid-transfer.
      assert.equal(pod.data.ownerId, `choir-relief:${PROGRAM_SEED}:attendant`);
      assert.equal(pod.data.ownerName, 'CHOIR RELIEF — LAST LIGHT');
      assert.equal(pod.data.factionId, 'faction_choir');
      assert.equal(pod.data.ownership && pod.data.ownership.factionId, 'faction_choir');
      assert.equal(pod.data.cargoIdentity.destinationId, 'station_helios');
      assert.equal(pod.data.jettisonedCargo, true, 'the ordinary pod contract applies');
    }
    // One spill per site, ever: rematerialization does not restock what the world took.
    pods[0].alive = false;
    const system = sim.registry.get('uniqueWrecks');
    system._materialize(WRECK_ID);
    assert.equal(warmPods(state).length, 2, 'no respawn — the spill is a durable site fact');
    assert.equal(own(state).warm[WRECK_ID].podsSpawnedAtS != null, true);
  } finally {
    sim.dispose();
  }
});

test(`seed ${META_SEED}: normalize keeps the warm ledger and drops malformed rows`, () => {
  const { sim, state, bus } = flightSim();
  try {
    mintBearing(state, bus);
    fixBearing(state, bus);
    assert.equal(warmPods(state).length, 3);
    const saved = JSON.parse(JSON.stringify(own(state)));
    saved.warm = { [WRECK_ID]: { podsSpawnedAtS: 640 }, ghost_wreck: { podsSpawnedAtS: 1 } };
    const restored = normalizeUniqueWreckState(saved, META_SEED);
    assert.equal(restored.warm[WRECK_ID].podsSpawnedAtS, 640, 'spawn stamp survives saves');
    assert.equal(restored.warm.ghost_wreck, undefined, 'unknown wrecks never spawn');
    state.player.uniqueWrecks = restored;
    const system = sim.registry.get('uniqueWrecks');
    system._materialize(WRECK_ID);
    assert.equal(warmPods(state).length, 3, 'restored stamp still blocks re-spill');
  } finally {
    sim.dispose();
  }
});

test(`seed ${META_SEED}: towing Mercy home is a real evacuation — wounded drive intact`, () => {
  const helpers = {
    npcJobs: {
      assign: (entity, spec) => {
        entity.data = entity.data || {};
        entity.data.jobId = `job:${entity.id}`;
        entity.data._jobSpec = spec;
        return entity.data.jobId;
      },
      release: () => {},
      get: () => null,
    },
  };
  const fakeCombat = {
    name: 'combat',
    init() {},
    update() {},
    kernel: {
      inspect: () => ({
        entity: { combat: { subsystems: { subsystem_drive: { health: 0, destroyed: true } } } },
      }),
      routeDamage: () => ({ ok: true }),
      repair: () => ({ ok: true }),
    },
  };
  const { sim, state, bus } = flightSim({ systems: [uniqueWrecks, fakeCombat], helpers });
  try {
    sim.spawn({
      type: 'station', team: 0, pos: { x: 5000, z: 5000 }, vel: { x: 0, z: 0 },
      radius: 120, hull: 1, hullMax: 1, data: { stationId: 'station_helios' },
    });
    mintBearing(state, bus);
    fixBearing(state, bus);
    const system = sim.registry.get('uniqueWrecks');
    system._choirRelief.sync();
    const relief = own(state).choirRelief;
    const patient = state.entityList.find((e) => e.data && e.data.choirReliefRole === 'patient');
    const attendant = state.entityList.find((e) => e.data && e.data.choirReliefRole === 'attendant');
    assert.ok(patient && attendant, 'the two living crew are on the site');
    assert.equal(relief.driveRestored, false);

    // The player physically tows her inside the berth — the berth takes the survivor without
    // inventing a drive repair. Speed and position, not a flag, are the delivery.
    patient.pos.x = 5000 + 100; patient.pos.z = 5000;
    patient.vel = { x: 0, z: 0 };
    system._choirRelief.sync();

    assert.equal(relief.evacuated, true, 'the tow is a real evacuation');
    assert.equal(relief.driveRestored, false, 'no drive repair is invented');
    assert.equal(relief.patientLost, false);
    assert.equal(patient.data.scanLabel.includes('TOWED HOME'), true);
    assert.ok(attendant.data.jobId || attendant.data.choirReliefReturning,
      'the attendant stands down and heads home');
  } finally {
    sim.dispose();
  }
});

// ─── SF-149: three-visit vigil chain ───────────────────────────────────────────

test('the choir_vigil chain validates and binds its dedicated hull', () => {
  const catalog = validateSetPieceMissionCatalog();
  assert.equal(catalog.ok, true);
  assert.deepEqual(catalog.errors, []);
  const def = uniqueWreckById(WRECK_ID);
  assert.equal(def.wreckChainId, 'choir_vigil');
  const definition = SET_PIECE_MISSIONS.find((entry) => entry.id === 'choir_vigil');
  assert.equal(definition.wreckId, WRECK_ID);
  assert.equal(definition.commonStages[0].params.setPieceObjective, 'choir_first_light');
  assert.equal(definition.commonStages[0].destSectorId, SECTOR);
});

test(`seed ${META_SEED}: the vigil is three visits — ring, warm watch, return to the placard`, () => {
  const { sim, state, bus, player } = flightSim();
  try {
    const missionsSys = sim.registry.get('missions');

    // Visit 1 — the survey: the chain's accept is the native bearing carrier.
    const offer1 = openingOffer(state, 'choir_vigil');
    assert.ok(offer1);
    assert.equal(offer1.wreckId, WRECK_ID);
    assert.equal(offer1.destSectorId, SECTOR);
    state.missions.boards[offer1.stationId] = { slots: [offer1] };
    assert.equal(missionsSys.acceptMission(offer1.id), true);
    const stage1 = activeSetPieceMission(state, 'choir_vigil');
    assert.ok(stage1);
    assert.equal(stage1.params.setPieceObjective, 'choir_first_light');
    assert.equal(bearing(state).phase, 'rumored', 'the accept minted the bearing');
    assert.equal(bearing(state).channelId, 'mission');

    bus.emit('sector:enter', { sectorId: SECTOR });
    fixBearing(state, bus);
    assert.equal(bearing(state).phase, 'fixed');
    assert.notEqual(stage1.status, 'active', 'the fixed bearing completes the survey visit');

    // Visit 2 — the disruption: the warm wreck's own verdict.
    const [stage2Offer] = boardOffersFor(state, offer1.cause.chainId, 1);
    assert.ok(stage2Offer, 'the watch posts on the board');
    assert.equal(missionsSys.acceptMission(stage2Offer.id), true);
    const stage2 = activeSetPieceMission(state, 'choir_vigil');
    assert.equal(stage2.params.setPieceObjective, 'choir_long_night');
    assert.equal(stage2.status, 'active');
    assert.equal(stage2.params.complicationObserved, true,
      'the armed reactor clock is the observed complication');

    const hull = liveWreckEntity(state);
    assert.ok(hull, 'the warm site is physically placed');
    bus.emit('salvage:completed', { wreckId: hull.id, loot: { cmdty_scrap_metal: 1 } });
    assert.equal(bearing(state).phase, 'decision');
    assert.notEqual(stage2.status, 'active', 'reaching the verdict completes the long night');

    // Visit 3 — the return: both disposition branches post; taking the handover files it.
    const branches = boardOffersFor(state, offer1.cause.chainId, 2);
    assert.equal(branches.length, 2, 'both dispositions post at the choice point');
    const handover = branches.find((row) => row.params.wreckChoiceId === 'authority_handover');
    const claim = branches.find((row) => row.params.wreckChoiceId === 'claim_hardware');
    assert.ok(handover && claim);
    assert.equal(missionsSys.acceptMission(handover.id), true);
    const stage3 = activeSetPieceMission(state, 'choir_vigil');
    assert.equal(stage3.params.setPieceObjective, 'choir_what_remains');
    assert.equal(bearing(state).phase, 'salvaged', 'the accept files the named outcome');
    assert.equal(bearing(state).choiceId, 'authority_handover');
    assert.equal(stage3.params.outcomeFiled, true);
    assert.equal(stage3.status, 'active', 'the filing is not the visit — the return is');

    // The third visit is physical: standing inside the changed site, in-sector.
    player.pos.x = PLACEMENT.exactGlobal.x + 120;
    player.pos.z = PLACEMENT.exactGlobal.z;
    missionsSys.update(1 / 60, state);
    assert.notEqual(stage3.status, 'active',
      'standing inside the recovered site completes the vigil');

    // The site reads the outcome: the salvaged husk carries the filed stamp.
    const husk = liveWreckEntity(state);
    assert.ok(husk, 'the stamped husk is the place the vigil ends at');
    assert.equal(husk.data._salvaged, true);
  } finally {
    sim.dispose();
  }
});

test(`seed ${META_SEED}: late arrivals reconcile — a salvaged site still tells its story`, () => {
  const { sim, state, bus, player } = flightSim();
  try {
    const missionsSys = sim.registry.get('missions');
    mintBearing(state, bus);
    fixBearing(state, bus);
    // The world reached its outcome without the chain: salvage, then the handover pick.
    const hull = liveWreckEntity(state);
    bus.emit('salvage:completed', { wreckId: hull.id, loot: {} });
    bus.emit('uniqueWreck:choose', { wreckId: WRECK_ID, choiceId: 'authority_handover' });
    assert.equal(bearing(state).phase, 'salvaged');
    assert.equal(bearing(state).choiceId, 'authority_handover');
    const completedStageIndexes = () => (state.missions.receipts || [])
      .filter((row) => row && row.archetypeId === 'choir_vigil' && row.outcome === 'completed')
      .map((row) => row.stageIndex).sort((a, b) => a - b);

    // Stage 1 reconciles AT accept against the durable bearing — no resurrected survey, and
    // the chain advances instead of stranding an un-completable scan stage.
    const offer1 = openingOffer(state, 'choir_vigil');
    state.missions.boards[offer1.stationId] = { slots: [offer1] };
    assert.equal(missionsSys.acceptMission(offer1.id), true);
    assert.equal(activeSetPieceMission(state, 'choir_vigil'), null,
      'the survey visit settled against the known bearing, not a new scan');
    assert.deepEqual(completedStageIndexes(), [0]);

    // Stage 2 reconciles the same way: the filed outcome already proves the complication.
    const [stage2Offer] = boardOffersFor(state, offer1.cause.chainId, 1);
    assert.ok(stage2Offer, 'the watch still posts for the reconciled chain');
    assert.equal(missionsSys.acceptMission(stage2Offer.id), true);
    assert.deepEqual(completedStageIndexes(), [0, 1]);

    // Only the disposition the site actually carries posts — the contradicting claim is gone.
    const branches = boardOffersFor(state, offer1.cause.chainId, 2);
    assert.ok(branches.length > 0, 'the closing stage still posts');
    for (const row of branches) {
      assert.equal(row.params.wreckChoiceId, 'authority_handover',
        'a filed outcome prunes the contradicting branch offer');
    }
    assert.equal(missionsSys.acceptMission(branches[0].id), true);
    const stage3 = activeSetPieceMission(state, 'choir_vigil');
    assert.ok(stage3, 'the matching branch reconciles to the return visit');
    assert.equal(stage3.params.outcomeFiled, true);
    player.pos.x = PLACEMENT.exactGlobal.x + 100;
    player.pos.z = PLACEMENT.exactGlobal.z;
    missionsSys.update(1 / 60, state);
    assert.notEqual(stage3.status, 'active',
      'the reconciled vigil still ends by standing inside the changed site');
  } finally {
    sim.dispose();
  }
});

// ─── SF-150: cleanup ownership ─────────────────────────────────────────────────

function directorHarness() {
  const sim = createSimulation({ seed: 99, systems: [encounterDirector] });
  const director = sim.registry.get('encounterDirector');
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 100;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const ship = (data = {}, flags = undefined) => sim.spawn({
    type: 'ship', team: 2, pos: { x: 10, z: 10 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 100, hullMax: 100, flags, data,
  });
  const live = {
    id: 'sf150-test', ids: [], roles: {}, phase: 'active',
    shapeId: 'test_shape', script: null, shape: { cooldownS: 0, receipts: {} },
    deck: 'civil', sectorId: SECTOR, zoneId: null, tier: 1, vars: {}, causality: {}, data: {},
  };
  state.encounterDirector.live[live.id] = live;
  const roster = (entity, role = 'squad') => {
    live.ids.push(entity.id);
    live.roles[entity.id] = role;
    return entity;
  };
  return { sim, state, bus, director, live, ship, roster };
}

test('SF-150: resolve releases durable roster members instead of stamping kill orders', () => {
  const { sim, director, live, ship, roster } = directorHarness();
  try {
    const transient = roster(ship({ ai: {} }));
    const durable = roster(ship(
      { worldRecordId: 'wr_survivor', persistenceOwner: 'uniqueWrecks:choirRelief' },
      { persistent: true },
    ), 'passenger');
    const borrowed = roster(ship({ trafficRole: 'hauler', convoyId: 'convoy_7' }), 'escortee');
    director.resolve(live, 'objective_done');
    assert.equal(transient.data.despawnAt, 100 + 45,
      'the encounter-owned straggler gets the ordinary retreat stamp');
    assert.equal(durable.data.despawnAt, undefined,
      'the durable survivor is released, not despawned');
    assert.equal(borrowed.data.despawnAt, undefined,
      'borrowed world traffic returns to the world');
    assert.equal(live.phase, 'done');
  } finally {
    sim.dispose();
  }
});

test('SF-150: despawnAll keeps custody-pod TTLs and skips durable actors', () => {
  const { sim, director, live, ship, roster, state } = directorHarness();
  try {
    const transient = roster(ship({ ai: {} }));
    const pod = director.spawnFreightPickup(live, {
      pos: { x: 0, z: 0 }, commodityId: 'cmdty_food', qty: 3, ttlS: 340,
    });
    assert.ok(pod);
    const authoredTtl = pod.data.despawnAt;
    assert.equal(authoredTtl, 100 + 340);
    const durable = roster(ship({ worldRecordId: 'wr_worker' }, { persistent: true }), 'crew');
    director.despawnAll(live, 8);
    assert.equal(Math.round(transient.data.despawnAt - 100), 8,
      'the transient still dissolves on the encounter clock');
    assert.equal(pod.data.despawnAt, authoredTtl,
      'the legitimate pod keeps its authored TTL — closure does not erase cargo');
    assert.equal(durable.data.despawnAt, undefined);
    // Repeated cleanup is idempotent for released members: still no stamp.
    state.simTime = 140;
    director.despawnAll(live, 8);
    assert.equal(durable.data.despawnAt, undefined);
    assert.equal(pod.data.despawnAt, authoredTtl);
  } finally {
    sim.dispose();
  }
});

test('SF-150: abort (sector exit / fizzle) releases durable members the same way', () => {
  const { sim, director, live, ship, roster } = directorHarness();
  try {
    const transient = roster(ship({ ai: {} }));
    const durable = roster(ship(
      { worldRecordId: 'wr_rescued', missionId: 'm_77' }, { persistent: true },
    ), 'survivor');
    director.abort(live, 'sector_exit');
    assert.equal(Math.round(transient.data.despawnAt - 100), 4,
      'the encounter-owned escort still fizzles');
    assert.equal(durable.data.despawnAt, undefined,
      'the mission-pinned survivor was never the encounter\'s to erase');
    assert.equal(live.outcome, 'aborted:sector_exit');
  } finally {
    sim.dispose();
  }
});
