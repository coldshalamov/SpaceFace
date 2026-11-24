import assert from 'node:assert/strict';
import test from 'node:test';

import { selfSlingBonusDv } from '../src/systems/masslineThrow.js';
import { selfSlingCalloutText } from '../src/ui/stuntCallout.js';
import { combatVerbRecipe } from '../src/audio/combatVerbCues.js';
import { RECIPES } from '../src/data/audioRecipes.js';

test('a self-sling draws no score line — the Line speaks one grammar, director 2026-11-23', () => {
  const earned = selfSlingBonusDv(100, 0.55, true);
  assert.equal(earned, 0, 'the bonus law stays zero free energy');
  assert.equal(selfSlingCalloutText(earned), '');
  assert.equal(selfSlingCalloutText(12.6), '');
  assert.equal(selfSlingCalloutText(-0.4), '');
  assert.equal(selfSlingCalloutText(3), '');
});

test('planting and releasing the momentum sink use two cues that are not gravitic fire', () => {
  const bite = combatVerbRecipe('weapons:momentumSinkPlanted');
  const release = combatVerbRecipe('weapons:momentumSinkReleased');
  assert.equal(bite, 'sfx_vector_mine');
  assert.equal(release, 'sfx_ui_drawer_latch');
  assert.notEqual(bite, release);
  assert.notEqual(bite, 'sfx_wpn_gravitic');
  assert.notEqual(release, 'sfx_wpn_gravitic');
  assert.ok(RECIPES.some((row) => row.id === bite));
  assert.ok(RECIPES.some((row) => row.id === release));
});
