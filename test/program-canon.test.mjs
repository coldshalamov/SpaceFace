import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  canonicalizeAuthoredProgramState,
  PROGRAM_CANON_VERSION,
} from '../src/render/programCanon.js';
import { materialAbiShaderFeatures } from '../src/render/materialAbi.js';

function authoredMaps() {
  return {
    map: new THREE.Texture(),
    normalMap: new THREE.Texture(),
    roughnessMap: new THREE.Texture(),
    metalnessMap: new THREE.Texture(),
    aoMap: new THREE.Texture(),
    emissiveMap: new THREE.Texture(),
  };
}

function meshWith(material) {
  return new THREE.Mesh(new THREE.BufferGeometry(), material);
}

test('sparse and fully textured PBR materials collapse onto one program feature set', () => {
  const full = new THREE.MeshStandardMaterial();
  Object.assign(full, authoredMaps());
  full.dithering = true;
  // Same material minus map + normalMap, dithering off — the mid-flight link shape this
  // canon exists to collapse.
  const sparse = new THREE.MeshStandardMaterial();
  sparse.roughnessMap = new THREE.Texture();
  sparse.metalnessMap = new THREE.Texture();
  sparse.aoMap = new THREE.Texture();
  sparse.emissiveMap = new THREE.Texture();
  sparse.dithering = false;

  const root = new THREE.Group();
  root.add(meshWith(full), new THREE.InstancedMesh(new THREE.BufferGeometry(), sparse, 2));

  const report = canonicalizeAuthoredProgramState(root);
  assert.equal(report.materials, 2);
  assert.equal(report.changed, 1);
  assert.equal(report.dithered, 1);
  assert.equal(report.filled.map, 1);
  assert.equal(report.filled.normalMap, 1);

  assert.equal(materialAbiShaderFeatures(sparse), materialAbiShaderFeatures(full));
  assert.equal(sparse.dithering, true);
  assert.equal(sparse.userData.spacefaceProgramCanon, PROGRAM_CANON_VERSION);
});

test('a second pass changes nothing', () => {
  const material = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  root.add(meshWith(material));

  canonicalizeAuthoredProgramState(root);
  const version = material.version;
  const report = canonicalizeAuthoredProgramState(root);
  assert.equal(material.version, version);
  assert.equal(report.changed, 0);
  assert.equal(report.dithered, 0);
  assert.deepEqual(report.filled, { map: 0, normalMap: 0, roughnessMap: 0, metalnessMap: 0, aoMap: 0, emissiveMap: 0 });
});

test('a bump-mapped material keeps normalMap empty', () => {
  const material = new THREE.MeshStandardMaterial({ bumpMap: new THREE.Texture() });
  const root = new THREE.Group();
  root.add(meshWith(material));

  canonicalizeAuthoredProgramState(root);
  assert.equal(material.normalMap, null);
  assert.ok(material.bumpMap, 'the authored bump map survives');
  assert.ok(material.map, 'other empty slots still fill');
});

test('the roughness-breakup patch keeps its authored map slot', () => {
  // installRoughnessBreakup injects #ifdef USE_MAP noise over vMapUv — filling map on a carrier
  // would switch that perturbation on, so the canon leaves that one slot alone.
  const material = new THREE.MeshStandardMaterial();
  material.userData.spacefaceRoughnessBreakup = true;
  const root = new THREE.Group();
  root.add(meshWith(material));

  const report = canonicalizeAuthoredProgramState(root);
  assert.equal(material.map, null);
  assert.equal(report.filled.map, 0);
  assert.ok(material.roughnessMap && material.metalnessMap && material.normalMap);
  assert.equal(material.userData.spacefaceProgramCanon, PROGRAM_CANON_VERSION);
});

test('non-PBR materials, the exempt flag, and the kill switch are respected', () => {
  const basic = new THREE.MeshBasicMaterial();
  const exempt = new THREE.MeshStandardMaterial();
  exempt.userData.spacefaceProgramCanonExempt = true;
  const root = new THREE.Group();
  root.add(meshWith(basic), meshWith(exempt));

  const report = canonicalizeAuthoredProgramState(root);
  assert.equal(report.materials, 0);
  assert.equal(report.exempt, 1);
  assert.equal(basic.map, null);
  assert.equal(basic.dithering, false);
  assert.equal(basic.userData.spacefaceProgramCanon, undefined);
  assert.equal(exempt.map, null);
  assert.equal(exempt.dithering, false);
  assert.equal(exempt.userData.spacefaceProgramCanon, undefined);

  globalThis.__SF_PROGRAM_CANON_OFF__ = true;
  try {
    const material = new THREE.MeshStandardMaterial();
    const disabled = canonicalizeAuthoredProgramState(meshWith(material));
    assert.deepEqual(disabled, { skipped: 'disabled' });
    assert.equal(material.map, null);
    assert.equal(material.userData.spacefaceProgramCanon, undefined);
  } finally {
    delete globalThis.__SF_PROGRAM_CANON_OFF__;
  }
});

test('neutral stand-ins are shared singletons with exact texel data', () => {
  const first = new THREE.MeshStandardMaterial();
  const second = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  root.add(meshWith(first), meshWith(second));

  canonicalizeAuthoredProgramState(root);

  assert.equal(first.map, second.map);
  assert.equal(first.roughnessMap, second.roughnessMap);
  assert.equal(first.metalnessMap, second.metalnessMap);
  assert.equal(first.aoMap, second.aoMap);
  assert.equal(first.emissiveMap, second.emissiveMap);
  assert.equal(first.normalMap, second.normalMap);
  assert.notEqual(first.map, first.roughnessMap, 'sRGB and linear whites are distinct textures');

  assert.deepEqual([...first.map.image.data], [255, 255, 255, 255]);
  assert.deepEqual([...first.roughnessMap.image.data], [255, 255, 255, 255]);
  assert.deepEqual([...first.normalMap.image.data], [0.5, 0.5, 1, 1]);
  assert.equal(first.normalMap.image.data instanceof Float32Array, true);

  // Boundary/residency disposal must not free a stand-in other materials still sample.
  const white = first.map;
  white.dispose();
  assert.deepEqual([...white.image.data], [255, 255, 255, 255]);
  assert.equal(white.userData.spacefaceSharedAsset, true);
  assert.equal(second.map, white);
});
