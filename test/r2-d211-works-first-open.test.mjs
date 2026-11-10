// D211: the first presented Asteroid Works picture must not be the pass that
// links the opening program cohort. Bloom's post materials, the scene color
// programs, and the shadow-depth variants compile() never reaches are warmed
// first. The presented frame reports only the keys it still had to link.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorksOpeningGate,
  rendererProgramCacheKeys,
  runWorksPresentedFrame,
  warmWorksOpeningPrograms,
  worksPresentedFrameLinkedKeys,
} from '../src/render/startupGpuResidency.js';

const POST_KEYS = ['works-post-cas', 'works-post-composite', 'works-post-downsample'];
const COLOR_KEY = 'works-rock-color';
const DEPTH_KEY = 'works-rock-depth';
const LATE_KEY = 'works-late-machine';

class MockScene {
  constructor() {
    this.children = [];
    this.name = '';
    this.fog = null;
  }
  add(child) {
    if (!child || this.children.includes(child)) return;
    this.children.push(child);
  }
  remove(child) {
    this.children = this.children.filter((item) => item !== child);
  }
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

function mockThree() {
  return { Scene: MockScene, DirectionalLight: MockDirectionalLight };
}

function pushProgram(renderer, key) {
  const have = rendererProgramCacheKeys(renderer);
  if (have.includes(key)) return;
  renderer.info.programs.push({ cacheKey: key });
}

function openingBloom(renderer) {
  const materials = POST_KEYS.map((key) => ({
    name: key,
    properties: { currentProgram: { cacheKey: key } },
  }));
  return {
    openingProgramMaterials: () => materials,
    async prepareResources() {
      for (const key of POST_KEYS) pushProgram(renderer, key);
      return { skipped: false, targets: 3 };
    },
  };
}

function depthRenderer(onDepthDraw) {
  const renderer = {
    info: { programs: [] },
    shadowMap: { enabled: true, needsUpdate: false },
    renderCalls: 0,
    render(staging, camera) {
      renderer.renderCalls += 1;
      if (renderer.shadowMap.enabled === false) return;
      if (typeof onDepthDraw === 'function') onDepthDraw(renderer, staging, camera);
    },
    renderBufferDirect() {},
    properties: { get: (material) => material?.properties || {} },
    getRenderTarget: () => null,
    setRenderTarget() {},
  };
  return renderer;
}

function casterScene() {
  const hull = {
    isMesh: true,
    castShadow: true,
    name: 'works-rock',
    visible: true,
    geometry: {},
    material: { visible: true },
    parent: null,
  };
  const scene = new MockScene();
  scene.name = 'works';
  scene.add(hull);
  hull.parent = scene;
  const light = {
    name: 'key',
    isLight: true,
    isDirectionalLight: true,
    castShadow: true,
    shadow: { needsUpdate: false },
    parent: scene,
  };
  scene.add(light);
  return { scene, hull, light };
}

test('opening warm owns the works cohort so the first presented frame links only a later program', async () => {
  const { scene, hull, light } = casterScene();
  const generatedDepth = { properties: { currentProgram: { cacheKey: DEPTH_KEY } } };
  const renderer = depthRenderer((host) => {
    pushProgram(host, DEPTH_KEY);
    host.renderBufferDirect({}, {}, {}, generatedDepth, hull, null);
  });
  const receipt = await warmWorksOpeningPrograms({
    renderer,
    bloom: openingBloom(renderer),
    scene,
    camera: { name: 'works' },
    light,
    THREE: mockThree(),
    yieldToMain: async () => {},
    compileScene: async () => { pushProgram(renderer, COLOR_KEY); },
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome() {},
  });

  assert.ok(receipt.keys.includes(DEPTH_KEY), 'shadow-depth variant is part of the opening warm');
  assert.ok(receipt.keys.includes(COLOR_KEY), 'scene color program is part of the opening warm');
  for (const key of POST_KEYS) {
    assert.ok(receipt.keys.includes(key), `${key} is part of the opening warm`);
  }
  assert.equal(receipt.depthSkipped, false);

  const gate = createWorksOpeningGate();
  let draws = 0;
  const held = runWorksPresentedFrame(gate, () => {
    draws += 1;
    return [LATE_KEY];
  });
  assert.equal(held.drew, false);
  assert.equal(draws, 0, 'a cold opening must not present');
  assert.deepEqual(held.linkedKeys, []);

  await gate.ensure(async () => receipt);
  const cold = [...receipt.keys, LATE_KEY];
  const presented = runWorksPresentedFrame(gate, () => {
    draws += 1;
    const before = rendererProgramCacheKeys(renderer);
    pushProgram(renderer, LATE_KEY);
    return worksPresentedFrameLinkedKeys(before, rendererProgramCacheKeys(renderer));
  });
  assert.equal(presented.drew, true);
  assert.equal(draws, 1);
  assert.deepEqual(presented.linkedKeys, [LATE_KEY]);
  assert.ok(presented.linkedKeys.length < cold.length);
  for (const key of receipt.keys) {
    assert.equal(presented.linkedKeys.includes(key), false, `${key} must not link inside the presented frame`);
  }
});

test('a quiet works open with nothing to warm leaves a later program unwarmed', async () => {
  const scene = new MockScene();
  scene.name = 'works-quiet';
  const renderer = depthRenderer();
  const receipt = await warmWorksOpeningPrograms({
    renderer,
    bloom: {
      openingProgramMaterials: () => [],
      async prepareResources() { return { skipped: true, reason: 'already-prepared' }; },
    },
    scene,
    camera: { name: 'works' },
    light: { name: 'key', castShadow: true, shadow: { needsUpdate: false }, isLight: true },
    THREE: mockThree(),
    yieldToMain: async () => {},
    captureObjectHome: (object) => ({ object }),
    restoreObjectHome() {},
  });
  assert.deepEqual(receipt.keys, []);
  assert.equal(receipt.depthSkipped, true);

  const gate = createWorksOpeningGate();
  await gate.ensure(async () => receipt);
  const quiet = runWorksPresentedFrame(gate, () => []);
  assert.equal(quiet.drew, true);
  assert.deepEqual(quiet.linkedKeys, []);

  const later = runWorksPresentedFrame(gate, () => [LATE_KEY]);
  assert.deepEqual(later.linkedKeys, [LATE_KEY]);
});
