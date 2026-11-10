// BREAKAWAY — capture-fork kernel and payload mechanics (ported from the BREAKAWAY packet suite).
//
// Pure-function coverage. The physical proof that a real SG-02 body is braked and settled by the
// owner lives in test/breakaway-capture-fork-physics.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  velocityAtPoint, dampingImpulse, angularDampingImpulse, stoppingDistance, deliveryQuote,
} from '../src/physicalCargo/breakaway/payloadMath.js';
import {
  defineReceiver, createCaptureState, stepCapture, mouthCrossing,
  validateCaptureProof, captureCandidate, serializeCaptureState, restoreCaptureState,
} from '../src/physicalCargo/breakaway/captureKernel.js';

const receiver = defineReceiver({ id: 'lawful_catcher', x: 0, z: 0, nx: 1, nz: 0 });

function sample(extra = {}) {
  return {
    payloadId: 'payload_sp07', x: 20, z: 0, prevX: 19, prevZ: 0, vx: 1, vz: 0, omegaY: 0,
    radius: 15, mass: 180, inertiaY: 19000, tick: 0, alive: true, ...extra,
  };
}
function entry(extra = {}) { return sample({ x: 1, prevX: -1, vx: 50, ...extra }); }
function acquired() {
  const state = createCaptureState('payload_sp07', receiver.id);
  stepCapture(state, entry(), receiver, { authorized: true });
  return state;
}
function ready() {
  const state = acquired();
  for (let i = 1; i <= 21; i++) stepCapture(state, sample({ tick: i }), receiver, { authorized: true });
  return state;
}
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('release carries physical angular Y sign, including tangential velocity', () => {
  assert.deepEqual(velocityAtPoint({ vx: 80, vz: 3, omegaY: 2, rx: 10, rz: 4 }), { vx: 88, vz: -17, omegaY: 2 });
});

test('nonrotating release keeps velocity exactly', () => {
  assert.deepEqual(velocityAtPoint({ vx: -18, vz: 61, omegaY: 0, rx: 100, rz: 80 }), { vx: -18, vz: 61, omegaY: 0 });
});

test('release rejects nonfinite state', () => {
  assert.throws(() => velocityAtPoint({ vx: NaN, vz: 0, omegaY: 0, rx: 0, rz: 0 }));
});

test('unclamped analytic damping is partition invariant', () => {
  function run(n) {
    let vx = 70;
    for (let i = 0; i < n; i++) {
      const j = dampingImpulse({ vx, vz: 0, mass: 180, dt: 1 / n, rate: 5, maxForce: 1e9 });
      vx += j.x / 180;
    }
    return vx;
  }
  near(run(30), run(60));
  near(run(60), run(120));
});

test('damping never reverses speed, injects energy, or exceeds its force budget', () => {
  for (let s = 0; s < 350; s += 0.7) {
    const j = dampingImpulse({ vx: s, vz: s * 0.3, mass: 180, dt: 1 / 60, rate: 5, maxForce: 36000 });
    assert.ok(Math.hypot(j.x, j.z) <= 600 + 1e-8);
    assert.ok(j.energyRemoved >= -1e-8);
    assert.ok(s + j.x / 180 >= -1e-8);
  }
});

test('zero speed yields zero impulse and zero energy change', () => {
  const j = dampingImpulse({ vx: 0, vz: 0, mass: 180, dt: 1 / 60, rate: 5, maxForce: 36000 });
  near(j.x, 0); near(j.z, 0); near(j.energyRemoved, 0);
});

test('angular damping saturates torque without sign reversal', () => {
  for (const w of [-9, -0.01, 0, 0.01, 9]) {
    const j = angularDampingImpulse({ omegaY: w, inertiaY: 19000, dt: 1 / 60, rate: 6, maxTorque: 180000 });
    assert.ok(Math.abs(j) <= 3000);
    assert.ok(Math.abs(w + j / 19000) <= Math.abs(w));
  }
});

test('stop distance has correct dimensions and value', () => near(stoppingDistance(100, 180, 36000), 25));

test('invalid damping parameters fail closed', () => {
  for (const key of ['mass', 'dt', 'rate', 'maxForce']) {
    assert.throws(() => dampingImpulse({ vx: 1, vz: 0, mass: 180, dt: 1 / 60, rate: 5, maxForce: 36000, [key]: 0 }));
  }
});

test('quality payout is bounded and never penalizes the base reward', () => {
  assert.deepEqual(deliveryQuote(1800, 0.8), { baseCredits: 1800, bonusCredits: 216, totalCredits: 2016 });
  assert.equal(deliveryQuote(1800, 0).totalCredits, 1800);
  assert.throws(() => deliveryQuote(20, 1.1));
});

test('receiver normal is normalized; a zero normal is rejected', () => {
  near(defineReceiver({ id: 'r', x: 0, z: 0, nx: 3, nz: 4 }).nx, 0.6);
  assert.throws(() => defineReceiver({ id: 'r', x: 0, z: 0, nx: 0, nz: 0 }));
});

test('a fresh front-mouth crossing acquires', () => {
  const s = createCaptureState('payload_sp07', receiver.id);
  const o = stepCapture(s, entry(), receiver, { authorized: true });
  assert.equal(o.event, 'capture_acquired');
  assert.equal(s.phase, 'braking');
});

test('a slow load is allowed fully inside before braking', () => {
  const s = createCaptureState('payload_sp07', receiver.id);
  const o = stepCapture(s, entry({ vx: 1 }), receiver, { authorized: true });
  assert.equal(o.reason, 'advance_into_fork');
  assert.equal(o.impulse.x, 0);
});

test('spawning inside a receiver is not a capture', () => {
  const s = createCaptureState('payload_sp07', receiver.id);
  stepCapture(s, sample(), receiver, { authorized: true });
  assert.equal(s.phase, 'outside');
});

test('rear entry is never a capture', () => {
  assert.equal(mouthCrossing(sample({ prevX: 80, x: 50, vx: -50 }), receiver).crossed, false);
});

test('side entry is never a capture', () => {
  assert.equal(mouthCrossing(sample({ prevX: 20, x: 20, prevZ: 80, z: 0 }), receiver).crossed, false);
});

test('overspeed is rejected truthfully; the exact limit is accepted', () => {
  assert.equal(mouthCrossing(entry({ vx: 101 }), receiver).reason, 'too_fast');
  assert.equal(mouthCrossing(entry({ vx: 100 }), receiver).crossed, true);
});

test('centre clearance uses the payload radius, not a point', () => {
  assert.equal(mouthCrossing(entry({ z: 14, prevZ: 14 }), receiver).reason, 'outside_mouth');
});

test('a swept crossing handles a fast step without needing a plane contact', () => {
  const r = mouthCrossing(entry({ prevX: -10, x: 10, vx: 100 }), receiver);
  assert.equal(r.crossed, true);
  near(r.t, 0.5);
});

test('an unauthorized receiver neither acquires nor brakes', () => {
  const s = createCaptureState('payload_sp07', receiver.id);
  const o = stepCapture(s, entry(), receiver);
  assert.equal(o.reason, 'not_registered');
  assert.equal(s.phase, 'outside');
  near(o.impulse.x, 0);
});

test('receiver closure releases a prior acquisition', () => {
  const s = acquired();
  const o = stepCapture(s, sample({ tick: 1 }), receiver, { authorized: true, open: false });
  assert.equal(o.event, 'capture_lost');
  assert.equal(s.phase, 'outside');
});

test('twenty-one consecutive settled ticks produce exactly one ready event', () => {
  const s = acquired();
  let n = 0;
  for (let i = 1; i <= 50; i++) {
    if (stepCapture(s, sample({ tick: i }), receiver, { authorized: true }).event === 'capture_ready') n++;
  }
  assert.equal(n, 1);
  assert.equal(s.phase, 'ready');
});

test('a control impulse during dwell resets progress', () => {
  const s = acquired();
  for (let i = 1; i < 21; i++) stepCapture(s, sample({ tick: i }), receiver, { authorized: true });
  stepCapture(s, sample({ tick: 21, vx: 50 }), receiver, { authorized: true });
  assert.equal(s.settledTicks, 0);
  assert.equal(s.phase, 'braking');
});

test('skipped ticks do not manufacture completed dwell', () => {
  const s = acquired();
  for (let i = 1; i < 21; i++) stepCapture(s, sample({ tick: i }), receiver, { authorized: true });
  stepCapture(s, sample({ tick: 1000 }), receiver, { authorized: true });
  assert.equal(s.settledTicks, 1);
  assert.notEqual(s.phase, 'ready');
});

test('duplicate/decreasing ticks and a wrong payload identity are rejected', () => {
  assert.throws(() => stepCapture(acquired(), entry(), receiver, { authorized: true }));
  assert.throws(() => stepCapture(acquired(), sample({ tick: 1, payloadId: 'other' }), receiver, { authorized: true }));
});

test('a destroyed payload cannot complete', () => {
  const s = ready();
  const o = stepCapture(s, sample({ tick: 22, alive: false }), receiver, { authorized: true });
  assert.equal(o.reason, 'payload_destroyed');
  assert.equal(s.phase, 'outside');
});

test('leaving the capture volume clears custody', () => {
  const s = ready();
  stepCapture(s, sample({ tick: 22, z: 40 }), receiver, { authorized: true });
  assert.equal(s.phase, 'outside');
});

test('proof is rejected after the payload moves, and a historical touch is not proof', () => {
  const s = ready();
  assert.equal(validateCaptureProof(s, sample({ tick: 21 }), receiver, true).ok, true);
  assert.equal(validateCaptureProof(s, sample({ tick: 21, z: 99 }), receiver, true).reason, 'no_current_custody');
  assert.equal(validateCaptureProof(ready(), sample({ tick: 22 }), receiver, true).ok, false);
});

test('the capture receipt is deterministic and identifies its physical episode', () => {
  const s = ready();
  const a = captureCandidate(s, sample({ tick: 21 }), receiver, { authorized: true, scheduleId: 'run1' });
  const b = captureCandidate(s, sample({ tick: 21 }), receiver, { authorized: true, scheduleId: 'run1' });
  assert.deepEqual(a, b);
  assert.equal(a.receipt.source, 'breakaway:captureSettled');
  assert.equal(a.receipt.entryCount, 1);
});

test('save/restore preserves partial dwell without completing it', () => {
  const s = acquired();
  for (let i = 1; i <= 7; i++) stepCapture(s, sample({ tick: i }), receiver, { authorized: true });
  const r = restoreCaptureState(serializeCaptureState(s));
  assert.deepEqual(r, s);
  for (let i = 8; i <= 21; i++) stepCapture(r, sample({ tick: i }), receiver, { authorized: true });
  assert.equal(r.phase, 'ready');
});

test('corrupt and unknown save schemas are rejected', () => {
  assert.throws(() => restoreCaptureState('{"schema":"v99"}'));
  const s = ready();
  s.entryTick = null;
  assert.throws(() => restoreCaptureState(JSON.stringify(s)));
});

test('a rotated receiver behaves equivalently', () => {
  const r = defineReceiver({ id: 'rot', x: 100, z: 100, nx: 0, nz: 1 });
  const s = createCaptureState('payload_sp07', 'rot');
  const o = stepCapture(s, entry({ x: 100, z: 101, prevX: 100, prevZ: 99, vx: 0, vz: 50 }), r, { authorized: true });
  assert.equal(o.event, 'capture_acquired');
});

test('500 deterministic cases never produce invalid state or reversed damping', () => {
  let seed = 42;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let n = 0; n < 500; n++) {
    const speed = 1 + random() * 99;
    const s = createCaptureState('payload_sp07', receiver.id);
    const o = stepCapture(s, entry({ vx: speed, z: (random() - 0.5) * 10, prevZ: 0 }), receiver, { authorized: true });
    assert.ok(Number.isFinite(o.impulse.x));
    assert.ok(['outside', 'braking', 'settling', 'ready'].includes(s.phase));
    assert.ok(o.impulse.x <= 0);
  }
});
