#!/usr/bin/env node
// PQ-140.02 — four specialist silhouettes at the shipping chase camera, HUD text hidden.
// Unique entity ids (never recycle a live mesh). One authored hull at a time, parked beside the
// player so the chase cam shows Hitch plus a second outline: blade, lance, heavy bastion, light bastion.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { HUD_TEXT_OFF_CSS, sweepHudText } from './lib/bench/frameStripCapture.mjs';
import { SPECIALIST_PLANS } from '../src/ai/specialistPlans.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, 'design/program/roadmap/receipts');
const WIDTH = 1280;
const HEIGHT = 720;
const SHIPPING_ZOOM = 144;

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
  headless: false,
  executablePath: browserPath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', `--window-size=${WIDTH},${HEIGHT}`, '--force-device-scale-factor=1'],
});
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();

const shots = [];
try {
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 45_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'PQ-140.02 silhouettes', seed: 14002 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && !!player && player.presentationAdmission === 'ready';
  }, null, { timeout: 120_000 });
  await page.evaluate(() => {
    for (const selector of ['.tutorial-overlay', '[data-screen="tutorial"]']) {
      const root = document.querySelector(selector);
      const button = root && [...root.querySelectorAll('button')]
        .find((node) => /skip|dismiss|close|got it/i.test(node.textContent || ''));
      if (button) button.click();
    }
  });
  await page.addStyleTag({ content: HUD_TEXT_OFF_CSS });
  await sweepHudText(page);
  await page.evaluate((zoom) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    player.vel.x = 0;
    player.vel.z = 0;
    player.rot = 0;
    const cam = state.render && state.render.cameraCtrl;
    if (cam && typeof cam.setZoom === 'function') cam.setZoom(zoom);
    if (cam && typeof cam.snapToPlayer === 'function') cam.snapToPlayer();
    for (const entity of state.entityList || []) {
      if (!entity || entity.alive === false || entity.id === state.playerId) continue;
      if (entity.type !== 'asteroid' && entity.type !== 'ship') continue;
      const dx = entity.pos.x - player.pos.x;
      const dz = entity.pos.z - player.pos.z;
      if (dx * dx + dz * dz < 90 * 90) {
        entity.pos.x = player.pos.x + 4000 + (entity.id % 17) * 80;
        entity.pos.z = player.pos.z + 4000;
        entity.vel.x = 0;
        entity.vel.z = 0;
      }
    }
  }, SHIPPING_ZOOM);

  await page.evaluate(() => { window.__pq140Ids = []; });

  for (const plan of SPECIALIST_PLANS) {
    const spawned = await page.evaluate(async (payload) => {
      const { enemyId, zoom } = payload;
      const SF = window.SF;
      const state = SF.state;
      const player = state.entities.get(state.playerId);
      const ids = window.__pq140Ids || (window.__pq140Ids = []);
      const { makeEnemySpawnSpec } = await import('/src/systems/combat.js');
      const spec = makeEnemySpawnSpec(enemyId, 6, { x: player.pos.x + 48, z: player.pos.z + 12 });
      spec.vel = { x: 0, z: 0 };
      spec.collides = false;
      spec.data = spec.data || {};
      spec.data.ai = false;
      const hull = SF.helpers.spawnEntity(spec);
      if (!hull) return { id: null };
      hull.collides = false;
      hull.vel.x = 0;
      hull.vel.z = 0;
      hull.rot = 0;
      hull.data = hull.data || {};
      hull.data.ai = false;
      player.vel.x = 0;
      player.vel.z = 0;
      player.rot = 0;
      const keep = new Set([state.playerId, hull.id]);
      const remove = SF.helpers.removeEntity;
      for (const id of ids) {
        if (id !== hull.id && typeof remove === 'function') remove(id, { immediate: true });
      }
      ids.length = 0;
      ids.push(hull.id);
      for (const entity of [...(state.entityList || [])]) {
        if (!entity || keep.has(entity.id) || entity.alive === false) continue;
        if (entity.type !== 'ship' && entity.type !== 'payload' && entity.type !== 'wreck') continue;
        if (typeof remove === 'function') remove(entity.id, { immediate: true });
      }
      const cam = state.render && state.render.cameraCtrl;
      if (cam && typeof cam.setZoom === 'function') cam.setZoom(zoom);
      if (cam && typeof cam.snapToPlayer === 'function') cam.snapToPlayer();
      return {
        id: hull.id,
        radius: hull.radius,
        mass: hull.mass,
        defId: hull.data && hull.data.defId,
      };
    }, { enemyId: plan.enemyId, zoom: SHIPPING_ZOOM });
    assert.ok(spawned.id, `${plan.id} spawned`);

    await page.waitForFunction((probe) => {
      const hull = window.SF?.state?.entities?.get(probe.id);
      if (!hull || hull.alive === false) return false;
      if ((hull.data && (hull.data.lootTableId || hull.data.enemyTypeId)) !== probe.enemyId) return false;
      const mesh = hull.mesh
        || (window.SF.state.render && window.SF.state.render.meshes && window.SF.state.render.meshes.get(probe.id));
      if (!mesh) return false;
      const authored = String(mesh.userData && mesh.userData.authoredAssetState || '');
      if (hull.presentationAdmission !== 'ready') return false;
      if (!authored.startsWith('authored')) return false;
      const THREE = window.SF.THREE;
      if (!THREE) return false;
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      return Math.max(size.x, size.y, size.z) > Math.max(8, (hull.radius || 10) * 0.6);
    }, { id: spawned.id, enemyId: plan.enemyId }, { timeout: 90_000 });

    await page.evaluate((payload) => {
      const { id, zoom } = payload;
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const hull = state.entities.get(id);
      const dx = hull.radius >= 28 ? 72 : hull.radius >= 20 ? 56 : 48;
      const dz = hull.radius >= 28 ? 18 : 12;
      hull.pos.x = player.pos.x + dx;
      hull.pos.z = player.pos.z + dz;
      hull.vel.x = 0;
      hull.vel.z = 0;
      hull.rot = 0;
      player.vel.x = 0;
      player.vel.z = 0;
      player.rot = 0;
      const cam = state.render && state.render.cameraCtrl;
      if (cam && typeof cam.setZoom === 'function') cam.setZoom(zoom);
      if (cam && typeof cam.snapToPlayer === 'function') cam.snapToPlayer();
    }, { id: spawned.id, zoom: SHIPPING_ZOOM });
    await page.waitForTimeout(500);
    const framed = await page.evaluate((payload) => {
      const { id, zoom } = payload;
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const hull = state.entities.get(id);
      const playerMesh = player.mesh
        || (state.render && state.render.meshes && state.render.meshes.get(state.playerId));
      const mesh = hull.mesh
        || (state.render && state.render.meshes && state.render.meshes.get(id));
      const cam = state.render && state.render.cameraCtrl;
      if (cam && typeof cam.setZoom === 'function') cam.setZoom(zoom);
      if (cam && typeof cam.snapToPlayer === 'function') cam.snapToPlayer();
      if (cam && typeof cam.follow === 'function') cam.follow(0);
      const nearby = [];
      for (const entity of state.entityList || []) {
        if (!entity || entity.alive === false || !entity.pos) continue;
        const ddx = entity.pos.x - player.pos.x;
        const ddz = entity.pos.z - player.pos.z;
        if (ddx * ddx + ddz * ddz > 220 * 220) continue;
        nearby.push({
          id: entity.id,
          type: entity.type,
          defId: entity.data && entity.data.defId,
          loot: entity.data && entity.data.lootTableId,
          dx: Math.round(ddx),
          dz: Math.round(ddz),
          radius: entity.radius,
        });
      }
      return {
        authored: mesh && mesh.userData && mesh.userData.authoredAssetState,
        admission: hull.presentationAdmission,
        radius: hull.radius,
        mass: hull.mass,
        defId: hull.data && hull.data.defId,
        dx: Math.round(hull.pos.x - player.pos.x),
        dz: Math.round(hull.pos.z - player.pos.z),
        meshDx: playerMesh && mesh ? Math.round(mesh.position.x - playerMesh.position.x) : null,
        meshDz: playerMesh && mesh ? Math.round(mesh.position.z - playerMesh.position.z) : null,
        nearby,
      };
    }, { id: spawned.id, zoom: SHIPPING_ZOOM });
    console.log(`frame ${plan.id}`, JSON.stringify(framed));
    assert.ok(String(framed.authored || '').startsWith('authored'),
      `${plan.id} must be the authored hull (${JSON.stringify(framed)})`);
    assert.ok(Math.abs(framed.dx) > 20,
      `${plan.id} must sit beside the player (${JSON.stringify(framed)})`);

    await page.waitForTimeout(400);
    await page.evaluate((payload) => {
      const { id, zoom } = payload;
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const hull = state.entities.get(id);
      if (!player || !hull) return;
      hull.pos.x = player.pos.x + (framedDx(hull));
      hull.pos.z = player.pos.z + (hull.radius >= 28 ? 18 : 12);
      hull.vel.x = 0;
      hull.vel.z = 0;
      player.vel.x = 0;
      player.vel.z = 0;
      const cam = state.render && state.render.cameraCtrl;
      if (cam && typeof cam.setZoom === 'function') cam.setZoom(zoom);
      if (cam && typeof cam.snapToPlayer === 'function') cam.snapToPlayer();
      function framedDx(h) {
        return h.radius >= 28 ? 72 : h.radius >= 20 ? 56 : 48;
      }
    }, { id: spawned.id, zoom: SHIPPING_ZOOM });
    await page.waitForTimeout(300);
    const file = path.join(OUT, `PQ-140-02-${plan.id}.png`);
    await page.screenshot({ path: file, type: 'png' });
    shots.push({
      id: plan.id,
      enemyId: plan.enemyId,
      silhouette: plan.silhouette,
      playerPlan: plan.playerPlan,
      file: path.basename(file),
      spawnedId: spawned.id,
      radius: spawned.radius,
      mass: spawned.mass,
      defId: spawned.defId,
      frame: framed,
    });
    console.log(`shot ${plan.id} id=${spawned.id} mass=${spawned.mass} → ${file}`);
  }

  const ledger = {
    schema: 'spaceface.pq14002Silhouettes.v1',
    seed: 14002,
    camera: 'shipping_chase',
    hudText: 'off',
    shots,
  };
  await writeFile(path.join(OUT, 'PQ-140-02-silhouettes.json'), `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, shots: shots.map((row) => row.file) }, null, 2));
} finally {
  try { await context.close(); } catch (_) {}
  try { await browser.close(); } catch (_) {}
  if (server.owned) {
    try { await server.close(); } catch (_) {}
  }
}
process.exit(0);
