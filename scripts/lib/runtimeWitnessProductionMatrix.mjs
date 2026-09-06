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
  return {
    status: values.length > 0 ? 'measured' : 'unavailable',
    reason: values.length > 0 ? null : (report.reason || 'GPU timer produced no completed non-disjoint samples'),
    ...distribution(values),
    extension: report.extension || null,
  };
}

/**
 * Reduces one foreground-only recorder window. `samples` are rAF observations that each contain
 * the existing perfRuntime.readFrameSample() result; no phase p95 values are ever added together.
 */
export function summarizeRuntimeWitnessProductionWindow({ route, samples = [], gpuReport = null, manifest = {} } = {}) {
  const descriptor = typeof route === 'string' ? productionRouteById(route) : route;
  if (!descriptor) throw new Error(`unknown production route: ${String(route)}`);
  const clean = samples.filter((sample) => sample && sample.frame && !sample.error);
  const frameIntervals = clean.map((sample) => sample.intervalMs);
  const inputAges = clean.map((sample) => sample.inputAgeMs).filter(Number.isFinite);
  const shed = clean.map((sample) => sample.frame?.shedBacklogFrames).filter(Number.isFinite);
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
    inputAge: inputAges.length > 0
      ? { status: 'measured', ...distribution(inputAges) }
      : { status: 'unknown', reason: 'no public input timestamp is published by the running route' },
    shedSimulation: shed.length > 0
      ? { status: 'measured', maxBacklogFrames: Math.max(...shed), totalObservedFrames: shed.reduce((sum, value) => sum + value, 0) }
      : { status: 'unknown', reason: 'perfRuntime.readFrameSample() did not expose shedBacklogFrames' },
  };
}

export function formatRuntimeWitnessProductionMatrix(result) {
  const frames = result?.foregroundFrames || {};
  const top = result?.cpuPhases?.[0];
  const gpu = result?.gpu || {};
  return [
    '## Production route matrix (PQ-144.01)',
    `- route: ${result?.route?.label || 'unknown'} (${result?.route?.id || 'unknown'})`,
    `- status: ${result?.status || 'unavailable'}`,
    `- foreground intervals: n=${frames.samples || 0}; p50=${frames.p50 ?? 'unknown'} ms; p95=${frames.p95 ?? 'unknown'} ms; p99=${frames.p99 ?? 'unknown'} ms; max=${frames.max ?? 'unknown'} ms; >33.3ms=${frames.exceedances?.over33_3ms || 0}`,
    `- dominant measured CPU phase: ${top ? `${top.name} p95 ${top.p95 ?? 'unknown'} ms` : 'unknown'}`,
    `- GPU: ${gpu.status || 'unavailable'}${gpu.reason ? ` (${gpu.reason})` : ''}`,
    `- input age: ${result?.inputAge?.status || 'unknown'}${result?.inputAge?.reason ? ` (${result.inputAge.reason})` : ''}`,
    `- shed simulated time: ${result?.shedSimulation?.status || 'unknown'}${result?.shedSimulation?.reason ? ` (${result.shedSimulation.reason})` : ''}`,
  ].join('\n');
}
