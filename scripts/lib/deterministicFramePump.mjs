// Deterministic frame pump for the §5 perf scenario harness (Tier 1).
//
// WHY THIS EXISTS
// ---------------
// A perf counter is only comparable against a fixed, reproducible scenario, and a scenario is only
// reproducible when the number of presentation frames and the wall of sim time each frame advances
// are EXACT. Wall-clock rAF gives neither: on a contended host the same 600-frame window covers
// anywhere from 600 to 2400 sim ticks, and culling-dependent counters (draw calls, program
// switches, texture binds) move with it. That is why those fields are excluded from
// DETERMINISTIC_FIELDS today.
//
// This pump replaces wall-clock rAF with a synthetic monotonic clock: every pumped frame advances
// exactly 1000/60 ms, so every frame runs exactly one fixed sim step and the same scenario covers
// the same sim time on any host. It is installed ONLY by the harness (page.addInitScript before
// navigation). No production file references it; when the harness is not driving, the pump does
// not exist and production boot is byte-identical to today.
//
// THE INJECTION SEAM IS THE DOCUMENTED ONE.
// src/core/presentationRunner.js resolves its scheduler as
//     deps.requestFrame || globalThis.requestAnimationFrame?.bind(globalThis)
//     deps.nowMs       || (() => performance.now())
// at runner construction, which happens AFTER addInitScript ran. Overriding the globals here
// therefore supplies requestFrame/nowMs through the runner's own fallback path — the seam the
// handoff (§5) names — without touching src/main.js, src/core/loop.js, or
// src/core/presentationRunner.js.
//
// PAGE-CONTEXT FUNCTION. `installDeterministicFramePump` is serialized with Function#toString by
// Playwright and evaluated in the page before any page script. It must stay fully self-contained:
// no imports, no closures over Node state, no modern syntax the page's classic-script parser would
// reject. The Node-side export exists only so the runner can pass the function to addInitScript.

/**
 * Install the deterministic pump in page context. Idempotent.
 * `clockMode: "native-timing"` keeps performance.now native for a separate Tier-2 timing run
 * while rAF callback timestamps remain synthetic. The default synthetic mode is the Tier-1 gate.
 * Exposes window.__SF_DETERMINISTIC_PUMP__ = {
 *   frame, pending, now, timingNow, clockMode, alignFrame, step, errors, FRAME_MS
 * }.
 */
export function installDeterministicFramePump(options) {
  if (typeof window === 'undefined' || window.__SF_DETERMINISTIC_PUMP__) return;

  // A tiny upward decimal rounding (0.000000333 ms) prevents IEEE-754 cancellation when the
  // presentation runner subtracts large synthetic timestamps after a long boot. `1000 / 60`
  // produces periodic deltas just below 1/60 s at high frame indices, yielding a false 0/2-step
  // cadence. This representable interval stays within 0.02 ppm of 60 Hz while producing exactly
  // one fixed 1/60 step per pumped frame for every bounded harness window.
  var FRAME_MS = 16.666667;
  var clockMode = options && options.clockMode === 'native-timing'
    ? 'native-timing'
    : 'synthetic';
  var frame = 0;
  var nextHandle = 1;
  var queue = new Map();       // handle -> callback, mirrors rAF registration order
  var errors = [];
  var nativeNow = window.performance.now.bind(window.performance);

  // Synthetic monotonic clock. Computed from the frame index (never accumulated) so the float
  // pattern — and therefore the fixed-step accumulator pattern — is identical on every run.
  var now = function () { return frame * FRAME_MS; };
  var timingNow = clockMode === 'native-timing' ? nativeNow : now;

  window.requestAnimationFrame = function requestAnimationFrame(callback) {
    var handle = nextHandle++;
    queue.set(handle, callback);
    return handle;
  };
  window.cancelAnimationFrame = function cancelAnimationFrame(handle) {
    queue.delete(handle);
  };
  // performance.now drives presentationRunner's frameDt (deps.nowMs fallback) and THREE's clocks.
  // Own-property shadow of the prototype method; WebIDL operations are writable/configurable.
  try {
    if (clockMode === 'synthetic') window.performance.now = now;
  } catch (_) {
    try {
      if (clockMode === 'synthetic') {
        Object.defineProperty(window.performance, 'now', { value: now, configurable: true, writable: true });
      }
    } catch (__) { /* an un-overridable clock fails loudly at the first step() assert */ }
  }

  window.__SF_DETERMINISTIC_PUMP__ = {
    FRAME_MS: FRAME_MS,
    clockMode: clockMode,
    get frame() { return frame; },
    get pending() { return queue.size; },
    errors: errors,
    now: now,
    timingNow: timingNow,
    /**
     * Move the synthetic presentation clock forward without invoking callbacks. The harness calls
     * this only while the simulation is publicly paused, then presents one alignment frame before
     * opening a measured window. That gives every isolated run the same timestamp phase even when
     * asynchronous boot work required a different number of presentation frames.
     */
    alignFrame: function alignFrame(targetFrame) {
      var target = Number(targetFrame);
      if (!Number.isSafeInteger(target) || target < frame) {
        throw new RangeError('deterministic pump alignment must be a safe frame at or after ' + frame);
      }
      frame = target;
      return frame;
    },
    /**
     * Run n presentation frames synchronously (async only to drain microtasks between frames).
     *
     * Callbacks registered DURING frame f run at frame f+1 (snapshot-then-clear), matching real
     * rAF semantics. `await null` after each frame unwinds the stack so promise continuations
     * (renderer.compileAsync, asset decode .then chains) drain BETWEEN frames instead of after
     * the whole batch — the same interleaving a browser produces. Macrotasks (timers, network
     * IO) do NOT run inside step(); they run in the gaps the harness leaves between step() calls,
     * which is why the harness's chunk schedule is fixed and identical across runs.
     *
     * A throwing callback is captured like a browser captures it (the remaining callbacks of the
     * frame still run) and recorded on `errors`; the harness asserts that list is empty rather
     * than letting one bad frame silently shorten the scenario.
     */
    step: async function step(n) {
      var count = Math.max(0, Math.min(100000, Number(n) | 0));
      for (var i = 0; i < count; i++) {
        frame += 1;
        var ts = now();
        var batch = Array.from(queue.values());
        queue.clear();
        for (var k = 0; k < batch.length; k++) {
          try {
            batch[k](ts);
          } catch (err) {
            if (errors.length < 64) {
              errors.push({ frame: frame, message: String((err && err.message) || err) });
            }
            if (typeof console !== 'undefined' && console.error) {
              console.error('[deterministic-pump] frame callback threw at frame ' + frame, err);
            }
          }
        }
        // Drain the microtask queue between frames (see the header note). Chained continuations
        // drain one hop per frame boundary — steady interleaving, never a batch at the end.
        // `await null` never admits macrotasks (timers, IO); those stay in the harness's gaps.
        await null;
      }
      return frame;
    },
  };
}

/** Page-context predicate used by the runner: is the pump installed and how many frames ran? */
export const PUMP_GLOBAL = '__SF_DETERMINISTIC_PUMP__';
