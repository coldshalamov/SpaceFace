import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createPresentationRunner } from '../src/core/presentationRunner.js';
import { laneDomEvent } from '../src/core/simLaneCommands.js';
import { LOOP_FIXED_DT, MAX_CATCHUP_STEPS } from '../src/core/simulationRunner.js';

function makeScheduler() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();

  function runDue() {
    let ran = true;
    while (ran) {
      ran = false;
      for (const [id, timer] of timers) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.fn();
        ran = true;
        break;
      }
    }
  }

  return {
    nowMs: () => now,
    setTimeout(fn, delay) {
      const id = ++nextId;
      timers.set(id, { at: now + Math.max(0, Number(delay) || 0), fn });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      now += Math.max(0, ms);
      runDue();
    },
    pending() { return timers.size; },
  };
}

async function makeFixture(t) {
  const scheduler = makeScheduler();
  const posts = [];
  let receive = null;
  const state = {
    entities: new Map(),
    entityList: [],
    settings: { controls: { mouse: {} } },
    meta: { seed: 1 },
    input: {},
    ui: { screenStack: [] },
    tick: 0,
    simTime: 0,
    accumulator: 0,
    timeScale: 1,
  };
  const lane = createSimLaneRuntime({
    state,
    registry: {},
    flags: { lane: 'worker', warnings: [], sab: false },
    pumpScheduler: scheduler,
    channelFactory: () => ({
      post(msg) { posts.push(msg); },
      onMessage(handler) { receive = handler; },
      terminate() {},
    }),
  });
  t.after(() => lane.close());
  receive({ kind: 'ready', seq: posts[0].seq });
  await lane.readyPromise;
  return { lane, posts, scheduler, state, receive };
}

function tickPosts(posts) {
  return posts.filter((msg) => msg.kind === 'tick');
}

function clockPosts(posts) {
  return tickPosts(posts).filter((msg) => msg.steps > 0);
}

function acknowledge(fixture, msg, tick = 1) {
  fixture.receive({
    kind: 'tickDone',
    seq: msg.seq,
    stateTick: tick,
    simTime: tick * LOOP_FIXED_DT,
  });
}

function activate(fixture) {
  fixture.lane.runner.setClockActive(true);
  // Startup folds the current UI ownership before the first cadence interval. Complete that
  // zero-step transport here so each test's first measured tick is a clock tick.
  const startup = tickPosts(fixture.posts).at(-1);
  if (startup) acknowledge(fixture, startup);
  fixture.scheduler.advance(0);
}

test('worker pump advances at fixed cadence without waiting for rAF and wakes FIFO commands', async (t) => {
  const f = await makeFixture(t);
  activate(f);
  assert.equal(f.lane.getDiagnostics().clockOwner, 'worker-pump');
  assert.equal(f.scheduler.pending(), 1, 'one recursive cadence timer is armed');

  f.scheduler.advance(17);
  const first = clockPosts(f.posts)[0];
  assert.ok(first, 'timer produced a worker directive without a presentation callback');
  assert.equal(first.steps, 1);
  assert.ok(f.lane.getDiagnostics().workerPumpTicks >= 1);

  // A DOM command while the worker is busy uses one disposable acknowledgement wake. It is
  // delivered in order after the first tick rather than waiting for rAF or a second pointer turn.
  laneDomEvent({ type: 'resize' });
  assert.equal(f.lane.getDiagnostics().workerPumpAckWakePending, true);
  acknowledge(f, first);
  f.scheduler.advance(0);
  const second = tickPosts(f.posts).at(-1);
  assert.ok(second, 'ack wake flushed the queued command');
  assert.ok(second.commands.some((command) => command.t === 'dom'), 'resize stayed on the wire');
  assert.equal(f.lane.getDiagnostics().workerPumpAckWakePending, false);
});

test('worker pump preserves the four-step transport ceiling and sheds delayed timer debt', async (t) => {
  const f = await makeFixture(t);
  activate(f);
  f.scheduler.advance(17);
  const first = clockPosts(f.posts)[0];

  // Keep the first directive outstanding while many cadence turns arrive. Pending steps are
  // bounded exactly as runner.advance() bounds rAF debt, so the reply can never carry an
  // unbounded burst after a delayed worker.
  f.scheduler.advance(250);
  assert.equal(clockPosts(f.posts).length, 1);
  acknowledge(f, first);
  const catchup = tickPosts(f.posts).at(-1);
  assert.ok(catchup.steps <= MAX_CATCHUP_STEPS);
  assert.equal(catchup.steps, 2, 'a delayed cadence turn uses the same hitch cap as rAF');
  assert.ok(f.lane.getDiagnostics().workerPumpShedSteps > 0);
});

test('worker pump stops on lifecycle pause and rebases after resume', async (t) => {
  const f = await makeFixture(t);
  activate(f);
  f.scheduler.advance(17);
  const firstCount = clockPosts(f.posts).length;
  acknowledge(f, clockPosts(f.posts).at(-1));
  f.lane.runner.setClockActive(false);
  assert.equal(f.lane.getDiagnostics().workerPumpRequested, false);
  assert.equal(f.scheduler.pending(), 0, 'both cadence and acknowledgement wakes are disposable');
  f.scheduler.advance(1000);
  assert.equal(clockPosts(f.posts).length, firstCount);

  f.lane.runner.setClockActive(true);
  f.scheduler.advance(1);
  assert.equal(clockPosts(f.posts).length, firstCount, 'resume does not replay hidden wall time');
  f.scheduler.advance(17);
  assert.ok(clockPosts(f.posts).length > firstCount, 'fresh cadence resumes after the new anchor');
});

test('presentation rAF consumes a worker snapshot without advancing the worker clock', () => {
  const queued = [];
  let now = 0;
  let advances = 0;
  let prepares = 0;
  const clockStates = [];
  const simulation = {
    fixedDt: LOOP_FIXED_DT,
    maxSteps: MAX_CATCHUP_STEPS,
    clockOwner: 'worker-pump',
    setClockActive(active, reason) { clockStates.push({ active, reason }); },
    setLifecycleGeneration() {},
    advance() { advances++; return { steps: 1, shedBacklog: false, shedSteps: 0, accumulator: 0 }; },
    prepareWithoutAdvance() {
      prepares++;
      return { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
    },
    consumeLatestCompletedTick() { return 0; },
    interpolationAlpha() { return 0; },
    close() {},
    getDiagnostics() { return { clockOwner: 'worker-pump' }; },
  };
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: { actions: {} },
    render: { displayHz: 60 },
    settings: { video: { vsync: false, frameCap: 0 } },
  };
  const loop = createPresentationRunner(state, {
    renderUpdate() {},
    get() { return null; },
  }, simulation, {
    requestFrame(callback) { queued.push(callback); return queued.length; },
    cancelFrame() { queued.length = 0; },
    nowMs: () => now,
    visibilityTarget: null,
    lifecyclePort: null,
    inputResumeTarget: null,
  });
  try {
    assert.deepEqual(clockStates[0], { active: true, reason: 'startup' });
    now += 1000 / 60;
    queued.shift()(now);
    assert.equal(advances, 0, 'rAF never double advances a worker-owned clock');
    assert.equal(prepares, 1, 'rAF still samples/flushed the presentation boundary');
  } finally {
    loop.close();
  }
  assert.equal(clockStates.at(-1).active, false, 'teardown disposes the worker clock');
});

test('the flight veil hold stops a worker-owned clock when it arms and blocks lifecycle restarts', () => {
  const queued = [];
  let now = 0;
  const clockStates = [];
  const simulation = {
    fixedDt: LOOP_FIXED_DT,
    maxSteps: MAX_CATCHUP_STEPS,
    clockOwner: 'worker-local',
    setClockActive(active, reason) { clockStates.push({ active, reason }); },
    setLifecycleGeneration() {},
    advance() { throw new Error('rAF must not advance a worker-owned clock'); },
    prepareWithoutAdvance() { return { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 }; },
    consumeLatestCompletedTick() { return 0; },
    interpolationAlpha() { return 0; },
    close() {},
    getDiagnostics() { return { clockOwner: 'worker-local' }; },
  };
  const state = {
    accumulator: 0, timeScale: 1, tick: 0, simTime: 0,
    input: { actions: {} },
    render: { displayHz: 60 },
    settings: { video: { vsync: false, frameCap: 0 } },
  };
  const loop = createPresentationRunner(state, { renderUpdate() {}, get() { return null; } }, simulation, {
    requestFrame(callback) { queued.push(callback); return queued.length; },
    cancelFrame() { queued.length = 0; },
    nowMs: () => now,
    visibilityTarget: null,
    lifecyclePort: null,
    inputResumeTarget: null,
  });
  try {
    assert.deepEqual(clockStates.at(-1), { active: true, reason: 'startup' });
    assert.equal(typeof state.render.onFlightVeilHoldChanged, 'function', 'the runner publishes the veil hook');
    // loadingPresenter arms the hold on mode:changed('flight') — before any rAF runs.
    state.render.flightVeilHoldsSim = true;
    state.render.onFlightVeilHoldChanged(true);
    assert.deepEqual(clockStates.at(-1), { active: false, reason: 'flight-veil' },
      'the worker clock stops the moment the veil arms, not at the next frame');
    now += 1000 / 60;
    queued.shift()(now);
    assert.equal(clockStates.at(-1).active, false, 'frames under the veil keep the clock stopped');
    state.render.flightVeilHoldsSim = false;
    state.render.onFlightVeilHoldChanged(false);
    assert.deepEqual(clockStates.at(-1), { active: true, reason: 'flight-veil-lift' },
      'the lift resumes the clock the lifecycle wanted');
  } finally {
    loop.close();
  }
});
