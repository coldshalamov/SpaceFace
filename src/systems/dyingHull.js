// dyingHull - the failure interval between a decisive kill and its single rupture.
//
// WHO OWNS WHAT (design/combat-convergence/08, "separate life, incapacity, death, spectacle")
//   * ONE canonical transition owns the kill: combat.kill() sets alive=false and emits
//     `entity:killed` - kill credit, xp, loot entitlement, mission and run consequences all settle
//     there, on the kill tick, exactly once. This system never touches any of it, never emits a
//     kill, never grants a reward, never delays or replays the death.
//   * aftermathWrecks already turns that kill into the victim's successor body on the same tick: a
//     real dynamic wreck carrying the victim's velocity, spin, mass and radius, the cargo/loot
//     identity (marker + salvage pool) and the hulk visual. That body IS the authoritative planar
//     body, so a "dying hull" needs no second body and no decorative offset: this system marks the
//     successor `dying` for a bounded, mass-shaped window and then converts it ONCE.
//   * Lifecycle meaning lives in src/combat/lifecycle.js (`lifecycleOf` -> 'dying' while the record
//     below stands). The record is a transient runtime mirror (`state.dyingHullRuntime`): never
//     serialized, never a save field. A reloaded wreck simply reads 'wreck'.
//
// WHAT HAPPENS DURING THE WINDOW (all through the existing owners)
//   * Inherited motion continues untouched (physics owns it). The only added forces are the two a
//     failing hull actually has: ONE finite damaged-nozzle impulse (a lateral push off the heading,
//     bounded by hull mass) and ONE finite yaw impulse (the tumble), both through the physics
//     command membrane, hash-seeded (never state.rng). Nothing is a velocity reset.
//   * Presentation (render/vfx.js) holds the existing death explosion for the window, trails smoke
//     and vents from the real wreck, then detonates at the wreck's CURRENT position.
//
// THE RUPTURE (exactly once per hull)
//   * `dyingHull:ruptured` fires once. For medium+ hulls the existing fracture owner
//     (hullFracture.spawnCollisionTearOff) sheds one or two real tear-off pieces from the parent's
//     live motion. No damage payload rides the event: a delayed explosion is a presentation beat
//     plus those finite bodies, never a replay of the death damage.
//   * If the wreck vanishes first (salvaged, destroyed, sector teardown) the record is dropped and
//     `dyingHull:lost` tells presenters to release their hold; nothing ruptures twice.
//
// WAVES / RUNS NEVER STALL: the successor is a `wreck`, not a combatant. Every run owner counted the
// kill on the kill tick; a dying wreck is not in any hostile census, so no wave waits on it.
//
// GOLDEN SAFETY: gated on combatFlag('tumbleFling') (production ON, legacy47a OFF - the hull-burst
// overhaul switch this belongs to), NOT in the sf-sim curated system list, a strict no-op with no
// queued work (two integer reads), no state.rng draw except at a medium+ rupture's tear-off.

import { combatFlag } from '../data/featureFlags.js';
import { hash32 } from '../core/rng.js';
import {
  ensurePhysicsBodySpec,
  isDynamicPhysicsBodyEntity,
  queuePhysicsImpulse,
  queuePhysicsTorqueImpulse,
} from '../core/physicsAuthority.js';
import {
  DYING_RUNTIME_KEY,
  dyingHullTier,
  dyingMassOf,
  dyingWindowS,
} from '../combat/lifecycle.js';
import { aftermathForSector } from './aftermathWrecks.js';
import { spawnCollisionTearOff } from './hullFracture.js';

/** Bounded forces of a failing hull (prototype values; tune through comparative motion review). */
export const DYING_FORCE_LAW = Object.freeze({
  // damaged-nozzle push: dv = clamp(base + perSpeed * |v|, min, max), scaled down for heavier hulls
  nozzleBaseDv: 3,
  nozzlePerSpeed: 0.08,
  nozzleMinDv: 3,
  nozzleMaxDv: 11,
  // yaw impulse: an added tumble of this many rad/s (sign from the hash), heavier hulls less
  tumbleMin: 0.5,
  tumbleMax: 1.5,
  maxSpin: 6,
  // hull mass at which the scale-down starts; floor so a heavy hull is slower to veer, never inert
  refMass: 16,
  massScaleFloor: 0.35,
});

/**
 * The visual roll/pitch of a failing hull. These are the presentation pose fields the hull mesh
 * already reads (entity.pitch / entity.bank); the planar collision footprint and every authoritative
 * quantity are untouched. Eased in so the hull rolls late and hard, like a body losing its last
 * attitude control. Reduced motion keeps the smoke/state cue and no tilt.
 */
export const DYING_POSE_LAW = Object.freeze({ pitch: 0.55, bank: 1.0, ease: 1.7 });

/** Pure: the tilt added to the pose the hull died in, at progress 0..1 through its window. */
export function dyingPose(progress, side, reduced = false) {
  if (reduced) return { pitch: 0, bank: 0 };
  const t = clamp(finite(progress), 0, 1);
  const k = Math.pow(t * t * (3 - 2 * t), DYING_POSE_LAW.ease);
  return { pitch: DYING_POSE_LAW.pitch * k, bank: (side < 0 ? -1 : 1) * DYING_POSE_LAW.bank * k };
}

function motionReduced(state) {
  const settings = state && state.settings;
  return !!(settings && ((settings.video && settings.video.motionReduce) || (settings.accessibility && settings.accessibility.flashReduce)));
}

/** Tear-off pieces shed at the rupture, by tier. Light hulls just burst. */
export const DYING_FRAGMENTS = Object.freeze({ light: 0, medium: 1, heavy: 2, capital: 2 });

const STAMP_WINDOW_TICKS = 3; // a successor older than this was not minted by the kill we heard
const KILL_NOTE_TTL_TICKS = 4;
const KILL_NOTE_CAP = 64;
const RECORD_CAP = 24; // simultaneous dying hulls; the oldest ruptures early rather than pile up
const LATE_RUPTURE_S = 1.5; // resumed from a long pause/dock: skip the staged beat, still rupture once

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

export function ensureDyingRuntime(state) {
  if (!state) return null;
  let rt = state[DYING_RUNTIME_KEY];
  if (!rt || typeof rt !== 'object' || !rt.byWreckId || typeof rt.byWreckId !== 'object') {
    rt = state[DYING_RUNTIME_KEY] = { byWreckId: {}, count: 0, begun: 0, ruptured: 0, lost: 0 };
  }
  return rt;
}

function simNow(state) {
  return Number.isFinite(state.simTime) ? state.simTime : finite(state.tick) / 60;
}

function featuresOf(state) {
  return state && state.runtime && state.runtime.features ? state.runtime.features : undefined;
}

/** A body the player (or any NPC) is physically hauling must not be shoved by a hidden nozzle. */
function isTetherHeld(state, id) {
  const tether = state.player && state.player.tether;
  if (tether && tether.active && (tether.targetId === id || tether.sourceId === id)) return true;
  const remote = state.player && state.player.remoteMassline;
  if (remote && remote.active && (remote.targetId === id || remote.sourceId === id || remote.caughtId === id)) return true;
  const byId = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (byId) {
    for (const key of Object.keys(byId)) {
      const a = byId[key];
      if (a && a.state === 'active' && (a.ownerId === id || a.targetId === id)) return true;
    }
  }
  return false;
}

/** Pure: the two finite forces a failing hull adds, from mass, speed, heading and a hash. */
export function dyingForces({ mass, speed, rot, seed, markerId, spinNow = 0, inertia = 1 }) {
  const law = DYING_FORCE_LAW;
  const m = Math.max(0.1, finite(mass, law.refMass));
  const massScale = clamp(Math.sqrt(law.refMass / m), law.massScaleFloor, 1);
  const h1 = hash32(seed, markerId, 'dyingNozzleSide');
  const h2 = hash32(seed, markerId, 'dyingNozzleSwing');
  const h3 = hash32(seed, markerId, 'dyingTumble');
  const side = (h1 & 1) ? 1 : -1;
  // lateral off the heading, with a hash swing of +-25 degrees so a fleet of kills never fans alike
  const swing = (((h2 % 51) - 25) * Math.PI) / 180;
  const angle = finite(rot) + side * (Math.PI / 2) + swing;
  const dv = clamp(law.nozzleBaseDv + law.nozzlePerSpeed * Math.max(0, finite(speed)), law.nozzleMinDv, law.nozzleMaxDv) * massScale;
  const tumble = (law.tumbleMin + ((h3 % 1001) / 1000) * (law.tumbleMax - law.tumbleMin)) * massScale;
  const spinTarget = clamp(finite(spinNow) + side * tumble, -law.maxSpin, law.maxSpin);
  return {
    impulse: { x: Math.cos(angle) * dv * m, y: 0, z: Math.sin(angle) * dv * m },
    torque: { x: 0, y: Math.max(0.1, finite(inertia, 1)) * (spinTarget - finite(spinNow)), z: 0 },
    dv,
    spinDelta: spinTarget - finite(spinNow),
    side,
  };
}

export const dyingHull = {
  id: 'dyingHull',
  name: 'dyingHull',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._kills = new Map(); // victimId -> { tick, payload }
    this._unsubs = [];
    ensureDyingRuntime(this.state);
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('entity:killed', (p) => this._noteKill(p)));
      this._unsubs.push(this.bus.on('aftermathWreck:spawned', (p) => this._noteWreck(p)));
      // Teardown boundaries: nothing may outlive the world it described. No rupture, no reward.
      for (const event of ['sector:enter', 'sector:exit', 'save:loaded', 'game:new', 'game:newGame', 'game:started']) {
        this._unsubs.push(this.bus.on(event, () => this._clearAll(event)));
      }
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
    this._kills.clear();
    const rt = this.state && this.state[DYING_RUNTIME_KEY];
    if (rt) { rt.byWreckId = {}; rt.count = 0; }
  },

  update(dt, state) {
    const live = state[DYING_RUNTIME_KEY];
    if (this._kills.size) this._pruneKills(state);
    if (!live || live.count === 0) return;
    if (state.mode !== 'flight') return;
    const now = simNow(state);
    for (const key of Object.keys(live.byWreckId)) {
      const rec = live.byWreckId[key];
      if (!rec) continue;
      const wreck = state.entities && state.entities.get ? state.entities.get(rec.wreckId) : null;
      if (!this._stillThisBody(wreck, rec)) { this._lose(state, rec, 'gone'); continue; }
      if (now >= rec.ruptureAt) this._rupture(state, rec, wreck, now);
      else this._tilt(state, rec, wreck, now);
    }
  },

  // ---- event intake ---------------------------------------------------------------------------
  // The stamp happens SYNCHRONOUSLY inside the aftermath spawn event, i.e. inside the kill's own
  // emit: audio and presenters that read the record when they handle `entity:killed` (whenever the
  // presentation drain gets to it) therefore always find it, with no one-tick lag for kills that
  // land late in the update order. aftermathWrecks registers before this system, so the kill note
  // may not exist yet when the wreck arrives; `_noteKill` back-fills the record's direction/cause.

  _noteKill(payload) {
    if (!payload || payload.id == null) return;
    const state = this.state;
    if (this._kills.size >= KILL_NOTE_CAP) this._pruneKills(state, true);
    this._kills.set(payload.id, { tick: state.tick | 0, payload });
    const rt = state[DYING_RUNTIME_KEY];
    if (!rt || rt.count === 0) return;
    for (const key of Object.keys(rt.byWreckId)) {
      const rec = rt.byWreckId[key];
      if (!rec || rec.victimId !== payload.id) continue;
      const presentation = payload.presentation && typeof payload.presentation === 'object' ? payload.presentation : null;
      if (presentation) {
        if (typeof presentation.cause === 'string') rec.cause = presentation.cause;
        const d = presentation.direction;
        if (d && Number.isFinite(d.x) && Number.isFinite(d.z)) rec.direction = { x: d.x, z: d.z };
      }
    }
  },

  _noteWreck(payload) {
    if (!payload || payload.entityId == null) return;
    const state = this.state;
    if (!combatFlag('tumbleFling', featuresOf(state))) return;
    this._begin(state, {
      entityId: payload.entityId,
      markerId: payload.markerId,
      sectorId: payload.sectorId,
    });
  },

  _pruneKills(state, force = false) {
    const tick = state.tick | 0;
    for (const [id, note] of this._kills) {
      if (force || tick - note.tick > KILL_NOTE_TTL_TICKS) this._kills.delete(id);
    }
  },

  _clearAll(reason) {
    const state = this.state;
    this._kills.clear();
    const rt = state && state[DYING_RUNTIME_KEY];
    if (!rt || rt.count === 0) return;
    for (const key of Object.keys(rt.byWreckId)) {
      const rec = rt.byWreckId[key];
      delete rt.byWreckId[key];
      if (rec && this.bus) this.bus.emit('dyingHull:lost', { wreckId: rec.wreckId, victimId: rec.victimId, markerId: rec.markerId, reason });
    }
    rt.count = 0;
  },

  // ---- begin ----------------------------------------------------------------------------------

  _begin(state, item) {
    const wreck = state.entities && state.entities.get ? state.entities.get(item.entityId) : null;
    if (!wreck || wreck.alive === false || wreck.type !== 'wreck' || !wreck.data || !wreck.pos) return;
    const data = wreck.data;
    // Only the body the kill minted on this very tick: re-entry / rematerialization emits the same
    // event for an old wreck, and an old wreck is simply a wreck.
    const killedAt = Number(data.killedAt);
    const now = simNow(state);
    if (!Number.isFinite(killedAt) || now - killedAt > STAMP_WINDOW_TICKS / 60 + 1e-6 || killedAt - now > 1e-6) return;
    if (data.fracturePiece || data.playerWreck === true || data.arenaShardOf || data.collisionTearOff) return;
    if (data.markerId !== item.markerId) return;
    const markers = aftermathForSector(state, item.sectorId);
    let marker = null;
    for (const m of markers) { if (m && m.markerId === item.markerId) { marker = m; break; } }
    if (!marker || marker.source !== 'entity:killed' || marker.pinWreck === true || marker.playerWreck === true) return;
    if (!isDynamicPhysicsBodyEntity(wreck)) return;
    const rt = ensureDyingRuntime(state);
    if (rt.byWreckId[wreck.id]) return; // already dying: begin is idempotent
    const note = marker.victimId != null ? this._kills.get(marker.victimId) : null;
    const kill = note ? note.payload : null;
    // Boss / base / capital-boss deaths keep their authored sequences.
    if (kill && (kill.baseKind || kill.isBoss === true)) return;
    const victim = marker.victimId != null && state.entities.get ? state.entities.get(marker.victimId) : null;
    const vd = victim && victim.data;
    if (vd && (vd.isBoss === true || vd.bossId != null || vd.missionTag === 'capital_boss' || vd.bossDressing != null)) return;

    const mass = dyingMassOf(marker.victimMass, marker.victimRadius);
    const tier = dyingHullTier(marker.victimMass, marker.victimRadius);
    const windowS = dyingWindowS({
      mass: marker.victimMass,
      radius: marker.victimRadius,
      overkill: kill && Number.isFinite(kill.overkill) ? kill.overkill : 0,
    });
    // Keep the pool bounded: a massacre ruptures the oldest hull early instead of stacking records.
    if (rt.count >= RECORD_CAP) this._ruptureOldest(state);

    const presentation = kill && kill.presentation && typeof kill.presentation === 'object' ? kill.presentation : null;
    const dir = presentation && presentation.direction && Number.isFinite(presentation.direction.x)
      ? { x: presentation.direction.x, z: presentation.direction.z } : null;
    const rec = {
      wreckId: wreck.id,
      markerId: item.markerId,
      victimId: marker.victimId != null ? marker.victimId : null,
      killerId: marker.killerId != null ? marker.killerId : null,
      killedAt,
      startedAt: now,
      ruptureAt: killedAt + windowS,
      windowS,
      tier,
      mass,
      radius: Math.max(1, finite(marker.victimRadius, finite(wreck.radius, 6))),
      cause: presentation && typeof presentation.cause === 'string' ? presentation.cause : 'generic',
      direction: dir,
      ruptured: false,
      nozzle: null,
      side: (hash32(state.meta && state.meta.seed, item.markerId, 'dyingNozzleSide') & 1) ? 1 : -1,
      pose0: { pitch: finite(wreck.pitch), bank: finite(wreck.bank) },
    };
    rt.byWreckId[wreck.id] = rec;
    rt.count += 1;
    rt.begun += 1;

    // The two forces of a failing hull - through the physics command membrane, once.
    if (!isTetherHeld(state, wreck.id)) {
      const body = ensurePhysicsBodySpec(wreck);
      const forces = dyingForces({
        mass: finite(wreck.physicsBody && wreck.physicsBody.mass, finite(wreck.mass, mass)),
        speed: Math.hypot(finite(wreck.vel && wreck.vel.x), finite(wreck.vel && wreck.vel.z)),
        rot: wreck.rot,
        seed: state.meta && state.meta.seed,
        markerId: item.markerId,
        spinNow: finite(wreck.angVel),
        inertia: finite(body && body.inertiaY, 1),
      });
      queuePhysicsImpulse(wreck, forces.impulse, { kind: 'dying_nozzle', tick: state.tick | 0 });
      queuePhysicsTorqueImpulse(wreck, forces.torque, { kind: 'dying_tumble', tick: state.tick | 0 });
      rec.nozzle = { dv: forces.dv, spinDelta: forces.spinDelta, side: forces.side };
    }

    if (this.bus) {
      this.bus.emit('dyingHull:begin', {
        wreckId: wreck.id,
        victimId: rec.victimId,
        markerId: rec.markerId,
        killedAt,
        ruptureAt: rec.ruptureAt,
        windowS,
        tier,
        mass,
        radius: rec.radius,
        cause: rec.cause,
        pos: { x: wreck.pos.x, z: wreck.pos.z },
        vel: { x: finite(wreck.vel && wreck.vel.x), z: finite(wreck.vel && wreck.vel.z) },
        direction: dir,
      });
    }
  },

  // ---- pose / rupture / loss ------------------------------------------------------------------

  /** Presentation roll/pitch only: a function of sim time, written to the pose fields the mesh reads. */
  _tilt(state, rec, wreck, now) {
    const span = rec.ruptureAt - rec.startedAt;
    if (!(span > 0)) return;
    const pose = dyingPose((now - rec.startedAt) / span, rec.side, motionReduced(state));
    wreck.pitch = rec.pose0.pitch + pose.pitch;
    wreck.bank = rec.pose0.bank + pose.bank;
  },

  _stillThisBody(wreck, rec) {
    if (!wreck || wreck.alive === false || wreck.type !== 'wreck' || !wreck.data) return false;
    if (Number(wreck.data.killedAt) !== rec.killedAt) return false;
    return wreck.data.markerId === rec.markerId;
  },

  _ruptureOldest(state) {
    const rt = state[DYING_RUNTIME_KEY];
    let oldest = null;
    for (const key of Object.keys(rt.byWreckId)) {
      const rec = rt.byWreckId[key];
      if (rec && (!oldest || rec.ruptureAt < oldest.ruptureAt)) oldest = rec;
    }
    if (!oldest) return;
    const wreck = state.entities.get(oldest.wreckId);
    if (this._stillThisBody(wreck, oldest)) this._rupture(state, oldest, wreck, simNow(state));
    else this._lose(state, oldest, 'gone');
  },

  _drop(state, rec) {
    const rt = state[DYING_RUNTIME_KEY];
    if (!rt || !rt.byWreckId[rec.wreckId]) return false;
    delete rt.byWreckId[rec.wreckId];
    rt.count = Math.max(0, rt.count - 1);
    return true;
  },

  _lose(state, rec, reason) {
    if (!this._drop(state, rec)) return;
    const rt = state[DYING_RUNTIME_KEY];
    rt.lost += 1;
    if (this.bus) this.bus.emit('dyingHull:lost', { wreckId: rec.wreckId, victimId: rec.victimId, markerId: rec.markerId, reason });
  },

  _rupture(state, rec, wreck, now) {
    // Exactly once: the record is the latch. A re-entrant emit cannot find it again.
    if (rec.ruptured || !this._drop(state, rec)) return;
    rec.ruptured = true;
    const rt = state[DYING_RUNTIME_KEY];
    rt.ruptured += 1;
    const pos = { x: wreck.pos.x, z: wreck.pos.z };
    const vel = { x: finite(wreck.vel && wreck.vel.x), z: finite(wreck.vel && wreck.vel.z) };
    const speed = Math.hypot(vel.x, vel.z);
    // Directional ejection: the way the killing blow travelled, else the way the hull was moving.
    let dir = rec.direction;
    if (!dir || !(Math.hypot(dir.x, dir.z) > 1e-6)) {
      dir = speed > 1e-3 ? { x: vel.x / speed, z: vel.z / speed } : { x: Math.cos(finite(wreck.rot)), z: Math.sin(finite(wreck.rot)) };
    } else {
      const len = Math.hypot(dir.x, dir.z);
      dir = { x: dir.x / len, z: dir.z / len };
    }
    // A few important physical fragments, from the real parent's motion, by the existing owner.
    let pieceIds = [];
    const count = DYING_FRAGMENTS[rec.tier] || 0;
    if (count > 0 && now - rec.ruptureAt <= LATE_RUPTURE_S) {
      const spawned = spawnCollisionTearOff({ state, helpers: this.helpers, bus: this.bus }, {
        victimId: wreck.id,
        pos,
        vel,
        angVel: finite(wreck.angVel),
        normal: dir,
        closingSpeed: 40 + 0.5 * speed,
        count,
        tick: state.tick | 0,
        mass: Math.max(0.1, finite(wreck.physicsBody && wreck.physicsBody.mass, finite(wreck.mass, rec.mass))),
        radius: Math.max(1, finite(wreck.radius, rec.radius)),
        momentum: rec.mass * 40,
        sectorId: (state.world && state.world.currentSectorId) || null,
        dyingHullRupture: true,
      });
      if (spawned) pieceIds = spawned.map((piece) => piece.id);
    }
    if (this.bus) {
      this.bus.emit('dyingHull:ruptured', {
        wreckId: wreck.id,
        victimId: rec.victimId,
        killerId: rec.killerId,
        markerId: rec.markerId,
        tier: rec.tier,
        cause: rec.cause,
        pos,
        vel,
        direction: dir,
        mass: rec.mass,
        radius: rec.radius,
        windowS: rec.windowS,
        late: now - rec.ruptureAt > LATE_RUPTURE_S,
        pieceIds,
        tick: state.tick | 0,
      });
    }
  },
};
