import assert from 'node:assert/strict';
import test from 'node:test';

import { LOOP_FIXED_DT, startLoop } from '../src/core/loop.js';
import { createPresentationJournal } from '../src/core/presentationJournal.js';

function createRaf() {
  let nextId = 1;
  const pending = new Map();
  return {
    requestFrame(callback) {
      const id = nextId++;
      pending.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      pending.delete(id);
    },
    flushOne(now) {
      const entry = pending.entries().next().value;
      assert.ok(entry, 'expected one presentation callback');
      pending.delete(entry[0]);
      entry[1](now);
    },
    count: () => pending.size,
  };
}

test('PresentationRunner consumes completed ticks without owning simulation order', () => {
  const raf = createRaf();
  const state = {
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
  const order = [];
  const frames = [];
  const registry = {
    step(dt, tickBoundary) {
      order.push(`step:${state.tick + 1}`);
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate(alpha, frameDt, presentationFrame) {
      order.push(`render:${state.tick}`);
      frames.push({
        alpha,
        frameDt,
        completedTickCount: presentationFrame.completedTickCount,
        completedTick: presentationFrame.completedTick && { ...presentationFrame.completedTick },
      });
    },
    get() { return null; },
  };
  const controller = startLoop(state, registry, {
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget: null,
    lifecyclePort: null,
  });

  raf.flushOne(1000 + LOOP_FIXED_DT * 1000 * 3.25);
  assert.deepEqual(order, ['step:1', 'step:2', 'step:3', 'render:3']);
  assert.equal(frames[0].completedTickCount, 3);
  assert.equal(frames[0].completedTick.tick, 3);
  assert.equal(frames[0].completedTick.inputSequence, 3);
  assert.equal(controller.getDiagnostics().skippedPresentationTicks, 2);

  order.length = 0;
  raf.flushOne(1000 + LOOP_FIXED_DT * 1000 * 3.25 + 4);
  assert.deepEqual(order, ['render:3']);
  assert.equal(frames[1].completedTickCount, 0);
  assert.equal(frames[1].completedTick.tick, 3,
    'presentation retains the latest completed-tick identity across no-step callbacks');
  assert.equal(raf.count(), 1);
  controller.destroy();
});

test('PresentationRunner retains an unacknowledged journal range across render failure', () => {
  const raf = createRaf();
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    rot: 0,
    bank: 0,
    pitch: 0,
  };
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    entityList: [ship],
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
  const journal = createPresentationJournal(4);
  journal.recordSpawn(0, ship);
  const frames = [];
  let renderCalls = 0;
  const registry = {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate(alpha, frameDt, presentationFrame) {
      renderCalls++;
      frames.push({
        start: presentationFrame.journalStart,
        end: presentationFrame.journalEnd,
        records: presentationFrame.journalRecordCount,
        valid: presentationFrame.journalValid,
      });
      if (renderCalls === 1) throw new Error('intentional render failure');
    },
    get() { return null; },
  };
  const controller = startLoop(state, registry, {
    presentationJournal: journal,
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget: null,
    lifecyclePort: null,
  });

  const originalError = console.error;
  console.error = () => {};
  try {
    raf.flushOne(1000 + LOOP_FIXED_DT * 1000 * 1.1);
  } finally {
    console.error = originalError;
  }
  assert.equal(journal.getPendingCount(), 1);
  assert.deepEqual(frames[0], { start: 0, end: 1, records: 1, valid: true });

  raf.flushOne(1000 + LOOP_FIXED_DT * 1000 * 1.1 + 4);
  assert.deepEqual(frames[1], frames[0]);
  assert.equal(journal.getPendingCount(), 0);
  assert.equal(controller.getDiagnostics().journalRetainedFrameCount, 1);
  assert.equal(controller.getDiagnostics().journalAcknowledgementCount, 1);
  assert.equal(controller.getDiagnostics().journalRecordsAcknowledged, 1);
  controller.destroy();
});

test('PresentationRunner replaces invalid ranges with an explicit full rebuild boundary', () => {
  const raf = createRaf();
  const first = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 1, y: 0, z: 0 },
    rot: 0,
    bank: 0,
    pitch: 0,
  };
  const second = {
    id: 2,
    type: 'station',
    alive: true,
    pos: { x: 2, y: 0, z: 0 },
    rot: 0,
    bank: 0,
    pitch: 0,
  };
  const state = {
    accumulator: 0,
    timeScale: 0,
    tick: 0,
    simTime: 0,
    entityList: [first, second],
    input: { actions: {} },
  };
  const journal = createPresentationJournal(2);
  journal.recordSpawn(0, first);
  journal.recordSpawn(0, second);
  assert.equal(journal.recordVisual(0, first), 0);
  assert.equal(journal.needsRebuild(), true);

  let observed = null;
  const registry = {
    step() { throw new Error('paused simulation must not step'); },
    renderUpdate(alpha, frameDt, presentationFrame) {
      observed = {
        start: presentationFrame.journalStart,
        end: presentationFrame.journalEnd,
        records: presentationFrame.journalRecordCount,
        fullRebuild: presentationFrame.journalFullRebuild,
        rebuildGeneration: presentationFrame.journalRebuildGeneration,
        valid: presentationFrame.journalValid,
      };
    },
    get() { return null; },
  };
  const controller = startLoop(state, registry, {
    presentationJournal: journal,
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget: null,
    lifecyclePort: null,
  });

  raf.flushOne(1000);
  assert.deepEqual(observed, {
    start: 2,
    end: 4,
    records: 2,
    fullRebuild: true,
    rebuildGeneration: 1,
    valid: true,
  });
  assert.equal(journal.needsRebuild(), false);
  assert.equal(journal.getPendingCount(), 0);
  assert.equal(controller.getDiagnostics().journalRebuildCount, 1);
  assert.equal(controller.getDiagnostics().simulation.committedJournalSequence, 4);
  assert.equal(controller.getDiagnostics().simulation.journalCursorAlignmentCount, 1);
  controller.destroy();
});
