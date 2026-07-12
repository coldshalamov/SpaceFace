#!/usr/bin/env node
// Contract check: layered spatial hash must keep stamp dedupe, active buckets, and perf diagnostics.
// Prevents regressions to legacy string-key cells or per-query Set allocation.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpatialHash } from '../src/core/spatialHash.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE_PATH = join(ROOT, 'src', 'core', 'spatialHash.js');
const source = readFileSync(SOURCE_PATH, 'utf8');

function extractMethodBody(name) {
  const pattern = new RegExp(`\\b${name}\\s*\\([^)]*\\)\\s*\\{`);
  const start = source.search(pattern);
  assert.ok(start >= 0, `${name}() should exist in spatialHash.js`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(brace, i + 1);
    }
  }
  assert.fail(`${name}() body should close`);
}

assert.match(source, /export class SpatialHash\b/, 'SpatialHash class should be exported');
assert.match(source, /\brebuildLayers\s*\(/, 'rebuildLayers() should exist');
assert.match(source, /this\._staticBuckets/, '_staticBuckets static layer should exist');
assert.match(source, /this\.buckets/, 'dynamic buckets layer should exist');
assert.match(source, /this\._seenIds/, '_seenIds stamp map should exist');
assert.match(source, /this\._queryStamp/, '_queryStamp stamp counter should exist');
assert.match(source, /this\._activeBuckets/, '_activeBuckets active-cell tracking should exist');
assert.match(source, /this\._staticActiveBuckets/, '_staticActiveBuckets active-cell tracking should exist');

const diagnosticsBlock = source.match(/this\.diagnostics\s*=\s*\{[\s\S]*?\};/);
assert.ok(diagnosticsBlock, 'diagnostics object should be initialized on SpatialHash');
for (const key of ['rebuilds', 'dynamicRebuilds', 'queries', 'candidates']) {
  assert.match(diagnosticsBlock[0], new RegExp(`\\b${key}\\b`), `diagnostics.${key} should exist`);
}

assert.match(
  source,
  /queryRadius\s*\([^)]*\bout\s*=\s*\[\]/,
  'queryRadius() should accept a reusable out array',
);
const queryBody = extractMethodBody('queryRadius');
assert.doesNotMatch(queryBody, /new\s+Set\s*\(/, 'queryRadius() must not allocate new Set per query');

assert.doesNotMatch(
  source,
  /cx\s*\+\s*['"],\s*['"]\s*\+\s*cz/,
  'spatial hash must not use legacy string-concat cell keys',
);

function makeEntity(id, x, z, radius = 8) {
  return { id, alive: true, collides: true, radius, pos: { x, y: 0, z } };
}

const hash = new SpatialHash(64);
const staticEntities = [makeEntity('static-rock', 0, 0, 48)];
const dynamicEntities = [
  makeEntity('ship-a', 96, 96, 12),
  makeEntity('ship-b', 100, 100, 12),
];
hash.rebuildLayers(staticEntities, dynamicEntities, 1);

const out = [];
hash.queryRadius(0, 0, 64, out);
assert.equal(out.filter((e) => e.id === 'static-rock').length, 1,
  'stamp dedupe should return a multi-cell static entity once');

const outReuse = out;
outReuse.length = 0;
hash.queryRadius(96, 96, 20, outReuse);
const ids = outReuse.map((e) => e.id).sort();
assert.deepEqual(ids, ['ship-a', 'ship-b'], 'radius query should collect dynamic entities into provided out array');

assert.equal(hash.diagnostics.rebuilds, 1, 'static layer rebuild should increment diagnostics.rebuilds');
assert.equal(hash.diagnostics.dynamicRebuilds, 1, 'dynamic layer rebuild should increment diagnostics.dynamicRebuilds');
assert.equal(hash.diagnostics.queries, 2, 'queries should increment per queryRadius call');
assert.ok(hash.diagnostics.candidates > 0, 'candidates should increment from bucket visits');

let flushCalls = 0;
const perfSink = {
  recorded: null,
  recordSpatialHash(pending) {
    flushCalls++;
    this.recorded = { ...pending };
  },
};
hash.flushPerfCounters(perfSink);
assert.equal(flushCalls, 1, 'flushPerfCounters should forward pending counters to perfRuntime once');
assert.equal(perfSink.recorded.queries, 2, 'flush should include pending query count');
hash.flushPerfCounters(perfSink);
assert.equal(flushCalls, 1, 'flush after drain should not re-emit empty pending counters');

const queriesBefore = hash.diagnostics.queries;
hash.queryRadius(0, 0, 8, outReuse, { countDiagnostics: false });
assert.equal(hash.diagnostics.queries, queriesBefore,
  'countDiagnostics:false should skip query diagnostics increment');

function assertBatchMatchesScalar(requests, message) {
  const scalar = requests.map((request) => {
    const result = [];
    hash.queryRadius(request.x, request.z, request.r, result, { countDiagnostics: false });
    return result.map((entity) => entity.id);
  });
  const before = hash.diagnostics.queries;
  const batch = requests.map((request) => ({ ...request, out: [] }));
  hash.queryRadiusBatch(batch);
  assert.equal(hash.diagnostics.queries, before + 1, `${message}: batch should count one physical query`);
  assert.deepEqual(batch.map((request) => request.out.map((entity) => entity.id)), scalar,
    `${message}: batch candidate ordering must exactly match independent scalar queries`);
}

assertBatchMatchesScalar([
  { x: 0, z: 0, r: 1400 },
  { x: 96, z: 96, r: 1400 },
  { x: -128, z: 64, r: 1400 },
], 'active-bucket scan');
assertBatchMatchesScalar([
  { x: 0, z: 0, r: 8 },
  { x: 96, z: 96, r: 16 },
  { x: 128, z: 128, r: 4 },
], 'rectangular scan');

console.log('Spatial hash contract OK');
