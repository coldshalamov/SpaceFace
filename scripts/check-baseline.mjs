#!/usr/bin/env node
// check:baseline — the fast gate.
//
// WHY THIS EXISTS
// ---------------
// `npm run check` is a hundred-link `&&` chain. An `&&` chain reports the FIRST failure and then
// tells you nothing about the other ninety-nine links, so a repository with three independent reds
// looks exactly like a repository with one. On 2026-07-27 that pathology was measured twice in one
// afternoon: the whole chain had been dead on arrival for 333 commits inside an invisible `precheck`
// npm lifecycle hook, and `check:massline` turned out to have three red children while its
// fail-fast runner had only ever named one of them.
//
// So this runner does the opposite of an `&&` chain on purpose:
//   * it runs EVERY link even after one fails, and reports the whole set;
//   * it runs them in a bounded parallel pool, because these are independent processes and the
//     wall-clock budget is what makes a gate get used;
//   * it prints per-link wall time, so the next person to add a link can see what it costs.
//
// It is a gate, not a ritual: it asserts nothing about source text, file layout, or naming. Every
// link is an existing check that drives real code. Adding a link here is adding seconds to the
// budget below — say what you bought.
//
// BUDGET: 90 seconds wall clock. If a change pushes this over, either make the link faster or take
// something out; do not quietly raise the number.
//
// Usage:
//   node scripts/check-baseline.mjs            # run everything, parallel
//   node scripts/check-baseline.mjs --serial   # one at a time (for clean timing or a busy machine)
//   node scripts/check-baseline.mjs --list     # membership + why each link is here
//   node scripts/check-baseline.mjs --only=sim,massline
//   node scripts/check-baseline.mjs --json
//   node scripts/check-baseline.mjs --jobs=2

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BUDGET_MS = 90_000;
const LINK_TIMEOUT_MS = 180_000;

// `script` names an npm script (resolved from package.json, so package.json stays the single source
// of truth and a rename fails loudly here). `command` is a raw shell command for the handful of
// gates that were never given an npm alias.
const LINKS = [
  {
    id: 'ui-screen-imports',
    costHintMs: 500,
    command: 'node scripts/check-ui-screen-imports.mjs',
    why: 'A screen that imports the wrong module boots to a blank panel. Cheapest real gate we have.',
  },
  {
    id: 'save-schema',
    costHintMs: 800,
    script: 'check:save-schema',
    why: 'A drifted save schema silently breaks every existing save. Sub-second; no reason to ever skip it.',
  },
  {
    id: 'flight-v3',
    costHintMs: 1100,
    script: 'check:flight:v3',
    why: 'Brake convergence across 15 cases. The cheap half of the flight contract; check:flight:clean (~6 min) is deliberately NOT here.',
  },
  {
    id: 'm1-tether-mass',
    costHintMs: 2200,
    script: 'check:m1:tether-mass',
    why: 'Pins the protected Massline durability envelope and the mass grounding. First link of the `check` chain.',
  },
  {
    id: 'sim-v3-compare',
    costHintMs: 2600,
    script: 'check:sim:v3:compare',
    why: 'Determinism of the V3 controller across a mid-run save/reload.',
  },
  {
    id: 'sim-compare',
    costHintMs: 3000,
    script: 'check:sim:compare',
    why: 'Determinism of the legacy controller across a mid-run save/reload.',
  },
  {
    id: 'sim-v3',
    costHintMs: 9000,
    script: 'check:sim:v3',
    why: 'The V3 golden hash. NOTE: sim-v3-compare cannot fail on a stale golden (sf-sim.mjs:716 tolerates expectedHash diffs) — this link is the one that can.',
  },
  {
    id: 'sim',
    costHintMs: 9000,
    script: 'check:sim',
    why: 'The legacy golden hash. Same note as sim-v3: the compare links do not gate the goldens, this one does.',
  },
  {
    id: 'massline',
    costHintMs: 57000,
    script: 'check:massline',
    why: 'The signature verb. Aggregates 23 child checks; the longest link here and worth every second.',
  },
];

const argv = process.argv.slice(2);
const serial = argv.includes('--serial');
const asJson = argv.includes('--json');
const onlyRaw = readOption('--only');
const jobs = Math.max(1, Number(readOption('--jobs')) || defaultJobs());

if (argv.includes('--help') || argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts || {};
const selected = selectLinks(LINKS, onlyRaw);

if (argv.includes('--list')) {
  for (const link of selected) console.log(`${link.id}\n    ${resolveCommand(link)}\n    ${link.why}\n`);
  process.exit(0);
}

const startedAt = Date.now();
const results = serial ? await runSerial(selected) : await runPooled(selected, jobs);
const wallMs = Date.now() - startedAt;
const failed = results.filter((r) => !r.ok);
const overBudget = wallMs > BUDGET_MS;

if (asJson) {
  console.log(JSON.stringify({
    schema: 'spaceface.checkBaseline.v1',
    ok: failed.length === 0,
    wallMs,
    budgetMs: BUDGET_MS,
    overBudget,
    mode: serial ? 'serial' : `parallel:${jobs}`,
    results: results.map(({ id, command, ok, code, durationMs, timedOut }) => ({ id, command, ok, code, durationMs, timedOut })),
  }, null, 2));
} else {
  console.log('');
  console.log('check:baseline');
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${String(r.durationMs).padStart(6)}ms  ${r.id}${r.timedOut ? '  (TIMED OUT)' : ''}`);
  }
  console.log('');
  console.log(`  ${results.length - failed.length}/${results.length} green in ${wallMs}ms wall (${serial ? 'serial' : `parallel x${jobs}`}), budget ${BUDGET_MS}ms`);
  if (overBudget) console.log('  BUDGET EXCEEDED — make a link faster or drop one; do not raise the number quietly.');
  for (const r of failed) {
    console.log('');
    console.log(`--- ${r.id} (exit ${r.code}) :: ${r.command}`);
    console.log(tail(r.output, 40));
  }
  console.log('');
}

// Exit red for a failing link. Also exit red when the gate blows its own time budget: a "fast gate"
// nobody can afford to run is not a gate, and silently drifting to four minutes is how it dies.
process.exitCode = failed.length === 0 && !overBudget ? 0 : 1;

function selectLinks(links, only) {
  if (!only) return links;
  const wanted = new Set(only.split(',').map((s) => s.trim()).filter(Boolean));
  const picked = links.filter((link) => wanted.has(link.id));
  const unknown = [...wanted].filter((name) => !links.some((link) => link.id === name));
  if (unknown.length) {
    console.error(`unknown --only id(s): ${unknown.join(', ')}\nknown: ${links.map((l) => l.id).join(', ')}`);
    process.exit(2);
  }
  return picked;
}

function resolveCommand(link) {
  if (link.command) return link.command;
  const body = scripts[link.script];
  if (typeof body !== 'string' || !body.trim()) {
    console.error(`check:baseline link "${link.id}" names npm script "${link.script}", which is not defined in package.json`);
    process.exit(2);
  }
  return body;
}

async function runSerial(links) {
  const out = [];
  for (const link of links) out.push(await runLink(link));
  return out;
}

async function runPooled(links, limit) {
  // Longest first. With a bounded pool the wall clock is set by whether the slowest link starts
  // early, and check:massline is an order of magnitude longer than anything else here. costHintMs
  // is a scheduling hint only — nothing asserts on it, and a stale hint costs seconds, not truth.
  const queue = [...links]
    .map((link, index) => ({ link, index }))
    .sort((a, b) => (b.link.costHintMs || 0) - (a.link.costHintMs || 0));
  const out = new Array(links.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      out[item.index] = await runLink(item.link);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
  return out;
}

function runLink(link) {
  const command = resolveCommand(link);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: ROOT, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, LINK_TIMEOUT_MS);
    const collect = (chunk) => { output += String(chunk); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        id: link.id,
        command,
        ok: code === 0 && !timedOut,
        code,
        timedOut,
        durationMs: Date.now() - started,
        output,
      });
    };
    child.on('error', (error) => { output += `\n${error.message}`; finish(-1); });
    child.on('close', (code) => finish(code));
  });
}

function defaultJobs() {
  const cpus = typeof availableParallelism === 'function' ? availableParallelism() : 4;
  return Math.max(2, Math.min(4, cpus - 1));
}

function readOption(name) {
  const prefix = `${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || null : null;
}

function tail(text, lines) {
  const all = String(text || '').replace(/\r/g, '').split('\n');
  return all.slice(Math.max(0, all.length - lines)).join('\n').trim() || '(no output captured)';
}

function printHelp() {
  console.log(`check:baseline — the fast gate (budget ${BUDGET_MS}ms wall)

  --serial        run one link at a time
  --jobs=N        parallel pool size (default ${defaultJobs()})
  --only=a,b      run a subset by link id
  --list          show membership and why each link is here
  --json          machine-readable result

links: ${LINKS.map((l) => l.id).join(', ')}`);
}
