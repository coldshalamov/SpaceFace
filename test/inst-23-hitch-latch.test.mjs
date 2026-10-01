import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { combatVerbRecipe } from '../src/audio/combatVerbCues.js';

test('a hitch latch uses its own voice, not the massline lock', () => {
  const hitch = combatVerbRecipe('fields:hitchLatched');
  const massline = combatVerbRecipe('tether:latched');
  assert.equal(hitch, 'sfx_hitch_latch');
  assert.equal(massline, 'sfx_tether_latch_lock');
  assert.notEqual(hitch, massline);
  const hitchRecipe = RECIPES.find((entry) => entry.id === hitch);
  const lockRecipe = RECIPES.find((entry) => entry.id === massline);
  assert.ok(hitchRecipe && lockRecipe);
  assert.equal(hitchRecipe.type, 'oscillator');
  assert.notEqual(hitchRecipe.wave, lockRecipe.wave);
  assert.notEqual(hitchRecipe.baseFreq, lockRecipe.baseFreq);
});
