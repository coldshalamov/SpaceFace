#!/usr/bin/env node
/**
 * Post-finalize contract repair for place GLBs:
 * - stamp spaceface.lod=lod0 on every mesh node
 * - ensure UV0 exists
 * - author TANGENT attributes (OpenGL)
 * - force OpenGL normal convention metadata
 *
 * Usage: node tools/art/fix_place_contract.mjs [partId ...]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_IDS = [
  'place_station_trade_hub',
  'place_gate_jump_ring',
  'place_asteroid_rock_a',
  'place_asteroid_rock_b',
  'place_asteroid_rock_c',
];

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error('not glb');
  const jsonLen = buf.readUInt32LE(12);
  const jsonStart = 20;
  const json = JSON.parse(buf.subarray(jsonStart, jsonStart + jsonLen).toString('utf8').replace(/\0+$/, ''));
  let binary = Buffer.alloc(0);
  const off = jsonStart + jsonLen;
  if (off < buf.length) {
    const binLen = buf.readUInt32LE(off);
    const binType = buf.readUInt32LE(off + 4);
    if (binType === CHUNK_BIN) binary = Buffer.from(buf.subarray(off + 8, off + 8 + binLen));
  }
  return { gltf: json, binary };
}

function pad4(n) {
  return (4 - (n % 4)) % 4;
}

function serializeGlb(gltf, binary) {
  const json = Buffer.from(JSON.stringify(gltf));
  const jsonPad = pad4(json.length);
  const binPad = pad4(binary.length);
  const jsonChunkLen = json.length + jsonPad;
  const binChunkLen = binary.length + binPad;
  const total = 12 + 8 + jsonChunkLen + 8 + binChunkLen;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunkLen, 12);
  out.writeUInt32LE(CHUNK_JSON, 16);
  json.copy(out, 20);
  for (let i = 0; i < jsonPad; i++) out[20 + json.length + i] = 0x20;
  const binOff = 20 + jsonChunkLen;
  out.writeUInt32LE(binChunkLen, binOff);
  out.writeUInt32LE(CHUNK_BIN, binOff + 4);
  binary.copy(out, binOff + 8);
  return out;
}

function accessorView(gltf, binary, accessorIndex) {
  const acc = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[acc.bufferView];
  const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const bytesPer = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType];
  const length = acc.count * comps * bytesPer;
  return { acc, start, comps, bytesPer, length, data: binary.subarray(start, start + length) };
}

function appendBuffer(gltf, binary, data, target) {
  const pad = pad4(data.length);
  const offset = binary.length;
  const next = Buffer.concat([binary, data, Buffer.alloc(pad)]);
  const viewIndex = (gltf.bufferViews ||= []).length;
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset: offset,
    byteLength: data.length,
    ...(target != null ? { target } : {}),
  });
  gltf.buffers[0].byteLength = next.length;
  return { binary: next, viewIndex };
}

function ensureTangents(gltf, binary) {
  let bin = binary;
  for (const mesh of gltf.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const attrs = prim.attributes || (prim.attributes = {});
      if (attrs.POSITION == null) continue;
      if (attrs.TEXCOORD_0 == null) {
        const pos = accessorView(gltf, bin, attrs.POSITION);
        const count = pos.acc.count;
        const uvs = Buffer.alloc(count * 8);
        const posArr = new Float32Array(pos.data.buffer, pos.data.byteOffset, count * 3);
        for (let i = 0; i < count; i++) {
          uvs.writeFloatLE(posArr[i * 3], i * 8);
          uvs.writeFloatLE(posArr[i * 3 + 2], i * 8 + 4);
        }
        const ap = appendBuffer(gltf, bin, uvs, 34962);
        bin = ap.binary;
        const accIndex = gltf.accessors.length;
        gltf.accessors.push({ bufferView: ap.viewIndex, componentType: 5126, count, type: 'VEC2' });
        attrs.TEXCOORD_0 = accIndex;
      }
      if (attrs.NORMAL == null) continue;
      if (attrs.TANGENT != null) continue;

      const posA = accessorView(gltf, bin, attrs.POSITION);
      const norA = accessorView(gltf, bin, attrs.NORMAL);
      const uvA = accessorView(gltf, bin, attrs.TEXCOORD_0);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(posA.data.buffer, posA.data.byteOffset, posA.acc.count * 3), 3),
      );
      geo.setAttribute(
        'normal',
        new THREE.BufferAttribute(new Float32Array(norA.data.buffer, norA.data.byteOffset, norA.acc.count * 3), 3),
      );
      geo.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(uvA.data.buffer, uvA.data.byteOffset, uvA.acc.count * 2), 2),
      );
      if (prim.indices != null) {
        const idx = accessorView(gltf, bin, prim.indices);
        const Typed = idx.bytesPer === 2 ? Uint16Array : Uint32Array;
        geo.setIndex(new THREE.BufferAttribute(new Typed(idx.data.buffer, idx.data.byteOffset, idx.acc.count), 1));
      }
      try {
        geo.computeTangents();
      } catch (err) {
        console.warn(`tangent fail ${mesh.name || '?'}: ${err.message}`);
        continue;
      }
      const tan = geo.getAttribute('tangent');
      if (!tan) continue;
      const tanBuf = Buffer.from(new Float32Array(tan.array).buffer);
      const ap = appendBuffer(gltf, bin, tanBuf, 34962);
      bin = ap.binary;
      const accIndex = gltf.accessors.length;
      gltf.accessors.push({
        bufferView: ap.viewIndex,
        componentType: 5126,
        count: tan.count,
        type: 'VEC4',
        max: [1, 1, 1, 1],
        min: [-1, -1, -1, -1],
      });
      attrs.TANGENT = accIndex;
    }
  }
  return bin;
}

function fixPart(partId) {
  const path = resolve(ROOT, 'assets/ships/parts/places', `${partId}.glb`);
  const { gltf, binary } = parseGlb(readFileSync(path));

  for (const node of gltf.nodes || []) {
    if (node.mesh == null) continue;
    node.extras = node.extras || {};
    const lodMatch = String(node.name || '').match(/^LOD([012])_/i);
    node.extras.spaceface = {
      lod: lodMatch ? `lod${lodMatch[1]}` : (node.extras.spaceface?.lod || 'lod0'),
      tint: 'hull',
      chamfered: true,
      ...(node.extras.spaceface || {}),
    };
  }

  for (const mat of gltf.materials || []) {
    if (mat.normalTexture) {
      // OpenGL green-up: scalar scale 1 (no y-flip)
      mat.normalTexture.scale = 1;
    }
  }

  if (gltf.asset) {
    gltf.asset.extras = gltf.asset.extras || {};
    if (gltf.asset.extras.spacefaceAsset) {
      gltf.asset.extras.spacefaceAsset.normalConvention = 'OpenGL';
      gltf.asset.extras.spacefaceAsset.chamfered = true;
    }
  }
  if (gltf.scenes?.[0]) {
    gltf.scenes[0].extras = gltf.scenes[0].extras || {};
    if (gltf.scenes[0].extras.spacefaceAsset) {
      gltf.scenes[0].extras.spacefaceAsset.normalConvention = 'OpenGL';
    }
  }

  const bin2 = ensureTangents(gltf, binary);
  const out = serializeGlb(gltf, bin2);
  writeFileSync(path, out);
  const sha = createHash('sha256').update(out).digest('hex');
  return { partId, bytes: out.length, sha256: sha };
}

const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = ids.length ? ids : DEFAULT_IDS;
const results = targets.map(fixPart);
console.log(JSON.stringify({ ok: true, results }, null, 2));
