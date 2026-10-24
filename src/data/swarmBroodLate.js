// Late Brood families. The base roster in src/data/swarmBrood.js stays the early clock.
// This module is the continuation: each row is a light instanced body, budget-counted
// by folding its count out of the mite share. The engine merges the tables.

import {
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_QUEEN_ID,
  swarmBroodBossFor,
} from './swarmBrood.js';

export const SWARM_BROOD_LATE_FAMILIES = Object.freeze([
  {
    id: 'burrower',
    name: 'Burrower',
    role: 'ambush',
    fromWave: 19,
    weight: 2,
    // How many of this family replace mites on a wave that has unlocked it.
    cohort: 8,
    radius: 3.2,
    mass: 18,
    hull: 16,
    speed: 48,
    turn: 3.2,
    credits: 3,
    score: 28,
    telegraph: {
      bark: 'warn',
      line: 'The rock cracks — a burrower is coming out.',
      cue: 'weapon_charge',
    },
    counter: 'It hides in the rock. Clear the silhouette before it bursts.',
    deathLeaves: 'a cracked shell',
    bodyColor: [0.28, 0.22, 0.16],
    bodyEmissive: [0.18, 0.10, 0.04],
    // Low and wide: a rock-crab, not the mite dart.
    stretch: Object.freeze([0.72, 0.48, 1.28]),
    burrows: true,
    burstRange: 64,
    windupS: 0.5,
  },
  {
    id: 'splitter',
    name: 'Splitter',
    role: 'brood',
    fromWave: 21,
    weight: 2,
    cohort: 8,
    radius: 5.4,
    mass: 28,
    hull: 20,
    speed: 34,
    turn: 2.4,
    credits: 4,
    score: 36,
    telegraph: {
      bark: 'warn',
      line: 'The splitter cracks — three smaller bodies take its place.',
      cue: 'weapon_charge',
    },
    counter: 'Kill it and three mites step out of the same budget. Sweep the pieces.',
    deathLeaves: 'three mites',
    bodyColor: [0.45, 0.18, 0.32],
    bodyEmissive: [0.40, 0.08, 0.22],
    stretch: Object.freeze([1.15, 1.05, 1.15]),
    splits: true,
  },
  {
    id: 'brood_mother',
    name: 'Brood Mother',
    role: 'sac',
    fromWave: 23,
    weight: 2,
    cohort: 1,
    radius: 6.4,
    mass: 70,
    hull: 48,
    speed: 22,
    turn: 1.2,
    credits: 6,
    score: 60,
    telegraph: {
      bark: 'warn',
      line: 'The brood mother is walking — she is dropping mites.',
      cue: 'engine_flare',
    },
    counter: 'Kill the mother. Her mite tide stops when she does.',
    deathLeaves: 'the rest of her tide, unspent',
    bodyColor: [0.36, 0.14, 0.18],
    bodyEmissive: [0.42, 0.10, 0.12],
    stretch: Object.freeze([1.35, 1.2, 1.45]),
    births: true,
    birthEveryS: 1,
    birthBudget: 12,
  },
]);

/** The late family def for an id, or null. Pure. */
export function swarmBroodLateFamily(id) {
  if (typeof id !== 'string') return null;
  for (const family of SWARM_BROOD_LATE_FAMILIES) if (family.id === id) return family;
  return null;
}

/**
 * Replace mite count with late families the wave has unlocked. The plan total does not
 * grow. The queen's flood stays mites. Unknown plans pass through as a copy.
 */
export function foldBroodLatePlan(plan, wave) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  const copy = Array.isArray(plan)
    ? plan.map((part) => ({ id: part.id, count: part.count }))
    : [];
  if (swarmBroodBossFor(w) === SWARM_BROOD_QUEEN_ID) return copy;
  const legal = SWARM_BROOD_LATE_FAMILIES.filter((fam) => w >= fam.fromWave);
  if (legal.length === 0) return copy;
  const mite = copy.find((part) => part.id === 'mite');
  if (!mite || !(mite.count > 1)) return copy;
  for (const fam of legal) {
    const room = mite.count - 1;
    if (room <= 0) break;
    const authored = Math.max(1, Math.trunc(Number(fam.cohort) || 8));
    const take = Math.min(room, authored);
    mite.count -= take;
    const row = copy.find((part) => part.id === fam.id);
    if (row) row.count += take;
    else copy.push({ id: fam.id, count: take });
  }
  return copy.filter((part) => part.count > 0);
}

/** Authoring check for the late table. Empty when honest. Does not touch the base table. */
export function swarmBroodLateIssues() {
  const issues = [];
  const seen = new Set(SWARM_BROOD_FAMILIES.map((row) => row.id));
  let prevWave = 0;
  for (const family of SWARM_BROOD_FAMILIES) {
    if (family && family.fromWave > prevWave) prevWave = family.fromWave;
  }
  SWARM_BROOD_LATE_FAMILIES.forEach((family, i) => {
    const path = `swarmBroodLateFamilies[${i}]`;
    if (!family || typeof family.id !== 'string' || !family.id) {
      issues.push({ path, message: 'family has no id' });
      return;
    }
    if (seen.has(family.id)) issues.push({ path, message: `duplicate family id ${family.id}` });
    seen.add(family.id);
    if (!(family.fromWave > prevWave)) {
      issues.push({ path, message: `${family.id} does not continue the roster clock` });
    }
    prevWave = family.fromWave;
    if (!(family.weight > 0)) issues.push({ path, message: `${family.id} has no composition weight` });
    if (!(family.radius > 0) || !(family.radius < 12)) {
      issues.push({ path, message: `${family.id} radius outside the light-body band` });
    }
    if (!(family.hull > 0)) issues.push({ path, message: `${family.id} has no hull` });
    if (!(family.speed > 0)) issues.push({ path, message: `${family.id} has no speed` });
    const tele = family.telegraph;
    if (!tele || typeof tele.bark !== 'string' || typeof tele.line !== 'string' || typeof tele.cue !== 'string'
      || !tele.bark || !tele.line || !tele.cue) {
      issues.push({ path, message: `${family.id} telegraph is not {bark,line,cue}` });
    }
    if (typeof family.counter !== 'string' || family.counter.length < 10) {
      issues.push({ path, message: `${family.id} has no counter card line` });
    }
    if (!Array.isArray(family.bodyColor) || family.bodyColor.length !== 3) {
      issues.push({ path, message: `${family.id} has no body colour recipe` });
    }
  });
  return issues;
}
