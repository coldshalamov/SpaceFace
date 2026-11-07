import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MUSIC_STEMS } from '../src/data/audioRecipes.js';
import {
  STEM_KEYS,
  THEME_STATES,
  THEME_STEM_WEIGHTS,
  resolveThemeMatrix,
  scoreStemWeights,
} from '../src/audio/themeMatrix.js';
import { BOSS_STEM_WEIGHTS } from '../src/audio/scoreDirector.js';
import { AUTHORED_STEM_SAMPLES } from '../src/audio/themeCompose.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('five stems: travel, tension, combat, station, boss', () => {
  assert.deepEqual([...STEM_KEYS], ['A', 'B', 'C', 'D', 'E']);
  assert.equal(MUSIC_STEMS.length, 5);
  const station = MUSIC_STEMS.find((row) => row.id === 'stem_d');
  const boss = MUSIC_STEMS.find((row) => row.id === 'stem_e');
  assert.equal(station.label, 'Station');
  assert.equal(station.themeState, 'station');
  assert.equal(station.authoredSampleId, 'theme_station');
  assert.equal(boss.label, 'Boss');
  assert.equal(boss.themeState, 'boss');
  assert.equal(boss.authoredSampleId, 'theme_boss');
});

test('the boss state resolves to the boss stem, not the station body', () => {
  const boss = resolveThemeMatrix({ bossActive: true, inCombat: true, threat: 1 });
  assert.equal(boss.state, 'boss');
  assert.equal(boss.musicState, 'combat');
  assert.equal(boss.audibleStemWeights.E, 1);
  assert.equal(boss.stemDef.id, 'stem_e');
  // The station row stays the station row.
  const station = resolveThemeMatrix({ docked: true });
  assert.equal(station.state, 'station');
  assert.equal(station.stemDef.id, 'stem_d');
});

test('the boss mix is an authored row, not a phase remix', () => {
  const frame = { phase: 'fight', stem: 'E', stemWeights: BOSS_STEM_WEIGHTS };
  assert.equal(scoreStemWeights(frame, { state: 'boss' }), null);
  assert.equal(THEME_STEM_WEIGHTS.boss.E, 1);
});

test('the boss body is a real authored file', () => {
  assert.equal(AUTHORED_STEM_SAMPLES.boss, 'theme_boss');
  assert.ok(existsSync(path.join(ROOT, 'assets/audio/music/theme_boss.wav')));
  assert.ok(THEME_STATES.includes('boss'));
});
