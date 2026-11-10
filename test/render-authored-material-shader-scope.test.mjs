import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  installRoughnessBreakup,
  ROUGHNESS_BREAKUP_KEY,
} from '../src/render/authoredMaterialProfiles.js';
import { cloneMaterialPreservingShaderHooks } from '../src/render/partsLibrary.js';

function resolveIncludes(source) {
  const includePattern = /^[ \t]*#include +<([\w\d./]+)>/gm;
  return source.replace(includePattern, (_match, include) => {
    const chunk = THREE.ShaderChunk[include];
    if (chunk === undefined) {
      throw new Error(`Can not resolve #include <${include}>`);
    }
    return resolveIncludes(chunk);
  });
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return count;
    count += 1;
    from = idx + needle.length;
  }
}

function compileRoughnessBreakup(material) {
  const lib = material.isMeshPhysicalMaterial ? THREE.ShaderLib.physical : THREE.ShaderLib.standard;
  const shader = {
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
    uniforms: {},
  };
  material.onBeforeCompile(shader, {});
  return resolveIncludes(shader.fragmentShader);
}

function assertShaderScope(material, resolved) {
  const mainIdx = resolved.indexOf('void main()');
  const defNeedle = 'float sfBreakNoise';
  const defIdx = resolved.indexOf(defNeedle);
  const callNeedle = 'sfBreakNoise( vMapUv';
  const callIdx = resolved.indexOf(callNeedle);
  const perturbNeedle = 'roughnessFactor = clamp(';
  const perturbIdx = resolved.indexOf(perturbNeedle);
  const consumeNeedle = 'material.roughness = max( roughnessFactor';
  const consumeIdx = resolved.indexOf(consumeNeedle);
  const injectedGuard = resolved.match(/#ifdef (USE_MAP|USE_UV)\s+float sfBreak = sfBreakNoise\( vMapUv/);

  assert.notEqual(mainIdx, -1, 'resolved physical fragment must contain void main()');
  assert.equal(countOccurrences(resolved, defNeedle), 1);
  assert.notEqual(defIdx, -1);
  assert.ok(defIdx < mainIdx, 'sfBreakNoise must be defined at file scope, before main()');
  assert.equal(resolved.indexOf(defNeedle, mainIdx), -1);
  assert.ok(resolved.slice(0, mainIdx).includes(defNeedle));
  assert.notEqual(callIdx, -1, 'call site sfBreakNoise( vMapUv must be present');
  assert.ok(callIdx > mainIdx, 'call site must land inside main()');
  assert.notEqual(perturbIdx, -1, 'roughnessFactor perturbation must be present');
  assert.notEqual(consumeIdx, -1, 'lighting model must consume roughnessFactor');
  assert.ok(perturbIdx < consumeIdx, 'perturbation must reach the lighting model');
  assert.ok(injectedGuard, 'vMapUv reference must sit under an explicit preprocessor guard');
  assert.equal(injectedGuard[1], 'USE_MAP');
  assert.ok(material.customProgramCacheKey().includes(ROUGHNESS_BREAKUP_KEY));
}

test('roughness breakup defines noise at file scope and perturbs roughness before lighting', () => {
  assert.equal(ROUGHNESS_BREAKUP_KEY, 'spaceface-surface-breakup-v4-file-scope');

  for (const Material of [THREE.MeshStandardMaterial, THREE.MeshPhysicalMaterial]) {
    const material = new Material();
    assert.equal(installRoughnessBreakup(material), true);
    const resolved = compileRoughnessBreakup(material);
    assertShaderScope(material, resolved);
  }
});

test('Material.clone drops the roughness-breakup hook and installRoughnessBreakup restores it', () => {
  const material = new THREE.MeshStandardMaterial();
  assert.equal(installRoughnessBreakup(material), true);
  assert.equal(material.onBeforeCompile.name, 'roughnessBreakupShader');

  const clone = material.clone();
  assert.equal(clone.userData.spacefaceRoughnessBreakup, true);
  assert.equal(Object.hasOwn(clone, 'onBeforeCompile'), false);
  assert.notEqual(clone.onBeforeCompile.name, 'roughnessBreakupShader');

  assert.equal(installRoughnessBreakup(clone), true);
  const resolved = compileRoughnessBreakup(clone);
  assertShaderScope(clone, resolved);
});

test('installRoughnessBreakup does not double-inject when called twice', () => {
  const material = new THREE.MeshStandardMaterial();
  assert.equal(installRoughnessBreakup(material), true);
  assert.equal(installRoughnessBreakup(material), true);
  const resolved = compileRoughnessBreakup(material);
  assert.equal(countOccurrences(resolved, 'float sfBreakNoise'), 1);
  assertShaderScope(material, resolved);
});

test('installRoughnessBreakup still guards after minification erases the hook name', () => {
  const material = new THREE.MeshStandardMaterial();
  assert.equal(installRoughnessBreakup(material), true);

  const anonymised = Object.defineProperty(material.onBeforeCompile, 'name', { value: '' });
  assert.equal(anonymised.name, '');
  assert.equal(material.onBeforeCompile.name, '');

  assert.equal(installRoughnessBreakup(material), true);
  const resolved = compileRoughnessBreakup(material);
  assert.equal(countOccurrences(resolved, 'float sfBreakNoise'), 1);
  assertShaderScope(material, resolved);
});

test('cloneMaterialPreservingShaderHooks keeps the roughness-breakup hook that Material.clone drops', () => {
  const base = new THREE.MeshPhysicalMaterial();
  assert.equal(installRoughnessBreakup(base), true);
  const hook = base.onBeforeCompile;
  assert.equal(typeof hook, 'function');

  const plainClone = base.clone();
  assert.equal(Object.hasOwn(plainClone, 'onBeforeCompile'), false);
  assert.notEqual(plainClone.onBeforeCompile, hook);
  assert.equal(plainClone.customProgramCacheKey().includes(ROUGHNESS_BREAKUP_KEY), false);

  const preserved = cloneMaterialPreservingShaderHooks(base);
  assert.equal(preserved.onBeforeCompile, hook);
  assert.ok(preserved.customProgramCacheKey().includes(ROUGHNESS_BREAKUP_KEY));

  const shader = {
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    uniforms: {},
  };
  preserved.onBeforeCompile(shader, {});
  const resolved = resolveIncludes(shader.fragmentShader);
  const defNeedle = 'float sfBreakNoise';
  const mainIdx = resolved.indexOf('void main()');
  const defIdx = resolved.indexOf(defNeedle);
  assert.equal(countOccurrences(resolved, defNeedle), 1);
  assert.ok(defIdx !== -1 && defIdx < mainIdx, 'sfBreakNoise must be defined at file scope, before main()');

  const bare = new THREE.MeshStandardMaterial();
  assert.equal(Object.hasOwn(bare, 'onBeforeCompile'), false);
  const bareClone = cloneMaterialPreservingShaderHooks(bare);
  assert.equal(Object.hasOwn(bareClone, 'onBeforeCompile'), false);
});

test('roughness breakup throws when required fragment includes are missing', () => {
  const missingCommon = new THREE.MeshStandardMaterial();
  installRoughnessBreakup(missingCommon);
  assert.throws(() => {
    missingCommon.onBeforeCompile({
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader.replace('#include <common>', '// missing common'),
      uniforms: {},
    }, {});
  }, /missing common/);

  const missingLights = new THREE.MeshPhysicalMaterial();
  installRoughnessBreakup(missingLights);
  assert.throws(() => {
    missingLights.onBeforeCompile({
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        '// missing lights_physical_fragment',
      ),
      uniforms: {},
    }, {});
  }, /missing lights_physical_fragment/);
});
