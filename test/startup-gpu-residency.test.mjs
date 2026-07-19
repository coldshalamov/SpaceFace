import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  collectStartupTextures,
  prepareStartupGpuResidency,
} from '../src/render/startupGpuResidency.js';

test('startup GPU residency uploads shared textures once and yields between each upload', async () => {
  const shared = new THREE.Texture();
  const normal = new THREE.Texture();
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: shared, normalMap: normal })),
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: shared })),
  );
  assert.deepEqual(new Set(collectStartupTextures(root)), new Set([shared, normal]));

  const timeline = [];
  const result = await prepareStartupGpuResidency({
    initTexture(texture) { timeline.push(texture === shared ? 'shared' : 'normal'); },
  }, root, {
    yieldToMain: async () => { timeline.push('yield'); },
  });

  assert.equal(result.skipped, false);
  assert.equal(result.textures, 2);
  assert.equal(result.uploads.length, 2);
  assert.deepEqual(timeline, ['yield', 'shared', 'yield', 'normal', 'yield']);
});

test('startup GPU residency fails open when explicit uploads are unsupported', async () => {
  assert.deepEqual(
    await prepareStartupGpuResidency({}, new THREE.Group()),
    { skipped: true, reason: 'initTexture unavailable', textures: 0 },
  );
});
