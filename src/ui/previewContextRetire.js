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
  setTimer = (callback, ms) => setTimeout(callback, ms),
  now = () => Date.now(),
  pollMs = RETIRE_POLL_MS,
  maxWaitMs = RETIRE_MAX_WAIT_MS,
}) {
  const pending = parallelCompile === true && programs ? Array.from(programs) : [];
  // Every readiness query is a synchronous round trip to a GPU process busy with the loading cook, so
  // a check stops at the first program still linking. A lost context answers null and a destroyed
  // program throws; neither can finish linking, so both count as settled.
  const settled = () => {
    while (pending.length > 0) {
      let linking = false;
      try { linking = pending[pending.length - 1].isReady() === false; } catch (_) { linking = false; }
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
