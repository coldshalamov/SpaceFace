import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  performanceAttributionRuntimePlan,
  runPerformanceAttributionProbe,
} from '../scripts/lib/releaseSoakProbe.mjs';
import browserManifest from '../scripts/validation-manifests/performance-closure-browser.mjs';
import {
  createValidationBroker,
  issueBrokerClaim,
  validateBrokerClaim,
} from '../scripts/lib/validationBroker.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('runtime plans share route policy while pinning distinct launcher and cleanup owners', () => {
  const browser = performanceAttributionRuntimePlan('browser');
  const electron = performanceAttributionRuntimePlan('electron');

  assert.deepEqual(browser, {
    runtimeKind: 'browser',
    canonicalRootOwner: 'visual-probe-server',
    launcher: 'system-browser',
    issueTracker: 'page',
    cleanupOwner: 'closeOwnedResources',
  });
  assert.deepEqual(electron, {
    runtimeKind: 'electron',
    canonicalRootOwner: 'isolated-electron-launcher',
    launcher: 'playwright-electron',
    issueTracker: 'electron-application',
    cleanupOwner: 'closeOwnedElectronRuntime',
  });
  assert.throws(() => performanceAttributionRuntimePlan('synthetic'), /browser or electron/);
});

test('the current attribution entry is broker-gated before either headed runtime launches', async () => {
  const [command, probe] = await Promise.all([
    readFile(new URL('../scripts/check-performance-attribution.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url), 'utf8'),
  ]);

  assert.match(command, /loadValidationManifestById/);
  assert.match(command, /runPerformanceAttributionProbe/);
  assert.match(command, /runtimeKind/);
  assert.match(probe, /requireBrokerClaimOrDiagnostic/);
  assert.match(probe, /primaryAcceptance/);
  assert.match(probe, /createCanonicalUrlTracker/);
  assert.match(probe, /createElectronCanonicalUrlTracker/);
  assert.match(probe, /closeOwnedResources/);
  assert.match(probe, /closeOwnedElectronRuntime/);
  assert.doesNotMatch(probe, /document\.runtimeKind\s*=\s*['"]browser['"]/);
  const runner = probe.indexOf('async function runPerformanceAttributionProbe');
  const runnerGate = probe.indexOf('requireBrokerClaimOrDiagnostic', runner);
  const runnerAllocation = probe.indexOf('allocateOutputDir', runner);
  assert.ok(runner >= 0 && runnerGate > runner && runnerGate < runnerAllocation,
    'the library runner itself must consume authority before allocating artifacts or launching');
});

test('direct acceptance exits before runtime launch when no broker claim is present', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-performance-attribution.mjs', '--runtime=browser', '--acceptance', '--full-matrix'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, SF_BROKER_CLAIM: '' },
      timeout: 10_000,
    },
  );
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /authority rejected: broker-claim-required/);
  assert.doesNotMatch(result.stdout + result.stderr, /canonical root|evidence:/);
});

test('the library runner rejects direct acceptance before allocating or launching', async () => {
  await assert.rejects(
    runPerformanceAttributionProbe({
      root: ROOT,
      runtimeKind: 'browser',
      manifest: browserManifest,
      mode: 'acceptance',
      brokerClaimToken: null,
    }),
    /PERFORMANCE_ATTRIBUTION_AUTHORITY_REJECTED: broker-claim-required/,
  );
});

test('contaminated preflight rejects before consuming a valid claim or allocating run artifacts', async (t) => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'spaceface-perf-preflight-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const digests = await createValidationBroker(browserManifest, { root: ROOT, outputRoot }).computeGateDigests();
  const issued = await issueBrokerClaim({ outputRoot, manifest: browserManifest, digests });

  await assert.rejects(
    runPerformanceAttributionProbe({
      root: ROOT,
      runtimeKind: 'browser',
      manifest: browserManifest,
      mode: 'acceptance',
      brokerClaimToken: issued.claimPath,
      outputRoot,
      activityInspector: async () => ({
        capturedAt: new Date().toISOString(),
        active: true,
        contaminatingProcesses: { available: true, names: ['blender.exe'], entries: [{ name: 'blender.exe', pid: 47 }] },
      }),
    }),
    /PERFORMANCE_ATTRIBUTION_ENVIRONMENT_BLOCKED/,
  );

  const entries = await readdir(outputRoot);
  assert.equal(entries.some((entry) => entry.startsWith('performance-attribution-')), false);

  const stillValid = await validateBrokerClaim({
    outputRoot,
    manifest: browserManifest,
    tokenOrPath: issued.claimPath,
    root: ROOT,
  });
  assert.equal(stillValid.ok, true, stillValid.reason);
});
