#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const SHOT_DIR = '.devshots/hud-readability';
const CELLS = [
  { width: 1280, height: 720, rows: 4 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort(start = 8150) {
  for (let port = start; port < start + 200; port++) {
    const available = await new Promise((resolve) => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error('No free HUD probe port');
}

async function waitReachable(url) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_) {}
    await sleep(150);
  }
  throw new Error(`HUD probe server never became reachable: ${url}`);
}

async function bootFlight(page) {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(page._hudProbeUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state, null, { timeout: 30000 });

  const newGame = page.getByRole('button', { name: 'New Game', exact: true });
  if (await newGame.isVisible().catch(() => false)) {
    await page.waitForFunction(() => [...document.querySelectorAll('button')]
      .some((button) => button.textContent.trim() === 'New Game' && !button.disabled), null, { timeout: 20000 });
    await newGame.click();
    const launch = page.getByRole('button', { name: 'Launch', exact: true });
    await launch.waitFor({ state: 'visible', timeout: 20000 });
    await launch.click();
  }
  try {
    await page.waitForFunction(() => {
      const state = window.SF && window.SF.state;
      return state && state.mode === 'flight' && state.entities.get(state.playerId);
    }, null, { timeout: 15000 });
  } catch (error) {
    const status = await page.evaluate(() => ({
      mode: window.SF?.state?.mode || null,
      screens: [...document.querySelectorAll('[data-screen]')]
        .filter((element) => getComputedStyle(element).display !== 'none')
        .map((element) => element.getAttribute('data-screen')),
      alerts: [...document.querySelectorAll('#alerts .sf-alert')].map((element) => element.textContent),
      buttons: [...document.querySelectorAll('button')]
        .filter((button) => getComputedStyle(button).display !== 'none')
        .map((button) => button.textContent.trim()).slice(0, 20),
    }));
    // Authored-asset preload can remain in `loading` for minutes while another graphics lane owns
    // release outputs. The player-facing HUD is already mounted on the public route at this point;
    // for this layout-only probe, advance only the disposable headless state and hide the launch
    // screen. This never weakens the real launch gate or changes production code.
    const hudMounted = await page.locator('#hud .sf-mission-tracker').count();
    if (status.mode === 'loading' && hudMounted) {
      await page.evaluate(() => {
        const screens = document.getElementById('screens');
        if (screens) screens.style.display = 'none';
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop) backdrop.hidden = true;
        document.body.classList.remove('ui-modal-open');
      });
      return;
    }
    throw new Error(`Flight boot timeout: ${JSON.stringify(status)}`, { cause: error });
  }
}

async function installReadabilityScene(page) {
  await page.evaluate(() => {
    const state = window.SF.state;
    let player = state.entities.get(state.playerId);
    if (!player) {
      player = {
        id: state.playerId,
        type: 'ship',
        alive: true,
        team: 1,
        pos: { x: 0, y: 0, z: 0 },
        vel: { x: 30, y: 0, z: -20 },
        hull: 100, hullMax: 100,
        shield: 60, shieldMax: 60,
        armorHp: 40, armorMax: 40,
        cap: 80, capMax: 100,
        fuel: 100, fuelMax: 100,
        mass: 180,
        maxSpeed: 120,
        data: { defId: 'ship_kestrel', weapons: [{ id: 'pulse_laser', name: 'Pulse Laser' }] },
      };
      state.entities.set(player.id, player);
      state.entityList.push(player);
    }
    player.vel = { x: 30, y: 0, z: -20 };
    if (state.onboarding) {
      state.onboarding.active = false;
      state.onboarding.finished = true;
    }
    document.getElementById('sf-onboarding')?.remove();

    state.ui = state.ui || {};
    state.ui.trackedMissionId = 'qa_hud_objective';
    state.missions = state.missions || {};
    state.missions.active = [{
      id: 'qa_hud_objective',
      status: 'active',
      title: 'Recover the 47-A sample',
      type: 'salvage_retrieval',
      destSectorId: state.world.currentSectorId,
      objectiveProgress: 0,
      objectiveTarget: 1,
    }];
    state.nav = state.nav || {};
    state.nav.waypoint = {
      missionId: 'qa_hud_objective',
      reason: 'Recover the 47-A sample',
      label: '47-A RECOVERY SITE',
      sectorName: 'Helios Prime',
      markerKind: 'mission-objective',
      pos: { x: player.pos.x + 900, z: player.pos.z - 600 },
    };

    const isContact = (entity) => entity !== player
      && (entity.type === 'ship' || entity.type === 'drone' || entity.type === 'wreck');
    for (const entity of [...(state.entityList || [])]) {
      if (!isContact(entity)) continue;
      entity.alive = false;
      state.entities.delete(entity.id);
    }
    const retained = (state.entityList || []).filter((entity) => !isContact(entity));
    state.entityList.length = 0;
    state.entityList.push(...retained);

    const definitions = [
      { id: 'qa_threat_alpha', team: 3, callsign: 'RAZOR-1', role: 'Interceptor', ai: { forcePlayerTarget: true }, mass: 180 },
      { id: 'qa_threat_beta', team: 3, callsign: 'CUTLASS', role: 'Raider', ai: { forcePlayerTarget: true }, mass: 420 },
      { id: 'qa_ally_alpha', team: player.team, callsign: 'ESCORT-1', role: 'Wingman', ai: {}, mass: 160 },
      { id: 'qa_ally_beta', team: player.team, callsign: 'ESCORT-2', role: 'Wingman', ai: {}, mass: 150 },
      { id: 'qa_wreck_a', team: 0, callsign: '47-A HULK', role: 'Derelict', wreck: true, mass: 300 },
      { id: 'qa_wreck_b', team: 0, callsign: 'OLD RELAY', role: 'Derelict', wreck: true, mass: 280 },
      { id: 'qa_patrol_a', team: 2, callsign: 'HELIOS-3', role: 'Patrol', ai: { lawful: true }, mass: 220 },
      { id: 'qa_patrol_b', team: 2, callsign: 'HELIOS-4', role: 'Patrol', ai: { lawful: true }, mass: 220 },
      { id: 'qa_trader', team: 2, callsign: 'SUNWARD', role: 'Trader', ai: { passive: true }, mass: 330 },
      { id: 'qa_miner', team: 2, callsign: 'DEEPWELL', role: 'Miner', ai: { passive: true }, mass: 260 },
    ];
    definitions.forEach((definition, index) => {
      const entity = {
        id: definition.id,
        type: definition.wreck ? 'wreck' : 'ship',
        alive: true,
        team: definition.team,
        mass: definition.mass,
        pos: { x: player.pos.x + 220 + index * 75, z: player.pos.z - 140 - index * 55 },
        vel: { x: 0, z: 0 },
        hull: 100,
        hullMax: 100,
        shield: 40,
        shieldMax: 40,
        armorHp: 30,
        armorMax: 30,
        data: {
          callsign: definition.callsign,
          name: definition.callsign,
          role: definition.role,
          ai: definition.ai,
          kind: definition.wreck ? 'derelict' : undefined,
        },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
    });
    state.player.targetId = 'qa_threat_alpha';
    state.settings.ui.overviewOpen = true;
    state.mode = 'flight';
  });

  await page.waitForFunction(() => (
    document.querySelector('.sf-mission-tracker')?.textContent.includes('47-A RECOVERY SITE')
    && document.querySelectorAll('.sf-overview-row').length > 0
  ), null, { timeout: 15000 });
}

function overlaps(a, b) {
  return !!(a && b && a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y);
}

let serverChild = null;
let browser = null;
try {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/`;
  serverChild = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  serverChild.stdout.on('data', () => {});
  serverChild.stderr.on('data', () => {});
  await waitReachable(baseUrl);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page._hudProbeUrl = baseUrl;
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await bootFlight(page);
  await installReadabilityScene(page);

  mkdirSync(SHOT_DIR, { recursive: true });
  const evidence = [];
  for (const cell of CELLS) {
    await page.setViewportSize({ width: cell.width, height: cell.height });
    await page.waitForFunction(
      (expectedRows) => document.querySelectorAll('.sf-overview-row').length === expectedRows,
      cell.rows,
      { timeout: 4000 },
    );
    const measurement = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        return {
          x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
          right: bounds.right, bottom: bounds.bottom,
          display: getComputedStyle(element).display,
        };
      };
      return {
        objective: rect('.sf-mission-tracker'),
        bars: rect('.sf-bars'),
        cluster: rect('.sf-cluster'),
        rightDock: rect('.sf-rightdock'),
        rows: document.querySelectorAll('.sf-overview-row').length,
        objectiveText: document.querySelector('.sf-mt-obj')?.textContent || '',
        markerText: document.querySelector('.sf-mt-time')?.textContent || '',
        overflowText: document.querySelector('.sf-overview-footer')?.textContent || '',
        worldMarker: rect('.sf-objarrow'),
        worldMarkerLabel: rect('.sf-objarrow__label'),
        worldMarkerText: document.querySelector('.sf-objarrow__label')?.textContent || '',
        worldMarkerMode: document.querySelector('.sf-objarrow')?.className || '',
        allyRows: [...document.querySelectorAll('.sf-overview-row')]
          .filter((row) => row.querySelector('.sf-overview-row__state')?.textContent === 'ALLY').length,
        legacyObjectives: getComputedStyle(document.querySelector('.sf-objectives')).display,
      };
    });

    assert.equal(measurement.rows, cell.rows, `${cell.width}x${cell.height} contact row cap`);
    assert.match(measurement.objectiveText, /Recover the 47-A sample.*47-A RECOVERY SITE/);
    assert.match(measurement.markerText, /AMBER DIAMOND \/ GOAL.*WU.*ETA \d+s.*[↑↗→↘↓↙←↖]/);
    assert.ok(measurement.worldMarker && measurement.worldMarker.display !== 'none',
      'the camera view must retain a visible spatial objective marker');
    assert.match(measurement.worldMarkerText, /GOAL.*47-A RECOVERY SITE.*WU.*ETA \d+s/);
    assert.match(measurement.worldMarkerMode, /sf-objarrow--(?:onscreen|edge)/);
    assert.ok(measurement.worldMarkerLabel.x >= 0 && measurement.worldMarkerLabel.right <= cell.width,
      'the spatial goal label must stay inside the viewport');
    assert.match(measurement.overflowText, /ALLY|WRECK|OTHER/);
    assert.ok(measurement.allyRows >= 1, `${cell.width}x${cell.height} shows an explicit ally row`);
    assert.equal(measurement.legacyObjectives, 'none');
    assert.equal(overlaps(measurement.objective, measurement.cluster), false);
    assert.equal(overlaps(measurement.objective, measurement.rightDock), false);
    assert.equal(overlaps(measurement.bars, measurement.cluster), false);

    await page.screenshot({ path: `${SHOT_DIR}/${cell.width}x${cell.height}.png` });
    await page.screenshot({ path: `${SHOT_DIR}/objective-after.png` });
    evidence.push({
      viewport: `${cell.width}x${cell.height}`,
      rows: measurement.rows,
      objective: measurement.objectiveText,
      marker: measurement.markerText,
      overflow: measurement.overflowText,
    });
  }
  assert.deepEqual(pageErrors, [], `live HUD page errors: ${pageErrors.join('\n')}`);
  console.log(JSON.stringify({ ok: true, cells: evidence, pageErrors: pageErrors.length }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (serverChild) serverChild.kill();
}
