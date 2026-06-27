#!/usr/bin/env node
// check-station-tab-navigation-runtime.mjs - browser smoke for station rail keyboard parity.
//
// Boots the canonical player URL, starts a real New Game through the UI, docks through the same
// dock:docked event path used by flight, then drives the visible station rail with keyboard input.
// This is a QA probe only: it does not change routes, assets, render settings, or gameplay defaults.
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
    window.stationTabSnapshot = () => {
      const visible = (el) => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.hidden && r.width > 20 && r.height > 10;
      };
      const tabs = [...document.querySelectorAll('[data-screen="station"] [role="tab"][data-tab]')];
      const activeTab = window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.activeStationTab;
      const activePanel = document.querySelector(`[data-screen="station"] #st-panel-${activeTab}`);
      return {
        activeTab,
        focusedTab: document.activeElement && document.activeElement.getAttribute('data-tab'),
        activePanelId: visible(activePanel) ? activePanel.id : null,
        selectedCount: tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').length,
        tabbableCount: tabs.filter((tab) => tab.getAttribute('tabindex') === '0').length,
        tabs: tabs.map((tab) => ({
          tabId: tab.getAttribute('data-tab'),
          selected: tab.getAttribute('aria-selected'),
          tabIndex: tab.getAttribute('tabindex'),
        })),
      };
    };
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'station tab probe must use the canonical root URL with no query flags');
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

  const initial = await page.evaluate(() => {
    const rail = document.querySelector('[data-screen="station"] .st-rail');
    const tabs = [...document.querySelectorAll('[data-screen="station"] [role="tab"][data-tab]')];
    const panels = [...document.querySelectorAll('[data-screen="station"] [role="tabpanel"]')];
    const active = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || tabs[0];
    if (active) active.focus();
    return {
      railRole: rail && rail.getAttribute('role'),
      railLabel: rail && rail.getAttribute('aria-label'),
      tabs: tabs.map((tab) => ({
        id: tab.id,
        tabId: tab.getAttribute('data-tab'),
        selected: tab.getAttribute('aria-selected'),
        tabIndex: tab.getAttribute('tabindex'),
        controls: tab.getAttribute('aria-controls'),
        focusable: tab === active,
      })),
      panelIds: panels.map((panel) => panel.id),
      focusedTab: document.activeElement && document.activeElement.getAttribute('data-tab'),
      activeTab: window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.activeStationTab,
    };
  });

  assert.equal(initial.railRole, 'tablist', 'station rail should expose role=tablist');
  assert.equal(initial.railLabel, 'Station sections', 'station rail should have a useful accessible label');
  assert.deepEqual(initial.tabs.map((tab) => tab.tabId), [
    'market', 'shipyard', 'outfit', 'manufacture', 'missions', 'services', 'factions', 'bar',
  ], 'station rail should preserve authored tab order');
  for (const tab of initial.tabs) {
    assert.equal(tab.controls, 'st-panel-' + tab.tabId, 'tab should point at its owned panel: ' + tab.tabId);
    assert(initial.panelIds.includes(tab.controls), 'tab panel should exist for: ' + tab.tabId);
  }
  assert.equal(initial.tabs.filter((tab) => tab.selected === 'true').length, 1, 'exactly one station tab should be selected');
  assert.equal(initial.tabs.filter((tab) => tab.tabIndex === '0').length, 1, 'exactly one station tab should be tabbable');
  assert.equal(initial.focusedTab, initial.activeTab, 'focus should start on the active station tab');

  await pressAndExpect(page, 'End', 'bar');
  await pressAndExpect(page, 'Home', 'market');
  await pressAndExpect(page, 'ArrowDown', 'shipyard');
  await pressAndExpect(page, 'ArrowRight', 'outfit');
  await pressAndExpect(page, 'PageDown', 'manufacture');
  await pressAndExpect(page, 'PageUp', 'outfit');
  await pressAndExpect(page, 'ArrowUp', 'shipyard');
  await focusAndExpect(page, 'services', 'Enter');
  await focusAndExpect(page, 'missions', 'Space');

  const final = await page.evaluate(() => stationTabSnapshot());
  assert.equal(final.activeTab, 'missions', 'final keyboard activation should land on Missions');
  assert.equal(final.activePanelId, 'st-panel-missions', 'selected tab should reveal its owned panel');
  assert.equal(final.focusedTab, 'missions', 'rail focus should remain on the selected tab after keyboard navigation');
  assert.equal(final.selectedCount, 1, 'station rail should retain a single selected tab after keyboard navigation');
  assert.equal(final.tabbableCount, 1, 'station rail should retain one roving tab stop after keyboard navigation');

  const departure = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('[data-screen="station"] .st-departure-chip')];
    return {
      chips: chips.map((chip) => ({
        text: String(chip.textContent || '').replace(/\s+/g, ' ').trim(),
        tag: chip.tagName,
        target: chip.getAttribute('data-departure-tab'),
        label: chip.getAttribute('aria-label'),
      })),
    };
  });
  assert(departure.chips.length >= 4, 'Departure Check should expose route/track, hold, fuel, and hull chips');
  for (const wanted of ['market', 'missions', 'services']) {
    assert(departure.chips.some((chip) => chip.target === wanted),
      'Departure Check should expose an actionable chip for ' + wanted + ': ' + JSON.stringify(departure.chips));
  }
  assert(departure.chips.every((chip) => chip.tag === 'BUTTON' && chip.label),
    'Departure Check actionable chips should be keyboard-accessible buttons with labels: ' + JSON.stringify(departure.chips));

  await clickDepartureAndExpect(page, 'services');
  await clickDepartureAndExpect(page, 'market');
  await clickDepartureAndExpect(page, 'missions');
  assert.deepEqual(issues.errorIssues(), [], 'station tab navigation probe should not record page errors');

  console.log('Station tab navigation OK: canonical New Game -> dock -> keyboard rail + departure chips -> coherent active panel');
  console.log('Dock target:', dockTarget.stationId, dockTarget.label);
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function pressAndExpect(page, key, expectedTab) {
  await page.keyboard.press(key);
  await waitForStationTab(page, expectedTab, key);
}

async function focusAndExpect(page, tabId, key) {
  const focused = await page.evaluate((wanted) => {
    const tab = document.querySelector(`[data-screen="station"] [role="tab"][data-tab="${wanted}"]`);
    if (!tab) return false;
    tab.focus();
    return document.activeElement === tab;
  }, tabId);
  assert.equal(focused, true, 'probe should be able to focus station tab: ' + tabId);
  await pressAndExpect(page, key, tabId);
}

async function clickDepartureAndExpect(page, tabId) {
  const clicked = await page.evaluate((wanted) => {
    const chip = document.querySelector(`[data-screen="station"] .st-departure-chip[data-departure-tab="${wanted}"]`);
    if (!chip) return null;
    chip.click();
    return String(chip.textContent || '').replace(/\s+/g, ' ').trim();
  }, tabId);
  assert(clicked, 'Departure Check should include a chip that routes to ' + tabId);
  await waitForStationTab(page, tabId, 'departure chip ' + tabId);
}

async function waitForStationTab(page, tabId, sourceKey) {
  await page.waitForFunction((wanted) => {
    const snap = window.stationTabSnapshot ? window.stationTabSnapshot() : null;
    return !!(snap && snap.activeTab === wanted && snap.focusedTab === wanted &&
      snap.activePanelId === 'st-panel-' + wanted && snap.selectedCount === 1 && snap.tabbableCount === 1);
  }, tabId, { timeout: 5000 }).catch(async (err) => {
    const snap = await page.evaluate(() => stationTabSnapshot());
    throw new Error(`Station tab ${sourceKey} did not select ${tabId}: ${err.message}\n${JSON.stringify(snap, null, 2)}`);
  });
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
  const port = await findFreePort(8150);
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
  throw new Error('No free local port found for station tab navigation runtime check');
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
