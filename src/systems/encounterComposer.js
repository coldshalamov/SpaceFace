// The encounter composer (design/overhaul/03_COMBAT.md §9A.3, ruling R19): one module builds
// every fight from the same parts — a cast list, an entrance, a formation and a budget — and says
// in plain words what the fight is. Swarm rounds call it through their recipes
// (src/data/swarmCourseCast.js); Adventure spawners call it for pirates, bounties and raids.
//
// Pure and deterministic: data in, a plan out. It never spawns; the caller's own owner (the wave
// owner, an encounter director) materializes the plan through spawnBudget as before.
//
// Recipe:
//   { id, name, line, groups: [ { cast: [{ enemyId, count }], entrance, formation } ] }
//     entrance  — { gate | gateIndex, atTick, debut, staged, distance, afterOpeningBeat }
//                 (the same fields a Course package already understands)
//     formation — 'river' (a flowing pack), 'arc' (a front spread across the bearing),
//                 'escort' (heavies screened by their fodder), 'line' (a firing line on the rim),
//                 'solo' (one readable body)
// Plan:
//   { id, name, line, jobs, cost, groups: [{ id, jobs, cast, entrance, formation, cost }],
//     packages: [{ enemyId, count, formation, groupId, jobs, ...entrance }] }

import { castJobs, enemyJobFor, ENEMY_JOB_WORDS } from '../data/enemyJobs.js';

export const ENCOUNTER_FORMATIONS = Object.freeze(['river', 'arc', 'escort', 'line', 'solo']);

const ENTRANCE_KEYS = Object.freeze(['gate', 'gateIndex', 'atTick', 'debut', 'staged', 'distance',
  'afterOpeningBeat']);

function castCost(cast) {
  let cost = 0;
  for (const entry of cast) {
    const row = enemyJobFor(entry.enemyId);
    cost += (row ? row.cost : 1) * (entry.count | 0);
  }
  return Math.round(cost * 10) / 10;
}

/**
 * Build a plan from a recipe. Each cast entry becomes one package that rides the group's entrance;
 * later entries of the same group arrive on the same bearing a beat behind ('same' gate, +12 ticks)
 * so a group lands as one readable event.
 */
export function composeEncounter(recipe) {
  if (!recipe || !Array.isArray(recipe.groups) || !recipe.groups.length) {
    throw new TypeError('composeEncounter: a recipe needs at least one group');
  }
  const groups = [];
  const packages = [];
  for (let g = 0; g < recipe.groups.length; g++) {
    const src = recipe.groups[g];
    const cast = (src.cast || []).filter((c) => c && typeof c.enemyId === 'string' && (c.count | 0) > 0)
      .map((c) => Object.freeze({ enemyId: c.enemyId, count: c.count | 0 }));
    if (!cast.length) throw new TypeError(`composeEncounter(${recipe.id}): group ${g} has no cast`);
    const formation = ENCOUNTER_FORMATIONS.includes(src.formation) ? src.formation : 'river';
    const entrance = {};
    for (const key of ENTRANCE_KEYS) if (src.entrance && src.entrance[key] !== undefined) entrance[key] = src.entrance[key];
    const id = `${recipe.id}:g${g}`;
    const jobs = Object.freeze(castJobs(cast));
    groups.push(Object.freeze({ id, jobs, cast: Object.freeze(cast), entrance: Object.freeze(entrance),
      formation, cost: castCost(cast) }));
    for (let i = 0; i < cast.length; i++) {
      const pkg = { enemyId: cast[i].enemyId, count: cast[i].count, ...entrance, formation, groupId: id, jobs };
      if (i > 0) {
        // The rest of the group follows its lead on the same bearing, a beat behind.
        delete pkg.gateIndex; delete pkg.debut; delete pkg.staged;
        pkg.gate = 'same';
        pkg.atTick = (Number.isInteger(entrance.atTick) ? entrance.atTick : 0) + 12 * i;
      }
      packages.push(Object.freeze(pkg));
    }
  }
  const all = [];
  for (const g of groups) for (const c of g.cast) all.push(c);
  return Object.freeze({
    id: recipe.id,
    name: recipe.name || recipe.id,
    line: recipe.line || describeCast(all),
    jobs: Object.freeze(castJobs(all)),
    cost: Math.round(groups.reduce((s, g) => s + g.cost, 0) * 10) / 10,
    groups: Object.freeze(groups),
    packages: Object.freeze(packages),
  });
}

/** Plain words for a cast: "a rushing pack, with a sniper on the rim". */
export function describeCast(cast) {
  const jobs = castJobs(cast);
  const words = jobs.map((job) => ENEMY_JOB_WORDS[job] && ENEMY_JOB_WORDS[job].one).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return capitalise(words[0]);
  return capitalise(`${words.slice(0, -1).join(', ')}, with ${words[words.length - 1]}`);
}

/** The best answer to a cast, in plain words — the job that is "the problem" leads. */
export function castAnswer(plan) {
  const lead = plan && plan.jobs && plan.jobs.find((j) => j !== 'rush') || (plan && plan.jobs && plan.jobs[0]);
  return lead && ENEMY_JOB_WORDS[lead] ? ENEMY_JOB_WORDS[lead].answer : '';
}

function capitalise(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
