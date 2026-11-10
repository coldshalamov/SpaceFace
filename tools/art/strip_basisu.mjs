// Strip KHR_texture_basisu (KTX2) + all texture refs from a GLB so Blender (which lacks the basisu
// importer) can import its geometry + node structure. Keeps meshes/nodes/accessors/bufferViews and
// any meshopt/quantization extensions intact. Used to recover an importable source from a release
// (KTX2) part GLB. Usage: node tools/art/strip_basisu.mjs <in.glb> <out.glb>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) { console.error('usage: strip_basisu.mjs <in.glb> <out.glb>'); process.exit(2); }

const buf = readFileSync(inPath);
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.slice(off + 8, off + 8 + len);
  if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8'));
  else if (type === 0x004E4942) bin = data;
  off += 8 + len;
}
const drop = (arr, name) => (arr || []).filter((e) => e !== name);
json.extensionsUsed = drop(json.extensionsUsed, 'KHR_texture_basisu');
json.extensionsRequired = drop(json.extensionsRequired, 'KHR_texture_basisu');
if (json.extensionsUsed && !json.extensionsUsed.length) delete json.extensionsUsed;
if (json.extensionsRequired && !json.extensionsRequired.length) delete json.extensionsRequired;
for (const m of (json.materials || [])) {
  const pbr = m.pbrMetallicRoughness;
  if (pbr) { delete pbr.baseColorTexture; delete pbr.metallicRoughnessTexture; }
  delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture;
}
delete json.images; delete json.textures; delete json.samplers;

const newJson = Buffer.from(JSON.stringify(json), 'utf8');
const jpad = (4 - (newJson.length % 4)) % 4;
const jChunk = Buffer.concat([newJson, Buffer.alloc(jpad, 0x20)]);
const bpad = (4 - (bin.length % 4)) % 4;
const bChunk = Buffer.concat([bin, Buffer.alloc(bpad, 0)]);
const total = 12 + 8 + jChunk.length + 8 + bChunk.length;
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jChunk.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bChunk.length, 0); bh.writeUInt32LE(0x004E4942, 4);
writeFileSync(outPath, Buffer.concat([head, jh, jChunk, bh, bChunk]));
console.log('stripped ->', outPath, 'nodes:', (json.nodes || []).length, 'meshes:', (json.meshes || []).length);
