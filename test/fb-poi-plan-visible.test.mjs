// FB-035 — a living POI's plan, progress and guidance reach the local map and radar.
// The system publishes readouts on state.world.poiReadouts (single reader path, quiet when
// absent); the local map carries mapLabel + progress on the zone marker's landmark metadata and
// the radar carries radarKind as the blip class on its retained marks.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { livingPoiBehaviors } from '../src/systems/livingPoiBehaviors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  localmapScreen,
  localMapIntel,
  poiReadoutForEntity,
} from '../src/ui/screens/localmap.js';
import {
  censusRadarContactsStillLayer,
  createRadarContactsStillCache,
  setRadarContactsStillLayerForBench,
} from '../src/ui/radar.js';
import { tacticalRadarMetrics } from '../src/ui/map/tacticalMapGrammar.js';

const SEED = 4242;
const DAY_INDEX = 0; // "within the first cycle" — the plan must be visible the day it is cut.

// Two candidate mining_belt zones and one mining_field family: exactly one plans, the other is
// the dormant control — it must publish and carry nothing.
const ZONES = Object.freeze([
  { id: 'seam-a', name: 'North Seam', type: 'mining_belt', factionId: 'faction_dmc', center: { x: 0, z: 0 }, radius: 500, threat: 1 },
  { id: 'seam-b', name: 'South Seam', type: 'mining_belt', factionId: 'faction_dmc', center: { x: 0, z: 6000 }, radius: 500, threat: 1 },
]);

const SECTOR = Object.freeze({
  id: 'sector_fb035',
  security: 0.5,
  stations: Object.freeze([
    Object.freeze({ id: 'st_seam', factionId: 'faction_dmc', type: 'mining' }),
  ]),
});

function stationEntity(id, zoneCenterLocal, name) {
  const pos = sectorLocalToGlobalForSector(zoneCenterLocal, SECTOR.id);
  return {
    id, type: 'station', alive: true, team: 0, factionId: 'faction_dmc',
    pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, rot: 0, radius: 30,
    data: { name },
  };
}

function makeState() {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  };
  const stationA = stationEntity(7, ZONES[0].center, 'Berth A');
  const stationB = stationEntity(8, ZONES[1].center, 'Berth B');
  return {
    meta: { seed: SEED },
    simTime: 0,
    mode: 'flight',
    playerId: 1,
    player: { cargo: { items: {} } },
    entities: new Map([[player.id, player], [stationA.id, stationA], [stationB.id, stationB]]),
    entityList: [player, stationA, stationB],
    world: {
      currentSectorId: SECTOR.id,
      sectors: { [SECTOR.id]: SECTOR },
      activeSector: {
        stations: [
          { id: stationA.id, pos: stationA.pos, stationId: 'st_seam' },
          { id: stationB.id, pos: stationB.pos },
        ],
        fields: [], pois: [], gates: [],
      },
    },
  };
}

function makeSystem() {
  const state = makeState();
  const bus = createBus();
  const system = Object.create(livingPoiBehaviors);
  system.init({ state, bus, helpers: { voice: { say: () => true } } });
  system.newGame();
  return { system, state, bus };
}

function liveAndDormant(state) {
  const rows = state.livingPoiBehaviors.activeByZone;
  const liveIds = Object.keys(rows);
  assert.equal(liveIds.length, 1, 'exactly one family plans on the two candidate seams');
  const liveZoneId = liveIds[0];
  const dormantZoneId = ZONES.map((z) => z.id).find((id) => id !== liveZoneId);
  return { row: rows[liveZoneId], liveZoneId, dormantZoneId };
}

test('seed-4242 mining-field plan publishes a readout on state.world in the first cycle; dormant seam stays silent', () => {
  const { system, state } = makeSystem();
  system.planSector(SECTOR.id, { zones: ZONES, sector: SECTOR, dayIndex: DAY_INDEX });
  const { row, liveZoneId, dormantZoneId } = liveAndDormant(state);

  assert.equal(row.familyId, 'mining_field');
  const published = state.world.poiReadouts;
  assert.ok(published && typeof published === 'object', 'state.world.poiReadouts exists');
  const readout = published[liveZoneId];
  assert.ok(readout, 'the live zone publishes its readout');
  assert.equal(readout.familyId, 'mining_field');
  assert.equal(readout.mapLabel, 'WORKING SEAM');
  assert.equal(readout.radarKind, 'mining-field');
  assert.equal(readout.progress, 0);
  assert.equal(readout.required, 3);
  assert.equal(readout.status, 'available');
  assert.equal(readout.zoneName, row.zoneName);
  assert.ok(readout.anchorEntityId === 7 || readout.anchorEntityId === 8,
    'the readout names its visible anchor entity');
  assert.equal(published[dormantZoneId], undefined, 'the dormant seam publishes nothing');

  // The stamped anchor link resolves the live readout; the dormant station resolves nothing.
  const anchor = state.entities.get(readout.anchorEntityId);
  assert.equal(poiReadoutForEntity(state, anchor), readout);
  const dormantAnchor = state.entities.get(readout.anchorEntityId === 7 ? 8 : 7);
  assert.equal(poiReadoutForEntity(state, dormantAnchor), null);
  assert.equal(poiReadoutForEntity(state, state.entities.get(state.playerId)), null);
});

test('progress and resolution resync the published readout (fresh rows, not a stale stamp)', () => {
  const { system, state } = makeSystem();
  system.planSector(SECTOR.id, { zones: ZONES, sector: SECTOR, dayIndex: DAY_INDEX });
  const { row, liveZoneId } = liveAndDormant(state);
  const firstReadout = state.world.poiReadouts[liveZoneId];

  const minePos = { x: row.zoneCenter.x, z: row.zoneCenter.z };
  system._interact(liveZoneId, 'mine', { pos: minePos });
  const progressed = state.world.poiReadouts[liveZoneId];
  assert.notEqual(progressed, firstReadout, 'the bag republishes a fresh readout, not a mutation in place');
  assert.equal(progressed.progress, 1);
  assert.equal(progressed.status, 'engaged');

  system._interact(liveZoneId, 'mine', { pos: minePos });
  system._interact(liveZoneId, 'mine', { pos: minePos });
  const resolved = state.world.poiReadouts[liveZoneId];
  assert.equal(resolved.progress, 3);
  assert.equal(resolved.status, 'resolved');
});

test('the local map model carries mapLabel and progress on the live anchor landmark and nothing on the dormant one', () => {
  const { system, state } = makeSystem();
  system.planSector(SECTOR.id, { zones: ZONES, sector: SECTOR, dayIndex: DAY_INDEX });
  const { row, liveZoneId, dormantZoneId } = liveAndDormant(state);
  const readout = state.world.poiReadouts[liveZoneId];
  const liveAnchorId = readout.anchorEntityId;
  const dormantAnchorId = liveAnchorId === 7 ? 8 : 7;

  localMapIntel().restore({});
  localmapScreen._ctx = { state };
  localmapScreen._refreshIntel();

  const player = state.entities.get(state.playerId);
  const map = localMapIntel().buildLocalMap({ player, mode: 'system' });
  const liveLandmark = map.landmarks.find((lm) => lm.id === String(liveAnchorId));
  assert.ok(liveLandmark, 'the anchored station is a map landmark');
  const carried = liveLandmark.metadata && liveLandmark.metadata.poiReadout;
  assert.ok(carried, 'the landmark carries the live readout');
  assert.equal(carried.mapLabel, 'WORKING SEAM');
  assert.equal(carried.progress, 0);
  assert.equal(carried.required, 3);
  assert.equal(carried.zoneId, liveZoneId);
  assert.equal(carried.radarKind, 'mining-field');

  const dormantLandmark = map.landmarks.find((lm) => lm.id === String(dormantAnchorId));
  assert.ok(dormantLandmark, 'the dormant station is still a landmark');
  assert.equal(dormantLandmark.metadata && dormantLandmark.metadata.poiReadout, undefined,
    'a dormant family carries no plan on the map model');

  // Progress is read fresh on each feed: mine once and the model's carried readout advances.
  system._interact(liveZoneId, 'mine', { pos: { x: row.zoneCenter.x, z: row.zoneCenter.z } });
  localmapScreen._refreshIntel();
  const advanced = localMapIntel().buildLocalMap({ player, mode: 'system' });
  const advancedLandmark = advanced.landmarks.find((lm) => lm.id === String(liveAnchorId));
  assert.equal(advancedLandmark.metadata.poiReadout.progress, 1,
    'the map model sees the resynced progress, not the stale stamp');
});

test('the radar census carries radarKind as the blip class with the progress ratio; dormant anchors carry none', () => {
  setRadarContactsStillLayerForBench(true);
  const { system, state } = makeSystem();
  system.planSector(SECTOR.id, { zones: ZONES, sector: SECTOR, dayIndex: DAY_INDEX });
  const { row, liveZoneId, dormantZoneId } = liveAndDormant(state);
  const readout = state.world.poiReadouts[liveZoneId];
  const liveAnchor = state.entities.get(readout.anchorEntityId);
  const dormantAnchor = state.entities.get(readout.anchorEntityId === 7 ? 8 : 7);
  const player = state.entities.get(state.playerId);
  const contacts = [liveAnchor, dormantAnchor];

  system._interact(liveZoneId, 'mine', { pos: { x: row.zoneCenter.x, z: row.zoneCenter.z } });

  const range = 4000;
  const rangeSq = range * range;
  const metrics = tacticalRadarMetrics(false);
  const projectScratch = {
    x: 0, y: 0, dx: 0, dz: 0, distance: 0, offRange: false, angle: 0, scale: 0, resolved: true,
  };
  const hostileMarks = [];
  const infrastructureMarks = [];
  const neutralMarks = [];
  const cache = createRadarContactsStillCache();
  const result = censusRadarContactsStillLayer({
    contacts,
    player,
    playerTeam: 0,
    state,
    range,
    rangeSq,
    metrics,
    targetId: null,
    projectScratch,
    pushHostileMark: (entity, projected, distanceSq) => {
      hostileMarks.push({ entity, x: projected.x, y: projected.y, distanceSq });
    },
    pushInfrastructureMark: (entity, projected, gate, distanceSq, poi) => {
      infrastructureMarks.push({ entity, x: projected.x, y: projected.y, gate, distanceSq, poi });
    },
    pushNeutralMark: (entity, projected, distanceSq, meta) => {
      neutralMarks.push({ entity, x: projected.x, y: projected.y, distanceSq, ...meta });
    },
    hostileMarks,
    infrastructureMarks,
    neutralMarks,
    cache,
  });
  assert.equal(result.skipped, false);

  const liveMark = infrastructureMarks.find((mark) => mark.entity === liveAnchor);
  assert.ok(liveMark, 'the live anchor produces an infrastructure mark');
  assert.ok(liveMark.poi, 'the mark carries the readout');
  assert.equal(liveMark.poi.radarKind, 'mining-field', 'radarKind is the blip class');
  assert.equal(liveMark.poi.progress, 1);
  assert.equal(liveMark.poi.required, 3);
  assert.equal(liveMark.poi.zoneId, liveZoneId);

  const dormantMark = infrastructureMarks.find((mark) => mark.entity === dormantAnchor);
  assert.ok(dormantMark, 'the dormant station still marks as infrastructure');
  assert.equal(dormantMark.poi, null, 'a dormant family carries no blip class');
});
