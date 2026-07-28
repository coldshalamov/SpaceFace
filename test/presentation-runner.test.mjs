import assert from 'node:assert/strict';
import test from 'node:test';

import { LOOP_FIXED_DT, startLoop } from '../src/core/loop.js';

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
  };
  const order = [];
  const frames = [];
  const registry = {
    step(dt) {
      order.push(`step:${state.tick + 1}`);
      state.tick++;
      state.simTime += dt;
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
