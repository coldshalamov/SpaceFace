import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';

test('INST-09 doctrine setup, telegraph, commit, and aftermath are four cues', () => {
  const ids = [
    'presentation.combat.doctrine_setup',
    'presentation.combat.doctrine_telegraph',
    'presentation.combat.doctrine_commit',
    'presentation.combat.doctrine_aftermath',
  ].map((cue) => resolveAudioCueRecipeId(cue));
  assert.equal(new Set(ids).size, 4);
  for (const id of ids) {
    assert.notEqual(id, 'sfx_encounter_escalation');
    assert.match(id, /^sfx_doctrine_/);
  }
});
