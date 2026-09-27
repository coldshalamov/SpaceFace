// Shared in-flight budget for worker decode tasks (KTX2/Basis transcode and meshopt decode).
//
// Each decoder owns a private worker pool sized from navigator.hardwareConcurrency —
// KTX2 up to min(8, cores-2), meshopt up to min(4, cores-1) — so a KTX2 burst overlapping a
// meshopt burst can field more busy workers than the host has spare cores and starve the
// present thread. Posting every decode task through one FIFO gate caps the TOTAL in-flight
// work at `limit` across all decoders while each pool keeps its own internal ordering: tasks
// leave the gate in arrival order and enter their pool's own queue in that same order. Idle
// capacity flows to whichever decoder has work — a lone decoder still uses the whole budget.
//
// Scheduling only: decoded bytes, resolution values, and per-decoder task order are unchanged.

const FALLBACK_CORES = 4;
// Floor of 2 keeps decode parallel on tiny hosts while still leaving the present thread a core.
const MIN_LIMIT = 2;

export function resolveDecodeTaskBudgetLimit(hardwareConcurrency) {
  const cores = Number.isFinite(hardwareConcurrency) ? hardwareConcurrency : FALLBACK_CORES;
  return Math.max(MIN_LIMIT, Math.floor(cores) - 2);
}

/**
 * FIFO semaphore. `acquire()` resolves a `release` function; release returns the token to the
 * next waiter (FIFO) or to `available`. Releasing is idempotent-free — callers must invoke a
 * release exactly once, so wrap tasks so settle paths release exactly one token.
 */
export function createDecodeTaskBudget(limit) {
  const size = Math.max(1, Math.floor(limit));
  let available = size;
  const waiters = [];
  const release = () => {
    const next = waiters.shift();
    if (next) next(release);
    else available += 1;
  };
  const acquire = () => {
    if (available > 0) {
      available -= 1;
      return Promise.resolve(release);
    }
    return new Promise((resolve) => { waiters.push(resolve); });
  };
  return Object.freeze({
    acquire,
    get limit() { return size; },
    get inFlight() { return size - available; },
    get queued() { return waiters.length; },
  });
}

let shared = null;

/** Process-wide budget shared by every decoder pool intake. */
export function sharedDecodeTaskBudget() {
  if (!shared) {
    shared = createDecodeTaskBudget(resolveDecodeTaskBudgetLimit(
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : FALLBACK_CORES));
  }
  return shared;
}
