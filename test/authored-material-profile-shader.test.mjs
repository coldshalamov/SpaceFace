import test from 'node:test';
import assert from 'node:assert/strict';

import { installRoughnessBreakup } from '../src/render/authoredMaterialProfiles.js';

function makeMaterial() {
  return {
    isMeshStandardMaterial: true,
    userData: {},
    customProgramCacheKey: () => 'base',
    needsUpdate: false,
  };
}

function compileCandidate() {
  const material = makeMaterial();
  assert.equal(installRoughnessBreakup(material), true);
  const shader = {
    fragmentShader: [
      '#include <common>',
      'void main() {',
      '  float roughnessFactor = 0.5;',
      '  #include <lights_physical_fragment>',
      '  material.roughness = max( roughnessFactor, 0.0525 );',
      '}',
    ].join('\n'),
  };
  material.onBeforeCompile(shader, {});
  return { material, shader };
}

test('authored roughness helper is declared at fragment top level, never inside main', () => {
  const { shader } = compileCandidate();
  const helperIndex = shader.fragmentShader.indexOf('float sfBreakNoise');
  const mainIndex = shader.fragmentShader.indexOf('void main()');
  const lightsIndex = shader.fragmentShader.indexOf('#include <lights_physical_fragment>');

  assert.ok(helperIndex > -1, 'roughness helper should be injected');
  assert.ok(helperIndex < mainIndex, 'GLSL helper declaration must precede fragment main');
  assert.ok(lightsIndex > mainIndex, 'roughness application seam stays inside main');
  assert.equal(shader.fragmentShader.slice(mainIndex, lightsIndex).includes('float sfBreakNoise'), false);
  assert.match(shader.fragmentShader, /roughnessFactor = clamp\(/);
});

test('shader cache key changes with the corrected top-level source contract', () => {
  const { material } = compileCandidate();
  assert.equal(material.customProgramCacheKey(), 'base|spaceface-surface-breakup-v4-top-level-helper');
});
