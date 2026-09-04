import assert from 'node:assert/strict';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { COAST_HELM_YAW_MULT, createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
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

// 3b. Coast helm: idle main thrusters unlock ~20% more yaw authority than while thrusting.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const coast = stepPropulsion({
    dt: DT,
    body: body(),
    input: { turn: 1, assistMode: 'newtonian' },
    profile,
    runtime: createPropulsionRuntime(profile),
  });
  const thrusting = stepPropulsion({
    dt: DT,
    body: body(),
    input: { turn: 1, throttle: 1, assistMode: 'newtonian' },
    profile,
    runtime: createPropulsionRuntime(profile),
  });
  assert.equal(COAST_HELM_YAW_MULT, 1.2, 'coast helm mult is the authored strategic primitive');
  assert.equal(coast.telemetry.coastHelm, true, 'neutral throttle should arm coast helm');
  assert.equal(thrusting.telemetry.coastHelm, false, 'main throttle should lock out coast helm');
  assert.ok(
    Math.abs(coast.telemetry.targetYawRate) > Math.abs(thrusting.telemetry.targetYawRate) * 1.15,
    'coast target yaw rate should be about 20% higher than thrusting'
  );
  assert.ok(
    Math.abs(coast.torque.y) > Math.abs(thrusting.torque.y) * 1.15,
    'coast yaw torque should be about 20% higher than thrusting'
  );

  // Strafe is RCS: it must not cancel the flip bonus (let off main drive, still nimble).
  const strafing = stepPropulsion({
    dt: DT,
    body: body(),
    input: { turn: 1, strafe: 1, assistMode: 'newtonian' },
    profile,
    runtime: createPropulsionRuntime(profile),
  });
  assert.equal(strafing.telemetry.coastHelm, true, 'strafe alone should keep coast helm');
  assert.ok(
    Math.abs(strafing.telemetry.targetYawRate - coast.telemetry.targetYawRate) < 1e-9,
    'strafe should not change coast-helm yaw target'
  );

  // Sustained: coasting nose reaches more heading than thrusting over the same window.
  const coastBody = body();
  const thrustBody = body();
  simulate({ profile, b: coastBody, input: { turn: 1, assistMode: 'newtonian' }, ticks: 45 });
  simulate({ profile, b: thrustBody, input: { turn: 1, throttle: 1, assistMode: 'newtonian' }, ticks: 45 });
  assert.ok(
    Math.abs(coastBody.rot) > Math.abs(thrustBody.rot) * 1.1,
    'coast flip should accumulate meaningfully more heading than thrusting turn'
  );
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

// 12c. Earned-speed rule (design/VISION.md): above the cap, held throttle COASTS. The governor
// bounds what thrust can produce and never spends speed the pilot earned; only the pilot brake does.
// Below the cap the hands-off settle (the nimble regime) is untouched.
{
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const b = body({ vel: { x: 400, z: 0 } });
  simulate({ profile, b, input: { throttle: 1, assistMode: 'assisted' }, ticks: 60 }); // 1 s
  assert.ok(Math.abs(b.vel.x - 400) < 1e-6,
    `held throttle above the cap must neither add nor spend speed (got ${b.vel.x.toFixed(3)})`);
  const handsOff = body({ vel: { x: 400, z: 0 } });
  simulate({ profile, b: handsOff, input: { throttle: 0, assistMode: 'assisted' }, ticks: 60 });
  assert.ok(Math.abs(handsOff.vel.x - 400) < 1e-6,
    `hands-off above the cap coasts — the neutral counter-thrust has blended out (got ${handsOff.vel.x.toFixed(3)})`);
  const braked = body({ vel: { x: 400, z: 0 } });
  simulate({ profile, b: braked, input: { throttle: 0, brake: true, assistMode: 'assisted' }, ticks: 60 });
  assert.ok(braked.vel.x < 390,
    `the pilot brake still spends earned speed with real reverse authority (got ${braked.vel.x.toFixed(1)})`);
  // Must sit under the post-rescale Wasp combatSpeed (105). At 120 this would be
  // overspeed and would coast — the earned-speed rule, not the nimble settle.
  // The bar is the same one this case always asserted: one second hands-off below the cap sheds a
  // clear fraction of speed (it was 120 -> under 110, an 8 % settle; the rescaled drive sheds ~20 %,
  // and 63 keeps the assertion at "at least 10 %" rather than pinning today's exact number).
  const nimble = body({ vel: { x: 70, z: 0 } });
  simulate({ profile, b: nimble, input: { throttle: 0, assistMode: 'assisted' }, ticks: 60 });
  assert.ok(nimble.vel.x < 63,
    `"Nimble in a fight. Zip around, stay in control of the combat area, turn NOW when I twitch, stop when I brake, drift when I choose to. Response starts instantly. The ship feels like a controllable mass, not a cursor." — below the cap the hands-off settle is untouched (got ${nimble.vel.x.toFixed(1)})`);
}

// 12d. The physics-earned tag is telemetry: it cannot raise thrust's cap, and it is no longer
// needed to keep speed — the governor never spends overspeed for anyone.
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
  assert.ok(Math.abs(earned.vel.x - 400) < 1e-6 && Math.abs(ordinary.vel.x - 400) < 1e-6,
    'overspeed is never spent by the governor, tagged or not');

  const fromRest = body();
  simulate({
    profile,
    b: fromRest,
    input: { throttle: 1, assistMode: 'assisted', physicsEarnedMomentum: true },
    ticks: 1800,
  });
  assert.ok(fromRest.vel.x < profile.combatSpeed * 1.05,
    'an earned tag must not let thrusters manufacture speed above the ordinary cap');

  const loadedMassline = body({ vel: { x: 400, z: 0 } });
  const loadedStep = stepPropulsion({
    dt: DT, body: loadedMassline,
    input: {
      throttle: 1,
      assistMode: 'assisted',
      masslineActive: true,
    },
    profile, runtime: createPropulsionRuntime(profile),
  });
  assert.equal(loadedStep.telemetry.governor.engaged, true,
    'an obsolete tether tag must not create a second propulsion policy');
  assert.ok(Math.abs(loadedStep.force.x) < 1e-9,
    'the same overspeed input coasts whether tethered or not — no second propulsion policy, no brake');

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
  // Above the cap the lateral kill has blended out for everyone: an oblique exit keeps its
  // lateral component and its scalar speed with or without the tag.
  const obliqueSpeed = Math.hypot(260, 300);
  assert.ok(Math.abs(Math.abs(ordinaryOblique.vel.z) - 300) < 1e-6,
    'an oblique overspeed exit keeps its lateral component without any tag');
  assert.ok(Math.abs(Math.hypot(earnedOblique.vel.x, earnedOblique.vel.z) - obliqueSpeed) < 1e-6
    && Math.abs(Math.hypot(ordinaryOblique.vel.x, ordinaryOblique.vel.z) - obliqueSpeed) < 1e-6,
  'scalar speed above the cap is preserved, tagged or not');
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

    const loadedInput = { throttle: 1, strafe: 0, boost: false, brake: false };
    applyMasslineFlightModifiers(loadedInput, {
      simTime: 10,
      player: { tether: { active: true, phase: 'loaded' } },
    });
    assert.equal(Object.hasOwn(loadedInput, 'masslineActive'), false,
      'a live tether must not install a separate propulsion mode');
    assert.equal(loadedInput.physicsEarnedMomentum, false,
      'latching alone is not earned release momentum');
    assert.equal(loadedInput.earnedMomentumAssistScale, 1,
      'a live tether uses the same flight-assist policy as ordinary flight');
  } finally {
    MASSLINE2_FLAGS.enabled = previous.enabled;
    MASSLINE2_FLAGS.throw = previous.throw;
    MASSLINE2_FLAGS.cloak = previous.cloak;
  }
}

// 12f. PQ-137.03b: the assisted governor caps PLANAR speed the ship's own translation creates.
// "Thrusters have a cap; physics-earned speed does not get eaten by the brakes."
{
  const vision = 'Thrusters have a cap; physics-earned speed does not get eaten by the brakes.';
  const profile = PROPULSION_PROFILES.drive_reaction_m;
  const cruise = profile.combatSpeed;

  const straight = body();
  simulate({ profile, b: straight, input: { throttle: 1, assistMode: 'assisted' }, ticks: 1800 });
  const straightSpeed = Math.hypot(straight.vel.x, straight.vel.z);
  assert.ok(Math.abs(straightSpeed - cruise) <= cruise * 0.01,
    `"${vision}" — straight assisted cruise stays within 1% of the governed cap (got ${straightSpeed.toFixed(2)} vs ${cruise})`);

  const weave = body();
  simulate({
    profile,
    b: weave,
    input: (i) => ({ throttle: 1, turn: Math.sin(i / 600) * 0.06, assistMode: 'assisted' }),
    ticks: 2400,
  });
  const weaveSpeed = Math.hypot(weave.vel.x, weave.vel.z);
  assert.ok(weaveSpeed <= cruise * 1.02,
    `"${vision}" — a gentle assisted weave must not manufacture speed (got ${weaveSpeed.toFixed(2)} vs cruise ${cruise})`);

  const diagonal = stepPropulsion({
    dt: DT, body: body(), input: { throttle: 1, strafe: 1, assistMode: 'assisted' },
    profile, runtime: createPropulsionRuntime(profile),
  });
  const forwardOnly = stepPropulsion({
    dt: DT, body: body(), input: { throttle: 1, assistMode: 'assisted' },
    profile, runtime: createPropulsionRuntime(profile),
  });
  assert.equal(diagonal.telemetry.governor.cap, forwardOnly.telemetry.governor.cap,
    `"${vision}" — a diagonal W+A command must request one full-cap vector, not two independent caps`);
  assert.ok(Number.isFinite(diagonal.maxSpeed) && diagonal.maxSpeed <= cruise + 1e-9,
    `"${vision}" — diagonal assisted translation publishes a finite control-made bound (got ${diagonal.maxSpeed})`);

  const lateral = stepPropulsion({
    dt: DT, body: body(), input: { strafe: 1, assistMode: 'assisted' },
    profile, runtime: createPropulsionRuntime(profile),
  });
  assert.ok(lateral.telemetry.governor && Number.isFinite(lateral.maxSpeed) && lateral.maxSpeed <= cruise + 1e-9,
    `"${vision}" — pure lateral assisted translation publishes a finite control-made bound (got ${lateral.maxSpeed})`);

  const boosted = stepPropulsion({
    dt: DT, body: body(), input: { throttle: 1, boost: true, assistMode: 'assisted' },
    profile, runtime: createPropulsionRuntime(profile),
  });
  const boostCap = cruise * (Number.isFinite(profile.boostSpeedMult) && profile.boostSpeedMult > 0
    ? profile.boostSpeedMult
    : 1.55);
  assert.ok(Math.abs(boosted.telemetry.governor.cap - boostCap) < 1e-9,
    `"${vision}" — held boost publishes the authored raised cap (got ${boosted.telemetry.governor.cap} vs ${boostCap})`);

  const drift = stepPropulsion({
    dt: DT, body: body(), input: { throttle: 1, strafe: 1, assistMode: 'drift' },
    profile, runtime: createPropulsionRuntime(profile),
  });
  assert.equal(drift.telemetry.governor, null, `"${vision}" — Drift publishes no governor`);
  assert.equal(drift.maxSpeed, Infinity, `"${vision}" — Drift remains ungoverned`);

  const newtonian = stepPropulsion({
    dt: DT, body: body(), input: { throttle: 1, strafe: 1, assistMode: 'newtonian' },
    profile, runtime: createPropulsionRuntime(profile),
  });
  assert.equal(newtonian.telemetry.governor, null, `"${vision}" — Newtonian publishes no governor`);
  assert.equal(newtonian.maxSpeed, Infinity, `"${vision}" — Newtonian remains ungoverned`);

  const handsOff = stepPropulsion({
    dt: DT, body: body({ vel: { x: cruise * 2, z: 0 } }), input: { assistMode: 'assisted' },
    profile, runtime: createPropulsionRuntime(profile),
  });
  assert.equal(handsOff.telemetry.governor, null, `"${vision}" — hands-off coast publishes no governor`);
  assert.equal(handsOff.maxSpeed, Infinity, `"${vision}" — hands-off coast remains ungoverned`);

  const earned0 = Math.hypot(260, 300);
  const earned = body({ vel: { x: 260, z: 300 } });
  simulate({ profile, b: earned, input: { throttle: 1, assistMode: 'assisted' }, ticks: 60 });
  const earned1 = Math.hypot(earned.vel.x, earned.vel.z);
  assert.ok(earned1 >= earned0 * 0.99,
    `"${vision}" — an oblique 2x physics-earned vector keeps >=99% after 1 s of held thrust (got ${earned1.toFixed(2)} from ${earned0.toFixed(2)})`);
}

console.log('SpaceFace Flight V3 generated checks: PASS');
