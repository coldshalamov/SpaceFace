import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { LOOP_FIXED_DT, MAX_CATCHUP_STEPS } from '../src/core/simulationRunner.js';
import { laneWriteSetting } from '../src/core/simLaneCommands.js';

async function fixture(t) {
  let clock = 0;
  const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clock } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const posts = [];
  let onMessage;
  const bus = createBus();
  const resumeSignals = [];
  bus.on('sim:resume', payload => resumeSignals.push(payload));
  const state = { entities: new Map(), entityList: [], settings: {}, meta: { seed: 1 },
    tick: 0, simTime: 0, accumulator: 0, timeScale: 1, ui: { screenStack: [] } };
  const lane = createSimLaneRuntime({
    state, bus,
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
  return {
    lane, state, posts, firstFlight, receive: onMessage,
    resumeSignals,
    advanceWall: (ms) => { clock += ms; },
    dispatch: (ms = 100) => { clock += ms; t.mock.timers.tick(ms); },
  };
}

test('a mirrored worker undock wakes the main UI pause owner after the station pop', async (t) => {
  const f = await fixture(t);
  f.state.ui.docked = true;
  f.lane.runner.stepOnce();
  const flight = f.posts.at(-1);
  f.receive({
    kind: 'tickDone', seq: flight.seq, stateTick: 1,
    domainUpdates: [{ segs: ['ui.docked'], v: false }],
  });
  assert.equal(f.state.ui.docked, false);
  assert.deepEqual(f.resumeSignals, [{ source: 'sim-lane-domain-mirror' }]);
});

test('cold main-thread work is excluded even when WebKit dispatches timers before a queued worker reply', async (t) => {
  const f = await fixture(t);
  f.advanceWall(15000);
  f.lane.runner.prepareWithoutAdvance();
  t.mock.timers.tick(100);
  assert.equal(f.lane.getDiagnostics().inFlightMainThreadDelayedMs, 14900);
  assert.equal(f.lane.getDiagnostics().inFlightResponsiveMs, 100);
  // One timer turn is not sufficient: let several callbacks win the task-source choice.
  f.dispatch();
  f.dispatch();
  assert.equal(f.lane.runner.isClosed(), false);
  f.receive({ kind: 'tickDone', seq: f.firstFlight.seq, stateTick: 1, simTime: 1 / 60 });
  t.mock.timers.tick(0);
  assert.equal(f.lane.runner.isClosed(), false);
  assert.equal(f.lane.getDiagnostics().replyCount, 1);
});

test('a genuinely wedged worker still closes after five seconds of responsive browser dispatch', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 49; i++) f.dispatch();
  assert.equal(f.lane.runner.isClosed(), false);
  f.dispatch();
  t.mock.timers.tick(0);
  assert.equal(f.lane.runner.isClosed(), true);
  assert.throws(() => f.lane.runner.stepOnce(), /tick directive stalled >5000ms/);
});

test('a blocked interval postpones but cannot forgive a worker that remains wedged after dispatch resumes', async (t) => {
  const f = await fixture(t);
  f.advanceWall(15000);
  t.mock.timers.tick(100);
  for (let i = 0; i < 48; i++) f.dispatch();
  assert.equal(f.lane.runner.isClosed(), false);
  f.dispatch();
  t.mock.timers.tick(0);
  assert.equal(f.lane.runner.isClosed(), true);
});

test('confirmation for an old directive cannot close its successful replacement', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 49; i++) f.dispatch();
  f.lane.runner.stepOnce();
  f.receive({ kind: 'tickDone', seq: f.firstFlight.seq, stateTick: 1 });
  const replacement = f.posts.at(-1);
  assert.notEqual(replacement.seq, f.firstFlight.seq);
  t.mock.timers.tick(0);
  assert.equal(f.lane.runner.isClosed(), false);
  for (let i = 0; i < 50; i++) f.dispatch();
  t.mock.timers.tick(0);
  assert.match(f.lane.getDiagnostics().error, new RegExp(`seq ${replacement.seq}`));
});

test('closing the lane cancels the pending watchdog callback', async (t) => {
  const f = await fixture(t);
  f.lane.close();
  f.advanceWall(15000);
  t.mock.timers.tick(15000);
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('a slow worker cannot accumulate a larger catch-up burst across presentation frames', async (t) => {
  const f = await fixture(t);
  laneWriteSetting(f.state, 'settings.gameplay.difficulty', 'standard');
  laneWriteSetting(f.state, 'settings.gameplay.tutorialHints', false);
  let shed = 0;
  for (let i = 0; i < 7; i++) {
    const result = f.lane.runner.advance(LOOP_FIXED_DT * 2.25, 1);
    shed += result.shedSteps;
  }
  assert.equal(f.posts.at(-1), f.firstFlight, 'there remains one outstanding directive');
  f.receive({ kind: 'tickDone', seq: f.firstFlight.seq, stateTick: 1, simTime: LOOP_FIXED_DT });
  const catchup = f.posts.at(-1);
  assert.equal(catchup.steps, MAX_CATCHUP_STEPS, 'worker catch-up keeps the same four-step ceiling as the main runner');
  assert.equal(shed, 11, 'whole overdue ticks are explicitly shed instead of replayed in a growing burst');
  assert.ok(Math.abs(f.state.accumulator - LOOP_FIXED_DT * 0.75) < 1e-12, 'sub-tick interpolation phase survives');
  assert.deepEqual(catchup.commands.filter(env => env.t === 'settings').map(env => env.p), [
    { path: 'settings.gameplay.difficulty', value: 'standard' },
    { path: 'settings.gameplay.tutorialHints', value: false },
  ], 'shedding time never drops or reorders authoritative intents');
  assert.equal(f.lane.runner.isClosed(), false);
});

test('recovery caps also bound a queued worker batch while healthy replies preserve realtime', async (t) => {
  const f = await fixture(t);
  f.lane.runner.advance(LOOP_FIXED_DT * 4.25, 1);
  const recovery = f.lane.runner.advance(LOOP_FIXED_DT * 1.25, 1, 1);
  f.receive({ kind: 'tickDone', seq: f.firstFlight.seq, stateTick: 1 });
  const capped = f.posts.at(-1);
  assert.equal(capped.steps, 1);
  assert.equal(recovery.shedSteps, 4);
  assert.equal(recovery.shedBacklog, true);
  assert.ok(Math.abs(f.state.accumulator - LOOP_FIXED_DT * 0.5) < 1e-12);
  f.receive({ kind: 'tickDone', seq: capped.seq, stateTick: 2 });
  f.lane.runner.consumeLatestCompletedTick({});
  f.state.accumulator = 0;
  const postedBefore = f.lane.getDiagnostics().postedSteps;
  for (let i = 0; i < 25; i++) {
    const result = f.lane.runner.advance(0.04, 1);
    assert.equal(result.shedBacklog, false, 'responsive 25 fps presentation retains realtime simulation');
    const flight = f.posts.at(-1);
    assert.ok(flight.steps <= MAX_CATCHUP_STEPS);
    f.receive({ kind: 'tickDone', seq: flight.seq, stateTick: 3 + i });
    f.lane.runner.consumeLatestCompletedTick({});
  }
  assert.equal(f.lane.getDiagnostics().postedSteps - postedBefore, 60);
  assert.ok(Math.abs(f.state.accumulator) < 1e-12);
});
