// Pins the signed actuator demand that computeFlightTelemetry forwards to presentation.
//
// The reported defect: turning fired both bow jets instead of the opposite-side jet, because
// the only actuator signal leaving the telemetry seam was an unsigned world-space acceleration
// and the renderer had to guess a nozzle from input keys. These tests drive the real
// propulsion kernel for every drive family and assert the seam publishes a sign, the matching
// non-negative nozzle channel, and the same key set regardless of family.

import assert from 'node:assert/strict';
import test from 'node:test';

import { computeFlightTelemetry } from '../src/core/flight/flightTelemetry.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';

const DT = 1 / 60;

// One drive per family. Sail is included deliberately: its environmental acceleration and weak
// dead-field trim share the same signed presentation contract.
const FAMILY_DRIVES = [
  'drive_reaction_m',
  'drive_gravimetric_m',
  'drive_pulse_plate_m',
  'drive_torch_l',
  'drive_field_sail_m',
];

// Families whose kernel step can actually command thrust opposite the nose. The sail trims with
// a tiny reverse authority only when the pilot pushes the throttle negative, so a plain brake
// hold legitimately produces nothing there.
const RETRO_CAPABLE = ['drive_reaction_m', 'drive_gravimetric_m', 'drive_pulse_plate_m', 'drive_torch_l'];

// The return shape before the actuator block existed. Guards against a silent rename.
const PRE_EXISTING_KEYS = [
  'speed', 'forwardSpeed', 'lateralSpeed', 'velocityHeading', 'driftAngle', 'velocityUnit',
  'noseUnit', 'rightUnit', 'acceleration', 'braking', 'projectedStop',
  'precisionEnvelopeRatio', 'combatEnvelopeRatio', 'target',
];

function body(overrides = {}) {
  return {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 20,
    inertia: 40,
    radius: 6,
    ...overrides,
  };
}

/**
 * Drive the real propulsion kernel and hand its result to the telemetry seam the way
 * flightV3.js does. `ticks` exists because spool/charge drives need a few frames before their
 * drive state is anything but idle; the body is deliberately not integrated, so each tick sees
 * the same physical situation and only the drive's own runtime advances.
 */
function actuatorsFor(driveId, input, bodyOverrides = {}, ticks = 1) {
  const profile = PROPULSION_PROFILES[driveId];
  const b = body(bodyOverrides);
  let runtime = createPropulsionRuntime(profile);
  let result = null;
  for (let i = 0; i < ticks; i++) {
    result = stepPropulsion({ dt: DT, body: b, input, profile, runtime });
    runtime = result.runtime;
  }
  const telemetry = computeFlightTelemetry({ body: b, profile, control: { telemetry: result.telemetry } });
  return { telemetry, actuators: telemetry.actuators, result };
}

test('turning left and right produce opposite-signed yaw demand on opposite channels', () => {
  for (const driveId of FAMILY_DRIVES) {
    const right = actuatorsFor(driveId, { turn: 1 }).actuators;
    const left = actuatorsFor(driveId, { turn: -1 }).actuators;

    assert.ok(right.yaw > 0, `${driveId}: turn=+1 must demand starboard (positive) yaw, got ${right.yaw}`);
    assert.ok(left.yaw < 0, `${driveId}: turn=-1 must demand port (negative) yaw, got ${left.yaw}`);
    assert.equal(Math.sign(right.yaw), -Math.sign(left.yaw), `${driveId}: yaw demand must invert with turn`);

    // The actual bug: one nozzle channel lights, never both.
    assert.ok(right.yawCw > 0 && right.yawCcw === 0, `${driveId}: turn=+1 must light only yawCw`);
    assert.ok(left.yawCcw > 0 && left.yawCw === 0, `${driveId}: turn=-1 must light only yawCcw`);
    assert.equal(right.yawCw, left.yawCcw, `${driveId}: mirrored turns must demand equal magnitude`);

    // The rate target must agree in sign with the torque demand, or a renderer blending the two
    // would fire opposing jets on the same frame.
    assert.equal(Math.sign(right.yawRateTarget), 1, `${driveId}: turn=+1 yaw rate target must be positive`);
    assert.equal(Math.sign(left.yawRateTarget), -1, `${driveId}: turn=-1 yaw rate target must be negative`);
  }
});

test('strafing port and starboard produce opposite-signed lateral demand on opposite channels', () => {
  for (const driveId of FAMILY_DRIVES) {
    const starboard = actuatorsFor(driveId, { strafe: 1 }).actuators;
    const port = actuatorsFor(driveId, { strafe: -1 }).actuators;

    assert.ok(starboard.lateral > 0, `${driveId}: strafe=+1 must push starboard, got ${starboard.lateral}`);
    assert.ok(port.lateral < 0, `${driveId}: strafe=-1 must push port, got ${port.lateral}`);
    assert.ok(starboard.starboard > 0 && starboard.port === 0, `${driveId}: strafe=+1 must light only the starboard channel`);
    assert.ok(port.port > 0 && port.starboard === 0, `${driveId}: strafe=-1 must light only the port channel`);
    assert.equal(starboard.starboard, port.port, `${driveId}: mirrored strafes must demand equal magnitude`);
  }
});

test('main thrust demand is forward-positive and lands on the main channel', () => {
  for (const driveId of FAMILY_DRIVES) {
    const a = actuatorsFor(driveId, { throttle: 1 }).actuators;
    assert.ok(a.forward > 0, `${driveId}: full throttle must demand forward thrust, got ${a.forward}`);
    assert.ok(a.main > 0 && a.reverse === 0, `${driveId}: full throttle must light only the main channel`);
  }
});

test('the player field sail retains weak forward trim when no environmental field exists', () => {
  const profile = PROPULSION_PROFILES.drive_field_sail_m;
  const { result, actuators } = actuatorsFor('drive_field_sail_m', { throttle: 1 });
  assert.ok(result.force.x > 0, 'dead-field forward throttle must produce physical force');
  assert.ok(Math.abs(result.force.x / 20 - profile.trimAccel) < 1e-9,
    'dead-field authority must be exactly the authored trim acceleration, not invented sail force');
  assert.ok(actuators.main > 0 && actuators.reverse === 0,
    'the onboard trim must publish truthful forward actuator demand');
});

test('braking from forward motion demands reverse, never main thrust', () => {
  const moving = { vel: { x: 40, z: 0 } }; // rot is 0, so +X is straight down the nose.
  for (const driveId of FAMILY_DRIVES) {
    const a = actuatorsFor(driveId, { throttle: 0, brake: true }, moving).actuators;
    // Universal: a braking ship must never be told to light its main drive.
    assert.equal(a.main, 0, `${driveId}: braking must not demand main thrust, got ${a.main}`);
    if (RETRO_CAPABLE.includes(driveId)) {
      assert.ok(a.forward < 0, `${driveId}: braking must demand aft thrust, got ${a.forward}`);
      assert.ok(a.reverse > 0, `${driveId}: braking must light the reverse channel, got ${a.reverse}`);
    }
  }
});

test('braking is reported physically for every family, and the pilot brake actuator where published', () => {
  const moving = { vel: { x: 40, z: 0 } };
  // `braking` is derived from demand opposing velocity, so it must hold for every retro-capable
  // family even though only reaction publishes an assist reason.
  for (const driveId of RETRO_CAPABLE) {
    const a = actuatorsFor(driveId, { throttle: 0, brake: true }, moving).actuators;
    assert.equal(a.braking, true, `${driveId}: braking must be reported, not inferred from keys`);
  }
  // Only the reaction kernel publishes assistReason today. Pin that the seam forwards it rather
  // than inventing one for the families that stay silent.
  const reaction = actuatorsFor('drive_reaction_m', { throttle: 0, brake: true }, moving).actuators;
  assert.equal(reaction.assist.reason, 'pilot-brake');
  assert.equal(reaction.pilotBrake, true);
  for (const driveId of ['drive_gravimetric_m', 'drive_torch_l', 'drive_field_sail_m']) {
    const a = actuatorsFor(driveId, { throttle: 0, brake: true }, moving).actuators;
    assert.equal(a.assist.reason, 'none', `${driveId}: an unpublished assist reason must read 'none', never undefined`);
  }
  // Coasting with no input is counter-thrust, not a pilot brake — the distinction is the point.
  const coasting = actuatorsFor('drive_reaction_m', { throttle: 0 }, moving).actuators;
  assert.equal(coasting.assist.reason, 'neutral-counterthrust');
  assert.equal(coasting.pilotBrake, false);
  assert.equal(coasting.braking, true, 'counter-thrust still physically decelerates');
  // And a pilot holding throttle while slipping sideways is slip-assist, accelerating overall.
  const slipping = actuatorsFor('drive_reaction_m', { throttle: 1 }, { vel: { x: 10, z: 30 } }).actuators;
  assert.equal(slipping.assist.reason, 'slip-assist');
  assert.equal(slipping.pilotBrake, false);
  assert.equal(slipping.braking, false);
});

test('assisted speed governor reports engagement and overspeed as applied-versus-requested authority', () => {
  const profile = PROPULSION_PROFILES.drive_reaction_m;
  // Well past throttle x combatSpeed, so the governor must clamp and flag overspeed.
  const fast = actuatorsFor('drive_reaction_m', { throttle: 1, assistMode: 'assisted' }, {
    vel: { x: profile.combatSpeed * 2, z: 0 },
  }).actuators;
  assert.equal(fast.limited, true, 'overspeed must be reported as limited authority');
  assert.equal(fast.limitReason, 'governor-overspeed');
  assert.equal(fast.governor.engaged, true);
  assert.equal(fast.governor.overspeed, true);
  assert.ok(fast.governor.cap > 0 && Number.isFinite(fast.governor.cap), 'engaged governor must publish a finite cap');

  // From a standstill the governor saturates at full authority and has no opinion.
  const slow = actuatorsFor('drive_reaction_m', { throttle: 1, assistMode: 'assisted' }).actuators;
  assert.equal(slow.limited, false);
  assert.equal(slow.limitReason, 'none');
  assert.equal(slow.governor.engaged, false);

  // Drift mode is the ungoverned toy: the governor must stay silent, never report a false cap.
  const drift = actuatorsFor('drive_reaction_m', { throttle: 1, assistMode: 'drift' }, {
    vel: { x: profile.combatSpeed * 2, z: 0 },
  }).actuators;
  assert.equal(drift.governor.engaged, false);
  assert.equal(drift.governor.cap, 0, 'a silent governor publishes 0, not undefined');
  assert.equal(drift.limitReason, 'none');
});

test('drive-state, boost and coast-helm flags cross the seam so presentation stops reading keys', () => {
  const boosting = actuatorsFor('drive_reaction_m', { throttle: 1, boost: true }).actuators;
  assert.equal(boosting.boosting, true);
  assert.equal(boosting.boostFraction, 1);
  assert.equal(boosting.driveState, 'thrust');
  assert.equal(boosting.assistMode, 'assisted');
  assert.equal(boosting.coastHelm, false, 'boosting cancels the coast-helm yaw bonus');

  const coasting = actuatorsFor('drive_reaction_m', { turn: 1 }).actuators;
  assert.equal(coasting.coastHelm, true, 'idle main drive must report the coast-helm bonus');
  assert.equal(coasting.boosting, false);
  assert.equal(coasting.boostFraction, 0);

  // Torch needs a few frames of spool before it stops calling itself idle.
  assert.equal(actuatorsFor('drive_torch_l', { throttle: 1 }, {}, 10).actuators.driveState, 'spooling');
  assert.equal(actuatorsFor('drive_gravimetric_m', { throttle: 1 }).actuators.driveState, 'velocity-servo');
  assert.equal(actuatorsFor('drive_field_sail_m', { throttle: 1 }).actuators.driveState, 'stowed');
  assert.equal(actuatorsFor('drive_field_sail_m', { throttle: 1 }, {}, 300).actuators.driveState, 'deployed');
});

test('a fired pulse-plate impulse is published as actuator demand', () => {
  const profile = PROPULSION_PROFILES.drive_pulse_plate_m;
  const b = body();
  // Charge for a while, then release: the discrete impulse is an actuator event a renderer
  // must be able to see without reaching into the kernel result.
  let runtime = createPropulsionRuntime(profile);
  let result = null;
  for (let i = 0; i < 60; i++) {
    result = stepPropulsion({ dt: DT, body: b, input: { boost: true }, profile, runtime });
    runtime = result.runtime;
  }
  const charging = computeFlightTelemetry({ body: b, profile, control: { telemetry: result.telemetry } }).actuators;
  assert.equal(charging.driveState, 'charging');
  assert.equal(charging.impulseDeltaV, 0, 'charging is not yet an impulse');

  result = stepPropulsion({ dt: DT, body: b, input: { boostReleased: true }, profile, runtime });
  const fired = computeFlightTelemetry({ body: b, profile, control: { telemetry: result.telemetry } }).actuators;
  assert.equal(fired.driveState, 'pulse');
  assert.ok(fired.impulseDeltaV > 0, `fired pulse must publish delta-v, got ${fired.impulseDeltaV}`);
});

test('every drive family yields an identical actuator key set with finite numbers', () => {
  const inputs = [
    { turn: 1 },
    { strafe: -1 },
    { throttle: 1, boost: true },
    { throttle: 0, brake: true },
  ];
  let reference = null;
  for (const driveId of FAMILY_DRIVES) {
    for (const input of inputs) {
      const a = actuatorsFor(driveId, input, { vel: { x: 25, z: -8 } }).actuators;
      const shape = describeShape(a);
      if (reference === null) reference = shape;
      else assert.deepEqual(shape, reference, `${driveId} ${JSON.stringify(input)}: actuator shape drifted`);
      assertNoBadNumbers(a, `${driveId} ${JSON.stringify(input)}`);
    }
  }
});

test('a null control yields a fully zeroed actuator block rather than undefined or NaN', () => {
  const telemetry = computeFlightTelemetry({
    body: body({ vel: { x: 30, z: 12 }, rot: 0.7, angVel: 0.4 }),
    profile: PROPULSION_PROFILES.drive_reaction_m,
    control: null,
  });
  const a = telemetry.actuators;
  assert.ok(a && typeof a === 'object', 'the actuator block must exist even with no control authority');
  assertNoBadNumbers(a, 'control=null');

  for (const key of ['forward', 'lateral', 'yaw', 'yawRateTarget', 'main', 'reverse', 'port',
    'starboard', 'yawCw', 'yawCcw', 'boostFraction', 'impulseDeltaV']) {
    assert.equal(a[key], 0, `control=null must zero ${key}`);
  }
  assert.deepEqual(a.manual, { forward: 0, lateral: 0 });
  assert.deepEqual(a.assist, { forward: 0, lateral: 0, reason: 'none' });
  assert.deepEqual(a.governor, { engaged: false, overspeed: false, cap: 0, baseCap: 0, physicsEarned: false });
  assert.equal(a.limited, false);
  assert.equal(a.limitReason, 'none');
  assert.equal(a.braking, false);
  assert.equal(a.pilotBrake, false);
  assert.equal(a.boosting, false);
  assert.equal(a.coastHelm, false);
  assert.equal(a.driveState, 'idle');
  assert.equal(a.assistMode, 'none');

  // Same key set as a live drive: presentation must not branch on whether control exists.
  const live = actuatorsFor('drive_reaction_m', { throttle: 1 }).actuators;
  assert.deepEqual(describeShape(a), describeShape(live));
});

test('the actuator block is purely additive to the telemetry contract', () => {
  const args = {
    body: body({ vel: { x: 30, z: 12 }, rot: 0.7, angVel: 0.4 }),
    profile: PROPULSION_PROFILES.drive_reaction_m,
  };
  const before = computeFlightTelemetry({ ...args, control: null });
  const live = actuatorsFor('drive_reaction_m', { throttle: 1 }).telemetry;

  for (const key of PRE_EXISTING_KEYS) {
    assert.ok(key in before, `pre-existing telemetry key ${key} disappeared`);
    assert.ok(key in live, `pre-existing telemetry key ${key} disappeared with live control`);
  }
  assert.deepEqual(
    Object.keys(before).filter((k) => !PRE_EXISTING_KEYS.includes(k)),
    ['actuators'],
    'actuators must be the only added top-level field'
  );
  // The pre-existing acceleration field keeps its own shape and meaning.
  assert.deepEqual(Object.keys(live.acceleration).sort(), ['x', 'z']);
  assert.equal(before.target, null);
});

/** Structural fingerprint: key names plus value kinds, recursively. Order-insensitive. */
function describeShape(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = describeShape(value[key]);
  return out;
}

function assertNoBadNumbers(value, label, path = 'actuators') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${label}: ${path} must be finite, got ${value}`);
    return;
  }
  if (value === null || typeof value !== 'object') {
    assert.notEqual(value, undefined, `${label}: ${path} must not be undefined`);
    return;
  }
  for (const key of Object.keys(value)) assertNoBadNumbers(value[key], label, `${path}.${key}`);
}
