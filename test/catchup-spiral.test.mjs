import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isCatchupPresentationSkip,
  shouldSkipSystemOnCatchup,
} from '../src/core/catchupPolicy.js';
import {
  createSimulationRunner,
  LOOP_FIXED_DT,
} from '../src/core/simulationRunner.js';

test('HUD and voice skip only on extra catch-up steps', () => {
  const first = { simCatchupIndex: 0 };
  const extra = { simCatchupIndex: 1 };
  assert.equal(isCatchupPresentationSkip(first), false);
  assert.equal(isCatchupPresentationSkip(extra), true);
  assert.equal(shouldSkipSystemOnCatchup('physics', extra), false);
  assert.equal(shouldSkipSystemOnCatchup('mining', extra), false);
  assert.equal(shouldSkipSystemOnCatchup('masslineHud', first), false);
  assert.equal(shouldSkipSystemOnCatchup('masslineHud', extra), true);
  assert.equal(shouldSkipSystemOnCatchup('voiceArbiter', extra), true);
  assert.equal(shouldSkipSystemOnCatchup('massSeedHud', extra), true);
});

test('SimulationRunner numbers extra catch-up steps and still advances exact ticks', () => {
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: { moveX: 0, moveZ: 0, turnIntent: 0, aimWorld: { x: 0, z: 0 }, mouseNdc: { x: 0, y: 0 }, pointerScreen: { x: 0, y: 0, active: false }, actions: {} },
  };
  const seen = [];
  const runner = createSimulationRunner(state, {
    step(dt, tickBoundary) {
      seen.push(state.simCatchupIndex | 0);
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
  });
  const result = runner.advance(LOOP_FIXED_DT * 3, 1);
  assert.equal(result.steps, 3);
  assert.equal(result.catchupPresentationSkips, 2);
  assert.deepEqual(seen, [0, 1, 2]);
  assert.equal(state.tick, 3);
});
