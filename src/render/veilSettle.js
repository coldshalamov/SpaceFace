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

const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now() : Date.now());

export function createVeilSettle(render, options = {}) {
  const host = options.host || globalThis;
  const minMs = Number.isFinite(options.minMs) ? options.minMs : VEIL_SETTLE_MIN_MS;
  const capMs = Number.isFinite(options.capMs) ? options.capMs : VEIL_SETTLE_CAP_MS;
  const idleMs = Number.isFinite(options.idleMs) ? options.idleMs : VEIL_SETTLE_IDLE_MS;
  const periods = Number.isFinite(options.idlePeriods) ? options.idlePeriods : VEIL_SETTLE_IDLE_PERIODS;
  const clock = typeof options.now === 'function' ? options.now : nowMs;
  const ric = typeof host.requestIdleCallback === 'function' ? host.requestIdleCallback.bind(host) : null;
  let since = null;
  let streak = 0;
  let settled = false;
  let armed = false;
  const reset = () => { since = null; streak = 0; settled = false; armed = false; };
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
    if (settled) return 0;
    const t = clock();
    if (since === null) { since = t; streak = 0; }
    if (!armed) watchIdle();
    const elapsed = t - since;
    if (elapsed >= capMs || (elapsed >= minMs && (streak >= periods || !ric))) {
      settled = true;
      render.veilSettle = { ms: Math.round(elapsed), idlePeriods: streak, capped: elapsed >= capMs };
      return 0;
    }
    return 1;
  };
}
