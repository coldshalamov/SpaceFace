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
    render: createStat(),
    vfx: createStat(),
    feel: createStat(),
    ui: createStat(),
  };
  const systemStats = Object.create(null);
  const frameStats = createStat();
  const frameCallbackStats = createStat();
  const frameUntrackedStats = createStat();
  let frameAccountedMs = 0;
  const loop = {
    stepsThisFrame: 0,
    maxStepsThisFrame: 0,
    shedBacklogFrames: 0,
    accumulatorS: 0,
    lastFrameDtMs: 0,
  };
  const counters = {
    spatialHash: { rebuilds: 0, dynamicRebuilds: 0, queries: 0, candidates: 0 },
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
    serialize: createStat(),
    write: createStat(),
    stringify: createStat(),
    storage: createStat(),
    index: createStat(),
    bytes: createStat(),
    count: 0,
    autosaveCount: 0,
    errorCount: 0,
    last: null,
    autosaveLast: null,
  };
  const renderWorkStats = Object.create(null);

  function statForSystem(name) {
    const key = name || 'unknown';
    return systemStats[key] || (systemStats[key] = createStat());
  }

  function statForRenderWork(name) {
    const key = name || 'unknown';
    return renderWorkStats[key] || (renderWorkStats[key] = createStat());
  }

  const api = {
    __spacefacePerfV1: true,
    RING_N,
    beginFrame(frameDt) {
      const ms = Number.isFinite(frameDt) ? frameDt * 1000 : 0;
      loop.lastFrameDtMs = ms;
      frameAccountedMs = 0;
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
    recordSimFrame(ms) {
      frameAccountedMs += Number.isFinite(ms) && ms > 0 ? ms : 0;
      sample(phaseStats.simFrame, ms);
    },
    recordSystem(name, ms) {
      sample(statForSystem(name), ms);
    },
    recordRenderWork(name, ms) {
      sample(statForRenderWork(name), ms);
    },
    recordPhase(name, ms) {
      const stat = phaseStats[name];
      frameAccountedMs += Number.isFinite(ms) && ms > 0 ? ms : 0;
      if (stat) sample(stat, ms);
    },
    recordFrameCallback(ms) {
      sample(frameCallbackStats, ms);
      sample(frameUntrackedStats, Math.max(0, ms - frameAccountedMs));
    },
    recordSpatialHash({ rebuilds = 0, dynamicRebuilds = 0, queries = 0, candidates = 0 } = {}) {
      counters.spatialHash.rebuilds += rebuilds | 0;
      counters.spatialHash.dynamicRebuilds += dynamicRebuilds | 0;
      counters.spatialHash.queries += queries | 0;
      counters.spatialHash.candidates += candidates | 0;
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
      saveStats.count++;
      if (autosave) saveStats.autosaveCount++;
      if (!ok) saveStats.errorCount++;
      if (Number.isFinite(totalMs) && totalMs >= 0) {
        sample(saveStats.all, totalMs);
        if (autosave) sample(saveStats.autosave, totalMs);
      }
      for (const [field, stat] of [
        ['serializeMs', saveStats.serialize],
        ['writeMs', saveStats.write],
        ['stringifyMs', saveStats.stringify],
        ['storageMs', saveStats.storage],
        ['indexMs', saveStats.index],
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
      resetStat(frameStats);
      resetStat(frameCallbackStats);
      resetStat(frameUntrackedStats);
      for (const stat of Object.values(phaseStats)) resetStat(stat);
      for (const stat of Object.values(systemStats)) resetStat(stat);
      for (const stat of Object.values(renderWorkStats)) resetStat(stat);
      frameAccountedMs = 0;
      loop.stepsThisFrame = 0;
      loop.maxStepsThisFrame = 0;
      loop.shedBacklogFrames = 0;
      loop.accumulatorS = 0;
      loop.lastFrameDtMs = 0;
      counters.spatialHash.rebuilds = 0;
      counters.spatialHash.dynamicRebuilds = 0;
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
        saveStats.serialize,
        saveStats.write,
        saveStats.stringify,
        saveStats.storage,
        saveStats.index,
        saveStats.bytes,
      ]) resetStat(stat);
      saveStats.count = 0;
      saveStats.autosaveCount = 0;
      saveStats.errorCount = 0;
      saveStats.last = null;
      saveStats.autosaveLast = null;
    },
    getReport() {
      const systems = {};
      for (const name of Object.keys(systemStats)) systems[name] = reportStat(systemStats[name]);
      const renderWork = {};
      for (const name of Object.keys(renderWorkStats)) renderWork[name] = reportStat(renderWorkStats[name]);
      return {
        frame: reportStat(frameStats),
        frameCallback: reportStat(frameCallbackStats),
        frameUntracked: reportStat(frameUntrackedStats),
        loop: { ...loop },
        phases: {
          sim: reportStat(phaseStats.sim),
          simFrame: reportStat(phaseStats.simFrame),
          render: reportStat(phaseStats.render),
          vfx: reportStat(phaseStats.vfx),
          feel: reportStat(phaseStats.feel),
          ui: reportStat(phaseStats.ui),
        },
        systems,
        renderWork,
        saves: {
          count: saveStats.count,
          autosaveCount: saveStats.autosaveCount,
          errorCount: saveStats.errorCount,
          all: reportStat(saveStats.all),
          autosave: reportStat(saveStats.autosave),
          serialize: reportStat(saveStats.serialize),
          write: reportStat(saveStats.write),
          stringify: reportStat(saveStats.stringify),
          storage: reportStat(saveStats.storage),
          index: reportStat(saveStats.index),
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
