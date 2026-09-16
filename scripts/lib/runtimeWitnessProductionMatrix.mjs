// Production-route matrix helpers for probe-runtime-witness. These helpers deliberately only
// summarize recorder output: the live probe remains the sole producer of timing telemetry.

export const RUNTIME_WITNESS_PRODUCTION_ROUTES = Object.freeze([
  { id: 'cold-opening', label: 'cold ordinary opening', driver: 'new-game' },
  { id: 'warm-dense-combat', label: 'warm dense combat', driver: 'public-combat' },
  { id: 'earned-speed-traversal', label: 'earned-speed traversal', driver: 'public-sector-traversal' },
  { id: 'sustained-swarm', label: 'sustained Swarm', driver: 'public-swarm' },
  { id: 'dock-refit-undock', label: 'dock / refit / undock', driver: 'public-dock' },
  { id: 'asteroid-works-roundtrip', label: 'Asteroid Works in / out', driver: 'public-asteroid-works' },
  { id: 'busy-site-save-reload', label: 'busy-site save / reload', driver: 'public-save-reload' },
]);

const ROUTE_BY_ID = new Map(RUNTIME_WITNESS_PRODUCTION_ROUTES.map((route) => [route.id, route]));

// perfRuntime exposes cumulative counters, not one counter per frame. Count increments within
// the observed window, including a counter reset on a loading transition, without charging the
// first sample's pre-window history to this route. Simulation uses src/core/sim.js's fixed 60 Hz.
function counterIncrements(values) {
  let previous = null;
  let total = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) continue;
    if (previous !== null) total += value >= previous ? value - previous : value;
    previous = value;
  }
  return previous === null ? null : total;
}

export function productionRouteById(id) {
  return ROUTE_BY_ID.get(String(id || '')) || null;
}

function finite(value) {
  if (value == null || typeof value === 'boolean' || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percentile(values, ratio) {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (ordered.length === 0) return null;
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * ratio))];
}

function distribution(values) {
  const valid = values.map(finite).filter(Number.isFinite);
  if (valid.length === 0) return { samples: 0, p50: null, p95: null, p99: null, max: null };
  return {
    samples: valid.length,
    p50: percentile(valid, 0.5),
    p95: percentile(valid, 0.95),
    p99: percentile(valid, 0.99),
    max: Math.max(...valid),
  };
}

function topPhase(samples) {
  const phaseNames = ['simMs', 'simFrameMs', 'presentationMs', 'renderMs', 'vfxMs', 'feelMs', 'uiMs', 'admissionMs'];
  const ranked = phaseNames.map((name) => ({ name, ...distribution(samples.map((sample) => sample?.frame?.[name])) }))
    .filter((entry) => entry.samples > 0)
    .sort((a, b) => (b.p95 || -1) - (a.p95 || -1));
  return ranked;
}

function gpuSummary(report) {
  if (!report || typeof report !== 'object') {
    return { status: 'unavailable', reason: 'runtime did not publish render.gpuTimers.getReport()', samples: 0 };
  }
  if (report.available !== true) {
    return { status: 'unavailable', reason: report.reason || 'GPU timer capability unavailable', samples: 0 };
  }
  if (report.lastDisjoint === true || report.captureValid === false) {
    return { status: 'invalid', reason: report.lastDisjoint === true ? 'GPU timer query was disjoint' : 'GPU timer capture was invalid', samples: 0 };
  }
  const terminals = Array.isArray(report.terminals) ? report.terminals : [];
  const values = terminals.map((entry) => finite(entry?.elapsedMs ?? entry?.durationMs ?? entry?.ms)).filter(Number.isFinite);
  // P4: per-pass GPU columns sit beside the CPU column rather than collapsing to one number —
  // bloom vs scene draw are different bills and only the per-label split shows which is due.
  const passes = {};
  if (report.passes && typeof report.passes === 'object') {
    for (const [label, ring] of Object.entries(report.passes)) {
      const dist = ring && typeof ring === 'object' ? ring : {};
      const samples = finite(dist.samples ?? dist.count) ?? 0;
      if (samples <= 0) continue;
      passes[label] = {
        samples,
        p50: finite(dist.p50),
        p95: finite(dist.p95),
        max: finite(dist.max),
      };
    }
  }
  const byLabel = new Map();
  const byFrame = new Map();
  for (const entry of terminals) {
    const ms = finite(entry?.elapsedMs);
    let frame = null;
    if (Number.isSafeInteger(entry?.renderFrameId) && entry.renderFrameId > 0) {
      if (!byFrame.has(entry.renderFrameId)) byFrame.set(entry.renderFrameId, {
        labels: new Set(), queryIds: new Set(), minQueryId: Infinity, maxQueryId: -Infinity,
        total: 0, whole: null, duplicate: false, incomplete: false,
      });
      frame = byFrame.get(entry.renderFrameId);
    }
    if (entry?.state !== 'completed' || ms === null || ms < 0 || typeof entry.label !== 'string') {
      if (frame) frame.incomplete = true;
      continue;
    }
    if (!byLabel.has(entry.label)) byLabel.set(entry.label, []);
    byLabel.get(entry.label).push(ms);
    if (!frame) continue;
    if (!Number.isSafeInteger(entry.queryId) || entry.queryId <= 0) frame.incomplete = true;
    else {
      if (frame.queryIds.has(entry.queryId)) frame.duplicate = true;
      frame.queryIds.add(entry.queryId);
      frame.minQueryId = Math.min(frame.minQueryId, entry.queryId);
      frame.maxQueryId = Math.max(frame.maxQueryId, entry.queryId);
    }
    if (frame.labels.has(entry.label)) frame.duplicate = true;
    frame.labels.add(entry.label);
    frame.total += ms;
    if (entry.label === 'drawPreparedFrame') frame.whole = ms;
  }
  for (const [label, samples] of byLabel) passes[label] = distribution(samples);
  const totals = [];
  for (const frame of byFrame.values()) {
    if (frame.duplicate || frame.incomplete || frame.maxQueryId - frame.minQueryId + 1 !== frame.queryIds.size) continue;
    if (frame.whole !== null && frame.labels.size === 1) totals.push(frame.whole);
    else if (frame.whole === null && frame.labels.has('bloomScene') && frame.labels.has('bloomComposite')) totals.push(frame.total);
  }
  return {
    status: values.length > 0 ? 'measured' : 'unavailable',
    reason: values.length > 0 ? null : (report.reason || 'GPU timer produced no completed non-disjoint samples'),
    ...distribution(values),
    scope: 'retained GPU query spans; not a full-frame distribution',
    extension: report.extension || null,
    passes,
    frameTotals: {
      ...distribution(totals),
      incompleteFrames: byFrame.size - totals.length,
      scope: 'retained completed query tail, grouped by renderFrameId; excludes compositor and untimed GPU work',
    },
  };
}

function inputToPhotonSummary(samples) {
  const values = samples.map((sample) => finite(sample.inputToPresentMs)).filter((value) => value !== null && value >= 0);
  return {
    status: values.length > 0 ? 'measured' : 'unavailable',
    reason: values.length > 0 ? null : 'no distinct input-to-present observation inside this recorder window',
    source: 'input-to-present CPU proxy; not physical photon latency',
    ...distribution(values),
  };
}

/**
 * Reduces one foreground-only recorder window. `samples` are rAF observations that each contain
 * the existing perfRuntime.readFrameSample() result; no phase p95 values are ever added together.
 */
export function summarizeRuntimeWitnessProductionWindow({ route, samples = [], gpuReport = null, inputToPhotonReport = null, manifest = {} } = {}) {
  const descriptor = typeof route === 'string' ? productionRouteById(route) : route;
  if (!descriptor) throw new Error(`unknown production route: ${String(route)}`);
  const clean = samples.filter((sample) => sample && sample.frame && !sample.error);
  const frameIntervals = clean.map((sample) => sample.intervalMs);
  const inputAges = clean.map((sample) => sample.inputAgeMs).filter(Number.isFinite);
  const shed = clean.map((sample) => sample.frame?.shedBacklogFrames).filter(Number.isFinite);
  const shedSteps = counterIncrements(clean.map((sample) => sample.frame?.shedStepsTotal));
  const longest = clean
    .filter((sample) => finite(sample.intervalMs) !== null)
    .sort((a, b) => Number(b.intervalMs) - Number(a.intervalMs))
    .slice(0, 8)
    .map((sample) => ({ elapsedMs: finite(sample.elapsedMs), intervalMs: finite(sample.intervalMs), phase: sample.frame }));
  const interval = distribution(frameIntervals);
  return {
    schema: 'spaceface.runtimeWitness.productionMatrix.v1',
    status: clean.length > 0 ? 'measured' : 'unavailable',
    route: { id: descriptor.id, label: descriptor.label, driver: descriptor.driver },
    manifest,
    foregroundFrames: {
      ...interval,
      exceedances: {
        over16_7ms: frameIntervals.filter((value) => Number(value) > 16.7).length,
        over33_3ms: frameIntervals.filter((value) => Number(value) > 33.3).length,
        over50ms: frameIntervals.filter((value) => Number(value) > 50).length,
      },
      longest,
    },
    cpuPhases: topPhase(clean),
    gpu: gpuSummary(gpuReport),
    inputToPhoton: inputToPhotonSummary(clean),
    inputAge: inputAges.length > 0
      ? { status: 'measured', ...distribution(inputAges) }
      : { status: 'unknown', reason: 'no public input timestamp is published by the running route' },
    shedSimulation: shed.length > 0
      ? { status: 'measured', counterWindow: 'first-to-last observed frame',
        observedShedFrames: counterIncrements(shed), observedShedSteps: shedSteps,
        shedTimeMs: shedSteps === null ? null : shedSteps * (1000 / 60) }
      : { status: 'unknown', reason: 'perfRuntime.readFrameSample() did not expose shedBacklogFrames' },
  };
}

export function formatRuntimeWitnessProductionMatrix(result) {
  const frames = result?.foregroundFrames || {};
  const top = result?.cpuPhases?.[0];
  const gpu = result?.gpu || {};
  const gpuPasses = gpu.passes && typeof gpu.passes === 'object' ? gpu.passes : {};
  const passLines = Object.entries(gpuPasses)
    .sort((a, b) => (b[1].p95 ?? -1) - (a[1].p95 ?? -1))
    .map(([label, stat]) => `  - ${label}: n=${stat.samples}; p50=${stat.p50 ?? 'unknown'} ms; p95=${stat.p95 ?? 'unknown'} ms; max=${stat.max ?? 'unknown'} ms`);
  const photon = result?.inputToPhoton || {};
  return [
    '## Production route matrix (PQ-144.01)',
    `- route: ${result?.route?.label || 'unknown'} (${result?.route?.id || 'unknown'})`,
    `- status: ${result?.status || 'unavailable'}`,
    `- foreground intervals: n=${frames.samples || 0}; p50=${frames.p50 ?? 'unknown'} ms; p95=${frames.p95 ?? 'unknown'} ms; p99=${frames.p99 ?? 'unknown'} ms; max=${frames.max ?? 'unknown'} ms; >33.3ms=${frames.exceedances?.over33_3ms || 0}`,
    `- dominant measured CPU phase: ${top ? `${top.name} p95 ${top.p95 ?? 'unknown'} ms` : 'unknown'}`,
    `- GPU query spans: ${gpu.status || 'unavailable'}${gpu.reason ? ` (${gpu.reason})` : ''}${Number.isFinite(gpu.p95) ? `; p95=${gpu.p95} ms (mixed passes, not frame time)` : ''}`,
    `- GPU timed work per render frame: n=${gpu.frameTotals?.samples || 0}; p50=${gpu.frameTotals?.p50 ?? 'unknown'} ms; p95=${gpu.frameTotals?.p95 ?? 'unknown'} ms; incomplete=${gpu.frameTotals?.incompleteFrames ?? 'unknown'}; retained query tail, excludes compositor/untimed work`,
    ...passLines,
    `- input-to-present CPU proxy (not physical photon latency): ${photon.status || 'unknown'}${photon.reason ? ` (${photon.reason})` : ''}${photon.status === 'measured' ? `; n=${photon.samples}; p50=${photon.p50 ?? 'unknown'} ms; p95=${photon.p95 ?? 'unknown'} ms` : ''}`,
    `- input age: ${result?.inputAge?.status || 'unknown'}${result?.inputAge?.reason ? ` (${result.inputAge.reason})` : ''}`,
    `- shed simulated time: ${result?.shedSimulation?.shedTimeMs ?? 'unknown'} ms; frames with shedding: ${result?.shedSimulation?.observedShedFrames ?? 'unknown'}${result?.shedSimulation?.reason ? ` (${result.shedSimulation.reason})` : ''}`,
  ].join('\n');
}
