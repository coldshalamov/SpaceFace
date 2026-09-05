// ui-frame-regression.mjs — PQ-180 .03 "Reference frames for every surface."
//
// The pure half of `check:visual-regression`: the plan/reference coverage table, the per-surface
// diff floors, and the PNG diff itself. It is separated from the CLI so a test can exercise the
// MISSING-row contract and the perturbation-goes-red law without booting a browser.
//
// The three laws this file encodes (test/ui-frame-references/README.md):
//   1. A planned frame with no reference PNG is an EXPLICIT missing row carrying the surface, its
//      owner packet, its owner leaf and a remedy. Never a silent omission, never an abort that
//      hides the other rows.
//   2. A per-surface floor is the MEASURED rest variance of that surface, widened by one stated
//      rule. It is never a knob turned until an unknown change passes.
//   3. A frame that differs from its reference by more than that floor is red.
//
// And the line those three draw between them: the check FAILS on a REACHABLE frame that is missing,
// and REPORTS an unreachable one. A surface with no route into it — credits, statistics, photo mode,
// the Crucible lab, the two legacy maps — cannot be photographed by anyone, and a gate that stays
// red for a screen that does not exist yet is a gate agents learn to ignore. Those rows stay in the
// table, in full, with the packet and the leaf that will build them. They are a bill, not a pass.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { AUTOMATABLE_SURFACES, SHIPPING_SURFACES } from '../ui-grammar-surfaces.mjs';

/**
 * A surface is REACHABLE for capture when the manifest gives it a module AND an entry kind the
 * capture harness has actually implemented an opener for. That is the same set `AUTOMATABLE_SURFACES`
 * names, resolved once here so the coverage table and the exit code cannot disagree about it.
 *
 * Note what this does NOT mean: `AUTOMATABLE_SURFACES` includes fixture-entry surfaces. A fixture is
 * honest enough to PHOTOGRAPH a surface — it is never evidence that a player can reach it, and the
 * grammar matrix keeps that reachability cell red regardless (ui-grammar-surfaces.mjs). A missing
 * frame for a fixture surface is therefore a real failure of this check: the harness can open it.
 */
const CAPTURE_REACHABLE = new Set(AUTOMATABLE_SURFACES.map((surface) => surface.id));

export function isCaptureReachable(surfaceId) {
  return CAPTURE_REACHABLE.has(surfaceId);
}

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const FLOORS_FILE = path.join(ROOT, 'test', 'ui-frame-references', 'floors.json');

/** Channel delta, per RGBA channel, below which two pixels count as the same pixel. */
export const DEFAULT_CHANNEL_TOLERANCE = 8;

/**
 * The strictest floor any surface may carry. A surface whose measured rest variance is zero still
 * gets this much room: PNG encoding and sub-pixel layout rounding are not bit-stable across
 * processes, and a literal 0.00% gate would fail a clean tree.
 */
export const MIN_FLOOR = 0.005;

/** Floor granularity. Floors are quoted in half-percent steps so the table reads as decisions. */
export const FLOOR_STEP = 0.005;

/**
 * THE FLOOR RULE, stated once so it can be checked rather than believed:
 *
 *     floor = max(MIN_FLOOR, ceilTo(measuredMaxRestVariance x 1.2, FLOOR_STEP))
 *
 * Replayed against the five floors measured on 2026-08-20 it reproduces four of them exactly
 * (footprint 0.5%, range 0.5%, ship 3%, chart 5%) and would have given flight 10.5% where the
 * measured floor of 10% was written down. The five historical floors stay PINNED at the values they
 * were measured at — the rule governs the surfaces calibrated after them, and never widens one that
 * already exists.
 */
export function deriveFloor(measuredMaxRestVariance) {
  const measured = Number.isFinite(measuredMaxRestVariance) ? Math.max(0, measuredMaxRestVariance) : 0;
  const widened = measured * 1.2;
  const stepped = Math.ceil((widened - 1e-12) / FLOOR_STEP) * FLOOR_STEP;
  return Math.max(MIN_FLOOR, Number(stepped.toFixed(6)));
}

let cachedFloors = null;

/**
 * Drop the memoised floors. `--calibrate` writes floors.json and then judges the tree in the same
 * process; without this it would judge against the floors it read BEFORE calibrating, which is the
 * one reading guaranteed to be wrong.
 */
export function invalidateFloorCache() {
  cachedFloors = null;
}

export function loadFloors(file = FLOORS_FILE) {
  if (cachedFloors && cachedFloors.file === file) return cachedFloors.value;
  if (!existsSync(file)) {
    throw new Error(
      `no calibrated floors at ${file}. The floors are the measured rest variance of each surface; `
      + 'regenerate them with: npm run check:visual-regression -- --calibrate',
    );
  }
  const value = JSON.parse(readFileSync(file, 'utf8'));
  cachedFloors = { file, value };
  return value;
}

/**
 * The diff gate for one surface. A surface with no calibrated entry is NOT quietly given a loose
 * default: it takes the strictest floor there is, so its real variance shows up as a failure with a
 * number attached — which is the calibration — instead of hiding under an allowance.
 */
export function floorForSurface(surfaceId, floors = loadFloors()) {
  const record = floors && floors.surfaces ? floors.surfaces[surfaceId] : null;
  if (record && Number.isFinite(record.floor)) return record.floor;
  return MIN_FLOOR;
}

/**
 * Why a planned frame has no reference PNG, and what to do about it. The remedy is per surface,
 * because the answer is genuinely different: a surface with no opener needs its owner packet to
 * build one; a surface whose capture failed needs that failure fixed; a surface that simply has not
 * been photographed yet needs one command.
 */
export function remedyForSurface(surface, failure = null) {
  const owner = surface && surface.owner ? surface.owner : 'PQ-180';
  const leaf = surface && surface.ownerLeaf ? surface.ownerLeaf : '.03';
  if (failure && failure.skipped) {
    return `${failure.reason} — fix the surface named there first (${owner} ${leaf}), then re-shoot: `
      + `npm run capture:ui-matrix -- --fill-missing --only=${surface.id}`;
  }
  if (failure) {
    return `capture failed: ${failure.reason} — owner ${owner} ${leaf}; re-shoot after the fix: `
      + `npm run capture:ui-matrix -- --fill-missing --only=${surface.id}`;
  }
  const kind = surface && surface.entry ? surface.entry.kind : 'none';
  if (kind === 'none') {
    return `no opener exists: ${(surface.entry && surface.entry.detail) || 'unreachable'} — `
      + `${owner} ${leaf} owns building the route; until it exists this surface has no frames`;
  }
  return `never photographed — npm run capture:ui-matrix -- --fill-missing --only=${surface.id}`;
}

/**
 * The coverage table. Every planned frame is either present or an explicit missing row; every
 * missing row names the surface, its owner, its leaf and its remedy.
 */
export function buildCoverageReport({
  plan,
  referenceDir,
  frameFileName,
  failures = [],
  surfaces = SHIPPING_SURFACES,
  exists = existsSync,
  // Which universe each committed frame was shot in, and which one the harness shoots in now.
  //
  // A frame from another seed is NOT coverage. Diffed against a current capture it reads as a 5-40%
  // regression that nothing distinguishes from a real one, and the calibration would then bank that
  // difference as the surface's floor — the exact failure this leaf added code to refuse. So it is
  // reported MISSING, with the reason, and never diffed. That is also what makes the baseline
  // resumable: it can be re-shot a few surfaces at a time and the check always says which are current.
  provenance = null,
  expectedSeed = null,
}) {
  const surfaceById = new Map(surfaces.map((s) => [s.id, s]));
  const failureByFrame = new Map();
  const failureBySurface = new Map();
  for (const failure of failures) {
    const width = failure.viewport && failure.viewport.width;
    const height = failure.viewport && failure.viewport.height;
    if (failure.surface && failure.mode && width && height) {
      failureByFrame.set(`${failure.surface}-${failure.mode}-${width}x${height}.png`, failure);
    }
    if (failure.surface && !failureBySurface.has(failure.surface)) failureBySurface.set(failure.surface, failure);
  }

  const bySurface = new Map();
  const missing = [];
  for (const entry of plan) {
    const file = frameFileName(entry);
    const reachable = isCaptureReachable(entry.surface);
    const bucket = bySurface.get(entry.surface)
      || { surface: entry.surface, expected: 0, present: 0, missingFiles: [], reachable };
    bucket.expected += 1;
    const onDisk = exists(path.join(referenceDir, file));
    const shotSeed = provenance && provenance.frames && provenance.frames[file]
      ? provenance.frames[file].seed
      : null;
    const current = expectedSeed == null ? onDisk : (onDisk && shotSeed === expectedSeed);
    if (current) {
      bucket.present += 1;
    } else {
      const surface = surfaceById.get(entry.surface) || null;
      const failure = failureByFrame.get(file) || failureBySurface.get(entry.surface) || null;
      const stale = onDisk;
      if (stale) bucket.stale = (bucket.stale || 0) + 1;
      const row = {
        file,
        surface: entry.surface,
        mode: entry.mode,
        viewport: entry.viewport,
        reachable,
        stale,
        shotSeed,
        owner: (surface && surface.owner) || 'PQ-180',
        ownerLeaf: (surface && surface.ownerLeaf) || '.03',
        remedy: stale
          ? 'on disk, but photographed in a different universe '
            + `(seed ${shotSeed == null ? 'unrecorded' : shotSeed}; the harness now shoots seed ${expectedSeed}), `
            + 'so it is not comparable with anything and is never diffed — re-shoot it: '
            + `npm run capture:ui-matrix -- --update --only=${entry.surface}`
          : remedyForSurface(surface || { id: entry.surface, entry: { kind: 'none' } }, failure),
      };
      missing.push(row);
      bucket.missingFiles.push(row);
    }
    bySurface.set(entry.surface, bucket);
  }

  // The split the exit code reads. `missing` stays whole so the table can print every gap; only
  // `missingReachable` is a failure, and only `missingUnreachable` may be reported as owed work.
  const missingReachable = missing.filter((row) => row.reachable);
  const missingUnreachable = missing.filter((row) => !row.reachable);
  const staleFrames = missing.filter((row) => row.stale);
  const unreachableSurfaces = [...new Set(missingUnreachable.map((row) => row.surface))];

  return {
    plan,
    missing,
    missingReachable,
    missingUnreachable,
    staleFrames,
    unreachableSurfaces,
    bySurface,
    frames: plan.length,
    present: plan.length - missing.length,
    surfaces: bySurface.size,
  };
}

/**
 * One line per surface, then the gaps split the way the exit code splits them: frames a surface the
 * harness CAN open is missing (red, and the run fails), and frames no one can shoot yet because the
 * screen has no route into it (owed, with the packet and the leaf that will build it).
 */
export function formatCoverageReport(coverage, surfaces = SHIPPING_SURFACES) {
  const lines = [];
  lines.push(
    `reference-frame coverage: ${coverage.present}/${coverage.frames} frames over ${coverage.surfaces} shipping surfaces`,
  );
  lines.push('     surface              frames   owner      route');
  for (const surface of surfaces) {
    const bucket = coverage.bySurface.get(surface.id) || { expected: 0, present: 0, reachable: true };
    const state = `${bucket.present}/${bucket.expected}`;
    // Three states, not two: complete, missing-and-shootable (fatal), missing-with-no-route (owed).
    const mark = bucket.present >= bucket.expected ? 'ok  ' : (bucket.reachable ? 'MISS' : 'OWED');
    lines.push(
      `  ${mark} ${surface.id.padEnd(20)} ${state.padStart(6)}   `
      + `${(surface.owner || '-').padEnd(9)}  ${surface.entry.detail || surface.entry.kind}`,
    );
  }

  const buckets = [...coverage.bySurface.values()].filter((b) => b.missingFiles && b.missingFiles.length);
  const reachableBuckets = buckets.filter((b) => b.reachable);
  const unreachableBuckets = buckets.filter((b) => !b.reachable);

  if (coverage.staleFrames && coverage.staleFrames.length) {
    lines.push('');
    lines.push(
      `STALE — ${coverage.staleFrames.length} frame(s) are on disk but were photographed in a different `
      + 'universe. They are counted as missing and are never diffed: a frame from another seed reads as '
      + 'a regression that nothing distinguishes from a real one.',
    );
    lines.push(`    ${coverage.staleFrames[0].remedy}`);
  }
  if (reachableBuckets.length) {
    lines.push('');
    lines.push(
      `MISSING and shootable — the check FAILS on these `
      + `(${coverage.missingReachable.length} frame(s), ${reachableBuckets.length} surface(s))`,
    );
    for (const bucket of reachableBuckets) {
      const first = bucket.missingFiles[0];
      lines.push(`  ${bucket.surface} — ${bucket.missingFiles.length} frame(s), owner ${first.owner} ${first.ownerLeaf}`);
      lines.push(`    remedy: ${first.remedy}`);
    }
  }
  if (unreachableBuckets.length) {
    lines.push('');
    lines.push(
      `OWED — no route opens these, so no one can photograph them yet `
      + `(${coverage.missingUnreachable.length} frame(s), ${unreachableBuckets.length} surface(s)). `
      + 'They stay in the plan and in this table; the packet named on each row is what clears it.',
    );
    for (const bucket of unreachableBuckets) {
      const first = bucket.missingFiles[0];
      lines.push(`  ${bucket.surface} — ${bucket.missingFiles.length} frame(s), owner ${first.owner} ${first.ownerLeaf}`);
      lines.push(`    remedy: ${first.remedy}`);
    }
  }
  return lines.join('\n');
}

/**
 * Diff every planned frame in one directory against the same frame in another, judged at each
 * surface's own floor. Both halves of the check use it: `referenceDir` vs the capture is the
 * REGRESSION, and the capture vs its rest twin is the REST GUARD. It lives here, not in the CLI, so
 * a test can drive the exact code that decides the exit status — a synthetic frame perturbed by a
 * known amount must come back red through this function, not through a re-implementation of it.
 */
export function judgeFrames({
  plan,
  referenceDir,
  candidateDir,
  floors = loadFloors(),
  frameFileName,
  channelTolerance = DEFAULT_CHANNEL_TOLERANCE,
  captureFailures = [],
  // Frames the coverage report has already ruled not-current. Diffing one would produce exactly the
  // false regression the provenance record exists to prevent, so it is skipped here and billed there.
  skipFrames = null,
}) {
  const rows = [];
  const failures = [];
  const reasonByFrame = new Map();
  for (const failure of captureFailures) {
    const width = failure.viewport && failure.viewport.width;
    const height = failure.viewport && failure.viewport.height;
    if (failure.surface && failure.mode && width && height) {
      reasonByFrame.set(`${failure.surface}-${failure.mode}-${width}x${height}.png`, failure.reason);
    }
  }
  for (const entry of plan) {
    const name = frameFileName(entry);
    if (skipFrames && skipFrames.has(name)) continue;
    const floor = floorForSurface(entry.surface, floors);
    const referencePath = path.join(referenceDir, name);
    const candidatePath = path.join(candidateDir, name);
    const diff = diffPng(referencePath, candidatePath, channelTolerance);
    if (!diff.dimensionsMatch && diff.missing) {
      // WHICH side is missing decides everything, and conflating them is how a check goes green on a
      // regression. No REFERENCE is one coverage failure, reported once in the coverage table; saying
      // it twice would drown the real defects. But a reference that exists with NO CANDIDATE means
      // this run could not photograph a surface it photographed before — the opener regressed — and
      // coverage cannot see that, because coverage only reads the reference directory. Skipping it
      // too would let every opener in the matrix break silently while the check printed PASS.
      if (diff.missing === referencePath) continue;
      const row = {
        name,
        surface: entry.surface,
        mode: entry.mode,
        viewport: entry.viewport,
        floor,
        threshold: floor,
        ratio: 1,
        changedPixels: diff.totalPixels,
        totalPixels: diff.totalPixels,
        dimensionsMatch: false,
        candidateMissing: true,
        reason: reasonByFrame.get(name)
          || 'a reference exists for this frame but this run produced none — the route that opens this surface regressed',
        pass: false,
      };
      rows.push(row);
      failures.push(row);
      continue;
    }
    const pass = diff.ratio <= floor;
    const row = {
      name,
      surface: entry.surface,
      mode: entry.mode,
      viewport: entry.viewport,
      floor,
      threshold: floor,
      ratio: diff.ratio,
      changedPixels: diff.changedPixels,
      totalPixels: diff.totalPixels,
      dimensionsMatch: diff.dimensionsMatch,
      pass,
    };
    rows.push(row);
    if (!pass) failures.push(row);
  }
  return { rows, failures };
}

/**
 * The exit rule, in one place so it can be read and tested rather than inferred from a chain of ifs.
 *
 * RED on: a frame that differs from its reference by more than its surface's floor, a frame that was
 * not at rest when it was photographed, and a MISSING frame on a surface the harness can open.
 * NOT red on: a missing frame for a surface with no route into it — that is owed work with a named
 * owner, printed in full, and a gate that is permanently red for a screen nobody built teaches
 * agents to ignore the gate.
 */
export function decideExit({ coverage, repeatability, visual }) {
  const reasons = [];
  const missingReachable = (coverage && coverage.missingReachable) || [];
  const restFailures = (repeatability && repeatability.failures) || [];
  const diffFailures = (visual && visual.failures) || [];
  if (missingReachable.length) reasons.push(`${missingReachable.length} missing reference frame(s) on surfaces the harness can open`);
  if (restFailures.length) reasons.push(`${restFailures.length} frame(s) were still moving when photographed`);
  const vanished = diffFailures.filter((row) => row.candidateMissing);
  const overFloor = diffFailures.filter((row) => !row.candidateMissing);
  if (vanished.length) reasons.push(`${vanished.length} frame(s) have a reference but this run could not photograph them`);
  if (overFloor.length) reasons.push(`${overFloor.length} frame(s) differ from their reference by more than the surface floor`);
  return { code: reasons.length ? 1 : 0, reasons };
}

export function diffPng(aPath, bPath, channelTolerance = DEFAULT_CHANNEL_TOLERANCE) {
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
    return { totalPixels: maxPixels, changedPixels: maxPixels, ratio: 1, dimensionsMatch: false };
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
