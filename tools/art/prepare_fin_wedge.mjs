// Prepare only export_fin_wedge.py output for the existing source-role finalizer.
// No colour image is reinterpreted as a normal, and existing roughness pixels stay intact.
// Usage: node tools/art/prepare_fin_wedge.mjs <raw.glb> <prepared.glb>
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { ensureSourceTextureContract } from './finalize_part.mjs';
import { parseStrictEmbeddedGlb } from './lib/strictGlbValidation.mjs';
import { validateSourceTextureRoleCoverage } from './lib/sourceTextureRoleValidation.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: prepare_fin_wedge.mjs <raw.glb> <prepared.glb>');
const { gltf, binary } = parseStrictEmbeddedGlb(readFileSync(input), 'fin_wedge export');
assert(gltf.nodes.some(node => node.name === 'fin_wedge'));
assert.deepEqual(gltf.materials.map(material => material.name).sort(),
  ['Material_Accent', 'Material_Hull', 'Material_Mechanical']);
for (const material of gltf.materials) {
  assert(!material.normalTexture, `${material.name}: source still exports a normal map`);
  assert(!material.occlusionTexture, `${material.name}: authored AO changed; review required`);
  const mr = material.pbrMetallicRoughness?.metallicRoughnessTexture;
  material.extras = {
    ...(material.extras || {}),
    // These are source-contract defaults, not new authored surface detail.
    // The fin-only package path preserves the pre-repair runtime role coverage.
    spacefaceFinWedgeSourceDefaults: mr
      ? ['normal', 'occlusion']
      : ['normal', 'metallicRoughness', 'occlusion'],
  };
  if (mr) {
    // Preserve the existing metallic/roughness channels. Zero AO strength exactly
    // preserves the previous no-AO appearance; the fin-only runtime compiler
    // removes this disabled binding, so it does not add a shader sample.
    material.occlusionTexture = { ...structuredClone(mr), strength: 0 };
  }
}
// These generated roles are uniform placeholders, not authored 1K detail. A 4x4 block preserves
// their value at every UV and follows the compressed-texture loader's preferred base dimensions.
const packed = ensureSourceTextureContract(gltf, binary, 4, false, 'fin_wedge');
for (const material of gltf.materials) {
  material.normalTexture.scale = 0;
  material.occlusionTexture.strength = 0;
}
validateSourceTextureRoleCoverage(gltf, 'fin_wedge prepared');
const json = Buffer.from(JSON.stringify(gltf));
const jsonSize = (json.length + 3) & ~3;
const binSize = (packed.length + 3) & ~3;
const result = Buffer.alloc(28 + jsonSize + binSize);
result.writeUInt32LE(0x46546c67, 0);
result.writeUInt32LE(2, 4);
result.writeUInt32LE(result.length, 8);
result.writeUInt32LE(jsonSize, 12);
result.writeUInt32LE(0x4e4f534a, 16);
result.fill(32, 20, 20 + jsonSize);
json.copy(result, 20);
result.writeUInt32LE(binSize, 20 + jsonSize);
result.writeUInt32LE(0x004e4942, 24 + jsonSize);
packed.copy(result, 28 + jsonSize);
writeFileSync(output, result);
console.log(JSON.stringify({ output, bytes: result.length, materials: gltf.materials.length }));
