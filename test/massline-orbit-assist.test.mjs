import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as flightV3Module from '../src/systems/flightV3.js';
import {
  ORBIT_ASSIST_ENGAGE_V1,
  ORBIT_ASSIST_TUNING_V1,
  ORBIT_SWING_TRACK_MARGIN,
  orbitSwingThrottleScale,
} from '../src/core/flight/orbitAssist.js';
import * as masslineLab from '../scripts/lib/masslineControlLab.mjs';
import { createGameState } from '../src/core/gameState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { masslineTetherStatus } from '../src/ui/hud.js';

const DT = 1 / 60;

test('new games default to Standard orbit steering and expose an Off switch', () => {
  const state = createGameState(47);
  assert.equal(state.settings.gameplay.orbitAssistStrength, 'standard');
  const source = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  assert.match(source, /rowSelect\('Massline orbit assist',[\s\S]*orbitAssistStrength[\s\S]*\['full', 'Full'\][\s\S]*\['standard', 'Standard'\][\s\S]*\['light', 'Light'\][\s\S]*\['off', 'Off'\]/);
});

test('orbit steering stays invisible in the player-facing tether HUD', () => {
  const status = masslineTetherStatus({
    active: true,
    phase: 'loaded',
    strain: 0.7,
    automaticBreakAllowed: false,
  }, true);
  assert.equal(status.text, 'LOADED');
  const source = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /['"`]ORBIT ASSIST['"`]/);
});

test('orbit steering changes only yaw and derives its rate from live relative motion', () => {
  const input = {
    throttle: 0.72,
    strafe: 0.25,
    turn: 1,
    boost: true,
    brake: false,
    aimAngle: -0.4,
  };
  const result = orbitStep({
    radius: 120,
    tangentialSpeed: 120,
    hostRot: Math.PI / 2,
    input,
  });

  assert.equal(result.active, true);
  assert.equal(result.input.throttle, input.throttle);
  assert.equal(result.input.strafe, input.strafe);
  assert.equal(result.input.boost, input.boost);
  assert.equal(result.input.brake, input.brake);
  assert.equal(result.input.aimAngle, input.aimAngle);
  assert.equal(Object.hasOwn(result, 'impulse'), false, 'the yaw helper has no linear-force output');
  assert.ok(Math.abs(result.telemetry.orbitalYawRate - 1) < 1e-12);
  assert.ok(Math.abs(result.input.turn - 0.5) < 1e-12,
    'a 1 rad/s orbit on a 2 rad/s ship requests exactly half turn');
});

test('the requested turn rate scales with swing speed and inverse line radius', () => {
  const slowLong = orbitStep({ radius: 120, tangentialSpeed: 30, hostRot: Math.PI / 2 });
  const fastLong = orbitStep({ radius: 120, tangentialSpeed: 60, hostRot: Math.PI / 2 });
  const fastShort = orbitStep({ radius: 60, tangentialSpeed: 60, hostRot: Math.PI / 2 });

  assert.ok(Math.abs(fastLong.telemetry.orbitalYawRate - slowLong.telemetry.orbitalYawRate * 2) < 1e-12);
  assert.ok(Math.abs(fastShort.telemetry.orbitalYawRate - fastLong.telemetry.orbitalYawRate * 2) < 1e-12);
});

test('a radial-facing nose on a live swing trims onto the tangent the bounded, short way', () => {
  // The pilot holds the orbit chord and the line is really swinging: heading error is a bounded
  // correction added to the feed-forward, never a drop back to manual and never a snap capture.
  assert.equal(ORBIT_ASSIST_TUNING_V1.tangentAlignTimeS, 0.55);
  assert.equal(ORBIT_ASSIST_TUNING_V1.maxHeadingCorrectionRateFraction, 0.25);

  const arming = orbitStep({
    radius: 220, tangentialSpeed: 60, hostRot: 0, anchorAhead: true,
    engage: { chordT: 0, graceT: 0, direction: 0 },
  });
  assert.equal(arming.active, false);
  assert.equal(arming.telemetry.reason, 'arming',
    'a fresh chord arms first: the swing is real, the intent dwell is still counting');
  assert.equal(arming.input.turn, 1, 'while arming the raw key is untouched');

  const long = orbitStep({ radius: 220, tangentialSpeed: 60, hostRot: 0, anchorAhead: true });
  const short = orbitStep({ radius: 72, tangentialSpeed: 60, hostRot: 0, anchorAhead: true });
  for (const result of [long, short]) {
    assert.equal(result.active, true);
    assert.equal(Math.abs(result.telemetry.headingError), Math.PI / 2,
      'a radial-facing nose reads a quarter-turn off the tangent');
    assert.equal(Math.abs(result.telemetry.alignmentYawRate),
      result.telemetry.hullMaxYawRate * ORBIT_ASSIST_TUNING_V1.maxHeadingCorrectionRateFraction,
      'the proportional bridge saturates at the takeover bound, never a snap');
    assert.equal(Math.sign(result.telemetry.alignmentYawRate),
      Math.sign(result.telemetry.headingError),
      'the correction turns the shortest way onto the tangent');
    assert.equal(result.telemetry.headingDirectionCommitted, false);
  }
  assert.ok(Math.abs(short.telemetry.orbitalYawRate) > Math.abs(long.telemetry.orbitalYawRate),
    'the 72 WU swing keeps the stronger inverse-radius feed-forward');

  // On-tangent the bridge contributes nothing and the request is exactly the orbital rate.
  const onTangent = orbitStep({ radius: 120, tangentialSpeed: 30, hostRot: Math.PI / 2 });
  assert.ok(Math.abs(onTangent.telemetry.alignmentYawRate) < 1e-12,
    'the proportional bridge is zero on the tangent');
  assert.ok(Math.abs(onTangent.telemetry.desiredYawRate - onTangent.telemetry.orbitalYawRate) < 1e-12,
    'holding the orbit chord requests the exact inverse-radius angular velocity');
});

test('R2 signed heading offsets preserve feed-forward; releasing turn carries the swing and releasing thrust allows manual yaw', () => {
  const tangentHeading = -Math.PI / 2;
  for (const offset of [-0.1, 0.1]) {
    const long = orbitStep({
      radius: 220,
      tangentialSpeed: 60,
      hostRot: tangentHeading + offset,
      anchorAhead: true,
    });
    const short = orbitStep({
      radius: 72,
      tangentialSpeed: 60,
      hostRot: tangentHeading + offset,
      anchorAhead: true,
    });
    assert.equal(Math.sign(long.telemetry.alignmentYawRate), -Math.sign(offset));
    assert.equal(Math.sign(short.telemetry.alignmentYawRate), -Math.sign(offset));
    assert.equal(long.telemetry.headingDirectionCommitted, false,
      'inside the tangent capture cone, signed error keeps shortest-path trimming');
    assert.equal(short.telemetry.headingDirectionCommitted, false,
      'inside the tangent capture cone, signed error keeps shortest-path trimming');
    assert.ok(Math.abs(short.telemetry.orbitalYawRate) > Math.abs(long.telemetry.orbitalYawRate),
      'heading correction never replaces inverse-radius orbital feed-forward');
  }

  const raw = { throttle: 0.8, strafe: 0.2, turn: 0.65, boost: false, brake: false };
  const noForward = orbitStep({
    radius: 72, tangentialSpeed: 60, hostRot: 0, anchorAhead: true,
    input: raw, forward: 0, lateral: 1,
  });
  const noTurn = orbitStep({
    radius: 72, tangentialSpeed: 60, hostRot: 0, anchorAhead: true,
    input: { ...raw, turn: 0 }, forward: 1, lateral: 0,
  });
  assert.equal(noForward.active, false, 'turn without thrust belongs to the pilot');
  assert.deepEqual(noForward.input, raw);
  assert.equal(noTurn.active, true);
  assert.equal(noTurn.telemetry.carry, true, 'releasing turn still carries the swing');
  assert.equal(noTurn.input.throttle, raw.throttle, 'thrust is untouched');
});

test('R2 heading recovery is symmetric across direction, strength, angle wrap, and offset', () => {
  const radialByDirection = new Map();
  for (const direction of [-1, 1]) {
    const result = orbitStep({
      radius: 72,
      tangentialSpeed: 60,
      hostRot: 0,
      anchorAhead: true,
      lateral: direction,
      engage: { chordT: 0, graceT: 0, direction: 0 },
    });
    radialByDirection.set(direction, result);
    assert.equal(result.telemetry.selectedDirection, direction);
    assert.equal(Math.sign(result.telemetry.orbitalYawRate), direction);
    assert.equal(result.active, false);
    assert.equal(result.telemetry.reason, 'arming', 'a fresh chord arms before it steers');
    assert.equal(result.telemetry.alignmentYawRate, 0, 'an arming chord applies no correction');
    assert.equal(result.telemetry.headingDirectionCommitted, false);
    assert.ok(Math.abs(result.telemetry.headingError) <= Math.PI + 1e-12,
      'the reported error is always the wrapped short way');
  }
  assert.equal(
    Math.abs(radialByDirection.get(-1).telemetry.desiredYawRate),
    Math.abs(radialByDirection.get(1).telemetry.desiredYawRate),
    'left and right orbit chords are mirror-equivalent',
  );

  const strengthResults = new Map(['light', 'standard', 'full'].map((strength) => [
    strength,
    orbitStep({
      radius: 220,
      tangentialSpeed: 60,
      hostRot: -Math.PI / 2 + 0.04,
      anchorAhead: true,
      strength,
    }),
  ]));
  assert.equal(
    Math.abs(strengthResults.get('light').telemetry.alignmentYawRate) * 2,
    Math.abs(strengthResults.get('standard').telemetry.alignmentYawRate),
    'Light keeps exactly half the Standard heading correction',
  );
  assert.equal(
    strengthResults.get('standard').telemetry.alignmentYawRate,
    strengthResults.get('full').telemetry.alignmentYawRate,
    'the accepted Full and Standard profiles retain their current equal strength',
  );
  assert.equal(
    strengthResults.get('light').telemetry.orbitalYawRate,
    strengthResults.get('full').telemetry.orbitalYawRate,
    'assist strength never scales the physical inverse-radius feed-forward term',
  );

  const positivePi = orbitStep({ anchorAhead: true, hostRot: Math.PI - 0.2 });
  const negativePi = orbitStep({ anchorAhead: true, hostRot: -Math.PI - 0.2 });
  for (const field of ['shortestHeadingError', 'headingError', 'alignmentYawRate', 'desiredYawRate']) {
    assert.ok(Math.abs(positivePi.telemetry[field] - negativePi.telemetry[field]) < 1e-12,
      `${field} is equivalent across the +/-pi representation wrap`);
  }

  for (const direction of [-1, 1]) {
    const desiredHeading = direction > 0 ? -Math.PI / 2 : Math.PI / 2;
    const near = orbitStep({
      anchorAhead: true,
      lateral: direction,
      hostRot: desiredHeading + direction * 0.05,
    });
    assert.equal(near.active, true);
    assert.equal(near.telemetry.headingDirectionCommitted, false);
    assert.equal(Math.sign(near.telemetry.headingError), -direction,
      `${direction}: a small offset trims toward the tangent`);
    assert.equal(Math.sign(near.telemetry.alignmentYawRate), Math.sign(near.telemetry.headingError),
      `${direction}: the proportional bridge follows the shortest heading error`);
    const opposite = orbitStep({
      anchorAhead: true,
      lateral: direction,
      hostRot: desiredHeading + Math.PI - 0.05,
    });
    assert.equal(opposite.active, false,
      'a near-opposite nose on a live swing is a heading takeover the assist must refuse: '
      + 'the pilot noses into the forward half first, then the assist holds the spin');
    assert.equal(opposite.telemetry.reason, 'off-tangent',
      `${direction}: a backwards-facing hull reads as off-tangent, never a capture`);
    assert.equal(opposite.telemetry.alignmentYawRate, 0,
      `${direction}: a refused capture applies no correction`);
    assert.ok(Math.abs(opposite.telemetry.headingError)
      > ORBIT_ASSIST_ENGAGE_V1.captureHalfAngleRad,
      `${direction}: the gate reads the wrapped shortest-way error`);
    assert.equal(opposite.telemetry.headingDirectionCommitted, false);
    assert.ok(Math.abs(opposite.telemetry.headingError) <= Math.PI + 1e-12);

    // Just inside the forward half the same swing still captures: the gate is a half-plane,
    // not a cone that narrows as the swing speeds up.
    const inside = orbitStep({
      anchorAhead: true,
      lateral: direction,
      hostRot: desiredHeading + Math.PI / 2 - 0.05,
    });
    assert.equal(inside.active, true,
      `${direction}: a nose inside the tangent's forward half still engages`);
  }
});

test('aim steering: cursor noise never arms, a pull-away yank escapes, parked opposition cannot fake it', () => {
  // Ship at +x orbiting +z around the anchor: orbital rate 0.25 rad/s, direction +1, nose
  // already on the tangent. flightIntent.lateralFromAim models the helm cursor's
  // proportional intent — almost never exactly zero, so a deadband-parked cursor must not
  // count as holding the orbit chord's turn direction.
  const base = () => ({
    dt: DT,
    host: { pos: { x: 120, z: 0 }, vel: { x: 0, z: 30 }, rot: Math.PI / 2, angVel: 0, mass: 20, radius: 10 },
    anchor: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 2000, radius: 20 },
    tether: { active: true, targetId: 'anchor', restLength: 120, phase: 'loaded' },
    flightIntent: { forward: 1, lateral: 1, lateralFromAim: true, aimAngle: 0.4 },
    engage: null,
    input: { throttle: 1, strafe: 0, turn: 1, boost: false, brake: false },
    profile: { mainAccel: 50, maxYawRate: 2, yawAccel: 6 },
    strength: 'standard',
  });
  const aimIntent = (lateral, aimAngle) => ({ forward: 1, lateral, lateralFromAim: true, aimAngle });
  const runTicks = (steps, initialEngage = null) => {
    const out = [];
    let engage = initialEngage;
    for (const over of steps) {
      const opts = base();
      Object.assign(opts, over);
      opts.engage = engage;
      const r = flightV3Module.stepAnchorRelativeOrbitAssist(opts);
      out.push(r);
      engage = r.telemetry.engage;
    }
    return out;
  };

  // Deadband noise on a parked cursor (|lateral| below the deliberate-aim floor) can sit at a
  // nonzero sign forever: the dwell never accrues and the assist never captures.
  const noise = runTicks(Array.from({ length: 40 }, () => ({
    flightIntent: aimIntent(0.1, 0.4),
  })));
  assert.ok(noise.every((r) => r.active === false),
    'cursor noise near the nose must never capture yaw');
  assert.ok(noise.every((r) => r.telemetry.engage.chordT === 0),
    'aim noise must not accrue the orbit dwell');

  // A genuine off-nose aim is the deliberate gesture: the dwell fills and the assist engages.
  const held = runTicks(Array.from({ length: 40 }, () => ({
    flightIntent: aimIntent(1, 0.4),
  })));
  assert.equal(held[0].active, false, 'even a deliberate gesture arms through the dwell first');
  const engagedIdx = held.findIndex((r) => r.active);
  assert.ok(engagedIdx >= 23 && engagedIdx < 40,
    `a held off-nose aim engages after the dwell (first active at ${engagedIdx})`);

  // Once engaged, a cursor SWEPT against the swing is the one unambiguous give-me-the-helm
  // signal — the assist drops and stays out for the escape window even though the swing,
  // the heading, and the chord all still qualify.
  const sweep = runTicks([
    ...Array.from({ length: 30 }, () => ({ flightIntent: aimIntent(1, 0.4) })),
    ...Array.from({ length: 12 }, (_, i) => ({
      flightIntent: aimIntent(1, 0.4 - 0.03 * (i + 1)),
    })),
    ...Array.from({ length: 100 }, () => ({
      flightIntent: aimIntent(1, 0.4 - 0.03 * 12),
    })),
  ]);
  const escapeIdx = sweep.findIndex((r) => r.telemetry.reason === 'pilot-escape');
  assert.ok(escapeIdx >= 30 && escapeIdx < 42,
    `a counter-swing cursor drops the assist inside the yank window (first at ${escapeIdx})`);
  assert.ok(sweep[escapeIdx].telemetry.engage.escapeT > 0.5,
    'the escape arms a hold-out so the ship does not re-grab the next tick');
  assert.ok(sweep.slice(escapeIdx + 1, escapeIdx + 50).every((r) => r.active === false),
    'the escape window keeps yaw manual with the cursor parked afterwards');
  assert.equal(sweep.at(-1).active, true,
    'a still-held deliberate gesture re-arms the assist after the escape and dwell pass');

  // The flicker case in reverse: a cursor parked pointing the wrong way (opposing sign, zero
  // motion) must never read as a reversal — its sign sweeps behind the hull every orbit.
  const parked = runTicks(
    Array.from({ length: 90 }, () => ({ flightIntent: aimIntent(-1, 0.4) })),
    { chordT: 5, graceT: 0, direction: 0 },
  );
  assert.equal(parked.at(-1).active, true,
    'a parked cursor on the wrong side cannot redirect or drop a live swing');
  assert.ok(parked.every((r) => (r.telemetry.engage.counterT ?? 0) === 0),
    'a motionless cursor never accrues pull-away');

  // A swing-drive commit is itself the deliberate gesture: it still yaws onto the tangent
  // from any heading, bypassing the entry half-plane a bare chord must respect.
  const commit = flightV3Module.stepAnchorRelativeOrbitAssist({
    ...base(),
    host: { pos: { x: 120, z: 0 }, vel: { x: 0, z: 30 }, rot: Math.PI / 2 + Math.PI - 0.05, angVel: 0, mass: 20, radius: 10 },
    flightIntent: { forward: 1, lateral: 0, lateralFromAim: false, aimAngle: null },
    commitDirection: 1,
    engage: { chordT: 0, graceT: 0, direction: 0 },
  });
  assert.equal(commit.active, true,
    'a swing-drive commitment still captures from a whipped heading');
  assert.equal(commit.telemetry.intentSource, 'swing-drive');
});

test('only Off (or a brake / blocked controls) returns raw steering on a tether', () => {
  const input = { throttle: 0.6, strafe: 0.2, turn: 0.8, boost: false, brake: false };
  const off = orbitStep({ input, forward: 1, lateral: 1, strength: 'off' });
  const braking = orbitStep({ input: { ...input, brake: true }, forward: 1, lateral: 1 });
  for (const result of [off, braking]) {
    assert.equal(result.active, false);
    assert.equal(result.input.turn, input.turn, 'raw steering is untouched');
    assert.equal(Object.hasOwn(result, 'impulse'), false);
  }
});

test('a loaded swing carries the hull round with no keys held', () => {
  // orbitStep: host at +x moving +z at 80 WU/s on a 120 WU radius -> orbital rate 80/120 rad/s.
  const idle = { throttle: 0, strafe: 0, turn: 0, boost: false, brake: false };
  const carried = orbitStep({ input: idle, forward: 0, lateral: 0, tangentialSpeed: 80 });
  assert.equal(carried.active, true);
  assert.equal(carried.telemetry.carry, true);
  const hullMax = carried.telemetry.hullMaxYawRate;
  assert.ok(Math.abs(carried.input.turn * carried.telemetry.maxYawRate - 80 / 120) < 1e-9,
    'the turn command is exactly the orbital rate: perfect angular velocity');
  assert.ok(hullMax > 0);

  // Forward alone (turn key released) is carried the same way.
  const fwd = orbitStep({ input: { ...idle, throttle: 1 }, forward: 1, lateral: 0, tangentialSpeed: 80 });
  assert.equal(fwd.telemetry.carry, true);

  // Manual steering takes ownership rather than adding the line's rotation to the held key.
  const steered = orbitStep({ input: { ...idle, turn: 0.5 }, forward: 0, lateral: 0, tangentialSpeed: 80 });
  assert.equal(steered.active, false);
  assert.equal(steered.input.turn, 0.5);

  // A slack line is not a swing: nothing is carried.
  const slack = orbitStep({ input: idle, forward: 0, lateral: 0, tangentialSpeed: 80, phase: 'slack' });
  assert.equal(slack.active, false);
});

test('the pilot carve chord (forward plus a small turn intent) still orbits at the exact rate', () => {
  // Any non-zero lateral chord requests the same inverse-radius yaw as a full turn.
  // Pilot no longer emits a 0.35 blend under thrust; a partial chord must still engage.
  const full = orbitStep({ radius: 120, tangentialSpeed: 30, hostRot: Math.PI / 2, lateral: 1 });
  const carve = orbitStep({ radius: 120, tangentialSpeed: 30, hostRot: Math.PI / 2, lateral: 0.35 });
  assert.equal(carve.active, true);
  assert.ok(Math.abs(carve.telemetry.orbitalYawRate - 0.25) < 1e-12);
  assert.equal(carve.input.turn, full.input.turn);
});

test('slack, loaded and overload phases do not change thrust, speed policy, or steering rules', () => {
  const input = { throttle: 0.63, strafe: -0.2, turn: 1, boost: true, brake: false };
  const results = ['slack', 'loaded', 'overload'].map((phase) => orbitStep({
    phase,
    input,
    radius: 100,
    tangentialSpeed: 50,
    hostRot: Math.PI / 2,
  }));

  for (const result of results) {
    assert.equal(result.active, true);
    assert.equal(result.input.throttle, input.throttle);
    assert.equal(result.input.strafe, input.strafe);
    assert.equal(result.input.boost, input.boost);
    assert.equal(Object.hasOwn(result, 'impulse'), false);
  }
  assert.equal(results[0].input.turn, results[1].input.turn);
  assert.equal(results[1].input.turn, results[2].input.turn);
});

test('Flight V3 wires the yaw-only helper without adding a tether impulse', () => {
  const harness = makeFlightHarness();
  const system = Object.create(flightV3Module.flightV3);
  system.init({ state: harness.state, bus: harness.bus });
  system.update(DT, harness.state);
  const command = consumePhysicsCommand(harness.player);

  assert.ok(command && command.control);
  assert.equal(command.control.source, 'player-flight-v3');
  assert.equal(command.impulses.length, 0);
  assert.equal(harness.player._flightFrame.orbitAssist.active, true);
  assert.equal(harness.player._flightFrame.orbitAssist.intentSource, 'flight');
});

test('Flight V3 preserves manual yaw when turning without forward thrust on a loaded line', () => {
  const loaded = makeFlightHarness();
  loaded.state.input.moveZ = 0;
  loaded.state.input.turnIntent = 1;
  const system = Object.create(flightV3Module.flightV3);
  system.init({ state: loaded.state, bus: loaded.bus });
  system.update(DT, loaded.state);
  const frame = loaded.player._flightFrame.orbitAssist;
  assert.equal(frame.active, false);
  assert.equal(frame.reason, 'manual-override');
  const command = consumePhysicsCommand(loaded.player);
  assert.ok(command.control.torque.y > 0, 'the held turn still reaches the physics owner');
});

test('swing coordination leaves trackable orbits at full throttle', () => {
  // Starter-ish hull on the default rope at cruise: the swing fits inside yaw authority.
  const scale = orbitSwingThrottleScale(
    { maxYawRate: 2.65, radius: 70, tangentialSpeed: 129 },
    129,
  );
  assert.equal(scale, 1);
});

test('swing coordination holds the swing at the trackable rate', () => {
  // Same hull reeled to 30 WU: 129 WU/s of swing needs 4.3 rad/s of yaw the hull lacks.
  const trackable = 2.65 * 30 * ORBIT_SWING_TRACK_MARGIN;
  const scale = orbitSwingThrottleScale(
    { maxYawRate: 2.65, radius: 30, tangentialSpeed: 129 },
    129,
  );
  assert.ok(Math.abs(scale - trackable / 129) < 1e-12);
  assert.ok(scale < 1 && scale > 0);
});

test('swing coordination caps demand before the swing outruns the nose', () => {
  // Still accelerating (live swing small) but the commanded cruise already outruns tracking.
  const trackable = 2.65 * 30 * ORBIT_SWING_TRACK_MARGIN;
  const scale = orbitSwingThrottleScale(
    { maxYawRate: 2.65, radius: 30, tangentialSpeed: 10 },
    200,
  );
  assert.ok(Math.abs(scale - trackable / 200) < 1e-12);
});

test('swing coordination reads swing magnitude and fails open', () => {
  const against = orbitSwingThrottleScale(
    { maxYawRate: 2.65, radius: 30, tangentialSpeed: -129 },
    0,
  );
  const withGrain = orbitSwingThrottleScale(
    { maxYawRate: 2.65, radius: 30, tangentialSpeed: 129 },
    0,
  );
  assert.equal(against, withGrain);
  assert.equal(orbitSwingThrottleScale({ maxYawRate: 2.65, radius: 0, tangentialSpeed: 129 }, 129), 1);
  assert.equal(orbitSwingThrottleScale({ maxYawRate: 0, radius: 30, tangentialSpeed: 129 }, 129), 1);
  assert.equal(orbitSwingThrottleScale(null, 129), 1);
});

test('Flight V3 shapes forward thrust while the orbit outruns yaw authority', () => {
  // Same ship, same speed, same chord — only the rope differs. The long rope tracks; the short
  // rope's swing needs more yaw than even the line-locked ceiling allows (7.5 rad/s against the
  // physics owner's 6.0), so the coordinator must hold thrust back to keep the nose on the tangent.
  // (A 30 WU rope at 150 WU/s, 5 rad/s, is now trackable: the line lends the hull its yaw rate.)
  const trackable = makeFlightHarness();
  const saturated = makeFlightHarness();
  trackable.player.vel = { x: 0, z: 150 };
  saturated.player.vel = { x: 0, z: 150 };
  saturated.anchor.pos = { x: 100, z: 0 };
  saturated.state.player.tether.restLength = 20;
  const forwardForce = (harness) => {
    const system = Object.create(flightV3Module.flightV3);
    system.init({ state: harness.state, bus: harness.bus });
    system.update(DT, harness.state);
    const command = consumePhysicsCommand(harness.player);
    const force = command.control.force;
    return force.x * Math.cos(harness.player.rot) + force.z * Math.sin(harness.player.rot);
  };
  const trackableForce = forwardForce(trackable);
  const saturatedForce = forwardForce(saturated);
  const trackableFrame = trackable.player._flightFrame.orbitAssist;
  const saturatedFrame = saturated.player._flightFrame.orbitAssist;
  assert.equal(trackableFrame.active, true);
  assert.equal(trackableFrame.swingThrottleScale, 1,
    'a trackable orbit keeps full thrust: byte-identical behavior');
  assert.equal(saturatedFrame.active, true);
  assert.ok(saturatedFrame.swingThrottleScale < 1 && saturatedFrame.swingThrottleScale > 0,
    `an untrackable swing must shed thrust, got ${saturatedFrame.swingThrottleScale}`);
  assert.equal(saturatedFrame.saturated, true);
  assert.ok(saturatedForce < trackableForce,
    `the scale must reach the physics command: ${saturatedForce} vs ${trackableForce}`);
});

test('a boost tap inside the live orbit chord always dashes, even on a tight line', () => {
  const harness = makeFlightHarness();
  harness.anchor.pos = { x: 90, z: 0 }; // 30 WU live radius from the player at x=120.
  harness.state.player.tether.restLength = 30;
  harness.state.input.boost = true;
  harness.player.boost = {
    energy: 220,
    max: 220,
    drainRate: 36,
    regenRate: 28,
    dashImpulse: 170,
    dashCost: 28,
    dashCd: 1.8,
    dashCdT: 0,
    topSpeedPct: 0,
    burnDurS: 0,
    burnCdS: 0,
  };

  const system = Object.create(flightV3Module.flightV3);
  system.init({ state: harness.state, bus: harness.bus });
  system.update(DT, harness.state);
  const command = consumePhysicsCommand(harness.player);
  const frame = harness.player._flightFrame.orbitAssist;

  assert.equal(frame.active, true, 'the forward+turn tether chord owns yaw');
  assert.ok(frame.swingThrottleScale < 1,
    `short-line boosted demand must be shaped to finite yaw authority; got ${frame.swingThrottleScale}`);
  assert.equal(harness.player.flags.boosting, true,
    'the fix must keep continuous boost alive rather than swallowing the boost key');
  assert.equal(command.impulses.length, 1, 'the tap dashes inside the chord, wherever the pilot is');
  assert.ok(harness.player.boost.dashCdT > 0, 'the dash arms its cooldown');
});

test('releasing the orbit contract restores the ordinary boost dash immediately', () => {
  const harness = makeFlightHarness();
  harness.state.settings.gameplay.orbitAssistStrength = 'off';
  harness.state.input.boost = true;
  harness.player.boost = {
    energy: 220,
    max: 220,
    drainRate: 36,
    regenRate: 28,
    dashImpulse: 170,
    dashCost: 28,
    dashCd: 1.8,
    dashCdT: 0,
    topSpeedPct: 0,
    burnDurS: 0,
    burnCdS: 0,
  };

  const system = Object.create(flightV3Module.flightV3);
  system.init({ state: harness.state, bus: harness.bus });
  system.update(DT, harness.state);
  const command = consumePhysicsCommand(harness.player);

  assert.equal(harness.player._flightFrame.orbitAssist.active, false);
  assert.equal(command.impulses.length, 1,
    'Orbit Assist Off must preserve the normal press-edge dash verb');
  assert.ok(harness.player.boost.dashCdT > 0, 'ordinary dash cooldown still arms');
  assert.ok(harness.player.boost.energy < 200, 'ordinary dash still pays its energy cost');
});

test('releasing either chord key restores the ordinary boost dash immediately', () => {
  const harness = makeFlightHarness();
  harness.state.input.turnIntent = 0; // forward held, turn released: no chord, no assist.
  harness.state.input.boost = true;
  harness.player.boost = {
    energy: 220,
    max: 220,
    drainRate: 36,
    regenRate: 28,
    dashImpulse: 170,
    dashCost: 28,
    dashCd: 1.8,
    dashCdT: 0,
    topSpeedPct: 0,
    burnDurS: 0,
    burnCdS: 0,
  };

  const system = Object.create(flightV3Module.flightV3);
  system.init({ state: harness.state, bus: harness.bus });
  system.update(DT, harness.state);
  const command = consumePhysicsCommand(harness.player);

  assert.equal(command.impulses.length, 1,
    'releasing the turn key must not cost the boost press its dash');
});

test('an unusable orbit geometry leaves the boost press with the normal dash', () => {
  for (const invalid of ['coincident-anchor', 'non-finite-anchor']) {
    const harness = makeFlightHarness();
    if (invalid === 'coincident-anchor') harness.anchor.pos = { ...harness.player.pos };
    else harness.anchor.vel.z = NaN;
    harness.state.input.boost = true;
    harness.player.boost = {
      energy: 220, max: 220, drainRate: 36, regenRate: 28,
      dashImpulse: 170, dashCost: 28, dashCd: 1.8, dashCdT: 0,
      topSpeedPct: 0, burnDurS: 0, burnCdS: 0,
    };
    const system = Object.create(flightV3Module.flightV3);
    system.init({ state: harness.state, bus: harness.bus });
    system.update(DT, harness.state);
    const command = consumePhysicsCommand(harness.player);
    assert.equal(harness.player._flightFrame.orbitAssist.active, false, invalid);
    assert.equal(command.impulses.length, 1, `${invalid}: input alone must not suppress a dash`);
    assert.ok(harness.player.boost.dashCdT > 0);
  }
});

test('a boost press mid-orbit keeps the line attached and keeps the swing tracked', async () => {
  // Full-production regression: real flightV3 + rapier, 30 WU line, boost pressed mid-orbit and
  // released later. The old ±45° capture cone dropped the whole assist on a boost-thrown nose and
  // the ship dove inward; the law now tracks the line's measured rate through any heading error,
  // so engagement must persist across the impulse and heading error must stay bounded by wrap.
  const run = () => masslineLab.runScenario({
    seed: 47,
    ticks: 360,
    lineLength: 30,
    entrySpeed: 60,
    anchorMass: 5000,
    productionOrbitAssist: true,
    controller: masslineLab.BASELINE_CONTROLLER,
    reelWindow: [],
    frames: [
      { tick: 0, input: { boost: false } },
      { tick: 120, input: { boost: true } },
      { tick: 200, input: { boost: false } },
    ],
  });
  const result = await run();
  const post = result.trace.filter((sample) => sample.tick >= 120);

  assert.ok(result.trace.every((sample) => sample.attachmentActive),
    'the line must stay attached through the boost press and release');
  assert.ok(post.some((sample) => sample.orbitAssistActive), 'the chord still offers orbit assistance');
  assert.ok(result.trace.every((sample) => sample.orbitAssistActive
    ? Math.abs(sample.orbitHeadingError) <= Math.PI + 1e-6
    : ['manual-override', 'arming', 'swing-absent', 'line-slack', 'not-orbiting',
      'off-tangent', 'pilot-escape']
      .includes(sample.orbitAssistReason)),
  'a boost may disturb the heading but never drops the line tracking into a hard manual capture');
  const postBoost = result.trace.filter((sample) => sample.tick >= 130);
  assert.ok(postBoost.filter((sample) => sample.orbitAssistActive).length > postBoost.length * 0.8,
    'the assist stays engaged through and past the boost, not toggling off on a heading overshoot');

  const repeat = await run();
  assert.equal(repeat.traceHash, result.traceHash);
});

test('the production forward-plus-turn controller passes the deterministic orbit matrix', async () => {
  const matrix = await masslineLab.orbitAssistAcceptanceMatrix({ seed: 47 });
  assert.equal(matrix.schema, 'spaceface.masslineControlLab.orbitAssistMatrix.v1');
  assert.equal(matrix.rows.length, 27);
  assert.deepEqual(matrix.summary, { total: 27, pass: 27, fail: 0 });
  assert.ok(matrix.rows.every((row) => row.metrics.anchorContact === false));
  assert.ok(matrix.rows.every((row) => row.metrics.orbitAssistActiveTicks > 0));
  assert.ok(matrix.rows.every((row) => row.metrics.accelerated === true));
  assert.ok(matrix.rows.every((row) => row.metrics.tangentialSpeedGain >= 100),
    'forward thrust must build swing speed instead of being spent into the rope');
  const repeat = await masslineLab.orbitAssistAcceptanceMatrix({ seed: 47 });
  assert.equal(repeat.digest, matrix.digest);
});

test('R2 production recovery matrix covers exact R0 radii and radial/signed heading starts', async () => {
  const matrix = await masslineLab.orbitAssistHeadingAcceptanceMatrix({ seed: 47 });
  assert.equal(matrix.schema, 'spaceface.masslineControlLab.orbitAssistHeadingMatrix.v1');
  assert.equal(matrix.rows.length, 36);
  assert.deepEqual(matrix.summary, { total: 36, pass: 36, fail: 0 });
  assert.deepEqual(new Set(matrix.rows.map((row) => row.params.lineLength)), new Set([72, 220]));
  assert.deepEqual(
    new Set(matrix.rows.map((row) => row.params.productionOrbitDirection)),
    new Set([-1, 1]),
  );
  assert.deepEqual(
    new Set(matrix.rows.map((row) => row.params.orbitAssistStrength)),
    new Set(['light', 'standard', 'full']),
  );
  assert.deepEqual(
    new Set(matrix.rows.map((row) => row.params.headingCase)),
    new Set(['radial-facing', 'tangent-minus', 'tangent-plus']),
  );
  assert.ok(matrix.rows.every((row) => row.metrics.visibleYaw));
  assert.ok(matrix.rows.every((row) => row.metrics.noFullRateTakeover));
  assert.ok(matrix.rows.every((row) => row.metrics.shortestPathCapture),
    'every recovery start takes the short way onto the tangent, never the 270-degree route');
  assert.ok(matrix.rows.every((row) => row.metrics.directionCommittedTicks === 0),
    'the erratic direction-committed full revolution stays gone');
  assert.ok(matrix.rows.every((row) => row.metrics.orbitAssistActiveTicks > 0));
  assert.ok(matrix.rows.every((row) => Number.isFinite(row.metrics.worstDesiredYawRateRatio)));
  // Hard whips legitimately saturate yaw authority (the orbit's own feed-forward outruns the
  // hull), so the takeover gate is demand-relative: a near-full-rate request may only occur
  // while the orbital feed-forward plus the proportional bridge actually call for it.
  assert.ok(matrix.rows.every((row) => row.metrics.fullRateTakeoverTicks === 0),
    'a near-full-rate yaw request must only occur while the orbit itself demands the envelope');
  // Radial starts deliberately begin with the pilot's full manual turn. Compare the
  // assist-only maximum against tick zero only when that first command was assisted.
  assert.ok(matrix.rows.filter((row) => row.params.headingCase !== 'radial-facing')
    .every((row) => row.metrics.worstDesiredYawRateRatio
    >= row.metrics.initialAbsDesiredYawRate / row.metrics.maxYawRate - 1e-6));
  assert.ok(matrix.rows.some((row) => row.metrics.worstDesiredYawRateRatioTick > 0),
    'the takeover gate records a later worst sample rather than assuming tick zero is worst');

  for (const direction of [-1, 1]) {
    for (const strength of ['light', 'standard', 'full']) {
      for (const headingCase of ['radial-facing', 'tangent-minus', 'tangent-plus']) {
        const matches = (row) => row.params.productionOrbitDirection === direction
          && row.params.orbitAssistStrength === strength
          && row.params.headingCase === headingCase;
        const short = matrix.rows.find((row) => row.params.lineLength === 72 && matches(row));
        const long = matrix.rows.find((row) => row.params.lineLength === 220 && matches(row));
        assert.ok(short && long);
        assert.ok(short.metrics.initialAbsOrbitalYawRate > long.metrics.initialAbsOrbitalYawRate,
          `${direction}/${strength}/${headingCase}: short line keeps stronger physical feed-forward`);
        if (headingCase !== 'radial-facing') {
          assert.ok(short.metrics.initialAbsDesiredYawRate > long.metrics.initialAbsDesiredYawRate,
            `${direction}/${strength}/${headingCase}: short line requests faster yaw`);
          assert.ok(short.metrics.actualYawDelta30Ticks > long.metrics.actualYawDelta30Ticks,
            `${direction}/${strength}/${headingCase}: short line produces more visible hull yaw`);
        }
        // Radial-facing capture spends the full yaw envelope on both radii, so the requested
        // rate is equal rather than radius-ordered. The inverse-radius property above still
        // guards the physical feed-forward, and the lab's visibleYaw/shortestPathCapture/
        // takeover gates guard capture without the 270-degree direction-committed route.
      }
    }
  }

  const repeat = await masslineLab.orbitAssistHeadingAcceptanceMatrix({ seed: 47 });
  assert.equal(repeat.digest, matrix.digest);
});

const ENGAGED = { chordT: 5, graceT: 0, direction: 0 };

function orbitStep(options = {}) {
  const radius = options.radius ?? 120;
  const tangentialSpeed = options.tangentialSpeed ?? 30;
  const input = options.input || { throttle: 1, strafe: 0, turn: 1, boost: false, brake: false };
  const anchorAhead = options.anchorAhead === true;
  const selectedDirection = Math.sign(options.lateral ?? 1) || 1;
  return flightV3Module.stepAnchorRelativeOrbitAssist({
    dt: DT,
    host: {
      pos: { x: anchorAhead ? 0 : radius, z: 0 },
      vel: {
        x: 0,
        z: (anchorAhead ? -1 : 1) * tangentialSpeed * selectedDirection,
      },
      rot: options.hostRot ?? Math.PI / 2,
      angVel: 0,
      mass: 20,
      radius: 10,
    },
    anchor: {
      pos: { x: anchorAhead ? radius : 0, z: 0 },
      vel: { x: 0, z: 0 },
      mass: 2000,
      radius: 20,
    },
    tether: { active: true, targetId: 'anchor', restLength: radius, phase: options.phase || 'loaded' },
    flightIntent: {
      forward: options.forward ?? 1,
      lateral: options.lateral ?? 1,
    },
    engage: options.engage || ENGAGED,
    input,
    profile: { mainAccel: 50, maxYawRate: 2, yawAccel: 6 },
    strength: options.strength || 'standard',
  });
}

function makeFlightHarness() {
  const player = {
    id: 'player',
    type: 'ship',
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 30 },
    rot: Math.PI / 2,
    angVel: 0,
    mass: 20,
    radius: 10,
    maxSpeed: 180,
    flags: {},
    data: {},
    physicsBody: { mass: 20, inertiaY: 100, radius: 10 },
    // A chord already held past the engagement dwell: the harness tests assert the
    // established-orbit behavior, not the 0.4 s arming edge.
    _orbitAssistEngage: { chordT: 5, graceT: 0.6, direction: 1 },
  };
  const anchor = {
    id: 'anchor',
    type: 'asteroid',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    mass: 2000,
    radius: 40,
    alive: true,
  };
  const state = {
    mode: 'flight',
    tick: 20,
    simTime: 1,
    playerId: player.id,
    player: {
      tether: { active: true, targetId: anchor.id, restLength: 120, phase: 'loaded' },
    },
    settings: {
      gameplay: { physicsBackend: 'rapier-dynamic', orbitAssistStrength: 'standard' },
      controls: { flightMode: 'assisted' },
    },
    input: {
      moveX: 0,
      moveZ: 1,
      turnIntent: 1,
      boost: false,
      brake: false,
      actions: {
        massline: { lineControl: false, lineLength: 0, orbitDirection: 0 },
        throwArm: false,
      },
    },
    ui: { screenStack: [] },
    world: {},
    nav: {},
    flight: { mode: 'manual' },
    entities: new Map([[player.id, player], [anchor.id, anchor]]),
    entityList: [player, anchor],
  };
  const listeners = new Map();
  const emitted = [];
  const bus = {
    on(type, fn) { listeners.set(type, fn); return () => listeners.delete(type); },
    emit(type, payload) { emitted.push({ type, payload }); },
  };
  return { state, player, anchor, listeners, emitted, bus };
}
