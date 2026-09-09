#!/usr/bin/env node
// Canonical-route evidence for the authored deep-field background. The player, camera, renderer,
// quality settings, and surrounding Helios scene remain fixed; only the background's real sector
// profile changes. This gives matched composition evidence without mutating world/simulation data.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 41731);
assert.ok(Number.isInteger(PORT) && PORT >= 41731 && PORT <= 41739,
  `background capture port must be in 41731-41739, got ${PORT}`);
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = path.resolve(ROOT, process.env.SF_BACKGROUND_CAPTURE_DIR || '.devshots/graphics/background-authored');
const TAG = process.env.SF_BACKGROUND_CAPTURE_TAG || 'candidate';

function systemBrowser() {
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync) || null;
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`background capture server did not become ready at ${BASE}`);
}

await mkdir(OUT, { recursive: true });
const server = spawn(process.execPath, ['server.js', String(PORT)], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let serverStderr = '';
server.stderr.on('data', (chunk) => { serverStderr += String(chunk); });

const { chromium } = await loadPlaywright();
let browser = null;
let context = null;
let page = null;
let video = null;
const pageErrors = [];
try {
  await waitForServer();
  browser = await chromium.launch({
    headless: true,
    executablePath: systemBrowser(),
    args: ['--ignore-gpu-blocklist', '--enable-webgl'],
  });
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  });
  page = await context.newPage();
  video = page.video();
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  await page.addInitScript(() => sessionStorage.setItem('sf.cinematicSeen', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert.equal(new URL(page.url()).search, '', 'background proof must use the canonical route');
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry), null,
    { timeout: 45_000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Authored Deep Field Capture', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    return state?.mode === 'flight' && player?.mesh && state?.render?.spaceBg;
  }, null, { timeout: 120_000 });
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    if (player?.vel?.set) player.vel.set(0, 0, 0);
    else if (player?.vel) { player.vel.x = 0; player.vel.z = 0; }
    state.camera.zoom = 92;
    window.SF.bus.emit('camera:zoom', { level: 92 });
    state.render.cameraCtrl?.snapToPlayer?.();
  });
  await page.waitForTimeout(500);

  const scenarios = [
    ['helios-orbital-void', 'sector_helios_prime'],
    ['ceres-broken-dust-lane', 'sector_ceres_belt'],
    ['pallas-tidal-filament', 'sector_pallas_drift'],
    ['veil-electromagnetic-scar', 'sector_veil_nebula'],
  ];
  const captures = [];
  for (const [scenario, sectorId] of scenarios) {
    const receipt = await page.evaluate(async ({ sectorId }) => {
      const [{ SECTORS }, profiles] = await Promise.all([
        import('/src/data/sectors.js'),
        import('/src/data/sectorVisualProfiles.js'),
      ]);
      const sector = SECTORS.find((entry) => entry.id === sectorId);
      if (!sector) throw new Error(`unknown capture sector ${sectorId}`);
      const profile = profiles.resolveSectorVisualProfile(sector);
      const bg = window.SF.state.render.spaceBg;
      // Capture-only component switch: no world entities, simulation state, UI, light rig, bloom,
      // grading, or post settings are changed. The renderer still draws the canonical game route.
      bg._sectorId = null;
      bg.onSectorEnter(sector, profile);
      bg.update(1 / 60, bg.bgTime + 1 / 60, window.SF.state.camera.focus || { x: 0, z: 0 });
      return {
        sectorId,
        profileId: profile.id,
        structure: profile.background.structure,
        stats: bg.stats(),
        postPath: window.SF.state.render.getPostDiagnostics?.()?.activePath || null,
        mode: window.SF.state.mode,
        route: `${location.pathname}${location.search}`,
      };
    }, { sectorId });
    await page.waitForTimeout(450);
    const file = path.join(OUT, `${TAG}-${scenario}.png`);
    await page.screenshot({ path: file });
    captures.push({
      scenario,
      file: path.relative(ROOT, file).replaceAll('\\', '/'),
      sha256: await sha256(file),
      bytes: (await readFile(file)).length,
      ...receipt,
    });
  }

  // Motion/parallax proof in the fringe composition. Restore that exact profile after the matched
  // still sequence (which ends in Veil); only normal keyboard flight input is used after this.
  await page.evaluate(async () => {
    const [{ SECTORS }, profiles] = await Promise.all([
      import('/src/data/sectors.js'),
      import('/src/data/sectorVisualProfiles.js'),
    ]);
    const sector = SECTORS.find((entry) => entry.id === 'sector_pallas_drift');
    const bg = window.SF.state.render.spaceBg;
    bg._sectorId = null;
    bg.onSectorEnter(sector, profiles.resolveSectorVisualProfile(sector));
  });
  await page.waitForTimeout(450);
  await page.keyboard.down('w');
  await page.waitForTimeout(2600);
  await page.keyboard.up('w');
  await page.waitForTimeout(500);
  const motionEnd = path.join(OUT, `${TAG}-pallas-motion-end.png`);
  await page.screenshot({ path: motionEnd });
  const motionReceipt = await page.evaluate(() => ({
    background: window.SF.state.render.spaceBg.stats(),
    diagnostics: window.__THREE_GAME_DIAGNOSTICS__?.getReport?.() || null,
    playerSpeed: (() => {
      const player = window.SF.state.entities.get(window.SF.state.playerId);
      return Math.hypot(player?.vel?.x || 0, player?.vel?.z || 0);
    })(),
  }));

  await page.close();
  page = null;
  await context.close();
  context = null;
  const rawVideo = video ? await video.path() : null;
  const motionVideo = path.join(OUT, `${TAG}-pallas-parallax.webm`);
  const rawVideoArchive = path.join(OUT, `${TAG}-raw-session.webm`);
  if (rawVideo && path.resolve(rawVideo) !== path.resolve(rawVideoArchive)) await rename(rawVideo, rawVideoArchive);
  // Playwright records from browser creation, so trim to the final normal-input flight segment.
  // This makes the motion artifact reviewable instead of burying parallax under thirty seconds of boot.
  const trim = spawnSync('ffmpeg', [
    '-y', '-sseof', '-5.5', '-i', rawVideoArchive,
    '-an', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8',
    '-b:v', '0', '-crf', '34', motionVideo,
  ], { cwd: ROOT, windowsHide: true, encoding: 'utf8' });
  assert.equal(trim.status, 0, `ffmpeg motion trim failed: ${trim.stderr || trim.stdout}`);

  const report = {
    schema: 'spaceface.authoredDeepFieldCapture.v1',
    tag: TAG,
    route: BASE,
    canonicalRoute: true,
    viewport: [1440, 900],
    captures,
    motion: {
      video: path.relative(ROOT, motionVideo).replaceAll('\\', '/'),
      videoSha256: await sha256(motionVideo),
      rawSessionVideo: path.relative(ROOT, rawVideoArchive).replaceAll('\\', '/'),
      endFrame: path.relative(ROOT, motionEnd).replaceAll('\\', '/'),
      endFrameSha256: await sha256(motionEnd),
      ...motionReceipt,
    },
    pageErrors,
  };
  const reportPath = path.join(OUT, `${TAG}-report.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (page) await page.close().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (!server.killed) server.kill();
  if (serverStderr.trim()) process.stderr.write(serverStderr);
}
