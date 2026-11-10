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

test('authored lamps and drives retain the Look gain across repeated admission', () => {
  for (const [role, finish, authored, expected] of [
    ['drive', 'glow_drive', 6, 9],
    ['signal', 'glow_cyan', 3, 6.6],
  ]) {
    const mat = forge('Material_Emissive_Cyan', role, 0.4, 0.05);
    mat.userData.forgeFinish = finish;
    mat.emissive.setHex(0x2a707c);
    mat.emissiveIntensity = authored;
    for (let admission = 0; admission < 3; admission++) {
      applyAuthoredMaterialProfile(mat);
      assert.ok(Math.abs(mat.emissiveIntensity - expected) < 1e-12,
        `${role} keeps its authored light multiplied by the Look gain once`);
      assert.equal(mat.roughness, 0.4);
      assert.equal(mat.metalness, 0.05);
    }
  }
});

test('an intentionally unpowered lamp stays dark while glass retains its emissive cap', () => {
  const lamp = forge('Material_Emissive_Cyan', 'signal', 0.4, 0);
  lamp.emissive.setHex(0x2a707c);
  lamp.emissiveIntensity = 0;
  applyAuthoredMaterialProfile(lamp);
  assert.equal(lamp.emissiveIntensity, 0, 'role admission must not switch authored power back on');

  const glass = forge('Material_Glass', 'glass', 0.1, 0);
  glass.emissive.setHex(0xd3eaff);
  glass.emissiveIntensity = 2.2;
  applyAuthoredMaterialProfile(glass);
  assert.equal(glass.emissiveIntensity, 0.25, 'a cockpit remains glass rather than a bright lamp');
});

test('flat paint brighter than ivory is brought under the value ceiling; lamps stay lamps', () => {
  const mat = new THREE.MeshStandardMaterial({ name: 'esk_paint_civic_bone', roughness: 0.5, metalness: 0 });
  mat.color.setHex(0xffffff);
  applyAuthoredMaterialProfile(mat, 'hull');
  assert.ok(Math.max(...mat.color.clone().convertLinearToSRGB().toArray()) <= 0xbf / 255 + 1e-3);
  assert.equal(substanceRoleOverride('esk_light_cabin', 'hull'), 'signal');
});
