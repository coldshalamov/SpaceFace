// One clock for decor (EC-G11 step 1). Everything the player sees moving should advance with the
// drawn world, not the wall clock: when the simulation falls behind and the snapshot fence slows or
// holds the presented pose, a gauge ring or an idle spin that keeps turning on wall time is what
// makes a stall read as "frozen world, live decor", then a jump. This module turns the fence's
// presented sim clock into one smoothed ratio — drawn-world seconds per wall second, 0..1.5 — that
// any wall-clock animation multiplies its rate by. Without a fence (no presented clock yet), the
// world is assumed to advance with the wall (ratio 1). Render/UI only: never read by the sim.

import { getLatestSnapshotFence } from './snapshotFence.js';

const SMOOTH_S = 0.12;      // ~7 frames: a single late frame does not flicker a ring
const RATIO_MAX = 1.5;      // the fence's own presentation-rate ceiling
const SAME_FRAME_MS = 2;    // several callers in one frame share one sample

let lastWallMs = NaN;
let lastPresentedS = NaN;
let ratio = 1;

/** Pure step, exported for tests: advance the smoothed ratio by one wall/presented sample. */
export function stepPresentedRatio(prevRatio, wallDtS, presentedDtS) {
  if (!(wallDtS > 0)) return prevRatio;
  const inst = Math.min(RATIO_MAX, Math.max(0, presentedDtS) / wallDtS);
  const k = Math.min(1, wallDtS / SMOOTH_S);
  return prevRatio + (inst - prevRatio) * k;
}

/**
 * Drawn-world seconds per wall second, smoothed. Call with the frame's wall time in ms
 * (performance.now()). Returns 1 when no presented clock exists.
 */
export function presentedAdvanceRatio(nowWallMs, fence = getLatestSnapshotFence()) {
  const presented = fence ? fence.presentedTimeS : NaN;
  if (!Number.isFinite(presented) || !Number.isFinite(nowWallMs)) {
    lastWallMs = NaN; lastPresentedS = NaN; ratio = 1;
    return 1;
  }
  if (Number.isFinite(lastWallMs) && Math.abs(nowWallMs - lastWallMs) < SAME_FRAME_MS) return ratio;
  if (Number.isFinite(lastWallMs) && nowWallMs > lastWallMs && Number.isFinite(lastPresentedS)) {
    // A presented clock that steps backwards (gap reset, load) restarts the sample, not the ratio.
    const dp = presented >= lastPresentedS ? presented - lastPresentedS : 0;
    ratio = stepPresentedRatio(ratio, (nowWallMs - lastWallMs) / 1000, dp);
  }
  lastWallMs = nowWallMs;
  lastPresentedS = presented;
  return ratio;
}

/** Test hook: forget the running sample. */
export function resetPresentedClock() {
  lastWallMs = NaN; lastPresentedS = NaN; ratio = 1;
}
