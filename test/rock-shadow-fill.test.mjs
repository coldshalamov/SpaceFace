import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { installIllustratedSurface } from '../src/render/illustratedSurface.js';
import { preloadRockSurfaceLibrary } from '../src/render/rockSurfaceLibrary.js';
import { asteroidLeafResources } from '../src/render/visualFactory.js';

function compiledShader(material) {
  const shader = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: {},
  };
  material.onBeforeCompile(shader, {});
  return shader;
}

// Evaluate the real compiled GLSL fill term for each colour channel. The
// geometric band can disagree with visible illumination under shadows or
// normal-mapped geology; neither input is substituted with a test-side copy
// of the fill algorithm.
function terrainFill(shader, albedo, metalness, light, bodyLight) {
  const expression = shader.fragmentShader.match(/vec3 sfRockFill = ([\s\S]*?);/)[1]
    .replace(/diffuseColor\.rgb/g, 'albedo');
  const evaluate = new Function(
    'albedo', 'metalnessFactor', 'sfLookShadowTint', 'sfRockSurface', 'sfLookRockFill',
    'sfRockIllumination', 'sfBodyLight', 'saturate', `return ${expression};`,
  );
  const tint = shader.uniforms.sfLookShadowTint.value.toArray();
  return albedo.map((value, channel) => evaluate(
    value, metalness, tint[channel], shader.uniforms.sfRockSurface.value,
    shader.uniforms.sfLookRockFill.value, light, bodyLight,
    value => Math.max(0, Math.min(1, value)),
  ));
}

function visibleRockIllumination(shader, diffuse, paintLuma) {
  const expression = shader.fragmentShader.match(/float sfRockIllumination = ([\s\S]*?);/)[1];
  const evaluate = new Function('totalDiffuse', 'sfPaintLuma', 'dot', 'max', 'vec3', `return ${expression};`);
  return evaluate(diffuse, paintLuma,
    (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0),
    (a, b) => a.map((value, i) => Math.max(value, b[i])),
    (...values) => values.length === 1 ? Array(3).fill(values[0]) : values,
  );
}

test('terrain fill follows final AO-adjusted diffuse light, not pre-AO irradiance', async () => {
  await preloadRockSurfaceLibrary(null, { loadTexture: async () => new THREE.Texture() });
  const { material } = asteroidLeafResources('ast_common_rock', 4);
  const shader = compiledShader(material);
  assert.ok(shader.fragmentShader.indexOf('#include <aomap_fragment>')
    < shader.fragmentShader.indexOf('float sfRockIllumination ='), 'measure only after AO has adjusted diffuse light');
  const albedo = [0.06, 0.05, 0.04];
  const paintLuma = 0.051404;
  const lit = visibleRockIllumination(shader, albedo.map(v => v * 2), paintLuma);
  assert.ok(lit > 1);
  assert.deepEqual(terrainFill(shader, albedo, 0.025, lit, 1), [0, 0, 0], 'fully lit rock gains no fill');
  const dark = visibleRockIllumination(shader, albedo.map(v => v * 0.08), paintLuma);
  const filled = terrainFill(shader, albedo, 0.025, dark, 1);
  const unlit = terrainFill(shader, albedo, 0.025, 0, 1);
  assert.ok(filled.every((value, channel) => value >= unlit[channel] * 0.9),
    'AO-darkened rock retains pigment fill even with a sun-facing geometric band');
  assert.equal(visibleRockIllumination(shader, [-0.1, -0.1, -0.1], paintLuma), 0,
    'negative shaped diffuse cannot over-amplify the fill');
});

test('dark geological faces retain reflected fill when their geometric light band disagrees', async () => {
  await preloadRockSurfaceLibrary(null, { loadTexture: async () => new THREE.Texture() });
  for (let variant = 0; variant < 5; variant++) {
    const { material, geometry } = asteroidLeafResources('ast_common_rock', variant);
    const inputs = { map: material.map, normalMap: material.normalMap,
      orm: material.aoMap, color: material.color.getHex(), roughness: material.roughness };
    const shader = compiledShader(material);
    const darkAlbedo = [0.06, 0.05, 0.04];
    const unlit = terrainFill(shader, darkAlbedo, 0.025, 0, 0);
    const hiddenKey = terrainFill(shader, darkAlbedo, 0.025, 0.05, 1);
    assert.ok(unlit.every(value => value > 0));
    assert.ok(hiddenKey.every((value, channel) => value >= unlit[channel] * 0.9),
      'a geometric roof facing the key must not erase fill on an actually dark geological face');
    assert.deepEqual(terrainFill(shader, darkAlbedo, 0.025, 2, 0), [0, 0, 0],
      'genuinely lit stone keeps its existing light response without a whole-body fill');
    assert.equal(material.map, inputs.map);
    assert.equal(material.normalMap, inputs.normalMap);
    assert.equal(material.aoMap, inputs.orm);
    assert.equal(material.color.getHex(), inputs.color);
    assert.equal(material.roughness, inputs.roughness);
    assert.equal(material.emissive.getHex(), 0);
    assert.equal(material.emissiveIntensity, 0, 'stone still receives no blanket emission');
    assert.ok(geometry.getAttribute('sfGeologyPbr'));
  }
});

test('hull materials receive no terrain fill under either illumination or geometric band', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x635d52, roughness: 1 });
  material.userData.spacefaceSharedMaterialRole = 'hull';
  installIllustratedSurface(material);
  const shader = compiledShader(material);
  for (const light of [0, 0.05, 2]) for (const bodyLight of [0, 1]) {
    assert.deepEqual(terrainFill(shader, [0.06, 0.05, 0.04], 0.025, light, bodyLight), [0, 0, 0]);
  }
});
