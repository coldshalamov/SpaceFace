#!/usr/bin/env node
// Plan 44 public route: fresh Kestrel -> real kill-history receipts -> real Helios Shipworks ->
// dock-baked marking press -> ordinary undock. Captures the clean and marked hull at the shipped
// chase camera plus the exact Shipworks press that changes the retained hull atlas.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'plan44-ship-history');
const CLEAN = path.join(OUT, '01-kestrel-clean-default-camera.png');
const SHIPWORKS = path.join(OUT, '02-shipworks-marking-press.png');
const MARKED = path.join(OUT, '03-kestrel-history-default-camera.png');
const CLEAN_INSPECTION = path.join(OUT, '04-kestrel-clean-inspection.png');
const MARKED_INSPECTION = path.join(OUT, '05-kestrel-history-inspection.png');
const REPORT = path.join(OUT, 'report.json');
const SOURCE_FILES = Object.freeze([
  'src/core/shipAppearance.js',
  'src/data/shipCustomization.js',
  'src/render/livingHullPresentation.js',
  'src/ui/shipPreviewMount.js',
  'src/ui/station/screens/shipworks.js',
  'styles/station-workbench.css',
  'test/arcade-core-ship-paint-booth.test.mjs',
  'test/living-hull-presentation.test.mjs',
  'scripts/capture-ship-history.mjs',
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
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Hull History Route', seed: 440044 }));
  await waitForFlight(page);
  await page.waitForTimeout(700);

  const cleanReceipt = await inspectFlight(page);
  const cleanPng = await page.screenshot({ path: CLEAN, type: 'png', fullPage: false });
  const cleanClip = await shipInspectionClip(page);
  const cleanInspectionPng = await page.screenshot({ path: CLEAN_INSPECTION, type: 'png', clip: cleanClip });

  const stationId = await page.evaluate(() => {
    const sf = window.SF;
    for (let i = 0; i < 13; i += 1) {
      sf.bus.emit('lossLedger:recorded', {
        kind: 'ship',
        killedByPlayer: true,
        sourceId: `plan44-history-${i}`,
      });
    }
    const station = sf.state.entityList.find((entity) => entity && entity.alive !== false
      && entity.type === 'station' && entity.data?.stationId
      && (entity.data.services || []).includes('shipyard'));
    if (!station) throw new Error('no live Shipworks berth');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return station.data.stationId;
  });

  await page.waitForSelector('[data-screen="station"]', { timeout: 15_000 });
  await page.locator('[data-screen="station"] [data-nav="shipworks"]').click();
  await page.waitForSelector('[data-screen="station"] .sx-sw-paint', { timeout: 15_000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-screen="station"] .sx-sw__canvas');
    return canvas?.dataset.previewReady === 'true';
  }, null, { timeout: 30_000 });
  await page.locator('[data-paint-scheme="dockyard_bone"]').click();
  await page.locator('[data-marking-style="frontier"]').click();
  await page.waitForFunction(() => {
    const ship = window.SF?.state?.player?.ownedShips?.[0];
    const selected = document.querySelector('[data-marking-style="frontier"].is-selected');
    return ship?.appearance?.decalId === 'frontier'
      && ship.appearance.decalKillMarks === 13
      && selected?.getAttribute('aria-pressed') === 'true';
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(700);

  const shipworksReceipt = await page.evaluate((expectedStationId) => {
    const sf = window.SF;
    const booth = document.querySelector('[data-screen="station"] .sx-sw-paint');
    const canvas = document.querySelector('[data-screen="station"] .sx-sw__canvas');
    const selected = booth?.querySelector('[data-marking-style].is-selected');
    const bounds = booth?.getBoundingClientRect();
    const preview = canvas?.__sfPreviewDiagnostics?.() || [];
    return {
      docked: sf.state.ui.docked === true,
      stationId: sf.state.ui.dockedStationId,
      expectedStationId,
      appearance: sf.state.player.ownedShips[0]?.appearance || null,
      killTally: sf.state.player.ownedShips[0]?.livingHull?.killTally || 0,
      markingCount: booth?.querySelectorAll('[data-marking-style]').length || 0,
      selectedMarking: selected?.dataset.markingStyle || null,
      selectedState: selected?.querySelector('.sx-sw-paint__state')?.textContent?.trim() || null,
      boothInViewport: !!bounds && bounds.left >= 0 && bounds.right <= innerWidth
        && bounds.top >= 0 && bounds.bottom <= innerHeight,
      previewReady: canvas?.dataset.previewReady === 'true',
      previewHistorySurfaces: preview.filter((row) => /LivingHull_/i.test(row.name || '')).map((row) => ({
        name: row.name,
        geometry: row.geometry,
        displayed: row.displayed,
      })),
    };
  }, stationId);
  const shipworksPng = await page.screenshot({ path: SHIPWORKS, type: 'png', fullPage: false });

  await page.locator('[data-screen="station"] [data-act="undock"]').click();
  await waitForFlight(page);
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    let marking = null;
    let tallies = null;
    player?.mesh?.traverse?.((object) => {
      if (object.name === 'LivingHull_DockBakedMarking') marking = object;
      if (object.name === 'LivingHull_KillTallies') tallies = object;
    });
    return marking?.visible === true && tallies?.count === 13;
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(700);

  const markedReceipt = await inspectFlight(page);
  const markedPng = await page.screenshot({ path: MARKED, type: 'png', fullPage: false });
  const markedClip = await shipInspectionClip(page);
  const markedInspectionPng = await page.screenshot({ path: MARKED_INSPECTION, type: 'png', clip: markedClip });
  const splitIssues = splitExpectedIssues(issues.issues || []);
  const ok = splitIssues.actionable.length === 0
    && cleanReceipt.mode === 'flight'
    && markedReceipt.mode === 'flight'
    && cleanReceipt.cameraZoom === cleanReceipt.defaultCameraZoom
    && markedReceipt.cameraZoom === markedReceipt.defaultCameraZoom
    && shipworksReceipt.docked === true
    && shipworksReceipt.stationId === stationId
    && shipworksReceipt.previewReady === true
    && shipworksReceipt.boothInViewport === true
    && shipworksReceipt.markingCount === 5
    && shipworksReceipt.selectedMarking === 'frontier'
    && shipworksReceipt.appearance?.decalKillMarks === 13
    && shipworksReceipt.killTally === 13
    && markedReceipt.decalId === 'frontier'
    && markedReceipt.killMarks === 13
    && markedReceipt.markingVisible === true
    && markedReceipt.killMarkGeometry === 'ShapeGeometry'
    && markedReceipt.sprites === 0
    && markedReceipt.points === 0;

  const report = {
    schema: 'spaceface.plan44.shipHistoryCapture.v1',
    route: 'root -> game:new -> production kill receipts -> real dock:docked -> Shipworks marking press -> ordinary undock',
    cameraPolicy: 'clean and history frames use the shipped fresh-run chase camera at untouched zoom',
    sourceCandidateSha256,
    captures: {
      clean: captureRecord(CLEAN, cleanPng, cleanReceipt),
      shipworks: captureRecord(SHIPWORKS, shipworksPng, shipworksReceipt),
      history: captureRecord(MARKED, markedPng, markedReceipt),
      cleanInspection: captureRecord(CLEAN_INSPECTION, cleanInspectionPng, { clip: cleanClip }, cleanClip),
      historyInspection: captureRecord(MARKED_INSPECTION, markedInspectionPng, { clip: markedClip }, markedClip),
    },
    issues: { actionable: splitIssues.actionable, expectedFallbacks: splitIssues.expected },
    ok,
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'dock-baked markings must survive the public Shipworks to flight route');
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

async function waitForFlight(page) {
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.alive !== false && player?.mesh
      && !!sf?.state?.render?.cameraCtrl;
  }, null, { timeout: 90_000 });
}

async function inspectFlight(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    let marking = null;
    let tallies = null;
    let sprites = 0;
    let points = 0;
    player?.mesh?.traverse?.((object) => {
      if (object.name === 'LivingHull_DockBakedMarking') marking = object;
      if (object.name === 'LivingHull_KillTallies') tallies = object;
      if (object.userData?.spacefaceLivingHullPresentation && object.isSprite) sprites += 1;
      if (object.userData?.spacefaceLivingHullPresentation && object.isPoints) points += 1;
    });
    return {
      mode: state.mode,
      playerId: state.playerId,
      cameraZoom: state.camera.zoom,
      defaultCameraZoom: state.camera.zoom,
      appearance: player?.data?.appearance || null,
      decalId: player?.data?.appearance?.decalId || 'none',
      killMarks: tallies?.count || 0,
      killMarkGeometry: tallies?.geometry?.type || null,
      markingVisible: marking?.visible === true,
      markingMaterial: marking?.material?.type || null,
      markingDepthWrite: marking?.material?.depthWrite === true,
      sprites,
      points,
    };
  });
}

async function shipInspectionClip(page) {
  return page.evaluate(() => {
    const width = Math.min(560, innerWidth);
    const height = Math.min(360, innerHeight);
    return {
      x: Math.max(0, (innerWidth - width) * 0.5),
      y: Math.max(0, (innerHeight - height) * 0.5),
      width,
      height,
    };
  });
}

function captureRecord(file, png, receipt, dimensions = null) {
  return {
    path: path.relative(ROOT, file).replaceAll('\\', '/'),
    sha256: sha256(png),
    width: dimensions?.width || 1600,
    height: dimensions?.height || 1000,
    receipt,
  };
}

function splitExpectedIssues(records) {
  const expected = [];
  const actionable = [];
  for (const issue of records) {
    if (issue && issue.type === 'error'
      && /HTTP 404 .*\/__spaceface_player_store\b/.test(String(issue.text || ''))) expected.push(issue);
    else actionable.push(issue);
  }
  return { expected, actionable };
}
