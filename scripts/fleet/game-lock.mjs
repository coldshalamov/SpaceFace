#!/usr/bin/env node
// One game at a time on this machine (owner, 2026-11-11: the laptop crashed twice under several
// simultaneous game/browser boots). Anything that starts the game, a browser or Electron —
// check:playable, player-truth, probes, ui-bench, the gate — runs under this lock:
//
//   node scripts/fleet/game-lock.mjs run -- <command> [args...]   (waits for the lock, runs, releases)
//   node scripts/fleet/game-lock.mjs status
//
// The lock records the holder's pid and start time. A live holder keeps ownership for the
// full command, including long capture batches. Recover the lock after the holder exits.
//
// Waiters are served first come, first served (lead 2026-11-13: with a dozen agents queued the old
// free-for-all left one run waiting 50+ minutes and timed others out). Each waiter drops a ticket
// in .devshots/fleet/game-queue/; only the oldest live ticket may take a free lock. Tickets of dead
// processes are ignored and swept.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(REPO, '.devshots', 'fleet');
const LOCK = join(DIR, 'game.lock');
const QUEUE = join(DIR, 'game-queue');
const OWNER_ENV = 'SPACEFACE_GAME_LOCK_OWNER';
// FIFO bounds a wait by the queue ahead of you, so a long queue is not a reason to give up.
const WAIT_MAX_MIN = 240;

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function readLock() {
  if (!existsSync(LOCK)) return null;
  try { return JSON.parse(readFileSync(LOCK, 'utf8')); } catch { return null; }
}
function stale(l) {
  return !l || !alive(l.pid);
}
function tryTake(label) {
  const l = readLock();
  if (l && !stale(l)) return false;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now(), label }));
  const back = readLock();
  return !!back && back.pid === process.pid;
}
// SF_LOCK_URGENT=1 (lead-granted, for a blocking demo defect) queues ahead of ordinary tickets; urgent
// tickets still serve each other first come, first served. It never interrupts a running holder.
const URGENT = process.env.SF_LOCK_URGENT === '1';
function ticketPath() {
  const order = URGENT ? `000${String(t0).padStart(14, '0')}` : `1${String(t0).padStart(14, '0')}`;
  return join(QUEUE, `${order}-${process.pid}.json`);
}
function enqueue(label) {
  mkdirSync(QUEUE, { recursive: true });
  writeFileSync(ticketPath(), JSON.stringify({ pid: process.pid, at: t0, label }));
}
function dequeue() {
  try { unlinkSync(ticketPath()); } catch { /* gone */ }
}
// The oldest ticket whose process is still alive; dead tickets are swept on the way.
function headOfQueue() {
  let names = [];
  try { names = readdirSync(QUEUE).filter((n) => n.endsWith('.json')).sort(); } catch { return null; }
  for (const name of names) {
    const pid = Number(name.slice(name.indexOf('-') + 1, -5));
    if (Number.isFinite(pid) && alive(pid)) return pid;
    try { unlinkSync(join(QUEUE, name)); } catch { /* raced */ }
  }
  return null;
}
function release() {
  const l = readLock();
  if (l && l.pid === process.pid) { try { unlinkSync(LOCK); } catch { /* gone */ } }
}
function samePath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = resolve(a), right = resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

// This inherited marker only rejects nested acquisitions; it never grants access to a lock.
// Match the current holder and timestamp so stale child environments cannot block later runs.
function inheritedOwnerHoldsLock() {
  let inherited;
  try { inherited = JSON.parse(process.env[OWNER_ENV] || 'null'); } catch { return false; }
  const current = readLock();
  return !!inherited && samePath(inherited.path, LOCK) && !!current && !stale(current)
    && inherited.pid === current.pid && inherited.at === current.at;
}

// `npm run gate` already invokes this lock. If an outer lock was explicitly requested for
// that exact checked-in script, run its gate body directly under the outer owner instead.
// Check the package script and lifecycle hooks so other npm scripts keep npm's normal behavior.
function commandForHeldLock(command) {
  if (!/^npm(?:\.cmd)?$/i.test(command[0]) || command[1] !== 'run' || command[2] !== 'gate'
      || (command.length > 3 && command[3] !== '--')) return command;
  if (!samePath(process.cwd(), REPO)) return command;
  let scripts;
  try { scripts = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).scripts; } catch { return command; }
  if (scripts?.gate !== 'node scripts/fleet/game-lock.mjs run -- node scripts/fleet/gate.mjs'
      || scripts.pregate || scripts.postgate) return command;
  return ['node', join(REPO, 'scripts', 'fleet', 'gate.mjs'), ...command.slice(4)];
}

const args = process.argv.slice(2);
if (args[0] === 'status') {
  const l = readLock();
  console.log(!l ? 'free' : stale(l) ? `stale (${l.label})` : `held by pid ${l.pid}: ${l.label} for ${Math.round((Date.now() - l.at) / 1000)} s`);
  process.exit(0);
}
if (args[0] !== 'run' || args[1] !== '--' || !args[2]) {
  console.error('usage: node scripts/fleet/game-lock.mjs run -- <command> [args...] | status');
  process.exit(2);
}
const cmd = args.slice(2);
const label = cmd.join(' ').slice(0, 120);
// The no-argument bench serves static pages indefinitely and starts no browser.
// A bench capture (--shot) still launches its browser under the same gate.
const serverOnlyBench = cmd.length === 2 && cmd[0] === 'node' && cmd[1] === 'scripts/ui-bench.mjs';
const t0 = Date.now();
if (!serverOnlyBench) {
  if (inheritedOwnerHoldsLock()) {
    console.error('[game-lock] nested game-lock request would wait for its own parent; run the inner command directly under the existing lock.');
    process.exit(4);
  }
  enqueue(label);
  process.on('exit', dequeue);
  let lastNote = 0;
  while (!(headOfQueue() === process.pid && tryTake(label))) {
    if (Date.now() - t0 > WAIT_MAX_MIN * 60_000) {
      console.error(`[game-lock] waited ${WAIT_MAX_MIN} min; another game is still running (${readLock()?.label}). Giving up.`);
      dequeue();
      process.exit(3);
    }
    if (Date.now() - lastNote > 60_000) {
      lastNote = Date.now();
      console.error(`[game-lock] another game is running (${readLock()?.label}); waiting...`);
    }
    // The head polls fast so a released lock is not left idle; the rest of the queue polls slowly.
    await new Promise((r) => setTimeout(r, headOfQueue() === process.pid ? 2_000 : 10_000));
  }
  dequeue();
}
const childEnv = { ...process.env };
let executionCmd = cmd;
if (!serverOnlyBench) {
  const held = readLock();
  if (!held || held.pid !== process.pid) {
    console.error('[game-lock] ownership changed before the command could start.');
    process.exit(5);
  }
  childEnv[OWNER_ENV] = JSON.stringify({ path: LOCK, pid: held.pid, at: held.at });
  executionCmd = commandForHeldLock(cmd);
}
// npm/npx are .cmd shims on Windows and need a shell; everything else runs directly so arguments
// are passed untouched. Shell arguments are quoted for cmd.exe.
const needsShell = process.platform === 'win32' && /^(npm|npx|pnpm|yarn)(\.cmd)?$/i.test(executionCmd[0]);
const q = (a) => (/^[\w.\/:=@-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
const child = needsShell
  ? spawn(executionCmd.map(q).join(' '), { cwd: process.cwd(), env: childEnv, stdio: 'inherit', shell: true })
  : spawn(executionCmd[0] === 'node' ? process.execPath : executionCmd[0], executionCmd.slice(1),
    { cwd: process.cwd(), env: childEnv, stdio: 'inherit' });
const done = (code) => { release(); process.exit(code ?? 1); };
child.on('close', done);
child.on('error', (e) => { console.error(`[game-lock] ${e.message}`); done(1); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { child.kill(); release(); process.exit(1); });
