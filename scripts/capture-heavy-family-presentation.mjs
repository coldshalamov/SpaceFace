#!/usr/bin/env node
// Canonical root -> New Game -> Launch capture for the four Plan 14 heavy-family identities.
// Each action frame comes from the production enemy, AI, heavy-part, renderer and event routes;
// this observer only places the encounter within the shipped default camera's readable field.

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
const OUT = path.join(ROOT, '.devshots', 'heavy-family-plan14');
const SOURCE_FILES = [
  'src/render/heavyFamilyPresentation.js',
  'src/render/visualFactory.js',
  'src/render/visualOverrides.js',
  'src/render/vfx.js',
  'src/audio/audioSystem.js',
  'test/heavy-family-visual-contract.test.mjs',
  'scripts/capture-heavy-family-presentation.mjs',
];
const SCENARIOS = [
  { id: 'heavy_gunship', level: 5, file: '01-gunship-default-camera.png', event: null, phase: null, actionSettleMs: 0 },
  { id: 'heavy_ramscoop', level: 5, file: '02-ramscoop-ram-spool-default-camera.png', event: 'ai:doctrinePhase', phase: 'ram_spool', actionSettleMs: 260 },
  { id: 'heavy_carrier_lite', level: 7, file: '03-carrier-live-launch-default-camera.png', event: 'heavy:bayLaunch', phase: null, actionSettleMs: 75 },
  { id: 'heavy_foundry', level: 6, file: '04-foundry-live-ore-release-default-camera.png', event: 'heavy:chargedOreReleased', phase: null, actionSettleMs: 75 },
];
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
const captures = [];

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
    return player?.alive !== false && player?.mesh && player.mesh.visible !== false;
  }, null, { timeout: 120_000 });
  return { page, pageErrors };
}

async function spawnProductionHeavy(page, scenario) {
  return page.evaluate(async ({ id, level, event, phase }) => {
    const { makeEnemySpawnSpec } = await import('/src/systems/combat.js');
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const witness = {
      event: null,
      payload: null,
      observedAt: null,
      seen: [],
      defaultCameraZoom: state.camera.zoom,
    };
    window.__SF_HEAVY_CAPTURE_WITNESS__ = witness;
    if (event) {
      window.SF.bus.on(event, (payload) => {
        if (!payload) return;
        const sourceId = event === 'ai:doctrinePhase' ? payload.entityId : payload.parentId;
        const source = state.entities.get(sourceId);
        const sourceType = String(source?.data?.lootTableId || source?.data?.enemyTypeId || '');
        if (sourceType !== id) return;
        witness.seen.push({ event, phase: payload.phase || null, observedAt: state.simTime });
        if (event === 'ai:doctrinePhase') {
          if (payload.phase !== phase) return;
        }
        if (witness.event) return;
        witness.event = event;
        witness.payload = JSON.parse(JSON.stringify(payload));
        witness.observedAt = state.simTime;
      });
    }
    const stagingX = player.pos.x + 1600;
    const stagingZ = player.pos.z + 1200;
    if (player.pos?.set) player.pos.set(stagingX, 0, stagingZ);
    else { player.pos.x = stagingX; player.pos.z = stagingZ; }
    player.prevPos?.copy?.(player.pos);
    state.render?.cameraCtrl?.snapToPlayer?.();
    const offsetX = 95;
    const offsetZ = id === 'heavy_ramscoop' ? 8 : 16;
    const spec = makeEnemySpawnSpec(id, level, {
      x: player.pos.x + offsetX,
      z: player.pos.z + offsetZ,
    }, { engagementTrigger: 'plan14_canonical_visual_capture' });
    spec.data = {
      ...spec.data,
      encounter: true,
      combat: { ...(spec.data && spec.data.combat), targetId: player.id, lockTarget: player.id },
    };
    const enemy = window.SF.helpers.spawnEntity(spec);
    window.__SF_HEAVY_CAPTURE_ID__ = enemy.id;
    if (player.vel?.set) player.vel.set(0, 0, 0);
    else { player.vel.x = 0; player.vel.z = 0; }
    return { enemyId: enemy.id, defaultCameraZoom: witness.defaultCameraZoom };
  }, scenario);
}

async function collectReceipt(page, enemyId) {
  return page.evaluate((id) => {
    const state = window.SF.state;
    const enemy = state.entities.get(id);
    const parts = state.entityList.filter((entity) => entity?.type === 'heavyPart' && entity.data?.parentId === id);
    const objects = [enemy, ...parts].filter((entity) => entity?.mesh);
    const meshNames = [];
    const materialNames = [];
    let spriteCount = 0;
    let pointCount = 0;
    for (const entity of objects) {
      entity.mesh.traverse((object) => {
        if (object.isSprite) spriteCount++;
        if (object.isPoints) pointCount++;
        if (!object.isMesh) return;
        meshNames.push(object.name || '(unnamed)');
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material) materialNames.push(material.name || material.type);
      });
    }
    const launched = state.entityList.filter((entity) => entity?.data?.heavyLaunch?.carrierId === id);
    const chargedOre = state.entityList.filter((entity) => entity?.data?.kind === 'charged_ore_mine' && entity.ownerId === id);
    return {
      routeMode: state.mode,
      cameraZoom: state.camera.zoom,
      enemyId: id,
      enemyTypeId: enemy?.data?.lootTableId || null,
      heavyPresentationId: enemy?.mesh?.userData?.heavyPresentationId || null,
      enemySilhouette: enemy?.mesh?.userData?.enemySilhouette || null,
      genericShipOverlaysSuppressed: enemy?.mesh?.userData?.genericShipOverlaysSuppressed === true,
      partIds: parts.map((part) => part.data.partId),
      mountedPartCount: parts.filter((part) => part.data.heavyPartState === 'mounted').length,
      meshNames,
      materialNames: [...new Set(materialNames)],
      spriteCount,
      pointCount,
      launched: launched.map((entity) => ({ id: entity.id, lootTableId: entity.data?.lootTableId || null })),
      chargedOre: chargedOre.map((entity) => ({
        id: entity.id,
        kind: entity.data?.kind || null,
        worldIdentity: entity.mesh?.userData?.worldIdentity || null,
      })),
      witness: window.__SF_HEAVY_CAPTURE_WITNESS__,
    };
  }, enemyId);
}

try {
  for (const scenario of SCENARIOS) {
    const { page, pageErrors } = await launchCanonicalPage();
    try {
      const spawned = await spawnProductionHeavy(page, scenario);
      await page.waitForFunction((id) => {
        const state = window.SF.state;
        const enemy = state.entities.get(id);
        const parts = state.entityList.filter((entity) => entity?.type === 'heavyPart' && entity.data?.parentId === id);
        return enemy?.mesh?.visible !== false
          && enemy?.mesh?.userData?.heavyPresentationId
          && parts.length > 0
          && parts.every((part) => part.mesh && part.mesh.visible !== false && !part.mesh.userData?.visualBuildFailed);
      }, spawned.enemyId, { timeout: 30_000 });
      if (scenario.event) {
        try {
          await page.waitForFunction(() => !!window.__SF_HEAVY_CAPTURE_WITNESS__?.event, null, { timeout: 20_000 });
        } catch (error) {
          const diagnostic = await page.evaluate((id) => {
            const state = window.SF.state;
            const enemy = state.entities.get(id);
            return {
              witness: window.__SF_HEAVY_CAPTURE_WITNESS__,
              simTime: state.simTime,
              enemyAlive: enemy?.alive,
              enemyPos: enemy?.pos ? { x: enemy.pos.x, z: enemy.pos.z } : null,
              playerPos: state.entities.get(state.playerId)?.pos || null,
              ai: enemy?.data?.ai || null,
              heavyPartsRuntime: enemy?.data?.heavyPartsRuntime || null,
              tactical: window.SF.registry?.get?.('tacticalAI')?.inspect?.({ entityId: id }) || null,
            };
          }, spawned.enemyId);
          throw new Error(`${scenario.id} did not reach ${scenario.event}: ${JSON.stringify(diagnostic)}`, { cause: error });
        }
      } else {
        await page.waitForTimeout(250);
      }
      if (scenario.actionSettleMs > 0) await page.waitForTimeout(scenario.actionSettleMs);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      const file = path.join(OUT, scenario.file);
      const png = await page.screenshot({ path: file, type: 'png', fullPage: false });
      const receipt = await collectReceipt(page, spawned.enemyId);
      captures.push({
        scenario: scenario.id,
        action: scenario.event || 'mounted-heavy-parts-live',
        path: path.relative(ROOT, file).replaceAll('\\', '/'),
        sha256: sha256(png),
        receipt,
        pageErrors,
      });
    } finally {
      await page.close().catch(() => {});
    }
  }

  const report = {
    schema: 'spaceface.heavyFamilyPresentationCapture.v1',
    route: 'public root -> New Game -> Launch -> production makeEnemySpawnSpec -> live Tactical/HeavyParts events',
    cameraPolicy: 'shipped fresh-run default camera; no capture zoom or camera override',
    sourceCandidateSha256,
    sourceFiles: SOURCE_FILES,
    captures,
    ok: captures.length === SCENARIOS.length
      && captures.every((capture) => capture.pageErrors.length === 0
        && capture.receipt.routeMode === 'flight'
        && capture.receipt.cameraZoom === capture.receipt.witness.defaultCameraZoom
        && capture.receipt.heavyPresentationId === capture.scenario
        && capture.receipt.genericShipOverlaysSuppressed
        && capture.receipt.spriteCount === 0
        && capture.receipt.pointCount === 0),
  };
  await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'all heavy-family captures must preserve the canonical route and hard-geometry identity');
  assert.equal(captures[1].receipt.witness.event, 'ai:doctrinePhase');
  assert.equal(captures[1].receipt.witness.payload.phase, 'ram_spool');
  assert.equal(captures[2].receipt.witness.event, 'heavy:bayLaunch');
  assert.ok(captures[2].receipt.launched.length >= 1, 'Carrier action frame must include a real launched craft');
  assert.equal(captures[3].receipt.witness.event, 'heavy:chargedOreReleased');
  assert.ok(captures[3].receipt.chargedOre.some((ore) => ore.worldIdentity === 'foundry-charged-ore'),
    'Foundry action frame must include its real physical charged ore visual');
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
