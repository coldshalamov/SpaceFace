// Versioned career-ladder save schema (CL-00).
// Owns only state.careers.ladders + serialized data.careerLadders.
// Safe defaulting / forward-compatible migration. Never writes economy/faction/heat/cargo/story.
//
// Continue / live CURRENT_VERSION=11:
// - Missing data.careerLadders on a v11 envelope is intentional-safe: deserializeCareerLadders /
//   migrateCareerLaddersBlob(null) seeds an empty container. No saveVersion v12 bump in this packet
//   (M2 C2 owns live v11; saveVersion.js is out of write allowlist).
// - Do not claim historical v9→v10 as the live ladder migration path.

import {
  CAREER_LADDERS_SCHEMA_ID,
  CAREER_LADDERS_SCHEMA_VERSION,
  HISTORY_CAP,
  LADDER_STATUS,
  META_KEY,
  STEP_STATUS,
  attemptMultiplier,
  clampInt,
  clonePlain,
  computeLadderRngSeed,
  createLadderInstanceState,
  masterSeedOf,
  normalizeLadderStatus,
  normalizeStepStatus,
} from './ladderShared.js';

export {
  CAREER_LADDERS_SCHEMA_ID,
  CAREER_LADDERS_SCHEMA_VERSION,
  META_KEY,
};

export function createLaddersMeta() {
  return {
    schemaId: CAREER_LADDERS_SCHEMA_ID,
    schemaVersion: CAREER_LADDERS_SCHEMA_VERSION,
    skillProof: {},
    registeredIds: [],
  };
}

/** Empty save-container seed (migrations + missing-blob default). */
export function createEmptyCareerLaddersBlob() {
  return {
    schemaId: CAREER_LADDERS_SCHEMA_ID,
    schemaVersion: CAREER_LADDERS_SCHEMA_VERSION,
    ladders: {
      [META_KEY]: createLaddersMeta(),
    },
  };
}

export function ensureCareersRoot(state) {
  if (!state || typeof state !== 'object') return null;
  if (!state.careers || typeof state.careers !== 'object' || Array.isArray(state.careers)) {
    state.careers = {};
  }
  return state.careers;
}

/**
 * Ensure state.careers.ladders exists with meta. Does not invent per-career progress.
 * Preserves peer keys under state.careers (origins, etc.).
 */
export function ensureCareerLaddersState(state) {
  const root = ensureCareersRoot(state);
  if (!root) return null;
  if (!root.ladders || typeof root.ladders !== 'object' || Array.isArray(root.ladders)) {
    root.ladders = { [META_KEY]: createLaddersMeta() };
  }
  if (!root.ladders[META_KEY] || typeof root.ladders[META_KEY] !== 'object') {
    root.ladders[META_KEY] = createLaddersMeta();
  } else {
    root.ladders[META_KEY] = migrateMeta(root.ladders[META_KEY]);
  }
  return root.ladders;
}

function migrateMeta(raw) {
  const base = createLaddersMeta();
  if (!raw || typeof raw !== 'object') return base;
  return {
    schemaId: CAREER_LADDERS_SCHEMA_ID,
    schemaVersion: CAREER_LADDERS_SCHEMA_VERSION,
    skillProof: (raw.skillProof && typeof raw.skillProof === 'object' && !Array.isArray(raw.skillProof))
      ? { ...raw.skillProof }
      : {},
    registeredIds: Array.isArray(raw.registeredIds)
      ? raw.registeredIds.map(String)
      : [],
  };
}

/**
 * Ensure a per-career ladder leaf exists for a registered definition.
 * Creates latent default when missing; migrates when present.
 */
export function ensureLadderLeaf(state, def) {
  const ladders = ensureCareerLaddersState(state);
  if (!ladders || !def || !def.careerId) return null;
  const id = String(def.careerId);
  const seed = computeLadderRngSeed(masterSeedOf(state), id);
  if (!ladders[id] || typeof ladders[id] !== 'object') {
    ladders[id] = createLadderInstanceState(def, seed);
  } else {
    ladders[id] = migrateLadderInstance(ladders[id], def, seed);
  }
  const meta = ladders[META_KEY];
  if (meta && Array.isArray(meta.registeredIds) && !meta.registeredIds.includes(id)) {
    meta.registeredIds.push(id);
  }
  return ladders[id];
}

export function getLadderLeaf(state, careerId) {
  const ladders = ensureCareerLaddersState(state);
  if (!ladders) return null;
  const id = String(careerId || '');
  const leaf = ladders[id];
  return leaf && typeof leaf === 'object' ? leaf : null;
}

/**
 * Forward-compatible instance migration. Fills missing fields; does not invent progress.
 */
export function migrateLadderInstance(raw, def, fallbackSeed = 0) {
  const base = createLadderInstanceState(def, fallbackSeed);
  if (!raw || typeof raw !== 'object') return base;

  const out = { ...base, ...clonePlain(raw) };
  out.careerId = def ? String(def.careerId) : String(raw.careerId || base.careerId);
  out.title = def ? String(def.title || out.careerId) : String(raw.title || out.careerId);
  out.status = normalizeLadderStatus(out.status);
  out.stepIndex = clampInt(out.stepIndex, 0, def && def.steps ? Math.max(0, def.steps.length - 1) : 99, 0);
  out.stepId = typeof out.stepId === 'string' ? out.stepId : null;
  out.offerNonce = clampInt(out.offerNonce, 0, 1e9, 0);
  out.attemptMult = Number.isFinite(out.attemptMult) ? out.attemptMult : 1;
  out.rewardsGranted = !!out.rewardsGranted;
  out.completionReceiptId = typeof out.completionReceiptId === 'string' ? out.completionReceiptId : null;
  out.nonBinding = true;
  out.flags = {
    nonBinding: true,
    usesRealAuthorities: true,
    exclusive: false,
    blocksOtherCareers: false,
  };
  out.rngSeed = (Number(out.rngSeed) >>> 0) || (fallbackSeed >>> 0) || 0;
  out.receipts = (out.receipts && typeof out.receipts === 'object' && !Array.isArray(out.receipts))
    ? out.receipts
    : {};
  out.history = Array.isArray(out.history) ? out.history.slice(-HISTORY_CAP) : [];
  out.activeChoiceIds = Array.isArray(out.activeChoiceIds) ? out.activeChoiceIds.map(String) : [];

  // Reconcile step map against definition without wiping progress for known steps.
  const steps = {};
  const defs = def && Array.isArray(def.steps) ? def.steps : [];
  const rawSteps = (raw.steps && typeof raw.steps === 'object') ? raw.steps : {};
  for (const stepDef of defs) {
    const prev = rawSteps[stepDef.id];
    if (prev && typeof prev === 'object') {
      steps[stepDef.id] = {
        id: stepDef.id,
        status: normalizeStepStatus(prev.status),
        attempts: clampInt(prev.attempts, 0, 99, 0),
        failures: clampInt(prev.failures, 0, 99, 0),
        activeSinceS: Number.isFinite(prev.activeSinceS) ? prev.activeSinceS : null,
        failedAtS: Number.isFinite(prev.failedAtS) ? prev.failedAtS : null,
        recoveredAtS: Number.isFinite(prev.recoveredAtS) ? prev.recoveredAtS : null,
        doneAtS: Number.isFinite(prev.doneAtS) ? prev.doneAtS : null,
        choiceId: typeof prev.choiceId === 'string' ? prev.choiceId : null,
        payload: (prev.payload && typeof prev.payload === 'object') ? prev.payload : {},
      };
    } else {
      steps[stepDef.id] = {
        id: stepDef.id,
        status: STEP_STATUS.PENDING,
        attempts: 0,
        failures: 0,
        activeSinceS: null,
        failedAtS: null,
        recoveredAtS: null,
        doneAtS: null,
        choiceId: null,
        payload: {},
      };
    }
  }
  // Preserve unknown future step keys (forward-compat) without validating them.
  for (const key of Object.keys(rawSteps)) {
    if (!steps[key] && rawSteps[key] && typeof rawSteps[key] === 'object') {
      steps[key] = clonePlain(rawSteps[key]);
    }
  }
  out.steps = steps;

  // Re-derive attemptMult from active step failures when active.
  if (out.stepId && out.steps[out.stepId]) {
    out.attemptMult = attemptMultiplier(out.steps[out.stepId].failures);
  }

  // Terminal statuses must not keep a live active step pointer inconsistently.
  if (out.status === LADDER_STATUS.COMPLETED || out.status === LADDER_STATUS.DECLINED
    || out.status === LADDER_STATUS.ABANDONED || out.status === LADDER_STATUS.LATENT) {
    if (out.status === LADDER_STATUS.COMPLETED || out.status === LADDER_STATUS.DECLINED
      || out.status === LADDER_STATUS.ABANDONED) {
      // keep stepId for abandoned/failed context; clear only latent
    }
  }
  if (out.status === LADDER_STATUS.LATENT) {
    out.stepId = null;
  }

  return out;
}

/**
 * Migrate a full save blob (data.careerLadders) to current schema.
 * Safe for null/invalid input → empty container.
 */
export function migrateCareerLaddersBlob(blob) {
  if (!blob || typeof blob !== 'object' || Array.isArray(blob)) {
    return createEmptyCareerLaddersBlob();
  }
  const out = createEmptyCareerLaddersBlob();
  // Accept both envelope shapes: { schemaId, ladders } and flat { __meta, careerId... }
  const srcLadders = (blob.ladders && typeof blob.ladders === 'object' && !Array.isArray(blob.ladders))
    ? blob.ladders
    : blob;

  out.schemaId = CAREER_LADDERS_SCHEMA_ID;
  const ver = Number.isFinite(blob.schemaVersion) ? Math.floor(blob.schemaVersion) : 0;
  out.schemaVersion = ver < 1 ? CAREER_LADDERS_SCHEMA_VERSION : Math.max(ver, CAREER_LADDERS_SCHEMA_VERSION) === ver
    ? ver
    : CAREER_LADDERS_SCHEMA_VERSION;
  if (ver < 1) out.schemaVersion = CAREER_LADDERS_SCHEMA_VERSION;

  const metaSrc = srcLadders[META_KEY] || blob[META_KEY] || blob.meta;
  out.ladders[META_KEY] = migrateMeta(metaSrc);

  for (const key of Object.keys(srcLadders)) {
    if (key === META_KEY) continue;
    const leaf = srcLadders[key];
    if (!leaf || typeof leaf !== 'object' || Array.isArray(leaf)) continue;
    // Without a definition at migrate time, keep a normalized leaf shell.
    out.ladders[key] = migrateLadderInstance(leaf, {
      careerId: leaf.careerId || key,
      title: leaf.title || key,
      steps: Object.keys(leaf.steps || {}).map((id, index) => ({ id, index })),
    }, (Number(leaf.rngSeed) >>> 0) || 0);
  }
  return out;
}

/** Seed empty careerLadders on a save data envelope (migrations). */
export function seedCareerLaddersOnData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (!data.careerLadders || typeof data.careerLadders !== 'object' || Array.isArray(data.careerLadders)) {
    data.careerLadders = createEmptyCareerLaddersBlob();
  } else {
    data.careerLadders = migrateCareerLaddersBlob(data.careerLadders);
  }
  return data;
}

export function serializeCareerLadders(state, defsById = null) {
  const ladders = ensureCareerLaddersState(state);
  if (!ladders) return createEmptyCareerLaddersBlob();

  // If defs provided (Map, registry with list(), or array), ensure leaves before snapshot.
  let defList = null;
  if (defsById && typeof defsById.list === 'function') defList = defsById.list();
  else if (defsById && typeof defsById.forEach === 'function' && typeof defsById.get === 'function') {
    defList = [];
    defsById.forEach((def) => { defList.push(def); });
  } else if (Array.isArray(defsById)) {
    defList = defsById;
  }
  if (defList) {
    for (const def of defList) {
      if (def && def.careerId) ensureLadderLeaf(state, def);
    }
  }

  const outLadders = { [META_KEY]: clonePlain(ladders[META_KEY] || createLaddersMeta()) };
  for (const key of Object.keys(ladders)) {
    if (key === META_KEY) continue;
    const leaf = ladders[key];
    if (leaf && typeof leaf === 'object') outLadders[key] = clonePlain(leaf);
  }
  return {
    schemaId: CAREER_LADDERS_SCHEMA_ID,
    schemaVersion: CAREER_LADDERS_SCHEMA_VERSION,
    ladders: outLadders,
  };
}

/**
 * Apply a save blob onto state.careers.ladders.
 * Preserves state.careers.origins and other peer career keys.
 * @param {object} state
 * @param {object|null} blob
 * @param {{ getDef?: (careerId:string)=>object|null }} [opts]
 */
export function deserializeCareerLadders(state, blob, opts = {}) {
  const root = ensureCareersRoot(state);
  if (!root) return null;

  const migrated = migrateCareerLaddersBlob(blob);
  const next = { [META_KEY]: migrateMeta(migrated.ladders[META_KEY]) };

  for (const key of Object.keys(migrated.ladders)) {
    if (key === META_KEY) continue;
    const leaf = migrated.ladders[key];
    const def = opts.getDef ? opts.getDef(key) : null;
    const seed = computeLadderRngSeed(masterSeedOf(state), key);
    if (def) {
      next[key] = migrateLadderInstance(leaf, def, seed);
    } else {
      next[key] = migrateLadderInstance(leaf, {
        careerId: leaf.careerId || key,
        title: leaf.title || key,
        steps: Object.keys((leaf && leaf.steps) || {}).map((id, index) => ({ id, index })),
      }, seed);
    }
  }

  root.ladders = next;
  return ensureCareerLaddersState(state);
}

/** New Game parity: wipe ladder progress, keep origins peer intact. */
export function resetCareerLaddersForNewGame(state, defs = []) {
  const root = ensureCareersRoot(state);
  if (!root) return null;
  root.ladders = { [META_KEY]: createLaddersMeta() };
  const list = Array.isArray(defs) ? defs : [];
  for (const def of list) {
    if (def && def.careerId) ensureLadderLeaf(state, def);
  }
  return root.ladders;
}
