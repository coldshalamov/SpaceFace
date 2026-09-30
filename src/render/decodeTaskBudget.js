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

function abortError(reason) {
  if (reason instanceof Error && reason.name === 'AbortError') return reason;
  const message = reason instanceof Error
    ? (reason.message || 'decode task budget wait aborted')
    : (reason != null ? String(reason) : 'decode task budget wait aborted');
  const error = new Error(message);
  error.name = 'AbortError';
  if (reason instanceof Error) error.cause = reason;
  return error;
}

/**
 * FIFO semaphore. `acquire()` resolves a `release` function; release returns the token to the
 * next waiter (FIFO) or to `available`. Each lease's release is idempotent — a late `finally`
 * after an aborted or settled task cannot return the token twice. `acquire({ signal })`
 * rejects a still-queued waiter on abort and removes its abort listener once granted.
 */
export function createDecodeTaskBudget(limit) {
  const size = Number(limit);
  if (!Number.isFinite(size) || size <= 0) {
    throw new RangeError(`decode task budget limit must be a finite positive number, got ${limit}`);
  }
  const slots = Math.max(1, Math.floor(size));
  let available = slots;
  const waiters = [];
  const grant = () => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = waiters.shift();
      if (next) next();
      else available += 1;
    };
  };
  const acquire = ({ signal } = {}) => {
    if (signal && signal.aborted) return Promise.reject(abortError(signal.reason));
    if (available > 0) {
      available -= 1;
      return Promise.resolve(grant());
    }
    return new Promise((resolve, reject) => {
      const waiter = { onAbort: null };
      const detach = () => {
        if (waiter.onAbort) signal.removeEventListener('abort', waiter.onAbort);
      };
      const grantSeat = () => {
        detach();
        resolve(grant());
      };
      if (signal && typeof signal.addEventListener === 'function') {
        waiter.onAbort = () => {
          detach();
          const index = waiters.indexOf(grantSeat);
          if (index >= 0) waiters.splice(index, 1);
          reject(abortError(signal.reason));
        };
        signal.addEventListener('abort', waiter.onAbort);
      }
      waiters.push(grantSeat);
    });
  };
  return Object.freeze({
    acquire,
    get limit() { return slots; },
    get inFlight() { return slots - available; },
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
