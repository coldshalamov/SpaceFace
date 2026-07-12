#!/usr/bin/env node
// Promote the reviewed claim/outpost family from its isolated packet into canonical authoring.
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKET = resolve(ROOT, 'assets/ships/m5_claim_outposts');
const SOURCE = resolve(PACKET, 'source/places');
const EVIDENCE = resolve(PACKET, 'evidence');
const CANONICAL = resolve(ROOT, 'assets/ships/parts/places');
const MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const IDS = [
  'place_claim_outpost_base',
  'place_claim_outpost_refinery',
  'place_claim_outpost_relay',
  'place_claim_outpost_bastion',
];

function align4(n) { return (n + 3) & ~3; }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function rewriteGlbJson(file, mutate) {
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
  mutate(json);
  const encoded = Buffer.from(JSON.stringify(json), 'utf8');
  const paddedLength = align4(encoded.length);
  const chunk = Buffer.alloc(8 + paddedLength, 0x20);
  chunk.writeUInt32LE(paddedLength, 0); chunk.writeUInt32LE(0x4e4f534a, 4); encoded.copy(chunk, 8);
  const output = Buffer.concat([bytes.subarray(0, 12), chunk, bytes.subarray(20 + jsonLength)]);
  output.writeUInt32LE(output.length, 8);
  writeFileSync(file, output);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const byId = new Map(manifest.parts.map((part) => [part.id, part]));
const template = manifest.parts.find((part) => part.id === 'place_conveyor_barge');

for (const id of IDS) {
  const source = resolve(SOURCE, `${id}.glb`);
  const target = resolve(CANONICAL, `${id}.glb`);
  const reportPath = resolve(EVIDENCE, `${id}.json`);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const meta = {
    ...report.metadata,
    textureCompression: 'PNG-source',
    sourceGenerator: 'tools/blender/build_claim_outpost_family.py',
    sourceBlenderVersion: '5.1',
    wiringStatus: 'production_source',
  };
  rewriteGlbJson(source, (json) => {
    json.asset ??= { version: '2.0' };
    json.asset.generator = 'SpaceFace tools/blender/build_claim_outpost_family.py - Blender 5.1 authored claim growth family';
    json.asset.extras = { ...(json.asset.extras || {}), assetId: meta.assetId, partId: id, spacefaceAsset: meta };
    const scene = json.scenes?.[json.scene || 0];
    if (scene) {
      const { spacefaceAssetJson: _discard, ...extras } = scene.extras || {};
      scene.extras = { ...extras, assetId: meta.assetId, partId: id, spacefaceAsset: meta };
    }
  });
  copyFileSync(source, target);
  const bytes = readFileSync(target);
  const existing = byId.get(id);
  const entry = existing || {
    id, category: 'places', priority: 'P0', file: `places/${id}.glb`, textureSize: 1024,
    tintable: { hull: 'Material_Hull', accent: 'Material_Accent' },
    factionAccentVariants: template.factionAccentVariants,
    mount: 'origin',
  };
  entry.tris = report.lod.lod0.triangles;
  entry.bytes = bytes.length;
  entry.hooks = [];
  entry.sockets = [
    'SOCKET_Structure_Core', 'SOCKET_Dock_Approach', 'SOCKET_Emissive',
    'SOCKET_Module_Depot', 'SOCKET_Module_Refinery', 'SOCKET_Module_Defense', 'SOCKET_Module_Teleporter',
  ];
  entry.bounds = { min: report.aabb.min, max: report.aabb.max, dimensionsM: report.aabb.size };
  entry.note = `${report.title}; player claim growth family, PBR, explicit LOD0/1/2. `
    + `LOD0 ${report.lod.lod0.triangles} tris / ${report.lod.lod0.drawGroups} draw groups.`;
  if (!existing) { manifest.parts.push(entry); byId.set(id, entry); }
  const slot = `places/${id}.glb`;
  if (!manifest.runtimeSlots.place.includes(slot)) manifest.runtimeSlots.place.push(slot);
  report.bytes = bytes.length;
  report.sha256 = sha256(bytes);
  report.metadata = meta;
  report.canonical = `assets/ships/parts/places/${id}.glb`;
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${id}: ${bytes.length} bytes sha256=${report.sha256}`);
}

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
