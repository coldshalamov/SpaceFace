#!/usr/bin/env node
/**
 * Post-finalize contract repairs for revamp GLBs before release build.
 * - Strip MOUNT_COCKPIT|ENGINE|FIN markers from non-hull parts (runtime contract)
 * - Add box-projected UV0 to DET_* meshes missing TEXCOORD_0
 * - Drop trim-sheet normalTexture bindings (trim stays on baseColor wear path)
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const MOUNT_RE = /^MOUNT_(COCKPIT|ENGINE|FIN)(?:_|$)/i;

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
      binary = Buffer.from(bytes.subarray(start, end));
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
    bin.copy(out, o);
  }
  return out;
}

function accessorVec3MinMax(gltf, binary, accessorIndex) {
  const acc = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[acc.bufferView];
  const data = new DataView(binary.buffer, binary.byteOffset + view.byteOffset + (acc.byteOffset || 0));
  const stride = view.byteStride || 12;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < acc.count; i++) {
    const o = i * stride;
    for (let c = 0; c < 3; c++) {
      const v = data.getFloat32(o + c * 4, true);
      min[c] = Math.min(min[c], v);
      max[c] = Math.max(max[c], v);
    }
  }
  return { min, max, count: acc.count };
}

function addBoxUV(gltf, binary, meshIndex) {
  const mesh = gltf.meshes[meshIndex];
  for (const prim of mesh.primitives || []) {
    if (prim.attributes?.TEXCOORD_0 != null) continue;
    const posIdx = prim.attributes?.POSITION;
    if (posIdx == null) continue;
    const { min, max, count } = accessorVec3MinMax(gltf, binary, posIdx);
    const size = [max[0] - min[0] || 1, max[1] - min[1] || 1, max[2] - min[2] || 1];
    const uvs = new Float32Array(count * 2);
    const acc = gltf.accessors[posIdx];
    const view = gltf.bufferViews[acc.bufferView];
    const data = new DataView(binary.buffer, binary.byteOffset + view.byteOffset + (acc.byteOffset || 0));
    const stride = view.byteStride || 12;
    for (let i = 0; i < count; i++) {
      const o = i * stride;
      const x = data.getFloat32(o, true);
      const y = data.getFloat32(o + 4, true);
      const z = data.getFloat32(o + 8, true);
      uvs[i * 2] = (x - min[0]) / size[0];
      uvs[i * 2 + 1] = (z - min[2]) / size[2];
    }
    const byteOffset = binary.length;
    const uvBytes = Buffer.from(uvs.buffer);
    binary = Buffer.concat([binary, uvBytes]);
    const viewIndex = gltf.bufferViews.length;
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: uvBytes.length,
    });
    const uvAccIndex = gltf.accessors.length;
    gltf.accessors.push({
      bufferView: viewIndex,
      componentType: 5126,
      count,
      type: 'VEC2',
    });
    prim.attributes.TEXCOORD_0 = uvAccIndex;
  }
  return binary;
}

function imageNameForTexture(gltf, textureIndex) {
  if (textureIndex == null) return '';
  const tex = gltf.textures?.[textureIndex];
  const img = tex ? gltf.images?.[tex.source] : null;
  return String(img?.name || img?.uri || '').toLowerCase();
}

function stripTrimNormals(gltf) {
  let changed = 0;
  for (const mat of gltf.materials || []) {
    const nt = mat.normalTexture?.index;
    if (nt == null) continue;
    const name = imageNameForTexture(gltf, nt);
    if (name.includes('trim')) {
      delete mat.normalTexture;
      changed++;
    }
  }
  return changed;
}

function removeMountNodes(gltf) {
  const drop = new Set();
  for (let i = 0; i < (gltf.nodes || []).length; i++) {
    const name = String(gltf.nodes[i].name || '');
    if (MOUNT_RE.test(name)) drop.add(i);
  }
  if (!drop.size) return 0;
  const remap = new Map();
  let next = 0;
  for (let i = 0; i < gltf.nodes.length; i++) {
    if (!drop.has(i)) {
      remap.set(i, next++);
    }
  }
  const newNodes = [];
  for (let i = 0; i < gltf.nodes.length; i++) {
    if (drop.has(i)) continue;
    const node = { ...gltf.nodes[i] };
    if (node.children) {
      node.children = node.children
        .filter((c) => !drop.has(c))
        .map((c) => remap.get(c));
    }
    newNodes.push(node);
  }
  gltf.nodes = newNodes;
  for (const scene of gltf.scenes || []) {
    if (scene.nodes) {
      scene.nodes = scene.nodes
        .filter((n) => !drop.has(n))
        .map((n) => remap.get(n));
    }
  }
  return drop.size;
}

function fixPart(part) {
  const path = resolve(ROOT, 'assets/ships/parts', part.file);
  const bytes = readFileSync(path);
  const { gltf, binary } = parseGlb(bytes);
  let bin = binary;
  const mounts = part.category !== 'hulls' ? removeMountNodes(gltf) : 0;
  const normals = stripTrimNormals(gltf);
  let detUv = 0;
  for (let ni = 0; ni < (gltf.nodes || []).length; ni++) {
    const node = gltf.nodes[ni];
    if (node.mesh == null) continue;
    const name = String(node.name || '');
    if (!/^DET_/i.test(name)) continue;
    const before = JSON.stringify(gltf.meshes[node.mesh]);
    bin = addBoxUV(gltf, bin, node.mesh);
    if (JSON.stringify(gltf.meshes[node.mesh]) !== before) detUv++;
  }
  if (!mounts && !normals && !detUv) return null;
  const out = serializeGlb(gltf, bin);
  writeFileSync(path, out);
  part.bytes = out.length;
  return { id: part.id, mounts, normals, detUv, bytes: out.length };
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const results = [];
for (const part of manifest.parts) {
  const r = fixPart(part);
  if (r) results.push(r);
}
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ fixed: results.length, results }, null, 2));