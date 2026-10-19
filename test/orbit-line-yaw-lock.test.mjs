import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as flightV3Module from '../src/systems/flightV3.js';
import {
  ORBIT_ASSIST_ENGAGE_V1,
  ORBIT_LINE_YAW_LOCK,
  orbitHeadingThrustGate,
  orbitSwingThrottleScale,
  stepAnchorRelativeOrbitAssist,
} from '../src/core/flight/orbitAssist.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';

const DT = 1 / 60;

// A chord that has been held well past the engagement dwell, on a hull with no prior grace:
// fresh engagement then depends only on the live swing test.
const ENGAGED = { chordT: 5, graceT: 0, direction: 0 };

// Ship at +x of the anchor on a line of `radius`, moving +z (counter-clockwise) at `speed`, nose
// on the CCW tangent unless `rot` is given.
function orbitStep({ radius = 36, speed = 200, lateral = 1, fromAim = false, engage = ENGAGED, rot = Math.PI / 2,
  hullYaw = 2.646, hostMass = 20, anchorMass = 2000, phase = 'loaded', restLength = radius } = {}) {
  return stepAnchorRelativeOrbitAssist({
    dt: DT,
    host: { pos: { x: radius, z: 0 }, vel: { x: 0, z: speed }, rot, mass: hostMass },
    anchor: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: anchorMass, alive: true },
    tether: { active: true, targetId: 'anchor', restLength, phase },
    flightIntent: { forward: 1, lateral, lateralFromAim: fromAim },
    engage,
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

test('a fast short-line swing retains the fitted hull yaw ceiling', () => {
  const r = orbitStep({ radius: 36, speed: 200 });     // 5.56 rad/s, far past a 2.65 rad/s hull
  assert.equal(r.active, true);
  const omega = 200 / 36;
  assert.ok(Math.abs(r.telemetry.orbitalYawRate - omega) < 1e-9);
  assert.equal(r.telemetry.lentYawRate, null);
  assert.equal(r.telemetry.maxYawRate, r.telemetry.hullMaxYawRate);
  assert.equal(r.telemetry.hullMaxYawRate, 2.646);
  assert.equal(r.telemetry.desiredYawRate, r.telemetry.hullMaxYawRate,
    'orbital feed-forward stays bounded by the fitted ship turn rate');
  assert.equal(r.telemetry.saturated, true);
  assert.equal(r.telemetry.yawCeiling, r.telemetry.hullMaxYawRate);
});

test('a swing the hull can already follow borrows nothing', () => {
  const r = orbitStep({ radius: 220, speed: 150 });    // 0.68 rad/s
  assert.equal(r.telemetry.lentYawRate, null);
  assert.equal(r.telemetry.maxYawRate, 2.646);
});

test('a slack line cannot lend yaw or the loaded-line speed allowance', () => {
  const r = orbitStep({ radius: 36, speed: 200, phase: 'slack', restLength: 120 });
  assert.equal(r.active, true, 'ordinary tangent steering remains available');
  assert.equal(r.telemetry.reason, 'line-slack');
  assert.equal(r.telemetry.lentYawRate, null);
  assert.equal(r.telemetry.maxYawRate, r.telemetry.hullMaxYawRate);
  assert.equal(r.telemetry.yawCeiling, null);
  assert.equal(r.telemetry.saturated, true, 'yaw stays inside the hull envelope');
  assert.ok(orbitSwingThrottleScale(r.telemetry, 200) < 0.5,
    'a slack rope cannot authorize the loaded-line swing speed');
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

test('a live swing always tracks the physical line direction — an aim sign flip cannot redirect it', () => {
  // +z motion at +x is a +1 (counter-clockwise) swing. A helm-cursor intent reading -1 is the
  // classic mid-orbit sweep behind the hull; the line, not the cursor, owns the tangent.
  const aimed = orbitStep({ radius: 120, speed: 150, lateral: -1, fromAim: true });
  assert.equal(aimed.active, true);
  assert.equal(aimed.telemetry.direction, 1);
  assert.equal(aimed.telemetry.selectedDirection, -1, 'the held intent is reported, never obeyed');
  assert.ok(aimed.telemetry.desiredYawRate > 0);
});

test('a held counter-key during a live swing is manual yaw, not a flipped assist', () => {
  const reversed = orbitStep({ radius: 120, speed: 150, lateral: -1 });
  assert.equal(reversed.active, false, 'countersteering belongs to the pilot');
  assert.equal(reversed.telemetry.reason, 'manual-override');
  assert.equal(reversed.input.turn, -1, 'the raw key reaches the hull untouched');
});

test('a swing stall inside the grace window keeps the remembered direction', () => {
  // Was engaged on a +1 swing; the line has nearly stalled (omega below the continuation floor),
  // so the remembered direction — not the near-zero instantaneous rate — owns the tangent.
  const stalled = orbitStep({ radius: 120, speed: 1, engage: { chordT: 5, graceT: 0.5, direction: 1 } });
  assert.equal(stalled.active, true);
  assert.equal(stalled.telemetry.direction, 1);
  assert.ok(stalled.telemetry.engage.graceT < 0.5 && stalled.telemetry.engage.graceT > 0,
    'a stalled swing drains grace instead of refilling it');
});

test('a chord held on a non-swinging line is ordinary yaw — towing never reads as an orbit', () => {
  // Hull moving directly away from the anchor on a taut line: relative motion runs along the
  // rope, not around it, so the line rotation test never engages no matter how long W+A is held.
  const tow = stepAnchorRelativeOrbitAssist({
    dt: DT,
    host: { pos: { x: 120, z: 0 }, vel: { x: 80, z: 0 }, rot: 0, mass: 20 },
    anchor: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 2000, alive: true },
    tether: { active: true, targetId: 'anchor', restLength: 120, phase: 'loaded' },
    flightIntent: { forward: 1, lateral: 1 },
    engage: { chordT: 60, graceT: 0, direction: 0 },
    input: { throttle: 1, strafe: 0, turn: 1, boost: false, brake: false },
    profile: { maxYawRate: 2.646 },
    strength: 'standard',
  });
  assert.equal(tow.active, false);
  assert.equal(tow.telemetry.reason, 'swing-absent');
  assert.equal(tow.input.turn, 1, 'manual yaw is never adjusted on a non-orbiting tether');
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

test('a dash on a live line always fires at full strength, whatever the speed', () => {
  const slow = harness();
  const slowDv = dashImpulseAlongNose(slow);
  assert.ok(Math.abs(slowDv - 170) < 1e-6, `a slow tethered dash is full strength, got ${slowDv}`);

  const fast = harness();
  const cap = resolvePropulsionProfile(fast.player, fast.state);
  fast.player.vel = { x: 0, z: cap.combatSpeed * cap.boostSpeedMult + 100 };
  const fastDv = dashImpulseAlongNose(fast);
  assert.ok(Math.abs(fastDv - 170) < 1e-6, `a fast tethered dash is still full strength, got ${fastDv}`);
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
