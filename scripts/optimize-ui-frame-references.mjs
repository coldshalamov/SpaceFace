#!/usr/bin/env node
// optimize-ui-frame-references.mjs — PQ-180 .03 "Reference frames for every surface."
//
// Re-encodes the committed reference frames LOSSLESSLY and keeps the result only when it is smaller.
// The matrix grew from 60 frames to 480, which is the whole reason this exists: at that size the
// baseline is a real cost to the repository, and the brief's rule is to keep the resolution the game
// rendered at and recover what compression can recover.
//
// LOSSLESS means lossless, and it is verified per file rather than trusted: every re-encoded frame is
// decoded again and compared byte for byte against the original pixels before it is allowed to
// replace anything. That check is not ceremony. `sharp.png({ effort })` silently switches libvips to
// PALETTE QUANTISATION, which looks like a 50 % saving and is a 256-colour approximation with
// per-channel errors up to 51 — measured on this tree, on 2026-09-05, on
// footprint-forced-colors-1920x1080.png. Anything that changes a pixel changes what the diff floors
// mean, so it is rejected here rather than discovered later as an unexplained red row.
//
// What it actually recovers, measured on this tree: about 4-5 %. Some frames get BIGGER — the flat,
// already-optimal ones — and those keep the bytes they had.
//
//   node scripts/optimize-ui-frame-references.mjs            # every frame
//   node scripts/optimize-ui-frame-references.mjs --dry-run  # measure, write nothing
//   node scripts/optimize-ui-frame-references.mjs --only=station-market

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const sharp = require('sharp');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REFERENCE_DIR = path.join(ROOT, 'test', 'ui-frame-references');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = (args.find((a) => a.startsWith('--only=')) || '').slice('--only='.length)
  .split(',').map((v) => v.trim()).filter(Boolean);

const files = readdirSync(REFERENCE_DIR)
  .filter((name) => name.toLowerCase().endsWith('.png'))
  .filter((name) => !only.length || only.some((surface) => name.startsWith(`${surface}-`)))
  .sort();

let before = 0;
let after = 0;
let rewritten = 0;
let kept = 0;
let refused = 0;

for (const name of files) {
  const file = path.join(REFERENCE_DIR, name);
  const originalBytes = statSync(file).size;
  before += originalBytes;
  const originalBuffer = readFileSync(file);

  let candidate = null;
  try {
    candidate = await sharp(originalBuffer)
      // palette:false is the load-bearing argument. Without it libvips may quantise, and the result
      // is a smaller file that is not the same picture.
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
      .toBuffer();
  } catch (error) {
    console.log(`  skip  ${name} — re-encode failed: ${error.message}`);
    after += originalBytes;
    kept += 1;
    continue;
  }

  if (candidate.length >= originalBytes) {
    after += originalBytes;
    kept += 1;
    continue;
  }

  const source = PNG.sync.read(originalBuffer);
  const result = PNG.sync.read(candidate);
  let identical = source.width === result.width
    && source.height === result.height
    && source.data.length === result.data.length;
  if (identical) {
    for (let i = 0; i < source.data.length; i += 1) {
      if (source.data[i] !== result.data[i]) { identical = false; break; }
    }
  }
  if (!identical) {
    // Never silently: a re-encode that changed the picture is the exact failure this file exists to
    // prevent, and it must be visible if it ever happens.
    console.log(`  REFUSED ${name} — the re-encode changed pixels; keeping the original`);
    after += originalBytes;
    refused += 1;
    continue;
  }

  if (!dryRun) writeFileSync(file, candidate);
  after += candidate.length;
  rewritten += 1;
}

const saved = before - after;
console.log(`\n${dryRun ? 'would optimise' : 'optimised'} ${files.length} reference frame(s)`);
console.log(`  rewritten (smaller, pixel-identical): ${rewritten}`);
console.log(`  kept as-is (re-encode was no smaller): ${kept}`);
if (refused) console.log(`  REFUSED (re-encode was not lossless): ${refused}`);
console.log(`  bytes: ${before} -> ${after}  (${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB, `
  + `saved ${(saved / 1048576).toFixed(1)} MB, ${before ? ((saved / before) * 100).toFixed(1) : '0.0'} %)`);
