// ROCK-04 — `THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index 1. Make
// sure all geometries have the same number of attributes.` logged 6-13 times per Swarm run.
//
// The caller is scenarioPropBatching.mergeOpaqueMeshes, which batches the opaque leaves of a
// packaged place GLB by material. Several shipped Swarm furniture bodies author one primitive of
// a material group WITH a TANGENT and the rest without (`place_asteroid_graffiti`,
// `place_container_rack`, `place_transponder_gate` all do this for `Material_Emissive_Warm`).
// mergeGeometries refuses that mix, returned null, and mergeOpaqueMeshes threw — which failed the
// whole packaged-prop commit closed, so the prop published no authored body at all.
//
// These tests use the real shipped asset and a synthetic group mismatched the same way, and fail
// if the mismatch is left for three to reject.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/addons/libs/meshopt_decoder.module.js';
import { registerEmbeddedKtx2Textures } from '../src/render/embeddedKtx2Textures.js';
import { batchPackagedPropOpaqueMeshes } from '../src/render/scenarioPropBatching.js';

/** A tangent-carrying quad and a plain quad, both opaque and sharing one material. */
function mismatchedGroup() {
  const material = new THREE.MeshStandardMaterial({ name: 'Material_Emissive_Warm' });
  const withTangent = new THREE.PlaneGeometry(1, 1);
  withTangent.setAttribute('tangent', new THREE.Float32BufferAttribute([
    1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1,
  ], 4));
  const withoutTangent = new THREE.PlaneGeometry(1, 1);
  const root = new THREE.Group();
  const a = new THREE.Mesh(withTangent, material);
  const b = new THREE.Mesh(withoutTangent, material);
  b.position.set(2, 0, 0);
  root.add(a, b);
  return { root, material, sourceTriangles: 4 };
}

test('a material group with and without TANGENT merges instead of failing', () => {
  const { root, material, sourceTriangles } = mismatchedGroup();
  // The failure the packet reports: three refuses the raw pair.
  const a = root.children[0].geometry.clone();
  const b = root.children[1].geometry.clone();
  const refused = mergeGeometries([a, b], false);
  a.dispose(); b.dispose();
  assert.equal(refused, null, 'the shipped mismatch really is what mergeGeometries rejects');

  const errors = [];
  const originalError = console.error;
  console.error = (...args) => { errors.push(args.join(' ')); };
  let batched;
  try { batched = batchPackagedPropOpaqueMeshes(root); } finally { console.error = originalError; }
  assert.deepEqual(errors, [], 'no mergeGeometries failure is logged');

  const merged = [];
  batched.traverse((object) => { if (object.isMesh && object.material === material) merged.push(object); });
  assert.equal(merged.length, 1, 'the whole material group is one batch');
  assert.equal(merged[0].geometry.index.count / 3, sourceTriangles,
    'both primitives survive the merge');
  assert.ok(merged[0].geometry.getAttribute('tangent'), 'the filled stream keeps the tangent the merge needs');
  const tangent = merged[0].geometry.getAttribute('tangent');
  assert.equal(tangent.itemSize, 4);
  for (let i = 0; i < tangent.count; i += 1) {
    assert.equal(tangent.getW(i), 1, 'filled tangents keep the authored handedness bit');
  }
  merged[0].geometry.dispose();
});

test('a shipped Swarm furniture GLB whose material group mixes attributes batches clean', async () => {
  await MeshoptDecoder.ready;
  const bytes = await readFile(new URL('../assets/ships/release/parts/places/place_asteroid_graffiti.glb', import.meta.url));
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader({ parse(_bytes, onLoad) { onLoad(new THREE.CompressedTexture([], 4, 4)); } });
  loader.register(registerEmbeddedKtx2Textures);
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const warm = [];
  root.traverse((object) => {
    if (object.isMesh && object.material && object.material.name === 'Material_Emissive_Warm') warm.push(object);
  });
  assert.ok(warm.length >= 2, `place_asteroid_graffiti still ships a shared-material group (${warm.length})`);
  // The shipped mismatch in this body: at least one warm primitive carries a tangent while a
  // sibling under the same material does not.
  const carried = new Set(warm.map((mesh) => Object.keys(mesh.geometry.attributes).sort().join(',')));
  assert.ok(carried.size > 1, `the shipped warm group really mixes attribute sets (${[...carried].join(' vs ')})`);
  const triangleCount = (meshes) => meshes.reduce((sum, mesh) => {
    const geometry = mesh.geometry;
    return sum + (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
  }, 0);
  const before = triangleCount(warm);

  const errors = [];
  const originalError = console.error;
  console.error = (...args) => { errors.push(args.join(' ')); };
  try { batchPackagedPropOpaqueMeshes(root); } finally { console.error = originalError; }
  assert.deepEqual(errors, [], 'the shipped asset no longer trips mergeGeometries');

  const warmAfter = [];
  root.traverse((object) => {
    if (object.isMesh && object.material && object.material.name === 'Material_Emissive_Warm') warmAfter.push(object);
  });
  const byMaterial = new Map();
  for (const mesh of warmAfter) {
    const list = byMaterial.get(mesh.material) || [];
    list.push(mesh);
    byMaterial.set(mesh.material, list);
  }
  for (const [material, meshes] of byMaterial) {
    assert.equal(meshes.length, 1, `every shared-material group collapsed (${material.name}: ${meshes.length} draws left)`);
  }
  // Each merged leaf absorbed a contiguous run of the original triangles; summing per-material
  // totals proves nothing was dropped by the weld.
  const perMaterialTriangles = new Map();
  for (const mesh of warm) {
    const list = perMaterialTriangles.get(mesh.material) || [];
    list.push(mesh);
    perMaterialTriangles.set(mesh.material, list);
  }
  let expectedTriangles = 0;
  for (const meshes of perMaterialTriangles.values()) expectedTriangles += triangleCount(meshes);
  assert.equal(triangleCount(warmAfter), expectedTriangles, 'no triangle was dropped by the merged batch');
  assert.ok(before > 0);
  root.traverse((object) => { if (object.isMesh) object.geometry.dispose(); });
});
