import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { WebGLPrograms } from 'three/src/renderers/webgl/WebGLPrograms.js';
import { createUnreadyDrawableGuard } from '../src/render/bloom.js';

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
  const lights = { directional: [], point: [], spot: [], spotLightMap: [], rectArea: [], hemi: [],
    directionalShadowMap: [], pointShadowMap: [], spotShadowMap: [], numSpotLightShadowsWithMaps: 0,
    numLightProbes: 0 };
  const keyFor = (object) => nativePrograms.getProgramCacheKey(
    nativePrograms.getParameters(material, lights, [], scene, object, []));
  const programs = {
    instanced: { cacheKey: keyFor(instanced), isReady: () => true },
    mesh: { cacheKey: keyFor(mesh), isReady: () => true },
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
