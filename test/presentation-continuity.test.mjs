// Presented-motion continuity: the instrument for "the ship keeps jigging back and forth".
//
// OWNER, 2026-09-20: "the main ship I fly keeps jigging back and forth like it doesn't know its own
// location, so it kind of ruins the experience ... the ship must fly smooth and the player have
// complete control over what's happening."
//
// The pilot lives in the frame, not in the sim. This drives the REAL loop (startLoop + the real
// SimulationRunner) with the frame timings a 60 Hz display actually produces below 60 fps, and
// reproduces the renderer's pose rule exactly: pack on a new completed tick, blend previous→latest
// with poseSpanAlpha. A correct loop draws the world at a moment that advances by exactly the time
// that passed, every present. The loop this replaced scored 14 % frozen presents at 45 fps, 26 % at
// 30 fps (each followed by a ~5 WU snap at fighting speed), and ran the game at 63–83 % speed on a
// slow GPU. Bars are in player units: frozen presents, snap size in milliseconds of travel, and
// game speed against the wall clock.
import assert from 'node:assert/strict';
import test from 'node:test';

import { LOOP_FIXED_DT, startLoop } from '../src/core/loop.js';
import { poseSpanAlpha } from '../src/render/snapshotFence.js';

function seededJitter(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function flyPattern(intervalsMs, { presentCostMs = () => 4, frames = 600 } = {}) {
  const jitter = seededJitter(4242);
  let pending = null;
  let perfClock = 0;
  let frameDtMs = 0;
  const state = { accumulator: 0, timeScale: 1, tick: 0, simTime: 0, input: { actions: {} }, render: {} };
  let latest = null;
  let previous = null;
  let packedSequence = -1;
  const presents = [];
  const registry = {
    step(dt, boundary) {
      state.tick++;
      state.simTime += dt;
      perfClock += 1.5;
      boundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate(alpha, frameDt, presentationFrame) {
      const sequence = presentationFrame.completedTick ? presentationFrame.completedTick.sequence : 0;
      if (sequence !== packedSequence) {
        previous = latest;
        latest = { simTime: state.simTime };
        packedSequence = sequence;
      }
      let moment = latest.simTime;
      if (previous) {
        const t = poseSpanAlpha(latest, previous, state.accumulator, LOOP_FIXED_DT, alpha);
        moment = previous.simTime + (latest.simTime - previous.simTime) * t;
      }
      presents.push({ frameDtMs, moment });
      perfClock += presentCostMs(presents.length);
    },
    get() { return null; },
  };
  const controller = startLoop(state, registry, {
    requestFrame: (callback) => { pending = callback; return 1; },
    cancelFrame: () => { pending = null; },
    nowMs: () => 0,
    perfNow: () => perfClock,
    visibilityTarget: null,
    lifecyclePort: null,
  });
  let now = 0;
  for (let i = 0; i < frames; i++) {
    // rAF timestamps on a vsynced display land on the beat give or take a fraction of a millisecond.
    frameDtMs = intervalsMs[i % intervalsMs.length] + (jitter() - 0.5) * 0.24;
    now += frameDtMs;
    const callback = pending;
    pending = null;
    callback(now);
  }
  const diagnostics = controller.getDiagnostics();
  controller.destroy();

  const settled = presents.slice(20);
  let frozen = 0;
  let worstSnapMs = 0;
  let wallMs = 0;
  let worldMs = 0;
  for (let i = 1; i < settled.length; i++) {
    const advancedMs = (settled[i].moment - settled[i - 1].moment) * 1000;
    if (Math.abs(advancedMs) < 0.01) frozen++;
    worstSnapMs = Math.max(worstSnapMs, Math.abs(advancedMs - settled[i].frameDtMs));
    wallMs += settled[i].frameDtMs;
    worldMs += advancedMs;
  }
  return {
    frozenPresents: frozen,
    worstSnapMs,
    gameSpeed: worldMs / wallMs,
    duplicateMomentPresents: diagnostics.duplicateMomentPresents,
    hitchCappedFrameCount: diagnostics.hitchCappedFrameCount,
  };
}

const STEADY_RATES = [
  ['60 fps', [16.667]],
  ['45 fps on a 60 Hz display', [16.667, 16.667, 33.333]],
  ['40 fps on a 60 Hz display', [16.667, 33.333]],
  ['30 fps, every frame a hair either side of two ticks', [33.333]],
  ['25 fps', [40]],
  ['20 fps', [50]],
];

for (const [label, intervals] of STEADY_RATES) {
  test(`the ship flies smooth at ${label}: no frozen present, no snap, full game speed`, () => {
    const flown = flyPattern(intervals);
    assert.equal(flown.frozenPresents, 0,
      'while time passes the hull is never drawn at the same moment twice');
    assert.equal(flown.duplicateMomentPresents, 0, 'the live loop counter agrees with the picture');
    assert.ok(flown.worstSnapMs < 0.01,
      `the drawn world must advance by exactly the time that passed (worst snap ${flown.worstSnapMs.toFixed(2)} ms)`);
    assert.ok(Math.abs(flown.gameSpeed - 1) < 0.001,
      `a slow frame rate must not become slow motion (game speed ${(flown.gameSpeed * 100).toFixed(1)} %)`);
    assert.equal(flown.hitchCappedFrameCount, 0, 'a steady frame rate is never treated as a hitch');
  });
}

test('a slow GPU (every draw over 33 ms) still flies smooth at full game speed', () => {
  const flown = flyPattern([33.333], { presentCostMs: (i) => (i % 2 ? 34 : 30) });
  assert.equal(flown.frozenPresents, 0);
  assert.ok(flown.worstSnapMs < 0.01);
  assert.ok(Math.abs(flown.gameSpeed - 1) < 0.001,
    `a slow draw must not starve the sim (game speed ${(flown.gameSpeed * 100).toFixed(1)} %)`);
});

test('a real hitch pauses the world instead of teleporting the ship, and never freezes a present', () => {
  const flown = flyPattern(Array.from({ length: 60 }, (_, i) => (i === 59 ? 120 : 16.667)));
  assert.equal(flown.frozenPresents, 0);
  assert.ok(flown.hitchCappedFrameCount > 0, 'the 120 ms callbacks are recognised as hitches');
  assert.ok(flown.gameSpeed < 1 && flown.gameSpeed > 0.9,
    'only the frozen time is shed; ordinary frames between hitches keep real time');
});
