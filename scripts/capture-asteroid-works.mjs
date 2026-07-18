#!/usr/bin/env node
// capture-asteroid-works.mjs — player-route visual evidence for the asteroid works surface
// (design/ASTEROID_SITES_BRIEF.md §9 milestone). Boots a real game, opens the works screen on a
// live asteroid, carves a gallery, installs the six starter machines + overlays, runs site time,
// and photographs: the fresh cutaway, the build ghost with its contact ring, the running site,
// and the flight-world payoff (exterior relay + courier launch). Evidence only — assertions live
// in test/asteroid-sites.test.mjs. Output: .devshots/asteroid-works/.
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
const OUT_DIR = join(ROOT, '.devshots', 'asteroid-works');
const VIEWPORT = { width: 1500, height: 940 };

const { chromium } = await loadPlaywright();
mkdirSync(OUT_DIR, { recursive: true });

let server = null;
let browser = null;
let issues = null;
const failures = [];

try {
  server = await startFreshServer();
  // Headed system Chrome/Edge with a real GPU — the repo's proven route to authored-visual
  // readiness (headless SwiftShader times out the ship-visual gate; see the alpha baseline probe).
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

  // Let the authored ship library finish preloading before starting the run (cold headless boots
  // otherwise race the GameStartReadiness gate and the transition refuses fallback ships).
  await page.evaluate(async () => {
    const ready = window.SF.state.render && window.SF.state.render.authoredPartLibraryReady;
    if (ready && typeof ready.then === 'function') await ready.catch(() => {});
  });

  // Boot straight into a run.
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Site Engineer', difficulty: 'standard' });
  });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 120000 });
  await page.waitForTimeout(1500);

  // Stock the first-trip haul and open the works screen on a healthy rock (capture-only shortcut
  // for the buy-at-station leg; the tether route itself is exercised by flight-drill-onboarding).
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
  if (!opened.ok) throw new Error('no live asteroid found for the works capture');
  await page.waitForFunction(() => !!window.SF.state.drill, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot('01-cutaway-fresh.png');

  // Carve the §9 gallery through the real break seam (screen repaints, site mirrors cleared).
  // The gallery is a spine with side sockets so machines KEEP contacts — hollowing everything
  // starves the extractor, which is the mechanic, not the demo. The gas tap corridor hunts a REAL
  // gas pocket in the generated field so the site cache and the live session agree.
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
    // Spine + machine sockets.
    for (const [c, r] of [[14, 1], [14, 2], [14, 3], [14, 4], [13, 2], [13, 3], [13, 4]]) carve(c, r);
    // Find the nearest real sealed gas pocket with a non-gas approach cell.
    let best = null;
    for (let r = 2; r < 20; r++) {
      for (let c = 2; c < 26; c++) {
        if (d.field[c][r].type !== 'gas') continue;
        const dist = Math.abs(c - 14) + Math.abs(r - 3);
        if (!best || dist < best.dist) best = { c, r, dist };
      }
    }
    if (!best) return { ok: false, reason: 'no gas pocket in field' };
    // Approach cell: prefer the neighbor closest to the spine, never another gas cell.
    const approaches = [[best.c - 1, best.r], [best.c + 1, best.r], [best.c, best.r - 1], [best.c, best.r + 1]]
      .filter(([c, r]) => c >= 0 && c < 28 && r >= 1 && r < 45 && d.field[c][r].type !== 'gas');
    if (!approaches.length) return { ok: false, reason: 'gas pocket sealed on all sides' };
    approaches.sort((a, b) => (Math.abs(a[0] - 14) + Math.abs(a[1] - 3)) - (Math.abs(b[0] - 14) + Math.abs(b[1] - 3)));
    const [tc, tr] = approaches[0];
    // L-corridor from the spine to the approach cell (skip any gas met on the way).
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
    return { ok: true, tap: [tc, tr], gas: [best.c, best.r], corridor: path };
  });
  if (!carved.ok) throw new Error('gallery carve failed: ' + carved.reason);
  await page.waitForTimeout(400);

  // Build mode + extractor ghost: the contact-ring preview is the teaching moment — photograph it.
  await page.keyboard.press('KeyB');
  await page.keyboard.press('Digit2'); // extractor in the palette
  await page.evaluate(() => {
    const sf = window.SF;
    // Park the build cursor on the planned extractor cell.
    const screen = document.querySelector('.ast-screen');
    if (!screen) return;
    // cursor is controller state — reach it through a synthetic arrow walk instead of internals:
    void sf;
  });
  // Walk the cursor from the rover cell (14,2) one step left to (13,2).
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(700);
  await shot('02-build-ghost.png');

  // Install the milestone set: manual pre-core installs (rover adjacency), then remote after core.
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
    // One shared spine: cable + lane down the corridor; machines conduct the rest.
    const site = sites.getSite(siteId);
    const machineCells = new Set(site.machines.map((m) => `${m.col}:${m.row}`));
    const spine = [[14, 2], [14, 3]];
    const idxOf = new Set(site.cleared);
    for (let idx of idxOf) {
      const c = idx % 28;
      const r = Math.floor(idx / 28);
      if (r === 4 || (c === tap[0] && r !== tap[1])) spine.push([c, r]); // tap corridor cells
    }
    for (const [c, r] of spine) {
      if (machineCells.has(`${c}:${r}`)) continue;
      sites.setOverlay(siteId, 'power', c, r, true);
      sites.setOverlay(siteId, 'lane', c, r, true);
    }
    // Seed the fabricator chain with the imported haul (deposit path is UI-covered; direct here).
    sites._runtime(site);
    Object.assign(site.laneStores[0].store, { cmdty_refined_metals: 6, cmdty_purified_silica: 6, cmdty_electronics: 6 });
    sites.setPodTarget(siteId, 3);
    // Run ~12 minutes of site time on the sim clock (screen holds the world; production is
    // sim-owned): pods assemble, a courier launches, and its delivery receipt lands.
    for (let i = 0; i < 720; i++) { st.simTime += 1; sites.update(1, st); }
    return { siteId, results: out.map(([k, r]) => [k, r.ok, r.reason]), fleet: site.fleet, ledger: site.ledger.slice(0, 4) };
  }, carved.tap);
  const failedInstalls = built.results.filter(([, ok]) => !ok);
  if (failedInstalls.length) throw new Error('installs failed: ' + JSON.stringify(failedInstalls));

  // Back to drive mode; let the screen re-read the projection and photograph the running site.
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(1400);
  await shot('03-site-running.png');

  // Prime an immediate launch, then retract to flight and catch the courier + exterior relay.
  await page.evaluate(() => {
    const sf = window.SF;
    const st = sf.state;
    const sites = sf.ctx.asteroidSites;
    const site = sites.getSite('site_1');
    site.exportBuffer.cmdty_silicate = 12;
    if (site.fleet.podsReady < 1) site.fleet.podsReady = 1;
    site.fleet.lastLaunchT = -1e9;
    // Park the player camera beside the site rock for the exterior shot.
    const rock = st.entities.get(site.asteroidId);
    const player = st.entities.get(st.playerId);
    if (rock && player) {
      player.pos.x = rock.pos.x + 40;
      player.pos.z = rock.pos.z + 26;
      player.vel.x = 0; player.vel.z = 0;
    }
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.SF.state.drill, null, { timeout: 10000 });
  await page.waitForFunction(() => {
    const st = window.SF.state;
    return st.entityList.some((e) => e && e.alive !== false && e.data && e.data.kind === 'site_courier');
  }, null, { timeout: 30000 });
  // Frame the modified rock: park the ship 80wu out, chase camera looking back at the site.
  await page.evaluate(() => {
    const sf = window.SF;
    const st = sf.state;
    const site = sf.ctx.asteroidSites.getSite('site_1');
    const rock = st.entities.get(site.asteroidId);
    const player = st.entities.get(st.playerId);
    if (rock && player) {
      player.pos.x = rock.pos.x + 80;
      player.pos.z = rock.pos.z + 18;
      player.vel.x = 0; player.vel.z = 0;
      player.rot = Math.atan2(player.pos.z - rock.pos.z, player.pos.x - rock.pos.x) + Math.PI;
    }
  });
  await page.waitForTimeout(1600);
  await shot('04-flight-relay-courier.png');

  const summary = await page.evaluate(() => {
    const sf = window.SF;
    const site = sf.ctx.asteroidSites.getSite('site_1');
    const beacon = sf.state.entityList.find((e) => e && e.data && e.data.siteBeacon === 'site_1');
    const courier = sf.state.entityList.find((e) => e && e.alive !== false && e.data && e.data.kind === 'site_courier');
    return {
      anchored: site.anchored,
      machines: site.machines.length,
      launches: site.fleet.launches,
      delivered: site.fleet.delivered,
      lost: site.fleet.lost,
      podsReady: site.fleet.podsReady,
      beacon: !!beacon,
      courierVisible: !!courier,
      credited: site.stats.creditedCr,
      ledgerTop: site.ledger.slice(0, 3).map((l) => l.text),
    };
  });
  console.log('asteroid works capture summary:', JSON.stringify(summary, null, 2));
  if (!summary.anchored || summary.machines < 6) failures.push('site did not reach the §9 shape');
  if (!summary.beacon) failures.push('exterior relay beacon missing');
  if (summary.launches < 1) failures.push('no courier launches');

  const errors = issues.errorIssues();
  if (errors.length) failures.push('page errors: ' + errors.map((e) => e.text || e).join(' | '));
  console.log('asteroid works captures written to .devshots/asteroid-works/');
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
  console.error('capture-asteroid-works FAIL:\n' + failures.join('\n'));
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
  const port = await findFreePort(8210);
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
  throw new Error('no free port found for asteroid works capture');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
