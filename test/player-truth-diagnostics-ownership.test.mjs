// Evidence ownership: old children and invalid clock windows cannot excuse a route failure.
// No browser, sleeps, or game imports; event order is driven explicitly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import {
  applyHarnessLaunchOptions, chromeOwnsProcessGroup, classifyBrowserLoss,
  isChromeExecutable, parseProcStat, withChromeSpawnCapture,
} from '../scripts/player-truth/browser.mjs';
import {
  createFreezeWatch, formatHarnessFreeze, overlappingHarnessFreezes, stallWallWindow,
} from '../scripts/player-truth/freezeWatch.mjs';

const cp = createRequire(import.meta.url)('node:child_process');

test('a retired launch cannot contaminate its replacement exit or stderr', () => {
  const original = cp.spawn;
  cp.spawn = () => Object.assign(new EventEmitter(), { stderr: new EventEmitter() });
  const fakeSpawn = cp.spawn;
  const slot = withChromeSpawnCapture();
  try {
    const retired = cp.spawn('chrome');
    slot.child = null; // The fallback loop retires the failed launch before trying a candidate.
    slot.stderrTail = '';
    slot.exitCode = null;
    slot.signal = null;
    const live = cp.spawn('chromium');
    retired.stderr.emit('data', Buffer.from('FATAL from old launch'));
    retired.emit('exit', 137, 'SIGKILL');
    assert.equal(slot.child, live);
    assert.equal(slot.stderrTail, '');
    assert.equal(slot.exitCode, null);
    assert.equal(slot.signal, null);
    live.stderr.emit('data', Buffer.from('SwiftShader from live launch'));
    live.emit('exit', 0, null);
    assert.equal(slot.stderrTail, 'SwiftShader from live launch');
    assert.equal(slot.exitCode, 0);
    assert.equal(slot.signal, null);
    slot.restore();
    assert.equal(cp.spawn, fakeSpawn);
  } finally {
    slot.restore();
    cp.spawn = original;
  }
});

for (const executable of [
  '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/cache/chrome-headless-shell', '/cache/headless_shell',
]) test(`captures supported executable ${executable}`, () => {
  assert.equal(isChromeExecutable(executable), true);
});

for (const executable of ['', 'node', '/bin/chrome_crashpad_handler', 'chrome-helper', 'mychrome.exe']) {
  test(`does not capture unrelated executable ${executable || '(empty)'}`, () => {
    assert.equal(isChromeExecutable(executable), false);
  });
}

test('proc identity needs real positive integer ids and a matching pid', () => {
  const stat = '4242 (chrome with ) in name) S 10 4242 4242 0 0';
  assert.deepEqual(parseProcStat(stat), { pid: 4242, ppid: 10, pgid: 4242, sid: 4242 });
  assert.equal(parseProcStat(stat, 99), null);
  assert.equal(parseProcStat('garbage) S 10 42 42', 42), null);
  for (const text of ['0 (chrome) S 10 0 0', '42 (chrome) S -1 42 42', '42 (chrome) S 1 4.2 42']) {
    assert.equal(parseProcStat(text), null);
  }
  const node = { pgid: 50 };
  assert.equal(chromeOwnsProcessGroup({ pid: 0, pgid: 0, sid: 0 }, node), false);
  assert.equal(chromeOwnsProcessGroup({ pid: 42, pgid: 42, sid: 42 }, node), true);
});

test('launch protection and bare page-loss grading remain unchanged', () => {
  assert.deepEqual(applyHarnessLaunchOptions({ headless: true }), {
    headless: true, handleSIGINT: true, handleSIGTERM: false, handleSIGHUP: false,
  });
  for (const note of ['page closed', 'page crashed']) {
    assert.equal(classifyBrowserLoss({ notes: [note], browserConnected: true }).environment, false);
  }
  assert.equal(classifyBrowserLoss({ signal: 'SIGKILL', browserConnected: false }).environment, true);
});

const stall = { wallStart: 40_000, wallEnd: 100_000 };
const freeze = (startWall, endWall) => ({ startWall, endWall, lagMs: 20_000 });
for (const invalid of [
  null, {}, { wallStart: null, wallEnd: 100_000 }, { wallStart: '', wallEnd: 100_000 },
  { wallStart: false, wallEnd: 100_000 }, { wallStart: 1, wallEnd: 1 },
  { wallStart: 3, wallEnd: 2 }, { wallStart: NaN, wallEnd: 2 },
]) test(`rejects unstamped/invalid stall window ${JSON.stringify(invalid)}`, () => {
  assert.equal(stallWallWindow(invalid), null);
  assert.deepEqual(overlappingHarnessFreezes(invalid, [freeze(0, 100_001)]), []);
});

test('freeze evidence must overlap for positive time, not just touch an endpoint', () => {
  const before = freeze(20_000, 40_000);
  const after = freeze(100_000, 120_000);
  const hit = freeze(99_999, 120_000);
  assert.deepEqual(overlappingHarnessFreezes(stall, [before, after, hit]), [hit]);
  assert.deepEqual(overlappingHarnessFreezes(stall, [null, {}, freeze(null, 80_000),
    freeze(80_000, 60_000), freeze(60_000, 60_000), freeze('', 80_000)]), []);
  assert.deepEqual(stallWallWindow({ wallStart: 0, wallEnd: 1 }), { start: 0, end: 1 });
});

test('unknown and out-of-Date-range freeze stamps cannot crash diagnostics or invent epoch dates', () => {
  assert.equal(formatHarnessFreeze(null), 'harness clock frozen ? s (? → ?)');
  assert.equal(formatHarnessFreeze({ startWall: null, endWall: 1e20, lagMs: NaN }),
    'harness clock frozen ? s (? → ?)');
  assert.match(formatHarnessFreeze(freeze(0, 20_000)), /20 s \(1970-01-01T00:00:00.000Z/);
});

test('freeze watch is idempotent and a snapshot does not expose its mutable rows', () => {
  let clock = 0; let tick; let schedules = 0; let clears = 0;
  const watch = createFreezeWatch({ now: () => clock, mono: () => clock,
    schedule(fn) { schedules++; tick = fn; return { unref() {} }; }, clear() { clears++; } });
  watch.start(); watch.start();
  clock = 20_000; tick();
  watch.snapshot()[0].startWall = 999;
  assert.equal(watch.snapshot()[0].startWall, 0);
  watch.stop(); watch.stop(); watch.start();
  assert.equal(schedules, 1);
  assert.equal(clears, 1);
});
