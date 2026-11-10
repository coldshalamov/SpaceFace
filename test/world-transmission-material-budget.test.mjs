import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createVisualFactory, asteroidLeafResources, asteroidPoolWarmResources } from '../src/render/visualFactory.js';
import {
  opticCellBodyMaterial, opticCellPoolResources, syncOpticCellSkin,
  OPTIC_DETAILS_USERDATA_KEY,
} from '../src/render/opticCellPresentation.js';
import { makeCanopyMaterial } from '../src/render/assetLoader.js';
import { createAsteroidInstancePool, registerAsteroidBaseLeaf } from '../src/render/asteroidInstancePool.js';

// CPU material construction uses the same canvas shim as the factory's focused tests;
// pixels/GPU appearance remain the pilot's separate check.
const context = {
  createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
  getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
  putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, fillText() {},
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
  beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {},
  bezierCurveTo() {}, quadraticCurveTo() {},
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  measureText() { return { width: 10 }; },
};
globalThis.document = {
  createElement: () => ({ width: 256, height: 256, style: {}, getContext: () => context, addEventListener() {} }),
};

const factory = createVisualFactory();
const body = (typeId, opticMaterial = null) => {
  const entity = { id: `budget:${typeId}:${opticMaterial}`, type: 'asteroid', radius: 13,
    pos: { x: 0, y: 0, z: 0 }, data: { typeId, ...(opticMaterial ? { opticMaterial } : {}) } };
  const root = factory.build(entity);
  assert.ok(root?.userData?.asteroidBody, 'actual factory built the world body');
  return { entity, root, material: root.userData.asteroidBody.material };
};
const params = material => ({ transmission: material.transmission, opacity: material.opacity,
  transparent: material.transparent, depthWrite: material.depthWrite });
const assertBudget = (material, family, opacity, transmission, transparent = false) => {
  assert.equal(material.isMeshPhysicalMaterial, true);
  assert.deepEqual(params(material), { transmission: 0, opacity, transparent: true, depthWrite: false });
  assert.deepEqual(material.userData.spacefaceTransmissionBudget, { family, strategy: 'environment-alpha',
    original: { transmission, opacity: 1, transparent, depthWrite: !transparent } });
  assert.ok(material.userData.spacefaceProgramFamily.includes('no-transmission'), 'ABI sees final candidate features');
};

test('real factory ice and gas keep their material identity and optical surface response', () => {
  const ice = body('ast_icy').material;
  assertBudget(ice, 'ordinary-ice', 0.72, 0.78);
  assert.equal(ice, asteroidLeafResources('ast_icy', 0).material, 'actual leaf getter shares candidate material');
  assert.equal(ice.roughness, 0.06);
  assert.equal(ice.clearcoat, 1);
  assert.equal(ice.ior, 1.31);
  assert.equal(ice.thickness, 2.8);
  assert.equal(ice.emissiveIntensity, 0.22);
  assert.equal(ice.color.getHex(), 0x8fd8f0);

  const gasRoot = body('ast_gas_cloud').root;
  const gas = gasRoot.children.find(node => node.material?.userData?.spacefaceTransmissionBudget?.family === 'ordinary-gas')?.material;
  assert.ok(gas, 'actual gas shell uses its scoped family');
  assertBudget(gas, 'ordinary-gas', 0.70, 0.88, true);
  assert.equal(gas.color.getHex(), 0x2d6a52);
  assert.equal(gas.roughness, 0.42);
  assert.equal(gas.emissiveIntensity, 0.28);
  assert.equal(gas.side, THREE.DoubleSide);
});

test('pool warm resources bind the same alpha ice and live/spent optic materials', () => {
  const ice = asteroidLeafResources('ast_icy', 0).material;
  const resources = asteroidPoolWarmResources();
  assert.ok(resources.some(resource => resource.material === ice));
  const optics = opticCellPoolResources(() => new THREE.IcosahedronGeometry(1, 0));
  for (const kind of ['diamond', 'spent']) {
    assert.equal(optics.find(resource => resource.key === `o:${kind}`).material, opticCellBodyMaterial(kind));
  }
});

test('alpha body leaves remain visible on the ordinary mesh path, outside the opaque instance pool', () => {
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);
  for (const [typeId, kind] of [['ast_icy', null], ['ast_crystalline', 'diamond'], ['ast_crystalline', 'spent']]) {
    const { entity, root } = body(typeId, kind);
    scene.add(root);
    assert.equal(registerAsteroidBaseLeaf(pool, entity, root), false);
    assert.equal(root.userData.asteroidBody.visible, true);
    assert.equal(root.parent, scene);
  }
});

test('spend and rekindle preserve body geometry, shared materials, facets and charged/dead tells', () => {
  const { entity, root, material: live } = body('ast_crystalline', 'diamond');
  const mesh = root.userData.asteroidBody, geometry = mesh.geometry;
  const details = root.userData[OPTIC_DETAILS_USERDATA_KEY];
  assertBudget(live, 'optic-diamond', 0.70, 0.85);
  assert.ok(details.length >= 3 && details.every(node => node.parent === mesh));
  const liveDetail = details[0].material;
  assert.equal(live.color.getHex(), 0xecfaff);
  assert.equal(live.iridescence, 0.32);
  assert.equal(live.specularIntensity, 1);
  entity.data.opticMaterial = 'spent';
  assert.equal(syncOpticCellSkin(entity, root), true);
  const spent = mesh.material;
  assertBudget(spent, 'optic-spent', 0.88, 0.26);
  assert.equal(mesh.geometry, geometry);
  assert.equal(spent.color.getHex(), 0x222c37);
  assert.equal(spent.iridescence, 0);
  assert.ok(spent.emissiveIntensity < live.emissiveIntensity / 2);
  assert.notEqual(details[0].material, liveDetail);
  assert.ok(details[0].material.emissiveIntensity < liveDetail.emissiveIntensity);
  entity.data.opticMaterial = 'diamond';
  assert.equal(syncOpticCellSkin(entity, root), true);
  assert.equal(mesh.material, live);
  assert.equal(details[0].material, liveDetail);
  assert.equal(syncOpticCellSkin(entity, root), false, 'steady-state sync remains idle');
});

test('four-family provenance allows exact scalar restore with finally and preserves hooks/maps', () => {
  const gasRoot = body('ast_gas_cloud').root;
  const gas = gasRoot.children.find(node => node.material?.userData?.spacefaceTransmissionBudget?.family === 'ordinary-gas').material;
  for (const material of [asteroidLeafResources('ast_icy', 0).material, gas,
    opticCellBodyMaterial('diamond'), opticCellBodyMaterial('spent')]) {
    const candidate = params(material), hook = material.onBeforeCompile, key = material.customProgramCacheKey;
    const map = material.map, normalMap = material.normalMap;
    try {
      Object.assign(material, material.userData.spacefaceTransmissionBudget.original);
      assert.ok(material.transmission > 0, 'comparison restores real source refraction');
      assert.equal(material.onBeforeCompile, hook);
      assert.equal(material.customProgramCacheKey, key);
      assert.equal(material.map, map);
      assert.equal(material.normalMap, normalMap);
    } finally {
      Object.assign(material, candidate);
    }
    assert.deepEqual(params(material), candidate);
  }
});

test('ordinary opaque/mirror bodies and authored canopy optics stay on their owners', () => {
  for (const kind of ['stone', 'metal']) {
    const material = opticCellBodyMaterial(kind);
    assert.equal(material.userData.spacefaceTransmissionBudget, undefined);
    assert.equal(material.transparent, false);
    assert.equal(material.opacity, 1);
  }
  const common = asteroidLeafResources('ast_common_rock', 0).material;
  assert.equal(common.userData.spacefaceTransmissionBudget, undefined);
  const authored = makeCanopyMaterial(new THREE.MeshPhysicalMaterial({ transmission: 0.63, opacity: 0.59, ior: 1.42 }));
  assert.equal(authored.transmission, 0.63);
  assert.equal(authored.opacity, 0.59);
  assert.equal(authored.ior, 1.42);
  assert.equal(authored.userData.spacefaceTransmissionBudget, undefined);
});
