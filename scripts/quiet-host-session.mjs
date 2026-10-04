#!/usr/bin/env node
// Quiet-host consolidated session runner — the executable half of
// design/program/QUIET_HOST_PROGRAM.md (read that file for the consumer law).
//
// One clean machine, one batch, sequential — never two headed probes at once (the GPU
// contention that killed D24 soak attempts F+G). Every step names the row it closes, the
// fix it validates, or the loop it feeds. Raw output lands in .devshots/ (gitignored);
// the committed artifact is the receipt the runner prints a skeleton for.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ISOLATED_ENV = { SPACEFACE_PLAYER_STORE_DIR: '' };

const STEPS = [
  {
    id: 'qh1',
    title: 'D24 renderer-residency soak (40 cycles, heap snapshots)',
    commands: [
      { argv: ['node', 'scripts/check-release-soak-browser.mjs', '--cycles=40'], env: { SF_SOAK_HEAP_SNAPSHOTS: '1', ...ISOLATED_ENV } },
    ],
    consumer: 'Flat LoadedRenderPackage/JSArrayBufferData heap diff DELETES ledger row D24; a surviving slope names the residual-fix task on that row.',
  },
  {
    id: 'qh2',
    title: 'Career-earnings benchmark timing datum (asserts already green)',
    commands: [
      { argv: ['node', 'scripts/check-career-earnings-benchmark.mjs', '--minutes', '30'], env: ISOLATED_ENV },
      { argv: ['node', 'scripts/check-career-earnings-benchmark.mjs', '--minutes', '90'], env: ISOLATED_ENV },
    ],
    consumer: 'The recorded wall-clock closes ledger row D85 as a host datum, not a defect.',
  },
  {
    id: 'qh3',
    title: 'Boot media screencast confirm',
    commands: [
      { argv: ['node', 'tools/cinematic/boot-media-proof.mjs'], env: ISOLATED_ENV },
    ],
    consumer: 'Gap gone on quiet hardware DELETES ledger row D131; gap persists with the same shape reopens the row against media, not the harness.',
  },
  {
    id: 'qh4',
    title: 'Native acceptance pair (PERF-04 + PERF-07) — packet-driven, run by hand',
    manual: 'Follow design/program/roadmap/active/PQ-038.md and PQ-041.md (build:bundle -> electron-builder --dir -> paired browser route).',
    consumer: 'Closes board rows 61; row 65 (PQ-042) auto-opens.',
  },
  {
    id: 'qh5',
    title: 'Corridor-asset perf envelope (PQ-022 H3)',
    commands: [
      { argv: ['node', 'scripts/check-pq022-corridor-assets.mjs'], env: ISOLATED_ENV },
    ],
    consumer: 'Closes board row 62 (packet PQ-022 governs the exact candidate).',
  },
  {
    id: 'qh6',
    title: 'Fifteen-minute demo path — play-and-fix (route check + crucible frame letter)',
    commands: [
      { argv: ['node', 'scripts/check-crucible-route.mjs'], env: ISOLATED_ENV },
      { argv: ['node', 'scripts/probe-smooth-flight.mjs', '--crucible'], env: ISOLATED_ENV },
    ],
    consumer: 'Human then plays DEMO_READINESS §5; everything that breaks becomes a ledger row fixed this sitting. Board row 66 closes when the path plays with zero new rows.',
  },
  {
    id: 'qh7',
    title: 'General playtest block — witness-instrumented bug hunt (not freeze-hunting)',
    commands: [
      { argv: ['node', 'scripts/probe-runtime-witness.mjs'], env: ISOLATED_ENV },
    ],
    consumer: 'Read .devshots/runtime-witness/report.md; findings become ledger rows. Program §4 is the only recurrence protocol.',
  },
  {
    id: 'qh8',
    title: 'Quiet-silicon perf baselines for the D130 change-loop',
    commands: [
      { argv: ['node', 'scripts/probe-smooth-flight.mjs'], env: ISOLATED_ENV },
      { argv: ['node', 'scripts/probe-frame-solid.mjs', '--cpu-profile'], env: ISOLATED_ENV },
    ],
    consumer: 'Baseline receipt the D130 optimization sittings diff against; input to the loop, never a deliverable.',
  },
];

const only = (() => {
  const flag = process.argv.find((a) => a.startsWith('--only='));
  return flag ? flag.slice('--only='.length).split(',').map((s) => s.trim()) : null;
})();
const dryRun = process.argv.includes('--dry-run');
const listOnly = process.argv.includes('--list');

if (listOnly || dryRun) {
  console.log('Quiet-host session steps (design/program/QUIET_HOST_PROGRAM.md):\n');
  for (const step of STEPS) {
    const picked = !only || only.includes(step.id);
    console.log(`${picked ? ' ' : 'x'} ${step.id.toUpperCase()}  ${step.title}`);
    console.log(`      consumer: ${step.consumer}`);
    for (const cmd of step.commands ?? []) console.log(`      runs: ${cmd.argv.join(' ')}`);
    if (step.manual) console.log(`      manual: ${step.manual}`);
  }
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join('.devshots', 'quiet-host', stamp);
mkdirSync(outDir, { recursive: true });
const report = [];
let failures = 0;

function runOne(step, cmd) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd.argv[0], cmd.argv.slice(1), {
      env: { ...process.env, ...cmd.env },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('exit', (code) => resolve({ code, ms: Date.now() - started }));
    child.on('error', (err) => {
      console.error(`  spawn failed: ${err.message}`);
      resolve({ code: -1, ms: Date.now() - started });
    });
  });
}

console.log(`Quiet-host session — output dir: ${outDir}\n`);
for (const step of STEPS) {
  if (only && !only.includes(step.id)) continue;
  console.log(`\n=== ${step.id.toUpperCase()} — ${step.title} ===`);
  console.log(`consumer: ${step.consumer}`);
  if (step.manual) {
    console.log(`MANUAL — ${step.manual}`);
    report.push({ id: step.id, title: step.title, status: 'MANUAL', consumer: step.consumer });
    continue;
  }
  const results = [];
  for (const cmd of step.commands) {
    console.log(`$ ${cmd.argv.join(' ')}`);
    const r = await runOne(step, cmd);
    results.push({ command: cmd.argv.join(' '), exit: r.code, seconds: Math.round(r.ms / 1000) });
    console.log(`  exit ${r.code} (${Math.round(r.ms / 1000)}s)`);
    if (r.code !== 0) failures += 1;
  }
  report.push({
    id: step.id,
    title: step.title,
    status: results.every((r) => r.exit === 0) ? 'ok' : 'FAILED',
    runs: results,
    consumer: step.consumer,
  });
}

const lines = [
  `# Quiet-host session ${stamp}`,
  '',
  `Failures: ${failures} · Report log: ${outDir}`,
  '',
  '| Step | Status | Runs (exit / s) | Consumer |',
  '|---|---|---|---|',
  ...report.map((r) => `| ${r.id.toUpperCase()} | ${r.status} | ${(r.runs ?? []).map((c) => `${c.command} → ${c.exit} / ${c.seconds}s`).join('<br>') || '—'} | ${r.consumer} |`),
  '',
  'Next: fill the receipt template in design/program/QUIET_HOST_PROGRAM.md §5, save it as',
  'design/program/roadmap/receipts/QUIET-HOST-SESSION-<date>.md, and delete every row this',
  'session closed in the same commit. Raw captures stay in .devshots/ (gitignored).',
];
const reportPath = path.join(outDir, 'REPORT.md');
writeFileSync(reportPath, lines.join('\n') + '\n');
console.log(`\nReport written: ${reportPath}`);
console.log('Now write the committed receipt (QUIET_HOST_PROGRAM.md §5) and close the rows it served.');
process.exit(failures === 0 ? 0 : 1);
