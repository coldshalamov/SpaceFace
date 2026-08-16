#!/usr/bin/env node
// Plan 19 Drifter Shoals default-camera evidence.
//
// Boots the public browser route, enters the canonical Orcus field through World, lets Fields and
// Rapier curve the real wildlife bodies, then frames the densest live group with the shipped chase
// camera. The observer records production entity/visual receipts but never writes Drifter motion.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'plan19-drifter-shoal');
const WIDTH = 1440;
const HEIGHT = 900;
const FILE = '01-drifter-shoal-default-camera.png';
const SOURCE_FILES = Object.freeze([
  'src/data/anomalySites.js',
  'src/core/coreSystem.js',
  'src/systems/anomalyRuntime.js',
  'src/systems/tetherGameplay.js',
  'src/render/visualFactory.js',
  'src/render/anomalies/drifterShoal.js',
]);

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for Drifter Shoals capture');
const ownedServer = await acquireVisualProbeServer({
  explicitUrl: process.env.SF_PROBE_URL || '',
  root: ROOT,
});
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const issues = [];
const expectedFallbacks = [];
page.on('pageerror', (error) => issues.push({ type: 'pageerror', text: error?.stack || String(error) }));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const location = message.location();
  const record = {
    type: 'console.error',
    text: message.text(),
    url: location?.url || null,
    lineNumber: location?.lineNumber ?? null,
  };
  if (record.url && new URL(record.url).pathname === '/__spaceface_player_store'
    && /404 \(Not Found\)/.test(record.text)) expectedFallbacks.push(record);
  else issues.push(record);
});

try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* ignored */ }
  });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry),
    null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', {
    name: 'Plan19 Drifter Shoals',
    seed: 1901919,
  }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.mesh && !!sf?.state?.render?.cameraCtrl;
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);

  await page.evaluate(() => {
    const sf = window.SF;
    const world = sf.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') {
      throw new Error('production world enterSector owner is unavailable');
    }
    world.enterSector('sector_orcus_shadow', {
      via: 'drifter-shoal-capture',
      fromSectorId: sf.state.world.currentSectorId || null,
      placePlayer: true,
    });
    sf.state.input.moveX = 0;
    sf.state.input.moveZ = 0;
    sf.state.input.turnIntent = 0;
    sf.state.input.boost = false;
    sf.state.input.actions = sf.state.input.actions || {};
    sf.state.settings.video.motionReduce = false;
    sf.state.settings.video.flashReduce = false;
  });
  await page.waitForFunction(() => {
    const sf = window.SF;
    const bodies = (sf.state.entityList || []).filter((entity) => entity?.alive !== false
      && entity?.data?.kind === 'drifter_wildlife');
    return bodies.length === 9 && bodies.every((entity) => entity.mesh?.userData?.drifterShoalPresentation);
  }, null, { timeout: 15_000 });
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified' })));

  const before = await readMotion(page);
  await page.waitForTimeout(1700);
  const after = await readMotion(page);
  const movement = movementReceipt(before, after);
  if (movement.movedBodies !== 9 || movement.curvedBodies < 5) {
    throw new Error(`real field motion missing: ${JSON.stringify(movement)}`);
  }

  const staging = await page.evaluate(async () => {
    const sf = window.SF;
    const { ORCUS_DRIFTER_SHOAL } = await import('/src/data/anomalySites.js');
    const bodies = (sf.state.entityList || []).filter((entity) => entity?.alive !== false
      && entity?.data?.kind === 'drifter_wildlife');
    const neighborhood = bodies.map((anchor) => {
      const members = bodies.filter((body) => Math.hypot(
        body.pos.x - anchor.pos.x,
        body.pos.z - anchor.pos.z,
      ) <= 125);
      return { anchor, members };
    }).sort((a, b) => b.members.length - a.members.length
      || a.anchor.data.drifterSlot - b.anchor.data.drifterSlot)[0];
    const center = neighborhood.members.reduce((sum, body) => ({
      x: sum.x + body.pos.x / neighborhood.members.length,
      z: sum.z + body.pos.z / neighborhood.members.length,
    }), { x: 0, z: 0 });
    const fieldCenter = sf.registry.get('anomalyRuntime')?.diagnostics?.().center || center;
    const dx = center.x - fieldCenter.x;
    const dz = center.z - fieldCenter.z;
    const length = Math.max(1, Math.hypot(dx, dz));
    const player = sf.state.entities.get(sf.state.playerId);
    player.pos.x = center.x + dx / length * 48;
    player.pos.z = center.z + dz / length * 48;
    player.prevPos.copy(player.pos);
    player.vel.x = 0;
    player.vel.z = 0;
    player.rot = Math.atan2(center.z - player.pos.z, center.x - player.pos.x);
    player.prevRot = player.rot;
    const physics = sf.registry.get('physics');
    if (!physics?.prepareBackend || !(await physics.prepareBackend(sf.state, { reset: true }))) {
      throw new Error('rapier-dynamic authority unavailable for capture');
    }
    sf.state.render.cameraCtrl.snapToPlayer();
    return {
      playerPosition: { x: player.pos.x, z: player.pos.z },
      framedSlots: neighborhood.members.map((body) => body.data.drifterSlot),
      fieldId: ORCUS_DRIFTER_SHOAL.fieldId,
    };
  });
  await page.waitForTimeout(420);

  const fullPath = path.join(OUT, FILE);
  await page.screenshot({ path: fullPath, fullPage: false });
  const bytes = await readFile(fullPath);
  const pixels = inspectPixels(bytes);
  const production = await page.evaluate(() => {
    const sf = window.SF;
    const anomaly = sf.registry.get('anomalyRuntime')?.diagnostics?.() || null;
    const bodies = (sf.state.entityList || []).filter((entity) => entity?.alive !== false
      && entity?.data?.kind === 'drifter_wildlife');
    const wildlifeIds = new Set(bodies.map((entity) => entity.id));
    const masslineSelectionId = sf.state.masslineAcquisition?.selected?.targetId ?? null;
    const hoverText = document.querySelector('#sf-ml2 .ml2-preview')?.textContent || '';
    const presentations = bodies.map((entity) => entity.mesh?.userData?.drifterShoalPresentation || null);
    return {
      sectorId: sf.state.world.currentSectorId,
      bodyCount: bodies.length,
      stableIds: bodies.map((entity) => entity.data.anomalyStableId).sort(),
      backend: sf.state.physicsRuntime?.diagnostics?.backend || null,
      fieldLive: anomaly?.registered === true,
      fieldAffected: sf.state.fields?.telemetry?.affected || 0,
      construction: [...new Set(presentations.map((entry) => entry?.construction))],
      sprites: presentations.reduce((sum, entry) => sum + Number(entry?.sprites || 0), 0),
      points: presentations.reduce((sum, entry) => sum + Number(entry?.points || 0), 0),
      textureCards: presentations.reduce((sum, entry) => sum + Number(entry?.textureCards || 0), 0),
      wildlifeMasslineSelected: wildlifeIds.has(masslineSelectionId),
      wildlifeHoverLabelVisible: /Bioluminescent Drifter/i.test(hoverText),
      cameraZoom: sf.state.camera?.zoom,
      defaultCameraZoom: 144,
    };
  });
  if (production.cameraZoom !== production.defaultCameraZoom) {
    throw new Error(`expected default camera zoom ${production.defaultCameraZoom}, got ${production.cameraZoom}`);
  }
  if (production.bodyCount !== 9 || production.backend !== 'rapier-dynamic' || !production.fieldLive
    || production.construction.length !== 1
    || production.construction[0] !== 'hard_3d_lathed_bell_ribs_and_rooted_tentacles'
    || production.sprites !== 0 || production.points !== 0 || production.textureCards !== 0
    || production.wildlifeMasslineSelected || production.wildlifeHoverLabelVisible) {
    throw new Error(`production Drifter receipt missing: ${JSON.stringify(production)}`);
  }

  const sourceHashes = {};
  for (const relative of SOURCE_FILES) {
    sourceHashes[relative] = sha256(await readFile(path.join(ROOT, relative)));
  }
  const candidateSourceSha256 = sha256(Buffer.from(
    Object.entries(sourceHashes).map(([file, hash]) => `${file}:${hash}`).join('\n'),
  ));
  const report = {
    schema: 'spaceface.plan19-drifter-shoal-capture.v1',
    ok: issues.length === 0,
    capturedAt: new Date().toISOString(),
    route: 'public root -> New Game -> World.enterSector(Orcus) -> anomalyRuntime -> Fields/Rapier -> visualFactory',
    cameraPolicy: 'shipped default chase camera; no zoom or camera override',
    viewport: { width: WIDTH, height: HEIGHT },
    candidateSourceSha256,
    sourceHashes,
    image: {
      file: FILE,
      path: fullPath,
      sha256: sha256(bytes),
      width: pixels.width,
      height: pixels.height,
      whitePct: pixels.whitePct,
      midLumPct: pixels.midLumPct,
    },
    movement,
    staging,
    production,
    expectedFallbacks,
    issues,
  };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  else console.log('DRIFTER_SHOAL_CAPTURE_OK');
} finally {
  await browser.close();
  await ownedServer.close();
}

async function readMotion(targetPage) {
  return targetPage.evaluate(() => {
    const sf = window.SF;
    return (sf.state.entityList || []).filter((entity) => entity?.alive !== false
      && entity?.data?.kind === 'drifter_wildlife')
      .map((entity) => ({
        stableId: entity.data.anomalyStableId,
        x: entity.pos.x,
        z: entity.pos.z,
        vx: entity.vel.x,
        vz: entity.vel.z,
      }))
      .sort((a, b) => a.stableId.localeCompare(b.stableId));
  });
}

function movementReceipt(before, after) {
  const prior = new Map(before.map((entry) => [entry.stableId, entry]));
  let movedBodies = 0;
  let curvedBodies = 0;
  let totalDistanceWU = 0;
  for (const entry of after) {
    const start = prior.get(entry.stableId);
    if (!start) continue;
    const distance = Math.hypot(entry.x - start.x, entry.z - start.z);
    const cross = Math.abs(start.vx * entry.vz - start.vz * entry.vx);
    if (distance > 0.5) movedBodies++;
    if (cross > 1) curvedBodies++;
    totalDistanceWU += distance;
  }
  return {
    sampleWindowMs: 1700,
    movedBodies,
    curvedBodies,
    totalDistanceWU,
    beforePoseHash: sha256(Buffer.from(JSON.stringify(before))),
    afterPoseHash: sha256(Buffer.from(JSON.stringify(after))),
  };
}

function inspectPixels(bytes) {
  const png = PNG.sync.read(bytes);
  let white = 0;
  let mid = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    const r = png.data[index];
    const g = png.data[index + 1];
    const b = png.data[index + 2];
    if (r > 235 && g > 235 && b > 235) white++;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance >= 25 && luminance <= 220) mid++;
  }
  const count = png.width * png.height;
  const whitePct = white / count;
  const midLumPct = mid / count;
  if (whitePct > 0.02) throw new Error(`capture whiteout ${(whitePct * 100).toFixed(3)}%`);
  if (midLumPct < 0.005) throw new Error(`capture lacks readable structure ${(midLumPct * 100).toFixed(3)}%`);
  return { width: png.width, height: png.height, whitePct, midLumPct };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function dismissTutorial(targetPage) {
  await targetPage.evaluate(() => {
    for (const selector of ['.tutorial-overlay', '[data-screen="tutorial"]', '.sf-tutorial']) {
      const root = document.querySelector(selector);
      const button = root && [...root.querySelectorAll('button')]
        .find((node) => /skip|dismiss|close|got it/i.test(node.textContent || ''));
      if (button) button.click();
    }
  });
}

function findSystemBrowser() {
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate) => existsSync(candidate)) || null;
}
