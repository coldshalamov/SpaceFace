import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { applyAuthoredMaterialProfile } from '../src/render/authoredMaterialProfiles.js';

function forgeLamp(name, finish, role, intensity) {
  const material = new THREE.MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: intensity });
  material.name = name;
  material.userData = { spacefaceFinish: 'forge-v1', forgeFinish: finish, spacefaceMaterialRole: role };
  return material;
}

test('opted-in decorative emission is reduced without changing functional Forge lamps', () => {
  const cases = [
    ['Material_Emissive_Trim_copper', 'glow_trim', 'signal', 3, 2.4],
    ['Material_Emissive_Cyan', 'glow_cyan', 'signal', 3, 6.6],
    ['Material_Emissive_NavRed', 'glow_red', 'signal', 3, 6.6],
    ['Material_Emissive_Amber_beacon', 'glow_amber', 'signal', 3, 6.6],
    ['Material_Thruster', 'glow_drive', 'drive', 6, 9],
  ];
  for (const [name, finish, role, before, after] of cases) {
    const material = forgeLamp(name, finish, role, before);
    applyAuthoredMaterialProfile(material, null, { slot: 'hull' });
    assert.ok(Math.abs(material.emissiveIntensity - after) < 1e-10, name);
    applyAuthoredMaterialProfile(material, null, { slot: 'hull' });
    assert.ok(Math.abs(material.emissiveIntensity - after) < 1e-10, `${name} reapplication`);
  }
});

test('Drifter and its palette variants opt in only the two livery rings', () => {
  const source = readFileSync('tools/blender/forge/ships/drifter.py', 'utf8');
  assert.equal((source.match(/F\.band\([^\n]+ 'glow_trim\.copper'/g) || []).length, 2);
  assert.doesNotMatch(source, /glow_cyan\.copper/);
  for (const variant of ['drifter_archive_censor', 'drifter_helix_courier']) {
    const file = readFileSync(`tools/blender/forge/ships/${variant}.py`, 'utf8');
    assert.match(file, /'glow_trim\.copper':\s*'#[0-9a-fA-F]{6}'/);
  }
});
