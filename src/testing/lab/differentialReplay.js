// Node vs Chromium differential replay (Phase 4 §15).
// Compile once → identical canonical under Node lab + Chromium host → compare checkpoints.
// On divergence: last matching checkpoint + first differing field (raw, not rounded away).

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../core/simSnapshot.js';
import { compileSimScenario, validateCanonicalScenario } from '../../contracts/simScenarioSchema.js';
import { runLabScenarioInternal } from './runScenario.js';
import { hashInputTape } from './inputTape.js';
import { compareCheckpoints } from './checkpointCompare.js';
import { runChromiumLabScenarioInternal, repeatChromiumLabScenario } from './chromiumHost.js';
import { hashDeterministicSurface } from './checkpoint.js';
import { assertChromiumParitySupported } from './browserScenarioHost.js';
import {
  collectDeclaredEquivalences,
  foreignEquivalencesFor,
  DIFFERENTIAL_OWNED_EQUIVALENCES,
} from './equivalenceOwnership.js';

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

  // FIX 3: reject scenarios the Chromium host cannot run with an equivalent bundle.
  const chromeSupport = assertChromiumParitySupported(canonical);
  if (!chromeSupport.ok) {
    return {
      schema: 'spaceface.labDifferentialReplay.v1',
      ok: false,
      exitClass: 4,
      status: 'unsupported',
      runId,
      scenarioId: canonical.id,
      error: chromeSupport.reason,
      chromiumSupport: chromeSupport,
    };
  }

  // O4: arms are FIXED internal executors — caller-supplied runNodeArm/runChromiumArm
  // are deliberately ignored (and rejected if provided) so fabricated arms cannot certify.
  // Checked before ownership so config injection fails closed with invalid-config.
  if (options.runNodeArm != null || options.runChromiumArm != null) {
    return {
      schema: 'spaceface.labDifferentialReplay.v1',
      ok: false,
      exitClass: 4,
      status: 'invalid-config',
      certifying: false,
      runId,
      error: 'runDifferentialReplay does not accept caller-supplied arm callbacks — '
        + 'Node arm is always runLabScenarioInternal; Chromium arm is always runChromiumLabScenarioInternal',
    };
  }

  // R2: this parent owns only node-eq-chromium / browser-parity (and aliases).
  // Foreign declared claims (e.g. run-eq-repeat) → incomplete, never certify them.
  const declaredEq = collectDeclaredEquivalences(scenarioDoc || canonical);
  const foreignEq = foreignEquivalencesFor('differential', declaredEq);
  if (foreignEq.length > 0) {
    return {
      schema: 'spaceface.labDifferentialReplay.v1',
      ok: false,
      exitClass: 4,
      status: 'incomplete',
      reason: 'unsupported equivalence for this executor',
      detail: `runDifferentialReplay does not own: ${foreignEq.join(', ')} — use the owning parent executor`,
      runId,
      scenarioId: canonical.id,
      declaredEquivalences: declaredEq,
      foreignEquivalences: foreignEq,
      ownedEquivalences: [...DIFFERENTIAL_OWNED_EQUIVALENCES],
      certifying: false,
    };
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
  // retainCheckpointSurfaces: field-level divergence localization needs mid surfaces.
  const nodeCanonical = {
    ...canonical,
    checkpoints: checkpointTicks.map((tick) => ({ tick, kind: 'deterministic-covered' })),
  };

  // O1/O4: Node arm is always the fixed internal (nonPromoting) lab runner.
  const nodeResult = await runLabScenarioInternal(scenarioDoc || canonical, {
    file: options.file,
    canonical: nodeCanonical,
    scenarioDigest,
    inputDigest,
    verbosity: options.verbosity ?? 1,
    retainCheckpointSurfaces: true,
    // Multi-run equivalences (run-eq-repeat / save-load) are not owned by differential
    // replay — parent proves Node vs Chromium checkpoint identity instead.
    skipMultiRunEquivalence: true,
    childArm: true,
  });

  if (nodeResult.exitClass === 3) {
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
  if (nodeResult.exitClass === 4) {
    return {
      schema: 'spaceface.labDifferentialReplay.v1',
      ok: false,
      exitClass: 4,
      status: nodeResult.status || 'invalid-config',
      runId,
      scenarioDigest,
      inputDigest,
      error: nodeResult.error || 'node lab invalid-config',
      node: slimNode(nodeResult),
      validation: nodeResult.validation,
    };
  }

  const nodeSeries = extractNodeSeries(nodeResult);

  // --- Chromium (fixed internal host — never a caller callback) ---
  // P2: use internal non-certifying Chromium runner (same split as Node runLabScenarioInternal).
  const chromiumResult = await runChromiumLabScenarioInternal(canonical, {
    scenarioDigest,
    inputDigest,
    checkpointTicks,
    checkpointEvery,
    timeoutMs: options.timeoutMs,
    headless: options.headless !== false,
    baseUrl: options.baseUrl,
    root: options.root,
    skipMultiRunEquivalence: true,
  });

  // Host-level Chromium failures (no usable run / unsupported) — not oracle results.
  // Oracle fail (status:'fail' with series+oracle) falls through to the both-arms gate.
  const chromiumHostFailed = isChromiumHostFailure(chromiumResult);
  if (chromiumHostFailed) {
    const isUnsupported = chromiumResult.status === 'unsupported';
    return {
      schema: 'spaceface.labDifferentialReplay.v1',
      ok: false,
      exitClass: isUnsupported ? 4 : 3,
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

  // FIX 2 + FIX 7: parity requires both arms' oracles to pass.
  // Chromium must expose an explicit oracle result (host execution success alone is not enough).
  const nodeOracleOk = !!nodeResult.ok;
  const chromiumOracleOk = !!(chromiumResult.oracle && chromiumResult.oracle.ok);
  if (!nodeOracleOk || !chromiumOracleOk) {
    const failedArms = [];
    if (!nodeOracleOk) failedArms.push('node');
    if (!chromiumOracleOk) failedArms.push('chromium');
    return {
      schema: 'spaceface.labDifferentialReplay.v1',
      ok: false,
      exitClass: 1,
      status: 'arm-oracle-fail',
      runId,
      scenarioId: canonical.id,
      seed: canonical.seed,
      ticks,
      scenarioDigest,
      inputDigest,
      failedArms,
      armFailures: {
        node: armFailureSummary(nodeResult),
        chromium: armFailureSummary(chromiumResult),
      },
      compare: {
        match: false,
        firstDivergence: {
          kind: 'arm-oracle-fail',
          field: 'oracle',
          reason: !chromiumResult.oracle
            ? 'chromium oracle missing (host success is not oracle success)'
            : `oracle failed on arm(s): ${failedArms.join(', ')}`,
          failedArms,
        },
        lastMatchingTick: null,
        classification: 'setup',
      },
      firstDivergenceReport: `arm-oracle-fail:${failedArms.join(',')}`,
      // Artifact identity still reportable on arm-oracle-fail for diagnostics.
      sameCompiledArtifact: nodeResult.scenarioDigest === scenarioDigest
        && chromiumResult.scenarioDigest === scenarioDigest
        && nodeResult.inputDigest === inputDigest
        && chromiumResult.inputDigest === inputDigest,
      node: {
        series: nodeSeries.map(stripSurfaceUnlessVerbose(options.verbosity, true)),
        finalHash: nodeSeries.at(-1)?.hash || null,
        fingerprint: nodeResult.fingerprint || null,
        exitClass: nodeResult.exitClass,
        ok: nodeResult.ok,
        oracle: nodeResult.oracle || null,
      },
      chromium: {
        series: (chromiumResult.series || []).map(stripSurfaceUnlessVerbose(options.verbosity, true)),
        finalHash: chromiumResult.finalHash,
        fingerprint: chromiumResult.fingerprint || null,
        browserLaunches: chromiumResult.browserLaunches | 0,
        durationMs: chromiumResult.durationMs,
        ok: chromiumResult.ok,
        oracle: chromiumResult.oracle || null,
      },
      browserLaunches: chromiumResult.browserLaunches | 0,
      exactWithin: { crossRuntime: false, sameCoverage: false },
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

  // G7: gate overall success on runtime fingerprint / manifest identity match.
  // Different slots or system bundles between Node and Chromium must FAIL, not soft-pass
  // when checkpoints happen to match.
  const fingerprintCompare = compareRuntimeFingerprints(
    nodeResult.fingerprint,
    chromiumResult.fingerprint,
  );

  // H13: different compiled artifacts are a setup error, not parity.
  const bothArmsOk = !!(nodeResult.ok && chromiumResult.ok);
  const ok = sameArtifact.match && fingerprintCompare.match && bothArmsOk && compare.match;
  // On divergence, retain surfaces so the report can show field-level residual even at low verbosity.
  const keepSurfaces = !ok || (options.verbosity | 0) >= 3;
  let status = 'pass';
  let exitClass = 0;
  if (!ok) {
    if (!sameArtifact.match) {
      status = 'artifact-mismatch';
      exitClass = 4;
    } else if (!fingerprintCompare.match) {
      status = 'fingerprint-mismatch';
      exitClass = 4;
    } else if (!bothArmsOk) {
      status = 'arm-fail';
      exitClass = 5;
    } else {
      status = 'divergence';
      exitClass = 5;
    }
  }
  return {
    schema: 'spaceface.labDifferentialReplay.v1',
    ok,
    exitClass,
    status,
    runId,
    scenarioId: canonical.id,
    seed: canonical.seed,
    ticks,
    scenarioDigest,
    inputDigest,
    sameCompiledArtifact: sameArtifact.match,
    sameArtifact,
    fingerprintMatch: fingerprintCompare.match,
    fingerprintCompare,
    bothArmsOk,
    compare,
    firstDivergenceReport: !fingerprintCompare.match
      ? `fingerprint-mismatch:${fingerprintCompare.reason || 'runtime-identity'}`
      : (compare.match ? 'match' : formatFirstDivergence(compare)),
    node: {
      series: nodeSeries.map(stripSurfaceUnlessVerbose(options.verbosity, keepSurfaces)),
      finalHash: nodeSeries.at(-1)?.hash || null,
      fingerprint: nodeResult.fingerprint || null,
      exitClass: nodeResult.exitClass,
      ok: nodeResult.ok,
    },
    chromium: {
      series: chromiumSeries.map(stripSurfaceUnlessVerbose(options.verbosity, keepSurfaces)),
      finalHash: chromiumResult.finalHash,
      fingerprint: chromiumResult.fingerprint || null,
      browserLaunches: chromiumResult.browserLaunches | 0,
      durationMs: chromiumResult.durationMs,
      ok: chromiumResult.ok,
      oracle: chromiumResult.oracle || null,
    },
    browserLaunches: chromiumResult.browserLaunches | 0,
    exactWithin: {
      crossRuntime: false,
      sameCoverage: compare.exactWithin?.sameCoverage !== false,
    },
  };
}

/**
 * G7: Node vs Chromium must share the same runtime fingerprint (manifest identity).
 * Missing fingerprints cannot prove identity → fail closed.
 */
export function compareRuntimeFingerprints(nodeFp, chromiumFp) {
  if (!nodeFp || !chromiumFp) {
    return {
      match: false,
      reason: 'fingerprint-missing',
      node: nodeFp || null,
      chromium: chromiumFp || null,
    };
  }
  const nManifest = nodeFp.manifestHash ?? null;
  const cManifest = chromiumFp.manifestHash ?? null;
  if (nManifest == null || cManifest == null) {
    return {
      match: false,
      reason: 'manifestHash-missing',
      node: nodeFp,
      chromium: chromiumFp,
    };
  }
  if (nManifest !== cManifest) {
    return {
      match: false,
      reason: 'manifestHash-mismatch',
      node: nodeFp,
      chromium: chromiumFp,
      expected: nManifest,
      actual: cManifest,
    };
  }
  // I10: BOTH manifestHash and profileHash must be present and matching.
  // Missing profileHash must fail closed (same as missing manifestHash).
  const nProfile = nodeFp.profileHash ?? null;
  const cProfile = chromiumFp.profileHash ?? null;
  if (nProfile == null || cProfile == null) {
    return {
      match: false,
      reason: 'profileHash-missing',
      node: nodeFp,
      chromium: chromiumFp,
    };
  }
  if (nProfile !== cProfile) {
    return {
      match: false,
      reason: 'profileHash-mismatch',
      node: nodeFp,
      chromium: chromiumFp,
      expected: nProfile,
      actual: cProfile,
    };
  }
  return { match: true, reason: null, node: nodeFp, chromium: chromiumFp };
}

/**
 * True when Chromium failed as a host (infra/unsupported/timeout), not as an oracle.
 * Oracle-fail arms still carry series + oracle and must go through arm-oracle-fail.
 */
function isChromiumHostFailure(chromiumResult) {
  if (!chromiumResult) return true;
  const status = chromiumResult.status;
  if (
    status === 'unsupported'
    || status === 'infra'
    || status === 'infra_error'
    || status === 'timeout'
    || status === 'invalid-config'
  ) {
    return true;
  }
  // status:'fail' with an oracle object is an arm oracle result, not host failure.
  if (status === 'fail' && chromiumResult.oracle) return false;
  // Missing series after a "successful" host path is infra.
  if (chromiumResult.ok === false && !chromiumResult.oracle && !Array.isArray(chromiumResult.series)) {
    return true;
  }
  return false;
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
    // Determinism is series-hash identity; multi-run scenario equivalences are out of scope.
    skipMultiRunEquivalence: true,
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
    oracle: r.oracle
      ? { ok: r.oracle.ok, firstBadTick: r.oracle.firstBadTick, failed: r.oracle.failed }
      : null,
  };
}

function slimChromium(r) {
  return {
    ok: r.ok,
    status: r.status,
    error: r.error,
    browserLaunches: r.browserLaunches,
    oracle: r.oracle
      ? { ok: r.oracle.ok, firstBadTick: r.oracle.firstBadTick, failed: r.oracle.failed }
      : null,
  };
}

function armFailureSummary(result) {
  if (!result) return { ok: false, reason: 'missing-result' };
  return {
    ok: !!result.ok,
    exitClass: result.exitClass,
    status: result.status,
    error: result.error || null,
    oracle: result.oracle
      ? { ok: result.oracle.ok, firstBadTick: result.oracle.firstBadTick, failed: result.oracle.failed }
      : null,
  };
}

/**
 * @param {number} verbosity
 * @param {boolean} [forceKeep] when true (divergence / oracle-fail path), retain surfaces for localization
 */
function stripSurfaceUnlessVerbose(verbosity, forceKeep = false) {
  const keep = forceKeep || (verbosity | 0) >= 3;
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
