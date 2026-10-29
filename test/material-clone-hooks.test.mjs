import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { cloneMaterialPreservingShaderHooks } from '../src/render/materialClone.js';
import * as partsLibrary from '../src/render/partsLibrary.js';

// Material.clone()/copy() keeps userData but drops OWN-property onBeforeCompile and
// customProgramCacheKey — the exact loss that made a heat-skinned engine bell link a
// brand-new shader program inside a presented frame. Clones of materials that can
// carry authored shader patches must go through cloneMaterialPreservingShaderHooks.

test('cloneMaterialPreservingShaderHooks keeps both own-property hooks Material.clone drops', () => {
  const base = new THREE.MeshStandardMaterial();
  const hook = (shader) => { shader.fragmentShader += '\n// sf-hook'; };
  base.onBeforeCompile = hook;
  base.customProgramCacheKey = function customKey() { return 'spaceface-test-hook'; };

  const plain = base.clone();
  assert.equal(Object.hasOwn(plain, 'onBeforeCompile'), false);
  assert.notEqual(plain.customProgramCacheKey(), 'spaceface-test-hook');

  const preserved = cloneMaterialPreservingShaderHooks(base);
  assert.equal(preserved.onBeforeCompile, hook);
  assert.equal(preserved.customProgramCacheKey(), 'spaceface-test-hook');
  assert.equal(preserved.version, base.version + 1, 'clone is marked needsUpdate');
});

test('material clone preserves nested texture references without serializing or taking texture ownership', () => {
  const texture = new THREE.Texture();
  const originalToJSON = texture.toJSON;
  let textureSerializations = 0;
  texture.toJSON = function toJSON(...args) {
    textureSerializations += 1;
    return originalToJSON.apply(this, args);
  };

  const base = new THREE.MeshStandardMaterial({
    map: texture,
    normalMap: texture,
    roughnessMap: texture,
    emissiveMap: texture,
  });
  base.userData = {
    spacefaceHullStencils: {
      decalId: 'concord',
      texture,
      strength: 0.6,
      center: [1, 2, 3],
      size: [4, 5, 6],
    },
    authored: {
      surface: { finish: { name: 'forge-v1' } },
      label: 'forge-finish',
    },
  };
  let textureDisposed = 0;
  texture.addEventListener('dispose', () => { textureDisposed += 1; });

  const clone = cloneMaterialPreservingShaderHooks(base);

  assert.equal(textureSerializations, 0, 'the userData reference must not serialize the image');
  for (const slot of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) {
    assert.equal(clone[slot], texture, `Three Material.copy continues to share ${slot}`);
  }
  assert.equal(clone.userData.spacefaceHullStencils.texture, texture,
    'the authored stencil payload retains its shared canvas texture');
  assert.notEqual(clone.userData, base.userData, 'material userData remains isolated');
  assert.notEqual(clone.userData.spacefaceHullStencils, base.userData.spacefaceHullStencils,
    'the stencil payload remains isolated');
  assert.notEqual(clone.userData.spacefaceHullStencils.center, base.userData.spacefaceHullStencils.center);
  assert.notEqual(clone.userData.authored, base.userData.authored, 'nested plain metadata remains isolated');
  assert.notEqual(clone.userData.authored.surface, base.userData.authored.surface);
  clone.userData.authored.surface.finish.name = 'clone-only';
  clone.userData.spacefaceHullStencils.center[0] = 99;
  assert.equal(base.userData.authored.surface.finish.name, 'forge-v1');
  assert.equal(base.userData.spacefaceHullStencils.center[0], 1);

  clone.dispose();
  assert.equal(textureDisposed, 0, 'disposing a material clone does not dispose its shared texture');
  texture.toJSON = originalToJSON;
  base.dispose();
});

test('partsLibrary keeps re-exporting cloneMaterialPreservingShaderHooks for existing importers', () => {
  assert.equal(partsLibrary.cloneMaterialPreservingShaderHooks, cloneMaterialPreservingShaderHooks);
});

test('captureBellHeatSkin clones bell materials through the hook-preserving helper', () => {
  const source = readFileSync(new URL('../src/render/shipMicroMotion.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /import \{ cloneMaterialPreservingShaderHooks \} from '\.\/materialClone\.js';/,
    'shipMicroMotion imports the helper',
  );
  const start = source.indexOf('function captureBellHeatSkin(');
  assert.ok(start >= 0, 'captureBellHeatSkin exists');
  const end = source.indexOf('\n  function ', start + 1);
  const body = source.slice(start, end === -1 ? undefined : end);
  assert.match(body, /cloneMaterialPreservingShaderHooks\(mat\)/,
    'the heat-skin clone keeps the authored shader patch and its program cache key');
  assert.doesNotMatch(body, /\bmat\.clone\(\)/,
    'a bare Material.clone() would drop onBeforeCompile and customProgramCacheKey');
});
