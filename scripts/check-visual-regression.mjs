#!/usr/bin/env node
// check-visual-regression.mjs — PQ-180 .03 "Reference frames for every surface."
//
// Captures the full matrix (every shipping surface × default / reduced-motion / forced-colours /
// pseudo-localised × 1280 / 1920 / 2560) and diffs it against the committed baseline in
// test/ui-frame-references/.
//
// It fails when ANY of these is true:
//   * a REACHABLE frame has no reference PNG — a surface the harness can open, that nobody
//     photographed;
//   * a surface diffs against its reference by more than its calibrated floor;
//   * a surface was not at rest when it was photographed — its REST TWIN, a second shot through the
//     same open one beat later, differs from the frame by more than that same floor.
//
// It REPORTS, in full and with an owner, but does not fail on: a frame for a surface with no route
// into it at all (credits, statistics, photo mode, the Crucible lab, the two legacy maps). Nobody
// can photograph a screen that does not exist, and a gate that is red on arrival for that reason is
// a gate agents learn to ignore. Those rows are a bill with a packet on it, not a pass.
//
// The rest twin replaced a second full capture pass when the matrix grew from 60 frames to 480: the
// guard asks "was this surface still moving when we called it settled", and one extra screenshot
// per frame answers it, where a second whole pass doubled a two-and-a-half hour run to ask the same
// question less directly.
//
// The floors live in test/ui-frame-references/floors.json and are the MEASURED rest variance of
// each surface. `--calibrate` re-measures them from two independent samples per frame with one
// stated widening rule. Nothing here is a knob.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  UI_FRAME_REFERENCE_DIR,
  UI_MATRIX_SEED,
  buildFramePlan,
  captureUiMatrix,
  frameFileName,
  readReferenceProvenance,
} from './capture-ui-matrix.mjs';
import { SHIPPING_SURFACES } from './ui-grammar-surfaces.mjs';
import {
  DEFAULT_CHANNEL_TOLERANCE,
  FLOORS_FILE,
  buildCoverageReport,
  decideExit,
  deriveFloor,
  diffPng,
  formatCoverageReport,
  invalidateFloorCache,
  judgeFrames,
  loadFloors,
} from './lib/ui-frame-regression.mjs';

const args = parseArgs(process.argv.slice(2));
const plan = buildFramePlan();
const workRoot = mkdtempSync(path.join(tmpdir(), 'spaceface-ui-regression-'));
const captureA = args.fromDirs ? args.fromDirs[0] : path.join(workRoot, 'capture-a');
const twinA = args.fromDirs ? args.fromDirs[1] : path.join(workRoot, 'capture-a-rest-twin');
// The cross-variance sample. It defaults to the COMMITTED BASELINE, and that is the point: the
// baseline was shot in a different process, in a different boot, on a different day, which is
// exactly the reproducibility a regression floor has to absorb. Shooting a throwaway pass B to ask
// the same question costs a second full matrix — an hour of browser — to compare two frames that
// will both be thrown away, while the frame the gate actually judges against sits on disk unused.
// `--second-pass` still shoots one, for a tree whose baseline is itself under suspicion.
const captureB = args.fromDirs
  ? args.fromDirs[2]
  : (args.secondPass ? path.join(workRoot, 'capture-b') : UI_FRAME_REFERENCE_DIR);

let exitCode = 0;

try {
  // --from-dirs replays capture directories that already exist instead of shooting new ones. It is
  // how a calibration measured per viewport is folded into one set of floors, how a failing run is
  // re-judged without paying for the capture twice, and how the perturbation proof runs in seconds.
  const runA = args.fromDirs ? { failures: [] } : await runCapture('A', captureA, twinA);
  const runB = (args.calibrate && args.secondPass && !args.fromDirs)
    ? await runCapture('B (second variance sample)', captureB)
    : { failures: [] };

  // The capture's own failure rows are what let a MISSING frame say WHY it is missing, per surface,
  // rather than pointing every gap at the same generic command.
  const coverage = buildCoverageReport({
    plan,
    referenceDir: UI_FRAME_REFERENCE_DIR,
    frameFileName,
    failures: [...(runA.failures || []), ...(runB.failures || [])],
    surfaces: SHIPPING_SURFACES,
    provenance: readReferenceProvenance(),
    expectedSeed: UI_MATRIX_SEED,
  });
  // Everything coverage ruled not-current is billed there and must never reach a diff table.
  const notCurrent = new Set(coverage.missing.map((row) => row.file));
  console.log(`\n${formatCoverageReport(coverage, SHIPPING_SURFACES)}`);

  if (args.calibrate) {
    const calibration = calibrateFloors({
      plan, dirA: captureA, dirTwin: twinA, dirCross: captureB,
      // A cross sample taken against a frame from another universe is not a measurement of anything.
      skipCross: captureB === UI_FRAME_REFERENCE_DIR ? notCurrent : null,
    });
    printCalibration(calibration);
    writeFileSync(FLOORS_FILE, `${JSON.stringify(calibration.document, null, 2)}\n`);
    console.log(`\ncalibrated floors written: ${FLOORS_FILE}`);
    // Without this the judgment below reads the floors this process loaded BEFORE calibrating —
    // the one reading guaranteed to be stale.
    invalidateFloorCache();
  }

  const floors = loadFloors();

  const repeatability = judgeFrames({
    plan, referenceDir: captureA, candidateDir: twinA, floors, frameFileName, channelTolerance: 0,
    captureFailures: runA.failures || [],
  });
  printJudgeTable('rest guard — each frame against its own rest twin', repeatability, 'were at rest within their floor');

  const visual = judgeFrames({
    plan,
    referenceDir: UI_FRAME_REFERENCE_DIR,
    candidateDir: captureA,
    floors,
    frameFileName,
    channelTolerance: args.channelTolerance,
    captureFailures: runA.failures || [],
    skipFrames: notCurrent,
  });
  printJudgeTable(
    `visual regression — committed reference vs this capture, channel tolerance ${args.channelTolerance}/255`,
    visual,
    'within their floor',
  );

  const decision = decideExit({ coverage, repeatability, visual });
  exitCode = decision.code;
  if (decision.code) {
    console.error(`\nFAIL check:visual-regression — ${decision.reasons.join(', ')}`);
    if (coverage.missingReachable.length) {
      console.error('  each missing surface names its own remedy in the coverage table above.');
    }
  } else {
    const owed = coverage.missingUnreachable.length;
    console.log(`\nPASS check:visual-regression — ${coverage.present}/${coverage.frames} frames`
      + (owed
        ? `; ${owed} frame(s) on ${coverage.unreachableSurfaces.length} unreachable surface(s) are OWED, not shot `
          + `(${coverage.unreachableSurfaces.join(', ')})`
        : ''));
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
    keepTemp: false,
    headed: false,
    calibrate: false,
    secondPass: false,
    fromDirs: null,
  };
  for (const arg of argv) {
    if (arg === '--headed') { parsed.headed = true; continue; }
    if (arg === '--calibrate') { parsed.calibrate = true; continue; }
    if (arg === '--second-pass') { parsed.secondPass = true; continue; }
    if (arg === '--keep-temp') { parsed.keepTemp = true; continue; }
    if (arg.startsWith('--from-dirs=')) {
      const dirs = arg.slice('--from-dirs='.length).split(',').map((d) => d.trim()).filter(Boolean);
      if (dirs.length !== 3) throw new Error('--from-dirs needs exactly three directories: pass-A,rest-twin,cross-sample');
      parsed.fromDirs = dirs.map((d) => path.resolve(d));
      continue;
    }
    if (arg.startsWith('--channel-tolerance=')) {
      parsed.channelTolerance = Number(arg.slice('--channel-tolerance='.length));
      continue;
    }
  }
  if (!Number.isFinite(parsed.channelTolerance) || parsed.channelTolerance < 0 || parsed.channelTolerance > 255) {
    throw new Error(`invalid --channel-tolerance=${parsed.channelTolerance}; expected 0..255`);
  }
  return parsed;
}

/**
 * TWO independent rest-variance samples per frame, so a floor is never one lucky (or unlucky) pair:
 *
 *   twin  — the frame against its own rest twin, one beat later through the same open.
 *           "Did this surface hold still while we were looking at it?"
 *   cross — the frame against the committed reference for the same frame.
 *           "Does this route reproduce across a boot, a process and a day?"
 *
 * The worst frame of a surface across both samples is that surface's measured rest variance, and the
 * stated rule widens it into a floor.
 *
 * The two samples are also a DIAGNOSIS, which is why both are written down per surface. A surface
 * whose twin sample is small and whose cross sample is large did not measure "a wide surface": it
 * measured a REFERENCE that was shot mid-motion, or under load from another lane. The answer there
 * is to re-shoot that reference — never to bank the number as a floor. `calibrationRun.suspect`
 * lists exactly those surfaces so the next reader does not have to derive them.
 *
 * A pinned surface (the five calibrated on 2026-08-20) keeps its floor no matter what this run
 * measures. Its new measurement is still recorded, so a surface that has genuinely become less
 * stable shows up as a number instead of quietly consuming its own headroom.
 */
function calibrateFloors({ plan: matrixPlan, dirA, dirTwin, dirCross, skipCross = null }) {
  const perSurface = new Map();
  const rows = [];
  for (const entry of matrixPlan) {
    const name = frameFileName(entry);
    if (skipCross && skipCross.has(name)) continue;
    const twin = diffPng(path.join(dirA, name), path.join(dirTwin, name), 0);
    const cross = diffPng(path.join(dirA, name), path.join(dirCross, name), 0);
    if (!twin.dimensionsMatch || !cross.dimensionsMatch) continue; // an uncaptured frame measures nothing
    const worst = Math.max(twin.ratio, cross.ratio);
    rows.push({ name, surface: entry.surface, twin: twin.ratio, cross: cross.ratio, worst });
    const bucket = perSurface.get(entry.surface)
      || { measured: 0, frames: 0, worstFrame: null, worstTwin: 0, worstCross: 0 };
    bucket.frames += 1;
    bucket.worstTwin = Math.max(bucket.worstTwin, twin.ratio);
    bucket.worstCross = Math.max(bucket.worstCross, cross.ratio);
    if (worst > bucket.measured) { bucket.measured = worst; bucket.worstFrame = name; }
    perSurface.set(entry.surface, bucket);
  }

  const document = JSON.parse(JSON.stringify(loadFloors()));
  const today = new Date().toISOString().slice(0, 10);
  const decisions = [];
  const suspect = [];
  for (const surface of SHIPPING_SURFACES) {
    const record = document.surfaces[surface.id] || (document.surfaces[surface.id] = {
      floor: 0.005, measuredMaxRestVariance: null, samples: 0, calibrated: null, pinned: false, note: '',
    });
    const bucket = perSurface.get(surface.id);
    if (!bucket || !bucket.frames) {
      decisions.push({ surface: surface.id, action: 'no frames captured — floor unchanged', floor: record.floor, measured: null });
      continue;
    }
    // A surface that holds perfectly still through its own open but disagrees with its reference is
    // reporting on the REFERENCE, not on itself.
    const restless = bucket.worstCross > 0.01 && bucket.worstCross > bucket.worstTwin * 4;
    if (restless) suspect.push({ surface: surface.id, twin: round(bucket.worstTwin), cross: round(bucket.worstCross) });

    const derived = deriveFloor(bucket.measured);
    if (record.pinned) {
      record.lastObservedRestVariance = round(bucket.measured);
      record.lastObservedAt = today;
      decisions.push({
        surface: surface.id,
        action: derived > record.floor ? 'PINNED — measured variance now exceeds the pinned floor' : 'pinned, unchanged',
        floor: record.floor,
        measured: bucket.measured,
      });
      continue;
    }
    record.measuredMaxRestVariance = round(bucket.measured);
    record.restTwinSample = round(bucket.worstTwin);
    record.crossPassSample = round(bucket.worstCross);
    record.samples = 2;
    record.calibrated = today;
    record.worstFrame = bucket.worstFrame;
    record.framesMeasured = bucket.frames;
    if (restless) {
      // The README's rule, enforced instead of merely written down: a surface that holds still
      // through its own open and still disagrees with its reference has measured a REFERENCE shot
      // mid-motion. Banking that as a floor — even with a warning note attached — is exactly the
      // "widen it to absorb a diff you have not explained" the golden law forbids, and a note nobody
      // is forced to read is not a guard. The floor does NOT move; the surface stays red; the red is
      // what makes someone re-shoot the reference.
      record.suspect = true;
      record.suspectSince = today;
      record.note = `NOT calibrated: this surface held still through its own open `
        + `(${(bucket.worstTwin * 100).toFixed(3)}%) but differs from its committed reference by `
        + `${(bucket.worstCross * 100).toFixed(3)}% — that is a reference shot mid-motion or under load. `
        + `Re-shoot it (npm run capture:ui-matrix -- --update --only=${surface.id}) and calibrate again. `
        + `The floor stays at ${record.floor} so the check stays red until someone does.`;
      decisions.push({
        surface: surface.id,
        action: 'REFUSED — cross sample dominates; floor left alone, re-shoot the reference',
        floor: record.floor,
        measured: bucket.measured,
      });
      continue;
    }
    delete record.suspect;
    delete record.suspectSince;
    record.floor = derived;
    record.note = `measured over ${bucket.frames} frame(s), worst ${bucket.worstFrame}`;
    decisions.push({ surface: surface.id, action: 'calibrated', floor: derived, measured: bucket.measured });
  }
  document.calibrationRun = {
    date: today,
    crossSample: dirCross === UI_FRAME_REFERENCE_DIR ? 'the committed reference baseline' : dirCross,
    samplesPerFrame: 2,
    framesMeasured: rows.length,
    plannedFrames: matrixPlan.length,
    suspect,
  };
  return { rows, decisions, document, suspect };
}

function round(value) {
  return Number(Number(value).toFixed(6));
}

function printCalibration(calibration) {
  console.log('\ncalibration — measured rest variance (two samples per frame: rest twin, and the committed reference)');
  console.log('     surface               measured     floor   action');
  for (const row of calibration.decisions) {
    const measured = row.measured == null ? '        -' : `${(row.measured * 100).toFixed(4)}%`.padStart(9);
    const floor = `${(row.floor * 100).toFixed(2)}%`.padStart(7);
    console.log(`     ${row.surface.padEnd(20)} ${measured} ${floor}   ${row.action}`);
  }
  if (calibration.suspect.length) {
    console.log(`\n  ${calibration.suspect.length} surface(s) held still through their own open but disagree with their reference.`);
    console.log('  That is a reference shot mid-motion, not a wide surface. Re-shoot it; do not bank the floor:');
    for (const row of calibration.suspect) {
      console.log(`    ${row.surface.padEnd(20)} rest twin ${(row.twin * 100).toFixed(3)}%   vs reference ${(row.cross * 100).toFixed(3)}%`);
      console.log(`      npm run capture:ui-matrix -- --update --only=${row.surface}`);
    }
  }
}

function printJudgeTable(title, report, tail) {
  console.log(`\n${title} (${report.rows.length} frames)`);
  console.log('     surface      mode             viewport      diff%     floor%   changed/total');
  for (const row of report.rows) {
    if (row.pass && !process.env.SF_UI_REGRESSION_VERBOSE) continue;
    const diffPct = (row.ratio * 100).toFixed(4).padStart(8);
    const floorPct = (row.floor * 100).toFixed(2).padStart(7);
    const changed = `${row.changedPixels}/${row.totalPixels}`.padStart(14);
    console.log(
      `  ${row.pass ? 'ok  ' : 'BAD '} ${row.surface.padEnd(12)} ${row.mode.padEnd(16)} ${row.viewport.padEnd(13)} `
      + `${row.candidateMissing ? '   NO FRAME' : `${diffPct}%`} ${floorPct}% ${changed}`,
    );
    if (row.candidateMissing) console.log(`         ${row.reason}`);
  }
  console.log(`     ${report.rows.length - report.failures.length}/${report.rows.length} frames ${tail}`);
}

/**
 * ONE capture attempt, not three.
 *
 * A retry loop here used to answer any failure by re-shooting the entire matrix — an hour of browser
 * to re-ask a question the first run already answered. Every failure the capture can survive is now
 * contained where it happens: a boot that will not come up costs that width's frames and names them,
 * a surface that will not open costs its own frame and names itself. What is left to throw is a
 * browser or a server that never started, and repeating that three times only delays the message.
 */
async function runCapture(label, outputDir, restTwinDir = null) {
  // A guard, not a formality: this function begins by deleting its output directory, and the
  // cross-variance sample now DEFAULTS to the committed baseline. One wrong call here would erase
  // 480 reference frames that take hours to re-shoot.
  if (path.resolve(outputDir) === path.resolve(UI_FRAME_REFERENCE_DIR)) {
    throw new Error('refusing to capture into the committed reference directory — that would delete the baseline');
  }
  console.log(`check:visual-regression — capture run ${label}`);
  rmSync(outputDir, { recursive: true, force: true });
  if (restTwinDir) rmSync(restTwinDir, { recursive: true, force: true });
  return captureUiMatrix({
    outputDir,
    restTwinDir,
    updateReferences: false,
    headed: args.headed,
    printTable: false,
    quiet: true,
  });
}
