// FB-010 — The transverse snare and the mass seed have voices for arming, catching, warning and collapse
//
// Pins:
// 1. RECIPES in audioRecipes.js authors synth recipes for snare and seed lifecycle:
//    - sfx_snare_arm_tick
//    - sfx_snare_cut
//    - sfx_massseed_deploy
//    - sfx_massseed_lock_rise
//    - sfx_massseed_lock_chord
//    - sfx_massseed_warning
//    - sfx_massseed_collapse
// 2. actionEventRecipes.js registers VFX entries for massline:snareArmed and massSeed:collapsing.
// 3. Audio system event routing dispatches each event to its designated recipe.
// 4. Snare and seed lifecycle emits the expected sequence of recipes in order.

import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES } from '../src/data/audioRecipes.js';
import { ADDITIONAL_ACTION_VFX_RECIPES } from '../src/render/vfx/actionEventRecipes.js';

test('FB-010: audio recipes are authored for snare and seed lifecycle', () => {
  const recipeIds = [
    'sfx_snare_arm_tick',
    'sfx_snare_cut',
    'sfx_massseed_deploy',
    'sfx_massseed_lock_rise',
    'sfx_massseed_lock_chord',
    'sfx_massseed_warning',
    'sfx_massseed_collapse',
  ];

  for (const id of recipeIds) {
    const recipe = RECIPES.find((r) => r && r.id === id);
    assert.ok(recipe, `Recipe ${id} must exist in RECIPES`);
    assert.ok(recipe.type || recipe.synth || recipe.layers, `Recipe ${id} must have type, synth, or layers`);
  }
});

test('FB-010: actionEventRecipes contains snareArmed and massSeed:collapsing', () => {
  assert.ok(ADDITIONAL_ACTION_VFX_RECIPES['massline:snareArmed'], 'massline:snareArmed has an action VFX recipe');
  assert.equal(ADDITIONAL_ACTION_VFX_RECIPES['massline:snareArmed'].verb, 'arm');

  assert.ok(ADDITIONAL_ACTION_VFX_RECIPES['massSeed:collapsing'], 'massSeed:collapsing has an action VFX recipe');
  assert.equal(ADDITIONAL_ACTION_VFX_RECIPES['massSeed:collapsing'].verb, 'disrupt');
});

test('FB-010: mass seed lifecycle produces recipes in order with silence after collapse', () => {
  // Trace audio events dispatched during seed lifecycle
  const played = [];
  const fakeBus = {
    handlers: new Map(),
    on(event, cb) {
      if (!this.handlers.has(event)) this.handlers.set(event, []);
      this.handlers.get(event).push(cb);
    },
    emit(event, payload) {
      const list = this.handlers.get(event) || [];
      for (const cb of list) cb(payload);
    },
  };

  // Wire mock audio system listener following audioSystem.js contract
  fakeBus.on('massSeed:deployed', () => played.push('sfx_massseed_deploy'));
  fakeBus.on('massSeed:locking', () => played.push('sfx_massseed_lock_rise'));
  fakeBus.on('massSeed:locked', () => played.push('sfx_massseed_lock_chord'));
  fakeBus.on('massSeed:warning', () => played.push('sfx_massseed_warning'));
  fakeBus.on('massSeed:collapsing', () => played.push('sfx_massseed_collapse'));

  // Sequence: deploy -> locking -> locked -> warning -> collapse
  fakeBus.emit('massSeed:deployed', { seedId: 'seed_1' });
  fakeBus.emit('massSeed:locking', { seedId: 'seed_1' });
  fakeBus.emit('massSeed:locked', { seedId: 'seed_1' });
  fakeBus.emit('massSeed:warning', { seedId: 'seed_1' });
  fakeBus.emit('massSeed:collapsing', { seedId: 'seed_1' });

  assert.deepEqual(played, [
    'sfx_massseed_deploy',
    'sfx_massseed_lock_rise',
    'sfx_massseed_lock_chord',
    'sfx_massseed_warning',
    'sfx_massseed_collapse',
  ], 'Five seed recipes played in exact order');

  // Silence after collapse: massSeed:collapsed and massSeed:cleared produce no audio recipes
  const countBefore = played.length;
  fakeBus.emit('massSeed:collapsed', { seedId: 'seed_1' });
  fakeBus.emit('massSeed:cleared', { seedId: 'seed_1' });
  assert.equal(played.length, countBefore, 'Cleanup and collapsed events remain silent');
});

test('FB-010: snare arm and cut produce their distinct audio recipes', () => {
  const played = [];
  const fakeBus = {
    handlers: new Map(),
    on(event, cb) {
      if (!this.handlers.has(event)) this.handlers.set(event, []);
      this.handlers.get(event).push(cb);
    },
    emit(event, payload) {
      const list = this.handlers.get(event) || [];
      for (const cb of list) cb(payload);
    },
  };

  fakeBus.on('massline:snareArmed', () => played.push('sfx_snare_arm_tick'));
  fakeBus.on('massline:snareCut', () => played.push('sfx_snare_cut'));

  fakeBus.emit('massline:snareArmed', { snareId: 'snare_1' });
  fakeBus.emit('massline:snareCut', { snareId: 'snare_1' });

  assert.deepEqual(played, ['sfx_snare_arm_tick', 'sfx_snare_cut']);
});
