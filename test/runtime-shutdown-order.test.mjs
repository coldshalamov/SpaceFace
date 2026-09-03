import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  TEARDOWN_DEPENDENCIES,
  createSystemLifecycle,
  destroySystems,
  orderSystemsForTeardown,
} from '../src/core/registry.js';
import { createDynamicBufferCoordinator } from '../src/render/dynamicBufferRanges.js';
import { vfx } from '../src/render/vfx.js';

test('registry lifecycle makes active init idempotent and destroy one-shot', () => {
  const bus = makeLifecycleBus();
  const calls = { init: 0, destroy: 0, event: 0 };
  let unsubscribe = null;
  const system = {
    name: 'fake-lifecycle',
    init(ctx) {
      calls.init++;
      unsubscribe = ctx.bus.on('lifecycle:probe', () => { calls.event++; });
    },
    destroy() {
      calls.destroy++;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
  const lifecycle = createSystemLifecycle({ systems: [system], context: { bus } });

  assert.equal(lifecycle.init(), undefined, 'first init preserves the historical undefined return');
  assert.equal(lifecycle.init(), undefined, 'active duplicate init remains a compatible no-op');
  bus.emit('lifecycle:probe');
  assert.deepEqual(calls, { init: 1, destroy: 0, event: 1 },
    'duplicate init must not install a second event-bus listener');

  assert.equal(lifecycle.destroy(), undefined);
  assert.equal(lifecycle.destroy(), undefined, 'destroy must be idempotent');
  bus.emit('lifecycle:probe');
  assert.deepEqual(calls, { init: 1, destroy: 1, event: 1 },
    'destroy must retire the listener and invoke the hook exactly once');
  assert.throws(() => lifecycle.init(), /lifecycle is destroyed/,
    'a destroyed registry must reject re-init instead of stacking subscriptions');
});

test('partial registry init rolls back reached systems and permanently rejects retry', () => {
  const bus = makeLifecycleBus();
  const failure = new Error('synthetic init failure');
  const calls = {
    firstInit: 0,
    firstDestroy: 0,
    brokenInit: 0,
    brokenDestroy: 0,
    laterInit: 0,
    events: 0,
  };
  let firstUnsubscribe = null;
  let brokenUnsubscribe = null;
  const first = {
    name: 'first',
    init(ctx) {
      calls.firstInit++;
      firstUnsubscribe = ctx.bus.on('lifecycle:probe', () => { calls.events++; });
    },
    destroy() {
      calls.firstDestroy++;
      firstUnsubscribe?.();
      firstUnsubscribe = null;
    },
  };
  const broken = {
    name: 'broken',
    init(ctx) {
      calls.brokenInit++;
      brokenUnsubscribe = ctx.bus.on('lifecycle:probe', () => { calls.events++; });
      throw failure;
    },
    destroy() {
      calls.brokenDestroy++;
      brokenUnsubscribe?.();
      brokenUnsubscribe = null;
    },
  };
  const later = {
    name: 'later',
    init() { calls.laterInit++; },
  };
  const lifecycle = createSystemLifecycle({
    systems: [first, broken, later],
    context: { bus },
  });

  assert.throws(() => lifecycle.init(), (error) => error === failure,
    'the original init error must remain the caller-visible failure');
  assert.deepEqual(calls, {
    firstInit: 1,
    firstDestroy: 1,
    brokenInit: 1,
    brokenDestroy: 1,
    laterInit: 0,
    events: 0,
  }, 'partial init must destroy the reached prefix, including the throwing system');
  bus.emit('lifecycle:probe');
  assert.equal(calls.events, 0, 'partial-init cleanup must remove the reached subscriptions');

  assert.throws(() => lifecycle.init(), /lifecycle is failed/,
    'a failed registry must reject retry rather than duplicate the partial init');
  lifecycle.destroy();
  assert.equal(calls.firstDestroy, 1);
  assert.equal(calls.brokenDestroy, 1);
  assert.equal(calls.laterInit, 0);
});

test('registry lifecycle remains fail-closed after a throwing destroy and continues cleanup', () => {
  const calls = [];
  const lifecycle = createSystemLifecycle({
    systems: [
      {
        name: 'broken-destroy',
        init() {},
        destroy() {
          calls.push('broken-destroy');
          throw new Error('synthetic destroy failure');
        },
      },
      { name: 'later-destroy', init() {}, destroy() { calls.push('later-destroy'); } },
    ],
    context: {},
  });
  lifecycle.init();
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.doesNotThrow(() => lifecycle.destroy());
    assert.doesNotThrow(() => lifecycle.destroy());
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(calls, ['broken-destroy', 'later-destroy'],
    'a throwing hook must not prevent later cleanup or cause a second pass');
  assert.throws(() => lifecycle.init(), /lifecycle is destroyed/);
});

function makeLifecycleBus() {
  const listeners = new Map();
  return {
    on(event, listener) {
      const set = listeners.get(event) || new Set();
      set.add(listener);
      listeners.set(event, set);
      return () => set.delete(listener);
    },
    emit(event, payload) {
      for (const listener of listeners.get(event) || []) listener(payload);
    },
  };
}

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
