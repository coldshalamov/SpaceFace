#!/usr/bin/env node
// capture-asteroid-works.mjs — player-route visual evidence for the asteroid works surface
// (design/ASTEROID_SITES_BRIEF.md §9 milestone). Boots a real game, opens the works screen on a
// live asteroid, carves a gallery, installs the six starter machines + overlays, runs site time,
// and photographs: the fresh cutaway, the build ghost with its contact ring, the running site,
// and the flight-world payoff (exterior relay + courier launch). Evidence only — assertions live
// in test/asteroid-sites.test.mjs. Output: .devshots/asteroid-works/.
//
// PQ-131 art units: node scripts/capture-asteroid-works.mjs --part=<id>
// writes works-part-<id>-work.png and works-part-<id>-site.png at 1920×1080.
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

// PQ-131.00 scaffold for later art units (.01 rover onward). Controller-run.
//   node scripts/capture-asteroid-works.mjs --part=drill_platform
// Opens the mine, loads that id through loadWorksPart, and writes work-register
// (120 px/cell) plus site-register (19 px/cell) stills. Do not treat these as
// review stills until the unit wires the authored asset and seats it.
const PART_ID = (process.argv.find((arg) => arg.startsWith('--part=')) || '').slice('--part='.length)
  || null;

async function captureAuthoredWorksPart(partId) {
  // Later art units review at play size: 1920×1080 → 120 px/cell work, 19 px/cell site.
  const partViewport = { width: 1920, height: 1080 };
  server = await startFreshServer();
  const executablePath = findSystemBrowser();
  browser = await chromium.launch(executablePath ? {
    headless: false,
    executablePath,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--window-size=${partViewport.width},${partViewport.height}`, '--force-device-scale-factor=1'],
  } : { headless: true });
  const page = await browser.newPage({ viewport: partViewport, deviceScaleFactor: 1 });
  issues = collectPageIssues(page);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      localStorage.setItem('sf.firstRunIntroSeen', '1');
    } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
  await page.evaluate(async () => {
    const ready = window.SF.state.render && window.SF.state.render.authoredPartLibraryReady;
    if (ready && typeof ready.then === 'function') await ready.catch(() => {});
  });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Works Part Capture', difficulty: 'standard' });
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
  if (!opened.ok) throw new Error('no live asteroid found for the works-part capture');
  await page.waitForFunction(() => !!window.SF.state.drill, null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.ast-canvas');
    return !!(canvas && canvas.__ast3d && typeof canvas.__ast3d.loadWorksPart === 'function');
  }, null, { timeout: 15000 });
  await page.waitForTimeout(800);

  const mounted = await page.evaluate(async (id) => {
    const h = document.querySelector('.ast-canvas').__ast3d;
    const result = id === 'drill_platform' && typeof h.mountWorksProof === 'function'
      ? await h.mountWorksProof()
      : await h.loadWorksPart(id);
    if (h.worksProofCell) h.frameCell(h.worksProofCell.col, h.worksProofCell.row);
    h.setZoomRegister('work');
    return result;
  }, partId);
  if (!mounted || !mounted.ok) {
    throw new Error(`loadWorksPart(${partId}) failed: ${JSON.stringify(mounted)}`);
  }
  await page.waitForTimeout(400);
  const workName = `works-part-${partId}-work.png`;
  await page.screenshot({ path: join(OUT_DIR, workName), type: 'png' });

  await page.evaluate(() => {
    document.querySelector('.ast-canvas').__ast3d.setZoomRegister('site');
  });
  await page.waitForTimeout(400);
  const siteName = `works-part-${partId}-site.png`;
  await page.screenshot({ path: join(OUT_DIR, siteName), type: 'png' });

  console.log(`works-part ${partId} mounted`, JSON.stringify({
    id: mounted.id,
    lod: mounted.lod,
    colourSpace: mounted.colourSpace,
    hooks: mounted.hooks,
    work: workName,
    site: siteName,
  }, null, 2));
}

if (PART_ID) {
  try {
    await captureAuthoredWorksPart(PART_ID);
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
    console.error('capture-asteroid-works --part FAIL:\n' + failures.join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

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

  // ---------------------------------------------------------------- PQ-130.06 "hover as instrument"
  // The cursor lens (law §6.4) is only ever on the glass while a pointer is on a cell, so it needs
  // its own still or the evidence set never shows it. hoverStill parks the real mouse over a real
  // cell and photographs what a player sees: a colour, a name, a number, two or three stamps.
  const hoverStill = async (pick, shotName) => {
    const spot = await page.evaluate((want) => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      if (!hook) return null;
      const centre = (c, r) => {
        const p = hook.projectCell(c, r);
        if (!p) return null;
        const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
        const x = (Math.min(...xs) + Math.max(...xs)) / 2;
        const y = (Math.min(...ys) + Math.max(...ys)) / 2;
        if (x < 90 || y < 90 || x > window.innerWidth - 90 || y > window.innerHeight - 90) return null;
        return { x, y };
      };
      if (want.col != null) {
        const at = centre(want.col, want.row);
        return at ? { ...at, col: want.col, row: want.row } : null;
      }
      // Richest on-glass seam cell: the biggest body wins, so the card shows a real cell count.
      let best = null;
      for (let c = 0; c < hook.cols; c++) {
        for (let r = 0; r < hook.rows; r++) {
          const a = hook.cellAppearance(c, r);
          if (!a || a.type !== 'vein') continue;
          const at = centre(c, r);
          if (!at) continue;
          const score = a.seam ? a.seam.count : 1;
          if (!best || score > best.score) best = { ...at, col: c, row: r, score };
        }
      }
      return best;
    }, pick);
    if (!spot) { console.log(`${shotName}: skipped — nothing on glass to hover`); return; }
    await page.mouse.move(spot.x - 6, spot.y - 6);
    await page.mouse.move(spot.x, spot.y);
    await page.waitForTimeout(500);          // 150ms hover delay + settle
    await shot(shotName);
    const read = await page.evaluate(() => {
      const el = document.querySelector('.aw-lens');
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      return {
        w: Math.round(r.width), h: Math.round(r.height),
        name: el.querySelector('.aw-lens-name')?.textContent || '',
        num: el.querySelector('.aw-lens-num')?.textContent || '',
        chips: [...el.querySelectorAll('.aw-lens-chip')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
        body: el.querySelector('.aw-lens-body')?.textContent || '',
      };
    });
    if (!read) { failures.push(`${shotName}: the lens never appeared under the pointer`); return; }
    console.log(`${shotName}: cell ${spot.col},${spot.row} → ${read.w}x${read.h}px "${read.name}" `
      + `"${read.num}" chips [${read.chips.join(', ')}]${read.body ? ` body "${read.body}"` : ''}`);
    // Park the pointer back on chrome so the next still is the clean default view.
    await page.mouse.move(Math.round(VIEWPORT.width / 2), 8);
    await page.waitForTimeout(250);
  };
  await hoverStill({}, '08-lens.png');



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

  // Build mode + the FIRST ghost a player ever sees. PQ-130.09 made the palette earned (law §6.3):
  // on a rock with no Core there is no palette and no key to press, because there is exactly one
  // legal build — so B arms the Massline Core implicitly and this frame is the Core's ghost with
  // its contact ring. The extractor ghost with the palette up is 09-palette.png below.
  await page.keyboard.press('KeyB');
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

  // PQ-130.07 law §5 "Machine starved/unpowered": the housing goes dark and a small GOLD WANT CHIP
  // floats above it carrying the missing input's swatch (or a power bolt) — a colour, never a word,
  // so a stalled site cannot spend the screen's 15-word budget. Report what the running site is
  // actually saying; a site with nothing wrong has nothing to draw and that is not a defect.
  {
    const want = await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      const sf = window.SF;
      const proj = sf.ctx.asteroidSites.projection ? sf.ctx.asteroidSites.projection('site_1') : null;
      const states = proj && proj.machines
        ? proj.machines.map((m) => `${m.defId || m.id}:${(m.status && m.status.state) || '?'}`
          + `${m.status && m.status.limit ? `(${m.status.limit})` : ''}`)
        : [];
      const site = sf.ctx.asteroidSites.getSite('site_1');
      const FAULT = ['no-power', 'starved'];
      let at = null;
      if (proj && proj.machines) {
        for (const pm of proj.machines) {
          if (!pm.status || !FAULT.includes(pm.status.state)) continue;
          const m = site.machines.find((x) => x.id === pm.id);
          if (m) { at = { col: m.col, row: m.row, state: pm.status.state, limit: pm.status.limit }; break; }
        }
      }
      return { chips: hook ? hook.fx().wantChips : -1, states, at };
    });
    console.log(`03-site-running.png: want chips ${want.chips} · machines [${want.states.join(', ')}]`);
    // Law §5 "Machine starved/unpowered" — park the rig beside the machine that is waiting so the
    // gold want chip is actually IN a frame. A chip nobody photographed is a chip nobody has seen.
    if (want.at) {
      await page.evaluate((at) => {
        const d = window.SF.state.drill;
        const N4 = [[0, -1], [1, 0], [-1, 0], [0, 1]];
        for (const [dc, dr] of N4) {
          const c = at.col + dc, r = at.row + dr;
          const t = d.field[c] && d.field[c][r];
          if (!t || t.type !== 'empty' || t.structure) continue;
          d.avatar.col = c; d.avatar.row = r;
          d.avatar.fromCol = c; d.avatar.fromRow = r;
          d.avatar.moveDuration = 0; d.avatar.moveElapsed = 0;
          d.avatar.faceDir = dr < 0 ? 'down' : (dr > 0 ? 'up' : (dc < 0 ? 'right' : 'left'));
          return;
        }
      }, want.at);
      await page.waitForTimeout(3200);          // camera leash
      const chips = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.fx().wantChips);
      await shot('10e-want-chip.png');
      console.log(`10e-want-chip.png: ${want.at.state}(${want.at.limit}) at ${want.at.col},${want.at.row}`
        + ` · ${chips} chip(s) on the glass`);
      if (!(chips > 0)) failures.push('10e-want-chip.png: the starved machine asked for nothing');
    } else {
      console.log('03-site-running.png: no machine is starved or unpowered — no want chip to photograph');
    }
  }

  // ---------------------------------------------------------------- PQ-130.10b law §7 the port ships
  // "The port stacks visible crates as output accumulates." The pile is keyed to
  // `projection.exportBuffer` — the stock the port has staged for the next pod — so photograph what
  // the twelve minutes above actually produced. SITE_BALANCE.exportDefaultOff holds every
  // build-chain intermediate, so only raw extractor output can reach the buffer on its own; if the
  // run left it empty, stage a shipment explicitly rather than photograph an empty floor and call
  // the crates shipped. Which of the two happened is printed, so the still is never oversold.
  {
    const before = await page.evaluate(() => {
      const proj = window.SF.ctx.asteroidSites.projection('site_1');
      const hook = document.querySelector('.ast-canvas').__ast3d;
      return { buffer: { ...(proj ? proj.exportBuffer : {}) }, crates: hook.crates(), net: hook.networks() };
    });
    console.log(`11c-port-crates.png: export buffer after 12 min ${JSON.stringify(before.buffer)}`
      + ` -> crate stage ${before.crates.stage}`);
    let staged = false;
    if (!before.crates.stage) {
      staged = true;
      await page.evaluate(() => {
        const site = window.SF.ctx.asteroidSites.getSite('site_1');
        site.exportBuffer.cmdty_silicate = 14;   // one pod-load (12u) plus change: a full pile
      });
      console.log('11c-port-crates.png: the run shipped nothing exportable — staging 14u so the pile is photographable');
    }
    // Park the rig beside the port so the pile is on glass under the camera leash.
    const parked = await page.evaluate(() => {
      const sf = window.SF;
      const d = sf.state.drill;
      const site = sf.ctx.asteroidSites.getSite('site_1');
      const port = site.machines.find((m) => m.defId === 'sm_cargo_port');
      if (!port) return null;
      for (const [dc, dr] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const c = port.col + dc, r = port.row + dr;
        const t = d.field[c] && d.field[c][r];
        if (!t || t.type !== 'empty') continue;
        if (site.machines.some((m) => m.col === c && m.row === r)) continue;
        d.avatar.col = c; d.avatar.row = r;
        d.avatar.fromCol = c; d.avatar.fromRow = r;
        d.avatar.moveDuration = 0; d.avatar.moveElapsed = 0;
        d.avatar.faceDir = 'down';
        return { port: [port.col, port.row], rig: [c, r] };
      }
      return { port: [port.col, port.row], rig: null };
    });
    await page.waitForTimeout(3400);            // camera leash eases at <= 6 cells/s
    const crates = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.crates());
    await shot('11c-port-crates.png');
    console.log(`11c-port-crates.png: port ${parked && parked.port} · rig ${parked && parked.rig}`
      + ` · stage ${crates.stage}${staged ? ' (staged)' : ' (earned)'} · visible ${crates.visible}`
      + ` · standing on ${crates.onFloor ? `cell ${crates.cell}` : "the port's own plinth"}`);
    if (!crates.visible) failures.push('11c-port-crates.png: the port shows no crates at all');
  }

  // The same instrument over a MACHINE: status lamp + one cause line + the 3x3 contact ring
  // inside the card (law §6.4), instead of a swatch and consequence chips. The camera leash eases
  // at <= 6 cells/s and the deep frame parked the rover ~30 rows away, so give it time to arrive
  // or the extractor is still off-glass when the pointer goes looking for it.
  await page.waitForTimeout(4000);
  await hoverStill({ col: 13, row: 2 }, '08b-lens-machine.png'); // the extractor: uses geology, so the ring draws

  // ---------------------------------------------------------------- PQ-130.09 the earned palette
  // The row only exists because this rock now owns a Core. Photograph it doing its job: build mode
  // live, one key armed in gold, the ghost seated on a real cell, and a hover tip carrying the
  // name that is deliberately absent from the glass the rest of the time (law §2.5).
  // The build cursor follows the pointer in build mode, so park it by pointing at a real cell
  // rather than counting arrow presses from an assumed origin — a stray mousemove over the board
  // (say, on the way to a palette key) would silently re-seat an arrow-walked cursor.
  const aimCell = async (col, row) => {
    const at = await page.evaluate(({ c, r }) => {
      const hook = document.querySelector('.ast-canvas')?.__ast3d;
      const q = hook && hook.projectCell(c, r);
      if (!q) return null;
      const xs = q.map((k) => k.x); const ys = q.map((k) => k.y);
      return {
        x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
        y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
      };
    }, { c: col, r: row });
    if (!at) return false;
    await page.mouse.move(at.x - 6, at.y - 6);
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(250);
    return true;
  };

  await page.keyboard.press('KeyB');            // drive -> build
  await page.keyboard.press('Digit1');          // first earned key (the Core's key is gone: unique)
  if (!await aimCell(14, 3)) failures.push('09-palette.png: cell 14,3 is off glass');
  await page.waitForTimeout(300);
  const keyBox = await page.evaluate(() => {
    const keys = [...document.querySelectorAll('.ast-screen .aw-palette .aw-build-key')];
    const armed = keys.find((k) => k.dataset.keyState === 'armed') || keys[0];
    if (!armed) return null;
    const r = armed.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      id: armed.dataset.itemId, count: keys.length,
      states: keys.map((k) => `${k.dataset.itemId}:${k.dataset.keyState}`) };
  });
  if (!keyBox) failures.push('09-palette.png: the build palette never mounted after the Core');
  else {
    // Reach the key from CHROME, never across the board: any mousemove landing on the canvas
    // re-seats the build cursor, and the ghost would quietly leave the cell this still is about.
    await page.mouse.move(Math.round(VIEWPORT.width / 2), 8);
    await page.mouse.move(keyBox.x, keyBox.y);   // hover the armed key: its name tip opens
    await page.waitForTimeout(350);
    await shot('09-palette.png');
    console.log(`09-palette.png: ${keyBox.count} keys [${keyBox.states.join(', ')}]`);
    // The refusal channel for this leaf (law §6.7 "placement never fails silently"): step the
    // cursor onto an installed machine and photograph the lens ghost card saying so.
    if (!await aimCell(13, 3)) failures.push('09b-ghost-blocked.png: cell 13,3 is off glass');
    await page.waitForTimeout(400);
    const blocked = await page.evaluate(() => {
      const el = document.querySelector('.aw-lens');
      if (!el || el.hidden) return null;
      return {
        name: el.querySelector('.aw-lens-name')?.textContent || '',
        chips: [...el.querySelectorAll('.aw-lens-chip')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
        body: el.querySelector('.aw-lens-body')?.textContent || '',
      };
    });
    await shot('09b-ghost-blocked.png');
    if (!blocked) failures.push('09b-ghost-blocked.png: the ghost card never appeared on the blocked cell');
    else console.log(`09b-ghost-blocked.png: "${blocked.name}" chips [${blocked.chips.join(', ')}] body "${blocked.body}"`);

    // ---------------------------------------------------------------- PQ-130.10b law §6.5/§6.7
    // The board's own answer to "where may this go, and why not here". With a ghost live the Faces
    // lens is AUTO-ON: every legal seat glows mint, the blocked cells near the cursor carry one
    // why-glyph plate each (a symbol, never a word), and the gridlines have strengthened ~15%.
    {
      const faces = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.faces());
      await shot('11b-faces-lens.png');
      console.log(`11b-faces-lens.png: ${faces.seats} mint seats · ${faces.whyGlyphs} why-glyphs`
        + ` [${[...new Set(faces.reasons)].join(', ')}] · gridlines +${(faces.gridStrength * 100).toFixed(0)}%`);
      if (!(faces.seats > 0)) failures.push('11b-faces-lens.png: no valid machine seat glowed mint');
      if (!(faces.gridStrength > 0.1)) {
        failures.push(`11b-faces-lens.png: build mode did not strengthen the gridlines (${faces.gridStrength})`);
      }
    }

    // The WHY-GLYPH, photographed. `occupied` and `rover-here` are suppressed by design — the board
    // already answers those with a visible machine or a visible rig — so the extractor above draws
    // no plates at all. The gas tap does: it refuses every seat that is not against a sealed pocket,
    // which is precisely the invisible cause a plate exists to carry. Arm it and look.
    {
      await page.keyboard.press('Digit2');
      await page.waitForTimeout(700);
      const why = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.faces());
      await shot('11d-why-glyphs.png');
      console.log(`11d-why-glyphs.png: gas tap armed — ${why.seats} seats, ${why.whyGlyphs} plates`
        + ` [${[...new Set(why.reasons)].join(', ')}]`);
      if (!(why.whyGlyphs > 0)) {
        failures.push('11d-why-glyphs.png: a machine that can be seated almost nowhere drew no why-glyph');
      }
      await page.keyboard.press('Digit1');
      await page.waitForTimeout(300);
    }

    // The third key state (law §6.3 "unaffordable": flat --aw-surface, ink-3 glyph, hover shows the
    // short amount in coral) never appears in a capture stocked with a full haul — so empty one
    // input the fabricator needs, photograph the key, and put it straight back. Without this the
    // state is asserted headlessly and has never been LOOKED at.
    const poorGoods = await page.evaluate(() => {
      const items = window.SF.state.player.cargo.items;
      const held = Math.floor(Number(items.cmdty_electronics) || 0);
      items.cmdty_electronics = 0;
      return held;
    });
    await page.waitForTimeout(400);                 // the palette re-prices on the HUD cadence
    const poorKey = await page.evaluate(() => {
      const k = document.querySelector('.ast-screen .aw-palette [data-item-id="sm_fabricator"]');
      if (!k) return null;
      const r = k.getBoundingClientRect();
      return {
        state: k.dataset.keyState,
        cost: k.querySelector('.aw-build-tip-cost')?.textContent || '',
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      };
    });
    if (!poorKey || poorKey.state !== 'unaffordable') {
      failures.push(`09c-palette-unaffordable.png: the fabricator key did not go unaffordable (${poorKey ? poorKey.state : 'no key'})`);
    } else {
      await page.mouse.move(Math.round(VIEWPORT.width / 2), 8);
      await page.mouse.move(poorKey.x, poorKey.y);  // hover reveals the coral shortfall
      await page.waitForTimeout(350);
      await shot('09c-palette-unaffordable.png');
      console.log(`09c-palette-unaffordable.png: fabricator ${poorKey.state} — cost chip "${poorKey.cost}"`);
    }
    await page.evaluate((held) => {
      window.SF.state.player.cargo.items.cmdty_electronics = held;
    }, poorGoods);
    await page.mouse.move(Math.round(VIEWPORT.width / 2), 8);
    await page.waitForTimeout(300);
  }
  await page.keyboard.press('Escape');           // build -> drive
  await page.waitForTimeout(400);

  // ---------------------------------------------------------------- PQ-130.07 "the sim speaks"
  // Law §5 is a table of TIMED expressions — a 250ms arc, a 180ms kick, a 400ms vignette, a 300ms
  // skate. Every one of them has expired long before the 3.2s the framing stills wait, so each
  // frame below is shot ~110-140ms after its own trigger: late enough that the expression has
  // drawn, early enough that it is still on the glass. A still taken later photographs an empty
  // board and proves nothing.
  const seatRover = async (want) => page.evaluate((w) => {
    const sf = window.SF;
    const st = sf.state;
    const d = st.drill;
    const COLS = d.field.length;
    const ROWS = d.field[0].length;
    const inb = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
    const N4 = [[0, 1], [1, 0], [-1, 0], [0, -1]];
    const tierOf = (t) => (t && t.tierReq) || 1;
    const playerTier = (() => {
      const beam = st.player.miningBeam;
      if (!beam) return 1;
      if (beam.tierId === 'beam_industrial') return 4;
      if (beam.tierId === 'beam_mk3') return 3;
      if (beam.tierId === 'beam_mk2') return 2;
      return 1;
    })();
    // find a target cell of the wanted kind with a hollow-able neighbour to park the rig in
    let best = null;
    for (let c = 0; c < COLS; c++) {
      for (let r = 4; r < ROWS; r++) {
        const t = d.field[c][r];
        if (!t) continue;
        if (w.kind === 'gas' && t.type !== 'gas') continue;
        if (w.kind === 'vein' && (t.type !== 'vein' || !t.ore || tierOf(t) > playerTier)) continue;
        if (w.kind === 'locked' && (t.type !== 'vein' || !t.ore || tierOf(t) <= playerTier)) continue;
        for (const [dc, dr] of N4) {
          // dr === 1 parks the rig BELOW the target, which aims the boom UP — and drill.js refuses
          // an upward bore outright (it returns before the tier gate), so a locked face above the
          // rig can never produce the refusal this still is meant to photograph.
          if (dr === 1) continue;
          const nc = c + dc, nr = r + dr;
          if (!inb(nc, nr) || nr < 3) continue;
          const nt = d.field[nc][nr];
          if (!nt || nt.type === 'gas') continue;         // never park in a pocket
          const score = (nt.type === 'empty' ? 8 : 0) + (ROWS - r);
          if (!best || score > best.score) best = { score, tc: c, tr: r, rc: nc, rr: nr, ore: t.ore || null };
        }
      }
    }
    if (!best) return { ok: false, reason: `no ${w.kind} cell with a rover socket` };
    // carve the socket through the real break path so the renderer sees the same hole the sim has
    const ent = st.entities.get(d.asteroidId);
    if (d.field[best.rc][best.rr].type !== 'empty') {
      const was = d.field[best.rc][best.rr].type;
      d.field[best.rc][best.rr] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 };
      if (ent && ent.data) {
        if (!Array.isArray(ent.data.drillCleared)) ent.data.drillCleared = [];
        const idx = best.rr * COLS + best.rc;
        if (!ent.data.drillCleared.includes(idx)) ent.data.drillCleared.push(idx);
      }
      sf.bus.emit('drill:break', { col: best.rc, row: best.rr, type: was, ore: null, wasVein: false, wasGas: false });
    }
    d.avatar.col = best.rc; d.avatar.row = best.rr;
    d.avatar.fromCol = best.rc; d.avatar.fromRow = best.rr;
    d.avatar.moveDuration = 0; d.avatar.moveElapsed = 0;
    d.moveCooldown = 0;          // drill.js throttles its warn on this; a warm rig would say nothing
    d.drillTemp = 0;
    d.overheated = false;
    d.energyDepleted = false;
    d.avatar.faceDir = best.tr > best.rr ? 'down' : (best.tr < best.rr ? 'up'
      : (best.tc > best.rc ? 'right' : 'left'));
    return { ok: true, ...best, dir: d.avatar.faceDir };
  }, want);

  const fxOf = () => page.evaluate(() => {
    const hook = document.querySelector('.ast-canvas').__ast3d;
    return hook ? { fx: hook.fx(), ev: hook.events(), kickPx: hook.kickPx(), vig: hook.vignette() } : null;
  });

  // --- 10-yield.png: 3-5 lit chunks mid-arc between the cell and the hopper, gold floater rising.
  {
    const seat = await seatRover({ kind: 'vein' });
    if (!seat.ok) failures.push(`10-yield.png: ${seat.reason}`);
    else {
      await page.waitForTimeout(2400);            // camera leash settles on the new berth
      await page.evaluate((s) => {
        window.SF.bus.emit('drill:yield', { commodityId: s.ore, qty: 4, pos: { col: s.tc, row: s.tr } });
      }, seat);
      await page.waitForTimeout(140);             // ~55% through the 250ms arc
      const st = await fxOf();                   // READ FIRST: encoding the png costs ~1s, and
      await shot('10-yield.png');                // every §5 expression is shorter than that
      console.log(`10-yield.png: aim ${seat.tc},${seat.tr} ${seat.ore} · chunks in flight ${st.fx.oreChunks}`
        + ` · floaters ${st.fx.floaters} · yields ${st.ev.yields}`);
      if (!st.fx.oreChunks) failures.push('10-yield.png: nothing was in flight to the hopper');
      if (!st.fx.floaters) failures.push('10-yield.png: no gold floater rose off the cell');
      await page.waitForTimeout(900);             // let the payout land before the next frame
    }
  }

  // --- 10b-gas-breach.png: the eruption — cell flash, vapor in the tunnel, coral edge vignette,
  //     and a live camera kick. The break is emitted with the payload the SCREEN actually forwards
  //     ({col,row} only), so this frame also proves the renderer derives "this was gas" itself.
  {
    const seat = await seatRover({ kind: 'gas' });
    if (!seat.ok) failures.push(`10b-gas-breach.png: ${seat.reason}`);
    else {
      await page.waitForTimeout(2400);
      await page.evaluate((s) => {
        const sf = window.SF;
        const d = sf.state.drill;
        const COLS = d.field.length;
        const ent = sf.state.entities.get(d.asteroidId);
        d.field[s.tc][s.tr] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 };
        if (ent && ent.data) {
          if (!Array.isArray(ent.data.drillCleared)) ent.data.drillCleared = [];
          const idx = s.tr * COLS + s.tc;
          if (!ent.data.drillCleared.includes(idx)) ent.data.drillCleared.push(idx);
        }
        sf.bus.emit('drill:break', { col: s.tc, row: s.tr });   // exactly what asteroidScreen sends
      }, seat);
      await page.waitForTimeout(120);             // inside the 150ms flash and the 180ms kick
      const st = await fxOf();
      await shot('10b-gas-breach.png');
      console.log(`10b-gas-breach.png: pocket ${seat.tc},${seat.tr} · vapor ${st.fx.vapor}`
        + ` · kick ${st.kickPx.toFixed(2)}px · vignette ${st.vig.alpha.toFixed(2)} (full=${st.vig.full})`
        + ` · scars ${st.fx.roverScars}/${st.fx.ventedScars} · breaches ${st.ev.gasBreaches}`);
      if (!st.ev.gasBreaches) failures.push('10b-gas-breach.png: the breach was never expressed');
      if (!(st.kickPx > 0)) failures.push('10b-gas-breach.png: law §11.8 wants a nonzero camera kick');
      if (!(st.vig.alpha > 0)) failures.push('10b-gas-breach.png: no coral edge vignette');
      if (st.vig.full) failures.push('10b-gas-breach.png: the vignette covers the whole glass (law §9: never a modal)');
      if (!st.fx.vapor) failures.push('10b-gas-breach.png: no vapor flooded the tunnel');
      await page.waitForTimeout(1500);
    }
  }

  // --- 10c-refusal.png: the MK gate. Driven through the REAL keyboard against a real locked vein,
  //     so what the frame proves is that drill.js's tier branch reaches the board at all.
  {
    const seat = await seatRover({ kind: 'locked' });
    if (!seat.ok) console.log(`10c-refusal.png: skipped — ${seat.reason}`);
    else {
      await page.waitForTimeout(2400);
      const KEY = { down: 'ArrowDown', up: 'KeyI', left: 'ArrowLeft', right: 'ArrowRight' }[seat.dir];
      await page.keyboard.down(KEY);
      await page.waitForTimeout(170);             // inside the 300ms skate, past the stamp's onset
      const st = await fxOf();
      const rig = await page.evaluate(() => {
        const d = window.SF.state.drill;
        return {
          blocked: !!d.avatar.drillBlocked, target: d.avatar.drillTarget,
          overheated: !!d.overheated, energyDepleted: !!d.energyDepleted,
          heat: Math.round(d.drillTemp || 0), energy: Math.round(d.energy || 0),
          tier: window.SF.ctx.registry.get('drill').getDrillTier(),
        };
      });
      await page.keyboard.up(KEY);      // release BEFORE the ~1s png encode, or the rig is still
      await shot('10c-refusal.png');    // leaning on a locked face for a second of wall clock
      console.log(`10c-refusal.png rig: ${JSON.stringify(rig)}`);
      console.log(`10c-refusal.png: locked ${seat.tc},${seat.tr} ${seat.ore} from ${seat.dir}`
        + ` · refusals ${st.ev.refusals} (suppressed ${st.ev.refusalsSuppressed})`
        + ` · sparks left ${st.fx.skateLeft} · stamp ${st.fx.mkStamp.toFixed(2)}`);
      if (!st.ev.refusals) failures.push('10c-refusal.png: the locked face never refused on the board');
      if (!(st.fx.mkStamp > 0)) failures.push('10c-refusal.png: the MK stamp never faded in');
      // …and the 5s repeat rule (law §5). drill.js throttles its own warn for 1.2s, so the
      // second attempt has to clear THAT before it can test the renderer's rule — press again at
      // 1.5s, still well inside the 5s window, and require a real suppression rather than silence.
      await page.waitForTimeout(1500);
      await page.evaluate(() => { window.SF.state.drill.moveCooldown = 0; });
      await page.keyboard.down(KEY);
      await page.waitForTimeout(260);
      const again = await fxOf();
      const rig2 = await page.evaluate(() => {
        const d = window.SF.state.drill;
        return { blocked: !!d.avatar.drillBlocked, cd: Number((d.moveCooldown || 0).toFixed(2)) };
      });
      await page.keyboard.up(KEY);
      console.log(`10c-refusal.png retry rig: ${JSON.stringify(rig2)}`);
      if (again.ev.refusals > st.ev.refusals) {
        failures.push('10c-refusal.png: an identical refusal within 5s replayed its full effect (law §5)');
      } else if (again.ev.refusalsSuppressed <= st.ev.refusalsSuppressed) {
        failures.push('10c-refusal.png: the repeat rule was never exercised — the second attempt never reached it');
      } else {
        console.log(`10c-refusal.png: repeat rule holds — ${again.ev.refusalsSuppressed} suppressed`);
      }
    }
  }

  // Site register (law §4 two-register camera): whole-body silhouette against space.
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(600);
  await shot('05-site-register.png');

  // ---------------------------------------------------------------- PQ-130.10b law §7 + §6.5
  // THE ONE-SECOND TEST. Same whole-body register, Network lens up: cables bright, lanes carrying
  // their stock as flow dots, disconnected islands dimmed, machine lamps mint or dark. A stranger
  // should be able to answer "what's running, what's starved, what's flowing, what shipped" off
  // this frame without hovering anything. `V` is pressed for real — the canvas owns the listener,
  // so a still taken by calling setLens() would prove the drawing and not the key.
  {
    const before = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.lens().active);
    await page.keyboard.press('KeyV');          // none -> Faces
    await page.waitForTimeout(160);
    await page.keyboard.press('KeyV');          // Faces -> Network
    await page.waitForTimeout(700);
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.ast-canvas');
      const h = canvas && canvas.__ast3d;
      if (!h || typeof h.networks !== 'function') return false;
      const phase = h.networks().mountPhase;
      return phase === 'authored' || phase === 'fallback';
    }, null, { timeout: 20000 }).catch(() => {});
    const st = await page.evaluate(() => {
      const h = document.querySelector('.ast-canvas').__ast3d;
      const proj = window.SF.ctx.asteroidSites.projection('site_1');
      return {
        lens: h.lens(),
        net: h.networks(),
        crates: h.crates(),
        states: proj ? proj.machines.map((m) => `${m.defId}:${(m.status && m.status.state) || '?'}`) : [],
      };
    });
    await shot('11-site-network.png');
    console.log(`11-site-network.png: lens ${before || 'none'} -> ${st.lens.active} · register ${st.net.register}`
      + ` · ${st.net.runs.length} runs (${st.net.islands} dark) · ${st.net.flowDots} flow dots`
      + ` · ${st.net.authoredCount || 0} authored conduit pieces`
      + ` · crate stage ${st.crates.stage} · armour ${st.net.casings} meshes,`
      + ` lane ${st.net.laneWidthPx}px / cable ${st.net.cableWidthPx}px across`
      + ` · machines [${st.states.join(', ')}]`);
    // The PLAN lens, on the same producing site: mono numerals for what each working machine earns
    // and one port income chip. Chips are meshes, so they cost nothing against the §11.3 word budget
    // — but they have to actually land, and only a site that is producing can prove it.
    {
      const planOff = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.lens());
      await page.keyboard.press('KeyV');        // Network -> Plan
      await page.waitForTimeout(600);
      const planOn = await page.evaluate(() => {
        const h = document.querySelector('.ast-canvas').__ast3d;
        const proj = window.SF.ctx.asteroidSites.projection('site_1');
        return { lens: h.lens(), income: proj ? proj.exportRatePerMin : 0 };
      });
      console.log(`11-site-network.png: Plan lens chips ${planOff.chips} -> ${planOn.lens.chips}`
        + ` · port income ${planOn.income}/min · seam α ${planOff.seamAlpha} -> ${planOn.lens.seamAlpha}`);
      if (planOn.lens.active !== 'plan') failures.push('11-site-network.png: the third V did not reach the Plan lens');
      else if (!(planOn.lens.chips > planOff.chips)) {
        failures.push(`11-site-network.png: the Plan lens added no numerals to a producing site (${planOff.chips} -> ${planOn.lens.chips})`);
      }
      await page.keyboard.press('KeyV');        // Plan -> none
      await page.waitForTimeout(200);
    }
    if (st.lens.active !== 'network') failures.push(`11-site-network.png: V did not reach the Network lens (${st.lens.active})`);
    if (st.net.register !== 'site') failures.push('11-site-network.png: the camera is not at the site register');
    if (!st.net.runs.length) failures.push('11-site-network.png: the site drew no network runs at all');
    if (!(st.net.authoredCount > 0) || st.net.proceduralFallback) {
      failures.push('11-site-network.png: accepted authored Conduit pieces did not replace the procedural fallback');
    } else {
      const families = new Set((st.net.authoredPieces || []).map((part) => part.family));
      if (!families.has('power') || !families.has('lane')) {
        failures.push(`11-site-network.png: authored Conduit family coverage is incomplete (${[...families].join(', ')})`);
      }
    }
    if (!(st.net.casings > 0)) failures.push('11-site-network.png: the runs shed their armour at site zoom — flat lines on the rock');
    if (!(st.net.laneWidthPx >= 6)) {
      failures.push(`11-site-network.png: the lane is ${st.net.laneWidthPx}px across at the site register — a hairline, not a conveyor`);
    }
    await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.setLens(null));
    await page.waitForTimeout(200);
  }
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
  // PQ-130.07 law §5 "Courier launch": from INSIDE the rock the pod has to be seen leaving —
  // sliding up the entry shaft and clearing the surface. The sim never tells the renderer (the
  // screen keeps `site:courierLaunched` for its ledger), so the renderer watches fleet.launches;
  // this frame is the proof that watch fires and that the pod is on the glass while it does.
  // RECORDED GAP, not a defect of this leaf: the works screen pauses the world sim (base.js sets
  // timeScale 0; asteroidSites.projection's own doc-comment says so), so site production — and with
  // it `_tryLaunch` — cannot advance while the player is inside the rock. A courier therefore never
  // departs on its own during a works session in this build, and the launch above only resolves
  // after the retract below. What the renderer OWNS is the watch on `fleet.launches` and the climb
  // it drives, so that is what this frame stages and proves.
  {
    // The pod climbs the ENTRY SHAFT and the camera is leashed to the rover, so park the rig back
    // at the top of its own shaft first — otherwise the departure happens ten columns off-glass.
    await page.evaluate(() => {
      const d = window.SF.state.drill;
      const col = Math.floor(d.field.length / 2);
      let row = 0;
      for (let r = 0; r < d.field[col].length; r++) {
        if (d.field[col][r] && d.field[col][r].type === 'empty') { row = r; break; }
      }
      d.avatar.col = col; d.avatar.row = row;
      d.avatar.fromCol = col; d.avatar.fromRow = row;
      d.avatar.moveDuration = 0; d.avatar.moveElapsed = 0;
      d.avatar.faceDir = 'down';
    });
    await page.waitForTimeout(3200);              // the camera leash eases at <= 6 cells/s
    await page.evaluate(() => {
      const site = window.SF.ctx.asteroidSites.getSite('site_1');
      site.fleet.launches = (Number(site.fleet.launches) || 0) + 1;   // the exact signal the renderer watches
    });
    const flew = await page.waitForFunction(() => {
      const c = document.querySelector('.ast-canvas');
      const h = c && c.__ast3d;
      return h && h.fx().podFlight >= 0 ? { t: h.fx().podFlight } : false;
    }, null, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
    if (!flew) failures.push('10d-courier.png: no pod climbed the shaft after a launch');
    else {
      // photograph it CLEARING the crust, which is the half of the climb the law names
      await page.waitForFunction(() => {
        const h = document.querySelector('.ast-canvas').__ast3d;
        return h.fx().podFlight < 0 || h.fx().podFlight > 0.87;
      }, null, { timeout: 4000 }).catch(() => {});
      const st = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.fx());
      await shot('10d-courier.png');
      console.log(`10d-courier.png: pod climb ${(st.podFlight * 100).toFixed(0)}% of the shaft`);
      if (!(st.podFlight > 0)) failures.push('10d-courier.png: the pod was parked by the time it was photographed');
    }
  }

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
