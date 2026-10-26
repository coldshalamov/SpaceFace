#!/usr/bin/env node
// Post-capture manifest validator. The Python driver calls this after writing manifest.json and
// exits nonzero if the contract is broken. No GPU, no browser, no dependencies.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCaptureManifest } from './manifest.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/combat-feel/validate-manifest.mjs <manifest.json>');
  process.exit(2);
}
let manifest;
try {
  manifest = JSON.parse(readFileSync(resolve(file), 'utf8'));
} catch (error) {
  console.error(`manifest: cannot read ${file}: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
const result = validateCaptureManifest(manifest);
if (!result.ok) {
  console.error(`combat-feel manifest INVALID (${result.errors.length} issue(s)):`);
  for (const issue of result.errors) console.error(`  - ${issue}`);
  process.exit(1);
}
const scenarioCount = Object.keys(manifest.scenarios || {}).length;
const beatCount = Object.values(manifest.scenarios || {})
  .reduce((sum, entry) => sum + (Array.isArray(entry.beats) ? entry.beats.length : 0), 0);
console.log(JSON.stringify({
  ok: true,
  scenarios: scenarioCount,
  beats: beatCount,
  kind: manifest.kind,
  seed: manifest.run && manifest.run.seed,
}, null, 2));
