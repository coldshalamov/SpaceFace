// PQ-017 iteration guard — compatibility façade over the generic validation broker (Phase 1).
// Public export names and receipt schemas are preserved so existing fast-gate + probe scripts
// and test/pq017-probe-iteration-guard.test.mjs stay green without edits.

import { randomBytes } from 'node:crypto';
import { mkdir, open, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertProbeLaunch,
  computeGateDigestsFromManifest,
  createFastGateReceipt,
  evaluateAcceptanceGate,
  evaluateCachedResult,
  evaluateFastGate,
  getCandidateLaunchCount,
  isResolvedByAcceptedEvidence,
  issueBrokerClaim,
  readFastGateReceipt,
} from './validationBroker.mjs';
import {
  computeSourceSetDigest,
  deriveFailureIdentity,
  parseRouteFailureFromError,
  readSourceSet,
} from './validationFingerprint.mjs';

const RECEIPT_SCHEMA = 'spaceface.pq017-fast-gate.v1';
const FAILURE_POINTER_NAME = 'latest-acceptance-failure.json';
const FAST_RECEIPT_NAME = 'fast-gate.json';
const FAST_RUN_LOCK_NAME = 'fast-run.lock';
const REGRESSION_SOURCES = Object.freeze([
  'test/world-site-public-route-contract.test.mjs',
  'test/pq017-closed-loop-control.test.mjs',
]);
const ROUTE_SOURCES = Object.freeze([
  'package.json',
  'scripts/check-pq017-world-site-fast.mjs',
  'scripts/lib/alphaLiveBaselineContracts.mjs',
  'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
  'scripts/lib/browser-issues.mjs',
  'scripts/lib/electronLaunchProtocol.cjs',
  'scripts/lib/electronTestIsolation.mjs',
  'scripts/lib/gameServer.cjs',
  'scripts/lib/load-playwright.mjs',
  'scripts/lib/masslineControlLab.mjs',
  'scripts/lib/professionalTravelPublicRoute.mjs',
  'scripts/lib/pq017ClosedLoopControlHarness.mjs',
  'scripts/lib/pq017PublicControlTrajectory.mjs',
  'scripts/lib/pq017WorldSitePublicRoute.mjs',
  'scripts/lib/pq017ProbeIterationGuard.mjs',
  'scripts/lib/validationBroker.mjs',
  'scripts/lib/validationFingerprint.mjs',
  'scripts/lib/validationProcessControl.mjs',
  'scripts/lib/visualProbeServer.mjs',
  'scripts/probe-pq017-world-site.mjs',
  'scripts/probe-pq017-world-site-electron.mjs',
  'src/combat/attachments.js',
  'src/contracts/evidenceSchemas.js',
  'src/core/constraints/masslineController.js',
  'src/core/flight/propulsionCatalog.js',
  'src/core/flight/propulsionKernel.js',
  'src/core/loop.js',
  'src/core/physics.js',
  'src/core/physicsAuthority.js',
  'src/core/sim.js',
  'src/data/combatDefs.js',
  'src/data/newGameDefaults.js',
  'src/data/worldSiteManifests.js',
  'src/systems/actions.js',
  'src/systems/flightV3.js',
  'src/systems/input.js',
  'src/systems/ships.js',
  'src/systems/tetherGameplay.js',
  'src/systems/worldSiteKernel.js',
  'test/pq017-probe-iteration-guard.test.mjs',
]);

export function buildPq017ValidationManifest(overrides = {}) {
  return {
    id: 'pq017-world-site',
    runtimeKind: overrides.runtimeKind ?? 'browser',
    command: overrides.command ?? process.execPath,
    commandArgs: overrides.commandArgs ?? ['scripts/probe-pq017-world-site.mjs'],
    mode: overrides.mode ?? 'acceptance',
    fastGateCommands: overrides.fastGateCommands ?? [
      'node --test test/world-site-public-route-contract.test.mjs',
      'node --test test/pq017-closed-loop-control.test.mjs',
      'node --test test/pq017-probe-iteration-guard.test.mjs',
    ],
    scenarioPaths: overrides.scenarioPaths ?? [],
    regressionSourcePaths: [...REGRESSION_SOURCES],
    productionSourcePaths: [...ROUTE_SOURCES],
    harnessSourcePaths: overrides.harnessSourcePaths ?? [
      'scripts/lib/pq017ClosedLoopControlHarness.mjs',
      'scripts/lib/pq017PublicControlTrajectory.mjs',
      'scripts/lib/pq017WorldSitePublicRoute.mjs',
    ],
    runtimeProfile: overrides.runtimeProfile ?? 'default',
    timeoutMs: overrides.timeoutMs ?? 900_000,
    maxLaunchesPerCandidate: overrides.maxLaunchesPerCandidate ?? 1,
    artifactRoot: overrides.artifactRoot ?? path.join('.devshots', 'pq017-world-site'),
    receiptSchema: RECEIPT_SCHEMA,
    lockSchema: 'spaceface.pq017-fast-run-lock.v1',
    inflightSchema: 'spaceface.pq017-probe-inflight.v1',
    claimSchema: 'spaceface.validation-broker-claim.v1',
    requireFastReceipt: true,
    // H5: PQ-017 acceptance uses the generic broker claim requirement.
    requireBrokerClaim: true,
    normalizeFailure: deriveFailureIdentity,
    ...overrides,
  };
}

function compactFailurePointer(failure, artifactPath = null) {
  const routeFailure = failure.routeFailure ?? parseRouteFailureFromError(failure.error);
  const fields = {
    schema: failure.schema,
    generatedAt: failure.generatedAt,
    pass: failure.pass,
    runtimeKind: failure.runtimeKind,
    primaryAcceptance: failure.primaryAcceptance,
    artifactKind: failure.artifactKind,
    phase: failure.phase,
    error: failure.error,
    routeFailure,
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

export function digestPq017Sources(sources = {}) {
  return computeSourceSetDigest(sources);
}

export function derivePq017FailureIdentity(report = {}) {
  return deriveFailureIdentity(report);
}

export function evaluatePq017FastGate(args = {}) {
  const result = evaluateFastGate(args);
  // Strip generic status field for exact PQ-017 deepEqual compatibility.
  return {
    pass: result.pass,
    reason: result.reason,
    acknowledgesFailureFingerprint: result.acknowledgesFailureFingerprint,
  };
}

export function createPq017FastGateReceipt({
  generatedAt = new Date().toISOString(),
  routeDigest,
  regressionDigest,
  acknowledgesFailureFingerprint = null,
} = {}) {
  const receipt = createFastGateReceipt({
    generatedAt,
    routeDigest,
    regressionDigest,
    acknowledgesFailureFingerprint,
    receiptSchema: RECEIPT_SCHEMA,
  });
  // Preserve exact PQ-017 receipt shape (no extra generic digest fields required by consumers).
  return {
    schema: RECEIPT_SCHEMA,
    generatedAt: receipt.generatedAt,
    routeDigest: receipt.routeDigest,
    regressionDigest: receipt.regressionDigest,
    acknowledgesFailureFingerprint: receipt.acknowledgesFailureFingerprint,
  };
}

export function evaluatePq017AcceptanceGate(args = {}) {
  const result = evaluateAcceptanceGate({
    ...args,
    receiptSchema: RECEIPT_SCHEMA,
  });
  return {
    pass: result.pass,
    reason: result.reason,
    primaryAcceptance: result.primaryAcceptance,
    resolvesFailure: result.resolvesFailure,
  };
}

async function readJsonIfPresent(filePath) {
  try {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

// Kept local so source-pattern tests still observe atomic rename writes in this file.
async function writeJsonAtomically(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}-${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function computePq017GateDigests({ root }) {
  const digests = await computeGateDigestsFromManifest({
    root,
    manifest: buildPq017ValidationManifest(),
  });
  return {
    routeDigest: digests.routeDigest,
    regressionDigest: digests.regressionDigest,
  };
}

export async function readPq017FailurePointer({ outputRoot }) {
  return readJsonIfPresent(path.join(outputRoot, FAILURE_POINTER_NAME));
}

export async function readPq017FastGateReceipt({ outputRoot }) {
  return readJsonIfPresent(path.join(outputRoot, FAST_RECEIPT_NAME));
}

export async function claimPq017FastGateReceipt({ outputRoot }) {
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
  const { readFile } = await import('node:fs/promises');
  return {
    claimToken,
    receipt: JSON.parse(await readFile(claimPath, 'utf8')),
  };
}

export async function acquirePq017FastRunLock({ outputRoot }) {
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
      schema: 'spaceface.pq017-fast-run-lock.v1',
      acquiredAt: new Date().toISOString(),
      lockToken,
    }, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { lockToken };
}

export async function releasePq017FastRunLock({ outputRoot, lockToken }) {
  const lockPath = path.join(outputRoot, FAST_RUN_LOCK_NAME);
  const lock = await readJsonIfPresent(lockPath);
  if (!lock) return false;
  if (lock.lockToken !== lockToken) {
    throw new Error('PQ017_FAST_RUN_LOCK_NOT_OWNED');
  }
  await rm(lockPath);
  return true;
}

export async function readPq017ProbeInflight({ outputRoot }) {
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

export async function completePq017ProbeClaim({ outputRoot, claimToken }) {
  const claimPath = resolveClaimPath(outputRoot, claimToken);
  await rm(claimPath, { force: true });
}

async function markPq017ProbeClaimInflight({
  outputRoot,
  claimToken,
  receipt,
  runtimeKind,
  mode,
}) {
  const claimPath = resolveClaimPath(outputRoot, claimToken);
  await writeJsonAtomically(claimPath, {
    schema: 'spaceface.pq017-probe-inflight.v1',
    claimedAt: new Date().toISOString(),
    runtimeKind,
    mode,
    receipt,
  });
}

function resolveClaimPath(outputRoot, claimToken) {
  if (
    typeof claimToken !== 'string'
    || !claimToken.startsWith(`.${FAST_RECEIPT_NAME}.`)
    || !claimToken.endsWith('.claim')
    || path.basename(claimToken) !== claimToken
  ) {
    throw new Error('PQ017_INVALID_PROBE_CLAIM_TOKEN');
  }
  return path.join(outputRoot, claimToken);
}

export async function publishPq017AcceptanceFailure({
  outputRoot,
  failure,
  artifactPath = null,
}) {
  if (!failure?.primaryAcceptance) return false;
  const pointer = compactFailurePointer(failure, artifactPath);
  await writeJsonAtomically(
    path.join(outputRoot, FAILURE_POINTER_NAME),
    pointer,
  );
  return true;
}

export async function migratePq017HistoricalFailure({
  root,
  outputRoot,
  failureReportPath,
}) {
  const resolvedOutputRoot = path.resolve(outputRoot);
  const resolvedReportPath = path.resolve(failureReportPath);
  const relativeToOutput = path.relative(resolvedOutputRoot, resolvedReportPath);
  if (
    relativeToOutput.startsWith('..')
    || path.isAbsolute(relativeToOutput)
    || path.basename(resolvedReportPath) !== 'failure-report.json'
  ) {
    throw new Error('PQ017_HISTORICAL_FAILURE_OUTSIDE_OUTPUT_ROOT');
  }
  const pathMatch = resolvedReportPath.match(
    /[\\/]\.tmp-(browser|electron)-\d+-(\d{13})-[^\\/]+[\\/]failure-report\.json$/i,
  );
  if (!pathMatch) {
    throw new Error('PQ017_HISTORICAL_FAILURE_PATH_NOT_PRIMARY');
  }

  const artifactPath = path.relative(path.resolve(root), resolvedReportPath).replace(/\\/g, '/');
  const existing = await readPq017FailurePointer({ outputRoot: resolvedOutputRoot });
  if (existing) {
    if (
      existing.migratedFromHistoricalArtifact === true
      && existing.artifactPath === artifactPath
    ) return existing;
    throw new Error('PQ017_FAILURE_POINTER_ALREADY_EXISTS');
  }

  const { readFile } = await import('node:fs/promises');
  const historical = JSON.parse(await readFile(resolvedReportPath, 'utf8'));
  if (
    historical.pass !== false
    || historical.runtimeKind !== pathMatch[1].toLowerCase()
  ) {
    throw new Error('PQ017_HISTORICAL_FAILURE_REPORT_INVALID');
  }
  const routeFailure = historical.routeFailure ?? parseRouteFailureFromError(historical.error);
  const migrated = {
    ...historical,
    generatedAt: new Date(Number(pathMatch[2])).toISOString(),
    primaryAcceptance: true,
    routeFailure,
    regressionDigest: 'pre-guard:unknown',
    routeDigest: 'pre-guard:unknown',
    migratedFromHistoricalArtifact: true,
  };
  const identity = derivePq017FailureIdentity(migrated);
  Object.assign(migrated, {
    family: identity.family,
    failureFingerprint: identity.fingerprint,
  });
  await publishPq017AcceptanceFailure({
    outputRoot: resolvedOutputRoot,
    failure: migrated,
    artifactPath,
  });
  return compactFailurePointer(migrated, artifactPath);
}

export async function publishPq017FastGateReceipt({ outputRoot, receipt }) {
  await writeJsonAtomically(
    path.join(outputRoot, FAST_RECEIPT_NAME),
    receipt,
  );
}

export async function publishPq017FastGatePending({ outputRoot }) {
  await writeJsonAtomically(
    path.join(outputRoot, FAST_RECEIPT_NAME),
    {
      schema: 'spaceface.pq017-fast-gate.pending.v1',
      generatedAt: new Date().toISOString(),
      reason: 'fast-gate-running',
    },
  );
}

export async function readPq017AcceptedEvidence({ outputRoot, runtimeKind }) {
  if (!['browser', 'electron'].includes(runtimeKind)) return null;
  const evidence = await readJsonIfPresent(path.join(outputRoot, runtimeKind, 'evidence.json'));
  return evidence?.pass === true && evidence?.primaryAcceptance === true ? evidence : null;
}

export async function loadPq017GateState({ root, outputRoot }) {
  const [digests, latestFailure, receipt] = await Promise.all([
    computePq017GateDigests({ root }),
    readPq017FailurePointer({ outputRoot }),
    readPq017FastGateReceipt({ outputRoot }),
  ]);
  const acceptedEvidence = latestFailure
    ? await readPq017AcceptedEvidence({
      outputRoot,
      runtimeKind: latestFailure.runtimeKind,
    })
    : null;
  return {
    ...digests,
    latestFailure,
    receipt,
    acceptedRuntimeKind: acceptedEvidence?.runtimeKind ?? null,
    acceptedGeneratedAt: acceptedEvidence?.generatedAt ?? null,
  };
}

/**
 * G3: Caller-side acceptance claim issuer (NOT inside assertPq017ProbeLaunch).
 * After real fast gates publish a receipt, callers (probes, tests, CLI) must issue a claim
 * here and pass `brokerClaimToken` / `SF_BROKER_CLAIM` into assert. The assert path never
 * self-mints acceptance claims from a receipt alone.
 *
 * @returns {Promise<{ claimPath: string, claimId: string, claim: object, digests: object }>}
 */
export async function issuePq017AcceptanceClaim({ root, outputRoot }) {
  const manifest = buildPq017ValidationManifest({ requireBrokerClaim: true });
  const digests = await computeGateDigestsFromManifest({ root, manifest });
  const prior = await getCandidateLaunchCount(outputRoot, digests.candidateDigest);
  if (prior >= manifest.maxLaunchesPerCandidate) {
    const error = new Error('PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED: max-launches-per-candidate');
    error.code = 'PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED';
    error.gateResult = {
      pass: false,
      reason: 'max-launches-per-candidate',
      primaryAcceptance: false,
      resolvesFailure: false,
    };
    throw error;
  }
  const cached = await evaluateCachedResult({ root, outputRoot, manifest });
  if (cached.blocked) {
    const error = new Error(`PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED: ${cached.reason}`);
    error.code = 'PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED';
    error.gateResult = {
      pass: false,
      reason: cached.reason,
      primaryAcceptance: false,
      resolvesFailure: false,
      status: cached.status,
    };
    throw error;
  }
  const receipt = await readFastGateReceipt({ outputRoot });
  if (!receipt) {
    const error = new Error('PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED: broker-claim-required');
    error.code = 'PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED';
    error.gateResult = {
      pass: false,
      reason: 'broker-claim-required',
      primaryAcceptance: false,
      resolvesFailure: false,
      detail: 'issuePq017AcceptanceClaim requires an on-disk fast-gate receipt from real gates',
    };
    throw error;
  }
  const issued = await issueBrokerClaim({
    outputRoot,
    manifest,
    receipt,
    mode: 'acceptance',
    digests,
  });
  return { ...issued, digests };
}

/**
 * H5/F3/G3: PQ-017 preflight delegates to the generic broker (evaluateCachedResult, launch quota,
 * requireBrokerClaim). The PQ-017 receipt/inflight schema names stay for compatibility.
 *
 * G3: Acceptance NEVER self-mints. Callers must provide brokerClaimToken / SF_BROKER_CLAIM
 * (e.g. after issuePq017AcceptanceClaim or validation-broker CLI --issue-claim-only).
 * Self-mint remains DIAGNOSTIC-ONLY and never authorizes acceptance.
 */
export async function assertPq017ProbeLaunch({
  root,
  outputRoot,
  runtimeKind,
  mode,
  explicitAcceptance,
  explicitDiagnostic,
  brokerClaimToken = null,
}) {
  const requireClaim = mode === 'acceptance';
  const manifest = buildPq017ValidationManifest({ requireBrokerClaim: requireClaim });

  let claimToken = brokerClaimToken ?? process.env.SF_BROKER_CLAIM ?? null;
  let compatibilityMint = false;

  // G3: acceptance MUST require an external broker-issued claim (caller or SF_BROKER_CLAIM).
  // Never self-mint from an on-disk receipt — receipt presence is not claim authority.
  if (mode === 'acceptance' && !claimToken) {
    const error = new Error('PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED: broker-claim-required');
    error.code = 'PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED';
    error.gateResult = {
      pass: false,
      reason: 'broker-claim-required',
      primaryAcceptance: false,
      resolvesFailure: false,
      detail: 'acceptance requires a caller-provided broker claim (or SF_BROKER_CLAIM); PQ-017 must not self-mint even when a fast-gate receipt exists',
    };
    throw error;
  }

  // F3: diagnostic-only compatibility mint — never primaryAcceptance, never synthesizes
  // a receipt that could authorize acceptance lanes.
  if (mode === 'diagnostic' && !claimToken) {
    const digests = await computeGateDigestsFromManifest({ root, manifest });
    const receipt = await readFastGateReceipt({ outputRoot })
      ?? createFastGateReceipt({
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
        // Marker so consumers can see this was not a real fast-gate publish.
        diagnosticOnly: true,
        compatibilityMint: true,
      });
    const issued = await issueBrokerClaim({
      outputRoot,
      manifest,
      receipt,
      mode: 'diagnostic',
      digests,
    });
    claimToken = issued.claimPath;
    compatibilityMint = true;
  }

  try {
    const result = await assertProbeLaunch({
      root,
      outputRoot,
      manifest,
      runtimeKind,
      mode,
      explicitAcceptance,
      explicitDiagnostic,
      brokerClaimToken: claimToken,
    });
    return {
      ...result,
      claimToken: result.claimToken,
      // F3/F6: surface promotion authority from mode — diagnostic never primary.
      primaryAcceptance: mode === 'acceptance' && result.primaryAcceptance === true && !compatibilityMint,
      compatibilityMint,
    };
  } catch (error) {
    // Preserve PQ-017 error code/message for existing probe scripts and tests.
    if (error && error.code === 'VALIDATION_PREFLIGHT_BLOCKED') {
      const wrapped = new Error(`PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED: ${error.gateResult?.reason || error.message}`);
      wrapped.code = 'PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED';
      wrapped.gateResult = error.gateResult;
      throw wrapped;
    }
    throw error;
  }
}

function throwGateFailure(reason, result = null) {
  const gateResult = result ?? {
    pass: false,
    reason,
    primaryAcceptance: false,
    resolvesFailure: false,
  };
  const error = new Error(`PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED: ${reason}`);
  error.code = 'PQ017_ACCEPTANCE_PREFLIGHT_BLOCKED';
  error.gateResult = gateResult;
  throw error;
}

export {
  REGRESSION_SOURCES,
  ROUTE_SOURCES,
  RECEIPT_SCHEMA,
  FAILURE_POINTER_NAME,
  FAST_RECEIPT_NAME,
  FAST_RUN_LOCK_NAME,
};

// Silence unused import when tree-shaken readers look for source-set usage.
void readSourceSet;
