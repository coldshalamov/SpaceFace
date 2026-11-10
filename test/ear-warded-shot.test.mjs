// combat:warded was emitted when an escort caught a shot and nothing heard it.
// The catch is a short shield pop, once per escort inside the admit gap. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  WARD_ADMIT_TICKS,
  WARDED_SHOT_RECIPE,
  playAdmittedEarCue,
  wardedShotCue,
} from '../src/audio/combatFeedbackEar.js';

const SEED = 4242;

test('seed 4242: a warded shot pops once per escort', () => {
  assert.equal(SEED, 4242);
  const recipes = readFileSync(new URL('../src/data/audioRecipes.js', import.meta.url), 'utf8');
  assert.match(recipes, new RegExp(`id:\\s*'${WARDED_SHOT_RECIPE}'`));
  assert.equal(wardedShotCue({ targetId: 1 }), null);

  const cue = wardedShotCue({ escortId: 4, targetId: 9, pos: { x: 1, z: 2 } });
  assert.equal(cue.recipeId, WARDED_SHOT_RECIPE);
  assert.equal(cue.gain, 0.42);

  const played = [];
  const host = { play(id, opts) { played.push({ id, opts }); return { id }; } };
  assert.ok(playAdmittedEarCue(host, cue, 20));
  assert.equal(playAdmittedEarCue(host, cue, 20 + WARD_ADMIT_TICKS - 1), null);
  const later = wardedShotCue({ escortId: 4, pos: { x: 3, z: 3 } });
  assert.ok(playAdmittedEarCue(host, later, 20 + WARD_ADMIT_TICKS));
  assert.equal(played.length, 2);

  const src = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
  assert.match(src, /bus\.on\('combat:warded'/);
});
