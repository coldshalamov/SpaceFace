// Decompress a release part GLB (meshopt + quantization + KTX2) into a plain glTF GLB that Blender's
// importer can read. Decodes meshopt, dequantizes geometry, and drops textures (Blender lacks the
// basisu importer; textures are re-baked downstream anyway). Preserves the full node/mesh structure,
// material colors/factors, and emissive — the bits the texture pipeline needs to re-author a part.
// Usage: node tools/art/decompress_part.mjs <release.glb> <out_plain.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) { console.error('usage: decompress_part.mjs <in.glb> <out.glb>'); process.exit(2); }

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(inPath);              // decodes meshopt on read
await doc.transform(dequantize());              // remove KHR_mesh_quantization
for (const tex of doc.getRoot().listTextures()) tex.dispose();  // drop KTX2 textures

// Write vanilla (no extensions registered) so the output has no meshopt/quantization/basisu.
const outIO = new NodeIO();
await outIO.write(outPath, doc);
const root = doc.getRoot();
console.log('decompressed ->', outPath, 'nodes:', root.listNodes().length, 'meshes:', root.listMeshes().length);
