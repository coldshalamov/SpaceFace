// Pilot reflexes (§21A combat-variety seam): bounded, deterministic trigger→maneuver reactions
// that sit between doctrine intent and the thruster solver. A reflex is a short-lived impulse —
// sidestep a volley, weave when marked, brake-check an overshoot, pull toward a threatened
// ward — that displaces the desired point/velocity for a handful of ticks and then hands the
// hull back to doctrine. The trigger table itself is data: src/data/reflexLibrary.js holds one
// spec per reflex kind; this file is the interpreter.
//
// Determinism: every draw is hashUnit(seed, entityId, tick-bucket) and every state lives on the
// planner's per-entity runtime record (rebuilt, not serialized — same contract as the rest of
// the planner). No ambient randomness, no wall time.

import { ContactKind, clamp, hashUnit } from './contracts.js';
import { REFLEX_KIND, REFLEX_SPECS, REFLEX_INTENT_EXCLUSIONS } from '../data/reflexLibrary.js';

export { REFLEX_KIND };

const TAU = Math.PI * 2;
const BURST_SPECS = Object.freeze(
  REFLEX_SPECS.filter((spec) => spec.stance !== true).slice().sort((a, b) => a.priority - b.priority));
const STANCE_SPECS = Object.freeze(
  REFLEX_SPECS.filter((spec) => spec.stance === true).slice().sort((a, b) => a.priority - b.priority));

/**
 * Create a reflex evaluator. One engine per planner; per-entity state is kept in the caller's
 * runtime record (passed in) so save/reload semantics match the rest of the planner.
 */
export function createReflexEngine({ seed = 1 } = {}) {
  const s = seed >>> 0;
  return {
    evaluate(ctx) {
      return evaluateReflexes(s, ctx);
    },
  };
}

export function emptyReflexState() {
  return {
    burst: null,            // {kind, startTick, untilTick, side, amp, spec}
    cooldowns: null,        // Map kind -> cooldown-until tick (lazily allocated)
    lastHull: 1,
    seenAllies: null,       // Map friendly contact id -> alive flag (lazily allocated)
    prevMarked: false,
    lossUntilTick: -1,      // grief stays readable for a window — see loss note below
    hitUntilTick: -1,
  };
}

/**
 * Evaluate the trigger table for one ship on one tick.
 * ctx: {entityId, tick, self, contacts, events, target, intent, temperament, reflexState}
 * Returns null or a channel record:
 *   {kind, lateral, speedScale, brake, boost, dropAim, simmer, holdAim,
 *    away, awayFrom:{x,z}, pullTo:{x,z}, pullK, settle}
 * `lateral` is a signed world-frame lateral offset magnitude (the planner applies it
 * perpendicular to the desired direction). `away`/`pullTo` blend the desired point toward
 * break-off / a ward; `settle` is dead-stick drift.
 */
export function evaluateReflexes(seed, ctx) {
  const { entityId, tick, self, contacts, target, intent, temperament, reflexState } = ctx;
  const rs = reflexState;
  // The gate lives inside the engine too: callers who skip reflexAllowedForIntent still
  // never get a jink out of a hull that is already doing an emergency maneuver.
  if (!self || !intent || !reflexAllowedForIntent(intent.kind)) return null;

  // Observation registers update every call, burst or not.
  const hull = Number.isFinite(self.hullFraction) ? self.hullFraction : 1;
  const hullHit = rs.lastHull - hull;
  rs.lastHull = hull;
  const obs = observeFrame(rs, self, contacts, hullHit, ctx);
  obs.targetPos = target && target.pos ? target.pos : null;
  const marked = obs.marked;
  obs.markedLost = rs.prevMarked === true && marked === false;
  rs.prevMarked = marked;

  // Damage and grief are registered here once and stay readable for a window: the
  // transition tick almost always lands inside someone else's live burst, so a
  // one-tick flag would never be observed by the burst arbitration below.
  if (hullHit > 0.015 || damageEventSeen(ctx)) rs.hitUntilTick = tick + 60;
  if (obs.lostRecently) rs.lossUntilTick = tick + 150;
  obs.hitRecently = tick < rs.hitUntilTick;
  obs.lostRecently = tick < rs.lossUntilTick;

  // Burst expiry, then preemption: a strictly higher-priority trigger (a hull going
  // critical, a panic snap) may cut a live burst short; same-or-lower priorities wait
  // for it to end. First-match ordering inside pickBurst keeps the arbitration stable.
  if (rs.burst && tick >= rs.burst.untilTick) rs.burst = null;

  // Burst arbitration: first matching spec (priority order) owns the window.
  if (!rs.burst) {
    const burst = pickBurst(seed, ctx, obs);
    if (burst) rs.burst = burst;
  } else {
    const preempt = pickBurst(seed, ctx, obs, rs.burst.spec.priority);
    if (preempt) rs.burst = preempt;
  }

  // Resolve channels: burst channels first, then every matching stance merges in.
  const out = {
    kind: rs.burst ? rs.burst.kind : null,
    lateral: 0,
    speedScale: 1,
    brake: false,
    boost: false,
    dropAim: false,
    simmer: false,
    holdAim: false,
    away: 0,
    awayFrom: null,
    pullTo: null,
    pullK: 0,
    settle: false,
  };
  let fired = false;
  if (rs.burst) {
    renderResponse(rs.burst.spec, rs.burst, tick - rs.burst.startTick,
      seed, entityId, tick, self, obs, temperament, out);
    fired = true;
  }
  let stanceKind = null;
  for (const spec of STANCE_SPECS) {
    if (!gatesPass(spec, obs, ctx, seed)) continue;
    renderResponse(spec, null, 0, seed, entityId, tick, self, obs, temperament, out);
    if (stanceKind == null) stanceKind = spec.kind;
    fired = true;
  }
  if (!fired) return null;
  if (out.settle) {
    out.brake = true;
    out.speedScale = Math.min(out.speedScale, 0.32);
    out.dropAim = true;
  }
  if (out.holdAim) out.dropAim = false;
  out.kind = out.kind || stanceKind || (out.simmer ? REFLEX_KIND.SIMMER : 'reflex');
  return out;
}

// ── observation: one pass over the sensor contacts builds every situation ──────

function observeFrame(rs, self, contacts, hullHit, ctx) {
  const selfR = Number.isFinite(self.radius) ? self.radius : 16;
  const hX = Math.cos(self.rot || 0), hZ = Math.sin(self.rot || 0);
  const obs = {
    hullHit,
    hitRecently: hullHit > 0.015 || damageEventSeen(ctx),
    incoming: null,            // nearest near-miss projectile {miss, eta, side}
    incomingCount: 0,
    hostileCount: 0,
    nearestHostileDist: Infinity,
    nearestHostilePos: null,
    hostileBehindDist: Infinity,
    hazardDist: Infinity,
    hazardCount: 0,
    tetherLineDist: Infinity,
    allyCount: 0,
    nearestAllyPos: null,
    nearestAllyDist: Infinity,
    marked: false,
    calm: true,
    hostileTargets: null,      // Set of entity ids hostile ships are tracking
    allies: null,              // friendly ship contacts (for threatened-ward check)
    lostRecently: false,
  };
  const lost = trackAllies(rs, self, contacts, ctx.squadMembers);
  obs.lostRecently = lost;
  for (const c of contacts) {
    if (!c || c.alive === false) continue;
    if (c.kind === ContactKind.PROJECTILE) {
      if (c.hostile !== true || !c.pos || !c.vel) continue;
      const hit = incomingTrack(self, selfR, c);
      if (hit) {
        obs.incomingCount += 1;
        if (!obs.incoming || hit.miss < obs.incoming.miss) obs.incoming = hit;
      }
      continue;
    }
    if (c.kind === ContactKind.HAZARD) {
      if (!c.pos) continue;
      obs.hazardCount += 1;
      obs.hazardDist = Math.min(obs.hazardDist, distanceTo(self, c));
      continue;
    }
    if (c.kind === ContactKind.TETHER) {
      if (!c.pos) continue;
      obs.tetherLineDist = Math.min(obs.tetherLineDist, distanceTo(self, c));
      continue;
    }
    if (c.kind !== ContactKind.SHIP || c.id === self.id) continue;
    const friendly = c.hostile !== true
      && c.team != null && self.team != null && c.team === self.team;
    if (friendly) {
      obs.allyCount += 1;
      const d = distanceTo(self, c);
      if (d < obs.nearestAllyDist) {
        obs.nearestAllyDist = d;
        obs.nearestAllyPos = c.pos;
      }
      if (!obs.allies) obs.allies = [];
      obs.allies.push(c);
      continue;
    }
    if (c.hostile !== true) continue;
    obs.hostileCount += 1;
    const d = distanceTo(self, c);
    if (d < obs.nearestHostileDist) {
      obs.nearestHostileDist = d;
      obs.nearestHostilePos = c.pos;
    }
    // Rear hemisphere: a contact whose bearing opposes the hull's nose.
    if (c.pos) {
      const dx = c.pos.x - self.pos.x, dz = c.pos.z - self.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      if ((dx * hX + dz * hZ) / len < -0.4 && d < obs.hostileBehindDist) {
        obs.hostileBehindDist = d;
      }
    }
    if (c.targetId === self.id && d > 160 && d < 900) obs.marked = true;
    if (c.targetId != null) {
      if (!obs.hostileTargets) obs.hostileTargets = new Set();
      obs.hostileTargets.add(c.targetId);
    }
  }
  obs.calm = obs.hostileCount === 0 || obs.nearestHostileDist > 900;
  // Ward threatened: a friendly ship in view is being tracked by a hostile.
  obs.threatenedAllyPos = null;
  if (obs.hostileTargets && obs.allies) {
    let best = Infinity;
    for (const ally of obs.allies) {
      if (!obs.hostileTargets.has(ally.id)) continue;
      const d = distanceTo(self, ally);
      if (d < best) { best = d; obs.threatenedAllyPos = ally.pos; }
    }
  }
  return obs;
}

function incomingTrack(self, selfR, c) {
  const dx = c.pos.x - self.pos.x, dz = c.pos.z - self.pos.z;
  const vx = c.vel.x - (self.vel ? self.vel.x : 0), vz = c.vel.z - (self.vel ? self.vel.z : 0);
  const speed2 = vx * vx + vz * vz;
  if (speed2 < 1) return null;
  const eta = -(dx * vx + dz * vz) / speed2; // seconds to closest approach
  if (eta < 0 || eta > 1.15) return null;
  const miss = Math.hypot(dx + vx * eta, dz + vz * eta);
  if (miss > selfR + 34) return null;
  // Sidestep perpendicular to the projectile's own velocity, away from its pass side.
  const across = dx * (-vz) + dz * vx;
  return { miss, eta, side: across >= 0 ? 1 : -1 };
}

function trackAllies(rs, self, contacts, squadMembers) {
  let lostRecently = false;
  if (!rs.seenAllies) rs.seenAllies = new Map();
  const seen = rs.seenAllies;
  // Frame members are the strongest wingmate signal: a squadmate's roster entry
  // flips alive→false the tick it dies, whether or not the hulk reaches contacts.
  if (squadMembers) {
    for (const mate of squadMembers) {
      if (!mate || mate.id === self.id) continue;
      const was = seen.get(mate.id);
      if (was === true && mate.alive === false) lostRecently = true;
      seen.set(mate.id, mate.alive !== false);
    }
  }
  for (const c of contacts) {
    if (c.kind !== ContactKind.SHIP || c.id === self.id) continue;
    if (c.hostile === true || (c.team == null || self.team == null || c.team !== self.team)) continue;
    const was = seen.get(c.id);
    const alive = c.alive !== false;
    if (was === true && alive === false) lostRecently = true;
    seen.set(c.id, alive);
  }
  // Bound the register: contacts rotate, but a stale entry only delays one loss trigger.
  if (seen.size > 64) {
    for (const key of seen.keys()) { seen.delete(key); if (seen.size <= 64) break; }
  }
  return lostRecently;
}

// ── gates ─────────────────────────────────────────────────────────────────────

function gatesPass(spec, obs, ctx, seed) {
  const { entityId, tick, self, target, intent, temperament } = ctx;
  const g = spec.gates;
  // Temperament bounds — the same situation reads differently per pilot archetype.
  if (g.minWeave != null && temperament.weave < g.minWeave) return false;
  if (g.maxWeave != null && temperament.weave > g.maxWeave) return false;
  if (g.minDash != null && temperament.dash < g.minDash) return false;
  if (g.maxDash != null && temperament.dash > g.maxDash) return false;
  if (g.minVerve != null && temperament.verve < g.minVerve) return false;
  if (g.maxVerve != null && temperament.verve > g.maxVerve) return false;
  if (g.minAim != null && temperament.aim < g.minAim) return false;
  if (g.maxAim != null && temperament.aim > g.maxAim) return false;
  if (g.minPoise != null && temperament.poise < g.minPoise) return false;
  if (g.maxPoise != null && temperament.poise > g.maxPoise) return false;
  // Self state.
  const hull = Number.isFinite(self.hullFraction) ? self.hullFraction : 1;
  if (g.minHull != null && hull < g.minHull) return false;
  if (g.maxHull != null && hull > g.maxHull) return false;
  const energy = Number.isFinite(self.energyFraction) ? self.energyFraction : 1;
  if (g.maxEnergy != null && energy > g.maxEnergy) return false;
  const heat = Number.isFinite(self.heatFraction) ? self.heatFraction : 0;
  if (g.heatAbove != null && heat <= g.heatAbove) return false;
  if (g.heatBelow != null && heat >= g.heatBelow) return false;
  if (g.tetheredOnly === true && self.tethered !== true) return false;
  if (g.tumblingOnly === true && self.tumbling !== true) return false;
  if (g.recoveringOnly === true && self.recovering !== true) return false;
  if (g.disabledOnly === true && self.disabled !== true) return false;
  if (g.ramAuthorizedOnly === true && self.ramAuthorized !== true) return false;
  if (g.capability != null) {
    const caps = self.capabilities;
    if (!caps) return false;
    const want = Array.isArray(g.capability) ? g.capability : [g.capability];
    for (const w of want) if (!caps.includes(w)) return false;
  }
  // Target-relative geometry.
  if (g.minTargetDist != null || g.maxTargetDist != null || g.closingAbove != null
    || g.recedingAbove != null || g.targetDisabled === true || g.targetFaster === true) {
    if (!target || !target.pos) return false;
    const dist = distanceTo(self, target);
    if (g.minTargetDist != null && dist < g.minTargetDist) return false;
    if (g.maxTargetDist != null && dist > g.maxTargetDist) return false;
    if (g.closingAbove != null && closingSpeed(self, target) <= g.closingAbove) return false;
    if (g.recedingAbove != null && recedingSpeed(self, target) <= g.recedingAbove) return false;
    if (g.targetDisabled === true && !(target.disabled === true || target.alive === false)) return false;
    if (g.targetFaster === true) {
      const tv = target.vel ? Math.hypot(target.vel.x, target.vel.z) : 0;
      const sv = self.vel ? Math.hypot(self.vel.x, self.vel.z) : 0;
      if (tv <= sv * 1.15 + 8) return false;
    }
  }
  // Situation observers.
  if (g.incomingAtLeast != null && obs.incomingCount < g.incomingAtLeast) return false;
  if (g.hitRecently === true && !obs.hitRecently) return false;
  if (g.allyLostRecently === true && !obs.lostRecently) return false;
  if (g.markedOnly === true && !obs.marked) return false;
  if (g.unmarkedOnly === true && obs.marked) return false;
  if (g.markedLost === true && !obs.markedLost) return false;
  if (g.hostileCloseWithin != null && obs.nearestHostileDist > g.hostileCloseWithin) return false;
  if (g.hostileBehindWithin != null && obs.hostileBehindDist > g.hostileBehindWithin) return false;
  if (g.hazardWithin != null && obs.hazardDist > g.hazardWithin) return false;
  if (g.hazardsAtLeast != null && obs.hazardCount < g.hazardsAtLeast) return false;
  if (g.maxHazards != null && obs.hazardCount > g.maxHazards) return false;
  if (g.tetherLineWithin != null && obs.tetherLineDist > g.tetherLineWithin) return false;
  if (g.minAllies != null && obs.allyCount < g.minAllies) return false;
  if (g.maxAllies != null && obs.allyCount > g.maxAllies) return false;
  if (g.outnumberedBy != null && obs.hostileCount - obs.allyCount < g.outnumberedBy) return false;
  if (g.wardThreatened === true && !obs.threatenedAllyPos) return false;
  if (g.calm === true && !obs.calm) return false;
  // Whitelists.
  if (g.intents && !g.intents.includes(intent.kind)) return false;
  if (g.activities) {
    const activityKind = self.activity && self.activity.kind;
    if (!activityKind || !g.activities.includes(activityKind)) return false;
  }
  // Seeded draw: deterministic per (pilot, kind, tick bucket).
  if (g.seededChance) {
    const sc = g.seededChance;
    const bucket = Math.floor(tick / Math.max(1, sc.everyTicks || 60));
    const draw = hashUnit(seed, entityId, 'reflex_gate', spec.kind, bucket);
    if (draw >= (temperament[sc.field] || 0) * (sc.scale != null ? sc.scale : 1)) return false;
  }
  return true;
}

// ── burst arbitration ─────────────────────────────────────────────────────────

function pickBurst(seed, ctx, obs, belowPriority = Infinity) {
  const { entityId, tick, self, target, temperament, reflexState: rs } = ctx;
  const cooling = (kind) => rs.cooldowns != null && (rs.cooldowns.get(kind) || 0) > tick;
  const setCooldown = (kind, spec) => {
    if (!rs.cooldowns) rs.cooldowns = new Map();
    rs.cooldowns.set(kind, tick + spec.cooldownTicks);
  };
  for (const spec of BURST_SPECS) {
    if (spec.priority >= belowPriority) break; // table is priority-ordered
    if (spec.cooldownTicks > 0 && cooling(spec.kind)) continue;
    if (!gatesPass(spec, obs, ctx, seed)) continue;
    const resp = spec.response;
    const amp = (resp.amp || 0) + (resp.ampField ? (resp.ampScale || 0) * (temperament[resp.ampField] || 0) : 0);
    setCooldown(spec.kind, spec);
    return {
      kind: spec.kind,
      spec,
      startTick: tick,
      untilTick: tick + spec.windowTicks,
      side: resolveSide(resp.side, seed, entityId, tick, spec, self, obs, target),
      amp,
    };
  }
  return null;
}

// Side resolution: 'incoming' rides the projectile's own pass side; 'seeded' draws
// once per window; threat-relative sides pick the lateral direction that moves the
// hull away from (or toward) the pressure point; 'orbit' alternates each stancePeriod.
function resolveSide(mode, seed, entityId, tick, spec, self, obs, target) {
  if (mode === 'incoming') return obs.incoming ? obs.incoming.side : seededSide(seed, entityId, tick, spec);
  if (mode === 'awayThreat' || mode === 'towardThreat') {
    const threatPos = (target && target.pos) || obs.nearestHostilePos;
    const s = threatPos ? threatSide(self, threatPos) : 0;
    const sign = s === 0 ? seededSide(seed, entityId, tick, spec) : s;
    return mode === 'awayThreat' ? sign : -sign;
  }
  if (mode === 'towardAlly') {
    const allyPos = obs.threatenedAllyPos || obs.nearestAllyPos;
    const s = allyPos ? threatSide(self, allyPos) : 0;
    return s === 0 ? seededSide(seed, entityId, tick, spec) : -s;
  }
  if (mode === 'orbit') {
    const period = Math.max(1, (spec.response && spec.response.stancePeriod) || 90);
    const bucket = Math.floor(tick / period);
    return hashUnit(seed, entityId, 'st_dir', spec.kind, bucket) < 0.5 ? -1 : 1;
  }
  return seededSide(seed, entityId, tick, spec);
}

function seededSide(seed, entityId, tick, spec) {
  return hashUnit(seed, entityId, 'reflex_side', spec ? spec.kind : 'x', Math.floor(tick / 24)) < 0.5 ? -1 : 1;
}

// Which side of the desired track the world point sits on, in hull frame:
// +1/-1 picks the lateral that moves toward that point's side.
function threatSide(self, pos) {
  const dx = pos.x - self.pos.x, dz = pos.z - self.pos.z;
  const hX = Math.cos(self.rot || 0), hZ = Math.sin(self.rot || 0);
  const cross = hX * dz - hZ * dx; // signed: which side of the nose the point is on
  return cross >= 0 ? 1 : -1;
}

// ── response rendering: a spec's channels for this tick ───────────────────────

function renderResponse(spec, burst, age, seed, entityId, tick, self, obs, temperament, out) {
  const resp = spec.response;
  if (resp.curve && (resp.amp || resp.ampField)) {
    const amp = burst ? burst.amp
      : (resp.amp || 0) + (resp.ampField ? (resp.ampScale || 0) * (temperament[resp.ampField] || 0) : 0);
    let damped = amp;
    if (resp.dampWhen && temperament[resp.dampWhen.field] > resp.dampWhen.above) {
      damped *= resp.dampWhen.scale;
    }
    const dur = burst ? Math.max(1, burst.untilTick - burst.startTick) : 1;
    const t = burst ? clamp(age / dur, 0, 1) : 0;
    let wave = 0;
    switch (resp.curve) {
      case 'step': wave = 1; break;
      case 'decay': wave = 1 - t; break;
      case 'decay_soft': wave = 0.35 + 0.65 * (1 - t); break;
      case 'ramp': wave = t; break;
      case 'sine': wave = Math.sin(t * TAU); break;
      case 'alternating': {
        const flip = Math.max(1, resp.flipTicks || 8);
        wave = (Math.floor(age / flip) % 2 === 0 ? 1 : -1) * (0.4 + 0.6 * (1 - t));
        break;
      }
      case 'sine_cont': {
        const rate = resp.rate || 0.02;
        const phase = hashUnit(seed, entityId, 'st_phase', spec.kind, Math.round(rate * 1000)) * TAU;
        wave = Math.sin(((burst ? age : tick) * rate) * TAU + phase);
        break;
      }
      default: break;
    }
    const side = burst ? burst.side
      : resolveSide(resp.side, seed, entityId, tick, spec, self, obs, null);
    out.lateral += side * damped * wave;
  }
  if (resp.speedScale != null) out.speedScale *= resp.speedScale;
  if (resp.brake === true) out.brake = true;
  if (resp.boost === true) out.boost = true;
  if (resp.dropAimBelow != null && temperament.aim < resp.dropAimBelow) out.dropAim = true;
  if (resp.holdAim === true) out.holdAim = true;
  if (resp.simmer === true) out.simmer = true;
  if (resp.settle === true) out.settle = true;
  if (resp.away != null && resp.away > 0) {
    const from = obs.targetPos || obs.nearestHostilePos || null;
    if (from) {
      out.away = Math.max(out.away, resp.away);
      out.awayFrom = from;
    }
  }
  if (resp.pull) {
    const point = pullPoint(resp.pull.which, obs);
    if (point) {
      out.pullTo = point;
      out.pullK = Math.max(out.pullK, resp.pull.k || 0.4);
    }
  }
}

function pullPoint(which, obs) {
  if (which === 'nearestAlly') return obs.nearestAllyPos;
  if (which === 'threatenedAlly') return obs.threatenedAllyPos;
  if (which === 'target') return obs.targetPos || null;
  return null;
}

// ── shared geometry helpers ───────────────────────────────────────────────────

function damageEventSeen(ctx) {
  const events = ctx.events;
  if (!Array.isArray(events)) return false;
  for (const e of events) {
    if (e && e.type === 'damage_received' && Number.isFinite(e.magnitude) && e.magnitude > 0) return true;
  }
  return false;
}

function closingSpeed(self, target) {
  if (!target || !target.pos) return 0;
  const dx = target.pos.x - self.pos.x, dz = target.pos.z - self.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const svx = self.vel ? self.vel.x : 0, svz = self.vel ? self.vel.z : 0;
  const tvx = target.vel ? target.vel.x : 0, tvz = target.vel ? target.vel.z : 0;
  return ((svx - tvx) * dx + (svz - tvz) * dz) / dist;
}

function recedingSpeed(self, target) {
  return -closingSpeed(self, target);
}

function distanceTo(self, contact) {
  if (!contact || !contact.pos) return Infinity;
  return Math.hypot(contact.pos.x - self.pos.x, contact.pos.z - self.pos.z);
}

/** Kinds where doctrine/emergency logic owns the hull — reflexes stand down. */
export function reflexAllowedForIntent(kind) {
  return !REFLEX_INTENT_EXCLUSIONS.includes(kind);
}
