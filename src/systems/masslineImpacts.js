// Massline whip-impact events — read-only observer (massline rung 13).
// Runs immediately AFTER masslineThreats in UPDATE_ORDER: it reads the already-settled
// state.player.tether mirror (tetherGameplay) plus entities, and detects the payoff moment of the
// swing — the tethered (or just-released) MASS whacking into a solid body. It writes ONLY its own
// runtime subtree at state.player.masslineImpacts and emits two documented events:
// `tether:whipImpact` ({ targetId, victimId, relSpeed, massSpeed, mass, momentum, slung, severity,
// rating, tick, time }) and the fitted-head-only `massline:sweepImpact` ({ headId, targetId,
// victimId, transverseSpeed, reducedMass, momentum, pos, severity, rating, tick, time }). It never
// mutates entities, attachments, the tether, or sibling subtrees.
//
// What counts as a whip-impact (thresholds mirror the massline feel bars in masslineTelemetry.js):
//   • the whipped mass is the tether TARGET — either still on the line (latched) or coasting
//     ballistic inside a short post-release window (slung). The player smacking into things is
//     masslineThreats' 'collision-course' domain, not ours.
//   • the mass is doing the hitting: its WORLD speed >= 25 wu/s (the SNAP_CATCH_MIN_SPEED
//     "genuinely moving" bar). A parked tow rammed by a passing ship is not a whip.
//   • the contact is energetic: relative speed mass-vs-victim >= the same 25 wu/s bar.
//   • contact = body overlap (combined radii + a small pad, tolerant of physics keeping solids
//     separated at rest) OR the swept relative path crossing the combined radius within this tick
//     (so a fast crossing can't tunnel between overlap samples).
//   • emitted at most once per victim per run (a run = one latch and its trailing sling window);
//     a new latch re-arms all victims.
// Impact records PERSIST after the run ends (impacts log + latest) — like telemetry.snapCatch,
// they are completed-trick facts that scenario predicates (rung 20 debris-sling proof) and the
// whip feedback/damage consumer (rung 14) read after the fact; each record carries tick/time so
// consumers can window them. Only the log cap trims them.

import { massline2Flag } from '../data/featureFlags.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { isHostileToPlayer } from './scanner.js';

const WHIP_IMPACT_MIN_SPEED = 25;   // wu/s — mirrors SNAP_CATCH_MIN_SPEED ("genuinely moving")
const WHIP_IMPACT_SOLID = 55;       // wu/s relSpeed — rating floor for a 'solid' hit
const WHIP_IMPACT_CRUSHING = 95;    // wu/s relSpeed — 'crushing' floor; also the severity ceiling
const WHIP_SLING_WINDOW_S = 6;      // s — a released mass stays "the player's whip" this long
const WHIP_CONTACT_PAD = 0.5;       // wu — overlap tolerance (physics rests solids at ~touching)
const WHIP_VICTIM_TRAVEL_PAD = 32;  // wu — ordinary one-step victim motion covered by the query
const WHIP_LOG_CAP = 12;            // per-session record cap (oldest dropped)
const SWEEP_CONTACT_PAD = 0.75;      // wu — filament width/readability tolerance around hull radius
const SWEEP_ENDPOINT_MARGIN = 0.08;  // line fraction — keep endpoint body hits in whip-impact domain
// The spatial query covers the whole line plus one fixed-step of ordinary ship motion. Bodies that
// cross more than this in one step are supplemented from the already-bounded shipLike index below,
// preserving the swept-contact contract without returning to an all-entity scan.
const SWEEP_VICTIM_TRAVEL_PAD = 32;  // wu — 1,920 wu/s at the production 60 Hz fixed step
const SWEEP_LOG_CAP = 12;

// Solid bodies a whipped mass can meaningfully hit — same set as masslineThreats' collidables.
const COLLIDABLE_TYPES = new Set(['asteroid', 'ship', 'station', 'drone']);
const SWEEP_DAMAGEABLE_TYPES = new Set(['ship', 'drone']);

const FALLBACK = Object.freeze({
  tracking: false,
  slung: false,
  massId: null,
  impacts: Object.freeze([]),
  latest: null,
});

export const masslineImpacts = {
  id: 'masslineImpacts',
  name: 'masslineImpacts',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    // Per-run trackers. System-private, like masslineThreats' throttle state.
    // _latch tracks the mass while it is on the line; _sling tracks the last released mass for a
    // bounded ballistic window. Both carry per-victim throttles; the sling inherits them so a
    // same-mass relatch remains one run rather than re-arming damage during a cut/regrab exploit.
    this._latch = null;   // { massId, warned:Set, sweepWarned:Set }
    this._sling = null;   // { massId, until, warned:Set, sweepWarned:Set }
    this._impactScratch = [];
    this._sweepScratch = [];
    this._sweepQueryCenter = { x: 0, z: 0 };
  },

  update(dt, state) {
    const playerState = state.player || (state.player = {});
    const runtime = ensureImpactsSubtree(playerState);

    if (state.mode !== 'flight') {
      // Out of flight (menu/docked): drop live trackers. Completed records persist (see header).
      this._latch = null;
      this._sling = null;
      mirrorTrackers(runtime, this._latch, this._sling);
      return;
    }

    const now = Number.isFinite(state.simTime) ? state.simTime
      : (Number.isFinite(state.tick) ? state.tick / 60 : null);
    const tether = playerState.tether;
    const latchedId = tether && tether.active && tether.targetId != null ? tether.targetId : null;

    // Latch transitions. tetherGameplay mirrored BEFORE us this tick, so on the release tick the
    // mirror already reads inactive while the freed mass still carries its post-cut velocity —
    // exactly the moment to decide whether it left the line as a genuine sling.
    if (this._latch && this._latch.massId !== latchedId) {
      this._armSling(state, now, this._latch);
      this._latch = null;
    }
    if (latchedId != null && !this._latch) {
      // A relatch onto the mass we are still sling-tracking resumes the same run: the line is back
      // on the same body, so its warned set carries over and the sling slot frees up.
      if (this._sling && this._sling.massId === latchedId) {
        this._latch = {
          massId: latchedId,
          warned: this._sling.warned,
          sweepWarned: this._sling.sweepWarned,
        };
        this._sling = null;
      } else {
        this._latch = { massId: latchedId, warned: new Set(), sweepWarned: new Set() };
      }
    }

    // Sling expiry: window over, or the mass died/vanished.
    if (this._sling) {
      const mass = getEntity(state, this._sling.massId);
      if ((now != null && now > this._sling.until) || !mass || !mass.alive) this._sling = null;
    }

    // Detection passes — the latched mass and a still-flying earlier sling are independent whips.
    if (this._latch) {
      const mass = getEntity(state, this._latch.massId);
      if (mass && mass.alive && mass.pos && mass.vel) {
        this._scanForSweep(runtime, state, dt, now, tether, mass, this._latch.sweepWarned);
        this._scanForImpacts(runtime, state, dt, now, mass, this._latch.warned, false);
      }
    }
    if (this._sling) {
      const mass = getEntity(state, this._sling.massId);
      if (mass && mass.pos && mass.vel) {
        this._scanForImpacts(runtime, state, dt, now, mass, this._sling.warned, true);
      }
    }

    mirrorTrackers(runtime, this._latch, this._sling);
  },

  // A released mass becomes a tracked sling only if it left the line genuinely moving in the
  // world frame — a static drop is not a throw. Window is fixed from the release moment.
  _armSling(state, now, endedLatch) {
    if (now == null) return;
    const mass = getEntity(state, endedLatch.massId);
    if (!mass || !mass.alive || !mass.pos || !mass.vel) return;
    const speed = Math.hypot(finite(mass.vel.x, 0), finite(mass.vel.z, 0));
    if (speed < WHIP_IMPACT_MIN_SPEED) return;
    // Single sling slot: a newer release supersedes an older one still in flight (two live slings
    // inside one 6 s window is a corner we trade away for one tracker's worth of state).
    this._sling = {
      massId: endedLatch.massId,
      until: now + WHIP_SLING_WINDOW_S,
      warned: endedLatch.warned,
      sweepWarned: endedLatch.sweepWarned,
    };
  },

  // PQ-030 Monofilament Sweep. A fitted head does not change the rope force at all; while that
  // ordinary rope is already loaded, its physical segment can cut one hostile ship/drone per latch.
  // The observer reads endpoint/victim motion and emits a receipt. Damage remains a combat-kernel
  // concern in masslineImpactDamage, and no player control or entity state is written here.
  _scanForSweep(runtime, state, dt, now, tether, mass, warned) {
    if (!tether || (tether.phase !== 'loaded' && tether.phase !== 'overload')) return;
    if (!massline2Flag('masslineHeadMonofilamentSweep', state.runtime && state.runtime.features)) return;
    const attachment = activeAttachment(state, tether.attachmentId);
    if (!attachment || attachment.targetId !== mass.id) return;
    if (!attachment.tetherPolicy || attachment.tetherPolicy.headId !== 'monofilament_sweep') return;

    const player = getEntity(state, state.playerId);
    if (!player || !player.alive || !player.pos || !player.vel) return;
    const playerTeam = player.team;
    const source = sweepCandidateSource(state);
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const dx = finite(mass.pos.x, 0) - finite(player.pos.x, 0);
    const dz = finite(mass.pos.z, 0) - finite(player.pos.z, 0);
    const center = this._sweepQueryCenter || (this._sweepQueryCenter = { x: 0, z: 0 });
    center.x = finite(player.pos.x, 0) + dx * 0.5;
    center.z = finite(player.pos.z, 0) + dz * 0.5;
    const endpointTravel = Math.max(bodySpeed(player), bodySpeed(mass)) * step;
    const queryRadius = Math.hypot(dx, dz) * 0.5
      + SWEEP_CONTACT_PAD + endpointTravel + SWEEP_VICTIM_TRAVEL_PAD;
    const candidates = queryNearbyEntities(
      state,
      center,
      queryRadius,
      this._sweepScratch || (this._sweepScratch = []),
      source,
    );

    // SpatialHash contains colliders at their current cells. Preserve the prior swept-line behavior
    // for non-colliding ship-like records and exceptional bodies that can traverse the whole query
    // padding in one fixed step, while scanning only the bounded shipLike index rather than every
    // asteroid, station, projectile, pickup, effect, and world prop.
    if (candidates !== source) {
      for (const e of source) {
        if (!e || (e.collides !== false && bodySpeed(e) * step <= SWEEP_VICTIM_TRAVEL_PAD)) continue;
        appendUniqueCandidate(candidates, e);
      }
    }

    for (const e of candidates) {
      if (!e || !e.alive || !e.pos || !e.vel || !Number.isFinite(e.radius)) continue;
      if (e.id === player.id || e.id === mass.id || warned.has(e.id)) continue;
      if (!SWEEP_DAMAGEABLE_TYPES.has(e.type)) continue;
      if (!isHostileToPlayer(e, playerTeam, state)) continue;

      const contact = lineSweepContact(player, mass, e, dt);
      if (!contact) continue;
      const reducedMass = twoBodyReducedMass(player, mass);
      if (!(reducedMass > 0)) continue;

      warned.add(e.id);
      this._emitSweep(runtime, state, now, mass, e, contact, reducedMass);
    }
  },

  // One entity pass for one whipped mass. The world-speed gate is per-mass (outside the loop);
  // the relative-speed gate and contact test are per-victim.
  _scanForImpacts(runtime, state, dt, now, mass, warned, slung) {
    const massSpeed = Math.hypot(finite(mass.vel.x, 0), finite(mass.vel.z, 0));
    if (massSpeed < WHIP_IMPACT_MIN_SPEED) return;
    const source = impactCandidateSource(state);
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const queryRadius = Math.max(0, finite(mass.radius, 0)) + WHIP_CONTACT_PAD
      + massSpeed * step + WHIP_VICTIM_TRAVEL_PAD;
    const candidates = queryNearbyEntities(
      state,
      mass.pos,
      queryRadius,
      this._impactScratch || (this._impactScratch = []),
      source,
    );

    // A body moving more than the conservative query pad can begin outside the current local
    // footprint and still cross the whipped mass within this step. Preserve that edge case from
    // the previous full scan by supplementing only the existing dynamic-body index.
    if (candidates !== source) {
      for (const e of impactExceptionalSource(state, source)) {
        if (!e || bodySpeed(e) * step <= WHIP_VICTIM_TRAVEL_PAD) continue;
        appendUniqueCandidate(candidates, e);
      }
    }

    for (const e of candidates) {
      if (!e || !e.alive || !e.pos) continue;
      if (e.id === mass.id) continue;
      // Reeling the mass home always ends in player contact — that is the reel, not a whip; and
      // whipping yourself is threats' collision-course read. The player is never a victim here.
      if (e.id === state.playerId) continue;
      if (warned.has(e.id)) continue;
      if (!COLLIDABLE_TYPES.has(e.type) || !Number.isFinite(e.radius)) continue;

      const rvx = finite(mass.vel.x, 0) - finite(e.vel && e.vel.x, 0);
      const rvz = finite(mass.vel.z, 0) - finite(e.vel && e.vel.z, 0);
      const relSpeed = Math.hypot(rvx, rvz);
      if (relSpeed < WHIP_IMPACT_MIN_SPEED) continue;
      if (!inContact(mass, e, rvx, rvz, dt)) continue;

      warned.add(e.id);
      this._emitImpact(runtime, state, now, mass, e, relSpeed, massSpeed, slung);
    }
  },

  // The single documented emit. The record is mirrored at runtime.latest + runtime.impacts (this
  // system's own subtree) and the emitted payload IS the mirrored record (single source of truth,
  // same discipline as telemetry.snapCatch / masslineThreats.latest).
  _emitImpact(runtime, state, now, mass, victim, relSpeed, massSpeed, slung) {
    const tick = Number.isFinite(state.tick) ? state.tick : null;
    const massKg = Math.max(0, finite(mass.mass, 0));
    const rating = relSpeed >= WHIP_IMPACT_CRUSHING ? 'crushing'
      : relSpeed >= WHIP_IMPACT_SOLID ? 'solid'
      : 'glance';
    const record = {
      targetId: mass.id,               // the whipped mass — same field name as snapCatch/reelPump
      victimId: victim.id,
      // Neither end of this event is the player: the cue targets the struck body and sources the
      // whipped mass, so cueSchema.inferRelevance has nothing to key on and falls through to its
      // distance table (0.72/0.52/0.28) — below presentationAdapters' PLAYER_LANE_RELEVANCE_FLOOR
      // of 0.8. The result was that the payoff moment of the whole swing produced sparks and a
      // crack but never a HUD readout, a caption, or a camera kick, and got quieter the further
      // out the player worked. Every record here describes the player's OWN whip (the observer
      // tracks only their tether target and its sling), so state it: 0.88 is inferRelevance's own
      // value for "the player is the source", the same value rateRelease uses for the same reason.
      // Deliberately not 1.0 — that is the "addressed TO the player" tier and it would also cross
      // the 0.9 assertive-caption bar in _applyAccessibility, turning an info-tier reward into a
      // screen-reader interrupt that pre-empts real warnings.
      playerRelevance: 0.88,
      relSpeed,
      massSpeed,
      mass: massKg,
      momentum: massKg * relSpeed,     // the damage-relevant read for the rung-14 consumer
      slung,
      severity: clamp01(relSpeed / WHIP_IMPACT_CRUSHING),
      rating,
      tick,
      time: now,
    };
    runtime.impacts.push(record);
    if (runtime.impacts.length > WHIP_LOG_CAP) runtime.impacts.shift();
    runtime.latest = record;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('tether:whipImpact', record);
    }
  },

  _emitSweep(runtime, state, now, mass, victim, contact, reducedMass) {
    const transverseSpeed = contact.transverseSpeed;
    const rating = transverseSpeed >= WHIP_IMPACT_CRUSHING ? 'crushing'
      : transverseSpeed >= WHIP_IMPACT_SOLID ? 'solid'
      : 'glance';
    const record = {
      headId: 'monofilament_sweep',
      targetId: mass.id,
      victimId: victim.id,
      transverseSpeed,
      reducedMass,
      momentum: reducedMass * transverseSpeed,
      pos: contact.pos,
      severity: clamp01(transverseSpeed / WHIP_IMPACT_CRUSHING),
      rating,
      playerRelevance: 0.88,
      tick: Number.isFinite(state.tick) ? state.tick : null,
      time: now,
    };
    if (!Array.isArray(runtime.sweeps)) runtime.sweeps = [];
    runtime.sweeps.push(record);
    if (runtime.sweeps.length > SWEEP_LOG_CAP) runtime.sweeps.shift();
    runtime.latestSweep = record;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('massline:sweepImpact', record);
    }
  },
};

// Contact this tick: already inside the padded combined radius, OR the relative ballistic path
// crosses the (unpadded) combined radius within dt (swept test — same closest-approach math as
// masslineThreats' timeToImpact, horizon = one tick, so a fast crossing can't tunnel).
function inContact(mass, e, rvx, rvz, dt) {
  const rx = finite(e.pos.x, 0) - finite(mass.pos.x, 0);
  const rz = finite(e.pos.z, 0) - finite(mass.pos.z, 0);
  const R = Math.max(0, finite(e.radius, 0)) + Math.max(0, finite(mass.radius, 0));
  const rr = rx * rx + rz * rz;
  const Rpad = R + WHIP_CONTACT_PAD;
  if (rr <= Rpad * Rpad) return true;
  const ww = rvx * rvx + rvz * rvz;
  if (ww < 1e-9) return false;
  const rw = rx * rvx + rz * rvz;
  if (rw <= 0) return false;                   // moving apart — no crossing this tick
  const disc = rw * rw - ww * (rr - R * R);
  if (disc <= 0) return false;                 // closest approach misses the body
  const t = (rw - Math.sqrt(disc)) / ww;       // first-contact time along the relative path
  return t >= 0 && t <= (Number.isFinite(dt) ? dt : 0);
}

function getEntity(state, id) {
  return state.entities && state.entities.get ? state.entities.get(id) : null;
}

function activeAttachment(state, attachmentId) {
  const byId = state.combat && state.combat.attachments && state.combat.attachments.byId;
  const attachment = attachmentId != null && byId ? byId[attachmentId] : null;
  return attachment && attachment.state === 'active' ? attachment : null;
}

// Test a victim point/body against the moving line during this fixed step. The current segment
// supplies the nearest interior point. Signed perpendicular motion is rewound one dt so a fast
// crossing cannot tunnel from one side of a narrow filament to the other between samples.
function lineSweepContact(owner, target, victim, dt) {
  const ax = finite(owner.pos.x, 0);
  const az = finite(owner.pos.z, 0);
  const dx = finite(target.pos.x, 0) - ax;
  const dz = finite(target.pos.z, 0) - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1e-9) return null;
  const length = Math.sqrt(lengthSq);
  const rx = finite(victim.pos.x, 0) - ax;
  const rz = finite(victim.pos.z, 0) - az;
  const t = (rx * dx + rz * dz) / lengthSq;
  if (t <= SWEEP_ENDPOINT_MARGIN || t >= 1 - SWEEP_ENDPOINT_MARGIN) return null;

  const nx = -dz / length;
  const nz = dx / length;
  const signedDistance = rx * nx + rz * nz;
  const lineVx = finite(owner.vel.x, 0)
    + (finite(target.vel.x, 0) - finite(owner.vel.x, 0)) * t;
  const lineVz = finite(owner.vel.z, 0)
    + (finite(target.vel.z, 0) - finite(owner.vel.z, 0)) * t;
  const signedTransverseSpeed = (finite(victim.vel.x, 0) - lineVx) * nx
    + (finite(victim.vel.z, 0) - lineVz) * nz;
  const transverseSpeed = Math.abs(signedTransverseSpeed);
  if (transverseSpeed < WHIP_IMPACT_MIN_SPEED) return null;

  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const previousSignedDistance = signedDistance - signedTransverseSpeed * step;
  const radius = Math.max(0, finite(victim.radius, 0)) + SWEEP_CONTACT_PAD;
  if (Math.min(signedDistance, previousSignedDistance) > radius
    || Math.max(signedDistance, previousSignedDistance) < -radius) return null;

  return {
    transverseSpeed,
    pos: { x: ax + dx * t, z: az + dz * t },
  };
}

function twoBodyReducedMass(a, b) {
  const am = bodyMass(a);
  const bm = bodyMass(b);
  return am > 0 && bm > 0 ? (am * bm) / (am + bm) : 0;
}

function bodySpeed(entity) {
  return Math.hypot(finite(entity && entity.vel && entity.vel.x, 0), finite(entity && entity.vel && entity.vel.z, 0));
}

function sweepCandidateSource(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready && Array.isArray(index.shipLike)) {
    return index.shipLike;
  }
  if (state && Array.isArray(state.entityList)) return state.entityList;
  if (state && state.entities && typeof state.entities.values === 'function') return state.entities.values();
  return [];
}

function impactCandidateSource(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready && Array.isArray(index.collidables)) {
    return index.collidables;
  }
  if (state && Array.isArray(state.entityList) && state.entityList.length > 0) return state.entityList;
  if (state && state.entities && typeof state.entities.values === 'function') return state.entities.values();
  return [];
}

function impactExceptionalSource(state, fallback) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready && Array.isArray(index.spatialDynamics)) {
    return index.spatialDynamics;
  }
  return fallback;
}

function appendUniqueCandidate(candidates, entity) {
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] === entity || candidates[i] && candidates[i].id === entity.id) return;
  }
  candidates.push(entity);
}

function bodyMass(entity) {
  const direct = finite(entity && entity.mass, 0);
  if (direct > 0) return direct;
  return Math.max(0, finite(entity && entity.data && entity.data.mass, 0));
}

function mirrorTrackers(runtime, latch, sling) {
  runtime.tracking = !!(latch || sling);
  runtime.slung = !latch && !!sling;
  runtime.massId = latch ? latch.massId : (sling ? sling.massId : null);
}

function ensureImpactsSubtree(playerState) {
  if (!playerState.masslineImpacts) playerState.masslineImpacts = freshRuntime();
  return playerState.masslineImpacts;
}

function freshRuntime() {
  return {
    tracking: false,
    slung: false,
    massId: null,
    impacts: [],
    latest: null,
  };
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export { FALLBACK, lineSweepContact };
