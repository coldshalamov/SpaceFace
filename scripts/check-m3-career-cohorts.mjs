#!/usr/bin/env node
// M3 career cohorts hard gate (repair) — nine independent career×horizon runs.
//
// Run: node scripts/check-m3-career-cohorts.mjs
// Exit 0 only when cohort assertions pass.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import {
  CAREER_IDS,
  runCareerCohorts,
  summarizeCohortReport,
  round1,
} from '../src/balance/careerCohorts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = join(ROOT, 'test', 'fixtures', 'm3-career-cohorts');
const CAMPAIGN_DIR = join(ROOT, '.campaign', 'm3-career-cohorts');
const REPORT_PATH = join(FIXTURE_DIR, 'cohort-report.v2.json');
const CAMPAIGN_PATH = join(CAMPAIGN_DIR, 'cohort-report.v2.json');

const t0 = performance.now();
let report;
try {
  report = runCareerCohorts({
    horizonsMin: [30, 60, 90],
    includeFailure: true,
  });
} catch (err) {
  console.error('[check-m3-career-cohorts] RUNTIME_FAIL', err && err.stack || err);
  process.exit(1);
}
const elapsedMs = round1(performance.now() - t0);

const summary = summarizeCohortReport(report);
summary.elapsedMs = elapsedMs;
summary.gate = 'check-m3-career-cohorts';
summary.generatedNote = 'Nine independent sims (career×horizon). Rates are per-horizon earnedValue/min. No reload-equivalence claim. No production balance retune.';

mkdirSync(FIXTURE_DIR, { recursive: true });
mkdirSync(CAMPAIGN_DIR, { recursive: true });
writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));
writeFileSync(CAMPAIGN_PATH, JSON.stringify(summary, null, 2));

const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);
const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : String(n));

const HR = '-'.repeat(112);
console.log(HR);
console.log('SpaceFace M3 career cohorts v2 — 9 independent career×horizon strategies');
console.log('Career-specific bands (cr/min earnedValue). Cross disparity is reported, not used as a pass ceiling.');
console.log(HR);
console.log(
  pad('career', 12)
  + padL('min', 5)
  + padL('credits', 9)
  + padL('earned', 9)
  + padL('cr/min', 8)
  + padL('loops', 7)
  + padL('ship', 14)
  + padL('phase', 12)
  + padL('ok', 5)
  + ' bottlenecks',
);

for (const row of summary.table) {
  const bots = (row.bottlenecks || []).map((b) => b.code || b).slice(0, 2).join(',') || '-';
  console.log(
    pad(row.career, 12)
    + padL(row.minutes, 5)
    + padL(fmt(row.credits), 9)
    + padL(fmt(row.earnedValue), 9)
    + padL(row.creditsPerMin, 8)
    + padL(row.completedLoops ?? '-', 7)
    + padL(row.shipId || '-', 14)
    + padL(row.phase || '-', 12)
    + padL(row.ok ? 'Y' : 'N', 5)
    + ' ' + bots,
  );
}
console.log(HR);

for (const id of CAREER_IDS) {
  const band = summary.bands[id];
  console.log(`  band ${id}: dead<${band.dead} healthy≥${band.lo} hi≤${band.hi} — ${band.note}`);
  for (const m of summary.horizonsMin) {
    const c = summary.cells[id][m];
    if (c.assertionFails && c.assertionFails.length) {
      console.log(`    FAIL ${id}@${m}m: ${c.assertionFails.join('; ')}`);
    }
    if (c.assertionWarns && c.assertionWarns.length) {
      console.log(`    WARN ${id}@${m}m: ${c.assertionWarns.join('; ')}`);
    }
  }
}
if (!summary.cross.ok) console.log(`  FAIL cross: ${summary.cross.fails.join('; ')}`);
if (summary.cross.warns && summary.cross.warns.length) {
  console.log(`  WARN cross: ${summary.cross.warns.join('; ')}`);
}
if (summary.cross.disparity) {
  console.log(`  disparity: ${JSON.stringify(summary.cross.disparity)}`);
}
for (const id of CAREER_IDS) {
  if (!summary.determinism[id]?.equal) console.log(`  FAIL determinism:${id}`);
}
console.log(`  snapshotSeam: stable=${summary.snapshotSeam.stable} reloadClaimed=${summary.snapshotSeam.reloadClaimed}`);
console.log(`  authority: live=${summary.authorityMatrix.live.length} adapters=${summary.authorityMatrix.adapter_warning.length}`);
console.log(`  report: ${REPORT_PATH}`);
console.log(`  campaign: ${CAMPAIGN_PATH}`);
console.log(`  runtime ${elapsedMs} ms`);
console.log(`  balanceTuning: ${summary.authorityMatrix.balanceTuning}`);

console.log(JSON.stringify({
  gate: summary.gate,
  ok: summary.ok,
  elapsedMs,
  table: summary.table,
  cross: summary.cross,
  determinism: summary.determinism,
  snapshotSeam: summary.snapshotSeam,
  authorityMatrix: summary.authorityMatrix,
  residualSeams: summary.residualSeams,
}, null, 2));

if (!summary.ok || elapsedMs > 90000) {
  console.error('[check-m3-career-cohorts] FAIL');
  process.exit(1);
}
console.log('[check-m3-career-cohorts] PASS');
