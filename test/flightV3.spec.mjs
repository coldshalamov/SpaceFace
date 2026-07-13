import assert from 'node:assert/strict';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { applyMasslineFlightModifiers, MASSLINE_FLIGHT_TUNING } from '../src/systems/flightV3.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { advanceFixedTimestep, LOOP_FIXED_DT } from '../src/core/loop.js';
import { estimateBrakingSolution, solveIntercept } from '../src/core/flight/flightTelemetry.js';
import { estimateMasslineResponse, createMasslineRuntime, stepMassline } from '../src/core/constraints/masslineController.js';
import { LocalSpaceIntel, rankTradeRoutes } from '../src/ui/navigation/localSpaceMapModel.js';

const DT = 1 / 60;

function body(overrides = {}) {
  return {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 18,
    inertia: 90,
    radius: 14,
    ...overrides,
  };
}

function advance(b, result, dt = DT) {
  const ax = result.force.x / b.mass;
  const az = result.force.z / b.mass;
  b.vel.x += ax * dt;
  b.vel.z += az * dt;
  b.pos.x += b.vel.x * dt;
  b.pos.z += b.vel.z * dt;
  b.angVel += result.torque.y / b.inertia * dt;
  b.rot += b.angVel * dt;
  if (result.impulse) {
    b.vel.x += result.impulse.x / b.mass;
    b.vel.z += result.impulse.z / b.mass;
  }
}

function simulate({ profile, b, input, ticks, runtime }) {
  let r = runtime || createPropulsionRuntime(profile);
  let last = null;
  for (let i = 0; i < ticks; i++) {
    last = stepPropulsion({ dt: DT, body: b, input: typeof input === 'function' ? input(i) : input, profile, runtime: r });
    r = last.runtime;
    advance(b, last);
  }
  return { body: b, runtime: r, result: last };
}

// 0. Runtime loop catch-up: a 30fps render frame must advance two fixed sim ticks, not slow time.
{
  let ticks = 0;
  const result = advanceFixedTimestep(0, LOOP_FIXED_DT * 2 + 0.001, 1, () => { ticks++; });
  assert.equal(ticks, 2, '30fps presentation should catch up with two 60Hz sim ticks');
  assert.equal(result.steps, 2);
  assert.equal(result.shedBacklog, false);
  assert.ok(result.accumulator > 0 && result.accumulator < LOOP_FIXED_DT);
}

// 0b. Runtime loop remains spiral-safe: extreme stalls are capped and old backlog is shed.
{
  let ticks = 0;
  const result = advanceFixedTimestep(0, LOOP_FIXED_DT * 10, 1, () => { ticks++; });
  assert.equal(ticks, 4, 'extreme stalls should be bounded by the catch-up cap');
  assert.equal(result.steps, 4);
  assert.equal(result.shedBacklog, true);
  assert.equal(result.accumulator, 0);
}

// 0c. A transient 20fps presentation frame should not shed simulation time.
{
  let ticks = 0;
  const result = advanceFixedTimestep(LOOP_FIXED_DT * 0.25, LOOP_FIXED_DT * 3, 1, () => { ticks++; });
  assert.equal(ticks, 3, '50ms presentation should advance three fixed sim ticks');
  assert.equal(result.steps, 3);
  assert.equal(result.shedBacklog, false);
  assert.ok(result.accumulator > 0 && result.accumulator < LOOP_FIXED_DT);
}

// 1. Newtonian coast: neutral controls do not manufacture vacuum drag.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const b = body();
  let sim = simulate({ profile, b, input: { throttle: 1, assistMode: 'newtonian' }, ticks: 60 });
  const speedBefore = Math.hypot(b.vel.x, b.vel.z);
  sim = simulate({ profile, b, runtime: sim.runtime, input: { assistMode: 'newtonian' }, ticks: 120 });
  const speedAfter = Math.hypot(b.vel.x, b.vel.z);
  assert.ok(speedBefore > 40, 'reaction drive should accumulate meaningful velocity');
  assert.ok(Math.abs(speedAfter - speedBefore) < 1e-9, 'newtonian neutral coast must preserve speed');
}

// 2. Assisted neutral uses real counter-thrust and takes time to stop.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const b = body({ vel: { x: 100, z: 0 } });
  const first = stepPropulsion({ dt: DT, body: b, input: { assistMode: 'assisted' }, profile, runtime: createPropulsionRuntime(profile) });
  assert.ok(first.force.x < 0, 'assisted neutral should command counter-thrust');
  advance(b, first);
  const oneTick = b.vel.x;
  assert.ok(oneTick > 95, 'assist must not snap velocity to zero');
  const sim = simulate({ profile, b, runtime: first.runtime, input: { assistMode: 'assisted' }, ticks: 60 });
  assert.ok(sim.body.vel.x > 0 && sim.body.vel.x < oneTick, 'assist should decelerate monotonically over time');
}

// 3. Turning rotates the body but does not rotate its translation vector.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const b = body({ vel: { x: 80, z: 0 } });
  const sim = simulate({ profile, b, input: { turn: 1, assistMode: 'newtonian' }, ticks: 60 });
  assert.ok(Math.abs(sim.body.rot) > 0.4, 'ship should yaw');
  assert.ok(Math.abs(sim.body.vel.z) < 1e-9, 'yaw alone must not bend the velocity vector');
  assert.ok(Math.abs(sim.body.vel.x - 80) < 1e-9, 'yaw alone must conserve linear speed');
}

// 4. Conscious reverse thrust brakes harder than neutral assist.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const bNeutral = body({ vel: { x: 100, z: 0 } });
  const bReverse = body({ vel: { x: 100, z: 0 } });
  const neutral = stepPropulsion({ dt: DT, body: bNeutral, input: { assistMode: 'assisted' }, profile, runtime: createPropulsionRuntime(profile) });
  const reverse = stepPropulsion({ dt: DT, body: bReverse, input: { throttle: -1, assistMode: 'assisted' }, profile, runtime: createPropulsionRuntime(profile) });
  assert.ok(reverse.force.x < neutral.force.x, 'reverse input should add stronger deceleration');
}

// 4b. Deliberate brake spends counter-thruster authority beyond ordinary reverse thrust.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const bReverse = body({ vel: { x: 140, z: 35 } });
  const bBrake = body({ vel: { x: 140, z: 35 } });
  const reverse = stepPropulsion({ dt: DT, body: bReverse, input: { throttle: -1, assistMode: 'assisted' }, profile, runtime: createPropulsionRuntime(profile) });
  const brake = stepPropulsion({ dt: DT, body: bBrake, input: { throttle: -1, brake: true, assistMode: 'assisted' }, profile, runtime: createPropulsionRuntime(profile) });
  assert.ok(brake.force.x < reverse.force.x, 'brake intent should command stronger forward-axis counter-thrust');
  assert.ok(brake.force.z < reverse.force.z, 'brake intent should also cancel lateral drift');
}

// 4c. Reverse-brake after boost should deliberately arrest escape speed.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const b = body();
  let sim = simulate({ profile, b, input: { throttle: 1, boost: true, assistMode: 'assisted' }, ticks: 78 });
  const boostedSpeed = Math.hypot(b.vel.x, b.vel.z);
  sim = simulate({ profile, b, runtime: sim.runtime, input: { throttle: -1, brake: true, assistMode: 'assisted' }, ticks: 54 });
  const brakeSpeed = Math.hypot(b.vel.x, b.vel.z);
  assert.ok(boostedSpeed > 90, 'boost setup should reach a meaningful escape speed');
  assert.ok(brakeSpeed < boostedSpeed * 0.78, 'reverse-brake should arrest boosted speed within the browser probe window');
}

// 5. Gravimetric drive converges to an authored speed envelope.
{
  const profile = PROPULSION_PROFILES.drive_gravimetric_s;
  const b = body();
  const sim = simulate({ profile, b, input: { throttle: 1, assistMode: 'assisted' }, ticks: 600 });
  const speed = Math.hypot(sim.body.vel.x, sim.body.vel.z);
  assert.ok(speed > profile.maxSpeed * 0.98 && speed < profile.maxSpeed * 1.01, 'gravimetric drive should converge to target speed');
}

// 6. Pulse plate turns charge into a discrete momentum impulse.
{
  const profile = PROPULSION_PROFILES.drive_pulse_plate_m;
  const b = body();
  let runtime = createPropulsionRuntime(profile);
  for (let i = 0; i < 60; i++) {
    const r = stepPropulsion({ dt: DT, body: b, input: { boost: true, assistMode: 'newtonian' }, profile, runtime });
    runtime = r.runtime;
  }
  const release = stepPropulsion({ dt: DT, body: b, input: { boostReleased: true, assistMode: 'newtonian' }, profile, runtime });
  assert.ok(release.impulse && release.impulse.x > 0, 'charged plate should emit a forward impulse');
  assert.ok(release.telemetry.firedDeltaV > profile.baseImpulseDv, 'one-second charge should exceed base pulse');
}

// 7. Braking computer returns physically useful markers.
{
  const stop = estimateBrakingSolution(body({ vel: { x: 120, z: 40 } }), PROPULSION_PROFILES.drive_reaction_s);
  assert.ok(Number.isFinite(stop.directDistance) && stop.directDistance > 0);
  assert.ok(Number.isFinite(stop.flipBurnDistance) && stop.flipBurnDistance > 0);
  assert.ok(Number.isFinite(stop.projectedStop.x));
}

// 8. Intercept solver accounts for shooter and target velocity.
{
  const lead = solveIntercept({ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 100, z: 0 }, { x: 0, z: 10 }, 100);
  assert.ok(lead && lead.timeS > 0 && lead.aimPoint.z > 0);
}

// 9. Mass response is mass-ratio driven; no scripted "tractor" velocity cheat.
{
  const response = estimateMasslineResponse(1000, 10);
  assert.ok(response.ownerMotionShare < 0.02);
  assert.ok(response.targetMotionShare > 0.98);
}

// 10. Massline winch reels, heats and breaks under sustained overload.
{
  let runtime = createMasslineRuntime();
  const first = stepMassline({ dt: DT, runtime, command: { reel: -1 }, telemetry: { attachmentId: 'a', restLength: 70, distance: 70, tension: 100, impulse: 2 } });
  assert.ok(first.runtime.targetLength < runtime.targetLength);
  runtime = first.runtime;
  let broken = false;
  for (let i = 0; i < 30; i++) {
    const r = stepMassline({ dt: DT, runtime, command: {}, telemetry: { attachmentId: 'a', restLength: runtime.restLength, distance: 100, tension: 20000, impulse: 500 } });
    runtime = r.runtime;
    if (r.action.cut) { broken = true; break; }
  }
  assert.ok(broken, 'sustained overload should break the Massline');
}

// 11. Local map remembers moving contacts and market beacons without omniscience.
{
  const intel = new LocalSpaceIntel();
  intel.observeContact({ id: 'pirate-1', type: 'ship', hostile: true, pos: { x: 100, z: 0 }, vel: { x: 10, z: 0 } }, { timeS: 0 });
  intel.advance(5);
  const map = intel.buildLocalMap({ player: { id: 'p', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 }, mode: 'tactical' });
  assert.ok(map.contacts[0].position.x > 149, 'remembered contact should project along last known velocity');
  intel.recordMarketBeacon('A', { ore: { buy: 10, stock: 20 } }, { capturedAtS: 0, receivedAtS: 5 });
  intel.recordMarketBeacon('B', { ore: { sell: 25, demand: 20 } }, { capturedAtS: 0, receivedAtS: 5 });
  const routes = rankTradeRoutes({ beacons: intel.marketBeacons, cargoCapacity: 10, nowS: 5, travelEstimator: () => ({ timeS: 60, fuel: 1 }) });
  assert.equal(routes[0].grossProfit, 150);
}

// 12. Assisted speed governor: held throttle settles at combatSpeed instead of growing forever.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const b = body();
  simulate({ profile, b, input: { throttle: 1, assistMode: 'assisted' }, ticks: 1800 }); // 30 s
  const speed = Math.hypot(b.vel.x, b.vel.z);
  assert.ok(speed > profile.combatSpeed * 0.9 && speed < profile.combatSpeed * 1.05,
    `assisted held throttle should settle at combatSpeed (got ${speed.toFixed(1)} vs ${profile.combatSpeed})`);
}

// 12b. Boost raises the governed cap; drift mode stays ungoverned for slingshot play.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const bBoost = body();
  simulate({ profile, b: bBoost, input: { throttle: 1, boost: true, assistMode: 'assisted' }, ticks: 1800 });
  const boostSpeed = Math.hypot(bBoost.vel.x, bBoost.vel.z);
  assert.ok(boostSpeed > profile.combatSpeed * 1.2, 'boost should exceed the un-boosted governed cap');
  assert.ok(boostSpeed < profile.combatSpeed * profile.boostSpeedMult * 1.05, 'boosted speed still governed');
  const bDrift = body();
  simulate({ profile, b: bDrift, input: { throttle: 1, assistMode: 'drift' }, ticks: 1800 });
  const driftSpeed = Math.hypot(bDrift.vel.x, bDrift.vel.z);
  assert.ok(driftSpeed > profile.combatSpeed * 1.5, 'drift throttle must stay ungoverned (trick mode)');
}

// 12c. Overspeed with throttle held converges gently — slingshot speed is spent, not confiscated.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const b = body({ vel: { x: 400, z: 0 } });
  simulate({ profile, b, input: { throttle: 1, assistMode: 'assisted' }, ticks: 60 }); // 1 s
  assert.ok(b.vel.x < 400, 'overspeed under held throttle should decay toward the cap');
  assert.ok(b.vel.x > 380, 'but gently — capped at overspeedBrakeFraction of reverse authority');
}

// 12d. A tagged physics-earned exit decays more slowly, but the tag cannot raise thrust's cap.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const ordinary = body({ vel: { x: 400, z: 0 } });
  const earned = body({ vel: { x: 400, z: 0 } });
  const ordinaryStep = stepPropulsion({
    dt: DT, body: ordinary, input: { throttle: 1, assistMode: 'assisted' },
    profile, runtime: createPropulsionRuntime(profile),
  });
  const earnedStep = stepPropulsion({
    dt: DT, body: earned,
    input: {
      throttle: 1,
      assistMode: 'assisted',
      physicsEarnedMomentum: true,
      earnedMomentumDecayTauS: MASSLINE_FLIGHT_TUNING.MASSLINE_SLING_DECAY_TAU_S,
    },
    profile, runtime: createPropulsionRuntime(profile),
  });
  advance(ordinary, ordinaryStep);
  advance(earned, earnedStep);
  assert.equal(earnedStep.telemetry.governor.physicsEarned, true, 'governor should identify the tagged exit');
  assert.ok(earned.vel.x > ordinary.vel.x, 'physics-earned overspeed should decay more slowly than ordinary overspeed');
  assert.ok(earned.vel.x < 400, 'the exemption should still spend speed rather than freezing it');

  const fromRest = body();
  simulate({
    profile,
    b: fromRest,
    input: { throttle: 1, assistMode: 'assisted', physicsEarnedMomentum: true },
    ticks: 1800,
  });
  assert.ok(fromRest.vel.x < profile.combatSpeed * 1.05,
    'an earned tag must not let thrusters manufacture speed above the ordinary cap');

  const ordinaryOblique = body({ vel: { x: 260, z: 300 } });
  const earnedOblique = body({ vel: { x: 260, z: 300 } });
  simulate({
    profile,
    b: ordinaryOblique,
    input: { throttle: 1, assistMode: 'assisted' },
    ticks: 60,
  });
  simulate({
    profile,
    b: earnedOblique,
    input: {
      throttle: 1,
      assistMode: 'assisted',
      physicsEarnedMomentum: true,
      earnedMomentumDecayTauS: MASSLINE_FLIGHT_TUNING.MASSLINE_SLING_DECAY_TAU_S,
      earnedMomentumAssistScale: MASSLINE_FLIGHT_TUNING.MASSLINE_EARNED_ASSIST_SCALE,
    },
    ticks: 60,
  });
  assert.ok(Math.abs(earnedOblique.vel.z) > Math.abs(ordinaryOblique.vel.z),
    'an oblique sling should retain more of its physics-earned lateral component');
  assert.ok(Math.hypot(earnedOblique.vel.x, earnedOblique.vel.z)
    > Math.hypot(ordinaryOblique.vel.x, ordinaryOblique.vel.z),
  'the earned-momentum grace must preserve scalar speed, not only nose-aligned velocity');
}

// 12e. Cloaked coasting eases neutral assist, never deliberate braking; adapter signals are live.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const normal = stepPropulsion({
    dt: DT, body: body({ vel: { x: 100, z: 40 } }), input: { assistMode: 'assisted' },
    profile, runtime: createPropulsionRuntime(profile),
  });
  const eased = stepPropulsion({
    dt: DT, body: body({ vel: { x: 100, z: 40 } }),
    input: { assistMode: 'assisted', coastAssistScale: MASSLINE_FLIGHT_TUNING.CLOAK_COAST_ASSIST_SCALE },
    profile, runtime: createPropulsionRuntime(profile),
  });
  assert.ok(Math.hypot(eased.force.x, eased.force.z) < Math.hypot(normal.force.x, normal.force.z) * 0.4,
    'cloak coast should move neutral counter-thrust substantially toward Newtonian');

  const normalBrake = stepPropulsion({
    dt: DT, body: body({ vel: { x: 100, z: 40 } }), input: { assistMode: 'assisted', brake: true },
    profile, runtime: createPropulsionRuntime(profile),
  });
  const easedBrake = stepPropulsion({
    dt: DT, body: body({ vel: { x: 100, z: 40 } }),
    input: {
      assistMode: 'assisted',
      brake: true,
      coastAssistScale: 0,
      physicsEarnedMomentum: true,
      earnedMomentumAssistScale: 0,
    },
    profile, runtime: createPropulsionRuntime(profile),
  });
  assert.ok(Math.abs(easedBrake.force.x - normalBrake.force.x) < 1e-9
    && Math.abs(easedBrake.force.z - normalBrake.force.z) < 1e-9,
  'explicit brake must retain full authority while cloaked');

  const previous = {
    enabled: MASSLINE2_FLAGS.enabled,
    throw: MASSLINE2_FLAGS.throw,
    cloak: MASSLINE2_FLAGS.cloak,
  };
  try {
    MASSLINE2_FLAGS.enabled = true;
    MASSLINE2_FLAGS.throw = true;
    MASSLINE2_FLAGS.cloak = true;
    const input = { throttle: 0, strafe: 0, boost: false, brake: false };
    applyMasslineFlightModifiers(input, {
      simTime: 10,
      player: { tether: { slingshotT: 0.5 } },
      massline2: { cloak: { active: true } },
    }, 0);
    assert.equal(input.physicsEarnedMomentum, true, 'live tether slingshot state should tag earned momentum');
    assert.equal(input.earnedMomentumAssistScale, MASSLINE_FLIGHT_TUNING.MASSLINE_EARNED_ASSIST_SCALE,
      'tagged sling state should ease vector-destroying assist during the grace window');
    assert.equal(input.coastAssistScale, MASSLINE_FLIGHT_TUNING.CLOAK_COAST_ASSIST_SCALE,
      'active cloak plus neutral translation should ease coast assist');

    input.throttle = 1;
    applyMasslineFlightModifiers(input, {
      simTime: 10,
      player: { tether: { slingshotT: 0 } },
      massline2: { cloak: { active: true } },
    }, 11);
    assert.equal(input.physicsEarnedMomentum, true, 'massline:selfSling event window should tag earned momentum');
    assert.equal(input.coastAssistScale, 1, 'thrust input should immediately restore normal assist authority');
  } finally {
    MASSLINE2_FLAGS.enabled = previous.enabled;
    MASSLINE2_FLAGS.throw = previous.throw;
    MASSLINE2_FLAGS.cloak = previous.cloak;
  }
}

console.log('SpaceFace Flight V3 generated checks: PASS');
