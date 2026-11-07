// Permanent per-system step profiler (master-plan campaign E2).
//
// The authoritative step is a manifest-ordered walk of ~205 systems. `workerLastReplyWork`
// already reports the *total* step cost, but a total cannot rank work: every "optimise the
// hot path" round before this module guessed from source reading. This owns the missing
// layer — per-system wall time per tick plus per-tick allocation — in the realm that
// actually steps (the worker), off by default, exportable as JSON.
//
// Contract:
//   - Disabled = zero cost. Callers branch on `active` once per step; when false nothing
//     below runs and no clock is read.
//   - Enabled = one `now()` pair per executed system, one Map probe per system per tick
//     (stable ids, retained records), plus one heap sample per tick. Measured overhead on
//     the 150-body Crucible round is reported in the campaign STATUS file.
//   - Sampling: `sampleEvery` strides which ticks are measured so a permanent always-on
//     deployment can pay 1/N. Quartile statistics are over the measured ticks only.
//   - Both realms: the worker lane (`createAuthoritativeStepper`), the main-lane registry
//     (`createSimulation.registry.step`) and Node harnesses share this one implementation.
//
// Allocation is read from the realm's coarse heap counter (`performance.memory` in Chrome,
// `process.memoryUsage().heapUsed` in Node). Chrome bucketises that counter, so the mean
// over many ticks is the usable number; a single tick's delta is not. The report carries
// its own `source` and `quantised` flags rather than implying precision it does not have.

export const SIM_STEP_PROFILE_SCHEMA = 'spaceface.simStepProfile.v1';

const RING_TICKS = 256;

function nowNs() {
  if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
    // now() is sub-millisecond float; 1e6 scaling keeps integer ns without losing the fraction.
    return performance.now() * 1e6;
  }
  return Date.now() * 1e6;
}

function heapBytes() {
  const perf = typeof performance !== 'undefined' ? performance : null;
  const mem = perf && perf.memory;
  if (mem && Number.isFinite(mem.usedJSHeapSize) && mem.usedJSHeapSize > 0) {
    return { bytes: mem.usedJSHeapSize, source: 'performance.memory', quantised: true };
  }
  const proc = typeof process !== 'undefined' ? process : null;
  if (proc && typeof proc.memoryUsage === 'function') {
    try {
      const used = proc.memoryUsage().heapUsed;
      if (Number.isFinite(used) && used > 0) {
        return { bytes: used, source: 'process.memoryUsage.heapUsed', quantised: false };
      }
    } catch (_) { /* no heap access in this realm */ }
  }
  return null;
}

function createRing() {
  return { values: new Float64Array(RING_TICKS), head: 0, count: 0 };
}

function pushRing(ring, value) {
  ring.values[ring.head] = value;
  ring.head = (ring.head + 1) % RING_TICKS;
  if (ring.count < RING_TICKS) ring.count++;
}

/** Percentile over the retained ring. `q` in [0,1]. Copies before sorting. */
function ringPercentile(ring, q) {
  const n = ring.count;
  if (n === 0) return 0;
  const scratch = new Float64Array(n);
  const start = (ring.head - n + RING_TICKS) % RING_TICKS;
  for (let i = 0; i < n; i++) scratch[i] = ring.values[(start + i) % RING_TICKS];
  scratch.sort();
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1));
  return scratch[idx];
}

function ringMean(ring) {
  const n = ring.count;
  if (n === 0) return 0;
  let sum = 0;
  const start = (ring.head - n + RING_TICKS) % RING_TICKS;
  for (let i = 0; i < n; i++) sum += ring.values[(start + i) % RING_TICKS];
  return sum / n;
}

function round(value, digits = 3) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * One profiler per realm. Multi-runtime hosts (the lab) may create their own instance and
 * step it explicitly; the realm singleton is what the production lanes use.
 */
export function createSimStepProfiler(options = {}) {
  const ringTicks = Number.isSafeInteger(options.ringTicks) && options.ringTicks > 0
    ? options.ringTicks
    : RING_TICKS;
  const sampleEveryDefault = Number.isSafeInteger(options.sampleEvery) && options.sampleEvery > 0
    ? options.sampleEvery
    : 1;

  let enabled = options.enabled === true;
  let sampleEvery = sampleEveryDefault;
  let strideCounter = 0;
  let measuringThisTick = false;
  let ticksMeasured = 0;
  let skippedTicks = 0;

  // Retained per-id record. `ring` holds this system's per-tick ms.
  const records = new Map();
  let order = [];            // ids executed in the most recent measured tick
  let tickCalls = 0;
  let tickStartNs = 0;
  let heapAtStart = null;
  let tickHeapDelta = 0;
  let tickHeapSource = null;

  const stepRing = createRing();
  const allocRing = createRing();
  let lastTickMs = 0;
  let lastAllocBytes = 0;

  const counters = {
    enabled: 0,
    tickBegin: 0,
    samplesTaken: 0,
  };

  function recordFor(id) {
    let rec = records.get(id);
    if (!rec) {
      rec = { id, ring: createRing(), totalMs: 0, calls: 0, lastMs: 0, maxMs: 0 };
      records.set(id, rec);
    }
    return rec;
  }

  return {
    schema: SIM_STEP_PROFILE_SCHEMA,
    get enabled() { return enabled; },
    /** Cheap branch the step loops read once per tick. False means pay nothing. */
    get active() { return enabled; },
    get ticksMeasured() { return ticksMeasured; },
    get sampleEvery() { return sampleEvery; },

    setEnabled(on) {
      const next = !!on;
      if (next === enabled) return enabled;
      enabled = next;
      strideCounter = 0;
      if (next) counters.enabled++;
      return enabled;
    },

    setSampleEvery(n) {
      sampleEvery = Number.isSafeInteger(n) && n > 0 ? n : 1;
      strideCounter = 0;
      return sampleEvery;
    },

    reset() {
      records.clear();
      order = [];
      ticksMeasured = 0;
      skippedTicks = 0;
      strideCounter = 0;
      stepRing.head = 0; stepRing.count = 0;
      allocRing.head = 0; allocRing.count = 0;
      tickCalls = 0;
      lastTickMs = 0;
      lastAllocBytes = 0;
      counters.tickBegin = 0;
      counters.samplesTaken = 0;
      return this;
    },

    /** True when this tick is one of the sampled ticks. */
    beginTick() {
      if (!enabled) { measuringThisTick = false; return false; }
      const measure = sampleEvery <= 1 || (strideCounter++ % sampleEvery) === 0;
      measuringThisTick = measure;
      if (!measure) { skippedTicks++; return false; }
      counters.tickBegin++;
      order = [];
      tickCalls = 0;
      tickStartNs = nowNs();
      heapAtStart = heapBytes();
      tickHeapDelta = 0;
      tickHeapSource = heapAtStart ? heapAtStart.source : null;
      return true;
    },

    /** Record one system's exclusive wall time for this tick. */
    record(id, ns) {
      if (!measuringThisTick) return;
      const rec = recordFor(id);
      rec.lastMs = ns / 1e6;
      if (rec.lastMs > rec.maxMs) rec.maxMs = rec.lastMs;
      rec.calls++;
      rec.totalMs += rec.lastMs;
      tickCalls++;
      order.push(rec);
    },

    endTick() {
      if (!measuringThisTick) return;
      measuringThisTick = false;
      const elapsedMs = (nowNs() - tickStartNs) / 1e6;
      lastTickMs = elapsedMs;
      pushRing(stepRing, elapsedMs);
      const end = heapBytes();
      if (heapAtStart && end && end.source === heapAtStart.source) {
        tickHeapDelta = end.bytes - heapAtStart.bytes;
        // A collection inside the window makes the delta negative; negative allocation is a
        // GC artifact, not a measurement. Clamp to zero and let the mean absorb it.
        if (tickHeapDelta < 0) tickHeapDelta = 0;
        lastAllocBytes = tickHeapDelta;
        pushRing(allocRing, tickHeapDelta);
      }
      for (let i = 0; i < order.length; i++) pushRing(order[i].ring, order[i].lastMs);
      ticksMeasured++;
      counters.samplesTaken += tickCalls;
    },

    /** Rolling report. Sorted by total measured time, descending - the ranking the campaign uses. */
    snapshot() {
      const systems = [];
      let totalMeasuredMs = 0;
      let topLevelMeasuredMs = 0;
      for (const rec of records.values()) {
        const meanMs = ringMean(rec.ring);
        totalMeasuredMs += rec.totalMs;
        // Sub-phases (`physics.worldStep`, `economy.pressure`) are portions of a parent row, not
        // peers of it. Counting them in the denominator made one system read as 47% of the step
        // and invited an agent to optimise the same work three times (E2 review F7).
        if (!rec.id.includes('.')) topLevelMeasuredMs += rec.totalMs;
        systems.push({
          id: rec.id,
          nested: rec.id.includes('.'),
          calls: rec.calls,
          meanMs: round(meanMs),
          p50: round(ringPercentile(rec.ring, 0.5)),
          p95: round(ringPercentile(rec.ring, 0.95)),
          p99: round(ringPercentile(rec.ring, 0.99)),
          max: round(rec.maxMs),
          totalMs: round(rec.totalMs),
        });
      }
      systems.sort((a, b) => b.totalMs - a.totalMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const row of systems) {
        // A parent's share is over top-level work only; a sub-phase has no standalone share.
        row.share = !row.nested && topLevelMeasuredMs > 0
          ? round(row.totalMs / topLevelMeasuredMs, 4) : 0;
      }
      const allocMean = ringMean(allocRing);
      return {
        schema: SIM_STEP_PROFILE_SCHEMA,
        enabled,
        sampleEvery,
        ticksMeasured,
        skippedTicks,
        systemsMeasured: systems.length,
        totalMeasuredMs: round(totalMeasuredMs),
        topLevelMeasuredMs: round(topLevelMeasuredMs),
        step: {
          count: stepRing.count,
          meanMs: round(ringMean(stepRing)),
          p50: round(ringPercentile(stepRing, 0.5)),
          p95: round(ringPercentile(stepRing, 0.95)),
          p99: round(ringPercentile(stepRing, 0.99)),
          max: round(stepRing.count ? Math.max(...sampleRing(stepRing)) : 0),
          lastMs: round(lastTickMs),
        },
        allocation: allocRing.count
          ? {
            source: tickHeapSource || 'unavailable',
            bytesPerTickMean: Math.round(allocMean),
            bytesPerTickMax: Math.round(Math.max(...sampleRing(allocRing))),
            samples: allocRing.count,
          }
          : null,
        systems,
      };
    },

    /** Last measured tick only — for a live overlay reading one tick. */
    lastTick() {
      const rows = order.map((rec) => ({ id: rec.id, ms: round(rec.lastMs, 4) }));
      return { tick: ticksMeasured, ms: round(lastTickMs), systems: rows, allocBytes: lastAllocBytes };
    },
  };
}

function sampleRing(ring) {
  const n = ring.count;
  if (n === 0) return [0];
  const out = new Array(n);
  const start = (ring.head - n + RING_TICKS) % RING_TICKS;
  for (let i = 0; i < n; i++) out[i] = ring.values[(start + i) % RING_TICKS];
  return out;
}

/** Realm singleton for the worker lane, the main lane and Node harnesses. */
const realmProfiler = createSimStepProfiler();

export function getSimStepProfiler() {
  return realmProfiler;
}

export function setSimStepProfilerEnabled(on) {
  return realmProfiler.setEnabled(on);
}

export function isSimStepProfilerEnabled() {
  return realmProfiler.active;
}

/** `nowNs`/`round` re-exported so step hosts use the same clock as the profiler. */
export { nowNs };
