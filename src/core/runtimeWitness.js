// 1 Hz flight recorder for agents. Source inspection cannot see a frozen canvas or a hitch.
// window.__SF_WITNESS__ is the live surface; probes write a plain-language report from it.
export const RUNTIME_WITNESS_SCHEMA = 'spaceface.runtimeWitness.v1';
export const RUNTIME_WITNESS_RING = 32;
export const RUNTIME_WITNESS_PERIOD_MS = 1000;

const PHASE_NAMES = Object.freeze([
  'sim',
  'simFrame',
  'presentation',
  'render',
  'vfx',
  'feel',
  'ui',
  'admission',
]);

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hypot2(x, z) {
  return Math.hypot(finite(x), finite(z));
}

function errorText(err) {
  if (err == null) return null;
  if (typeof err === 'string') return err.slice(0, 240);
  if (typeof err.message === 'string' && err.message) return err.message.slice(0, 240);
  return String(err).slice(0, 240);
}

function readContextLost(state) {
  const recovery = state?.render?.contextRecovery;
  if (recovery?.pending === true || !!recovery?.lastError || state?.render?.contextLost === true) {
    return true;
  }
  try {
    const gl = state?.render?.renderer?.getContext?.();
    if (gl && typeof gl.isContextLost === 'function') return gl.isContextLost() === true;
  } catch (_) {
    return true;
  }
  return false;
}

function rankPhases(state) {
  const phases = state?.perfRuntime?.getReport?.()?.phases;
  if (!phases) return [];
  const ranks = [];
  for (const name of PHASE_NAMES) {
    const stat = phases[name];
    if (!stat) continue;
    const p95 = finite(stat.p95);
    const avg = finite(stat.avg);
    const max = finite(stat.max);
    if (p95 <= 0 && avg <= 0 && max <= 0) continue;
    ranks.push({ name, p95, avg, max });
  }
  ranks.sort((a, b) => b.p95 - a.p95 || b.avg - a.avg);
  return ranks.slice(0, 6);
}

function copySample(dst, src) {
  dst.wallMs = src.wallMs;
  dst.simTime = src.simTime;
  dst.tick = src.tick;
  dst.mode = src.mode;
  dst.timeScale = src.timeScale;
  dst.posX = src.posX;
  dst.posZ = src.posZ;
  dst.hasPos = src.hasPos;
  dst.speed = src.speed;
  dst.lifecycle = src.lifecycle;
  dst.suspended = src.suspended;
  dst.documentHidden = src.documentHidden;
  dst.visibilityState = src.visibilityState;
  dst.executedFrames = src.executedFrames;
  dst.renderUpdates = src.renderUpdates;
  dst.rendererFrame = src.rendererFrame;
  dst.rendererFrameObserved = src.rendererFrameObserved === true;
  dst.drawCalls = src.drawCalls;
  dst.costs = Array.isArray(src.costs) ? src.costs.slice() : [];
  dst.contextLost = src.contextLost;
  dst.lastFrameError = src.lastFrameError;
  dst.frameErrorCount = src.frameErrorCount;
  dst.callbackMs = src.callbackMs;
  dst.simMs = src.simMs;
  dst.renderMs = src.renderMs;
  dst.vfxMs = src.vfxMs;
  dst.uiMs = src.uiMs;
  dst.admissionMs = src.admissionMs;
  dst.topPhase = src.topPhase;
  dst.topPhaseP95 = src.topPhaseP95;
  dst.hitch = src.hitch;
  return dst;
}

function emptySample() {
  return {
    wallMs: 0,
    simTime: 0,
    tick: 0,
    mode: null,
    timeScale: 1,
    posX: 0,
    posZ: 0,
    hasPos: false,
    speed: 0,
    lifecycle: null,
    suspended: false,
    documentHidden: false,
    visibilityState: null,
    executedFrames: 0,
    renderUpdates: 0,
    rendererFrame: 0,
    rendererFrameObserved: false,
    drawCalls: 0,
    costs: [],
    contextLost: false,
    lastFrameError: null,
    frameErrorCount: 0,
    callbackMs: 0,
    simMs: 0,
    renderMs: 0,
    vfxMs: 0,
    uiMs: 0,
    admissionMs: 0,
    topPhase: null,
    topPhaseP95: 0,
    hitch: false,
  };
}

/**
 * One live sample from the running game. Safe to call from rAF, a 1 Hz timer, or page.evaluate.
 */
export function collectRuntimeWitnessSample(state, extras = {}, wallMs = Date.now()) {
  const diagnostics = extras.diagnostics || {};
  const player = state?.entities?.get?.(state.playerId);
  const pos = player?.pos;
  const vel = player?.vel;
  const renderer = state?.render?.renderer;
  const renderInfo = renderer?.info?.render || state?.render?.diagnostics?.info?.render || null;
  const frameSample = state?.perfRuntime?.readFrameSample?.() || null;
  const costs = extras.costs || rankPhases(state);
  const top = costs[0] || null;
  const callbackMs = finite(frameSample?.callbackMs);
  const sample = extras.into || emptySample();
  sample.wallMs = finite(wallMs, Date.now());
  sample.simTime = finite(state?.simTime);
  sample.tick = finite(state?.tick);
  sample.mode = state?.mode || null;
  sample.timeScale = finite(state?.timeScale, 1);
  sample.hasPos = !!(pos && Number.isFinite(pos.x) && Number.isFinite(pos.z));
  sample.posX = sample.hasPos ? finite(pos.x) : 0;
  sample.posZ = sample.hasPos ? finite(pos.z) : 0;
  sample.speed = vel ? hypot2(vel.x, vel.z) : 0;
  sample.lifecycle = extras.lifecycleState || diagnostics.lifecycleState || null;
  sample.suspended = extras.suspended === true || diagnostics.suspended === true;
  sample.documentHidden = typeof document !== 'undefined' ? document.hidden === true : false;
  sample.visibilityState = diagnostics.visibilityState
    || (typeof document !== 'undefined' ? document.visibilityState : null);
  sample.executedFrames = finite(diagnostics.executedFrames);
  sample.renderUpdates = finite(diagnostics.renderUpdates);
  const rendererFrame = Number(renderInfo?.frame);
  sample.rendererFrameObserved = Number.isFinite(rendererFrame);
  sample.rendererFrame = sample.rendererFrameObserved ? rendererFrame : 0;
  sample.drawCalls = finite(renderInfo?.calls);
  sample.contextLost = readContextLost(state);
  sample.lastFrameError = errorText(diagnostics.lastFrameError);
  sample.frameErrorCount = finite(diagnostics.frameErrorCount);
  sample.callbackMs = callbackMs;
  sample.simMs = finite(frameSample?.simMs);
  sample.renderMs = finite(frameSample?.renderMs);
  sample.vfxMs = finite(frameSample?.vfxMs);
  sample.uiMs = finite(frameSample?.uiMs);
  sample.admissionMs = finite(frameSample?.admissionMs);
  sample.topPhase = top?.name || null;
  sample.topPhaseP95 = finite(top?.p95);
  sample.hitch = callbackMs >= 33.4;
  sample.costs = costs;
  return sample;
}

function delta(last, first, key) {
  return finite(last?.[key]) - finite(first?.[key]);
}

/**
 * Classify a window of samples. A moving sim clock is not a live 3D picture.
 */
export function classifyRuntimeWitness(samples, { canvasHashes = [] } = {}) {
  if (!Array.isArray(samples) || samples.length < 4) {
    return {
      ok: null,
      kind: 'inconclusive',
      headline: 'Not enough runtime samples yet.',
      next: 'Let the game run a few seconds, then read window.__SF_WITNESS__.verdict().',
      facts: { sampleCount: samples?.length || 0 },
    };
  }

  const tail = samples.slice(-8);
  const first = tail[0];
  const last = tail[tail.length - 1];
  const simDelta = delta(last, first, 'simTime');
  const frameDelta = delta(last, first, 'executedFrames');
  const renderDelta = delta(last, first, 'renderUpdates');
  const rendererObserved = first.rendererFrameObserved === true && last.rendererFrameObserved === true;
  const rendererFrameDelta = rendererObserved ? delta(last, first, 'rendererFrame') : null;
  const errorDelta = delta(last, first, 'frameErrorCount');
  const posDelta = first.hasPos && last.hasPos
    ? hypot2(last.posX - first.posX, last.posZ - first.posZ)
    : 0;
  const hashes = Array.isArray(canvasHashes) ? canvasHashes.filter(Boolean) : [];
  const canvasChanged = hashes.length >= 2 && new Set(hashes).size > 1;
  const canvasStuck = hashes.length >= 2 && new Set(hashes).size === 1;
  const hitchCount = tail.filter((row) => row.hitch === true).length;
  const topPhase = last.topPhase || null;
  const facts = {
    sampleCount: tail.length,
    simDelta,
    frameDelta,
    renderDelta,
    rendererFrameDelta,
    posDelta,
    errorDelta,
    canvasChanged,
    canvasStuck,
    canvasHashCount: hashes.length,
    hitchCount,
    mode: last.mode,
    timeScale: last.timeScale,
    lifecycle: last.lifecycle,
    suspended: last.suspended,
    documentHidden: last.documentHidden,
    contextLost: last.contextLost === true,
    lastFrameError: last.lastFrameError,
    frameErrorCount: last.frameErrorCount,
    topPhase,
    topPhaseP95: last.topPhaseP95,
    speed: last.speed,
  };

  if (last.contextLost === true) {
    return {
      ok: false,
      kind: 'gpu-lost',
      headline: 'The GPU context is lost. The 3D world cannot present until it restores.',
      next: 'Look at context recovery and the last WebGL error. Do not tune gameplay code.',
      facts,
    };
  }

  if (last.mode === 'loading' && simDelta < 0.25 && frameDelta < 5) {
    return {
      ok: false,
      kind: 'loading-stuck',
      headline: 'The loader is still up and the simulation is not advancing.',
      next: 'Find which loading wait never returned (shaders, GPU upload, authored assets).',
      facts,
    };
  }

  if (last.suspended === true && frameDelta <= 1 && simDelta < 0.25) {
    return {
      ok: false,
      kind: 'loop-suspended',
      headline: 'The animation loop is suspended, so the 3D world will sit on the last picture.',
      next: `Lifecycle is ${last.lifecycle || 'unknown'}. Check pause, occlusion, and document.hidden.`,
      facts,
    };
  }

  if (last.timeScale === 0 && simDelta < 0.25) {
    return {
      ok: false,
      kind: 'time-paused',
      headline: 'Simulation time scale is zero, so the world clock is frozen.',
      next: 'Check pause overlay and time-effect scale before treating this as a render bug.',
      facts,
    };
  }

  if (frameDelta <= 1 && simDelta < 0.25) {
    return {
      ok: false,
      kind: 'loop-dead',
      headline: 'The animation loop itself has stopped. HTML can still work while the 3D world sits still.',
      next: 'Look at rAF scheduling, lifecycle, and the last frame error. Do not optimize a random system.',
      facts,
    };
  }

  if (errorDelta >= 3 && last.lastFrameError) {
    return {
      ok: false,
      kind: 'draw-throwing',
      headline: `The loop is catching a draw/frame error every tick: ${last.lastFrameError}`,
      next: 'Fix that throw. HUD staying alive is expected because overlay still runs.',
      facts,
    };
  }

  if (simDelta >= 1 && rendererObserved && rendererFrameDelta <= 1) {
    return {
      ok: false,
      kind: 'draw-dead',
      headline: 'The simulation is still running, but the GPU frame counter is not. That is a frozen 3D picture with a live HUD.',
      next: last.lastFrameError
        ? `Last frame error: ${last.lastFrameError}`
        : 'Look at renderer.submit / WebGL present, not sim or HUD code.',
      facts,
    };
  }

  if (simDelta >= 1 && canvasStuck) {
    return {
      ok: false,
      kind: 'draw-dead',
      headline: 'The simulation moved, but the 3D canvas pixels did not change.',
      next: 'Presentation is dead. Do not treat a moving sim clock as a healthy game.',
      facts,
    };
  }

  const rendererLive = rendererObserved && rendererFrameDelta >= 2;
  const pictureLive = rendererLive || canvasChanged;
  if (simDelta >= 0.5 && frameDelta >= 8 && pictureLive && !canvasStuck) {
    const hitchHeavy = hitchCount >= Math.max(3, Math.floor(tail.length * 0.4));
    if (hitchHeavy) {
      return {
        ok: false,
        kind: 'hitching',
        headline: `The picture is updating, but ${hitchCount} of the last ${tail.length} samples were hitches. Biggest bucket: ${topPhase || 'unknown'}.`,
        next: topPhase
          ? `Only touch ${topPhase}. Do not invent a system around the first file you open.`
          : 'Read the ranked phase list in the witness report before editing.',
        facts,
      };
    }
    return {
      ok: true,
      kind: 'presenting',
      headline: topPhase
        ? `The 3D world is presenting. Biggest recent cost: ${topPhase} (p95 ${finite(last.topPhaseP95).toFixed(1)} ms).`
        : 'The 3D world is presenting.',
      next: topPhase
        ? `If you came here for performance, that is the only legal first target.`
        : 'No phase ranking was available; enable a headed witness run before tuning.',
      facts,
    };
  }

  if (simDelta >= 1 && last.hasPos && posDelta < 0.05 && last.speed < 0.05 && last.mode === 'flight') {
    return {
      ok: null,
      kind: 'body-idle',
      headline: 'The clock is running but the ship is not moving. Could be no thrust, or a stuck body.',
      next: 'If the player was holding thrust, the body is stuck. If not, this is idle flight.',
      facts,
    };
  }

  if (simDelta >= 0.5 && frameDelta >= 8 && !pictureLive && hashes.length < 2 && !rendererObserved) {
    return {
      ok: null,
      kind: 'inconclusive',
      headline: 'The sim loop is running, but this sample never saw GPU frames or canvas pixels.',
      next: 'Run the headed runtime-witness probe. A Node/unit sample cannot prove the picture is alive.',
      facts,
    };
  }

  return {
    ok: null,
    kind: 'inconclusive',
    headline: 'Runtime samples disagree with a clean presenting / frozen split.',
    next: 'Read the facts. Do not guess from source.',
    facts,
  };
}

export function formatRuntimeWitnessReport({
  verdict,
  samples = [],
  canvasHashes = [],
  consoleHits = [],
  pageErrors = [],
  gpu = null,
} = {}) {
  const last = samples[samples.length - 1] || null;
  const costs = last?.costs || [];
  const lines = [
    '# Runtime witness',
    '',
    `Verdict: ${verdict?.kind || 'unknown'}`,
    verdict?.headline || '',
    '',
    `Next: ${verdict?.next || ''}`,
    '',
    '## Live',
    `- mode: ${last?.mode ?? 'n/a'}`,
    `- simTime: ${last ? finite(last.simTime).toFixed(2) : 'n/a'}`,
    `- timeScale: ${last?.timeScale ?? 'n/a'}`,
    `- lifecycle: ${last?.lifecycle ?? 'n/a'}`,
    `- suspended: ${last?.suspended === true}`,
    `- documentHidden: ${last?.documentHidden === true}`,
    `- contextLost: ${last?.contextLost === true}`,
    `- executedFrames: ${last?.executedFrames ?? 'n/a'}`,
    `- rendererFrame: ${last?.rendererFrame ?? 'n/a'}`,
    `- drawCalls: ${last?.drawCalls ?? 'n/a'}`,
    `- lastFrameError: ${last?.lastFrameError || 'none'}`,
    `- gpu: ${gpu ? `${gpu.renderer || '?'} (tier ${gpu.tier ?? '?'})` : 'n/a'}`,
    '',
    '## Where the last frames went (ms)',
  ];
  if (costs.length === 0) {
    lines.push('- no phase ranking (perf runtime did not report)');
  } else {
    for (const row of costs) {
      lines.push(`- ${row.name}: p95 ${row.p95.toFixed(1)} / avg ${row.avg.toFixed(1)} / max ${row.max.toFixed(1)}`);
    }
  }
  lines.push('', '## Sample deltas (tail)');
  const facts = verdict?.facts || {};
  lines.push(`- simDelta: ${finite(facts.simDelta).toFixed(2)}`);
  lines.push(`- executedFrames delta: ${finite(facts.frameDelta).toFixed(0)}`);
  lines.push(`- rendererFrame delta: ${finite(facts.rendererFrameDelta).toFixed(0)}`);
  lines.push(`- hitch samples: ${facts.hitchCount ?? 0}`);
  lines.push(`- canvas hashes: ${canvasHashes.length} unique ${new Set(canvasHashes.filter(Boolean)).size}`);
  if (pageErrors.length) {
    lines.push('', '## Page errors', ...pageErrors.slice(-8).map((line) => `- ${line}`));
  }
  if (consoleHits.length) {
    lines.push('', '## Console (loop/GPU)', ...consoleHits.slice(-12).map((line) => `- ${line}`));
  }
  lines.push('');
  return lines.join('\n');
}

export function createRuntimeWitness({ nowMs = () => Date.now(), readSample } = {}) {
  const ring = Array.from({ length: RUNTIME_WITNESS_RING }, () => emptySample());
  let count = 0;
  let head = 0;
  let lastWriteMs = -Infinity;
  let timer = 0;
  let timerHost = null;
  const scratch = emptySample();

  function snapshot() {
    if (typeof readSample === 'function') {
      const live = readSample(scratch);
      return copySample(emptySample(), live);
    }
    if (count === 0) return emptySample();
    const index = (head - 1 + RUNTIME_WITNESS_RING) % RUNTIME_WITNESS_RING;
    return copySample(emptySample(), ring[index]);
  }

  function observe(state, extras = {}) {
    const wall = finite(extras.wallMs, nowMs());
    if (wall - lastWriteMs < RUNTIME_WITNESS_PERIOD_MS) return null;
    lastWriteMs = wall;
    const collected = typeof readSample === 'function'
      ? readSample(ring[head])
      : collectRuntimeWitnessSample(state, { ...extras, into: ring[head] }, wall);
    if (collected !== ring[head]) copySample(ring[head], collected);
    head = (head + 1) % RUNTIME_WITNESS_RING;
    if (count < RUNTIME_WITNESS_RING) count += 1;
    return ring[(head - 1 + RUNTIME_WITNESS_RING) % RUNTIME_WITNESS_RING];
  }

  function recent() {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const index = (head - count + i + RUNTIME_WITNESS_RING) % RUNTIME_WITNESS_RING;
      out.push(copySample(emptySample(), ring[index]));
    }
    return out;
  }

  function verdict(extra = {}) {
    return classifyRuntimeWitness(recent(), extra);
  }

  function explain(extra = {}) {
    return formatRuntimeWitnessReport({
      verdict: verdict(extra),
      samples: recent(),
      ...extra,
    });
  }

  function startClock(tick, host = globalThis) {
    if (timer || !host || typeof host.setInterval !== 'function') return false;
    timerHost = host;
    timer = host.setInterval(() => {
      try { tick(); } catch (_) { /* witness must never kill the game */ }
    }, RUNTIME_WITNESS_PERIOD_MS);
    return true;
  }

  function stop() {
    if (timer && timerHost && typeof timerHost.clearInterval === 'function') {
      timerHost.clearInterval(timer);
    }
    timer = 0;
    timerHost = null;
  }

  return {
    schema: RUNTIME_WITNESS_SCHEMA,
    snapshot,
    observe,
    recent,
    verdict,
    explain,
    startClock,
    stop,
  };
}
