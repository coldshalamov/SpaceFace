#!/usr/bin/env node
// scripts/capture-terrain-lethality.mjs — PQ-137.06 THE FRAMES (the adventure-route driver).
//
// The B6 damage law is proven headless by `scripts/lib/bench/scenarios/feel.terrain_slam.mjs`
// (seed 4242, real Rapier, five clauses). What the leaf still owed was a picture: a light hull
// meeting rock at ≥ 75 % of its cruise and DYING, and a heavy meeting the same rock at the same
// absolute speed and shrugging it off, both seen through the shipping chase camera at default
// quality with no debug overlay.
//
// Why the Crucible strip harness cannot take that picture (recorded in PQ-137.06-REPORT.md): its
// only aim modes are `nearestHostile` and `nearestAsteroid`, so a tape can fire AT a rock but can
// never commit a hull INTO one. This driver is the adventure-route answer the receipt asked for.
//
// WHAT IT DOES TO THE WORLD, exactly, and nothing else:
//   1. Public new game at seed 4242 → flight, shipping renderer, default quality.
//   2. Parks the player beside a real authored asteroid of the live sector (the shipping
//      `world.relocatePlayerInSector` seam, never a `pos` write) so the rock is inside the ~110 WU
//      ring the chase camera can actually show.
//   3. Spawns ONE hostile hull at the start of a runway, facing the rock, and writes the same
//      `data.intent` throttle the bench writes. Its own drive and governor do the flying; the
//      closing speed is read off the hull, never written onto it. The AI is left passive so the
//      throttle is the experiment and not a fight.
//   4. Photographs the shipping camera on the SIMULATION clock through the crash.
//
// Frames land in .devshots/ (gitignored) and are a process artifact: look at them, write the
// verdict in words, delete them. `build_map.md` §1.3 law 2.
//
// Run: node scripts/capture-terrain-lethality.mjs [--case=light|heavy|both] [--headless]

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'terrain-lethality');
const SEED = 4242;

const argv = process.argv.slice(2);
const caseArg = (argv.find((a) => a.startsWith('--case=')) || '--case=both').split('=')[1];
const HEADLESS = argv.includes('--headless');
// HEAVY FIRST, deliberately. The light case ends in a cloud of debris around the rock, and a run
// that photographs the heavy afterwards photographs it grinding through the light's wreckage
// (measured: 60 `surface: debris` consequences and the rock never reached). The heavy leaves the
// rock as it found it, so the light can still have a clean approach to the same rock.
const CASES = caseArg === 'both' ? ['heavy', 'light'] : [caseArg];

// Mirrors feel.terrain_slam.mjs exactly: same hulls, same runway, same throttles.
const CASE_SPEC = Object.freeze({
  light: { hullId: 'ship_wasp', cruiseFrac: 0.76, label: 'light hull at 76 % of cruise' },
  heavy: { hullId: 'ship_atlas', matchLight: true, label: 'heavy hull at the same absolute speed' },
});
// The bench flies a 520 WU runway through an EMPTY focused world. This driver flies through a live
// sector, where 520 WU of straight line reliably clips something else first (measured: the first
// run reported 27 `surface: other` consequences and never reached the rock). Both hulls are at
// terminal governed speed inside ~1 s, so the runway only has to be long enough for that, and the
// corridor is checked clear before the run.
const RUNWAY_WU = 200;
const CORRIDOR_HALF_WIDTH_WU = 45;
// The chase rig follows position only and never yaw, so the rock has to be STOOD next to, not
// aimed at. 60 WU keeps rock + impact + the last stretch of the approach inside the ring.
const PLAYER_STANDOFF_WU = 60;
// One wheel-out from the 144 WU default (src/ui/input.js:657 emits the identical event). Still the
// shipping chase rig; nothing else about the camera is touched.
const CAPTURE_ZOOM_WU = 260;

const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
assert.ok(browserPath, 'Chrome or Edge is required');

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: HEADLESS,
  executablePath: browserPath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('console', (msg) => {
  if (msg.type() === 'error') pageErrors.push(`console: ${msg.text()}`);
});

const report = { schema: 'spaceface.terrainLethalityCapture.v1', seedRequested: SEED, cases: {} };
// The heavy is flown at the LIGHT case's absolute WU/s, never at 0.76 of its own cruise — the same
// rule test/terrain-slam.test.mjs pins. Measured light speed replaces this the moment it exists.
let lightAbsoluteSpeed = 79.8;
let pinnedRockId = null;

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 120_000 })
    .catch((error) => {
      console.error('[terrain-lethality] boot errors:');
      for (const line of pageErrors.slice(0, 8)) console.error(`  ${line}`);
      throw error;
    });

  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  // The seed is a real player control on the New Game screen ("Universe seed"), and it is the only
  // honest way to pin one: writing `state.meta.seed` at the title does nothing, because
  // `resetRunState` builds a fresh state from `opts.seed` and otherwise from the wall clock.
  await page.fill('#sf-ng-seed', String(SEED));
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 180_000 });
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return player?.presentationAdmission === 'ready';
  }, null, { timeout: 240_000 });
  report.seedUsed = await page.evaluate(() => window.SF.state.meta.seed);

  // HUD text off. Not a file edit and not a flag: the shipping UI is left exactly as it is and
  // simply not photographed, so the judgement is of the world — debris, the hull, the rock — and
  // never of a kill line in a log.
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

  // Let the opening settle before anything is photographed. At 7 s of sim the authored hulls are
  // still being admitted and the frames come back as empty space with a HUD on it — the first
  // version of this driver photographed exactly that and reported a crash nobody could see.
  {
    const t = await page.evaluate(() => window.SF.state.simTime);
    await page.waitForFunction((x) => window.SF.state.simTime >= x + 30, t, { timeout: 300_000 });
  }

  for (const caseId of CASES) {
    const spec = CASE_SPEC[caseId];
    assert.ok(spec, `unknown case ${caseId}`);
    const dir = path.join(OUT, caseId);
    await mkdir(dir, { recursive: true });

    const setup = await page.evaluate(async (input) => {
      const SF = window.SF;
      const state = SF.state;
      const world = SF.registry.get('world');
      const { makeShipEntitySpec, fittingsFromDefaultModules } = await import('/src/systems/ships.js');

      // Clean up a previous case's actors so the two shots never photograph each other.
      for (const e of [...(state.entityList || [])]) {
        if (e && e.data && e.data.__slamActor) e.alive = false;
      }

      const player = state.entities.get(state.playerId);
      // A REAL authored rock of the live sector. Nearest sizeable one to where the player already
      // is, so nothing is placed for the photograph.
      const all = (state.entityList || []).filter((e) => e && e.alive !== false
        && e.type === 'asteroid' && (e.radius || 0) >= 10);
      if (!all.length) throw new Error('no authored asteroid in the live sector');
      // Prefer a rock big enough to read as a wall at chase range, and one whose approach corridor
      // is empty, so the hull that dies dies on THE ROCK and not on whatever it clipped first.
      const corridorClear = (r) => {
        const x0 = r.pos.x - ((r.radius || 22) + input.runway + 20);
        for (const e of state.entityList || []) {
          if (!e || e.alive === false || e === r || e.id === state.playerId) continue;
          if (e.type === 'fx' || e.type === 'projectile') continue;
          if (e.pos.x < x0 - 40 || e.pos.x > r.pos.x) continue;
          if (Math.abs(e.pos.z - r.pos.z) > input.corridor) continue;
          return false;
        }
        return true;
      };
      const byDistance = (a, b) => (
        Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z)
        - Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z));
      const big = all.filter((e) => (e.radius || 0) >= 18).sort(byDistance);
      const pinned = input.pinnedRockId == null
        ? null
        : all.find((e) => e.id === input.pinnedRockId);
      const rock = pinned
        || big.find(corridorClear)
        || all.slice().sort(byDistance).find(corridorClear)
        || big[0] || all.sort(byDistance)[0];

      // The shipping relocation seam, not a pos write. Down-screen of the rock so the rock sits
      // up-screen in the chase frame.
      world.relocatePlayerInSector({ x: rock.pos.x, z: rock.pos.z + input.standoff },
        { reason: 'capture:terrain_lethality' });
      player.vel.x = 0;
      player.vel.z = 0;
      // The mouse wheel, not a debug camera: `camera:zoom` is the exact event `src/ui/input.js:657`
      // emits on scroll. At the 144 WU default the rock sits on the bottom edge and the crash falls
      // off the frame; one wheel-out puts the whole approach and the impact in the picture.
      SF.bus.emit('camera:zoom', { level: input.zoom });

      const hostile = SF.helpers.spawnEntity(makeShipEntitySpec(input.hullId, {
        team: 1,
        factionId: 'faction_reavers',
        fittings: fittingsFromDefaultModules(input.hullId, []),
        pos: { x: rock.pos.x - 200, z: rock.pos.z },
        rot: 0, // forward = +x, straight at the rock
        ai: { role: 'capture_terrain_slam', passive: true, roe: 'hold_fire' },
      }));
      hostile.data.__slamActor = true;
      // Passive keeps aiPorts out of the maneuver build (aiPorts.js:443), so the throttle below is
      // the only thing steering. Nothing here writes velocity, hull, or a transform after spawn.
      hostile.data.ai.allowPassiveManeuver = false;

      const rockRadius = Number(rock.radius) || 22;
      const shipRadius = Number(hostile.radius) || 14;
      const standoffX = rockRadius + shipRadius + input.runway;
      hostile.pos.x = rock.pos.x - standoffX;
      hostile.pos.z = rock.pos.z;
      if (hostile.prevPos) { hostile.prevPos.x = hostile.pos.x; hostile.prevPos.z = hostile.pos.z; }

      const derived = hostile.data && hostile.data.derived;
      const ownCruise = Number(derived && derived.propulsion && derived.propulsion.combatSpeed) || 0;
      if (!(ownCruise > 0)) throw new Error(`no combatSpeed on ${input.hullId}`);
      const commanded = input.matchAbsoluteSpeed > 0
        ? input.matchAbsoluteSpeed
        : ownCruise * input.cruiseFrac;
      const throttle = commanded / ownCruise;

      const intent = hostile.data.intent || (hostile.data.intent = {});
      intent.moveX = 0;
      intent.moveZ = 0; // armed only once the hull is actually drawn (see `armed` below)
      intent.turnIntent = 0;
      intent.boost = false;
      intent.brake = false;
      intent.fire = false;
      intent.fireGroup = null;

      // Hold the throttle across frames without racing the sim: one rAF re-write of the same
      // constant, so a stray writer cannot silently end the experiment mid-runway.
      window.__slam = {
        hostileId: hostile.id,
        rockId: rock.id,
        throttle,
        impacts: [],
        consequences: [],
        killed: null,
        tumbledEvents: 0,
        armed: false,
        peakSpeed: 0,
        speedAtContact: null,
      };
      const hold = () => {
        const h = state.entities.get(hostile.id);
        if (!h || h.alive === false) return;
        const it = h.data.intent || (h.data.intent = {});
        it.moveX = 0;
        // THE RELEASE GATE. A hull spawned and thrown at a rock in the same three seconds is not
        // drawn yet — the first frames of this driver photographed an invisible crash, because the
        // visual factory had not admitted the body. Nothing moves until the renderer says the hull
        // is on screen, and only the release moment is deferred: the throttle itself is unchanged.
        it.moveZ = window.__slam.armed ? throttle : 0;
        it.turnIntent = 0;
        it.brake = false; it.boost = false; it.fire = false;
        const sp = Math.hypot(h.vel?.x || 0, h.vel?.z || 0);
        if (sp > window.__slam.peakSpeed) window.__slam.peakSpeed = sp;
        if (window.__slam.speedAtContact == null) window.__slam.prevSpeed = sp;
        requestAnimationFrame(hold);
      };
      requestAnimationFrame(hold);

      SF.bus.on('physics:impact', (p) => {
        if (!p || (p.aId !== hostile.id && p.bId !== hostile.id)) return;
        if (p.aId !== rock.id && p.bId !== rock.id) return;
        if (window.__slam.speedAtContact == null) {
          window.__slam.speedAtContact = window.__slam.prevSpeed || 0;
        }
        window.__slam.impacts.push({
          simTime: state.simTime,
          impulse: p.impulse,
          preSolveClosingSpeed: p.preSolveClosingSpeed,
        });
      });
      SF.bus.on('combat:collisionConsequence', (p) => {
        if (!p || p.targetId !== hostile.id) return;
        window.__slam.consequences.push({
          simTime: state.simTime,
          surface: p.surface,
          control: p.control,
          deltaV: p.deltaV,
          impactDamage: p.impactDamage,
          debrisCount: p.debrisCount,
        });
      });
      // Helm, measured the way the bench measures it: the applied `combat:tumbled` event and the
      // live collision-tumble status, never the kernel's proposed `control` field. The kernel
      // proposes `tumble` for any terrain contact at dV >= 18; whether the hull actually loses the
      // helm is decided downstream, and conflating the two is how a heavy gets reported as tumbling.
      SF.bus.on('combat:tumbled', (p) => {
        if (!p || p.victimId !== hostile.id) return;
        window.__slam.tumbledEvents = (window.__slam.tumbledEvents || 0) + 1;
      });
      SF.bus.on('entity:killed', (p) => {
        const id = p && (p.entityId ?? p.id ?? p.victimId);
        if (id === hostile.id) window.__slam.killed = { simTime: state.simTime };
      });

      return {
        rockId: rock.id,
        rockPos: { x: Math.round(rock.pos.x), z: Math.round(rock.pos.z) },
        rockRadius,
        hostileId: hostile.id,
        hullId: input.hullId,
        mass: hostile.mass,
        hullMax: hostile.hullMax,
        shieldMax: hostile.shield,
        ownCruise,
        commanded,
        throttle,
        runwayWU: standoffX,
        playerPos: { x: Math.round(player.pos.x), z: Math.round(player.pos.z) },
      };
    }, {
      hullId: spec.hullId,
      cruiseFrac: spec.cruiseFrac || 0,
      matchAbsoluteSpeed: spec.matchLight && lightAbsoluteSpeed > 0 ? lightAbsoluteSpeed : 0,
      runway: RUNWAY_WU,
      corridor: CORRIDOR_HALF_WIDTH_WU,
      standoff: PLAYER_STANDOFF_WU,
      zoom: CAPTURE_ZOOM_WU,
      pinnedRockId,
    });
    // Both hulls must meet the SAME rock, or the pair is two different experiments.
    if (pinnedRockId == null) pinnedRockId = setup.rockId;

    console.log(`[terrain-lethality] ${caseId}: ${setup.hullId} mass ${setup.mass}, cruise `
      + `${setup.ownCruise.toFixed(1)}, commanded ${setup.commanded.toFixed(1)} WU/s, runway `
      + `${Math.round(setup.runwayWU)} WU to rock ${setup.rockId} r${Math.round(setup.rockRadius)}`);

    // Do not release the throttle until the renderer has actually admitted the hull.
    await page.waitForFunction(() => {
      const h = window.SF.state.entities.get(window.__slam.hostileId);
      return !!h && h.presentationAdmission === 'ready';
    }, null, { timeout: 180_000 }).catch(() => {});
    const admission = await page.evaluate(() => {
      const h = window.SF.state.entities.get(window.__slam.hostileId);
      window.__slam.armed = true;
      return h ? h.presentationAdmission : null;
    });
    console.log(`[terrain-lethality] ${caseId}: hull admitted (${admission}); throttle released`);

    // Wait until the hull is closing on the rock, then photograph the sim clock through contact.
    await page.waitForFunction(() => {
      const s = window.SF.state;
      const h = s.entities.get(window.__slam.hostileId);
      const r = s.entities.get(window.__slam.rockId);
      if (!h || !r || h.alive === false) return true;
      return Math.hypot(h.pos.x - r.pos.x, h.pos.z - r.pos.z) < 150;
    }, null, { timeout: 240_000 });

    const frames = [];
    const t0 = await page.evaluate(() => window.SF.state.simTime);
    // 0.25 s of sim between frames for 6 s: dense enough that contact lands inside the strip and
    // the aftermath is followed, short enough that the whole thing is one look.
    for (let i = 0; i < 24; i += 1) {
      const target = t0 + i * 0.25;
      await page.waitForFunction((t) => window.SF.state.simTime >= t, target, { timeout: 120_000 });
      const shot = await page.screenshot({ type: 'png' });
      const probe = await page.evaluate(() => {
        const s = window.SF.state;
        const h = s.entities.get(window.__slam.hostileId);
        const r = s.entities.get(window.__slam.rockId);
        return {
          simTime: s.simTime,
          alive: !!h && h.alive !== false,
          hull: h ? h.hull : null,
          shield: h ? h.shield : null,
          speed: h ? Math.hypot(h.vel?.x || 0, h.vel?.z || 0) : null,
          distToRock: h && r ? Math.hypot(h.pos.x - r.pos.x, h.pos.z - r.pos.z) : null,
          impacts: window.__slam.impacts.length,
        };
      });
      const name = `f${String(i).padStart(2, '0')}_t${probe.simTime.toFixed(2)}.png`;
      await writeFile(path.join(dir, name), shot);
      frames.push({ name, ...probe });
    }

    const outcome = await page.evaluate(() => {
      const s = window.SF.state;
      const h = s.entities.get(window.__slam.hostileId);
      return {
        slam: window.__slam,
        aliveAtEnd: !!h && h.alive !== false,
        hullAtEnd: h ? h.hull : 0,
        tumbleStatusLive: !!(h && h.data && Array.isArray(h.data.statuses)
          && h.data.statuses.some((row) => row && row.id === 'status_tumbling'
            && row.data && row.data.kind === 'collision_tumble')),
        controlZero: !!(h && h.data && h.data.control && h.data.control.authority === 0),
      };
    });

    if (caseId === 'light') {
      lightAbsoluteSpeed = outcome.slam.speedAtContact || setup.commanded;
    }

    report.cases[caseId] = { setup, frames, outcome };
    console.log(`[terrain-lethality] ${caseId}: contact ${outcome.slam.impacts.length} impact(s), `
      + `speed at contact ${outcome.slam.speedAtContact == null ? 'n/a' : outcome.slam.speedAtContact.toFixed(1)}, `
      + `consequences ${outcome.slam.consequences.length}, alive at end ${outcome.aliveAtEnd}, `
      + `hull ${outcome.hullAtEnd}, helm ${(outcome.slam.tumbledEvents > 0 || outcome.tumbleStatusLive) ? 'LOST' : 'kept'} `
      + `(tumbled events ${outcome.slam.tumbledEvents})`);
    for (const c of outcome.slam.consequences.slice(0, 4)) {
      console.log(`    consequence surface=${c.surface} control=${c.control} dV=${Number(c.deltaV).toFixed(1)} `
        + `damage=${Number(c.impactDamage).toFixed(1)} debris=${c.debrisCount}`);
    }
  }

  report.pageErrors = pageErrors;
  await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[terrain-lethality] manifest -> ${path.relative(ROOT, path.join(OUT, 'manifest.json'))}`);
  if (pageErrors.length) console.warn(`[terrain-lethality] ${pageErrors.length} page error(s)`);
} finally {
  await browser.close();
  await server.close?.();
}
