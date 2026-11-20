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
const BOOLEAN_KEYS = Object.freeze(['practice']);
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
    'draft', // the swarm's opening armory is a real draft before the first pack lands
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

// Run levelling (CRU-014, retuned OVH-01a / design/overhaul/04_SWARM.md §3 and 06 §2.3). XP per
// level grows linearly — no curve table nobody can read. The constants are sized against the LIVE
// award sites, not the older design figures: a Swarm kill pays 3 XP (`killXpFor(1)` in
// survivalRewards) and a wave clear pays 40 + 14 × the wave (swarmRewards). With those payouts a
// typical paced run reaches level 2 ≈25 s into round 1, level 6 at the end of round 3 and level 14
// at the end of round 10 (04_SWARM §3), as pinned in test/ovh-01a-pilot-tree.test.mjs. Pure: no
// state, no RNG.
export const RUN_XP_LEVEL_BASE = 24;
export const RUN_XP_LEVEL_STEP = 22;

// The XP sources 04_SWARM.md §3 names, as one figure each (starting values; tune by play). The
// award sites (kills, chains, round clears, bosses) wire these in the node-effects packets; the
// run wallet itself stays integer, so fractional sources (the room kill's 2.5) round at the
// award call, never inside the curve. The nth chain link pays CHAIN_LINK_STEP × n ("+0.5 rising").
export const RUN_XP_SOURCES = Object.freeze({
  GUN_KILL: 1,
  ROOM_KILL: 2.5,
  CHAIN_LINK_STEP: 0.5,
  ROUND_CLEAR_PER_ROUND: 10,
  BOSS: 100,
});

/** Total XP required to have REACHED `level`. Level 1 costs nothing. */
export function runXpForLevel(level) {
  const l = Number.isInteger(level) && level > 1 ? level : 1;
  const steps = l - 1;
  return steps * RUN_XP_LEVEL_BASE + (steps * (steps - 1) / 2) * RUN_XP_LEVEL_STEP;
}

/** Level earned by a total XP figure. Monotone, starts at 1, never returns 0 or a fraction. */
export function runLevelForXp(xp) {
  const total = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  if (total <= 0) return 1;

  // runXpForLevel(level) is a quadratic in steps = level - 1. Solve that quadratic first,
  // then correct the at-most-one-step floating-point rounding error. This keeps large imported
  // run scores from spending millions of iterations walking the level table.
  const quadratic = RUN_XP_LEVEL_STEP / 2;
  const linear = RUN_XP_LEVEL_BASE - quadratic;
  const halfLinearOverQuadratic = linear / (2 * quadratic);
  const steps = Math.max(0, Math.floor(
    Math.sqrt(total / quadratic + halfLinearOverQuadratic ** 2) - halfLinearOverQuadratic,
  ));
  let level = steps + 1;

  // For values so large that the level cost itself overflows, the finite quadratic estimate is
  // still the only useful answer; avoid an unbounded correction loop in that regime.
  if (Number.isSafeInteger(level) && Number.isFinite(runXpForLevel(level))) {
    while (level > 1 && runXpForLevel(level) > total) level -= 1;
    while (level + 1 !== level && runXpForLevel(level + 1) <= total) level += 1;
  }
  return level;
}

// The run-local Pilot Tree record (OVH-01a / design/overhaul/06 §2). Absent on the fresh
// adventure envelope createRunState() builds; runSession.begin() stamps it onto every
// non-adventure run, so a run's tree never outlives the run. `points` is sparse — a branch
// appears when it first holds a point. `offer` is the live three-card draw (null when none is
// on the table); `rerolls` counts the Scrap-paid redraws of the current offer.
export function createPilotProgress() {
  return { points: {}, nodes: [], banked: 0, offer: null };
}

export function createRunState({ kind = 'adventure', ruleset = null, seed = 0 } = {}) {
  return {
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    kind,
    ruleset: ruleset == null ? null : ruleset,
    seed: seed >>> 0,
    arenaId: null,
    phase: 'inactive',
    retireToken: null,
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
    practice: false,
    telemetry: {},
  };
}

// Validation runs on every active wave. The schema is static, while each
// caller's run and its nested history still need to be validated in full.
const REQUIRED_RUN_KEYS = Object.keys(createRunState());
const REQUIRED_RUN_KEY_SET = new Set(REQUIRED_RUN_KEYS);
// OVH-01a: the pilot record is optional (absent on adventure/inactive envelopes and on runs
// begun before the tree existed) but never unknown.
const OPTIONAL_RUN_KEY_SET = new Set(['pilot']);
const PILOT_KEY_SET = new Set(['points', 'nodes', 'banked', 'offer']);

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
  for (const key of REQUIRED_RUN_KEYS) {
    if (key !== 'retireToken' && !Object.prototype.hasOwnProperty.call(run, key)) {
      issues.push(`${key}: missing`);
    }
  }
  for (const key of Object.keys(run)) {
    if (!REQUIRED_RUN_KEY_SET.has(key) && !OPTIONAL_RUN_KEY_SET.has(key)) issues.push(`${key}: unknown`);
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
  if (Object.prototype.hasOwnProperty.call(run, 'retireToken')
    && run.retireToken !== null && (!Number.isSafeInteger(run.retireToken) || run.retireToken < 1)) {
    issues.push('retireToken: expected positive integer or null');
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
  for (const key of BOOLEAN_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(run, key)) continue;
    if (typeof run[key] !== 'boolean') issues.push(`${key}: expected boolean`);
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
  if (Object.prototype.hasOwnProperty.call(run, 'pilot')) {
    const pilot = run.pilot;
    if (!pilot || typeof pilot !== 'object' || Array.isArray(pilot)) {
      issues.push('pilot: expected object');
    } else {
      for (const key of Object.keys(pilot)) {
        if (!PILOT_KEY_SET.has(key)) issues.push(`pilot.${key}: unknown`);
      }
      if (!pilot.points || typeof pilot.points !== 'object' || Array.isArray(pilot.points)) {
        issues.push('pilot.points: expected object');
      } else {
        for (const [branch, value] of Object.entries(pilot.points)) {
          if (!branch) issues.push('pilot.points: expected branch keys');
          if (!Number.isInteger(value) || value < 0) {
            issues.push(`pilot.points.${branch}: expected non-negative integer`);
          }
        }
      }
      if (!Array.isArray(pilot.nodes)) {
        issues.push('pilot.nodes: expected array');
      } else {
        for (const id of pilot.nodes) {
          if (typeof id !== 'string' || !id) { issues.push('pilot.nodes: expected string ids'); break; }
        }
      }
      if (!Number.isInteger(pilot.banked) || pilot.banked < 0) {
        issues.push('pilot.banked: expected non-negative integer');
      }
      if (pilot.offer !== null && typeof pilot.offer === 'object' && !Array.isArray(pilot.offer)) {
        if (!Array.isArray(pilot.offer.cards) || pilot.offer.cards.length > 3) {
          issues.push('pilot.offer.cards: expected at most three ids');
        } else {
          for (const id of pilot.offer.cards) {
            if (typeof id !== 'string' || !id) { issues.push('pilot.offer.cards: expected string ids'); break; }
          }
        }
        if (!Number.isInteger(pilot.offer.rerolls) || pilot.offer.rerolls < 0) {
          issues.push('pilot.offer.rerolls: expected non-negative integer');
        }
      } else if (pilot.offer !== null) {
        issues.push('pilot.offer: expected object or null');
      }
    }
  }

  collectNonJsonIssues(run, issues, [], []);
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

function nonJsonPath(path) {
  let formatted = '';
  for (const part of path) {
    if (typeof part === 'number') formatted += `[${part}]`;
    else formatted = formatted ? `${formatted}.${part}` : part;
  }
  return formatted || '(root)';
}

function isJsonScalar(value) {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value);
}

function collectNonJsonIssues(value, issues, path, ancestors) {
  if (value === null) return;
  const type = typeof value;
  if (type !== 'object') {
    issues.push(`${nonJsonPath(path)}: ${value === undefined ? 'undefined' : `non-json ${type}`}`);
    return;
  }
  if (ancestors.includes(value)) {
    issues.push(`${nonJsonPath(path)}: circular`);
    return;
  }
  if (path.length >= JSON_DEPTH_CAP) {
    issues.push(`${nonJsonPath(path)}: too deep`);
    return;
  }
  // The depth cap keeps this scan short. Reusing the ancestry stack avoids
  // constructing a WeakSet each time an active-wave reader validates the run.
  ancestors.push(value);
  try {
    if (value instanceof Map || value instanceof Set) {
      issues.push(`${nonJsonPath(path)}: ${value.constructor.name}`);
      return;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const child = value[i];
        if (isJsonScalar(child)) continue;
        path.push(i);
        collectNonJsonIssues(child, issues, path, ancestors);
        path.pop();
      }
      return;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      issues.push(`${nonJsonPath(path)}: non-json object`);
      return;
    }
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (isJsonScalar(child)) continue;
      path.push(key);
      collectNonJsonIssues(child, issues, path, ancestors);
      path.pop();
    }
  } finally {
    // Siblings may share an object. Only the current ancestry can form a cycle.
    ancestors.pop();
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
