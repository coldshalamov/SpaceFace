import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loftXGeometry, mergeStaticByMaterial } from '../src/render/ships/shipKit.js';

test('lofted ship hulls expose texture coordinates across a closed, smooth seam', () => {
  const segments = 6;
  const geometry = loftXGeometry([
    { x: -2, halfY: 0.5, halfZ: 1 },
    { x: 2, halfY: 1, halfZ: 2 },
  ], segments);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const seamStart = segments * 2 + 2;
  assert.equal(uv.count, position.count);
  for (let ring = 0; ring < 2; ring++) {
    const original = ring * segments, seam = seamStart + ring;
    assert.deepEqual([position.getX(seam), position.getY(seam), position.getZ(seam)],
      [position.getX(original), position.getY(original), position.getZ(original)]);
    assert.deepEqual([normal.getX(seam), normal.getY(seam), normal.getZ(seam)],
      [normal.getX(original), normal.getY(original), normal.getZ(original)]);
    assert.equal(uv.getY(original), 0);
    assert.equal(uv.getY(seam), 1);
  }
  const index = geometry.getIndex();
  assert.equal(index.getX((segments - 1) * 6 + 2), seamStart + 1);
  assert.equal(index.getX((segments - 1) * 6 + 5), seamStart);
});

test('static ship batches retain texture coordinates and leave animated parts separate', () => {
  const parent = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const first = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const second = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const moving = new THREE.Mesh(new THREE.BoxGeometry(), material);
  second.position.x = 3;
  parent.add(first, second, moving);
  const expected = [first, second].flatMap((mesh) => {
    const geometry = mesh.geometry.toNonIndexed();
    return Array.from(geometry.getAttribute('uv').array);
  });

  mergeStaticByMaterial(parent, new Set([moving]));

  assert.equal(parent.children.length, 2);
  assert.ok(parent.children.includes(moving));
  const batch = parent.children.find((child) => child !== moving);
  assert.deepEqual(Array.from(batch.geometry.getAttribute('uv').array), expected);
  assert.equal(batch.geometry.getAttribute('uv').count, batch.geometry.getAttribute('position').count);
});

test('meshes with mixed UV availability are not merged', () => {
  const parent = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const mapped = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const unmappedGeometry = new THREE.BoxGeometry();
  unmappedGeometry.deleteAttribute('uv');
  const unmapped = new THREE.Mesh(unmappedGeometry, material);
  parent.add(mapped, unmapped);

  mergeStaticByMaterial(parent);

  assert.deepEqual(parent.children, [mapped, unmapped]);
  assert.ok(mapped.geometry.getAttribute('uv'));
});
