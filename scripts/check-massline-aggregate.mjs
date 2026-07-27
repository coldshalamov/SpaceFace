#!/usr/bin/env node
// check:massline — the Massline aggregate.
//
// WHY THIS RUNNER LOOKS LIKE THIS
// -------------------------------
// It used to be a `for` loop around fail-fast `execFileSync`. That reports the FIRST red child and
// leaves the other twenty-two unmeasured, so a repository with three independent Massline reds
// looked exactly like a repository with one. That is not hypothetical: on 2026-07-27 this aggregate
// had three red children (release-feedback, threat-feedback, whip-feedback) and had only ever named
// one of them, for long enough that the other two went unnoticed entirely.
//
// So it now does what scripts/check-baseline.mjs does, for the same reason:
//   * it runs EVERY child even after one fails, and reports the whole set;
//   * it runs them in a bounded parallel pool, because these are independent processes;
//   * it prints per-child wall time, so the cost of adding a child is visible.
//
// If an aggregate names one failure, that must be a count and not a lower bound.
//
// The structural preconditions below (npm aliases, script existence, doc coverage) stay fail-fast:
// they are L0 shape checks that cost microseconds and that every child depends on.
//
// Usage:
//   node scripts/check-massline-aggregate.mjs             # run everything, parallel
//   node scripts/check-massline-aggregate.mjs --serial    # one at a time
//   node scripts/check-massline-aggregate.mjs --jobs=2
//   node scripts/check-massline-aggregate.mjs --only=check:massline:threat-feedback,...
//   node scripts/check-massline-aggregate.mjs --list
//   node scripts/check-massline-aggregate.mjs --json
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DOC_PATH = 'docs/MASSLINE_MECHANICS.md';
const CHILD_TIMEOUT_MS = 300_000;

const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const checks = [
  'check:massline:telemetry',
  'check:massline:release',
  'check:massline:release-feedback',
  'check:massline:load',
  'check:massline:snapcatch',
  'check:massline:reelpump',
  'check:massline:target-scoring',
  'check:massline:auto-target',
  'check:massline:threats',
  'check:massline:threat-feedback',
  'check:massline:arc-data',
  'check:massline:arc-render',
  'check:massline:whip-impact',
  'check:massline:whip-feedback',
  'check:impulse:authority',
  'check:impulse:massline-combos',
  'check:mining:bulk-guidance',
  'check:47a:spindle',
  'check:47a:scavenger-threat',
  'check:47a:debris-sling',
  'check:47a:recovery-contested',
  'check:47a:civilian-priority',
  'check:47a:physical-branches',
];

assert.equal(packageJson.scripts['check:massline'], 'node scripts/check-massline-aggregate.mjs',
  'package.json should expose this aggregate as check:massline');
for (const check of checks) {
  const script = packageJson.scripts[check];
  assert(script, `${check} should be registered in package.json`);
  const match = /^node (scripts\/[^ ]+\.mjs)(?:$| )/.exec(script);
  assert(match, `${check} should run a node scripts/*.mjs target`);
  assert(existsSync(join(ROOT, match[1])), `${check} should point at an existing script file: ${match[1]}`);
}

assert(existsSync(join(ROOT, DOC_PATH)), `${DOC_PATH} should exist`);
const doc = readFileSync(join(ROOT, DOC_PATH), 'utf8');
const docLower = doc.toLowerCase();
for (const term of [
  'Massline Mechanics',
  '60 Hz',
  'tether.load',
  'snap-catch',
  'reel-pump',
  'auto-target',
  'threat',
  'arc preview',
  'whip impact',
  'impulse charge',
  'bulk haul',
  '47-A',
]) {
  assert(docLower.includes(term.toLowerCase()), `${DOC_PATH} should document ${term}`);
}

const argv = process.argv.slice(2);
const serial = argv.includes('--serial');
const asJson = argv.includes('--json');
const jobs = Math.max(1, Number(readOption('--jobs')) || defaultJobs());
const selected = selectChecks(checks, readOption('--only'));

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`check:massline — Massline aggregate (${checks.length} children)

  --serial        run one child at a time
  --jobs=N        parallel pool size (default ${defaultJobs()})
  --only=a,b      run a subset by npm script name
  --list          show membership
  --json          machine-readable result`);
  process.exit(0);
}

if (argv.includes('--list')) {
  for (const check of selected) console.log(`${check}\n    ${packageJson.scripts[check]}`);
  process.exit(0);
}

const startedAt = Date.now();
const results = serial ? await runSerial(selected) : await runPooled(selected, jobs);
const wallMs = Date.now() - startedAt;
const failed = results.filter((r) => !r.ok);

if (asJson) {
  console.log(JSON.stringify({
    schema: 'spaceface.checkMassline.v1',
    ok: failed.length === 0,
    wallMs,
    mode: serial ? 'serial' : `parallel:${jobs}`,
    results: results.map(({ id, command, ok, code, durationMs, timedOut }) => ({ id, command, ok, code, durationMs, timedOut })),
  }, null, 2));
} else {
  console.log('');
  console.log('check:massline');
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${String(r.durationMs).padStart(6)}ms  ${r.id}${r.timedOut ? '  (TIMED OUT)' : ''}`);
  }
  console.log('');
  console.log(`  ${results.length - failed.length}/${results.length} child checks green in ${wallMs}ms wall (${serial ? 'serial' : `parallel x${jobs}`})`);
  for (const r of failed) {
    console.log('');
    console.log(`--- ${r.id} (exit ${r.code}) :: ${r.command}`);
    console.log(tail(r.output, 40));
  }
  console.log('');
  if (failed.length === 0) console.log(`[check-massline] PASS - ${results.length} child checks green`);
  else console.log(`[check-massline] FAIL - ${failed.length} of ${results.length} child checks red: ${failed.map((r) => r.id).join(', ')}`);
}

process.exitCode = failed.length === 0 ? 0 : 1;

function selectChecks(all, only) {
  if (!only) return all;
  const wanted = new Set(only.split(',').map((s) => s.trim()).filter(Boolean));
  const unknown = [...wanted].filter((name) => !all.includes(name));
  if (unknown.length) {
    console.error(`unknown --only check(s): ${unknown.join(', ')}\nknown: ${all.join(', ')}`);
    process.exit(2);
  }
  return all.filter((name) => wanted.has(name));
}

async function runSerial(ids) {
  const out = [];
  for (const id of ids) out.push(await runChild(id));
  return out;
}

async function runPooled(ids, limit) {
  const out = new Array(ids.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const index = cursor++;
      out[index] = await runChild(ids[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, worker));
  return out;
}

function runChild(id) {
  const command = packageJson.scripts[id];
  const args = command.split(/\s+/).slice(1);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, CHILD_TIMEOUT_MS);
    const collect = (chunk) => { output += String(chunk); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        id,
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
