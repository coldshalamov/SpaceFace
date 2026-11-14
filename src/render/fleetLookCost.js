// Dev-only matched-frame sampler. A postprocessed frame calls renderer.render multiple times;
// Three's default auto-reset otherwise reports only the last fullscreen pass.
const COUNTERS = ['calls', 'triangles', 'points', 'lines'];

export async function measureFleetLookCost({ renderer, frames, beforeFrame, renderFrame, now, yieldToMain }) {
  const info = renderer.info;
  const gl = renderer.getContext();
  const samples = [];
  const draws = [];
  const triangles = [];
  for (let i = 0; i < frames + 6; i++) {
    if (beforeFrame) beforeFrame();
    const priorAutoReset = info.autoReset;
    const priorCounters = COUNTERS.map((name) => info.render[name]);
    try {
      info.autoReset = false;
      info.reset();
      const start = now();
      renderFrame();
      gl.finish();
      const elapsed = now() - start;
      if (i >= 6) {
        samples.push(elapsed);
        draws.push(info.render.calls);
        triangles.push(info.render.triangles);
      }
    } finally {
      info.autoReset = priorAutoReset;
      // The measurement is a private draw, not part of another observer's frame counters.
      for (let n = 0; n < COUNTERS.length; n++) info.render[COUNTERS[n]] = priorCounters[n];
    }
    if (i % 8 === 7) await yieldToMain();
  }
  samples.sort((a, b) => a - b);
  draws.sort((a, b) => a - b);
  triangles.sort((a, b) => a - b);
  const mid = samples.length >> 1;
  const p90 = Math.floor(samples.length * 0.9);
  return {
    medianMs: +samples[mid].toFixed(3),
    p90Ms: +samples[p90].toFixed(3),
    frames: samples.length,
    calls: draws[mid],
    callsP90: draws[p90],
    triangles: triangles[mid],
  };
}
