import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';

async function fixture(t) {
  let clock = 0;
  const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clock } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const posts = [];
  let onMessage;
  const lane = createSimLaneRuntime({
    state: { entities: new Map(), entityList: [], settings: {}, meta: { seed: 1 },
      tick: 0, simTime: 0, accumulator: 0, timeScale: 1, ui: { screenStack: [] } },
    registry: {},
    flags: { lane: 'worker', warnings: [], sab: false },
    channelFactory: () => ({
      post: (msg) => posts.push(msg),
      onMessage: (handler) => { onMessage = handler; },
      terminate() {},
    }),
  });
  t.after(() => {
    lane.close();
    if (performanceDescriptor) Object.defineProperty(globalThis, 'performance', performanceDescriptor);
    else delete globalThis.performance;
  });
  onMessage({ kind: 'ready', seq: posts[0].seq });
  await lane.readyPromise;
  lane.runner.stepOnce();
  const firstFlight = posts.at(-1);
  return { lane, posts, firstFlight, receive: onMessage, advanceWall: (ms) => { clock += ms; } };
}

test('a worker reply queued during a long main-thread task gets a dispatch turn before stall quarantine', async (t) => {
  const f = await fixture(t);
  f.advanceWall(5001);
  f.lane.runner.prepareWithoutAdvance();
  assert.equal(f.lane.runner.isClosed(), false);
  f.receive({ kind: 'tickDone', seq: f.firstFlight.seq, stateTick: 1, simTime: 1 / 60 });
  t.mock.timers.tick(0);
  assert.equal(f.lane.runner.isClosed(), false);
  assert.equal(f.lane.getDiagnostics().replyCount, 1);
});

test('a genuinely wedged worker still closes at the existing five-second deadline after confirmation', async (t) => {
  const f = await fixture(t);
  f.advanceWall(5001);
  f.lane.runner.prepareWithoutAdvance();
  assert.equal(f.lane.runner.isClosed(), false);
  t.mock.timers.tick(0);
  assert.equal(f.lane.runner.isClosed(), true);
  assert.throws(() => f.lane.runner.stepOnce(), /tick directive stalled >5000ms/);
});

test('confirmation for an old directive cannot close its successful replacement', async (t) => {
  const f = await fixture(t);
  f.advanceWall(5001);
  f.lane.runner.stepOnce();
  f.receive({ kind: 'tickDone', seq: f.firstFlight.seq, stateTick: 1 });
  const replacement = f.posts.at(-1);
  assert.notEqual(replacement.seq, f.firstFlight.seq);
  t.mock.timers.tick(0);
  assert.equal(f.lane.runner.isClosed(), false);
  f.advanceWall(5001);
  f.lane.runner.prepareWithoutAdvance();
  t.mock.timers.tick(0);
  assert.match(f.lane.getDiagnostics().error, new RegExp(`seq ${replacement.seq}`));
});
