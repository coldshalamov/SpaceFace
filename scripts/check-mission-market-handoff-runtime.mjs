#!/usr/bin/env node
// check-mission-market-handoff-runtime.mjs - browser smoke for accepted trade-job continuity.
//
// Boots the canonical player URL, starts a real New Game, docks through the normal event path,
// injects one deterministic one-unit bulk-trade offer from the live station market, accepts it via
// Missions, buys the required cargo in Market, then undocks and verifies tracked mission guidance
// survives into flight. The injected offer is probe-only after live boot; no player defaults change.
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
  assert.equal(new URL(page.url()).search, '', 'mission-market handoff probe must use the canonical root URL with no query flags');
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
    const station = sf.state.entityList.find((e) =>
      e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('No dockable station entity found in first-session sector');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return { stationId: station.data.stationId, label: station.data.name || station.data.stationName || station.data.stationId };
  });
  await waitForVisible(page, '[data-screen="station"]', DOCK_TIMEOUT_MS, 'station hub after dock');

  const seededMission = await page.evaluate((fallbackStationId) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const stationId = (state.ui && state.ui.dockedStationId) || fallbackStationId;
    const market = state.economy && state.economy.markets && state.economy.markets[stationId];
    if (!stationId || !market) return { error: 'No live market for docked station', stationId };

    const contentCommodities = state.content && state.content.commodities;
    const commodities = Array.isArray(contentCommodities) ? contentCommodities
      : (contentCommodities && typeof contentCommodities === 'object' ? Object.values(contentCommodities) : []);
    const commodityDef = (id) => commodities.find((c) => c && c.id === id) || null;
    const commodityName = (id) => {
      const def = commodityDef(id);
      return (def && def.name) || String(id || 'cargo').replace(/^cmdty_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };
    const commodityVol = (id) => {
      const def = commodityDef(id);
      return def && def.volPerU > 0 ? def.volPerU : 1;
    };

    const cargo = state.player.cargo || {};
    const freeVolume = Math.max(0, Number(cargo.capVolume || 0) - Number(cargo.usedVolume || 0));
    const choices = Object.entries(market).map(([id, entry]) => ({
      id,
      name: commodityName(id),
      buy: Number(entry && (entry.lastBuy || entry.lastMid || 0)),
      stock: Number(entry && entry.stock || 0),
      vol: commodityVol(id),
    })).filter((c) => c.buy > 0 && c.stock >= 2 && c.vol <= freeVolume)
      .sort((a, b) => (a.buy - b.buy) || a.id.localeCompare(b.id));
    if (!choices.length) return { error: 'No one-unit commodity fits the starter hold', stationId, freeVolume, marketCount: Object.keys(market).length };

    const choice = choices[0];
    const safeCredits = Math.ceil(choice.buy * 3 + 50);
    if ((state.player.credits || 0) < safeCredits) {
      sf.bus.emit('economy:grantCredits', { amount: safeCredits - (state.player.credits || 0), reason: 'probe:mission_market_handoff' });
    }

    const rawSectors = (state.content && state.content.sectors) || (state.world && state.world.sectors);
    const sectors = Array.isArray(rawSectors) ? rawSectors : (rawSectors && typeof rawSectors === 'object' ? Object.values(rawSectors) : []);
    const stations = [];
    for (const sec of sectors) {
      for (const st of sec && sec.stations || []) {
        const id = st && (st.id || st.stationId);
        if (id) stations.push({ id, name: st.name || st.stationName || id, sectorId: sec.id || st.sectorId || null, factionId: st.factionId || sec.factionId || null });
      }
    }
    const currentSectorId = state.world && state.world.currentSectorId || null;
    const origin = stations.find((st) => st.id === stationId) || { id: stationId, name: stationId, sectorId: currentSectorId, factionId: null };
    const dest = stations.find((st) => st.id !== stationId && st.sectorId === origin.sectorId) || stations.find((st) => st.id !== stationId);
    if (!dest) return { error: 'No alternate destination station available', stationId, stationCount: stations.length };

    const missionId = '__probe_mission_market_handoff';
    const title = 'Probe handoff: sell 1u ' + choice.name + ' at ' + dest.name;
    state.missions.boards = state.missions.boards || {};
    const board = state.missions.boards[stationId] || { refreshEpoch: 0, slots: [] };
    state.missions.boards[stationId] = board;
    board.slots = (board.slots || []).filter((slot) => slot && slot.id !== missionId);
    board.slots.unshift({
      id: missionId,
      type: 'bulk_trade',
      stationId,
      factionId: origin.factionId || null,
      reward_cr: Math.max(250, Math.round(choice.buy * 3)),
      time_limit_s: 900,
      collateral_cr: 0,
      riskTier: 0,
      destStationId: dest.id,
      destSectorId: dest.sectorId || origin.sectorId || currentSectorId,
      distance: 600,
      params: { cmdtyId: choice.id, qty: 1, progress: 0, cargoValue: choice.buy, fValue: 1, taskTime: 2 },
      title,
      expiresAtEpoch: (board.refreshEpoch || 0) + 1,
      storyTag: null,
    });
    sf.bus.emit('mission:updated', { missionId: null });
    return { missionId, title, cmdtyId: choice.id, cmdtyName: choice.name, destName: dest.name };
  }, dockTarget.stationId);
  assert(seededMission && !seededMission.error && seededMission.missionId,
    'probe should seed an affordable one-unit trade mission from the live station market: ' + JSON.stringify(seededMission));

  await openStationTab(page, 'missions');
  const accepted = await page.evaluate((missionId) => {
    const btn = [...document.querySelectorAll('[data-screen="station"] [data-act="accept"][data-mid]')]
      .find((el) => el.getAttribute('data-mid') === missionId);
    const cardText = (btn && btn.closest('.st-mission-card') && btn.closest('.st-mission-card').textContent || '').replace(/\s+/g, ' ').trim();
    if (!btn || btn.disabled) return { ok: false, cardText, buttonText: btn && btn.textContent };
    btn.click();
    return { ok: true, cardText, buttonText: btn.textContent };
  }, seededMission.missionId);
  assert.equal(accepted.ok, true, 'seeded trade mission should expose a clickable Accept + Track action: ' + JSON.stringify(accepted));
  assert.match(accepted.buttonText || '', /Accept \+ Track/, 'mission board should use the tracked accept CTA');
  assert.match(accepted.cardText, /Probe handoff|bulk trade|sell/i, 'mission board should explain the trade handoff');

  await page.waitForFunction((title) => {
    const sf = window.SF;
    const active = sf.state.missions.active.find((m) => m.title === title && m.status === 'active');
    return !!(active && sf.state.ui.trackedMissionId === active.id);
  }, seededMission.title, { timeout: 10000 });

  let report = await page.evaluate((title) => {
    const sf = window.SF;
    const state = sf.state;
    const mission = state.missions.active.find((m) => m.title === title && m.status === 'active');
    return {
      missionId: mission && mission.id,
      trackedMissionId: state.ui && state.ui.trackedMissionId,
      waypoint: state.nav && state.nav.waypoint,
      departureText: text(document.querySelector('[data-screen="station"] .st-departure')),
    };
    function text(el) { return (el && el.textContent || '').replace(/\s+/g, ' ').trim(); }
  }, seededMission.title);
  assert.equal(report.trackedMissionId, report.missionId, 'accepted trade job should auto-track');
  assert.equal(report.waypoint && report.waypoint.kind, 'mission', 'accepted trade job should install mission nav');
  assert.equal(report.waypoint && report.waypoint.missionId, report.missionId, 'mission nav should point at the accepted job');
  assert.match((report.waypoint && report.waypoint.reason) || '', /Sell/i, 'mission nav should explain the sell objective');
  assert.match(report.departureText, /Track/i, 'station departure rail should surface tracked-job status');

  const logReport = await page.evaluate(() => {
    const mgr = window.SF.ctx.screenManager;
    mgr.pushScreen('missionLog');
    mgr.syncVisibility && mgr.syncVisibility();
    const text = (document.querySelector('[data-screen="missionLog"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    mgr.popScreen();
    mgr.syncVisibility && mgr.syncVisibility();
    return text;
  });
  assert.match(logReport, /RECOMMENDED NEXT/i, 'mission log should keep the recommended-next rail after accepting a trade job');
  assert.match(logReport, /TRACKED/i, 'mission log should name the tracked accepted job');
  assert.match(logReport, /buy or carry|tracked destination market/i, 'mission log should bridge accepted trade jobs into Market prep');
  assert(logReport.includes(seededMission.title) || logReport.includes(seededMission.cmdtyName), 'mission log should carry the accepted trade identity');

  await waitForVisible(page, '[data-screen="station"]', 10000, 'station hub after Mission Log');
  await openStationTab(page, 'market');
  const bought = await page.evaluate((cmdtyId) => {
    const row = [...document.querySelectorAll('[data-screen="station"] .st-market [data-cmdty]')]
      .find((el) => el.getAttribute('data-cmdty') === cmdtyId);
    if (!row) return { ok: false, reason: 'missing row' };
    const stepOne = row.querySelector('[data-act="step"][data-v="1"]');
    if (stepOne) stepOne.click();
    const buy = row.querySelector('[data-act="buy"]');
    const buyTitle = buy && (buy.getAttribute('aria-label') || buy.title || '');
    if (!buy || buy.disabled) return { ok: false, reason: 'buy disabled', buyTitle, rowText: row.textContent };
    buy.click();
    return { ok: true, buyTitle, rowText: row.textContent };
  }, seededMission.cmdtyId);
  assert.equal(bought.ok, true, 'Market should let the player buy the accepted mission commodity: ' + JSON.stringify(bought));
  assert.match(bought.buyTitle || bought.rowText, /CR|cargo|mission|hull|module|fuel|repair/i, 'Market buy affordance should explain trade consequences');

  await page.waitForFunction((cmdtyId) => {
    const cargo = window.SF.state.player.cargo;
    return !!(cargo && cargo.items && (cargo.items[cmdtyId] || 0) >= 1);
  }, seededMission.cmdtyId, { timeout: 10000 });

  report = await page.evaluate(({ title, cmdtyId }) => {
    const state = window.SF.state;
    const mission = state.missions.active.find((m) => m.title === title && m.status === 'active');
    return {
      cargoQty: state.player.cargo.items[cmdtyId] || 0,
      objectiveProgress: mission && mission.objectiveProgress,
      trackedMissionId: state.ui && state.ui.trackedMissionId,
      missionId: mission && mission.id,
      waypointKind: state.nav && state.nav.waypoint && state.nav.waypoint.kind,
    };
  }, { title: seededMission.title, cmdtyId: seededMission.cmdtyId });
  assert(report.cargoQty >= 1, 'buying mission cargo should put that commodity in the hold');
  assert.equal(report.objectiveProgress, 0, 'buying prep cargo should not prematurely complete the bulk-trade objective');
  assert.equal(report.trackedMissionId, report.missionId, 'buying mission cargo should preserve mission tracking');
  assert.equal(report.waypointKind, 'mission', 'buying mission cargo should preserve mission nav');

  assert.equal(await page.evaluate(() => {
    const btn = document.querySelector('[data-screen="station"] .st-undock');
    if (!btn) return false;
    btn.click();
    return true;
  }), true, 'station hub should expose Undock after market prep');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'flight', null, { timeout: 10000 });
  await page.waitForTimeout(300);

  const flightReport = await page.evaluate((title) => {
    const state = window.SF.state;
    const mission = state.missions.active.find((m) => m.title === title && m.status === 'active');
    const waypoint = state.nav && state.nav.waypoint || null;
    return {
      mode: state.mode,
      missionId: mission && mission.id,
      trackedMissionId: state.ui && state.ui.trackedMissionId,
      waypoint,
      trackerText: (document.querySelector('.sf-mission-tracker')?.textContent || '').replace(/\s+/g, ' ').trim(),
    };
  }, seededMission.title);
  assert.equal(flightReport.mode, 'flight', 'Undock should return to flight mode');
  assert.equal(flightReport.trackedMissionId, flightReport.missionId, 'tracked trade mission should survive station egress');
  assert.equal(flightReport.waypoint && flightReport.waypoint.kind, 'mission', 'mission waypoint should survive station egress');
  assert.equal(flightReport.waypoint && flightReport.waypoint.missionId, flightReport.missionId, 'flight waypoint should still target the accepted mission');
  assert.match(((flightReport.waypoint && (flightReport.waypoint.reason + ' ' + flightReport.waypoint.label)) || '') + ' ' + flightReport.trackerText,
    /Sell|Mission|market|cargo|tracked/i, 'flight HUD/nav should still explain the accepted trade job after undock');
  assert.deepEqual(issues.errorIssues(), [], 'mission-market handoff runtime probe should not record page errors');

  console.log('Mission-market handoff runtime OK: New Game -> dock -> accept trade job -> buy mission cargo -> undock with mission nav intact.');
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function openStationTab(page, tabId) {
  const opened = await page.evaluate((id) => {
    const tab = document.querySelector('[data-screen="station"] [role="tab"][data-tab="' + id + '"]')
      || document.querySelector('[data-screen="station"] [data-tab="' + id + '"]');
    if (!tab) return false;
    tab.click();
    return true;
  }, tabId);
  assert.equal(opened, true, 'station ' + tabId + ' tab should exist');
  await page.waitForFunction((id) => {
    const panel = document.querySelector('[data-screen="station"] #st-panel-' + id);
    if (!panel) return false;
    const cs = getComputedStyle(panel);
    const r = panel.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && !panel.hidden && r.width > 20 && r.height > 10;
  }, tabId, { timeout: 10000 }).catch((err) => {
    throw new Error('Timed out waiting for station ' + tabId + ' panel: ' + err.message);
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
  throw new Error('No free local port found for mission-market handoff runtime check');
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
