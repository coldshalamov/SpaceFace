// Recipe/registry integrity for the audio identity tables (infer-audio-01, go-beyond pass).
//
// These are the defects found while auditing the module INST-33/INST-34 changed. Each one is a
// silent-failure class: the table looks correct to every reader and to every existing audit gate,
// while the thing the gate exists to catch walks straight through.
import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES, SAMPLE_BINDINGS } from '../src/data/audioRecipes.js';
import { SAMPLE_MANIFEST, resolveSampleBinding } from '../src/audio/sampleLibrary.js';
import {
  AUDIO_CUE_TO_RECIPE,
  AUDIO_RECIPE_BY_ID,
  SUSTAINED_BEAM_RECIPE_IDS,
  resolveAudioCueRecipeId,
} from '../src/audio/audioSystem.js';

const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

// ---------------------------------------------------------------------------------------
// Defect 1 — the distortion law the module's own header states
// ---------------------------------------------------------------------------------------

test('a recipe that sets distortionAmount names the curve it was authored against', () => {
  // audioRecipes.js header: "a recipe that sets distortionAmount must also set distortionCurve"
  // and "Amounts are not interchangeable across curves." An untagged amount silently rides the
  // synth's softclip default, so the authored number stops describing the sound it claims to.
  const offenders = RECIPES
    .filter((r) => r.distortionAmount != null && !r.distortionCurve)
    .map((r) => r.id);
  assert.deepEqual(offenders, [],
    `these recipes set distortionAmount with no distortionCurve: ${offenders.join(', ')}`);
});

test('the two recipes grandfathered onto softclip stay on it', () => {
  // The one intentional exception, pinned so a future "fix" does not silently re-map a voice.
  for (const id of ['sfx_wpn_beam_laser', 'sfx_squelch_danger']) {
    assert.equal(recipeById.get(id).distortionCurve, 'softclip', `${id} must keep softclip`);
  }
});

test('the massline threat growl and the plasma cannon name their curve', () => {
  // These two were the offenders: sfx_massline_threat_growl carried a bare amount, and
  // sfx_wpn_plasma sat on softclip without being grandfathered. Both are red without the fix.
  assert.equal(recipeById.get('sfx_massline_threat_growl').distortionCurve, 'tanh');
  assert.equal(recipeById.get('sfx_wpn_plasma').distortionCurve, 'tanh');
});

// ---------------------------------------------------------------------------------------
// Defect 2 — prototype-chain leakage made two audit gates pass falsely
// ---------------------------------------------------------------------------------------

test('a cue id that is an Object.prototype member resolves to nothing, not to a function', () => {
  // Before the fix, resolveAudioCueRecipeId('toString') returned Function.prototype.toString,
  // and AUDIO_RECIPE_BY_ID['constructor'] returned Object. Every audit gate of the shape
  // `assert(AUDIO_RECIPE_BY_ID[rid])` therefore PASSED on a missing recipe.
  for (const probe of ['toString', 'constructor', 'hasOwnProperty', 'valueOf', 'isPrototypeOf',
    'propertyIsEnumerable', 'toLocaleString']) {
    assert.equal(resolveAudioCueRecipeId(probe), null,
      `cue id "${probe}" must not resolve to an inherited member`);
    assert.equal(AUDIO_RECIPE_BY_ID[probe], undefined,
      `recipe id "${probe}" must not resolve to an inherited member`);
  }
});

test('the recipe registry has no prototype, so a missing recipe reads as missing', () => {
  assert.equal(Object.getPrototypeOf(AUDIO_RECIPE_BY_ID), null,
    'AUDIO_RECIPE_BY_ID must be built prototype-less');
  // The audit-gate expression the whole audio identity sweep relies on must now be honest.
  for (const probe of ['sfx_not_a_real_recipe', 'toString', 'constructor']) {
    assert.equal(!!AUDIO_RECIPE_BY_ID[probe], false,
      `"${probe}" must fail an AUDIO_RECIPE_BY_ID truthiness gate`);
  }
  // A real recipe still resolves, so the guard did not over-correct into "nothing resolves".
  assert.equal(AUDIO_RECIPE_BY_ID.sfx_wpn_flak.id, 'sfx_wpn_flak');
});

test('resolveAudioCueRecipeId still resolves every real cue row to a registered recipe', () => {
  for (const [cueId, recipeId] of Object.entries(AUDIO_CUE_TO_RECIPE)) {
    assert.equal(resolveAudioCueRecipeId(cueId), recipeId, `${cueId} must resolve to ${recipeId}`);
    assert.ok(AUDIO_RECIPE_BY_ID[recipeId],
      `${cueId} names ${recipeId}, which must be a registered recipe`);
  }
  assert.equal(resolveAudioCueRecipeId('sfx_ui_click'), 'sfx_ui_click',
    'a literal recipe id still resolves through the recipe table');
  assert.equal(resolveAudioCueRecipeId('definitely:not:a:cue'), null);
});

// ---------------------------------------------------------------------------------------
// Defect 3 — the sustained-beam loop path was pinned to one hardcoded recipe id
// ---------------------------------------------------------------------------------------

test('every sustained-beam voice is authored, continuous, and loop-backed', () => {
  // _startBeam starts a loop voice and the runtime sets loop = type.startsWith('continuous').
  // A finite recipe in that set would leave a silent gap where the drone belongs, and a
  // non-loop sample would click once and stop.
  for (const id of SUSTAINED_BEAM_RECIPE_IDS) {
    const recipe = recipeById.get(id);
    assert.ok(recipe, `${id} must be authored`);
    assert.equal(String(recipe.type).startsWith('continuous'), true, `${id} must be a continuous type`);
    assert.ok(Number.isFinite(recipe.baseFreq), `${id} must author a fundamental`);
    assert.ok(Number.isFinite(recipe.filterFreq), `${id} must author a band`);
    const binding = resolveSampleBinding(id);
    assert.ok(binding && binding.loop, `${id} must bind a LOOP sample for a sustained drone`);
  }
});

test('the beam recipes share one loop body, so a second beam voice costs no new asset', () => {
  // Both beam voices deliberately reuse the authored beam loop; the catalog forbids authoring a
  // new sample bank. This pins that "two voices" stays two READINGS of one recording.
  const laser = resolveSampleBinding('sfx_wpn_beam_laser');
  const heavy = resolveSampleBinding('sfx_wpn_heavy_beam');
  assert.equal(heavy.sampleId, laser.sampleId);
  assert.ok(SAMPLE_MANIFEST.has(heavy.sampleId));
});

test('no sample binding names a sample that is not in the manifest', () => {
  // The hybrid path degrades to the pre-158 sound when a sample is absent, so a typo here is
  // silent: the cue still plays, just as the wrong thing. Pin it at the table.
  const missing = Object.values(SAMPLE_BINDINGS)
    .filter((b) => !SAMPLE_MANIFEST.has(b.id))
    .map((b) => b.id);
  assert.deepEqual(missing, [], `bindings name absent samples: ${missing.join(', ')}`);
});
