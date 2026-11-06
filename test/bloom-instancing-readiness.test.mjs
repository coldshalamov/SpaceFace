import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { WebGLPrograms } from 'three/src/renderers/webgl/WebGLPrograms.js';
import { createBloom, createUnreadyDrawableGuard } from '../src/render/bloom.js';

for (const pass of ['render', 'rehearseScenePass']) {
  test(`bloom ${pass} checks ready hull and star programs against its scene target`, () => {
    let target = null;
    const draws = [], admissions = [], records = new WeakMap();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const stars = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    hull.name = 'player-hull'; stars.name = 'background-stars';
    scene.add(hull, stars);
    const renderer = {
      capabilities: { isWebGL2: false, maxSamples: 0 }, autoClear: true,
      outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping,
      info: { programs: [] },
      state: { buffers: { depth: { getReversed: () => false } } },
      shadowMap: { enabled: false, type: THREE.PCFShadowMap },
      getRenderTarget: () => target, setRenderTarget(value) { target = value; },
      setViewport() {}, getViewport(out) { return out.set(0, 0, 390, 664); },
      setScissor() {}, getScissor(out) { return out.set(0, 0, 390, 664); },
      setScissorTest() {}, getScissorTest: () => false, clear() {},
      properties: { get: material => records.get(material) || {} },
      userData: { spacefaceQueuePipelineAdmission(subject) {
        admissions.push(subject); return Promise.resolve();
      } },
      renderBufferDirect(_camera, _scene, _geometry, _material, object) { draws.push(object); },
      render(candidate, view) {
        if (candidate !== scene) return;
        candidate.traverseVisible(object => {
          if (object.material && object.layers.test(view.layers)) {
            this.renderBufferDirect(view, candidate, object.geometry, object.material, object, null);
          }
        });
      },
    };
    const bloom = createBloom(renderer, 390, 664);
    const sceneTarget = bloom.contextLossResources().find(resource => resource.isWebGLRenderTarget);
    const programs = WebGLPrograms(renderer, { get: () => null }, { has: () => false },
      { precision: 'highp', logarithmicDepthBuffer: false }, {}, { numPlanes: 0, numIntersection: 0 });
    const lights = { sun: [], directional: [], point: [], spot: [], spotLightMap: [], rectArea: [], hemi: [],
      sunShadowMap: [], directionalShadowMap: [], pointShadowMap: [], spotShadowMap: [],
      numSpotLightShadowsWithMaps: 0 };
    try {
      // These are the actual programs compiled for bloom's linear HDR scene, not extra
      // default-framebuffer variants. Pause leaves the previous held target on screen.
      renderer.setRenderTarget(sceneTarget);
      for (const object of [hull, stars]) {
        const parameters = programs.getParameters(object.material, lights, [], scene, object, []);
        const cacheKey = programs.getProgramCacheKey(parameters);
        const program = { program: {}, cacheKey, isReady: () => true };
        records.set(object.material, { currentProgram: program, programs: new Map([[cacheKey, program]]),
          instancing: false, instancingColor: false, instancingMorph: false, skinning: false,
          toneMapping: parameters.toneMapping, outputColorSpace: parameters.outputColorSpace,
          __version: object.material.version });
        renderer.info.programs.push(program);
        assert.equal(parameters.toneMapping, THREE.NoToneMapping);
        assert.equal(parameters.outputColorSpace, THREE.LinearSRGBColorSpace);
      }
      renderer.setRenderTarget(null);
      bloom[pass](scene, camera);
      assert.deepEqual(draws.map(object => object.name), ['player-hull', 'background-stars'],
        'ready authored hull and stars survive the first readiness scan');
      assert.deepEqual(admissions, [], 'the held screen target must not manufacture missing scene variants');
      assert.equal(renderer.getRenderTarget(), null, 'the screen/rehearsal target is restored');
      assert.equal(hull.layers.mask, 1);
      assert.equal(stars.layers.mask, 1);
      assert.equal(renderer.__sfUnreadyDrawGuardDepth, 0);
    } finally {
      bloom.dispose(); hull.geometry.dispose(); hull.material.dispose();
      stars.geometry.dispose(); stars.material.dispose();
    }
  });
}

function fixture(stamped = true) {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial();
  if (stamped) material.userData.spacefaceProgramCanon = 1;
  let cacheKeyCalls = 0;
  material.customProgramCacheKey = () => {
    cacheKeyCalls++;
    return 'authored,hook,(normal,color)';
  };
  const mesh = new THREE.Mesh(geometry, material);
  const instanced = new THREE.InstancedMesh(geometry, material, 1);
  const scene = new THREE.Scene();
  scene.add(mesh, instanced);
  const draws = [];
  const admissions = [];
  const rec = { programs: new Map(), instancing: true, instancingColor: false, instancingMorph: false };
  const renderer = {
    info: { programs: [] }, outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.NoToneMapping,
    getRenderTarget: () => null,
    state: { buffers: { depth: { getReversed: () => false } } },
    shadowMap: { enabled: false, type: THREE.PCFShadowMap },
    properties: { get: () => rec },
    userData: { spacefaceQueuePipelineAdmission(subject) {
      admissions.push(subject);
      return Promise.resolve();
    } },
    renderBufferDirect(_camera, _scene, _geometry, _material, object) {
      draws.push(object);
      rec.instancing = object.isInstancedMesh === true;
      rec.currentProgram = rec.instancing ? programs.instanced : programs.mesh;
      return 'drawn';
    },
  };
  // Use the installed Three version's real parameter/key generation, not a guessed key shape.
  const nativePrograms = WebGLPrograms(renderer, { get: () => null }, { has: () => false },
    { precision: 'highp', logarithmicDepthBuffer: false }, {}, { numPlanes: 0, numIntersection: 0 });
  const lights = { sun: [], directional: [], point: [], spot: [], spotLightMap: [], rectArea: [], hemi: [],
    sunShadowMap: [], directionalShadowMap: [], pointShadowMap: [], spotShadowMap: [], numSpotLightShadowsWithMaps: 0,
    numLightProbes: 0 };
  const keyFor = (object) => nativePrograms.getProgramCacheKey(
    nativePrograms.getParameters(material, lights, [], scene, object, []));
  const programs = {
    instanced: { program: {}, cacheKey: keyFor(instanced), isReady: () => true },
    mesh: { program: {}, cacheKey: keyFor(mesh), isReady: () => true },
  };
  rec.currentProgram = programs.instanced;
  rec.programs.set(programs.instanced.cacheKey, programs.instanced);
  renderer.info.programs.push(programs.instanced);
  const guard = createUnreadyDrawableGuard(renderer);
  return { scene, mesh, instanced, material, renderer, rec, programs, guard, draws, admissions,
    cacheKeyCalls: () => cacheKeyCalls,
    dispose() { guard.restore(); geometry.dispose(); material.dispose(); instanced.dispose(); } };
}

function draw(f, object) {
  return f.renderer.renderBufferDirect(null, f.scene, object.geometry, f.material, object, null);
}

test('stamped and unstamped instanced programs cannot authorize a cold regular Mesh variant', () => {
  for (const stamped of [true, false]) {
    const f = fixture(stamped);
    try {
      f.guard.hide(f.scene);
      assert.equal(draw(f, f.mesh), undefined);
      assert.equal(draw(f, f.mesh), undefined);
      assert.equal(draw(f, f.instanced), 'drawn', 'the compiled instance variant remains drawable');
      assert.deepEqual(f.admissions, [f.mesh], 'only the missing regular variant queues admission');
      assert.deepEqual(f.draws, [f.instanced]);

      let regularReady = false;
      f.programs.mesh.isReady = () => regularReady;
      f.rec.programs.set(f.programs.mesh.cacheKey, f.programs.mesh);
      assert.equal(draw(f, f.mesh), undefined, 'a cached but still-linking alternate must wait');
      regularReady = true;
      assert.equal(draw(f, f.mesh), 'drawn', 'the ready alternate can draw without a new compile');
    } finally { f.dispose(); }
  }
});

test('ready Mesh and InstancedMesh variants alternate without requeueing or rebuilding cache keys', () => {
  const f = fixture();
  try {
    f.rec.programs.set(f.programs.mesh.cacheKey, f.programs.mesh);
    f.renderer.info.programs.push(f.programs.mesh);
    f.guard.hide(f.scene);
    assert.equal(draw(f, f.mesh), 'drawn');
    assert.equal(draw(f, f.instanced), 'drawn');
    const warmedKeyCalls = f.cacheKeyCalls();
    for (let i = 0; i < 32; i++) {
      assert.equal(draw(f, f.mesh), 'drawn');
      assert.equal(draw(f, f.instanced), 'drawn');
    }
    assert.equal(f.admissions.length, 0, 'linked sibling variants are never hidden or readmitted');
    assert.equal(f.cacheKeyCalls(), warmedKeyCalls, 'steady alternation reuses parsed variant keys');
  } finally { f.dispose(); }
});

test('a disposed cached sibling is readmitted without querying its destroyed GL program', () => {
  const f = fixture();
  try {
    let staleQueries = 0;
    // Three's destroy() clears the public handle, but isReady() still closes
    // over the original raw handle and would query it if called afterwards.
    f.programs.mesh.program = undefined;
    f.programs.mesh.isReady = () => { staleQueries++; return null; };
    f.rec.programs.set(f.programs.mesh.cacheKey, f.programs.mesh);
    f.guard.hide(f.scene);
    assert.equal(draw(f, f.mesh), undefined);
    assert.equal(staleQueries, 0, 'destroyed siblings must never reach the readiness GL query');
    assert.deepEqual(f.admissions, [f.mesh], 'the missing live variant follows existing readmission');
    assert.equal(draw(f, f.instanced), 'drawn', 'the retained live sibling keeps drawing');
  } finally { f.dispose(); }
});
