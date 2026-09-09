import assert from 'node:assert/strict';

const { ensureSourceTextureContract } = await import('../tools/art/finalize_part.mjs');
const { validateSourceTextureRoleCoverage } = await import('../tools/art/lib/sourceTextureRoleValidation.mjs');

function factorOnlyDocument() {
  return {
    buffers: [{ byteLength: 0 }],
    bufferViews: [],
    images: [],
    textures: [],
    materials: [{
      name: 'Material_Accent',
      pbrMetallicRoughness: {
        baseColorFactor: [0.15, 0.55, 0.85, 1],
        metallicFactor: 0.4,
        roughnessFactor: 0.5,
      },
    }],
  };
}

const delegated = factorOnlyDocument();
const delegatedBinary = ensureSourceTextureContract(
  delegated,
  Buffer.alloc(0),
  4,
  false,
  'delegated-zero-image-fixture',
);
assert.equal(delegated.images.length, 3, 'delegated generic source must synthesize three semantic images');
assert.equal(delegated.textures.length, 3, 'delegated generic source must bind three semantic textures');
assert.ok(delegatedBinary.length > 0, 'neutral role images must be embedded into the GLB binary');
assert.doesNotThrow(() => validateSourceTextureRoleCoverage(delegated, 'delegated-zero-image-fixture'));

const legacyBlenderMcp = factorOnlyDocument();
const legacyBinary = ensureSourceTextureContract(
  legacyBlenderMcp,
  Buffer.alloc(0),
  4,
  true,
  'blender-mcp-factor-only-fixture',
);
assert.equal(legacyBlenderMcp.images.length, 0, 'sanctioned blender_mcp factor-only source stays image-free');
assert.equal(legacyBlenderMcp.textures.length, 0);
assert.equal(legacyBinary.length, 0);

const twoPartialMaterials = {
  buffers: [{ byteLength: 16 }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 8 },
    { buffer: 0, byteOffset: 8, byteLength: 8 },
  ],
  images: [
    { name: 'base_a', bufferView: 0, mimeType: 'image/png' },
    { name: 'base_b', bufferView: 1, mimeType: 'image/png' },
  ],
  textures: [{ source: 0 }, { source: 1 }],
  materials: [
    {
      name: 'Material_Partial_A',
      pbrMetallicRoughness: {
        baseColorFactor: [0.2, 0.3, 0.4, 1],
        baseColorTexture: { index: 0 },
      },
    },
    {
      name: 'Material_Partial_B',
      pbrMetallicRoughness: {
        baseColorFactor: [0.6, 0.5, 0.4, 1],
        baseColorTexture: { index: 1 },
      },
    },
  ],
};
const repairedTwoPartialBinary = ensureSourceTextureContract(
  twoPartialMaterials,
  Buffer.alloc(16),
  4,
  false,
  'two-partial-materials',
);
assert.ok(repairedTwoPartialBinary.length > 16, 'shared neutral role images are appended to the binary');
const [partialA, partialB] = twoPartialMaterials.materials;
assert.ok(Number.isInteger(partialA.normalTexture?.index), 'first partial material receives normal role');
assert.ok(Number.isInteger(partialB.normalTexture?.index), 'second partial material receives normal role');
assert.equal(partialA.normalTexture.index, partialB.normalTexture.index,
  'one neutral normal texture is shared across repaired materials');
assert.equal(
  partialA.pbrMetallicRoughness.metallicRoughnessTexture.index,
  partialB.pbrMetallicRoughness.metallicRoughnessTexture.index,
  'one neutral ORM texture is shared across repaired materials',
);
assert.equal(partialA.occlusionTexture.index, partialA.pbrMetallicRoughness.metallicRoughnessTexture.index);
assert.equal(partialB.occlusionTexture.index, partialB.pbrMetallicRoughness.metallicRoughnessTexture.index);
assert.equal(twoPartialMaterials.images.length, 4,
  'repair appends exactly one shared normal image and one shared ORM image, not one set per material');
assert.equal(partialA.pbrMetallicRoughness.baseColorTexture.index, 0,
  'existing base pixels retain their baseColor role');
assert.equal(partialB.pbrMetallicRoughness.baseColorTexture.index, 1,
  'the second material keeps its own baseColor source');
assert.doesNotThrow(() => validateSourceTextureRoleCoverage(twoPartialMaterials, 'two-partial-materials'));

const mixedTexturedAndFactor = structuredClone(twoPartialMaterials);
mixedTexturedAndFactor.materials[1] = {
  name: 'Material_FactorOnly_Secondary',
  pbrMetallicRoughness: { baseColorFactor: [0.1, 0.2, 0.3, 1] },
};
const factorSecondaryBefore = structuredClone(mixedTexturedAndFactor.materials[1]);
ensureSourceTextureContract(
  mixedTexturedAndFactor,
  repairedTwoPartialBinary,
  4,
  false,
  'mixed-textured-factor-only',
);
assert.deepEqual(mixedTexturedAndFactor.materials[1], factorSecondaryBefore,
  'a complete factor-only secondary material remains factor-only and unmodified');
assert.doesNotThrow(() => validateSourceTextureRoleCoverage(mixedTexturedAndFactor, 'mixed-textured-factor-only'));

console.log('PASS finalizer texture contract: per-material repair, neutral sharing, and factor-only secondary preservation');
