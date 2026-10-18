// The plan front door.
//
// Dispatchable work lives on several sanctioned surfaces (defect ledger, NOW.md rows, the landed
// review list, the packet queue, vm-drop, the §1C board, the §M reservoir rows, the inference
// catalog). Agents kept seeing one surface's state — "hundreds of plans", "drained", or a hard
// dispatcher error — as the whole truth. This module is the fix: one precedence chain that walks
// every surface in order and always answers with a real, actionable unit or an honest all-closed.
// A surface that fails to parse is skipped with its error recorded; it never kills the answer.
//
// Chain law (build_map.md §1C preamble): plans move between surfaces only by admission; a drained
// queue is the chain's next leg, not an empty plan; the inference catalog is gated behind an
// explicit owner INFERENCE instruction. Landed reviews sit after stale NOW rows. When
// REVIEW_AHEAD_AT or more are open, the oldest review jumps ahead of the defect ledger so the
// second-look list cannot grow into a backlog.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { boardReport, readBoard } from '../board-chunks.mjs';
import {
  readyDispatchUnits,
  selectNextPacket,
  summarizeDispatchUnit,
  summarizePacket,
} from './programControlPlane.mjs';

export const PLAN_CHAIN = Object.freeze([
  'defect-ledger',
  'now-adoption',
  'landed-review',
  'queue-unit',
  'legacy-packet',
  'ledger-change-loop',
  'board-seam',
  'reservoir-admission',
  'vm-drop-import',
  'inference',
]);

// Owner 2026-10-18: a short review list waits its turn. A list that no longer fits on one
// screen jumps the line, ahead of player-facing defects, until one row is cleared.
export const REVIEW_AHEAD_AT = 8;

const LEDGER_REL = ['design', 'program', 'DEMO_READINESS_2026-09-20.md'];
const INFERENCE_REL = ['design', 'program', 'INFERENCE_IDEAS.md'];
const REVIEW_REL = ['design', 'program', 'LANDED_REVIEW.md'];
const VMDROP_REL = ['design', 'program', 'vm-drop'];

const SHIP_SENTENCE = ' When the unit is finished, commit the exact paths and push origin master by name in the same sitting (AGENTS.md §3). Unless this unit is itself a landed review, add one OPEN row to design/program/LANDED_REVIEW.md naming the commit and what a second agent should re-check. Do not review that row yourself, and do not delay the push for it.';

function withShip(text) {
  return `${text}${SHIP_SENTENCE}`;
}

function truncate(text, max) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// Surface readers. Each returns plain data; they throw on unreadable surfaces
// and the chain turns that into a recorded skip instead of a dead board.
// ---------------------------------------------------------------------------

export function readDefectLedger(root) {
  const file = path.join(root, ...LEDGER_REL);
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('## 6. The demo defect ledger');
  if (start < 0) throw new Error('§6 defect ledger section not found');
  const rest = text.slice(start);
  const end = rest.indexOf('\n## ', 1);
  const body = end < 0 ? rest : rest.slice(0, end);
  const rows = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('| D')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 5) continue;
    const state = cells[cells.length - 1];
    const row = {
      id: cells[0],
      where: cells[1],
      what: cells[2],
      demoStep: cells[3],
      state,
    };
    if (/^OPEN/i.test(state)) row.kind = /change-loop/i.test(state) ? 'loop' : 'open';
    else row.kind = 'watch';
    rows.push(row);
  }
  return {
    rows,
    open: rows.filter((row) => row.kind === 'open'),
    loop: rows.filter((row) => row.kind === 'loop'),
    watch: rows.filter((row) => row.kind === 'watch'),
  };
}

export function readStaleAdoptions(root) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'check-now-liveness.mjs')],
    { cwd: root, encoding: 'utf8', timeout: 60_000 },
  );
  if (result.error) throw result.error;
  const stale = [];
  for (const line of String(result.stdout || '').split(/\r?\n/)) {
    const match = line.match(/^STALE\s+(.*)\s+\[([^\]]+)\]\s+—/);
    if (match) stale.push({ title: match[1].trim(), thread: match[2] });
  }
  return { stale };
}

export function readVmDrop(root) {
  const dir = path.join(root, ...VMDROP_REL);
  const jobs = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { jobs };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const jobDir = path.join(dir, entry.name);
    const done = path.join(jobDir, 'DONE.md');
    if (!fs.existsSync(done)) continue;
    jobs.push({
      name: entry.name,
      hasImport: fs.existsSync(path.join(jobDir, 'IMPORT.md')),
      doneMtime: fs.statSync(done).mtimeMs,
    });
  }
  jobs.sort((a, b) => b.doneMtime - a.doneMtime);
  return { jobs };
}

export function readBoardSurface(root) {
  const text = fs.readFileSync(path.join(root, 'build_map.md'), 'utf8');
  const board = readBoard(text);
  return { board, report: boardReport(board) };
}

export function readLandedReview(root) {
  const file = path.join(root, ...REVIEW_REL);
  if (!fs.existsSync(file)) return { open: [] };
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('## Open reviews');
  if (start < 0) throw new Error('landed review section not found');
  const rest = text.slice(start);
  const end = rest.indexOf('\n## ', 1);
  const body = end < 0 ? rest : rest.slice(0, end);
  const open = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('| R-')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const status = cells[cells.length - 1];
    if (!/^OPEN\b/i.test(status)) continue;
    open.push({
      id: cells[0],
      commit: cells[1],
      task: cells[2],
      what: cells.slice(3, -1).join(' ').trim(),
      status,
    });
  }
  return { open };
}

export function readInference(root) {
  const text = fs.readFileSync(path.join(root, ...INFERENCE_REL), 'utf8');
  let open = 0;
  let claimed = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 2) continue;
    const status = cells[cells.length - 1];
    if (/^OPEN\b/.test(status)) open += 1;
    else if (/^CLAIMED\b/.test(status)) claimed += 1;
  }
  return { open, claimed };
}

// ---------------------------------------------------------------------------
// Unit builders. Every unit is self-sufficient: an agent that knows nothing but
// this JSON can start and finish the work.
// ---------------------------------------------------------------------------

function defectLedgerUnit(row) {
  if (row.kind === 'loop') {
    return {
      source: 'defect-ledger',
      kind: 'change-loop',
      id: `${row.id}:change-loop`,
      title: `${row.id} change-loop: pick one named site, change the code, re-run its focused fixture`,
      where: row.where,
      what: row.what,
      instruction: 'This row is a standing change-loop, not a one-shot defect (it ranks below fresh build work by design). Pick one named site from the row, change the code, re-run the same focused fixture to confirm the delta and no authored-quality regression, and land or revert in the same sitting. Push origin master if you land a change. Measurement alone closes nothing. Append the leg to the row; the row leaves the ledger only when the loop itself is closed. A change-loop leg does not add a landed-review row.',
    };
  }
  return {
    source: 'defect-ledger',
    kind: 'open',
    id: row.id,
    title: `Fix demo defect ${row.id}, then delete its ledger row in the same commit`,
    where: row.where,
    what: row.what,
    demoStep: row.demoStep,
    instruction: withShip('Total-fix mode: a demo player hits this. Fix the defect, then remove the row from design/program/DEMO_READINESS_2026-09-20.md §6 in the same commit — rows leave the ledger only by being fixed (screen rows: re-shot through the bench first). A gameplay fix attaches the player-truth verdict (npm run player-truth -- --mode=<mode> --gate) before landing.'),
  };
}

function nowAdoptionUnit(entry) {
  return {
    source: 'now-adoption',
    id: `adopt:${entry.thread}`,
    title: `Adopt stale NOW.md row (${entry.thread}): ${truncate(entry.title, 110)}`,
    instruction: withShip('The row is stale by definition (90+ minutes without progress) — NOW.md rule 3a sanctions adoption; do not route around it. Inspect the dirty diff the row names, preserve foreign hunks, finish or land the work by exact pathspec, receipt it, and delete the row from design/program/NOW.md.'),
  };
}

function vmDropImportUnit(job) {
  return {
    source: 'vm-drop-import',
    id: `vm-drop:${job.name}`,
    title: `Review finished vm-drop job ${job.name} and import its patches if they still apply`,
    instruction: withShip(`Read design/program/vm-drop/${job.name}/DONE.md and IMPORT.md (plus IMPORT_DIGEST for stack order). Import the finished patches onto master per-folder if they still apply, or record why not in the job folder. Never write new files under design/program/vm-drop/ locally — that tree is remote-authoritative.`),
  };
}

function boardSeamUnit(seam) {
  return {
    source: 'board-seam',
    id: `seam:${seam.seam}`,
    title: `Claim free seam ${seam.seam} and do its ${seam.openRows.length} open row${seam.openRows.length === 1 ? '' : 's'}`,
    files: seam.files,
    rows: seam.openRows,
    instruction: withShip('Write your thread label into the seam\'s Claim cell in build_map.md §1C, then do its open rows in order. Finish the named outcome of each row. This is the board — a drained queue was never an empty plan.'),
  };
}

function reservoirAdmissionUnit(entry) {
  return {
    source: 'reservoir-admission',
    id: entry.id,
    boardRow: entry.number,
    title: `${entry.id} (build_map §1C row ${entry.number}): admit a program-family slice into numbered rows`,
    status: truncate(entry.status, 240),
    instruction: withShip('This ADMIT row is one program family or brief batch of the reservoir — disposition every candidate it names: outcome-map each against current code, close already-true ones with evidence, route lane-owned work to that lane\'s backlog, and mint genuinely new work as numbered §1C rows (next free block of 14 above the current max row, recorded in your NOW row before minting). Delete the row when all its candidates are dispositioned. The board\'s "whole remaining count" table is the honest size of the plan — a drained queue is not an empty plan; do not switch to the inference catalog.'),
  };
}

function landedReviewUnit(row) {
  return {
    source: 'landed-review',
    id: row.id,
    commit: row.commit,
    task: row.task,
    title: `Second look at ${row.id} (${truncate(row.task, 80)})`,
    what: row.what,
    instruction: 'This work is already committed and pushed. Read that commit and confirm the claim on the row. A small miss: fix it, commit the exact paths, and push origin master. A player-facing break you cannot finish in this sitting: add one demo-ledger row. Delete this row from design/program/LANDED_REVIEW.md in the commit that finishes the look. Do not add another review row. Do not close a row you added in this same sitting — that look belongs to a later session.',
  };
}

function openReviewUnit(root) {
  const review = readLandedReview(root);
  return review.open[0] ? landedReviewUnit(review.open[0]) : null;
}

function inferenceUnit() {
  return {
    source: 'inference',
    id: 'INFERENCE_IDEAS',
    title: 'Take the first OPEN line of the inference catalog',
    instruction: withShip('Gated surface: take a line only under an explicit owner INFERENCE instruction (AGENTS.md §1). Follow INFERENCE_IDEAS.md "How to take a line": mark the line CLAIMED in the same edit as your NOW.md row, change only the owners it names, prove the done sentence on a fixed seed, mark it SHIPPED with the commit.'),
  };
}

// ---------------------------------------------------------------------------
// Queue leg (uses an already-validated control plane; null control skips it).
// ---------------------------------------------------------------------------

export function nextQueueUnit(root, control, { reservations = new Map(), includeReserved = false } = {}) {
  const ready = readyDispatchUnits(control);
  const candidates = includeReserved
    ? ready
    : ready.filter((unit) => !reservations.has(unit.id));
  if (candidates[0]) {
    const unit = summarizeDispatchUnit(candidates[0], control);
    unit.source = 'queue-unit';
    const reservedBy = reservations.get(unit.id);
    if (reservedBy?.length) unit.reservedBy = reservedBy;
    unit.instruction = `${unit.instruction} Fresh lookahead reservations are skipped by the chain and are soft session intent, not queue ownership.${SHIP_SENTENCE}`;
    return { unit, remaining: ready.length };
  }
  return {
    unit: null,
    remaining: ready.length,
    reason: ready.length
      ? 'all ready dispatch units carry fresh lookahead reservations'
      : null,
  };
}

// ---------------------------------------------------------------------------
// The chain.
// ---------------------------------------------------------------------------

export function nextPlanUnit(root, options = {}) {
  const {
    control = null,
    controlError = null,
    reservations = new Map(),
    includeReserved = false,
    lane = null,
  } = options;
  const skipped = [];
  let reviewAhead = false;
  try {
    reviewAhead = readLandedReview(root).open.length >= REVIEW_AHEAD_AT;
  } catch {
    reviewAhead = false;
  }

  const leg = (name, produce) => {
    try {
      const unit = produce();
      if (unit) return unit;
      skipped.push({ leg: name, reason: 'empty' });
    } catch (error) {
      skipped.push({ leg: name, reason: `error: ${truncate(error.message, 200)}` });
    }
    return null;
  };

  let unit = null;
  if (reviewAhead) {
    unit = leg('landed-review', () => openReviewUnit(root));
    if (unit) return { unit, skipped };
  }

  unit = leg('defect-ledger', () => {
    const ledger = readDefectLedger(root);
    // A specific open defect outranks new work. A standing change-loop has its own chain
    // position below the fresh build work (see 'ledger-change-loop'). REVIEW_AHEAD_AT or
    // more landed reviews jump ahead of this leg.
    const row = ledger.open[0];
    return row ? defectLedgerUnit(row) : null;
  });
  if (unit) return { unit, skipped };

  unit = leg('now-adoption', () => {
    const { stale } = readStaleAdoptions(root);
    return stale[0] ? nowAdoptionUnit(stale[0]) : null;
  });
  if (unit) return { unit, skipped };

  if (!reviewAhead) {
    unit = leg('landed-review', () => openReviewUnit(root));
    if (unit) return { unit, skipped };
  }

  unit = leg('queue-unit', () => {
    if (!control) {
      skipped.push({ leg: 'queue-unit', reason: `control plane unavailable: ${controlError ? truncate(controlError.message, 200) : 'not provided'}` });
      return null;
    }
    const result = nextQueueUnit(root, control, { reservations, includeReserved });
    if (result.reason) skipped.push({ leg: 'queue-unit', reason: result.reason });
    return result.unit;
  });
  if (unit) return { unit, skipped };

  unit = leg('legacy-packet', () => {
    if (!control) {
      skipped.push({ leg: 'legacy-packet', reason: 'control plane unavailable' });
      return null;
    }
    const next = selectNextPacket(control, root);
    if (!next) return null;
    const packetUnit = { ...summarizePacket(next.row, control, next.packet), source: 'legacy-packet' };
    packetUnit.instruction = `${packetUnit.instruction || ''}${SHIP_SENTENCE}`;
    return packetUnit;
  });
  if (unit) return { unit, skipped };

  unit = leg('ledger-change-loop', () => {
    const ledger = readDefectLedger(root);
    return ledger.loop[0] ? defectLedgerUnit(ledger.loop[0]) : null;
  });
  if (unit) return { unit, skipped };

  unit = leg('board-seam', () => {
    const { report } = readBoardSurface(root);
    const seam = report.free.find((entry) => entry.openRows.length > 0);
    return seam ? boardSeamUnit(seam) : null;
  });
  if (unit) return { unit, skipped };

  unit = leg('reservoir-admission', () => {
    const { board } = readBoardSurface(root);
    const entry = board.open.find((row) => /^ADMIT/i.test(row.id));
    return entry ? reservoirAdmissionUnit(entry) : null;
  });
  if (unit) return { unit, skipped };

  unit = leg('vm-drop-import', () => {
    const { jobs } = readVmDrop(root);
    return jobs[0] ? vmDropImportUnit(jobs[0]) : null;
  });
  if (unit) return { unit, skipped };

  unit = leg('inference', () => {
    const inference = readInference(root);
    if (!inference.open) return null;
    if (lane !== 'inference') {
      skipped.push({ leg: 'inference', reason: 'gated: open lines exist but no --lane=inference (owner INFERENCE instruction required)' });
      return null;
    }
    return inferenceUnit();
  });
  if (unit) return { unit, skipped };

  return { unit: null, skipped };
}

export function planStatus(root, options = {}) {
  const safe = (name, produce) => {
    try {
      return produce();
    } catch (error) {
      return { error: truncate(error.message, 200) };
    }
  };

  const surfaces = {};
  surfaces.ledger = safe('defect-ledger', () => {
    const ledger = readDefectLedger(root);
    return {
      open: ledger.open.map((row) => row.id),
      changeLoops: ledger.loop.map((row) => row.id),
      watchOnly: ledger.watch.map((row) => row.id),
    };
  });
  surfaces.now = safe('now-adoption', () => {
    const { stale } = readStaleAdoptions(root);
    return { staleRows: stale.map((entry) => entry.thread) };
  });
  surfaces.review = safe('landed-review', () => {
    const review = readLandedReview(root);
    return { open: review.open.map((row) => row.id), aheadAt: REVIEW_AHEAD_AT };
  });
  surfaces.queue = safe('queue', () => {
    if (options.controlError && !options.control) {
      return { error: truncate(options.controlError.message, 200) };
    }
    const control = options.control;
    const ready = control ? readyDispatchUnits(control) : [];
    return {
      readyUnits: ready.length,
      reservedReadyUnits: options.reservations
        ? ready.filter((unit) => options.reservations.has(unit.id)).length
        : 0,
      expiredEvidenceRows: control ? control.integrationEvidenceExpired.size : 0,
      verifiedIntegrationRows: control ? control.verifiedIntegrationIds.size : 0,
    };
  });
  surfaces.vmDrop = safe('vm-drop-import', () => {
    const { jobs } = readVmDrop(root);
    return { finishedJobs: jobs.length, newest: jobs[0]?.name || null };
  });
  surfaces.board = safe('board-seam', () => {
    const { board, report } = readBoardSurface(root);
    const freeWithRows = report.free.filter((entry) => entry.openRows.length > 0);
    return {
      freeSeams: freeWithRows.map((entry) => ({ seam: entry.seam, openRows: entry.openRows.length })),
      openRowCount: board.open.length,
      drift: {
        orphanRows: report.orphans,
        rowsMissingFromSeams: report.missingFromBoard,
        duplicatedRows: report.duplicatedRows,
      },
    };
  });
  surfaces.reservoir = safe('reservoir-admission', () => {
    const { board } = readBoardSurface(root);
    return {
      openAdmissionRows: board.open
        .filter((row) => /^ADMIT/i.test(row.id))
        .map((row) => ({ row: row.number, id: row.id })),
    };
  });
  surfaces.inference = safe('inference', () => {
    const inference = readInference(root);
    return { ...inference, gated: 'only with --lane=inference under an owner INFERENCE instruction' };
  });

  const { unit, skipped } = nextPlanUnit(root, options);
  const openSurface = Object.entries(surfaces).some(([name, surface]) => {
    if (!surface || surface.error) return false;
    if (name === 'ledger') return surface.open.length + surface.changeLoops.length > 0;
    if (name === 'now') return surface.staleRows.length > 0;
    if (name === 'review') return surface.open.length > 0;
    if (name === 'queue') return surface.readyUnits > 0;
    if (name === 'vm-drop-import' || name === 'vmDrop') return surface.finishedJobs > 0;
    if (name === 'board') return surface.freeSeams.length > 0;
    if (name === 'reservoir') return surface.openAdmissionRows.length > 0;
    if (name === 'inference') return false; // gated surfaces do not force an answer
    return false;
  });
  return {
    plan: unit ? 'ready' : openSurface ? 'front-door-failed-to-answer' : 'all-closed',
    next: unit ? { source: unit.source, id: unit.id, title: unit.title } : null,
    surfaces,
    skipped,
  };
}
