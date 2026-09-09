import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

const scene = new THREE.Scene();
const system = Object.create(vfx);
system._scene = scene;
system._initMiningBeam();
system._initTetherCable();
system._initArcPreview();
system._initSeamMarkers();

const surfaces = [
  system._miningBeam.mesh,
  system._miningBeam.glow,
  system._tetherCable.band,
  system._tetherCable.anchor,
  system._tetherCable.anchorCore,
  system._tetherCable.targetHalo,
  system._arcPreview.mesh,
  system._seamMarkers.mesh,
];

assert.equal(surfaces.length, 8);
for (const surface of surfaces) {
  const material = surface.material;
  assert.equal(material.transparent, true, `${surface.name || surface.type} stays transparent`);
  assert.equal(material.side, THREE.DoubleSide, `${surface.name || surface.type} keeps both faces visible`);
  assert.equal(material.depthWrite, false, `${surface.name || surface.type} keeps alpha depth behavior`);
  assert.equal(material.blending, THREE.AdditiveBlending, `${surface.name || surface.type} keeps additive light blending`);
  assert.equal(material.forceSinglePass, true, `${surface.name || surface.type} avoids the redundant back/front submission`);
}

assert.equal(system._miningBeam.mesh.material.opacity, 0.7, 'mining beam authored intensity is unchanged');
assert.equal(system._tetherCable.anchor.material.opacity, 0.52, 'tether anchor authored intensity is unchanged');
assert.equal(system._arcPreview.mesh.material.opacity, 0.22, 'arc preview authored intensity is unchanged');
assert.equal(system._seamMarkers.mesh.material.opacity, 0.9, 'seam marker authored intensity is unchanged');

console.log('vfx-additive-single-pass: PASS');
