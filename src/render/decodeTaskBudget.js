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
export const DECODE_CLASS_RANK = Object.freeze({ ambient: 0, deadline: 1, visible: 2 });

// Cross-lane pace ledger: the frame-paced slicers (compose driver, compile drain) each guard
// only their own budget — a busy frame would otherwise carry the SUM of every slicer's budget
// in paced main-thread JS. Slicers report their measured slice spend here; a slicer that runs
// later in the same frame window can read what the frame has already spent and stand down for
// the frame instead of stacking its budget on top.
const PACE_FRAME_WINDOW_MS = 8;
const paceNow = (typeof performance !== 'undefined' && typeof performance.now === 'function')
  ? () => performance.now()
  : () => Date.now();
let paceFrameStartedAt = -Infinity;
let paceFrameSpentMs = 0;

export function notePacedFrameSpend(ms) {
  const t = paceNow();
  if (t - paceFrameStartedAt >= PACE_FRAME_WINDOW_MS) {
    paceFrameStartedAt = t;
    paceFrameSpentMs = 0;
  }
  paceFrameSpentMs += Math.max(0, Number(ms) || 0);
}

export function pacedFrameSpend() {
  const t = paceNow();
  return (t - paceFrameStartedAt < PACE_FRAME_WINDOW_MS) ? paceFrameSpentMs : 0;
}

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
  const CLASS_RANK = DECODE_CLASS_RANK;
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

// Main-thread GLTF scene-graph construction has no worker offload: the budget above caps
// in-flight worker decodes, but each token releases when the worker returns — so a roster
// warm that posts many decodes can land every parseAsync continuation in one display frame.
// Pace parse STARTS through a per-frame FIFO: at most GLTF_PARSE_FRAME_LIMIT begin per
// animation frame, the rest begin on later frames. Decode order and resolution values are
// unchanged; only the start instant moves. Headless hosts (no rAF) run immediately — there
// are no frames to protect.
const GLTF_PARSE_FRAME_LIMIT = 2;
const gltfParsePending = [];
let gltfParseDrainScheduled = false;

function drainGltfParseQueue() {
  const batch = gltfParsePending.splice(0, GLTF_PARSE_FRAME_LIMIT);
  for (const task of batch) {
    Promise.resolve().then(task.fn).then(task.resolve, task.reject);
  }
  // The tail must keep draining without a new push — re-arm while items remain
  // (the flag stays latched so pushes during the drain just enqueue).
  if (gltfParsePending.length) requestAnimationFrame(drainGltfParseQueue);
  else gltfParseDrainScheduled = false;
}

export function scheduleGltfParse(fn) {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve().then(fn);
  return new Promise((resolve, reject) => {
    gltfParsePending.push({ fn, resolve, reject });
    if (gltfParseDrainScheduled) return;
    gltfParseDrainScheduled = true;
    requestAnimationFrame(drainGltfParseQueue);
  });
}

// The symmetric hazard sits one stage later: worker/parse replies resolve in clusters, so a
// burst's blueprint compiles — synchronous scene traverse + geometry prep + material policy —
// ran back-to-back inside a single microtask drain. Pace compile tails through per-class
// FIFO lanes (visible > deadline > ambient, mirroring the decode budget) capped per frame;
// the caller's promise stays open until its compile drains. Cached blueprints never reach
// this path (the admit layer resolves before createTask), so the fast path is untouched.
//
// The cap is a time box, not a count: compiles range sub-ms greebles to multi-ms hulls, so a
// count floor starved small-part bursts ~2-5x below the frame budget while two heavy compiles
// could still share a frame. Tasks run synchronously inside the drain so the measured cost is
// the compile itself — one heavy task may exceed the budget exactly as it did before, the
// minimum is one task per frame, and the per-frame worst case stays budget + one compile.
const GLTF_COMPILE_FRAME_MS = 4;
const gltfCompilePending = { visible: [], deadline: [], ambient: [] };
// token -> { entry, lane } for entries still queued — a joiner re-grades a task whose tail
// already enqueued at a lower class (mirrors budget.promote's queued-waiter re-grade).
const gltfCompileEntries = new WeakMap();
let gltfCompileDrainScheduled = false;
// Frames skipped in a row because another paced slicer already spent the frame's JS budget.
// Aging prevents a perpetual visible/deadline stream from starving compile tails forever —
// after the cap the drain runs one entry minimum per frame like before.
let gltfCompileFramesSkipped = 0;
const GLTF_COMPILE_MAX_SKIPPED_FRAMES = 2;

function gltfCompileLaneFor(decodeClass) {
  return decodeClass === 'visible' ? gltfCompilePending.visible
    : decodeClass === 'deadline' ? gltfCompilePending.deadline
      : gltfCompilePending.ambient;
}

function drainGltfCompileQueue() {
  const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? () => performance.now()
    : () => Date.now();
  // Another paced slicer already ate the frame's JS budget — yield this frame rather than
  // stack a second slice on top. The aging cap keeps a busy visible/deadline stream from
  // starving ambient compile tails indefinitely.
  if (pacedFrameSpend() >= GLTF_COMPILE_FRAME_MS && gltfCompileFramesSkipped < GLTF_COMPILE_MAX_SKIPPED_FRAMES) {
    gltfCompileFramesSkipped += 1;
    requestAnimationFrame(drainGltfCompileQueue);
    return;
  }
  gltfCompileFramesSkipped = 0;
  const start = now();
  let ran = 0;
  while (ran === 0 || now() - start < GLTF_COMPILE_FRAME_MS) {
    let task = null;
    for (const lane of [gltfCompilePending.visible, gltfCompilePending.deadline, gltfCompilePending.ambient]) {
      if (lane.length) { task = lane.shift(); break; }
    }
    if (!task) break;
    ran += 1;
    try { task.resolve(task.fn()); } catch (error) { task.reject(error); }
  }
  notePacedFrameSpend(now() - start);
  const pending = gltfCompilePending.visible.length
    || gltfCompilePending.deadline.length
    || gltfCompilePending.ambient.length;
  // Same re-arm contract as the parse drain: the tail must keep draining without a new push.
  if (pending) requestAnimationFrame(drainGltfCompileQueue);
  else gltfCompileDrainScheduled = false;
}

export function scheduleGltfCompile(fn, decodeClass, token) {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve().then(fn);
  return new Promise((resolve, reject) => {
    const lane = gltfCompileLaneFor(decodeClass);
    const entry = { fn, resolve, reject };
    lane.push(entry);
    if (token) gltfCompileEntries.set(token, { entry, lane });
    if (gltfCompileDrainScheduled) return;
    gltfCompileDrainScheduled = true;
    requestAnimationFrame(drainGltfCompileQueue);
  });
}

/**
 * Re-grade a queued compile tail to `decodeClass` when a live joiner outranks the class the
 * tail enqueued under. The entry moves to the HEAD of the target lane: its owner is already
 * on the player's deadline, strictly ahead of earlier same-class speculative work. A drained
 * entry returns false — the caller's class map still covers any tail not yet enqueued.
 */
export function regradeGltfCompile(token, decodeClass) {
  const rec = gltfCompileEntries.get(token);
  if (!rec) return false;
  const target = gltfCompileLaneFor(decodeClass);
  if (rec.lane === target) return true;
  const idx = rec.lane.indexOf(rec.entry);
  if (idx === -1) {
    gltfCompileEntries.delete(token);
    return false;
  }
  rec.lane.splice(idx, 1);
  target.unshift(rec.entry);
  rec.lane = target;
  return true;
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
