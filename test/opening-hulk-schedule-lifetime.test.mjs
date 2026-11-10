import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { render, disposeRendererOwnedResources } from '../src/render/renderer.js';

for (const phase of ['animation', 'idle', 'timer']) {
  test(`retired opening warm cancels its pending ${phase} callback`, async (t) => {
    let nextId = 0, uses = 0;
    const pending = new Map();
    const schedule = (kind) => (fn) => {
      const id = ++nextId;
      pending.set(id, { kind, fn });
      return id;
    };
    for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setTimeout', 'clearTimeout']) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
      t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
    }
    globalThis.requestAnimationFrame = phase === 'timer' ? undefined : schedule('animation');
    globalThis.requestIdleCallback = phase === 'timer' ? undefined : schedule('idle');
    globalThis.cancelAnimationFrame = globalThis.cancelIdleCallback = (id) => pending.delete(id);
    globalThis.setTimeout = schedule('timer');
    globalThis.clearTimeout = (id) => pending.delete(id);
    const programs = new Map([['hulk', { cacheKey: 'hulk', getUniforms() { uses++; } }]]);
    const owner = {
      state: { mode: 'loading', world: {}, contextRestoreSeq: 1,
        render: { admissionRunGeneration: 1, firstPlayableFrameAt: null } },
      scene: new THREE.Scene(), cam: { obj: new THREE.PerspectiveCamera() },
      renderer: { properties: { get: () => ({ programs }) } },
      _selectPostRoute: () => 'test', _compilePostRoute: () => Promise.resolve(),
    };
    render._warmOpeningHulkProgramKeys.call(owner);
    await Promise.resolve();
    if (phase === 'idle') {
      const [id, callback] = [...pending][0];
      pending.delete(id);
      callback.fn();
    }
    assert.equal(pending.size, 1);
    const callback = [...pending.values()][0];
    assert.equal(callback.kind, phase);
    disposeRendererOwnedResources(owner);
    assert.equal(pending.size, 0, 'teardown removes scheduled work immediately');
    callback.fn(); // A callback already dispatched at teardown still cannot re-arm work.
    assert.equal(pending.size, 0);
    assert.equal(uses, 0);
    assert.equal(owner._openingHulkKeyWarmResource, null);
  });
}
