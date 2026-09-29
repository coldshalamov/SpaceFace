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
import { scalarHitToDamagePacket } from '../combat/damage.js';
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

/** Same rule the renderer applies: either accessibility flag keeps a danger tell readable, not blinding. */
function flashReduced(state) {
  const settings = state && state.settings;
  const v = settings && settings.video;
  const a = settings && settings.accessibility;
  return !!((v && (v.motionReduce || v.flashReduce)) || (a && a.flashReduce));
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
 *   raw = (kick + (1 + bounce) * eff) * bumperMass / (bumperMass + targetMass),  eff = c^2 / (c + toe)
 *   deltaV = raw up to the knee, then knee + (max - knee) * tanh((raw - knee) / (max - knee))
 * Two properties matter. The ceiling is soft: a hard clamp gives a light hull, a medium and a Bastion the
 * same number once the arrival is fast, and "a heavy shrugs" stops being true exactly when it matters.
 * And the knee is above the arrival speeds the module rewards: a thrown light hull must leave the nose
 * FASTER than the player is flying (about 1.2 x closing for a Wasp), or the player rams it again.
 */
export function hullBurstDeltaV(def, closing, bumperMass, targetMass) {
  const c = Math.max(0, finite(closing));
  const share = bumperMass / (bumperMass + Math.max(0.1, targetMass));
  // The toe keeps a crawl a nudge: the shove beat (SHOVE_BEAT_LAW) gives ANY shove-class hit past u = 0.3 about a
  // screen of travel, so the only way to have a touch that is smaller than a screen is to stay under it.
  const eff = c * c / (c + Math.max(1e-6, finite(def.toeClosingWuS, 0)));
  const raw = (def.kickWuS + (1 + def.bounce) * eff) * share;
  const r = Math.max(0, raw);
  const knee = Math.min(def.kneeWuS, def.maxDeltaVWuS);
  if (r <= knee) return r;
  const span = def.maxDeltaVWuS - knee;
  return span > 0 ? knee + span * Math.tanh((r - knee) / span) : knee;
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
    // The once-per-activation latch is a WeakSet of ENTITY OBJECTS, not ids: this runtime recycles entity ids,
    // so an id latch would skip a new hull that reused a dead hull's id inside one window. It lives on the
    // system, not in state, so nothing that snapshots or clones state ever meets a Set.
    this._latched = new WeakSet();
    // The hull the Grip Bumper is carrying (an entity object; state.hullBurst.grip holds only its id, as plain data).
    this._held = null;
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
      state.hullBurst = { phase: 'ready', kind: null, activeUntil: 0, readyAt: 0, hits: 0, grip: null };
    }
    return state.hullBurst;
  },

  _reset() {
    const rt = this._ensureRuntime();
    if (!rt) return;
    rt.phase = 'ready'; rt.kind = null; rt.activeUntil = 0; rt.readyAt = 0; rt.hits = 0; rt.grip = null;
    this._held = null;
    this._latched = new WeakSet();
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
    this._latched = new WeakSet();
    if (this.bus) {
      this.bus.emit('hullBurst:activated', {
        kind: def.id, name: def.name, durationS: def.durationS, cooldownS: def.cooldownS,
        reachWu: def.reachWu, halfAngleRad: def.halfAngleRad,
      });
      // Presentation only (bus events; the sim never reads them back): a gravitic thrum and a flare at the nose.
      const nose = { x: player.pos.x + Math.cos(finite(player.rot)) * finite(player.radius, 12), z: player.pos.z + Math.sin(finite(player.rot)) * finite(player.radius, 12) };
      this.bus.emit('audio:cue', { id: 'sfx_wpn_gravitic', position: nose, gain: 0.8 });
      this.bus.emit('presentation:vfxCue', { id: 'hullburst.ignite', lane: 'hullburst', pos: nose, particles: 20, lights: 1, flashReduced: flashReduced(state) });
    }
    return true;
  },

  _end(reason) {
    const rt = this.state && this.state.hullBurst;
    if (!rt || rt.phase !== 'active') return;
    if (this._held) this._release(reason);
    rt.phase = 'cooling';
    this._latched = new WeakSet();
    const now = simNow(this.state);
    // Cutting it short keeps the recharge honest: the clock always runs from the moment it stopped.
    const def = fittedHullBurst(this.state) || resolveHullBurst(rt.kind, 1);
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
      // Pressing the key again while the Grip Bumper holds a hostage lets it go (and ends the burst: the
      // recharge starts now, from the cut). For every other burst a press while active is simply refused.
      if (rt.phase === 'active' && this._held) this._end('cut');
      else this.activate();
    }
    const now = simNow(state);
    if (rt.phase === 'cooling' && now >= rt.readyAt) {
      rt.phase = 'ready';
      if (this.bus) this.bus.emit('audio:cue', { id: 'sfx_wpn_capacitor_ready', gain: 0.6 });
    }
    if (rt.phase !== 'active') return;
    if (now >= rt.activeUntil) { this._end('expired'); return; }
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    const def = fittedHullBurst(state);
    if (!player || player.alive === false || !def) { this._end('interrupted'); return; }
    if (this._held) this._carry(state, rt, def, player);
    else this._sweep(state, rt, def, player);
  },

  _sweep(state, rt, def, player) {
    const queryRadius = def.reachWu + finite(player.radius, 12) + 80;
    const near = candidatesNear(state, player.pos, queryRadius, this._scratch);
    const bumperMass = massOf(player, 1) * def.massScale;
    const playerTeam = player.team;
    for (const target of near) {
      if (!target || !target.alive || target.id === player.id) continue;
      if (!CANDIDATE_TYPES.has(target.type)) continue;
      if (this._latched.has(target)) continue;
      const geo = hullBurstWedgeHit(def, player, target);
      if (!geo) continue;
      this._latched.add(target);
      const closing = (finite(player.vel && player.vel.x) - finite(target.vel && target.vel.x)) * geo.radialX
        + (finite(player.vel && player.vel.z) - finite(target.vel && target.vel.z)) * geo.radialZ;
      const hostile = isHostileToPlayer(target, playerTeam, state);
      this._deliver(state, rt, def, player, target, geo, closing, bumperMass, hostile);
    }
  },

  /** One hostile (or not) inside the wedge, once: what happens is the fitted type's `effect`. */
  _deliver(state, rt, def, player, target, geo, closing, bumperMass, hostile) {
    switch (def.effect) {
      case 'lance': return this._lance(state, rt, def, player, target, closing, hostile);
      case 'grip': return this._grip(state, rt, def, player, target, closing, hostile);
      default: return this._hurl(state, rt, def, player, target, geo, closing, bumperMass, hostile);
    }
  },

  /**
   * FIRE LANCE. Thermal damage through the combat kernel, credited to the player (so a kill is the player's
   * and pays the ordinary loot burst). Full effect at `fullSpeedWuS` closing; below it the hit scales down but
   * never to nothing. A light or medium hull takes more than its whole pool and dies; a heavy takes a bounded
   * share and burns. A non-hostile hull is left alone: a lance does not nudge, it burns, and it burns the
   * player's enemies only.
   */
  _lance(state, rt, def, player, target, closing, hostile) {
    if (!hostile) return;
    const mass = massOf(target, 1);
    const scale = Math.max(def.minScale, Math.min(1, finite(closing) / def.fullSpeedWuS));
    const pool = Math.max(0, finite(target.hull)) + Math.max(0, finite(target.shield)) + Math.max(0, finite(target.armorHp));
    const light = mass <= def.lightMediumMaxMass;
    const full = light
      ? pool * def.lethalMargin + Math.max(0, finite(target.armorFlat))
      : Math.min(pool * def.heavyPoolShare, def.heavyDamageCap);
    const damage = full * scale;
    if (!(damage > 0)) return;
    const stacks = Math.max(1, Math.round(def.burnStacks * scale));
    const at = { x: finite(target.pos.x), z: finite(target.pos.z) };
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'thermal',
      pos: at,
      approach: { x: Math.cos(finite(player.rot)), z: Math.sin(finite(player.rot)) },
      statuses: [{ id: 'status_burning', stacks }],
      source: { kind: 'hull_burst', burst: def.id, moduleId: def.moduleId },
    });
    packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
    rt.hits += 1;
    this._routeDamage({
      attackerId: state.playerId,
      targetId: target.id,
      packet,
      origin: { kind: 'hull_burst', id: def.moduleId },
    });
    if (this.bus) {
      this.bus.emit('hullBurst:hit', { kind: def.id, targetId: target.id, hostile: true, damage, closing, scale, burnStacks: stacks, lethal: light && scale >= 0.99, pos: at });
      this.bus.emit('audio:cue', { id: 'sfx_bomb_thermite_ignite', position: at, gain: 0.5 + 0.5 * scale });
      this.bus.emit('presentation:vfxCue', { id: 'hullburst.lance', lane: 'hullburst', pos: at, particles: Math.round(10 + 24 * scale), lights: 1, flashReduced: flashReduced(state) });
    }
  },

  /**
   * GRIP BUMPER: catch the first light hostile hull the wedge meets. It is held by _carry every tick until the
   * burst ends, the player presses the key again, or the hostage dies. Anything else in the wedge is ignored
   * while a hull is held (one hostage), and a hull too heavy to catch is not touched at all.
   */
  _grip(state, rt, def, player, target, closing, hostile) {
    if (!hostile || this._held) return;
    if (massOf(target, 1) > def.gripMaxMass) return;
    this._held = target;
    rt.grip = { targetId: target.id, since: simNow(state), refreshAt: simNow(state) + def.refreshS };
    rt.hits += 1;
    this._takeHelm(state, def, player, target, def.massScale * massOf(player, 1), 'catch');
    if (this.bus) {
      const at = { x: finite(target.pos.x), z: finite(target.pos.z) };
      this.bus.emit('hullBurst:hit', { kind: def.id, targetId: target.id, hostile: true, caught: true, closing: finite(closing), pos: at });
      this.bus.emit('audio:cue', { id: 'sfx_tether_latch_lock', position: at, gain: 0.9 });
      this.bus.emit('presentation:vfxCue', { id: 'hullburst.catch', lane: 'hullburst', pos: at, particles: 16, lights: 1, flashReduced: flashReduced(state) });
    }
  },

  /**
   * Keep the hostage's helm lost and credit the player for it. A hitstun impulse takes the helm for a duration
   * set by the one law; the carry re-takes it every `refreshS` so the stun always outlasts the hold. The
   * impulse record names the player, so a rock the carried hull meets is the player's kill.
   */
  _takeHelm(state, def, player, target, bumperMass, phase) {
    const targetMass = massOf(target, 1);
    const rot = finite(player.rot);
    const dirX = Math.cos(rot);
    const dirZ = Math.sin(rot);
    recordImpulseProvenance(target, { actorId: state.playerId, weaponId: def.moduleId, tag: 'hull_burst', appliedTick: state.tick | 0, magnitude: 0 });
    publishHitstunImpulse(this.bus, {
      // 'hull_grip' is deliberately NOT a shove-class source: a held hull must not have its inbound velocity
      // cancelled or be handed the outbound floor; the carry moves it. It still gets the law's helm loss.
      source: 'hull_grip',
      victimId: target.id,
      attackerId: state.playerId,
      attackerMass: bumperMass,
      victimMass: targetMass,
      deltaV: 0.9 * Math.max(60, finite(target.combatSpeed, 120)),
      dirX,
      dirZ,
      hitSide: signedHitSide(target, { x: dirX, z: dirZ }, null, target.id),
      provenance: Object.freeze({ schemaVersion: 1, kind: 'hull_burst', source: def.id, tag: 'hull_burst', phase }),
      tick: state.tick,
    });
  },

  /** One tick of the carry: a spring-damper toward the nose socket, delivered as an impulse. */
  _carry(state, rt, def, player) {
    const held = this._held;
    if (!held || held.alive === false) { this._held = null; rt.grip = null; return; }
    const physics = this.helpers && this.helpers.combatPhysics;
    if (!physics || typeof physics.applyImpulse !== 'function') return;
    const fx = Math.cos(finite(player.rot));
    const fz = Math.sin(finite(player.rot));
    const reach = finite(player.radius, 12) + finite(held.radius, 8) + def.gapWu;
    const dt = 1 / 60;
    let ax = def.springK * (finite(player.pos.x) + fx * reach - finite(held.pos.x)) + def.springDamp * (finite(player.vel && player.vel.x) - finite(held.vel && held.vel.x));
    let az = def.springK * (finite(player.pos.z) + fz * reach - finite(held.pos.z)) + def.springDamp * (finite(player.vel && player.vel.z) - finite(held.vel && held.vel.z));
    const mag = Math.hypot(ax, az);
    if (mag > def.maxAccelWuS2) { ax *= def.maxAccelWuS2 / mag; az *= def.maxAccelWuS2 / mag; }
    const m = massOf(held, 1);
    physics.applyImpulse({
      entityId: held.id,
      impulse: { x: ax * m * dt, z: az * m * dt },
      point: null,
      reason: 'hull_grip',
      tick: state.tick,
      provenance: { actorId: state.playerId, weaponId: def.moduleId, tag: 'hull_burst' },
    });
    const now = simNow(state);
    if (rt.grip && now >= rt.grip.refreshAt) {
      rt.grip.refreshAt = now + def.refreshS;
      this._takeHelm(state, def, player, held, def.massScale * massOf(player, 1), 'carry');
    }
  },

  /**
   * Let the hostage go at the player's speed plus a kick along the nose, so it always leaves ahead of the
   * player, then it is an ordinary flung hull: helm lost (a shove-class 'hull_burst' hit takes it, with the
   * outbound floor), credit held by the slice-A pipeline, whatever it hits afterwards is the player's doing.
   */
  _release(reason) {
    const held = this._held;
    const state = this.state;
    const rt = state && state.hullBurst;
    this._held = null;
    if (rt) rt.grip = null;
    if (!held || held.alive === false || !state) return;
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    const def = fittedHullBurst(state) || resolveHullBurst('grip', 1);
    const physics = this.helpers && this.helpers.combatPhysics;
    if (!player || !def || !physics || typeof physics.applyImpulse !== 'function') return;
    const fx = Math.cos(finite(player.rot));
    const fz = Math.sin(finite(player.rot));
    const wantX = finite(player.vel && player.vel.x) * def.releaseBoost + fx * def.releaseKickWuS;
    const wantZ = finite(player.vel && player.vel.z) * def.releaseBoost + fz * def.releaseKickWuS;
    const dvX = wantX - finite(held.vel && held.vel.x);
    const dvZ = wantZ - finite(held.vel && held.vel.z);
    const deltaV = Math.hypot(dvX, dvZ);
    const m = massOf(held, 1);
    physics.applyImpulse({
      entityId: held.id,
      impulse: { x: dvX * m, z: dvZ * m },
      point: null,
      reason: 'hull_burst',
      tick: state.tick,
      provenance: { actorId: state.playerId, weaponId: def.moduleId, tag: 'hull_burst' },
    });
    recordImpulseProvenance(held, { actorId: state.playerId, weaponId: def.moduleId, tag: 'hull_burst', appliedTick: state.tick | 0, magnitude: deltaV * m });
    if (deltaV > 1e-6) {
      publishHitstunImpulse(this.bus, {
        source: def.hitStunSource,
        victimId: held.id,
        attackerId: state.playerId,
        attackerMass: def.massScale * massOf(player, 1),
        victimMass: m,
        deltaV: Math.max(deltaV, 0.9 * Math.max(60, finite(held.combatSpeed, 120))),
        dirX: dvX / deltaV,
        dirZ: dvZ / deltaV,
        hitSide: signedHitSide(held, { x: dvX, z: dvZ }, null, held.id),
        provenance: Object.freeze({ schemaVersion: 1, kind: 'hull_burst', source: def.id, tag: 'hull_burst', phase: 'release' }),
        tick: state.tick,
      });
    }
    if (this.bus) {
      this.bus.emit('hullBurst:released', { kind: def.id, targetId: held.id, reason, deltaV });
      this.bus.emit('audio:cue', { id: 'sfx_massline_release', position: { x: finite(held.pos.x), z: finite(held.pos.z) }, gain: 0.8 });
    }
  },

  /** The combat kernel is the only writer of hull, shield and armour: same route the impulse-charge blast takes. */
  _routeDamage(request) {
    const helpers = this.helpers;
    if (helpers && typeof helpers.routeCombatDamage === 'function') return helpers.routeCombatDamage(request);
    if (this.bus) this.bus.emit('combat:routeDamage', request);
    return null;
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
      if (hostile) {
        const at = { x: target.pos.x, z: target.pos.z };
        // Louder and bigger the harder the throw: the cue scales with the delta-V it delivered.
        const weight = Math.max(0.2, Math.min(1, deltaV / def.maxDeltaVWuS));
        this.bus.emit('audio:cue', { id: 'sfx_bomb_concussion_shove', position: at, gain: 0.5 + 0.5 * weight });
        this.bus.emit('presentation:vfxCue', {
          id: 'hullburst.hit', lane: 'hullburst', pos: at, particles: Math.round(10 + 22 * weight), lights: 1, flashReduced: flashReduced(state),
        });
      }
    }
  },
};
