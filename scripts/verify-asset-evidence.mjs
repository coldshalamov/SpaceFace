#!/usr/bin/env node
// Structural evidence gate for sustained asset production (spec2/08 §5 + silhouette pairs).
// Fails unless hero PNGs and silhouette pair manifest exist on disk with minimum size.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = process.env.SF_ASSET_SCRATCH
  || resolve('C:/Users/93rob/AppData/Local/Temp/grok-goal-37de2abed066/implementer');
const MIN_BYTES = Number(process.env.SF_HERO_MIN_BYTES || 100_000);

const HERO_SHOTS = [
  '.devshots/spec2/hero-tether-slingshot.png',
  '.devshots/spec2/hero-asteroid-seam.png',
  '.devshots/spec2/hero-station-approach.png',
  '.devshots/spec2/hero-wedge-formation.png',
  '.devshots/spec2/hero-cruise-streaks.png',
  '.devshots/spec2/hero-capital-kill-bloom.png',
];

const SILHOUETTE_MANIFEST = resolve(SCRATCH, 'silhouette-pairs-complete.md');

let ok = 0;
let fail = 0;

function check(label, condition, detail = '') {
  if (condition) ok++;
  else {
    fail++;
    console.log(`FAIL  ${label}${detail ? '  -  ' + detail : ''}`);
  }
}

check('silhouette pairs manifest exists', existsSync(SILHOUETTE_MANIFEST), SILHOUETTE_MANIFEST);
if (existsSync(SILHOUETTE_MANIFEST)) {
  const text = readFileSync(SILHOUETTE_MANIFEST, 'utf8');
  const pairs = [...text.matchAll(/^- \[x\] `([^`]+)`/gm)].map((m) => m[1]);
  check('silhouette manifest lists at least 10 hull pairs', pairs.length >= 10, `count=${pairs.length}`);
  for (const rel of pairs) {
    const abs = resolve(ROOT, rel);
    const okPath = existsSync(abs) && statSync(abs).size >= 4096;
    check(`silhouette pair file ${rel}`, okPath, existsSync(abs) ? `bytes=${statSync(abs).size}` : 'missing');
  }
}

for (const rel of HERO_SHOTS) {
  const abs = resolve(ROOT, rel);
  const size = existsSync(abs) ? statSync(abs).size : 0;
  check(`hero shot ${rel} exists`, existsSync(abs));
  check(`hero shot ${rel} >= ${MIN_BYTES} bytes`, size >= MIN_BYTES, `bytes=${size}`);
}

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);