#!/usr/bin/env node
// Phase H1 Row 8 — one-use shipped Electron sanity route.
// Public controls only: menu -> New Game -> flight -> map waypoint/autopilot -> physical E dock -> Ledger.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectCanonicalRootUrl } from './lib/alphaLiveBaselineContracts.mjs';
import {
  assessElectronProcessHealth,
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT_ROOT = path.join(ROOT, '.devshots', 'h1-electron-e2e');
const REPORT_PATH = path.join(OUTPUT_ROOT, 'report.json');
const FAILURE_PATH = path.join(OUTPUT_ROOT, 'failure-state.json');
const LAUNCH_COUNTS_PATH = path.join(OUTPUT_ROOT, 'launch-counts.json');
const RUN_LOG_PATH = path.join(OUTPUT_ROOT, 'run.log');
const FIXED_SEED = 47;

const SHOTS = Object.freeze({
  mainMenu: '01-main-menu.png',
  newGame: '02-new-game.png',
  flight: '03-flight.png',
  dockPrompt: '04-dock-prompt.png',
  station: '05-station.png',
  ledger: '06-ledger.png',
  failure: 'failure-row8.png',
});

mkdirSync(OUTPUT_ROOT, { recursive: true });

const candidateCommit = gitText(['rev-parse', 'HEAD']);
const trackedStatus = gitText(['status', '--porcelain', '--untracked-files=no']);
assert.equal(trackedStatus, '', `Row 8 requires a clean tracked candidate, got: ${trackedStatus}`);
consumeAttempt(candidateCommit);

const logLines = [];
const steps = [];
const screenshots = [];
let phase = 'prelaunch';
let electronApp = null;
let childProcess = null;
let page = null;
let isolatedLaunch = null;
let canonicalUrlTracker = null;
let processMonitor = null;
let pageIssueTracker = null;
let rootUrl = null;
let route = null;
let processHealth = null;
let cleanupReport = null;
let primaryError = null;
let failureState = null;

const log = (message) => {
  const line = `${new Date().toISOString()} ${message}`;
  logLines.push(line);
  console.log(`[h1-electron-e2e] ${message}`);
};
const mark = (name, detail = {}) => {
  steps.push({ name, at: new Date().toISOString(), ...detail });
  log(name);
};

try {
  const { _electron: electron } = await loadPlaywright();
  isolatedLaunch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'h1-electron-e2e' });
  writeLaunchCounts({ candidateCommit, electronLaunches: 1, disposition: 'in-progress' });
  electronApp = await electron.launch(isolatedLaunch.options);
  processMonitor = createElectronProcessMonitor({ electronApp, childProcess: electronApp.process() });
  childProcess = processMonitor.childProcess;
  assert(childProcess, 'Electron launch must expose its owned child process');
  pageIssueTracker = createStrictElectronApplicationIssueTracker(electronApp);

  page = await electronApp.firstWindow({ timeout: 90_000 });
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  await pageIssueTracker.bindAndBackfillPage(page);
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);

  rootUrl = await canonicalUrlTracker.waitForCanonicalRoot(10_000);
  rootUrl = assertIsolatedElectronRootUrl(rootUrl);
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  await page.bringToFront();
  assertCanonical('canonical-root');
  mark('electron-canonical-root', { rootUrl });

  phase = 'main-menu';
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus && window.SF?.ctx,
    null, { timeout: 30_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 });
    mark('intro-dismissed');
  }
  await waitForBootOverlayGone();
  const newGameButton = page.getByRole('button', { name: 'New Game', exact: true });
  await waitForVisible(newGameButton, 30_000, 'Main Menu');
  const mainMenu = {
    ...(await readMainMenuSnapshot()),
    visible: true,
    visibilityAuthority: 'role:button[name="New Game"]',
  };
  assert.equal(mainMenu.visible, true, 'Main Menu must be visible');
  assert.equal(mainMenu.mode, 'menu', 'Main Menu must retain menu mode');
  await shot(SHOTS.mainMenu);
  assertCanonical('main-menu');
  mark('main-menu-visible', mainMenu);

  phase = 'new-game';
  await newGameButton.click();
  await waitForVisible('[data-screen="newGame"]', 30_000, 'New Game');
  await page.fill('#sf-ng-seed', String(FIXED_SEED));
  const newGame = await page.evaluate(() => {
    const isVisible = (element) => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    return {
      visible: isVisible(document.querySelector('[data-screen="newGame"]')),
      seed: document.querySelector('#sf-ng-seed')?.value || null,
      launchVisible: isVisible([...document.querySelectorAll('button')]
        .find((button) => (button.textContent || '').trim() === 'Launch')),
    };
  });
  assert.equal(newGame.visible, true, 'New Game must be visible');
  assert.equal(newGame.seed, String(FIXED_SEED), 'New Game must record fixed seed 47');
  assert.equal(newGame.launchVisible, true, 'New Game must expose Launch');
  await shot(SHOTS.newGame);
  assertCanonical('new-game');
  mark('new-game-visible', newGame);

  phase = 'flight';
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.waitForFunction(flightReadyInPage, null, { timeout: 150_000 });
  const flight = await readFlightSnapshot();
  assert.equal(flight.mode, 'flight', 'Launch must enter flight');
  assert.equal(flight.playerAlive, true, 'Launch must leave the player alive');
  assert.equal(flight.gpu.available, true, 'Flight must expose WebGL');
  assert.doesNotMatch(flight.gpu.renderer, /SwiftShader|llvmpipe|software/i,
    `Electron smoke requires a hardware WebGL path, got ${flight.gpu.renderer}`);
  assert.notEqual(flight.gpu.software, true, 'Electron runtime must not classify its GPU as software');
  await shot(SHOTS.flight);
  assertCanonical('flight');
  mark('authored-flight-visible', flight);

  phase = 'helios-waypoint';
  const canvas = page.locator('#gl-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  await canvas.focus();
  await page.keyboard.press('KeyN');
  await waitForVisible('#sf-galaxymap', 20_000, 'Galaxy Map');
  const searchInput = page.locator('.gm-search-input');
  await page.keyboard.press('/');
  const shortcutFocused = await page.waitForFunction(
    () => document.activeElement?.matches('.gm-search-input') === true,
    null,
    { timeout: 1_000 },
  ).then(() => true, () => false);
  if (!shortcutFocused) await searchInput.click({ timeout: 10_000 });
  await searchInput.fill('Helios Station');
  await page.locator('.gm-search-item-name', { hasText: 'Helios Station' })
    .first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('Enter');
  const waypointButton = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  await waypointButton.waitFor({ state: 'visible', timeout: 10_000 });
  assert.match(await page.locator('.gm-inspector-content').innerText(), /Helios Station/i,
    'Galaxy Map must visibly identify Helios Station');
  await clickWaypointWithPointer(waypointButton);
  const waypoint = await readNavigationSnapshot();
  assert.equal(waypoint.autopilot?.active, true, 'Set Waypoint must arm autopilot');
  assert.match(waypoint.autopilot?.label || '', /Helios Station/i,
    'Autopilot must target Helios Station');
  assertCanonical('helios-waypoint');
  mark('helios-waypoint-armed', waypoint);

  phase = 'dock-prompt';
  const dockPrompt = page.locator('.sf-alert--dock');
  const dockDeadline = Date.now() + 120_000;
  let approach = null;
  while (Date.now() < dockDeadline) {
    approach = await readApproachSnapshot();
    assert.equal(approach.playerAlive, true,
      `player died during Helios approach: ${JSON.stringify(approach)}`);
    if (await dockPrompt.isVisible().catch(() => false)) break;
    await page.waitForTimeout(250);
  }
  assert.equal(await dockPrompt.isVisible().catch(() => false), true,
    `autopilot did not reach a physical dock prompt; last=${JSON.stringify(approach)}`);
  const dockPromptText = (await dockPrompt.innerText()).trim();
  assert.match(dockPromptText, /\bE\b.*\bDOCK\b|\bDOCK\b.*\bE\b/i,
    `dock prompt must expose the public E binding, got ${JSON.stringify(dockPromptText)}`);
  await shot(SHOTS.dockPrompt);
  assertCanonical('dock-prompt');
  mark('physical-dock-prompt', { text: dockPromptText, approach });

  phase = 'dock-input';
  await canvas.focus();
  let dockInputCount = 0;
  const heldDockInput = async () => {
    dockInputCount += 1;
    try {
      await page.keyboard.down('KeyE');
      await page.waitForTimeout(250);
    } finally {
      await page.keyboard.up('KeyE').catch(() => {});
    }
  };
  await heldDockInput();
  const quickDocked = await page.waitForFunction(() => window.SF?.state?.ui?.docked === true,
    null, { timeout: 1_000 }).then(() => true, () => false);
  if (!quickDocked) {
    const inputDeadline = Date.now() + 20_000;
    while (Date.now() < inputDeadline) {
      await heldDockInput();
      if (await page.evaluate(() => window.SF?.state?.ui?.docked === true)) break;
      await page.waitForTimeout(500);
    }
  }
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === true,
    null, { timeout: 20_000 });
  await waitForVisible('[data-screen="station"] .sx-dock', 20_000, 'Station command dock');
  const station = await readStationSnapshot();
  assert.equal(station.docked, true, 'public E input must dock the player');
  assert.ok(station.stationId, 'docked state must identify its station');
  assert.equal(station.screenVisible, true, 'Station screen must be visible');
  assert.equal(station.commandDockVisible, true, 'Station command dock must be visible');
  await shot(SHOTS.station);
  assertCanonical('station');
  mark('station-visible', { ...station, dockInputCount });

  phase = 'ledger';
  const ledgerTab = page.locator('[data-screen="station"] .sx-dock [data-nav="ledger"]');
  await ledgerTab.waitFor({ state: 'visible', timeout: 20_000 });
  await ledgerTab.click();
  await waitForVisible('[data-screen="station"] .st-ledger', 20_000, 'Station Ledger');
  const ledger = await readLedgerSnapshot();
  assert.equal(ledger.docked, true, 'Ledger must remain inside the docked station route');
  assert.equal(ledger.panelVisible, true, 'Ledger panel must be visible');
  assert.equal(ledger.tabSelected, true, 'Ledger command-dock destination must be selected');
  assert.equal(ledger.labelledBy, 'st-ledger-station-title', 'Ledger must expose its station-host accessible name');
  assert.equal(ledger.title, "The Ship's Ledger", 'Ledger must render its player-facing title');
  assert.equal(ledger.hasContentSurface, true, 'Ledger must render entries or its intentional empty state');
  await shot(SHOTS.ledger);
  assertCanonical('ledger');
  mark('ledger-visible', ledger);

  const pageErrors = pageIssueTracker.errors();
  assert.deepEqual(pageErrors, [], `Electron route page/request errors: ${JSON.stringify(pageErrors)}`);
  processHealth = assessElectronProcessHealth(processMonitor.snapshot());
  assert.deepEqual(processHealth.failures, [],
    `Electron process health failures: ${JSON.stringify(processHealth.failures)}`);

  route = {
    pass: true,
    fixedSeed: FIXED_SEED,
    mainMenu,
    newGame,
    flight,
    waypoint,
    dockPrompt: { text: dockPromptText, approach },
    station: { ...station, dockInputCount },
    ledger,
    canonicalRoot: rootUrl,
  };
} catch (error) {
  primaryError = error;
  log(`FAIL at ${phase}: ${error.message || String(error)}`);
  if (page && !page.isClosed()) {
    await page.screenshot({
      path: path.join(OUTPUT_ROOT, SHOTS.failure),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
    failureState = await readFailureSnapshot().catch(() => null);
    writeJson(FAILURE_PATH, {
      schema: 'spaceface.h1-electron-e2e-failure.v1',
      row: 8,
      phase,
      error: serializeError(error),
      progress: steps,
      snapshot: failureState,
      informational_contended: true,
      noPerformanceEvidence: true,
    });
  }
} finally {
  try {
    cleanupReport = await closeOwnedElectronRuntime({
      page,
      electronApp,
      childProcess,
      canonicalUrlTracker,
      processMonitor,
      rootUrl,
    });
    if (cleanupReport?.pass !== true) {
      primaryError ||= new Error(`owned Electron cleanup failed: ${(cleanupReport?.failures || []).join('; ')}`);
    }
  } catch (error) {
    cleanupReport = { pass: false, failures: [error.message || String(error)] };
    primaryError ||= error;
  }
  if (isolatedLaunch && cleanupReport?.pass === true) {
    try {
      isolatedLaunch.cleanup({ runtimeClosed: true });
    } catch (error) {
      primaryError ||= error;
    }
  }
  pageIssueTracker?.stop?.();
}

const disposition = primaryError || route?.pass !== true ? 'FAIL' : 'PASS';
const report = {
  schema: 'spaceface.h1-electron-e2e.v1',
  row: 8,
  disposition,
  runtime: 'electron-headed',
  candidateCommit,
  attemptsConsumed: 1,
  retryPerformed: false,
  launches: { browser: 0, electron: 1 },
  fixedSeed: FIXED_SEED,
  routeContract: 'menu -> New Game -> flight -> public Helios waypoint/autopilot -> physical E dock -> Station Ledger',
  phaseReached: phase,
  route,
  screenshots,
  expectedScreenshots: Object.values(SHOTS).filter((name) => name !== SHOTS.failure),
  pageIssues: pageIssueTracker?.all?.() || [],
  issueCoverage: pageIssueTracker?.coverage?.() || null,
  processHealth,
  cleanup: cleanupReport,
  failure: primaryError ? serializeError(primaryError) : null,
  failureState,
  steps,
  informational_contended: true,
  informational_contended_note: 'Phase H1 ran contended by design. Timestamps and timeout controls are diagnostics only, not performance evidence.',
  noPerformanceEvidence: true,
  noPerformanceEvidenceNote: 'Matched performance remains Phase H3; this route collects no renderer or per-frame timing sample.',
};
writeJson(REPORT_PATH, report);
writeFileSync(RUN_LOG_PATH, `${logLines.join('\n')}\n`, 'utf8');
writeLaunchCounts({ candidateCommit, electronLaunches: 1, disposition });

if (disposition !== 'PASS') {
  console.error(`[h1-electron-e2e] FAIL — ${primaryError?.message || 'route did not pass'}`);
  process.exit(1);
}
console.log('[h1-electron-e2e] PASS — menu, New Game, flight, physical dock, Ledger');
console.log('[h1-electron-e2e] launchCounts browser=0 electron=1');

async function shot(name) {
  await page.screenshot({
    path: path.join(OUTPUT_ROOT, name),
    type: 'png',
    animations: 'allow',
  });
  screenshots.push(name);
}

async function waitForVisible(target, timeout, label) {
  const locator = typeof target === 'string' ? page.locator(target) : target;
  await locator.waitFor({ state: 'visible', timeout }).catch((error) => {
    throw new Error(`Timed out waiting for visible ${label}: ${error.message}`);
  });
}

async function waitForBootOverlayGone() {
  await page.waitForFunction(() => {
    const overlay = document.getElementById('boot-overlay');
    if (!overlay) return true;
    const style = getComputedStyle(overlay);
    return overlay.hidden || overlay.classList.contains('hidden')
      || style.display === 'none' || style.visibility === 'hidden';
  }, null, { timeout: 30_000 });
}

function assertCanonical(boundary) {
  const check = { boundary, ...inspectCanonicalRootUrl(page.url(), rootUrl) };
  assert.deepEqual(check.failures, [], `${boundary} left canonical Electron root: ${JSON.stringify(check)}`);
  return check;
}

async function clickWaypointWithPointer(locator) {
  const deadline = Date.now() + 10_000;
  let lastBox = null;
  while (Date.now() < deadline) {
    lastBox = await locator.boundingBox().catch(() => null);
    if (lastBox && lastBox.width > 2 && lastBox.height > 2) {
      await page.mouse.click(
        Math.round(lastBox.x + lastBox.width / 2),
        Math.round(lastBox.y + lastBox.height / 2),
      );
      const armed = await page.waitForFunction(() => {
        const nav = window.SF?.state?.nav?.autopilot;
        return nav?.active === true && /Helios Station/i.test(String(nav.label || ''));
      }, null, { timeout: 750 }).then(() => true, () => false);
      if (armed) return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Visible Set Waypoint click did not arm autopilot; last box=${JSON.stringify(lastBox)}`);
}

async function readMainMenuSnapshot() {
  return page.evaluate(() => {
    return {
      mode: window.SF?.state?.mode || null,
      title: document.title,
      focusedText: String(document.activeElement?.textContent || '').trim().slice(0, 120),
    };
  });
}

async function readFlightSnapshot() {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const gl = state?.render?.renderer?.getContext?.() || null;
    const extension = gl?.getExtension?.('WEBGL_debug_renderer_info') || null;
    const runtimeGpu = state?.render?.gpu || null;
    const renderer = extension
      ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) || '')
      : String(runtimeGpu?.renderer || gl?.getParameter?.(gl.RENDERER) || '');
    return {
      mode: state?.mode || null,
      tick: Number(state?.tick || 0),
      playerAlive: !!(player && player.alive !== false && Number(player.hull) > 0),
      playerId: player?.id ?? null,
      sectorId: state?.world?.currentSectorId || null,
      shipCount: Array.isArray(state?.entityList)
        ? state.entityList.filter((entity) => entity?.type === 'ship' && entity.alive !== false).length : 0,
      gpu: {
        available: !!gl,
        vendor: extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) || '') : String(runtimeGpu?.vendor || ''),
        renderer,
        software: typeof runtimeGpu?.software === 'boolean' ? runtimeGpu.software : null,
      },
    };
  });
}

async function readNavigationSnapshot() {
  return page.evaluate(() => {
    const nav = window.SF?.state?.nav;
    return {
      waypoint: nav?.waypoint ? {
        kind: nav.waypoint.kind || null,
        label: nav.waypoint.label || '',
      } : null,
      autopilot: nav?.autopilot ? {
        active: nav.autopilot.active === true,
        label: nav.autopilot.label || '',
        status: nav.autopilot.status || '',
        targetEntityId: nav.autopilot.targetEntityId ?? null,
      } : null,
    };
  });
}

async function readApproachSnapshot() {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const autopilot = state?.nav?.autopilot;
    return {
      tick: Number(state?.tick || 0),
      playerAlive: !!(player && player.alive !== false && Number(player.hull) > 0),
      position: player?.pos ? { x: Number(player.pos.x), z: Number(player.pos.z) } : null,
      autopilot: autopilot ? {
        active: autopilot.active === true,
        status: autopilot.status || '',
        label: autopilot.label || '',
        distance: Number(autopilot.distance || 0),
      } : null,
    };
  });
}

async function readStationSnapshot() {
  return page.evaluate(() => {
    const isVisible = (element) => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    return {
      docked: window.SF?.state?.ui?.docked === true,
      stationId: window.SF?.state?.ui?.dockedStationId || null,
      screenVisible: isVisible(document.querySelector('[data-screen="station"]')),
      commandDockVisible: isVisible(document.querySelector('[data-screen="station"] .sx-dock')),
      visibleDestinations: [...document.querySelectorAll('[data-screen="station"] .sx-dock [data-nav]')]
        .filter(isVisible)
        .map((element) => element.getAttribute('data-nav')),
    };
  });
}

async function readLedgerSnapshot() {
  return page.evaluate(() => {
    const isVisible = (element) => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    const panel = document.querySelector('[data-screen="station"] .st-ledger');
    const tab = document.querySelector('[data-screen="station"] .sx-dock [data-nav="ledger"]');
    const empty = panel?.querySelector('.st-ledger-empty');
    const entryCount = panel?.querySelectorAll('.st-ledger-entry').length || 0;
    return {
      docked: window.SF?.state?.ui?.docked === true,
      stationId: window.SF?.state?.ui?.dockedStationId || null,
      panelVisible: isVisible(panel),
      tabSelected: tab?.getAttribute('aria-selected') === 'true',
      labelledBy: panel?.getAttribute('aria-labelledby') || null,
      title: panel?.querySelector('.st-sub-h')?.textContent?.trim() || null,
      status: panel?.querySelector('.st-ledger-status')?.textContent?.trim() || '',
      entryCount,
      emptyVisible: isVisible(empty),
      hasContentSurface: entryCount > 0 || isVisible(empty),
    };
  });
}

async function readFailureSnapshot() {
  return page.evaluate(() => {
    const isVisible = (element) => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    const state = window.SF?.state;
    return {
      url: location.href,
      mode: state?.mode || null,
      sectorId: state?.world?.currentSectorId || null,
      docked: state?.ui?.docked === true,
      dockedStationId: state?.ui?.dockedStationId || null,
      visibleScreens: [...document.querySelectorAll('[data-screen]')]
        .filter(isVisible)
        .map((element) => element.getAttribute('data-screen')),
      dockPromptVisible: isVisible(document.querySelector('.sf-alert--dock')),
      ledgerVisible: isVisible(document.querySelector('[data-screen="station"] .st-ledger')),
      activeElement: document.activeElement?.outerHTML?.slice(0, 500) || null,
    };
  });
}

function consumeAttempt(commit) {
  if (existsSync(LAUNCH_COUNTS_PATH)) {
    const prior = JSON.parse(readFileSync(LAUNCH_COUNTS_PATH, 'utf8'));
    if (Number(prior.attemptsConsumed || 0) >= 1) {
      throw new Error(`Row 8 attempt already consumed by ${prior.candidateCommit || 'unknown candidate'}; refusing a retry`);
    }
  }
  writeLaunchCounts({ candidateCommit: commit, electronLaunches: 0, disposition: 'consumed' });
}

function writeLaunchCounts({ candidateCommit: commit, electronLaunches, disposition }) {
  writeJson(LAUNCH_COUNTS_PATH, {
    schema: 'spaceface.h1-electron-e2e-launch-counts.v1',
    row: 8,
    candidateCommit: commit,
    attemptsConsumed: 1,
    retryPerformed: false,
    launches: { browser: 0, electron: electronLaunches },
    disposition,
    updatedAt: new Date().toISOString(),
    informational_contended: true,
    informational_contended_note: 'updatedAt is attempt-control metadata, not performance evidence.',
    noPerformanceEvidence: true,
  });
}

function gitText(args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || null,
  };
}
