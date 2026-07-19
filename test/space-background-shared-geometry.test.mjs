import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildSignatureHeroAnchor, SpaceBackground } from '../src/render/spaceBackground.js';

function harness() {
  const background = Object.create(SpaceBackground.prototype);
  background.group = new THREE.Group();
  background.layers = [];
  background.layerGeometry = null;
  background.layerMaterial = null;
  background.layerMesh = null;
  background.H = 100;
  background.quadSize = 800;
  background.bgIntensity = 0.75;
  background._tintA = new THREE.Color(1, 1, 1);
  background._tintB = new THREE.Color(1, 1, 1);
  background.l0Target = { texture: new THREE.Texture() };
  background.l1Target = { texture: new THREE.Texture() };
  background.l2Target = { texture: new THREE.Texture() };
  return background;
}

const background = harness();

const signature = buildSignatureHeroAnchor({
  signatureHero: {
    kind: 'planet', type: 'gas', ring: true, frac: 0.17,
    offset: [-0.26, 0.22], lightAngle: -0.7, ringTilt: 0.24,
  },
}, { x: 1000, z: -500 }, { screenHeight: 100 }, 42, 'helios');
assert.ok(Math.abs(signature.bx - 1000 * 0.055) < 30,
  'signature X offset is expressed in measured screen units, not the huge tiled quad');
assert.ok(Math.abs(signature.bz - (-500 * 0.055)) < 25,
  'signature Z offset remains inside the initial gameplay composition');

background._buildLayers();
assert.equal(background.layers.length, 3);
assert.equal(background.group.children.length, 1,
  'the three baked sky textures are submitted through one full-screen composite mesh');
assert.equal(background.layerMesh.geometry, background.layerGeometry);
assert.equal(background.layerMesh.material, background.layerMaterial);
assert.equal(background.layerMaterial.type, 'ShaderMaterial');
assert.equal(background.layerMaterial.transparent, false,
  'the already-composited sky does not pay framebuffer transparency blending');
assert.equal(background.layerMaterial.blending, THREE.NoBlending);
assert.equal(background.layerMaterial.depthWrite, false);
assert.equal(background.layerMaterial.uniforms.uL0.value, background.l0Target.texture);
assert.equal(background.layerMaterial.uniforms.uL1.value, background.l1Target.texture);
assert.equal(background.layerMaterial.uniforms.uL2.value, background.l2Target.texture);
assert.equal(background.layers.every((layer) => layer.mesh === background.layerMesh), true,
  'layer metadata preserves per-layer parallax while sharing one submitted mesh');

const geometry = background.layerGeometry;
const material = background.layerMaterial;
let geometryDisposeCount = 0;
let materialDisposeCount = 0;
geometry.addEventListener('dispose', () => { geometryDisposeCount += 1; });
material.addEventListener('dispose', () => { materialDisposeCount += 1; });
background._buildLayers();
assert.equal(geometryDisposeCount, 1, 'a rebuild retires the shared GPU geometry exactly once');
assert.equal(materialDisposeCount, 1, 'a rebuild retires the composite GPU material exactly once');
assert.notEqual(background.layerGeometry, geometry, 'resize/rebuild creates one correctly-sized replacement');
assert.notEqual(background.layerMaterial, material, 'resize/rebuild creates one replacement composite material');
assert.equal(background.group.children.length, 1);

console.log('space-background-single-pass: PASS');
