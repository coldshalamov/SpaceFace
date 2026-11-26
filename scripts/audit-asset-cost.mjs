#!/usr/bin/env node
// ASSET-COST-AUDIT (design/program/fleet/packets/ASSET-COST-AUDIT.md)
//
// What every model the game can load costs to draw, and which ones cost too much.
//
//   node scripts/audit-asset-cost.mjs                 # readable summary on stdout
//   node scripts/audit-asset-cost.mjs --json out.json # + full per-file table
//   node scripts/audit-asset-cost.mjs --md out.md     # + summary written to a file
//   node scripts/audit-asset-cost.mjs --selfcheck     # cross-check parsed counts
//                                                     # against the machine manifests
//
// No new dependencies: the GLB container is parsed here by hand (12-byte header,
// a JSON chunk, BIN chunks; geometry counts from the JSON accessors; image headers
// read straight out of the BIN bytes). Nothing boots the game.
//
// Where the on-screen numbers come from (all read from live source, not guesses):
//   camera  fov 50 deg, tilt 60 deg  — src/core/gameState.js (video.fov, camera.tilt)
//   zoom    DEFAULT_ZOOM 144, chaseClose 58, manual range 45..330, speed factor
//           0.88..1.35 — src/render/tabletopPolicy.js
//   px/WU   pxPerWu = H / (2 * D * tan(fov/2)); at 1920x1080, D=144 this is 8.04 px/WU.
//           The game's own fragmentFamilies.js notes ~5.96 px/WU on 1280x800 at the
//           shipping camera — same formula, smaller screen height (800/1080 * 8.04).
//   tilt    a hull's along-depth extent projects at sin(60deg)=0.866; both axes use it.
//   world   drawn world size per body = modelTruthCensus.json worldSize (measured by
//           scripts/model-truth-census.mjs through the same loader fits the game uses:
//           ships 24-58 WU, places 1:1 authored metres->WU, stations ~180 WU).
//   LOD     whole-ship runtime demotion is ON for anonymous hostiles (safe swap; player,
//           named, mission and traffic hulls stay LOD0) — src/render/wholeShipLodPolicy.js.
//           A <32 px spawn speck may start on lod2. LOD px thresholds 120/45: lod.js.
//   crowd   crucible waves carry 6..14 enemy bodies (median 10) — src/data/survivalWaves.js;
//           the mass enemy (wasp_swarmer, 540 spawns) wears the ashline_dart hull.
import { open as openFile, readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, posix, sep, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argValue = (flag, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : fallback;
};
const JSON_OUT = argValue('--json');
const MD_OUT = argValue('--md');
const SELFCHECK = args.includes('--selfcheck');

// ---------------------------------------------------------------- constants
const SCREEN_W = 1920;
const SCREEN_H = 1080;
const FOV_DEG = 50;
const TILT_DEG = 60;
const DEFAULT_ZOOM = 144;      // tabletopPolicy.js DEFAULT_ZOOM
const CHASE_CLOSE = 58;        // settings.video.chaseClose profile
const SPEED_ZOOM_MAX = 1.35;   // cruise widens the frame ~35% (widest steady case)
const CROWD_SLANT_WU = 300;    // typical nearest-engagement slant distance for wave bodies
const TRIS_PER_PX_FLAG = 1.5;  // "far above 1" from the packet
const SMALL_BODY_PX = 120;     // lod.js LOD0_ABOVE: below this a body is a small contact
const PRIMITIVES_SMALL_FLAG = 8;
const MERGEABLE_MATERIAL_PRIMS = 4;
// GPU vertex+index footprint estimate for ranking only: pos3+norm3+uv2 f32 + idx32
// (~50 B/vertex) across a triangle's three corners -> ~36 B per triangle.
const BYTES_PER_TRI = 36;
const DRAW_CALL_BYTES_EQ = 32 * 1024; // ranking heuristic for one merged draw call
const EFFORT = { trivial: 1, low: 2, medium: 4, high: 8 };
const TOP_N = 20;

const pxPerWuAt = (distanceWu, screenH = SCREEN_H) =>
  screenH / (2 * distanceWu * Math.tan((FOV_DEG / 2) * Math.PI / 180));
const TILT_SIN = Math.sin((TILT_DEG * Math.PI) / 180);

// ---------------------------------------------------------------- tiny utils
const toPosix = (p) => p.split(sep).join('/');
const relFromRoot = (abs) => toPosix(abs.slice(ROOT.length + 1));
const fmtBytes = (n) => {
  if (!Number.isFinite(n)) return 'n/a';
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${Math.round(n)} B`;
};
const fmtNum = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : 'n/a');
const median = (arr) => {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? a[(a.length - 1) >> 1] : null;
};
const p25 = (arr) => {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? a[Math.floor((a.length - 1) * 0.25)] : null;
};
const p75 = (arr) => {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? a[Math.floor((a.length - 1) * 0.75)] : null;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

async function readJsonIfExists(rel) {
  try { return JSON.parse(await readFile(join(ROOT, rel), 'utf8')); } catch { return null; }
}

// ---------------------------------------------------------------- GLB parsing
const GLB_MAGIC = 0x46546c67; // 'glTF'

async function readRange(fh, position, length) {
  const buf = Buffer.alloc(length);
  await fh.read(buf, 0, length, position);
  return buf;
}

function sniffImage(bytes) {
  if (!bytes || bytes.length < 12) return { format: 'unknown', width: null, height: null, bpp: null };
  // PNG: IHDR width/height big-endian at 16/20.
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return {
      format: 'PNG',
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      bpp: 4, // decoded RGBA
    };
  }
  // KTX2: magic AB 'KTX 20' BB D0 0D 0A 1A 0A, then vkFormat u32@12,
  // pixelWidth u32@20, pixelHeight u32@24.
  if (bytes[0] === 0xab && bytes.toString('latin1', 1, 7) === 'KTX 20') {
    if (bytes.length < 28) return { format: 'KTX2', width: null, height: null, bpp: 1 };
    const vkFormat = bytes.readUInt32LE(12);
    const width = bytes.readUInt32LE(20);
    const height = bytes.readUInt32LE(24);
    const bpp = ktx2BytesPerPixel(vkFormat);
    return { format: 'KTX2', width, height, bpp };
  }
  // JPEG: scan segment markers for an SOF frame header.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      const segLen = bytes.readUInt16BE(i + 2);
      const isSof = (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return {
          format: 'JPEG',
          height: bytes.readUInt16BE(i + 5),
          width: bytes.readUInt16BE(i + 7),
          bpp: 4,
        };
      }
      i += 2 + segLen;
    }
    return { format: 'JPEG', width: null, height: null, bpp: 4 };
  }
  // WebP: RIFF....WEBP then a VP8X / VP8 / VP8L chunk.
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('latin1', 12, 16);
    const le24 = (o) => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
    if (chunk === 'VP8X') {
      return { format: 'WebP', width: le24(20) + 1, height: le24(23) + 1, bpp: 4 };
    }
    if (chunk === 'VP8 ') {
      return { format: 'WebP', width: bytes.readUInt16LE(18) & 0x3fff, height: bytes.readUInt16LE(20) & 0x3fff, bpp: 4 };
    }
    if (chunk === 'VP8L') {
      const b = bytes.readUInt32LE(13);
      return { format: 'WebP', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, bpp: 4 };
    }
    return { format: 'WebP', width: null, height: null, bpp: 4 };
  }
  if (bytes.toString('latin1', 0, 3) === 'GIF') {
    return { format: 'GIF', width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), bpp: 4 };
  }
  return { format: 'unknown', width: null, height: null, bpp: null };
}

function ktx2BytesPerPixel(vkFormat) {
  // Vulkan format numbers (KTX2 vkFormat follows VkFormat). Basis/BC/ASTC block
  // formats measured in bytes per uncompressed pixel after GPU decode.
  if (vkFormat === 0) return 1; // KTX2_vkFormatUndefined (Basis LZ) — assume 1 B/px
  if (vkFormat >= 131 && vkFormat <= 134) return 0.5; // BC1
  if (vkFormat >= 135 && vkFormat <= 138) return 1;   // BC2/BC3
  if (vkFormat >= 139 && vkFormat <= 140) return 0.5; // BC4
  if (vkFormat >= 141 && vkFormat <= 144) return 1;   // BC5/BC6H
  if (vkFormat >= 145 && vkFormat <= 146) return 1;   // BC7
  if (vkFormat >= 147 && vkFormat <= 150) return 0.5; // ETC2 RGB8 / RGB8A1
  if (vkFormat >= 151 && vkFormat <= 152) return 1;   // ETC2 RGBA8
  if (vkFormat >= 157 && vkFormat <= 160) return 1;    // ASTC 4x4 / 5x4 / 5x5 / 6x5
  if (vkFormat >= 161 && vkFormat <= 162) return 0.44; // ASTC 6x6 / 8x5
  if (vkFormat >= 163 && vkFormat <= 164) return 0.33; // ASTC 8x6 / 8x8
  if (vkFormat >= 165 && vkFormat <= 168) return 0.25; // ASTC 10x5..10x8
  if (vkFormat >= 169 && vkFormat <= 171) return 0.16; // ASTC 10x10 / 12x10 / 12x12
  if (vkFormat === 37 || vkFormat === 43) return 4;    // RGBA8 UNORM/SRGB
  return 1;
}

// 4x4 column-major matrix helpers (glTF storage order).
function mat4Identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function mat4Mul(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
function mat4FromTrs(t, q, s) {
  const x = q ? q[0] : 0; const y = q ? q[1] : 0; const z = q ? q[2] : 0; const w = q ? q[3] : 1;
  const x2 = x + x; const y2 = y + y; const z2 = z + z;
  const xx = x * x2; const xy = x * y2; const xz = x * z2;
  const yy = y * y2; const yz = y * z2; const zz = z * z2;
  const wx = w * x2; const wy = w * y2; const wz = w * z2;
  const m = mat4Identity();
  m[0] = (1 - (yy + zz)) * (s ? s[0] : 1);
  m[1] = (xy + wz) * (s ? s[0] : 1);
  m[2] = (xz - wy) * (s ? s[0] : 1);
  m[4] = (xy - wz) * (s ? s[1] : 1);
  m[5] = (1 - (xx + zz)) * (s ? s[1] : 1);
  m[6] = (yz + wx) * (s ? s[1] : 1);
  m[8] = (xz + wy) * (s ? s[2] : 1);
  m[9] = (yz - wx) * (s ? s[2] : 1);
  m[10] = (1 - (xx + yy)) * (s ? s[2] : 1);
  m[12] = t ? t[0] : 0;
  m[13] = t ? t[1] : 0;
  m[14] = t ? t[2] : 0;
  return m;
}
function applyMat4(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

async function parseGlb(absPath) {
  const rec = {
    path: relFromRoot(absPath),
    bytes: 0,
    glbVersion: null,
    meshes: 0,
    primitives: 0,
    triangles: 0,
    lineVerts: 0,
    vertices: 0,
    lodTris: { lod0: 0, lod1: 0, lod2: 0, core: 0 },
    materials: 0,
    duplicateMaterialGroups: 0,
    primitivesPerMaterialMax: 0,
    textures: 0,
    textureBytesEst: 0,
    textureMaxEdge: 0,
    textureFormats: {},
    images: [],
    skins: 0,
    animations: 0,
    morphTargets: false,
    nodes: 0,
    boundsSize: null,
    boundsCaveat: null,
    extensions: [],
    duplicateGeometryGroups: 0,
    parseError: null,
  };
  let fh = null;
  try {
    const st = await stat(absPath);
    rec.bytes = st.size;
    fh = await openFile(absPath, 'r');
    const header = await readRange(fh, 0, 12);
    if (header.readUInt32LE(0) !== GLB_MAGIC) throw new Error('not a GLB container');
    rec.glbVersion = header.readUInt32LE(4);
    // Walk chunks: 12-byte header, then [len,type,data]*. First JSON, then one or
    // more BIN chunks (bufferView offsets are relative to the first BIN data start).
    let offset = 12;
    let json = null;
    let binStart = -1;
    for (let guard = 0; guard < 64 && offset + 8 <= st.size; guard++) {
      const chunkHeader = await readRange(fh, offset, 8);
      const len = chunkHeader.readUInt32LE(0);
      const type = chunkHeader.readUInt32LE(4);
      if (type === 0x4e4f534a) { // 'JSON'
        json = JSON.parse((await readRange(fh, offset + 8, len)).toString('utf8'));
      } else if (type === 0x004e4942) { // 'BIN'
        if (binStart < 0) binStart = offset + 8;
      }
      offset += 8 + len + ((len % 4) ? (4 - (len % 4)) : 0);
      if (json && binStart >= 0) break;
    }
    if (!json) throw new Error('no JSON chunk');
    const gltf = json;
    rec.extensions = [
      ...(gltf.extensionsRequired || []).map((e) => `${e}*`),
      ...(gltf.extensionsUsed || []),
    ];
    rec.nodes = (gltf.nodes || []).length;
    rec.skins = (gltf.skins || []).length;
    rec.animations = (gltf.animations || []).length;
    if (rec.skins > 0) rec.boundsCaveat = 'skinned (bind-pose bounds only)';

    // ---- geometry counts straight from the JSON accessors
    const accessors = gltf.accessors || [];
    const meshes = gltf.meshes || [];
    rec.meshes = meshes.length;
    const materialUse = new Map();
    const triCountOf = (prim) => {
      const mode = prim.mode == null ? 4 : prim.mode;
      if (mode === 4) {
        const ia = prim.indices != null ? accessors[prim.indices] : null;
        if (ia && Number.isFinite(ia.count)) return ia.count / 3;
        const pa = prim.attributes && prim.attributes.POSITION != null ? accessors[prim.attributes.POSITION] : null;
        return pa && Number.isFinite(pa.count) ? pa.count / 3 : 0;
      }
      if (mode === 5 || mode === 6) {
        const pa = prim.attributes && prim.attributes.POSITION != null ? accessors[prim.attributes.POSITION] : null;
        return pa && Number.isFinite(pa.count) ? Math.max(0, pa.count - 2) : 0;
      }
      return 0; // points/lines are not triangles
    };
    const lineCountOf = (prim) => {
      const mode = prim.mode == null ? 4 : prim.mode;
      if (mode === 1 || mode === 2 || mode === 3) {
        const pa = prim.attributes && prim.attributes.POSITION != null ? accessors[prim.attributes.POSITION] : null;
        return pa && Number.isFinite(pa.count) ? pa.count : 0;
      }
      return 0;
    };
    for (const mesh of meshes) {
      for (const prim of (mesh.primitives || [])) {
        rec.primitives += 1;
        const tris = triCountOf(prim);
        rec.triangles += tris;
        rec.lineVerts += lineCountOf(prim);
        const pa = prim.attributes && prim.attributes.POSITION != null ? accessors[prim.attributes.POSITION] : null;
        if (pa && Number.isFinite(pa.count)) rec.vertices += pa.count;
        if (prim.targets && prim.targets.length) rec.morphTargets = true;
        const matIdx = prim.material == null ? -1 : prim.material;
        materialUse.set(matIdx, (materialUse.get(matIdx) || 0) + 1);
        // LOD buckets by mesh/node naming (render packages name meshes LOD0_*)
        const name = `${mesh.name || ''}`;
        const lodKey = /^lod0/i.test(name) ? 'lod0' : /^lod1/i.test(name) ? 'lod1' : /^lod2/i.test(name) ? 'lod2' : 'core';
        rec.lodTris[lodKey] += tris;
      }
    }
    const maxMatPrims = Math.max(0, ...materialUse.values());
    rec.primitivesPerMaterialMax = materialUse.size ? maxMatPrims : 0;

    // ---- materials and duplicates (canonical JSON compare)
    const materials = gltf.materials || [];
    rec.materials = materials.length;
    const matGroups = new Map();
    for (const m of materials) {
      const canon = JSON.stringify(m);
      matGroups.set(canon, (matGroups.get(canon) || 0) + 1);
    }
    rec.duplicateMaterialGroups = [...matGroups.values()].filter((n) => n > 1).length;

    // ---- textures: read each image's header bytes (embedded BIN or external file)
    const bufferViews = gltf.bufferViews || [];
    const images = gltf.images || [];
    rec.textures = images.length;
    for (const img of images) {
      let sniffed = { format: 'unknown', width: null, height: null, bpp: null };
      let uri = null;
      try {
        if (img.bufferView != null) {
          const view = bufferViews[img.bufferView];
          if (view && binStart >= 0) {
            const at = binStart + (view.byteOffset || 0);
            const head = await readRange(fh, at, Math.min(view.byteLength || 128 * 1024, 128 * 1024));
            sniffed = sniffImage(head);
          }
        } else if (typeof img.uri === 'string') {
          uri = img.uri;
          if (!/^data:/i.test(uri)) {
            const imgAbs = resolvePath(dirname(absPath), decodeURIComponent(uri.split('#')[0]));
            const ifh = await openFile(imgAbs, 'r').catch(() => null);
            if (ifh) {
              try {
                const head = Buffer.alloc(128 * 1024);
                const { bytesRead } = await ifh.read(head, 0, head.length, 0);
                sniffed = sniffImage(head.subarray(0, bytesRead));
              } finally { await ifh.close(); }
            }
          }
        }
      } catch { /* header read failed — keep the unknown */ }
      const bpp = sniffed.bpp == null ? 4 : sniffed.bpp;
      const decBytes = sniffed.width && sniffed.height ? sniffed.width * sniffed.height * bpp : null;
      rec.textureBytesEst += decBytes || 0;
      if (sniffed.width) rec.textureMaxEdge = Math.max(rec.textureMaxEdge, sniffed.width, sniffed.height || 0);
      rec.textureFormats[sniffed.format] = (rec.textureFormats[sniffed.format] || 0) + 1;
      rec.images.push({
        format: sniffed.format,
        width: sniffed.width,
        height: sniffed.height,
        decodedBytes: decBytes,
        external: !!uri,
        mimeType: img.mimeType || null,
      });
    }

    // ---- bounds: accessor min/max corners through the node hierarchy
    const nodes = gltf.nodes || [];
    let hasBounds = false;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const seenNodes = new Set();
    // duplicate geometry = same attributes, counts, material AND same world-space
    // extent — position-blind matching would flag every repeated simple part.
    const geoSignatures = new Map();
    const visit = (nodeIdx, parentMat) => {
      if (nodeIdx == null || seenNodes.has(nodeIdx)) return;
      seenNodes.add(nodeIdx);
      const node = nodes[nodeIdx];
      if (!node) return;
      const local = Array.isArray(node.matrix) && node.matrix.length === 16
        ? node.matrix.slice()
        : mat4FromTrs(node.translation, node.rotation, node.scale);
      const world = mat4Mul(parentMat, local);
      if (node.mesh != null) {
        const mesh = meshes[node.mesh];
        for (const prim of (mesh && mesh.primitives) || []) {
          const pa = prim.attributes && prim.attributes.POSITION != null ? accessors[prim.attributes.POSITION] : null;
          if (!pa || !Array.isArray(pa.min) || !Array.isArray(pa.max)) continue;
          hasBounds = true;
          const wmin = [Infinity, Infinity, Infinity];
          const wmax = [-Infinity, -Infinity, -Infinity];
          for (let i = 0; i < 8; i++) {
            const v = [
              i & 1 ? pa.max[0] : pa.min[0],
              i & 2 ? pa.max[1] : pa.min[1],
              i & 4 ? pa.max[2] : pa.min[2],
            ];
            const w = applyMat4(world, v);
            for (let a = 0; a < 3; a++) {
              if (w[a] < wmin[a]) wmin[a] = w[a];
              if (w[a] > wmax[a]) wmax[a] = w[a];
              if (w[a] < min[a]) min[a] = w[a];
              if (w[a] > max[a]) max[a] = w[a];
            }
          }
          const sig = JSON.stringify([
            Object.keys(prim.attributes || {}).sort().map((k) => [k, accessors[prim.attributes[k]]?.count, accessors[prim.attributes[k]]?.type]),
            prim.material == null ? -1 : prim.material,
            wmin.map((v) => Math.round(v * 100)),
            wmax.map((v) => Math.round(v * 100)),
          ]);
          geoSignatures.set(sig, (geoSignatures.get(sig) || 0) + 1);
        }
      }
      for (const child of node.children || []) visit(child, world);
    };
    for (const scene of (gltf.scenes || [{ nodes: gltf.scene == null ? [] : undefined }])) {
      for (const n of scene.nodes || []) visit(n, mat4Identity());
    }
    if (hasBounds) {
      rec.boundsSize = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    } else {
      rec.boundsCaveat = rec.boundsCaveat || 'no accessor min/max (compressed or empty)';
    }
    rec.duplicateGeometryGroups = [...geoSignatures.values()].filter((n) => n > 1).length;
    // Render packages carry their own semantic table: primitives on dynamic-role nodes are
    // addressed individually at runtime (turrets, breakables, motion surfaces) and are not
    // mergeable waste, whatever the container-level material bucketing implies.
    if (rec.path.includes('/render-packages/')) {
      try {
        const metaPath = resolvePath(dirname(absPath), 'render-package.json');
        const meta = JSON.parse((await readFile(metaPath)).toString('utf8'));
        const dynamicNodes = new Set((meta.dynamicGroups || []).map((g) => g && g.nodeId).filter(Boolean));
        const roleById = new Map((meta.nodes || []).map((n) => [n && n.id, n]));
        let dynamicPrimitives = 0;
        for (const entry of meta.geometry || []) {
          if (!entry) continue;
          if (dynamicNodes.has(entry.nodeId)) dynamicPrimitives += 1;
          else if (roleById.get(entry.nodeId)?.role === 'dynamic') dynamicPrimitives += 1;
        }
        rec.dynamicPrimitives = dynamicPrimitives;
      } catch { /* metadata is optional; the container numbers stand alone */ }
    }
  } catch (err) {
    rec.parseError = String(err && err.message || err);
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
  return rec;
}

// ---------------------------------------------------------------- inventory
async function walkGlbs(dirRel, out) {
  const abs = join(ROOT, dirRel);
  let entries;
  try { entries = await readdir(abs, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.devshots' || entry.name === '.dev' || entry.name === '.vercel') continue;
    const childRel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walkGlbs(childRel, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) out.push(childRel);
  }
}

async function scanTextRefs(dirRel) {
  // Every .glb path string in a folder of text files (js/mjs/json/py/md/sh).
  // Property accesses (obj.glb), check ids (metrics.x.glb) and loader suffix
  // joins ('render.glb') are code, not asset references — filtered below.
  const found = [];
  const abs = join(ROOT, dirRel);
  let entries;
  try { entries = await readdir(abs, { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const childRel = `${dirRel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (dirRel === '' && ['design', 'docs', 'assets', 'tools', 'scripts', 'test', 'src'].includes(entry.name) === false) continue;
      found.push(...await scanTextRefs(childRel));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(js|mjs|json|py|md|sh|txt)$/i.test(entry.name)) continue;
    let text;
    try { text = await readFile(join(ROOT, childRel), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/[A-Za-z0-9_@./\\-]+\.glb/g)) {
      const raw = m[0];
      if (raw.includes('$') || raw.includes('{') || raw.includes('...')) continue; // templates
      if (raw.includes('\\')) continue; // regex literals (/\.glb$/), not paths
      if (raw === 'render.glb') continue; // loader suffix join, covered by the package manifest
      if (/^metrics\./.test(raw)) continue; // validation check ids, not paths
      found.push({ raw, at: `${childRel}` });
    }
  }
  return found;
}

function resolveRefString(raw, exists, byBasename) {
  // Turn a found .glb string into repo-relative path(s) that exist on disk.
  const p = toPosix(raw).replace(/^\.\//, '');
  const out = [];
  if (p.startsWith('assets/')) {
    if (exists.has(p)) out.push(p);
    // A path-shaped reference to a missing file is a real finding; a bare name
    // that matches nothing is code noise (obj.glb property chains), dropped.
    return { paths: out, dangling: exists.has(p) ? null : raw };
  }
  // Loader-relative part roots (partsLibrary.js PART_ROOT / PART_RELEASE_ROOT).
  const partsRoots = ['assets/ships/release/parts/', 'assets/ships/parts/'];
  for (const root of partsRoots) {
    if (exists.has(root + p)) { out.push(root + p); return { paths: out, dangling: null }; }
  }
  // Bare filename: resolve by basename, preferring the release copy the game loads.
  if (!p.includes('/')) {
    const hits = byBasename.get(p) || [];
    for (const root of partsRoots) {
      const hit = hits.find((h) => h.startsWith(root));
      if (hit) { out.push(hit); return { paths: out, dangling: null }; }
    }
    return { paths: out, dangling: null };
  }
  return { paths: out, dangling: raw };
}

// ---------------------------------------------------------------- main
const t0 = Date.now();
const diskFiles = [];
await walkGlbs('', diskFiles);
const exists = new Set(diskFiles);
const byBasename = new Map();
for (const p of diskFiles) {
  const base = p.split('/').pop();
  if (!byBasename.has(base)) byBasename.set(base, []);
  byBasename.get(base).push(p);
}

// ---- references: what names a GLB, and at what tier.
// tier order for classification: runtime > authoring > tooling > none.
const refs = new Map(); // path -> { runtime: [sources], authoring: [sources], tooling: [sources] }
const addRef = (path, tier, source) => {
  if (!path) return;
  let entry = refs.get(path);
  if (!entry) { entry = { runtime: [], authoring: [], tooling: [] }; refs.set(path, entry); }
  if (!entry[tier].includes(source)) entry[tier].push(source);
};
const danglingRefs = [];

// 1) parts_manifest: authoring source rows (relative to assets/ships/parts/) and
//    their release mirrors (what the runtime actually loads).
const partsManifest = await readJsonIfExists('assets/ships/parts/parts_manifest.json');
if (partsManifest) {
  for (const part of partsManifest.parts || []) {
    if (!part.file) continue;
    addRef(`assets/ships/parts/${part.file}`, 'authoring', 'parts_manifest.json');
    addRef(`assets/ships/release/parts/${part.file}`, 'runtime', 'parts_manifest.json (release mirror)');
  }
}
// 2) release manifest: built release copies + their sources.
const releaseManifest = await readJsonIfExists('assets/ships/release/release_manifest.json');
if (releaseManifest) {
  for (const asset of releaseManifest.assets || []) {
    if (asset.release) addRef(asset.release, 'runtime', 'release_manifest.json');
    if (asset.source) addRef(asset.source, 'authoring', 'release_manifest.json');
  }
}
// 3) render packages (what the game actually loads): import the generated manifest.
const loadPilots = async () => {
  const mod = await import('../src/render/renderPackageManifest.js');
  return mod.RENDER_PACKAGE_PILOTS || mod.PILOTS || mod.default || [];
};
try {
  const pilots = await loadPilots();
  for (const pilot of pilots) {
    if (pilot.sourceUrl) addRef(pilot.sourceUrl, 'runtime', 'renderPackageManifest.js');
    if (pilot.metadataUrl) {
      addRef(pilot.metadataUrl.replace(/render-package\.json$/, 'render.glb'), 'runtime', 'renderPackageManifest.js');
    }
  }
} catch (err) {
  console.error(`warn: render package manifest import failed: ${err.message}`);
}
// 4) model-truth census rows (runtime world sizes; the census urls are release paths).
const census = await readJsonIfExists('src/data/modelTruthCensus.json');
const censusByPath = new Map();
if (census) {
  for (const row of census.rows || []) {
    if (!row.url) continue;
    addRef(row.url, 'runtime', 'modelTruthCensus.json');
    if (!censusByPath.has(row.url)) censusByPath.set(row.url, []);
    censusByPath.get(row.url).push(row);
  }
}
// 5) every .glb string in src/ (loaders, data, features, arena sets, gallery, characters).
const srcRefs = await scanTextRefs('src');
for (const { raw, at } of srcRefs) {
  const { paths, dangling } = resolveRefString(raw, exists, byBasename);
  for (const p of paths) addRef(p, 'runtime', at);
  if (dangling) danglingRefs.push({ raw, at });
}
// 6) forge fleet registry names the authoring wholeship each forge ship replaces.
const forgeFleet = await readJsonIfExists('tools/blender/forge/fleet.json');
if (forgeFleet) {
  for (const ship of Object.values(forgeFleet.ships || {})) {
    if (!ship.file) continue;
    const p = `assets/ships/parts/wholeships/${ship.file}.glb`;
    if (exists.has(p)) addRef(p, 'authoring', 'tools/blender/forge/fleet.json');
  }
}
// 7) tooling references (scripts/, tools/): not the game, but not dead weight either.
const toolRefs = [...await scanTextRefs('scripts'), ...await scanTextRefs('tools')];
for (const { raw, at } of toolRefs) {
  const { paths } = resolveRefString(raw, exists, byBasename);
  for (const p of paths) addRef(p, 'tooling', at);
}

// ---- render package map: release sourceUrl -> package key (and back).
const packageBySource = new Map();
const packageRenderGlbByKey = new Map();
try {
  const pilots = await loadPilots();
  for (const pilot of pilots) {
    if (pilot.sourceUrl) packageBySource.set(pilot.sourceUrl, pilot.key);
    if (pilot.metadataUrl) packageRenderGlbByKey.set(pilot.key, pilot.metadataUrl.replace(/render-package\.json$/, 'render.glb'));
  }
} catch { /* already warned above */ }

// ---- LOD sibling detection on disk (_lod1/_lod2 files, authored-down variants).
const lodSiblings = new Map();
{
  const stemOf = (p) => {
    const base = p.split('/').pop().replace(/\.glb$/i, '');
    return base.replace(/(_|-)lod[0-9]$/i, '');
  };
  const filesByFolder = new Map();
  for (const p of diskFiles) {
    const dir = p.split('/').slice(0, -1).join('/');
    if (!filesByFolder.has(dir)) filesByFolder.set(dir, []);
    filesByFolder.get(dir).push(p);
  }
  for (const [dir, files] of filesByFolder) {
    for (const p of files) {
      const base = p.split('/').pop().replace(/\.glb$/i, '');
      const stem = stemOf(p);
      const isLodSibling = base !== stem && /(_|-)lod[0-9]$/i.test(base);
      if (!isLodSibling) continue;
      const family = `${dir}/${stem}.glb`;
      if (!lodSiblings.has(family)) lodSiblings.set(family, []);
      lodSiblings.get(family).push(p);
    }
    // authored_down folder variants share the file name in a sibling folder
    const m = /\/authored_down$/.exec(dir);
    if (m) {
      const up = dir.slice(0, m.index);
      for (const p of files) {
        const family = `${up}/${p.split('/').pop()}`;
        if (exists.has(family)) {
          if (!lodSiblings.has(family)) lodSiblings.set(family, []);
          lodSiblings.get(family).push(p);
        }
      }
    }
  }
}

// ---- parse every GLB on disk.
const records = new Map();
const CONCURRENCY = 24;
let cursor = 0;
async function worker() {
  while (cursor < diskFiles.length) {
    const idx = cursor++;
    const rel = diskFiles[idx];
    records.set(rel, await parseGlb(join(ROOT, rel)));
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// ---- classify each file.
const CROWD_FAMILIES = new Set(['enemy-hull', 'traffic-hull', 'drone', 'rock', 'rock-authored', 'wreck', 'pod']);
for (const rel of diskFiles) {
  const rec = records.get(rel);
  const ref = refs.get(rel) || { runtime: [], authoring: [], tooling: [] };
  rec.route = ref.runtime.length ? 'runtime' : ref.authoring.length ? 'authoring' : ref.tooling.length ? 'tooling' : 'unreferenced';
  rec.refSources = [...ref.runtime, ...ref.authoring, ...ref.tooling];
  const rows = censusByPath.get(rel) || [];
  rec.censusRows = rows;
  rec.family = rows.length ? rows[0].family : deriveFamily(rel);
  rec.lodSiblings = lodSiblings.get(rel) || [];
  rec.packageKey = packageBySource.get(rel) || null;
  // A release parts GLB whose render package exists is the package's SOURCE; the
  // package render.glb is what the game actually draws at runtime.
  rec.supersededByPackage = !!packageBySource.has(rel)
    && records.has(packageRenderGlbByKey.get(packageBySource.get(rel)));
  rec.isPackageGlb = packageRenderGlbByKey.size && [...packageRenderGlbByKey.values()].includes(rel)
    ? [...packageRenderGlbByKey.entries()].find(([, v]) => v === rel)[0] : null;
  // world size: median census row (multiple rows = multiple draw fits)
  if (rows.length) {
    const lens = rows.map((r) => Math.max(r.worldSize?.[0] || 0, r.worldSize?.[2] || 0)).filter(Number.isFinite);
    const wids = rows.map((r) => Math.min(r.worldSize?.[0] || Infinity, r.worldSize?.[2] || Infinity)).filter(Number.isFinite);
    rec.worldLen = median(lens);
    rec.worldLenMin = Math.min(...lens);
    rec.worldLenMax = Math.max(...lens);
    rec.worldWid = median(wids);
    rec.entityRadius = median(rows.map((r) => r.gameplay?.entityRadius).filter(Number.isFinite));
    rec.censusLod1 = rows.some((r) => r.lod?.lod1);
    rec.censusLod2 = rows.some((r) => r.lod?.lod2);
  }
  if (rec.isPackageGlb && !rec.worldLen) {
    // a render package inherits its source's census fit
    const src = [...packageBySource.entries()].find(([, k]) => k === rec.isPackageGlb);
    const srcRows = src ? censusByPath.get(src[0]) : null;
    if (srcRows && srcRows.length) {
      const lens = srcRows.map((r) => Math.max(r.worldSize?.[0] || 0, r.worldSize?.[2] || 0)).filter(Number.isFinite);
      rec.worldLen = median(lens);
      rec.worldLenMin = Math.min(...lens);
      rec.worldLenMax = Math.max(...lens);
      rec.worldWid = median(srcRows.map((r) => Math.min(r.worldSize?.[0] || Infinity, r.worldSize?.[2] || Infinity)).filter(Number.isFinite));
      rec.entityRadius = median(srcRows.map((r) => r.gameplay?.entityRadius).filter(Number.isFinite));
      rec.censusLod1 = srcRows.some((r) => r.lod?.lod1);
      rec.censusLod2 = srcRows.some((r) => r.lod?.lod2);
      rec.family = srcRows[0].family;
    }
  }
}
function deriveFamily(rel) {
  if (rel.startsWith('assets/ships/parts/') || rel.startsWith('assets/ships/release/parts/')) {
    const cat = rel.split('/').slice(-2)[0];
    return `part-${cat}`;
  }
  if (rel.includes('/render-packages/')) return 'render-package';
  if (rel.startsWith('assets/characters/')) return 'character';
  if (rel.startsWith('assets/works/')) return 'works';
  if (rel.startsWith('assets/incubator/')) return 'incubator';
  if (rel.startsWith('assets/ships/forge/')) return 'forge-preview';
  if (rel.startsWith('assets/ships/foundry/')) return 'foundry';
  if (rel.startsWith('assets/third_party/')) return 'third-party';
  if (rel.startsWith('assets/models/')) return 'asset-bank';
  if (rel.startsWith('assets/vfx/')) return 'vfx-mesh';
  if (rel.startsWith('assets/places/')) return 'places-source';
  if (rel.startsWith('design/')) return 'design-archive';
  return rel.split('/').slice(0, 2).join('/');
}

// ---- on-screen estimates (runtime files with a census world fit).
for (const rel of diskFiles) {
  const rec = records.get(rel);
  if (!Number.isFinite(rec.worldLen) || rec.worldLen <= 0) continue;
  const pxPerWu = pxPerWuAt(DEFAULT_ZOOM);
  const pxPerWuCrowd = pxPerWuAt(CROWD_SLANT_WU);
  rec.pxPerWu = pxPerWu;
  rec.pxLen = rec.worldLen * pxPerWu * TILT_SIN;
  rec.pxLenClose = rec.worldLen * pxPerWuAt(CHASE_CLOSE) * TILT_SIN;
  rec.pxLenCrowd = rec.worldLen * pxPerWuCrowd * TILT_SIN;
  rec.pxWid = Math.max(1, (rec.worldWid || rec.worldLen * 0.4) * pxPerWu * TILT_SIN);
  // active triangles: render packages carry LOD0+1+2 in one file; only LOD0 draws
  // (demotion off). Plain release GLBs are single-LOD.
  rec.activeTris = rec.lodTris.lod0 > 0 ? rec.lodTris.lod0 : rec.triangles;
  rec.pxArea = Math.max(1, rec.pxLen * rec.pxWid);
  rec.trisPerPx = rec.pxArea > 0 ? rec.activeTris / rec.pxArea : null;
  rec.trisPerPxCrowd = rec.pxArea > 0
    ? rec.activeTris / Math.max(1, rec.pxLenCrowd * (rec.worldWid || rec.worldLen * 0.4) * pxPerWuCrowd * TILT_SIN)
    : null;
}

// ---- waste flags
const flags = [];
const pushFlag = (rel, kind, detail) => {
  const rec = records.get(rel);
  const flag = { path: rel, family: rec.family, route: rec.route, kind, ...detail };
  flags.push(flag);
  (rec.flags ||= []).push(kind);
};
for (const rel of diskFiles) {
  const rec = records.get(rel);
  if (rec.parseError) { pushFlag(rel, 'parse-failed', { note: rec.parseError }); continue; }
  // oddities on everything
  if (rec.triangles === 0 && rec.bytes > 4096) pushFlag(rel, 'zero-triangles', { note: `${fmtBytes(rec.bytes)} of no triangles` });
  if (rec.duplicateGeometryGroups > 0) pushFlag(rel, 'duplicate-geometry', { groups: rec.duplicateGeometryGroups, note: `${rec.duplicateGeometryGroups} primitives share one material, size and world position` });
  if (rec.skins > 0 && CROWD_FAMILIES.has(rec.family)) pushFlag(rel, 'skinned-crowd-body', { skins: rec.skins });
  if (!Number.isFinite(rec.worldLen)) continue;
  if (rec.route !== 'runtime') continue; // waste is only waste if the game can draw it
  if (rec.supersededByPackage) continue; // the package render.glb is what draws; it is audited instead
  // 1. triangles per on-screen pixel (LOD0 is what draws; demotion is off)
  if (Number.isFinite(rec.trisPerPx) && rec.trisPerPx >= TRIS_PER_PX_FLAG) {
    const needed = Math.min(rec.activeTris, rec.pxArea * 1.0);
    const saveTris = Math.max(0, rec.activeTris - needed);
    pushFlag(rel, 'tris-per-px', {
      trisPerPx: rec.trisPerPx, activeTris: rec.activeTris, pxLen: rec.pxLen, lod: 'lod0',
      saveTris, saveBytesEq: saveTris * BYTES_PER_TRI, effort: 'high',
      note: `${rec.activeTris} tris over ~${Math.round(rec.pxArea)} px (${Math.round(rec.pxLen)} px long)`,
    });
  }
  // 2. primitive/draw-call waste
  if (rec.primitives > PRIMITIVES_SMALL_FLAG && rec.pxLen < SMALL_BODY_PX) {
    pushFlag(rel, 'many-primitives-small-body', {
      primitives: rec.primitives, pxLen: rec.pxLen, effort: 'medium', saveBytesEq: 0,
      note: `${rec.primitives} draws on a ${Math.round(rec.pxLen)} px body`,
    });
  }
  if (rec.primitivesPerMaterialMax >= MERGEABLE_MATERIAL_PRIMS) {
    const dynamicPrimitives = rec.dynamicPrimitives || 0;
    const mergeable = Math.max(0, rec.primitives - dynamicPrimitives - rec.materials);
    if (mergeable >= MERGEABLE_MATERIAL_PRIMS) {
      pushFlag(rel, 'mergeable-draws', {
        primitives: rec.primitives, materials: rec.materials, mergeableDraws: mergeable,
        saveBytesEq: mergeable * DRAW_CALL_BYTES_EQ, effort: 'low',
        note: `${rec.primitivesPerMaterialMax} primitives share one material`
          + (dynamicPrimitives ? `, ${dynamicPrimitives} of them on dynamic-role nodes the runtime addresses individually` : '')
          + ' (the runtime\'s rigid-opaque BatchedMesh pool absorbs eligible statics; canopies, decals, nav lights, transparents and dynamic hulls still draw one by one)',
      });
    }
  }
  // 3. texture waste — sized against the closest normal gameplay framing (chase-close
  //    zoom 58), so a hero place that legitimately needs 4096 px does not flag.
  if (rec.textureMaxEdge > 0) {
    const neededEdge = clamp(2 * Math.max(rec.pxLen, rec.pxLenClose || 0), 256, 4096);
    if (rec.textureMaxEdge > neededEdge) {
      const factor = rec.textureMaxEdge / neededEdge;
      const saveable = rec.textureBytesEst * (1 - 1 / (factor * factor));
      pushFlag(rel, 'texture-oversize', {
        maxEdge: rec.textureMaxEdge, neededEdge: Math.round(neededEdge), pxLen: rec.pxLen,
        saveBytesEq: Math.max(0, saveable), effort: 'low',
        note: `${rec.textureMaxEdge} px textures on a ${Math.round(rec.pxLen)} px body (closest framing ${Math.round(rec.pxLenClose || rec.pxLen)} px)`,
      });
    }
    const uncompressed = rec.images.filter((i) => i.format === 'PNG' || i.format === 'JPEG');
    if (uncompressed.length) {
      const save = uncompressed.reduce((acc, i) => acc + (i.decodedBytes || 0) * 0.75, 0);
      pushFlag(rel, 'uncompressed-textures', {
        count: uncompressed.length, formats: [...new Set(uncompressed.map((i) => i.format))],
        saveBytesEq: save, effort: 'low',
        note: 'release contract is KTX2/BasisU (release_manifest contract)',
      });
    }
  }
  // 4. crowd bodies with no lower LOD
  if (CROWD_FAMILIES.has(rec.family)) {
    const hasLod1 = rec.censusLod1 || rec.lodSiblings.some((s) => /(_|-)lod1$/i.test(s)) || rec.lodTris.lod1 > 0;
    const hasLod2 = rec.censusLod2 || rec.lodSiblings.some((s) => /(_|-)lod2$/i.test(s)) || rec.lodTris.lod2 > 0;
    if (!hasLod1 && !hasLod2) {
      pushFlag(rel, 'no-lod-crowd', {
        activeTris: rec.activeTris, pxLenCrowd: rec.pxLenCrowd, effort: 'high', saveBytesEq: 0,
        note: `crowd body (${rec.family}), ${fmtNum(rec.activeTris)} tris, no lod1/lod2 anywhere`,
      });
    }
  }
  // 5. prop triangle spikes
  if (['place', 'pod', 'wreck', 'buoy', 'sign', 'drone'].includes(rec.family) && rec.activeTris > 60000) {
    pushFlag(rel, 'prop-triangle-spike', {
      activeTris: rec.activeTris, pxLen: rec.pxLen, effort: 'medium',
      saveBytesEq: Math.max(0, rec.activeTris - 12000) * BYTES_PER_TRI,
      note: `${fmtNum(rec.activeTris)} tris on a ${rec.family} (${Math.round(rec.pxLen)} px)`,
    });
  }
}

// ---- cheapest big wins: savings ranked by byte-equivalent / effort weight
const wins = [];
const addWin = (rel, change, saved, effort, units, detail) => {
  wins.push({ path: rel, family: records.get(rel).family, change, saved, effort, units, detail, score: saved / EFFORT[effort] });
};
const flagKinds = new Map();
for (const f of flags) {
  if (f.kind === 'parse-failed' || f.kind === 'zero-triangles') continue;
  const list = flagKinds.get(f.path + '|' + f.kind) || [];
  list.push(f);
  flagKinds.set(f.path + '|' + f.kind, list);
}
for (const [key, list] of flagKinds) {
  const rel = key.split('|')[0];
  const kind = key.split('|')[1];
  const f = list[0];
  const savedBytesEq = list.reduce((acc, x) => acc + (x.saveBytesEq || 0), 0);
  if (!savedBytesEq) continue;
  const savedLabel = kind === 'texture-oversize' || kind === 'uncompressed-textures'
    ? `${fmtBytes(savedBytesEq)} GPU texture residency`
    : kind === 'mergeable-draws'
      ? `${list.reduce((a, x) => a + (x.mergeableDraws || 0), 0)} draw calls/frame`
      : `${fmtNum(savedBytesEq / BYTES_PER_TRI)} triangles`;
  addWin(rel, kind, savedBytesEq, f.effort || 'medium', savedLabel, f.note || '');
}
// dead weight: unreferenced files are pure disk/download weight (repo + any bundle that
// blindly ships the folder). Counted separately from drawn-cost savings.
const deadWeight = diskFiles
  .map((rel) => records.get(rel))
  .filter((r) => r.route === 'unreferenced');
const deadByFolder = new Map();
for (const r of deadWeight) {
  const dir = r.path.split('/').slice(0, -1).join('/');
  const agg = deadByFolder.get(dir) || { count: 0, bytes: 0 };
  agg.count += 1;
  agg.bytes += r.bytes;
  deadByFolder.set(dir, agg);
}
wins.sort((a, b) => b.score - a.score);
const topWins = wins.slice(0, TOP_N);

// ---------------------------------------------------------------- summary
const runtimeRecs = diskFiles.map((r) => records.get(r)).filter((r) => r.route === 'runtime');
const drawnRecs = runtimeRecs.filter((r) => !r.supersededByPackage); // what actually draws (packages replace their sources)
const authoringRecs = diskFiles.map((r) => records.get(r)).filter((r) => r.route === 'authoring');
const unreferencedRecs = deadWeight;
const sum = (arr, f) => arr.reduce((acc, r) => acc + (f(r) || 0), 0);
const familyAgg = new Map();
for (const r of drawnRecs) {
  if (!Number.isFinite(r.worldLen)) continue;
  const agg = familyAgg.get(r.family) || { count: 0, pxLen: [], trisPerPx: [], tris: [], prims: [] };
  agg.count += 1;
  agg.pxLen.push(r.pxLen);
  if (Number.isFinite(r.trisPerPx)) agg.trisPerPx.push(r.trisPerPx);
  agg.tris.push(r.activeTris);
  agg.prims.push(r.primitives);
  familyAgg.set(r.family, agg);
}

const L = [];
L.push('# What every model costs to draw — SpaceFace asset cost audit');
L.push('');
L.push(`Generated by \`scripts/audit-asset-cost.mjs\` on ${new Date().toISOString().slice(0, 10)}; `
  + `${diskFiles.length} GLB files on disk, ${records.size} parsed, `
  + `${diskFiles.filter((p) => records.get(p).parseError).length} parse failures, `
  + `${((Date.now() - t0) / 1000).toFixed(1)} s.`);
L.push('');
L.push('## How the on-screen size is estimated (the formula, stated)');
L.push('');
L.push('- Camera (live defaults, `src/core/gameState.js` + `src/render/tabletopPolicy.js`): '
  + 'fov 50°, tilt 60°, default zoom distance 144 WU (chase-close 58; manual 45–330; '
  + 'speed zoom widens cruise to ×1.35).');
L.push(`- px per WU = 1080 / (2 · D · tan(25°)) = **${pxPerWuAt(DEFAULT_ZOOM).toFixed(2)} px/WU** at D=144 `
  + `(the game's own fragment-family comment quotes ~5.96 px/WU on 1280×800 — same formula at the smaller height).`);
L.push("- A body's length projects at ×sin(60°)=0.866 (tilt foreshortening); footprint area = pxLen·pxWid.");
L.push('- Drawn world size per body: `src/data/modelTruthCensus.json` `worldSize` (measured through the '
  + 'same loader fits the game uses — ships 24–58 WU, places 1:1 authored metres→WU, stations ~180 WU).');
L.push('- The active LOD is **LOD0 for hulls that do not demote**: whole-ship runtime demotion is ON '
  + 'for anonymous hostile ships (`WHOLE_SHIP_LOD_RUNTIME_DEMOTION=true` with the single-frame safe '
  + 'swap, `src/render/wholeShipLodPolicy.js`); player, named, mission and traffic hulls stay LOD0, '
  + 'and only a <32 px spawn speck may start on lod2. Render packages carry LOD0+LOD1+LOD2 in one '
  + 'GLB; only the admitted LOD meshes draw.');
L.push('- Crowd bodies (Swarm waves) are also costed at a typical 300 WU engagement slant range '
  + `(${pxPerWuAt(CROWD_SLANT_WU).toFixed(2)} px/WU there); waves carry 6–14 bodies, median 10 `
  + '(`src/data/survivalWaves.js`). The mass enemy (wasp_swarmer, 540 spawns) wears the ashline_dart hull.');
L.push(`- Texture waste is sized against the closest normal gameplay framing (chase-close zoom ${CHASE_CLOSE} WU) `
  + 'so hero places that legitimately fill the glass at close range are not flagged.');
L.push('');

L.push('## Totals');
L.push('');
L.push(`| route | files | bytes | tris | textures (decoded est.) |`);
L.push(`|---|---|---|---|---|`);
L.push(`| runtime (game can load) | ${runtimeRecs.length} | ${fmtBytes(sum(runtimeRecs, (r) => r.bytes))} | ${fmtNum(sum(runtimeRecs, (r) => r.triangles))} | ${fmtBytes(sum(runtimeRecs, (r) => r.textureBytesEst))} |`);
L.push(`| ─ of which what actually draws (render packages replace their sources) | ${drawnRecs.length} | ${fmtBytes(sum(drawnRecs, (r) => r.bytes))} | ${fmtNum(sum(drawnRecs, (r) => r.activeTris))} LOD0 | ${fmtBytes(sum(drawnRecs, (r) => r.textureBytesEst))} |`);
L.push(`| authoring (manifest inputs) | ${authoringRecs.length} | ${fmtBytes(sum(authoringRecs, (r) => r.bytes))} | ${fmtNum(sum(authoringRecs, (r) => r.triangles))} | ${fmtBytes(sum(authoringRecs, (r) => r.textureBytesEst))} |`);
L.push(`| tooling-referenced | ${diskFiles.filter((p) => records.get(p).route === 'tooling').length} | ${fmtBytes(sum(diskFiles.map((p) => records.get(p)).filter((r) => r.route === 'tooling'), (r) => r.bytes))} | — | — |`);
L.push(`| unreferenced (dead weight) | ${unreferencedRecs.length} | ${fmtBytes(sum(unreferencedRecs, (r) => r.bytes))} | ${fmtNum(sum(unreferencedRecs, (r) => r.triangles))} | — |`);
L.push('');
L.push('Runtime files by kind: '
  + Object.entries(runtimeRecs.reduce((m, r) => { m[r.family] = (m[r.family] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
L.push('');
L.push('## Per-family cost at the default camera (drawn bodies: render packages + unpackaged runtime, census-sized)');
L.push('');
L.push('| family | bodies | px length (median) | tris on screen (median) | tris per px (median / p75 / worst) |');
L.push('|---|---|---|---|---|');
const famRows = [...familyAgg.entries()].sort((a, b) => median(b[1].trisPerPx || []) - median(a[1].trisPerPx || []));
for (const [fam, agg] of famRows) {
  const worst = Math.max(...agg.trisPerPx.filter(Number.isFinite), 0);
  L.push(`| ${fam} | ${agg.count} | ${Math.round(median(agg.pxLen) || 0)} | ${fmtNum(median(agg.tris) || 0)} | `
    + `${(median(agg.trisPerPx) || 0).toFixed(2)} / ${(p75(agg.trisPerPx) || 0).toFixed(2)} / ${worst.toFixed(2)} |`);
}
L.push('');

const flagList = (kind, columns) => {
  const list = flags.filter((f) => f.kind === kind).sort((a, b) => (b.saveBytesEq || 0) - (a.saveBytesEq || 0));
  if (!list.length) { L.push(`- none found`); return; }
  for (const f of list.slice(0, 40)) {
    L.push(`- ${columns(f)}`);
  }
  if (list.length > 40) L.push(`- … and ${list.length - 40} more (see JSON)`);
  L.push(`- **total flagged: ${list.length}**`);
};

L.push('## Waste: triangles per on-screen pixel ≥ 1.5 (LOD0 always in use)');
L.push('');
flagList('tris-per-px', (f) => `**${f.path}** (${f.family}) — ${f.trisPerPx.toFixed(1)} tris/px: ${f.note}; crowd-size value ${
  Number.isFinite(records.get(f.path).trisPerPxCrowd) ? `${records.get(f.path).trisPerPxCrowd.toFixed(1)} tris/px` : 'n/a'}.`);
L.push('');

L.push(`## Waste: more than ${PRIMITIVES_SMALL_FLAG} primitives on a body under ${SMALL_BODY_PX} px`);
L.push('');
flagList('many-primitives-small-body', (f) => `**${f.path}** (${f.family}) — ${f.note}.`);
L.push('');

L.push(`## Waste: primitives sharing one material (mergeable draws, ≥ ${MERGEABLE_MATERIAL_PRIMS} on one material)`);
L.push('');
flagList('mergeable-draws', (f) => `**${f.path}** (${f.family}) — ${f.primitives} primitives / ${f.materials} materials; ${f.note}.`);
L.push('');

L.push('## Waste: textures bigger than the body can show, or uncompressed');
L.push('');
flagList('texture-oversize', (f) => `**${f.path}** (${f.family}) — ${f.note}; needed edge ≈ ${f.neededEdge} px.`);
flagList('uncompressed-textures', (f) => `**${f.path}** (${f.family}) — ${f.count} ${f.formats.join('/')} image(s); ${f.note}.`);
L.push('');

L.push('## Waste: crowd bodies with no lower LOD (Swarm enemies, traffic, rocks, debris)');
L.push('');
flagList('no-lod-crowd', (f) => `**${f.path}** (${f.family}) — ${f.note}.`);
L.push('');

L.push('## Oddities');
L.push('');
const odd = flags.filter((f) => ['zero-triangles', 'duplicate-geometry', 'skinned-crowd-body', 'prop-triangle-spike', 'parse-failed'].includes(f.kind));
if (!odd.length) L.push('- none found');
else for (const f of odd.slice(0, 60)) L.push(`- ${f.kind}: **${f.path}** — ${f.note || ''}`);
if (odd.length > 60) L.push(`- … and ${odd.length - 60} more (see JSON)`);
L.push('');

L.push('## Heaviest twenty (what actually draws)');
L.push('');
const heavyTri = [...drawnRecs].filter((r) => Number.isFinite(r.activeTris)).sort((a, b) => b.activeTris - a.activeTris).slice(0, TOP_N);
const heavyPrims = [...drawnRecs].filter((r) => Number.isFinite(r.primitives)).sort((a, b) => b.primitives - a.primitives).slice(0, TOP_N);
const heavyTex = [...drawnRecs].filter((r) => r.textureBytesEst > 0).sort((a, b) => b.textureBytesEst - a.textureBytesEst).slice(0, TOP_N);
L.push('**by triangles on screen (active LOD0)**');
for (const r of heavyTri) L.push(`- ${r.path} — ${fmtNum(r.activeTris)} tris (${r.family}, ${Math.round(r.pxLen || 0)} px)`);
L.push('');
L.push('**by primitives (draw calls per body)**');
for (const r of heavyPrims) L.push(`- ${r.path} — ${r.primitives} primitives, ${r.materials} materials (${r.family})`);
L.push('');
L.push('**by decoded texture memory**');
for (const r of heavyTex) L.push(`- ${r.path} — ${fmtBytes(r.textureBytesEst)} (${r.textures} images, max edge ${r.textureMaxEdge}px, ${Object.entries(r.textureFormats).map(([k, v]) => `${k} ${v}`).join(', ')})`);
L.push('');

L.push('## Cheapest big wins (estimated saving ÷ effort)');
L.push('');
L.push('Effort: trivial = delete/dead weight, low = re-encode or flip a switch, medium = re-bake/merge, '
  + 'high = author new geometry. Savings are per body-instance in GPU bytes-equivalent '
  + `(${BYTES_PER_TRI} B/tri, a merged draw valued at ${fmtBytes(DRAW_CALL_BYTES_EQ)}); crowd bodies repeat every wave.`);
L.push('');
if (!topWins.length) L.push('- none found');
for (const w of topWins) {
  L.push(`- **${w.path}** (${w.family}) — ${w.change}: saves ${w.units} [${w.effort} effort]. ${w.detail}`);
}
L.push('');

L.push('## Dead weight: GLB files nothing names');
L.push('');
L.push(`${unreferencedRecs.length} files, ${fmtBytes(sum(unreferencedRecs, (r) => r.bytes))} total.`);
const deadTop = [...deadByFolder.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 25);
for (const [dir, agg] of deadTop) {
  L.push(`- ${dir} — ${agg.count} files, ${fmtBytes(agg.bytes)}`);
}
if (deadByFolder.size > 25) L.push(`- … and ${deadByFolder.size - 25} more folders (see JSON)`);
L.push('');

L.push('## Systemic findings');
L.push('');
const shipFamilies = runtimeRecs.filter((r) => ['player-hull', 'enemy-hull', 'faction-hull', 'traffic-hull'].includes(r.family) && Number.isFinite(r.trisPerPx));
// parts manifest staleness: a tris row that matches neither the container total nor
// the LOD0 render triangles of its file (the --selfcheck detail prints the rows).
let stalePartsRows = 0;
if (partsManifest) {
  const near = (a, b) => a >= b * 0.98 && a <= b * 1.02;
  for (const p of partsManifest.parts || []) {
    const rec = records.get(`assets/ships/parts/${p.file}`);
    if (!rec || !Number.isFinite(p.tris)) continue;
    const renderTris = rec.lodTris.lod0 + rec.lodTris.core;
    if (!(near(rec.triangles, p.tris) || near(renderTris, p.tris))) stalePartsRows += 1;
  }
}
if (shipFamilies.length) {
  const lod1NeverDrawn = shipFamilies.filter((r) => r.lodTris.lod1 > 0 || r.censusLod1);
  L.push(`- **Whole-ship LOD1 is compiled and shipped, and drawn only by demoting hulls.** ${lod1NeverDrawn.length} of ${shipFamilies.length} `
    + 'hull bodies (player, enemy, faction, traffic) carry authored lod1 — separate files and/or in-package meshes. '
    + 'Runtime demotion is ON for anonymous hostile ships via the single-frame safe swap '
    + '(`WHOLE_SHIP_LOD_RUNTIME_DEMOTION=true`); player, named, mission and traffic hulls still draw their full '
    + 'LOD0 triangle count at any size. Extending demotion to traffic and distant faction hulls — whose lod1 '
    + 'triangles are already paid for — is the open win.');
}
const dangling = danglingRefs.filter((d) => !d.raw.includes('assets/...'));
if (dangling.length) {
  L.push(`- **${dangling.length} path-shaped .glb references in src/ resolve to no file on disk** (template suffixes, `
    + 'property accesses and loader suffix joins excluded), e.g. '
    + dangling.slice(0, 5).map((d) => `${d.raw} (${d.at})`).join('; ') + '.');
}
if (stalePartsRows > 0) {
  L.push(`- **${stalePartsRows} parts_manifest tris rows are stale**: the row matches neither the file's container total `
    + 'nor its LOD0 render triangles (e.g. places/place_conveyor_truss: row 5048, file lod0 5336 / container 7908). '
    + '`node scripts/check-parts-manifest.mjs --sync` re-pins them; several other rows count one of the two '
    + 'definitions and several the other, so the manifest field is not one consistent measure today.');
}
const parseFail = diskFiles.filter((p) => records.get(p).parseError);
if (parseFail.length) {
  L.push(`- **${parseFail.length} files failed container parse**, e.g. `
    + parseFail.slice(0, 5).map((p) => `${p} (${records.get(p).parseError})`).join('; ') + '.');
}
L.push('');

// ---------------------------------------------------------------- self-check
if (SELFCHECK) {
  const lines = ['SELF-CHECK (parsed counts vs machine manifests)', ''];
  let trisOk = 0; let trisBad = [];
  if (census) {
    for (const [url, rows] of censusByPath) {
      const rec = records.get(url);
      if (!rec || rec.parseError) continue;
      for (const row of rows) {
        if (Number.isFinite(row.triangles) && row.triangles > 0) {
          // census tris counts visible meshes; our count includes helpers/collision meshes —
          // accept >= census (we should never be UNDER the census count).
          if (rec.triangles >= row.triangles * 0.98) trisOk += 1;
          else trisBad.push({ url, ours: rec.triangles, census: row.triangles });
        }
      }
    }
  }
  lines.push(`census triangle cross-check: ${trisOk} rows consistent, ${trisBad.length} under census`);
  for (const b of trisBad.slice(0, 10)) lines.push(`  under: ${b.url} ours=${b.ours} census=${b.census}`);
  let bytesOk = 0; let bytesBad = 0;
  if (releaseManifest) {
    for (const a of releaseManifest.assets || []) {
      if (!a.release) continue;
      const rec = records.get(a.release);
      if (!rec) continue;
      if (Math.abs(rec.bytes - (a.releaseBytes || 0)) <= 1) bytesOk += 1; else bytesBad += 1;
    }
  }
  lines.push(`release byte cross-check: ${bytesOk} match, ${bytesBad} mismatch`);
  let partsOk = 0; let partsBad = [];
  if (partsManifest) {
    for (const p of partsManifest.parts || []) {
      const rec = records.get(`assets/ships/parts/${p.file}`);
      if (!rec || !Number.isFinite(p.tris)) continue;
      // The parts manifest is inconsistent about what its tris row counts: some rows
      // match the visible LOD0 render triangles, others the whole container (helper +
      // lod1/lod2 sub-meshes included). Count a row consistent if it matches either;
      // anything else is a stale manifest row, not a parser error.
      const renderTris = rec.lodTris.lod0 + rec.lodTris.core;
      const near = (a, b) => a >= b * 0.98 && a <= b * 1.02;
      if (near(rec.triangles, p.tris) || near(renderTris, p.tris)) partsOk += 1;
      else partsBad.push({ file: p.file, lod0: renderTris, container: rec.triangles, manifest: p.tris });
    }
  }
  partsBad.sort((a, b) => Math.abs(b.ours - b.manifest) - Math.abs(a.ours - a.manifest));
  lines.push(`parts manifest tris cross-check (±2%, lod0 or container): ${partsOk} in band, ${partsBad.length} stale rows (consistent ~300-tri helper exclusion on most)`);
  for (const b of partsBad.slice(0, 12)) lines.push(`  stale row: ${b.file} manifest=${b.manifest} but file has lod0=${b.lod0} / container=${b.container}`);
  lines.push('');
  for (const line of lines) console.log(line);
}

// ---------------------------------------------------------------- outputs
const table = diskFiles.map((rel) => {
  const rec = records.get(rel);
  return {
    path: rel,
    route: rec.route,
    family: rec.family,
    refSources: rec.refSources,
    supersededByPackage: rec.supersededByPackage || false,
    packageKey: rec.packageKey,
    lodSiblings: rec.lodSiblings,
    bytes: rec.bytes,
    meshes: rec.meshes,
    primitives: rec.primitives,
    triangles: rec.triangles,
    activeTris: Number.isFinite(rec.activeTris) ? rec.activeTris : null,
    lodTris: rec.lodTris,
    vertices: rec.vertices,
    materials: rec.materials,
    duplicateMaterialGroups: rec.duplicateMaterialGroups,
    primitivesPerMaterialMax: rec.primitivesPerMaterialMax,
    textures: rec.textures,
    textureBytesEst: rec.textureBytesEst,
    textureMaxEdge: rec.textureMaxEdge,
    textureFormats: rec.textureFormats,
    images: rec.images,
    skins: rec.skins,
    animations: rec.animations,
    morphTargets: rec.morphTargets,
    nodes: rec.nodes,
    boundsSizeModelUnits: rec.boundsSize,
    boundsCaveat: rec.boundsCaveat,
    worldLenWu: rec.worldLen ?? null,
    worldLenRangeWu: Number.isFinite(rec.worldLenMin) ? [rec.worldLenMin, rec.worldLenMax] : null,
    pxLen: Number.isFinite(rec.pxLen) ? Math.round(rec.pxLen) : null,
    pxLenClose: Number.isFinite(rec.pxLenClose) ? Math.round(rec.pxLenClose) : null,
    pxLenCrowd: Number.isFinite(rec.pxLenCrowd) ? Math.round(rec.pxLenCrowd) : null,
    trisPerPx: Number.isFinite(rec.trisPerPx) ? Number(rec.trisPerPx.toFixed(3)) : null,
    trisPerPxCrowd: Number.isFinite(rec.trisPerPxCrowd) ? Number(rec.trisPerPxCrowd.toFixed(3)) : null,
    censusLod1: rec.censusLod1 ?? null,
    censusLod2: rec.censusLod2 ?? null,
    extensions: rec.extensions,
    duplicateGeometryGroups: rec.duplicateGeometryGroups,
    parseError: rec.parseError,
    flags: rec.flags || [],
  };
});

if (JSON_OUT) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(dirname(resolvePath(JSON_OUT)), { recursive: true });
  writeFileSync(resolvePath(JSON_OUT), JSON.stringify({
    generatedAt: new Date().toISOString(),
    constants: {
      screen: `${SCREEN_W}x${SCREEN_H}`,
      fovDeg: FOV_DEG,
      tiltDeg: TILT_DEG,
      defaultZoomWu: DEFAULT_ZOOM,
      chaseCloseZoomWu: CHASE_CLOSE,
      speedZoomMax: SPEED_ZOOM_MAX,
      pxPerWuAtDefaultZoom: Number(pxPerWuAt(DEFAULT_ZOOM).toFixed(3)),
      crowdSlantWu: CROWD_SLANT_WU,
      pxPerWuAtCrowd: Number(pxPerWuAt(CROWD_SLANT_WU).toFixed(3)),
      bytesPerTriEstimate: BYTES_PER_TRI,
      drawCallBytesEq: DRAW_CALL_BYTES_EQ,
      lodPolicy: 'whole-ship runtime demotion OFF; LOD0 always drawn; <32px spawn specks may start lod2',
    },
    totals: {
      filesOnDisk: diskFiles.length,
      runtime: { files: runtimeRecs.length, bytes: sum(runtimeRecs, (r) => r.bytes) },
      drawn: { files: drawnRecs.length, bytes: sum(drawnRecs, (r) => r.bytes), lod0Tris: sum(drawnRecs, (r) => (Number.isFinite(r.activeTris) ? r.activeTris : 0)) },
      authoring: { files: authoringRecs.length, bytes: sum(authoringRecs, (r) => r.bytes) },
      unreferenced: { files: unreferencedRecs.length, bytes: sum(unreferencedRecs, (r) => r.bytes) },
    },
    families: Object.fromEntries(famRows.map(([fam, agg]) => [fam, {
      count: agg.count,
      pxLenMedian: Math.round(median(agg.pxLen) || 0),
      trisPerPxMedian: Number((median(agg.trisPerPx) || 0).toFixed(3)),
      trisPerPxp75: Number((p75(agg.trisPerPx) || 0).toFixed(3)),
    }])),
    flags,
    wins: wins.slice(0, 100),
    deadWeightByFolder: Object.fromEntries([...deadByFolder.entries()].sort((a, b) => b[1].bytes - a[1].bytes)),
    danglingRefs,
    table,
  }, null, 2));
  console.log(`json table written: ${JSON_OUT}`);
}
if (MD_OUT) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(dirname(resolvePath(MD_OUT)), { recursive: true });
  writeFileSync(resolvePath(MD_OUT), L.join('\n') + '\n');
  console.log(`summary written: ${MD_OUT}`);
}
// Summary goes to stdout unless this is a bare --selfcheck run (check lines only).
if (!SELFCHECK || JSON_OUT || MD_OUT) console.log(L.join('\n'));
