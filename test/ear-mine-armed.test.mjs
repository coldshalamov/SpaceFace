// weapons:mineArmed drew an arming flash and made no sound. The click is the
// mine's own recipe, once per mine, quieter than the detonation. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  MINE_ARMED_ADMIT_TICKS,
  MINE_ARMED_RECIPE,
  MINE_DETONATION_RECIPE,
  mineArmedCue,
  playAdmittedEarCue,
} from '../src/audio/combatFeedbackEar.js';

const SEED = 4242;

test('seed 4242: arming a mine clicks once and is not the blast', () => {
  assert.equal(SEED, 4242);
  const recipes = readFileSync(new URL('../src/data/audioRecipes.js', import.meta.url), 'utf8');
  assert.match(recipes, new RegExp(`id:\\s*'${MINE_ARMED_RECIPE}'`));
  assert.notEqual(MINE_ARMED_RECIPE, MINE_DETONATION_RECIPE);
  assert.equal(mineArmedCue({ ownerId: 1 }), null);

  const cue = mineArmedCue({ mineId: 12, ownerId: 1, pos: { x: 8, z: 3 } });
  assert.equal(cue.recipeId, MINE_ARMED_RECIPE);
  assert.ok(cue.gain < 0.5);
  assert.equal(cue.position.z, 3);

  const played = [];
  const host = { play(id, opts) { played.push({ id, opts }); return { id }; } };
  assert.ok(playAdmittedEarCue(host, cue, 4));
  assert.equal(playAdmittedEarCue(host, cue, 4 + MINE_ARMED_ADMIT_TICKS - 1), null);
  assert.equal(played.length, 1);

  const src = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
  assert.match(src, /bus\.on\('weapons:mineArmed'/);
});
