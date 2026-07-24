import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as flightV3Module from '../src/systems/flightV3.js';
import * as masslineLab from '../scripts/lib/masslineControlLab.mjs';
import { createGameState } from '../src/core/gameState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { masslineTetherStatus } from '../src/ui/hud.js';

const DT = 1 / 60;

test('PQ-005 new games persist Standard as the orbit-assist strength default', () => {
  const state = createGameState(47);
  assert.equal(state.settings.gameplay.orbitAssistStrength, 'standard');
});

test('PQ-005 Gameplay settings exposes all four orbit-assist strengths', () => {
  const source = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  assert.match(source, /rowSelect\('Massline orbit assist',[\s\S]*orbitAssistStrength[\s\S]*\['full', 'Full'\][\s\S]*\['standard', 'Standard'\][\s\S]*\['light', 'Light'\][\s\S]*\['off', 'Off'\][\s\S]*'orbitAssistStrength'/);
});

test('orbit correction stays invisible in the player-facing tether HUD', () => {
  const status = masslineTetherStatus({
    active: true,
    phase: 'loaded',
    strain: 0.7,
    automaticBreakAllowed: false,
  }, true);
  assert.equal(status.text, 'LOADED');
  const source = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /['"`]ORBIT ASSIST['"`]/,
    'internal orbit telemetry must not become another HUD announcement');
});

test('PQ-005 Standard assist preserves tangent intent and caps anchor-relative radial damping', () => {
  assert.equal(
    typeof flightV3Module.stepAnchorRelativeOrbitAssist,
    'function',
    'Flight V3 must expose the pure PQ-005 controller contract',
  );

  const host = {
    pos: { x: 120, z: 0 },
    vel: { x: 10, z: 30 },
    rot: Math.PI / 2,
    mass: 20,
    radius: 10,
  };
  const anchor = {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    mass: 2000,
    radius: 40,
  };
  const hostBefore = structuredClone(host);
  const anchorBefore = structuredClone(anchor);

  const result = flightV3Module.stepAnchorRelativeOrbitAssist({
    dt: DT,
    host,
    anchor,
    tether: { active: true, targetId: 'anchor', restLength: 100, phase: 'loaded' },
    intent: { lineControl: true, lineLength: -1, orbitDirection: 1 },
    input: { throttle: 0, strafe: 0, turn: 0, brake: false },
    profile: { mainAccel: 50, maxYawRate: 2 },
    strength: 'standard',
  });

  assert.equal(result.active, true);
  assert.equal(result.input.throttle, 1, 'the held-forward orbit command remains real thrust intent');
  assert.ok(result.input.turn > 0, 'the chosen positive tangent remains positive yaw intent');
  assert.equal(result.telemetry.strength, 'standard');
  assert.equal(result.telemetry.maxRadialAcceleration, 7.5, 'Standard is the 15% steady-state cap');
  assert.equal(result.telemetry.radialAcceleration, -7.5, 'outward error and rate damp inward at the cap');
  assert.deepEqual(result.impulse, { x: -2.5, y: 0, z: 0 });
  assert.deepEqual(host, hostBefore, 'the controller must not mutate authoritative body state');
  assert.deepEqual(anchor, anchorBefore, 'the controller must not mutate the anchor');
});

test('PQ-005 Off is untouched and any finite tether target can own the relative orbit frame', () => {
  const shared = {
    dt: DT,
    host: { pos: { x: 120, z: 0 }, vel: { x: 10, z: 30 }, rot: Math.PI / 2, mass: 20, radius: 10 },
    tether: { active: true, targetId: 'anchor', restLength: 100, phase: 'loaded' },
    intent: { lineControl: true, lineLength: -1, orbitDirection: 1 },
    input: { throttle: 0.35, strafe: 0, turn: -0.2, brake: false, aimAngle: 1.7 },
    profile: { mainAccel: 50, maxYawRate: 2 },
  };
  const heavyAnchor = {
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 2000, radius: 40,
  };
  const off = flightV3Module.stepAnchorRelativeOrbitAssist({
    ...shared,
    anchor: heavyAnchor,
    strength: 'off',
  });
  const towable = flightV3Module.stepAnchorRelativeOrbitAssist({
    ...shared,
    anchor: { ...heavyAnchor, type: 'ship', mass: 20, vel: { x: -4, z: 3 } },
    intent: null,
    flightIntent: { forward: 1, lateral: 1 },
    runtime: {
      direction: 1,
      engaged: false,
      intentSource: 'flight',
      flightIntentHoldS: 1 - DT,
    },
    strength: 'full',
  });

  assert.equal(off.active, false);
  assert.equal(off.telemetry.reason, 'assist-off');
  assert.deepEqual(off.input, shared.input, 'Off must preserve the ordinary Flight V3 input byte-for-byte');
  assert.equal(off.impulse, null);
  assert.equal(towable.active, true);
  assert.equal(towable.telemetry.reason, 'engaged');
  assert.equal(towable.telemetry.intentSource, 'flight');
  assert.ok(towable.impulse, 'a moving ship target receives the same bounded relative-frame correction');
});

test('PQ-005 radial authority is acceleration-stable across fixed-step rates', () => {
  const run = (dt) => flightV3Module.stepAnchorRelativeOrbitAssist({
    dt,
    host: { pos: { x: 102, z: 0 }, vel: { x: 0.5, z: 30 }, rot: Math.PI / 2, mass: 20, radius: 10 },
    anchor: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 2000, radius: 40 },
    tether: { active: true, targetId: 'anchor', restLength: 100, phase: 'loaded' },
    intent: { lineControl: true, lineLength: -1, orbitDirection: 1 },
    input: { throttle: 0, strafe: 0, turn: 0, brake: false },
    profile: { mainAccel: 50, maxYawRate: 2 },
    strength: 'standard',
  });
  const at30 = run(1 / 30);
  const at60 = run(1 / 60);
  const at120 = run(1 / 120);

  assert.equal(at30.telemetry.radialAcceleration, at60.telemetry.radialAcceleration);
  assert.equal(at60.telemetry.radialAcceleration, at120.telemetry.radialAcceleration);
  assert.equal(at30.input.turn, at60.input.turn);
  assert.equal(at60.input.turn, at120.input.turn);
  assert.ok(Math.abs(at30.impulse.x - at60.impulse.x * 2) < 1e-12);
  assert.ok(Math.abs(at60.impulse.x - at120.impulse.x * 2) < 1e-12);
});

test('PQ-005 explicit tangent intent can start an orbit from rest without cursor chasing', () => {
  const result = flightV3Module.stepAnchorRelativeOrbitAssist({
    dt: DT,
    host: {
      pos: { x: 120, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      mass: 20,
      radius: 10,
    },
    anchor: {
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      mass: 2000,
      radius: 40,
    },
    tether: { active: true, targetId: 'anchor', restLength: 100, phase: 'loaded' },
    intent: { lineControl: true, lineLength: -1, orbitDirection: 1 },
    input: { throttle: 0, strafe: 0, turn: 0, brake: false, aimAngle: -2.4 },
    profile: { mainAccel: 50, maxYawRate: 2 },
    strength: 'standard',
  });

  assert.equal(result.active, true);
  assert.ok(result.input.turn > 0, 'positive tangent intent begins positive yaw even at zero speed');
  assert.ok(result.input.turn <= 1, 'yaw acquisition stays inside the ordinary normalized input');
  assert.equal(result.input.aimAngle, -2.4, 'weapon/cursor aim remains independent data');
});

test('PQ-005 forward acquires orbit assist, lateral holds it, and lateral release drops it in one tick', () => {
  const shared = {
    dt: DT,
    host: { pos: { x: 120, z: 0 }, vel: { x: 0, z: 30 }, rot: Math.PI / 2, mass: 20, radius: 10 },
    anchor: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 2000, radius: 40 },
    tether: { active: true, targetId: 'anchor', restLength: 100, phase: 'loaded' },
    input: { throttle: 0, strafe: 0, turn: 0, brake: false },
    profile: { mainAccel: 50, maxYawRate: 2 },
    strength: 'standard',
  };
  const acquired = flightV3Module.stepAnchorRelativeOrbitAssist({
    ...shared,
    intent: { lineControl: true, lineLength: -1, orbitDirection: 1 },
  });
  const held = flightV3Module.stepAnchorRelativeOrbitAssist({
    ...shared,
    intent: { lineControl: true, lineLength: 0, orbitDirection: 1 },
    runtime: acquired.runtime,
  });
  const released = flightV3Module.stepAnchorRelativeOrbitAssist({
    ...shared,
    intent: { lineControl: true, lineLength: 0, orbitDirection: 0 },
    runtime: held.runtime,
  });

  assert.equal(acquired.active, true);
  assert.equal(held.active, true, 'releasing forward stops reel-in without throwing away the acquired orbit');
  assert.equal(released.active, false, 'lateral release overrides the assist on the next fixed tick');
  assert.equal(released.impulse, null);
});

test('PQ-005 a slack beat suspends correction without losing the acquired lateral orbit', () => {
  const shared = {
    dt: DT,
    host: { pos: { x: 120, z: 0 }, vel: { x: 0, z: 30 }, rot: Math.PI / 2, mass: 20, radius: 10 },
    anchor: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 2000, radius: 40 },
    input: { throttle: 0, strafe: 0, turn: 0, brake: false },
    profile: { mainAccel: 50, maxYawRate: 2 },
    strength: 'standard',
  };
  const acquired = flightV3Module.stepAnchorRelativeOrbitAssist({
    ...shared,
    tether: { active: true, targetId: 'anchor', restLength: 100, phase: 'loaded' },
    intent: { lineControl: true, lineLength: -1, orbitDirection: 1 },
  });
  const slack = flightV3Module.stepAnchorRelativeOrbitAssist({
    ...shared,
    tether: { active: true, targetId: 'anchor', restLength: 100, phase: 'slack' },
    intent: { lineControl: true, lineLength: 0, orbitDirection: 1 },
    runtime: acquired.runtime,
  });
  const reloaded = flightV3Module.stepAnchorRelativeOrbitAssist({
    ...shared,
    tether: { active: true, targetId: 'anchor', restLength: 100, phase: 'loaded' },
    intent: { lineControl: true, lineLength: 0, orbitDirection: 1 },
    runtime: slack.runtime,
  });

  assert.equal(slack.active, false);
  assert.equal(slack.impulse, null);
  assert.equal(slack.runtime.engaged, true, 'slack suspends rather than forgetting held orbit intent');
  assert.equal(reloaded.active, true, 'the assist resumes when the same held line reloads');
});

test('PQ-005 overload tapers tangent thrust without erasing the player-selected orbit', () => {
  const run = (strain) => flightV3Module.stepAnchorRelativeOrbitAssist({
    dt: DT,
    host: { pos: { x: 90, z: 0 }, vel: { x: 0, z: 80 }, rot: Math.PI / 2, mass: 20, radius: 10 },
    anchor: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 2000, radius: 20 },
    tether: { active: true, targetId: 'anchor', restLength: 70, phase: 'overload', strain },
    intent: { lineControl: true, lineLength: -1, orbitDirection: 1 },
    input: { throttle: 0, strafe: 0, turn: 0, brake: false },
    profile: { mainAccel: 50, maxYawRate: 2 },
    strength: 'standard',
  });

  const ordinary = run(0.6);
  const overloaded = run(0.95);
  assert.equal(ordinary.input.throttle, 1, 'ordinary load preserves the full forward command');
  assert.ok(overloaded.input.throttle > 0 && overloaded.input.throttle < 1, 'overload tapers rather than snaps thrust');
  assert.equal(overloaded.active, true);
  assert.ok(overloaded.input.turn > 0, 'tangent direction remains player-controlled under taper');
  assert.equal(overloaded.telemetry.strainLimited, true);
});

test('PQ-005 orbit reversal slews through the existing direction instead of flipping in one tick', () => {
  const shared = {
    dt: DT,
    host: {
      pos: { x: 120, z: 0 },
      vel: { x: 0, z: 30 },
      rot: Math.PI / 2,
      mass: 20,
      radius: 10,
    },
    anchor: {
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      mass: 2000,
      radius: 40,
    },
    tether: { active: true, targetId: 'anchor', restLength: 100, phase: 'loaded' },
    input: { throttle: 0, strafe: 0, turn: 0, brake: false },
    profile: { mainAccel: 50, maxYawRate: 2 },
    strength: 'standard',
  };

  const clockwise = flightV3Module.stepAnchorRelativeOrbitAssist({
    ...shared,
    intent: { lineControl: true, lineLength: -1, orbitDirection: 1 },
  });
  const reversalTick = flightV3Module.stepAnchorRelativeOrbitAssist({
    ...shared,
    intent: { lineControl: true, lineLength: -1, orbitDirection: -1 },
    runtime: clockwise.runtime,
  });

  assert.equal(clockwise.runtime.direction, 1);
  assert.equal(reversalTick.active, true);
  assert.ok(reversalTick.runtime.direction > 0, 'one fixed tick cannot reverse the assisted tangent sign');
  assert.ok(reversalTick.runtime.direction < 1, 'the reversal begins immediately instead of being ignored');
  assert.equal(reversalTick.telemetry.selectedDirection, -1, 'telemetry preserves the player\'s new choice');
  assert.ok(reversalTick.input.turn > 0, 'yaw keeps settling through the old direction before crossing zero');
});

function makeFlightHarness() {
  const player = {
    id: 'player',
    type: 'ship',
    pos: { x: 120, z: 0 },
    vel: { x: 10, z: 30 },
    rot: Math.PI / 2,
    angVel: 0,
    mass: 20,
    radius: 10,
    maxSpeed: 180,
    flags: {},
    data: {},
    physicsBody: { mass: 20, inertiaY: 100, radius: 10 },
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
      tether: {
        active: true,
        targetId: anchor.id,
        restLength: 100,
        phase: 'loaded',
      },
    },
    settings: {
      gameplay: { physicsBackend: 'rapier-dynamic', orbitAssistStrength: 'standard' },
      controls: { flightMode: 'assisted' },
    },
    input: {
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      boost: false,
      brake: false,
      actions: {
        massline: { lineControl: true, lineLength: -1, orbitDirection: 1 },
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

test('PQ-005 Flight V3 wires explicit Massline intent through the additive physics membrane', () => {
  const { state, player, bus } = makeFlightHarness();

  flightV3Module.flightV3.init({ state, bus });
  flightV3Module.flightV3.update(DT, state);
  const command = consumePhysicsCommand(player);

  assert.ok(command && command.control, 'Flight V3 keeps its ordinary force/torque control command');
  assert.equal(command.control.source, 'player-flight-v3');
  assert.equal(command.impulses.length, 1, 'orbit correction accumulates as one authority-owned impulse');
  assert.ok(command.impulses[0].x < 0, 'outward radial error is corrected toward the anchor');
  assert.equal(player._flightFrame.orbitAssist.active, true);
  assert.equal(player._flightFrame.orbitAssist.reason, 'engaged');
});

test('ordinary forward plus turn engages against a ship without holding the Massline action', () => {
  const { state, player, anchor, bus } = makeFlightHarness();
  anchor.type = 'ship';
  anchor.mass = player.mass;
  state.input.moveZ = 1;
  state.input.turnIntent = -1;
  state.input.actions.massline = {
    lineControl: false,
    lineLength: 0,
    orbitDirection: 0,
  };

  flightV3Module.flightV3.init({ state, bus });
  let command = null;
  for (let tick = 0; tick < 60; tick++) {
    flightV3Module.flightV3.update(DT, state);
    command = consumePhysicsCommand(player);
    if (tick < 59) {
      assert.equal(player._flightFrame.orbitAssist.active, false,
        'ordinary steering remains fully manual until the one-second deliberate hold completes');
      assert.equal(player._flightFrame.orbitAssist.reason, 'engage-pending');
    }
  }

  assert.equal(player._flightFrame.orbitAssist.active, true);
  assert.equal(player._flightFrame.orbitAssist.intentSource, 'flight');
  assert.equal(player._flightFrame.orbitAssist.selectedDirection, -1);
  assert.equal(command.impulses.length, 1);
});

test('PQ-005 first-session Full grace steps down silently on a clean release', () => {
  const { state, player, listeners, emitted, bus } = makeFlightHarness();
  flightV3Module.flightV3.init({ state, bus });

  listeners.get('game:started')();
  flightV3Module.flightV3.update(DT, state);
  consumePhysicsCommand(player);
  assert.equal(player._flightFrame.orbitAssist.strength, 'full');

  assert.equal(typeof listeners.get('tether:releaseRated'), 'function');
  listeners.get('tether:releaseRated')({ classification: 'clean', releaseScore: 0.72 });
  flightV3Module.flightV3.update(DT, state);
  consumePhysicsCommand(player);

  assert.equal(player._flightFrame.orbitAssist.strength, 'standard');
  assert.equal(
    emitted.filter((event) => event.type === 'toast' && /Orbit assist.*Standard/.test(event.payload.text)).length,
    0,
    'an internal assist-strength transition must not interrupt play with a toast',
  );
});

test('PQ-005 production controller passes the deterministic 3x3x3 ten-second orbit matrix', async () => {
  assert.equal(
    typeof masslineLab.orbitAssistAcceptanceMatrix,
    'function',
    'the SF-02 lab must expose the production T05 acceptance gate',
  );

  const matrix = await masslineLab.orbitAssistAcceptanceMatrix({ seed: 47 });
  assert.equal(matrix.schema, 'spaceface.masslineControlLab.orbitAssistMatrix.v1');
  assert.equal(matrix.rows.length, 27);
  assert.deepEqual(matrix.summary, { total: 27, pass: 27, fail: 0 });
  assert.ok(matrix.rows.every((row) => row.params.ticks === 600), 'every cell sustains ten fixed-step seconds');
  assert.ok(matrix.rows.every((row) => row.metrics.tangentDominantTick <= 120), 'every cell becomes tangent-dominant within two seconds');
  assert.ok(matrix.rows.every((row) => row.metrics.anchorContact === false), 'no cell contacts its anchor');
  assert.ok(matrix.rows.every((row) => row.metrics.orbitAssistActiveTicks > 0), 'the production controller engages non-vacuously');

  const repeat = await masslineLab.orbitAssistAcceptanceMatrix({ seed: 47 });
  assert.equal(repeat.digest, matrix.digest, 'the whole production matrix is byte-stable across runs');
});
