// Hull burst (hull-burst overhaul, slice C; design doc section 4). A timed, front-facing special
// attack carried by one fitted utility module: the Gravity Bumper hurls what the nose touches.
//
// The verb: press the burst key, the wedge is live for `durationS`, then it recharges for clearly
// longer than it lasted. While it runs, every HOSTILE ship or drone that enters the wedge is thrown
// away once, at a speed set by how fast the nose and the target were closing (data/hullBurst.js).
// That throw is ordinary combat physics: the same impulse route an impulse-charge blast takes
// (physics-authority port, impulse provenance naming the player, the one hitstun law), so a hull
// the burst throws tumbles, is a projectile for what it hits, and any kill it causes is the
// player's (the slice-A fling pipeline). Nothing here writes a hull, a velocity, or a credit.
//
// Not hostile means nudged, never flung: an ally, a civilian or a neutral inside the wedge takes a
// small push through the same port and nothing else (no stun, no credit, no heat).
//
// The player is never pushed back and never takes damage from a burst: it is a bumper, not a
// collision. Runtime state lives at state.hullBurst and is deliberately unsaved (a reload comes back
// ready). All timing is sim time. The system is absent from the frozen legacy47a list, so the golden
// cannot see it.
import { resolveHullBurst } from '../data/hullBurst.js';
import {
  publishHitstunImpulse,
  recordImpulseProvenance,
  signedHitSide,
} from '../combat/impulseKernel.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { isHostileToPlayer } from './scanner.js';

const CANDIDATE_TYPES = new Set(['ship', 'drone']);

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function simNow(state) {
  return Number.isFinite(state && state.simTime) ? state.simTime : finite(state && state.tick) / 60;
}

/** Solver mass first, authored mass second: the same read the hitstun law and the blast use. */
function massOf(entity, fallback = 1) {
  const body = entity && entity.physicsBody;
  const m = body && Number(body.mass) > 0 ? Number(body.mass) : Number(entity && entity.mass);
  return Number.isFinite(m) && m > 0 ? m : fallback;
}

function candidatesNear(state, pos, radius, out) {
  const index = state && state.entityIndex;
  const fallback = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.collidables)
    ? index.collidables
    : (state && state.entityList);
  return queryNearbyEntities(state, pos, radius, out, fallback);
}

/** The fitted burst, read from the player's derived stats (ships.js is the single writer). */
export function fittedHullBurst(state) {
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  const derived = player && player.data && player.data.derived;
  if (!derived || !derived.hullBurstKind) return null;
  return resolveHullBurst(derived.hullBurstKind, derived.hullBurstRank);
}

/**
 * What one hit delivers. Pure so the scene, the tests and the HUD tip read the same law.
 *   raw = (kick + (1 + bounce) * closing) * bumperMass / (bumperMass + targetMass)
 *   deltaV = max * tanh(raw / max)
 * The ceiling is soft on purpose: a hard clamp gives a light hull, a medium and a Bastion the same
 * number once the arrival is fast, and "a heavy shrugs" stops being true exactly when it matters.
 */
export function hullBurstDeltaV(def, closing, bumperMass, targetMass) {
  const c = Math.max(0, finite(closing));
  const share = bumperMass / (bumperMass + Math.max(0.1, targetMass));
  const raw = (def.kickWuS + (1 + def.bounce) * c) * share;
  return def.maxDeltaVWuS * Math.tanh(Math.max(0, raw) / def.maxDeltaVWuS);
}

/**
 * Is `target` inside the wedge, and along which axes? Returns null outside; otherwise the
 * geometry the throw needs. The nose is one hull radius ahead of the centre; the wedge opens from
 * there. A dead-centre approach can never miss (nose width), and the target's own radius counts.
 */
export function hullBurstWedgeHit(def, player, target) {
  const rot = finite(player.rot);
  const fx = Math.cos(rot);
  const fz = Math.sin(rot);
  const rx = finite(target.pos && target.pos.x) - finite(player.pos && player.pos.x);
  const rz = finite(target.pos && target.pos.z) - finite(player.pos && player.pos.z);
  const dist = Math.hypot(rx, rz);
  if (!(dist > 1e-6)) return null;
  const nose = finite(player.radius, 12);
  const targetRadius = finite(target.radius, 8);
  const along = rx * fx + rz * fz;
  const lateral = Math.abs(rx * -fz + rz * fx);
  if (along < -targetRadius * 0.25) return null;
  if (along - targetRadius - nose > def.reachWu) return null;
  const opening = def.noseWidthWu + Math.max(0, along - nose) * Math.tan(def.halfAngleRad);
  if (lateral - targetRadius * 0.5 > opening) return null;
  return { dist, along, lateral, radialX: rx / dist, radialZ: rz / dist, fx, fz };
}

export const hullBurst = {
  id: 'hullBurst',
  name: 'hullBurst',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._scratch = [];
    this._unsubs = [];
    this._ensureRuntime();
    if (this.bus && typeof this.bus.on === 'function') {
      for (const event of ['game:new', 'save:loaded', 'save:restoring']) {
        this._unsubs.push(this.bus.on(event, () => this._reset()));
      }
      for (const event of ['dock:docked', 'jump:start', 'sector:exit', 'player:death']) {
        this._unsubs.push(this.bus.on(event, () => this._end('interrupted')));
      }
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  _ensureRuntime() {
    const state = this.state;
    if (!state) return null;
    if (!state.hullBurst) {
      state.hullBurst = { phase: 'ready', kind: null, activeUntil: 0, readyAt: 0, hits: 0, latched: new Set() };
    }
    return state.hullBurst;
  },

  _reset() {
    const rt = this._ensureRuntime();
    if (!rt) return;
    rt.phase = 'ready'; rt.kind = null; rt.activeUntil = 0; rt.readyAt = 0; rt.hits = 0;
    rt.latched.clear();
  },

  /**
   * Try to light the wedge. Returns true when the burst started. The input edge and the bench both
   * come through here, so the refusal rules live in one place.
   */
  activate() {
    const state = this.state;
    const rt = this._ensureRuntime();
    if (!state || !rt) return false;
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || player.alive === false || (player.flags && player.flags.docked)) return false;
    if (state.mode && state.mode !== 'flight') return false;
    const def = fittedHullBurst(state);
    if (!def) return false;
    const now = simNow(state);
    if (rt.phase === 'active' || now < rt.readyAt) return false;
    rt.phase = 'active';
    rt.kind = def.id;
    rt.activeUntil = now + def.durationS;
    rt.readyAt = rt.activeUntil + def.cooldownS;
    rt.hits = 0;
    rt.latched.clear();
    if (this.bus) {
      this.bus.emit('hullBurst:activated', {
        kind: def.id, name: def.name, durationS: def.durationS, cooldownS: def.cooldownS,
        reachWu: def.reachWu, halfAngleRad: def.halfAngleRad,
      });
      this.bus.emit('audio:cue', { id: 'sfx_explosion_small', position: { x: player.pos.x, z: player.pos.z }, gain: 0.4 });
    }
    return true;
  },

  _end(reason) {
    const rt = this.state && this.state.hullBurst;
    if (!rt || rt.phase !== 'active') return;
    rt.phase = 'cooling';
    rt.latched.clear();
    const now = simNow(this.state);
    // Cutting it short keeps the recharge honest: the clock always runs from the moment it stopped.
    const def = resolveHullBurst(rt.kind, 1);
    if (reason !== 'expired' && def) rt.readyAt = now + def.cooldownS;
    if (this.bus) this.bus.emit('hullBurst:ended', { kind: rt.kind, reason, hits: rt.hits });
  },

  update() {
    const state = this.state;
    const rt = this._ensureRuntime();
    if (!state || !rt) return;
    const actions = state.input && state.input.actions;
    if (actions && actions.hullBurst) {
      actions.hullBurst = false;
      this.activate();
    }
    const now = simNow(state);
    if (rt.phase === 'cooling' && now >= rt.readyAt) rt.phase = 'ready';
    if (rt.phase !== 'active') return;
    if (now >= rt.activeUntil) { this._end('expired'); return; }
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    const def = fittedHullBurst(state);
    if (!player || player.alive === false || !def) { this._end('interrupted'); return; }
    this._sweep(state, rt, def, player);
  },

  _sweep(state, rt, def, player) {
    const queryRadius = def.reachWu + finite(player.radius, 12) + 80;
    const near = candidatesNear(state, player.pos, queryRadius, this._scratch);
    const bumperMass = massOf(player, 1) * def.massScale;
    const playerTeam = player.team;
    for (const target of near) {
      if (!target || !target.alive || target.id === player.id) continue;
      if (!CANDIDATE_TYPES.has(target.type)) continue;
      if (rt.latched.has(target.id)) continue;
      const geo = hullBurstWedgeHit(def, player, target);
      if (!geo) continue;
      rt.latched.add(target.id);
      const closing = (finite(player.vel && player.vel.x) - finite(target.vel && target.vel.x)) * geo.radialX
        + (finite(player.vel && player.vel.z) - finite(target.vel && target.vel.z)) * geo.radialZ;
      const hostile = isHostileToPlayer(target, playerTeam, state);
      this._hurl(state, rt, def, player, target, geo, closing, bumperMass, hostile);
    }
  },

  _hurl(state, rt, def, player, target, geo, closing, bumperMass, hostile) {
    const targetMass = massOf(target, 1);
    let deltaV = hullBurstDeltaV(def, closing, bumperMass, targetMass);
    if (!hostile) deltaV = Math.min(deltaV, def.nudgeMaxDeltaVWuS);
    if (!(deltaV > 0)) return;
    // Forward-biased throw: mostly where the nose points, some spread from the centres.
    let dirX = def.forwardBias * geo.fx + (1 - def.forwardBias) * geo.radialX;
    let dirZ = def.forwardBias * geo.fz + (1 - def.forwardBias) * geo.radialZ;
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len; dirZ /= len;
    const magnitude = deltaV * targetMass;
    const physics = this.helpers && this.helpers.combatPhysics;
    if (!physics || typeof physics.applyImpulse !== 'function') return;
    const accepted = physics.applyImpulse({
      entityId: target.id,
      impulse: { x: dirX * magnitude, z: dirZ * magnitude },
      point: null,
      reason: 'hull_burst',
      tick: state.tick,
      provenance: { actorId: state.playerId, weaponId: def.moduleId, tag: 'hull_burst' },
    });
    if (accepted === false) return;
    rt.hits += 1;
    if (hostile) {
      // The victim's shove is attributed to the player, so the flight, the rock it meets and the
      // kill that follows are the player's (slice-A fling pipeline), then handed to the ONE law.
      recordImpulseProvenance(target, {
        actorId: state.playerId,
        weaponId: def.moduleId,
        tag: 'hull_burst',
        appliedTick: state.tick | 0,
        magnitude,
      });
      const hitSide = signedHitSide(target, { x: dirX, z: dirZ }, {
        pos: { x: finite(target.pos.x), z: finite(target.pos.z) + Math.max(4, finite(target.radius, 8) * 0.75) },
      }, target.id);
      publishHitstunImpulse(this.bus, {
        source: def.hitStunSource,
        victimId: target.id,
        attackerId: state.playerId,
        attackerMass: bumperMass,
        victimMass: targetMass,
        deltaV,
        dirX,
        dirZ,
        hitSide,
        provenance: Object.freeze({
          schemaVersion: 1, kind: 'hull_burst', source: def.id, tag: 'hull_burst',
        }),
        tick: state.tick,
      });
    }
    if (this.bus) {
      this.bus.emit('hullBurst:hit', {
        kind: def.id, targetId: target.id, hostile, deltaV, closing,
        pos: { x: target.pos.x, z: target.pos.z }, dirX, dirZ,
      });
      if (hostile) this.bus.emit('audio:cue', { id: 'sfx_explosion_small', position: { x: target.pos.x, z: target.pos.z }, gain: 0.7 });
    }
  },
};
