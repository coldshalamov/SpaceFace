// Closed-loop formation rig (Controlled Chaos packet 03).
//
// Runs a leader + followers through the REAL stack, with production port defaults:
//   perception -> SquadCommander / SquadFrameDirector -> ManeuverPlanner -> aiPorts actuator
//   requests -> flightV3 / physics (rapier-dynamic).
// The only synthetic parts are the labelled DIAGNOSTIC INTERVENTIONS:
//   - `leaderPath` / `targetPath` drive the leader (or the hostile target) through a scripted
//     route using the same ManeuverPlanner + actuator request port every other hull uses, so the
//     reference the followers chase is a REAL moving, turning, accelerating body;
//   - `kill`, `impulse`, `tumble` are the disruption events (death, shove, decontrol) that other
//     systems deliver in the live game.
// Nothing here writes a pose or a velocity: a diagnostic never "fixes" the controller.
//
// This module is test infrastructure (src/testing/**). The game never imports it.

import { wrapAngle } from '../ai/contracts.js';
import { ManeuverPlanner } from '../ai/maneuver.js';
import { core } from '../core/coreSystem.js';
import { createGameState } from '../core/gameState.js';
import { physics } from '../core/physics.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse, readPhysicsTelemetry } from '../core/physicsAuthority.js';
import { flightV3 } from '../systems/flightV3.js';
import { aiPorts } from '../systems/aiPorts.js';
import { createTacticalAISystem } from '../systems/tacticalAI.js';
import { createFormationRecorder } from './formationMetrics.js';

export const RIG_DT = 1 / 60;
export const RIG_SEED = 0x4706f0;

/** Default hull used by the SG-06 convergence harness; mass/thrust overrides per member. */
export function rigShipSpec({
  x = 0, z = 0, rot = 0, mass = 32, radius = 12, thrust = 90, turnRate = 3, team = 1,
  factionId = 'faction_scn', inertia = 88, ai = null, vx = 0, vz = 0, hull = 150,
} = {}) {
  return {
    type: 'ship',
    alive: true,
    collides: true,
    radius,
    mass,
    thrust,
    turnRate,
    drag: 1.2,
    maxSpeed: 140,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot,
    team,
    factionId,
    hull,
    hullMax: hull,
    armorHp: 40,
    armorMax: 40,
    armorFlat: 2,
    shield: 60,
    shieldMax: 60,
    cap: 100,
    capMax: 100,
    capRegen: 8,
    flightModel: { inertia },
    data: {
      ai,
      combatProfileId: 'combat_profile_standard_ship',
    },
  };
}

export function noopActionPort() {
  return Object.freeze({
    list() { return Object.freeze([]); },
    canStart() { return { ok: false, reason: 'formation_rig_no_actions' }; },
    start() { return null; },
    status() { return 'failed'; },
    interrupt() { return false; },
  });
}

function createBus() {
  const listeners = new Map();
  return {
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, set = new Set());
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(event, payload) {
      for (const fn of [...(listeners.get(event) || [])]) fn(payload, event);
    },
    queue(event, payload) { this.emit(event, payload); },
    flush() {},
  };
}

/**
 * @param {object} config
 * @param {Array}  config.members      [{ x, z, rot, mass, radius, thrust, turnRate, ai }] - FIRST is the
 *                                      leader (roster order is entity id, spawn order = id order).
 * @param {string} [config.formation]  'line' | 'wedge' | 'ring' (ai.formation of every member)
 * @param {object} [config.target]     optional hostile target (the "player"): rigShipSpec fields. When
 *                                      set, members get an attack_run activity against it so the
 *                                      engaged-squad (SquadFrameDirector) path is exercised.
 * @param {Function} [config.leaderPath]  (tSec) => {x,z,vx,vz}|null  DIAGNOSTIC: scripted leader route
 * @param {Function} [config.targetPath]  (tSec) => {x,z,vx,vz}|null  DIAGNOSTIC: scripted target route
 * @param {object} [config.tactical]   extra createTacticalAISystem config (squad/maneuver sections)
 */
export async function createFormationRig(config = {}) {
  const dt = RIG_DT;
  const state = createGameState(config.seed ?? RIG_SEED);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  if (!state.combat) state.combat = {};
  if (!state.combat.entities) state.combat.entities = {};
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: { get() { return null; } } };
  const sys = {
    core: Object.create(core),
    physics: Object.create(physics),
    flight: Object.create(flightV3),
    aiPorts: Object.create(aiPorts),
  };
  sys.core.init(ctx);
  sys.physics.init(ctx);
  sys.aiPorts.init(ctx);
  sys.flight.init(ctx);
  const rebuildSpatialHash = () => state.spatialHash.rebuild(state.entityList);

  const squadId = config.squadId || 'formation_rig_wing';
  const formation = config.formation || 'line';
  const spacing = config.spacing ?? 72;
  const bound = config.bound ?? 170;
  const doctrine = config.doctrine || 'official';

  const memberSpecs = config.members || [];
  const ids = [];
  const roleOf = new Map();
  for (let i = 0; i < memberSpecs.length; i++) {
    const m = memberSpecs[i];
    const ai = {
      squadId,
      doctrine,
      preferredRole: m.preferredRole || (i === 0 ? 'leader' : 'support'),
      formation,
      formationSpacing: spacing,
      formationBound: bound,
      ...(m.ai || {}),
    };
    const entity = helpers.spawnEntity(rigShipSpec({ ...m, ai }));
    // `exact: true` pins the hull to the S0 activity tier (what an aggroed / mission-critical /
    // engaged NPC gets): the AI thinks and replays every tick. Unpinned near hulls are S1_NEAR and
    // think every second tick - both are production states, so the rig can run either.
    if (config.exact) entity.data.missionPinned = true;
    ids.push(entity.id);
    roleOf.set(entity.id, i === 0 ? 'leader' : 'follower');
  }
  let targetId = null;
  if (config.target) {
    state.world.currentSectorId = 'sector_ceres_belt';
    state.world.sectors.sector_ceres_belt = { id: 'sector_ceres_belt', tier: 2, security: 0.35 };
    const target = helpers.spawnEntity(rigShipSpec({
      team: 0, factionId: 'faction_free', rot: Math.PI, ...config.target,
    }));
    targetId = target.id;
    state.playerId = target.id;
    for (const id of ids) {
      const e = state.entities.get(id);
      const ai = e.data.ai;
      ai.roe = 'weapons_free';
      ai.activity = {
        kind: 'attack_run', reason: 'formation_rig', anchor: { x: e.pos.x, z: e.pos.z },
        leashRadius: 4000, preferredRange: 150, startedTick: 0, targetId,
      };
      ai.forcePlayerTarget = true;
      ai.engagementTrigger = 'authorized_hostile_spawn';
      e.data.combat = { targetId };
    }
  } else {
    state.playerId = -1;
  }
  rebuildSpatialHash();
  // SG-02 dynamic owner must be up before any maneuver request is accepted.
  sys.physics.update(dt, state);
  if (sys.physics._sg02Init) await sys.physics._sg02Init;
  sys.physics.update(dt, state);
  if (!sys.physics._sg02 || state.physicsRuntime.diagnostics.sg02Ready !== true) {
    throw new Error('formation rig: SG-02 dynamic owner did not initialize');
  }

  const tactical = createTacticalAISystem({
    seed: state.meta.seed,
    config: {
      squad: { formationBound: bound, formationSpacing: spacing, minTacticTicks: 60, ...(config.tactical && config.tactical.squad) },
      maneuver: { stationaryLimitTicks: 180, formationRejoinFraction: 0.8, arrivalRadius: 18, ...(config.tactical && config.tactical.maneuver) },
      ...(config.tacticalExtra || {}),
    },
    actionPortFactory: () => noopActionPort(),
  });
  tactical.init(ctx);

  // Diagnostic pilot: the same planner class every hull uses, with the squad-frame director off so
  // it only chases the scripted waypoint. Its request goes through the same aiManeuver port.
  const pilot = new ManeuverPlanner({
    seed: state.meta.seed,
    config: { squadFrames: false, includeTrajectory: false, freezeResults: false },
  });
  const recorder = createFormationRecorder({ dt });
  const schedule = [];
  const scheduled = new Map();

  function pilotRequest(entity, point, kindName = 'intercept') {
    const perception = {
      tick: state.tick,
      revision: state.tick,
      self: {
        id: entity.id, team: entity.team,
        pos: { x: entity.pos.x, z: entity.pos.z }, vel: { x: entity.vel.x, z: entity.vel.z },
        rot: entity.rot || 0, radius: entity.radius || 12,
        hullFraction: 1, energyFraction: 1, heatFraction: 0,
      },
      contacts: [], events: [],
    };
    const speed = Math.hypot(point.vx || 0, point.vz || 0);
    const behavior = {
      maneuver: {
        kind: kindName,
        targetId: null,
        formationSlot: { x: point.x, z: point.z },
        formationVelocity: { x: point.vx || 0, z: point.vz || 0 },
        formationBound: 400,
        breakFormation: true,
        reason: 'rig_diagnostic_pilot',
        // face the direction of travel; the planner derives heading from the desired vector
        faceAngle: speed > 4 ? Math.atan2(point.vz, point.vx) : undefined,
      },
    };
    const directive = {
      squadId: 'rig_pilot', tactic: 'rig', formation: { kind: 'none', slot: point, velocity: { x: 0, z: 0 }, bound: 400, breakFormation: true },
    };
    return pilot.plan({ tick: state.tick, entityId: entity.id, perception, behavior, directive });
  }

  function drivePath(id, pathFn) {
    if (!pathFn || id == null) return;
    const entity = state.entities.get(id);
    if (!entity || entity.alive === false) return;
    const t = state.tick * dt;
    const point = pathFn(t);
    if (!point) return;
    helpers.aiManeuver.request(pilotRequest(entity, point));
  }

  const rig = {
    state, bus, helpers, sys, tactical, recorder, dt, squadId, formation, spacing, bound,
    ids, targetId, roleOf,
    get tick() { return state.tick; },
    entity(id) { return state.entities.get(id) || null; },
    leaderId() {
      for (const id of ids) {
        const e = state.entities.get(id);
        if (e && e.alive !== false) return id;
      }
      return null;
    },
    at(tick, fn) {
      if (!scheduled.has(tick)) scheduled.set(tick, []);
      scheduled.get(tick).push(fn);
    },
    mark(kind, detail) { recorder.mark(state.tick, kind, detail); },
    /** Event: a hull is destroyed (alive=false; the core sweep removes it and frees the id). */
    kill(id) {
      const e = state.entities.get(id);
      if (!e) return false;
      e.hull = 0;
      e.alive = false;
      recorder.mark(state.tick, 'kill', { id });
      return true;
    },
    /** Event: a new hull joins the wing (it may recycle a freed id). Returns the entity. */
    join(spec) {
      const ai = {
        squadId, doctrine, preferredRole: 'support', formation, formationSpacing: spacing,
        formationBound: bound, ...(spec.ai || {}),
      };
      const e = helpers.spawnEntity(rigShipSpec({ ...spec, ai }));
      ids.push(e.id);
      roleOf.set(e.id, 'follower');
      recorder.mark(state.tick, 'join', { id: e.id });
      return e;
    },
    /** Event: external shove in WU/s of delta-v (mass-scaled impulse) + optional yaw spin (rad/s). */
    impulse(id, dvx, dvz, spin = 0) {
      const e = state.entities.get(id);
      if (!e) return false;
      const mass = e.mass || 1;
      queuePhysicsImpulse(e, { x: dvx * mass, y: 0, z: dvz * mass }, { source: 'formation_rig' });
      if (spin) {
        const inertia = (e.physicsBody && e.physicsBody.inertiaY) || mass * 88 / 32;
        queuePhysicsTorqueImpulse(e, { x: 0, y: spin * inertia, z: 0 }, { source: 'formation_rig' });
      }
      recorder.mark(state.tick, 'impulse', { id, dvx, dvz, spin });
      return true;
    },
    /** Event: decontrol (the INF-021 tumble status the helm reads) for `ticks` ticks. */
    tumble(id, ticks) {
      const key = String(id);
      const until = state.simTime + ticks * dt;
      state.combat.entities[key] = state.combat.entities[key] || {};
      state.combat.entities[key].statuses = state.combat.entities[key].statuses || {};
      state.combat.entities[key].statuses.status_tumbling = {
        id: 'status_tumbling', data: { kind: 'weapon_tumble', startedAt: state.simTime, until },
      };
      rig.at(state.tick + ticks, () => {
        const rt = state.combat.entities[key];
        if (rt && rt.statuses) delete rt.statuses.status_tumbling;
        recorder.mark(state.tick, 'tumble_end', { id });
      });
      recorder.mark(state.tick, 'tumble', { id, ticks });
      return true;
    },
    step() {
      // Events scheduled for tick T run at the start of step T (after preStep advances the tick).
      sys.core.preStep(dt, state);
      const due = scheduled.get(state.tick);
      if (due) { scheduled.delete(state.tick); for (const fn of due) fn(rig); }
      rebuildSpatialHash();
      tactical.update(dt, state);
      // DIAGNOSTIC drivers replace the tactical request for the scripted bodies (pending map: last wins).
      if (config.leaderPath) drivePath(rig.leaderId(), config.leaderPath);
      if (config.targetPath) drivePath(targetId, config.targetPath);
      sys.flight.update(dt, state);
      sys.aiPorts.update(dt, state);
      sys.physics.update(dt, state);
      sample();
      sys.core.lifetimeSweep(dt, state);
    },
    run(ticks) {
      for (let i = 0; i < ticks; i++) rig.step();
      return rig;
    },
    summarize(options) { return recorder.summarize(options); },
    dispose() {
      if (sys.physics && typeof sys.physics._disableSg02DynamicAuthority === 'function') {
        sys.physics._disableSg02DynamicAuthority();
      }
    },
  };

  function sample() {
    const stack = tactical.stack;
    const last = stack && stack.lastResult;
    const directives = new Map();
    let tacticOf = null;
    if (last && last.squads) {
      for (const squad of last.squads) {
        if (squad.squadId !== squadId && !String(squad.squadId).startsWith(squadId)) continue;
        tacticOf = squad.tactic;
        for (const directive of squad.directives) directives.set(directive.memberId, directive);
      }
    }
    const leaderId = rig.leaderId();
    const leader = leaderId != null ? state.entities.get(leaderId) : null;
    const frames = stack && stack.maneuver && stack.maneuver.squadFrames;
    const lc = leader ? Math.cos(leader.rot || 0) : 1;
    const ls = leader ? Math.sin(leader.rot || 0) : 0;
    const live = [];
    for (const id of ids) {
      const e = state.entities.get(id);
      if (!e || e.alive === false) continue;
      live.push(e);
      if (id === leaderId && !config.recordLeader) continue;
      const directive = directives.get(id);
      const plan = frames && typeof frames.planFor === 'function' ? frames.planFor(id) : null;
      const runtime = stack && stack.maneuver && stack.maneuver.byEntity.get(id);
      const req = runtime && runtime.lastRequest;
      let slot = null;
      let slotVel = null;
      if (plan && plan.slot) {
        slot = { x: plan.slot.x, z: plan.slot.z };
        slotVel = { x: plan.slotVel.x, z: plan.slotVel.z };
      } else if (directive) {
        slot = { x: directive.formation.slot.x, z: directive.formation.slot.z };
        slotVel = { x: directive.formation.velocity.x, z: directive.formation.velocity.z };
      }
      let localSlot = null;
      if (slot && leader) {
        const dx = slot.x - leader.pos.x;
        const dz = slot.z - leader.pos.z;
        localSlot = { x: dx * lc + dz * ls, z: -dx * ls + dz * lc };
      }
      recorder.sample({
        tick: state.tick,
        id,
        pos: { x: e.pos.x, z: e.pos.z },
        vel: { x: e.vel.x, z: e.vel.z },
        rot: e.rot,
        angVel: Number.isFinite(e.angVel) ? e.angVel : (Number.isFinite(e.wy) ? e.wy : 0),
        radius: e.radius,
        slot, slotVel, localSlot,
        request: req ? {
          forward: req.forceLocal.forward, right: req.forceLocal.right, torqueYaw: req.torqueYaw,
          kind: req.kind, reason: req.reason,
        } : null,
        breakFormation: directive ? !!directive.formation.breakFormation : (plan ? !!plan.breakFormation : null),
        tactic: plan ? `${plan.phase}` : (directive ? directive.tactic : tacticOf),
        phase: plan ? plan.phase : null,
        speed: Math.hypot(e.vel.x, e.vel.z),
        applied: appliedControl(e),
      });
    }
    const pairList = [];
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        pairList.push({
          a: live[i].id, b: live[j].id,
          dist: Math.hypot(live[i].pos.x - live[j].pos.x, live[i].pos.z - live[j].pos.z),
          touch: (live[i].radius || 0) + (live[j].radius || 0),
        });
      }
    }
    recorder.pairSample(state.tick, pairList);
  }

  return rig;
}

/** What the physics owner actually integrated last tick (the arbiter of any second writer). */
function appliedControl(entity) {
  const t = readPhysicsTelemetry(entity);
  if (!t) return null;
  return {
    torqueY: t.torque ? t.torque.y : 0,
    force: t.force ? Math.hypot(t.force.x, t.force.z) : 0,
    angAccY: t.angularAccelerationY,
    inertiaY: t.inertiaY,
    mode: t.mode,
  };
}

/** Helper for scenario files: a circular leader route (constant speed, constant turn rate). */
export function circlePath({ cx = 0, cz = 0, radius = 600, speed = 40, phase = 0, startT = 0 } = {}) {
  const omega = speed / radius;
  return (t) => {
    const tt = Math.max(0, t - startT);
    const a = phase + omega * tt;
    return {
      x: cx + radius * Math.cos(a),
      z: cz + radius * Math.sin(a),
      vx: -speed * Math.sin(a),
      vz: speed * Math.cos(a),
    };
  };
}

/** Straight route at constant velocity from a start point. */
export function linePath({ x = 0, z = 0, vx = 30, vz = 0, startT = 0 } = {}) {
  return (t) => {
    const tt = Math.max(0, t - startT);
    return { x: x + vx * tt, z: z + vz * tt, vx: tt > 0 ? vx : 0, vz: tt > 0 ? vz : 0 };
  };
}

/** Accelerating/turning route: speed ramps from v0 to v1, heading sweeps by `turn` rad over `turnS`. */
export function slalomPath({ x = 0, z = 0, v0 = 10, v1 = 55, rampS = 8, turn = 1.6, turnS = 10, startT = 0 } = {}) {
  // integrate numerically on a fixed grid so the point and its velocity are consistent
  const dtp = 1 / 60;
  const cache = [{ t: 0, x, z, vx: 0, vz: 0, h: 0 }];
  return (t) => {
    const tt = Math.max(0, t - startT);
    const idx = Math.floor(tt / dtp);
    while (cache.length <= idx + 1) {
      const prev = cache[cache.length - 1];
      const ti = prev.t;
      const sp = ti >= rampS ? v1 : v0 + (v1 - v0) * (ti / rampS);
      const h = turnS > 0 ? turn * Math.sin(Math.min(1, ti / turnS) * Math.PI * 0.5) * (ti < turnS ? 1 : 1) : 0;
      const vx = sp * Math.cos(h);
      const vz = sp * Math.sin(h);
      cache.push({ t: ti + dtp, x: prev.x + vx * dtp, z: prev.z + vz * dtp, vx, vz, h });
    }
    const c = cache[idx];
    return { x: c.x, z: c.z, vx: tt > 0 ? c.vx : 0, vz: tt > 0 ? c.vz : 0 };
  };
}

export { wrapAngle };
