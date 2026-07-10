import assert from 'node:assert/strict';

let validateSourceTextureRoleCoverage = () => {
  throw new Error('validateSourceTextureRoleCoverage is not implemented');
};
try {
  ({ validateSourceTextureRoleCoverage } = await import('../tools/art/lib/sourceTextureRoleValidation.mjs'));
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

function embeddedPngImages(count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    name: `fixture_image_${index}`,
    bufferView: index,
    mimeType: 'image/png',
  }));
}

function baseDocument() {
  return {
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: 8 },
      { buffer: 0, byteOffset: 16, byteLength: 8 },
    ],
    images: embeddedPngImages(),
    textures: [{ source: 0 }, { source: 1 }, { source: 2 }],
    materials: [{ name: 'Material_Hull', pbrMetallicRoughness: {} }],
  };
}

const unrelatedImages = baseDocument();
assert.throws(
  () => validateSourceTextureRoleCoverage(unrelatedImages, 'three-unrelated-images'),
  /Material_Hull.*baseColor.*normal.*metallicRoughness.*occlusion/s,
  'three embedded images alone must not masquerade as material-slot role coverage',
);

const missingOcclusion = baseDocument();
missingOcclusion.materials[0] = {
  name: 'Material_Hull',
  pbrMetallicRoughness: {
    baseColorTexture: { index: 0 },
    metallicRoughnessTexture: { index: 2 },
  },
  normalTexture: { index: 1 },
};
assert.throws(
  () => validateSourceTextureRoleCoverage(missingOcclusion, 'missing-occlusion-role'),
  /Material_Hull.*occlusion/,
  'ORM coverage requires an explicit occlusion slot as well as metallicRoughness',
);

const splitOrm = baseDocument();
splitOrm.materials[0] = {
  name: 'Material_Hull',
  pbrMetallicRoughness: {
    baseColorTexture: { index: 0 },
    metallicRoughnessTexture: { index: 2 },
  },
  normalTexture: { index: 1 },
  occlusionTexture: { index: 1 },
};
assert.throws(
  () => validateSourceTextureRoleCoverage(splitOrm, 'split-orm-role'),
  /metallicRoughness and occlusion must share one ORM texture binding/,
  'metallicRoughness and occlusion may not merely point at unrelated accepted images',
);

const valid = baseDocument();
valid.materials[0] = {
  name: 'Material_Hull',
  pbrMetallicRoughness: {
    baseColorTexture: { index: 0 },
    metallicRoughnessTexture: { index: 2 },
  },
  normalTexture: { index: 1 },
  occlusionTexture: { index: 2 },
};
const partialSecondMaterial = {
  name: 'Material_Accent_FactorOnly',
  pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1] },
};
valid.materials.push(partialSecondMaterial);
assert.doesNotThrow(
  () => validateSourceTextureRoleCoverage(valid, 'valid-role-coverage'),
  'one fully textured material may coexist with a factor-only secondary material',
);

console.log('PASS source texture roles: unrelated, missing-role, and valid fixtures');
