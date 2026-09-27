// Pilot reflexes (§21A combat-variety seam): bounded, deterministic trigger→maneuver reactions
// that sit between doctrine intent and the thruster solver. A reflex is a short-lived impulse —
// sidestep a volley, weave when marked, brake-check an overshoot, pounce on a runner — that
// displaces the desired point/velocity for a handful of ticks and then hands the hull back to
// doctrine. The trigger table is data; the engine evaluates it against the live sensor frame.
//
// Determinism: every draw is hashUnit(seed, entityId, tick-bucket) and every state lives on the
// planner's per-entity runtime record (rebuilt, not serialized — same contract as the rest of
// the planner). No ambient randomness, no wall time.

import { ContactKind, clamp, hashUnit } from './contracts.js';

export const REFLEX_KIND = Object.freeze({
  VOLLEY_JINK: 'volley_jink',
  HIT_WEAVE: 'hit_weave',
  MARKED_WEAVE: 'marked_weave',
  BRAKE_CHECK: 'brake_check',
  POUNCE: 'pounce',
  SCATTER_LOSS: 'scatter_loss',
  SIMMER: 'simmer',
});

// Trigger table. `windowTicks` is the active duration once fired; `cooldownTicks` the refractory.
// All ranges are evaluated against the member's own sensor frame — a reflex can never see
// farther than the ship's own sensors do.
const TRIGGERS = Object.freeze({
  [REFLEX_KIND.VOLLEY_JINK]: Object.freeze({ windowTicks: 34, cooldownTicks: 120, priority: 1 }),
  [REFLEX_KIND.HIT_WEAVE]: Object.freeze({ windowTicks: 50, cooldownTicks: 160, priority: 2 }),
  [REFLEX_KIND.BRAKE_CHECK]: Object.freeze({ windowTicks: 26, cooldownTicks: 280, priority: 3 }),
  [REFLEX_KIND.POUNCE]: Object.freeze({ windowTicks: 55, cooldownTicks: 300, priority: 4 }),
  [REFLEX_KIND.SCATTER_LOSS]: Object.freeze({ windowTicks: 44, cooldownTicks: 480, priority: 5 }),
  // Stance, not burst: active while the triggering condition holds, no cooldown.
  [REFLEX_KIND.MARKED_WEAVE]: Object.freeze({ windowTicks: 0, cooldownTicks: 0, priority: 9, stance: true }),
  [REFLEX_KIND.SIMMER]: Object.freeze({ windowTicks: 0, cooldownTicks: 0, priority: 8, stance: true }),
});

const TAU = Math.PI * 2;

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
    burst: null,            // {kind, startTick, untilTick, side, amp}
    cooldowns: null,        // Map kind -> cooldown-until tick (lazily allocated)
    lastHull: 1,
    seenAllies: null,       // Map friendly contact id -> alive flag (lazily allocated)
  };
}

/**
 * Evaluate the trigger table for one ship on one tick.
 * ctx: {entityId, tick, self, contacts, target, intent, temperament, reflexState}
 * Returns null or {kind, lateral, speedScale, brake, boost, dropAim, standoff}.
 * `lateral` is a signed world-frame lateral offset magnitude (the planner applies it
 * perpendicular to the desired direction).
 */
export function evaluateReflexes(seed, ctx) {
  const { entityId, tick, self, contacts, target, intent, temperament, reflexState } = ctx;
  const rs = reflexState;
  // The gate lives inside the engine too: callers who skip reflexAllowedForIntent still
  // never get a jink out of a hull that is already doing an emergency maneuver.
  if (!self || !intent || !reflexAllowedForIntent(intent.kind)) return null;

  // Update the observation registers every call, burst or not.
  const hull = Number.isFinite(self.hullFraction) ? self.hullFraction : 1;
  const hullHit = rs.lastHull - hull;
  rs.lastHull = hull;
  const allies = trackAllies(rs, self, contacts);
  const incoming = nearestIncoming(self, contacts);

  // ── stance: simmer ──────────────────────────────────────────────────────────
  // Hot ships throttle off and refuse boost until the plates cool. Continuous,
  // evaluated even while a burst reflex is running (a dodging hull still manages heat).
  const heat = Number.isFinite(self.heatFraction) ? self.heatFraction : 0;
  const simmer = heat > 0.86;

  // ── burst expiry ────────────────────────────────────────────────────────────
  if (rs.burst && tick >= rs.burst.untilTick) rs.burst = null;

  // ── stance: marked weave ────────────────────────────────────────────────────
  // A hostile ship tracking this hull while it is still outside knife range earns a
  // continuous weave — the "rolls and dodges" pilot. Gunners (high aim) stand straighter.
  const marked = markedByHostile(self, contacts);
  let stance = null;
  if (marked && temperament.weave > 0.25) {
    stance = {
      kind: REFLEX_KIND.MARKED_WEAVE,
      // Slow drift cycle: ~2.2 s at 60 Hz, phase offset per pilot so wingmates don't
      // weave in lockstep (they'd read as one mirrored ghost).
      phase: hashUnit(seed, entityId, 'marked_weave_phase') * TAU,
      amp: (18 + 42 * temperament.weave) * (temperament.aim > 0.65 ? 0.55 : 1),
      rate: 0.023,
    };
  }

  // ── burst triggers ──────────────────────────────────────────────────────────
  if (!rs.burst) {
    const burst = pickBurst(seed, ctx, { hullHit, incoming, allies, marked });
    if (burst) rs.burst = burst;
  }

  if (!rs.burst && !stance && !simmer) return null;

  // Resolve the active reflex into planner-facing channels.
  const out = {
    kind: rs.burst ? rs.burst.kind : (stance ? stance.kind : REFLEX_KIND.SIMMER),
    lateral: 0,
    speedScale: 1,
    brake: false,
    boost: false,
    dropAim: false,
  };
  if (simmer) {
    out.speedScale *= 0.68;
    out.simmer = true;
  }
  if (stance) {
    const u = hashUnit(seed, entityId, 'marked_weave_dir', Math.floor(tick / 90));
    const dir = u < 0.5 ? -1 : 1;
    out.lateral += Math.sin((tick * stance.rate) * TAU + stance.phase) * stance.amp * dir;
  }
  if (rs.burst) {
    const b = rs.burst;
    const age = tick - b.startTick;
    switch (b.kind) {
      case REFLEX_KIND.VOLLEY_JINK: {
        // One decisive sideways step, easing off as the window ends.
        const falloff = 1 - age / Math.max(1, b.untilTick - b.startTick);
        out.lateral += b.side * b.amp * (0.35 + 0.65 * falloff);
        out.dropAim = temperament.aim < 0.5;
        break;
      }
      case REFLEX_KIND.HIT_WEAVE: {
        // S-curve weave: two beats of alternating strafe under the hit's shock.
        out.lateral += b.side * b.amp * Math.sin((age / Math.max(1, b.untilTick - b.startTick)) * Math.PI * 2);
        out.dropAim = temperament.aim < 0.45;
        break;
      }
      case REFLEX_KIND.BRAKE_CHECK: {
        out.brake = true;
        out.speedScale *= 0.55;
        // The classic overshoot move: kill speed, swing slightly off-axis so the
        // pursuer's nose slides past, then fall in behind.
        out.lateral += b.side * b.amp * (age / Math.max(1, b.untilTick - b.startTick));
        break;
      }
      case REFLEX_KIND.POUNCE: {
        out.boost = true;
        out.speedScale *= 1.22;
        break;
      }
      case REFLEX_KIND.SCATTER_LOSS: {
        const falloff = 1 - age / Math.max(1, b.untilTick - b.startTick);
        out.lateral += b.side * b.amp * (0.5 + 0.5 * falloff);
        out.speedScale *= 1.12;
        out.dropAim = temperament.aim < 0.4;
        break;
      }
      default: break;
    }
  }
  return out;
}

// ── trigger evaluation ────────────────────────────────────────────────────────

function pickBurst(seed, ctx, obs) {
  const { entityId, tick, self, contacts, target, intent, temperament, reflexState: rs } = ctx;
  const cooling = (kind) => rs.cooldowns != null && (rs.cooldowns.get(kind) || 0) > tick;
  const setCooldown = (kind) => {
    if (!rs.cooldowns) rs.cooldowns = new Map();
    rs.cooldowns.set(kind, tick + TRIGGERS[kind].cooldownTicks);
  };
  const side = () => (hashUnit(seed, entityId, 'reflex_side', Math.floor(tick / 24)) < 0.5 ? -1 : 1);

  // 1) Volley jink: a live projectile on a near-miss course. The highest-priority
  //    reaction — ships that never dodge gunfire read as targets, not pilots.
  if (!cooling(REFLEX_KIND.VOLLEY_JINK) && obs.incoming && temperament.dash > 0.2) {
    setCooldown(REFLEX_KIND.VOLLEY_JINK);
    return {
      kind: REFLEX_KIND.VOLLEY_JINK,
      startTick: tick,
      untilTick: tick + TRIGGERS[REFLEX_KIND.VOLLEY_JINK].windowTicks,
      side: obs.incoming.side,
      amp: 42 + 58 * temperament.dash,
    };
  }

  // 2) Hit weave: hull dropped since the last frame (or a damage event landed).
  const damaged = obs.hullHit > 0.015 || damageEventSeen(ctx);
  if (!cooling(REFLEX_KIND.HIT_WEAVE) && damaged) {
    setCooldown(REFLEX_KIND.HIT_WEAVE);
    return {
      kind: REFLEX_KIND.HIT_WEAVE,
      startTick: tick,
      untilTick: tick + TRIGGERS[REFLEX_KIND.HIT_WEAVE].windowTicks,
      side: side(),
      amp: 26 + 44 * temperament.weave,
    };
  }

  // 3) Brake check: closing way too hot on the target and this pilot is the kind who
  //    would drop the hammer. Deterministic per-pilot gate so wingmates don't all
  //    brake on the same tick.
  const closing = closingSpeed(self, target);
  if (!cooling(REFLEX_KIND.BRAKE_CHECK) && target && closing > 78
    && distanceTo(self, target) < 430
    && hashUnit(seed, entityId, 'brake_check_gate', Math.floor(tick / 120)) < temperament.dash * 0.9) {
    setCooldown(REFLEX_KIND.BRAKE_CHECK);
    return {
      kind: REFLEX_KIND.BRAKE_CHECK,
      startTick: tick,
      untilTick: tick + TRIGGERS[REFLEX_KIND.BRAKE_CHECK].windowTicks,
      side: side(),
      amp: 30 + 40 * temperament.dash,
    };
  }

  // 4) Pounce: the target is running or disabled and this pilot has the legs for it.
  if (!cooling(REFLEX_KIND.POUNCE) && target && temperament.verve > 0.55) {
    const receding = recedingSpeed(self, target);
    if ((receding > 26 || target.disabled === true || target.alive === false)
      && distanceTo(self, target) > 300) {
      setCooldown(REFLEX_KIND.POUNCE);
      return {
        kind: REFLEX_KIND.POUNCE,
        startTick: tick,
        untilTick: tick + TRIGGERS[REFLEX_KIND.POUNCE].windowTicks,
        side: 0,
        amp: 0,
      };
    }
  }

  // 5) Scatter on loss: a wingmate just went down in view. Ships that keep a dead-even
  //    course while friends die read as drones; this breaks the line.
  if (!cooling(REFLEX_KIND.SCATTER_LOSS) && obs.allies.lostRecently) {
    setCooldown(REFLEX_KIND.SCATTER_LOSS);
    return {
      kind: REFLEX_KIND.SCATTER_LOSS,
      startTick: tick,
      untilTick: tick + TRIGGERS[REFLEX_KIND.SCATTER_LOSS].windowTicks,
      side: side(),
      amp: 55 + 45 * temperament.weave,
    };
  }

  return null;
}

// ── observation helpers (all reads come from the member's own sensor frame) ────

function trackAllies(rs, self, contacts) {
  let lostRecently = false;
  if (!rs.seenAllies) rs.seenAllies = new Map();
  const seen = rs.seenAllies;
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
  return { lostRecently };
}

function nearestIncoming(self, contacts) {
  let best = null;
  const selfR = Number.isFinite(self.radius) ? self.radius : 16;
  for (const c of contacts) {
    if (c.kind !== ContactKind.PROJECTILE || c.hostile !== true || c.alive === false) continue;
    if (!c.pos || !c.vel) continue;
    const dx = c.pos.x - self.pos.x, dz = c.pos.z - self.pos.z;
    const vx = c.vel.x - (self.vel ? self.vel.x : 0), vz = c.vel.z - (self.vel ? self.vel.z : 0);
    const speed2 = vx * vx + vz * vz;
    if (speed2 < 1) continue;
    const eta = -(dx * vx + dz * vz) / speed2; // seconds to closest approach
    if (eta < 0 || eta > 1.15) continue;
    const miss = Math.hypot(dx + vx * eta, dz + vz * eta);
    if (miss > selfR + 34) continue;
    if (!best || miss < best.miss) {
      // Sidestep perpendicular to the projectile's own velocity, away from its pass side.
      const across = dx * (-vz) + dz * vx; // sign of which side self sits on
      best = { miss, eta, side: across >= 0 ? 1 : -1 };
    }
  }
  return best;
}

function markedByHostile(self, contacts) {
  for (const c of contacts) {
    if (c.kind !== ContactKind.SHIP || c.hostile !== true || c.alive === false) continue;
    if (c.targetId === self.id) {
      const d = distanceTo(self, c);
      if (d > 160 && d < 900) return true;
    }
  }
  return false;
}

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
  return kind !== 'retreat' && kind !== 'escape_tether' && kind !== 'clear_deadlock';
}
