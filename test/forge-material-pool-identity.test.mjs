import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { FACTION_PALETTES } from '../src/data/palettes.js';
import { instancePoolIdentity } from '../src/render/materialBatchKey.js';
import { sharedMaterialForProbe } from '../src/render/partsLibrary.js';

function palette(faction) {
  const row = FACTION_PALETTES[faction];
  return { hull: row.hull, accent: row.accent, dark: row.secondary, thruster: row.thruster };
}

function surface(role, finish = 'forge-v1') {
  const map = new THREE.DataTexture(new Uint8Array([120, 130, 140, 255]), 1, 1);
  const base = new THREE.MeshStandardMaterial({
    color: 0x75818a, map, roughness: 0.64, metalness: 0.36,
  });
  base.name = `material-pool-test-${role}`;
  base.userData = { spacefaceFinish: finish, spacefaceMaterialRole: role };
  return base;
}

test('unpainted Forge mechanical and accent surfaces share across faction palettes', () => {
  const free = palette('faction_free');
  const reach = palette('faction_reach');
  assert.notEqual(free.accent, reach.accent);
  assert.notEqual(free.dark, reach.dark);
  for (const role of ['mechanical', 'accent']) {
    const base = surface(role);
    const first = sharedMaterialForProbe(base, {}, free);
    const second = sharedMaterialForProbe(base, {}, reach);
    const geometry = new THREE.BoxGeometry();
    assert.equal(first, second, `${role}: faction tint does not split an unchanged Forge material`);
    assert.equal(instancePoolIdentity(geometry, first), instancePoolIdentity(geometry, second));
    assert.equal(first.color.getHex(), base.color.getHex());
    assert.equal(first.map, base.map);
    assert.equal(first.roughness, base.roughness);
  }
});

test('paint, non-Forge tint, decals, lamp channels, and authored surfaces remain separate', () => {
  const free = palette('faction_free');
  const reach = palette('faction_reach');
  const forgeAccent = surface('accent');
  const explicitFree = { ...free, appearanceAccentOverride: true };
  const explicitReach = { ...reach, appearanceAccentOverride: true };
  const paintedA = sharedMaterialForProbe(forgeAccent, {}, explicitFree);
  const paintedB = sharedMaterialForProbe(forgeAccent, {}, explicitReach);
  assert.notEqual(paintedA, paintedB, 'explicit paint retains separate materials');
  assert.notEqual(paintedA.color.getHex(), paintedB.color.getHex());

  const nonForge = surface('mechanical', 'non-forge');
  const nonForgeA = sharedMaterialForProbe(nonForge, {}, free);
  const nonForgeB = sharedMaterialForProbe(nonForge, {}, reach);
  assert.notEqual(nonForgeA, nonForgeB, 'non-Forge faction tints remain distinct');
  assert.notEqual(nonForgeA.color.getHex(), nonForgeB.color.getHex());

  const plain = sharedMaterialForProbe(forgeAccent, {}, free);
  const otherDecal = sharedMaterialForProbe(forgeAccent, {}, { ...free, decalId: 'concord' });
  assert.notEqual(plain, otherDecal, 'decal choices cannot alias');
  const lamp = forgeAccent.clone();
  lamp.userData = { ...forgeAccent.userData, spacefaceLampChannel: 'beacon' };
  assert.notEqual(plain, sharedMaterialForProbe(lamp, {}, free), 'lamp channels cannot alias');
  const differentSurface = forgeAccent.clone();
  differentSurface.color.setHex(0x374451);
  assert.notEqual(plain, sharedMaterialForProbe(differentSurface, {}, free), 'authored colors remain distinct');
});
