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
  return new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), ms));
}

async function settleWithin(promise, timeoutMs) {
  return Promise.race([
    Promise.resolve(promise).then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error }),
    ),
    timeout(timeoutMs),
  ]);
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
        if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
        return setTimeout(callback, 16);
      };
  const deferAutoFlush = typeof options.deferAutoFlush === 'function'
    ? options.deferAutoFlush
    : () => false;
  const onBlockingSlice = typeof options.onBlockingSlice === 'function'
    ? options.onBlockingSlice
    : null;
  const now = typeof options.now === 'function'
    ? options.now
    : () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now());
  const pending = new Set();
  const capturedPlans = new WeakMap();
  let queued = [];
  let quietTimer = null;
  let maxTimer = null;
  let compileTail = Promise.resolve();
  let nextAdmissionId = 0;
  let boundedResume = false;
  let resumeScheduled = false;

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
    quietTimer = setTimeout(() => { void flushQueued(); }, quietMs);
    if (maxTimer == null) maxTimer = setTimeout(() => { void flushQueued(); }, maxWaitMs);
  }

  /** Time only the synchronous compileBatch call (until it returns a value/promise). */
  function invokeCompileBatch(subjects, path) {
    // Optional observer is inert: no clock reads or metadata when nothing is listening.
    if (!onBlockingSlice) return compileBatch(subjects);
    const started = now();
    try {
      const result = compileBatch(subjects);
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

  function flushQueuedThrough(
    watermark = Number.POSITIVE_INFINITY,
    path = 'queued',
    batchLimit = Number.POSITIVE_INFINITY,
    scheduleRemaining = true,
  ) {
    const batch = [];
    const remaining = [];
    for (const entry of queued) {
      if (entry.id <= watermark && batch.length < batchLimit) batch.push(entry);
      else remaining.push(entry);
    }
    if (batch.length === 0) return compileTail;
    clearTimers();
    queued = remaining;
    const subjects = batch.map((entry) => entry.subject);
    const run = compileTail.then(() => invokeCompileBatch(subjects, path));
    // Render-target selection is global renderer state. Keep batches serialized even if a second
    // runway fills while the first one is still waiting on the graphics driver.
    compileTail = run.catch(() => null);
    run.then(
      (result) => { for (const entry of batch) entry.resolve(result); },
      (error) => { for (const entry of batch) entry.reject(error); },
    );
    if (scheduleRemaining && queued.length > 0) scheduleFlush();
    return run;
  }

  function flushQueued() {
    return flushQueuedThrough(Number.POSITIVE_INFINITY, 'queued');
  }

  function scheduleResumedBatch() {
    if (!boundedResume || resumeScheduled || deferAutoFlush() || queued.length === 0) return;
    resumeScheduled = true;
    scheduleResume(() => {
      resumeScheduled = false;
      void flushResumedBatch();
    });
  }

  function flushResumedBatch() {
    if (deferAutoFlush() || queued.length === 0) return compileTail;
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

  async function waitForCaptured(plan) {
    const entries = capturedPlans.get(plan);
    if (!entries) throw new TypeError('pipeline tracker requires a captured admission plan');
    flushQueuedThrough(plan.watermark, 'captured');
    await Promise.all(entries.map((entry) => entry.completion));
    // Exact-root callers advance to residency/publication in their await continuations. Give those
    // already-registered consumers deterministic turns without joining any admission after watermark.
    await Promise.resolve();
    await Promise.resolve();
    return {
      watermark: plan.watermark,
      capturedCount: entries.length,
      remainingCount: pending.size,
    };
  }

  async function waitForPending() {
    while (pending.size > 0) {
      flushQueued();
      await Promise.all([...pending].map((entry) => entry.completion));
    }
    // Admission consumers commit their already-built roots in promise continuations. Yield through
    // those continuations before the startup guard is allowed to publish the first flight frame.
    await Promise.resolve();
    await Promise.resolve();
    return { skipped: false, pendingCount: 0 };
  }

  return {
    compile(subject) {
      let resolve;
      let reject;
      const compilation = new Promise((res, rej) => { resolve = res; reject = rej; });
      const entry = {
        id: ++nextAdmissionId,
        subject,
        resolve,
        reject,
        completion: null,
      };
      entry.completion = compilation.finally(() => pending.delete(entry));
      pending.add(entry);
      queued.push(entry);
      scheduleFlush();
      return entry.completion;
    },
    capturePending,
    subjectsForCaptured,
    waitForCaptured,
    compileExplicit(subject) {
      // Diagnostics may deliberately compile a complete installed scene after a render-target
      // switch. Keep that opt-in pass serialized, but never attach the startup moving-fixpoint wait.
      flushQueued();
      const run = compileTail.then(() => invokeCompileBatch([subject], 'explicit'));
      compileTail = run.catch(() => null);
      return run;
    },
    resumeAutoFlush() {
      boundedResume = true;
      clearTimers();
      if (deferAutoFlush()) return compileTail;
      return flushResumedBatch();
    },
    waitForPending,
    get pendingCount() { return pending.size; },
  };
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

  async function waitForCaptured(plan) {
    const entries = capturedPlans.get(plan);
    if (!entries) throw new TypeError('GPU residency tracker requires a captured admission plan');
    await Promise.all(entries.map((entry) => entry.completion));
    await Promise.resolve();
    await Promise.resolve();
    return {
      watermark: plan.watermark,
      capturedCount: entries.length,
      remainingCount: pending.size,
    };
  }

  async function waitForPending() {
    while (pending.size > 0) {
      await Promise.all([...pending].map((entry) => entry.completion));
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

  const capturePipelines = render.captureOpeningPipelinePlan;
  const drainPipelines = render.drainOpeningPipelinePlan;
  const captureResidency = render.captureOpeningGpuResidencyPlan;
  const drainResidency = render.drainOpeningGpuResidencyPlan;
  if ((typeof capturePipelines === 'function') !== (typeof drainPipelines === 'function')) return false;
  if ((typeof captureResidency === 'function') !== (typeof drainResidency === 'function')) return false;
  let pipelinePlan = null;
  try {
    // This is the startup cohort boundary. Root identities are frozen here; their residency work is
    // selected only after the captured pipeline continuations have had deterministic turns to start.
    if (typeof capturePipelines === 'function') pipelinePlan = capturePipelines();
  } catch {
    return false;
  }
  if (typeof capturePipelines === 'function') {
    const exact = Promise.resolve().then(() => drainPipelines(pipelinePlan));
    render.exactPipelineWarmupReady = exact;
    const result = await settleWithin(exact, timeoutMs);
    if (!result.ok) return false;
    if (gpuContextIsLost(state)) return false;
  }

  if (typeof captureResidency === 'function') {
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

export async function waitForOpeningGpuResources(state, timeoutMs = 20000) {
  const render = state && state.render;
  const prepare = render && render.prepareOpeningGpuResources;
  if (typeof prepare !== 'function') return true;
  const readiness = Promise.resolve().then(() => prepare());
  render.openingGpuResidencyReady = readiness;
  const result = await settleWithin(readiness, timeoutMs);
  return result.ok && gpuContextIsLost(state) !== true;
}
