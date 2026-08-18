#!/usr/bin/env node
// Stamp the asset-level `spacefaceAsset` contract into an opening-family source GLB.
//
// The opening-family Blender builders (tools/blender/remaster_opening_*) author
// geometry/materials/LODs but leave the asset-level extras to a Node post-pass, the
// same way the debris/hulk/dock candidates were finalized for the release pipeline.
//
// Usage:
//   node tools/art/stamp_place_source_contract.mjs --glb <sourcePath> --manifest-id <partId> \
//     --lod-triangles 1234,999,555 --blender-pipeline <path> --family <familyId> \
//     --role <functionalRole> --revision <surfaceRevision> [--priority P1]
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = process.argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; } else { args[key] = next; i++; }
  }
}
const required = ['glb', 'manifest-id', 'lod-triangles', 'blender-pipeline', 'family', 'role', 'revision', 'runtime-asset-id'];
for (const key of required) if (!args[key]) throw new Error(`--${key} is required`);

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const glbPath = args.glb.startsWith('/') || /^[A-Za-z]:/.test(args.glb) ? args.glb : `${ROOT}${args.glb}`;
const manifest = JSON.parse(readFileSync(`${ROOT}assets/ships/parts/parts_manifest.json`, 'utf8'));
const part = manifest.parts.find((p) => p.id === args['manifest-id']);
if (!part) throw new Error(`manifest has no part ${args['manifest-id']}`);

const buf = readFileSync(glbPath);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not GLB');
const jsonLen = buf.readUInt32LE(12);
const doc = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

const lodTris = String(args['lod-triangles']).split(',').map((v) => Number(v.trim()));
const lodTriangles = {};
['lod0', 'lod1', 'lod2'].forEach((key, i) => { if (Number.isFinite(lodTris[i])) lodTriangles[key] = lodTris[i]; });
const totalTriangles = lodTris.reduce((a, b) => a + b, 0);
const meshNodes = (doc.nodes || []).filter((n) => n.mesh != null);
const drawGroupsPerLod = {};
for (const key of Object.keys(lodTriangles)) {
  const n = meshNodes.filter((node) => (node.name || '').toLowerCase().startsWith(`${key}_`));
  drawGroupsPerLod[key] = n.length;
}

const contract = {
    contractVersion: 1,
    assetId: args['runtime-asset-id'],
    partId: part.id,
    liveId: part.id,
    slot: 'place',
    category: part.category,
    priority: args.priority || part.priority,
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source',
    textureSize: part.textureSize,
    triangleCount: totalTriangles,
    boundsDimensionsM: part.bounds?.dimensionsM,
    sourceProvenance: {
      textureRoleContractVersion: 1,
      textureRoleMode: 'bound-base-normal-orm',
      sourceBlend: (part.note?.includes('conveyor_barge') || part.id === 'place_conveyor_barge')
        ? 'assets/ships/parts/blender/' + part.id + '_authored.blend'
        : `assets/ships/parts/blender/${part.id}_authored.blend`,
      geometryPipeline: args['blender-pipeline'],
      texturePipeline: 'tools/art/build_opening_infrastructure_maps.py',
      packedEditableTextures: true,
    },
    sourceRole: 'place-environment',
    family: args.family,
    role: args.role,
    deliverableRole: 'production_source_checkpoint',
    lods: Object.keys(lodTriangles),
    lodTriangles,
    drawGroupsPerLod,
    wiringStatus: 'source_checkpoint_release_pending',
    mountAtOrigin: part.mount === 'origin',
    sourceRevision: args.revision,
};

// The release pipeline reads the contract at three levels: document asset extras,
// scene extras, and the canonical-root node extras (debris/hulk/dock convention).
// The manifest gate additionally reads the flat asset.extras block (same fields as
// the debris/hulk sources carry next to spacefaceAsset).
doc.asset.extras = {
  ...(doc.asset.extras || {}),
  assetId: part.id,
  partId: part.id,
  category: part.category,
  priority: args.priority || part.priority,
  triangleCount: totalTriangles,
  textureSize: part.textureSize,
  forwardAxis: '+X',
  upAxis: '+Y',
  starboardAxis: '+Z',
  unit: 'metre',
  boundsDimensionsM: part.bounds?.dimensionsM,
  sourceProvenance: contract.sourceProvenance,
  spacefaceAsset: contract,
};
if (!Array.isArray(doc.scenes) || doc.scenes.length === 0) throw new Error('GLB has no scenes');
doc.scenes[0].extras = { ...(doc.scenes[0].extras || {}), assetId: part.id, partId: part.id, spacefaceAsset: contract };
const rootNode = (doc.nodes || []).find((n) => n.name === part.id);
if (!rootNode) throw new Error(`GLB has no canonical-root node named ${part.id}`);
rootNode.extras = { ...(rootNode.extras || {}), assetId: part.id, partId: part.id, spacefaceAsset: contract };

// Re-serialize: GLB header (12B) + JSON chunk (len/type at 12/16, payload at 20,
// padded with spaces) + BIN chunk kept byte-identical.
const jsonBuf = Buffer.from(JSON.stringify(doc), 'utf8');
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
const jsonChunkLen = jsonBuf.length + jsonPad;
const jsonChunk = Buffer.alloc(jsonChunkLen, 0x20);
jsonBuf.copy(jsonChunk, 0);

const binStart = 20 + jsonLen; // BIN chunk header starts right after the JSON payload
const binChunk = buf.subarray(binStart);
const totalLen = 20 + jsonChunkLen + binChunk.length;
const out = Buffer.alloc(totalLen);
buf.copy(out, 0, 0, 12);
out.writeUInt32LE(jsonChunkLen, 12);
out.writeUInt32LE(0x4e4f534a, 16);
jsonChunk.copy(out, 20);
binChunk.copy(out, 20 + jsonChunkLen);
out.writeUInt32LE(totalLen, 8);
writeFileSync(glbPath, out);
console.log(JSON.stringify({ ok: true, glb: glbPath, bytes: out.length, triangleCount: lodTriangles.lod0, drawGroupsPerLod }));
