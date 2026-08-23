// Local Crucible records, run history, and unlock settlement (PQ-133.10a / CRU-054).
//
// LOCAL only. No network, no leaderboard, no telemetry. Persistence is a side bag,
// not a fork of the Adventure save:
//
//   fmt:            spaceface-crucible-meta
//   schemaVersion:  1
//   storage key:    sf.save.crucible_meta
//
// Versioning:
//   - A missing key (any save written before this packet) loads as an empty profile.
//   - schemaVersion < 1 is treated as empty.
//   - schemaVersion > 1 keeps known v1 fields and preserves unknown keys on rewrite
//     so a newer bag does not strip itself when an older build of this module
//     round-trips it.
//   - The key is not a `spaceface-save` envelope. The existing slot scanner rejects
//     unknown fmt, so this bag never appears as a Continue slot and never needs a
//     save-system branch.
//   - Browser/Electron share the key because it matches the existing player-store
//     prefix (sf.save.*). Adventure slot files are untouched.
//
// The run itself stays ephemeral. Settlement runs once on run:resultsReady.

import {
  isSharedPlayerStoreKey,
  pushSharedPlayerStore,
  sharedPlayerStoreAvailable,
} from '../save/sharedPlayerStore.js';
import { evaluateUnlocks } from './survivalUnlocks.js';
import { challengeFromRun, normalizeMutators } from './survivalMutators.js';

export const CRUCIBLE_META_FMT = 'spaceface-crucible-meta';
export const CRUCIBLE_META_SCHEMA_VERSION = 1;
export const CRUCIBLE_META_STORAGE_KEY = 'sf.save.crucible_meta';
export const CRUCIBLE_HISTORY_LIMIT = 40;

const memoryStore = new Map();

let injectedStorage = null;
let injectedNow = null;

export function useCrucibleMetaStorage(storage) {
  injectedStorage = storage || null;
}

export function useCrucibleMetaClock(nowFn) {
  injectedNow = typeof nowFn === 'function' ? nowFn : null;
}

export function resetCrucibleMetaForTests() {
  memoryStore.clear();
  injectedStorage = null;
  injectedNow = null;
}

function nowIso() {
  if (injectedNow) return injectedNow();
  try {
    return new Date().toISOString();
  } catch {
    return '1970-01-01T00:00:00.000Z';
  }
}

function memoryStorage() {
  return {
    getItem(key) {
      return memoryStore.has(key) ? memoryStore.get(key) : null;
    },
    setItem(key, value) {
      memoryStore.set(String(key), String(value));
    },
    removeItem(key) {
      memoryStore.delete(key);
    },
  };
}

function liveStorage() {
  if (injectedStorage) return injectedStorage;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    // disabled / missing
  }
  return memoryStorage();
}

function emptyLifetime() {
  return {
    runs: 0,
    victories: 0,
    defeats: 0,
    aborted: 0,
    deepestWave: 0,
    bestScore: 0,
    bestKills: 0,
  };
}

export function emptyCrucibleProfile() {
  return {
    schemaVersion: CRUCIBLE_META_SCHEMA_VERSION,
    unlocks: {},
    records: { byKey: {}, lifetime: emptyLifetime() },
    history: [],
  };
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function migrateProfile(raw) {
  const empty = emptyCrucibleProfile();
  const src = asObject(raw);
  if (!src) return empty;
  const version = Number.isInteger(src.schemaVersion) ? src.schemaVersion : 0;
  if (version < 1) return empty;
  const unlocks = asObject(src.unlocks) ? { ...src.unlocks } : {};
  const recordsIn = asObject(src.records) ? src.records : {};
  const lifetimeIn = asObject(recordsIn.lifetime) ? recordsIn.lifetime : {};
  const byKeyIn = asObject(recordsIn.byKey) ? recordsIn.byKey : {};
  const lifetime = emptyLifetime();
  for (const key of Object.keys(lifetime)) {
    const n = lifetimeIn[key];
    if (Number.isInteger(n) && n >= 0) lifetime[key] = n;
  }
  const byKey = {};
  for (const key of Object.keys(byKeyIn)) {
    const row = asObject(byKeyIn[key]);
    if (row) byKey[key] = { ...row };
  }
  const history = Array.isArray(src.history) ? src.history.filter(asObject).map((row) => ({ ...row })) : [];
  const profile = {
    schemaVersion: CRUCIBLE_META_SCHEMA_VERSION,
    unlocks,
    records: { byKey, lifetime },
    history: history.slice(-CRUCIBLE_HISTORY_LIMIT),
  };
  if (version > CRUCIBLE_META_SCHEMA_VERSION) {
    for (const key of Object.keys(src)) {
      if (key === 'schemaVersion' || key === 'unlocks' || key === 'records' || key === 'history') continue;
      profile[key] = cloneJson(src[key]);
    }
  }
  return profile;
}

function unwrapEnvelope(parsed) {
  if (!asObject(parsed)) return null;
  if (parsed.fmt === CRUCIBLE_META_FMT) {
    return asObject(parsed.data) ? parsed.data : parsed;
  }
  if (Number.isInteger(parsed.schemaVersion) || parsed.unlocks || parsed.records || parsed.history) {
    return parsed;
  }
  return null;
}

export function parseCrucibleMeta(raw) {
  if (raw == null || raw === '') return emptyCrucibleProfile();
  if (typeof raw !== 'string') {
    return migrateProfile(unwrapEnvelope(raw) || raw);
  }
  try {
    const parsed = JSON.parse(raw);
    return migrateProfile(unwrapEnvelope(parsed) || parsed);
  } catch {
    return emptyCrucibleProfile();
  }
}

export function loadCrucibleMeta(storage = liveStorage()) {
  if (!storage || typeof storage.getItem !== 'function') return emptyCrucibleProfile();
  let raw = null;
  try {
    raw = storage.getItem(CRUCIBLE_META_STORAGE_KEY);
  } catch {
    return emptyCrucibleProfile();
  }
  return parseCrucibleMeta(raw);
}

function envelopeFor(profile, savedAt) {
  const data = cloneJson(profile) || emptyCrucibleProfile();
  data.schemaVersion = CRUCIBLE_META_SCHEMA_VERSION;
  return {
    fmt: CRUCIBLE_META_FMT,
    schemaVersion: CRUCIBLE_META_SCHEMA_VERSION,
    savedAt,
    updatedAt: savedAt,
    data,
  };
}

export function saveCrucibleMeta(profile, storage = liveStorage()) {
  const savedAt = nowIso();
  const envelope = envelopeFor(profile, savedAt);
  let json;
  try {
    json = JSON.stringify(envelope);
  } catch {
    return false;
  }
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(CRUCIBLE_META_STORAGE_KEY, json);
  } catch {
    return false;
  }
  if (isSharedPlayerStoreKey(CRUCIBLE_META_STORAGE_KEY) && sharedPlayerStoreAvailable()) {
    try {
      const pending = pushSharedPlayerStore({ [CRUCIBLE_META_STORAGE_KEY]: json });
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch {
      // sharing is best-effort; the local bag already wrote
    }
  }
  return true;
}

export function recordKey({ arenaId, ruleset, mutators } = {}) {
  const arena = typeof arenaId === 'string' && arenaId ? arenaId : 'none';
  const set = typeof ruleset === 'string' && ruleset ? ruleset : 'scored';
  return `${arena}|${set}|${normalizeMutators(mutators).join(',')}`;
}

function emptyRecord() {
  return {
    attempts: 0,
    victories: 0,
    bestScore: 0,
    deepestWave: 0,
    bestKills: 0,
    bestSeed: 0,
  };
}

function applyRecord(row, compact) {
  const next = { ...emptyRecord(), ...row };
  next.attempts += 1;
  const score = Number.isInteger(compact.score) ? compact.score : 0;
  const deepest = Number.isInteger(compact.deepestWave) ? compact.deepestWave : 0;
  const kills = Number.isInteger(compact.kills) ? compact.kills : 0;
  if (score >= next.bestScore) {
    next.bestScore = score;
    next.bestSeed = Number.isInteger(compact.seed) ? compact.seed : next.bestSeed;
  }
  if (deepest > next.deepestWave) next.deepestWave = deepest;
  if (kills > next.bestKills) next.bestKills = kills;
  if (compact.outcome === 'victory') next.victories += 1;
  return next;
}

function applyLifetime(lifetime, compact) {
  const next = { ...emptyLifetime(), ...lifetime };
  next.runs += 1;
  if (compact.outcome === 'victory') next.victories += 1;
  else if (compact.outcome === 'aborted') next.aborted += 1;
  else next.defeats += 1;
  const deepest = Number.isInteger(compact.deepestWave) ? compact.deepestWave : 0;
  const score = Number.isInteger(compact.score) ? compact.score : 0;
  const kills = Number.isInteger(compact.kills) ? compact.kills : 0;
  if (deepest > next.deepestWave) next.deepestWave = deepest;
  if (score > next.bestScore) next.bestScore = score;
  if (kills > next.bestKills) next.bestKills = kills;
  return next;
}

export function compactRunResult(result, run, newly) {
  const challenge = challengeFromRun(run);
  return {
    schemaVersion: 1,
    outcome: result && result.outcome ? result.outcome : null,
    seed: result && Number.isInteger(result.seed) ? result.seed : (run && Number.isInteger(run.seed) ? run.seed : 0),
    arenaId: (result && result.arenaId) || (run && run.arenaId) || null,
    ruleset: challenge.ruleset,
    trialId: challenge.trialId,
    mutators: challenge.mutators.slice(),
    wave: result && Number.isInteger(result.wave) ? result.wave : 0,
    deepestWave: result && Number.isInteger(result.deepestWave) ? result.deepestWave : 0,
    wavesCleared: result && Number.isInteger(result.wavesCleared) ? result.wavesCleared : 0,
    kills: result && Number.isInteger(result.kills) ? result.kills : 0,
    score: result && Number.isInteger(result.score) ? result.score : 0,
    credits: result && Number.isInteger(result.credits) ? result.credits : 0,
    xp: result && Number.isInteger(result.xp) ? result.xp : 0,
    picks: Array.isArray(result && result.picks) ? result.picks.map((pick) => ({
      verb: pick && pick.verb ? pick.verb : null,
      defId: pick && pick.defId ? pick.defId : null,
      wave: Number.isInteger(pick && pick.wave) ? pick.wave : null,
    })) : [],
    unlocksEarned: Array.isArray(newly) ? newly.slice() : [],
  };
}

export function settleCrucibleRun({ result, run, profile = null, storage = liveStorage() } = {}) {
  const loaded = profile ? migrateProfile(profile) : loadCrucibleMeta(storage);
  const evaluated = evaluateUnlocks(loaded, result || {});
  const compact = compactRunResult(result || {}, run || {}, evaluated.newly);
  const key = recordKey(compact);
  const records = loaded.records || { byKey: {}, lifetime: emptyLifetime() };
  const byKey = { ...(records.byKey || {}) };
  byKey[key] = applyRecord(byKey[key], compact);
  const next = {
    ...loaded,
    schemaVersion: CRUCIBLE_META_SCHEMA_VERSION,
    unlocks: evaluated.unlocks,
    records: {
      byKey,
      lifetime: applyLifetime(records.lifetime, compact),
    },
    history: [...(Array.isArray(loaded.history) ? loaded.history : []), compact].slice(-CRUCIBLE_HISTORY_LIMIT),
  };
  saveCrucibleMeta(next, storage);
  return {
    profile: next,
    result: compact,
    unlocksEarned: evaluated.newly.slice(),
  };
}

/** Restore a pre-packet player blob the way saveSystem._restorePlayer does (shallow-merge bags). */
export function restorePlayerFromSaveBlob(livePlayer, savedPlayer) {
  if (!savedPlayer || typeof savedPlayer !== 'object') return livePlayer;
  const player = livePlayer;
  const cargo = player.cargo;
  for (const key of Object.keys(savedPlayer)) {
    if (key === 'cargo') continue;
    const incoming = savedPlayer[key];
    const existing = player[key];
    if (
      incoming && typeof incoming === 'object' && !Array.isArray(incoming)
      && existing && typeof existing === 'object' && !Array.isArray(existing)
    ) {
      player[key] = Object.assign({}, existing, incoming);
      continue;
    }
    player[key] = incoming;
  }
  player.cargo = cargo;
  return player;
}
