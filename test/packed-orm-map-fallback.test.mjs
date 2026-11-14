import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installIllustratedSurface } from '../src/render/illustratedSurface.js';
import { cloneMaterialPreservingShaderHooks } from '../src/render/materialClone.js';
import { installAuthoredPackedOrmOnPrimitives } from '../src/render/packedOrmShader.js';

function compileSource(material) {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
  material.onBeforeCompile(shader, {});
  return shader.fragmentShader;
}

test('a private material without every ORM map falls back without losing its other shader hook', () => {
  const texture = new THREE.Texture();
  const source = new THREE.MeshPhysicalMaterial({ roughnessMap: texture, metalnessMap: texture, aoMap: texture });
  installIllustratedSurface(source);
  installAuthoredPackedOrmOnPrimitives([{ material: source }]);
  assert.match(compileSource(source), /sfPackedOrmTexel\.b/);

  for (const missing of [['roughnessMap'], ['metalnessMap'], ['aoMap'], ['roughnessMap', 'metalnessMap', 'aoMap']]) {
    const material = cloneMaterialPreservingShaderHooks(source);
    for (const slot of missing) material[slot] = null;
    const shader = compileSource(material);
    assert.doesNotMatch(shader, /sfPackedOrmTexel/, missing.join(', '));
    for (const chunk of ['roughnessmap_fragment', 'metalnessmap_fragment', 'aomap_fragment']) {
      assert.ok(shader.includes(`#include <${chunk}>`), `${missing.join(', ')} keeps ${chunk}`);
    }
    assert.match(shader, /sfPaintLuma/, 'the illustrated surface shader remains installed');
  }

  assert.match(compileSource(source), /sfPackedOrmTexel\.b/, 'the source retains the one-sample path');
});
