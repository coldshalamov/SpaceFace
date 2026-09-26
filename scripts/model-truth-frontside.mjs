// Flip opaque hull materials to single-sided and add missing mount empties.
// The binary chunk is copied unchanged, so mesh bytes stay put. Hitch is skipped.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { liveSolidGlbCatalog } from '../src/render/partsLibrary.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = resolve(ROOT, process.argv[2] || 'assets/ships/release/parts');
const EFFECT = /glow|gas|shield|particle|plume|thruster|beacon|emissive|lamp|flare|vfx|exhaust|corona|halo|light/i;
const GLASS = /glass|canopy|window|cockpit|visor/i;
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function classify(material) {
  const name = String(material.name || '');
  const alpha = String(material.alphaMode || 'OPAQUE');
  const transmission = Number(material.extensions?.KHR_materials_transmission?.transmissionFactor
    || material.extensions?.KHR_materials_transmission?.transmissionFactor || 0);
  const emissive = material.emissiveFactor || [0, 0, 0];
  const emissiveMag = Math.max(emissive[0] || 0, emissive[1] || 0, emissive[2] || 0);
  const base = material.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
  const seeThrough = alpha === 'BLEND' || alpha === 'MASK' || transmission > 0.05 || (base[3] != null && base[3] < 0.98);
  const glass = transmission > 0.05 || (seeThrough && GLASS.test(name) && emissiveMag < 0.45);
  const effect = EFFECT.test(name) || (seeThrough && emissiveMag > 0.45 && !glass);
  return { opaqueHull: !seeThrough && !glass && !effect, doubleSided: material.doubleSided === true };
}

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('bad magic');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (type === JSON_CHUNK) json = JSON.parse(buffer.subarray(start, end).toString('utf8').replace(/\0+$/, ''));
    else if (type === BIN_CHUNK) bin = Buffer.from(buffer.subarray(start, end));
    offset = end;
  }
  if (!json) throw new Error('no json');
  return { json, bin };
}

function packGlb(json, bin) {
  const jsonText = Buffer.from(JSON.stringify(json));
  const jsonPad = (4 - (jsonText.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonText, Buffer.alloc(jsonPad, 0x20)]);
  const parts = [jsonChunk];
  if (bin && bin.length) {
    const binPad = (4 - (bin.length % 4)) % 4;
    parts.push(bin, Buffer.alloc(binPad, 0));
  }
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  const total = 12 + 8 + jsonChunk.length + (bin && bin.length ? 8 + bin.length + ((4 - (bin.length % 4)) % 4) : 0);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);
  const chunks = [header, jsonHeader, jsonChunk];
  if (bin && bin.length) {
    const binHeader = Buffer.alloc(8);
    const padded = bin.length + ((4 - (bin.length % 4)) % 4);
    binHeader.writeUInt32LE(padded, 0);
    binHeader.writeUInt32LE(BIN_CHUNK, 4);
    chunks.push(binHeader, bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0));
  }
  const out = Buffer.concat(chunks);
  if (out.length !== total) throw new Error(`length ${out.length} != ${total}`);
  return out;
}

function socketSpecs(bounds, family) {
  if (!bounds?.min || !bounds?.max || !bounds?.center) return [];
  const { min, max, center: c } = bounds;
  const nose = [max[0], c[1], c[2]];
  const tail = [min[0], c[1], c[2]];
  if (family === 'station' || family === 'gate') {
    return [
      ['SOCKET_Dock_Approach', nose],
      ['SOCKET_Camera_Focus', [c[0], c[1], c[2]]],
    ];
  }
  if (!['player-hull', 'enemy-hull', 'faction-hull', 'traffic-hull'].includes(family)) return [];
  return [
    ['SOCKET_Weapon_Front', nose],
    ['SOCKET_Mining_Front', [max[0], c[1], c[2]]],
    ['SOCKET_Engine_Main', tail],
    ['SOCKET_Trail_Main', [min[0], c[1], c[2]]],
    ['SOCKET_RCS_Port', [c[0], c[1], min[2]]],
    ['SOCKET_RCS_Starboard', [c[0], c[1], max[2]]],
    ['SOCKET_Tether_Massline', [c[0] + (min[0] - c[0]) * 0.45, c[1], c[2]]],
    ['SOCKET_Camera_Focus', [c[0], c[1], c[2]]],
  ];
}

const census = JSON.parse(readFileSync(resolve(ROOT, 'src/data/modelTruthCensus.json'), 'utf8'));
const byUrl = new Map();
for (const row of census.rows) {
  if (!row.url) continue;
  byUrl.set(row.url.replace(/\\/g, '/'), row);
}

const files = new Map();
for (const row of liveSolidGlbCatalog()) {
  if (!row.file || row.frozenMesh) continue;
  const rel = String(row.file).replace(/\\/g, '/').replace(/^assets\/ships\/release\/parts\//, '');
  if (/kestrel/i.test(rel)) continue;
  if (!files.has(rel)) files.set(rel, row.family);
}

let written = 0;
let materials = 0;
let socketsAdded = 0;
for (const [rel, family] of files) {
  const abs = resolve(RELEASE, rel);
  let parsed;
  try {
    parsed = parseGlb(readFileSync(abs));
  } catch (error) {
    console.error('skip', rel, error.message);
    continue;
  }
  const { json } = parsed;
  let changed = false;
  for (const material of json.materials || []) {
    const kind = classify(material);
    if (kind.opaqueHull && kind.doubleSided) {
      material.doubleSided = false;
      materials += 1;
      changed = true;
    }
  }
  const sample = byUrl.get(`assets/ships/release/parts/${rel}`) || byUrl.get(`assets/ships/parts/${rel}`);
  const names = new Set((json.nodes || []).map((node) => node.name).filter(Boolean));
  const specs = socketSpecs(sample && sample.bounds, family);
  json.nodes = json.nodes || [];
  const scene = (json.scenes || [])[json.scene || 0];
  if (scene) {
    scene.nodes = scene.nodes || [];
    for (const [name, position] of specs) {
      if (names.has(name)) continue;
      json.nodes.push({ name, translation: position.map((value) => Number(value) || 0) });
      scene.nodes.push(json.nodes.length - 1);
      names.add(name);
      socketsAdded += 1;
      changed = true;
    }
  }
  if (!changed) continue;
  writeFileSync(abs, packGlb(json, parsed.bin));
  written += 1;
}
console.log(JSON.stringify({ written, materials, socketsAdded, files: files.size }));
