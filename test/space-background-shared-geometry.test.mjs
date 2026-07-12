import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpaceBackground } from '../src/render/spaceBackground.js';

function harness() {
  const background = Object.create(SpaceBackground.prototype);
  background.group = new THREE.Group();
  background.layers = [];
  background.layerGeometry = null;
  background.H = 100;
  background.quadSize = 800;
  background.l0Target = { texture: new THREE.Texture() };
  background.l1Target = { texture: new THREE.Texture() };
  background.l2Target = { texture: new THREE.Texture() };
  return background;
}

const background = harness();
background._buildLayers();
assert.equal(background.layers.length, 3);
assert.equal(new Set(background.layers.map((layer) => layer.mesh.geometry)).size, 1,
  'all three live nebula layers share one immutable plane geometry');
assert.equal(background.layers[0].mesh.geometry, background.layerGeometry);

const geometry = background.layerGeometry;
const geometryShape = {
  positions: Array.from(geometry.attributes.position.array),
  uvs: Array.from(geometry.attributes.uv.array),
  index: Array.from(geometry.index.array),
};
for (const layer of background.layers) {
  assert.deepEqual(Array.from(layer.mesh.geometry.attributes.position.array), geometryShape.positions);
  assert.deepEqual(Array.from(layer.mesh.geometry.attributes.uv.array), geometryShape.uvs);
  assert.deepEqual(Array.from(layer.mesh.geometry.index.array), geometryShape.index);
}

let disposeCount = 0;
geometry.addEventListener('dispose', () => { disposeCount += 1; });
background._buildLayers();
assert.equal(disposeCount, 1, 'a rebuild retires the shared GPU geometry exactly once');
assert.notEqual(background.layerGeometry, geometry, 'resize/rebuild creates one correctly-sized replacement');
assert.equal(new Set(background.layers.map((layer) => layer.mesh.geometry)).size, 1);

console.log('space-background-shared-geometry: PASS');
