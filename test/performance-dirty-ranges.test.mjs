import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DYNAMIC_BUFFER_FULL_SPAN_VARIANT,
  applyDiagnosticVariantToState,
  restoreDiagnosticVariantToState,
  snapshotDiagnosticSettings,
} from '../scripts/lib/releaseSoakProbe.mjs';
import {
  PERFORMANCE_DIRTY_RANGE_ACCEPTANCE_SCHEMA,
  evaluateDirtyRangeComparison,
} from '../scripts/lib/performanceDirtyRangeAcceptance.mjs';
import browserManifest from '../scripts/validation-manifests/performance-dirty-ranges-browser.mjs';
import electronManifest from '../scripts/validation-manifests/performance-dirty-ranges-electron.mjs';
import { computeGateDigestsFromManifest } from '../scripts/lib/validationBroker.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function windowFixture(variantId, {
  logicalBytes = 12_000,
  requestedBytes,
  driverBytes,
  frameP95 = 16.8,
} = {}) {
  return {
    routeTag: 'combat_vfx_burst',
    diagnosticVariant: variantId,
    restoration: { restored: true },
    settings: {
      start: { video: { bloom: true, particleQuality: 'high', renderScale: 1 }, dynResScale: 1, timeScale: 1 },
      end: { video: { bloom: true, particleQuality: 'high', renderScale: 1 }, dynResScale: 1, timeScale: 1 },
    },
    frameMs: { p50: 16.7, p95: frameP95, p99: 17.2, max: 18, sampleCount: 300 },
    dynamicBuffers: {
      available: true,
      probeForceFullUploads: variantId === DYNAMIC_BUFFER_FULL_SPAN_VARIANT,
      delta: {
        logicalBytesChanged: logicalBytes,
        requestedUploadBytes: requestedBytes,
        uploadRangeCount: 900,
        probeFullUploads: variantId === DYNAMIC_BUFFER_FULL_SPAN_VARIANT ? 900 : 0,
      },
    },
    tier1: {
      enabled: true,
      postBootFrames: 300,
      postBoot: {
        bufferUploadBytes: driverBytes,
        bufferPartialUploads: 900,
        shaderLinks: 0,
        shaderCompiles: 0,
        textureUploads: 0,
        renderTargetAllocations: 0,
      },
      nondeterministic: {
        allocation: { heapBytesDeltaTotal: 100_000, collectionsDetected: 0, samples: 20 },
      },
    },
  };
}

test('probe full-span diagnostic variant is explicit and restores the shipped ranged default', () => {
  let forceFull = false;
  const dynamicBuffers = {
    get probeForceFullUploads() { return forceFull; },
    setProbeForceFullUploads(on) { forceFull = !!on; return forceFull; },
  };
  const state = {
    timeScale: 1,
    settings: { video: { bloom: true } },
    render: { spaceBg: { group: { visible: true } }, dynamicBufferRanges: dynamicBuffers },
  };
  const snapshot = snapshotDiagnosticSettings(state);
  const applied = applyDiagnosticVariantToState(state, snapshot, DYNAMIC_BUFFER_FULL_SPAN_VARIANT);
  assert.equal(applied.applied, true);
  assert.equal(forceFull, true);
  const restored = restoreDiagnosticVariantToState(state, snapshot);
  assert.equal(restored.restored, true);
  assert.equal(forceFull, false);
});

test('dirty-range comparator requires causal owner and driver byte reduction at unchanged quality', () => {
  const document = {
    windows: [
      windowFixture('baseline', { requestedBytes: 600_000, driverBytes: 720_000 }),
      windowFixture(DYNAMIC_BUFFER_FULL_SPAN_VARIANT, { requestedBytes: 12_000_000, driverBytes: 12_200_000 }),
    ],
  };
  const result = evaluateDirtyRangeComparison(document, { runtimeKind: 'browser' });
  assert.equal(result.schema, PERFORMANCE_DIRTY_RANGE_ACCEPTANCE_SCHEMA);
  assert.equal(result.pass, true);
  assert.ok(result.metrics.ownerRequestedByteReductionFraction > 0.9);
  assert.ok(result.metrics.driverUploadByteReductionFraction > 0.9);
  assert.deepEqual(result.failures, []);

  const differentFrameVolume = {
    windows: [
      windowFixture('baseline', {
        logicalBytes: 3_637_604,
        requestedBytes: 3_711_372,
        driverBytes: 21_560_044,
      }),
      windowFixture(DYNAMIC_BUFFER_FULL_SPAN_VARIANT, {
        logicalBytes: 4_418_200,
        requestedBytes: 39_682_528,
        driverBytes: 65_656_176,
      }),
    ],
  };
  const normalized = evaluateDirtyRangeComparison(differentFrameVolume, { runtimeKind: 'browser' });
  assert.equal(normalized.pass, true,
    'fixed-duration windows compare upload amplification per logical byte, not unequal frame totals');
  assert.ok(normalized.metrics.logicalByteDriftFraction > 0.1,
    'raw logical drift remains visible as a diagnostic rather than an invalid equality gate');

  const noDriverGain = {
    ...document,
    windows: [document.windows[0], windowFixture(DYNAMIC_BUFFER_FULL_SPAN_VARIANT, {
      requestedBytes: 12_000_000,
      driverBytes: 700_000,
    })],
  };
  assert.match(
    evaluateDirtyRangeComparison(noDriverGain, { runtimeKind: 'browser' }).failures.join(' '),
    /driver upload bytes/i,
  );
});

test('paired dirty-range manifests bind one scenario and source candidate to distinct runtimes', async () => {
  for (const manifest of [browserManifest, electronManifest]) {
    assert.equal(manifest.mode, 'acceptance');
    assert.equal(manifest.requireBrokerClaim, true);
    assert.equal(manifest.maxLaunchesPerCandidate, 1);
    assert.equal(manifest.fixedSeed, 47);
    assert.equal(manifest.command, process.execPath);
    assert.equal(manifest.cleanupPolicy, 'kill-tree');
    assert.ok(manifest.commandArgs.includes(`--runtime=${manifest.runtimeKind}`));
    assert.ok(manifest.commandArgs.includes('--acceptance'));
    assert.ok(manifest.scenarioPaths.includes('scripts/lib/performanceScenarioDriver.mjs'));
  }
  assert.equal(browserManifest.runtimeKind, 'browser');
  assert.equal(electronManifest.runtimeKind, 'electron');
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
  assert.notEqual(browser.manifestDigest, electron.manifestDigest);
});
