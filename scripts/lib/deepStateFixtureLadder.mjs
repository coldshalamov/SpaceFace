import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const DEFAULT_DEEP_STATE_MANIFEST = new URL(
  '../../test/fixtures/deep-state-ladder/manifest.json',
  import.meta.url,
);

export async function loadDeepStateFixtureLadder(path = DEFAULT_DEEP_STATE_MANIFEST) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  const issues = [
    ...validateDeepStateFixtureLadder(manifest),
    ...await validateDeepStateFixtureArtifacts(manifest),
  ];
  if (issues.length > 0) {
    const error = new Error(`Invalid deep-state fixture ladder (${issues.length} issue(s))`);
    error.issues = issues;
    throw error;
  }
  return manifest;
}

export function validateDeepStateFixtureLadder(manifest) {
  const issues = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return [{ code: 'manifest-not-object', path: '$' }];
  }
  if (manifest.schemaVersion !== 1) {
    issues.push({ code: 'unsupported-schema', path: 'schemaVersion' });
  }
  if (manifest.artifactFormat !== 'spaceface-save') {
    issues.push({ code: 'invalid-artifact-format', path: 'artifactFormat' });
  }
  if (!Array.isArray(manifest.fixtures)) {
    issues.push({ code: 'fixtures-not-array', path: 'fixtures' });
    return issues;
  }

  const allIds = new Set(manifest.fixtures.map((fixture) => fixture?.id).filter(Boolean));
  const seen = new Set();
  for (const [index, fixture] of manifest.fixtures.entries()) {
    const path = `fixtures[${index}]`;
    if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
      issues.push({ code: 'fixture-not-object', path });
      continue;
    }
    if (typeof fixture.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fixture.id)) {
      issues.push({ code: 'invalid-id', path: `${path}.id` });
    } else if (seen.has(fixture.id)) {
      issues.push({ code: 'duplicate-id', path: `${path}.id`, id: fixture.id });
    }
    if (fixture.ordinal !== index + 1) {
      issues.push({ code: 'noncontiguous-ordinal', path: `${path}.ordinal` });
    }
    if (!['planned', 'captured', 'verified'].includes(fixture.status)) {
      issues.push({ code: 'invalid-status', path: `${path}.status` });
    }
    if (!Array.isArray(fixture.dependsOn)) {
      issues.push({ code: 'dependencies-not-array', path: `${path}.dependsOn` });
    } else {
      for (const dependency of fixture.dependsOn) {
        if (!allIds.has(dependency)) {
          issues.push({ code: 'unknown-dependency', path: `${path}.dependsOn`, dependency });
        } else if (!seen.has(dependency)) {
          issues.push({ code: 'dependency-not-earlier', path: `${path}.dependsOn`, dependency });
        }
      }
    }
    if (!isNonEmptyStringArray(fixture.publicRoute)) {
      issues.push({ code: 'public-route-empty', path: `${path}.publicRoute` });
    }
    if (!isNonEmptyStringArray(fixture.requiredClaims)) {
      issues.push({ code: 'required-claims-empty', path: `${path}.requiredClaims` });
    }
    if (fixture.status === 'planned' && fixture.artifact !== null) {
      issues.push({ code: 'planned-has-artifact', path: `${path}.artifact` });
    }
    if (['captured', 'verified'].includes(fixture.status)
      && (typeof fixture.artifact !== 'string' || fixture.artifact.length === 0)) {
      issues.push({ code: 'captured-missing-artifact', path: `${path}.artifact` });
    }
    if (['captured', 'verified'].includes(fixture.status)
      && !/^[a-f0-9]{64}$/.test(fixture.sha256 || '')) {
      issues.push({ code: 'captured-missing-digest', path: `${path}.sha256` });
    }
    if (['captured', 'verified'].includes(fixture.status)
      && (!fixture.capture
        || !/^[a-f0-9]{40}$/.test(fixture.capture.commit || '')
        || typeof fixture.capture.publicRouteReceipt !== 'string'
        || fixture.capture.publicRouteReceipt.length === 0)) {
      issues.push({ code: 'captured-missing-receipt', path: `${path}.capture` });
    }
    if (fixture.status === 'verified'
      && (!fixture.verification
        || !/^[a-f0-9]{40}$/.test(fixture.verification.commit || '')
        || fixture.verification.result !== 'pass'
        || !isNonEmptyStringArray(fixture.verification.commands))) {
      issues.push({ code: 'verified-missing-evidence', path: `${path}.verification` });
    }
    if (fixture.id) seen.add(fixture.id);
  }
  return issues;
}

export async function validateDeepStateFixtureArtifacts(manifest, { root = REPO_ROOT } = {}) {
  if (!manifest || !Array.isArray(manifest.fixtures)) return [];
  const issues = [];
  for (const [index, fixture] of manifest.fixtures.entries()) {
    if (!['captured', 'verified'].includes(fixture?.status)) continue;
    const fixturePath = `fixtures[${index}]`;
    const artifactPath = containedPath(root, fixture.artifact);
    if (!artifactPath) {
      issues.push({ code: 'artifact-outside-root', path: `${fixturePath}.artifact` });
      continue;
    }
    let bytes;
    try {
      bytes = await readFile(artifactPath);
    } catch (error) {
      issues.push({ code: 'artifact-missing', path: `${fixturePath}.artifact`, detail: error.code || 'read-error' });
      continue;
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== fixture.sha256) {
      issues.push({ code: 'artifact-digest-mismatch', path: `${fixturePath}.sha256` });
    }
    let envelope;
    try {
      envelope = JSON.parse(bytes.toString('utf8'));
    } catch {
      issues.push({ code: 'artifact-invalid-json', path: `${fixturePath}.artifact` });
      continue;
    }
    if (envelope?.fmt !== manifest.artifactFormat) {
      issues.push({ code: 'artifact-bad-format', path: `${fixturePath}.artifact` });
    }
    if (!Number.isInteger(envelope?.version) || envelope.version < 1) {
      issues.push({ code: 'artifact-bad-version', path: `${fixturePath}.artifact` });
    }
    if (!envelope?.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
      issues.push({ code: 'artifact-missing-data', path: `${fixturePath}.artifact` });
    }
    if (!envelope?.data?.entities?.player || typeof envelope.data.entities.player !== 'object') {
      issues.push({ code: 'artifact-missing-player', path: `${fixturePath}.artifact` });
    }
    if (typeof envelope?.checksum !== 'string' || envelope.checksum.length === 0) {
      issues.push({ code: 'artifact-missing-checksum', path: `${fixturePath}.artifact` });
    }

    const receiptPath = containedPath(root, fixture.capture?.publicRouteReceipt);
    if (!receiptPath) {
      issues.push({ code: 'receipt-outside-root', path: `${fixturePath}.capture.publicRouteReceipt` });
    } else {
      try {
        await readFile(receiptPath);
      } catch (error) {
        issues.push({ code: 'receipt-missing', path: `${fixturePath}.capture.publicRouteReceipt`, detail: error.code || 'read-error' });
      }
    }
  }
  return issues;
}

function containedPath(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    return null;
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
    ? resolved
    : null;
}

function isNonEmptyStringArray(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0);
}
