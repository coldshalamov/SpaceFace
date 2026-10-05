import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  armAdmissionShadows,
  collectShadowCastSubjects,
  collectUnstagedShadowCasters,
  compileShadowDepthPipelines,
  createShadowDepthStagingSession,
  disposeAdmissionShadowResources,
} from '../src/render/shadowDepthAdmission.js';
import { scheduleRealtimeShadowRefresh } from '../src/render/shadowPresentCadence.js';

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
