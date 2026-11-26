// The focused game states its own scheduling: above-normal priority and the Windows power-throttling
// opt-out go on together when its window gains focus and come off together when it loses it.
// The opt-out is an outside call (a short PowerShell script), so it must be made once per change
// of state, never once per presence tick.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { startPlayerPresence } = require('../scripts/lib/playerPresence.cjs');
const { powerShellScript } = require('../scripts/lib/processScheduling.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('the throttling opt-out is applied once per focus change and once more when the process set changes', async () => {
  let focused = true;
  let pids = [process.pid];
  const calls = [];
  const lines = [];
  const stop = startPlayerPresence({
    isFocused: () => focused,
    processIds: () => pids,
    file: path.join(os.tmpdir(), `sf-presence-test-${process.pid}.json`),
    tickMs: 20,
    setThrottlingOptOut: (list, on) => { calls.push({ list: list.slice(), on }); return Promise.resolve({ ok: true, applied: list.length, of: list.length, detail: 'ok' }); },
    onScheduling: (line, details) => lines.push({ line, details }),
  });
  try {
    await sleep(120); // several ticks, focused throughout
    assert.equal(calls.length, 1, 'many focused ticks, one opt-out call');
    assert.deepEqual(calls[0], { list: [process.pid], on: true });
    pids = [process.pid, 999_999_1]; // a renderer restarted: a new process joins
    await sleep(80);
    assert.equal(calls.length, 2, 'a changed process set is stated again');
    assert.equal(calls[1].on, true);
    focused = false;
    await sleep(80);
    assert.equal(calls.length, 3, 'losing focus hands the decision back once');
    assert.equal(calls[2].on, false);
    await sleep(80);
    assert.equal(calls.length, 3, 'unfocused ticks make no further calls');
    assert.match(lines[0].line, /focused: above-normal priority and no power throttling for 1 of 1/);
    assert.equal(lines[0].details.ok, true);
    assert.match(lines.at(-1).line, /not focused: normal priority, power throttling back to Windows/);
  } finally {
    stop();
    try { os.setPriority(process.pid, os.constants.priority.PRIORITY_NORMAL); } catch (_) { /* test host */ }
  }
});

test('a failed opt-out is reported, not thrown, and the game keeps its priority', async () => {
  const lines = [];
  const stop = startPlayerPresence({
    isFocused: () => true,
    processIds: () => [process.pid],
    file: path.join(os.tmpdir(), `sf-presence-test-${process.pid}-b.json`),
    tickMs: 20,
    setThrottlingOptOut: () => Promise.resolve({ ok: false, applied: 0, of: 1, detail: 'timed out' }),
    onScheduling: (line) => lines.push(line),
  });
  try {
    await sleep(60);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /not applied: timed out/);
  } finally {
    stop();
    try { os.setPriority(process.pid, os.constants.priority.PRIORITY_NORMAL); } catch (_) { /* test host */ }
  }
});

test('the script opts out with control=1 and hands back with control=0, for exactly the listed processes', () => {
  const on = powerShellScript([11, 22, -3, 1.5], true);
  assert.match(on, /'11,22'\.Split/);
  assert.match(on, /\[SfSched\]::Set\(\[int\]\$p, 1\)/);
  assert.match(powerShellScript([11], false), /\[SfSched\]::Set\(\[int\]\$p, 0\)/);
});
