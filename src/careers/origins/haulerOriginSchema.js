// Deterministic save/schema for the isolated Hauler origin chain (M3 candidate).
// Owns only state.careers.origins.hauler. Never writes credits/cargo/rep.

import {
  HAULER_CAREER_ID,
  HAULER_EXCLUSIVITY,
  HAULER_ORIGIN_ID,
  HAULER_SCHEMA_VERSION,
  HAULER_STEPS,
} from './haulerOriginData.js';

export const HAULER_ORIGIN_STATE_KEY = 'haulerOrigin';
export const HAULER_ORIGIN_PATH = 'careers.origins.hauler';

/** @typedef {'idle'|'offered'|'active'|'step_failed'|'completed'|'declined'} HaulerOriginStatus */

export function createHaulerOriginState() {
  return {
    schemaVersion: HAULER_SCHEMA_VERSION,
    originId: HAULER_ORIGIN_ID,
    careerId: HAULER_CAREER_ID,
    status: 'idle',
    stepIndex: 0,
    stepId: null,
    firstDockSeen: false,
    firstDockStationId: null,
    firstDockAtS: null,
    offeredAtS: null,
    acceptedAtS: null,
    declinedAtS: null,
    completedAtS: null,
    failedAtS: null,
    lastEventAtS: null,
    offerNonce: 0,
    attempt: 0,
    failureCount: 0,
    failuresByStep: Object.fromEntries(HAULER_STEPS.map((s) => [s.id, 0])),
    activeContract: null,
    marketLegs: { buy: null, sell: null },
    marketSnapshot: null,
    rewardsGranted: false,
    rewardReceipt: null,
    history: [],
    exclusivity: {
      exclusive: HAULER_EXCLUSIVITY.exclusive,
      blocksOtherOrigins: HAULER_EXCLUSIVITY.blocksOtherOrigins,
      allowsParallel: HAULER_EXCLUSIVITY.allowsParallel,
      peerCareers: HAULER_EXCLUSIVITY.peerCareers.slice(),
    },
    flags: {
      otherCareersAllowed: true,
      nonBinding: true,
      usesRealAuthorities: true,
    },
    rngSeed: 0,
  };
}

export function ensureCareersRoot(state) {
  if (!state || typeof state !== 'object') return null;
  if (!state.careers || typeof state.careers !== 'object' || Array.isArray(state.careers)) {
    state.careers = {};
  }
  if (!state.careers.origins || typeof state.careers.origins !== 'object'
    || Array.isArray(state.careers.origins)) {
    state.careers.origins = {};
  }
  if (!state.careers.origins.hauler && state.careers.haulerOrigin
    && typeof state.careers.haulerOrigin === 'object') {
    state.careers.origins.hauler = state.careers.haulerOrigin;
  }
  if (Object.prototype.hasOwnProperty.call(state.careers, 'haulerOrigin')) {
    delete state.careers.haulerOrigin;
  }
  return state.careers.origins;
}

export function ensureHaulerOriginState(state) {
  const root = ensureCareersRoot(state);
  if (!root) return null;
  if (!root.hauler || typeof root.hauler !== 'object') {
    root.hauler = createHaulerOriginState();
  } else {
    // migrate returns a normalized object — must reattach so mutations persist on state.
    root.hauler = migrateHaulerOriginState(root.hauler);
  }
  return root.hauler;
}

/**
 * Forward-compatible migration. Unknown future versions are accepted as-is after clamping.
 * Missing fields are filled from defaults without inventing progress.
 */
export function migrateHaulerOriginState(raw) {
  const base = createHaulerOriginState();
  if (!raw || typeof raw !== 'object') return base;
  const version = Number.isFinite(raw.schemaVersion) ? Math.floor(raw.schemaVersion) : 0;
  const out = { ...base, ...raw };
  out.schemaVersion = Math.max(version, HAULER_SCHEMA_VERSION) === version
    ? version
    : HAULER_SCHEMA_VERSION;
  // Prefer schema version stamp we understand; if older than 1, lift to 1.
  if (version < 1) out.schemaVersion = HAULER_SCHEMA_VERSION;

  out.originId = HAULER_ORIGIN_ID;
  out.careerId = HAULER_CAREER_ID;
  out.status = normalizeStatus(out.status);
  out.stepIndex = clampInt(out.stepIndex, 0, HAULER_STEPS.length - 1, 0);
  out.stepId = typeof out.stepId === 'string' ? out.stepId : null;
  out.firstDockSeen = !!out.firstDockSeen;
  out.offerNonce = clampInt(out.offerNonce, 0, 1e9, 0);
  out.attempt = clampInt(out.attempt, 0, 99, 0);
  out.failureCount = clampInt(out.failureCount, 0, 99, 0);
  out.failuresByStep = normalizeFailuresByStep(out.failuresByStep);
  out.activeContract = normalizeContract(out.activeContract);
  out.marketLegs = normalizeMarketLegs(out.marketLegs);
  out.marketSnapshot = out.marketSnapshot && typeof out.marketSnapshot === 'object'
    ? out.marketSnapshot
    : null;
  out.rewardsGranted = !!out.rewardsGranted;
  out.rewardReceipt = out.rewardReceipt && typeof out.rewardReceipt === 'object'
    ? out.rewardReceipt
    : null;
  out.history = Array.isArray(out.history) ? out.history.slice(-32) : [];
  out.exclusivity = {
    exclusive: false,
    blocksOtherOrigins: false,
    allowsParallel: true,
    peerCareers: HAULER_EXCLUSIVITY.peerCareers.slice(),
  };
  out.flags = {
    otherCareersAllowed: true,
    nonBinding: true,
    usesRealAuthorities: true,
  };
  out.rngSeed = (Number(out.rngSeed) >>> 0) || 0;
  return out;
}

export function serializeHaulerOriginState(state) {
  const own = ensureHaulerOriginState(state);
  if (!own) return null;
  // Structured clone via JSON for a pure save blob (deterministic key order not required by save).
  return JSON.parse(JSON.stringify(own));
}

export function applyHaulerOriginSaveBlob(state, blob) {
  const root = ensureCareersRoot(state);
  if (!root) return null;
  root.hauler = migrateHaulerOriginState(blob);
  return root.hauler;
}

/** Validate shape for contract harnesses. Returns { ok, errors[] }. */
export function validateHaulerOriginState(own) {
  const errors = [];
  if (!own || typeof own !== 'object') {
    return { ok: false, errors: ['missing state'] };
  }
  if (own.schemaVersion !== HAULER_SCHEMA_VERSION && own.schemaVersion < 1) {
    errors.push(`schemaVersion ${own.schemaVersion} unsupported`);
  }
  if (own.careerId !== HAULER_CAREER_ID) errors.push('careerId mismatch');
  if (own.originId !== HAULER_ORIGIN_ID) errors.push('originId mismatch');
  if (!normalizeStatus(own.status) || own.status !== normalizeStatus(own.status)) {
    errors.push(`status invalid: ${own.status}`);
  }
  if (own.exclusivity && own.exclusivity.blocksOtherOrigins) {
    errors.push('blocksOtherOrigins must be false (non-binding)');
  }
  if (own.flags && own.flags.otherCareersAllowed === false) {
    errors.push('otherCareersAllowed must remain true');
  }
  if (own.status === 'completed' && !own.rewardsGranted && own.rewardReceipt) {
    // allowed transitional; not an error
  }
  if (own.activeContract) {
    const c = own.activeContract;
    if (!c.missionId || !c.stepId) errors.push('activeContract missing missionId/stepId');
  }
  return { ok: errors.length === 0, errors };
}

function normalizeStatus(status) {
  const allowed = new Set(['idle', 'offered', 'active', 'step_failed', 'completed', 'declined']);
  return allowed.has(status) ? status : 'idle';
}

function clampInt(value, lo, hi, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function normalizeFailuresByStep(raw) {
  const out = Object.fromEntries(HAULER_STEPS.map((s) => [s.id, 0]));
  if (!raw || typeof raw !== 'object') return out;
  for (const step of HAULER_STEPS) {
    out[step.id] = clampInt(raw[step.id], 0, 99, 0);
  }
  return out;
}

function normalizeContract(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    offerId: raw.offerId == null ? null : String(raw.offerId),
    missionId: raw.missionId == null ? null : String(raw.missionId),
    stepId: String(raw.stepId || ''),
    stepIndex: clampInt(raw.stepIndex, 0, HAULER_STEPS.length - 1, 0),
    missionType: String(raw.missionType || 'cargo_delivery'),
    commodityId: String(raw.commodityId || ''),
    qty: clampInt(raw.qty, 0, 1e6, 0),
    originStationId: String(raw.originStationId || ''),
    originSectorId: String(raw.originSectorId || ''),
    destStationId: String(raw.destStationId || ''),
    destSectorId: String(raw.destSectorId || ''),
    reward_cr: clampInt(raw.reward_cr, 0, 1e9, 0),
    collateral_cr: clampInt(raw.collateral_cr, 0, 1e9, 0),
    riskTier: clampInt(raw.riskTier, 0, 4, 0),
    deadlineS: Number.isFinite(Number(raw.deadlineS)) ? Number(raw.deadlineS) : null,
    attempt: clampInt(raw.attempt, 0, 99, 0),
    teach: typeof raw.teach === 'string' ? raw.teach : '',
    marketTruth: raw.marketTruth && typeof raw.marketTruth === 'object' ? raw.marketTruth : null,
  };
}

function normalizeMarketLegs(raw) {
  const empty = { buy: null, sell: null };
  if (!raw || typeof raw !== 'object') return empty;
  return {
    buy: raw.buy && typeof raw.buy === 'object' ? { ...raw.buy } : null,
    sell: raw.sell && typeof raw.sell === 'object' ? { ...raw.sell } : null,
  };
}

export function pushHaulerHistory(own, entry, simTime) {
  if (!own || !entry) return;
  const row = {
    atS: Number.isFinite(simTime) ? simTime : 0,
    ...entry,
  };
  own.history = Array.isArray(own.history) ? own.history : [];
  own.history.push(row);
  if (own.history.length > 32) own.history.splice(0, own.history.length - 32);
  own.lastEventAtS = row.atS;
}
