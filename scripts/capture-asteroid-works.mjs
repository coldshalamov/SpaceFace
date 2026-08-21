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
// Law §11.10 evidence is judged at play size; the theater leaf needs 1920×1080 stills.
const VIEWPORT = {
  width: Number(process.env.AST_CAP_W) || 1500,
  height: Number(process.env.AST_CAP_H) || 940,
};

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

  // ---------------------------------------------------------------- PQ-130.04 "cells speak" still
  // One frame that has to answer the stranger test on its own: a seam body outlined with its count
  // chip beside plain matrix, a gas pocket, an MK-locked vein, and the split preview live under the
  // rig's aim. Rather than hoping the entry shaft happens to sit on all four, hunt the generated
  // field for the richest work-zoom window that also contains a seam cell whose removal genuinely
  // splits a body in two — otherwise the "split preview" evidence is a preview of nothing.
  const frameStill = async (MODE_IN, shotName, hard) => {
  const framed = await page.evaluate((MODE) => {
    const sf = window.SF;
    const st = sf.state;
    const d = st.drill;
    const COLS = 28, ROWS = 45;
    const iOf = (c, r) => r * COLS + c;
    const inb = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const oreOf = (c, r) => {
      const t = d.field[c][r];
      return t && t.type === 'vein' && t.ore ? t.ore : null;
    };

    // 4-connected same-ore components (the same body definition the renderer draws).
    const comp = new Map();
    const bodies = [];
    const seen = new Uint8Array(COLS * ROWS);
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const i0 = iOf(c, r);
        if (seen[i0]) continue;
        seen[i0] = 1;
        const ore = oreOf(c, r);
        if (!ore) continue;
        const cells = [];
        const stack = [[c, r]];
        while (stack.length) {
          const [cc, rr] = stack.pop();
          cells.push([cc, rr]);
          for (const [dc, dr] of N4) {
            const nc = cc + dc, nr = rr + dr;
            if (!inb(nc, nr)) continue;
            const ni = iOf(nc, nr);
            if (seen[ni] || oreOf(nc, nr) !== ore) continue;
            seen[ni] = 1;
            stack.push([nc, nr]);
          }
        }
        const body = { ore, cells };
        for (const [cc, rr] of cells) comp.set(iOf(cc, rr), body);
        bodies.push(body);
      }
    }

    // Articulation cells: removing one leaves two or more bodies — the law's `4 + 4`.
    const splits = [];
    for (const b of bodies) {
      if (b.cells.length < 3) continue;
      const set = new Set(b.cells.map(([c, r]) => iOf(c, r)));
      for (const [cx, cy] of b.cells) {
        // 'work' keeps clear of the §9 gallery spine at rows 1-4; 'deep' hunts the bottom third,
        // which is the only place the ice and deep-exotic rows of the law's table actually occur.
        if (cy < (MODE === 'deep' ? 26 : 8)) continue;
        const rest = new Set(set);
        rest.delete(iOf(cx, cy));
        const done = new Set();
        let parts = 0;
        for (const i of rest) {
          if (done.has(i)) continue;
          parts++;
          done.add(i);
          const stk = [i];
          while (stk.length) {
            const cur = stk.pop();
            const cc = cur % COLS, rr = (cur - cc) / COLS;
            for (const [dc, dr] of N4) {
              const nc = cc + dc, nr = rr + dr;
              if (!inb(nc, nr)) continue;
              const ni = iOf(nc, nr);
              if (!rest.has(ni) || done.has(ni)) continue;
              done.add(ni);
              stk.push(ni);
            }
          }
        }
        if (parts >= 2) splits.push({ c: cx, r: cy, ore: b.ore, size: b.cells.length });
      }
    }
    // The deep frame exists to photograph the ice and deep-exotic rows, which are rare and scattered
    // — demanding an articulation cell down there usually finds none, and then the two materials
    // never appear in the evidence at all. Any vein cell will do as an aim target for that frame.
    if (!splits.length && MODE === 'deep') {
      for (const b of bodies) {
        for (const [cx, cy] of b.cells) {
          if (cy >= 26) splits.push({ c: cx, r: cy, ore: b.ore, size: b.cells.length });
        }
      }
    }
    if (!splits.length) return { ok: false, reason: 'no splittable seam body in this field' };

    // Richness of the work-zoom window a rover at (rc,rr) would frame: ~16 columns by ~9 rows.
    const EXOTIC = ['cmdty_ore_einsteinium', 'cmdty_gem_emerald', 'cmdty_gem_ruby', 'cmdty_exotic_amazonite'];
    const richness = (rc, rr) => {
      let gas = 0, locked = 0, basalt = 0, seam3 = 0, ice = 0, exo = 0;
      const fams = new Set();
      for (let c = rc - 8; c <= rc + 8; c++) {
        for (let r = rr - 4; r <= rr + 4; r++) {
          if (!inb(c, r)) continue;
          const t = d.field[c][r];
          if (!t) continue;
          if (t.type === 'gas') gas++;
          else if (t.type === 'rock') basalt++;
          else if (t.type === 'vein' && t.ore) {
            fams.add(t.ore);
            if ((t.tierReq || 1) > 1) locked++;
            if (t.ore === 'cmdty_gem_diamond') ice++;
            if (EXOTIC.includes(t.ore)) exo++;
            const b = comp.get(iOf(c, r));
            if (b && b.cells.length >= 3) seam3++;
          }
        }
      }
      const base = (gas ? 16 : 0) + (locked ? 16 : 0) + (basalt ? 6 : 0) + Math.min(seam3, 6) * 3 + fams.size * 2;
      return base + (MODE === 'deep' ? (ice ? 60 : 0) + Math.min(exo, 4) * 12 : 0);
    };

    // Park the rig in a socket beside the articulation cell and point the boom at it.
    let best = null;
    for (const sp of splits) {
      for (const [dc, dr] of N4) {
        const nc = sp.c + dc, nr = sp.r + dr;
        if (!inb(nc, nr) || nr < (MODE === 'deep' ? 24 : 6)) continue;
        const t = d.field[nc][nr];
        if (!t || t.type === 'gas' || t.type === 'vein') continue;   // never blow a pocket for a photo
        const score = richness(nc, nr) + Math.min(sp.size, 9) * 5;
        if (!best || score > best.score) best = { score, rc: nc, rr: nr, tc: sp.c, tr: sp.r, ore: sp.ore, size: sp.size };
      }
    }
    if (!best) return { ok: false, reason: 'no rover socket beside a splittable seam' };

    // Carve just the socket, through the real break path so the renderer sees it.
    const ent = st.entities.get(d.asteroidId);
    if (d.field[best.rc][best.rr].type !== 'empty') {
      const was = d.field[best.rc][best.rr].type;
      d.field[best.rc][best.rr] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 };
      if (ent && ent.data) {
        if (!Array.isArray(ent.data.drillCleared)) ent.data.drillCleared = [];
        const idx = best.rr * 28 + best.rc;
        if (!ent.data.drillCleared.includes(idx)) ent.data.drillCleared.push(idx);
      }
      sf.bus.emit('drill:break', { col: best.rc, row: best.rr, type: was, ore: null, wasVein: false, wasGas: false });
    }
    d.avatar.col = best.rc; d.avatar.row = best.rr;
    d.avatar.fromCol = best.rc; d.avatar.fromRow = best.rr;
    d.avatar.moveDuration = 0; d.avatar.moveElapsed = 0;
    d.avatar.faceDir = best.tr > best.rr ? 'down' : (best.tr < best.rr ? 'up' : (best.tc > best.rc ? 'right' : 'left'));
    return { ok: true, ...best, tier: st.player.miningBeam ? st.player.miningBeam.tierId : 'beam_mk1' };
  }, MODE_IN);
  if (!framed.ok) {
    if (hard) failures.push(`${shotName} framing: ${framed.reason}`);
    else console.log(`${shotName}: skipped — ${framed.reason}`);
    return;
  }
  {
    await page.waitForTimeout(3200);   // camera leash eases in; the split preview holds while aimed
    await shot(shotName);
    const spoke = await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      const out = { seams: hook.seams().length, split: hook.splitPreview(), materials: {} };
      for (let c = 0; c < hook.cols; c++) {
        for (let r = 0; r < hook.rows; r++) {
          const a = hook.cellAppearance(c, r);
          if (!a || a.type === 'empty') continue;
          out.materials[a.material] = (out.materials[a.material] || 0) + 1;
        }
      }
      return out;
    });
    console.log(`${shotName}: aim ${framed.tc},${framed.tr} ${framed.ore} body ${framed.size}`,
      '· split →', JSON.stringify(spoke.split), '· bodies', spoke.seams, '· materials', JSON.stringify(spoke.materials));
    if (hard && !spoke.split.length) failures.push(`${shotName}: the split preview drew nothing under the aim`);
  }
  };
  await frameStill('work', '06-cells-speak.png', true);
  // The ice and deep-exotic rows of law §3.5 only occur below ~row 30, so they need their own frame
  // or the evidence set silently never shows two of the six materials.
  await frameStill('deep', '07-deep-materials.png', false);


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

  // Site register (law §4 two-register camera): whole-body silhouette against space.
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(600);
  await shot('05-site-register.png');
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(400);

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
