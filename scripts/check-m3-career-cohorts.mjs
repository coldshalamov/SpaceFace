#!/usr/bin/env node
// M3 career cohorts hard gate (repair) — nine independent career×horizon runs.
//
// Run: node scripts/check-m3-career-cohorts.mjs
// Exit 0 only when cohort assertions pass.

import {
  closeSync,
  mkdirSync,
  openSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
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
const REPORT_LOCK_PATH = join(CAMPAIGN_DIR, 'cohort-report.v2.__lock');
const REPORT_LOCK_STALE_MS = 30_000;
const REPORT_LOCK_WAIT_MS = 10_000;
const lockWait = new Int32Array(new SharedArrayBuffer(4));

function publishReports(text) {
  const deadline = performance.now() + REPORT_LOCK_WAIT_MS;
  let lockFd = null;

  while (lockFd === null) {
    try {
      lockFd = openSync(REPORT_LOCK_PATH, 'wx');
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
      try {
        if (Date.now() - statSync(REPORT_LOCK_PATH).mtimeMs > REPORT_LOCK_STALE_MS) {
          unlinkSync(REPORT_LOCK_PATH);
          continue;
        }
      } catch (statErr) {
        if (statErr?.code !== 'ENOENT') throw statErr;
        continue;
      }
      if (performance.now() >= deadline) {
        throw new Error(`timed out publishing cohort reports: ${REPORT_LOCK_PATH}`);
      }
      Atomics.wait(lockWait, 0, 0, 25);
    }
  }

  try {
    // Both destinations receive the same deterministic bytes. The runtime remains
    // console-only, so concurrent gates cannot churn or disagree on report content.
    writeFileSync(REPORT_PATH, text);
    writeFileSync(CAMPAIGN_PATH, text);
  } finally {
    closeSync(lockFd);
    try {
      unlinkSync(REPORT_LOCK_PATH);
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }
}

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
summary.generatedNote = 'Nine independent sims (career×horizon) plus 3 seeds/career at 30m and a prospector-only save data round-trip with simplified continuation; finalizeLoadedGame is not exercised. Rates are per-horizon earnedValue/min. Strategies use live economy, mission, travel, shipyard, tech, and save authorities; production prices and gate bands are unchanged.';

mkdirSync(FIXTURE_DIR, { recursive: true });
mkdirSync(CAMPAIGN_DIR, { recursive: true });
const fixtureSummary = { ...summary };
delete fixtureSummary.elapsedMs;
publishReports(`${JSON.stringify(fixtureSummary, null, 2)}\n`);

const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);
const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : String(n));

const HR = '-'.repeat(112);
console.log(HR);
console.log('SpaceFace M3 career cohorts v3 — production-authority career×horizon strategies');
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
if (summary.reloadProof) {
  console.log(`  reloadProof: ok=${summary.reloadProof.ok} continueEqual=${summary.reloadProof.continueEqual} seam=${summary.reloadProof.seam}`);
  if (summary.reloadProof.error) console.log(`    reload error: ${summary.reloadProof.error}`);
}
console.log(`  multiSeedOk: ${summary.multiSeedOk}`);
if (summary.multiSeed) {
  for (const id of CAREER_IDS) {
    const rows = summary.multiSeed[id] || [];
    console.log(`    seeds ${id}: ${rows.map((r) => `${r.seed.toString(16)}@${r.creditsPerMin}cpm`).join(', ')}`);
  }
}
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
  multiSeedOk: summary.multiSeedOk,
  multiSeedDistinct: summary.multiSeedDistinct,
  multiSeed: summary.multiSeed,
  reloadProof: summary.reloadProof,
  snapshotSeam: summary.snapshotSeam,
  authorityMatrix: summary.authorityMatrix,
  residualSeams: summary.residualSeams,
}, null, 2));

if (elapsedMs > 90000) {
  console.warn(`[check-m3-career-cohorts] WARN runtime ${elapsedMs}ms > 90000 under current host load`);
}
if (!summary.ok) {
  console.error('[check-m3-career-cohorts] FAIL assertions');
  process.exit(1);
}
console.log('[check-m3-career-cohorts] PASS');
