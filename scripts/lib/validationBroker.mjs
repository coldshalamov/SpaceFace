// Generic, manifest-driven validation broker (lab Phase 1).
// Makes repeated expensive validation mechanically impossible without a current receipt/claim.
// PQ-017 keeps its public API via scripts/lib/pq017ProbeIterationGuard.mjs compatibility wrappers.

import { randomBytes } from 'node:crypto';
import { mkdir, open, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  readJsonIfPresent,
  writeJsonAtomically,
} from './validationAtomicWrite.mjs';
import {
  computeCandidateDigest,
  computeManifestDigest,
  computeSourceSetDigest,
  deriveFailureIdentity,
  digestSourcePaths,
  readSourceSet,
  stableJson,
} from './validationFingerprint.mjs';
import { runWithTimeout } from './validationProcessControl.mjs';

export const STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  BLOCKED_REPEAT: 'blocked_repeat',
  BLOCKED_MISSING_FAST_RECEIPT: 'blocked_missing_fast_receipt',
  BLOCKED_STALE_CANDIDATE: 'blocked_stale_candidate',
  BLOCKED_UNRESOLVED_FAILURE: 'blocked_unresolved_failure',
  TIMEOUT: 'timeout',
  INFRA_ERROR: 'infra_error',
  NONDETERMINISTIC: 'nondeterministic',
  PROFILE_MISMATCH: 'profile_mismatch',
  CACHED_UNCHANGED: 'cached_unchanged_result',
});

const DEFAULT_RECEIPT_SCHEMA = 'spaceface.validation-fast-gate.v1';
const DEFAULT_LOCK_SCHEMA = 'spaceface.validation-run-lock.v1';
const DEFAULT_INFLIGHT_SCHEMA = 'spaceface.validation-probe-inflight.v1';
const DEFAULT_CLAIM_SCHEMA = 'spaceface.validation-broker-claim.v1';
const FAILURE_POINTER_NAME = 'latest-acceptance-failure.json';
const FAST_RECEIPT_NAME = 'fast-gate.json';
const FAST_RUN_LOCK_NAME = 'fast-run.lock';
const CACHED_RESULT_NAME = 'latest-run-result.json';
const LAUNCH_COUNTS_NAME = 'launch-counts.json';
const CLAIMS_DIR_NAME = 'broker-claims';

// In-process counters (also persisted under artifact root when available).
const globalLaunchCounts = {
  global: 0,
  byProbe: Object.create(null),
  browser: 0,
  electron: 0,
};

export function getLaunchCounts() {
  return {
    global: globalLaunchCounts.global,
    byProbe: { ...globalLaunchCounts.byProbe },
    browser: globalLaunchCounts.browser,
    electron: globalLaunchCounts.electron,
  };
}

export function resetLaunchCountsForTests() {
  globalLaunchCounts.global = 0;
  globalLaunchCounts.byProbe = Object.create(null);
  globalLaunchCounts.browser = 0;
  globalLaunchCounts.electron = 0;
}

function timestamp(value) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function isResolvedByAcceptedEvidence({
  latestFailure,
  acceptedRuntimeKind,
  acceptedGeneratedAt,
}) {
  return Boolean(
    latestFailure?.primaryAcceptance
    && acceptedRuntimeKind === latestFailure.runtimeKind
    && timestamp(acceptedGeneratedAt) > timestamp(latestFailure.generatedAt),
  );
}

function compactFailurePointer(failure, artifactPath = null) {
  const fields = {
    schema: failure.schema,
    generatedAt: failure.generatedAt,
    pass: failure.pass,
    runtimeKind: failure.runtimeKind,
    primaryAcceptance: failure.primaryAcceptance,
    artifactKind: failure.artifactKind,
    phase: failure.phase,
    error: failure.error,
    routeFailure: failure.routeFailure,
    regressionDigest: failure.regressionDigest,
    routeDigest: failure.routeDigest,
    failureFingerprint: failure.failureFingerprint ?? failure.fingerprint,
    family: failure.family,
    migratedFromHistoricalArtifact: failure.migratedFromHistoricalArtifact,
    artifactPath,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== null),
  );
}

function normalizeManifest(manifest = {}) {
  if (!manifest?.id) {
    throw new Error('VALIDATION_MANIFEST_ID_REQUIRED');
  }
  return {
    id: manifest.id,
    runtimeKind: manifest.runtimeKind ?? 'node',
    command: manifest.command ?? process.execPath,
    commandArgs: Object.freeze([...(manifest.commandArgs ?? [])]),
    mode: manifest.mode ?? 'acceptance',
    fastGateCommands: Object.freeze([...(manifest.fastGateCommands ?? [])]),
    scenarioPaths: Object.freeze([...(manifest.scenarioPaths ?? [])]),
    regressionSourcePaths: Object.freeze([...(manifest.regressionSourcePaths ?? [])]),
    productionSourcePaths: Object.freeze([...(manifest.productionSourcePaths ?? [])]),
    harnessSourcePaths: Object.freeze([...(manifest.harnessSourcePaths ?? [])]),
    runtimeProfile: manifest.runtimeProfile ?? 'default',
    timeoutMs: Number(manifest.timeoutMs) > 0 ? Number(manifest.timeoutMs) : 600_000,
    maxLaunchesPerCandidate: Number(manifest.maxLaunchesPerCandidate) > 0
      ? Number(manifest.maxLaunchesPerCandidate)
      : 3,
    artifactRoot: manifest.artifactRoot ?? path.join('.devshots', 'validation', manifest.id),
    fixedSeed: manifest.fixedSeed ?? null,
    receiptSchema: manifest.receiptSchema ?? DEFAULT_RECEIPT_SCHEMA,
    lockSchema: manifest.lockSchema ?? DEFAULT_LOCK_SCHEMA,
    inflightSchema: manifest.inflightSchema ?? DEFAULT_INFLIGHT_SCHEMA,
    claimSchema: manifest.claimSchema ?? DEFAULT_CLAIM_SCHEMA,
    cleanupPolicy: manifest.cleanupPolicy ?? 'kill-tree',
    normalizeFailure: typeof manifest.normalizeFailure === 'function'
      ? manifest.normalizeFailure
      : deriveFailureIdentity,
    requireFastReceipt: manifest.requireFastReceipt !== false,
    // When true, acceptance launches need an explicit broker claim token
    // (in addition to / instead of an on-disk fast-gate receipt claim).
    requireBrokerClaim: manifest.requireBrokerClaim === true,
  };
}

export function createValidationBroker(rawManifest, options = {}) {
  const manifest = normalizeManifest(rawManifest);
  const root = path.resolve(options.root ?? process.cwd());
  const outputRoot = path.resolve(
    options.outputRoot ?? path.join(root, manifest.artifactRoot),
  );

  return {
    manifest,
    root,
    outputRoot,
    computeGateDigests: () => computeGateDigestsFromManifest({ root, manifest }),
    evaluateFastGate,
    createFastGateReceipt: (fields) => createFastGateReceipt({
      receiptSchema: manifest.receiptSchema,
      ...fields,
    }),
    evaluateAcceptanceGate: (fields) => evaluateAcceptanceGate({
      receiptSchema: manifest.receiptSchema,
      ...fields,
    }),
    loadGateState: () => loadGateState({ root, outputRoot, manifest }),
    claimFastGateReceipt: () => claimFastGateReceipt({ outputRoot }),
    acquireRunLock: () => acquireRunLock({ outputRoot, lockSchema: manifest.lockSchema }),
    releaseRunLock: (lockToken) => releaseRunLock({ outputRoot, lockToken }),
    persistFailure: (failure, artifactPath) => persistFailure({
      outputRoot,
      failure,
      artifactPath,
    }),
    publishFastGateReceipt: (receipt) => publishFastGateReceipt({ outputRoot, receipt }),
    publishFastGatePending: () => publishFastGatePending({ outputRoot }),
    readFailurePointer: () => readFailurePointer({ outputRoot }),
    readFastGateReceipt: () => readFastGateReceipt({ outputRoot }),
    readProbeInflight: () => readProbeInflight({ outputRoot }),
    completeProbeClaim: (claimToken) => completeProbeClaim({ outputRoot, claimToken }),
    assertProbeLaunch: (fields) => assertProbeLaunch({
      root,
      outputRoot,
      manifest,
      ...fields,
    }),
    issueBrokerClaim: (fields) => issueBrokerClaim({
      outputRoot,
      manifest,
      ...fields,
    }),
    validateBrokerClaim: (tokenOrPath) => validateBrokerClaim({
      outputRoot,
      manifest,
      tokenOrPath,
    }),
    consumeBrokerClaim: (tokenOrPath) => consumeBrokerClaim({
      outputRoot,
      tokenOrPath,
    }),
    evaluateCachedResult: () => evaluateCachedResult({ root, outputRoot, manifest }),
    recordRunResult: (result) => recordRunResult({ outputRoot, result }),
    authorizeAndMaybeRun: (fields) => authorizeAndMaybeRun({
      root,
      outputRoot,
      manifest,
      ...fields,
    }),
    runProbeProcess: (fields) => runProbeProcess({
      root,
      outputRoot,
      manifest,
      ...fields,
    }),
  };
}

export async function computeGateDigestsFromManifest({ root, manifest: rawManifest }) {
  const manifest = rawManifest.id ? rawManifest : normalizeManifest(rawManifest);
  const [
    productionSources,
    regressionSources,
    harnessSources,
    scenarioSources,
  ] = await Promise.all([
    readSourceSet(root, manifest.productionSourcePaths),
    readSourceSet(root, manifest.regressionSourcePaths),
    readSourceSet(root, manifest.harnessSourcePaths),
    readSourceSet(root, manifest.scenarioPaths),
  ]);
  const productionDigest = computeSourceSetDigest(productionSources);
  const regressionDigest = computeSourceSetDigest(regressionSources);
  const harnessDigest = computeSourceSetDigest(harnessSources);
  const scenarioDigest = computeSourceSetDigest(scenarioSources);
  const inputDigest = computeSourceSetDigest({
    fixedSeed: manifest.fixedSeed,
    commandArgs: manifest.commandArgs,
  });
  const profileDigest = computeSourceSetDigest({
    runtimeProfile: manifest.runtimeProfile,
    runtimeKind: manifest.runtimeKind,
  });
  const manifestDigest = computeManifestDigest(manifest);
  const candidateDigest = computeCandidateDigest({
    candidateId: manifest.id,
    buildId: process.env.SF_BUILD_ID ?? null,
    productionDigest,
    harnessDigest,
    scenarioDigest,
    inputDigest,
    profileDigest,
    manifestDigest,
  });
  return {
    // PQ-017 compatibility aliases
    routeDigest: productionDigest,
    regressionDigest,
    // Generic names
    productionDigest,
    harnessDigest,
    scenarioDigest,
    inputDigest,
    profileDigest,
    manifestDigest,
    candidateDigest,
    buildDigest: shaOfBuildEnv(),
  };
}

function shaOfBuildEnv() {
  return computeSourceSetDigest({
    buildId: process.env.SF_BUILD_ID ?? null,
    node: process.version,
    platform: process.platform,
  });
}

export function evaluateFastGate({
  latestFailure = null,
  acceptedRuntimeKind = null,
  acceptedGeneratedAt = null,
  currentRegressionDigest,
} = {}) {
  if (!latestFailure?.primaryAcceptance) {
    return {
      pass: true,
      reason: 'no-unresolved-primary-failure',
      acknowledgesFailureFingerprint: null,
      status: STATUS.PASS,
    };
  }

  if (isResolvedByAcceptedEvidence({
    latestFailure,
    acceptedRuntimeKind,
    acceptedGeneratedAt,
  })) {
    return {
      pass: true,
      reason: 'newer-accepted-evidence-resolves-failure',
      acknowledgesFailureFingerprint: null,
      status: STATUS.PASS,
    };
  }

  if (latestFailure.regressionDigest !== currentRegressionDigest) {
    return {
      pass: true,
      reason: 'new-regression-covers-latest-failure',
      acknowledgesFailureFingerprint: latestFailure.failureFingerprint,
      status: STATUS.PASS,
    };
  }

  return {
    pass: false,
    reason: 'regression-required-after-acceptance-failure',
    acknowledgesFailureFingerprint: null,
    status: STATUS.BLOCKED_UNRESOLVED_FAILURE,
  };
}

export function createFastGateReceipt({
  generatedAt = new Date().toISOString(),
  routeDigest,
  regressionDigest,
  productionDigest = null,
  candidateDigest = null,
  buildDigest = null,
  scenarioDigest = null,
  inputDigest = null,
  profileDigest = null,
  manifestDigest = null,
  acknowledgesFailureFingerprint = null,
  receiptSchema = DEFAULT_RECEIPT_SCHEMA,
} = {}) {
  return {
    schema: receiptSchema,
    generatedAt,
    routeDigest: routeDigest ?? productionDigest,
    regressionDigest,
    productionDigest: productionDigest ?? routeDigest,
    candidateDigest,
    buildDigest,
    scenarioDigest,
    inputDigest,
    profileDigest,
    manifestDigest,
    acknowledgesFailureFingerprint,
  };
}

export function evaluateAcceptanceGate({
  mode,
  explicitAcceptance,
  explicitDiagnostic,
  receipt,
  latestFailure = null,
  currentRouteDigest,
  currentRegressionDigest,
  currentCandidateDigest = null,
  expectedProfileDigest = null,
  receiptSchema = DEFAULT_RECEIPT_SCHEMA,
} = {}) {
  const diagnostic = mode === 'diagnostic';
  if (diagnostic && !explicitDiagnostic) {
    return {
      pass: false,
      reason: 'explicit-diagnostic-flag-required',
      primaryAcceptance: false,
      resolvesFailure: false,
      status: STATUS.FAIL,
    };
  }

  if (!diagnostic && !explicitAcceptance) {
    return {
      pass: false,
      reason: 'explicit-acceptance-flag-required',
      primaryAcceptance: false,
      resolvesFailure: false,
      status: STATUS.FAIL,
    };
  }

  if (!receipt || receipt.schema !== receiptSchema) {
    return {
      pass: false,
      reason: 'fast-receipt-required',
      primaryAcceptance: false,
      resolvesFailure: false,
      status: STATUS.BLOCKED_MISSING_FAST_RECEIPT,
    };
  }

  if (
    receipt.routeDigest !== currentRouteDigest
    || receipt.regressionDigest !== currentRegressionDigest
  ) {
    return {
      pass: false,
      reason: 'fast-receipt-source-digest-stale',
      primaryAcceptance: false,
      resolvesFailure: false,
      status: STATUS.BLOCKED_STALE_CANDIDATE,
    };
  }

  if (
    currentCandidateDigest
    && receipt.candidateDigest
    && receipt.candidateDigest !== currentCandidateDigest
  ) {
    return {
      pass: false,
      reason: 'fast-receipt-candidate-digest-stale',
      primaryAcceptance: false,
      resolvesFailure: false,
      status: STATUS.BLOCKED_STALE_CANDIDATE,
    };
  }

  if (
    expectedProfileDigest
    && receipt.profileDigest
    && receipt.profileDigest !== expectedProfileDigest
  ) {
    return {
      pass: false,
      reason: 'profile-mismatch',
      primaryAcceptance: false,
      resolvesFailure: false,
      status: STATUS.PROFILE_MISMATCH,
    };
  }

  const resolvesFailure = Boolean(
    latestFailure?.primaryAcceptance
    && receipt.acknowledgesFailureFingerprint === latestFailure.failureFingerprint
    && timestamp(receipt.generatedAt) > timestamp(latestFailure.generatedAt),
  );
  if (latestFailure?.primaryAcceptance && !resolvesFailure) {
    return {
      pass: false,
      reason: 'fast-receipt-does-not-cover-latest-failure',
      primaryAcceptance: false,
      resolvesFailure: false,
      status: STATUS.BLOCKED_UNRESOLVED_FAILURE,
    };
  }

  if (diagnostic) {
    return {
      pass: true,
      reason: 'diagnostic-nonpromoting',
      primaryAcceptance: false,
      resolvesFailure: false,
      status: STATUS.PASS,
    };
  }

  return {
    pass: true,
    reason: 'current-fast-receipt',
    primaryAcceptance: true,
    resolvesFailure,
    status: STATUS.PASS,
  };
}

export async function readFailurePointer({ outputRoot }) {
  return readJsonIfPresent(path.join(outputRoot, FAILURE_POINTER_NAME));
}

export async function readFastGateReceipt({ outputRoot }) {
  return readJsonIfPresent(path.join(outputRoot, FAST_RECEIPT_NAME));
}

export async function claimFastGateReceipt({ outputRoot }) {
  const targetPath = path.join(outputRoot, FAST_RECEIPT_NAME);
  const claimToken = `.${FAST_RECEIPT_NAME}.${process.pid}-${
    randomBytes(6).toString('hex')
  }.claim`;
  const claimPath = path.join(outputRoot, claimToken);
  try {
    await rename(targetPath, claimPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  return {
    claimToken,
    receipt: JSON.parse(await (await import('node:fs/promises')).readFile(claimPath, 'utf8')),
  };
}

export async function acquireRunLock({ outputRoot, lockSchema = DEFAULT_LOCK_SCHEMA }) {
  await mkdir(outputRoot, { recursive: true });
  const lockPath = path.join(outputRoot, FAST_RUN_LOCK_NAME);
  const lockToken = `${process.pid}-${randomBytes(8).toString('hex')}`;
  let handle;
  try {
    handle = await open(lockPath, 'wx');
  } catch (error) {
    if (error?.code === 'EEXIST') return null;
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify({
      schema: lockSchema,
      acquiredAt: new Date().toISOString(),
      lockToken,
    }, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { lockToken };
}

export async function releaseRunLock({ outputRoot, lockToken }) {
  const lockPath = path.join(outputRoot, FAST_RUN_LOCK_NAME);
  const lock = await readJsonIfPresent(lockPath);
  if (!lock) return false;
  if (lock.lockToken !== lockToken) {
    throw new Error('VALIDATION_RUN_LOCK_NOT_OWNED');
  }
  await rm(lockPath);
  return true;
}

export async function readProbeInflight({ outputRoot }) {
  let entries;
  try {
    entries = await readdir(outputRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const claimTokens = entries
    .filter((entry) => (
      entry.isFile()
      && entry.name.startsWith(`.${FAST_RECEIPT_NAME}.`)
      && entry.name.endsWith('.claim')
    ))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(claimTokens.map(async (claimToken) => ({
    claimToken,
    claim: await readJsonIfPresent(path.join(outputRoot, claimToken)),
  })));
}

export async function completeProbeClaim({ outputRoot, claimToken }) {
  const claimPath = resolveClaimPath(outputRoot, claimToken);
  await rm(claimPath, { force: true });
}

function resolveClaimPath(outputRoot, claimToken) {
  if (
    typeof claimToken !== 'string'
    || !claimToken.startsWith(`.${FAST_RECEIPT_NAME}.`)
    || !claimToken.endsWith('.claim')
    || path.basename(claimToken) !== claimToken
  ) {
    throw new Error('VALIDATION_INVALID_PROBE_CLAIM_TOKEN');
  }
  return path.join(outputRoot, claimToken);
}

async function markProbeClaimInflight({
  outputRoot,
  claimToken,
  receipt,
  runtimeKind,
  mode,
  inflightSchema = DEFAULT_INFLIGHT_SCHEMA,
}) {
  const claimPath = resolveClaimPath(outputRoot, claimToken);
  await writeJsonAtomically(claimPath, {
    schema: inflightSchema,
    claimedAt: new Date().toISOString(),
    runtimeKind,
    mode,
    receipt,
  });
}

export async function persistFailure({ outputRoot, failure, artifactPath = null }) {
  if (!failure?.primaryAcceptance) return false;
  const pointer = compactFailurePointer(failure, artifactPath);
  await writeJsonAtomically(
    path.join(outputRoot, FAILURE_POINTER_NAME),
    pointer,
  );
  return true;
}

export async function publishFastGateReceipt({ outputRoot, receipt }) {
  await writeJsonAtomically(
    path.join(outputRoot, FAST_RECEIPT_NAME),
    receipt,
  );
}

export async function publishFastGatePending({ outputRoot }) {
  await writeJsonAtomically(
    path.join(outputRoot, FAST_RECEIPT_NAME),
    {
      schema: 'spaceface.validation-fast-gate.pending.v1',
      generatedAt: new Date().toISOString(),
      reason: 'fast-gate-running',
    },
  );
}

export async function readAcceptedEvidence({ outputRoot, runtimeKind }) {
  if (!['browser', 'electron'].includes(runtimeKind)) return null;
  const evidence = await readJsonIfPresent(path.join(outputRoot, runtimeKind, 'evidence.json'));
  return evidence?.pass === true && evidence?.primaryAcceptance === true ? evidence : null;
}

export async function loadGateState({ root, outputRoot, manifest: rawManifest }) {
  const manifest = rawManifest.id ? rawManifest : normalizeManifest(rawManifest);
  const [digests, latestFailure, receipt, cachedResult] = await Promise.all([
    computeGateDigestsFromManifest({ root, manifest }),
    readFailurePointer({ outputRoot }),
    readFastGateReceipt({ outputRoot }),
    readJsonIfPresent(path.join(outputRoot, CACHED_RESULT_NAME)),
  ]);
  const acceptedEvidence = latestFailure
    ? await readAcceptedEvidence({
      outputRoot,
      runtimeKind: latestFailure.runtimeKind,
    })
    : null;
  return {
    ...digests,
    latestFailure,
    receipt,
    cachedResult,
    acceptedRuntimeKind: acceptedEvidence?.runtimeKind ?? null,
    acceptedGeneratedAt: acceptedEvidence?.generatedAt ?? null,
  };
}

/**
 * Cached unchanged result / blocked_repeat: when the latest primary failure is
 * still open and candidate digests match the failure's digests, refuse launch
 * without spawning a process.
 */
export async function evaluateCachedResult({ root, outputRoot, manifest }) {
  const state = await loadGateState({ root, outputRoot, manifest });
  const latestFailure = state.latestFailure;
  if (!latestFailure?.primaryAcceptance) {
    return { blocked: false, status: STATUS.PASS, reason: 'no-unresolved-primary-failure', state };
  }
  if (isResolvedByAcceptedEvidence(state)) {
    return { blocked: false, status: STATUS.PASS, reason: 'failure-resolved-by-evidence', state };
  }

  const sameRoute = latestFailure.routeDigest === state.routeDigest
    || latestFailure.routeDigest === state.productionDigest;
  const sameRegression = latestFailure.regressionDigest === state.regressionDigest;
  const cached = state.cachedResult;
  const sameFingerprint = Boolean(
    cached?.failureFingerprint
    && cached.failureFingerprint === latestFailure.failureFingerprint
    && cached.status === 'fail'
    && cached.routeDigest === state.routeDigest
    && cached.regressionDigest === state.regressionDigest,
  );

  // Regression digest changed → allow fast gate / ack path (failure can be acknowledged).
  if (!sameRegression) {
    return {
      blocked: false,
      status: STATUS.PASS,
      reason: 'regression-digest-changed',
      state,
    };
  }

  // Production/route sources changed → allow re-authorization with a new receipt.
  if (!sameRoute) {
    return { blocked: false, status: STATUS.PASS, reason: 'sources-changed', state };
  }

  // Unchanged sources + open primary failure → block without launching.
  // Prior cached fail with the same fingerprint → cached_unchanged; otherwise blocked_repeat.
  return {
    blocked: true,
    status: sameFingerprint ? STATUS.CACHED_UNCHANGED : STATUS.BLOCKED_REPEAT,
    reason: sameFingerprint
      ? 'cached-unchanged-failure'
      : 'blocked-repeat-unchanged-failure',
    failureFingerprint: latestFailure.failureFingerprint,
    state,
    launch: false,
  };
}

export async function recordRunResult({ outputRoot, result }) {
  await writeJsonAtomically(path.join(outputRoot, CACHED_RESULT_NAME), {
    schema: 'spaceface.validation-run-result.v1',
    recordedAt: new Date().toISOString(),
    ...result,
  });
}

export async function assertProbeLaunch({
  root,
  outputRoot,
  manifest: rawManifest,
  runtimeKind,
  mode,
  explicitAcceptance,
  explicitDiagnostic,
  brokerClaimToken = null,
}) {
  const manifest = rawManifest.id ? rawManifest : normalizeManifest(rawManifest);

  if (mode === 'diagnostic' && !explicitDiagnostic) {
    throwGateFailure('explicit-diagnostic-flag-required');
  }
  if (mode === 'acceptance' && !explicitAcceptance) {
    throwGateFailure('explicit-acceptance-flag-required');
  }
  if (!['acceptance', 'diagnostic'].includes(mode)) {
    throwGateFailure('unsupported-probe-mode');
  }

  // Diagnostic is non-promoting: still requires a current receipt when requireFastReceipt,
  // but never resolves primary failures (evaluateAcceptanceGate enforces that).
  const cached = await evaluateCachedResult({ root, outputRoot, manifest });
  if (mode === 'acceptance' && cached.blocked) {
    throwGateFailure(cached.reason, {
      pass: false,
      reason: cached.reason,
      primaryAcceptance: false,
      resolvesFailure: false,
      status: cached.status,
    });
  }

  // Optional explicit one-use broker claim (direct-execution protection).
  if (manifest.requireBrokerClaim && mode === 'acceptance') {
    const claimCheck = await validateBrokerClaim({
      outputRoot,
      manifest,
      tokenOrPath: brokerClaimToken ?? process.env.SF_BROKER_CLAIM ?? null,
    });
    if (!claimCheck.ok) {
      throwGateFailure(claimCheck.reason || 'broker-claim-required', {
        pass: false,
        reason: claimCheck.reason || 'broker-claim-required',
        primaryAcceptance: false,
        resolvesFailure: false,
        status: STATUS.BLOCKED_MISSING_FAST_RECEIPT,
      });
    }
  }

  const claimed = await claimFastGateReceipt({ outputRoot });
  let state;
  let result;
  try {
    state = await loadGateState({ root, outputRoot, manifest });
    const resolved = isResolvedByAcceptedEvidence(state);
    result = evaluateAcceptanceGate({
      mode,
      explicitAcceptance,
      explicitDiagnostic,
      receipt: claimed?.receipt ?? null,
      latestFailure: resolved ? null : state.latestFailure,
      currentRouteDigest: state.routeDigest,
      currentRegressionDigest: state.regressionDigest,
      currentCandidateDigest: state.candidateDigest,
      expectedProfileDigest: state.profileDigest,
      receiptSchema: manifest.receiptSchema,
    });
    if (!result.pass) {
      throwGateFailure(result.reason, result);
    }
  } catch (error) {
    if (claimed?.claimToken) {
      await completeProbeClaim({ outputRoot, claimToken: claimed.claimToken });
    }
    throw error;
  }

  await markProbeClaimInflight({
    outputRoot,
    claimToken: claimed.claimToken,
    receipt: claimed.receipt,
    runtimeKind,
    mode,
    inflightSchema: manifest.inflightSchema,
  });

  // Consume one-use broker claim after successful authorization.
  if (manifest.requireBrokerClaim && mode === 'acceptance') {
    const token = brokerClaimToken ?? process.env.SF_BROKER_CLAIM ?? null;
    if (token) await consumeBrokerClaim({ outputRoot, tokenOrPath: token });
  }

  recordLaunch(manifest.id, runtimeKind);

  return {
    ...result,
    ...state,
    receipt: claimed.receipt,
    claimToken: claimed.claimToken,
    status: result.status ?? STATUS.PASS,
  };
}

function recordLaunch(probeId, runtimeKind) {
  globalLaunchCounts.global += 1;
  globalLaunchCounts.byProbe[probeId] = (globalLaunchCounts.byProbe[probeId] ?? 0) + 1;
  if (runtimeKind === 'browser') globalLaunchCounts.browser += 1;
  if (runtimeKind === 'electron') globalLaunchCounts.electron += 1;
}

export async function issueBrokerClaim({
  outputRoot,
  manifest: rawManifest,
  receipt = null,
  mode = 'acceptance',
  expiresInMs = 30 * 60_000,
  digests = null,
}) {
  const manifest = rawManifest.id ? rawManifest : normalizeManifest(rawManifest);
  const claimsDir = path.join(outputRoot, CLAIMS_DIR_NAME);
  await mkdir(claimsDir, { recursive: true });
  const claimId = `${process.pid}-${randomBytes(12).toString('hex')}`;
  const claimPath = path.join(claimsDir, `${claimId}.json`);
  const claim = {
    schema: manifest.claimSchema,
    claimId,
    manifestId: manifest.id,
    mode,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    consumed: false,
    receipt: receipt
      ? {
        routeDigest: receipt.routeDigest,
        regressionDigest: receipt.regressionDigest,
        candidateDigest: receipt.candidateDigest ?? null,
        acknowledgesFailureFingerprint: receipt.acknowledgesFailureFingerprint ?? null,
      }
      : null,
    digests,
  };
  await writeJsonAtomically(claimPath, claim);
  return { claimId, claimPath, claim };
}

export async function validateBrokerClaim({
  outputRoot,
  manifest: rawManifest,
  tokenOrPath,
}) {
  const manifest = rawManifest?.id ? rawManifest : normalizeManifest(rawManifest ?? { id: 'unknown' });
  if (!tokenOrPath) {
    return { ok: false, reason: 'broker-claim-required' };
  }

  const claimPath = resolveBrokerClaimPath(outputRoot, tokenOrPath);
  const claim = await readJsonIfPresent(claimPath);
  if (!claim) {
    return { ok: false, reason: 'broker-claim-missing' };
  }
  if (claim.schema !== manifest.claimSchema && claim.schema !== DEFAULT_CLAIM_SCHEMA) {
    return { ok: false, reason: 'broker-claim-schema-mismatch' };
  }
  if (claim.manifestId && claim.manifestId !== manifest.id) {
    return { ok: false, reason: 'broker-claim-manifest-mismatch' };
  }
  if (claim.consumed) {
    return { ok: false, reason: 'broker-claim-already-consumed' };
  }
  if (timestamp(claim.expiresAt) < Date.now()) {
    return { ok: false, reason: 'broker-claim-expired' };
  }
  return { ok: true, claim, claimPath };
}

export async function consumeBrokerClaim({ outputRoot, tokenOrPath }) {
  const claimPath = resolveBrokerClaimPath(outputRoot, tokenOrPath);
  const claim = await readJsonIfPresent(claimPath);
  if (!claim) return false;
  if (claim.consumed) return false;
  claim.consumed = true;
  claim.consumedAt = new Date().toISOString();
  await writeJsonAtomically(claimPath, claim);
  return true;
}

function resolveBrokerClaimPath(outputRoot, tokenOrPath) {
  if (typeof tokenOrPath !== 'string' || !tokenOrPath) {
    throw new Error('VALIDATION_INVALID_BROKER_CLAIM');
  }
  // Absolute / relative path to claim file
  if (tokenOrPath.endsWith('.json') && (path.isAbsolute(tokenOrPath) || tokenOrPath.includes('/') || tokenOrPath.includes('\\'))) {
    return path.resolve(tokenOrPath);
  }
  // Bare claim id
  const safeId = path.basename(tokenOrPath).replace(/[^a-zA-Z0-9._-]/g, '');
  return path.join(outputRoot, CLAIMS_DIR_NAME, `${safeId}.json`);
}

/**
 * Direct-execution protection helper for expensive probes.
 * Fail-closed unless a valid one-use broker claim is present (or diagnostic mode).
 */
export async function requireBrokerClaimOrDiagnostic({
  outputRoot,
  manifest,
  tokenOrPath = process.env.SF_BROKER_CLAIM ?? null,
  diagnostic = process.argv.includes('--diagnostic'),
  explicitDiagnostic = process.argv.includes('--diagnostic'),
}) {
  if (diagnostic) {
    if (!explicitDiagnostic) {
      return {
        ok: false,
        status: STATUS.FAIL,
        reason: 'explicit-diagnostic-flag-required',
        diagnostic: false,
      };
    }
    return {
      ok: true,
      status: STATUS.PASS,
      reason: 'diagnostic-nonpromoting',
      diagnostic: true,
      primaryAcceptance: false,
    };
  }
  const check = await validateBrokerClaim({
    outputRoot,
    manifest,
    tokenOrPath,
  });
  if (!check.ok) {
    return {
      ok: false,
      status: STATUS.BLOCKED_MISSING_FAST_RECEIPT,
      reason: check.reason,
      diagnostic: false,
    };
  }
  await consumeBrokerClaim({ outputRoot, tokenOrPath });
  return {
    ok: true,
    status: STATUS.PASS,
    reason: 'broker-claim-consumed',
    diagnostic: false,
    primaryAcceptance: true,
    claim: check.claim,
  };
}

async function authorizeAndMaybeRun({
  root,
  outputRoot,
  manifest,
  mode = 'acceptance',
  explicitAcceptance = mode === 'acceptance',
  explicitDiagnostic = mode === 'diagnostic',
  spawnProbe = true,
  extraArgs = [],
  env = null,
}) {
  const lock = await acquireRunLock({ outputRoot, lockSchema: manifest.lockSchema });
  if (!lock) {
    return {
      status: STATUS.FAIL,
      reason: 'run-lock-held',
      launched: false,
    };
  }

  try {
    const cached = await evaluateCachedResult({ root, outputRoot, manifest });
    if (mode === 'acceptance' && cached.blocked) {
      return {
        status: cached.status,
        reason: cached.reason,
        failureFingerprint: cached.failureFingerprint,
        launched: false,
        cached: true,
      };
    }

    const digests = await computeGateDigestsFromManifest({ root, manifest });
    let receipt = await readFastGateReceipt({ outputRoot });

    // Auto-mint a receipt when sources are clean and no unresolved failure blocks.
    const fastEval = evaluateFastGate({
      latestFailure: cached.state.latestFailure,
      acceptedRuntimeKind: cached.state.acceptedRuntimeKind,
      acceptedGeneratedAt: cached.state.acceptedGeneratedAt,
      currentRegressionDigest: digests.regressionDigest,
    });
    if (!fastEval.pass && mode === 'acceptance') {
      return {
        status: STATUS.BLOCKED_UNRESOLVED_FAILURE,
        reason: fastEval.reason,
        launched: false,
      };
    }

    if (
      !receipt
      || receipt.routeDigest !== digests.routeDigest
      || receipt.regressionDigest !== digests.regressionDigest
    ) {
      receipt = createFastGateReceipt({
        receiptSchema: manifest.receiptSchema,
        routeDigest: digests.routeDigest,
        regressionDigest: digests.regressionDigest,
        productionDigest: digests.productionDigest,
        candidateDigest: digests.candidateDigest,
        buildDigest: digests.buildDigest,
        scenarioDigest: digests.scenarioDigest,
        inputDigest: digests.inputDigest,
        profileDigest: digests.profileDigest,
        manifestDigest: digests.manifestDigest,
        acknowledgesFailureFingerprint: fastEval.acknowledgesFailureFingerprint,
      });
      await publishFastGateReceipt({ outputRoot, receipt });
    }

    const issued = await issueBrokerClaim({
      outputRoot,
      manifest,
      receipt,
      mode,
      digests,
    });

    if (!spawnProbe) {
      return {
        status: STATUS.PASS,
        reason: 'claim-issued',
        launched: false,
        claim: issued,
        receipt,
        digests,
      };
    }

    const run = await runProbeProcess({
      root,
      outputRoot,
      manifest,
      claimPath: issued.claimPath,
      extraArgs,
      env,
    });

    return {
      ...run,
      claim: issued,
      receipt,
      digests,
      launched: true,
    };
  } finally {
    await releaseRunLock({ outputRoot, lockToken: lock.lockToken });
  }
}

async function runProbeProcess({
  root,
  outputRoot,
  manifest,
  claimPath = null,
  extraArgs = [],
  env = null,
}) {
  const probeEnv = {
    ...(env ?? {}),
    SF_BROKER_CLAIM: claimPath ?? process.env.SF_BROKER_CLAIM ?? '',
    SF_VALIDATION_MANIFEST_ID: manifest.id,
    SF_PROBE_SEED: manifest.fixedSeed != null ? String(manifest.fixedSeed) : (process.env.SF_PROBE_SEED ?? ''),
  };

  const ownership = {
    probeId: manifest.id,
    runtimeKind: manifest.runtimeKind,
    browserOwned: manifest.runtimeKind === 'browser',
    serverOwned: true,
  };

  const result = await runWithTimeout({
    command: manifest.command,
    args: [...manifest.commandArgs, ...extraArgs],
    cwd: root,
    timeoutMs: manifest.timeoutMs,
    env: probeEnv,
    ownership,
  });

  recordLaunch(manifest.id, manifest.runtimeKind);

  await recordRunResult({
    outputRoot,
    result: {
      status: result.status,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      pidRecord: result.pidRecord,
      ownership: result.ownership,
      fixedSeed: manifest.fixedSeed,
    },
  });

  return {
    status: result.status,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    pidRecord: result.pidRecord,
    ownership: result.ownership,
    fixedSeed: manifest.fixedSeed,
  };
}

function throwGateFailure(reason, result = null) {
  const gateResult = result ?? {
    pass: false,
    reason,
    primaryAcceptance: false,
    resolvesFailure: false,
    status: STATUS.FAIL,
  };
  const error = new Error(`VALIDATION_PREFLIGHT_BLOCKED: ${reason}`);
  error.code = 'VALIDATION_PREFLIGHT_BLOCKED';
  error.gateResult = gateResult;
  throw error;
}

export {
  FAILURE_POINTER_NAME,
  FAST_RECEIPT_NAME,
  FAST_RUN_LOCK_NAME,
  DEFAULT_RECEIPT_SCHEMA,
  deriveFailureIdentity,
  computeSourceSetDigest,
  digestSourcePaths,
  isResolvedByAcceptedEvidence,
  stableJson,
};
