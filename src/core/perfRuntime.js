const RING_N = 180;

function nowMs() {
  return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
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
  for (let i = 0; i < stat.count; i++) {
    const v = stat.values[i];
    stat.scratch[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  let p95 = 0;
  if (stat.count > 0) {
    const sub = stat.scratch.subarray(0, stat.count);
    Array.prototype.sort.call(sub, (a, b) => a - b);
    p95 = sub[Math.min(stat.count - 1, Math.floor(0.95 * (stat.count - 1)))];
  } else {
    min = 0;
  }
  return {
    last: stat.last,
    avg: stat.count ? stat.total / stat.count : 0,
    min,
    max,
    p95,
    samples: stat.count,
  };
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
    render: createStat(),
    vfx: createStat(),
    feel: createStat(),
    ui: createStat(),
  };
  const systemStats = Object.create(null);
  const frameStats = createStat();
  const loop = {
    stepsThisFrame: 0,
    maxStepsThisFrame: 0,
    shedBacklogFrames: 0,
    accumulatorS: 0,
    lastFrameDtMs: 0,
  };
  const counters = {
    spatialHash: { rebuilds: 0, queries: 0, candidates: 0 },
  };

  function statForSystem(name) {
    const key = name || 'unknown';
    return systemStats[key] || (systemStats[key] = createStat());
  }

  const api = {
    __spacefacePerfV1: true,
    RING_N,
    beginFrame(frameDt) {
      const ms = Number.isFinite(frameDt) ? frameDt * 1000 : 0;
      loop.lastFrameDtMs = ms;
      sample(frameStats, ms);
    },
    recordLoop(steps, shedBacklog, accumulatorS) {
      loop.stepsThisFrame = steps | 0;
      if (loop.stepsThisFrame > loop.maxStepsThisFrame) loop.maxStepsThisFrame = loop.stepsThisFrame;
      if (shedBacklog) loop.shedBacklogFrames++;
      loop.accumulatorS = Number.isFinite(accumulatorS) ? accumulatorS : 0;
    },
    recordStepTotal(ms) {
      sample(phaseStats.sim, ms);
    },
    recordSystem(name, ms) {
      sample(statForSystem(name), ms);
    },
    recordPhase(name, ms) {
      const stat = phaseStats[name];
      if (stat) sample(stat, ms);
    },
    recordSpatialHash({ rebuilds = 0, queries = 0, candidates = 0 } = {}) {
      counters.spatialHash.rebuilds += rebuilds | 0;
      counters.spatialHash.queries += queries | 0;
      counters.spatialHash.candidates += candidates | 0;
    },
    reset() {
      resetStat(frameStats);
      for (const stat of Object.values(phaseStats)) resetStat(stat);
      for (const stat of Object.values(systemStats)) resetStat(stat);
      loop.stepsThisFrame = 0;
      loop.maxStepsThisFrame = 0;
      loop.shedBacklogFrames = 0;
      loop.accumulatorS = 0;
      loop.lastFrameDtMs = 0;
      counters.spatialHash.rebuilds = 0;
      counters.spatialHash.queries = 0;
      counters.spatialHash.candidates = 0;
    },
    getReport() {
      const systems = {};
      for (const name of Object.keys(systemStats)) systems[name] = reportStat(systemStats[name]);
      return {
        frame: reportStat(frameStats),
        loop: { ...loop },
        phases: {
          sim: reportStat(phaseStats.sim),
          render: reportStat(phaseStats.render),
          vfx: reportStat(phaseStats.vfx),
          feel: reportStat(phaseStats.feel),
          ui: reportStat(phaseStats.ui),
        },
        systems,
        counters: {
          spatialHash: { ...counters.spatialHash },
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
