/** Offline frame-trace analyzer. No game hooks, no collected SpaceFace measurements.
 * CLI: node frameAudit.mjs trace.json [baseline.json]
 * JSON: {manifest:{...}, frames:[{lifecycle:'foreground',frameMs:16.7,...}]}
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export function quantile(values, p) {
  if (!finite(p) || p < 0 || p > 1) throw new RangeError('p must be in [0,1]');
  if (!values.length) return null;
  if (!values.every(finite)) throw new RangeError('All samples must be finite');
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lo = Math.floor(position), hi = Math.ceil(position);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (position - lo);
}
function stats(values) {
  if (!values.length) return {samples: 0, mean: null, p50: null, p95: null, p99: null, max: null};
  return {samples: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: quantile(values, .5), p95: quantile(values, .95), p99: quantile(values, .99),
    max: values.reduce((a, b) => Math.max(a, b), -Infinity)};
}
export function analyzeTrace(trace, budgetMs = 1000 / 60, fixedStepMs = 1000 / 60) {
  if (!Array.isArray(trace.frames)) throw new TypeError('frames must be an array');
  if (!finite(budgetMs) || budgetMs <= 0 || !finite(fixedStepMs) || fixedStepMs <= 0) throw new RangeError('Invalid time budget');
  const invalid = trace.frames.filter(f => !f || !finite(f.frameMs) || f.frameMs <= 0);
  const valid = trace.frames.filter(f => f && finite(f.frameMs) && f.frameMs > 0);
  const foreground = valid.filter(f => f.lifecycle === 'foreground');
  const times = foreground.map(f => f.frameMs);
  const timing = stats(times);
  const phases = {};
  for (const key of ['cpuCallbackMs', 'simulationMs', 'presentationCpuMs']) {
    phases[key] = stats(foreground.map(f => f[key]).filter(v => finite(v) && v >= 0));
  }
  phases.gpuMs = stats(foreground.filter(f => f.gpuValid === true && finite(f.gpuMs) && f.gpuMs >= 0).map(f => f.gpuMs));
  const shed = foreground.map(f => f.shedTicks).filter(v => Number.isSafeInteger(v) && v >= 0);
  const shedTicks = shed.reduce((a, b) => a + b, 0);
  return {
    manifest: trace.manifest ?? {},
    coverage: {total: trace.frames.length, invalid: invalid.length, excludedLifecycle: valid.length - foreground.length,
      foreground: foreground.length, gpuValidSamples: phases.gpuMs.samples, shedCounterSamples: shed.length},
    frameMs: timing, phases,
    throughputFps: timing.mean === null ? null : 1000 / timing.mean,
    overBudgetFrames: times.filter(v => v > budgetMs + 1e-6).length,
    hitches: Object.fromEntries([33.333333, 50, 100].map(t => [`over${t}ms`, times.filter(v => v > t).length])),
    shedTicks, shedSimulationMs: shedTicks * fixedStepMs,
    note: 'Phase quantiles are separate distributions; never sum their p95s. GPU samples must have passed disjoint validation. Missing GPU is unknown, not zero.',
  };
}
const MATCH_KEYS = ['route', 'scenarioRevision', 'inputTapeHash', 'seed', 'hull', 'device',
  'resolution', 'quality', 'profile', 'physicsBackend', 'cacheState', 'displayHz'];
export function compareManifests(a = {}, b = {}) {
  const missing = MATCH_KEYS.filter(k => a[k] === undefined || b[k] === undefined);
  const different = MATCH_KEYS.filter(k => a[k] !== undefined && b[k] !== undefined
    && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return {comparable: missing.length === 0 && different.length === 0, missing, different,
    note: 'Commit may differ intentionally. Asset/content changes and observer overhead still require explicit review; this is not statistical validation.'};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node frameAudit.mjs trace.json [baseline.json]');
    const trace = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const output = {candidate: analyzeTrace(trace)};
    if (process.argv[3]) {
      const baseline = JSON.parse(readFileSync(process.argv[3], 'utf8'));
      output.baseline = analyzeTrace(baseline);
      output.comparison = compareManifests(trace.manifest, baseline.manifest);
    }
    console.log(JSON.stringify(output, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
