#!/usr/bin/env node
// check-first-15-runtime.mjs - browser smoke for the default first-session route.
//
// Boots the normal player URL, opens New Game, verifies the first-15 rail is visible before
// scrolling, launches through the normal game:new path, then checks the live objective surfaces.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = 90000;
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
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');

  const opened = await clickButton(page, 'New Game');
  assert.equal(opened, true, 'main menu should expose New Game');
  await waitForVisible(page, '[data-screen="newGame"] .sf-ng-route', 10000, 'new-game route rail');

  const routeReport = await page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
    };
    const screen = document.querySelector('[data-screen="newGame"]');
    const route = document.querySelector('[data-screen="newGame"] .sf-ng-route');
    const startingShip = [...document.querySelectorAll('[data-screen="newGame"] h2')]
      .find((el) => (el.textContent || '').trim() === 'Starting Ship');
    return {
      screenVisible: visible(screen),
      routeVisible: visible(route),
      screenRect: screen ? screen.getBoundingClientRect().toJSON() : null,
      routeRect: route ? route.getBoundingClientRect().toJSON() : null,
      startingShipRect: startingShip ? startingShip.getBoundingClientRect().toJSON() : null,
      steps: [...document.querySelectorAll('[data-screen="newGame"] .sf-ng-route__step')]
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()),
    };
  });

  assert.equal(routeReport.screenVisible, true, 'New Game panel should be visible');
  assert.equal(routeReport.routeVisible, true, 'first-15 route rail should be visible');
  assert.equal(routeReport.steps.length, 4, 'first-15 route rail should have four steps');
  for (const phrase of ['Follow the anomaly', 'Mine the marked rock', 'Dock at Helios', 'Take one job']) {
    assert(routeReport.steps.some((step) => step.includes(phrase)), 'route rail missing step: ' + phrase);
  }
  assert(routeReport.routeRect.top >= routeReport.screenRect.top && routeReport.routeRect.bottom <= routeReport.screenRect.bottom,
    'first-15 rail should be visible without scrolling');
  assert(routeReport.routeRect.bottom <= routeReport.startingShipRect.top,
    'first-15 rail should appear before the starter ship block');

  const launched = await clickButton(page, 'Launch');
  assert.equal(launched, true, 'New Game should expose Launch');
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });
  await page.waitForTimeout(600);

  const flightReport = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const beat = state.story && state.story.beatIndex;
    const waypoint = state.nav && state.nav.waypoint || null;
    const trackerText = (document.querySelector('.sf-mission-tracker')?.textContent || '').replace(/\s+/g, ' ').trim();
    const topBefore = sf.ctx.screenManager.top();
    sf.ctx.screenManager.pushScreen('missionLog');
    sf.ctx.screenManager.syncVisibility && sf.ctx.screenManager.syncVisibility();
    const logText = (document.querySelector('[data-screen="missionLog"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      mode: state.mode,
      beat,
      waypoint,
      trackerText,
      topBefore,
      topAfter: sf.ctx.screenManager.top(),
      missionLogText: logText,
      screenStack: state.ui && state.ui.screenStack && state.ui.screenStack.slice(),
    };
  });

  assert.equal(flightReport.mode, 'flight', 'Launch should enter flight mode');
  assert.equal(flightReport.beat, 0, 'first run should start on story beat 0');
  assert(flightReport.waypoint && (flightReport.waypoint.kind === 'story' || flightReport.waypoint.onboarding === true),
    'first run should seed a story or onboarding waypoint');
  assert.match((flightReport.waypoint.reason || '') + ' ' + (flightReport.waypoint.label || ''), /47-A|mass signal|manifest/i,
    'first waypoint should point at the opening anomaly');
  assert.match(flightReport.trackerText, /Story|Tutorial|47-A|signal|anomaly|Mission Log/i,
    'HUD tracker should expose first objective context');
  assert.equal(flightReport.topAfter, 'missionLog', 'mission log should open after launch');
  assert.match(flightReport.missionLogText, /RECOMMENDED NEXT/i, 'mission log should show recommended next rail');
  assert.match(flightReport.missionLogText, /Follow the anomaly/i, 'mission log should carry the first route action');
  assert.deepEqual(issues.errorIssues(), [], 'first-15 runtime probe should not record page errors');

  console.log('First-15 runtime route OK: New Game rail -> flight story waypoint -> mission-log recommendation');
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
  const button = page.getByRole('button', { name: label, exact: true }).first();
  if (await button.count() <= 0) return false;
  await button.click({ timeout: 10000 });
  return true;
}

async function startFreshServer() {
  const port = await findFreePort(8130);
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
  throw new Error('No free local port found for first-15 runtime check');
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
