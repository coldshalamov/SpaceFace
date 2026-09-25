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
