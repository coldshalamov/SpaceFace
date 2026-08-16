#!/usr/bin/env node
// Plan 19 Crystal Shoals default-camera evidence.
//
// Boots the public browser route, enters Pallas through World, records a real Rapier player contact
// and the resulting chime, then frames the densest live part of the singing field with the shipped
// chase camera. The observer never writes crystal motion or replaces a production visual.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'plan19-crystal-shoal');
const WIDTH = 1440;
const HEIGHT = 900;
const FILE = '01-crystal-shoal-default-camera.png';
const SOURCE_FILES = Object.freeze([
  'src/data/anomalySites.js',
  'src/core/coreSystem.js',
  'src/systems/anomalyRuntime.js',
  'src/systems/tetherGameplay.js',
  'src/render/visualFactory.js',
  'src/render/anomalies/crystalShoal.js',
]);

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for Crystal Shoals capture');
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
    name: 'Plan19 Crystal Shoals',
    seed: 1901999,
  }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.mesh && !!sf?.state?.render?.cameraCtrl;
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);

  await page.evaluate(() => {
    const sf = window.SF;
    window.__SF_CRYSTAL_CHIMES__ = [];
    window.__SF_CRYSTAL_AUDIO__ = [];
    sf.bus.on('anomaly:crystalChime', (receipt) => {
      window.__SF_CRYSTAL_CHIMES__.push(JSON.parse(JSON.stringify(receipt)));
    });
    sf.bus.on('audio:cue', (receipt) => {
      if (receipt?.sourceEvent === 'anomaly:crystalChime') {
        window.__SF_CRYSTAL_AUDIO__.push(JSON.parse(JSON.stringify(receipt)));
      }
    });
    const world = sf.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') {
      throw new Error('production world enterSector owner is unavailable');
    }
    world.enterSector('sector_pallas_drift', {
      via: 'crystal-shoal-capture',
      fromSectorId: sf.state.world.currentSectorId || null,
      placePlayer: true,
    });
    sf.state.input.moveX = 0;
    sf.state.input.moveZ = 0;
    sf.state.input.turnIntent = 0;
    sf.state.input.boost = false;
    sf.state.input.actions = sf.state.input.actions || {};
    sf.state.player.targetId = null;
    sf.state.settings.video.motionReduce = false;
    sf.state.settings.video.flashReduce = false;
  });
  try {
    await page.waitForFunction(() => {
      const sf = window.SF;
      const bodies = (sf.state.entityList || []).filter((entity) => entity?.alive !== false
        && entity?.data?.kind === 'crystal_shoal_growth');
      return sf.state.world.currentSectorId === 'sector_pallas_drift' && bodies.length === 9;
    }, null, { timeout: 15_000 });
    await page.waitForFunction(() => {
      const sf = window.SF;
      const bodies = (sf.state.entityList || []).filter((entity) => entity?.alive !== false
        && entity?.data?.kind === 'crystal_shoal_growth');
      // Presentation residency is camera-local. The ninth body can legitimately remain outside the
      // visible bubble while all nine physical bodies stay live; require the representative field,
      // not a hidden off-camera allocation.
      return bodies.length === 9
        && bodies.filter((entity) => entity.mesh?.userData?.crystalShoalPresentation).length >= 8;
    }, null, { timeout: 15_000 });
  } catch (error) {
    const readiness = await page.evaluate(() => {
      const sf = window.SF;
      const bodies = (sf?.state?.entityList || []).filter((entity) => entity?.alive !== false
        && entity?.data?.kind === 'crystal_shoal_growth');
      return {
        mode: sf?.state?.mode || null,
        sectorId: sf?.state?.world?.currentSectorId || null,
        bodyCount: bodies.length,
        visualCount: bodies.filter((entity) => entity.mesh?.userData?.crystalShoalPresentation).length,
        diagnostics: sf?.registry?.get('anomalyRuntime')?.diagnostics?.() || null,
        issues: window.__SF_CRYSTAL_CHIMES__ || [],
      };
    });
    throw new Error(`Crystal readiness failed: ${JSON.stringify(readiness)}; ${error.message}`);
  }
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified' })));

  const before = await readMotion(page);
  await page.waitForTimeout(1700);
  const after = await readMotion(page);
  const movement = movementReceipt(before, after);
  if (movement.physicallyChangedBodies !== 9) {
    throw new Error(`shared drift/Rapier motion missing: ${JSON.stringify(movement)}`);
  }

  const contactStaging = await page.evaluate(async () => {
    const sf = window.SF;
    const bodies = (sf.state.entityList || []).filter((entity) => entity?.alive !== false
      && entity?.data?.kind === 'crystal_shoal_growth')
      .sort((a, b) => a.data.crystalSlot - b.data.crystalSlot);
    const target = bodies[0];
    const player = sf.state.entities.get(sf.state.playerId);
    const separation = Math.max(1, player.radius + target.radius - 0.6);
    player.pos.x = target.pos.x - separation;
    player.pos.z = target.pos.z;
    player.prevPos.copy(player.pos);
    player.vel.x = target.vel.x + 82;
    player.vel.z = target.vel.z;
    player.rot = 0;
    player.prevRot = 0;
    const physics = sf.registry.get('physics');
    if (!physics?.prepareBackend || !(await physics.prepareBackend(sf.state, { reset: true }))) {
      throw new Error('rapier-dynamic authority unavailable for capture');
    }
    return { targetStableId: target.data.anomalyStableId, targetSlot: target.data.crystalSlot };
  });
  await page.waitForFunction(() => (window.__SF_CRYSTAL_CHIMES__ || []).some((entry) => (
    entry.contactType === 'player' && entry.physicsBackend === 'rapier-dynamic'
  )), null, { timeout: 8_000 });

  const staging = await page.evaluate(() => {
    const sf = window.SF;
    const bodies = (sf.state.entityList || []).filter((entity) => entity?.alive !== false
      && entity?.data?.kind === 'crystal_shoal_growth');
    const neighborhoods = bodies.map((anchor) => {
      const members = bodies.filter((body) => Math.hypot(
        body.pos.x - anchor.pos.x,
        body.pos.z - anchor.pos.z,
      ) <= 230);
      return { anchor, members };
    }).sort((a, b) => b.members.length - a.members.length
      || a.anchor.data.crystalSlot - b.anchor.data.crystalSlot);
    const neighborhood = neighborhoods[0];
    const framed = neighborhood.members
      .sort((a, b) => a.data.crystalSlot - b.data.crystalSlot)
      .slice(0, 4);
    const center = framed.reduce((sum, body) => ({
      x: sum.x + body.pos.x / framed.length,
      z: sum.z + body.pos.z / framed.length,
    }), { x: 0, z: 0 });
    const player = sf.state.entities.get(sf.state.playerId);
    const lead = framed[0];
    let dx = center.x - lead.pos.x;
    let dz = center.z - lead.pos.z;
    let length = Math.hypot(dx, dz);
    if (!(length > 1)) { dx = 1; dz = 0; length = 1; }
    player.pos.x = center.x - dx / length * 58;
    player.pos.z = center.z - dz / length * 58;
    player.prevPos.copy(player.pos);
    player.vel.x = 0;
    player.vel.z = 0;
    player.rot = Math.atan2(center.z - player.pos.z, center.x - player.pos.x);
    player.prevRot = player.rot;
    sf.state.player.targetId = null;
    sf.state.input.moveX = 0;
    sf.state.input.moveZ = 0;
    sf.state.render.cameraCtrl.snapToPlayer();
    return {
      playerPosition: { x: player.pos.x, z: player.pos.z },
      fieldCenter: center,
      framedSlots: framed.map((body) => body.data.crystalSlot),
      neighborhoodSize: neighborhood.members.length,
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
      && entity?.data?.kind === 'crystal_shoal_growth');
    const bodyIds = new Set(bodies.map((entity) => entity.id));
    const masslineSelectionId = sf.state.masslineAcquisition?.selected?.targetId ?? null;
    const hoverText = document.querySelector('#sf-ml2 .ml2-preview')?.textContent || '';
    const presentations = bodies.map((entity) => entity.mesh?.userData?.crystalShoalPresentation || null)
      .filter(Boolean);
    return {
      sectorId: sf.state.world.currentSectorId,
      zoneId: bodies[0]?.data?.zoneId || null,
      iceFieldId: bodies[0]?.data?.iceFieldId || null,
      motionProfiles: [...new Set(bodies.map((entity) => entity.data.motionProfileId))],
      bodyCount: bodies.length,
      stableIds: bodies.map((entity) => entity.data.anomalyStableId).sort(),
      backend: sf.state.physicsRuntime?.diagnostics?.backend || null,
      diagnosticsLiveBodies: anomaly?.crystalShoal?.liveBodies || 0,
      visualBodyCount: presentations.length,
      construction: [...new Set(presentations.map((entry) => entry?.construction))],
      sprites: presentations.reduce((sum, entry) => sum + Number(entry?.sprites || 0), 0),
      points: presentations.reduce((sum, entry) => sum + Number(entry?.points || 0), 0),
      textureCards: presentations.reduce((sum, entry) => sum + Number(entry?.textureCards || 0), 0),
      crystalMasslineSelected: bodyIds.has(masslineSelectionId),
      crystalHoverLabelVisible: /Singing Crystal Growth/i.test(hoverText),
      chimes: window.__SF_CRYSTAL_CHIMES__ || [],
      audioIntents: window.__SF_CRYSTAL_AUDIO__ || [],
      cameraZoom: sf.state.camera?.zoom,
      defaultCameraZoom: 144,
    };
  });
  if (production.cameraZoom !== production.defaultCameraZoom) {
    throw new Error(`expected default camera zoom ${production.defaultCameraZoom}, got ${production.cameraZoom}`);
  }
  const realContact = production.chimes.find((entry) => entry.contactType === 'player'
    && entry.physicsBackend === 'rapier-dynamic');
  const realAudio = production.audioIntents.find((entry) => entry.sourceEvent === 'anomaly:crystalChime'
    && entry.id === 'sfx_vent_chime');
  if (production.bodyCount !== 9 || production.backend !== 'rapier-dynamic'
    || production.diagnosticsLiveBodies !== 9 || production.visualBodyCount < 8
    || production.zoneId !== 'zone_pallas_belt' || production.iceFieldId !== 'f_pallas_2'
    || production.motionProfiles.length !== 1 || production.motionProfiles[0] !== 'drift_shear'
    || production.construction.length !== 1
    || production.construction[0] !== 'hard_3d_fractured_root_custom_faceted_prisms_and_interior_lattice'
    || production.sprites !== 0 || production.points !== 0 || production.textureCards !== 0
    || production.crystalMasslineSelected || production.crystalHoverLabelVisible
    || !realContact || !realAudio || staging.framedSlots.length < 2) {
    throw new Error(`production Crystal receipt missing: ${JSON.stringify({ production, staging })}`);
  }

  const sourceHashes = {};
  for (const relative of SOURCE_FILES) {
    sourceHashes[relative] = sha256(await readFile(path.join(ROOT, relative)));
  }
  const candidateSourceSha256 = sha256(Buffer.from(
    Object.entries(sourceHashes).map(([file, hash]) => `${file}:${hash}`).join('\n'),
  ));
  const report = {
    schema: 'spaceface.plan19-crystal-shoal-capture.v1',
    ok: issues.length === 0,
    capturedAt: new Date().toISOString(),
    route: 'public root -> New Game -> World.enterSector(Pallas) -> anomalyRuntime -> Rapier contact -> audio cue -> visualFactory',
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
    contactStaging,
    staging,
    production,
    expectedFallbacks,
    issues,
  };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  else console.log('CRYSTAL_SHOAL_CAPTURE_OK');
} finally {
  await browser.close();
  await ownedServer.close();
}

async function readMotion(targetPage) {
  return targetPage.evaluate(() => (window.SF.state.entityList || [])
    .filter((entity) => entity?.alive !== false && entity?.data?.kind === 'crystal_shoal_growth')
    .map((entity) => ({
      stableId: entity.data.anomalyStableId,
      x: entity.pos.x,
      z: entity.pos.z,
      rot: entity.rot,
      vx: entity.vel.x,
      vz: entity.vel.z,
      angVel: entity.angVel,
    }))
    .sort((a, b) => a.stableId.localeCompare(b.stableId)));
}

function movementReceipt(before, after) {
  const prior = new Map(before.map((entry) => [entry.stableId, entry]));
  let physicallyChangedBodies = 0;
  let totalDistanceWU = 0;
  let totalRotationRad = 0;
  for (const entry of after) {
    const start = prior.get(entry.stableId);
    if (!start) continue;
    const distance = Math.hypot(entry.x - start.x, entry.z - start.z);
    const rotation = Math.abs(entry.rot - start.rot);
    if (distance > 0.01 || rotation > 0.0001) physicallyChangedBodies++;
    totalDistanceWU += distance;
    totalRotationRad += rotation;
  }
  return {
    sampleWindowMs: 1700,
    physicallyChangedBodies,
    totalDistanceWU,
    totalRotationRad,
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
