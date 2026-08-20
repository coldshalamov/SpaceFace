import { createPerfCounters } from './perfCounters.js';
import {
  accumulateHitch,
  classifyHitchFrame,
  createHitchHistogram,
  hitchHistogramReport,
  isHitchFrame,
} from '../render/hitchClassifier.js';

const RING_N = 180;
const BACKGROUND_JOB_RING_N = 128;
const MAX_QUALIFICATION_INTERVAL_SAMPLES = 2_000_000;
const FRAME_HITCH_DETAIL_OWNERS = Object.freeze([
  'compile',
  'upload',
  'compose',
  'meshBuild',
  'shadow',
  'speedLines',
  'bloom',
  'gc',
  'restore',
  'autosave',
]);
const RENDER_WORK_HITCH_OWNER = Object.freeze({
  pipelineAdmissionSync: 'compile',
  gpuResidencyUpload: 'upload',
  composition: 'compose',
  compose: 'compose',
  bloomScene: 'bloom',
  bloomDownsample: 'bloom',
  bloomComposite: 'bloom',
});
// Detailed per-system timing is an attribution sampler, not an always-on trace. A prime-length
// schedule avoids locking onto common 2/3/4/5/6/10/12/15-tick owner cadences while retaining
// 8 representative ticks per 31-tick cycle. A five-second 60 Hz window still yields about 77
// samples per owner—enough for bounded attribution—while paying roughly one quarter of the full
// per-system clock/sample tax.
export const SYSTEM_TIMING_SAMPLE_PERIOD_TICKS = 31;
export const SYSTEM_TIMING_SAMPLES_PER_PERIOD = 8;

export function shouldSampleSystemTimingTick(simTick) {
  if (!Number.isSafeInteger(simTick) || simTick < 0) return true;
  const slot = simTick % SYSTEM_TIMING_SAMPLE_PERIOD_TICKS;
  return ((slot * SYSTEM_TIMING_SAMPLES_PER_PERIOD) % SYSTEM_TIMING_SAMPLE_PERIOD_TICKS)
    < SYSTEM_TIMING_SAMPLES_PER_PERIOD;
}

function nowMs() {
  return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

function createFrameHitchOwnerTotals() {
  const totals = Object.create(null);
  for (const owner of FRAME_HITCH_DETAIL_OWNERS) totals[owner] = 0;
  return totals;
}

function resetFrameHitchOwnerTotals(totals) {
  for (const owner of FRAME_HITCH_DETAIL_OWNERS) totals[owner] = 0;
}

function renderWorkHitchOwner(name) {
  if (Object.prototype.hasOwnProperty.call(RENDER_WORK_HITCH_OWNER, name)) {
    return RENDER_WORK_HITCH_OWNER[name];
  }
  return FRAME_HITCH_DETAIL_OWNERS.includes(name) ? name : null;
}

function createStat() {
  return {
    values: new Float64Array(RING_N),
    scratch: new Float64Array(RING_N),
    head: 0,
    count: 0,
    last: 0,
    max: 0,
    total: 0,
  };
}

function resetStat(stat) {
  stat.values.fill(0);
  stat.scratch.fill(0);
  stat.head = 0;
  stat.count = 0;
  stat.last = 0;
  stat.max = 0;
  stat.total = 0;
}

function sample(stat, ms) {
  if (!Number.isFinite(ms) || ms < 0) return;
  if (stat.count === RING_N) stat.total -= stat.values[stat.head];
  else stat.count++;
  stat.values[stat.head] = ms;
  stat.total += ms;
  stat.head = (stat.head + 1) % RING_N;
  stat.last = ms;
  if (ms > stat.max) stat.max = ms;
}

function reportStat(stat) {
  let min = Infinity;
  let max = 0;
  const start = (stat.head - stat.count + RING_N) % RING_N;
  for (let i = 0; i < stat.count; i++) {
    const v = stat.values[(start + i) % RING_N];
    stat.scratch[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  let p50 = 0;
  let p95 = 0;
  let p99 = 0;
  if (stat.count > 0) {
    const sub = stat.scratch.subarray(0, stat.count);
    Array.prototype.sort.call(sub, (a, b) => a - b);
    p50 = sub[Math.min(stat.count - 1, Math.floor(0.50 * (stat.count - 1)))];
    p95 = sub[Math.min(stat.count - 1, Math.floor(0.95 * (stat.count - 1)))];
    p99 = sub[Math.min(stat.count - 1, Math.floor(0.99 * (stat.count - 1)))];
  } else {
    min = 0;
  }
  return {
    last: stat.last,
    avg: stat.count ? stat.total / stat.count : 0,
    min,
    max,
    p50,
    p95,
    p99,
    samples: stat.count,
  };
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))];
}

function entityCounts(state) {
  const counts = Object.create(null);
  const list = state && state.entityList ? state.entityList : [];
  for (const e of list) {
    if (!e || e.alive === false) continue;
    const key = e.type || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  counts.total = list.length;
  return counts;
}

function plainTiming(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'number') out[key] = Number.isFinite(value) ? value : 0;
    else if (typeof value === 'string' || typeof value === 'boolean' || value == null) out[key] = value;
  }
  return out;
}

function videoSettings(state) {
  const v = state && state.settings && state.settings.video ? state.settings.video : {};
  return {
    renderScale: v.renderScale,
    pixelRatioCap: v.pixelRatioCap,
    bloom: v.bloom,
    bloomStrength: v.bloomStrength,
    bloomThreshold: v.bloomThreshold,
    shadows: v.shadows,
    particleQuality: v.particleQuality,
    fov: v.fov,
    motionReduce: v.motionReduce,
  };
}

export function perfNow() {
  return nowMs();
}

export function ensurePerfRuntime(state) {
  if (state.perfRuntime && state.perfRuntime.__spacefacePerfV1) return state.perfRuntime;

  const phaseStats = {
    sim: createStat(),
    simFrame: createStat(),
    presentation: createStat(),
    render: createStat(),
    vfx: createStat(),
    feel: createStat(),
    ui: createStat(),
    admission: createStat(),
  };
  const systemStats = Object.create(null);
  const frameStats = createStat();
  const frameCallbackStats = createStat();
  const frameUntrackedStats = createStat();
  const frameCallbackIntervalStats = createStat();
  const frameExternalGapStats = createStat();
  const frameDispatchLagStats = createStat();
  let frameAccountedMs = 0;
  let pendingAdmissionMs = 0;
  let pendingExternalAdmissionMs = 0;
  let frameAdmissionMs = 0;
  let frameExternalAdmissionMs = 0;
  let callbackOpen = false;
  let currentCallbackStartMs = null;
  let previousCallbackStartMs = null;
  let previousCallbackEndMs = null;
  let previousCallbackMs = 0;
  let previousSimFrameMs = 0;
  let previousPresentationMs = 0;
  let previousUiMs = 0;
  let fixedFrameBudgetMs = 1000 / 60;
  let displayIntervalMs = null;
  let displayCadenceObservedIntervals = 0;
  let missedVsync = 0;
  let qualificationIntervalValues = null;
  let qualificationIntervalCount = 0;
  let qualificationIntervalOverflow = 0;
  const framePhaseMs = {
    sim: 0,
    simFrame: 0,
    presentation: 0,
    render: 0,
    vfx: 0,
    feel: 0,
    ui: 0,
  };
  const backlogCauseCounts = {
    none: 0,
    simulation: 0,
    presentation: 0,
    ui: 0,
    admission: 0,
    externalScheduling: 0,
  };
  const loop = {
    stepsThisFrame: 0,
    maxStepsThisFrame: 0,
    multiStepFrames: 0,
    shedBacklogFrames: 0,
    shedStepsTotal: 0,
    accumulatorS: 0,
    lastFrameDtMs: 0,
    callbackIntervalMs: 0,
    externalCallbackGapMs: 0,
    callbackDispatchLagMs: 0,
    admissionMs: 0,
    backlogCause: 'none',
    backlogCauseCounts,
  };
  const counters = {
    spatialHash: {
      rebuilds: 0,
      dynamicRebuilds: 0,
      dynamicFullRebuilds: 0,
      dynamicReinserts: 0,
      dynamicUnchanged: 0,
      queries: 0,
      candidates: 0,
    },
    vfxTrails: {
      trailCandidates: 0,
      trailEmittersFull: 0,
      trailEmittersNormal: 0,
      trailEmittersReduced: 0,
      trailEmittersSkipped: 0,
      trailParticlesSpawned: 0,
      trailSpritesSpawned: 0,
    },
    vfxSubsystems: {
      trails: 0,
      ribbons: 0,
      miningBeam: 0,
      tetherCable: 0,
      seamMarkers: 0,
      energy: 0,
      particles: 0,
      sprites: 0,
      eventLights: 0,
    },
  };
  const saveStats = {
    all: createStat(),
    autosave: createStat(),
    elapsed: createStat(),
    totalCpu: createStat(),
    totalBlocking: createStat(),
    maxBlockingSlice: createStat(),
    maxSerializer: createStat(),
    serialize: createStat(),
    write: createStat(),
    stringify: createStat(),
    storage: createStat(),
    index: createStat(),
    backup: createStat(),
    readback: createStat(),
    verify: createStat(),
    workerSetup: createStat(),
    workerDispatch: createStat(),
    workerRoundtrip: createStat(),
    bytes: createStat(),
    count: 0,
    autosaveCount: 0,
    errorCount: 0,
    targetMissCount: 0,
    hardLimitMissCount: 0,
    last: null,
    autosaveLast: null,
  };
  const renderWorkStats = Object.create(null);
  // Per-system attribution costs two clocks plus one ring sample for every registered system on
  // every 60 Hz sim tick. Keep that diagnostic tax explicit and default-off in normal play.
  let systemTimingEnabled = false;
  // Opt-in CPU render-work attribution. Default OFF so production frames never pay
  // performance.now() + ring sample cost. Measurement probes enable for a window only.
  let renderWorkEnabled = false;
  // Opt-in hitch owner ring. Default off so ordinary frames pay no classifier work.
  let hitchAttributionEnabled = false;
  const hitchHistogram = createHitchHistogram();
  const frameHitchOwnerMs = createFrameHitchOwnerTotals();
  const frameNestedPresentationMs = createFrameHitchOwnerTotals();
  // Background-job evidence is opt-in. The live queue pays one branch at job boundaries while
  // ordinary frames pay nothing; enabled captures use a fixed-capacity record ring.
  let backgroundJobTrackingEnabled = false;
  let backgroundJobId = 0;
  const backgroundJobRecords = new Array(BACKGROUND_JOB_RING_N);
  const activeBackgroundJobs = new Set();
  let backgroundJobHead = 0;
  let backgroundJobCount = 0;
  let backgroundJobDroppedRecords = 0;
  let backgroundJobOverwrittenActiveRecords = 0;
  let backgroundJobRefusedStarts = 0;
  // Common monotonic identities for bounded attribution. Integer increments are allocation-free;
  // callers copy them only while an evidence window is enabled.
  let displayFrameId = 0;
  let renderFrameId = 0;
  let currentSimTick = 0;

  function statForSystem(name) {
    const key = name || 'unknown';
    return systemStats[key] || (systemStats[key] = createStat());
  }

  function statForRenderWork(name) {
    const key = name || 'unknown';
    return renderWorkStats[key] || (renderWorkStats[key] = createStat());
  }

  function backgroundJobOrigin() {
    return {
      displayFrameId,
      renderFrameId,
      simTick: currentSimTick,
    };
  }

  function closeBackgroundJob(record, terminal) {
    if (!record || record.terminal != null) return false;
    record.terminal = typeof terminal === 'string' && terminal.trim()
      ? terminal.trim().slice(0, 80)
      : 'unknown';
    record.endedAtMs = nowMs();
    record.durationMs = Math.max(0, record.endedAtMs - record.startedAtMs);
    record.endOrigin = backgroundJobOrigin();
    activeBackgroundJobs.delete(record);
    return true;
  }

  function appendBackgroundJob(record) {
    const replaced = backgroundJobRecords[backgroundJobHead];
    if (backgroundJobCount === BACKGROUND_JOB_RING_N) {
      backgroundJobDroppedRecords++;
      if (replaced && replaced.terminal == null) backgroundJobOverwrittenActiveRecords++;
    } else {
      backgroundJobCount++;
    }
    backgroundJobRecords[backgroundJobHead] = record;
    backgroundJobHead = (backgroundJobHead + 1) % BACKGROUND_JOB_RING_N;
  }

  function resetBackgroundJobRecords(reason = 'measurement-reset') {
    for (const record of activeBackgroundJobs) closeBackgroundJob(record, reason);
    activeBackgroundJobs.clear();
    backgroundJobRecords.fill(undefined);
    backgroundJobHead = 0;
    backgroundJobCount = 0;
    backgroundJobDroppedRecords = 0;
    backgroundJobOverwrittenActiveRecords = 0;
    backgroundJobRefusedStarts = 0;
  }

  function backgroundJobReport() {
    const records = [];
    const start = (backgroundJobHead - backgroundJobCount + BACKGROUND_JOB_RING_N)
      % BACKGROUND_JOB_RING_N;
    for (let index = 0; index < backgroundJobCount; index++) {
      const record = backgroundJobRecords[(start + index) % BACKGROUND_JOB_RING_N];
      if (!record) continue;
      records.push({
        schema: record.schema,
        backgroundJobId: record.backgroundJobId,
        kind: record.kind,
        sourceSequence: record.sourceSequence,
        origin: { ...record.origin },
        startedAtMs: record.startedAtMs,
        terminal: record.terminal,
        endedAtMs: record.endedAtMs,
        durationMs: record.durationMs,
        endOrigin: record.endOrigin ? { ...record.endOrigin } : null,
      });
    }
    return {
      schema: 'spaceface.performanceBackgroundJobs.v1',
      enabled: backgroundJobTrackingEnabled,
      capacity: BACKGROUND_JOB_RING_N,
      activeCount: activeBackgroundJobs.size,
      droppedRecords: backgroundJobDroppedRecords,
      overwrittenActiveRecords: backgroundJobOverwrittenActiveRecords,
      refusedStarts: backgroundJobRefusedStarts,
      records,
    };
  }

  function classifyBacklogCause(steps, shedBacklog) {
    if ((steps | 0) <= 1 && !shedBacklog) return 'none';

    const frameIntervalMs = Math.max(loop.lastFrameDtMs, loop.callbackIntervalMs);
    const frameExcessMs = Math.max(0, frameIntervalMs - fixedFrameBudgetMs);
    const ownedOverrunMs = Math.max(0, previousCallbackMs - fixedFrameBudgetMs);
    const admissionSignificant = frameAdmissionMs >= Math.max(1, frameExcessMs * 0.25);

    if (admissionSignificant && frameAdmissionMs >= ownedOverrunMs) return 'admission';
    if (ownedOverrunMs > 0) {
      const nonUiPresentationMs = Math.max(0, previousPresentationMs - previousUiMs);
      if (previousSimFrameMs >= nonUiPresentationMs && previousSimFrameMs >= previousUiMs) {
        return 'simulation';
      }
      return previousUiMs >= nonUiPresentationMs ? 'ui' : 'presentation';
    }
    if (admissionSignificant) return 'admission';
    return 'external-scheduling';
  }

  function countBacklogCause(cause) {
    if (cause === 'external-scheduling') backlogCauseCounts.externalScheduling++;
    else if (Object.prototype.hasOwnProperty.call(backlogCauseCounts, cause)) backlogCauseCounts[cause]++;
  }

  // Tier-1 counters live here rather than in their own global because __SPACEFACE_PERF__ is
  // published unconditionally (see the end of this function) while window.SF is debug-gated, and
  // invariant #5 requires the browser and Electron routes to expose the same surface.
  // Deliberately NOT folded into getReport(): that report's shape is pinned by existing gates, and
  // counters are a separate evidence tier that must never be blended with the timings above.
  // Named tier1Counters, not `counters`: this function already has a `counters` local holding the
  // pre-existing spatial-hash and VFX tallies, and the two are different things.
  const tier1Counters = createPerfCounters();

  const api = {
    __spacefacePerfV1: true,
    RING_N,
    // Exposed as `tier1`, not `counters`, because getReport() already returns a `counters` block
    // holding the pre-existing spatial-hash and VFX tallies. Two surfaces called `counters` meaning
    // different things is exactly the ambiguity a later reader would resolve wrongly.
    tier1: tier1Counters,
    getCounterSnapshot() { return tier1Counters.snapshot(); },
    get systemTimingEnabled() { return systemTimingEnabled; },
    isSystemTimingEnabled() { return systemTimingEnabled === true; },
    shouldMeasureSystemsThisStep(simTick) {
      return systemTimingEnabled === true && shouldSampleSystemTimingTick(simTick);
    },
    get systemTimingSampling() {
      return {
        schema: 'spaceface.systemTimingSampling.v1',
        periodTicks: SYSTEM_TIMING_SAMPLE_PERIOD_TICKS,
        samplesPerPeriod: SYSTEM_TIMING_SAMPLES_PER_PERIOD,
        strategy: 'prime-period-stratified',
      };
    },
    setSystemTimingEnabled(on) {
      systemTimingEnabled = !!on;
      return systemTimingEnabled;
    },
    get renderWorkEnabled() { return renderWorkEnabled; },
    isRenderWorkEnabled() { return renderWorkEnabled === true; },
    setRenderWorkEnabled(on) {
      renderWorkEnabled = !!on;
      return renderWorkEnabled;
    },
    get hitchAttributionEnabled() { return hitchAttributionEnabled; },
    setHitchAttributionEnabled(on) {
      hitchAttributionEnabled = !!on;
      return hitchAttributionEnabled;
    },
    getHitchHistogram() {
      return hitchHistogramReport(hitchHistogram);
    },
    get backgroundJobTrackingEnabled() { return backgroundJobTrackingEnabled; },
    isBackgroundJobTrackingEnabled() { return backgroundJobTrackingEnabled === true; },
    setBackgroundJobTrackingEnabled(on) {
      const next = !!on;
      if (!next && backgroundJobTrackingEnabled) {
        for (const record of [...activeBackgroundJobs]) {
          closeBackgroundJob(record, 'measurement-disabled');
        }
      }
      backgroundJobTrackingEnabled = next;
      return backgroundJobTrackingEnabled;
    },
    setDisplayIntervalMs(intervalMs) {
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new TypeError('performance display interval must be a positive finite number');
      }
      if (frameStats.count !== 0) {
        throw new Error('performance timing report must be reset before setting display interval');
      }
      if (qualificationIntervalValues !== null) {
        throw new Error('qualification frame capture must be cleared before changing display interval');
      }
      displayIntervalMs = intervalMs;
      displayCadenceObservedIntervals = 0;
      missedVsync = 0;
      return displayIntervalMs;
    },
    beginQualificationFrameCapture(maxIntervals) {
      if (displayIntervalMs === null) {
        throw new Error('display interval must be calibrated before qualification frame capture');
      }
      if (frameStats.count !== 0) {
        throw new Error('performance timing report must be reset before qualification frame capture');
      }
      if (!Number.isSafeInteger(maxIntervals) || maxIntervals <= 0
        || maxIntervals > MAX_QUALIFICATION_INTERVAL_SAMPLES) {
        throw new RangeError(
          `qualification frame capture capacity must be 1..${MAX_QUALIFICATION_INTERVAL_SAMPLES}`,
        );
      }
      qualificationIntervalValues = new Float64Array(maxIntervals);
      qualificationIntervalCount = 0;
      qualificationIntervalOverflow = 0;
      return maxIntervals;
    },
    clearQualificationFrameCapture() {
      const wasEnabled = qualificationIntervalValues !== null;
      qualificationIntervalValues = null;
      qualificationIntervalCount = 0;
      qualificationIntervalOverflow = 0;
      displayIntervalMs = null;
      displayCadenceObservedIntervals = 0;
      missedVsync = 0;
      return wasEnabled;
    },
    getQualificationFrameReport() {
      if (qualificationIntervalValues === null) {
        return {
          schema: 'spaceface.qualificationFrameIntervals.v1',
          enabled: false,
          capacity: 0,
          samples: 0,
          overflow: 0,
          p50: 0,
          p95: 0,
          p99: 0,
          max: 0,
          raw: [],
        };
      }
      const raw = Array.from(qualificationIntervalValues.subarray(0, qualificationIntervalCount));
      const sorted = qualificationIntervalValues.slice(0, qualificationIntervalCount);
      sorted.sort();
      return {
        schema: 'spaceface.qualificationFrameIntervals.v1',
        enabled: true,
        capacity: qualificationIntervalValues.length,
        samples: qualificationIntervalCount,
        overflow: qualificationIntervalOverflow,
        p50: percentile(sorted, 0.50),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        max: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
        raw,
      };
    },
    beginBackgroundJob(kind, { sourceSequence = null } = {}) {
      if (!backgroundJobTrackingEnabled) return null;
      if (typeof kind !== 'string' || !kind.trim()) {
        throw new TypeError('performance background job kind must be a non-empty string');
      }
      if (activeBackgroundJobs.size >= BACKGROUND_JOB_RING_N) {
        backgroundJobRefusedStarts++;
        return null;
      }
      if (backgroundJobId >= Number.MAX_SAFE_INTEGER) {
        throw new Error('performance background job identity exhausted');
      }
      backgroundJobId++;
      const record = {
        schema: 'spaceface.performanceBackgroundJob.v1',
        backgroundJobId,
        kind: kind.trim().slice(0, 80),
        sourceSequence: Number.isSafeInteger(sourceSequence) ? sourceSequence : null,
        origin: backgroundJobOrigin(),
        startedAtMs: nowMs(),
        terminal: null,
        endedAtMs: null,
        durationMs: null,
        endOrigin: null,
      };
      activeBackgroundJobs.add(record);
      appendBackgroundJob(record);
      return record;
    },
    endBackgroundJob(record, terminal = 'completed') {
      return closeBackgroundJob(record, terminal);
    },
    beginFrame(frameDt, callbackStartMs = null, callbackTimestampMs = null, frameBudgetMs = null) {
      if (displayFrameId >= Number.MAX_SAFE_INTEGER) {
        throw new Error('performance display frame identity exhausted');
      }
      displayFrameId++;
      const ms = Number.isFinite(frameDt) ? frameDt * 1000 : 0;
      const nextCallbackStartMs = Number.isFinite(callbackStartMs) ? callbackStartMs : null;
      const nextCallbackIntervalMs = nextCallbackStartMs !== null && previousCallbackStartMs !== null
        ? Math.max(0, nextCallbackStartMs - previousCallbackStartMs)
        : 0;
      const rawCallbackGapMs = nextCallbackStartMs !== null && previousCallbackEndMs !== null
        ? Math.max(0, nextCallbackStartMs - previousCallbackEndMs)
        : 0;
      const nextExternalCallbackGapMs = Math.max(0, rawCallbackGapMs - pendingExternalAdmissionMs);
      const nextCallbackDispatchLagMs = nextCallbackStartMs !== null
        && Number.isFinite(callbackTimestampMs)
        ? Math.max(0, nextCallbackStartMs - callbackTimestampMs)
        : 0;
      // lastFrameDtMs is the interval that just ended. framePhaseMs still holds that
      // interval's work until we reset it below.
      if (hitchAttributionEnabled) {
        let nestedPresentationMs = 0;
        for (const owner of FRAME_HITCH_DETAIL_OWNERS) {
          nestedPresentationMs += frameNestedPresentationMs[owner];
        }
        if (isHitchFrame(ms)) {
          accumulateHitch(hitchHistogram, classifyHitchFrame({
            frameMs: ms,
            simMs: framePhaseMs.simFrame,
            presentMs: Math.max(0, framePhaseMs.render - nestedPresentationMs),
            uiMs: framePhaseMs.ui,
            vfxMs: framePhaseMs.vfx,
            feelMs: framePhaseMs.feel,
            untrackedMs: frameUntrackedStats.last,
            admissionMs: pendingAdmissionMs,
            scheduleMs: Math.max(nextExternalCallbackGapMs, nextCallbackDispatchLagMs),
            compileMs: frameHitchOwnerMs.compile,
            uploadMs: frameHitchOwnerMs.upload,
            composeMs: frameHitchOwnerMs.compose,
            meshBuildMs: frameHitchOwnerMs.meshBuild,
            shadowMs: frameHitchOwnerMs.shadow,
            speedLinesMs: frameHitchOwnerMs.speedLines,
            bloomMs: frameHitchOwnerMs.bloom,
            gcMs: frameHitchOwnerMs.gc,
            restoreMs: frameHitchOwnerMs.restore,
            autosaveMs: frameHitchOwnerMs.autosave,
          }));
        } else {
          accumulateHitch(hitchHistogram, null);
        }
        resetFrameHitchOwnerTotals(frameHitchOwnerMs);
        resetFrameHitchOwnerTotals(frameNestedPresentationMs);
      }
      previousCallbackMs = frameCallbackStats.last;
      previousSimFrameMs = framePhaseMs.simFrame;
      previousPresentationMs = framePhaseMs.presentation;
      previousUiMs = framePhaseMs.ui;
      framePhaseMs.sim = 0;
      framePhaseMs.simFrame = 0;
      framePhaseMs.presentation = 0;
      framePhaseMs.render = 0;
      framePhaseMs.vfx = 0;
      framePhaseMs.feel = 0;
      framePhaseMs.ui = 0;
      fixedFrameBudgetMs = Number.isFinite(frameBudgetMs) && frameBudgetMs > 0
        ? frameBudgetMs
        : 1000 / 60;
      currentCallbackStartMs = nextCallbackStartMs;
      callbackOpen = true;
      loop.lastFrameDtMs = ms;
      loop.callbackIntervalMs = nextCallbackIntervalMs;
      if (currentCallbackStartMs !== null && previousCallbackStartMs !== null) {
        sample(frameCallbackIntervalStats, loop.callbackIntervalMs);
        if (displayIntervalMs !== null) {
          displayCadenceObservedIntervals++;
          const elapsedIntervals = Math.max(
            1,
            Math.floor((loop.callbackIntervalMs / displayIntervalMs) + 0.5),
          );
          missedVsync += Math.max(0, elapsedIntervals - 1);
          if (qualificationIntervalValues !== null) {
            if (qualificationIntervalCount < qualificationIntervalValues.length) {
              qualificationIntervalValues[qualificationIntervalCount++] = loop.callbackIntervalMs;
            } else {
              qualificationIntervalOverflow++;
            }
          }
        }
      }
      frameAdmissionMs = pendingAdmissionMs;
      frameExternalAdmissionMs = pendingExternalAdmissionMs;
      pendingAdmissionMs = 0;
      pendingExternalAdmissionMs = 0;
      loop.admissionMs = frameAdmissionMs;
      loop.externalCallbackGapMs = nextExternalCallbackGapMs;
      loop.callbackDispatchLagMs = nextCallbackDispatchLagMs;
      loop.backlogCause = 'none';
      frameAccountedMs = 0;
      sample(frameStats, ms);
      sample(frameExternalGapStats, loop.externalCallbackGapMs);
      sample(frameDispatchLagStats, loop.callbackDispatchLagMs);
      sample(phaseStats.admission, frameAdmissionMs);
    },
    beginRenderFrame(simTick) {
      if (!Number.isSafeInteger(simTick) || simTick < 0) {
        throw new TypeError('performance render origin simTick must be a non-negative safe integer');
      }
      if (renderFrameId >= Number.MAX_SAFE_INTEGER) {
        throw new Error('performance render frame identity exhausted');
      }
      renderFrameId++;
      currentSimTick = simTick;
      return renderFrameId;
    },
    readFrameIdentity(out = {}) {
      out.schema = 'spaceface.performanceFrameOrigin.v1';
      out.displayFrameId = displayFrameId;
      out.renderFrameId = renderFrameId;
      out.simTick = currentSimTick;
      return out;
    },
    recordLoop(steps, shedBacklog, accumulatorS, shedSteps = 0) {
      loop.stepsThisFrame = steps | 0;
      if (loop.stepsThisFrame > loop.maxStepsThisFrame) loop.maxStepsThisFrame = loop.stepsThisFrame;
      if (loop.stepsThisFrame > 1) loop.multiStepFrames++;
      if (shedBacklog) loop.shedBacklogFrames++;
      const shed = Number.isFinite(shedSteps) ? (shedSteps | 0) : 0;
      if (shed > 0) loop.shedStepsTotal += shed;
      loop.accumulatorS = Number.isFinite(accumulatorS) ? accumulatorS : 0;
      loop.backlogCause = classifyBacklogCause(loop.stepsThisFrame, shedBacklog);
      countBacklogCause(loop.backlogCause);
    },
    recordStepTotal(ms) {
      if (Number.isFinite(ms) && ms >= 0) framePhaseMs.sim = ms;
      sample(phaseStats.sim, ms);
    },
    recordSimFrame(ms) {
      frameAccountedMs += Number.isFinite(ms) && ms > 0 ? ms : 0;
      if (Number.isFinite(ms) && ms >= 0) framePhaseMs.simFrame = ms;
      sample(phaseStats.simFrame, ms);
    },
    recordPresentationFrame(ms) {
      // This owner boundary contains render/VFX/feel/UI. Those child phases already contribute to
      // frameAccountedMs, so sampling the aggregate again must not double-count callback work.
      if (Number.isFinite(ms) && ms >= 0) framePhaseMs.presentation = ms;
      sample(phaseStats.presentation, ms);
    },
    recordAdmissionWork(ms) {
      // Carry measured synchronous admission slices into the next game frame. Keep slices that ran
      // between callbacks separate so only those are removed from the external callback gap.
      if (!Number.isFinite(ms) || ms <= 0) return;
      pendingAdmissionMs += ms;
      if (!callbackOpen) pendingExternalAdmissionMs += ms;
    },
    recordSystem(name, ms) {
      // Defense-in-depth: registry avoids the clocks too, while direct callers cannot accidentally
      // refill detailed rings after a diagnostic window has closed.
      if (!systemTimingEnabled) return;
      sample(statForSystem(name), ms);
    },
    recordRenderWork(name, ms) {
      // Defense-in-depth: no ring write when measurement is disabled.
      if (!renderWorkEnabled) return;
      sample(statForRenderWork(name), ms);
      if (!hitchAttributionEnabled || !Number.isFinite(ms) || ms <= 0) return;
      const owner = renderWorkHitchOwner(name);
      if (!owner) return;
      frameHitchOwnerMs[owner] += ms;
      if (callbackOpen) frameNestedPresentationMs[owner] += ms;
    },
    recordPhase(name, ms) {
      const stat = phaseStats[name];
      frameAccountedMs += Number.isFinite(ms) && ms > 0 ? ms : 0;
      if (Number.isFinite(ms) && ms >= 0
        && Object.prototype.hasOwnProperty.call(framePhaseMs, name)) {
        framePhaseMs[name] = ms;
      }
      if (stat) sample(stat, ms);
    },
    recordFrameCallback(ms) {
      sample(frameCallbackStats, ms);
      sample(frameUntrackedStats, Math.max(0, ms - frameAccountedMs));
      if (currentCallbackStartMs !== null && Number.isFinite(ms) && ms >= 0) {
        previousCallbackStartMs = currentCallbackStartMs;
        previousCallbackEndMs = currentCallbackStartMs + ms;
      }
      callbackOpen = false;
    },
    /**
     * Copy the current frame's scalar timing state into a caller-owned object.
     * Probes call this only during bounded measurement windows. Normal gameplay pays no clocks,
     * allocations, or property-copy work for this optional read surface.
     */
    readFrameSample(out = {}) {
      out.frameDtMs = loop.lastFrameDtMs;
      out.stepsThisFrame = loop.stepsThisFrame;
      out.shedBacklogFrames = loop.shedBacklogFrames;
      out.shedStepsTotal = loop.shedStepsTotal;
      out.callbackMs = frameCallbackStats.last;
      out.untrackedMs = frameUntrackedStats.last;
      out.callbackIntervalMs = loop.callbackIntervalMs;
      out.externalCallbackGapMs = loop.externalCallbackGapMs;
      out.callbackDispatchLagMs = loop.callbackDispatchLagMs;
      out.backlogCause = loop.backlogCause;
      out.simMs = framePhaseMs.sim;
      out.simFrameMs = framePhaseMs.simFrame;
      out.presentationMs = framePhaseMs.presentation;
      out.renderMs = framePhaseMs.render;
      out.vfxMs = framePhaseMs.vfx;
      out.feelMs = framePhaseMs.feel;
      out.uiMs = framePhaseMs.ui;
      out.admissionMs = loop.admissionMs;
      return out;
    },
    recordSpatialHash({
      rebuilds = 0,
      dynamicRebuilds = 0,
      dynamicFullRebuilds = 0,
      dynamicReinserts = 0,
      dynamicUnchanged = 0,
      queries = 0,
      candidates = 0,
    } = {}) {
      counters.spatialHash.rebuilds += rebuilds | 0;
      counters.spatialHash.dynamicRebuilds += dynamicRebuilds | 0;
      counters.spatialHash.dynamicFullRebuilds += dynamicFullRebuilds | 0;
      counters.spatialHash.dynamicReinserts += dynamicReinserts | 0;
      counters.spatialHash.dynamicUnchanged += dynamicUnchanged | 0;
      counters.spatialHash.queries += queries | 0;
      counters.spatialHash.candidates += candidates | 0;
      // Tier-1 causal mirror: query candidates are the broad-phase work unit. Disabled = one
      // boolean read inside the counter; no allocation crosses the boundary either way.
      if (candidates > 0 && tier1Counters.isEnabled()) tier1Counters.countQueryCandidates(candidates | 0);
    },
    recordVfxTrails(stats = {}) {
      const dst = counters.vfxTrails;
      dst.trailCandidates = Number(stats.trailCandidates) || 0;
      dst.trailEmittersFull = Number(stats.trailEmittersFull) || 0;
      dst.trailEmittersNormal = Number(stats.trailEmittersNormal) || 0;
      dst.trailEmittersReduced = Number(stats.trailEmittersReduced) || 0;
      dst.trailEmittersSkipped = Number(stats.trailEmittersSkipped) || 0;
      dst.trailParticlesSpawned = Number(stats.trailParticlesSpawned) || 0;
      dst.trailSpritesSpawned = Number(stats.trailSpritesSpawned) || 0;
    },
    recordVfxSubsystems(stats = {}) {
      const dst = counters.vfxSubsystems;
      dst.trails = Number(stats.trails) || 0;
      dst.ribbons = Number(stats.ribbons) || 0;
      dst.miningBeam = Number(stats.miningBeam) || 0;
      dst.tetherCable = Number(stats.tetherCable) || 0;
      dst.seamMarkers = Number(stats.seamMarkers) || 0;
      dst.energy = Number(stats.energy) || 0;
      dst.particles = Number(stats.particles) || 0;
      dst.sprites = Number(stats.sprites) || 0;
      dst.eventLights = Number(stats.eventLights) || 0;
    },
    recordSave(timing = {}) {
      const totalMs = Number(timing.totalMs);
      const autosave = !!timing.autosave;
      const ok = timing.ok !== false;
      // Tier-1 causal mirror: one snapshot event per completed save with the serializer count.
      if (tier1Counters.isEnabled()) {
        tier1Counters.countSaveSnapshot(
          Array.isArray(timing.serializerTimings) ? timing.serializerTimings.length : 0,
        );
      }
      saveStats.count++;
      if (autosave) saveStats.autosaveCount++;
      if (!ok) saveStats.errorCount++;
      if (timing.observedTargetMet === false) saveStats.targetMissCount++;
      if (timing.observedHardLimitMet === false) saveStats.hardLimitMissCount++;
      if (Number.isFinite(totalMs) && totalMs >= 0) {
        sample(saveStats.all, totalMs);
        if (autosave) sample(saveStats.autosave, totalMs);
      }
      if (hitchAttributionEnabled && autosave) {
        const blockingMs = Number(timing.totalBlockingMs);
        if (Number.isFinite(blockingMs) && blockingMs > 0) {
          frameHitchOwnerMs.autosave += blockingMs;
        }
      }
      for (const [field, stat] of [
        ['elapsedMs', saveStats.elapsed],
        ['totalCpuMs', saveStats.totalCpu],
        ['totalBlockingMs', saveStats.totalBlocking],
        ['maxBlockingSliceMs', saveStats.maxBlockingSlice],
        ['maxSerializerMs', saveStats.maxSerializer],
        ['serializeMs', saveStats.serialize],
        ['writeMs', saveStats.write],
        ['stringifyMs', saveStats.stringify],
        ['storageMs', saveStats.storage],
        ['indexMs', saveStats.index],
        ['backupMs', saveStats.backup],
        ['readbackMs', saveStats.readback],
        ['verifyMs', saveStats.verify],
        ['workerSetupMs', saveStats.workerSetup],
        ['workerDispatchMs', saveStats.workerDispatch],
        ['workerRoundtripMs', saveStats.workerRoundtrip],
        ['bytes', saveStats.bytes],
      ]) {
        const value = Number(timing[field]);
        if (Number.isFinite(value) && value >= 0) sample(stat, value);
      }
      const plain = plainTiming(timing);
      saveStats.last = plain;
      if (autosave) saveStats.autosaveLast = plain;
    },
    reset() {
      hitchHistogram.frames = 0;
      hitchHistogram.hitches = 0;
      hitchHistogram.named = 0;
      hitchHistogram.unknown = 0;
      for (const owner of Object.keys(hitchHistogram.counts)) hitchHistogram.counts[owner] = 0;
      resetFrameHitchOwnerTotals(frameHitchOwnerMs);
      resetFrameHitchOwnerTotals(frameNestedPresentationMs);
      resetBackgroundJobRecords();
      resetStat(frameStats);
      resetStat(frameCallbackStats);
      resetStat(frameUntrackedStats);
      resetStat(frameCallbackIntervalStats);
      resetStat(frameExternalGapStats);
      resetStat(frameDispatchLagStats);
      for (const stat of Object.values(phaseStats)) resetStat(stat);
      for (const stat of Object.values(systemStats)) resetStat(stat);
      for (const stat of Object.values(renderWorkStats)) resetStat(stat);
      frameAccountedMs = 0;
      pendingAdmissionMs = 0;
      pendingExternalAdmissionMs = 0;
      frameAdmissionMs = 0;
      frameExternalAdmissionMs = 0;
      callbackOpen = false;
      currentCallbackStartMs = null;
      previousCallbackStartMs = null;
      previousCallbackEndMs = null;
      previousCallbackMs = 0;
      previousSimFrameMs = 0;
      previousPresentationMs = 0;
      previousUiMs = 0;
      fixedFrameBudgetMs = 1000 / 60;
      displayCadenceObservedIntervals = 0;
      missedVsync = 0;
      qualificationIntervalCount = 0;
      qualificationIntervalOverflow = 0;
      framePhaseMs.sim = 0;
      framePhaseMs.simFrame = 0;
      framePhaseMs.presentation = 0;
      framePhaseMs.render = 0;
      framePhaseMs.vfx = 0;
      framePhaseMs.feel = 0;
      framePhaseMs.ui = 0;
      loop.stepsThisFrame = 0;
      loop.maxStepsThisFrame = 0;
      loop.multiStepFrames = 0;
      loop.shedBacklogFrames = 0;
      loop.shedStepsTotal = 0;
      loop.accumulatorS = 0;
      loop.lastFrameDtMs = 0;
      loop.callbackIntervalMs = 0;
      loop.externalCallbackGapMs = 0;
      loop.callbackDispatchLagMs = 0;
      loop.admissionMs = 0;
      loop.backlogCause = 'none';
      for (const key of Object.keys(backlogCauseCounts)) backlogCauseCounts[key] = 0;
      counters.spatialHash.rebuilds = 0;
      counters.spatialHash.dynamicRebuilds = 0;
      counters.spatialHash.dynamicFullRebuilds = 0;
      counters.spatialHash.dynamicReinserts = 0;
      counters.spatialHash.dynamicUnchanged = 0;
      counters.spatialHash.queries = 0;
      counters.spatialHash.candidates = 0;
      counters.vfxTrails.trailCandidates = 0;
      counters.vfxTrails.trailEmittersFull = 0;
      counters.vfxTrails.trailEmittersNormal = 0;
      counters.vfxTrails.trailEmittersReduced = 0;
      counters.vfxTrails.trailEmittersSkipped = 0;
      counters.vfxTrails.trailParticlesSpawned = 0;
      counters.vfxTrails.trailSpritesSpawned = 0;
      counters.vfxSubsystems.trails = 0;
      counters.vfxSubsystems.ribbons = 0;
      counters.vfxSubsystems.miningBeam = 0;
      counters.vfxSubsystems.tetherCable = 0;
      counters.vfxSubsystems.seamMarkers = 0;
      counters.vfxSubsystems.energy = 0;
      counters.vfxSubsystems.particles = 0;
      counters.vfxSubsystems.sprites = 0;
      counters.vfxSubsystems.eventLights = 0;
      for (const stat of [
        saveStats.all,
        saveStats.autosave,
        saveStats.elapsed,
        saveStats.totalCpu,
        saveStats.totalBlocking,
        saveStats.maxBlockingSlice,
        saveStats.maxSerializer,
        saveStats.serialize,
        saveStats.write,
        saveStats.stringify,
        saveStats.storage,
        saveStats.index,
        saveStats.backup,
        saveStats.readback,
        saveStats.verify,
        saveStats.workerSetup,
        saveStats.workerDispatch,
        saveStats.workerRoundtrip,
        saveStats.bytes,
      ]) resetStat(stat);
      saveStats.count = 0;
      saveStats.autosaveCount = 0;
      saveStats.errorCount = 0;
      saveStats.targetMissCount = 0;
      saveStats.hardLimitMissCount = 0;
      saveStats.last = null;
      saveStats.autosaveLast = null;
    },
    getReport() {
      const systems = {};
      for (const name of Object.keys(systemStats)) systems[name] = reportStat(systemStats[name]);
      const renderWork = {};
      for (const name of Object.keys(renderWorkStats)) renderWork[name] = reportStat(renderWorkStats[name]);
      return {
        hitchAttribution: hitchHistogramReport(hitchHistogram),
        systemTimingEnabled,
        systemTimingSampling: {
          schema: 'spaceface.systemTimingSampling.v1',
          periodTicks: SYSTEM_TIMING_SAMPLE_PERIOD_TICKS,
          samplesPerPeriod: SYSTEM_TIMING_SAMPLES_PER_PERIOD,
          strategy: 'prime-period-stratified',
        },
        frame: reportStat(frameStats),
        frameCallback: reportStat(frameCallbackStats),
        frameUntracked: reportStat(frameUntrackedStats),
        frameCallbackInterval: reportStat(frameCallbackIntervalStats),
        frameExternalGap: reportStat(frameExternalGapStats),
        frameDispatchLag: reportStat(frameDispatchLagStats),
        displayCadence: {
          valid: displayIntervalMs !== null,
          displayIntervalMs,
          observedIntervals: displayCadenceObservedIntervals,
          missedVsync,
        },
        loop: {
          ...loop,
          backlogCauseCounts: { ...backlogCauseCounts },
        },
        phases: {
          sim: reportStat(phaseStats.sim),
          simFrame: reportStat(phaseStats.simFrame),
          presentation: reportStat(phaseStats.presentation),
          render: reportStat(phaseStats.render),
          vfx: reportStat(phaseStats.vfx),
          feel: reportStat(phaseStats.feel),
          ui: reportStat(phaseStats.ui),
          admission: reportStat(phaseStats.admission),
        },
        systems,
        renderWork,
        backgroundJobs: backgroundJobReport(),
        saves: {
          count: saveStats.count,
          autosaveCount: saveStats.autosaveCount,
          errorCount: saveStats.errorCount,
          targetMissCount: saveStats.targetMissCount,
          hardLimitMissCount: saveStats.hardLimitMissCount,
          all: reportStat(saveStats.all),
          autosave: reportStat(saveStats.autosave),
          elapsed: reportStat(saveStats.elapsed),
          totalCpu: reportStat(saveStats.totalCpu),
          totalBlocking: reportStat(saveStats.totalBlocking),
          maxBlockingSlice: reportStat(saveStats.maxBlockingSlice),
          maxSerializer: reportStat(saveStats.maxSerializer),
          serialize: reportStat(saveStats.serialize),
          write: reportStat(saveStats.write),
          stringify: reportStat(saveStats.stringify),
          storage: reportStat(saveStats.storage),
          index: reportStat(saveStats.index),
          backup: reportStat(saveStats.backup),
          readback: reportStat(saveStats.readback),
          verify: reportStat(saveStats.verify),
          workerSetup: reportStat(saveStats.workerSetup),
          workerDispatch: reportStat(saveStats.workerDispatch),
          workerRoundtrip: reportStat(saveStats.workerRoundtrip),
          bytes: reportStat(saveStats.bytes),
          last: saveStats.last,
          autosaveLast: saveStats.autosaveLast,
        },
        counters: {
          spatialHash: { ...counters.spatialHash },
          vfxTrails: { ...counters.vfxTrails },
          vfxSubsystems: { ...counters.vfxSubsystems },
        },
        entities: entityCounts(state),
        settings: {
          video: videoSettings(state),
        },
      };
    },
  };

  state.perfRuntime = api;
  if (typeof window !== 'undefined') window.__SPACEFACE_PERF__ = api;
  return api;
}
