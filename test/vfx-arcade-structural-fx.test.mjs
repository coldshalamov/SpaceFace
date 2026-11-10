import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  ArcadeStructuralFx,
  ARCADE_STRUCTURAL_FX_CAPACITY,
} from '../src/render/combat/arcadeStructuralFx.js';

void THREE;

function driveMixed(fx, count) {
  for (let i = 0; i < count; i++) {
    const spec = {
      x: i * 0.15,
      z: i * -0.11,
      y: 0.5,
      priority: 0.35 + (i % 7) * 0.08,
      life: 1.2,
      color: '#ffffff',
      endColor: '#ff6a28',
    };
    if (i % 3 === 0) fx.spawnBlade(spec);
    else if (i % 3 === 1) fx.spawnArc(spec);
    else fx.spawnShard(spec);
  }
}

function inspectCounters(fx) {
  const info = fx.inspect();
  return {
    schema: info.schema,
    live: { ...info.live },
    highWater: { ...info.highWater },
    pools: {
      blades: { ...info.pools.blades },
      arcs: { ...info.pools.arcs },
      shards: { ...info.pools.shards },
    },
  };
}

test('saturation drive fills every pool to exactly its fixed capacity and no further', () => {
  const fx = new ArcadeStructuralFx(null);
  driveMixed(fx, 500);
  const info = fx.inspect();
  assert.equal(info.schema, 'spaceface.arcadeStructuralFx.v1');
  for (const kind of ['blades', 'arcs', 'shards']) {
    const pool = info.pools[kind];
    const capacity = ARCADE_STRUCTURAL_FX_CAPACITY[kind];
    assert.equal(pool.capacity, capacity);
    // `highWater <= capacity` alone cannot fail against a fixed-length slot array, and a stub whose
    // spawn() returns false satisfies it trivially. Requiring EQUALITY is what makes this assertion
    // real: 500 mixed requests over 128/48/64 slots must saturate all three.
    assert.equal(pool.highWater, capacity, `${kind} must saturate: highWater ${pool.highWater} != ${capacity}`);
    assert.equal(pool.live, capacity, `${kind} must be full: live ${pool.live} != ${capacity}`);
    // A no-op implementation admits nothing, so it can neither evict nor refuse.
    assert.ok(pool.spawned > capacity, `${kind} spawned ${pool.spawned} must exceed capacity`);
    assert.ok(pool.evicted > 0, `${kind} must have evicted under saturation`);
    assert.ok(pool.rejected > 0, `${kind} must have refused a lower-priority request under saturation`);
    assert.equal(info.highWater[kind], pool.highWater);
    assert.equal(info.live[kind], pool.live);
  }
  // Buffer identity and length must survive saturation — capacity is allocated once, never regrown.
  for (const mesh of fx.getMeshes()) {
    assert.equal(mesh.instanceMatrix.array.length, mesh.count * 16);
    assert.equal(mesh.instanceColor.array.length, mesh.count * 3);
  }
  fx.dispose();
});

test('blade pool refuses a lower-priority overflow and evicts a higher-priority one', () => {
  const fx = new ArcadeStructuralFx(null);
  const capacity = ARCADE_STRUCTURAL_FX_CAPACITY.blades;
  for (let i = 0; i < capacity; i++) {
    assert.equal(fx.spawnBlade({
      x: i, z: 0, priority: 0.9, life: 8, color: '#ffffff', endColor: '#ff6a28',
    }), true);
  }
  const filled = fx.inspect().pools.blades;
  assert.equal(filled.live, capacity);
  assert.equal(filled.spawned, capacity);
  assert.equal(filled.highWater, capacity);

  assert.equal(fx.spawnBlade({
    x: 0, z: 0, priority: 0.2, life: 8, color: '#ffffff', endColor: '#ff6a28',
  }), false);
  const refused = fx.inspect().pools.blades;
  assert.equal(refused.rejected, filled.rejected + 1);
  assert.equal(refused.spawned, filled.spawned);
  assert.equal(refused.evicted, filled.evicted);
  assert.equal(refused.live, capacity);

  assert.equal(fx.spawnBlade({
    x: 1, z: 1, priority: 0.95, life: 8, color: '#ffffff', endColor: '#ff6a28',
  }), true);
  const evicted = fx.inspect().pools.blades;
  assert.equal(evicted.evicted, filled.evicted + 1);
  assert.equal(evicted.live, capacity);
  assert.equal(evicted.capacity, capacity);
  fx.dispose();
});

test('structural pools never grow past the module capacity', () => {
  const fx = new ArcadeStructuralFx(null);
  driveMixed(fx, 500);
  const cap = ARCADE_STRUCTURAL_FX_CAPACITY.blades;
  for (let i = 0; i < cap; i++) {
    fx.spawnBlade({ x: i, z: 0, priority: 0.9, life: 8 });
  }
  fx.spawnBlade({ x: 0, z: 0, priority: 0.2, life: 8 });
  fx.spawnBlade({ x: 0, z: 0, priority: 0.95, life: 8 });
  const info = fx.inspect();
  for (const kind of ['blades', 'arcs', 'shards']) {
    assert.equal(info.pools[kind].capacity, ARCADE_STRUCTURAL_FX_CAPACITY[kind]);
  }
  fx.dispose();
});

test('clear zeros live without resetting high-water, and dispose is idempotent', () => {
  const fx = new ArcadeStructuralFx(null);
  driveMixed(fx, 80);
  const before = fx.inspect();
  assert.ok(before.highWater.blades > 0);
  fx.clear();
  const cleared = fx.inspect();
  assert.equal(cleared.pools.blades.live, 0);
  assert.equal(cleared.pools.arcs.live, 0);
  assert.equal(cleared.pools.shards.live, 0);
  assert.equal(cleared.live.blades, 0);
  assert.equal(cleared.live.arcs, 0);
  assert.equal(cleared.live.shards, 0);
  assert.equal(cleared.highWater.blades, before.highWater.blades);
  assert.equal(cleared.highWater.arcs, before.highWater.arcs);
  assert.equal(cleared.highWater.shards, before.highWater.shards);
  assert.equal(cleared.pools.blades.highWater, before.pools.blades.highWater);
  fx.dispose();
  assert.doesNotThrow(() => fx.dispose());
});

test('the same spawn sequence is deterministic across fresh instances', () => {
  const a = new ArcadeStructuralFx(null);
  const b = new ArcadeStructuralFx(null);
  driveMixed(a, 64);
  driveMixed(b, 64);
  for (let i = 0; i < 8; i++) {
    a.spawnBlade({ x: i, z: 2, priority: 0.88, life: 0.4, angle: i * 0.2 });
    b.spawnBlade({ x: i, z: 2, priority: 0.88, life: 0.4, angle: i * 0.2 });
  }
  assert.deepEqual(inspectCounters(a), inspectCounters(b));
  // Counters alone would still match a stub. Step both pools a fixed number of frames and compare
  // the actual GPU instance transforms and colours — that is the drawn output, not a tally of it.
  for (let frame = 0; frame < 12; frame++) {
    a.update(1 / 60, null, 900);
    b.update(1 / 60, null, 900);
  }
  const meshesA = a.getMeshes();
  const meshesB = b.getMeshes();
  assert.equal(meshesA.length, meshesB.length);
  let movedInstances = 0;
  for (let m = 0; m < meshesA.length; m++) {
    const matA = meshesA[m].instanceMatrix.array;
    const matB = meshesB[m].instanceMatrix.array;
    const colA = meshesA[m].instanceColor.array;
    const colB = meshesB[m].instanceColor.array;
    assert.deepEqual(Array.from(matA), Array.from(matB), 'instance matrices must match');
    assert.deepEqual(Array.from(colA), Array.from(colB), 'instance colours must match');
    for (let i = 0; i < matA.length; i += 16) {
      // A live instance sits at its spawn position, not the parked y = -10000 dead pose.
      if (matA[i + 13] > -1000) movedInstances++;
    }
  }
  // If nothing ever reached the GPU buffers the comparison above would be two identical all-dead
  // arrays, which is exactly the stub case. Require real drawn instances.
  assert.ok(movedInstances > 0, `expected live instance transforms, got ${movedInstances}`);
  a.dispose();
  b.dispose();
});
