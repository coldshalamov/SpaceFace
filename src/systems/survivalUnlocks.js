// Unlock evaluation for Crucible (PQ-133.10a / CRU-055).
//
// An unlock is earned only by a stated condition against a finished-run result.
// Loading a profile never grants anything. Default-unlocked rows are available
// without being stored as earned, so a wiped account is still the public kit.
//
// Power: every catalog row carries a zero vector. sumProfilePower is the fresh-
// account clause in numbers — fully earned and empty profiles return the same
// zeros. Option-set size is what changes.

import { SURVIVAL_ARC_LENGTH } from '../data/survivalActs.js';
import {
  SURVIVAL_POWER_AXES,
  SURVIVAL_STARTER_BY_ID,
  SURVIVAL_UNLOCK_CATALOG,
  SURVIVAL_UNLOCK_BY_ID,
  ZERO_POWER,
} from '../data/survivalUnlocks.js';
import { SURVIVAL_PHYSICS_VERBS } from '../data/survivalMutators.js';

const PHYSICS_SET = new Set(SURVIVAL_PHYSICS_VERBS);
const FORBIDDEN_KEY = /^(dmg|dps|hp|mult|bonus|multiplier|damageMult|hullMult|speedMult)$/i;

function pickVerbs(result) {
  const out = new Set();
  const picks = result && Array.isArray(result.picks) ? result.picks : [];
  for (const pick of picks) {
    if (pick && typeof pick.verb === 'string' && pick.verb) out.add(pick.verb);
  }
  return out;
}

function earnMin(earn) {
  if (!earn) return Infinity;
  if (Number.isInteger(earn.min)) return earn.min;
  if (Number.isInteger(earn.minWaves)) return earn.minWaves;
  return Infinity;
}

function isAuthoredVictory(result) {
  if (!result || result.outcome !== 'victory') return false;
  const waves = Number.isInteger(result.wavesCleared) ? result.wavesCleared : 0;
  const deepest = Number.isInteger(result.deepestWave) ? result.deepestWave : 0;
  const wave = Number.isInteger(result.wave) ? result.wave : 0;
  return waves >= SURVIVAL_ARC_LENGTH || deepest >= SURVIVAL_ARC_LENGTH || wave >= SURVIVAL_ARC_LENGTH;
}

export function meetsUnlockCondition(earn, result) {
  if (!earn || !result) return false;
  const waves = Number.isInteger(result.wavesCleared) ? result.wavesCleared : 0;
  const deepest = Number.isInteger(result.deepestWave) ? result.deepestWave : 0;
  const verbs = pickVerbs(result);
  switch (earn.kind) {
    case 'waves_cleared':
      return waves >= earnMin(earn);
    case 'deepest_wave':
      return deepest >= earnMin(earn);
    case 'authored_victory':
      return isAuthoredVictory(result);
    case 'pick_and_waves':
      return verbs.has(earn.verb) && waves >= earnMin(earn);
    case 'victory_and_physics_pick':
      return isAuthoredVictory(result) && [...verbs].some((verb) => PHYSICS_SET.has(verb));
    default:
      return false;
  }
}

/**
 * Reject any catalog row that smuggles a combat/economy figure. Called from tests so a
 * future row cannot quietly become a stat.
 */
export function validateUnlockCatalog(catalog = SURVIVAL_UNLOCK_CATALOG) {
  const issues = [];
  const seen = new Set();
  for (const entry of catalog) {
    if (!entry || typeof entry !== 'object') {
      issues.push('entry: not an object');
      continue;
    }
    if (!entry.id || seen.has(entry.id)) issues.push(`${entry.id || '?'}: missing or duplicate id`);
    seen.add(entry.id);
    for (const key of Object.keys(entry)) {
      if (FORBIDDEN_KEY.test(key)) issues.push(`${entry.id}: forbidden key ${key}`);
    }
    const power = entry.power || ZERO_POWER;
    for (const axis of SURVIVAL_POWER_AXES) {
      const value = power[axis];
      if (value !== 0) issues.push(`${entry.id}: power.${axis} is ${value}, must be 0`);
    }
    if (entry.defaultUnlocked && entry.earn) {
      issues.push(`${entry.id}: default-unlocked rows must not also earn`);
    }
    if (!entry.defaultUnlocked && !entry.earn) {
      issues.push(`${entry.id}: nothing self-grants — missing earn condition`);
    }
  }
  return { ok: issues.length === 0, issues };
}

export function emptyPower() {
  return { ...ZERO_POWER };
}

/** Sum of every earned and default row's power vector. Catalog is all zeros; this is the proof. */
export function sumProfilePower(profile, catalog = SURVIVAL_UNLOCK_CATALOG) {
  const earned = profile && profile.unlocks && typeof profile.unlocks === 'object'
    ? profile.unlocks
    : {};
  const sum = emptyPower();
  for (const entry of catalog) {
    const available = entry.defaultUnlocked === true || Object.prototype.hasOwnProperty.call(earned, entry.id);
    if (!available) continue;
    const power = entry.power || ZERO_POWER;
    for (const axis of SURVIVAL_POWER_AXES) {
      const value = Number(power[axis]) || 0;
      sum[axis] += value;
    }
  }
  return sum;
}

export function evaluateUnlocks(profile, result, catalog = SURVIVAL_UNLOCK_CATALOG) {
  const previous = profile && profile.unlocks && typeof profile.unlocks === 'object'
    ? profile.unlocks
    : {};
  const unlocks = { ...previous };
  const newly = [];
  for (const entry of catalog) {
    if (entry.defaultUnlocked) continue;
    if (Object.prototype.hasOwnProperty.call(unlocks, entry.id)) continue;
    if (!meetsUnlockCondition(entry.earn, result)) continue;
    unlocks[entry.id] = {
      condition: entry.earn && entry.earn.kind ? entry.earn.kind : 'unknown',
      seed: Number.isInteger(result.seed) ? result.seed : 0,
      wavesCleared: Number.isInteger(result.wavesCleared) ? result.wavesCleared : 0,
      outcome: result.outcome || null,
    };
    newly.push(entry.id);
  }
  return { unlocks, newly };
}

function collectGrants(profile, catalog = SURVIVAL_UNLOCK_CATALOG) {
  const earned = profile && profile.unlocks && typeof profile.unlocks === 'object'
    ? profile.unlocks
    : {};
  const starters = new Set();
  const mutators = new Set();
  const trials = new Set();
  const cosmetics = new Set();
  const lore = new Set();
  for (const entry of catalog) {
    const available = entry.defaultUnlocked === true || Object.prototype.hasOwnProperty.call(earned, entry.id);
    if (!available) continue;
    const grants = entry.grants || {};
    for (const id of grants.starters || []) starters.add(id);
    for (const id of grants.mutators || []) mutators.add(id);
    for (const id of grants.trials || []) trials.add(id);
    for (const id of grants.cosmetics || []) cosmetics.add(id);
    for (const id of grants.lore || []) lore.add(id);
  }
  return { starters, mutators, trials, cosmetics, lore };
}

export function availableOptions(profile, catalog = SURVIVAL_UNLOCK_CATALOG) {
  const grants = collectGrants(profile, catalog);
  return {
    starters: [...grants.starters].sort(),
    mutators: [...grants.mutators].sort(),
    trials: [...grants.trials].sort(),
    cosmetics: [...grants.cosmetics].sort(),
    lore: [...grants.lore].sort(),
    size: grants.starters.size + grants.mutators.size + grants.trials.size
      + grants.cosmetics.size + grants.lore.size,
  };
}

export function isUnlockAvailable(profile, unlockId) {
  const entry = SURVIVAL_UNLOCK_BY_ID[unlockId];
  if (!entry) return false;
  if (entry.defaultUnlocked) return true;
  return !!(profile && profile.unlocks && Object.prototype.hasOwnProperty.call(profile.unlocks, unlockId));
}

export function isStarterAvailable(profile, starterId) {
  return availableOptions(profile).starters.includes(starterId);
}

export function starterDef(starterId) {
  return SURVIVAL_STARTER_BY_ID[starterId] || null;
}

/**
 * Same-build comparison surface. Unlocks never rewrite the hull or fittings; they
 * only change which kits a later launch screen is allowed to list.
 */
export function buildPowerView(build, profile) {
  const hullId = build && typeof build.hullId === 'string' ? build.hullId : null;
  const fittings = build && Array.isArray(build.fittings) ? build.fittings.slice() : [];
  return {
    hullId,
    fittings,
    profilePower: sumProfilePower(profile),
  };
}

export function fullyUnlockedProfile() {
  const unlocks = {};
  for (const entry of SURVIVAL_UNLOCK_CATALOG) {
    if (entry.defaultUnlocked) continue;
    unlocks[entry.id] = {
      condition: entry.earn && entry.earn.kind ? entry.earn.kind : 'debug',
      seed: 0,
      wavesCleared: SURVIVAL_ARC_LENGTH,
      outcome: 'victory',
    };
  }
  return { schemaVersion: 1, unlocks, records: { byKey: {}, lifetime: null }, history: [] };
}
