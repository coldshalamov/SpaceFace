// danger:miningNoise crossed the line and nothing played it. One darker alert
// than a mayday, ducked so the beam does not bury it, and not a wall if the
// meter flickers. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  DISTRESS_CALL_RECIPE,
  MINING_NOISE_ADMIT_TICKS,
  MINING_NOISE_RECIPE,
  distressCallCue,
  miningNoiseDangerCue,
  playAdmittedEarCue,
} from '../src/audio/combatFeedbackEar.js';

const SEED = 4242;

test('seed 4242: crossing mining-noise danger plays one ducked alert', () => {
  assert.equal(SEED, 4242);
  const recipes = readFileSync(new URL('../src/data/audioRecipes.js', import.meta.url), 'utf8');
  assert.match(recipes, new RegExp(`id:\\s*'${MINING_NOISE_RECIPE}'`));

  assert.equal(miningNoiseDangerCue(null), null);
  assert.equal(miningNoiseDangerCue({ level: 70, threshold: 70 }), null);
  assert.equal(miningNoiseDangerCue({ threshold: 70 }), null);

  const cue = miningNoiseDangerCue({ level: 71, threshold: 70 });
  assert.equal(cue.recipeId, MINING_NOISE_RECIPE);
  assert.equal(cue.recipeId, DISTRESS_CALL_RECIPE);
  assert.ok(cue.rate < 1, 'the loud-beam warning sits under the mayday');
  assert.equal(cue.duck, true);
  assert.equal(cue.critical, true);
  const mayday = distressCallCue({ routedToPlayer: true, callerId: 'c1' });
  assert.ok(mayday.rate == null || mayday.rate !== cue.rate);

  const played = [];
  const host = { play(id, opts) { played.push({ id, opts }); return { id }; } };
  assert.ok(playAdmittedEarCue(host, cue, 10));
  assert.equal(playAdmittedEarCue(host, miningNoiseDangerCue({ level: 80, threshold: 70 }), 10 + MINING_NOISE_ADMIT_TICKS - 1), null);
  assert.equal(played.length, 1);
  assert.equal(played[0].opts.duck, true);
  assert.equal(played[0].opts.rate, 0.72);
  assert.equal(played[0].opts.critical, true);

  assert.ok(playAdmittedEarCue(host, miningNoiseDangerCue({ level: 71, threshold: 70 }), 10 + MINING_NOISE_ADMIT_TICKS));
  assert.equal(played.length, 2);

  const src = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
  assert.match(src, /bus\.on\('danger:miningNoise'/);
});
