import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInputCommandSnapshotQueue,
  createInputCommandSnapshotRecord,
} from '../src/core/inputCommandSnapshot.js';
import { createSimulationRunner, LOOP_FIXED_DT } from '../src/core/simulationRunner.js';

function commandInput() {
  return {
    moveX: 0.75,
    moveZ: -0.25,
    turnIntent: 0.5,
    boost: true,
    brake: false,
    fire: true,
    fireGroup: 1,
    autoFire: true,
    deployCountermeasure: true,
    aimWorld: { x: 120, z: -48 },
    aimAngle: 1.25,
    mouseNdc: { x: 0.2, y: -0.4 },
    pointerScreen: { x: 640, y: 360, active: true },
    tetherMode: 'nearest',
    _activitySeq: 17,
    autoTargetVector: {
      active: true,
      screenX: 2,
      screenY: 3,
      worldX: 4,
      worldZ: 5,
      magnitude: 0.8,
    },
    autoTargetPath: {
      active: true,
      drawing: false,
      cursorX: 630,
      cursorY: 350,
      pointIndex: 1,
      points: [{ x: 10, z: 20 }, { x: 30, z: 40 }],
    },
    travelDrive: {
      state: 'engaged',
      cap: 240,
      ceiling: 420,
      rampMult: 1.2,
      spoolT: 0.75,
      cooldownT: 0,
      engagedT: 2,
      breakReason: null,
    },
    actions: {
      brake: false,
      cruise: true,
      tetherFire: true,
      tetherCut: false,
      reelDelta: -0.5,
      scanPulse: true,
      bulletTime: true,
      travelBurn: false,
      massline: {
        phase: 'line-control',
        latch: false,
        cut: false,
        lineControl: true,
        lineLength: -0.5,
        reelIn: 0.5,
        payOut: 0,
        orbitDirection: 0.25,
        pump: true,
        buffered: false,
        source: 'keyboard',
      },
    },
  };
}

test('InputCommandSnapshot is immutable, detached, exact-target, and consumed once', () => {
  const queue = createInputCommandSnapshotQueue(2);
  const input = commandInput();
  const record = createInputCommandSnapshotRecord();
  queue.reserve(1, 42, 3);
  queue.capture(1, input, 42);

  input.moveX = -1;
  input.aimWorld.x = -999;
  input.actions.scanPulse = false;
  input.actions.massline.phase = 'mutated';
  input.autoTargetPath.points[1].x = -300;

  let retainedReader = null;
  let retainedToken = 0;
  queue.consume(1, (reader, token) => {
    retainedReader = reader;
    retainedToken = token;
    reader.copyTo(token, record);
    assert.equal(record.sequence, 1);
    assert.equal(record.targetTick, 42);
    assert.equal(record.lifecycleGeneration, 3);
    assert.equal(record.axes.moveX, 0.75);
    assert.equal(record.axes.aimWorldX, 120);
    assert.equal(record.actions.scanPulse, true);
    assert.equal(record.massline.phase, 'line-control');
    assert.equal(record.travelDrive.ceiling, 420);
    assert.equal(record.route.pointCount, 2);
    assert.equal(record.route.lastX, 30);
    assert.equal(record.route.inputActivitySequence, 17);
    assert.ok(Object.isFrozen(reader));
    assert.throws(() => { reader.read = null; }, TypeError);
  });

  assert.throws(
    () => retainedReader.read(retainedToken, 'metadata', 'sequence'),
    /lease is no longer active/,
  );
  assert.throws(() => queue.consume(1), /is not pending/);
  assert.deepEqual(queue.getDiagnostics(), {
    capacity: 2,
    pending: 0,
    lastReservedSequence: 1,
    lastReservedTargetTick: 42,
    lastConsumedSequence: 1,
    reserveCount: 1,
    capturedCount: 1,
    consumedCount: 1,
    cancelledCount: 0,
    overflowCount: 0,
    orderErrorCount: 1,
    consumerErrorCount: 0,
  });
});

test('expired InputCommandSnapshot lease cannot revive when its ring slot is reused', () => {
  const queue = createInputCommandSnapshotQueue(1);
  let oldReader = null;
  let oldToken = 0;
  queue.publish(1, 1, 0, commandInput());
  queue.consume(1, (reader, token) => {
    oldReader = reader;
    oldToken = token;
  });

  queue.publish(2, 2, 0, commandInput());
  queue.consume(2, (reader, token) => {
    assert.equal(reader.read(token, 'metadata', 'sequence'), 2);
    assert.throws(
      () => oldReader.read(oldToken, 'metadata', 'sequence'),
      /lease is no longer active/,
    );
  });
});

test('recursive InputCommandSnapshot consumption is rejected without corrupting the ring', () => {
  const queue = createInputCommandSnapshotQueue(1);
  queue.publish(1, 1, 0, commandInput());
  const consumerError = queue.consume(1, () => {
    assert.throws(() => queue.consume(1), /order mismatch/);
  });

  assert.equal(consumerError, null);
  assert.equal(queue.getDiagnostics().pending, 0);
  assert.equal(queue.getDiagnostics().consumedCount, 1);
  assert.equal(queue.getDiagnostics().orderErrorCount, 1);
});

test('InputCommandSnapshot reservation rejects target mismatch and rolls back for retry', () => {
  const queue = createInputCommandSnapshotQueue(1);
  queue.reserve(1, 7, 0);
  assert.throws(() => queue.capture(1, commandInput(), 8), /target mismatch/);
  assert.equal(queue.cancel(1), true);

  queue.publish(1, 7, 0, commandInput());
  queue.consume(1);
  assert.equal(queue.getDiagnostics().lastConsumedSequence, 1);
  assert.equal(queue.getDiagnostics().cancelledCount, 1);
});

test('InputCommandSnapshot queue overflow is explicit and target ticks may rewind across restore', () => {
  const queue = createInputCommandSnapshotQueue(1);
  queue.publish(1, 100, 0, commandInput());
  assert.throws(() => queue.reserve(2, 101, 0), /queue overflow/);
  assert.equal(queue.getDiagnostics().overflowCount, 1);
  queue.consume(1);

  queue.publish(2, 4, 1, commandInput());
  queue.consume(2, (reader, token) => {
    assert.equal(reader.read(token, 'metadata', 'targetTick'), 4);
    assert.equal(reader.read(token, 'metadata', 'lifecycleGeneration'), 1);
  });
});

test('SimulationRunner publishes commands after input update and before downstream mutation', () => {
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: commandInput(),
  };
  const order = [];
  const observed = [];
  const observedRecord = createInputCommandSnapshotRecord();
  const registry = {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      order.push('input:update');
      state.input.moveX = 0.5;
      state.input.actions.scanPulse = true;
      tickBoundary.publishInputCommand(state.input, state.tick);
      order.push('input:published');
      state.input.moveX = -0.9;
      state.input.actions.scanPulse = false;
      order.push('downstream');
    },
  };
  const runner = createSimulationRunner(state, registry, {
    onInputCommandSnapshot(reader, token) {
      order.push('input:consumed');
      reader.copyTo(token, observedRecord);
      observed.push({
        sequence: observedRecord.sequence,
        targetTick: observedRecord.targetTick,
        generation: observedRecord.lifecycleGeneration,
        moveX: observedRecord.axes.moveX,
        scanPulse: observedRecord.actions.scanPulse,
      });
    },
  });
  runner.setLifecycleGeneration(5);

  runner.advance(LOOP_FIXED_DT, 1);
  assert.deepEqual(order, [
    'input:update',
    'input:published',
    'downstream',
    'input:consumed',
  ]);
  assert.deepEqual(observed, [{
    sequence: 1,
    targetTick: 1,
    generation: 5,
    moveX: 0.5,
    scanPulse: true,
  }]);

  const completed = {};
  assert.equal(runner.consumeLatestCompletedTick(completed), 1);
  assert.equal(completed.tick, 1);
  assert.equal(completed.inputSequence, 1);
  assert.equal(runner.getDiagnostics().inputBoundaryCaptureCount, 1);
  assert.equal(runner.getDiagnostics().inputCommandSnapshots.consumedCount, 1);
});

test('input snapshot observer failure cannot create a completed-tick or input-sequence gap', () => {
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: commandInput(),
  };
  let observerCalls = 0;
  const runner = createSimulationRunner(state, {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
  }, {
    onInputCommandSnapshot() {
      observerCalls++;
      if (observerCalls === 1) throw new Error('observer failed');
    },
  });

  const result = runner.advance(LOOP_FIXED_DT * 2.1, 1);
  assert.equal(result.steps, 2);
  const completed = {};
  assert.equal(runner.consumeLatestCompletedTick(completed), 2);
  assert.equal(completed.sequence, 2);
  assert.equal(completed.tick, 2);
  assert.equal(completed.inputSequence, 2);
  assert.equal(runner.getDiagnostics().inputObserverErrorCount, 1);
  assert.equal(runner.getDiagnostics().lastInputObserverError, 'observer failed');
  assert.equal(runner.getDiagnostics().inputCommandSnapshots.consumerErrorCount, 1);
});

test('SimulationRunner fails before authoritative advancement when snapshot capacity is exhausted', () => {
  const queue = createInputCommandSnapshotQueue(1);
  queue.reserve(1, 99, 0);
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: commandInput(),
  };
  let steps = 0;
  const runner = createSimulationRunner(state, {
    step() { steps++; },
  }, {
    inputCommandSnapshots: queue,
  });

  assert.throws(() => runner.advance(LOOP_FIXED_DT, 1), /queue overflow/);
  assert.equal(steps, 0);
  assert.equal(state.tick, 0);
  assert.equal(runner.getPendingCompletedTickCount(), 0);
  assert.equal(queue.getDiagnostics().overflowCount, 1);
});

test('SimulationRunner rejects duplicate boundary publication without leaking a snapshot slot', () => {
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: commandInput(),
  };
  const runner = createSimulationRunner(state, {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
  });

  assert.throws(() => runner.advance(LOOP_FIXED_DT, 1), /published more than once/);
  const diagnostics = runner.getDiagnostics();
  assert.equal(diagnostics.inputBoundaryErrorCount, 1);
  assert.equal(diagnostics.inputSnapshotCancelCount, 1);
  assert.equal(diagnostics.inputCommandSnapshots.pending, 0);
  assert.equal(runner.getPendingCompletedTickCount(), 0);
});
