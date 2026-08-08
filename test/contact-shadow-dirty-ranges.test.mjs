import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createDynamicBufferCoordinator,
  unregisterDynamicBufferOwner,
} from '../src/render/dynamicBufferRanges.js';
import { createContactShadowPool, syncContactShadowPool } from '../src/render/renderer.js';

const previousDocument = globalThis.document;
if (!globalThis.document) {
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') return { style: {}, appendChild() {}, addEventListener() {} };
      const gradient = { addColorStop() {} };
      const context = {
        canvas: { width: 64, height: 64 },
        createRadialGradient: () => gradient,
        fillRect() {},
        fillStyle: '',
      };
      return {
        width: 64,
        height: 64,
        style: {},
        addEventListener() {},
        getContext: () => context,
      };
    },
  };
}

test.after(() => {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
});

function createShadowFixture(id) {
  const mesh = new THREE.Object3D();
  mesh.position.set(id * 3, 0, id * -2);
  mesh.visible = true;
  mesh.userData.hasContactShadow = true;
  mesh.userData.contactShadowRadius = 18 + (id % 5);
  return {
    entity: { id, alive: true, type: id % 7 === 0 ? 'station' : 'ship', radius: 20 },
    mesh,
  };
}

function publish(coordinator, scene, camera, attribute, { initial = false } = {}) {
  const epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  const ranges = attribute.updateRanges.map(({ start, count }) => ({ start, count }));
  if (attribute.updateRanges.length > 0) {
    if (!initial) attribute.clearUpdateRanges();
    attribute.onUploadCallback();
  }
  coordinator.disarm(epoch);
  return ranges;
}

function requestedBytes(owner) {
  return owner.diagnostics.requestedUploadBytes;
}

function logicalBytes(owner) {
  return owner.diagnostics.logicalBytesChanged;
}

test('contact shadows publish retained matrix ranges and retire the owner through growth', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();
  const pool = createContactShadowPool(scene);
  const fixtures = Array.from({ length: 12 }, (_, index) => createShadowFixture(index + 1));
  const meshes = new Map(fixtures.map(({ entity, mesh }) => [entity.id, mesh]));

  assert.ok(pool.dynamicBufferOwner);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 1);
  syncContactShadowPool(pool, fixtures.map(({ entity }) => entity), meshes);
  assert.equal(pool.mesh.count, 12);
  assert.equal(pool.mesh.visible, true);
  assert.equal(pool.records.size, 12);

  const initialAttribute = pool.mesh.instanceMatrix;
  assert.deepEqual(
    publish(coordinator, scene, camera, initialAttribute, { initial: true }),
    [{ start: 0, count: initialAttribute.array.length }],
    'the initial 256-slot allocation is uploaded exactly once',
  );

  const staticVersion = initialAttribute.version;
  syncContactShadowPool(pool, fixtures.map(({ entity }) => entity), meshes);
  assert.deepEqual(publish(coordinator, scene, camera, initialAttribute), []);
  assert.equal(initialAttribute.version, staticVersion,
    'an unchanged contact-shadow frame publishes no range or upload version');

  const countOnlyRequestedBefore = requestedBytes(pool.dynamicBufferOwner);
  syncContactShadowPool(pool, fixtures.slice(0, 6).map(({ entity }) => entity), meshes);
  assert.equal(pool.mesh.count, 6);
  assert.deepEqual(publish(coordinator, scene, camera, initialAttribute), [],
    'shrinking only the draw count does not manufacture a matrix upload');
  assert.equal(requestedBytes(pool.dynamicBufferOwner), countOnlyRequestedBefore);

  const restoreRequestedBefore = requestedBytes(pool.dynamicBufferOwner);
  syncContactShadowPool(pool, fixtures.map(({ entity }) => entity), meshes);
  assert.deepEqual(
    publish(coordinator, scene, camera, initialAttribute),
    [{ start: 6 * 16, count: 6 * 16 }],
    'restoring removed shadows republishes only the newly active tail',
  );
  assert.equal(
    requestedBytes(pool.dynamicBufferOwner) - restoreRequestedBefore,
    6 * 16 * Float32Array.BYTES_PER_ELEMENT,
  );

  const matrixBaseline = initialAttribute.array.slice();
  for (const fixture of fixtures) fixture.mesh.position.x += 9;
  const rangedRequestedBefore = requestedBytes(pool.dynamicBufferOwner);
  const rangedLogicalBefore = logicalBytes(pool.dynamicBufferOwner);
  syncContactShadowPool(pool, fixtures.map(({ entity }) => entity), meshes);
  assert.deepEqual(
    publish(coordinator, scene, camera, initialAttribute),
    [{ start: 0, count: 12 * 16 }],
  );
  const rangedRequested = requestedBytes(pool.dynamicBufferOwner) - rangedRequestedBefore;
  const rangedLogical = logicalBytes(pool.dynamicBufferOwner) - rangedLogicalBefore;
  assert.equal(rangedRequested, 12 * 16 * Float32Array.BYTES_PER_ELEMENT);
  assert.equal(rangedLogical, rangedRequested);
  const rangedMatrixResult = initialAttribute.array.slice();
  const rangedCount = pool.mesh.count;
  const rangedOrder = [...pool.records.keys()];

  for (const fixture of fixtures) fixture.mesh.position.x -= 9;
  syncContactShadowPool(pool, fixtures.map(({ entity }) => entity), meshes);
  publish(coordinator, scene, camera, initialAttribute);
  assert.deepEqual(initialAttribute.array, matrixBaseline,
    'the matched full-span arm starts from the exact same matrix baseline');

  coordinator.getDiagnostics().setProbeForceFullUploads(true);
  for (const fixture of fixtures) fixture.mesh.position.x += 9;
  const fullRequestedBefore = requestedBytes(pool.dynamicBufferOwner);
  const fullLogicalBefore = logicalBytes(pool.dynamicBufferOwner);
  syncContactShadowPool(pool, fixtures.map(({ entity }) => entity), meshes);
  assert.deepEqual(
    publish(coordinator, scene, camera, initialAttribute),
    [{ start: 0, count: initialAttribute.array.length }],
  );
  coordinator.getDiagnostics().setProbeForceFullUploads(false);
  const fullRequested = requestedBytes(pool.dynamicBufferOwner) - fullRequestedBefore;
  const fullLogical = logicalBytes(pool.dynamicBufferOwner) - fullLogicalBefore;
  assert.equal(fullRequested, 256 * 16 * Float32Array.BYTES_PER_ELEMENT);
  assert.equal(fullLogical, rangedLogical,
    'ranged and diagnostic full-span variants perform identical logical matrix writes');
  assert.deepEqual(initialAttribute.array, rangedMatrixResult,
    'ranged and diagnostic full-span variants produce identical matrix bytes');
  assert.equal(pool.mesh.count, rangedCount);
  assert.deepEqual([...pool.records.keys()], rangedOrder,
    'ranged and diagnostic full-span variants retain identical record order');
  assert.ok(1 - (rangedRequested / fullRequested) >= 0.25,
    'the ordinary 12-shadow prefix clears the existing 25% upload-byte keep threshold');

  pool.records.clear();
  const repopulateRequestedBefore = requestedBytes(pool.dynamicBufferOwner);
  syncContactShadowPool(pool, fixtures.map(({ entity }) => entity), meshes);
  assert.deepEqual(
    publish(coordinator, scene, camera, initialAttribute),
    [{ start: 0, count: 12 * 16 }],
    'floating-origin cache invalidation republishes every rebuilt active matrix');
  assert.equal(
    requestedBytes(pool.dynamicBufferOwner) - repopulateRequestedBefore,
    12 * 16 * Float32Array.BYTES_PER_ELEMENT,
  );

  coordinator.handleContextRestored();
  assert.deepEqual(
    publish(coordinator, scene, camera, initialAttribute, { initial: true }),
    [{ start: 0, count: initialAttribute.array.length }],
    'context restoration republishes the complete resident allocation',
  );

  const oldOwner = pool.dynamicBufferOwner;
  const oldAttribute = pool.mesh.instanceMatrix;
  for (let id = 13; id <= 257; id++) {
    const fixture = createShadowFixture(id);
    fixtures.push(fixture);
    meshes.set(id, fixture.mesh);
  }
  syncContactShadowPool(pool, fixtures.map(({ entity }) => entity), meshes);
  assert.equal(pool.mesh.count, 257);
  assert.equal(pool.capacity, 512);
  assert.notEqual(pool.dynamicBufferOwner, oldOwner);
  assert.equal(oldOwner.coordinator, null);
  assert.equal(Object.hasOwn(oldAttribute, 'onUploadCallback'), false);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 1,
    'growth retires the old callback and retains exactly one contact-shadow owner');
  const grownAttribute = pool.mesh.instanceMatrix;
  assert.deepEqual(
    publish(coordinator, scene, camera, grownAttribute, { initial: true }),
    [{ start: 0, count: grownAttribute.array.length }],
    'the replacement allocation is fully initialized once',
  );

  assert.equal(unregisterDynamicBufferOwner(pool.dynamicBufferOwner), true);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 0);
  pool.mesh.dispose();
});

test('contact-shadow range validation fails before matrix or cache mutation', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const pool = createContactShadowPool(scene);
  const fixture = createShadowFixture(1);
  const meshes = new Map([[fixture.entity.id, fixture.mesh]]);
  syncContactShadowPool(pool, [fixture.entity], meshes);

  const owner = pool.dynamicBufferOwner;
  const bindings = owner.bindings;
  const matrixBefore = pool.mesh.instanceMatrix.array.slice();
  const recordBefore = { ...pool.records.get(fixture.entity.id) };
  fixture.mesh.position.x += 20;
  owner.bindings = [];
  assert.throws(
    () => syncContactShadowPool(pool, [fixture.entity], meshes),
    /has no tracked attribute 0/,
  );
  assert.deepEqual(pool.mesh.instanceMatrix.array, matrixBefore,
    'a rejected range cannot leave an unpublishable matrix write behind');
  assert.deepEqual(pool.records.get(fixture.entity.id), recordBefore,
    'a rejected range cannot make the CPU pose cache lie about the matrix');
  owner.bindings = bindings;

  assert.equal(unregisterDynamicBufferOwner(owner), true);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 0);
  pool.mesh.dispose();
});
