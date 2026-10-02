import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { screenShakeScale } from '../src/render/feel.js';

test('screen shake scales trauma from the slider and treats a missing key as full', () => {
  assert.equal(screenShakeScale(null), 1);
  assert.equal(screenShakeScale({ video: {} }), 1);
  assert.equal(screenShakeScale({ video: { screenShake: 100 } }), 1);
  assert.equal(screenShakeScale({ video: { screenShake: 0 } }), 0);
  assert.equal(screenShakeScale({ video: { screenShake: 40 } }), 0.4);
  assert.equal(screenShakeScale({ video: { screenShake: 400 } }), 1);
});

test('a new game stores a live screen-shake default and no dead keybinds bag', () => {
  const state = createGameState(4242);
  assert.equal(state.settings.video.screenShake, 100);
  assert.equal(Object.prototype.hasOwnProperty.call(state.settings, 'keybinds'), false);
  assert.equal(state.settings.gameplay.pauseOnFocusLoss, true);
  assert.equal(state.settings.audio.muteOnFocusLoss, false);
});
