#!/usr/bin/env node
// Fleet stability gate — one command that says "the game still works".
//
//   npm run gate               all four steps, stopping at the first failure
//   npm run gate -- --quick    steps 1–2 only (import lint + Adventure boot)
//
//   1. import-lint     npm run check:src-imports  every relative src/ specifier is canonical
//                                               and resolves verbatim — the `.//` boot brick
//   2. boot-adventure  npm run check:playable     real-route boot: menu, launch, hull, ship
//                                               mesh, world, controls, no exception/shader error
//   3. boot-swarm      npm run player-truth -- --mode=swarm --rounds=1   headless Swarm boot
//   4. sim-47a         npm run check:sim          deterministic 47-A replay
//
// Prints one line per step (PASS boot-adventure 74s / FAIL boot-swarm: <first error line>),
// then GATE PASS or GATE FAIL, writes the same to .devshots/fleet/gate-last.txt, and exits
// 0/1. Each step's full output lands in .devshots/fleet/gate-<step>.log. Total budget 12 min.

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(REPO, '.devshots', 'fleet');
const QUICK = process.argv.slice(2).includes('--quick');
const BUDGET_MS = 12 * 60 * 1000;

const STEPS = [
  { name: 'import-lint', args: ['run', 'check:src-imports'] },
  { name: 'boot-adventure', args: ['run', 'check:playable'] },
  { name: 'boot-swarm', args: ['run', 'player-truth', '--', '--mode=swarm', '--rounds=1'] },
  { name: 'sim-47a', args: ['run', 'check:sim'] },
];

// Inside `npm run gate`, npm_execpath is the npm CLI itself: `node <npm-cli> run ...` works on
// every platform. Outside npm, fall back to the npm executable on PATH.
const NPM = process.env.npm_execpath
  ? { file: process.execPath, base: [process.env.npm_execpath] }
  : { file: process.platform === 'win32' ? 'npm.cmd' : 'npm', base: [] };

const ERRORISH = /\bFAIL\b|\berror\b|exception|assert|ENVIRONMENT|could not run|timed out|not ok|✗|✘/i;

function firstErrorLine(out) {
  const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hit = lines.find((l) => ERRORISH.test(l));
  return (hit || lines[lines.length - 1] || 'no output').slice(0, 220);
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGKILL');
  } catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

function runStep(step, timeoutMs) {
  return new Promise((resolvePromise) => {
    const child = spawn(NPM.file, [...NPM.base, ...step.args], {
      cwd: REPO, env: process.env,
      detached: process.platform !== 'win32', // own process group so killTree works on POSIX
      windowsHide: true,
    });
    let out = '';
    const onData = (d) => {
      out += d.toString();
      if (out.length > 8_000_000) out = `${out.slice(0, 4_000_000)}\n...[gate: middle of log truncated]...\n${out.slice(-2_000_000)}`;
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, Math.max(1000, timeoutMs));
    let settled = false;
    const done = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ code, out, timedOut });
    };
    child.on('error', (err) => { out += `\nspawn error: ${err.message}`; done(-1); });
    child.on('close', (code) => done(code ?? -1));
  });
}

mkdirSync(OUT_DIR, { recursive: true });
const lines = [];
const emit = (l) => { lines.push(l); console.log(l); };
const deadline = Date.now() + BUDGET_MS;
let gateOk = true;

for (const step of QUICK ? STEPS.slice(0, 2) : STEPS) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    emit(`FAIL ${step.name}: gate time budget (12m) already spent`);
    gateOk = false;
    break;
  }
  const t0 = Date.now();
  const r = await runStep(step, remaining);
  const secs = Math.round((Date.now() - t0) / 1000);
  writeFileSync(join(OUT_DIR, `gate-${step.name}.log`), r.out);
  if (r.code === 0 && !r.timedOut) {
    emit(`PASS ${step.name} ${secs}s`);
  } else {
    const detail = r.timedOut ? `timed out at ${secs}s (gate budget 12m)` : firstErrorLine(r.out);
    emit(`FAIL ${step.name}: ${detail}`);
    emit(`  log: .devshots/fleet/gate-${step.name}.log (${secs}s)`);
    gateOk = false;
    break;
  }
}

emit(gateOk ? 'GATE PASS' : 'GATE FAIL');
writeFileSync(join(OUT_DIR, 'gate-last.txt'), lines.join('\n') + '\n');
process.exit(gateOk ? 0 : 1);
