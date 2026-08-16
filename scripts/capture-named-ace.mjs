#!/usr/bin/env node
// Plan 16 representative named-Ace capture. The public game route and shipped chase camera stay
// unchanged; this observer only places Jex's real named_hunter encounter inside the readable field.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'named-aces-plan16');
const FILE = path.join(OUT, 'jex-wake-salt-default-camera.png');
const REPORT = path.join(OUT, 'report.json');
const ACE_ID = 'ace_jex_wake_salt';
const sha256 = (value) => createHash('sha256').update(value).digest('hex').toUpperCase();
const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);

assert.ok(browserPath, 'Chrome or Edge is required');
await mkdir(OUT, { recursive: true });
const copyPaintDiff = execFileSync('git', ['diff', '--', 'src/data/namedAces.js'], { cwd: ROOT });
const copyPaintCandidateSha256 = sha256(copyPaintDiff);
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

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 45_000 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return player?.alive !== false && player?.mesh && player.mesh.visible !== false;
  }, null, { timeout: 120_000 });

  const staged = await page.evaluate((aceId) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const defaultCameraZoom = state.camera.zoom;
    const stagingX = player.pos.x + 1800;
    const stagingZ = player.pos.z + 1200;
    if (player.pos?.set) player.pos.set(stagingX, 0, stagingZ);
    else { player.pos.x = stagingX; player.pos.z = stagingZ; }
    if (player.vel?.set) player.vel.set(0, 0, 0);
    else { player.vel.x = 0; player.vel.z = 0; }
    player.prevPos?.copy?.(player.pos);
    state.render?.cameraCtrl?.snapToPlayer?.();

    const encounterId = 'capture:named-ace:jex';
    const request = window.SF.registry.get('encounterDirector').requestAuthoredEncounter({
      shapeId: 'named_hunter',
      encounterId,
      sectorId: state.world.currentSectorId,
      anchor: { x: player.pos.x + 120, z: player.pos.z },
      zoneRadius: 620,
      data: { aceId },
      force: true,
    });
    if (!request?.ok) throw new Error(`named_hunter rejected: ${JSON.stringify(request)}`);
    const live = state.encounterDirector.live[encounterId];
    const bossId = live.ids.find((id) => live.roles[id] === 'boss');
    const boss = state.entities.get(bossId);
    if (!boss) throw new Error('named_hunter did not create a boss');
    boss.pos.set(player.pos.x + 62, 0, player.pos.z + 10);
    boss.prevPos?.copy?.(boss.pos);
    boss.vel.set(0, 0, 0);
    boss.rot = Math.PI;
    let escortIndex = 0;
    for (const id of live.ids) {
      if (id === bossId) continue;
      const escort = state.entities.get(id);
      if (!escort) continue;
      escortIndex++;
      escort.pos.set(player.pos.x + 105 + escortIndex * 18, 0, player.pos.z + 45 + escortIndex * 14);
      escort.prevPos?.copy?.(escort.pos);
      escort.vel.set(0, 0, 0);
    }
    window.__SF_NAMED_ACE_CAPTURE__ = { encounterId, bossId, defaultCameraZoom };
    return window.__SF_NAMED_ACE_CAPTURE__;
  }, ACE_ID);

  await page.waitForFunction((bossId) => {
    const boss = window.SF.state.entities.get(bossId);
    return boss?.mesh && boss.mesh.visible !== false && !boss.mesh.userData?.visualBuildFailed;
  }, staged.bossId, { timeout: 45_000 });
  await page.waitForTimeout(750);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const png = await page.screenshot({ path: FILE, type: 'png', fullPage: false });
  const receipt = await page.evaluate((bossId) => {
    const sf = window.SF;
    const state = sf.state;
    const boss = state.entities.get(bossId);
    const camera = state.render?.cameraCtrl?.obj || state.render?.cameraCtrl?.camera || state.render?.camera;
    const world = new sf.THREE.Vector3();
    boss.mesh.getWorldPosition(world);
    const ndc = world.clone().project(camera);
    const colors = [];
    const materials = [];
    boss.mesh.traverse((object) => {
      if (!object.isMesh) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) {
        if (!material) continue;
        materials.push(material.name || material.type);
        if (material.color) colors.push(`#${material.color.getHexString()}`);
      }
    });
    return {
      routeMode: state.mode,
      cameraZoom: state.camera.zoom,
      defaultCameraZoom: window.__SF_NAMED_ACE_CAPTURE__.defaultCameraZoom,
      aceId: boss.data?.namedAceId || null,
      bossName: boss.data?.ai?.name || null,
      enemyTypeId: boss.data?.enemyTypeId || boss.data?.lootTableId || null,
      appearance: boss.data?.appearance || null,
      appearanceSignature: boss.mesh?.userData?.appearanceSignature || null,
      screenNdc: { x: ndc.x, y: ndc.y, z: ndc.z },
      materialNames: [...new Set(materials)],
      materialColors: [...new Set(colors)],
      visualBuildFailed: boss.mesh?.userData?.visualBuildFailed === true,
    };
  }, staged.bossId);

  const report = {
    schema: 'spaceface.namedAceCapture.v1',
    route: 'public root -> New Game -> Launch -> encounterDirector.named_hunter(ace_jex_wake_salt)',
    cameraPolicy: 'shipped fresh-run default camera; no capture zoom or camera override',
    copyPaintCandidateSha256,
    capture: {
      path: path.relative(ROOT, FILE).replaceAll('\\', '/'),
      sha256: sha256(png),
      receipt,
      pageErrors,
    },
    ok: pageErrors.length === 0
      && receipt.routeMode === 'flight'
      && receipt.cameraZoom === receipt.defaultCameraZoom
      && receipt.aceId === ACE_ID
      && receipt.bossName === 'Jex Wake-Salt'
      && receipt.appearance?.hullColor === '#182b31'
      && receipt.appearance?.accentColor === '#efe5c8'
      && Math.abs(receipt.screenNdc.x) < 0.9
      && Math.abs(receipt.screenNdc.y) < 0.9
      && receipt.visualBuildFailed === false,
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'the representative Ace must keep its paint and default-camera read');
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
