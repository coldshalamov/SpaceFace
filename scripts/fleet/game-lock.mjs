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
function ticketPath() {
  return join(QUEUE, `${String(t0).padStart(15, '0')}-${process.pid}.json`);
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
// npm/npx are .cmd shims on Windows and need a shell; everything else runs directly so arguments
// are passed untouched. Shell arguments are quoted for cmd.exe.
const needsShell = process.platform === 'win32' && /^(npm|npx|pnpm|yarn)(\.cmd)?$/i.test(cmd[0]);
const q = (a) => (/^[\w.\/:=@-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
const child = needsShell
  ? spawn(cmd.map(q).join(' '), { cwd: process.cwd(), stdio: 'inherit', shell: true })
  : spawn(cmd[0] === 'node' ? process.execPath : cmd[0], cmd.slice(1), { cwd: process.cwd(), stdio: 'inherit' });
const done = (code) => { release(); process.exit(code ?? 1); };
child.on('close', done);
child.on('error', (e) => { console.error(`[game-lock] ${e.message}`); done(1); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { child.kill(); release(); process.exit(1); });
