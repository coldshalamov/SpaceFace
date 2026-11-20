import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { applyFirstPlayablePaintRelease, render } from '../src/render/renderer.js';
import {
  presentUiStage, releaseUiStage, resumeUiStageAfterContextRestore, retireUiStageForContextLoss,
  setUiStagePartLoaderForTest,
} from '../src/render/uiStage.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function makeOpeningLightOwner(t) {
  const overlay = { style: { display: 'flex' }, dataset: { loadingStage: 'boot-menu' } };
  let cinematic = { hidden: false };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    getElementById: (id) => ({ 'boot-overlay': overlay, 'cinematic-splash': cinematic })[id],
  } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  });
  t.mock.method(globalThis, 'setInterval', () => 1);

  let contextLost = false;
  const texture = new THREE.Texture();
  const bake = t.mock.fn(() => ({ texture }));
  const owner = {
    renderer: { getContext: () => ({ isContextLost: () => contextLost }) },
    scene: new THREE.Scene(),
    state: { mode: 'loading', render: {} },
    _foundryEnvTexture: new THREE.Texture(),
    _foundryEnvPending: true,
    _pmremGenerator: { fromScene: bake },
    _pmremContextSeq: 0,
    _bakeEnv: render._bakeEnv,
    _drainFoundryEnvPending: render._drainFoundryEnvPending,
    _queueEnvironmentVariantAdmission: t.mock.fn(),
  };
  return {
    owner, overlay, texture, bake,
    finishCinematic() { cinematic = null; },
    setContextLost(value) { contextLost = value; owner._contextLost = value; },
  };
}

test('the real world environment commits under the Continue veil before first picture', (t) => {
  const { owner, overlay, texture, bake, finishCinematic } = makeOpeningLightOwner(t);
  owner._bakeEnv({ force: true });
  assert.equal(bake.mock.callCount(), 0, 'required world work still yields to both startup films');

  overlay.dataset.loadingStage = 'restoring-save';
  owner._bakeEnv({ force: true });
  assert.equal(bake.mock.callCount(), 0, 'the title film still owns the picture during its fade');

  finishCinematic();
  overlay.dataset.loadingStage = 'gpu-resources';
  owner._drainFoundryEnvPending();
  assert.equal(overlay.style.display, 'flex');
  assert.strictEqual(owner.scene.environment, texture, 'bind the exact map to the real world scene while veiled');
  assert.strictEqual(owner.state.render.envMap, texture);
  assert.strictEqual(owner._queueEnvironmentVariantAdmission.mock.calls[0].arguments[0], texture);

  owner.state.mode = 'flight';
  applyFirstPlayablePaintRelease(owner);
  assert.equal(owner.state.render.foundryEnvAtReveal.source, 'foundry');
  assert.equal(owner.state.render.foundryEnvAtReveal.pending, false);
  assert.equal(bake.mock.callCount(), 1);
});

test('an armed environment drain survives a real startup deferral and context loss', (t) => {
  const { owner, overlay, texture, bake, finishCinematic, setContextLost } = makeOpeningLightOwner(t);
  owner._drainFoundryEnvPending();
  assert.equal(owner._foundryEnvPending, true, 'the initial picture still owns a real deferral');
  assert.equal(bake.mock.callCount(), 0);

  finishCinematic();
  overlay.dataset.loadingStage = 'gpu-resources';
  setContextLost(true);
  owner._drainFoundryEnvPending();
  assert.equal(owner._foundryEnvPending, true, 'an unavailable context does not consume the bake');
  assert.equal(bake.mock.callCount(), 0);

  setContextLost(false);
  owner._drainFoundryEnvPending();
  assert.equal(owner._foundryEnvPending, false);
  assert.strictEqual(owner.scene.environment, texture);
  assert.equal(bake.mock.callCount(), 1);
});

test('title field keeps its own rig and replay stages demand world lighting before their first draw', async (t) => {
  const tape = JSON.parse(readFileSync(new URL('../src/sim/titleAttractTapeData.json', import.meta.url), 'utf8'));
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => tape }));
  setUiStagePartLoaderForTest(async () => null);
  t.after(() => {
    releaseUiStage('test-finish');
    setUiStagePartLoaderForTest(null);
  });
  let target = null;
  const clear = new THREE.Color();
  const renderer = {
    domElement: { isConnected: false }, autoClear: true, shadowMap: { enabled: false },
    render(scene) { this.lastScene = scene; },
    compile() {},
    getSize(out) { return out.set(1280, 720); },
    getRenderTarget() { return target; }, setRenderTarget(value) { target = value; },
    getClearColor(out) { return out.copy(clear); }, getClearAlpha() { return 1; },
    setClearColor(value) { clear.set(value); },
  };
  const state = { mode: 'menu', ui: { stageRequest: { scene: 'title-field' } }, render: {} };
  const _bakeEnv = t.mock.fn(() => { state.render.envMap = new THREE.Texture(); });
  const present = () => presentUiStage({ render: { renderer, _bakeEnv }, state });

  assert.equal(present(), true);
  assert.equal(_bakeEnv.mock.callCount(), 0);
  assert.equal(renderer.lastScene.environment, null);
  const light = renderer.lastScene.children.find((node) => node.isDirectionalLight && node.castShadow);
  assert.equal(light.color.getHex(), 0xffb473);
  assert.equal(light.intensity, 3.2);

  const cinema = { hidden: false };
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    querySelector: () => null,
    getElementById: (id) => id === 'cinematic-splash' ? cinema : null,
  } });
  try {
    state.ui.stageRequest = { scene: 'title-attract' };
    assert.equal(present(), false, 'the title film retains the picture over an early attract request');
    assert.equal(_bakeEnv.mock.callCount(), 0);
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else delete globalThis.document;
  }

  for (const [index, scene] of ['title-attract', 'replay-theater'].entries()) {
    state.render.envMap = null;
    state.ui.stageRequest = { scene };
    assert.equal(present(), true);
    assert.equal(_bakeEnv.mock.callCount(), index + 1);
    assert.ok(state.render.envMap?.isTexture);
    assert.strictEqual(renderer.lastScene.environment, state.render.envMap);
    assert.equal(present(), true);
    assert.equal(_bakeEnv.mock.callCount(), index + 1, 'the stage reuses the current world environment');
  }

  assert.equal(retireUiStageForContextLoss(renderer), 1);
  state.render.envMap = null;
  assert.equal(present(), false);
  assert.equal(_bakeEnv.mock.callCount(), 2);
  const restored = new THREE.Texture();
  state.render.envMap = restored;
  assert.equal(resumeUiStageAfterContextRestore(renderer), true);
  assert.equal(present(), true);
  assert.strictEqual(renderer.lastScene.environment, restored);
  assert.equal(_bakeEnv.mock.callCount(), 2, 'the restored world map satisfies the rebuilt stage');
  releaseUiStage('test-end');
  await Promise.resolve();
});

function makeOwner({ firstPresent, compile, touch }) {
  const env = { uuid: 'pmrem-new' };
  const quarks = {
    name: 'SF_QuarksBatchedRenderer',
    visible: true,
    traverse(fn) { fn(this); },
  };
  const scene = {
    environment: env,
    traverse(fn) { fn(this); fn(quarks); },
  };
  const lifecycle = {
    active: true,
    isActive() { return this.active; },
    async wait() { return true; },
  };
  const owner = {
    renderer: {},
    scene,
    cam: { obj: {} },
    state: { mode: 'flight', ui: {}, render: {} },
    bloom: { touchScenePipelines: touch },
    _envMap: env,
    _rendererLifecycle: lifecycle,
    _firstPresentGpuAdmission: firstPresent,
    _environmentAdmissionKey: render._environmentAdmissionKey,
    _queueEnvironmentVariantAdmission: render._queueEnvironmentVariantAdmission,
    _selectPostRoute() { return 'bloom'; },
    _compilePostRoute(route, subject, camera, targetScene) {
      return compile({ route, subject, camera, targetScene });
    },
  };
  return { owner, env, quarks, scene, lifecycle };
}

test('PMREM-key admission holds world submission until exact live effect touch settles', async () => {
  const firstPresent = Promise.resolve();
  const compileGate = deferred();
  const touchGate = deferred();
  const seen = [];
  const { owner, env, quarks, scene } = makeOwner({
    firstPresent,
    compile: (call) => { seen.push({ phase: 'compile', ...call, env: scene.environment }); return compileGate.promise; },
    touch: (subject, camera, targetScene) => {
      seen.push({ phase: 'touch', subject, camera, targetScene, env: scene.environment });
      return touchGate.promise;
    },
  });

  // The earlier first-present pass already resolved without this committed key. A new
  // environment-specific admission must still gate the actual draw decision.
  owner._environmentVariantAdmission = Promise.resolve('old env-less admission');
  const admission = render._queueEnvironmentVariantAdmission.call(owner, env);
  assert.equal(render.drawPreparedFrame.call(owner), false, 'world draw is held during variant admission');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].phase, 'compile');
  assert.equal(seen[0].env, env);
  assert.equal(seen[0].subject, quarks);

  compileGate.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(seen[1].phase, 'touch');
  assert.equal(render.drawPreparedFrame.call(owner), false, 'draw remains held through exact target touch');
  touchGate.resolve();
  await admission;
  assert.equal(owner._environmentVariantAdmissionPending, false);
  assert.equal(owner._environmentVariantAdmissionEnv, env);
  assert.throws(
    () => render.drawPreparedFrame.call(owner),
    /arm/,
    'after admission settles the real draw path is released',
  );
  const replacement = { uuid: 'same-program-key', mapping: env.mapping, image: env.image };
  owner._envMap = replacement;
  scene.environment = replacement;
  assert.equal(render._queueEnvironmentVariantAdmission.call(owner, replacement), null,
    'a texture replacement with the already-admitted shader key needs no extra gate');
});

test('superseded or disposed environment admission cannot publish readiness', async () => {
  const firstPresent = deferred();
  const compileGate = deferred();
  const newTouch = deferred();
  const oldEnv = { uuid: 'old', mapping: 1, image: { height: 64 } };
  const newEnv = { uuid: 'new', mapping: 306, image: { height: 2048 } };
  const calls = [];
  const { owner, scene, lifecycle } = makeOwner({
    firstPresent: firstPresent.promise,
    compile: ({ targetScene }) => {
      calls.push(targetScene.environment);
      return compileGate.promise;
    },
    touch: (_subject, _camera, targetScene) => targetScene.environment === newEnv
      ? newTouch.promise
      : assert.fail('superseded environment must not touch'),
  });
  owner._envMap = oldEnv;
  scene.environment = oldEnv;
  const oldAdmission = render._queueEnvironmentVariantAdmission.call(owner, oldEnv);
  owner._envMap = newEnv;
  scene.environment = newEnv;
  const newAdmission = render._queueEnvironmentVariantAdmission.call(owner, newEnv);
  firstPresent.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [newEnv], 'the superseded env-less key is not admitted or reused');
  compileGate.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  await oldAdmission;
  assert.equal(owner._environmentVariantAdmissionPending, true,
    'the stale environment pass cannot release the current draw gate');
  newTouch.resolve();
  await newAdmission;
  assert.equal(owner._environmentVariantAdmissionPending, false);
  assert.equal(owner._environmentVariantAdmissionEnv, newEnv);

  const disposed = makeOwner({ firstPresent: Promise.resolve(), compile: () => assert.fail('inactive owner must not compile'), touch: () => assert.fail('inactive owner must not touch') });
  disposed.lifecycle.active = false;
  const cancelled = render._queueEnvironmentVariantAdmission.call(disposed.owner, disposed.env);
  await cancelled;
  assert.notEqual(disposed.owner._environmentVariantAdmissionPending, true);
});

test('failed admission releases its gate without publishing readiness; a new context key can retry', async () => {
  const env = { uuid: 'env-a', mapping: 306, image: { height: 2048 } };
  let compileCalls = 0;
  let touches = 0;
  const ownerBits = makeOwner({
    firstPresent: Promise.resolve(),
    compile: () => {
      compileCalls += 1;
      return compileCalls === 1 ? Promise.reject(new Error('transient compile failure')) : Promise.resolve();
    },
    touch: () => { touches += 1; return Promise.resolve(); },
  });
  ownerBits.owner._envMap = env;
  ownerBits.scene.environment = env;
  const first = render._queueEnvironmentVariantAdmission.call(ownerBits.owner, env);
  assert.equal(await first, false);
  assert.equal(ownerBits.owner._environmentVariantAdmissionEnvKey ?? null, null,
    'failed compile does not publish the shader key as ready');
  assert.equal(ownerBits.owner._environmentVariantAdmissionPending, false,
    'a settled optional-environment failure releases the draw gate');
  assert.throws(() => render.drawPreparedFrame.call(ownerBits.owner), /arm/,
    'the failure path releases the actual draw decision');

  ownerBits.owner.state.contextRestoreSeq = 1;
  const restored = render._queueEnvironmentVariantAdmission.call(ownerBits.owner, env);
  await restored;
  assert.equal(compileCalls, 2);
  assert.equal(touches, 1);
  assert.match(ownerBits.owner._environmentVariantAdmissionEnvKey, /^1:/);
  assert.equal(ownerBits.owner._environmentVariantAdmissionPending, false);
});
