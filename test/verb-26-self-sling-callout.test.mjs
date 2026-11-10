import assert from 'node:assert/strict';
import test from 'node:test';

import { selfSlingBonusDv } from '../src/systems/masslineThrow.js';
import { selfSlingCalloutText } from '../src/ui/stuntCallout.js';
import { combatVerbRecipe } from '../src/audio/combatVerbCues.js';
import { RECIPES } from '../src/data/audioRecipes.js';

test('a self-sling callout names the rounded bonus the law already returns', () => {
  const earned = selfSlingBonusDv(100, 0.55, true);
  assert.equal(earned, 0, 'the bonus law stays zero free energy');
  assert.equal(selfSlingCalloutText(earned), 'SELF-SLING +0');
  assert.equal(selfSlingCalloutText(12.6), 'SELF-SLING +13');
  assert.equal(selfSlingCalloutText(-0.4), 'SELF-SLING +0');
  assert.match(selfSlingCalloutText(3), /^SELF-SLING \+\d+$/);
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
