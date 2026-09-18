// A detonation must never read as a UI click. Every bomb payload names an audioCue; the cue bus
// resolves it through resolveAudioCueRecipeId, whose unmapped-id fallback is sfx_ui_click — so a
// semantic cue id with no recipe entry silently plays a menu tick at the moment of the blast.
import assert from 'node:assert/strict';
import test from 'node:test';

import { BOMB_DEFS } from '../src/data/bombs.js';
import { resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';

test('every bomb payload detonation cue resolves to a real recipe, never the UI click', () => {
  const entries = Object.entries(BOMB_DEFS);
  assert.ok(entries.length >= 8, 'the payload table is populated');
  for (const [id, bomb] of entries) {
    assert.ok(bomb.audioCue, `${id}: payload must name an audioCue`);
    const recipeId = resolveAudioCueRecipeId(bomb.audioCue);
    assert.notEqual(recipeId, 'sfx_ui_click',
      `${id}: cue ${bomb.audioCue} fell through to the UI click — add a recipe or a mapping`);
  }
});

test('the goo burst and EMP pulse resolve to their authored signatures', () => {
  assert.equal(resolveAudioCueRecipeId('bombs.goo.burst'), 'sfx_explosion_small',
    'the goo charge bursts like a small explosion');
  assert.equal(resolveAudioCueRecipeId('bombs.emp.pulse'), 'sfx_cm_ecm',
    'the EMP pulse rides the ECM discharge signature');
});
