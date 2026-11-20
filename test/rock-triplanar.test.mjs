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
import * as rockSubstances from '../src/data/rockSubstances.js';

test('every authored place_rock substance resolves to a family, anything else to null', () => {
  for (const [id, family] of [
    ['place_rock_silicate_boulder', 'silicate'], ['place_rock_slag_monolith', 'slag'],
    ['place_rock_metallic_ore_pebble', 'metal'], ['place_rock_reef_metal_boulder', 'metal'],
    ['place_rock_crystal_monolith', 'crystal'], ['place_rock_ice_pebble', 'ice'],
    ['place_rock_cooked_rock_boulder', 'cooked'], ['place_rock_junk_monolith', 'junk'],
  ]) assert.equal(rockTriplanarFamilyForAsset(id), family, id);
  assert.equal(rockTriplanarFamilyForAsset('SF_PLACE_ROCK_SILICATE_BOULDER'), 'silicate', 'the id the package metadata carries');
  assert.equal(rockTriplanarFamilyForAsset('place_asteroid_rock_a'), null);
  assert.equal(rockTriplanarFamilyForAsset('place_rock_unknown_boulder'), null);
});

test('every family-built rock substance on screen wears a family that separates it from space', () => {
  // ROCK-04: `junk` had no family at all, so the scrap bodies kept their authored flat charcoal
  // (base 0.068/0.042/0.030) with no limb and read as holes in space in the round-10 crops.
  const { ROCK_PLACE_SUBSTANCES } = rockSubstances;
  for (const substance of ROCK_PLACE_SUBSTANCES) {
    const family = rockTriplanarFamilyForAsset(`place_rock_${substance}_monolith`);
    assert.ok(family, `${substance} resolves to a family`);
    const spec = ROCK_TRIPLANAR_FAMILIES[family];
    assert.ok(spec.rim && spec.rim.some((channel) => channel > 0),
      `${substance}: ${family} carries a limb so its silhouette reads against black space`);
    assert.ok(spec.floor > 0, `${substance}: ${family} keeps a pigment floor`);
  }
  // The dark families the packet names: a thin cool edge, and never grey — the blue channel
  // stays above red so the limb reads cool rather than as a chalky outline.
  for (const dark of ['junk', 'cooked', 'silicate', 'metal']) {
    const rim = ROCK_TRIPLANAR_FAMILIES[dark].rim;
    assert.ok(rim[2] > rim[0] * 1.4, `${dark}: the limb stays cool (${rim.join(',')})`);
    assert.ok(Math.max(...rim) < 0.36, `${dark}: the limb stays a thin edge, under the bloom knee`);
  }
  // Slag's hot veins remain the accent of the family that owns them.
  assert.ok(ROCK_TRIPLANAR_FAMILIES.slag.ember > 3, 'slag keeps its ember veins');
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

test('the same rock shader keeps its authored flat color until the maps upload and whenever they are off', async () => {
  const rocks = [['metal', 0x5a6470], ['junk', 0x1c1710]].map(([family, color]) => {
    const material = new THREE.MeshStandardMaterial({ color });
    const authored = material.color.clone();
    installTriplanarRock(material, family);
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader, null);
    assert.equal(material.color.getHex(), 0xffffff, 'the texture path still uses a neutral base');
    assert.match(shader.fragmentShader, /}\s*else\s*{\s*diffuseColor\.rgb \*= sfTpFlatColor;/);
    assert.ok(shader.uniforms.sfTpFlatColor.value.equals(authored));
    return { uniforms: shader.uniforms, material, version: material.version };
  });
  const assertMapSwitch = value => {
    for (const { uniforms, material, version } of rocks) {
      assert.equal(uniforms.sfTpOn.value, value);
      assert.equal(material.version, version, 'switching textures needs no material recompile');
    }
  };
  assertMapSwitch(0);
  assert.equal(rocks[0].material.customProgramCacheKey(), rocks[1].material.customProgramCacheKey());

  const warn = console.warn;
  console.warn = () => {};
  try {
    const decodeFailure = await preloadRockTriplanarLibrary(null, {
      loadTexture: async () => { throw new Error('decode failed'); },
    });
    assert.equal(decodeFailure, false);
    const uploadFailure = await preloadRockTriplanarLibrary({ initTexture() { throw new Error('upload failed'); } }, {
      loadTexture: async () => new THREE.Texture(),
    });
    assert.equal(uploadFailure, false);
    assert.equal(rockTriplanarReady(), false);
    assertMapSwitch(0);
  } finally { console.warn = warn; }

  const loaded = await preloadRockTriplanarLibrary(null, { loadTexture: async () => new THREE.Texture() });
  assert.equal(loaded, true);
  assert.equal(rockTriplanarReady(), true);
  assertMapSwitch(1);
  setRockTriplanarEnabled(false);
  assertMapSwitch(0);
  setRockTriplanarEnabled(true);
  assertMapSwitch(1);
});
