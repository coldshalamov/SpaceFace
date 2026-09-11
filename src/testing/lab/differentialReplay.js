// Node vs Chromium differential replay (Phase 4 §15).
// Compile once → identical canonical under Node lab + Chromium host → compare checkpoints.
// On divergence: last matching checkpoint + first differing field (raw, not rounded away).

import { createHash } from 'node:crypto';
import { canonicalStringify, createSimSnapshotRingBuffer } from '../../core/simSnapshot.js';
import { createInputCommandHistory } from '../../core/inputCommandSnapshot.js';
import { compileSimScenario, validateCanonicalScenario } from '../../contracts/simScenarioSchema.js';
import { runLabScenarioInternal, SIM_DT } from './runScenario.js';
import { createInputTapeDriver, hashInputTape, resolveFrameInput } from './inputTape.js';
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
    const sameCompiledArtifact = nodeResult.scenarioDigest === scenarioDigest
      && chromiumResult.scenarioDigest === scenarioDigest
      && nodeResult.inputDigest === inputDigest
      && chromiumResult.inputDigest === inputDigest;
    return {
      schema: 'spaceface.labDifferentialReplay.v1',
      ok: false,
      exitClass: isUnsupported ? 4 : 3,
      status: chromiumResult.status || 'infra',
      runId,
      scenarioDigest,
      inputDigest,
      sameCompiledArtifact,
      sameArtifact: {
        scenarioDigest,
        inputDigest,
        nodeScenarioDigest: nodeResult.scenarioDigest ?? null,
        chromiumScenarioDigest: chromiumResult.scenarioDigest ?? null,
        match: sameCompiledArtifact,
      },
      error: chromiumResult.error || 'chromium host failure',
      browserLaunches: chromiumResult.browserLaunches | 0,
      node: { series: nodeSeries, finalHash: nodeSeries.at(-1)?.hash || null },
      chromium: slimChromium(chromiumResult),
      exactWithin: { crossRuntime: false, sameCoverage: false },
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

/** Default replay window (PQ-160.00): thirty seconds at the fixed sim tick rate. */
export const REPLAY_WINDOW_SECONDS = 30;

/**
 * Record a deterministic window into the PQ-160.00 replay ring buffers.
 *
 * Runs the scenario once through the fixed internal lab runner with a per-tick checkpoint, then
 * fills:
 *  - `snapshotRing`: canonical deterministic snapshot surfaces, one per tick, hash-keyed by the
 *    checkpoint sha256;
 *  - `inputRing`: the applied input command record per tick plus the raw key events, so the tape can
 *    be reconstructed and replayed.
 *
 * @param {object} scenarioDoc
 * @param {{ seconds?: number, capacity?: number, maxBytes?: number, file?: string }} [options]
 */
export async function recordReplayRun(scenarioDoc, options = {}) {
  const compiled = compileSimScenario(scenarioDoc, { file: options.file });
  if (!compiled.ok) {
    return {
      schema: 'spaceface.labReplayRingRecording.v1',
      ok: false,
      exitClass: 4,
      status: 'invalid-config',
      validation: compiled.validation,
    };
  }
  const canonical = options.canonical || compiled.canonical;
  const ticks = canonical.ticks | 0;
  const dt = Number.isFinite(canonical.dt) && canonical.dt > 0 ? canonical.dt : SIM_DT;
  const tickRate = Math.max(1, Math.round(1 / dt));
  const seconds = Number.isFinite(options.seconds) && options.seconds > 0
    ? options.seconds
    : REPLAY_WINDOW_SECONDS;
  const capacity = Math.max(1, Math.floor(
    Number.isFinite(options.capacity) && options.capacity > 0
      ? options.capacity
      : Math.round(seconds * tickRate),
  ));
  const scenarioDigest = options.scenarioDigest || sha256(canonicalStringify(canonical));
  const inputDigest = options.inputDigest || hashInputTape(canonical.inputTape);

  const canonicalWithCheckpoints = { ...canonical, checkpoints: [] };
  for (let tick = 0; tick < ticks; tick++) {
    canonicalWithCheckpoints.checkpoints.push({ tick, kind: 'deterministic-covered' });
  }

  const result = await runLabScenarioInternal(scenarioDoc, {
    file: options.file,
    canonical: canonicalWithCheckpoints,
    scenarioDigest,
    inputDigest,
    verbosity: 0,
    retainCheckpointSurfaces: true,
    skipMultiRunEquivalence: true,
    childArm: true,
  });
  if (result.exitClass === 3 || result.exitClass === 4) {
    return {
      schema: 'spaceface.labReplayRingRecording.v1',
      ok: false,
      exitClass: result.exitClass,
      status: result.status || 'infra',
      runId: result.runId,
      error: result.error || 'recording run failed',
    };
  }

  const snapshotRing = createSimSnapshotRingBuffer({
    tickRate,
    seconds,
    capacity,
    maxBytes: options.maxBytes,
  });
  const inputRing = createInputCommandHistory({ tickRate, seconds, capacity });

  const recordedTicks = [];
  const mid = (result.checkpoints && result.checkpoints.mid) || [];
  for (const checkpoint of mid) {
    const det = checkpoint.deterministicCovered || checkpoint.semantic;
    if (!det) continue;
    const tick = checkpoint.tick | 0;
    const surface = det.surface != null ? det.surface : { tick, hash: det.hash };
    snapshotRing.recordSnapshot(surface, tick, { hashHex: det.hash });
    recordedTicks.push(tick);
  }
  recordedTicks.sort((a, b) => a - b);

  // Reconstruct the applied input tape by driving the production driver over a scratch state.
  const eventsByTick = new Map();
  const tapeEvents = (canonical.inputTape && canonical.inputTape.events) || [];
  for (const ev of tapeEvents) {
    const tick = ev.tick | 0;
    if (!eventsByTick.has(tick)) eventsByTick.set(tick, []);
    eventsByTick.get(tick).push(ev);
  }
  const tapeFrames = (canonical.inputTape && canonical.inputTape.frames) || [];
  const inputDriver = createInputTapeDriver(canonical.inputTape, {});
  const scratch = {
    settings: { controls: { bindings: null }, gameplay: {} },
    input: {},
    entities: new Map(),
    playerId: 0,
  };
  for (let tick = 0; tick < ticks; tick++) {
    const applied = inputDriver.apply(scratch, tick, dt, {});
    const authoredFrame = resolveFrameInput(tapeFrames, tick);
    inputRing.record(tick, scratch.input, {
      sequence: tick + 1,
      keys: applied.keys,
      events: eventsByTick.get(tick) || [],
      authored: authoredFrame && authoredFrame.input ? authoredFrame.input : null,
    });
  }

  const finalTick = ticks > 0 ? ticks - 1 : (recordedTicks[recordedTicks.length - 1] | 0);
  return {
    schema: 'spaceface.labReplayRingRecording.v1',
    ok: true,
    exitClass: 0,
    status: 'recorded',
    seed: canonical.seed,
    ticks,
    tickRate,
    seconds,
    capacity,
    scenarioDigest,
    inputDigest,
    canonical: canonicalWithCheckpoints,
    snapshotRing,
    inputRing,
    recordedTicks,
    liveHashes: snapshotRing.hashList(),
    liveFinalHash: snapshotRing.hashAt(finalTick),
    ring: snapshotRing.diagnostics(),
    inputs: inputRing.diagnostics(),
  };
}

/**
 * Replay a recorded window from its ring buffers and compare each replay checkpoint hash to the
 * recorded live hash. Deterministic replay must reproduce the live hashes tick-for-tick.
 *
 * @param {object} recording result of {@link recordReplayRun}
 */
export async function replayRingBuffer(recording, options = {}) {
  if (!recording || !recording.canonical || !recording.inputRing || !recording.snapshotRing) {
    return {
      schema: 'spaceface.labReplayRing.v1',
      ok: false,
      exitClass: 4,
      status: 'invalid-config',
      error: 'recording is missing canonical/inputRing/snapshotRing',
    };
  }
  const ticks = recording.ticks | 0;
  const canonical = { ...recording.canonical, inputTape: recording.inputRing.toTape() };
  const result = await runLabScenarioInternal(canonical, {
    canonical,
    scenarioDigest: recording.scenarioDigest,
    inputDigest: recording.inputDigest,
    verbosity: options.verbosity ?? 0,
    skipMultiRunEquivalence: true,
    childArm: true,
  });
  if (result.exitClass === 3 || result.exitClass === 4) {
    return {
      schema: 'spaceface.labReplayRing.v1',
      ok: false,
      exitClass: result.exitClass,
      status: result.status || 'infra',
      runId: result.runId,
      error: result.error || 'replay run failed',
    };
  }

  const byTick = new Map();
  for (const checkpoint of ((result.checkpoints && result.checkpoints.mid) || [])) {
    const det = checkpoint.deterministicCovered || checkpoint.semantic;
    if (det) byTick.set(checkpoint.tick | 0, det.hash);
  }

  let recordedTicks = Array.isArray(recording.recordedTicks) && recording.recordedTicks.length
    ? recording.recordedTicks.slice()
    : Array.from({ length: ticks }, (_, tick) => tick);

  // Clip / replay-window support (PQ-160.01): restrict the compared ticks to a bounded range.
  // No range means the whole recorded tape (PQ-160.00 behaviour).
  const rangeStart = Number.isFinite(options.startTick) ? Math.floor(options.startTick) : null;
  const rangeEnd = Number.isFinite(options.endTick) ? Math.floor(options.endTick) : null;
  const windowed = rangeStart != null || rangeEnd != null;
  if (windowed) {
    recordedTicks = recordedTicks.filter((tick) => (
      (rangeStart == null || tick >= rangeStart) && (rangeEnd == null || tick <= rangeEnd)
    ));
  }

  let compared = 0;
  let firstDivergence = null;
  for (const tick of recordedTicks) {
    const live = recording.snapshotRing.hashAt(tick);
    const replay = byTick.has(tick) ? byTick.get(tick) : null;
    compared += 1;
    if (firstDivergence == null && (live == null || replay == null || live !== replay)) {
      firstDivergence = {
        tick,
        live,
        replay,
        reason: live == null ? 'live-missing' : (replay == null ? 'replay-missing' : 'hash-mismatch'),
      };
    }
  }

  const finalTick = recordedTicks.length
    ? (recordedTicks[recordedTicks.length - 1] | 0)
    : (ticks > 0 ? ticks - 1 : 0);
  const liveFinalHash = recording.snapshotRing.hashAt(finalTick);
  const replayFinalHash = byTick.has(finalTick) ? byTick.get(finalTick) : null;
  const match = firstDivergence == null && liveFinalHash != null && liveFinalHash === replayFinalHash;

  return {
    schema: 'spaceface.labReplayRing.v1',
    ok: match,
    exitClass: match ? 0 : 5,
    status: match ? 'match' : 'divergence',
    seed: recording.seed,
    ticks,
    window: windowed ? { startTick: rangeStart, endTick: rangeEnd } : null,
    comparedTicks: compared,
    match,
    firstDivergence,
    liveFinalHash,
    replayFinalHash,
    tapeInputTicks: recording.inputRing.size | 0,
    fingerprint: result.fingerprint || null,
  };
}

/**
 * Replay one clip window (PQ-160.01) from a recording and compare every in-window tick's
 * replay hash to the live recorded hash. Re-runs the tape from tick 0 (window state depends
 * on prior ticks) but reports only the covered window.
 *
 * @param {object} recording result of {@link recordReplayRun}
 * @param {object} clip      a clip from createClipDirector
 */
export async function replayClipWindow(recording, clip, options = {}) {
  if (!recording || !clip) {
    return {
      schema: 'spaceface.labReplayClip.v1',
      ok: false,
      exitClass: 4,
      status: 'invalid-config',
      error: 'recording and clip are required',
    };
  }
  const startTick = Number.isFinite(clip.startTick) ? Math.floor(clip.startTick) : undefined;
  const endTick = Number.isFinite(clip.endTick) ? Math.floor(clip.endTick) : undefined;
  const result = await replayRingBuffer(recording, { ...options, startTick, endTick });
  return {
    schema: 'spaceface.labReplayClip.v1',
    ok: !!result.ok,
    exitClass: result.exitClass,
    status: result.status,
    clipId: clip.id || null,
    kind: clip.kind || null,
    trickId: clip.trickId || null,
    seed: recording.seed,
    momentTick: clip.momentTick,
    startTick: startTick == null ? null : startTick,
    endTick: endTick == null ? null : endTick,
    comparedTicks: result.comparedTicks | 0,
    match: !!result.match,
    liveFinalHash: result.liveFinalHash,
    replayFinalHash: result.replayFinalHash,
    firstDivergence: result.firstDivergence || null,
  };
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
    inputDigest: r.inputDigest,
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
    scenarioDigest: r.scenarioDigest,
    inputDigest: r.inputDigest,
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
