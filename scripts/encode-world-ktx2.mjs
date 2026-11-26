#!/usr/bin/env node
// DEMO-BOOT-1 offline bake: world textures (deep-sky plates, painted planet atlases,
// asteroid rock-family maps) still ship as PNG/JPG — the runtime pays full image
// decode plus a runtime mipgen and an uncompressed RGBA upload for every boot.
// This script encodes each source beside itself as .ktx2 (UASTC + baked mip tail),
// so the runtime loaders can hand the shared KTX2Loader GPU-ready payloads instead.
// Sources stay untouched; the runtime falls back to them when a .ktx2 is absent.
//
//   node scripts/encode-world-ktx2.mjs            # encode everything missing/stale
//   node scripts/encode-world-ktx2.mjs --check    # report what would change, encode nothing
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CHECK_ONLY = process.argv.includes('--check');

const { encodeToKTX2 } = await import('ktx2-encoder');

// Node's encoder wants decoded RGBA; same png-first / jpeg-fallback decode the
// release asset lane uses (scripts/build-place-release-assets.mjs decodeImage).
// UASTC's atomic unit is a 4x4 block: a source whose declared dims are not multiples
// of 4 produces a container whose GL mip-level block math mismatches, so the upload
// throws on a compressed sub-image and the texture samples incomplete (black). Pad
// the decoded frame to a multiple of 4 by REPLICATING the edge row/column — the
// plates and atlases are edge-faded art under ClampToEdge, so a copied edge is the
// correct continuation, not a black band.
function padToBlock4({ width, height, data }) {
  const w4 = Math.ceil(width / 4) * 4;
  const h4 = Math.ceil(height / 4) * 4;
  if (w4 === width && h4 === height) return { width, height, data };
  const out = new Uint8Array(w4 * h4 * 4);
  for (let y = 0; y < height; y++) {
    out.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * w4 * 4);
    const last = data.subarray(y * width * 4 + (width - 1) * 4, y * width * 4 + width * 4);
    for (let x = width; x < w4; x++) out.set(last, y * w4 * 4 + x * 4);
  }
  const lastRow = out.subarray((height - 1) * w4 * 4, height * w4 * 4);
  for (let y = height; y < h4; y++) out.set(lastRow, y * w4 * 4);
  return { width: w4, height: h4, data: out };
}

function imageDecoder(buffer) {
  try {
    const png = PNG.sync.read(Buffer.from(buffer));
    return padToBlock4({ width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength) });
  } catch {
    const jpeg = JPEG.decode(Buffer.from(buffer), { useTArray: true });
    return padToBlock4({ width: jpeg.width, height: jpeg.height, data: new Uint8Array(jpeg.data.buffer, jpeg.data.byteOffset, jpeg.data.byteLength) });
  }
}

// Colour data (albedo, sky paint, planet paint) is sRGB; normal maps are linear data.
// Mirrors the loaders' own colorSpace assignment so the GPU sees identical texels.
// isYFlip bakes the rows bottom-first: compressed textures upload with flipY=false, so
// file row 0 must be the image BOTTOM to match the raster path's UNPACK_FLIP_Y upload.
const SRGB = Object.freeze({
  isUASTC: true,
  isInputSRGB: true,
  isSetKTX2SRGBTransferFunc: true,
  isYFlip: true,
  generateMipmap: true,
  qualityLevel: 150,
});
const LINEAR = Object.freeze({ ...SRGB, isInputSRGB: false, isSetKTX2SRGBTransferFunc: false });

const SURFACES = 'assets/ships/release/surfaces/asteroid-families';
const JOBS = [
  // Deep-sky plates — the largest uncompressed uploads in the boot path (8–11 MB RGBA each).
  { src: 'assets/background/helios-amber-estuary.png', opts: SRGB },
  { src: 'assets/background/deep-sky/core-lantern-shelf.png', opts: SRGB },
  { src: 'assets/background/deep-sky/belt-ochre-shoal.png', opts: SRGB },
  { src: 'assets/background/deep-sky/anomaly-cold-halo.png', opts: SRGB },
  { src: 'assets/background/deep-sky/sector-skies/sky_helios_orbital_void.png', opts: SRGB },
  { src: 'assets/background/deep-sky/sector-skies/sky_core_trade_constellation.png', opts: SRGB },
  { src: 'assets/background/deep-sky/sector-skies/sky_belt_broken_dust_lane.png', opts: SRGB },
  { src: 'assets/background/deep-sky/sector-skies/sky_fringe_tidal_filament.png', opts: SRGB },
  { src: 'assets/background/deep-sky/sector-skies/sky_anomaly_electromagnetic_scar.png', opts: SRGB },
  { src: 'assets/background/deep-sky/sector-skies/sky_galactic_spur.png', opts: SRGB },
  { src: 'assets/background/deep-sky/sky-fringe-pale-ice-shelf.png', opts: SRGB },
  { src: 'assets/background/deep-sky/sky-ashfall-burn-front.png', opts: SRGB },
  // Painted planet + ring atlases (sRGB).
  { src: 'assets/background/quiet-planets.png', opts: SRGB },
  { src: 'assets/background/quiet-planets-2.png', opts: SRGB },
  { src: 'assets/background/quiet-ringed-planet.png', opts: SRGB },
  { src: 'assets/background/quiet-ringed-planet-2.png', opts: SRGB },
  // Rock family maps: albedo/emissive sRGB, normals linear.
  { src: `${SURFACES}/metal_basecolor.jpg`, opts: SRGB },
  { src: `${SURFACES}/metal_normal.png`, opts: LINEAR },
  { src: `${SURFACES}/crystal_basecolor.jpg`, opts: SRGB },
  { src: `${SURFACES}/crystal_normal.png`, opts: LINEAR },
  { src: `${SURFACES}/crystal_emissive.jpg`, opts: SRGB },
  { src: `${SURFACES}/exotic_basecolor.jpg`, opts: SRGB },
  { src: `${SURFACES}/exotic_normal.png`, opts: LINEAR },
  { src: `${SURFACES}/exotic_emissive.jpg`, opts: SRGB },
  // Common-rock packed maps (albedo sRGB; normal + packed ORM are linear data).
  { src: 'assets/ships/release/surfaces/common-rock/rock_basecolor.png', opts: SRGB },
  { src: 'assets/ships/release/surfaces/common-rock/rock_normal.png', opts: LINEAR },
  { src: 'assets/ships/release/surfaces/common-rock/rock_orm.png', opts: LINEAR },
];

export const WORLD_KTX2_JOBS = JOBS;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Freshness marker salted with the encode recipe: a source re-bake AND a recipe change
// (e.g. the isYFlip fix or the block-4 pad — an identical source encoded under the old
// recipe looks correct on disk but renders upside-down or black) must both invalidate
// the sibling .ktx2. Bump RECIPE_VERSION whenever the produced bytes change meaning.
const RECIPE_VERSION = 'v2'; // v1: unflipped + unpadded; v2: isYFlip + pad-to-4x4
export function worldKtx2Marker(source, opts) {
  return sha256(Buffer.concat([source, Buffer.from(`\nworld-ktx2-recipe:${RECIPE_VERSION}:${JSON.stringify(opts)}`)]));
}

export async function encodeMissingOrStale() {
  for (const job of JOBS) {
    await encodeJob(job);
  }
}

async function encodeJob(job) {
  const srcPath = join(ROOT, job.src);
  const outPath = `${srcPath}.ktx2`;
  const markerPath = `${outPath}.sha256`;
  let source;
  try {
    source = await readFile(srcPath);
  } catch {
    console.log(`skip (missing) ${job.src}`);
    return;
  }
  const marker = `${worldKtx2Marker(source, job.opts)}\n`;
  const [existing, existingMarker] = await Promise.all([
    stat(outPath).catch(() => null),
    readFile(markerPath, 'utf8').catch(() => null),
  ]);
  if (existing && existingMarker === marker) {
    console.log(`fresh ${job.src}.ktx2`);
    return;
  }
  if (CHECK_ONLY) {
    console.log(`stale ${job.src} -> ${job.src}.ktx2`);
    return;
  }
  const bytes = Buffer.from(await encodeToKTX2(source, { ...job.opts, imageDecoder }));
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);
  await writeFile(markerPath, marker);
  console.log(`wrote ${job.src}.ktx2 ${(bytes.length / 1024).toFixed(0)} KiB (src ${(source.length / 1024).toFixed(0)} KiB)`);
}

const invokedAsMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedAsMain) await encodeMissingOrStale();
