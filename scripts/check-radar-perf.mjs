import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { SpatialHash } from '../src/core/spatialHash.js';

const radarSource = readFileSync('src/ui/radar.js', 'utf8');
const coreSource = readFileSync('src/core/coreSystem.js', 'utf8');

const requiredRadarFeatures = [
  ['DPI-scaled canvas', 'devicePixelRatio'],
  ['expanded tactical radar', 'sf-radar--expanded'],
  ['legend', 'sf-radar-legend'],
  ['station and gate blips', "type === 'station'"],
  ['pickup blips', "type === 'pickup'"],
  ['asteroid blips', 'drawAsteroidBlip'],
  ['ship colorblind shapes', 'semanticShape'],
  ['lead marker', 'solveIntercept'],
  ['objective waypoint marker', 'state.nav'],
  ['motion trails', 'drawTrail'],
  ['off-range chevrons', 'hollow chevron'],
  ['bounded trail sampling', 'MAX_TRAIL_UPDATES'],
  ['spatial asteroid pass', 'nearbyAsteroidCandidates'],
  ['adaptive spatial fallback', 'RADAR_QUERY_VISIT_RATIO_LIMIT'],
  ['small-field full-scan fallback', 'RADAR_SPATIAL_MIN_ASTEROIDS'],
  ['indexed contact buckets', 'indexedRadarContacts'],
  ['radar contact index consumption', 'index.radarContacts'],
];

for (const [label, snippet] of requiredRadarFeatures) {
  assert.ok(radarSource.includes(snippet), `radar quality/perf feature missing: ${label}`);
}

const forbiddenQualityShortcuts = [
  ['render-scale edits', /settings\.video|renderScale|pixelRatioCap/],
  ['bloom disable', /bloom\s*=\s*false|bloom:\s*false/],
  ['particle-quality downgrade', /particleQuality\s*=\s*['"]low|particleQuality:\s*['"]low/],
  ['radar-rate throttle below HUD contract', /radarTick\s*=|setInterval|requestAnimationFrame/],
];

for (const [label, pattern] of forbiddenQualityShortcuts) {
  assert.ok(!pattern.test(radarSource), `quality-reduction shortcut detected in radar.js: ${label}`);
}

assert.match(
  radarSource,
  /estimatedVisits\s*>\s*asteroidCount\s*\*\s*RADAR_QUERY_VISIT_RATIO_LIMIT/,
  'radar must fall back to full asteroid scan when spatial-query visit cost is too high',
);
assert.match(
  radarSource,
  /asteroidCount\s*<\s*RADAR_SPATIAL_MIN_ASTEROIDS/,
  'radar must use the cheap full-scan path for small asteroid fields',
);
assert.match(
  radarSource,
  /function\s+contactsFor[\s\S]*index\.radarContacts/,
  'radar contacts should come from the core entity index when available',
);
assert.match(
  radarSource,
  /function\s+asteroidsFor[\s\S]*index\.radarAsteroids/,
  'radar asteroid contacts should come from the core entity index when available',
);
assert.match(coreSource, /radarContacts:\s*\[\]/, 'core entity index should expose radarContacts');
assert.match(coreSource, /radarAsteroids:\s*\[\]/, 'core entity index should expose radarAsteroids');

const FIELD_SIDE = 60;
const SPACING = 520;
const QUERY_RANGE = 1400;
const QUERY_PAD = 32;
const entities = [];
const asteroids = [];
let id = 1;

for (let ix = 0; ix < FIELD_SIDE; ix++) {
  for (let iz = 0; iz < FIELD_SIDE; iz++) {
    const e = entity(id++, 'asteroid', (ix - FIELD_SIDE / 2) * SPACING, (iz - FIELD_SIDE / 2) * SPACING, 18 + ((ix + iz) % 5));
    entities.push(e);
    asteroids.push(e);
  }
}

for (let i = 0; i < 80; i++) {
  const angle = i * 0.71;
  const dist = 900 + i * 170;
  entities.push(entity(id++, i % 3 === 0 ? 'station' : 'ship', Math.cos(angle) * dist, Math.sin(angle) * dist, i % 3 === 0 ? 70 : 12));
}

const hash = new SpatialHash(64);
hash.rebuild(entities);
assert.ok(hash.diagnostics.activeBuckets > 0, 'synthetic field should populate the spatial hash');

const center = { x: 0, z: 0 };
const expectedAsteroidIds = fullScanAsteroidIds(center.x, center.z, QUERY_RANGE);
const beforeQueries = hash.diagnostics.queries;
const candidateScratch = [];
hash.queryRadius(center.x, center.z, QUERY_RANGE + QUERY_PAD, candidateScratch, { countDiagnostics: false });
assert.equal(hash.diagnostics.queries, beforeQueries, 'radar no-diagnostics query should not pollute sim perf counters');

const spatialAsteroidIds = candidateScratch
  .filter((e) => e.type === 'asteroid' && within(e, center.x, center.z, QUERY_RANGE))
  .map((e) => e.id)
  .sort((a, b) => a - b);
assert.deepEqual(spatialAsteroidIds, expectedAsteroidIds, 'spatial radar asteroid query must match precise full scan');
assert.ok(candidateScratch.length < entities.length * 0.2, `spatial query should inspect a bounded subset (${candidateScratch.length}/${entities.length})`);

const diagnosticsCheck = [];
hash.queryRadius(center.x, center.z, QUERY_RANGE + QUERY_PAD, diagnosticsCheck);
assert.equal(hash.diagnostics.queries, beforeQueries + 1, 'normal spatial hash queries should still count diagnostics');

const sparseBranch = checkSparseLargeRadiusBranch();
const denseAdaptivePath = radarAdaptivePath(hash, center.x, center.z, QUERY_RANGE, asteroids.length);
assert.equal(denseAdaptivePath.path, 'full-scan', 'dense radar field should avoid spatial hash when query cell visits are too high');

const fullScanMs = measure(() => {
  fullScanAsteroidIds(center.x, center.z, QUERY_RANGE);
}, 160);
const spatialScanMs = measure(() => {
  candidateScratch.length = 0;
  hash.queryRadius(center.x, center.z, QUERY_RANGE + QUERY_PAD, candidateScratch, { countDiagnostics: false });
  let count = 0;
  for (let i = 0; i < candidateScratch.length; i++) {
    const e = candidateScratch[i];
    if (e.type === 'asteroid' && within(e, center.x, center.z, QUERY_RANGE)) count++;
  }
  assert.equal(count, expectedAsteroidIds.length);
}, 160);

const summary = {
  pass: true,
  entities: entities.length,
  asteroids: asteroids.length,
  activeBuckets: hash.diagnostics.activeBuckets,
  inRangeAsteroids: expectedAsteroidIds.length,
  spatialCandidates: candidateScratch.length,
  candidateReductionPct: Number((100 - (candidateScratch.length / entities.length) * 100).toFixed(2)),
  sparseLargeRadius: sparseBranch,
  denseAdaptivePath,
  fullScanMs: Number(fullScanMs.toFixed(3)),
  spatialScanMs: Number(spatialScanMs.toFixed(3)),
  qualityFeatureChecks: requiredRadarFeatures.length,
  qualityShortcutChecks: forbiddenQualityShortcuts.length,
};

console.log(JSON.stringify(summary, null, 2));

function entity(id, type, x, z, radius) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    pos: { x, z },
    radius,
  };
}

function fullScanAsteroidIds(x, z, range) {
  return asteroids
    .filter((e) => within(e, x, z, range))
    .map((e) => e.id)
    .sort((a, b) => a - b);
}

function within(e, x, z, range) {
  const dx = e.pos.x - x;
  const dz = e.pos.z - z;
  return dx * dx + dz * dz <= range * range;
}

function measure(fn, iterations) {
  for (let i = 0; i < 10; i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return performance.now() - start;
}

function checkSparseLargeRadiusBranch() {
  const sparseEntities = [];
  const sparseAsteroids = [];
  let sparseId = 100000;
  for (let ix = 0; ix < 24; ix++) {
    for (let iz = 0; iz < 16; iz++) {
      const e = entity(sparseId++, 'asteroid', (ix - 12) * 1200, (iz - 8) * 1200, 16);
      sparseEntities.push(e);
      sparseAsteroids.push(e);
    }
  }
  const sparseHash = new SpatialHash(64);
  sparseHash.rebuild(sparseEntities);
  const range = 6200;
  const x0 = Math.floor((-range) / sparseHash.cell);
  const x1 = Math.floor((range) / sparseHash.cell);
  const z0 = Math.floor((-range) / sparseHash.cell);
  const z1 = Math.floor((range) / sparseHash.cell);
  const rectangularVisits = (x1 - x0 + 1) * (z1 - z0 + 1);
  assert.ok(rectangularVisits > sparseHash._activeBuckets.length * 3, 'sparse large-radius query should exercise active-cell scan branch');

  const out = [];
  sparseHash.queryRadius(0, 0, range + QUERY_PAD, out, { countDiagnostics: false });
  const expectedIds = sparseAsteroids
    .filter((e) => within(e, 0, 0, range))
    .map((e) => e.id)
    .sort((a, b) => a - b);
  const actualIds = out
    .filter((e) => within(e, 0, 0, range))
    .map((e) => e.id)
    .sort((a, b) => a - b);
  assert.deepEqual(actualIds, expectedIds, 'active-cell scan branch must match precise full scan');
  return {
    entities: sparseEntities.length,
    activeBuckets: sparseHash._activeBuckets.length,
    rectangularVisits,
    candidates: out.length,
    inRangeAsteroids: expectedIds.length,
  };
}

function radarAdaptivePath(hash, x, z, range, asteroidCount) {
  const minAsteroids = sourceNumber('RADAR_SPATIAL_MIN_ASTEROIDS');
  const visitRatioLimit = sourceNumber('RADAR_QUERY_VISIT_RATIO_LIMIT');
  const queryPad = sourceNumber('RADAR_QUERY_RADIUS_PAD');
  if (asteroidCount < minAsteroids) return { path: 'full-scan', reason: 'small-field' };
  const queryRadius = range + queryPad;
  const cell = Math.max(1, hash.cell || 64);
  const x0 = Math.floor((x - queryRadius) / cell);
  const x1 = Math.floor((x + queryRadius) / cell);
  const z0 = Math.floor((z - queryRadius) / cell);
  const z1 = Math.floor((z + queryRadius) / cell);
  const rectangularVisits = (x1 - x0 + 1) * (z1 - z0 + 1);
  const activeBuckets = hash.diagnostics.activeBuckets || 0;
  const estimatedVisits = rectangularVisits > activeBuckets * 3 ? activeBuckets : rectangularVisits;
  const visitRatio = estimatedVisits / Math.max(1, asteroidCount);
  return {
    path: visitRatio > visitRatioLimit ? 'full-scan' : 'spatial',
    estimatedVisits,
    asteroidCount,
    visitRatio: Number(visitRatio.toFixed(3)),
    visitRatioLimit,
  };
}

function sourceNumber(name) {
  const match = radarSource.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  assert.ok(match, `radar constant missing: ${name}`);
  return Number(match[1]);
}
