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
    THREE: {
      Group: class {
        constructor() { this.children = []; this.name = ''; }
        add(child) { this.children.push(child); }
        clear() { this.children.length = 0; }
        updateMatrixWorld() {}
      },
    },
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
  assert.equal(renders.length, 1);
  assert.deepEqual(renders[0].children, ['hull']);
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
    shadowMap: {
      enabled: true,
      render() { renderer.renderBufferDirect({}, {}, {}, generatedDepth, hull, null); },
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
    THREE: { Group: class { constructor() { this.children = []; } add(child) { this.children.push(child); } clear() {} updateMatrixWorld() {} } },
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
    shadowMap: { enabled: true, render() { renderer.renderBufferDirect({}, {}, {}, {}, hull, null); } },
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
    THREE: { Group: class { constructor() { this.children = []; } add(child) { this.children.push(child); } clear() {} updateMatrixWorld() {} } },
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
    shadowMap: { enabled: true, render() { throw new Error('shadow draw failed'); } },
    renderBufferDirect: originalRenderBufferDirect,
    getRenderTarget() { return null; },
    setRenderTarget() {},
  };
  assert.throws(() => compileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [hull],
    THREE: { Group: class { constructor() { this.children = []; } add(child) { this.children.push(child); } clear() {} updateMatrixWorld() {} } },
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
    getRenderTarget() { return null; },
    setRenderTarget() {},
  };
  const result = compileShadowDepthPipelines({
    renderer,
    light: { name: 'key', castShadow: false, shadow: { needsUpdate: false } },
    camera: { name: 'chase' },
    subjects: [hull],
    forceEnable: true,
    THREE: {
      Group: class {
        constructor() { this.children = []; this.name = ''; }
        add(child) { this.children.push(child); }
        clear() { this.children.length = 0; }
        updateMatrixWorld() {}
      },
    },
    captureObjectHome(object) { return { object }; },
    restoreObjectHome() {},
  });
  assert.equal(result.skipped, false);
  assert.equal(renders.length, 1);
  assert.equal(renders[0][0].visible, true);
  assert.equal(renders[0][0].count, 1);
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
