// Retiring a preview WebGL context without stalling on its own shader links.
//
// Destroying a context while programs it issued are still linking does not cancel those links: the
// teardown waits for every outstanding link first, on the main thread. The New Game stage hull is
// released once the loading shell covers it, and on a fresh install its hull programs were often still
// linking, so forceContextLoss() froze the loading screen for 1.9 s. After a 15 s stay on New Game, the
// same release took 24 ms (launch profiles, 2026-09-13). A retiring preview therefore stops drawing at
// once and runs its GPU teardown when every program it owns reports ready, or at a cap.

export const RETIRE_POLL_MS = 250;
export const RETIRE_MAX_WAIT_MS = 8000;

/**
 * Run `finish` exactly once: at once when nothing is linking, otherwise after the captured programs
 * all report ready or `maxWaitMs` has passed.
 *
 * @param {object} o
 * @param {ArrayLike<{ isReady?: () => boolean | null }>} o.programs  the context's programs, captured
 *   before any teardown (a destroyed program can no longer answer)
 * @param {boolean} o.parallelCompile  KHR_parallel_shader_compile is present; without it every link
 *   already completed synchronously
 * @param {() => void} o.finish
 * @param {{ isContextLost?: () => boolean }} [o.context]  the owning WebGL context; once lost, no
 *   captured program can still be linking and every isReady() call only emits a GL warning
 * @param {(callback: () => void, ms: number) => unknown} [o.setTimer]
 * @param {() => number} [o.now]
 * @param {number} [o.pollMs]
 * @param {number} [o.maxWaitMs]
 * @returns {'now' | 'deferred'}
 */
export function retireWhenProgramsReady({
  programs,
  parallelCompile,
  finish,
  context = null,
  setTimer = (callback, ms) => setTimeout(callback, ms),
  now = () => Date.now(),
  pollMs = RETIRE_POLL_MS,
  maxWaitMs = RETIRE_MAX_WAIT_MS,
}) {
  const pending = parallelCompile === true && programs ? Array.from(programs) : [];
  // Every readiness query is a synchronous round trip to a GPU process busy with the loading cook, so
  // a check stops at the first program still linking. A lost context answers null and a destroyed
  // program throws; neither can finish linking, so both count as settled.
  const contextLost = () => {
    try { return !!(context && typeof context.isContextLost === 'function' && context.isContextLost()); }
    catch (_) { return false; }
  };
  const settled = () => {
    // Querying a dead handle emits a GL warning per call: a retire poll that outlives a force-lost
    // (or driver-evicted) context warns once per captured wrapper per tick. A lost context can never
    // finish a link, so the whole cohort counts as settled without another GL round trip.
    if (contextLost()) { pending.length = 0; return true; }
    while (pending.length > 0) {
      const program = pending[pending.length - 1];
      if (!program || typeof program.isReady !== 'function' || program.program == null) {
        pending.pop();
        continue;
      }
      let linking = false;
      try { linking = program.isReady() === false; } catch (_) { linking = false; }
      if (linking) return false;
      pending.pop();
    }
    return true;
  };
  if (settled()) {
    finish();
    return 'now';
  }
  const deadline = now() + maxWaitMs;
  const poll = () => {
    if (!settled() && now() < deadline) {
      setTimer(poll, pollMs);
      return;
    }
    finish();
  };
  setTimer(poll, pollMs);
  return 'deferred';
}
