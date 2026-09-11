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

function startCappedLoop({ frameCap = 30, vsync = true } = {}) {
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
    render: { displayHz: 60 },
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
      visibilityTarget: null,
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
