import assert from 'node:assert/strict';
import test from 'node:test';

import {
  armAdmissionShadows,
  collectShadowCastSubjects,
  compileShadowDepthPipelines,
} from '../src/render/shadowDepthAdmission.js';

// The implementation stages casters into a real THREE.Scene and calls
// renderer.render() so WebGLShadowMap runs under a live render state. The mocks
// below emulate that contract: render() drives shadowMap.render() over the
// staged scene's shadow-casting light, and the Scene/RT/material doubles carry
// the surface the implementation touches.
function fakeThree() {
  class Scene {
    constructor() { this.children = []; this.name = ''; this.isScene = true; }
    add(child) { this.children.push(child); }
    remove(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
    }
    clear() { this.children.length = 0; }
    updateMatrixWorld() {}
    traverse(fn) { fn(this); for (const child of this.children) fn(child); }
  }
  class WebGLRenderTarget {
    constructor() { this.disposed = false; }
    dispose() { this.disposed = true; }
  }
  class MeshBasicMaterial {
    constructor(options = {}) { Object.assign(this, options); this.isMeshBasicMaterial = true; }
  }
  return { Scene, WebGLRenderTarget, MeshBasicMaterial };
}

// Emulates the production render() -> WebGLShadowMap.render() hop so tests keep
// observing the same (lights, stagedScene, camera) triple the real pass sees.
function emulateSceneRender(renderer, shadowRender) {
  renderer.render = function render(staging, camera) {
    const lights = (staging && staging.children || []).filter((child) => child && child.shadow);
    return shadowRender.call(renderer.shadowMap, lights, staging, camera);
  };
}

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
  emulateSceneRender(renderer, renderer.shadowMap.render);
  const light = { name: 'key', castShadow: false, shadow: { needsUpdate: false } };
  const result = compileShadowDepthPipelines({
    renderer,
    light,
    camera: { name: 'chase' },
    subjects: [hull],
    forceEnable: true,
    THREE: fakeThree(),
    captureObjectHome(object) {
      homes.push(object.name);
      return { object };
    },
    restoreObjectHome(home) { restored.push(home.object.name); },
  });
  assert.equal(result.skipped, false);
  assert.equal(result.subjects, 1);
  assert.deepEqual(homes, ['hull', 'key']);
  assert.deepEqual(restored, ['hull', 'key']);
  assert.equal(renders.length, 1);
  assert.deepEqual(renders[0].children, ['hull', 'key']);
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
  emulateSceneRender(renderer, renderer.shadowMap.render);
  const result = compileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [hull],
    THREE: fakeThree(),
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
  emulateSceneRender(renderer, renderer.shadowMap.render);
  const result = compileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [hull],
    THREE: fakeThree(),
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
  emulateSceneRender(renderer, renderer.shadowMap.render);
  assert.throws(() => compileShadowDepthPipelines({
    renderer,
    light: { castShadow: true, shadow: {} },
    camera: {},
    subjects: [hull],
    THREE: fakeThree(),
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
  emulateSceneRender(renderer, renderer.shadowMap.render);
  const result = compileShadowDepthPipelines({
    renderer,
    light: { name: 'key', castShadow: false, shadow: { needsUpdate: false } },
    camera: { name: 'chase' },
    subjects: [hull],
    forceEnable: true,
    THREE: fakeThree(),
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

test('policy-off shadow-capable casters still compile their depth variant', () => {
  // The instance-pool submit policy clears castShadow while a chunk has no submitted
  // instances; when slots later submit in cast radius the flag re-arms and the first
  // live shadow pass would link the depth variant inside a measured frame. Admission
  // stages shadow-capable drawables with the flag forced on, then restores it.
  const chunk = {
    isInstancedMesh: true,
    isMesh: true,
    castShadow: false,
    visible: true,
    count: 0,
    name: 'pool-chunk',
    material: { transparent: false, depthWrite: true, blending: 1 },
    parent: { children: [] },
  };
  chunk.parent.children.push(chunk);
  const transparentNonCaster = {
    isMesh: true,
    castShadow: false,
    visible: true,
    name: 'glass',
    material: { transparent: true, depthWrite: false },
    parent: { children: [] },
  };
  const renders = [];
  const renderer = {
    shadowMap: {
      enabled: false,
      render(lights, staging) {
        renders.push(staging.children.map((child) => ({
          name: child.name,
          castShadow: child.castShadow,
          count: child.count,
        })));
      },
    },
    getRenderTarget() { return null; },
    setRenderTarget() {},
  };
  emulateSceneRender(renderer, renderer.shadowMap.render);
  const result = compileShadowDepthPipelines({
    renderer,
    light: { name: 'key', castShadow: false, shadow: { needsUpdate: false } },
    camera: { name: 'chase' },
    subjects: [chunk, transparentNonCaster],
    forceEnable: true,
    THREE: fakeThree(),
    captureObjectHome(object) { return { object }; },
    restoreObjectHome() {},
  });
  assert.equal(result.skipped, false);
  assert.equal(result.latentCasters, 1);
  assert.equal(renders.length, 1);
  const staged = renders[0].find((child) => child.name === 'pool-chunk');
  assert.equal(staged.castShadow, true, 'latent caster staged as a caster');
  assert.equal(staged.count, 1);
  assert.equal(chunk.castShadow, false, 'policy flag restored after the pass');
});

test('live-scene mode renders the live scene with only staged casters drawable', () => {
  // Depth program keys embed the render-state light census: staging inside the live
  // scene links the variant the next measured draw actually uses. The render must stay
  // bounded to the admission batch, so every other drawable is hidden for one pass.
  const THREE = fakeThree();
  const scene = new THREE.Scene();
  scene.name = 'live';
  const baseAdd = scene.add.bind(scene);
  scene.add = (child) => { baseAdd(child); child.parent = scene; };
  const light = { name: 'key', castShadow: true, shadow: { needsUpdate: false } };
  const resident = { isMesh: true, castShadow: true, visible: true, name: 'resident' };
  const other = { isMesh: true, castShadow: true, visible: true, name: 'other' };
  scene.add(light);
  scene.add(resident);
  scene.add(other);
  const detached = { isMesh: true, castShadow: true, visible: true, name: 'detached', parent: null };
  const renders = [];
  const renderer = {
    shadowMap: {
      enabled: true,
      render(lights, renderedScene) {
        renders.push({
          scene: renderedScene.name,
          lights: lights.map((item) => item.name),
          children: renderedScene.children.map((child) => ({
            name: child.name,
            visible: child.visible !== false,
          })),
        });
      },
    },
    getRenderTarget() { return null; },
    setRenderTarget() {},
  };
  emulateSceneRender(renderer, renderer.shadowMap.render);
  const result = compileShadowDepthPipelines({
    renderer,
    light,
    camera: {},
    scene,
    subjects: [resident, detached],
    THREE,
    captureObjectHome(object) {
      return { object, parent: object.parent || null };
    },
    restoreObjectHome(home) {
      const object = home && home.object;
      if (!object) return;
      if (object.parent && Array.isArray(object.parent.children)) {
        const index = object.parent.children.indexOf(object);
        if (index >= 0) object.parent.children.splice(index, 1);
      }
      object.parent = null;
      if (home.parent && typeof home.parent.add === 'function') home.parent.add(object);
    },
  });
  assert.equal(result.skipped, false);
  assert.equal(result.subjects, 2);
  assert.equal(renders.length, 1);
  assert.equal(renders[0].scene, 'live', 'rendered the live scene, not a synthetic staging scene');
  assert.deepEqual(renders[0].lights, ['key'], 'live light stays mounted for the census');
  const visByName = Object.fromEntries(renders[0].children.map((child) => [child.name, child.visible]));
  assert.equal(visByName.resident, true);
  assert.equal(visByName.detached, true, 'detached caster staged into the live scene');
  assert.equal(visByName.other, false, 'unrelated drawables hidden for the staged pass');
  assert.equal(other.visible, true, 'hidden drawable restored after the pass');
  assert.equal(detached.parent, null, 'staged caster returned to its detached home');
  assert.equal(scene.children.includes(detached), false, 'staged caster not left in the live scene');
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
