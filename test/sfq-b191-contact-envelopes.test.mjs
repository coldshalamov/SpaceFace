// SFQ-B191 — contact weight is already the tier ladder. This pins the envelopes:
// a kiss swells, a broadside is a transient with a longer tail. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { resolveCollisionCue, COLLISION_CUE } from '../src/audio/audioSystem.js';

const SEED = 4242;

function envelope(id) {
  const recipe = RECIPES.find((row) => row.id === id);
  assert.ok(recipe, id);
  return recipe.gainEnvelope;
}

test('kiss attack is slow and broadside attack is a transient (seed 4242)', () => {
  assert.equal(SEED, 4242);
  const kiss = resolveCollisionCue({
    massA: 16, typeA: 'ship', massB: null, typeB: 'asteroid', dp: 40, impulse: 40,
  });
  const broadside = resolveCollisionCue({
    massA: 200, typeA: 'ship', massB: null, typeB: 'station', dp: 24000, impulse: 24000,
  });
  const scrape = resolveCollisionCue({
    massA: 16, typeA: 'ship', massB: null, typeB: 'asteroid',
    dp: 40, impulse: 40, hullDamage: 0, closingSpeed: COLLISION_CUE.SCRAPE_SPEED,
  });
  assert.equal(kiss.tier, 'kiss');
  assert.equal(kiss.recipeId, 'sfx_dock_clunk');
  assert.equal(broadside.tier, 'broadside');
  assert.equal(broadside.recipeId, 'sfx_explosion_large');
  assert.equal(scrape.tier, 'scrape');
  assert.equal(scrape.recipeId, 'sfx_hull_scrape');

  const kissEnv = envelope(kiss.recipeId);
  const broadEnv = envelope(broadside.recipeId);
  const scrapeEnv = envelope(scrape.recipeId);
  assert.ok(kissEnv.attack > broadEnv.attack * 10, `${kissEnv.attack} vs ${broadEnv.attack}`);
  assert.ok(broadEnv.release > kissEnv.release, `${broadEnv.release} vs ${kissEnv.release}`);
  assert.ok(scrapeEnv.release < broadEnv.release);
  assert.ok(scrapeEnv.attack < kissEnv.attack);
});
