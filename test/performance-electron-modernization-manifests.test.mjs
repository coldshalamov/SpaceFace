import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluateElectronModernizationPair,
} from '../scripts/lib/performanceElectronModernizationAcceptance.mjs';
import { computeGateDigestsFromManifest } from '../scripts/lib/validationBroker.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';
import browserManifest from '../scripts/validation-manifests/performance-electron-modernization-browser.mjs';
import electronManifest from '../scripts/validation-manifests/performance-electron-modernization-electron.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIGEST = (character) => character.repeat(64);

test('paired Electron-modernization manifests bind one public route to distinct runtime claims', async () => {
  for (const manifest of [browserManifest, electronManifest]) {
    assert.equal(manifest.mode, 'acceptance');
    assert.equal(manifest.requireBrokerClaim, true);
    assert.equal(manifest.maxLaunchesPerCandidate, 1);
    assert.equal(manifest.fixedSeed, 47);
    assert.equal(manifest.command, process.execPath);
    assert.equal(manifest.cleanupPolicy, 'kill-tree');
    assert.ok(manifest.commandArgs.includes('--cycles=1'));
    assert.ok(manifest.commandArgs.includes(`--task-id=release-soak-${manifest.runtimeKind}`));
    assert.ok(manifest.commandArgs.includes(`--output-root=${manifest.artifactRoot.replaceAll('\\', '/')}`));
  }
  assert.equal(browserManifest.runtimeKind, 'browser');
  assert.equal(electronManifest.runtimeKind, 'electron');
  assert.equal(browserManifest.packagedStartupRequired, false);
  assert.equal(electronManifest.packagedStartupRequired, true);
  assert.deepEqual(browserManifest.scenarioPaths, electronManifest.scenarioPaths);
  assert.deepEqual(browserManifest.regressionSourcePaths, electronManifest.regressionSourcePaths);
  assert.deepEqual(browserManifest.productionSourcePaths, electronManifest.productionSourcePaths);
  assert.deepEqual(browserManifest.harnessSourcePaths, electronManifest.harnessSourcePaths);
  assert.notEqual(path.normalize(browserManifest.artifactRoot), path.normalize(electronManifest.artifactRoot));

  for (const id of [browserManifest.id, electronManifest.id]) {
    const registered = await loadValidationManifestById({ root: ROOT, id });
    assert.equal(registered.id, id);
  }
  const [browser, electron] = await Promise.all([
    computeGateDigestsFromManifest({ root: ROOT, manifest: browserManifest }),
    computeGateDigestsFromManifest({ root: ROOT, manifest: electronManifest }),
  ]);
  assert.equal(browser.sourceCandidateDigest, electron.sourceCandidateDigest);
  assert.equal(browser.worktreeDigest, electron.worktreeDigest);
  assert.notEqual(browser.candidateDigest, electron.candidateDigest);
});

test('pair comparator requires consumed claims and the packaged subreceipt without requiring a speedup', () => {
  const sourceCandidateDigest = DIGEST('a');
  const browserCandidateDigest = DIGEST('b');
  const electronCandidateDigest = DIGEST('c');
  const worktreeDigest = DIGEST('d');
  const browser = evidenceFixture({
    runtimeKind: 'browser',
    claimId: 'claim-browser',
    sourceCandidateDigest,
    candidateDigest: browserCandidateDigest,
    worktreeDigest,
    p95: 16.8,
  });
  const electron = evidenceFixture({
    runtimeKind: 'electron',
    claimId: 'claim-electron',
    sourceCandidateDigest,
    candidateDigest: electronCandidateDigest,
    worktreeDigest,
    p95: 18.4,
    packagedStartup: {
      schema: 'spaceface.electronPackagedStartupSubreceipt.v1',
      pass: true,
      claimId: 'claim-electron',
      report: { path: '.devshots/report.json', bytes: 123, sha256: DIGEST('e') },
      packageIdentity: {
        executable: { sha256: DIGEST('f') },
        appArchive: { sha256: DIGEST('1') },
      },
    },
  });
  const browserLedger = ledgerFixture('claim-browser', 'browser', browserCandidateDigest);
  const electronLedger = ledgerFixture('claim-electron', 'electron', electronCandidateDigest);

  const result = evaluateElectronModernizationPair({
    browserEvidence: browser,
    electronEvidence: electron,
    browserLedger,
    electronLedger,
    currentFingerprint: { id: 'head', digest: worktreeDigest },
  });
  assert.equal(result.pass, true, result.failures.join('; '));
  assert.equal(result.performance.disposition, 'neutral-reporting');
  assert.equal(result.performance.electronMinusBrowserP95Ms, 1.6);

  const missingPackage = structuredClone(electron);
  delete missingPackage.packagedStartup;
  const rejected = evaluateElectronModernizationPair({
    browserEvidence: browser,
    electronEvidence: missingPackage,
    browserLedger,
    electronLedger,
    currentFingerprint: { id: 'head', digest: worktreeDigest },
  });
  assert.equal(rejected.pass, false);
  assert.match(rejected.failures.join('\n'), /packaged-startup subreceipt/i);
});

test('release-soak producer consumes authority before any runtime and publishes only after validation', async () => {
  const probe = await readFile(path.join(ROOT, 'scripts', 'lib', 'releaseSoakProbe.mjs'), 'utf8');
  const cli = await readFile(path.join(ROOT, 'scripts', 'lib', 'releaseSoakCli.mjs'), 'utf8');
  const authority = probe.indexOf('const authority = await authorizeReleaseSoak({');
  const browserLaunch = probe.indexOf('await launchBrowser(viewport)');
  const electronLaunch = probe.indexOf('await launchElectron(root');
  const packagedLaunch = probe.indexOf('packagedStartup = await runPackagedStartupSubroute({');
  assert.ok(authority >= 0 && authority < browserLaunch && authority < electronLaunch && authority < packagedLaunch);
  assert.match(probe, /requireBrokerClaimOrDiagnostic\([\s\S]*consume:\s*true/);
  assert.match(probe, /diagnostic evidence is non-promoting/);
  assert.doesNotMatch(probe, /publishReleaseSoakAuthorityEvidence/);
  const producerValidation = cli.indexOf('const uniqueFailures = [...new Set(failures)]');
  const producerReceipt = cli.indexOf('await publishProducerReceiptAtomically({ root: repoRoot, outputDir, receipt });');
  const acceptedPublication = cli.indexOf('await publishAcceptedEvidence({');
  assert.ok(producerValidation >= 0 && producerValidation < producerReceipt
      && producerReceipt < acceptedPublication,
  'canonical evidence must publish only after producer validation and its receipt pass');
});

function evidenceFixture({
  runtimeKind,
  claimId,
  sourceCandidateDigest,
  candidateDigest,
  worktreeDigest,
  p95,
  packagedStartup = null,
}) {
  const manifestId = `performance-electron-modernization-${runtimeKind}`;
  const ledgerSha256 = runtimeKind === 'browser' ? DIGEST('2') : DIGEST('3');
  return {
    schema: 'spaceface.releaseSoak.v1',
    pass: true,
    primaryAcceptance: true,
    runtimeKind,
    manifestId,
    claimId,
    sourceCandidateDigest,
    candidateDigest,
    digests: { sourceCandidateDigest, candidateDigest },
    worktreeId: 'head',
    worktreeDigest,
    performance: { frameMs: { p95 } },
    quality: {
      settingsPass: true,
      startSettings: { video: { renderScale: 1, bloom: true, particleQuality: 'high' } },
      endSettings: { video: { renderScale: 1, bloom: true, particleQuality: 'high' } },
    },
    consumedClaim: {
      claimId,
      path: `.devshots/${runtimeKind}/broker-claims/.consumed/${claimId}.json`,
      sha256: ledgerSha256,
    },
    packagedStartup,
  };
}

function ledgerFixture(claimId, runtimeKind, candidateDigest) {
  return {
    entry: {
      schema: 'spaceface.validation-broker-claim-consumed.v1',
      claimId,
      runtimeKind,
      mode: 'acceptance',
      candidateDigest,
      digests: { candidateDigest },
    },
    path: `.devshots/${runtimeKind}/broker-claims/.consumed/${claimId}.json`,
    sha256: runtimeKind === 'browser' ? DIGEST('2') : DIGEST('3'),
  };
}
