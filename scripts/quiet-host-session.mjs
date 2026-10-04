#!/usr/bin/env node
// Quiet-host consolidated session runner — the executable half of
// design/program/QUIET_HOST_PROGRAM.md (read that file for the consumer law).
//
// Producer/consumer split (owner 2026-10-04): the dedicated clean machine PRODUCES
// evidence; every other machine only CONSUMES landed receipts. This runner is the
// producer's whole job and refuses to run anywhere else — on the shared dev box it
// exits 2 with instructions, so an agent that tries it locally stops instead of
// taking contaminated readings or starving the GPU.
//
//   SPACEFACE_QUIET_HOST=1 node scripts/quiet-host-session.mjs           # session + local report
//   SPACEFACE_QUIET_HOST=1 node scripts/quiet-host-session.mjs --push    # + receipt committed & pushed
//   node scripts/quiet-host-session.mjs --list                           # steps + consumers (safe anywhere)
//
// Sequential by design — never two headed probes at once (the GPU contention that
// killed D24 soak attempts F+G). Raw output lands in .devshots/ (gitignored); the
// committed artifact is the receipt --push writes into roadmap/receipts/.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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

const argv = process.argv.slice(2);
const only = (() => {
  const flag = argv.find((a) => a.startsWith('--only='));
  return flag ? flag.slice('--only='.length).split(',').map((s) => s.trim()) : null;
})();
const dryRun = argv.includes('--dry-run');
const listOnly = argv.includes('--list');
const doPush = argv.includes('--push');
const allowContended = argv.includes('--allow-contended');

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

// The gate: producers run only on the machine that declares itself the quiet host.
// This is what stops a local agent from "just running the soak" on the busy box.
if (process.env.SPACEFACE_QUIET_HOST !== '1' && !allowContended) {
  console.error(
    'REFUSED — quiet-host steps may not run on this machine.\n\n' +
    'The dev box runs agents around the clock; readings taken here are noise and headed\n' +
    'probes starve each other (the F+G lesson). This runner is for the ONE dedicated\n' +
    'clean machine, where it runs unattended:\n\n' +
    '  SPACEFACE_QUIET_HOST=1 node scripts/quiet-host-session.mjs --push\n\n' +
    'If you are an agent on a shared/busy machine: stop here. Your quiet-host task is to\n' +
    'LAND evidence, not produce it — read the latest\n' +
    'design/program/roadmap/receipts/QUIET-HOST-SESSION-*.md and apply the row closures it\n' +
    'names (design/program/QUIET_HOST_PROGRAM.md §0). Pass --allow-contended only if a human\n' +
    'explicitly accepted contaminated readings for this run.',
  );
  process.exit(2);
}

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join('.devshots', 'quiet-host', stamp);
mkdirSync(outDir, { recursive: true });
const report = [];
let failures = 0;

function runOne(cmd) {
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

const headShort = git(['rev-parse', '--short', 'HEAD']).stdout?.trim() || 'unknown';
const cpu = os.cpus()[0]?.model ?? 'unknown cpu';
const hostLine = `${os.platform()} · ${os.arch()} · ${cpu} · ${Math.round(os.totalmem() / 2 ** 30)} GB · tree ${headShort}`;

console.log(`Quiet-host session — host: ${hostLine}`);
console.log(`Output dir: ${outDir}\n`);
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
    const r = await runOne(cmd);
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

const verdictBlanks = {
  qh1: 'heap diff flat? (flat → close D24; slope → name residual fix)',
  qh2: '30m ___ s / 90m ___ s (datum → close D85)',
  qh3: 'screencast gap ___ ms or none (none → close D131)',
  qh4: 'paired claims recorded (→ close rows 61, open 65)',
  qh5: 'envelope result (→ close row 62)',
  qh6: 'defects found on the played path → rows (none → close row 66)',
  qh7: 'bugs found → new ledger rows (witness report path)',
  qh8: 'fps / frames>33ms p95 / top CPU payers (→ D130 baseline)',
};

const receipt = [
  `# QUIET-HOST-SESSION-${stamp}`,
  '',
  `Host: ${hostLine} · Session log: .devshots/quiet-host/${stamp}/ · Failures: ${failures}`,
  '',
  'Produced by the quiet machine (SPACEFACE_QUIET_HOST=1). This receipt is the evidence a',
  'landing sitting consumes — it applies the row closures named below. No local machine',
  're-runs these steps (QUIET_HOST_PROGRAM.md §0).',
  '',
  '| Step | Status | Runs (exit / s) | Verdict to record | Consumer |',
  '|---|---|---|---|---|',
  ...report.map((r) => {
    const runs = (r.runs ?? []).map((c) => `${c.command} → ${c.exit} / ${c.seconds}s`).join('<br>') || '—';
    return `| ${r.id.toUpperCase()} | ${r.status} | ${runs} | ${verdictBlanks[r.id] ?? ''} | ${r.consumer} |`;
  }),
  '',
  '## Landing checklist (the local task — LAND-QUIET-HOST)',
  '',
  '1. Fill every "verdict to record" cell from the session log in .devshots/quiet-host/.',
  '2. Apply the closures: delete the ledger/board rows this receipt names (pathspec commit)',
  '   — including negative results; a clean no-finding still closes its step\'s row.',
  '3. Route QH-8 baselines into the D130 change-loop note; flip board rows 61/62/66 as their',
  '   steps resolve.',
  '4. Raw captures stay in .devshots/ (gitignored) — numbers in this receipt are the record.',
];

const reportPath = path.join(outDir, 'REPORT.md');
writeFileSync(reportPath, receipt.join('\n') + '\n');
console.log(`\nReport written: ${reportPath}`);

if (!doPush) {
  console.log('Re-run with --push (on the quiet machine) to write this as the committed receipt and push it.');
  process.exit(failures === 0 ? 0 : 1);
}

const receiptPath = path.join('design', 'program', 'roadmap', 'receipts', `QUIET-HOST-SESSION-${stamp.slice(0, 10)}.md`);
mkdirSync(path.dirname(receiptPath), { recursive: true });
writeFileSync(receiptPath, receipt.join('\n') + '\n');

const add = git(['add', '--', receiptPath]);
if (add.status !== 0) {
  console.error(`git add failed:\n${add.stderr}`);
  process.exit(1);
}
const commit = git(['commit', '-m', `quiet-host: session receipt ${stamp.slice(0, 10)} (produced on the clean machine)`]);
if (commit.status !== 0) {
  console.error(`git commit failed (receipt left on disk at ${receiptPath}):\n${commit.stderr}`);
  process.exit(1);
}
const push = git(['push', 'origin', 'master']);
if (push.status !== 0) {
  console.error(`git push failed — the receipt is committed locally, push by hand:\n${push.stderr}`);
  process.exit(1);
}
console.log(`\nReceipt pushed: ${receiptPath}`);
console.log('Next (any machine): claim LAND-QUIET-HOST — apply the row closures this receipt names.');
process.exit(failures === 0 ? 0 : 1);
