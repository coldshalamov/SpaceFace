import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  configureTransparentSinglePassSurfaces,
  shouldUseTransparentSinglePass,
} from '../src/render/transparentSinglePassPolicy.js';

function transparentMaterial(overrides = {}) {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  Object.assign(material, overrides);
  return material;
}

const root = new THREE.Group();
const canopyMaterial = transparentMaterial();
const canopyA = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), canopyMaterial);
const canopyB = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), canopyMaterial);
canopyA.userData.spacefaceTags = { canopy: true };
canopyB.userData.spacefaceTags = { canopy: true };
root.add(canopyA, canopyB);

const decalMaterial = transparentMaterial();
const decal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), decalMaterial);
decal.userData.spacefaceTags = { decal: true };
root.add(decal);

const additiveMaterial = transparentMaterial({ blending: THREE.AdditiveBlending });
const additive = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additiveMaterial);
root.add(additive);

const namedCanopyMaterial = transparentMaterial();
namedCanopyMaterial.name = 'SF_Shared_canopy_none_native';
const namedCanopy = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), namedCanopyMaterial);
root.add(namedCanopy);

const ordinaryGlass = transparentMaterial();
const ordinary = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), ordinaryGlass);
root.add(ordinary);

assert.equal(configureTransparentSinglePassSurfaces(root), 4, 'each eligible shared material changes once');
assert.equal(canopyMaterial.forceSinglePass, true);
assert.equal(decalMaterial.forceSinglePass, true);
assert.equal(additiveMaterial.forceSinglePass, true);
assert.equal(namedCanopyMaterial.forceSinglePass, true,
  'canonical canopy material names retain the policy when composed-mesh tags are absent');
assert.equal(ordinaryGlass.forceSinglePass, false, 'ordinary alpha volumes keep two-pass sorting');
assert.equal(configureTransparentSinglePassSurfaces(root), 0, 'policy is idempotent');

assert.equal(shouldUseTransparentSinglePass(transparentMaterial(), { canopy: true }), true);
assert.equal(shouldUseTransparentSinglePass(transparentMaterial(), { decal: true }), true);
assert.equal(shouldUseTransparentSinglePass(namedCanopyMaterial), true);
assert.equal(shouldUseTransparentSinglePass(transparentMaterial({ blending: THREE.AdditiveBlending })), true);
assert.equal(shouldUseTransparentSinglePass(transparentMaterial(), {}), false);
assert.equal(shouldUseTransparentSinglePass(transparentMaterial({ side: THREE.FrontSide }), { canopy: true }), false);
assert.equal(shouldUseTransparentSinglePass(transparentMaterial({ depthWrite: true }), { canopy: true }), false);
assert.equal(shouldUseTransparentSinglePass(new THREE.MeshBasicMaterial(), { canopy: true }), false);

console.log('transparent-single-pass-policy: PASS');
