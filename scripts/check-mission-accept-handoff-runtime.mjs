#!/usr/bin/env node
// check-mission-accept-handoff-runtime.mjs - browser smoke for Accept + Track continuity.
//
// Boots the canonical player route, accepts a real station-board mission, verifies the station
// confirmation, opens Mission Log via J while docked, then undocks and proves the HUD tracker and
// nav waypoint still point at the same mission.
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
  assert.equal(new URL(page.url()).search, '', 'mission handoff probe must use the canonical root URL with no query flags');
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
  await page.evaluate(() => {
    const tab = document.querySelector('[data-screen="station"] [role="tab"][data-tab="missions"]')
      || document.querySelector('[data-screen="station"] [data-tab="missions"]');
    if (!tab) throw new Error('Missions tab not found');
    tab.click();
  });
  await waitForVisible(page, '[data-screen="station"] .st-missions', 10000, 'station Missions panel');

  const seededOffer = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const stationId = state.ui && state.ui.dockedStationId;
    const market = state.economy && state.economy.markets && state.economy.markets[stationId] || {};
    const cmdtyId = Object.keys(market).find((id) => market[id] && market[id].role !== 'none' &&
      Number.isFinite(market[id].lastBuy) && market[id].lastBuy > 0);
    const sectors = state.world && state.world.sectors || {};
    let dest = null;
    for (const entity of state.entityList || []) {
      const data = entity && entity.data;
      if (entity && entity.type === 'station' && data && data.stationId && data.stationId !== stationId) {
        dest = {
          stationId: data.stationId,
          sectorId: state.world && state.world.currentSectorId,
          name: data.name || data.stationName || data.stationId,
        };
        break;
      }
    }
    for (const sector of Object.values(sectors)) {
      if (dest) break;
      for (const station of sector.stations || []) {
        if (station && station.id && station.id !== stationId) {
          dest = { stationId: station.id, sectorId: sector.id, name: station.name || station.id };
          break;
        }
      }
    }
    if (!dest && stationId) {
      dest = {
        stationId,
        sectorId: state.world && state.world.currentSectorId,
        name: 'Current station',
      };
    }
    if (!stationId || !cmdtyId || !dest) return { ok: false, stationId, cmdtyId, dest };
    const board = state.missions.boards[stationId] || { refreshEpoch: 0, slots: [] };
    board.slots = board.slots.filter((slot) => slot && slot.id !== 'handoff_probe_bulk_trade');
    board.slots.unshift({
      id: 'handoff_probe_bulk_trade',
      type: 'bulk_trade',
      stationId,
      factionId: 'faction_scn',
      reward_cr: 960,
      time_limit_s: 900,
      collateral_cr: 0,
      riskTier: 0,
      destStationId: dest.stationId,
      destSectorId: dest.sectorId,
      distance: 600,
      params: { cmdtyId, qty: 3, fValue: 1, taskTime: 120 },
      title: 'Probe tracked cargo loop',
      expiresAtEpoch: 1,
      storyTag: null,
    });
    state.missions.boards[stationId] = board;
    sf.bus.emit('mission:updated', { missionId: null });
    return { ok: true, stationId, cmdtyId, destStationId: dest.stationId, destName: dest.name };
  });
  assert.equal(seededOffer.ok, true, 'probe should seed a live commodity offer at the docked station: ' + JSON.stringify(seededOffer));
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-screen="station"] .st-mission-btns button[data-mid="handoff_probe_bulk_trade"][data-act="accept"]');
    return !!(button && !button.disabled);
  }, null, { timeout: 5000 });

  const before = await page.evaluate(() => ({
    activeCount: window.SF.state.missions.active.filter((m) => m && m.status === 'active').length,
    trackedMissionId: window.SF.state.ui && window.SF.state.ui.trackedMissionId || null,
  }));

  const offer = await page.evaluate(() => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const state = window.SF.state;
    const stationId = state.ui && state.ui.dockedStationId;
    const slots = state.missions && state.missions.boards && state.missions.boards[stationId]
      && state.missions.boards[stationId].slots || [];
    const wantedTypes = new Set(['bulk_trade', 'cargo_delivery', 'smuggling_run', 'salvage_retrieval']);
    const candidates = slots.filter((slot) => slot && wantedTypes.has(slot.type) && slot.params && slot.params.cmdtyId);
    const selected = candidates.find((slot) => {
      const btn = document.querySelector(`[data-screen="station"] .st-mission-btns button[data-mid="${slot.id}"][data-act="accept"]`);
      return btn && !btn.disabled;
    });
    const button = selected
      ? document.querySelector(`[data-screen="station"] .st-mission-btns button[data-mid="${selected.id}"][data-act="accept"]`)
      : null;
    if (!button || !selected) {
      return {
        accepted: false,
        reason: 'No enabled commodity Accept + Track button',
        candidates: candidates.map((slot) => ({ id: slot.id, type: slot.type, title: slot.title, cmdtyId: slot.params && slot.params.cmdtyId })),
        boardText: normalize(document.querySelector('[data-screen="station"] .st-missions')?.textContent || ''),
      };
    }
    const card = button.closest('.st-mission-card');
    const title = normalize(card && card.querySelector('.st-mission-title') && card.querySelector('.st-mission-title').textContent);
    const next = normalize(card && card.querySelector('.st-mission-next') && card.querySelector('.st-mission-next').textContent);
    button.click();
    return { accepted: true, title, next, offerId: selected.id, type: selected.type, cmdtyId: selected.params.cmdtyId };
  });
  assert.equal(offer.accepted, true, 'station board should expose at least one enabled commodity Accept + Track mission: ' + JSON.stringify(offer));

  await page.waitForFunction((prevCount) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const active = state && state.missions && state.missions.active || [];
    const trackedId = state && state.ui && state.ui.trackedMissionId;
    const tracked = trackedId && active.find((m) => m && m.id === trackedId && m.status === 'active');
    const waypoint = state && state.nav && state.nav.waypoint;
    return !!(active.filter((m) => m && m.status === 'active').length > prevCount &&
      tracked && waypoint && waypoint.missionId === tracked.id);
  }, before.activeCount, { timeout: 10000 });

  const stationReport = await page.evaluate(() => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const state = window.SF.state;
    const trackedId = state.ui.trackedMissionId;
    const tracked = state.missions.active.find((m) => m.id === trackedId);
    const accepted = document.querySelector('[data-screen="station"] .st-mission-accepted');
    const departureChips = [...document.querySelectorAll('[data-screen="station"] .st-departure-chip')]
      .map((chip) => normalize(chip.textContent));
    return {
      activeTab: state.ui.activeStationTab,
      trackedId,
      trackedTitle: tracked && tracked.title,
      waypoint: state.nav.waypoint && {
        missionId: state.nav.waypoint.missionId,
        kind: state.nav.waypoint.kind,
        reason: state.nav.waypoint.reason,
        stationId: state.nav.waypoint.stationId,
        sectorId: state.nav.waypoint.sectorId,
      },
      statusVisible: !!accepted && !accepted.hidden && getComputedStyle(accepted).display !== 'none',
      statusText: normalize(accepted && accepted.textContent),
      departureChips,
    };
  });
  assert.equal(stationReport.activeTab, 'missions', 'station should remain on the Missions tab after accept');
  assert.equal(stationReport.statusVisible, true, 'station should show the accepted + tracked confirmation');
  assert.match(stationReport.statusText, /ACCEPTED \+ TRACKED/i, 'accepted status should label the handoff');
  assert.match(stationReport.statusText, /Mission Log \(J\)/, 'accepted status should point to Mission Log J while docked');
  assert(stationReport.trackedTitle && stationReport.statusText.includes(stationReport.trackedTitle),
    'accepted status should name the tracked mission: ' + JSON.stringify(stationReport));
  assert.equal(stationReport.waypoint && stationReport.waypoint.missionId, stationReport.trackedId,
    'accepted mission should own the active nav waypoint: ' + JSON.stringify(stationReport));
  assert(stationReport.departureChips.some((chip) => /Track/i.test(chip) && chip.includes(stationReport.trackedTitle)),
    'Departure Check should show the tracked mission before undock: ' + JSON.stringify(stationReport));

  await page.evaluate(() => {
    const tab = document.querySelector('[data-screen="station"] [role="tab"][data-tab="market"]')
      || document.querySelector('[data-screen="station"] [data-tab="market"]');
    if (!tab) throw new Error('Market tab not found');
    tab.click();
  });
  await waitForVisible(page, '[data-screen="station"] .st-market', 10000, 'station Market panel');
  const marketReport = await page.evaluate(() => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const state = window.SF.state;
    const trackedId = state.ui.trackedMissionId;
    const tracked = state.missions.active.find((m) => m.id === trackedId);
    const cmdtyId = tracked && tracked.params && tracked.params.cmdtyId;
    const callout = document.querySelector('[data-screen="station"] .st-market-mission');
    const row = cmdtyId && document.querySelector(`[data-screen="station"] .st-row[data-cmdty="${cmdtyId}"]`);
    return {
      top: window.SF.ctx.screenManager.top(),
      activeTab: state.ui.activeStationTab,
      trackedTitle: tracked && tracked.title,
      cmdtyId,
      calloutVisible: !!callout && !callout.hidden && getComputedStyle(callout).display !== 'none',
      calloutText: normalize(callout && callout.textContent),
      rowClass: row && row.className || '',
      rowText: normalize(row && row.textContent),
      rowMissionLine: normalize(row && row.querySelector('.st-market-mission-line') && row.querySelector('.st-market-mission-line').textContent),
    };
  });
  assert.equal(marketReport.activeTab, 'market', 'station should switch to Market for tracked contract cargo');
  assert.equal(marketReport.calloutVisible, true, 'Market should show tracked-contract callout for accepted commodity mission');
  assert.match(marketReport.calloutText, /TRACKED CONTRACT/i, 'Market callout should label the tracked contract');
  assert(marketReport.calloutText.includes(marketReport.trackedTitle),
    'Market callout should name the tracked mission: ' + JSON.stringify(marketReport));
  assert(marketReport.calloutText.includes('hold') && marketReport.calloutText.includes('target'),
    'Market callout should show held cargo versus contract target: ' + JSON.stringify(marketReport));
  assert(marketReport.rowClass.includes('tracked-mission'),
    'Market commodity row should be highlighted for the tracked mission commodity: ' + JSON.stringify(marketReport));
  assert.match(marketReport.rowMissionLine, /Tracked contract/i,
    'Market commodity row should explain why this cargo matters: ' + JSON.stringify(marketReport));

  await page.keyboard.press('KeyJ');
  await waitForVisible(page, '[data-screen="missionLog"]', 10000, 'Mission Log opened from station with J');
  const logReport = await page.evaluate(() => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const state = window.SF.state;
    const trackedId = state.ui.trackedMissionId;
    const tracked = state.missions.active.find((m) => m.id === trackedId);
    const screen = document.querySelector('[data-screen="missionLog"]');
    return {
      top: window.SF.ctx.screenManager.top(),
      trackedId,
      trackedTitle: tracked && tracked.title,
      text: normalize(screen && screen.textContent),
      recText: normalize(screen && screen.querySelector('.sf-mlog-recommend') && screen.querySelector('.sf-mlog-recommend').textContent),
      trackedCard: normalize(screen && screen.querySelector('.sf-mlog-card.tracked') && screen.querySelector('.sf-mlog-card.tracked').textContent),
    };
  });
  assert.equal(logReport.top, 'missionLog', 'J from station should push the Mission Log screen');
  assert.match(logReport.recText, /TRACKED/i, 'Mission Log recommendation should lead with the tracked mission');
  assert(logReport.recText.includes(logReport.trackedTitle),
    'Mission Log recommendation should name the tracked mission: ' + JSON.stringify(logReport));
  assert(logReport.trackedCard.includes('TRACKING'),
    'Mission Log active card should show TRACKING state: ' + JSON.stringify(logReport));

  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => window.SF && window.SF.ctx && window.SF.ctx.screenManager.top() === 'station', null, {
    timeout: 5000,
  });
  assert.equal(await clickButton(page, 'UNDOCK'), true, 'station should expose Undock after returning from Mission Log');
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && state.ui && state.ui.docked === false &&
      sf.ctx.screenManager.top() !== 'station' && player && player.alive && player.hull > 0);
  }, null, { timeout: DOCK_TIMEOUT_MS });

  const hudReport = await page.evaluate(() => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const tracker = document.querySelector('.sf-mission-tracker');
    const state = window.SF.state;
    return {
      mode: state.mode,
      docked: state.ui.docked,
      trackedId: state.ui.trackedMissionId,
      waypointMissionId: state.nav.waypoint && state.nav.waypoint.missionId,
      trackerVisible: !!tracker && getComputedStyle(tracker).display !== 'none',
      trackerText: normalize(tracker && tracker.textContent),
      navText: normalize(document.querySelector('.sf-nav-readout') && document.querySelector('.sf-nav-readout').textContent),
    };
  });
  assert.equal(hudReport.mode, 'flight', 'undock should return to flight mode');
  assert.equal(hudReport.docked, false, 'undock should clear docked state');
  assert.equal(hudReport.waypointMissionId, hudReport.trackedId, 'HUD flight state should keep the accepted mission waypoint');
  assert.equal(hudReport.trackerVisible, true, 'flight HUD should show mission tracker after accepting and undocking');
  assert(hudReport.trackerText.includes(logReport.trackedTitle),
    'HUD tracker should name the accepted mission: ' + JSON.stringify(hudReport));
  assert.deepEqual(issues.errorIssues(), [], 'mission accept handoff probe should not record page errors');

  console.log('Mission accept handoff OK: station confirmation -> Mission Log J -> tracked HUD after undock');
  console.log('Dock target:', dockTarget.stationId, dockTarget.label);
  console.log('Mission:', logReport.trackedId, logReport.trackedTitle);
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
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
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
  const port = await findFreePort(8160);
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
  throw new Error('No free local port found for mission accept handoff runtime check');
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
