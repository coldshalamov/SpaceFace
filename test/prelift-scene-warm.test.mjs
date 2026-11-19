import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';
import { CauseMarkLayer } from '../src/render/vfx/causeMarks.js';
import { ContinuousPlumeSystem } from '../src/render/thruster/systems/continuousPlume.js';
import { resolveThrusterRecipes } from '../src/render/thruster/recipes/registry.js';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import {
  PRELIFT_WARM_FREIGHTER_ENTITY,
  PRELIFT_WARM_ROOT_NAME,
  PRELIFT_WARM_ROCK_MATERIAL,
  __resetPreliftSceneWarmForTests,
} from '../src/render/preliftSceneWarm.js';

// Headless canvas so the visual factory can paint hull textures (same stub as
// runtime-visual-type-coverage.test.mjs).
function stubCanvas() {
  const context = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, arcTo() {}, ellipse() {}, fillText() {},
    measureText() { return { width: 0 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => stubCanvas() };

globalThis.document ||= { createElement: () => stubCanvas() };

// Post-lift first-use links this warm exists for (perf lane impactgc traces, both arms).
const TARGET_PROGRAMS = [
  'sf-cause-marks',
  'plume:family_industrial_main_plume:core',
  'plume:family_industrial_main_plume:distortion',
  PRELIFT_WARM_ROCK_MATERIAL,
  `${PRELIFT_WARM_ROCK_MATERIAL}#instanced`,
];

function rockScene(scene, { withPool = true, withBody = true } = {}) {
  const material = new THREE.MeshStandardMaterial({ name: PRELIFT_WARM_ROCK_MATERIAL, vertexColors: true });
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
  // Live pool chunk as asteroidInstancePool.ensureCapacity publishes it: hidden, count 0.
  const instanced = new THREE.InstancedMesh(geometry, material, 64);
  instanced.name = 'SF_CommonRockInstances_v3';
  instanced.count = 0;
  instanced.visible = false;
  instanced.castShadow = true;
  instanced.receiveShadow = true;
  const body = new THREE.Mesh(geometry, material);
  body.receiveShadow = true;
  const asteroid = new THREE.Group();
  asteroid.name = 'Asteroid_604';
  asteroid.add(body);
  if (withPool) scene.add(instanced);
  if (withBody) scene.add(asteroid);
  return { material, geometry, body, instanced };
}

// three.js WebGLPrograms.getProgramCacheKey inputs that differ between program variants of one
// material: the instancing / instancingColor / vertexColors / morph booleans and the attribute
// layout. A tiny exemplar matches the live pool chunk iff all of these match.
function programShape(mesh) {
  const g = mesh.geometry;
  return {
    material: mesh.material,
    instancing: mesh.isInstancedMesh === true,
    instancingColor: mesh.isInstancedMesh === true && mesh.instanceColor !== null,
    instancingMorph: mesh.isInstancedMesh === true && mesh.morphTexture !== null,
    batching: mesh.isBatchedMesh === true,
    skinning: mesh.isSkinnedMesh === true,
    attributes: Object.keys(g.attributes).sort().map((k) => `${k}:${g.attributes[k].itemSize}:${g.attributes[k].normalized}`),
    morph: Object.keys(g.morphAttributes || {}).length,
  };
}

function fixture({ withRock = true, withPool = true, withBody = true, vf = undefined } = {}) {
  __resetPreliftSceneWarmForTests();
  const owner = Object.create(vfx), scene = new THREE.Scene();
  const rock = withRock ? rockScene(scene, { withPool, withBody }) : null;
  const player = { id: 1, type: 'ship', alive: true, data: {}, pos: { x: 0, z: 0 } };
  Object.assign(owner, {
    _scene: scene, _energy: null, _destroyed: false,
    state: { mode: 'loading', playerId: 1, entities: new Map([[1, player]]),
      contextRestoreSeq: 0, render: { admissionRunGeneration: 1, vf: vf === undefined ? createVisualFactory() : vf },
      settings: { video: {} } },
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
      const name = leaf.material.name;
      if (name) covered.add(name === PRELIFT_WARM_ROCK_MATERIAL && leaf.isInstancedMesh ? `${name}#instanced` : name);
    }
    for (const name of TARGET_PROGRAMS) assert.ok(covered.has(name), `warm covers ${name}`);
    assert.deepEqual(f.warm.sceneWarm, {
      causeMarks: true, plumeLayers: f.warm.sceneWarm.plumeLayers,
      plumeRecipe: 'family_industrial_main_plume', rock: true, rockSource: 'Asteroid_604',
      rockInstanced: true, rockInstancedSource: 'SF_CommonRockInstances_v3',
      freighterLeaves: f.warm.sceneWarm.freighterLeaves,
    });
    assert.ok(f.warm.sceneWarm.freighterLeaves >= 3);
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
    // Instanced rock: same program shape as the pooled SF_CommonRockInstances chunk.
    const inst = root.children.find((c) => c.name.endsWith(':rock-instanced'));
    assert.ok(inst && inst.isInstancedMesh, 'instanced rock exemplar is an InstancedMesh');
    assert.equal(inst.count, 1);
    assert.equal(inst.visible, true);
    assert.deepEqual(programShape(inst), programShape(f.rock.instanced));
    assert.equal(inst.castShadow, f.rock.instanced.castShadow, 'depth variant warmed iff the chunk casts');
    assert.equal(inst.receiveShadow, f.rock.instanced.receiveShadow);
    assert.notEqual(inst.geometry, f.rock.instanced.geometry, 'exemplar never borrows the pool geometry');
    // The per-body exemplar must stay non-instanced: it and the pooled chunk are two programs.
    assert.notDeepEqual(programShape(rock), programShape(f.rock.instanced));
  } finally { f.warm.releaseWarmSamples(); f.owner._disposeEnergy(); }
});

test('no pooled chunk yet: instanced exemplar falls back to the per-body rock material', () => {
  const f = fixture({ withPool: false });
  try {
    const root = warmRoot(f.warm);
    const inst = root.children.find((c) => c.name.endsWith(':rock-instanced'));
    assert.ok(inst && inst.isInstancedMesh);
    assert.equal(inst.material, f.rock.material);
    assert.equal(f.warm.sceneWarm.rockInstancedSource, 'per-body-material');
    // Same shape as the chunk the pool would publish over this leaf (ensureCapacity).
    const chunk = new THREE.InstancedMesh(f.rock.geometry, f.rock.material, 64);
    const shape = programShape(inst); const want = programShape(chunk);
    assert.deepEqual(shape, want);
  } finally { f.warm.releaseWarmSamples(); f.owner._disposeEnergy(); }
});

// scenewarm3 6v6: the warm runs ~15 s before the lift, before any per-body asteroid exists, so the
// per-body key (envMap, instancing bit clear) still linked post-lift on Asteroid_604 in 3/5 runs.
test('no per-body asteroid yet: the per-body key is warmed from the pooled chunk material', () => {
  const f = fixture({ withBody: false });
  try {
    const root = warmRoot(f.warm);
    const rock = root.children.find((c) => c.name.endsWith(':rock'));
    assert.ok(rock, 'per-body rock exemplar present without a per-body asteroid');
    assert.equal(rock.isInstancedMesh, undefined);
    assert.equal(rock.material, f.rock.instanced.material, 'shared library material, never a copy');
    assert.equal(f.warm.sceneWarm.rock, true);
    assert.equal(f.warm.sceneWarm.rockSource, 'pooled-material:SF_CommonRockInstances_v3');
    // Exactly the program a per-body asteroid over the library material resolves.
    const body = new THREE.Mesh(f.rock.geometry, f.rock.material);
    assert.deepEqual(programShape(rock), programShape(body));
    // ...and differs from the instanced exemplar only in the instancing bit.
    const inst = root.children.find((c) => c.name.endsWith(':rock-instanced'));
    assert.deepEqual({ ...programShape(inst), instancing: false, instancingColor: false, instancingMorph: false },
      { ...programShape(rock), instancingColor: false, instancingMorph: false });
    assert.notEqual(rock.geometry, f.rock.instanced.geometry, 'exemplar never borrows the pool geometry');
    assert.ok(drawnLeaves(root).includes(rock), 'per-body exemplar actually draws');
  } finally { f.warm.releaseWarmSamples(); f.owner._disposeEnergy(); }
});

test('freighter exemplars keep only the attribute layout, not the built freighter geometry', () => {
  invalidateVisualFactoryCaches();
  const vf = createVisualFactory();
  const built = [];
  const spy = { build: (e) => { const o = vf.build(e); o.traverse((n) => { if (n.geometry) built.push(n.geometry); }); return o; } };
  const f = fixture({ vf: spy });
  try {
    const root = warmRoot(f.warm);
    const leaves = root.children.filter((c) => c.name.includes(':freighter:'));
    assert.ok(leaves.length > 0);
    for (const leaf of leaves) assert.ok(!built.includes(leaf.geometry), 'own degenerate geometry');
  } finally { f.warm.releaseWarmSamples(); f.owner._disposeEnergy(); invalidateVisualFactoryCaches(); }
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
    assert.equal(f.warm.sceneWarm.rockInstanced, false);
    assert.equal(f.warm.sceneWarm.causeMarks, true);
    assert.ok(f.warm.sceneWarm.plumeLayers >= 2);
  } finally { f.warm.releaseWarmSamples(); f.owner._disposeEnergy(); }
});

// LOAD-03 (5934f96ba9) warms the Swarm door's arena scene only while the crucible menu warm is
// staged; ordinary Adventure never arms it, so the pre-lift exemplars stay on the plasma warm the
// Adventure first-picture cook admits. If LOAD-03 ever arms on Adventure, fold these exemplars
// into it instead of keeping two hooks.
test('LOAD-03 stays crucible-menu-only; Adventure reaches the pre-lift warm through the plasma warm', () => {
  const renderer = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /warmPlayerPlasma\(\{ playerPlasmaOnly: true \}\)/,
    'Adventure first-picture cook still runs the plasma-only warm');
  const arm = renderer.indexOf('this._armMenuSwarmSceneWarm(this._menuSwarmSpec)');
  assert.ok(arm > 0, 'LOAD-03 arm call present');
  const before = renderer.slice(Math.max(0, arm - 400), arm);
  assert.ok(/_earlyCrucibleWarmMenu/.test(before), 'LOAD-03 arm gated on the crucible menu warm');
  const vfxSrc = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.match(vfxSrc, /attachPreliftSceneWarm\(plasmaStream\.group/);
});

// Lane-traffic freighter (Mesh<Group<Group<Scene in the scenewarm2 traces; who-tap diag v3who1:
// root userData kind 'ship', presentationEntityType 'freighter', generatedVisualProducer
// 'visual-factory-procedural'). The three programs that linked post-lift on both arms were the
// illustrated hull (map + normal + roughness), the transparent map-only grime/patch overlay and
// the MeshPhysicalMaterial canopy.
// Every material input three.js WebGLPrograms folds into the program cache key (per-build
// materials such as the shield bubble are fresh objects but resolve the same key).
const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap',
  'bumpMap', 'displacementMap', 'lightMap', 'envMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
  'transmissionMap', 'thicknessMap', 'sheenColorMap', 'specularIntensityMap', 'specularColorMap', 'iridescenceMap'];
function programSig(m) {
  return JSON.stringify([m.type, m.customProgramCacheKey ? m.customProgramCacheKey() : '',
    m.isShaderMaterial ? [m.vertexShader, m.fragmentShader, m.defines || {}] : null,
    MAP_SLOTS.map((k) => !!m[k]), m.transparent, m.vertexColors, m.side, m.alphaTest > 0, m.alphaHash,
    m.flatShading, m.fog, m.toneMapped, m.premultipliedAlpha, m.dithering, m.blending,
    m.clearcoat > 0, m.transmission > 0, m.sheen > 0, m.iridescence > 0, m.anisotropy > 0, m.dispersion > 0,
    m.normalMapType, m.envMapIntensity !== undefined]);
}
function leafShape(node) {
  return [programSig(node.material), node.isInstancedMesh === true, node.isInstancedMesh === true && !!node.instanceColor,
    Object.keys(node.geometry.attributes).sort().map((k) => `${k}:${node.geometry.attributes[k].itemSize}:${node.geometry.attributes[k].normalized === true}`).join(',')].join('|');
}
function builtShapes(vf, laneVariant) {
  const root = vf.build({ ...PRELIFT_WARM_FREIGHTER_ENTITY, id: 900 + laneVariant,
    data: { parentType: 'lane_traffic', laneVariant } });
  const out = new Set();
  root.traverse((n) => { if (n.isMesh && n.material && !Array.isArray(n.material) && !n.isBatchedMesh) out.add(leafShape(n)); });
  return out;
}

test('freighter exemplars share the factory materials of every lane variant and cover the post-lift programs', () => {
  invalidateVisualFactoryCaches();
  const vf = createVisualFactory();
  const f = fixture({ vf });
  try {
    const root = warmRoot(f.warm);
    const leaves = root.children.filter((c) => c.name.includes(':freighter:'));
    assert.equal(leaves.length, f.warm.sceneWarm.freighterLeaves);
    const warmed = new Set(leaves.map(leafShape));
    for (let v = 0; v < 8; v++) {
      for (const shape of builtShapes(vf, v)) assert.ok(warmed.has(shape), `lane variant ${v} leaf ${shape} warmed`);
    }
    const mats = leaves.map((l) => l.material);
    assert.ok(mats.some((m) => m.isMeshStandardMaterial && m.map && m.normalMap && m.roughnessMap
      && m.userData.spacefaceIllustratedSurface), 'illustrated hull (map/normal/roughness)');
    assert.ok(mats.some((m) => m.isMeshStandardMaterial && m.map && !m.normalMap && m.transparent), 'transparent overlay');
    assert.ok(mats.some((m) => m.isMeshPhysicalMaterial), 'canopy physical');
    for (const leaf of leaves) {
      assert.equal(leaf.frustumCulled, false);
      assert.ok(leaf.geometry.drawRange.count > 0 && leaf.geometry.attributes.position.count === 3, 'degenerate own geometry');
      assert.ok([...leaf.geometry.attributes.position.array].every((x) => x === 0));
    }
  } finally { f.warm.releaseWarmSamples(); f.owner._disposeEnergy(); invalidateVisualFactoryCaches(); }
});

test('freighter release never disposes the module-cached factory materials', () => {
  invalidateVisualFactoryCaches();
  const f = fixture({ vf: createVisualFactory() });
  const root = warmRoot(f.warm);
  const disposed = [];
  for (const leaf of root.children.filter((c) => c.name.includes(':freighter:'))) {
    leaf.material.addEventListener('dispose', () => disposed.push(leaf.material.uuid));
  }
  f.warm.releaseWarmSamples();
  assert.deepEqual(disposed, []);
  f.owner._disposeEnergy();
  invalidateVisualFactoryCaches();
});

test('no visual factory: freighter exemplars skipped, the rest still warm', () => {
  const f = fixture({ vf: null });
  try {
    assert.equal(f.warm.sceneWarm.freighterLeaves, 0);
    assert.equal(f.warm.sceneWarm.causeMarks, true);
    assert.equal(f.warm.sceneWarm.rockInstanced, true);
  } finally { f.warm.releaseWarmSamples(); f.owner._disposeEnergy(); }
});
