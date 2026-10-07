// Look unify: every admitted material lands inside its role band (design/program/lab/LOOK_UNIFY.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyAuthoredMaterialProfile } from '../src/render/authoredMaterialProfiles.js';
import { MATERIAL_ROLE_BANDS, substanceRoleOverride } from '../src/data/materialRoleBands.js';

const forge = (name, role, r, m) => {
  const mat = new THREE.MeshStandardMaterial({ name, roughness: r, metalness: m });
  mat.userData = { spacefaceFinish: 'forge-v1', spacefaceMaterialRole: role };
  return mat;
};

test('forge bare metal no longer reads as chrome', () => {
  const mat = forge('Material_BrushedMetal', 'mechanical', 0.3, 0.95);
  applyAuthoredMaterialProfile(mat);
  const b = MATERIAL_ROLE_BANDS.mechanical;
  assert.ok(mat.roughness >= b.roughness[0] && mat.metalness <= b.metalness[1]);
  assert.ok(mat.envMapIntensity <= b.env[1]);
});

test('unknown exported roles alias into the vocabulary', () => {
  const mat = forge('Material_Conduit_Copper', 'copper_coil', 1, 1);
  delete mat.userData.spacefaceFinish;
  assert.equal(applyAuthoredMaterialProfile(mat, 'copper_coil'), true);
  assert.equal(mat.userData.spacefaceMaterialRole, 'mechanical');
});

test('names that state their substance beat a contradicting role', () => {
  assert.equal(substanceRoleOverride('esk_glass', 'hull'), 'glass');
  assert.equal(substanceRoleOverride('esk_paint_rust', 'mechanical'), 'hull');
  assert.equal(substanceRoleOverride('Material_Hull', 'hull'), null);
});

test('lamps keep their glow inside the signal band', () => {
  const mat = forge('Material_Emissive_Cyan', 'signal', 0.4, 0);
  mat.emissive.setHex(0x2a707c); mat.emissiveIntensity = 3;
  applyAuthoredMaterialProfile(mat);
  assert.ok(mat.emissiveIntensity >= 0.45 && mat.emissiveIntensity <= 6);
});

test('flat paint brighter than ivory is brought under the value ceiling; lamps stay lamps', () => {
  const mat = new THREE.MeshStandardMaterial({ name: 'esk_paint_civic_bone', roughness: 0.5, metalness: 0 });
  mat.color.setHex(0xffffff);
  applyAuthoredMaterialProfile(mat, 'hull');
  assert.ok(Math.max(...mat.color.clone().convertLinearToSRGB().toArray()) <= 0xbf / 255 + 1e-3);
  assert.equal(substanceRoleOverride('esk_light_cabin', 'hull'), 'signal');
});
