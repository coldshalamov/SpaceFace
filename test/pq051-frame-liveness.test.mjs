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
import { syncFocusLossHold } from '../src/core/focusLossHold.js';

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

// D111: an owner freeze report (the Nav Beacon screenshot) reads identical to an intentional
// focus-loss pause — the stall dump must retain the evidence that tells them apart: the loop
// diagnostics, the simulation closeCauseSite, the time-effects request ledger and the
// graphics-context state at the frozen moment.
test('a presentation stall retains loop, sim, time-effects and graphics-context evidence', () => {
  const h = createHarness({
    renderUpdate() { throw new Error('draw call exploded'); },
  });
  // Arm the focus-loss hold first: a scale-0 'window-focus-loss' request must be listed in the
  // dump or a paused clock gets misread as a dead one.
  syncFocusLossHold(h.state, true);

  flushFrames(h, 40);
  const diag = h.controller.getDiagnostics();
  assert.equal(diag.presentationStalled, true, 'precondition: stalled');

  const evidence = diag.presentationStallEvidence;
  assert.ok(evidence && typeof evidence === 'object', 'the stall retains an evidence block');
  assert.equal(evidence.loop && evidence.loop.presentationStalled, true,
    'the evidence carries the loop diagnostics snapshot from the frozen moment');
  assert.ok('closeCauseSite' in evidence,
    'the simulation closeCauseSite is retained even while null (sim alive, picture dead)');
  assert.equal(evidence.closeCauseSite, null,
    'a throwing renderer is not a simulation close — the field discriminates the two');
  assert.deepEqual(evidence.timeEffectRequests, { 'window-focus-loss': { scale: 0 } },
    'the time-effects ledger names the focus-loss hold behind a frozen-looking screenshot');
  assert.ok(evidence.graphicsContext && typeof evidence.graphicsContext === 'object',
    'graphics-context state is attached');
  assert.equal(evidence.graphicsContext.renderContextLost, false,
    'a live render block reports not-lost rather than omitting the field');
  assert.equal(evidence.graphicsContext.glContextLost, null,
    'no native renderer on this harness reads as unknown, never fabricated');

  h.controller.stop();
});

// The field must be a live read of the published renderer flag: the same harness stalling again
// while state.render.contextLost is set stamps true, never a hardcoded false.
test('a stall while the published context-lost flag is set reports renderContextLost: true', () => {
  let broken = true;
  const h = createHarness({
    renderUpdate() { if (broken) throw new Error('draw call exploded'); },
  });

  flushFrames(h, 40);
  let evidence = h.controller.getDiagnostics().presentationStallEvidence;
  assert.equal(evidence.graphicsContext.renderContextLost, false, 'precondition: healthy stamp');

  // Clear the stall, set the published flag, and stall again — the re-stamp reads the live flag.
  broken = false;
  flushFrames(h, 3);
  assert.equal(h.controller.getDiagnostics().presentationStalled, false,
    'a recovered renderer clears the first stall before the second one');
  h.state.render.contextLost = true;
  broken = true;
  flushFrames(h, 40);

  evidence = h.controller.getDiagnostics().presentationStallEvidence;
  assert.equal(evidence.graphicsContext.renderContextLost, true,
    'the re-stamp reports the published flag — the field is a live read, not a constant');

  h.controller.stop();
});
