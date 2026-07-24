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
/** Default upper bound for declared fast-gate commands (cheap Node checks). */
const DEFAULT_FAST_GATE_TIMEOUT_MS = 180_000;
/** Extra margin when reclaiming aged locks with inconclusive PID liveness. */
const STALE_LOCK_MARGIN_MS = 60_000;

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

/** True if a process with this PID is still running (EPERM ⇒ alive but unsignalable). */
export function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (error) {
    if (error?.code === 'EPERM') return true;
    return false;
  }
}

function parsePidFromLockToken(lockToken) {
  const pid = Number(String(lockToken ?? '').split('-')[0]);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

/**
 * Parse a fast-gate command entry into { command, args } for runWithTimeout.
 * Strings run via the platform shell so npm scripts and flags work; arrays are direct argv.
 */
export function parseFastGateCommand(entry) {
  if (Array.isArray(entry) && entry.length > 0) {
    return { command: String(entry[0]), args: entry.slice(1).map(String) };
  }
  const line = String(entry ?? '').trim();
  if (!line) {
    return { command: '', args: [] };
  }
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', line],
    };
  }
  return { command: '/bin/sh', args: ['-c', line] };
}

function resolveFastGateTimeoutMs(manifest) {
  if (Number(manifest.fastGateTimeoutMs) > 0) {
    return Number(manifest.fastGateTimeoutMs);
  }
  const manifestTimeout = Number(manifest.timeoutMs) > 0
    ? Number(manifest.timeoutMs)
    : DEFAULT_FAST_GATE_TIMEOUT_MS;
  return Math.min(manifestTimeout, DEFAULT_FAST_GATE_TIMEOUT_MS);
}

/**
 * Execute every declared manifest.fastGateCommands entry. Fail-closed: any
 * nonzero exit / timeout / infra_error blocks receipt minting.
 */
export async function runDeclaredFastGates({ root, manifest }) {
  const commands = [...(manifest.fastGateCommands ?? [])];
  if (commands.length === 0) {
    return { pass: true, results: [], reason: 'no-fast-gate-commands' };
  }
  const timeoutMs = resolveFastGateTimeoutMs(manifest);
  const results = [];
  for (const entry of commands) {
    const parsed = parseFastGateCommand(entry);
    if (!parsed.command) {
      return {
        pass: false,
        status: STATUS.FAIL,
        reason: 'fast-gate-empty-command',
        failedCommand: entry,
        results,
      };
    }
    const result = await runWithTimeout({
      command: parsed.command,
      args: parsed.args,
      cwd: root,
      timeoutMs,
      ownership: {
        probeId: manifest.id,
        phase: 'fast-gate',
        command: typeof entry === 'string' ? entry : JSON.stringify(entry),
      },
    });
    results.push({
      command: entry,
      status: result.status,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    if (result.status !== 'pass') {
      return {
        pass: false,
        status: result.status === 'timeout' ? STATUS.TIMEOUT : STATUS.FAIL,
        reason: 'fast-gate-failed',
        failedCommand: entry,
        results,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
      };
    }
  }
  return { pass: true, results, reason: 'fast-gates-passed' };
}

async function readPersistedLaunchCounts(outputRoot) {
  const data = await readJsonIfPresent(path.join(outputRoot, LAUNCH_COUNTS_NAME));
  if (!data || typeof data !== 'object') {
    return { schema: 'spaceface.validation-launch-counts.v1', byCandidate: {} };
  }
  return {
    schema: data.schema ?? 'spaceface.validation-launch-counts.v1',
    byCandidate: { ...(data.byCandidate ?? {}) },
    currentCandidateDigest: data.currentCandidateDigest ?? null,
  };
}

export async function getCandidateLaunchCount(outputRoot, candidateDigest) {
  if (!candidateDigest) return 0;
  const data = await readPersistedLaunchCounts(outputRoot);
  return Number(data.byCandidate[candidateDigest]) || 0;
}

/**
 * Persist candidate-keyed launch counts. Keys that no longer match the current
 * candidate digest are dropped so a new source set starts at zero.
 */
export async function incrementCandidateLaunchCount(outputRoot, candidateDigest) {
  if (!candidateDigest) return 0;
  const previous = await readPersistedLaunchCounts(outputRoot);
  const prior = Number(previous.byCandidate[candidateDigest]) || 0;
  const next = {
    schema: 'spaceface.validation-launch-counts.v1',
    currentCandidateDigest: candidateDigest,
    // Reset other candidate keys when the digest changes (new source).
    byCandidate: {
      [candidateDigest]: prior + 1,
    },
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomically(path.join(outputRoot, LAUNCH_COUNTS_NAME), next);
  return next.byCandidate[candidateDigest];
}

function brokerClaimConsumedSentinelPath(claimPath) {
  return `${claimPath}.consumed`;
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
    acquireRunLock: () => acquireRunLock({
      outputRoot,
      lockSchema: manifest.lockSchema,
      timeoutMs: manifest.timeoutMs,
    }),
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
    validateBrokerClaim: (tokenOrPath, fields = {}) => validateBrokerClaim({
      outputRoot,
      manifest,
      root,
      tokenOrPath,
      ...fields,
    }),
    consumeBrokerClaim: (tokenOrPath) => consumeBrokerClaim({
      outputRoot,
      tokenOrPath,
    }),
    evaluateCachedResult: () => evaluateCachedResult({ root, outputRoot, manifest }),
    recordRunResult: (result) => recordRunResult({ outputRoot, result }),
    runDeclaredFastGates: () => runDeclaredFastGates({ root, manifest }),
    getCandidateLaunchCount: (candidateDigest) => getCandidateLaunchCount(
      outputRoot,
      candidateDigest,
    ),
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

/**
 * Try to reclaim a left-behind run lock when the owner PID is dead (or the lock
 * is older than max probe duration with an inconclusive PID). Never reclaim a
 * lock whose owner is demonstrably still running.
 */
export async function tryReclaimStaleRunLock({
  outputRoot,
  timeoutMs = 600_000,
  log = console.warn,
} = {}) {
  const lockPath = path.join(outputRoot, FAST_RUN_LOCK_NAME);
  const lock = await readJsonIfPresent(lockPath);
  if (!lock) {
    // Empty/corrupt race: remove if present so wx can proceed.
    try {
      await rm(lockPath, { force: true });
      return { reclaimed: true, reason: 'missing-or-unreadable-lock' };
    } catch {
      return { reclaimed: false, reason: 'lock-remove-failed' };
    }
  }

  const ownerPid = Number.isFinite(Number(lock.pid))
    ? Number(lock.pid)
    : parsePidFromLockToken(lock.lockToken);

  if (ownerPid != null && isPidAlive(ownerPid)) {
    return { reclaimed: false, reason: 'owner-alive', ownerPid };
  }

  if (ownerPid != null && !isPidAlive(ownerPid)) {
    await rm(lockPath, { force: true });
    log?.(
      `[validationBroker] reclaimed stale run lock (dead owner pid=${ownerPid}) at ${lockPath}`,
    );
    return { reclaimed: true, reason: 'owner-dead', ownerPid };
  }

  // Inconclusive PID: only reclaim if the lock is older than timeout + margin.
  const acquiredAt = timestamp(lock.acquiredAt);
  const maxAgeMs = (Number(timeoutMs) > 0 ? Number(timeoutMs) : 600_000) + STALE_LOCK_MARGIN_MS;
  if (Number.isFinite(acquiredAt) && Date.now() - acquiredAt > maxAgeMs) {
    await rm(lockPath, { force: true });
    log?.(
      `[validationBroker] reclaimed aged run lock (inconclusive PID, age>${maxAgeMs}ms) at ${lockPath}`,
    );
    return { reclaimed: true, reason: 'aged-inconclusive-pid', ownerPid };
  }

  return { reclaimed: false, reason: 'inconclusive-not-aged', ownerPid };
}

export async function acquireRunLock({
  outputRoot,
  lockSchema = DEFAULT_LOCK_SCHEMA,
  timeoutMs = 600_000,
} = {}) {
  await mkdir(outputRoot, { recursive: true });
  const lockPath = path.join(outputRoot, FAST_RUN_LOCK_NAME);
  const lockToken = `${process.pid}-${randomBytes(8).toString('hex')}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle;
    try {
      handle = await open(lockPath, 'wx');
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      // FIX6: recover verifiably stale locks (dead PID / aged inconclusive).
      const reclaim = await tryReclaimStaleRunLock({ outputRoot, timeoutMs });
      if (reclaim.reclaimed && attempt === 0) continue;
      return null;
    }
    try {
      await handle.writeFile(`${JSON.stringify({
        schema: lockSchema,
        acquiredAt: new Date().toISOString(),
        lockToken,
        pid: process.pid,
      }, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    return { lockToken, pid: process.pid };
  }
  return null;
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
      root,
      tokenOrPath: brokerClaimToken ?? process.env.SF_BROKER_CLAIM ?? null,
    });
    if (!claimCheck.ok) {
      throwGateFailure(claimCheck.reason || 'broker-claim-required', {
        pass: false,
        reason: claimCheck.reason || 'broker-claim-required',
        primaryAcceptance: false,
        resolvesFailure: false,
        status: claimCheck.reason === 'broker-claim-stale-digest'
          ? STATUS.BLOCKED_STALE_CANDIDATE
          : STATUS.BLOCKED_MISSING_FAST_RECEIPT,
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

  // Consume one-use broker claim after successful authorization (atomic).
  if (manifest.requireBrokerClaim && mode === 'acceptance') {
    const token = brokerClaimToken ?? process.env.SF_BROKER_CLAIM ?? null;
    if (token) {
      const consumed = await consumeBrokerClaim({ outputRoot, tokenOrPath: token });
      if (!consumed) {
        if (claimed?.claimToken) {
          await completeProbeClaim({ outputRoot, claimToken: claimed.claimToken });
        }
        throwGateFailure('broker-claim-already-consumed', {
          pass: false,
          reason: 'broker-claim-already-consumed',
          primaryAcceptance: false,
          resolvesFailure: false,
          status: STATUS.BLOCKED_MISSING_FAST_RECEIPT,
        });
      }
    }
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
  const boundDigests = digests ?? (receipt
    ? {
      routeDigest: receipt.routeDigest ?? receipt.productionDigest ?? null,
      productionDigest: receipt.productionDigest ?? receipt.routeDigest ?? null,
      regressionDigest: receipt.regressionDigest ?? null,
      candidateDigest: receipt.candidateDigest ?? null,
      buildDigest: receipt.buildDigest ?? null,
      scenarioDigest: receipt.scenarioDigest ?? null,
      inputDigest: receipt.inputDigest ?? null,
      profileDigest: receipt.profileDigest ?? null,
      manifestDigest: receipt.manifestDigest ?? null,
    }
    : null);
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
        productionDigest: receipt.productionDigest ?? receipt.routeDigest ?? null,
        acknowledgesFailureFingerprint: receipt.acknowledgesFailureFingerprint ?? null,
      }
      : null,
    digests: boundDigests,
  };
  await writeJsonAtomically(claimPath, claim);
  return { claimId, claimPath, claim };
}

export async function validateBrokerClaim({
  outputRoot,
  manifest: rawManifest,
  tokenOrPath,
  root = null,
  digests = null,
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
  // Treat O_EXCL consumed sentinel as already-consumed even if JSON write lagged.
  const sentinel = await readJsonIfPresent(brokerClaimConsumedSentinelPath(claimPath));
  if (claim.consumed || sentinel) {
    return { ok: false, reason: 'broker-claim-already-consumed' };
  }
  if (timestamp(claim.expiresAt) < Date.now()) {
    return { ok: false, reason: 'broker-claim-expired' };
  }

  // FIX4: bind claims to the current candidate/source digests.
  let current = digests;
  if (!current && root) {
    current = await computeGateDigestsFromManifest({ root, manifest });
  }
  if (current) {
    const claimCandidate = claim.digests?.candidateDigest
      ?? claim.receipt?.candidateDigest
      ?? null;
    const claimRoute = claim.digests?.routeDigest
      ?? claim.digests?.productionDigest
      ?? claim.receipt?.routeDigest
      ?? claim.receipt?.productionDigest
      ?? null;
    const claimRegression = claim.digests?.regressionDigest
      ?? claim.receipt?.regressionDigest
      ?? null;
    if (claimCandidate && claimCandidate !== current.candidateDigest) {
      return { ok: false, reason: 'broker-claim-stale-digest', claim, claimPath };
    }
    if (claimRoute && claimRoute !== current.routeDigest) {
      return { ok: false, reason: 'broker-claim-stale-digest', claim, claimPath };
    }
    if (claimRegression && claimRegression !== current.regressionDigest) {
      return { ok: false, reason: 'broker-claim-stale-digest', claim, claimPath };
    }
  }

  return { ok: true, claim, claimPath };
}

/**
 * Atomically consume a one-use broker claim.
 *
 * Mechanism: exclusive create (`wx` / O_EXCL) of a sibling `.consumed` sentinel
 * file. Only the caller that successfully creates the sentinel is authorized;
 * concurrent consumers observe EEXIST and fail with already-consumed. The claim
 * JSON is then marked consumed for durable inspection. This closes the TOCTOU
 * window between validateBrokerClaim and consumeBrokerClaim.
 */
export async function consumeBrokerClaim({ outputRoot, tokenOrPath }) {
  const claimPath = resolveBrokerClaimPath(outputRoot, tokenOrPath);
  const claim = await readJsonIfPresent(claimPath);
  if (!claim) return false;
  if (claim.consumed) return false;

  const sentinelPath = brokerClaimConsumedSentinelPath(claimPath);
  let handle;
  try {
    // Atomic authorization: exclusive create — only one process wins.
    handle = await open(sentinelPath, 'wx');
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  }

  try {
    const consumedAt = new Date().toISOString();
    await handle.writeFile(`${JSON.stringify({
      schema: 'spaceface.validation-broker-claim-consumed.v1',
      claimId: claim.claimId ?? null,
      consumedAt,
      pid: process.pid,
    }, null, 2)}\n`, 'utf8');
    await handle.sync();
    claim.consumed = true;
    claim.consumedAt = consumedAt;
    await writeJsonAtomically(claimPath, claim);
    return true;
  } finally {
    await handle.close();
  }
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
  root = null,
  digests = null,
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
    root,
    digests,
  });
  if (!check.ok) {
    return {
      ok: false,
      status: check.reason === 'broker-claim-stale-digest'
        ? STATUS.BLOCKED_STALE_CANDIDATE
        : STATUS.BLOCKED_MISSING_FAST_RECEIPT,
      reason: check.reason,
      diagnostic: false,
    };
  }
  // Atomic consume — concurrent second caller loses here even if both validated.
  const consumed = await consumeBrokerClaim({ outputRoot, tokenOrPath });
  if (!consumed) {
    return {
      ok: false,
      status: STATUS.BLOCKED_MISSING_FAST_RECEIPT,
      reason: 'broker-claim-already-consumed',
      diagnostic: false,
    };
  }
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
  const lock = await acquireRunLock({
    outputRoot,
    lockSchema: manifest.lockSchema,
    timeoutMs: manifest.timeoutMs,
  });
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

    // FIX3: enforce maxLaunchesPerCandidate before any expensive spawn.
    if (spawnProbe && mode === 'acceptance') {
      const priorLaunches = await getCandidateLaunchCount(
        outputRoot,
        digests.candidateDigest,
      );
      if (priorLaunches >= manifest.maxLaunchesPerCandidate) {
        return {
          status: STATUS.BLOCKED_REPEAT,
          reason: 'max-launches-per-candidate',
          launched: false,
          candidateDigest: digests.candidateDigest,
          launchCount: priorLaunches,
          maxLaunchesPerCandidate: manifest.maxLaunchesPerCandidate,
        };
      }
    }

    // FIX1: run declared fast gates before minting a receipt.
    const fastGates = await runDeclaredFastGates({ root, manifest });
    if (!fastGates.pass) {
      return {
        status: fastGates.status ?? STATUS.FAIL,
        reason: fastGates.reason ?? 'fast-gate-failed',
        launched: false,
        failedCommand: fastGates.failedCommand ?? null,
        fastGateResults: fastGates.results,
        stdout: fastGates.stdout,
        stderr: fastGates.stderr,
        exitCode: fastGates.exitCode,
      };
    }

    let receipt = await readFastGateReceipt({ outputRoot });

    // Auto-mint a receipt only after ALL declared fast gates pass and failure gate is clean.
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
        fastGateResults: fastGates.results,
      };
    }

    const run = await runProbeProcess({
      root,
      outputRoot,
      manifest,
      claimPath: issued.claimPath,
      extraArgs,
      env,
      digests,
    });

    return {
      ...run,
      claim: issued,
      receipt,
      digests,
      launched: true,
      fastGateResults: fastGates.results,
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
  digests: precomputedDigests = null,
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

  const digests = precomputedDigests
    ?? await computeGateDigestsFromManifest({ root, manifest });

  // Count a launch only after a successful spawn (child started / finished with a code).
  const spawned = Boolean(
    result.pidRecord?.pid
    || result.exitCode != null
    || result.timedOut
    || result.status === 'pass'
    || result.status === 'fail'
    || result.status === 'timeout',
  );
  if (spawned) {
    recordLaunch(manifest.id, manifest.runtimeKind);
    await incrementCandidateLaunchCount(outputRoot, digests.candidateDigest);
  }

  // FIX2: persist failed probe outcomes so the next identical run sees latestFailure.
  let failureFingerprint = null;
  let family = null;
  const failed = result.status !== 'pass';
  if (failed) {
    const errorText = [
      result.stderr,
      result.stdout,
      result.timedOut ? `TIMEOUT after ${manifest.timeoutMs}ms` : null,
      result.status === 'infra_error' ? 'infra_error' : null,
      result.exitCode != null ? `exitCode=${result.exitCode}` : null,
    ].filter(Boolean).join('\n').slice(0, 4000);

    const identity = manifest.normalizeFailure({
      runtimeKind: manifest.runtimeKind,
      phase: 'acceptance-probe',
      error: errorText || `probe-${result.status}`,
      primaryAcceptance: true,
    });
    failureFingerprint = identity.fingerprint;
    family = identity.family;

    await persistFailure({
      outputRoot,
      failure: {
        schema: 'spaceface.validation-acceptance-failure.v1',
        generatedAt: new Date().toISOString(),
        pass: false,
        primaryAcceptance: true,
        runtimeKind: manifest.runtimeKind,
        phase: 'acceptance-probe',
        error: errorText || `probe-${result.status}`,
        failureFingerprint,
        family,
        routeDigest: digests.routeDigest,
        regressionDigest: digests.regressionDigest,
        candidateDigest: digests.candidateDigest,
        artifactKind: 'probe-run',
      },
    });
  }

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
      failureFingerprint,
      family,
      routeDigest: digests.routeDigest,
      regressionDigest: digests.regressionDigest,
      candidateDigest: digests.candidateDigest,
    },
  });

  return {
    status: result.status === 'pass' ? STATUS.PASS
      : result.status === 'timeout' ? STATUS.TIMEOUT
        : result.status === 'infra_error' ? STATUS.INFRA_ERROR
          : STATUS.FAIL,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    pidRecord: result.pidRecord,
    ownership: result.ownership,
    fixedSeed: manifest.fixedSeed,
    failureFingerprint,
    family,
    digests,
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
  LAUNCH_COUNTS_NAME,
  DEFAULT_RECEIPT_SCHEMA,
  deriveFailureIdentity,
  computeSourceSetDigest,
  digestSourcePaths,
  isResolvedByAcceptedEvidence,
  stableJson,
};
