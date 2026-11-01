#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import launchProtocol from './lib/electronLaunchProtocol.cjs';
import {
  inspectPackagedStartup,
  resolvePackagedElectronLayout,
  resolvePackagedStartupReportPath,
} from './lib/electronPackagedStartup.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';
import { answerFirstRunPrompt, installFirstLightPromptHandler } from './player-truth/routes.mjs';

const { parseLaunchReceipts } = launchProtocol;
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OPTIONS = parsePackagedStartupArgs(process.argv.slice(2));
if (OPTIONS.help) {
  console.log('Usage: node scripts/check-electron-packaged-startup.mjs [--public-recovery]');
  console.log('  --public-recovery  add public F5/F9, forced WebGL restore, and a 120-second flight tail');
  process.exit(0);
}
const REPORT_PATH = resolvePackagedStartupReportPath({
  root: ROOT,
  requested: process.env.SF_PACKAGED_STARTUP_REPORT_PATH || null,
});
const REPORT_DIR = path.dirname(REPORT_PATH);
const STARTUP_TIMEOUT_MS = Number(process.env.SF_PACKAGED_STARTUP_TIMEOUT_MS) || 90_000;
const PACKAGED_F9_LOAD_OBSERVATION_MS = 300_000;
assert(Number.isInteger(STARTUP_TIMEOUT_MS) && STARTUP_TIMEOUT_MS >= 5_000,
  'SF_PACKAGED_STARTUP_TIMEOUT_MS must be an integer of at least 5000ms');

const layout = resolvePackagedElectronLayout({ root: ROOT });
assert.deepEqual(layout.failures, [], layout.failures.join('; '));
const artifactIdentity = await fingerprintPackage(layout);
mkdirSync(REPORT_DIR, { recursive: true });

const { _electron: electron } = await loadPlaywright();
let isolatedLaunch = null;
let app = null;
let page = null;
let childProcess = null;
let processMonitor = null;
let canonicalUrlTracker = null;
let pageIssues = null;
let rootUrl = null;
let receiptPath = null;
let mainIdentity = null;
let pageSnapshot = null;
let failureSnapshot = null;
let assessment = null;
let cleanup = null;
let primaryError = null;
let timing = null;
let flightScreenshotPath = null;
let flightInitialScreenshotPath = null;
let keyboardMovementWitness = null;
let releaseBuildReceipt = null;
let publicRecovery = null;

try {
  isolatedLaunch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'packaged-startup', timeout: STARTUP_TIMEOUT_MS });
  receiptPath = path.join(isolatedLaunch.userDataDir, 'launch-receipts.jsonl');
  const launchEnv = {
    ...isolatedLaunch.options.env,
    SPACEFACE_LAUNCH_RECEIPT: receiptPath,
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  delete launchEnv.ELECTRON_OVERRIDE_DIST_PATH;

  // PQ-033.02 boot floor: player-visible packaged boot = process launch -> main menu.
  const launchAt = Date.now();
  app = await electron.launch({
    ...isolatedLaunch.options,
    args: [],
    cwd: layout.unpackRoot,
    env: launchEnv,
    executablePath: layout.executablePath,
  });
  childProcess = app.process();
  processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });

  page = await app.firstWindow({ timeout: STARTUP_TIMEOUT_MS });
  installCspSafePlaywrightPolling(page);
  await installFirstLightPromptHandler(page);
  pageIssues = collectPageIssues(page, { ignoreProbeWarnings: true, includeWarnings: true });
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(10_000));
  await page.waitForLoadState('domcontentloaded', { timeout: STARTUP_TIMEOUT_MS });
  releaseBuildReceipt = await readPackagedBuildReceipt(page);
  artifactIdentity.releaseBuildReceipt = {
    url: `${rootUrl}spaceface-release-build.json`,
    status: releaseBuildReceipt.status,
    bytes: Buffer.byteLength(releaseBuildReceipt.raw, 'utf8'),
    sha256: createHash('sha256').update(releaseBuildReceipt.raw).digest('hex'),
    schema: releaseBuildReceipt.value.schema || null,
    entrypoint: releaseBuildReceipt.value.entrypoint || null,
    output: {
      digest: releaseBuildReceipt.value.output?.digest || null,
      fileCount: releaseBuildReceipt.value.output?.fileCount ?? null,
      bytes: releaseBuildReceipt.value.output?.bytes ?? null,
    },
  };
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 });
  }
  await answerFirstRunPrompt(page);
  const newGame = page.getByRole('button', { name: 'New Game', exact: true });
  await newGame.waitFor({ state: 'visible', timeout: STARTUP_TIMEOUT_MS });
  timing = { launchAt: new Date(launchAt).toISOString(), menuVisibleAt: new Date().toISOString(), bootToMenuMs: Date.now() - launchAt };
  // The wall clock wraps Playwright's electron.launch machinery (driver install,
  // firstWindow connect) — harness time, not game boot. The launch receipt's first
  // line is stamped inside the spawned main process: that is the closest honest
  // anchor to a player double-clicking the executable.
  const menuVisibleMs = Date.parse(timing.menuVisibleAt);
  const menuTitle = await page.title();
  const newGameVisibleBeforeLaunch = await newGame.isVisible();
  await newGame.click({ timeout: 30_000 });
  const launch = page.getByRole('button', { name: 'Launch', exact: true });
  await launch.waitFor({ state: 'visible', timeout: 30_000 });
  await launch.click({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const hud = document.getElementById('hud');
    const screens = document.getElementById('screens');
    const canvas = document.getElementById('gl-canvas');
    const loading = document.getElementById('boot-overlay');
    const visibleTransition = Array.from(document.querySelectorAll(
      '.sf-firstrun-splash.open, .sf-ng-warmup.open',
    )).some((element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity) > 0.01 && element.getClientRects().length > 0;
    });
    const canvasRect = canvas?.getBoundingClientRect();
    const hudReady = !!hud && hud.getAttribute('aria-hidden') !== 'true' && hud.inert !== true;
    const screensClosed = !!screens && screens.getAttribute('aria-hidden') === 'true'
      && getComputedStyle(screens).display === 'none';
    const canvasReady = !!canvasRect && canvasRect.width > 100 && canvasRect.height > 100
      && getComputedStyle(canvas).visibility !== 'hidden';
    const loadingHidden = !loading || loading.classList.contains('hidden')
      || getComputedStyle(loading).display === 'none';
    return hudReady && screensClosed && canvasReady && loadingHidden && !visibleTransition
      && !document.body.classList.contains('ui-modal-open');
  }, null, { timeout: STARTUP_TIMEOUT_MS });

  mainIdentity = await app.evaluate(({ app: electronApp }) => ({
    packaged: electronApp.isPackaged === true,
    executablePath: electronApp.getPath('exe'),
    resourcesPath: process.resourcesPath,
    userDataPath: electronApp.getPath('userData'),
    appPath: electronApp.getAppPath(),
    versions: { ...process.versions },
  }));
  // A stale unpacked executable can satisfy path/isPackaged checks; bind its runtime too.
  const expectedElectronVersion = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    .devDependencies?.electron;
  assert(typeof expectedElectronVersion === 'string' && /^\d+\.\d+\.\d+$/.test(expectedElectronVersion),
    'packaged startup requires an exact Electron version in candidate package.json');
  assert.equal(mainIdentity.versions?.electron, expectedElectronVersion,
    'packaged Electron runtime must match the candidate package.json target');
  pageSnapshot = await page.evaluate(({ expectedRoot, newGameWasVisible, menuTitle }) => {
    const storageKey = '__spaceface_packaged_startup_probe__';
    let storageRoundTrip = false;
    try {
      localStorage.setItem(storageKey, 'ready');
      storageRoundTrip = localStorage.getItem(storageKey) === 'ready';
      localStorage.removeItem(storageKey);
    } catch { storageRoundTrip = false; }
    const visibleText = Array.from(document.querySelectorAll('.sf-toast, .toast, .sf-alert, [role="alert"]'))
      .filter((element) => {
        const style = getComputedStyle(element);
        return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity) > 0.01;
      })
      .map((element) => element.textContent || '')
      .join(' | ');
    const hud = document.getElementById('hud');
    const screens = document.getElementById('screens');
    const canvas = document.getElementById('gl-canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    const hudReady = !!hud && hud.getAttribute('aria-hidden') !== 'true' && hud.inert !== true;
    const screensClosed = !!screens && screens.getAttribute('aria-hidden') === 'true'
      && getComputedStyle(screens).display === 'none';
    const canvasReady = !!canvasRect && canvasRect.width > 100 && canvasRect.height > 100
      && getComputedStyle(canvas).visibility !== 'hidden';
    return {
      title: menuTitle,
      flightTitle: document.title,
      rootUrl: location.href,
      newGameVisibleBeforeLaunch: newGameWasVisible,
      defaultRouteReady: hudReady && screensClosed && canvasReady && !document.body.classList.contains('ui-modal-open'),
      assetFailureVisible: /Game assets failed to load/i.test(visibleText),
      storageRoundTrip,
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
      sharedArrayBufferAvailable: typeof SharedArrayBuffer === 'function',
      ctxSimLane: typeof window.SF?.ctx?.simLane === 'string' ? window.SF.ctx.simLane : null,
      sfDebugSurfaceAvailable: typeof window.SF !== 'undefined',
      scriptPaths: Array.from(document.scripts).map((script) => script.src).filter(Boolean),
      userAgent: navigator.userAgent,
      expectedRoot,
    };
  }, { expectedRoot: rootUrl, newGameWasVisible: newGameVisibleBeforeLaunch, menuTitle });

  pageSnapshot.activeWorkerUrls = page.workers().map((worker) => worker.url());
  const wholeSimWorkerActive = pageSnapshot.activeWorkerUrls.some((url) => /wholeSimBrowserWorker/i.test(url));
  const simLaneWarnings = pageIssues.warningIssues()
    .filter((issue) => /^\[simLane\]/i.test(issue.text || ''))
    .map((issue) => String(issue.text).slice(0, 500));
  pageSnapshot.simLane = pageSnapshot.ctxSimLane || (wholeSimWorkerActive ? 'worker' : null);
  pageSnapshot.simLaneEvidence = pageSnapshot.ctxSimLane
    ? 'SF.ctx.simLane'
    : wholeSimWorkerActive ? 'active whole-simulation worker URL' : null;
  pageSnapshot.simLaneFallbackReason = pageSnapshot.ctxSimLane === 'main'
    ? simLaneWarnings.find((message) => /worker boot failed/i.test(message)) || 'SF.ctx reports main lane without a worker-boot warning'
    : simLaneWarnings.find((message) => /worker boot failed/i.test(message)) || null;
  pageSnapshot.simLaneWarnings = simLaneWarnings;

  // Pair one real flight frame with an ordinary forward-key hold. The report
  // keeps the input and screenshots distinct so visual inspection is not
  // mistaken for an internal movement-state assertion.
  flightInitialScreenshotPath = `${REPORT_PATH}.flight-before-forward.png`;
  await page.screenshot({ path: flightInitialScreenshotPath });
  const initialMovementPulse = await runBoundedPackagedKeyPulse(page, 'w');
  keyboardMovementWitness = {
    key: 'w',
    binding: 'KeyW (default forward flight binding)',
    heldMs: initialMovementPulse.heldMs,
    inputDispatched: initialMovementPulse.inputDispatched,
  };
  flightScreenshotPath = `${REPORT_PATH}.flight-after-forward.png`;
  await page.screenshot({ path: flightScreenshotPath });
  pageSnapshot.flightScreenshotStage = {
    capturedAt: new Date().toISOString(),
    title: pageSnapshot.flightTitle,
    simLane: pageSnapshot.simLane,
    movementInput: keyboardMovementWitness,
  };

  if (OPTIONS.publicRecovery) {
    try { publicRecovery = await runPackagedPublicRecovery(page, REPORT_PATH); }
    catch (error) { publicRecovery = error?.publicRecovery || null; throw error; }
  }

  const parsed = parseLaunchReceipts(readFileSync(receiptPath, 'utf8'));
  assert.equal(parsed.malformedLineCount, 0, 'packaged launch receipt must be valid JSONL');
  const startingReceipt = parsed.receipts.find((r) => r && r.status === 'starting' && r.at);
  const processStartMs = startingReceipt ? Date.parse(startingReceipt.at) : NaN;
  if (timing && Number.isFinite(processStartMs) && Number.isFinite(menuVisibleMs)) {
    timing.processStartAt = startingReceipt.at;
    timing.processStartToMenuMs = menuVisibleMs - processStartMs;
    timing.harnessOverheadMs = Math.max(0, processStartMs - Date.parse(timing.launchAt));
  }
  const errors = pageIssues.errorIssues();
  const expectedCspBlocks = errors.filter(isExpectedCspBlock);
  const hardErrors = errors.filter((issue) => !isExpectedCspBlock(issue));
  pageSnapshot.hardErrorCount = hardErrors.length;
  assessment = inspectPackagedStartup({
    layout,
    rootUrl,
    userDataDir: isolatedLaunch.userDataDir,
    receipts: parsed.receipts,
    mainIdentity,
    page: pageSnapshot,
  });
  if (pageSnapshot.simLane !== 'worker') {
    assessment.failures.push(`packaged default worker lane was not observed: ${JSON.stringify({
      crossOriginIsolated: pageSnapshot.crossOriginIsolated,
      sharedArrayBufferAvailable: pageSnapshot.sharedArrayBufferAvailable,
      ctxSimLane: pageSnapshot.ctxSimLane,
      activeWorkerUrls: pageSnapshot.activeWorkerUrls,
      fallbackReason: pageSnapshot.simLaneFallbackReason,
      warnings: simLaneWarnings,
    })}`);
  }
  if (pageSnapshot.sfDebugSurfaceAvailable !== false) {
    assessment.failures.push('packaged route exposed the stripped window.SF debug surface');
  }
  if (publicRecovery) {
    const recoveryAssessment = assessPackagedPublicRecovery(publicRecovery);
    publicRecovery.assessment = recoveryAssessment;
    assessment.failures.push(...recoveryAssessment.failures.map((failure) => `public recovery: ${failure}`));
  }
  assessment.expectedCspBlockCount = expectedCspBlocks.length;
  if (hardErrors.length) assessment.failures.push(`page errors: ${JSON.stringify(summarizeIssues(hardErrors))}`);
  const glWarnings = pageIssues.warningIssues()
    .filter((issue) => /\bGL_INVALID_[A-Z0-9_]+\b/i.test(String(issue.text || '')));
  if (glWarnings.length) {
    assessment.failures.push(`WebGL invalid-operation warnings: ${JSON.stringify(summarizeIssues(glWarnings))}`);
  }
  assessment.pass = assessment.failures.length === 0;
  assert.equal(assessment.pass, true, assessment.failures.join('; '));
} catch (error) {
  primaryError = error;
  if (page && !page.isClosed()) {
    failureSnapshot = await page.evaluate(() => {
      const describe = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          selector,
          ariaHidden: element.getAttribute('aria-hidden'),
          inert: element.inert === true,
          className: String(element.className || ''),
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          rect: { width: rect.width, height: rect.height },
        };
      };
      return {
        url: location.href,
        bodyClass: document.body.className,
        visibleText: document.body.innerText.slice(0, 2_000),
        surfaces: [
          describe('#hud'),
          describe('#screens'),
          describe('#gl-canvas'),
          describe('#boot-overlay'),
          describe('.sf-firstrun-splash.open'),
          describe('.sf-ng-warmup.open'),
        ],
        publicRecovery: (() => {
          const observation = window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__;
          return observation ? {
            lostEvent: observation.state?.lostEvent === true,
            restoredEvent: observation.state?.restoredEvent === true,
            lossDefaultPrevented: observation.state?.lossDefaultPrevented ?? null,
          } : null;
        })(),
      };
    }).catch((snapshotError) => ({ error: snapshotError?.message || String(snapshotError) }));
  }
} finally {
  if (app) {
    try {
      cleanup = await closeOwnedElectronRuntime({
        page,
        electronApp: app,
        childProcess,
        canonicalUrlTracker,
        processMonitor,
        rootUrl,
      });
      if (cleanup.pass !== true) {
        throw new Error(`owned packaged Electron cleanup failed: ${cleanup.failures.join('; ')}`);
      }
    } catch (error) {
      if (!primaryError) primaryError = error;
      else primaryError.cleanupError = error;
    }
  }
  if (isolatedLaunch && cleanup?.pass === true) {
    try { isolatedLaunch.cleanup({ runtimeClosed: true }); }
    catch (error) {
      if (!primaryError) primaryError = error;
      else primaryError.profileCleanupError = error;
    }
  }
}

const report = {
  schema: 'spaceface.electronPackagedStartup.v1',
  generatedAt: new Date().toISOString(),
  pass: !primaryError && assessment?.pass === true && cleanup?.pass === true,
  layout,
  artifactIdentity,
  releaseBuildReceipt: artifactIdentity.releaseBuildReceipt || null,
  rootUrl,
  mainIdentity,
  timing,
  page: pageSnapshot,
  flightInitialScreenshotPath: flightInitialScreenshotPath ? path.relative(ROOT, flightInitialScreenshotPath) : null,
  flightScreenshotPath: flightScreenshotPath ? path.relative(ROOT, flightScreenshotPath) : null,
  keyboardMovementWitness,
  publicRecovery,
  failureSnapshot,
  assessment,
  pageIssues: summarizeIssues(pageIssues?.issues || []),
  cleanup,
  failure: primaryError ? {
    name: primaryError.name || 'Error',
    message: primaryError.message || String(primaryError),
    cleanupError: primaryError.cleanupError?.message || null,
    profileCleanupError: primaryError.profileCleanupError?.message || null,
  } : null,
};
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (primaryError) throw primaryError;
console.log(JSON.stringify({
  pass: true,
  executablePath: layout.executablePath,
  resourcesPath: layout.resourcesPath,
  executableSha256: artifactIdentity.executable.sha256,
  appArchiveSha256: artifactIdentity.appArchive.sha256,
  rootUrl,
  packaged: mainIdentity.packaged,
  defaultRouteReady: pageSnapshot.defaultRouteReady,
  cleanup: cleanup.pass,
  report: path.relative(ROOT, REPORT_PATH),
}, null, 2));

function isExpectedCspBlock(issue) {
  return issue?.type === 'pageerror'
    && /Evaluating a string as JavaScript violates[^\n]*Content Security Policy/i.test(String(issue.text || ''))
    && /unsafe-eval[^\n]*not an allowed source of script/i.test(String(issue.text || ''));
}

export function parsePackagedStartupArgs(argv = []) {
  let publicRecovery = false;
  let help = false;
  for (const argument of argv) {
    if (argument === '--public-recovery') {
      if (publicRecovery) throw new Error('duplicate argument: --public-recovery');
      publicRecovery = true;
    } else if (argument === '--help' || argument === '-h') help = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
  return { publicRecovery, help };
}

export function assessPackagedPublicRecovery(recovery) {
  const failures = [];
  if (recovery?.enabled !== true) failures.push('optional public recovery did not run');
  if (!String(recovery?.save?.toast || '').includes('Saved Quick')) failures.push('public F5 save toast was not observed');
  if (recovery?.save?.quick?.changed !== true) failures.push('isolated quick-save bytes did not change after F5');
  if (!/^(Loaded|Restoring) Quick/.test(String(recovery?.load?.toast || ''))) failures.push('public F9 restore receipt was not observed');
  if (String(recovery?.load?.toast || '').startsWith('Restoring Quick') && recovery?.load?.loadingObserved !== true) failures.push('public F9 loading transition was not observed');
  if (recovery?.load?.flightSurface?.ready !== true) failures.push('flight HUD/canvas did not remain available after F9');
  if (recovery?.load?.flightSurface?.sfDebugSurfaceAbsent !== true) failures.push('window.SF was exposed after F9');
  if (recovery?.context?.extensionAvailable !== true) failures.push('WEBGL_lose_context was unavailable');
  if (recovery?.context?.lostEvent !== true) failures.push('WebGL context-loss event was not observed');
  if (recovery?.context?.restoredEvent !== true) failures.push('WebGL context-restore event was not observed');
  if (recovery?.context?.lostAfterRestore !== false) failures.push('WebGL context remained lost after restore');
  if (!String(recovery?.context?.recoveredToast || '').includes('Graphics recovered.')) failures.push('renderer recovery receipt was not observed');
  if (recovery?.context?.flightSurface?.ready !== true) failures.push('flight HUD/canvas was unavailable after context restore');
  if (recovery?.context?.flightSurface?.sfDebugSurfaceAbsent !== true) failures.push('window.SF was exposed after context restore');
  const tailDurationMs = Number(recovery?.tail?.durationMs);
  if (!Number.isFinite(tailDurationMs) || tailDurationMs < 120_000) {
    failures.push('ordinary-flight tail duration was missing, invalid, or shorter than 120 seconds');
  }
  if (recovery?.tail?.flightSurface?.ready !== true) failures.push('flight HUD/canvas did not remain available at tail end');
  if (recovery?.tail?.flightSurface?.sfDebugSurfaceAbsent !== true) failures.push('window.SF was exposed at tail end');
  if (recovery?.tail?.flightSurface?.documentVisible !== true) failures.push('packaged flight document was not visible at tail end');
  assessPackagedMovementWitness(recovery?.movementAfterRestore, 'after context restoration', failures);
  assessPackagedMovementWitness(recovery?.tail?.movement, 'after the 120-second tail', failures);
  return { pass: failures.length === 0, failures };
}

function assessPackagedMovementWitness(witness, label, failures) {
  if (witness?.inputDispatched !== true) failures.push(`public movement input was not dispatched ${label}`);
  if (witness?.hud?.visible !== true || witness?.hud?.response !== true) {
    failures.push(`visible speed HUD did not respond to public movement input ${label}`);
  }
  if (witness?.canvas?.visible !== true || witness?.canvas?.minimumDistinctColors < 2) {
    failures.push(`gameplay canvas was blank or unavailable ${label}`);
  }
  if (witness?.canvas?.changed !== true || !(witness?.canvas?.changedPixels > 0)) {
    failures.push(`gameplay canvas did not visibly change during public movement input ${label}`);
  }
}

async function readPackagedBuildReceipt(page) {
  const response = await page.evaluate(async () => {
    const result = await fetch('/spaceface-release-build.json', { cache: 'no-store' });
    return { status: result.status, raw: await result.text() };
  });
  assert.equal(response.status, 200, 'packaged release build receipt must be served from the live app root');
  let value;
  try { value = JSON.parse(response.raw); }
  catch (error) { throw new Error(`packaged release build receipt is not JSON: ${error.message}`); }
  assert.equal(value.schema, 'spaceface.releaseBuild.v2', 'packaged build receipt schema must be current');
  assert.equal(value.entrypoint, 'main.js', 'packaged build receipt must name retail main.js');
  assert.equal(value.output?.digest?.length, 64, 'packaged build receipt must include its output digest');
  assert.equal(value.productionDebug, false, 'packaged build receipt must not enable production debug');
  return { status: response.status, raw: response.raw, value };
}

async function runPackagedPublicRecovery(page, reportPath) {
  const startedAt = new Date().toISOString();
  let f9LongWaitTimer = null;
  let f9LongWaitSnapshot = Promise.resolve(null);
  let loadObservation = null;
  const recovery = {
    enabled: true,
    startedAt,
    tailRequestedMs: 120_000,
    save: null,
    load: null,
    context: null,
    tail: null,
    screenshots: {},
    movementAfterRestore: null,
    limits: [
      'F5/F9 are evidenced by public HUD receipts and isolated storage bytes, not internal save events or loaded simulation identity.',
      'Context recovery is evidenced by WebGL loss/restore events plus visible HUD/canvas readiness; renderer generations and simulation ticks are unavailable in the retail build.',
    ],
  };
  try {
    let surface = await readPackagedFlightSurface(page);
    assert.equal(surface.ready, true, 'packaged flight must be visibly ready before F5/F9');
    assert.equal(surface.sfDebugSurfaceAbsent, true, 'packaged route must keep window.SF stripped');
    recovery.screenshots.beforeSave = screenshotPath(reportPath, 'recovery-before-save');
    await page.screenshot({ path: recovery.screenshots.beforeSave });

    const before = await readPackagedSaveStorage(page);
    await page.keyboard.press('F5');
    const savedToast = await waitForPackagedToast(page, /Saved Quick/, 20_000);
    const afterSave = await readPackagedSaveStorage(page);
    recovery.save = {
      action: 'F5',
      toast: savedToast,
      quick: {
        before: before.quick,
        after: afterSave.quick,
        changed: afterSave.quick.present === true
          && (before.quick.present !== true || before.quick.fingerprint !== afterSave.quick.fingerprint),
      },
      index: afterSave.index,
      capturedAt: new Date().toISOString(),
    };
    recovery.screenshots.afterSave = screenshotPath(reportPath, 'recovery-after-save');
    await page.screenshot({ path: recovery.screenshots.afterSave });

    const loadStartedAt = Date.now();
    const loadDeadlineAt = loadStartedAt + PACKAGED_F9_LOAD_OBSERVATION_MS;
    recovery.load = {
      action: 'F9',
      observationWindowMs: PACKAGED_F9_LOAD_OBSERVATION_MS,
      startedAt: new Date(loadStartedAt).toISOString(),
      toast: null,
      flightSurface: null,
    };
    f9LongWaitTimer = setTimeout(() => {
      if (recovery.load?.completedAt) return;
      const requestedAt = new Date().toISOString();
      f9LongWaitSnapshot = readPackagedRetailLoadingSnapshot(page)
        .then((loading) => {
          recovery.load.loadingSnapshotAt25s = {
            requestedAt,
            capturedAt: new Date().toISOString(),
            loading,
          };
          return loading;
        })
        .catch((error) => {
          recovery.load.loadingSnapshotAt25s = {
            requestedAt,
            capturedAt: new Date().toISOString(),
            error: String(error?.message || error).slice(0, 300),
            loading: null,
          };
          return null;
        });
    }, 25_000);
    loadObservation = await armPackagedLoadObservation(page);
    await page.keyboard.press('F9');
    const observed = await waitForPackagedLoadObservation(loadObservation, loadDeadlineAt);
    await loadObservation.evaluate((observation) => observation.observer.disconnect());
    recovery.load.toast = observed.toast;
    recovery.load.loadingObserved = observed.loadingObserved;
    surface = await waitForPackagedFlightSurface(page, Math.max(1, loadDeadlineAt - Date.now()));
    recovery.load = {
      ...recovery.load,
      toast: observed.toast,
      flightSurface: surface,
      storage: await readPackagedSaveStorage(page),
      elapsedMs: Date.now() - loadStartedAt,
      capturedAt: new Date().toISOString(),
    };
    recovery.load.completedAt = new Date().toISOString();
    clearTimeout(f9LongWaitTimer);
    await f9LongWaitSnapshot;
    recovery.screenshots.afterLoad = screenshotPath(reportPath, 'recovery-after-load');
    await page.screenshot({ path: recovery.screenshots.afterLoad });

    const capability = await page.evaluate(() => {
      const canvas = document.getElementById('gl-canvas');
      if (!canvas) return { available: false, reason: 'packaged game canvas was absent' };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { available: false, reason: 'WebGL context unavailable' };
      const extension = gl.getExtension('WEBGL_lose_context');
      if (!extension) return { available: false, reason: 'WEBGL_lose_context extension unavailable' };
      const state = { lostEvent: false, restoredEvent: false, lossDefaultPrevented: null };
      const onLost = (event) => { state.lostEvent = true; state.lossDefaultPrevented = event.defaultPrevented; };
      const onRestored = () => { state.restoredEvent = true; };
      canvas.addEventListener('webglcontextlost', onLost);
      canvas.addEventListener('webglcontextrestored', onRestored);
      window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__ = { canvas, gl, extension, state, onLost, onRestored };
      return {
        available: true,
        contextType: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
          ? 'webgl2' : 'webgl',
      };
    });
    assert.equal(capability.available, true, capability.reason || 'context loss extension unavailable');
    recovery.context = { extensionAvailable: true, contextType: capability.contextType };
    await page.evaluate(() => window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__.extension.loseContext());
    await page.waitForFunction(() => window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__?.state.lostEvent === true,
      null, { timeout: 15_000 });
    await page.waitForTimeout(350);
    // The browser's restored event precedes the renderer's asynchronous GPU rebuild.
    // Observe the public completion receipt before requesting restoration so it cannot be missed.
    const recoveryDeadline = Date.now() + 60_000;
    const rendererRecovery = waitForPackagedToast(page, /Graphics recovered\./, 60_000)
      .then((toast) => ({ toast }), (error) => ({ error }));
    await page.evaluate(() => window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__.extension.restoreContext());
    await page.waitForFunction(() => {
      const observation = window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__;
      const hud = document.getElementById('hud');
      const screens = document.getElementById('screens');
      const canvas = document.getElementById('gl-canvas');
      const overlay = document.getElementById('boot-overlay');
      const rect = canvas?.getBoundingClientRect();
      const hudReady = !!hud && hud.getAttribute('aria-hidden') !== 'true' && hud.inert !== true;
      const screensClosed = !!screens && screens.getAttribute('aria-hidden') === 'true'
        && getComputedStyle(screens).display === 'none';
      const canvasReady = !!rect && rect.width > 100 && rect.height > 100
        && getComputedStyle(canvas).visibility !== 'hidden';
      const loadingHidden = !overlay || overlay.classList.contains('hidden')
        || getComputedStyle(overlay).display === 'none';
      return observation?.state.restoredEvent === true && observation.gl.isContextLost() === false
        && hudReady && screensClosed && canvasReady && loadingHidden
        && !document.body.classList.contains('ui-modal-open') && typeof window.SF === 'undefined';
    }, null, { timeout: Math.max(1, recoveryDeadline - Date.now()) });
    const rendererRecoveryResult = await rendererRecovery;
    if (rendererRecoveryResult.error) throw rendererRecoveryResult.error;
    recovery.context = {
      ...recovery.context,
      recoveredToast: rendererRecoveryResult.toast,
      ...await page.evaluate(() => ({
        lostEvent: window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__.state.lostEvent,
        restoredEvent: window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__.state.restoredEvent,
        lossDefaultPrevented: window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__.state.lossDefaultPrevented,
        lostAfterRestore: window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__.gl.isContextLost(),
      })),
      flightSurface: await readPackagedFlightSurface(page),
      capturedAt: new Date().toISOString(),
    };
    await page.evaluate(() => {
      const observation = window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__;
      if (observation) {
        observation.canvas.removeEventListener('webglcontextlost', observation.onLost);
        observation.canvas.removeEventListener('webglcontextrestored', observation.onRestored);
        delete window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__;
      }
    });
    recovery.screenshots.afterContextRestore = screenshotPath(reportPath, 'recovery-after-context-restore');
    await page.screenshot({ path: recovery.screenshots.afterContextRestore });
    recovery.movementAfterRestore = await capturePackagedMovementWitness(page, reportPath, 'after-context-restore');

    const tailStartedAt = Date.now();
    await page.waitForTimeout(120_000);
    const tailEndedAt = Date.now();
    recovery.tail = {
      durationMs: tailEndedAt - tailStartedAt,
      startedAt: new Date(tailStartedAt).toISOString(),
      endedAt: new Date(tailEndedAt).toISOString(),
      flightSurface: await readPackagedFlightSurface(page),
    };
    recovery.tail.movement = await capturePackagedMovementWitness(page, reportPath, 'after-120-second-tail');
    recovery.screenshots.after120SecondTail = screenshotPath(reportPath, 'recovery-after-120s-tail');
    await page.screenshot({ path: recovery.screenshots.after120SecondTail });
    recovery.completedAt = new Date().toISOString();
    return recovery;
  } catch (error) {
    if (recovery.load?.startedAt && !recovery.load.completedAt) {
      if (f9LongWaitTimer != null) clearTimeout(f9LongWaitTimer);
      await f9LongWaitSnapshot;
      const requestedAt = new Date().toISOString();
      try {
        recovery.load.failureLoadingSnapshot = {
          requestedAt,
          capturedAt: new Date().toISOString(),
          loading: await readPackagedRetailLoadingSnapshot(page),
        };
      } catch (snapshotError) {
        recovery.load.failureLoadingSnapshot = {
          requestedAt,
          capturedAt: new Date().toISOString(),
          error: String(snapshotError?.message || snapshotError).slice(0, 300),
          loading: null,
        };
      }
    }
    recovery.failure = { name: error?.name || 'Error', message: String(error?.message || error).slice(0, 700) };
    try { error.publicRecovery = recovery; } catch (_) { /* preserve original error */ }
    throw error;
  } finally {
    if (loadObservation) {
      await loadObservation.evaluate((observation) => observation.observer.disconnect()).catch(() => {});
      await loadObservation.dispose().catch(() => {});
    }
    await page.evaluate(() => {
      const observation = window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__;
      if (observation) {
        observation.canvas.removeEventListener('webglcontextlost', observation.onLost);
        observation.canvas.removeEventListener('webglcontextrestored', observation.onRestored);
        delete window.__SPACEFACE_PACKAGED_PUBLIC_RECOVERY__;
      }
    }).catch(() => {});
  }
}

async function armPackagedLoadObservation(page) {
  return page.evaluateHandle(() => {
    const observation = { toast: null, loadingObserved: false, observer: null };
    const sample = () => {
      const overlay = document.querySelector('#boot-overlay');
      if (overlay && !overlay.classList.contains('hidden') && getComputedStyle(overlay).display !== 'none'
          && getComputedStyle(overlay).visibility !== 'hidden') observation.loadingObserved = true;
      for (const element of document.querySelectorAll('#toasts .sf-toast__text')) {
        const value = String(element.textContent || '').trim();
        if (/^(Restoring|Loaded) Quick/.test(value)) observation.toast = value;
      }
    };
    observation.observer = new MutationObserver(sample);
    observation.observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    return observation;
  });
}

async function waitForPackagedLoadObservation(handle, deadline) {
  while (Date.now() < deadline) {
    const observed = await handle.evaluate(({ toast, loadingObserved }) => ({ toast, loadingObserved }));
    if (observed.toast && (!observed.toast.startsWith('Restoring Quick') || observed.loadingObserved)) return observed;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('public F9 restore receipt and loading transition were not observed before the deadline');
}

async function readPackagedRetailLoadingSnapshot(page) {
  return page.evaluate(() => {
    const startup = window.__SF_STARTUP__;
    if (!startup || typeof startup.snapshot !== 'function') return null;
    const snapshot = startup.snapshot();
    return snapshot && typeof snapshot === 'object' ? snapshot.loading ?? null : null;
  });
}

async function readPackagedFlightSurface(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
    };
    const hud = document.getElementById('hud');
    const screens = document.getElementById('screens');
    const canvas = document.getElementById('gl-canvas');
    const overlay = document.getElementById('boot-overlay');
    const rect = canvas?.getBoundingClientRect();
    return {
      ready: !!hud && visible(hud) && hud.getAttribute('aria-hidden') !== 'true' && hud.inert !== true
        && !!screens && screens.getAttribute('aria-hidden') === 'true' && getComputedStyle(screens).display === 'none'
        && !!rect && rect.width > 100 && rect.height > 100 && visible(canvas)
        && (!overlay || overlay.classList.contains('hidden') || getComputedStyle(overlay).display === 'none')
        && !document.body.classList.contains('ui-modal-open'),
      documentVisible: document.visibilityState === 'visible',
      sfDebugSurfaceAbsent: typeof window.SF === 'undefined',
      hudVisible: visible(hud),
      screensClosed: !!screens && screens.getAttribute('aria-hidden') === 'true' && getComputedStyle(screens).display === 'none',
      canvasRect: rect ? { width: rect.width, height: rect.height } : null,
      loadingOverlayHidden: !overlay || overlay.classList.contains('hidden') || getComputedStyle(overlay).display === 'none',
      modalOpen: document.body.classList.contains('ui-modal-open'),
      visibleToasts: Array.from(document.querySelectorAll('#toasts .sf-toast__text'))
        .filter(visible).map((element) => String(element.textContent || '').slice(0, 180)).slice(0, 6),
    };
  });
}

async function waitForPackagedFlightSurface(page, timeoutMs) {
  await page.waitForFunction(() => {
    const hud = document.getElementById('hud');
    const screens = document.getElementById('screens');
    const canvas = document.getElementById('gl-canvas');
    const overlay = document.getElementById('boot-overlay');
    const rect = canvas?.getBoundingClientRect();
    const hudReady = !!hud && hud.getAttribute('aria-hidden') !== 'true' && hud.inert !== true
      && getComputedStyle(hud).display !== 'none' && getComputedStyle(hud).visibility !== 'hidden';
    const screensClosed = !!screens && screens.getAttribute('aria-hidden') === 'true'
      && getComputedStyle(screens).display === 'none';
    const canvasReady = !!rect && rect.width > 100 && rect.height > 100
      && getComputedStyle(canvas).visibility !== 'hidden';
    const loadingHidden = !overlay || overlay.classList.contains('hidden') || getComputedStyle(overlay).display === 'none';
    return hudReady && screensClosed && canvasReady && loadingHidden
      && !document.body.classList.contains('ui-modal-open') && typeof window.SF === 'undefined';
  }, null, { timeout: timeoutMs });
  return readPackagedFlightSurface(page);
}

async function waitForPackagedToast(page, expected, timeoutMs) {
  const patternSource = expected.source;
  await page.waitForFunction((source) => Array.from(document.querySelectorAll('#toasts .sf-toast__text')).some((element) => {
    const pattern = new RegExp(source);
    const toast = element.closest('.sf-toast');
    const style = toast && getComputedStyle(toast);
    const rect = toast?.getBoundingClientRect();
    return !!toast && !toast.hidden && style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0
      && pattern.test(String(element.textContent || ''));
  }), patternSource, { timeout: timeoutMs });
  return page.evaluate((source) => Array.from(document.querySelectorAll('#toasts .sf-toast__text')).map((element) => {
    const pattern = new RegExp(source);
    const toast = element.closest('.sf-toast');
    const style = toast && getComputedStyle(toast);
    const rect = toast?.getBoundingClientRect();
    return toast && !toast.hidden && style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0
      && pattern.test(String(element.textContent || '')) ? String(element.textContent || '').trim() : null;
  }).find(Boolean) || null, patternSource);
}

async function readPackagedSaveStorage(page) {
  return page.evaluate(() => {
    const fingerprint = (value) => {
      let hash = 0x811c9dc5;
      for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    };
    const observe = (key) => {
      const value = localStorage.getItem(key);
      return { present: value !== null, bytes: value === null ? 0 : new Blob([value]).size, fingerprint: value === null ? null : fingerprint(value) };
    };
    return {
      quick: observe('sf.save.quick'),
      index: observe('sf.save.index'),
      observedAt: new Date().toISOString(),
      sfDebugSurfaceAbsent: typeof window.SF === 'undefined',
    };
  });
}

async function capturePackagedMovementWitness(page, reportPath, stage) {
  const beforeHud = await readPackagedSpeedHud(page);
  assert.equal(beforeHud.visible, true, `visible speed HUD was unavailable ${stage}`);
  const numericSpeed = Number(beforeHud.value);
  assert.ok(Number.isFinite(numericSpeed), `visible speed HUD had no numeric value ${stage}`);
  const key = numericSpeed >= 1 ? 's' : 'w';
  const beforePath = screenshotPath(reportPath, `recovery-${stage}-canvas-before`);
  const afterPath = screenshotPath(reportPath, `recovery-${stage}-canvas-after`);
  const beforeBytes = await captureCanvasOnly(page, beforePath);
  const pulse = await runBoundedPackagedKeyPulse(page, key);
  const afterBytes = await captureCanvasOnly(page, afterPath);
  const afterHud = await readPackagedSpeedHud(page);
  const pixels = summarizePackagedCanvasChange(beforeBytes, afterBytes);
  return {
    key,
    binding: key === 'w' ? 'KeyW (default forward flight binding)' : 'KeyS (default reverse flight binding)',
    heldMs: pulse.heldMs,
    inputDispatched: pulse.inputDispatched,
    hud: {
      visible: beforeHud.visible && afterHud.visible,
      before: beforeHud,
      after: afterHud,
      response: Number.isFinite(Number(afterHud.value)) && Number(afterHud.value) !== numericSpeed,
    },
    canvas: {
      ...pixels,
      visible: true,
      captureMethod: 'canvas element screenshot while #ui-root opacity is temporarily forced to zero and restored in finally',
      beforePath,
      afterPath,
    },
  };
}

async function runBoundedPackagedKeyPulse(page, key, { holdMs = 1_000, holdCeilingMs = 4_000 } = {}) {
  let expired = false;
  let timeoutRelease = Promise.resolve();
  let deadlineTimer = null;
  let resolveDeadline;
  const deadlineReached = new Promise((resolve) => { resolveDeadline = resolve; });
  const releaseOnce = () => {
    const release = Promise.resolve().then(() => page.keyboard.up(key));
    release.catch(() => {});
    return release;
  };
  const releaseBounded = async (release) => {
    let timer = null;
    try {
      return await Promise.race([
        release.then(() => true, () => false),
        new Promise((resolve) => { timer = setTimeout(() => resolve(false), 500); }),
      ]);
    } finally {
      if (timer != null) clearTimeout(timer);
    }
  };
  const awaitBeforeDeadline = async (operation) => {
    const pending = Promise.resolve().then(operation);
    const result = await Promise.race([
      pending.then((value) => ({ completed: true, value }), (error) => ({ completed: true, error })),
      deadlineReached.then(() => ({ completed: false })),
    ]);
    if (!result.completed || expired) {
      await releaseBounded(timeoutRelease);
      throw new Error(`packaged flight input exceeded its ${holdCeilingMs}ms held-key ceiling`);
    }
    if (result.error) throw result.error;
    return result.value;
  };

  const startedAt = Date.now();
  let operationError = null;
  try {
    deadlineTimer = setTimeout(() => {
      expired = true;
      resolveDeadline();
      timeoutRelease = releaseOnce();
    }, holdCeilingMs);
    const down = Promise.resolve().then(() => page.keyboard.down(key));
    down.then(() => { if (expired) void releaseOnce().catch(() => {}); }, () => {});
    await awaitBeforeDeadline(() => down);
    await awaitBeforeDeadline(() => page.waitForTimeout(holdMs));
    return { heldMs: Date.now() - startedAt, inputDispatched: true };
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (deadlineTimer != null) clearTimeout(deadlineTimer);
    const releaseAcknowledged = await releaseBounded(releaseOnce());
    if (!releaseAcknowledged && !operationError) {
      throw new Error(`packaged flight input release was not acknowledged for ${key}`);
    }
  }
}

async function captureCanvasOnly(page, outputPath) {
  const visibility = await page.evaluate(() => {
    const root = document.getElementById('ui-root');
    if (!root) throw new Error('cannot isolate gameplay canvas pixels: #ui-root is absent');
    const style = root.style;
    const previous = {
      value: style.getPropertyValue('opacity'),
      priority: style.getPropertyPriority('opacity'),
    };
    style.setProperty('opacity', '0', 'important');
    return previous;
  });
  let screenshotError = null;
  try {
    return await page.locator('#gl-canvas').screenshot({ path: outputPath });
  } catch (error) {
    screenshotError = error;
    throw error;
  } finally {
    try {
      await page.evaluate((previous) => {
        const root = document.getElementById('ui-root');
        if (!root) throw new Error('#ui-root disappeared before canvas-only capture cleanup');
        if (previous.value) root.style.setProperty('opacity', previous.value, previous.priority);
        else root.style.removeProperty('opacity');
      }, visibility);
    } catch (restoreError) {
      if (!screenshotError) throw restoreError;
    }
  }
}

async function readPackagedSpeedHud(page) {
  return page.evaluate(() => {
    const meter = document.querySelector('#hud .orr-speeddial[role="meter"][aria-label="Speed"]');
    const numeral = meter?.querySelector('.orr-numeral');
    const style = meter && getComputedStyle(meter);
    const rect = meter?.getBoundingClientRect();
    return {
      visible: !!meter && !!numeral && !meter.hidden && style.display !== 'none'
        && style.visibility !== 'hidden' && Number(style.opacity) > 0.01
        && !!rect && rect.width > 0 && rect.height > 0,
      value: meter?.getAttribute('aria-valuenow') || null,
      text: String(numeral?.textContent || '').trim() || null,
    };
  });
}

function summarizePackagedCanvasChange(beforeBytes, afterBytes) {
  const before = PNG.sync.read(beforeBytes);
  const after = PNG.sync.read(afterBytes);
  assert.equal(after.width, before.width, 'gameplay canvas screenshot width changed during movement pulse');
  assert.equal(after.height, before.height, 'gameplay canvas screenshot height changed during movement pulse');
  const totalPixels = before.width * before.height;
  const beforeColors = new Set();
  const afterColors = new Set();
  let changedPixels = 0;
  let absoluteChannelDelta = 0;
  for (let offset = 0; offset < before.data.length; offset += 4) {
    const r0 = before.data[offset];
    const g0 = before.data[offset + 1];
    const b0 = before.data[offset + 2];
    const r1 = after.data[offset];
    const g1 = after.data[offset + 1];
    const b1 = after.data[offset + 2];
    if (Math.max(Math.abs(r1 - r0), Math.abs(g1 - g0), Math.abs(b1 - b0)) >= 8) changedPixels += 1;
    absoluteChannelDelta += Math.abs(r1 - r0) + Math.abs(g1 - g0) + Math.abs(b1 - b0);
    if (beforeColors.size < 32) beforeColors.add(`${r0 >> 4}:${g0 >> 4}:${b0 >> 4}`);
    if (afterColors.size < 32) afterColors.add(`${r1 >> 4}:${g1 >> 4}:${b1 >> 4}`);
  }
  return {
    width: before.width,
    height: before.height,
    totalPixels,
    changedPixels,
    changedFraction: totalPixels ? changedPixels / totalPixels : 0,
    meanAbsoluteChannelDelta: before.data.length ? absoluteChannelDelta / (totalPixels * 3) : 0,
    beforeColorCount: beforeColors.size,
    afterColorCount: afterColors.size,
    minimumDistinctColors: Math.min(beforeColors.size, afterColors.size),
    changed: changedPixels >= Math.max(32, Math.ceil(totalPixels * 0.0001)),
  };
}

function screenshotPath(reportPath, stage) {
  return `${reportPath}.${stage}.png`;
}

async function fingerprintPackage(packageLayout) {
  const fingerprint = async (filePath) => ({
    path: filePath,
    bytes: statSync(filePath).size,
    sha256: await sha256File(filePath),
  });
  return {
    schema: 'spaceface.electronPackageIdentity.v1',
    executable: await fingerprint(packageLayout.executablePath),
    appArchive: await fingerprint(packageLayout.appArchivePath),
  };
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
