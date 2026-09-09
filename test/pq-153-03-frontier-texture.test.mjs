// PQ-153.03 — the frontier as texture. Fourteen live frontier sectors, one
// memorable object each, rumours without a story promise. Seed 15330.
// Does not invent sectors. Does not retune the six. Does not invent hazard
// type `radiation`.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkAtlasIntegrity } from '../scripts/check-atlas-integrity.mjs';
import { buildAtlasIndex } from '../src/core/atlasIndex.js';
import { createGameState } from '../src/core/gameState.js';
import {
  FRONTIER_SECTOR_IDS,
  FRONTIER_SECTORS,
} from '../src/data/frontierRegions/index.js';
import {
  FRONTIER_RUMOR_DAY_SECONDS,
  FRONTIER_RUMOR_KINDS,
  frontierRumorOffer,
} from '../src/data/frontierRumors.js';
import { STORY_BEATS } from '../src/data/missions.js';
import { SECTORS } from '../src/data/sectors.js';

const SEED = 15330;
const EXPECTED_FRONTIER_COUNT = 14;
const MEMORABLE_TYPES = new Set(['wreck', 'beacon', 'derelict', 'anomaly', 'cache']);
const STORY_PROMISE = /\b(quest|destiny|prophecy|campaign|story beat|you must|you will find the|promised)\b/i;
const RUMOR_KIND_IDS = new Set(FRONTIER_RUMOR_KINDS.map((row) => row.id));
const STORY_BEAT_IDS = new Set(STORY_BEATS.map((row) => row.id));

const WEST_SRC = join(dirname(fileURLToPath(import.meta.url)), '../src/data/frontierRegions/west.js');
const NORTH_SRC = join(dirname(fileURLToPath(import.meta.url)), '../src/data/frontierRegions/north.js');

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));
const LIVE_FRONTIER = FRONTIER_SECTOR_IDS.map((id) => SECTOR_BY_ID.get(id));

function finitePoint(value) {
  return !!(value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.z)));
}

function memorableRank(poi) {
  let rank = 0;
  if (poi.landmark) rank += 8;
  if (poi.discoveryPlate) rank += 6;
  if (poi.flavorTargetRef || poi.flavorSourceId) rank += 4;
  if (poi.type === 'wreck' || poi.type === 'derelict' || poi.type === 'anomaly') rank += 2;
  if (poi.type === 'beacon') rank += 1;
  return rank;
}

/** One texture one-off: a named, placed POI/wreck/beacon, not a colour grade. */
export function pickMemorableObject(sector) {
  const candidates = (sector.pois || []).filter((poi) => (
    poi
    && typeof poi.id === 'string'
    && typeof poi.name === 'string'
    && poi.name.trim().length > 2
    && MEMORABLE_TYPES.has(poi.type)
    && finitePoint(poi.pos)
  ));
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => memorableRank(b) - memorableRank(a) || a.id.localeCompare(b.id))[0];
}

function bareState(seed = SEED) {
  const state = createGameState(seed);
  state.player.credits = 20_000;
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, { ...sector, owner: sector.factionId }]));
  state.world.discovery = {};
  return state;
}

function frontierStations() {
  return LIVE_FRONTIER.flatMap((sector) => (sector.stations || []).map((station) => ({
    stationId: station.id,
    sectorId: sector.id,
  })));
}

function offersOnSeed(seed = SEED, days = 8) {
  const state = bareState(seed);
  const rows = [];
  for (let day = 0; day < days; day++) {
    state.simTime = day * FRONTIER_RUMOR_DAY_SECONDS;
    for (const { stationId } of frontierStations()) {
      const offer = frontierRumorOffer(state, stationId);
      if (offer) rows.push(offer);
    }
  }
  return rows;
}

test('PQ-153.03: fourteen frontier sectors are live on the atlas, not a parked pack', () => {
  assert.equal(FRONTIER_SECTOR_IDS.length, EXPECTED_FRONTIER_COUNT);
  assert.equal(FRONTIER_SECTORS.length, EXPECTED_FRONTIER_COUNT);
  assert.equal(LIVE_FRONTIER.filter(Boolean).length, EXPECTED_FRONTIER_COUNT);
  assert.equal(new Set(FRONTIER_SECTOR_IDS).size, EXPECTED_FRONTIER_COUNT);

  const atlas = buildAtlasIndex();
  for (const id of FRONTIER_SECTOR_IDS) {
    const sector = SECTOR_BY_ID.get(id);
    assert.ok(sector, `live SECTORS missing ${id}`);
    assert.ok((sector.stations || []).length >= 1, `${id} needs a station`);
    const node = atlas.getNode(id);
    assert.ok(node, `atlas missing sector node ${id}`);
    assert.equal(node.kind, 'sector');
    assert.equal(node.hasPosition, true, `${id} has no atlas position`);
    assert.ok(finitePoint(node.globalPos), `${id} atlas globalPos missing`);
  }
});

test('PQ-153.03: each frontier sector has one memorable object that charts', () => {
  const atlas = buildAtlasIndex();
  const missing = [];
  const objects = [];
  for (const sector of LIVE_FRONTIER) {
    const object = pickMemorableObject(sector);
    if (!object) {
      missing.push(sector.id);
      continue;
    }
    const node = atlas.getNode(object.id);
    assert.ok(node, `${sector.id} object ${object.id} did not chart`);
    assert.equal(node.kind, 'poi');
    assert.equal(node.sectorId, sector.id);
    assert.equal(node.hasPosition, true, `${object.id} atlas position missing`);
    assert.ok(finitePoint(node.globalPos), `${object.id} atlas globalPos missing`);
    objects.push({
      sectorId: sector.id,
      name: sector.name,
      objectId: object.id,
      objectName: object.name,
      type: object.type,
    });
  }
  assert.deepEqual(missing, [], 'every frontier sector needs one POI / wreck / beacon');
  assert.equal(objects.length, EXPECTED_FRONTIER_COUNT);
  console.log(JSON.stringify({ seed: SEED, frontierCount: EXPECTED_FRONTIER_COUNT, objects }, null, 2));
});

test('PQ-153.03: rumours fire on seed 15330 without a story promise', () => {
  const rows = offersOnSeed(SEED, 8);
  assert.ok(rows.length >= FRONTIER_SECTOR_IDS.length, `frontier bars should speak; got ${rows.length} cards`);

  const stationsWithOffer = new Set(rows.map((row) => row.sourceStationId));
  for (const { stationId } of frontierStations()) {
    assert.ok(stationsWithOffer.has(stationId), `${stationId} sold no rumour on seed ${SEED}`);
  }

  const frontierTargets = new Set();
  for (const offer of rows) {
    assert.ok(RUMOR_KIND_IDS.has(offer.kind), `${offer.id} invented a rumour kind`);
    assert.equal(Object.hasOwn(offer, 'targetPos'), false, `${offer.id} must not expose a waypoint`);
    assert.equal(offer.missionId, undefined);
    assert.equal(offer.beat, undefined);
    assert.equal(offer.questId, undefined);
    assert.ok(!STORY_BEAT_IDS.has(offer.kind));
    assert.ok(!STORY_BEAT_IDS.has(offer.id));
    assert.ok(!STORY_PROMISE.test(offer.text || ''), `${offer.id} promises a story: ${offer.text}`);
    assert.ok(Number.isFinite(offer.bearingCenter.x) && Number.isFinite(offer.bearingCenter.z));
    assert.ok(offer.radius >= 360);
    assert.ok(SECTOR_BY_ID.has(offer.sectorId), `${offer.id} names an unknown sector`);
    if (FRONTIER_SECTOR_IDS.includes(offer.sectorId)) frontierTargets.add(offer.sectorId);
  }

  assert.ok(frontierTargets.size >= 1, 'at least one card must name a frontier sector, not only the core');

  const repeat = bareState(SEED);
  const firstStation = frontierStations()[0].stationId;
  assert.deepEqual(
    frontierRumorOffer(repeat, firstStation),
    frontierRumorOffer(bareState(SEED), firstStation),
    'same seed, station, and simTime must reprint the same card',
  );
});

test('PQ-153.03: atlas integrity is green and the west "not merged" comment is stale', () => {
  const result = checkAtlasIntegrity();
  const failed = result.checks.filter((row) => !row.pass).map((row) => `${row.name}: ${(row.details || []).join('; ')}`);
  assert.deepEqual(failed, []);
  assert.equal(result.pass, true);

  const west = readFileSync(WEST_SRC, 'utf8');
  const north = readFileSync(NORTH_SRC, 'utf8');
  assert.match(west, /Not yet merged into/);
  assert.match(north, /Not wired into live SECTORS/);
  for (const id of ['sector_nyx_march', 'sector_hyperion_cut', 'sector_rhea_cinder']) {
    assert.ok(SECTOR_BY_ID.has(id), `${id} is already live; the pack comment is a stale lie`);
  }
});
