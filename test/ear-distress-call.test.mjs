// distress:call was emitted by civilian traffic and received by nobody.
// A mayday inside the player's radius now plays one existing alert. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  DISTRESS_ADMIT_TICKS,
  DISTRESS_CALL_RECIPE,
  distressCallCue,
  playAdmittedEarCue,
} from '../src/audio/combatFeedbackEar.js';

const SEED = 4242;

test('seed 4242: a mayday routed to the player plays once', () => {
  assert.equal(SEED, 4242);
  const recipes = readFileSync(new URL('../src/data/audioRecipes.js', import.meta.url), 'utf8');
  assert.match(recipes, new RegExp(`id:\\s*'${DISTRESS_CALL_RECIPE}'`), 'the mayday uses an existing recipe');

  assert.equal(distressCallCue({ routedToPlayer: false, callerId: 7, pos: { x: 0, z: 0 } }), null);
  assert.equal(distressCallCue({ routedToPlayer: true, pos: { x: 0, z: 0 } }), null);

  const cue = distressCallCue({
    routedToPlayer: true,
    callerId: 7,
    pos: { x: 40, z: -12 },
    simTime: 3,
  });
  assert.equal(cue.recipeId, DISTRESS_CALL_RECIPE);
  assert.equal(cue.position.x, 40);
  assert.equal(cue.critical, true);

  const played = [];
  const host = { play(id, opts) { played.push({ id, opts }); return { id }; } };
  assert.ok(playAdmittedEarCue(host, cue, 10));
  assert.equal(playAdmittedEarCue(host, cue, 10 + DISTRESS_ADMIT_TICKS - 1), null);
  assert.equal(played.length, 1);
  assert.equal(played[0].id, DISTRESS_CALL_RECIPE);
  assert.equal(played[0].opts.gain, 0.62);

  const src = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
  assert.match(src, /bus\.on\('distress:call'/);
});
