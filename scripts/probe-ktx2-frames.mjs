#!/usr/bin/env node
// DEMO-BOOT-2 frame-pair capture: for each world-texture surface a player meets on the
// ordinary route, shoot the same composed frame with the KTX2 transcode path ON and with
// the shipped `worldKtx2` rfx switch OFF (?rfx=-worldKtx2 — the same switch a harness or
// player flips). Pairs land in .devshots/demo/ktx2/<name>-{on,off}.png for eyeball diffing.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-ktx2-frames.mjs
//
// Scenes (ordinary player route, no debug affordances):
//   sky    helios_core arrival — the amber-estuary accent plate over the orbital-void base sky
//   planet same Helios arrival, clipped to the signatureHero ringed giant (screenNdc 0.58,0.32)
//   rocks  sector_ceres_belt aimed into the dense_asteroid pocket at local (600,-400)
//
// The .ktx2 fetch census per shot is printed so the OFF pair provably never asked for one.
import { chromium as rawChromium } from 'playwright';
import { quietChromium } from './lib/quietLaunch.mjs';
const chromium = quietChromium(rawChromium);
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = 8177;
const OUT_DIR = resolve(ROOT, '.devshots/demo/ktx2');
const SETTLE_MS = 6000;
const VIEWPORT = { width: 1280, height: 720 };

const SCENES = [
  { name: 'sky', sectorId: 'helios_core', aim: null, clip: null },
  {
    // signatureHero screenNdc [0.58, 0.32] -> px (~1011, ~245); clip keeps the whole disc.
    name: 'planet', sectorId: 'helios_core', aim: null,
    clip: { x: 760, y: 0, width: 500, height: 500 },
  },
  { name: 'rocks', sectorId: 'sector_ceres_belt', aim: { x: 600, z: -400 }, clip: null },
];
const MODES = [
  { name: 'on', rfx: null },
  { name: 'off', rfx: '-worldKtx2' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(OUT_DIR, { recursive: true });

const server = spawn(process.execPath, ['server.js', String(PORT)], {
  cwd: ROOT,
  stdio: 'ignore',
});
let browser = null;
const report = [];

try {
  await sleep(2500);
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });

  for (const scene of SCENES) {
    for (const mode of MODES) {
      const tag = `${scene.name}-${mode.name}`;
      const page = await browser.newPage({ viewport: VIEWPORT });
      const ktx2Fetches = [];
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 200)));
      page.on('request', (req) => {
        const url = req.url();
        // Only the world-texture siblings count — hashed GLB-embedded ship KTX2s are a
        // different feature and correctly keep fetching with worldKtx2 off.
        if (/\.(png|jpe?g)\.ktx2(\?|$)/i.test(url)) ktx2Fetches.push(url.split('/').pop());
      });
      await page.addInitScript(() => {
        try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
      });

      const rfxQuery = mode.rfx ? `&rfx=${encodeURIComponent(mode.rfx)}` : '';
      const url = `http://127.0.0.1:${PORT}/?sector=${encodeURIComponent(scene.sectorId)}&shot=1${rfxQuery}`;
      await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });

      const splash = page.locator('#cinematic-splash');
      if (await splash.count().catch(() => 0)) {
        await splash.click({ timeout: 4000 }).catch(() => {});
        await page.waitForSelector('#cinematic-splash', { state: 'detached', timeout: 6000 }).catch(() => {});
      }

      const deadline = Date.now() + 180_000;
      let ready = false;
      while (!ready && Date.now() < deadline) {
        const ok = page.locator('.sf-confirm__ok');
        if (await ok.first().isVisible().catch(() => false)) {
          await ok.first().click().catch(() => {});
          await page.waitForSelector('.sf-confirm', { state: 'detached', timeout: 4000 }).catch(() => {});
        }
        ready = await page.evaluate(() => window.__sfShotReady === true).catch(() => false);
        if (!ready) await page.waitForTimeout(1000);
      }
      if (!ready) throw new Error(`${tag}: sector ${scene.sectorId} never became ready`);

      // The deep-sky residencies promote behind a frame-budget admission gate — and the
      // KTX2 path starts its decode later than the raster path by design. "Ready" for a
      // fair on/off frame means the plate is actually UPLOADED, not just requested.
      await page.waitForFunction(() => {
        const bg = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.spaceBg;
        if (!bg || !bg.deepSkyPlates) return true; // no residency handle — don't block
        return !!bg.deepSkyPlates.readyId;
      }, null, { timeout: 90_000 }).catch(() => {});

      if (scene.aim) {
        const origin = sectorGlobalOrigin(scene.sectorId);
        const global = { x: scene.aim.x + origin.x, z: scene.aim.z + origin.z };
        const placePlayer = () => page.evaluate(async ({ globalPos: g }) => {
          const sf = window.SF || {};
          const world = sf.registry && sf.registry.get('world');
          const state = sf.state;
          if (!world || typeof world.relocatePlayerInSector !== 'function' || !state) {
            return { ok: false, error: 'window.SF world/state unavailable' };
          }
          const result = world.relocatePlayerInSector({ x: g.x, z: g.z }, { reason: 'ktx2-frames-aim' });
          if (result && typeof result.then === 'function') await result;
          const player = state.entities && state.entities.get(state.playerId);
          if (!player || !player.pos) return { ok: false, error: 'player entity missing' };
          return { ok: Math.hypot(player.pos.x - g.x, player.pos.z - g.z) < 64 };
        }, { globalPos: global });
        const placed = await placePlayer();
        if (!placed.ok) throw new Error(`${tag}: aim failed ${JSON.stringify(placed)}`);
        // Field-rock materialization follows the presented player — hold the aim while
        // the pocket streams in so the frame shows the close field, not the drift path.
        const pinUntil = Date.now() + SETTLE_MS;
        while (Date.now() < pinUntil) {
          await page.waitForTimeout(700);
          if (Date.now() >= pinUntil) break;
          await placePlayer().catch(() => {});
        }
      } else {
        await page.waitForTimeout(SETTLE_MS + 6000); // plate strength ramps in after promote
      }

      const shotPath = join(OUT_DIR, `${tag}.png`);
      await page.screenshot({ path: shotPath, ...(scene.clip ? { clip: scene.clip } : {}) });
      report.push({ tag, shotPath, ktx2Fetches: ktx2Fetches.length, pageErrors });
      console.log(`[ktx2-frames] ${tag}: ${shotPath} (.ktx2 fetches: ${ktx2Fetches.length}${ktx2Fetches.length ? ' ' + ktx2Fetches.slice(0, 4).join(',') + (ktx2Fetches.length > 4 ? '…' : '') : ''}, pageErrors: ${pageErrors.length})`);
      if (pageErrors.length) console.log(`[ktx2-frames]   errors: ${JSON.stringify(pageErrors)}`);
      await page.close();
    }
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}

const bad = report.filter((r) => (r.tag.endsWith('-off') && r.ktx2Fetches !== 0) || r.pageErrors.length);
console.log(`[ktx2-frames] done: ${report.length} frames -> ${OUT_DIR}`);
if (bad.length) {
  console.log(`[ktx2-frames] WARNINGS: ${JSON.stringify(bad.map((b) => ({ tag: b.tag, fetches: b.ktx2Fetches, errors: b.pageErrors.length })))}`);
  process.exitCode = 1;
}
// Hard-exit: browser/server teardown can leave live handles that hold the game lock.
process.exit(process.exitCode || 0);
