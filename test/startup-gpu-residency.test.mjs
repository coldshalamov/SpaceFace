import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { vfx } from '../src/render/vfx.js';
import { createDynamicBufferCoordinator } from '../src/render/dynamicBufferRanges.js';
import {
  collectStartupTextures,
  prepareStartupGpuResidency,
} from '../src/render/startupGpuResidency.js';

const RENDERER_SOURCE = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

test('startup GPU residency uploads shared textures once and yields between each upload', async () => {
  const shared = new THREE.Texture();
  const normal = new THREE.Texture();
  const root = new THREE.Group();
  const visible = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ map: shared, normalMap: normal }),
  );
  const hiddenLod = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ map: shared }),
  );
  hiddenLod.visible = false;
  hiddenLod.userData.spacefaceTags = { lod: 'lod2' };
  root.add(visible, hiddenLod);
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
  assert.ok(
    roots.some((root) => root.name === 'SF_WeaponFlipbooks'),
    'the live weapon presenter must publish its atlas-bearing flipbook pool',
  );
  assert.ok(
    textures.some((texture) => texture.name === 'SF_WeaponFlipbookAtlas'),
    'the weapon flipbook atlas must be uploaded during the loading-stage residency pass',
  );

  const uploaded = [];
  const result = await prepareStartupGpuResidency({
    initTexture(texture) { uploaded.push(texture); },
  }, roots, { yieldToMain: async () => {} });
  assert.equal(result.textures, textures.length);
  assert.deepEqual(new Set(uploaded), new Set(textures));
  assert.match(RENDERER_SOURCE,
    /collectVfxGpuResidencyRoots[\s\S]{0,420}prepareStartupGpuResidency\(renderer, \[\.\.\.roots, \.\.\.vfxRoots\]/,
    'the loading-stage renderer must include the published live VFX roots in its upload batch');
  system.destroy();
  assert.equal(state.render.collectVfxGpuResidencyRoots, undefined);
});

test('VFX teardown unsubscribes and disposes the weapon presenter roots', () => {
  const state = {
    playerId: 1,
    entities: new Map(),
    entityList: [],
    settings: { video: { particleQuality: 'high', engineTrails: true, bloom: true } },
    render: { scene: new THREE.Scene() },
    content: {},
  };
  let subscriptions = 0;
  let unsubscriptions = 0;
  const bus = {
    on() {
      subscriptions += 1;
      return () => { unsubscriptions += 1; };
    },
  };
  const dynamicBuffers = createDynamicBufferCoordinator(state.render.scene);
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });
  const presenter = system._weaponPresenter;
  assert.ok(presenter, 'the live renderer route must construct the weapon presenter');
  assert.equal(typeof presenter.dispose, 'function');
  assert.equal(typeof presenter.getOwnerRoots, 'function');
  const presenterRoots = presenter.getOwnerRoots();
  const sceneAttachedRoots = presenterRoots.filter((root) => root !== presenter.distortion.scene);
  const presenterOwnerIds = ['weapon-energy-bolts', 'weapon-flipbooks', 'weapon-hull-scorch'];
  assert.ok(presenterRoots.length > 0);
  assert.ok(sceneAttachedRoots.every((root) => root.parent), 'presenter scene roots start attached');
  for (const id of presenterOwnerIds) {
    assert.ok(dynamicBuffers.getDiagnostics().owners.some((owner) => owner.id === id),
      `live VFX must register ${id}`);
  }

  system.destroy();

  assert.equal(unsubscriptions, subscriptions, 'every VFX event subscription must be released');
  for (const id of presenterOwnerIds) {
    assert.ok(!dynamicBuffers.getDiagnostics().owners.some((owner) => owner.id === id),
      `teardown must unregister ${id}`);
  }
  assert.ok(sceneAttachedRoots.every((root) => !root.parent), 'presenter scene roots must detach on teardown');
  assert.equal(system._weaponPresenter, null);
  assert.equal(state.render.collectVfxGpuResidencyRoots, undefined);
  assert.equal(state.render.perfVfxIsolation, undefined);
  assert.equal(state.render.vfxReprojectFrame, undefined);
});

test('startup GPU residency reports one blocking slice per attempted upload with preserved order and yields', async () => {
  const shared = new THREE.Texture();
  shared.name = 'shared-map';
  shared.image = { width: 64, height: 32 };
  const normal = new THREE.Texture();
  normal.name = 'normal-map';
  normal.image = { width: 128, height: 64 };
  const root = new THREE.Group();
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ map: shared, normalMap: normal }),
  ));
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ map: shared }),
  ));

  const timeline = [];
  const slices = [];
  let clock = 100;
  const result = await prepareStartupGpuResidency({
    initTexture(texture) {
      clock += texture === shared ? 3 : 5;
      timeline.push(texture === shared ? 'shared' : 'normal');
    },
  }, root, {
    yieldToMain: async () => { timeline.push('yield'); },
    now: () => clock,
    onBlockingSlice: (slice) => { slices.push({ ...slice }); },
  });

  assert.equal(result.skipped, false);
  assert.equal(result.textures, 2);
  assert.equal(result.uploads.length, 2);
  assert.deepEqual(timeline, ['yield', 'shared', 'yield', 'normal', 'yield']);
  assert.equal(slices.length, 2, 'deduped textures still report one slice per attempted upload');
  assert.equal(slices[0].kind, 'gpuResidencyUpload');
  assert.equal(slices[0].durationMs, 3);
  assert.equal(slices[0].name, 'shared-map');
  assert.equal(slices[0].width, 64);
  assert.equal(slices[0].height, 32);
  assert.equal(slices[0].index, 0);
  assert.equal(slices[0].count, 2);
  assert.equal(slices[0].success, true);
  assert.equal(slices[1].durationMs, 5);
  assert.equal(slices[1].name, 'normal-map');
  assert.equal(slices[1].width, 128);
  assert.equal(slices[1].height, 64);
  assert.equal(slices[1].index, 1);
  assert.equal(slices[1].count, 2);
  assert.equal(slices[1].success, true);
  assert.equal(result.uploads[0].durationMs, 3);
  assert.equal(result.uploads[1].durationMs, 5);
});

test('startup GPU residency observes a throwing initTexture once as failed and still rejects', async () => {
  const map = new THREE.Texture();
  map.name = 'failing-map';
  map.image = { width: 16, height: 8 };
  const root = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial({ map }),
  );
  const slices = [];
  let clock = 0;
  await assert.rejects(
    prepareStartupGpuResidency({
      initTexture() {
        clock += 4;
        throw new Error('upload failed');
      },
    }, root, {
      yieldToMain: async () => {},
      now: () => clock,
      onBlockingSlice: (slice) => { slices.push({ ...slice }); },
    }),
    /upload failed/,
  );
  assert.equal(slices.length, 1);
  assert.equal(slices[0].kind, 'gpuResidencyUpload');
  assert.equal(slices[0].durationMs, 4);
  assert.equal(slices[0].name, 'failing-map');
  assert.equal(slices[0].width, 16);
  assert.equal(slices[0].height, 8);
  assert.equal(slices[0].index, 0);
  assert.equal(slices[0].count, 1);
  assert.equal(slices[0].success, false);
});

test('startup GPU residency ignores invalid observer/clock options without changing uploads', async () => {
  const map = new THREE.Texture();
  map.name = 'safe-map';
  const root = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial({ map }),
  );
  const uploaded = [];
  const result = await prepareStartupGpuResidency({
    initTexture(texture) { uploaded.push(texture); },
  }, root, {
    yieldToMain: async () => {},
    onBlockingSlice: null,
    now: 'not-a-function',
  });
  assert.equal(result.textures, 1);
  assert.deepEqual(uploaded, [map]);
});

test('startup GPU residency observer throw does not change upload success or failure', async () => {
  const map = new THREE.Texture();
  map.name = 'ok-map';
  const root = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial({ map }),
  );
  const uploaded = [];
  const result = await prepareStartupGpuResidency({
    initTexture(texture) { uploaded.push(texture); },
  }, root, {
    yieldToMain: async () => {},
    onBlockingSlice: () => { throw new Error('observer boom'); },
  });
  assert.equal(result.textures, 1);
  assert.deepEqual(uploaded, [map]);

  const failMap = new THREE.Texture();
  failMap.name = 'fail-map';
  const failRoot = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial({ map: failMap }),
  );
  await assert.rejects(
    prepareStartupGpuResidency({
      initTexture() { throw new Error('upload failed'); },
    }, failRoot, {
      yieldToMain: async () => {},
      onBlockingSlice: () => { throw new Error('observer boom'); },
    }),
    /upload failed/,
  );
});
