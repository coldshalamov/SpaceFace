import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { configurePlanarAdditiveMaterial } from '../src/render/planarAdditivePolicy.js';

function planarAdditive(overrides = {}) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x66ddff,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  Object.assign(material, overrides);
  return material;
}

const material = planarAdditive();
assert.equal(configurePlanarAdditiveMaterial(material), true);
assert.equal(material.forceSinglePass, true);
assert.equal(material.transparent, true);
assert.equal(material.opacity, 0.55);
assert.equal(material.blending, THREE.AdditiveBlending);
assert.equal(material.depthWrite, false);
assert.equal(material.side, THREE.DoubleSide);
assert.equal(configurePlanarAdditiveMaterial(material), false, 'policy is idempotent');

assert.equal(configurePlanarAdditiveMaterial(planarAdditive({ blending: THREE.NormalBlending })), false);
assert.equal(configurePlanarAdditiveMaterial(planarAdditive({ side: THREE.FrontSide })), false);
assert.equal(configurePlanarAdditiveMaterial(planarAdditive({ depthWrite: true })), false);
assert.equal(configurePlanarAdditiveMaterial(new THREE.MeshBasicMaterial()), false);

const rendererSource = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const visualFactorySource = await readFile(new URL('../src/render/visualFactory.js', import.meta.url), 'utf8');
assert.equal((rendererSource.match(/configurePlanarAdditiveMaterial\(/g) || []).length, 2,
  'both live hazard disc and radiation-ring materials use the policy');
assert.match(visualFactorySource, /configurePlanarAdditiveMaterial\(material\)/,
  'the live gate/wormhole event horizon uses the policy');

console.log('planar-additive-policy: PASS');
