// BM-02 — shield recovery must not answer with the shield-collapse voice.
//
// Gap: PLAYER_ACTION_CUES.shieldRestored resolved to 'sfx_shield_blowout_pop', the
// exact recipe the `shield` collapse verb uses — recovery and collapse, opposite
// meanings, one voice. The table's own named owner (audioSystem's shieldRestored
// handler) already plays the dedicated 'sfx_shield_restore' shimmer, so the row
// disagreed with production. The normalized verb-cue route is the contract this
// table sells; it must name the recovery voice.
import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES } from '../src/data/audioRecipes.js';
import { combatVerbRecipe } from '../src/audio/combatVerbCues.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { audio, AUDIO_RECIPE_BY_ID } from '../src/audio/audioSystem.js';

const RECIPE_IDS = new Set(RECIPES.map((recipe) => recipe && recipe.id).filter(Boolean));

test('BM-02: shieldRestored resolves to the dedicated recovery shimmer', () => {
  assert.equal(combatVerbRecipe('shieldRestored'), 'sfx_shield_restore');
});

test('BM-02: recovery and collapse are distinct voices', () => {
  assert.notEqual(
    combatVerbRecipe('shieldRestored'),
    combatVerbRecipe('shield'),
    'shield recovery must not share the shield-collapse recipe',
  );
});

test('BM-02: the recovery recipe exists where real play() looks it up', () => {
  const recipe = combatVerbRecipe('shieldRestored');
  assert.ok(RECIPE_IDS.has(recipe), `${recipe} must be in the audio catalog`);
  assert.ok(AUDIO_RECIPE_BY_ID[recipe],
    `${recipe} must exist in the recipe map real play() consults`);
});

test('BM-02: the shieldRestored emit plays the mapped recipe, never the collapse pop', () => {
  const state = createGameState(4242);
  state.mode = 'flight';
  const bus = createBus();
  const player = {
    id: state.playerId, type: 'ship', alive: true, team: 0, mass: 16,
    hull: 200, hullMax: 200, shield: 0, shieldMax: 40, armorHp: 40, armorMax: 40,
    radius: 6, pos: { x: 0, z: 0 }, rot: 0,
  };
  state.entities.set(player.id, player);
  audio.init({ state, bus, helpers: {} });

  const played = [];
  const originalPlay = audio.play;
  audio.play = (recipeId) => { played.push(recipeId); return { id: recipeId }; };
  try {
    const before = played.length;
    bus.emit('shieldRestored', { combatantId: player.id, pos: { x: 0, z: 0 } });
    const slice = played.slice(before);
    assert.ok(slice.includes(combatVerbRecipe('shieldRestored')),
      `shieldRestored must play the mapped recipe — got ${slice.join(', ') || 'nothing'}`);
    assert.ok(!slice.includes(combatVerbRecipe('shield')),
      'shield recovery must never play the collapse voice');
  } finally {
    audio.play = originalPlay;
    audio.state = null;
    audio.rt = null;
    audio.bus = null;
  }
});
