#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);

const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, executablePath: browserPath, args: ['--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console-err]', m.text().slice(0, 300)); });
try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 45_000 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const s = window.SF.state; const p = s.entities.get(s.playerId);
    return p?.presentationAdmission === 'ready';
  }, null, { timeout: 180_000 });

  // Same flow as the capture: enter ceres, find gallery cells, park at centroid, zoom, settle.
  const info = await page.evaluate(async () => {
    const SF = window.SF; const state = SF.state;
    const world = SF.registry.get('world');
    if (state.world.currentSectorId !== 'sector_ceres_belt') world.enterSector('sector_ceres_belt');
    const cells = (state.entityList || []).filter((e) => e?.data?.opticStructureId === 'optic_ceres_prism_gallery');
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const c of cells) { minX = Math.min(minX, c.pos.x); maxX = Math.max(maxX, c.pos.x); minZ = Math.min(minZ, c.pos.z); maxZ = Math.max(maxZ, c.pos.z); }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const moved = world.relocatePlayerInSector({ x: cx, z: cz }, { reason: 'debug' });
    const player = state.entities.get(state.playerId);
    return new Promise((resolve) => setTimeout(() => {
      const cam = state.render && state.render.camera;
      const proj = cells.slice(0, 6).map((e) => {
        const c = new SF.THREE.Vector3(e.pos.x, 0, e.pos.z).project(cam);
        return { id: e.id, kind: e.data.opticMaterial, ndc: [c.x.toFixed(2), c.y.toFixed(2), c.z.toFixed(3)] };
      });
      resolve({
        moved, sector: state.world?.currentSectorId,
        playerPos: { x: player.pos.x, z: player.pos.z },
        camPos: cam && cam.position ? { x: cam.position.x, y: cam.position.y, z: cam.position.z } : null,
        camCtrlPos: state.render?.cameraCtrl?.obj?.position
          ? { x: state.render.cameraCtrl.obj.position.x, y: state.render.cameraCtrl.obj.position.y, z: state.render.cameraCtrl.obj.position.z } : null,
        bounds: { minX, maxX, minZ, maxZ, cx, cz },
        cellCount: cells.length, proj,
      });
    }, 3000));
  });
  console.log(JSON.stringify(info, null, 2));
} finally {
  await browser.close();
  await server.close();
}
