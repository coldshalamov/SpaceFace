import assert from 'node:assert/strict';
import test from 'node:test';

import { MATERIAL_ABI_ROLE } from '../src/render/materialAbi.js';
import { materialBatchFingerprint, materialBatchProgramKey } from '../src/render/materialBatchKey.js';
import {
  SHARED_MATERIAL_ROLE,
  sharedMaterialAbiRole,
  stampSharedMaterialRole,
} from '../src/render/sharedMaterialRoles.js';

function fakeStandard(hex, mapId) {
  return {
    type: 'MeshStandardMaterial',
    isMeshStandardMaterial: true,
    color: { getHexString: () => hex },
    emissive: { getHexString: () => '000000' },
    roughness: 0.66,
    metalness: 0.16,
    opacity: 1,
    transparent: false,
    side: 0,
    blending: 0,
    depthWrite: true,
    map: mapId ? { userData: { src: mapId } } : null,
    userData: {},
  };
}

test('shared roles collapse onto the handful of ABI families', () => {
  assert.equal(sharedMaterialAbiRole(SHARED_MATERIAL_ROLE.HULL), MATERIAL_ABI_ROLE.OPAQUE_HULL);
  assert.equal(sharedMaterialAbiRole(SHARED_MATERIAL_ROLE.CANOPY), MATERIAL_ABI_ROLE.GLASS);
  assert.equal(sharedMaterialAbiRole(SHARED_MATERIAL_ROLE.GLASS), MATERIAL_ABI_ROLE.GLASS);
  assert.equal(sharedMaterialAbiRole(SHARED_MATERIAL_ROLE.PLUME), MATERIAL_ABI_ROLE.EMISSIVE_DRIVE);
  assert.equal(sharedMaterialAbiRole(SHARED_MATERIAL_ROLE.STATION), MATERIAL_ABI_ROLE.OPAQUE_HULL);
  assert.equal(sharedMaterialAbiRole(SHARED_MATERIAL_ROLE.ROCK), MATERIAL_ABI_ROLE.TERRAIN_PLACE);
});

test('two hull tints share a program family; texture bind stays per-hull', () => {
  const red = stampSharedMaterialRole(fakeStandard('ff3333', 'hull-red'), SHARED_MATERIAL_ROLE.HULL);
  const blue = stampSharedMaterialRole(fakeStandard('3366ff', 'hull-blue'), SHARED_MATERIAL_ROLE.HULL);
  assert.equal(red.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
  assert.equal(red.userData.spacefaceMaterialAbi, MATERIAL_ABI_ROLE.OPAQUE_HULL);
  assert.equal(red.userData.spacefaceProgramFamily, blue.userData.spacefaceProgramFamily);
  assert.notEqual(materialBatchFingerprint(red), materialBatchFingerprint(blue));
  assert.notEqual(materialBatchProgramKey(red), materialBatchProgramKey(blue));
});

test('stamping a role does not write a batch-collapse key', () => {
  const hull = stampSharedMaterialRole(fakeStandard('cccccc', 'hull-a'), SHARED_MATERIAL_ROLE.HULL);
  assert.equal(hull.userData.spacefaceBatchKey, undefined);
  assert.equal(hull.userData.spacefaceSharedRole, undefined);
});
