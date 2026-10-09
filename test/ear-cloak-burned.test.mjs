// cloak:burned toasted the player and made no sound. The fade is the burn,
// slower than going dark, once per pulse, and only the player's own cloak.
// An NPC burn stays quiet. Seed 4242. Burn does not also play the drop snap.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  CLOAK_BURN_ADMIT_TICKS,
  CLOAK_BURN_RECIPE,
  cloakBurnCue,
  playAdmittedEarCue,
} from '../src/audio/combatFeedbackEar.js';

const SEED = 4242;

test('seed 4242: a cloak burn fades once and is not the drop', () => {
  assert.equal(SEED, 4242);
  const recipes = readFileSync(new URL('../src/data/audioRecipes.js', import.meta.url), 'utf8');
  assert.match(recipes, new RegExp(`id:\\s*'${CLOAK_BURN_RECIPE}'`));
  assert.notEqual(CLOAK_BURN_RECIPE, 'sfx_massline_cloak_off');
  assert.equal(cloakBurnCue({ until: 4 }), null);

  const cue = cloakBurnCue({ entityId: 1, until: 9, x: 12, z: -4 });
  assert.equal(cue.recipeId, CLOAK_BURN_RECIPE);
  assert.equal(cue.gain, 0.55);
  assert.equal(cue.rate, 0.84);
  assert.equal(cue.key, 'cloakBurn:1');
  assert.equal(cue.position.x, 12);
  assert.equal(cue.position.z, -4);

  const played = [];
  const host = { play(id, opts) { played.push({ id, opts }); return { id }; } };
  assert.ok(playAdmittedEarCue(host, cue, 10));
  assert.equal(playAdmittedEarCue(host, cue, 10 + CLOAK_BURN_ADMIT_TICKS - 1), null);
  assert.equal(played.length, 1);
  assert.equal(played[0].opts.rate, 0.84);
  assert.equal(played[0].id, CLOAK_BURN_RECIPE);

  const src = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
  assert.match(src, /bus\.on\('cloak:burned'/);
  assert.match(src, /p\.entityId !== playerId/);
  assert.match(src, /cloakBurnCue\(p\)/);

  const cloak = readFileSync(new URL('../src/systems/cloak.js', import.meta.url), 'utf8');
  assert.match(cloak, /Cloak burned — your scan lit you up[\s\S]{0,280}audioOwnedByVerb: true/);
});
