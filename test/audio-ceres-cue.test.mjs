// U3 (WF-13) — the rock calving's semantic audio family: the chain's own phase receipts drive
// exactly two world-positional beats (groan before the split, the split itself), resolved from
// the bound cast actor and culled by play()'s world-hearing range. Pure routing characterization:
// the AudioContext is never created here.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { audio } from '../src/audio/audioSystem.js';

const CHAIN_SCHEMA = 'spaceface.ceresCausalChain.v1';

function calvingReceipt(phase, actorSlotIds = ['ceres_seam_miner']) {
  return {
    schema: CHAIN_SCHEMA,
    kind: 'phase',
    eventId: 'ev_rock_calving',
    phase,
    cue: phase === 'groan' ? 'blind_cone' : phase === 'calve' ? 'breaking_the_pattern' : 'stacking',
    actorSlotIds,
  };
}

function hostWith(state, played = []) {
  const host = Object.create(audio);
  host.state = state;
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  return host;
}

const CAST = [{
  id: 5, alive: true, pos: { x: 200, z: 50 },
  data: { activityActorSlotId: 'ceres_seam_miner' },
}];

test('the calving family ships both recipes as ambient-category data', () => {
  const ids = RECIPES.map((recipe) => recipe.id);
  assert.equal(ids.filter((id) => id === 'sfx_ambient_rock_groan').length, 1);
  assert.equal(ids.filter((id) => id === 'sfx_ambient_rock_calve').length, 1);
  for (const id of ['sfx_ambient_rock_groan', 'sfx_ambient_rock_calve']) {
    const recipe = RECIPES.find((entry) => entry.id === id);
    assert.equal(recipe.category, 'ambient', `${id} rides the ambient bus`);
    assert.ok(recipe.gainEnvelope && Number.isFinite(recipe.gainEnvelope.release), `${id} has an envelope`);
  }
});

test('groan and calve phases play their own beat at the bound actor position', () => {
  const played = [];
  const host = hostWith({ entityList: CAST.slice() }, played);
  host._onCeresCausalChain(calvingReceipt('groan'));
  host._onCeresCausalChain(calvingReceipt('calve'));
  assert.deepEqual(played.map((entry) => entry.recipeId), [
    'sfx_ambient_rock_groan',
    'sfx_ambient_rock_calve',
  ]);
  assert.deepEqual(played[0].opts.position, { x: 200, z: 50 });
  assert.equal(played[1].opts.gain, 1);
});

test('non-calving chain traffic, non-phase receipts, and missing actors stay silent', () => {
  const played = [];
  const host = hostWith({ entityList: CAST.slice() }, played);
  // Other events ride lamp/text channels only.
  host._onCeresCausalChain({ ...calvingReceipt('calve'), eventId: 'ev_rich_seam_strike' });
  host._onCeresCausalChain({ ...calvingReceipt('calve'), kind: 'seed' });
  host._onCeresCausalChain({ ...calvingReceipt('calve'), schema: 'other.v1' });
  host._onCeresCausalChain({ ...calvingReceipt('calve'), phase: 'drift' });
  host._onCeresCausalChain(calvingReceipt('groan', []));
  host._onCeresCausalChain(calvingReceipt('groan', ['ceres_refinery_tender']));
  host._onCeresCausalChain(null);
  assert.equal(played.length, 0, 'nothing outside the calving groan/calve pair may play');
});

test('a dead bound actor is not heard', () => {
  const played = [];
  const host = hostWith({ entityList: [{ ...CAST[0], alive: false }] }, played);
  host._onCeresCausalChain(calvingReceipt('calve'));
  assert.equal(played.length, 0);
});
