#!/usr/bin/env node
// scratch-optic-gallery-capture.mjs — optic-materials visual evidence.
//
// Boots the REAL default route (production renderer, shipping chase camera) in headless
// Chrome, parks the ship at the Ceres Prism Gallery — the authored three-kind lattice at
// sector_ceres_belt (1680,-2100) — and photographs it. This is the stranger test: a
// viewer must be able to name matte-rock / mirror / prism cells without reading code.
//
// Three frames:
//   gallery_full.png    — the whole lattice, zoomed out (all three live kinds)
//   gallery_close.png   — the wick mouth: diamond fuse + stone lining + metal jaws
//   gallery_spent.png   — same close frame after one diamond's data flips to 'spent'
//                         (the same fields recordOpticSpend writes — the presentation
//                         seam is exactly what ships)
//
//   node scripts/scratch-optic-gallery-capture.mjs
//
// Output: .devshots/optic-materials/*.png + manifest.json

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'optic-materials');
const SEED = 4242;
const GALLERY_ID = 'optic_ceres_prism_gallery';
const SECTOR_ID = 'sector_ceres_belt';
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();

const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
assert.ok(browserPath, 'Chrome or Edge is required');

await mkdir(OUT, { recursive: true });
const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('console', (msg) => {
  if (msg.type() === 'error') pageErrors.push(`console: ${msg.text()}`);
});

const manifest = { seed: SEED, shots: [], pageErrors };

// Screen-space census of the lattice at shot time: project every optic cell through the
// live chase camera so the PNG patch-sampler can name what each kind looks like on glass.
async function cellScreenReport(tag) {
  const cells = await page.evaluate(({ galleryId }) => {
    const SF = window.SF;
    const state = SF.state;
    const cam = state.render && state.render.camera;
    const canvas = document.querySelector('canvas');
    if (!cam || !canvas || !SF.THREE) return null;
    // Three.js space is frame-local (floating origin): local = global − world.frameOrigin.
    const fo = (state.world && state.world.frameOrigin) || { x: 0, z: 0 };
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    const out = [];
    for (const e of state.entityList || []) {
      if (!e || e.alive === false || !e.data || e.data.opticStructureId !== galleryId) continue;
      const lx = e.pos.x - fo.x, lz = e.pos.z - fo.z;
      const c = new SF.THREE.Vector3(lx, 0, lz).project(cam);
      const edge = new SF.THREE.Vector3(lx + (e.radius || 10), 0, lz).project(cam);
      out.push({
        id: e.id,
        kind: e.data.opticMaterial,
        tint: e.data.tint,
        x: (c.x * 0.5 + 0.5) * w,
        y: (1 - (c.y * 0.5 + 0.5)) * h,
        screenR: Math.max(2, Math.abs((edge.x - c.x) * 0.5) * w),
        onScreen: c.z < 1 && c.x > -1.1 && c.x < 1.1 && c.y > -1.1 && c.y < 1.1,
      });
    }
    const p = state.entities.get(state.playerId);
    return {
      width: w, height: h, cells: out,
      debug: {
        playerPos: p && { x: p.pos.x, z: p.pos.z },
        camPos: cam.position ? { x: +cam.position.x.toFixed(1), y: +cam.position.y.toFixed(1), z: +cam.position.z.toFixed(1) } : null,
        frameOrigin: fo,
        focus: state.render?.cameraCtrl?.focus
          ? { x: +state.render.cameraCtrl.focus.x.toFixed(1), z: +state.render.cameraCtrl.focus.z.toFixed(1) } : null,
        simTime: +state.simTime.toFixed(2),
      },
    };
  }, { galleryId: GALLERY_ID });
  if (cells) {
    await writeFile(path.join(OUT, `${tag}.cells.json`), JSON.stringify(cells, null, 1));
    if (cells.debug) console.log(`[debug:${tag}]`, JSON.stringify(cells.debug));
    const on = cells.cells.filter((c) => c.onScreen);
    console.log(`[cells:${tag}] ${on.length}/${cells.cells.length} in frame`,
      on.map((c) => `${c.kind}@${Math.round(c.x)},${Math.round(c.y)}`).join(' '));
  }
  return cells;
}

async function shot(name, tag) {
  const png = await page.screenshot({ type: 'png' });
  await writeFile(path.join(OUT, name), png);
  manifest.shots.push({ name, sha256: sha256(png), bytes: png.length });
  console.log(`[shot] ${name} (${png.length} bytes)`);
  await cellScreenReport(tag || name.replace(/\.png$/, ''));
}

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 45_000 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.fill('#sf-ng-seed', String(SEED));
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return player?.presentationAdmission === 'ready';
  }, null, { timeout: 180_000 });

  // World only — HUD stays shipping-real but is simply not photographed.
  await page.addStyleTag({
    content: `
      #hud, .hud, [class*="hud"], [id*="hud"],
      .sf-leftstack, .sf-toast, .sf-pill, .sf-chip, .sf-panel,
      .contacts, .command-bar, .mission-log { visibility: hidden !important; }
    `,
  });
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    for (const el of Array.from(document.body.children)) {
      if (!el.contains(canvas)) el.style.visibility = 'hidden';
    }
  });

  const census = await page.evaluate(({ galleryId, sectorId }) => {
    const SF = window.SF;
    const state = SF.state;
    const world = SF.registry.get('world');
    if (state.world.currentSectorId !== sectorId) world.enterSector(sectorId);
    const cells = (state.entityList || []).filter((e) => e && e.alive !== false
      && e.data && e.data.opticMaterial
      && e.data.opticStructureId === galleryId);
    const byKind = {};
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const c of cells) {
      const k = c.data.opticMaterial;
      (byKind[k] = byKind[k] || []).push(c.id);
      minX = Math.min(minX, c.pos.x); maxX = Math.max(maxX, c.pos.x);
      minZ = Math.min(minZ, c.pos.z); maxZ = Math.max(maxZ, c.pos.z);
    }
    return {
      count: cells.length,
      kinds: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length])),
      bounds: { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 },
    };
  }, { galleryId: GALLERY_ID, sectorId: SECTOR_ID });
  console.log('[census]', JSON.stringify(census));
  manifest.census = census;
  assert.ok(census.count >= 10, `expected a populated gallery, got ${census.count} cells`);
  assert.ok(census.kinds.stone && census.kinds.metal && census.kinds.diamond,
    'the gallery must show all three live kinds');

  // Aim via the game's own photo-mode free camera — explicit frame-local focus, immune to
  // the chase composition's attacker/safe-rect bias that can hold focus ~800 WU off the
  // ship. The ship still relocates so zone/world ownership reads true at the lattice.
  const park = async ({ x, z, zoom }) => page.evaluate(({ x, z, zoom }) => {
    const SF = window.SF;
    const state = SF.state;
    const world = SF.registry.get('world');
    world.relocatePlayerInSector({ x, z }, { reason: 'capture:optic_materials' });
    const player = state.entities.get(state.playerId);
    player.vel.x = 0; player.vel.z = 0;
    const fo = (state.world && state.world.frameOrigin) || { x: 0, z: 0 };
    state.render.photoMode = {
      active: true, hideHud: true, freeCamera: true, filters: false,
      focusX: x - fo.x, focusZ: z - fo.z, zoom,
      inputX: 0, inputZ: 0, zoomInput: 0, panSpeed: 0,
      exposure: 1,
    };
  }, { x, z, zoom });

  const settle = async (simSeconds) => {
    const t0 = await page.evaluate(() => window.SF.state.simTime);
    await page.waitForFunction((t) => window.SF.state.simTime >= t, t0 + simSeconds, { timeout: 300_000 });
  };

  // enterSector's gate-arrival flow can re-park the player a beat after census — let the
  // transition finish first, then re-park if the ship drifted off the aim point.
  await settle(4);
  const parkChecked = async ({ x, z, zoom }) => {
    for (let i = 0; i < 3; i++) {
      await park({ x, z, zoom });
      await settle(1.2);
      const drift = await page.evaluate(({ x, z }) => {
        const p = window.SF.state.entities.get(window.SF.state.playerId);
        return Math.hypot(p.pos.x - x, p.pos.z - z);
      }, { x, z });
      if (drift < 40) return;
      console.log(`[park] player drifted ${Math.round(drift)} WU off aim — re-parking`);
    }
  };

  // Full lattice — bounds centroid, max manual zoom (CAMERA_ZOOM_MAX clamps at 330 WU).
  await parkChecked({ x: census.bounds.cx, z: census.bounds.cz, zoom: 330 });
  await settle(4);
  await shot('gallery_full.png');

  // The wick mouth — metal jaw cells sit at ix=-2 (the lattice's west end) beside the
  // diamond fuse and its stone lining. Aim just inside the west edge so both mirrors
  // land mid-frame — the naming test needs all three kinds on one frame.
  const mouthX = census.bounds.minX + 90;
  await parkChecked({ x: mouthX, z: census.bounds.cz, zoom: 210 });
  await settle(3);
  await shot('gallery_close.png');

  // Spend the in-frame field diamond nearest the mouth the way recordOpticSpend leaves the
  // entity — the presentation seam picks it up on the next presentation pass.
  const spentId = await page.evaluate(({ galleryId }) => {
    const state = window.SF.state;
    const cam = state.render && state.render.camera;
    const fo = (state.world && state.world.frameOrigin) || { x: 0, z: 0 };
    let best = null;
    for (const e of state.entityList || []) {
      if (!e || e.data?.opticStructureId !== galleryId || e.data.opticMaterial !== 'diamond') continue;
      const c = new window.SF.THREE.Vector3(e.pos.x - fo.x, 0, e.pos.z - fo.z).project(cam);
      if (c.z < 1 && Math.abs(c.x) < 0.8 && Math.abs(c.y) < 0.8) { best = e; break; }
    }
    if (best) {
      best.data.opticMaterial = 'spent';
      best.data.tint = 0x3a4a58;
    }
    return best ? best.id : null;
  }, { galleryId: GALLERY_ID });
  manifest.spentCell = spentId;
  console.log(`[spent] flipped ${spentId}`);
  await settle(1.5);
  await shot('gallery_spent.png');
} finally {
  if (pageErrors.length) console.log('[pageErrors]', pageErrors.slice(0, 8));
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
  await server.close();
}
