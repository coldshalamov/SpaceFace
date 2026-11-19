// ROCK-04 — every rock substance shared ONE material in the live scene, so all rocks drew
// whichever triplanar family was admitted first.
//
// `installTriplanarRock` whitewashes `material.color` to 1,1,1 because the generated set supplies
// the albedo. partsLibrary's shared-material pool keys on `materialShareSignature`, which read
// that (now identical) colour — so `place_rock_junk_monolith`'s stone and
// `place_rock_crystal_monolith`'s stone collapsed onto one cached material. In Swarm round 10 a
// scrap monolith was measured wearing `spacefaceTriplanarRock: "crystal"`, i.e. ROCK-03's raised
// limb had never reached the dark rocks at all.
//
// This test installs two different families on geometry that is otherwise identical and fails if
// the shared pool hands them the same material.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { installTriplanarRock } from '../src/render/rockTriplanar.js';
import { sharedMaterialForProbe, resetSharedMaterialsForProbe } from '../src/render/partsLibrary.js';

function stoneMaterial(name) {
  return new THREE.MeshStandardMaterial({ name, color: new THREE.Color(0x11201a), roughness: 0.92, metalness: 0 });
}

test('two rock substances never share one triplanar material', () => {
  resetSharedMaterialsForProbe();
  const junk = stoneMaterial('Material_Stone');
  const crystal = stoneMaterial('Material_Stone');
  assert.equal(installTriplanarRock(junk, 'junk'), true);
  assert.equal(installTriplanarRock(crystal, 'crystal'), true);
  // The trap: both now read white, because the generated albedo replaces the authored colour.
  assert.equal(junk.color.getHex(), crystal.color.getHex());

  const palette = { hull: '#C8D8F0', accent: '#A0C4FF', thruster: '#88AAFF', dark: '#1A3A8F' };
  const sharedJunk = sharedMaterialForProbe(junk, { tint: 'none' }, palette);
  const sharedCrystal = sharedMaterialForProbe(crystal, { tint: 'none' }, palette);
  assert.notEqual(sharedJunk, sharedCrystal, 'each substance keeps its own material');
  assert.equal(sharedJunk.userData.spacefaceTriplanarRock, 'junk');
  assert.equal(sharedCrystal.userData.spacefaceTriplanarRock, 'crystal');
});

test('the same substance still collapses to one shared material', () => {
  resetSharedMaterialsForProbe();
  const a = stoneMaterial('Material_Stone');
  const b = stoneMaterial('Material_Stone_deep');
  installTriplanarRock(a, 'junk');
  installTriplanarRock(b, 'junk');
  const palette = { hull: '#C8D8F0', accent: '#A0C4FF', thruster: '#88AAFF', dark: '#1A3A8F' };
  const sharedA = sharedMaterialForProbe(a, { tint: 'none' }, palette);
  const sharedB = sharedMaterialForProbe(b, { tint: 'none' }, palette);
  assert.equal(sharedA, sharedB, 'Stone and Stone_deep of one family one draw is the point of the pool');
});
