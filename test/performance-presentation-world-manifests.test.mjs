import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import browserManifest from '../scripts/validation-manifests/performance-presentation-world-browser.mjs';
import electronManifest from '../scripts/validation-manifests/performance-presentation-world-electron.mjs';

test('paired manifests are one-launch, candidate-bound, default-quality source runtimes', () => {
  for (const manifest of [browserManifest, electronManifest]) {
    assert.equal(manifest.mode, 'acceptance');
    assert.equal(manifest.requireBrokerClaim, true);
    assert.equal(manifest.requireFastReceipt, true);
    assert.equal(manifest.maxLaunchesPerCandidate, 1);
    assert.equal(manifest.fixedSeed, 47);
    assert.equal(manifest.command, process.execPath);
    assert.equal(manifest.cleanupPolicy, 'kill-tree');
    assert.equal(manifest.runtimeProfile, 'default-presentation-world-scale-source-runtime');
    assert.ok(manifest.commandArgs.includes(`--runtime=${manifest.runtimeKind}`));
    assert.ok(manifest.commandArgs.includes('--acceptance'));
    assert.equal(manifest.sourceIdentity.electronRoute, 'source-native-electron');
    assert.equal(manifest.sourceIdentity.packagedElectronClaim, false);
    assert.ok(manifest.productionSourcePaths.includes('src/render/presentationWorld.js'));
    assert.ok(manifest.productionSourcePaths.includes('src/render/renderer.js'));
    assert.ok(manifest.scenarioPaths.includes('scripts/lib/performanceScenarioDriver.mjs'));
    assert.ok(manifest.harnessSourcePaths.includes('scripts/lib/performancePresentationWorldAcceptance.mjs'));
    assert.equal(manifest.productionSourcePaths.some((entry) => /dist|package|electron\/main/i.test(entry)), false);
  }
  assert.equal(browserManifest.runtimeKind, 'browser');
  assert.equal(electronManifest.runtimeKind, 'electron');
  assert.deepEqual(browserManifest.scenarioPaths, electronManifest.scenarioPaths);
  assert.deepEqual(browserManifest.regressionSourcePaths, electronManifest.regressionSourcePaths);
  assert.deepEqual(browserManifest.productionSourcePaths, electronManifest.productionSourcePaths);
  assert.deepEqual(browserManifest.harnessSourcePaths, electronManifest.harnessSourcePaths);
  assert.notEqual(path.normalize(browserManifest.artifactRoot), path.normalize(electronManifest.artifactRoot));
});

test('specialized validation runs before authority publication and partial scope exits nonzero', async () => {
  const probe = await readFile(new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url), 'utf8');
  const checker = await readFile(new URL('../scripts/check-performance-presentation-world.mjs', import.meta.url), 'utf8');
  const specialized = probe.indexOf('await additionalDocumentValidator(document)');
  const publication = probe.indexOf('await publishPerformanceAttributionAuthorityEvidence({');
  assert.ok(specialized >= 0 && publication > specialized,
    'specialized packet validation must prevent accepted publication before terminal scope passes');
  assert.match(checker, /comparison\.status === 'partial'[\s\S]*process\.exitCode = 2/);
  assert.match(checker, /\['pending', 'partial'\]\.includes\(result\.status\)[\s\S]*\? 2 : 1/);
  assert.match(checker, /additionalDocumentValidator:[\s\S]*evaluatePresentationWorldRuntime/);
});
