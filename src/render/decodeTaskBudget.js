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
 * idempotent per lease, so a stale completion cannot return another task's token.
 * `acquire({ decodeClass, signal })` also lets a retired queued owner leave the gate.
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
//
// The wallet is keyed on the present boundary, not a wall-clock window: an 8ms
// anchor re-mints a fresh wallet per >8ms frame, so the effective budget scaled
// with frame length — worst exactly on the heavy frames the ledger exists for.
// A lazily-armed rAF pump bumps the epoch each displayed frame; spend minted
// under an older epoch is invisible to this frame's readers. Headless hosts
// (no rAF) keep the legacy 8ms wall-clock window — there are no presents to key.
const PACE_FRAME_WINDOW_MS = 8;
const paceNow = (typeof performance !== 'undefined' && typeof performance.now === 'function')
  ? () => performance.now()
  : () => Date.now();
let paceFrameStartedAt = -Infinity;
let paceFrameSpentMs = 0;
let paceFrameEpoch = 0;
let paceSpentEpoch = -1;
let pacePumpArmed = false;
// Last pump fire in wall-clock ms: a hidden/occluded window freezes the epoch
// while paced spend keeps accumulating — beyond this age the wallet re-keys on
// the 8ms window instead of reading permanently over-budget. 250ms sits above
// the worst honest presented frame (a 4fps hitch) so ordinary slow frames keep
// epoch-keyed isolation while a genuinely starved pump still falls back.
let pacePumpFiredAt = 0;
const PACE_EPOCH_STALE_MS = 250;

export function paceEpochNow() {
  // Only a real browser frame loop keys the epoch — headless/test hosts that stub
  // globalThis.requestAnimationFrame (often microtask-driven) would either hang the
  // pump's self-re-arm chain or freeze the epoch and livelock paced drains. No
  // `window` means no presents, so the wall-clock window below is the right key.
  if (typeof window !== 'object' || typeof window.requestAnimationFrame !== 'function') return -1;
  if (!pacePumpArmed) {
    pacePumpArmed = true;
    const pump = () => {
      paceFrameEpoch += 1;
      pacePumpFiredAt = paceNow();
      window.requestAnimationFrame(pump);
    };
    window.requestAnimationFrame(pump);
  }
  if (paceNow() - pacePumpFiredAt > PACE_EPOCH_STALE_MS) return -1;
  return paceFrameEpoch;
}

export function notePacedFrameSpend(ms) {
  const epoch = paceEpochNow();
  if (epoch >= 0) {
    if (paceSpentEpoch !== epoch) {
      paceSpentEpoch = epoch;
      paceFrameSpentMs = 0;
    }
    paceFrameSpentMs += Math.max(0, Number(ms) || 0);
    return;
  }
  const t = paceNow();
  if (t - paceFrameStartedAt >= PACE_FRAME_WINDOW_MS) {
    paceFrameStartedAt = t;
    paceFrameSpentMs = 0;
  }
  paceFrameSpentMs += Math.max(0, Number(ms) || 0);
}

export function pacedFrameSpend() {
  const epoch = paceEpochNow();
  if (epoch >= 0) return paceSpentEpoch === epoch ? paceFrameSpentMs : 0;
  const t = paceNow();
  return (t - paceFrameStartedAt < PACE_FRAME_WINDOW_MS) ? paceFrameSpentMs : 0;
}

// Shared forced-spend wallet: skip-cap lanes (dispose drains, release flush,
// env rebind, drawnCull floor) each carry an independent aging cap, so under a
// sustained storm every cap can trip on the SAME presented frame and stack
// ~25-60 ms of "forced" work. A lane about to run only because its cap fired
// consults this wallet first — over-cap lanes defer a frame (their counter
// stays at cap, so they still force next frame in arrival order). Not a
// strict one-unit serialization: forced units carry real debt.
export const FORCED_FRAME_BUDGET_MS = 8;
let forcedSpentEpoch = -1;
let forcedFrameSpentMs = 0;
let forcedFrameStartedAt = -Infinity;

export function noteForcedFrameSpend(ms) {
  const epoch = paceEpochNow();
  if (epoch >= 0) {
    if (forcedSpentEpoch !== epoch) {
      forcedSpentEpoch = epoch;
      forcedFrameSpentMs = 0;
    }
    forcedFrameSpentMs += Math.max(0, Number(ms) || 0);
    return;
  }
  const t = paceNow();
  if (t - forcedFrameStartedAt >= PACE_FRAME_WINDOW_MS) {
    forcedFrameStartedAt = t;
    forcedFrameSpentMs = 0;
  }
  forcedFrameSpentMs += Math.max(0, Number(ms) || 0);
}

export function forcedFrameSpend() {
  const epoch = paceEpochNow();
  if (epoch >= 0) return forcedSpentEpoch === epoch ? forcedFrameSpentMs : 0;
  const t = paceNow();
  return (t - forcedFrameStartedAt < PACE_FRAME_WINDOW_MS) ? forcedFrameSpentMs : 0;
}

export function createDecodeTaskBudget(limit) {
  if (!Number.isFinite(limit) || limit <= 0) throw new RangeError('Decode budget limit must be finite and positive');
  const size = Math.max(1, Math.floor(limit));
  let available = size;
  const waiters = [];
  const returnToken = () => {
    let idx = waiters.findIndex((w) => w.decodeClass === 'visible');
    if (idx < 0) idx = waiters.findIndex((w) => w.decodeClass === 'deadline');
    if (idx < 0) idx = waiters.length ? 0 : -1;
    const next = idx >= 0 ? waiters.splice(idx, 1)[0] : null;
    if (next) {
      next.detach();
      next.resolve(newLease());
    }
    else available += 1;
  };
  const newLease = () => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      returnToken();
    };
  };
  const abortError = (signal) => {
    const reason = signal.reason;
    if (reason instanceof Error && reason.name === 'AbortError') return reason;
    const error = new Error(reason == null ? 'Decode owner became inactive' : String(reason));
    error.name = 'AbortError';
    return error;
  };
  const acquire = (options) => {
    const signal = options && typeof options === 'object' ? options.signal : null;
    const decodeClass = typeof options === 'string' ? options : options && options.decodeClass;
    if (signal && signal.aborted) return Promise.reject(abortError(signal));
    if (available > 0) {
      available -= 1;
      return Promise.resolve(newLease());
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const index = waiters.indexOf(waiter);
        if (index < 0) return;
        waiters.splice(index, 1);
        waiter.detach();
        reject(abortError(signal));
      };
      const waiter = { decodeClass, resolve, detach: () => signal && signal.removeEventListener('abort', onAbort) };
      waiters.push(waiter);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
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
const GLTF_PARSE_FRAME_MS = 4;
// The parse start paces through the same three-class lanes the compile tail
// one stage later uses — a flat FIFO let an ambient warm decode sit ahead of
// a visible pop-in's parseAsync, inverting the order the downstream compile
// lanes exist to enforce (a parse re-graded visible downstream could never
// pass the ambient parses queued in front of it).
const gltfParsePending = { visible: [], deadline: [], ambient: [] };
// token -> { entry, lane } for entries still queued — a deadline/visible
// joiner re-grades a parse whose start already enqueued at a lower class
// (mirrors regradeGltfCompile's queued-waiter move one stage later).
const gltfParseEntries = new WeakMap();
let gltfParseDrainScheduled = false;
// Frames skipped in a row because another paced slicer already spent the
// frame's JS budget — the same aging contract the compile drain keeps: a
// perpetually-busy stream cannot starve parse starts forever, and a
// cap-fired run consults the shared forced wallet first.
let gltfParseFramesSkipped = 0;
const GLTF_PARSE_MAX_SKIPPED_FRAMES = 2;

// A hidden or occluded tab can starve rAF for the whole load, wedging every
// queued drain behind the never-firing arm until an outer timeout bounces it.
// Dual-arm with a short timer: under real frames rAF wins and the drain runs
// where it always did; starved hosts converge at timer cadence.
function armFrameDrain(callback) {
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    callback();
  };
  requestAnimationFrame(fire);
  setTimeout(fire, 48);
}

function gltfParseLaneFor(decodeClass) {
  return decodeClass === 'visible' ? gltfParsePending.visible
    : decodeClass === 'deadline' ? gltfParsePending.deadline
      : gltfParsePending.ambient;
}

function drainGltfParseQueue() {
  const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? () => performance.now()
    : () => Date.now();
  // The compile drain one stage later got the wallet contract already; the
  // parse drain never did: a decode burst settling N hulls on one rAF arm
  // used to land GLTF_PARSE_FRAME_LIMIT arbitrary-cost parseAsync scene-graph
  // constructions in the task right after the arm — unmeasured, unconsulted.
  // Same consult + aging + forced-wallet shape as drainGltfCompileQueue.
  const pacedSpent = pacedFrameSpend() >= PACED_FRAME_BUDGET_MS;
  if (pacedSpent
      && (gltfParseFramesSkipped < GLTF_PARSE_MAX_SKIPPED_FRAMES
        || forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS)) {
    gltfParseFramesSkipped = Math.min(gltfParseFramesSkipped + 1, GLTF_PARSE_MAX_SKIPPED_FRAMES);
    armFrameDrain(drainGltfParseQueue);
    return;
  }
  gltfParseFramesSkipped = 0;
  const forcedRun = pacedSpent;
  const start = now();
  let ran = 0;
  // Count floor preserved (<=2 starts per arm); the ms box drops a second
  // start when the first parse already spent the frame's budget. Lanes drain
  // in strict visible > deadline > ambient order inside the same box.
  while (ran < GLTF_PARSE_FRAME_LIMIT && (ran === 0 || now() - start < GLTF_PARSE_FRAME_MS)) {
    let task = null;
    for (const lane of [gltfParsePending.visible, gltfParsePending.deadline, gltfParsePending.ambient]) {
      if (lane.length) { task = lane.shift(); break; }
    }
    if (!task) break;
    if (task.token) gltfParseEntries.delete(task.token);
    // A departed owner's queued parse must not burn one of the frame's parse
    // slots (or the whole GLTF_PARSE_FRAME_MS span) ahead of live entries —
    // the compile tail's consumer-liveness consult, one stage earlier.
    if (typeof task.isLive === 'function' && !task.isLive()) {
      task.resolve(null);
      continue;
    }
    ran += 1;
    // Run inside the drain: a synchronous scene-graph build (parseAsync — the
    // roster-warm burst class the count cap was minted for) pays inside this
    // measured span. fn()'s returned promise can ALSO carry same-frame work —
    // parseAsync's bufferView resolve + object-graph build settles in the
    // microtask checkpoint right after this drain — so the settle debit below
    // measures the tail that lands unmeasured otherwise (a resolved async
    // task frees its lane but its tail still ran this frame).
    try {
      const out = task.fn();
      const tailStart = now();
      // Same-frame gate: only a settle inside this frame's microtask
      // checkpoint counts its tail — a genuinely-async settle (network
      // fetch landing frames later) would otherwise debit its whole
      // multi-frame span into whichever frame it lands in.
      Promise.resolve(out).then((value) => {
        const tail = now() - tailStart;
        if (tail > 0 && tail <= 24) {
          notePacedFrameSpend(tail);
          if (forcedRun) noteForcedFrameSpend(tail);
        }
        const continuationStart = tail > 24 ? now() : 0;
        task.resolve(value);
        // A settle landing in a later presented frame skips the same-frame
        // debit, but the consumer continuation it unblocks (package tail,
        // retain, commit) still does sync work inside this microtask
        // checkpoint — measure that window against the landing frame.
        if (continuationStart) queueMicrotask(() => {
          const spent = now() - continuationStart;
          if (spent > 0) {
            const forced = pacedFrameSpend() >= PACED_FRAME_BUDGET_MS;
            notePacedFrameSpend(spent);
            if (forced) noteForcedFrameSpend(Math.min(spent, FORCED_FRAME_BUDGET_MS));
          }
        });
      }, (error) => {
        const tail = now() - tailStart;
        if (tail > 0 && tail <= 24) {
          notePacedFrameSpend(tail);
          if (forcedRun) noteForcedFrameSpend(tail);
        }
        task.reject(error);
      });
    } catch (error) {
      task.reject(error);
    }
  }
  const elapsed = now() - start;
  if (elapsed > 0) {
    notePacedFrameSpend(elapsed);
    if (forcedRun) noteForcedFrameSpend(elapsed);
  }
  // The tail must keep draining without a new push — re-arm while items remain
  // (the flag stays latched so pushes during the drain just enqueue).
  if (gltfParsePending.visible.length
      || gltfParsePending.deadline.length
      || gltfParsePending.ambient.length) armFrameDrain(drainGltfParseQueue);
  else gltfParseDrainScheduled = false;
}

export function scheduleGltfParse(fn, token = null, isLive = null) {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve().then(fn);
  return new Promise((resolve, reject) => {
    const lane = gltfParseLaneFor(activeDecodeClass());
    const entry = { fn, resolve, reject, token, isLive };
    lane.push(entry);
    if (token) gltfParseEntries.set(token, { entry, lane });
    if (gltfParseDrainScheduled) return;
    gltfParseDrainScheduled = true;
    armFrameDrain(drainGltfParseQueue);
  });
}

/**
 * Re-grade a queued parse start to `decodeClass` when a live joiner outranks the
 * class it enqueued under. The entry moves to the HEAD of the target lane: its
 * owner is already on the player's deadline, strictly ahead of earlier
 * same-class speculative work. A started entry returns false — the caller's
 * flag window already raises the class of anything still to enqueue.
 */
export function regradeGltfParse(token, decodeClass) {
  const rec = gltfParseEntries.get(token);
  if (!rec) return false;
  const target = gltfParseLaneFor(decodeClass);
  if (rec.lane === target) return true;
  const idx = rec.lane.indexOf(rec.entry);
  if (idx === -1) {
    gltfParseEntries.delete(token);
    return false;
  }
  rec.lane.splice(idx, 1);
  target.unshift(rec.entry);
  rec.lane = target;
  return true;
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
/** The per-frame paced-work budget every slicer drains against (`pacedFrameSpend`). */
export const PACED_FRAME_BUDGET_MS = GLTF_COMPILE_FRAME_MS;
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
  // starving ambient compile tails indefinitely. A cap-fired run is "forced" work: the
  // shared forced wallet bounds the summed spend of every cap-fired lane that can trip on
  // the same presented frame — over-budget it defers one more frame (counter held at cap
  // so it still forces on the next).
  const pacedSpent = pacedFrameSpend() >= GLTF_COMPILE_FRAME_MS;
  if (pacedSpent
      && (gltfCompileFramesSkipped < GLTF_COMPILE_MAX_SKIPPED_FRAMES
        || forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS)) {
    gltfCompileFramesSkipped = Math.min(gltfCompileFramesSkipped + 1, GLTF_COMPILE_MAX_SKIPPED_FRAMES);
    armFrameDrain(drainGltfCompileQueue);
    return;
  }
  gltfCompileFramesSkipped = 0;
  const forcedRun = pacedSpent;
  const start = now();
  let ran = 0;
  while (ran === 0 || now() - start < GLTF_COMPILE_FRAME_MS) {
    let task = null;
    for (const lane of [gltfCompilePending.visible, gltfCompilePending.deadline, gltfCompilePending.ambient]) {
      if (lane.length) { task = lane.shift(); break; }
    }
    if (!task) break;
    ran += 1;
    // Same settle-time accounting as the parse drain: a compile fn that
    // returns a promise (preparePackageTail's awaited internals) still runs
    // its tail in this frame's microtask checkpoint — the sync-prefix ms box
    // can't see it, so the settle debit counts it where it lands.
    try {
      const out = task.fn();
      const tailStart = now();
      Promise.resolve(out).then(() => {
        const tail = now() - tailStart;
        if (tail > 0 && tail <= 24) {
          notePacedFrameSpend(tail);
          if (forcedRun) noteForcedFrameSpend(tail);
          return;
        }
        // Late settle: the wait isn't spend, but the consumer continuation
        // this settle unblocks still lands in this frame's microtask
        // checkpoint — measure that window (same contract as the parse drain).
        const continuationStart = now();
        queueMicrotask(() => {
          const spent = now() - continuationStart;
          if (spent > 0) {
            const forced = pacedFrameSpend() >= PACED_FRAME_BUDGET_MS;
            notePacedFrameSpend(spent);
            if (forced) noteForcedFrameSpend(Math.min(spent, FORCED_FRAME_BUDGET_MS));
          }
        });
      });
      task.resolve(out);
    } catch (error) { task.reject(error); }
  }
  const elapsed = now() - start;
  notePacedFrameSpend(elapsed);
  if (forcedRun) noteForcedFrameSpend(elapsed);
  const pending = gltfCompilePending.visible.length
    || gltfCompilePending.deadline.length
    || gltfCompilePending.ambient.length;
  // Same re-arm contract as the parse drain: the tail must keep draining without a new push.
  if (pending) armFrameDrain(drainGltfCompileQueue);
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
    armFrameDrain(drainGltfCompileQueue);
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
