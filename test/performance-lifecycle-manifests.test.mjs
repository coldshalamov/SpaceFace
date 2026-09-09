import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import browserManifest from '../scripts/validation-manifests/performance-lifecycle-browser.mjs';
import electronManifest from '../scripts/validation-manifests/performance-lifecycle-electron.mjs';
import { computeGateDigestsFromManifest } from '../scripts/lib/validationBroker.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('paired lifecycle manifests bind one source/scenario candidate to distinct runtime claims', () => {
  assert.equal(browserManifest.id, 'performance-lifecycle-browser');
  assert.equal(browserManifest.runtimeKind, 'browser');
  assert.equal(electronManifest.id, 'performance-lifecycle-electron');
  assert.equal(electronManifest.runtimeKind, 'electron');

  for (const manifest of [browserManifest, electronManifest]) {
    assert.equal(manifest.mode, 'acceptance');
    assert.equal(manifest.requireBrokerClaim, true);
    assert.equal(manifest.maxLaunchesPerCandidate, 1);
    assert.equal(manifest.fixedSeed, 35035);
    assert.equal(manifest.command, process.execPath);
    assert.equal(manifest.cleanupPolicy, 'kill-tree');
    assert.ok(manifest.commandArgs.includes('--acceptance'));
    assert.ok(manifest.commandArgs.includes(`--runtime=${manifest.runtimeKind}`));
    assert.ok(manifest.fastGateCommands.includes(
      'node --test test/performance-lifecycle-contracts.test.mjs test/performance-lifecycle-manifests.test.mjs',
    ));
    for (const source of [
      'electron/main.cjs',
      'electron/preload.cjs',
      'src/core/presentationRunner.js',
      'src/core/simulationRunner.js',
      'src/systems/input.js',
      'src/audio/audioSystem.js',
    ]) assert.ok(manifest.productionSourcePaths.includes(source), source);
    for (const source of [
      'scripts/check-performance-lifecycle.mjs',
      'scripts/lib/performanceLifecycleContracts.mjs',
      'scripts/lib/performanceLifecycleLaunchPolicy.cjs',
      'scripts/lib/performanceLifecycleProbe.mjs',
      'scripts/lib/rawCdpLifecycleBrowser.mjs',
    ]) assert.ok(manifest.harnessSourcePaths.includes(source), source);
  }

  assert.deepEqual(browserManifest.scenarioPaths, electronManifest.scenarioPaths);
  assert.deepEqual(browserManifest.regressionSourcePaths, electronManifest.regressionSourcePaths);
  assert.deepEqual(browserManifest.productionSourcePaths, electronManifest.productionSourcePaths);
  assert.deepEqual(browserManifest.harnessSourcePaths, electronManifest.harnessSourcePaths);
  assert.notEqual(path.normalize(browserManifest.artifactRoot), path.normalize(electronManifest.artifactRoot));
});

test('both lifecycle manifests resolve only through the tracked registry', async () => {
  for (const expected of [browserManifest, electronManifest]) {
    const registered = await loadValidationManifestById({ root: ROOT, id: expected.id });
    assert.equal(registered.id, expected.id);
    assert.equal(registered.runtimeKind, expected.runtimeKind);
    assert.equal(registered.__trackedManifest.mode, '100644');
  }
});

test('paired lifecycle digests share source identity but retain runtime candidate identity', async () => {
  const [browser, electron] = await Promise.all([
    computeGateDigestsFromManifest({ root: ROOT, manifest: browserManifest }),
    computeGateDigestsFromManifest({ root: ROOT, manifest: electronManifest }),
  ]);
  assert.equal(browser.sourceCandidateDigest, electron.sourceCandidateDigest);
  assert.equal(browser.worktreeDigest, electron.worktreeDigest);
  assert.equal(browser.scenarioManifestDigest, electron.scenarioManifestDigest);
  assert.notEqual(browser.candidateDigest, electron.candidateDigest);
  assert.notEqual(browser.profileDigest, electron.profileDigest);
  assert.notEqual(browser.manifestDigest, electron.manifestDigest);
});

test('direct acceptance is rejected before either headed runtime can launch', async () => {
  const source = await readFile(new URL('../scripts/lib/performanceLifecycleProbe.mjs', import.meta.url), 'utf8');
  const gate = source.indexOf('requireBrokerClaimOrDiagnostic');
  const browserLaunch = source.indexOf('await launchBrowser', gate);
  const electronLaunch = source.indexOf('await launchElectron', gate);
  assert.ok(gate >= 0 && browserLaunch > gate && electronLaunch > gate,
    'the library boundary must consume broker authority before either launcher');

  const run = spawnSync(
    process.execPath,
    ['scripts/check-performance-lifecycle.mjs', '--runtime=browser', '--acceptance'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
      env: { ...process.env, SF_BROKER_CLAIM: '' },
    },
  );
  assert.equal(run.status, 1, run.stderr || run.stdout);
  assert.match(run.stderr, /PERFORMANCE_LIFECYCLE_AUTHORITY_REJECTED: broker-claim-required/);
  assert.doesNotMatch(run.stdout + run.stderr, /canonical root|evidence=/);
});
