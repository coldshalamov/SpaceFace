#!/usr/bin/env node
// check-mission-cargo-loading-runtime.mjs - browser smoke for tracked contract cargo loading.
// Complements check-mission-accept-handoff-runtime.mjs by proving the Market Buy button can load
// tracked contract cargo, flip the guidance from "load cargo" to "cargo aboard", then undock
// without dropping mission nav. Probe-only mission/credits are injected after live boot.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await loadPlaywright();
let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'cargo-loading probe must use the canonical root URL with no query flags');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await waitVisible(page, '[data-screen="mainMenu"]', 'main menu');
  assert.equal(await clickButton(page, 'New Game'), true, 'main menu should expose New Game');
  await waitVisible(page, '[data-screen="newGame"] .sf-ng-route', 'new-game first-session rail');
  assert.equal(await clickButton(page, 'Launch'), true, 'New Game should expose Launch');
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0);
  }, null, { timeout: 45000 });

  const dockTarget = await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList.find((e) => e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('No dockable station entity found in first-session sector');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return { stationId: station.data.stationId, label: station.data.name || station.data.stationName || station.data.stationId };
  });
  await waitVisible(page, '[data-screen="station"]', 'station hub after dock', 15000);

  await stationTab(page, 'missions');
  const seeded = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const stationId = state.ui && state.ui.dockedStationId;
    const market = state.economy && state.economy.markets && state.economy.markets[stationId] || {};
    const cmdtyId = Object.keys(market).find((id) => market[id] && market[id].role !== 'none' && Number.isFinite(market[id].lastBuy) && market[id].lastBuy > 0 && market[id].stock >= 2);
    const dest = firstOtherStation(state, stationId);
    if (!stationId || !cmdtyId || !dest) return { ok: false, stationId, cmdtyId, dest };
    const unit = Math.max(1, Math.ceil(market[cmdtyId].lastBuy || market[cmdtyId].lastMid || 1));
    const safeCredits = Math.max(250, unit * 3 + 50);
    if ((state.player.credits || 0) < safeCredits) {
      sf.bus.emit('economy:grantCredits', { amount: safeCredits - (state.player.credits || 0), reason: 'probe:contract_cargo_loading' });
    }
    const board = state.missions.boards[stationId] || { refreshEpoch: 0, slots: [] };
    board.slots = (board.slots || []).filter((slot) => slot && slot.id !== 'cargo_loading_probe_bulk_trade');
    board.slots.unshift({
      id: 'cargo_loading_probe_bulk_trade', type: 'bulk_trade', stationId, factionId: 'faction_scn',
      reward_cr: Math.max(300, unit * 4), time_limit_s: 900, collateral_cr: 0, riskTier: 0,
      destStationId: dest.stationId, destSectorId: dest.sectorId, distance: 600,
      params: { cmdtyId, qty: 1, fValue: 1, taskTime: 30, cargoValue: unit },
      title: 'Probe contract cargo loading', expiresAtEpoch: (board.refreshEpoch || 0) + 1, storyTag: null,
    });
    state.missions.boards[stationId] = board;
    sf.bus.emit('mission:updated', { missionId: null });
    return { ok: true, stationId, cmdtyId, destStationId: dest.stationId, destName: dest.name };

    function firstOtherStation(s, currentStationId) {
      for (const entity of s.entityList || []) {
        const data = entity && entity.data;
        if (entity && entity.type === 'station' && data && data.stationId && data.stationId !== currentStationId) {
          return { stationId: data.stationId, sectorId: s.world && s.world.currentSectorId, name: data.name || data.stationName || data.stationId };
        }
      }
      for (const sector of Object.values(s.world && s.world.sectors || {})) {
        for (const station of sector.stations || []) {
          if (station && station.id && station.id !== currentStationId) return { stationId: station.id, sectorId: sector.id, name: station.name || station.id };
        }
      }
      return null;
    }
  });
  assert.equal(seeded.ok, true, 'probe should seed an affordable one-unit contract cargo offer: ' + JSON.stringify(seeded));

  assert.equal(await page.evaluate(() => {
    const button = document.querySelector('[data-screen="station"] .st-mission-btns button[data-mid="cargo_loading_probe_bulk_trade"][data-act="accept"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }), true, 'seeded contract should expose an enabled Accept + Track button');

  await page.waitForFunction(() => {
    const state = window.SF.state;
    const mission = state.missions.active.find((m) => m.title === 'Probe contract cargo loading' && m.status === 'active');
    return !!(mission && state.ui.trackedMissionId === mission.id && state.nav.waypoint && state.nav.waypoint.missionId === mission.id);
  }, null, { timeout: 10000 });

  await stationTab(page, 'market');
  let marketReport = await trackedMarketReport(page);
  assert.equal(marketReport.calloutVisible, true, 'Market should show tracked-contract callout before loading cargo');
  assert.match(marketReport.calloutText, /TRACKED CONTRACT/i, 'Market callout should label tracked contract context');
  assert.match(marketReport.calloutText + ' ' + marketReport.rowMissionLine, /load\s+1u more|load\s+1u|before undocking/i,
    'Market should tell the player to load missing contract cargo: ' + JSON.stringify(marketReport));
  assert.match(marketReport.rowClass, /tracked-mission/, 'tracked commodity row should be highlighted before buying');

  const buyReport = await page.evaluate(() => {
    const state = window.SF.state;
    const mission = state.missions.active.find((m) => m.id === state.ui.trackedMissionId);
    const cmdtyId = mission && mission.params && mission.params.cmdtyId;
    const row = cmdtyId && document.querySelector(`[data-screen="station"] .st-row[data-cmdty="${cmdtyId}"]`);
    if (!mission || !cmdtyId || !row) return { ok: false, reason: 'missing mission row', cmdtyId };
    row.querySelector('[data-act="step"][data-v="1"]')?.click();
    const buy = row.querySelector('[data-act="buy"]');
    if (!buy || buy.disabled) return { ok: false, reason: 'buy disabled', buyTitle: buy && buy.title, rowText: text(row) };
    buy.click();
    return { ok: true, missionId: mission.id, cmdtyId, beforeOwned: state.player.cargo.items[cmdtyId] || 0, buyTitle: buy.title };
    function text(el) { return (el && el.textContent || '').replace(/\s+/g, ' ').trim(); }
  });
  assert.equal(buyReport.ok, true, 'Market should let the player buy the tracked contract commodity: ' + JSON.stringify(buyReport));
  assert.match(buyReport.buyTitle || '', /Buy 1 .* CR/i, 'Buy affordance should reflect the one-unit contract cargo purchase');
  await page.waitForFunction(({ cmdtyId, beforeOwned }) => (window.SF.state.player.cargo.items[cmdtyId] || 0) >= beforeOwned + 1,
    { cmdtyId: buyReport.cmdtyId, beforeOwned: buyReport.beforeOwned }, { timeout: 10000 });

  marketReport = await trackedMarketReport(page);
  assert.equal(marketReport.trackedMissionId, buyReport.missionId, 'cargo purchase should preserve tracked mission id');
  assert.equal(marketReport.waypointMissionId, buyReport.missionId, 'cargo purchase should preserve mission waypoint');
  assert.equal(marketReport.objectiveProgress, 0, 'buying cargo should not prematurely progress a bulk-trade sell objective');
  assert(marketReport.owned >= 1, 'player hold should include the tracked contract cargo after buying: ' + JSON.stringify(marketReport));
  assert.match(marketReport.calloutText + ' ' + marketReport.rowMissionLine, /aboard|undock and follow nav|cargo is aboard/i,
    'Market should advance from missing-cargo copy to cargo-aboard guidance after buying: ' + JSON.stringify(marketReport));

  assert.equal(await clickButton(page, 'UNDOCK'), true, 'station should still expose Undock after cargo loading');
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    return !!(state && state.mode === 'flight' && state.ui && state.ui.docked === false);
  }, null, { timeout: 15000 });
  const hud = await page.evaluate(() => {
    const state = window.SF.state;
    const mission = state.missions.active.find((m) => m.id === state.ui.trackedMissionId);
    return {
      mode: state.mode,
      missionId: mission && mission.id,
      cargoQty: mission && mission.params && state.player.cargo.items[mission.params.cmdtyId] || 0,
      waypointMissionId: state.nav.waypoint && state.nav.waypoint.missionId,
      trackerText: (document.querySelector('.sf-mission-tracker')?.textContent || '').replace(/\s+/g, ' ').trim(),
    };
  });
  assert.equal(hud.mode, 'flight', 'undock should return to flight mode');
  assert.equal(hud.waypointMissionId, hud.missionId, 'flight nav should still target the loaded contract mission');
  assert(hud.trackerText.includes('Probe contract cargo loading'), 'flight HUD should still name the loaded contract mission: ' + JSON.stringify(hud));
  assert(hud.cargoQty >= 1, 'contract cargo should remain aboard after undock: ' + JSON.stringify(hud));
  assert.deepEqual(issues.errorIssues(), [], 'mission cargo-loading runtime probe should not record page errors');

  console.log('Mission cargo loading OK: accept tracked contract -> buy cargo in Market -> cargo-aboard guidance -> undock with nav intact');
  console.log('Dock target:', dockTarget.stationId, dockTarget.label);
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

function trackedMarketReport(page) {
  return page.evaluate(() => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const state = window.SF.state;
    const trackedId = state.ui.trackedMissionId;
    const mission = state.missions.active.find((m) => m.id === trackedId);
    const cmdtyId = mission && mission.params && mission.params.cmdtyId;
    const callout = document.querySelector('[data-screen="station"] .st-market-mission');
    const row = cmdtyId && document.querySelector(`[data-screen="station"] .st-row[data-cmdty="${cmdtyId}"]`);
    return {
      trackedMissionId: trackedId,
      missionId: mission && mission.id,
      objectiveProgress: mission && mission.objectiveProgress,
      owned: cmdtyId ? (state.player.cargo.items[cmdtyId] || 0) : 0,
      waypointMissionId: state.nav.waypoint && state.nav.waypoint.missionId,
      calloutVisible: !!callout && !callout.hidden && getComputedStyle(callout).display !== 'none',
      calloutText: norm(callout && callout.textContent),
      rowClass: row && row.className || '',
      rowMissionLine: norm(row && row.querySelector('.st-market-mission-line') && row.querySelector('.st-market-mission-line').textContent),
    };
  });
}

async function stationTab(page, tabId) {
  const opened = await page.evaluate((id) => {
    const tab = document.querySelector('[data-screen="station"] [role="tab"][data-tab="' + id + '"]') || document.querySelector('[data-screen="station"] [data-tab="' + id + '"]');
    if (!tab) return false;
    tab.click();
    return true;
  }, tabId);
  assert.equal(opened, true, 'station ' + tabId + ' tab should exist');
  await waitVisible(page, '[data-screen="station"] #st-panel-' + tabId, 'station ' + tabId + ' panel');
}

async function waitVisible(page, selector, label, timeout = 10000) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, selector, { timeout }).catch((err) => { throw new Error('Timed out waiting for ' + label + ': ' + err.message); });
}

function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const exact = [...document.querySelectorAll('button')].find((b) => norm(b.textContent) === norm(wanted));
    const button = exact || [...document.querySelectorAll('button')].find((b) => norm(b.textContent).includes(norm(wanted)));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, label);
}

async function startFreshServer() {
  const port = await findFreePort(8170);
  const child = spawnProbeServer(port);
  const baseUrl = `http://127.0.0.1:${port}/`;
  await waitReachable(baseUrl, child);
  return { baseUrl, kill: () => child.kill() };
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

async function waitReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput()}`);
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) if (await isPortFree(port)) return port;
  throw new Error('No free local port found for mission cargo-loading runtime check');
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
  try { return !!(await fetch(url, { method: 'GET' })).ok; } catch (_) { return false; }
}
