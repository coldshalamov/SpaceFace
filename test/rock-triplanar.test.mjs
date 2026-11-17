import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as THREE from 'three';

import {
  ROCK_TRIPLANAR_FAMILIES,
  ROCK_TRIPLANAR_TOKEN,
  installTriplanarRock,
  preloadRockTriplanarLibrary,
  rockTriplanarFamilyForAsset,
  rockTriplanarReady,
  setRockTriplanarEnabled,
} from '../src/render/rockTriplanar.js';
import { canonicalizeObjectSurfaceProgramKeys } from '../src/render/illustratedSurface.js';

test('every authored place_rock substance resolves to a family, anything else to null', () => {
  for (const [id, family] of [
    ['place_rock_silicate_boulder', 'silicate'], ['place_rock_slag_monolith', 'slag'],
    ['place_rock_metallic_ore_pebble', 'metal'], ['place_rock_reef_metal_boulder', 'metal'],
    ['place_rock_crystal_monolith', 'crystal'], ['place_rock_ice_pebble', 'ice'],
    ['place_rock_cooked_rock_boulder', 'cooked'],
  ]) assert.equal(rockTriplanarFamilyForAsset(id), family, id);
  assert.equal(rockTriplanarFamilyForAsset('SF_PLACE_ROCK_SILICATE_BOULDER'), 'silicate', 'the id the package metadata carries');
  assert.equal(rockTriplanarFamilyForAsset('place_asteroid_rock_a'), null);
  assert.equal(rockTriplanarFamilyForAsset('place_rock_unknown_boulder'), null);
});

test('every set the families name ships in the release tree', () => {
  for (const family of Object.values(ROCK_TRIPLANAR_FAMILIES)) {
    if (!family.files) continue;
    for (const url of Object.values(family.files)) {
      assert.ok(existsSync(fileURLToPath(new URL(`..${url}`, import.meta.url))), url);
    }
  }
});

test('install is idempotent, keeps one program key family and survives key canonicalisation', () => {
  const material = new THREE.MeshStandardMaterial({ name: 'Material_Stone', color: 0x1c1710 });
  assert.equal(installTriplanarRock(material, 'silicate'), true);
  assert.equal(installTriplanarRock(material, 'silicate'), true);
  assert.equal(material.userData.spacefaceTriplanarRock, 'silicate');
  assert.equal(material.color.getHex(), 0xffffff, 'the albedo comes from the set, not the flat colour');
  assert.ok(material.customProgramCacheKey().includes(ROCK_TRIPLANAR_TOKEN));
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  canonicalizeObjectSurfaceProgramKeys(mesh);
  assert.ok(material.customProgramCacheKey().includes(ROCK_TRIPLANAR_TOKEN));
  assert.equal(installTriplanarRock(new THREE.MeshStandardMaterial(), 'nope'), false);
});

test('the shader is injected once per stage and every family shares one program', () => {
  const a = new THREE.MeshStandardMaterial({ name: 'Material_Stone' });
  const b = new THREE.MeshStandardMaterial({ name: 'Material_Stone_deep' });
  installTriplanarRock(a, 'silicate'); installTriplanarRock(b, 'ice');
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>',
  };
  a.onBeforeCompile(shader, null);
  for (const key of ['sfTpAlbedo', 'sfTpNormal', 'sfTpOn', 'sfTpTile', 'sfTpTint']) assert.ok(key in shader.uniforms, key);
  assert.match(shader.vertexShader, /vTpPos = position/);
  assert.match(shader.fragmentShader, /whiteout|abs\(sfTpNx\.z\)/i);
  assert.match(shader.fragmentShader, /normal = normalize\(normalMatrix \* sfTpNormalOut\)/);
});

test('the library publishes only when every set decoded, and a failure leaves the rocks on their authored look', async () => {
  const failing = await preloadRockTriplanarLibrary(null, { loadTexture: async () => { throw new Error('boom'); } });
  assert.equal(failing, false);
  assert.equal(rockTriplanarReady(), false);
  const loaded = await preloadRockTriplanarLibrary(null, { loadTexture: async () => new THREE.Texture() });
  assert.equal(loaded, true);
  assert.equal(rockTriplanarReady(), true);
  setRockTriplanarEnabled(false);
  setRockTriplanarEnabled(true);
});
