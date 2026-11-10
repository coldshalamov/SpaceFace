#!/usr/bin/env node
// Stamp the canonical station-family source GLBs and synchronize the authoring manifest.
// Geometry remains Blender-authored; this tool only writes contract/provenance JSON.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PARTS = resolve(ROOT, 'assets/ships/parts');
const EVIDENCE = resolve(ROOT, 'assets/ships/m4_station_family/evidence');
const MANIFEST_PATH = resolve(PARTS, 'parts_manifest.json');
const AUTHORING_PATH = resolve(PARTS, 'blender/authoring.json');
const IDS = [
  'place_gate_jump_ring',
  'place_station_refinery',
  'place_station_military',
  'place_station_blackmarket',
  'place_station_fab',
  'place_station_mining',
  'place_station_research',
];

function align4(n) { return (n + 3) & ~3; }

function rewriteGlbJson(file, mutate) {
  const bytes = readFileSync(file);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`${file}: not a glTF 2 GLB`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error(`${file}: first chunk is not JSON`);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
  mutate(json);
  const encoded = Buffer.from(JSON.stringify(json), 'utf8');
  const paddedLength = align4(encoded.length);
  const jsonChunk = Buffer.alloc(8 + paddedLength, 0x20);
  jsonChunk.writeUInt32LE(paddedLength, 0);
  jsonChunk.writeUInt32LE(0x4e4f534a, 4);
  encoded.copy(jsonChunk, 8);
  const rest = bytes.subarray(20 + jsonLength);
  const out = Buffer.concat([bytes.subarray(0, 12), jsonChunk, rest]);
  out.writeUInt32LE(out.length, 8);
  writeFileSync(file, out);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const authoring = JSON.parse(readFileSync(AUTHORING_PATH, 'utf8'));
const byId = new Map(manifest.parts.map((part) => [part.id, part]));

for (const id of IDS) {
  const source = resolve(PARTS, `places/${id}.glb`);
  const report = JSON.parse(readFileSync(resolve(EVIDENCE, `${id}.json`), 'utf8'));
  const meta = {
    ...report.metadata,
    textureCompression: 'PNG-source',
    sourceGenerator: 'tools/blender/build_station_visual_family.py',
    sourceBlenderVersion: '5.1',
  };
  rewriteGlbJson(source, (json) => {
    json.asset ??= { version: '2.0' };
    json.asset.generator = 'SpaceFace tools/blender/build_station_visual_family.py - Blender 5.1 authored station family';
    json.asset.extras = { ...(json.asset.extras || {}), assetId: meta.assetId, partId: id, spacefaceAsset: meta };
    const scene = json.scenes?.[json.scene || 0];
    if (scene) {
      const { spacefaceAssetJson: _discard, ...extras } = scene.extras || {};
      scene.extras = { ...extras, assetId: meta.assetId, partId: id, spacefaceAsset: meta };
    }
  });
  const finalBytes = readFileSync(source);
  const part = byId.get(id);
  if (!part) throw new Error(`${id}: missing parts_manifest entry`);
  part.tris = report.lod.lod0.triangles;
  part.bytes = finalBytes.length;
  part.textureSize = 1024;
  part.bounds = {
    min: report.aabb.min,
    max: report.aabb.max,
    dimensionsM: report.aabb.size,
  };
  part.hooks = [];
  part.sockets = id === 'place_gate_jump_ring'
    ? ['SOCKET_Structure_Core', 'SOCKET_Emissive', 'SOCKET_Gate_Aperture']
    : ['SOCKET_Structure_Core', 'SOCKET_Emissive', 'SOCKET_Dock_Approach'];
  part.note = `${report.title} — ${report.role}; authored station family, PBR, explicit LOD0/1/2. `
    + `LOD0 ${report.lod.lod0.triangles} tris / ${report.lod.lod0.drawGroups} draw groups.`;
  const entry = authoring.entries[id] || {};
  authoring.entries[id] = {
    ...entry,
    method: 'blender_mcp',
    blend_path: `assets/ships/parts/blender/${id}_authored.blend`,
    min_tris: 1500,
    pipeline: 'tools/blender/build_station_visual_family.py',
    family: report.family,
    packet: report.packet,
  };
  if (!authoring.vertical_slice.includes(id)) authoring.vertical_slice.push(id);
  report.bytes = finalBytes.length;
  report.sha256 = createHash('sha256').update(finalBytes).digest('hex');
  report.metadata = meta;
  writeFileSync(resolve(EVIDENCE, `${id}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${id}: ${finalBytes.length} bytes sha256=${report.sha256}`);
}

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(AUTHORING_PATH, `${JSON.stringify(authoring, null, 2)}\n`);
