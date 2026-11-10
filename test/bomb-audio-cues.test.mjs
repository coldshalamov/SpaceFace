// PQ-205.01 — detonation cues are real catalog voices, never the UI click or one shared boom.
import assert from 'node:assert/strict';
import test from 'node:test';

import { BOMB_DEFS, BOMB_IDS } from '../src/data/bombs.js';
import { AUDIO_RECIPE_BY_ID, resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';
import {
  BOMB_AUDIO_CUES,
  BOMB_CUE_TO_RECIPE,
  authoredBombPeak,
  resolveBombDetonationCue,
} from '../src/audio/bombAudio.js';

test('every bomb payload detonation cue resolves to a dedicated recipe, never the UI click', () => {
  const entries = Object.entries(BOMB_DEFS);
  assert.ok(entries.length >= 8, 'the payload table is populated');
  const recipeIds = new Set();
  for (const [id, bomb] of entries) {
    assert.ok(bomb.audioCue, `${id}: payload must name an audioCue`);
    const catalog = BOMB_AUDIO_CUES[id];
    assert.ok(catalog, `${id}: catalog row`);
    assert.equal(bomb.audioCue, catalog.detonate, `${id}: data audioCue matches catalog`);
    const recipeId = resolveAudioCueRecipeId(bomb.audioCue);
    assert.notEqual(recipeId, 'sfx_ui_click',
      `${id}: cue ${bomb.audioCue} fell through to the UI click — add a recipe or a mapping`);
    assert.notEqual(recipeId, 'sfx_explosion_small',
      `${id}: cue ${bomb.audioCue} must not share the generic small explosion`);
    assert.ok(AUDIO_RECIPE_BY_ID[recipeId], `${id}: recipe ${recipeId} exists`);
    assert.equal(recipeId, catalog.recipeId);
    recipeIds.add(recipeId);
  }
  assert.equal(recipeIds.size, BOMB_IDS.length, 'eight payloads, eight detonation voices');
});

test('tar ruptures damp, EMP cuts dry, and the slug has inhale plus collapse', () => {
  assert.equal(resolveAudioCueRecipeId('bombs.goo.burst'), 'sfx_bomb_goo_burst');
  assert.equal(resolveAudioCueRecipeId('bombs.emp.pulse'), 'sfx_bomb_emp_pulse');
  assert.equal(resolveAudioCueRecipeId('bombs.slug.inhale'), 'sfx_bomb_slug_inhale');
  assert.equal(resolveAudioCueRecipeId('bombs.slug.collapse'), 'sfx_bomb_slug_collapse');
  assert.equal(BOMB_DEFS.bomb_singularity.fieldLoopCue, 'bombs.slug.inhale');
  assert.equal(BOMB_DEFS.bomb_singularity.collapseAudioCue, 'bombs.slug.collapse');
  assert.equal(resolveBombDetonationCue('bomb_singularity', 'fuze'), 'bombs.slug.inhale');
  assert.equal(resolveBombDetonationCue('bomb_singularity', 'collapse'), 'bombs.slug.collapse');

  const tar = AUDIO_RECIPE_BY_ID.sfx_bomb_goo_burst;
  assert.equal(tar.filterType, 'lowpass');
  assert.ok(tar.filterFreq <= 320, 'tar is a damp rupture, not a bright crack');
  assert.equal(tar.transientClick, undefined, 'tar does not click');

  const emp = AUDIO_RECIPE_BY_ID.sfx_bomb_emp_pulse;
  assert.equal(emp.wave, 'square');
  assert.equal(emp.filterType, 'highpass');
  assert.ok(emp.gainEnvelope.release <= 0.06, 'EMP cutoff is dry and short');

  const inhale = AUDIO_RECIPE_BY_ID.sfx_bomb_slug_inhale;
  assert.equal(inhale.type, 'continuous_oscillator');
  assert.ok(inhale.freqSweep[1] < inhale.freqSweep[0], 'inhale falls as the well lives');
});

test('concussion has low-frequency shove weight without being louder than frag', () => {
  const frag = AUDIO_RECIPE_BY_ID.sfx_bomb_frag_burst;
  const shove = AUDIO_RECIPE_BY_ID.sfx_bomb_concussion_shove;
  assert.ok(authoredBombPeak(shove) < authoredBombPeak(frag),
    `concussion peak ${authoredBombPeak(shove)} must stay below frag ${authoredBombPeak(frag)}`);
  assert.ok(shove.subBass && shove.subBass.gain > frag.subBass.gain,
    'the drum is heavier in the sub, not just louder');
  assert.ok(shove.filterFreq < frag.filterFreq, 'the shove stays in the low band');
});

test('every catalog cue maps to its authored recipe', () => {
  for (const [cue, recipeId] of Object.entries(BOMB_CUE_TO_RECIPE)) {
    assert.equal(resolveAudioCueRecipeId(cue), recipeId, cue);
    assert.ok(AUDIO_RECIPE_BY_ID[recipeId], recipeId);
  }
});
