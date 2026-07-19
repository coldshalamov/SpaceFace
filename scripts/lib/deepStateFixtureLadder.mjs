import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fnv1a } from '../../src/save/checksum.js';
import { CURRENT_VERSION } from '../../src/data/saveVersion.js';

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
    // Version must be a REAL save version: 1 .. the current shipped version. Accepting an
    // arbitrary integer (a round-3 review proved 1e308 passed) lets a fabricated envelope
    // masquerade as a capture.
    if (!Number.isInteger(envelope?.version) || envelope.version < 1 || envelope.version > CURRENT_VERSION) {
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
    } else if (envelope?.data && typeof envelope.data === 'object'
      && envelope.checksum !== fnv1a(JSON.stringify(envelope.data))) {
      // The game's own internal integrity mark: checksum = fnv1a over the stringified data
      // payload (saveSystem.serialize). An outer SHA-256 alone only proves the FILE is intact;
      // this proves the ENVELOPE is a genuine, uncorrupted save the game would accept.
      issues.push({ code: 'artifact-checksum-mismatch', path: `${fixturePath}.artifact` });
    }

    // Commit binding: the capturing commit must be a real object in this repository. A
    // fabricated or garbage-collected commit id breaks the capture's identity chain.
    if (typeof fixture.capture?.commit === 'string' && /^[0-9a-f]{40}$/.test(fixture.capture.commit)) {
      try {
        // The commit lives in THIS repository's object store regardless of where the artifact
        // root points (tests validate artifacts from a temp root; the identity chain does not
        // move with them).
        execFileSync('git', ['cat-file', '-e', fixture.capture.commit], { cwd: REPO_ROOT, stdio: 'ignore' });
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          // git itself unavailable (packaged/CI-less environment): identity stays receipt-bound.
        } else {
          issues.push({ code: 'capture-commit-unknown', path: `${fixturePath}.capture.commit` });
        }
      }
    }

    const receiptPath = containedPath(root, fixture.capture?.publicRouteReceipt);
    if (!receiptPath) {
      issues.push({ code: 'receipt-outside-root', path: `${fixturePath}.capture.publicRouteReceipt` });
    } else {
      const receipt = await readJson(receiptPath);
      if (!receipt) {
        issues.push({ code: 'receipt-missing', path: `${fixturePath}.capture.publicRouteReceipt` });
      } else {
        if (receipt.fixtureId !== fixture.id) {
          issues.push({ code: 'receipt-fixture-mismatch', path: `${fixturePath}.capture.publicRouteReceipt` });
        }
        if (receipt.artifactSha256 !== fixture.sha256) {
          issues.push({ code: 'receipt-digest-mismatch', path: `${fixturePath}.capture.publicRouteReceipt` });
        }
        if (receipt.injectedState !== false) {
          issues.push({ code: 'receipt-injected-state', path: `${fixturePath}.capture.publicRouteReceipt` });
        }
        if (!isNonEmptyStringArray(receipt.milestones)) {
          issues.push({ code: 'receipt-missing-milestones', path: `${fixturePath}.capture.publicRouteReceipt` });
        }
      }
    }

    // Restore evidence is REQUIRED for a captured fixture: a save nobody has proven restorable
    // is not a fixture, it is a file. (Round-3 review: absent/failed restore evidence was green.)
    const restorePath = containedPath(root, fixture.capture?.restoreReceipt);
    if (!restorePath) {
      issues.push({ code: 'restore-receipt-missing', path: `${fixturePath}.capture.restoreReceipt` });
    } else {
      const restore = await readJson(restorePath);
      if (!restore) {
        issues.push({ code: 'restore-receipt-missing', path: `${fixturePath}.capture.restoreReceipt` });
      } else {
        if (restore.fixtureId !== fixture.id) {
          issues.push({ code: 'restore-fixture-mismatch', path: `${fixturePath}.capture.restoreReceipt` });
        }
        if (restore.claimsOk !== true) {
          issues.push({ code: 'restore-claims-failed', path: `${fixturePath}.capture.restoreReceipt` });
        }
        if (!Array.isArray(restore.steps) || restore.steps.length === 0
          || !restore.steps.every((s) => s && s.ok === true)) {
          issues.push({ code: 'restore-steps-failed', path: `${fixturePath}.capture.restoreReceipt` });
        }
      }
    }
  }
  return issues;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
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
