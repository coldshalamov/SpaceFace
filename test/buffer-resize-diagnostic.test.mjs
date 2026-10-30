import test from 'node:test';
import assert from 'node:assert/strict';

import { createBufferResizeDiagnostic } from '../src/render/bufferResizeDiagnostic.js';

function sceneWith(object) {
  return { traverse(callback) { callback(object); } };
}

function meshFixture(geometry, { name = 'Authored hull', uuid = 'object-1' } = {}) {
  return { name, uuid, type: 'Mesh', geometry };
}

function geometryFixture(attributes = {}, { uuid = 'geometry-1', name = 'Authored geometry' } = {}) {
  return { uuid, name, type: 'BufferGeometry', attributes, index: null, userData: {} };
}

function bufferAttribute(array, { uuid = 'attribute-1', version = 0, count = array.length / 3 } = {}) {
  return { uuid, version, count, array, updateRange: { offset: 0, count: -1 } };
}

const SIZE_ERROR = new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");

test('reports changed byte length for the same uploaded attribute identity', () => {
  const diagnostic = createBufferResizeDiagnostic();
  const position = bufferAttribute(new Float32Array(9));
  const geometry = geometryFixture({ position });
  const object = meshFixture(geometry);
  const scene = sceneWith(object);
  diagnostic.snapshotSuccessfulDraw({ geometry, object, contextGeneration: 3 });

  position.array = new Float32Array(12);
  position.count = 4;
  position.version++;
  const failure = diagnostic.captureFailure(SIZE_ERROR, scene, 3);

  assert.equal(failure.candidateCount, 1);
  assert.equal(failure.candidates[0].identityChanged, false);
  assert.equal(failure.candidates[0].previous.byteLength, 36);
  assert.equal(failure.candidates[0].current.byteLength, 48);
  assert.equal(failure.candidates[0].current.owner.name, 'Authored hull');
  assert.equal(failure.candidates[0].current.geometry.uuid, 'geometry-1');
  assert.match(failure.error.stack, /buffer-resize-diagnostic\.test/);
});

test('does not report unchanged attributes and retains the last shape across a context generation', () => {
  const diagnostic = createBufferResizeDiagnostic();
  const position = bufferAttribute(new Float32Array(9));
  const geometry = geometryFixture({ position });
  const object = meshFixture(geometry);
  const scene = sceneWith(object);
  diagnostic.snapshotSuccessfulDraw({ geometry, object, contextGeneration: 3 });

  assert.equal(diagnostic.captureFailure(SIZE_ERROR, scene, 3).candidateCount, 0);
  assert.equal(diagnostic.captureFailure(SIZE_ERROR, scene, 4).candidateCount, 0);
  position.array = new Float32Array(12);
  position.version++;
  const failure = diagnostic.captureFailure(SIZE_ERROR, scene, 4);
  assert.equal(failure.candidateCount, 1);
  assert.equal(failure.candidates[0].previous.contextGeneration, 3);
  assert.equal(failure.candidates[0].current.contextGeneration, 4);
});

test('distinguishes a replacement attribute in the same geometry slot', () => {
  const diagnostic = createBufferResizeDiagnostic();
  const geometry = geometryFixture({ position: bufferAttribute(new Float32Array(9), { uuid: 'old-position' }) });
  const object = meshFixture(geometry);
  const scene = sceneWith(object);
  diagnostic.snapshotSuccessfulDraw({ geometry, object, contextGeneration: 3 });

  geometry.attributes.position = bufferAttribute(new Float32Array(12), { uuid: 'new-position', count: 4 });
  const failure = diagnostic.captureFailure(SIZE_ERROR, scene, 3);
  assert.equal(failure.candidateCount, 1);
  assert.equal(failure.candidates[0].identityChanged, true);
  assert.equal(failure.candidates[0].previous.attributeUuid, 'old-position');
  assert.equal(failure.candidates[0].current.attributeUuid, 'new-position');
});

test('prefers shared BufferAttribute history over a replaced geometry-slot history', () => {
  const diagnostic = createBufferResizeDiagnostic();
  const shared = bufferAttribute(new Float32Array(9), { uuid: 'shared-position' });
  const replacement = bufferAttribute(new Float32Array(12), { uuid: 'replacement-position', count: 4 });
  const geometry = geometryFixture({ position: shared });
  const object = meshFixture(geometry);
  const scene = sceneWith(object);
  diagnostic.snapshotSuccessfulDraw({ geometry, object, contextGeneration: 3 });

  geometry.attributes.position = replacement;
  diagnostic.snapshotSuccessfulDraw({ geometry, object, contextGeneration: 3 });
  geometry.attributes.position = shared;
  shared.array = new Float32Array(12);
  shared.version++;

  const failure = diagnostic.captureFailure(SIZE_ERROR, scene, 3);
  assert.equal(failure.candidateCount, 1);
  assert.equal(failure.candidates[0].changeKind, 'byte-length');
  assert.equal(failure.candidates[0].identityChanged, false);
  assert.equal(failure.candidates[0].previous.byteLength, 36);
  assert.equal(failure.candidates[0].current.byteLength, 48);
  assert.equal(failure.candidates[0].previous.attributeUuid, 'shared-position');
});

test('same-identity byte resize outranks an identity replacement with a size change', () => {
  const diagnostic = createBufferResizeDiagnostic();
  const oldPosition = bufferAttribute(new Float32Array(9), { uuid: 'old-position' });
  const replacementGeometry = geometryFixture({ position: oldPosition }, { uuid: 'replacement-geometry' });
  const replacementObject = meshFixture(replacementGeometry, { uuid: 'replacement-object' });
  diagnostic.snapshotSuccessfulDraw({ geometry: replacementGeometry, object: replacementObject, contextGeneration: 3 });
  replacementGeometry.attributes.position = bufferAttribute(new Float32Array(12), { uuid: 'new-position', count: 4 });

  const resizedPosition = bufferAttribute(new Float32Array(9), { uuid: 'resized-position' });
  const resizedGeometry = geometryFixture({ position: resizedPosition }, { uuid: 'resized-geometry' });
  const resizedObject = meshFixture(resizedGeometry, { uuid: 'resized-object' });
  diagnostic.snapshotSuccessfulDraw({ geometry: resizedGeometry, object: resizedObject, contextGeneration: 3 });
  resizedPosition.array = new Float32Array(12);
  resizedPosition.version++;

  const scene = { traverse(callback) { callback(replacementObject); callback(resizedObject); } };
  const failure = diagnostic.captureFailure(SIZE_ERROR, scene, 3);
  assert.equal(failure.candidateCount, 2);
  assert.equal(failure.candidates[0].changeKind, 'byte-length');
  assert.equal(failure.candidates[0].current.geometry.uuid, 'resized-geometry');
  assert.equal(failure.candidates[0].identityChanged, false);
  assert.equal(failure.candidates[1].changeKind, 'identity-or-layout');
  assert.equal(failure.candidates[1].current.geometry.uuid, 'replacement-geometry');
  assert.equal(failure.candidates[1].identityChanged, true);
});

test('tracks interleaved attribute data identity and layout', () => {
  const diagnostic = createBufferResizeDiagnostic();
  const data = { uuid: 'interleaved-data', version: 1, count: 3, stride: 8, array: new Float32Array(24) };
  const normal = { uuid: 'normal-attribute', isInterleavedBufferAttribute: true, data, offset: 3, itemSize: 3, count: 3 };
  const geometry = geometryFixture({ normal });
  const object = meshFixture(geometry);
  const scene = sceneWith(object);
  diagnostic.snapshotSuccessfulDraw({ geometry, object, contextGeneration: 8 });

  data.array = new Float32Array(32);
  data.count = 4;
  data.version++;
  const failure = diagnostic.captureFailure(SIZE_ERROR, scene, 8);

  assert.equal(failure.candidateCount, 1);
  assert.equal(failure.candidates[0].slot, 'attribute:normal');
  assert.equal(failure.candidates[0].current.byteLength, 128);
  assert.deepEqual(failure.candidates[0].previous.interleaved, { stride: 8, offset: 3, itemSize: 3 });
  assert.deepEqual(failure.candidates[0].current.interleaved, { stride: 8, offset: 3, itemSize: 3 });
});

test('tracks index buffer type and byte length changes', () => {
  const diagnostic = createBufferResizeDiagnostic();
  const geometry = geometryFixture();
  geometry.index = bufferAttribute(new Uint16Array([0, 1, 2]), { uuid: 'index-attribute', count: 3 });
  const object = meshFixture(geometry);
  const scene = sceneWith(object);
  diagnostic.snapshotSuccessfulDraw({ geometry, object, contextGeneration: 8 });

  geometry.index.array = new Uint32Array([0, 1, 2]);
  geometry.index.version++;
  const failure = diagnostic.captureFailure(SIZE_ERROR, scene, 8);
  assert.equal(failure.candidateCount, 1);
  assert.equal(failure.candidates[0].slot, 'index');
  assert.equal(failure.candidates[0].previous.byteLength, 6);
  assert.equal(failure.candidates[0].current.byteLength, 12);
  assert.equal(failure.candidates[0].current.arrayType, 'Uint32Array');
});

test('caps changed-attribute evidence at sixteen candidates', () => {
  const diagnostic = createBufferResizeDiagnostic();
  const objects = [];
  for (let i = 0; i < 20; i++) {
    const position = bufferAttribute(new Float32Array(9), { uuid: `attribute-${i}` });
    const geometry = geometryFixture({ position }, { uuid: `geometry-${i}` });
    const object = meshFixture(geometry, { uuid: `object-${i}` });
    objects.push(object);
    diagnostic.snapshotSuccessfulDraw({ geometry, object, contextGeneration: 3 });
    position.array = new Float32Array(12);
    position.version++;
  }
  const scene = { traverse(callback) { for (const object of objects) callback(object); } };
  const failure = diagnostic.captureFailure(SIZE_ERROR, scene, 3);
  assert.equal(failure.candidateCount, 16);
  assert.equal(failure.candidates.length, 16);
});

test('late byte-length mismatch outranks normal version-only changes', () => {
  const diagnostic = createBufferResizeDiagnostic();
  const objects = [];
  for (let i = 0; i < 21; i++) {
    const position = bufferAttribute(new Float32Array(9), { uuid: `attribute-${i}` });
    const geometry = geometryFixture({ position }, { uuid: `geometry-${i}` });
    const object = meshFixture(geometry, { uuid: `object-${i}` });
    objects.push(object);
    diagnostic.snapshotSuccessfulDraw({ geometry, object, contextGeneration: 3 });
    if (i < 20) position.version++;
    else {
      position.array = new Float32Array(12);
      position.version++;
    }
  }
  const scene = { traverse(callback) { for (const object of objects) callback(object); } };
  const failure = diagnostic.captureFailure(SIZE_ERROR, scene, 3);
  assert.equal(failure.candidateCount, 1, 'version-only changes are not resize candidates');
  assert.equal(failure.candidates[0].changeKind, 'byte-length');
  assert.equal(failure.candidates[0].current.geometry.uuid, 'geometry-20');
  assert.equal(failure.candidates[0].previous.version, 0);
  assert.equal(failure.candidates[0].current.version, 1);
});

