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
  const deferAutoFlush = typeof options.deferAutoFlush === 'function'
    ? options.deferAutoFlush
    : () => false;
  const pending = new Set();
  let queued = [];
  let quietTimer = null;
  let maxTimer = null;
  let compileTail = Promise.resolve();

  function clearTimers() {
    if (quietTimer != null) clearTimeout(quietTimer);
    if (maxTimer != null) clearTimeout(maxTimer);
    quietTimer = null;
    maxTimer = null;
  }

  function scheduleFlush() {
    if (deferAutoFlush()) return;
    if (quietTimer != null) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => { void flushQueued(); }, quietMs);
    if (maxTimer == null) maxTimer = setTimeout(() => { void flushQueued(); }, maxWaitMs);
  }

  function flushQueued() {
    if (queued.length === 0) return compileTail;
    clearTimers();
    const batch = queued;
    queued = [];
    const subjects = batch.map((entry) => entry.subject);
    const run = compileTail.then(() => compileBatch(subjects));
    // Render-target selection is global renderer state. Keep batches serialized even if a second
    // runway fills while the first one is still waiting on the graphics driver.
    compileTail = run.catch(() => null);
    run.then(
      (result) => { for (const entry of batch) entry.resolve(result); },
      (error) => { for (const entry of batch) entry.reject(error); },
    );
    return run;
  }

  async function waitForPending() {
    while (pending.size > 0) {
      flushQueued();
      await Promise.all([...pending]);
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
      const tracked = compilation.finally(() => pending.delete(tracked));
      pending.add(tracked);
      queued.push({ subject, resolve, reject });
      scheduleFlush();
      return tracked;
    },
    compileCurrent(subject) {
      // A render-target transition needs the complete installed scene compiled after all currently
      // queued authored roots. Put that pass directly on the same serial driver runway; any roots
      // admitted while it runs append behind it, and the returned promise waits for those too.
      flushQueued();
      const run = compileTail.then(() => compileBatch([subject]));
      compileTail = run.catch(() => null);
      return run.finally(() => waitForPending());
    },
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

  if (typeof render.compileCurrentPipelines !== 'function') return true;
  const exact = Promise.resolve().then(() => render.compileCurrentPipelines());
  render.exactPipelineWarmupReady = exact;
  const result = await settleWithin(exact, timeoutMs);
  return result.ok;
}

export async function waitForOpeningGpuResources(state, timeoutMs = 20000) {
  const render = state && state.render;
  const prepare = render && render.prepareOpeningGpuResources;
  if (typeof prepare !== 'function') return true;
  const readiness = Promise.resolve().then(() => prepare());
  render.openingGpuResidencyReady = readiness;
  const result = await settleWithin(readiness, timeoutMs);
  return result.ok;
}
