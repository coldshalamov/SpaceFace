#!/usr/bin/env node
/**
 * VFX Elite evidence gate — variations + screenshots + research doc.
 * Usage: node scripts/check-vfx-elite-evidence.mjs [--out <path>]
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const VFX_STD = path.join(ROOT, 'design', 'VFX_ELITE_STANDARD.md');
const VFX_SHOTS = path.join(ROOT, '.devshots', 'vfx-elite');
const VFX_EVIDENCE = path.join(ROOT, 'design', 'vfx-evidence');

const FAMILIES = [
  { id: 'muzzle', prefix: 'muzzle' },
  { id: 'projectile', prefix: 'projectile' },
  { id: 'impact', prefix: 'impact' },
  { id: 'explosion', prefix: 'explosion' },
  { id: 'thruster', prefix: 'thruster' },
  { id: 'mining', prefix: 'mining' },
  { id: 'countermeasure', prefix: 'countermeasure' },
  { id: 'station_emissive', prefix: 'station_emissive' },
];

const MIN_VARIATIONS = 3;
const MIN_FRAMES_PER_VAR = 5;
const MIN_CITATIONS = 8;
/** Seeded 1×1 PNGs from seed-vfx-elite-evidence.mjs are ~70 bytes; gameplay captures are much larger. */
const MIN_PNG_BYTES = 2048;

function listPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
}

function countCitations(text) {
  const urls = text.match(/https?:\/\/[^\s)>\]]+/g) || [];
  return new Set(urls).size;
}

const issues = [];

if (!fs.existsSync(VFX_STD)) {
  issues.push('missing design/VFX_ELITE_STANDARD.md');
} else {
  const cites = countCitations(fs.readFileSync(VFX_STD, 'utf8'));
  if (cites < MIN_CITATIONS) issues.push(`vfx_standard_citations=${cites}<${MIN_CITATIONS}`);
}

const allPngs = listPngs(VFX_SHOTS);
const lines = [];

for (const fam of FAMILIES) {
  const famIssues = [];
  const matching = allPngs.filter((f) => f.startsWith(fam.prefix));
  const variants = new Set();
  for (const f of matching) {
    const m = f.match(new RegExp(`^${fam.prefix}_([a-z0-9_]+)_`, 'i'));
    if (m) variants.add(m[1]);
  }
  if (variants.size < MIN_VARIATIONS) {
    famIssues.push(`variations=${variants.size}<${MIN_VARIATIONS}`);
  }
  for (const v of variants) {
    const frames = matching.filter((f) => f.startsWith(`${fam.prefix}_${v}_`));
    if (frames.length < MIN_FRAMES_PER_VAR) {
      famIssues.push(`${v}_frames=${frames.length}<${MIN_FRAMES_PER_VAR}`);
    }
    const tiny = frames.filter((f) => {
      try { return fs.statSync(path.join(VFX_SHOTS, f)).size < MIN_PNG_BYTES; } catch { return true; }
    });
    if (tiny.length) famIssues.push(`${v}_seeded_png=${tiny.length}`);
  }
  const evPath = path.join(VFX_EVIDENCE, `${fam.id}.md`);
  if (!fs.existsSync(evPath)) famIssues.push('no_vfx-evidence_md');

  lines.push(famIssues.length
    ? `FAIL ${fam.id}: ${famIssues.join(', ')}`
    : `PASS ${fam.id}: variations=${variants.size}`);
  issues.push(...famIssues.map((x) => `${fam.id}:${x}`));
}

lines.unshift(issues.length ? 'VFX_ELITE: FAIL' : 'VFX_ELITE: PASS');
lines.push('');
lines.push(`SUMMARY fail=${issues.length > 0 ? FAMILIES.length : 0} issues=${issues.length}`);

const outArg = process.argv.indexOf('--out');
const report = lines.join('\n');
console.log(report);
if (outArg !== -1) fs.writeFileSync(process.argv[outArg + 1], report + '\n');
process.exit(issues.length ? 1 : 0);