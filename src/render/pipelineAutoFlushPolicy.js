// When leftover FX compiles share the present beat, Intel TDR's. Opening still
// drains through waitForCaptured / flushQueuedThrough, which ignore this flag.
// Auto-flush on rAF must stay deferred until the first playable stamp exists.

export const FIRST_FLIGHT_PIPELINE_HOLD_S = 20;

export function shouldDeferPipelineAutoFlush({
  postOpeningReleased = false,
  firstPlayableFrameAt = null,
  mode = null,
  simTime = 0,
  holdSeconds = FIRST_FLIGHT_PIPELINE_HOLD_S,
} = {}) {
  // Live formula as of the pre-campaign dirty tree: once post-opening
  // admission is released, auto-flush is allowed. Unreleased opening still
  // defers while loading, until first playable, or through the first-flight hold.
  if (postOpeningReleased === true) return false;
  return mode === 'loading'
    || !Number.isFinite(firstPlayableFrameAt)
    || (Number(simTime) || 0) < holdSeconds;
}
