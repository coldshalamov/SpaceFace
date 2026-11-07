import assert from 'node:assert/strict';
import test from 'node:test';

import { ManeuverKind, normalizeSensorFrame, wrapAngle } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { TacticalAIStack } from '../src/ai/stack.js';
import { aiPorts } from '../src/systems/aiPorts.js';

const directive = { squadId: 'motor-fixture', formation: {
  slot: { x: 0, z: 500 }, velocity: { x: 0, z: 0 }, bound: 170, breakFormation: true,
} };
const intent = { kind: ManeuverKind.INTERCEPT, targetId: null, flightPoint: { x: 0, z: 500 },
  formationSlot: directive.formation.slot, formationVelocity: directive.formation.velocity,
  formationBound: 170, breakFormation: true, enemyMindOwned: true };

function self(over = {}) {
  return { id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 12, hullFraction: 1, energyFraction: 1, heatFraction: 0,
    capabilities: ['drive'], ...over };
}

function plan(planner, tick, body, maneuver = intent) {
  return planner.plan({ tick, entityId: body.id,
    perception: { tick: 0, self: body, contacts: [], events: [] },
    behavior: { maneuver }, directive });
}

test('self sensor preserves a physical yaw rate without inventing one for legacy ports', () => {
  assert.equal(normalizeSensorFrame({ self: self({ angVel: -1.75 }) }, 2, 0).self.angVel, -1.75);
  assert.equal(normalizeSensorFrame({ self: self() }, 2, 0).self.angVel, undefined);
  assert.equal(normalizeSensorFrame({ self: self({ angVel: Infinity }) }, 2, 0).self.angVel, undefined);
});

test('the production body sensor reads current motion without a contact scan or mutable world references', () => {
  const ship = { ...self({ angVel: 0.4 }), alive: true, type: 'ship', occupantGeneration: 'first', data: {} };
  const state = { entities: new Map([[ship.id, ship]]), tick: 0, combat: { entities: {} } };
  const helpers = {};
  const port = { ...aiPorts };
  port.init({ state, helpers });
  const first = structuredClone(helpers.aiSensors.motionFor(ship.id, 0));
  ship.pos.x = 48;
  ship.vel.z = -26;
  ship.rot = 0.3;
  ship.angVel = 1.2;
  const second = helpers.aiSensors.motionFor(ship.id, 3);
  assert.equal(first.pos.x, 0);
  assert.equal(second.pos.x, 48);
  assert.equal(second.vel.z, -26);
  assert.equal(second.angVel, 1.2);
  assert.notEqual(second.pos, ship.pos);
  assert.notEqual(second.vel, ship.vel);
  assert.equal(port._diag.sensorFrames, 0, 'body feedback does not rebuild contacts');
  assert.equal(port._diag.sensorBatches, 0);
  ship.alive = false;
  assert.equal(helpers.aiSensors.motionFor(ship.id, 4), null);
});

test('a motor loop damps existing spin on its first sample rather than accelerating through the heading', () => {
  const planner = new ManeuverPlanner({ config: { torqueSlewPerTick: 1 } });
  const request = plan(planner, 0, self({ angVel: 3 }), { ...intent, faceAngle: 0 });
  assert.ok(request.torqueYaw < -0.4, `already turning past the heading: ${request.torqueYaw}`);
});

test('batched contact memory and fresh self feedback converge on the same quarter-turn as fresh sensors', () => {
  const body = self({ angVel: 0 });
  const cachedSelf = structuredClone(body);
  const sensed = new ManeuverPlanner({ seed: 47, config: { stationaryLimitTicks: 10000 } });
  const batched = new ManeuverPlanner({ seed: 47, config: {
    stationaryLimitTicks: 10000, resolveMotion: () => body,
  } });
  let peakRate = 0;
  let peakHeading = 0;
  for (let tick = 0; tick < 360; tick++) {
    const actual = plan(batched, tick, cachedSelf);
    const expected = plan(sensed, tick, body);
    assert.deepEqual(actual.forceLocal, expected.forceLocal, `translation at tick ${tick}`);
    assert.equal(actual.torqueYaw, expected.torqueYaw, `yaw at tick ${tick}`);
    body.angVel += actual.torqueYaw * 8 / 60;
    body.rot = wrapAngle(body.rot + body.angVel / 60);
    peakRate = Math.max(peakRate, Math.abs(body.angVel));
    peakHeading = Math.max(peakHeading, body.rot);
  }
  assert.ok(Math.abs(body.rot - Math.PI / 2) < 0.04, `final heading ${body.rot}`);
  assert.ok(Math.abs(body.angVel) < 0.08, `settled yaw rate ${body.angVel}`);
  assert.ok(peakRate < 2.8, `bounded quarter-turn rate ${peakRate}`);
  assert.ok(peakHeading < Math.PI / 2 + 0.3, `bounded overshoot ${peakHeading}`);
});

test('the live stack refreshes self motion on a cached authored maneuver without refreshing its contacts', () => {
  const bodies = new Map([[2, self()], [3, self({ id: 3 })]]);
  const scans = [];
  const senses = [];
  const requests = [];
  const stack = new TacticalAIStack({
    config: { runtime: { memberBatchSize: 1 }, maneuver: { torqueSlewPerTick: 1 }, trace: { enabled: false } },
    ports: {
      sensors: {
        frameFor(id, tick) { scans.push([id, tick]); return { tick, self: bodies.get(id), contacts: [], events: [] }; },
        motionFor(id, tick) { senses.push([id, tick]); return bodies.get(id); },
      },
      roster: { listSquads() { return [{ id: 'motor-fixture', doctrine: 'patrol', faction: 'fixture',
        members: [...bodies.keys()].map(id => ({ id, capabilities: ['drive'] })) }]; } },
      actions: { list() { return []; }, canStart() { return { ok: false }; },
        start() { return null; }, status() { return 'idle'; }, interrupt() { return true; } },
      maneuver: { request(value) { requests.push(value); } },
    },
    shapeBehavior: (behavior) => ({ ...behavior, maneuver: { ...intent, faceAngle: 0 } }),
  });
  stack.update(0);
  bodies.get(2).angVel = 3;
  stack.update(1);
  assert.deepEqual(scans.filter(([id]) => id === 2), [[2, 0]], 'no second scan for the cached pilot');
  assert.deepEqual(senses.filter(([id]) => id === 2), [[2, 0], [2, 1]], 'the helm still reads current motion');
  assert.ok(requests.filter(request => request.entityId === 2).at(-1).torqueYaw < -0.4);
});

test('a newly tumbling pilot releases cached controls immediately and resumes with a fresh slew', () => {
  const current = self({ angVel: 0 });
  const cached = structuredClone(current);
  const planner = new ManeuverPlanner({ config: { resolveMotion: () => current } });
  for (let tick = 0; tick < 30; tick++) plan(planner, tick, cached);
  current.tumbling = true;
  const held = plan(planner, 30, cached);
  assert.equal(held.reason, 'decontrolled_tumble');
  assert.deepEqual(held.forceLocal, { forward: 0, right: 0 });
  assert.equal(held.torqueYaw, 0);
  current.tumbling = false;
  const resumed = plan(planner, 31, cached);
  assert.ok(Math.abs(resumed.forceLocal.forward) < 0.08);
  assert.ok(Math.abs(resumed.torqueYaw) < 0.08, 'recovery does not replay the pre-tumble torque');
});

function slotPlanner(slot, velocity) {
  return new ManeuverPlanner({ config: { squadFrames: { planFor() {
    return { slot, slotVel: velocity, bound: 170, speedFraction: 0.8, reason: 'formation_fixture' };
  } } } });
}

test('a formation pilot matched to a moving slot has no spurious braking command', () => {
  const body = self({ vel: { x: 60, z: 0 }, angVel: 0 });
  const request = plan(slotPlanner(body.pos, body.vel), 0, body, { ...intent, enemyMindOwned: false });
  assert.equal(request.forceLocal.forward, 0, 'full slot-velocity feedforward preserves the matched frame');
  assert.equal(request.forceLocal.right, 0);
  assert.equal(request.brake, false);
});

test('a pilot arriving at a stationary slot brakes residual closing speed instead of demanding minimum cruise', () => {
  const body = self({ vel: { x: 10, z: 0 }, angVel: 0 });
  const request = plan(slotPlanner({ x: 3, z: 0 }, { x: 0, z: 0 }), 0, body,
    { ...intent, enemyMindOwned: false });
  assert.ok(request.forceLocal.forward < 0, `arrival must counter closing motion: ${request.forceLocal.forward}`);
});

test('a committed attack corridor keeps flying through a nearby point', () => {
  const body = self({ angVel: 0 });
  const request = plan(new ManeuverPlanner(), 0, body,
    { ...intent, flightPoint: { x: 3, z: 0 }, crossingLane: true });
  assert.ok(request.forceLocal.forward > 0);
  assert.equal(request.brake, false);
});

test('a tracked ship pass changes actual lateral thrust while preserving the committed firing face', () => {
  const planner = new ManeuverPlanner({ seed: 47, config: { inputSlewPerTick: 1 } });
  const body = self({ vel: { x: 60, z: 0 }, angVel: 0 });
  const target = { id: 9, kind: 'ship', alive: true, team: 0, pos: { x: 90, z: 0 },
    vel: { x: 0, z: 0 }, radius: 14, tags: [], confidence: 1 };
  const request = planner.plan({ tick: 0, entityId: body.id,
    perception: { tick: 0, self: body, contacts: [target], events: [] },
    behavior: { maneuver: { ...intent, targetId: target.id, flightPoint: { x: 600, z: 0 },
      faceAngle: 0, crossingLane: true } }, directive });
  assert.ok(Math.abs(request.forceLocal.right) > 0.02,
    `the pass must change the physical force, not just the heading: ${request.forceLocal.right}`);
  assert.equal(request.targetHeading, 0, 'the fixed gun retains its committed bearing');
  assert.equal(request.boost, false);
});
