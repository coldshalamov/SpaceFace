// Achievement ledger (PQ-033.03). META state, never simulation state.
//
// installAchievements() subscribes to the live bus the way the telemetry sink does (src/main.js
// installs both at boot). It never writes GameState, never enters the registry UPDATE_ORDER and is
// never installed inside sf-sim, so the deterministic goldens cannot see it. It draws no randomness;
// the wall clock is read only to stamp an unlock time.
//
//   fmt:            spaceface-achievements
//   schemaVersion:  1
//   storage key:    sf.save.achievements
//
// Persistence copies survivalRecords' side-bag pattern: its own key under the shared player-store
// prefix (Browser and Electron share it through src/save/sharedPlayerStore.js), not a
// `spaceface-save` envelope, so the save-slot scanner ignores it and no save-schema change exists.
//
// Exactly once, across reloads and across shells:
//   • an id is unlocked iff `unlocked[id]` exists; evaluation only ever adds, and the unlock event,
//     the notice and the Steam mirror fire only for ids added in this process;
//   • the shared store is last-writer-wins on the whole envelope, so every write first re-reads the
//     stored bag and merges (union of unlocks keeping the earliest time, max of every counter), and
//     `save:store-synced` merges the other shell's bag into memory. Two shells can never erase each
//     other's unlocks and an id is never announced twice for the same save store.
//   • unknown ids, counters and top-level keys (a newer build's bag) are preserved on rewrite.

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_COUNTERS,
  CRUCIBLE_FACTS,
  HIDDEN_ACHIEVEMENT_COPY,
  achievementById,
} from '../data/achievements.js';
import {
  isSharedPlayerStoreKey,
  pushSharedPlayerStore,
  sharedPlayerStoreAvailable,
} from '../save/sharedPlayerStore.js';
import { loadCrucibleMeta, recordKey } from './survivalRecords.js';
import { isOnboardingTeaching } from '../ui/voiceArbiter.js';

export const ACHIEVEMENTS_FMT = 'spaceface-achievements';
export const ACHIEVEMENTS_SCHEMA_VERSION = 1;
export const ACHIEVEMENTS_STORAGE_KEY = 'sf.save.achievements';
export const ACHIEVEMENT_UNLOCKED_EVENT = 'achievement:unlocked';
export const ACHIEVEMENT_NOTICE_ID = 'achievement:notice';
export const ACHIEVEMENT_NOTICE_TTL_S = 5;
const COUNTER_SAVE_DEBOUNCE_MS = 4000;
const PENDING_NOTICE_CAP = 16;
const CRUCIBLE_BEST_KEY_CAP = 128;
/**
 * Longest record key the bag will accept. `recordKey()` in survivalRecords emits
 * `pq146:{...}` + a JSON blob of the ghost-comparable launch fields, which is ~215-230 chars for a
 * real challenge. The old 200 cap was written before those fields existed and silently DROPPED
 * every key on load, so a returning player's Crucible personal bests were gone (the profile
 * re-seeded them, but any ledger-only knowledge was not, and the pre-run comparison could not
 * survive a reload). It is a defensive bound against a hostile bag, so it is set well above the
 * real maximum rather than at it.
 */
const CRUCIBLE_BEST_KEY_MAX = 512;
const SHARED_STORE_SYNC_FALLBACK_MS = 15000;
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

// ── FB-102 career-counter vocabulary ──────────────────────────────────────────────────────────
// Five career truths a statistics screen reads (FB-103) and the death summary may reuse:
// distance flown (odometer), kills by kill-cause family (`killsBy:<cause>`), biggest throw
// (massline release speed), time per sector (`sectorTime:<sectorId>`), and the player's own
// hull losses. Keys are bag counter keys; the two dynamic families are prefix-folded by
// careerStats(). Not achievement inputs — ACHIEVEMENT_COUNTERS stays the achievement ladder.
export const CAREER_KEY_DISTANCE_FLOWN = 'distanceFlownWu';
export const CAREER_KEY_BIGGEST_THROW = 'biggestThrowSpeed';
export const CAREER_KEY_SHIPS_LOST = 'shipsLost';
export const KILLS_BY_PREFIX = 'killsBy:';
export const SECTOR_TIME_PREFIX = 'sectorTime:';
// The odometer's near-clock gate: displacement is folded at most twice per sim second, and a
// single interval that jumps past this many WU is a teleport (jump arrival, undock reposition),
// not flown distance — the baseline resets instead of summing it.
const ODOMETER_MIN_INTERVAL_S = 0.5;
const ODOMETER_TELEPORT_WU = 750;

/* ---------------------------------------------------------------------------------------------- */
/* storage + clock seams (same shape as survivalRecords)                                          */
/* ---------------------------------------------------------------------------------------------- */

const memoryStore = new Map();
let injectedStorage = null;
let injectedNow = null;

export function useAchievementStorage(storage) {
  injectedStorage = storage || null;
}

export function useAchievementClock(nowFn) {
  injectedNow = typeof nowFn === 'function' ? nowFn : null;
}

export function resetAchievementsForTests() {
  if (activeLedger) activeLedger.dispose({ flush: false });
  activeLedger = null;
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
    getItem(key) { return memoryStore.has(key) ? memoryStore.get(key) : null; },
    setItem(key, value) { memoryStore.set(String(key), String(value)); },
    removeItem(key) { memoryStore.delete(key); },
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

/* ---------------------------------------------------------------------------------------------- */
/* the bag                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

// crucibleBestByRunKey is the ledger's own PRE-run best per record key. It is not the player's
// record (that is crucibleBestByKey) — it is what the ledger remembers so a run can be compared
// against the record that existed before it settled. Both are max-merged, like counters.
const KNOWN_BAG_KEYS = new Set([
  'schemaVersion', 'unlocked', 'counters', 'crucibleBestByKey', 'crucibleBestByRunKey', 'steam',
]);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function cleanCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

export function emptyAchievementBag() {
  return {
    schemaVersion: ACHIEVEMENTS_SCHEMA_VERSION,
    unlocked: {},
    counters: {},
    crucibleBestByKey: {},
    crucibleBestByRunKey: {},
    steam: {},
  };
}

function migrateUnlockRow(row) {
  if (row === true) return { at: null, via: null };
  const src = asObject(row);
  if (!src) return null;
  return {
    ...cloneJson(src),
    at: typeof src.at === 'string' ? src.at : null,
    via: typeof src.via === 'string' ? src.via : null,
  };
}

function migrateBag(raw) {
  const src = asObject(raw);
  const bag = emptyAchievementBag();
  if (!src) return bag;
  const version = Number.isInteger(src.schemaVersion) ? src.schemaVersion : 0;
  if (version < 1) return bag;
  const unlocked = asObject(src.unlocked) || {};
  for (const id of Object.keys(unlocked)) {
    if (typeof id !== 'string' || !id || id.length > 64) continue;
    const row = migrateUnlockRow(unlocked[id]);
    if (row) bag.unlocked[id] = row;
  }
  const counters = asObject(src.counters) || {};
  for (const key of Object.keys(counters)) {
    const n = cleanCount(counters[key]);
    if (n > 0) bag.counters[key] = n;
  }
  const bests = asObject(src.crucibleBestByKey) || {};
  for (const key of Object.keys(bests)) {
    if (typeof key !== 'string' || key.length > CRUCIBLE_BEST_KEY_MAX) continue;
    bag.crucibleBestByKey[key] = cleanCount(bests[key]);
  }
  // Same bounded read as crucibleBestByKey: this map is per record key and must not grow without
  // bound from a corrupt or hostile bag.
  const runBests = asObject(src.crucibleBestByRunKey) || {};
  for (const key of Object.keys(runBests)) {
    if (typeof key !== 'string' || key.length > CRUCIBLE_BEST_KEY_MAX) continue;
    bag.crucibleBestByRunKey[key] = cleanCount(runBests[key]);
  }
  const steam = asObject(src.steam) || {};
  for (const id of Object.keys(steam)) {
    if (steam[id] === true) bag.steam[id] = true;
  }
  for (const key of Object.keys(src)) {
    if (KNOWN_BAG_KEYS.has(key)) continue;
    const copy = cloneJson(src[key]);
    if (copy !== null || src[key] === null) bag[key] = copy;
  }
  return bag;
}

function unwrapEnvelope(parsed) {
  const src = asObject(parsed);
  if (!src) return null;
  if (src.fmt === ACHIEVEMENTS_FMT) return asObject(src.data) || src;
  if (Number.isInteger(src.schemaVersion) && (src.unlocked || src.counters)) return src;
  return null;
}

export function parseAchievementBag(raw) {
  if (raw == null || raw === '') return emptyAchievementBag();
  if (typeof raw !== 'string') return migrateBag(unwrapEnvelope(raw) || raw);
  try {
    return migrateBag(unwrapEnvelope(JSON.parse(raw)));
  } catch {
    return emptyAchievementBag();
  }
}

function earlierIso(a, b) {
  if (typeof a !== 'string' || !a) return typeof b === 'string' && b ? b : null;
  if (typeof b !== 'string' || !b) return a;
  return a <= b ? a : b;
}

/** Union of unlocks (earliest time wins), max of every counter; `primary` wins unknown keys. */
export function mergeAchievementBags(primary, secondary) {
  const a = migrateBag(primary);
  const b = migrateBag(secondary);
  const out = emptyAchievementBag();
  for (const key of Object.keys(b)) if (!KNOWN_BAG_KEYS.has(key)) out[key] = b[key];
  for (const key of Object.keys(a)) if (!KNOWN_BAG_KEYS.has(key)) out[key] = a[key];
  const ids = new Set([...Object.keys(a.unlocked), ...Object.keys(b.unlocked)]);
  for (const id of ids) {
    const ra = a.unlocked[id];
    const rb = b.unlocked[id];
    if (ra && rb) {
      const at = earlierIso(ra.at, rb.at);
      const base = at === rb.at && at !== ra.at ? { ...ra, ...rb } : { ...rb, ...ra };
      out.unlocked[id] = { ...base, at };
    } else {
      out.unlocked[id] = { ...(ra || rb) };
    }
  }
  for (const key of new Set([...Object.keys(a.counters), ...Object.keys(b.counters)])) {
    out.counters[key] = Math.max(cleanCount(a.counters[key]), cleanCount(b.counters[key]));
  }
  for (const key of new Set([...Object.keys(a.crucibleBestByKey), ...Object.keys(b.crucibleBestByKey)])) {
    out.crucibleBestByKey[key] = Math.max(cleanCount(a.crucibleBestByKey[key]), cleanCount(b.crucibleBestByKey[key]));
  }
  // A pre-run best of 0 is a real value, not an absence: it is the whole point of the key (it says
  // "this key had no record before this run"). So the merge keeps any key EITHER side declares,
  // rather than only non-zero ones.
  for (const key of new Set([...Object.keys(a.crucibleBestByRunKey), ...Object.keys(b.crucibleBestByRunKey)])) {
    out.crucibleBestByRunKey[key] = Math.max(
      cleanCount(a.crucibleBestByRunKey[key]), cleanCount(b.crucibleBestByRunKey[key]));
  }
  for (const id of new Set([...Object.keys(a.steam), ...Object.keys(b.steam)])) {
    if (a.steam[id] === true || b.steam[id] === true) out.steam[id] = true;
  }
  return out;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function sameJson(a, b) {
  try {
    return canonicalJson(a) === canonicalJson(b);
  } catch {
    return false;
  }
}

export function loadAchievementBag(storage = liveStorage()) {
  if (!storage || typeof storage.getItem !== 'function') return emptyAchievementBag();
  let raw = null;
  try {
    raw = storage.getItem(ACHIEVEMENTS_STORAGE_KEY);
  } catch {
    return emptyAchievementBag();
  }
  return parseAchievementBag(raw);
}

function boundBests(bag) {
  const keys = Object.keys(bag.crucibleBestByKey);
  // The pre-run map is bounded on the same terms and with the same rule: keep the highest values.
  // It is a derived convenience, never a source of truth, so trimming it can only cost a
  // beat-detection edge case, never an unlock.
  const runKeys = Object.keys(bag.crucibleBestByRunKey || {});
  if (runKeys.length > CRUCIBLE_BEST_KEY_CAP) {
    runKeys.sort((x, y) => (bag.crucibleBestByRunKey[y] - bag.crucibleBestByRunKey[x]) || (x < y ? -1 : 1));
    const nextRun = {};
    for (const key of runKeys.slice(0, CRUCIBLE_BEST_KEY_CAP)) nextRun[key] = bag.crucibleBestByRunKey[key];
    bag = { ...bag, crucibleBestByRunKey: nextRun };
  }
  if (keys.length <= CRUCIBLE_BEST_KEY_CAP) return bag;
  // Keep the highest bests: they are the ones a later run is least likely to beat by accident.
  keys.sort((x, y) => (bag.crucibleBestByKey[y] - bag.crucibleBestByKey[x]) || (x < y ? -1 : 1));
  const next = {};
  for (const key of keys.slice(0, CRUCIBLE_BEST_KEY_CAP)) next[key] = bag.crucibleBestByKey[key];
  return { ...bag, crucibleBestByKey: next };
}

/** The stored envelope's own savedAt, or null. */
export function readStoredAchievementSavedAt(storage = liveStorage()) {
  try {
    const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(ACHIEVEMENTS_STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.savedAt === 'string' ? parsed.savedAt : null;
  } catch {
    return null;
  }
}

/**
 * Write the bag after merging whatever the store already holds. Returns the merged bag or null.
 * `savedAt` pins the envelope time (a pre-sync write keeps the stored time); `push: false` keeps the
 * write local to this shell.
 */
export function saveAchievementBag(bag, storage = liveStorage(), { savedAt: pinnedSavedAt = null, push = true } = {}) {
  if (!storage || typeof storage.setItem !== 'function') return null;
  const merged = boundBests(mergeAchievementBags(bag, loadAchievementBag(storage)));
  const savedAt = typeof pinnedSavedAt === 'string' && pinnedSavedAt ? pinnedSavedAt : nowIso();
  let json;
  try {
    json = JSON.stringify({
      fmt: ACHIEVEMENTS_FMT,
      schemaVersion: ACHIEVEMENTS_SCHEMA_VERSION,
      savedAt,
      updatedAt: savedAt,
      data: merged,
    });
  } catch {
    return null;
  }
  try {
    storage.setItem(ACHIEVEMENTS_STORAGE_KEY, json);
  } catch {
    return null;
  }
  if (push && isSharedPlayerStoreKey(ACHIEVEMENTS_STORAGE_KEY) && sharedPlayerStoreAvailable()) {
    try {
      const pending = pushSharedPlayerStore({ [ACHIEVEMENTS_STORAGE_KEY]: json });
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch {
      // sharing is best-effort; the local bag already wrote
    }
  }
  return merged;
}

/* ---------------------------------------------------------------------------------------------- */
/* pure evaluation                                                                                 */
/* ---------------------------------------------------------------------------------------------- */

const NONE = Object.freeze([]);
const EMPTY_PAYLOAD = Object.freeze({});

function playerIdOf(context) {
  const state = context && context.state;
  return state && state.playerId != null ? state.playerId : null;
}

/**
 * Real bus event -> counter increments. Filters mirror the telemetry sink's own (EVENT_TAXONOMY):
 * a miner that is someone else does not count; trades and contracts count once per settlement.
 */
export const ACHIEVEMENT_EVENT_HANDLERS = Object.freeze({
  'dock:docked': () => [['docks', 1]],
  'mining:yield': (p, context) => {
    const qty = cleanCount(p && p.qty);
    if (qty <= 0) return NONE;
    const playerId = playerIdOf(context);
    if (p.minerId != null && playerId != null && p.minerId !== playerId) return NONE;
    return [['oreUnits', qty]];
  },
  'economy:tradeCompleted': (p) => (p && cleanCount(p.qty) > 0 ? [['trades', 1]] : NONE),
  'mission:completed': () => [['contracts', 1]],
  'jump:arrive': () => [['jumps', 1]],
  'tether:latched': () => [['latches', 1]],
  'massline:throw': () => [['throws', 1]],
  'tether:releaseRated': (p) => (p && p.classification === 'razor' ? [['razorReleases', 1]] : NONE),
  'tether:whipImpact': (p) => (p && p.rating === 'crushing' ? [['crushingImpacts', 1]] : NONE),
  'heat:changed': (p) => (p && p.wanted === true && p.wantedCrossed === true ? [['wantedTimes', 1]] : NONE),
  'credits:changed': (p) => {
    const delta = Number(p && p.delta);
    return Number.isFinite(delta) && delta > 0 ? [['creditsEarned', Math.floor(delta)]] : NONE;
  },
});

/**
 * Kill-provenance vocabulary the career layer counts by (src/combat/killCausality.js KillCause
 * values). Declared here rather than imported so the META ledger keeps no combat-module dependency.
 */
const KILL_CAUSE_KEYS = new Set(Object.freeze([
  'generic', 'kinetic', 'explosive', 'terrain_collision', 'ship_collision',
]));

/**
 * FB-102 career add-counters. Deliberately SEPARATE from ACHIEVEMENT_EVENT_HANDLERS: that table
 * is, by test contract, exactly the set of events feeding declared ACHIEVEMENT_COUNTERS, and the
 * career truths are not achievement inputs. Same add-model, same bag, own vocabulary.
 */
export const CAREER_EVENT_HANDLERS = Object.freeze({
  // The player's own hull losses, exactly once per defeat (combat.js guards the defeat path; the
  // world's radiation fallback fires only when combat.kill is unavailable).
  'player:death': () => [['shipsLost', 1]],
  // Kills by the kill provenance the owner already computes (combat.js
  // buildKillPresentationReceipt → presentation.cause), mirroring the stats.kills adjudication —
  // killerId === playerId, ships only.
  'entity:killed': (p, context) => {
    if (!p || p.type !== 'ship') return NONE;
    const playerId = playerIdOf(context);
    if (playerId == null || p.killerId !== playerId) return NONE;
    const cause = p.presentation && typeof p.presentation.cause === 'string'
      && KILL_CAUSE_KEYS.has(p.presentation.cause) ? p.presentation.cause : 'generic';
    return [[`killsBy:${cause}`, 1]];
  },
});

/** Apply one career add-event to the bag in place. Returns the counter keys that moved. */
export function applyCareerEvent(bag, event, payload, context = {}) {
  const handler = CAREER_EVENT_HANDLERS[event];
  if (!handler || !bag) return NONE;
  let increments;
  try {
    increments = handler(payload || EMPTY_PAYLOAD, context);
  } catch {
    return NONE;
  }
  if (!increments || increments.length === 0) return NONE;
  const moved = [];
  for (const [key, amount] of increments) {
    const n = cleanCount(amount);
    if (n <= 0) continue;
    bag.counters[key] = cleanCount(bag.counters[key]) + n;
    moved.push(key);
  }
  return moved;
}

/**
 * FB-102 max-counters: events whose career truth is the BEST value ever seen, not a sum. The
 * add-model tables cannot express a max, so these run alongside them in onCounterEvent.
 */
export const CAREER_MAX_EVENT_HANDLERS = Object.freeze({
  // massline:throw payload is runtime.lastThrow (masslineThrow.js): `payloadSpeed` is the
  // release solution's speed. Rounded to whole WU/s so the integer bag holds it honestly.
  'massline:throw': (p) => ({
    key: 'biggestThrowSpeed',
    value: Math.floor(Number(p && p.payloadSpeed) || 0),
  }),
});

/** Apply one max-event to the bag in place. Returns the counter key when it moved. */
export function applyCareerMaxEvent(bag, event, payload) {
  const handler = CAREER_MAX_EVENT_HANDLERS[event];
  if (!handler || !bag) return null;
  let row = null;
  try {
    row = handler(payload || EMPTY_PAYLOAD);
  } catch {
    return null;
  }
  if (!row || typeof row.key !== 'string') return null;
  const value = Math.floor(Number(row.value));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value <= cleanCount(bag.counters[row.key])) return null;
  bag.counters[row.key] = value;
  return row.key;
}

/** Apply one event to the bag's counters in place. Returns the counter keys that moved. */
export function applyAchievementEvent(bag, event, payload, context = {}) {
  const handler = ACHIEVEMENT_EVENT_HANDLERS[event];
  if (!handler || !bag) return NONE;
  let increments;
  try {
    increments = handler(payload || EMPTY_PAYLOAD, context);
  } catch {
    return NONE;
  }
  // heat:changed and credits:changed can publish every tick; an event that counts nothing must not
  // allocate anything on the way through.
  if (!increments || increments.length === 0) return NONE;
  const moved = [];
  for (const [key, amount] of increments) {
    const n = cleanCount(amount);
    if (n <= 0) continue;
    bag.counters[key] = cleanCount(bag.counters[key]) + n;
    moved.push(key);
  }
  return moved;
}

export function crucibleFactsFromProfile(profile) {
  const records = asObject(profile && profile.records) || {};
  const lifetime = asObject(records.lifetime) || {};
  const byDate = asObject(profile && profile.daily && profile.daily.byDate) || {};
  let dailyDays = 0;
  for (const key of Object.keys(byDate)) {
    const row = asObject(byDate[key]);
    if (row && cleanCount(row.attempts) > 0) dailyDays += 1;
  }
  return {
    runs: cleanCount(lifetime.runs),
    deepestWave: cleanCount(lifetime.deepestWave),
    dailyDays,
  };
}

/** Seed what the settled Crucible profile already proves (retroactive, max-merge, idempotent). */
export function seedBagFromCrucibleProfile(bag, profile) {
  const records = asObject(profile && profile.records) || {};
  const byKey = asObject(records.byKey) || {};
  for (const key of Object.keys(byKey)) {
    const row = asObject(byKey[key]);
    const best = cleanCount(row && row.bestScore);
    if (best > cleanCount(bag.crucibleBestByKey[key])) bag.crucibleBestByKey[key] = best;
  }
  const history = Array.isArray(profile && profile.history) ? profile.history : [];
  let extractions = 0;
  for (const row of history) if (row && row.outcome === 'extracted') extractions += 1;
  if (extractions > cleanCount(bag.counters.crucibleExtractions)) bag.counters.crucibleExtractions = extractions;
  return bag;
}

/** Telemetry career aggregates -> counters (max-merge). Only paths whose filters match ours. */
export const TELEMETRY_CAREER_SEEDS = Object.freeze({
  docks: (career) => career.navigation && career.navigation.docks,
  trades: (career) => (career.trades ? cleanCount(career.trades.buy) + cleanCount(career.trades.sell) : 0),
  contracts: (career) => career.missions && career.missions.completed,
  jumps: (career) => career.navigation && career.navigation.jumps,
  creditsEarned: (career) => career.credits && career.credits.earned,
});

export function seedBagFromTelemetryCareer(bag, career) {
  if (!asObject(career)) return bag;
  for (const [key, read] of Object.entries(TELEMETRY_CAREER_SEEDS)) {
    let value = 0;
    try { value = cleanCount(read(career)); } catch { value = 0; }
    if (value > cleanCount(bag.counters[key])) bag.counters[key] = value;
  }
  return bag;
}

/**
 * Crucible run settled: personal best against the pre-run snapshot, extraction count.
 *
 * The "did this run beat my record" test has to compare against the best that existed BEFORE this
 * run settled. Two facts make that non-obvious and were a live bug:
 *   1. the FIRST run on a key has no prior at all, so `prior > 0` alone never credits it — a
 *      player establishing a record earns nothing, which is the one moment that must always pay;
 *   2. survivalRecords settles the run into the profile BEFORE it emits run:resultsReady, and
 *      refreshCrucible() seeds bag.crucibleBestByKey from that profile. So by the time a later
 *      run arrives, the bag already holds the best including THAT run. Comparing score > prior
 *      against a profile-seeded value can therefore never fire, and crucibleBests stayed 0 forever
 *      on the live path (the achievement was unreachable).
 *
 * So the ledger keeps its own pre-run value per key (`crucibleBestBeforeRun`), refreshed on every
 * key transition, and the comparison is made against that. `applyCrucibleResult` therefore counts
 * a beat whenever the score is strictly above the best this key held before this run settled.
 */
export function applyCrucibleResult(bag, result) {
  const moved = [];
  if (!bag || !asObject(result)) return moved;
  const key = recordKey(result);
  const score = cleanCount(result.score);
  if (!asObject(bag.crucibleBestByRunKey)) bag.crucibleBestByRunKey = {};
  const beforeByKey = bag.crucibleBestByRunKey;
  // The pre-run best: the ledger's remembered value for this key, else whatever the bag recorded
  // (which may be profile-seeded, and is the best we can honestly claim we knew before).
  const prior = Number.isFinite(beforeByKey[key]) ? beforeByKey[key] : bag.crucibleBestByKey[key];
  if (score > cleanCount(prior)) {
    bag.counters.crucibleBests = cleanCount(bag.counters.crucibleBests) + 1;
    moved.push('crucibleBests');
  }
  if (score > cleanCount(bag.crucibleBestByKey[key])) bag.crucibleBestByKey[key] = score;
  else if (!(key in bag.crucibleBestByKey)) bag.crucibleBestByKey[key] = score;
  if (result.outcome === 'extracted' || result.extracted === true) {
    bag.counters.crucibleExtractions = cleanCount(bag.counters.crucibleExtractions) + 1;
    moved.push('crucibleExtractions');
  }
  return moved;
}

/**
 * Remember, per record key, the best that was known BEFORE the run now settling.
 *
 * Called with the result of a run that is ABOUT to be applied, and it deliberately OVERWRITES:
 * each settled run is a new comparison, so the pre-run value must be re-read every time. Setting
 * it only on first sight would pin the value from the very first run and let every later run
 * compare against a stale record — which is how a WORSE run got counted as a beat.
 *
 * Idempotent within a single run only because applyCrucibleResult runs immediately after; the
 * overwrite is what makes the NEXT run's comparison correct.
 */
export function rememberPreRunBest(bag, result) {
  if (!bag || !asObject(result)) return bag;
  const key = recordKey(result);
  if (!asObject(bag.crucibleBestByRunKey)) bag.crucibleBestByRunKey = {};
  bag.crucibleBestByRunKey[key] = cleanCount(bag.crucibleBestByKey[key]);
  return bag;
}

export function achievementProgress(def, bag, crucible) {
  const rule = def && def.rule;
  const target = rule && Number.isInteger(rule.target) ? rule.target : 1;
  let current = 0;
  if (rule && rule.source === 'counter') current = cleanCount(bag && bag.counters && bag.counters[rule.key]);
  else if (rule && rule.source === 'crucible') current = cleanCount(crucible && crucible[rule.key]);
  return { current, target, done: current >= target };
}

/** Ids whose rule is satisfied now (whether or not they are already recorded as unlocked). */
export function satisfiedAchievementIds(bag, crucible, defs = ACHIEVEMENTS) {
  const out = [];
  for (const def of defs) if (achievementProgress(def, bag, crucible).done) out.push(def.id);
  return out;
}

/* ---------------------------------------------------------------------------------------------- */
/* presentation rows (shared by the screen and the tests)                                          */
/* ---------------------------------------------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Sep 2026" from an ISO stamp, in UTC so two machines print the same day. */
export function formatUnlockDate(iso) {
  if (typeof iso !== 'string' || iso.length < 10) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatCount(n) {
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function achievementRows(bag, crucible, defs = ACHIEVEMENTS) {
  const safeBag = migrateBag(bag);
  return defs.map((def) => {
    const row = safeBag.unlocked[def.id] || null;
    const unlocked = !!row;
    const progress = achievementProgress(def, safeBag, crucible);
    const masked = def.hidden && !unlocked;
    let status;
    if (unlocked) {
      const date = formatUnlockDate(row.at);
      status = date ? `Unlocked ${date}` : 'Unlocked';
    } else if (!masked && progress.target > 1) {
      status = `${formatCount(Math.min(progress.current, progress.target))} / ${formatCount(progress.target)}`;
    } else {
      status = 'Locked';
    }
    return {
      id: def.id,
      category: def.category,
      name: masked ? HIDDEN_ACHIEVEMENT_COPY.name : def.name,
      description: masked ? HIDDEN_ACHIEVEMENT_COPY.description : def.description,
      hidden: def.hidden,
      masked,
      unlocked,
      at: row && row.at ? row.at : null,
      current: progress.current,
      target: progress.target,
      status,
    };
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* the live ledger                                                                                 */
/* ---------------------------------------------------------------------------------------------- */

let activeLedger = null;

export function getActiveAchievementLedger() {
  return activeLedger;
}

function safeLoadCrucibleMeta() {
  try {
    return loadCrucibleMeta();
  } catch {
    return null;
  }
}

/** Rows for the screen: the live ledger when installed, else the stored bag and profile. */
export function readAchievementRows() {
  if (activeLedger) return activeLedger.rows();
  const bag = loadAchievementBag();
  return achievementRows(bag, crucibleFactsFromProfile(safeLoadCrucibleMeta()));
}

/**
 * FB-102/FB-103: the read-only career-statistics read. Folds the ledger's flat counters into the
 * five career truths a statistics screen (or the death summary) needs — distance flown, the
 * biggest massline throw, hulls lost, kills grouped by kill-cause family, and time per sector —
 * plus the raw counter bag for every other reader. Reads the live ledger when installed, else
 * the stored bag; never writes and never creates state.
 */
export function careerStats(storage = liveStorage()) {
  const snapshot = activeLedger ? activeLedger.snapshot() : null;
  const counters = snapshot ? snapshot.counters : loadAchievementBag(storage).counters;
  const killsByWeapon = {};
  const timeBySector = {};
  for (const key of Object.keys(counters)) {
    if (typeof key !== 'string') continue;
    if (key.startsWith(KILLS_BY_PREFIX)) {
      killsByWeapon[key.slice(KILLS_BY_PREFIX.length)] = cleanCount(counters[key]);
    } else if (key.startsWith(SECTOR_TIME_PREFIX)) {
      timeBySector[key.slice(SECTOR_TIME_PREFIX.length)] = cleanCount(counters[key]);
    }
  }
  return Object.freeze({
    distanceFlownWu: cleanCount(counters[CAREER_KEY_DISTANCE_FLOWN]),
    biggestThrowSpeed: cleanCount(counters[CAREER_KEY_BIGGEST_THROW]),
    shipsLost: cleanCount(counters[CAREER_KEY_SHIPS_LOST]),
    killsByWeapon: Object.freeze(killsByWeapon),
    timeBySector: Object.freeze(timeBySector),
    counters: Object.freeze({ ...counters }),
  });
}

function resolveShell(explicit) {
  if (explicit !== undefined) return explicit;
  try {
    const win = globalThis.window;
    return win && win.spacefaceShell ? win.spacefaceShell : null;
  } catch {
    return null;
  }
}

/**
 * Install the ledger on a live bus. Options:
 *   bus        required; the game bus
 *   state      GameState, read only (player id for the ore filter, onboarding for the notice)
 *   telemetry  the local sink; career aggregates seed counters once (max-merge)
 *   storage    override (tests); default injected/localStorage/memory
 *   shell      override for window.spacefaceShell (tests); `null` disables the Steam mirror
 *   voice      false silences the one-voice notice
 */
export function installAchievements({
  bus,
  state = null,
  telemetry = null,
  storage = null,
  shell = undefined,
  voice = true,
} = {}) {
  if (!bus || typeof bus.on !== 'function') {
    throw new Error('[achievements] installAchievements({ bus }): a bus with .on() is required');
  }
  if (activeLedger) activeLedger.dispose();

  const store = storage || liveStorage();
  const eventContext = { state };
  const unsubs = [];
  const pendingNotice = [];
  let lastNotice = null;
  let saveTimer = null;
  let disposed = false;
  let bag = loadAchievementBag(store);
  let crucible = crucibleFactsFromProfile(null);
  // Until the save system's first shared-store sync lands, the store may still hold the other
  // shell's newer bag. Writes before then keep the stored envelope's own time and never push, so the
  // sync cannot mistake this shell's pre-sync copy for the newest one; onStoreSynced then unions both
  // and one fresh write propagates the result.
  let synced = !sharedPlayerStoreAvailable();
  const preSyncSavedAt = readStoredAchievementSavedAt(store) || EPOCH_ISO;
  let syncFallback = null;

  // ── FB-102 career samplers ─────────────────────────────────────────────────────────────────
  // The odometer samples the player's displacement on the near clock — a sim-time-gated read of
  // the live position on economy:tick, never a per-frame accumulation — and the sector clock
  // stamps sector:enter and settles on sector:exit. Every value runs on state.simTime, so the
  // counters stay deterministic; fractional remainders live in these closures and the bag keeps
  // the floored integers the save format stores.
  let odometer = { at: null, x: 0, z: 0 };
  let odometerTotal = cleanCount(bag.counters[CAREER_KEY_DISTANCE_FLOWN]);
  let sectorStamp = null;
  const sectorTotals = new Map();
  for (const key of Object.keys(bag.counters)) {
    if (typeof key === 'string' && key.startsWith(SECTOR_TIME_PREFIX)) {
      sectorTotals.set(key.slice(SECTOR_TIME_PREFIX.length), cleanCount(bag.counters[key]));
    }
  }

  function livePlayerPos() {
    let player = null;
    const entities = state && state.entities;
    if (entities && typeof entities.get === 'function') player = entities.get(state.playerId);
    else if (entities && typeof entities === 'object' && state.playerId != null) player = entities[state.playerId];
    const raw = (player && player.pos) || (state && state.player && state.player.pos) || null;
    const x = Number(raw && raw.x);
    const z = Number(raw && raw.z);
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  }

  function resetOdometerBaseline() {
    const pos = livePlayerPos();
    const t = simSeconds();
    if (!pos || t == null) {
      odometer.at = null;
      return;
    }
    odometer = { at: t, x: pos.x, z: pos.z };
  }

  function sampleOdometer(payload) {
    const t = Number(payload && payload.t);
    if (!Number.isFinite(t) || t < 0) return;
    const pos = livePlayerPos();
    if (!pos) {
      odometer.at = null; // no live position: resync on the next sample
      return;
    }
    if (odometer.at == null || t < odometer.at) {
      odometer = { at: t, x: pos.x, z: pos.z };
      return;
    }
    if (t - odometer.at < ODOMETER_MIN_INTERVAL_S) return; // hold the baseline across the gate
    const d = Math.hypot(pos.x - odometer.x, pos.z - odometer.z);
    // A teleport (jump arrival, undock reposition) is not distance flown: past the cap the
    // interval is dropped and only the baseline moves.
    if (Number.isFinite(d) && d < ODOMETER_TELEPORT_WU) {
      odometerTotal += d;
      bag.counters[CAREER_KEY_DISTANCE_FLOWN] = Math.floor(odometerTotal);
    }
    odometer = { at: t, x: pos.x, z: pos.z };
  }

  /** Fold the open residence into its sector counter and keep the stamp running. */
  function checkpointSectorStamp() {
    const stamp = sectorStamp;
    if (!stamp) return;
    const t = simSeconds();
    if (t == null) return;
    const dt = t - stamp.at;
    if (!Number.isFinite(dt) || dt <= 0) return;
    stamp.at = t;
    const total = (sectorTotals.get(stamp.sectorId) || 0) + dt;
    sectorTotals.set(stamp.sectorId, total);
    bag.counters[SECTOR_TIME_PREFIX + stamp.sectorId] = Math.floor(total);
  }

  function settleSectorStamp() {
    checkpointSectorStamp();
    sectorStamp = null;
  }

  function openSectorStamp(sectorId) {
    settleSectorStamp();
    if (typeof sectorId !== 'string' || !sectorId) return;
    const t = simSeconds();
    if (t == null) return;
    sectorStamp = { sectorId, at: t };
  }
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  function refreshCrucible() {
    const profile = safeLoadCrucibleMeta();
    if (profile) {
      seedBagFromCrucibleProfile(bag, profile);
      crucible = crucibleFactsFromProfile(profile);
    }
    return profile;
  }

  function saveNow() {
    if (saveTimer !== null) {
      try { clearTimeout(saveTimer); } catch { /* ignore */ }
      saveTimer = null;
    }
    checkpointSectorStamp();
    const merged = saveAchievementBag(bag, store, synced ? {} : { savedAt: preSyncSavedAt, push: false });
    if (merged) bag = merged;
  }

  function scheduleSave() {
    if (disposed || saveTimer !== null) return;
    if (typeof setTimeout === 'function') {
      saveTimer = setTimeout(() => { saveTimer = null; if (!disposed) saveNow(); }, COUNTER_SAVE_DEBOUNCE_MS);
      if (saveTimer && typeof saveTimer.unref === 'function') saveTimer.unref();
    } else {
      saveNow();
    }
  }

  function simSeconds() {
    const t = state && state.simTime;
    return Number.isFinite(t) ? t : null;
  }

  function speak(defs) {
    if (!voice || !defs.length || typeof bus.emit !== 'function') return;
    if (isOnboardingTeaching(state)) {
      // The tutorial owns the floor while it teaches (one voice). Hold the line until it finishes
      // rather than letting the arbiter drop it unspoken.
      for (const def of defs) {
        if (pendingNotice.length < PENDING_NOTICE_CAP && !pendingNotice.includes(def)) pendingNotice.push(def);
      }
      return;
    }
    // The notice keeps one stable voice id, so a second unlock replaces the line in place. Within the
    // line's own lifetime (sim clock), carry the earlier names forward instead of erasing them.
    const now = simSeconds();
    let lineDefs = defs;
    if (lastNotice && now != null && lastNotice.at != null
      && now >= lastNotice.at && now - lastNotice.at < ACHIEVEMENT_NOTICE_TTL_S) {
      lineDefs = [...lastNotice.defs.filter((def) => !defs.includes(def)), ...defs];
    }
    lastNotice = { at: now, defs: lineDefs };
    // Newest first, so the achievement just earned is never the one hidden behind the ellipsis.
    const names = lineDefs.map((def) => def.name).reverse();
    const text = names.length === 1
      ? `Achievement unlocked · ${names[0]}`
      : `${names.length} achievements unlocked · ${names.slice(0, 3).join(' · ')}${names.length > 3 ? ' · …' : ''}`;
    bus.emit('voice:say', {
      channel: 'news',
      kind: 'achievement',
      id: ACHIEVEMENT_NOTICE_ID,
      text,
      ttl: ACHIEVEMENT_NOTICE_TTL_S,
    });
  }

  function flushPendingNotice() {
    if (!pendingNotice.length || isOnboardingTeaching(state)) return;
    const defs = pendingNotice.splice(0, pendingNotice.length);
    speak(defs);
  }

  function mirrorToShell(ids) {
    const shellApi = resolveShell(shell);
    if (!shellApi || typeof shellApi.unlockAchievement !== 'function') return;
    for (const id of ids) {
      let pending;
      try {
        pending = shellApi.unlockAchievement(id);
      } catch {
        continue;
      }
      Promise.resolve(pending).then((res) => {
        if (disposed || !res || res.ok !== true || bag.steam[id] === true) return;
        bag.steam[id] = true;
        scheduleSave();
      }).catch(() => {});
    }
  }

  function syncSteamBacklog() {
    const shellApi = resolveShell(shell);
    if (!shellApi || typeof shellApi.steamStatus !== 'function') return;
    let pending;
    try {
      pending = shellApi.steamStatus();
    } catch {
      return;
    }
    Promise.resolve(pending).then((status) => {
      if (disposed || !status || status.available !== true) return;
      const backlog = Object.keys(bag.unlocked).filter((id) => achievementById(id) && bag.steam[id] !== true);
      if (backlog.length) mirrorToShell(backlog);
    }).catch(() => {});
  }

  /** Unlock every satisfied, unrecorded id. `announce` false = retroactive/merged (no notice). */
  function evaluate(via, { announce = true } = {}) {
    const fresh = [];
    for (const id of satisfiedAchievementIds(bag, crucible)) {
      if (bag.unlocked[id]) continue;
      bag.unlocked[id] = { at: nowIso(), via: via || null };
      fresh.push(achievementById(id));
    }
    if (!fresh.length) return fresh;
    saveNow();
    for (const def of fresh) {
      try {
        bus.emit(ACHIEVEMENT_UNLOCKED_EVENT, {
          id: def.id,
          name: def.name,
          category: def.category,
          at: bag.unlocked[def.id] ? bag.unlocked[def.id].at : null,
          via: via || null,
          retroactive: !announce,
        });
      } catch {
        // a presenter fault must never lose the unlock, which is already saved
      }
    }
    if (announce) speak(fresh);
    mirrorToShell(fresh.map((def) => def.id));
    return fresh;
  }

  function onCounterEvent(event, payload) {
    if (disposed) return;
    // applyAchievementEvent may return the shared frozen NONE — never push onto it.
    const moved = [...applyAchievementEvent(bag, event, payload, eventContext)];
    for (const key of applyCareerEvent(bag, event, payload, eventContext)) moved.push(key);
    const maxKey = applyCareerMaxEvent(bag, event, payload);
    if (maxKey) moved.push(maxKey);
    if (!moved.length) return;
    const fresh = evaluate(event);
    if (!fresh.length) scheduleSave();
    flushPendingNotice();
  }

  function onRunResults(result) {
    if (disposed) return;
    // survivalResults settles the run synchronously BEFORE it emits run:resultsReady, so the
    // profile already contains this run. refreshCrucible() below seeds the bag's best from that
    // profile — which is why the pre-run value has to be captured HERE, before the refresh, and
    // why it is keyed separately (see applyCrucibleResult). Capturing after the refresh compared
    // every run against a best that already included it, and crucibleBests never moved.
    rememberPreRunBest(bag, result);
    applyCrucibleResult(bag, result);
    refreshCrucible();
    const fresh = evaluate('run:resultsReady');
    if (!fresh.length) saveNow();
    flushPendingNotice();
  }

  function onStoreSynced() {
    if (disposed) return;
    synced = true;
    if (syncFallback !== null) {
      try { clearTimeout(syncFallback); } catch { /* ignore */ }
      syncFallback = null;
    }
    const stored = loadAchievementBag(store);
    bag = mergeAchievementBags(bag, stored);
    refreshCrucible();
    const fresh = evaluate('save:store-synced', { announce: false });
    if (!fresh.length && !sameJson(bag, stored)) saveNow();
    syncSteamBacklog();
  }

  // Boot: merge what the settled Crucible profile and the telemetry career already prove, unlock
  // retroactively without a notice, and let an attached Steam shell catch up on earlier unlocks.
  refreshCrucible();
  if (telemetry && typeof telemetry.getCareerStats === 'function') {
    try { seedBagFromTelemetryCareer(bag, telemetry.getCareerStats()); } catch { /* telemetry is optional */ }
  }
  const retro = evaluate('retroactive', { announce: false });
  if (!retro.length && !sameJson(bag, loadAchievementBag(store))) saveNow();
  if (!synced && typeof setTimeout === 'function') {
    // The save system emits save:store-synced on success and on failure alike; this only covers an
    // origin with a store but no save system, so its unlocks still propagate eventually.
    syncFallback = setTimeout(() => { syncFallback = null; if (!disposed && !synced) onStoreSynced(); }, SHARED_STORE_SYNC_FALLBACK_MS);
    if (syncFallback && typeof syncFallback.unref === 'function') syncFallback.unref();
  }

  for (const event of Object.keys(ACHIEVEMENT_EVENT_HANDLERS)) {
    const off = bus.on(event, (payload) => onCounterEvent(event, payload));
    if (typeof off === 'function') unsubs.push(off);
  }
  for (const event of Object.keys(CAREER_EVENT_HANDLERS)) {
    const off = bus.on(event, (payload) => onCounterEvent(event, payload));
    if (typeof off === 'function') unsubs.push(off);
  }
  // FB-102 samplers: odometer on economy:tick (the near clock the market already beats on),
  // sector residence on world's enter/exit pair, and a teleport reset at every dock and arrival
  // so repositioning never reads as flown distance.
  const offTick = bus.on('economy:tick', (payload) => { if (!disposed) sampleOdometer(payload); });
  if (typeof offTick === 'function') unsubs.push(offTick);
  const offSectorEnter = bus.on('sector:enter', (payload) => {
    if (disposed) return;
    openSectorStamp(payload && payload.sectorId);
    resetOdometerBaseline();
  });
  if (typeof offSectorEnter === 'function') unsubs.push(offSectorEnter);
  const offSectorExit = bus.on('sector:exit', (payload) => {
    if (disposed) return;
    const sectorId = payload && payload.sectorId != null ? String(payload.sectorId) : null;
    if (!sectorStamp || sectorId == null || sectorStamp.sectorId === sectorId) settleSectorStamp();
  });
  if (typeof offSectorExit === 'function') unsubs.push(offSectorExit);
  const offDockSample = bus.on('dock:docked', () => { if (!disposed) resetOdometerBaseline(); });
  if (typeof offDockSample === 'function') unsubs.push(offDockSample);
  const offResults = bus.on('run:resultsReady', onRunResults);
  if (typeof offResults === 'function') unsubs.push(offResults);
  const offSynced = bus.on('save:store-synced', onStoreSynced);
  if (typeof offSynced === 'function') unsubs.push(offSynced);
  const offTutorial = bus.on('tutorial:finished', () => flushPendingNotice());
  if (typeof offTutorial === 'function') unsubs.push(offTutorial);

  let onPageHide = null;
  try {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      onPageHide = () => { if (!disposed) saveNow(); };
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('beforeunload', onPageHide);
    }
  } catch {
    onPageHide = null;
  }

  syncSteamBacklog();

  const api = {
    name: 'achievements',
    rows: () => achievementRows(bag, crucible),
    snapshot: () => ({
      unlocked: cloneJson(bag.unlocked) || {},
      counters: { ...bag.counters },
      crucible: { ...crucible },
      unlockedCount: ACHIEVEMENTS.filter((def) => bag.unlocked[def.id]).length,
      total: ACHIEVEMENTS.length,
    }),
    isUnlocked: (id) => !!(bag && bag.unlocked[id]),
    pendingNoticeCount: () => pendingNotice.length,
    flush: () => { if (!disposed) saveNow(); },
    dispose({ flush = true } = {}) {
      if (disposed) return;
      if (flush) {
        settleSectorStamp();
        saveNow();
      }
      disposed = true;
      if (syncFallback !== null) {
        try { clearTimeout(syncFallback); } catch { /* ignore */ }
        syncFallback = null;
      }
      if (saveTimer !== null) {
        try { clearTimeout(saveTimer); } catch { /* ignore */ }
        saveTimer = null;
      }
      for (const off of unsubs) { try { off(); } catch { /* ignore */ } }
      unsubs.length = 0;
      if (onPageHide) {
        try {
          window.removeEventListener('pagehide', onPageHide);
          window.removeEventListener('beforeunload', onPageHide);
        } catch { /* ignore */ }
      }
      if (activeLedger === api) activeLedger = null;
    },
  };
  activeLedger = api;
  return api;
}

export { CRUCIBLE_FACTS, ACHIEVEMENT_COUNTERS };
