#!/usr/bin/env node
// New Game preflight layout check (headed visual evidence by default; headless in CI).
//
// Exercises the canonical main-menu route with keyboard input only, stops game:new before the
// asset-gated flight path, and proves the setup panel keeps its actions visible while only its
// content body scrolls at the supported desktop viewports.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = join(ROOT, '.devshots', 'alpha', 'm1-new-game-layout');
const ARGUMENTS = new Set(process.argv.slice(2));
const FORCE_RECORD_RED = ARGUMENTS.has('--force-record-red');
const RECORD_RED = ARGUMENTS.has('--record-red') || FORCE_RECORD_RED;
const EXPLICIT_HEADLESS = ARGUMENTS.has('--headless');
const EXPLICIT_HEADED = ARGUMENTS.has('--headed');
if (EXPLICIT_HEADLESS && EXPLICIT_HEADED) throw new Error('--headless and --headed are mutually exclusive');
const HEADLESS = EXPLICIT_HEADLESS;
const LABEL = RECORD_RED ? 'before' : HEADLESS ? 'ci' : 'after';
const REPORT_PATH = join(OUT_DIR, RECORD_RED
  ? 'red-layout-report.json'
  : HEADLESS ? 'layout-headless-report.json' : 'layout-report.json');
const LOG_PATH = join(OUT_DIR, RECORD_RED
  ? 'tdd-red.log'
  : HEADLESS ? 'layout-headless.log' : 'layout-check.log');
const RED_ARTIFACT_NAMES = Object.freeze([
  'red-layout-report.json',
  'tdd-red.log',
  'before-1024x768.png',
  'before-1280x720.png',
  'before-1440x900.png',
]);
const VIEWPORTS = Object.freeze([
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]);

assertRedArtifactsWritable();
const { chromium } = await loadPlaywright();
mkdirSync(OUT_DIR, { recursive: true });

let server = null;
let browser = null;
const results = [];

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: HEADLESS });

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageIssues = collectPageIssues(page, { ignoreProbeWarnings: true });
    const result = {
      viewport,
      pass: false,
      screenshot: `${LABEL}-${viewport.width}x${viewport.height}.png`,
      metrics: null,
      tabOrder: [],
      modalSemantics: null,
      launchPayload: null,
      backReturnedToMainMenu: false,
      gpu: null,
      errors: [],
      pageIssues: [],
      ignoredPageIssues: [],
    };

    try {
      await openNewGameWithKeyboard(page, server.baseUrl);
      result.gpu = await readGpuIdentity(page);
      await page.screenshot({ path: join(OUT_DIR, result.screenshot), fullPage: false });

      const newGameModal = await collectModalSemantics(page);
      assertModalSemantics(viewport, newGameModal, 'newGame');

      result.metrics = await collectLayoutMetrics(page);
      assertLayout(viewport, result.metrics);

      result.tabOrder = await verifyNewGameTabOrder(page);
      assert.deepEqual(
        result.tabOrder.map((entry) => entry.control),
        ['pilot-name', 'difficulty', 'universe-seed', 'back', 'launch'],
        `${viewport.width}x${viewport.height}: New Game tab order must reach both actions directly`,
      );
      assert.equal(
        result.tabOrder.every((entry) => entry.panelScrollTop === 0 && entry.bodyScrollTop === 0),
        true,
        `${viewport.width}x${viewport.height}: keyboard traversal must not scroll the setup body or panel`,
      );

      if (viewport === VIEWPORTS[0]) {
        result.launchPayload = await activateLaunchWithoutStartingGame(page);
        assert.deepEqual(result.launchPayload, {
          name: 'Wren',
          shipId: 'ship_kestrel',
          difficulty: 'standard',
        }, 'Enter on Launch must emit the unchanged game:new payload');
      }

      result.backReturnedToMainMenu = await activateBackWithKeyboard(page);
      assert.equal(
        result.backReturnedToMainMenu,
        true,
        `${viewport.width}x${viewport.height}: Enter on Back must return to Main Menu`,
      );
      const mainMenuModal = await collectModalSemantics(page);
      assertModalSemantics(viewport, mainMenuModal, 'mainMenu');
      assert.equal(
        mainMenuModal.activeControlText,
        'New Game',
        `${viewport.width}x${viewport.height}: Back must restore focus to the New Game opener`,
      );
      result.modalSemantics = { newGame: newGameModal, mainMenu: mainMenuModal };

      result.pageIssues = summarizeIssues(relevantLayoutIssues(pageIssues.errorIssues()));
      result.ignoredPageIssues = summarizeIssues(ignoredLayoutIssues(pageIssues.errorIssues()));
      assert.deepEqual(
        result.pageIssues,
        [],
        `${viewport.width}x${viewport.height}: canonical preflight should not report page errors`,
      );
      result.pass = true;
    } catch (error) {
      result.errors.push(error && error.message ? error.message : String(error));
      result.pageIssues = summarizeIssues(relevantLayoutIssues(pageIssues.errorIssues()));
      result.ignoredPageIssues = summarizeIssues(ignoredLayoutIssues(pageIssues.errorIssues()));
    } finally {
      results.push(result);
      await context.close();
    }
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.kill) await server.kill().catch(() => {});
}

const failures = results.flatMap((result) => result.errors.map((message) => ({
  viewport: `${result.viewport.width}x${result.viewport.height}`,
  message,
})));
const report = {
  schema: 'spaceface.newGameLayoutCheck.v1',
  generatedAt: new Date().toISOString(),
  headed: !HEADLESS,
  canonicalRoute: server && server.baseUrl ? server.baseUrl : null,
  pass: failures.length === 0 && results.every((result) => result.pass),
  results,
  failures,
};
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

const logLines = [
  `${report.pass ? 'PASS' : 'FAIL'} New Game ${HEADLESS ? 'headless CI' : 'headed'} layout check`,
  `route=${report.canonicalRoute || 'unavailable'}`,
  ...results.map((result) => {
    const metrics = result.metrics;
    const geometry = metrics && metrics.footer
      ? `panel=${Math.round(metrics.panel.height)}px body=${Math.round(metrics.body.clientHeight)}/${Math.round(metrics.body.scrollHeight)}px footerBottom=${Math.round(metrics.footer.bottom)}px`
      : metrics
        ? `panel=${Math.round(metrics.panel.height)}px fixedRegions=missing`
        : 'metrics=unavailable';
    return `${result.viewport.width}x${result.viewport.height} ${result.pass ? 'PASS' : 'FAIL'} ${geometry}`;
  }),
  ...failures.map((failure) => `${failure.viewport}: ${failure.message}`),
];
writeFileSync(LOG_PATH, `${logLines.join('\n')}\n`);

if (!report.pass) {
  console.error(logLines.join('\n'));
  process.exitCode = 1;
} else {
  console.log(logLines.join('\n'));
  console.log(`[new-game-layout] report: ${relativeOutput(REPORT_PATH)}`);
}

async function openNewGameWithKeyboard(page, url = null) {
  if (url) {
    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
      try { localStorage.setItem('sf.firstRunIntroSeen', '1'); } catch (_) {}
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 20000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 'Main Menu');
  await waitForBootOverlayGone(page);
  await focusButtonWithKeyboard(page, 'New Game');
  await page.keyboard.press('Enter');
  await waitForVisible(page, '[data-screen="newGame"]', 'New Game');
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-screen="newGame"]');
    return panel && panel.querySelector('input[type="text"]') === document.activeElement;
  }, null, { timeout: 5000 });
}

async function focusButtonWithKeyboard(page, label) {
  const focused = async () => page.evaluate((wanted) => {
    const active = document.activeElement;
    return !!(active && active.tagName === 'BUTTON' && active.textContent.trim() === wanted);
  }, label);
  if (await focused()) return;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    if (await focused()) return;
  }
  throw new Error(`keyboard could not focus ${label}`);
}

async function verifyNewGameTabOrder(page) {
  const order = [];
  order.push(await focusedControlSnapshot(page));
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    order.push(await focusedControlSnapshot(page));
  }
  return order;
}

async function focusedControlSnapshot(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-screen="newGame"]');
    const body = panel && panel.querySelector('.sf-ng-body');
    const active = document.activeElement;
    const name = panel && panel.querySelector('input[type="text"]');
    const seed = panel && panel.querySelector('#sf-ng-seed');
    const difficulty = panel && panel.querySelector('select');
    const buttons = panel ? Array.from(panel.querySelectorAll('button')) : [];
    let control = active === name ? 'pilot-name' : active === difficulty ? 'difficulty' : 'unknown';
    if (active === seed) control = 'universe-seed';
    if (buttons.includes(active)) control = active.textContent.trim().toLowerCase();
    return {
      control,
      panelScrollTop: panel ? panel.scrollTop : -1,
      bodyScrollTop: body ? body.scrollTop : -1,
    };
  });
}

async function activateLaunchWithoutStartingGame(page) {
  await page.evaluate(() => {
    const bus = window.SF.bus;
    const originalEmit = bus.emit.bind(bus);
    window.__sfLayoutGameNewEvents = [];
    window.__sfLayoutRestoreEmit = () => { bus.emit = originalEmit; };
    bus.emit = (type, payload) => {
      if (type === 'game:new') {
        window.__sfLayoutGameNewEvents.push({
          name: payload && payload.name,
          shipId: payload && payload.shipId,
          difficulty: payload && payload.difficulty,
        });
        return undefined;
      }
      return originalEmit(type, payload);
    };
  });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Launch',
    'Launch must be focused before keyboard activation');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sfLayoutGameNewEvents?.length === 1, null, { timeout: 3000 });
  return page.evaluate(() => {
    const payload = window.__sfLayoutGameNewEvents[0];
    window.__sfLayoutRestoreEmit?.();
    window.SF.bus.emit('game:startFailed', { reason: 'layout-check-intercept' });
    return payload;
  });
}

async function activateBackWithKeyboard(page) {
  await focusButtonWithKeyboard(page, 'Back');
  await page.keyboard.press('Enter');
  await waitForVisible(page, '[data-screen="mainMenu"]', 'Main Menu after Back');
  return page.evaluate(() => {
    const main = document.querySelector('[data-screen="mainMenu"]');
    const setup = document.querySelector('[data-screen="newGame"]');
    return !!(main && getComputedStyle(main).display !== 'none'
      && (!setup || getComputedStyle(setup).display === 'none'));
  });
}

async function collectLayoutMetrics(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-screen="newGame"]');
    const header = panel && panel.querySelector('.sf-ng-header');
    const body = panel && panel.querySelector('.sf-ng-body');
    const footer = panel && panel.querySelector('.sf-ng-footer');
    const back = panel && Array.from(panel.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Back');
    const launch = panel && Array.from(panel.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Launch');
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const unobscured = (element) => {
      if (!element) return false;
      const value = element.getBoundingClientRect();
      const top = document.elementFromPoint(value.left + value.width / 2, value.top + value.height / 2);
      return top === element || element.contains(top);
    };
    const before = { header: rect(header), footer: rect(footer) };
    if (body) body.scrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
    const after = { header: rect(header), footer: rect(footer) };
    if (body) body.scrollTop = 0;
    const panelStyle = panel ? getComputedStyle(panel) : null;
    const bodyStyle = body ? getComputedStyle(body) : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      panel: { ...rect(panel), scrollTop: panel ? panel.scrollTop : -1, overflowY: panelStyle?.overflowY || null },
      header: rect(header),
      body: {
        ...rect(body),
        clientHeight: body ? body.clientHeight : -1,
        scrollHeight: body ? body.scrollHeight : -1,
        overflowY: bodyStyle?.overflowY || null,
      },
      footer: rect(footer),
      back: { ...rect(back), unobscured: unobscured(back) },
      launch: { ...rect(launch), unobscured: unobscured(launch) },
      fixedBandShift: {
        header: before.header && after.header ? Math.abs(before.header.top - after.header.top) : null,
        footer: before.footer && after.footer ? Math.abs(before.footer.top - after.footer.top) : null,
      },
    };
  });
}

async function collectModalSemantics(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-screen]')).map((element) => ({
      id: element.getAttribute('data-screen'),
      display: getComputedStyle(element).display,
      role: element.getAttribute('role'),
      ariaLabel: element.getAttribute('aria-label'),
      ariaLabelledBy: element.getAttribute('aria-labelledby'),
      ariaModal: element.getAttribute('aria-modal'),
      ariaHidden: element.getAttribute('aria-hidden'),
      inert: element.inert === true,
      containsFocus: element.contains(document.activeElement),
    }));
    const active = rows.find((row) => row.display !== 'none') || null;
    const screens = document.getElementById('screens');
    const backdrop = document.getElementById('modal-backdrop');
    return {
      active,
      rows,
      modalOwners: rows.filter((row) => row.ariaModal === 'true').map((row) => row.id),
      screens: {
        ariaHidden: screens?.getAttribute('aria-hidden') ?? null,
        inert: screens?.inert === true,
      },
      backdropAriaHidden: backdrop?.getAttribute('aria-hidden') ?? null,
      activeControlText: String(document.activeElement?.textContent || '').trim(),
    };
  });
}

function assertModalSemantics(viewport, snapshot, expectedId) {
  const label = `${viewport.width}x${viewport.height} ${expectedId}`;
  assert.equal(snapshot.active?.id, expectedId, `${label}: expected screen must be the sole visible modal`);
  assert.equal(snapshot.active?.role, 'dialog', `${label}: active screen must expose dialog semantics`);
  assert.equal(snapshot.active?.ariaModal, 'true', `${label}: active screen must own aria-modal`);
  assert.equal(snapshot.active?.ariaHidden, null, `${label}: active screen must remain in the accessibility tree`);
  assert.equal(snapshot.active?.inert, false, `${label}: active screen must accept keyboard focus`);
  assert.equal(snapshot.active?.containsFocus, true, `${label}: keyboard focus must remain inside the active screen`);
  assert(snapshot.active?.ariaLabel || snapshot.active?.ariaLabelledBy,
    `${label}: active dialog must have an accessible name`);
  assert.deepEqual(snapshot.modalOwners, [expectedId], `${label}: exactly one screen may own modal semantics`);
  assert.equal(snapshot.screens.ariaHidden, null, `${label}: open screen root must remain exposed`);
  assert.equal(snapshot.screens.inert, false, `${label}: open screen root must remain keyboard reachable`);
  assert.equal(snapshot.backdropAriaHidden, 'true', `${label}: visual backdrop must stay decorative`);
  for (const row of snapshot.rows) {
    if (row.id === expectedId) continue;
    assert.equal(row.display, 'none', `${label}: cached ${row.id} screen must stay visually hidden`);
    assert.equal(row.ariaHidden, 'true', `${label}: cached ${row.id} screen must leave the accessibility tree`);
    assert.equal(row.ariaModal, null, `${label}: cached ${row.id} screen cannot own aria-modal`);
    assert.equal(row.inert, true, `${label}: cached ${row.id} screen cannot receive keyboard focus`);
  }
}

async function readGpuIdentity(page) {
  return page.evaluate(() => {
    const published = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.gpu;
    if (published && published.renderer) {
      return [published.vendor, published.renderer].filter(Boolean).join(' / ');
    }
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 'WebGL unavailable';
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    if (debug) {
      return [
        gl.getParameter(debug.UNMASKED_VENDOR_WEBGL),
        gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
      ].filter(Boolean).join(' / ');
    }
    return String(gl.getParameter(gl.RENDERER) || 'WebGL renderer unavailable');
  });
}

function assertLayout(viewport, metrics) {
  const label = `${viewport.width}x${viewport.height}`;
  assert(metrics.panel && metrics.header && metrics.body && metrics.footer,
    `${label}: New Game must expose dedicated header, scrolling body, and action footer regions`);
  assert.equal(metrics.panel.overflowY, 'hidden', `${label}: the outer New Game panel must not scroll`);
  assert(['auto', 'scroll'].includes(metrics.body.overflowY), `${label}: the form body must own vertical scrolling`);
  assert.equal(metrics.panel.scrollTop, 0, `${label}: the outer panel must remain at scrollTop 0`);
  assert(metrics.body.clientHeight > 0 && metrics.body.scrollHeight >= metrics.body.clientHeight,
    `${label}: the form body must have a valid independent scroll viewport`);
  assert(metrics.fixedBandShift.header <= 0.5 && metrics.fixedBandShift.footer <= 0.5,
    `${label}: scrolling form content must not move the header or footer`);

  for (const [name, rect] of [['Back', metrics.back], ['Launch', metrics.launch]]) {
    assert(rect && rect.width > 0 && rect.height > 0, `${label}: ${name} must render at a usable size`);
    assert(rect.left >= 0 && rect.top >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height,
      `${label}: ${name} must be fully inside the viewport on initial render`);
    assert(rect.left >= metrics.panel.left && rect.top >= metrics.panel.top
      && rect.right <= metrics.panel.right && rect.bottom <= metrics.panel.bottom,
    `${label}: ${name} must be fully inside the New Game panel`);
    assert.equal(rect.unobscured, true, `${label}: ${name} must not be clipped or obscured`);
  }
}

async function waitForVisible(page, selector, label) {
  await page.waitForFunction((wanted) => {
    const element = document.querySelector(wanted);
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }, selector, { timeout: 15000 }).catch((error) => {
    throw new Error(`${label} did not become visible: ${error.message}`);
  });
}

async function waitForBootOverlayGone(page) {
  await page.waitForFunction(() => {
    const overlay = document.querySelector('.sf-boot-overlay');
    if (!overlay) return true;
    const style = getComputedStyle(overlay);
    return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.01;
  }, null, { timeout: 20000 }).catch(() => {});
}

async function startFreshServer() {
  const port = await findFreePort(8160);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      gameServer.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      gameServer.off('error', onError);
      resolve();
    };
    gameServer.once('error', onError);
    gameServer.once('listening', onListening);
    gameServer.listen(port, '127.0.0.1');
  });
  return {
    baseUrl,
    kill: () => new Promise((resolve, reject) => {
      if (!gameServer.listening) { resolve(); return; }
      gameServer.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function findFreePort(start) {
  for (let port = start; port < start + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free port found for New Game layout check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

function assertRedArtifactsWritable() {
  if (!RECORD_RED || FORCE_RECORD_RED) return;
  const existing = RED_ARTIFACT_NAMES.filter((name) => existsSync(join(OUT_DIR, name)));
  if (!existing.length) return;
  throw new Error(
    'Refusing to overwrite historical RED evidence: '
      + existing.join(', ')
      + '. Use --force-record-red only when intentionally replacing the recorded baseline.',
  );
}

function relevantLayoutIssues(issues) {
  return (issues || []).filter((issue) => !isDisposedPreviewRequest(issue));
}

function ignoredLayoutIssues(issues) {
  return (issues || []).filter(isDisposedPreviewRequest);
}

function isDisposedPreviewRequest(issue) {
  return issue && issue.type === 'error'
    && /^Request failed blob:.*net::ERR_ABORTED$/i.test(String(issue.text || ''));
}

function relativeOutput(file) {
  return file.slice(ROOT.length).replace(/\\/g, '/').replace(/^\//, '');
}
