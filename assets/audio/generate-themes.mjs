#!/usr/bin/env node
// assets/audio/generate-themes.mjs — PQ-158.03 authored stems and sector beds.
//
// Renders the four state themes and per-sector beds from src/audio/themeCompose.js.
// Agent-produced samples; no recorded composer. Byte-identical on every run.
//
//   node assets/audio/generate-themes.mjs
//   node assets/audio/generate-themes.mjs --check

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  THEME_ASSETS,
  THEME_SAMPLE_RATE,
  renderThemeAssetPcm,
  encodeWavPcm16,
} from '../../src/audio/themeCompose.js';

const OUT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const checkOnly = process.argv.includes('--check');

const results = [];
const mismatches = [];
for (const asset of THEME_ASSETS) {
  const rel = `${asset.family}/${asset.id}.wav`;
  const file = path.join(OUT_ROOT, rel);
  const pcm = renderThemeAssetPcm(asset);
  const bytes = encodeWavPcm16(pcm, THEME_SAMPLE_RATE);
  if (checkOnly) {
    if (!existsSync(file)) { mismatches.push(`missing ${rel}`); continue; }
    const existing = readFileSync(file);
    if (!existing.equals(bytes)) mismatches.push(`drifted ${rel}`);
  } else {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
  results.push({
    id: asset.id,
    file: `assets/audio/${rel}`,
    seconds: asset.seconds,
    bytes: bytes.length,
  });
}

if (mismatches.length) {
  console.error(`theme tree does not match the generator (${mismatches.length}):`);
  for (const m of mismatches) console.error(`  ${m}`);
  process.exitCode = 1;
} else {
  const total = results.reduce((s, r) => s + r.bytes, 0);
  console.log(`${results.length} authored themes, ${(total / 1024).toFixed(0)} KiB total${checkOnly ? ' (verified byte-identical)' : ''}`);
  for (const r of results) {
    console.log(`  ${r.id.padEnd(22)} ${String(r.seconds).padStart(4)}s ${String(r.bytes).padStart(7)}B  ${r.file}`);
  }
}
