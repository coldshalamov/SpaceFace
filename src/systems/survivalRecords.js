// Local Crucible records, run history, unlock settlement, and the daily board
// (PQ-133.10a / CRU-054 / PQ-169.00).
//
// LOCAL only. No network, no telemetry. Persistence is a side bag, not a fork
// of the Adventure save. The daily board is local too. Ghosts are a pose tape on this same bag.
// PQ-033: Steam board lands with the release closeout. Local board is the authority until then.
// PQ-160 / PQ-033: file/code share and Steam board land later. Local tape + hash is the authority until then.
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
import { hash32, wrapAngle } from '../core/rng.js';
import { evaluateUnlocks } from './survivalUnlocks.js';
import { CRUCIBLE_WEEKLY_ROTATION } from '../data/survivalMutators.js';
import { challengeFromRun, consumeQueuedDailyDateKey, lastQueuedDailyDateKey, normalizeMutators } from './survivalMutators.js';

export const CRUCIBLE_META_FMT = 'spaceface-crucible-meta';
export const CRUCIBLE_META_SCHEMA_VERSION = 1;
export const CRUCIBLE_META_STORAGE_KEY = 'sf.save.crucible_meta';
export const CRUCIBLE_HISTORY_LIMIT = 40;
export const CRUCIBLE_DAILY_LABEL = 'spaceface-crucible-daily-v1';
export const CRUCIBLE_DAILY_BOARD_CAP = 60;
export const CRUCIBLE_DAILY_SEED_MIN = 1;
export const CRUCIBLE_DAILY_SEED_MAX = 0xffffffff;
export const CRUCIBLE_GHOST_LABEL = 'spaceface-crucible-ghost-v1';
export const CRUCIBLE_GHOST_SAMPLE_STRIDE = 6;
export const CRUCIBLE_GHOST_FRAME_CAP = 3600;
export const CRUCIBLE_GHOST_RETAIN_CAP = 20;
export const CRUCIBLE_GHOST_VERSION = 1;

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
  resetGhostRuntime();
}

function nowIso() {
  if (injectedNow) return injectedNow();
  try {
    return new Date().toISOString();
  } catch {
    return '1970-01-01T00:00:00.000Z';
  }
}

export function isUtcDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** UTC calendar day `YYYY-MM-DD` from an ISO timestamp. Never local timezone. */
export function utcDateKeyFromIso(iso) {
  if (typeof iso !== 'string' || iso.length < 10) return '';
  const key = iso.slice(0, 10);
  return isUtcDateKey(key) ? key : '';
}

export function utcDateKeyNow() {
  return utcDateKeyFromIso(nowIso());
}

/** uint32 in the Crucible launch range (1..0xffffffff). Hash 0 becomes 1. */
export function dailySeedForDateKey(dateKey) {
  const key = typeof dateKey === 'string' ? dateKey : '';
  const seed = hash32(CRUCIBLE_DAILY_LABEL, key);
  if (seed === 0) return CRUCIBLE_DAILY_SEED_MIN;
  if (seed < CRUCIBLE_DAILY_SEED_MIN) return CRUCIBLE_DAILY_SEED_MIN;
  if (seed > CRUCIBLE_DAILY_SEED_MAX) return CRUCIBLE_DAILY_SEED_MAX;
  return seed;
}

export function dailySeedForNow() {
  return dailySeedForDateKey(utcDateKeyNow());
}

export const CRUCIBLE_WEEKLY_EPOCH_MONDAY_MS = Date.UTC(1970, 0, 5);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function isUtcWeekKey(value) {
  return typeof value === 'string' && /^\d{4}-W\d{2}$/.test(value);
}

function padWeek(week) {
  return `W${String(week).padStart(2, '0')}`;
}

/** ISO-week `YYYY-Www` in UTC from an ISO timestamp. Never local timezone. */
export function utcWeekKeyFromIso(iso) {
  if (typeof iso !== 'string' || iso.length < 10) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  if (!Number.isInteger(week) || week < 1) return '';
  return `${isoYear}-${padWeek(week)}`;
}

export function utcWeekKeyNow() {
  return utcWeekKeyFromIso(nowIso());
}

function mondayMsForWeekKey(weekKey) {
  if (!isUtcWeekKey(weekKey)) return null;
  const year = Number(weekKey.slice(0, 4));
  const week = Number(weekKey.slice(6));
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = Date.UTC(year, 0, 4 - (jan4Day - 1));
  return week1Monday + (week - 1) * WEEK_MS;
}

function weekIndexFromWeekKey(weekKey) {
  const mondayMs = mondayMsForWeekKey(weekKey);
  if (mondayMs == null) return null;
  return Math.floor((mondayMs - CRUCIBLE_WEEKLY_EPOCH_MONDAY_MS) / WEEK_MS);
}

/** PQ-169.02: weekly rotation is local. No live-ops feed. Permutation, not hash % 4. */
export function weeklyMutatorForWeekKey(weekKey) {
  const index = weekIndexFromWeekKey(weekKey);
  if (index == null) return '';
  const n = CRUCIBLE_WEEKLY_ROTATION.length;
  const slot = ((index % n) + n) % n;
  return CRUCIBLE_WEEKLY_ROTATION[slot];
}

export function weeklyMutatorForNow() {
  return weeklyMutatorForWeekKey(utcWeekKeyNow());
}

let ghostRecording = null;
let ghostPlaybackTape = null;

function resetGhostRuntime() {
  ghostRecording = null;
  ghostPlaybackTape = null;
}

function quantize3(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  const q = Math.round(n * 1000) / 1000;
  return q === 0 ? 0 : q;
}

function stableStringify(value) {
  if (value === null) return 'null';
  const kind = typeof value;
  if (kind === 'number') {
    if (!Number.isFinite(value)) return 'null';
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (kind === 'string' || kind === 'boolean') return JSON.stringify(value);
  if (kind !== 'object') return 'null';
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i += 1) {
      if (i) out += ',';
      out += stableStringify(value[i]);
    }
    return `${out}]`;
  }
  const keys = Object.keys(value).sort();
  let out = '{';
  let first = true;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const child = value[key];
    if (child === undefined) continue;
    if (!first) out += ',';
    first = false;
    out += `${JSON.stringify(key)}:${stableStringify(child)}`;
  }
  return `${out}}`;
}

function lerpAngle(a, b, t) {
  return wrapAngle(a + wrapAngle(b - a) * t);
}

function asHullId(value) {
  return typeof value === 'string' && value ? value : 'ship_kestrel';
}

function asSeed(value) {
  return Number.isInteger(value) ? value >>> 0 : 0;
}

function canonicalFrame(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const t = Number.isInteger(raw.t) ? raw.t : (Number.isInteger(raw.tick) ? raw.tick : NaN);
  const x = quantize3(raw.x);
  const z = quantize3(raw.z);
  const r = quantize3(raw.r);
  if (!Number.isInteger(t) || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(r)) return null;
  return { r, t, x, z };
}

/** Canonical pose tape: v/seed/hullId/frames only, quantized, sorted keys, no extra fields. */
export function canonicalGhostTape(tape) {
  const src = tape && typeof tape === 'object' && !Array.isArray(tape) ? tape : {};
  const incoming = Array.isArray(src.frames) ? src.frames : [];
  const frames = [];
  const byTick = new Map();
  for (let i = 0; i < incoming.length; i += 1) {
    const frame = canonicalFrame(incoming[i]);
    if (!frame) continue;
    byTick.set(frame.t, frame);
  }
  const ticks = [...byTick.keys()].sort((a, b) => a - b);
  for (let i = 0; i < ticks.length; i += 1) frames.push(byTick.get(ticks[i]));
  return {
    frames,
    hullId: asHullId(src.hullId),
    seed: asSeed(src.seed),
    v: CRUCIBLE_GHOST_VERSION,
  };
}

export function canonicalGhostString(tape) {
  return stableStringify(canonicalGhostTape(tape));
}

/** uint32 of hash32('spaceface-crucible-ghost-v1', canonical). Two machines, same tape, same hash. */
export function ghostHash(tape) {
  return hash32(CRUCIBLE_GHOST_LABEL, canonicalGhostString(tape));
}

export function ghostPoseAt(tape, tick) {
  const frames = tape && Array.isArray(tape.frames) ? tape.frames : canonicalGhostTape(tape).frames;
  if (!frames.length) return null;
  const t = Number.isInteger(tick) ? tick : Math.trunc(Number(tick));
  if (!Number.isFinite(t)) return null;
  let lo = 0;
  let hi = frames.length - 1;
  if (t <= frames[0].t) return { x: frames[0].x, z: frames[0].z, r: frames[0].r };
  if (t >= frames[hi].t) return { x: frames[hi].x, z: frames[hi].z, r: frames[hi].r };
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const mt = frames[mid].t;
    if (mt === t) return { x: frames[mid].x, z: frames[mid].z, r: frames[mid].r };
    if (mt < t) lo = mid + 1;
    else hi = mid - 1;
  }
  const a = frames[hi];
  const b = frames[lo];
  const span = b.t - a.t;
  const u = span === 0 ? 0 : (t - a.t) / span;
  return {
    x: a.x + (b.x - a.x) * u,
    z: a.z + (b.z - a.z) * u,
    r: lerpAngle(a.r, b.r, u),
  };
}

/** Pose playback is never a combatant: no Rapier body, no weapons, no campaign credits. */
export function ghostPlaybackContract(tape, tick) {
  return {
    kind: 'ghost',
    pose: ghostPoseAt(tape, tick),
    hasRapierBody: false,
    weapons: Object.freeze([]),
    writesCampaignCredits: false,
    isCombatant: false,
  };
}

export function beginGhostRecording({ seed, hullId } = {}) {
  ghostRecording = {
    seed: asSeed(seed),
    hullId: asHullId(hullId),
    frames: [],
    lastT: null,
  };
  return ghostRecording;
}

export function sampleGhostPose({ tick, x, z, r, seed, hullId } = {}) {
  if (!ghostRecording) beginGhostRecording({ seed, hullId });
  const t = Number.isInteger(tick) ? tick : Math.trunc(Number(tick));
  if (!Number.isFinite(t)) return false;
  if (ghostRecording.lastT != null) {
    if (t === ghostRecording.lastT) return false;
    if (t - ghostRecording.lastT < CRUCIBLE_GHOST_SAMPLE_STRIDE) return false;
  }
  const frame = canonicalFrame({ t, x, z, r });
  if (!frame) return false;
  if (seed != null) ghostRecording.seed = asSeed(seed);
  if (hullId) ghostRecording.hullId = asHullId(hullId);
  const frames = ghostRecording.frames;
  if (frames.length >= CRUCIBLE_GHOST_FRAME_CAP) frames.shift();
  frames.push(frame);
  ghostRecording.lastT = frame.t;
  return true;
}

export function sampleGhostPoseFromState(state) {
  if (!state) return false;
  const run = state.run;
  if (!run || run.kind !== 'survival') return false;
  const playerId = state.playerId;
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(playerId)
    : null;
  if (!player || !player.pos) return false;
  const hullId = (player.data && player.data.defId) || player.hullId || ghostRecording && ghostRecording.hullId;
  const tick = Number.isInteger(state.tick) ? state.tick : 0;
  return sampleGhostPose({
    tick,
    x: player.pos.x,
    z: player.pos.z,
    r: player.rot,
    seed: run.seed,
    hullId,
  });
}

export function peekGhostTape() {
  if (!ghostRecording || !ghostRecording.frames.length) return null;
  return canonicalGhostTape({
    v: CRUCIBLE_GHOST_VERSION,
    seed: ghostRecording.seed,
    hullId: ghostRecording.hullId,
    frames: ghostRecording.frames,
  });
}

export function takeGhostTape() {
  const tape = peekGhostTape();
  ghostRecording = null;
  return tape;
}

export function armGhostPlayback(hash) {
  if (hash == null || hash === '') {
    ghostPlaybackTape = null;
    return null;
  }
  const n = Number.isInteger(hash) ? (hash >>> 0) : (typeof hash === 'string' && /^\d+$/.test(hash) ? Number(hash) >>> 0 : null);
  if (n == null) {
    ghostPlaybackTape = null;
    return null;
  }
  const profile = loadCrucibleMeta();
  const row = lastGhostRowByHash(profile, n);
  if (!row || !Array.isArray(row.frames) || !row.frames.length) {
    ghostPlaybackTape = null;
    return null;
  }
  ghostPlaybackTape = canonicalGhostTape({
    v: CRUCIBLE_GHOST_VERSION,
    seed: row.seed,
    hullId: row.hullId,
    frames: row.frames,
  });
  return ghostPlaybackTape;
}

export function getGhostPlaybackTape() {
  return ghostPlaybackTape;
}

export function lastGhostRowByHash(profile, hash) {
  const byHash = profile && profile.ghosts && profile.ghosts.byHash && typeof profile.ghosts.byHash === 'object'
    ? profile.ghosts.byHash
    : null;
  if (!byHash) return null;
  const row = byHash[String(hash >>> 0)];
  return row && typeof row === 'object' ? row : null;
}

export function lastGhostForSeed(profile, seed) {
  const byHash = profile && profile.ghosts && profile.ghosts.byHash && typeof profile.ghosts.byHash === 'object'
    ? profile.ghosts.byHash
    : null;
  if (!byHash) return null;
  const s = asSeed(seed);
  let best = null;
  const keys = Object.keys(byHash);
  for (let i = 0; i < keys.length; i += 1) {
    const row = byHash[keys[i]];
    if (!row || typeof row !== 'object') continue;
    if (asSeed(row.seed) !== s) continue;
    if (!best) {
      best = row;
      continue;
    }
    const a = typeof row.recordedAt === 'string' ? row.recordedAt : '';
    const b = typeof best.recordedAt === 'string' ? best.recordedAt : '';
    if (a > b) best = row;
  }
  return best;
}

export function ghostRaceOffer(profile, seed) {
  const row = lastGhostForSeed(profile, seed);
  if (!row) {
    return {
      available: false,
      hash: null,
      label: 'Ghost',
      blurb: 'No ghost for this seed yet.',
    };
  }
  return {
    available: true,
    hash: row.hash >>> 0,
    label: 'Ghost',
    blurb: 'Race the last recorded hull for this seed.',
  };
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

function emptyDaily() {
  return { byDate: {} };
}

function emptyGhosts() {
  return { byHash: {}, lastHash: null };
}

export function emptyCrucibleProfile() {
  return {
    schemaVersion: CRUCIBLE_META_SCHEMA_VERSION,
    unlocks: {},
    records: { byKey: {}, lifetime: emptyLifetime() },
    history: [],
    daily: emptyDaily(),
    ghosts: emptyGhosts(),
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
    daily: migrateDaily(src.daily),
    ghosts: migrateGhosts(src.ghosts),
  };
  if (version > CRUCIBLE_META_SCHEMA_VERSION) {
    for (const key of Object.keys(src)) {
      if (
        key === 'schemaVersion'
        || key === 'unlocks'
        || key === 'records'
        || key === 'history'
        || key === 'daily'
        || key === 'ghosts'
      ) continue;
      profile[key] = cloneJson(src[key]);
    }
  }
  return profile;
}

function migrateDailyRow(key, row) {
  const src = asObject(row);
  if (!src) return null;
  const dateKey = isUtcDateKey(src.dateKey) ? src.dateKey : (isUtcDateKey(key) ? key : '');
  if (!dateKey) return null;
  const seed = Number.isInteger(src.seed) ? src.seed : 0;
  return {
    dateKey,
    seed: seed === 0 ? 0 : (seed >>> 0) || 1,
    bestScore: Number.isInteger(src.bestScore) && src.bestScore >= 0 ? src.bestScore : 0,
    deepestWave: Number.isInteger(src.deepestWave) && src.deepestWave >= 0 ? src.deepestWave : 0,
    attempts: Number.isInteger(src.attempts) && src.attempts >= 0 ? src.attempts : 0,
    lastOutcome: typeof src.lastOutcome === 'string' ? src.lastOutcome : null,
    recordedAt: typeof src.recordedAt === 'string' ? src.recordedAt : null,
  };
}

function migrateDaily(rawDaily) {
  const empty = emptyDaily();
  const src = asObject(rawDaily);
  if (!src) return empty;
  const byDateIn = asObject(src.byDate) ? src.byDate : {};
  const byDate = {};
  for (const key of Object.keys(byDateIn)) {
    const row = migrateDailyRow(key, byDateIn[key]);
    if (row) byDate[row.dateKey] = row;
  }
  return { byDate: pruneDailyByDate(byDate) };
}

function pruneDailyByDate(byDate, cap = CRUCIBLE_DAILY_BOARD_CAP) {
  const keys = Object.keys(byDate).sort();
  if (keys.length <= cap) return byDate;
  const keep = keys.slice(keys.length - cap);
  const next = {};
  for (const key of keep) next[key] = byDate[key];
  return next;
}

function migrateGhostRow(_key, row) {
  const src = asObject(row);
  if (!src) return null;
  const tape = canonicalGhostTape({
    v: CRUCIBLE_GHOST_VERSION,
    seed: src.seed,
    hullId: src.hullId,
    frames: src.frames,
  });
  if (!tape.frames.length) return null;
  const hash = Number.isInteger(src.hash) ? (src.hash >>> 0) : ghostHash(tape);
  return {
    hash,
    seed: tape.seed,
    hullId: tape.hullId,
    frameCount: tape.frames.length,
    frames: tape.frames,
    recordedAt: typeof src.recordedAt === 'string' ? src.recordedAt : null,
  };
}

function migrateGhosts(rawGhosts) {
  const empty = emptyGhosts();
  const src = asObject(rawGhosts);
  if (!src) return empty;
  const byHashIn = asObject(src.byHash) ? src.byHash : {};
  const byHash = {};
  for (const key of Object.keys(byHashIn)) {
    const row = migrateGhostRow(key, byHashIn[key]);
    if (row) byHash[String(row.hash)] = row;
  }
  const pruned = pruneGhostsByHash(byHash);
  let lastHash = null;
  if (Number.isInteger(src.lastHash)) lastHash = src.lastHash >>> 0;
  else if (typeof src.lastHash === 'string' && /^\d+$/.test(src.lastHash)) lastHash = Number(src.lastHash) >>> 0;
  if (lastHash != null && !pruned[String(lastHash)]) lastHash = null;
  return { byHash: pruned, lastHash };
}

function pruneGhostsByHash(byHash, cap = CRUCIBLE_GHOST_RETAIN_CAP) {
  const keys = Object.keys(byHash);
  if (keys.length <= cap) return byHash;
  const rows = keys.map((key) => byHash[key]).filter(Boolean);
  rows.sort((a, b) => {
    const at = typeof a.recordedAt === 'string' ? a.recordedAt : '';
    const bt = typeof b.recordedAt === 'string' ? b.recordedAt : '';
    if (at !== bt) return at < bt ? -1 : 1;
    return (a.hash >>> 0) - (b.hash >>> 0);
  });
  const keep = rows.slice(rows.length - cap);
  const next = {};
  for (let i = 0; i < keep.length; i += 1) next[String(keep[i].hash)] = keep[i];
  return next;
}

function upsertGhost(ghosts, tape, recordedAt) {
  const canonical = canonicalGhostTape(tape);
  if (!canonical.frames.length) return ghosts && ghosts.byHash ? ghosts : emptyGhosts();
  const hash = ghostHash(canonical);
  const prevBag = ghosts && asObject(ghosts) ? ghosts : emptyGhosts();
  const byHash = { ...(asObject(prevBag.byHash) ? prevBag.byHash : {}) };
  byHash[String(hash)] = {
    hash,
    seed: canonical.seed,
    hullId: canonical.hullId,
    frameCount: canonical.frames.length,
    frames: canonical.frames,
    recordedAt: typeof recordedAt === 'string' ? recordedAt : nowIso(),
  };
  return { ...prevBag, byHash: pruneGhostsByHash(byHash), lastHash: hash };
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
  const dailyDateKey = resolveDailyDateKey(result, run);
  const compact = {
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
  if (dailyDateKey) compact.dailyDateKey = dailyDateKey;
  return compact;
}

function resolveDailyDateKey(result, run) {
  const candidates = [
    result && result.dailyDateKey,
    run && run.dailyDateKey,
    lastQueuedDailyDateKey(),
  ];
  for (const value of candidates) {
    if (isUtcDateKey(value)) return value;
  }
  return null;
}

function applyDailyBoard(daily, compact, recordedAt) {
  const dateKey = compact && compact.dailyDateKey;
  if (!isUtcDateKey(dateKey)) return daily && daily.byDate ? daily : emptyDaily();
  const prevBag = daily && asObject(daily) ? daily : emptyDaily();
  const byDate = { ...(asObject(prevBag.byDate) ? prevBag.byDate : {}) };
  const prev = asObject(byDate[dateKey]) ? byDate[dateKey] : null;
  const score = Number.isInteger(compact.score) ? compact.score : 0;
  const deepest = Number.isInteger(compact.deepestWave) ? compact.deepestWave : 0;
  const seed = Number.isInteger(compact.seed) ? compact.seed : (prev && Number.isInteger(prev.seed) ? prev.seed : 0);
  const row = {
    dateKey,
    seed,
    bestScore: prev && Number.isInteger(prev.bestScore) ? prev.bestScore : 0,
    deepestWave: prev && Number.isInteger(prev.deepestWave) ? prev.deepestWave : 0,
    attempts: (prev && Number.isInteger(prev.attempts) ? prev.attempts : 0) + 1,
    lastOutcome: compact.outcome || (prev && prev.lastOutcome) || null,
    recordedAt,
  };
  if (score >= row.bestScore) row.bestScore = score;
  if (deepest > row.deepestWave) row.deepestWave = deepest;
  byDate[dateKey] = row;
  return { ...prevBag, byDate: pruneDailyByDate(byDate) };
}

export function settleCrucibleRun({ result, run, profile = null, storage = liveStorage() } = {}) {
  const loaded = profile ? migrateProfile(profile) : loadCrucibleMeta(storage);
  const evaluated = evaluateUnlocks(loaded, result || {});
  const compact = compactRunResult(result || {}, run || {}, evaluated.newly);
  const key = recordKey(compact);
  const records = loaded.records || { byKey: {}, lifetime: emptyLifetime() };
  const byKey = { ...(records.byKey || {}) };
  byKey[key] = applyRecord(byKey[key], compact);
  const recordedAt = nowIso();
  const tape = takeGhostTape();
  let ghosts = loaded.ghosts && loaded.ghosts.byHash ? loaded.ghosts : emptyGhosts();
  if (tape && tape.frames.length) {
    ghosts = upsertGhost(ghosts, tape, recordedAt);
    compact.ghostHash = ghosts.lastHash;
  }
  const next = {
    ...loaded,
    schemaVersion: CRUCIBLE_META_SCHEMA_VERSION,
    unlocks: evaluated.unlocks,
    records: {
      byKey,
      lifetime: applyLifetime(records.lifetime, compact),
    },
    history: [...(Array.isArray(loaded.history) ? loaded.history : []), compact].slice(-CRUCIBLE_HISTORY_LIMIT),
    daily: applyDailyBoard(loaded.daily, compact, recordedAt),
    ghosts,
  };
  saveCrucibleMeta(next, storage);
  consumeQueuedDailyDateKey();
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
