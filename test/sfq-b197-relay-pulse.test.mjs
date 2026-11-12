// SFQ-B197 — a relay pulse is not a machine motor. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import {
  playRelayPulse,
  relayPulseCue,
  resolveMachineWorkCycle,
} from '../src/audio/audioSystem.js';

const SEED = 4242;
const RECIPE_IDS = new Set(RECIPES.map((row) => row.id));

test('a relay pulse uses the swell, not the work motor (seed 4242)', () => {
  assert.equal(SEED, 4242);
  assert.equal(relayPulseCue({ siteIds: [] }), null);
  assert.equal(relayPulseCue(null), null);
  const cue = relayPulseCue({ sectorId: 's', siteIds: ['charon_pylon_field'] });
  assert.equal(cue.recipeId, 'sfx_anomaly_swell');
  assert.equal(RECIPE_IDS.has(cue.recipeId), true);
  assert.notEqual(cue.recipeId, resolveMachineWorkCycle('running').recipeId);
  const plays = [];
  const captions = [];
  const played = playRelayPulse({
    play(id, opts) { plays.push({ id, opts }); return { id }; },
    _emitPresentationCaption(text) { captions.push(text); },
  }, { siteIds: ['a'] });
  assert.equal(played.id, 'sfx_anomaly_swell');
  assert.equal(plays[0].opts.id, 'sfx_anomaly_swell');
  assert.equal(captions[0], 'Relay pulse.');
});
