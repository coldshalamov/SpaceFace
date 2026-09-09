// PQ-133.12 — authored factory examples.
// The modifier lives in the live trait catalog so compileAttackSpec can run it.
// The wave recipe is NOT merged into SURVIVAL_WAVES (pinned template waves stay untouched).
// It runs through planWave via the recipe override seam.

import { ATTACK_TRAIT_BY_ID } from './attackTraits.js';
import { SURVIVAL_WAVE_SCHEMA_VERSION } from './survivalWaves.js';
import { LAGRANGE_ARENA_ID } from '../systems/lagrangeCrucible.js';

export const FACTORY_MODIFIER_ID = 'mod_herald_fan';

export const FACTORY_MODIFIER = ATTACK_TRAIT_BY_ID[FACTORY_MODIFIER_ID];

export const FACTORY_WAVE_RECIPE = Object.freeze({
  id: 'factory_herald_pincer',
  schemaVersion: SURVIVAL_WAVE_SCHEMA_VERSION,
  arenaId: LAGRANGE_ARENA_ID,
  wave: 2,
  objective: { kind: 'resolve_hostiles' },
  threatBudget: 11,
  packages: Object.freeze([
    Object.freeze({
      atTick: 0,
      gateGroup: 'sw',
      role: 'mass',
      enemyId: 'wasp_swarmer',
      count: 5,
      batchSize: 5,
      batchGapTicks: 0,
    }),
    Object.freeze({
      atTick: 90,
      gateGroup: 'ne',
      role: 'pressure',
      enemyId: 'reaver_pirate',
      count: 3,
      batchSize: 3,
      batchGapTicks: 0,
    }),
  ]),
  arenaPhase: 'idle',
  completion: Object.freeze({
    requiredPackagesMaterialized: true,
    blockingRolesResolved: Object.freeze(['mass', 'pressure']),
    cleanupTicks: 180,
  }),
  rewards: Object.freeze({ xp: 60, credits: 14 }),
  loc: Object.freeze({
    summaryKey: 'recipe.factory_herald_pincer.summary',
    detailKey: 'recipe.factory_herald_pincer.detail',
  }),
});

/** Deliberately illegal: 25 swarmers, over the default spawn cap of 24. */
export const FACTORY_OVER_CAP_RECIPE = Object.freeze({
  id: 'factory_over_cap_flood',
  schemaVersion: SURVIVAL_WAVE_SCHEMA_VERSION,
  arenaId: LAGRANGE_ARENA_ID,
  wave: 2,
  objective: { kind: 'resolve_hostiles' },
  threatBudget: 30,
  packages: Object.freeze([
    Object.freeze({
      atTick: 0,
      gateGroup: 'sw',
      role: 'mass',
      enemyId: 'wasp_swarmer',
      count: 25,
      batchSize: 25,
      batchGapTicks: 0,
    }),
  ]),
  arenaPhase: 'idle',
  completion: Object.freeze({
    requiredPackagesMaterialized: true,
    blockingRolesResolved: Object.freeze(['mass']),
    cleanupTicks: 180,
  }),
  rewards: Object.freeze({ xp: 0, credits: 0 }),
  loc: Object.freeze({
    summaryKey: 'recipe.factory_herald_pincer.summary',
    detailKey: 'recipe.factory_herald_pincer.detail',
  }),
});

/** Peak 41 — past the hard cap of 40. */
export const FACTORY_HARD_CAP_RECIPE = Object.freeze({
  ...FACTORY_OVER_CAP_RECIPE,
  id: 'factory_hard_cap_flood',
  packages: Object.freeze([
    Object.freeze({
      atTick: 0,
      gateGroup: 'sw',
      role: 'mass',
      enemyId: 'wasp_swarmer',
      count: 41,
      batchSize: 41,
      batchGapTicks: 0,
    }),
  ]),
});
