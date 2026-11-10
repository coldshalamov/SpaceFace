// Observation only: summarize the existing lab's recorded XZ poses; never simulate a second game.
const TAU = 2 * Math.PI;
const wrap = v => Math.atan2(Math.sin(v), Math.cos(v));
const finite = Number.isFinite;
const peak = values => values.length ? values.reduce((a, b) => Math.max(a, b), -Infinity) : null;
const quantile = (values, q) => {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y), i = (a.length - 1) * q;
  return a[Math.floor(i)] + (a[Math.ceil(i)] - a[Math.floor(i)]) * (i % 1);
};

export function summarizeTrace(result, { dt = 1 / 60 } = {}) {
  if (!finite(dt) || dt <= 0) throw new Error('dt must be finite and positive');
  const trace = result?.trace;
  const base = { schema: 'spaceface.labHandlingReport.v1', nonPromoting: true,
    scenarioId: result?.scenarioId ?? null, seed: result?.seed ?? null,
    scenarioDigest: result?.scenarioDigest ?? null, inputDigest: result?.inputDigest ?? null,
    traceHash: result?.traceHash ?? null, evidenceClass: result?.evidenceClass ?? null,
    executionEvidenceClass: result?.executionEvidenceClass ?? result?.evidenceClass ?? null,
    dt, firstBadTick: result?.oracle?.firstBadTick ?? null,
    note: 'Sampled kinematics, not a fun score, input latency, rendered feel, or production-route certification.' };
  if (!Array.isArray(trace) || !trace.length) return { ...base, available: false, reason: 'No trace returned. Use sf lab trace or an executor that retains its primary arm.' };
  const fields = ['tick', 'playerX', 'playerZ', 'playerVelX', 'playerVelZ', 'playerRot'];
  for (let i = 0; i < trace.length; i++) {
    const sample = trace[i];
    const bad = fields.find(f => !finite(sample?.[f]));
    if (bad || !Number.isSafeInteger(sample.tick) || sample.tick < 0 || (i && sample.tick <= trace[i - 1].tick)) {
      return { ...base, available: false, reason: `Invalid or non-increasing trace at sample ${i}`, badField: bad ?? 'tick', badSample: i };
    }
  }
  const speeds = trace.map(s => Math.hypot(s.playerVelX, s.playerVelZ));
  let pathLength = 0, yawTravel = 0, maxGap = 0;
  const accelerations = [], yawRates = [];
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1], b = trace[i], gap = b.tick - a.tick, elapsed = gap * dt;
    maxGap = Math.max(maxGap, gap);
    pathLength += Math.hypot(b.playerX - a.playerX, b.playerZ - a.playerZ);
    accelerations.push(Math.hypot(b.playerVelX - a.playerVelX, b.playerVelZ - a.playerVelZ) / elapsed);
    const yaw = wrap(b.playerRot - a.playerRot);
    yawTravel += Math.abs(yaw); yawRates.push(Math.abs(yaw) / elapsed);
  }
  const first = trace[0], last = trace.at(-1);
  const metrics = {
    sampleCount: trace.length, firstTick: first.tick, lastTick: last.tick, maxSampleGapTicks: maxGap,
    observedSeconds: (last.tick - first.tick) * dt,
    peakSpeed: peak(speeds), finalSpeed: speeds.at(-1),
    sampledPathLength: pathLength,
    displacement: Math.hypot(last.playerX - first.playerX, last.playerZ - first.playerZ),
    peakVectorAcceleration: accelerations.length ? peak(accelerations) : null,
    p95VectorAcceleration: quantile(accelerations, 0.95),
    sampledAbsoluteYawTurns: yawTravel / TAU,
    peakAbsoluteYawRate: yawRates.length ? peak(yawRates) : null,
  };
  return { ...base, available: true, metrics,
    warnings: ['Tick 0 is post-step, not the initial pose; observedSeconds excludes that first unobserved interval.',
      'Acceleration includes turning/collisions; it is not pure engine thrust.',
      'Wrapped yaw assumes less than half a turn between samples; sampled paths can underestimate motion.',
      ...(maxGap > 1 ? ['Trace is decimated: peaks and transients between samples are not measured.'] : [])] };
}

export function compareHandling(before, after) {
  if (!before?.available || !after?.available) return { comparable: false, reason: 'Both reports must contain valid traces.' };
  const keys = ['seed', 'scenarioDigest', 'inputDigest', 'dt', 'executionEvidenceClass'];
  const mismatch = keys.filter(k => before[k] == null || after[k] == null || before[k] !== after[k]);
  for (const key of ['firstTick', 'lastTick', 'sampleCount', 'maxSampleGapTicks']) {
    if (before.metrics[key] !== after.metrics[key]) mismatch.push(key);
  }
  if (mismatch.length) return { comparable: false, reason: 'Different scenario/input/sample coverage; do not attribute this delta to the code change.', mismatch };
  const deltas = {};
  for (const [key, value] of Object.entries(after.metrics)) {
    if (finite(value) && finite(before.metrics[key])) deltas[key] = value - before.metrics[key];
  }
  return { comparable: true, nonPromoting: true, deltas, note: 'Descriptive deltas only. No automatic better/worse or performance verdict.' };
}

const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function handlingHtml(report, trace = [], inputLog = []) {
  // No scripts, fetches, fonts, assets, or game boot. Real recorded samples, not an illustrative sim.
  const good = trace.filter(s => [s?.playerX, s?.playerZ, s?.playerVelX, s?.playerVelZ].every(finite));
  let svg = '<p>No valid trajectory recorded.</p>';
  if (good.length) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const s of good) { x0 = Math.min(x0, s.playerX); x1 = Math.max(x1, s.playerX); z0 = Math.min(z0, s.playerZ); z1 = Math.max(z1, s.playerZ); }
    const scale = 540 / Math.max(x1 - x0, z1 - z0, 1), points = good.map(s => `${30 + (s.playerX - x0) * scale},${30 + (s.playerZ - z0) * scale}`);
    // SVG title gives exact values on hover; cap marks, NOT the polyline or the JSON evidence.
    const stride = Math.max(1, Math.ceil(good.length / 300));
    const marks = good.filter((_, i) => i % stride === 0 || i === good.length - 1).map(s => `<circle cx="${30 + (s.playerX - x0) * scale}" cy="${30 + (s.playerZ - z0) * scale}" r="3"><title>${escape(`tick ${s.tick}: x=${s.playerX}, z=${s.playerZ}, speed=${Math.hypot(s.playerVelX, s.playerVelZ).toFixed(3)}`)}</title></circle>`).join('');
    svg = `<svg viewBox="0 0 600 600" role="img" aria-label="Recorded XZ trajectory; positive Z points down"><polyline points="${points.join(' ')}" fill="none" stroke="currentColor" stroke-width="2"/>${marks}</svg>`;
  }
  const rows = Object.entries(report.metrics || {}).map(([k, v]) => `<tr><th>${escape(k)}</th><td>${escape(v ?? 'not measured')}</td></tr>`).join('');
  const changes = inputLog.filter((s, i, a) => i === 0 || JSON.stringify({ ...s, tick: undefined }) !== JSON.stringify({ ...a[i - 1], tick: undefined })).slice(0, 200);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SpaceFace handling evidence</title><style>body{font:16px system-ui;max-width:1080px;margin:2rem auto;padding:0 1rem}svg{max-width:600px;width:100%;border:1px solid}table{border-collapse:collapse}th,td{text-align:left;padding:.35rem 1rem;border-bottom:1px solid}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escape(report.scenarioId || 'Lab handling report')}</h1><p><strong>Diagnostic only.</strong> ${escape(report.note)}</p><p>${escape(report.reason || '')}</p>${svg}<table>${rows}</table><h2>Sampling limits</h2><p>${escape((report.warnings || []).join(' '))}</p><h2>Input changes (first 200)</h2><pre>${escape(JSON.stringify(changes, null, 2))}</pre><h2>Identity and findings</h2><pre>${escape(JSON.stringify(report, null, 2))}</pre></html>`;
}
