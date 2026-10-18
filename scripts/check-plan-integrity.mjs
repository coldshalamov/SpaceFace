#!/usr/bin/env node
// check:plan-integrity — the plan system answers, or this gate is red.
//
// The board has three failure modes agents actually hit: the dispatcher hard-errors (the 2026-09
// squash left 40+ integratedCommit objects unresolvable and the validator fail-closed the whole
// tool), a drained queue reads as "no plan" while reservoirs hold hundreds of candidates, and
// plan lists mutate or vanish under live lanes. This check pins the contract mechanically:
//
//   1. The queue control plane loads. Expired evidence (a committed claim whose proof object was
//      lost to history maintenance) is allowed and counted; a LIVE contradiction (commit resolves
//      but is not an ancestor of HEAD) is not.
//   2. Every sanctioned plan surface parses: §6 defect ledger, NOW.md liveness, the landed-review
//      list, the §1C board, the §M admission rows, the inference catalog. vm-drop is optional
//      (fresh clones lack it).
//   3. The §1C board has no drift (orphans, missing seam rows, duplicated rows).
//   4. The front door answers: while any ungated surface is open, `--next` must return a real
//      unit, and it must never return the gated inference surface without the lane flag.
//
// Red here means an agent would soon see an erroring, lying, or empty plan board — fix it in the
// same sitting (total-fix mode).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ProgramControlError, validateControlPlane } from './lib/programControlPlane.mjs';
import {
  nextPlanUnit,
  readDefectLedger,
  readInference,
  readLandedReview,
  readStaleAdoptions,
  readVmDrop,
} from './lib/planFrontDoor.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

let values;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    allowPositionals: false,
    options: { root: { type: 'string' } },
  }));
} catch (error) {
  console.error(`plan-integrity: ${error.message}`);
  process.exit(2);
}

const ROOT = values.root ? path.resolve(values.root) : path.resolve(SCRIPT_DIR, '..');
const problems = [];
const notes = [];

// 1. The queue control plane loads; expiry recorded, contradiction fatal.
let control = null;
try {
  const queueFile = path.join(ROOT, 'design', 'program', 'roadmap', 'program-queue.json');
  const parsed = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  control = validateControlPlane(ROOT, parsed);
  if (control.integrationEvidenceExpired.size) {
    notes.push(`queue: ${control.integrationEvidenceExpired.size} rows carry expired integration evidence (accepted, recorded)`);
  }
} catch (error) {
  const detail = error instanceof ProgramControlError
    ? `${error.message}: ${(error.details || []).slice(0, 5).join(' | ')}`
    : error.message;
  problems.push(`queue control plane does not load: ${detail}`);
}

// 2a. Defect ledger parses with well-formed actionable rows.
try {
  const ledger = readDefectLedger(ROOT);
  notes.push(`defect ledger: ${ledger.open.length} open, ${ledger.loop.length} change-loop, ${ledger.watch.length} watch-only`);
  for (const row of [...ledger.open, ...ledger.loop]) {
    if (!row.id || !row.state) problems.push(`defect ledger: actionable row missing id/state`);
    if (!row.where || !row.what) problems.push(`defect ledger ${row.id}: actionable row missing where/what columns`);
  }
} catch (error) {
  problems.push(`defect ledger unreadable: ${error.message}`);
}

// 2b. NOW.md liveness runs (stale rows are work, not a problem).
try {
  const { stale } = readStaleAdoptions(ROOT);
  notes.push(`NOW.md: ${stale.length} stale row(s) adoptable`);
} catch (error) {
  problems.push(`NOW.md liveness does not run: ${error.message}`);
}

// 2c/3. Board parses and has no drift.
try {
  const { readBoard } = await import('./board-chunks.mjs');
  const board = readBoard(fs.readFileSync(path.join(ROOT, 'build_map.md'), 'utf8'));
  notes.push(`§1C board: ${board.open.length} open rows, ${board.seams.length} seams`);
  if (board.orphans.length) {
    problems.push(`§1C board drift: open rows missing from the seam table: ${board.orphans.join(', ')}`);
  }
  if (board.missing.length) {
    problems.push(`§1C board drift: seam rows missing from the row table: ${board.missing.join(', ')}`);
  }
  if (board.dupes.length) {
    problems.push(`§1C board drift: rows listed in two seams: ${board.dupes.map((d) => d.number).join(', ')}`);
  }
} catch (error) {
  problems.push(`§1C board unreadable: ${error.message}`);
}

// 2d. Landed-review list parses. A missing file is a broken front door; an empty table is fine.
let reviews = { open: [] };
const reviewFile = path.join(ROOT, 'design', 'program', 'LANDED_REVIEW.md');
if (!fs.existsSync(reviewFile)) {
  problems.push('landed review ledger is missing: design/program/LANDED_REVIEW.md');
} else {
  try {
    reviews = readLandedReview(ROOT);
    notes.push(`landed review: ${reviews.open.length} open`);
  } catch (error) {
    problems.push(`landed review unreadable: ${error.message}`);
  }
}

// 2e. Inference catalog parses.
try {
  const inference = readInference(ROOT);
  notes.push(`inference catalog: ${inference.open} OPEN, ${inference.claimed} CLAIMED (gated surface)`);
} catch (error) {
  problems.push(`inference catalog unreadable: ${error.message}`);
}

// 2f. vm-drop is optional.
const vmDrop = readVmDrop(ROOT);
if (vmDrop.jobs.length) notes.push(`vm-drop: ${vmDrop.jobs.length} finished job folder(s)`);

// 4. The front door answers whenever any ungated surface is open.
try {
  const { unit } = nextPlanUnit(ROOT, { control });
  if (unit) {
    notes.push(`front door: next unit ${unit.source}/${unit.id}`);
    if (unit.source === 'inference') {
      problems.push('front door returned the gated inference surface without --lane=inference');
    }
  } else {
    const ledger = readDefectLedger(ROOT);
    const { readBoard } = await import('./board-chunks.mjs');
    const board = readBoard(fs.readFileSync(path.join(ROOT, 'build_map.md'), 'utf8'));
    const queueReady = control ? control.dispatchUnits.some((unit2) => unit2.state === 'ready') : false;
    const boardOpen = board.open.some((row) => !/^ADMIT/i.test(row.id));
    const reservoirOpen = board.open.some((row) => /^ADMIT/i.test(row.id));
    if (ledger.open.length || ledger.loop.length || reviews.open.length || queueReady || boardOpen || reservoirOpen) {
      problems.push('front door returned no unit while open surfaces exist — the plan board is dead');
    } else {
      notes.push('front door: all-closed is honest (no ungated surface is open)');
    }
  }
} catch (error) {
  problems.push(`front door threw: ${error.message}`);
}

if (problems.length) {
  console.error(`plan-integrity: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
for (const note of notes) console.log(`plan-integrity: ${note}`);
console.log('plan-integrity: PASS — the plan system answers');
