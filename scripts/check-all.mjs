#!/usr/bin/env node
// Run every step of `npm run check` and report the POPULATION, not the first casualty.
//
// WHY THIS EXISTS. `scripts.check` is a single `&&` chain of 111 steps. On 2026-08-23 it stopped at
// step 25 — `check:depth-program:contracts` fails on a seeded-matrix hash — which means the other
// **86 steps had never run as part of it**. Run independently the suite was 88 pass / 25 fail, and
// none of that was visible: a chain reports its first failure and nothing about the rest.
//
// The damage is subtle. While the chain stops early, a developer can break any of steps 26–111 and
// see a failure IDENTICAL to the one that was already there. The suite cannot distinguish "you broke
// something" from "the thing that was already broken is still broken".
//
// WHY THIS IS ADDITIVE RATHER THAN A REWRITE OF `scripts.check`. Four checks parse that string:
//
//   * check-first-dock-handoff.mjs      asserts scripts.check.includes('npm run check:first-dock-handoff')
//   * check-m1-tether-mass-grounding.mjs matches /npm run check:m1:tether-mass/g against it
//   * check-gate-reachability.mjs + lib/ciGateGraph.mjs compute the REACHABLE GATE SET from it
//   * check-ci-report.mjs                builds the CI matrix from it
//
// Replacing the chain with a call to this runner would break the first two outright and silently
// shrink the reachable set the third one polices. So the chain stays exactly as it is, and this
// reads it.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const STEP_TIMEOUT_MS = Number(process.env.SF_CHECK_ALL_TIMEOUT_MS || 300_000);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const chain = pkg.scripts && pkg.scripts.check;
if (!chain) {
  console.error('package.json has no "check" script to expand.');
  process.exit(2);
}

// The chain is `npm run <name>` and bare `node scripts/<file>` steps joined by &&.
const steps = [];
const re = /npm run ([a-z0-9:_-]+)|node (scripts\/[a-zA-Z0-9._/-]+)/g;
let m;
while ((m = re.exec(chain)) !== null) {
  steps.push(m[1] ? { kind: 'npm', name: m[1] } : { kind: 'node', name: m[2] });
}

const only = process.argv.includes('--from')
  ? steps.findIndex((s) => s.name === process.argv[process.argv.indexOf('--from') + 1])
  : 0;

console.log(`check-all — expanding scripts.check into ${steps.length} independent steps`);
console.log('(the chain itself is && and stops at the first failure; this does not)\n');

const results = [];
for (let i = Math.max(0, only); i < steps.length; i += 1) {
  const step = steps[i];
  // One command STRING through the shell, not a command + args array with shell:true. The latter
  // trips DEP0190 (arguments are concatenated unescaped); the former is what the shell option is
  // actually for. Step names are matched by /[a-z0-9:_-]+/ out of package.json, so there is nothing
  // to escape.
  const command = step.kind === 'npm' ? `npm run ${step.name}` : `node ${step.name}`;
  const started = Date.now();
  const run = spawnSync(command, {
    encoding: 'utf8',
    timeout: STEP_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  const timedOut = run.error && run.error.code === 'ETIMEDOUT';
  const ok = !timedOut && run.status === 0;
  let reason = '';
  if (!ok) {
    const text = `${run.stdout || ''}\n${run.stderr || ''}`;
    const line = text.split('\n').find((l) => /error|assert|fail|✖|not ok/i.test(l));
    reason = timedOut ? `timed out after ${STEP_TIMEOUT_MS / 1000}s` : (line || '').trim().slice(0, 150);
  }
  results.push({ index: i + 1, name: step.name, ok, seconds, reason });
  const label = ok ? 'PASS' : 'FAIL';
  console.log(`${String(i + 1).padStart(3)} ${label}  ${String(seconds).padStart(4)}s  ${step.name}`);
  if (!ok && reason) console.log(`            ${reason}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} pass / ${failed.length} fail of ${results.length} steps`);
if (failed.length) {
  console.log('\nfailing steps:');
  for (const f of failed) console.log(`  ${String(f.index).padStart(3)}  ${f.name}`);
  console.log('\nEvery step above RAN. A step missing from this list did not fail — it passed.');
  process.exit(1);
}
console.log('\nEvery step of the check aggregate passed.');
