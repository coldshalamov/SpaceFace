#!/usr/bin/env node
// check-station-egress-runtime.mjs - browser smoke for station exit confidence.
//
// Boots the normal player URL, starts a real New Game through the UI, opens the station hub through
// the same dock:docked event used by flight, verifies the hub exposes the core station affordances,
// then clicks the visible Undock button and proves the default route returns to playable flight.
// This is a QA probe only: it does not change assets, render settings, launch URLs, or gameplay.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = 45000;
const DOCK_TIMEOUT_MS = 15000;
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'station egress probe must use the canonical root URL with no query flags');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');

  assert.equal(await clickButton(page, 'New Game'), true, 'main menu should expose New Game');
  await waitForVisible(page, '[data-screen="newGame"] .sf-ng-route', 10000, 'new-game first-session rail');
  assert.equal(await clickButton(page, 'Launch'), true, 'New Game should expose Launch');
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });

  const dockTarget = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const station = state && state.entityList && state.entityList.find((e) =>
      e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('No dockable station entity found in first-session sector');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return {
      stationId: station.data.stationId,
      label: station.data.name || station.data.stationName || station.data.stationId,
    };
  });

  await waitForVisible(page, '[data-screen="station"]', DOCK_TIMEOUT_MS, 'station hub after dock');
  await page.waitForTimeout(100);

  const stationReport = await page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
    };
    const screen = document.querySelector('[data-screen="station"]');
    const text = (screen && screen.textContent || '').replace(/\s+/g, ' ').trim();
    const tabs = [...document.querySelectorAll('[data-screen="station"] [data-tab]')]
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const undock = [...document.querySelectorAll('[data-screen="station"] button')]
      .find((button) => /UNDOCK/i.test(button.textContent || ''));
    const purpose = (document.querySelector('[data-screen="station"] .st-purpose')?.textContent || '').replace(/\s+/g, ' ').trim();
    const departure = document.querySelector('[data-screen="station"] .st-departure');
    const departureChips = [...document.querySelectorAll('[data-screen="station"] .st-departure-chip')].map((chip) => ({
      label: (chip.querySelector('b') && chip.querySelector('b').textContent || '').trim(),
      text: (chip.querySelector('span') && chip.querySelector('span').textContent || '').trim(),
      className: chip.className,
    }));
    return {
      visible: visible(screen),
      text,
      tabs,
      hasUndock: !!undock && visible(undock),
      undockText: undock ? (undock.textContent || '').trim() : '',
      purpose,
      departureVisible: visible(departure),
      departureLabel: (document.querySelector('[data-screen="station"] .st-departure-label')?.textContent || '').trim(),
      departureChips,
      activeTab: window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.activeStationTab,
      docked: window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.docked,
    };
  });

  assert.equal(stationReport.visible, true, 'station hub should be visible after docking');
  assert.equal(stationReport.docked, true, 'state.ui.docked should be true while station hub is open');
  assert.equal(stationReport.hasUndock, true, 'station hub should expose a visible Undock button');
  for (const tab of ['Market', 'Missions', 'Services', 'Bar']) {
    assert(stationReport.tabs.some((label) => label.includes(tab)), 'station hub missing rail tab: ' + tab);
  }
  assert.match(stationReport.purpose, /Current tab:|Available here:/, 'station hub should explain current tab and services before exit');
  assert.equal(stationReport.departureVisible, true, 'station hub should expose the Departure Check strip before exit');
  assert.equal(stationReport.departureLabel, 'Departure Check', 'departure readiness strip should be labeled');
  for (const label of ['Hold', 'Fuel', 'Hull']) {
    assert(stationReport.departureChips.some((chip) => chip.label === label),
      `departure readiness missing ${label} chip: ${JSON.stringify(stationReport.departureChips)}`);
  }
  assert(stationReport.departureChips.some((chip) => chip.label === 'Track' || chip.label === 'Nav' || chip.label === 'Route'),
    'departure readiness must summarize tracked mission or nav guidance before undock');

  assert.equal(await clickButton(page, stationReport.undockText), true, 'station hub Undock button should be clickable');
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const stack = state && state.ui && state.ui.screenStack || [];
    return !!(state && state.mode === 'flight' && state.ui && state.ui.docked === false &&
      !stack.includes('station') && player && player.alive && player.hull > 0);
  }, null, { timeout: DOCK_TIMEOUT_MS });

  const egressReport = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    const dockOverlay = document.getElementById('sf-dock-overlay');
    return {
      mode: state.mode,
      docked: state.ui.docked,
      dockedStationId: state.ui.dockedStationId,
      topScreen: sf.ctx.screenManager.top(),
      screenStack: state.ui.screenStack.slice(),
      playerAlive: !!(player && player.alive && player.hull > 0),
      overlayHidden: !dockOverlay || dockOverlay.hidden || dockOverlay.getAttribute('aria-hidden') === 'true',
    };
  });

  assert.equal(egressReport.mode, 'flight', 'undock should return to flight mode');
  assert.equal(egressReport.docked, false, 'undock should clear state.ui.docked');
  assert.equal(egressReport.dockedStationId, null, 'undock should clear dockedStationId');
  assert.notEqual(egressReport.topScreen, 'station', 'station screen should be closed after undock');
  assert.equal(egressReport.screenStack.includes('station'), false, 'screen stack should not retain station after undock');
  assert.equal(egressReport.playerAlive, true, 'player should remain alive after station egress');
  assert.deepEqual(issues.errorIssues(), [], 'station egress runtime probe should not record page errors');

  console.log('Station egress runtime OK: default New Game -> station hub -> visible Undock -> playable flight');
  console.log('Dock target:', dockTarget.stationId, dockTarget.label);
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
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
    const exact = [...document.querySelectorAll('button')]
      .find((b) => normalize(b.textContent) === normalize(wanted));
    const button = exact || [...document.querySelectorAll('button')]
      .find((b) => normalize(b.textContent).includes(normalize(wanted)));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, label);
}

async function startFreshServer() {
  const port = await findFreePort(8140);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for station egress runtime check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}
