// Prospector origin — deterministic state, save shape, and migration.
// Owns only state.careers.origins.prospector (or ensure path). Never writes cargo/credits.

import {
  PROSPECTOR_ORIGIN_ID,
  PROSPECTOR_ORIGIN_SCHEMA_ID,
  PROSPECTOR_ORIGIN_SCHEMA_VERSION,
  PROSPECTOR_REWARD,
  PROSPECTOR_STATUS,
  PROSPECTOR_STEP_IDS,
  PROSPECTOR_STEP_STATUS,
  PROSPECTOR_STEPS,
} from './prospectorOriginDefs.js';

function finiteOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function freshStep(stepId) {
  const def = PROSPECTOR_STEPS[stepId];
  return {
    id: stepId,
    index: def ? def.index : -1,
    status: PROSPECTOR_STEP_STATUS.PENDING,
    attempts: 0,
    failCount: 0,
    recoveryCount: 0,
    startedAt: null,
    completedAt: null,
    lastFailureId: null,
    lastRecoveryId: null,
    // Step-specific counters (kept flat for easy serialize).
    appraisals: 0,
    bestGrade: null,
    depositId: null,
    oreCollected: 0,
    riskEvents: 0,
    tetherLatches: 0,
    soldQty: 0,
    soldCredits: 0,
  };
}

/** Create a brand-new origin blob (pure). */
export function createProspectorOriginState(simTime = 0) {
  const steps = Object.create(null);
  for (const id of PROSPECTOR_STEP_IDS) steps[id] = freshStep(id);
  return {
    schemaId: PROSPECTOR_ORIGIN_SCHEMA_ID,
    schemaVersion: PROSPECTOR_ORIGIN_SCHEMA_VERSION,
    originId: PROSPECTOR_ORIGIN_ID,
    binding: false,
    status: PROSPECTOR_STATUS.IDLE,
    stepIndex: -1,
    activeStepId: null,
    steps,
    firstDockAt: null,
    firstDockStationId: null,
    offerCount: 0,
    lastOfferAt: null,
    lastDeclineAt: null,
    acceptedAt: null,
    completedAt: null,
    abandonedAt: null,
    rewardGranted: false,
    reward: {
      credits: PROSPECTOR_REWARD.credits,
      markId: PROSPECTOR_REWARD.markId,
      grossValueCr: PROSPECTOR_REWARD.grossValueCr,
      grantedAt: null,
    },
    // Soft marks for UI / peer careers (never exclusive locks).
    marks: [],
    // Quantities produced by player mining while this origin is active.
    // Sell progression consumes this ledger instead of trusting any cmdty_* sale.
    minedOre: {},
    // Ledger of deterministic recovery events (capped).
    recoveryLog: [],
    createdAt: finiteOr(simTime, 0),
    updatedAt: finiteOr(simTime, 0),
  };
}

function clampStep(step, stepId) {
  const base = freshStep(stepId);
  if (!step || typeof step !== 'object') return base;
  return {
    ...base,
    ...step,
    id: stepId,
    index: base.index,
    status: typeof step.status === 'string' ? step.status : base.status,
    attempts: Math.max(0, Math.floor(finiteOr(step.attempts, 0))),
    failCount: Math.max(0, Math.floor(finiteOr(step.failCount, 0))),
    recoveryCount: Math.max(0, Math.floor(finiteOr(step.recoveryCount, 0))),
    appraisals: Math.max(0, Math.floor(finiteOr(step.appraisals, 0))),
    oreCollected: Math.max(0, Math.floor(finiteOr(step.oreCollected, 0))),
    riskEvents: Math.max(0, Math.floor(finiteOr(step.riskEvents, 0))),
    tetherLatches: Math.max(0, Math.floor(finiteOr(step.tetherLatches, 0))),
    soldQty: Math.max(0, Math.floor(finiteOr(step.soldQty, 0))),
    soldCredits: Math.max(0, Math.floor(finiteOr(step.soldCredits, 0))),
    bestGrade: step.bestGrade == null ? null : String(step.bestGrade),
    depositId: step.depositId == null ? null : step.depositId,
    startedAt: step.startedAt == null ? null : finiteOr(step.startedAt, null),
    completedAt: step.completedAt == null ? null : finiteOr(step.completedAt, null),
    lastFailureId: step.lastFailureId == null ? null : String(step.lastFailureId),
    lastRecoveryId: step.lastRecoveryId == null ? null : String(step.lastRecoveryId),
  };
}

/** Normalize any blob into a valid schema v1 object. */
export function normalizeProspectorOriginState(raw, simTime = 0) {
  const fresh = createProspectorOriginState(simTime);
  if (!raw || typeof raw !== 'object') return fresh;
  const steps = Object.create(null);
  for (const id of PROSPECTOR_STEP_IDS) {
    steps[id] = clampStep(raw.steps && raw.steps[id], id);
  }
  const marks = Array.isArray(raw.marks)
    ? raw.marks.map((m) => String(m)).filter(Boolean)
    : [];
  const recoveryLog = Array.isArray(raw.recoveryLog)
    ? raw.recoveryLog.slice(-24).map((entry) => ({
      at: finiteOr(entry && entry.at, 0),
      stepId: entry && entry.stepId != null ? String(entry.stepId) : null,
      failureId: entry && entry.failureId != null ? String(entry.failureId) : null,
      recoveryId: entry && entry.recoveryId != null ? String(entry.recoveryId) : null,
    }))
    : [];
  const minedOre = {};
  if (raw.minedOre && typeof raw.minedOre === 'object' && !Array.isArray(raw.minedOre)) {
    for (const [commodityId, qty] of Object.entries(raw.minedOre)) {
      const n = Math.max(0, Math.floor(finiteOr(qty, 0)));
      if (commodityId && n > 0) minedOre[String(commodityId)] = n;
    }
  }
  return {
    ...fresh,
    ...raw,
    schemaId: PROSPECTOR_ORIGIN_SCHEMA_ID,
    schemaVersion: PROSPECTOR_ORIGIN_SCHEMA_VERSION,
    originId: PROSPECTOR_ORIGIN_ID,
    binding: false,
    status: typeof raw.status === 'string' ? raw.status : fresh.status,
    stepIndex: Math.max(-1, Math.min(PROSPECTOR_STEP_IDS.length - 1, Math.floor(finiteOr(raw.stepIndex, -1)))),
    activeStepId: raw.activeStepId == null ? null : String(raw.activeStepId),
    steps,
    firstDockAt: raw.firstDockAt == null ? null : finiteOr(raw.firstDockAt, null),
    firstDockStationId: raw.firstDockStationId == null ? null : String(raw.firstDockStationId),
    offerCount: Math.max(0, Math.floor(finiteOr(raw.offerCount, 0))),
    lastOfferAt: raw.lastOfferAt == null ? null : finiteOr(raw.lastOfferAt, null),
    lastDeclineAt: raw.lastDeclineAt == null ? null : finiteOr(raw.lastDeclineAt, null),
    acceptedAt: raw.acceptedAt == null ? null : finiteOr(raw.acceptedAt, null),
    completedAt: raw.completedAt == null ? null : finiteOr(raw.completedAt, null),
    abandonedAt: raw.abandonedAt == null ? null : finiteOr(raw.abandonedAt, null),
    rewardGranted: !!raw.rewardGranted,
    reward: {
      credits: PROSPECTOR_REWARD.credits,
      markId: PROSPECTOR_REWARD.markId,
      grossValueCr: PROSPECTOR_REWARD.grossValueCr,
      grantedAt: raw.reward && raw.reward.grantedAt != null
        ? finiteOr(raw.reward.grantedAt, null)
        : null,
    },
    marks,
    minedOre,
    recoveryLog,
    createdAt: finiteOr(raw.createdAt, fresh.createdAt),
    updatedAt: finiteOr(raw.updatedAt, simTime),
  };
}

/**
 * Migrate older blobs → current schema. Currently identity for v1;
 * unknown schemaVersion is still coerced via normalize.
 */
export function migrateProspectorOriginState(raw, simTime = 0) {
  if (!raw || typeof raw !== 'object') return createProspectorOriginState(simTime);
  const version = Math.floor(finiteOr(raw.schemaVersion, 0));
  // Future: if (version < 2) { ... }
  if (version > PROSPECTOR_ORIGIN_SCHEMA_VERSION) {
    // Forward-compat: clamp unknown future fields through normalize.
    return normalizeProspectorOriginState(raw, simTime);
  }
  return normalizeProspectorOriginState(raw, simTime);
}

/**
 * Ensure state.careers.origins.prospector exists and is shape-valid.
 * Mutates in place when present so callers holding a reference stay live
 * (event handlers must not see a replaced object mid-mutation).
 */
export function ensureProspectorOriginState(state, simTime) {
  if (!state || typeof state !== 'object') return null;
  if (!state.careers || typeof state.careers !== 'object') state.careers = {};
  if (!state.careers.origins || typeof state.careers.origins !== 'object') {
    state.careers.origins = {};
  }
  const t = simTime != null ? simTime : finiteOr(state.simTime, 0);
  const existing = state.careers.origins.prospector;
  if (!existing || typeof existing !== 'object') {
    state.careers.origins.prospector = createProspectorOriginState(t);
    return state.careers.origins.prospector;
  }
  // In-place field repair (preserve object identity).
  const normalized = migrateProspectorOriginState(existing, t);
  const own = state.careers.origins.prospector;
  for (const key of Object.keys(normalized)) {
    if (key === 'steps') {
      if (!own.steps || typeof own.steps !== 'object') own.steps = normalized.steps;
      else {
        for (const stepId of Object.keys(normalized.steps)) {
          if (!own.steps[stepId] || typeof own.steps[stepId] !== 'object') {
            own.steps[stepId] = normalized.steps[stepId];
          } else {
            // Only fill missing required fields; never clobber live counters.
            const src = normalized.steps[stepId];
            const dst = own.steps[stepId];
            for (const sk of Object.keys(src)) {
              if (dst[sk] === undefined) dst[sk] = src[sk];
            }
            dst.id = stepId;
            dst.index = src.index;
          }
        }
      }
      continue;
    }
    if (own[key] === undefined) own[key] = normalized[key];
  }
  own.schemaId = PROSPECTOR_ORIGIN_SCHEMA_ID;
  own.schemaVersion = PROSPECTOR_ORIGIN_SCHEMA_VERSION;
  own.originId = PROSPECTOR_ORIGIN_ID;
  own.binding = false;
  if (!Array.isArray(own.marks)) own.marks = [];
  if (!own.minedOre || typeof own.minedOre !== 'object' || Array.isArray(own.minedOre)) own.minedOre = {};
  if (!Array.isArray(own.recoveryLog)) own.recoveryLog = [];
  if (!own.reward || typeof own.reward !== 'object') {
    own.reward = normalized.reward;
  }
  return own;
}

/** Plain JSON clone for saveSystem.serialize delegation. */
export function serializeProspectorOrigin(state) {
  const own = state && state.careers && state.careers.origins
    ? state.careers.origins.prospector
    : null;
  if (!own) return null;
  const normalized = normalizeProspectorOriginState(own, finiteOr(state && state.simTime, 0));
  return JSON.parse(JSON.stringify(normalized));
}

/** Apply a save blob onto state (after load). */
export function deserializeProspectorOrigin(state, data) {
  if (!state) return null;
  if (!state.careers || typeof state.careers !== 'object') state.careers = {};
  if (!state.careers.origins || typeof state.careers.origins !== 'object') {
    state.careers.origins = {};
  }
  const t = finiteOr(state.simTime, 0);
  state.careers.origins.prospector = data
    ? migrateProspectorOriginState(data, t)
    : createProspectorOriginState(t);
  return state.careers.origins.prospector;
}

export function touchProspectorOrigin(own, simTime) {
  if (!own) return;
  own.updatedAt = finiteOr(simTime, own.updatedAt || 0);
}

export function appendRecoveryLog(own, entry, simTime) {
  if (!own) return;
  if (!Array.isArray(own.recoveryLog)) own.recoveryLog = [];
  own.recoveryLog.push({
    at: finiteOr(simTime, 0),
    stepId: entry.stepId || null,
    failureId: entry.failureId || null,
    recoveryId: entry.recoveryId || null,
  });
  if (own.recoveryLog.length > 24) own.recoveryLog.splice(0, own.recoveryLog.length - 24);
  touchProspectorOrigin(own, simTime);
}
