#!/usr/bin/env node
// Canonical root -> New Game -> Launch evidence for Plan 32 pickup-family redundancy.
// The observer spawns ordinary physical pickup entities, asks the shipped renderer to admit their
// normal meshes, and captures both the default-camera world read and the live accessibility radar.

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
const OUT = path.join(ROOT, '.devshots', 'plan32-pickup-families');
const SOURCE_FILES = [
  'src/data/pickupPresentation.js',
  'src/render/visualFactory.js',
  'src/render/vfx.js',
  'src/ui/radar.js',
  'test/pickup-family-presentation.test.mjs',
  'test/arcade-core-kill-economy.test.mjs',
  'scripts/capture-pickup-families.mjs',
];
const FAMILY_CASES = Object.freeze([
  Object.freeze({ id: 'credits', data: { kind: 'credit_chip', credits: 80 } }),
  Object.freeze({ id: 'ore', data: { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 3 } }),
  Object.freeze({ id: 'refined', data: { kind: 'cargo', commodityId: 'cmdty_alloys', amount: 2 } }),
  Object.freeze({ id: 'component', data: { kind: 'cargo', commodityId: 'cmdty_comp_circuitry', amount: 1 } }),
  Object.freeze({ id: 'munitions', data: { kind: 'cargo', commodityId: 'cmdty_munitions', amount: 2 } }),
  Object.freeze({ id: 'module', data: { kind: 'module', commodityId: 'mod_shield_booster_s', amount: 1 } }),
  Object.freeze({ id: 'rare', data: { kind: 'cargo', commodityId: 'cmdty_ore_goldium', amount: 1, rarePickup: true } }),
  Object.freeze({ id: 'cargo', data: { kind: 'cargo', commodityId: 'cmdty_food', amount: 4 } }),
]);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();
const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);

assert.ok(browserPath, 'Chrome or Edge is required');
await mkdir(OUT, { recursive: true });
const sourceDiff = execFileSync('git', ['diff', '--', ...SOURCE_FILES], { cwd: ROOT });
const sourceCandidateSha256 = sha256(sourceDiff);
const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

async function launchCanonicalPage() {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 45_000 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return player?.alive !== false && player?.mesh?.visible !== false;
  }, null, { timeout: 120_000 });
  return { page, pageErrors };
}

async function stagePickupFamilies(page, layout, accessibilityMode = 'none', requireMeshes = true) {
  await page.evaluate(async ({ cases, positions, mode, needsMeshes }) => {
    const { pickupPresentationFor } = await import('/src/data/pickupPresentation.js');
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const witness = {
      defaultCameraZoom: state.camera.zoom,
      accessibilityMode: mode,
      requireMeshes: needsMeshes,
      pickupIds: [],
      expectedProfiles: cases.map((entry) => entry.id),
    };
    window.__SF_PICKUP_CAPTURE__ = witness;
    state.settings.accessibility.colorblindMode = mode;
    state.settings.accessibility.motionReduce = true;
    state.settings.accessibility.flashReduce = true;
    window.SF.bus.emit('settings:changed', { section: 'accessibility' });
    for (let index = 0; index < cases.length; index++) {
      const entry = cases[index];
      const offset = positions[index];
      const pickup = window.SF.helpers.spawnEntity({
        type: 'pickup',
        pos: { x: player.pos.x + offset.x, z: player.pos.z + offset.z },
        vel: { x: 0, z: 0 },
        radius: 2.2,
        collides: false,
        data: {
          ...entry.data,
          pickupEmbargoUntil: state.simTime + 3600,
          despawnAt: state.simTime + 3600,
          plan32PresentationWitness: true,
        },
      });
      const profile = pickupPresentationFor(pickup.data);
      if (profile.id !== entry.id) {
        throw new Error(`staged ${entry.id} classified as ${profile.id}`);
      }
      witness.pickupIds.push(pickup.id);
    }
    // Normal play drains this queue gradually. The evidence observer drains the same production
    // queue only so all post-launch entities reach their ordinary mesh owner before the still.
    const renderOwner = window.SF.registry.get('render');
    renderOwner?.reconcileMeshes?.();
    renderOwner?._drainMeshBuildQueue?.(Infinity);
  }, { cases: FAMILY_CASES, positions: layout, mode: accessibilityMode, needsMeshes: requireMeshes });
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const witness = window.__SF_PICKUP_CAPTURE__;
    return witness?.pickupIds?.length === 8 && witness.pickupIds.every((id) => {
      const entity = state.entities.get(id);
      if (entity?.alive === false) return false;
      if (!witness.requireMeshes) return true;
      const mesh = entity?.mesh || state.render?.meshes?.get?.(id);
      return mesh?.visible !== false && !!mesh?.userData?.pickupPresentationId;
    });
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(450);
}

async function collectReceipt(page, scenarioId) {
  return page.evaluate(async (id) => {
    const { pickupPresentationFor, pickupRadarColorFor } = await import('/src/data/pickupPresentation.js');
    const state = window.SF.state;
    const witness = window.__SF_PICKUP_CAPTURE__;
    const player = state.entities.get(state.playerId);
    const pickups = witness.pickupIds.map((pickupId) => {
      const entity = state.entities.get(pickupId);
      const mesh = entity?.mesh || state.render?.meshes?.get?.(pickupId);
      const profile = pickupPresentationFor(entity?.data);
      let meshCount = 0;
      let spriteCount = 0;
      let pointCount = 0;
      let transparentMaterialCount = 0;
      const meshNames = [];
      mesh?.traverse?.((object) => {
        if (object.isMesh) { meshCount++; meshNames.push(object.name || '(unnamed)'); }
        if (object.isSprite) spriteCount++;
        if (object.isPoints) pointCount++;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material?.transparent === true) transparentMaterialCount++;
        }
      });
      return {
        id: pickupId,
        alive: entity?.alive !== false,
        distanceFromPlayer: entity?.pos && player?.pos
          ? Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z)
          : null,
        profileId: mesh?.userData?.pickupPresentationId || profile.id,
        visualLanguage: mesh?.userData?.visualLanguage || profile.worldShape,
        pickupColor: mesh?.userData?.pickupColor || profile.worldColor,
        radarShape: profile.radarShape,
        radarColor: pickupRadarColorFor(entity?.data, state.settings.accessibility.colorblindMode),
        meshCount,
        spriteCount,
        pointCount,
        transparentMaterialCount,
        meshNames,
      };
    });
    const radar = document.querySelector('.sf-radar canvas');
    return {
      scenarioId: id,
      routeMode: state.mode,
      cameraZoom: state.camera.zoom,
      defaultCameraZoom: witness.defaultCameraZoom,
      accessibilityMode: state.settings.accessibility.colorblindMode,
      radar: radar ? {
        cssWidth: radar.getBoundingClientRect().width,
        cssHeight: radar.getBoundingClientRect().height,
        backingWidth: radar.width,
        backingHeight: radar.height,
      } : null,
      pickups,
    };
  }, scenarioId);
}

async function captureScenario({
  id, file, layout, accessibilityMode = 'none', radarCrop = false, worldCrop = false, requireMeshes = true,
}) {
  const { page, pageErrors } = await launchCanonicalPage();
  try {
    await stagePickupFamilies(page, layout, accessibilityMode, requireMeshes);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const receipt = await collectReceipt(page, id);
    const fullPath = path.join(OUT, file);
    const fullPng = await page.screenshot({ path: fullPath, type: 'png', fullPage: false });
    const result = {
      scenario: id,
      path: path.relative(ROOT, fullPath).replaceAll('\\', '/'),
      sha256: sha256(fullPng),
      receipt,
      pageErrors,
    };
    if (worldCrop) {
      const cropPath = path.join(OUT, '04-pickup-families-world-inspection.png');
      const cropPng = await page.screenshot({
        path: cropPath,
        type: 'png',
        clip: { x: 260, y: 255, width: 340, height: 390 },
      });
      result.inspectionCrop = {
        path: path.relative(ROOT, cropPath).replaceAll('\\', '/'),
        sha256: sha256(cropPng),
        pairedWithFullFrame: result.path,
      };
    }
    if (radarCrop) {
      const radar = page.locator('.sf-radar canvas');
      await radar.waitFor({ state: 'visible', timeout: 15_000 });
      const cropPath = path.join(OUT, '03-pickup-family-radar-deuteranopia-inspection.png');
      const cropPng = await radar.screenshot({ path: cropPath, type: 'png' });
      result.inspectionCrop = {
        path: path.relative(ROOT, cropPath).replaceAll('\\', '/'),
        sha256: sha256(cropPng),
        pairedWithFullFrame: result.path,
      };
    }
    return result;
  } finally {
    await page.close().catch(() => {});
  }
}

const worldLayout = [
  { x: 30, z: -22 }, { x: 45, z: -22 }, { x: 30, z: -7 }, { x: 45, z: -7 },
  { x: 30, z: 7 }, { x: 45, z: 7 }, { x: 30, z: 22 }, { x: 45, z: 22 },
];
const radarLayout = [
  { x: 1050, z: 0 }, { x: 1050, z: 1050 }, { x: 0, z: 1550 }, { x: -1450, z: 1450 },
  { x: -2300, z: 0 }, { x: -1850, z: -1850 }, { x: 0, z: -3150 }, { x: 2700, z: -2700 },
];

try {
  const captures = [];
  captures.push(await captureScenario({
    id: 'default_camera_world_families',
    file: '01-pickup-families-default-camera.png',
    layout: worldLayout,
    worldCrop: true,
  }));
  captures.push(await captureScenario({
    id: 'deuteranopia_radar_families',
    file: '02-pickup-family-radar-deuteranopia-full-frame.png',
    layout: radarLayout,
    accessibilityMode: 'deuteranopia',
    radarCrop: true,
    requireMeshes: false,
  }));

  const ok = captures.every((capture) => capture.pageErrors.length === 0
    && capture.receipt.routeMode === 'flight'
    && capture.receipt.cameraZoom === capture.receipt.defaultCameraZoom
    && capture.receipt.pickups.length === FAMILY_CASES.length
    && new Set(capture.receipt.pickups.map((pickup) => pickup.profileId)).size === FAMILY_CASES.length
    && new Set(capture.receipt.pickups.map((pickup) => pickup.visualLanguage)).size === FAMILY_CASES.length
    && new Set(capture.receipt.pickups.map((pickup) => pickup.pickupColor)).size === FAMILY_CASES.length
    && new Set(capture.receipt.pickups.map((pickup) => pickup.radarShape)).size === FAMILY_CASES.length
    && new Set(capture.receipt.pickups.map((pickup) => pickup.radarColor)).size === FAMILY_CASES.length
    && capture.receipt.pickups.every((pickup) => pickup.alive
      && (capture.scenario !== 'default_camera_world_families' || (pickup.meshCount > 0
        && pickup.spriteCount === 0 && pickup.pointCount === 0
        && pickup.transparentMaterialCount === 0))));
  const report = {
    schema: 'spaceface.plan32PickupFamilyCapture.v1',
    route: 'public root -> New Game -> Launch -> ordinary physical pickup entities and live radar owner',
    cameraPolicy: 'shipped fresh-run default camera; no zoom or camera override',
    inspectionPolicy: 'radar crop is paired with its canonical full frame and is not standalone evidence',
    acceptanceScope: 'integration-candidate pickup-family components only; no whole-scene or A-list claim',
    sourceCandidateSha256,
    sourceFiles: SOURCE_FILES,
    families: FAMILY_CASES.map((entry) => entry.id),
    captures,
    ok,
  };
  await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'pickup-family captures must preserve the canonical route and hard-geometry identities');
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
