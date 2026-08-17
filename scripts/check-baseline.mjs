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
// NESTED POOLS — THE THING THAT MAKES THIS FILE NON-OBVIOUS
// ---------------------------------------------------------
// The `massline` link is scripts/check-massline-aggregate.mjs, which is ITSELF a bounded parallel
// pool over 23 children. When the two pools sized themselves independently off availableParallelism()
// they MULTIPLIED: 4 workers here, each of which might be running 4 massline children, is 16
// concurrent heavy sims on an 8-core box plus this gate's other links. Measured on 2026-07-27:
// check:47a:physical-branches takes 36s with the machine to itself and was still running at
// 361820ms under the nested pools, so it got killed, check:massline reported 22/23, and this gate
// went red — on a tree that had been fully green minutes earlier. A gate that is nondeterministic
// under load is worse than one that is honestly red: it teaches everyone to re-run until green,
// which is precisely the habit that let a stale golden hide for 333 commits.
//
// The answer is a SHARED ALLOWANCE that nested pools DIVIDE rather than multiply, carried in an
// environment variable because these links are npm scripts and forwarding args through npm is awkward:
//
//   SPACEFACE_CHECK_JOBS = concurrent child processes this runner and its entire subtree may use.
//
// We resolve an allowance once (--jobs, else an inherited SPACEFACE_CHECK_JOBS, else the machine —
// see defaultAllowance()) and then SPLIT it, we never re-spend it:
//   * links flagged `nestedPool` run in their own lane, each with a reserved slice of the allowance
//     that it passes down in SPACEFACE_CHECK_JOBS;
//   * every other link is a leaf and shares whatever is left, and is handed an allowance of 1 so a
//     link that grows a pool later degrades to serial instead of silently multiplying again.
// See splitAllowance() for the arithmetic and how it degrades on a 2-core machine.
//
// We deliberately do NOT force the aggregate serial: it was made parallel because 23 children cost
// 62s serial here, and we deliberately do NOT raise the 90s budget. The measured shape of the work
// is one 36s long pole plus about 26s of small change, so what actually buys the headroom is giving
// the long pole an early start and not oversubscribing the machine around it.
//
// TIMEOUTS ARE NOT FAILURES. A link that blows LINK_TIMEOUT_MS is reported as TIMEOUT with its
// budget, never as a plain FAIL, because a timeout is an environment/contention signal and a failed
// assertion is a product signal. Note also that killing a `shell: true` child on Windows kills only
// cmd.exe — the node grandchild survives and holds the stdio pipes, so 'close' never fires. That is
// how a 180s budget once reported 361820ms and exit null with "(no output captured)". killTree()
// and the kill grace window below are what actually enforce the budget.
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
const JOBS_ENV = 'SPACEFACE_CHECK_JOBS';

// Roughly 4x the slowest link measured with the machine to itself (massline, ~40s). A breach at 4x
// is contention or a hang, not a slow assertion. It sits above the aggregate's own 150s child
// budget so a stuck massline child surfaces as that child's TIMEOUT and not as an opaque link one.
const LINK_TIMEOUT_MS = 210_000;
// A killed process can leave a grandchild holding the stdio pipes open, so 'close' may never fire.
// After a timeout kill we wait this long for a clean close and then report anyway.
const KILL_GRACE_MS = 2_000;

// `script` names an npm script (resolved from package.json, so package.json stays the single source
// of truth and a rename fails loudly here). `command` is a raw shell command for the handful of
// gates that were never given an npm alias.
//
// `nestedPool: true` means the link is itself a parallel runner and must be given a reserved slice
// of the concurrency allowance rather than a single leaf slot. Getting this flag wrong is the exact
// defect described in the header, so if you add an aggregate link, set it.
const LINKS = [
  {
    id: 'ui-screen-imports',
    costHintMs: 500,
    command: 'node scripts/check-ui-screen-imports.mjs',
    why: 'A screen that imports the wrong module boots to a blank panel. Cheapest real gate we have.',
  },
  {
    id: 'vfx-techniques',
    costHintMs: 400,
    command: 'node scripts/check-vfx-techniques.mjs',
    why: 'A new file cannot pick up the blurry-square / point-sprite cheat without declaring it. Completeness of the soft-card inventory, not a blur ban.',
  },
  {
    id: 'pq020-ceres-topology',
    costHintMs: 500,
    script: 'check:pq020:ceres-topology',
    why: 'Pins PQ-020 Ceres pocket geometry, Cathedral identity, route legs, and headless structural-cost fingerprint; headed-only metrics stay explicit nulls.',
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
    id: 'render-package-plan',
    costHintMs: 2000,
    script: 'check:render-package-plan',
    why: 'Every shipping render package must build a load-time instance plan. Semantic-locator '
      + 'validation and dynamic-group resolution moved from per-instance to load, so a package '
      + 'that used to fail on first instantiation now fails the whole load; fixture tests cannot '
      + 'see it.',
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
    costHintMs: 40000,
    nestedPool: true,
    script: 'check:massline',
    why: 'The signature verb. Aggregates 23 child checks in a pool of its own; the longest link here and worth every second.',
  },
];

const argv = process.argv.slice(2);
const serial = argv.includes('--serial');
const asJson = argv.includes('--json');
const onlyRaw = readOption('--only');
const allowance = resolveAllowance();

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

const split = splitAllowance(allowance, selected);
const startedAt = Date.now();
const results = serial ? await runSerial(selected) : await runPooled(selected, split);
const wallMs = Date.now() - startedAt;
const timedOutResults = results.filter((r) => r.timedOut);
const failed = results.filter((r) => !r.ok);
const assertionFailures = failed.filter((r) => !r.timedOut);
const overBudget = wallMs > BUDGET_MS;
const mode = serial ? 'serial' : `parallel:${split.flatWidth}+${split.nested.length}x${split.perNested}`;

if (asJson) {
  console.log(JSON.stringify({
    schema: 'spaceface.checkBaseline.v1',
    ok: failed.length === 0,
    wallMs,
    budgetMs: BUDGET_MS,
    overBudget,
    headroomMs: BUDGET_MS - wallMs,
    mode,
    allowance,
    allowanceSource: allowanceSource(),
    timedOut: timedOutResults.length,
    failed: assertionFailures.length,
    results: results.map(({ id, command, ok, code, durationMs, timedOut, timeoutMs, jobsGiven }) => ({
      id, command, ok, code, durationMs, timedOut, timeoutMs, jobsGiven,
    })),
  }, null, 2));
} else {
  console.log('');
  console.log('check:baseline');
  for (const r of results) {
    console.log(`  ${verdict(r)}  ${String(r.durationMs).padStart(6)}ms  ${r.id}${r.timedOut ? `  (TIMED OUT, budget ${r.timeoutMs}ms)` : ''}`);
  }
  console.log('');
  console.log(`  ${results.length - failed.length}/${results.length} green in ${wallMs}ms wall (${serial ? 'serial' : mode}), budget ${BUDGET_MS}ms, headroom ${BUDGET_MS - wallMs}ms`);
  console.log(`  concurrency allowance ${allowance} from ${allowanceSource()} — split, not multiplied (see the header)`);
  if (overBudget) console.log('  BUDGET EXCEEDED — make a link faster or drop one; do not raise the number quietly.');
  if (timedOutResults.length) {
    console.log('  A TIMEOUT is a contention/environment signal, not a product failure. Before you file a bug,');
    console.log('  re-run the timed-out link on its own and see whether it is green with the machine to itself.');
  }
  for (const r of failed) {
    console.log('');
    if (r.timedOut) {
      console.log(`--- ${r.id} TIMED OUT after ${r.durationMs}ms (budget ${r.timeoutMs}ms) :: ${r.command}`);
      console.log('    Killed mid-run, so the output below is partial by construction and no assertion was');
      console.log('    reported. Reproduce alone before treating this as a product defect.');
      console.log(tailOrNote(r.output, 40, '(killed before it wrote anything — no assertion was reported)'));
    } else {
      console.log(`--- ${r.id} (exit ${r.code}) :: ${r.command}`);
      console.log(tailOrNote(r.output, 40, '(no output captured)'));
    }
  }
  console.log('');
}

// Exit red for a failing link. Also exit red when the gate blows its own time budget: a "fast gate"
// nobody can afford to run is not a gate, and silently drifting to four minutes is how it dies.
process.exitCode = failed.length === 0 && !overBudget ? 0 : 1;

function verdict(r) {
  if (r.ok) return 'PASS';
  return r.timedOut ? 'TIME' : 'FAIL';
}

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

// Divide the allowance between the nested-pool links and everything else. The invariant is that the
// number of BUSY processes under this runner never exceeds `allowance`; the aggregate's own node
// process is a supervisor that sits idle waiting on its children, so it does not get counted.
//
// Nested links take about half the allowance because the aggregate holds the long pole (36s of the
// gate's ~40s critical path) and the flat links are 28s of work that packs easily around it.
//
// Degradation: allowance 4 (this 8-logical-core box, the measured knee) gives the aggregate 2 and the
// flat links 2 — four busy processes total, which is where both lanes stopped getting faster.
// allowance 2 (a 2-4 core box) gives 1 and 1: the aggregate goes serial (~63s here) and the leaf
// links trickle beside it, which is honest rather than thrashing. allowance 8 gives 4 and 4. With no
// nested links selected (`--only=sim,sim-v3`) the flat pool takes the whole allowance. With ONLY
// nested links selected they divide it among themselves and flatWidth is 0.
function splitAllowance(total, links) {
  const nested = links.filter((link) => link.nestedPool);
  const flat = links.filter((link) => !link.nestedPool);
  if (!nested.length) return { nested, flat, perNested: 0, flatWidth: Math.max(1, Math.min(total, flat.length)) };
  if (!flat.length) return { nested, flat, perNested: Math.max(1, Math.floor(total / nested.length)), flatWidth: 0 };
  const nestedBudget = Math.max(nested.length, Math.ceil(total / 2));
  const perNested = Math.max(1, Math.floor(nestedBudget / nested.length));
  const flatWidth = Math.max(1, Math.min(total - perNested * nested.length, flat.length));
  return { nested, flat, perNested, flatWidth };
}

async function runSerial(links) {
  const out = [];
  for (const link of links) out.push(await runLink(link, 1));
  return out;
}

async function runPooled(links, plan) {
  const out = new Array(links.length);
  const indexOf = new Map(links.map((link, index) => [link, index]));

  // Nested-pool links get their own lane so a long aggregate is never queued behind leaf links and
  // never has to share a slot with them. Each is handed its reserved slice of the allowance.
  const nestedLane = plan.nested.map(async (link) => {
    out[indexOf.get(link)] = await runLink(link, plan.perNested);
  });

  // Longest first. With a bounded pool the wall clock is set by whether the slowest link starts
  // early. costHintMs is a scheduling hint only — nothing asserts on it, and a stale hint costs
  // seconds, not truth.
  const queue = [...plan.flat].sort((a, b) => (b.costHintMs || 0) - (a.costHintMs || 0));
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const link = queue[cursor++];
      out[indexOf.get(link)] = await runLink(link, 1);
    }
  };
  const flatLane = Array.from({ length: Math.min(plan.flatWidth, queue.length) }, worker);

  await Promise.all([...nestedLane, ...flatLane]);
  return out;
}

function runLink(link, jobsGiven) {
  const command = resolveCommand(link);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: ROOT,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      // The whole point: the child is told how much of the machine it may use, so a nested pool
      // divides our allowance instead of re-deriving its own from availableParallelism().
      env: { ...process.env, [JOBS_ENV]: String(jobsGiven) },
    });
    let output = '';
    let timedOut = false;
    let settled = false;
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
        timeoutMs: timedOut ? LINK_TIMEOUT_MS : null,
        jobsGiven,
        durationMs: Date.now() - started,
        output,
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      // Do not wait indefinitely for 'close'. With shell: true the grandchild outlives cmd.exe and
      // holds the pipes; waiting on that is how a 180s budget once reported 361820ms.
      setTimeout(() => finish(null), KILL_GRACE_MS).unref();
    }, LINK_TIMEOUT_MS);
    const collect = (chunk) => { output += String(chunk); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => { output += `\n${error.message}`; finish(-1); });
    child.on('close', (code) => finish(code));
  });
}

// child.kill() signals only the process we spawned, which with shell: true is cmd.exe. Its node
// grandchild survives the signal and keeps the stdio pipes open, so the budget is not enforced at
// all. taskkill /t takes the tree.
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

// The concurrency allowance for this runner AND everything it spawns. Explicit --jobs wins, then an
// allowance handed to us by a parent runner, then the machine.
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

// HALF of availableParallelism(), not all of it and not cpus-1. This is the ONE place the machine is
// consulted; everything below this point divides what it says, so the number has to be the point
// where adding a process stops paying. Measured 2026-07-27 on an 8-logical-core box:
//
//   the 8 leaf links      serial 19.5s | x2 16.2s | x3 15.2s | x4 15.0s
//   the massline aggregate serial 63.2s | x2 47.9s | x3 52.4s | x4 63.8s | x7 49.4s
//
// Past about two concurrent heavy sims per lane, per-process time inflates faster than the pool
// drains (check:sim goes 8.2s -> 14.9s), so the wall stops improving and starts getting NOISIER,
// which is the failure mode this whole change exists to kill. availableParallelism() reports logical
// CPUs; on an SMT machine half of that is the physical core count, which is where the knee sat here.
// Floor of 2 so even a tiny box overlaps the long pole with something; ceiling of 8 because only six
// of the aggregate's 23 children are non-trivial, so nothing wider has work to do.
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

function printHelp() {
  console.log(`check:baseline — the fast gate (budget ${BUDGET_MS}ms wall)

  --serial        run one link at a time
  --jobs=N        concurrency allowance for this runner and its subtree (default ${defaultAllowance()})
  --only=a,b      run a subset by link id
  --list          show membership and why each link is here
  --json          machine-readable result

concurrency: the allowance is SPLIT between the nested-pool links (massline runs a pool of 23 of its
own) and the leaf links, and is passed down in ${JOBS_ENV}. Nested pools divide the machine; they
must never multiply it. Set ${JOBS_ENV} or --jobs to cap the whole tree.

links: ${LINKS.map((l) => l.id).join(', ')}`);
}
