#!/usr/bin/env node
// capture-drill-3d.mjs — player-route visual evidence for the drill screen's 3D playfield
// (design/DRILL_GRAPHICS_REVAMP_PLAN.md step 5). Boots a real game, opens the works screen on a
// live asteroid, and photographs the asteroidRenderer3d output on the REAL screen: the fresh
// cutaway, the rover boring a tile live (held key, real sim), the build ghost + contact ring, and
// the running machine site. Assertions live in test/asteroid-sites.test.mjs — this run fails only
// on page errors or a dead route. Output: .devshots/drill-3d/.
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
const OUT_DIR = join(ROOT, '.devshots', 'drill-3d');
const VIEWPORT = { width: 1500, height: 940 };

const { chromium } = await loadPlaywright();
mkdirSync(OUT_DIR, { recursive: true });

let server = null;
let browser = null;
let issues = null;
const failures = [];

try {
  server = await startFreshServer();
  // Headed system Chrome/Edge with a real GPU — headless SwiftShader times out the
  // authored-visual gate AND would software-render the new WebGL playfield.
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
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });

  const shot = (name) => page.screenshot({ path: join(OUT_DIR, name), type: 'png' });

  await page.evaluate(async () => {
    const ready = window.SF.state.render && window.SF.state.render.authoredPartLibraryReady;
    if (ready && typeof ready.then === 'function') await ready.catch(() => {});
  });

  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Site Engineer', difficulty: 'standard' });
  });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 120000 });
  await page.waitForTimeout(1500);

  const opened = await page.evaluate(() => {
    const sf = window.SF;
    const st = sf.state;
    const cargo = st.player.cargo;
    cargo.capVolume = Math.max(cargo.capVolume, 400);
    for (const [k, q] of Object.entries({
      cmdty_regocrete: 30, cmdty_control_unit: 8, cmdty_refined_metals: 10,
      cmdty_electronics: 6, cmdty_purified_silica: 6,
    })) cargo.items[k] = (cargo.items[k] || 0) + q;
    const ast = st.entityList.find((e) => e && e.alive !== false && e.type === 'asteroid'
      && e.data && (e.data.yieldU || 0) > 10);
    if (!ast) return { ok: false };
    st.ui.pendingDrillAsteroidId = ast.id;
    sf.ctx.screenManager.pushScreen('drill');
    return { ok: true, asteroidId: ast.id };
  });
  if (!opened.ok) throw new Error('no live asteroid found for the drill-3d capture');
  await page.waitForFunction(() => !!window.SF.state.drill, null, { timeout: 15000 });
  // The 3D renderer needs a WebGL context on the screen canvas — verify it exists, then let a
  // few frames land so lighting/shadows settle before the first photo.
  const gl = await page.evaluate(() => {
    const cv = document.querySelector('.ast-canvas');
    if (!cv) return 'no-canvas';
    const ctx = cv.getContext('webgl2') || cv.getContext('webgl');
    return ctx ? 'webgl' : 'no-webgl';
  });
  if (gl !== 'webgl') throw new Error(`drill canvas has no WebGL context (${gl})`);
  await page.waitForTimeout(1400);
  await shot('01-cutaway-3d-fresh.png');

  // Bore straight down with a REAL held key so the auger spin / sparks / carve-live path is the
  // thing photographed, not a staged mutation.
  await page.locator('.ast-canvas').click({ position: { x: 400, y: 200 } });
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(1600);
  await shot('02-boring-live.png');
  await page.waitForTimeout(1400);
  await page.keyboard.up('ArrowDown');
  const bored = await page.evaluate(() => {
    const d = window.SF.state.drill;
    return { row: d.avatar.row, col: d.avatar.col, cleared: d.cableTrail.length };
  });
  if (bored.row < 1) failures.push('rover never bored below the surface with a held key');

  // Carve the §9 gallery through the real break seam so machines have sockets + contacts.
  const carved = await page.evaluate(() => {
    const sf = window.SF;
    const st = sf.state;
    const d = st.drill;
    const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
    const ent = st.entities.get(d.asteroidId);
    const carve = (c, r) => {
      if (c < 0 || c > 27 || r < 1 || r > 44) return;
      if (d.field[c][r].type === 'empty') return;
      const was = d.field[c][r].type;
      d.field[c][r] = EMPTY();
      if (ent && ent.data) {
        if (!Array.isArray(ent.data.drillCleared)) ent.data.drillCleared = [];
        const idx = r * 28 + c;
        if (!ent.data.drillCleared.includes(idx)) ent.data.drillCleared.push(idx);
      }
      sf.bus.emit('drill:break', { col: c, row: r, type: was, ore: null, wasVein: false, wasGas: false });
    };
    for (const [c, r] of [[14, 1], [14, 2], [14, 3], [14, 4], [13, 2], [13, 3], [13, 4]]) carve(c, r);
    let best = null;
    for (let r = 2; r < 20; r++) {
      for (let c = 2; c < 26; c++) {
        if (d.field[c][r].type !== 'gas') continue;
        const dist = Math.abs(c - 14) + Math.abs(r - 3);
        if (!best || dist < best.dist) best = { c, r, dist };
      }
    }
    if (!best) return { ok: false, reason: 'no gas pocket in field' };
    const approaches = [[best.c - 1, best.r], [best.c + 1, best.r], [best.c, best.r - 1], [best.c, best.r + 1]]
      .filter(([c, r]) => c >= 0 && c < 28 && r >= 1 && r < 45 && d.field[c][r].type !== 'gas');
    if (!approaches.length) return { ok: false, reason: 'gas pocket sealed on all sides' };
    approaches.sort((a, b) => (Math.abs(a[0] - 14) + Math.abs(a[1] - 3)) - (Math.abs(b[0] - 14) + Math.abs(b[1] - 3)));
    const [tc, tr] = approaches[0];
    const path = [];
    const stepC = tc >= 14 ? 1 : -1;
    for (let c = 14 + stepC; stepC > 0 ? c <= tc : c >= tc; c += stepC) path.push([c, 4]);
    const stepR = tr >= 4 ? 1 : -1;
    for (let r = 4 + stepR; stepR > 0 ? r <= tr : r >= tr; r += stepR) path.push([tc, r]);
    for (const [c, r] of path) {
      if (d.field[c][r].type === 'gas') return { ok: false, reason: 'corridor hit gas' };
      carve(c, r);
    }
    d.avatar.col = 14; d.avatar.row = 2; d.avatar.fromCol = 14; d.avatar.fromRow = 2;
    return { ok: true, tap: [tc, tr] };
  });
  if (!carved.ok) throw new Error('gallery carve failed: ' + carved.reason);
  await page.waitForTimeout(500);

  // Build mode + extractor ghost with its contact-ring preview.
  await page.keyboard.press('KeyB');
  await page.keyboard.press('Digit2');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(900);
  await shot('03-build-ghost-3d.png');

  // Install the milestone set + overlays, run site time, photograph the living machine room.
  const built = await page.evaluate((tap) => {
    const sf = window.SF;
    const st = sf.state;
    const sites = sf.ctx.asteroidSites;
    const d = st.drill;
    const astId = d.asteroidId;
    const out = [];
    const move = (c, r) => { d.avatar.col = c; d.avatar.row = r; d.avatar.fromCol = c; d.avatar.fromRow = r; };
    move(14, 2);
    out.push(['extractor', sites.installMachine({ asteroidId: astId, defId: 'sm_extractor', col: 13, row: 2 })]);
    move(14, 2);
    out.push(['core', sites.installMachine({ asteroidId: astId, defId: 'sm_massline_core', col: 14, row: 1 })]);
    out.push(['gastap', sites.installMachine({ asteroidId: astId, defId: 'sm_gas_tap', col: tap[0], row: tap[1] })]);
    out.push(['refinery', sites.installMachine({ asteroidId: astId, defId: 'sm_refinery', col: 13, row: 3 })]);
    out.push(['fab', sites.installMachine({ asteroidId: astId, defId: 'sm_fabricator', col: 13, row: 4 })]);
    out.push(['port', sites.installMachine({ asteroidId: astId, defId: 'sm_cargo_port', col: 14, row: 4 })]);
    const siteId = out[0][1].siteId;
    const site = sites.getSite(siteId);
    const machineCells = new Set(site.machines.map((m) => `${m.col}:${m.row}`));
    const spine = [[14, 2], [14, 3]];
    for (const idx of new Set(site.cleared)) {
      const c = idx % 28;
      const r = Math.floor(idx / 28);
      if (r === 4 || (c === tap[0] && r !== tap[1])) spine.push([c, r]);
    }
    for (const [c, r] of spine) {
      if (machineCells.has(`${c}:${r}`)) continue;
      sites.setOverlay(siteId, 'power', c, r, true);
      sites.setOverlay(siteId, 'lane', c, r, true);
    }
    sites._runtime(site);
    Object.assign(site.laneStores[0].store, { cmdty_refined_metals: 6, cmdty_purified_silica: 6, cmdty_electronics: 6 });
    sites.setPodTarget(siteId, 3);
    for (let i = 0; i < 720; i++) { st.simTime += 1; sites.update(1, st); }
    return { siteId, results: out.map(([k, r]) => [k, r.ok, r.reason]) };
  }, carved.tap);
  const failedInstalls = built.results.filter(([, ok]) => !ok);
  if (failedInstalls.length) throw new Error('installs failed: ' + JSON.stringify(failedInstalls));

  await page.keyboard.press('KeyB');
  await page.waitForTimeout(1600);
  await shot('04-site-running-3d.png');

  const errors = issues.errorIssues();
  if (errors.length) failures.push('page errors: ' + errors.map((e) => e.text || e).join(' | '));
  console.log('drill-3d captures written to .devshots/drill-3d/', JSON.stringify(bored));
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
  console.error('capture-drill-3d FAIL:\n' + failures.join('\n'));
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
  throw new Error('no free port found for drill-3d capture');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
