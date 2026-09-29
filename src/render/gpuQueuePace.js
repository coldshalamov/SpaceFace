// Serial-route GPU queue pacing.
//
// WebGL commands do not reach the GPU process until the command buffer flushes, and on a driver
// without KHR_parallel_shader_compile (SwiftShader / software GL — the headless CI route — and
// older ANGLE stacks) the GPU side executes serially and far slower than JS can queue. Nothing
// bounded the queue before this: a whole boot cohort's GL cost piled into the command buffer and
// then drained inside whatever next forced a finish — the compositor's per-frame canvas readback
// or a synchronous query. Measured on headless SwiftShader 2026-09-28 (CI run 36486329212): one
// ~22 s GLES2 drain inside a single BeginMainFrame starved the page's task queue past every
// harness readiness wait (waitForFunction polls via rAF, which needs a produced frame), so six
// browser checks timed out even though boot itself had completed.
//
// The pacer yields one real task-queue slot first — a frame wait via rAF with a setTimeout
// fallback — so the event loop keeps running between units, then calls gl.finish() to force the
// queued work to drain while it is still ~one unit deep. The same drain is inevitable either way;
// splitting it per unit keeps each main-thread block bounded to one unit's GPU cost instead of
// the whole cohort's. (A fence + clientWaitSync poll was tried first: on this route the status
// query itself stalls behind the queued stream — the fence never signaled within 30 s — so
// polling the queue is not a usable drain signal here.)
//
// It is deliberately not installed on the KHR route: there `renderer.compile()` only starts the
// driver link and the value of the readiness batch is that links overlap — pacing each unit would
// serialize the overlap the batch was built to keep.

const DEFAULT_UNSTICK_MS = 48;

/**
 * One real task-queue slot: resume in a macrotask after the next rAF (falling back to a plain
 * task when there is no compositor cadence). Mirrors the shape of yieldToNextPresent in
 * startupGpuResidency.js — reimplemented here to keep this module import-cycle free.
 */
function waitForPresentedFrame(unstickMs = DEFAULT_UNSTICK_MS) {
  return new Promise((resolve) => {
    const requestFrame = typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : null;
    const scheduleTask = (callback) => setTimeout(callback, 0);
    if (!requestFrame) {
      scheduleTask(resolve);
      return;
    }
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      scheduleTask(resolve);
    };
    requestFrame(fire);
    // An occluded or starved compositor may stall rAF; a parked admission must still advance.
    setTimeout(fire, unstickMs);
  });
}

/**
 * Returns an async pacing function for the GL context this renderer owns, or null when the
 * driver reports KHR_parallel_shader_compile — the batched-overlap route where pacing would
 * serialize links the driver would otherwise overlap.
 *
 * Each call yields to the task queue once, then finishes the GL queue while it is still bounded
 * to about one unit. The finish() drain is synchronous — that is the point: it is the same
 * pattern rehearseScenePass already uses to move the driver drain into a held gate, just applied
 * per unit instead of once per cohort.
 */
export function makeGpuQueuePacer(renderer, options = {}) {
  if (!renderer || typeof renderer.getContext !== 'function') return null;
  let parallel = options.parallelCompile;
  if (parallel === undefined) {
    try {
      parallel = renderer.extensions && typeof renderer.extensions.get === 'function'
        ? renderer.extensions.get('KHR_parallel_shader_compile')
        : null;
    } catch (_) {
      parallel = null;
    }
    if (!parallel) {
      try {
        const gl = renderer.getContext();
        parallel = gl && typeof gl.getExtension === 'function'
          ? gl.getExtension('KHR_parallel_shader_compile')
          : null;
      } catch (_) {
        parallel = null;
      }
    }
  }
  if (parallel) return null;
  const unstickMs = Number.isFinite(options.unstickMs) ? options.unstickMs : DEFAULT_UNSTICK_MS;
  return async function paceGpuQueue() {
    await waitForPresentedFrame(unstickMs);
    let gl = null;
    try {
      gl = renderer.getContext();
    } catch (_) {
      return;
    }
    if (!gl) return;
    if (typeof gl.isContextLost === 'function' && gl.isContextLost()) return;
    // Queue was kept shallow by the yield cadence, so this drain costs ~one unit of GPU work.
    // Without it the backlog would drain inside the next forced boundary as one unbounded task.
    try { gl.finish(); } catch (_) { /* best effort — a lost/unsupported context must not wedge */ }
  };
}
