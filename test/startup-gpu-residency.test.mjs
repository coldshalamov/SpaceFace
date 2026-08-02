import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { vfx } from '../src/render/vfx.js';
import {
  collectStartupTextures,
  prepareStartupGpuResidency,
} from '../src/render/startupGpuResidency.js';

const RENDERER_SOURCE = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

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

test('live VFX roots join the loading-stage texture upload instead of waiting for first combat use', async () => {
  const state = {
    playerId: 1,
    entities: new Map(),
    entityList: [],
    settings: { video: { particleQuality: 'high', engineTrails: true, bloom: true } },
    render: { scene: new THREE.Scene() },
    content: {},
  };
  const system = Object.create(vfx);
  system.init({ state, bus: { on() {} }, helpers: {} });

  assert.equal(typeof state.render.collectVfxGpuResidencyRoots, 'function');
  const roots = state.render.collectVfxGpuResidencyRoots();
  const textures = collectStartupTextures(roots);
  assert.ok(roots.length > 0, 'the live pooled VFX owner must publish its startup roots');
  assert.ok(textures.length > 0, 'the live VFX roots must expose first-use textures');

  const uploaded = [];
  const result = await prepareStartupGpuResidency({
    initTexture(texture) { uploaded.push(texture); },
  }, roots, { yieldToMain: async () => {} });
  assert.equal(result.textures, textures.length);
  assert.deepEqual(new Set(uploaded), new Set(textures));
  assert.match(RENDERER_SOURCE,
    /collectVfxGpuResidencyRoots[\s\S]{0,420}prepareStartupGpuResidency\(renderer, \[\.\.\.roots, \.\.\.vfxRoots\]/,
    'the loading-stage renderer must include the published live VFX roots in its upload batch');
});
