// Impulse charges system (GDD §4.4 "blast plates", BUILD_PLAN WS-D2 / GROK-1).
//
// Sticky radial impulse bombs: lob from the player nose, adhere to hulls/asteroids, detonate on R.
// armTimeS is the throw cooldown — charges arm instantly on stick. Friendly-fire on.
//
// Input contract (read-only): state.input.actions.chargeThrow / chargeDetonate (edge bools).
// Cargo: one cmdty_impulse_charge consumed per throw via removeCargo (src/systems/cargo.js).
// Impulse: routed through the physics authority's applyImpulse (helpers.combatPhysics, same port
// as combat/actions.js + combat/damage.js) — never a direct entity.vel write (ARCHITECTURE §3:
// under rapier-dynamic the backend owns body state; direct mutation desyncs the rigid body).
// Damage via combat routeDamage / scalarHitToDamagePacket.
// PQ-137.09 "Chains go off" (the second half of this file).
// A hull carrying an armed plate detonates when it SLAMS — the same slam the collision
// consequence kernel already calls a helm-taker (COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV) — and
// every detonation primes whatever it knocks past the stun threshold, judged by the one hitstun
// law (resolveHitstunLaw), for CHAIN_REACTION.primeWindowS. A primed hull with no plate left
// cooks off at a reduced yield when IT slams. Wells prime on grind through `well:grind`.
// This system is the SINGLE WRITER of primed state; fields.js only reports the grind.
import { CHAIN_REACTION, IMPULSE_CHARGES, MASSLINE_COMBOS } from '../data/impulseCharges.js';
import { removeCargo } from './cargo.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import {
  COLLISION_CONSEQUENCE_LIMITS,
  publishHitstunImpulse,
  recordImpulseProvenance,
  resolveHitstunLaw,
  signedHitSide,
} from '../combat/impulseKernel.js';
import { resolveGovernedCombatSpeed } from '../core/flight/propulsionCatalog.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { massline2Flag } from '../data/featureFlags.js';
import { MODULES } from '../data/modules.js';

const CHARGE_COMMODITY = 'cmdty_impulse_charge';
const STICK_TYPES = new Set(['ship', 'drone', 'asteroid']);
const BLAST_DAMAGE_TYPES = new Set(['ship', 'station', 'drone']);
const CHARGE_BY_ID = new Map(Object.entries(IMPULSE_CHARGES));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
// Bounded causal blast payload for presentation. A radial mine may shove many hulls; VFX may
// only illustrate the strongest real directions, never one invented global axis.
export const IMPULSE_CHARGE_SHOVE_CAP = 8;

// M3 bomb-propulsion dials. Brake/reverse + the existing throw verb drops an already-armed plate
// aft at a safe but still damaging standoff; R remains the deliberate detonation verb.
export const BOMB_PROPULSION_DIALS = Object.freeze({
  standoffRadii: 2.25,
  minStandoff: 13,
  // A fixed-radius blast cannot reach the center of capital hulls. Preserve the authored 2.25R
  // placement on small ships, but cap the clear gap behind the hull to half the blast radius.
  maxSurfaceGapRadiusFrac: 0.5,
  relativeDropSpeed: 0,
  selfImpulseMult: 4.5,
  referenceSelfImpulseMin: 2200,
});

function chargeDef(id) {
  return CHARGE_BY_ID.get(id) || CHARGE_BY_ID.get('charge_standard');
}

/** Sim clock, never wall time (root AGENTS.md §2/§6). */
function simNow(state) {
  if (!state) return 0;
  return Number.isFinite(state.simTime) ? state.simTime : (state.tick || 0) / 60;
}

/** Solver mass, authored body first — the same read the hitstun law and the fields owner use. */
function massOf(entity, fallback = 1) {
  const body = entity && entity.physicsBody;
  const m = body && Number(body.mass) > 0 ? Number(body.mass) : Number(entity && entity.mass);
  return Number.isFinite(m) && m > 0 ? m : fallback;
}

function ensurePlayerRuntime(player) {
  const d = player.data || (player.data = {});
  if (!d.impulseCharges) d.impulseCharges = { throwCdT: 0 };
  return d.impulseCharges;
}

function aimDir(player, state) {
  const aw = state.input && state.input.aimWorld;
  if (aw) {
    const dx = aw.x - player.pos.x, dz = aw.z - player.pos.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) return Math.atan2(dz, dx);
  }
  const inp = state.input;
  return (inp && inp.aimAngle != null) ? inp.aimAngle : (player.rot || 0);
}

function linearFalloff(dist, radius) {
  if (!(radius > 0)) return 0;
  return Math.max(0, 1 - dist / radius);
}

function considerImpulseShove(shoves, id, dirX, dirZ, mag) {
  const shove = { id, dx: dirX, dz: dirZ, mag };
  if (shoves.length < IMPULSE_CHARGE_SHOVE_CAP) {
    shoves.push(shove);
    return;
  }
  let weakest = 0;
  for (let i = 1; i < shoves.length; i++) {
    if (shoves[i].mag < shoves[weakest].mag) weakest = i;
  }
  if (mag > shoves[weakest].mag) shoves[weakest] = shove;
}

function freezeImpulseShoves(shoves) {
  const out = new Array(shoves.length);
  for (let i = 0; i < shoves.length; i++) {
    const row = shoves[i];
    out[i] = Object.freeze({ id: row.id, dx: row.dx, dz: row.dz, mag: row.mag });
  }
  return Object.freeze(out);
}

function worldOffset(host, local) {
  const cos = Math.cos(host.rot || 0), sin = Math.sin(host.rot || 0);
  return {
    x: host.pos.x + local.x * cos - local.z * sin,
    z: host.pos.z + local.x * sin + local.z * cos,
  };
}

function toLocalOffset(host, wx, wz) {
  const dx = wx - host.pos.x, dz = wz - host.pos.z;
  const cos = Math.cos(-(host.rot || 0)), sin = Math.sin(-(host.rot || 0));
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

function normalizeAngle(angle) {
  const tau = Math.PI * 2;
  let value = Number.isFinite(angle) ? angle : 0;
  value = ((value + Math.PI) % tau + tau) % tau - Math.PI;
  return value;
}

function activeCharges(state, ownerId) {
  const out = [];
  for (const e of state.entityList) {
    if (!e.alive || e.type !== 'charge') continue;
    const d = e.data;
    if (!d || d.ownerId !== ownerId) continue;
    out.push(e);
  }
  out.sort((a, b) => (a.data.spawnedAt || 0) - (b.data.spawnedAt || 0));
  return out;
}

/** Maximum simultaneously deployed charges for the active player fit.
 *
 * The unfitted launcher keeps the authored four-charge limit. A fitted rack replaces that
 * limit with its declared capacity (currently eight); inventory modules and fittings on parked
 * hulls do not change the flown ship. This is intentionally a deployment limit, not free ammo:
 * every throw still consumes one cargo charge through cargo's writer above.
 */
export function resolveImpulseChargeCapacity(state) {
  const base = Math.max(1, Math.floor(Number(chargeDef('charge_standard').maxActive) || 1));
  const player = state && state.player;
  const activeShipIndex = Number.isInteger(player && player.activeShipIndex)
    ? player.activeShipIndex : 0;
  const owned = player && Array.isArray(player.ownedShips)
    ? player.ownedShips[activeShipIndex] : null;
  const fittings = owned && Array.isArray(owned.fittings) ? owned.fittings : [];
  let capacity = base;
  for (const id of fittings) {
    const declared = Number(MODULE_BY_ID.get(id)?.mods?.impulseChargeCapacity);
    if (Number.isFinite(declared)) capacity = Math.max(capacity, Math.floor(declared));
  }
  return capacity;
}

/** True only for a researched, fitted vector rack. The original charge rack/system stays live. */
export function bombPropulsionAvailable(state) {
  if (!massline2Flag('bombPropulsion')) return false;
  const p = state && state.player;
  const ship = p && Array.isArray(p.ownedShips) ? p.ownedShips[p.activeShipIndex] : null;
  const fittings = ship && Array.isArray(ship.fittings) ? ship.fittings : [];
  const researched = new Set(p && p.researchedNodes || []);
  return fittings.some((id) => {
    const def = MODULE_BY_ID.get(id);
    return !!(def && def.mods && def.mods.bombPropulsion
      && (!def.requiresTech || researched.has(def.requiresTech)));
  });
}

function stickCandidatesNear(state, pos, radius, out) {
  return queryNearbyEntities(state, pos, radius, out, state.entityList);
}

export const impulseCharges = {
  name: 'impulseCharges',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._stickScratch = [];
    this._blastScratch = [];
    this._resetChainState();
    if (this.bus && typeof this.bus.on === 'function') {
      this._chainUnsubs = [
        // COLLECT in the handler, ACT in update(). A detonation queues impulses and damage; doing
        // that from inside another system's tick would put a blast in the middle of the physics
        // owner's own contact pass.
        this.bus.on('physics:impact', (p) => this._onPhysicsImpact(p)),
        this.bus.on('well:grind', (p) => this._onWellGrind(p)),
        this.bus.on('game:new', () => this._resetChainState()),
        this.bus.on('save:loaded', () => this._resetChainState()),
        this.bus.on('sector:exit', () => this._resetChainState()),
      ];
    }
  },

  destroy() {
    for (const off of this._chainUnsubs || []) { if (typeof off === 'function') off(); }
    this._chainUnsubs = [];
    this._resetChainState();
  },

  newGame() {
    this._resetChainState();
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    // The chain is not the player's verb — it is what the room does to itself once the player has
    // acted — so it ticks before (and independently of) the throw/detonate verbs below.
    this._tickChain(state);

    const player = state.entities.get(state.playerId);
    if (!player || !player.alive) return;

    const rt = ensurePlayerRuntime(player);
    if (rt.throwCdT > 0) rt.throwCdT = Math.max(0, rt.throwCdT - dt);

    this._tickCharges(dt, state);
    this._handleThrow(player, rt, state);
    this._handleDetonate(player, state);
  },

  // ── PQ-137.09: primed state (single writer) ────────────────────────────────────────────────

  _resetChainState() {
    this._primed = new WeakMap();
    this._primedBodies = new Set();
    this._pendingSlams = [];
    this._pendingGrinds = [];
    this._slamScratch = [];
  },

  /** Read-only view of a hull's primed state, for the HUD, the bench and tests. */
  primeState(entity) {
    if (!entity || !this._primed) return null;
    const rec = this._primed.get(entity);
    return rec
      ? Object.freeze({ until: rec.until, byId: rec.byId, reason: rec.reason, link: rec.link, primedTick: rec.primedTick })
      : null;
  },

  /** True while `entity` would cook off on its next slam. */
  isPrimed(entity, state = this.state) {
    const rec = this._primed && this._primed.get(entity);
    if (!rec) return false;
    return simNow(state) < rec.until;
  },

  /**
   * WHAT COUNTS AS A SLAM, and why it is the PRE-SOLVE CLOSING SPEED and not the consequence
   * receipt's per-tick deltaV.
   *
   * The threshold is the one the game already uses to take a helm: COLLISION_CONSEQUENCE_LIMITS
   * .tumbleDeltaV. The INPUT is the speed the two bodies were closing at before the solver
   * answered, exactly as PQ-137.06 established for terrain damage — "the solver bound stays a
   * rate limit and never the damage input".
   *
   * MEASURED, 2026-09-05, seed 4242: a wasp shoved into another wasp at 57.5 WU/s produces a
   * contact the soft solver spreads across twelve ticks (impulse 173 -> 107 -> 67 -> 42 -> ...),
   * so the consequence receipt's first-tick deltaV is 10.8 and the pair cooldown suppresses the
   * rest. Reading that number, a 57.5 WU/s slam is a scrape and nothing ever goes off. The
   * pre-solve closing speed on the same contact reads 57.5 — the speed a player watched the ship
   * arrive at.
   */
  _onPhysicsImpact(payload) {
    if (!payload || payload.aId == null || payload.bId == null) return;
    const closing = Number.isFinite(payload.preSolveClosingSpeed)
      ? Math.max(0, payload.preSolveClosingSpeed)
      : 0;
    if (!(closing >= COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV)) return;
    const tick = Number.isFinite(payload.tick) ? payload.tick : 0;
    this._queueSlam(payload.aId, payload.bId, closing, tick);
    this._queueSlam(payload.bId, payload.aId, closing, tick);
  },

  _queueSlam(targetId, otherId, closing, tick) {
    const pending = this._pendingSlams;
    if (!pending) return;
    for (let i = 0; i < pending.length; i++) {
      // One entry per hull per drain: the same contact is republished every tick it persists, and
      // the hardest reading of it is the one that describes the arrival.
      if (pending[i].targetId !== targetId) continue;
      if (closing > pending[i].deltaV) { pending[i].deltaV = closing; pending[i].otherId = otherId; }
      return;
    }
    if (pending.length >= CHAIN_REACTION.maxSlamsPerTick) return;
    pending.push({ targetId, otherId, deltaV: closing, surface: null, tick });
  },

  _onWellGrind(payload) {
    if (!payload || !this._pendingGrinds) return;
    if (this._pendingGrinds.length >= CHAIN_REACTION.maxSlamsPerTick) return;
    this._pendingGrinds.push({
      aId: payload.aId,
      bId: payload.bId,
      fieldId: payload.fieldId == null ? null : payload.fieldId,
    });
  },

  _tickChain(state) {
    this._expirePrimes(state);
    this._resolveGrinds(state);
    this._resolveSlams(state);
  },

  _expirePrimes(state) {
    if (!this._primedBodies || this._primedBodies.size === 0) return;
    const now = simNow(state);
    let expired = null;
    for (const entity of this._primedBodies) {
      const rec = this._primed.get(entity);
      if (!rec) { (expired || (expired = [])).push([entity, 'lost']); continue; }
      if (entity.alive === false) { (expired || (expired = [])).push([entity, 'destroyed']); continue; }
      if (now >= rec.until) (expired || (expired = [])).push([entity, 'expired']);
    }
    if (!expired) return;
    for (const [entity, reason] of expired) this._clearPrime(entity, reason);
  },

  _resolveGrinds(state) {
    const pending = this._pendingGrinds;
    if (!pending || pending.length === 0) return;
    for (let i = 0; i < pending.length; i++) {
      const grind = pending[i];
      const a = state.entities.get(grind.aId);
      const b = state.entities.get(grind.bId);
      // Both ends, because a grind is a thing two hulls do to each other. `_prime` refuses the
      // player and anything that is not craft, so this cannot cook the player's hull.
      this._prime(a, state, { byId: grind.bId, reason: 'well_grind' });
      this._prime(b, state, { byId: grind.aId, reason: 'well_grind' });
    }
    pending.length = 0;
  },

  _resolveSlams(state) {
    const pending = this._pendingSlams;
    if (!pending || pending.length === 0) return;
    // Drain into scratch first: a detonation below routes damage, which can kill, which can emit
    // further receipts. Those belong to the NEXT tick's queue, not to the list being walked.
    const slams = this._slamScratch;
    slams.length = 0;
    for (let i = 0; i < pending.length; i++) slams.push(pending[i]);
    pending.length = 0;

    const now = simNow(state);
    for (let i = 0; i < slams.length; i++) {
      const slam = slams[i];
      const victim = state.entities.get(slam.targetId);
      if (!victim || victim.alive === false) continue;
      if (victim.id === state.playerId) continue;
      if (victim.type !== 'ship' && victim.type !== 'drone') continue;

      const charge = this._armedChargeOn(state, victim.id);
      if (charge) {
        this.bus.emit('chain:slam', {
          schemaVersion: 1,
          victimId: victim.id,
          otherId: slam.otherId == null ? null : slam.otherId,
          deltaV: slam.deltaV,
          surface: slam.surface || null,
          kind: 'charge',
          tick: state.tick | 0,
        });
        this._detonateOne(charge, charge.data, charge.data.ownerId, state, 'slam');
        continue;
      }

      const rec = this._primed.get(victim);
      if (!rec || now >= rec.until) continue;
      // A prime must PREDATE the slam that sets it off. Both ends of one contact are queued
      // together, so without this a hull cooked by the blast that just went off next to it would
      // cook off in the same drain, off the same contact — one slam producing two detonations and
      // a chain that skips a beat. A link is a slam, and a slam is a tick.
      if (!(rec.primedTick < (state.tick | 0))) continue;
      this.bus.emit('chain:slam', {
        schemaVersion: 1,
        victimId: victim.id,
        otherId: slam.otherId == null ? null : slam.otherId,
        deltaV: slam.deltaV,
        surface: slam.surface || null,
        kind: 'sympathetic',
        tick: state.tick | 0,
      });
      this._clearPrime(victim, 'detonated');
      this._sympatheticDetonation(victim, rec, state);
    }
    slams.length = 0;
  },

  /** The armed plate stuck to `hostId`, or null. Bounded by the deployment cap (<= 8 charges). */
  _armedChargeOn(state, hostId) {
    for (const e of state.entityList) {
      if (!e.alive || e.type !== 'charge') continue;
      const d = e.data;
      if (!d || !d.armed || d.hostId !== hostId) continue;
      return e;
    }
    return null;
  },

  _prime(entity, state, { byId = null, reason = 'blast', deltaV = 0, durationS = 0, link = 1 } = {}) {
    if (!entity || entity.alive === false) return false;
    // The player is never a bomb. B13: "the player is never knocked around" — and never cooked.
    if (entity.id === state.playerId) return false;
    if (entity.type !== 'ship' && entity.type !== 'drone') return false;
    const existing = this._primed.get(entity);
    if (!existing && this._primedBodies.size >= CHAIN_REACTION.maxPrimedBodies) return false;
    // Tick-quantized so a prime never straddles a frame and two replays of a seed agree exactly.
    const windowS = Math.max(1, Math.round(CHAIN_REACTION.primeWindowS * 60)) / 60;
    const until = simNow(state) + windowS;
    if (existing) {
      if (until > existing.until) existing.until = until;
      return false; // already cooked; extending is not a second consequence
    }
    this._primed.set(entity, {
      until, byId, reason,
      link: Math.max(1, Math.trunc(link) || 1),
      primedTick: state.tick | 0,
    });
    this._primedBodies.add(entity);
    this.bus.emit('chain:primed', {
      schemaVersion: 1,
      victimId: entity.id,
      byId,
      reason,
      deltaV,
      durationS,
      until,
      windowS,
      link: Math.max(1, Math.trunc(link) || 1),
      tick: state.tick | 0,
    });
    // NO PRESENTATION CUE HERE, deliberately. PQ-137's non-goals: "No VFX/audio (that is PQ-139)".
    // `chain:primed` above is the receipt the impact layer consumes when it gets its own leaf; a
    // cue published from here paints a generic ring, which the impulse-cone grammar forbids
    // (test/vfx-impulse-cone.test.mjs: "declared families stay cone/sheet/ribbon, not rings").
    return true;
  },

  _clearPrime(entity, reason) {
    if (!entity) return;
    this._primed.delete(entity);
    this._primedBodies.delete(entity);
    this.bus.emit('chain:primeEnded', {
      schemaVersion: 1,
      victimId: entity.id,
      reason,
      tick: this.state ? (this.state.tick | 0) : 0,
    });
  },

  /**
   * A primed hull with no plate left cooks off: its own drive and ordnance answer the slam at
   * CHAIN_REACTION.sympatheticYield of a plate, raised to the link depth. Decaying yield is what
   * makes a chain FINITE without a clamp anywhere — three links is a spectacle, thirty is a bug —
   * and CHAIN_REACTION.maxLinks is the hard stop. Nothing here scripts a death: the cook-off is a
   * blast, and whether the hull survives is decided by the damage it and the slam did.
   */
  _sympatheticDetonation(entity, rec, state) {
    const link = Math.max(1, Math.trunc(Number(rec && rec.link) || 1));
    if (link > CHAIN_REACTION.maxLinks) return null;
    const def = chargeDef('charge_standard');
    const yieldSpec = CHAIN_REACTION.sympatheticYield;
    const decay = Math.pow(yieldSpec.impulse, link);
    const damageDecay = Math.pow(yieldSpec.damage, link);
    const radius = def.radius * yieldSpec.radius;
    const pos = { x: entity.pos.x, z: entity.pos.z };
    const ownerId = rec && rec.byId != null ? rec.byId : entity.id;
    const result = this._blastVictims(state, {
      pos,
      ownerId,
      radius,
      impulse: def.impulse * decay,
      damage: def.damage * damageDecay,
      chargeId: null,
      excludeId: entity.id,
      sourceId: entity.id,
      trigger: 'sympathetic',
      link: link + 1,
    });
    this.bus.emit('chain:detonated', {
      schemaVersion: 1,
      sourceId: entity.id,
      byId: ownerId,
      pos,
      hits: result.hits,
      radius,
      link,
      trigger: 'sympathetic',
      tick: state.tick | 0,
    });
    // The same presentation receipt a plate publishes, so a cook-off is never an invisible event.
    this.bus.emit('charge:detonated', {
      pos,
      hits: result.hits,
      radius,
      shoves: result.shoves,
      trigger: 'sympathetic',
      hostId: entity.id,
    });
    this.bus.emit('audio:cue', { id: 'sfx_explosion_small', position: pos, gain: 0.65 });
    return result;
  },

  _tickCharges(dt, state) {
    for (const e of state.entityList) {
      if (!e.alive || e.type !== 'charge') continue;
      const d = e.data;
      if (!d) continue;

      if (d.hostId != null) {
        const host = state.entities.get(d.hostId);
        if (!host || !host.alive) {
          e.alive = false;
          continue;
        }
        const w = worldOffset(host, d.localOffset || { x: 0, z: 0 });
        e.pos.x = w.x;
        e.pos.z = w.z;
        e.vel.x = host.vel.x;
        e.vel.z = host.vel.z;
        if (!Number.isFinite(d.localRot)) {
          // Backward-compatible recovery for charges restored from saves written before sticky pose
          // tracked orientation. Preserve the visible pose on the first tick, then follow the host.
          d.localRot = normalizeAngle((e.rot || 0) - (host.rot || 0));
        }
        e.rot = normalizeAngle((host.rot || 0) + d.localRot);
        d.armed = true;
        continue;
      }

      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;
      this._tryStick(e, d, state);
    }
  },

  _tryStick(charge, d, state) {
    const def = chargeDef(d.chargeId);
    const r = def.stickRadius;
    const candidates = stickCandidatesNear(state, charge.pos, r + (charge.radius || 1), this._stickScratch);
    let best = null, bestDist = Infinity;
    for (const host of candidates) {
      if (!host.alive || host.id === charge.id) continue;
      if (!STICK_TYPES.has(host.type)) continue;
      const dx = charge.pos.x - host.pos.x, dz = charge.pos.z - host.pos.z;
      // Nose-launched charges spawn on the owner's hull — brief owner-stick lockout so the lob
      // clears the thrower; rear-plate self-stick still works once the charge returns aft.
      if (host.id === d.ownerId && state.simTime - (d.spawnedAt || 0) < 0.35) continue;
      const surface = (host.radius || 6) + (charge.radius || 1);
      const dist = Math.hypot(dx, dz);
      if (dist > surface + r) continue;
      if (dist < bestDist) { bestDist = dist; best = host; }
    }
    if (!best) return;

    d.hostId = best.id;
    d.localOffset = toLocalOffset(best, charge.pos.x, charge.pos.z);
    d.localRot = normalizeAngle((charge.rot || 0) - (best.rot || 0));
    d.armed = true;
    charge.vel.x = best.vel.x;
    charge.vel.z = best.vel.z;
    const w = worldOffset(best, d.localOffset);
    charge.pos.x = w.x;
    charge.pos.z = w.z;
    this.bus.emit('charge:stuck', { chargeId: charge.id, hostId: best.id, pos: { x: w.x, z: w.z } });
  },

  _handleThrow(player, rt, state) {
    const actions = state.input && state.input.actions;
    if (!actions?.chargeThrow) return;
    actions.chargeThrow = false;

    if (rt.throwCdT > 0) return;
    if (player.flags && player.flags.docked) return;
    if (state.ui && state.ui.screenStack && state.ui.screenStack.length > 0) return;

    const def = chargeDef('charge_standard');
    const consumed = removeCargo(state, CHARGE_COMMODITY, 1);
    if (consumed <= 0) {
      this.bus.emit('toast', { text: 'No impulse charges in cargo', kind: 'error', ttl: 2 });
      return;
    }

    const aftDrop = bombPropulsionAvailable(state)
      && !!(actions.brake || state.input.brake || Number(state.input.moveZ) < -0.5);
    const dir = aftDrop ? (player.rot || 0) + Math.PI : aimDir(player, state);
    const cf = Math.cos(dir), sf = Math.sin(dir);
    const noseR = player.radius || 6;
    const spawnDistance = aftDrop
      ? Math.max(
        BOMB_PROPULSION_DIALS.minStandoff,
        noseR + Math.min(
          noseR * (BOMB_PROPULSION_DIALS.standoffRadii - 1),
          def.radius * BOMB_PROPULSION_DIALS.maxSurfaceGapRadiusFrac,
        ),
      )
      : noseR;
    const throwSpeed = aftDrop ? BOMB_PROPULSION_DIALS.relativeDropSpeed : def.throwSpeed;

    const active = activeCharges(state, player.id);
    const capacity = resolveImpulseChargeCapacity(state);
    while (active.length >= capacity) {
      const oldest = active.shift();
      if (oldest) oldest.alive = false;
    }

    const charge = this.helpers.spawnEntity({
      type: 'charge',
      pos: { x: player.pos.x + cf * spawnDistance, z: player.pos.z + sf * spawnDistance },
      vel: {
        x: cf * throwSpeed + player.vel.x,
        z: sf * throwSpeed + player.vel.z,
      },
      rot: dir,
      radius: 1.2,
      mass: 0.5,
      collides: false,
      team: player.team,
      ownerId: player.id,
      data: {
        kind: 'impulse_charge',
        chargeId: 'charge_standard',
        ownerId: player.id,
        hostId: null,
        localOffset: null,
        localRot: null,
        armed: aftDrop,
        aftDrop,
        propulsionImpulseMult: aftDrop ? BOMB_PROPULSION_DIALS.selfImpulseMult : 1,
        spawnedAt: state.simTime,
        spawnPos: { x: player.pos.x + cf * spawnDistance, z: player.pos.z + sf * spawnDistance },
      },
    });

    rt.throwCdT = def.armTimeS;
    this.bus.emit('charge:thrown', { chargeId: charge.id, ownerId: player.id, pos: { x: charge.pos.x, z: charge.pos.z } });
    if (aftDrop) {
      const root = state.massline2 || (state.massline2 = {});
      root.bombPropulsion = { lastDropTick: state.tick, chargeId: charge.id, standoff: spawnDistance };
      this.bus.emit('charge:aftDropped', {
        chargeId: charge.id, ownerId: player.id, pos: { x: charge.pos.x, z: charge.pos.z },
        standoff: spawnDistance,
      });
      this.bus.emit('audio:cue', { id: 'massline.bombDrop', position: { x: charge.pos.x, z: charge.pos.z } });
    }
  },

  _handleDetonate(player, state) {
    const actions = state.input && state.input.actions;
    if (!actions?.chargeDetonate) return;
    actions.chargeDetonate = false;

    let detonated = 0;
    for (const charge of state.entityList) {
      if (!charge.alive || charge.type !== 'charge') continue;
      const d = charge.data;
      if (!d || !d.armed) continue;
      this._detonateOne(charge, d, player.id, state);
      detonated += 1;
    }

    // Rung 16 — tailPop: cut + detonate on the same tick while tethered is the escape move. We
    // only READ actions.tetherCut (tetherGameplay runs after us in UPDATE_ORDER and performs the
    // actual cut from the same press); the burst is a backward player impulse along the line,
    // away from the anchor, through the physics authority like every other impulse here.
    if (detonated > 0 && actions.tetherCut) {
      const tether = state.player && state.player.tether;
      if (tether && tether.active && tether.targetId != null) {
        const anchor = state.entities.get(tether.targetId);
        let dirX, dirZ;
        if (anchor && anchor.pos) {
          const dx = player.pos.x - anchor.pos.x, dz = player.pos.z - anchor.pos.z;
          const len = Math.hypot(dx, dz);
          if (len > 1e-4) { dirX = dx / len; dirZ = dz / len; }
        }
        if (dirX == null) { // anchor gone this tick: burst straight astern instead
          dirX = -Math.cos(player.rot || 0);
          dirZ = -Math.sin(player.rot || 0);
        }
        const magnitude = MASSLINE_COMBOS.tailPop.impulse;
        this._applyBlastImpulse(player, dirX * magnitude, dirZ * magnitude, state);
        this.bus.emit('charge:combo', {
          combo: 'tailPop',
          ownerId: player.id,
          targetId: tether.targetId,
          impulse: magnitude,
        });
      }
    }
  },

  // Rung 16 — per-charge combo detection at detonation time. Reads the massline mirrors
  // observer-style (state.player.tether from tetherGameplay, state.player.masslineTelemetry from
  // masslineTelemetry) — never mutates them. Player charges only: the massline is the player's.
  // anchorKick outranks slingBomb for the same charge (the channeled kick IS the amplified form).
  _detectCombo(d, ownerId, state) {
    if (ownerId !== state.playerId) return null;
    const playerState = state.player;
    const tether = playerState && playerState.tether;
    if (tether && tether.active && tether.targetId != null && d.hostId === tether.targetId) {
      return { combo: 'anchorKick', anchorId: tether.targetId, def: MASSLINE_COMBOS.anchorKick };
    }
    const telemetry = playerState && playerState.masslineTelemetry;
    if (telemetry && telemetry.active
      && Math.abs(telemetry.tangentialSpeed) >= MASSLINE_COMBOS.slingBomb.minTangentialSpeed) {
      return { combo: 'slingBomb', anchorId: null, def: MASSLINE_COMBOS.slingBomb };
    }
    return null;
  },

  _detonateOne(charge, d, ownerId, state, trigger = 'manual') {
    const def = chargeDef(d.chargeId);
    const pos = { x: charge.pos.x, z: charge.pos.z };

    // Rung 16 — massline combo for THIS charge. slingBomb amplifies the whole blast; anchorKick
    // channels the anchor's share of it along the tether line instead of the radial direction.
    const combo = this._detectCombo(d, ownerId, state);
    const result = this._blastVictims(state, {
      pos,
      ownerId,
      radius: def.radius,
      impulse: def.impulse,
      damage: def.damage,
      impulseMult: combo && combo.combo === 'slingBomb' ? combo.def.impulseMult : 1,
      damageMult: combo && combo.combo === 'slingBomb' ? combo.def.damageMult : 1,
      chargeId: d.chargeId,
      excludeId: charge.id,
      originId: charge.id,
      // The plate's host hull is the body that "carried" the bomb: it is the attacker the one
      // hitstun law weighs against each victim's mass, and it is never primed by its own plate.
      sourceId: d.hostId != null ? d.hostId : null,
      aftDrop: !!d.aftDrop,
      propulsionImpulseMult: d.propulsionImpulseMult,
      combo,
      trigger,
      link: 1,
    });

    charge.alive = false;
    if (combo) {
      this.bus.emit('charge:combo', {
        combo: combo.combo,
        chargeId: charge.id,
        ownerId,
        anchorId: combo.anchorId,
        pos,
      });
    }
    this.bus.emit('charge:detonated', {
      pos,
      hits: result.hits,
      radius: def.radius,
      shoves: result.shoves,
      trigger,
      hostId: d.hostId != null ? d.hostId : null,
    });
    this.bus.emit('audio:cue', { id: 'sfx_explosion_small', position: pos, gain: 0.65 });
  },

  /**
   * ONE blast body. A thrown plate, a slam-triggered plate and a hull cooking off all shove and
   * hurt through this single loop, so a chain link is the same physics as the verb that started
   * it — never a second blast implementation with its own falloff.
   *
   * PQ-137.09 adds two things the plate always should have had:
   *   • the fling is published to the ONE hitstun law (`publishHitstunImpulse`), so a mine that
   *     throws a hull takes its helm exactly as a gun, a rope throw or a rock does (B11). It was
   *     the only impulse source in the game that never published one.
   *   • whatever the blast knocks past that law's stun threshold is PRIMED — judged by
   *     `resolveHitstunLaw`, the same pure function tumbleStates evaluates, so "past the stun
   *     threshold" cannot drift into meaning something else here.
   */
  _blastVictims(state, opts) {
    const pos = opts.pos;
    const ownerId = opts.ownerId;
    const radius = Math.max(0, Number(opts.radius) || 0);
    const impulse = Math.max(0, Number(opts.impulse) || 0);
    const damage = Math.max(0, Number(opts.damage) || 0);
    const impulseMult = Number.isFinite(opts.impulseMult) ? opts.impulseMult : 1;
    const damageMult = Number.isFinite(opts.damageMult) ? opts.damageMult : 1;
    const combo = opts.combo || null;
    const link = Math.max(1, Math.trunc(Number(opts.link) || 1));
    const player = state.entities.get(state.playerId);
    const sourceEntity = opts.sourceId != null && state.entities && state.entities.get
      ? state.entities.get(opts.sourceId)
      : null;
    const attackerMass = massOf(sourceEntity, massOf(player, 1));
    const hits = [];
    const shoves = [];

    // Aft plates are outside the owner's hull. Spatial hashes index centers, so enlarge this one
    // query by the owner radius and use surface distance for the owner below. Other blast victims
    // retain the established center-distance falloff and therefore cannot gain accidental range.
    const blastQueryRadius = radius + (opts.aftDrop && player ? (player.radius || 0) : 0);
    const candidates = stickCandidatesNear(state, pos, blastQueryRadius, this._blastScratch);
    for (const ent of candidates) {
      if (!ent.alive) continue;
      if (opts.excludeId != null && ent.id === opts.excludeId) continue;
      const dx = ent.pos.x - pos.x, dz = ent.pos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const propulsionOwner = !!(opts.aftDrop && ent.id === ownerId);
      const falloffDist = propulsionOwner ? Math.max(0, dist - (ent.radius || 0)) : dist;
      if (falloffDist > radius) continue;

      const falloff = linearFalloff(falloffDist, radius);
      if (falloff <= 0) continue;

      let dirX = 0, dirZ = 1;
      if (dist > 1e-4) {
        dirX = dx / dist;
        dirZ = dz / dist;
      }
      let magnitude = impulse * falloff * impulseMult;
      if (propulsionOwner) {
        magnitude *= Math.max(1, Number(opts.propulsionImpulseMult) || 1);
      }
      // anchorKick: the line channels the anchor's blast share — direction becomes the tether
      // line (player → anchor), amplified. Everything else in the radius still gets the radial.
      if (combo && combo.combo === 'anchorKick' && ent.id === combo.anchorId && player && player.pos) {
        const lx = ent.pos.x - player.pos.x, lz = ent.pos.z - player.pos.z;
        const len = Math.hypot(lx, lz);
        if (len > 1e-4) {
          dirX = lx / len;
          dirZ = lz / len;
          magnitude = impulse * falloff * combo.def.impulseMult;
        }
      }
      // Rung 15: the blast is an impulse REQUEST to the physics authority, applied at the center
      // of mass. Magnitude impulse × falloff is the old per-entity Δv × mass — same physics,
      // different owner of the mutation. A rejected request (no rigid body / no port) is skipped,
      // never forced with a direct vel write.
      this._applyBlastImpulse(ent, dirX * magnitude, dirZ * magnitude, state);
      hits.push(ent.id);
      considerImpulseShove(shoves, ent.id, dirX, dirZ, magnitude);
      this._publishBlastHitstun(state, ent, {
        dirX, dirZ, magnitude, ownerId, attackerMass, chargeId: opts.chargeId,
        sourceId: opts.sourceId, trigger: opts.trigger, link,
      });

      if (BLAST_DAMAGE_TYPES.has(ent.type) && damage > 0) {
        const packet = scalarHitToDamagePacket({
          damage: damage * falloff * damageMult,
          damageType: 'explosive',
          pos,
          source: { kind: 'impulse_charge', chargeId: opts.chargeId },
        });
        packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
        this._routeDamage({
          attackerId: ownerId,
          targetId: ent.id,
          packet,
          origin: { kind: 'impulse_charge', id: opts.originId != null ? opts.originId : opts.sourceId },
        });
      }
    }

    return { hits, shoves: freezeImpulseShoves(shoves) };
  },

  /**
   * The blast's fling, handed to the one hitstun law — and the prime decision, which IS that law's
   * verdict. `resolveHitstunLaw(...).durationS > 0` is exactly the test tumbleStates applies
   * before it takes a helm, so "primes what it knocks past the stun threshold" is not a number
   * this file owns.
   */
  _publishBlastHitstun(state, victim, input) {
    if (!victim || victim.alive === false) return false;
    if (victim.type !== 'ship' && victim.type !== 'drone') return false;
    // The player is never stunned and never cooked; publishing for them would be noise (B13).
    if (victim.id === state.playerId) return false;
    const victimMass = massOf(victim, 1);
    const deltaV = input.magnitude / victimMass;
    if (!(deltaV > 0)) return false;
    const attackerMass = Math.max(0.1, Number(input.attackerMass) || 1);
    const hitSide = signedHitSide(victim, { x: input.dirX, z: input.dirZ }, {
      pos: {
        x: Number(victim.pos && victim.pos.x) || 0,
        z: (Number(victim.pos && victim.pos.z) || 0) + Math.max(4, (victim.radius || 8) * 0.75),
      },
    }, victim.id);
    const provenance = Object.freeze({
      schemaVersion: 1,
      kind: 'impulse_charge',
      source: input.trigger || 'manual',
      tag: 'impulse_charge_blast',
      chargeId: input.chargeId == null ? null : String(input.chargeId),
    });
    // Attribute the shove on the victim so a hull thrown by a blast into another hull reads as a
    // combat contact, not as "environment" — the same rule weapons.js applies to a gun shove.
    recordImpulseProvenance(victim, {
      actorId: input.ownerId == null ? null : input.ownerId,
      weaponId: input.chargeId == null ? null : input.chargeId,
      tag: 'impulse_charge_blast',
      appliedTick: state.tick | 0,
      magnitude: input.magnitude,
    });
    publishHitstunImpulse(this.bus, {
      source: 'impulse_charge',
      victimId: victim.id,
      attackerId: input.ownerId == null ? null : input.ownerId,
      attackerMass,
      victimMass,
      deltaV,
      dirX: input.dirX,
      dirZ: input.dirZ,
      hitSide,
      provenance,
      tick: state.tick,
    });
    const law = resolveHitstunLaw({
      deltaV,
      victimCruise: resolveGovernedCombatSpeed(victim, state, 0),
      attackerMass,
      victimMass,
    });
    // The hull that CARRIED the plate still eats its own blast (that is the anchorKick), but it is
    // never primed by it — a bomb does not cook the ship it was already stuck to. Past the link
    // ceiling nothing is primed either: a prime that can never answer is a receipt for an event
    // that will not happen.
    if (law.durationS > 0 && victim.id !== input.sourceId && input.link <= CHAIN_REACTION.maxLinks) {
      this._prime(victim, state, {
        byId: input.sourceId != null ? input.sourceId : input.ownerId,
        reason: 'blast',
        deltaV,
        durationS: law.durationS,
        link: input.link,
      });
    }
    return true;
  },

  // Physics-authority impulse (rung 15). Same port + call shape as combat/actions.js:185 and
  // combat/damage.js:201: helpers.combatPhysics.applyImpulse({entityId, impulse, point, reason,
  // tick}). Returns true only if the backend accepted the impulse.
  _applyBlastImpulse(ent, impulseX, impulseZ, state) {
    const physics = this.helpers && this.helpers.combatPhysics;
    if (!physics || typeof physics.applyImpulse !== 'function') return false;
    const accepted = physics.applyImpulse({
      entityId: ent.id,
      impulse: { x: impulseX, z: impulseZ },
      point: null,
      reason: 'impulse_charge',
      tick: state.tick,
    });
    return accepted !== false;
  },

  _routeDamage(request) {
    const helpers = this.helpers;
    if (helpers && typeof helpers.routeCombatDamage === 'function') {
      return helpers.routeCombatDamage(request);
    }
    const combatSys = this.registry && this.registry.get && this.registry.get('combat');
    if (combatSys && typeof combatSys.ensureKernel === 'function') {
      return combatSys.ensureKernel().routeDamage(request);
    }
    this.bus.emit('combat:routeDamage', request);
    return null;
  },
};
