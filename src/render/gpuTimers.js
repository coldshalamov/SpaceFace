// Capability-gated asynchronous GPU timer queries for frame-pacing attribution.
//
// Measurement-only. Default production path is OFF (no query allocation work beyond a
// one-time capability check). When enabled, uses EXT_disjoint_timer_query_webgl2 (or the
// WebGL1 EXT_disjoint_timer_query equivalent) with delayed non-blocking readback.
// Never spins on getQueryParameter; unsupported platforms report status "unavailable".

const RING_N = 64;
const MAX_PENDING = 48;
const DEFAULT_DRAIN_MAX_POLLS = 120;
const DEFAULT_DRAIN_TIMEOUT_MS = 2_000;
const LABEL_POOL = Object.freeze([
  'drawPreparedFrame',
  'bloomScene',
  'bloomDownsample',
  'bloomUpsample',
  'bloomComposite',
]);

function createRing() {
  return {
    values: new Float64Array(RING_N),
    head: 0,
    count: 0,
    last: 0,
    max: 0,
    total: 0,
    issuedQueries: 0,
    completedQueries: 0,
    droppedQueries: 0,
    rejectedQueries: 0,
    completedTotal: 0,
  };
}

function sampleRing(ring, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  if (ring.count === RING_N) ring.total -= ring.values[ring.head];
  else ring.count++;
  ring.values[ring.head] = ms;
  ring.total += ms;
  ring.completedTotal += ms;
  ring.head = (ring.head + 1) % RING_N;
  ring.last = ms;
  if (ms > ring.max) ring.max = ms;
}

function reportRing(ring) {
  return {
    last: ring.count ? ring.last : null,
    avg: ring.count ? ring.total / ring.count : null,
    max: ring.count ? ring.max : null,
    samples: ring.count,
    retainedSamples: ring.count,
    issuedQueries: ring.issuedQueries,
    completedQueries: ring.completedQueries,
    droppedQueries: ring.droppedQueries,
    rejectedQueries: ring.rejectedQueries,
    completedAvg: ring.completedQueries ? ring.completedTotal / ring.completedQueries : null,
  };
}

function detectTimerExtension(gl) {
  if (!gl) return { available: false, status: 'unavailable', reason: 'no-gl', ext: null, webgl2: false };
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (isWebGL2) {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (ext) {
      return {
        available: true,
        status: 'available',
        reason: null,
        ext,
        webgl2: true,
        TIME_ELAPSED: ext.TIME_ELAPSED_EXT,
        QUERY_RESULT: gl.QUERY_RESULT,
        QUERY_RESULT_AVAILABLE: gl.QUERY_RESULT_AVAILABLE,
        GPU_DISJOINT: ext.GPU_DISJOINT_EXT,
        createQuery: () => gl.createQuery(),
        deleteQuery: (q) => gl.deleteQuery(q),
        beginQuery: (target, q) => gl.beginQuery(target, q),
        endQuery: (target) => gl.endQuery(target),
        getQueryParameter: (q, pname) => gl.getQueryParameter(q, pname),
        getParameter: (pname) => gl.getParameter(pname),
      };
    }
  }
  // WebGL1 path (or WebGL2 without the webgl2-specific timer ext).
  const ext = gl.getExtension('EXT_disjoint_timer_query');
  if (ext) {
    return {
      available: true,
      status: 'available',
      reason: null,
      ext,
      webgl2: false,
      TIME_ELAPSED: ext.TIME_ELAPSED_EXT,
      QUERY_RESULT: ext.QUERY_RESULT_EXT,
      QUERY_RESULT_AVAILABLE: ext.QUERY_RESULT_AVAILABLE_EXT,
      GPU_DISJOINT: ext.GPU_DISJOINT_EXT,
      createQuery: () => ext.createQueryEXT(),
      deleteQuery: (q) => ext.deleteQueryEXT(q),
      beginQuery: (target, q) => ext.beginQueryEXT(target, q),
      endQuery: (target) => ext.endQueryEXT(target),
      getQueryParameter: (q, pname) => ext.getQueryObjectEXT(q, pname),
      getParameter: (pname) => gl.getParameter(pname),
    };
  }
  return {
    available: false,
    status: 'unavailable',
    reason: isWebGL2 ? 'missing-EXT_disjoint_timer_query_webgl2' : 'missing-EXT_disjoint_timer_query',
    ext: null,
    webgl2: isWebGL2,
  };
}

/**
 * Create a GPU timer set bound to a live WebGL context.
 * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
 * @returns {object} timer API
 */
export function createGpuTimers(gl) {
  const cap = detectTimerExtension(gl);
  const rings = Object.create(null);
  for (const label of LABEL_POOL) rings[label] = createRing();

  let enabled = false;
  let status = cap.available ? 'available' : 'unavailable';
  let lastDisjoint = false;
  let disjointActive = false;
  let lastInvalidation = null;
  let activeLabel = null;
  let activeQuery = null;
  let submissionsPaused = false;
  let abandoned = false;
  let disposed = false;
  const free = [];
  const pending = []; // { query, label, startedAt }
  const captureCounts = {
    issued: 0,
    completed: 0,
    dropped: 0,
    rejected: 0,
  };
  const invalidations = {
    disjoint: 0,
    resultReadError: 0,
    zeroResult: 0,
    backpressure: 0,
    drainTimeout: 0,
    submissionError: 0,
    disabled: 0,
    contextLost: 0,
  };

  function ringFor(label) {
    return rings[label] || (rings[label] = createRing());
  }

  function markInvalid(reason) {
    lastInvalidation = reason;
    status = reason;
    if (reason === 'disjoint') invalidations.disjoint++;
    else if (reason === 'result-read-error') invalidations.resultReadError++;
    else if (reason === 'zero-result') invalidations.zeroResult++;
    else if (reason === 'backpressure') invalidations.backpressure++;
    else if (reason === 'drain-timeout') invalidations.drainTimeout++;
    else if (reason === 'disabled-with-pending') invalidations.disabled++;
    else if (reason === 'context-lost') invalidations.contextLost++;
    else invalidations.submissionError++;
  }

  function noteRejected(label, reason = null) {
    captureCounts.rejected++;
    if (label) ringFor(label).rejectedQueries++;
    if (reason) markInvalid(reason);
  }

  function acquireQuery() {
    if (free.length) return free.pop();
    try { return cap.createQuery(); } catch (_) { return null; }
  }

  function releaseQuery(query) {
    if (!query) return;
    if (free.length < MAX_PENDING) free.push(query);
    else {
      try { cap.deleteQuery(query); } catch (_) { /* ignore */ }
    }
  }

  function deleteQuery(query) {
    if (!query) return;
    try { cap.deleteQuery(query); } catch (_) { /* ignore */ }
  }

  function dropIssuedQuery(query, label) {
    if (!query) return;
    deleteQuery(query);
    captureCounts.dropped++;
    if (label) ringFor(label).droppedQueries++;
  }

  function dropActiveQuery() {
    if (!activeQuery) return;
    const query = activeQuery;
    const label = activeLabel;
    activeQuery = null;
    activeLabel = null;
    try { cap.endQuery(cap.TIME_ELAPSED); } catch (_) { /* ignore */ }
    dropIssuedQuery(query, label);
  }

  function dropPendingQueries() {
    while (pending.length) {
      const slot = pending.shift();
      dropIssuedQuery(slot.query, slot.label);
    }
  }

  function invalidateUnresolved(reason) {
    markInvalid(reason);
    dropActiveQuery();
    dropPendingQueries();
  }

  function poll() {
    const completedBefore = captureCounts.completed;
    if (!cap.available || abandoned || disposed) {
      return { completed: 0, pending: 0, status: 'unavailable' };
    }
    // Non-blocking: only harvest queries that already report RESULT_AVAILABLE.
    // Disjoint invalidates in-flight results; drop them and mark status.
    let disjoint = false;
    try {
      disjoint = !!cap.getParameter(cap.GPU_DISJOINT);
    } catch (_) {
      invalidateUnresolved('result-read-error');
      return { completed: 0, pending: 0, status };
    }
    if (disjoint) {
      lastDisjoint = true;
      if (!disjointActive) invalidateUnresolved('disjoint');
      disjointActive = true;
      return { completed: 0, pending: 0, status };
    }
    disjointActive = false;

    // Harvest from the front only while results are ready (preserve order, no spin).
    while (pending.length) {
      const slot = pending[0];
      let available = false;
      try {
        available = !!cap.getQueryParameter(slot.query, cap.QUERY_RESULT_AVAILABLE);
      } catch (_) {
        pending.shift();
        markInvalid('result-read-error');
        dropIssuedQuery(slot.query, slot.label);
        continue;
      }
      if (!available) break;
      pending.shift();
      let ns;
      try {
        ns = Number(cap.getQueryParameter(slot.query, cap.QUERY_RESULT));
      } catch (_) {
        markInvalid('result-read-error');
        dropIssuedQuery(slot.query, slot.label);
        continue;
      }
      if (!Number.isFinite(ns)) {
        markInvalid('result-read-error');
        dropIssuedQuery(slot.query, slot.label);
        continue;
      }
      // A full authored pass cannot consume zero GPU time. Treat a zero result as a dead or
      // unusably quantized timer instead of publishing the most dangerous false-green value.
      if (ns <= 0) {
        markInvalid('zero-result');
        dropIssuedQuery(slot.query, slot.label);
        continue;
      }
      releaseQuery(slot.query);
      // TIME_ELAPSED is nanoseconds.
      const ms = ns / 1e6;
      const ring = ringFor(slot.label);
      captureCounts.completed++;
      ring.completedQueries++;
      sampleRing(ring, ms);
      if (!lastInvalidation) status = 'ok';
    }
    if (!lastInvalidation && captureCounts.completed === 0 && enabled) {
      status = 'no-completed-queries';
    }
    return {
      completed: captureCounts.completed - completedBefore,
      pending: pending.length + (activeQuery ? 1 : 0),
      status,
    };
  }

  function begin(label) {
    if (!enabled || !cap.available || abandoned || disposed || !label) return false;
    // An intentional capture-close pause is not a rejected measurement. The
    // renderer may continue presenting while drainPending() waits for results.
    if (submissionsPaused) return false;
    if (activeQuery) {
      // Nested begins are not supported. Refuse the nested begin without ending
      // or dropping the active outer query (outer end() remains responsible).
      noteRejected(label, 'nested-query');
      return false;
    }
    poll();
    if (disjointActive) {
      noteRejected(label);
      return false;
    }
    if (pending.length >= MAX_PENDING) {
      noteRejected(label, 'backpressure');
      return false;
    }
    const query = acquireQuery();
    if (!query) {
      noteRejected(label, 'query-create-error');
      return false;
    }
    try {
      cap.beginQuery(cap.TIME_ELAPSED, query);
      activeQuery = query;
      activeLabel = label;
      captureCounts.issued++;
      ringFor(label).issuedQueries++;
      return true;
    } catch (_) {
      // beginQuery may have partially touched driver state before throwing;
      // never recycle a query whose ownership is uncertain.
      deleteQuery(query);
      activeQuery = null;
      activeLabel = null;
      noteRejected(label, 'query-begin-error');
      return false;
    }
  }

  function end() {
    if (!activeQuery) return false;
    const query = activeQuery;
    const label = activeLabel;
    activeQuery = null;
    activeLabel = null;
    try {
      cap.endQuery(cap.TIME_ELAPSED);
    } catch (_) {
      markInvalid('query-end-error');
      dropIssuedQuery(query, label);
      return false;
    }
    pending.push({ query, label, startedAt: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
    // Opportunistic non-blocking harvest of older queries.
    poll();
    return true;
  }

  function reset() {
    // Reset is a capture boundary. Unresolved queries may still be owned by the
    // driver, so delete them; only completed queries are safe to recycle.
    if (activeQuery) {
      dropActiveQuery();
    }
    dropPendingQueries();
    for (const label of Object.keys(rings)) {
      const ring = rings[label];
      ring.values.fill(0);
      ring.head = 0;
      ring.count = 0;
      ring.last = 0;
      ring.max = 0;
      ring.total = 0;
      ring.issuedQueries = 0;
      ring.completedQueries = 0;
      ring.droppedQueries = 0;
      ring.rejectedQueries = 0;
      ring.completedTotal = 0;
    }
    captureCounts.issued = 0;
    captureCounts.completed = 0;
    captureCounts.dropped = 0;
    captureCounts.rejected = 0;
    for (const key of Object.keys(invalidations)) invalidations[key] = 0;
    lastDisjoint = false;
    disjointActive = false;
    lastInvalidation = null;
    submissionsPaused = false;
    status = cap.available && !abandoned && !disposed
      ? (enabled ? 'no-completed-queries' : 'available')
      : 'unavailable';
  }

  /**
   * Drop all query references without calling end/delete.
   * Use on WebGL context loss — the GL objects are already dead; calling
   * endQuery/deleteQuery on a lost context is unsafe and rejected by policy.
   */
  function abandon() {
    const unresolved = pending.length + (activeQuery ? 1 : 0);
    if (unresolved > 0) {
      captureCounts.dropped += unresolved;
      if (activeLabel) ringFor(activeLabel).droppedQueries++;
      for (const slot of pending) ringFor(slot.label).droppedQueries++;
      markInvalid('context-lost');
    }
    enabled = false;
    submissionsPaused = true;
    abandoned = true;
    activeQuery = null;
    activeLabel = null;
    pending.length = 0;
    free.length = 0;
    lastDisjoint = false;
    disjointActive = false;
    status = 'unavailable';
  }

  function dispose() {
    if (disposed) return;
    // Live-context path only. Delete every unresolved query directly; recycling
    // it before disposal can hide ownership bugs and leave driver work alive.
    enabled = false;
    submissionsPaused = true;
    if (activeQuery || pending.length) {
      markInvalid('disabled-with-pending');
      dropActiveQuery();
      dropPendingQueries();
    }
    while (free.length) {
      deleteQuery(free.pop());
    }
    disposed = true;
    status = 'unavailable';
  }

  function setEnabled(on) {
    enabled = !!on && cap.available && !abandoned && !disposed;
    if (!enabled) {
      submissionsPaused = false;
      if (activeQuery || pending.length) {
        invalidateUnresolved('disabled-with-pending');
      } else if (!lastInvalidation) {
        status = cap.available && !abandoned && !disposed ? 'available' : 'unavailable';
      }
    } else {
      submissionsPaused = false;
      if (!lastInvalidation) {
        status = captureCounts.completed > 0 ? 'ok' : 'no-completed-queries';
      }
    }
    return enabled;
  }

  function pauseSubmissions() {
    if (!enabled || !cap.available || abandoned || disposed) return false;
    submissionsPaused = true;
    return true;
  }

  function resumeSubmissions() {
    if (!enabled || !cap.available || abandoned || disposed) return false;
    submissionsPaused = false;
    return true;
  }

  function defaultDrainYield() {
    return new Promise((resolve) => {
      if (typeof setTimeout === 'function') setTimeout(resolve, 0);
      else Promise.resolve().then(resolve);
    });
  }

  function drainClockNow() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  async function yieldBeforeDeadline(yieldFn, deadlineAt) {
    const remainingMs = Math.max(0, deadlineAt - drainClockNow());
    if (remainingMs <= 0) return false;
    if (typeof setTimeout !== 'function') {
      await yieldFn();
      return drainClockNow() < deadlineAt;
    }
    let timeoutId = null;
    let deadlineWon = false;
    try {
      await Promise.race([
        Promise.resolve().then(yieldFn),
        new Promise((resolve) => {
          timeoutId = setTimeout(() => {
            deadlineWon = true;
            resolve();
          }, remainingMs);
        }),
      ]);
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
    return !deadlineWon && drainClockNow() < deadlineAt;
  }

  /**
   * Pause new submissions and non-blockingly drain already-issued queries.
   * The loop is bounded by both poll count and elapsed time and deliberately
   * never calls gl.finish().
   */
  async function drainPending({
    maxPolls = DEFAULT_DRAIN_MAX_POLLS,
    timeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
    yieldFn = defaultDrainYield,
  } = {}) {
    const boundedPolls = Math.max(1, Math.floor(Number(maxPolls) || DEFAULT_DRAIN_MAX_POLLS));
    const boundedTimeout = Math.max(0, Number.isFinite(Number(timeoutMs))
      ? Number(timeoutMs)
      : DEFAULT_DRAIN_TIMEOUT_MS);
    const yieldBetweenPolls = typeof yieldFn === 'function' ? yieldFn : defaultDrainYield;
    pauseSubmissions();

    // If capture close lands inside a labeled pass, end that pass once before
    // readback. No new query can begin while submissions are paused.
    if (activeQuery) end();

    const startedAt = drainClockNow();
    const deadlineAt = startedAt + boundedTimeout;
    let polls = 0;
    while (pending.length && polls < boundedPolls) {
      poll();
      polls++;
      if (!pending.length) break;
      if (drainClockNow() >= deadlineAt) break;
      if (polls < boundedPolls) {
        const yieldedBeforeDeadline = await yieldBeforeDeadline(yieldBetweenPolls, deadlineAt);
        if (!yieldedBeforeDeadline) break;
      }
    }

    const timedOut = pending.length > 0;
    if (timedOut) {
      markInvalid('drain-timeout');
      dropPendingQueries();
    }
    return {
      drained: !timedOut,
      timedOut,
      polls,
      pending: pending.length,
      completedQueries: captureCounts.completed,
      droppedQueries: captureCounts.dropped,
      status: effectiveStatus(true),
    };
  }

  function getQueryCounts() {
    return {
      issued: captureCounts.issued,
      completed: captureCounts.completed,
      pending: pending.length + (activeQuery ? 1 : 0),
      dropped: captureCounts.dropped,
      rejected: captureCounts.rejected,
    };
  }

  function effectiveStatus(forReport = false) {
    if (!cap.available || abandoned || disposed) return 'unavailable';
    if (lastInvalidation) return lastInvalidation;
    if (captureCounts.completed > 0) return 'ok';
    if (forReport || enabled || captureCounts.issued > 0 || captureCounts.rejected > 0) {
      return 'no-completed-queries';
    }
    return status;
  }

  function getCapability() {
    const queryCounts = getQueryCounts();
    const live = cap.available && !abandoned && !disposed;
    return {
      available: cap.available,
      live,
      status: effectiveStatus(false),
      reason: cap.reason,
      webgl2: !!cap.webgl2,
      extension: cap.available
        ? (cap.webgl2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query')
        : null,
      enabled,
      lastDisjoint,
      pending: pending.length,
      submissionsPaused,
      captureValid: live
        && lastInvalidation === null
        && queryCounts.completed > 0
        && queryCounts.pending === 0
        && queryCounts.dropped === 0
        && queryCounts.rejected === 0,
      invalidation: lastInvalidation,
      invalidations: { ...invalidations },
      queryCounts,
      issuedQueries: queryCounts.issued,
      completedQueries: queryCounts.completed,
      pendingQueries: queryCounts.pending,
      droppedQueries: queryCounts.dropped,
      rejectedQueries: queryCounts.rejected,
      labels: LABEL_POOL.slice(),
    };
  }

  function getReport() {
    poll();
    const passes = Object.create(null);
    for (const label of Object.keys(rings)) {
      if (rings[label].count > 0 || LABEL_POOL.includes(label)) {
        passes[label] = reportRing(rings[label]);
      }
    }
    return {
      ...getCapability(),
      status: effectiveStatus(true),
      passes,
    };
  }

  return {
    begin,
    end,
    poll,
    reset,
    abandon,
    dispose,
    setEnabled,
    pauseSubmissions,
    resumeSubmissions,
    drainPending,
    get enabled() { return enabled; },
    getCapability,
    getReport,
    LABEL_POOL,
  };
}

export { detectTimerExtension, LABEL_POOL as GPU_TIMER_LABELS };
