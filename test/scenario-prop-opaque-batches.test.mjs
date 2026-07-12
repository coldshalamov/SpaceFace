import assert from 'node:assert/strict';
import * as THREE from 'three';
import { build47aScenarioProp } from '../src/render/scenarioProps47a.js';
import { batchScenarioPropOpaqueMeshes } from '../src/render/scenarioPropBatching.js';

function prop(assetRef, type, radius) {
  return build47aScenarioProp({
    id: `${assetRef}_test`, type, radius,
    data: { assetRef },
  });
}

function meshesWithMaterial(root, materialName) {
  const matches = [];
  root.traverse((object) => {
    if (object.isMesh && object.material && object.material.name === materialName) matches.push(object);
  });
  return matches;
}

function triangleCount(meshes) {
  return meshes.reduce((sum, mesh) => {
    const geometry = mesh.geometry;
    return sum + (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
  }, 0);
}

function bounds(root) {
  const box = new THREE.Box3().setFromObject(root);
  return [...box.min.toArray(), ...box.max.toArray()];
}

function assertNear(actual, expected, epsilon = 1e-4) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert(Math.abs(actual[i] - expected[i]) <= epsilon, `${actual[i]} != ${expected[i]} at ${i}`);
  }
}

const spindle = prop('asset.slice.47a_spindle', 'payload', 10);
const spindleBoundsBefore = bounds(spindle);
const clampTriangles = triangleCount(meshesWithMaterial(spindle, 'Spindle_Black_Clamp'));
const sealTriangles = triangleCount(meshesWithMaterial(spindle, 'Spindle_Ledger_Brass'));
assert.equal(meshesWithMaterial(spindle, 'Spindle_Black_Clamp').length, 4);
assert.equal(meshesWithMaterial(spindle, 'Spindle_Ledger_Brass').length, 2);
assert.equal(meshesWithMaterial(spindle, 'Spindle_Signal_Pulse').length, 2);

batchScenarioPropOpaqueMeshes(spindle);
const clamps = meshesWithMaterial(spindle, 'Spindle_Black_Clamp');
const seals = meshesWithMaterial(spindle, 'Spindle_Ledger_Brass');
assert.equal(clamps.length, 1);
assert.equal(seals.length, 1);
assert.equal(triangleCount(clamps), clampTriangles);
assert.equal(triangleCount(seals), sealTriangles);
assert.equal(clamps[0].userData.sourcePartNames.length, 4);
assert.equal(seals[0].userData.sourcePartNames.length, 2);
assert.equal(clamps[0].castShadow, true);
assert.equal(seals[0].castShadow, true);
assert.equal(meshesWithMaterial(spindle, 'Spindle_Signal_Pulse').length, 2,
  'emissive core and animated signal ring remain separate');
assert(spindle.getObjectByName('Spindle_FalseMass_Cylinder'));
assert(spindle.getObjectByName('Spindle_Signal_Ring'));
assert(spindle.getObjectByName('SOCKET_Tether_Massline'));
assert(spindle.getObjectByName('SOCKET_Camera_Focus'));
assertNear(bounds(spindle), spindleBoundsBefore);

const handoff = prop('asset.slice.kessler_handoff_beacon', 'beacon', 80);
const handoffBoundsBefore = bounds(handoff);
const mastTriangles = triangleCount(meshesWithMaterial(handoff, 'HandoffBeacon_Dark_Mast'));
assert.equal(meshesWithMaterial(handoff, 'HandoffBeacon_Dark_Mast').length, 2);
assert.equal(meshesWithMaterial(handoff, 'HandoffBeacon_Quiet_Violet').length, 2);
batchScenarioPropOpaqueMeshes(handoff);
const mast = meshesWithMaterial(handoff, 'HandoffBeacon_Dark_Mast');
assert.equal(mast.length, 1);
assert.equal(triangleCount(mast), mastTriangles);
assert.equal(mast[0].userData.sourcePartNames.length, 2);
assert.equal(meshesWithMaterial(handoff, 'HandoffBeacon_Quiet_Violet').length, 2,
  'transparent pulsing ring and key slot remain independent');
assert(handoff.getObjectByName('HandoffBeacon_Covert_Ring'));
assert(handoff.getObjectByName('HandoffBeacon_Zone_Disc'));
assert(handoff.getObjectByName('SOCKET_Handoff_Core'));
assert(handoff.getObjectByName('SOCKET_Camera_Focus'));
assertNear(bounds(handoff), handoffBoundsBefore);

const meshCountBeforeSecondPass = [];
handoff.traverse((object) => { if (object.isMesh) meshCountBeforeSecondPass.push(object); });
batchScenarioPropOpaqueMeshes(handoff);
const meshCountAfterSecondPass = [];
handoff.traverse((object) => { if (object.isMesh) meshCountAfterSecondPass.push(object); });
assert.equal(meshCountAfterSecondPass.length, meshCountBeforeSecondPass.length, 'batching is idempotent');

for (const batch of [...clamps, ...seals, ...mast]) {
  let disposeCount = 0;
  batch.geometry.addEventListener('dispose', () => { disposeCount += 1; });
  batch.geometry.dispose();
  assert.equal(disposeCount, 1, 'merged geometry has one clear owner');
}

console.log('scenario-prop-opaque-batches: PASS');
