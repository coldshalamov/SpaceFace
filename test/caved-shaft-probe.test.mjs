import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  CAVED_SHAFT_PROBE,
  LANDMARK_QUEST_SOURCE,
  buildLandmarkQuestOffers,
  validateLandmarkQuestOffer,
} from '../src/data/landmarkMissions.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { world as worldProto } from '../src/systems/world.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

const SECTOR_ID = CAVED_SHAFT_PROBE.sectorId;
const POI_ID = CAVED_SHAFT_PROBE.poiId;
const STATION_ID = CAVED_SHAFT_PROBE.stationId;

function definition() {
  return SECTORS.find((sector) => sector.id === SECTOR_ID)
    ?.pois.find((poi) => poi.id === POI_ID);
}

function boot(seed = 6606) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.player.credits = 5000;
  state.player.researchPoints = 0;
  state.player.stats = state.player.stats || {};
  state.factions.faction_dmc = { ...(state.factions.faction_dmc || {}), rep: 500 };

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
  const registry = { get: () => null };
  const scanner = Object.assign({}, scannerProto);
  const world = Object.assign({}, worldProto);
  const missions = Object.assign({}, missionsProto);
  scanner.init({ state, bus, helpers, registry });
  world.init({ state, bus, helpers, registry });
  missions.init({ state, bus, helpers, registry: { get: (name) => name === 'world' ? world : null } });

  state.world.currentSectorId = SECTOR_ID;
  const poi = definition();
  const targetPos = sectorLocalToGlobalForSector(poi.pos, SECTOR_ID);
  const player = spawnEntity({
    type: 'ship', team: 0, pos: { x: targetPos.x - 80, z: targetPos.z },
    vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const shaft = spawnEntity({
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
      sectorId: SECTOR_ID,
    },
  });
  state.world.activeSector = {
    id: SECTOR_ID,
    stations: [], fields: [], gates: [],
    pois: [{ id: shaft.id, poiId: POI_ID, type: poi.type, pos: { ...shaft.pos } }],
  };
  state.world.discovery[SECTOR_ID] = {
    charted: false,
    pois: { [POI_ID]: { discovered: true, identified: true, identifiedAt: 12 } },
    fieldsDepleted: {},
  };
  return { state, bus, log, scanner, world, missions, player, shaft };
}

test('the default Caved Shaft carrier exposes archive, flavor, plate, and repeat-scan identity', () => {
  const poi = definition();
  assert.ok(poi);
  assert.equal(poi.name, 'The Caved Shaft');
  assert.equal(poi.scannerSignalKind, 'archive');
  assert.equal(poi.repeatableScannerSignal, true);
  assert.equal(poi.flavorTargetRef, 'landmark_c6_caved_shaft');
  assert.equal(poi.discoveryPlate.title, 'The Caved Shaft');

  const spawned = [];
  const system = Object.assign({}, worldProto, {
    helpers: {
      spawnEntity(spec) {
        const entity = { id: spawned.length + 1, alive: true, ...spec };
        spawned.push(entity);
        return entity;
      },
    },
    _toGlobal: (point) => ({ ...point }),
    _stampHomeSector: () => {},
  });
  const active = { id: SECTOR_ID, pois: [] };
  system._spawnPOIs(SECTORS.find((sector) => sector.id === SECTOR_ID), active, { pois: {} }, () => 0.5);
  const carrier = spawned.find((entity) => entity.data?.poiId === POI_ID);
  assert.ok(carrier);
  assert.equal(carrier.data.scannerSignalKind, 'archive');
  assert.equal(carrier.data.repeatableScannerSignal, true);
  assert.equal(carrier.data.flavorTargetRef, 'landmark_c6_caved_shaft');
});

test('the discovered shaft posts one validated local board contract and never duplicates it', () => {
  const h = boot();
  const offers = buildLandmarkQuestOffers(h.state, { sectorId: SECTOR_ID, poiId: POI_ID });
  assert.equal(offers.length, 1);
  assert.equal(validateLandmarkQuestOffer(offers[0]), true);
  assert.equal(offers[0].source, LANDMARK_QUEST_SOURCE);
  assert.equal(offers[0].stationId, STATION_ID);
  assert.equal(offers[0].destSectorId, SECTOR_ID);
  assert.equal(offers[0].params.landmarkProbe.poiId, POI_ID);

  h.bus.emit('poi:identified', { sectorId: SECTOR_ID, poiId: POI_ID, type: 'derelict' });
  const board = h.state.missions.boards[STATION_ID];
  assert.ok(board);
  assert.equal(board.slots.filter((row) => row.source === LANDMARK_QUEST_SOURCE).length, 1);
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  assert.equal(board.slots.filter((row) => row.source === LANDMARK_QUEST_SOURCE).length, 1);
});

test('a second close scan returns the durable frame through the real mission and world owners', () => {
  const h = boot(6607);
  h.bus.emit('poi:identified', { sectorId: SECTOR_ID, poiId: POI_ID, type: 'derelict' });
  const offer = h.state.missions.boards[STATION_ID].slots
    .find((row) => row.source === LANDMARK_QUEST_SOURCE);
  assert.ok(offer);

  // The first ordinary close reading can already be filed before the hardened-probe job is taken.
  h.scanner._pulse(h.state, h.player, 12);
  const signalId = `signal:entity:${h.shaft.id}`;
  assert.equal(h.state.signalInvestigation.records[signalId].sourceKind, 'archive');
  h.bus.emit('signal:track', { signalId });
  h.scanner._updateTrackedSignal(h.state);
  assert.ok(h.state.signalInvestigation.completed[signalId]);

  assert.equal(h.missions.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((row) => row.sourceOfferId === offer.id);
  assert.ok(mission);
  assert.equal(mission.needsTargets, false, 'the contract reuses the physical shaft carrier');
  assert.deepEqual(h.state.nav.waypoint.pos, h.shaft.pos);

  // Scanner must admit this authored archive again even though the ordinary signal was completed.
  h.state.simTime = 20;
  h.scanner._pulse(h.state, h.player, 20);
  assert.equal(h.state.missions.active.includes(mission), false);
  const recovered = h.state.world.discovery[SECTOR_ID].pois[POI_ID].landmarkArtifact;
  assert.equal(recovered.id, CAVED_SHAFT_PROBE.artifact.id);
  assert.equal(recovered.title, CAVED_SHAFT_PROBE.artifact.title);
  assert.match(recovered.body, /amber-lit wall/);
  assert.equal(recovered.sourceRef, CAVED_SHAFT_PROBE.targetRef);
  assert.equal(h.log.filter((row) => row.event === 'landmark:artifactRecovered').length, 1);
  assert.equal(h.log.filter((row) => row.event === 'economy:grantCredits'
    && row.payload.reason === `mission:${mission.id}`).length, 1);
  assert.equal(h.log.filter((row) => row.event === 'mission:completed'
    && row.payload.missionId === mission.id).length, 1);

  const plate = explorationDiscoveryPlates(h.state)
    .find((row) => row.poiId === POI_ID && row.sectorId === SECTOR_ID);
  assert.ok(plate);
  assert.match(plate.body, /C6-1 · Shaft Return Frame/);
  assert.match(plate.note, new RegExp(CAVED_SHAFT_PROBE.artifact.id));

  const savedWorld = h.world.serialize();
  const restored = boot(6607);
  restored.world.deserialize(savedWorld);
  const restoredPlate = explorationDiscoveryPlates(restored.state)
    .find((row) => row.poiId === POI_ID && row.sectorId === SECTOR_ID);
  assert.equal(restoredPlate.body, plate.body);
  assert.deepEqual(buildLandmarkQuestOffers(restored.state), [],
    'the saved artifact is durable completion authority and prevents a resurrected offer');
});
