// NXI-013 — a held throttle on a disabled drive is unavailable, not a healthy coast.
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeFlightTelemetry } from '../src/core/flight/flightTelemetry.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';

const PROFILE = PROPULSION_PROFILES.drive_reaction_m;

function body(overrides = {}) {
  return {
    pos: { x: 0, z: 0 },
    vel: { x: 40, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 20,
    inertia: 40,
    radius: 6,
    ...overrides,
  };
}

function project(telemetry) {
  return computeFlightTelemetry({
    body: body(),
    profile: PROFILE,
    control: { telemetry },
  }).actuators;
}

function heldFrame(extra = {}) {
  return {
    acceleration: { x: 0, z: 0 },
    manualLocal: { forward: PROFILE.mainAccel, lateral: 0 },
    assistReason: 'neutral-counterthrust',
    coastHelm: true,
    ...extra,
  };
}

test('a held request on an explicit disabled drive is not a healthy coast', () => {
  for (const driveState of ['disabled', 'offline', 'damaged', 'unavailable']) {
    const a = project(heldFrame({ driveState }));
    assert.equal(a.driveState, driveState);
    assert.equal(a.assist.reason, 'drive-unavailable');
    assert.equal(a.limitReason, 'drive-unavailable');
    assert.equal(a.limited, true);
    assert.equal(a.coastHelm, false);
    assert.equal(a.pilotBrake, false);
    assert.equal(a.manual.forward, PROFILE.mainAccel);
    assert.equal(a.forward, 0);
    assert.equal(a.main, 0);
  }
});

test('an engaged governor on a disabled drive keeps the governor cause', () => {
  const a = project(heldFrame({
    driveState: 'disabled',
    governor: {
      engaged: true,
      overspeed: false,
      cap: PROFILE.combatSpeed,
      baseCap: PROFILE.combatSpeed,
    },
  }));
  assert.equal(a.driveState, 'disabled');
  assert.equal(a.governor.engaged, true);
  assert.equal(a.limitReason, 'governor-cap');
  assert.notEqual(a.assist.reason, 'drive-unavailable');
  assert.equal(a.manual.forward, PROFILE.mainAccel);
});

test('a held request with no published drive state is unavailable, not idle', () => {
  const a = project(heldFrame());
  assert.equal(a.driveState, 'unavailable');
  assert.notEqual(a.driveState, 'idle');
  assert.equal(a.assist.reason, 'drive-unavailable');
  assert.equal(a.limitReason, 'drive-unavailable');
  assert.equal(a.limited, true);
  assert.equal(a.coastHelm, false);
  assert.equal(a.manual.forward, PROFILE.mainAccel);
  assert.equal(a.forward, 0);
});

test('a released stick on a disabled drive stays a coast, and the state stays disabled', () => {
  const a = project({
    acceleration: { x: 0, z: 0 },
    manualLocal: { forward: 0, lateral: 0 },
    assistReason: 'neutral-counterthrust',
    coastHelm: true,
    driveState: 'disabled',
  });
  assert.equal(a.driveState, 'disabled');
  assert.equal(a.limitReason, 'none');
  assert.equal(a.limited, false);
  assert.equal(a.assist.reason, 'neutral-counterthrust');
  assert.equal(a.coastHelm, true);
  assert.equal(a.manual.forward, 0);
});

test('a pilot brake on a disabled drive keeps the brake cause', () => {
  const a = project(heldFrame({
    driveState: 'disabled',
    assistReason: 'pilot-brake',
    coastHelm: false,
  }));
  assert.equal(a.driveState, 'disabled');
  assert.equal(a.assist.reason, 'pilot-brake');
  assert.equal(a.pilotBrake, true);
  assert.notEqual(a.limitReason, 'drive-unavailable');
  assert.equal(a.manual.forward, PROFILE.mainAccel);
});

test('a working drive token is not relabeled from a zero residual', () => {
  const a = project(heldFrame({
    driveState: 'thrust',
    assistReason: 'slip-assist',
    coastHelm: false,
  }));
  assert.equal(a.driveState, 'thrust');
  assert.equal(a.assist.reason, 'slip-assist');
  assert.equal(a.limitReason, 'none');
  assert.equal(a.limited, false);
  assert.equal(a.coastHelm, false);
});

test('a healthy coast from the reaction kernel is still a coast', () => {
  const profile = PROFILE;
  const b = body();
  let runtime = createPropulsionRuntime(profile);
  const result = stepPropulsion({
    dt: 1 / 60,
    body: b,
    input: { throttle: 0, strafe: 0, turn: 0, brake: false, assistMode: 'assisted' },
    profile,
    runtime,
  });
  const a = computeFlightTelemetry({
    body: b,
    profile,
    control: { telemetry: result.telemetry },
  }).actuators;
  assert.equal(a.assist.reason, 'neutral-counterthrust');
  assert.equal(a.pilotBrake, false);
  assert.equal(a.braking, true);
  assert.equal(a.limitReason, 'none');
  assert.notEqual(a.driveState, 'unavailable');
  assert.notEqual(a.assist.reason, 'drive-unavailable');
});
