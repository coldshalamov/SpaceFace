import assert from 'node:assert/strict';
import test from 'node:test';

import { SAMPLE_BINDINGS } from '../src/data/audioRecipes.js';
import { resolveSampleBinding } from '../src/audio/sampleLibrary.js';
import { resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';

test('massline.bombDrop resolves to its own recipe on a physical voice, never a UI voice', () => {
  assert.equal(resolveAudioCueRecipeId('massline.bombDrop'), 'sfx_massline_bomb_drop');
  const binding = resolveSampleBinding('sfx_massline_bomb_drop');
  assert.ok(binding, 'bomb drop must be sample-backed');
  assert.ok(!String(binding.sampleId).startsWith('ui_'),
    `ordnance eject must not wear a UI voice, got ${binding.sampleId}`);
});

test('bomb drop {sample,rate} pair is unique across SAMPLE_BINDINGS', () => {
  const mine = resolveSampleBinding('sfx_massline_bomb_drop');
  const key = `${mine.sampleId}@${mine.rate ?? 1}`;
  const collisions = Object.keys(SAMPLE_BINDINGS)
    .filter((id) => id !== 'sfx_massline_bomb_drop')
    .filter((id) => {
      const b = resolveSampleBinding(id);
      return b && `${b.sampleId}@${b.rate ?? 1}` === key;
    });
  assert.deepEqual(collisions, [], `bomb drop voice shared with: ${collisions.join(', ')}`);
});
