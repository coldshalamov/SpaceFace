// mines:detonated was emitted when a mine went off and nothing played it.
// The blast uses the existing small explosion, once per mine. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  MINE_ADMIT_TICKS,
  MINE_DETONATION_RECIPE,
  mineDetonationCue,
  playAdmittedEarCue,
} from '../src/audio/combatFeedbackEar.js';

const SEED = 4242;

test('seed 4242: a mine detonation plays one explosion', () => {
  assert.equal(SEED, 4242);
  const recipes = readFileSync(new URL('../src/data/audioRecipes.js', import.meta.url), 'utf8');
  assert.match(recipes, new RegExp(`id:\\s*'${MINE_DETONATION_RECIPE}'`));
  assert.equal(mineDetonationCue({ damage: 40 }), null);

  const cue = mineDetonationCue({ mineId: 'm9', pos: { x: 8, z: 3 }, damage: 40 });
  assert.equal(cue.recipeId, MINE_DETONATION_RECIPE);
  assert.equal(cue.position.z, 3);

  const played = [];
  const host = { play(id, opts) { played.push({ id, opts }); return { id }; } };
  assert.ok(playAdmittedEarCue(host, cue, 4));
  assert.equal(playAdmittedEarCue(host, cue, 4 + MINE_ADMIT_TICKS - 1), null);
  assert.equal(played.length, 1);
  assert.equal(played[0].opts.gain, 0.8);

  const src = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
  assert.match(src, /bus\.on\('mines:detonated'/);
});
