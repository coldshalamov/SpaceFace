// NXB-017 — Author one three-round act whose physical question changes each round
// PB-SWARM-A — SF-061+062 opening-wave physical promise + mass-and-gap wave composition
// PB-SWARM-B — SF-064+068 specialist introduction rehearsal + boss-round ammo placement

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SURVIVAL_THREE_ROUND_ACT,
  validateThreeRoundActSequence,
} from '../src/data/survivalActs.js';
import {
  isSwarmBossWave,
  isSwarmMassGapWave,
  SWARM_DEBUT_TICKS,
  SWARM_FODDER_ROLES,
} from '../src/data/swarmMode.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { templateQuestionOf } from '../src/data/survivalWaves.js';

const SEED = 4242;

test('NXB-017: Three-round act has changing physical question and distinct answer verbs', () => {
  const result = validateThreeRoundActSequence(SURVIVAL_THREE_ROUND_ACT);
  assert.equal(result.valid, true, result.error);

  const [round1, round2, round3] = SURVIVAL_THREE_ROUND_ACT;

  // Round 1: loose mass against exposed enemy
  assert.equal(round1.verb, 'throw');
  assert.equal(round1.roleProblem, 'mass');
  assert.equal(round1.physicalTool, 'loose_mass');
  assert.equal(round1.draftAfter, true, 'Draft recovery opportunity after round 1');

  // Round 2: specialist introduction contests use
  assert.equal(round2.verb, 'shove');
  assert.equal(round2.roleProblem, 'pressure');
  assert.equal(round2.physicalTool, 'specialist_rehearsal');
  assert.equal(round2.draftAfter, true, 'Draft recovery opportunity after round 2');

  // Round 3: heavy anchor with clear counter-window
  assert.equal(round3.verb, 'rope');
  assert.equal(round3.roleProblem, 'anchor');
  assert.equal(round3.physicalTool, 'anchor_counter_window');
  assert.equal(round3.draftAfter, true, 'Draft recovery opportunity after round 3');

  // Verify template questions match the three-round physical progression
  assert.equal(templateQuestionOf(1).answerVerb, 'throw');
  assert.equal(templateQuestionOf(2).answerVerb, 'shove');
  assert.equal(templateQuestionOf(3).answerVerb, 'rope');
});

test('PB-SWARM-A (SF-061+062): Opening-wave physical promise + mass-and-gap wave composition', () => {
  // Wave 1: Opening wave physical promise (SF-061)
  const plan1 = planWave({ ruleset: 'swarm', wave: 1, seed: SEED, arenaId: 'helios_core' });
  assert.ok(plan1.packages.length > 0, 'Wave 1 fields packages');
  const lightCount = plan1.packages
    .filter((p) => SWARM_FODDER_ROLES.includes(p.role))
    .reduce((sum, p) => sum + p.count, 0);
  assert.ok(lightCount >= 6, 'Wave 1 supplies throwable ammunition (>= 6 light bodies)');

  // Wave 6: Mass-and-gap round (SF-062)
  assert.equal(isSwarmMassGapWave(6), true, 'Wave 6 is a mass-gap wave');
  const plan6 = planWave({ ruleset: 'swarm', wave: 6, seed: SEED, arenaId: 'helios_core' });
  assert.ok(plan6.swarm.massGap, 'Wave 6 plan includes massGap wall specification');
  assert.equal(plan6.swarm.massGap.gapSlots.length, 2, 'MassGap wall has exactly 2 navigable gaps');

  // Wave 12: Mass-and-gap round with wall muscle (SF-062)
  assert.equal(isSwarmMassGapWave(12), true, 'Wave 12 is a mass-gap wave');
  const plan12 = planWave({ ruleset: 'swarm', wave: 12, seed: SEED, arenaId: 'helios_core' });
  assert.ok(plan12.packages.some((p) => p.wall === true), 'MassGap wall heavies pour through the chord');
});

test('PB-SWARM-B (SF-064+068): Specialist introduction rehearsal + boss-round ammo placement', () => {
  // Wave 2: Specialist introduction rehearsal (SF-064)
  const plan2 = planWave({ ruleset: 'swarm', wave: 2, seed: SEED, arenaId: 'helios_core' });
  const debutPkg = plan2.packages.find((p) => p.debut === true);
  assert.ok(debutPkg, 'Wave 2 stages a specialist debut package');
  assert.equal(debutPkg.enemyId, 'reaver_pirate');
  assert.equal(debutPkg.count, 1, 'Debuting specialist arrives alone');
  assert.equal(debutPkg.atTick, SWARM_DEBUT_TICKS, 'Arrives at SWARM_DEBUT_TICKS for readable rehearsal beat');

  // Wave 10: Boss round ammo placement (SF-068)
  assert.equal(isSwarmBossWave(10), true, 'Wave 10 is a boss wave');
  const plan10 = planWave({ ruleset: 'swarm', wave: 10, seed: SEED, arenaId: 'helios_core' });
  const ammoPkgs = plan10.packages.filter((p) => p.champion !== true);
  assert.ok(ammoPkgs.length > 0, 'Boss wave supplies non-champion bodies for ammunition');
  const ammoCount = ammoPkgs.reduce((sum, p) => sum + p.count, 0);
  assert.ok(ammoCount >= 2, 'Boss wave supplies at least 2 non-champion ammunition bodies to redirect');
});
