// repair_part_contract.mjs — strip invalid hull-only MOUNT_* markers from non-hull source GLBs
// before finalize_part.mjs stamps manifest metadata.
//
// Usage: node tools/art/repair_part_contract.mjs <partId> [<partId> ...]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PART_ROOT = resolve(ROOT, 'assets/ships/parts');
const MANIFEST_PATH = resolve(PART_ROOT, 'parts_manifest.json');

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const HULL_MOUNT_RE = /^MOUNT_(COCKPIT|ENGINE|FIN)(?:[._]|$)/i;

function parseGlb(bytes) {
  let off = 12;
  let gltf = null;
  let binary = null;
  while (off < bytes.length) {
    const len = bytes.readUInt32LE(off);
    const type = bytes.readUInt32LE(off + 4);
    const start = off + 8;
    const end = start + len;
    if (type === CHUNK_JSON) {
      gltf = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/\0+$/, '').trim());
    } else if (type === CHUNK_BIN) {
      binary = bytes.subarray(start, end);
    }
    off = end;
  }
  if (!gltf) throw new Error('missing JSON chunk');
  return { gltf, binary: binary || Buffer.alloc(0) };
}

function serializeGlb(gltf, binary) {
  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (json.length % 4)) % 4;
  if (jsonPad) json = Buffer.concat([json, Buffer.from(' '.repeat(jsonPad))]);
  let bin = binary;
  const binPad = (4 - (bin.length % 4)) % 4;
  if (binPad) bin = Buffer.concat([bin, Buffer.alloc(binPad)]);
  const total = 12 + 8 + json.length + (bin.length ? 8 + bin.length : 0);
  const out = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(GLB_MAGIC, o); o += 4;
  out.writeUInt32LE(2, o); o += 4;
  out.writeUInt32LE(total, o); o += 4;
  out.writeUInt32LE(json.length, o); o += 4;
  out.writeUInt32LE(CHUNK_JSON, o); o += 4;
  json.copy(out, o); o += json.length;
  if (bin.length) {
    out.writeUInt32LE(bin.length, o); o += 4;
    out.writeUInt32LE(CHUNK_BIN, o); o += 4;
    bin.copy(out, o); o += bin.length;
  }
  return out;
}

function removeHullMountNodes(gltf) {
  const nodes = gltf.nodes || [];
  const removed = new Set();
  for (let i = 0; i < nodes.length; i++) {
    const name = String(nodes[i].name || '');
    if (!HULL_MOUNT_RE.test(name)) continue;
    if (nodes[i].mesh != null) {
      throw new Error(`refusing to drop renderable mount node ${name}`);
    }
    removed.add(i);
  }
  if (!removed.size) return 0;

  const remap = new Map();
  let next = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (removed.has(i)) continue;
    remap.set(i, next++);
  }

  const newNodes = [];
  for (let i = 0; i < nodes.length; i++) {
    if (removed.has(i)) continue;
    const node = { ...nodes[i] };
    if (Array.isArray(node.children)) {
      node.children = node.children
        .filter((child) => !removed.has(child))
        .map((child) => remap.get(child));
    }
    newNodes.push(node);
  }
  gltf.nodes = newNodes;

  for (const scene of gltf.scenes || []) {
    if (!Array.isArray(scene.nodes)) continue;
    scene.nodes = scene.nodes
      .filter((idx) => !removed.has(idx))
      .map((idx) => remap.get(idx));
  }

  return removed.size;
}

function main() {
  const partIds = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (!partIds.length) {
    console.error('usage: repair_part_contract.mjs <partId> [<partId> ...]');
    process.exit(2);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const byId = new Map((manifest.parts || []).map((part) => [part.id, part]));

  for (const partId of partIds) {
    const entry = byId.get(partId);
    if (!entry) {
      console.error(`part '${partId}' not in manifest`);
      process.exit(2);
    }
    const absPath = resolve(PART_ROOT, entry.file);
    if (!existsSync(absPath)) {
      console.error(`missing source GLB: ${absPath}`);
      process.exit(2);
    }
    const { gltf, binary } = parseGlb(readFileSync(absPath));
    const removed = removeHullMountNodes(gltf);
    writeFileSync(absPath, serializeGlb(gltf, binary));
    console.log(JSON.stringify({ partId, file: entry.file, removedMounts: removed }, null, 2));
  }
}

main();