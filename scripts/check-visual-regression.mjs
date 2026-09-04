#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  UI_FRAME_REFERENCE_DIR,
  buildFramePlan,
  captureUiMatrix,
  frameFileName,
} from './capture-ui-matrix.mjs';
import { SHIPPING_SURFACES } from './ui-grammar-surfaces.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const DEFAULT_CHANNEL_TOLERANCE = 8;
// Per-surface differing-pixel-ratio thresholds, CALIBRATED from measured two-pass variance on
// a clean tree (2026-08-20 full-matrix run), not guesses:
//   footprint / range            0.00-0.05% measured -> 0.5%  (fully deterministic surfaces)
//   ship                         0.00% measured, one 2.45% settle-frame outlier (the J14 gauge
//                               SETTLE easing can be mid-transition at capture) -> 3%
//   chart                        2-4% measured across all modes (label scramble + staleness
//                               animation paint between frames) -> 5%
//   flight                       5-8.6% measured (a live world legitimately moves behind the
//                               HUD; catches gross regressions only) -> 10%
// Raising these further to make a diff pass without knowing WHAT changed violates the golden
// law in test/ui-frame-references/README.md - these floors are the measured rest variance.
//
// PQ-180 .03 extends this matrix from five surfaces to every surface in
// scripts/ui-grammar-surfaces.mjs. The five calibrated floors above stay EXACTLY as measured; a
// newly covered surface has no measured variance yet, so it starts at the strictest deterministic
// floor and is re-calibrated from its own two-pass repeatability numbers when the first full run
// lands. Starting a new surface loose would be a guess; starting it tight makes its real variance
// show up as a failure with a number attached, which is the calibration.
const SURFACE_THRESHOLDS = Object.freeze({
  footprint: 0.005,
  range: 0.005,
  ship: 0.03,
  chart: 0.05,
  flight: 0.1,
});
const DEFAULT_DETERMINISTIC_THRESHOLD = 0.005;
const DEFAULT_FLIGHT_THRESHOLD = 0.1;

const args = parseArgs(process.argv.slice(2));
const plan = buildFramePlan();
const workRoot = mkdtempSync(path.join(tmpdir(), 'spaceface-ui-regression-'));
const captureA = path.join(workRoot, 'capture-a');
const captureB = path.join(workRoot, 'capture-b');

let exitCode = 0;

try {
  const coverage = reportReferenceCoverage(plan);

  await runCaptureWithRetries('A', captureA);
  await runCaptureWithRetries('B (repeatability guard)', captureB);

  const repeatability = runRepeatabilityGuard({
    plan,
    firstDir: captureA,
    secondDir: captureB,
  });
  printRepeatabilityReport(repeatability);

  const visual = runVisualDiff({
    plan,
    referenceDir: UI_FRAME_REFERENCE_DIR,
    candidateDir: captureA,
    channelTolerance: args.channelTolerance,
    deterministicThreshold: args.deterministicThreshold,
    flightThreshold: args.flightThreshold,
  });
  printVisualReport(visual, args);

  if (repeatability.failures.length || visual.failures.length || coverage.missing.length) {
    exitCode = 1;
    const parts = [];
    if (coverage.missing.length) parts.push(`${coverage.missing.length} missing reference frame(s)`);
    if (repeatability.failures.length) parts.push(`${repeatability.failures.length} repeatability failure(s)`);
    if (visual.failures.length) parts.push(`${visual.failures.length} regression failure(s)`);
    console.error(`\nFAIL check:visual-regression — ${parts.join(', ')}`);
    if (coverage.missing.length) {
      console.error(`  remedy for the missing frames: npm run capture:ui-matrix -- --update`);
    }
  } else {
    console.log('\nPASS check:visual-regression');
  }
} catch (error) {
  exitCode = 1;
  console.error(error && error.stack ? error.stack : String(error));
} finally {
  if (!args.keepTemp) {
    rmSync(workRoot, { recursive: true, force: true });
  } else {
    console.log(`kept temp capture dir: ${workRoot}`);
  }
  process.exitCode = exitCode;
}

function parseArgs(argv) {
  const parsed = {
    channelTolerance: DEFAULT_CHANNEL_TOLERANCE,
    deterministicThreshold: DEFAULT_DETERMINISTIC_THRESHOLD,
    flightThreshold: DEFAULT_FLIGHT_THRESHOLD,
    keepTemp: false,
    headed: false,
  };
  for (const arg of argv) {
    if (arg === '--headed') { parsed.headed = true; continue; }
    if (arg === '--keep-temp') {
      parsed.keepTemp = true;
      continue;
    }
    if (arg.startsWith('--channel-tolerance=')) {
      parsed.channelTolerance = Number(arg.slice('--channel-tolerance='.length));
      continue;
    }
    if (arg.startsWith('--deterministic-threshold=')) {
      parsed.deterministicThreshold = Number(arg.slice('--deterministic-threshold='.length));
      continue;
    }
    if (arg.startsWith('--flight-threshold=')) {
      parsed.flightThreshold = Number(arg.slice('--flight-threshold='.length));
      continue;
    }
  }

  if (!Number.isFinite(parsed.channelTolerance) || parsed.channelTolerance < 0 || parsed.channelTolerance > 255) {
    throw new Error(`invalid --channel-tolerance=${parsed.channelTolerance}; expected 0..255`);
  }
  if (!Number.isFinite(parsed.deterministicThreshold) || parsed.deterministicThreshold < 0 || parsed.deterministicThreshold > 1) {
    throw new Error(`invalid --deterministic-threshold=${parsed.deterministicThreshold}; expected 0..1`);
  }
  if (!Number.isFinite(parsed.flightThreshold) || parsed.flightThreshold < 0 || parsed.flightThreshold > 1) {
    throw new Error(`invalid --flight-threshold=${parsed.flightThreshold}; expected 0..1`);
  }
  return parsed;
}

/**
 * PQ-180 .03: the plan covers EVERY shipping surface × 4 modes × 3 widths. A planned frame with no
 * reference PNG is an explicit missing entry with the surface, the owner and the remedy printed —
 * never an abort that hides the other 400 rows, and never a silent omission from the plan.
 */
function reportReferenceCoverage(matrixPlan) {
  const bySurface = new Map();
  const missing = [];
  for (const entry of matrixPlan) {
    const file = frameFileName(entry);
    const bucket = bySurface.get(entry.surface) || { expected: 0, present: 0 };
    bucket.expected += 1;
    if (existsSync(path.join(UI_FRAME_REFERENCE_DIR, file))) bucket.present += 1;
    else missing.push({ file, surface: entry.surface });
    bySurface.set(entry.surface, bucket);
  }

  console.log(`\nreference-frame coverage: ${matrixPlan.length - missing.length}/${matrixPlan.length} frames over ${bySurface.size} shipping surfaces`);
  console.log('surface                frames   owner      route');
  for (const surface of SHIPPING_SURFACES) {
    const bucket = bySurface.get(surface.id) || { expected: 0, present: 0 };
    const state = `${bucket.present}/${bucket.expected}`;
    console.log(
      `  ${bucket.present >= bucket.expected ? 'ok ' : 'MISS'} ${surface.id.padEnd(20)} ${state.padStart(6)}   `
      + `${(surface.owner || '-').padEnd(9)}  ${surface.entry.detail || surface.entry.kind}`,
    );
  }
  return { missing, bySurface };
}

function runRepeatabilityGuard({ plan: matrixPlan, firstDir, secondDir }) {
  const rows = [];
  const failures = [];

  for (const entry of matrixPlan) {
    if (entry.surface === 'flight') continue;
    const name = frameFileName(entry);
    const a = path.join(firstDir, name);
    const b = path.join(secondDir, name);
    const diff = diffPng(a, b, 0);
    // Same calibrated per-surface floors as the reference diff: a clean tree measurably varies
    // cross-pass on chart (animation paint) / range (sub-pixel) / ship (settle frames), while
    // footprint is exact. Zero-exact would fail a clean tree - the floor is the measurement.
    const floor = SURFACE_THRESHOLDS[entry.surface] != null ? SURFACE_THRESHOLDS[entry.surface] : DEFAULT_DETERMINISTIC_THRESHOLD;
    const pass = diff.ratio <= floor;
    const row = {
      name,
      surface: entry.surface,
      mode: entry.mode,
      viewport: entry.viewport,
      ratio: diff.ratio,
      changedPixels: diff.changedPixels,
      totalPixels: diff.totalPixels,
      pass,
    };
    rows.push(row);
    if (!pass) failures.push(row);
  }

  return { rows, failures };
}

function runVisualDiff({
  plan: matrixPlan,
  referenceDir,
  candidateDir,
  channelTolerance,
  deterministicThreshold,
  flightThreshold,
}) {
  const rows = [];
  const failures = [];

  for (const entry of matrixPlan) {
    const name = frameFileName(entry);
    const surfaceFloor = SURFACE_THRESHOLDS[entry.surface];
    const threshold = surfaceFloor != null
      ? (entry.surface === 'flight' ? Math.max(flightThreshold, surfaceFloor) : Math.max(deterministicThreshold, surfaceFloor))
      : (entry.surface === 'flight' ? flightThreshold : deterministicThreshold);
    const reference = path.join(referenceDir, name);
    const candidate = path.join(candidateDir, name);
    const diff = diffPng(reference, candidate, channelTolerance);
    const pass = diff.ratio <= threshold;
    const row = {
      name,
      surface: entry.surface,
      mode: entry.mode,
      viewport: entry.viewport,
      threshold,
      ratio: diff.ratio,
      changedPixels: diff.changedPixels,
      totalPixels: diff.totalPixels,
      pass,
    };
    rows.push(row);
    if (!pass) failures.push(row);
  }

  return { rows, failures };
}

function diffPng(aPath, bPath, channelTolerance) {
  // A frame that was never produced is an EXPLICIT error row, not a crash that hides every other
  // row in the table (PQ-180 .03: unavailable surfaces stay visible as missing entries).
  if (!existsSync(aPath) || !existsSync(bPath)) {
    return {
      totalPixels: 1,
      changedPixels: 1,
      ratio: 1,
      dimensionsMatch: false,
      missing: !existsSync(aPath) ? aPath : bPath,
    };
  }
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    const maxPixels = Math.max(a.width * a.height, b.width * b.height, 1);
    return {
      totalPixels: maxPixels,
      changedPixels: maxPixels,
      ratio: 1,
      dimensionsMatch: false,
    };
  }

  const totalPixels = a.width * a.height;
  let changedPixels = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    const da = Math.abs(a.data[i + 3] - b.data[i + 3]);
    if (dr > channelTolerance || dg > channelTolerance || db > channelTolerance || da > channelTolerance) {
      changedPixels += 1;
    }
  }
  return {
    totalPixels,
    changedPixels,
    ratio: totalPixels > 0 ? changedPixels / totalPixels : 0,
    dimensionsMatch: true,
  };
}

function printRepeatabilityReport(report) {
  console.log('\nrepeatability guard (instrument surfaces only, expected 0.00%)');
  console.log('surface      mode             viewport      diff%     changed/total');
  for (const row of report.rows) {
    const diffPct = (row.ratio * 100).toFixed(4).padStart(8);
    const changed = `${row.changedPixels}/${row.totalPixels}`.padStart(14);
    const surface = row.surface.padEnd(12);
    const mode = row.mode.padEnd(16);
    const viewport = row.viewport.padEnd(13);
    const marker = row.pass ? 'ok ' : 'BAD';
    console.log(`${marker} ${surface} ${mode} ${viewport} ${diffPct}% ${changed}`);
  }
}

function printVisualReport(report, thresholds) {
  console.log('\nvisual regression table');
  console.log(
    `channel tolerance: ${thresholds.channelTolerance}/255, deterministic threshold: ${(thresholds.deterministicThreshold * 100).toFixed(2)}%, flight threshold: ${(thresholds.flightThreshold * 100).toFixed(2)}%`,
  );
  console.log('surface      mode             viewport      diff%      gate%   changed/total');
  for (const row of report.rows) {
    const diffPct = (row.ratio * 100).toFixed(4).padStart(8);
    const gatePct = (row.threshold * 100).toFixed(2).padStart(7);
    const changed = `${row.changedPixels}/${row.totalPixels}`.padStart(14);
    const surface = row.surface.padEnd(12);
    const mode = row.mode.padEnd(16);
    const viewport = row.viewport.padEnd(13);
    const marker = row.pass ? 'ok ' : 'BAD';
    console.log(`${marker} ${surface} ${mode} ${viewport} ${diffPct}% ${gatePct}% ${changed}`);
  }
}

async function runCaptureWithRetries(label, outputDir, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(`check:visual-regression — capture run ${label} (attempt ${attempt}/${attempts})`);
    rmSync(outputDir, { recursive: true, force: true });
    try {
      await captureUiMatrix({
        outputDir,
        updateReferences: false,
        headed: args.headed,
        printTable: false,
        quiet: true,
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      const detail = error && error.message ? error.message : String(error);
      console.warn(`capture run ${label} attempt ${attempt} failed: ${detail}`);
    }
  }
  throw lastError || new Error(`capture run ${label} failed`);
}
