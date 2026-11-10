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

function createShadowFixture(id, scene) {
  const mesh = new THREE.Object3D();
  mesh.position.set(id * 3, 0, id * -2);
  mesh.visible = true;
  mesh.userData.hasContactShadow = true;
  mesh.userData.contactShadowRadius = 18 + (id % 5);
  scene.add(mesh);
  return {
    entity: { id, alive: true, type: 'ship', radius: 20 },
    mesh,
  };
}

function createReceiverFixture(scene) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2000, 2000, 1, 32), new THREE.MeshBasicMaterial());
  mesh.name = 'PoolTestDeck'; mesh.position.y = -2;
  mesh.userData.contactShadowReceivers = [{ nodeName: mesh.name, outerRadius: 1900, y: .5 }];
  scene.add(mesh);
  return { entity: { id: 'deck', alive: true, type: 'station', data: {} }, mesh };
}

function shadowFrame(fixtures, receiver) {
  return { records: [receiver, ...fixtures], contactShadows: fixtures };
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
  const receiver = createReceiverFixture(scene);
  const fixtures = Array.from({ length: 12 }, (_, index) => createShadowFixture(index + 1, scene));
  const meshes = new Map(fixtures.map(({ entity, mesh }) => [entity.id, mesh]));

  assert.ok(pool.dynamicBufferOwner);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 1);
  syncContactShadowPool(pool, shadowFrame(fixtures, receiver), meshes);
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
  syncContactShadowPool(pool, shadowFrame(fixtures, receiver), meshes);
  assert.deepEqual(publish(coordinator, scene, camera, initialAttribute), []);
  assert.equal(initialAttribute.version, staticVersion,
    'an unchanged contact-shadow frame publishes no range or upload version');

  const countOnlyRequestedBefore = requestedBytes(pool.dynamicBufferOwner);
  syncContactShadowPool(pool, shadowFrame(fixtures.slice(0, 6), receiver), meshes);
  assert.equal(pool.mesh.count, 6);
  assert.deepEqual(publish(coordinator, scene, camera, initialAttribute), [],
    'shrinking only the draw count does not manufacture a matrix upload');
  assert.equal(requestedBytes(pool.dynamicBufferOwner), countOnlyRequestedBefore);

  const restoreRequestedBefore = requestedBytes(pool.dynamicBufferOwner);
  syncContactShadowPool(pool, shadowFrame(fixtures, receiver), meshes);
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
  syncContactShadowPool(pool, shadowFrame(fixtures, receiver), meshes);
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
  syncContactShadowPool(pool, shadowFrame(fixtures, receiver), meshes);
  publish(coordinator, scene, camera, initialAttribute);
  assert.deepEqual(initialAttribute.array, matrixBaseline,
    'the matched full-span arm starts from the exact same matrix baseline');

  coordinator.getDiagnostics().setProbeForceFullUploads(true);
  for (const fixture of fixtures) fixture.mesh.position.x += 9;
  const fullRequestedBefore = requestedBytes(pool.dynamicBufferOwner);
  const fullLogicalBefore = logicalBytes(pool.dynamicBufferOwner);
  syncContactShadowPool(pool, shadowFrame(fixtures, receiver), meshes);
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
  syncContactShadowPool(pool, shadowFrame(fixtures, receiver), meshes);
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
    const fixture = createShadowFixture(id, scene);
    fixtures.push(fixture);
    meshes.set(id, fixture.mesh);
  }
  syncContactShadowPool(pool, shadowFrame(fixtures, receiver), meshes);
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

test('deferred growth clamps the frame, then activates an uploaded replacement', async () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const yields = [];
  const prepared = [];
  const pool = createContactShadowPool(scene, {
    deferGrowth: true,
    yieldToPostPaint: () => { yields.push(1); return Promise.resolve(); },
    prepareGpuResidency: (roots) => {
      prepared.push(roots.map((root) => root.count));
      return Promise.resolve();
    },
    shouldDeferGrowth: () => true,
  });
  const receiver = createReceiverFixture(scene);
  const fixtures = Array.from({ length: 12 }, (_, index) => createShadowFixture(index + 1, scene));
  const meshes = new Map(fixtures.map(({ entity, mesh }) => [entity.id, mesh]));

  syncContactShadowPool(pool, shadowFrame(fixtures, receiver), meshes);
  assert.equal(pool.mesh.count, 12);
  const firstMesh = pool.mesh;

  // Demand beyond capacity must not swap the mesh inside the sync pass — it clamps the frame
  // and queues detached growth instead.
  for (let id = 13; id <= 300; id++) {
    const fixture = createShadowFixture(id, scene);
    fixtures.push(fixture);
    meshes.set(id, fixture.mesh);
  }
  syncContactShadowPool(pool, shadowFrame(fixtures, receiver), meshes);
  assert.equal(pool.mesh, firstMesh, 'overflow demand leaves the live mesh in place');
  assert.equal(pool.mesh.count, 256, 'the frame clamps at current capacity');
  assert.equal(pool.capacity, 256);
  assert.ok(pool.pendingGrowth, 'a deferred growth admission is queued');

  await pool.pendingGrowth;
  assert.equal(yields.length, 1, 'growth yields past the present before building');
  assert.deepEqual(prepared, [[1]], 'the detached proxy is uploaded before activation');
  assert.notEqual(pool.mesh, firstMesh);
  assert.equal(pool.capacity, 512);
  assert.equal(pool.mesh.count, 0, 'the replacement activates unpublished, not mid-frame');
  assert.equal(pool.records.size, 0, 'stale CPU pose cache is invalidated on activation');

  // The next sync republishes every shadow into the grown buffer.
  syncContactShadowPool(pool, shadowFrame(fixtures, receiver), meshes);
  assert.equal(pool.mesh.count, 300);
  assert.equal(pool.records.size, 300);
  assert.equal(pool.pendingGrowth, null);

  assert.equal(unregisterDynamicBufferOwner(pool.dynamicBufferOwner), true);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 0);
  pool.mesh.dispose();
});

test('contact-shadow range validation fails before matrix or cache mutation', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const pool = createContactShadowPool(scene);
  const receiver = createReceiverFixture(scene);
  const fixture = createShadowFixture(1, scene);
  const meshes = new Map([[fixture.entity.id, fixture.mesh]]);
  syncContactShadowPool(pool, shadowFrame([fixture], receiver), meshes);

  const owner = pool.dynamicBufferOwner;
  const bindings = owner.bindings;
  const matrixBefore = pool.mesh.instanceMatrix.array.slice();
  const recordBefore = { ...pool.records.get(fixture.entity.id) };
  fixture.mesh.position.x += 20;
  owner.bindings = [];
  assert.throws(
    () => syncContactShadowPool(pool, shadowFrame([fixture], receiver), meshes),
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

test('contact pool republishes a changed receiver height and retires ink when that surface disappears', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const coordinator = createDynamicBufferCoordinator(scene), pool = createContactShadowPool(scene);
  const receiver = createReceiverFixture(scene), ship = createShadowFixture(1, scene);
  const frame = shadowFrame([ship], receiver);
  Object.freeze(frame.records); Object.freeze(frame.contactShadows); Object.freeze(frame);
  syncContactShadowPool(pool, frame);
  const attribute = pool.mesh.instanceMatrix;
  publish(coordinator, scene, camera, attribute, { initial: true });
  assert.ok(Math.abs(attribute.array[13] - (-1.5 + .025)) < 1e-6);
  receiver.mesh.position.y -= 1;
  syncContactShadowPool(pool, frame);
  assert.deepEqual(publish(coordinator, scene, camera, attribute), [{ start: 0, count: 16 }]);
  assert.ok(Math.abs(attribute.array[13] - (-2.5 + .025)) < 1e-6,
    'station motion updates the actual receiver height rather than retaining the old plane');
  receiver.mesh.visible = false;
  syncContactShadowPool(pool, frame);
  assert.equal(pool.mesh.count, 0);
  assert.equal(pool.records.size, 0);
  assert.equal(frame.contactShadows.length, 1, 'pool filtering never alters the shared frame');
  unregisterDynamicBufferOwner(pool.dynamicBufferOwner);
  pool.mesh.dispose();
});
