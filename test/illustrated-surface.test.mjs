import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installIllustratedSurface, ILLUSTRATED_SURFACE_KEY } from '../src/render/illustratedSurface.js';
import { applyAuthoredMaterialProfile } from '../src/render/authoredMaterialProfiles.js';

test('illustration preserves authored inputs and chains the live physical shader once', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x665544, metalness: 0.3, roughness: 0.7 });
  const color = material.color.getHex();
  const map = new THREE.Texture();
  material.map = map;
  let calls = 0;
  material.onBeforeCompile = () => { calls++; };
  material.customProgramCacheKey = () => 'packed-orm';
  installIllustratedSurface(material);
  const key = material.customProgramCacheKey();
  installIllustratedSurface(material);
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  assert.equal(calls, 1);
  assert.equal(material.customProgramCacheKey(), key);
  assert.match(key, /packed-orm/);
  assert.ok(key.includes(ILLUSTRATED_SURFACE_KEY));
  assert.equal(material.color.getHex(), color);
  assert.equal(material.map, map);
  assert.equal(material.metalness, 0.3);
  assert.equal((shader.fragmentShader.match(/float sfPaintLuma/g) || []).length, 1);
  assert.ok(shader.fragmentShader.indexOf('float sfPaintLuma') < shader.fragmentShader.indexOf('#include <aomap_fragment>'));
});

test('reapplying authored profiles does not recursively wrap the shader', () => {
  const material = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 3; i++) applyAuthoredMaterialProfile(material, 'hull', { allowTextures: false });
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  assert.equal((shader.fragmentShader.match(/float sfPaintLuma/g) || []).length, 1);
  assert.equal((shader.fragmentShader.match(/float sfBreakNoise/g) || []).length, 1);
});

test('glass and shader effects retain their optical response', () => {
  for (const material of [new THREE.MeshPhysicalMaterial({ transmission: 0.8 }),
    new THREE.MeshStandardMaterial({ transparent: true }), new THREE.ShaderMaterial()]) {
    const hook = material.onBeforeCompile;
    assert.equal(installIllustratedSurface(material), false);
    assert.equal(material.onBeforeCompile, hook);
  }
});

test('packed ORM can own the AO include before the illustration hook is installed', () => {
  const material = new THREE.MeshStandardMaterial();
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', '// packed AO');
  };
  installIllustratedSurface(material);
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  assert.ok(shader.fragmentShader.indexOf('float sfPaintLuma') < shader.fragmentShader.indexOf('// packed AO'));
});
