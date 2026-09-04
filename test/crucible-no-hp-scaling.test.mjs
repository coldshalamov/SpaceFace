import test from 'node:test';
import assert from 'node:assert/strict';
import { SURVIVAL_WAVES, validateWaveRecipe, waveHealthOverrideIssues } from '../src/data/survivalWaves.js';
import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const RULING = 'Difficulty comes from geometry, mass and numbers, never enemy hit points';
test(`${RULING}: every authored recipe and thirty-wave plan keeps catalog hull values`, () => {
  for (const recipe of SURVIVAL_WAVES) assert.equal(waveHealthOverrideIssues(recipe).length, 0, recipe.id);
  for (const seed of [47, 4242, 7777]) {
    for (const arena of COMBAT_LAB_ARENAS) {
      for (const ruleset of ['survival', 'swarm']) {
        for (let wave = 1; wave <= 30; wave++) {
          const plan = planWave({ seed, arenaId: arena.id, wave, ruleset });
          assert.notEqual(plan.ok, false, `${arena.id} ${ruleset} wave ${wave}`);
          assert.deepEqual(waveHealthOverrideIssues(plan), [], `${RULING}: ${ruleset} ${arena.id} wave ${wave}`);
        }
      }
    }
  }
});
test(`${RULING}: injecting higher hull or nested HP scaling fails recipe validation`, () => {
  assert.equal(validateWaveRecipe(SURVIVAL_WAVES[0]).ok, true);
  for (const override of [{ hpScale: 2 }, { hull: 9000 }, { stats: { health_multiplier: 1.1 } }]) {
    const recipe = structuredClone(SURVIVAL_WAVES[0]);
    Object.assign(recipe.packages[0], override);
    const result = validateWaveRecipe(recipe);
    assert.equal(result.ok, false, RULING);
    assert.ok(result.issues.some(i => i.message.includes(RULING)));
  }
});
