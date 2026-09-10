import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { makeCanopyMaterial } from '../src/render/assetLoader.js';
import { SHARED_MATERIAL_ROLE } from '../src/render/sharedMaterialRoles.js';
import { QuarksVfxSystem } from '../src/render/vfx/quarksSystem.js';

test('quarks casings and rock spall join hull and rock families', () => {
  const quarks = new QuarksVfxSystem({ scene: new THREE.Scene() });
  assert.equal(
    quarks.casingEjection.material.userData.spacefaceSharedMaterialRole,
    SHARED_MATERIAL_ROLE.HULL,
  );
  assert.equal(
    quarks.collisionSpall.material.userData.spacefaceSharedMaterialRole,
    SHARED_MATERIAL_ROLE.ROCK,
  );
  assert.equal(quarks.casingEjection.material.userData.spacefaceBatchKey, undefined);
  assert.equal(quarks.collisionSpall.material.userData.spacefaceBatchKey, undefined);
  quarks.dispose();
});

test('authored canopy joins the canopy family without a batch key', () => {
  const source = new THREE.MeshStandardMaterial({
    color: 0x114466,
    roughness: 0.12,
    metalness: 0,
    transparent: true,
  });
  const canopy = makeCanopyMaterial(source);
  assert.equal(canopy.userData.spacefaceCanopy, true);
  assert.equal(canopy.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.CANOPY);
  assert.equal(canopy.userData.spacefaceBatchKey, undefined);
});
