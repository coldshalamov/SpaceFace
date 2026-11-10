// Texture residency census — walks every assets/**/render.glb, parses
// embedded KTX2 headers (levelCount, dims, vkFormat, supercompression,
// level index) and non-KTX2 images (png/jpg → RGBA8 on GPU). Estimates
// per-texture GPU bytes at the two plausible transcode targets, flags
// mip chains carried on non-mipmap samplers (pure GPU waste), and ranks
// packages by estimated resident bytes. Companion evidence tool for the
// w4-vtex residency audit (design/perf/w4-vtex-REPORT.md).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (e === 'render.glb') yield p;
  }
}

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not glb');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  let off = 20 + jsonLen;
  let bin = null;
  if (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x004e4942) bin = buf.subarray(off + 8, off + 8 + len);
  }
  return { json, bin };
}

function ktx2Header(buf) {
  const magic = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 12; i++) if (buf[i] !== magic[i]) return null;
  const u32 = (o) => buf.readUInt32LE(o);
  const levelCount = u32(40);
  const levels = [];
  let off = 80; // 17*4 + 12 identifier = 80? header is 68 bytes + 12 ident = 80
  for (let i = 0; i < levelCount; i++) {
    const byteOffset = Number(buf.readBigUInt64LE(off));
    const byteLength = Number(buf.readBigUInt64LE(off + 8));
    const uncompressedByteLength = Number(buf.readBigUInt64LE(off + 16));
    levels.push({ byteOffset, byteLength, uncompressedByteLength });
    off += 24;
  }
  return {
    vkFormat: u32(12), typeSize: u32(16),
    width: u32(20), height: u32(24), depth: u32(28),
    layerCount: u32(32), faceCount: u32(36),
    levelCount, supercompression: u32(44), levels,
  };
}

// GPU bytes for a mip level of dims w,h at 4x4 block formats
const lvl = (w, h, bpb) => Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * bpb;
function chainBytes(w, h, levels, bpb) {
  let sum = 0;
  for (let i = 0; i < levels; i++) {
    sum += lvl(w >> i || 1, h >> i || 1, bpb);
  }
  return sum;
}

const pkgs = [];
let totKtx2 = 0, totPng = 0, totTex = 0;
let bc1Sum = 0, bc7Sum = 0, rgbaSum = 0;
let topLevelShare = { bc7: 0, total: 0 };
const nonMipSamplers = [];
const hugeNonKtx2 = [];

for (const glbPath of walk(join(ROOT, 'assets'))) {
  const buf = readFileSync(glbPath);
  const { json, bin } = parseGlb(buf);
  const images = json.images || [];
  const textures = json.textures || [];
  const samplers = json.samplers || [];
  const pkg = {
    path: relative(ROOT, glbPath),
    ktx2: 0, png: 0, totalTex: 0,
    bc7Bytes: 0, bc1Bytes: 0, rgbaBytes: 0,
    ktx2Levels: 0, samplerNonMip: 0,
  };
  for (let ti = 0; ti < textures.length; ti++) {
    const tdef = textures[ti];
    const basisu = tdef.extensions && tdef.extensions.KHR_texture_basisu;
    const srcIdx = basisu ? basisu.source : tdef.source;
    if (srcIdx === undefined || !images[srcIdx]) continue;
    const img = images[srcIdx];
    const sampler = samplers[tdef.sampler] || {};
    const minFilter = sampler.minFilter ?? 9729;
    const mipmapped = ![9728, 9729].includes(minFilter);
    if (!mipmapped) pkg.samplerNonMip++;
    if (img.bufferView !== undefined) {
      const bv = json.bufferViews[img.bufferView];
      const slice = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
      const k = img.mimeType === 'image/ktx2' || basisu ? ktx2Header(slice) : null;
      pkg.totalTex++;
      if (k) {
        pkg.ktx2++;
        pkg.ktx2Levels += k.levelCount;
        // transcode targets: color → BC7(16bpb)/ASTC(16)/ETC2_RGBA(16); alpha-less → could be BC1(8)
        // assume worst-common-case 16 bpb, also record 8 bpb
        pkg.bc7Bytes += chainBytes(k.width, k.height, k.levelCount, 16);
        pkg.bc1Bytes += chainBytes(k.width, k.height, k.levelCount, 8);
        topLevelShare.bc7 += lvl(k.width, k.height, 16);
        topLevelShare.total += chainBytes(k.width, k.height, k.levelCount, 16);
        if (!mipmapped && k.levelCount > 1) {
          nonMipSamplers.push({ pkg: pkg.path, tex: tdef.name || img.name || `#${ti}`, w: k.width, h: k.height, levels: k.levelCount });
        }
      } else {
        // png/jpg embedded → GPU gets RGBA8 + generated mips (assume mipmapped)
        pkg.png++;
        // we don't know dims without decoding png; flag file size floor
        hugeNonKtx2.push({ pkg: pkg.path, name: img.name || '', mime: img.mimeType, fileBytes: bv.byteLength, mipmapped });
      }
    }
  }
  bc1Sum += pkg.bc1Bytes; bc7Sum += pkg.bc7Bytes;
  totKtx2 += pkg.ktx2; totPng += pkg.png; totTex += pkg.totalTex;
  pkgs.push(pkg);
}

pkgs.sort((a, b) => b.bc7Bytes - a.bc7Bytes);
const MiB = (n) => (n / 1048576).toFixed(2);
console.log(`packages scanned: ${pkgs.length}`);
console.log(`textures: ${totTex} (ktx2 ${totKtx2}, non-ktx2 ${totPng})`);
console.log(`GPU bytes if BC7/ASTC16bpb: ${MiB(bc7Sum)} MiB; if BC1 8bpb: ${MiB(bc1Sum)} MiB`);
console.log(`mip0 share of chain (bc7): ${MiB(topLevelShare.bc7)} / ${MiB(topLevelShare.total)} = ${(100 * topLevelShare.bc7 / Math.max(1, topLevelShare.total)).toFixed(1)}%`);
console.log(`\ntextures w/ NON-MIP sampler but ktx2 ships >1 level (pure waste):`);
for (const r of nonMipSamplers.slice(0, 30)) console.log('  ', JSON.stringify(r));
console.log(`count: ${nonMipSamplers.length}`);
console.log(`\nnon-ktx2 images (RGBA8 on GPU, 4B/px + mips):`);
hugeNonKtx2.sort((a, b) => b.fileBytes - a.fileBytes);
for (const r of hugeNonKtx2.slice(0, 30)) console.log('  ', JSON.stringify(r));
console.log(`count: ${hugeNonKtx2.length}`);
console.log(`\ntop packages by est. GPU tex bytes (bc7):`);
for (const p of pkgs.slice(0, 15)) console.log(`  ${MiB(p.bc7Bytes)} MiB  ${p.ktx2}ktx2/${p.totalTex}tex lvls=${p.ktx2Levels} nonMipSmp=${p.samplerNonMip} ${p.path}`);
const dist = {};
for (const p of pkgs) dist[p.bc7Bytes > 4 * 1048576 ? '>4MiB' : p.bc7Bytes > 1048576 ? '1-4MiB' : p.bc7Bytes > 262144 ? '256K-1MiB' : '<256K'] = (dist[p.bc7Bytes > 4 * 1048576 ? '>4MiB' : p.bc7Bytes > 1048576 ? '1-4MiB' : p.bc7Bytes > 262144 ? '256K-1MiB' : '<256K'] || 0) + 1;
console.log('\nsize dist:', JSON.stringify(dist));
