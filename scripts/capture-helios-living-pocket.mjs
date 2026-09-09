#!/usr/bin/env node
// Capture Browser (and best-effort Electron) public-route stills of the living Helios pocket.
// Writes under .devshots/helios-living-pocket/ and uses controlled post-launch framing; it does not
// modify repository or save data.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { createIsolatedElectronLaunch } from './lib/electronTestIsolation.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'helios-living-pocket');
const WIDTH = 1440;
const HEIGHT = 900;

function findSystemBrowser() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

function findEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!Number.isInteger(port)) reject(new Error('ephemeral port allocation failed'));
        else resolve(port);
      });
    });
  });
}

function pageUsesPort(candidate, port) {
  try {
    return Number(new URL(candidate).port) === port;
  } catch (_) {
    return false;
  }
}

function acceptedProbe(probe) {
  return !!(probe?.ok
    && probe.freighterCount >= 3
    && probe.playerAssetState?.startsWith('authored')
    && probe.station?.stationId === 'station_helios'
    && probe.station?.partId === 'place_station_trade_hub'
    && probe.station?.authoredAssetState?.startsWith('authored')
    && probe.station?.effectivelyVisible === true
    && probe.station?.centerOnScreen === true
    && probe.visibleScreens?.length === 0
    && probe.splashVisible === false);
}

async function driveToHeliosFlight(page) {
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 45_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  // This is acceptance evidence, so it must use the same public menu route as a player. State
  // injection can advance state.mode while leaving the title composition painted over the canvas,
  // which produced a false-positive "flight" capture before this guard existed.
  if ((await page.evaluate(() => window.SF.state.mode)) !== 'flight') {
    const newGameButton = page.getByRole('button', { name: 'New Game', exact: true });
    await newGameButton.waitFor({ state: 'visible', timeout: 30_000 });
    await newGameButton.click({ timeout: 30_000 });
    const launchButton = page.getByRole('button', { name: 'Launch', exact: true });
    await launchButton.waitFor({ state: 'visible', timeout: 30_000 });
    await launchButton.click({ timeout: 30_000 });
  }

  // Wait for the actual painted flight handoff, not state.mode alone. The player must already be
  // the authored ship and every title/menu surface must be absent from the frame.
  await page.waitForFunction(() => {
    const s = window.SF?.state;
    const player = s?.entities?.get?.(s.playerId);
    const visible = (element) => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    const visibleScreens = [...document.querySelectorAll('[data-screen]')].filter(visible);
    return s?.mode === 'flight'
      && player?.alive !== false
      && player?.presentationAdmission === 'ready'
      && String(player?.mesh?.userData?.authoredAssetState || '').startsWith('authored')
      && !visible(document.querySelector('#cinematic-splash'))
      && visibleScreens.length === 0;
  }, null, { timeout: 120_000 });

  // Allow traffic + director a few seconds of sim time (real-time).
  await sleep(4000);

  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const station = [...(state?.entityList || [])].find((entity) => (
      entity?.alive !== false
      && entity?.type === 'station'
      && entity?.data?.stationId === 'station_helios'
    ));
    return String(station?.mesh?.userData?.authoredAssetState || '').startsWith('authored');
  }, null, { timeout: 180_000 });

  // Preserve the public New Game/Launch admission path, then place the already-live player near the
  // already-live station solely for a matched surface-evidence frame. This is not route-completion
  // evidence; the receipt below records the controlled framing explicitly.
  await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const station = [...(state.entityList || [])].find((entity) => (
      entity?.alive !== false
      && entity?.type === 'station'
      && entity?.data?.stationId === 'station_helios'
    ));
    if (!player?.pos || !station?.pos) throw new Error('Helios/player unavailable for controlled framing');
    const x = station.pos.x - 65;
    const z = station.pos.z + 25;
    if (typeof player.pos.set === 'function') player.pos.set(x, 0, z);
    else { player.pos.x = x; player.pos.z = z; }
    player.prevPos?.copy?.(player.pos);
    if (player.vel?.set) player.vel.set(0, 0, 0);
    else { player.vel.x = 0; player.vel.z = 0; }
    player.flags = { ...(player.flags || {}), noInterp: true };
    state.camera.zoom = 210;
    window.SF.bus.emit('camera:zoom', { level: 210 });
    state.render?.cameraCtrl?.snapToPlayer?.();
    state.player.targetId = station.id;
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  // Record the actual station identity, authored state, and camera presence. A traffic-only scene is
  // insufficient evidence for a Helios asset capture.
  const probe = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    if (!player) return { ok: false, reason: 'no-player' };
    const freighters = (state.traffic && state.traffic.freighters) || [];
    let best = null;
    let bestD = Infinity;
    for (const rec of freighters) {
      const e = state.entities.get(rec.id);
      if (!e || !e.alive) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    const station = [...(state.entityList || [])].find((entity) => (
      entity?.alive !== false
      && entity?.type === 'station'
      && entity?.data?.stationId === 'station_helios'
    ));
    if (!station?.mesh) return { ok: false, reason: 'no-helios-station' };
    state.player.targetId = station.id;
    const effectivelyVisible = (object) => {
      let current = object;
      while (current) {
        if (current.visible === false) return false;
        current = current.parent;
      }
      return true;
    };
    const camera = state.render?.camera;
    camera?.updateWorldMatrix?.(true, false);
    station.mesh.updateWorldMatrix?.(true, true);
    const stationWorld = station.mesh.getWorldPosition(station.mesh.position.clone());
    const stationNdc = camera ? stationWorld.clone().project(camera) : null;
    const stationDistance = Math.hypot(station.pos.x - player.pos.x, station.pos.z - player.pos.z);
    const named = [];
    for (const e of state.entityList || []) {
      if (e && e.alive && e.data && e.data.namedLaneContactId) {
        named.push({
          id: e.data.namedLaneContactId,
          callsign: e.data.callsign,
          role: e.data.trafficRole,
          gimmick: e.data.gimmick,
        });
      }
    }
    return {
      ok: true,
      freighterCount: freighters.length,
      targetId: state.player.targetId,
      targetDist: Math.round(stationDistance),
      nearestFreighterDist: best ? Math.round(bestD) : null,
      framing: {
        kind: 'controlled-post-public-launch',
        cameraZoom: state.camera.zoom,
        playerPosition: { x: player.pos.x, z: player.pos.z },
      },
      station: {
        entityId: station.id,
        stationId: station.data?.stationId || null,
        partId: station.data?.archetypeGlb || station.data?.placeId || null,
        authoredAssetState: station.mesh.userData?.authoredAssetState || null,
        authoredVisualRoot: station.mesh.userData?.authoredVisualRoot || null,
        effectivelyVisible: effectivelyVisible(station.mesh),
        centerNdc: stationNdc ? { x: stationNdc.x, y: stationNdc.y, z: stationNdc.z } : null,
        centerOnScreen: !!(stationNdc
          && Math.abs(stationNdc.x) <= 0.94
          && Math.abs(stationNdc.y) <= 0.94
          && stationNdc.z >= -1
          && stationNdc.z <= 1),
      },
      named,
      sectorId: state.world && state.world.currentSectorId,
      heat: state.player.heat,
      playerAssetState: player.mesh?.userData?.authoredAssetState || null,
      visibleScreens: [...document.querySelectorAll('[data-screen]')]
        .filter((element) => {
          if (!element || element.hidden) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden'
            && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
        })
        .map((element) => element.getAttribute('data-screen')),
      splashVisible: (() => {
        const element = document.querySelector('#cinematic-splash');
        if (!element || element.hidden) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
      })(),
    };
  });
  return probe;
}

async function captureBrowser() {
  const ownedServer = await acquireVisualProbeServer({ root: ROOT });
  const executablePath = findSystemBrowser();
  assert(executablePath, 'Chrome or Edge required for browser capture');
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  const page = await context.newPage();
  const report = { route: 'browser', baseUrl: ownedServer.baseUrl, ok: false };
  try {
    await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const probe = await driveToHeliosFlight(page);
    report.probe = probe;
    const shot = path.join(OUT, 'browser-helios-pocket.png');
    await page.screenshot({ path: shot, type: 'png' });
    report.screenshot = path.relative(ROOT, shot).replace(/\\/g, '/');
    report.ok = acceptedProbe(probe);
  } finally {
    await browser.close().catch(() => {});
    await ownedServer.close().catch(() => {});
  }
  return report;
}

async function captureElectron() {
  // Best-effort: launch electron:dev against the same public entry if packaged, else note skip.
  const electronMain = path.join(ROOT, 'electron', 'main.cjs');
  const electronExecutable = path.join(
    ROOT,
    'node_modules',
    'electron',
    'dist',
    process.platform === 'win32' ? 'electron.exe' : 'electron',
  );
  if (!existsSync(electronMain)) {
    return { route: 'electron', ok: false, skipped: true, reason: 'no electron/main.cjs' };
  }
  if (!existsSync(electronExecutable)) {
    return { route: 'electron', ok: false, skipped: true, reason: 'installed Electron executable unavailable' };
  }
  // Prefer playwright-free evidence: run a short headed electron is heavy. Capture via CDP against
  // electron if ELECTRON_RUN_AS_NODE not set — use npm run electron only when available.
  const report = { route: 'electron', ok: false };
  let child = null;
  let browser = null;
  let isolatedLaunch = null;
  try {
    // Use fresh ports and accept only the page on this launch's game port. Fixed CDP ports can
    // accidentally connect to an unrelated developer Electron instance and create false evidence.
    const dbgPort = await findEphemeralPort();
    let gamePort = await findEphemeralPort();
    while (gamePort === dbgPort) gamePort = await findEphemeralPort();
    report.debugPort = dbgPort;
    report.gamePort = gamePort;
    isolatedLaunch = createIsolatedElectronLaunch({
      root: ROOT,
      taskId: 'helios-pocket',
      port: gamePort,
    });
    child = spawn(
      electronExecutable,
      ['.', `--remote-debugging-port=${dbgPort}`],
      {
        cwd: ROOT,
        env: isolatedLaunch.options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    let log = '';
    child.stdout.on('data', (d) => { log += d.toString(); });
    child.stderr.on('data', (d) => { log += d.toString(); });
    await sleep(8000);
    // Probe CDP
    let pageWs = null;
    for (let i = 0; i < 20 && !pageWs; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${dbgPort}/json/list`);
        const tabs = await r.json();
        const page = tabs.find((t) => (
          t.type === 'page'
          && t.webSocketDebuggerUrl
          && pageUsesPort(t.url, gamePort)
        ));
        if (page) pageWs = page.webSocketDebuggerUrl;
      } catch (_) {}
      await sleep(400);
    }
    if (!pageWs) {
      report.skipped = true;
      report.reason = 'electron CDP unavailable';
      report.logTail = log.slice(-500);
      return report;
    }
    const { chromium } = await loadPlaywright();
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${dbgPort}`);
    const context = browser.contexts()[0] || await browser.newContext();
    const page = context.pages().find((candidate) => pageUsesPort(candidate.url(), gamePort));
    if (!page) throw new Error(`Electron CDP did not expose this launch's game page on ${gamePort}`);
    const probe = await driveToHeliosFlight(page);
    report.probe = probe;
    const shot = path.join(OUT, 'electron-helios-pocket.png');
    await page.screenshot({ path: shot, type: 'png' });
    report.screenshot = path.relative(ROOT, shot).replace(/\\/g, '/');
    report.ok = acceptedProbe(probe);
  } catch (err) {
    report.error = String(err && err.message || err);
  } finally {
    await browser?.close().catch(() => {});
    let runtimeClosed = !child || child.exitCode != null;
    if (child && child.exitCode == null) {
      const exited = new Promise((resolve) => child.once('exit', () => resolve(true)));
      try { child.kill(); } catch (_) {}
      runtimeClosed = await Promise.race([exited, sleep(3_000).then(() => false)]).catch(() => false);
    }
    if (isolatedLaunch && runtimeClosed) {
      report.profileCleaned = isolatedLaunch.cleanup({ runtimeClosed: true });
    } else if (isolatedLaunch) {
      report.profileCleaned = false;
    }
  }
  return report;
}

await mkdir(OUT, { recursive: true });
const browserReport = await captureBrowser();
const electronReport = await captureElectron();
const evidence = {
  schema: 'spaceface.heliosLivingPocketCapture.v2',
  taskId: 'PROFESSIONAL-LIVING-HELIOS-POCKET-GROK-001',
  at: new Date().toISOString(),
  browser: browserReport,
  electron: electronReport,
};
await writeFile(path.join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
if (!browserReport.ok) process.exitCode = 1;
