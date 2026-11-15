import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectImmutableResources } from '../src/render/renderPackageLoader.js';

test('shared package materials contribute their complete texture graph once', () => {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const otherTexture = new THREE.Texture();
  const shared = new THREE.MeshStandardMaterial({ map: texture });
  const other = new THREE.MeshStandardMaterial({ normalMap: otherTexture });
  let reads = 0;
  Object.defineProperty(shared, 'extraTextures', {
    enumerable: true,
    get() { reads++; return { nested: texture }; },
  });
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(geometry, i === 3 ? [shared, other] : shared);
    mesh.castShadow = true;
    root.add(mesh);
  }
  const stats = { nodes: 0 };
  const resources = collectImmutableResources(root, stats, true);
  assert.deepEqual(resources, new Set([geometry, shared, texture, other, otherTexture]));
  assert.equal(reads, 1, 'a shared material graph is scanned once');
  assert.equal(stats.nodes, 5);
  assert.ok(root.children.every(mesh => mesh.castShadow === false));
  for (const resource of resources) assert.equal(resource.userData.spacefaceRenderPackageImmutable, true);
});
