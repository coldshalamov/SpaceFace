#!/usr/bin/env node
// One game at a time on this machine (owner, 2026-11-11: the laptop crashed twice under several
// simultaneous game/browser boots). Anything that starts the game, a browser or Electron —
// check:playable, player-truth, probes, ui-bench, the gate — runs under this lock:
//
//   node scripts/fleet/game-lock.mjs run -- <command> [args...]   (waits for the lock, runs, releases)
//   node scripts/fleet/game-lock.mjs status
//
// The lock is a file holding the holder's pid and start time. A holder whose process is gone, or
// that has held it longer than STALE_MIN, is treated as stale and replaced.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(REPO, '.devshots', 'fleet');
const LOCK = join(DIR, 'game.lock');
const STALE_MIN = 30;
const WAIT_MAX_MIN = 60;

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function readLock() {
  if (!existsSync(LOCK)) return null;
  try { return JSON.parse(readFileSync(LOCK, 'utf8')); } catch { return null; }
}
function stale(l) {
  return !l || !alive(l.pid) || (Date.now() - l.at) > STALE_MIN * 60_000;
}
function tryTake(label) {
  const l = readLock();
  if (l && !stale(l)) return false;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now(), label }));
  const back = readLock();
  return !!back && back.pid === process.pid;
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
const t0 = Date.now();
while (!tryTake(label)) {
  if (Date.now() - t0 > WAIT_MAX_MIN * 60_000) {
    console.error(`[game-lock] waited ${WAIT_MAX_MIN} min; another game is still running (${readLock()?.label}). Giving up.`);
    process.exit(3);
  }
  console.error(`[game-lock] another game is running (${readLock()?.label}); waiting...`);
  await new Promise((r) => setTimeout(r, 15_000));
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
