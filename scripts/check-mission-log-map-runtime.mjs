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
  // Headless boot is roughly TWICE as slow as a real GPU here, and not because the game is slow:
  // SwiftShader does not expose KHR_parallel_shader_compile, so THREE compiles every program
  // serially on the main thread. Measured on this machine: window.SF.ctx ready at 11,977 ms
  // headless against this 15,000 ms budget — an 80% margin that any load at all tips over, and
  // it did, intermittently, across five checks. A real GPU HAS the extension (verified), so
  // this is an environment allowance, not a behavioural assertion being loosened. Everything
  // these checks actually assert happens after boot and is untouched.
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
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
    const starButton = log && log.querySelector('.sf-mlog-btn-map[data-screen-id="galaxyMap"][data-map-focus="galaxy"]');
    const recStarButton = log && log.querySelector('.sf-mlog-rec-map[data-screen-id="galaxyMap"][data-map-focus="galaxy"]');
    const starText = visibleText('[data-screen="missionLog"]');
    if (starButton) starButton.click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const starTop = sm.top && sm.top();
    const starDef = sm.getActiveScreenDef && sm.getActiveScreenDef();
    const starLevel = starDef && typeof starDef._activeLevel === 'function' ? starDef._activeLevel() : null;

    const starLocalMission = {
      id: 'mission_runtime_star_local',
      status: 'active',
      type: 'recon_scan',
      title: 'Runtime Star Local Fix',
      destSectorId: 'sector_helios_prime',
      objectiveProgress: 0,
      objectiveTarget: 1,
      deadline_s: 999,
      reward_cr: 400,
    };
    sf.state.world.currentSectorId = 'sector_helios_prime';
    sf.state.missions.active = [starLocalMission];
    sf.state.ui.trackedMissionId = starLocalMission.id;
    sf.state.nav.waypoint = {
      kind: 'mission',
      missionId: starLocalMission.id,
      sectorId: 'sector_helios_prime',
      sectorName: 'Helios Prime',
      reason: 'Scan the local runtime fix from Star Map',
      pos: { x: 260, z: -60 },
    };
    if (sm.closeAll) sm.closeAll();
    sm.pushScreen('starmap');
    if (sm.syncVisibility) sm.syncVisibility();
    await new Promise((resolve) => setTimeout(resolve, 160));
    const starLocalButton = document.querySelector('#sf-starmap [data-act="objective-localmap"]');
    const starLocalText = visibleText('#sf-starmap [data-objective]');
    if (starLocalButton) starLocalButton.click();
    await new Promise((resolve) => setTimeout(resolve, 160));
    const starLocalTop = sm.top && sm.top();
    const starLocalDef = sm.getActiveScreenDef && sm.getActiveScreenDef();
    const starLocalLevel = starLocalDef && typeof starLocalDef._activeLevel === 'function' ? starLocalDef._activeLevel() : null;

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
    const localButton = log && log.querySelector('.sf-mlog-btn-map[data-screen-id="galaxyMap"][data-map-focus="local"]');
    const recLocalButton = log && log.querySelector('.sf-mlog-rec-map[data-screen-id="galaxyMap"][data-map-focus="local"]');
    const localText = visibleText('[data-screen="missionLog"]');
    if (localButton) localButton.click();
    await new Promise((resolve) => setTimeout(resolve, 160));
    const localTop = sm.top && sm.top();
    const localDef = sm.getActiveScreenDef && sm.getActiveScreenDef();
    const localLevel = localDef && typeof localDef._activeLevel === 'function' ? localDef._activeLevel() : null;
    const galaxyMap = document.getElementById('sf-galaxymap');
    const galaxyMapText = (galaxyMap?.textContent || '').replace(/\s+/g, ' ').trim();

    return {
      starButton: !!starButton,
      recStarButton: !!recStarButton,
      starText,
      starTop,
      starLevel,
      starLocalButton: !!starLocalButton,
      starLocalText,
      starLocalTop,
      starLocalLevel,
      localButton: !!localButton,
      recLocalButton: !!recLocalButton,
      localText,
      localTop,
      localLevel,
      galaxyMapVisible: !!(galaxyMap && galaxyMap.getBoundingClientRect().width > 400),
      galaxyMapText,
    };
  });

  assert.ok(!report.error, report.error || 'mission log runtime error');
  assert.equal(report.starButton, true, 'off-sector tracked mission should render a Star Map button');
  assert.equal(report.recStarButton, true, 'tracked recommendation should render a Star Map button');
  assert.match(report.starText, /STAR MAP/, 'off-sector Mission Log text should include the Star Map handoff');
  assert.equal(report.starTop, 'galaxyMap', 'clicking the off-sector handoff should open the unified galaxyMap');
  assert.equal(report.starLevel, 'galaxy', 'off-sector handoff should open galaxyMap at GALAXY focus');
  assert.equal(report.starLocalButton, true, 'Star Map local objective should render a Local Map handoff button');
  assert.match(report.starLocalText, /LOCAL MAP|Open Local Map/i,
    'Star Map local objective should explain the Local Map handoff');
  assert.equal(report.starLocalTop, 'galaxyMap', 'clicking the Star Map local objective handoff should open galaxyMap');
  assert.equal(report.starLocalLevel, 'local', 'legacy starmap Local Map CTA should open galaxyMap at LOCAL focus');
  assert.equal(report.localButton, true, 'same-sector tracked mission should render a Local Map button');
  assert.equal(report.recLocalButton, true, 'tracked recommendation should render a Local Map button');
  assert.match(report.localText, /LOCAL MAP/, 'same-sector Mission Log text should include the Local Map handoff');
  assert.equal(report.localTop, 'galaxyMap', 'clicking the same-sector handoff should open the unified galaxyMap');
  assert.equal(report.localLevel, 'local', 'same-sector handoff should open galaxyMap at LOCAL focus');
  assert.equal(report.galaxyMapVisible, true, 'galaxyMap should be visible after clicking the Mission Log handoff');
  assert.match(report.galaxyMapText, /Tactical Command Table|Inspector|Layers/i,
    'galaxyMap shell should render after the Mission Log handoff');
  assert.deepEqual(issues.errorIssues(), [], 'mission log map runtime should not record page errors');

  mkdirSync(dirname(SHOT), { recursive: true });
  await page.screenshot({ path: SHOT, type: 'jpeg', quality: 88 });
  console.log(`Mission Log map runtime OK: off-sector -> ${report.starTop}/${report.starLevel}, same-sector -> ${report.localTop}/${report.localLevel}; screenshot ${SHOT}`);
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
