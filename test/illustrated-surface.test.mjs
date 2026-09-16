import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  canonicalizeObjectSurfaceProgramKeys,
  installIllustratedSurface,
  ILLUSTRATED_SURFACE_KEY,
} from '../src/render/illustratedSurface.js';
import { applyAuthoredMaterialProfile } from '../src/render/authoredMaterialProfiles.js';

test('a late-attached packed-ORM clone still collapses after a second canonicalize', () => {
  const hull = new THREE.MeshStandardMaterial({ color: 0x334455 });
  hull.customProgramCacheKey = () => `MeshStandardMaterial|spaceface-packed-orm-single-sample-v1|${hull.uuid}`;
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), hull));
  canonicalizeObjectSurfaceProgramKeys(root);
  const extra = new THREE.MeshStandardMaterial({ color: 0xaa7744 });
  extra.customProgramCacheKey = () => `MeshStandardMaterial|spaceface-packed-orm-single-sample-v1|${extra.uuid}`;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), extra));
  assert.notEqual(extra.customProgramCacheKey(), hull.customProgramCacheKey());
  canonicalizeObjectSurfaceProgramKeys(root);
  assert.equal(extra.customProgramCacheKey(), hull.customProgramCacheKey());
  assert.equal(extra.customProgramCacheKey(), 'spaceface-packed-orm-single-sample-v1');
});

test('compose leftover unique keys collapse on first presentation bind', () => {
  const a = new THREE.MeshStandardMaterial({ color: 0x334455 });
  const b = new THREE.MeshStandardMaterial({ color: 0xaa7744 });
  a.customProgramCacheKey = () => `MeshStandardMaterial|spaceface-packed-orm-single-sample-v1|${a.uuid}`;
  b.customProgramCacheKey = () => `MeshStandardMaterial|spaceface-packed-orm-single-sample-v1|${b.uuid}`;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), a));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), b));
  assert.ok(canonicalizeObjectSurfaceProgramKeys(group) >= 2);
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
  assert.equal(a.customProgramCacheKey(), 'spaceface-packed-orm-single-sample-v1');
  assert.equal(a.customProgramCacheKey().includes(a.uuid), false);
});

test('packed-ORM compose that concatenated onBeforeCompile source still collapses', () => {
  const hull = new THREE.MeshStandardMaterial({ color: 0x334455 });
  hull.userData = { spacefacePackedOrmSingleSample: true };
  hull.onBeforeCompile = function packedOrmSingleSampleShader(shader) {
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '// packed | orm');
  };
  hull.customProgramCacheKey = () => `${hull.onBeforeCompile.toString()}|spaceface-packed-orm-single-sample-v1|${hull.uuid}`;
  const extra = new THREE.MeshStandardMaterial({ color: 0xaa7744 });
  extra.userData = { spacefacePackedOrmSingleSample: true };
  extra.onBeforeCompile = hull.onBeforeCompile;
  extra.customProgramCacheKey = () => `${extra.onBeforeCompile.toString()}|spaceface-packed-orm-single-sample-v1|${extra.uuid}`;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), hull));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), extra));
  assert.ok(canonicalizeObjectSurfaceProgramKeys(group) >= 2);
  assert.equal(hull.customProgramCacheKey(), extra.customProgramCacheKey());
  assert.equal(hull.customProgramCacheKey(), 'spaceface-packed-orm-single-sample-v1');
});

test('unpatched standard materials replace Three default compile-source keys', () => {
  const a = new THREE.MeshStandardMaterial({ color: 0x334455 });
  const b = new THREE.MeshStandardMaterial({ color: 0xaa7744 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), a));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), b));
  assert.ok(canonicalizeObjectSurfaceProgramKeys(group) >= 2);
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
  assert.equal(a.customProgramCacheKey(), '');
  assert.notEqual(a.customProgramCacheKey(), a.onBeforeCompile.toString());
});

test('shader materials keep leftover uniqueness through object canonicalize', () => {
  const shader = new THREE.ShaderMaterial();
  shader.customProgramCacheKey = () => `fx:${shader.uuid}`;
  assert.equal(canonicalizeObjectSurfaceProgramKeys(shader), 0);
  assert.equal(shader.customProgramCacheKey(), `fx:${shader.uuid}`);
});

test('two hulls with unique leftover cache keys share one illustrated program family', () => {
  const a = new THREE.MeshStandardMaterial({ color: 0x334455 });
  const b = new THREE.MeshStandardMaterial({ color: 0xaa7744 });
  a.customProgramCacheKey = () => `MeshStandardMaterial|packed-orm|${a.uuid}`;
  b.customProgramCacheKey = () => `MeshStandardMaterial|packed-orm|${b.uuid}`;
  assert.equal(installIllustratedSurface(a), true);
  assert.equal(installIllustratedSurface(b), true);
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
  assert.match(a.customProgramCacheKey(), /packed-orm/);
  assert.ok(a.customProgramCacheKey().includes(ILLUSTRATED_SURFACE_KEY));
  assert.equal(a.customProgramCacheKey().includes(a.uuid), false);
});

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
