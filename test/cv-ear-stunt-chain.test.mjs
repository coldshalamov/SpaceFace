// CV-EAR — the stunt chain is audible (build_map §23, slice 3).
// Done-when: a player trick plucks `sfx_stunt_link` one pentatonic step up per combo link,
// NPC/amended tricks and bridges stay silent, a bank lands exactly one `sfx_stunt_bank`, and
// both recipes exist in the registry, distinct from the scoop ladder and the UI voices.
// Drives the real audio owner: init() against a bare state + real bus, play() stubbed —
// no AudioContext is created (the jettison test's pattern).
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { createBus } from '../src/core/eventBus.js';
import { audio, getBusForRecipe } from '../src/audio/audioSystem.js';

const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

function hostWith(state, played = []) {
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  const bus = createBus();
  host.init({ state, bus, helpers: {} });
  return { host, bus };
}

function bareState() {
  return {
    mode: 'flight',
    playerId: 7,
    entities: new Map(),
    entityList: [],
    input: { actions: {} },
    stunts: { combo: { acts: [] } },
  };
}

const trick = (over = {}) => ({ trickId: 'barrel_roll', name: 'Barrel Roll', actorId: 7, ...over });

test('three consecutive player tricks pluck strictly rising steps on the combo ladder', () => {
  const state = bareState();
  const played = [];
  const { bus } = hostWith(state, played);
  for (let i = 0; i < 3; i++) {
    state.stunts.combo.acts.push({ episodeId: `ep${i}` }); // recordTrick commits before the emit
    bus.emit('stunt:trickDetected', trick({ episodeId: `ep${i}` }));
  }
  const links = played.filter((p) => p.recipeId === 'sfx_stunt_link');
  assert.equal(links.length, 3);
  const rates = links.map((p) => p.opts.rate);
  assert.ok(rates[0] < rates[1] && rates[1] < rates[2],
    `the chain must climb — got rates ${rates.join(', ')}`);
  assert.equal(rates[0], 1, 'the first link plucks at base rate');
});

test('the ladder reads the combo link count: reset drops the pitch back to base, cap holds at the top', () => {
  const state = bareState();
  const played = [];
  const { bus } = hostWith(state, played);
  // A deep chain saturates at the top step.
  for (let i = 0; i < 9; i++) state.stunts.combo.acts.push({});
  bus.emit('stunt:trickDetected', trick());
  const top = played[0].opts.rate;
  state.stunts.combo.acts.push({});
  bus.emit('stunt:trickDetected', trick());
  assert.equal(played[1].opts.rate, top, 'beyond the ladder the step stays capped');
  // Combo reset (acts emptied by a bank/decay) drops the next link back to the base note.
  state.stunts.combo.acts = [{}];
  bus.emit('stunt:trickDetected', trick());
  assert.equal(played[2].opts.rate, 1, 'a reset combo plucks at base rate again');
});

test('only the player\'s links speak: NPC tricks, amendments, and bridges stay silent', () => {
  const state = bareState();
  const played = [];
  const { bus } = hostWith(state, played);
  state.stunts.combo.acts.push({});
  bus.emit('stunt:trickDetected', trick({ actorId: 99 }));           // foreign actor
  bus.emit('stunt:trickAmended', trick({ amendment: true }));        // same link upgraded
  bus.emit('stunt:bridge', { trickId: 'near_miss', actorId: 7 });    // Close Shave — bark speaks
  assert.deepEqual(played.map((p) => p.recipeId), [], `silence expected, got ${JSON.stringify(played)}`);
  // Sanity: the same lane DOES speak for a player trick.
  bus.emit('stunt:trickDetected', trick());
  assert.equal(played.length, 1);
});

test('a bank cashes out with exactly one sfx_stunt_bank', () => {
  const state = bareState();
  const played = [];
  const { bus } = hostWith(state, played);
  bus.emit('stunt:styleBanked', { bankId: 3, points: 420 });
  bus.emit('stunt:styleBanked', { bankId: 4, points: 300 });
  assert.deepEqual(played.map((p) => p.recipeId), ['sfx_stunt_bank', 'sfx_stunt_bank']);
  bus.emit('stunt:styleBanked', null);
  assert.equal(played.length, 2, 'a malformed bank payload stays silent');
});

test('both stunt recipes exist on the SFX bus, distinct from the scoop ladder and UI voices', () => {
  for (const id of ['sfx_stunt_link', 'sfx_stunt_bank']) {
    const recipe = recipeById.get(id);
    assert.ok(recipe, `${id} must be registered`);
    assert.equal(getBusForRecipe(recipe, id), 'combat', `${id} must ride the SFX/combat bus`);
    assert.notEqual(recipe.category, 'ui');
    assert.notEqual(recipe.category, 'mining');
  }
  assert.notEqual('sfx_stunt_link', 'sfx_pickup_chime');
  const link = recipeById.get('sfx_stunt_link'), bank = recipeById.get('sfx_stunt_bank'), chime = recipeById.get('sfx_pickup_chime');
  assert.notDeepEqual(link, chime, 'the link pluck is not a renamed scoop chime');
  assert.notDeepEqual(link, bank);
});
