#!/usr/bin/env node
// Post-capture manifest validator. The Python driver calls this after writing manifest.json and
// exits nonzero if the contract is broken. No GPU, no browser, no dependencies.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCaptureManifest, verifySourceFiles } from './manifest.mjs';

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
// The schema is intentionally pure; provenance needs the filesystem. A capture made from another
// bench revision is not evidence for this one, so the post-capture CLI checks it here.
const repoRoot = resolve(import.meta.dirname, '../..');
const sourceErrors = verifySourceFiles(manifest, repoRoot);
const errors = [...result.errors, ...sourceErrors];
if (errors.length > 0) {
  console.error(`combat-feel manifest INVALID (${errors.length} issue(s)):`);
  for (const issue of errors) console.error(`  - ${issue}`);
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
