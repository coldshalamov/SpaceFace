import assert from 'node:assert/strict';
import test from 'node:test';

import * as npmThree from 'three';
import * as vendorThree from '../vendor/three.module.js';
import {
  installPbrZeroRadianceGuard,
  PBR_ZERO_RADIANCE_GUARD,
} from '../src/render/pbrZeroRadianceGuard.js';

const DIRECT_PHYSICAL = 'void RE_Direct_Physical(';
const DIRECT_PHYSICAL_FIRST_STATEMENT = '\n\tfloat dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const SHADER_CHUNK_INPUTS = [
  ['vendor', vendorThree],
  ['npm', npmThree],
];

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

function shaderChunkInput(three) {
  // Keep each installer run isolated: the test uses the real vendor/npm ShaderChunk text without
  // mutating the module globals other test files may import in the same process.
  return {
    ShaderChunk: {
      lights_physical_pars_fragment: three.ShaderChunk.lights_physical_pars_fragment,
    },
  };
}

function assertDirectFunctionPreserved(before, after, label) {
  const directBefore = extractFunction(before, DIRECT_PHYSICAL);
  const directAfter = extractFunction(after, DIRECT_PHYSICAL);
  const guard = `\n\t${PBR_ZERO_RADIANCE_GUARD}`;
  assert.equal(directAfter.split(PBR_ZERO_RADIANCE_GUARD).length - 1, 1,
    `${label} has one exact-zero direct-light guard`);
  const body = directAfter.slice(directAfter.indexOf('{') + 1, -1);
  assert.equal(body.trimStart().split('\n', 1)[0], PBR_ZERO_RADIANCE_GUARD,
    `${label} guard is the first direct-light statement`);
  assert.equal(directAfter.replace(guard, ''), directBefore,
    `${label} nonzero direct-light function body is unchanged`);
  assert.match(body.slice(body.indexOf(PBR_ZERO_RADIANCE_GUARD) + PBR_ZERO_RADIANCE_GUARD.length),
    /^\n\tfloat dotNL = saturate\( dot\( geometryNormal, directLight\.direction \) \);/,
    `${label} nonzero lights still enter the original BRDF path`);
  for (const sideEffect of [
    'clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat',
    'sheenSpecularDirect += irradiance * BRDF_Sheen',
    'irradiance *= sheenEnergyComp;',
    'reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter',
    'reflectedLight.directDiffuse += irradiance * BRDF_Lambert',
  ]) {
    assert.match(directAfter, new RegExp(sideEffect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${label} preserves nonzero side effect: ${sideEffect}`);
  }
}

test('vendor and npm Three inputs share an idempotent zero-radiance installer', () => {
  const results = SHADER_CHUNK_INPUTS.map(([label, three]) => {
    const before = three.ShaderChunk.lights_physical_pars_fragment;
    const input = shaderChunkInput(three);
    const first = installPbrZeroRadianceGuard(input);
    const afterFirst = input.ShaderChunk.lights_physical_pars_fragment;
    const second = installPbrZeroRadianceGuard(input);
    const afterSecond = input.ShaderChunk.lights_physical_pars_fragment;

    assert.equal(first.changed, true, `${label} installer changes the unguarded chunk`);
    assert.equal(second.changed, false, `${label} installer is idempotent`);
    assert.equal(afterSecond, afterFirst, `${label} idempotent install does not duplicate the guard`);
    assertDirectFunctionPreserved(before, afterFirst, label);
    return { label, three, before, after: afterFirst };
  });

  assert.equal(extractFunction(results[0].before, DIRECT_PHYSICAL),
    extractFunction(results[1].before, DIRECT_PHYSICAL),
    'vendor and npm resolve the same upstream direct physical function body');
  assert.equal(extractFunction(results[0].after, DIRECT_PHYSICAL),
    extractFunction(results[1].after, DIRECT_PHYSICAL),
    'vendor and npm receive the same guarded direct physical function body');

  for (const [label, three] of SHADER_CHUNK_INPUTS) {
    for (const shaderName of ['standard', 'physical']) {
      const fragment = three.ShaderLib[shaderName]?.fragmentShader;
      assert.equal(typeof fragment, 'string', `${label} ${shaderName} fragment shader is exported`);
      assert.match(fragment, /#include <lights_physical_pars_fragment>/,
        `${label} ${shaderName} continues to include the guarded physical chunk`);
      assert.match(fragment, /#include <lights_fragment_begin>/,
        `${label} ${shaderName} continues to run the direct-light loop`);
    }
  }
});

test('installer rejects an unrecognized direct physical body', () => {
  const source = vendorThree.ShaderChunk.lights_physical_pars_fragment
    .replace(DIRECT_PHYSICAL_FIRST_STATEMENT, '\n\tvec3 unsupportedDirectPhysicalBody = vec3( 0.0 );');
  assert.throws(
    () => installPbrZeroRadianceGuard({ ShaderChunk: { lights_physical_pars_fragment: source } }),
    /Unrecognized RE_Direct_Physical shader body/,
  );
});
