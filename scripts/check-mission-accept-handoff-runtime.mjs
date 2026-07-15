#!/usr/bin/env node
// check-mission-accept-handoff-runtime.mjs — browser smoke for the Accept + Track loop.
//
// DESIGN TRUTH (src/ui/station/): Contracts board → "Accept & Track" a commodity job. That seeds an
// active + tracked mission and a trade nav waypoint (sim logic). The loop is then legible: Market
// flags the tracked contract's commodity ("buy it here"), and Mission Log opens on the J binding.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { BINDINGS } from '../src/ui/bindings.js';
import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = 90000;
const DOCK_TIMEOUT_MS = 15000;
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1460, height: 900 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'mission handoff probe must use the canonical root URL with no query flags');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');
  assert.equal(await clickButton(page, 'New Game'), true, 'main menu should expose New Game');
  await waitForVisible(page, '[data-screen="newGame"] .sf-ng-route', 10000, 'new-game first-session rail');
  assert.equal(await clickButton(page, 'Launch'), true, 'New Game should expose Launch');
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });

  const dockTarget = await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList && sf.state.entityList.find((e) =>
      e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('No dockable station entity found in first-session sector');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return { stationId: station.data.stationId };
  });
  await waitForVisible(page, '[data-screen="station"] .sx-dock', DOCK_TIMEOUT_MS, 'command dock after dock');

  // Seed a live commodity contract on this station's board (a bulk_trade the market here can buy).
  const seeded = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const stationId = state.ui.dockedStationId;
    const market = state.economy && state.economy.markets && state.economy.markets[stationId];
    const cmdtyId = market ? Object.keys(market)[0] : 'cmdty_ore_iron';
    // pick any other known station as the destination
    let dest = null;
    for (const e of (state.entityList || [])) {
      if (e && e.type === 'station' && e.data && e.data.stationId && e.data.stationId !== stationId) { dest = e.data; break; }
    }
    const board = state.missions.boards[stationId] || { slots: [] };
    board.slots = board.slots || [];
    board.slots.unshift({
      id: 'handoff_probe_bulk_trade',
      type: 'bulk_trade',
      factionId: 'faction_mts',
      title: 'Probe tracked cargo loop',
      risk: 0,
      reward: 1200,
      cargo: { commodityId: cmdtyId, qty: 6 },
      destinationName: dest ? (dest.name || dest.stationId) : 'Depot',
      destStationId: dest ? dest.stationId : null,
      params: { cmdtyId, qty: 6 },
    });
    state.missions.boards[stationId] = board;
    sf.bus.emit('mission:updated', { missionId: null });
    return { ok: true, stationId, cmdtyId };
  });
  assert.equal(seeded.ok, true, 'probe should seed a commodity contract on the docked board');

  // Go to Contracts, select the seeded offer, and Accept & Track it.
  await domClick(page, '[data-screen="station"] .sx-dock [data-nav="contracts"]');
  await waitForVisible(page, '[data-screen="station"] .sx-ct', 8000, 'Contracts board');
  await page.waitForFunction(() => !!document.querySelector('[data-screen="station"] .sx-ct-row[data-mid="handoff_probe_bulk_trade"]'), null, { timeout: 6000 });
  const before = await page.evaluate(() => window.SF.state.missions.active.filter((m) => m && m.status === 'active').length);

  await domClick(page, '[data-screen="station"] .sx-ct-row[data-mid="handoff_probe_bulk_trade"]');
  await page.waitForTimeout(150);
  // "Accept & Track" is the ghost button in the dossier footer.
  const clickedTrack = await page.evaluate(() => {
    const btn = document.querySelector('[data-screen="station"] .sx-dossier [data-track="handoff_probe_bulk_trade"]')
      || document.querySelector('[data-screen="station"] [data-track="handoff_probe_bulk_trade"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  assert.equal(clickedTrack, true, 'Contracts dossier should expose an "Accept & Track" control for the offer');

  // Accept + Track continuity: the seeded mission becomes active AND tracked (nav waypoint plotting
  // is owned by the sim and covered by check:market-nav; here we assert the UI-driven continuity).
  await page.waitForFunction((prev) => {
    const state = window.SF.state;
    const active = (state.missions.active || []).filter((m) => m && m.status === 'active');
    const trackedId = state.ui && state.ui.trackedMissionId;
    const tracked = trackedId && active.find((m) => m && m.id === trackedId);
    return !!(active.length > prev && tracked);
  }, before, { timeout: 10000 }).catch(async (err) => {
    const report = await page.evaluate(() => ({
      active: window.SF.state.missions.active.map((m) => ({ id: m.id, status: m.status })),
      trackedMissionId: window.SF.state.ui.trackedMissionId,
    }));
    throw new Error('Accept & Track did not seed active+tracked continuity: ' + JSON.stringify(report) + ' :: ' + err.message);
  });

  // Plot a trade course for the tracked commodity (what tracking a cargo job does in flight); the
  // Market must then flag it. Uses the canonical market nav helper via the bus contract.
  await page.evaluate(() => {
    const state = window.SF.state;
    const sid = state.ui.dockedStationId;
    const cid = Object.keys((state.economy.markets && state.economy.markets[sid]) || { cmdty_ore_iron: 1 })[0];
    state.nav = state.nav || {};
    state.nav.waypoint = { kind: 'trade', commodityId: cid, stationId: sid, label: 'Tracked cargo' };
    window.SF.bus.emit('nav:waypoint', state.nav.waypoint);
  });

  const active = await page.evaluate(() => {
    const state = window.SF.state;
    const trackedId = state.ui.trackedMissionId;
    const activePanel = document.querySelector('[data-screen="station"] .sx-ct__active');
    const trackedRow = document.querySelector('[data-screen="station"] .sx-job.is-tracked');
    return {
      trackedId,
      activePanelText: (activePanel && activePanel.textContent || '').replace(/\s+/g, ' ').trim(),
      hasTrackedRow: !!trackedRow,
    };
  });
  assert.ok(active.trackedId, 'a mission should be tracked after Accept & Track');
  assert.ok(active.hasTrackedRow, 'Active Operations should mark the tracked job');

  // Market flags the tracked contract commodity (buy it here to load the job).
  await domClick(page, '[data-screen="station"] .sx-dock [data-nav="market"]');
  await waitForVisible(page, '[data-screen="station"] .sx-mkt', 8000, 'Market instrument');
  await page.waitForFunction(() => !!document.querySelector('[data-screen="station"] .sx-mkt-tracked')
    || !!document.querySelector('[data-screen="station"] .sx-mkt-row.is-tracked'), null, { timeout: 6000 })
    .catch(() => { throw new Error('Market should flag the tracked-contract commodity after Accept & Track'); });
  const market = await page.evaluate(() => ({
    callout: (document.querySelector('[data-screen="station"] .sx-mkt-tracked') || {}).textContent || '',
    trackedRow: !!document.querySelector('[data-screen="station"] .sx-mkt-row.is-tracked'),
  }));
  assert.match(market.callout, /tracked contract/i, 'Market should show a tracked-contract callout: ' + JSON.stringify(market));
  assert.equal(market.trackedRow, true, 'Market should mark the tracked commodity row');

  // Mission Log opens on the canonical binding while docked.
  await page.keyboard.press(String(BINDINGS.missionLog.code || 'KeyJ').replace(/^Key/, ''));
  await waitForVisible(page, '[data-screen="missionLog"]', 10000, 'Mission Log opened from station via binding');

  assert.deepEqual(issues.errorIssues(), [], 'mission handoff probe should not record page errors');
  console.log('Mission accept+track OK: Contracts Accept & Track -> active/tracked/waypoint -> Market callout -> Mission Log');
  console.log('Dock target:', dockTarget.stationId, 'commodity:', seeded.cmdtyId);
} catch (err) {
  throw err;
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function domClick(page, selector) {
  const ok = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true; }, selector);
  assert.equal(ok, true, 'probe should be able to click: ' + selector);
}

async function waitForVisible(page, selector, timeoutMs, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, selector, { timeout: timeoutMs }).catch((err) => { throw new Error('Timed out waiting for ' + label + ': ' + err.message); });
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
  const port = await findFreePort(8310);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
  throw new Error('No free local port found for the mission handoff runtime check');
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
