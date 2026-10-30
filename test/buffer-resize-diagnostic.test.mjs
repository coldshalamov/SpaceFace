import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { createBufferResizeDiagnostic, installBatchedMeshFailureDiagnostic, captureBatchedMeshFailure } from '../src/render/bufferResizeDiagnostic.js';
import { createRetainedRigidOpaqueBatchController, isRetiredRigidOpaqueBatch } from '../src/render/rigidOpaqueBatch.js';

function taggedSizeError(attribute, expectedByteLength, actualByteLength) {
  const error = new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");
  Object.defineProperty(error, '__sfBufferResizeDiagnostic', {
    value: { attribute, expectedByteLength, actualByteLength },
    enumerable: false,
    configurable: true,
  });
  return error;
}

function geometry(attributes = {}, { index = null, uuid = 'geometry-1' } = {}) {
  return { uuid, name: 'Authored geometry', type: 'BufferGeometry', attributes, index, userData: {} };
}

function sceneWith(object) {
  return { traverse(callback) { callback(object); } };
}

function mesh(geometryValue) {
  return { uuid: 'mesh-1', name: 'Authored hull', type: 'Mesh', geometry: geometryValue };
}

test('matches the exact failing attribute and consumes the temporary error reference', () => {
  const position = {
    uuid: 'position-1', version: 4, count: 4, itemSize: 3,
    array: new Float32Array(12),
  };
  const geometryValue = geometry({ position });
  const error = taggedSizeError(position, 36, 48);
  const diagnostic = createBufferResizeDiagnostic();

  const result = diagnostic.captureFailure(error, sceneWith(mesh(geometryValue)), 7);

  assert.equal(result.schema, 'spaceface.bufferResizeDiagnostic.v2');
  assert.equal(result.expectedByteLength, 36);
  assert.equal(result.actualByteLength, 48);
  assert.equal(result.matchingSceneSlotCount, 1);
  assert.equal(result.matchingSceneSlots[0].slot, 'attribute:position');
  assert.equal(result.matchingSceneSlots[0].owner.name, 'Authored hull');
  assert.equal(result.matchingSceneSlots[0].geometry.uuid, 'geometry-1');
  assert.equal(result.matchingSceneSlots[0].attribute.arrayType, 'Float32Array');
  assert.match(result.error.stack, /buffer-resize-diagnostic\.test/);
  assert.equal(Object.hasOwn(error, '__sfBufferResizeDiagnostic'), false);
});

test('matches interleaved data and index-buffer identities', () => {
  const interleavedData = { uuid: 'interleaved-data', version: 2, stride: 8, array: new Float32Array(32) };
  const normal = {
    uuid: 'normal-attribute', isInterleavedBufferAttribute: true,
    data: interleavedData, offset: 3, itemSize: 3, count: 4,
  };
  const geometryValue = geometry({ normal });
  const interleavedError = taggedSizeError(interleavedData, 96, 128);
  const diagnostic = createBufferResizeDiagnostic();
  const interleaved = diagnostic.captureFailure(interleavedError, sceneWith(mesh(geometryValue)), 2);

  assert.equal(interleaved.matchingSceneSlots[0].slot, 'attribute:normal');
  assert.equal(interleaved.matchingSceneSlots[0].attribute.isInterleaved, true);
  assert.deepEqual(interleaved.matchingSceneSlots[0].attribute.interleaved, { stride: 8, offset: 3 });

  const index = { uuid: 'index-attribute', version: 1, count: 3, array: new Uint32Array([0, 1, 2]) };
  const indexedGeometry = geometry({}, { index });
  const indexError = taggedSizeError(index, 6, 12);
  const indexed = diagnostic.captureFailure(indexError, sceneWith(mesh(indexedGeometry)), 3);
  assert.equal(indexed.matchingSceneSlots[0].slot, 'index');
  assert.equal(indexed.matchingSceneSlots[0].attribute.arrayType, 'Uint32Array');
});

test('ignores ordinary errors without the exact vendor diagnostic metadata', () => {
  const error = new Error('some other render error');
  const diagnostic = createBufferResizeDiagnostic();
  assert.equal(diagnostic.captureFailure(error, sceneWith(mesh(geometry())), 1), null);
  assert.equal(error.message, 'some other render error');
});

test('finds an instanced mesh matrix buffer outside geometry attributes', () => {
  const instanceMatrix = { itemSize: 16, count: 2, version: 3, array: new Float32Array(32) };
  const object = { ...mesh(geometry()), type: 'InstancedMesh', instanceMatrix };
  const error = taggedSizeError(instanceMatrix, 64, 128);
  const result = createBufferResizeDiagnostic().captureFailure(error, sceneWith(object), 4);
  assert.equal(result.matchingSceneSlotCount, 1);
  assert.equal(result.matchingSceneSlots[0].slot, 'object:instanceMatrix');
  assert.equal(result.matchingSceneSlots[0].owner.type, 'InstancedMesh');
  assert.equal(result.failingAttribute.arrayByteLength, 128);
  assert.equal(Object.hasOwn(error, '__sfBufferResizeDiagnostic'), false);
});


test('native disposed BatchedMesh reports its primitive identity and rethrows the original error', () => {
  assert.equal(installBatchedMeshFailureDiagnostic(THREE.BatchedMesh, isRetiredRigidOpaqueBatch), true);
  assert.equal(installBatchedMeshFailureDiagnostic(THREE.BatchedMesh), false);
  const parent = new THREE.Group(); parent.name = 'Owned parent';
  const mesh = new THREE.BatchedMesh(1, 3, 3, new THREE.MeshBasicMaterial());
  mesh.name = 'Retired batch'; parent.add(mesh);
  const uuid = mesh.uuid, geometryUuid = mesh.geometry.uuid;
  mesh.dispose();
  let thrown;
  try { mesh.onBeforeRender(null, null, new THREE.PerspectiveCamera(), mesh.geometry, mesh.material); }
  catch (error) { thrown = error; }
  assert.ok(thrown instanceof TypeError);
  const record = captureBatchedMeshFailure(thrown, 7);
  assert.equal(record.object.uuid, uuid);
  assert.equal(record.geometry.uuid, geometryUuid);
  assert.equal(record.parents[0].name, 'Owned parent');
  assert.equal(record.indirectTextureNull, true);
  assert.equal(record.matricesTextureNull, true);
  assert.equal(record.retirement, null, 'ordinary batches do not acquire rigid retirement tracking');
  assert.equal(record.contextGeneration, 7);
  assert.equal(captureBatchedMeshFailure(thrown, 7), null);
  assert.equal(JSON.stringify(record).includes('Owned parent'), true);
  mesh.material.dispose();
});

test('real rigid retirement and reattachment preserve caller evidence after teardown', async () => {
  const scene = new THREE.Scene(); scene.name = 'Original scene';
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const geometry = new THREE.BoxGeometry();
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  scene.add(root); scene.updateMatrixWorld(true);
  const controller = createRetainedRigidOpaqueBatchController({ scene, prepare: () => ({ ready: true }) });
  try {
    await controller.sync(root);
    const batch = scene.children.find(child => child.userData?.spacefaceRigidOpaqueBatch);
    assert.ok(batch);
    function retireFromOwner() { controller.rollback('diagnostic-test'); }
    function restoreSavedHome() { scene.add(batch); }
    retireFromOwner();
    assert.equal(isRetiredRigidOpaqueBatch(batch), true);
    restoreSavedHome();
    let thrown;
    try { batch.onBeforeRender(null, null, new THREE.PerspectiveCamera(), batch.geometry, batch.material); }
    catch (error) { thrown = error; }
    const dto = captureBatchedMeshFailure(thrown, 2);
    scene.remove(batch);
    controller.dispose();
    assert.equal(dto.retirement.canonicalRetired, true);
    assert.match(dto.retirement.stack, /retireFromOwner/);
    assert.match(dto.retirement.reattachment.stack, /restoreSavedHome/);
    assert.equal(dto.retirement.reattachment.parents[0].uuid, scene.uuid);
    assert.equal(dto.contextGeneration, 2);
    assert.doesNotThrow(() => JSON.stringify(dto));
  } finally {
    controller.dispose(); geometry.dispose(); material.dispose();
  }
});
