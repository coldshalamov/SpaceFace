import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  LANDMARK_QUEST_SOURCE,
  RESONANCE_OBELISK_SURVEY,
  buildLandmarkQuestOffers,
  validateLandmarkQuestOffer,
} from '../src/data/landmarkMissions.js';
import { RESONANCE_OBELISK } from '../src/data/resonanceObelisk.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { dossArchiveEvidence } from '../src/data/dossArchive.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { world as worldProto } from '../src/systems/world.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

const { sectorId: SECTOR_ID, poiId: POI_ID } = RESONANCE_OBELISK;
const STATION_ID = RESONANCE_OBELISK_SURVEY.stationId;

function obeliskDefinition() {
  return SECTORS.find((sector) => sector.id === SECTOR_ID)
    ?.pois.find((poi) => poi.id === POI_ID);
}

function boot(seed = 4814) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.player.credits = 5000;
  state.player.researchPoints = 0;
  state.player.stats = state.player.stats || {};

  const bus = createBus();
  const events = [];
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
    voice: { say: () => true },
    player: () => state.entities.get(state.playerId),
  };
  const scanner = Object.assign({}, scannerProto);
  const world = Object.assign({}, worldProto);
  const missions = Object.assign({}, missionsProto);
  scanner.init({ state, bus, helpers, registry: { get: () => null } });
  world.init({ state, bus, helpers, registry: { get: () => null } });
  missions.init({ state, bus, helpers, registry: { get: (name) => name === 'world' ? world : null } });

  const poi = obeliskDefinition();
  const targetPos = sectorLocalToGlobalForSector({ x: 0, z: 0 }, SECTOR_ID);
  state.world.currentSectorId = SECTOR_ID;
  const player = spawnEntity({
    type: 'ship', team: 0, pos: { x: targetPos.x - 80, z: targetPos.z },
    vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const obelisk = spawnEntity({
    type: 'fx', team: 2, pos: targetPos, vel: { x: 0, z: 0 }, radius: 24,
    mass: 0, collides: false,
    data: {
      poi: true,
      poiId: POI_ID,
      poiType: poi.type,
      name: poi.name,
      requiresTriangulation: true,
      triangulation: { ...poi.triangulation },
      anomalyTriangulated: true,
      resonanceScanResponse: true,
      flavorTargetRef: poi.flavorTargetRef,
      sectorId: SECTOR_ID,
    },
  });
  state.world.activeSector = {
    id: SECTOR_ID,
    stations: [], fields: [], gates: [],
    pois: [{
      id: obelisk.id,
      poiId: POI_ID,
      type: poi.type,
      pos: { ...obelisk.pos },
      hidden: true,
      requiresTriangulation: true,
      triangulation: { ...poi.triangulation },
      anomalyTriangulated: true,
    }],
  };
  state.world.discovery[SECTOR_ID] = {
    charted: false,
    pois: {
      [POI_ID]: {
        discovered: true,
        triangulated: true,
        triangulatedAt: 8,
        triangulationSampleCount: 3,
        type: 'anomaly',
      },
    },
    fieldsDepleted: {},
  };
  return { state, bus, events, scanner, world, missions, player, obelisk };
}

function markPhysicalInvestigation(harness, investigatedAt = 12) {
  Object.assign(harness.state.world.discovery[SECTOR_ID].pois[POI_ID], {
    discovered: true,
    identified: true,
    investigated: true,
    investigatedAt,
    type: 'anomaly',
    name: 'The Resonance Obelisk',
  });
}

test('PQ-048.14 only posts after the independent physical Obelisk investigation', () => {
  const h = boot();
  assert.deepEqual(buildLandmarkQuestOffers(h.state, { sectorId: SECTOR_ID, poiId: POI_ID }), [],
    'triangulation alone must leave discovery voluntary rather than post a premature commission');

  markPhysicalInvestigation(h);
  const offers = buildLandmarkQuestOffers(h.state, { sectorId: SECTOR_ID, poiId: POI_ID });
  assert.equal(offers.length, 1);
  const [offer] = offers;
  assert.equal(offer.id, RESONANCE_OBELISK_SURVEY.id);
  assert.equal(validateLandmarkQuestOffer(offer), true);
  assert.equal(offer.stationId, STATION_ID);
  assert.equal(offer.factionId, null);
  assert.equal(offer.reward_cr, 0);
  assert.equal(offer.params.landmarkProbe.signalKind, 'anomaly');
  assert.equal(offer.params.landmarkProbe.poiId, POI_ID);
  assert.equal(offer.params.landmarkProbe.maxRangeWu, 300);
});

test('PQ-048.14 requires an uncoerced non-negative physical-investigation timestamp', () => {
  for (const investigatedAt of [-1, null, '12', Number.NaN, Infinity, -Infinity]) {
    const h = boot();
    markPhysicalInvestigation(h, investigatedAt);
    assert.deepEqual(buildLandmarkQuestOffers(h.state, { sectorId: SECTOR_ID, poiId: POI_ID }), [],
      `corrupt investigatedAt ${String(investigatedAt)} must not post the survey`);
  }

  const h = boot();
  markPhysicalInvestigation(h, 0);
  assert.equal(buildLandmarkQuestOffers(h.state, { sectorId: SECTOR_ID, poiId: POI_ID }).length, 1,
    'zero remains a valid legacy simulation timestamp');
});

test('the pending Veil survey survives one board epoch without duplicating', () => {
  const h = boot(4816);
  markPhysicalInvestigation(h);
  h.bus.emit('poi:identified', { sectorId: SECTOR_ID, poiId: POI_ID, type: 'anomaly' });

  const countSurveyRows = (board) => (board && board.slots || []).filter((row) => (
    row.source === LANDMARK_QUEST_SOURCE && row.id === RESONANCE_OBELISK_SURVEY.id
  )).length;
  assert.equal(countSurveyRows(h.state.missions.boards[STATION_ID]), 1);

  h.state.simTime += h.state.missions.config.refreshSec;
  const refreshed = h.missions.ensureBoard(STATION_ID);
  assert.equal(countSurveyRows(refreshed), 1,
    'an unaccepted field survey remains available after the ordinary board refresh');
  assert.equal(countSurveyRows(h.missions.ensureBoard(STATION_ID)), 1,
    'same-epoch board access cannot duplicate the preserved survey');
});

test('the Veil survey uses the exact close anomaly scan once, files durable knowledge, and leaves Doss unchanged', () => {
  const h = boot(4815);
  markPhysicalInvestigation(h, 12);
  const dossBefore = dossArchiveEvidence(h.state).map((entry) => entry.id);
  assert.deepEqual(dossBefore, ['veil_resonance_obelisk']);

  h.bus.emit('poi:identified', { sectorId: SECTOR_ID, poiId: POI_ID, type: 'anomaly' });
  const board = h.state.missions.boards[STATION_ID];
  const offer = board && board.slots.find((row) => row.source === LANDMARK_QUEST_SOURCE
    && row.id === RESONANCE_OBELISK_SURVEY.id);
  assert.ok(offer, 'the already-investigated Obelisk posts one normal Station Veil mission');
  assert.equal(h.missions.acceptMission(offer.id), true);

  const mission = h.state.missions.active.find((row) => row.sourceOfferId === offer.id);
  assert.ok(mission);
  assert.equal(mission.needsTargets, false, 'the mission reuses the existing physical Obelisk carrier');
  assert.deepEqual(h.state.nav.waypoint.pos, h.obelisk.pos);
  const creditsBefore = h.state.player.credits;

  h.state.simTime = 20;
  h.scanner._pulse(h.state, h.player, h.state.simTime);

  assert.equal(h.state.missions.active.includes(mission), false);
  assert.equal(h.state.player.credits, creditsBefore, 'the knowledge contract cannot grant fake credits');
  assert.equal(h.events.filter((entry) => entry.event === 'economy:grantCredits'
    && entry.payload.reason === `mission:${mission.id}`).length, 0);
  assert.equal(h.events.filter((entry) => entry.event === 'economy:chargeCredits'
    && entry.payload.reason === `collateral:${offer.id}`).length, 0);
  assert.equal(h.events.filter((entry) => entry.event === 'faction:repDelta').length, 0);
  assert.equal(h.events.filter((entry) => entry.event === 'cargo:delivered').length, 0);

  const debrief = h.events.find((entry) => entry.event === 'comms:popup'
    && entry.payload.text === RESONANCE_OBELISK_SURVEY.successText);
  assert.ok(debrief);
  assert.equal(debrief.payload.note, 'Field record filed; no credits issued.');
  const completionToast = h.events.find((entry) => entry.event === 'toast'
    && entry.payload.text.startsWith(`Mission complete: ${mission.title}`));
  assert.ok(completionToast);
  assert.equal(completionToast.payload.text,
    `Mission complete: ${mission.title} — field record filed; no credits issued.`);

  const artifact = h.state.world.discovery[SECTOR_ID].pois[POI_ID].landmarkArtifact;
  assert.deepEqual(artifact, {
    id: RESONANCE_OBELISK_SURVEY.artifact.id,
    title: RESONANCE_OBELISK_SURVEY.artifact.title,
    body: RESONANCE_OBELISK_SURVEY.artifact.body,
    sourceRef: RESONANCE_OBELISK_SURVEY.targetRef,
    signalId: RESONANCE_OBELISK.signalId,
    returnedAt: 20,
  });
  assert.equal(h.events.filter((entry) => entry.event === 'landmark:artifactRecovered').length, 1);
  const completed = h.events.filter((entry) => entry.event === 'mission:completed'
    && entry.payload.missionId === mission.id);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].payload.factionId, null, 'the survey cannot create a reputation outcome');
  assert.deepEqual(dossArchiveEvidence(h.state).map((entry) => entry.id), dossBefore,
    'the survey artifact is not a Doss source and cannot add a second Obelisk count');

  const scan = h.events.findLast((entry) => entry.event === 'signal:scanResults');
  h.bus.emit('signal:scanResults', scan.payload);
  assert.equal(h.events.filter((entry) => entry.event === 'landmark:artifactRecovered').length, 1,
    'replayed scanner results cannot duplicate the durable field record');

  const plate = explorationDiscoveryPlates(h.state)
    .find((row) => row.sectorId === SECTOR_ID && row.poiId === POI_ID);
  assert.ok(plate);
  assert.match(plate.body, /C2-5 · Obelisk Survey Log/);
  assert.match(plate.note, new RegExp(RESONANCE_OBELISK_SURVEY.artifact.id));

  const restored = boot(4815);
  restored.world.deserialize(h.world.serialize());
  assert.deepEqual(buildLandmarkQuestOffers(restored.state, { sectorId: SECTOR_ID, poiId: POI_ID }), [],
    'the saved artifact remains completion authority on Continue');
});
