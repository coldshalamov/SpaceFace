import assert from 'node:assert/strict';
import * as THREE from 'three';
import { build47aScenarioProp } from '../src/render/scenarioProps47a.js';

const root = build47aScenarioProp({
  id: 'bourse_wreck_test',
  type: 'wreck',
  radius: 92,
  data: { assetRef: 'asset.slice.bourse_carrier_wreck' },
});

const meshes = [];
const sockets = new Set();
root.traverse((object) => {
  if (object.isMesh) meshes.push(object);
  if (object.userData && object.userData.spacefaceSocket) sockets.add(object.name);
});

const charred = meshes.filter((mesh) => mesh.material && mesh.material.name === 'Bourse_Charred_Plate');
const ribs = meshes.filter((mesh) => mesh.material && mesh.material.name === 'Bourse_Exposed_Rib');
assert.equal(charred.length, 1, 'seven charred wreck parts collapse to one opaque submission');
assert.equal(ribs.length, 1, 'six exposed ribs collapse to one opaque submission');
assert.equal(charred[0].name, 'Bourse_Carrier_Spine', 'hero part lookup remains stable');
assert.equal(charred[0].userData.sourcePartNames.length, 7);
assert.equal(charred[0].userData.coverDebrisCount, 4);
assert.equal(ribs[0].userData.sourcePartNames.length, 6);
assert.equal(charred[0].geometry.index.count / 3, 84, 'seven boxes retain all 84 triangles');
assert.equal(ribs[0].geometry.index.count / 3, 72, 'six boxes retain all 72 triangles');
assert.equal(charred[0].castShadow, true);
assert.equal(ribs[0].castShadow, true);
assert(sockets.has('SOCKET_Hazard_Core'));
assert(sockets.has('SOCKET_Camera_Focus'));

const pulseMeshes = meshes.filter((mesh) => Object.hasOwn(mesh, 'onBeforeRender'));
assert.equal(pulseMeshes.length, 1, 'animated mass-echo ring stays separate and live');
assert.equal(meshes.length, 4, 'wreck renders as two static batches plus two emissive hero rings');

for (const batch of [...charred, ...ribs]) {
  let disposeCount = 0;
  batch.geometry.addEventListener('dispose', () => { disposeCount += 1; });
  batch.geometry.dispose();
  assert.equal(disposeCount, 1, 'each merged geometry has one clear owner');
}

const box = new THREE.Box3().setFromObject(root);
assert.equal(box.isEmpty(), false);
assert([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite));

console.log('scenario-47a-static-batches: PASS');
