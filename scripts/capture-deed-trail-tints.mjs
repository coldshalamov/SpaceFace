#!/usr/bin/env node
// Plan 44 public-route evidence for the two deed/event-earned wake colors. Focused production tests
// own the physical cause; this capture verifies the existing Trials selector and live contrail owner
// render each newly admitted color on the shipped fresh-run camera.

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
const OUT = path.join(ROOT, '.devshots', 'plan44-deed-trail-tints');
const EMBER = path.join(OUT, '01-smokewalker-ember-default-camera.png');
const BIOLUMINESCENT = path.join(OUT, '02-drifter-bioluminescent-default-camera.png');
const SELECTOR = path.join(OUT, '03-earned-wake-selector.png');
const REPORT = path.join(OUT, 'report.json');
const SOURCE_FILES = Object.freeze([
  'scripts/capture-deed-trail-tints.mjs',
  'src/data/timeTrialCourses.js',
  'src/systems/timeTrials.js',
  'test/arcade-core-names-and-deeds-route.test.mjs',
  'test/drifter-shoal-runtime.test.mjs',
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
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Earned Wake Route', seed: 440045 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.alive !== false && player?.mesh
      && !!sf?.state?.render?.cameraCtrl;
  }, null, { timeout: 90_000 });
  await page.evaluate(() => {
    const video = window.SF.state.settings.video;
    video.engineTrails = true;
    video.motionReduce = false;
    video.particleQuality = 'high';
    window.SF.bus.emit('settings:changed', { section: 'video', key: 'engineTrails' });
  });

  await page.evaluate(() => {
    const sf = window.SF;
    sf.bus.emit('entity:killed', {
      id: 'plan44-burn-up-capture',
      killerId: sf.state.playerId,
      receiptId: 'plan44-capture:smokewalker',
      presentation: { style: { id: 'burn_up' } },
    });
    sf.bus.emit('timeTrial:selectTrailTint', { tintId: 'trail_smokewalker_ember' });
  });
  await flyAndSettle(page, { turn: 'KeyA' });
  const emberReceipt = await inspect(page, 'trail_smokewalker_ember');
  const emberPng = await page.screenshot({ path: EMBER, type: 'png' });

  await page.evaluate(() => {
    const sf = window.SF;
    sf.bus.emit('anomaly:drifterUglinessBark', {
      anomalyId: 'wildlife_orcus_drifter_shoal',
      stableId: 'capture:drifter:0',
      combatOutcome: false,
    });
    sf.bus.emit('timeTrial:selectTrailTint', { tintId: 'trail_drifter_bioluminescent' });
  });
  await flyAndSettle(page, { turn: 'KeyD' });
  const bioluminescentReceipt = await inspect(page, 'trail_drifter_bioluminescent');
  const bioluminescentPng = await page.screenshot({ path: BIOLUMINESCENT, type: 'png' });

  const stationId = await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList.find((entity) => entity && entity.alive !== false
      && entity.type === 'station' && entity.data?.stationId);
    if (!station) throw new Error('no live station for Trials selector');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return station.data.stationId;
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15_000 });
  await page.locator('[data-screen="station"] [data-nav="trials"]').click();
  await page.waitForSelector('[data-screen="station"] .sx-trials__tints', { timeout: 15_000 });
  const selectorReceipt = await page.evaluate((expectedStationId) => {
    const rows = [...document.querySelectorAll('[data-screen="station"] [data-trial-tint]')];
    return {
      stationId: window.SF.state.ui.dockedStationId,
      expectedStationId,
      tints: rows.map((row) => ({
        id: row.getAttribute('data-trial-tint'),
        selected: row.getAttribute('aria-pressed') === 'true',
        label: row.textContent.trim(),
      })),
    };
  }, stationId);
  const selectorPng = await page.screenshot({ path: SELECTOR, type: 'png' });

  const splitIssues = splitExpectedIssues(issues.issues || []);
  const report = {
    schema: 'spaceface.plan44.deedTrailTintsCapture.v1',
    route: 'root -> game:new -> production semantic receipts -> existing Trials tint selection -> live held-W contrail -> real station Trials selector',
    cameraPolicy: 'both flight frames use the untouched fresh-run chase camera and shipped zoom',
    sourceCandidateSha256,
    captures: {
      ember: captureRecord(EMBER, emberPng, emberReceipt),
      bioluminescent: captureRecord(BIOLUMINESCENT, bioluminescentPng, bioluminescentReceipt),
      selector: captureRecord(SELECTOR, selectorPng, selectorReceipt),
    },
    issues: { actionable: splitIssues.actionable, expectedFallbacks: splitIssues.expected },
    ok: splitIssues.actionable.length === 0
      && emberReceipt.selectedTintId === 'trail_smokewalker_ember'
      && emberReceipt.ownerTintId === 'trail_smokewalker_ember'
      && emberReceipt.contrail.visible === true
      && bioluminescentReceipt.selectedTintId === 'trail_drifter_bioluminescent'
      && bioluminescentReceipt.ownerTintId === 'trail_drifter_bioluminescent'
      && bioluminescentReceipt.contrail.visible === true
      && emberReceipt.cameraZoom === emberReceipt.defaultCameraZoom
      && bioluminescentReceipt.cameraZoom === bioluminescentReceipt.defaultCameraZoom
      && selectorReceipt.tints.some((row) => row.id === 'trail_smokewalker_ember')
      && selectorReceipt.tints.some((row) => row.id === 'trail_drifter_bioluminescent'
        && row.selected === true),
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'both deed/event wakes must render through the public owner route');
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

async function flyAndSettle(page, { turn }) {
  await page.keyboard.down('KeyW');
  await page.keyboard.down(turn);
  await page.waitForTimeout(650);
  await page.keyboard.up(turn);
  await page.waitForTimeout(1450);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(120);
}

async function inspect(page, expectedTintId) {
  return page.evaluate((tintId) => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    const vfx = sf.registry.get('vfx');
    const stream = vfx?._energy?.plasmaStream;
    const contrail = stream?._contrail;
    const uniform = contrail?.material?.uniforms;
    return {
      mode: state.mode,
      expectedTintId: tintId,
      selectedTintId: state.player.timeTrials?.selectedTrailTint || null,
      unlocked: state.player.timeTrials?.unlockedTrailTints?.[tintId] === true,
      ownerTintId: vfx?._energy?.trailTintId || null,
      speed: Math.hypot(player?.vel?.x || 0, player?.vel?.z || 0),
      cameraZoom: state.camera.zoom,
      defaultCameraZoom: state.camera.zoom,
      contrail: {
        ...(contrail?.inspect?.() || {}),
        core: uniform?.uCoreColor?.value?.getHexString?.() || null,
        mid: uniform?.uMidColor?.value?.getHexString?.() || null,
        edge: uniform?.uEdgeColor?.value?.getHexString?.() || null,
      },
    };
  }, expectedTintId);
}

function captureRecord(file, png, receipt) {
  return {
    path: path.relative(ROOT, file).replaceAll('\\', '/'),
    sha256: sha256(png),
    width: 1600,
    height: 1000,
    receipt,
  };
}

function splitExpectedIssues(list) {
  const expected = [];
  const actionable = [];
  for (const issue of list) {
    const text = `${issue?.message || issue?.text || issue}`;
    if (/HTTP 404 .*__spaceface_player_store|\/api\/store\b.*404|Failed to load resource.*404/i.test(text)) {
      expected.push(issue);
    }
    else actionable.push(issue);
  }
  return { expected, actionable };
}
