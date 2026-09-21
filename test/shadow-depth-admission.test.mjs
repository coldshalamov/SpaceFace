import assert from 'node:assert/strict';
import test from 'node:test';

import {
  armAdmissionShadows,
  collectShadowCastSubjects,
  compileShadowDepthPipelines,
} from '../src/render/shadowDepthAdmission.js';

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
const mockThree = () => ({ Scene: MockScene });

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
  assert.deepEqual(homes, ['hull', 'key']);
  assert.deepEqual(restored, ['key', 'hull']);
  assert.equal(renderer.renderCalls, 2, 'light-census warm render plus the real shadow pass');
  assert.equal(renders.length, 1);
  assert.deepEqual(renders[0].children, ['key', 'hull']);
  assert.equal(light.castShadow, false);
  assert.equal(renderer.shadowMap.enabled, false);
  assert.equal(light.shadow.needsUpdate, true);
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
