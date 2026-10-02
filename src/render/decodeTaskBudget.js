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
 * FIFO semaphore with deadline classes. `acquire(decodeClass)` resolves a `release` function;
 * release returns the token to the next waiter — 'visible' waiters before 'deadline' waiters
 * before 'ambient' ones, FIFO within each class — or to `available`. Releasing is
 * idempotent-free — callers must invoke a release exactly once, so wrap tasks so settle paths
 * release exactly one token.
 *
 * Three classes: a 'visible' decode (spawn already at the glass — tGlass below the urgent
 * threshold) never waits behind runway work that still has seconds of slack; a 'deadline'
 * decode (decode-runway / wave-hull / admission-deadline work) never waits behind a queued
 * ambient warm; ambient fairness is preserved because the higher classes are rare and capped.
 */
export function createDecodeTaskBudget(limit) {
  const size = Math.max(1, Math.floor(limit));
  let available = size;
  const waiters = [];
  const release = () => {
    let idx = waiters.findIndex((w) => w.decodeClass === 'visible');
    if (idx < 0) idx = waiters.findIndex((w) => w.decodeClass === 'deadline');
    if (idx < 0) idx = waiters.length ? 0 : -1;
    const next = idx >= 0 ? waiters.splice(idx, 1)[0] : null;
    if (next) next.resolve(release);
    else available += 1;
  };
  const acquire = (decodeClass) => {
    if (available > 0) {
      available -= 1;
      return Promise.resolve(release);
    }
    return new Promise((resolve) => { waiters.push({ decodeClass, resolve }); });
  };
  const CLASS_RANK = { ambient: 0, deadline: 1, visible: 2 };
  /**
   * Re-grade every queued waiter strictly below `decodeClass` up to it, preserving FIFO.
   * A demand-joiner (a mount joining a task that posted decodes ambient) can't name the
   * waiters its task is blocked behind — the ambient tail it sits in is promoted whole,
   * matching the global-flag idiom the post path already applies for the rest of the join
   * window. Visible waiters keep their rank.
   */
  const promote = (decodeClass) => {
    const rank = CLASS_RANK[decodeClass] || 0;
    for (const w of waiters) {
      if ((CLASS_RANK[w.decodeClass] || 0) < rank) w.decodeClass = decodeClass;
    }
  };
  return Object.freeze({
    acquire,
    promote,
    get limit() { return size; },
    get inFlight() { return size - available; },
    get queued() { return waiters.length; },
  });
}

// Depth of currently in-flight deadline-class decode operations. Task intakes that cannot
// thread a per-task class (the KTX2 worker pool's postMessage is created inside the shared
// loader's internals) read this at post time: any task posted while a deadline decode owns
// the lane is treated as deadline work. The serial decode lane keeps the over-inclusion
// bounded to at most the co-scheduled sibling of a deadline part — strictly narrower than
// classifying nothing.
let deadlineDecodeDepth = 0;
let visibleDecodeDepth = 0;

export function deadlineDecodeActive() {
  // A visible decode is on the tightest clock the system models — everything deadline-scoped
  // applies to it as well.
  return deadlineDecodeDepth > 0 || visibleDecodeDepth > 0;
}

export function visibleDecodeActive() {
  return visibleDecodeDepth > 0;
}

/** The class any worker-decode post made right now should carry. */
export function activeDecodeClass() {
  return visibleDecodeDepth > 0 ? 'visible' : (deadlineDecodeDepth > 0 ? 'deadline' : 'ambient');
}

/** Run fn with the deadline-class flag set for the duration of its settlement. */
export function withDeadlineDecodeClass(fn) {
  deadlineDecodeDepth += 1;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    deadlineDecodeDepth -= 1;
  };
  try {
    const result = fn();
    Promise.resolve(result).then(settle, settle);
    return result;
  } catch (error) {
    settle();
    throw error;
  }
}

/** Run fn with the visible-class flag set for the duration of its settlement. */
export function withVisibleDecodeClass(fn) {
  visibleDecodeDepth += 1;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    visibleDecodeDepth -= 1;
  };
  try {
    const result = fn();
    Promise.resolve(result).then(settle, settle);
    return result;
  } catch (error) {
    settle();
    throw error;
  }
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
