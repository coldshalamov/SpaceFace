import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  applyCombatDoctrineToSelection,
} from '../src/ai/combatDoctrine.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { createSimulation } from '../src/core/sim.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { aiPorts } from '../src/systems/aiPorts.js';

function directive() {
  return {
    squadId: 'dart_route',
    tactic: 'focus_fire',
    focusTargetId: 1,
    objective: { kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'dart_route' },
    formation: {
      slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170,
      breakFormation: true,
    },
  };
}

function contact(z = 0) {
  return {
    id: 1,
    kind: ContactKind.SHIP,
    team: 0,
    alive: true,
    valid: true,
    visible: true,
    confidence: 1,
    threat: 0.8,
    hostile: true,
    pos: { x: 400, z },
    vel: { x: 0, z: 0 },
    radius: 12,
    operationalMassBand: 'medium',
    mobilityBand: 'medium',
    cargoBand: 'empty',
    tetherabilityBand: 'good',
    tags: [],
  };
}

function perception(target = contact(), overrides = {}) {
  return {
    self: {
      id: 2,
      team: 1,
      pos: { x: overrides.x ?? 0, z: overrides.z ?? 0 },
      vel: { x: overrides.vx ?? 0, z: overrides.vz ?? 0 },
      rot: overrides.rot ?? 0,
      radius: 8,
      hullFraction: 1,
      energyFraction: 1,
      heatFraction: 0,
      combatRoleId: overrides.combatRoleId ?? 'dart_swarmer',
      maxSpeed: overrides.maxSpeed ?? 172,
      operationalMassBand: 'light',
      activity: { kind: 'attack_run', reason: 'dart_route', anchor: { x: 0, z: 0 }, leashRadius: 2400 },
      roe: 'weapons_free',
    },
    contacts: [target],
    events: [],
  };
}

function selectionFor(doctrine) {
  return applyCombatDoctrineToSelection({
    actionId: doctrine.allowedActionId,
    targetId: doctrine.targetId,
    targetContact: contact(),
    maneuver: {
      kind: ManeuverKind.INTERCEPT,
      targetId: 1,
      preferredRange: 150,
      formationSlot: { x: 0, z: 0 },
      formationVelocity: { x: 0, z: 0 },
      formationBound: 170,
      breakFormation: true,
      reason: 'fixture',
    },
  }, doctrine);
}

test('the authored Dart identity reaches the live AI sensor frame with its uncapped speed', () => {
  const sim = createSimulation({ seed: 1201, systems: [aiPorts] });
  const dart = sim.spawn(makeEnemySpawnSpec('dart_swarmer', 4, { x: 0, z: 0 }));
  const frame = sim.registry.get('aiPorts')._sensorFrameFor(dart.id, sim.state.tick, { freezeResults: false });
  assert.equal(frame.self.combatRoleId, 'dart_swarmer');
  assert.equal(frame.self.maxSpeed, 172);
  assert.equal(frame.self.combatDoctrineId, CombatDoctrineId.INTERCEPTOR_FLYBY);
});

test('Dart locks a straight lane, keeps its 172 speed envelope, and crossing the lane breaks the pass', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 1202 });
  const first = runtime.update({
    tick: 0, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception(), directive: directive(),
  });
  assert.equal(first.flightProfile, 'speed_pass');
  assert.equal(first.phase, 'engine_flare');
  assert.notEqual(first.maneuverKind, ManeuverKind.ORBIT);

  const strike = runtime.update({
    tick: 30, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception(), directive: directive(),
  });
  assert.equal(strike.phase, 'strike');
  assert.equal(strike.straightPass, true);
  assert.equal(strike.maneuverTargetId, null, 'the pass does not continuously re-aim at the target');
  assert.equal(strike.maneuverMaxSpeed, 172, 'the authored Dart ceiling replaces the shared 72 intercept cap');
  assert.ok(strike.flightPoint.x >= 1200 && Math.abs(strike.flightPoint.z) < 1,
    'the locked lane owns a wide extension beyond the target');

  const selection = selectionFor(strike);
  const request = new ManeuverPlanner({ seed: 1202 }).plan({
    tick: 30,
    entityId: 2,
    perception: perception(contact(30), { vx: 100 }),
    behavior: { maneuver: selection.maneuver },
    directive: directive(),
  });
  assert.equal(request.kind, ManeuverKind.INTERCEPT);
  assert.equal(request.brake, false, '100 wu/s remains under the Dart envelope instead of braking toward 72');
  assert.ok(Math.abs(request.targetHeading) < 0.01, 'sub-threshold target motion cannot bend the locked lane');

  const broken = runtime.update({
    tick: 31, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception(contact(60), { vx: 120 }), directive: directive(),
  });
  assert.equal(broken.phase, 'extend');
  assert.equal(broken.outcome, 'lane_crossed');
  assert.equal(broken.maneuverTargetId, null);
  assert.notEqual(broken.maneuverKind, ManeuverKind.ORBIT);
  assert.ok(broken.flightPoint.x >= 1200, 'the broken run extends wide before it reforms');
});

test('ordinary interceptor flybys retain the shared maneuver envelope', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 1203 });
  runtime.update({
    tick: 0, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception(contact(), { combatRoleId: 'scavenger_interceptor', maxSpeed: 147 }), directive: directive(),
  });
  const strike = runtime.update({
    tick: 30, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception(contact(), { combatRoleId: 'scavenger_interceptor', maxSpeed: 147 }), directive: directive(),
  });
  assert.equal(strike.flightProfile, 'flyby');
  assert.equal(strike.maneuverMaxSpeed, null);
  assert.equal(strike.straightPass, false);
  assert.equal(strike.maneuverTargetId, 1);
});
