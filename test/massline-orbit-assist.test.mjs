import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as flightV3Module from '../src/systems/flightV3.js';
import { ORBIT_ASSIST_TUNING_V1 } from '../src/core/flight/orbitAssist.js';
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

test('R2 radial-facing starts use a small correction without replacing physical angular motion', () => {
  const capFraction = ORBIT_ASSIST_TUNING_V1.maxHeadingCorrectionRateFraction;
  assert.ok(capFraction > 0 && capFraction < 0.5,
    'heading correction has its own small cap below half of full yaw authority');

  const long = orbitStep({
    radius: 220,
    tangentialSpeed: 60,
    hostRot: 0,
    anchorAhead: true,
  });
  const short = orbitStep({
    radius: 72,
    tangentialSpeed: 60,
    hostRot: 0,
    anchorAhead: true,
  });

  for (const result of [long, short]) {
    assert.equal(result.active, true);
    assert.ok(Math.abs(result.telemetry.desiredYawRate) > 0.05,
      'a radial-facing launch still requests visible yaw');
    assert.ok(Math.abs(result.telemetry.desiredYawRate) < result.telemetry.maxYawRate * 0.9,
      'heading alignment cannot take over at full yaw rate');
    assert.ok(Math.abs(result.telemetry.alignmentYawRate)
      <= result.telemetry.headingCorrectionLimit + 1e-12);
    assert.equal(result.telemetry.headingCorrectionSaturated, true,
      'the large radial heading error is bounded independently');
    assert.equal(result.telemetry.headingDirectionCommitted, true,
      'the radial tie is resolved in the player-selected orbit direction');
    assert.equal(
      Math.sign(result.telemetry.alignmentYawRate),
      Math.sign(result.telemetry.orbitalYawRate),
      'radial alignment must reinforce rather than cancel physical swing feed-forward',
    );
  }
  assert.ok(Math.abs(short.telemetry.orbitalYawRate) > Math.abs(long.telemetry.orbitalYawRate),
    'radial-facing nose correction leaves the stronger 72 WU physical feed-forward intact');
});

test('R2 signed heading offsets preserve feed-forward and release either chord key immediately', () => {
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
    input: raw, forward: 1, lateral: 0,
  });
  assert.deepEqual(noForward.input, raw);
  assert.deepEqual(noTurn.input, raw);
  assert.equal(noForward.active, false);
  assert.equal(noTurn.active, false);
});

test('R2 heading recovery is symmetric across direction, strength, angle wrap, and capture boundary', () => {
  const radialByDirection = new Map();
  for (const direction of [-1, 1]) {
    const result = orbitStep({
      radius: 72,
      tangentialSpeed: 60,
      hostRot: 0,
      anchorAhead: true,
      lateral: direction,
    });
    radialByDirection.set(direction, result);
    assert.equal(result.telemetry.selectedDirection, direction);
    assert.equal(Math.sign(result.telemetry.orbitalYawRate), direction);
    assert.equal(Math.sign(result.telemetry.alignmentYawRate), direction);
    assert.equal(result.telemetry.headingDirectionCommitted, true);
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
      hostRot: 0,
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
    const probe = orbitStep({ anchorAhead: true, lateral: direction, hostRot: desiredHeading });
    const boundary = probe.telemetry.headingCaptureAngle;
    const insideHeading = desiredHeading + direction * (boundary - 1e-6);
    const outsideHeading = desiredHeading + direction * (boundary + 1e-6);
    const inside = orbitStep({ anchorAhead: true, lateral: direction, hostRot: insideHeading });
    const outside = orbitStep({ anchorAhead: true, lateral: direction, hostRot: outsideHeading });
    assert.equal(inside.telemetry.headingDirectionCommitted, false,
      `${direction}: immediately inside capture uses shortest-path trim`);
    assert.equal(outside.telemetry.headingDirectionCommitted, true,
      `${direction}: immediately outside capture commits to the held orbit direction`);
    assert.equal(Math.sign(inside.telemetry.alignmentYawRate), -direction);
    assert.equal(Math.sign(outside.telemetry.alignmentYawRate), direction);
  }
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
  assert.ok(matrix.rows.every((row) => row.metrics.correctionBounded));
  assert.ok(matrix.rows.every((row) => row.metrics.orbitAssistActiveTicks > 0));
  assert.ok(matrix.rows.every((row) => Number.isFinite(row.metrics.worstDesiredYawRateRatio)));
  assert.ok(matrix.rows.every((row) => row.metrics.worstDesiredYawRateRatio < 0.9));
  assert.ok(matrix.rows.every((row) => row.metrics.worstDesiredYawRateRatio
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
        assert.ok(short.metrics.initialAbsDesiredYawRate > long.metrics.initialAbsDesiredYawRate,
          `${direction}/${strength}/${headingCase}: short line requests faster yaw`);
        assert.ok(short.metrics.actualYawDelta30Ticks > long.metrics.actualYawDelta30Ticks,
          `${direction}/${strength}/${headingCase}: short line produces more visible hull yaw`);
      }
    }
  }

  const repeat = await masslineLab.orbitAssistHeadingAcceptanceMatrix({ seed: 47 });
  assert.equal(repeat.digest, matrix.digest);
});

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
