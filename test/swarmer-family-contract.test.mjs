import assert from 'node:assert/strict';
import test from 'node:test';

import { killRewardRecipeFor } from '../src/data/killRewards.js';
import {
  EMBER_COOK_OFF,
  SWARMER_FAMILY,
  SWARMER_WAVE1_ENEMY_IDS,
  validateSwarmerFamily,
} from '../src/data/swarmerFamily.js';
import { makeEnemySpawnSpec, scaleCombatant } from '../src/systems/combat.js';

test('the six-entry family is internally coherent and fixed-stat across encounter levels', () => {
  assert.equal(SWARMER_FAMILY.length, 6);
  assert.deepEqual(validateSwarmerFamily(), []);
  for (const row of SWARMER_FAMILY) {
    const levelOne = makeEnemySpawnSpec(row.enemyId, 1, { x: 0, z: 0 });
    const levelTwelve = makeEnemySpawnSpec(row.enemyId, 12, { x: 0, z: 0 });
    assert.deepEqual(
      [levelTwelve.hull, levelTwelve.armorHp, levelTwelve.shield],
      [levelOne.hull, levelOne.armorHp, levelOne.shield],
      `${row.enemyId} difficulty comes from composition, not hidden stat inflation`,
    );
    assert.equal(levelTwelve.data.fixedCombatStats, true);
  }
});

test('wave-one capability records reach the live spawn spec', () => {
  const flea = makeEnemySpawnSpec('flea_swarmer', 5, { x: 0, z: 0 });
  assert.equal(flea.data.fieldAnchor.familyKey, 'flea_snare');
  assert.equal(flea.data.fieldAnchor.familyCap, 2);

  const skitter = makeEnemySpawnSpec('skitter_swarmer', 6, { x: 0, z: 0 });
  assert.equal(skitter.data.terrainAmbush.nest, 'rock');

  const ember = makeEnemySpawnSpec('ember_swarmer', 6, { x: 0, z: 0 });
  for (const key of ['radiusWu', 'impulse', 'maxAffected', 'provenance']) {
    assert.equal(ember.data.deathCookOff[key], EMBER_COOK_OFF[key]);
  }
});

test('each swarmer owns a distinct physical reward read instead of the generic light burst', () => {
  const expected = new Map([
    ['mote_swarmer', ['mote', 1, 0]],
    ['wasp_swarmer', ['swarmer_wasp', 3, 1]],
    ['dart_swarmer', ['swarmer_dart', 1, 2]],
    ['flea_swarmer', ['swarmer_flea', 2, 1]],
    ['skitter_swarmer', ['swarmer_skitter', 3, 0]],
    ['ember_swarmer', ['swarmer_ember', 1, 2]],
  ]);
  for (const [enemyId, [recipeId, materialPickups, chipPickups]] of expected) {
    const spec = makeEnemySpawnSpec(enemyId, 1, { x: 0, z: 0 });
    const recipe = killRewardRecipeFor(spec);
    assert.equal(recipe.id, recipeId);
    assert.equal(recipe.materials.reduce((sum, row) => sum + row.pickups, 0), materialPickups);
    assert.equal(recipe.creditChips.count, chipPickups);
  }
  assert.deepEqual([...expected.keys()].filter((id) => !SWARMER_WAVE1_ENEMY_IDS.includes(id)), [
    'mote_swarmer', 'wasp_swarmer',
  ]);
});

test('the spawn authority never reintroduces per-level stat inflation', () => {
  assert.deepEqual(scaleCombatant({ hull: 100, armor: 10, shield: 20 }, 3), {
    hull: 100, armor: 10, shield: 20, dmgMult: 1,
  });
});
