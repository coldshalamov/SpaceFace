import test from 'node:test';
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING, SET_PIECE_MISSIONS, validateSetPieceMissionCatalog }
  from '../src/data/missions.js';
import { buildSetPieceMissionOffers, SET_PIECE_MISSION_SOURCE }
  from '../src/systems/setPieceMissionOffers.js';
import { missions } from '../src/systems/missions.js';

// The Lung Run (SP1 `lung_run`) — the chain family's first emergency/response kind and the
// first authored work hosted by Charon Expanse. This file is the unit's focused proof:
// on seed 4242 the chain exists, is offered at the Expanse writ wall, plays its real beats
// (assess scan → rescue under fire with live density → two authored approaches), and settles
// through the native mission owners — rescue by escort kills plus a tether reel, never a
// stand-in dock, with canonical receipts and a clean branch advance.

const SEED = 4242;

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

  count(name, predicate = () => true) {
    return this.log.filter((entry) => entry.name === name && predicate(entry.payload || {})).length;
  }
}

function baseState() {
  const player = {
    id: 1,
    type: 'ship',
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: {},
  };
  return {
    meta: { seed: SEED, playtimeS: 0 },
    seed: SEED,
    tick: 0,
    simTime: 0,
    mode: 'flight',
    playerId: player.id,
    player: {
      credits: 500000,
      researchPoints: 0,
      flags: {},
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 },
      stats: {},
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
    factions: Object.fromEntries([
      'faction_scn', 'faction_mts', 'faction_dmc', 'faction_free',
      'faction_reach', 'faction_quiet', 'faction_choir',
    ].map((id) => [id, { rep: 500 }])),
    world: { currentSectorId: 'sector_charon_expanse', activeSector: { stations: [] } },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    entityIndex: { byStationId: new Map(), stations: [] },
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function missionHelpers(state) {
  let nextEntityId = 1000;
  return {
    hash32,
    mulberry32,
    player: () => state.entities.get(state.playerId),
    voice: { say: () => true },
    spawnEntity(spec) {
      const entity = {
        id: nextEntityId++,
        alive: true,
        pos: { x: Number(spec.pos && spec.pos.x) || 0, z: Number(spec.pos && spec.pos.z) || 0 },
        vel: { x: Number(spec.vel && spec.vel.x) || 0, z: Number(spec.vel && spec.vel.z) || 0 },
        rot: Number(spec.rot) || 0,
        ...spec,
        data: { ...(spec.data || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
}

function initSystem(state, bus) {
  const system = { ...missions };
  system.init({ state, bus, helpers: missionHelpers(state), registry: { get: () => null } });
  return system;
}

function ensureStation(state, stationId, distance = 600) {
  if (!stationId) return null;
  const existing = state.entityIndex.byStationId.get(stationId);
  if (existing) return existing;
  const station = {
    id: `station_entity_${stationId}`,
    type: 'station',
    alive: true,
    pos: { x: Math.max(300, distance), z: 0 },
    vel: { x: 0, z: 0 },
    data: { stationId, dockRadius: 80 },
  };
  state.entities.set(station.id, station);
  state.entityList.push(station);
  state.entityIndex.byStationId.set(stationId, station);
  state.entityIndex.stations.push(station);
  return station;
}

function advanceClock(state, system, seconds, perStep = null) {
  let remaining = Math.max(0, Number(seconds) || 0);
  while (remaining > 0) {
    const dt = Math.min(1, remaining);
    state.simTime += dt;
    state.meta.playtimeS += dt;
    state.tick += Math.max(1, Math.round(dt * 60));
    system.update(dt, state);
    if (perStep) perStep(dt);
    remaining -= dt;
  }
}

function cursor(stageIndex = 0, branchId = null, startEpoch = 7) {
  return { archetypeId: 'lung_run', startEpoch, stageIndex, branchId, attempt: 0 };
}

function postOffer(bus, offer) {
  bus.emit('mission:offered', JSON.parse(JSON.stringify(offer)));
}

function chainOffers(state, chainId, stageIndex = null) {
  return Object.values(state.missions.boards || {})
    .flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === SET_PIECE_MISSION_SOURCE
      && offer.cause && offer.cause.chainId === chainId
      && (stageIndex == null || offer.cause.stageIndex === stageIndex));
}

function activeForStage(state, stageId) {
  return state.missions.active.find((mission) => (
    mission && mission.status === 'active' && mission.cause && mission.cause.stageId === stageId
  )) || null;
}

function targetRoles(state, mission) {
  const counts = { life_pod: 0, rescue_escort: 0 };
  for (const id of mission.targetEntityIds || []) {
    const entity = state.entities.get(id);
    const role = entity && entity.data && entity.data.physicalRole;
    if (role in counts) counts[role] += 1;
  }
  return counts;
}

/** Rescue stage settles through its own native corridor_pull verb: escorts fall to kills,
 *  then a tether reel takes a pod from stand-off. */
function completeRescue(state, bus, system, mission) {
  const escorts = (mission.targetEntityIds || [])
    .map((id) => state.entities.get(id))
    .filter((entity) => entity && entity.alive !== false
      && entity.data && entity.data.physicalRole === 'rescue_escort');
  assert.ok(escorts.length >= 1, 'rescue stage has live raider escorts to clear');
  for (const escort of escorts) {
    escort.alive = false;
    bus.emit('entity:killed', { id: escort.id, killerId: state.playerId });
  }
  const pod = (mission.targetEntityIds || [])
    .map((id) => state.entities.get(id))
    .find((entity) => entity && entity.alive !== false
      && entity.data && entity.data.physicalRole === 'life_pod');
  assert.ok(pod, 'a life pod survives to be reeled');
  bus.emit('tether:reel', { targetId: pod.id, actorId: state.playerId });
  assert.equal(activeForStage(state, 'pull_the_crews'), null,
    'corridor_pull settles the rescue stage through the native tether verb');
}

function walkToBranch(state, bus, system) {
  const opening = buildSetPieceMissionOffers(state, cursor())[0];
  postOffer(bus, opening);
  assert.equal(system.acceptMission(opening.id), true, 'the writ wall takes the Lung Run opening');
  const chainId = opening.cause.chainId;
  const survey = activeForStage(state, 'read_the_break');
  assert.ok(survey, 'acceptance puts the break-up survey on the active list');
  bus.emit('scan:completed', { targetId: null });
  bus.emit('scan:completed', { targetId: null });
  assert.ok(activeForStage(state, 'read_the_break'),
    'two of three marks cannot close the survey');
  bus.emit('scan:completed', { targetId: null });
  assert.equal(activeForStage(state, 'read_the_break'), null, 'three marks close the survey');

  const rescueOffers = chainOffers(state, chainId, 1);
  assert.equal(rescueOffers.length, 1, 'the survey posts the rescue stage');
  assert.equal(rescueOffers[0].type, 'rescue_under_fire');
  postOffer(bus, rescueOffers[0]);
  assert.equal(system.acceptMission(rescueOffers[0].id), true);
  const rescue = activeForStage(state, 'pull_the_crews');
  assert.ok(rescue, 'the rescue stage is live');
  assert.deepEqual(targetRoles(state, rescue), { life_pod: 3, rescue_escort: 2 },
    'the break-up scene spawns its authored density: three pods under two raiders');

  bus.emit('dock:docked', { stationId: 'station_expanse' });
  assert.ok(activeForStage(state, 'pull_the_crews'),
    'a plain dock cannot stand in for pulling the crews');

  completeRescue(state, bus, system, rescue);
  return { chainId };
}

test('The Lung Run catalog entry validates and opens at the Expanse writ wall on seed 4242', () => {
  const validation = validateSetPieceMissionCatalog();
  assert.equal(validation.ok, true, (validation.errors || []).join('\n'));
  const definition = SET_PIECE_MISSIONS.find((entry) => entry.id === 'lung_run');
  assert.ok(definition, 'lung_run is an authored archetype');
  assert.equal(definition.startStationId, 'station_expanse');
  assert.equal(definition.commonStages[1].type, 'rescue_under_fire',
    'the chain spine is a rescue, not a patrol stand-in');
  assert.deepEqual(definition.commonStages[1].clauseIds, [],
    'the rescue stage carries no kill clause so both physical methods stay honest');

  const state = baseState();
  const opening = buildSetPieceMissionOffers(state, cursor())[0];
  assert.ok(opening, 'seed 4242 compiles the opening');
  assert.equal(opening.source, SET_PIECE_MISSION_SOURCE);
  assert.equal(opening.stationId, 'station_expanse');
  assert.equal(opening.type, 'recon_scan');
  assert.equal(opening.destSectorId, 'sector_charon_expanse');
  assert.equal(opening.title, 'Read the Break-Up');
  assert.ok(opening.cause && opening.cause.chainId, 'the opening carries a seeded chain cause');
});

test('The Lung Run plays assess, rescue under fire, and posts both approaches on seed 4242', () => {
  const state = baseState();
  const bus = new Bus();
  const system = initSystem(state, bus);
  const { chainId } = walkToBranch(state, bus, system);

  const siblings = chainOffers(state, chainId, 2);
  assert.equal(siblings.length, 2, 'the rescue opens exactly the two authored approaches');
  const tender = siblings.find((offer) => offer.cause.branchId === 'tender');
  const march = siblings.find((offer) => offer.cause.branchId === 'march');
  assert.ok(tender && march, 'both branch siblings are present');
  assert.equal(tender.type, 'escort');
  assert.equal(tender.stationId, 'station_expanse');
  assert.equal(tender.params.convoySize, 2);
  assert.equal(tender.params.ambushSize, 3);
  assert.equal(tender.clauses[0] && tender.clauses[0].id, 'no_kills');
  assert.equal(march.type, 'smuggling_run');
  assert.equal(march.destStationId, 'station_nyx_march');
  assert.equal(march.destSectorId, 'sector_nyx_march');
  assert.equal(march.clauses[0] && march.clauses[0].id, 'no_scan');
  assert.equal(bus.count('mission:completed', (p) => p.chainId === chainId), 2,
    'each accepted stage settles exactly once');
});

test('Tender route: the collection convoy runs an ambush and berths clean on seed 4242', () => {
  const state = baseState();
  const bus = new Bus();
  const system = initSystem(state, bus);
  const { chainId } = walkToBranch(state, bus, system);
  const tender = chainOffers(state, chainId, 2).find((offer) => offer.cause.branchId === 'tender');
  // The refinery berth must be live before acceptance: the ambush wing is placed along the
  // lead-to-berth approach line in the same spawn pass that materializes the convoy.
  ensureStation(state, 'station_expanse', 600);
  postOffer(bus, tender);
  assert.equal(system.acceptMission(tender.id), true);
  const escort = activeForStage(state, 'run_the_tender');
  assert.ok(escort, 'the tender leg is live');
  assert.ok(escort._escorteeId != null, 'the convoy spawned a lead hauler');
  const wing = (escort.targetEntityIds || []).filter((id) => id !== escort._escorteeId).length;
  assert.equal(wing, 1, 'the convoy is a lead plus one wing hauler');
  const ambush = state.entityList.filter((entity) => (
    entity && entity.data && entity.data.escortAmbushOf === String(escort.id)
  )).length;
  assert.equal(ambush, 3, 'the approach carries a three-ship raider ambush');

  // Drive the lead down the approach until it reaches the berth ring, then dock.
  const station = state.entityIndex.byStationId.get('station_expanse');
  const lead = state.entities.get(escort._escorteeId);
  let guard = 0;
  while (!escort._escorteeArrived && guard < 600) {
    advanceClock(state, system, 1, () => {
      const dx = station.pos.x - lead.pos.x;
      const dz = station.pos.z - lead.pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 1) return;
      const step = Math.min(180, distance);
      lead.pos.x += (dx / distance) * step;
      lead.pos.z += (dz / distance) * step;
    });
    guard += 1;
  }
  assert.equal(escort._escorteeArrived, true, 'the convoy lead reaches the refinery berth');
  bus.emit('dock:docked', { stationId: 'station_expanse' });
  assert.equal(activeForStage(state, 'run_the_tender'), null, 'the clean berth settles the tender');

  const receipt = state.missions.receipts.find((row) => (
    row && row.chainId === chainId && row.stageIndex === 2 && row.outcome === 'completed'
  ));
  assert.ok(receipt, 'the terminal stage leaves a canonical receipt');
  assert.equal(chainOffers(state, chainId).length, 0, 'the finished chain leaves no rows posted');
  assert.equal(state.missions.active.length, 0, 'nothing stays active after the run');
  assert.equal(bus.count('mission:completed', (p) => p.chainId === chainId), 3,
    'the whole three-stage route settles exactly three times');
});

test('March route: the sealed ledger reaches the Nyx Fence uninspected on seed 4242', () => {
  const state = baseState();
  const bus = new Bus();
  const system = initSystem(state, bus);
  const { chainId } = walkToBranch(state, bus, system);
  const march = chainOffers(state, chainId, 2).find((offer) => offer.cause.branchId === 'march');
  postOffer(bus, march);
  assert.equal(system.acceptMission(march.id), true);
  const run = activeForStage(state, 'march_the_ledger');
  assert.ok(run, 'the ledger run is live');
  assert.equal((state.player.cargo.items.cmdty_classified_salvage || 0), 1,
    'the sealed ledger is preloaded into the hold');

  bus.emit('dock:docked', { stationId: 'station_expanse' });
  assert.ok(activeForStage(state, 'march_the_ledger'),
    'berthing at the refinery cannot stand in for the Fence delivery');
  bus.emit('dock:docked', { stationId: 'station_nyx_march' });
  assert.equal(activeForStage(state, 'march_the_ledger'), null,
    'the Fence berth settles the quiet run');

  const receipt = state.missions.receipts.find((row) => (
    row && row.chainId === chainId && row.stageIndex === 2 && row.outcome === 'completed'
  ));
  assert.ok(receipt, 'the terminal stage leaves a canonical receipt');
  assert.equal(state.missions.active.length, 0, 'nothing stays active after the run');
  assert.equal(bus.count('mission:completed', (p) => p.chainId === chainId), 3,
    'the whole three-stage route settles exactly three times');
});
