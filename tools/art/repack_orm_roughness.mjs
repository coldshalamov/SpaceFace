// Author the ROUGHNESS channel of a packed ORM from the occlusion bake already inside it.
//
// The defect this repairs
// -----------------------
// The ten kit hulls ship a correctly packed ORM — occlusionTexture and metallicRoughnessTexture
// point at the same image, R = occlusion, G = roughness, B = metallic, exactly per glTF. The R
// channel carries a real per-material Blender AO bake: on hull_starter its standard deviation is
// 0.3684, matching `textures/hull_starter/Material_Hull_ao_1k.png` to four decimal places.
//
// The G channel is a single constant. Every hull, every material. 1024x1024 texels storing one
// number.
//
// So the geometry-derived surface information was authored, baked, and shipped — into the channel
// that only modulates ambient light. The channel that decides specular response, and therefore
// whether a surface reads as metal or as plastic, got a flat class value. That is the measurable
// half of "the ship reads as flat plastic": a constant roughness gives a constant specular
// response no matter how good the base colour is.
//
// What this tool does
// -------------------
// Derives a roughness field from two sources and writes it to G only. R and B are copied byte-for-
// byte, so occlusion and metalness are provably untouched.
//
//   1. CAVITY TERM (geometry-derived, the important one). Recessed geometry collects dirt, salt and
//      oxidation and reads rougher; exposed faces get handled, scuffed and wiped and read smoother.
//      AO is already a cavity measure, so roughness moves opposite to it. This is standard PBR
//      authoring practice, not an invention — it is why AO and roughness maps of the same asset
//      look like inverses of each other.
//
//   2. DETAIL TERM (procedural, fine scale). Multi-octave value noise for micro-surface variation
//      the AO bake is too low-frequency to carry. Deliberately small: it is grain, not the signal.
//      This also covers materials whose AO bake came out nearly flat because the part is convex
//      (hull_gunship's Material_Mechanical bakes at stdev 0.0244), which would otherwise get almost
//      nothing from term 1.
//
// Amplitude is calibrated against a reference already in this repository rather than to taste:
// `engine_ion_small` is an asset the corrected audit measured at roughness stdev 0.2015, and it is
// not among the assets any review has called flat. That is the target band.
//
// What it deliberately does NOT do
// --------------------------------
// No geometry, socket, scale, collision, material-name or texture-role change. Those are frozen for
// the hull kit and this tool cannot alter them: it rewrites image payloads only.
//
// Deterministic: the noise is seeded from the material name, so re-running produces byte-identical
// output and the release hashes stay stable.
//
// Usage:
//   node tools/art/repack_orm_roughness.mjs <glb...>            write in place
//   node tools/art/repack_orm_roughness.mjs --dry-run <glb...>  report only
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

// Below this the G channel carries no usable specular variation and is a repack candidate.
const FLAT_G_STDEV = 0.02;

// Peak-to-peak roughness the cavity term may contribute. 0.34 lands hull materials in the same
// band as the engine_ion_small reference without pushing any texel outside a plausible range.
const CAVITY_AMPLITUDE = 0.34;
// Fine grain. Small on purpose — at parity with the cavity term it reads as noise, not surface.
const DETAIL_AMPLITUDE = 0.075;
// Physically sensible bounds. Nothing in this fleet is a mirror or a blackbody.
const ROUGH_MIN = 0.12;
const ROUGH_MAX = 0.97;

// assets/ships/parts/hulls/hull_x.glb -> assets/ships/parts/textures/hull_x/<Material>_ao_1k.png
// This is the filename contract the existing pipeline already uses; the bake script writes to it.
function sidecarAoPath(glbPath, materialName) {
  const stem = basename(glbPath).replace(/\.glb$/i, '');
  const guess = resolve(dirname(glbPath), '..', 'textures', stem, `${materialName}_ao_1k.png`);
  return existsSync(guess) ? guess : null;
}

function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695040888963407) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

// Four octaves. Tiles are sampled in texel space so the frequency is resolution-independent.
function fbm(u, v, seed) {
  let amp = 0.5;
  let freq = 8;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    sum += valueNoise(u * freq, v * freq, seed + o * 131) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.31; // non-integer so octaves do not align into a visible grid
  }
  return sum / norm;
}

function seedFromName(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 65536;
}

function channelStats(buf, channels, offset, count) {
  let sum = 0;
  for (let i = 0, p = 0; p < count; i += channels, p++) sum += buf[i + offset];
  const mean = sum / count;
  let acc = 0;
  for (let i = 0, p = 0; p < count; i += channels, p++) { const d = buf[i + offset] - mean; acc += d * d; }
  return { mean: mean / 255, stdev: Math.sqrt(acc / count) / 255 };
}

function glbChunks(path) {
  const buf = readFileSync(path);
  let offset = 12;
  let json = null;
  let bin = null;
  let jsonRange = null;
  let binRange = null;
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) { json = JSON.parse(buf.slice(offset + 8, offset + 8 + len).toString('utf8')); jsonRange = [offset + 8, offset + 8 + len]; }
    else if (type === 0x004e4942) { bin = buf.slice(offset + 8, offset + 8 + len); binRange = [offset + 8, offset + 8 + len]; }
    offset += 8 + len + ((4 - (len % 4)) % 4);
  }
  return { buf, json, bin, jsonRange, binRange };
}

// Rebuild a GLB from a (possibly resized) JSON + BIN. Chunks are re-padded to 4-byte alignment as
// the container requires; getting this wrong produces a file that loads in some viewers and not
// others, so it is done explicitly rather than by patching lengths in place.
function writeGlb(path, json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const jsonLen = jsonBuf.length + jsonPad;
  const binLen = bin.length + binPad;
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonLen, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBuf.copy(out, 20);
  out.fill(0x20, 20 + jsonBuf.length, 20 + jsonLen); // JSON pads with spaces
  const binHeader = 20 + jsonLen;
  out.writeUInt32LE(binLen, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  bin.copy(out, binHeader + 8);
  out.fill(0, binHeader + 8 + bin.length, binHeader + 8 + binLen); // BIN pads with zeros
  writeFileSync(path, out);
}

async function repackGlb(path, { dryRun = false } = {}) {
  const { json: gltf, bin } = glbChunks(path);
  const report = { asset: basename(path), materials: [], changed: false };
  if (!gltf.materials) return report;

  // imageIndex -> new PNG buffer
  const rewritten = new Map();

  for (const material of gltf.materials) {
    const ref = material.pbrMetallicRoughness?.metallicRoughnessTexture;
    if (!ref) continue;
    const texture = gltf.textures?.[ref.index];
    const source = texture?.source;
    if (source === undefined) continue;
    const image = gltf.images[source];
    if (image.bufferView === undefined) continue;

    const view = gltf.bufferViews[image.bufferView];
    const start = view.byteOffset || 0;
    const bytes = bin.slice(start, start + view.byteLength);

    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const count = width * height;

    const before = channelStats(data, channels, 1, count);
    let ao = channelStats(data, channels, 0, count);
    let aoData = data;
    let aoChannels = channels;
    let aoSource = 'packed-R';

    // Four hulls (frigate, capital, multirole, gunship) ship an ORM whose R channel is ALSO
    // constant — the AO never reached the file. For those, read the freshly baked sidecar produced
    // by tools/blender/bake_hull_ao.py. Falling back only when the packed channel is flat keeps the
    // six hulls that already carry a good bake byte-identical in their occlusion channel.
    if (ao.stdev <= FLAT_G_STDEV) {
      const sidecar = sidecarAoPath(path, material.name);
      if (sidecar) {
        const sc = await sharp(sidecar).raw().toBuffer({ resolveWithObject: true });
        if (sc.info.width === width && sc.info.height === height) {
          const scStats = channelStats(sc.data, sc.info.channels, 0, count);
          if (scStats.stdev > FLAT_G_STDEV) {
            aoData = sc.data; aoChannels = sc.info.channels; ao = scStats; aoSource = 'baked-sidecar';
          }
        }
      }
    }

    const row = { material: material.name, beforeStdev: before.stdev, aoStdev: ao.stdev, aoSource };

    if (before.stdev > FLAT_G_STDEV) { row.skipped = 'already varied'; report.materials.push(row); continue; }

    const baseRough = before.mean;
    const seed = seedFromName(material.name || 'material');
    // Normalise the AO so the cavity term is scaled by how much signal the bake actually has.
    // A convex part whose AO is nearly flat contributes almost nothing here, by design — its
    // variation has to come from the detail term instead of being amplified out of noise.
    const aoSpread = Math.max(ao.stdev, 1e-6);
    const aoScale = Math.min(1, aoSpread / 0.18); // 0.18 ~ a well-occluded bake

    const out = Buffer.from(data);
    for (let p = 0, i = 0; p < count; p++, i += channels) {
      const x = p % width;
      const y = (p / width) | 0;
      const aoN = aoData[p * aoChannels] / 255;
      // Cavity: below-mean AO (recessed) -> rougher. Above-mean (exposed) -> smoother.
      const cavity = (ao.mean - aoN) / aoSpread;             // ~[-3, 3]
      const cavityTerm = Math.max(-1, Math.min(1, cavity * 0.5)) * CAVITY_AMPLITUDE * aoScale;
      const detail = (fbm(x / width, y / height, seed) - 0.5) * 2 * DETAIL_AMPLITUDE;
      const r = Math.max(ROUGH_MIN, Math.min(ROUGH_MAX, baseRough + cavityTerm + detail));
      out[i + 1] = Math.round(r * 255);                       // G only
    }

    const after = channelStats(out, channels, 1, count);
    row.afterStdev = after.stdev;
    row.afterMean = after.mean;
    report.materials.push(row);
    report.changed = true;

    if (!dryRun) {
      const png = await sharp(out, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toBuffer();
      rewritten.set(source, png);
    }
  }

  if (dryRun || !rewritten.size) return report;

  // Rebuild the BIN chunk with the new image payloads. Image bufferViews change length, so every
  // view after them shifts: rebuild all views in order rather than patching offsets.
  const parts = [];
  let cursor = 0;
  for (let vi = 0; vi < gltf.bufferViews.length; vi++) {
    const view = gltf.bufferViews[vi];
    const imgIndex = gltf.images.findIndex((im) => im.bufferView === vi);
    const payload = imgIndex >= 0 && rewritten.has(imgIndex)
      ? rewritten.get(imgIndex)
      : bin.slice(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const pad = (4 - (payload.length % 4)) % 4;
    view.byteOffset = cursor;
    view.byteLength = payload.length;
    parts.push(payload);
    if (pad) parts.push(Buffer.alloc(pad));
    cursor += payload.length + pad;
  }
  const newBin = Buffer.concat(parts);
  gltf.buffers[0].byteLength = newBin.length;
  writeGlb(path, gltf, newBin);
  return report;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const paths = args.filter((a) => !a.startsWith('--'));
if (!paths.length) {
  console.error('usage: node tools/art/repack_orm_roughness.mjs [--dry-run] <glb...>');
  process.exit(2);
}

let touched = 0;
for (const p of paths) {
  const r = await repackGlb(p, { dryRun });
  console.log(`\n=== ${r.asset}${dryRun ? ' (dry run)' : ''} ===`);
  for (const m of r.materials) {
    if (m.skipped) { console.log(`  ${m.material.padEnd(24)} skipped - ${m.skipped} (stdev ${m.beforeStdev.toFixed(4)})`); continue; }
    console.log(`  ${m.material.padEnd(24)} G stdev ${m.beforeStdev.toFixed(4)} -> ${m.afterStdev.toFixed(4)}   (AO signal ${m.aoStdev.toFixed(4)}, mean held ${m.afterMean.toFixed(3)})`);
  }
  if (r.changed) touched++;
}
console.log(`\n${touched}/${paths.length} asset(s) ${dryRun ? 'would be' : 'were'} repacked.`);
