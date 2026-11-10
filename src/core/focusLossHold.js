// Window focus is not a sim event. A blur can mute the master bus and hold the
// clock through the time-effects ledger; focus releases only that hold.
// Crucible results stay on their own clock. A save write is synchronous, so the
// hold never starts while state.runtime.saveWriteActive is set.

import { createTimeEffects } from './timeEffects.js';

export const FOCUS_LOSS_TIME_SOURCE = 'window-focus-loss';

// state.runtime is a frozen manifest. The save write flag lives here so a blur
// during serialize cannot pause the clock that the write is reading.
const SAVE_WRITE = new WeakMap();

export function beginFocusLossSaveWrite(state) {
  if (state && typeof state === 'object') SAVE_WRITE.set(state, true);
}

export function endFocusLossSaveWrite(state) {
  if (state && typeof state === 'object') SAVE_WRITE.delete(state);
}

export function readFocusLossPrefs(settings) {
  const audio = settings && settings.audio;
  const gameplay = settings && settings.gameplay;
  return {
    mute: !!(audio && audio.muteOnFocusLoss === true),
    pause: !gameplay || gameplay.pauseOnFocusLoss !== false,
  };
}

export function focusLossPauseBlocked(state) {
  const stack = state && state.ui && state.ui.screenStack;
  if (Array.isArray(stack) && stack.indexOf('crucibleResults') !== -1) return true;
  if (SAVE_WRITE.get(state) === true) return true;
  return false;
}

/**
 * Apply or release the focus hold. Returns what this call actually did.
 * Clearing is idempotent, so a focused window and a turned-off preference
 * both leave the clock and the mix on their other owners.
 */
export function syncFocusLossHold(state, blurred) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { paused: false, muted: false };
  }
  const prefs = readFocusLossPrefs(state.settings);
  if (!state.render || typeof state.render !== 'object' || Array.isArray(state.render)) {
    state.render = {};
  }
  const muted = blurred === true && prefs.mute;
  state.render.focusLossMuted = muted;
  const service = createTimeEffects(state);
  const paused = blurred === true && prefs.pause && !focusLossPauseBlocked(state);
  if (paused) service.set(FOCUS_LOSS_TIME_SOURCE, { scale: 0 });
  else service.clear(FOCUS_LOSS_TIME_SOURCE);
  return { paused, muted };
}
