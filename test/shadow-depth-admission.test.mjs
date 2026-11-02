import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { driveCompileShadowDepthPipelines, render } from '../src/render/renderer.js';
import { warmWorksOpeningPrograms } from '../src/render/startupGpuResidency.js';

import {
  armAdmissionShadows,
  collectShadowCastSubjects,
  collectUnstagedShadowCasters,
  compileShadowDepthPipelines,
  compileShadowDepthPipelinesSteps,
  createShadowDepthStagingSession,
  disposeAdmissionShadowResources,
  prepareShadowDepthTextureLease,
  UNSTAGED_COLLECT_OVER_COVER,
  isUnstagedCollectOverCover,
  collectUnstagedShadowCastersFlag,
  noteShadowCensusLightMutation,
  shadowCensusEpoch,
} from '../src/render/shadowDepthAdmission.js';
import { scheduleRealtimeShadowRefresh } from '../src/render/shadowPresentCadence.js';
import { createShadowDepthStageMethods } from '../src/render/runtime/shadowDepthStage.js';
import {
  createPackageDetachManifest,
  detachPackageGeometry,
  detachPackageTexture,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';

test('configured but disabled Nocturne keeps the color census while skipping depth admission', async () => {
  const owner = {
    _shadowSettingOn: false,
    _nocturne: { shadowConfigured: true, shadowsEnabled: false },
  };
  assert.equal(render._shadowDepthEnabled.call(owner), false);
  owner._nocturne.shadowsEnabled = true;
  assert.equal(render._shadowDepthEnabled.call(owner), true);
  owner._shadowSettingOn = true;
  owner._nocturne.shadowsEnabled = false;
  assert.equal(render._shadowDepthEnabled.call(owner), true, 'solar shadows remain independently active');

  let traversals = 0, renders = 0;
  const result = await driveCompileShadowDepthPipelines({
    forceEnable: false,
    subjects: [{ traverse() { traversals++; } }],
    renderer: { render() { renders++; } },
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'shadow depth disabled by active settings');
  assert.equal(result.aborted, false, 'a valid settings opt-out is not a superseded drive');
  assert.equal(traversals, 0, 'disabled depth work exits before census');
  assert.equal(renders, 0, 'disabled depth work issues no staging render');
});

test('paced shadow staging refills and leases a detached package caster before drawing', async (t) => {
  resetPackageDetachManifestsForTests();
  t.after(() => resetPackageDetachManifestsForTests());
  const makeGeometry = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    return geometry;
  };
  const geometry = makeGeometry();
  createPackageDetachManifest({ assetId: 'fixture.shadow-geometry', contentHash: 'd'.repeat(64), resources: [geometry] }, {
    redecode: async () => ({ resources: [makeGeometry()] }), collectResources: decoded => decoded.resources,
  });
  const hull = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); hull.castShadow = true;
  const renderer = { shadowMap: { enabled: true }, properties: { get: () => ({ currentProgram: { cacheKey: 'depth' } }) },
    getContext: () => ({ isContextLost: () => false }), getRenderTarget: () => null, setRenderTarget() {},
    renderBufferDirect() {},
    render() {
      assert.equal(detachPackageGeometry(geometry, {}), false, 'CPU data stays leased through staging');
      assert.ok(geometry.getAttribute('uv').array.byteLength > 0, 'shadow caster uploads real UV bytes');
      this.renderBufferDirect({}, null, {}, {}, hull, null);
    },
  };
  assert.equal(detachPackageGeometry(geometry, {}), true);
  const result = await driveCompileShadowDepthPipelines({ renderer, light: { castShadow: true, shadow: {} }, camera: {},
    subjects: [hull], state: { render: { contextRecovery: { generation: 2 } } }, THREE: mockThree(),
    captureObjectHome: object => ({ object }), restoreObjectHome() {} }, async () => {});
  assert.equal(result.skipped, false);
  assert.equal(detachPackageGeometry(geometry, {}), true, 'lease releases after staging');
  const scene = new THREE.Scene(); scene.add(hull);
  const warm = await warmWorksOpeningPrograms({ renderer, scene, camera: {}, light: { castShadow: true, shadow: {} },
    THREE: mockThree(), captureObjectHome: object => ({ object }), restoreObjectHome() {}, yieldToMain: async () => {} });
  assert.equal(warm.depthSkipped, false, 'the Works caller uses the same protected shadow staging');
  assert.equal(detachPackageGeometry(geometry, {}), true, 'the Works lease also releases');
});

test('shadow-enable stages an invalidated census and sheds a detached root before its queued arm', () => {
  let callback = null, closed = 0;
  const methods = createShadowDepthStageMethods({
    SHADOW_DEPTH_PASS_NODE_CAP: 4096,
    STAGE_SELF_DIRTY_KEY: 'stageDirty', STAGE_COLLECT_EPOCH_KEY: 'stageEpoch',
    armCallbackAfterPresent: fn => { callback = fn; },
    closeShadowDepthStagingSession: () => { closed++; },
    shadowPolicyEntityOf: () => null,
    laneWarn: (_owner, _lane, _message, error) => { throw error; },
  });
  const scene = new THREE.Scene(), root = new THREE.Group();
  scene.add(root);
  const owner = Object.assign({
    scene, renderer: {}, cam: { obj: {} }, _keyLight: {}, state: {},
    _shadowCensusMemo: { epoch: shadowCensusEpoch() },
    _shadowCensusForFrame: () => 'old-census',
    _invalidateShadowPolicy() {},
  }, methods);
  noteShadowCensusLightMutation();
  owner._stageShadowDepthOnSettingEnable();
  assert.ok(owner._pendingDepthStageRoots.has(root), 'a stale census queues a fresh stage');
  assert.equal(root.userData.stageEpoch, shadowCensusEpoch(), 'the live census epoch is read by the moved method');
  assert.equal(typeof callback, 'function');
  scene.remove(root);
  noteShadowCensusLightMutation();
  callback();
  assert.equal(owner._pendingDepthStageRoots, null, 'a detached root is not staged');
  assert.equal(owner._depthStageScheduled, false);
  assert.equal(closed, 1, 'the existing staging session is closed');
});

test('collects mesh casters from a root and skips non-casters', () => {
  const hull = { isMesh: true, castShadow: true, name: 'hull' };
  const glass = { isMesh: true, castShadow: false, name: 'glass' };
  const root = {
    name: 'ship',
    castShadow: false,
    traverse(fn) {
      fn(this);
      fn(hull);
      fn(glass);
    },
  };
  assert.deepEqual(collectShadowCastSubjects(root).map((item) => item.name), ['hull']);
  assert.deepEqual(collectShadowCastSubjects([hull, glass]).map((item) => item.name), ['hull']);
});

class MockScene {
  constructor() { this.children = []; this.name = ''; }
  add(child) { if (child) this.children.push(child); }
  clear() { this.children.length = 0; }
  updateMatrixWorld() {}
  traverse(fn) {
    fn(this);
    for (const child of [...this.children]) {
      fn(child);
      if (typeof child.traverse === 'function') child.traverse(fn);
    }
  }
}
class MockDirectionalLight {
  constructor() {
    this.isLight = true;
    this.isDirectionalLight = true;
    this.name = 'SF_AdmissionShadowDepthKey';
    this.castShadow = true;
    this.shadow = { needsUpdate: false, map: null, matrix: null, camera: {}, mapSize: null };
    this.target = { isObject3D: true, name: 'admission-key-target' };
  }
}
const mockThree = () => ({ Scene: MockScene, DirectionalLight: MockDirectionalLight });

test('shadow depth compile runs the real shadow pass on exact casters and restores homes', async () => {
  const hull = { isMesh: true, castShadow: true, name: 'hull', parent: { children: [] } };
  hull.parent.children.push(hull);
  const homes = [];
  const restored = [];
  const renders = [];
  const renderer = {
    shadowMap: {
      enabled: false,
      render(lights, staging, camera) {
        renders.push({
          lights: lights.map((light) => light.name),
          staging: staging.name,
          camera: camera.name,
          children: staging.children.map((child) => child.name),
        });
      },
    },
    // The staged depth pass runs inside a real renderer.render — the mock forwards to the
    // shadow-map pass the way WebGLRenderer does. The first render is the light-census
    // warm pass (shadowMap disabled, casters not yet added); the second is the real pass.
    renderCalls: 0,
    render(staging, camera) {
      renderer.renderCalls += 1;
      if (renderer.shadowMap.enabled === false) return;
      renderer.shadowMap.render(
        staging.children.filter((child) => child.castShadow === true),
        staging, camera);
    },
    getRenderTarget() { return { name: 'previous' }; },
    setRenderTarget(target) { renderer._target = target; },
    properties: { get: (material) => material && material.properties || {} },
    renderBufferDirect() {},
  };
  const light = { name: 'key', castShadow: false, shadow: { needsUpdate: false } };
  const result = compileShadowDepthPipelines({
    renderer,
    light,
    camera: { name: 'chase' },
    subjects: [hull],
    forceEnable: true,
    THREE: mockThree(),
    captureObjectHome(object) {
      homes.push(object.name);
      return { object };
    },
    restoreObjectHome(home) { restored.push(home.object.name); },
  });
  assert.equal(result.skipped, false);
  assert.equal(result.subjects, 1);
  assert.deepEqual(homes, ['hull']);
  assert.deepEqual(restored, ['hull']);
  assert.equal(renderer.renderCalls, 2, 'light-census warm render plus the real shadow pass');
  assert.equal(renders.length, 1);
  assert.ok(renders[0].children.includes('hull'));
  assert.ok(!renders[0].children.includes('key'), 'the live key light is never staged');
  assert.ok(renders[0].lights.includes('SF_AdmissionShadowDepthKey'), 'the private clone is staged');
  assert.equal(light.castShadow, false);
  assert.equal(renderer.shadowMap.enabled, false);
  assert.equal(light.shadow.needsUpdate, false, 'a private pass preserves the caller\'s refresh request');
  assert.equal(renderer._target?.name, 'previous');
  assert.deepEqual(result.programBindingFailures, [], 'culled casters may produce no shadow draw');
});

test('shadow depth admission records the actual generated depth binding and restores an existing driver hook', () => {
  const hull = { isMesh: true, castShadow: true, name: 'hull', parent: { children: [] } };
  hull.parent.children.push(hull);
  const generatedDepth = { properties: { currentProgram: { cacheKey: 'generated-depth-program' } } };
  let directCalls = 0;
  const originalRenderBufferDirect = function originalRenderBufferDirect() { directCalls += 1; };
  const renderer = {
    shadowMap: { enabled: true },
    // The depth draw happens inside renderer.render's shadow pass; simulate one caster draw.
    // The light-census warm render runs with the shadow pass disabled — no depth draws.
    render() {
      if (renderer.shadowMap.enabled === false) return;
      renderer.renderBufferDirect({}, {}, {}, generatedDepth, hull, null);
    },
    renderBufferDirect: originalRenderBufferDirect,
    properties: { get: (material) => material?.properties || {} },
    getRenderTarget() { return null; },
    setRenderTarget() {},
  };
  const result = compileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [hull],
    THREE: mockThree(),
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome() {},
  });
  assert.deepEqual(result.programCacheKeys, ['generated-depth-program']);
  assert.deepEqual(result.programBindingFailures, []);
  assert.equal(directCalls, 1);
  assert.equal(renderer.renderBufferDirect, originalRenderBufferDirect);
});

test('shadow draw upload failures carry bounded compressed-sampler identity and rethrow the original error', () => {
  const hull = {
    isMesh: true, castShadow: true, name: 'broken-caster', uuid: 'caster-uuid', type: 'Mesh',
    parent: { children: [] },
  };
  hull.parent.children.push(hull);
  const texture = {
    isCompressedTexture: true,
    mipmaps: [],
    uuid: 'texture-uuid',
    name: 'detached-albedo',
    type: 'CompressedTexture',
    version: 3,
    source: { uuid: 'source-uuid', version: 7 },
    userData: {
      spacefaceSharedImageSourceKey: 'shared-image-key',
      spacefaceCpuDetach: { manifestId: 'manifest-1', contentHash: 'abc123', ordinal: 4 },
    },
  };
  const generatedDepth = { map: texture, properties: { currentProgram: { cacheKey: 'depth-key' } } };
  const originalError = new TypeError("Cannot read properties of undefined (reading 'width')");
  const originalRenderBufferDirect = () => { throw originalError; };
  let drawCalls = 0;
  const renderer = {
    shadowMap: { enabled: true },
    render() {
      if (renderer.shadowMap.enabled === false) return;
      drawCalls += 1;
      renderer.renderBufferDirect({}, null, {}, generatedDepth, hull, null);
    },
    renderBufferDirect: originalRenderBufferDirect,
    properties: { get: (source) => source === texture.source ? { __version: 6 } : ({}) },
    getRenderTarget() { return null; },
    setRenderTarget() {},
  };
  let caught = null;
  assert.throws(() => compileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [hull],
    THREE: mockThree(),
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome() {},
  }), (error) => {
    caught = error;
    return error === originalError;
  }, 'the original Three draw error is preserved');
  assert.ok(caught);
  assert.equal(drawCalls, 1, 'the staged depth draw failed once');
  assert.equal(renderer.renderBufferDirect, originalRenderBufferDirect, 'the temporary hook is restored');
  assert.equal(caught.shadowDepthAdmission.caster.name, 'broken-caster');
  assert.deepEqual(caught.shadowDepthAdmission.samplers[0], {
    role: 'depth-material',
    materialIndex: 0,
    sampler: 'map',
    texture: {
      uuid: 'texture-uuid',
      name: 'detached-albedo',
      type: 'CompressedTexture',
      sourceKey: 'shared-image-key',
      sourceUuid: 'source-uuid',
      asset: null,
      cpuDetach: { manifestId: 'manifest-1', contentHash: 'abc123', ordinal: 4 },
      compressed: true,
      mipCount: 0,
      firstMip: null,
      textureVersion: 3,
      sourceVersion: 7,
      rendererSourceVersion: 6,
    },
  });
  assert.match(caught.stack, /\[shadow-depth-texture\] \{"caster":/,
    'the existing warning stack carries the bounded identity record');
});

test('shadow depth texture lease canonically refills a detached package mip chain and holds it through the drive', async (t) => {
  resetPackageDetachManifestsForTests();
  t.after(() => resetPackageDetachManifestsForTests());
  const makeTexture = () => new THREE.CompressedTexture(
    [{ data: new Uint8Array(16), width: 4, height: 4 }],
    4, 4, THREE.RGBAFormat,
  );
  const texture = makeTexture();
  const donor = makeTexture();
  texture.name = 'detached-shadow-map';
  donor.name = texture.name;
  texture.needsUpdate = true;
  createPackageDetachManifest({
    assetId: 'fixture.shadow-depth',
    contentHash: 'a'.repeat(64),
    resources: [texture],
  }, {
    redecode: async () => ({ scene: new THREE.Scene(), resources: [donor] }),
    collectResources: () => [donor],
  });
  assert.equal(detachPackageTexture(texture), true, 'the real package detach owner empties the payload');
  assert.equal(texture.mipmaps.length, 0);

  const hull = new THREE.Mesh(new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ map: texture }));
  hull.castShadow = true;
  hull.name = 'package-caster';
  const generatedDepth = { map: texture, properties: { currentProgram: { cacheKey: 'depth-key' } } };
  const renderer = {
    shadowMap: { enabled: true },
    render() {
      if (renderer.shadowMap.enabled === false) return;
      renderer.renderBufferDirect({}, null, {}, generatedDepth, hull, null);
    },
    renderBufferDirect() {
      // Mirrors Three's compressed-texture upload read at texStorage2D.
      return texture.mipmaps[0].width;
    },
    properties: { get: (value) => value === texture ? null : value?.properties || {} },
    getContext() { return { isContextLost: () => false }; },
    getRenderTarget() { return null; },
    setRenderTarget() {},
  };
  const compile = () => compileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [hull],
    THREE: mockThree(),
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome() {},
  });

  assert.throws(compile, /reading 'width'/,
    'without the canonical package refill, context-local staging reaches the empty mip chain');
  const lease = await prepareShadowDepthTextureLease({
    renderer,
    textures: [texture],
    state: { render: { contextRecovery: { generation: 2 } } },
    yieldToMain: async () => {},
  });
  assert.equal(lease.ready, true);
  try {
    assert.equal(texture.mipmaps[0]?.width, 4, 'canonical package re-decode restored the real mip chain');
    assert.equal(detachPackageTexture(texture), false, 'the active shadow-drive lease prevents mid-drive release');
    assert.equal(compile().skipped, false, 'the real detached texture fixture now completes shadow staging');
  } finally {
    lease.release();
  }
  assert.equal(detachPackageTexture(texture), true, 'the upload lease is released when the drive ends');

  let detachBlockedDuringDrive = false;
  renderer.render = () => {
    detachBlockedDuringDrive = detachPackageTexture(texture) === false;
    renderer.renderBufferDirect({}, null, {}, generatedDepth, hull, null);
  };
  const driven = await driveCompileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [hull],
    state: { render: { contextRecovery: { generation: 2 } } },
    THREE: mockThree(),
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome() {},
  }, async () => {});
  assert.equal(driven.skipped, false, 'the paced owner driver refills before staging the depth draw');
  assert.equal(detachBlockedDuringDrive, true, 'the paced driver holds package payload through its draw');
  assert.equal(detachPackageTexture(texture), true, 'the paced driver releases its lease when settled');

  const cancelledState = { render: { contextRecovery: { generation: 4 } } };
  let cancelledDraws = 0;
  const renderBeforeCancel = renderer.render;
  renderer.render = (...args) => {
    cancelledDraws += 1;
    return renderBeforeCancel(...args);
  };
  const cancelled = await driveCompileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [hull],
    state: cancelledState,
    THREE: mockThree(),
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome() {},
  }, async () => { cancelledState.render.contextRecovery.generation += 1; });
  assert.equal(cancelled.aborted, true, 'a context generation change during refill aborts staging');
  assert.equal(cancelledDraws, 0, 'cancelled refill never enters the shadow draw');
  assert.equal(detachPackageTexture(texture), true, 'the cancelled drive releases its payload lease');

  const manyRoot = new THREE.Group();
  const sharedMaterial = new THREE.MeshBasicMaterial({ map: texture });
  const manyCasters = Array.from({ length: 33 }, (_, index) => {
    const caster = new THREE.Mesh(new THREE.BufferGeometry(), sharedMaterial);
    caster.castShadow = true;
    caster.name = `pace-fault-caster-${index}`;
    manyRoot.add(caster);
    return caster;
  });
  let stagedDraws = 0;
  renderer.render = () => {
    if (renderer.shadowMap.enabled === false) return;
    stagedDraws += 1;
    renderer.renderBufferDirect({}, null, {}, generatedDepth, manyCasters[0], null);
  };
  const originalRenderBufferDirect = renderer.renderBufferDirect;
  const capturedHomes = [];
  const restoredHomes = [];
  const paceFault = new Error('shadow pace rejected after partial staged draw');
  await assert.rejects(driveCompileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [manyRoot],
    state: { render: { contextRecovery: { generation: 9 } } },
    THREE: mockThree(),
    captureObjectHome(object) {
      const home = { object, parent: object.parent };
      capturedHomes.push(home);
      return home;
    },
    restoreObjectHome(home) {
      restoredHomes.push(home.object);
      if (home.parent && home.object.parent !== home.parent) home.parent.add(home.object);
    },
  }, async () => {
    if (stagedDraws > 0) throw paceFault;
  }), (error) => error === paceFault);
  assert.ok(stagedDraws > 0, 'the rejected yield follows a real staged depth draw');
  assert.ok(capturedHomes.length > 0 && capturedHomes.length < manyCasters.length,
    'the driver is interrupted after one partial caster slice');
  assert.equal(restoredHomes.length, capturedHomes.length, 'all captured caster homes restore before rejection escapes');
  assert.equal(manyRoot.children.length, manyCasters.length, 'no caster remains parked under the staging scene');
  assert.equal(renderer.renderBufferDirect, originalRenderBufferDirect, 'the draw hook is restored on driver rejection');
  assert.equal(renderer.shadowMap.enabled, true, 'the caller shadow flag is restored on driver rejection');
  assert.equal(detachPackageTexture(texture), true, 'the driver releases the payload lease on pace rejection');
});

test('shadow depth admission fails closed when its actual depth draw has no program binding', () => {
  const hull = { isMesh: true, castShadow: true, parent: { children: [] } };
  hull.parent.children.push(hull);
  const renderer = {
    shadowMap: { enabled: true },
    render() {
      if (renderer.shadowMap.enabled === false) return;
      renderer.renderBufferDirect({}, {}, {}, {}, hull, null);
    },
    renderBufferDirect() {},
    properties: { get: () => ({}) },
    getRenderTarget() { return null; },
    setRenderTarget() {},
  };
  const result = compileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [hull],
    THREE: mockThree(),
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome() {},
  });
  assert.deepEqual(result.programCacheKeys, []);
  assert.deepEqual(result.programBindingFailures, ['shadow-depth:1/1:unprepared-program-binding']);
});

test('shadow depth admission restores the prior renderBufferDirect hook when the shadow pass throws', () => {
  const hull = { isMesh: true, castShadow: true, parent: { children: [] } };
  hull.parent.children.push(hull);
  const originalRenderBufferDirect = () => {};
  const renderer = {
    shadowMap: { enabled: true },
    render() { throw new Error('shadow draw failed'); },
    renderBufferDirect: originalRenderBufferDirect,
    getRenderTarget() { return null; },
    setRenderTarget() {},
  };
  assert.throws(() => compileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [hull],
    THREE: mockThree(),
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome() {},
  }), /shadow draw failed/);
  assert.equal(renderer.renderBufferDirect, originalRenderBufferDirect);
});

test('stepped shadow admission skips a BatchedMesh disposed while its caster list is yielded', () => {
  const material = new THREE.MeshBasicMaterial();
  const batch = new THREE.BatchedMesh(1, 32, 36, material);
  const geometryId = batch.addGeometry(new THREE.BoxGeometry());
  batch.addInstance(geometryId);
  batch.castShadow = true;
  batch.name = 'retiring-batch';
  const live = Array.from({ length: 32 }, (_, index) => ({
    isMesh: true, castShadow: true, name: `live-${index}`, visible: true,
  }));
  let batchDraws = 0;
  const renderer = {
    shadowMap: { enabled: true },
    render(staging) {
      if (!renderer.shadowMap.enabled) return;
      for (const child of staging.children) {
        if (!child.castShadow) continue;
        if (child === batch) {
          batchDraws += 1;
          child.computeBoundingSphere();
        }
        renderer.renderBufferDirect({}, null, {}, child.material || material, child, null);
      }
    },
    renderBufferDirect() {},
    properties: { get: () => ({ currentProgram: { cacheKey: 'depth' } }) },
    getRenderTarget() { return null; },
    setRenderTarget() {},
  };
  const steps = compileShadowDepthPipelinesSteps({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [],
    precollectedCasting: [...live, batch],
    stagedLights: [],
    THREE: mockThree(),
    captureObjectHome: (object) => ({ object, parent: null, index: -1 }),
    restoreObjectHome() {},
  });

  const first = steps.next();
  assert.equal(first.done, false, 'the first 32 casters complete before the generator yields');
  batch.dispose();
  assert.equal(batch._matricesTexture, null, 'Three.js dispose retires the batch backing texture');

  const result = steps.next();
  assert.equal(result.done, true);
  assert.equal(result.value.skipped, false);
  assert.equal(result.value.subjects, 32, 'only the still-usable casters count as staged');
  assert.equal(batchDraws, 0, 'the disposed batch never reaches bounds or shadow rendering');
  material.dispose();
});

test('hidden zero-count instanced casters are revealed for the shadow pass', () => {
  const hull = {
    isInstancedMesh: true,
    isMesh: true,
    castShadow: true,
    visible: false,
    frustumCulled: true,
    count: 0,
    name: 'hull',
    parent: { children: [] },
  };
  hull.parent.children.push(hull);
  const renders = [];
  const renderer = {
    shadowMap: {
      enabled: false,
      render(lights, staging) {
        renders.push(staging.children.map((child) => ({
          name: child.name,
          visible: child.visible,
          count: child.count,
        })));
      },
    },
    render(staging, camera) {
      if (renderer.shadowMap.enabled === false) return;
      renderer.shadowMap.render(
        staging.children.filter((child) => child.castShadow === true),
        staging, camera);
    },
    getRenderTarget() { return null; },
    setRenderTarget() {},
  };
  const result = compileShadowDepthPipelines({
    renderer,
    light: { name: 'key', castShadow: false, shadow: { needsUpdate: false } },
    camera: { name: 'chase' },
    subjects: [hull],
    forceEnable: true,
    THREE: mockThree(),
    captureObjectHome(object) { return { object }; },
    restoreObjectHome() {},
  });
  assert.equal(result.skipped, false);
  assert.equal(renders.length, 1);
  const stagedHull = renders[0].find((child) => child.name === 'hull');
  assert.equal(stagedHull.visible, true);
  assert.equal(stagedHull.count, 1);
  assert.equal(hull.visible, false);
  assert.equal(hull.count, 0);
});

test('inactive shadows skip unless forceEnable is set', () => {
  const hull = { isMesh: true, castShadow: true };
  const renderer = { shadowMap: { enabled: false, render() { throw new Error('must not render'); } } };
  const skipped = compileShadowDepthPipelines({
    renderer,
    light: { castShadow: false },
    camera: {},
    subjects: [hull],
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome() {},
  });
  assert.equal(skipped.skipped, true);
  assert.match(skipped.reason, /inactive/);
});

test('armAdmissionShadows toggles live shadow state only when enabled', () => {
  const renderer = { shadowMap: { enabled: false } };
  const light = { castShadow: false, shadow: { needsUpdate: false } };
  const restore = armAdmissionShadows({ renderer, light, enabled: true });
  assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(light.castShadow, true);
  restore();
  assert.equal(renderer.shadowMap.enabled, false);
  assert.equal(light.castShadow, false);
  const idle = armAdmissionShadows({ renderer, light, enabled: false });
  assert.equal(renderer.shadowMap.enabled, false);
  idle();
});

const captureRealHome = (object) => ({
  object,
  parent: object.parent || null,
  index: object.parent ? object.parent.children.indexOf(object) : -1,
});
const restoreRealHome = (home) => {
  const object = home && home.object;
  if (!object) return;
  if (!home.parent) {
    if (object.parent) object.parent.remove(object);
    return;
  }
  if (object.parent !== home.parent) home.parent.add(object);
  const current = home.parent.children.indexOf(object);
  if (current >= 0 && home.index >= 0 && current !== home.index) {
    home.parent.children.splice(current, 1);
    home.parent.children.splice(Math.min(home.index, home.parent.children.length), 0, object);
  }
};

function stagedShadowRig() {
  const scene = new THREE.Scene();
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.castShadow = true;
  light.name = 'key';
  scene.add(light);
  scene.add(light.target);
  // A second, permanently-mounted light: the live census is l2|f0 while the reparent
  // loop strips the main scene to the key alone (l1|f0) — the mark/query census split
  // a single-light rig could never expose.
  const pool = new THREE.PointLight(0xffffff, 1);
  pool.name = 'pool';
  scene.add(pool);
  const liveMap = { name: 'live-shadow-map' };
  const liveMatrix = { name: 'live-shadow-matrix' };
  light.shadow.map = liveMap;
  light.shadow.matrix = liveMatrix;
  const hull = new THREE.Mesh();
  hull.castShadow = true;
  hull.name = 'hull';
  scene.add(hull);
  const stagedLights = [];
  const stagedMapsBeforeWrite = [];
  const renderer = {
    shadowMap: { enabled: true, needsUpdate: false, autoUpdate: false },
    renderBufferDirect() {},
    properties: { get: () => ({}) },
    getRenderTarget() { return null; },
    setRenderTarget() {},
    renderCalls: 0,
    render(staging) {
      renderer.renderCalls += 1;
      if (renderer.shadowMap.enabled === false) return;
      const staged = staging.children.find((child) => child.isDirectionalLight === true);
      stagedLights.push(staged);
      stagedMapsBeforeWrite.push(staged.shadow.map);
      staged.shadow.map = {
        name: 'admission-shadow-map',
        disposed: false,
        dispose() { this.disposed = true; },
      };
      staged.shadow.matrix = { name: 'admission-shadow-matrix' };
      // args[1] = null mirrors the real shadow pass (WebGLShadowMap draws with scene=null);
      // a non-null scene would read as a color draw and the caster would never mark.
      renderer.renderBufferDirect({}, null, {}, { properties: { currentProgram: { cacheKey: 'depth' } } }, hull, null);
    },
  };
  return { scene, light, liveMap, liveMatrix, hull, renderer, stagedLights, stagedMapsBeforeWrite };
}

const admissionOptions = (rig) => ({
  renderer: rig.renderer,
  light: rig.light,
  camera: new THREE.PerspectiveCamera(),
  subjects: [rig.hull],
  THREE,
  captureObjectHome: captureRealHome,
  restoreObjectHome: restoreRealHome,
  lightingScene: rig.scene,
});

test('shadow depth admission stages a private key-light clone and never writes the live shadow map', () => {
  const rig = stagedShadowRig();
  const result = compileShadowDepthPipelines(admissionOptions(rig));
  assert.equal(result.skipped, false);
  const staged = rig.stagedLights[0];
  assert.ok(staged && staged !== rig.light, 'the staged key light is a private clone');
  assert.ok(staged.shadow && staged.shadow !== rig.light.shadow, 'the clone owns a private shadow');
  assert.equal(rig.light.parent, rig.scene, 'live light stays in its scene');
  assert.equal(rig.light.target.parent, rig.scene, 'live target stays in its scene');
  assert.equal(rig.light.shadow.map, rig.liveMap, 'live shadow map identity preserved');
  assert.equal(rig.light.shadow.matrix, rig.liveMatrix, 'live shadow matrix preserved');
  assert.equal(staged.shadow.map.name, 'admission-shadow-map', 'the staged pass wrote the private map');
  assert.equal(rig.light.shadow.needsUpdate, false, 'no forced live refresh after a private pass');
  assert.equal(rig.renderer.shadowMap.enabled, true);
  assert.equal(rig.renderer.shadowMap.needsUpdate, false, 'prior renderer refresh request preserved');
  assert.equal(rig.renderer.shadowMap.autoUpdate, false);
});

test('repeat shadow depth admission reuses the cached private light and its shadow map', () => {
  const rig = stagedShadowRig();
  compileShadowDepthPipelines(admissionOptions(rig));
  const firstMap = rig.stagedLights[0].shadow.map;
  compileShadowDepthPipelines(admissionOptions(rig));
  assert.equal(rig.stagedLights.length, 2);
  assert.equal(rig.stagedLights[1], rig.stagedLights[0], 'repeat admission reuses the private clone');
  assert.equal(rig.stagedMapsBeforeWrite[1], firstMap,
    'the private shadow map persists between admissions instead of reallocating');
});

test('shadow depth admission restores renderer flags, hook, and target when the staged pass throws', () => {
  const rig = stagedShadowRig();
  const priorTarget = { name: 'prior-target' };
  const setTargets = [];
  const originalHook = function originalRenderBufferDirect() {};
  rig.renderer.shadowMap.enabled = false;
  rig.renderer.shadowMap.needsUpdate = true;
  rig.renderer.shadowMap.autoUpdate = true;
  rig.renderer.renderBufferDirect = originalHook;
  rig.renderer.getRenderTarget = () => priorTarget;
  rig.renderer.setRenderTarget = (target) => setTargets.push(target);
  rig.renderer.render = () => { throw new Error('shadow draw failed'); };
  assert.throws(() => compileShadowDepthPipelines({
    ...admissionOptions(rig),
    forceEnable: true,
  }), /shadow draw failed/);
  assert.equal(rig.renderer.shadowMap.enabled, false);
  assert.equal(rig.renderer.shadowMap.needsUpdate, true, 'prior refresh request preserved on throw');
  assert.equal(rig.renderer.shadowMap.autoUpdate, true);
  assert.equal(rig.renderer.renderBufferDirect, originalHook);
  assert.equal(setTargets[setTargets.length - 1], priorTarget);
  assert.equal(rig.light.parent, rig.scene);
  assert.equal(rig.light.shadow.map, rig.liveMap);
});

test('disposeAdmissionShadowResources retires cached private shadow resources and re-creates on next admission', () => {
  const rig = stagedShadowRig();
  compileShadowDepthPipelines(admissionOptions(rig));
  const staged = rig.stagedLights[0];
  const stagedMap = staged.shadow.map;
  disposeAdmissionShadowResources(rig.renderer);
  assert.equal(stagedMap.disposed, true, 'the private shadow map is disposed with the renderer');
  compileShadowDepthPipelines(admissionOptions(rig));
  assert.equal(rig.stagedLights.length, 2);
  assert.notEqual(rig.stagedLights[1], staged, 'a fresh clone is created after disposal');
});

test('shadow depth admission stages the source light\'s world transform under a transformed parent', () => {
  const rig = stagedShadowRig();
  const carrier = new THREE.Group();
  carrier.name = 'carrier';
  carrier.position.set(5, -2, 7);
  carrier.rotation.y = Math.PI / 3;
  carrier.scale.set(2, 2, 2);
  rig.scene.remove(rig.light);
  rig.scene.remove(rig.light.target);
  rig.light.position.set(1, 0, 0);
  rig.light.target.position.set(0, -3, 2);
  carrier.add(rig.light);
  carrier.add(rig.light.target);
  rig.scene.add(carrier);
  rig.scene.updateMatrixWorld(true);
  const worldLightPos = rig.light.getWorldPosition(new THREE.Vector3());
  const worldLightQuat = rig.light.getWorldQuaternion(new THREE.Quaternion());
  const worldTargetPos = rig.light.target.getWorldPosition(new THREE.Vector3());
  const localLightPos = rig.light.position.clone();
  const result = compileShadowDepthPipelines(admissionOptions(rig));
  assert.equal(result.skipped, false);
  const staged = rig.stagedLights[0];
  assert.ok(staged.position.distanceTo(worldLightPos) < 1e-6,
    'clone staged at the source light\'s world position, not its local offset');
  assert.ok(Math.abs(staged.quaternion.dot(worldLightQuat)) > 1 - 1e-6,
    'clone carries the source light\'s world orientation');
  assert.ok(staged.target.position.distanceTo(worldTargetPos) < 1e-6,
    'clone target staged at the source target\'s world position');
  const sourceDir = worldTargetPos.clone().sub(worldLightPos).normalize();
  const stagedDir = staged.target.position.clone().sub(staged.position).normalize();
  assert.ok(sourceDir.dot(stagedDir) > 1 - 1e-6, 'the staged world light direction matches the source');
  assert.equal(rig.light.parent, carrier, 'source light never leaves its transformed parent');
  assert.equal(rig.light.target.parent, carrier, 'source target is never reparented');
  assert.deepEqual(rig.light.position.toArray(), localLightPos.toArray(),
    'source local transform untouched');
});

test('disposeAdmissionShadowResources retires the private shadow through its canonical mapPass path', () => {
  const rig = stagedShadowRig();
  compileShadowDepthPipelines(admissionOptions(rig));
  const staged = rig.stagedLights[0];
  const stagedMap = staged.shadow.map;
  const stagedMapPass = { disposed: false, dispose() { this.disposed = true; } };
  staged.shadow.mapPass = stagedMapPass;
  disposeAdmissionShadowResources(rig.renderer);
  assert.equal(stagedMap.disposed, true, 'canonical shadow.dispose() retires the map');
  assert.equal(stagedMapPass.disposed, true, 'canonical shadow.dispose() retires the mapPass');
  assert.equal(staged.shadow.map, null, 'map reference cleared');
  assert.equal(staged.shadow.mapPass, null, 'mapPass reference cleared');
});

test('disposeAdmissionShadowResources clears references without GL calls when the context is lost', () => {
  const rig = stagedShadowRig();
  compileShadowDepthPipelines(admissionOptions(rig));
  const staged = rig.stagedLights[0];
  const stagedMap = staged.shadow.map;
  disposeAdmissionShadowResources(rig.renderer, { disposeGpu: false });
  assert.equal(stagedMap.disposed, false, 'no GL dispose on a lost context');
  assert.equal(staged.shadow.map, null, 'map reference cleared');
  assert.equal(staged.shadow.mapPass, null, 'mapPass reference cleared');
});

test('context-loss abandonment clears old admission state and the next drive stages fresh resources', () => {
  const rig = stagedShadowRig();
  compileShadowDepthPipelines(admissionOptions(rig));
  const abandoned = rig.stagedLights[0];
  const abandonedMap = abandoned.shadow.map;

  disposeAdmissionShadowResources(rig.renderer, { disposeGpu: false });

  assert.equal(abandonedMap.disposed, false, 'lost-generation maps are abandoned without dispatching GPU disposal');
  assert.equal(abandoned.shadow.map, null, 'the dead map is no longer retained by the staged shadow');
  assert.equal(abandoned.shadow.mapPass, null, 'the dead map pass is no longer retained');

  compileShadowDepthPipelines(admissionOptions(rig));
  const restored = rig.stagedLights[1];
  assert.notEqual(restored, abandoned, 'the next admission mints a fresh staged light after abandonment');
  assert.notEqual(restored.shadow.map, abandonedMap, 'the restored generation receives a new shadow map');
});

test('shadow depth admission restores renderer flags and live maps when the depth render throws', () => {
  const rig = stagedShadowRig();
  const priorTarget = { name: 'prior-target' };
  const setTargets = [];
  const originalHook = function originalRenderBufferDirect() {};
  rig.renderer.shadowMap.needsUpdate = true;
  rig.renderer.shadowMap.autoUpdate = true;
  rig.renderer.renderBufferDirect = originalHook;
  rig.renderer.getRenderTarget = () => priorTarget;
  rig.renderer.setRenderTarget = (target) => setTargets.push(target);
  rig.renderer.render = () => {
    rig.renderer.renderCalls += 1;
    if (rig.renderer.renderCalls === 2) throw new Error('depth pass failed');
  };
  assert.throws(() => compileShadowDepthPipelines(admissionOptions(rig)), /depth pass failed/);
  assert.equal(rig.renderer.renderCalls, 2,
    'the throw came from the staged depth render after the light census');
  assert.equal(rig.renderer.shadowMap.enabled, true);
  assert.equal(rig.renderer.shadowMap.needsUpdate, true, 'prior refresh request preserved on throw');
  assert.equal(rig.renderer.shadowMap.autoUpdate, true);
  assert.equal(rig.renderer.renderBufferDirect, originalHook);
  assert.equal(setTargets[setTargets.length - 1], priorTarget);
  assert.equal(rig.light.parent, rig.scene);
  assert.equal(rig.light.shadow.map, rig.liveMap, 'live shadow map identity preserved on throw');
  assert.equal(rig.light.shadow.matrix, rig.liveMatrix, 'live shadow matrix preserved on throw');
  assert.equal(rig.hull.parent, rig.scene, 'staged caster home restored on throw');
});

test('staged depth signatures dedup under the live light census', () => {
  const rig = stagedShadowRig();
  const result = compileShadowDepthPipelines(admissionOptions(rig));
  assert.equal(result.skipped, false);
  // The mark's census must equal the query's (the live scene): marks stamped under the
  // stripped post-reparent census could never match a live-census lookup, so every later
  // collect would re-report staged casters and re-pay the ceremony.
  assert.equal(collectUnstagedShadowCasters(rig.renderer, [rig.hull], rig.scene).length, 0);
  // A never-staged caster still collects — the gate only suppresses linked signatures.
  const fresh = new THREE.Mesh();
  fresh.castShadow = true;
  fresh.name = 'fresh';
  rig.scene.add(fresh);
  assert.equal(collectUnstagedShadowCasters(rig.renderer, [fresh], rig.scene).length, 1);
});

test('a pending live shadow refresh survives an interleaved private admission pass', () => {
  const rig = stagedShadowRig();
  rig.light.shadow.autoUpdate = true;
  assert.equal(scheduleRealtimeShadowRefresh(rig.renderer, rig.light, true), true);
  assert.equal(rig.light.shadow.needsUpdate, true);
  assert.equal(rig.renderer.shadowMap.needsUpdate, true);

  const result = compileShadowDepthPipelines(admissionOptions(rig));

  assert.equal(result.skipped, false);
  assert.equal(rig.light.shadow.needsUpdate, true,
    'the private pass must not consume the live light\'s pending refresh');
  assert.equal(rig.light.shadow.autoUpdate, false);
  assert.equal(rig.renderer.shadowMap.needsUpdate, true,
    'the global map scope restores the pending live request, not the private one');
  assert.equal(rig.renderer.shadowMap.autoUpdate, false);
  assert.equal(rig.light.shadow.map, rig.liveMap, 'live shadow map identity preserved');
  assert.equal(rig.light.shadow.matrix, rig.liveMatrix, 'live shadow matrix preserved');
});

test('staging session pays the census warm once and slices stage without re-ceremony', () => {
  const hullA = { isMesh: true, castShadow: true, name: 'hullA', parent: { children: [] } };
  hullA.parent.children.push(hullA);
  const hullB = { isMesh: true, castShadow: true, name: 'hullB', parent: { children: [] } };
  hullB.parent.children.push(hullB);
  const restored = [];
  const renderTypes = [];
  const renderer = {
    shadowMap: {
      enabled: true,
      needsUpdate: false,
      render(lights, staging) {
        renderTypes.push({ lights: lights.map((l) => l.name), children: staging.children.map((c) => c.name) });
      },
    },
    render(staging) {
      if (renderer.shadowMap.enabled === false) { renderTypes.push({ census: true }); return; }
      renderer.shadowMap.render(staging.children.filter((c) => c.castShadow === true), staging, null);
    },
    getRenderTarget() { return null; },
    setRenderTarget() {},
    properties: { get: (material) => material && material.properties || {} },
    renderBufferDirect() {},
  };
  const light = { name: 'key', castShadow: true, shadow: { needsUpdate: false } };
  const liveScene = { fog: null, traverse(fn) { fn(light); } };
  const session = createShadowDepthStagingSession({
    renderer, light, camera: { name: 'chase' },
    lightingScene: liveScene, THREE: mockThree(),
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome(home) { restored.push(home.object.name); },
    lightSig: 'l1|f0',
  });
  assert.ok(session, 'session minted under a live renderer');
  assert.equal(session.lightSig, 'l1|f0');
  assert.equal(renderTypes.length, 1, 'one census warm render at create');
  assert.equal(renderTypes[0].census, true);
  session.slice([hullA]);
  session.slice([hullB]);
  assert.equal(renderTypes.length, 3, 'each slice renders once — no further census');
  assert.ok(renderTypes[1].children.includes('hullA'));
  assert.ok(renderTypes[2].children.includes('hullB'));
  const report = session.close();
  assert.equal(session.slice([hullA]).skipped, true, 'a closed session reports skipped');
  session.close();
  assert.equal(report.subjects, 0, 'mock has no depth draws recorded');
  assert.equal(renderer.shadowMap.needsUpdate, false);
  assert.deepEqual(restored, ['hullA', 'hullB']);
});

test('a closed mid-drive stepped slice aborts instead of parking casters unmarked', () => {
  const casting = [];
  for (let i = 0; i < 40; i++) {
    const hull = { isMesh: true, castShadow: true, name: `hull${i}`, parent: { children: [] } };
    hull.parent.children.push(hull);
    casting.push(hull);
  }
  const renderer = {
    shadowMap: {
      enabled: true,
      needsUpdate: false,
      render() {},
    },
    render(staging) {
      if (renderer.shadowMap.enabled === false) return;
      renderer.shadowMap.render(
        staging.children.filter((c) => c.castShadow === true), staging, null);
    },
    getRenderTarget() { return null; },
    setRenderTarget() {},
    properties: { get: (material) => material && material.properties || {} },
    renderBufferDirect() {},
  };
  const light = { name: 'key', castShadow: true, shadow: { needsUpdate: false } };
  const liveScene = { fog: null, traverse(fn) { fn(light); } };
  const session = createShadowDepthStagingSession({
    renderer, light, camera: { name: 'chase' },
    lightingScene: liveScene, THREE: mockThree(),
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome() {},
    lightSig: 'l1|f0',
  });
  const iter = session.sliceSteps(casting);
  const first = iter.next();
  assert.equal(first.done, false, '40 casters exceed one 32-caster sub-pass');
  session.close();
  const second = iter.next();
  assert.equal(second.done, true);
  const result = second.value;
  assert.equal(result.aborted, true, 'a mid-drive close reports the abort marker');
  assert.equal(result.reason, 'session-closed-mid-drive');
  assert.equal(result.subjects, 0, 'the aborted leg reports no staged subjects');
});

test('an exhausted collect wallet returns the OVER_COVER sentinel, not an array', () => {
  const rig = stagedShadowRig();
  // The sentinel is a string returned where callers expect an array: a consumer
  // testing only `.length > 0` would spread its characters as bogus subjects, so
  // the `=== UNSTAGED_COLLECT_OVER_COVER` guard is the contract this pins.
  const overCover = collectUnstagedShadowCasters(
    rig.renderer, [rig.scene], rig.scene, undefined, { remaining: 0 });
  assert.equal(overCover, UNSTAGED_COLLECT_OVER_COVER);
  assert.equal(typeof overCover, 'string');
  assert.equal(Array.isArray(overCover), false);
  assert.equal(isUnstagedCollectOverCover(overCover), true);
  assert.equal(isUnstagedCollectOverCover([]), false);
  const flagOverCover = collectUnstagedShadowCastersFlag([rig.scene], undefined, { remaining: 0 });
  assert.equal(isUnstagedCollectOverCover(flagOverCover), true);
  assert.equal(Array.isArray(flagOverCover), false);
  const budgeted = collectUnstagedShadowCasters(
    rig.renderer, [rig.scene], rig.scene, undefined, { remaining: 64 });
  assert.equal(Array.isArray(budgeted), true, 'a live wallet still returns the caster array');
  assert.equal(isUnstagedCollectOverCover(budgeted), false);
});
