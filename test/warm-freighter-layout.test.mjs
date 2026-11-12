import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { mapWarmFreighterGrowth } from '../src/data/warmFreighterLayout.js';

const packagePath = 'assets/ships/release/render-packages/mule-production-v1/render-package.json';
const glbPath = 'assets/ships/release/parts/wholeships/mule_production_v1.glb';
const rows = count => Array.from({ length: count }, (_, i) => ({ moduleId: `original-${i}`, rot: i / 10, scale: 1 }));
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const host = { pos: { x: 4000, z: -2000 }, rot: 0, radius: 18 };
const datum = { center: [-0.045011043548583984, 0.6131212214198348, 0], envelope: 16.15002155303955 };

test('existing rows keep identities and counts in bounded bands, without a missing host', () => {
  for (const [band, count] of [['base', 12], ['bloom', 8], ['ambient', 6]]) {
    const source = rows(count);
    const mapped = mapWarmFreighterGrowth(source, host, datum, band);
    assert.deepEqual(mapped.map(r => r.moduleId), source.map(r => r.moduleId));
    assert.equal(mapped.length, count);
    assert.ok(mapped.every(r => Number.isFinite(r.height) && r.scale > 0 && r.scale < 0.2));
    assert.deepEqual(mapWarmFreighterGrowth(source, null, datum, band), []);
    assert.deepEqual(mapWarmFreighterGrowth(rows(count + 1), host, datum, band), []);
  }
  assert.deepEqual(mapWarmFreighterGrowth(rows(1), { ...host, radius: 0 }, datum), []);
});

test('translation, yaw and size follow the real body, including the fitted center', () => {
  const source = rows(1);
  const first = mapWarmFreighterGrowth(source, host, datum)[0];
  const turned = mapWarmFreighterGrowth(source, { ...host, rot: Math.PI / 2 }, datum)[0];
  const dx = first.pos.x - host.pos.x, dz = first.pos.z - host.pos.z;
  near(turned.pos.x - host.pos.x, -dz);
  near(turned.pos.z - host.pos.z, dx);
  near(turned.height, first.height);
  near(turned.rot, Math.PI / 2);
  const larger = mapWarmFreighterGrowth(source, { ...host, radius: 36 }, datum)[0];
  near(larger.pos.x - host.pos.x, 2 * dx);
  near(larger.height, 2 * first.height);
  near(larger.scale, 2 * first.scale);
});

test('bank and pitch apply to the hull child before recentering and yaw', () => {
  const pose = { ...host, rot: 0.7, bank: 0.2, pitch: -0.3 };
  const actual = mapWarmFreighterGrowth(rows(1), pose, datum)[0];
  const fit = 2 * pose.radius / datum.envelope;
  const point = new THREE.Vector3(-2.75, 1, 1.45)
    .applyEuler(new THREE.Euler(pose.bank, 0, pose.pitch, 'XYZ'))
    .sub(new THREE.Vector3(...datum.center)).multiplyScalar(fit)
    .applyEuler(new THREE.Euler(0, -pose.rot, 0));
  near(actual.pos.x, pose.pos.x + point.x);
  near(actual.pos.z, pose.pos.z + point.z);
  near(actual.height, point.y);
});

test('authored placements touch the actual released Mule upper surface', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
  assert.deepEqual(pkg.runtime.bounds.center, datum.center);
  near(Math.max(...pkg.runtime.bounds.size), datum.envelope);
  await MeshoptDecoder.ready;
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(glbPath);
  const meshes = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh() || /collision|LOD[12]/i.test(node.getName())) continue;
    for (const primitive of node.getMesh().listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(position.getArray(), 3, position.getNormalized()));
      const indices = primitive.getIndices();
      if (indices) geometry.setIndex(new THREE.BufferAttribute(indices.getArray(), 1));
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.matrix.fromArray(node.getWorldMatrix()); mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true);
      meshes.push(mesh);
    }
  }
  const ray = new THREE.Raycaster();
  const fit = 2 * host.radius / datum.envelope;
  for (const [band, count] of [['base', 12], ['bloom', 8], ['ambient', 6]]) {
    for (const p of mapWarmFreighterGrowth(rows(count), host, datum, band)) {
      const x = (p.pos.x - host.pos.x) / fit + datum.center[0];
      const z = (p.pos.z - host.pos.z) / fit + datum.center[2];
      const y = p.height / fit + datum.center[1];
      ray.set(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(meshes)[0];
      assert.ok(hit, `${band} has no surface at ${x},${z}`);
      near(hit.point.y, y, 0.004);
    }
  }
});
