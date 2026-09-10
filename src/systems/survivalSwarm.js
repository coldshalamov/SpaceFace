// Swarm ruleset helpers (PQ-135) and swarm-role problems (PQ-174.03).
//
// Ruleset-only, exactly like survivalEndless.js and survivalCircuit.js: it never adds a key to run
// state. `run.ruleset === 'swarm'` is the whole switch, and every question the phase machine needs
// to ask about a swarm run is answered here from the wave number.
//
// Roles: Support / Anchor / Disruptor / Elite already spawn with `data.runRole` from
// waveMaterialization. This file names each role's counter-verb, stamps that onto the live
// body, and measures time-to-resolve. It does not scale hit points, clamp given momentum, add
// drag, or give an NPC a gyro. The roster in swarmMode.js is left alone; the overlay rides the
// role the stream already stamped.

import { resolveCollisionConsequence } from '../combat/impulseKernel.js';
import { COHORT_RECIPE_RIVER } from '../data/squadChoreography.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import {
  SWARM_CLEANUP_TICKS,
  SWARM_DRAFT_EVERY,
  SWARM_REFIT_EVERY,
  SWARM_RULESET,
  SWARM_WAVE_MAX,
  isSwarmBossWave,
  isSwarmDraftWave,
  isSwarmRefitWave,
} from '../data/swarmMode.js';
import {
  SURVIVAL_PROBLEM_ROLES,
  SURVIVAL_ROLE_PROBLEMS,
  survivalRoleProblem,
  waveHealthOverrideIssues,
} from '../data/survivalWaves.js';
import { WEAPONS } from '../data/weapons.js';
import { PULSE_WEAPON_ID, SHOVE_WEAPON_ID } from './survivalStyle.js';

export {
  SWARM_CLEANUP_TICKS,
  SWARM_DRAFT_EVERY,
  SWARM_REFIT_EVERY,
  SWARM_RULESET,
  SWARM_WAVE_MAX,
  isSwarmBossWave,
  isSwarmDraftWave,
  isSwarmRefitWave,
};

export {
  SURVIVAL_PROBLEM_ROLES,
  SURVIVAL_ROLE_PROBLEMS,
  survivalRoleProblem,
};

export function isSwarmRuleset(ruleset) {
  return ruleset === SWARM_RULESET;
}

/**
 * Does this wave end in a menu?
 *
 * The arc opens a draft after EVERY wave, which is the single biggest reason it does not read as a
 * swarm game: you never fight twice in a row. Here the answer is no four times out of five — the
 * run goes cleanup -> (auto-resolved draft) -> next wave with nothing to click.
 */
export function swarmWaveEndsInMenu(wave) {
  return isSwarmDraftWave(wave) || isSwarmRefitWave(wave);
}

export const PQ_174_03_SEED = 17403;
export const ROLE_RESOLVE_SEEDS = Object.freeze([4242, 8008, 13502]);
export const ROLE_SLAM_INTERVAL_S = 0.6;
export const WELL_CLUSTER_SETUP_S = 0.4;
export const WELL_SOLO_DRAG_S = 1.2;
export const ROPE_DISPLACE_S = 1.2;

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, row]));
const WEAPON_BY_ID = new Map(WEAPONS.map((row) => [row.id, row]));
const ANCHOR_FIELD = ENEMY_BY_ID.get('field_anchor_controller');

const ENEMY_DEFAULT_ROLE = Object.freeze({
  pd_screen_escort: 'support',
  field_anchor_controller: 'anchor',
  mine_layer_jackal: 'disruptor',
  corsair_raider: 'elite',
  dreadnought_boss: 'elite',
});

const COUNTER_OFFER_IDS = Object.freeze({
  well: Object.freeze(['tag', 'gravity_payload']),
  rope: Object.freeze(['bind', 'reel', 'spool', 'whip', 'snare']),
  shove: Object.freeze(['throw']),
  throw: Object.freeze(['throw', 'ram', 'bank']),
});

const COUNTER_OFFER_SHAPES = Object.freeze({
  well: 'well',
  rope: 'reel',
});

export function isSwarmProblemRole(role) {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(SURVIVAL_ROLE_PROBLEMS, role);
}

export function swarmRoleProblem(role) {
  return survivalRoleProblem(role);
}

export function swarmRoleEnemyId(role) {
  const problem = swarmRoleProblem(role);
  return problem ? problem.enemyId : null;
}

/** Distinct named counters, one per problem role. Empty array when the table is intact. */
export function swarmRoleCounterIssues() {
  const issues = [];
  const verbs = new Set();
  for (const role of SURVIVAL_PROBLEM_ROLES) {
    const problem = SURVIVAL_ROLE_PROBLEMS[role];
    if (!problem) {
      issues.push(`${role} is missing from SURVIVAL_ROLE_PROBLEMS`);
      continue;
    }
    if (!ENEMY_BY_ID.has(problem.enemyId)) issues.push(`${role} enemyId ${problem.enemyId} is unknown`);
    if (typeof problem.counterVerb !== 'string' || !problem.counterVerb) {
      issues.push(`${role} has no counterVerb`);
    } else if (verbs.has(problem.counterVerb)) {
      issues.push(`${role} reuses counterVerb ${problem.counterVerb}`);
    } else {
      verbs.add(problem.counterVerb);
    }
    if (typeof problem.telegraphCue !== 'string' || !problem.telegraphCue) {
      issues.push(`${role} has no telegraphCue`);
    }
    if (typeof problem.problem !== 'string' || problem.problem.length < 20) {
      issues.push(`${role} does not name a positioning problem`);
    }
    if (problem.throwable !== true) issues.push(`${role} must stay throwable`);
    if (!Array.isArray(problem.consequences) || problem.consequences.length < 2) {
      issues.push(`${role} needs two consequences`);
    }
    for (const alt of problem.alternatives || []) {
      if (alt === problem.counterVerb) issues.push(`${role} lists its own counter as an alternative`);
    }
  }
  issues.push(...waveHealthOverrideIssues(SURVIVAL_ROLE_PROBLEMS).map((row) => row.message));
  return issues;
}

export function roleFromEntity(entity) {
  if (!entity) return null;
  const data = entity.data || {};
  if (isSwarmProblemRole(data.runRole)) return data.runRole;
  if (isSwarmProblemRole(data.roleProblem)) return data.roleProblem;
  const enemyId = data.lootTableId || data.enemyTypeId;
  if (typeof enemyId === 'string' && ENEMY_DEFAULT_ROLE[enemyId]) return ENEMY_DEFAULT_ROLE[enemyId];
  return null;
}

/**
 * Stamp the role's counter, telegraph, huddle, and (for a bruiser wearing the anchor slot)
 * the existing snare well. Never writes velocity, facing, damping, or hull.
 */
export function stampSwarmRoleProblem(entity, role = null) {
  if (!entity) return null;
  const data = entity.data || (entity.data = {});
  const resolved = role || roleFromEntity(entity);
  const problem = swarmRoleProblem(resolved);
  if (!problem) return null;

  data.runRole = problem.role;
  data.roleProblem = problem.role;
  data.counterVerb = problem.counterVerb;
  data.roleThrow = problem.throwable === true;
  if (!data.telegraph || typeof data.telegraph !== 'object') {
    data.telegraph = { cue: problem.telegraphCue, line: problem.telegraphLine };
  } else {
    if (!data.telegraph.cue) data.telegraph.cue = problem.telegraphCue;
    if (!data.telegraph.line) data.telegraph.line = problem.telegraphLine;
  }
  if (!data.counterHint) data.counterHint = problem.counterVerb;
  const ai = data.ai || (data.ai = {});
  if (!ai.approachTelegraph) ai.approachTelegraph = problem.telegraphCue;

  if (problem.fieldAnchor && !data.fieldAnchor && ANCHOR_FIELD && ANCHOR_FIELD.fieldAnchor) {
    data.fieldAnchor = { ...ANCHOR_FIELD.fieldAnchor };
  }
  if (problem.cluster) {
    if (!ai.squadId) ai.squadId = `swarm-role-${problem.role}`;
    if (!ai.cohortRecipe) ai.cohortRecipe = COHORT_RECIPE_RIVER;
  }
  if (problem.ammunition && !ai.cohortRecipe) {
    ai.cohortRecipe = COHORT_RECIPE_RIVER;
  }
  return problem;
}

export function roleStampDidNotClamp(entity) {
  if (!entity) return false;
  const data = entity.data || {};
  if (data.linearDamping != null) return false;
  if (data.gyro === true || data.npcGyro === true) return false;
  if (Object.prototype.hasOwnProperty.call(entity, 'linearDamping')) return false;
  return data.roleThrow === true;
}

let boundCtx = null;
let boundOff = null;

export function bindSwarmRoleProblems(ctx) {
  unbindSwarmRoleProblems();
  const bus = ctx && ctx.bus;
  if (!bus || typeof bus.on !== 'function') return false;
  boundCtx = {
    state: ctx.state || null,
    bus,
    registry: ctx.registry || null,
  };
  boundOff = bus.on('entity:spawned', (payload) => onRoleSpawn(payload));
  return true;
}

export function unbindSwarmRoleProblems() {
  if (typeof boundOff === 'function') boundOff();
  boundOff = null;
  boundCtx = null;
}

function survivalRunIsLive(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'survival' && run.phase !== 'inactive');
}

function onRoleSpawn(payload) {
  const entity = payload && payload.entity;
  if (!entity) return;
  const state = boundCtx && boundCtx.state;
  if (!survivalRunIsLive(state) && !(entity.data && entity.data.runRole)) return;
  const beforeAnchor = !!(entity.data && entity.data.fieldAnchor);
  const problem = stampSwarmRoleProblem(entity);
  if (!problem) return;
  const addedAnchor = problem.fieldAnchor && !beforeAnchor && entity.data.fieldAnchor;
  if (addedAnchor && boundCtx && boundCtx.registry && typeof boundCtx.registry.get === 'function') {
    const fields = boundCtx.registry.get('fields');
    if (fields && typeof fields._registerAnchoredField === 'function') {
      fields._registerAnchoredField(entity);
    }
  }
  if (boundCtx.bus && typeof boundCtx.bus.emit === 'function') {
    boundCtx.bus.emit('run:roleProblemStamped', {
      id: entity.id,
      role: problem.role,
      counterVerb: problem.counterVerb,
      telegraphCue: problem.telegraphCue,
      enemyId: problem.enemyId,
    });
  }
}

const ROLE_DRAFT_RANK = Object.freeze(['elite', 'anchor', 'disruptor', 'support']);

export function liveRoleCounterVerb(state) {
  if (!state || !Array.isArray(state.entityList)) return null;
  const rank = ROLE_DRAFT_RANK;
  let best = null;
  let bestRank = Infinity;
  for (const entity of state.entityList) {
    if (!entity || entity.alive === false) continue;
    const role = roleFromEntity(entity);
    const idx = rank.indexOf(role);
    if (idx < 0 || idx >= bestRank) continue;
    const problem = swarmRoleProblem(role);
    if (!problem) continue;
    best = problem.counterVerb;
    bestRank = idx;
  }
  return best;
}

function offerMatchesCounter(offer, verb) {
  if (!offer || typeof verb !== 'string') return false;
  if (offer.shape && COUNTER_OFFER_SHAPES[verb] && offer.shape === COUNTER_OFFER_SHAPES[verb]) {
    return true;
  }
  const ids = COUNTER_OFFER_IDS[verb];
  if (!ids) return false;
  return ids.includes(offer.id);
}

/** Put the live role's counter card first. Pure: does not drop the other two. */
export function preferRoleCounterOffers(offers, stateOrVerb) {
  if (!Array.isArray(offers) || offers.length === 0) return offers || [];
  const verb = typeof stateOrVerb === 'string'
    ? stateOrVerb
    : liveRoleCounterVerb(stateOrVerb);
  if (!verb) return offers.slice();
  const match = [];
  const rest = [];
  for (const offer of offers) {
    (offerMatchesCounter(offer, verb) ? match : rest).push(offer);
  }
  return match.concat(rest);
}

function catalogCombatant(enemyId) {
  const def = ENEMY_BY_ID.get(enemyId);
  if (!def) return null;
  return {
    id: enemyId,
    type: 'ship',
    alive: true,
    mass: def.mass,
    hull: def.hull,
    hullMax: def.hull,
    armor: def.armor,
    armorMax: def.armor,
    armorFlat: def.armorFlat || 0,
    shield: def.shield,
    shieldMax: def.shield,
    flags: { invuln: false },
  };
}

function cloneCombatant(src) {
  return {
    ...src,
    flags: { ...(src.flags || {}), invuln: false },
  };
}

function applyHit(combatant, rawDamage) {
  let dmg = Math.max(0, Number(rawDamage) || 0);
  if (!(dmg > 0) || combatant.hull <= 0) return 0;
  if (combatant.shield > 0) {
    const absorbed = Math.min(combatant.shield, dmg);
    combatant.shield -= absorbed;
    dmg -= absorbed;
  }
  if (!(dmg > 0)) return rawDamage;
  dmg = Math.max(0, dmg - Math.max(0, combatant.armorFlat || 0));
  if (!(dmg > 0)) return rawDamage;
  if (combatant.armor > 0) {
    const absorbed = Math.min(combatant.armor, dmg);
    combatant.armor -= absorbed;
    dmg -= absorbed;
  }
  const hullHit = Math.min(combatant.hull, dmg);
  combatant.hull -= hullHit;
  if (combatant.hull <= 0) combatant.alive = false;
  return rawDamage;
}

function thrownMassDamage(combatant) {
  const receipt = resolveCollisionConsequence({
    target: combatant,
    other: { id: 'thrown_bank', type: 'asteroid', mass: 36000 },
    exchangedMomentum: Math.max(1, (Number(combatant.mass) || 1) * 28),
    tick: 0,
    provenance: {
      actorId: 1,
      weaponId: SHOVE_WEAPON_ID,
      tag: 'concussion',
      appliedTick: 0,
    },
  });
  return receipt && Number.isFinite(receipt.impactDamage) ? receipt.impactDamage : 0;
}

function gunInterval(weaponId) {
  const def = WEAPON_BY_ID.get(weaponId);
  const rof = def && Number.isFinite(def.rof) ? def.rof : 0;
  return rof > 0 ? 1 / rof : 1;
}

function gunDamage(weaponId) {
  const def = WEAPON_BY_ID.get(weaponId);
  return def && Number.isFinite(def.dmg) ? def.dmg : 0;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  if (!n) return Infinity;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

function bodyCountFor(problem) {
  if (problem.cluster === true) {
    const n = Number.isInteger(problem.lightCount) ? problem.lightCount : 3;
    return Math.max(2, n);
  }
  return 1;
}

/**
 * Time-to-resolve one role under a named verb, on a fixed seed.
 *
 * Physics verbs use the live collision-consequence slam (same law as PQ-174.05). Guns are the
 * starter Pulse, one body at a time. A well on a huddle hits every body at once; a shove peels
 * one hull. Rope on an anchor displaces the snare without grinding the hull. Seed is recorded
 * so the scenario is named; the catalog hulls are deterministic.
 */
export function simulateRoleResolve({
  role,
  verb,
  seed = PQ_174_03_SEED,
  weaponId = PULSE_WEAPON_ID,
} = {}) {
  const problem = swarmRoleProblem(role);
  if (!problem) {
    return {
      role, verb, seed, ok: false, reason: 'unknown_role',
      medianS: Infinity, seconds: Infinity, dead: false, resolved: false,
    };
  }
  const combatant = catalogCombatant(problem.enemyId);
  if (!combatant) {
    return {
      role, verb, seed, ok: false, reason: 'unknown_enemy',
      medianS: Infinity, seconds: Infinity, dead: false, resolved: false,
    };
  }
  const count = bodyCountFor(problem);
  const bodies = [];
  for (let i = 0; i < count; i++) bodies.push(cloneCombatant(combatant));
  const times = bodies.map(() => Infinity);
  const slam = thrownMassDamage(combatant);
  const intended = problem.counterVerb;
  const isGuns = verb === 'guns';
  const isRope = verb === 'rope';
  const isWell = verb === 'well';
  const isShove = verb === 'shove';
  const isThrow = verb === 'throw';

  if (isRope && problem.resolve === 'snare_gone') {
    return {
      role, verb, seed, ok: true, enemyId: problem.enemyId, count,
      intended, slamDamage: slam, catalogHull: combatant.hullMax, catalogMass: combatant.mass,
      medianS: ROPE_DISPLACE_S, seconds: ROPE_DISPLACE_S, dead: false, resolved: true,
      times: bodies.map(() => ROPE_DISPLACE_S),
      method: 'rope_displace',
    };
  }

  const setup = isWell
    ? (problem.cluster ? WELL_CLUSTER_SETUP_S : WELL_SOLO_DRAG_S)
    : 0;
  const simultaneous = isWell || (isThrow && count > 1) || (isShove && problem.cluster !== true && count === 1)
    || (isThrow && count === 1);
  const sequentialShove = isShove && problem.cluster === true;
  const interval = isGuns ? gunInterval(weaponId) : ROLE_SLAM_INTERVAL_S;
  const damage = isGuns
    ? gunDamage(weaponId)
    : (isRope ? 3 : slam);
  const maxS = 600;
  let elapsed = setup;
  let hits = 0;
  while (elapsed < maxS - 1e-9 && bodies.some((body) => body.hull > 0)) {
    elapsed += interval;
    hits += 1;
    if (isGuns || sequentialShove) {
      const live = bodies.find((body) => body.hull > 0);
      if (live) applyHit(live, damage);
    } else {
      for (const body of bodies) {
        if (body.hull > 0) applyHit(body, damage);
      }
    }
    for (let i = 0; i < bodies.length; i++) {
      if (bodies[i].hull <= 0 && !Number.isFinite(times[i])) times[i] = elapsed;
    }
  }
  const dead = bodies.every((body) => body.hull <= 0);
  const medianS = median(times);
  return {
    role, verb, seed, ok: true, enemyId: problem.enemyId, count,
    intended, slamDamage: slam, catalogHull: combatant.hullMax, catalogMass: combatant.mass,
    medianS: dead ? medianS : Infinity, seconds: dead ? elapsed : maxS + interval,
    dead, resolved: dead, times, hits, method: isGuns ? 'pulse' : verb,
    simultaneous: simultaneous && !isGuns,
    setup,
  };
}

export function roleResolveBoard(seed = PQ_174_03_SEED) {
  const rows = [];
  for (const role of SURVIVAL_PROBLEM_ROLES) {
    const problem = swarmRoleProblem(role);
    const physics = simulateRoleResolve({ role, verb: problem.counterVerb, seed });
    const guns = simulateRoleResolve({ role, verb: 'guns', seed });
    const alts = {};
    for (const alt of problem.alternatives) {
      alts[alt] = simulateRoleResolve({ role, verb: alt, seed });
    }
    rows.push({ role, seed, physics, guns, alts, counterVerb: problem.counterVerb });
  }
  return rows;
}

export function formatRoleResolveTable(rows) {
  const lines = [
    'role       | verb   | physics s | guns s | phys<=guns | intended<=alts',
    '-----------|--------|-----------|--------|------------|----------------',
  ];
  for (const row of rows) {
    const p = Number.isFinite(row.physics.medianS) ? row.physics.medianS.toFixed(3) : 'inf';
    const g = Number.isFinite(row.guns.medianS) ? row.guns.medianS.toFixed(3) : 'inf';
    const physOk = Number.isFinite(row.physics.medianS)
      && Number.isFinite(row.guns.medianS)
      && row.physics.medianS <= row.guns.medianS
      ? 'yes'
      : 'NO';
    let altOk = 'yes';
    for (const alt of Object.values(row.alts)) {
      if (!(Number.isFinite(row.physics.medianS) && row.physics.medianS <= alt.medianS)) {
        altOk = 'NO';
        break;
      }
    }
    lines.push(
      `${String(row.role).padEnd(10)} | ${String(row.counterVerb).padEnd(6)} | ${p.padStart(9)} | `
      + `${g.padStart(6)} | ${physOk.padEnd(10)} | ${altOk}`,
    );
  }
  return lines.join('\n');
}
