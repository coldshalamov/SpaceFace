// Sustained-formation metrics (Controlled Chaos packet 03).
//
// Pure functions over per-tick samples: no game state, no clock, no randomness. The point of this
// module is that "entered the formation radius once" is NOT a pass. Every number here is taken
// over a WINDOW after the scenario has had time to converge, so a limit cycle, a yaw chatter, a
// slot swap or a saturated channel shows up even if the best-ever error looks fine.
//
// A sample is one follower on one tick:
//   { tick, id, pos:{x,z}, vel:{x,z}, rot, angVel, radius,
//     slot:{x,z}|null, slotVel:{x,z}|null, localSlot:{x,z}|null,
//     request:{forward,right,torqueYaw,kind,reason}|null, breakFormation?:boolean, tactic?:string }
//
// Window convention: `fromTick` inclusive, `toTick` exclusive.

export const FORMATION_METRICS_SCHEMA = 'spaceface.formationMetrics.v1';

/** Yaw rates under this are rest, not a heading change (rad/s). */
export const YAW_REVERSAL_MIN_RATE = 0.15;
/** A channel at or beyond this fraction of its limit counts as saturated. */
export const SATURATION_LEVEL = 0.98;
const DT = 1 / 60;

export function percentile(sorted, q) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = Math.min(1, Math.max(0, q)) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function distribution(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return { n: 0, p50: null, p95: null, max: null, mean: null };
  let sum = 0;
  for (const x of v) sum += x;
  return {
    n: v.length,
    p50: round(percentile(v, 0.5)),
    p95: round(percentile(v, 0.95)),
    max: round(v[v.length - 1]),
    mean: round(sum / v.length),
  };
}

export function round(value, places = 3) {
  if (!Number.isFinite(value)) return value;
  const k = 10 ** places;
  return Math.round(value * k) / k;
}

/**
 * Count sign reversals of a rate signal with hysteresis. A reversal is the signal swinging from
 * beyond +threshold to beyond -threshold (or back); noise inside +-threshold never counts. This is
 * the "yaw chatter" number: a pilot who turns and settles has 0-1, a whirlpool has dozens.
 */
export function countSignReversals(series, threshold = YAW_REVERSAL_MIN_RATE) {
  let last = 0;
  let reversals = 0;
  for (const value of series) {
    if (!Number.isFinite(value)) continue;
    const sign = value > threshold ? 1 : value < -threshold ? -1 : 0;
    if (sign === 0) continue;
    if (last !== 0 && sign !== last) reversals++;
    last = sign;
  }
  return reversals;
}

export function createFormationRecorder({ dt = DT } = {}) {
  /** @type {Map<number|string, object[]>} */
  const byId = new Map();
  const pairs = [];
  const events = [];
  let maxTick = -1;
  return {
    dt,
    sample(s) {
      let list = byId.get(s.id);
      if (!list) byId.set(s.id, list = []);
      list.push(s);
      if (s.tick > maxTick) maxTick = s.tick;
    },
    /** Hull-pair geometry for one tick: array of {a, b, dist, touch} (touch = r1 + r2). */
    pairSample(tick, list) {
      pairs.push({ tick, list });
    },
    /** Free-form scenario marks (impulse landed, leader killed, tumble start...). */
    mark(tick, kind, detail = null) {
      events.push({ tick, kind, detail });
    },
    get events() { return events; },
    get maxTick() { return maxTick; },
    ids() { return [...byId.keys()]; },
    series(id) { return byId.get(id) || []; },
    summarize(options) { return summarizeFormation({ byId, pairs, events, dt }, options); },
  };
}

function inWindow(sample, from, to) {
  return sample.tick >= from && sample.tick < to;
}

function posError(s) {
  if (!s.slot) return null;
  return Math.hypot(s.pos.x - s.slot.x, s.pos.z - s.slot.z);
}

function velError(s) {
  if (!s.slotVel) return null;
  return Math.hypot(s.vel.x - s.slotVel.x, s.vel.z - s.slotVel.z);
}

/**
 * Summarise a recorded run over [fromTick, toTick). `settleRadius` is the position error that
 * counts as "in formation" for convergence/overshoot bookkeeping; `slotJumpLocal` is the change
 * of a member's leader-frame slot between two consecutive samples that counts as a reshuffle
 * (anything bigger than a morph's natural rate). `ignoreTicks` is a list of [from, to) ranges
 * (membership events the scenario deliberately caused) excluded from slot-jump counting.
 */
export function summarizeFormation(rec, {
  fromTick = 0,
  toTick = Infinity,
  settleRadius = 40,
  slotJumpLocal = 24,
  ignoreTicks = [],
} = {}) {
  const dt = rec.dt || DT;
  const perMember = {};
  for (const [id, list] of rec.byId) {
    const win = list.filter((s) => inWindow(s, fromTick, toTick));
    if (!win.length) {
      perMember[String(id)] = { samples: 0 };
      continue;
    }
    const seconds = win.length * dt;
    const posErrs = [];
    const velErrs = [];
    const yaw = [];
    let saturated = 0;
    let yawSaturated = 0;
    let requests = 0;
    let kindChanges = 0;
    let reasonChanges = 0;
    let breakToggles = 0;
    let tacticChanges = 0;
    let slotJumps = 0;
    let lastKind = null;
    let lastReason = null;
    let lastBreak = null;
    let lastTactic = null;
    let lastLocal = null;
    let lastLocalTick = -1;
    for (const s of win) {
      const pe = posError(s);
      if (pe != null) posErrs.push(pe);
      const ve = velError(s);
      if (ve != null) velErrs.push(ve);
      if (Number.isFinite(s.angVel)) yaw.push(s.angVel);
      if (s.request) {
        requests++;
        const r = s.request;
        const peak = Math.max(Math.abs(r.forward || 0), Math.abs(r.right || 0));
        if (peak >= SATURATION_LEVEL) saturated++;
        if (Math.abs(r.torqueYaw || 0) >= SATURATION_LEVEL) yawSaturated++;
        if (lastKind != null && r.kind !== lastKind) kindChanges++;
        if (lastReason != null && r.reason !== lastReason) reasonChanges++;
        lastKind = r.kind;
        lastReason = r.reason;
      }
      if (s.breakFormation != null) {
        if (lastBreak != null && s.breakFormation !== lastBreak) breakToggles++;
        lastBreak = s.breakFormation;
      }
      if (s.tactic != null) {
        if (lastTactic != null && s.tactic !== lastTactic) tacticChanges++;
        lastTactic = s.tactic;
      }
      if (s.localSlot) {
        if (lastLocal && s.tick - lastLocalTick <= 3) {
          const jump = Math.hypot(s.localSlot.x - lastLocal.x, s.localSlot.z - lastLocal.z);
          const ignored = ignoreTicks.some(([a, b]) => s.tick >= a && s.tick < b);
          if (jump > slotJumpLocal && !ignored) slotJumps++;
        }
        lastLocal = s.localSlot;
        lastLocalTick = s.tick;
      }
    }
    // Convergence/overshoot is judged over the FULL series up to the window end, not just the
    // window: the first entry is usually before it.
    const full = list.filter((s) => s.tick < toTick);
    let firstEntry = null;
    for (const s of full) {
      const pe = posError(s);
      if (pe != null && pe <= settleRadius) { firstEntry = s.tick; break; }
    }
    let postEntryMax = null;
    let reexits = 0;
    if (firstEntry != null) {
      let inside = true;
      for (const s of full) {
        if (s.tick < firstEntry) continue;
        const pe = posError(s);
        if (pe == null) continue;
        if (postEntryMax == null || pe > postEntryMax) postEntryMax = pe;
        if (inside && pe > settleRadius * 1.5) { reexits++; inside = false; }
        else if (!inside && pe <= settleRadius) inside = true;
      }
    }
    const reversals = countSignReversals(yaw);
    perMember[String(id)] = {
      samples: win.length,
      seconds: round(seconds, 2),
      posErr: distribution(posErrs),
      velErr: distribution(velErrs),
      yaw: {
        rms: round(Math.sqrt(yaw.reduce((a, b) => a + b * b, 0) / Math.max(1, yaw.length))),
        peak: round(yaw.reduce((a, b) => Math.max(a, Math.abs(b)), 0)),
        reversals,
        reversalsPerSec: round(reversals / Math.max(seconds, 1e-6)),
      },
      saturatedFraction: round(requests ? saturated / requests : 0),
      yawSaturatedFraction: round(requests ? yawSaturated / requests : 0),
      kindChanges,
      reasonChanges,
      breakToggles,
      tacticChanges,
      slotJumps,
      firstEntryTick: firstEntry,
      postEntryMaxErr: postEntryMax == null ? null : round(postEntryMax),
      reexits,
    };
  }

  // Hull geometry across the window: contact episodes (touching hulls) and the closest approach.
  let minClearance = Infinity;
  let contactTicks = 0;
  const episodes = new Set();
  const open = new Map();
  for (const p of rec.pairs) {
    if (p.tick < fromTick || p.tick >= toTick) continue;
    const touching = new Set();
    for (const pair of p.list) {
      const clearance = pair.dist - pair.touch;
      if (clearance < minClearance) minClearance = clearance;
      if (clearance <= 0) {
        const key = `${pair.a}|${pair.b}`;
        touching.add(key);
        contactTicks++;
        if (!open.has(key)) {
          open.set(key, p.tick);
          episodes.add(`${key}@${p.tick}`);
        }
      }
    }
    for (const key of [...open.keys()]) if (!touching.has(key)) open.delete(key);
  }
  const members = Object.values(perMember).filter((m) => m.samples > 0);
  return {
    schema: FORMATION_METRICS_SCHEMA,
    window: { fromTick, toTick: Number.isFinite(toTick) ? toTick : null },
    members: perMember,
    worst: {
      posErrP95: maxOf(members, (m) => m.posErr.p95),
      posErrMax: maxOf(members, (m) => m.posErr.max),
      velErrP95: maxOf(members, (m) => m.velErr.p95),
      yawReversalsPerSec: maxOf(members, (m) => m.yaw.reversalsPerSec),
      saturatedFraction: maxOf(members, (m) => m.saturatedFraction),
      yawSaturatedFraction: maxOf(members, (m) => m.yawSaturatedFraction),
      slotJumps: sumOf(members, (m) => m.slotJumps),
      kindChanges: sumOf(members, (m) => m.kindChanges),
      breakToggles: sumOf(members, (m) => m.breakToggles),
      reexits: sumOf(members, (m) => m.reexits),
      postEntryMaxErr: maxOf(members, (m) => m.postEntryMaxErr),
    },
    geometry: {
      minClearance: Number.isFinite(minClearance) ? round(minClearance) : null,
      contactTicks,
      contactEpisodes: episodes.size,
    },
    marks: rec.events.slice(),
  };
}

function maxOf(list, pick) {
  let best = null;
  for (const item of list) {
    const v = pick(item);
    if (Number.isFinite(v) && (best == null || v > best)) best = v;
  }
  return best;
}

function sumOf(list, pick) {
  let total = 0;
  for (const item of list) {
    const v = pick(item);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}
