import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as flightV3Module from '../src/systems/flightV3.js';
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

test('the assist exists only for the explicit forward-plus-turn chord', () => {
  const input = { throttle: 0.6, strafe: 0.2, turn: 0.8, boost: false, brake: false };
  const noForward = orbitStep({ input, forward: 0, lateral: 1 });
  const noTurn = orbitStep({ input, forward: 1, lateral: 0 });
  const off = orbitStep({ input, forward: 1, lateral: 1, strength: 'off' });

  for (const result of [noForward, noTurn, off]) {
    assert.equal(result.active, false);
    assert.deepEqual(result.input, input, 'releasing either chord key restores raw steering immediately');
    assert.equal(Object.hasOwn(result, 'impulse'), false);
  }
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

test('a loaded line does not change ordinary manual yaw authority', () => {
  const baseline = makeFlightHarness();
  const loaded = makeFlightHarness();
  baseline.state.player.tether = null;
  for (const harness of [baseline, loaded]) {
    harness.state.input.moveZ = 0;
    harness.state.input.turnIntent = 1;
  }
  const step = (harness) => {
    const system = Object.create(flightV3Module.flightV3);
    system.init({ state: harness.state, bus: harness.bus });
    system.update(DT, harness.state);
    return consumePhysicsCommand(harness.player).control.torque.y;
  };

  assert.equal(step(loaded), step(baseline));
  assert.equal(loaded.player._flightFrame.orbitAssist.active, false,
    'turn without forward remains raw manual yaw even while tethered');
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

function orbitStep(options = {}) {
  const radius = options.radius ?? 120;
  const tangentialSpeed = options.tangentialSpeed ?? 30;
  const input = options.input || { throttle: 1, strafe: 0, turn: 1, boost: false, brake: false };
  return flightV3Module.stepAnchorRelativeOrbitAssist({
    dt: DT,
    host: {
      pos: { x: radius, z: 0 },
      vel: { x: 0, z: tangentialSpeed },
      rot: options.hostRot ?? Math.PI / 2,
      angVel: 0,
      mass: 20,
      radius: 10,
    },
    anchor: {
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      mass: 2000,
      radius: 20,
    },
    tether: { active: true, targetId: 'anchor', restLength: radius, phase: options.phase || 'loaded' },
    flightIntent: {
      forward: options.forward ?? 1,
      lateral: options.lateral ?? 1,
    },
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
