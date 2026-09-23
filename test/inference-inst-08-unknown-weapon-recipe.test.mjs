// INFERENCE INST-08 — "An unknown gun does not sound like the starter pulse".
//
// The catalog line's done check: a weapon id with no family resolves to a named generic combat
// recipe (or fails closed), and never the starter pulse `sfx_wpn_pulse_laser`. Proof is the live
// owner `resolveWeaponAudioSignature` plus the authored recipe table.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIO_RECIPE_BY_ID,
  resolveWeaponAudioSignature,
} from '../src/audio/audioSystem.js';

const EMPTY_STATE = { entities: new Map() };
const recipeFor = (weaponId) => resolveWeaponAudioSignature({ weaponId }, EMPTY_STATE).recipeId;

test('a weapon id with no family never resolves to the starter pulse', () => {
  const unknowns = [
    'wpn_experimental_foo', 'wpn_unknown', 'wpn_', 'mystery_mount', '',
    undefined, null,
  ];
  for (const id of unknowns) {
    const recipeId = recipeFor(id);
    assert.notEqual(recipeId, 'sfx_wpn_pulse_laser',
      `${String(id)} must not impersonate the starter pulse`);
    assert.equal(recipeId, 'sfx_wpn_unclassified',
      `${String(id)} must resolve to the named generic combat recipe`);
  }
});

test('the generic combat recipe is authored, routes to combat, and is distinct from the pulse', () => {
  const recipe = AUDIO_RECIPE_BY_ID.sfx_wpn_unclassified;
  assert.ok(recipe, 'sfx_wpn_unclassified must be authored in audioRecipes.js');
  assert.equal(recipe.category, 'weapon', 'the generic discharge must ride the combat bus');
  const pulse = AUDIO_RECIPE_BY_ID.sfx_wpn_pulse_laser;
  assert.notEqual(recipe.type, pulse.type, 'the generic voice must not reuse the pulse synth type');
  assert.ok(!recipe.layers || !recipe.layers.includes(pulse.id),
    'the generic voice must not layer the starter pulse');
  assert.notDeepEqual(recipe.gainEnvelope, pulse.gainEnvelope,
    'the generic voice must have its own envelope');
});

test('recognized families still resolve to their authored voices', () => {
  assert.equal(recipeFor('wpn_pulse_laser_s'), 'sfx_wpn_pulse_laser');
  assert.equal(recipeFor('wpn_pulse_s'), 'sfx_wpn_pulse_laser');
  assert.equal(recipeFor('wpn_blaster_s'), 'sfx_wpn_pulse_laser');
  assert.equal(recipeFor('wpn_beam_laser_m'), 'sfx_wpn_beam_laser');
  assert.equal(recipeFor('wpn_railgun_m'), 'sfx_wpn_railgun');
  assert.equal(recipeFor('wpn_missile_rack_m'), 'sfx_wpn_missile');
  assert.equal(recipeFor('wpn_torpedo_l'), 'sfx_wpn_missile');
  assert.equal(recipeFor('wpn_autocannon_m'), 'sfx_wpn_autocannon');
  assert.equal(recipeFor('wpn_flak_turret_s'), 'sfx_wpn_autocannon');
  // Named families that used to fall through to the starter pulse now classify honestly.
  assert.equal(recipeFor('wpn_bank_stream_m'), 'sfx_wpn_autocannon');
  assert.equal(recipeFor('wpn_siege_lance_l'), 'sfx_wpn_railgun');
  assert.equal(recipeFor('wpn_vector_mine_m'), 'sfx_wpn_missile');
});
