// Capability-gated asynchronous GPU timer queries for frame-pacing attribution.
//
// Measurement-only. Default production path is OFF (no query allocation work beyond a
// one-time capability check). When enabled, uses EXT_disjoint_timer_query_webgl2 (or the
// WebGL1 EXT_disjoint_timer_query equivalent) with delayed non-blocking readback.
// Never spins on getQueryParameter; unsupported platforms report status "unavailable".

const RING_N = 64;
const MAX_PENDING = 48;
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
  let activeLabel = null;
  let activeQuery = null;
  const free = [];
  const pending = []; // { query, label, startedAt }

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

  function poll() {
    if (!cap.available) return;
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
      status = 'disjoint';
      while (pending.length) {
        const slot = pending.shift();
        releaseQuery(slot.query);
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
        available = false;
      }
      if (!available) break;
      pending.shift();
      let ns = 0;
      try {
        ns = Number(cap.getQueryParameter(slot.query, cap.QUERY_RESULT)) || 0;
      } catch (_) {
        ns = 0;
      }
      releaseQuery(slot.query);
      // TIME_ELAPSED is nanoseconds.
      const ms = ns / 1e6;
      const ring = rings[slot.label] || (rings[slot.label] = createRing());
      sampleRing(ring, ms);
      if (status === 'disjoint' || status === 'available') status = 'ok';
    }
    if (!pending.length && status === 'available' && enabled) status = 'ok';
  }

  function begin(label) {
    if (!enabled || !cap.available || !label) return false;
    if (activeQuery) {
      // Nested begins are not supported. Refuse the nested begin without ending
      // or dropping the active outer query (outer end() remains responsible).
      return false;
    }
    poll();
    if (pending.length >= MAX_PENDING) return false;
    const query = acquireQuery();
    if (!query) return false;
    try {
      cap.beginQuery(cap.TIME_ELAPSED, query);
      activeQuery = query;
      activeLabel = label;
      return true;
    } catch (_) {
      releaseQuery(query);
      activeQuery = null;
      activeLabel = null;
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
      releaseQuery(query);
      return false;
    }
    pending.push({ query, label, startedAt: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
    // Opportunistic non-blocking harvest of older queries.
    poll();
    return true;
  }

  function reset() {
    if (activeQuery) {
      try { cap.endQuery(cap.TIME_ELAPSED); } catch (_) { /* ignore */ }
      releaseQuery(activeQuery);
      activeQuery = null;
      activeLabel = null;
    }
    while (pending.length) releaseQuery(pending.shift().query);
    for (const label of Object.keys(rings)) {
      const ring = rings[label];
      ring.values.fill(0);
      ring.head = 0;
      ring.count = 0;
      ring.last = 0;
      ring.max = 0;
      ring.total = 0;
    }
    lastDisjoint = false;
    status = cap.available ? (enabled ? 'ok' : 'available') : 'unavailable';
  }

  /**
   * Drop all query references without calling end/delete.
   * Use on WebGL context loss — the GL objects are already dead; calling
   * endQuery/deleteQuery on a lost context is unsafe and rejected by policy.
   */
  function abandon() {
    enabled = false;
    activeQuery = null;
    activeLabel = null;
    pending.length = 0;
    free.length = 0;
    lastDisjoint = false;
    status = 'unavailable';
  }

  function dispose() {
    // Live-context path only: end/delete GL objects before dropping refs.
    setEnabled(false);
    reset();
    while (free.length) {
      try { cap.deleteQuery(free.pop()); } catch (_) { /* ignore */ }
    }
  }

  function setEnabled(on) {
    enabled = !!on && cap.available;
    if (!enabled) {
      if (activeQuery) {
        try { cap.endQuery(cap.TIME_ELAPSED); } catch (_) { /* ignore */ }
        releaseQuery(activeQuery);
        activeQuery = null;
        activeLabel = null;
      }
      // Leave pending to drain via poll when re-enabled; drop to avoid stale attribution.
      while (pending.length) releaseQuery(pending.shift().query);
      status = cap.available ? 'available' : 'unavailable';
    } else {
      status = 'ok';
    }
    return enabled;
  }

  function getCapability() {
    return {
      available: cap.available,
      status: cap.available ? status : 'unavailable',
      reason: cap.reason,
      webgl2: !!cap.webgl2,
      extension: cap.available
        ? (cap.webgl2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query')
        : null,
      enabled,
      lastDisjoint,
      pending: pending.length,
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
    get enabled() { return enabled; },
    getCapability,
    getReport,
    LABEL_POOL,
  };
}

export { detectTimerExtension, LABEL_POOL as GPU_TIMER_LABELS };
