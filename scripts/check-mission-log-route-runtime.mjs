#!/usr/bin/env node
// check-mission-log-route-runtime.mjs - browser smoke for accepted trade/delivery route clarity.
//
// Boots the canonical player URL, starts a real New Game through the UI, docks through the same
// dock:docked event path used by flight, accepts a first-session trade/delivery contract from the
// station board, then verifies the Mission Log exposes concrete next-route guidance. QA only: no
// route flags, no assets, no render settings, no gameplay default changes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = 45000;
const DOCK_TIMEOUT_MS = 15000;
const ROUTE_TYPES = ['bulk_trade', 'cargo_delivery', 'passenger_transport', 'smuggling_run'];
const ROUTE_TYPE_LABELS = new Set(ROUTE_TYPES);
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
  assert.equal(new URL(page.url()).search, '', 'mission log route probe must use the canonical root URL with no query flags');
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
    const tab = document.querySelector('[data-screen="station"] [role="tab"][data-tab="missions"], [data-screen="station"] [data-tab="missions"]');
    if (!tab) throw new Error('Station Missions tab not found');
    tab.click();
  });
  await waitForVisible(page, '[data-screen="station"] #st-panel-missions', 10000, 'station mission board');

  const accepted = await page.evaluate((stationId) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const boards = state && state.missions && state.missions.boards;
    const board = boards && (boards[stationId] || Object.values(boards).find((b) => b && Array.isArray(b.slots) && b.slots.length));
    const slots = board && Array.isArray(board.slots) ? board.slots : [];
    const buttons = [...document.querySelectorAll('[data-screen="station"] #st-panel-missions button[data-act="accept"][data-mid]')];
    const byId = new Map(buttons.map((button) => [button.getAttribute('data-mid'), button]));
    const routeTypes = ['bulk_trade', 'cargo_delivery', 'passenger_transport', 'smuggling_run'];
    const candidates = routeTypes.flatMap((type) => slots.filter((offer) => offer && offer.type === type));
    const offer = candidates.find((item) => {
      const id = item && (item.id != null ? item.id : item.missionId);
      const button = id && byId.get(String(id));
      return !!(button && !button.disabled && !item.requirementUnmet && !item.lockedReason);
    });
    if (!offer) {
      return {
        ok: false,
        reason: 'No accept-ready trade/delivery route offer on the first docked station board',
        stationId,
        visibleOfferTypes: slots.map((m) => m && m.type).filter(Boolean),
        visibleButtons: buttons.map((b) => ({ missionId: b.getAttribute('data-mid'), disabled: b.disabled, label: b.textContent })),
      };
    }
    const offerId = String(offer.id != null ? offer.id : offer.missionId);
    const button = byId.get(offerId);
    const beforeIds = (state.missions.active || []).map((m) => m.id);
    button.click();
    return {
      ok: true,
      offerId,
      beforeIds,
      type: offer.type,
      title: offer.title || offer.name || offer.type,
      destStationId: offer.destStationId || null,
      destSectorId: offer.destSectorId || null,
      params: offer.params || {},
      stationId,
    };
  }, dockTarget.stationId);

  assert.equal(accepted.ok, true, JSON.stringify(accepted, null, 2));
  assert(ROUTE_TYPE_LABELS.has(accepted.type), 'accepted probe mission should be a trade/delivery route type');

  await page.waitForFunction((info) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const active = state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
    return active.some((m) => !info.beforeIds.includes(m.id) && m.type === info.type && state.ui && state.ui.trackedMissionId === m.id);
  }, accepted, { timeout: 8000 }).catch(async (err) => {
    const stateDump = await page.evaluate(() => {
      const state = window.SF && window.SF.state;
      return {
        trackedMissionId: state && state.ui && state.ui.trackedMissionId,
        active: state && state.missions && state.missions.active && state.missions.active.map((m) => ({ id: m.id, type: m.type, title: m.title })),
      };
    });
    throw new Error(`Accepted route mission was not active + tracked: ${err.message}\n${JSON.stringify(stateDump, null, 2)}`);
  });

  const acceptedInstance = await page.evaluate((info) => {
    const state = window.SF && window.SF.state;
    const active = state && state.missions && state.missions.active || [];
    const mission = active.find((m) => !info.beforeIds.includes(m.id) && m.type === info.type) ||
      active.find((m) => m.id === (state.ui && state.ui.trackedMissionId));
    return mission ? {
      id: mission.id,
      type: mission.type,
      title: mission.title,
      destStationId: mission.destStationId || null,
      destSectorId: mission.destSectorId || null,
    } : null;
  }, accepted);
  assert(acceptedInstance && acceptedInstance.id, 'accepted mission instance should be discoverable after accepting route offer');

  await page.evaluate(() => {
    const sf = window.SF;
    const ctx = sf && sf.ctx;
    const mgr = ctx && (ctx.screenManager || (ctx.registry && ctx.registry.get && ctx.registry.get('ui') &&
      (ctx.registry.get('ui').screenManager || ctx.registry.get('ui').manager)));
    if (!mgr || typeof mgr.pushScreen !== 'function') throw new Error('No screen manager available to open Mission Log');
    mgr.pushScreen('missionLog');
  });
  await waitForVisible(page, '[data-screen="missionLog"]', 10000, 'mission log after accepting route mission');

  const log = await page.evaluate((missionId) => {
    const state = window.SF && window.SF.state;
    const mission = state && state.missions && state.missions.active && state.missions.active.find((m) => m.id === missionId);
    const root = document.querySelector('[data-screen="missionLog"]');
    const cards = [...document.querySelectorAll('[data-screen="missionLog"] .sf-mlog-card')];
    const card = cards.find((item) => item.querySelector(`[data-mid="${missionId}"]`)) || cards[0] || null;
    const waypoint = state && state.nav && state.nav.waypoint;
    return {
      trackedMissionId: state && state.ui && state.ui.trackedMissionId,
      mission: mission ? {
        id: mission.id,
        type: mission.type,
        title: mission.title,
        destStationId: mission.destStationId || null,
        destSectorId: mission.destSectorId || null,
      } : null,
      objective: card && card.querySelector('.sf-mlog-obj-text') && card.querySelector('.sf-mlog-obj-text').textContent.trim(),
      next: card && card.querySelector('.sf-mlog-next') && card.querySelector('.sf-mlog-next').textContent.trim(),
      dest: card && card.querySelector('.sf-mlog-dest') && card.querySelector('.sf-mlog-dest').textContent.trim(),
      waypointReason: waypoint && waypoint.reason,
      waypointLabel: waypoint && waypoint.label,
      waypointStationId: waypoint && waypoint.stationId,
      text: root && root.innerText,
    };
  }, acceptedInstance.id);

  assert.equal(log.trackedMissionId, acceptedInstance.id, 'accepted route mission should remain tracked when Mission Log opens');
  assert(log.mission && log.mission.id === acceptedInstance.id, 'Mission Log should be rendering the accepted route mission');
  assert(log.objective && log.objective.length > 8, 'Mission Log route card should show a concrete objective');
  assert(log.next && /^Next:/i.test(log.next), 'Mission Log route card should show an explicit next-step line');
  assert(log.dest && log.dest !== '—', 'Mission Log route card should show a concrete destination label');
  assert(log.waypointReason && /(Deliver|Sell|Transport|Smuggle)/i.test(log.waypointReason),
    'accepted route mission should set a useful nav waypoint reason');

  const combinedRouteText = [log.objective, log.next, log.dest, log.waypointReason, log.waypointLabel]
    .filter(Boolean).join(' | ');
  assert.doesNotMatch(combinedRouteText, /undefined|null|NaN/i, 'route guidance should not leak placeholder values');

  if (accepted.type === 'bulk_trade') {
    assert.match(log.objective, /Sell\s+\d+\/\d+\s+/i, 'bulk trade should show sell-progress and commodity in the objective');
    assert.match(log.next, /buy or carry/i, 'bulk trade next step should tell the player how to source the cargo');
    assert.match(log.next, /sell/i, 'bulk trade next step should carry the sell action through to the log');
    assert.match(log.waypointReason, /Sell/i, 'bulk trade nav reason should name the sell objective');
  } else {
    assert.match(log.next, /(follow tracked nav|deliver quietly)/i, 'delivery route next step should tell the player to follow nav');
    assert.match(log.next, /(dock|deliver|handoff|escape route)/i, 'delivery route next step should include the station-side completion action');
  }

  assert.deepEqual(issues.errorIssues(), [], 'mission log route probe should not record page errors');

  console.log('Mission log route OK: canonical New Game -> dock -> accept route job -> tracked Mission Log guidance');
  console.log('Dock target:', dockTarget.stationId, dockTarget.label);
  console.log('Accepted route:', acceptedInstance.id, acceptedInstance.type, acceptedInstance.title);
  console.log('Route guidance:', combinedRouteText);
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
    return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.hidden && r.width > 20 && r.height > 10;
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
  const port = await findFreePort(8170);
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
  throw new Error('No free local port found for mission log route runtime check');
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
