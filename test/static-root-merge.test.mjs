import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import { mergeRigidOpaqueAcrossRoot } from '../src/render/visualFactory.js';

function plate(material, x, name = 'plate') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), material);
  mesh.name = name;
  mesh.position.x = x;
  mesh.updateMatrixWorld(true);
  return mesh;
}

test('same-material plates under different parents collapse to one root mesh', () => {
  const root = new THREE.Group();
  const left = new THREE.Group();
  const right = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
  left.add(plate(material, -2));
  right.add(plate(material, 2));
  root.add(left);
  root.add(right);
  const before = [];
  root.traverse((o) => { if (o.isMesh) before.push(o); });
  assert.equal(before.length, 2);
  const result = mergeRigidOpaqueAcrossRoot(root);
  assert.equal(result.mergedMeshes, 1);
  assert.equal(result.sourceMeshes, 2);
  const after = [];
  root.traverse((o) => { if (o.isMesh) after.push(o); });
  assert.equal(after.length, 1);
  assert.equal(after[0].parent, root);
  assert.equal(after[0].userData.staticMerge, true);
});

test('greeble plates do not merge into the hull bucket', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x777777 });
  const hull = plate(material, 0, 'hull');
  const greeble = plate(material, 3, 'greeble_vent');
  greeble.userData.spacefaceTags = { greeble: true };
  root.add(hull);
  root.add(greeble);
  const result = mergeRigidOpaqueAcrossRoot(root);
  assert.equal(result.mergedMeshes, 0);
  const after = [];
  root.traverse((o) => { if (o.isMesh) after.push(o); });
  assert.equal(after.length, 2);
});

test('live station/place optimize path runs the across-root merge', async () => {
  const source = await readFile(new URL('../src/render/visualFactory.js', import.meta.url), 'utf8');
  assert.match(source, /export function optimizeStaticBatchesForRoot/);
  assert.match(source, /mergeRigidOpaqueAcrossRoot\(root\)/);
});
