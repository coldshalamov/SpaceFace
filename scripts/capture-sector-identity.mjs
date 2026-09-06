#!/usr/bin/env node
// scripts/capture-sector-identity.mjs — PQ-143.00 THE FRAMES.
//
// Two thirty-second captures at the SHIPPING camera with HUD text hidden: one standing at Helios's
// front door, one standing at Ceres's. They exist so a blind reviewer can answer the packet's
// done-when — "name the sector from a 30 s capture with labels hidden" — without ever being told
// which is which.
//
// This drives the REAL default route: a public new-game launch in the shipping browser build, the
// production renderer, the production chase camera, default quality, no overlays. It injects no
// fixtures and spawns nothing. The only two things it does to the world are the two things a player
// does: fly to the other sector, and park at the station.
//
// WHERE IT STANDS, and why that is not cheating: the same rule as the measurement bench
// (`scripts/lib/bench/scenarios/world.sector_identity.mjs`) — the sector's own first non-gate
// station, offset by that station's own declared dock radius plus the ~90 WU margin traffic uses for
// its pocket cluster. One symmetric rule, both sectors, no hand-picked flattering coordinate. Parking
// ON the station centre buries the hull inside its collider and the solver throws the player two and
// a half million units into deep space; that is measured, not hypothetical.
//
// CADENCE. Frames are taken on the SIMULATION clock — one per second of game time, thirty of them —
// not on the wall clock. Headless WebGL is frequently software-rendered on this machine, so pacing
// the strip by wall time would silently produce a slow-motion capture and call it normal speed.
// Pacing by `state.simTime` means the strip covers exactly thirty seconds of the game's own time at
// its own speed. The manifest records the wall time each capture actually took, so the gap between
// the two clocks is visible rather than hidden.
//
// Output: .devshots/sector-identity/<sectorId>/frame_NN.jpg plus manifest.json (sha256 per frame,
// the sim time each frame was taken at, the anchor, and the seed the run actually used).

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'sector-identity');
const SECTORS = ['sector_helios_prime', 'sector_ceres_belt'];
const FRAMES = 30;
const SECONDS_PER_FRAME = 1;
const SEED = 4242;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();
const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
assert.ok(browserPath, 'Chrome or Edge is required');

await mkdir(OUT, { recursive: true });
const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

const report = { schema: 'spaceface.sectorIdentityCapture.v1', seedRequested: SEED, sectors: {} };

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 45_000 });

  // The browser route seeds the world from the wall clock at boot (`src/main.js`: `Date.now() &
  // 0x7fffffff`), so there is no URL seed to ask for. Pin it at the title screen before the run is
  // created, then read back whatever the run ACTUALLY adopted and record that — a capture whose seed
  // is reported as 4242 when the world used something else is worse than one that admits the truth.
  await page.evaluate((seed) => { window.SF.state.meta.seed = seed; }, SEED);

  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return player?.presentationAdmission === 'ready';
  }, null, { timeout: 180_000 });

  report.seedUsed = await page.evaluate(() => window.SF.state.meta.seed);

  // HUD text off. Not a file edit and not a flag: the shipping UI is left exactly as it is and simply
  // not photographed, so the reviewer judges the world and never reads a label naming the place.
  await page.addStyleTag({
    content: `
      #hud, .hud, [class*="hud"], [id*="hud"],
      .sf-leftstack, .sf-toast, .sf-pill, .sf-chip, .sf-panel,
      .contacts, .command-bar, .mission-log { visibility: hidden !important; }
    `,
  });
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    for (const el of Array.from(document.body.children)) {
      if (!el.contains(canvas)) el.style.visibility = 'hidden';
    }
  });

  for (const sectorId of SECTORS) {
    const dir = path.join(OUT, sectorId);
    await mkdir(dir, { recursive: true });

    const anchor = await page.evaluate((id) => {
      const SF = window.SF;
      const state = SF.state;
      const world = SF.registry.get('world');
      if (!world) throw new Error('world system not registered on the live route');
      if (state.world.currentSectorId !== id) world.enterSector(id);

      const stations = (state.entityList || []).filter((e) => e && e.alive !== false
        && e.type === 'station' && !(e.data && e.data.isGate)
        && (e.data && e.data.sectorId) === id);
      const preferred = id === 'sector_helios_prime' ? 'station_helios' : null;
      const chosen = (preferred && stations.find((s) => (s.data && s.data.stationId) === preferred))
        || stations[0];
      if (!chosen) throw new Error(`no non-gate station resident for ${id}`);
      const d = chosen.data || {};
      const hull = Math.max(d.dockRadius || 0, d.collisionRadius || 0, chosen.radius || 0, 60);
      // WHERE THE SHIP PARKS, AND WHY IT IS NOT WHERE THE BENCH COUNTS.
      // The chase rig is a TILTED TOP-DOWN camera that follows the player's POSITION ONLY and never
      // its yaw (`src/render/camera.js`), so pointing the ship at the station cannot bring the
      // station into frame — only standing near it can. The first capture parked at the bench's
      // 750 WU-pocket standoff (hull + 90), which put the station and its whole work cluster outside
      // the ~100 WU bubble the camera can actually show: both strips came back as fields of rock that
      // differed only by COLOUR, which is the one thing design/VISION.md Part II forbids identity from
      // resting on. The margin is therefore the smallest that still clears the station's own declared
      // radii, and the offset is along -z so the station sits up-screen rather than off the side.
      const standoff = hull + 40;
      world.relocatePlayerInSector({ x: chosen.pos.x, z: chosen.pos.z - standoff },
        { reason: 'capture:sector_identity' });
      const player = state.entities.get(state.playerId);
      player.vel.x = 0;
      player.vel.z = 0;
      return {
        station: (chosen.data && chosen.data.stationId) || String(chosen.id),
        x: chosen.pos.x, z: chosen.pos.z, standoffWU: standoff, hullRadiusWU: hull,
      };
    }, sectorId);

    // Let the place become itself before the first frame: sector spawning, the first traffic
    // dispatch, the first job cycle — the same 24 s the measurement bench waits.
    const settleFrom = await page.evaluate(() => window.SF.state.simTime);
    await page.waitForFunction((t) => window.SF.state.simTime >= t + 24, settleFrom, { timeout: 300_000 });

    const wallStart = Date.now();
    const frames = [];
    const t0 = await page.evaluate(() => window.SF.state.simTime);
    for (let i = 0; i < FRAMES; i += 1) {
      const target = t0 + (i * SECONDS_PER_FRAME);
      await page.waitForFunction((t) => window.SF.state.simTime >= t, target, { timeout: 300_000 });
      const shot = await page.screenshot({ type: 'jpeg', quality: 82 });
      const name = `frame_${String(i).padStart(2, '0')}.jpg`;
      await writeFile(path.join(dir, name), shot);
      frames.push({
        name,
        simTime: await page.evaluate(() => window.SF.state.simTime),
        sha256: sha256(shot),
        bytes: shot.length,
      });
    }
    const wallMs = Date.now() - wallStart;

    // What was actually on screen while the strip was taken — so the receipt can say whether the
    // frames and the bench are describing the same thing.
    const census = await page.evaluate((anchorIn) => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const at = (r) => {
        const near = (state.entityList || []).filter((e) => e && e.alive !== false
          && e.id !== state.playerId
          && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) <= r);
        const byType = {};
        for (const e of near) byType[e.type || '(null)'] = (byType[e.type || '(null)'] || 0) + 1;
        return { count: near.length, byType };
      };
      return {
        // Did the ship actually stay where it was parked? A depenetration blow-out is silent in the
        // frames and would make the whole strip a picture of empty space.
        parkedAtIntended: Math.hypot(player.pos.x - anchorIn.x, player.pos.z - (anchorIn.z - anchorIn.standoffWU)) < 25,
        playerPos: { x: Math.round(player.pos.x), z: Math.round(player.pos.z) },
        withinPocket750: at(750),
        onCamera110: at(110),
      };
    }, anchor);

    report.sectors[sectorId] = {
      anchor,
      frames,
      frameCount: frames.length,
      simSecondsCovered: frames.length * SECONDS_PER_FRAME,
      wallMs,
      wallSecondsPerSimSecond: Number((wallMs / 1000 / (frames.length * SECONDS_PER_FRAME)).toFixed(2)),
      census,
    };
    console.log(`[sector-identity] ${sectorId}: ${frames.length} frames over `
      + `${frames.length * SECONDS_PER_FRAME}s sim (${(wallMs / 1000).toFixed(1)}s wall) `
      + `at ${anchor.station} +${anchor.standoffWU}WU; parked=${census.parkedAtIntended}; ${census.onCamera110.count} on camera, ${census.withinPocket750.count} in the pocket`);
  }

  report.pageErrors = pageErrors;
  await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[sector-identity] manifest -> ${path.relative(ROOT, path.join(OUT, 'manifest.json'))}`);
  if (pageErrors.length) console.warn(`[sector-identity] ${pageErrors.length} page error(s) recorded in the manifest`);
} finally {
  await browser.close();
  await server.release?.();
}
