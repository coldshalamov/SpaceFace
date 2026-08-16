#!/usr/bin/env node
// Plan 54 public-route capture: New Game -> Pause -> Photo Mode -> hide all UI.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, '.devshots', 'plan54-photo-mode');
const CONTROLS_IMAGE = join(OUT, 'photo-mode-controls-default-route.png');
const IMAGE = join(OUT, 'photo-mode-hidden-ui-default-route.png');
const REPORT = join(OUT, 'report.json');
mkdirSync(OUT, { recursive: true });

let server = null;
let browser = null;
try {
  server = await startFreshServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF?.state && window.SF?.ctx?.screenManager, null, { timeout: 20000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Photo Mode Route', seed: 5402 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get?.(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.alive && sf?.state?.render?.cameraCtrl;
  }, null, { timeout: 90000 });
  await page.waitForTimeout(300);

  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-screen="pause"].sf-screen--visible', { timeout: 10000 });
  await page.getByRole('button', { name: 'Photo Mode' }).click();
  await page.waitForSelector('[data-screen="photoMode"].sf-screen--visible', { timeout: 10000 });

  const before = await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    return {
      simTime: sf.state.simTime,
      player: { x: player.pos.x, z: player.pos.z, vx: player.vel.x, vz: player.vel.z },
      camera: sf.state.render.cameraCtrl.photoModeState(),
    };
  });

  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.keyboard.down('e');
  await page.waitForTimeout(650);
  await page.keyboard.up('e');
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(360);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(80);
  await page.screenshot({ path: CONTROLS_IMAGE, fullPage: false });
  await page.keyboard.press('h');
  await page.waitForTimeout(160);

  const active = await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    const photoUi = document.querySelector('.sf-photo-mode-ui');
    const hud = document.querySelector('#hud');
    const visibility = (node) => node ? {
      opacity: getComputedStyle(node).opacity,
      visibility: getComputedStyle(node).visibility,
      display: getComputedStyle(node).display,
    } : null;
    return {
      mode: sf.state.mode,
      top: sf.ctx.screenManager.top(),
      simTime: sf.state.simTime,
      player: { x: player.pos.x, z: player.pos.z, vx: player.vel.x, vz: player.vel.z },
      camera: sf.state.render.cameraCtrl.photoModeState(),
      bodyClasses: [...document.body.classList],
      photoUi: visibility(photoUi),
      hud: visibility(hud),
    };
  });

  const cameraTravel = Math.hypot(
    active.camera.x - before.camera.x,
    active.camera.y - before.camera.y,
    active.camera.z - before.camera.z,
  );
  const playerUnchanged = JSON.stringify(active.player) === JSON.stringify(before.player);
  if (active.mode !== 'paused' || active.top !== 'photoMode' || active.simTime !== before.simTime
    || !playerUnchanged || cameraTravel < 20 || active.camera.active !== true
    || !active.bodyClasses.includes('sf-photo-mode-ui-hidden')
    || active.photoUi?.visibility !== 'hidden' || active.hud?.visibility !== 'hidden') {
    throw new Error('photo mode route incomplete: ' + JSON.stringify({ before, active, cameraTravel, playerUnchanged }));
  }

  await page.screenshot({ path: IMAGE, fullPage: false });

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const sf = window.SF;
    return sf.ctx.screenManager.top() === 'pause'
      && sf.state.render.cameraCtrl.photoModeState().active === false;
  }, null, { timeout: 10000 });
  const pausedSimTime = await page.evaluate(() => window.SF.state.simTime);
  await page.keyboard.press('Escape');
  await page.waitForFunction((t) => window.SF.state.mode === 'flight' && window.SF.state.simTime > t,
    pausedSimTime, { timeout: 10000 });

  const expectedIssues = [];
  const actionableIssues = [];
  for (const issue of issues.issues || []) {
    if (issue && issue.type === 'error'
      && /HTTP 404 .*\/__spaceface_player_store\b/.test(String(issue.text || ''))) {
      expectedIssues.push(issue);
    } else {
      actionableIssues.push(issue);
    }
  }

  const report = {
    ok: actionableIssues.length === 0,
    route: 'root -> game:new -> Escape pause -> Photo Mode -> camera move/look -> H hide UI -> Escape pause -> resume',
    viewport: { width: 1440, height: 900 },
    routeState: { before, active, cameraTravel, playerUnchanged },
    issues: {
      issues: actionableIssues,
      ignoredIssues: [...(issues.ignoredIssues || []), ...expectedIssues],
    },
    images: {
      controls: { path: CONTROLS_IMAGE, sha256: sha256(CONTROLS_IMAGE) },
      hiddenUi: { path: IMAGE, sha256: sha256(IMAGE) },
    },
    sourceSha256: sha256Many([
      join(ROOT, 'src', 'render', 'camera.js'),
      join(ROOT, 'src', 'ui', 'screens', 'photoMode.js'),
      join(ROOT, 'styles', 'ui.css'),
    ]),
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  if (!report.ok) throw new Error('browser issues: ' + JSON.stringify(report.issues));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.kill().catch(() => {});
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha256Many(paths) {
  const hash = createHash('sha256');
  for (const path of paths) hash.update(readFileSync(path));
  return hash.digest('hex');
}

async function startFreshServer() {
  const port = await findFreePort(8540);
  const url = `http://127.0.0.1:${port}/`;
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => {
    gameServer.once('error', reject);
    gameServer.once('listening', resolve);
    gameServer.listen(port, '127.0.0.1');
  });
  return {
    baseUrl: url,
    kill: () => new Promise((resolve, reject) => {
      if (!gameServer.listening) { resolve(); return; }
      gameServer.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port += 1) {
    const free = await new Promise((resolve) => {
      const probe = createNetServer();
      probe.once('error', () => resolve(false));
      probe.once('listening', () => probe.close(() => resolve(true)));
      probe.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free local port for photo mode capture');
}
