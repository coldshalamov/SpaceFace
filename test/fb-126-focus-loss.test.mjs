import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import {
  beginFocusLossSaveWrite,
  endFocusLossSaveWrite,
  syncFocusLossHold,
} from '../src/core/focusLossHold.js';

function flightState() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.ui = { screenStack: [] };
  return state;
}

test('losing focus pauses by default and restores the same clock', () => {
  const state = flightState();
  const before = createTimeEffects(state).getEffectiveScale();
  const held = syncFocusLossHold(state, true);
  assert.equal(held.paused, true);
  assert.equal(held.muted, false);
  assert.equal(createTimeEffects(state).getEffectiveScale(), 0);
  syncFocusLossHold(state, false);
  assert.equal(createTimeEffects(state).getEffectiveScale(), before);
  assert.equal(state.render.focusLossMuted, false);
});

test('mute on focus loss flags the mix without stopping the pause preference', () => {
  const state = flightState();
  state.settings.audio.muteOnFocusLoss = true;
  state.settings.gameplay.pauseOnFocusLoss = false;
  const held = syncFocusLossHold(state, true);
  assert.equal(held.muted, true);
  assert.equal(held.paused, false);
  assert.equal(state.render.focusLossMuted, true);
  assert.equal(createTimeEffects(state).getEffectiveScale(), 1);
  syncFocusLossHold(state, false);
  assert.equal(state.render.focusLossMuted, false);
});

test('Crucible results and a save write do not take the focus pause', () => {
  const state = flightState();
  state.ui.screenStack = ['crucibleResults'];
  assert.equal(syncFocusLossHold(state, true).paused, false);
  assert.equal(createTimeEffects(state).getEffectiveScale(), 1);

  state.ui.screenStack = [];
  beginFocusLossSaveWrite(state);
  assert.equal(syncFocusLossHold(state, true).paused, false);
  endFocusLossSaveWrite(state);
  assert.equal(syncFocusLossHold(state, true).paused, true);
  syncFocusLossHold(state, false);
});
