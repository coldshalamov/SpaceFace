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
import {
  anvilGlobalCenter,
  HAZARD_BY_SECTOR,
  LANDMARK_BY_SECTOR,
  planetAnchorStandoffWU,
  planetLandmarkStandoffWU,
  WAY_OF_LIFE_SIX,
} from './lib/sectorAnchors.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const USAGE = `Usage: node scripts/capture-sector-identity.mjs [--sectors=<comma list|six>] [--anchor=station|hazard|landmark]

  --sectors   default sector_helios_prime,sector_ceres_belt; 'six' expands to the six
              PQ-153 way-of-life sectors.
  --anchor    station (default): park at each sector's first non-gate station — unchanged
              two-sector capture into .devshots/sector-identity/.
              hazard:  park at the authored physical situation that names the sector
              (Helios authors none and falls back to its station).
              landmark: park at each sector's canon depth hero landmark (scripts/lib/
              sectorAnchors.mjs) and also write frame_ship144.jpg at the shipping 144 WU
              zoom, the composition the PQ-153.02 done-when reviews.
              hazard/landmark write .devshots/sector-identity-<anchor>/.
  --help      this text.
`;

const ARGV = process.argv.slice(2);
if (ARGV.includes('--help') || ARGV.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
let sectorsArg = 'sector_helios_prime,sector_ceres_belt';
let ANCHOR = 'station';
for (const arg of ARGV) {
  if (arg.startsWith('--sectors=')) sectorsArg = arg.slice('--sectors='.length);
  else if (arg.startsWith('--anchor=')) ANCHOR = arg.slice('--anchor='.length);
  else {
    console.error(`unknown argument: ${arg}\n${USAGE}`);
    process.exit(2);
  }
}
assert.ok(['station', 'hazard', 'landmark'].includes(ANCHOR),
  `--anchor must be station|hazard|landmark, got ${ANCHOR}`);
const SECTORS = sectorsArg === 'six'
  ? [...WAY_OF_LIFE_SIX]
  : sectorsArg.split(',').map((id) => id.trim()).filter(Boolean);
assert.ok(SECTORS.length > 0, '--sectors produced an empty list');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots',
  ANCHOR === 'station' ? 'sector-identity' : `sector-identity-${ANCHOR}`);
const FRAMES = 30;
const SECONDS_PER_FRAME = 1;
const SEED = 4242;
// One wheel-out from the 144 WU default. Wide enough that the station, its dock traffic and the
// pocket's working cluster are all in the same frame — which is the thing being judged.
const ZOOM_WU = 340;

/**
 * Per-sector anchor spec, resolved in node from the shared canon tables
 * (scripts/lib/sectorAnchors.mjs) and handed to the page, which resolves the LIVE position the
 * way the PQ-153 census tests do (sectorContents POIs, worldSite entities, state.planet).
 */
function anchorSpecFor(sectorId) {
  if (ANCHOR === 'station') return { kind: 'station' };
  if (ANCHOR === 'landmark') {
    const row = LANDMARK_BY_SECTOR.get(sectorId);
    assert.ok(row, `no canon landmark row for ${sectorId} (scripts/lib/sectorAnchors.mjs)`);
    if (row.kind === 'planet') {
      return {
        kind: 'planet', refId: row.id, name: row.name,
        standoffWU: planetLandmarkStandoffWU(), fallbackCenter: anvilGlobalCenter(),
      };
    }
    return {
      kind: row.kind, refId: row.id, name: row.name,
      parkOffsetWU: row.parkOffsetWU || null, parkSide: row.parkSide || null,
    };
  }
  const row = HAZARD_BY_SECTOR.get(sectorId);
  assert.ok(row, `no hazard anchor row for ${sectorId} (scripts/lib/sectorAnchors.mjs)`);
  if (row.kind === 'station') return { kind: 'station', name: row.name, fallback: true };
  if (row.kind === 'planet') {
    return {
      kind: 'planet', refId: row.id, name: row.name,
      standoffWU: planetAnchorStandoffWU(), fallbackCenter: anvilGlobalCenter(),
    };
  }
  if (row.kind === 'worldSite') return { kind: 'worldSite', refId: row.id, name: row.name };
  return {
    kind: row.kind, refId: row.id, name: row.name,
    center: row.center, dir: row.dir, extentWU: row.extentWU,
  };
}

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
// Station mode keeps the manifest byte-shape it has always had; other modes say which anchor
// drove the run so the receipt cannot be misread as a station capture.
if (ANCHOR !== 'station') report.anchorMode = ANCHOR;

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 45_000 });

  // THE SEED, and why the old way silently did not work. Writing `state.meta.seed` at the title
  // screen pins nothing: `resetRunState` (src/main.js) throws that state away and builds a fresh one
  // from `opts.seed`, falling back to the wall clock. Measured 2026-09-12: this capture asked for
  // 4242 and the run adopted 737605143, and the manifest — to its credit — said so. The seed is a
  // real player control on the New Game screen ("Universe seed"), so the capture types it in like a
  // player and the run is genuinely reproducible.
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.fill('#sf-ng-seed', String(SEED));
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  // This box is shared with other build lanes; boot-to-flight has measured past 120 s under
  // their load spikes (2026-09-26). Generous caps cost nothing on a quiet machine.
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 420_000 });
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return player?.presentationAdmission === 'ready';
  }, null, { timeout: 420_000 });

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

  let landmarkAdmitted = null;
  for (const sectorId of SECTORS) {
    const dir = path.join(OUT, sectorId);
    await mkdir(dir, { recursive: true });

    const spec = anchorSpecFor(sectorId);
    const anchor = await page.evaluate(({ id, CAPTURE_ZOOM, spec, zoomNow }) => {
      const SF = window.SF;
      const state = SF.state;
      const world = SF.registry.get('world');
      if (!world) throw new Error('world system not registered on the live route');
      if (state.world.currentSectorId !== id) world.enterSector(id);

      const alive = () => (state.entityList || []).filter((e) => e && e.alive !== false);
      const hullOf = (ent) => {
        const d = (ent && ent.data) || {};
        return Math.max(d.dockRadius || 0, d.collisionRadius || 0, (ent && ent.radius) || 0, 60);
      };

      let feature = null;
      let extent = 60;
      let standoff = 0;
      let park = null;
      let kindOut = spec.kind;
      let anchorName = spec.name || null;
      let stationId = null;

      if (spec.kind === 'station') {
        const stations = alive().filter((e) => e.type === 'station' && !(e.data && e.data.isGate)
          && (e.data && e.data.sectorId) === id);
        const preferred = id === 'sector_helios_prime' ? 'station_helios' : null;
        const chosen = (preferred && stations.find((s) => (s.data && s.data.stationId) === preferred))
          || stations[0];
        if (!chosen) throw new Error(`no non-gate station resident for ${id}`);
        stationId = (chosen.data && chosen.data.stationId) || String(chosen.id);
        anchorName = anchorName || stationId;
        feature = { x: chosen.pos.x, z: chosen.pos.z };
        extent = hullOf(chosen);
        // WHERE THE SHIP PARKS, AND WHY IT IS NOT WHERE THE BENCH COUNTS.
        // The chase rig is a TILTED TOP-DOWN camera that follows the player's POSITION ONLY and
        // never its yaw (`src/render/camera.js`), so pointing the ship at the station cannot bring
        // the station into frame — only standing near it can. The first capture parked at the
        // bench's 750 WU-pocket standoff (hull + 90), which put the station and its whole work
        // cluster outside the ~100 WU bubble the camera can actually show: both strips came back
        // as fields of rock that differed only by COLOUR, which is the one thing design/VISION.md
        // Part II forbids identity from resting on. The margin is therefore the smallest that
        // still clears the station's own declared radii, and the offset is along -z so the
        // station sits up-screen rather than off the side.
        standoff = extent + 40;
        park = { x: feature.x, z: feature.z - standoff };
      } else if (spec.kind === 'poi') {
        const bag = (state.world.sectorContents || {})[id];
        const entry = ((bag && bag.pois) || []).find((row) => row && row.poiId === spec.refId);
        if (!entry || !entry.pos) throw new Error(`landmark poi ${spec.refId} not resident in ${id}`);
        const ent = entry.id != null ? state.entities.get(entry.id) : null;
        feature = { x: entry.pos.x, z: entry.pos.z };
        extent = ent ? hullOf(ent) : 60;
        standoff = extent + 40;
        park = spec.parkOffsetWU
          ? { x: feature.x + spec.parkOffsetWU.x, z: feature.z + spec.parkOffsetWU.z }
          : { x: feature.x, z: feature.z + (spec.parkSide === 'north' ? standoff : -standoff) };
      } else if (spec.kind === 'worldSite') {
        const ent = alive().find((e) => e.data && e.data.worldSiteId === spec.refId);
        if (!ent) throw new Error(`world site ${spec.refId} not resident in ${id}`);
        feature = { x: ent.pos.x, z: ent.pos.z };
        extent = hullOf(ent);
        standoff = extent + 40;
        park = spec.parkOffsetWU
          ? { x: feature.x + spec.parkOffsetWU.x, z: feature.z + spec.parkOffsetWU.z }
          : { x: feature.x, z: feature.z + (spec.parkSide === 'north' ? standoff : -standoff) };
      } else if (spec.kind === 'planet') {
        const p = state.planet;
        const live = !!(p && p.active === true && p.zoneId === spec.refId && p.center);
        feature = live ? { x: p.center.x, z: p.center.z } : { ...spec.fallbackCenter };
        if (!live) kindOut = 'planet_zoneFallback';
        // Outside the pull's influence edge: every radius inside it either drags the hull
        // mid-capture (the well is live on the real route) or sits in a heat band.
        standoff = spec.standoffWU;
        park = { x: feature.x, z: feature.z - standoff };
      } else if (spec.kind === 'featureEdge') {
        // Extended hazard volumes/zones: park on the feature's own staging edge,
        // center + dir*(extent + 96) — the Cinder Sluice's authored traffic idiom, never
        // inside the volume and clear of the collider caveat in this file's header.
        feature = { x: spec.center.x, z: spec.center.z };
        const d = spec.dir || { x: 0, z: -1 };
        standoff = spec.extentWU + 96;
        park = { x: feature.x + d.x * standoff, z: feature.z + d.z * standoff };
      } else {
        throw new Error(`unknown anchor kind ${spec.kind}`);
      }

      // Clearance: the parking spot must not sit on a live hull (this file's header explains
      // the 2.5M-WU depenetration throw). Only PHYSICAL bodies can depenetrate — dressing
      // rows, site markers and other collides:false actors render but cannot throw, and
      // treating them as obstacles once forced the Ceres park 400 WU off the wreck's hull.
      // Rotate the same standoff around the feature until clear of what can actually hit.
      const player0 = state.entities.get(state.playerId);
      const pr = (player0 && player0.radius) || 8;
      const blockedBy = (p) => alive().find((e) => e !== player0 && e.collides === true && e.pos
        && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) <= (e.radius || 8) + pr + 24);
      if (blockedBy(park)) {
        const radius = Math.hypot(park.x - feature.x, park.z - feature.z);
        const base = Math.atan2(park.z - feature.z, park.x - feature.x);
        for (const dAng of [Math.PI / 9, -Math.PI / 9, Math.PI / 4, -Math.PI / 4,
          Math.PI / 2, -Math.PI / 2, Math.PI]) {
          const candidate = {
            x: feature.x + Math.cos(base + dAng) * radius,
            z: feature.z + Math.sin(base + dAng) * radius,
          };
          if (!blockedBy(candidate)) { park = candidate; break; }
        }
      }

      world.relocatePlayerInSector(park, { reason: `capture:sector_identity_${spec.kind}` });
      const player = state.entities.get(state.playerId);
      player.vel.x = 0;
      player.vel.z = 0;
      // AND THEN THE PLAYER SCROLLS OUT, because at the 144 WU default the pocket is not in the
      // picture. Measured 2026-09-12 at Helios: standing at hull+40 the station sat ON the top edge
      // and the frame's whole content was a planet and a galaxy — a reviewer could only have named
      // the place from the sky, which is exactly the identity `design/VISION.md` Part II forbids.
      // `camera:zoom` is the mouse wheel's own event (src/ui/input.js:657), so this is a player
      // action and the rig is still the shipping chase camera. Landmark mode instead holds the
      // shipping zoom through the settle — and must NOT re-emit the wheel event for it: the
      // shipping level is already the boot default, and re-emitting it resets the camera's zoom
      // transition state, after which a nearby landmark's authored-upgrade runway check denies its
      // streamed body for minutes (isolation probe 2026-09-26: park + HUD-hide admits at ~t45s;
      // the same sequence plus the redundant zoom emit never admits).
      if (zoomNow) SF.bus.emit('camera:zoom', { level: CAPTURE_ZOOM });

      if (spec.kind === 'station' && spec.fallback !== true) {
        return {
          station: stationId,
          x: feature.x, z: feature.z, standoffWU: standoff, hullRadiusWU: extent,
        };
      }
      return {
        kind: kindOut,
        station: stationId,
        id: spec.refId || stationId,
        name: anchorName,
        fallback: spec.fallback === true,
        x: feature.x, z: feature.z,
        standoffWU: standoff, hullRadiusWU: extent,
        park: { x: park.x, z: park.z },
      };
    }, {
      id: sectorId, CAPTURE_ZOOM: ZOOM_WU, spec,
      zoomNow: ANCHOR !== 'landmark',
    });

    // Let the place become itself before the first frame: sector spawning, the first traffic
    // dispatch, the first job cycle — the same 24 s the measurement bench waits.
    const settleFrom = await page.evaluate(() => window.SF.state.simTime);
    await page.waitForFunction((t) => window.SF.state.simTime >= t + 24, settleFrom, { timeout: 300_000 });

    // PQ-153.02 round-3: landmark GLBs admit asynchronously (decode + pipeline compile measured
    // ~40 s from sector arrival on software GL). A player flying to a landmark minutes into a
    // sector always finds the authored body standing there; the strip must photograph that same
    // state, not the admission window — round 2 watched Ceres for 55 s and the cathedral
    // committed at ~t+40 s, so every frame showed the pre-admission substrate. Wait for the
    // anchor's authored body (capped; a stall degrades to what the game actually shows).
    // The predicate must match the SITE ROOT specifically — every hull component shares
    // worldSiteId and meshes transiently while the root is still decoding. And it must NOT be
    // followed by a re-seat teleport: relocatePlayerInSector shifts the floating origin out
    // here, re-posing every entity, and the root's position-keyed residency boundary strands —
    // round 4 re-seated and the wreck never admitted at all (probe without the re-seat: authored
    // and on screen at t≈40 s).
    if (ANCHOR === 'landmark' && (spec.kind === 'poi' || spec.kind === 'worldSite')) {
      // The result is surfaced, never swallowed silently: a timed-out admission means the
      // strip photographs the pre-admission substrate (round 8's empty frames), and the
      // summary line has to say so instead of failing a reviewer's patience next run.
      landmarkAdmitted = await page.waitForFunction(({ refId, kind }) => {
        const state = window.SF.state;
        const ent = [...(state.entityList || [])].find((e) => e && e.alive !== false && e.data
          && (kind === 'worldSite'
            ? (e.data.worldSiteId === refId && e.data.role === 'world_site_root')
            : e.data.poiId === refId));
        if (!ent) return false;
        const meshState = ent.mesh && ent.mesh.userData
          ? String(ent.mesh.userData.authoredAssetState || '')
          : '';
        return ent.presentationAdmission === 'ready' || meshState === 'authored';
      }, { refId: spec.refId, kind: spec.kind }, { timeout: 420_000 })
        .then((handle) => !!handle)
        .catch(() => false);
    }

    // PQ-153.02's done-when is "screenshot composition checked at the shipping camera": landmark
    // mode banks one frame at the untouched 144 WU zoom BEFORE the wheel-out, then zooms like the
    // other modes.
    let ship144 = null;
    if (ANCHOR === 'landmark') {
      const shot = await page.screenshot({ type: 'jpeg', quality: 90 });
      const name = 'frame_ship144.jpg';
      await writeFile(path.join(dir, name), shot);
      ship144 = { name, simTime: await page.evaluate(() => window.SF.state.simTime), sha256: sha256(shot), bytes: shot.length };
      await page.evaluate((zoom) => window.SF.bus.emit('camera:zoom', { level: zoom }), ZOOM_WU);
      const zoomAt = await page.evaluate(() => window.SF.state.simTime);
      await page.waitForFunction((t) => window.SF.state.simTime >= t + 1, zoomAt, { timeout: 60_000 });
    }

    const wallStart = Date.now();
    const frames = [];
    const t0 = await page.evaluate(() => window.SF.state.simTime);
    for (let i = 0; i < FRAMES; i += 1) {
      const target = t0 + (i * SECONDS_PER_FRAME);
      await page.waitForFunction((t) => window.SF.state.simTime >= t, target, { timeout: 300_000 });
      const shot = await page.screenshot({ type: 'jpeg', quality: 90 });
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
      // Did the ship actually stay where it was parked? A depenetration blow-out is silent in the
      // frames and would make the whole strip a picture of empty space. Non-station anchors carry
      // the real parking spot in `park`; station anchors keep the legacy z-standoff derivation.
      const intended = anchorIn.park
        || { x: anchorIn.x, z: anchorIn.z - anchorIn.standoffWU };
      return {
        parkedAtIntended: Math.hypot(player.pos.x - intended.x, player.pos.z - intended.z) < 25,
        playerPos: { x: Math.round(player.pos.x), z: Math.round(player.pos.z) },
        withinPocket750: at(750),
        onCamera110: at(110),
        // What the WIDER frame can actually hold. `onCamera110` was written for the 144 WU default
        // and reports zero for a strip that plainly contains a station.
        onCamera340: at(340),
        jobsOnCamera340: (state.entityList || []).filter((e) => e && e.alive !== false
          && e.id !== state.playerId
          && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) <= 340
          && e.data && (e.data.npcJobId || e.data.jobKind || e.data.trafficRole || e.data.activityActorSlotId))
          .map((e) => ({
            type: e.type,
            job: (e.data.jobKind || e.data.trafficRole || e.data.activityActorSlotId || null),
            def: e.data.defId || null,
          })),
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
    if (ship144) report.sectors[sectorId].ship144 = ship144;
    if (ANCHOR === 'landmark' && (spec.kind === 'poi' || spec.kind === 'worldSite')) {
      report.sectors[sectorId].landmarkAdmitted = landmarkAdmitted;
    }
    const anchorLabel = anchor.station || anchor.name || anchor.id || anchor.kind;
    console.log(`[sector-identity] ${sectorId}: ${frames.length} frames over `
      + `${frames.length * SECONDS_PER_FRAME}s sim (${(wallMs / 1000).toFixed(1)}s wall) `
      + `at ${anchorLabel} +${anchor.standoffWU}WU; parked=${census.parkedAtIntended}; ${census.onCamera110.count} on camera, ${census.withinPocket750.count} in the pocket`
      + (ANCHOR === 'landmark' && (spec.kind === 'poi' || spec.kind === 'worldSite')
        ? `; landmarkAdmitted=${landmarkAdmitted === true ? 'yes' : 'NO — frames show the pre-admission substrate'}`
        : ''));
  }

  report.pageErrors = pageErrors;
  await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[sector-identity] manifest -> ${path.relative(ROOT, path.join(OUT, 'manifest.json'))}`);
  if (pageErrors.length) console.warn(`[sector-identity] ${pageErrors.length} page error(s) recorded in the manifest`);
} finally {
  // Bounded shutdown: the manifest is already the durable product, and on a contended host the
  // headed browser's close can hang. Kill the child rather than hold the process open — and call
  // the handle the probe server actually exposes (close, not release).
  const force = setTimeout(() => { try { browser.process()?.kill('SIGKILL'); } catch { /* gone */ } }, 20_000);
  force.unref();
  await browser.close().catch(() => {});
  clearTimeout(force);
  try { server.server?.closeAllConnections?.(); } catch { /* best effort */ }
  await (server.close ? server.close() : server.release?.()).catch(() => {});
}
