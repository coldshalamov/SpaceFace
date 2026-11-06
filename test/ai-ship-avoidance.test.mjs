import test from 'node:test';
import assert from 'node:assert/strict';
import { ManeuverKind } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';

function fixture({ speed = 115, targetSpeed = 0, ram = false } = {}) {
  const planner = new ManeuverPlanner({ seed: 7, config: {
    squadFrames: false, inputSlewPerTick: 1, emergencyInputSlewPerTick: 1,
    torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1,
    interceptSpeed: 200, // isolate turning authority below the ordinary cruise governor
  } });
  const target = { id: 1, kind: 'ship', team: 0, alive: true, radius: 14,
    pos: { x: 90, z: 0 }, vel: { x: targetSpeed, z: 0 }, tags: [] };
  const perception = { tick: 1, self: { id: 2, team: 1, radius: 12,
    pos: { x: 0, z: 0 }, vel: { x: speed, z: 0 }, rot: 0, angVel: 0,
    energyFraction: 1, heatFraction: 0, ramAuthorized: ram,
    operationalMassBand: ram ? 'heavy' : 'medium', activity: { kind: 'attack_run' },
  }, contacts: [target] };
  const maneuver = { kind: ManeuverKind.INTERCEPT, targetId: 1, ramAuthorized: ram,
    flightPoint: { x: 600, z: 0 }, formationSlot: { x: 600, z: 0 },
    formationBound: 170, breakFormation: true, reason: 'authored_flyby' };
  const directive = { squadId: 'test-pass', formation: { slot: { x: 600, z: 0 },
    bound: 170, breakFormation: true } };
  const plan = tick => planner.plan({ entityId: 2, tick, perception,
    behavior: { maneuver }, directive });
  return { planner, target, perception, maneuver, plan };
}

test('the commanded passing ray clears the complete ship approach margin', () => {
  const f = fixture();
  const request = f.plan(1);
  // Independent ray/circle geometry: a far-side waypoint can sit outside the ship while
  // the connecting route cuts through it. Its passing ray must clear both hulls + 34 WU.
  const rayClearance = Math.abs(90 * Math.sin(request.targetHeading));
  assert.ok(rayClearance >= 12 + 14 + 34 - 1e-8,
    `planned route must clear the authored approach margin, got ${rayClearance}`);
  assert.equal(request.brake, true, 'carried speed must fit the lateral turn authority');
  assert.equal(request.boost, false);
  assert.ok(Math.abs(request.forceLocal.right) > 0.24,
    'an imminent hull pass may use the existing emergency lateral channel');
  assert.ok(Math.abs(request.forceLocal.forward) <= 1 && Math.abs(request.forceLocal.right) <= 1);
});

test('turn-speed braking uses relative velocity rather than penalizing common drift', () => {
  const stationaryFrame = fixture({ speed: 15 });
  const movingFrame = fixture({ speed: 115, targetSpeed: 100 });
  assert.equal(stationaryFrame.plan(1).brake, false);
  assert.equal(movingFrame.plan(1).brake, false,
    'a common coast must not turn a slow relative approach into emergency braking');
});

test('a clear escaping leg retires an obsolete pass and a new obstacle overrides reversal hold', () => {
  const f = fixture({ speed: 0 });
  f.plan(1);
  f.maneuver.flightPoint = { x: -600, z: 0 };
  f.perception.self.vel = { x: -20, z: 0 };
  const escape = f.plan(2);
  assert.ok(Math.cos(escape.targetHeading) < -0.99,
    'an old far-side waypoint must not turn an already-clear escape back through the target');
  f.maneuver.flightPoint = { x: 600, z: 0 };
  f.perception.self.vel = { x: 100, z: 0 };
  const avoidance = f.plan(3);
  assert.ok(Math.cos(avoidance.targetHeading) > 0,
    'physical avoidance owns the heading even during the readable-arc reversal hold');
  assert.equal(avoidance.brake, true);
});

test('explicit authorized ram targets retain their intentional contact approach', () => {
  const withTarget = fixture({ speed: 30, ram: true });
  const withoutObstacle = fixture({ speed: 30, ram: true });
  withoutObstacle.perception.contacts = [];
  assert.deepEqual(withTarget.plan(1), withoutObstacle.plan(1),
    'ordinary ship avoidance must not silently revoke an explicitly authorized ram');
});

test('a slow following ship outside the motion horizon does not divert an escaping pilot', () => {
  const f = fixture({ speed: 15, targetSpeed: 25 });
  f.target.pos = { x: -140, z: 0 };
  f.maneuver.targetId = null;
  const request = f.plan(1);
  assert.ok(Math.abs(request.targetHeading) < 1e-8,
    'a trailing ship many seconds from the clearance margin is not an imminent collision');
  assert.ok(request.forceLocal.forward > 0);
  assert.equal(request.brake, false);
});

test('expired passes for vanished contacts retire while the pilot remains alive and tumbling', () => {
  const f = fixture({ speed: 0 });
  f.plan(1);
  const runtime = f.planner.byEntity.get(2);
  const first = runtime.collisionPasses.get(1);
  assert.ok(first, 'the real planner admitted the first collision pass');
  f.perception.contacts = [{ ...f.target, id: 3 }];
  f.plan(121);
  const second = runtime.collisionPasses.get(3);
  assert.ok(second, 'a later contact owns its own later deadline');

  f.perception.contacts = [];
  f.perception.self.tumbling = true;
  f.plan(first.untilTick);
  assert.strictEqual(runtime.collisionPasses.get(1), first,
    'the existing expiry policy includes its last valid tick');
  f.plan(first.untilTick + 1);
  assert.equal(runtime.collisionPasses.has(1), false,
    'a vanished contact expires without reappearing in the sensor frame');
  assert.strictEqual(runtime.collisionPasses.get(3), second,
    'expiry must preserve another contact whose pass is still valid');
  f.plan(second.untilTick + 1);
  assert.equal(runtime.collisionPasses.size, 0);
  assert.strictEqual(f.planner.byEntity.get(2), runtime,
    'the long-lived pilot was not forgotten to obtain cleanup');
});


test('a close co-moving ally does not become a static wall across the intended route', () => {
  for (const speed of [15, 115]) {
    const f = fixture({ speed, targetSpeed: speed });
    f.target.team = f.perception.self.team;
    f.target.pos = { x: 40, z: 0 };
    f.maneuver.targetId = null;
    const request = f.plan(1);
    assert.equal(f.planner.byEntity.get(2).collisionPasses.size, 0,
      'shared drift inside the approach padding is not an impending hull collision');
    assert.ok(Math.cos(request.targetHeading) > 0.99, 'the companion can keep its forward route');
    assert.equal(request.brake, false, 'a safe convoy does not spend an emergency brake');
  }
});

test('an allied head-on closure still owns physical collision avoidance', () => {
  const f = fixture({ speed: 50, targetSpeed: -50 });
  f.target.team = f.perception.self.team;
  f.maneuver.targetId = null;
  const request = f.plan(1);
  assert.equal(f.planner.byEntity.get(2).collisionPasses.size, 1,
    'an actual bounded-horizon hull threat remains an emergency regardless of team');
  assert.ok(Math.abs(90 * Math.sin(request.targetHeading)) >= 12 + 14 + 34 - 1e-8,
    'the emergency pass still clears the complete authored approach margin');
  assert.equal(request.brake, true);
  assert.equal(request.boost, false);
});
