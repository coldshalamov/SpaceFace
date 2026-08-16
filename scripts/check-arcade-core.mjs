#!/usr/bin/env node
// check:arcade-core — the single regenerating gate named by design/arcade-core/09_VALIDATION.md.
//
// Two halves, both required:
//   1. Every test/arcade-core-*.test.mjs runs exactly once. The set is discovered from disk AND
//      compared to the manifest below, so a newly authored arcade-core test cannot sit unwired
//      behind a green check (the failure mode this repo has hit before).
//   2. The Layer-1 metric battery is regenerated from live production owners and compared to its
//      authored tolerance bands. Numbers land in a receipt, not in chat.
//
// Usage:
//   node scripts/check-arcade-core.mjs                 tests + battery
//   node scripts/check-arcade-core.mjs --metrics-only  battery only (seconds)
//   node scripts/check-arcade-core.mjs --json          receipt to stdout

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARCADE_CORE_ROUTE_IDS,
  evaluateArcadeCoreBattery,
} from '../src/testing/metrics/arcadeCoreMetrics.js';
import { measureArcadeCorePacingRoute } from '../src/testing/metrics/arcadeCorePacingRoute.js';
import { runArcadeCoreAtmosphereRoute } from '../src/testing/metrics/arcadeCoreAtmosphereRoute.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DIR = join(ROOT, 'test');
const RECEIPT_DIR = join(ROOT, '.devshots', 'arcade-core');

// Explicit manifest. Discovery below must agree with it exactly.
const MANIFEST = [
  'arcade-core-combat-pacing.test.mjs',
  'arcade-core-atmosphere-route.test.mjs',
  'arcade-core-damage-dressing.test.mjs',
  'arcade-core-death-signatures.test.mjs',
  'arcade-core-juice-discipline.test.mjs',
  'arcade-core-kill-cause-rewards.test.mjs',
  'arcade-core-kill-economy.test.mjs',
  'arcade-core-kill-rp.test.mjs',
  'arcade-core-market-continuity.test.mjs',
  'arcade-core-massline-release-honesty.test.mjs',
  'arcade-core-physics-arsenal.test.mjs',
  'arcade-core-pacing-route.test.mjs',
  'arcade-core-readable-tumble.test.mjs',
  'arcade-core-starter-environment-kill.test.mjs',
  'arcade-core-universal-vacuum.test.mjs',
  'arcade-core-validation-battery.test.mjs',
  'arcade-core-vacuum-inhale.test.mjs',
  'arcade-core-wanted-lifecycle.test.mjs',
  'arcade-core-wing-morale-cargo.test.mjs',
];

const argv = new Set(process.argv.slice(2));
const metricsOnly = argv.has('--metrics-only');
const asJson = argv.has('--json');

function discoverTests() {
  return readdirSync(TEST_DIR)
    .filter((name) => /^arcade-core-.*\.test\.mjs$/.test(name))
    .sort();
}

function diffSets(discovered, manifest) {
  const inManifest = new Set(manifest);
  const onDisk = new Set(discovered);
  return {
    unwired: discovered.filter((name) => !inManifest.has(name)),
    missing: manifest.filter((name) => !onDisk.has(name)),
  };
}

function runTests(files) {
  const started = Date.now();
  const result = spawnSync(
    process.execPath,
    ['--test', ...files.map((name) => join('test', name))],
    { cwd: ROOT, stdio: asJson ? 'pipe' : 'inherit', encoding: 'utf8' },
  );
  return {
    ok: result.status === 0,
    status: result.status,
    files: files.length,
    durationMs: Date.now() - started,
    ...(asJson && result.status !== 0 ? { output: String(result.stdout || '') + String(result.stderr || '') } : {}),
  };
}

function formatBand(band) {
  if (!band) return '(no band)';
  if (band.op === 'calibration') return 'OWNER CALIBRATION REQUIRED';
  if (band.op === 'range') return `${band.min} .. ${band.max}`;
  return `${band.op} ${band.value}`;
}

const discovered = discoverTests();
const { unwired, missing } = diffSets(discovered, MANIFEST);

// These two families cannot be computed honestly from constants. Await the real fixed-step routes
// once, then inject their receipts into the otherwise synchronous numeric battery.
const pacingReceipt = await measureArcadeCorePacingRoute();
const atmosphereReceipt = await runArcadeCoreAtmosphereRoute();
const battery = evaluateArcadeCoreBattery({}, {
  pacing: pacingReceipt,
  atmosphere: atmosphereReceipt,
});
const coverage = {
  ok: unwired.length === 0 && missing.length === 0,
  discovered,
  manifest: MANIFEST,
  unwired,
  missing,
};

const tests = metricsOnly
  ? { ok: true, skipped: true, files: 0, durationMs: 0 }
  : (coverage.ok ? runTests(discovered) : { ok: false, skipped: true, files: 0, durationMs: 0 });

const calibrationOpen = battery.calibrationOpen;
const regressionFailures = battery.failures;
const regressionsOk = coverage.ok && tests.ok && regressionFailures.length === 0;

const receipt = {
  schema: 'spaceface.arcadeCoreReceipt.v1',
  generatedAt: new Date().toISOString(),
  plan: 'design/arcade-core/09_VALIDATION.md',
  ok: coverage.ok && tests.ok && battery.ok,
  regressionsOk,
  calibrationOpen: calibrationOpen.map((row) => ({ metric: row.metric, value: row.value, why: row.band.why })),
  coverage,
  tests,
  routes: Object.fromEntries(ARCADE_CORE_ROUTE_IDS.map((route) => [
    route,
    battery.results.filter((row) => row.route === route),
  ])),
  values: battery.values,
  detail: battery.detail,
};

mkdirSync(RECEIPT_DIR, { recursive: true });
const receiptPath = join(RECEIPT_DIR, 'metrics.json');
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

if (asJson) {
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} else {
  console.log('\narcade-core Layer-1 battery');
  for (const [route, rows] of Object.entries(receipt.routes)) {
    console.log(`\n  ${route}`);
    for (const row of rows) {
      const mark = row.status === 'open' ? 'OPEN' : row.ok ? 'PASS' : 'FAIL';
      console.log(`    ${mark}  ${row.metric.padEnd(32)} ${String(row.value).padEnd(12)} band ${formatBand(row.band)}`);
      if (!row.ok && row.band) console.log(`          why: ${row.band.why}`);
    }
  }
  if (unwired.length) console.log(`\n  UNWIRED arcade-core tests (add to the manifest): ${unwired.join(', ')}`);
  if (missing.length) console.log(`\n  MISSING manifest tests (deleted?): ${missing.join(', ')}`);
  if (!metricsOnly) {
    console.log(`\n  tests: ${tests.skipped ? 'skipped (coverage drift)' : `${tests.files} files, ${tests.durationMs} ms`}`);
  }
  console.log(`\n  receipt: ${receiptPath}`);
  if (receipt.ok) console.log('\ncheck:arcade-core PASS\n');
  else if (regressionsOk) console.log('\ncheck:arcade-core REGRESSIONS PASS — OWNER CALIBRATION OPEN\n');
  else console.log('\ncheck:arcade-core FAIL\n');
}

process.exit(regressionsOk ? 0 : 1);
