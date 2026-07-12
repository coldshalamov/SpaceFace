import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assessElectronProcessHealth,
  assessElectronScreenshotDimensions,
  assessElectronViewportFloor,
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
  createStrictElectronPageIssueTracker,
  evaluateElectronPublicationReadiness,
  evaluateElectronUrlAcceptance,
  forceCloseOwnedElectronTree,
  runGuardedElectronPublication,
  validateElectronEvidenceEnvelope,
} from '../scripts/lib/alphaLiveBaselineElectronContracts.mjs';
import { publishAcceptedArtifacts } from '../scripts/lib/alphaLiveBaselineContracts.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CHECK_PATH = path.join(ROOT, 'scripts', 'check-alpha-live-baseline-electron.mjs');
const HELPER_PATH = path.join(ROOT, 'scripts', 'lib', 'alphaLiveBaselineElectronContracts.mjs');
const ROUTE_PATH = path.join(ROOT, 'scripts', 'lib', 'alphaLiveBaselineRoute.mjs');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const CANONICAL = 'http://127.0.0.1:41788/';

assert.equal(existsSync(CHECK_PATH), true, 'Electron baseline check must exist');
assert.equal(existsSync(HELPER_PATH), true, 'Electron baseline executable contracts must exist');

const [checkSource, helperSource, routeSource, packageSource] = await Promise.all([
  readFile(CHECK_PATH, 'utf8'),
  readFile(HELPER_PATH, 'utf8'),
  readFile(ROUTE_PATH, 'utf8'),
  readFile(PACKAGE_PATH, 'utf8'),
]);
const pkg = JSON.parse(packageSource);

assert.equal(
  pkg.scripts['check:alpha:baseline:electron'],
  'npm run check:alpha:baseline:contracts && node scripts/check-alpha-live-baseline-electron.mjs',
  'headed Electron evidence always runs the nonheaded contract preflight',
);
assert.equal(
  String(pkg.scripts['check:alpha:baseline:contracts']).split('node test/alpha-live-baseline-electron-contract.test.mjs').length - 1,
  1,
  'the aggregate contract gate executes the Electron contract exactly once',
);

assert.match(checkSource,
  /createIsolatedElectronLaunch\s*\(\s*\{\s*root:\s*ROOT[\s\S]*electron\.launch\s*\(\s*isolatedLaunch\.options\s*\)/,
  'production launches the real Electron app with an isolated profile and listener');
assert.match(checkSource, /runBrowserPublicRoute\s*\(\s*\{\s*page\b/,
  'production executes the exact shared accepted public route');
assert.match(checkSource, /createElectronCanonicalUrlTracker\s*\(\s*page\s*,\s*\{/,
  'URL tracking begins immediately from first-window acquisition before the root is known');
assert.match(checkSource, /await canonicalUrlTracker\.waitForCanonicalRoot\s*\(/,
  'production waits for the tracked launcher navigation rather than navigating the page itself');
assert.match(checkSource, /closeOwnedElectronRuntime\s*\(/,
  'production uses the executable Electron cleanup seam');
assert.match(checkSource, /captureKind:\s*['"]electron['"]/,
  'accepted evidence identifies an Electron capture');
assert.match(checkSource, /runtime:\s*\{\s*kind:\s*['"]electron['"]/,
  'accepted evidence identifies an Electron runtime');
assert.match(checkSource, /primaryAcceptance:\s*true/,
  'successful public Electron route is primary evidence');
assert.match(checkSource, /injectedState:\s*false/,
  'evidence explicitly denies injected gameplay state');
assert.match(checkSource, /inputSource:\s*['"]keyboard-mouse['"]/,
  'evidence names public keyboard and mouse input');

for (const [label, forbidden] of [
  ['separate browser server', /acquireVisualProbeServer|createGameServer|server\.listen\s*\(/],
  ['direct page navigation', /page\.goto\s*\(/],
  ['storage access', /\b(?:localStorage|sessionStorage|indexedDB)\b/],
  ['initialization injection', /\baddInitScript\s*\(/],
  ['direct event injection', /\b(?:SF|sf)\.bus\.emit\s*\(|\bbus\.emit\s*\(/],
  ['entity injection', /\bspawnEntity\s*\(/],
  ['gameplay service invocation', /\bregistry\.get\s*\(|\bhelpers\.[A-Za-z_$][\w$]*\s*\(/],
  ['runtime state assignment', /\b(?:state|player|entity|sf\.state)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*=(?!=)/],
  ['ambient process killing', /\b(?:taskkill|Stop-Process|process\.kill)\b/i],
  ['launcher GPU overrides', /--(?:disable-gpu|use-gl|use-angle)/i],
  ['window or DPR override', /setViewportSize|setZoomFactor|zoomFactor|force-device-scale-factor|setDeviceMetricsOverride/i],
  ['debug or fixture query', /[?](?:debug|perf|probe|scenario|fixture)=/i],
]) {
  assert.doesNotMatch(checkSource, forbidden, `Electron baseline forbids ${label}`);
}
assert.match(checkSource, /acceptedBrowserDirectoryUntouched:\s*await pathExists\(path\.join\(ALPHA_ROOT,\s*['"]m0-live-baseline-browser['"]\)\)/,
  'failure telemetry records the preexisting browser packet without mutating it');
assert.match(checkSource, /const TASK_ID\s*=\s*['"]m0-live-baseline-electron['"]/,
  'all staging and accepted publication paths are derived from the Electron-only task id');
assert.match(checkSource, /viewport:\s*runtimeMetadata\.viewport/,
  'evidence truthfully publishes the measured CSS content viewport');
assert.match(checkSource, /viewportFloorAssessment\s*=\s*assessElectronViewportFloor\(runtimeMetadata\)/,
  'runtime CSS viewport, outer window, screen, and DPR receive an explicit assessment');
assert.match(checkSource, /screenshotDimensionAssessment\s*=\s*assessElectronScreenshotDimensions\(screenshotTelemetry\)/,
  'parsed physical PNG dimensions receive a separate explicit assessment');

const cleanupIndex = checkSource.indexOf('cleanupReport = await closeOwnedElectronRuntime');
const readinessIndex = checkSource.indexOf('const publicationReadiness = evaluateElectronPublicationReadiness');
const evidenceWriteIndex = checkSource.indexOf("writeJsonAtomic(path.join(STAGING_ROOT, 'evidence.json')");
const promotionIndex = checkSource.indexOf('await publishAcceptedArtifacts');
const guardedPublicationIndex = checkSource.indexOf('await runGuardedElectronPublication');
assert(cleanupIndex > 0 && readinessIndex > cleanupIndex,
  'publication readiness is evaluated only after owned Electron cleanup');
assert(guardedPublicationIndex > cleanupIndex && guardedPublicationIndex < readinessIndex,
  'the complete post-cleanup assertion, staging, and promotion phase runs inside the guarded publication seam');
assert(evidenceWriteIndex > readinessIndex,
  'accepted evidence cannot be written before publication readiness passes');
assert(promotionIndex > evidenceWriteIndex,
  'accepted directory promotion happens only after complete evidence staging');
const firstWindowIndex = checkSource.indexOf('page = await electronApp.firstWindow');
const processMonitorIndex = checkSource.indexOf('processMonitor = createElectronProcessMonitor({ electronApp, childProcess: electronApp.process() })');
const pageIssuesIndex = checkSource.indexOf('pageIssueTracker = createStrictElectronApplicationIssueTracker(electronApp)');
const urlTrackerIndex = checkSource.indexOf('canonicalUrlTracker = createElectronCanonicalUrlTracker(page');
const backfillIndex = checkSource.indexOf('await pageIssueTracker.bindAndBackfillPage(page)');
const canonicalWaitIndex = checkSource.indexOf('rootUrl = await canonicalUrlTracker.waitForCanonicalRoot');
assert(processMonitorIndex > 0 && pageIssuesIndex > processMonitorIndex && firstWindowIndex > pageIssuesIndex,
  'process and application/context-wide observation attach before first-window acquisition');
assert.match(checkSource,
  /electronApp\s*=\s*await electron\.launch\([\s\S]*?\);\s*processMonitor\s*=\s*createElectronProcessMonitor\(\{ electronApp, childProcess: electronApp\.process\(\) \}\)/,
  'the process monitor is the first synchronous action after Electron launch resolves');
assert(urlTrackerIndex > firstWindowIndex && backfillIndex > urlTrackerIndex && canonicalWaitIndex > backfillIndex,
  'URL observation and page-history backfill are active before waiting for canonical launch navigation');
assert.match(checkSource,
  /path\.join\(stagingRoot, ['"]evidence\.json['"]\)[\s\S]*?rejected-primary-evidence\.json/,
  'late failure publication quarantines any staged primary evidence claim');

assert.match(helperSource, /on\(['"]crash['"]/, 'page crash is part of the strict issue boundary');
assert.match(helperSource, /on\(['"]requestfailed['"]/, 'request failure is part of the strict issue boundary');
assert.match(helperSource, /status\s*>=\s*400/, 'HTTP failures are rejected');
assert.match(helperSource, /GPU process exited unexpectedly|gpu-process-crashed|child-process-gone/i,
  'GPU-process crash language is classified');
assert.match(helperSource, /first-window-acquired/, 'URL lifecycle starts at first-window acquisition');
assert.match(helperSource, /node-live-url-poll/, 'URL lifecycle includes Node-side live polling');
assert.match(helperSource, /immediately-preclose-live/, 'URL lifecycle includes a live preclose observation');
assert.match(helperSource, /fetchImpl\s*\(\s*resources\.rootUrl/, 'cleanup probes the Electron-owned root listener after close');
assert.match(helperSource, /candidate\s*!==\s*captured/,
  'force-close requires exact ChildProcess object identity from the launch monitor');
assert.match(helperSource, /capturedPid\s*!==\s*pid/,
  'force-close requires the captured launch PID to match the cleanup PID');
assert.match(helperSource, /candidate\?\.exitCode\s*!=\s*null[\s\S]*processExitEvents\?\.length\s*>\s*0/,
  'an exited child makes its former OS PID ineligible for force-close targeting');
assert.match(helperSource, /const command\s*=\s*['"]taskkill\.exe['"]/,
  'Windows fallback invokes the process-tree terminator directly');
assert.match(helperSource, /const args\s*=\s*\[['"]\/PID['"],\s*String\(pid\),\s*['"]\/T['"],\s*['"]\/F['"]\]/,
  'Windows fallback targets only the exact validated launch PID tree');
assert.match(helperSource, /const groupPid\s*=\s*-pid[\s\S]*killProcessGroupImpl\(groupPid, signal\)/,
  'non-Windows fallback targets only the exact captured process group');
assert.doesNotMatch(helperSource, /\b(?:tasklist|Stop-Process|Get-Process|wmic)\b|\/IM\b/i,
  'force-close cannot enumerate or target ambient processes by name');
assert.match(helperSource, /listen\(context, ['"]weberror['"]/, 'context-wide renderer errors attach before firstWindow');
assert.match(helperSource, /consoleMessages[\s\S]*pageErrors[\s\S]*requests/,
  'supported Playwright page histories are backfilled explicitly');
assert.match(helperSource, /floor:\s*\{\s*width:\s*1280,\s*height:\s*720,\s*unit:\s*['"]css-pixels['"]/,
  'CSS viewport floor is explicitly independent from physical screenshot pixels');
assert.match(helperSource, /floor:\s*\{\s*width:\s*1440,\s*height:\s*900,\s*unit:\s*['"]physical-pixels['"]/,
  'physical PNG floor is explicitly independent from CSS viewport dimensions');

async function testStrictPageIssueTracker() {
  const page = new FakePage(CANONICAL);
  const tracker = createStrictElectronPageIssueTracker(page);
  page.emit('console', fakeConsoleMessage('warning', 'descriptive warning'));
  assert.equal(tracker.errors().length, 0, 'warnings remain diagnostic rather than accepted-route failures');
  page.emit('console', fakeConsoleMessage('error', 'fatal console error'));
  page.emit('pageerror', new Error('page exploded'));
  page.emit('crash');
  page.emit('requestfailed', {
    method: () => 'GET',
    url: () => 'http://127.0.0.1:41788/broken.glb',
    failure: () => ({ errorText: 'net::ERR_ABORTED' }),
  });
  page.emit('response', { status: () => 503, url: () => 'http://127.0.0.1:41788/unavailable' });
  const errors = tracker.errors();
  assert.equal(errors.length, 5, 'console, page, crash, request, and HTTP failures are all fatal');
  assert(errors.some((entry) => entry.source === 'page-crash'));
  assert(errors.some((entry) => /ERR_ABORTED/.test(entry.text)));
  tracker.stop();
}

async function testApplicationWideIssueTrackerAndBackfill() {
  const context = new EventEmitter();
  const electronApp = new EventEmitter();
  electronApp.context = () => context;
  const tracker = createStrictElectronApplicationIssueTracker(electronApp);

  const consoleError = fakeConsoleMessage('error', 'console error before firstWindow resolved');
  const request = {
    method: () => 'GET',
    url: () => `${CANONICAL}early.glb`,
    failure: () => ({ errorText: 'net::ERR_FAILED' }),
    response: async () => null,
  };
  const response = { status: () => 503, url: () => `${CANONICAL}early-service` };
  const pageError = new Error('renderer error before firstWindow resolved');
  const webError = { error: () => pageError };

  context.emit('console', consoleError);
  context.emit('weberror', webError);
  context.emit('requestfailed', request);
  context.emit('response', response);

  const page = new HistoryFakePage(CANONICAL, {
    consoleMessages: [consoleError],
    pageErrors: [pageError],
    requests: [request],
  });
  electronApp.emit('window', page);
  await tracker.bindAndBackfillPage(page);
  page.emit('crash');

  const errors = tracker.errors();
  assert.equal(errors.filter((entry) => entry.source === 'console').length, 1,
    'the same console object seen live and in history is recorded once without losing the error');
  assert.equal(errors.filter((entry) => entry.source === 'pageerror').length, 1,
    'context WebError and page history dedupe by the underlying Error object');
  assert.equal(errors.filter((entry) => entry.source === 'request').length, 1,
    'the same failed request seen live and in recent history is recorded once');
  assert.equal(errors.filter((entry) => entry.source === 'response').length, 1,
    'context-wide HTTP response observation catches failures before firstWindow resolves');
  assert(errors.some((entry) => entry.source === 'page-crash'), 'bound pages retain live crash observation');

  const coverage = tracker.coverage();
  for (const api of ['consoleMessages', 'pageErrors', 'requests']) {
    assert.equal(coverage.backfill[api].supported, true, `${api} backfill support is explicit`);
    assert.equal(coverage.backfill[api].completed, true, `${api} backfill completion is explicit`);
  }
  assert(coverage.applicationEvents.includes('window') && coverage.contextEvents.includes('weberror'),
    'application and context observation boundaries are explicit telemetry');
  tracker.stop();

  const optionalContext = new EventEmitter();
  const optionalApp = new EventEmitter();
  optionalApp.context = () => optionalContext;
  const optionalTracker = createStrictElectronApplicationIssueTracker(optionalApp);
  const optionalPage = new FakePage(CANONICAL);
  optionalApp.emit('window', optionalPage);
  await optionalTracker.bindAndBackfillPage(optionalPage);
  const optionalCoverage = optionalTracker.coverage();
  assert.equal(optionalCoverage.backfill.consoleMessages.supported, false,
    'missing optional console history API is explicit rather than silently assumed');
  assert.equal(optionalCoverage.backfill.pageErrors.supported, false,
    'missing optional page-error history API is explicit rather than silently assumed');
  assert.equal(optionalCoverage.backfill.requests.supported, false,
    'missing optional request history API is explicit rather than silently assumed');
  optionalTracker.stop();
}

async function testElectronUrlLifecycle() {
  const bootPage = new FakePage('about:blank');
  const bootTracker = createElectronCanonicalUrlTracker(bootPage, {
    pollIntervalMs: 2,
    bootstrapTimeoutMs: 60,
  });
  assert.equal(bootTracker.report().observations[0].source, 'first-window-acquired',
    'first-window about:blank is recorded before launcher navigation');
  assert.equal(bootTracker.report().observations[0].bootstrap, true,
    'the bounded initial about:blank observation is labeled bootstrap rather than silently dropped');
  bootPage.navigate(CANONICAL);
  assert.equal(await bootTracker.waitForCanonicalRoot(50), CANONICAL,
    'tracked about:blank launcher bootstrap may establish the canonical slash root');
  await delay(8);
  const liveCheck = bootTracker.observeNow('immediately-preclose-live');
  bootPage.closed = true;
  const bootReport = await bootTracker.stopAfterPageClose();
  const accepted = evaluateElectronUrlAcceptance({
    expectedRootUrl: CANONICAL,
    observations: bootReport.observations,
    postFingerprintUrlCheck: { source: 'post-worktree-fingerprint-live', actual: CANONICAL },
    precloseUrlCheck: liveCheck,
  });
  assert.equal(bootReport.pass, true, 'bounded bootstrap plus canonical polls through close passes tracker acceptance');
  assert.equal(accepted.pass, true, 'publication acceptance recognizes canonical acquisition after explicit bootstrap');

  const acquisitionOnly = evaluateElectronUrlAcceptance({
    expectedRootUrl: CANONICAL,
    observations: [
      {
        sequence: 1,
        source: 'first-window-acquired',
        actual: 'about:blank',
        bootstrap: true,
        enforced: false,
        canonicalEstablished: false,
        pass: true,
        failures: [],
      },
      {
        sequence: 2,
        source: 'node-live-url-poll',
        actual: CANONICAL,
        bootstrap: false,
        enforced: true,
        canonicalEstablished: true,
        pass: true,
        failures: [],
      },
    ],
    postFingerprintUrlCheck: { source: 'post-worktree-fingerprint-live', actual: CANONICAL },
    precloseUrlCheck: { source: 'immediately-preclose-live', actual: CANONICAL },
  });
  assert.equal(acquisitionOnly.pass, false,
    'the poll that first discovers canonical root cannot also impersonate continued live polling through close');

  const stuckPage = new FakePage('about:blank');
  const stuckTracker = createElectronCanonicalUrlTracker(stuckPage, {
    pollIntervalMs: 2,
    bootstrapTimeoutMs: 8,
  });
  await assert.rejects(stuckTracker.waitForCanonicalRoot(30), /about:blank|bootstrap|canonical/i,
    'about:blank that never reaches the game root fails within the bounded bootstrap window');
  stuckPage.closed = true;
  assert.equal((await stuckTracker.stopAfterPageClose()).pass, false,
    'closing a never-canonical bootstrap cannot rescue URL lifecycle acceptance');

  const fallbackPage = new FakePage('http://127.0.0.1:54321/');
  const fallbackTracker = createElectronCanonicalUrlTracker(fallbackPage, {
    pollIntervalMs: 2,
    bootstrapTimeoutMs: 30,
  });
  await assert.rejects(fallbackTracker.waitForCanonicalRoot(20), /41788|stable.*origin|canonical/i,
    'an ephemeral fallback listener cannot certify Electron primary save-origin parity');
  fallbackPage.closed = true;
  assert.equal((await fallbackTracker.stopAfterPageClose()).pass, false,
    'a non-41788 listener cannot pass the URL lifecycle report');

  for (const [label, driftUrl, failurePattern] of [
    ['about:blank return', 'about:blank', /about:blank|origin|canonical/i],
    ['query drift', `${CANONICAL}?late=1`, /search became/i],
    ['path drift', `${CANONICAL}other`, /pathname changed/i],
  ]) {
    const page = new FakePage('about:blank');
    const tracker = createElectronCanonicalUrlTracker(page, { pollIntervalMs: 2, bootstrapTimeoutMs: 60 });
    page.navigate(CANONICAL);
    await tracker.waitForCanonicalRoot(50);
    await delay(5);
    page.navigate(driftUrl);
    await delay(5);
    const preclose = tracker.observeNow('immediately-preclose-live');
    page.closed = true;
    const report = await tracker.stopAfterPageClose();
    const result = evaluateElectronUrlAcceptance({
      expectedRootUrl: CANONICAL,
      observations: report.observations,
      postFingerprintUrlCheck: { source: 'post-worktree-fingerprint-live', actual: CANONICAL },
      precloseUrlCheck: preclose,
    });
    assert.equal(report.pass, false, `${label} fails the executable lifecycle tracker`);
    assert.equal(result.pass, false, `${label} rejects publication acceptance`);
    assert(result.failures.some((failure) => failurePattern.test(failure)),
      `${label} reports the strict canonical drift cause: ${JSON.stringify(result.failures)}`);
  }
}

async function testProcessMonitorAndCrashRejection() {
  const bufferedChild = fakeChildProcess({
    stderrBuffered: [Buffer.from('[FATAL] buffered before monitor attach\n')],
  });
  const bufferedMonitor = createElectronProcessMonitor({
    electronApp: new EventEmitter(),
    childProcess: bufferedChild,
  });
  assert.equal(bufferedMonitor.snapshot().fatalMainMessageCount, 1,
    'buffered process output written before monitor attachment is consumed when the stream supports read()');
  assert.equal(bufferedMonitor.snapshot().streamCapabilities.stderr.bufferedChunksConsumed, 1,
    'buffered stderr consumption is explicit telemetry');
  bufferedMonitor.stop();

  const provisionalApp = new EventEmitter();
  const provisionalChild = fakeChildProcess();
  const provisionalMonitor = createElectronProcessMonitor({
    electronApp: provisionalApp,
    childProcess: provisionalChild,
  });
  provisionalChild.stderr.emit('data', Buffer.from('ordinary FATAL'));
  assert.equal(provisionalMonitor.snapshot().fatalMainMessages.length, 0,
    'a provisional end-of-chunk FATAL token is not permanent evidence before logical-line completion');
  provisionalChild.stderr.emit('data', Buffer.from('ITY marker\n'));
  assert.equal(provisionalMonitor.snapshot().fatalMainMessages.length, 0,
    'the completed harmless FATALITY line does not inherit a sticky provisional fatal');
  provisionalChild.stderr.emit('data', Buffer.from('GPU process crashed'));
  assert.equal(provisionalMonitor.snapshot().gpuProcessFailures.length, 0,
    'a provisional end-of-chunk GPU crash phrase is not permanent evidence before line completion');
  provisionalChild.stderr.emit('data', Buffer.from('ness marker\n'));
  assert.equal(provisionalMonitor.snapshot().gpuProcessFailures.length, 0,
    'the completed harmless crashedness line does not inherit a sticky provisional GPU failure');
  provisionalMonitor.stop();

  const app = new EventEmitter();
  const child = fakeChildProcess();
  const monitor = createElectronProcessMonitor({ electronApp: app, childProcess: child, maxMessages: 3 });
  child.stderr.emit('data', Buffer.from('GPU process exited unexpectedly: gpu-process-crashed\n'));
  child.stderr.emit('data', Buffer.from(Array.from({ length: 12 }, (_, index) => `ordinary-${index}`).join('\n') + '\n'));
  const gpuCrash = assessElectronProcessHealth(monitor.snapshot());
  assert.equal(gpuCrash.pass, false, 'an early GPU crash remains fatal after bounded diagnostics evict its line');
  assert.equal(gpuCrash.snapshot.messages.length, 3, 'ordinary retained diagnostics remain bounded');
  assert.equal(gpuCrash.snapshot.gpuProcessFailures.length, 1, 'durable GPU classification is independent of retention');
  assert(gpuCrash.failures.some((failure) => /GPU/i.test(failure)));
  monitor.stop();

  const splitApp = new EventEmitter();
  const splitChild = fakeChildProcess();
  const splitMonitor = createElectronProcessMonitor({ electronApp: splitApp, childProcess: splitChild });
  splitChild.stderr.emit('data', Buffer.from('ordinary GPU pro'));
  assert.equal(splitMonitor.snapshot().gpuProcessFailures.length, 0,
    'an ordinary partial line containing a harmless prefix does not false-positive');
  splitChild.stderr.emit('data', Buffer.from('cess healthy\nGPU process exited unex'));
  assert.equal(splitMonitor.snapshot().gpuProcessFailures.length, 0,
    'split ordinary completion remains nonfatal and an incomplete fatal phrase waits for completion');
  splitChild.stdout.emit('data', Buffer.from('ordinary main pro'));
  splitChild.stdout.emit('data', Buffer.from('cess healthy\n'));
  assert.equal(splitMonitor.snapshot().fatalMainMessages.length, 0,
    'an ordinary main-process phrase split across chunks does not false-positive');
  splitChild.stderr.emit('data', Buffer.from('pectedly\nmain process cr'));
  splitChild.stderr.emit('data', Buffer.from('ashed\n'));
  const splitSnapshot = splitMonitor.snapshot();
  assert.equal(splitSnapshot.gpuProcessFailures.length, 1, 'GPU fatal phrase split across chunks is classified once');
  assert.equal(splitSnapshot.fatalMainMessages.length, 1, 'main fatal phrase split across chunks is classified once');
  const repeatedSnapshot = splitMonitor.snapshot();
  const firstStop = splitMonitor.stop();
  const secondStop = splitMonitor.stop();
  for (const observation of [repeatedSnapshot, firstStop, secondStop]) {
    assert.equal(observation.gpuProcessFailures.length, 1, 'idempotent snapshot/stop never duplicates durable GPU facts');
    assert.equal(observation.fatalMainMessages.length, 1, 'idempotent snapshot/stop never duplicates durable main facts');
  }

  const residualApp = new EventEmitter();
  const residualChild = fakeChildProcess();
  const residualMonitor = createElectronProcessMonitor({ electronApp: residualApp, childProcess: residualChild });
  residualChild.stderr.emit('data', Buffer.from('GPU process exited unex'));
  residualChild.stderr.emit('data', Buffer.from('pectedly'));
  assert.equal(residualMonitor.snapshot().gpuProcessFailures.length, 0,
    'a genuine but unterminated fatal residual remains provisional until final stop flush');
  const residualStop = residualMonitor.stop();
  assert.equal(residualStop.gpuProcessFailures.length, 1,
    'final stop flush classifies a genuine split fatal residual exactly once');
  assert.equal(residualMonitor.stop().gpuProcessFailures.length, 1,
    'idempotent repeated stop does not duplicate final-residual classification');

  const signaledChild = fakeChildProcess();
  const signaledMonitor = createElectronProcessMonitor({
    electronApp: new EventEmitter(),
    childProcess: signaledChild,
  });
  signaledMonitor.markClosing();
  signaledChild.signalCode = 'SIGTERM';
  signaledChild.emit('exit', null, 'SIGTERM');
  signaledChild.emit('close', null, 'SIGTERM');
  const signaledHealth = assessElectronProcessHealth(signaledMonitor.stop());
  assert.equal(signaledHealth.pass, false, 'even an expected non-null termination signal rejects primary evidence');
  assert(signaledHealth.failures.some((failure) => /SIGTERM|signal/i.test(failure)));

  const crashSignalChild = fakeChildProcess();
  const crashSignalMonitor = createElectronProcessMonitor({
    electronApp: new EventEmitter(),
    childProcess: crashSignalChild,
  });
  crashSignalChild.signalCode = 'SIGSEGV';
  crashSignalChild.emit('exit', null, 'SIGSEGV');
  crashSignalChild.emit('close', null, 'SIGSEGV');
  const crashSignalHealth = assessElectronProcessHealth(crashSignalMonitor.stop());
  assert.equal(crashSignalHealth.pass, false, 'SIGSEGV termination rejects primary evidence');
  assert(crashSignalHealth.failures.some((failure) => /SIGSEGV|signal/i.test(failure)));

  const boundedChild = fakeChildProcess();
  const boundedMonitor = createElectronProcessMonitor({
    electronApp: new EventEmitter(),
    childProcess: boundedChild,
    maxMessages: 2,
    maxFailureSamples: 2,
  });
  boundedChild.stderr.emit('data', Buffer.from(
    Array.from({ length: 1_000 }, (_, index) => `[FATAL] failure-${index}`).join('\n') + '\n',
  ));
  const boundedSnapshot = boundedMonitor.snapshot();
  assert.equal(boundedSnapshot.fatalMainMessageCount, 1_000,
    'sticky fatal total retains all one-thousand completed fatal lines');
  assert.equal(boundedSnapshot.fatalMainMessages.length, 2,
    'retained fatal samples remain bounded independently of the sticky count');
  assert.equal(assessElectronProcessHealth(boundedSnapshot).pass, false,
    'bounded samples do not weaken fatal acceptance');
  boundedMonitor.stop();

  const benignChild = fakeChildProcess();
  const benignMonitor = createElectronProcessMonitor({
    electronApp: new EventEmitter(),
    childProcess: benignChild,
  });
  benignChild.stderr.emit('data', Buffer.from('this condition is not fatal and recovered\n'));
  assert.equal(assessElectronProcessHealth(benignMonitor.stop()).pass, true,
    'ordinary case-insensitive words such as not fatal do not impersonate structured fatal output');

  const overflowChild = fakeChildProcess();
  const overflowMonitor = createElectronProcessMonitor({
    electronApp: new EventEmitter(),
    childProcess: overflowChild,
    maxPendingFragmentChars: 32,
  });
  overflowChild.stderr.emit('data', Buffer.from('x'.repeat(256)));
  const overflowSnapshot = overflowMonitor.snapshot();
  assert(overflowSnapshot.pendingLineFragments.every((fragment) => fragment.text.length <= 32),
    'every retained pending fragment is bounded');
  assert(overflowSnapshot.monitorErrors.some((error) => /fragment|overflow/i.test(`${error.source} ${error.message}`)),
    'overlong unterminated fragments create explicit monitor errors');
  assert.equal(assessElectronProcessHealth(overflowSnapshot).pass, false,
    'fragment overflow conservatively rejects acceptance');
  overflowMonitor.stop();

  const completedOversizeChild = fakeChildProcess();
  const completedOversizeMonitor = createElectronProcessMonitor({
    electronApp: new EventEmitter(),
    childProcess: completedOversizeChild,
    maxMessages: 2,
    maxFailureSamples: 2,
    maxMonitorErrorSamples: 2,
    maxPendingFragmentChars: 32,
  });
  completedOversizeChild.stderr.emit('data', Buffer.from(`[FATAL] ${'x'.repeat(1_000_000)}\n`));
  completedOversizeChild.stderr.emit('data', Buffer.from(
    Array.from({ length: 20 }, (_, index) => `${index}-${'y'.repeat(64)}`).join('\n') + '\n',
  ));
  const completedOversizeSnapshot = completedOversizeMonitor.snapshot();
  assert(completedOversizeSnapshot.messages.every((message) => message.text.length <= 32),
    'newline-terminated diagnostic lines are bounded just like pending fragments');
  assert(completedOversizeSnapshot.fatalMainMessages.every((message) => message.text.length <= 32),
    'fatal samples cannot retain a giant completed line');
  assert.equal(completedOversizeSnapshot.fatalMainMessageCount, 1,
    'classification runs before completed-line truncation, preserving the sticky fatal count');
  assert.equal(completedOversizeSnapshot.truncatedCompletedLineCount, 21,
    'completed-line truncation has a sticky total independent of sample retention');
  assert.equal(completedOversizeSnapshot.monitorErrorCount, 21,
    'every lossy completed-line truncation remains explicit acceptance telemetry');
  assert.equal(completedOversizeSnapshot.monitorErrors.length, 2,
    'monitor-error samples remain bounded under repeated oversized lines');
  assert.equal(assessElectronProcessHealth(completedOversizeSnapshot).pass, false,
    'lossy completed-line telemetry conservatively rejects acceptance');
  completedOversizeMonitor.stop();

  const earlyApp = new EventEmitter();
  const earlyChild = fakeChildProcess();
  const earlyMonitor = createElectronProcessMonitor({ electronApp: earlyApp, childProcess: earlyChild });
  earlyChild.exitCode = 1;
  earlyChild.emit('exit', 1, null);
  const earlyExit = assessElectronProcessHealth(earlyMonitor.snapshot());
  assert.equal(earlyExit.pass, false, 'main process exit before owned close rejects acceptance');
  assert(earlyExit.failures.some((failure) => /unexpected/i.test(failure)));
  earlyMonitor.stop();
}

async function testOwnedElectronCleanup() {
  const inertForceCloseTree = async ({ pid }) => ({ pass: false, method: 'test-inert', pid });
  const fixture = cleanupFixture();
  fixture.resources.childProcess.stderr.emit('data', Buffer.from('meaningful residual diagnostic without newline'));
  await delay(8);
  const report = await closeOwnedElectronRuntime(fixture.resources, {
    fetchImpl: async () => { throw new Error('connection refused'); },
    timeoutSignalFactory: () => undefined,
    appCloseTimeoutMs: 25,
  });
  assert.equal(report.pass, true, 'closed app/process/listener/tracker passes executable cleanup');
  assert.equal(report.pageClosed, true);
  assert.equal(report.processExited, true);
  assert.equal(report.processCloseConfirmed, true, 'ChildProcess close proves stdio drain before monitor stop');
  assert.equal(report.listenerReleased, true);
  assert.equal(report.urlTracker.pageClosedWhenStopped, true);
  assert(report.processMonitor.messages.some((message) => /meaningful residual diagnostic/.test(message.text)),
    'owned close flushes meaningful residual process text into durable telemetry');
  assert.deepEqual(report.processMonitor.pendingLineFragments, [],
    'owned close publishes no unflushed process fragments');

  const leftAlive = cleanupFixture({ closeProcess: false });
  await delay(8);
  const processLeak = await closeOwnedElectronRuntime(leftAlive.resources, {
    fetchImpl: async () => { throw new Error('connection refused'); },
    timeoutSignalFactory: () => undefined,
    appCloseTimeoutMs: 10,
    forceCloseTreeImpl: inertForceCloseTree,
  });
  assert.equal(processLeak.pass, false, 'app process left alive rejects cleanup');
  assert(processLeak.failures.some((failure) => /process.*remain|process.*exit/i.test(failure)));

  const forceClosed = cleanupFixture({ closeProcess: false });
  const forceCloseCalls = [];
  await delay(8);
  const forceClosedReport = await closeOwnedElectronRuntime(forceClosed.resources, {
    fetchImpl: async () => { throw new Error('connection refused'); },
    timeoutSignalFactory: () => undefined,
    appCloseTimeoutMs: 10,
    forceCloseTreeImpl: async (target) => {
      forceCloseCalls.push(target);
      forceClosed.resources.childProcess.signalCode = 'SIGKILL';
      forceClosed.resources.childProcess.emit('exit', null, 'SIGKILL');
      forceClosed.resources.childProcess.emit('close', null, 'SIGKILL');
      return { pass: true, method: 'test-exact-tree', pid: target.pid };
    },
  });
  assert.equal(forceClosedReport.pass, false,
    'force-close fallback can clean leaked resources but can never create accepted evidence');
  assert.equal(forceClosedReport.gracefulProcessCloseConfirmed, false,
    'the report preserves that graceful ChildProcess close timed out');
  assert.equal(forceClosedReport.processCloseConfirmed, true,
    'fallback still proves the exact child reached close and drained stdio');
  assert.equal(forceClosedReport.forceClose.attempted, true);
  assert.equal(forceClosedReport.forceClose.ownershipProven, true);
  assert.equal(forceClosedReport.forceClose.closeConfirmed, true);
  assert.equal(forceCloseCalls.length, 1, 'the force-close seam is invoked exactly once');
  assert.equal(forceCloseCalls[0].pid, forceClosed.resources.childProcess.pid,
    'only the exact validated launch PID is passed to the tree terminator');
  assert.equal(forceClosedReport.listenerReleased, true,
    'fallback cleanup still requires conclusive refusal from the exact listener');

  const ownershipMismatch = cleanupFixture({ closeProcess: false });
  const actualOwnedChild = ownershipMismatch.resources.childProcess;
  const substitutedChild = fakeChildProcess();
  const mismatchedForceCloseCalls = [];
  ownershipMismatch.resources.childProcess = substitutedChild;
  await delay(8);
  const ownershipMismatchReport = await closeOwnedElectronRuntime(ownershipMismatch.resources, {
    fetchImpl: async () => { throw new Error('connection refused'); },
    timeoutSignalFactory: () => undefined,
    appCloseTimeoutMs: 10,
    forceCloseTreeImpl: async (target) => {
      mismatchedForceCloseCalls.push(target);
      return { pass: true };
    },
  });
  assert.equal(ownershipMismatchReport.forceClose.attempted, false,
    'identity mismatch blocks force-close before any signal is sent');
  assert.equal(ownershipMismatchReport.forceClose.ownershipProven, false);
  assert.deepEqual(mismatchedForceCloseCalls, [], 'identity mismatch cannot invoke any process-tree terminator');
  assert.notEqual(actualOwnedChild, substitutedChild, 'test uses genuinely unrelated process objects');

  for (const [label, replacementPid] of [['PID mismatch', 54321], ['invalid PID', -1]]) {
    const pidMismatch = cleanupFixture({ closeProcess: false });
    const capturedPid = pidMismatch.resources.processMonitor.snapshot().pid;
    assert.notEqual(replacementPid, capturedPid, `${label} fixture must differ from the captured launch PID`);
    pidMismatch.resources.childProcess.pid = replacementPid;
    const pidTargetCalls = [];
    await delay(8);
    const pidMismatchReport = await closeOwnedElectronRuntime(pidMismatch.resources, {
      fetchImpl: async () => { throw new Error('connection refused'); },
      timeoutSignalFactory: () => undefined,
      appCloseTimeoutMs: 10,
      forceCloseTreeImpl: async (target) => {
        pidTargetCalls.push(target);
        return { pass: true };
      },
    });
    assert.equal(pidMismatchReport.forceClose.ownershipProven, false, `${label} fails ownership proof`);
    assert.deepEqual(pidTargetCalls, [], `${label} cannot reach the platform force-close seam`);
  }

  const missingClose = cleanupFixture({ emitClose: false });
  const exitedWithoutCloseTargets = [];
  await delay(8);
  const missingCloseReport = await closeOwnedElectronRuntime(missingClose.resources, {
    fetchImpl: async () => { throw new Error('connection refused'); },
    timeoutSignalFactory: () => undefined,
    appCloseTimeoutMs: 10,
    forceCloseTreeImpl: async (target) => {
      exitedWithoutCloseTargets.push(target);
      return { pass: true };
    },
  });
  assert.equal(missingCloseReport.pass, false, 'exit without ChildProcess close cannot certify stdio drain');
  assert.equal(missingCloseReport.processCloseConfirmed, false);
  assert(missingCloseReport.failures.some((failure) => /close|drain|stdio/i.test(failure)));
  assert.equal(missingCloseReport.forceClose.ownershipProven, false,
    'exit without close means the OS PID is no longer safe to target');
  assert.deepEqual(exitedWithoutCloseTargets, [],
    'a stale PID from an exited child never reaches the process-tree terminator');

  const lateFatal = cleanupFixture({
    afterExit(childProcess) {
      childProcess.stderr.emit('data', Buffer.from('[FATAL] emitted after exit before close\n'));
    },
  });
  await delay(8);
  const lateFatalReport = await closeOwnedElectronRuntime(lateFatal.resources, {
    fetchImpl: async () => { throw new Error('connection refused'); },
    timeoutSignalFactory: () => undefined,
    appCloseTimeoutMs: 25,
  });
  assert.equal(lateFatalReport.pass, false, 'fatal stderr emitted after exit but before close remains fatal');
  assert.equal(lateFatalReport.processCloseConfirmed, true, 'late fatal test still reaches the drained close boundary');
  assert.equal(lateFatalReport.processMonitor.fatalMainMessageCount, 1);

  const listenerAlive = cleanupFixture();
  await delay(8);
  const listenerLeak = await closeOwnedElectronRuntime(listenerAlive.resources, {
    fetchImpl: async () => ({ ok: true, status: 200 }),
    timeoutSignalFactory: () => undefined,
    appCloseTimeoutMs: 25,
  });
  assert.equal(listenerLeak.pass, false, 'reachable Electron listener rejects cleanup');
  assert(listenerLeak.failures.some((failure) => /listener|reachable/i.test(failure)));

  const inconclusive = cleanupFixture();
  await delay(8);
  const abortedProbe = await closeOwnedElectronRuntime(inconclusive.resources, {
    fetchImpl: async () => {
      const error = new Error('probe timed out');
      error.name = 'AbortError';
      throw error;
    },
    timeoutSignalFactory: () => undefined,
    appCloseTimeoutMs: 25,
  });
  assert.equal(abortedProbe.pass, false, 'a timed-out listener probe is inconclusive rather than proof of release');
  assert.equal(abortedProbe.listenerReleased, false);
  assert(abortedProbe.failures.some((failure) => /inconclusive|timed out/i.test(failure)));
}

async function testPlatformAwareOwnedTreeTermination() {
  const windowsCalls = [];
  const windowsResult = await forceCloseOwnedElectronTree({
    pid: 43210,
    platform: 'win32',
    execFileImpl(executable, args, options, callback) {
      windowsCalls.push({ executable, args, options });
      callback(null, 'SUCCESS', '');
    },
    killProcessGroupImpl() {
      throw new Error('Windows must not use POSIX process-group kill');
    },
  });
  assert.equal(windowsResult.pass, true);
  assert.equal(windowsResult.method, 'windows-taskkill-tree');
  assert.equal(windowsCalls.length, 1);
  assert.equal(windowsCalls[0].executable.toLowerCase(), 'taskkill.exe');
  assert.deepEqual(windowsCalls[0].args, ['/PID', '43210', '/T', '/F'],
    'Windows force-close targets one validated PID tree with an argument array');
  assert.equal(windowsCalls[0].options.shell, false, 'Windows exact-PID tree termination never uses a shell string');

  const groupCalls = [];
  const posixResult = await forceCloseOwnedElectronTree({
    pid: 43210,
    platform: 'linux',
    execFileImpl() {
      throw new Error('non-Windows must not invoke taskkill');
    },
    killProcessGroupImpl(groupPid, signal) {
      groupCalls.push({ groupPid, signal });
    },
  });
  assert.equal(posixResult.pass, true);
  assert.equal(posixResult.method, 'posix-process-group');
  assert.deepEqual(groupCalls, [{ groupPid: -43210, signal: 'SIGKILL' }],
    'non-Windows force-close mirrors Playwright and targets only the captured process group');

  let invalidTargetCalls = 0;
  await assert.rejects(
    forceCloseOwnedElectronTree({
      pid: -1,
      platform: 'win32',
      execFileImpl() { invalidTargetCalls += 1; },
      killProcessGroupImpl() { invalidTargetCalls += 1; },
    }),
    /positive|PID|integer/i,
    'invalid PID is rejected before any platform terminator can run',
  );
  assert.equal(invalidTargetCalls, 0);
}

function testEvidenceEnvelopeAndPublicationReadiness() {
  const evidence = validElectronEvidence();
  assert.equal(validateElectronEvidenceEnvelope(evidence).pass, true,
    'exact electron/electron public-input evidence envelope passes with the real CSS viewport');

  for (const viewport of [{ width: 1279, height: 720 }, { width: 1280, height: 719 }]) {
    assert.equal(validateElectronEvidenceEnvelope({ ...evidence, viewport }).pass, false,
      `CSS viewport ${viewport.width}x${viewport.height} is below the common player floor`);
  }

  const mismatch = validateElectronEvidenceEnvelope({
    ...evidence,
    captureKind: 'browser',
    runtime: { kind: 'electron', gpu: 'Intel hardware GPU' },
  });
  assert.equal(mismatch.pass, false, 'browser/electron capture mismatch rejects evidence');

  const base = {
    routeResult: { pass: true },
    urlAcceptance: { pass: true },
    processHealth: { pass: true },
    cleanup: { pass: true },
    pageErrors: [],
    pageIssueCoverage: validPageIssueCoverage(),
    viewportFloorAssessment: assessElectronViewportFloor(realElectronRuntimeMetadata()),
    screenshotDimensionAssessment: assessElectronScreenshotDimensions([
      { name: '01-main-menu.png', width: 1833, height: 974, bytes: 100_000 },
    ]),
    fingerprints: {
      start: { digest: 'same' },
      afterRoute: { digest: 'same' },
      afterCleanup: { digest: 'same' },
    },
    evidenceValidation: { pass: true },
  };
  assert.equal(evaluateElectronPublicationReadiness(base).pass, true,
    'all live boundaries permit accepted publication');

  const drift = evaluateElectronPublicationReadiness({
    ...base,
    fingerprints: { ...base.fingerprints, afterRoute: { digest: 'changed' } },
  });
  assert.equal(drift.pass, false, 'worktree drift rejects publication');

  const pageError = evaluateElectronPublicationReadiness({
    ...base,
    pageErrors: [{ source: 'request', level: 'error', text: 'ERR_ABORTED' }],
  });
  assert.equal(pageError.pass, false, 'page/request failure rejects publication');

  const missingIssueCoverage = evaluateElectronPublicationReadiness({ ...base, pageIssueCoverage: null });
  assert.equal(missingIssueCoverage.pass, false,
    'accepted publication requires proof that pre-window and retained page issue boundaries were observed');

  for (const missingAssessment of ['viewportFloorAssessment', 'screenshotDimensionAssessment']) {
    const missing = evaluateElectronPublicationReadiness({ ...base, [missingAssessment]: null });
    assert.equal(missing.pass, false, `publication cannot pass without ${missingAssessment}`);
  }
  assert.equal(evaluateElectronPublicationReadiness({
    ...base,
    viewportFloorAssessment: assessElectronViewportFloor({
      ...realElectronRuntimeMetadata(),
      viewport: { width: 1279, height: 720 },
    }),
  }).pass, false, 'a passing route cannot publish below the CSS viewport floor');
  assert.equal(evaluateElectronPublicationReadiness({
    ...base,
    screenshotDimensionAssessment: assessElectronScreenshotDimensions([
      { name: 'too-short.png', width: 1440, height: 899, bytes: 100_000 },
    ]),
  }).pass, false, 'a passing route cannot publish below the physical PNG floor');

  const premature = evaluateElectronPublicationReadiness({ ...base, cleanup: { pass: false } });
  assert.equal(premature.pass, false, 'accepted evidence cannot publish before cleanup passes');
}

function testSeparateViewportAndScreenshotFloors() {
  const realViewport = assessElectronViewportFloor(realElectronRuntimeMetadata());
  assert.equal(realViewport.pass, true,
    '1466x779 CSS at DPR 1.25 passes the common 1280x720 player floor without resizing');
  assert.deepEqual(realViewport.cssViewport, { width: 1466, height: 779 });
  assert.equal(realViewport.deviceScaleFactor, 1.25);
  assert.deepEqual(realViewport.outerWindow, { width: 1536, height: 816 });
  assert.deepEqual(realViewport.screen, { width: 1536, height: 816 });
  assert.equal(assessElectronViewportFloor({ viewport: { width: 1466, height: 779 } }).pass, false,
    'CSS size alone cannot pass without outer-window, screen, and DPR telemetry');

  for (const viewport of [{ width: 1279, height: 720 }, { width: 1280, height: 719 }]) {
    const assessment = assessElectronViewportFloor({
      ...realElectronRuntimeMetadata(),
      viewport,
    });
    assert.equal(assessment.pass, false, `${viewport.width}x${viewport.height} CSS fails independently`);
  }

  const realPng = assessElectronScreenshotDimensions([
    { name: 'real-default-window.png', width: 1833, height: 974, bytes: 100_000 },
  ]);
  assert.equal(realPng.pass, true, '1833x974 physical PNG passes the 1440x900 evidence floor');
  for (const screenshot of [
    { name: 'too-narrow.png', width: 1439, height: 900, bytes: 100_000 },
    { name: 'too-short.png', width: 1440, height: 899, bytes: 100_000 },
  ]) {
    assert.equal(assessElectronScreenshotDimensions([screenshot]).pass, false,
      `${screenshot.width}x${screenshot.height} physical PNG fails independently`);
  }
}

function realElectronRuntimeMetadata() {
  return {
    viewport: { width: 1466, height: 779 },
    window: { outerWidth: 1536, outerHeight: 816 },
    screen: { width: 1536, height: 816 },
    deviceScaleFactor: 1.25,
  };
}

function validPageIssueCoverage() {
  return {
    schema: 'spaceface.electronApplicationIssueCoverage.v1',
    contextAvailable: true,
    applicationEvents: ['window', 'console'],
    contextEvents: ['page', 'console', 'weberror', 'requestfailed', 'response'],
    pageEvents: ['console', 'pageerror', 'crash', 'requestfailed', 'response'],
    backfill: {
      consoleMessages: { supported: true, attempted: true, completed: true, errors: [] },
      pageErrors: { supported: true, attempted: true, completed: true, errors: [] },
      requests: { supported: true, attempted: true, completed: true, errors: [] },
    },
  };
}

async function testGuardedLatePublicationFailures() {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'spaceface-electron-publish-'));
  try {
    await exerciseFailureAt('prewrite', async () => {
      throw new Error('prewrite assertion failed');
    });

    await exerciseFailureAt('postwrite', async ({ stagingRoot }) => {
      await writeFile(path.join(stagingRoot, 'electron-runtime-telemetry.json'), '{"pass":true}\n');
      await writeFile(path.join(stagingRoot, 'evidence.json'), '{"primaryAcceptance":true}\n');
      throw new Error('late evidence validation failed');
    });

    const promotionRoot = path.join(sandbox, 'promotion');
    const alphaRoot = path.join(promotionRoot, 'alpha');
    const historyRoot = path.join(promotionRoot, 'history');
    const stagingRoot = path.join(alphaRoot, '.tmp-m0-live-baseline-electron-promotion');
    const acceptedRoot = path.join(alphaRoot, 'm0-live-baseline-electron');
    const failureRoot = path.join(alphaRoot, 'm0-live-baseline-electron-failure-promotion');
    await mkdir(stagingRoot, { recursive: true });
    await mkdir(acceptedRoot, { recursive: true });
    await writeFile(path.join(acceptedRoot, 'prior.txt'), 'prior accepted packet\n');
    await writeFile(path.join(stagingRoot, 'evidence.json'), '{"primaryAcceptance":true}\n');
    await writeFile(path.join(stagingRoot, 'process-telemetry.json'), '{"pass":true}\n');
    let renameCount = 0;
    const promotionOutcome = await runGuardedElectronPublication({
      acceptedPhase: () => publishAcceptedArtifacts({
        alphaRoot,
        historyRoot,
        stagingRoot,
        acceptedRoot,
        renameImpl: async (from, to) => {
          renameCount += 1;
          if (renameCount === 2) throw new Error('injected staging promotion failure');
          return rename(from, to);
        },
      }),
      failurePhase: (error) => routeTestPublicationFailure({ stagingRoot, failureRoot, error }),
    });
    assert.equal(promotionOutcome.pass, false, 'promotion failure is caught by the guarded publication seam');
    assert.equal(await readFile(path.join(acceptedRoot, 'prior.txt'), 'utf8'), 'prior accepted packet\n',
      'shared publisher rollback restores the prior accepted packet');
    assert.equal(existsSync(path.join(acceptedRoot, 'evidence.json')), false,
      'failed promotion never replaces the accepted packet with a new evidence claim');
    assert.equal(existsSync(path.join(failureRoot, 'evidence.json')), false,
      'routed failure packet does not retain the primary evidence filename');
    assert.equal(existsSync(path.join(failureRoot, 'rejected-primary-evidence.json')), true,
      'staged primary evidence is retained only under an explicitly rejected filename');
    assert.deepEqual((await readdir(alphaRoot)).filter((name) => name.startsWith('.tmp-')), [],
      'promotion failure leaves no temporary staging directory');

    async function exerciseFailureAt(label, acceptedPhase) {
      const caseRoot = path.join(sandbox, label);
      const alphaRoot = path.join(caseRoot, 'alpha');
      const stagingRoot = path.join(alphaRoot, `.tmp-m0-live-baseline-electron-${label}`);
      const acceptedRoot = path.join(alphaRoot, 'm0-live-baseline-electron');
      const failureRoot = path.join(alphaRoot, `m0-live-baseline-electron-failure-${label}`);
      await mkdir(stagingRoot, { recursive: true });
      const outcome = await runGuardedElectronPublication({
        acceptedPhase: () => acceptedPhase({ stagingRoot, acceptedRoot }),
        failurePhase: (error) => routeTestPublicationFailure({ stagingRoot, failureRoot, error }),
      });
      assert.equal(outcome.pass, false, `${label} failure is returned as a rejected publication`);
      assert.equal(existsSync(acceptedRoot), false, `${label} failure creates no accepted directory`);
      assert.equal(existsSync(path.join(failureRoot, 'failure-report.json')), true,
        `${label} failure creates a structured failure packet`);
      assert.equal(existsSync(path.join(failureRoot, 'evidence.json')), false,
        `${label} failure cannot leave an accepted evidence filename in the failure packet`);
      assert.deepEqual((await readdir(alphaRoot)).filter((name) => name.startsWith('.tmp-')), [],
        `${label} failure routes staging atomically instead of leaving a temporary directory`);
    }
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

async function routeTestPublicationFailure({ stagingRoot, failureRoot, error }) {
  const stagedEvidence = path.join(stagingRoot, 'evidence.json');
  if (existsSync(stagedEvidence)) {
    await rename(stagedEvidence, path.join(stagingRoot, 'rejected-primary-evidence.json'));
  }
  await writeFile(path.join(stagingRoot, 'failure-report.json'), `${JSON.stringify({
    pass: false,
    primaryAcceptance: false,
    error: { name: error.name, message: error.message },
  }, null, 2)}\n`);
  await rename(stagingRoot, failureRoot);
  return { failureRoot };
}

function cleanupFixture({
  closeProcess = true,
  emitClose = true,
  afterExit = null,
} = {}) {
  const page = new FakePage(CANONICAL);
  const childProcess = fakeChildProcess();
  const electronApp = new EventEmitter();
  electronApp.process = () => childProcess;
  electronApp.close = async () => {
    page.closed = true;
    electronApp.emit('close');
    if (closeProcess) {
      childProcess.exitCode = 0;
      childProcess.emit('exit', 0, null);
      afterExit?.(childProcess);
      if (emitClose) childProcess.emit('close', 0, null);
    }
  };
  const canonicalUrlTracker = createElectronCanonicalUrlTracker(page, { pollIntervalMs: 2, bootstrapTimeoutMs: 60 });
  const processMonitor = createElectronProcessMonitor({ electronApp, childProcess });
  return {
    resources: { page, electronApp, childProcess, canonicalUrlTracker, processMonitor, rootUrl: CANONICAL },
  };
}

function validElectronEvidence() {
  return {
    schema: 'spaceface.alphaEvidence.v1',
    taskId: 'm0-live-baseline-electron',
    worktreeId: 'master@12345678+dirty#abcdef123456',
    route: `${CANONICAL} public Electron route`,
    viewport: { width: 1466, height: 779 },
    runtime: { kind: 'electron', gpu: 'Google Inc. (Intel) / ANGLE Intel hardware' },
    captureKind: 'electron',
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: true,
    checks: [{ name: 'public route', status: 'pass' }],
    artifacts: [{ kind: 'screenshot', path: '.devshots/alpha/m0-live-baseline-electron/01-main-menu.png' }],
    notes: ['No injected gameplay state.'],
  };
}

function fakeConsoleMessage(type, text) {
  return { type: () => type, text: () => text };
}

function fakeChildProcess({ stdoutBuffered = [], stderrBuffered = [] } = {}) {
  const child = new EventEmitter();
  child.pid = 12345;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new BufferedFakeStream(stdoutBuffered);
  child.stderr = new BufferedFakeStream(stderrBuffered);
  return child;
}

class BufferedFakeStream extends EventEmitter {
  constructor(chunks = []) {
    super();
    this.chunks = chunks.slice();
  }

  get readableLength() {
    return this.chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk), 0);
  }

  read() {
    return this.chunks.shift() || null;
  }
}

class FakePage extends EventEmitter {
  constructor(url) {
    super();
    this.currentUrl = url;
    this.closed = false;
    this.frame = {};
  }

  url() { return this.currentUrl; }
  mainFrame() { return this.frame; }
  isClosed() { return this.closed; }
  replaceUrl(url) { this.currentUrl = url; }
  navigate(url) {
    this.currentUrl = url;
    this.emit('framenavigated', this.frame);
  }
}

class HistoryFakePage extends FakePage {
  constructor(url, histories = {}) {
    super(url);
    this.histories = histories;
  }

  async consoleMessages() { return this.histories.consoleMessages || []; }
  async pageErrors() { return this.histories.pageErrors || []; }
  async requests() { return this.histories.requests || []; }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await testStrictPageIssueTracker();
await testApplicationWideIssueTrackerAndBackfill();
await testElectronUrlLifecycle();
await testProcessMonitorAndCrashRejection();
await testOwnedElectronCleanup();
await testPlatformAwareOwnedTreeTermination();
testSeparateViewportAndScreenshotFloors();
testEvidenceEnvelopeAndPublicationReadiness();
await testGuardedLatePublicationFailures();

console.log('PASS alpha live Electron baseline contract: shared public route, crash rejection, owned teardown, atomic evidence');
