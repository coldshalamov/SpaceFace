import assert from 'node:assert/strict';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
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

console.log('SpaceFace Flight V3 generated checks: PASS');
