import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function slug(value, fallback = 'unknown') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\d+(?:\.\d+)?/g, '')
    .replace(/[^a-z]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
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

function parseRouteFailureFromError(error) {
  const message = String(error ?? '');
  const jsonMatch = message.match(/:\s*(\{.*\})\s*$/s);
  let detail = null;
  try {
    detail = jsonMatch ? JSON.parse(jsonMatch[1]) : null;
  } catch {
    detail = null;
  }
  if (!detail) return null;
  const sweptSegment = detail.routeSafety?.sweptSegment ?? null;
  return {
    code: /normal flight did not settle within/i.test(message)
      ? 'point-arrival-timeout'
      : String(message).split(':', 1)[0],
    waypointPhase: detail.point?.phase ?? null,
    decision: detail.navigation?.decision ?? detail.decision ?? null,
    routeSafety: {
      reason: sweptSegment?.reason ?? detail.routeSafety?.reason ?? null,
      constraintType: sweptSegment?.closestConstraint?.type
        ?? detail.routeSafety?.constraintType
        ?? null,
    },
  };
}

function unstructuredFailureReason(error) {
  const message = String(error ?? '');
  const firstColon = message.indexOf(':');
  const reason = firstColon >= 0 ? message.slice(firstColon + 1) : message;
  return reason
    .replace(/:\s*\{.*$/s, '')
    .replace(/\b\d+(?:\.\d+)?\s*ms\b/gi, 'ms');
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
  return createHash('sha256').update(stableJson(sources)).digest('hex');
}

export function derivePq017FailureIdentity(report = {}) {
  const routeFailure = report.routeFailure
    ?? parseRouteFailureFromError(report.error)
    ?? report.failureSnapshot
    ?? {};
  const decision = routeFailure.decision ?? {};
  const routeSafetyReason = routeFailure.routeSafety?.reason;
  const unstructuredReason = report.routeFailure
    || parseRouteFailureFromError(report.error)
    ? null
    : unstructuredFailureReason(report.error);
  const structuredCode = routeFailure.code
    ?? String(report.error ?? '').split(':', 1)[0]
    ?? 'unknown';
  const identity = {
    runtimeKind: slug(report.runtimeKind),
    phase: slug(report.phase),
    code: slug(structuredCode),
    waypointPhase: slug(routeFailure.waypointPhase, 'none'),
    action: slug(decision.action, 'none'),
    reason: slug(decision.reason ?? routeSafetyReason ?? unstructuredReason, 'none'),
    routeSafetyReason: slug(routeSafetyReason, 'none'),
    constraintType: slug(routeFailure.routeSafety?.constraintType, 'none'),
    unstructuredReason: slug(unstructuredReason, 'none'),
  };
  return {
    family: [
      identity.runtimeKind,
      identity.phase,
      identity.code,
      identity.waypointPhase,
      identity.action,
      identity.reason,
    ].join('/'),
    fingerprint: createHash('sha256').update(stableJson(identity)).digest('hex'),
  };
}

export function evaluatePq017FastGate({
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
    };
  }

  if (latestFailure.regressionDigest !== currentRegressionDigest) {
    return {
      pass: true,
      reason: 'new-regression-covers-latest-failure',
      acknowledgesFailureFingerprint: latestFailure.failureFingerprint,
    };
  }

  return {
    pass: false,
    reason: 'regression-required-after-acceptance-failure',
    acknowledgesFailureFingerprint: null,
  };
}

export function createPq017FastGateReceipt({
  generatedAt = new Date().toISOString(),
  routeDigest,
  regressionDigest,
  acknowledgesFailureFingerprint = null,
} = {}) {
  return {
    schema: RECEIPT_SCHEMA,
    generatedAt,
    routeDigest,
    regressionDigest,
    acknowledgesFailureFingerprint,
  };
}

export function evaluatePq017AcceptanceGate({
  mode,
  explicitAcceptance,
  explicitDiagnostic,
  receipt,
  latestFailure = null,
  currentRouteDigest,
  currentRegressionDigest,
} = {}) {
  const diagnostic = mode === 'diagnostic';
  if (diagnostic && !explicitDiagnostic) {
    return {
      pass: false,
      reason: 'explicit-diagnostic-flag-required',
      primaryAcceptance: false,
      resolvesFailure: false,
    };
  }

  if (!diagnostic && !explicitAcceptance) {
    return {
      pass: false,
      reason: 'explicit-acceptance-flag-required',
      primaryAcceptance: false,
      resolvesFailure: false,
    };
  }

  if (!receipt || receipt.schema !== RECEIPT_SCHEMA) {
    return {
      pass: false,
      reason: 'fast-receipt-required',
      primaryAcceptance: false,
      resolvesFailure: false,
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
    };
  }

  if (diagnostic) {
    return {
      pass: true,
      reason: 'diagnostic-nonpromoting',
      primaryAcceptance: false,
      resolvesFailure: false,
    };
  }

  return {
    pass: true,
    reason: 'current-fast-receipt',
    primaryAcceptance: true,
    resolvesFailure,
  };
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

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

async function readSourceSet(root, relativePaths) {
  const entries = await Promise.all(relativePaths.map(async (relativePath) => [
    relativePath,
    await readFile(path.join(root, relativePath), 'utf8'),
  ]));
  return Object.fromEntries(entries);
}

export async function computePq017GateDigests({ root }) {
  const [routeSources, regressionSources] = await Promise.all([
    readSourceSet(root, ROUTE_SOURCES),
    readSourceSet(root, REGRESSION_SOURCES),
  ]);
  return {
    routeDigest: digestPq017Sources(routeSources),
    regressionDigest: digestPq017Sources(regressionSources),
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

export async function assertPq017ProbeLaunch({
  root,
  outputRoot,
  runtimeKind,
  mode,
  explicitAcceptance,
  explicitDiagnostic,
}) {
  if (mode === 'diagnostic' && !explicitDiagnostic) {
    throwGateFailure('explicit-diagnostic-flag-required');
  }
  if (mode === 'acceptance' && !explicitAcceptance) {
    throwGateFailure('explicit-acceptance-flag-required');
  }
  if (!['acceptance', 'diagnostic'].includes(mode)) {
    throwGateFailure('unsupported-probe-mode');
  }
  const claimed = await claimPq017FastGateReceipt({ outputRoot });
  let state;
  let result;
  try {
    state = await loadPq017GateState({ root, outputRoot });
    const resolved = isResolvedByAcceptedEvidence(state);
    result = evaluatePq017AcceptanceGate({
      mode,
      explicitAcceptance,
      explicitDiagnostic,
      receipt: claimed?.receipt ?? null,
      latestFailure: resolved ? null : state.latestFailure,
      currentRouteDigest: state.routeDigest,
      currentRegressionDigest: state.regressionDigest,
    });
    if (!result.pass) {
      throwGateFailure(result.reason, result);
    }
  } catch (error) {
    if (claimed?.claimToken) {
      await completePq017ProbeClaim({ outputRoot, claimToken: claimed.claimToken });
    }
    throw error;
  }
  await markPq017ProbeClaimInflight({
    outputRoot,
    claimToken: claimed.claimToken,
    receipt: claimed.receipt,
    runtimeKind,
    mode,
  });
  return {
    ...result,
    ...state,
    receipt: claimed.receipt,
    claimToken: claimed.claimToken,
  };
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
