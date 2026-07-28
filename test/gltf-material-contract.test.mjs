import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertGltfMaterialContractParity,
  gltfMaterialContractSignature,
} from '../tools/art/lib/gltfMaterialContract.mjs';

function fixture() {
  return {
    images: [{ name: 'paint' }, { name: 'normal' }, { name: 'orm' }],
    samplers: [{}],
    textures: [
      { source: 0, sampler: 0 },
      { source: 1, sampler: 0 },
      { source: 2, sampler: 0 },
    ],
    materials: [{
      name: 'Hull',
      doubleSided: true,
      extensions: {
        KHR_materials_clearcoat: {
          clearcoatFactor: 0.2,
          clearcoatRoughnessFactor: 0.1,
        },
      },
      pbrMetallicRoughness: {
        baseColorFactor: [0.4, 0.3, 0.2, 1],
        baseColorTexture: {
          index: 0,
          extensions: {
            KHR_texture_transform: { offset: [0, -2], scale: [3, 3] },
          },
        },
        metallicRoughnessTexture: { index: 2 },
      },
      normalTexture: { index: 1, scale: 0.9 },
      occlusionTexture: { index: 2, strength: 0.85 },
    }],
    meshes: [{ primitives: [{ material: 0 }] }],
  };
}

test('material contract normalizes glTF defaults and BasisU texture transport', () => {
  const source = fixture();
  const release = structuredClone(source);
  release.materials[0].pbrMetallicRoughness.metallicFactor = 1;
  release.materials[0].pbrMetallicRoughness.roughnessFactor = 1;
  release.textures = release.textures.map((texture) => ({
    sampler: texture.sampler,
    extensions: { KHR_texture_basisu: { source: texture.source } },
  }));
  assert.equal(
    assertGltfMaterialContractParity(source, release, 'fixture'),
    gltfMaterialContractSignature(source),
  );
});

test('material contract detects sampling and non-texture material regressions', () => {
  const source = fixture();
  const samplingRegression = structuredClone(source);
  samplingRegression.materials[0].normalTexture.scale = 0.2;
  assert.throws(
    () => assertGltfMaterialContractParity(source, samplingRegression, 'normal scale'),
    /changed material factors/,
  );

  const transformRegression = structuredClone(source);
  transformRegression.materials[0].pbrMetallicRoughness.baseColorTexture
    .extensions.KHR_texture_transform.scale = [1, 1];
  assert.throws(
    () => assertGltfMaterialContractParity(source, transformRegression, 'atlas transform'),
    /changed material factors/,
  );

  const clearcoatRegression = structuredClone(source);
  clearcoatRegression.materials[0].extensions.KHR_materials_clearcoat.clearcoatFactor = 0;
  assert.throws(
    () => assertGltfMaterialContractParity(source, clearcoatRegression, 'clearcoat'),
    /changed material factors/,
  );
});

test('material contract detects materials swapped across primitives', () => {
  const source = fixture();
  source.materials.push({
    name: 'Accent',
    pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] },
  });
  source.meshes[0].primitives.push({ material: 1 });
  const swapped = structuredClone(source);
  swapped.meshes[0].primitives[0].material = 1;
  swapped.meshes[0].primitives[1].material = 0;
  assert.throws(
    () => assertGltfMaterialContractParity(source, swapped, 'material bindings'),
    /changed material factors/,
  );
});
