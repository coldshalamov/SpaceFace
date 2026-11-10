import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { combatVerbRecipe } from '../src/audio/combatVerbCues.js';
import { resolveAdditionalActionVfxReceipt, ADDITIONAL_ACTION_VFX_RECIPES } from '../src/render/vfx/actionEventRecipes.js';

function ship(id, x, z) {
  return { id, alive: true, pos: { x, z }, type: 'ship' };
}

test('a cloak that fades is a slow shimmer and a falling cue, not the drop snap', () => {
  const faded = ADDITIONAL_ACTION_VFX_RECIPES['cloak:faded'];
  const dropped = ADDITIONAL_ACTION_VFX_RECIPES['cloak:dropped'];
  assert.ok(faded.life > dropped.life, 'the fade lasts longer than the snap');
  const state = { playerId: 1, entities: new Map([[2, ship(2, 12, -4)]]) };
  const record = resolveAdditionalActionVfxReceipt('cloak:faded', { targetId: 2, observerId: 1 }, state);
  assert.equal(record.pos.x, 12);
  assert.equal(record.targetId, 2);
  const fadeCue = combatVerbRecipe('cloak:faded');
  const dropCue = combatVerbRecipe('cloak:dropped');
  assert.equal(fadeCue, 'sfx_cloak_fade');
  assert.equal(dropCue, 'sfx_massline_cloak_off');
  assert.notEqual(fadeCue, dropCue);
  assert.notEqual(fadeCue, 'sfx_massline_deny');
  const fade = RECIPES.find((row) => row.id === fadeCue);
  const snap = RECIPES.find((row) => row.id === dropCue);
  assert.ok(fade.freqSweep[0] > fade.freqSweep[1], 'the fade cue falls');
  assert.ok(fade.gainEnvelope.release > snap.gainEnvelope.release);
});

test('planting and releasing the momentum sink each leave a record at the sink point', () => {
  const hull = ship(4, 30, 8);
  const state = { entities: new Map([[4, hull], [9, ship(9, 1, 1)]]) };
  const planted = resolveAdditionalActionVfxReceipt('weapons:momentumSinkPlanted', {
    ownerId: 9, targetId: 4, weaponId: 'momentum_sink',
  }, state);
  const released = resolveAdditionalActionVfxReceipt('weapons:momentumSinkReleased', {
    ownerId: 4, weaponId: 'momentum_sink', storedReceding: 12,
  }, state);
  assert.equal(planted.pos.x, 30);
  assert.equal(planted.pos.z, 8);
  assert.equal(released.pos.x, 30);
  assert.equal(released.pos.z, 8);
  assert.notEqual(ADDITIONAL_ACTION_VFX_RECIPES['weapons:momentumSinkPlanted'].verb,
    ADDITIONAL_ACTION_VFX_RECIPES['weapons:momentumSinkReleased'].verb);
});

test('a cancelled release ticks softly and is not the deny voice', () => {
  const id = combatVerbRecipe('massline:releaseCancelled');
  assert.equal(id, 'sfx_ui_switch_detent');
  assert.notEqual(id, 'sfx_massline_deny');
  assert.ok(RECIPES.some((row) => row.id === id));
});
