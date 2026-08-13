import assert from 'node:assert/strict';
import test from 'node:test';

import { LOOP_FIXED_DT, startLoop } from '../src/core/loop.js';
import { createPresentationJournal } from '../src/core/presentationJournal.js';
import { createPresentationRuntimeCloser } from '../src/core/presentationRunner.js';

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

test('consecutive render throws still schedule the next 3D frame', () => {
  const raf = createRaf();
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: { actions: {} },
  };
  let renderCalls = 0;
  const registry = {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate() {
      renderCalls++;
      throw new Error('persistent draw failure');
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
  const originalError = console.error;
  console.error = () => {};
  try {
    for (let i = 0; i < 5; i++) {
      assert.equal(raf.count(), 1, `frame ${i} must still have a scheduled rAF`);
      raf.flushOne(1000 + i * 16);
    }
  } finally {
    console.error = originalError;
  }
  assert.equal(renderCalls, 5);
  assert.equal(raf.count(), 1, 'the loop must still be alive after repeated draw failures');
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

test('PresentationRunner stops external callbacks before closing its bounded simulation queue', () => {
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: { actions: {} },
  };
  let frameCallback = null;
  let requestedFrames = 0;
  let cancelCalls = 0;
  let removeCalls = 0;
  let unsubscribeCalls = 0;
  let visibilityListener = null;
  let shellListener = null;
  let audioOwnerCalls = 0;
  let steps = 0;
  const registry = {
    step(dt, tickBoundary) {
      steps++;
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate() {},
    get(name) {
      if (name !== 'audio') return null;
      return {
        suspendForLifecycle() { audioOwnerCalls++; },
        resumeFromLifecycle() { audioOwnerCalls++; },
      };
    },
  };
  const visibilityTarget = {
    visibilityState: 'visible',
    addEventListener(type, listener) {
      if (type === 'visibilitychange') visibilityListener = listener;
    },
    removeEventListener() {
      removeCalls++;
      throw new Error('remove failed');
    },
  };
  const lifecyclePort = {
    subscribe(listener) {
      shellListener = listener;
      return () => {
        unsubscribeCalls++;
        throw new Error('unsubscribe failed');
      };
    },
  };
  const controller = startLoop(state, registry, {
    requestFrame(callback) {
      requestedFrames++;
      frameCallback = callback;
      return 7;
    },
    cancelFrame() {
      cancelCalls++;
      throw new Error('cancel failed');
    },
    nowMs: () => 1000,
    visibilityTarget,
    lifecyclePort,
  });

  assert.throws(() => controller.stop(), AggregateError);
  assert.deepEqual([cancelCalls, removeCalls, unsubscribeCalls], [1, 1, 1]);
  assert.equal(controller.getDiagnostics().destroyed, true);
  assert.equal(controller.getDiagnostics().teardownErrorCount, 3);
  frameCallback(2000);
  assert.equal(steps, 0, 'a retained late rAF callback must observe the terminal stop flag');
  assert.equal(requestedFrames, 1, 'a late callback must not schedule another frame');

  assert.equal(controller.close(), true);
  const terminalDiagnostics = controller.getDiagnostics();
  visibilityTarget.visibilityState = 'hidden';
  assert.doesNotThrow(() => visibilityListener());
  visibilityTarget.visibilityState = 'visible';
  assert.doesNotThrow(() => visibilityListener());
  assert.doesNotThrow(() => shellListener({
    state: 'system-suspended',
    sequence: 1,
    reason: 'late-shell-callback',
  }));
  assert.deepEqual(controller.getDiagnostics(), terminalDiagnostics,
    'retained external callbacks cannot mutate terminal lifecycle diagnostics');
  assert.equal(audioOwnerCalls, 0, 'retained callbacks cannot reacquire destroyed audio ownership');
  assert.equal(requestedFrames, 1, 'retained callbacks cannot reschedule presentation');
  assert.equal(steps, 0, 'retained callbacks cannot advance the closed simulation');
  assert.equal(controller.close(), false);
  assert.equal(controller.getDiagnostics().transportClosed, true);
  assert.equal(controller.simulationRunner.getDiagnostics().closed, true);
});

test('PresentationRunner does not claim transport closure until SimulationRunner close succeeds', () => {
  const raf = createRaf();
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: { actions: {} },
  };
  let closeFails = true;
  let closeCalls = 0;
  const simulationRunner = {
    fixedDt: LOOP_FIXED_DT,
    advance() { throw new Error('frame must remain stopped'); },
    setLifecycleGeneration() {},
    close() {
      closeCalls++;
      if (closeFails) throw new Error('input queue retained');
      return true;
    },
    getDiagnostics: () => ({ closed: true, closeComplete: !closeFails }),
  };
  const registry = {
    step() {},
    renderUpdate() {},
    get() { return null; },
  };
  const controller = startLoop(state, registry, {
    simulationRunner,
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget: null,
    lifecyclePort: null,
  });

  assert.throws(() => controller.close(), /PresentationRunner close failed/);
  assert.equal(controller.getDiagnostics().destroyed, true);
  assert.equal(controller.getDiagnostics().transportClosed, false);
  assert.equal(closeCalls, 1);
  closeFails = false;
  assert.equal(controller.close(), true);
  assert.equal(controller.getDiagnostics().transportClosed, true);
  assert.equal(closeCalls, 2);
  assert.equal(controller.close(), false);
});

test('runtime closer preserves stop, producer-detach, simulation, journal order and is one-shot', () => {
  const order = [];
  const closeRuntime = createPresentationRuntimeCloser({
    stopPresentation() { order.push('stop'); },
    detachProducers() {
      order.push('detach');
      throw new Error('producer detach failed');
    },
    closeSimulation() { order.push('simulation'); },
    closeJournal() { order.push('journal'); },
  });

  const receipt = closeRuntime();
  assert.deepEqual(order, ['stop', 'detach', 'simulation', 'journal']);
  assert.equal(receipt.closed, true);
  assert.equal(receipt.presentationStopped, true);
  assert.equal(receipt.producersDetached, false);
  assert.equal(receipt.simulationClosed, true);
  assert.equal(receipt.journalClosed, true);
  assert.equal(receipt.errorCount, 1);
  assert.deepEqual(receipt.errors, [{
    stage: 'detachProducers',
    message: 'producer detach failed',
  }]);
  assert.equal(closeRuntime(), receipt, 'repeated close returns the stable receipt');
  assert.deepEqual(order, ['stop', 'detach', 'simulation', 'journal'], 'no phase may repeat');
});

test('runtime closer retries only failed simulation and defers journal close until it succeeds', () => {
  const order = [];
  let simulationFails = true;
  const closeRuntime = createPresentationRuntimeCloser({
    stopPresentation() { order.push('stop'); },
    detachProducers() { order.push('detach'); },
    closeSimulation() {
      order.push('simulation');
      if (simulationFails) throw new Error('queue lease still consuming');
    },
    closeJournal() { order.push('journal'); },
  });

  const first = closeRuntime();
  assert.deepEqual(order, ['stop', 'detach', 'simulation']);
  assert.equal(first.closed, false);
  assert.equal(first.presentationStopped, true);
  assert.equal(first.producersDetached, true);
  assert.equal(first.simulationClosed, false);
  assert.equal(first.journalClosed, false);
  assert.deepEqual(first.errors, [{
    stage: 'closeSimulation',
    message: 'queue lease still consuming',
  }]);

  simulationFails = false;
  const second = closeRuntime();
  assert.notEqual(second, first, 'an incomplete attempt cannot become the final cached receipt');
  assert.deepEqual(order, ['stop', 'detach', 'simulation', 'simulation', 'journal']);
  assert.equal(second.closed, true);
  assert.equal(second.presentationStopped, true);
  assert.equal(second.producersDetached, true);
  assert.equal(second.simulationClosed, true);
  assert.equal(second.journalClosed, true);
  assert.equal(second.errorCount, 0);
  assert.equal(closeRuntime(), second, 'the fully closed receipt is stable');
  assert.deepEqual(order, ['stop', 'detach', 'simulation', 'simulation', 'journal']);
});

test('runtime closer retries the real terminal transport before closing its journal', () => {
  const raf = createRaf();
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: { actions: {} },
  };
  const journal = createPresentationJournal(2);
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    rot: 0,
    bank: 0,
    pitch: 0,
  };
  journal.recordSpawn(0, ship);

  let allowCancel = false;
  let pending = 1;
  const inputCommandSnapshots = {
    capacity: 1,
    reserve() {},
    capture() {},
    consume() {},
    getPendingCount: () => pending,
    cancel(sequence) {
      if (!allowCancel || pending === 0 || sequence !== 1) return false;
      pending = 0;
      return true;
    },
    getDiagnostics: () => ({
      capacity: 1,
      pending,
      lastReservedSequence: 1,
    }),
  };
  const order = [];
  const registry = {
    step() { throw new Error('terminal close must not step'); },
    renderUpdate() {},
    get() { return null; },
    destroy() { order.push('detach'); },
  };
  const controller = startLoop(state, registry, {
    presentationJournal: journal,
    inputCommandSnapshots,
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget: null,
    lifecyclePort: null,
  });
  const closeRuntime = createPresentationRuntimeCloser({
    stopPresentation() {
      order.push('stop');
      return controller.stop();
    },
    detachProducers() { return registry.destroy(); },
    closeSimulation() {
      order.push('simulation');
      return controller.close();
    },
    closeJournal() {
      order.push('journal');
      return journal.close();
    },
  });

  const first = closeRuntime();
  assert.deepEqual(order, ['stop', 'detach', 'simulation']);
  assert.equal(first.closed, false);
  assert.equal(first.simulationClosed, false);
  assert.equal(first.journalClosed, false);
  assert.equal(controller.getDiagnostics().destroyed, true);
  assert.equal(controller.getDiagnostics().transportClosed, false);
  assert.equal(journal.isClosed(), false);
  assert.equal(journal.getPendingCount(), 1);

  allowCancel = true;
  const second = closeRuntime();
  assert.deepEqual(order, ['stop', 'detach', 'simulation', 'simulation', 'journal']);
  assert.equal(second.closed, true);
  assert.equal(second.simulationClosed, true);
  assert.equal(second.journalClosed, true);
  assert.equal(second.errorCount, 0);
  assert.equal(controller.getDiagnostics().transportClosed, true);
  assert.equal(controller.simulationRunner.getDiagnostics().closeComplete, true);
  assert.equal(journal.isClosed(), true);
  assert.equal(journal.getPendingCount(), 0);
  assert.equal(raf.count(), 0);
  assert.equal(closeRuntime(), second);
});

test('runtime closer drains real pending presentation transport after producer detachment', () => {
  const raf = createRaf();
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: { actions: {} },
  };
  const journal = createPresentationJournal(4);
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    rot: 0,
    bank: 0,
    pitch: 0,
  };
  journal.recordSpawn(0, ship);
  const order = [];
  const registry = {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate() {},
    get() { return null; },
    destroy() { order.push('detach'); },
  };
  const controller = startLoop(state, registry, {
    presentationJournal: journal,
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget: null,
    lifecyclePort: null,
  });
  controller.simulationRunner.advance(LOOP_FIXED_DT, 1);
  assert.equal(controller.simulationRunner.getPendingCompletedTickCount(), 1);

  const closeRuntime = createPresentationRuntimeCloser({
    stopPresentation() { order.push('stop'); return controller.stop(); },
    detachProducers() { return registry.destroy(); },
    closeSimulation() { order.push('simulation'); return controller.close(); },
    closeJournal() { order.push('journal'); return journal.close(); },
  });
  const receipt = closeRuntime();

  assert.deepEqual(order, ['stop', 'detach', 'simulation', 'journal']);
  assert.equal(receipt.errorCount, 0);
  assert.equal(raf.count(), 0);
  assert.equal(controller.simulationRunner.getPendingCompletedTickCount(), 0);
  assert.equal(controller.simulationRunner.getDiagnostics().closed, true);
  assert.equal(journal.getPendingCount(), 0);
  assert.equal(journal.getDiagnostics().closed, true);
  assert.throws(() => controller.simulationRunner.advance(LOOP_FIXED_DT, 1), /closed/);
  assert.throws(() => journal.recordVisual(state.tick, ship), /closed/);
});

test('PresentationRunner never acknowledges a journal closed from renderUpdate', () => {
  const raf = createRaf();
  const state = {
    accumulator: 0,
    timeScale: 0,
    tick: 0,
    simTime: 0,
    entityList: [],
    input: { actions: {} },
  };
  const journal = createPresentationJournal(2);
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    rot: 0,
    bank: 0,
    pitch: 0,
  };
  state.entityList.push(ship);
  journal.recordSpawn(0, ship);
  const registry = {
    step() { throw new Error('paused simulation must not step'); },
    renderUpdate() {
      journal.close();
      return true;
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
  assert.equal(journal.getDiagnostics().closed, true);
  assert.equal(journal.getDiagnostics().discardedOnClose, 1);
  assert.equal(controller.getDiagnostics().journalAcknowledgementCount, 0);
  assert.equal(controller.getDiagnostics().journalRecordsAcknowledged, 0);
  controller.destroy();
});

test('terminal close inside a restoring render cannot resume destroyed audio ownership', () => {
  const raf = createRaf();
  let visibilityState = 'visible';
  let visibilityListener = null;
  const visibilityTarget = {
    get visibilityState() { return visibilityState; },
    addEventListener(type, listener) {
      if (type === 'visibilitychange') visibilityListener = listener;
    },
    removeEventListener(type, listener) {
      if (type === 'visibilitychange' && visibilityListener === listener) {
        visibilityListener = null;
      }
    },
    set(next) {
      visibilityState = next;
      visibilityListener?.();
    },
  };
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    entityList: [],
    input: { actions: {} },
  };
  const journal = createPresentationJournal(2);
  const audioTransitions = [];
  let closeRuntime = null;
  const registry = {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate() {
      closeRuntime();
      return true;
    },
    get(name) {
      if (name !== 'audio') return null;
      return {
        suspendForLifecycle: (reason) => audioTransitions.push(['suspend', reason]),
        resumeFromLifecycle: (reason) => audioTransitions.push(['resume', reason]),
      };
    },
    destroy() {},
  };
  const controller = startLoop(state, registry, {
    presentationJournal: journal,
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget,
    lifecyclePort: null,
  });
  closeRuntime = createPresentationRuntimeCloser({
    stopPresentation: () => controller.stop(),
    detachProducers: () => registry.destroy(),
    closeSimulation: () => controller.close(),
    closeJournal: () => journal.close(),
  });

  visibilityTarget.set('hidden');
  visibilityTarget.set('visible');
  assert.equal(controller.getLifecycleState(), 'restoring');
  raf.flushOne(1016.667);

  assert.deepEqual(audioTransitions, [['suspend', 'document-visibility']]);
  assert.equal(controller.getDiagnostics().destroyed, true);
  assert.equal(controller.getDiagnostics().transportClosed, true);
  assert.equal(controller.getDiagnostics().restoreFrameCount, 0);
  assert.equal(controller.getDiagnostics().postRestoreFrameCount, 0);
  assert.equal(controller.getLifecycleState(), 'restoring');
  assert.equal(raf.count(), 0);
});
