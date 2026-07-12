import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  applyRealtimeCanopyPolicy,
  canopyOpacityForTransmission,
  configureRealtimeCanopyMaterials,
} from '../src/render/canopyMaterialPolicy.js';

assert.equal(canopyOpacityForTransmission(0.6), 0.772);
assert.equal(canopyOpacityForTransmission(0), 0.78);

const root = new THREE.Group();
const canopy = new THREE.Mesh(
  new THREE.SphereGeometry(1, 8, 6),
  new THREE.MeshPhysicalMaterial({
    color: 0x163040,
    transmission: 0.6,
    ior: 1.4,
    thickness: 0.06,
    roughness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    opacity: 1,
  }),
);
canopy.userData.spacefaceTags = { canopy: true };
root.add(canopy);

const changed = configureRealtimeCanopyMaterials(root);
assert.equal(changed, 1);
assert.equal(canopy.material.transmission, 0);
assert.equal(canopy.material.transparent, true);
assert.equal(canopy.material.depthWrite, false);
assert.equal(canopy.material.opacity, 0.772);
assert.equal(canopy.material.clearcoat, 1, 'authored PBR clearcoat is preserved');
assert.equal(canopy.material.roughness, 0.1, 'authored roughness is preserved');
assert.equal(canopy.material.ior, 1.4, 'authored optical metadata is preserved');
assert.equal(canopy.material.userData.spacefaceCanopyOptics.strategy, 'environment-alpha-glass');
assert.equal(canopy.material.userData.spacefaceCanopyOptics.sourceTransmission, 0.6);
assert.equal(configureRealtimeCanopyMaterials(root), 0, 'policy is idempotent after transmission is removed');

const hull = new THREE.MeshStandardMaterial({ color: 0xffffff });
assert.equal(applyRealtimeCanopyPolicy(hull), false, 'opaque hull materials are untouched');

console.log('canopy-material-policy: PASS');
