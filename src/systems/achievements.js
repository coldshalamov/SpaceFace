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
const SHARED_STORE_SYNC_FALLBACK_MS = 15000;
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

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

const KNOWN_BAG_KEYS = new Set(['schemaVersion', 'unlocked', 'counters', 'crucibleBestByKey', 'steam']);

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
    if (typeof key !== 'string' || key.length > 200) continue;
    bag.crucibleBestByKey[key] = cleanCount(bests[key]);
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

/** Crucible run settled: personal best against the pre-run snapshot, extraction count. */
export function applyCrucibleResult(bag, result) {
  const moved = [];
  if (!bag || !asObject(result)) return moved;
  const key = recordKey(result);
  const score = cleanCount(result.score);
  const prior = bag.crucibleBestByKey[key];
  if (Number.isFinite(prior) && prior > 0 && score > prior) {
    bag.counters.crucibleBests = cleanCount(bag.counters.crucibleBests) + 1;
    moved.push('crucibleBests');
  }
  if (score > cleanCount(prior)) bag.crucibleBestByKey[key] = score;
  else if (!(key in bag.crucibleBestByKey)) bag.crucibleBestByKey[key] = score;
  if (result.outcome === 'extracted' || result.extracted === true) {
    bag.counters.crucibleExtractions = cleanCount(bag.counters.crucibleExtractions) + 1;
    moved.push('crucibleExtractions');
  }
  return moved;
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
    const moved = applyAchievementEvent(bag, event, payload, eventContext);
    if (!moved.length) return;
    const fresh = evaluate(event);
    if (!fresh.length) scheduleSave();
    flushPendingNotice();
  }

  function onRunResults(result) {
    if (disposed) return;
    // survivalResults settles the run synchronously before it emits run:resultsReady, so the
    // profile read here already contains this run; the personal-best snapshot is taken from the
    // ledger's own pre-run copy first, then refreshed from the profile.
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
      if (flush) saveNow();
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
