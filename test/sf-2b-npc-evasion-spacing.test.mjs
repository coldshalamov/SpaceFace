// SF-2b (#4) NPC evasion and engagement spacing. Proven end to end by the tuning-lab bench
// (scripts/lab/benches/npcEvasion.mjs on lab/tuning-phase1); these pin the mechanisms.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CombatDoctrineId, CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';

function perception(self, target) {
  return {
    self: {
      id: 2, team: 1, rot: self.rot ?? 0,
      pos: { x: self.x ?? 0, z: self.z ?? 0 }, vel: { x: self.vx ?? 0, z: self.vz ?? 0 },
      combatDoctrineId: CombatDoctrineId.SWARM_PACK,
      activity: { kind: ActivityKind.ATTACK_RUN, reason: 'sf2b_test', anchor: { x: 0, z: 0 },
        leashRadius: 2600, preferredRange: 120, startedTick: 0 },
      roe: RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: [{
      id: 1, kind: ContactKind.SHIP, alive: true, valid: true, visible: true, ageTicks: 0,
      hostile: true, confidence: 1, threat: 0.8, tethered: false,
      pos: { x: target.x ?? 0, z: target.z ?? 0 }, vel: { x: target.vx ?? 0, z: target.vz ?? 0 },
      operationalMassBand: 'medium', mobilityBand: 'medium', cargoBand: 'empty',
      tetherabilityBand: 'good', tags: [],
    }],
  };
}
const directive = Object.freeze({
  tick: 0, squadId: 'sf2b', memberId: 2, role: 'striker', tactic: 'standoff_focus', focusTargetId: 1,
  objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture' }),
  formation: Object.freeze({ kind: 'wedge', slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }),
    bound: 170, breakFormation: false, breakReason: null }),
});
const step = (runtime, tick, self, target) => runtime.update({
  tick, entityId: 2, doctrineId: CombatDoctrineId.SWARM_PACK, perception: perception(self, target), directive,
});
const awayCos = (point, self, target) => {
  const fx = point.x - self.x, fz = point.z - (self.z ?? 0);
  const ax = self.x - target.x, az = (self.z ?? 0) - (target.z ?? 0);
  return (fx * ax + fz * az) / (Math.hypot(fx, fz) * Math.hypot(ax, az));
};

// Drive a swarm pass at a fixed geometry until its strike ends; returns the first extend snapshot.
function runPassToExtend(runtime, self, target, maxTick = 400) {
  for (let tick = 0; tick <= maxTick; tick++) {
    const result = step(runtime, tick, self, target);
    if (result.phase === 'extend') return { result, tick };
  }
  return { result: null, tick: Infinity };
}

test('an extend that starts while still flying at the target points out of its reach', () => {
  // Master aimed the egress along the current velocity, so a pass that timed out before crossing
  // "extended" straight back into the target (wasp extend closed 118 -> 66 WU in the bench).
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  const self = { x: 0, z: 0, vx: 70, vz: 0 };
  const target = { x: 150, z: 0 };
  const { result } = runPassToExtend(runtime, self, target);
  assert.ok(result, 'the pass reaches its extend');
  assert.ok(result.flightPoint, 'the extend carries a committed egress point');
  assert.ok(awayCos(result.flightPoint, self, target) > 0.7,
    `egress must point away from the target, got cos ${awayCos(result.flightPoint, self, target).toFixed(2)}`);
});

test('a strike that has not closed into its band keeps closing instead of timing out', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  const self = { x: 0, z: 0, vx: 30, vz: 0 };
  const far = { x: 290, z: 0 };
  let strikeTick = null;
  let tick = 0;
  for (; tick <= 400; tick++) {
    const r = step(runtime, tick, self, far);
    if (r.phase === 'strike' && strikeTick == null) strikeTick = tick;
    if (r.phase === 'extend') break;
  }
  assert.ok(strikeTick != null, 'the pass enters its strike');
  assert.ok(tick - strikeTick > 120,
    `a pass still 290 WU out has not happened yet; the 44-tick clock must not end it (ended after ${tick - strikeTick})`);
  assert.ok(tick - strikeTick <= 241, `a pass that never closes still ends at the cap, ended after ${tick - strikeTick}`);

  // Inside the band the original 44-tick window still applies from band entry.
  const inBand = new CombatDoctrineRuntime({ seed: 47 });
  const near = { x: 150, z: 0 };
  const { tick: extendTick } = runPassToExtend(inBand, { x: 0, z: 0, vx: 0, vz: 0 }, near);
  assert.ok(extendTick <= 30 + 1 + 44 + 2, `an in-band strike keeps its short window, extended at ${extendTick}`);
});

test('a committed egress point is re-aimed when the live target moves across it', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  const self = { x: 0, z: 0, vx: 70, vz: 0 };
  const { result, tick } = runPassToExtend(runtime, self, { x: 150, z: 0 });
  assert.ok(result && result.flightPoint);
  // The target now sits on the egress side; the stale point would fly into it.
  const moved = { x: result.flightPoint.x * 0.3, z: result.flightPoint.z * 0.3 };
  const next = step(runtime, tick + 1, self, moved);
  assert.equal(next.phase, 'extend');
  assert.ok(awayCos(next.flightPoint, self, moved) > 0.7,
    `the leg must follow the live target out of reach, got cos ${awayCos(next.flightPoint, self, moved).toFixed(2)}`);
});

test('a swarm extend runs long enough to open range before it re-forms', () => {
  // 90 ticks was shorter than a light hull needs to turn off a pass; the 320 WU exit is unchanged.
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  const self = { x: 0, z: 0, vx: 0, vz: 0 };
  const target = { x: 150, z: 0 };
  const { tick } = runPassToExtend(runtime, self, target);
  let phase = 'extend';
  let t = tick + 1;
  for (; t < tick + 400 && phase === 'extend'; t++) phase = step(runtime, t, self, target).phase;
  assert.ok(t - tick > 120, `an extend still inside the band holds past 90 ticks, re-formed after ${t - tick}`);
  assert.ok(t - tick <= 152, `but it is still bounded, re-formed after ${t - tick}`);
});

function orbitPlan(planner, selfPos, vel, targetPos, contacts = []) {
  const target = { id: 1, kind: 'ship', pos: targetPos, vel: { x: 0, z: 0 }, radius: 10, tags: [], confidence: 1, hostile: true };
  const perceptionValue = { tick: 1, self: { id: 2, team: 1, pos: selfPos, vel, rot: Math.atan2(targetPos.z - selfPos.z, targetPos.x - selfPos.x),
    radius: 12, energyFraction: 1, heatFraction: 0, combatDoctrineId: CombatDoctrineId.SWARM_PACK }, contacts: [target, ...contacts] };
  const maneuver = { kind: ManeuverKind.ORBIT, targetId: 1, preferredRange: 120, formationSlot: { ...targetPos },
    formationBound: 170, breakFormation: true };
  const dir = { squadId: 'orbit', formation: { slot: { ...targetPos }, bound: 170, breakFormation: true } };
  return planner.plan({ entityId: 2, tick: 1, perception: perceptionValue, behavior: { maneuver }, directive: dir });
}

test('an orbit far outside its ring closes at intercept pace, not the ring-keeping 24 WU/s brake', () => {
  const planner = new ManeuverPlanner({ seed: 7, config: { inputSlewPerTick: 1,
    emergencyInputSlewPerTick: 1, torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1 } });
  // 300 WU out of a 120 WU ring, already closing at 45 WU/s.
  const far = orbitPlan(planner, { x: 0, z: 0 }, { x: 45, z: 0 }, { x: 420, z: 0 });
  assert.ok(far.forceLocal.forward > 0.18,
    `the closing brake must not park a striker 300 WU out, forward ${far.forceLocal.forward}`);
  // Near the ring the brake still applies.
  const planner2 = new ManeuverPlanner({ seed: 7, config: { inputSlewPerTick: 1,
    emergencyInputSlewPerTick: 1, torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1 } });
  const near = orbitPlan(planner2, { x: 0, z: 0 }, { x: 45, z: 0 }, { x: 150, z: 0 });
  assert.ok(near.forceLocal.forward <= 0.18, `on the ring the closing brake still holds, forward ${near.forceLocal.forward}`);
});

test('a volley jink owns the strafe channel at reflex authority', () => {
  const slew = { inputSlewPerTick: 1, emergencyInputSlewPerTick: 1, torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1 };
  // A round inbound on a near-miss course (eta < 1.15 s), from the orbit's target side.
  const round = { id: 77, kind: ContactKind.PROJECTILE || 'projectile', hostile: true, alive: true, team: 0,
    pos: { x: 120, z: 8 }, vel: { x: -420, z: 0 }, radius: 2, tags: [], confidence: 1 };
  let checked = 0;
  for (const entityId of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const shipped = new ManeuverPlanner({ seed: 7, config: slew });
    const weak = new ManeuverPlanner({ seed: 7, config: { ...slew, reflexStrafeAuthority: 0 } });
    const plan = (planner) => {
      const target = { id: 1, kind: 'ship', pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, tags: [], confidence: 1, hostile: true };
      // Nose across the round's path so the sidestep is a pure local-right push.
      const p = { tick: 1, self: { id: entityId, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI / 2, radius: 12,
        energyFraction: 1, heatFraction: 0, combatDoctrineId: CombatDoctrineId.SWARM_PACK }, contacts: [target, round] };
      const maneuver = { kind: ManeuverKind.ORBIT, targetId: 1, preferredRange: 200, formationSlot: { x: 200, z: 0 }, formationBound: 170, breakFormation: true };
      const request = planner.plan({ entityId, tick: 1, perception: p, behavior: { maneuver }, directive: { squadId: 'j', formation: { slot: { x: 200, z: 0 }, bound: 170, breakFormation: true } } });
      return { request, reflex: planner.byEntity.get(entityId).lastReflex };
    };
    const a = plan(shipped);
    if (a.reflex !== 'volley_jink') continue;
    const b = plan(weak);
    checked++;
    assert.ok(Math.abs(a.request.forceLocal.right) > 0.45,
      `the sidestep must actually push the hull sideways, right ${a.request.forceLocal.right}`);
    // Without reflex authority the on-ring orbit throttle (~0) zeroes the sidestep entirely.
    assert.ok(Math.abs(a.request.forceLocal.right) > Math.abs(b.request.forceLocal.right) + 0.3,
      `reflex authority is what moves the hull (${a.request.forceLocal.right} vs ${b.request.forceLocal.right})`);
  }
  assert.ok(checked > 0, 'at least one swarm pilot jinks the inbound round');
});
