// A01-02 — the Ricochet Foundry freight lane (arena helios_core, Lane 2).
//
// A freight string crosses the Foundry on a deterministic timetable: five 400 t
// containers, 30 WU apart, west to east through the room's centre at 140 WU/s.
// Three seconds before each departure the lane lights blink amber and the west
// end sounds the hauler foghorn. The containers are real dynamic bodies driven
// through the physics membrane (force servo, never position writes), so the
// crush is a physical consequence: hulls at or under 32 t die outright, heavier
// ships lose 60% of max hull and are shoved perpendicular out of the lane at
// ~120 WU/s, the player loses 40% and is shoved the same way, and loose rocks /
// debris / loose containers get the perpendicular shove only. String kills are
// environment kills — unless impulse provenance says a player threw the body
// into the lane inside `contact.thrownProvenanceS`, in which case it is theirs.
//
// The Line can latch a container (type 'container' is attachable, 400 t is the
// Class III full-control ceiling). While any active attachment on a string
// member holds tension above the hold threshold for FREIGHT_HOLD_TICKS the
// container cuts loose from the string: it keeps its body and mass, becomes an
// ordinary heavy dynamic body, and stays the arena's heaviest throwable.
//
// The director is hosted on the survivalArena slot like the swarm event
// director: init() once, arm() from _onWavePlanned (Foundry only), update()
// every fixed tick, teardown() with the room. All scheduling keys off
// state.simTime — no wall time, no ambient randomness; a given seed/wave/anchor
// produces the same lane, the same timetable, and the same string ids.

import { Masks } from '../core/entity.js';
import {
  writePhysicsControl,
  queuePhysicsImpulse,
} from '../core/physicsAuthority.js';
import { getCombatKernel } from '../combat/kernel.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { readRecentImpulseProvenance } from '../combat/impulseKernel.js';
import { SWARM_FEEL_PROFILE } from '../data/swarmFeelProfile.js';
import { FOUNDRY_ARENA_ID, SWARM_DEBRIS_FIGHT_RADIUS } from './swarmArena.js';

// ---- authored constants (packet A01-02 / Lane 2) ----------------------------

/** The lane spans the playable diameter: the same radius the debris ring marks as the fight. */
export const FREIGHT_LANE_HALF_LENGTH = SWARM_DEBRIS_FIGHT_RADIUS;
export const FREIGHT_FIRST_DEPART_S = 20;
export const FREIGHT_PERIOD_S = 40;
export const FREIGHT_WARN_LEAD_S = 3;
export const FREIGHT_BLINK_HZ = 2;
export const FREIGHT_STRING_COUNT = 5;
export const FREIGHT_SPACING_WU = 30;
export const FREIGHT_SPEED_WU_S = 140;
export const FREIGHT_CONTAINER_MASS_T = 400;
export const FREIGHT_CONTAINER_RADIUS = 18;
export const FREIGHT_CONTAINER_HULL = 100000;
export const FREIGHT_LIGHT_KILL_MASS_T = 32;
export const FREIGHT_HEAVY_HULL_FRACTION = 0.6;
export const FREIGHT_PLAYER_HULL_FRACTION = 0.4;
export const FREIGHT_SHOVE_WU_S = 120;
/** Cut loose after this long held above the hold threshold — the packet's 0.5 s. */
export const FREIGHT_HOLD_TICKS = 30;
/**
 * "Sustained tension above the hold threshold": the near-break warning fires at
 * 0.75 of an attachment's break envelope, so 0.75 is the authored boundary
 * between riding the string and hauling on it.
 */
export const FREIGHT_HOLD_TENSION_RATIO = 0.75;
const FREIGHT_THROW_PROVENANCE_TICKS = Math.round(SWARM_FEEL_PROFILE.contact.thrownProvenanceS * 60);
/** Velocity servo — the same law the shutters ride, tuned for a 400 t body at 140 WU/s. */
const FREIGHT_SERVO = Object.freeze({ gainPos: 6, gainVel: 2.5, maxSpeed: 200 });
/** The servo must out-force anything the room can throw at the string. */
const FREIGHT_SERVO_MAX_FORCE = 4000000;
/** Dynamic bodies the string pushes aside (ships/drones get the crush law instead). */
const FREIGHT_LOOSE_TYPES = new Set([
  'asteroid', 'wreck', 'debris', 'payload', 'container', 'pickup', 'mine',
]);
const FREIGHT_OWNER = 'survival-freight';
const FREIGHT_HORN = 'sfx_hauler_foghorn';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function simTimeOf(state) {
  return Number.isFinite(state && state.simTime)
    ? state.simTime
    : Math.max(0, Number(state && state.tick) || 0) / 60;
}

function positiveMass(entity) {
  const mass = finite(entity && entity.mass, 0);
  if (mass > 0) return mass;
  const body = entity && entity.physicsBody;
  return Math.max(1, finite(body && body.mass, 1));
}

/** PURE: the lane truth for one install — a west-to-east run through the room centre. */
export function planFreightLane({ at = null } = {}) {
  const cx = finite(at && at.x, 0);
  const cz = finite(at && at.z, 0);
  const half = FREIGHT_LANE_HALF_LENGTH;
  return {
    kind: 'freightLane',
    x0: cx - half,
    z0: cz,
    x1: cx + half,
    z1: cz,
    dirX: 1,
    dirZ: 0,
    halfLength: half,
  };
}

/**
 * The hosted director. ctx is the system ctx ({ state, bus, helpers, registry });
 * update/teardown are called from the survivalArena slot.
 */
export function createFreightLaneDirector(ctx) {
  const bus = ctx && ctx.bus;
  const helpers = (ctx && ctx.helpers) || {};
  let armed = null;       // { lane, arenaId, installedAt, wave, seed, nextDepartAt, warnAt }
  let strings = [];       // live strings: { id, departAt, members: [entity] }
  let stringSerial = 0;
  let warnEmit = null;    // payload of the last warning, for tests/diag

  function emit(name, payload) {
    if (bus && typeof bus.emit === 'function') bus.emit(name, payload);
  }

  function kernel() {
    try { return getCombatKernel(ctx); } catch (_) { return null; }
  }

  function arm({ arenaId = null, at = null, installedAt = null, wave = 0, seed = 1 } = {}) {
    teardown('rearm');
    if (arenaId !== FOUNDRY_ARENA_ID) return;
    const lane = planFreightLane({ at });
    const t0 = Number.isFinite(installedAt) ? installedAt : simTimeOf(ctx.state);
    armed = {
      lane,
      arenaId,
      installedAt: t0,
      wave,
      seed,
      nextDepartAt: t0 + FREIGHT_FIRST_DEPART_S,
      warnAt: t0 + FREIGHT_FIRST_DEPART_S - FREIGHT_WARN_LEAD_S,
    };
  }

  function _spawnString(state, departAt) {
    if (typeof helpers.spawnEntity !== 'function') return null;
    const lane = armed.lane;
    const id = `freight-w${armed.wave}-s${stringSerial++}`;
    const members = [];
    for (let i = 0; i < FREIGHT_STRING_COUNT; i++) {
      const e = helpers.spawnEntity({
        type: 'container',
        team: 0,
        pos: { x: lane.x0 - i * FREIGHT_SPACING_WU, z: lane.z0 },
        vel: { x: lane.dirX * FREIGHT_SPEED_WU_S, z: lane.dirZ * FREIGHT_SPEED_WU_S },
        rot: 0,
        angVel: 0,
        radius: FREIGHT_CONTAINER_RADIUS,
        mass: FREIGHT_CONTAINER_MASS_T,
        hull: FREIGHT_CONTAINER_HULL,
        hullMax: FREIGHT_CONTAINER_HULL,
        collides: true,
        collisionMask: Masks.SHIP | Masks.STATION | Masks.ASTEROID
          | Masks.PROJECTILE | Masks.DRONE | Masks.PAYLOAD,
        physicsBody: {
          schemaVersion: 1,
          radius: FREIGHT_CONTAINER_RADIUS,
          mass: FREIGHT_CONTAINER_MASS_T,
          inertiaY: Math.max(8, Math.round(FREIGHT_CONTAINER_MASS_T * FREIGHT_CONTAINER_RADIUS ** 2 * 0.4)),
          dynamic: true,
          ccd: true,
          material: 'station',
          revision: 0,
        },
        data: {
          roomOwner: FREIGHT_OWNER,
          freightString: id,
          freightIndex: i,
          masslineTetherable: true,
          name: 'FOUNDRY FREIGHT',
        },
      });
      if (e) members.push(e);
    }
    if (!members.length) return null;
    const rec = { id, departAt, members };
    strings.push(rec);
    emit('freight:departed', {
      stringId: id, wave: armed.wave, t: simTimeOf(state), count: members.length,
      x0: lane.x0, z0: lane.z0, x1: lane.x1, z1: lane.z1,
    });
    return rec;
  }

  function _memberRailX(member, t) {
    const rec = member.__freightRec;
    return rec
      ? armed.lane.x0 + FREIGHT_SPEED_WU_S * (t - rec.departAt) - member.data.freightIndex * FREIGHT_SPACING_WU
      : armed.lane.x0;
  }

  function _driveMember(state, member, t) {
    const lane = armed.lane;
    const targetX = _memberRailX(member, t);
    const mass = positiveMass(member);
    const vx = finite(member.vel && member.vel.x);
    const vz = finite(member.vel && member.vel.z);
    // Commanded velocity: cruise + bounded position correction, capped by maxSpeed.
    const corrX = FREIGHT_SERVO.gainPos * (targetX - finite(member.pos && member.pos.x));
    const corrZ = FREIGHT_SERVO.gainPos * (lane.z1 - finite(member.pos && member.pos.z));
    let wantX = lane.dirX * FREIGHT_SPEED_WU_S + corrX;
    let wantZ = lane.dirZ * FREIGHT_SPEED_WU_S + corrZ;
    const wantMag = Math.hypot(wantX, wantZ);
    if (wantMag > FREIGHT_SERVO.maxSpeed) {
      const s = FREIGHT_SERVO.maxSpeed / wantMag;
      wantX *= s; wantZ *= s;
    }
    const gx = FREIGHT_SERVO.gainVel * (wantX - vx) + FREIGHT_SERVO.gainPos * (targetX - finite(member.pos && member.pos.x));
    const gz = FREIGHT_SERVO.gainVel * (wantZ - vz) + FREIGHT_SERVO.gainPos * (lane.z1 - finite(member.pos && member.pos.z));
    let fx = mass * gx, fz = mass * gz;
    const fm = Math.hypot(fx, fz);
    if (fm > FREIGHT_SERVO_MAX_FORCE) {
      const s = FREIGHT_SERVO_MAX_FORCE / fm;
      fx *= s; fz *= s;
    }
    writePhysicsControl(member, {
      mode: 'freight_string',
      force: { x: fx, z: fz },
      source: FREIGHT_OWNER,
      maxSpeed: FREIGHT_SERVO.maxSpeed,
    });
    // Kinematic mirror for harnesses with no native owner (and the intent record).
    if (member.vel && typeof member.vel === 'object') {
      member.vel.x = wantX;
      member.vel.z = wantZ;
    }
  }

  function _releaseMember(state, member, rec, reason) {
    member.data.freightString = null;
    member.data.freightReleased = true;
    writePhysicsControl(member, {
      mode: 'uncontrolled',
      force: { x: 0, z: 0 },
      source: FREIGHT_OWNER,
    });
    const i = rec.members.indexOf(member);
    if (i >= 0) rec.members.splice(i, 1);
    emit('freight:released', {
      stringId: rec.id, entityId: member.id, reason, t: simTimeOf(state),
      pos: { x: finite(member.pos && member.pos.x), z: finite(member.pos && member.pos.z) },
    });
  }

  function _shoveOut(entity, laneDirX, laneDirZ, relSign) {
    // Perpendicular exit: shove away from whichever side of the lane the body is on.
    const px = -laneDirZ, pz = laneDirX; // left normal of travel
    const body = entity;
    const mass = positiveMass(body);
    const bvx = finite(body.vel && body.vel.x);
    const bvz = finite(body.vel && body.vel.z);
    const alongN = bvx * px + bvz * pz;
    // Cancel existing normal motion and add the authored exit speed.
    const want = relSign * FREIGHT_SHOVE_WU_S;
    const dv = want - alongN;
    queuePhysicsImpulse(body, { x: px * dv * mass, z: pz * dv * mass },
      { tag: 'freight_shove', externalEffect: true });
    if (body.vel && typeof body.vel === 'object') {
      body.vel.x += px * dv;
      body.vel.z += pz * dv;
    }
  }

  function _crushEntity(state, member, target, rec) {
    const lane = armed.lane;
    const tick = Number.isInteger(state.tick) ? state.tick : 0;
    // Once per body per string — the string grinds through, it does not stutter-hit.
    const data = target.data || (target.data = {});
    if (data.freightCrushedBy === rec.id) return;
    data.freightCrushedBy = rec.id;
    const relZ = finite(target.pos && target.pos.z) - lane.z0;
    // Dead-centre bodies pick a side by deterministic id parity, never by chance.
    const relSign = relZ === 0
      ? (((Number(target.id) || 0) & 1) ? 1 : -1)
      : Math.sign(relZ);
    const isPlayer = state.playerId != null && target.id === state.playerId;
    const isShip = target.type === 'ship' || target.type === 'drone';

    // Credit: a thrown/shoved body inside the provenance window belongs to the actor.
    const provenance = readRecentImpulseProvenance(target, tick, FREIGHT_THROW_PROVENANCE_TICKS);
    const attackerId = provenance && provenance.actorId != null
      ? provenance.actorId
      : (armed && armed.arenaId) || FOUNDRY_ARENA_ID;

    const k = kernel();
    if (isShip && k && typeof k.routeDamage === 'function') {
      const mass = positiveMass(target);
      const hullMax = Math.max(1, finite(target.hullMax, finite(target.hull, 1)));
      const damage = isPlayer
        ? hullMax * FREIGHT_PLAYER_HULL_FRACTION
        : (mass <= FREIGHT_LIGHT_KILL_MASS_T
          ? Math.max(1, 4 * (finite(target.hull) + finite(target.shield) + finite(target.armor) + finite(target.armorFlat)))
          : hullMax * FREIGHT_HEAVY_HULL_FRACTION);
      const packet = scalarHitToDamagePacket({
        damage,
        damageType: 'kinetic',
        pos: { x: finite(target.pos && target.pos.x), z: finite(target.pos && target.pos.z) },
        // A container is a wall, not a warhead: the authored hull fraction lands on the hull,
        // nothing is diverted into a subsystem share.
        subsystemShare: 0,
        source: {
          kind: 'collision_freight',
          weaponId: null,
          impulseProvenance: provenance ? provenance.tag : null,
          freightString: rec.id,
        },
      });
      packet.shieldBypass = 1;
      packet.flags = { allowAnyTarget: true, ignoreFriendlyFire: true };
      k.routeDamage({
        attackerId,
        targetId: target.id,
        packet,
        origin: { kind: 'collision', id: rec.id },
      });
    }
    if (isShip || (target.type && FREIGHT_LOOSE_TYPES.has(target.type))) {
      _shoveOut(target, lane.dirX, lane.dirZ, relSign);
      emit('freight:contact', {
        stringId: rec.id,
        containerId: member.id,
        targetId: target.id,
        targetType: target.type,
        killed: isShip && !isPlayer && positiveMass(target) <= FREIGHT_LIGHT_KILL_MASS_T,
        player: isPlayer,
        creditActorId: attackerId,
        t: simTimeOf(state),
      });
    }
  }

  function _contactSweep(state, rec, member) {
    const lane = armed.lane;
    const mx = finite(member.pos && member.pos.x);
    const mz = finite(member.pos && member.pos.z);
    const reach = FREIGHT_CONTAINER_RADIUS + 2;
    const entities = state.entities && typeof state.entities.values === 'function'
      ? state.entities.values()
      : (Array.isArray(state.entityList) ? state.entityList : null);
    if (!entities) return;
    for (const e of entities) {
      if (!e || e === member || e.alive === false || !e.pos) continue;
      if (e.data && e.data.freightString != null && e.data.freightString === rec.id) continue;
      const er = Math.max(2, finite(e.radius, finite(e.physicsBody && e.physicsBody.radius, 4)));
      const rr = reach + er;
      const dx = finite(e.pos.x) - mx;
      if (dx * dx > rr * rr) continue;
      const dz = finite(e.pos.z) - mz;
      if (dx * dx + dz * dz > rr * rr) continue;
      _crushEntity(state, member, e, rec);
    }
  }

  function _lineTensionCut(state, rec, member) {
    // An active Line held over the break-warning ratio for FREIGHT_HOLD_TICKS cuts
    // the container loose from the string.
    const k = kernel();
    const atts = k && k.attachments && typeof k.attachments.listForEntity === 'function'
      ? k.attachments.listForEntity(member.id, true)
      : null;
    let over = false;
    if (atts) {
      for (const a of atts) {
        if (!a || a.state !== 'active') continue;
        const policy = typeof k.attachments.breakPolicy === 'function'
          ? k.attachments.breakPolicy(a.id)
          : null;
        const maxT = policy && Number.isFinite(policy.maxTension) ? policy.maxTension : Infinity;
        if (finite(a.lastTension) > FREIGHT_HOLD_TENSION_RATIO * maxT) { over = true; break; }
      }
    }
    if (over) {
      member.__freightHoldTicks = (member.__freightHoldTicks || 0) + 1;
      if (member.__freightHoldTicks >= FREIGHT_HOLD_TICKS) {
        _releaseMember(state, member, rec, 'line_tension');
        return true;
      }
    } else {
      member.__freightHoldTicks = 0;
    }
    return false;
  }

  function update(_dt, state) {
    const st = state || (ctx && ctx.state);
    if (!st || !armed) return;
    const t = simTimeOf(st);
    const lane = armed.lane;

    // Warning: exactly FREIGHT_WARN_LEAD_S before departure, once per string.
    if (t >= armed.warnAt && armed.warnAt != null) {
      const departAt = armed.nextDepartAt;
      warnEmit = {
        stringId: `freight-w${armed.wave}-s${stringSerial}`,
        wave: armed.wave,
        t,
        departAt,
        x0: lane.x0, z0: lane.z0, x1: lane.x1, z1: lane.z1,
        blinkHz: FREIGHT_BLINK_HZ,
      };
      emit('freight:warning', warnEmit);
      emit('audio:cue', { id: FREIGHT_HORN, position: { x: lane.x0, z: lane.z0 }, gain: 0.9 });
      armed.warnAt = null;
    }
    // Departure.
    if (t >= armed.nextDepartAt) {
      _spawnString(st, armed.nextDepartAt);
      armed.nextDepartAt += FREIGHT_PERIOD_S;
      armed.warnAt = armed.nextDepartAt - FREIGHT_WARN_LEAD_S;
    }

    // Tick live strings.
    for (let s = strings.length - 1; s >= 0; s--) {
      const rec = strings[s];
      for (let i = rec.members.length - 1; i >= 0; i--) {
        const member = rec.members[i];
        if (!member || member.alive === false) { rec.members.splice(i, 1); continue; }
        member.__freightRec = rec;
        if (_lineTensionCut(st, rec, member)) continue;
        _driveMember(st, member, t);
        _contactSweep(st, rec, member);
        // East exit.
        if (finite(member.pos && member.pos.x) >= lane.x1) {
          member.alive = false;
          emit('entity:retired', {
            id: member.id, occupantGeneration: member.occupantGeneration,
            type: member.type, pos: { x: member.pos.x, z: member.pos.z },
            reason: 'freight-east-exit', owner: FREIGHT_OWNER,
            freightString: rec.id, simTime: t,
          });
          rec.members.splice(i, 1);
        }
      }
      if (rec.members.length === 0) {
        strings.splice(s, 1);
        emit('freight:clear', { stringId: rec.id, t, reason: 'passed' });
      }
    }
  }

  function teardown(reason) {
    const st = ctx && ctx.state;
    for (const rec of strings) {
      for (const member of rec.members) {
        if (member && member.alive !== false) {
          member.alive = false;
          emit('entity:retired', {
            id: member.id, occupantGeneration: member.occupantGeneration,
            type: member.type, pos: member.pos ? { x: member.pos.x, z: member.pos.z } : null,
            reason: `freight-${reason}`, owner: FREIGHT_OWNER,
            freightString: rec.id, simTime: simTimeOf(st),
          });
        }
      }
      emit('freight:clear', { stringId: rec.id, t: simTimeOf(st), reason });
    }
    strings = [];
    armed = null;
    warnEmit = null;
  }

  return {
    init() {},
    arm,
    update,
    teardown,
    destroy() { teardown('destroy'); },
    diagnostics() {
      return {
        armed: !!armed,
        nextDepartAt: armed ? armed.nextDepartAt : null,
        warnAt: armed ? armed.warnAt : null,
        strings: strings.map((r) => ({ id: r.id, members: r.members.length, departAt: r.departAt })),
        lastWarning: warnEmit,
      };
    },
    // Test seam.
    get _armed() { return armed; },
    get _strings() { return strings; },
  };
}
