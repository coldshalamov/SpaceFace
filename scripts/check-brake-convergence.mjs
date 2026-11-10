// Brake convergence probe for src/core/flight/propulsionKernel.js.
//
// THE DEFECT THIS PINS. The input owner couples the two commands — src/systems/input.js sets
// `brake = reverse || brakeHeld`, so holding S asserts throttle -1 AND brake together — while
// manualThrustLocal only suppressed the manual term when it OPPOSED travel by more than
// `brakeReleaseSpeed`. That left a hole around and below zero, so the brake assist (gain
// 1/pilotBrakeHorizonS) and the reverse thruster (reverseAccel) balanced each other at a steady
// negative speed. On the starter hull, holding S from cruise decelerated, overshot through zero, and
// settled flying BACKWARDS at exactly -21.6 WU/s forever; holding S from rest accelerated backwards
// to the same figure. The dedicated zero-thrust brake was always fine, which is why this hid: the
// broken path is the one every player actually presses.
//
// Assisted reverse flight is deliberately NOT a supported verb — applySpeedGovernor returns early
// unless `throttle > deadInput`, so reverse is ungoverned, and with no vacuum drag an unopposed
// reverse command accelerates without bound. So the fix is "the brake wins", not "govern reverse".
//
// This integrates the real kernel. No renderer, no DOM, no wall clock.
import assert from 'node:assert/strict';

import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';

const DT = 1 / 60;
const failures = [];
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failures.push(name); console.error(`FAIL ${name}\n     ${err.message}`); }
}

/** Integrate the kernel for `seconds` and return the final forward speed in WU/s. */
function settleForwardSpeed({ shipId = 'ship_starter_scout', startForward = 0, throttle = 0, strafe = 0, brake = false, assistMode = 'assisted', seconds = 25 }) {
  const profile = resolvePropulsionProfile({ id: shipId });
  let runtime = createPropulsionRuntime(profile);
  const body = { pos: { x: 0, y: 0, z: 0 }, vel: { x: startForward, y: 0, z: 0 }, rot: 0, angVel: 0, mass: 10, inertia: 40 };
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const res = stepPropulsion({ dt: DT, body, input: { throttle, strafe, turn: 0, boost: false, brake, assistMode }, profile, runtime });
    runtime = res.runtime || runtime;
    body.vel.x += ((res.force && res.force.x) || 0) / body.mass * DT;
    body.vel.z += ((res.force && res.force.z) || 0) / body.mass * DT;
    if (res.velocityDelta) { body.vel.x += res.velocityDelta.x || 0; body.vel.z += res.velocityDelta.z || 0; }
    body.pos.x += body.vel.x * DT;
    body.pos.z += body.vel.z * DT;
  }
  return { forward: body.vel.x, lateral: body.vel.z };
}

// The residual the assist deliberately leaves: below `deadSpeed` with no throttle the counter-thrust
// switches off rather than hunting zero forever. Any convergence tolerance must clear it.
const REST = 0.5;

for (const shipId of ['ship_starter_scout', 'ship_hauler_mule', 'ship_fighter_lance']) {
  check(`${shipId}: holding reverse+brake from cruise comes to REST, never settles reversing`, () => {
    const { forward } = settleForwardSpeed({ shipId, startForward: 120, throttle: -1, brake: true });
    assert(Math.abs(forward) < REST,
      `expected rest, got ${forward.toFixed(3)} WU/s — a steady non-zero speed here is the assist and the reverse thruster deadlocking`);
  });

  check(`${shipId}: holding reverse+brake from rest does not accelerate backwards`, () => {
    const { forward } = settleForwardSpeed({ shipId, startForward: 0, throttle: -1, brake: true });
    assert(Math.abs(forward) < REST, `expected to stay at rest, got ${forward.toFixed(3)} WU/s`);
  });

  check(`${shipId}: the dedicated zero-thrust brake still stops the ship`, () => {
    const { forward } = settleForwardSpeed({ shipId, startForward: 120, throttle: 0, brake: true });
    assert(Math.abs(forward) < REST, `expected rest, got ${forward.toFixed(3)} WU/s`);
  });

  check(`${shipId}: braking also kills lateral drift while strafe is held`, () => {
    // Same hole existed on the strafe axis, with the same shape.
    const profile = resolvePropulsionProfile({ id: shipId });
    let runtime = createPropulsionRuntime(profile);
    const body = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 60 }, rot: 0, angVel: 0, mass: 10, inertia: 40 };
    for (let i = 0; i < Math.round(25 / DT); i++) {
      const res = stepPropulsion({ dt: DT, body, input: { throttle: 0, strafe: -1, turn: 0, boost: false, brake: true, assistMode: 'assisted' }, profile, runtime });
      runtime = res.runtime || runtime;
      body.vel.x += ((res.force && res.force.x) || 0) / body.mass * DT;
      body.vel.z += ((res.force && res.force.z) || 0) / body.mass * DT;
      body.pos.x += body.vel.x * DT; body.pos.z += body.vel.z * DT;
    }
    assert(Math.abs(body.vel.z) < REST, `expected lateral rest, got ${body.vel.z.toFixed(3)} WU/s`);
  });
}

check('braking still converges under drift and newtonian assist modes', () => {
  for (const assistMode of ['drift', 'newtonian']) {
    const { forward } = settleForwardSpeed({ startForward: 120, throttle: -1, brake: true, assistMode });
    assert(Math.abs(forward) < REST, `${assistMode}: expected rest, got ${forward.toFixed(3)} WU/s`);
  }
});

check('an UNBRAKED reverse command still produces real reverse thrust', () => {
  // The fix must not confiscate reverse thrust in general — only while the brake is held. Without
  // brake, throttle -1 is an ordinary ungoverned reverse burn and must move the ship backwards.
  const { forward } = settleForwardSpeed({ startForward: 0, throttle: -1, brake: false, seconds: 3 });
  assert(forward < -10, `expected reverse thrust to build negative speed, got ${forward.toFixed(3)} WU/s`);
});

check('forward thrust is unaffected by the brake suppression path', () => {
  const { forward } = settleForwardSpeed({ startForward: 0, throttle: 1, brake: false, seconds: 12 });
  assert(forward > 20, `expected forward flight, got ${forward.toFixed(3)} WU/s`);
});

if (failures.length) {
  console.error(`\nFAIL check:brake-convergence — ${failures.length} failing group(s)`);
  process.exit(1);
}
console.log('\nPASS check:brake-convergence');
