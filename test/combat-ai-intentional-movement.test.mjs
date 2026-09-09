import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, DirectorPhase, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import {
  ActivityKind,
  RulesOfEngagement,
  canFireByDoctrine,
  movementForActivity,
  normalizeActivity,
} from '../src/ai/doctrine.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { TacticalAIStack } from '../src/ai/stack.js';
import { clearIneligibleAIFiringIntents } from '../src/systems/aiPorts.js';

test('squad retreat outranks a stale attack-run activity', () => {
  const maneuver = movementForActivity({
    kind: ManeuverKind.INTERCEPT,
    targetId: 1,
    formationSlot: { x: 0, z: 0 },
    formationBound: 170,
    breakFormation: true,
    reason: 'stale_attack_run',
  }, normalizeActivity({
    kind: ActivityKind.ATTACK_RUN,
    reason: 'ambush_attack',
    anchor: { x: 0, z: 0 },
  }), {
    objective: { kind: ObjectiveKind.RETREAT, targetId: null, reason: 'director_or_attrition' },
    formation: { slot: { x: 0, z: 0 }, bound: 170, breakFormation: true },
  });

  assert.equal(maneuver.kind, ManeuverKind.RETREAT);
  assert.equal(maneuver.targetId, null);
  assert.equal(maneuver.breakFormation, true);
  assert.match(maneuver.reason, /director_or_attrition/);
});

test('targeted TRANSIT breaks squad spacing and seeks contact for physical recovery', () => {
  const maneuver = movementForActivity({
    kind: ManeuverKind.FORMATION,
    targetId: null,
    formationSlot: { x: 100, z: 0 },
    formationBound: 170,
    breakFormation: false,
    reason: 'stale_formation',
  }, normalizeActivity({
    kind: ActivityKind.TRANSIT,
    reason: 'curtain_convoy:freight_pod_recovery',
    anchor: { x: 40, z: 12 },
    preferredRange: 20,
    targetId: 7,
    startedTick: 60,
  }), {
    objective: { kind: ObjectiveKind.HOLD, targetId: null, reason: 'weak_contact_picture' },
    formation: { slot: { x: 100, z: 0 }, bound: 170, breakFormation: false },
  });

  assert.equal(maneuver.kind, ManeuverKind.FORMATION);
  assert.equal(maneuver.targetId, 7);
  assert.equal(maneuver.breakFormation, true);
  assert.equal(maneuver.preferredRange, 20);
  assert.equal(maneuver.formationBound, 24);
  assert.deepEqual(maneuver.formationSlot, { x: 40, z: 12 });
  assert.match(maneuver.reason, /freight_pod_recovery/);
});

test('untargeted TRANSIT keeps formation travel for ordinary lane traffic', () => {
  const maneuver = movementForActivity({
    kind: ManeuverKind.HOLD,
    targetId: null,
    formationSlot: { x: 0, z: 0 },
    formationBound: 170,
    breakFormation: false,
    reason: 'lane',
  }, normalizeActivity({
    kind: ActivityKind.TRANSIT,
    reason: 'trade_lane',
    anchor: { x: 500, z: 0 },
    startedTick: 10,
  }), {
    objective: { kind: ObjectiveKind.HOLD, targetId: null, reason: 'hold' },
    formation: { slot: { x: 0, z: 0 }, bound: 170, breakFormation: false },
  });

  assert.equal(maneuver.kind, ManeuverKind.FORMATION);
  assert.equal(maneuver.targetId, null);
  assert.equal(maneuver.breakFormation, false);
});

test('flee and disengage motives cannot keep an offensive fire window alive', () => {
  const target = { id: 1, alive: true };
  const self = { pos: { x: 0, z: 0 } };
  for (const kind of [ActivityKind.FLEE, ActivityKind.DISENGAGE, ActivityKind.RETURN_TO_ANCHOR]) {
    assert.equal(canFireByDoctrine({
      activity: normalizeActivity({ kind, reason: kind, anchor: { x: 0, z: 0 } }),
      roe: RulesOfEngagement.WEAPONS_FREE,
      objectiveKind: ObjectiveKind.FOCUS,
      target,
      self,
    }), false, `${kind} must not retain offensive fire authorization`);
  }
});

test('morale-forced flight overrides a stale attack-run at final execution authority', () => {
  for (const forcedState of [
    { forceFlee: true },
    { fsm: 'flee' },
  ]) {
    const target = liveShip(1, 0, { x: 2200, z: 0 });
    const self = liveShip(2, 1, { x: 2000, z: 0 }, {
      motive: 'cargo_extortion',
      engagementTrigger: 'explicit_refusal',
      zoneId: 'zone_ceres_ambush',
      approachTelegraph: 'engine_flare',
      noFireResponseWindowS: 1,
      combatDoctrineId: 'interceptor_flyby',
      activity: normalizeActivity({
        kind: ActivityKind.ATTACK_RUN,
        reason: 'stale_attack_run',
        anchor: { x: 2000, z: 0 },
        startedTick: 100,
      }),
      roe: RulesOfEngagement.WEAPONS_FREE,
      ...forcedState,
    });
    const entities = new Map([[self.id, self], [target.id, target]]);
    const state = {
      tick: 130,
      playerId: target.id,
      player: { heat: 0 },
      world: { currentSectorId: 'sector_ceres_belt' },
      entities,
      entityList: [...entities.values()],
    };
    assert.deepEqual(authorizeAIEngagement({
      state,
      self,
      target,
      tick: state.tick,
      hostile: true,
      objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
    }), { ok: false, reason: 'activity_non_offensive' });
  }
});

test('morale-forced flight clears a stale weapon bit before the weapon system runs', () => {
  const enemy = liveShip(2, 1, { x: 2000, z: 0 }, {
    forceFlee: true,
    activity: normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'stale_attack_run' }),
    roe: RulesOfEngagement.WEAPONS_FREE,
  });
  enemy.data.intent = { fire: true, fireGroup: 'primary' };
  const state = { playerId: 1, entityList: [enemy] };
  assert.equal(clearIneligibleAIFiringIntents(state), 1);
  assert.equal(enemy.data.intent.fire, false);
  assert.equal(enemy.data.intent.fireGroup, null);
});

test('live tactical stack cancels a doctrine pass when the director orders wing retreat', () => {
  const requests = [];
  let distressActive = false;
  const stack = new TacticalAIStack({
    seed: 47,
    config: {
      trace: { enabled: false },
      director: { distressThreshold: 0.3 },
      runtime: { memberBatchSize: 1 },
    },
    ports: {
      sensors: {
        frameFor(entityId, tick) {
          return tacticalFrame(entityId, tick, distressActive && entityId === 3);
        },
      },
      actions: {
        list() { return []; },
        canStart() { return { ok: true, reason: 'fixture' }; },
        start() { return null; },
        status() { return 'idle'; },
        interrupt() { return true; },
      },
      maneuver: { request(value) { requests.push(value); return true; } },
      roster: {
        listSquads() {
          return [{
            id: 'distressed_wing',
            doctrine: 'scavenger',
            faction: 'fixture',
            formation: 'wedge',
            members: [
              { id: 2, capabilities: ['drive', 'weapon'], combatDoctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY },
              { id: 3, capabilities: ['drive'], combatDoctrineId: null },
              { id: 4, capabilities: ['drive'], combatDoctrineId: null },
            ],
          }];
        },
      },
    },
  });
  stack.director.state.phase = DirectorPhase.BUILD;
  stack.director.state.phaseTick = 200;

  const before = stack.update(1);
  assert.notEqual(before.director.command.type, 'order_retreat');
  distressActive = true;
  const result = stack.update(2);
  const doctrinePilot = result.decisions.find((entry) => entry.entityId === 2);
  const cachedWingmate = result.decisions.find((entry) => entry.entityId === 4);
  assert.equal(result.director.command.type, 'order_retreat');
  assert.equal(doctrinePilot.directive.objective.kind, ObjectiveKind.RETREAT);
  assert.equal(doctrinePilot.combatDoctrine, null);
  assert.equal(doctrinePilot.action.actionId, null);
  assert.equal(doctrinePilot.maneuver.kind, ManeuverKind.RETREAT);
  assert.equal(cachedWingmate.directive.objective.kind, ObjectiveKind.RETREAT,
    'urgent survival orders bypass the ordinary batched-decision cache');
  assert.equal(cachedWingmate.maneuver.kind, ManeuverKind.RETREAT);
  assert.equal(requests.filter((entry) => entry.entityId === 2).at(-1)?.kind, ManeuverKind.RETREAT);
});

test('seeded head-on passes clear both hull radii without side-flip pinballing', () => {
  const target = contact({ id: 1, x: 88, z: 0, radius: 18 });
  const requiredSeparation = 14 + target.radius;
  for (let seed = 1; seed <= 32; seed++) {
    const planner = new ManeuverPlanner({ seed });
    const ship = { x: 0, z: 0, vx: 45, vz: 0, rot: 0, radius: 14 };
    let minimum = Infinity;
    const signs = [];
    for (let tick = 0; tick < 150; tick++) {
      const perception = perceptionFor(ship, target);
      const request = planner.plan({
        tick,
        entityId: seed + 100,
        perception,
        behavior: { maneuver: interceptIntent() },
        directive: directive(),
      });
      const headingError = wrap(request.targetHeading - ship.rot);
      ship.rot = wrap(ship.rot + clamp(headingError, -0.08, 0.08));
      if (Math.abs(request.targetHeading) > 0.04) signs.push(Math.sign(request.targetHeading));
      ship.vx = Math.cos(ship.rot) * 45;
      ship.vz = Math.sin(ship.rot) * 45;
      ship.x += ship.vx / 60;
      ship.z += ship.vz / 60;
      minimum = Math.min(minimum, Math.hypot(target.pos.x - ship.x, target.pos.z - ship.z));
    }
    assert.ok(minimum >= requiredSeparation,
      `seed ${seed} overlapped hulls: ${minimum.toFixed(3)} < ${requiredSeparation}`);
    const nonZero = signs.filter(Boolean);
    assert.ok(nonZero.every((sign) => sign === nonZero[0]),
      `seed ${seed} collision pass flipped sides`);
  }
});

function perceptionFor(ship, target) {
  return {
    self: {
      id: 2,
      team: 1,
      pos: { x: ship.x, z: ship.z },
      vel: { x: ship.vx, z: ship.vz },
      rot: ship.rot,
      radius: ship.radius,
      hullFraction: 1,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'weapon'],
      activity: normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'collision_fixture', anchor: { x: 0, z: 0 } }),
      roe: RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: [target],
    events: [],
  };
}

function contact({ id, x, z, radius }) {
  return {
    id,
    kind: ContactKind.SHIP,
    team: 0,
    alive: true,
    valid: true,
    visible: true,
    hostile: true,
    confidence: 1,
    threat: 0.9,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius,
    tags: [],
  };
}

function interceptIntent() {
  return {
    kind: ManeuverKind.INTERCEPT,
    targetId: 1,
    preferredRange: 140,
    formationSlot: { x: 0, z: 0 },
    formationVelocity: { x: 0, z: 0 },
    formationBound: 170,
    breakFormation: true,
    lateralSign: 0,
    reason: 'seeded_collision_pass',
  };
}

function directive() {
  return {
    squadId: 'seeded_pass',
    objective: { kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture' },
    formation: { slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170, breakFormation: true },
  };
}

function liveShip(id, team, pos, ai = null) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: ai ? { ai } : {},
  };
}

function tacticalFrame(entityId, tick, distressed) {
  return {
    tick,
    self: {
      id: entityId,
      team: 1,
      pos: { x: 0, z: entityId * 12 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 12,
      hullFraction: distressed ? 0.1 : 1,
      energyFraction: 1,
      heatFraction: 0,
      disabled: distressed,
      tethered: false,
      capabilities: distressed ? ['drive'] : ['drive', 'weapon'],
      activity: normalizeActivity({
        kind: ActivityKind.ATTACK_RUN,
        reason: 'stale_attack_run',
        anchor: { x: 0, z: 0 },
        startedTick: 0,
      }),
      roe: RulesOfEngagement.WEAPONS_FREE,
      combatDoctrineId: entityId === 2 ? CombatDoctrineId.INTERCEPTOR_FLYBY : null,
    },
    contacts: [contact({ id: 1, x: 190, z: 0, radius: 12 })],
    events: distressed ? [{ type: 'damage_received', magnitude: 2, sourceId: 1 }] : [],
  };
}

function wrap(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
