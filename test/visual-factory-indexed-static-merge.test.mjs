import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { mergeRigidOpaqueAcrossRoot, optimizeStaticBatchesForRoot } from '../src/render/visualFactory.js';

function expandedTriangles(root, material) {
  root.updateMatrixWorld(true);
  const out = [];
  const value = new THREE.Vector3();
  const normal = new THREE.Matrix3();
  root.traverse((object) => {
    if (!object.isMesh || object.material !== material) return;
    const geometry = object.geometry;
    const names = Object.keys(geometry.attributes).sort();
    const index = geometry.index;
    const count = index ? index.count : geometry.getAttribute('position').count;
    normal.getNormalMatrix(object.matrixWorld);
    for (let i = 0; i < count; i++) {
      const source = index ? index.getX(i) : i;
      const vertex = [];
      for (const name of names) {
        const attr = geometry.getAttribute(name);
        if (name === 'position' || name === 'normal') {
          value.fromBufferAttribute(attr, source);
          if (name === 'position') value.applyMatrix4(object.matrixWorld);
          else value.applyNormalMatrix(normal);
          vertex.push(name, value.x, value.y, value.z);
        } else {
          vertex.push(name);
          for (let component = 0; component < attr.itemSize; component++) {
            vertex.push(attr.getComponent(source, component));
          }
        }
      }
      out.push(vertex);
    }
  });
  return out;
}

function assertSameTriangles(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.equal(actual[i].length, expected[i].length);
    for (let j = 0; j < actual[i].length; j++) {
      const a = actual[i][j], b = expected[i][j];
      if (typeof a === 'number') assert.ok(Math.abs(a - b) <= 0.00002, `vertex ${i}, field ${j}: ${a} != ${b}`);
      else assert.equal(a, b);
    }
  }
}

test('mixed indexed and unindexed station meshes keep their transformed triangle stream', () => {
  const root = new THREE.Group();
  root.position.set(8, -4, 3);
  root.rotation.set(0.1, -0.2, 0.3);
  const left = new THREE.Group(), right = new THREE.Group();
  left.position.set(3, 2, 0);
  right.rotation.y = 0.65;
  const material = new THREE.MeshStandardMaterial({ color: 0x8497a9 });
  const other = new THREE.MeshStandardMaterial({ color: 0x995c44 });
  const indexed = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 4), material);
  indexed.scale.set(1.2, 0.5, 2);
  indexed.rotation.z = 0.2;
  const indexedSecond = new THREE.Mesh(new THREE.CylinderGeometry(1, 2, 4, 12), material);
  indexedSecond.position.set(10, -1, 2);
  const unindexed = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3).toNonIndexed(), material);
  unindexed.position.set(-3, 5, 7);
  const unindexedSecond = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 2).toNonIndexed(), material);
  unindexedSecond.position.set(2, 3, -8);
  const otherMaterial = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), other);
  left.add(indexed, indexedSecond, otherMaterial);
  right.add(unindexed, unindexedSecond);
  root.add(left, right);
  const before = expandedTriangles(root, material);
  const otherBefore = expandedTriangles(root, other);

  optimizeStaticBatchesForRoot(root);
  const result = root.children.find((child) => child.isMesh && child.material === material);
  assert.ok(result, 'both first-stage material batches should merge across the root');
  assert.ok(result.geometry.index, 'the repeated indexed vertices should stay indexed');
  assert.ok(result.geometry.attributes.position.count < before.length);
  assertSameTriangles(expandedTriangles(root, material), before);
  assertSameTriangles(expandedTriangles(root, other), otherBefore);
});

test('unreferenced source vertices do not enlarge the merged bounds', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0, 1, 0, 100000, 100000, 100000,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 1, 2]);
  const material = new THREE.MeshBasicMaterial();
  const root = new THREE.Group();
  const first = new THREE.Mesh(geometry, material), second = new THREE.Mesh(geometry, material);
  second.position.x = 2;
  root.add(first, second);
  optimizeStaticBatchesForRoot(root);
  const merged = root.children.find((child) => child.isMesh);
  assert.ok(merged.geometry.index);
  assert.equal(merged.geometry.attributes.position.count, 6);
  assert.deepEqual(merged.geometry.boundingBox.max.toArray(), [3, 1, 0]);
});

test('different original index and shadow cohorts remain separate', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 2; i++) {
    const indexed = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    indexed.position.x = i * 3;
    indexed.castShadow = true;
    const unindexed = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), material);
    unindexed.position.y = i * 3;
    root.add(indexed, unindexed);
  }
  const stats = mergeRigidOpaqueAcrossRoot(root);
  assert.equal(stats.sourceMeshes, 4);
  assert.equal(stats.mergedMeshes, 2);
  const merged = root.children.filter((child) => child.isMesh);
  assert.equal(merged.filter((child) => child.castShadow).length, 1);
  assert.equal(merged.filter((child) => !child.castShadow).length, 1);
});

function makeIndexedRun(count) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const indices = new Uint32Array(count * 2);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = i;
    indices[i] = i;
    indices[i + count] = i;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

test('merged indices cross the WebGL primitive-restart boundary safely', () => {
  for (const [vertexCount, indexType] of [[65535, Uint16Array], [65536, Uint32Array]]) {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const first = new THREE.Mesh(makeIndexedRun(vertexCount - 3), material);
    const second = new THREE.Mesh(makeIndexedRun(3), material);
    root.add(first, second);
    mergeRigidOpaqueAcrossRoot(root);
    const result = root.children.find((child) => child.isMesh);
    assert.equal(result.geometry.attributes.position.count, vertexCount);
    assert.ok(result.geometry.index.array instanceof indexType);
    assert.equal(Math.max(...result.geometry.index.array.subarray(-6)), vertexCount - 1);
  }
});
