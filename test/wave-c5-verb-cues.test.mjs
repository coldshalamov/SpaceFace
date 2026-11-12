// Wave C5 — fire, hit, shield, hull, shove, throw release, latch, break, slam, kill, dock, undock
// each name a recipe that exists.

import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES } from '../src/data/audioRecipes.js';
import { COMBAT_VERB_IDS, combatVerbRecipe } from '../src/audio/combatVerbCues.js';

const recipeIds = new Set(RECIPES.map((recipe) => recipe.id));

test('C5 every combat verb maps to a recipe', () => {
  assert.deepEqual(COMBAT_VERB_IDS, [
    'fire', 'hit', 'shield', 'hull', 'shove', 'throwRelease', 'latch', 'break', 'slam', 'kill', 'dock', 'undock',
  ]);
  for (const verb of COMBAT_VERB_IDS) {
    const id = combatVerbRecipe(verb);
    assert.ok(id, `${verb} has a recipe`);
    assert.equal(recipeIds.has(id), true, `${verb} recipe ${id} is authored`);
  }
  assert.equal(combatVerbRecipe('missing'), '');
});
