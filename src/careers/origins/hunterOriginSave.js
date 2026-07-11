// M3 Hunter origin — deterministic save schema + migration (isolated candidate).
// Lead wires serialize into saveSystem; this module never touches shared save code.

import {
  HUNTER_ORIGIN_ID,
  HUNTER_ORIGIN_REWARD,
  HUNTER_ORIGIN_SCHEMA_VERSION,
  HUNTER_OFFER_STATUS,
  HUNTER_PHASE,
  stepDefAt,
} from './hunterOriginData.js';

function finiteNumber(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

/** Fresh runtime + save blob shape. */
export function createHunterOriginState(seed = 1) {
  const rngSeed = ((Number(seed) >>> 0) || 1) ^ 0x48_55_4e_54; // 'HUNT'
  return {
    schemaVersion: HUNTER_ORIGIN_SCHEMA_VERSION,
    careerId: HUNTER_ORIGIN_ID,
    // Non-binding: other careers may also be accepted; this flag is advisory only.
    exclusive: false,
    offer: {
      status: HUNTER_OFFER_STATUS.LATENT,
      offeredAtSimTime: null,
      firstDockStationId: null,
      firstDockSeen: false,
      declineCount: 0,
      acceptAtSimTime: null,
    },
    stepIndex: 0,
    stepId: null,
    phase: HUNTER_PHASE.IDLE,
    failure: null,
    target: {
      entityId: null,
      enemyTypeId: null,
      label: null,
      contactWord: null,
      doctrineId: null,
      lawful: false,
      legalBounty: false,
    },
    progress: {
      identifyConfirmed: false,
      pursuitContactTicks: 0,
      pursuitHeld: false,
      counterplayReady: false,
      counterplayResolved: false,
      cleanFinish: false,
    },
    reward: {
      granted: false,
      credits: HUNTER_ORIGIN_REWARD.credits,
      unlockId: HUNTER_ORIGIN_REWARD.unlockId,
      unlockLabel: HUNTER_ORIGIN_REWARD.unlockLabel,
      boardBias: { ...HUNTER_ORIGIN_REWARD.boardBias },
      grantedAtSimTime: null,
    },
    rngSeed: rngSeed >>> 0,
    history: [],
  };
}

export function ensureHunterOriginState(state, seed = 1) {
  if (!state || typeof state !== 'object') throw new TypeError('ensureHunterOriginState requires state');
  if (!state.careers || typeof state.careers !== 'object') state.careers = {};
  if (!state.careers.origins || typeof state.careers.origins !== 'object') state.careers.origins = {};
  if (!state.careers.origins.hunter && state.careers.hunterOrigin
    && typeof state.careers.hunterOrigin === 'object') {
    state.careers.origins.hunter = state.careers.hunterOrigin;
  }
  if (Object.prototype.hasOwnProperty.call(state.careers, 'hunterOrigin')) {
    delete state.careers.hunterOrigin;
  }
  if (!state.careers.origins.hunter || typeof state.careers.origins.hunter !== 'object') {
    state.careers.origins.hunter = createHunterOriginState(
      Number.isFinite(state.seed) ? state.seed : seed,
    );
  } else {
    state.careers.origins.hunter = migrateHunterOrigin(state.careers.origins.hunter, state.seed || seed);
  }
  return state.careers.origins.hunter;
}

export function getHunterOriginState(state) {
  return state && state.careers && state.careers.origins && state.careers.origins.hunter
    ? state.careers.origins.hunter
    : null;
}

/**
 * Normalize / migrate any blob into schema v1. Idempotent.
 * Unknown future fields are dropped; missing fields are filled.
 */
export function migrateHunterOrigin(blob, seed = 1) {
  const base = createHunterOriginState(seed);
  if (!blob || typeof blob !== 'object') return base;

  const version = Number.isInteger(blob.schemaVersion) ? blob.schemaVersion : 0;
  // v0 / missing → v1 fill. Future versions fall through the same normalizer.
  const src = version > HUNTER_ORIGIN_SCHEMA_VERSION ? blob : blob;

  const offer = src.offer && typeof src.offer === 'object' ? src.offer : {};
  const target = src.target && typeof src.target === 'object' ? src.target : {};
  const progress = src.progress && typeof src.progress === 'object' ? src.progress : {};
  const reward = src.reward && typeof src.reward === 'object' ? src.reward : {};
  const failure = src.failure && typeof src.failure === 'object' ? src.failure : null;

  const stepIndex = Number.isInteger(src.stepIndex) ? Math.max(0, Math.min(3, src.stepIndex)) : 0;
  const step = stepDefAt(stepIndex);

  return {
    schemaVersion: HUNTER_ORIGIN_SCHEMA_VERSION,
    careerId: HUNTER_ORIGIN_ID,
    exclusive: false,
    offer: {
      status: normalizeOfferStatus(offer.status),
      offeredAtSimTime: offer.offeredAtSimTime == null ? null : finiteNumber(offer.offeredAtSimTime, null),
      firstDockStationId: offer.firstDockStationId == null ? null : String(offer.firstDockStationId),
      firstDockSeen: !!offer.firstDockSeen,
      declineCount: Math.max(0, finiteNumber(offer.declineCount, 0) | 0),
      acceptAtSimTime: offer.acceptAtSimTime == null ? null : finiteNumber(offer.acceptAtSimTime, null),
    },
    stepIndex,
    stepId: step ? step.id : (src.stepId == null ? null : String(src.stepId)),
    phase: normalizePhase(src.phase),
    failure: failure ? {
      code: String(failure.code || 'unknown'),
      reason: String(failure.reason || ''),
      atSimTime: finiteNumber(failure.atSimTime, 0),
      recoveryHint: String(failure.recoveryHint || ''),
    } : null,
    target: {
      entityId: target.entityId == null ? null : target.entityId,
      enemyTypeId: target.enemyTypeId == null ? null : String(target.enemyTypeId),
      label: target.label == null ? null : String(target.label),
      contactWord: target.contactWord == null ? null : String(target.contactWord),
      doctrineId: target.doctrineId == null ? null : String(target.doctrineId),
      lawful: !!target.lawful,
      legalBounty: !!target.legalBounty,
    },
    progress: {
      identifyConfirmed: !!progress.identifyConfirmed,
      pursuitContactTicks: Math.max(0, finiteNumber(progress.pursuitContactTicks, 0) | 0),
      pursuitHeld: !!progress.pursuitHeld,
      counterplayReady: !!progress.counterplayReady,
      counterplayResolved: !!progress.counterplayResolved,
      cleanFinish: !!progress.cleanFinish,
    },
    reward: {
      granted: !!reward.granted,
      credits: Math.max(0, finiteNumber(reward.credits, HUNTER_ORIGIN_REWARD.credits) | 0),
      unlockId: String(reward.unlockId || HUNTER_ORIGIN_REWARD.unlockId),
      unlockLabel: String(reward.unlockLabel || HUNTER_ORIGIN_REWARD.unlockLabel),
      boardBias: {
        bounty_hunt: finiteNumber(
          reward.boardBias && reward.boardBias.bounty_hunt,
          HUNTER_ORIGIN_REWARD.boardBias.bounty_hunt,
        ),
        patrol_clear: finiteNumber(
          reward.boardBias && reward.boardBias.patrol_clear,
          HUNTER_ORIGIN_REWARD.boardBias.patrol_clear,
        ),
      },
      grantedAtSimTime: reward.grantedAtSimTime == null ? null : finiteNumber(reward.grantedAtSimTime, null),
    },
    rngSeed: ((finiteNumber(src.rngSeed, base.rngSeed) >>> 0) || base.rngSeed) >>> 0,
    history: Array.isArray(src.history)
      ? src.history.slice(-32).map((h) => ({
        at: finiteNumber(h && h.at, 0),
        kind: String((h && h.kind) || ''),
        detail: h && h.detail != null ? String(h.detail) : '',
      }))
      : [],
  };
}

export function serializeHunterOrigin(state) {
  const own = getHunterOriginState(state) || createHunterOriginState(state && state.seed);
  const migrated = migrateHunterOrigin(own, state && state.seed);
  return clonePlain(migrated);
}

export function deserializeHunterOrigin(blob, state, seed = 1) {
  if (!state || typeof state !== 'object') throw new TypeError('deserializeHunterOrigin requires state');
  if (!state.careers || typeof state.careers !== 'object') state.careers = {};
  if (!state.careers.origins || typeof state.careers.origins !== 'object') state.careers.origins = {};
  state.careers.origins.hunter = migrateHunterOrigin(blob, Number.isFinite(state.seed) ? state.seed : seed);
  if (Object.prototype.hasOwnProperty.call(state.careers, 'hunterOrigin')) delete state.careers.hunterOrigin;
  return state.careers.origins.hunter;
}

function normalizeOfferStatus(status) {
  const s = String(status || HUNTER_OFFER_STATUS.LATENT);
  const allowed = new Set(Object.values(HUNTER_OFFER_STATUS));
  return allowed.has(s) ? s : HUNTER_OFFER_STATUS.LATENT;
}

function normalizePhase(phase) {
  const p = String(phase || HUNTER_PHASE.IDLE);
  const allowed = new Set(Object.values(HUNTER_PHASE));
  return allowed.has(p) ? p : HUNTER_PHASE.IDLE;
}

/** JSON-schema-ish descriptor for contract harnesses (no runtime dep). */
export function hunterOriginSaveSchema() {
  return Object.freeze({
    id: 'spaceface.hunterOrigin.v1',
    schemaVersion: HUNTER_ORIGIN_SCHEMA_VERSION,
    careerId: HUNTER_ORIGIN_ID,
    exclusive: false,
    required: Object.freeze([
      'schemaVersion', 'careerId', 'exclusive', 'offer', 'stepIndex', 'phase',
      'target', 'progress', 'reward', 'rngSeed', 'history',
    ]),
    offerStatus: Object.freeze(Object.values(HUNTER_OFFER_STATUS)),
    phases: Object.freeze(Object.values(HUNTER_PHASE)),
    rewardCreditsMax: 900,
    notes: 'Non-binding origin; credits granted only via economy:grantCredits intent.',
  });
}
