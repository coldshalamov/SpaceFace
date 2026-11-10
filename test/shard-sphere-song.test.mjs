import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  LANDMARK_QUEST_SOURCE,
  SHARD_SPHERE_SONG,
  buildLandmarkQuestOffers,
  validateLandmarkQuestOffer,
} from '../src/data/landmarkMissions.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { v2FlavorRuntime as flavorProto } from '../src/systems/v2FlavorRuntime.js';
import { world as worldProto } from '../src/systems/world.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

const SECTOR_ID = SHARD_SPHERE_SONG.sectorId;
const POI_ID = SHARD_SPHERE_SONG.poiId;
const STATION_ID = SHARD_SPHERE_SONG.stationId;
const SIGNAL_ID = `signal:poi:${POI_ID}`;

function sectorDefinition() {
  return SECTORS.find((sector) => sector.id === SECTOR_ID);
}

function boot(seed = 6909) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.tick = 600;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.player.credits = 5000;
  state.player.stats = state.player.stats || {};
  state.factions.faction_vael = { ...(state.factions.faction_vael || {}), rep: 0 };

  const bus = createBus();
  const events = [];
  const spoken = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    events.push({ event, payload });
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
    voice: {
      say(payload) {
        spoken.push(payload);
        return true;
      },
    },
    player: () => state.entities.get(state.playerId),
  };
  const scanner = Object.assign({}, scannerProto);
  const world = Object.assign({}, worldProto);
  const missions = Object.assign({}, missionsProto);
  const flavor = Object.assign({}, flavorProto);
  scanner.init({ state, bus, helpers, registry: { get: () => null } });
  world.init({ state, bus, helpers, registry: { get: () => null } });
  missions.init({ state, bus, helpers, registry: { get: (name) => name === 'world' ? world : null } });
  flavor.init({ state, bus, helpers, registry: { get: () => null } });

  const sector = sectorDefinition();
  const poi = sector.pois.find((row) => row.id === POI_ID);
  const targetPos = sectorLocalToGlobalForSector(poi.pos, SECTOR_ID);
  const player = spawnEntity({
    type: 'ship', team: 0, pos: { x: targetPos.x - 80, z: targetPos.z },
    vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const sphere = spawnEntity({
    type: 'anomaly', team: 2, pos: targetPos, vel: { x: 0, z: 0 }, radius: 24,
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
  state.world.currentSectorId = SECTOR_ID;
  state.world.activeSector = {
    id: SECTOR_ID,
    stations: [], fields: [], gates: [],
    pois: [{ id: sphere.id, poiId: POI_ID, type: poi.type, pos: { ...sphere.pos } }],
  };
  state.world.discovery[SECTOR_ID] = {
    charted: false,
    pois: { [POI_ID]: { discovered: true, identified: true, identifiedAt: 10 } },
    fieldsDepleted: {},
  };
  return { state, bus, events, spoken, scanner, world, missions, flavor, player, sphere };
}

function pulse(h, number) {
  h.state.simTime = 10 + number;
  h.scanner._pulse(h.state, h.player, h.state.simTime);
}

test('Echo Shrine and the Shard Sphere share one physical center and expose the existing route', () => {
  const sector = sectorDefinition();
  const station = sector.stations.find((row) => row.id === STATION_ID);
  const poi = sector.pois.find((row) => row.id === POI_ID);
  assert.ok(station && poi);
  assert.deepEqual(poi.pos, station.pos);
  assert.equal(station.repGated, true);
  assert.ok(station.services.includes('missions'));
  assert.equal(poi.name, 'The Shard Sphere');
  assert.equal(poi.scannerSignalKind, 'archive');
  assert.equal(poi.repeatableScannerSignal, true);
  assert.equal(poi.flavorTargetRef, SHARD_SPHERE_SONG.targetRef);
  assert.equal(poi.discoveryPlate.title, 'The Shard Sphere');
});

test('four active scans recover four ordered fragments and preserve progress across Continue', () => {
  const h = boot();
  for (let index = 1; index <= SHARD_SPHERE_SONG.requiredSignalScans; index++) {
    pulse(h, index);
    assert.equal(h.state.signalInvestigation.records[SIGNAL_ID].scanCount, index);
  }
  const fragmentLines = h.spoken.filter((row) => /^SCHISM FRAGMENT/.test(row.text));
  assert.equal(fragmentLines.length, 4);
  assert.deepEqual(fragmentLines.map((row) => row.text.match(/FRAGMENT (\d\/4)/)[1]), ['1/4', '2/4', '3/4', '4/4']);

  const offers = buildLandmarkQuestOffers(h.state, { sectorId: SECTOR_ID });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].id, SHARD_SPHERE_SONG.id);
  assert.equal(validateLandmarkQuestOffer(offers[0]), true);
  assert.equal(offers[0].minRep, 150);

  const restored = boot();
  restored.scanner.deserialize(h.scanner.serialize());
  restored.flavor.deserialize(h.flavor.serialize());
  assert.equal(restored.state.signalInvestigation.records[SIGNAL_ID].scanCount, 4);
  assert.deepEqual(buildLandmarkQuestOffers(restored.state, { sectorId: SECTOR_ID }).map((row) => row.id), [
    SHARD_SPHERE_SONG.id,
  ]);
  pulse(restored, 5);
  assert.equal(restored.spoken.filter((row) => /^SCHISM FRAGMENT/.test(row.text)).length, 0,
    'Continue does not replay already filed fragments');
});

test('the Trusted-Vael board contract gates acceptance and files one durable reconstructed song', () => {
  const h = boot(6910);
  for (let index = 1; index <= SHARD_SPHERE_SONG.requiredSignalScans; index++) pulse(h, index);
  const board = h.state.missions.boards[STATION_ID];
  const offer = board && board.slots.find((row) => row.source === LANDMARK_QUEST_SOURCE
    && row.id === SHARD_SPHERE_SONG.id);
  assert.ok(offer, 'the fourth fragment posts the reconstruction to the ordinary station board');
  assert.equal(h.missions.acceptMission(offer.id), false, 'neutral standing cannot accept a Trusted contract');
  assert.ok(board.slots.some((row) => row.id === offer.id), 'a denied acceptance leaves the offer visible');

  h.state.factions.faction_vael.rep = SHARD_SPHERE_SONG.minRep;
  assert.equal(h.missions.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((row) => row.sourceOfferId === offer.id);
  assert.ok(mission);
  assert.deepEqual(h.state.nav.waypoint.pos, h.sphere.pos);

  pulse(h, 5);
  assert.equal(h.state.missions.active.includes(mission), false);
  const artifact = h.state.world.discovery[SECTOR_ID].pois[POI_ID].landmarkArtifact;
  assert.equal(artifact.id, SHARD_SPHERE_SONG.artifact.id);
  assert.equal(artifact.sourceRef, SHARD_SPHERE_SONG.targetRef);
  assert.equal(h.events.filter((row) => row.event === 'economy:grantCredits'
    && row.payload.reason === `mission:${mission.id}`).length, 1);
  assert.equal(h.events.filter((row) => row.event === 'mission:completed'
    && row.payload.missionId === mission.id).length, 1);

  const plate = explorationDiscoveryPlates(h.state)
    .find((row) => row.poiId === POI_ID && row.sectorId === SECTOR_ID);
  assert.ok(plate);
  assert.match(plate.body, /Reconstructed Schism Song/);
  assert.match(plate.note, new RegExp(SHARD_SPHERE_SONG.artifact.id));

  const restored = boot(6910);
  restored.world.deserialize(h.world.serialize());
  assert.deepEqual(buildLandmarkQuestOffers(restored.state, { sectorId: SECTOR_ID }), []);
});
