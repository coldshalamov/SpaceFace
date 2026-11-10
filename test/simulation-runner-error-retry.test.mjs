import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSimulationRunner,
  LOOP_FIXED_DT,
} from '../src/core/simulationRunner.js';

function createState() {
  return {
    accumulator: LOOP_FIXED_DT,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: {
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
      actions: {},
    },
  };
}

test('SimulationRunner fails closed after a partially applied step throws', () => {
  const state = createState();
  let attempts = 0;
  const failure = new Error('authoritative step failed');
  const registry = {
    step(dt, tickBoundary) {
      attempts++;
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
      throw failure;
    },
  };
  const runner = createSimulationRunner(state, registry);

  let thrown = null;
  try {
    runner.advance(0, 1);
  } catch (error) {
    thrown = error;
  }

  assert.equal(thrown, failure, 'the original authoritative error must be preserved');
  assert.equal(attempts, 1);
  assert.equal(state.tick, 1);
  assert.equal(state.simTime, LOOP_FIXED_DT);
  assert.equal(
    state.accumulator,
    LOOP_FIXED_DT,
    'a failed frame must not commit a new accumulator phase',
  );
  assert.equal(runner.isClosed(), true, 'partial authoritative work must quarantine the runner');
  assert.equal(runner.getPendingCompletedTickCount(), 0);

  const diagnostics = runner.getDiagnostics();
  assert.equal(diagnostics.closeCount, 1);
  assert.equal(diagnostics.closeComplete, true);
  assert.equal(diagnostics.inputSnapshotCancelCount, 1);
  assert.equal(diagnostics.inputCommandSnapshots.pending, 0);

  assert.throws(
    () => runner.advance(LOOP_FIXED_DT, 1),
    /SimulationRunner is closed/,
    'a caller must not retry the partially applied fixed step',
  );
  assert.equal(attempts, 1);
  assert.equal(state.tick, 1);
});
