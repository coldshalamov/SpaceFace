// Wave C5 — every combat verb names a recipe that already exists.
// fire, hit, shield, hull, shove, throw release, latch, break, slam, kill, dock, undock.

import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES } from '../src/data/audioRecipes.js';
import { COMBAT_VERB_CUES, COMBAT_VERB_IDS, combatVerbRecipe } from '../src/audio/combatVerbCues.js';

const RECIPE_IDS = new Set(RECIPES.map((recipe) => recipe && recipe.id).filter(Boolean));

const REQUIRED = Object.freeze([
  'fire', 'hit', 'shield', 'hull', 'shove', 'throwRelease',
  'latch', 'break', 'slam', 'kill', 'dock', 'undock',
]);

test('each combat verb maps to one existing recipe, and no two verbs share a recipe', () => {
  assert.deepEqual(COMBAT_VERB_IDS, REQUIRED);
  const used = new Set();
  for (const verbId of REQUIRED) {
    const recipeId = combatVerbRecipe(verbId);
    assert.equal(recipeId, COMBAT_VERB_CUES[verbId]);
    assert.ok(recipeId, `${verbId} has no recipe`);
    assert.ok(RECIPE_IDS.has(recipeId), `${verbId} recipe ${recipeId} is not in the catalog`);
    assert.equal(used.has(recipeId), false, `${verbId} reuses ${recipeId}`);
    used.add(recipeId);
  }
});
