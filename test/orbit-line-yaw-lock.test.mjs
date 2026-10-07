import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as flightV3Module from '../src/systems/flightV3.js';
import {
  ORBIT_DIRECTION_LATCH,
  ORBIT_LINE_YAW_LOCK,
  orbitHeadingThrustGate,
  orbitSwingThrottleScale,
  stepAnchorRelativeOrbitAssist,
} from '../src/core/flight/orbitAssist.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';

const DT = 1 / 60;

// Ship at +x of the anchor on a line of `radius`, moving +z (counter-clockwise) at `speed`, nose
// on the CCW tangent unless `rot` is given.
function orbitStep({ radius = 36, speed = 200, lateral = 1, fromAim = false, latched = 0, rot = Math.PI / 2,
  hullYaw = 2.646, hostMass = 20, anchorMass = 2000 } = {}) {
  return stepAnchorRelativeOrbitAssist({
    dt: DT,
    host: { pos: { x: radius, z: 0 }, vel: { x: 0, z: speed }, rot, mass: hostMass },
    anchor: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: anchorMass, alive: true },
    tether: { active: true, targetId: 'anchor', restLength: radius, phase: 'loaded' },
    flightIntent: { forward: 1, lateral, lateralFromAim: fromAim },
    latchedDirection: latched,
    input: { throttle: 1, strafe: 0, turn: lateral, boost: false, brake: false },
    profile: { maxYawRate: hullYaw },
    strength: 'standard',
  });
}

test('the line-lock ceiling mirrors the physics owner absolute yaw clamp', () => {
  const source = readFileSync(new URL('../src/core/sg02DynamicBodyOwner.js', import.meta.url), 'utf8');
  const match = source.match(/const SANE_MAX_YAW_RATE = ([0-9.]+);/);
  assert.ok(match, 'sg02 must still declare SANE_MAX_YAW_RATE');
  assert.equal(ORBIT_LINE_YAW_LOCK.absoluteYawCap, Number(match[1]));
});

test('a fast short-line swing borrows the line rate up to the physics ceiling', () => {
  const r = orbitStep({ radius: 36, speed: 200 });     // 5.56 rad/s, far past a 2.65 rad/s hull
  assert.equal(r.active, true);
  const omega = 200 / 36;
  assert.ok(Math.abs(r.telemetry.orbitalYawRate - omega) < 1e-9);
  assert.equal(r.telemetry.lentYawRate, Math.min(omega * ORBIT_LINE_YAW_LOCK.rateMargin, ORBIT_LINE_YAW_LOCK.absoluteYawCap));
  assert.equal(r.telemetry.maxYawRate, r.telemetry.lentYawRate);
  assert.equal(r.telemetry.hullMaxYawRate, 2.646);
  assert.ok(Math.abs(r.telemetry.desiredYawRate - omega) < 1e-9, 'on the tangent the request is the exact orbital rate');
  assert.equal(r.telemetry.saturated, false);
  assert.equal(r.telemetry.yawCeiling, ORBIT_LINE_YAW_LOCK.absoluteYawCap);
});

test('a swing the hull can already follow borrows nothing', () => {
  const r = orbitStep({ radius: 220, speed: 150 });    // 0.68 rad/s
  assert.equal(r.telemetry.lentYawRate, null);
  assert.equal(r.telemetry.maxYawRate, 2.646);
});

test('the yaw helper still never touches thrust', () => {
  const r = orbitStep({ radius: 36, speed: 200, rot: 0 }); // nose 90 deg off the tangent
  assert.equal(r.input.throttle, 1);
  assert.equal(r.input.strafe, 0);
});

test('line-locked swing governor holds the orbit under the physics ceiling in the COM frame', () => {
  const t = { yawCeiling: 6, radius: 36, armShare: 0.5, tangentialSpeed: 300 };
  const trackable = 6 * 36 * ORBIT_LINE_YAW_LOCK.governorMargin * 0.5;
  assert.equal(orbitSwingThrottleScale(t, 0), trackable / (300 * 0.5));
  assert.equal(orbitSwingThrottleScale({ ...t, tangentialSpeed: 100 }, 0), 1, 'trackable swings keep full thrust');
  assert.equal(orbitSwingThrottleScale({ ...t, radius: 0 }, 300), 1, 'fails open');
});

test('the heading thrust gate follows cos(heading error) and never reverses thrust', () => {
  assert.equal(orbitHeadingThrustGate({ headingError: 0 }), 1);
  assert.ok(Math.abs(orbitHeadingThrustGate({ headingError: Math.PI / 3 }) - 0.5) < 1e-12);
  assert.equal(orbitHeadingThrustGate({ headingError: Math.PI * 0.75 }), 0);
  assert.equal(orbitHeadingThrustGate({}), 1);
  assert.equal(orbitHeadingThrustGate(null), 1);
});

test('an aim-derived turn intent keeps the latched orbit direction when it flips sign', () => {
  const latched = orbitStep({ radius: 120, speed: 150, lateral: -1, fromAim: true, latched: 1 });
  assert.equal(latched.telemetry.selectedDirection, 1, 'helm cursor swept behind the ship: direction holds');
  assert.equal(latched.telemetry.latchedDirection, 1);
});

test('keyboard and stick intent ignore the latch, so a deliberate reversal still works', () => {
  const reversed = orbitStep({ radius: 120, speed: 150, lateral: -1, fromAim: false, latched: 1 });
  assert.equal(reversed.telemetry.selectedDirection, -1);
  assert.equal(reversed.telemetry.latchedDirection, 0);
});

test('an aim-derived engagement on a line already swinging takes the swing direction', () => {
  const omega = 150 / 120;
  assert.ok(omega > ORBIT_DIRECTION_LATCH.engageSwingFraction * 2.646);
  const engaged = orbitStep({ radius: 120, speed: 150, lateral: -1, fromAim: true, latched: 0 });
  assert.equal(engaged.telemetry.selectedDirection, 1);
  const slow = orbitStep({ radius: 120, speed: 20, lateral: -1, fromAim: true, latched: 0 });
  assert.equal(slow.telemetry.selectedDirection, -1, 'a slow line lets the intent pick');
});

function harness() {
  const player = {
    id: 'player', type: 'ship', pos: { x: 120, z: 0 }, vel: { x: 0, z: 30 }, rot: Math.PI / 2, angVel: 0,
    mass: 20, radius: 10, maxSpeed: 180, flags: {}, data: {}, physicsBody: { mass: 20, inertiaY: 100, radius: 10 },
    boost: { energy: 220, max: 220, drainRate: 36, regenRate: 28, dashImpulse: 170, dashCost: 28, dashCd: 1.8,
      dashCdT: 0, topSpeedPct: 0, burnDurS: 0, burnCdS: 0 },
  };
  const anchor = { id: 'anchor', type: 'asteroid', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 2000, radius: 40, alive: true };
  const state = {
    mode: 'flight', tick: 20, simTime: 1, playerId: player.id,
    player: { tether: { active: true, targetId: anchor.id, restLength: 120, phase: 'loaded' } },
    settings: { gameplay: { physicsBackend: 'rapier-dynamic', orbitAssistStrength: 'standard' }, controls: { flightMode: 'assisted' } },
    input: { moveX: 0, moveZ: 1, turnIntent: 0, boost: true, brake: false,
      actions: { massline: { lineControl: false, lineLength: 0, orbitDirection: 0 }, throwArm: false } },
    ui: { screenStack: [] }, world: {}, nav: {}, flight: { mode: 'manual' },
    entities: new Map([[player.id, player], [anchor.id, anchor]]), entityList: [player, anchor],
  };
  const bus = { on() { return () => {}; }, emit() {} };
  return { state, player, anchor, bus };
}

function dashImpulseAlongNose(h) {
  const system = Object.create(flightV3Module.flightV3);
  system.init({ state: h.state, bus: h.bus });
  system.update(DT, h.state);
  const command = consumePhysicsCommand(h.player);
  assert.equal(command.impulses.length, 1, 'the press still fires the dash verb');
  const i = command.impulses[0];
  return (i.x * Math.cos(h.player.rot) + i.z * Math.sin(h.player.rot)) / h.player.physicsBody.mass;
}

test('a dash on a live line cannot lift speed past the boosted cap (no chord-break pumping)', () => {
  const slow = harness();
  const slowDv = dashImpulseAlongNose(slow);
  assert.ok(Math.abs(slowDv - 170) < 1e-6, `a dash well under the cap is untouched, got ${slowDv}`);

  const fast = harness();
  const cap = resolvePropulsionProfile(fast.player, fast.state);
  const boostedCap = cap.combatSpeed * cap.boostSpeedMult;
  fast.player.vel = { x: 0, z: boostedCap - 40 };
  const fastDv = dashImpulseAlongNose(fast);
  assert.ok(fastDv <= 40 + 1e-6, `a line dash may only top the swing up to the boosted cap, got ${fastDv}`);
});

test('without a live line the dash is unchanged', () => {
  const free = harness();
  free.state.player.tether.active = false;
  const cap = resolvePropulsionProfile(free.player, free.state);
  free.player.vel = { x: 0, z: cap.combatSpeed * cap.boostSpeedMult - 40 };
  const dv = dashImpulseAlongNose(free);
  assert.ok(Math.abs(dv - 170) < 1e-6, `free-flight dash keeps its full impulse, got ${dv}`);
});

test('input tags helm-cursor and twin-stick turn intent as aim-derived', () => {
  const source = readFileSync(new URL('../src/systems/input.js', import.meta.url), 'utf8');
  assert.match(source, /inp\.turnIntent = kbdTurn \|\| gpTurn \|\| tpTurn;\s*inp\.turnIntentFromAim = false;/);
  assert.equal((source.match(/inp\.turnIntentFromAim = true;/g) || []).length, 2);
});
