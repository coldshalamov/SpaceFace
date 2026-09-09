// Travel Burn latch + burn instrumentation (atlas W1-5 / W1-6 / W1-9, ADR D5).
//
// This suite deliberately DRIVES the real systems rather than asserting on shapes:
//   * the latch is stepped through `input.update(dt, state)` — the production entry point;
//   * the kernel round trip is proven by actually running `stepPropulsion` in a loop and showing
//     the ship reaches its ceiling, WITH a control run that omits the feedback and stalls;
//   * the flightV3 forwarding is proven by invoking `applyMasslineFlightModifiers`.
// Gate defect G-2 in the ledger exists because an import-only smoke test once declared an
// unplayable game healthy: `import()` resolved while `stepPropulsion` threw on every tick. So
// nothing here is satisfied by a module merely loading.

import test from 'node:test';
import assert from 'node:assert/strict';

import { input, DEFAULTS } from '../src/systems/input.js';
import { applyMasslineFlightModifiers } from '../src/systems/flightV3.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import {
  createPropulsionRuntime,
  stepPropulsion,
  resolveTravelCeiling,
  TRAVEL_DRIVE_STATES,
} from '../src/core/flight/propulsionKernel.js';
import { getPropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { evaluateArrivalCue } from '../src/core/flight/flightTelemetry.js';

const DT = 1 / 60;

// ---- harness ----------------------------------------------------------------------------------

function makeState(overrides = {}) {
  const player = { id: 'p', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0 };
  return {
    mode: 'flight',
    playerId: 'p',
    simTime: 0,
    ui: { screenStack: [] },
    settings: {},
    nav: {},
    player: {},
    entities: { get: (id) => (id === 'p' ? player : null) },
    input: {
      actions: {},
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
      autoFire: false,
    },
    ...overrides,
  };
}

/** A live `input` system instance without touching init() (which wants a DOM). */
function makeInput() {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host._lastKbmMs = 0;
  host.helpers = { raycastToPlane: () => ({ x: 0, z: 0 }) };
  host.bus = { emit() {} };
  host.gamepad = null;
  host.touch = null;
  return host;
}

/**
 * Press and release a key across two ticks so the edge detector sees a rising edge.
 *
 * The trailing released tick is load-bearing: `edge()` latches `edges[action]` while held, so two
 * taps with no released tick between them produce exactly ONE rising edge and the second press is
 * silently swallowed.
 */
function tapKey(host, state, code, dt = DT) {
  host._keys[code] = true;
  host.update(dt, state);
  host._keys[code] = false;
  host.update(dt, state);
}

function runTicks(host, state, seconds, dt = DT) {
  for (let i = 0; i < Math.round(seconds / dt); i++) host.update(dt, state);
}

function withFlag(on, fn) {
  const prev = TRAVEL_FLAGS.travelBurn;
  TRAVEL_FLAGS.travelBurn = on;
  try { return fn(); } finally { TRAVEL_FLAGS.travelBurn = prev; }
}

// ---- bindings ---------------------------------------------------------------------------------

test('W1-5: the latch is bound to Num Lock by default, with a laptop fallback in the same array', () => {
  const b = DEFAULTS.BINDINGS.travelBurn;
  assert.ok(Array.isArray(b), 'travelBurn must be a rebindable binding array');
  assert.equal(b[0], 'NumLock', 'Num Lock is the authored default (ADR D5)');
  assert.ok(b.length > 1, 'a laptop fallback must ship — many laptops have no Num Lock key');
  // Extending the EXISTING multi-code idiom (as WASD-and-arrows already does), not a parallel
  // laptop binding scheme.
  assert.ok(b.includes('KeyH'));
});

test('W1-5: the latch binding is present in every control scheme and collides with nothing', () => {
  for (const [name, scheme] of Object.entries(DEFAULTS.SCHEMES)) {
    assert.ok(Array.isArray(scheme.travelBurn) && scheme.travelBurn.length,
      `scheme ${name} must carry the travel-burn latch`);
    // No other action in the same scheme may claim either code.
    for (const [action, codes] of Object.entries(scheme)) {
      if (action === 'travelBurn' || !Array.isArray(codes)) continue;
      for (const code of scheme.travelBurn) {
        assert.ok(!codes.includes(code), `${name}.${action} collides with travelBurn on ${code}`);
      }
    }
  }
});

// ---- the state machine ------------------------------------------------------------------------

test('W1-5: off -> spooling -> engaged, then a second press disengages into cooldown', () => {
  withFlag(true, () => {
    const host = makeInput();
    const state = makeState();

    host.update(DT, state);
    assert.equal(state.input.travelDrive.state, 'off');

    tapKey(host, state, 'NumLock');
    assert.equal(state.input.travelDrive.state, 'spooling', 'a press arms the spool');

    runTicks(host, state, 2.0);
    assert.equal(state.input.travelDrive.state, 'engaged', 'the spool completes into engaged');

    tapKey(host, state, 'NumLock');
    assert.equal(state.input.travelDrive.state, 'cooldown', 'a deliberate disengage costs cooldown');

    runTicks(host, state, 4.0);
    assert.equal(state.input.travelDrive.state, 'off', 'cooldown expires back to off');
  });
});

test('W1-5/PQ-003: new-profile Space is Massline, while reverse remains the deliberate burn brake', () => {
  withFlag(true, () => {
    const host = makeInput();
    const state = makeState();
    tapKey(host, state, 'NumLock');
    runTicks(host, state, 2.0);
    assert.equal(state.input.travelDrive.state, 'engaged');

    // Space is the new-profile Massline action and cannot silently brake the Travel Burn.
    host._keys.Space = true;
    host.update(DT, state);
    assert.equal(state.input.travelDrive.state, 'engaged');
    host._keys.Space = false;
    host.update(DT, state);

    host._keys.KeyS = true;
    host.update(DT, state);
    assert.equal(state.input.travelDrive.state, 'cooldown');
    assert.equal(state.input.travelDrive.breakReason, 'brake');
  });
});

test('PQ-003: a migrated legacy profile keeps Space brake and F-primary Massline', () => {
  withFlag(true, () => {
    const host = makeInput();
    const state = makeState({
      settings: {
        gameplay: { controlScheme: 'pilot' },
        controls: {
          masslineBindingProfile: 'legacy-f-v1',
          bindings: { tether: ['KeyF'], brake: ['Space'] },
        },
      },
    });
    tapKey(host, state, 'NumLock');
    runTicks(host, state, 2.0);
    host._keys.Space = true;
    host.update(DT, state);
    assert.equal(state.input.travelDrive.state, 'cooldown');
    assert.equal(state.input.travelDrive.breakReason, 'brake');
  });
});

test('PQ-003: the line-control threshold arbitrates pay-out before Travel Burn reads brake intent', () => {
  withFlag(true, () => {
    const host = makeInput();
    const state = makeState();
    tapKey(host, state, 'NumLock');
    runTicks(host, state, 2.0);
    assert.equal(state.input.travelDrive.state, 'engaged');

    state.player.tether = { active: true, targetId: 'rock' };
    host._keys.Space = true;
    runTicks(host, state, 9);
    host._keys.ArrowDown = true;
    host.update(DT, state);

    assert.equal(state.input.actions.massline.lineControl, true);
    assert.equal(state.input.actions.massline.payOut, 1);
    assert.equal(state.input.travelDrive.state, 'engaged', 'pay-out is not also a Travel Burn brake');
  });
});

test('W1-5: STEERING DOES NOT BREAK THE LATCH — the asymmetry is the feel of the feature', () => {
  withFlag(true, () => {
    const host = makeInput();
    const state = makeState();
    tapKey(host, state, 'NumLock');
    runTicks(host, state, 2.0);
    assert.equal(state.input.travelDrive.state, 'engaged');

    // Yaw hard, both directions, plus explicit strafe, for a full second.
    host._keys.KeyA = true;
    runTicks(host, state, 0.5);
    host._keys.KeyA = false;
    host._keys.KeyD = true;
    runTicks(host, state, 0.5);
    host._keys.KeyD = false;
    host._keys.KeyQ = true;
    runTicks(host, state, 0.5);
    host._keys.KeyQ = false;
    runTicks(host, state, 0.2);

    assert.equal(state.input.travelDrive.state, 'engaged',
      'steering and strafing must never break a burn');
  });
});

test('W1-5: forward throttle does not break the latch, but reverse throttle does', () => {
  withFlag(true, () => {
    const host = makeInput();
    const state = makeState();
    tapKey(host, state, 'NumLock');
    runTicks(host, state, 2.0);

    host._keys.KeyW = true;
    runTicks(host, state, 0.5);
    assert.equal(state.input.travelDrive.state, 'engaged', 'thrusting forward is not braking');
    host._keys.KeyW = false;

    host._keys.KeyS = true;      // reverse — a deliberate deceleration
    host.update(DT, state);
    assert.equal(state.input.travelDrive.state, 'cooldown');
  });
});

test('W1-5: cancelling a SPOOL costs no cooldown — only breaking a live burn is punished', () => {
  withFlag(true, () => {
    const host = makeInput();
    const state = makeState();
    tapKey(host, state, 'NumLock');
    assert.equal(state.input.travelDrive.state, 'spooling');
    tapKey(host, state, 'NumLock');
    assert.equal(state.input.travelDrive.state, 'off');
    assert.equal(state.input.travelDrive.breakReason, 'cancelled');
  });
});

test('W1-5: damage / lane disruption forces cooldown — the interdiction hook', () => {
  withFlag(true, () => {
    const host = makeInput();
    const state = makeState();
    tapKey(host, state, 'NumLock');
    runTicks(host, state, 2.0);
    assert.equal(state.input.travelDrive.state, 'engaged');

    // The seam a disruptor writes. Nothing in the shipped game triggers this yet (D8's lane
    // prototype and the damage path are the intended writers) — the wiring is what is pinned here.
    state.player.travelDrive = { disruptRequest: true };
    host.update(DT, state);
    assert.equal(state.input.travelDrive.state, 'cooldown');
    assert.equal(state.input.travelDrive.breakReason, 'disrupted');
    assert.equal(state.player.travelDrive.disruptRequest, false, 'a one-shot request is consumed');
  });
});

test('W1-5: a held disruption pins the drive down instead of letting cooldown run out under it', () => {
  withFlag(true, () => {
    const host = makeInput();
    const state = makeState();
    state.player.travelDrive = { disrupted: true };
    tapKey(host, state, 'NumLock');
    runTicks(host, state, 8.0);
    assert.equal(state.input.travelDrive.state, 'cooldown', 'cannot re-engage while held down');

    state.player.travelDrive.disrupted = false;
    runTicks(host, state, 4.0);
    assert.equal(state.input.travelDrive.state, 'off', 'releases once the disruption clears');
  });
});

test('W1-5: docking or opening a screen drops the drive', () => {
  withFlag(true, () => {
    const host = makeInput();
    const state = makeState();
    tapKey(host, state, 'NumLock');
    runTicks(host, state, 2.0);
    assert.equal(state.input.travelDrive.state, 'engaged');

    state.ui.screenStack.push('station');
    host.update(DT, state);
    assert.equal(state.input.travelDrive.state, 'off');
  });
});

test('golden safety: with the flag off the latch writes NOTHING', () => {
  withFlag(false, () => {
    const host = makeInput();
    const state = makeState();
    tapKey(host, state, 'NumLock');
    runTicks(host, state, 3.0);
    assert.equal(state.input.travelDrive, undefined,
      'flag off must leave no key on state.input — node runs the sim goldens');
    assert.equal(state.input.actions.travelBurn, false);
  });
});

test('every published latch state is a member of the kernel-exported enum', () => {
  withFlag(true, () => {
    const host = makeInput();
    const state = makeState();
    const seen = new Set();
    tapKey(host, state, 'NumLock');
    for (let i = 0; i < 400; i++) {
      if (i === 150) host._keys.KeyS = true;
      if (i === 152) host._keys.KeyS = false;
      host.update(DT, state);
      seen.add(state.input.travelDrive.state);
    }
    for (const s of seen) assert.ok(TRAVEL_DRIVE_STATES.includes(s), `unknown drive state ${s}`);
    assert.ok(seen.has('spooling') && seen.has('engaged') && seen.has('cooldown'));
  });
});

// ---- the consumer seam: does the axis actually reach the kernel? --------------------------------

test('W1-1 wiring: flightV3 forwards state.input.travelDrive into the kernel input', () => {
  withFlag(true, () => {
    const state = makeState();
    state.input.travelDrive = { state: 'engaged', cap: 123, rampMult: 1 };
    const kernelInput = applyMasslineFlightModifiers({ throttle: 1 }, state, 0, 0);
    assert.ok(kernelInput.travelDrive, 'the kernel input must carry the drive block');
    assert.equal(kernelInput.travelDrive.state, 'engaged');
    assert.equal(kernelInput.travelDrive.cap, 123);
  });
});

test('golden safety: with the flag off flightV3 attaches no travelDrive key', () => {
  withFlag(false, () => {
    const state = makeState();
    state.input.travelDrive = { state: 'engaged', cap: 123 };
    const kernelInput = applyMasslineFlightModifiers({ throttle: 1 }, state, 0, 0);
    assert.equal('travelDrive' in kernelInput, false);
  });
});

/** Fly a drive at full throttle for `seconds`, optionally feeding the published cap back. */
function flyBurn(profile, { feedback, seconds = 30 }) {
  const runtime = createPropulsionRuntime(profile);
  const body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass: 100, inertia: 100, radius: 5 };
  let carried = { state: 'engaged', cap: 0, rampMult: 1 };
  let last = null;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    last = stepPropulsion({
      dt: DT, body,
      input: { throttle: 1, assistMode: 'assisted', travelDrive: carried },
      profile, runtime,
    });
    body.vel.x += (last.force.x / body.mass) * DT;
    body.vel.z += (last.force.z / body.mass) * DT;
    const sp = Math.hypot(body.vel.x, body.vel.z);
    if (Number.isFinite(last.maxSpeed) && sp > last.maxSpeed) {
      body.vel.x *= last.maxSpeed / sp; body.vel.z *= last.maxSpeed / sp;
    }
    body.pos.x += body.vel.x * DT; body.pos.z += body.vel.z * DT;
    // THE CARRIED-CAP ROUND TRIP. Omitting it is the control condition.
    carried = { state: 'engaged', cap: feedback ? last.telemetry.travelCap : 0, rampMult: 1 };
  }
  return { speed: Math.hypot(body.vel.x, body.vel.z), telemetry: last.telemetry };
}

test('W1-2: the carried-cap round trip is what ramps the ship to its ceiling', () => {
  withFlag(true, () => {
    const profile = getPropulsionProfile('drive_reaction_m');
    const ceiling = resolveTravelCeiling(profile);

    const withFeedback = flyBurn(profile, { feedback: true });
    assert.ok(withFeedback.speed > ceiling * 0.95,
      `expected to approach ${ceiling}, reached ${withFeedback.speed.toFixed(1)}`);
    assert.ok(withFeedback.speed <= ceiling + 1e-6, 'and never to exceed it');

    // CONTROL: identical run, feedback withheld. If this also reached the ceiling the test above
    // would be proving nothing about the round trip.
    const noFeedback = flyBurn(profile, { feedback: false });
    assert.ok(noFeedback.speed < ceiling * 0.6,
      `without feedback the ramp must stall, got ${noFeedback.speed.toFixed(1)}`);
  });
});

test('W1-6: the ceiling is per-family and TORCH clears every REACTION drive (D5 ship identity)', () => {
  const torch = resolveTravelCeiling(getPropulsionProfile('drive_torch_l'));
  const reaction = ['drive_reaction_s', 'drive_reaction_m', 'drive_reaction_l']
    .map((id) => resolveTravelCeiling(getPropulsionProfile(id)));
  assert.equal(Math.round(torch), 1120, 'measured value recorded in the D5 amendment');
  for (const r of reaction) assert.ok(torch > r * 2, `TORCH ${torch} must clear REACTION ${r} decisively`);
  // The absolute engineering bound holds for every drive in the catalogue.
  for (const id of ['drive_torch_l', 'drive_pulse_plate_m', 'drive_field_sail_m']) {
    assert.ok(resolveTravelCeiling(getPropulsionProfile(id)) <= 1200);
  }
});

// ---- W1-9: the arrival cue ----------------------------------------------------------------------

test('W1-9: BRAKE NOW fires when the stopping solution reaches the arrival radius', () => {
  const profile = getPropulsionProfile('drive_reaction_m');
  const arrival = { x: 4000, z: 0, radius: 40 };
  // Far away and slow: no cue.
  const far = evaluateArrivalCue(
    { pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 }, rot: 0 }, profile, arrival);
  assert.equal(far.brakeNow, false);
  assert.ok(far.margin > 0);

  // Close enough that the stop distance has eaten the remaining gap.
  const stopDist = far.stopDistance;
  const near = evaluateArrivalCue(
    { pos: { x: arrival.x - arrival.radius - stopDist * 0.5, z: 0 }, vel: { x: 40, z: 0 }, rot: 0 },
    profile, arrival);
  assert.equal(near.brakeNow, true, 'the cue must fire at the last free stop');
  assert.ok(near.timeToBrakeS <= 0);
});

test('W1-9: overshoot is reported, never prevented — the cue is advisory only (D9.8)', () => {
  const profile = getPropulsionProfile('drive_reaction_m');
  const arrival = { x: 500, z: 0, radius: 40 };
  const cue = evaluateArrivalCue(
    { pos: { x: 0, z: 0 }, vel: { x: 400, z: 0 }, rot: 0 }, profile, arrival);
  assert.equal(cue.overshoot, true, 'blowing through at 400 WU/s must be reported as overshoot');
  assert.equal(cue.brakeNow, true);
  // The contract that matters: the solver returns a READOUT and nothing that could be mistaken for
  // a control output. Overshoot must remain possible in manual flight.
  for (const key of ['brake', 'throttle', 'input', 'command', 'apply']) {
    assert.equal(key in cue, false, `evaluateArrivalCue must not emit control output (${key})`);
  }
});

test('W1-9: a target the ship is not closing on raises no cue (no alarm fatigue)', () => {
  const profile = getPropulsionProfile('drive_reaction_m');
  // Flying directly AWAY from the arrival point.
  const cue = evaluateArrivalCue(
    { pos: { x: 0, z: 0 }, vel: { x: -300, z: 0 }, rot: Math.PI },
    profile, { x: 500, z: 0, radius: 40 });
  assert.equal(cue.closing, false);
  assert.equal(cue.brakeNow, false);
  assert.equal(cue.active, false);
});

test('W1-9: with no arrival target the cue is inert rather than throwing', () => {
  const profile = getPropulsionProfile('drive_reaction_m');
  const cue = evaluateArrivalCue({ pos: { x: 0, z: 0 }, vel: { x: 300, z: 0 }, rot: 0 }, profile, null);
  assert.equal(cue.active, false);
  assert.equal(cue.brakeNow, false);
});
