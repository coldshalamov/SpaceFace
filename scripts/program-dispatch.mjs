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

function fail(message, code = 2, details = []) {
  console.error(`program-dispatch: ${message}`);
  for (const detail of details) console.error(`  - ${detail}`);
  process.exit(code);
}

function usage() {
  console.log(`Usage:
  node scripts/program-dispatch.mjs --next [--root PATH]
  node scripts/program-dispatch.mjs --ready [--root PATH]
  node scripts/program-dispatch.mjs --id PQ-018 [--root PATH]
  node scripts/program-dispatch.mjs --list [--root PATH]

When dispatchUnits exist, --next returns the first claim-ready unit and --ready returns every
claim-ready unit. Outputs compact JSON and never grants a lease or acceptance claim.`);
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
      readyDispatchUnits(control).map((unit) => summarizeDispatchUnit(unit, control)),
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
    const [nextUnit] = readyDispatchUnits(control);
    if (!nextUnit) fail('no claim-ready dispatch unit found', 1);
    console.log(JSON.stringify(summarizeDispatchUnit(nextUnit, control), null, 2));
    process.exit(0);
  }

  const next = selectNextPacket(control, ROOT);
  if (!next) fail('no dependency-ready executable packet found', 1);
  console.log(JSON.stringify(summarizePacket(next.row, control, next.packet), null, 2));
} catch (error) {
  if (error instanceof ProgramControlError) fail(error.message, 2, error.details);
  throw error;
}
