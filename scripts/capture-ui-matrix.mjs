#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUTPUT_DIR = path.join(ROOT, '.devshots', 'ui-matrix');
export const UI_FRAME_REFERENCE_DIR = path.join(ROOT, 'test', 'ui-frame-references');

const FLIGHT_SETTLE_MS = 1500;
const SURFACE_SETTLE_MS = 1500;
const SHIP_STAGE_SETTLE_MS = 6000;
const MAIN_MENU_TIMEOUT_MS = 90_000;
const NEW_GAME_TIMEOUT_MS = 45_000;

export const MATRIX_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 2560, height: 1080 }),
  Object.freeze({ width: 1920, height: 1080 }),
  Object.freeze({ width: 1280, height: 720 }),
]);

const STANDARD_MODES = Object.freeze([
  Object.freeze({
    id: 'default',
    emulate: Object.freeze({ reducedMotion: 'no-preference', forcedColors: 'none' }),
  }),
  Object.freeze({
    id: 'reduced-motion',
    emulate: Object.freeze({ reducedMotion: 'reduce', forcedColors: 'none' }),
  }),
  Object.freeze({
    id: 'forced-colors',
    emulate: Object.freeze({ reducedMotion: 'no-preference', forcedColors: 'active' }),
  }),
]);

const PSEUDO_MODE = Object.freeze({
  id: 'pseudo-localized',
  emulate: Object.freeze({ reducedMotion: 'no-preference', forcedColors: 'none' }),
  locale: 'qps-ploc',
});

const SURFACE_CAPTURE_ORDER = Object.freeze(['chart', 'footprint', 'range', 'ship']);

export const MATRIX_SURFACES = Object.freeze([
  Object.freeze({
    id: 'flight',
    key: null,
    selectors: Object.freeze([]),
    settleMs: FLIGHT_SETTLE_MS,
  }),
  Object.freeze({
    id: 'ship',
    key: 'F2',
    selectors: Object.freeze(['[data-screen="ship"]']),
    settleMs: SHIP_STAGE_SETTLE_MS,
  }),
  Object.freeze({
    id: 'footprint',
    key: 'F3',
    selectors: Object.freeze(['[data-screen="footprint"]']),
    settleMs: SURFACE_SETTLE_MS,
  }),
  Object.freeze({
    id: 'range',
    key: 'F4',
    selectors: Object.freeze(['[data-screen="range"]']),
    settleMs: SURFACE_SETTLE_MS,
  }),
  Object.freeze({
    id: 'chart',
    key: 'M',
    selectors: Object.freeze(['[data-screen="galaxyMap"]', '[data-screen="localmap"]', '[data-screen="starmap"]']),
    settleMs: SURFACE_SETTLE_MS,
  }),
]);

const SURFACE_BY_ID = new Map(MATRIX_SURFACES.map((surface) => [surface.id, surface]));

export function buildFramePlan() {
  const out = [];
  for (const viewport of MATRIX_VIEWPORTS) {
    for (const mode of [...STANDARD_MODES, PSEUDO_MODE]) {
      for (const surface of MATRIX_SURFACES) {
        out.push(Object.freeze({
          surface: surface.id,
          mode: mode.id,
          viewport: `${viewport.width}x${viewport.height}`,
          width: viewport.width,
          height: viewport.height,
        }));
      }
    }
  }
  return out;
}

export function frameFileName({ surface, mode, width, height }) {
  return `${surface}-${mode}-${width}x${height}.png`;
}

export async function captureUiMatrix(options = {}) {
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const updateReferences = options.updateReferences === true;
  const printTable = options.printTable !== false;
  const quiet = options.quiet === true;
  const plan = buildFramePlan();
  const byName = new Map(plan.map((entry) => [frameFileName(entry), entry]));

  mkdirSync(outputDir, { recursive: true });
  if (updateReferences) mkdirSync(UI_FRAME_REFERENCE_DIR, { recursive: true });

  const { chromium } = await loadPlaywright();
  const server = await startFreshServer();
  const browser = await chromium.launch({ headless: true });

  const captures = [];
  let bootCount = 0;

  try {
    for (const viewport of MATRIX_VIEWPORTS) {
      const primaryBoot = await openBootWithRetry({ browser, baseUrl: server.baseUrl, viewport, locale: null });
      bootCount += 1;
      try {
        for (const mode of STANDARD_MODES) {
          await captureModeSet({
            page: primaryBoot.page,
            viewport,
            mode,
            outputDir,
            captures,
          });
        }
      } finally {
        await primaryBoot.close();
      }

      const pseudoBoot = await openBootWithRetry({ browser, baseUrl: server.baseUrl, viewport, locale: PSEUDO_MODE.locale });
      bootCount += 1;
      try {
        await captureModeSet({
          page: pseudoBoot.page,
          viewport,
          mode: PSEUDO_MODE,
          outputDir,
          captures,
          expectedLocale: PSEUDO_MODE.locale,
        });
      } finally {
        await pseudoBoot.close();
      }
    }
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }

  if (captures.length !== plan.length) {
    throw new Error(`capture matrix incomplete: expected ${plan.length} frames, got ${captures.length}`);
  }

  if (updateReferences) {
    const expectedNames = new Set();
    for (const capture of captures) {
      expectedNames.add(capture.name);
      copyFileSync(capture.path, path.join(UI_FRAME_REFERENCE_DIR, capture.name));
    }
    pruneStaleReferencePngs(expectedNames);
  }

  const enriched = captures
    .map((capture) => ({
      ...capture,
      bytes: statSync(capture.path).size,
      plan: byName.get(capture.name) || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

  const totalBytes = enriched.reduce((sum, row) => sum + row.bytes, 0);

  if (printTable && !quiet) {
    printCaptureTable({
      rows: enriched,
      outputDir,
      updateReferences,
      bootCount,
      totalBytes,
    });
  }

  return {
    outputDir,
    bootCount,
    totalBytes,
    captures: enriched,
    referenceDir: UI_FRAME_REFERENCE_DIR,
    frames: plan.length,
  };
}

function pruneStaleReferencePngs(expectedNames) {
  for (const name of readdirSync(UI_FRAME_REFERENCE_DIR)) {
    if (!/\.png$/i.test(name)) continue;
    if (expectedNames.has(name)) continue;
    rmSync(path.join(UI_FRAME_REFERENCE_DIR, name), { force: true });
  }
}

async function captureModeSet({
  page,
  viewport,
  mode,
  outputDir,
  captures,
  expectedLocale = null,
}) {
  await page.emulateMedia(mode.emulate);
  await ensureFlightIdle(page);
  if (expectedLocale) {
    await page.waitForFunction(
      (locale) => document.documentElement.dataset.locale === locale,
      expectedLocale,
      { timeout: 20_000 },
    );
  }

  await waitForSimTicks(page, 90, 45_000, FLIGHT_SETTLE_MS);
  // The intro live-screen fence fades the comms panel in as it clears; capture after the fade
  // so the flight frame does not show half-faded instrument text.
  await page.waitForFunction(() => !document.body.classList.contains('ui-live-screen'), null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(400);
  await captureSurfaceScreenshot({
    page,
    outputDir,
    captures,
    surface: MATRIX_SURFACES[0],
    modeId: mode.id,
    viewport,
  });

  for (const surfaceId of SURFACE_CAPTURE_ORDER) {
    const surface = SURFACE_BY_ID.get(surfaceId);
    if (!surface) continue;
    await ensureFlightIdle(page);
    await page.keyboard.press(surface.key);
    await waitForAnyVisible(page, surface.selectors, 20_000, `${surface.id} visible`);
    await page.waitForTimeout(surface.settleMs);
    await stabilizeSurfaceForCapture(page, surface.id);
    await captureSurfaceScreenshot({
      page,
      outputDir,
      captures,
      surface,
      modeId: mode.id,
      viewport,
    });
    await closeOpenScreens(page);
  }

  await ensureFlightIdle(page);
}

async function captureSurfaceScreenshot({
  page,
  outputDir,
  captures,
  surface,
  modeId,
  viewport,
}) {
  const entry = {
    surface: surface.id,
    mode: modeId,
    width: viewport.width,
    height: viewport.height,
  };
  const name = frameFileName(entry);
  const dest = path.join(outputDir, name);
  await page.screenshot({ path: dest, fullPage: false, animations: 'disabled' });
  captures.push({ name, path: dest });
}

async function openBoot({ browser, baseUrl, viewport, locale = null }) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    });

    const rootUrl = locale
      ? `${baseUrl}?locale=${encodeURIComponent(locale)}`
      : baseUrl;

    await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(
      () => !!(window.SF && window.SF.state && window.SF.ctx && window.SF.bus),
      null,
      { timeout: 120_000 },
    );
    await waitForAnyVisible(page, ['[data-screen="mainMenu"]'], MAIN_MENU_TIMEOUT_MS, 'main menu');

    if (!(await clickMainMenuNewGame(page))) throw new Error('main menu New Game button missing or disabled');
    await waitForAnyVisible(page, ['[data-screen="newGame"]'], NEW_GAME_TIMEOUT_MS, 'new game screen');
    if (!(await clickNewGameLaunch(page))) throw new Error('new game Launch button missing or disabled');

    await page.waitForFunction(() => {
      const state = window.SF && window.SF.state;
      const player = state && state.entities && state.entities.get(state.playerId);
      return !!(state && state.mode === 'flight' && player && player.alive);
    }, null, { timeout: 120_000 });
    await waitForSimTicks(page, 120, 60_000, 2000);

    return {
      page,
      close: async () => {
        await context.close().catch(() => {});
      },
    };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

async function openBootWithRetry(params, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await openBoot(params);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 4000 * attempt));
    }
  }
  throw new Error(`boot failed after ${attempts} attempt(s): ${lastError && lastError.message ? lastError.message : String(lastError)}`);
}

async function ensureFlightIdle(page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await readUiStatus(page);
    if (status.mode === 'flight' && status.screenOpen === false) return;
    if (status.screenOpen) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      continue;
    }
    await page.waitForTimeout(200);
  }
  throw new Error('Unable to return to idle flight state for capture');
}

async function closeOpenScreens(page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await readUiStatus(page);
    if (!status.screenOpen) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  throw new Error('Escape did not close active screen');
}

async function stabilizeSurfaceForCapture(page, surfaceId) {
  if (surfaceId === 'ship') {
    await waitForShipPreviewReady(page);
    return;
  }
  if (surfaceId === 'range') {
    await stabilizeRangeScreen(page);
    return;
  }
  if (surfaceId === 'chart') {
    await stabilizeChartScreen(page);
  }
}

async function waitForShipPreviewReady(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-screen="ship"] .sx-sw__canvas');
    if (!canvas) return false;
    const ready = String(canvas.dataset.previewReady || '').toLowerCase();
    const state = String(canvas.dataset.previewAssetState || '').toLowerCase();
    return ready === 'true' && state !== 'loading';
  }, null, { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function stabilizeRangeScreen(page) {
  await page.evaluate(() => {
    const sm = window.SF && window.SF.ctx && window.SF.ctx.screenManager;
    const def = sm && typeof sm.getActiveScreenDef === 'function' ? sm.getActiveScreenDef() : null;
    if (!def || def.id !== 'range') return false;
    if (def._rafId) {
      cancelAnimationFrame(def._rafId);
      def._rafId = 0;
    }
    if (!def._sim || typeof def._stepSimulation !== 'function' || typeof def._render !== 'function') return false;
    const STEP_S = 1 / 120;
    const STEPS = Math.round(1.5 / STEP_S);
    def._accumS = 0;
    def._lastTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (let i = 0; i < STEPS; i += 1) def._stepSimulation(STEP_S);
    def._render();
    return true;
  });
  await page.waitForTimeout(50);
}

async function stabilizeChartScreen(page) {
  await page.evaluate(() => {
    const sm = window.SF && window.SF.ctx && window.SF.ctx.screenManager;
    const def = sm && typeof sm.getActiveScreenDef === 'function' ? sm.getActiveScreenDef() : null;
    if (!def || def.id !== 'galaxyMap') return false;
    if (def._animFrame != null) {
      cancelAnimationFrame(def._animFrame);
      def._animFrame = null;
    }
    def._scanRings = [];
    def._iris = null;
    def._scanSweepUntil = 0;
    def._localLiveContacts = 0;
    def._scanPhase = 0;
    def._targetZoom = def._zoom;
    def._lastTime = typeof def._nowMs === 'function'
      ? def._nowMs()
      : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    def._animT = 0;
    if (typeof def._draw === 'function') def._draw();
    if (typeof def._updateInspector === 'function') def._updateInspector();
    return true;
  });
  await page.waitForTimeout(50);
}

async function readUiStatus(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const sm = sf && sf.ctx && sf.ctx.screenManager;
    const mode = state && state.mode ? state.mode : null;
    const screenOpen = !!(sm && typeof sm.isOpen === 'function' && sm.isOpen());
    return { mode, screenOpen };
  });
}

async function waitForAnyVisible(page, selectors, timeout, description) {
  await page.waitForFunction((items) => {
    function visible(node) {
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return !node.hidden
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.01
        && rect.width > 4
        && rect.height > 4;
    }
    return items.some((selector) => visible(document.querySelector(selector)));
  }, selectors, { timeout }).catch((error) => {
    throw new Error(`${description} timeout (${timeout}ms): ${error.message}`);
  });
}

async function waitForSimTicks(page, deltaTicks, timeoutMs, fallbackMs) {
  const startTick = await page.evaluate(() => {
    const state = window.SF && window.SF.state;
    return state && Number.isFinite(state.tick) ? state.tick : null;
  });
  if (!Number.isFinite(startTick)) {
    await page.waitForTimeout(fallbackMs);
    return;
  }
  await page.waitForFunction(({ start, delta }) => {
    const state = window.SF && window.SF.state;
    return !!(state && Number.isFinite(state.tick) && state.tick >= start + delta);
  }, { start: startTick, delta: Math.max(1, deltaTicks) }, { timeout: timeoutMs })
    .catch(async () => {
      await page.waitForTimeout(fallbackMs);
    });
}

async function clickMainMenuNewGame(page) {
  for (let i = 0; i < 360; i += 1) {
    const clicked = await page.evaluate(() => {
      const button = document.querySelector('[data-screen="mainMenu"] .sf-col > button');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    });
    if (clicked) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function clickNewGameLaunch(page) {
  for (let i = 0; i < 240; i += 1) {
    const clicked = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[data-screen="newGame"] .sf-ng-footer button')];
      const launch = buttons[buttons.length - 1];
      if (!launch || launch.disabled) return false;
      launch.click();
      return true;
    });
    if (clicked) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

function printCaptureTable({
  rows,
  outputDir,
  updateReferences,
  bootCount,
  totalBytes,
}) {
  console.log('\nUI matrix capture table');
  console.log('surface      mode             viewport      bytes      file');
  for (const row of rows) {
    const plan = row.plan || {};
    const surface = String(plan.surface || '').padEnd(12);
    const mode = String(plan.mode || '').padEnd(16);
    const viewport = String(plan.viewport || '').padEnd(13);
    const bytes = String(row.bytes).padStart(9);
    console.log(`${surface} ${mode} ${viewport} ${bytes}  ${row.name}`);
  }
  console.log(`\nframes: ${rows.length}   boots: ${bootCount}   total bytes: ${totalBytes}`);
  console.log(`devshots: ${outputDir}`);
  if (updateReferences) console.log(`references updated: ${UI_FRAME_REFERENCE_DIR}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 160; port += 1) {
    const free = await new Promise((resolve) => {
      const socket = createNetServer();
      socket.once('error', () => resolve(false));
      socket.once('listening', () => socket.close(() => resolve(true)));
      socket.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free probe port');
}

async function startFreshServer() {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const seedPort = 16000 + Math.floor(Math.random() * 32000);
    const port = await findFreePort(seedPort);
    const baseUrl = `http://127.0.0.1:${port}/`;
    const child = spawn(process.execPath, ['server.js', String(port)], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });

    let alive = true;
    child.once('exit', () => { alive = false; });

    for (let i = 0; i < 120; i += 1) {
      if (!alive || child.exitCode != null) break;
      try {
        const response = await fetch(baseUrl);
        if (response.ok) {
          return {
            baseUrl,
            kill: () => {
              try { child.kill(); } catch (_) {}
            },
          };
        }
      } catch (_) {
        // keep probing
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    try { child.kill(); } catch (_) {}
  }
  throw new Error('server did not become reachable after 6 attempts');
}

function parseArgs(argv) {
  return {
    updateReferences: argv.includes('--update'),
    quiet: argv.includes('--quiet'),
  };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const result = await captureUiMatrix({
    outputDir: DEFAULT_OUTPUT_DIR,
    updateReferences: args.updateReferences,
    printTable: true,
    quiet: args.quiet,
  });
  console.log(`capture:ui-matrix complete — ${result.frames} frames`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}
