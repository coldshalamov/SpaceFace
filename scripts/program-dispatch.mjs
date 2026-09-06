#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  ProgramControlError,
  readyDispatchUnits,
  readPacket,
  selectNextPacket,
  summarizeDispatchUnit,
  summarizePacket,
  validateControlPlane,
} from './lib/programControlPlane.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_STALE_MS = 90 * 60 * 1000;

function fail(message, code = 2, details = []) {
  console.error(`program-dispatch: ${message}`);
  for (const detail of details) console.error(`  - ${detail}`);
  process.exit(code);
}

function usage() {
  console.log(`Usage:
  node scripts/program-dispatch.mjs --next [--include-reserved] [--root PATH]
  node scripts/program-dispatch.mjs --ready [--root PATH]
  node scripts/program-dispatch.mjs --id PQ-018 [--root PATH]
  node scripts/program-dispatch.mjs --list [--root PATH]

When dispatchUnits exist, --next returns the first ready unit without a fresh lookahead reservation;
--include-reserved is for explicit inspection. --ready returns every ready unit and annotates reserved
ones. Outputs compact JSON; starting a task requires no separate coordinator or lease.`);
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
      ready: { type: 'boolean' },
      id: { type: 'string' },
      list: { type: 'boolean' },
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

const selectedModes = [values.next, values.ready, values.id !== undefined, values.list].filter(Boolean).length;
if (selectedModes > 1) fail('choose exactly one of --next, --ready, --id, or --list');
if (values.id !== undefined && !/^PQ-\d{3}$/.test(values.id)) {
  fail(`--id requires a packet ID such as PQ-018, received ${JSON.stringify(values.id)}`);
}

const ROOT = values.root ? path.resolve(values.root) : path.resolve(SCRIPT_DIR, '..');
const queueFile = path.join(ROOT, 'design', 'program', 'roadmap', 'program-queue.json');
const reservations = liveReservations(ROOT);

function summarizeUnit(unit, control) {
  const summary = summarizeDispatchUnit(unit, control);
  const reservedBy = reservations.get(unit.id);
  if (reservedBy?.length) summary.reservedBy = reservedBy;
  summary.instruction = `${summary.instruction} Fresh lookahead reservations are skipped by --next and are soft session intent, not queue ownership.`;
  return summary;
}

let control;
try {
  const parsed = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  control = validateControlPlane(ROOT, parsed);
} catch (error) {
  if (error instanceof ProgramControlError) fail(error.message, 2, error.details);
  fail(`cannot load ${path.relative(ROOT, queueFile)} (${error.message})`);
}

try {
  if (values.ready) {
    console.log(JSON.stringify(
      readyDispatchUnits(control).map((unit) => summarizeUnit(unit, control)),
      null,
      2,
    ));
    process.exit(0);
  }

  if (values.list) {
    const summaries = [];
    for (const row of [...control.rows].sort((a, b) => a.priority - b.priority)) {
      const packet = readPacket(ROOT, row.id);
      if (packet) summaries.push(summarizePacket(row, control, packet));
    }
    console.log(JSON.stringify(summaries, null, 2));
    process.exit(0);
  }

  if (values.id) {
    const row = control.byId.get(values.id);
    if (!row) fail(`unknown packet ${values.id}`);
    const packet = readPacket(ROOT, values.id);
    if (!packet) fail(`packet ${values.id} has no active packet document`, 1);
    console.log(JSON.stringify(summarizePacket(row, control, packet), null, 2));
    process.exit(0);
  }

  if (control.dispatchUnits.length > 0) {
    const ready = readyDispatchUnits(control);
    const candidates = values['include-reserved']
      ? ready
      : ready.filter((unit) => !reservations.has(unit.id));
    const [nextUnit] = candidates;
    if (!nextUnit) {
      if (!ready.length) fail('no ready dispatch unit found', 1);
      fail(`all ${ready.length} ready dispatch units have fresh lookahead reservations; inspect --ready or use --include-reserved explicitly`, 1);
    }
    console.log(JSON.stringify(summarizeUnit(nextUnit, control), null, 2));
    process.exit(0);
  }

  const next = selectNextPacket(control, ROOT);
  if (!next) fail('no dependency-ready executable packet found', 1);
  console.log(JSON.stringify(summarizePacket(next.row, control, next.packet), null, 2));
} catch (error) {
  if (error instanceof ProgramControlError) fail(error.message, 2, error.details);
  throw error;
}
