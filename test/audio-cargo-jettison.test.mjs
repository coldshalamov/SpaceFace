// WF-13 — cargo jettison's diegetic cue: the HUD cargo panel's JETTISON button routes to
// cargo.dumpCargo, which emits `cargo:jettisoned { commodityId, amount }`. That act (pods shoved
// out of the hold) was total silence. It now plays the authored massline jettison kick.
// Pure routing characterization: the AudioContext is never created here.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { audio } from '../src/audio/audioSystem.js';

function hostWith(played = []) {
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  return host;
}

test('the jettison kick ships as data with a playable envelope', () => {
  const ids = RECIPES.map((recipe) => recipe.id);
  assert.equal(ids.filter((id) => id === 'sfx_massline_jettison').length, 1);
  const recipe = RECIPES.find((entry) => entry.id === 'sfx_massline_jettison');
  assert.ok(recipe.gainEnvelope && Number.isFinite(recipe.gainEnvelope.release),
    'jettison kick has an envelope');
  assert.notEqual(recipe.category, 'ui', 'a world act does not ride the ui bus');
});

test('a real jettison receipt plays the kick; empty and malformed receipts stay silent', () => {
  const played = [];
  const host = hostWith(played);
  host._onCargoJettisoned({ commodityId: 'ore_generic', amount: 12 });
  assert.deepEqual(played.map((entry) => entry.recipeId), ['sfx_massline_jettison']);
  assert.equal(played[0].opts.gain, 0.7);

  played.length = 0;
  host._onCargoJettisoned({ commodityId: 'ore_generic', amount: 0 });
  host._onCargoJettisoned(null);
  assert.deepEqual(played, [], 'no voice for a zero-amount or missing receipt');
});
