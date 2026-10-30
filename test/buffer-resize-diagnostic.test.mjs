import test from 'node:test';
import assert from 'node:assert/strict';

import { createBufferResizeDiagnostic } from '../src/render/bufferResizeDiagnostic.js';

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
