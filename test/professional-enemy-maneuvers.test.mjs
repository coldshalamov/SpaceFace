import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  DOCTRINE_TELEGRAPH_TICKS,
  applyCombatDoctrineToSelection,
} from '../src/ai/combatDoctrine.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';

const FIRE_PHASES = new Set(['strike', 'commit', 'fire_window']);

// Interceptors approach as a wing, announce the attack run, pass through, and continue on a
// committed egress vector before reforming. They never snap straight back toward the target.
{
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  let doctrine = step(runtime, 0, 2, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { x: 0, z: -36, vx: 48, operationalMassBand: 'light' },
    target: { x: 720, z: 0 },
    formationSlot: { x: 0, z: -36 },
  });
  assert.equal(doctrine.phase, 'ingress');
  assert.equal(doctrine.formationLocked, true, 'distant interceptors retain their authored wedge on approach');
  assert.equal(doctrine.fireWindow, false);

  doctrine = step(runtime, 10, 2, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { x: 280, z: -30, vx: 62, operationalMassBand: 'light' },
    target: { x: 620, z: 0 },
    formationSlot: { x: 280, z: -36 },
  });
  assert.equal(doctrine.phase, 'engine_flare');
  assert.equal(doctrine.fireWindow, false);
  assert.equal(doctrine.telegraph.durationTicks, DOCTRINE_TELEGRAPH_TICKS);

  doctrine = step(runtime, 39, 2, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { x: 430, z: -12, vx: 70, operationalMassBand: 'light' }, target: { x: 600, z: 0 },
  });
  assert.equal(doctrine.fireWindow, false, 'the entire telegraph stays weapons-cold');
  doctrine = step(runtime, 40, 2, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { x: 438, z: -10, vx: 70, operationalMassBand: 'light' }, target: { x: 600, z: 0 },
  });
  assert.equal(doctrine.phase, 'strike');
  assert.equal(doctrine.fireWindow, true);

  doctrine = step(runtime, 70, 2, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { x: 645, z: 8, vx: 74, operationalMassBand: 'light' }, target: { x: 600, z: 0 },
  });
  assert.equal(doctrine.phase, 'extend');
  assert.equal(doctrine.fireWindow, false);
  assert.equal(doctrine.maneuverTargetId, null, 'overshoot extension cannot reacquire and orbit the passed target');
  assert(doctrine.flightPoint.x > 900, `extension point must remain ahead of the run, got ${JSON.stringify(doctrine.flightPoint)}`);
  const headingBefore = Math.atan2(doctrine.flightPoint.z - 8, doctrine.flightPoint.x - 645);

  doctrine = step(runtime, 110, 2, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { x: 820, z: 16, vx: 68, operationalMassBand: 'light' }, target: { x: 610, z: 0 },
  });
  assert.equal(doctrine.phase, 'extend', 'minimum egress commitment prevents instant turn-back');
  const headingAfter = Math.atan2(doctrine.flightPoint.z - 16, doctrine.flightPoint.x - 820);
  assert(Math.abs(wrap(headingAfter - headingBefore)) < 0.2, 'egress heading remains stable instead of flip-flopping');

  doctrine = step(runtime, 145, 2, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { x: 1160, z: 22, vx: 64, operationalMassBand: 'light' },
    target: { x: 610, z: 0 },
    formationSlot: { x: 930, z: -36 },
  });
  assert.equal(doctrine.phase, 'reform', 'completed overshoot enters the authored regroup beat');
  assert.equal(doctrine.formationLocked, true);
  assert.equal(doctrine.flightPoint, null,
    'reform must release the committed egress point so the physical planner can reacquire its wing slot');
  const regroupDirective = makeDirective({ x: 930, z: -36 });
  const regroupManeuver = applyCombatDoctrineToSelection(baseSelection(), doctrine).maneuver;
  const regroupRequest = new ManeuverPlanner({ seed: 47 }).plan({
    tick: 145,
    entityId: 2,
    perception: makePerception({ id: 2, x: 1160, z: 22, vx: 64, operationalMassBand: 'light' }, makeTarget({ x: 610, z: 0 })),
    behavior: { maneuver: regroupManeuver },
    directive: regroupDirective,
  });
  const slotHeading = Math.atan2(-36 - 22, 930 - 1160);
  assert(Math.abs(wrap(regroupRequest.targetHeading - slotHeading)) < 0.3,
    `regroup heading must point to the wing slot, got ${regroupRequest.targetHeading.toFixed(3)} vs ${slotHeading.toFixed(3)}`);
}

// Heavy brawlers have their own commit/break rhythm instead of inheriting a light fighter flyby.
{
  const runtime = new CombatDoctrineRuntime({ seed: 71 });
  let doctrine = step(runtime, 0, 22, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { operationalMassBand: 'heavy', mobilityBand: 'low' }, target: { x: 620 },
  });
  assert.equal(doctrine.flightProfile, 'brawler_commit');
  assert.equal(doctrine.phase, 'ingress');
  doctrine = step(runtime, 12, 22, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { x: 160, vx: 52, operationalMassBand: 'heavy', mobilityBand: 'low' }, target: { x: 560 },
  });
  assert.equal(doctrine.phase, 'engine_flare');
  doctrine = step(runtime, 42, 22, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { x: 250, vx: 58, operationalMassBand: 'heavy', mobilityBand: 'low' }, target: { x: 520 },
  });
  assert.equal(doctrine.phase, 'commit');
  assert.equal(doctrine.fireWindow, true);
  doctrine = step(runtime, 100, 22, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { x: 500, vx: 45, operationalMassBand: 'heavy', mobilityBand: 'low' }, target: { x: 520 },
  });
  assert.equal(doctrine.phase, 'commit', 'brawler stays committed long enough to read as a deliberate push');
  doctrine = step(runtime, 145, 22, CombatDoctrineId.INTERCEPTOR_FLYBY, {
    self: { x: 640, vx: 52, operationalMassBand: 'heavy', mobilityBand: 'low' }, target: { x: 520 },
  });
  assert.equal(doctrine.phase, 'breakaway');
  assert.notEqual(doctrine.maneuverKind, ManeuverKind.ORBIT, 'brawlers break away instead of circle-strafing forever');
}

// Snipers spend a real lateral reposition beat between shots and use a wide retreat hysteresis.
{
  const runtime = new CombatDoctrineRuntime({ seed: 89 });
  let doctrine = step(runtime, 0, 30, CombatDoctrineId.RANGED_DISENGAGER, {
    self: { x: 0, z: -60, operationalMassBand: 'medium' }, target: { x: 660, z: 0 },
  });
  const side = doctrine.side;
  assert.equal(doctrine.phase, 'outer_standoff');
  assert.equal(doctrine.fireWindow, false);
  doctrine = step(runtime, 44, 30, CombatDoctrineId.RANGED_DISENGAGER, {
    self: { x: 15, z: 45, operationalMassBand: 'medium' }, target: { x: 650, z: 0 },
  });
  assert.equal(doctrine.phase, 'outer_standoff', 'sniper visibly repositions before charging');
  doctrine = step(runtime, 45, 30, CombatDoctrineId.RANGED_DISENGAGER, {
    self: { x: 20, z: 55, operationalMassBand: 'medium' }, target: { x: 645, z: 0 },
  });
  assert.equal(doctrine.phase, 'charge_cue');
  assert.equal(doctrine.side, side, 'lateral side does not randomly flip between decisions');
  doctrine = step(runtime, 75, 30, CombatDoctrineId.RANGED_DISENGAGER, {
    self: { x: 20, z: 55, operationalMassBand: 'medium' }, target: { x: 640, z: 0 },
  });
  assert.equal(doctrine.phase, 'fire_window');
  assert.equal(doctrine.fireWindow, true);
  doctrine = step(runtime, 76, 30, CombatDoctrineId.RANGED_DISENGAGER, {
    self: { x: 440, z: 0, vx: 0, operationalMassBand: 'medium' }, target: { x: 620, z: 0, vx: -80 },
  });
  assert.equal(doctrine.phase, 'retreat');
  doctrine = step(runtime, 130, 30, CombatDoctrineId.RANGED_DISENGAGER, {
    self: { x: 200, z: 0, vx: -35, operationalMassBand: 'medium' }, target: { x: 610, z: 0 },
  });
  assert.equal(doctrine.phase, 'retreat', 'sniper does not chatter at the old narrow retreat boundary');
  doctrine = step(runtime, 150, 30, CombatDoctrineId.RANGED_DISENGAGER, {
    self: { x: 50, z: 0, vx: -20, operationalMassBand: 'medium' }, target: { x: 620, z: 0 },
  });
  assert.equal(doctrine.phase, 'outer_standoff');
}

// Raiders do not become orbiting murder-tops: the demand gate owns pre-hostility, then one
// telegraphed tether attempt exits on a committed escape vector before any reform.
{
  const peaceful = new CombatDoctrineRuntime({ seed: 101 }).update({
    tick: 0,
    entityId: 40,
    doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: makePerception({ activity: 'hail_hold' }, makeTarget({ x: 180 })),
    directive: makeDirective({ x: 0, z: 0 }),
  });
  assert.equal(peaceful, null, 'a robber still demanding cargo owns no combat maneuver at all');

  const runtime = new CombatDoctrineRuntime({ seed: 101 });
  let doctrine = step(runtime, 0, 40, CombatDoctrineId.TETHER_CONTROL_RAIDER, { target: { x: 300 } });
  assert.equal(doctrine.phase, 'flank');
  assert.equal(doctrine.maneuverKind, ManeuverKind.INTERCEPT, 'raider flanks on an approach vector, not a perpetual orbit');
  doctrine = step(runtime, 10, 40, CombatDoctrineId.TETHER_CONTROL_RAIDER, { target: { x: 120 } });
  assert.equal(doctrine.phase, 'spool_cue');
  doctrine = step(runtime, 40, 40, CombatDoctrineId.TETHER_CONTROL_RAIDER, { target: { x: 105 } });
  assert.equal(doctrine.phase, 'attach_window');
  doctrine = step(runtime, 56, 40, CombatDoctrineId.TETHER_CONTROL_RAIDER, {
    self: { x: 15, vx: 40 }, target: { x: 110 },
  });
  assert.equal(doctrine.phase, 'escape');
  assert.equal(doctrine.allowedActionId, null);
  assert.equal(doctrine.fireWindow, false);
  assert.equal(doctrine.maneuverTargetId, null);
  doctrine = step(runtime, 120, 40, CombatDoctrineId.TETHER_CONTROL_RAIDER, {
    self: { x: -280, vx: -80 }, target: { x: 110 },
  });
  assert.equal(doctrine.phase, 'escape', 'raider commits to escape instead of instantly circling back');
}

// The physical planner steers around a head-on ship on one stable side and keeps a wedge coherent.
{
  const direct = {
    kind: ManeuverKind.INTERCEPT,
    targetId: 1,
    preferredRange: 140,
    formationSlot: { x: 0, z: 0 },
    formationVelocity: { x: 0, z: 0 },
    formationBound: 170,
    breakFormation: true,
    lateralSign: 0,
    reason: 'head_on_collision_fixture',
  };
  const planner = new ManeuverPlanner({ seed: 211 });
  const headings = [];
  const ship = { x: 0, z: 0, vx: 45, vz: 0, rot: 0 };
  let minimumSeparation = Infinity;
  for (let tick = 0; tick < 150; tick++) {
    const request = planner.plan({
      tick,
      entityId: 52,
      perception: makePerception(ship, makeTarget({ x: 88, radius: 18 })),
      behavior: { maneuver: direct },
      directive: makeDirective({ x: 0, z: 0 }),
    });
    if (ship.x < 88) headings.push(request.targetHeading);
    ship.rot = wrap(ship.rot + clamp(wrap(request.targetHeading - ship.rot), -0.08, 0.08));
    ship.vx = Math.cos(ship.rot) * 45;
    ship.vz = Math.sin(ship.rot) * 45;
    ship.x += ship.vx / 60;
    ship.z += ship.vz / 60;
    minimumSeparation = Math.min(minimumSeparation, Math.hypot(88 - ship.x, ship.z));
  }
  assert(Math.max(...headings.map(Math.abs)) >= 0.16, 'head-on collision course receives a visible lateral pass');
  const nonZeroSigns = headings.filter((value) => Math.abs(value) > 0.04).map(Math.sign);
  assert(nonZeroSigns.every((sign) => sign === nonZeroSigns[0]),
    `collision avoidance never pinballs between sides; signs=${compressSigns(nonZeroSigns).join(',')} range=${Math.min(...headings).toFixed(3)}..${Math.max(...headings).toFixed(3)}`);
  assert(minimumSeparation >= 28,
    `head-on pass violated ship separation: minimum=${minimumSeparation.toFixed(3)}`);

  const target = makeTarget({ x: 720, z: 0 });
  const wing = [
    { id: 61, z: -36 },
    { id: 62, z: 36 },
  ].map(({ id, z }) => {
    const runtime = new CombatDoctrineRuntime({ seed: 307 });
    const directive = makeDirective({ x: 0, z });
    const doctrine = runtime.update({
      tick: 0,
      entityId: id,
      doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
      perception: makePerception({ id, x: 0, z, operationalMassBand: 'light' }, target),
      directive,
    });
    const maneuver = applyCombatDoctrineToSelection(baseSelection(), doctrine).maneuver;
    return new ManeuverPlanner({ seed: 307 }).plan({
      tick: 0,
      entityId: id,
      perception: makePerception({ id, x: 0, z, operationalMassBand: 'light' }, target),
      behavior: { maneuver },
      directive,
    });
  });
  assert(Math.abs(wrap(wing[0].targetHeading - wing[1].targetHeading)) < 0.12,
    `formation ingress headings diverged: ${wing.map((request) => request.targetHeading).join(', ')}`);
}

// 100 deterministic seeds: phases remain finite, fire is confined to authored windows, lateral
// decisions never chatter, and every maneuver request is normalized/finite.
for (let seed = 1; seed <= 100; seed++) {
  const runtime = new CombatDoctrineRuntime({ seed });
  let side = null;
  let telegraphTick = null;
  const planner = new ManeuverPlanner({ seed });
  for (let tick = 0; tick <= 240; tick += 3) {
    const selfX = tick < 90 ? tick * 5 : 450 + (tick - 90) * 3;
    const targetX = 600;
    const perception = makePerception({ id: seed + 1000, x: selfX, vx: 70, operationalMassBand: 'light' }, makeTarget({ x: targetX }));
    const directive = makeDirective({ x: selfX, z: 0 });
    const doctrine = runtime.update({
      tick,
      entityId: seed + 1000,
      doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
      perception,
      directive,
    });
    assert(doctrine && typeof doctrine.phase === 'string');
    if (side == null) side = doctrine.side;
    assert.equal(doctrine.side, side, `seed ${seed} lateral side flipped`);
    if (doctrine.telegraphStarted) telegraphTick = tick;
    if (doctrine.fireWindow) {
      assert(FIRE_PHASES.has(doctrine.phase), `seed ${seed} fired in ${doctrine.phase}`);
      assert(telegraphTick != null && tick - telegraphTick >= DOCTRINE_TELEGRAPH_TICKS,
        `seed ${seed} fired before response telegraph completed`);
    }
    const maneuver = applyCombatDoctrineToSelection(baseSelection(), doctrine).maneuver;
    const request = planner.plan({ tick, entityId: seed + 1000, perception, behavior: { maneuver }, directive });
    for (const value of [request.forceLocal.forward, request.forceLocal.right, request.torqueYaw, request.targetHeading]) {
      assert(Number.isFinite(value), `seed ${seed} emitted non-finite maneuver control`);
    }
  }
}

console.log('Professional enemy maneuver checks OK (100 seeds)');

function step(runtime, tick, entityId, doctrineId, values = {}) {
  const self = values.self || {};
  const target = makeTarget(values.target || {});
  return runtime.update({
    tick,
    entityId,
    doctrineId,
    perception: makePerception({ id: entityId, ...self }, target),
    directive: makeDirective(values.formationSlot || { x: self.x || 0, z: self.z || 0 }),
  });
}

function makePerception(self = {}, target = makeTarget()) {
  return {
    self: {
      id: self.id ?? 2,
      team: 1,
      pos: { x: self.x ?? 0, z: self.z ?? 0 },
      vel: { x: self.vx ?? 0, z: self.vz ?? 0 },
      rot: self.rot ?? 0,
      radius: self.radius ?? 14,
      hullFraction: 1,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'weapon', 'ranged'],
      activity: {
        kind: self.activity || 'attack_run', reason: 'professional_maneuver_fixture',
        anchor: { x: 0, z: 0 }, leashRadius: 2600, preferredRange: 180, startedTick: 0,
      },
      roe: self.roe || 'weapons_free',
      combatDoctrineId: self.combatDoctrineId || null,
      operationalMassBand: self.operationalMassBand || 'medium',
      mobilityBand: self.mobilityBand || 'medium',
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
    hostile: values.hostile ?? true,
    confidence: 1,
    threat: values.threat ?? 0.9,
    pos: { x: values.x ?? 600, z: values.z ?? 0 },
    vel: { x: values.vx ?? 0, z: values.vz ?? 0 },
    radius: values.radius ?? 16,
    tethered: values.tethered ?? false,
    operationalMassBand: values.operationalMassBand || 'medium',
    mobilityBand: values.mobilityBand || 'high',
    cargoBand: values.cargoBand || 'valuable',
    tetherabilityBand: values.tetherabilityBand || 'good',
    tags: values.tags || [],
  };
}

function makeDirective(slot) {
  return Object.freeze({
    tick: 0,
    squadId: 'professional_fixture',
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

function wrap(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}

function compressSigns(values) {
  const out = [];
  for (const value of values) if (out[out.length - 1] !== value) out.push(value);
  return out;
}
