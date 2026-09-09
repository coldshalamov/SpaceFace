import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceFixedTimestep,
  createSimulationRunner,
  LOOP_FIXED_DT,
} from '../src/core/simulationRunner.js';
import { createPresentationJournal } from '../src/core/presentationJournal.js';

function createState() {
  return {
    accumulator: 0,
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

function createRegistry(state, observed = []) {
  return {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
      observed.push(state.tick);
    },
  };
}

const parityCases = [
  { accumulator: 0, frameDt: 0, timeScale: 1 },
  { accumulator: LOOP_FIXED_DT * 0.5, frameDt: -1, timeScale: 1 },
  { accumulator: Number.NaN, frameDt: Number.POSITIVE_INFINITY, timeScale: 1 },
  { accumulator: LOOP_FIXED_DT * 0.75, frameDt: 0.2, timeScale: 0 },
  { accumulator: 0, frameDt: LOOP_FIXED_DT, timeScale: 1 },
  { accumulator: LOOP_FIXED_DT * 0.25, frameDt: LOOP_FIXED_DT * 3, timeScale: 1 },
  { accumulator: 0, frameDt: LOOP_FIXED_DT * 10.25, timeScale: 1 },
];

test('SimulationRunner preserves the fixed-step result for characterized callback inputs', () => {
  for (const sample of parityCases) {
    const expectedTicks = [];
    const expected = advanceFixedTimestep(
      sample.accumulator,
      sample.frameDt,
      sample.timeScale,
      (dt) => expectedTicks.push(dt),
    );

    const state = createState();
    state.accumulator = sample.accumulator;
    state.timeScale = sample.timeScale;
    const observedTicks = [];
    const runner = createSimulationRunner(state, createRegistry(state, observedTicks));
    const actual = runner.advance(sample.frameDt, sample.timeScale);

    assert.equal(actual.steps, expected.steps, JSON.stringify(sample));
    assert.equal(actual.shedBacklog, expected.shedBacklog, JSON.stringify(sample));
    assert.equal(actual.shedSteps, expected.shedSteps, JSON.stringify(sample));
    assert.ok(Math.abs(actual.accumulator - expected.accumulator) < 1e-12, JSON.stringify(sample));
    assert.equal(observedTicks.length, expectedTicks.length, JSON.stringify(sample));
    assert.equal(state.tick, expectedTicks.length, JSON.stringify(sample));
  }
});

test('SimulationRunner publishes ordered completed ticks and presentation may consume only the latest', () => {
  const state = createState();
  const observed = [];
  const runner = createSimulationRunner(state, createRegistry(state, observed));
  runner.setLifecycleGeneration(3);

  const result = runner.advance(LOOP_FIXED_DT * 3.25, 1);
  assert.equal(result.steps, 3);
  assert.deepEqual(observed, [1, 2, 3]);
  assert.equal(runner.getPendingCompletedTickCount(), 3);

  const latest = {};
  const consumed = runner.consumeLatestCompletedTick(latest);
  assert.equal(consumed, 3);
  assert.deepEqual(latest, {
    sequence: 3,
    tick: 3,
    simTime: LOOP_FIXED_DT * 3,
    stateDigestMarker: 3,
    inputSequence: 3,
    lifecycleGeneration: 3,
    journalStart: 0,
    journalEnd: 0,
  });
  assert.equal(runner.getPendingCompletedTickCount(), 0);
  assert.equal(runner.getDiagnostics().skippedPresentationTicks, 2);
});

test('SimulationRunner carries between-tick journal writes and aggregates the earliest consumed range', () => {
  const state = createState();
  const journal = createPresentationJournal(8);
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    rot: 0,
    bank: 0,
    pitch: 0,
    presentationVisualRevision: 0,
  };
  journal.recordSpawn(0, ship);
  const runner = createSimulationRunner(state, {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
      ship.pos.x = state.tick;
      journal.recordTransform(state.tick, ship);
    },
  }, { presentationJournal: journal });

  runner.advance(LOOP_FIXED_DT, 1);
  const first = {};
  assert.equal(runner.consumeLatestCompletedTick(first), 1);
  assert.equal(first.journalStart, 0);
  assert.equal(first.journalEnd, 2);

  ship.presentationVisualRevision = 1;
  journal.recordVisual(state.tick, ship);
  runner.advance(LOOP_FIXED_DT * 2.1, 1);

  const latest = {};
  assert.equal(runner.consumeLatestCompletedTick(latest), 2);
  assert.equal(latest.tick, 3);
  assert.equal(latest.journalStart, 2,
    'the next completion must include records published after the prior fixed tick');
  assert.equal(latest.journalEnd, 5);
  assert.equal(runner.getDiagnostics().committedJournalSequence, 5);
});

test('completed-tick queue exhaustion fails before advancing authoritative state', () => {
  const state = createState();
  const runner = createSimulationRunner(state, createRegistry(state), {
    maxSteps: 1,
    completedTickCapacity: 1,
  });

  runner.advance(LOOP_FIXED_DT, 1);
  assert.equal(state.tick, 1);
  assert.equal(runner.getPendingCompletedTickCount(), 1);

  assert.throws(
    () => runner.advance(LOOP_FIXED_DT, 1),
    /completed-tick queue overflow/,
  );
  assert.equal(state.tick, 1, 'overflow must fail before registry.step mutates simulation state');
  assert.equal(runner.getDiagnostics().overflowCount, 1);
});

test('prepareWithoutAdvance and interpolationAlpha retain the existing accumulator phase', () => {
  const state = createState();
  state.accumulator = LOOP_FIXED_DT * 0.375;
  const runner = createSimulationRunner(state, createRegistry(state));

  const result = runner.prepareWithoutAdvance();
  assert.equal(result.steps, 0);
  assert.equal(result.shedBacklog, false);
  assert.equal(result.shedSteps, 0);
  assert.ok(Math.abs(result.accumulator - state.accumulator) < 1e-12);
  assert.ok(Math.abs(runner.interpolationAlpha() - 0.375) < 1e-12);
  assert.equal(state.tick, 0);
});

test('per-call recovery cap executes one step, sheds whole debt, and preserves phase', () => {
  const state = createState();
  state.accumulator = LOOP_FIXED_DT * 0.25;
  const runner = createSimulationRunner(state, createRegistry(state));

  const recovered = runner.advance(LOOP_FIXED_DT * 10.25, 1, 1);
  assert.equal(recovered.stepCap, 1);
  assert.equal(recovered.steps, 1);
  assert.equal(recovered.shedBacklog, true);
  assert.equal(recovered.shedSteps, 9);
  assert.ok(Math.abs(recovered.accumulator - LOOP_FIXED_DT * 0.5) < 1e-12);

  state.accumulator = 0;
  const clamped = runner.advance(LOOP_FIXED_DT * 4.5, 1, 99);
  assert.equal(clamped.stepCap, 4, 'a per-call override cannot raise the configured cap');
  assert.equal(clamped.steps, 4);
  assert.equal(clamped.shedBacklog, false);
  assert.ok(Math.abs(clamped.accumulator - LOOP_FIXED_DT * 0.5) < 1e-12);
  const diagnostics = runner.getDiagnostics();
  assert.equal(diagnostics.recoveryCappedAdvanceCount, 1);
  assert.equal(diagnostics.lastAdvanceStepCap, 4);
});

test('SimulationRunner terminal close drains bounded work and rejects every late operation', () => {
  const state = createState();
  const runner = createSimulationRunner(state, createRegistry(state));
  runner.advance(LOOP_FIXED_DT * 2.1, 1);
  assert.equal(runner.getPendingCompletedTickCount(), 2);
  const tickAtClose = state.tick;

  assert.equal(runner.close(), true);
  assert.equal(runner.close(), false, 'terminal close must be idempotent');
  assert.equal(runner.isClosed(), true);
  assert.equal(runner.getPendingCompletedTickCount(), 0);
  assert.equal(state.tick, tickAtClose);

  const diagnostics = runner.getDiagnostics();
  assert.equal(diagnostics.closed, true);
  assert.equal(diagnostics.closeCount, 1);
  assert.equal(diagnostics.pendingCompletedTicks, 0);
  assert.equal(diagnostics.completedTicksPendingAtClose, 2);
  assert.equal(diagnostics.completedTicksDiscardedOnClose, 2);
  assert.equal(diagnostics.inputPendingAtClose, 0);
  assert.equal(diagnostics.retainedCompletedTickCapacity, 0);
  assert.equal(diagnostics.inputCommandSnapshots.pending, 0);

  const lateOperations = [
    () => runner.advance(LOOP_FIXED_DT, 1),
    () => runner.prepareWithoutAdvance(),
    () => runner.interpolationAlpha(),
    () => runner.consumeLatestCompletedTick({}),
    () => runner.alignJournalCursor(0),
    () => runner.setLifecycleGeneration(2),
  ];
  for (const operation of lateOperations) {
    assert.throws(operation, /SimulationRunner is closed/);
  }
  assert.equal(state.tick, tickAtClose, 'late operations cannot advance authoritative state');
});

test('SimulationRunner reports residual input truth and retries close after cancellation becomes legal', () => {
  const state = createState();
  let pending = 1;
  let allowCancel = false;
  const fakeInputQueue = {
    capacity: 1,
    reserve() {},
    capture() {},
    consume() {},
    cancel(sequence) {
      if (!allowCancel || sequence !== 1 || pending === 0) return false;
      pending = 0;
      return true;
    },
    getPendingCount: () => pending,
    getDiagnostics: () => ({
      capacity: 1,
      pending,
      lastReservedSequence: 1,
      sentinel: 'owned-input',
    }),
  };
  const runner = createSimulationRunner(state, createRegistry(state), {
    inputCommandSnapshots: fakeInputQueue,
  });

  assert.throws(() => runner.close(), /left 1 input snapshot pending/);
  let diagnostics = runner.getDiagnostics();
  assert.equal(diagnostics.closed, true, 'failed close still makes authoritative advance terminal');
  assert.equal(diagnostics.closeComplete, false);
  assert.equal(diagnostics.closeAttemptCount, 1);
  assert.equal(diagnostics.closeFailureCount, 1);
  assert.equal(diagnostics.inputPendingAtClose, 1);
  assert.equal(diagnostics.inputResidualPending, 1);
  assert.equal(diagnostics.inputCommandSnapshots.pending, 1);
  assert.equal(diagnostics.inputCommandSnapshots.sentinel, 'owned-input');
  assert.throws(() => runner.advance(LOOP_FIXED_DT, 1), /SimulationRunner is closed/);

  allowCancel = true;
  assert.equal(runner.close(), true, 'a later close may finish the quarantined terminal queue');
  assert.equal(runner.close(), false);
  diagnostics = runner.getDiagnostics();
  assert.equal(diagnostics.closeComplete, true);
  assert.equal(diagnostics.closeAttemptCount, 2);
  assert.equal(diagnostics.inputResidualPending, 0);
  assert.equal(diagnostics.inputCommandSnapshots.pending, 0);
  assert.equal(diagnostics.inputCommandSnapshots.pendingAtClose, 1);
});

test('SimulationRunner fails the in-flight completion when registry work closes it reentrantly', () => {
  const state = createState();
  let runner = null;
  const registry = {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
      runner.close();
    },
  };
  runner = createSimulationRunner(state, registry);

  assert.throws(() => runner.advance(LOOP_FIXED_DT, 1), /SimulationRunner is closed/);
  assert.equal(state.tick, 1, 'already-executed authoritative work is not replayed or hidden');
  assert.equal(state.accumulator, 0, 'the failed frame cannot commit a new accumulator phase');
  assert.equal(runner.getPendingCompletedTickCount(), 0);
  const diagnostics = runner.getDiagnostics();
  assert.equal(diagnostics.completedSequence, 0);
  assert.equal(diagnostics.inputPendingAtClose, 1);
  assert.equal(diagnostics.inputSnapshotsCancelledOnClose, 1);
  assert.equal(diagnostics.inputCommandSnapshots.pending, 0);
});

test('SimulationRunner rechecks terminal state after input observation', () => {
  const state = createState();
  let runner = null;
  let observerCalls = 0;
  runner = createSimulationRunner(state, createRegistry(state), {
    onInputCommandSnapshot() {
      observerCalls++;
      runner.close();
    },
  });

  assert.throws(() => runner.advance(LOOP_FIXED_DT, 1), /SimulationRunner is closed/);
  assert.equal(observerCalls, 1);
  assert.equal(runner.getPendingCompletedTickCount(), 0);
  assert.equal(runner.getDiagnostics().completedSequence, 0);
  assert.equal(runner.getDiagnostics().inputPendingAtClose, 1);
  assert.equal(runner.getDiagnostics().inputCommandSnapshots.pending, 0);
  assert.equal(runner.getDiagnostics().closeComplete, false);
  assert.equal(runner.close(), true, 'the consuming lease settles before terminal retry');
  assert.equal(runner.getDiagnostics().closeComplete, true);
});
