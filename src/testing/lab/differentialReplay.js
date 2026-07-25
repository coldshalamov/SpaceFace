// Node vs Chromium differential replay (Phase 4 §15).
// Compile once → identical canonical under Node lab + Chromium host → compare checkpoints.
// On divergence: last matching checkpoint + first differing field (raw, not rounded away).

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../core/simSnapshot.js';
import { compileSimScenario, validateCanonicalScenario } from '../../contracts/simScenarioSchema.js';
import { runLabScenario } from './runScenario.js';
import { hashInputTape } from './inputTape.js';
import { compareCheckpoints } from './checkpointCompare.js';
import { runChromiumLabScenario, repeatChromiumLabScenario } from './chromiumHost.js';
import { hashDeterministicSurface } from './checkpoint.js';

/**
 * Compile scenario once, run Node + Chromium, compare deterministic-covered series.
 * @param {object} scenarioDoc
 * @param {object} [options]
 */
export async function runDifferentialReplay(scenarioDoc, options = {}) {
  const runId = options.runId || `diff_${Date.now().toString(36)}`;
  let canonical = options.canonical || null;
  let scenarioDigest = options.scenarioDigest || null;

  if (!canonical) {
    const compiled = compileSimScenario(scenarioDoc, { file: options.file });
    if (!compiled.ok) {
      return {
        schema: 'spaceface.labDifferentialReplay.v1',
        ok: false,
        exitClass: 4,
        status: 'invalid-config',
        runId,
        validation: compiled.validation,
      };
    }
    canonical = compiled.canonical;
  } else {
    const v = validateCanonicalScenario(canonical, { file: options.file });
    if (!v.ok) {
      return {
        schema: 'spaceface.labDifferentialReplay.v1',
        ok: false,
        exitClass: 4,
        status: 'invalid-config',
        runId,
        validation: v,
      };
    }
  }

  if (!scenarioDigest) {
    scenarioDigest = sha256(canonicalStringify(canonical));
  }
  const inputDigest = hashInputTape(canonical.inputTape);
  const ticks = canonical.ticks | 0;
  const checkpointEvery = Math.max(1, (options.checkpointEvery | 0) || Math.max(1, Math.floor(ticks / 3) || 1));
  const checkpointTicks = options.checkpointTicks || defaultCheckpointTicks(ticks, checkpointEvery);

  // --- Node (lab runner) ---
  // Inject mid-run checkpoints for collection only; pin scenarioDigest to the original
  // compiled artifact so Node/Chromium share the same covered surface identity.
  const nodeCanonical = {
    ...canonical,
    checkpoints: checkpointTicks.map((tick) => ({ tick, kind: 'deterministic-covered' })),
  };
  const nodeResult = await runLabScenario(scenarioDoc || canonical, {
    ...options,
    canonical: nodeCanonical,
    scenarioDigest,
    inputDigest,
    verbosity: options.verbosity ?? 1,
  });

  if (!nodeResult.ok && nodeResult.exitClass === 3) {
    return {
      schema: 'spaceface.labDifferentialReplay.v1',
      ok: false,
      exitClass: 3,
      status: 'infra',
      runId,
      scenarioDigest,
      inputDigest,
      error: nodeResult.error || 'node lab infra failure',
      node: slimNode(nodeResult),
    };
  }

  const nodeSeries = extractNodeSeries(nodeResult);

  // --- Chromium ---
  const chromiumResult = await runChromiumLabScenario(canonical, {
    scenarioDigest,
    inputDigest,
    checkpointTicks,
    checkpointEvery,
    timeoutMs: options.timeoutMs,
    headless: options.headless !== false,
    baseUrl: options.baseUrl,
    root: options.root,
  });

  if (!chromiumResult.ok) {
    return {
      schema: 'spaceface.labDifferentialReplay.v1',
      ok: false,
      exitClass: 3,
      status: chromiumResult.status || 'infra',
      runId,
      scenarioDigest,
      inputDigest,
      error: chromiumResult.error || 'chromium host failure',
      browserLaunches: chromiumResult.browserLaunches | 0,
      node: { series: nodeSeries, finalHash: nodeSeries.at(-1)?.hash || null },
      chromium: slimChromium(chromiumResult),
    };
  }

  const chromiumSeries = chromiumResult.series || [];
  const compare = compareCheckpoints(nodeSeries, chromiumSeries, {
    inputWindowAtTick: (tick) => ({
      note: 'tape sticky frames; see canonical.inputTape',
      tick,
    }),
  });

  // Same compiled artifact proof (pinned digests + identical input tape identity)
  const sameArtifact = {
    scenarioDigest,
    inputDigest,
    nodeScenarioDigest: nodeResult.scenarioDigest,
    chromiumScenarioDigest: chromiumResult.scenarioDigest,
    match: nodeResult.scenarioDigest === scenarioDigest
      && chromiumResult.scenarioDigest === scenarioDigest
      && nodeResult.inputDigest === inputDigest
      && chromiumResult.inputDigest === inputDigest,
  };

  const ok = compare.match;
  return {
    schema: 'spaceface.labDifferentialReplay.v1',
    ok,
    exitClass: ok ? 0 : 5,
    status: ok ? 'pass' : 'divergence',
    runId,
    scenarioId: canonical.id,
    seed: canonical.seed,
    ticks,
    scenarioDigest,
    inputDigest,
    sameCompiledArtifact: sameArtifact.match,
    sameArtifact,
    compare,
    firstDivergenceReport: compare.match
      ? 'match'
      : formatFirstDivergence(compare),
    node: {
      series: nodeSeries.map(stripSurfaceUnlessVerbose(options.verbosity)),
      finalHash: nodeSeries.at(-1)?.hash || null,
      fingerprint: nodeResult.fingerprint || null,
      exitClass: nodeResult.exitClass,
    },
    chromium: {
      series: chromiumSeries.map(stripSurfaceUnlessVerbose(options.verbosity)),
      finalHash: chromiumResult.finalHash,
      fingerprint: chromiumResult.fingerprint || null,
      browserLaunches: chromiumResult.browserLaunches | 0,
      durationMs: chromiumResult.durationMs,
    },
    browserLaunches: chromiumResult.browserLaunches | 0,
    exactWithin: {
      crossRuntime: false,
      sameCoverage: compare.exactWithin?.sameCoverage !== false,
    },
  };
}

/**
 * Within-Chromium determinism check (two runs, same artifact).
 */
export async function runChromiumDeterminismCheck(scenarioDoc, options = {}) {
  let canonical = options.canonical || null;
  if (!canonical) {
    const compiled = compileSimScenario(scenarioDoc, { file: options.file });
    if (!compiled.ok) {
      return { ok: false, status: 'invalid-config', validation: compiled.validation };
    }
    canonical = compiled.canonical;
  }
  const scenarioDigest = options.scenarioDigest || sha256(canonicalStringify(canonical));
  const inputDigest = hashInputTape(canonical.inputTape);
  return repeatChromiumLabScenario(canonical, {
    ...options,
    scenarioDigest,
    inputDigest,
  });
}

function extractNodeSeries(nodeResult) {
  // Prefer mid checkpoints (loop-tick keyed, matches Chromium series).
  // Do NOT append final by state.tick — that is off-by-one vs loop tick indexing.
  const mid = nodeResult.checkpoints?.mid || [];
  const series = [];
  for (const m of mid) {
    const det = m.deterministicCovered;
    if (!det) continue;
    series.push({
      tick: m.tick | 0,
      hash: det.hash,
      surface: det.surface || null,
    });
  }
  if (series.length > 0) return series;

  // Fallback: only final (no mid authored).
  const final = nodeResult.checkpoints?.final?.deterministicCovered;
  if (final) {
    series.push({
      tick: (nodeResult.ticks | 0) > 0 ? (nodeResult.ticks | 0) - 1 : 0,
      hash: final.hash,
      surface: final.surface || null,
    });
  }
  return series;
}

function defaultCheckpointTicks(ticks, every) {
  const out = [];
  for (let t = every - 1; t < ticks; t += every) out.push(t);
  if (ticks > 0 && (out.length === 0 || out[out.length - 1] !== ticks - 1)) {
    out.push(ticks - 1);
  }
  return out;
}

function formatFirstDivergence(compare) {
  const d = compare.firstDivergence;
  if (!d) return 'match';
  return `first-divergence-at-tick-${d.tick} field-${d.field} class-${compare.classification}`;
}

function slimNode(r) {
  return {
    ok: r.ok,
    exitClass: r.exitClass,
    status: r.status,
    error: r.error,
    scenarioDigest: r.scenarioDigest,
  };
}

function slimChromium(r) {
  return {
    ok: r.ok,
    status: r.status,
    error: r.error,
    browserLaunches: r.browserLaunches,
  };
}

function stripSurfaceUnlessVerbose(verbosity) {
  const keep = (verbosity | 0) >= 3;
  return (point) => {
    if (keep) return point;
    const { surface, ...rest } = point;
    return rest;
  };
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

export { hashDeterministicSurface };
