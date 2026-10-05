import { shouldStartHeavyAdmission } from './admissionSliceBudget.js';
import { reportBootWork } from '../core/bootWork.js';
import { armCallbackAfterPresent } from './compilePresentSlice.js';
import { cookLiveSceneGpu } from './liveSceneCook.js';
import { settleOpeningCompositionTail } from './precompile.js';
import { yieldToBrowser } from './startupGpuResidency.js';

function gpuContextIsLost(state) {
  const render = state && state.render;
  if (!render) return false;
  if (render.contextLost === true) return true;
  if (render.contextRecovery && render.contextRecovery.pending === true) return true;
  const renderer = render.renderer;
  try {
    const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
    return !!(gl && typeof gl.isContextLost === 'function' && gl.isContextLost());
  } catch {
    return true;
  }
}

function timeout(ms) {
  let timer = null;
  const promise = new Promise((resolve) => {
    timer = setTimeout(() => {
      timer = null;
      resolve({ ok: false, timeout: true });
    }, ms);
  });
  return {
    promise,
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

async function settleWithin(promise, timeoutMs) {
  const limit = timeout(timeoutMs);
  try {
    return await Promise.race([
      Promise.resolve(promise).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      ),
      limit.promise,
    ]);
  } finally {
    // The loser of the race must not keep a multi-minute timer alive after the gate moved on.
    limit.cancel();
  }
}

function ledgerNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function settleOutcome(result) {
  if (result && result.ok === true) return 'resolved';
  return result && result.timeout === true ? 'timeout' : 'error';
}

/**
 * Loading-shell cook ledger (state.render.openingCookLedger). Every awaited step of the opening and
 * jump cooks pushes one row: its wall milliseconds and whether it resolved, timed out, or was skipped.
 * The gpu-resources stage is bounded by waits, not work, so the only honest way to shorten it is to
 * know which wait owns the time and why it ended. Diagnostic only; nothing reads the rows back.
 */
export function beginOpeningCookLedger(render, kind) {
  if (!render || typeof render !== 'object') return null;
  const ledger = [{
    step: 'begin', ms: 0, outcome: 'resolved', t: 0, kind: String(kind || 'cook'),
    wallMs: Date.now(), startedAt: ledgerNow(),
  }];
  render.openingCookLedger = ledger;
  return ledger;
}

export function recordOpeningCookStep(render, step, startedMs, outcome, detail = null) {
  if (!render || typeof render !== 'object') return null;
  let ledger = render.openingCookLedger;
  if (!Array.isArray(ledger) || ledger.length === 0) ledger = beginOpeningCookLedger(render, 'implicit');
  const at = ledgerNow();
  const origin = Number(ledger[0] && ledger[0].startedAt);
  const row = {
    step: String(step),
    ms: Math.round(at - (Number.isFinite(startedMs) ? startedMs : at)),
    outcome: String(outcome || 'resolved'),
    t: Number.isFinite(origin) ? Math.round(at - origin) : 0,
  };
  if (detail && typeof detail === 'object') {
    for (const [key, value] of Object.entries(detail)) {
      if (value !== undefined && !(key in row)) row[key] = value;
    }
  }
  ledger.push(row);
  reportBootWork(render, { kind: 'cook-step', ...row });
  return row;
}

/** One compact console line for a finished cook ledger. */
export function formatOpeningCookLedger(ledger) {
  const rows = Array.isArray(ledger) ? ledger.filter(Boolean) : [];
  const head = rows[0] && rows[0].step === 'begin' ? rows[0] : null;
  const total = rows.reduce((max, row) => Math.max(max, Number(row.t) || 0), 0);
  // 1 Hz lane samples stay in the ledger array for probes; the console line keeps only their count.
  const samples = rows.filter((row) => row.step === 'lane').length;
  const parts = rows.filter((row) => row !== head && row.step !== 'lane').map((row) => {
    const detail = Object.entries(row)
      .filter(([key]) => key !== 'step' && key !== 'ms' && key !== 'outcome' && key !== 't')
      .map(([key, value]) => `${key}=${value !== null && typeof value === 'object' ? JSON.stringify(value) : value}`)
      .join(',');
    return `${row.step} ${row.ms}ms ${row.outcome}${detail ? ` (${detail})` : ''}`;
  });
  if (samples > 0) parts.push(`lane samples ${samples}`);
  return `[render] ${head ? head.kind : 'cook'} ledger ${total} ms: ${parts.join(' | ')}`;
}

function logOpeningCookLedger(ledger) {
  if (!Array.isArray(ledger)) return;
  try { console.info(formatOpeningCookLedger(ledger)); } catch { /* diagnostics must not throw */ }
}

/**
 * A yield that only yields once `sliceMs` of work has run since the last real yield, so several small
 * loading-shell items (touches, texture uploads, mesh builds) share one frame instead of each paying a
 * whole frame. `await sliced(true)` always yields. `sliced.yields` counts real yields for the ledger.
 */
export function createSlicedYield(yieldFn, options = {}) {
  if (typeof yieldFn !== 'function') throw new TypeError('createSlicedYield requires a yield function');
  const sliceMs = Number.isFinite(Number(options.sliceMs)) ? Math.max(0, Number(options.sliceMs)) : 8;
  const now = typeof options.now === 'function' ? options.now : ledgerNow;
  const shouldYield = typeof options.shouldYield === 'function' ? options.shouldYield : null;
  const debit = typeof options.debit === 'function' ? options.debit : null;
  // `debitGate` is sampled where `sliceStarted` is minted so a gating term that
  // flips mid-slice can't forfeit (or double-count) the slice's posted spend.
  const debitGate = typeof options.debitGate === 'function' ? options.debitGate : null;
  let debitArmed = debitGate ? !!debitGate() : true;
  let sliceStarted = now();
  const sliced = async (force = false) => {
    const tick = now();
    if (force !== true && tick - sliceStarted < sliceMs && !(shouldYield && shouldYield())) return false;
    sliced.yields += 1;
    if (debit && debitArmed) debit(tick - sliceStarted);
    await yieldFn();
    sliceStarted = now();
    if (debitGate) debitArmed = !!debitGate();
    return true;
  };
  sliced.yields = 0;
  return sliced;
}

/** 1 Hz `lane` rows while a cook runs, from the renderer's sampler when it has one. */
function startOpeningCookLaneSampler(render) {
  const sample = render && typeof render.sampleOpeningCookLane === 'function'
    ? render.sampleOpeningCookLane
    : null;
  if (!sample || typeof setInterval !== 'function') return () => {};
  const timer = setInterval(() => {
    try { recordOpeningCookStep(render, 'lane', NaN, 'sample', sample()); } catch { /* diagnostics only */ }
  }, 1000);
  return () => clearInterval(timer);
}

/**
 * Coalesce authored-material subjects into one driver admission pass and expose one aggregate gate.
 * compileAsync() polls driver program status; invoking it once per ship multiplied those synchronous
 * status checks even when ships shared the same shader variants. A short bounded collection window
 * lets Three.js deduplicate programs across the complete subject set without delaying visible swaps.
 */
export function createPipelineAdmissionTracker(compileBatch, options = {}) {
  if (typeof compileBatch !== 'function') throw new TypeError('pipeline tracker requires compileBatch()');
  const quietMs = Math.max(0, Number(options.quietMs) || 40);
  const maxWaitMs = Math.max(quietMs, Number(options.maxWaitMs) || 200);
  const resumeBatchSize = Math.max(1, Math.floor(Number(options.resumeBatchSize) || 1));
  const scheduleResume = typeof options.scheduleResume === 'function'
    ? options.scheduleResume
    : (callback) => {
        // The bounded resume lane is ambient admission work — firing it inside the next rAF
        // callback stacked the compile batch on that frame's pre-present budget. Arm it after
        // the present at background priority with an idle bound: a saturated main thread
        // starves best-effort tasks for whole seconds, and an unbounded wait showed up as
        // held roots piling ~48 deep and contacts never admitting. armCallbackAfterPresent
        // also carries the 48 ms unstick so a starved rAF (occluded or minimized headed
        // window) cannot park the lane while the authored-readiness gate waits on it.
        armCallbackAfterPresent(callback, { idleBoundMs: 48 });
      };
  const deferAutoFlush = typeof options.deferAutoFlush === 'function'
    ? options.deferAutoFlush
    : () => false;
  const onBlockingSlice = typeof options.onBlockingSlice === 'function'
    ? options.onBlockingSlice
    : null;
  const onRejected = typeof options.onRejected === 'function'
    ? options.onRejected
    : (error) => console.warn('[render] pipeline admission failed', error);
  const now = typeof options.now === 'function'
    ? options.now
    : () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now());
  const pending = new Set();
  const capturedPlans = new WeakMap();
  let queued = [];
  // Urgent (deadline-glass) compiles already serialized on the tail, keyed by
  // subject so a re-request joins the outstanding link instead of compiling twice.
  const urgentRuns = new Map();
  let quietTimer = null;
  let maxTimer = null;
  // Compile batches stay strictly serial — render-target selection is global renderer
  // state. The tail is a pull-queue rather than an eager .then chain: link specs wait
  // in linkSpecs until the in-flight link settles, so an urgent spec splices ahead of
  // still-queued ambient links (behind earlier urgents) instead of chaining behind
  // every link that happened to be queued first. tailSettle shadows the old
  // compileTail for callers that only want "everything started so far" drained.
  const linkSpecs = [];
  let linkActive = false;
  let tailSettle = Promise.resolve();
  // Every bound in the admission system sits on a waiter — the link run itself had
  // none: a compile/link that never settles would keep linkActive forever and wedge
  // every later spec (ambient AND urgent). Race each run against a bound well above
  // the 20s KHR drain; on timeout the entries resolve with a tagged outcome and the
  // pump advances — refused subjects re-admit through the normal lanes.
  const LINK_RUN_TAIL_TIMEOUT_MS = 50000;
  const LINK_TAIL_TIMEOUT_RESULT = Object.freeze({ tailTimeout: true });
  let nextAdmissionId = 0;
  let settledAdmissions = 0;
  let boundedResume = false;
  let resumeScheduled = false;
  let skippedResumeForLatePresent = false;

  function clearTimers() {
    if (quietTimer != null) clearTimeout(quietTimer);
    if (maxTimer != null) clearTimeout(maxTimer);
    quietTimer = null;
    maxTimer = null;
  }

  function scheduleFlush() {
    if (deferAutoFlush()) return;
    if (boundedResume) {
      scheduleResumedBatch();
      return;
    }
    if (quietTimer != null) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => { observePipelineAdmission(flushQueued()); }, quietMs);
    if (maxTimer == null) maxTimer = setTimeout(() => { observePipelineAdmission(flushQueued()); }, maxWaitMs);
  }

  /** Time only the synchronous compileBatch call (until it returns a value/promise). */
  function invokeCompileBatch(subjects, path, compileOptions) {
    // Optional observer is inert: no clock reads or metadata when nothing is listening.
    if (!onBlockingSlice) return compileBatch(subjects, compileOptions);
    const started = now();
    try {
      const result = compileBatch(subjects, compileOptions);
      reportSlice(path, subjects.length, now() - started);
      return result;
    } catch (error) {
      reportSlice(path, subjects.length, now() - started);
      throw error;
    }
  }

  function reportSlice(path, subjectCount, durationMs) {
    if (!onBlockingSlice) return;
    try {
      onBlockingSlice({
        kind: 'pipelineAdmissionSync',
        durationMs,
        path,
        subjectCount,
      });
    } catch {
      // Observer errors must not change admission semantics.
    }
  }

  function inactiveOwnerError() {
    const error = new Error('authored pipeline admission owner became inactive');
    error.name = 'AbortError';
    return error;
  }

  function entryInactive(entry) {
    const guard = entry && entry.compileOptions && entry.compileOptions.isActive;
    return typeof guard === 'function' && guard(entry.subject) !== true;
  }

  function batchCompileOptions(batch) {
    const guardsBySubject = new Map();
    for (const entry of batch) {
      let guards = guardsBySubject.get(entry.subject);
      if (!guards) {
        guards = [];
        guardsBySubject.set(entry.subject, guards);
      }
      const guard = entry && entry.compileOptions && entry.compileOptions.isActive;
      guards.push(typeof guard === 'function' ? guard : null);
    }
    return {
      isActive: (subject) => {
        const guards = guardsBySubject.get(subject);
        if (!guards || guards.length === 0) return true;
        for (const guard of guards) {
          if (guard === null || guard(subject) === true) return true;
        }
        return false;
      },
    };
  }

  /** The old compileTail role: resolves once every link started so far has settled. */
  function laneSettled() {
    return tailSettle;
  }

  function enqueueLink(subjects, path, compileOptions, { urgent = false } = {}) {
    let resolveRun;
    const run = new Promise((resolve) => { resolveRun = resolve; });
    const spec = { subjects, path, compileOptions, urgent, resolveRun };
    if (urgent) {
      let pos = linkSpecs.length;
      while (pos > 0 && linkSpecs[pos - 1].urgent === true) pos -= 1;
      linkSpecs.splice(pos, 0, spec);
    } else {
      linkSpecs.push(spec);
    }
    pumpLinks();
    return run;
  }

  function pumpLinks() {
    if (linkActive) return;
    const spec = linkSpecs.shift();
    if (!spec) return;
    linkActive = true;
    const run = Promise.resolve().then(() => invokeCompileBatch(
      spec.subjects, spec.path, spec.compileOptions,
    ));
    observePipelineAdmission(run, onRejected);
    const bounded = Promise.race([
      run,
      new Promise((resolve) => setTimeout(() => resolve(LINK_TAIL_TIMEOUT_RESULT), LINK_RUN_TAIL_TIMEOUT_MS)),
    ]);
    spec.resolveRun(bounded);
    tailSettle = tailSettle.then(() => bounded.catch(() => null));
    const next = () => { linkActive = false; pumpLinks(); };
    bounded.then(next, next);
  }

  function flushQueuedThrough(
    watermark = Number.POSITIVE_INFINITY,
    path = 'queued',
    batchLimit = Number.POSITIVE_INFINITY,
    scheduleRemaining = true,
  ) {
    const batch = [];
    const remaining = [];
    for (const entry of queued) {
      if (entry.id <= watermark && batch.length < batchLimit) {
        if (entryInactive(entry)) {
          entry.reject(inactiveOwnerError());
          continue;
        }
        batch.push(entry);
      } else remaining.push(entry);
    }
    if (batch.length === 0) {
      queued = remaining;
      if (scheduleRemaining && queued.length > 0) scheduleFlush();
      return laneSettled();
    }
    clearTimers();
    queued = remaining;
    const subjects = batch.map((entry) => entry.subject);
    const run = enqueueLink(subjects, path, batchCompileOptions(batch));
    run.then(
      (result) => {
        for (const entry of batch) {
          if (entryInactive(entry)) entry.reject(inactiveOwnerError());
          else entry.resolve(result);
        }
      },
      (error) => { for (const entry of batch) entry.reject(error); },
    );
    if (scheduleRemaining && queued.length > 0) scheduleFlush();
    return run;
  }

  function flushQueued() {
    return flushQueuedThrough(Number.POSITIVE_INFINITY, 'queued');
  }

  function scheduleResumedBatch() {
    if (!boundedResume || resumeScheduled || queued.length === 0) return;
    resumeScheduled = true;
    // A scheduler that runs its callback synchronously (test fakes) must not recurse through the
    // hold poll below; it keeps the pre-poll behaviour of stopping once while deferred.
    let ranSynchronously = true;
    scheduleResume(() => {
      resumeScheduled = false;
      if (deferAutoFlush()) {
        // The auto-flush hold is a DELAY, not a cancellation. Bounded resume used to give up here
        // (and in resumeAutoFlush) whenever it was armed inside the hold: timers were already
        // cleared, nothing was scheduled, and the only thing that could ever wake the lane again
        // was a NEW compile() call. On a sector arrival the queued compiles ARE what the next
        // authored job waits for, so the lane deadlocked and every body in the arriving sector
        // stayed at `presentationAdmission: 'pending'` for the rest of the session.
        if (!ranSynchronously) scheduleResumedBatch();
        return;
      }
      const lastPresentDtMs = typeof options.getLastPresentDtMs === 'function'
        ? options.getLastPresentDtMs()
        : NaN;
      if (!shouldStartHeavyAdmission(lastPresentDtMs) && skippedResumeForLatePresent !== true) {
        skippedResumeForLatePresent = true;
        scheduleResumedBatch();
        return;
      }
      skippedResumeForLatePresent = false;
      observePipelineAdmission(flushResumedBatch());
    });
    ranSynchronously = false;
  }

  function flushResumedBatch() {
    if (deferAutoFlush() || queued.length === 0) return laneSettled();
    const run = flushQueuedThrough(
      Number.POSITIVE_INFINITY,
      'resumed',
      resumeBatchSize,
      false,
    );
    Promise.resolve(run).then(scheduleResumedBatch, scheduleResumedBatch);
    return run;
  }

  function capturePending() {
    const watermark = nextAdmissionId;
    const entries = [...pending].filter((entry) => entry.id <= watermark);
    const plan = Object.freeze({
      watermark,
      pendingCount: entries.length,
    });
    capturedPlans.set(plan, entries);
    return plan;
  }

  function subjectsForCaptured(plan) {
    const entries = capturedPlans.get(plan);
    if (!entries) throw new TypeError('pipeline tracker requires a captured admission plan');
    return Object.freeze([...new Set(entries.map((entry) => entry.subject))]);
  }

  async function waitForCaptured(plan, options = {}) {
    const entries = capturedPlans.get(plan);
    if (!entries) throw new TypeError('pipeline tracker requires a captured admission plan');
    const stale = typeof options.stale === 'function' ? options.stale : null;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs) : null;
    const result = () => ({
      watermark: plan.watermark,
      capturedCount: entries.length,
      remainingCount: pending.size,
    });
    if (stale && stale()) return { ...result(), superseded: true };
    flushQueuedThrough(plan.watermark, 'captured');
    const completions = Promise.all(entries.map((entry) => entry.completion));
    if (timeoutMs == null) {
      await completions;
    } else {
      const outcome = await Promise.race([
        completions.then(() => 'resolved', () => 'rejected'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
      ]);
      if (outcome === 'timeout') return { ...result(), timedOut: true };
      await completions;
    }
    if (stale && stale()) return { ...result(), superseded: true };
    // Exact-root callers advance to residency/publication in their await continuations. Give those
    // already-registered consumers deterministic turns without joining any admission after watermark.
    await Promise.resolve();
    await Promise.resolve();
    return result();
  }

  // Test-only wait: each iteration pays a whole-queue flushQueued() — production
  // waits go through waitForCaptured (watermark-scoped, batch-capped).
  async function waitForPending(options = {}) {
    const stale = typeof options.stale === 'function' ? options.stale : null;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs) : null;
    const deadline = timeoutMs == null ? null : Date.now() + timeoutMs;
    while (pending.size > 0) {
      if (stale && stale()) return { skipped: false, pendingCount: pending.size, superseded: true };
      if (deadline != null && Date.now() >= deadline) {
        return { skipped: false, pendingCount: pending.size, timedOut: true };
      }
      flushQueued();
      const completions = Promise.all([...pending].map((entry) => entry.completion));
      if (deadline == null) {
        await completions;
      } else {
        const outcome = await Promise.race([
          completions.then(() => 'resolved', () => 'rejected'),
          new Promise((resolve) => setTimeout(() => resolve('timeout'), Math.max(0, deadline - Date.now()))),
        ]);
        if (outcome === 'timeout') return { skipped: false, pendingCount: pending.size, timedOut: true };
        await completions;
      }
    }
    // Admission consumers commit their already-built roots in promise continuations. Yield through
    // those continuations before the startup guard is allowed to publish the first flight frame.
    await Promise.resolve();
    await Promise.resolve();
    return { skipped: false, pendingCount: 0 };
  }

  return {
    compile(subject, compileOptions = null) {
      // Urgent entries are on-glass deadline work: the subject serializes on the
      // shared compile tail as its own link — behind whatever is in flight,
      // ahead of everything still queued in the ambient lane — instead of
      // joining the FIFO behind runway/prefetch compiles. skipSharedBatch is
      // forced so the program-readiness wait polls this subject's programs
      // alone instead of pooling into a foreign batch's drain. A queued ambient
      // admission for the same subject folds into this run so its latch settles
      // with it; one already flushed or already urgent is joined, never
      // duplicated. Urgent work does not honour deferAutoFlush or the bounded
      // resume budget — the hold exists to coalesce background compiles, and a
      // root the player can already see cannot pay that wait as a blank frame.
      if (compileOptions && compileOptions.urgent === true) {
        const existingUrgent = urgentRuns.get(subject);
        if (existingUrgent) return existingUrgent;
        let folded = null;
        for (const entry of pending) {
          if (entry.subject !== subject) continue;
          if (!queued.includes(entry)) return entry.completion;
          folded = entry;
          break;
        }
        if (folded) queued.splice(queued.indexOf(folded), 1);
        const run = enqueueLink(
          [subject],
          'urgent',
          { ...compileOptions, skipSharedBatch: true },
          { urgent: true },
        );
        urgentRuns.set(subject, run);
        run.then(
          (result) => {
            if (!folded) return;
            if (entryInactive(folded)) folded.reject(inactiveOwnerError());
            else folded.resolve(result);
          },
          (error) => { if (folded) folded.reject(error); },
        ).finally(() => urgentRuns.delete(subject));
        return run;
      }
      let resolve;
      let reject;
      const compilation = new Promise((res, rej) => { resolve = res; reject = rej; });
      const entry = {
        id: ++nextAdmissionId,
        subject,
        compileOptions: compileOptions || null,
        resolve,
        reject,
        completion: null,
      };
      entry.completion = compilation.finally(() => {
        pending.delete(entry);
        settledAdmissions += 1;
      });
      // A queued consumer may retire before its scheduled batch runs. Observe the cleanup child
      // now without replacing it: an awaited owner must still receive the original rejection.
      observePipelineAdmission(entry.completion);
      pending.add(entry);
      queued.push(entry);
      scheduleFlush();
      return entry.completion;
    },
    capturePending,
    subjectsForCaptured,
    waitForCaptured,
    compileExplicit(subject, compileOptions = null) {
      // Diagnostics may deliberately compile a complete installed scene after a render-target
      // switch. Keep that opt-in pass serialized, but never attach the startup moving-fixpoint wait.
      // The explicit caller is deadline work: fold the still-queued ambient set into this run
      // instead of flushing it as a separate tail link the deadline then has to sit behind.
      const ambient = [];
      for (const entry of queued) {
        if (entryInactive(entry)) entry.reject(inactiveOwnerError());
        else ambient.push(entry);
      }
      queued = [];
      clearTimers();
      const explicitEntry = { subject, compileOptions: compileOptions || null };
      const merged = [...new Set([subject, ...ambient.map((entry) => entry.subject)])];
      const mergedOptions = {
        ...(compileOptions || {}),
        ...batchCompileOptions([explicitEntry, ...ambient]),
      };
      const run = enqueueLink(merged, 'explicit', mergedOptions, { urgent: true });
      run.then(
        (result) => {
          for (const entry of ambient) {
            if (entryInactive(entry)) entry.reject(inactiveOwnerError());
            else entry.resolve(result);
          }
        },
        (error) => { for (const entry of ambient) entry.reject(error); },
      );
      return observePipelineAdmission(run.then((result) => {
        if (entryInactive(explicitEntry)) throw inactiveOwnerError();
        return result;
      }));
    },

    resumeAutoFlush() {
      boundedResume = true;
      clearTimers();
      if (deferAutoFlush()) {
        // Resuming inside the hold must leave the lane alive: clearTimers() just removed the only
        // thing that would have re-entered it. Poll the hold instead of returning a dead queue.
        scheduleResumedBatch();
        return laneSettled();
      }
      return observePipelineAdmission(flushResumedBatch());
    },
    waitForPending,
    flushOneAfterPresent() {
      // The empty lane reuses its already-observed tail without allocating on every present.
      if (queued.length === 0) return laneSettled();
      return observePipelineAdmission(flushQueuedThrough(Number.POSITIVE_INFINITY, 'after-present', 1, true));
    },
    get pendingCount() { return pending.size; },
    /** Admissions not yet handed to compileBatch (the rest of pendingCount is linking). */
    get queuedCount() { return queued.length; },
    get settledCount() { return settledAdmissions; },
  };
}

export function observePipelineAdmission(promise, onRejected = null) {
  Promise.resolve(promise).then(undefined, (error) => {
    if (error && error.name === 'AbortError') return;
    if (typeof onRejected !== 'function') return;
    try {
      onRejected(error);
    } catch { }
  });
  return promise;
}

/** Track authored-root GPU uploads independently from shader compilation. The loading route flushes
 * deferred shader batches before flight; texture uploads begin in the resolved compile continuations
 * and can otherwise outlive that flush. Exposing one aggregate promise lets startup wait for the
 * exact roots to finish residency and publish, without coupling the renderer to boundary internals. */
export function createGpuResidencyAdmissionTracker(prepare) {
  if (typeof prepare !== 'function') throw new TypeError('GPU residency tracker requires prepare()');
  const pending = new Set();
  const pendingBySubject = new Map();
  const capturedPlans = new WeakMap();
  let nextAdmissionId = 0;

  function captureEntries(entries, pendingCount, extra = {}) {
    const plan = Object.freeze({
      watermark: nextAdmissionId,
      pendingCount,
      ...extra,
    });
    capturedPlans.set(plan, entries);
    return plan;
  }

  function capturePending() {
    const watermark = nextAdmissionId;
    const entries = [...pending].filter((entry) => entry.id <= watermark);
    return captureEntries(entries, entries.length);
  }

  function captureSubjects(subjects) {
    const uniqueSubjects = [...new Set(Array.isArray(subjects) ? subjects : [])];
    const entries = uniqueSubjects.flatMap((subject) => [...(pendingBySubject.get(subject) || [])]);
    return captureEntries(entries, entries.length, {
      boundSubjectCount: uniqueSubjects.length,
    });
  }

  async function waitForCaptured(plan, options = {}) {
    const entries = capturedPlans.get(plan);
    if (!entries) throw new TypeError('GPU residency tracker requires a captured admission plan');
    const stale = typeof options.stale === 'function' ? options.stale : null;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs) : null;
    const result = () => ({
      watermark: plan.watermark,
      capturedCount: entries.length,
      remainingCount: pending.size,
    });
    if (stale && stale()) return { ...result(), superseded: true };
    const completions = Promise.all(entries.map((entry) => entry.completion));
    if (timeoutMs == null) {
      await completions;
    } else {
      const outcome = await Promise.race([
        completions.then(() => 'resolved', () => 'rejected'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
      ]);
      if (outcome === 'timeout') return { ...result(), timedOut: true };
      await completions;
    }
    if (stale && stale()) return { ...result(), superseded: true };
    await Promise.resolve();
    await Promise.resolve();
    return result();
  }

  // Test-only wait: each iteration pays a whole-queue flushQueued() — production
  // waits go through waitForCaptured (watermark-scoped, batch-capped).
  async function waitForPending(options = {}) {
    const stale = typeof options.stale === 'function' ? options.stale : null;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs) : null;
    const deadline = timeoutMs == null ? null : Date.now() + timeoutMs;
    while (pending.size > 0) {
      if (stale && stale()) return { skipped: false, pendingCount: pending.size, superseded: true };
      if (deadline != null && Date.now() >= deadline) {
        return { skipped: false, pendingCount: pending.size, timedOut: true };
      }
      const completions = Promise.all([...pending].map((entry) => entry.completion));
      if (deadline == null) {
        await completions;
      } else {
        const outcome = await Promise.race([
          completions.then(() => 'resolved', () => 'rejected'),
          new Promise((resolve) => setTimeout(() => resolve('timeout'), Math.max(0, deadline - Date.now()))),
        ]);
        if (outcome === 'timeout') return { skipped: false, pendingCount: pending.size, timedOut: true };
        await completions;
      }
    }
    // Boundary admission commits in the await continuation registered before this aggregate wait.
    // Give that continuation a deterministic turn before startup checks committed visual readiness.
    await Promise.resolve();
    await Promise.resolve();
    return { skipped: false, pendingCount: 0 };
  }

  return {
    prepare(subject, options = {}) {
      const preparation = Promise.resolve().then(() => prepare(subject, options));
      const entry = {
        id: ++nextAdmissionId,
        subject,
        completion: null,
      };
      entry.completion = preparation.finally(() => {
        pending.delete(entry);
        const entries = pendingBySubject.get(subject);
        if (entries) {
          entries.delete(entry);
          if (entries.size === 0) pendingBySubject.delete(subject);
        }
      });
      pending.add(entry);
      let entries = pendingBySubject.get(subject);
      if (!entries) {
        entries = new Set();
        pendingBySubject.set(subject, entries);
      }
      entries.add(entry);
      return entry.completion;
    },
    capturePending,
    captureSubjects,
    waitForCaptured,
    waitForPending,
    // Outstanding upload for a subject, if one is queued or running. Callers that
    // would queue a second walk for the same root join the existing entry instead.
    pendingFor(subject) {
      const entries = pendingBySubject.get(subject);
      if (!entries || entries.size === 0) return null;
      return Promise.all([...entries].map((entry) => entry.completion));
    },
    get pendingCount() { return pending.size; },
  };
}

/**
 * Gate flight on both the procedural shader probes and the exact material graph currently installed
 * in the scene. The second phase is intentionally invoked only after authored visual readiness:
 * compiling before GLB composition exists merely warms a different set of program keys.
 */
export async function waitForCurrentRenderPipelines(state, timeoutMs = 20000) {
  const render = state && state.render;
  if (!render) return true;

  const procedural = render.pipelinePrecompileReady;
  if (procedural && typeof procedural.then === 'function') {
    const result = await settleWithin(procedural, timeoutMs);
    if (!result.ok) return false;
  }
  if (gpuContextIsLost(state)) return false;
  // Same-sector F9 recook: the opening receipt and GPU programs are already
  // resident. Recapturing first-picture compiled 37 extra programs on the next
  // present (~4s stall / TDR, headed skip-cook run65).
  if (state.mode === 'loading'
      && render.sessionLiveSectorCookedId
      && render.sessionLiveSectorCookedId === (state.world && state.world.currentSectorId)) {
    return true;
  }

  const capturePipelines = render.captureOpeningPipelinePlan;
  const drainPipelines = render.drainOpeningPipelinePlan;
  const captureResidency = render.captureOpeningGpuResidencyPlan;
  const drainResidency = render.drainOpeningGpuResidencyPlan;
  const captureSubmission = render.captureOpeningSubmissionPlan;
  const drainSubmission = render.drainOpeningSubmissionPlan;
  const prepareOpeningFirstPicture = render.prepareOpeningFirstPicture;
  const loadingOwnsOpeningSubmission = state.mode === 'loading';
  if (!loadingOwnsOpeningSubmission
    && (typeof capturePipelines === 'function') !== (typeof drainPipelines === 'function')) return false;
  if (!loadingOwnsOpeningSubmission
    && (typeof captureResidency === 'function') !== (typeof drainResidency === 'function')) return false;
  if ((typeof captureSubmission === 'function') !== (typeof drainSubmission === 'function')) return false;
  let pipelinePlan = null;
  if (!loadingOwnsOpeningSubmission) {
    try {
      // Non-loading callers retain the ordinary finite root watermark. Loading deliberately skips
      // this broad queue: exact first-picture leaves are the only startup pipeline admission.
      if (typeof capturePipelines === 'function') pipelinePlan = capturePipelines();
    } catch {
      return false;
    }
    const exact = Promise.resolve().then(() => drainPipelines(pipelinePlan));
    render.exactPipelineWarmupReady = exact;
    const result = await settleWithin(exact, timeoutMs);
    if (!result.ok) return false;
    if (gpuContextIsLost(state)) return false;
  }

  // The exact first-picture plan is captured only after authored boundary continuations have
  // committed. It compiles the live flat draw leaves (background, parallax, player, and any
  // currently instantiated first-frame VFX) against the production target without rendering a
  // hidden scene-wide discovery frame.
  if (typeof captureSubmission === 'function') {
    if (loadingOwnsOpeningSubmission && typeof prepareOpeningFirstPicture === 'function') {
      const prepared = await settleWithin(
        Promise.resolve().then(async () => {
          const result = await prepareOpeningFirstPicture(timeoutMs);
          if (result === false) throw new Error('opening first-picture preparation failed');
          return result;
        }),
        timeoutMs,
      );
      if (!prepared.ok || gpuContextIsLost(state)) return false;
    }
    let submissionPlan = null;
    try {
      const captureSteps = render.captureOpeningSubmissionPlanSteps;
      if (typeof captureSteps === 'function') {
        // The capture is a chain of whole-scene censuses; pace its stepped legs
        // under the boot yield instead of donating one atomic window.
        const steps = captureSteps();
        for (;;) {
          const step = steps.next();
          if (step.done) {
            submissionPlan = step.value;
            break;
          }
          await yieldToBrowser();
        }
      } else {
        submissionPlan = captureSubmission();
      }
      if (!submissionPlan || submissionPlan.complete !== true
        || !submissionPlan.firstPlayablePipelineSet
        || submissionPlan.firstPlayablePipelineSet.complete !== true) return false;
    } catch {
      return false;
    }
    const submission = Promise.resolve().then(() => drainSubmission(submissionPlan));
    render.openingSubmissionReady = submission;
    if (loadingOwnsOpeningSubmission) render.exactPipelineWarmupReady = submission;
    const submissionResult = await settleWithin(submission, timeoutMs);
    if (!submissionResult.ok) return false;
    if (gpuContextIsLost(state)) return false;
  }

  // The exact first picture is compiled. Remaining sector/NPC programs used to skip this
  // gate, then link inside the first flight bloomScene pass (~460 ms each on Intel/ANGLE
  // without KHR_parallel_shader_compile). Drain them now, still behind the loading shell.
  if (loadingOwnsOpeningSubmission && typeof render.preparePostOpeningPipelines === 'function') {
    const remaining = Promise.resolve().then(() => render.preparePostOpeningPipelines());
    render.postOpeningPipelinesReady = remaining;
    const remainingResult = await settleWithin(remaining, timeoutMs);
    if (!remainingResult.ok) return false;
    if (gpuContextIsLost(state)) return false;
  }

  // The live-sector cook (programs + buffers) belongs in
  // prepareLiveSectorBeforeFlight / prepareLiveSectorAfterJump. A second
  // cookLiveSceneGpu here 1x1s the whole scene (skipBuffers defaults off).
  // On F9 that re-uploaded the previous flight's VFX/hulls and TDR'd Intel
  // during gpu-resources. Dummy catalog prewarm is not this step.
  if (loadingOwnsOpeningSubmission
      && typeof render.prepareLiveSectorBeforeFlight !== 'function') {
    const liveCook = Promise.resolve().then(() => cookLiveSceneGpu(state));
    render.liveSceneCookReady = liveCook;
    const liveResult = await settleWithin(liveCook, timeoutMs);
    if (!liveResult.ok) return false;
    if (gpuContextIsLost(state)) return false;
  }

  if (typeof captureResidency === 'function' && !loadingOwnsOpeningSubmission) {
    let residencyPlan = null;
    try {
      residencyPlan = captureResidency(pipelinePlan);
    } catch {
      return false;
    }
    const residency = Promise.resolve().then(() => drainResidency(residencyPlan));
    render.authoredGpuAdmissionReady = residency;
    const residencyResult = await settleWithin(residency, timeoutMs);
    if (!residencyResult.ok) return false;
  }
  return gpuContextIsLost(state) !== true;
}

const WALL_CLOCK_SKIP_REASONS = new Set([
  'loading-budget',
  'loading-deadline',
  'loading-deadline-partial',
  'timeout',
]);

function admissionErrorText(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message) return error.message;
  return String(error);
}

function packageIdFromText(text) {
  const named = String(text || '').match(/\b((?:ship|station|asset|pkg|package)_[A-Za-z0-9_]+)\b/);
  return named ? named[1] : null;
}

function admissionPackageId(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.packageId === 'string' && value.packageId) return value.packageId;
  if (typeof value.assetId === 'string' && value.assetId) return value.assetId;
  const wrapped = value.package;
  if (wrapped && typeof wrapped === 'object') {
    if (typeof wrapped.assetId === 'string' && wrapped.assetId) return wrapped.assetId;
    if (typeof wrapped.id === 'string' && wrapped.id) return wrapped.id;
  }
  return null;
}

function isProceduralStandIn(value) {
  if (!value || typeof value !== 'object') return false;
  return [value.reason, value.status, value.authoredAssetState, value.fallback, value.primitive]
    .some((mark) => mark === 'procedural-settled' || mark === 'cube' || mark === 'empty' || mark === 'empty-success');
}

function isNullPackage(value) {
  if (value == null) return true;
  if (typeof value !== 'object') return true;
  return value.packageId === null || value.package === null;
}

/** Resume an accepted record without inventing a null id, which reads as a missing package. */
function acceptedResumeValue(record) {
  const value = { skipped: false };
  const packageId = admissionPackageId(record);
  if (packageId) value.packageId = packageId;
  return value;
}

function isOpeningPlanIncomplete(value) {
  return !!(value && typeof value === 'object' && value.skipped === true && value.reason === 'opening-plan-incomplete');
}

function isWallClockSkip(value) {
  return !!(value && typeof value === 'object' && value.skipped === true && WALL_CLOCK_SKIP_REASONS.has(value.reason));
}

/**
 * One required opening package is only pending, rejected, superseded, or accepted.
 * `ready` is true solely for accepted. A timeout is pending. A known failure stays
 * rejected for that generation. A mismatched generation publishes nothing.
 */
export function classifyRequiredPackageAdmission(attempt = {}) {
  const capturedGeneration = attempt.capturedGeneration;
  const currentGeneration = attempt.currentGeneration;
  const existing = attempt.existing || null;
  const settled = attempt.settled || null;
  const failedId = settled && settled.ok === false ? packageIdFromText(admissionErrorText(settled.error)) : null;
  const valueId = admissionPackageId(settled && settled.value);

  if (capturedGeneration !== currentGeneration) {
    return {
      status: 'superseded',
      ready: false,
      packageId: failedId || valueId || (existing && existing.packageId) || null,
      reason: 'a newer run replaced this admission',
      publish: false,
      releaseOwn: true,
    };
  }

  if (existing && existing.status === 'rejected' && existing.generation === capturedGeneration) {
    return {
      status: 'rejected',
      ready: false,
      packageId: existing.packageId || null,
      reason: existing.reason || 'required package was rejected',
      publish: false,
      releaseOwn: false,
    };
  }

  if (attempt.canceledStamp === true) {
    return {
      status: 'rejected',
      ready: false,
      packageId: null,
      reason: 'this sector cook belongs to a canceled run',
      publish: true,
      releaseOwn: false,
    };
  }

  if (!settled || settled.timeout === true) {
    return {
      status: 'pending',
      ready: false,
      packageId: (existing && existing.packageId) || null,
      reason: 'opening package has not settled',
      publish: true,
      releaseOwn: false,
      resumeAccepted: attempt.resumeAccepted === true,
    };
  }

  if (settled.ok === false) {
    const reason = admissionErrorText(settled.error) || 'required package failed';
    return {
      status: 'rejected',
      ready: false,
      packageId: packageIdFromText(reason),
      reason,
      publish: true,
      releaseOwn: false,
    };
  }

  const value = settled.value;
  if (isOpeningPlanIncomplete(value) || isWallClockSkip(value)) {
    return {
      status: 'pending',
      ready: false,
      packageId: admissionPackageId(value),
      reason: value && value.reason ? String(value.reason) : 'opening-plan-incomplete',
      publish: false,
      continueOpening: true,
      releaseOwn: false,
    };
  }

  if (attempt.resumeAccepted === true && value && typeof value === 'object' && value.skipped !== true
      && !isProceduralStandIn(value) && !isNullPackage(value)) {
    return {
      status: 'accepted',
      ready: true,
      packageId: admissionPackageId(value) || (existing && existing.packageId) || null,
      reason: '',
      publish: true,
      releaseOwn: false,
    };
  }

  if (isNullPackage(value) || isProceduralStandIn(value) || (value && value.ok === false) || (value && value.skipped === true)) {
    const reason = (value && (value.reason || value.status))
      || (value == null ? 'required package is missing' : 'required package was not accepted');
    return {
      status: 'rejected',
      ready: false,
      packageId: admissionPackageId(value) || packageIdFromText(reason),
      reason: String(reason),
      publish: true,
      releaseOwn: false,
    };
  }

  return {
    status: 'accepted',
    ready: true,
    packageId: admissionPackageId(value),
    reason: '',
    publish: true,
    releaseOwn: false,
  };
}

function rememberRequiredPackageAdmission(render, capturedGeneration, classification) {
  if (!render || !classification || classification.publish !== true) return false;
  if (render.admissionRunGeneration !== capturedGeneration) return false;
  const existing = render.requiredPackageAdmission;
  if (existing && existing.status === 'rejected' && existing.generation === capturedGeneration
      && classification.status !== 'rejected') {
    return false;
  }
  const record = {
    status: classification.status,
    ready: classification.status === 'accepted' && classification.ready === true,
    packageId: classification.packageId || (existing && existing.packageId) || null,
    reason: classification.reason || '',
    generation: capturedGeneration,
  };
  if (classification.resumeAccepted === true) record.resumeAccepted = true;
  if (classification.continueOpening === true) record.continueOpening = true;
  render.requiredPackageAdmission = record;
  return true;
}

export function commitRequiredPackageAdmission(render, capturedGeneration, classification) {
  return rememberRequiredPackageAdmission(render, capturedGeneration, classification);
}

/**
 * After a pending opening wait, classify the promises already stored on the render state.
 * No new timer: a cook that has not settled stays pending, and a late result whose
 * generation changed writes nothing.
 */
// This path fires exactly when the bounded gates already judged the cook too slow — awaiting
// the same cook's real completion would park embark for minutes on a contended host with no
// rejection route. The settle borrows the gate's own contract: bounded, then classify.
const REQUIRED_PACKAGE_SETTLE_TIMEOUT_MS = 45000;

export async function settleRequiredPackageAdmission(state) {
  const render = state && state.render;
  if (!render) return null;
  const generation = render.admissionRunGeneration;
  const existing = render.requiredPackageAdmission || null;
  const preparePromise = render.openingGpuResidencyReady;
  const livePromise = render.liveScenePresentReady;
  let prepareSettled = null;
  if (preparePromise && typeof preparePromise.then === 'function') {
    prepareSettled = await settleWithin(preparePromise, REQUIRED_PACKAGE_SETTLE_TIMEOUT_MS);
  }
  let liveSettled = null;
  if (livePromise && typeof livePromise.then === 'function') {
    liveSettled = await settleWithin(livePromise, REQUIRED_PACKAGE_SETTLE_TIMEOUT_MS);
  }
  if (render.admissionRunGeneration !== generation) {
    return classifyRequiredPackageAdmission({
      capturedGeneration: generation,
      currentGeneration: render.admissionRunGeneration,
      existing: render.requiredPackageAdmission,
      settled: prepareSettled,
    });
  }
  const resumeAccepted = !!(existing && (existing.status === 'accepted' || existing.resumeAccepted === true));
  let classification;
  if (prepareSettled && prepareSettled.ok === false) {
    classification = classifyRequiredPackageAdmission({
      capturedGeneration: generation,
      currentGeneration: render.admissionRunGeneration,
      existing,
      settled: prepareSettled,
    });
  } else if (liveSettled && liveSettled.ok === false) {
    classification = classifyRequiredPackageAdmission({
      capturedGeneration: generation,
      currentGeneration: render.admissionRunGeneration,
      existing,
      settled: liveSettled,
    });
  } else {
    const settled = prepareSettled && prepareSettled.ok === true
      ? prepareSettled
      : (resumeAccepted
        ? { ok: true, value: acceptedResumeValue(existing) }
        : { timeout: true });
    classification = classifyRequiredPackageAdmission({
      capturedGeneration: generation,
      currentGeneration: render.admissionRunGeneration,
      existing,
      settled,
      resumeAccepted,
    });
  }
  if (classification && classification.continueOpening === true && (!liveSettled || liveSettled.ok === true)) {
    if (existing && existing.status === 'pending' && existing.generation === generation) {
      render.requiredPackageAdmission = null;
    }
    return {
      status: 'pending',
      ready: false,
      continueOpening: true,
      packageId: classification.packageId || null,
      reason: classification.reason || 'opening-plan-incomplete',
    };
  }
  rememberRequiredPackageAdmission(render, generation, classification);
  return render.requiredPackageAdmission || classification;
}

export async function waitForOpeningGpuResources(state, timeoutMs = 20000, options = {}) {
  const render = state && state.render;
  const sectorId = state && state.world && state.world.currentSectorId;
  const capturedGeneration = render ? render.admissionRunGeneration : undefined;
  const generationNow = () => (render ? render.admissionRunGeneration : undefined);
  const sameGeneration = () => generationNow() === capturedGeneration;
  const resident = !!(render
    && render.requiredPackageAdmission
    && render.requiredPackageAdmission.status === 'accepted'
    && render.requiredPackageAdmission.ready === true
    && render.requiredPackageAdmission.generation === capturedGeneration
    && render.sessionLiveSectorCookedId
    && render.sessionLiveSectorCookedId === sectorId
    && gpuContextIsLost(state) !== true);
  const bareStamp = !!(render
    && !resident
    && render.sessionLiveSectorCookedId
    && sectorId
    && render.sessionLiveSectorCookedId === sectorId
    && gpuContextIsLost(state) !== true);
  const prepare = render && render.prepareOpeningGpuResources;
  const ledger = beginOpeningCookLedger(render, resident ? 'opening-recook' : 'opening');
  const stopLaneSampler = startOpeningCookLaneSampler(render);
  let ledgerFinished = false;
  const finishLedger = () => {
    if (ledgerFinished) return;
    ledgerFinished = true;
    stopLaneSampler();
    logOpeningCookLedger(ledger);
  };
  const publish = (classification) => rememberRequiredPackageAdmission(render, capturedGeneration, classification);
  // Callers that await this gate opt in to the composition-tail settle so every
  // path that holds the shell (New Game and Continue alike) finishes the serial
  // lane's open composes/compiles/uploads behind it. Fire-and-forget callers omit
  // it — a settle after the shell released would land the same work in flight the
  // settle exists to keep out.
  const settleTail = async () => {
    if (options.settleTail !== true || !(state && state.mode === 'loading')) return;
    const tailStarted = ledgerNow();
    const tail = await settleOpeningCompositionTail(state, { budgetMs: 20000 });
    if (render) render.openingCompositionTail = tail;
    recordOpeningCookStep(render, 'opening.compositionTail', tailStarted,
      tail && tail.skipped === true ? 'skipped' : 'resolved');
  };
  let prepareClassification = null;
  let prepareValue = null;

  if (bareStamp) {
    const stamped = render.requiredPackageAdmission;
    const ownedHere = !!(stamped && stamped.generation === capturedGeneration);
    // A timeout or rejection already recorded for this run stays that status. A stamp
    // from another run is not acceptance and not a refusal: this run still prepares.
    if (ownedHere && (stamped.status === 'pending' || stamped.status === 'rejected')) {
      recordOpeningCookStep(render, 'wait.prepareOpeningGpuResources', ledgerNow(), 'skipped', {
        reason: stamped.status === 'pending' ? 'pending-run' : 'rejected-run',
      });
      finishLedger();
      return false;
    }
  }

  if (!resident && typeof prepare === 'function') {
    const prepareStarted = ledgerNow();
    const preparePromise = Promise.resolve().then(() => prepare());
    if (sameGeneration()) render.openingGpuResidencyReady = preparePromise;
    const result = await settleWithin(preparePromise, timeoutMs);
    recordOpeningCookStep(render, 'wait.prepareOpeningGpuResources', prepareStarted, settleOutcome(result));
    if (!sameGeneration()) {
      if (render.openingGpuResidencyReady === preparePromise) render.openingGpuResidencyReady = null;
      finishLedger();
      return false;
    }
    if (gpuContextIsLost(state)) {
      finishLedger();
      return false;
    }
    prepareValue = result && result.ok === true ? result.value : null;
    prepareClassification = classifyRequiredPackageAdmission({
      capturedGeneration,
      currentGeneration: generationNow(),
      existing: render.requiredPackageAdmission,
      settled: result,
    });
    if (prepareClassification.releaseOwn && render.openingGpuResidencyReady === preparePromise) {
      render.openingGpuResidencyReady = null;
    }
    if (prepareClassification.publish === true && prepareClassification.status === 'rejected') {
      publish(prepareClassification);
    } else if (prepareClassification.publish === true
        && prepareClassification.status === 'pending'
        && prepareClassification.continueOpening !== true) {
      publish(prepareClassification);
    }
    if (prepareClassification.status === 'superseded') {
      finishLedger();
      return false;
    }
  } else {
    recordOpeningCookStep(render, 'wait.prepareOpeningGpuResources', ledgerNow(), 'skipped', {
      reason: resident ? 'session-recook' : 'unavailable',
    });
  }
  // Maps and geometries just landed. Publish the held next-sector upgrades,
  // drain their compiles, and touch the live materials so first flight bloom
  // is not the first ANGLE draw of those keys.
  // Same-sector F9 recook skips the opening 1x1; programs/buffers are resident.
  // That shortcut runs only after this generation already accepted the package.
  // A stamp this generation did not accept is not a shortcut and not a refusal.
  if (!(state && state.mode === 'loading')) {
    finishLedger();
    if (prepareClassification && prepareClassification.status === 'rejected') return false;
    if (prepareClassification && prepareClassification.status === 'pending'
        && prepareClassification.continueOpening !== true) return false;
    return gpuContextIsLost(state) !== true;
  }
  if (!sameGeneration()) {
    finishLedger();
    return false;
  }
  const presentStarted = ledgerNow();
  const presentCook = Promise.resolve().then(() => (
    typeof render.prepareLiveSectorBeforeFlight === 'function'
      ? render.prepareLiveSectorBeforeFlight()
      : cookLiveSceneGpu(state, { present: true, skipBuffers: true })
  ));
  if (sameGeneration()) render.liveScenePresentReady = presentCook;
  // PQ-210.00 — a survival arena cooks its whole bounded field (hulls, promoted rock
  // variants, site props) behind this wait; the default 20 s window routinely truncates it
  // on a busy host, and the overflow lands inside the fight at the deferred-hold release.
  // The inner prepare budget is already the survival-aware one (60 s) but the settle, queue
  // drain, post-opening sweep and pool census each carry their own cap on top of it — a
  // contended host can spend ~2x that before the last pipeline lands. Give the gate room
  // for the whole sequence so the shell is what pays, not the round. PQ-210.02 gives the
  // open route the same margin: its prepare budget is 40 s and the tail steps sit on top
  // of it, so a 20 s gate still releases mid-cook. 120 s is the bounded ceiling — a fast
  // host finishes early, a wedged cook still fails open.
  const presentBudgetMs = state && state.run && state.run.kind === 'survival'
    ? Math.max(timeoutMs, 360000)
    : Math.max(timeoutMs, 120000);
  const presentResult = await settleWithin(presentCook, presentBudgetMs);
  const presentOutcome = settleOutcome(presentResult);
  recordOpeningCookStep(render, 'wait.prepareLiveSectorBeforeFlight', presentStarted, presentOutcome);
  if (presentOutcome === 'timeout') {
    // The gate stopped waiting but the cook keeps running into flight; log it when it really ends.
    presentCook.then(finishLedger, finishLedger);
  } else {
    finishLedger();
  }
  if (!sameGeneration()) {
    if (render.liveScenePresentReady === presentCook) render.liveScenePresentReady = null;
    return false;
  }
  const lost = gpuContextIsLost(state) === true;
  if (prepareClassification && prepareClassification.status === 'rejected') return false;
  if (prepareClassification && prepareClassification.status === 'pending'
      && prepareClassification.continueOpening !== true) return false;
  if (prepareClassification && prepareClassification.continueOpening === true) {
    if (!presentResult.ok || lost) return false;
    if (render.requiredPackageAdmission && render.requiredPackageAdmission.generation !== capturedGeneration) {
      render.requiredPackageAdmission = null;
    }
    await settleTail();
    return true;
  }
  if (!resident && !prepareClassification) {
    if (!presentResult.ok || lost) return false;
    await settleTail();
    return true;
  }
  if (!presentResult.ok || lost) {
    const existingAdmission = render.requiredPackageAdmission;
    const acceptedHere = !!(existingAdmission
      && existingAdmission.status === 'accepted'
      && existingAdmission.generation === capturedGeneration);
    // A live-sector timeout must not demote an acceptance this generation already recorded.
    if (presentResult && presentResult.timeout === true && !acceptedHere) {
      publish(classifyRequiredPackageAdmission({
        capturedGeneration,
        currentGeneration: generationNow(),
        existing: existingAdmission,
        settled: { timeout: true },
        resumeAccepted: false,
      }));
    }
    return false;
  }
  const accepted = classifyRequiredPackageAdmission({
    capturedGeneration,
    currentGeneration: generationNow(),
    existing: render.requiredPackageAdmission,
    settled: {
      ok: true,
      value: resident ? acceptedResumeValue(render.requiredPackageAdmission) : prepareValue,
    },
    resumeAccepted: resident,
  });
  if (accepted.status !== 'accepted' || !sameGeneration()) return false;
  publish(accepted);
  const record = render.requiredPackageAdmission;
  const ready = !!(record && record.status === 'accepted' && record.ready === true && sameGeneration());
  if (ready) await settleTail();
  return ready;
}
