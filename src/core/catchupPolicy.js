// Catch-up spiral policy. Presentation, HUD, and voice run once per display
// frame. Extra fixed steps keep exact gameplay/physics and skip those lanes.

import { getSystemCapability } from '../runtime/authoritativeSystemManifest.js';

export const CATCHUP_SKIP_CAPABILITIES = Object.freeze(['hud', 'voice']);

export function isCatchupPresentationSkip(state) {
  return !!(state && (state.simCatchupIndex | 0) > 0);
}

export function shouldSkipSystemOnCatchup(systemName, state) {
  if (!isCatchupPresentationSkip(state)) return false;
  const cap = getSystemCapability(systemName);
  const kind = cap && cap.capability;
  return kind === 'hud' || kind === 'voice';
}
