import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { computePlainFloat32Bounds } from '../src/render/packageCpuDetach.js';

function rand(n, seed = 7) {
  let s = seed; const a = new Float32Array(n * 3);
  for (let i = 0; i < a.length; i++) { s = (s * 1103515245 + 12345) >>> 0; a[i] = (s / 2 ** 32 - 0.5) * 200 + (i % 3) * 13; }
  return a;
}

test('fast bounds equal three.js computeBoundingBox/Sphere exactly', () => {
  for (const geom of [new THREE.TorusKnotGeometry(3, 1, 64, 8), new THREE.SphereGeometry(5, 16, 8)]) {
    geom.translate(4, -2, 9);
    const ref = geom.clone(); ref.computeBoundingBox(); ref.computeBoundingSphere();
    assert.equal(computePlainFloat32Bounds(geom), true);
    assert.deepEqual(geom.boundingBox.min.toArray(), ref.boundingBox.min.toArray());
    assert.deepEqual(geom.boundingBox.max.toArray(), ref.boundingBox.max.toArray());
    assert.deepEqual(geom.boundingSphere.center.toArray(), ref.boundingSphere.center.toArray());
    assert.equal(geom.boundingSphere.radius, ref.boundingSphere.radius);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(rand(5000), 3));
  const r = g.clone(); r.computeBoundingBox(); r.computeBoundingSphere();
  assert.equal(computePlainFloat32Bounds(g), true);
  assert.deepEqual(g.boundingBox.min.toArray(), r.boundingBox.min.toArray());
  assert.deepEqual(g.boundingBox.max.toArray(), r.boundingBox.max.toArray());
  assert.equal(g.boundingSphere.radius, r.boundingSphere.radius);
});

test('outside the plain case it declines so the caller uses three', () => {
  const inter = new THREE.InterleavedBuffer(rand(10), 3);
  const g1 = new THREE.BufferGeometry(); g1.setAttribute('position', new THREE.InterleavedBufferAttribute(inter, 3, 0));
  assert.equal(computePlainFloat32Bounds(g1), false);
  const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(new Int16Array(9), 3, true));
  assert.equal(computePlainFloat32Bounds(g2), false);
  const g3 = new THREE.BoxGeometry(); g3.morphAttributes.position = [g3.attributes.position.clone()];
  assert.equal(computePlainFloat32Bounds(g3), false);
});
