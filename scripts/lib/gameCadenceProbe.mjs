// Probe-only observer: browser callbacks, successful world submissions and simulation are
// separate clocks. Three's info.render.frame includes warm-up and post-processing draws.
export function installGameCadenceProbe() {
  window.__SF_GAME_CADENCE__?.stop?.();
  const sf = window.SF;
  const render = sf?.registry?.get?.('render') || sf?.render || sf?.state?.render;
  const owner = typeof render?.drawPreparedFrame === 'function' ? render : null;
  const original = owner?.drawPreparedFrame;
  let submissions = 0;
  let lastSubmit = null;
  let previous = null;
  let lastSimAdvance = performance.now();
  let frameId = null;
  const rows = [];
  const submissionGaps = [];
  const started = performance.now();
  const wrapped = function (...args) {
    const result = original.apply(this, args);
    if (result === true && sf.state.mode === 'flight') {
      const now = performance.now();
      if (lastSubmit !== null) submissionGaps.push(now - lastSubmit);
      lastSubmit = now;
      submissions++;
    }
    return result;
  };
  if (owner) owner.drawPreparedFrame = wrapped;
  const sample = (now) => {
    const st = sf.state;
    if (!previous || st.tick !== previous.tick || st.simTime !== previous.sim
        || st.mode !== 'flight' || !(st.timeScale > 0)) lastSimAdvance = performance.now();
    const row = {
      t: now, mode: st.mode, timeScale: st.timeScale,
      sim: st.simTime, tick: st.tick, submissions,
      simStaleMs: Math.max(0, performance.now() - lastSimAdvance),
      worldStaleMs: Math.max(0, lastSubmit === null ? performance.now() - started : performance.now() - lastSubmit),
      calls: st.render?.diagnostics?.info?.calls ?? null,
    };
    if (previous) row.gapMs = now - previous.t;
    rows.push(row);
    previous = row;
    frameId = requestAnimationFrame(sample);
  };
  frameId = requestAnimationFrame(sample);
  window.__SF_GAME_CADENCE__ = {
    stop() {
      cancelAnimationFrame(frameId);
      if (owner && owner.drawPreparedFrame === wrapped) owner.drawPreparedFrame = original;
      return { started, ended: performance.now(), submissionObserved: !!owner, rows, submissionGaps };
    },
  };
}

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : null;
  return {
    count: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99),
    max: sorted.at(-1) ?? null, over50: sorted.filter(v => v > 50).length,
    over100: sorted.filter(v => v > 100).length,
  };
}

export function summarizeGameCadence(record) {
  const rows = record.rows || [];
  const first = rows[0];
  const last = rows.at(-1);
  const wallMs = first && last ? last.t - first.t : 0;
  const frames = rows.slice(1).filter(r => r.mode === 'flight' && r.timeScale > 0);
  const activeMs = frames.reduce((sum, r) => sum + (r.gapMs || 0), 0);
  const healthyCallbacksFrozenWorld = frames.filter(r => r.gapMs <= 34 && r.worldStaleMs > 100);
  const healthyCallbacksFrozenSimulation = frames.filter(r => r.gapMs <= 34 && r.simStaleMs > 100);
  const simDelta = first && last ? last.sim - first.sim : 0;
  const submits = first && last ? last.submissions - first.submissions : 0;
  return {
    schema: 'spaceface.gameCadence.v1', wallMs, activeMs, simDelta,
    simWallRatio: wallMs > 0 ? simDelta * 1000 / wallMs : null,
    submissionObserved: record.submissionObserved,
    browserFps: activeMs > 0 ? frames.length * 1000 / activeMs : null,
    worldSubmitFps: record.submissionObserved && wallMs > 0 ? submits * 1000 / wallMs : null,
    callbackGaps: distribution(frames.map(r => r.gapMs)),
    submissionGaps: record.submissionObserved ? distribution(record.submissionGaps || []) : null,
    healthyCallbacksFrozenWorld: healthyCallbacksFrozenWorld.length,
    healthyCallbacksFrozenSimulation: healthyCallbacksFrozenSimulation.length,
    maxSimStaleMs: frames.reduce((max, r) => Math.max(max, r.simStaleMs || 0), 0),
    maxWorldStaleMs: frames.length ? Math.max(...frames.map(r => r.worldStaleMs)) : null,
    minDrawCalls: frames.some(r => Number.isFinite(r.calls)) ? Math.min(...frames.map(r => r.calls).filter(Number.isFinite)) : null,
    // Submission is a CPU-side success, not proof that the display scanned out new pixels.
    evidenceLayer: 'successful-game-submit; display scanout unmeasured',
  };
}
