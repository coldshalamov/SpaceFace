// SFQ-B193 park — gun, shove, and field already use different recipes.
// Parasite and pressure-sac are not authored weapons. Snarl stays a disruptor.
// Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import {
  WEAPON_FAMILY_RECIPE,
  recipeForWeapon,
} from '../src/audio/audioSystem.js';
import { combatVerbRecipe } from '../src/audio/combatVerbCues.js';

const SEED = 4242;

test('live weapon verbs differ; parasite and pressure sac are not weapons (seed 4242)', () => {
  assert.equal(SEED, 4242);
  const ids = WEAPONS.map((row) => String(row.id || ''));
  assert.equal(ids.some((id) => /parasite|pressure[-_ ]?sac/i.test(id)), false);
  assert.notEqual(WEAPON_FAMILY_RECIPE.kinetic, WEAPON_FAMILY_RECIPE.concussion);
  assert.notEqual(WEAPON_FAMILY_RECIPE.gravitic, WEAPON_FAMILY_RECIPE.kinetic);
  assert.notEqual(combatVerbRecipe('combat:shove'), WEAPON_FAMILY_RECIPE.kinetic);
  assert.equal(recipeForWeapon('wpn_snarl_s'), 'sfx_wpn_disruptor');
  assert.equal(WEAPON_FAMILY_RECIPE.web, 'sfx_wpn_disruptor');
});
