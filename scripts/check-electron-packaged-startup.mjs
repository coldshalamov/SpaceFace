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

const { parseLaunchReceipts } = launchProtocol;
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPORT_PATH = resolvePackagedStartupReportPath({
  root: ROOT,
  requested: process.env.SF_PACKAGED_STARTUP_REPORT_PATH || null,
});
const REPORT_DIR = path.dirname(REPORT_PATH);
const STARTUP_TIMEOUT_MS = Number(process.env.SF_PACKAGED_STARTUP_TIMEOUT_MS) || 90_000;
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

try {
  isolatedLaunch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'packaged-startup', timeout: STARTUP_TIMEOUT_MS });
  receiptPath = path.join(isolatedLaunch.userDataDir, 'launch-receipts.jsonl');
  const launchEnv = {
    ...isolatedLaunch.options.env,
    SPACEFACE_LAUNCH_RECEIPT: receiptPath,
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  delete launchEnv.ELECTRON_OVERRIDE_DIST_PATH;

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
  pageIssues = collectPageIssues(page, { ignoreProbeWarnings: true });
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(10_000));

  await page.waitForLoadState('domcontentloaded', { timeout: STARTUP_TIMEOUT_MS });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 });
  }
  const newGame = page.getByRole('button', { name: 'New Game', exact: true });
  await newGame.waitFor({ state: 'visible', timeout: STARTUP_TIMEOUT_MS });
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
  pageSnapshot = await page.evaluate(({ expectedRoot, newGameWasVisible }) => {
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
      title: document.title,
      rootUrl: location.href,
      newGameVisibleBeforeLaunch: newGameWasVisible,
      defaultRouteReady: hudReady && screensClosed && canvasReady && !document.body.classList.contains('ui-modal-open'),
      assetFailureVisible: /Game assets failed to load/i.test(visibleText),
      storageRoundTrip,
      scriptPaths: Array.from(document.scripts).map((script) => script.src).filter(Boolean),
      userAgent: navigator.userAgent,
      expectedRoot,
    };
  }, { expectedRoot: rootUrl, newGameWasVisible: newGameVisibleBeforeLaunch });

  const parsed = parseLaunchReceipts(readFileSync(receiptPath, 'utf8'));
  assert.equal(parsed.malformedLineCount, 0, 'packaged launch receipt must be valid JSONL');
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
  assessment.expectedCspBlockCount = expectedCspBlocks.length;
  if (hardErrors.length) assessment.failures.push(`page errors: ${JSON.stringify(summarizeIssues(hardErrors))}`);
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
  rootUrl,
  mainIdentity,
  page: pageSnapshot,
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
