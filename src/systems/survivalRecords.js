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
import { applyBank, buyHull, buyTrack, emptyHangar, migrateHangar } from '../data/swarmHangar.js';
import {
  applySwarmLadderResult,
  emptySwarmLadder,
  isSwarmLadderRun,
  migrateSwarmLadder,
  swarmLadderStarTotal,
} from '../data/swarmLadder.js';
import {
  applyCrossoverResult,
  crossoverFactsFor,
  emptyCrossover,
  migrateCrossover,
  registerCrossoverReader,
} from '../data/swarmCrossover.js';
import {
  earnedPerkIds,
  emptyPerks,
  migratePerks,
  normalizePerkLoadout,
} from '../data/swarmPerks.js';
import { swarmThreatBountyMult, swarmThreatMutatorIds } from '../data/swarmThreats.js';

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
export const BEST_LINE_RETAIN_CAP = 5;
export const RECORD_RULE_FIELDS = Object.freeze(['mode', 'arenaId', 'balanceRevision', 'physicsRevision', 'scoringRevision', 'difficulty', 'loadoutRules', 'simulationAssistProfile']);

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

/**
 * The launch-config fields that decide whether a ghost is a comparable run (INF-037).
 * `difficulty` is deliberately NOT among them: it varies wave by wave and the door never
 * selects it, so comparing it would reject identical configurations. Revisions, ruleset,
 * arena, build, and assists are fixed at launch — those are what "same seed, same run"
 * has to mean.
 */
export const GHOST_RULE_FIELDS = Object.freeze([
  'mode', 'arenaId', 'balanceRevision', 'physicsRevision', 'scoringRevision',
  'loadoutRules', 'simulationAssistProfile',
]);

const GHOST_FIELD_WORDS = Object.freeze({
  mode: 'ruleset',
  arenaId: 'arena',
  balanceRevision: 'balance rules',
  physicsRevision: 'physics rules',
  scoringRevision: 'scoring rules',
  loadoutRules: 'build',
  simulationAssistProfile: 'assists',
});

/** Loadout rules compared as rules, not strings: mutator order is not a different build. */
function loadoutRulesEqual(a, b) {
  if (a === b) return true;
  let parsedA = null;
  let parsedB = null;
  try {
    parsedA = typeof a === 'string' ? JSON.parse(a) : a;
    parsedB = typeof b === 'string' ? JSON.parse(b) : b;
  } catch {
    return false;
  }
  if (!parsedA || !parsedB || typeof parsedA !== 'object' || typeof parsedB !== 'object') return false;
  if ((parsedA.ruleset ?? null) !== (parsedB.ruleset ?? null)) return false;
  if ((parsedA.starter ?? null) !== (parsedB.starter ?? null)) return false;
  // A stamp predating stakes raced under what is now the contender contract: absent ≡ contender.
  if ((parsedA.stake ?? 'contender') !== (parsedB.stake ?? 'contender')) return false;
  const mutatorsA = [...(Array.isArray(parsedA.mutators) ? parsedA.mutators : [])].sort();
  const mutatorsB = [...(Array.isArray(parsedB.mutators) ? parsedB.mutators : [])].sort();
  return mutatorsA.length === mutatorsB.length && mutatorsA.every((entry, index) => entry === mutatorsB[index]);
}

/**
 * Whether a ghost row may be raced under pending rules (INF-037). `compatible` only when
 * every launch-config field is known on both sides and equal; `incompatible` with the
 * differing fields named; `unknown` when either side carries no stamp — an old row is
 * never rewritten and never rejected on a guess.
 */
export function ghostComparability(rowRules, currentRules) {
  const row = rowRules && typeof rowRules === 'object' && !Array.isArray(rowRules) ? rowRules : null;
  const current = currentRules && typeof currentRules === 'object' && !Array.isArray(currentRules) ? currentRules : null;
  if (!row || !current) return { status: 'unknown', mismatches: [] };
  if (!GHOST_RULE_FIELDS.some((field) => row[field] != null)
    || !GHOST_RULE_FIELDS.some((field) => current[field] != null)) {
    return { status: 'unknown', mismatches: [] };
  }
  const mismatches = [];
  let unknown = false;
  for (const field of GHOST_RULE_FIELDS) {
    const left = row[field];
    const right = current[field];
    if (left == null || right == null) {
      unknown = true;
      continue;
    }
    const equal = field === 'loadoutRules' ? loadoutRulesEqual(left, right) : left === right;
    if (!equal) mismatches.push(field);
  }
  if (mismatches.length) return { status: 'incompatible', mismatches };
  if (unknown) return { status: 'unknown', mismatches: [] };
  return { status: 'compatible', mismatches: [] };
}

export function ghostRaceOffer(profile, seed, currentRules = null) {
  const row = lastGhostForSeed(profile, seed);
  if (!row) {
    return {
      available: false,
      hash: null,
      label: 'Ghost',
      blurb: 'No ghost for this seed yet.',
      comparability: 'none',
      mismatches: [],
    };
  }
  const hash = row.hash >>> 0;
  const { status, mismatches } = ghostComparability(row.recordRules, currentRules);
  if (status === 'incompatible') {
    const words = mismatches.map((field) => GHOST_FIELD_WORDS[field] || field);
    return {
      available: false,
      hash,
      label: 'Ghost',
      blurb: `Same seed, different run — the ghost differs in ${words.join(', ')}.`,
      comparability: 'incompatible',
      mismatches: mismatches.slice(),
    };
  }
  if (status === 'unknown') {
    return {
      available: true,
      hash,
      label: 'Ghost',
      blurb: 'Race the last recorded hull for this seed. Its rules stamp is missing — comparability unknown.',
      comparability: 'unknown',
      mismatches: [],
    };
  }
  return {
    available: true,
    hash,
    label: 'Ghost',
    blurb: 'Race the last recorded hull for this seed. Same rules, same arena, same assists.',
    comparability: 'compatible',
    mismatches: [],
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

/* ---------------------------------------------------------------------------------------------- */
/* SWARM-06 §8 — the challenge ledger. One paid row per daily date and per weekly mutator: a run  */
/* that reaches its bar banks the Bounty once, and the ledger feeds the challenge-gated perk      */
/* earns (Bounty Hunter). Rewards land on the Hangar bounty — Swarm's own wallet, never           */
/* Adventure credits.                                                                             */
/* ---------------------------------------------------------------------------------------------- */

export const SWARM_CHALLENGE_DAILY_WAVES = 5;
export const SWARM_CHALLENGE_DAILY_BOUNTY = 150;
export const SWARM_CHALLENGE_WEEKLY_WAVES = 10;
export const SWARM_CHALLENGE_WEEKLY_BOUNTY = 300;

function emptyChallenges() {
  return { daily: {}, weekly: {} };
}

function migrateChallenges(raw) {
  const out = emptyChallenges();
  const src = asObject(raw);
  if (!src) return out;
  const dailyIn = asObject(src.daily) ? src.daily : {};
  for (const key of Object.keys(dailyIn)) {
    const row = asObject(dailyIn[key]);
    const dateKey = isUtcDateKey(key) ? key : (row && isUtcDateKey(row.dateKey) ? row.dateKey : '');
    if (!dateKey || !row) continue;
    out.daily[dateKey] = {
      dateKey,
      wavesCleared: Number.isInteger(row.wavesCleared) && row.wavesCleared >= 0 ? row.wavesCleared : 0,
      bounty: Number.isInteger(row.bounty) && row.bounty >= 0 ? row.bounty : 0,
      at: typeof row.at === 'string' && row.at ? row.at : null,
    };
  }
  const weeklyIn = asObject(src.weekly) ? src.weekly : {};
  for (const key of Object.keys(weeklyIn)) {
    const row = asObject(weeklyIn[key]);
    const weekKey = isUtcWeekKey(key) ? key : (row && isUtcWeekKey(row.weekKey) ? row.weekKey : '');
    if (!weekKey || !row) continue;
    out.weekly[weekKey] = {
      weekKey,
      mutatorId: typeof row.mutatorId === 'string' ? row.mutatorId : null,
      wavesCleared: Number.isInteger(row.wavesCleared) && row.wavesCleared >= 0 ? row.wavesCleared : 0,
      bounty: Number.isInteger(row.bounty) && row.bounty >= 0 ? row.bounty : 0,
      at: typeof row.at === 'string' && row.at ? row.at : null,
    };
  }
  return out;
}

/** Finished challenges, the count the perk earns read. A paid row is a finished challenge. */
export function crucibleChallengesDone(profile) {
  const bag = migrateChallenges(profile && profile.challenges);
  return Object.keys(bag.daily).length + Object.keys(bag.weekly).length;
}

/**
 * What this settled run pays into the Hangar bounty, and the ledger rows it claims. Pure on
 * the inputs — the caller applies the bounty to bank.hangar and the rows to profile.challenges.
 * Bars: a daily-seeded run banks on its date once it clears five waves; a run under the weekly
 * mutator banks once for the week at ten. Anything else pays nothing and writes nothing.
 */
function challengePayoutFor(compact, challenges, recordedAt) {
  const bag = migrateChallenges(challenges);
  const paid = [];
  const waves = Number.isInteger(compact && compact.wavesCleared) ? compact.wavesCleared : 0;
  const ruleset = compact && compact.ruleset;
  const isSwarm = ruleset === 'swarm';
  const dailyKey = compact && typeof compact.dailyDateKey === 'string' && isUtcDateKey(compact.dailyDateKey)
    ? compact.dailyDateKey : null;
  if (isSwarm && dailyKey && !bag.daily[dailyKey] && waves >= SWARM_CHALLENGE_DAILY_WAVES) {
    bag.daily[dailyKey] = { dateKey: dailyKey, wavesCleared: waves, bounty: SWARM_CHALLENGE_DAILY_BOUNTY, at: recordedAt };
    paid.push({ kind: 'daily', key: dailyKey, bounty: SWARM_CHALLENGE_DAILY_BOUNTY });
  }
  const mutators = compact && Array.isArray(compact.mutators) ? compact.mutators : [];
  const weekKey = utcWeekKeyFromIso(recordedAt);
  const weeklyId = weeklyMutatorForWeekKey(weekKey);
  if (isSwarm && weekKey && weeklyId && mutators.includes(weeklyId) && !bag.weekly[weekKey]
    && waves >= SWARM_CHALLENGE_WEEKLY_WAVES) {
    bag.weekly[weekKey] = { weekKey, mutatorId: weeklyId, wavesCleared: waves, bounty: SWARM_CHALLENGE_WEEKLY_BOUNTY, at: recordedAt };
    paid.push({ kind: 'weekly', key: weekKey, bounty: SWARM_CHALLENGE_WEEKLY_BOUNTY });
  }
  return { challenges: bag, paid };
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
    bestLines: [],
    hangar: emptyHangar(),
    // SWARM-04: the curated ladder — per-arena zones (stars + best chain), the deepest wave
    // seen, and the checkpoint a cleared zone boss unlocked. Empty until the first ladder run.
    ladder: emptySwarmLadder(),
    // SWARM-06: the crossover ledger (what a Swarm run proved, so Adventure can sell it), the
    // perk loadout (the pick only — earns are derived from the ladder and challenges), and the
    // challenge ledger (one paid row per daily date / weekly mutator).
    crossover: emptyCrossover(),
    perks: emptyPerks(),
    challenges: emptyChallenges(),
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
    // Historical rows keep their absent metadata. Never promote a v1 pose tape into a causal line.
    bestLines: Array.isArray(src.bestLines) ? src.bestLines.map(normalizeBestLine).filter(Boolean).slice(0, BEST_LINE_RETAIN_CAP) : [],
    // Schema stays at 1. Unknown-key copy runs only above that, so the hangar has to be named here.
    hangar: migrateHangar(src.hangar),
    ladder: migrateSwarmLadder(src.ladder),
    crossover: migrateCrossover(src.crossover),
    perks: migratePerks(src.perks),
    challenges: migrateChallenges(src.challenges),
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
        || key === 'bestLines'
        || key === 'hangar'
        || key === 'ladder'
        || key === 'crossover'
        || key === 'perks'
        || key === 'challenges'
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
  // INF-037: the rules stamp survives migration; rows that predate it stay unstamped.
  const stamp = asObject(src.recordRules);
  return {
    hash,
    seed: tape.seed,
    hullId: tape.hullId,
    frameCount: tape.frames.length,
    frames: tape.frames,
    recordedAt: typeof src.recordedAt === 'string' ? src.recordedAt : null,
    recordRules: stamp ? { ...stamp } : null,
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

function upsertGhost(ghosts, tape, recordedAt, recordRules = null) {
  const canonical = canonicalGhostTape(tape);
  if (!canonical.frames.length) return ghosts && ghosts.byHash ? ghosts : emptyGhosts();
  const hash = ghostHash(canonical);
  const prevBag = ghosts && asObject(ghosts) ? ghosts : emptyGhosts();
  const byHash = { ...(asObject(prevBag.byHash) ? prevBag.byHash : {}) };
  // INF-037: the launch-config stamp travels with the tape, so a later door can say
  // whether the same seed is the same run. Old rows keep no stamp and read as unknown.
  let stamp = null;
  try {
    stamp = recordRules && typeof recordRules === 'object' ? cloneJson(recordRules) : null;
  } catch {
    stamp = null;
  }
  byHash[String(hash)] = {
    hash,
    seed: canonical.seed,
    hullId: canonical.hullId,
    frameCount: canonical.frames.length,
    frames: canonical.frames,
    recordedAt: typeof recordedAt === 'string' ? recordedAt : nowIso(),
    recordRules: stamp,
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

/* ---------------------------------------------------------------------------------------------- */
/* SWARM-05 §7.2 — the door is the hangar. Buys pass through the swarmHangar owner's own verbs    */
/* against the profile bag this module alone persists: load, buy, save. A refused buy returns the  */
/* owner's reason verbatim — the surface shows it, never a guessed one.                            */
/* ---------------------------------------------------------------------------------------------- */

export function buyCrucibleHangarTrack(trackId, storage = liveStorage()) {
  const profile = loadCrucibleMeta(storage);
  const result = buyTrack(profile && profile.hangar, trackId);
  if (!result || !result.ok) return { ok: false, reason: (result && result.reason) || 'refused', hangar: profile.hangar };
  profile.hangar = result.hangar;
  if (!saveCrucibleMeta(profile, storage)) return { ok: false, reason: 'save_failed', hangar: result.hangar };
  return { ok: true, hangar: result.hangar, rank: result.rank, price: result.price, profile };
}

export function buyCrucibleHangarHull(hullId, price, storage = liveStorage()) {
  const profile = loadCrucibleMeta(storage);
  const result = buyHull(profile && profile.hangar, hullId, price);
  if (!result || !result.ok || result.duplicate === true) {
    return { ok: false, reason: result && result.duplicate ? 'owned' : (result && result.reason) || 'refused', hangar: profile.hangar };
  }
  profile.hangar = result.hangar;
  if (!saveCrucibleMeta(profile, storage)) return { ok: false, reason: 'save_failed', hangar: result.hangar };
  return { ok: true, hangar: result.hangar, profile };
}

/* ---------------------------------------------------------------------------------------------- */
/* SWARM-06 §4.3/§8 — the perk loadout and the door's read of the depth ledgers. Earns are derived */
/* here too: the same ladder star total the arena gates read, plus finished challenges, so the    */
/* door and the run-stamp can never disagree about what a profile earned.                          */
/* ---------------------------------------------------------------------------------------------- */

/** The perks the profile may slot right now — derived, never stored. */
export function crucibleEarnedPerkIds(profile = null, storage = liveStorage()) {
  const bag = profile ? migrateProfile(profile) : loadCrucibleMeta(storage);
  return earnedPerkIds(bag, {
    starTotal: swarmLadderStarTotal(bag.ladder),
    challengesDone: crucibleChallengesDone(bag),
  });
}

/**
 * Persist the door's two-slot pick. Unknown and unearned ids drop through normalizePerkLoadout —
 * a hand-written bag cannot slot a locked perk — and the surviving pick is what runSession will
 * stamp on the next run.
 */
export function setCruciblePerkLoadout(ids, storage = liveStorage()) {
  const profile = loadCrucibleMeta(storage);
  const loadout = normalizePerkLoadout(ids, crucibleEarnedPerkIds(profile, storage));
  profile.perks = { loadout };
  if (!saveCrucibleMeta(profile, storage)) return { ok: false, reason: 'save_failed', loadout };
  return { ok: true, loadout, profile };
}

/**
 * What the Hangar door shows for the depth layer: the earned Saucer (and any future crossover
 * rows), the perk catalog with earn state and the stored pick, and the challenge ledgers' fresh
 * claim state so the door can say "today's bounty is still on the table" honestly.
 */
export function crucibleSwarmDepthView(profile = null, storage = liveStorage()) {
  const bag = profile ? migrateProfile(profile) : loadCrucibleMeta(storage);
  const challenges = migrateChallenges(bag.challenges);
  const dateKey = utcDateKeyNow();
  const weekKey = utcWeekKeyNow();
  const weeklyId = weeklyMutatorForNow();
  const earned = crucibleEarnedPerkIds(bag, storage);
  const loadout = normalizePerkLoadout(
    bag.perks && bag.perks.loadout,
    earned,
  );
  return {
    crossover: migrateCrossover(bag.crossover),
    perks: {
      earned,
      loadout,
      slots: 2,
    },
    challenges: {
      done: crucibleChallengesDone(bag),
      daily: {
        dateKey,
        claimed: !!(dateKey && challenges.daily[dateKey]),
        waves: SWARM_CHALLENGE_DAILY_WAVES,
        bounty: SWARM_CHALLENGE_DAILY_BOUNTY,
      },
      weekly: {
        weekKey,
        mutatorId: weeklyId || null,
        claimed: !!(weekKey && challenges.weekly[weekKey]),
        waves: SWARM_CHALLENGE_WEEKLY_WAVES,
        bounty: SWARM_CHALLENGE_WEEKLY_BOUNTY,
      },
    },
    stars: swarmLadderStarTotal(bag.ladder),
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* additive profile merge (FB-104 — save-file transport carries the bag across machines)           */
/* ---------------------------------------------------------------------------------------------- */

function mergeInt(a, b) {
  const x = Number.isInteger(a) && a >= 0 ? a : 0;
  const y = Number.isInteger(b) && b >= 0 ? b : 0;
  return Math.max(x, y);
}

function mergeRecordRow(ra, rb) {
  const a = asObject(ra);
  const b = asObject(rb);
  if (!a && !b) return emptyRecord();
  if (!a) return { ...b };
  if (!b) return { ...a };
  // Unknown future fields survive on the primary copy; the named fields below always resolve
  // upward so a merge can never lower a best or drop a counter.
  const out = { ...emptyRecord(), ...b, ...a };
  for (const key of ['attempts', 'victories', 'bestScore', 'deepestWave', 'bestKills', 'tieCount']) {
    out[key] = mergeInt(a[key], b[key]);
  }
  // bestResult is the comparable run under recordRules — the stronger one wins; an incomparable
  // pair keeps the imported row (it is the newer claim to the slot).
  const ar = asObject(a.bestResult);
  const br = asObject(b.bestResult);
  let best = null;
  if (ar && br) {
    const order = compareRunRecords(ar, br);
    best = order == null || order >= 0 ? ar : br;
  } else {
    best = ar || br;
  }
  out.bestResult = best ? cloneJson(best) : null;
  out.bestSeed = best && Number.isInteger(best.seed) ? best.seed : mergeInt(a.bestSeed, b.bestSeed);
  const tied = [];
  const seen = new Set();
  const tiedIn = [
    ...(Array.isArray(a.tiedResults) ? a.tiedResults : []),
    ...(Array.isArray(b.tiedResults) ? b.tiedResults : []),
  ];
  for (const row of tiedIn) {
    if (!asObject(row)) continue;
    const sig = stableStringify(row);
    if (seen.has(sig)) continue;
    seen.add(sig);
    tied.push(cloneJson(row));
    if (tied.length >= CRUCIBLE_HISTORY_LIMIT) break;
  }
  out.tiedResults = tied;
  return out;
}

function mergeDailyRow(key, ra, rb) {
  const a = asObject(ra);
  const b = asObject(rb);
  if (!a && !b) return null;
  if (!a) return { ...b };
  if (!b) return { ...a };
  const out = { ...b, ...a };
  out.dateKey = isUtcDateKey(a.dateKey) ? a.dateKey : (isUtcDateKey(b.dateKey) ? b.dateKey : key);
  out.bestScore = mergeInt(a.bestScore, b.bestScore);
  out.deepestWave = mergeInt(a.deepestWave, b.deepestWave);
  out.attempts = mergeInt(a.attempts, b.attempts);
  // The newer stamp owns the displayed outcome and seed; a tie keeps the imported row.
  const at = typeof a.recordedAt === 'string' ? a.recordedAt : '';
  const bt = typeof b.recordedAt === 'string' ? b.recordedAt : '';
  const newer = at >= bt ? a : b;
  out.lastOutcome = newer.lastOutcome || a.lastOutcome || b.lastOutcome || null;
  out.seed = Number.isInteger(newer.seed) && newer.seed > 0 ? newer.seed : mergeInt(a.seed, b.seed);
  out.recordedAt = newer.recordedAt || null;
  return out;
}

function mergeHistoryRows(aRows, bRows) {
  // Oldest-first union — the file's rows first, then stored rows it never carried (usually the
  // newer tail when the same machine kept playing after export). Rows dedupe on their canonical
  // content so an export→wipe→import round trip restores the timeline once.
  const out = [];
  const seen = new Set();
  for (const row of [...aRows, ...bRows]) {
    if (!asObject(row)) continue;
    const sig = stableStringify(row);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(cloneJson(row));
  }
  return out.slice(-CRUCIBLE_HISTORY_LIMIT);
}

/**
 * Additive union of two crucible profiles (FB-104). `primary` is the imported bag, `secondary`
 * the stored one. Merge law mirrors mergeAchievementBags: collections union (imported row wins a
 * true same-key conflict), every counter and every best takes the max, and the comparable
 * bestResult keeps the stronger run — an import can never lower a record. Unknown future-schema
 * keys pass through, primary winning. Re-running the merge on its own output is a no-op.
 */
export function mergeCrucibleProfiles(primary, secondary) {
  const a = migrateProfile(primary);
  const b = migrateProfile(secondary);
  const out = emptyCrucibleProfile();
  // Union of unlocks — the same key names the same unlock, so the imported row simply wins.
  out.unlocks = { ...b.unlocks, ...a.unlocks };
  // Records: lifetime counters max, per-key rows merge upward under the record rules.
  const lifetime = emptyLifetime();
  const la = asObject(a.records && a.records.lifetime) ? a.records.lifetime : {};
  const lb = asObject(b.records && b.records.lifetime) ? b.records.lifetime : {};
  for (const key of Object.keys(lifetime)) lifetime[key] = mergeInt(la[key], lb[key]);
  const byKeyA = asObject(a.records && a.records.byKey) ? a.records.byKey : {};
  const byKeyB = asObject(b.records && b.records.byKey) ? b.records.byKey : {};
  const byKey = {};
  for (const key of new Set([...Object.keys(byKeyA), ...Object.keys(byKeyB)])) {
    byKey[key] = mergeRecordRow(byKeyA[key], byKeyB[key]);
  }
  out.records = { byKey, lifetime };
  out.history = mergeHistoryRows(
    Array.isArray(a.history) ? a.history : [],
    Array.isArray(b.history) ? b.history : [],
  );
  // Daily boards: per-date merge upward; the freshest stamp keeps the displayed outcome.
  const dailyA = asObject(a.daily && a.daily.byDate) ? a.daily.byDate : {};
  const dailyB = asObject(b.daily && b.daily.byDate) ? b.daily.byDate : {};
  const byDate = {};
  for (const key of new Set([...Object.keys(dailyA), ...Object.keys(dailyB)])) {
    const row = mergeDailyRow(key, dailyA[key], dailyB[key]);
    if (row) byDate[row.dateKey] = row;
  }
  out.daily = { byDate: pruneDailyByDate(byDate) };
  // Ghosts: a hash names one tape, so a same-key conflict is the same run — the fresher stamp
  // wins the display fields. lastHash tracks the newest recordedAt across the union.
  const ghostA = asObject(a.ghosts && a.ghosts.byHash) ? a.ghosts.byHash : {};
  const ghostB = asObject(b.ghosts && b.ghosts.byHash) ? b.ghosts.byHash : {};
  const byHash = {};
  for (const key of new Set([...Object.keys(ghostA), ...Object.keys(ghostB)])) {
    const ra = asObject(ghostA[key]);
    const rb = asObject(ghostB[key]);
    if (ra && rb) {
      const at = typeof ra.recordedAt === 'string' ? ra.recordedAt : '';
      const bt = typeof rb.recordedAt === 'string' ? rb.recordedAt : '';
      byHash[key] = cloneJson(at >= bt ? ra : rb);
    } else {
      byHash[key] = cloneJson(ra || rb);
    }
  }
  const pruned = pruneGhostsByHash(byHash);
  let lastHash = null;
  let lastAt = '';
  for (const row of Object.values(pruned)) {
    const at = typeof row.recordedAt === 'string' ? row.recordedAt : '';
    if (lastHash == null || at >= lastAt) { lastAt = at; lastHash = row.hash; }
  }
  out.ghosts = { byHash: pruned, lastHash };
  // Best lines union by canonical id, points-descending, same retain cap as retainBestLine.
  const lines = [];
  const seenIds = new Set();
  for (const line of [
    ...(Array.isArray(a.bestLines) ? a.bestLines : []),
    ...(Array.isArray(b.bestLines) ? b.bestLines : []),
  ]) {
    if (!asObject(line)) continue;
    const id = typeof line.id === 'string' && line.id ? line.id : stableStringify(line);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    lines.push(cloneJson(line));
  }
  out.bestLines = lines.sort((x, y) => (y.points || 0) - (x.points || 0)).slice(0, BEST_LINE_RETAIN_CAP);
  // Hangar: bounty and the reroll counter are wallet-style totals (max), per-track ranks are
  // purchased progression (per-track max), settled keys and owned hulls union — a settled key
  // must stay settled on both sides so neither run can be banked twice, and a hull either
  // side owns stays owned. migrateProfile already normalized both bags into the same shape.
  const hangarA = asObject(a.hangar) ? a.hangar : emptyHangar();
  const hangarB = asObject(b.hangar) ? b.hangar : emptyHangar();
  const ranks = {};
  for (const key of new Set([...Object.keys(hangarA.ranks || {}), ...Object.keys(hangarB.ranks || {})])) {
    ranks[key] = mergeInt((hangarA.ranks || {})[key], (hangarB.ranks || {})[key]);
  }
  out.hangar = {
    bounty: mergeInt(hangarA.bounty, hangarB.bounty),
    ranks,
    settledKeys: [...new Set([...(hangarB.settledKeys || []), ...(hangarA.settledKeys || [])])].slice(-80),
    ownedHulls: [...new Set([...(hangarB.ownedHulls || []), ...(hangarA.ownedHulls || [])])],
    rerollsUsed: mergeInt(hangarA.rerollsUsed, hangarB.rerollsUsed),
  };
  // SWARM-06: crossover is a union — a hull either side proved stays proved. The perk loadout
  // is one pick, so the primary's pick wins when it carries one; the secondary's fills an empty
  // hand. Challenges union by their own keys (a paid date stays paid either way).
  const crossA = migrateCrossover(a.crossover);
  const crossB = migrateCrossover(b.crossover);
  out.crossover = { earned: { ...crossB.earned, ...crossA.earned } };
  const loadA = Array.isArray(a.perks && a.perks.loadout) ? a.perks.loadout : [];
  const loadB = Array.isArray(b.perks && b.perks.loadout) ? b.perks.loadout : [];
  out.perks = migratePerks({ loadout: loadA.length ? loadA : loadB });
  const chA = migrateChallenges(a.challenges);
  const chB = migrateChallenges(b.challenges);
  out.challenges = {
    daily: { ...chB.daily, ...chA.daily },
    weekly: { ...chB.weekly, ...chA.weekly },
  };
  // Unknown top-level keys (a newer schema riding inside the bag) pass through; the imported
  // copy wins a conflict, matching migrateProfile's own passthrough rule.
  for (const key of Object.keys(b)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = b[key];
  }
  for (const key of Object.keys(a)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = a[key];
  }
  return out;
}

export function recordRulesFor(result = {}, run = {}) {
  const provided = result.recordRules || run.recordRules || {};
  const rules = {};
  for (const key of RECORD_RULE_FIELDS) {
    const value = provided[key] ?? result[key] ?? run[key];
    rules[key] = (typeof value === 'string' && value) || Number.isFinite(value) ? value : null;
  }
  // An explicit practice flag wins over a provided mode: practice runs must never file into a
  // main-mode comparison even when the run's rules were stamped before the flag was read.
  if (result.practice === true || run.practice === true) rules.mode = 'practice';
  else rules.mode ??= result.ruleset ?? run.ruleset ?? run.kind ?? null;
  rules.arenaId ??= result.arenaId ?? run.arenaId ?? null;
  rules.mutators = normalizeMutators(provided.mutators ?? result.mutators ?? run.mutators);
  rules.complete = RECORD_RULE_FIELDS.every(key => rules[key] != null);
  return rules;
}

export function recordKey(result = {}) {
  const rules = recordRulesFor(result);
  return `pq146:${stableStringify(rules)}`;
}

/** null means unknown evidence, never an assumed zero-percent round. */
export function roundProgress(result = {}) {
  const entered = result.highestRoundEntered ?? result.deepestWave ?? result.wave;
  const cleared = result.lastRoundCleared ?? result.wavesCleared;
  const budget = result.roundThreatBudget;
  const resolved = result.roundThreatResolved;
  return {
    highestRoundEntered: Number.isInteger(entered) && entered >= 0 ? entered : null,
    lastRoundCleared: Number.isInteger(cleared) && cleared >= 0 ? cleared : null,
    roundThreatBudget: Number.isFinite(budget) && budget > 0 ? budget : null,
    roundThreatResolved: Number.isFinite(resolved) && resolved >= 0 && Number.isFinite(budget) && resolved <= budget ? resolved : null,
    remainingEnemies: Number.isInteger(result.remainingEnemies) && result.remainingEnemies >= 0 ? result.remainingEnemies : null,
  };
}

/** Descending survival tuple. Unknown same-round progress is incomparable, not a score tiebreak. */
export function compareRunRecords(a, b) {
  if (!a || !b) return a ? 1 : b ? -1 : 0;
  if (!recordRulesFor(a).complete || !recordRulesFor(b).complete) return null;
  if (recordKey(a) !== recordKey(b)) return null;
  const x = roundProgress(a), y = roundProgress(b);
  if (x.highestRoundEntered == null || y.highestRoundEntered == null) return null;
  if (x.highestRoundEntered !== y.highestRoundEntered) return Math.sign(x.highestRoundEntered - y.highestRoundEntered);
  if (x.roundThreatResolved == null || y.roundThreatResolved == null || x.roundThreatBudget == null || y.roundThreatBudget == null) return null;
  const progress = x.roundThreatResolved * y.roundThreatBudget - y.roundThreatResolved * x.roundThreatBudget;
  if (progress) return Math.sign(progress);
  return Math.sign((a.score || 0) - (b.score || 0));
}

export function normalizeBestLine(line) {
  if (!line || !(line.points > 0) || !Number.isInteger(line.seed)) return null;
  const incoming = Array.isArray(line.acts) ? line.acts : [];
  if (!incoming.length || incoming.length > 32 || incoming.some(a => a?.episodeId == null || !a.trickId || !Array.isArray(a.evidence) || !a.evidence.length)) return null;
  const acts = incoming
    .map(a => ({ episodeId: a.episodeId, trickId: a.trickId, name: a.name || a.trickId, family: a.family ?? null,
      tick: a.tick, rootTick: a.rootTick, rootId: a.rootId ?? null, points: a.points,
      evidence: cloneJson(a.evidence.slice(0, 8)), modifiers: cloneJson(a.modifiers || {}) }));
  if (acts.some(a => !a.evidence)) return null;
  const recordRules = recordRulesFor(line);
  const canonical = { version: 1, points: Math.floor(line.points), multiplier: line.multiplier ?? 1,
    raw: line.raw ?? null, bankId: line.bankId ?? null, tick: line.tick ?? null,
    seed: line.seed, recordRules, acts, videoAvailable: false, replayKind: 'causal_account' };
  canonical.id = `line:${hash32('pq146-best-line-v1', stableStringify(canonical))}`;
  return canonical;
}

export function bestLineRows(profile) {
  return (profile?.bestLines || []).map(line => ({ ...line, rulesComplete: line.recordRules?.complete === true,
    namedLine: line.acts.map(a => a.name).join(' → '),
    videoStatus: line.videoAvailable ? 'Video available' : 'Video unavailable · causal account retained' }));
}

function retainBestLine(lines, incoming) {
  const line = normalizeBestLine(incoming);
  const prior = (lines || []).filter(Boolean);
  if (!line || prior.some(x => x.id === line.id)) return prior;
  // Stable sort preserves exact point ties; this is a secondary record, never the Swarm ranking.
  return [...prior, line].sort((a, b) => b.points - a.points).slice(0, BEST_LINE_RETAIN_CAP);
}

function emptyRecord() {
  return {
    attempts: 0,
    victories: 0,
    bestScore: 0,
    deepestWave: 0,
    bestKills: 0,
    bestSeed: 0,
    bestResult: null,
    tiedResults: [],
    tieCount: 0,
  };
}

function applyRecord(row, compact) {
  const next = { ...emptyRecord(), ...row };
  next.attempts += 1;
  const score = Number.isInteger(compact.score) ? compact.score : 0;
  const deepest = Number.isInteger(compact.deepestWave) ? compact.deepestWave : 0;
  const kills = Number.isInteger(compact.kills) ? compact.kills : 0;
  const order = next.bestResult ? compareRunRecords(compact, next.bestResult) : 1;
  if (order > 0) {
    next.bestResult = cloneJson(compact);
    next.bestSeed = compact.seed;
    next.tiedResults = [cloneJson(compact)];
    next.tieCount = 1;
  } else if (order === 0) {
    next.tieCount += 1;
    next.tiedResults = [...next.tiedResults, cloneJson(compact)].slice(-CRUCIBLE_HISTORY_LIMIT);
  }
  // Independent historical maxima are labelled as such; neither chooses the primary seed.
  if (score > next.bestScore) next.bestScore = score;
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

/**
 * Per-run confidence (INF-040). An estimate, never a stake: it moves with one fixed rule —
 * half a point of prior plus a tenth per cleared wave, capped — and it touches no wallet,
 * no score, no award. Nothing in the sim spends, stakes, or multiplies it, because there
 * is no wager anywhere in this module: confidence is observed, then read back as advice.
 * A pure function of cleared waves, so identical play histories always produce identical
 * confidence sequences under fixed-seed replay.
 */
export const CONFIDENCE_START = 0.5;
export const CONFIDENCE_WAVE_STEP = 0.1;
export const CONFIDENCE_CAP = 0.9;
export const OVERCONFIDENT_DEATH_AT = 0.7;
export const OVERCONFIDENCE_STREAK_AT = 2;

export function runConfidenceFor(wavesCleared) {
  const cleared = Number.isInteger(wavesCleared) && wavesCleared > 0 ? wavesCleared : 0;
  return Math.min(CONFIDENCE_CAP, CONFIDENCE_START + CONFIDENCE_WAVE_STEP * cleared);
}

/** A destructive overconfidence: the run died while its estimate said it was fine. */
export function isDestructiveOverconfidence(row) {
  return !!row && row.outcome === 'defeat'
    && typeof row.confidence === 'number' && row.confidence >= OVERCONFIDENT_DEATH_AT;
}

/** Trailing rows of destructive overconfidence — history is oldest-first, so walk back. */
export function overconfidenceStreak(history) {
  const rows = Array.isArray(history) ? history : [];
  let streak = 0;
  for (let index = rows.length - 1; index >= 0; index--) {
    if (!isDestructiveOverconfidence(rows[index])) break;
    streak++;
  }
  return streak;
}

export function compactRunResult(result, run, newly) {
  const challenge = challengeFromRun(run);
  const dailyDateKey = resolveDailyDateKey(result, run);
  // SWARM-06: a Threat's mutator-shaped wager (No Re-rolls, Draftless) rides run.arenaMutators
  // for its mechanics, but it is the run's OWN difficulty contract — recorded on
  // compact.threats — never a side-door mutator. Kept out of compact.mutators so an honest
  // wager cannot kick a ladder run off the climb it paid difficulty to fly.
  const wagerMutators = new Set(swarmThreatMutatorIds(
    (result && Array.isArray(result.threats) && result.threats)
    || (run && run.telemetry && Array.isArray(run.telemetry.threats) && run.telemetry.threats)
    || []));
  const compact = {
    schemaVersion: 1,
    outcome: result && result.outcome ? result.outcome : null,
    seed: result && Number.isInteger(result.seed) ? result.seed : (run && Number.isInteger(run.seed) ? run.seed : 0),
    arenaId: (result && result.arenaId) || (run && run.arenaId) || null,
    ruleset: challenge.ruleset,
    trialId: challenge.trialId,
    mutators: wagerMutators.size
      ? challenge.mutators.filter((id) => !wagerMutators.has(id))
      : challenge.mutators.slice(),
    wave: result && Number.isInteger(result.wave) ? result.wave : 0,
    // SWARM-04: the round the run began at — 1 for a fresh ladder attempt, the checkpoint's
    // first wave for a head start. Without it a 10-round clear from Round 11 would read as
    // rounds 1–10 cleared and pay the wrong zone's stars.
    startWave: Number.isInteger(result && result.startWave) && result.startWave > 0
      ? result.startWave
      : (run && run.telemetry && Number.isInteger(run.telemetry.startWave)
        ? run.telemetry.startWave
        : 1),
    deepestWave: result && Number.isInteger(result.deepestWave) ? result.deepestWave : 0,
    wavesCleared: result && Number.isInteger(result.wavesCleared) ? result.wavesCleared : 0,
    kills: result && Number.isInteger(result.kills) ? result.kills : 0,
    score: result && Number.isInteger(result.score) ? result.score : 0,
    credits: result && Number.isInteger(result.credits) ? result.credits : 0,
    xp: result && Number.isInteger(result.xp) ? result.xp : 0,
    // INF-040: the estimate files with the row it describes. Score, credits, and every
    // award are set above from the result alone — confidence never feeds them.
    confidence: runConfidenceFor(result && result.wavesCleared),
    picks: Array.isArray(result && result.picks) ? result.picks.map((pick) => ({
      verb: pick && pick.verb ? pick.verb : null,
      defId: pick && pick.defId ? pick.defId : null,
      wave: Number.isInteger(pick && pick.wave) ? pick.wave : null,
    })) : [],
    unlocksEarned: Array.isArray(newly) ? newly.slice() : [],
  };
  if (dailyDateKey) compact.dailyDateKey = dailyDateKey;
  if (typeof (result && result.kitId) === 'string' && result.kitId) compact.kitId = result.kitId;
  if (Number.isInteger(result && result.stuntScore) && result.stuntScore >= 0) compact.stuntScore = result.stuntScore;
  if (Number.isInteger(result && result.physicsKills) && result.physicsKills >= 0) compact.physicsKills = result.physicsKills;
  compact.recordRules = recordRulesFor(result || {}, run || {});
  Object.assign(compact, roundProgress({ ...run, ...result }));
  compact.bestLine = normalizeBestLine({ ...result?.bestLine, seed: compact.seed, recordRules: compact.recordRules });
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

function hangarEndedAt(value) {
  if (value == null) return undefined;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'object') {
    const tick = value.tick != null ? value.tick : '';
    const simTime = value.simTime != null ? value.simTime : '';
    if (tick === '' && simTime === '') return undefined;
    // settleKey joins this into one string. A stamp object would collapse every death together.
    return `${tick}:${simTime}`;
  }
  return String(value);
}

function hangarBankInput(result, run) {
  const src = result && typeof result === 'object' ? result : {};
  const runSrc = run && typeof run === 'object' ? run : {};
  const outcome = typeof src.outcome === 'string' ? src.outcome : '';
  return {
    credits: src.credits,
    // The results plate says "defeat". The hangar banks a death.
    outcome: outcome === 'defeat' ? 'death' : outcome,
    cashOut: src.cashOut === true,
    wavesCleared: src.wavesCleared != null ? src.wavesCleared : src.wave,
    wave: src.wave != null ? src.wave : runSrc.wave,
    runId: src.runId != null ? src.runId : runSrc.runId,
    seed: src.seed != null ? src.seed : runSrc.seed,
    endedAt: hangarEndedAt(src.endedAt),
  };
}

export function settleCrucibleRun({ result, run, profile = null, storage = liveStorage() } = {}) {
  const loaded = profile ? migrateProfile(profile) : loadCrucibleMeta(storage);
  const bank = applyBank(loaded.hangar, hangarBankInput(result, run));
  const evaluated = evaluateUnlocks(loaded, result || {});
  const compact = compactRunResult(result || {}, run || {}, evaluated.newly);
  const line = compact.bestLine;
  delete compact.bestLine;
  if (line) compact.bestLineId = line.id;
  const key = recordKey(compact);
  const records = loaded.records || { byKey: {}, lifetime: emptyLifetime() };
  const byKey = { ...(records.byKey || {}) };
  byKey[key] = applyRecord(byKey[key], compact);
  const recordedAt = nowIso();
  const tape = takeGhostTape();
  let ghosts = loaded.ghosts && loaded.ghosts.byHash ? loaded.ghosts : emptyGhosts();
  if (tape && tape.frames.length) {
    ghosts = upsertGhost(ghosts, tape, recordedAt, compact.recordRules);
    compact.ghostHash = ghosts.lastHash;
  }
  compact.bankedBounty = bank.banked;
  compact.hangarBounty = bank.hangarBounty;
  compact.cashOut = bank.cashOut;
  // SWARM-04: settle the run onto the curated ladder — stars per cleared zone, best wave,
  // and the checkpoint a zone boss unlocks. Only the arena's own seed counts: a Daily or a
  // typed Custom seed is honest play that simply does not pay stars (isSwarmLadderRun).
  const ladderEval = isSwarmLadderRun(compact)
    ? applySwarmLadderResult(loaded.ladder, {
      arenaId: compact.arenaId,
      startWave: Number.isInteger(compact.startWave) && compact.startWave > 0 ? compact.startWave : 1,
      lastClearedWave: (Number.isInteger(compact.startWave) && compact.startWave > 0 ? compact.startWave : 1)
        + (Number.isInteger(compact.wavesCleared) ? compact.wavesCleared : 0) - 1,
      deepestWave: compact.deepestWave,
      zoneChains: result && result.zoneChains,
      zoneDeaths: result && result.zoneDeaths,
    })
    : null;
  if (ladderEval && (ladderEval.delta.newStars > 0 || ladderEval.delta.newCheckpoint)) {
    compact.ladderDelta = ladderEval.delta;
  }
  // SWARM-06: the crossover ledger — a Swarm run whose cleared span covers an earn wave (the
  // Zone 3 boss for the Saucer) writes the proof here. Practice runs and non-swarm rulesets
  // earn nothing; already-earned ids never re-fire (applyCrossoverResult owns both laws).
  const crossEval = applyCrossoverResult(loaded.crossover, {
    ...crossoverFactsFor(compact),
    at: recordedAt,
  });
  if (crossEval.earned.length) {
    compact.crossoverEarned = crossEval.earned.map((entry) => entry.id);
  }
  // SWARM-06: challenge purses and the Threat wager's Bounty multiplier ride the Hangar bounty —
  // Swarm's own wallet. bank.hangar is this module's bag, so the additions are honest writes.
  const threatIds = Array.isArray(result && result.threats) ? result.threats
    : (run && run.telemetry && Array.isArray(run.telemetry.threats) ? run.telemetry.threats : []);
  const threatMult = swarmThreatBountyMult(threatIds);
  if (threatMult !== 1 && bank.banked > 0) {
    const bonus = Math.round(bank.banked * (threatMult - 1));
    bank.hangar = { ...bank.hangar, bounty: (bank.hangar.bounty || 0) + bonus };
    compact.threatBountyBonus = bonus;
    compact.hangarBounty = bank.hangar.bounty;
  }
  if (threatIds.length) compact.threats = threatIds.slice();
  const challengeEval = challengePayoutFor(compact, loaded.challenges, recordedAt);
  if (challengeEval.paid.length) {
    compact.challengeRewards = challengeEval.paid.map((row) => ({ ...row }));
    const total = challengeEval.paid.reduce((sum, row) => sum + row.bounty, 0);
    bank.hangar = { ...bank.hangar, bounty: (bank.hangar.bounty || 0) + total };
    compact.hangarBounty = bank.hangar.bounty;
  }
  const next = {
    ...loaded,
    schemaVersion: CRUCIBLE_META_SCHEMA_VERSION,
    unlocks: evaluated.unlocks,
    ladder: ladderEval ? ladderEval.ladder : loaded.ladder,
    crossover: crossEval.crossover,
    challenges: challengeEval.challenges,
    records: {
      byKey,
      lifetime: applyLifetime(records.lifetime, compact),
    },
    history: [...(Array.isArray(loaded.history) ? loaded.history : []), compact].slice(-CRUCIBLE_HISTORY_LIMIT),
    daily: applyDailyBoard(loaded.daily, compact, recordedAt),
    ghosts,
    bestLines: retainBestLine(loaded.bestLines, line),
    hangar: bank.hangar,
  };
  saveCrucibleMeta(next, storage);
  consumeQueuedDailyDateKey();
  // INF-040: the streak rides home on the result so the review surface can answer repeated
  // destructive overconfidence with advice — assisted flight, never a wager. There is no
  // daily-easy-mode and no cadet tier to name; the honest response points at the real
  // assists the settings already carry.
  compact.overconfidenceStreak = overconfidenceStreak(next.history);
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

export const KIT_GUN_ONLY_ID = 'energy_baseline';
export const KIT_SHOVE_AND_ROCK_ID = 'physics_toolkit';
export const KIT_STARTER_ID = 'physics_toolkit';
export const CRUCIBLE_SHOVE_WEAPON_ID = 'wpn_concussion_cannon_m';
export const PHYSICS_KIT_WINS_RATIO = 2;

export function kitHasShove(loadout) {
  const slots = Array.isArray(loadout) ? loadout : [];
  for (const slot of slots) {
    const id = typeof slot === 'string' ? slot : slot && slot.defId;
    if (id === CRUCIBLE_SHOVE_WEAPON_ID || id === 'wpn_vector_mine_m') return true;
  }
  return false;
}

export function median(values) {
  const xs = (Array.isArray(values) ? values : [])
    .filter((n) => Number.isFinite(n))
    .slice()
    .sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = (xs.length - 1) / 2;
  return (xs[Math.floor(mid)] + xs[Math.ceil(mid)]) / 2;
}

/**
 * Crucible kit-order dashboard (PQ-174.02). Cells are { kit, seed, score }.
 * Pulse tops the board when its median is the highest row.
 */
export function kitBalanceBoard(cells, {
  gunKit = KIT_GUN_ONLY_ID,
  physicsKit = KIT_SHOVE_AND_ROCK_ID,
  pulseKit = KIT_GUN_ONLY_ID,
} = {}) {
  const byKit = {};
  const list = Array.isArray(cells) ? cells : [];
  for (const cell of list) {
    if (!cell || typeof cell.kit !== 'string' || !cell.kit) continue;
    if (!byKit[cell.kit]) byKit[cell.kit] = [];
    const score = Number(cell.score);
    if (Number.isFinite(score)) byKit[cell.kit].push(score);
  }
  const summary = {};
  for (const kit of Object.keys(byKit)) {
    const scores = byKit[kit].slice().sort((a, b) => a - b);
    summary[kit] = { n: scores.length, median: median(scores), scores };
  }
  const gunMedian = summary[gunKit] ? summary[gunKit].median : null;
  const physicsMedian = summary[physicsKit] ? summary[physicsKit].median : null;
  const pulseMedian = summary[pulseKit] ? summary[pulseKit].median : null;
  const ratio = gunMedian > 0 && physicsMedian != null ? physicsMedian / gunMedian : null;
  const order = Object.keys(summary).sort((a, b) => {
    const am = summary[a].median == null ? -Infinity : summary[a].median;
    const bm = summary[b].median == null ? -Infinity : summary[b].median;
    if (am !== bm) return bm - am;
    return a.localeCompare(b);
  });
  return {
    summary,
    order,
    ratio,
    gunMedian,
    physicsMedian,
    pulseMedian,
    pulseTopsBoard: pulseKit ? order[0] === pulseKit : false,
    physicsWins2x: ratio != null && ratio >= PHYSICS_KIT_WINS_RATIO,
    n: list.length,
  };
}

// SWARM-06: the crossover read port — ships.js sits upstream of this module (survivalMutators
// imports it), so the shipyard's buy gate cannot import survivalRecords without a cycle. The
// port hands the gate the bag's own migrated read: no reader, empty ledger, never a guessed earn.
registerCrossoverReader(() => {
  try {
    return loadCrucibleMeta();
  } catch {
    return null;
  }
});

export function formatKitBalanceBoard(board, { seeds = [] } = {}) {
  const lines = [];
  lines.push('[pq-174.02] kit-balance board (run.score / force-table physics pay)');
  if (Array.isArray(seeds) && seeds.length) lines.push(`seeds: ${seeds.join(',')}`);
  const summary = board && board.summary ? board.summary : {};
  for (const kit of (board && board.order) || Object.keys(summary)) {
    const row = summary[kit];
    if (!row) continue;
    lines.push(`  ${kit} n=${row.n} median=${row.median} scores=${row.scores.join(',')}`);
  }
  lines.push(`shove/gun ratio: ${board && board.ratio != null ? board.ratio.toFixed(3) : 'n/a'} (target ≥ ${PHYSICS_KIT_WINS_RATIO})`);
  lines.push(`order: ${(board && board.order ? board.order : []).join(' > ') || 'n/a'}`);
  lines.push(`Pulse tops board: ${board && board.pulseTopsBoard ? 'YES' : 'no'}`);
  lines.push(`physics ≥ 2× gun: ${board && board.physicsWins2x ? 'YES' : 'NO'}`);
  return lines.join('\n');
}
