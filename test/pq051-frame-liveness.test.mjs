// PQ-051 / PERF-11-FRAME-LIVENESS.
//
// The failure this pins: a renderUpdate that throws every frame leaves the 3D canvas frozen on its
// last picture while the loop keeps running, the simulation keeps advancing and the HTML HUD keeps
// accepting input. The player sees a live interface in front of a dead world.
//
// Before this, the loop logged the first twenty errors, printed "further frame errors suppressed",
// and then reschedulued in silence forever. Nothing distinguished "one bad frame, recovered" from
// "the renderer has been dead for a thousand frames" — which are the same counter and completely
// different bugs.
//
// Catching is still correct: one bad frame must not kill the loop. What was missing is the
// classifier. These tests assert the runner can tell the two apart.

import assert from 'node:assert/strict';
import test from 'node:test';

import { LOOP_FIXED_DT, startLoop } from '../src/core/loop.js';

function createClock(start = 1000) {
  let now = start;
  return { nowMs: () => now, advance(ms) { now += ms; return now; } };
}

function createRaf() {
  let nextId = 1;
  const pending = new Map();
  return {
    requestFrame(callback) { const id = nextId++; pending.set(id, callback); return id; },
    cancelFrame(id) { pending.delete(id); },
    count: () => pending.size,
    flushOne(now) {
      const entry = pending.entries().next().value;
      assert.ok(entry, 'expected one scheduled frame');
      pending.delete(entry[0]);
      entry[1](now);
    },
  };
}

function createHarness({ renderUpdate } = {}) {
  const clock = createClock();
  const raf = createRaf();
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: {
      moveX: 0, moveZ: 0, turnIntent: 0,
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
      actions: {},
    },
  };
  const registry = {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate: renderUpdate || (() => {}),
    get() { return null; },
  };
  const controller = startLoop(state, registry, {
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: clock.nowMs,
  });
  return { clock, raf, state, registry, controller };
}

function flushFrames(h, count) {
  for (let i = 0; i < count; i++) {
    h.clock.advance(LOOP_FIXED_DT * 1000);
    if (h.raf.count() === 0) break;
    h.raf.flushOne(h.clock.nowMs());
  }
}

test('a renderer that throws every frame is classified as a presentation stall', () => {
  const h = createHarness({
    renderUpdate() { throw new Error('draw call exploded'); },
  });

  flushFrames(h, 40);
  const diag = h.controller.getDiagnostics();

  // The loop must still be alive — killing it is not the fix.
  assert.ok(h.raf.count() > 0, 'the loop must keep rescheduling after a frame error');
  assert.ok(diag.frameErrorCount >= 30, `expected repeated frame errors, saw ${diag.frameErrorCount}`);

  // ...but it must know the difference between a blip and a dead renderer.
  assert.equal(diag.presentationStalled, true,
    'a renderer throwing every frame must be reported as stalled, not silently retried');
  assert.ok(diag.consecutiveFrameErrors >= 30,
    `expected a consecutive-error run, saw ${diag.consecutiveFrameErrors}`);
  assert.ok(typeof diag.lastFrameError === 'string' && diag.lastFrameError.includes('exploded'),
    'the classifier must carry the failing message');

  h.controller.stop();
});

test('one bad frame is not a stall, and recovery clears the run', () => {
  let failNext = true;
  const h = createHarness({
    renderUpdate() {
      if (failNext) { failNext = false; throw new Error('one transient fault'); }
    },
  });

  flushFrames(h, 12);
  const diag = h.controller.getDiagnostics();

  assert.equal(diag.frameErrorCount, 1, 'exactly one frame should have failed');
  assert.equal(diag.consecutiveFrameErrors, 0,
    'a successful frame must reset the consecutive run');
  assert.equal(diag.presentationStalled, false,
    'a single recovered frame is not a stall — this is the false positive that would make the signal useless');

  h.controller.stop();
});

test('a stall clears when the renderer recovers', () => {
  let broken = true;
  const h = createHarness({
    renderUpdate() { if (broken) throw new Error('still broken'); },
  });

  flushFrames(h, 40);
  assert.equal(h.controller.getDiagnostics().presentationStalled, true, 'precondition: stalled');

  broken = false;
  flushFrames(h, 3);

  const diag = h.controller.getDiagnostics();
  assert.equal(diag.presentationStalled, false, 'a recovered renderer must clear the stall');
  assert.equal(diag.consecutiveFrameErrors, 0, 'and reset the run');
  // The cumulative count is history and must NOT be reset — it is how a session reports that this
  // happened at all.
  assert.ok(diag.frameErrorCount >= 30, 'cumulative frame errors are history, not state');

  h.controller.stop();
});
