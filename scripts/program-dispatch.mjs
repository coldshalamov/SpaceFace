#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  ProgramControlError,
  readPacket,
  readyDispatchUnits,
  summarizeDispatchUnit,
  summarizePacket,
  validateControlPlane,
} from './lib/programControlPlane.mjs';
import { boardReport } from './board-chunks.mjs';
import { nextPlanUnit, planStatus } from './lib/planFrontDoor.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_STALE_MS = 90 * 60 * 1000;

function fail(message, code = 2, details = []) {
  console.error(`program-dispatch: ${message}`);
  for (const detail of details) console.error(`  - ${detail}`);
  process.exit(code);
}

function usage() {
  console.log(`Usage:
  node scripts/program-dispatch.mjs --next [--include-reserved] [--lane=inference] [--root PATH]
  node scripts/program-dispatch.mjs --status [--root PATH]
  node scripts/program-dispatch.mjs --ready [--root PATH]
  node scripts/program-dispatch.mjs --id PQ-018 [--root PATH]
  node scripts/program-dispatch.mjs --list [--root PATH]

--next is the plan front door. It walks a fixed precedence chain — §6 demo defect ledger, stale
NOW.md rows (adoption), ready dispatch units, ready legacy packets, free §1C board seams, §M
reservoir-admission rows, finished vm-drop jobs, and finally the inference catalog (gated: it
dispatches only with --lane=inference under an explicit owner INFERENCE instruction). It returns
one real, actionable unit, or an honest all-closed. It never errors and never dead-ends while any
surface is open; a surface that fails to parse is skipped with its error recorded in "skipped".
--status prints every surface's count on one screen.

--ready lists every ready dispatch unit of the queue surface alone. --id and --list are explicit
queue queries. A drained queue is not an empty plan: the chain moves to the next surface. Never
treat a drained result as permission to switch to the inference catalog.`);
}

function liveReservations(root) {
  const dir = path.join(root, '.codex', 'agent-checkpoints');
  if (!fs.existsSync(dir)) return new Map();
  const byTask = new Map();
  let names = [];
  try { names = fs.readdirSync(dir).filter((name) => name.endsWith('.json')); } catch { return byTask; }
  for (const name of names) {
    const file = path.join(dir, name);
    let checkpoint;
    try { checkpoint = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (!checkpoint || typeof checkpoint !== 'object' || checkpoint.state === 'DONE') continue;
    const progress = Date.parse(String(checkpoint.lastProgressAt || ''));
    let timestamp = progress;
    if (!Number.isFinite(timestamp)) {
      try { timestamp = fs.statSync(file).mtimeMs; } catch { timestamp = 0; }
    }
    if (!timestamp || Date.now() - timestamp > CHECKPOINT_STALE_MS) continue;
    const taskIds = Array.isArray(checkpoint.reservedTasks) && checkpoint.reservedTasks.length
      ? checkpoint.reservedTasks
      : checkpoint.task ? [checkpoint.task] : [];
    for (const taskId of taskIds) {
      const id = String(taskId);
      if (!byTask.has(id)) byTask.set(id, []);
      byTask.get(id).push({
        owner: String(checkpoint.owner || 'unknown owner'),
        checkpoint: path.relative(root, file).replaceAll('\\', '/'),
        ageMinutes: Math.max(0, Math.round((Date.now() - timestamp) / 60000)),
      });
    }
  }
  return byTask;
}

let values;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    allowPositionals: false,
    options: {
      help: { type: 'boolean', short: 'h' },
      next: { type: 'boolean' },
      status: { type: 'boolean' },
      ready: { type: 'boolean' },
      id: { type: 'string' },
      list: { type: 'boolean' },
      lane: { type: 'string' },
      'include-reserved': { type: 'boolean' },
      root: { type: 'string' },
    },
  }));
} catch (error) {
  fail(error.message);
}

if (values.help) {
  usage();
  process.exit(0);
}

const selectedModes = [values.next, values.status, values.ready, values.id !== undefined, values.list]
  .filter(Boolean).length;
if (selectedModes > 1) fail('choose exactly one of --next, --status, --ready, --id, or --list');
// Bare invocation keeps its historical meaning: it is --next.
const runNext = Boolean(values.next) || selectedModes === 0;
if (values.id !== undefined && !/^PQ-\d{3}$/.test(values.id)) {
  fail(`--id requires a packet ID such as PQ-018, received ${JSON.stringify(values.id)}`);
}
if (values.lane !== undefined && values.lane !== 'inference') {
  fail(`--lane knows only 'inference', received ${JSON.stringify(values.lane)}`);
}

const ROOT = values.root ? path.resolve(values.root) : path.resolve(SCRIPT_DIR, '..');
const queueFile = path.join(ROOT, 'design', 'program', 'roadmap', 'program-queue.json');
const reservations = liveReservations(ROOT);

// The control plane is the queue surface only. Its failing to load must not kill the plan: the
// front door records the failure and dispatches from the next surface instead.
let control = null;
let controlError = null;
try {
  const parsed = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  control = validateControlPlane(ROOT, parsed);
} catch (error) {
  if (error instanceof ProgramControlError) {
    controlError = { message: error.message, details: error.details.slice(0, 12) };
  } else {
    controlError = {
      message: `cannot load ${path.relative(ROOT, queueFile)} (${error.message})`,
      details: [],
    };
  }
}

function requireControl() {
  if (!control) {
    fail(controlError.message, 2, controlError.details);
  }
  return control;
}

try {
  if (runNext) {
    const { unit, skipped } = nextPlanUnit(ROOT, {
      control,
      controlError,
      reservations,
      includeReserved: values['include-reserved'],
      lane: values.lane,
    });
    if (unit) {
      console.log(JSON.stringify(unit, null, 2));
    } else {
      console.log(JSON.stringify({
        plan: 'all-closed',
        rule: 'Every plan surface reports empty. Confirm with --status; if any surface still shows open items there, the front door failed to answer and that is a defect — fix it in this sitting (total-fix mode). The inference catalog stays gated behind --lane=inference.',
        skipped,
      }, null, 2));
    }
    process.exit(0);
  }

  if (values.status) {
    const status = planStatus(ROOT, {
      control,
      controlError,
      reservations,
      lane: values.lane,
    });
    status.expiredEvidence = control
      ? control.warnings.slice(0, 8)
      : controlError.details;
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }

  if (values.ready) {
    requireControl();
    const ready = readyDispatchUnits(control).map((unit) => {
      const summary = summarizeDispatchUnit(unit, control);
      const reservedBy = reservations.get(summary.id);
      if (reservedBy?.length) summary.reservedBy = reservedBy;
      summary.instruction = `${summary.instruction} Fresh lookahead reservations are skipped by --next and are soft session intent, not queue ownership.`;
      return summary;
    });
    console.log(JSON.stringify(ready, null, 2));
    if (!ready.length) {
      console.error('program-dispatch: the queue surface has nothing ready. That is not an empty plan — run --next to take the first unit of the full precedence chain, or --status to see every surface.');
    }
    process.exit(0);
  }

  if (values.list) {
    requireControl();
    const summaries = [];
    for (const row of [...control.rows].sort((a, b) => a.priority - b.priority)) {
      const packet = readPacket(ROOT, row.id);
      if (packet) summaries.push(summarizePacket(row, control, packet));
    }
    console.log(JSON.stringify(summaries, null, 2));
    process.exit(0);
  }

  if (values.id) {
    requireControl();
    const row = control.byId.get(values.id);
    if (!row) fail(`unknown packet ${values.id}`);
    const packet = readPacket(ROOT, values.id);
    if (!packet) fail(`packet ${values.id} has no active packet document`, 1);
    console.log(JSON.stringify(summarizePacket(row, control, packet), null, 2));
    process.exit(0);
  }
} catch (error) {
  if (error instanceof ProgramControlError) fail(error.message, 2, error.details);
  throw error;
}
