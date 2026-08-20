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

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const DEFAULT_CHANNEL_TOLERANCE = 8;
const DEFAULT_DETERMINISTIC_THRESHOLD = 0.005;
const DEFAULT_FLIGHT_THRESHOLD = 0.025;

const args = parseArgs(process.argv.slice(2));
const plan = buildFramePlan();
const workRoot = mkdtempSync(path.join(tmpdir(), 'spaceface-ui-regression-'));
const captureA = path.join(workRoot, 'capture-a');
const captureB = path.join(workRoot, 'capture-b');

let exitCode = 0;

try {
  assertReferenceSetExists(plan);

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

  if (repeatability.failures.length || visual.failures.length) {
    exitCode = 1;
    const parts = [];
    if (repeatability.failures.length) parts.push(`${repeatability.failures.length} repeatability failure(s)`);
    if (visual.failures.length) parts.push(`${visual.failures.length} regression failure(s)`);
    console.error(`\nFAIL check:visual-regression — ${parts.join(', ')}`);
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
  };
  for (const arg of argv) {
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

function assertReferenceSetExists(matrixPlan) {
  const missing = [];
  for (const entry of matrixPlan) {
    const file = frameFileName(entry);
    const full = path.join(UI_FRAME_REFERENCE_DIR, file);
    if (!existsSync(full)) missing.push(file);
  }
  if (missing.length) {
    throw new Error(
      `missing ${missing.length} reference frame(s) in ${UI_FRAME_REFERENCE_DIR}\n` +
      `run: npm run capture:ui-matrix -- --update\n` +
      missing.slice(0, 12).map((name) => `  - ${name}`).join('\n'),
    );
  }
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
    const pass = diff.ratio === 0;
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
    const threshold = entry.surface === 'flight' ? flightThreshold : deterministicThreshold;
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
