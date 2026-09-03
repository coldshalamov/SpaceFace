import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  TEARDOWN_DEPENDENCIES,
  destroySystems,
  orderSystemsForTeardown,
} from '../src/core/registry.js';
import { createDynamicBufferCoordinator } from '../src/render/dynamicBufferRanges.js';
import { vfx } from '../src/render/vfx.js';

test('registry teardown runs dependents before owners exactly once', () => {
  const calls = [];
  const render = { name: 'render', destroy() { calls.push('render'); } };
  const vfxSystem = { name: 'vfx', destroy() { calls.push('vfx'); } };
  const other = { name: 'other', destroy() { calls.push('other'); } };

  assert.deepEqual(
    orderSystemsForTeardown([render, vfxSystem, other, vfxSystem, render]),
    [vfxSystem, render, other],
    'the explicit dependent-before-owner contract should only move the declared edge',
  );
  destroySystems([render, vfxSystem, other, vfxSystem, render]);
  assert.deepEqual(calls, ['vfx', 'render', 'other'],
    'duplicate registry aliases must not destroy a system twice');
  assert.deepEqual(TEARDOWN_DEPENDENCIES, [['vfx', 'render']]);
});
test('a throwing destroy does not prevent later systems from retiring', () => {
  const calls = [];
  const broken = {
    name: 'broken',
    destroy() {
      calls.push('broken');
      throw new Error('synthetic destroy failure');
    },
  };
  const later = { name: 'later', destroy() { calls.push('later'); } };
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.doesNotThrow(() => destroySystems([broken, later, broken]));
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(calls, ['broken', 'later']);
});

function makeVfxState(scene) {
  return {
    playerId: 1,
    entities: new Map(),
    entityList: [],
    settings: { video: { particleQuality: 'low' } },
    render: { scene },
  };
}

function makeBus() {
  const listeners = new Map();
  return {
    on(name, listener) {
      const list = listeners.get(name) || [];
      list.push(listener);
      listeners.set(name, list);
      return () => {
        const index = list.indexOf(listener);
        if (index >= 0) list.splice(index, 1);
      };
    },
  };
}

test('VFX destroy retires owned roots once and is safe after renderer state disappears', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const borrowedGeometry = new THREE.BufferGeometry();
  const borrowedMaterial = new THREE.MeshBasicMaterial();
  const borrowedMesh = new THREE.Mesh(borrowedGeometry, borrowedMaterial);
  scene.add(borrowedMesh);
  const state = makeVfxState(scene);
  const system = Object.create(vfx);
  system.init({ state, bus: makeBus(), helpers: {} });
  const initialChildren = scene.children.length;
  assert.ok(initialChildren > 0, 'the fixture must allocate VFX scene roots');
  assert.ok(coordinator.getDiagnostics().registeredOwners > 0,
    'the fixture must register dynamic VFX upload owners');

  const particleGeometry = system._pGeo;
  const particleMaterial = system._particleMat;
  const trailGeometry = system._trailStreakPool.mesh.geometry;
  const trailMaterial = system._trailStreakPool.mesh.material;
  const spriteBucket = system._spriteBatches.glow;
  const spriteGeometry = spriteBucket.mesh.geometry;
  const spriteMaterial = spriteBucket.mesh.material;
  const spriteTexture = spriteMaterial.uniforms.uSpriteMap.value;
  const disposed = new Map();
  const watch = (resource) => {
    let count = 0;
    resource.addEventListener('dispose', () => { count++; });
    disposed.set(resource, () => count);
  };
  for (const resource of [
    particleGeometry, particleMaterial, trailGeometry, trailMaterial,
    spriteGeometry, spriteMaterial, spriteTexture,
  ]) watch(resource);

  assert.equal(system.destroy(), true);
  assert.equal(scene.children.length, 1, 'VFX must detach only its own roots before renderer teardown');
  assert.equal(borrowedMesh.parent, scene, 'borrowed scene roots must remain renderer-owned');
  assert.equal(coordinator.getDiagnostics().registeredOwners, 0,
    'VFX must release its dynamic upload owners');
  assert.equal(system._scene, null);
  assert.equal(system.state, null);
  assert.equal(system._points, null);
  assert.equal(system._spriteBatches, null);
  assert.equal(system._ribbonTrails, null);
  for (const [resource, count] of disposed) {
    assert.equal(count(), 1, 'each VFX-owned GPU resource must be disposed exactly once');
  }
  for (const field of [
    '_pPos', '_pCol', '_pSize', '_pAlpha', '_pTrailAxis', '_pTrailStretch',
    '_px', '_py', '_pz', '_vx', '_vy', '_vz', '_age', '_life', '_drag',
    '_size0', '_size1', '_cr0', '_cg0', '_cb0', '_cr1', '_cg1', '_cb1',
    '_particleTrailAxis', '_particleTrailStretch',
    '_particleAdmissionPriority', '_particleAdmissionSerial', '_alive',
    '_ts', '_spr', '_activeTrailStreaks', '_freeTrailStreaks',
    '_activeSprites', '_freeSprites',
  ]) {
    assert.equal(system[field], null, `${field} must not retain the retired generation`);
  }
  assert.doesNotThrow(() => system.update(1 / 60),
    'late renderer callbacks must not dereference a retired VFX system');
  assert.equal(system.destroy(), false, 'a second destroy must be a no-op');
  for (const [resource, count] of disposed) {
    assert.equal(count(), 1, 'double destroy must not dispose an owned resource again');
  }
  assert.equal(coordinator.dispose(), true);
  assert.equal(coordinator.dispose(), false);
  borrowedMesh.removeFromParent();
  borrowedGeometry.dispose();
  borrowedMaterial.dispose();
});
