import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { applyAuthoredMaterialProfile } from '../src/render/authoredMaterialProfiles.js';

async function releaseDocument(name) {
  const bytes = await readFile(new URL(`../assets/ships/release/parts/places/${name}.glb`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'the fixture is a GLB');
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
}

test('factor-only Forge stone in release assets stays flagged for surface remaster', async () => {
  for (const id of ['place_asteroid_rock_a', 'place_claim_mark']) {
    const document = await releaseDocument(id);
    const index = document.materials.findIndex(material => material.extras?.forgeFinish === 'stone');
    assert.ok(index >= 0, `${id} contains the real Forge stone input`);
    const source = document.materials[index];
    assert.ok(document.meshes.some(mesh => mesh.primitives.some(primitive =>
      primitive.material === index && primitive.attributes?.TEXCOORD_0 !== undefined)),
    `${id} uses the stone on UV-bearing geometry`);
    const pbr = source.pbrMetallicRoughness || {};
    assert.equal(pbr.baseColorTexture, undefined);
    assert.equal(pbr.metallicRoughnessTexture, undefined);
    assert.equal(source.normalTexture, undefined);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().fromArray(pbr.baseColorFactor || [1, 1, 1]),
      roughness: pbr.roughnessFactor ?? 1,
      metalness: pbr.metallicFactor ?? 1,
    });
    material.name = source.name;
    material.userData = { ...source.extras };
    assert.equal(applyAuthoredMaterialProfile(material, 'geology', { assetId: id }), true);
    assert.equal(material.userData.spacefacePbrCoverage.complete, false);
    assert.equal(material.userData.spacefacePbrRemasterRequired, true,
      `${id} factor-only solid is not a finished PBR surface`);
    assert.equal(material.map, null, 'the diagnostic does not silently alter the material');
  }
});

test('glass, emitters, and complete Forge surfaces do not gain a false remaster flag', () => {
  for (const role of ['glass', 'signal', 'drive']) {
    const material = new THREE.MeshStandardMaterial();
    material.userData = { spacefaceFinish: 'forge-v1', spacefaceMaterialRole: role };
    applyAuthoredMaterialProfile(material, role);
    assert.equal(material.userData.spacefacePbrCoverage.complete, false);
    assert.equal(material.userData.spacefacePbrRemasterRequired, false, `${role} may be factor-only`);
  }
  const complete = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(), normalMap: new THREE.Texture(),
    roughnessMap: new THREE.Texture(), metalnessMap: new THREE.Texture(),
  });
  complete.userData = { spacefaceFinish: 'forge-v1', spacefaceMaterialRole: 'hull' };
  applyAuthoredMaterialProfile(complete, 'hull');
  assert.equal(complete.userData.spacefacePbrCoverage.complete, true);
  assert.equal(complete.userData.spacefacePbrRemasterRequired, false);
});
