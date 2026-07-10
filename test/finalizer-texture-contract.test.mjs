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

console.log('PASS finalizer texture contract: delegated zero-image synthesis vs blender_mcp factor-only');
