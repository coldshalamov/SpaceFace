// INF-021 — a decontrolled hostile visibly relents, then re-engages cleanly.
//
// The helm reads decontrol off the same sensor frame as everything else: while the
// tumble status is live the planner cuts all drive (a HOLD with no forces, no torque,
// no boost, no brake), so a yanked ship drifts instead of thrusting through its own
// spin. When the status clears, ordinary planning resumes off current truth.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind, ObjectiveKind, normalizeSensorFrame } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { isTumbling } from '../src/combat/tumbleStatus.js';

test('INF-021: the sensor frame carries decontrol like any other helm fact', () => {
  const tumbling = normalizeSensorFrame({
    tick: 10,
    self: { id: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, tumbling: true },
    contacts: [],
    events: [],
  }, 2, 10);
  assert.equal(tumbling.self.tumbling, true);
  const steady = normalizeSensorFrame({
    tick: 10,
    self: { id: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } },
    contacts: [],
    events: [],
  }, 2, 10);
  assert.equal(steady.self.tumbling, false, 'frames without the flag read as controlled');
});

test('INF-021: tumble status reads off combat state, any other hull reads clean', () => {
  const state = {
    combat: {
      entities: {
        5: { statuses: { status_tumbling: { id: 'status_tumbling', data: { kind: 'massline_tumble' } } } },
      },
    },
  };
  assert.equal(isTumbling(state, 5), true);
  assert.equal(isTumbling(state, { id: 5 }), true);
  assert.equal(isTumbling(state, 6), false);
  assert.equal(isTumbling({}, 5), false);
});

test('INF-021: a tumbling attacker cuts its drive, then re-engages clean', () => {
  const planner = new ManeuverPlanner({ seed: 7, freezeResults: false });
  const directive = makeDirective({ x: 0, z: 0 });
  const behavior = baseSelection();
  const target = makeTarget({ x: 600, z: 0 });

  const hot = planner.plan({
    tick: 100, entityId: 2,
    perception: makePerception({ id: 2, x: 0, z: -36, vx: 48, tumbling: false }, target),
    behavior, directive,
  });
  assert.notEqual(hot.reason, 'decontrolled_tumble', 'precondition: the controlled ship flies its attack');

  const decontrolled = planner.plan({
    tick: 101, entityId: 2,
    perception: makePerception({ id: 2, x: 10, z: -30, vx: 48, tumbling: true }, target),
    behavior, directive,
  });
  assert.equal(decontrolled.kind, ManeuverKind.HOLD);
  assert.equal(decontrolled.reason, 'decontrolled_tumble');
  assert.equal(decontrolled.forceLocal.forward, 0, 'no drive while tumbling');
  assert.equal(decontrolled.forceLocal.right, 0);
  assert.equal(decontrolled.torqueYaw, 0, 'no torque while tumbling');
  assert.equal(decontrolled.boost, false);
  assert.equal(decontrolled.brake, false);

  const reengaged = planner.plan({
    tick: 102, entityId: 2,
    perception: makePerception({ id: 2, x: 20, z: -24, vx: 44, tumbling: false }, target),
    behavior, directive,
  });
  assert.notEqual(reengaged.reason, 'decontrolled_tumble', 'clearing the status resumes planning');
  assert.equal(reengaged.kind, ManeuverKind.INTERCEPT, 'the attack run re-engages off current truth');
});

function makePerception(self = {}, target) {
  return {
    self: {
      id: self.id ?? 2,
      team: 1,
      pos: { x: self.x ?? 0, z: self.z ?? 0 },
      vel: { x: self.vx ?? 0, z: self.vz ?? 0 },
      rot: self.rot ?? 0,
      radius: 14,
      hullFraction: 1,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tumbling: self.tumbling === true,
      tethered: false,
      capabilities: ['drive', 'weapon', 'ranged'],
      activity: {
        kind: 'attack_run', reason: 'inf021_fixture',
        anchor: { x: 0, z: 0 }, leashRadius: 2600, preferredRange: 180, startedTick: 0,
      },
      roe: 'weapons_free',
      combatDoctrineId: null,
      operationalMassBand: 'medium',
      mobilityBand: 'medium',
    },
    contacts: [target],
    events: [],
  };
}

function makeTarget(values = {}) {
  return {
    id: values.id ?? 1,
    kind: ContactKind.SHIP,
    team: 0,
    alive: true,
    valid: true,
    visible: true,
    hostile: true,
    confidence: 1,
    threat: 0.9,
    pos: { x: values.x ?? 600, z: values.z ?? 0 },
    vel: { x: values.vx ?? 0, z: values.vz ?? 0 },
    radius: 16,
    tethered: false,
    operationalMassBand: 'medium',
    mobilityBand: 'high',
    cargoBand: 'valuable',
    tetherabilityBand: 'good',
    tags: [],
  };
}

function makeDirective(slot) {
  return Object.freeze({
    tick: 0,
    squadId: 'inf021_fixture',
    memberId: 2,
    role: 'striker',
    tactic: 'swarm_pincer',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture' }),
    formation: Object.freeze({
      kind: 'wedge', slot: Object.freeze({ x: slot.x, z: slot.z }),
      velocity: Object.freeze({ x: 0, z: 0 }), bound: 170,
      breakFormation: false, breakReason: null,
    }),
  });
}

function baseSelection() {
  return {
    actionId: null,
    targetId: null,
    targetContact: null,
    maneuver: {
      kind: ManeuverKind.INTERCEPT,
      targetId: 1,
      preferredRange: 180,
      formationSlot: { x: 0, z: 0 },
      formationVelocity: { x: 0, z: 0 },
      formationBound: 170,
      breakFormation: true,
      reason: 'fixture',
    },
  };
}
