// test/audio-ui-hover-tab.test.mjs — TOOL-02 regression.
// DONE WHEN: the hover and tab cues resolve to different promoted recordings, not the same
// ui_click sample pitch-shifted. Both promoted files must exist on disk as valid PCM WAVs.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';
import { resolveSampleBinding } from '../src/audio/sampleLibrary.js';

test('hover and tab cues resolve to distinct recipes', () => {
  const hoverRecipe = resolveAudioCueRecipeId('ui_hover');
  const tabRecipe = resolveAudioCueRecipeId('ui_tab');
  assert.equal(hoverRecipe, 'sfx_ui_hover');
  assert.equal(tabRecipe, 'sfx_ui_tab');
  assert.notEqual(hoverRecipe, tabRecipe);
});

test('hover and tab bind to different sample files', () => {
  const hover = resolveSampleBinding('sfx_ui_hover');
  const tab = resolveSampleBinding('sfx_ui_tab');
  assert.ok(hover, 'sfx_ui_hover must resolve to a manifest sample');
  assert.ok(tab, 'sfx_ui_tab must resolve to a manifest sample');
  assert.notEqual(hover.sampleId, tab.sampleId, 'hover and tab must not share one sample');
  assert.notEqual(hover.file, tab.file, 'hover and tab must not share one file');
  assert.notEqual(hover.sampleId, 'ui_click', 'hover must not be the click sample re-pitched');
  assert.notEqual(tab.sampleId, 'ui_click', 'tab must not be the click sample re-pitched');
  assert.equal(hover.rate, 1, 'hover should play its own recording at unity rate');
  assert.equal(tab.rate, 1, 'tab should play its own recording at unity rate');
});

test('promoted hover/tab wavs exist on disk as PCM WAVs', () => {
  for (const recipeId of ['sfx_ui_hover', 'sfx_ui_tab']) {
    const binding = resolveSampleBinding(recipeId);
    assert.ok(existsSync(binding.file), `${recipeId}: missing ${binding.file}`);
    const header = readFileSync(binding.file).subarray(0, 12);
    assert.equal(header.subarray(0, 4).toString('ascii'), 'RIFF', `${binding.file} is not a WAV`);
    assert.equal(header.subarray(8, 12).toString('ascii'), 'WAVE', `${binding.file} is not a WAV`);
  }
});
