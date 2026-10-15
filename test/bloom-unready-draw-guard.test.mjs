import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createUnreadyDrawableGuard } from '../src/render/bloom.js';
import { revealSubjectForCompile } from '../src/render/compilePresentSlice.js';
import { render } from '../src/render/renderer.js';

// Draw-time safety net: while a hide→render→restore presented pass is active, a
// stamped authored/shared material with no currentProgram must not link inside the
// frame — the draw is skipped and pipeline admission is queued for that mesh instead.
// Explicit zero-instance pools skip setup in every pass. Other unstamped/compiled
// materials and draws outside the readiness pass window retain their existing path.

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

test('readiness scan skips hidden subtrees that the scene pass cannot draw', async () => {
  const { renderer, admissions } = rendererHarness();
  const guard = createUnreadyDrawableGuard(renderer);
  const scene = new THREE.Scene();
  const hidden = new THREE.Group();
  hidden.visible = false;
  const hiddenLeaf = new THREE.Mesh();
  hiddenLeaf.material.userData.spacefaceProgramCanon = 1;
  hidden.add(hiddenLeaf);
  const visibleLeaf = new THREE.Mesh();
  visibleLeaf.material.userData.spacefaceProgramCanon = 1;
  scene.add(hidden, visibleLeaf);

  guard.hide(scene);
  try {
    assert.deepEqual(admissions, [visibleLeaf], 'only a drawable subtree needs readiness work');
    assert.equal(hiddenLeaf.visible, true, 'the hidden parent already excludes its descendants');
    assert.equal(visibleLeaf.visible, false, 'a cold visible leaf still waits for admission');
  } finally {
    guard.restore();
    hiddenLeaf.geometry.dispose();
    hiddenLeaf.material.dispose();
    visibleLeaf.geometry.dispose();
    visibleLeaf.material.dispose();
  }
  await Promise.resolve();
});

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

test('unarmed readiness cleanup does not retain hidden drawable roots', () => {
  const { renderer } = rendererHarness();
  const guard = createUnreadyDrawableGuard(renderer);
  const material = canonStampedMaterial();
  const mesh = { isMesh: true, material, visible: true };
  const scene = { traverse(visitor) { visitor(mesh); } };

  guard.hide(scene);
  assert.equal(mesh.visible, false);
  guard.restore();

  assert.equal(mesh.visible, true, 'readiness cleanup still restores visibility');
  assert.equal(renderer.__sfLastHiddenDrawables, null, 'unarmed passes release any prior set reference');
  assert.equal(renderer.__sfDrawHistogramArmed, undefined, 'the guard does not arm diagnostics itself');
});

test('armed readiness records are consumed by a histogram sample and disarm clears retained references', () => {
  const { renderer } = rendererHarness();
  renderer.__sfDrawHistogramArmed = true;
  renderer.info.render = { calls: 0 };
  renderer.info.reset = () => {};
  const guard = createUnreadyDrawableGuard(renderer);
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.material.userData.spacefaceProgramCanon = 1;
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera();
  const owner = {
    _drawHistogramWindow: 120,
    renderer,
    cam: { obj: camera },
    scene,
  };

  try {
    guard.hide(scene);
    assert.equal(mesh.visible, false);
    guard.restore();
    assert.equal(mesh.visible, true);
    assert.equal(renderer.__sfLastHiddenDrawables.has(mesh), true, 'the armed pass records only for its sampler');

    render._sampleDrawHistogram.call(owner);
    assert.equal(renderer.__sfLastHiddenDrawables.size, 0, 'each sample releases hidden-drawable references');
    assert.equal(owner._drawHistState.frames, 1);

    renderer.__sfLastHiddenDrawables.add(mesh);
    owner._drawHistState.stack.push(mesh);
    render._disarmDrawHistogram.call(owner);
    assert.equal(renderer.__sfDrawHistogramArmed, false);
    assert.equal(renderer.__sfLastHiddenDrawables, null);
    assert.equal(owner._drawHistogramWindow, 0);
    assert.equal(owner._drawHistState, null, 'disarm drops geometry and traversal scratch references');
  } finally {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
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

test('explicit zero-instance pools bypass residency, readiness and inner draw setup', () => {
  const cases = [
    { geometry: { isInstancedBufferGeometry: true, instanceCount: 0 }, object: { isMesh: true } },
    { geometry: { isInstancedBufferGeometry: true, instanceCount: 0, _maxInstanceCount: 0 }, object: { isMesh: true } },
    { geometry: { isInstancedBufferGeometry: true, instanceCount: 0, _maxInstanceCount: Infinity }, object: { isMesh: true } },
    { geometry: {}, object: { isMesh: true, isInstancedMesh: true, count: 0 } },
  ];
  for (const { geometry, object } of cases) {
    const { renderer, draws, admissions } = rendererHarness();
    let residencyReads = 0;
    let programReads = 0;
    Object.defineProperty(geometry, 'userData', { get() { residencyReads++; return {}; } });
    const material = canonStampedMaterial();
    Object.defineProperty(material, 'map', { get() { residencyReads++; return null; } });
    renderer.properties.get = () => { programReads++; return {}; };
    const guard = createUnreadyDrawableGuard(renderer);
    const scene = { traverse() {} };
    guard.hide(scene);
    try {
      assert.equal(renderer.renderBufferDirect(null, scene, geometry, material, object, null), undefined);
    } finally { guard.restore(); }
    assert.equal(renderer.renderBufferDirect(null, scene, geometry, material, object, null), undefined);
    assert.equal(residencyReads, 0, 'empty pools do not inspect detached geometry or material texture slots');
    assert.equal(programReads, 0, 'empty pools do not look up readiness variants');
    assert.equal(draws.length, 0, 'Three setup is never reached for an explicit zero count');
    assert.equal(admissions.length, 0, 'an empty pool does not request presented-draw admission');
  }
});

test('a zero-instance pool immediately returns to ordinary readiness when activated', async () => {
  const { renderer, draws, admissions, compile } = rendererHarness();
  const guard = createUnreadyDrawableGuard(renderer);
  const geometry = { isInstancedBufferGeometry: true, instanceCount: 0 };
  const material = canonStampedMaterial();
  const mesh = { isMesh: true, geometry, material };
  const scene = { traverse() {} };
  guard.hide(scene);
  try {
    assert.equal(renderer.renderBufferDirect(null, scene, geometry, material, mesh, null), undefined);
    assert.equal(admissions.length, 0);
    geometry.instanceCount = 1;
    assert.equal(renderer.renderBufferDirect(null, scene, geometry, material, mesh, null), undefined);
    assert.deepEqual(admissions, [mesh], 'activation still refuses and admits a cold material');
    compile(material);
    assert.equal(renderer.renderBufferDirect(null, scene, geometry, material, mesh, null), 'drawn');
    geometry.instanceCount = 0;
    assert.equal(renderer.renderBufferDirect(null, scene, geometry, material, mesh, null), undefined);
    assert.deepEqual(draws, [mesh], 'the positive draw survives and the dormant draw is skipped again');
  } finally { guard.restore(); }
  await Promise.resolve();
});

test('zero-count shortcut respects BatchedMesh and InstancedMesh dispatch precedence', () => {
  const { renderer, draws } = rendererHarness();
  createUnreadyDrawableGuard(renderer);
  const material = { userData: {} };
  const zeroGeometry = { isInstancedBufferGeometry: true, instanceCount: 0 };
  const objects = [
    { isMesh: true, isInstancedMesh: true, count: 2 },
    { isMesh: true, isBatchedMesh: true },
    { isMesh: true, isBatchedMesh: true, isInstancedMesh: true, count: 0 },
  ];
  for (const object of objects) {
    assert.equal(renderer.renderBufferDirect(null, null, zeroGeometry, material, object, null), 'drawn');
  }
  assert.deepEqual(draws, objects, 'neither independent mesh counts nor batch draw lists use geometry.instanceCount');
});

test('unknown, positive and invalid instance counts keep their existing draw path', () => {
  const { renderer, draws } = rendererHarness();
  createUnreadyDrawableGuard(renderer);
  const material = { userData: {} };
  let expectedDraws = 0;
  for (const count of [undefined, null, NaN, -1, 1, Infinity, '0']) {
    const geometry = { isInstancedBufferGeometry: true, instanceCount: count };
    assert.equal(renderer.renderBufferDirect(null, null, geometry, material, { isMesh: true }, null), 'drawn');
    assert.equal(renderer.renderBufferDirect(null, null, {}, material,
      { isMesh: true, isInstancedMesh: true, count }, null), 'drawn');
    expectedDraws += 2;
  }
  for (const max of [NaN, -1, null, '0']) {
    const geometry = { isInstancedBufferGeometry: true, instanceCount: 0, _maxInstanceCount: max };
    assert.equal(renderer.renderBufferDirect(null, null, geometry, material, { isMesh: true }, null), 'drawn');
    expectedDraws++;
  }
  assert.equal(draws.length, expectedDraws, 'the shortcut does not coerce or repair invalid counts');
});

test('real loading reveal still submits dormant instanced pools and restores their counts', () => {
  for (const instancedMesh of [false, true]) {
    const geometry = instancedMesh ? new THREE.BoxGeometry() : new THREE.InstancedBufferGeometry();
    if (!instancedMesh) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
      geometry.instanceCount = 0;
    }
    const material = new THREE.MeshBasicMaterial();
    const mesh = instancedMesh ? new THREE.InstancedMesh(geometry, material, 1) : new THREE.Mesh(geometry, material);
    if (instancedMesh) mesh.count = 0;
    const { renderer, draws } = rendererHarness();
    createUnreadyDrawableGuard(renderer);
    try {
      assert.equal(renderer.renderBufferDirect(null, null, geometry, material, mesh, null), undefined);
      const restore = revealSubjectForCompile(mesh);
      try {
        assert.equal(instancedMesh ? mesh.count : geometry.instanceCount, 1);
        assert.equal(renderer.renderBufferDirect(null, null, geometry, material, mesh, null), 'drawn');
      } finally { restore(); }
      assert.equal(instancedMesh ? mesh.count : geometry.instanceCount, 0);
      assert.equal(renderer.renderBufferDirect(null, null, geometry, material, mesh, null), undefined);
      assert.deepEqual(draws, [mesh], 'the real nonzero loading touch crosses the same guard');
    } finally {
      if (instancedMesh) mesh.dispose();
      geometry.dispose(); material.dispose();
    }
  }
});
