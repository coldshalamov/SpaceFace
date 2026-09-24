import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAssetResidencyRegistry,
  protectSharedGpuResource,
} from '../src/render/assetResidency.js';

function gpuResource(label, byteSize = 1024) {
  let disposals = 0;
  const resource = {
    label,
    userData: {},
    byteSize,
    dispose() { disposals++; },
  };
  return { resource, disposals: () => disposals };
}

// A boundary-shaped owner: enough of Object3D for the sweep's detach check and the
// registry's 'removed' listener hookup.
function boundaryOwner(name) {
  const listeners = new Map();
  return {
    name,
    isObject3D: true,
    parent: null,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    },
    dispatchRemoved() {
      for (const fn of [...(listeners.get('removed') || [])]) fn();
    },
  };
}

test('detached unclaimed boundary owners release; claimed and attached owners survive', () => {
  const registry = createAssetResidencyRegistry();
  const geometry = gpuResource('geometry', 12);
  protectSharedGpuResource(geometry.resource);
  registry.registerAsset('ship:hornet', [geometry.resource], { byteSize: 12 });

  const dead = boundaryOwner('dead-boundary');
  const parked = boundaryOwner('parked-boundary');
  const attached = boundaryOwner('attached-boundary');
  attached.parent = { isObject3D: true };

  assert.equal(registry.retain('ship:hornet', dead, { role: 'current-sector' }), true);
  registry.registerAsset('ship:mule', [gpuResource('g2', 8).resource], { byteSize: 8 });
  assert.equal(registry.retain('ship:mule', parked, { role: 'current-sector' }), true);
  assert.equal(registry.retain('ship:mule', attached, { role: 'current-sector' }), true);

  const claimed = new Set([parked]);
  const released = registry.releaseDetachedBoundaryOwners({
    reason: 'test-sweep',
    isClaimed: (owner) => claimed.has(owner),
  });

  assert.deepEqual(released, [dead], 'only the detached unclaimed boundary is released');
  assert.equal(geometry.disposals(), 1, 'dead boundary asset evicts at zero refs');
  assert.equal(registry.diagnostics().assets.some((a) => a.key === 'ship:hornet'), false,
    'dead boundary asset row evicted');
  assert.equal(registry.diagnostics().assets.find((a) => a.key === 'ship:mule').refCount, 2,
    'claimed and attached owners keep their assets');
});

test('a detached boundary under a detached wrapper is swept via custom isDetached', () => {
  const registry = createAssetResidencyRegistry();
  const geometry = gpuResource('geometry', 12);
  registry.registerAsset('ship:wasp', [geometry.resource], { byteSize: 12 });
  const wrapper = { isObject3D: true, parent: null };
  const boundary = boundaryOwner('nested-boundary');
  boundary.parent = wrapper; // interior node: 'removed' can never fire on it
  const scene = { isScene: true };
  assert.equal(registry.retain('ship:wasp', boundary, { role: 'current-sector' }), true);

  const released = registry.releaseDetachedBoundaryOwners({
    isDetached: (owner) => {
      let root = owner;
      while (root.parent) root = root.parent;
      return root !== scene && root.isScene !== true;
    },
    isClaimed: () => false,
  });

  assert.deepEqual(released, [boundary]);
  assert.equal(geometry.disposals(), 1);
  assert.equal(registry.diagnostics().residentAssets, 0);
});

test('non-Object3D owners are never swept', () => {
  const registry = createAssetResidencyRegistry();
  const geometry = gpuResource('geometry', 12);
  registry.registerAsset('pkg:a', [geometry.resource], { byteSize: 12 });
  const cacheOwner = Object.freeze({ type: 'render-package', contentHash: 'abc' });
  assert.equal(registry.retain('pkg:a', cacheOwner, { role: 'render-package-cache' }), true);

  const released = registry.releaseDetachedBoundaryOwners({ isClaimed: () => false });
  assert.deepEqual(released, []);
  assert.equal(registry.diagnostics().assets[0].refCount, 1);
});
