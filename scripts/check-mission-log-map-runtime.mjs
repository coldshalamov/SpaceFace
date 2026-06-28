#!/usr/bin/env node
// Browser smoke for Mission Log -> map handoffs. Boots the normal player route, opens the
// registered Mission Log through the live screen manager, and clicks both Star Map and Local Map
// handoff buttons on tracked missions.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SHOT = '.devshots/perf/mission-log-map-handoff.jpg';
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
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Mission Log Map Runtime', seed: 47 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive);
  }, null, { timeout: 45000 });

  const report = await page.evaluate(async () => {
    const sf = window.SF;
    const sm = sf.ctx && sf.ctx.screenManager;
    if (!sm) return { error: 'missing screen manager' };

    function visibleText(selector) {
      return (document.querySelector(selector)?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    async function openMissionLogFor(mission, waypoint) {
      sf.state.world.currentSectorId = 'sector_helios_prime';
      sf.state.missions.active = [mission];
      sf.state.ui.trackedMissionId = mission.id;
      sf.state.nav.waypoint = waypoint;
      if (sm.closeAll) sm.closeAll();
      sm.pushScreen('missionLog');
      if (sm.syncVisibility) sm.syncVisibility();
      await new Promise((resolve) => setTimeout(resolve, 120));
      return document.querySelector('[data-screen="missionLog"]');
    }

    const offSectorMission = {
      id: 'mission_runtime_star',
      status: 'active',
      type: 'cargo_delivery',
      title: 'Runtime Tethys Delivery',
      destStationId: 'station_tethys',
      destSectorId: 'sector_tethys_junction',
      objectiveProgress: 0,
      objectiveTarget: 1,
      deadline_s: 999,
      reward_cr: 700,
    };
    let log = await openMissionLogFor(offSectorMission, {
      kind: 'mission',
      missionId: offSectorMission.id,
      sectorId: 'sector_tethys_junction',
      sectorName: 'Tethys Junction',
      reason: 'Deliver runtime provisions to Tethys Junction',
    });
    const starButton = log && log.querySelector('.sf-mlog-btn-map[data-screen-id="starmap"]');
    const recStarButton = log && log.querySelector('.sf-mlog-rec-map[data-screen-id="starmap"]');
    const starText = visibleText('[data-screen="missionLog"]');
    if (starButton) starButton.click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const starTop = sm.top && sm.top();

    const localMission = {
      id: 'mission_runtime_local',
      status: 'active',
      type: 'recon_scan',
      title: 'Runtime Local Recon',
      destSectorId: 'sector_helios_prime',
      objectiveProgress: 0,
      objectiveTarget: 1,
      deadline_s: 999,
      reward_cr: 500,
    };
    log = await openMissionLogFor(localMission, {
      kind: 'mission',
      missionId: localMission.id,
      sectorId: 'sector_helios_prime',
      sectorName: 'Helios Prime',
      reason: 'Scan the local runtime site',
      pos: { x: 240, z: -80 },
    });
    const localButton = log && log.querySelector('.sf-mlog-btn-map[data-screen-id="localmap"]');
    const recLocalButton = log && log.querySelector('.sf-mlog-rec-map[data-screen-id="localmap"]');
    const localText = visibleText('[data-screen="missionLog"]');
    if (localButton) localButton.click();
    await new Promise((resolve) => setTimeout(resolve, 160));
    const localTop = sm.top && sm.top();
    const localMap = document.getElementById('sf-localmap');
    const localMapText = (localMap?.textContent || '').replace(/\s+/g, ' ').trim();

    return {
      starButton: !!starButton,
      recStarButton: !!recStarButton,
      starText,
      starTop,
      localButton: !!localButton,
      recLocalButton: !!recLocalButton,
      localText,
      localTop,
      localMapVisible: !!(localMap && localMap.getBoundingClientRect().width > 500),
      localMapText,
    };
  });

  assert.ok(!report.error, report.error || 'mission log runtime error');
  assert.equal(report.starButton, true, 'off-sector tracked mission should render a Star Map button');
  assert.equal(report.recStarButton, true, 'tracked recommendation should render a Star Map button');
  assert.match(report.starText, /STAR MAP/, 'off-sector Mission Log text should include the Star Map handoff');
  assert.equal(report.starTop, 'starmap', 'clicking the off-sector handoff should open the Star Map');
  assert.equal(report.localButton, true, 'same-sector tracked mission should render a Local Map button');
  assert.equal(report.recLocalButton, true, 'tracked recommendation should render a Local Map button');
  assert.match(report.localText, /LOCAL MAP/, 'same-sector Mission Log text should include the Local Map handoff');
  assert.equal(report.localTop, 'localmap', 'clicking the same-sector handoff should open the Local Map');
  assert.equal(report.localMapVisible, true, 'Local Map should be visible after clicking the Mission Log handoff');
  assert.doesNotMatch(report.localMapText, /Off-sector fix/, 'same-sector Local Map handoff should not show off-sector copy');
  assert.match(report.localMapText, /Sector fix|Helios Prime/, 'same-sector Local Map handoff should show local sector context');
  assert.deepEqual(issues.errorIssues(), [], 'mission log map runtime should not record page errors');

  mkdirSync(dirname(SHOT), { recursive: true });
  await page.screenshot({ path: SHOT, type: 'jpeg', quality: 88 });
  console.log(`Mission Log map runtime OK: off-sector -> ${report.starTop}, same-sector -> ${report.localTop}; screenshot ${SHOT}`);
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function startFreshServer() {
  const port = await findFreePort(8190);
  const url = `http://127.0.0.1:${port}/`;
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
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 120; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for mission log map runtime check');
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
