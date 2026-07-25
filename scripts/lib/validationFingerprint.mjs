// Generic validation digests + normalized failure identity for the lab validation broker.
// Extracted from PQ-017 iteration guard (Phase 1). Pure / filesystem-read only.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function slug(value, fallback = 'unknown') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\d+(?:\.\d+)?/g, '')
    .replace(/[^a-z]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

export function sha256Hex(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

/** SHA-256 over stableJson of a relativePath → exact-byte descriptor map. */
export function computeSourceSetDigest(sources = {}) {
  return createHash('sha256').update(stableJson(sources)).digest('hex');
}

export async function readSourceSet(root, relativePaths = []) {
  const entries = await Promise.all(relativePaths.map(async (relativePath) => {
    const bytes = await readFile(path.join(root, relativePath));
    return [
      relativePath,
      {
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    ];
  }));
  return Object.fromEntries(entries);
}

export async function digestSourcePaths(root, relativePaths = []) {
  if (!relativePaths.length) return computeSourceSetDigest({});
  const sources = await readSourceSet(root, relativePaths);
  return computeSourceSetDigest(sources);
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

/**
 * Stable failure identity: slugged causal fields → family path + sha256 fingerprint.
 * Compatible with PQ-017 derivePq017FailureIdentity.
 */
export function deriveFailureIdentity(report = {}) {
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

export function computeCandidateDigest({
  candidateId = null,
  buildId = null,
  gitCommit = null,
  productionDigest = null,
  harnessDigest = null,
  scenarioDigest = null,
  inputDigest = null,
  profileDigest = null,
  manifestDigest = null,
} = {}) {
  return computeSourceSetDigest({
    candidateId,
    buildId,
    gitCommit,
    productionDigest,
    harnessDigest,
    scenarioDigest,
    inputDigest,
    profileDigest,
    manifestDigest,
  });
}

export function computeManifestDigest(manifest = {}) {
  const normalized = {
    id: manifest.id ?? null,
    runtimeKind: manifest.runtimeKind ?? null,
    command: manifest.command ?? null,
    commandArgs: manifest.commandArgs ?? [],
    mode: manifest.mode ?? null,
    fastGateCommands: manifest.fastGateCommands ?? [],
    scenarioPaths: manifest.scenarioPaths ?? [],
    regressionSourcePaths: manifest.regressionSourcePaths ?? [],
    productionSourcePaths: manifest.productionSourcePaths ?? [],
    harnessSourcePaths: manifest.harnessSourcePaths ?? [],
    runtimeProfile: manifest.runtimeProfile ?? null,
    timeoutMs: manifest.timeoutMs ?? null,
    fastGateTimeoutMs: manifest.fastGateTimeoutMs ?? null,
    maxLaunchesPerCandidate: manifest.maxLaunchesPerCandidate ?? null,
    artifactRoot: manifest.artifactRoot ?? null,
    fixedSeed: manifest.fixedSeed ?? null,
    receiptSchema: manifest.receiptSchema ?? null,
    bindGitRevision: manifest.bindGitRevision === true,
    authorizedBaseCommit: manifest.authorizedBaseCommit ?? null,
  };
  return computeSourceSetDigest(normalized);
}

export { parseRouteFailureFromError, unstructuredFailureReason };
