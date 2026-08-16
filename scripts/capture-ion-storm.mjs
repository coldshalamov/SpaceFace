#!/usr/bin/env node
// Plan 19 Ion Storm default-camera evidence.
//
// Boots the shipped browser route, stages the player inside the canonical Blind Nebula pocket,
// predicts the next deterministic source receipt only to frame it, then waits for anomalyRuntime's
// real bus event and VFX's real fixed pool before capturing full and reduced-flash frames.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'plan19-ion-storm');
const WIDTH = 1440;
const HEIGHT = 900;
const SOURCE_FILES = Object.freeze([
  'src/data/anomalySites.js',
  'src/systems/anomalyRuntime.js',
  'src/presentation/radarJamming.js',
  'src/systems/combat.js',
  'src/render/anomalies/ionStorm.js',
  'src/render/vfx.js',
]);

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for Ion Storm capture');
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
const captures = [];
page.on('pageerror', (error) => issues.push({ type: 'pageerror', text: error?.stack || String(error) }));
page.on('console', (message) => {
  if (message.type() === 'error') {
    const location = message.location();
    const record = {
      type: 'console.error',
      text: message.text(),
      url: location?.url || null,
      lineNumber: location?.lineNumber ?? null,
    };
    // sharedPlayerStore explicitly treats a store-less HTTP server's 404 as a supported local-only
    // fallback. Preserve the receipt, but do not misclassify that documented route as a capture bug.
    if (record.url && new URL(record.url).pathname === '/__spaceface_player_store'
      && /404 \(Not Found\)/.test(record.text)) expectedFallbacks.push(record);
    else issues.push(record);
  }
});

try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* ignored */ }
  });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry),
    null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Plan19 Ion Storm', seed: 1901905 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.mesh && !!sf?.registry?.get?.('vfx')?._scene;
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);

  await page.evaluate(async () => {
    const sf = window.SF;
    const world = sf.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') {
      throw new Error('production world enterSector owner is unavailable');
    }
    world.enterSector('sector_veil_nebula', {
      via: 'ion-storm-capture',
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
    sf.state.settings.accessibility = sf.state.settings.accessibility || {};
    sf.state.settings.accessibility.flashReduce = false;
    window.__sfIonStormReceipts = [];
    sf.bus.on('anomaly:ionStormLightning', (payload) => {
      window.__sfIonStormReceipts.push(JSON.parse(JSON.stringify(payload)));
    });
  });
  await page.waitForFunction(() => {
    const sf = window.SF;
    return (sf.state.entityList || []).some((entity) => entity?.alive !== false
      && entity?.data?.anomalyStableId === 'anomaly-marker:veil-ion-storm');
  }, null, { timeout: 10_000 });
  // Production sector cards dismiss on any input. Use that ordinary route so the full-size evidence
  // records the playfield rather than a temporary arrival overlay.
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified' })));

  await captureStrike(page, '01-ion-storm-default-camera.png', false);
  await captureStrike(page, '02-ion-storm-reduced-flash-default-camera.png', true);

  const sourceHashes = {};
  for (const relative of SOURCE_FILES) {
    sourceHashes[relative] = sha256(await readFile(path.join(ROOT, relative)));
  }
  const candidateSourceSha256 = sha256(Buffer.from(
    Object.entries(sourceHashes).map(([file, hash]) => `${file}:${hash}`).join('\n'),
  ));
  const report = {
    schema: 'spaceface.plan19-ion-storm-capture.v1',
    ok: issues.length === 0 && captures.length === 2,
    capturedAt: new Date().toISOString(),
    route: 'public root -> New Game -> production anomalyRuntime fixed-window event -> VFX LineSegments',
    cameraPolicy: 'shipped default chase camera; no zoom or camera override',
    viewport: { width: WIDTH, height: HEIGHT },
    candidateSourceSha256,
    sourceHashes,
    captures,
    expectedFallbacks,
    issues,
  };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  else console.log('ION_STORM_CAPTURE_OK');
} finally {
  await browser.close();
  await ownedServer.close();
}

async function captureStrike(targetPage, file, reducedFlash) {
  const staged = await targetPage.evaluate(async ({ reducedFlash }) => {
    const sf = window.SF;
    sf.state.settings.video.flashReduce = !!reducedFlash;
    sf.state.settings.accessibility = sf.state.settings.accessibility || {};
    sf.state.settings.accessibility.flashReduce = !!reducedFlash;
    const [{ ION_STORM_POCKET }, { ionStormLightningReceipt }] = await Promise.all([
      import('/src/data/anomalySites.js'),
      import('/src/systems/anomalyRuntime.js'),
    ]);
    const marker = (sf.state.entityList || []).find((entity) => entity?.alive !== false
      && entity?.data?.anomalyStableId === ION_STORM_POCKET.markerStableId);
    if (!marker) throw new Error('canonical Ion Storm marker missing before capture');
    const cadenceS = ION_STORM_POCKET.lightning.cadenceS;
    const volume = { x: marker.pos.x, z: marker.pos.z, radius: marker.radius };
    const player = sf.state.entities.get(sf.state.playerId);
    const liveObstacles = (sf.state.entityList || []).filter((entity) => entity?.alive !== false
      && entity.id !== player.id
      && entity.kind !== 'fx'
      && entity.pos
      && Number.isFinite(entity.pos.x)
      && Number.isFinite(entity.pos.z));
    const pointSegmentDistance = (point, start, end) => {
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const lengthSq = dx * dx + dz * dz;
      const t = lengthSq > 1e-6
        ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq))
        : 0;
      return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t));
    };
    const firstWindow = Math.floor(sf.state.simTime / cadenceS) + 2;
    const candidates = Array.from({ length: 7 }, (_, offset) => {
      const pulseWindow = firstWindow + offset;
      const receipt = ionStormLightningReceipt(ION_STORM_POCKET, volume, sf.state, pulseWindow);
      const clearance = liveObstacles.reduce((nearest, entity) => Math.min(nearest,
        pointSegmentDistance(entity.pos, receipt.start, receipt.end)
          - Math.max(2, Number(entity.radius) || 0)), Number.POSITIVE_INFINITY);
      return { pulseWindow, receipt, clearance };
    });
    candidates.sort((a, b) => b.clearance - a.clearance || a.pulseWindow - b.pulseWindow);
    const selected = candidates[0];
    const predicted = selected.receipt;
    const pulseWindow = selected.pulseWindow;
    player.pos.x = (predicted.start.x + predicted.end.x) * 0.5;
    player.pos.z = (predicted.start.z + predicted.end.z) * 0.5;
    player.prevPos.copy(player.pos);
    player.vel.x = 0;
    player.vel.z = 0;
    const physics = sf.registry.get('physics');
    if (physics?.prepareBackend) await physics.prepareBackend(sf.state, { reset: true });
    sf.state.render?.cameraCtrl?.snapToPlayer?.();
    return {
      pulseWindow,
      sourceSeed: predicted.sourceSeed,
      obstacleClearanceWU: selected.clearance,
      playerPosition: { x: player.pos.x, z: player.pos.z },
    };
  }, { reducedFlash });

  // Let the shipped chase camera settle before the deterministic window arrives.
  await targetPage.waitForTimeout(260);
  await targetPage.waitForFunction(({ pulseWindow, sourceSeed }) => {
    const receipts = window.__sfIonStormReceipts || [];
    const sawReceipt = receipts.some((receipt) => receipt.pulseWindow === pulseWindow
      && receipt.sourceSeed === sourceSeed);
    const inspect = window.SF.registry.get('vfx')?._ionStormLightning?.inspect?.();
    return sawReceipt && inspect?.lastSourceSeed === sourceSeed && inspect.active > 0;
  }, staged, { timeout: 16_000, polling: 10 });
  await targetPage.waitForTimeout(reducedFlash ? 65 : 12);

  const fullPath = path.join(OUT, file);
  await targetPage.screenshot({ path: fullPath, fullPage: false });
  const bytes = await readFile(fullPath);
  const pixels = inspectPixels(bytes);
  const receipt = await targetPage.evaluate(({ pulseWindow, reducedFlash, staged }) => {
    const sf = window.SF;
    const source = (window.__sfIonStormReceipts || [])
      .find((entry) => entry.pulseWindow === pulseWindow);
    const presentation = sf.registry.get('vfx')?._ionStormLightning?.inspect?.() || null;
    return {
      pulseWindow,
      reducedFlash,
      source,
      presentation,
      cameraZoom: sf.state.camera?.zoom,
      defaultCameraZoom: 144,
      markerCount: (sf.state.entityList || []).filter((entity) => entity?.alive !== false
        && entity?.data?.anomalyStableId === 'anomaly-marker:veil-ion-storm').length,
      staging: staged,
    };
  }, { pulseWindow: staged.pulseWindow, reducedFlash, staged });
  if (receipt.cameraZoom !== receipt.defaultCameraZoom) {
    throw new Error(`${file}: expected default camera zoom ${receipt.defaultCameraZoom}, got ${receipt.cameraZoom}`);
  }
  if (receipt.markerCount !== 1 || receipt.presentation?.construction !== 'fixed_pool_authored_line_segments') {
    throw new Error(`${file}: production marker/VFX receipt missing`);
  }
  captures.push({
    file,
    path: fullPath,
    sha256: sha256(bytes),
    width: pixels.width,
    height: pixels.height,
    whitePct: pixels.whitePct,
    midLumPct: pixels.midLumPct,
    receipt,
  });
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
    if (luminance >= 35 && luminance <= 210) mid++;
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
