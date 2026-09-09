// Pure catch-up kernels. No renderer, bus, or live-entity mutation.

import { SIM_TIER } from './activityClassification.js';

export const INTENT_KIND = Object.freeze({
  PATROL: 'patrol',
  TRAVEL: 'travel',
  DOCK: 'dock',
  MINE: 'mine',
  ESCORT: 'escort',
  FLEE: 'flee',
  LOITER: 'loiter',
});

const INTENT_KINDS = new Set(Object.values(INTENT_KIND));

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function wrapAngle(a) {
  let r = finite(a);
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export function normalizeIntent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const kind = INTENT_KINDS.has(raw.kind) ? raw.kind : null;
  if (!kind) return null;
  return {
    kind,
    routeId: raw.routeId != null ? String(raw.routeId) : null,
    segmentIndex: Number.isFinite(raw.segmentIndex) ? Math.max(0, Math.floor(raw.segmentIndex)) : 0,
    targetRecordId: raw.targetRecordId != null ? String(raw.targetRecordId) : null,
    startT: finite(raw.startT),
    endT: finite(raw.endT),
    parameters: raw.parameters && typeof raw.parameters === 'object' && !Array.isArray(raw.parameters)
      ? { ...raw.parameters }
      : {},
    resultSeed: Number.isFinite(raw.resultSeed) ? (raw.resultSeed >>> 0) : 0,
  };
}

export function ballisticDrift(pos, vel, rot, angVel, dt) {
  const t = Math.max(0, finite(dt));
  const px = finite(pos && pos.x);
  const pz = finite(pos && pos.z);
  const vx = finite(vel && vel.x);
  const vz = finite(vel && vel.z);
  return {
    pos: { x: px + vx * t, z: pz + vz * t },
    vel: { x: vx, z: vz },
    rot: wrapAngle(finite(rot) + finite(angVel) * t),
    angVel: finite(angVel),
  };
}

export function itineraryProgress(intent, simTime) {
  const spec = normalizeIntent(intent);
  if (!spec) return 0;
  const span = spec.endT - spec.startT;
  if (!(span > 0)) return simTime >= spec.endT ? 1 : 0;
  return clamp((finite(simTime) - spec.startT) / span, 0, 1);
}

export function itineraryPosition(intent, simTime) {
  const spec = normalizeIntent(intent);
  if (!spec) return null;
  const from = spec.parameters.from;
  const to = spec.parameters.to;
  if (!from || !to
    || !Number.isFinite(from.x) || !Number.isFinite(from.z)
    || !Number.isFinite(to.x) || !Number.isFinite(to.z)) return null;
  const u = itineraryProgress(spec, simTime);
  return {
    x: finite(from.x) + (finite(to.x) - finite(from.x)) * u,
    z: finite(from.z) + (finite(to.z) - finite(from.z)) * u,
  };
}

export function regenerateVital(current, max, rate, dt) {
  if (!Number.isFinite(current) || !Number.isFinite(max)) return current;
  const t = Math.max(0, finite(dt));
  const r = finite(rate);
  return clamp(current + r * t, 0, max);
}

/**
 * Advance a durable world record from fromT to toT. Combat stays exact:
 * this kernel never resolves fights. Returns a new object.
 */
export function advanceWorldRecord(record, fromT, toT, context = {}) {
  if (!record || typeof record !== 'object') return null;
  const a = finite(fromT);
  const b = finite(toT);
  const dt = b - a;
  if (!(dt > 0)) return { ...record };
  if (record.alive === false || record.outcome === 'destroyed' || record.outcome === 'defeated') {
    return { ...record };
  }
  if (context.unresolvedPlayerCombat === true) {
    return { ...record, abstractTier: SIM_TIER.S0_EXACT };
  }
  const intent = normalizeIntent(record.intent);
  let pos = record.pos && typeof record.pos === 'object' ? { x: finite(record.pos.x), z: finite(record.pos.z) } : { x: 0, z: 0 };
  let vel = record.vel && typeof record.vel === 'object' ? { x: finite(record.vel.x), z: finite(record.vel.z) } : { x: 0, z: 0 };
  let rot = finite(record.rot);
  let angVel = finite(record.angVel);
  if (intent && (intent.kind === INTENT_KIND.TRAVEL || intent.kind === INTENT_KIND.ESCORT || intent.kind === INTENT_KIND.PATROL)) {
    const along = itineraryPosition(intent, b);
    if (along) {
      pos = along;
      vel = { x: 0, z: 0 };
    } else {
      const drifted = ballisticDrift(pos, vel, rot, angVel, dt);
      pos = drifted.pos; vel = drifted.vel; rot = drifted.rot; angVel = drifted.angVel;
    }
  } else {
    const drifted = ballisticDrift(pos, vel, rot, angVel, dt);
    pos = drifted.pos; vel = drifted.vel; rot = drifted.rot; angVel = drifted.angVel;
  }
  const regen = record.regeneration && typeof record.regeneration === 'object' ? record.regeneration : {};
  const shield = regenerateVital(record.shield, record.shieldMax, regen.shieldRate, dt);
  const hull = regenerateVital(record.hull, record.hullMax, regen.hullRate, dt);
  return {
    ...record,
    pos,
    vel,
    rot,
    angVel,
    shield,
    hull,
    lastExactT: b,
    lastObservedT: b,
    abstractTier: record.abstractTier || SIM_TIER.S2_ABSTRACT,
  };
}

export function advanceResourceBody(record, fromT, toT, context = {}) {
  if (!record || typeof record !== 'object') return null;
  const a = finite(fromT);
  const b = finite(toT);
  const dt = b - a;
  if (!(dt > 0)) return { ...record };
  if (record.outcome === 'destroyed') {
    return { ...record, lastObservedT: b };
  }
  const drifted = ballisticDrift(record.pos, record.vel, record.rot, record.angVel, dt);
  const policy = record.recoveryPolicy && typeof record.recoveryPolicy === 'object' ? record.recoveryPolicy : {};
  if (record.outcome === 'depleted' && policy.recoverDepleted !== true && context.allowRecovery !== true) {
    return { ...record, lastObservedT: b };
  }
  const oreMax = Number.isFinite(record.oreHpMax) ? record.oreHpMax : record.oreHp;
  const oreHp = regenerateVital(record.oreHp, oreMax, policy.oreRate, dt);
  const yieldRemainingU = regenerateVital(
    record.yieldRemainingU,
    Number.isFinite(record.yieldMaxU) ? record.yieldMaxU : record.yieldRemainingU,
    policy.yieldRate,
    dt,
  );
  const recovered = record.outcome === 'depleted'
    && Number.isFinite(oreHp) && oreHp > 0
    && (!Number.isFinite(record.yieldRemainingU) || yieldRemainingU > 0);
  return {
    ...record,
    pos: drifted.pos,
    vel: drifted.vel,
    rot: drifted.rot,
    angVel: drifted.angVel,
    oreHp,
    yieldRemainingU,
    pctEjected: Number.isFinite(oreMax) && oreMax > 0
      ? clamp(1 - oreHp / oreMax, 0, 1)
      : record.pctEjected,
    _oreCarry: Number.isFinite(record._oreCarry) ? record._oreCarry : 0,
    outcome: recovered ? 'active' : record.outcome,
    depletedAtT: recovered ? null : record.depletedAtT,
    lastObservedT: b,
    recoveryContext: context && context.fieldId ? String(context.fieldId) : record.recoveryContext || null,
  };
}

export function resolveScheduledWorldEvent(event, state) {
  if (!event || typeof event !== 'object') return { resolved: false, reason: 'missing' };
  const due = finite(event.atT, finite(event.nextEventAtT, -1));
  const now = finite(state && state.simTime);
  if (!(due >= 0) || now < due) return { resolved: false, reason: 'not-due' };
  return {
    resolved: true,
    eventId: event.id != null ? String(event.id) : null,
    kind: event.kind != null ? String(event.kind) : 'unknown',
    resultSeed: Number.isFinite(event.resultSeed) ? (event.resultSeed >>> 0) : 0,
    atT: due,
  };
}

/**
 * Consume a durable scheduled wake exactly once.  A due wake is an edge, not a level: callers
 * must store the returned record (or use `acknowledgeScheduledWorldWake`) before classifying the
 * next fixed step.  The operation is pure so save/reload and an uninterrupted catch-up take the
 * same branch for the same record, timestamp, and seed.
 */
export function consumeScheduledWorldWake(record, simTime, options = {}) {
  if (!record || typeof record !== 'object') {
    return { consumed: false, record: record || null, event: null };
  }
  const due = Number.isFinite(record.nextEventAtT) ? record.nextEventAtT : -1;
  const now = finite(simTime, -1);
  if (!(due >= 0) || now < due) {
    return { consumed: false, record: { ...record }, event: null };
  }

  const scheduled = Array.isArray(record.scheduledEventIds)
    ? record.scheduledEventIds.map((id) => String(id)).filter(Boolean)
    : [];
  const supplied = options.event && typeof options.event === 'object' ? options.event : null;
  const event = resolveScheduledWorldEvent({
    ...(supplied || {}),
    atT: Number.isFinite(supplied && supplied.atT) ? supplied.atT : due,
    id: supplied && supplied.id != null
      ? supplied.id
      : (scheduled.length === 1 ? scheduled[0] : null),
    resultSeed: Number.isFinite(supplied && supplied.resultSeed)
      ? supplied.resultSeed
      : (Number.isFinite(record.resultSeed) ? record.resultSeed : 0),
  }, { simTime: now });
  if (!event.resolved) return { consumed: false, record: { ...record }, event: null };

  // If an event id identifies the due wake, acknowledge only that id.  A list with no
  // corresponding due event is retained: it may contain future event identities not represented
  // by this legacy scalar wake timestamp.
  const eventId = event.eventId;
  let scheduledEventIds = scheduled;
  if (eventId) scheduledEventIds = scheduled.filter((id) => id !== eventId);
  const requestedNext = Number.isFinite(options.nextEventAtT)
    ? options.nextEventAtT
    : (Number.isFinite(supplied && supplied.nextEventAtT) ? supplied.nextEventAtT : -1);
  const nextEventAtT = requestedNext > now ? requestedNext : null;
  if (Array.isArray(options.nextScheduledEventIds)) {
    scheduledEventIds = options.nextScheduledEventIds.map((id) => String(id)).filter(Boolean);
  } else if (Array.isArray(supplied && supplied.nextScheduledEventIds)) {
    scheduledEventIds = supplied.nextScheduledEventIds.map((id) => String(id)).filter(Boolean);
  }
  return {
    consumed: true,
    event,
    record: {
      ...record,
      nextEventAtT,
      scheduledEventIds,
      lastObservedT: Math.max(Number.isFinite(record.lastObservedT) ? record.lastObservedT : 0, now),
    },
  };
}

/**
 * Mutating convenience for a live record bag.  World/activity code uses this at the owner-view
 * boundary so the live activity stamp and its durable counterpart cannot disagree about whether a
 * wake is still pending.
 */
export function acknowledgeScheduledWorldWake(record, simTime, options = {}) {
  const result = consumeScheduledWorldWake(record, simTime, options);
  if (!result.consumed || !record || typeof record !== 'object') return result;
  Object.assign(record, result.record);
  return { ...result, record };
}
