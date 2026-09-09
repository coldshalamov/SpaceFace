// Pure run-envelope contract (PQ-133 / CRU-002).
// This module is pure: no bus, no systems, no side effects.
// state.run is never serialized into the save, and it is deliberately absent from
// src/core/simSnapshot.js's include list.

export const RUN_STATE_SCHEMA_VERSION = 1;

export const RUN_KINDS = Object.freeze(['adventure', 'survival', 'lab']);

export const RUN_OUTCOMES = Object.freeze(['victory', 'defeat', 'aborted']);

export const RUN_PHASES = Object.freeze([
  'inactive',
  'loadout',
  'arena_intro',
  'wave_intro',
  'active',
  'cleanup',
  'draft',
  'refit',
  'victory',
  'ended',
]);

const PHASE_SET = new Set(RUN_PHASES);
const KIND_SET = new Set(RUN_KINDS);
const INTEGER_KEYS = Object.freeze([
  'wave', 'block', 'act', 'xp', 'level', 'score', 'credits',
  'threatBudget', 'spawnedThreat', 'resolvedThreat',
]);
const ARRAY_KEYS = Object.freeze([
  'modifiers', 'draftHistory', 'shopHistory', 'arenaMutators',
]);
const NULLABLE_STRING_KEYS = Object.freeze([
  'arenaId', 'ruleset', 'wavePlanId', 'buildCode',
]);
const JSON_DEPTH_CAP = 24;

// Adjacency from §27.4, plus abort-to-ended from every non-terminal phase and
// teardown-only edges from the two terminals back to inactive.
export const RUN_PHASE_TRANSITIONS = Object.freeze({
  inactive: Object.freeze([
    'loadout',
    'ended', // aborted run from every non-terminal phase
  ]),
  loadout: Object.freeze([
    'arena_intro',
    'ended', // aborted run
  ]),
  arena_intro: Object.freeze([
    'wave_intro',
    'ended', // aborted run
  ]),
  wave_intro: Object.freeze([
    'active',
    'ended', // aborted run
  ]),
  active: Object.freeze([
    'cleanup',
    'draft', // post-wave destination may skip the cleanup interstitial
    'ended', // aborted run
  ]),
  cleanup: Object.freeze([
    'draft',
    'refit', // a ruleset may skip an empty draft
    'victory', // last wave can complete without a shop
    'ended', // aborted run
  ]),
  draft: Object.freeze([
    'wave_intro',
    'refit',
    'victory', // last pick of a completed run
    'ended', // aborted run
  ]),
  refit: Object.freeze([
    'wave_intro',
    'victory',
    'ended', // aborted run
  ]),
  victory: Object.freeze([
    'inactive', // teardown only
  ]),
  ended: Object.freeze([
    'inactive', // teardown only
  ]),
});

// Run levelling (CRU-014). XP per level grows linearly so ten waves of authored rewards land a
// player around level 6-8 without a curve table nobody can read. Pure: no state, no RNG.
export const RUN_XP_LEVEL_BASE = 100;
export const RUN_XP_LEVEL_STEP = 60;

/** Total XP required to have REACHED `level`. Level 1 costs nothing. */
export function runXpForLevel(level) {
  const l = Number.isInteger(level) && level > 1 ? level : 1;
  const steps = l - 1;
  return steps * RUN_XP_LEVEL_BASE + (steps * (steps - 1) / 2) * RUN_XP_LEVEL_STEP;
}

/** Level earned by a total XP figure. Monotone, starts at 1, never returns 0 or a fraction. */
export function runLevelForXp(xp) {
  const total = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let level = 1;
  while (runXpForLevel(level + 1) <= total) level += 1;
  return level;
}

export function createRunState({ kind = 'adventure', ruleset = null, seed = 0 } = {}) {
  return {
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    kind,
    ruleset: ruleset == null ? null : ruleset,
    seed: seed >>> 0,
    arenaId: null,
    phase: 'inactive',
    wave: 0,
    block: 0,
    act: 0,
    wavePlanId: null,
    threatBudget: 0,
    spawnedThreat: 0,
    resolvedThreat: 0,
    credits: 0,
    xp: 0,
    level: 1,
    score: 0,
    style: {
      multiplier: 1,
      recentCauses: [],
    },
    modifiers: [],
    draftHistory: [],
    shopHistory: [],
    arenaMutators: [],
    buildCode: null,
    result: null,
    telemetry: {},
  };
}

export function validateRunState(run) {
  try {
    return validateRunStateInner(run);
  } catch {
    return { ok: false, issues: ['(root): invalid'] };
  }
}

function validateRunStateInner(run) {
  const issues = [];
  if (!run || typeof run !== 'object' || Array.isArray(run)) {
    return { ok: false, issues: ['(root): expected object'] };
  }
  const requiredKeys = Object.keys(createRunState());
  const requiredSet = new Set(requiredKeys);
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(run, key)) {
      issues.push(`${key}: missing`);
    }
  }
  for (const key of Object.keys(run)) {
    if (!requiredSet.has(key)) issues.push(`${key}: unknown`);
  }

  if (Object.prototype.hasOwnProperty.call(run, 'schemaVersion')
    && run.schemaVersion !== RUN_STATE_SCHEMA_VERSION) {
    issues.push(`schemaVersion: expected ${RUN_STATE_SCHEMA_VERSION}`);
  }
  if (Object.prototype.hasOwnProperty.call(run, 'kind') && !KIND_SET.has(run.kind)) {
    issues.push('kind: unknown');
  }
  if (Object.prototype.hasOwnProperty.call(run, 'phase') && !PHASE_SET.has(run.phase)) {
    issues.push('phase: unknown');
  }
  if (Object.prototype.hasOwnProperty.call(run, 'seed') && !Number.isInteger(run.seed)) {
    issues.push('seed: non-integer');
  }
  for (const key of INTEGER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(run, key)) continue;
    if (!Number.isInteger(run[key])) issues.push(`${key}: non-integer`);
  }
  for (const key of ARRAY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(run, key)) continue;
    if (!Array.isArray(run[key])) issues.push(`${key}: expected array`);
  }
  for (const key of NULLABLE_STRING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(run, key)) continue;
    const value = run[key];
    if (value !== null && typeof value !== 'string') issues.push(`${key}: expected string`);
  }
  if (Object.prototype.hasOwnProperty.call(run, 'result')) {
    const value = run.result;
    if (value !== null && (typeof value !== 'object' || Array.isArray(value))) {
      issues.push('result: expected object');
    }
  }
  if (Object.prototype.hasOwnProperty.call(run, 'style')) {
    const style = run.style;
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      issues.push('style: expected object');
    } else {
      if (typeof style.multiplier !== 'number' || !Number.isFinite(style.multiplier)) {
        issues.push('style.multiplier: expected number');
      }
      if (!Array.isArray(style.recentCauses)) {
        issues.push('style.recentCauses: expected array');
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(run, 'telemetry')) {
    const telemetry = run.telemetry;
    if (!telemetry || typeof telemetry !== 'object' || Array.isArray(telemetry)) {
      issues.push('telemetry: expected object');
    }
  }

  collectNonJsonIssues(run, '', issues);
  return { ok: issues.length === 0, issues };
}

export function canTransition(fromPhase, toPhase) {
  const next = RUN_PHASE_TRANSITIONS[fromPhase];
  return Array.isArray(next) && next.includes(toPhase);
}

export function snapshotCampaignBoundary(state) {
  const player = (state && state.player) || {};
  const ownedShips = Array.isArray(player.ownedShips) ? player.ownedShips : [];
  const values = {
    'player.credits': player.credits,
    'player.heat': player.heat,
    'player.activeShipIndex': player.activeShipIndex,
    'player.researchPoints': player.researchPoints,
    'player.ownedShips': cloneJson(ownedShips),
    'player.cargo': cloneJson(player.cargo == null ? null : player.cargo),
    'player.moduleInventory': cloneJson(player.moduleInventory == null ? null : player.moduleInventory),
    'player.researchedNodes': cloneJson(player.researchedNodes == null ? null : player.researchedNodes),
    factions: cloneJson(state && state.factions != null ? state.factions : null),
    world: cloneJson(state && state.world != null ? state.world : null),
  };
  const refs = {
    'player.ownedShips': player.ownedShips,
    'player.cargo': player.cargo,
    'player.moduleInventory': player.moduleInventory,
    'player.researchedNodes': player.researchedNodes,
    factions: state ? state.factions : undefined,
    world: state ? state.world : undefined,
    rng: state ? state.rng : undefined,
  };
  for (let i = 0; i < ownedShips.length; i++) {
    const ship = ownedShips[i];
    refs[`player.ownedShips[${i}].fittings`] = ship ? ship.fittings : undefined;
  }
  return { values, refs };
}

export function assertCampaignBoundaryUnchanged(before, after) {
  if (!before || !after || !before.values || !after.values || !before.refs || !after.refs) {
    throw new Error('campaign boundary snapshot missing');
  }
  const refKeys = uniqueKeys(before.refs, after.refs);
  for (const path of refKeys) {
    if (before.refs[path] !== after.refs[path]) {
      throw new Error(`${path}: identity changed`);
    }
  }
  const valueKeys = uniqueKeys(before.values, after.values);
  for (const path of valueKeys) {
    const prev = before.values[path];
    const next = after.values[path];
    if (!valuesEqual(prev, next)) {
      throw new Error(`${path}: ${formatValue(prev)} -> ${formatValue(next)}`);
    }
  }
}

function uniqueKeys(a, b) {
  const out = [];
  const seen = Object.create(null);
  for (const key of Object.keys(a)) {
    seen[key] = true;
    out.push(key);
  }
  for (const key of Object.keys(b)) {
    if (seen[key]) continue;
    out.push(key);
  }
  return out;
}

function cloneJson(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function collectNonJsonIssues(value, path, issues, visited = new WeakSet(), depth = 0) {
  if (value === undefined) {
    issues.push(`${path || '(root)'}: undefined`);
    return;
  }
  if (value === null) return;
  const type = typeof value;
  if (type === 'function' || type === 'bigint' || type === 'symbol') {
    issues.push(`${path || '(root)'}: non-json ${type}`);
    return;
  }
  if (type === 'number' && !Number.isFinite(value)) {
    issues.push(`${path || '(root)'}: non-json number`);
    return;
  }
  if (type !== 'object') return;
  if (visited.has(value)) {
    issues.push(`${path || '(root)'}: circular`);
    return;
  }
  if (depth >= JSON_DEPTH_CAP) {
    issues.push(`${path || '(root)'}: too deep`);
    return;
  }
  visited.add(value);
  if (value instanceof Map || value instanceof Set) {
    issues.push(`${path || '(root)'}: ${value.constructor.name}`);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectNonJsonIssues(value[i], `${path}[${i}]`, issues, visited, depth + 1);
    }
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    issues.push(`${path || '(root)'}: non-json object`);
    return;
  }
  for (const key of Object.keys(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    collectNonJsonIssues(value[key], nextPath, issues, visited, depth + 1);
  }
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!valuesEqual(a[key], b[key])) return false;
  }
  return true;
}

function formatValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
