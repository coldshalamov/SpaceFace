import assert from 'node:assert/strict';
import test from 'node:test';

import { ShaderChunk, ShaderLib } from '../vendor/three.module.js';

const DIRECT_PHYSICAL = 'void RE_Direct_Physical(';
const ZERO_RADIANCE_GUARD = 'if (all(equal(directLight.color, vec3(0.0)))) return;';

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} exists in the shipped shader chunk`);
  const open = source.indexOf('{', start);
  assert.ok(open > start, `${signature} has a body`);

  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${signature} has a balanced body`);
}

test('zero-radiance direct physical guard preserves the shipped PBR path', () => {
  const chunk = ShaderChunk.lights_physical_pars_fragment;
  assert.equal(typeof chunk, 'string', 'the physical shader chunk is exported');

  const directPhysical = extractFunction(chunk, DIRECT_PHYSICAL);
  const body = directPhysical.slice(directPhysical.indexOf('{') + 1, -1);
  const firstStatement = body.trimStart().split('\n', 1)[0];
  assert.equal(firstStatement, ZERO_RADIANCE_GUARD,
    'the exact-zero guard is the first direct-light statement');
  assert.equal(body.split(ZERO_RADIANCE_GUARD).length - 1, 1,
    'the guard is scoped to the direct physical function');

  const nonzeroBody = body.slice(body.indexOf(ZERO_RADIANCE_GUARD) + ZERO_RADIANCE_GUARD.length);
  assert.match(nonzeroBody, /^\n\tfloat dotNL = saturate\( dot\( geometryNormal, directLight\.direction \) \);/,
    'nonzero lights still enter the original BRDF path');
  for (const sideEffect of [
    'clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat',
    'sheenSpecularDirect += irradiance * BRDF_Sheen',
    'irradiance *= sheenEnergyComp;',
    'reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter',
    'reflectedLight.directDiffuse += irradiance * BRDF_Lambert',
  ]) {
    assert.match(nonzeroBody, new RegExp(sideEffect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `nonzero direct-light side effect remains: ${sideEffect}`);
  }

  for (const shaderName of ['standard', 'physical']) {
    const fragment = ShaderLib[shaderName]?.fragmentShader;
    assert.equal(typeof fragment, 'string', `${shaderName} fragment shader is exported`);
    assert.match(fragment, /#include <lights_physical_pars_fragment>/,
      `${shaderName} continues to include the guarded physical chunk`);
    assert.match(fragment, /#include <lights_fragment_begin>/,
      `${shaderName} continues to run the direct-light loop`);
  }
});
