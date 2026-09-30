#!/usr/bin/env node
// Foundry IBL bake — moves the runtime HDRI decode + luminance normalize + green-cast
// neutralize to build time.
//
//   assets/background/env/industrial_workshop_foundry_2k.hdr      source (CC0 Poly Haven)
//        -> node scripts/bake-foundry-ibl.mjs
//   assets/background/env/industrial_workshop_foundry_2k.f32.bin  raw Float32 RGBA equirect
//   assets/background/env/industrial_workshop_foundry_2k.f32.json manifest (sha256, dims, stats)
//
// WHY: at boot the runtime fetched the 6.6 MB Radiance .hdr, decoded ~2M pixels to Float32 in
// JS (~80 ms), then ran two full-image float passes (mean-radiance normalize + green-cast
// neutralize, ~40 ms) — ~120 ms of main-thread work in the opening window. The output is a pure
// function of the source file: decode and transforms are deterministic Float32 math with no
// canvas/GPU/browser dependency, so the exact runtime product is shippable as a build artifact.
// The runtime fast path (src/render/foundryEnvironment.js) fetches the .f32.bin, verifies its
// sha256 against the manifest before the bytes are used, and wraps them in the same DataTexture
// the decode path produces. Any failure falls back to the .hdr decode — the two paths emit the
// identical pixel buffer, so the picture never changes either way.
//
// --check recomputes the payload and compares it to the shipped artifact byte-for-byte: this is
// what pins "bake output must equal runtime output" forever. Run it after touching the source
// .hdr or the transform functions.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

import {
  FOUNDRY_IBL_TARGET_MEAN_RADIANCE,
  neutralizeHdrGreenCast,
  normalizeHdrMeanRadiance,
} from '../src/render/foundryEnvironment.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_DIR = resolve(REPO, 'assets/background/env');
// --source=<stem> selects which env triplet to bake; default remains the foundry HDRI so the
// original command line still works. Sources live side by side under assets/background/env/
// as <stem>.hdr / <stem>.f32.bin / <stem>.f32.json.
const sourceArg = (process.argv.find((a) => a.startsWith('--source=')) || '--source=industrial_workshop_foundry_2k').slice('--source='.length);
const SOURCE_STEM = sourceArg.replace(/[^a-z0-9_-]/gi, '') || 'industrial_workshop_foundry_2k';
const HDR_PATH = resolve(ENV_DIR, `${SOURCE_STEM}.hdr`);
const BIN_PATH = resolve(ENV_DIR, `${SOURCE_STEM}.f32.bin`);
const MANIFEST_PATH = resolve(ENV_DIR, `${SOURCE_STEM}.f32.json`);
const CHECK = process.argv.includes('--check');

const MANIFEST_SCHEMA = 'spaceface.foundryIblBake.v1';

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// Recompute the exact runtime product: the same HDRLoader decode at FloatType, then the same
// exported transforms the loader applies in order. No reimplementation here — calling the
// shipped functions keeps the bake from drifting from the runtime algorithm.
function computeBakedPixels() {
  const hdrBytes = readFileSync(HDR_PATH);
  const loader = new HDRLoader();
  loader.setDataType(THREE.FloatType);
  const parsed = loader.parse(hdrBytes.buffer.slice(hdrBytes.byteOffset, hdrBytes.byteOffset + hdrBytes.byteLength));
  if (!(parsed.data instanceof Float32Array)) {
    throw new Error('HDRLoader did not decode the foundry HDR to Float32 data');
  }
  const texture = new THREE.DataTexture(parsed.data, parsed.width, parsed.height);
  const normalize = normalizeHdrMeanRadiance(texture, FOUNDRY_IBL_TARGET_MEAN_RADIANCE);
  if (!normalize) throw new Error('normalizeHdrMeanRadiance rejected the decoded foundry data');
  const touched = neutralizeHdrGreenCast(texture);
  if (touched == null) throw new Error('neutralizeHdrGreenCast rejected the decoded foundry data');
  return {
    width: parsed.width,
    height: parsed.height,
    data: texture.image.data,
    sourceSha256: sha256Hex(hdrBytes),
    stats: {
      targetMeanRadiance: FOUNDRY_IBL_TARGET_MEAN_RADIANCE,
      meanBefore: normalize.meanBefore,
      scaleFactor: normalize.scaleFactor,
      greenCastTexelsTouched: touched,
    },
  };
}

function buildManifest(baked, payloadSha256) {
  return {
    schema: MANIFEST_SCHEMA,
    width: baked.width,
    height: baked.height,
    channels: 4,
    pixelFormat: 'float32-rgba',
    payloadBytes: baked.data.byteLength,
    sha256: payloadSha256,
    source: {
      file: `${SOURCE_STEM}.hdr`,
      sha256: baked.sourceSha256,
      provenance: 'assets/background/env/PROVENANCE.md',
    },
    transform: baked.stats,
    generatedBy: 'scripts/bake-foundry-ibl.mjs',
  };
}

function main() {
  if (!existsSync(HDR_PATH)) {
    console.error(`[bake-foundry-ibl] source missing: ${HDR_PATH}`);
    process.exit(1);
  }
  const baked = computeBakedPixels();
  // The runtime fast path validates payload.byteLength === width*height*4*4 exactly, so slice
  // off any parser over-allocation (HDRLoader pads some flat-encoded sources by a few texels).
  const exactFloats = baked.width * baked.height * 4;
  const payload = Buffer.from(
    baked.data.buffer, baked.data.byteOffset, exactFloats * Float32Array.BYTES_PER_ELEMENT,
  );
  const payloadSha = sha256Hex(payload);

  if (CHECK) {
    let ok = true;
    if (!existsSync(BIN_PATH)) { console.error('[bake-foundry-ibl] FAIL missing .f32.bin artifact'); ok = false; }
    if (!existsSync(MANIFEST_PATH)) { console.error('[bake-foundry-ibl] FAIL missing .f32.json manifest'); ok = false; }
    if (ok) {
      const shipped = readFileSync(BIN_PATH);
      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      if (manifest.schema !== MANIFEST_SCHEMA) { console.error(`[bake-foundry-ibl] FAIL schema ${manifest.schema}`); ok = false; }
      if (manifest.width !== baked.width || manifest.height !== baked.height) {
        console.error(`[bake-foundry-ibl] FAIL dims ${manifest.width}x${manifest.height} != ${baked.width}x${baked.height}`); ok = false;
      }
      if (manifest.sha256 !== payloadSha) {
        console.error(`[bake-foundry-ibl] FAIL manifest sha ${manifest.sha256} != recomputed ${payloadSha}`); ok = false;
      }
      if (!shipped.equals(payload)) {
        console.error('[bake-foundry-ibl] FAIL artifact bytes differ from decode+transform recompute — rebake'); ok = false;
      }
      if (manifest.source && manifest.source.sha256 !== baked.sourceSha256) {
        console.error('[bake-foundry-ibl] FAIL manifest source sha does not match the .hdr on disk'); ok = false;
      }
    }
    if (!ok) process.exit(1);
    console.log(`[bake-foundry-ibl] ok — ${baked.width}x${baked.height} f32 payload ${payload.length} B sha256 ${payloadSha} matches artifact + manifest`);
    return;
  }

  writeFileSync(BIN_PATH, payload);
  const manifest = buildManifest(baked, payloadSha);
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[bake-foundry-ibl] wrote ${BIN_PATH}`);
  console.log(`  payload ${payload.length} B sha256 ${payloadSha}`);
  console.log(`  source .hdr sha256 ${baked.sourceSha256}`);
  console.log(`  transform mean ${baked.stats.meanBefore} -> ${baked.stats.targetMeanRadiance} (x${baked.stats.scaleFactor}), green texels ${baked.stats.greenCastTexelsTouched}`);
}

main();
