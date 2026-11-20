import { getPromptDevice } from './bindings.js';
import { verbChip } from './controlPrompts.js';

// The aimed release uses its own mouse or touch gesture. The tether key cuts the line.
export function throwActionCue(state) {
  const device = getPromptDevice();
  if (device === 'touch') return 'FLICK · THROW';
  if (device === 'gamepad') return verbChip(state, 'tether', 'RELEASE');
  return 'RMB · THROW';
}

// The same tag can light up when the rope's release window opens on the aimed target.
export function releaseWindowOpen(state, targetId) {
  const throwState = state?.massline2?.throw;
  if (!throwState || (targetId !== undefined && throwState.aimTargetId !== targetId)) return false;
  const sol = throwState.solution;
  // THROW-02: the held window mirror is authoritative while it lasts — masslineThrow keeps it lit
  // for at least RELEASE_WINDOW_MIN_S after the solver's own tick so the cue is readable. Mirrors
  // that predate the hold (no windowOpen field) fall back to the solver's on-solution tick.
  return !!(sol && (sol.windowOpen === true
    || (sol.valid && sol.onSolution && !sol.decisionStale && !sol.degraded)));
}
