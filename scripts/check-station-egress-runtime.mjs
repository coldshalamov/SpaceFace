#!/usr/bin/env node
// check-station-egress-runtime.mjs — browser smoke for leaving the docked station cleanly.
//
// DESIGN TRUTH (src/ui/station/): leaving is owned by the fascia's Undock launch control
// (.sxb-launch), which carries live departure readiness (Ready / Check / Risk); a not-ready launch
// surfaces the Departure Check first. Implicit exits (Esc, modal backdrop) must never strand the
// player: they surface the same check, which lists the real risks and still offers
// "Launch Anyway". A committed undock returns to flight, clears docked state and resumes the sim.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = 90000;
const DOCK_TIMEOUT_MS = 15000;
// Headless software GL stretches the pre-menu warmup well past 15s under load; budget the
// environment like START_TIMEOUT_MS does, assert the behavior.
const MENU_TIMEOUT_MS = 60000;
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;
let issues = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1460, height: 900 }, deviceScaleFactor: 1 });
  // The game is event-rendered by design: once the main menu parks, the page produces no frames and
  // Playwright's default rAF polling never runs — waits time out while their own predicates are
  // already true. The CSP-safe timer polling is the established fix (check-electron-new-game-launch).
  installCspSafePlaywrightPolling(page);
  issues = collectPageIssues(page, { playerStoreMounted: false, includeWarnings: true });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  // Headless boot is roughly TWICE as slow as a real GPU here, and not because the game is slow:
  // SwiftShader does not expose KHR_parallel_shader_compile, so THREE compiles every program
  // serially on the main thread. Measured on this machine: window.SF.ctx ready at 11,977 ms
  // headless against this 15,000 ms budget — an 80% margin that any load at all tips over, and
  // it did, intermittently, across five checks. A real GPU HAS the extension (verified), so
  // this is an environment allowance, not a behavioural assertion being loosened. Everything
  // these checks actually assert happens after boot and is untouched.
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', MENU_TIMEOUT_MS, 'main menu');
  assert.equal(await clickButton(page, 'New Game'), true, 'main menu should expose New Game');
  await waitForVisible(page, '[data-screen="newGame"] .sf-ng-route', 10000, 'new-game rail');
  await page.evaluate(() => {
    window.__sfStationEgressLaunch = { started: false, failure: null };
    const bus = window.SF && window.SF.bus;
    if (!bus || typeof bus.on !== 'function') return;
    bus.on('game:started', () => { window.__sfStationEgressLaunch.started = true; });
    bus.on('game:startFailed', (payload) => {
      window.__sfStationEgressLaunch.failure = {
        code: String(payload?.code || '').slice(0, 200),
        stage: String(payload?.stage || '').slice(0, 200),
        error: String(payload?.error || payload?.message || payload || '').slice(0, 400),
      };
    });
  });
  assert.equal(await clickButton(page, 'Launch'), true, 'New Game should expose Launch');
  await page.waitForFunction(() => {
    if (window.__sfStationEgressLaunch?.failure) {
      throw new Error(`game:startFailed ${JSON.stringify(window.__sfStationEgressLaunch.failure)}`);
    }
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const render = state && state.render;
    return !!(state && state.mode === 'flight'
      && window.__sfStationEgressLaunch?.started === true
      && player && player.alive && player.hull > 0
      && render && render.flightVeilHoldsSim !== true
      && Number.isFinite(render.firstPlayableFrameAt));
  }, null, { timeout: START_TIMEOUT_MS, polling: 250 }).catch(async (error) => {
    const detail = await page.evaluate(() => {
      const state = window.SF && window.SF.state;
      const render = state && state.render;
      const player = state && state.entities && state.entities.get(state.playerId);
      return {
        launch: window.__sfStationEgressLaunch,
        mode: state && state.mode,
        tick: state && state.tick,
        simTime: state && state.simTime,
        player: player ? {
          id: player.id,
          alive: player.alive !== false,
          hull: player.hull,
        } : null,
        flightVeilHoldsSim: render && render.flightVeilHoldsSim,
        firstPlayableFrameAt: render && render.firstPlayableFrameAt != null
          ? render.firstPlayableFrameAt : null,
        firstPicturePhase: render && render.openingFirstPicturePhase != null
          ? render.openingFirstPicturePhase : null,
      };
    }).catch(() => null);
    throw new Error(`${error.message} :: Station launch state ${JSON.stringify(detail)} :: page errors ${JSON.stringify(issues.errorIssues())}`);
  });

  const dockTarget = await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList && sf.state.entityList.find((e) =>
      e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('No dockable station entity found in first-session sector');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return { stationId: station.data.stationId };
  });
  await waitForVisible(page, '[data-screen="station"] .sx-dock', DOCK_TIMEOUT_MS, 'command dock after dock');

  // ---- docked state ----
  const dockedState = await page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.hidden && r.width > 20 && r.height > 10;
    };
    const undock = document.querySelector('[data-screen="station"] .sxb-launch[data-act="undock"]');
    return {
      stationVisible: visible(document.querySelector('[data-screen="station"]')),
      undockVisible: visible(undock),
      undockReadiness: (undock && undock.querySelector('.sxb-launch__state') || {}).textContent || '',
      docked: window.SF.state.ui.docked,
      timeScale: window.SF.state.timeScale,
    };
  });
  assert.equal(dockedState.stationVisible, true, 'station should be visible after docking');
  assert.equal(dockedState.docked, true, 'state.ui.docked should be true while docked');
  assert.equal(dockedState.timeScale, 0, 'sim should be paused while docked');
  assert.equal(dockedState.undockVisible, true, 'the fascia should expose a visible Undock launch control');
  assert.match(dockedState.undockReadiness.trim(), /^(ready|check|risk)$/i,
    'Undock should carry departure readiness, got: ' + dockedState.undockReadiness);

  // ---- implicit exit (Esc) must surface the Departure Check, never strand ----
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('.sx-pop--dep'), null, { timeout: 15000 })
    .catch(() => { throw new Error('Esc while docked must open the Departure Check (implicit exits confirm)'); });
  assert.equal(await page.evaluate(() => window.SF.state.ui.docked), true,
    'Esc must not undock immediately — it must confirm first');

  // Esc again closes the check without re-opening it, and without undocking. The dismiss runs a
  // modal transition, so poll for the popup to clear instead of sampling once at a fixed 500ms —
  // under SwiftShader load the transition routinely outlives the old sample.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.sx-pop--dep:not([hidden])'), null, { timeout: 15000 })
    .catch(() => { throw new Error('Esc should dismiss the Departure Check'); });
  assert.equal(await page.evaluate(() => window.SF.state.ui.docked), true, 'dismissing the check should keep us docked');

  // ---- committed undock via the fascia launch control returns to flight ----
  await domClick(page, '[data-screen="station"] .sxb-launch[data-act="undock"]');
  // Check/Risk opens the same public departure confirmation exercised above. A tracked
  // first-session contract can make this berth non-ready; confirm it before expecting exit.
  const departureLaunch = '.sx-pop--dep:not([hidden]) [data-pop-launch]';
  await page.waitForFunction((selector) => !!document.querySelector(selector)
    || window.SF.state.ui.docked === false, departureLaunch, { timeout: DOCK_TIMEOUT_MS });
  if (await page.locator(departureLaunch).count()) {
    assert.match(await page.locator(departureLaunch).getAttribute('data-control-label'), /^(Launch anyway|Undock)$/i,
      'departure confirmation must offer an explicit launch');
    await domClick(page, departureLaunch);
  }
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const stack = (state.ui && state.ui.screenStack) || [];
    return !!(state.mode === 'flight' && state.ui.docked === false
      && state.ui.dockedStationId === null && state.timeScale === 1 && !stack.includes('station') &&
      player && player.alive && player.hull > 0);
  }, null, { timeout: DOCK_TIMEOUT_MS });

  const egress = await page.evaluate(() => {
    const sf = window.SF;
    const overlay = document.getElementById('sf-dock-overlay');
    return {
      mode: sf.state.mode,
      docked: sf.state.ui.docked,
      dockedStationId: sf.state.ui.dockedStationId,
      topScreen: sf.ctx.screenManager.top(),
      stack: (sf.state.ui.screenStack || []).slice(),
      timeScale: sf.state.timeScale,
      overlayHidden: !overlay || overlay.hidden || overlay.getAttribute('aria-hidden') === 'true',
    };
  });
  assert.equal(egress.mode, 'flight', 'undock should return to flight mode');
  assert.equal(egress.docked, false, 'undock should clear state.ui.docked');
  assert.equal(egress.timeScale, 1, 'sim should resume after undock');
  assert.equal(egress.dockedStationId, null, 'undock should clear dockedStationId');
  assert.notEqual(egress.topScreen, 'station', 'station screen should be closed after undock');
  assert.equal(egress.stack.includes('station'), false, 'screen stack should not retain station after undock');

  // ---- backdrop egress: also an implicit exit → confirm, then Launch Anyway really leaves ----
  await page.evaluate((stationId) => window.SF.bus.emit('dock:docked', { stationId }), dockTarget.stationId);
  await waitForVisible(page, '[data-screen="station"] .sx-dock', DOCK_TIMEOUT_MS, 'command dock before backdrop egress');
  await page.evaluate(() => {
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop) throw new Error('modal backdrop missing');
    backdrop.click();
  });
  await page.waitForFunction(() => !!document.querySelector('.sx-pop--dep'), null, { timeout: 15000 })
    .catch(() => { throw new Error('backdrop click while docked must open the Departure Check, not strand the player'); });
  assert.equal(await page.evaluate(() => window.SF.state.ui.docked), true,
    'backdrop click must not undock immediately — it must confirm first');

  await domClick(page, '.sx-pop--dep [data-pop-launch]');
  await page.waitForFunction(() => window.SF.state.ui.docked === false
    && window.SF.state.ui.dockedStationId === null && window.SF.state.timeScale === 1
    && window.SF.state.mode === 'flight',
    null, { timeout: DOCK_TIMEOUT_MS });

  assert.deepEqual(issues.errorIssues(), [],
    'station egress probe should not record page errors');
  console.log('Station egress OK: dock -> Esc/backdrop confirm (no strand) -> Undock -> flight restored, sim resumed');
  console.log('Dock target:', dockTarget.stationId);
} catch (err) {
  if (typeof issues !== 'undefined' && issues) console.error('Captured page issues during run:', issues.issues);
  throw err;
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function domClick(page, selector) {
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  }, selector);
  assert.equal(ok, true, 'probe should be able to click: ' + selector);
}

async function waitForVisible(page, selector, timeoutMs, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, selector, { timeout: timeoutMs }).catch((err) => {
    throw new Error('Timed out waiting for ' + label + ': ' + err.message);
  });
}

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const exact = [...document.querySelectorAll('button')].find((b) => normalize(b.textContent) === normalize(wanted));
    const button = exact || [...document.querySelectorAll('button')].find((b) => normalize(b.textContent).includes(normalize(wanted)));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, label);
}

async function startFreshServer() {
  const port = await findFreePort(8230);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], { env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' }, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) if (await isPortFree(port)) return port;
  throw new Error('No free local port found for the station egress runtime check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try { const res = await fetch(url, { method: 'GET' }); return !!res.ok; } catch (_) { return false; }
}
