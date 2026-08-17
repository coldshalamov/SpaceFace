#!/usr/bin/env node
// Plan 44 public-route evidence for exact salvage/cache hardware recognition. The production Ships
// owner grants and fits each item on one Bastion; the untouched chase camera records the retained
// hull-attached hard geometry after each real appearance rebuild.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'plan44-ship-hardware');
const REPORT = path.join(OUT, 'report.json');
const SOURCE_FILES = Object.freeze([
  'scripts/capture-ship-hardware.mjs',
  'src/data/weapons.js',
  'src/data/modules.js',
  'src/render/shipHardwarePresentation.js',
  'src/render/livingHullPresentation.js',
  'src/ui/shipPreviewMount.js',
  'test/ship-hardware-presentation.test.mjs',
]);
const CASES = Object.freeze([
  { id: 'unique_ironsong_ac', slotIndex: 0, file: '01-ironsong-autocannon-default-camera.png' },
  { id: 'unique_veil_cutter', slotIndex: 0, file: '02-veil-cutter-default-camera.png' },
  { id: 'unique_nestbreaker_rack', slotIndex: 0, file: '03-nestbreaker-rack-default-camera.png' },
  { id: 'unique_lighthouse_heavy_beam', slotIndex: 0, file: '04-lighthouse-beam-default-camera.png' },
  { id: 'mod_overcharge_coil_forbidden', slotIndex: 8, file: '05-overcharge-coil-default-camera.png' },
  { id: 'mod_mass_faker_forbidden', slotIndex: 8, file: '06-mass-faker-default-camera.png' },
  { id: 'mod_deadman_reactor_forbidden', slotIndex: 8, file: '07-deadman-reactor-default-camera.png' },
]);
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

assert.ok(executablePath, 'Chrome or Edge is required for Plan 44 capture');
await mkdir(OUT, { recursive: true });
const sourceCandidateSha256 = sha256(execFileSync('git', ['diff', '--', ...SOURCE_FILES], { cwd: ROOT }));
const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const issues = collectPageIssues(page);

try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* ignored */ }
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry),
    null, { timeout: 45_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Recognized Hardware Route', seed: 440047 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.alive !== false && player?.mesh
      && !!sf?.state?.render?.cameraCtrl;
  }, null, { timeout: 90_000 });

  const setup = await page.evaluate(() => {
    const sf = window.SF;
    const ships = sf.registry.get('ships');
    if (!ships?.buyShip({ defId: 'ship_bastion', setActive: true, grant: true })) {
      throw new Error('production Ships owner could not grant the common review hull');
    }
    const player = sf.state.entities.get(sf.state.playerId);
    return {
      defId: player?.data?.defId,
      cameraZoom: sf.state.camera.zoom,
      playerId: sf.state.playerId,
    };
  });
  assert.equal(setup.defId, 'ship_bastion');
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    return player?.data?.defId === 'ship_bastion'
      && ['authored', 'authored-with-cleanup-error', 'procedural-settled', 'designed-procedural-settled']
        .includes(player?.mesh?.userData?.authoredAssetState);
  }, null, { timeout: 90_000 });
  await page.waitForTimeout(900);

  const captures = [];
  let priorSlotIndex = null;
  for (const captureCase of CASES) {
    const fitReceipt = await page.evaluate(({ id, slotIndex, previousSlotIndex }) => {
      const sf = window.SF;
      const ships = sf.registry.get('ships');
      const owned = sf.state.player.ownedShips[sf.state.player.activeShipIndex];
      if (Number.isSafeInteger(previousSlotIndex) && owned.fittings[previousSlotIndex]) {
        if (!ships.unfitModule({ slotIndex: previousSlotIndex })) throw new Error('prior fitting did not release');
      }
      if (!ships.grantModule({ defId: id, reason: 'plan44_visual_review' })) throw new Error(`grant failed ${id}`);
      const item = sf.state.player.moduleInventory[sf.state.player.moduleInventory.length - 1];
      if (!item || item.defId !== id) throw new Error(`inventory grant missing ${id}`);
      if (!ships.fitModule({ slotIndex, instanceId: item.instanceId })) throw new Error(`fit failed ${id}`);
      return {
        id,
        slotIndex,
        activeDefId: owned.defId,
        fittedId: owned.fittings[slotIndex],
        cameraZoom: sf.state.camera.zoom,
      };
    }, { ...captureCase, previousSlotIndex: priorSlotIndex });
    priorSlotIndex = captureCase.slotIndex;

    await page.waitForFunction((id) => {
      const sf = window.SF;
      const player = sf.state.entities.get(sf.state.playerId);
      let exactVisible = false;
      player?.mesh?.traverse?.((object) => {
        if (object.name !== `ShipHardware_${id}` || object.visible === false) return;
        let cursor = object.parent;
        while (cursor) {
          if (cursor.visible === false) return;
          cursor = cursor.parent;
        }
        exactVisible = ['authored', 'authored-with-cleanup-error', 'procedural-settled', 'designed-procedural-settled']
          .includes(player?.mesh?.userData?.authoredAssetState);
      });
      return exactVisible;
    }, captureCase.id, { timeout: 90_000 });
    await page.waitForTimeout(500);
    const receipt = await inspect(page, captureCase.id, setup.cameraZoom);
    const imagePath = path.join(OUT, captureCase.file);
    const png = await page.screenshot({ path: imagePath, type: 'png' });
    captures.push({
      ...captureCase,
      fitReceipt,
      receipt,
      path: path.relative(ROOT, imagePath).replaceAll('\\', '/'),
      sha256: sha256(png),
      width: 1600,
      height: 1000,
    });
  }

  const splitIssues = splitExpectedIssues(issues.issues || []);
  const report = {
    schema: 'spaceface.plan44.shipHardwareCapture.v1',
    route: 'root -> game:new -> Ships grant/switch Bastion -> Ships grant/fit exact recovered hardware -> retained authored-player presentation -> shipped chase camera',
    cameraPolicy: 'all seven frames retain the fresh-run chase camera and original zoom',
    sourceCandidateSha256,
    setup,
    captures,
    issues: { actionable: splitIssues.actionable, expectedFallbacks: splitIssues.expected },
    ok: splitIssues.actionable.length === 0
      && captures.length === CASES.length
      && captures.every((capture) => capture.fitReceipt.fittedId === capture.id
        && capture.receipt.activeIds.length === 1
        && capture.receipt.activeIds[0] === capture.id
        && capture.receipt.visibleMeshCount >= 4
        && capture.receipt.spriteCount === 0
        && capture.receipt.pointsCount === 0
        && capture.receipt.cameraZoom === setup.cameraZoom
        && capture.receipt.onScreen === true),
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'all seven fitted identities must render on the public player route');
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

async function inspect(page, expectedId, defaultCameraZoom) {
  return page.evaluate(({ id, defaultZoom }) => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    const camera = sf.state.render.cameraCtrl.obj;
    const activeIds = [];
    let visibleMeshCount = 0;
    let spriteCount = 0;
    let pointsCount = 0;
    let screen = null;
    player.mesh.updateWorldMatrix(true, true);
    player.mesh.traverse((object) => {
      if (object.name?.startsWith('ShipHardware_') && object.userData?.identityId && object.visible !== false) {
        activeIds.push(object.userData.identityId);
        const world = new object.position.constructor();
        object.getWorldPosition(world);
        world.project(camera);
        screen = { x: (world.x * 0.5 + 0.5) * innerWidth, y: (-world.y * 0.5 + 0.5) * innerHeight };
      }
      let lineageVisible = object.visible !== false;
      let cursor = object.parent;
      while (lineageVisible && cursor) {
        lineageVisible = cursor.visible !== false;
        cursor = cursor.parent;
      }
      if (!lineageVisible) return;
      if (object.isMesh && object.parent?.visible !== false && object.name?.startsWith(id)) visibleMeshCount += 1;
      if (object.isMesh && object.parent?.userData?.identityId === id) visibleMeshCount += 1;
      if (object.isSprite) spriteCount += 1;
      if (object.isPoints) pointsCount += 1;
    });
    return {
      expectedId: id,
      activeIds,
      visibleMeshCount,
      spriteCount,
      pointsCount,
      cameraZoom: sf.state.camera.zoom,
      defaultCameraZoom: defaultZoom,
      screen,
      onScreen: !!screen && screen.x >= 0 && screen.x <= innerWidth && screen.y >= 0 && screen.y <= innerHeight,
      authoredAssetState: player.mesh.userData.authoredAssetState || null,
    };
  }, { id: expectedId, defaultZoom: defaultCameraZoom });
}

function splitExpectedIssues(list) {
  const expected = [];
  const actionable = [];
  for (const issue of list) {
    const text = `${issue?.message || issue?.text || issue}`;
    if (/HTTP 404 .*__spaceface_player_store|\/api\/store\b.*404|Failed to load resource.*404/i.test(text)) expected.push(issue);
    else actionable.push(issue);
  }
  return { expected, actionable };
}
