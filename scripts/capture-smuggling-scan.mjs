#!/usr/bin/env node
// Plan 49 customs scan-lattice component evidence. Production route tests own gameplay acceptance;
// this public-browser harness stages a burn-cut intercept only to inspect the shipped default camera.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'plan49-smuggling-scan');
const IMAGE = path.join(OUT, '01-customs-scan-lattice-default-camera.png');
const WIDTH = 1440;
const HEIGHT = 900;
const SOURCE_FILES = Object.freeze([
  'src/data/smugglingStealth.js',
  'src/systems/encounterScripts.js',
  'src/systems/encounterDirector.js',
  'src/render/visualFactory.js',
  'src/render/visualOverrides.js',
]);

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for Plan49 capture');
const server = await acquireVisualProbeServer({ explicitUrl: process.env.SF_PROBE_URL || '', root: ROOT });
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
  const record = { type: 'console.error', text: message.text(), url: location?.url || null };
  if (record.url && new URL(record.url).pathname === '/__spaceface_player_store'
    && /404 \(Not Found\)/.test(record.text)) expectedFallbacks.push(record);
  else issues.push(record);
});

try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* ignored */ }
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry),
    null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Plan49 Scan Lattice', seed: 49049 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.mesh;
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);
  const staged = await page.evaluate(async () => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    const anchor = { x: player.pos.x + 1000, z: player.pos.z };
    player.rot = 0;
    player.vel.x = 84;
    player.vel.z = 0;
    sf.state.input.thrust = 0;
    sf.state.input.moveZ = 0;
    sf.state.input.moveX = 0;
    sf.state.input.boost = false;
    sf.state.input.brake = false;
    const physics = sf.registry.get('physics');
    if (physics?.prepareBackend) await physics.prepareBackend(sf.state, { reset: true });
    sf.state.timeScale = 0;
    const director = sf.registry.get('encounterDirector');
    const request = director.requestAuthoredEncounter({
      shapeId: 'patrol_scan',
      encounterId: 'plan49:capture:patrol',
      sectorId: sf.state.world.currentSectorId,
      anchor,
      zoneType: 'border_checkpoint',
      zoneRadius: 1600,
      force: true,
    });
    if (!request?.ok) throw new Error(`patrol capture request failed: ${JSON.stringify(request)}`);
    return { request, playerId: player.id };
  });
  await page.waitForFunction(() => {
    const sf = window.SF;
    const patrol = (sf.state.entityList || []).find((entity) => entity?.alive !== false
      && entity?.data?.smugglingScanCone?.kind === 'customs_scan_lattice');
    return !!patrol?.mesh?.userData?.customsScanLattice;
  }, null, { timeout: 12_000, polling: 16 });
  await page.evaluate(() => {
    const sf = window.SF;
    const patrol = (sf.state.entityList || []).find((entity) => entity?.alive !== false
      && entity?.data?.smugglingScanCone?.kind === 'customs_scan_lattice');
    const renderOwner = sf.registry.get('render');
    renderOwner?.reconcileMeshes?.();
    renderOwner?._drainMeshBuildQueue?.(Infinity);
    patrol?.mesh?.userData?.requestAuthoredUpgrade?.(renderOwner?.renderer, renderOwner?.scene);
  });
  await page.waitForFunction(() => {
    const patrol = (window.SF.state.entityList || []).find((entity) => entity?.alive !== false
      && entity?.data?.smugglingScanCone?.kind === 'customs_scan_lattice');
    return ['authored', 'procedural-settled'].includes(patrol?.mesh?.userData?.authoredAssetState);
  }, null, { timeout: 8_000, polling: 16 });
  await page.waitForTimeout(200);
  const presentationStage = await page.evaluate(async ({ playerId }) => {
    const sf = window.SF;
    const player = sf.state.entities.get(playerId);
    const patrol = (sf.state.entityList || []).find((entity) => entity?.alive !== false
      && entity?.data?.smugglingScanCone?.kind === 'customs_scan_lattice');
    if (!player || !patrol) throw new Error('live customs patrol disappeared before presentation staging');
    const angle = Number(patrol.rot) || 0;
    player.pos.x = patrol.pos.x + Math.cos(angle) * 52;
    player.pos.z = patrol.pos.z + Math.sin(angle) * 52;
    player.vel.x = 0;
    player.vel.z = 0;
    const physics = sf.registry.get('physics');
    if (physics?.prepareBackend) await physics.prepareBackend(sf.state, { reset: true });
    const renderOwner = sf.registry.get('render');
    renderOwner?.reconcileMeshes?.();
    renderOwner?._drainMeshBuildQueue?.(Infinity);
    const mesh = patrol.mesh || sf.state.render?.meshes?.get?.(patrol.id) || null;
    return {
      patrolId: patrol.id,
      distance: Math.hypot(player.pos.x - patrol.pos.x, player.pos.z - patrol.pos.z),
      hasMesh: !!mesh,
      meshName: mesh?.name || null,
      hasLattice: !!mesh?.userData?.customsScanLattice,
      scanActive: patrol.data?.smugglingScanCone?.active === true,
    };
  }, staged);
  if (!presentationStage.hasLattice
    || presentationStage.distance < 35 || presentationStage.distance > 70) {
    throw new Error(`customs scan presentation staging failed: ${JSON.stringify(presentationStage)}`);
  }
  await page.waitForTimeout(34);
  await page.screenshot({ path: IMAGE, fullPage: false });

  const receipt = await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    const patrol = (sf.state.entityList || []).find((entity) => entity?.alive !== false
      && entity?.data?.smugglingScanCone?.kind === 'customs_scan_lattice'
      && entity.mesh?.userData?.customsScanLattice);
    const lattice = patrol?.mesh?.userData?.customsScanLattice;
    let lineSegments = 0;
    let sprites = 0;
    let points = 0;
    lattice?.traverse?.((object) => {
      if (object.isLineSegments) lineSegments++;
      if (object.isSprite) sprites++;
      if (object.isPoints) points++;
    });
    const renderOwner = sf.registry.get('render');
    const camera = renderOwner?.cam?.obj || renderOwner?.camera || null;
    const projectedSegments = [];
    const position = lattice?.geometry?.getAttribute?.('position');
    if (lattice && camera && position) {
      lattice.updateWorldMatrix(true, false);
      camera.updateMatrixWorld(true);
      for (let index = 0; index < Math.min(position.count, 14); index++) {
        const point = lattice.position.clone();
        point.set(position.getX(index), position.getY(index), position.getZ(index));
        lattice.localToWorld(point);
        point.project(camera);
        projectedSegments.push({ x: point.x, y: point.y, z: point.z });
      }
    }
    return {
      playerId: player?.id || null,
      patrolId: patrol?.id || null,
      playerPatrolDistanceWU: player && patrol
        ? Math.hypot(player.pos.x - patrol.pos.x, player.pos.z - patrol.pos.z)
        : null,
      scanPresentation: patrol?.mesh?.userData?.customsScanPresentation || null,
      scanRangeWU: lattice?.userData?.scanRangeWU || null,
      scanVisualRangeWU: lattice?.userData?.visualRangeWU || null,
      lineSegments,
      hardRailInstances: lattice?.userData?.hardRailInstances || 0,
      sprites,
      points,
      boundaryVisible: patrol?.mesh?.visible !== false,
      authoredAssetState: patrol?.mesh?.userData?.authoredAssetState || null,
      latticeVisible: lattice?.visible !== false,
      projectedSegments,
      cameraZoom: sf.state.camera?.zoom ?? null,
      defaultCameraZoom: 144,
      encounterLive: !!sf.state.encounterDirector?.live?.['plan49:capture:patrol'],
      presentationTimeScale: sf.state.timeScale,
    };
  });
  const sourceHashes = {};
  for (const relative of SOURCE_FILES) sourceHashes[relative] = sha256(await readFile(path.join(ROOT, relative)));
  const report = {
    schema: 'spaceface.plan49-smuggling-scan-capture.v1',
    ok: issues.length === 0
      && receipt.scanPresentation === 'hard-line-fan'
      && receipt.lineSegments === 1
      && receipt.sprites === 0
      && receipt.points === 0,
    capturedAt: new Date().toISOString(),
    route: 'public root -> New Game -> production authored patrol_scan -> burn-cut intercept -> shipped default chase camera',
    evidenceScope: 'scan-lattice component only; focused production test owns cold-run/storm/decoy acceptance; inherited Hornet hull admission is excluded',
    viewport: { width: WIDTH, height: HEIGHT },
    candidateSourceSha256: sha256(Buffer.from(Object.entries(sourceHashes).map(([file, hash]) => `${file}:${hash}`).join('\n'))),
    sourceHashes,
    image: { path: IMAGE, sha256: sha256(await readFile(IMAGE)) },
    receipt,
    expectedFallbacks,
    issues,
  };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  else console.log('SMUGGLING_SCAN_CAPTURE_OK');
} finally {
  await browser.close();
  await server.close();
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function findSystemBrowser() {
  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
}
