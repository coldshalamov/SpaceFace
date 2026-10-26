// Post-first-picture veil settle.
//
// The loading presenter keeps the flight veil (sim held at spawn) after the first playable paint
// until pendingPipelineAdmissions() reads 0 for a short quiet window, bounded by its own drain cap.
// Once the opening composition stopped idling on a frame wait per GPU unit (gpuQueuePace boot-shell
// duty cycle), that window shrank from ~7 s to ~1 s, and boot leftovers — young-generation garbage
// from the cook, first-flight-frame code paths — landed in the first seconds the player can steer
// (oc1v1: GC lift..+10 s 754 vs 518 ms, extra "(program)" time in the first sim step).
//
// This adds one synthetic pending unit while the veil is held after the first picture, until the
// main thread has been genuinely idle for a few consecutive idle periods (so the browser's
// idle-time GC and deferred tasks run behind the shell) and a short minimum of veiled frames has
// presented. It never skips anything and is bounded: SETTLE_CAP_MS, under the presenter's own
// ADMISSION_DRAIN_CAP_MS, so the lift can never stick. The frame gates that also read
// pendingPipelineAdmissions only do so before the first picture, where this term is always 0.

export const VEIL_SETTLE_MIN_MS = 1200;
export const VEIL_SETTLE_CAP_MS = 2600;
export const VEIL_SETTLE_IDLE_MS = 16;
export const VEIL_SETTLE_IDLE_PERIODS = 3;
// oc1v7: programs created behind the veil but never drawn (a wreck admitted just after the first
// picture) are first-used here, one per frame, so their driver link is paid veiled. Bounded:
// draining stops at VEIL_DRAIN_CAP_MS (4000 ms) after the first picture, or as soon as the veil
// releases (held goes false), whichever is first. This is longer than the presenter's
// ADMISSION_DRAIN_CAP_MS (3000, loadingPresenter.js), so in practice the veil release ends it.
export const VEIL_DRAIN_CAP_MS = 4000;
export const VEIL_DRAIN_GAP_MS = 8;

const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now() : Date.now());

export function createVeilSettle(render, options = {}) {
  const host = options.host || globalThis;
  const minMs = Number.isFinite(options.minMs) ? options.minMs : VEIL_SETTLE_MIN_MS;
  const capMs = Number.isFinite(options.capMs) ? options.capMs : VEIL_SETTLE_CAP_MS;
  const idleMs = Number.isFinite(options.idleMs) ? options.idleMs : VEIL_SETTLE_IDLE_MS;
  const periods = Number.isFinite(options.idlePeriods) ? options.idlePeriods : VEIL_SETTLE_IDLE_PERIODS;
  const clock = typeof options.now === 'function' ? options.now : nowMs;
  const drainCapMs = Number.isFinite(options.drainCapMs) ? options.drainCapMs : VEIL_DRAIN_CAP_MS;
  const unusedPrograms = typeof options.unusedPrograms === 'function' ? options.unusedPrograms : () => null;
  let lastDrain = -Infinity;
  let drained = 0;
  const ric = typeof host.requestIdleCallback === 'function' ? host.requestIdleCallback.bind(host) : null;
  let since = null;
  let streak = 0;
  let settled = false;
  let armed = false;
  const reset = () => { since = null; streak = 0; settled = false; armed = false; lastDrain = -Infinity; drained = 0; };
  // One forced first use per frame-ish gap; returns 1 while unused programs remain (within the cap).
  const drainStep = (t, elapsed) => {
    if (elapsed >= drainCapMs) return 0;
    let pool = null;
    try { pool = unusedPrograms(); } catch (_) { pool = null; }
    if (!pool || typeof pool.drain !== 'function') return 0;
    if (t - lastDrain < VEIL_DRAIN_GAP_MS) return pool.size > 0 ? 1 : 0;
    lastDrain = t;
    if (pool.size === 0) return 0;
    const before = pool.size;
    const left = pool.drain(1);
    drained += Math.max(0, before - left);
    render.veilDrain = { drained, left, ms: Math.round(elapsed) };
    return left > 0 ? 1 : 0;
  };
  const watchIdle = () => {
    if (!ric || settled || since === null) return;
    armed = true;
    ric((deadline) => {
      armed = false;
      if (settled || since === null) return;
      let left = 0;
      try { left = deadline && !deadline.didTimeout ? Number(deadline.timeRemaining()) || 0 : 0; } catch (_) { left = 0; }
      streak = left >= idleMs ? streak + 1 : 0;
      watchIdle();
    }, { timeout: 500 });
  };
  return function veilSettlePending() {
    const held = render && render.flightVeilHoldsSim === true;
    const drawn = held && Number.isFinite(render.firstPlayableFrameAt);
    if (!drawn) { if (since !== null || settled) reset(); return 0; }
    const t = clock();
    if (since === null) { since = t; streak = 0; }
    const draining = drainStep(t, t - since);
    if (settled) return draining;
    if (!armed) watchIdle();
    const elapsed = t - since;
    if (elapsed >= capMs || (elapsed >= minMs && (streak >= periods || !ric))) {
      settled = true;
      render.veilSettle = { ms: Math.round(elapsed), idlePeriods: streak, capped: elapsed >= capMs };
      return draining;
    }
    return 1;
  };
}
