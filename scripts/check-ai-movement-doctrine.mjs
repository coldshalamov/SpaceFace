#!/usr/bin/env node
import assert from 'node:assert/strict';

import { ActivityKind, RulesOfEngagement, applyDoctrineToSelection, movementForActivity } from '../src/ai/doctrine.js';
import { ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';

const ATTACK_DEF = Object.freeze({
  id: 'fixture_attack',
  tags: Object.freeze(['attack']),
  preferredRange: 220,
});

const baseDirective = Object.freeze({
  squadId: 'movement_doctrine_fixture',
  objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 900, reason: 'fixture_focus' }),
  formation: Object.freeze({
    slot: Object.freeze({ x: 0, z: 0 }),
    velocity: Object.freeze({ x: 0, z: 0 }),
    bound: 170,
    breakFormation: true,
  }),
});

assertSelection({
  activity: { kind: ActivityKind.HAIL_HOLD, reason: 'fixture_hail', anchor: { x: -50, z: 10 }, leashRadius: 800 },
  roe: RulesOfEngagement.HOLD_FIRE,
  expectedActionId: null,
  expectedManeuverKind: ManeuverKind.HOLD,
  message: 'hail hold must become a non-firing hold maneuver',
});

assertSelection({
  activity: { kind: ActivityKind.ATTACK_RUN, reason: 'fixture_attack', anchor: { x: 0, z: 0 }, leashRadius: 800 },
  roe: RulesOfEngagement.WEAPONS_FREE,
  expectedActionId: 'fixture_attack',
  expectedManeuverKind: ManeuverKind.INTERCEPT,
  message: 'attack run must preserve a controlled intercept',
});

assertSelection({
  activity: { kind: ActivityKind.REPOSITION, reason: 'fixture_standoff', anchor: { x: 0, z: 0 }, leashRadius: 800 },
  roe: RulesOfEngagement.WEAPONS_FREE,
  expectedActionId: 'fixture_attack',
  expectedManeuverKind: ManeuverKind.ORBIT,
  message: 'standoff activity must become orbit/reposition movement',
});

assertSelection({
  activity: { kind: ActivityKind.RETURN_TO_ANCHOR, reason: 'fixture_return', anchor: { x: 300, z: -120 }, leashRadius: 800 },
  roe: RulesOfEngagement.HOLD_FIRE,
  expectedActionId: null,
  expectedManeuverKind: ManeuverKind.FORMATION,
  expectedSlot: { x: 300, z: -120 },
  message: 'return-to-anchor must rejoin its anchor instead of chasing',
});

const plannerMetrics = runPlannerProbe();
assert.equal(plannerMetrics.holdBoosts, 0, 'hold-fire/hail ships must not boost through the player');
assert(plannerMetrics.holdMaxSpeed <= 26, `hold-fire ship drifted too fast (${plannerMetrics.holdMaxSpeed})`);
assert.equal(plannerMetrics.attackBoosts, 0, 'attack-run ships must not routine boost');
assert(plannerMetrics.attackMaxSpeed <= 120, `attack-run speed envelope leaked (${plannerMetrics.attackMaxSpeed})`);
assert(plannerMetrics.maxTorqueFlip <= 1, `attack-run produced ${plannerMetrics.maxTorqueFlip} high-frequency flip-flops`);

process.stdout.write(JSON.stringify({
  schema: 'spaceface.ai.movement_doctrine.v1',
  selectionCases: 4,
  plannerMetrics,
}, null, 2) + '\n');

function assertSelection({ activity, roe, expectedActionId, expectedManeuverKind, expectedSlot = null, message }) {
  const selected = {
    actionId: 'fixture_attack',
    utility: 0.9,
    eligible: true,
    reasons: [],
    targetId: 900,
    targetContact: { id: 900 },
    minCommitTicks: 12,
    switchMargin: 0.08,
    __spacefaceActionDef: ATTACK_DEF,
    maneuver: {
      kind: ManeuverKind.INTERCEPT,
      targetId: 900,
      preferredRange: 220,
      formationSlot: { x: 0, z: 0 },
      formationVelocity: { x: 0, z: 0 },
      formationBound: 170,
      breakFormation: true,
      reason: 'fixture_attack',
    },
  };
  const out = applyDoctrineToSelection({
    selected,
    perception: {
      self: {
        id: 101,
        pos: { x: -200, z: 0 },
        vel: { x: 0, z: 0 },
        activity,
        roe,
      },
    },
    directive: baseDirective,
    tick: 120,
    freeze: identity,
  });
  assert.equal(out.actionId, expectedActionId, message);
  assert.equal(out.maneuver.kind, expectedManeuverKind, message);
  if (expectedSlot) assert.deepEqual(out.maneuver.formationSlot, expectedSlot, message);
}

function runPlannerProbe() {
  const planner = new ManeuverPlanner({ seed: 0x06110077 });
  const holdSelf = makeSelf({ x: -30, z: 0 });
  const attackSelf = makeSelf({ id: 102, x: -600, z: -40 });
  const target = {
    id: 900,
    kind: 'ship',
    team: 0,
    classification: 'player_ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 14,
    confidence: 1,
    threat: 0.9,
    tags: ['armed'],
  };
  let holdBoosts = 0;
  let attackBoosts = 0;
  let holdMaxSpeed = 0;
  let attackMaxSpeed = 0;
  let maxTorqueFlip = 0;
  let previousTorque = null;
  for (let tick = 0; tick < 90; tick++) {
    const holdRequest = planner.plan({
      tick,
      entityId: 101,
      perception: {
        self: cloneSelf(holdSelf),
        contacts: [target],
        events: [],
      },
      behavior: {
        maneuver: movementForActivity(baseManeuver(ManeuverKind.INTERCEPT), {
          kind: ActivityKind.HAIL_HOLD,
          reason: 'probe_hold',
          anchor: { x: -30, z: 0 },
          leashRadius: 800,
        }, baseDirective, identity),
      },
      directive: baseDirective,
    });
    if (holdRequest.boost) holdBoosts++;
    integrate(holdSelf, holdRequest);
    holdMaxSpeed = Math.max(holdMaxSpeed, round3(speedOf(holdSelf)));

    target.pos.x = Math.sin(tick / 30) * 20;
    const attackRequest = planner.plan({
      tick,
      entityId: 102,
      perception: {
        self: cloneSelf(attackSelf),
        contacts: [target],
        events: [],
      },
      behavior: {
        maneuver: movementForActivity(baseManeuver(ManeuverKind.INTERCEPT), {
          kind: ActivityKind.ATTACK_RUN,
          reason: 'probe_attack',
          anchor: { x: 0, z: 0 },
          leashRadius: 1200,
        }, baseDirective, identity),
      },
      directive: baseDirective,
    });
    if (attackRequest.boost) attackBoosts++;
    if (previousTorque != null && Math.sign(previousTorque) !== Math.sign(attackRequest.torqueYaw) &&
      Math.abs(previousTorque) > 0.24 && Math.abs(attackRequest.torqueYaw) > 0.24) {
      maxTorqueFlip++;
    }
    previousTorque = attackRequest.torqueYaw;
    integrate(attackSelf, attackRequest);
    attackMaxSpeed = Math.max(attackMaxSpeed, round3(speedOf(attackSelf)));
  }
  return { holdBoosts, holdMaxSpeed, attackBoosts, attackMaxSpeed, maxTorqueFlip };
}

function baseManeuver(kind) {
  return {
    kind,
    targetId: 900,
    preferredRange: 220,
    formationSlot: { x: 0, z: 0 },
    formationVelocity: { x: 0, z: 0 },
    formationBound: 170,
    breakFormation: true,
    reason: 'base',
  };
}

function makeSelf(pos) {
  return {
    id: pos.id || 101,
    team: 1,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    hullFraction: 1,
    energyFraction: 1,
    heatFraction: 0,
    disabled: false,
    tethered: false,
    capabilities: ['drive', 'weapon', 'sensor'],
    subsystemFractions: {},
  };
}

function cloneSelf(self) {
  return {
    ...self,
    pos: { ...self.pos },
    vel: { ...self.vel },
    capabilities: self.capabilities.slice(),
    subsystemFractions: { ...self.subsystemFractions },
  };
}

function integrate(self, request) {
  const dt = 1 / 60;
  const c = Math.cos(self.rot), s = Math.sin(self.rot);
  self.rot = wrap(self.rot + request.torqueYaw * 0.018);
  const accel = request.boost ? 220 : 150;
  self.vel.x += (c * request.forceLocal.forward - s * request.forceLocal.right) * accel * dt;
  self.vel.z += (s * request.forceLocal.forward + c * request.forceLocal.right) * accel * dt;
  const drag = request.brake ? 0.84 : 0.985;
  self.vel.x *= drag;
  self.vel.z *= drag;
  self.pos.x += self.vel.x * dt;
  self.pos.z += self.vel.z * dt;
}

function speedOf(self) {
  return Math.hypot(self.vel.x, self.vel.z);
}

function wrap(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function identity(value) {
  return value;
}
