// SEED-ST-12: the first wanted mark is named once. Later heat stays quiet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { noteFirstWantedMark } from '../src/ui/hudAttention.js';

const HUD_SRC = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');

test('seed 4242 names the first wanted mark once, including how it clears', () => {
  const state = createGameState(4242);
  assert.equal(state.meta.seed, 4242);
  const line = noteFirstWantedMark(state, true);
  assert.match(line, /WANTED/);
  assert.match(line, /time/);
  assert.match(line, /distance/);
  assert.doesNotMatch(line, /surrender/i);
  assert.equal(state.player.hints.firstWanted, true);
  assert.equal(noteFirstWantedMark(state, true), '');
});

test('heat below the mark, a repeat rise, and hints off do not spend a second line', () => {
  const below = createGameState(4242);
  assert.equal(noteFirstWantedMark(below, false), '');
  assert.notEqual(below.player.hints.firstWanted, true);

  const quiet = createGameState(4242);
  quiet.settings.gameplay.tutorialHints = false;
  assert.equal(noteFirstWantedMark(quiet, true), '');
  assert.notEqual(quiet.player.hints.firstWanted, true);

  const heat = HUD_SRC.slice(HUD_SRC.indexOf("on('heat:changed'"), HUD_SRC.indexOf("on('weapons:vent'"));
  assert.match(heat, /v >= 0\.15/);
  const rising = heat.slice(heat.indexOf('if (wanted && !wantedActive)'), heat.indexOf('} else if (wanted && wantedActive)'));
  const refresh = heat.slice(heat.indexOf('} else if (wanted && wantedActive)'), heat.indexOf('} else if (!wanted && wantedActive)'));
  assert.match(rising, /noteFirstWantedMark\(state, true\)/);
  assert.doesNotMatch(refresh, /noteFirstWantedMark/);
  assert.doesNotMatch(heat, /surrender/i);
});
