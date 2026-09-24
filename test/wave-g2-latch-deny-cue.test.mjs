// Wave G2 — a denied latch ticks. A successful latch, the taut line, and the release
// snap each use a different cue. Hover does not fire the denial.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MINIMAL_ACTION_AUDIO,
  minimalActionAudioSpec,
  requestMinimalActionAudio,
} from '../src/audio/minimalActionAudio.js';
import { RECIPES } from '../src/data/audioRecipes.js';

test('G2 denied latch, successful latch, taut line, and release snap are four cue ids', () => {
  const deny = minimalActionAudioSpec('latchDenied');
  const latch = minimalActionAudioSpec('attachment');
  const taut = minimalActionAudioSpec('loadedLine');
  const release = minimalActionAudioSpec('release');
  assert.equal(deny.sourceEvent, 'tether:latchDenied');
  assert.equal(deny.bind, true);
  const ids = [deny.recipeId, latch.recipeId, taut.recipeId, release.recipeId];
  assert.equal(new Set(ids).size, 4);
  assert.notEqual(deny.recipeId, 'sfx_ui_error');
  assert.notEqual(deny.recipeId, 'sfx_ui_hover');
  assert.ok(RECIPES.some((recipe) => recipe.id === deny.recipeId));
  assert.equal(MINIMAL_ACTION_AUDIO.some((row) => /hover/i.test(row.sourceEvent)), false);
});

test('G2 a held deny does not fire again inside the cooldown', () => {
  const plays = [];
  const host = {
    state: { tick: 10 },
    play(recipeId) { plays.push(recipeId); },
  };
  const first = requestMinimalActionAudio(host, 'latchDenied', { reason: 'blocked' }, 10);
  const held = requestMinimalActionAudio(host, 'latchDenied', { reason: 'blocked' }, 12);
  const later = requestMinimalActionAudio(host, 'latchDenied', { reason: 'blocked' }, 20);
  assert.equal(first.played, true);
  assert.equal(held, null);
  assert.equal(later.played, true);
  assert.deepEqual(plays, ['sfx_massline_deny', 'sfx_massline_deny']);
});
