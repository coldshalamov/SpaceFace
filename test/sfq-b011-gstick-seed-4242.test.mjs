// SFQ-B011 (board row 219, hand lane) — the fixed-seed 4242 pin for the G combat stick's
// ONE calibrated parameter family: DYNAMIC_FLIGHT_STICK_TUNING.deadzoneRecenter.
//
// The calibration itself landed on master in 83461978d ("G-stick deadzone re-centering —
// resting-palm noise no longer saturates the knob; deliberate travel still crosses") and
// test/sfq-b011-gstick-verification.test.mjs already walks the full acceptance matrix
// (stationary noise, full-circle pursuit, diagonal reversal, release-to-neutral, travel and
// response at real viewports) on its own repro seeds. This file is the done-check pin the
// unit asks for ON THE REPO'S STANDARD FIXED SEED 4242: no jitter at rest, and no
// displacement jump smuggled across a G-mode change.
//
// Scope laws honoured here:
// - The deadzone (10 px), radius (0.17 viewport fraction, 118–176 px band) and response
//   exponent (1.16) families keep their authored values; old absolute-radius numbers stay
//   retired (the Feel Contract B2/B3 speed-normalized amendments stand).
// - Resize/zoom/display-density (DPR) stability is NXB-002's owned surface
//   (test/next-wave-nxb-002.test.mjs, run alongside); this file pins the seed-4242 noise
//   and mode-edge behaviour in CSS pixels, which is what the stick consumes.
// - No cursor teleport, no draw-to-fly revival, no G-semantics switch: the stick stays a
//   bounded relative knob; the module's own commit history is the refusal record.
//
// Determinism: one LCG seeded 4242; no Math.random, no wall time, no state.rng needed
// (this module owns intent geometry only — pure functions of the packets it is fed).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DYNAMIC_FLIGHT_STICK_TUNING,
  projectDynamicFlightStick,
  recordDynamicFlightStick,
  resetDynamicFlightStick,
} from '../src/systems/dynamicFlightStick.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SEED = 4242;

/** Deterministic LCG — the same generator family the verification suite pins its repros with. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

/** A headless G-stick host with the linear fallback camera basis (screen axes = world axes). */
function stickHost() {
  const player = { id: 'p', pos: { x: 0, z: 0 } };
  return {
    state: {
      playerId: 'p',
      entities: { get: (id) => (id === 'p' ? player : null) },
      input: { autoFire: true },
    },
    helpers: {
      worldToScreen: () => ({ x: 500, y: 300 }),
      raycastToPlane: (n) => ({ x: n.x * 40, z: -n.y * 40 }),
    },
  };
}

test('seed 4242: the calibrated deadzoneRecenter family is the live, active one', () => {
  // The family this unit calibrated must exist and be active: a zero (or >= 1) re-center
  // fraction is the deleted calibration — the random-walk saturation regression — wearing a name.
  const recenter = DYNAMIC_FLIGHT_STICK_TUNING.deadzoneRecenter;
  assert.ok(recenter > 0 && recenter < 1, `deadzoneRecenter must be an active bleed (got ${recenter})`);
  // ...and the authored neighbours it must not have drifted with stay in their bands.
  assert.equal(DYNAMIC_FLIGHT_STICK_TUNING.deadzonePx, 10);
  assert.ok(DYNAMIC_FLIGHT_STICK_TUNING.responseExponent > 1,
    'the response curve stays progressive, not linear-inverted');
});

test('seed 4242: stationary symmetric trackpad noise never commands thrust at real viewports', () => {
  const rand = lcg(SEED);
  for (const [w, h] of [[400, 400], [1000, 600], [2560, 1080]]) { // min-band, mid, max-band radius
    const host = stickHost();
    resetDynamicFlightStick(host, w, h);
    let commanded = 0;
    let maxMagnitude = 0;
    for (let i = 0; i < 2000; i += 1) {
      recordDynamicFlightStick(host, (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.8, w, h);
      const vector = projectDynamicFlightStick(host, w, h);
      maxMagnitude = Math.max(maxMagnitude, vector.magnitude);
      if (vector.active) commanded += 1;
    }
    assert.equal(commanded, 0, `${w}x${h}: 2000 resting-palm packets must not yaw the hull`);
    assert.equal(maxMagnitude, 0, `${w}x${h}: no packet may even shape a partial command`);
    const knob = Math.hypot(host._autoTargetStick.xPx, host._autoTargetStick.yPx);
    assert.ok(knob < DYNAMIC_FLIGHT_STICK_TUNING.deadzonePx,
      `${w}x${h}: noise must re-center, not park at the deadzone rim (knob at ${knob.toFixed(2)} px)`);
  }
});

test('seed 4242: the biased-palm saturation repro stays fixed — re-centering beats accumulation', () => {
  // The reproduced usability issue the calibration fixed: a resting palm emitting small
  // RIGHTWARD-BIASED packets used to random-walk the knob across the deadzone and pin thrust
  // at rest (0.4 px/packet saturated it at full deflection before the fix). On seed 4242 it
  // must stay inside the deadzone forever and re-center toward neutral.
  const rand = lcg(SEED);
  const w = 1000;
  const h = 600; // live radius clamps to minRadiusPx (118) here
  const host = stickHost();
  resetDynamicFlightStick(host, w, h);
  let commanded = 0;
  let maxMagnitude = 0;
  for (let i = 0; i < 1200; i += 1) {
    recordDynamicFlightStick(host, 0.4 + (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.8, w, h);
    const vector = projectDynamicFlightStick(host, w, h);
    maxMagnitude = Math.max(maxMagnitude, vector.magnitude);
    if (vector.active) commanded += 1;
  }
  assert.equal(commanded, 0, 'a resting biased palm must never command thrust');
  assert.equal(maxMagnitude, 0);
  const knob = Math.hypot(host._autoTargetStick.xPx, host._autoTargetStick.yPx);
  assert.ok(knob < DYNAMIC_FLIGHT_STICK_TUNING.deadzonePx / 2,
    `biased noise must re-center, not approach the rim (knob at ${knob.toFixed(2)} px)`);
  // The calibration must not have deadened the stick: one deliberate 40 px combat swipe still
  // crosses, carrying at least the authored from-neutral authority for that displacement
  // (t=(40-10)/108, ^1.16 at the 118 px radius = 0.226; the small residual palm displacement
  // rides on top and can only add, and the rim caps the answer).
  recordDynamicFlightStick(host, 40, 0, w, h);
  const vector = projectDynamicFlightStick(host, w, h);
  assert.ok(vector.active && vector.magnitude >= 0.226 - 1e-9 && vector.magnitude <= 1,
    `deliberate travel still crosses after the noise (got ${vector.magnitude})`);
});

test('seed 4242: a G-mode change cannot smuggle a displacement jump', () => {
  const w = 1000;
  const h = 600;
  const host = stickHost();
  resetDynamicFlightStick(host, w, h);
  recordDynamicFlightStick(host, 60, 30, w, h);
  assert.ok(projectDynamicFlightStick(host, w, h).active, 'precondition: the knob commands');

  // G off — the live edge (input.js update()) re-centers the stick when the mode flips.
  host.state.input.autoFire = false;
  resetDynamicFlightStick(host, w, h);
  const off = projectDynamicFlightStick(host, w, h);
  assert.equal(off.active, false);
  assert.equal(off.magnitude, 0);

  // Packets keep arriving while disarmed (a real pilot keeps moving the hand); they must not
  // survive the re-entry edge as a jump.
  const rand = lcg(SEED);
  for (let i = 0; i < 50; i += 1) {
    recordDynamicFlightStick(host, (rand() - 0.5) * 6, (rand() - 0.5) * 6, w, h);
  }

  // G back on — the re-entry edge wipes the disarmed accumulation before anything commands.
  host.state.input.autoFire = true;
  resetDynamicFlightStick(host, w, h);
  const reentry = projectDynamicFlightStick(host, w, h);
  assert.equal(reentry.active, false, 're-entry must command nothing from stale displacement');
  assert.equal(reentry.magnitude, 0);
  assert.equal(reentry.worldX, 0);
  assert.equal(reentry.worldZ, 0);
  const knob = Math.hypot(host._autoTargetStick.xPx, host._autoTargetStick.yPx);
  assert.equal(knob, 0, 'the re-entry edge must leave the knob exactly at neutral');

  // The first post-re-entry swipe answers with the authored magnitude for ITS displacement —
  // continuity from neutral, never a jump from the disarmed accumulation.
  recordDynamicFlightStick(host, 40, 0, w, h);
  const first = projectDynamicFlightStick(host, w, h);
  assert.ok(Math.abs(first.magnitude - 0.226) < 1e-3,
    `the first post-re-entry command is the authored shaped answer (got ${first.magnitude})`);

  // And the live owner really does re-center on the flip (the wiring half of the guarantee):
  // input.js resets the stick inside the autoTargetPointer mode edge.
  const inputSource = read('../src/systems/input.js');
  assert.match(inputSource,
    /autoTargetPointer !== !!this\._autoTargetPointerMode[\s\S]{0,600}resetDynamicFlightStick\(this, geometryForStick/,
    'the G on/off edge must re-center the stick (input.js owns the flip)');
});
