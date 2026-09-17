import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';
import {
  LANDMARK_QUEST_SOURCE,
  QUIESSENCE_CENSUS,
  buildLandmarkQuestOffers,
  validateLandmarkQuestOffer,
} from '../src/data/landmarkMissions.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { v2FlavorRuntime as flavorProto } from '../src/systems/v2FlavorRuntime.js';
import { world as worldProto } from '../src/systems/world.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';
import { quiessenceCensusProgress } from '../src/ui/bandHud.js';

const SECTOR_ID = QUIESSENCE_CENSUS.sectorId;
const POI_ID = QUIESSENCE_CENSUS.poiId;
const STATION_ID = QUIESSENCE_CENSUS.stationId;
const HULLS = QUIESSENCE_CENSUS.requiredSurveyedHulls;
const MEMORIAL_POS = Object.freeze({ x: 500, z: -300 });

function sectorDefinition() {
  return SECTORS.find((sector) => sector.id === SECTOR_ID);
}

function hullPos(index) {
  const angle = (index / HULLS) * Math.PI * 2;
  const ring = 120 + (index % 5) * 28;
  return { x: MEMORIAL_POS.x + Math.cos(angle) * ring, z: MEMORIAL_POS.z + Math.sin(angle) * ring };
}

function boot(seed = 6114) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.tick = 600;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.player.credits = 5000;
  state.player.stats = state.player.stats || {};
  state.factions.faction_mts = { ...(state.factions.faction_mts || {}), rep: 0 };

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
  const player = spawnEntity({
    type: 'ship', team: 0, pos: { ...MEMORIAL_POS },
    vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const memorial = spawnEntity({
    type: 'anomaly', team: 2, pos: { ...MEMORIAL_POS }, vel: { x: 0, z: 0 }, radius: 24,
    mass: 0, collides: false,
    data: {
      poi: true,
      poiId: poi.id,
      poiType: poi.type,
      name: poi.name,
      scannerSignalKind: poi.scannerSignalKind,
      flavorTargetRef: poi.flavorTargetRef,
      sectorId: SECTOR_ID,
    },
  });
  const hulls = [];
  const activePois = [{ id: memorial.id, poiId: POI_ID, type: poi.type, pos: { ...memorial.pos } }];
  for (let index = 1; index <= HULLS; index++) {
    const hull = spawnEntity({
      type: 'fx', team: 2, pos: hullPos(index), vel: { x: 0, z: 0 }, radius: 14,
      mass: 0, collides: false,
      data: {
        poi: true,
        poiId: `${POI_ID}_hull_${index}`,
        poiType: 'anomaly',
        hidden: true,
        name: `Quiessence Hull ${index}`,
        sectorId: SECTOR_ID,
        homeSectorId: SECTOR_ID,
        flavorTargetRef: poi.flavorTargetRef,
        quiessenceShipIndex: index,
        memorialHull: true,
      },
    });
    hulls.push(hull);
    activePois.push({
      id: hull.id, poiId: `${POI_ID}_hull_${index}`, type: 'anomaly', pos: { ...hull.pos }, hidden: true,
    });
  }
  state.world.currentSectorId = SECTOR_ID;
  state.world.activeSector = {
    id: SECTOR_ID,
    stations: [], fields: [], gates: [],
    pois: activePois,
  };
  state.world.discovery[SECTOR_ID] = {
    charted: false,
    pois: { [POI_ID]: { discovered: true, identified: true, identifiedAt: 10 } },
    fieldsDepleted: {},
  };
  return { state, bus, events, spoken, scanner, world, missions, flavor, player, memorial, hulls, poi };
}

function pulse(h, number) {
  h.state.simTime = 10 + number;
  h.scanner._pulse(h.state, h.player, h.state.simTime);
}

test('Pallas Drift hosts the memorial and Drift Market takes the return', () => {
  const sector = sectorDefinition();
  const station = sector.stations.find((row) => row.id === STATION_ID);
  const poi = sector.pois.find((row) => row.id === POI_ID);
  assert.ok(station && poi);
  assert.ok(station.services.includes('missions'));
  assert.equal(poi.name, 'The Quiessence');
  assert.equal(poi.type, 'anomaly');
  assert.equal(poi.scannerSignalKind, 'archive');
  assert.equal(poi.flavorTargetRef, QUIESSENCE_CENSUS.targetRef);
  assert.equal(poi.bandLandmarkFleet, HULLS);
  assert.equal(poi.discoveryPlate.title, 'The Quiessence Census');
  assert.equal(QUIESSENCE_CENSUS.factionId, station.factionId);
});

test('seventeen pulses file seventeen verbatim hulls and complete the census', () => {
  const h = boot();
  const authored = new Set(FLAVOR_PACKS.quiessence.entries.map((entry) => entry.text));
  const filed = new Set();
  for (let number = 1; number <= HULLS; number++) {
    pulse(h, number);
    const hullLines = h.spoken.filter((row) => /^Formation census: /.test(row.text));
    assert.equal(hullLines.length, number, `pulse ${number} files exactly one new hull`);
    const latest = hullLines[number - 1].text;
    assert.ok(authored.has(latest), 'each filed line is byte-identical to its authored census');
    assert.ok(!filed.has(latest), 'no hull reads twice');
    filed.add(latest);
    assert.equal(
      buildLandmarkQuestOffers(h.state, { sectorId: SECTOR_ID }).length,
      number >= HULLS ? 1 : 0,
      number >= HULLS ? 'the finished census posts the return survey' : 'a partial census posts nothing',
    );
  }
  assert.equal(filed.size, HULLS, 'all seventeen authored counts filed exactly once');
  assert.deepEqual(quiessenceCensusProgress(h.state), { scanned: 17, total: 17, complete: true },
    'the new index-keyed receipts feed the shipped Band census counter');
  const completion = h.spoken.filter((row) => /^FORMATION CENSUS COMPLETE/.test(row.text));
  assert.equal(completion.length, 1);
  assert.match(completion[0].text, /Drift Market archive/);

  const offers = buildLandmarkQuestOffers(h.state, { sectorId: SECTOR_ID });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].id, QUIESSENCE_CENSUS.id);
  assert.equal(validateLandmarkQuestOffer(offers[0]), true);
  assert.equal(offers[0].minRep, 50);

  const restored = boot();
  restored.scanner.deserialize(h.scanner.serialize());
  restored.flavor.deserialize(h.flavor.serialize());
  assert.deepEqual(buildLandmarkQuestOffers(restored.state, { sectorId: SECTOR_ID }).map((row) => row.id), [
    QUIESSENCE_CENSUS.id,
  ]);
  pulse(restored, HULLS + 1);
  assert.equal(restored.spoken.filter((row) => /^Formation census: /.test(row.text)).length, 0,
    'Continue does not replay already filed hulls');
  assert.equal(restored.spoken.filter((row) => /^FORMATION CENSUS COMPLETE/.test(row.text)).length, 0,
    'Continue does not replay the completion');
});

test('legacy entity-keyed receipts keep a mid-census save whole', () => {
  const h = boot();
  // Sixteen hulls filed under the old receipt shape; only hull 17 remains unscanned.
  h.state.v2Flavor.presentedReceipts.push(
    ...Array.from({ length: 16 }, (_, i) => `quiessence:${900 + i}:${i + 1}`),
  );
  assert.deepEqual(buildLandmarkQuestOffers(h.state, { sectorId: SECTOR_ID }), [],
    'sixteen of seventeen is not a census');
  for (let number = 1; number <= HULLS; number++) pulse(h, number);
  const hullLines = h.spoken.filter((row) => /^Formation census: /.test(row.text));
  assert.equal(hullLines.length, 1, 'only the unfiled hull presents, not all seventeen again');
  assert.equal(hullLines[0].text, FLAVOR_PACKS.quiessence.entries[16].text,
    'the unfiled hull reads its authored count verbatim');
  assert.equal(h.spoken.filter((row) => /^FORMATION CENSUS COMPLETE/.test(row.text)).length, 1);
  assert.equal(buildLandmarkQuestOffers(h.state, { sectorId: SECTOR_ID }).length, 1);
});

test('the Drift Market board contract gates acceptance and files one durable census record', () => {
  const h = boot(6115);
  for (let number = 1; number <= HULLS; number++) pulse(h, number);
  const board = h.state.missions.boards[STATION_ID];
  const offer = board && board.slots.find((row) => row.source === LANDMARK_QUEST_SOURCE
    && row.id === QUIESSENCE_CENSUS.id);
  assert.ok(offer, 'the finished census posts the return survey to the ordinary station board');
  assert.equal(h.missions.acceptMission(offer.id), false, 'neutral standing cannot accept a standing contract');
  assert.ok(board.slots.some((row) => row.id === offer.id), 'a denied acceptance leaves the offer visible');

  h.state.factions.faction_mts.rep = QUIESSENCE_CENSUS.minRep;
  assert.equal(h.missions.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((row) => row.sourceOfferId === offer.id);
  assert.ok(mission);
  assert.deepEqual(h.state.nav.waypoint.pos, h.memorial.pos,
    'the generated memorial site resolves through the live POI entity, not the fallback');

  pulse(h, HULLS + 1);
  assert.equal(h.state.missions.active.includes(mission), false);
  const artifact = h.state.world.discovery[SECTOR_ID].pois[POI_ID].landmarkArtifact;
  assert.equal(artifact.id, QUIESSENCE_CENSUS.artifact.id);
  assert.equal(artifact.sourceRef, QUIESSENCE_CENSUS.targetRef);
  assert.equal(h.events.filter((row) => row.event === 'economy:grantCredits'
    && row.payload.reason === `mission:${mission.id}`).length, 1);
  assert.equal(h.events.filter((row) => row.event === 'mission:completed'
    && row.payload.missionId === mission.id).length, 1);

  const plate = explorationDiscoveryPlates(h.state)
    .find((row) => row.poiId === POI_ID && row.sectorId === SECTOR_ID);
  assert.ok(plate);
  assert.match(plate.body, /Quiessence Census Record/);
  assert.match(plate.note, new RegExp(QUIESSENCE_CENSUS.artifact.id));

  const restored = boot(6115);
  restored.world.deserialize(h.world.serialize());
  assert.deepEqual(buildLandmarkQuestOffers(restored.state, { sectorId: SECTOR_ID }), []);
});
