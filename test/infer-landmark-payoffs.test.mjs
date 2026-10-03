// Landmark payoff quests — Skerris Throne provenance, Metronome off-beat window, Ringworld grid
// reading. Three more flavored places answer a close reading with a filed record, a paid board
// contract, and a durable artifact.
//
// Contract (deterministic, sim-time only, through the real missions/world/scanner owners):
//   1. each quest's chart row carries the identity the machinery requires (archive signal,
//      repeatable, flavorTargetRef the artifact recovery can fail closed against);
//   2. discovery posts exactly one validated board offer at the named station and never a
//      duplicate on re-reconcile;
//   3. accepting and holding inside maxRange with one close pulse returns the artifact through
//      the real owners — pays, completes, and bars the offer from resurrecting after a save.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  LANDMARK_QUEST_SOURCE,
  METRONOME_OFFBEAT_WINDOW,
  RINGWORLD_GRID_READING,
  SKERRIS_THRONE_PROVENANCE,
  buildLandmarkQuestOffers,
  validateLandmarkQuestOffer,
} from '../src/data/landmarkMissions.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { world as worldProto } from '../src/systems/world.js';

const QUESTS = [
  SKERRIS_THRONE_PROVENANCE,
  METRONOME_OFFBEAT_WINDOW,
  RINGWORLD_GRID_READING,
];

function chartPoi(quest) {
  return SECTORS.find((sector) => sector.id === quest.sectorId)
    ?.pois.find((poi) => poi.id === quest.poiId);
}

function boot(quest, seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.player.credits = 5000;
  state.player.stats = state.player.stats || {};
  state.factions[quest.factionId] = { ...(state.factions[quest.factionId] || {}), rep: 0 };

  const bus = createBus();
  const log = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    log.push({ event, payload });
    return rawEmit(event, payload);
  };

  let nextId = 1;
  const spawnEntity = (spec) => {
    const entity = {
      ...spec,
      id: nextId++,
      alive: spec.alive !== false,
      pos: { ...(spec.pos || { x: 0, z: 0 }) },
      vel: { ...(spec.vel || { x: 0, z: 0 }) },
      data: { ...(spec.data || {}) },
      flags: { ...(spec.flags || {}) },
    };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const helpers = {
    hash32,
    mulberry32,
    spawnEntity,
    voice: { say: () => true },
    player: () => state.entities.get(state.playerId),
  };
  const scanner = Object.assign({}, scannerProto);
  const world = Object.assign({}, worldProto);
  const missions = Object.assign({}, missionsProto);
  scanner.init({ state, bus, helpers, registry: { get: () => null } });
  world.init({ state, bus, helpers, registry: { get: () => null } });
  missions.init({ state, bus, helpers, registry: { get: (name) => (name === 'world' ? world : null) } });

  state.world.currentSectorId = quest.sectorId;
  const poi = chartPoi(quest);
  const targetPos = poi.pos
    ? sectorLocalToGlobalForSector(poi.pos, quest.sectorId)
    : sectorLocalToGlobalForSector(quest.targetLocalPos, quest.sectorId);
  const player = spawnEntity({
    type: 'ship', team: 0, pos: { x: targetPos.x - 80, z: targetPos.z },
    vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const carrier = spawnEntity({
    type: 'fx', team: 2, pos: targetPos, vel: { x: 0, z: 0 }, radius: 24,
    mass: 0, collides: false,
    data: {
      poi: true,
      poiId: poi.id,
      poiType: poi.type,
      name: poi.name,
      scannerSignalKind: poi.scannerSignalKind,
      repeatableScannerSignal: poi.repeatableScannerSignal,
      flavorTargetRef: poi.flavorTargetRef,
      sectorId: quest.sectorId,
    },
  });
  state.world.activeSector = {
    id: quest.sectorId,
    stations: [], fields: [], gates: [],
    pois: [{ id: carrier.id, poiId: quest.poiId, type: poi.type, pos: { ...carrier.pos } }],
  };
  state.world.discovery[quest.sectorId] = {
    charted: false,
    pois: { [quest.poiId]: { discovered: true, identified: true, identifiedAt: 12 } },
    fieldsDepleted: {},
  };
  return { state, bus, log, scanner, world, missions, player, carrier, poi };
}

for (const quest of QUESTS) {
  test(`${quest.poiLabel}: the chart row carries everything the payoff needs`, () => {
    const poi = chartPoi(quest);
    assert.ok(poi, `${quest.poiId} must exist in ${quest.sectorId}`);
    assert.equal(poi.scannerSignalKind, 'archive', 'the close pulse must produce a matching signal');
    assert.equal(poi.repeatableScannerSignal, true, 'the reading must be retakeable after the signal investigation');
    assert.equal(poi.flavorTargetRef, quest.targetRef, 'artifact recovery fails closed on targetRef mismatch');
    assert.ok(poi.discoveryPlate, 'the place should already plate itself when found');
    const station = SECTORS.find((sector) => sector.id === quest.sectorId)
      .stations.find((station) => station.id === quest.stationId);
    assert.ok(station, `board station ${quest.stationId} must exist`);
    assert.ok(station.services.includes('missions'), 'the board station must post missions');
    assert.ok(quest.artifact.id && quest.artifact.title && quest.artifact.body);
  });

  test(`${quest.poiLabel}: discovery posts one validated offer, never a duplicate`, () => {
    const h = boot(quest, 7714);
    const offers = buildLandmarkQuestOffers(h.state, { sectorId: quest.sectorId, poiId: quest.poiId });
    assert.equal(offers.length, 1, 'discovery builds exactly one offer');
    assert.equal(validateLandmarkQuestOffer(offers[0]), true);
    assert.equal(offers[0].stationId, quest.stationId);
    assert.equal(offers[0].params.landmarkProbe.poiId, quest.poiId);

    h.bus.emit('poi:identified', { sectorId: quest.sectorId, poiId: quest.poiId, type: h.poi.type });
    const board = h.state.missions.boards[quest.stationId];
    assert.ok(board);
    assert.equal(board.slots.filter((row) => row.source === LANDMARK_QUEST_SOURCE).length, 1);
    h.bus.emit('sector:enter', { sectorId: quest.sectorId });
    assert.equal(board.slots.filter((row) => row.source === LANDMARK_QUEST_SOURCE).length, 1,
      're-reconcile must not double-post the contract');
  });

  test(`${quest.poiLabel}: one close pulse inside the range files the artifact and pays`, () => {
    const h = boot(quest, 7715);
    h.bus.emit('poi:identified', { sectorId: quest.sectorId, poiId: quest.poiId, type: h.poi.type });
    const offer = h.state.missions.boards[quest.stationId].slots
      .find((row) => row.source === LANDMARK_QUEST_SOURCE);
    assert.ok(offer, 'the board slot exists after discovery');

    assert.equal(h.missions.acceptMission(offer.id), true);
    const mission = h.state.missions.active.find((row) => row.sourceOfferId === offer.id);
    assert.ok(mission, 'the offer accepts into an active mission');

    h.state.simTime = 20;
    h.scanner._pulse(h.state, h.player, 20);
    assert.equal(h.state.missions.active.includes(mission), false,
      'the close reading settles the probe');
    const recovered = h.state.world.discovery[quest.sectorId].pois[quest.poiId].landmarkArtifact;
    assert.equal(recovered.id, quest.artifact.id);
    assert.equal(recovered.sourceRef, quest.targetRef);
    assert.equal(h.log.filter((row) => row.event === 'landmark:artifactRecovered').length, 1);
    assert.equal(h.log.filter((row) => row.event === 'economy:grantCredits'
      && row.payload.reason === `mission:${mission.id}`).length, 1,
      `the ${quest.stationId} broker pays the filed record`);
    assert.equal(h.log.filter((row) => row.event === 'mission:completed'
      && row.payload.missionId === mission.id).length, 1);

    const offers = buildLandmarkQuestOffers(h.state);
    assert.equal(offers.length, 0, 'a filed artifact is durable completion authority');
  });
}
