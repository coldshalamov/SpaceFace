#!/usr/bin/env node
/**
 * SETTINGS-RUNTIME-TRUTH — independent headed browser/Electron parity lane.
 *
 * Normal game route only (no ?debug=). Fixed origin. Actual runtime truth at:
 *   boot · Continue · current→max→current
 * Captures: drawing buffer, shadowMap/key light, VFX cap/burst, raw localStorage
 * profile (settings-canonical byte equality), resource/listener counts.
 *
 * Fail closed. Cleans owned processes/ports. Evidence under .devshots/.
 *
 * Run:  node scripts/check-settings-runtime-parity-live.mjs
 *       node scripts/check-settings-runtime-parity-live.mjs --self-check
 *       node scripts/check-settings-runtime-parity-live.mjs --browser-only
 *       node scripts/check-settings-runtime-parity-live.mjs --electron-only
 *
 * Allowed writes: this file + test/fixtures/settings-runtime-parity/* only.
 * Frozen: production, renderer.js, vfx.js, visualFactory.js, asteroidInstancePool.js,
 * package.json, goldens.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import {
  BUS_EVENTS_TO_COUNT,
  DEFAULT_VIDEO,
  ELECTRON_FIXED_PORT,
  MAX_VIDEO,
  PARTICLE_CAP,
  PROFILE_KEY,
  QUALITY_BURST,
  SAVE_SLOT,
  VIEWPORT,
  expectedDrawBuffer,
  expectedPixelRatio,
  profileSettingsCanonical,
} from '../test/fixtures/settings-runtime-parity/expected-tables.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARGV = new Set(process.argv.slice(2));
const SELF_CHECK = ARGV.has('--self-check');
const BROWSER_ONLY = ARGV.has('--browser-only');
const ELECTRON_ONLY = ARGV.has('--electron-only');
const OUT_DIR = resolve(ROOT, '.devshots/settings-runtime-parity');
const REPORT_PATH = join(OUT_DIR, 'settings-runtime-parity-live.json');

const FLIGHT_TIMEOUT_MS = 150_000;
const MENU_TIMEOUT_MS = 60_000;
const SETTLE_MS = 400;
const SEEDED_PROFILE_RAW = JSON.stringify({
  version: 1,
  updatedAt: 'settings-runtime-parity-seed',
  settings: { video: { ...DEFAULT_VIDEO } },
});

// ---------------------------------------------------------------------------
// Self-check (no browser)
// ---------------------------------------------------------------------------

if (SELF_CHECK) {
  assert.equal(PARTICLE_CAP.medium, 3000);
  assert.equal(PARTICLE_CAP.high, 4000);
  assert.equal(QUALITY_BURST.medium, 0.8);
  assert.equal(QUALITY_BURST.high, 1.0);
  assert.equal(DEFAULT_VIDEO.particleQuality, 'medium');
  assert.equal(MAX_VIDEO.particleQuality, 'high');
  assert.equal(ELECTRON_FIXED_PORT, 41788);
  assert.ok(BUS_EVENTS_TO_COUNT.includes('settings:changed'));

  const boot = expectedDrawBuffer(DEFAULT_VIDEO, {
    devicePixelRatio: 1, cssWidth: 1440, cssHeight: 900,
  });
  // min(1,2)*0.85*1 = 0.85
  assert.equal(boot.pixelRatio, 0.85);
  assert.equal(boot.width, Math.floor(1440 * 0.85));
  assert.equal(boot.height, Math.floor(900 * 0.85));

  const maxed = expectedDrawBuffer(MAX_VIDEO, {
    devicePixelRatio: 1, cssWidth: 1440, cssHeight: 900,
  });
  // min(1,4)*1*1 = 1
  assert.equal(maxed.pixelRatio, 1);
  assert.equal(maxed.width, 1440);

  const restored = expectedDrawBuffer(DEFAULT_VIDEO, {
    devicePixelRatio: 1, cssWidth: 1440, cssHeight: 900,
  });
  assert.deepEqual(restored, boot);

  const rawA = JSON.stringify({ version: 1, updatedAt: '2020-01-01T00:00:00.000Z', settings: { video: { renderScale: 0.85 } } });
  const rawB = JSON.stringify({ version: 1, updatedAt: '2026-01-01T00:00:00.000Z', settings: { video: { renderScale: 0.85 } } });
  assert.equal(profileSettingsCanonical(rawA), profileSettingsCanonical(rawB));
  assert.equal(expectedPixelRatio(DEFAULT_VIDEO, { devicePixelRatio: 2 }), 1.7);

  console.log('PASS settings-runtime-parity self-check (fixtures + draw-buffer formula)');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main headed proof
// ---------------------------------------------------------------------------

const report = {
  schema: 'spaceface.settingsRuntimeParityLive.v1',
  generatedAt: new Date().toISOString(),
  viewport: VIEWPORT,
  browser: null,
  electron: null,
  comparison: null,
  hardMismatches: [],
  expectedRed: [],
  pass: false,
  evidence: {
    report: REPORT_PATH,
    outDir: OUT_DIR,
  },
};

try {
  mkdirSync(OUT_DIR, { recursive: true });

  if (!ELECTRON_ONLY) report.browser = await runBrowserRoute();
  if (!BROWSER_ONLY) report.electron = await runElectronRoute();

  report.comparison = compareRoutes(report.browser, report.electron);
  classifyResults(report);

  report.pass = report.hardMismatches.length === 0 && report.expectedRed.length === 0;
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  printSummary(report);

  if (report.hardMismatches.length > 0) {
    process.exitCode = 1;
    console.error(`FAIL hard mismatches (${report.hardMismatches.length}):`);
    for (const m of report.hardMismatches) console.error(`  - ${m}`);
  } else if (report.expectedRed.length > 0) {
    // Fail closed: pre-integration seams still exit nonzero (never green-wash).
    process.exitCode = 1;
    console.error(`EXPECTED_RED pre-integration (${report.expectedRed.length}):`);
    for (const m of report.expectedRed) console.error(`  - ${m}`);
  } else {
    console.log('PASS settings-runtime-parity browser/Electron headed live proof');
  }
} catch (error) {
  report.pass = false;
  report.error = serializeError(error);
  try {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  } catch (_) { /* best-effort */ }
  console.error('FAIL settings-runtime-parity:', error && error.stack || error);
  console.error(`evidence: ${REPORT_PATH}`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function runBrowserRoute() {
  let server = null;
  let browser = null;
  let context = null;
  let page = null;

  try {
    server = await acquireVisualProbeServer({ root: ROOT });
    assert.equal(server.ownsServer, true, 'browser must own ephemeral loopback server');
    const rootUrl = new URL(server.baseUrl);
    assert.equal(rootUrl.hostname, '127.0.0.1', 'browser server must bind IPv4 loopback');
    assert.equal(rootUrl.search, '', 'browser base URL must not carry query flags');

    const executablePath = findSystemBrowser();
    assert(executablePath, 'headed Chrome or Edge is required');
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({
      headless: false,
      executablePath,
      args: [
        '--incognito',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        '--force-device-scale-factor=1',
      ],
    });
    context = await browser.newContext({
      viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
      screen: { width: VIEWPORT.width, height: VIEWPORT.height },
      deviceScaleFactor: 1,
      locale: 'en-US',
      colorScheme: 'dark',
    });
    page = await context.newPage();
    let issues = null;
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    assert.equal(new URL(page.url()).search, '', 'browser must use canonical root without query flags');

    const receipt = await exerciseParity(page, {
      route: 'browser',
      expectedOriginHost: '127.0.0.1',
      log: (line) => console.log(`[browser] ${line}`),
      startIssueCollection: () => { issues = collectPageIssues(page, { ignoreProbeWarnings: true }); },
    });
    const errors = issues ? issues.errorIssues() : [];
    assert.deepEqual(errors, [], `browser page errors: ${JSON.stringify(summarizeIssues(errors))}`);
    receipt.pageErrors = [];
    receipt.origin = new URL(page.url()).origin;
    receipt.fixedOriginNote = 'ephemeral loopback origin owned for this probe session';
    receipt.baseUrl = server.baseUrl;
    return receipt;
  } finally {
    await closeBrowserResources({ page, context, browser, server });
  }
}

async function runElectronRoute() {
  let electronApp = null;
  let childProcess = null;
  let page = null;

  try {
    const { _electron: electron } = await loadPlaywright();
    electronApp = await electron.launch({ args: ['.'], cwd: ROOT, timeout: 90_000 });
    childProcess = electronApp.process();
    assert(childProcess, 'Playwright Electron launch must expose owned child process');

    page = await electronApp.firstWindow({ timeout: 90_000 });
    let issues = null;
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
    await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 90_000 });
    assert.equal(new URL(page.url()).search, '', 'Electron must use canonical root without query flags');

    const url = new URL(page.url());
    assert.equal(
      Number(url.port) || (url.protocol === 'http:' ? 80 : 443),
      ELECTRON_FIXED_PORT,
      `Electron primary evidence requires fixed save-origin port ${ELECTRON_FIXED_PORT}`,
    );

    try {
      await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height });
    } catch (_) { /* shell may own size */ }

    const receipt = await exerciseParity(page, {
      route: 'electron',
      expectedOriginHost: '127.0.0.1',
      log: (line) => console.log(`[electron] ${line}`),
      startIssueCollection: () => { issues = collectPageIssues(page, { ignoreProbeWarnings: true }); },
    });
    const errors = issues ? issues.errorIssues() : [];
    assert.deepEqual(errors, [], `electron page errors: ${JSON.stringify(summarizeIssues(errors))}`);
    receipt.pageErrors = [];
    receipt.origin = url.origin;
    receipt.fixedOriginNote = `fixed port ${ELECTRON_FIXED_PORT}`;
    receipt.electronPort = Number(url.port);
    return receipt;
  } finally {
    await closeElectronResources({ page, electronApp, childProcess });
  }
}

// ---------------------------------------------------------------------------
// Shared exercise: boot → current→max→current → save → Continue
// ---------------------------------------------------------------------------

async function exerciseParity(page, { route, expectedOriginHost, log, startIssueCollection }) {
  const steps = [];
  const mark = (name, detail = {}) => {
    steps.push({ name, at: new Date().toISOString(), ...detail });
    log(name + (detail.note ? ` — ${detail.note}` : ''));
  };

  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, {
    timeout: MENU_TIMEOUT_MS,
  });
  await dismissIntroIfVisible(page);
  await waitForMainMenu(page);
  mark('main-menu');

  // Isolate storage so profile/save state is probe-owned.
  await page.evaluate(({ keys, seededProfileRaw }) => {
    try {
      for (const k of keys) localStorage.removeItem(k);
      // Drop save index/slots that could enable stale Continue.
      const drop = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sf.save.') || key === 'sf.save.index')) drop.push(key);
      }
      for (const key of drop) localStorage.removeItem(key);
      localStorage.setItem(keys[0], seededProfileRaw);
    } catch (_) { /* ignore */ }
  }, { keys: [PROFILE_KEY], seededProfileRaw: SEEDED_PROFILE_RAW });

  // Reboot the same canonical route so the probe-owned profile is consumed before registry init.
  // This both removes cross-origin contamination and proves boot does not rewrite the raw bytes.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, {
    timeout: MENU_TIMEOUT_MS,
  });
  await dismissIntroIfVisible(page);
  await waitForMainMenu(page);
  mark('profile-seeded-reload');
  if (typeof startIssueCollection === 'function') startIssueCollection();

  // New Game → Launch (public UI, normal route)
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="newGame"]');
    return el && isVisible(el);
    function isVisible(element) {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    }
  }, null, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(flightReadyExpression, null, { timeout: FLIGHT_TIMEOUT_MS });
  await page.waitForTimeout(SETTLE_MS);
  mark('flight-ready');

  const boot = await snapshotRuntimeTruth(page);
  assert.equal(boot.mode, 'flight', `${route}: boot must be flight`);
  assert.equal(boot.search, '', `${route}: flight must stay on canonical root`);
  assert.equal(boot.host, expectedOriginHost, `${route}: host must match expected origin host`);
  mark('boot-snapshot', {
    particleCap: boot.particles.cap,
    quality: boot.particles.quality,
    draw: boot.drawBuffer,
  });

  // ---- current → max → current ----
  const currentVideo = {
    renderScale: boot.video.renderScale,
    pixelRatioCap: boot.video.pixelRatioCap,
    shadows: boot.video.shadows,
    particleQuality: boot.video.particleQuality,
    bloom: boot.video.bloom,
    fov: boot.video.fov,
  };
  const profileBeforeLive = await readProfileRaw(page);
  const listenersBeforeLive = boot.listeners;
  const resourcesBeforeLive = boot.resources;

  await applyVideoSettings(page, { ...MAX_VIDEO });
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const atMax = await snapshotRuntimeTruth(page);
  mark('live-max', {
    particleCap: atMax.particles.cap,
    renderScale: atMax.video.renderScale,
    shadowsSetting: atMax.video.shadows,
  });

  await applyVideoSettings(page, { ...currentVideo });
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const afterRestore = await snapshotRuntimeTruth(page);
  const profileAfterLive = await readProfileRaw(page);
  mark('live-restored');

  // Resource/listener growth across the live cycle (not Continue).
  const liveListenerGrowth = {};
  for (const ev of BUS_EVENTS_TO_COUNT) {
    liveListenerGrowth[ev] = (afterRestore.listeners[ev] || 0) - (listenersBeforeLive[ev] || 0);
  }
  const liveResourceGrowth = {
    scenePoints: (afterRestore.resources.scenePoints || 0) - (resourcesBeforeLive.scenePoints || 0),
    directionalLights: (afterRestore.resources.directionalLights || 0)
      - (resourcesBeforeLive.directionalLights || 0),
  };

  // ---- Save + Continue (public UI) ----
  const listenersBeforeContinue = afterRestore.listeners;
  const vfxSubsBeforeContinue = afterRestore.vfxSubCount;
  const resourcesBeforeContinue = afterRestore.resources;

  await page.evaluate((slot) => {
    window.SF.bus.emit('game:save', { slot });
  }, SAVE_SLOT);
  await page.waitForFunction((slot) => {
    try {
      return !!localStorage.getItem(`sf.save.${slot}`);
    } catch {
      return false;
    }
  }, SAVE_SLOT, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
  mark('saved');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Main Menu', exact: true }).click({ timeout: 15_000 });
  await page.locator('#sf-confirm-root button', { hasText: 'Main Menu' }).click({ timeout: 10_000 });
  await waitForMainMenu(page);
  mark('returned-to-menu');

  const continueBtn = page.getByRole('button', { name: 'Continue', exact: true });
  await continueBtn.waitFor({ state: 'visible', timeout: 15_000 });
  assert.equal(await continueBtn.isDisabled(), false, `${route}: Continue must be enabled after save`);
  await continueBtn.click({ timeout: 15_000 });
  await page.waitForFunction(flightReadyExpression, null, { timeout: FLIGHT_TIMEOUT_MS });
  await page.waitForTimeout(SETTLE_MS);
  mark('continued-flight');

  const afterContinue = await snapshotRuntimeTruth(page);
  const profileAfterContinue = await readProfileRaw(page);

  return {
    route,
    steps,
    boot,
    atMax,
    afterRestore,
    afterContinue,
    currentVideo,
    maxVideo: { ...MAX_VIDEO },
    profile: {
      beforeLive: profileBeforeLive,
      afterLive: profileAfterLive,
      afterContinue: profileAfterContinue,
      beforeLiveCanonical: profileSettingsCanonical(profileBeforeLive),
      afterLiveCanonical: profileSettingsCanonical(profileAfterLive),
      afterContinueCanonical: profileSettingsCanonical(profileAfterContinue),
      bootRawEqualsSeed: profileBeforeLive === SEEDED_PROFILE_RAW,
      rawEqualBeforeAfterLive: profileBeforeLive === profileAfterLive,
      settingsCanonicalEqualBeforeAfterLive:
        profileSettingsCanonical(profileBeforeLive) === profileSettingsCanonical(profileAfterLive)
        && profileSettingsCanonical(profileBeforeLive) != null,
    },
    listeners: {
      beforeLive: listenersBeforeLive,
      afterRestore: afterRestore.listeners,
      beforeContinue: listenersBeforeContinue,
      afterContinue: afterContinue.listeners,
      liveGrowth: liveListenerGrowth,
    },
    resources: {
      beforeLive: resourcesBeforeLive,
      afterRestore: afterRestore.resources,
      beforeContinue: resourcesBeforeContinue,
      afterContinue: afterContinue.resources,
      liveGrowth: liveResourceGrowth,
      vfxSubsBefore: vfxSubsBeforeContinue,
      vfxSubsAfter: afterContinue.vfxSubCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

async function dismissIntroIfVisible(page) {
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}

async function waitForMainMenu(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="mainMenu"]');
    if (!el || el.hidden) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
  }, null, { timeout: MENU_TIMEOUT_MS });
}

function flightReadyExpression() {
  const state = window.SF?.state;
  if (!state || state.mode !== 'flight') return false;
  const player = state.entities?.get?.(state.playerId);
  if (!player || player.alive === false) return false;
  const data = player.mesh?.userData || {};
  if (data.authoredAssetState && data.authoredAssetState !== 'authored') return false;
  return true;
}

async function readProfileRaw(page) {
  return page.evaluate((key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  }, PROFILE_KEY);
}

async function applyVideoSettings(page, patch) {
  return page.evaluate((p) => {
    const video = window.SF.state.settings.video;
    for (const [key, value] of Object.entries(p)) {
      video[key] = value;
      window.SF.bus.emit('settings:changed', { section: 'video', key, value });
    }
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('resize'));
    }
    return { ...video };
  }, patch);
}

async function snapshotRuntimeTruth(page) {
  return page.evaluate((busEvents) => {
    const state = window.SF.state;
    const bus = window.SF.bus;
    const registry = window.SF.registry;
    const video = (state.settings && state.settings.video) || {};
    const renderer = state.render && state.render.renderer;
    const renderSys = registry && registry.get ? registry.get('render') : null;
    const vfxSys = registry && registry.get ? registry.get('vfx') : null;
    const inspect = vfxSys && typeof vfxSys.inspect === 'function' ? vfxSys.inspect() : null;

    let drawBuffer = null;
    if (renderer) {
      const canvas = renderer.domElement;
      let width = canvas ? (canvas.width | 0) : 0;
      let height = canvas ? (canvas.height | 0) : 0;
      try {
        const THREE = window.SF && window.SF.THREE;
        if (THREE && THREE.Vector2 && typeof renderer.getDrawingBufferSize === 'function') {
          const v = renderer.getDrawingBufferSize(new THREE.Vector2());
          width = v.x | 0;
          height = v.y | 0;
        }
      } catch (_) { /* canvas fallback */ }
      drawBuffer = {
        width,
        height,
        canvasWidth: canvas ? canvas.width : null,
        canvasHeight: canvas ? canvas.height : null,
        pixelRatio: typeof renderer.getPixelRatio === 'function' ? renderer.getPixelRatio() : null,
        cssWidth: window.innerWidth,
        cssHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      };
    }

    const keyLight = renderSys && renderSys._keyLight ? renderSys._keyLight : null;
    const shadows = {
      settingRaw: video.shadows,
      settingOn: video.shadows !== false,
      shadowSettingOn: renderSys ? !!renderSys._shadowSettingOn : null,
      shadowMapEnabled: renderer && renderer.shadowMap ? !!renderer.shadowMap.enabled : null,
      keyLightPresent: !!keyLight,
      keyLightCastShadow: keyLight ? !!keyLight.castShadow : null,
      keyLightHasShadowCamera: !!(keyLight && keyLight.shadow && keyLight.shadow.camera),
      shadowMapSize: keyLight && keyLight.shadow && keyLight.shadow.mapSize
        ? { x: keyLight.shadow.mapSize.x, y: keyLight.shadow.mapSize.y }
        : null,
    };

    const particles = {
      quality: video.particleQuality || null,
      cap: inspect && Number.isFinite(inspect.particleCap) ? inspect.particleCap
        : (vfxSys && Number.isFinite(vfxSys._cap) ? vfxSys._cap : null),
      burst: vfxSys && Number.isFinite(vfxSys._burst) ? vfxSys._burst : null,
      liveParticles: inspect && Number.isFinite(inspect.liveParticles) ? inspect.liveParticles : null,
      shardCloudUuid: vfxSys && vfxSys._shardMesh ? vfxSys._shardMesh.uuid : null,
      sceneAttached: inspect ? !!inspect.sceneAttached : null,
    };

    let profileRaw = null;
    try { profileRaw = localStorage.getItem('sf.settings.profile.v1'); } catch (_) {}

    const listeners = {};
    const map = bus && bus._listeners;
    if (map && typeof map.get === 'function') {
      for (const name of busEvents) {
        const set = map.get(name);
        listeners[name] = set && typeof set.size === 'number' ? set.size : 0;
      }
    }

    let scenePoints = 0;
    let directionalLights = 0;
    const scene = state.render && state.render.scene;
    if (scene && typeof scene.traverse === 'function') {
      scene.traverse((o) => {
        if (o && o.isPoints) scenePoints += 1;
        if (o && o.isDirectionalLight) directionalLights += 1;
      });
    }

    const url = new URL(location.href);
    return {
      mode: state.mode,
      host: url.hostname,
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      video: {
        renderScale: video.renderScale,
        pixelRatioCap: video.pixelRatioCap,
        shadows: video.shadows,
        particleQuality: video.particleQuality,
        bloom: video.bloom,
        fov: video.fov,
      },
      drawBuffer,
      shadows,
      particles,
      profileRaw,
      listeners,
      vfxSubCount: Array.isArray(vfxSys && vfxSys._subs) ? vfxSys._subs.length : null,
      resources: { scenePoints, directionalLights },
    };
  }, [...BUS_EVENTS_TO_COUNT]);
}

// ---------------------------------------------------------------------------
// Comparison + classification
// ---------------------------------------------------------------------------

function compareRoutes(browser, electron) {
  if (!browser || !electron) {
    return {
      compared: false,
      reason: !browser ? 'browser route skipped' : 'electron route skipped',
      parityFailures: [],
    };
  }

  const parityFailures = [];
  const pairs = [
    ['boot.video.particleQuality', browser.boot.video.particleQuality, electron.boot.video.particleQuality],
    ['boot.video.renderScale', browser.boot.video.renderScale, electron.boot.video.renderScale],
    ['boot.video.shadows', browser.boot.video.shadows, electron.boot.video.shadows],
    ['boot.particles.cap', browser.boot.particles.cap, electron.boot.particles.cap],
    ['boot.particles.burst', browser.boot.particles.burst, electron.boot.particles.burst],
    ['afterRestore.video.particleQuality', browser.afterRestore.video.particleQuality, electron.afterRestore.video.particleQuality],
    ['afterRestore.video.renderScale', browser.afterRestore.video.renderScale, electron.afterRestore.video.renderScale],
    ['afterRestore.video.shadows', browser.afterRestore.video.shadows, electron.afterRestore.video.shadows],
    ['afterRestore.particles.cap', browser.afterRestore.particles.cap, electron.afterRestore.particles.cap],
    ['atMax.video.shadows', browser.atMax.video.shadows, electron.atMax.video.shadows],
    ['atMax.particles.cap', browser.atMax.particles.cap, electron.atMax.particles.cap],
    ['afterContinue.video.particleQuality', browser.afterContinue.video.particleQuality, electron.afterContinue.video.particleQuality],
    ['afterContinue.particles.cap', browser.afterContinue.particles.cap, electron.afterContinue.particles.cap],
    ['boot.shadows.keyLightPresent', browser.boot.shadows.keyLightPresent, electron.boot.shadows.keyLightPresent],
    ['atMax.shadows.shadowSettingOn', browser.atMax.shadows.shadowSettingOn, electron.atMax.shadows.shadowSettingOn],
    ['atMax.shadows.keyLightPresent', browser.atMax.shadows.keyLightPresent, electron.atMax.shadows.keyLightPresent],
  ];

  for (const [label, a, b] of pairs) {
    if (!valuesEqual(a, b)) {
      parityFailures.push(`${label}: browser=${JSON.stringify(a)} electron=${JSON.stringify(b)}`);
    }
  }

  // Profile settings-canonical equality (raw bytes differ by updatedAt; settings payload must match).
  const bCanon = browser.profile.afterLiveCanonical;
  const eCanon = electron.profile.afterLiveCanonical;
  if (bCanon != null && eCanon != null && bCanon !== eCanon) {
    parityFailures.push('profile.settings canonical bytes differ after current→max→current');
  }

  const bRatio = effectiveScaleRatio(browser.boot.drawBuffer, browser.boot.video);
  const eRatio = effectiveScaleRatio(electron.boot.drawBuffer, electron.boot.video);
  if (bRatio != null && eRatio != null && Math.abs(bRatio - eRatio) > 0.15) {
    parityFailures.push(
      `boot.drawBuffer.effectiveScaleRatio: browser=${bRatio.toFixed(3)} electron=${eRatio.toFixed(3)}`,
    );
  }

  return {
    compared: true,
    parityFailures,
    browserOrigin: browser.boot.origin,
    electronOrigin: electron.boot.origin,
    electronPort: electron.electronPort ?? null,
  };
}

function classifyResults(report) {
  const hard = report.hardMismatches;
  const red = report.expectedRed;

  if (report.comparison?.compared && report.comparison.parityFailures.length) {
    for (const f of report.comparison.parityFailures) hard.push(`parity: ${f}`);
  }

  if (report.electron && report.electron.electronPort != null
    && Number(report.electron.electronPort) !== ELECTRON_FIXED_PORT) {
    hard.push(`electron fixed-origin port expected ${ELECTRON_FIXED_PORT}, got ${report.electron.electronPort}`);
  }

  for (const route of [report.browser, report.electron].filter(Boolean)) {
    classifyRoute(route, hard, red);
  }
}

function classifyRoute(route, hard, red) {
  const label = route.route;
  const expectedBootCap = PARTICLE_CAP[route.boot.particles.quality]
    || PARTICLE_CAP[DEFAULT_VIDEO.particleQuality];
  const expectedBootBurst = QUALITY_BURST[route.boot.particles.quality]
    || QUALITY_BURST[DEFAULT_VIDEO.particleQuality];

  if (route.boot.particles.cap !== expectedBootCap) {
    hard.push(`${label}: boot particleCap ${route.boot.particles.cap} != expected ${expectedBootCap}`);
  }
  if (route.boot.particles.burst != null
    && Math.abs(route.boot.particles.burst - expectedBootBurst) > 1e-6) {
    hard.push(`${label}: boot burst ${route.boot.particles.burst} != expected ${expectedBootBurst}`);
  }

  if (!route.boot.drawBuffer || !(route.boot.drawBuffer.width > 0) || !(route.boot.drawBuffer.height > 0)) {
    hard.push(`${label}: boot draw buffer missing or zero`);
  } else {
    // Formula check against live CSS size / DPR (fail closed when dynRes≈1).
    const db = route.boot.drawBuffer;
    const expected = expectedDrawBuffer(route.boot.video, {
      cssWidth: db.cssWidth,
      cssHeight: db.cssHeight,
      devicePixelRatio: db.devicePixelRatio,
      dynResScale: 1,
    });
    if (db.pixelRatio != null && Math.abs(db.pixelRatio - expected.pixelRatio) > 0.08) {
      hard.push(
        `${label}: boot pixelRatio ${db.pixelRatio} != formula ${expected.pixelRatio}`,
      );
    }
  }

  for (const key of ['renderScale', 'pixelRatioCap', 'shadows', 'particleQuality']) {
    if (!valuesEqual(route.afterRestore.video[key], route.currentVideo[key])) {
      hard.push(
        `${label}: after current→max→current, video.${key}=${JSON.stringify(route.afterRestore.video[key])} expected ${JSON.stringify(route.currentVideo[key])}`,
      );
    }
  }

  if (route.currentVideo.renderScale !== MAX_VIDEO.renderScale
    && route.boot.drawBuffer && route.atMax.drawBuffer) {
    const bootW = route.boot.drawBuffer.width;
    const maxW = route.atMax.drawBuffer.width;
    const scaleUp = MAX_VIDEO.renderScale / (route.currentVideo.renderScale || 1);
    if (maxW < bootW * Math.min(1.05, scaleUp * 0.9)) {
      hard.push(`${label}: draw buffer did not scale up at max (bootW=${bootW}, maxW=${maxW})`);
    }
    const restoredW = route.afterRestore.drawBuffer?.width;
    if (restoredW != null && Math.abs(restoredW - bootW) > Math.max(8, bootW * 0.12)) {
      hard.push(`${label}: draw buffer not restored (bootW=${bootW}, restoredW=${restoredW})`);
    }
  }

  // Live particle cap/burst at max — expected red until VFX live resize lands.
  const expectedMaxCap = PARTICLE_CAP.high;
  const expectedMaxBurst = QUALITY_BURST.high;
  if (route.atMax.particles.cap !== expectedMaxCap) {
    red.push(`${label}: live max particleCap ${route.atMax.particles.cap} != ${expectedMaxCap} (expected red until VFX pool migration)`);
  }
  if (route.atMax.particles.burst != null
    && Math.abs(route.atMax.particles.burst - expectedMaxBurst) > 1e-6) {
    red.push(`${label}: live max burst ${route.atMax.particles.burst} != ${expectedMaxBurst} (expected red until VFX live quality)`);
  }

  if (route.atMax.video.shadows !== true) {
    hard.push(`${label}: live max shadows setting is not true`);
  }
  if (route.boot.video.shadows === false && route.atMax.video.shadows === true) {
    if (!route.atMax.shadows.keyLightCastShadow && !route.atMax.shadows.shadowMapEnabled) {
      red.push(`${label}: live shadows on after boot-off did not enable cast/map (expected red until renderer seam)`);
    }
    if (!route.atMax.shadows.keyLightPresent) {
      red.push(`${label}: key light unbound after shadows enable from boot-off (expected red until renderer seam)`);
    }
  }

  // Boot consumes the probe-owned profile without rewriting its bytes. Live user changes may then
  // legitimately rewrite the full profile (including updatedAt).
  if (!route.profile.bootRawEqualsSeed) {
    hard.push(`${label}: boot rewrote or failed to consume the probe-owned raw profile bytes`);
  }
  // Profile must not wipe; settings-canonical after restore should match restored video.
  if (route.profile.beforeLive != null && route.profile.afterLive == null) {
    hard.push(`${label}: raw profile wiped during live current→max→current`);
  }
  if (route.profile.afterLive != null) {
    try {
      const parsed = JSON.parse(route.profile.afterLive);
      const pv = parsed?.settings?.video;
      if (pv && !valuesEqual(pv.particleQuality, route.currentVideo.particleQuality)) {
        hard.push(`${label}: profile after restore particleQuality=${pv.particleQuality} != ${route.currentVideo.particleQuality}`);
      }
      if (pv && Math.abs(Number(pv.renderScale) - Number(route.currentVideo.renderScale)) > 1e-6) {
        hard.push(`${label}: profile after restore renderScale=${pv.renderScale} != ${route.currentVideo.renderScale}`);
      }
    } catch {
      hard.push(`${label}: profile after live is not valid JSON`);
    }
  }

  // Listener / resource growth on live cycle and Continue.
  for (const [ev, delta] of Object.entries(route.listeners.liveGrowth || {})) {
    if (delta > 0) {
      hard.push(`${label}: current→max→current grew bus listeners for ${ev} by +${delta}`);
    }
  }
  if ((route.resources.liveGrowth?.scenePoints || 0) > 0) {
    hard.push(`${label}: current→max→current added scene Points (duplicate pool risk)`);
  }
  if ((route.resources.liveGrowth?.directionalLights || 0) > 0) {
    hard.push(`${label}: current→max→current added DirectionalLights (duplicate key-light risk)`);
  }

  const growth = listenerGrowthContinue(route);
  for (const [ev, delta] of Object.entries(growth)) {
    if (delta > 0) {
      hard.push(`${label}: Continue grew bus listeners for ${ev} by +${delta}`);
    }
  }
  if (route.resources.vfxSubsBefore != null && route.resources.vfxSubsAfter != null
    && route.resources.vfxSubsAfter > route.resources.vfxSubsBefore) {
    hard.push(`${label}: Continue grew vfx._subs ${route.resources.vfxSubsBefore} → ${route.resources.vfxSubsAfter}`);
  }
  if (route.resources.beforeContinue && route.resources.afterContinue) {
    const ptsDelta = route.resources.afterContinue.scenePoints - route.resources.beforeContinue.scenePoints;
    if (ptsDelta > 0) {
      hard.push(`${label}: Continue added ${ptsDelta} scene Points`);
    }
    const lightDelta = route.resources.afterContinue.directionalLights
      - route.resources.beforeContinue.directionalLights;
    if (lightDelta > 0) {
      hard.push(`${label}: Continue added ${lightDelta} DirectionalLights`);
    }
  }

  if (route.afterContinue.search !== '') {
    hard.push(`${label}: Continue left query string on URL: ${route.afterContinue.search}`);
  }
}

function listenerGrowthContinue(route) {
  const before = route.listeners?.beforeContinue || {};
  const after = route.listeners?.afterContinue || route.afterContinue?.listeners || {};
  const out = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    out[key] = (after[key] || 0) - (before[key] || 0);
  }
  return out;
}

function effectiveScaleRatio(drawBuffer, video) {
  if (!drawBuffer || !(drawBuffer.cssWidth > 0) || !(drawBuffer.width > 0)) return null;
  const cap = Number(video?.pixelRatioCap) || 2;
  const scale = Number(video?.renderScale) || 1;
  const dpr = Math.min(Number(drawBuffer.devicePixelRatio) || 1, cap);
  const expected = drawBuffer.cssWidth * dpr * scale;
  if (!(expected > 0)) return null;
  return drawBuffer.width / expected;
}

function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
    return Math.abs(a - b) < 1e-6;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Cleanup (fail-closed process/port release)
// ---------------------------------------------------------------------------

async function closeBrowserResources({ page, context, browser, server }) {
  const errors = [];
  for (const [name, res] of [
    ['page', page],
    ['context', context],
    ['browser', browser],
  ]) {
    if (!res) continue;
    try {
      if (name === 'page' && !res.isClosed()) await res.close();
      else if (name !== 'page') await res.close();
    } catch (error) {
      errors.push(`${name}: ${error.message || error}`);
    }
  }
  if (server && typeof server.close === 'function') {
    try { await server.close(); } catch (error) { errors.push(`server: ${error.message || error}`); }
  }
  // Fail closed: owned loopback must not remain reachable.
  if (server?.baseUrl) {
    try {
      await fetch(server.baseUrl, { signal: AbortSignal.timeout(800) });
      errors.push('server remained reachable after close');
    } catch (_) { /* expected: connection refused */ }
  }
  if (errors.length) {
    console.warn('[browser] cleanup warnings:', errors.join('; '));
    // Port still reachable is a hard failure signal for the process.
    if (errors.some((e) => /remained reachable/.test(e))) {
      throw new Error(`browser cleanup failed closed: ${errors.join('; ')}`);
    }
  }
}

async function closeElectronResources({ page, electronApp, childProcess }) {
  const errors = [];
  try {
    if (electronApp && typeof electronApp.close === 'function') {
      await Promise.race([
        electronApp.close(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('electron close timeout')), 20_000)),
      ]);
    }
  } catch (error) {
    errors.push(`app.close: ${error.message || error}`);
    try {
      if (childProcess && !childProcess.killed) childProcess.kill();
    } catch (killErr) {
      errors.push(`kill: ${killErr.message || killErr}`);
    }
  }
  try {
    if (page && !page.isClosed()) await page.close().catch(() => {});
  } catch (_) { /* closed with app */ }
  if (childProcess && childProcess.exitCode == null && !childProcess.killed) {
    try { childProcess.kill(); } catch (e) { errors.push(`force-kill: ${e.message || e}`); }
  }
  if (errors.length) console.warn('[electron] cleanup warnings:', errors.join('; '));
}

function findSystemBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((c) => existsSync(c)) || null;
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    stack: error.stack || null,
  };
}

function printSummary(report) {
  console.log('--- settings-runtime-parity summary ---');
  console.log(JSON.stringify({
    pass: report.pass,
    hardMismatches: report.hardMismatches.length,
    expectedRed: report.expectedRed.length,
    comparison: report.comparison,
    browserBootCap: report.browser?.boot?.particles?.cap,
    electronBootCap: report.electron?.boot?.particles?.cap,
    evidence: report.evidence,
  }, null, 2));
}
