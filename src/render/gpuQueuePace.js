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
// queued work to drain. Pacing alone does not bound independent producers: they can submit
// together during that yield. The submit reservation below bounds only enrolled producers to
// one active unit; direct opening/boot/cohort and presented-frame work can still overlap. (A fence + clientWaitSync poll was tried first: on this route the status
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
function waitForPresentedFrame(unstickMs = DEFAULT_UNSTICK_MS, scheduleTask = null) {
  return new Promise((resolve) => {
    const requestFrame = typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : null;
    // A rAF/timer arm resolving inline would land the gl.finish() continuation
    // inside the presented frame's beat — callers pass the bounded background
    // post (compilePresentSlice) so the resume waits out the present like
    // composeYield's fire(); setTimeout(0) stays the no-scheduler fallback.
    const schedule = typeof scheduleTask === 'function'
      ? scheduleTask
      : (callback) => setTimeout(callback, 0);
    if (!requestFrame) {
      schedule(resolve);
      return;
    }
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      schedule(resolve);
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
 * Each call yields once, then synchronously finishes queued GL work. Calling it after direct
 * submission does not exclude other producers. Use .submit(work) to reserve an enrolled unit
 * through its drain; even that is not a global GL queue or hardware-duration bound.
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
  const paceQueue = async function paceGpuQueue() {
    await waitForPresentedFrame(unstickMs, options.scheduleTask);
    let gl = null;
    try {
      gl = renderer.getContext();
    } catch (_) {
      return;
    }
    if (!gl) return;
    if (typeof gl.isContextLost === 'function' && gl.isContextLost()) return;
    // Drain whatever reached GL, including any unenrolled producer's overlapping work.
    // Only callers using the shared submit reservation exclude other enrolled units.
    try { gl.finish(); } catch (_) { /* best effort — a lost/unsupported context must not wedge */ }
  };
  paceQueue.submit = createSerialSubmission(renderer, paceQueue);
  return paceQueue;
}

// Queue ownership must begin BEFORE submission. Independent upload/compile producers can
// otherwise all submit during the pacer's yield and leave one finish to drain their sum.
const serialSubmissionQueues = new WeakMap();

export function makeGpuQueueSubmitter(renderer, options = {}) {
  const serialPacer = makeGpuQueuePacer(renderer, options);
  if (!serialPacer) return null; // KHR programs deliberately overlap.
  const paceQueue = typeof options.paceQueue === 'function' ? options.paceQueue : serialPacer;
  return createSerialSubmission(renderer, paceQueue);
}

// Work must not await a nested reservation on this renderer. Current upload callbacks are
// synchronous; the compile callback awaits environment stamping then the no-KHR submission
// result. Do not release on an observer timeout: a late callback could still issue GL work.
function createSerialSubmission(renderer, paceQueue) {
  let queue = serialSubmissionQueues.get(renderer);
  if (!queue) {
    queue = { active: false, urgent: [], ordinary: [] };
    serialSubmissionQueues.set(renderer, queue);
  }
  const pump = () => {
    if (queue.active) return;
    const entry = queue.urgent.shift() || queue.ordinary.shift();
    if (!entry) return;
    queue.active = true;
    Promise.resolve().then(entry.work).then(entry.resolve, entry.reject).finally(() => {
      queue.active = false;
      pump();
    });
  };
  return (submit, admission = {}) => {
    if (typeof submit !== 'function') return Promise.reject(new TypeError('GPU submission requires work'));
    const work = async () => {
      if (typeof admission.isActive === 'function' && admission.isActive() !== true) {
        return { skipped: true, reason: 'owner-inactive' };
      }
      const gl = renderer.getContext();
      if (!gl || (typeof gl.isContextLost === 'function' && gl.isContextLost())) {
        return { skipped: true, contextLost: true, reason: 'WebGL context lost before submission' };
      }
      let result, failure, failed = false;
      try { result = await submit(); }
      catch (error) { failed = true; failure = error; }
      // A throwing producer may already have submitted a prefix. Drain that prefix before
      // the next owner enters, but never replace its original error with a drain error.
      try { await paceQueue(); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
      if (failed) throw failure;
      return result;
    };
    const promise = new Promise((resolve, reject) => {
      (admission.urgent === true ? queue.urgent : queue.ordinary).push({ work, resolve, reject });
      pump();
    });
    // Observation does not consume the error for the returned, awaited owner.
    promise.catch(() => {});
    return promise;
  };
}

// Serial-route cook pacing debt (live cook cohort compile + touch). Same bound as the opening
// admission's issue loop (openingGpuAdmission PACE_BUDGET_MS / PACE_MAX_UNITS): drain once a few
// units or a frame's worth of main-thread issue time has queued, so the GL backlog stays a handful
// of units deep without a presented-frame wait per unit.
export const COOK_PACE_BUDGET_MS = 24;
export const COOK_PACE_MAX_UNITS = 8;
export function createCookQueuePaceDebt() {
  let units = 0;
  let ms = 0;
  return {
    note(spentMs) {
      units += 1;
      if (Number.isFinite(spentMs) && spentMs > 0) ms += spentMs;
    },
    due() {
      return units >= COOK_PACE_MAX_UNITS || ms >= COOK_PACE_BUDGET_MS;
    },
    clear() {
      units = 0;
      ms = 0;
    },
  };
}
