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
  const kinds = new Set(Object.values(INTENT_KIND));
  const kind = kinds.has(raw.kind) ? raw.kind : null;
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
    abstractTier: record.abstractTier || SIM_TIER.S2_ABSTRACT,
  };
}

export function advanceResourceBody(record, fromT, toT, context = {}) {
  if (!record || typeof record !== 'object') return null;
  const a = finite(fromT);
  const b = finite(toT);
  const dt = b - a;
  if (!(dt > 0)) return { ...record };
  const drifted = ballisticDrift(record.pos, record.vel, record.rot, record.angVel, dt);
  const policy = record.recoveryPolicy && typeof record.recoveryPolicy === 'object' ? record.recoveryPolicy : {};
  const oreMax = Number.isFinite(record.oreHpMax) ? record.oreHpMax : record.oreHp;
  const oreHp = regenerateVital(record.oreHp, oreMax, policy.oreRate, dt);
  const yieldRemainingU = regenerateVital(
    record.yieldRemainingU,
    Number.isFinite(record.yieldMaxU) ? record.yieldMaxU : record.yieldRemainingU,
    policy.yieldRate,
    dt,
  );
  return {
    ...record,
    pos: drifted.pos,
    vel: drifted.vel,
    rot: drifted.rot,
    angVel: drifted.angVel,
    oreHp,
    yieldRemainingU,
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
