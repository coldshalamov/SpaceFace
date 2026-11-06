// Pilot reflexes (§21A combat-variety seam): bounded, deterministic trigger→maneuver reactions
// that sit between doctrine intent and the thruster solver. A reflex is a short-lived impulse —
// sidestep a volley, weave when marked, brake-check an overshoot, pounce on a runner — that
// displaces the desired point/velocity for a handful of ticks and then hands the hull back to
// doctrine. The trigger table is data; the engine evaluates it against the live sensor frame.
//
// Row 491 consolidation: the reflex stack is FOLDED INTO the doctrine's committed-attack cycle,
// not extended. When the doctrine stamps `committedRun` (wind-up + attack phases) the lateral
// bursts and weave stance stand down — the doctrine owns the hull, and the only dodge that
// survives is the body dodge (the one rare, physics-telegraphed evasion). When it stamps
// `exposedRecovery` (post-attack egress) only survival triggers stay (body dodge, volley jink):
// the recovery beat stays exposed and readable instead of thrashing. Outside those beats — the
// approach legs — the pilot flies and dodges: full stack, but the four lateral bursts share one
// refractory (DEFENSIVE_BURST_COOLDOWN_TICKS) so even there a pilot takes at most one defensive
// burst per window.
//
// Determinism: every draw is hashUnit(seed, entityId, tick-bucket) and every state lives on the
// planner's per-entity runtime record (rebuilt, not serialized — same contract as the rest of
// the planner). No ambient randomness, no wall time.

import { ContactKind, clamp, hashUnit } from './contracts.js';

export const REFLEX_KIND = Object.freeze({
  BODY_DODGE: 'body_dodge',
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
  [REFLEX_KIND.BODY_DODGE]: Object.freeze({ windowTicks: 30, cooldownTicks: 90, priority: 0 }),
  [REFLEX_KIND.VOLLEY_JINK]: Object.freeze({ windowTicks: 34, cooldownTicks: 120, priority: 1 }),
  [REFLEX_KIND.HIT_WEAVE]: Object.freeze({ windowTicks: 50, cooldownTicks: 160, priority: 2 }),
  [REFLEX_KIND.BRAKE_CHECK]: Object.freeze({ windowTicks: 26, cooldownTicks: 280, priority: 3 }),
  [REFLEX_KIND.POUNCE]: Object.freeze({ windowTicks: 55, cooldownTicks: 300, priority: 4 }),
  [REFLEX_KIND.SCATTER_LOSS]: Object.freeze({ windowTicks: 44, cooldownTicks: 480, priority: 5 }),
  // Stance, not burst: active while the triggering condition holds, no cooldown.
  [REFLEX_KIND.MARKED_WEAVE]: Object.freeze({ windowTicks: 0, cooldownTicks: 0, priority: 9, stance: true }),
  [REFLEX_KIND.SIMMER]: Object.freeze({ windowTicks: 0, cooldownTicks: 0, priority: 8, stance: true }),
});

// Row 491 consolidation (build_map §33.2): the four lateral-burst triggers — volley jink, hit
// weave, brake-check, scatter-on-loss — share ONE refractory slot. Independent per-kind
// cooldowns let the causes chain (jink → weave → scatter → jink…) into a continuous
// side-to-side thrash (measured 0.8 heading reversals/s); one shared window structurally caps
// reflex-induced reversals at 1 per 160 ticks = 0.375/s, inside the ≤0.4/s design target.
// The per-kind cooldownTicks above still apply on top (a hit-weave stays rarer than a jink).
export const DEFENSIVE_BURST_KINDS = Object.freeze([
  REFLEX_KIND.VOLLEY_JINK,
  REFLEX_KIND.HIT_WEAVE,
  REFLEX_KIND.BRAKE_CHECK,
  REFLEX_KIND.SCATTER_LOSS,
]);
export const DEFENSIVE_BURST_COOLDOWN_TICKS = 160;

const TAU = Math.PI * 2;

// A hazard/objective/tumbling hull moving at least this fast (WU/s) is a thrown body, not cover.
export const MOVING_BODY_MIN_SPEED = 120;
const BODY_MIN_CLOSING_SPEED = 100;
const BODY_MAX_ETA = 1.1;
const BODY_WATCH_CAP = 4;
const BODY_MISS_PAD = 14;
const BODY_REAR_ARC = (100 * Math.PI) / 180;
const BODY_MASS_AMP = Object.freeze({ light: 1, medium: 0.7, heavy: 0.35, capital: 0 });

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
    bodyWatch: null,        // Map bodyId -> sinceTick for thrown bodies that qualified last look (≤4)
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
  const bodyOnly = ctx.bodyDodgeOnly === true;
  // A burst begun before the hull became mind-owned must not keep displacing a waypoint.
  if (bodyOnly && rs.burst && rs.burst.kind !== REFLEX_KIND.BODY_DODGE) rs.burst = null;
  // The gate lives inside the engine too: callers who skip reflexAllowedForIntent still
  // never get a jink out of a hull that is already doing an emergency maneuver.
  if (!self || !intent || !reflexAllowedForIntent(intent.kind)) {
    if (intent && rs.burst) rs.burst = null;
    return null;
  }
  // A phase change owns active bursts too: an approach jink must not carry its
  // remaining strafe into the announced attack line. Keep the existing cooldowns,
  // body dodge and forward pounce; recovery still permits a surviving volley jink.
  if (rs.burst && DEFENSIVE_BURST_KINDS.includes(rs.burst.kind)
    && (intent.committedRun === true || (intent.exposedRecovery === true
      && rs.burst.kind !== REFLEX_KIND.VOLLEY_JINK))) rs.burst = null;

  // Update the observation registers every call, burst or not.
  let hullHit = 0;
  let allies = NO_ALLY_LOSS;
  let incoming = null;
  if (!bodyOnly) {
    const hull = Number.isFinite(self.hullFraction) ? self.hullFraction : 1;
    hullHit = rs.lastHull - hull;
    rs.lastHull = hull;
    allies = trackAllies(rs, self, contacts);
    incoming = nearestIncoming(self, contacts);
  }
  const body = nearestIncomingBody(seed, entityId, tick, self, contacts, temperament, rs);

  // ── stance: simmer ──────────────────────────────────────────────────────────
  // Hot ships throttle off and refuse boost until the plates cool. Continuous,
  // evaluated even while a burst reflex is running (a dodging hull still manages heat).
  const heat = Number.isFinite(self.heatFraction) ? self.heatFraction : 0;
  const simmer = !bodyOnly && heat > 0.86;

  // ── burst expiry ────────────────────────────────────────────────────────────
  if (rs.burst && tick >= rs.burst.untilTick) rs.burst = null;

  // ── stance: marked weave ────────────────────────────────────────────────────
  // A hostile ship tracking this hull while it is still outside knife range earns a
  // continuous weave — the "rolls and dodges" pilot. Gunners (high aim) stand straighter.
  // Row 491: the stance belongs to the approach legs. During a committed run (wind-up or
  // attack) and the exposed recovery the hull straightens — a wind-up that weaves is not a
  // readable tell, and a recovery that weaves is not exposed.
  const marked = !bodyOnly && markedByHostile(self, contacts);
  let stance = null;
  if (marked && temperament.weave > 0.25
    && intent.committedRun !== true && intent.exposedRecovery !== true) {
    stance = {
      kind: REFLEX_KIND.MARKED_WEAVE,
      // Slow drift cycle: ~2.2 s at 60 Hz, phase offset per pilot so wingmates don't
      // weave in lockstep (they'd read as one mirrored ghost).
      phase: hashUnit(seed, entityId, 'marked_weave_phase') * TAU,
      amp: (14 + 32 * temperament.weave) * (temperament.aim > 0.65 ? 0.55 : 1),
      rate: 0.023,
    };
  }

  // ── burst triggers ──────────────────────────────────────────────────────────
  if (!rs.burst) {
    const burst = pickBurst(seed, ctx, { hullHit, incoming, allies, marked, body, bodyOnly });
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
      case REFLEX_KIND.BODY_DODGE: {
        // Hull integrity beats intent: a hard step off the thrown body's line, easing out.
        const falloff = 1 - age / Math.max(1, b.untilTick - b.startTick);
        out.dodge = b.dodge;
        out.dodgeAmp = b.amp * (0.5 + 0.5 * falloff);
        out.boost = b.boost === true;
        out.dropAim = true;
        break;
      }
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
  // Row 491 consolidation: the lateral bursts share one refractory slot (see
  // DEFENSIVE_BURST_COOLDOWN_TICKS above) so chained causes cannot chain bursts.
  const SHARED_BURST_SLOT = 'defensive_burst';
  const burstCooling = () => rs.cooldowns != null && (rs.cooldowns.get(SHARED_BURST_SLOT) || 0) > tick;
  const setBurstCooldown = () => {
    if (!rs.cooldowns) rs.cooldowns = new Map();
    rs.cooldowns.set(SHARED_BURST_SLOT, tick + DEFENSIVE_BURST_COOLDOWN_TICKS);
  };
  // Cycle gates stamped by the combat doctrine (row 491). `committedRun` — the doctrine holds a
  // wind-up or attack phase and owns the hull: lateral bursts stand down entirely.
  // `exposedRecovery` — the post-attack egress: survival triggers only, so the beat stays
  // exposed. Approach legs (no flag) fly the full stack.
  const committedRun = intent.committedRun === true;
  const exposedRecovery = intent.exposedRecovery === true;
  const side = () => (hashUnit(seed, entityId, 'reflex_side', Math.floor(tick / 24)) < 0.5 ? -1 : 1);

  // 0) Body dodge: a thrown wreck/rock/pod/tumbling hull closing on a near-miss course.
  //    The one rare, telegraphed dodge — it survives every cycle beat (hull integrity
  //    outranks readability; the thrown body announces itself physically).
  if (!cooling(REFLEX_KIND.BODY_DODGE) && obs.body && obs.body.ready) {
    setCooldown(REFLEX_KIND.BODY_DODGE);
    return {
      kind: REFLEX_KIND.BODY_DODGE,
      startTick: tick,
      untilTick: tick + TRIGGERS[REFLEX_KIND.BODY_DODGE].windowTicks,
      side: 0,
      amp: obs.body.amp,
      dodge: obs.body.dodge,
      boost: obs.body.boost,
    };
  }
  if (obs.bodyOnly) return null;

  // 1) Volley jink: a live projectile on a near-miss course. The highest-priority
  //    reaction — ships that never dodge gunfire read as targets, not pilots. Allowed on
  //    approach legs and through the exposed recovery (a fleeing hull still sidesteps a
  //    shell); suppressed inside a committed run so the announced pass holds its line.
  if (!committedRun && !burstCooling() && !cooling(REFLEX_KIND.VOLLEY_JINK) && obs.incoming && temperament.dash > 0.2) {
    setCooldown(REFLEX_KIND.VOLLEY_JINK);
    setBurstCooldown();
    return {
      kind: REFLEX_KIND.VOLLEY_JINK,
      startTick: tick,
      untilTick: tick + TRIGGERS[REFLEX_KIND.VOLLEY_JINK].windowTicks,
      side: obs.incoming.side,
      amp: 42 + 58 * temperament.dash,
    };
  }

  // 2) Hit weave: hull dropped since the last frame (or a damage event landed). Approach
  //    legs only — a hit taken during a committed run or the exposed recovery must not
  //    re-break the line the player is reading.
  const damaged = obs.hullHit > 0.015 || damageEventSeen(ctx);
  if (!committedRun && !exposedRecovery && !burstCooling() && !cooling(REFLEX_KIND.HIT_WEAVE) && damaged) {
    setCooldown(REFLEX_KIND.HIT_WEAVE);
    setBurstCooldown();
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
  //    brake on the same tick. Approach legs only — the doctrine's own egress owns the
  //    overshoot inside a run.
  const closing = closingSpeed(self, target);
  if (!committedRun && !exposedRecovery && !burstCooling() && !cooling(REFLEX_KIND.BRAKE_CHECK) && target && closing > 78
    && distanceTo(self, target) < 430
    && hashUnit(seed, entityId, 'brake_check_gate', Math.floor(tick / 120)) < temperament.dash * 0.9) {
    setCooldown(REFLEX_KIND.BRAKE_CHECK);
    setBurstCooldown();
    return {
      kind: REFLEX_KIND.BRAKE_CHECK,
      startTick: tick,
      untilTick: tick + TRIGGERS[REFLEX_KIND.BRAKE_CHECK].windowTicks,
      side: side(),
      amp: 30 + 40 * temperament.dash,
    };
  }

  // 4) Pounce: the target is running or disabled and this pilot has the legs for it.
  //    Survives every cycle beat — it is a forward boost through the commit, never a
  //    reversal.
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
  //    course while friends die read as drones; this breaks the line. Approach legs only.
  if (!committedRun && !exposedRecovery && !burstCooling() && !cooling(REFLEX_KIND.SCATTER_LOSS) && obs.allies.lostRecently) {
    setCooldown(REFLEX_KIND.SCATTER_LOSS);
    setBurstCooldown();
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

const NO_ALLY_LOSS = Object.freeze({ lostRecently: false });

function planarBodyRadius(body, fallback = 0) {
  const measured = Number(body && body.planarRadius);
  if (measured > 0) return measured;
  return Number(body && body.radius) || fallback;
}

/** Player threat policy: no NPC notice roll, reaction delay, or occlusion gate. */
export function incomingBodyThreatFor(self, candidates) {
  if (!self?.pos) return null;
  let best = null;
  const selfR = planarBodyRadius(self, 16);
  for (const c of candidates || []) {
    if (!c || c.id === self.id || c.alive === false || !c.pos || !c.vel) continue;
    if (c.kind === ContactKind.SHIP) {
      if (c.tumbling !== true && c.disabled !== true) continue;
    } else if (c.kind !== ContactKind.HAZARD && c.kind !== ContactKind.OBJECTIVE) continue;
    if (!(Math.hypot(c.vel.x, c.vel.z) >= MOVING_BODY_MIN_SPEED)) continue;
    const dx = c.pos.x - self.pos.x, dz = c.pos.z - self.pos.z;
    const vx = c.vel.x - (self.vel?.x || 0), vz = c.vel.z - (self.vel?.z || 0);
    const speed2 = vx * vx + vz * vz;
    const distance = Math.hypot(dx, dz);
    const approach = -(dx * vx + dz * vz);
    const closingSpeed = approach / distance;
    if (!(distance >= 1e-6 && speed2 >= 1 && closingSpeed >= BODY_MIN_CLOSING_SPEED)) continue;
    const eta = approach / speed2;
    if (!(eta > 0 && eta <= BODY_MAX_ETA)) continue;
    const miss = Math.hypot(dx + vx * eta, dz + vz * eta);
    if (!(miss < selfR + planarBodyRadius(c) + BODY_MISS_PAD)) continue;
    if (!best || eta < best.eta || (eta === best.eta && String(c.id) < String(best.bodyId))) {
      best = { bodyId: c.id, eta, closingSpeed, miss };
    }
  }
  return best;
}

function segmentClearance(ax, az, bx, bz, px, pz) {
  const sx = bx - ax, sz = bz - az;
  const len2 = sx * sx + sz * sz;
  const t = len2 > 0 ? clamp(((px - ax) * sx + (pz - az) * sz) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + sx * t), pz - (az + sz * t));
}

function bodyOccluded(self, body, contacts) {
  for (const c of contacts) {
    if (c.id === body.id || c.id === self.id || !c.pos) continue;
    const blocks = c.kind === ContactKind.HAZARD
      || (c.kind === ContactKind.SHIP && (c.operationalMassBand === 'heavy' || c.operationalMassBand === 'capital'));
    if (!blocks) continue;
    if (segmentClearance(self.pos.x, self.pos.z, body.pos.x, body.pos.z, c.pos.x, c.pos.z) < 0.85 * planarBodyRadius(c)) {
      return true;
    }
  }
  return false;
}

/**
 * Thrown-body perception: the most imminent fast body on a near-miss course that this pilot
 * can see (no rock or big hull between), notices (per-pilot gate), and has had long enough to
 * react to. Returns null or {bodyId, eta, ready, dodge:{x,z}, amp, boost}. Updates rs.bodyWatch
 * only: each qualifying body keeps its own reaction clock, bodies that stop qualifying lose it.
 */
function nearestIncomingBody(seed, entityId, tick, self, contacts, temperament, rs) {
  const band = self.operationalMassBand;
  const bandAmp = Object.prototype.hasOwnProperty.call(BODY_MASS_AMP, band) ? BODY_MASS_AMP[band] : 1;
  const stoic = self.combatDoctrineId === 'detonator_run';
  let best = null;
  let qualifying = null;
  if (bandAmp > 0 && !stoic && self.pos) {
    const selfR = planarBodyRadius(self, 16);
    const svx = self.vel ? self.vel.x : 0, svz = self.vel ? self.vel.z : 0;
    const noticeBase = clamp(0.18 + 0.32 * temperament.dash + 0.18 * (1 - temperament.aim), 0.08, 0.7);
    for (const c of contacts) {
      const kind = c.kind;
      if (c.id === self.id || !c.pos || !c.vel || c.visible === false) continue;
      if (kind === ContactKind.SHIP) {
        if (c.tumbling !== true && c.disabled !== true) continue;
      } else if (kind !== ContactKind.HAZARD && kind !== ContactKind.OBJECTIVE) continue;
      if (Math.hypot(c.vel.x, c.vel.z) < MOVING_BODY_MIN_SPEED) continue;
      const dx = c.pos.x - self.pos.x, dz = c.pos.z - self.pos.z;
      const vx = c.vel.x - svx, vz = c.vel.z - svz;
      const speed2 = vx * vx + vz * vz;
      if (speed2 < 1) continue;
      const approach = -(dx * vx + dz * vz);
      const dist = Math.hypot(dx, dz);
      if (dist < 1e-6 || approach / dist < BODY_MIN_CLOSING_SPEED) continue;
      const eta = approach / speed2;
      if (eta <= 0 || eta > BODY_MAX_ETA) continue;
      const miss = Math.hypot(dx + vx * eta, dz + vz * eta);
      if (miss >= selfR + planarBodyRadius(c) + BODY_MISS_PAD) continue;
      if (bodyOccluded(self, c, contacts)) continue;
      const rear = Math.abs(wrapPi(Math.atan2(dz, dx) - (Number.isFinite(self.rot) ? self.rot : 0))) > BODY_REAR_ARC;
      const notice = noticeBase * (rear ? 0.5 : 1);
      if (!(hashUnit(seed, entityId, c.id, 'body_dodge_notice') < notice)) continue;
      const entry = { c, eta, rear, dx, dz, vx, vz };
      if (!qualifying) qualifying = [];
      qualifying.push(entry);
      if (!best || eta < best.eta) best = entry;
    }
  }
  if (!best) {
    if (rs.bodyWatch) rs.bodyWatch = null;
    return null;
  }
  // The four observation slots belong to the imminent threats, not whichever bodies
  // the sensor list happens to return first. Otherwise a fifth, closer projectile-body
  // never accumulates its reaction delay and the pilot cannot answer it at all.
  qualifying.sort((a, b) => {
    if (a.eta !== b.eta) return a.eta - b.eta;
    const left = String(a.c.id), right = String(b.c.id);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  best = qualifying[0];
  const previous = rs.bodyWatch instanceof Map ? rs.bodyWatch : null;
  const watch = new Map();
  for (const entry of qualifying) {
    if (watch.size >= BODY_WATCH_CAP) break;
    const id = entry.c.id;
    watch.set(id, previous && previous.has(id) ? previous.get(id) : tick);
  }
  rs.bodyWatch = watch;
  const bodyId = best.c.id;
  const since = watch.has(bodyId) ? watch.get(bodyId) : tick;
  const reactionTicks = 8 + Math.round((1 - temperament.dash) * 18) + (best.rear ? 12 : 0);
  const speed = Math.sqrt(best.vx * best.vx + best.vz * best.vz);
  const px = -best.vz / speed, pz = best.vx / speed;
  const across = best.dx * px + best.dz * pz;
  const sign = Math.abs(across) > 1e-3
    ? (across > 0 ? -1 : 1)
    : (hashUnit(seed, entityId, bodyId, 'body_dodge_side') < 0.5 ? -1 : 1);
  return {
    bodyId,
    eta: best.eta,
    ready: watch.has(bodyId) && tick - since >= reactionTicks,
    dodge: { x: px * sign, z: pz * sign },
    amp: (45 + 45 * temperament.dash) * bandAmp,
    boost: band === 'light',
  };
}

function wrapPi(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
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
