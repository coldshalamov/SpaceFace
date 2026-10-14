// Frame cap is a present gate, not a sim gate. rAF still runs leftover simulation at 60 Hz;
// only registry.renderUpdate is skipped when the player asked for 30 fps.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPresentationRunner } from '../src/core/presentationRunner.js';

function stubSimulationRunner() {
  let advances = 0;
  return {
    advances: () => advances,
    advance() {
      advances += 1;
      return { steps: 1, shedBacklog: false, shedSteps: 0, accumulator: 0 };
    },
    prepareWithoutAdvance() { return { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 }; },
    consumeLatestCompletedTick() { return 1; },
    interpolationAlpha() { return 0; },
    setLifecycleGeneration() {},
    close() { return true; },
    getDiagnostics() { return {}; },
    fixedDt: 1 / 60,
  };
}

function startCappedLoop({ frameCap = 30, vsync = true, displayHz = 60, visibilityTarget = null } = {}) {
  const queued = [];
  let now = 0;
  let presents = 0;
  const simulation = stubSimulationRunner();
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: { actions: {} },
    render: { displayHz },
    settings: { video: { vsync, frameCap } },
  };
  const runner = createPresentationRunner(
    state,
    {
      renderUpdate() { presents += 1; },
      get() { return null; },
    },
    simulation,
    {
      requestFrame(callback) {
        queued.push(callback);
        return queued.length;
      },
      cancelFrame() { queued.length = 0; },
      nowMs: () => now,
      visibilityTarget,
      lifecyclePort: null,
      inputResumeTarget: null,
    },
  );
  function pump(dtMs) {
    now += dtMs;
    const callback = queued.shift();
    if (callback) callback(now);
  }
  return {
    pump,
    presents: () => presents,
    advances: () => simulation.advances(),
    close: () => runner.close(),
    diagnostics: () => runner.getDiagnostics(),
  };
}

test('30 fps cap skips GPU presents and still advances leftover sim', () => {
  const loop = startCappedLoop({ frameCap: 30, vsync: true });
  try {
    for (let i = 0; i < 12; i++) loop.pump(1000 / 60);
    // First rAF is forced on so the opening picture is not a black frame; after that the
    // 30/60 debt presents every other callback → 1 + 6 = 7 of 12, or 1 + 5 = 6 depending
    // on the first-frame debt reset. Bound it: fewer presents than rAFs, sim on every rAF.
    assert.ok(loop.presents() >= 6 && loop.presents() <= 7, `presents=${loop.presents()}`);
    assert.ok(loop.presents() < 12, 'cap must skip some presents');
    assert.equal(loop.advances(), 12, 'leftover sim still runs every rAF');
    assert.ok(loop.diagnostics().frameCapSkips >= 5, 'skips are counted');
  } finally {
    loop.close();
  }
});

test('uncapped vsync-off presents every rAF', () => {
  const loop = startCappedLoop({ frameCap: 0, vsync: false });
  try {
    for (let i = 0; i < 8; i++) loop.pump(1000 / 60);
    assert.equal(loop.presents(), 8);
    assert.equal(loop.advances(), 8);
    assert.equal(loop.diagnostics().frameCapSkips, 0);
  } finally {
    loop.close();
  }
});

test('a 30 fps cap preserves callbacks already arriving at 30 fps', () => {
  const loop = startCappedLoop({ frameCap: 30 });
  try {
    for (let i = 0; i < 12; i++) loop.pump(1000 / 30);
    assert.equal(loop.presents(), 12, 'a slow renderer must not halve the requested cap again');
    assert.equal(loop.advances(), 12);
    assert.equal(loop.diagnostics().frameCapSkips, 0);
  } finally { loop.close(); }
});

test('callbacks below the requested cap all present while faster displays remain capped', () => {
  const slow = startCappedLoop({ frameCap: 45, displayHz: 60 });
  const fast = startCappedLoop({ frameCap: 30, displayHz: 144 });
  try {
    for (let i = 0; i < 12; i++) slow.pump(1000 / 40);
    assert.equal(slow.presents(), 12, '40 Hz throughput is already below a 45 fps cap');
    for (let i = 0; i < 144; i++) fast.pump(1000 / 144);
    assert.ok(fast.presents() >= 30 && fast.presents() <= 31, `144 Hz presents=${fast.presents()}`);
    assert.equal(fast.advances(), 144, 'the cap still gates presentation alone');
  } finally { slow.close(); fast.close(); }
});

test('uncapped vsync presents every overloaded callback', () => {
  const loop = startCappedLoop({ frameCap: 0, vsync: true });
  try {
    for (let i = 0; i < 12; i++) loop.pump(i % 2 ? 45 : 20);
    assert.equal(loop.presents(), 12);
    assert.equal(loop.diagnostics().frameCapSkips, 0);
  } finally { loop.close(); }
});

test('a long callback interval does not create a burst of overdue capped presents', () => {
  const loop = startCappedLoop({ frameCap: 30 });
  try {
    loop.pump(1000 / 60);
    loop.pump(250);
    assert.equal(loop.presents(), 2, 'the late callback presents once');
    const before = loop.presents();
    for (let i = 0; i < 12; i++) loop.pump(1000 / 60);
    assert.equal(loop.presents() - before, 6, 'only fractional cap phase carries past a hitch');
  } finally { loop.close(); }
});

test('suspend time is discarded and restore presents immediately before the cap resumes', () => {
  let visibilityChanged = null;
  const visibilityTarget = {
    visibilityState: 'visible',
    addEventListener(type, fn) { if (type === 'visibilitychange') visibilityChanged = fn; },
    removeEventListener() { visibilityChanged = null; },
  };
  const loop = startCappedLoop({ frameCap: 30, visibilityTarget });
  try {
    loop.pump(1000 / 60);
    loop.pump(1000 / 60);
    visibilityTarget.visibilityState = 'hidden';
    visibilityChanged();
    const before = loop.presents();
    loop.pump(2000);
    assert.equal(loop.presents(), before, 'hidden time produces no presentations');
    visibilityTarget.visibilityState = 'visible';
    visibilityChanged();
    loop.pump(1000 / 60);
    assert.equal(loop.presents(), before + 1, 'the restore picture is immediate');
    const restored = loop.presents();
    for (let i = 0; i < 12; i++) loop.pump(1000 / 60);
    assert.equal(loop.presents() - restored, 6, 'hidden time never becomes cap debt');
  } finally { loop.close(); }
});

function startCapableLoop(state) {
  const queued = [];
  let now = 0;
  const simulation = stubSimulationRunner();
  const runner = createPresentationRunner(
    state,
    { renderUpdate() {}, get() { return null; } },
    simulation,
    {
      requestFrame(callback) { queued.push(callback); return queued.length; },
      cancelFrame() { queued.length = 0; },
      nowMs: () => now,
      visibilityTarget: null,
      lifecyclePort: null,
      inputResumeTarget: null,
    },
  );
  return {
    pump(dtMs) { now += dtMs; const cb = queued.shift(); if (cb) cb(now); },
    close: () => runner.close(),
  };
}

test('a jittery callback interval is not learned as the display rate', () => {
  const state = {
    accumulator: 0, timeScale: 1, tick: 0, simTime: 0,
    input: { actions: {} },
    render: { displayHz: 60 },
    settings: { video: { vsync: true, frameCap: 0 } },
  };
  const loop = startCapableLoop(state);
  try {
    // Saturated machine: intervals swing 24–70 ms with a ~33 ms mean — the loop's own
    // throughput, not a vsync beat. The lock counter must never reach a learned write.
    for (let i = 0; i < 120; i += 1) loop.pump(i % 3 === 0 ? 70 : 24);
    assert.equal(state.render.displayHz, 60, 'starved-loop intervals must not rewrite displayHz');
  } finally {
    loop.close();
  }
});

test('a steady vsync cadence still learns the display rate', () => {
  const state = {
    accumulator: 0, timeScale: 1, tick: 0, simTime: 0,
    input: { actions: {} },
    render: { displayHz: 60 },
    settings: { video: { vsync: true, frameCap: 0 } },
  };
  const loop = startCapableLoop(state);
  try {
    for (let i = 0; i < 120; i += 1) loop.pump(1000 / 75);
    assert.equal(state.render.displayHz, 75, 'a stable 75 Hz cadence is learned');
  } finally {
    loop.close();
  }
});
