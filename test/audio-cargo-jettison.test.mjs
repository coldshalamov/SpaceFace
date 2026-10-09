// WF-13 — cargo jettison's diegetic cue: the HUD cargo panel's JETTISON button routes to
// cargo.dumpCargo, which emits `cargo:jettisoned { commodityId, amount }`. That act (pods shoved
// out of the hold) was total silence.
// FB-073 — it now plays its own authored voice: `sfx_cargo_jettison` shares the massline kick's
// dash_punch sample binding at rate 0.8. The old sfx_massline_jettison borrow and its
// massline2Flag double-guard are gone: this handler is the single voice on every route, and
// jettisonImpulse's audio:cue stays unmapped (physics-adjacent, never a second hit).
// Pure routing characterization: the AudioContext is never created here.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES, SAMPLE_BINDINGS } from '../src/data/audioRecipes.js';
import { audio, AUDIO_CUE_TO_RECIPE } from '../src/audio/audioSystem.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';

function hostWith(played = []) {
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  return host;
}

test('the jettison voice ships as data with a playable envelope and the shared kick binding', () => {
  const ids = RECIPES.map((recipe) => recipe.id);
  assert.equal(ids.filter((id) => id === 'sfx_cargo_jettison').length, 1);
  const recipe = RECIPES.find((entry) => entry.id === 'sfx_cargo_jettison');
  assert.ok(recipe.gainEnvelope && Number.isFinite(recipe.gainEnvelope.release),
    'jettison voice has an envelope');
  assert.notEqual(recipe.category, 'ui', 'a world act does not ride the ui bus');
  assert.deepEqual(SAMPLE_BINDINGS.sfx_cargo_jettison, { id: 'dash_punch', share: 0.5, rate: 0.8 },
    'the cargo jettison voice shares the massline kick binding at rate 0.8');
});

test('a real jettison receipt plays the voice; empty and malformed receipts stay silent', () => {
  const played = [];
  const host = hostWith(played);
  host._onCargoJettisoned({ commodityId: 'ore_generic', amount: 12 });
  assert.deepEqual(played.map((entry) => entry.recipeId), ['sfx_cargo_jettison']);
  assert.equal(played[0].opts.gain, 0.7);

  played.length = 0;
  host._onCargoJettisoned({ commodityId: 'ore_generic', amount: 0 });
  host._onCargoJettisoned(null);
  assert.deepEqual(played, [], 'no voice for a zero-amount or missing receipt');
});

test('the handler speaks on both flag routes — the double-guard is gone, not moved', () => {
  for (const flagOn of [false, true]) {
    const played = [];
    const host = hostWith(played);
    const prevEnabled = MASSLINE2_FLAGS.enabled;
    const prevJettison = MASSLINE2_FLAGS.jettisonImpulse;
    MASSLINE2_FLAGS.enabled = flagOn;
    MASSLINE2_FLAGS.jettisonImpulse = flagOn;
    try {
      host._onCargoJettisoned({ commodityId: 'ore_generic', amount: 12 });
      assert.deepEqual(played.map((entry) => entry.recipeId), ['sfx_cargo_jettison'],
        `flag ${flagOn ? 'on' : 'off'}: the cargo voice plays once`);
    } finally {
      MASSLINE2_FLAGS.enabled = prevEnabled;
      MASSLINE2_FLAGS.jettisonImpulse = prevJettison;
    }
  }
});

test("the impulse's physics-adjacent cue is unmapped so flag-on routes cannot double the voice", () => {
  assert.ok(!('massline.jettisonKick' in AUDIO_CUE_TO_RECIPE),
    'no cue row may re-voice the jettison kick beside the handler');
});
