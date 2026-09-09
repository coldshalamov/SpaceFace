// Capability-gated asynchronous GPU timer queries for frame-pacing attribution.
//
// Measurement-only. Default production path is OFF (no query allocation work beyond a
// one-time capability check). When enabled, uses EXT_disjoint_timer_query_webgl2 (or the
// WebGL1 EXT_disjoint_timer_query equivalent) with delayed non-blocking readback.
// Never spins on getQueryParameter; unsupported platforms report status "unavailable".

const RING_N = 64;
const MAX_PENDING = 48;
const TERMINAL_N = 128;
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
  };
}

function sampleRing(ring, ms) {
  if (!Number.isFinite(ms) || ms < 0) return;
  if (ring.count === RING_N) ring.total -= ring.values[ring.head];
  else ring.count++;
  ring.values[ring.head] = ms;
  ring.total += ms;
  ring.head = (ring.head + 1) % RING_N;
  ring.last = ms;
  if (ms > ring.max) ring.max = ms;
}

function reportRing(ring) {
  return {
    last: ring.last,
    avg: ring.count ? ring.total / ring.count : 0,
    max: ring.max,
    samples: ring.count,
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
  let lastInvalidation = null;
  let activeSlot = null;
  let nextQueryId = 1;
  let submissionsPaused = false;
  let abandoned = false;
  let disposed = false;
  const free = [];
  const pending = [];
  const terminalRing = new Array(TERMINAL_N);
  let terminalHead = 0;
  let terminalCount = 0;
  const queryCounts = {
    attempted: 0,
    issued: 0,
    completed: 0,
    dropped: 0,
    rejected: 0,
  };

  function now() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function nextId() {
    if (nextQueryId > Number.MAX_SAFE_INTEGER) {
      throw new Error('GPU timer query identity exhausted');
    }
    return nextQueryId++;
  }

  function copyOrigin(origin) {
    const displayFrameId = origin && origin.displayFrameId;
    const renderFrameId = origin && origin.renderFrameId;
    const simTick = origin && origin.simTick;
    if (!Number.isSafeInteger(displayFrameId) || displayFrameId <= 0
        || !Number.isSafeInteger(renderFrameId) || renderFrameId <= 0
        || !Number.isSafeInteger(simTick) || simTick < 0) {
      return null;
    }
    return Object.freeze({ displayFrameId, renderFrameId, simTick });
  }

  function createSlot(label, origin) {
    queryCounts.attempted++;
    return {
      queryId: nextId(),
      label: String(label),
      origin: copyOrigin(origin),
      query: null,
      issued: false,
      startedAt: now(),
    };
  }

  function pushTerminal(slot, terminalState, { elapsedMs = null, reason = null } = {}) {
    const entry = Object.freeze({
      queryId: slot.queryId,
      label: slot.label,
      state: terminalState,
      displayFrameId: slot.origin ? slot.origin.displayFrameId : null,
      renderFrameId: slot.origin ? slot.origin.renderFrameId : null,
      simTick: slot.origin ? slot.origin.simTick : null,
      elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : null,
      reason,
    });
    terminalRing[terminalHead] = entry;
    terminalHead = (terminalHead + 1) % TERMINAL_N;
    if (terminalCount < TERMINAL_N) terminalCount++;
    if (terminalState === 'completed') queryCounts.completed++;
    else if (slot.issued) queryCounts.dropped++;
    else queryCounts.rejected++;
    if (terminalState !== 'completed') {
      lastInvalidation = terminalState;
      status = terminalState;
    }
    return entry;
  }

  function terminalSnapshot() {
    const out = [];
    const start = (terminalHead - terminalCount + TERMINAL_N) % TERMINAL_N;
    for (let i = 0; i < terminalCount; i++) {
      out.push(terminalRing[(start + i) % TERMINAL_N]);
    }
    return out;
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

  function terminateIssued(slot, terminalState, options = {}) {
    deleteQuery(slot.query);
    slot.query = null;
    pushTerminal(slot, terminalState, options);
  }

  function poll() {
    if (!cap.available || abandoned || disposed) return;
    // Non-blocking: only harvest queries that already report RESULT_AVAILABLE.
    // Disjoint invalidates in-flight results; drop them and mark status.
    let disjoint = false;
    try {
      disjoint = !!cap.getParameter(cap.GPU_DISJOINT);
    } catch (_) {
      disjoint = false;
    }
    if (disjoint) {
      lastDisjoint = true;
      lastInvalidation = 'disjoint';
      status = 'disjoint';
      if (activeSlot) {
        const slot = activeSlot;
        activeSlot = null;
        try { cap.endQuery(cap.TIME_ELAPSED); } catch (_) { /* invalid query is dropped below */ }
        terminateIssued(slot, 'disjoint', { reason: 'GPU_DISJOINT_EXT' });
      }
      while (pending.length) {
        const slot = pending.shift();
        terminateIssued(slot, 'disjoint', { reason: 'GPU_DISJOINT_EXT' });
      }
      return;
    }

    // Harvest from the front only while results are ready (preserve order, no spin).
    while (pending.length) {
      const slot = pending[0];
      let available = false;
      try {
        available = !!cap.getQueryParameter(slot.query, cap.QUERY_RESULT_AVAILABLE);
      } catch (_) {
        pending.shift();
        terminateIssued(slot, 'result-read-error');
        continue;
      }
      if (!available) break;
      pending.shift();
      let ns;
      try {
        ns = Number(cap.getQueryParameter(slot.query, cap.QUERY_RESULT));
      } catch (_) {
        terminateIssued(slot, 'result-read-error');
        continue;
      }
      if (!Number.isFinite(ns) || ns <= 0) {
        terminateIssued(slot, Number.isFinite(ns) ? 'zero-result' : 'result-read-error');
        continue;
      }
      releaseQuery(slot.query);
      slot.query = null;
      // TIME_ELAPSED is nanoseconds.
      const ms = ns / 1e6;
      const ring = rings[slot.label] || (rings[slot.label] = createRing());
      sampleRing(ring, ms);
      pushTerminal(slot, 'completed', { elapsedMs: ms });
      if (!lastInvalidation) status = 'ok';
    }
    if (!pending.length && !lastInvalidation && queryCounts.completed > 0) status = 'ok';
  }

  function begin(label, origin) {
    if (!enabled || !cap.available || abandoned || disposed || !label || submissionsPaused) return false;
    const slot = createSlot(label, origin);
    if (!slot.origin) {
      pushTerminal(slot, 'invalid-origin', { reason: 'display/render/sim origin is required' });
      return false;
    }
    if (activeSlot) {
      // Nested begins are not supported. Refuse the nested begin without ending
      // or dropping the active outer query (outer end() remains responsible).
      pushTerminal(slot, 'nested-refused');
      return false;
    }
    poll();
    if (pending.length >= MAX_PENDING) {
      pushTerminal(slot, 'backpressure');
      return false;
    }
    const query = acquireQuery();
    if (!query) {
      pushTerminal(slot, 'query-create-error');
      return false;
    }
    slot.query = query;
    try {
      cap.beginQuery(cap.TIME_ELAPSED, query);
      slot.issued = true;
      queryCounts.issued++;
      activeSlot = slot;
      return true;
    } catch (_) {
      deleteQuery(query);
      slot.query = null;
      pushTerminal(slot, 'query-begin-error');
      return false;
    }
  }

  function end() {
    if (!activeSlot) return false;
    const slot = activeSlot;
    activeSlot = null;
    try {
      cap.endQuery(cap.TIME_ELAPSED);
    } catch (_) {
      terminateIssued(slot, 'query-end-error');
      return false;
    }
    pending.push(slot);
    // Opportunistic non-blocking harvest of older queries.
    poll();
    return true;
  }

  function reset() {
    const unresolved = [];
    if (activeSlot) {
      try { cap.endQuery(cap.TIME_ELAPSED); } catch (_) { /* ignore */ }
      unresolved.push(activeSlot);
      activeSlot = null;
    }
    while (pending.length) unresolved.push(pending.shift());
    for (const slot of unresolved) deleteQuery(slot.query);
    for (const label of Object.keys(rings)) {
      const ring = rings[label];
      ring.values.fill(0);
      ring.head = 0;
      ring.count = 0;
      ring.last = 0;
      ring.max = 0;
      ring.total = 0;
    }
    terminalRing.fill(undefined);
    terminalHead = 0;
    terminalCount = 0;
    queryCounts.attempted = 0;
    queryCounts.issued = 0;
    queryCounts.completed = 0;
    queryCounts.dropped = 0;
    queryCounts.rejected = 0;
    lastDisjoint = false;
    lastInvalidation = null;
    submissionsPaused = false;
    status = cap.available ? (enabled ? 'ok' : 'available') : 'unavailable';
    queryCounts.attempted = unresolved.length;
    queryCounts.issued = unresolved.length;
    for (const slot of unresolved) {
      slot.query = null;
      pushTerminal(slot, 'reset', { reason: 'unresolved query at capture reset' });
    }
  }

  /**
   * Drop all query references without calling end/delete.
   * Use on WebGL context loss — the GL objects are already dead; calling
   * endQuery/deleteQuery on a lost context is unsafe and rejected by policy.
   */
  function abandon() {
    enabled = false;
    submissionsPaused = true;
    abandoned = true;
    if (activeSlot) {
      pushTerminal(activeSlot, 'context-lost');
      activeSlot = null;
    }
    while (pending.length) pushTerminal(pending.shift(), 'context-lost');
    free.length = 0;
    lastDisjoint = false;
    status = 'unavailable';
  }

  function dispose() {
    if (disposed) return;
    // Live-context path only: end/delete GL objects before dropping refs.
    setEnabled(false);
    while (free.length) {
      try { cap.deleteQuery(free.pop()); } catch (_) { /* ignore */ }
    }
    disposed = true;
    status = 'unavailable';
  }

  function setEnabled(on) {
    enabled = !!on && cap.available && !abandoned && !disposed;
    if (!enabled) {
      submissionsPaused = false;
      if (activeSlot) {
        try { cap.endQuery(cap.TIME_ELAPSED); } catch (_) { /* ignore */ }
        const slot = activeSlot;
        activeSlot = null;
        terminateIssued(slot, 'disabled');
      }
      while (pending.length) terminateIssued(pending.shift(), 'disabled');
      if (!lastInvalidation) status = cap.available ? 'available' : 'unavailable';
    } else {
      submissionsPaused = false;
      if (!lastInvalidation) status = queryCounts.completed > 0 ? 'ok' : 'no-completed-queries';
    }
    return enabled;
  }

  function pauseSubmissions() {
    if (!enabled || abandoned || disposed) return false;
    submissionsPaused = true;
    return true;
  }

  function resumeSubmissions() {
    if (!enabled || abandoned || disposed) return false;
    submissionsPaused = false;
    return true;
  }

  async function drainPending({ maxPolls = 120, timeoutMs = 2000, yieldFn = null } = {}) {
    pauseSubmissions();
    if (activeSlot) end();
    const pollsLimit = Math.max(1, Math.min(10000, Math.trunc(Number(maxPolls)) || 120));
    const deadline = now() + Math.max(0, Math.min(30000, Number(timeoutMs) || 0));
    const yieldControl = typeof yieldFn === 'function'
      ? yieldFn
      : () => new Promise((resolve) => setTimeout(resolve, 0));
    let polls = 0;
    while (pending.length && polls < pollsLimit && now() <= deadline) {
      poll();
      polls++;
      if (pending.length && polls < pollsLimit && now() <= deadline) await yieldControl();
    }
    const timedOut = pending.length > 0;
    while (pending.length) terminateIssued(pending.shift(), 'drain-timeout');
    return { drained: !timedOut, timedOut, polls, pending: pending.length };
  }

  function reportQueryCounts() {
    return {
      attempted: queryCounts.attempted,
      issued: queryCounts.issued,
      completed: queryCounts.completed,
      pending: pending.length + (activeSlot ? 1 : 0),
      dropped: queryCounts.dropped,
      rejected: queryCounts.rejected,
    };
  }

  function getCapability() {
    return {
      available: cap.available,
      status: cap.available && !abandoned && !disposed ? status : 'unavailable',
      reason: cap.reason,
      webgl2: !!cap.webgl2,
      extension: cap.available
        ? (cap.webgl2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query')
        : null,
      enabled,
      lastDisjoint,
      pending: pending.length + (activeSlot ? 1 : 0),
      submissionsPaused,
      lastInvalidation,
      queryIdentitySchema: 'spaceface.gpuTimerQueryTerminal.v1',
      queryCounts: reportQueryCounts(),
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
      captureValid: cap.available
        && !abandoned
        && !disposed
        && lastInvalidation === null
        && queryCounts.completed > 0
        && pending.length === 0
        && activeSlot === null
        && queryCounts.dropped === 0
        && queryCounts.rejected === 0,
      terminals: terminalSnapshot(),
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
