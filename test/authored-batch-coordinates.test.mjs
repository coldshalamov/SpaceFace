import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeStaticBatchGeometries } from '../src/render/partsLibrary.js';

test('mixed quantized and float primitives retain decoded hull layout, positions and normals when batched', () => {
  const packed = new THREE.BufferGeometry();
  const plain = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'sfHullPosition']) {
    packed.setAttribute(name, new THREE.BufferAttribute(new Int16Array([32767, 0, -32767, 0, 32767, 0, 0, 0, 0]), 3, true));
    plain.setAttribute(name, new THREE.Float32BufferAttribute([2, 0, -2, 0, 2, 0, 0, 0, 0], 3));
  }
  const [a, b] = normalizeStaticBatchGeometries([packed, plain]);
  for (const name of ['position', 'normal', 'sfHullPosition']) {
    const attr = a.getAttribute(name);
    assert.ok(attr, `${name} survives mixed-buffer batching`);
    assert.equal(attr.normalized, false);
    assert.ok(attr.array instanceof Float32Array);
    assert.deepEqual(Array.from(attr.array), [1, 0, -1, 0, 1, 0, 0, 0, 0]);
    assert.equal(b.getAttribute(name).getX(0), 2);
  }
});
