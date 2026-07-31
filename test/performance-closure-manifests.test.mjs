import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import browserManifest from '../scripts/validation-manifests/performance-closure-browser.mjs';
import electronManifest from '../scripts/validation-manifests/performance-closure-electron.mjs';
import { computeGateDigestsFromManifest } from '../scripts/lib/validationBroker.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('paired PERF-00 manifests pin distinct runtime authority over one source and scenario set', () => {
  assert.equal(browserManifest.id, 'performance-closure-browser');
  assert.equal(browserManifest.runtimeKind, 'browser');
  assert.equal(electronManifest.id, 'performance-closure-electron');
  assert.equal(electronManifest.runtimeKind, 'electron');

  for (const manifest of [browserManifest, electronManifest]) {
    assert.equal(manifest.mode, 'acceptance');
    assert.equal(manifest.requireBrokerClaim, true);
    assert.equal(manifest.maxLaunchesPerCandidate, 1);
    assert.equal(manifest.fixedSeed, 47);
    assert.equal(manifest.command, process.execPath);
    assert.equal(manifest.cleanupPolicy, 'kill-tree');
    assert.ok(manifest.commandArgs.includes('--acceptance'));
    assert.ok(manifest.commandArgs.includes('--full-matrix'));
    assert.ok(manifest.commandArgs.includes(`--runtime=${manifest.runtimeKind}`));
    assert.ok(manifest.fastGateCommands.includes(
      'node --test test/performance-closure-manifests.test.mjs test/performance-attribution-runtime-matrix.test.mjs',
    ));
  }

  assert.deepEqual(browserManifest.scenarioPaths, electronManifest.scenarioPaths);
  assert.deepEqual(browserManifest.regressionSourcePaths, electronManifest.regressionSourcePaths);
  assert.deepEqual(browserManifest.productionSourcePaths, electronManifest.productionSourcePaths);
  assert.deepEqual(browserManifest.harnessSourcePaths, electronManifest.harnessSourcePaths);
  assert.notEqual(path.normalize(browserManifest.artifactRoot), path.normalize(electronManifest.artifactRoot));
});

test('both paired manifests resolve through the tracked registry', async () => {
  for (const expected of [browserManifest, electronManifest]) {
    const registered = await loadValidationManifestById({ root: ROOT, id: expected.id });
    assert.equal(registered.id, expected.id);
    assert.equal(registered.runtimeKind, expected.runtimeKind);
    assert.equal(registered.__trackedManifest.mode, '100644');
  }
});

test('paired PERF-00 claims share only source identity, not runtime candidate identity', async () => {
  const [browser, electron] = await Promise.all([
    computeGateDigestsFromManifest({ root: ROOT, manifest: browserManifest }),
    computeGateDigestsFromManifest({ root: ROOT, manifest: electronManifest }),
  ]);

  for (const digests of [browser, electron]) {
    for (const key of [
      'sourceCandidateDigest',
      'worktreeDigest',
      'buildDigest',
      'scenarioManifestDigest',
      'saveDigest',
      'inputTapeDigest',
      'cameraManifestDigest',
      'candidateDigest',
    ]) assert.match(digests[key], /^[a-f0-9]{64}$/i, key);
  }

  assert.equal(browser.sourceCandidateDigest, electron.sourceCandidateDigest);
  assert.equal(browser.worktreeDigest, electron.worktreeDigest);
  assert.equal(browser.scenarioManifestDigest, electron.scenarioManifestDigest);
  assert.equal(browser.saveDigest, electron.saveDigest);
  assert.equal(browser.inputTapeDigest, electron.inputTapeDigest);
  assert.equal(browser.cameraManifestDigest, electron.cameraManifestDigest);
  assert.notEqual(browser.candidateDigest, electron.candidateDigest);
  assert.notEqual(browser.profileDigest, electron.profileDigest);
  assert.notEqual(browser.manifestDigest, electron.manifestDigest);
});
