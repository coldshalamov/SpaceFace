// Deterministic save/schema for Campaign 47-A sidecar metadata (M5 task 1).
// Owns only state.story.campaign47a as non-cursor metadata.
// Never writes credits/cargo/rep/heat or state.story.beatIndex/branch/endgame*.

import {
  BEAT_STATUS,
  CAMPAIGN_BEATS,
  CAMPAIGN_ID,
  CAMPAIGN_SCHEMA_VERSION,
  CAMPAIGN_STATE_KEY,
  DISCARDED_OWNERSHIP_FIELDS,
  ENDINGS,
  OUTPOST_SPECIALIZATIONS,
  canonicalOutpostSpecId,
} from './campaignData.js';

export { CAMPAIGN_STATE_KEY };

const VALID_BEAT_STATUS = new Set(Object.values(BEAT_STATUS));
const VALID_ENDING = new Set(ENDINGS.map((e) => e.id));
const VALID_OUTPOST = new Set(OUTPOST_SPECIALIZATIONS.map((o) => o.id));
// open_frontier = explicit non-ending sandbox continuation (M5 endings module).
const VALID_SANDBOX_MODE = new Set([
  ...ENDINGS.map((e) => e.sandbox.mode),
  'open_frontier',
]);

/**
 * Sidecar metadata only.
 * Forbidden ownership fields (cursor/ending) are never created here.
 */
export function createCampaign47aState() {
  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    campaignId: CAMPAIGN_ID,
    /** Fail/recover status for the observed canonical beat — not a progression cursor. */
    beatStatus: BEAT_STATUS.IDLE,
    /** Last observed state.story.beatIndex used to key stepProgress (read cache, not writer). */
    observedBeatIndex: null,
    /**
     * Per-beat ordered step completion: { [beatIndex]: { completed: string[], updatedAtS } }
     * Keyed to the observed canonical beat; never advances live beatIndex.
     */
    stepProgress: {},
    outpostSpecializationId: null,
    outpostsOwned: [],
    /** Meta flags only (outpost tags, soft notes) — not beat_*_done spine flags. */
    flags: {},
    /** Optional observed sandbox mode vocabulary after live ending (adapter-set). */
    sandboxMode: null,
    attempt: 0,
    failureCount: 0,
    failuresByBeat: Object.fromEntries(CAMPAIGN_BEATS.map((b) => [String(b.beat), 0])),
    lastFailedBeat: null,
    failedAtS: null,
    recoveredAtS: null,
    lastEventAtS: null,
    activeContract: null,
    receipts: [],
    choiceLog: [],
    history: [],
    rngSeed: 0,
  };
}

export function ensureStoryRoot(state) {
  if (!state || typeof state !== 'object') return null;
  if (!state.story || typeof state.story !== 'object' || Array.isArray(state.story)) {
    state.story = {};
  }
  return state.story;
}

export function ensureCampaign47aState(state) {
  const story = ensureStoryRoot(state);
  if (!story) return null;
  if (!story.campaign47a || typeof story.campaign47a !== 'object') {
    story.campaign47a = createCampaign47aState();
    return story.campaign47a;
  }
  // Migrate in place so callers holding `own` keep a live reference across nested ensures.
  const migrated = migrateCampaign47aState(story.campaign47a);
  const target = story.campaign47a;
  if (target !== migrated) {
    for (const key of Object.keys(target)) {
      if (!(key in migrated)) delete target[key];
    }
    Object.assign(target, migrated);
  } else {
    // Always strip ownership keys if somehow reintroduced.
    stripOwnershipFields(target);
  }
  return target;
}

/**
 * Forward-compatible migration.
 * v1 isolated dual-spine blobs: discard cursor/ending ownership; keep safe meta.
 * Does not invent completion, endings, or branch choices.
 */
export function migrateCampaign47aState(raw) {
  const base = createCampaign47aState();
  if (!raw || typeof raw !== 'object') return base;

  const version = Number.isFinite(raw.schemaVersion) ? Math.floor(raw.schemaVersion) : 0;

  // Preserve safe metadata from any version.
  const out = { ...base };
  out.campaignId = CAMPAIGN_ID;
  out.schemaVersion = CAMPAIGN_SCHEMA_VERSION;
  out.beatStatus = normalizeBeatStatus(raw.beatStatus);
  out.observedBeatIndex = Number.isFinite(raw.observedBeatIndex)
    ? clampInt(raw.observedBeatIndex, 0, CAMPAIGN_BEATS.length - 1, null)
    : null;
  // If v1 only had beatIndex, use it as observation cache (not ownership write to state.story).
  if (out.observedBeatIndex == null && Number.isFinite(raw.beatIndex) && version < 2) {
    out.observedBeatIndex = clampInt(raw.beatIndex, 0, CAMPAIGN_BEATS.length - 1, null);
  }
  out.stepProgress = normalizeStepProgress(raw.stepProgress);
  out.outpostSpecializationId = normalizeOutpost(raw.outpostSpecializationId);
  out.outpostsOwned = normalizeOutpostList(raw.outpostsOwned);
  out.flags = normalizeMetaFlags(raw.flags);
  out.sandboxMode = normalizeSandboxMode(raw.sandboxMode, raw.sandbox, raw.endingId);
  out.attempt = clampInt(raw.attempt, 0, 999, 0);
  out.failureCount = clampInt(raw.failureCount, 0, 999, 0);
  out.failuresByBeat = normalizeFailuresByBeat(raw.failuresByBeat);
  out.lastFailedBeat = Number.isFinite(raw.lastFailedBeat) ? Math.floor(raw.lastFailedBeat) : null;
  out.failedAtS = Number.isFinite(raw.failedAtS) ? raw.failedAtS : null;
  out.recoveredAtS = Number.isFinite(raw.recoveredAtS) ? raw.recoveredAtS : null;
  out.lastEventAtS = Number.isFinite(raw.lastEventAtS) ? raw.lastEventAtS : null;
  out.activeContract = normalizeContract(raw.activeContract);
  out.receipts = Array.isArray(raw.receipts) ? normalizeOutpostRecords(raw.receipts.slice(-64), true) : [];
  out.choiceLog = Array.isArray(raw.choiceLog) ? filterSafeChoiceLog(raw.choiceLog) : [];
  out.history = Array.isArray(raw.history) ? normalizeOutpostRecords(raw.history.slice(-48)) : [];
  out.rngSeed = (Number(raw.rngSeed) >>> 0) || 0;

  stripOwnershipFields(out);
  return out;
}

export function serializeCampaign47aState(own) {
  const migrated = migrateCampaign47aState(own);
  return {
    schemaVersion: migrated.schemaVersion,
    campaignId: migrated.campaignId,
    beatStatus: migrated.beatStatus,
    observedBeatIndex: migrated.observedBeatIndex,
    stepProgress: cloneStepProgress(migrated.stepProgress),
    outpostSpecializationId: migrated.outpostSpecializationId,
    outpostsOwned: migrated.outpostsOwned.slice(),
    flags: { ...migrated.flags },
    sandboxMode: migrated.sandboxMode,
    attempt: migrated.attempt,
    failureCount: migrated.failureCount,
    failuresByBeat: { ...migrated.failuresByBeat },
    lastFailedBeat: migrated.lastFailedBeat,
    failedAtS: migrated.failedAtS,
    recoveredAtS: migrated.recoveredAtS,
    lastEventAtS: migrated.lastEventAtS,
    activeContract: migrated.activeContract ? { ...migrated.activeContract } : null,
    receipts: migrated.receipts.map((r) => ({ ...r })),
    choiceLog: migrated.choiceLog.map((c) => ({ ...c })),
    history: migrated.history.map((h) => ({ ...h })),
    rngSeed: migrated.rngSeed,
  };
}

export function applyCampaign47aSaveBlob(state, blob) {
  const story = ensureStoryRoot(state);
  if (!story) return null;
  story.campaign47a = migrateCampaign47aState(blob);
  return story.campaign47a;
}

export function validateCampaign47aState(own) {
  const errors = [];
  if (!own || typeof own !== 'object') {
    return { ok: false, errors: ['missing_state'] };
  }
  if (own.campaignId !== CAMPAIGN_ID) errors.push('bad_campaign_id');
  if (!Number.isFinite(own.schemaVersion) || own.schemaVersion < 2) {
    errors.push(`bad_schema_version:${own.schemaVersion}`);
  }
  if (!VALID_BEAT_STATUS.has(own.beatStatus)) errors.push(`bad_beatStatus:${own.beatStatus}`);
  if (own.observedBeatIndex != null) {
    if (!Number.isFinite(own.observedBeatIndex) || own.observedBeatIndex < 0 || own.observedBeatIndex > 7) {
      errors.push(`bad_observedBeatIndex:${own.observedBeatIndex}`);
    }
  }
  if (own.outpostSpecializationId != null && !VALID_OUTPOST.has(own.outpostSpecializationId)) {
    errors.push(`bad_outpost:${own.outpostSpecializationId}`);
  }
  if (own.sandboxMode != null && !VALID_SANDBOX_MODE.has(own.sandboxMode)) {
    errors.push(`bad_sandboxMode:${own.sandboxMode}`);
  }
  if (!Array.isArray(own.receipts)) errors.push('receipts_not_array');
  if (!Array.isArray(own.choiceLog)) errors.push('choiceLog_not_array');
  if (!own.stepProgress || typeof own.stepProgress !== 'object') errors.push('stepProgress_not_object');

  // Ownership fields must not be present on valid sidecar blobs.
  for (const key of DISCARDED_OWNERSHIP_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(own, key) && own[key] !== undefined) {
      errors.push(`forbidden_ownership_field:${key}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function pushCampaignHistory(own, entry, simTime = 0) {
  if (!own || typeof own !== 'object') return;
  const t = Number(simTime) || 0;
  own.lastEventAtS = t;
  if (!Array.isArray(own.history)) own.history = [];
  own.history.push({ ...entry, atS: t });
  if (own.history.length > 48) own.history.splice(0, own.history.length - 48);
}

export function pushCampaignReceipt(own, receipt) {
  if (!own || typeof own !== 'object') return;
  if (!Array.isArray(own.receipts)) own.receipts = [];
  own.receipts.push(receipt);
  if (own.receipts.length > 64) own.receipts.splice(0, own.receipts.length - 64);
}

export function pushChoiceLog(own, choice, simTime = 0) {
  if (!own || typeof own !== 'object') return;
  if (!Array.isArray(own.choiceLog)) own.choiceLog = [];
  own.choiceLog.push({ ...choice, atS: Number(simTime) || 0 });
  if (own.choiceLog.length > 32) own.choiceLog.splice(0, own.choiceLog.length - 32);
}

// ── normalizers ────────────────────────────────────────────────────────────

function stripOwnershipFields(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of DISCARDED_OWNERSHIP_FIELDS) {
    if (key in obj) delete obj[key];
  }
}

function normalizeBeatStatus(v) {
  // Map v1 statuses to sidecar vocabulary.
  if (v === 'failed') return BEAT_STATUS.FAILED;
  if (v === 'active' || v === 'available') return BEAT_STATUS.TRACKING;
  if (v === 'complete' || v === 'locked') return BEAT_STATUS.IDLE;
  return VALID_BEAT_STATUS.has(v) ? v : BEAT_STATUS.IDLE;
}

function normalizeOutpost(v) {
  const canonical = canonicalOutpostSpecId(v);
  return VALID_OUTPOST.has(canonical) ? canonical : null;
}

function normalizeOutpostList(list) {
  if (!Array.isArray(list)) return [];
  // Keep the most recent truthful occurrence when legacy aliases collapse to one physical id.
  const out = [];
  const seen = new Set();
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const id = normalizeOutpost(list[index]);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.unshift(id);
    }
  }
  return out;
}

function normalizeSandboxMode(mode, sandboxObj, endingId) {
  if (typeof mode === 'string' && VALID_SANDBOX_MODE.has(mode)) return mode;
  if (sandboxObj && typeof sandboxObj === 'object' && typeof sandboxObj.mode === 'string') {
    if (VALID_SANDBOX_MODE.has(sandboxObj.mode)) return sandboxObj.mode;
  }
  // Do not invent ending ownership; only recover known sandbox mode vocabulary.
  if (endingId && VALID_ENDING.has(endingId)) {
    const def = ENDINGS.find((e) => e.id === endingId);
    if (def) return def.sandbox.mode;
  }
  return null;
}

function normalizeMetaFlags(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = { ...raw };
  // Drop spine completion flags that duplicated missions ownership.
  for (const key of Object.keys(out)) {
    if (/^beat_\d+_done$/.test(key) || key === 'endgame' || /^ending_[A-E]$/.test(key)) {
      delete out[key];
    }
  }
  return out;
}

function normalizeStepProgress(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const beat = clampInt(k, 0, 7, null);
    if (beat == null || !v || typeof v !== 'object') continue;
    const completed = Array.isArray(v.completed)
      ? v.completed.filter((id) => typeof id === 'string')
      : [];
    out[String(beat)] = {
      completed: completed.slice(),
      updatedAtS: Number.isFinite(v.updatedAtS) ? v.updatedAtS : null,
    };
  }
  return out;
}

function cloneStepProgress(sp) {
  const out = {};
  for (const [k, v] of Object.entries(sp || {})) {
    out[k] = {
      completed: Array.isArray(v.completed) ? v.completed.slice() : [],
      updatedAtS: v.updatedAtS ?? null,
    };
  }
  return out;
}

function normalizeFailuresByBeat(raw) {
  const out = Object.fromEntries(CAMPAIGN_BEATS.map((b) => [String(b.beat), 0]));
  if (!raw || typeof raw !== 'object') return out;
  for (const b of CAMPAIGN_BEATS) {
    const k = String(b.beat);
    out[k] = clampInt(raw[k], 0, 99, 0);
  }
  return out;
}

function normalizeContract(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    missionId: typeof raw.missionId === 'string' ? raw.missionId : null,
    observedBeatIndex: Number.isFinite(raw.observedBeatIndex)
      ? Math.floor(raw.observedBeatIndex)
      : (Number.isFinite(raw.beatIndex) ? Math.floor(raw.beatIndex) : null),
    stepId: typeof raw.stepId === 'string' ? raw.stepId : null,
    missionType: typeof raw.missionType === 'string' ? raw.missionType : null,
    attempt: clampInt(raw.attempt, 0, 999, 0),
  };
}

function filterSafeChoiceLog(list) {
  // Keep outpost / meta choices; drop v1 ending ownership log entries as ownership (keep as history noise capped).
  return normalizeOutpostRecords(list.slice(-32)).map((c) => {
    if (!c || typeof c !== 'object') return c;
    const copy = { ...c };
    // Strip any nested ending-application claims.
    delete copy.appliedCredits;
    delete copy.appliedRep;
    return copy;
  });
}

function normalizeOutpostRecords(records, receiptLike = false) {
  return records.map((entry) => normalizeOutpostRecord(entry, receiptLike));
}

function normalizeOutpostRecord(entry, receiptLike = false) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  const copy = { ...entry };
  const canonical = normalizeOutpost(copy.claimSpecId || copy.specializationId);
  if (canonical) {
    copy.specializationId = canonical;
    if (copy.claimSpecId != null || copy.kind === 'outpost_spec') copy.claimSpecId = canonical;
    if (receiptLike && copy.kind === 'outpost_spec') {
      const def = OUTPOST_SPECIALIZATIONS.find((candidate) => candidate.id === canonical);
      copy.consequenceFlags = def ? def.consequenceFlags.slice() : [];
    }
  }
  if (Array.isArray(copy.intents)) {
    copy.intents = copy.intents.map((intent) => {
      if (!intent || typeof intent !== 'object') return intent;
      const payload = normalizeOutpostRecord(intent.payload, false);
      return { ...intent, payload };
    });
  }
  return copy;
}

function clampInt(v, min, max, fallback) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
