import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOMB_DEFS, BOMB_IDS, BOMB_DRIFT } from '../src/data/bombs.js';
import { BombPresentationBatch, createBombPresentationPrecompileMesh } from '../src/render/bombPresentation.js';

function bomb(kind = 'bomb_singularity', id = 'salvo-a', born = 0, phase = 'field') {
  return { id, alive: true, type: 'bomb', pos: { x: 1200, z: -300 }, prevPos: { x: 1200, z: -300 },
    vel: { x: 60, z: 20 }, rot: 0.3,
    data: { bombId: kind, phase, spawnedAt: born, fieldStartedAt: born, armed: true } };
}
function world(time = 1) {
  return { mode: 'flight', simTime: time, world: { frameOrigin: { x: 1200, z: -300 } },
    settings: { video: {} }, render: { scene: new THREE.Scene() },
    rng: () => { throw new Error('Presentation must not consume simulation RNG'); } };
}
function positions(batch) { return batch.positions.slice(0, batch.count * 3); }
function surfaces(batch) { return batch.surfaces.slice(0, batch.count * 4); }
function xz(batch) {
  const points = [];
  for (let i = 0; i < batch.count * 3; i += 3) points.push(batch.positions[i], batch.positions[i + 2]);
  return points;
}

test('gravity and tar visibly deform while powered, then freeze exactly with a paused simulation', () => {
  for (const kind of ['bomb_singularity', 'bomb_goo']) {
    const state = world(), entity = bomb(kind), batch = new BombPresentationBatch(state.render.scene);
    batch.update(state, [entity], 1);
    const before = xz(batch);
    state.simTime += 0.25;
    batch.update(state, [entity], 1);
    assert.notDeepEqual(xz(batch), before, `${kind} changes shape, not just opacity`);
    const paused = positions(batch), pausedSurface = surfaces(batch);
    for (let i = 0; i < 4; i++) batch.update(state, [entity], 1);
    assert.deepEqual(positions(batch), paused);
    assert.deepEqual(surfaces(batch), pausedSurface);
    batch.dispose();
  }
});

test('same local deployment age repeats, separate identities vary, and simulation state stays untouched', () => {
  const state = world(), entity = bomb(), batch = new BombPresentationBatch(state.render.scene);
  const before = JSON.stringify(entity);
  batch.update(state, [entity], 1);
  const local = positions(batch), localSurface = surfaces(batch);
  assert.equal(JSON.stringify(entity), before);
  const later = bomb('bomb_singularity', entity.id, 400);
  state.simTime = 401;
  batch.update(state, [later], 1);
  assert.deepEqual(positions(batch), local, 'no session-clock-dependent starting choreography');
  assert.deepEqual(surfaces(batch), localSurface);
  later.id = 'salvo-b';
  batch.update(state, [later], 1);
  assert.notDeepEqual(positions(batch), local, 'stable identity variation is visible in the form');
  batch.dispose();
});

test('field reach remains authoritative through build, decay and reduced flash', () => {
  for (const kind of ['bomb_singularity', 'bomb_goo']) {
    const state = world(), entity = bomb(kind), batch = new BombPresentationBatch(state.render.scene);
    const radius = BOMB_DEFS[kind].radius;
    for (const age of [0, 0.15, 1, 2.6]) {
      state.simTime = age;
      batch.update(state, [entity], 1);
      let furthest = 0;
      for (let i = 0; i < batch.count * 3; i += 3) {
        furthest = Math.max(furthest, Math.hypot(batch.positions[i], batch.positions[i + 2]));
      }
      assert.ok(furthest >= radius - 0.01 && furthest <= radius + 1,
        `${kind}: birth/deformation must not change the indicated force reach`);
    }
    const fullPositions = positions(batch), fullSurface = surfaces(batch);
    state.settings.video.flashReduce = true;
    batch.update(state, [entity], 1);
    assert.deepEqual(positions(batch), fullPositions);
    assert.ok(surfaces(batch).some((v, i) => i % 4 === 1 && v < fullSurface[i]));
    state.simTime = 10;
    batch.update(state, [entity], 1);
    assert.equal(batch.count, 0, 'expired fields leave no live danger indicator');
    batch.dispose();
  }
});

test('every payload has a distinct source silhouette and every source respects reduced motion', () => {
  const signatures = new Set();
  const state = world(), batch = new BombPresentationBatch(state.render.scene);
  for (const kind of BOMB_IDS) {
    const entity = bomb(kind, 'same-salvo', 0, 'drift');
    batch.update(state, [entity], 1);
    signatures.add(JSON.stringify([...positions(batch)]));
    state.settings.video.motionReduce = true;
    batch.update(state, [entity], 1);
    const still = positions(batch), surface = surfaces(batch);
    state.simTime += 0.2;
    batch.update(state, [entity], 1);
    assert.deepEqual(positions(batch), still, kind);
    assert.deepEqual(surfaces(batch), surface, kind);
    state.settings.video.motionReduce = false;
    state.simTime = 1;
  }
  assert.equal(signatures.size, BOMB_IDS.length);
  batch.dispose();
});

test('all 24 gravity fields retain full smooth geometry in a single warmed material batch', () => {
  const state = world(), entity = bomb(), batch = new BombPresentationBatch(state.render.scene);
  batch.update(state, [entity], 1);
  const oneCount = batch.count;
  const list = Array.from({ length: BOMB_DRIFT.maxWorldActive }, (_, id) => bomb('bomb_singularity', id));
  batch.update(state, list, 1);
  assert.equal(batch.count, oneCount * BOMB_DRIFT.maxWorldActive, 'no late-field truncation at capacity');
  assert.equal(batch.stats.drawCalls, 1);
  let peakHeat = 0;
  for (let i = 1; i < batch.count * 4; i += 4) peakHeat = Math.max(peakHeat, batch.surfaces[i]);
  assert.ok(peakHeat > 3, 'working folds carry HDR radiance for the production bloom threshold');
  const cook = createBombPresentationPrecompileMesh();
  assert.equal(cook.material.customProgramCacheKey(), batch.material.customProgramCacheKey());
  assert.deepEqual(Object.keys(cook.geometry.attributes).sort(), Object.keys(batch.geometry.attributes).sort());
  batch.dispose(); cook.geometry.dispose(); cook.material.dispose();
});
