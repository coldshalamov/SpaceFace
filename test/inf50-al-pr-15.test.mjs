// AL-PR-15 — a cue's caption uses the position that pans it. Seed 4242.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { audioCueCaption, captionForGameplayRecipe, clockFromPanPosition } from '../src/ui/captions.js';

const SEED = 4242;

// rot 0 faces +X. 8 o'clock is 240° clockwise from the nose: forward -0.5, right -√3/2.
function eightOClock(len = 100) {
  return { x: -0.5 * len, z: (-Math.sqrt(3) / 2) * len };
}

test(`seed ${SEED}: a telegraph from 8 o'clock captions as 8 o'clock`, () => {
  const listener = { x: 0, z: 0, rot: 0 };
  const position = eightOClock();
  assert.equal(clockFromPanPosition(position, listener), 8);
  const place = { position, listener };
  const cue = audioCueCaption('telegraph', true, place);
  assert.equal(cue.text, 'Incoming telegraph, 8 o\'clock.');
  assert.equal(cue.clock, 8);
  const recipe = captionForGameplayRecipe('sfx_encounter_escalation', null, place);
  assert.equal(recipe.text, 'Incoming telegraph, 8 o\'clock.');
  assert.equal(audioCueCaption('telegraph', true).text, 'Incoming telegraph');
  assert.equal(clockFromPanPosition(listener, listener), null);
});
