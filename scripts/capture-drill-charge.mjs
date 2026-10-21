#!/usr/bin/env node
// capture-drill-charge.mjs — player-route visual evidence for the bore-charge verb (PQ-130
// demolition packet). Boots a real game, opens the works screen on a live asteroid, and on the
// REAL screen photographs the charge aim brackets with their per-cell verdicts, the seated puck
// on its fuse, the blast frame, and the carved 3x3 it leaves. Output: .devshots/drill-charge/.
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = join(ROOT, '.devshots', 'drill-charge');
const VIEWPORT = { width: 1500, height: 940 };

const { chromium } = await loadPlaywright();
mkdirSync(OUT_DIR, { recursive: true });

let server = null;
let browser = null;
let issues = null;
const failures = [];

try {
  server = await startFreshServer();
  // Headed system Chrome/Edge with a real GPU — headless SwiftShader times out the authored-
  // visual gate and would software-render the WebGL playfield.
  const executablePath = findSystemBrowser();
  browser = await chromium.launch(executablePath ? {
    headless: false,
    executablePath,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--force-device-scale-factor=1'],
  } : { headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  issues = collectPageIssues(page);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      localStorage.setItem('sf.firstRunIntroSeen', '1');
    } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF && window.SF.bus && window.SF.state), null,
    { timeout: 60000 });

  const shot = (name) => page.screenshot({ path: join(OUT_DIR, name), type: 'png' });

  await page.evaluate(async () => {
    const ready = window.SF.state.render && window.SF.state.render.authoredPartLibraryReady;
    if (ready && typeof ready.then === 'function') await ready.catch(() => {});
  });

  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Charge Hand', difficulty: 'standard' });
  });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 120000 });
  await page.waitForTimeout(1500);

  const opened = await page.evaluate(() => {
    const sf = window.SF;
    const st = sf.state;
    st.player.credits = Math.max(st.player.credits || 0, 1200);
    const ast = st.entityList.find((e) => e && e.alive !== false && e.type === 'asteroid'
      && e.data && (e.data.yieldU || 0) > 10);
    if (!ast) return { ok: false };
    st.ui.pendingDrillAsteroidId = ast.id;
    sf.ctx.screenManager.pushScreen('drill');
    return { ok: true, asteroidId: ast.id };
  });
  if (!opened.ok) throw new Error('no live asteroid found for the charge capture');
  await page.waitForFunction(() => !!window.SF.state.drill, null, { timeout: 15000 });
  const gl = await page.evaluate(() => {
    const cv = document.querySelector('.ast-canvas');
    if (!cv) return 'no-canvas';
    const ctx = cv.getContext('webgl2') || cv.getContext('webgl');
    return ctx ? 'webgl' : 'no-webgl';
  });
  if (gl !== 'webgl') throw new Error(`drill canvas has no WebGL context (${gl})`);
  await page.waitForTimeout(1200);

  // Park the rover beside a solid rock face so the 3x3 verdicts are all live material.
  const aimed = await page.evaluate(() => {
    const sf = window.SF;
    const d = sf.state.drill;
    const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
    // Hollow a lane so the rover can sit inside the cut, one cell from solid rock.
    for (const [c, r] of [[14, 1], [14, 2], [14, 3], [14, 4]]) {
      if (d.field[c][r].type === 'empty') continue;
      d.field[c][r] = EMPTY();
    }
    d.avatar.col = 14; d.avatar.row = 3;
    d.avatar.fromCol = 14; d.avatar.fromRow = 3;
    const drill = sf.ctx.systems ? sf.ctx.systems.drill : null;
    return { ok: true, hasDrill: !!drill };
  });
  if (!aimed.ok) throw new Error('rover staging failed');
  await page.locator('.ast-canvas').click({ position: { x: 400, y: 200 } });
  await page.waitForTimeout(400);

  // R arms the verb — photograph the aim brackets and per-cell verdicts before commitment.
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(700);
  const armed = await page.evaluate(() => {
    const d = window.SF.state.drill;
    const hook = document.querySelector('.ast-canvas') && document.querySelector('.ast-canvas').__ast3d;
    const readiness = hook && hook.readiness ? hook.readiness() : 'no-hook';
    return { armed: d.chargeArmed, aim: d.chargeAim, readiness,
      active: d.active, charge: d.charge, cooldown: d.chargeCooldown };
  });
  console.log('charge-arm probe:', JSON.stringify(armed));
  if (!armed.armed) failures.push('KeyR never armed the bore charge on the live screen');
  await shot('01-charge-aim-brackets.png');

  // R again seats the puck — the fuse runs on the drill clock.
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => !!window.SF.state.drill.charge, null, { timeout: 5000 });
  await page.waitForTimeout(500);
  await shot('02-charge-seated-fuse.png');

  // Step the rover out of the pattern (backblast is previewed; the capture stays about the cut).
  await page.evaluate(() => {
    const d = window.SF.state.drill;
    if (d.charge && d.avatar) {
      const away = d.charge.col + 4 < 28 ? d.charge.col + 4 : Math.max(0, d.charge.col - 4);
      d.avatar.col = away; d.avatar.fromCol = away;
    }
  });

  // Photograph the detonation frame — the ring + kick land in the same beat the cells clear.
  const blasted = page.evaluate(() => new Promise((resolve) => {
    const off = window.SF.bus.on('drill:chargeBlast', (p) => {
      off();
      setTimeout(() => resolve({ cells: (p.cells || []).length, backblast: !!p.backblast }), 60);
    });
    setTimeout(() => resolve(null), 4000);
  }));
  const blast = await blasted;
  await shot('03-charge-blast.png');
  await page.waitForTimeout(1600);
  await shot('04-charge-aftermath.png');
  if (!blast) failures.push('no drill:chargeBlast fired after the fuse');
  else if (blast.cells < 5) failures.push(`blast cleared only ${blast.cells} cells`);

  // Persistence: the carved cells must already be recorded on the asteroid.
  const persisted = await page.evaluate(() => {
    const st = window.SF.state;
    const ent = st.entities.get(st.drill.asteroidId);
    return ent && ent.data ? (ent.data.drillCleared || []).length : 0;
  });
  if (persisted < 4) failures.push(`only ${persisted} cleared cells persisted after the blast`);

  const errors = issues.errorIssues();
  if (errors.length) failures.push('page errors: ' + errors.map((e) => e.text || e).join(' | '));
  console.log('drill-charge captures written to .devshots/drill-charge/',
    JSON.stringify({ armed: armed.armed, blast }));
} catch (err) {
  failures.push(err && err.message ? err.message : String(err));
  try {
    const errors = issues ? issues.errorIssues() : [];
    if (errors.length) failures.push('page errors: ' + errors.map((e) => e.text || e).join(' | '));
  } catch (_) {}
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.kill) await server.kill().catch(() => {});
}

if (failures.length) {
  console.error('capture-drill-charge FAIL:\n' + failures.join('\n'));
  process.exitCode = 1;
}

function findSystemBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean).find((candidate) => existsSync(candidate)) || null;
}

async function startFreshServer() {
  const port = await findFreePort(8230);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => {
    gameServer.once('error', reject);
    gameServer.once('listening', () => resolve());
    gameServer.listen(port, '127.0.0.1');
  });
  return {
    baseUrl,
    kill: () => new Promise((resolve, reject) => {
      if (!gameServer.listening) { resolve(); return; }
      gameServer.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function findFreePort(start) {
  for (let port = start; port < start + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free port found for drill-charge capture');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
