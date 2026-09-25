import assert from 'node:assert/strict';
import test from 'node:test';

import { createUnreadyDrawableGuard } from '../src/render/bloom.js';

// Draw-time safety net: while a hide→render→restore presented pass is active, a
// stamped authored/shared material with no currentProgram must not link inside the
// frame — the draw is skipped and pipeline admission is queued for that mesh instead.
// Unstamped materials, compiled materials, and all draws outside the pass window are
// untouched.

function rendererHarness() {
  const draws = [];
  const admissions = [];
  const programsByMaterial = new Map();
  const renderer = {
    info: { programs: [] },
    userData: {
      spacefaceQueuePipelineAdmission(subject) {
        admissions.push(subject);
        return Promise.resolve({ queued: true });
      },
    },
    properties: {
      get(material) {
        return { currentProgram: programsByMaterial.get(material) || null };
      },
    },
    renderBufferDirect(camera, scene, geometry, material, object) {
      draws.push(object);
      return 'drawn';
    },
  };
  return {
    renderer,
    draws,
    admissions,
    compile(material, program = { name: 'program' }) { programsByMaterial.set(material, program); },
  };
}

function canonStampedMaterial() {
  return { userData: { spacefaceProgramCanon: 1 } };
}

test('guard skips a stamped never-compiled material during the pass and queues its mesh once', async () => {
  const { renderer, draws, admissions } = rendererHarness();
  const guard = createUnreadyDrawableGuard(renderer);
  const material = canonStampedMaterial();
  const mesh = { isMesh: true, material };
  const scene = { traverse() {} };

  guard.hide(scene);
  try {
    assert.equal(renderer.renderBufferDirect(null, scene, null, material, mesh, null), undefined);
    assert.equal(renderer.renderBufferDirect(null, scene, null, material, mesh, null), undefined);
  } finally {
    guard.restore();
  }
  assert.equal(draws.length, 0, 'the cold authored draw is skipped inside the presented pass');
  assert.equal(admissions.length, 1, 'the admission stamp dedupes repeated draws of the same material');
  assert.equal(admissions[0], mesh, 'admission is queued for the mesh object, not its scene root');
  await Promise.resolve();
});

test('guard admits each authored stamp flavour and leaves unstamped/compiled draws alone', async () => {
  const { renderer, draws, admissions, compile } = rendererHarness();
  const guard = createUnreadyDrawableGuard(renderer);
  const scene = { traverse() {} };
  const mesh = { isMesh: true };

  const sharedStamped = { userData: { spacefaceSharedMaterialRole: 'ship-hull' } };
  const canonStamped = canonStampedMaterial();
  const unstamped = { userData: {} };
  const compiledStamped = canonStampedMaterial();
  compile(compiledStamped);

  guard.hide(scene);
  try {
    assert.equal(renderer.renderBufferDirect(null, scene, null, sharedStamped, mesh, null), undefined);
    assert.equal(renderer.renderBufferDirect(null, scene, null, canonStamped, mesh, null), undefined);
    assert.equal(renderer.renderBufferDirect(null, scene, null, unstamped, mesh, null), 'drawn');
    assert.equal(renderer.renderBufferDirect(null, scene, null, compiledStamped, mesh, null), 'drawn');
  } finally {
    guard.restore();
  }

  assert.equal(draws.length, 2);
  assert.equal(admissions.length, 2);
  assert.ok(admissions.every((subject) => subject === mesh));
  await Promise.resolve();
});

test('guard draws a cold stamped material once the presented pass ends', () => {
  const { renderer, draws, admissions } = rendererHarness();
  const guard = createUnreadyDrawableGuard(renderer);
  const material = canonStampedMaterial();
  const mesh = { isMesh: true, material };
  const scene = { traverse() {} };

  // Outside hide→restore the wrapper must be inert even though nothing compiled.
  assert.equal(renderer.renderBufferDirect(null, scene, null, material, mesh, null), 'drawn');

  guard.hide(scene);
  guard.restore();
  assert.equal(renderer.renderBufferDirect(null, scene, null, material, mesh, null), 'drawn');

  assert.equal(draws.length, 2);
  assert.equal(admissions.length, 0);
});

test('draw guard installs once per renderer and composes with a pre-existing wrapper', () => {
  const { renderer, draws } = rendererHarness();
  const inner = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function preexistingWrapper(camera, scene, geometry, material, object, group) {
    this.__preexistingSaw = (this.__preexistingSaw || 0) + 1;
    return inner.call(this, camera, scene, geometry, material, object, group);
  };

  createUnreadyDrawableGuard(renderer);
  const wrapped = renderer.renderBufferDirect;
  createUnreadyDrawableGuard(renderer);
  assert.equal(renderer.renderBufferDirect, wrapped, 'second guard does not re-wrap the draw path');

  const scene = { traverse() {} };
  renderer.renderBufferDirect(null, scene, null, { userData: {} }, { isMesh: true }, null);
  assert.equal(renderer.__preexistingSaw, 1, 'the earlier wrapper still sees the draw');
  assert.equal(draws.length, 1);
});
