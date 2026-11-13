import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/addons/libs/meshopt_decoder.module.js';
import { registerEmbeddedKtx2Textures } from '../src/render/embeddedKtx2Textures.js';
import { buildStaticBatchGeometrySteps, normalizeStaticBatchGeometries } from '../src/render/partsLibrary.js';
import { clearStaticBatchGeometryCacheForTests } from '../src/render/staticBatchGeometryCache.js';

function angledIndexedGeometry(withNormals = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 3, 1]);
  if (withNormals) geometry.computeVertexNormals();
  return geometry;
}

test('normal-less and mixed inputs keep flat-shaded non-indexed fallback', () => {
  const noNormals = angledIndexedGeometry();
  const [flat] = normalizeStaticBatchGeometries([noNormals]);
  assert.equal(flat.index, null);
  assert.equal(flat.getAttribute('position').count, 6);
  const normal = flat.getAttribute('normal');
  assert.deepEqual([normal.getX(0), normal.getY(0), normal.getZ(0)], [0, 0, 1]);
  assert.deepEqual([normal.getX(3), normal.getY(3), normal.getZ(3)], [0, 1, 0]);

  const indexed = angledIndexedGeometry(true);
  const unindexed = indexed.toNonIndexed();
  const mixed = normalizeStaticBatchGeometries([indexed, unindexed]);
  assert.ok(mixed.every((geometry) => geometry.index === null));
  assert.deepEqual(Array.from(mixed[0].attributes.normal.array), Array.from(unindexed.attributes.normal.array));
});

test('explicit topology-qualified callers retain their existing normal generation', () => {
  const geometry = angledIndexedGeometry();
  const [result] = normalizeStaticBatchGeometries([geometry], { preserveIndexedGeometry: true });
  assert.equal(result, geometry);
  assert.ok(result.index);
  assert.ok(result.getAttribute('normal'));
  assert.ok(result.getAttribute('normal').getY(0) > 0);
  assert.ok(result.getAttribute('normal').getZ(0) > 0);
});

test('automatic batching excludes unreferenced extreme vertices from bounds', () => {
  const geometry = angledIndexedGeometry(true);
  const positions = [...geometry.getAttribute('position').array, 100000, 100000, 100000];
  const normals = [...geometry.getAttribute('normal').array, 0, 1, 0];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const [result] = normalizeStaticBatchGeometries([geometry]);
  assert.equal(result.index, null);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  assert.deepEqual(result.boundingBox.max.toArray(), [1, 1, 1]);
  assert.ok(result.boundingSphere.radius < 2);
});

test('automatic batching does not preserve an out-of-range index', () => {
  const geometry = angledIndexedGeometry(true);
  geometry.setIndex([0, 1, 2, 0, 3, 99]);
  const [result] = normalizeStaticBatchGeometries([geometry]);
  assert.equal(result.index, null);
});

function promotePosition(geometry) {
  const position = geometry.getAttribute('position');
  if (position.array instanceof Float32Array) return;
  const array = new Float32Array(position.count * position.itemSize);
  for (let i = 0; i < position.count; i++) {
    for (let c = 0; c < position.itemSize; c++) array[i * position.itemSize + c] = position.getComponent(i, c);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(array, position.itemSize));
}

function buildBucket(mesh, partMatrix) {
  const primitive = { geometry: mesh.geometry, matrix: mesh.matrixWorld.clone(), name: mesh.name };
  const record = { url: 'mining-render-package' };
  const steps = buildStaticBatchGeometrySteps({ tags: { lod: 'lod0' }, urls: new Set([record.url]),
    entries: [{ record, primitive, partMatrix }] });
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

function legacyExpandedBucket(mesh, partMatrix) {
  const geometry = mesh.geometry.clone();
  promotePosition(geometry);
  geometry.applyMatrix4(mesh.matrixWorld);
  geometry.applyMatrix4(partMatrix);
  return geometry.toNonIndexed();
}

test('shipped station batches retain every transformed attribute and material range', async () => {
  clearStaticBatchGeometryCacheForTests();
  const bytes = await readFile(new URL('../assets/ships/release/render-packages/mining/render.glb', import.meta.url));
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader({ parse(_bytes, onLoad) { onLoad(new THREE.CompressedTexture([], 4, 4)); } });
  loader.register(registerEmbeddedKtx2Textures);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const source = ['LOD0_Hull', 'LOD0_Hull_graphite'].map((name) => gltf.scene.getObjectByName(name));
  assert.ok(source.every((mesh) => mesh?.isMesh && mesh.geometry.index && mesh.geometry.getAttribute('normal')));
  const partMatrix = new THREE.Matrix4().compose(new THREE.Vector3(2, 3, -4),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.3, -0.2)), new THREE.Vector3(1.2, 0.8, 1.1));
  const actual = source.map((mesh) => buildBucket(mesh, partMatrix));
  assert.ok(actual.every((geometry) => geometry.index), 'authored indexed buffers remain indexed');
  const expected = source.map((mesh) => legacyExpandedBucket(mesh, partMatrix));
  const combined = mergeGeometries(normalizeStaticBatchGeometries(actual), true);
  const reference = mergeGeometries(expected, true);
  assert.ok(combined?.index);
  assert.deepEqual(combined.groups, reference.groups, 'material slots retain their exact draw ranges');
  const expanded = combined.toNonIndexed();
  assert.deepEqual(Object.keys(expanded.attributes).sort(), Object.keys(reference.attributes).sort());
  for (const name of Object.keys(reference.attributes)) {
    const a = expanded.getAttribute(name), b = reference.getAttribute(name);
    assert.equal(a.itemSize, b.itemSize, `${name} item size`);
    assert.equal(a.normalized, b.normalized, `${name} normalization`);
    assert.deepEqual(a.array, b.array, `${name} triangle order and values`);
  }
  clearStaticBatchGeometryCacheForTests();
});
