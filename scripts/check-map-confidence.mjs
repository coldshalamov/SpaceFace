#!/usr/bin/env node
// BP-03.1 map_confidence_not_fog verification.
//
// Guards the pure galaxy/system map model confidence field. The map now reports
// how much to trust a sector record without adding a second overlay or feeding
// confidence back into sectorSim/economy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildGalaxyModel,
  buildSystemModel,
  mapConfidenceForSector,
  MAP_CONFIDENCE_STALE_DAYS,
} from '../src/ui/galaxyMap.js';

let sections = 0;

function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function sector(id, extra = {}) {
  return {
    id,
    name: id,
    position: { x: 0, y: 0 },
    neighbors: [],
    charted: false,
    ...extra,
  };
}

function stateFixture() {
  return {
    world: {
      currentSectorId: 'sector_live',
      discovery: {
        sector_live: { discovered: true, visitedCount: 3, lastVisitedEpochDays: 12 },
        sector_known: { discovered: true, visitedCount: 1, lastVisitedEpochDays: 10 },
        sector_stale: { discovered: true, visitedCount: 1, lastVisitedEpochDays: 1 },
        sector_surveyed: { discovered: true, source: 'survey', surveyedEpochDays: 8 },
        sector_rumored: { discovered: false, visitedCount: 0 },
      },
    },
    sectorSim: { field: { epochDays: 12, nodes: {} } },
    content: {
      sectors: [
        sector('sector_live', { charted: true, position: { x: 0, y: 0 }, neighbors: ['sector_known'] }),
        sector('sector_known', { position: { x: 1, y: 0 }, neighbors: ['sector_live', 'sector_stale'] }),
        sector('sector_stale', { position: { x: 2, y: 0 }, neighbors: ['sector_known'] }),
        sector('sector_surveyed', { position: { x: 3, y: 0 }, neighbors: [] }),
        sector('sector_rumored', { position: { x: 4, y: 0 }, neighbors: [] }),
      ],
    },
  };
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in map confidence path'); };
  Date.now = () => { throw new Error('Date.now in map confidence path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testPureConfidenceReader);
guarded(testGalaxyAndSystemModels);
testRuntimeScope();

console.log(`[check-map-confidence] PASS - ${sections} sections green`);

function testPureConfidenceReader() {
  const state = stateFixture();
  const records = Object.fromEntries(state.content.sectors.map((s) => [s.id, s]));

  assert.equal(MAP_CONFIDENCE_STALE_DAYS, 7, 'stale threshold stays at the packet contract value');
  assert.deepEqual(mapConfidenceForSector(state, records.sector_live), {
    confidence: 'live',
    confidenceAgeDays: 0,
    lastSeenEpochDays: 12,
  }, 'current sector is live confidence');
  assert.deepEqual(mapConfidenceForSector(state, records.sector_known), {
    confidence: 'known',
    confidenceAgeDays: 2,
    lastSeenEpochDays: 10,
  }, 'recent discovered sector is known confidence');
  assert.deepEqual(mapConfidenceForSector(state, records.sector_stale), {
    confidence: 'stale',
    confidenceAgeDays: 11,
    lastSeenEpochDays: 1,
  }, 'old discovered sector is stale confidence');
  assert.deepEqual(mapConfidenceForSector(state, records.sector_surveyed), {
    confidence: 'known',
    confidenceAgeDays: 4,
    lastSeenEpochDays: 8,
  }, 'survey data can provide the known epoch without a visit');
  assert.deepEqual(mapConfidenceForSector(state, records.sector_rumored), {
    confidence: 'rumored',
    confidenceAgeDays: null,
    lastSeenEpochDays: null,
  }, 'undiscovered frontier stays rumored/fogged');
  ok('confidence derives only from discovery flags and sectorSim epoch');
}

function testGalaxyAndSystemModels() {
  const state = stateFixture();
  const model = buildGalaxyModel(state);
  const byId = Object.fromEntries(model.nodes.map((node) => [node.id, node]));

  assert.equal(byId.sector_live.confidence, 'live', 'galaxy node carries live confidence');
  assert.equal(byId.sector_known.confidence, 'known', 'galaxy node carries known confidence');
  assert.equal(byId.sector_stale.confidence, 'stale', 'galaxy node carries stale confidence');
  assert.equal(byId.sector_rumored.charted, false, 'rumored sector remains fogged');
  assert.equal(byId.sector_rumored.confidence, 'rumored', 'rumored node does not masquerade as known');
  assert.equal(byId.sector_stale.confidenceAgeDays, 11, 'galaxy node exposes deterministic staleness age');

  const system = buildSystemModel(state, 'sector_stale');
  assert.equal(system.level, 'system', 'system model still builds through the existing pure builder');
  assert.equal(system.confidence, 'stale', 'system model carries the same confidence field');
  assert.equal(system.confidenceAgeDays, 11, 'system confidence age matches galaxy confidence age');
  assert.ok(Array.isArray(system.zones), 'system model shape keeps zones');
  assert.ok(Array.isArray(system.points), 'system model shape keeps points');
  ok('galaxy and system builders expose confidence without a second map path');
}

function testRuntimeScope() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:map-confidence'], 'node scripts/check-map-confidence.mjs',
    'package exposes check:map-confidence');

  const galaxySource = readFileSync(new URL('../src/ui/galaxyMap.js', import.meta.url), 'utf8');
  const sectorSimSource = readFileSync(new URL('../src/systems/sectorSim.js', import.meta.url), 'utf8');
  const economySource = readFileSync(new URL('../src/systems/economy.js', import.meta.url), 'utf8');
  const confidenceBlock = galaxySource.slice(
    galaxySource.indexOf('export const MAP_CONFIDENCE_STALE_DAYS'),
    galaxySource.indexOf('function playerEntity'),
  );
  assert.match(galaxySource, /export function mapConfidenceForSector/,
    'galaxyMap owns the pure confidence derivation');
  assert.match(galaxySource, /confidence: 'rumored'/,
    'uncharted sectors degrade to the existing fog/rumor state');
  assert.doesNotMatch(confidenceBlock, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'map confidence uses no RNG, wall-clock time, or timers');
  assert.doesNotMatch(sectorSimSource, /mapConfidenceForSector|MAP_CONFIDENCE_STALE_DAYS/,
    'sectorSim must not read map confidence back as simulation input');
  assert.doesNotMatch(economySource, /mapConfidenceForSector|MAP_CONFIDENCE_STALE_DAYS/,
    'economy must not read map confidence as price input');
  ok('runtime scope stays pure/read-only and backend-checkable');
}
