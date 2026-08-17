#!/usr/bin/env node
// Plan 45 Ram Plate component evidence. Boots the public route with the shipped chase camera, then
// presents the exact production collision receipt used by the already-physical focused route. The
// observer does not replace collision verification; it only captures the pooled bow-scar presenter.

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
const OUT = path.join(ROOT, '.devshots', 'plan45-ram-plate');
const FILE = path.join(OUT, '01-ram-plate-bow-scar-default-camera.png');
const REPORT = path.join(OUT, 'report.json');
const SOURCE_FILES = Object.freeze([
  'src/data/modules.js',
  'src/systems/ships.js',
  'src/systems/collisionConsequences.js',
  'src/combat/impulseKernel.js',
  'src/render/vfx.js',
  'src/render/ramPlateScar.js',
  'src/ui/presenters/engineeringPreview.js',
  'scripts/capture-ram-plate.mjs',
]);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);

assert.ok(executablePath, 'Chrome or Edge is required for Ram Plate capture');
await mkdir(OUT, { recursive: true });
const candidateDiff = execFileSync('git', ['diff', '--', ...SOURCE_FILES], { cwd: ROOT });
const sourceCandidateSha256 = sha256(candidateDiff);
const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const issues = [];
const expectedFallbacks = [];
page.on('pageerror', (error) => issues.push({ type: 'pageerror', text: error?.stack || String(error) }));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const location = message.location();
  const record = { type: 'console.error', text: message.text(), url: location?.url || null };
  if (record.url && new URL(record.url).pathname === '/__spaceface_player_store'
    && /404 \(Not Found\)/.test(record.text)) expectedFallbacks.push(record);
  else issues.push(record);
});

try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* ignored */ }
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry),
    null, { timeout: 45_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', {
    name: 'Plan45 Ram Plate',
    seed: 450045,
  }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.mesh && !!sf?.state?.render?.cameraCtrl;
  }, null, { timeout: 90_000 });
  await page.keyboard.press('Space').catch(() => {});
  await page.waitForTimeout(800);

  const staged = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    const camera = state.render?.cameraCtrl?.obj
      || state.render?.cameraCtrl?.camera
      || state.render?.camera;
    if (!player || !camera) throw new Error('public flight camera/player unavailable');
    const defaultCameraZoom = state.camera.zoom;
    const direction = new sf.THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    const pos = {
      x: player.pos.x + direction.x * 18,
      z: player.pos.z + direction.z * 18,
    };
    sf.bus.emit('combat:collisionConsequence', {
      targetId: 45002,
      otherId: state.playerId,
      surface: 'craft',
      control: 'stagger',
      deltaV: 22,
      impactDamage: 18,
      pos,
      normal: { x: -direction.x, z: -direction.z },
      provenance: {
        actorId: state.playerId,
        weaponId: 'mod_ram_plate',
        tag: 'ram_plate_impact',
      },
    });
    return { defaultCameraZoom, playerId: state.playerId, pos };
  });

  await page.waitForFunction(() => {
    const presenter = window.SF.registry.get('vfx')?._ramPlateScar;
    return presenter?.inspect?.().active === 1;
  }, null, { timeout: 10_000 });
  await page.waitForTimeout(160);
  const receipt = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const vfx = sf.registry.get('vfx');
    const scar = vfx?._ramPlateScar;
    const slot = scar?.group?.children?.find((child) => child.visible);
    const camera = state.render?.cameraCtrl?.obj
      || state.render?.cameraCtrl?.camera
      || state.render?.camera;
    const world = new sf.THREE.Vector3();
    slot?.getWorldPosition?.(world);
    const ndc = world.clone().project(camera);
    return {
      routeMode: state.mode,
      cameraZoom: state.camera.zoom,
      defaultCameraZoom: window.__unused || state.camera.zoom,
      inspection: scar?.inspect?.() || null,
      visibleChildren: slot?.children?.filter((child) => child.visible !== false).length || 0,
      screenNdc: { x: ndc.x, y: ndc.y, z: ndc.z },
      materials: (slot?.children || []).map((child) => ({
        type: child.material?.type || null,
        transparent: child.material?.transparent === true,
        depthWrite: child.material?.depthWrite === true,
      })),
    };
  });
  receipt.defaultCameraZoom = staged.defaultCameraZoom;
  const png = await page.screenshot({ path: FILE, type: 'png', fullPage: false });
  const ok = issues.length === 0
    && receipt.routeMode === 'flight'
    && receipt.cameraZoom === receipt.defaultCameraZoom
    && receipt.inspection?.active === 1
    && receipt.inspection?.lastSourceId === staged.playerId
    && receipt.inspection?.sprites === 0
    && receipt.inspection?.points === 0
    && receipt.inspection?.transparentMaterials === 0
    && receipt.visibleChildren === 6
    && receipt.materials.every((material) => material.type === 'MeshStandardMaterial'
      && material.transparent === false && material.depthWrite === true)
    && Math.abs(receipt.screenNdc.x) < 0.85
    && Math.abs(receipt.screenNdc.y) < 0.85;
  const report = {
    schema: 'spaceface.plan45.ramPlateCapture.v1',
    route: 'public root -> game:new -> Launch -> production VFX collision receipt',
    cameraPolicy: 'shipped fresh-run default chase camera; no capture zoom override',
    sourceCandidateSha256,
    capture: {
      path: path.relative(ROOT, FILE).replaceAll('\\', '/'),
      sha256: sha256(png),
      width: 1440,
      height: 900,
      receipt,
      issues,
      expectedFallbacks,
    },
    ok,
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Ram Plate scar must read at default camera as hard geometry');
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
