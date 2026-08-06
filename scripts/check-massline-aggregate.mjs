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
// NESTED POOLS — READ BEFORE CHANGING THE POOL WIDTH
// --------------------------------------------------
// This aggregate is itself a link inside scripts/check-baseline.mjs, which is ALSO a bounded pool.
// When both pools sized themselves independently off availableParallelism() they MULTIPLIED: 4
// baseline workers each running 4 massline children is 16 concurrent heavy sims on an 8-core box,
// plus baseline's other links. Measured consequence on 2026-07-27: check:47a:physical-branches,
// which takes 36s with the machine to itself, was still running at 361820ms under the nested pools
// and got killed, so this aggregate reported 22/23 and the fast gate went red. An earlier run of the
// identical tree was fully green. A gate that is nondeterministic under load is worse than a gate
// that is honestly red, because it teaches everyone to re-run until green.
//
// The fix is a SHARED ALLOWANCE that nested pools DIVIDE instead of multiplying:
//
//   SPACEFACE_CHECK_JOBS = the number of concurrent child processes this runner and its entire
//                          subtree may use.
//
// If the variable is set (check-baseline sets it when it invokes this aggregate) we obey it. If it
// is not set we are the top of the tree and we size ourselves off the machine — see
// defaultAllowance(). Either way we hand each child SPACEFACE_CHECK_JOBS=1, because our children are
// leaves; if one ever grows a pool of its own it will run serial rather than multiply again. `--jobs`
// on the command line sets the allowance for the whole subtree, so `--jobs=1` is a fully serial tree.
//
// SCHEDULING: longest child first. The work here is wildly skewed — check:47a:physical-branches is
// 36s and the other twenty-two sum to about 26s — so the wall clock is set entirely by whether the
// long pole starts in the first wave. In declaration order it starts LAST and the aggregate takes
// 50s; longest-first it takes about 38s at the same width. COST_HINT_MS is a scheduling hint only:
// nothing asserts on it, and a stale hint costs seconds, not truth.
//
// TIMEOUTS ARE NOT FAILURES. A child that blows CHILD_TIMEOUT_MS is reported as TIMEOUT with its
// budget, never as a plain FAIL. A timeout is an environment/contention signal; a failed assertion is
// a product signal. This session burned an afternoon confusing the two because a killed child logged
// "(no output captured)" and exit null, which is indistinguishable from a crash.
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
const JOBS_ENV = 'SPACEFACE_CHECK_JOBS';

// About 4x the slowest child measured with the machine to itself (physical-branches, 36s). A breach
// at 4x is contention or a hang, not a slow assertion, and it is reported as such.
const CHILD_TIMEOUT_MS = 150_000;
// A killed process on Windows can leave a grandchild holding the stdio pipes open, so 'close' may
// never fire. After a timeout kill we wait this long for a clean close and then report anyway.
const KILL_GRACE_MS = 2_000;

const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const checks = [
  'check:massline:telemetry',
  'check:massline:heads',
  'check:massline:mass-coupling',
  'check:massline:momentum-sink',
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

// Measured 2026-07-27, serial, machine otherwise idle. Scheduling hint only — see the header.
// Anything not listed is one of the seventeen sub-second children.
const COST_HINT_MS = {
  'check:47a:physical-branches': 36_250,
  'check:47a:civilian-priority': 7_800,
  'check:47a:debris-sling': 6_430,
  'check:47a:recovery-contested': 5_260,
  'check:47a:scavenger-threat': 2_270,
  'check:47a:spindle': 1_770,
};
const DEFAULT_COST_HINT_MS = 300;

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
const allowance = resolveAllowance();
const selected = selectChecks(checks, readOption('--only'));
const jobs = serial ? 1 : Math.min(allowance, Math.max(1, selected.length));

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`check:massline — Massline aggregate (${checks.length} children)

  --serial        run one child at a time
  --jobs=N        concurrency allowance for this runner and its subtree (default ${defaultAllowance()})
  --only=a,b      run a subset by npm script name
  --list          show membership
  --json          machine-readable result

concurrency: obeys ${JOBS_ENV} when set (check:baseline sets it so the nested pools divide the
machine instead of multiplying it); otherwise sizes itself off availableParallelism().`);
  process.exit(0);
}

if (argv.includes('--list')) {
  for (const check of selected) console.log(`${check}\n    ${packageJson.scripts[check]}`);
  process.exit(0);
}

const startedAt = Date.now();
const results = serial ? await runSerial(selected) : await runPooled(selected, jobs);
const wallMs = Date.now() - startedAt;
const timedOutResults = results.filter((r) => r.timedOut);
const failed = results.filter((r) => !r.ok);
const assertionFailures = failed.filter((r) => !r.timedOut);

if (asJson) {
  console.log(JSON.stringify({
    schema: 'spaceface.checkMassline.v1',
    ok: failed.length === 0,
    wallMs,
    mode: serial ? 'serial' : `parallel:${jobs}`,
    allowance,
    allowanceSource: allowanceSource(),
    timedOut: timedOutResults.length,
    failed: assertionFailures.length,
    results: results.map(({ id, command, ok, code, durationMs, timedOut, timeoutMs }) => ({
      id, command, ok, code, durationMs, timedOut, timeoutMs,
    })),
  }, null, 2));
} else {
  console.log('');
  console.log('check:massline');
  for (const r of results) {
    console.log(`  ${verdict(r)}  ${String(r.durationMs).padStart(6)}ms  ${r.id}${r.timedOut ? `  (budget ${r.timeoutMs}ms)` : ''}`);
  }
  console.log('');
  console.log(`  ${results.length - failed.length}/${results.length} child checks green in ${wallMs}ms wall (${serial ? 'serial' : `parallel x${jobs}`}, allowance ${allowance} from ${allowanceSource()})`);
  for (const r of failed) {
    console.log('');
    if (r.timedOut) {
      console.log(`--- ${r.id} TIMED OUT after ${r.durationMs}ms (budget ${r.timeoutMs}ms) :: ${r.command}`);
      console.log('    A timeout is a contention/environment signal, NOT a failed assertion. The child was');
      console.log('    killed mid-run, so the output below is partial by construction. Re-run this child on');
      console.log('    its own before treating it as a product defect:');
      console.log(`      npm run ${r.id}`);
      console.log(tailOrNote(r.output, 40, '(killed before it wrote anything — no assertion was reported)'));
    } else {
      console.log(`--- ${r.id} (exit ${r.code}) :: ${r.command}`);
      console.log(tailOrNote(r.output, 40, '(no output captured)'));
    }
  }
  console.log('');
  if (failed.length === 0) console.log(`[check-massline] PASS - ${results.length} child checks green`);
  else {
    const parts = [];
    if (assertionFailures.length) parts.push(`${assertionFailures.length} red: ${assertionFailures.map((r) => r.id).join(', ')}`);
    if (timedOutResults.length) parts.push(`${timedOutResults.length} TIMED OUT: ${timedOutResults.map((r) => r.id).join(', ')}`);
    console.log(`[check-massline] FAIL - ${failed.length} of ${results.length} child checks not green (${parts.join('; ')})`);
  }
}

process.exitCode = failed.length === 0 ? 0 : 1;

function verdict(r) {
  if (r.ok) return 'PASS';
  return r.timedOut ? 'TIME' : 'FAIL';
}

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
  // Longest first. The work is skewed enough that the wall clock is decided by whether
  // check:47a:physical-branches is in the first wave; in declaration order it is dead last.
  const queue = ids
    .map((id, index) => ({ id, index }))
    .sort((a, b) => costHint(b.id) - costHint(a.id));
  const out = new Array(ids.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      out[item.index] = await runChild(item.id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
  return out;
}

function costHint(id) {
  return COST_HINT_MS[id] ?? DEFAULT_COST_HINT_MS;
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
      // Our children are leaves. Hand them an allowance of 1 so that if one ever grows a pool of
      // its own it runs serial instead of multiplying against ours.
      env: { ...process.env, [JOBS_ENV]: '1' },
    });
    let output = '';
    let timedOut = false;
    let settled = false;
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
        timeoutMs: timedOut ? CHILD_TIMEOUT_MS : null,
        durationMs: Date.now() - started,
        output,
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      // Do not wait indefinitely for 'close'. A killed process can leave a grandchild holding the
      // pipes, and waiting on that is how a 180s budget once reported 361820ms.
      setTimeout(() => finish(null), KILL_GRACE_MS).unref();
    }, CHILD_TIMEOUT_MS);
    const collect = (chunk) => { output += String(chunk); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => { output += `\n${error.message}`; finish(-1); });
    child.on('close', (code) => finish(code));
  });
}

// child.kill() only signals the process we spawned. On Windows that can be a shell whose grandchild
// survives; taskkill /t takes the whole tree so the budget is actually enforced.
function killTree(child) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
        .on('error', () => { try { child.kill('SIGKILL'); } catch { /* already gone */ } });
    } else {
      child.kill('SIGKILL');
    }
  } catch { /* already gone */ }
}

// The concurrency allowance for this runner AND everything it spawns. Explicit --jobs wins, then the
// allowance our parent handed us, then the machine.
function resolveAllowance() {
  const flag = Number(readOption('--jobs'));
  if (Number.isFinite(flag) && flag > 0) return Math.max(1, Math.floor(flag));
  const inherited = Number(process.env[JOBS_ENV]);
  if (Number.isFinite(inherited) && inherited > 0) return Math.max(1, Math.floor(inherited));
  return defaultAllowance();
}

function allowanceSource() {
  const flag = Number(readOption('--jobs'));
  if (Number.isFinite(flag) && flag > 0) return '--jobs';
  const inherited = Number(process.env[JOBS_ENV]);
  if (Number.isFinite(inherited) && inherited > 0) return JOBS_ENV;
  return 'availableParallelism';
}

// HALF of availableParallelism(), not all of it and not cpus-1 — matched to check-baseline.mjs, which
// carries the full reasoning. Short version, measured 2026-07-27 on an 8-logical-core box: this
// aggregate takes 63.2s serial, 47.9s at width 2, 52.4s at 3, 63.8s at 4. It does not get faster past
// two, because check:47a:physical-branches IS the wall (36.2s with the machine to itself) and every
// co-running process inflates it. availableParallelism() reports logical CPUs; half of that is the
// physical core count under SMT, which is where the knee sat. Floor 2, ceiling 8 (only six of the 23
// children are non-trivial, so nothing wider has work to do).
function defaultAllowance() {
  const cpus = typeof availableParallelism === 'function' ? availableParallelism() : 4;
  return Math.max(2, Math.min(8, Math.round(cpus / 2)));
}

function readOption(name) {
  const prefix = `${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || null : null;
}

function tailOrNote(text, lines, note) {
  const all = String(text || '').replace(/\r/g, '').split('\n');
  return all.slice(Math.max(0, all.length - lines)).join('\n').trim() || note;
}
