import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';
import { CauseMarkLayer } from '../src/render/vfx/causeMarks.js';
import { ContinuousPlumeSystem } from '../src/render/thruster/systems/continuousPlume.js';
import { resolveThrusterRecipes } from '../src/render/thruster/recipes/registry.js';
import {
  PRELIFT_WARM_ROOT_NAME,
  PRELIFT_WARM_ROCK_MATERIAL,
  __resetPreliftSceneWarmForTests,
} from '../src/render/preliftSceneWarm.js';

// Post-lift first-use links this warm exists for (perf lane impactgc traces, both arms).
const TARGET_PROGRAMS = [
  'sf-cause-marks',
  'plume:family_industrial_main_plume:core',
  'plume:family_industrial_main_plume:distortion',
  PRELIFT_WARM_ROCK_MATERIAL,
];

function rockScene(scene) {
  const material = new THREE.MeshStandardMaterial({ name: PRELIFT_WARM_ROCK_MATERIAL });
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const instanced = new THREE.InstancedMesh(geometry, material, 4);
  instanced.name = 'SF_CommonRockInstances_v0';
  const body = new THREE.Mesh(geometry, material);
  body.receiveShadow = true;
  const asteroid = new THREE.Group();
  asteroid.name = 'Asteroid_604';
  asteroid.add(body);
  scene.add(instanced, asteroid);
  return { material, geometry, body };
}

function fixture({ withRock = true } = {}) {
  __resetPreliftSceneWarmForTests();
  const owner = Object.create(vfx), scene = new THREE.Scene();
  const rock = withRock ? rockScene(scene) : null;
  const player = { id: 1, type: 'ship', alive: true, data: {}, pos: { x: 0, z: 0 } };
  Object.assign(owner, {
    _scene: scene, _energy: null, _destroyed: false,
    state: { mode: 'loading', playerId: 1, entities: new Map([[1, player]]),
      contextRestoreSeq: 0, render: { admissionRunGeneration: 1 }, settings: { video: {} } },
    _productionThrusterEnabled: () => true, _extendedEngineTrailsEnabled: () => false,
    _writeProductionPlumeSockets: () => 1,
    _productionPlumeSocketView: [{ x: -12, y: 0, z: -1, ax: 1, ay: 0, az: 0 }],
    _releasePlayerPlumeEventLight() {}, _clearProductionOwnership() {},
    _engineProfileIdFor: () => 'engine_ion_small',
    _initEnergy() { throw new Error('pre-lift scene warm must not initialize the fleet'); },
  });
  const warm = owner.warmupOpeningEffectSubsetForLoading({ playerPlasmaOnly: true });
  return { owner, scene, rock, warm };
}

const warmRoot = (warm) => warm.plasmaRoot.children.find((c) => c.name === PRELIFT_WARM_ROOT_NAME) || null;

function drawnLeaves(root) {
  const out = [];
  root.traverse((node) => {
    if (!node.isMesh && !node.isLine) return;
    const range = node.geometry.drawRange.count;
    const vertices = node.geometry.attributes.position ? node.geometry.attributes.position.count : 0;
    const count = node.isInstancedMesh ? node.count : 1;
    if (node.visible && Math.min(range, vertices) > 0 && count > 0) out.push(node);
  });
  return out;
}

test('the strict plasma admission root carries an exemplar for every targeted program', () => {
  const f = fixture();
  try {
    const root = warmRoot(f.warm);
    assert.ok(root, 'warm root mounted under the admitted plasma root');
    const leaves = drawnLeaves(root);
    const covered = new Set();
    for (const leaf of leaves) {
      if (leaf.isLineSegments && leaf.material.vertexColors) covered.add('sf-cause-marks');
      if (leaf.material.name) covered.add(leaf.material.name);
    }
    for (const name of TARGET_PROGRAMS) assert.ok(covered.has(name), `warm covers ${name}`);
    assert.deepEqual(f.warm.sceneWarm, {
      causeMarks: true, plumeLayers: f.warm.sceneWarm.plumeLayers,
      plumeRecipe: 'family_industrial_main_plume', rock: true, rockSource: 'Asteroid_604',
    });
    assert.ok(f.warm.sceneWarm.plumeLayers >= 2);
    assert.equal(f.owner._energy, null, 'no fleet init');
  } finally { f.warm.releaseWarmSamples(); f.owner._disposeEnergy(); }
});

test('exemplars resolve the live program keys', () => {
  const f = fixture();
  try {
    const root = warmRoot(f.warm);
    // Cause marks: same material factory as the live layer.
    const live = new CauseMarkLayer(new THREE.Scene()).mesh.material;
    const cause = root.children.find((c) => c.isLineSegments);
    for (const key of ['type', 'vertexColors', 'transparent', 'depthWrite', 'toneMapped', 'blending', 'side']) {
      assert.equal(cause.material[key], live[key], `cause-mark material ${key}`);
    }
    // Plume: same shaders/defines as a fleet family (familyFleet.js options), any family.
    const fleetPlume = new ContinuousPlumeSystem(THREE, resolveThrusterRecipes('engine_vector').main,
      { textures: {}, maxSockets: 8, distortionEnabled: false });
    const byRole = (group, role) => group.children.find((m) => m.name === `plume-layer:${role}`).material;
    const warmPlume = root.children.find((c) => c.name.endsWith(':plume'));
    for (const role of ['core', 'distortion']) {
      const a = byRole(warmPlume, role), b = byRole(fleetPlume.group, role);
      assert.equal(a.vertexShader, b.vertexShader, `${role} vertex shader`);
      assert.equal(a.fragmentShader, b.fragmentShader, `${role} fragment shader`);
      assert.deepEqual(a.defines || {}, b.defines || {}, `${role} defines`);
      assert.equal(a.uniforms.uDistortEnabled?.value, b.uniforms.uDistortEnabled?.value);
    }
    // Rock: the live per-body material, non-instanced, same attribute layout and shadow flags.
    const rock = root.children.find((c) => c.name.endsWith(':rock'));
    assert.equal(rock.material, f.rock.material);
    assert.equal(rock.isInstancedMesh, undefined);
    assert.equal(rock.receiveShadow, true);
    assert.deepEqual(Object.keys(rock.geometry.attributes).sort(), Object.keys(f.rock.geometry.attributes).sort());
    for (const k of Object.keys(rock.geometry.attributes)) {
      assert.equal(rock.geometry.attributes[k].itemSize, f.rock.geometry.attributes[k].itemSize);
    }
    assert.notEqual(rock.geometry, f.rock.geometry, 'exemplar never borrows the live geometry');
  } finally { f.warm.releaseWarmSamples(); f.owner._disposeEnergy(); }
});

test('release detaches every exemplar and never disposes a shared material', () => {
  const f = fixture();
  const root = warmRoot(f.warm);
  const disposed = [];
  root.traverse((n) => { if (n.material) n.material.addEventListener('dispose', () => disposed.push(n.material.name)); });
  assert.equal(f.warm.releaseWarmSamples(), true);
  assert.equal(warmRoot(f.warm), null);
  assert.equal(root.parent, null);
  assert.deepEqual(disposed, []);
  assert.equal(f.warm.releaseWarmSamples(), false);
  f.owner._disposeEnergy();
});

test('no per-body rock in the scene: cause marks and plume still warm, rock skipped', () => {
  const f = fixture({ withRock: false });
  try {
    assert.equal(f.warm.sceneWarm.rock, false);
    assert.equal(f.warm.sceneWarm.causeMarks, true);
    assert.ok(f.warm.sceneWarm.plumeLayers >= 2);
  } finally { f.warm.releaseWarmSamples(); f.owner._disposeEnergy(); }
});
