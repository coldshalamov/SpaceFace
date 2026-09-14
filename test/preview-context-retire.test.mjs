import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { retireWhenProgramsReady } from '../src/ui/previewContextRetire.js';

function fakeTimers() {
  let clock = 0;
  const queue = [];
  return {
    now: () => clock,
    setTimer: (callback, ms) => { queue.push({ at: clock + ms, callback }); },
    advance(ms) {
      const until = clock + ms;
      for (;;) {
        queue.sort((a, b) => a.at - b.at);
        if (!queue.length || queue[0].at > until) break;
        const next = queue.shift();
        clock = next.at;
        next.callback();
      }
      clock = until;
    },
    pending: () => queue.length,
  };
}

function program(ready) {
  return { ready, queries: 0, isReady() { this.queries += 1; return this.ready; } };
}

test('a preview with nothing linking tears down at once', () => {
  const timers = fakeTimers();
  let finished = 0;
  const outcome = retireWhenProgramsReady({
    programs: [program(true), program(true)],
    parallelCompile: true,
    finish: () => { finished += 1; },
    setTimer: timers.setTimer,
    now: timers.now,
  });
  assert.equal(outcome, 'now');
  assert.equal(finished, 1);
  assert.equal(timers.pending(), 0);
});

test('without parallel compile every link already finished, so nothing is queried', () => {
  const timers = fakeTimers();
  const linking = program(false);
  let finished = 0;
  const outcome = retireWhenProgramsReady({
    programs: [linking],
    parallelCompile: false,
    finish: () => { finished += 1; },
    setTimer: timers.setTimer,
    now: timers.now,
  });
  assert.equal(outcome, 'now');
  assert.equal(finished, 1);
  assert.equal(linking.queries, 0);
});

test('teardown waits for the last linking program and runs exactly once', () => {
  const timers = fakeTimers();
  const hull = program(false);
  let finished = 0;
  const outcome = retireWhenProgramsReady({
    programs: [program(true), hull],
    parallelCompile: true,
    finish: () => { finished += 1; },
    setTimer: timers.setTimer,
    now: timers.now,
    pollMs: 250,
  });
  assert.equal(outcome, 'deferred');
  timers.advance(1000);
  assert.equal(finished, 0, 'nothing is torn down while a program is still linking');
  hull.ready = true;
  timers.advance(250);
  assert.equal(finished, 1);
  timers.advance(10_000);
  assert.equal(finished, 1);
  assert.equal(timers.pending(), 0, 'no poll outlives the teardown');
});

test('a check stops at the first program still linking', () => {
  const timers = fakeTimers();
  const programs = [program(false), program(false), program(false)];
  retireWhenProgramsReady({
    programs,
    parallelCompile: true,
    finish: () => {},
    setTimer: timers.setTimer,
    now: timers.now,
    pollMs: 250,
  });
  timers.advance(750);
  assert.equal(programs[2].queries, 4, 'one query at dispose and one per poll');
  assert.equal(programs[0].queries + programs[1].queries, 0);
});

test('a program that never reports ready cannot hold the context past the cap', () => {
  const timers = fakeTimers();
  let finished = 0;
  retireWhenProgramsReady({
    programs: [program(false)],
    parallelCompile: true,
    finish: () => { finished += 1; },
    setTimer: timers.setTimer,
    now: timers.now,
    pollMs: 250,
    maxWaitMs: 8000,
  });
  timers.advance(7750);
  assert.equal(finished, 0);
  timers.advance(250);
  assert.equal(finished, 1);
});

test('a lost context, a destroyed program or a missing entry counts as settled', () => {
  let finished = 0;
  const outcome = retireWhenProgramsReady({
    programs: [{ isReady: () => null }, { isReady() { throw new TypeError('program is undefined'); } }, null],
    parallelCompile: true,
    finish: () => { finished += 1; },
    setTimer: () => { throw new Error('no poll expected'); },
  });
  assert.equal(outcome, 'now');
  assert.equal(finished, 1);
});

test('the ship preview mount retires its context through the readiness wait', async () => {
  const source = await readFile(new URL('../src/ui/shipPreviewMount.js', import.meta.url), 'utf8');
  assert.match(source, /retireWhenProgramsReady\(\{/);
  assert.match(source, /KHR_parallel_shader_compile/);
});
