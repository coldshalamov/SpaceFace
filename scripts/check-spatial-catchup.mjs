#!/usr/bin/env node
// Focused regression: incremental dynamic spatial rehash + fixed-step catch-up accounting.
// Covers unchanged-cell, boundary crossing, radius changes, removal/reuse, brute-force
// query equivalence, deterministic membership sets, and backlog shed accounting.
// Does not require New Game boot or browser.

import assert from 'node:assert/strict';
import { SpatialHash } from '../src/core/spatialHash.js';
import { advanceFixedTimestep, LOOP_FIXED_DT, MAX_CATCHUP_STEPS } from '../src/core/loop.js';
import { ensurePerfRuntime } from '../src/core/perfRuntime.js';

function makeEntity(id, x, z, radius = 8) {
  return { id, alive: true, collides: true, radius, pos: { x, y: 0, z } };
}

function idsOf(list) {
  return list.map((e) => e.id).sort();
}

function bruteForceRadius(entities, x, z, r) {
  const out = [];
  const r2 = r * r;
  for (const e of entities) {
    if (!e.alive || !e.collides || !e.pos) continue;
    // Match broadphase cell coverage: entity is a candidate if its cell span overlaps
    // the query cells. For equivalence we also require circle-circle potential:
    // (pos distance) <= r + entity.radius — same as physics narrowphase filter gate.
    const dx = e.pos.x - x;
    const dz = e.pos.z - z;
    const lim = r + (e.radius || 0);
    if (dx * dx + dz * dz <= lim * lim) out.push(e);
  }
  return out;
}

function queryIds(hash, x, z, r) {
  const out = [];
  hash.queryRadius(x, z, r, out, { countDiagnostics: false });
  return idsOf(out);
}

// --- 1. Unchanged cell: no reinsert work ---
{
  const hash = new SpatialHash(64);
  // Place well inside a single cell (cell size 64, radius 12 → [32±12] stays in cell 0).
  const dynamics = [
    makeEntity('a', 32, 32, 12),
    makeEntity('b', 40, 40, 12),
  ];
  hash.rebuildLayers([], dynamics, 1);
  const reinsertsAfterBuild = hash.diagnostics.dynamicReinserts;
  const rebuilds = hash.diagnostics.dynamicRebuilds;

  // Nudge within the same cell coverage.
  dynamics[0].pos.x = 36;
  dynamics[0].pos.z = 30;
  dynamics[1].pos.x = 42;
  dynamics[1].pos.z = 38;
  hash.rebuildLayers([], dynamics, 1);

  assert.equal(hash.diagnostics.dynamicRebuilds, rebuilds + 1,
    'each dynamic sync pass still increments dynamicRebuilds (compat counter)');
  assert.equal(hash.diagnostics.dynamicReinserts, reinsertsAfterBuild,
    'unchanged cell coverage must not reinsert entities');
  assert.ok(hash.diagnostics.dynamicUnchanged >= 2,
    'unchanged-cell entities should count as dynamicUnchanged');
  assert.deepEqual(queryIds(hash, 36, 36, 40), ['a', 'b'],
    'live positions remain queryable without reinsert');
}

// --- 2. Boundary crossing: reinsert only the mover ---
{
  const hash = new SpatialHash(64);
  const stay = makeEntity('stay', 8, 8, 8);
  const move = makeEntity('move', 8, 8, 8);
  hash.rebuildLayers([], [stay, move], 1);
  const baseRe = hash.diagnostics.dynamicReinserts;

  move.pos.x = 200; // crosses multiple cells
  move.pos.z = 200;
  hash.rebuildLayers([], [stay, move], 1);

  const delta = hash.diagnostics.dynamicReinserts - baseRe;
  assert.equal(delta, 1, 'only the boundary-crossing entity should reinsert');
  assert.deepEqual(queryIds(hash, 200, 200, 16), ['move']);
  assert.deepEqual(queryIds(hash, 8, 8, 16), ['stay']);
  assert.ok(!queryIds(hash, 8, 8, 16).includes('move'),
    'mover must leave old cells (no stale membership)');
}

// --- 3. Radius change invalidates coverage ---
{
  const hash = new SpatialHash(64);
  const e = makeEntity('rad', 0, 0, 4);
  hash.rebuildLayers([], [e], 1);
  const baseRe = hash.diagnostics.dynamicReinserts;

  e.radius = 80; // multi-cell coverage
  hash.rebuildLayers([], [e], 1);
  assert.equal(hash.diagnostics.dynamicReinserts - baseRe, 1,
    'radius change must reinsert');

  // Far cell should now see the expanded entity via broadphase query.
  const out = [];
  hash.queryRadius(70, 0, 8, out, { countDiagnostics: false });
  assert.ok(out.some((x) => x.id === 'rad'),
    'expanded radius must cover additional cells');
}

// --- 4. Removal + id reuse must not leave stale membership ---
{
  const hash = new SpatialHash(64);
  const first = makeEntity(42, 0, 0, 10);
  hash.rebuildLayers([], [first], 1);
  assert.deepEqual(queryIds(hash, 0, 0, 20), [42]);

  first.alive = false;
  hash.rebuildLayers([], [], 1); // dynamic set empty
  assert.deepEqual(queryIds(hash, 0, 0, 20), [],
    'despawned entity must leave the dynamic layer');
  assert.equal(hash._dynamicMembers.size, 0, 'membership map must be empty after full removal');
  assert.equal(hash.buckets.size, 0, 'despawn must reclaim empty dynamic cell rows');

  // Reuse same id with a different object at a new position.
  const reused = makeEntity(42, 300, 300, 10);
  hash.rebuildLayers([], [reused], 1);
  assert.deepEqual(queryIds(hash, 300, 300, 20), [42]);
  assert.deepEqual(queryIds(hash, 0, 0, 20), [],
    'id reuse must not resurrect previous membership at old cells');
}

// --- 4b. Long-distance churn reclaims vacated cell keys instead of growing forever ---
{
  const hash = new SpatialHash(64);
  const traveler = makeEntity('traveler', 0, 0, 8);
  hash.rebuildLayers([], [traveler], 1);
  for (let step = 1; step <= 200; step++) {
    traveler.pos.x = step * 256;
    traveler.pos.z = -step * 192;
    hash.rebuildLayers([], [traveler], 1);
    assert.ok(hash.buckets.size <= 2,
      `vacated rows must be reclaimed during continuous travel (step ${step})`);
  }
  hash.rebuildLayers([], [], 1);
  assert.equal(hash.buckets.size, 0, 'retiring the traveler reclaims its final cell row');
  assert.equal(hash._activeBuckets.length, 0, 'retiring the traveler compacts active buckets');
}

// --- 5. Query equivalence vs brute force (membership set) ---
{
  const hash = new SpatialHash(64);
  const dynamics = [];
  for (let i = 0; i < 40; i++) {
    dynamics.push(makeEntity(
      `d${i}`,
      (i * 37) % 400 - 200,
      (i * 53) % 400 - 200,
      6 + (i % 5),
    ));
  }
  const statics = [
    makeEntity('s0', -50, 50, 30),
    makeEntity('s1', 120, -80, 40),
  ];
  hash.rebuildLayers(statics, dynamics, 7);

  // Walk entities across cells in small steps; incremental rehash each time.
  for (let step = 0; step < 12; step++) {
    for (const e of dynamics) {
      e.pos.x += 11;
      e.pos.z -= 7;
    }
    hash.rebuildLayers(statics, dynamics, 7);

    const all = statics.concat(dynamics);
    for (const probe of [
      { x: 0, z: 0, r: 90 },
      { x: 100, z: -40, r: 60 },
      { x: -150, z: 150, r: 120 },
    ]) {
      const fromHash = queryIds(hash, probe.x, probe.z, probe.r);
      // Brute: spatial hash returns cell-overlap candidates (superset of circle-circle).
      // Compare that every true circle hit is present in the hash result.
      const brute = bruteForceRadius(all, probe.x, probe.z, probe.r);
      for (const e of brute) {
        assert.ok(fromHash.includes(e.id),
          `hash must include brute-force hit ${e.id} at step ${step} probe ${probe.x},${probe.z}`);
      }
    }
  }
}

// --- 6. Deterministic membership sets across identical sync sequences ---
{
  function runSequence() {
    const hash = new SpatialHash(64);
    const dyn = [
      makeEntity(1, 0, 0, 10),
      makeEntity(2, 64, 0, 10),
      makeEntity(3, 0, 64, 10),
    ];
    hash.rebuildLayers([], dyn, 1);
    dyn[1].pos.x = 130;
    hash.rebuildLayers([], dyn, 1);
    dyn.pop(); // remove id 3
    hash.rebuildLayers([], dyn, 1);
    dyn.push(makeEntity(3, 200, 200, 12)); // respawn
    hash.rebuildLayers([], dyn, 1);
    return {
      near: queryIds(hash, 0, 0, 30),
      mid: queryIds(hash, 130, 0, 30),
      far: queryIds(hash, 200, 200, 30),
      members: [...hash._dynamicMembers.keys()].sort((a, b) => a - b),
      reinserts: hash.diagnostics.dynamicReinserts,
      rebuilds: hash.diagnostics.dynamicRebuilds,
    };
  }
  const a = runSequence();
  const b = runSequence();
  assert.deepEqual(a, b, 'identical input sequences must yield identical hash membership/results');
}

// --- 7. Static layer contract preserved under dynamic churn ---
{
  const hash = new SpatialHash(64);
  const statics = [makeEntity('rock', 0, 0, 48)];
  const dynamics = [makeEntity('ship', 96, 96, 12)];
  hash.rebuildLayers(statics, dynamics, 1);
  const staticBuckets = hash.diagnostics.staticBuckets;
  const staticRebuilds = hash.diagnostics.rebuilds;

  for (let i = 0; i < 5; i++) {
    dynamics[0].pos.x += 70;
    hash.rebuildLayers(statics, dynamics, 1);
  }
  assert.equal(hash.diagnostics.rebuilds, staticRebuilds,
    'static layer must not rebuild when staticVersion is unchanged');
  assert.equal(hash.diagnostics.staticBuckets, staticBuckets,
    'static bucket count must stay cached across dynamic refreshes');
  assert.deepEqual(queryIds(hash, 0, 0, 64).filter((id) => id === 'rock'), ['rock']);
}

// --- 8. Catch-up accounting: fixed DT, remainder preserve, explicit shedSteps ---
{
  assert.equal(MAX_CATCHUP_STEPS, 4, 'hard catch-up cap remains 4');

  let ticks = 0;
  const mild = advanceFixedTimestep(0, LOOP_FIXED_DT * 2 + 0.001, 1, () => { ticks++; });
  assert.equal(ticks, 2, '30fps presentation advances two 60Hz steps');
  assert.equal(mild.shedBacklog, false);
  assert.equal(mild.shedSteps, 0);
  assert.ok(mild.accumulator > 0 && mild.accumulator < LOOP_FIXED_DT);

  ticks = 0;
  const extreme = advanceFixedTimestep(0, LOOP_FIXED_DT * 10, 1, () => { ticks++; });
  assert.equal(ticks, 4, 'extreme stall is hard-capped at MAX_CATCHUP_STEPS');
  assert.equal(extreme.shedBacklog, true);
  assert.equal(extreme.shedSteps, 6, '10-4 whole steps beyond the cap are shed');
  assert.equal(extreme.accumulator, 0, 'exact multi-step residual collapses to zero phase');

  ticks = 0;
  const mid = advanceFixedTimestep(LOOP_FIXED_DT * 0.25, LOOP_FIXED_DT * 3, 1, () => { ticks++; });
  assert.equal(ticks, 3, '50ms frame advances three steps without shedding');
  assert.equal(mid.shedBacklog, false);
  assert.equal(mid.shedSteps, 0);
  assert.ok(mid.accumulator > 0 && mid.accumulator < LOOP_FIXED_DT);

  // Remainder after shed is sub-step only (phase continuity).
  ticks = 0;
  const phase = advanceFixedTimestep(LOOP_FIXED_DT * 0.4, LOOP_FIXED_DT * 8, 1, () => { ticks++; });
  assert.equal(ticks, 4);
  assert.equal(phase.shedBacklog, true);
  assert.ok(phase.shedSteps >= 1);
  assert.ok(phase.accumulator >= 0 && phase.accumulator < LOOP_FIXED_DT,
    'shed must preserve only the sub-step interpolation remainder');
}

// --- 9. perfRuntime accepts extended spatial + loop counters ---
{
  const state = {};
  const perf = ensurePerfRuntime(state);
  perf.recordSpatialHash({
    rebuilds: 1,
    dynamicRebuilds: 5,
    dynamicFullRebuilds: 0,
    dynamicReinserts: 3,
    dynamicUnchanged: 40,
    queries: 10,
    candidates: 100,
  });
  perf.recordLoop(2, true, 0.01, 3);
  const report = perf.getReport();
  assert.equal(report.counters.spatialHash.dynamicReinserts, 3);
  assert.equal(report.counters.spatialHash.dynamicUnchanged, 40);
  assert.equal(report.loop.multiStepFrames, 1);
  assert.equal(report.loop.shedStepsTotal, 3);
  assert.equal(report.loop.shedBacklogFrames, 1);
}

// --- 10. Work ratio: stationary crowd ≪ one full rebuild per step ---
{
  const hash = new SpatialHash(64);
  const dynamics = [];
  // Pack entities deep inside cell (32,32) so micro-motion never crosses a boundary.
  for (let i = 0; i < 80; i++) {
    dynamics.push(makeEntity(
      `c${i}`,
      28 + (i % 10) * 0.4,
      28 + Math.floor(i / 10) * 0.4,
      4,
    ));
  }
  hash.rebuildLayers([], dynamics, 1);
  const afterInit = hash.diagnostics.dynamicReinserts;

  // 60 "sim steps" of micro-motion inside cells.
  for (let s = 0; s < 60; s++) {
    for (const e of dynamics) {
      e.pos.x += 0.02;
      e.pos.z += 0.02;
    }
    hash.rebuildLayers([], dynamics, 1);
  }
  const reinserts = hash.diagnostics.dynamicReinserts - afterInit;
  const syncPasses = 60;
  const fullRebuildWorkUnits = 80 * syncPasses; // entities touched if every pass rebuilt all
  assert.equal(reinserts, 0, 'micro-motion inside a cell must reinsert zero entities');
  assert.ok(reinserts * 20 < fullRebuildWorkUnits,
    `incremental reinserts (${reinserts}) must be far below full rebuild work (${fullRebuildWorkUnits})`);
  assert.ok(hash.diagnostics.dynamicRebuilds >= syncPasses + 1);
}

console.log('Spatial catch-up contract OK');
