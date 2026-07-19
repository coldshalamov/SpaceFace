import assert from 'node:assert/strict';
import * as THREE from 'three';

import { makeCanopyMaterial } from '../src/render/assetLoader.js';
import { applyRealtimeCanopyPolicy } from '../src/render/canopyMaterialPolicy.js';

function texture(name, colorSpace, channel, { offset = [0, 0], repeat = [1, 1], rotation = 0 } = {}) {
  const value = new THREE.Texture();
  value.name = name;
  value.colorSpace = colorSpace;
  value.channel = channel;
  value.offset.set(...offset);
  value.repeat.set(...repeat);
  value.rotation = rotation;
  value.updateMatrix();
  return value;
}

const baseColor = texture('canopy-base', THREE.SRGBColorSpace, 0, {
  offset: [0.125, 0.25], repeat: [0.5, 0.75], rotation: 0.13,
});
const anisotropy = texture('canopy-anisotropy', THREE.NoColorSpace, 1, { offset: [0.2, 0.3] });
const clearcoat = texture('canopy-coat', THREE.NoColorSpace, 0);
const clearcoatRoughness = texture('canopy-coat-roughness', THREE.NoColorSpace, 1);
const clearcoatNormal = texture('canopy-coat-normal', THREE.NoColorSpace, 0);
const transmission = texture('canopy-transmission', THREE.NoColorSpace, 1, {
  offset: [0.4, 0.1], repeat: [0.25, 0.5], rotation: -0.21,
});
const thickness = texture('canopy-thickness', THREE.NoColorSpace, 1);
const envMap = texture('authored-env', THREE.SRGBColorSpace, 0);

const source = new THREE.MeshPhysicalMaterial({
  name: 'Material_Glass_Canopy',
  color: 0x163040,
  map: baseColor,
  roughness: 0.16,
  metalness: 0.03,
  anisotropy: 0.61,
  anisotropyRotation: 0.37,
  anisotropyMap: anisotropy,
  clearcoat: 0.42,
  clearcoatMap: clearcoat,
  clearcoatRoughness: 0.19,
  clearcoatRoughnessMap: clearcoatRoughness,
  clearcoatNormalMap: clearcoatNormal,
  clearcoatNormalScale: new THREE.Vector2(0.38, 0.72),
  transmission: 0.73,
  transmissionMap: transmission,
  ior: 1.47,
  thickness: 0.14,
  thicknessMap: thickness,
  attenuationDistance: 7.5,
  attenuationColor: new THREE.Color(0x6aaec7),
  envMap,
  envMapIntensity: 1.35,
  envMapRotation: new THREE.Euler(0.1, 0.2, 0.3),
  opacity: 0.91,
});
source.userData = {
  gltfExtensions: {
    KHR_materials_anisotropy: { anisotropyStrength: 0.61, anisotropyRotation: 0.37 },
    KHR_materials_transmission: { transmissionFactor: 0.73 },
  },
};

const canopy = makeCanopyMaterial(source);

assert.notEqual(canopy, source, 'runtime normalization clones rather than mutating the GLTFLoader material');
assert.equal(canopy.isMeshPhysicalMaterial, true);
assert.equal(canopy.name, source.name);
assert.equal(canopy.anisotropy, 0.61);
assert.equal(canopy.anisotropyRotation, 0.37);
assert.equal(canopy.clearcoat, 0.42);
assert.equal(canopy.clearcoatRoughness, 0.19);
assert.deepEqual(canopy.clearcoatNormalScale.toArray(), [0.38, 0.72]);
assert.notEqual(canopy.clearcoatNormalScale, source.clearcoatNormalScale, 'mutable scale vectors are cloned');
assert.equal(canopy.transmission, 0.73);
assert.equal(canopy.ior, 1.47);
assert.equal(canopy.thickness, 0.14);
assert.equal(canopy.attenuationDistance, 7.5);
assert.deepEqual(canopy.attenuationColor.toArray(), source.attenuationColor.toArray());
assert.notEqual(canopy.attenuationColor, source.attenuationColor, 'mutable attenuation color is cloned');
assert.equal(canopy.envMap, envMap);
assert.equal(canopy.envMapIntensity, 1.35);
assert.deepEqual(canopy.envMapRotation.toArray(), source.envMapRotation.toArray());

for (const [role, expected] of [
  ['map', baseColor],
  ['anisotropyMap', anisotropy],
  ['clearcoatMap', clearcoat],
  ['clearcoatRoughnessMap', clearcoatRoughness],
  ['clearcoatNormalMap', clearcoatNormal],
  ['transmissionMap', transmission],
  ['thicknessMap', thickness],
]) {
  assert.equal(canopy[role], expected, `${role} texture identity survives material cloning`);
  assert.equal(canopy[role].channel, expected.channel, `${role} texCoord channel survives`);
  assert.deepEqual(canopy[role].matrix.toArray(), expected.matrix.toArray(), `${role} transform survives`);
  assert.equal(canopy[role].colorSpace, expected.colorSpace, `${role} color-space classification survives`);
}
assert.deepEqual(canopy.userData.gltfExtensions, source.userData.gltfExtensions,
  'decoded GLTF extension metadata survives the clone');

assert.equal(applyRealtimeCanopyPolicy(canopy), true);
assert.equal(canopy.transmission, 0, 'live policy deliberately avoids Three.js physical-transmission prepass');
assert.equal(source.transmission, 0.73, 'live policy does not mutate the loader-owned source material');
assert.equal(canopy.transmissionMap, transmission, 'transmission texture remains available after scalar override');
assert.equal(canopy.ior, 1.47);
assert.equal(canopy.thickness, 0.14);
assert.equal(canopy.attenuationDistance, 7.5);
assert.equal(canopy.anisotropyMap, anisotropy);
assert.equal(canopy.clearcoatNormalMap, clearcoatNormal);
assert.deepEqual(canopy.userData.spacefaceCanopyOptics.sourceTransmissionMap.offset, [0.4, 0.1]);
assert.deepEqual(canopy.userData.spacefaceCanopyOptics.sourceTransmissionMap.repeat, [0.25, 0.5]);
assert.equal(canopy.userData.spacefaceCanopyOptics.sourceTransmissionMap.rotation, -0.21);
assert.equal(canopy.userData.spacefaceCanopyOptics.sourceTransmissionMap.channel, 1);
assert.equal(canopy.userData.spacefaceCanopyOptics.sourceTransmissionMap.colorSpace, THREE.NoColorSpace);
assert.deepEqual(canopy.userData.spacefaceCanopyOptics.sourceAttenuationColor, source.attenuationColor.toArray());

console.log('authored-canopy-pbr-preservation: PASS');
