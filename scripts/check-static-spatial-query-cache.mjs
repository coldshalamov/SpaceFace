#!/usr/bin/env node
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { SpatialHash } from '../src/core/spatialHash.js';

const BATCHES = 120;
const SENSOR_RANGE = 1600;

class UncachedSpatialHash extends SpatialHash {
  _getStaticQueryCache() { return null; }
  _setStaticQueryCache() {}
}

function entity(id, x, z, radius, type) {
  return { id, alive: true, collides: true, radius, type, pos: { x, y: 0, z } };
}

function fixture() {
  const statics = [];
  let id = 1;
  for (let x = -560; x <= 560; x += 80) {
    for (let z = -560; z <= 560; z += 80) statics.push(entity(id++, x, z, 24, 'asteroid'));
  }
  const dynamics = [];
  for (let i = 0; i < 12; i++) {
    dynamics.push(entity(id++, (i % 4) * 12, Math.floor(i / 4) * 12, 10, 'ship'));
  }
  return { statics, dynamics };
}

function requestsFor(dynamics) {
  return dynamics.map((ship) => ({ x: ship.pos.x, z: ship.pos.z, r: SENSOR_RANGE, out: [] }));
}

function run(HashType, shareResults) {
  const { statics, dynamics } = fixture();
  const hash = new HashType(64);
  hash.rebuildLayers(statics, dynamics, 1);
  let firstResults = null;
  const started = performance.now();
  for (let batch = 0; batch < BATCHES; batch++) {
    const requests = requestsFor(dynamics);
    hash.queryRadiusBatch(requests, shareResults
      ? { shareResults: true, shareSupersetResults: true }
      : null);
    if (batch === 0) firstResults = requests.map((request) => request.out.map((item) => item.id));
  }
  return {
    hash,
    statics,
    dynamics,
    firstResults,
    elapsedMs: performance.now() - started,
    candidates: hash.diagnostics.candidates,
  };
}

const before = run(UncachedSpatialHash, false);
const after = run(SpatialHash, true);

assert.deepEqual(after.firstResults, before.firstResults,
  'cached/shared broadphase must preserve exact candidate ids and ordering for every sensor');
assert.ok(after.candidates <= before.candidates * 0.05,
  `candidate visits should fall by at least 95% (${before.candidates} -> ${after.candidates})`);
assert.equal(after.hash.diagnostics.staticQueryCacheMisses, 1,
  'identical formation footprints should populate one static cache entry');
assert.equal(after.hash.diagnostics.staticQueryCacheHits, BATCHES - 1,
  'later formation batches should reuse the stable static candidate list');

// Shared outputs are explicitly immutable: one sensor consumer cannot corrupt another's list.
{
  const requests = requestsFor(after.dynamics);
  after.hash.queryRadiusBatch(requests, { shareResults: true, shareSupersetResults: true });
  assert.equal(requests.every((request) => request.out === requests[0].out), true,
    'identical cell footprints should share one candidate array');
  assert.equal(Object.isFrozen(requests[0].out), true, 'shared candidate array must be immutable');
  assert.throws(() => requests[0].out.pop(), TypeError,
    'consumer mutation of shared candidates must fail closed');
}

// A formation spread across different cells may share one active-bucket superset because exact
// sensor circles are applied afterwards. Final in-range ids and ordering must remain identical.
{
  const { statics, dynamics } = fixture();
  for (let i = 0; i < dynamics.length; i++) {
    dynamics[i].pos.x = (i % 4) * 140;
    dynamics[i].pos.z = Math.floor(i / 4) * 140;
  }
  const baseline = new UncachedSpatialHash(64);
  const optimized = new SpatialHash(64);
  baseline.rebuildLayers(statics, dynamics, 1);
  optimized.rebuildLayers(statics, dynamics, 1);
  const beforeRequests = requestsFor(dynamics);
  const afterRequests = requestsFor(dynamics);
  baseline.queryRadiusBatch(beforeRequests);
  optimized.queryRadiusBatch(afterRequests, { shareResults: true, shareSupersetResults: true });
  const exactIds = (request) => request.out.filter((item) => {
    const dx = item.pos.x - request.x;
    const dz = item.pos.z - request.z;
    return dx * dx + dz * dz <= request.r * request.r;
  }).map((item) => item.id);
  assert.deepEqual(afterRequests.map(exactIds), beforeRequests.map(exactIds),
    'union broadphase superset must preserve exact per-sensor candidates and ordering');
  assert.equal(afterRequests.every((request) => request.out === afterRequests[0].out), true,
    'large active-bucket sensor footprints should share one immutable union result');
}

// Dynamic membership is always live even when the static result remains cached.
{
  const moving = after.dynamics[0];
  const oldX = moving.pos.x;
  moving.pos.x = 4000;
  after.hash.rebuildLayers(after.statics, after.dynamics, 1);
  const out = [];
  after.hash.queryRadius(0, 0, 200, out, { countDiagnostics: false });
  assert.equal(out.includes(moving), false, 'dynamic entity leaving the footprint must not survive via cache');
  moving.pos.x = oldX;
}

// A static-version change invalidates cached buckets and cannot leak stale static entities.
{
  const stale = after.statics[0];
  const replacement = entity('replacement-static', 0, 0, 16, 'asteroid');
  after.hash.rebuildLayers([replacement], after.dynamics, 2);
  assert.equal(after.hash.diagnostics.staticQueryCacheEntries, 0,
    'static-version rebuild must clear the cached query index');
  const out = [];
  after.hash.queryRadius(0, 0, 100, out, { countDiagnostics: false });
  assert.equal(out.includes(stale), false, 'stale static collider must not remain reachable');
  assert.equal(out.includes(replacement), true, 'replacement static collider must be reachable');
}

const reductionPct = (1 - after.candidates / before.candidates) * 100;
console.log(JSON.stringify({
  ok: true,
  fixture: { staticEntities: before.statics.length, dynamicEntities: before.dynamics.length, batches: BATCHES },
  before: { candidates: before.candidates, elapsedMs: Number(before.elapsedMs.toFixed(3)) },
  after: { candidates: after.candidates, elapsedMs: Number(after.elapsedMs.toFixed(3)) },
  candidateReductionPct: Number(reductionPct.toFixed(2)),
  outputParity: true,
  sharedResultsFrozen: true,
  dynamicInvalidation: true,
  staticVersionInvalidation: true,
}, null, 2));
