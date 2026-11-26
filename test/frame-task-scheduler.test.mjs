import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameTaskScheduler, frameTaskStats } from '../src/core/frameTaskScheduler.js';

// A clock the test advances by hand; a job "costs" time by advancing it.
function harness() {
  let t = 1000;
  const clock = { now: () => t, advance(ms) { t += ms; } };
  return clock;
}

test('a frame never pays for more than the budget plus one job, whatever the frame rate', () => {
  const clock = harness();
  const s = createFrameTaskScheduler({ now: clock.now });
  const ran = [];
  for (const name of ['a', 'b', 'c', 'd', 'e']) {
    s.register(name, () => { ran.push(name); clock.advance(1.5); }, { hz: 30, maxLateMs: 100000 });
  }
  // An 8 fps game: every job is overdue on every frame. A plain rate throttle would run all five.
  let worst = 0;
  for (let frame = 0; frame < 40; frame++) {
    clock.advance(125);
    const before = ran.length;
    const spent = s.run(2);
    worst = Math.max(worst, spent);
    assert.ok(ran.length - before <= 2, 'at most two 1.5 ms jobs fit a 2 ms budget');
  }
  assert.ok(worst <= 3.01, `frame cost stayed bounded (worst ${worst} ms)`);
  // And every job still got its turn.
  for (const name of ['a', 'b', 'c', 'd', 'e']) assert.ok(ran.filter((n) => n === name).length >= 10, `${name} ran`);
});

test('at a high frame rate a job runs at its wanted rate, not every frame', () => {
  const clock = harness();
  const s = createFrameTaskScheduler({ now: clock.now });
  let count = 0;
  s.register('readout', () => { count++; }, { hz: 10 });
  for (let frame = 0; frame < 600; frame++) { clock.advance(1000 / 60); s.run(2); }
  assert.ok(count >= 95 && count <= 102, `about 100 runs in 10 s at 10 Hz, got ${count}`);
});

test('the most overdue job runs first and a starving job runs even when the budget is spent', () => {
  const clock = harness();
  const s = createFrameTaskScheduler({ now: clock.now });
  const order = [];
  s.register('heavy', () => { order.push('heavy'); clock.advance(6); }, { hz: 60 });
  s.register('slow', () => { order.push('slow'); clock.advance(0.2); }, { hz: 2, maxLateMs: 300 });
  for (let frame = 0; frame < 120; frame++) { clock.advance(16); s.run(1); }
  assert.ok(order.includes('slow'), 'the slow job was not starved by the heavy one');
  const stats = s.stats();
  const slow = stats.tasks.find((x) => x.name === 'slow');
  assert.ok(slow.maxLateMs <= 300 + 16 + 6 + 1, `lateness bounded near maxLateMs (${slow.maxLateMs})`);
});

test('request() runs a job on the next frame and a throwing job does not break the frame', () => {
  const clock = harness();
  const s = createFrameTaskScheduler({ now: clock.now, name: 'test-group' });
  let runs = 0;
  const handle = s.register('vitals', () => { runs++; }, { hz: 1 });
  s.register('broken', () => { throw new Error('boom'); }, { hz: 60 });
  clock.advance(16); s.run(2);
  const afterFirst = runs;
  clock.advance(16); s.run(2);
  assert.equal(runs, afterFirst, 'a 1 Hz job does not rerun 16 ms later');
  handle.request();
  clock.advance(16); s.run(2);
  assert.equal(runs, afterFirst + 1, 'a requested job runs at the next frame');
  const group = frameTaskStats()['test-group'];
  assert.ok(group.tasks.find((x) => x.name === 'broken').errors >= 1, 'errors are counted, not thrown');
});

test('a job receives the seconds since its own last run', () => {
  const clock = harness();
  const s = createFrameTaskScheduler({ now: clock.now });
  const seen = [];
  s.register('integrator', (dt) => { seen.push(dt); }, { hz: 10 });
  clock.advance(50); s.run(2);
  clock.advance(250); s.run(2);
  assert.ok(Math.abs(seen.at(-1) - 0.25) < 1e-9, `elapsed is the real gap (${seen.at(-1)})`);
});
