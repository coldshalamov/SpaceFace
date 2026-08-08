import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import {
  DYNAMIC_BUFFER_FULL_SPAN_VARIANT,
  applyDiagnosticVariantToState,
  assertTier1CountersBooted,
  awaitElectronInitialCanonicalLoad,
  cleanupIsolatedElectronProfile,
  installTier1CountersInitScript,
  launchIsolatedElectronApplication,
  reloadElectronWithTier1Counters,
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
const probeSource = await readFile(new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url), 'utf8');
const routeSource = await readFile(new URL('../scripts/lib/alphaLiveBaselineRoute.mjs', import.meta.url), 'utf8');

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

function pageHarness(pageRealm) {
  let initScript = null;
  return {
    get initScript() { return initScript; },
    async addInitScript(script) { initScript = script; },
    async waitForFunction(predicate, argument, options) {
      assert.equal(argument, null);
      assert.ok(Number.isFinite(options.timeout));
      if (!runInNewContext(`(${predicate.toString()})()`, pageRealm)) {
        throw new Error('Tier-1 runtime API did not boot');
      }
    },
    async evaluate(predicate) {
      return JSON.parse(JSON.stringify(runInNewContext(`(${predicate.toString()})()`, pageRealm)));
    },
  };
}

test('Tier-1 acceptance arms an immutable flag and verifies the live sink without a timeout wait', async () => {
  const pageRealm = {};
  const page = pageHarness(pageRealm);

  await installTier1CountersInitScript(page);
  assert.equal(typeof page.initScript, 'function');
  runInNewContext(`(${page.initScript.toString()})()`, pageRealm);
  const descriptor = Object.getOwnPropertyDescriptor(pageRealm, '__SPACEFACE_PERF_COUNTERS__');
  assert.deepEqual(descriptor, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  pageRealm.__SPACEFACE_PERF__ = { tier1: { isEnabled: () => true } };
  assert.deepEqual(
    await assertTier1CountersBooted(page, { timeoutMs: 1234, phase: 'focused test' }),
    { flag: descriptor, enabled: true },
  );
});

test('Tier-1 readiness fails immediately for missing authority or a disabled replacement sink', async () => {
  const missingFlagRealm = {
    __SPACEFACE_PERF__: { tier1: { isEnabled: () => true } },
  };
  await assert.rejects(
    assertTier1CountersBooted(pageHarness(missingFlagRealm), { phase: 'missing flag' }),
    /lost its immutable install-on-boot authority/,
  );

  const disabledRealm = {};
  const disabledPage = pageHarness(disabledRealm);
  await installTier1CountersInitScript(disabledPage);
  runInNewContext(`(${disabledPage.initScript.toString()})()`, disabledRealm);
  disabledRealm.__SPACEFACE_PERF__ = { tier1: { isEnabled: () => false } };
  await assert.rejects(
    assertTier1CountersBooted(disabledPage, { phase: 'authored flight admission' }),
    /counter sink exists but is not enabled/,
  );

  await assert.rejects(
    assertTier1CountersBooted(pageHarness({}), { timeoutMs: 25 }),
    /runtime API did not boot/,
  );
});

test('Electron Tier-1 reload owns expected navigation and releases it on failure', async () => {
  const events = [];
  const page = {
    async addInitScript() { events.push('init'); },
    async reload(options) {
      events.push(['reload', options]);
      throw new Error('injected reload failure');
    },
  };
  const tracker = {
    beginExpectedNavigation(label) {
      events.push(['begin', label]);
      return 47;
    },
    endExpectedNavigation(token) {
      events.push(['end', token]);
      return token === 47;
    },
  };
  await assert.rejects(
    reloadElectronWithTier1Counters(page, tracker, { timeoutMs: 4321 }),
    /injected reload failure/,
  );
  assert.deepEqual(events, [
    'init',
    ['begin', 'tier1-counter-install'],
    ['reload', { waitUntil: 'domcontentloaded', timeout: 4321 }],
    ['end', 47],
  ]);
});

test('Electron Tier-1 reload waits for the initial canonical load to settle in main', async () => {
  const events = [];
  let releaseInitialLoad;
  const initialLoad = new Promise((resolve) => { releaseInitialLoad = resolve; });
  const rootUrl = 'http://127.0.0.1:64291/';
  const page = {
    url() { return rootUrl; },
    async waitForLoadState(state, options) {
      events.push(['wait', state, options]);
      await initialLoad;
      events.push('load-settled');
    },
    async addInitScript() { events.push('init'); },
    async reload(options) {
      events.push(['reload', options]);
      return { ok: true };
    },
  };
  const electronApp = {
    async browserWindow(boundPage) {
      events.push(['bind-window', boundPage === page]);
      return {
        async evaluate(_callback, expectedRootUrl) {
          events.push(['main-turn', expectedRootUrl]);
          return { url: expectedRootUrl, loadingMainFrame: false };
        },
        async dispose() { events.push('window-handle-disposed'); },
      };
    },
  };
  const tracker = {
    beginExpectedNavigation(label) {
      events.push(['begin', label]);
      return 53;
    },
    endExpectedNavigation(token) {
      events.push(['end', token]);
      return token === 53;
    },
  };

  const prepareAndReload = (async () => {
    await awaitElectronInitialCanonicalLoad(page, electronApp, rootUrl, { timeoutMs: 7654 });
    events.push('ownership-ready');
    return reloadElectronWithTier1Counters(page, tracker, { timeoutMs: 4321 });
  })();
  await Promise.resolve();
  assert.deepEqual(events, [['wait', 'load', { timeout: 7654 }]],
    'the instrumentation reload must remain blocked while Electron main owns the initial load');

  releaseInitialLoad();
  await prepareAndReload;
  assert.deepEqual(events, [
    ['wait', 'load', { timeout: 7654 }],
    'load-settled',
    ['bind-window', true],
    ['main-turn', rootUrl],
    'window-handle-disposed',
    'ownership-ready',
    'init',
    ['begin', 'tier1-counter-install'],
    ['reload', { waitUntil: 'domcontentloaded', timeout: 4321 }],
    ['end', 53],
  ]);
});

test('Electron initial-load proof rejects a mismatched page owner and disposes its handle', async () => {
  const events = [];
  const rootUrl = 'http://127.0.0.1:64291/';
  const page = {
    url() { return rootUrl; },
    async waitForLoadState() { events.push('load'); },
  };
  const electronApp = {
    async browserWindow(boundPage) {
      assert.equal(boundPage, page);
      events.push('bound');
      return {
        async evaluate() {
          events.push('evaluated');
          return { url: 'http://127.0.0.1:65530/', loadingMainFrame: false };
        },
        async dispose() { events.push('disposed'); },
      };
    },
  };
  await assert.rejects(
    awaitElectronInitialCanonicalLoad(page, electronApp, rootUrl),
    /main-process window left its canonical root/,
  );
  assert.deepEqual(events, ['load', 'bound', 'evaluated', 'disposed']);
});

test('Electron launch publishes one canonical tracker and exact root before Tier-1 reload', () => {
  const launchStart = probeSource.indexOf('async function launchElectron(');
  const launchEnd = probeSource.indexOf('\nexport async function awaitElectronInitialCanonicalLoad', launchStart);
  const launch = probeSource.slice(launchStart, launchEnd);
  assert.ok(launchStart >= 0 && launchEnd > launchStart, 'Electron launch implementation must be inspectable');
  assert.equal((launch.match(/createElectronCanonicalUrlTracker\(/g) || []).length, 1,
    'the launch must own exactly one canonical lifecycle tracker');
  const appAcquired = launch.indexOf('const electronApp = await launchIsolatedElectronApplication');
  const appPublished = launch.indexOf('publishOwnership();', appAcquired);
  const processRead = launch.indexOf('childProcess = electronApp.process();', appAcquired);
  const processPublished = launch.indexOf('publishOwnership();', processRead);
  const monitorCreated = launch.indexOf('processMonitor = createElectronProcessMonitor', processRead);
  const monitorPublished = launch.indexOf('publishOwnership();', monitorCreated);
  const trackerCreated = launch.indexOf('pageIssueTracker = createStrictElectronApplicationIssueTracker', monitorCreated);
  const trackerPublished = launch.indexOf('publishOwnership();', trackerCreated);
  const firstWindow = launch.indexOf('await electronApp.firstWindow', trackerCreated);
  assert.ok(
    appAcquired >= 0
      && appPublished > appAcquired
      && processRead > appPublished
      && processPublished > processRead
      && monitorCreated > processPublished
      && monitorPublished > monitorCreated
      && trackerCreated > monitorPublished
      && trackerPublished > trackerCreated
      && firstWindow > trackerPublished,
    'app, child, monitor, and issue-tracker ownership must publish before each later setup seam',
  );
  const pagePublished = launch.indexOf('publishOwnership({ page });', firstWindow);
  const pollingInstalled = launch.indexOf('installCspSafePlaywrightPolling(page);', firstWindow);
  const canonicalTrackerCreated = launch.indexOf('const canonicalUrlTracker = createElectronCanonicalUrlTracker', pollingInstalled);
  const canonicalTrackerPublished = launch.indexOf('publishOwnership({\n    page,\n    canonicalUrlTracker,\n  });', canonicalTrackerCreated);
  assert.ok(
    pagePublished > firstWindow
      && pollingInstalled > pagePublished
      && canonicalTrackerCreated > pollingInstalled
      && canonicalTrackerPublished > canonicalTrackerCreated,
    'page and canonical tracker ownership must publish before each later page setup seam',
  );
  const rootPublication = launch.indexOf('canonicalUrlTracker,\n    rootUrl,');
  const initialLoad = launch.indexOf('await awaitElectronInitialCanonicalLoad(page, electronApp, rootUrl);');
  const reload = launch.indexOf('await reloadElectronWithTier1Counters(page, pageIssueTracker);');
  assert.ok(rootPublication >= 0 && initialLoad > rootPublication && reload > initialLoad,
    'page, tracker, and exact root cleanup ownership must precede settled-load proof and reload');
});

test('isolated Electron launch rejection removes its unpublished owned profile', async () => {
  const calls = [];
  const isolatedLaunch = {
    options: { args: ['.'] },
    cleanup(options) { calls.push(options); },
  };
  await assert.rejects(
    launchIsolatedElectronApplication({
      async launch(options) {
        assert.equal(options, isolatedLaunch.options);
        throw new Error('injected launch rejection');
      },
    }, isolatedLaunch),
    /injected launch rejection/,
  );
  assert.deepEqual(calls, [{ runtimeClosed: true }]);
});

test('isolated Electron profile cleanup depends on process shutdown, not acceptance success', () => {
  const calls = [];
  const isolatedLaunch = { cleanup(options) { calls.push(options); } };
  assert.equal(cleanupIsolatedElectronProfile(isolatedLaunch, {
    pass: false,
    processCloseConfirmed: true,
    processExited: true,
  }), true);
  assert.deepEqual(calls, [{ runtimeClosed: true }]);
  assert.equal(cleanupIsolatedElectronProfile({ cleanup() { throw new Error('must not run'); } }, {
    pass: false,
    processCloseConfirmed: true,
    processExited: false,
  }), false);
});

test('attribution validates Tier-1 ownership at authored flight admission before route input or sampling', () => {
  const routeReady = routeSource.indexOf("recordCanonicalUrl('authored-flight-ready');");
  const routeHook = routeSource.indexOf('await onAuthoredFlightReady({ page, launchSnapshot });', routeReady);
  const routeInput = routeSource.indexOf("phase = 'flight-input';", routeReady);
  assert.ok(routeReady >= 0 && routeHook > routeReady && routeInput > routeHook,
    'the awaited ownership hook must run at authored readiness before player input');

  const callback = probeSource.indexOf("assertTier1CountersBooted(page, { phase: 'authored flight admission' })");
  const sample = probeSource.indexOf('const { document } = await samplePerformanceAttribution(page', callback);
  assert.ok(callback >= 0, 'attribution must bind its ownership assertion to authored flight readiness');
  assert.ok(sample > callback, 'authored-flight ownership must fail before attribution sampling begins');
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
