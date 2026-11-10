// Mining warnings get their own voice: holds-full stops sounding like a menu misclick,
// heat/mass warnings stop borrowing combat/collision samples, and the rig's stall
// refusal is audible in the mine instead of silent.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUDIO_RECIPE_BY_ID,
  MINE_CUES,
  MINE_EVENT_CUE_MAP,
  resolveAudioCueRecipeId,
} from '../src/audio/audioSystem.js';
import { resolveSampleBinding } from '../src/audio/sampleLibrary.js';

test('holds-full resolves to a mining voice, not the UI deny fall', () => {
  assert.equal(resolveAudioCueRecipeId('presentation.mining.cargo_full'), 'sfx_mining_cargo_full');
  const recipe = AUDIO_RECIPE_BY_ID.sfx_mining_cargo_full;
  assert.ok(recipe, 'the recipe exists');
  assert.equal(recipe.category, 'mining', 'it lives on the mining/ambient family, not ui');
});

test('mining warnings bind authored mining samples, not combat or collision voices', () => {
  assert.equal(resolveSampleBinding('sfx_mining_cargo_full').sampleId, 'hopper_thock');
  const heat = resolveSampleBinding('sfx_mining_heat_warning');
  assert.equal(heat.sampleId, 'mine_vent', 'hot pressure hisses like pressure, not a countermeasure');
  assert.notEqual(heat.sampleId, 'cm_ecm');
  const mass = resolveSampleBinding('sfx_mining_mass_required');
  assert.equal(mass.sampleId, 'mine_impact', 'dead weight needs a mining thud, not a kiss');
  assert.notEqual(mass.sampleId, 'impact_kiss');
});

test('the rig stall warns inside the mine and reads its own payload reason', () => {
  assert.equal(MINE_EVENT_CUE_MAP['drill:warn/overheat'], 'rigStall');
  assert.equal(MINE_EVENT_CUE_MAP['drill:warn/capacitor'], 'rigStall');
  assert.equal(MINE_EVENT_CUE_MAP['drill:warn/resume'], 'assayPing');
  assert.ok(MINE_CUES.rigStall, 'the cue voice exists');
  assert.ok(MINE_CUES.rigStall.peak > 0, 'it is audible');
});
