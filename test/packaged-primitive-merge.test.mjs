// R2-A: flat packaged bodies (wrecks) collapse same-material opaque leaves into one draw,
// (The fallback drone's merged body is geometry-only; it needs a canvas, so it is checked in the browser.)
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { instantiatePackagedPrimitives } from '../src/render/visualFactory.js';

function box() { const g = new THREE.BoxGeometry(1, 1, 1); g.clearGroups(); return g; }

function record() {
  const hull = new THREE.MeshStandardMaterial({ name: 'hull' });
  const glass = new THREE.MeshStandardMaterial({ name: 'glass', transparent: true });
  const lone = new THREE.MeshStandardMaterial({ name: 'lone' });
  const m = (x) => new THREE.Matrix4().makeTranslation(x, 0, 0);
  return {
    assetId: 'merge_probe',
    primitives: [
      { name: 'a', geometry: box(), material: hull, matrix: m(0) },
      { name: 'b', geometry: box(), material: hull, matrix: m(10) },
      { name: 'c', geometry: box(), material: hull, matrix: m(20) },
      { name: 'g', geometry: box(), material: glass, matrix: m(30) },
      { name: 'l', geometry: box(), material: lone, matrix: m(40) },
      { name: 'mirror', geometry: box(), material: hull,
        matrix: new THREE.Matrix4().makeScale(-1, 1, 1) },
    ],
  };
}

test('same-material opaque leaves merge; transparent, singleton and mirrored stay separate', () => {
  const rec = record();
  const holder = new THREE.Group();
  instantiatePackagedPrimitives(rec, holder);
  const meshes = holder.children.filter((c) => c.isMesh);
  assert.equal(meshes.length, 4, 'hull(3 merged) + mirror + glass + lone');
  const merged = meshes.find((mesh) => mesh.name.startsWith('a+'));
  assert.ok(merged, 'merged hull mesh');
  merged.geometry.computeBoundingBox();
  assert.ok(Math.abs(merged.geometry.boundingBox.min.x - -0.5) < 1e-6);
  assert.ok(Math.abs(merged.geometry.boundingBox.max.x - 20.5) < 1e-6);
  assert.equal(merged.geometry.getAttribute('position').count, 3 * 24);
  const holder2 = new THREE.Group();
  instantiatePackagedPrimitives(rec, holder2);
  assert.equal(holder2.children.find((c) => c.name.startsWith('a+')).geometry, merged.geometry,
    'second wreck of the same record shares the merged buffers');
});

test('includeAllLods warm mounts keep every leaf separate', () => {
  const holder = new THREE.Group();
  instantiatePackagedPrimitives(record(), holder, { includeAllLods: true });
  assert.equal(holder.children.length, 6);
});

