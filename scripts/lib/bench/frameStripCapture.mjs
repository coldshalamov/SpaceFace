// scripts/lib/bench/frameStripCapture.mjs — frame strips from the REAL player route.
//
// WHY THIS FILE WAS REWRITTEN (PQ-173.00 repair, 2026-09-03)
// ---------------------------------------------------------
// The first version emitted `run:beginRequested` on the bus without dismissing the title cinematic,
// so the game never left the splash. It then screenshotted the canvas twelve times and wrote 337
// PNGs of the word SPACEFACE, a manifest that said `camera: 'shipping_chase'`, and `ok: true`.
// It reported PASS. That is precisely the "nobody played it" failure the Fun Convergence Loop
// exists to catch, living inside the instrument meant to catch it.
//
// Worse, every failure path fell into a catch block that wrote a one-pixel PNG, a manifest with
// invented tick numbers, and returned `{ ok: true }`. A capture that did not happen must never
// look like a capture that did. That fallback is gone: a failed capture throws.
//
// WHAT THIS DOES NOW
// ------------------
// It clicks the real buttons, in the order a person clicks them, copied from
// `scripts/check-crucible-route.mjs` (the only thing in the repo that proves a person can reach a
// Crucible run):
//
//     title cinematic -> main menu -> Crucible -> ruleset card -> hull card -> seed -> "Hold the line"
//     -> wait for flight mode -> wait for run.phase 'active' -> wait for live hostiles
//
// and only then starts photographing, at the shipping chase camera, with HUD text hidden and
// verified hidden. Every frame records the sim tick and simTime read out of `window.SF.state`, not
// a wall-clock guess. Moment markers come from the real bus (`physics:impact`, `entity:killed`,
// `combat:collisionConsequence`, `massline:sweepImpact`).
//
// CADENCE (the observatory capture contract, design/production/04_GAMEPLAY_OBSERVATORY.md §3):
// sample at 8 Hz, retain 4 fps baseline and all 8 fps inside a moment window (8 s before, 12 s
// after each moment). Retention is decided after the run from recorded ticks, because a capture
// cannot know a collision is coming.
//
// TICKS ARE RELATIVE TO RUN START. `state.tick` at launch depends on how long the browser took to
// boot, so absolute ticks never match between two runs of the same seed. `frame.tick` and
// `moment.tick` are both `state.tick - runStartTick`.
//
// KNOWN CONSTRAINT, recorded rather than worked around: the Crucible door has no arena selector
// (`src/ui/screens/crucible.js` launches `CRUCIBLE_ARENA_ID`, a constant = 'helios_core'). The real
// route can therefore only reach one arena. The headless bench's three-arena matrix is not
// player-reachable today. Faking it here with a bus event is what produced the title-screen strip;
// the arena the player can actually reach is the arena this captures.

import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from '../load-playwright.mjs';
import { computeProductionSourceIdentity, computeFunLoopHarnessDigest } from '../../measure-fun-loop.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Frames are capture evidence: hundreds of MB of PNG. They live in .devshots like every capture. */
export const DEFAULT_STRIP_DIR = join(ROOT, '.devshots/fun-loop/strips');
/** The manifest and the contact sheet are small and are the committed receipt. */
export const DEFAULT_MANIFEST_DIR = join(ROOT, 'design/program/roadmap/receipts/fun-loop/manifests');

/**
 * The codec the compositor encodes each streamed frame with.
 *
 * MEASURED on this machine, 2026-09-04: with an empty arena the PNG screencast held 90 % of real
 * time; with the arena fully dressed — ten hostiles, wrecks, plumes, the whole light rig — it fell
 * to 53 %, under the normal-speed floor, and a strip below that floor answers a critic's questions
 * about turn rate with the capture's numbers instead of the game's. PNG encoding of a 1280x720
 * frame twelve times a second is a real cost on an integrated GPU, and it buys nothing a critic
 * uses: nobody is measuring a pixel value, they are looking at a fight. JPEG at 92 keeps the
 * picture and gives the frame budget back.
 *
 * The manifest records which one was used, so a strip is never silently a different kind of strip.
 */
export const FRAME_FORMAT = 'jpeg';
export const FRAME_QUALITY = 92;

/**
 * How many compositor frames the screencast lets pass for each one it encodes (1 = every frame).
 *
 * MEASURED 2026-09-05 in one Crucible run on this machine (Intel Arc iGPU, headed, ten hostiles,
 * other agents' browsers on the box), simTime over wall clock in 8 s windows:
 *
 *     nobody watching            0.78 – 0.90
 *     screencast, every frame    0.51   (18 encoded frames a second)
 *     screencast, every 3rd      0.85   (5 a second — under the 8 Hz sample)
 *     screencast, every 6th      0.86   (3.6 a second)
 *     the once-a-second sweep    0.63   (see sweepHudText: now gated on a DOM mutation)
 *
 * Every strip captured before this (four, two on the hardware GPU) was under the normal-speed
 * floor, and encoding every frame was the single biggest reason. The strip retains at most 8 fps,
 * so encoding every frame spent two thirds of the JPEG work on pictures the retention mask threw
 * away. Every second frame still left the variant strips at 0.52-0.59 on this loaded machine, so
 * every third is the shipped cadence: ~5-6 candidates a second, above the 4 fps baseline and below
 * the 8 fps a moment window asks for. The manifest records the value used AND the frame rate the
 * compositor actually delivered (`deliveredFps`), so a strip captured at a different cadence is
 * never silently the same kind of strip and a moment window's real cadence is a number, not a claim.
 */
export const SCREENCAST_EVERY_NTH_FRAME = 3;

/** Sample rate. Retention thins this to 4 fps outside moment windows. */
export const SAMPLE_HZ = 8;
/** Observatory §3: at least eight seconds before and twelve seconds after each incident. */
export const MOMENT_LEAD_S = 8;
export const MOMENT_TAIL_S = 12;

/**
 * A strip below this fraction of real time is slow motion, and slow motion answers the critic's
 * questions about turn rate and reaction time with the capture's numbers instead of the game's.
 */
export const NORMAL_SPEED_FLOOR = 0.6;

/**
 * `physics:impact` fires on every contact pair every tick. The first repaired run recorded 128 of
 * them in five seconds — jostling at the spawn ring, exchanging 2-4 units of momentum. If everything
 * is a moment, nothing is: every frame lands inside a moment window and the 8 fps burst becomes the
 * baseline. A moment is an impact the player was in, or one big enough to be worth watching.
 */
export const MOMENT_IMPACT_FLOOR = 40;
/** Moments closer together than this are one moment. */
export const MOMENT_MERGE_S = 0.5;

/** The bus events that mark a moment. Verified present in src/ (see grep in the repair report). */
export const MOMENT_EVENTS = Object.freeze([
  'physics:impact',
  'entity:killed',
  'combat:collisionConsequence',
  'massline:sweepImpact',
  // The player's own shot landing. Kept only when the player owns the projectile (see the in-page
  // listener), so a critic asked whether a shoved ship flies gets a before/at/after triplet around
  // the hit rather than around whichever bump happened to be loudest.
  'projectile:hit',
]);

/**
 * Scenarios this capture can drive on the real route.
 *
 * `idle` exists so the determinism check has a run with no input at all: two runs of the same seed
 * must plan the same wave at the same relative ticks. `piloted` exists because an idle player
 * cannot demonstrate a turn radius or a shove — a critic asked to judge whether the ship turns
 * inside the screen needs frames in which someone tried to turn.
 */
export const STRIP_SCENARIOS = Object.freeze({
  swarm_idle: {
    label: 'Crucible swarm, hands off the stick',
    loadoutId: 'physics_toolkit',
    durationS: 22,
    tape: [],
  },
  swarm_piloted: {
    label: 'Crucible swarm, flown and fired',
    loadoutId: 'physics_toolkit',
    durationS: 26,
    // atS is seconds after the first captured frame. Keys are the live bindings in
    // src/systems/input.js (KeyW forward, KeyA/KeyD yaw-or-strafe, KeyS reverse/brake).
    // Firing is LMB, because the mouse is the weapon on this route.
    tape: [
      { atS: 0.5, keyDown: 'KeyW' },
      { atS: 3.0, keyDown: 'KeyD' },
      { atS: 5.0, keyUp: 'KeyD' },
      { atS: 5.2, mouseDown: true },
      { atS: 7.5, mouseUp: true },
      { atS: 8.0, keyDown: 'KeyA' },
      { atS: 10.5, keyUp: 'KeyA' },
      { atS: 11.0, mouseDown: true },
      { atS: 13.0, mouseUp: true },
      { atS: 13.5, keyUp: 'KeyW' },
      { atS: 14.0, keyDown: 'KeyS' },
      { atS: 16.0, keyUp: 'KeyS' },
      { atS: 16.5, keyDown: 'KeyW' },
      { atS: 17.0, keyDown: 'KeyD' },
      { atS: 20.0, keyUp: 'KeyD' },
      { atS: 20.5, mouseDown: true },
      { atS: 23.0, mouseUp: true },
      { atS: 24.0, keyUp: 'KeyW' },
    ],
  },
  // The two tapes below exist so a critic can SEE the 2026-09-03 audit findings (FEEL_CONTRACT §A)
  // on a build that still has them, from frames alone. Each puts the ship through the exact motion
  // the finding confiscated: no state write, no debug key, the same keys a player holds.
  earned_speed: {
    // A1/A2. Boost past the governed cap, let boost go while still holding forward, then let go of
    // everything, then brake on purpose. On the pre-fix build the ship slows down while FORWARD is
    // held (the governor braked above the cap) and slows harder hands-off (neutral counter-thrust at
    // any speed). On the fixed build both are a coast; only the brake spends the speed.
    label: 'Crucible swarm, boost past the cap, hold forward, hands off, then brake',
    loadoutId: 'physics_toolkit',
    durationS: 30,
    tape: [
      { atS: 0.5, keyDown: 'KeyW' },
      { atS: 1.5, keyDown: 'ShiftLeft' },
      { atS: 8.5, keyUp: 'ShiftLeft' },
      { atS: 16.5, keyUp: 'KeyW' },
      { atS: 24.5, keyDown: 'KeyS' },
      { atS: 27.5, keyUp: 'KeyS' },
    ],
  },
  shove_light: {
    // A4/A5. The physics toolkit's first weapon is the concussion cannon: the shove. Fire long
    // bursts into the swarm while sweeping the nose, so light ships take hits along and across
    // their motion and some of them meet the arena's rocks. On the pre-fix build a shoved ship
    // snaps back to its own cruise one tick later (the NPC cap deleted given momentum) and a ship
    // that meets a rock keeps its nose on its plan (terrain never took the helm). On the fixed
    // build the light ship flies, and a hard slam tumbles it.
    label: 'Crucible swarm, shove cannon into the light ships',
    loadoutId: 'physics_toolkit',
    durationS: 30,
    // The first shot of a run pays a one-off cost (shader and audio admission for the muzzle and
    // impact families: the measured first-fire stall). It is paid here, before the settle wait and
    // before the first frame, so the strip photographs the shove and not the game's first hiccup.
    warmup: [
      { atS: 0, aim: 'nearestHostile' },
      { atS: 0.1, mouseDown: true },
      { atS: 1.2, mouseUp: true },
    ],
    tape: [
      // The mouse is the gun on this route (PILOT scheme: keyboard flies, mouse fights) and the
      // cannon fires where the cursor points. A cursor parked in one corner of the glass hits
      // nothing — the first shove strip landed zero shots in eighteen seconds — so the tape does
      // what a person does: keeps the cursor on the nearest live hostile while the trigger is held.
      { atS: 0.3, aim: 'nearestHostile' },
      { atS: 0.5, mouseDown: true },
      { atS: 4.0, mouseUp: true },
      { atS: 4.2, keyDown: 'KeyA' },
      { atS: 5.5, keyUp: 'KeyA' },
      { atS: 5.7, mouseDown: true },
      { atS: 9.5, mouseUp: true },
      { atS: 9.7, keyDown: 'KeyD' },
      { atS: 11.5, keyUp: 'KeyD' },
      { atS: 11.7, mouseDown: true },
      { atS: 16.0, mouseUp: true },
      { atS: 16.2, keyDown: 'KeyA' },
      { atS: 17.5, keyUp: 'KeyA' },
      { atS: 17.7, mouseDown: true },
      { atS: 22.0, mouseUp: true },
      { atS: 22.5, keyDown: 'KeyD' },
      { atS: 24.0, keyUp: 'KeyD' },
      { atS: 24.2, mouseDown: true },
      { atS: 28.5, mouseUp: true },
    ],
  },
  rope_swing: {
    // B7 on the shipping camera: the rope kit, the cursor on the nearest rock, a tap of the
    // Massline key to latch, forward held to swing, a tap to let go, then hands off to see what
    // speed the release kept. The manifest records whether the line was live on every frame.
    label: 'Crucible swarm, latch a rock on the Massline, swing, let go',
    loadoutId: 'massline_rig',
    durationS: 26,
    tape: [
      { atS: 0.3, aim: 'nearestAsteroid' },
      { atS: 0.5, keyDown: 'KeyW' },
      { atS: 2.5, keyDown: 'Space' },
      { atS: 2.65, keyUp: 'Space' },
      { atS: 13.0, keyDown: 'Space' },
      { atS: 13.15, keyUp: 'Space' },
      { atS: 13.3, keyUp: 'KeyW' },
    ],
  },
});

export async function findFreePort(start = 8500) {
  for (let port = start; port < start + 100; port++) {
    const free = await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free port');
}

export async function startDevServer(startPort = 8520, { env = {} } = {}) {
  const port = await findFreePort(startPort);
  const url = `http://127.0.0.1:${port}/`;
  let serverErr = '';
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
    env: { ...process.env, ...env },
  });
  if (child.stderr) child.stderr.on('data', (d) => { serverErr += d.toString(); });

  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`dev server exited prematurely (${child.exitCode}): ${serverErr}`);
    try {
      if ((await fetch(url)).ok) return { baseUrl: url, port, kill: () => child.kill() };
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`dev server never became reachable: ${serverErr}`);
}

/** Chrome must keep rendering when its window is behind another one, or the strip stutters. */
export const CHROME_ARGS = Object.freeze([
  '--window-size=1280,760',
  '--mute-audio',
  '--disable-gpu-shader-disk-cache',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
]);

/**
 * Which sampled frames survive to disk.
 *
 * 4 fps baseline, 8 fps inside a moment window. Decided from recorded simTime after the run,
 * because nothing can photograph a collision before it happens.
 *
 * Pure and exported so a test can assert the cadence without a browser.
 *
 * @param {Array<{simTime:number}>} samples sampled frames in time order
 * @param {Array<{simTime:number}>} moments moment markers
 * @returns {boolean[]} keep flags, parallel to samples
 */
export function retentionMask(samples, moments, { leadS = MOMENT_LEAD_S, tailS = MOMENT_TAIL_S } = {}) {
  const windows = (moments || []).map((m) => [m.simTime - leadS, m.simTime + tailS]);
  const inMoment = (t) => windows.some(([a, b]) => t >= a && t <= b);
  // The screencast delivers ~20 fps. Keeping everything inside a moment window would give 20 fps
  // there, not 8 — five times the frames a reviewer can hold in one prompt, for no more evidence.
  //
  // The next slot advances from the PREVIOUS slot, never from the frame that filled it. A 20 fps
  // grid does not divide into 8 fps, so "keep one at least 0.125 s after the last kept" quietly
  // delivers 6.7 fps; carrying the target forward averages to the rate that was asked for.
  let nextTarget = -Infinity;
  return (samples || []).map((s) => {
    if (s.simTime < nextTarget) return false;
    const spacing = inMoment(s.simTime) ? 1 / 8 : 1 / 4;
    nextTarget = (nextTarget === -Infinity ? s.simTime : nextTarget) + spacing;
    // After a real gap in the stream, re-anchor rather than burst to catch up.
    if (nextTarget < s.simTime - spacing) nextTarget = s.simTime + spacing;
    return true;
  });
}

/**
 * Turn the raw bus firehose into moments worth photographing.
 *
 * Pure and exported so the filter can be argued with in a test instead of in prose.
 *
 * @param {Array<{type:string,tick:number,simTime:number,playerInvolved:boolean,magnitude:number}>} raw
 */
export function condenseMoments(raw, { floor = MOMENT_IMPACT_FLOOR, mergeS = MOMENT_MERGE_S } = {}) {
  const worth = (m) => {
    if (m.type !== 'physics:impact') return true;      // a kill or a consequence is always a moment
    return m.playerInvolved || (m.magnitude || 0) >= floor;
  };
  const kept = (raw || []).filter(worth).sort((a, b) => a.simTime - b.simTime);
  const out = [];
  for (const m of kept) {
    const prev = out[out.length - 1];
    if (prev && m.simTime - prev.simTime < mergeS) {
      prev.merged = (prev.merged || 1) + 1;
      prev.magnitude = Math.max(prev.magnitude || 0, m.magnitude || 0);
      prev.playerInvolved = prev.playerInvolved || m.playerInvolved;
      if (m.surface && !prev.surface) prev.surface = m.surface;
      // The label follows the loudest thing in the cluster: a kill outranks a bump, and the player's
      // own shot landing outranks a bump too — the first aimed shove strip fired 27 rounds and the
      // manifest showed none, because every hit fell inside half a second of some contact and took
      // that contact's name.
      if (m.type === 'entity:killed') prev.type = 'entity:killed';
      else if (m.type === 'projectile:hit' && prev.type !== 'entity:killed') { prev.type = 'projectile:hit'; prev.playerInvolved = true; }
      continue;
    }
    out.push({ ...m });
  }
  return out;
}

/**
 * Wait until the game is actually running at something near real time.
 *
 * Returns the measured fraction whether or not it reached the floor: a slow strip that says so is
 * evidence; a slow strip that claims "shipping camera, normal speed" is the failure this file was
 * rewritten to end.
 */
/** simTime advanced over wall clock across one window: 1.0 is real time, 0.5 is half speed. */
export async function measureRealtime(page, windowMs = 2000) {
  const a = await page.evaluate(() => window.SF.state.simTime);
  const t0 = Date.now();
  await page.waitForTimeout(windowMs);
  const b = await page.evaluate(() => window.SF.state.simTime);
  return (b - a) / ((Date.now() - t0) / 1000);
}

export async function waitForRealtime(page, {
  floor = NORMAL_SPEED_FLOOR, windowMs = 2000, maxWaitMs = 60000, requiredWindows = 3, log = () => {},
} = {}) {
  const started = Date.now();
  let fraction = 0;
  let stableWindows = 0;
  while (Date.now() - started < maxWaitMs) {
    const a = await page.evaluate(() => window.SF.state.simTime);
    const t0 = Date.now();
    await page.waitForTimeout(windowMs);
    const b = await page.evaluate(() => window.SF.state.simTime);
    fraction = (b - a) / ((Date.now() - t0) / 1000);
    log(`realtime ${(fraction * 100).toFixed(0)}%`);
    stableWindows = fraction >= floor ? stableWindows + 1 : 0;
    if (stableWindows >= requiredWindows) break;
  }
  return { fraction, waitedS: (Date.now() - started) / 1000, reachedFloor: stableWindows >= requiredWindows, stableWindows };
}

/**
 * Authored ship parts are named by their LOD rung (`LOD0_DET_hardpoint_collar`, ...). Procedural
 * presentation layers that live at the same world position (the LivingHull decal pools, the plume
 * throat) are NOT authored parts, and a strip in which only those exist is a strip with no ship in
 * it - which is exactly the picture the first "repaired" capture produced.
 */
export const HULL_PART_NAME_RE = /^LOD\d/;

/**
 * Wait until the renderer is actually DRAWING the hulls, and prove it two independent ways.
 *
 * WHY THIS GATE EXISTS (2026-09-04)
 * ---------------------------------
 * The first repaired capture waited for the sim to reach 60 % of real time and then photographed
 * 403 frames of a ringed planet, a dozen asteroids and a star field. No player hull. No hostiles.
 * The manifest said `playerOnScreen: true` for every one of them - because `playerOnScreen`
 * PROJECTS a sim position through the camera and asks whether it is inside the frustum. It never
 * asked whether anything was drawn there. Measured on this machine: the ship's authored parts are
 * not admitted to the frame for roughly the first minute of wall clock after a run starts (every
 * asset arrives - zero failed requests, zero >= 400 responses, a real GPU, and
 * KHR_parallel_shader_compile present), and the strip's whole window fell inside that hole.
 *
 * A projection is a claim. These two are evidence:
 *
 *   1. `onAfterRender` - three.js calls it only for an object the renderer actually submitted this
 *      frame, after visibility and frustum culling. Hooking the authored parts that sit on the
 *      player and on the hostiles and counting the calls answers "did the renderer draw the ship".
 *   2. Bright pixels where the ship is - a screenshot of a small box at the projected hull, decoded,
 *      counting pixels above a luma floor. Space is black; a lit hull is not.
 *
 * Both must agree before the first frame is kept, and both are recorded per frame, so a strip that
 * lost the ship halfway can never again look like a strip that kept it.
 */
/**
 * Install the draw counters in the page, and (re)hook any authored part that has appeared since the
 * last call. Safe to call as often as you like; a mesh is only ever hooked once.
 *
 * OWNERSHIP IS COMPUTED LIVE, NOT PINNED. The first version of this pinned each mesh to the entity
 * it was nearest when it was hooked, and the piloted run caught that immediately: the player's parts
 * drew 0 times while nine hostiles drew, because the game pools and swaps its LOD meshes, so a mesh
 * hooked on the player was later flying on someone else and reporting its draws to the wrong ship.
 * The counter therefore lives on the MESH, and every read asks where that mesh is right now.
 */
export async function installDrawHooks(page) {
  return page.evaluate((reSource) => {
    const re = new RegExp(reSource);
    window.__stripHooked = window.__stripHooked || [];

    if (!window.__stripTally) {
      // `strict` counts only draws through the camera the strip is photographed with. `any`
      // counts every pass. If strict never fires while any does, the assumption about which camera
      // object the renderer uses is wrong for this build — so the gate SAYS so and falls back,
      // instead of waiting forever for a number that will never arrive. That is the whole lesson of
      // this file: an instrument that cannot report its own broken assumption is worse than none.
      window.__stripTally = function tally(useAny) {
        const st = window.SF.state;
        const THREE = window.SF.THREE;
        const p = st.entities && st.playerId != null ? st.entities.get(st.playerId) : null;
        const hostiles = st.entityList.filter((e) => e.alive && e.data && e.data.runCohort === 'survival');
        const tmp = new THREE.Vector3();
        let player = 0;
        let hostile = 0;
        const ids = {};
        let anySeen = 0;
        for (const o of window.__stripHooked) {
          const strict = o.__stripDrawCount || 0;
          const any = o.__stripDrawAny || 0;
          o.__stripDrawCount = 0;
          o.__stripDrawAny = 0;
          anySeen += any;
          const c = useAny ? any : strict;
          if (!c || !o.parent) continue;
          // These objects just rendered: matrixWorld already contains the submitted transform.
          // getWorldPosition() forces ancestor matrix updates for every authored part and
          // made this observer disturb the frame it was measuring.
          tmp.setFromMatrixPosition(o.matrixWorld);
          let bestKey = null;
          let bestD = Infinity;
          if (p) { bestD = Math.hypot(tmp.x - p.pos.x, tmp.z - p.pos.z); bestKey = 'player'; }
          for (const e of hostiles) {
            const d = Math.hypot(tmp.x - e.pos.x, tmp.z - e.pos.z);
            if (d < bestD) { bestD = d; bestKey = `h${e.id}`; }
          }
          // A part further than this from every ship is not on a ship.
          if (!bestKey || bestD > 40) continue;
          if (bestKey === 'player') player += c;
          else { hostile += c; ids[bestKey] = 1; }
        }
        return {
          player, hostiles: hostile, hostilesDrawing: Object.keys(ids).length,
          anySeen, pass: useAny ? 'any-pass' : 'shipping-camera',
        };
      };
    }

    const st = window.SF.state;
    const scene = st.render && st.render.scene;
    if (!scene) return 0;
    let added = 0;
    scene.traverse((o) => {
      // An InstancedMesh is a batch: getWorldPosition returns the batch origin, not the instance,
      // so counting one would attribute a whole swarm to whichever ship the batch happens to sit
      // near (agy's review, 2026-09-04, point 6). The ship parts here are ordinary meshes.
      if (!o.isMesh || o.isInstancedMesh) return;
      if (!re.test(o.name || '')) return;
      if (o.__stripDrawCount !== undefined) return;
      o.__stripDrawCount = 0;
      o.__stripDrawAny = 0;
      const prev = o.onAfterRender;
      o.onAfterRender = function stripCounted(renderer, scene_, camera, ...rest) {
        // ONLY a draw through the camera we are photographing counts. three.js calls onAfterRender
        // for shadow cascades and depth pre-passes too, and a hull culled from the main view but
        // present in a shadow map would otherwise satisfy the gate while appearing in no frame
        // (agy's review, 2026-09-04, point 1). Those passes use a DIFFERENT camera, so testing the
        // camera identity catches them.
        //
        // Its companion suggestion - ALSO require renderer.getRenderTarget() === null - was tried
        // and reverted after one 24-minute empty run: this game is post-processed, so the scene pass
        // renders into a target and only the final composite reaches the default framebuffer. That
        // test counts nothing, forever, on any post-processed pipeline. A reviewer can be right
        // about three.js and wrong about this renderer, which is why a review is a lead, not a patch.
        const live = window.SF && window.SF.state && window.SF.state.render;
        o.__stripDrawAny = (o.__stripDrawAny || 0) + 1;
        if (live && camera === live.camera) {
          o.__stripDrawCount = (o.__stripDrawCount || 0) + 1;
        }
        if (prev) prev.call(this, renderer, scene_, camera, ...rest);
      };
      window.__stripHooked.push(o);
      added++;
    });
    return added;
  }, HULL_PART_NAME_RE.source);
}

/**
 * Wait until the renderer is actually DRAWING the hulls, and prove it two independent ways.
 *
 * WHY THIS GATE EXISTS (2026-09-04)
 * ---------------------------------
 * The first repaired capture waited for the sim to reach 60 % of real time and then photographed
 * 403 frames of a ringed planet, a dozen asteroids and a star field. No player hull. No hostiles.
 * The manifest said `playerOnScreen: true` for every one of them - because `playerOnScreen`
 * PROJECTS a sim position through the camera and asks whether it is inside the frustum. It never
 * asked whether anything was drawn there. Measured on this machine: the ship's authored parts are
 * not admitted to the frame for the first two to three minutes of wall clock after a run starts
 * (every asset arrives - zero failed requests, zero >= 400 responses, a real GPU, and
 * KHR_parallel_shader_compile present), and the strip's whole window fell inside that hole.
 *
 * A projection is a claim. These two are evidence:
 *
 *   1. `onAfterRender` - three.js calls it only for an object the renderer actually submitted this
 *      frame, after visibility and frustum culling. Counting those calls on the authored parts and
 *      attributing each to whichever ship the mesh is on RIGHT NOW answers "did the renderer draw
 *      the player's ship", and keeps answering it when the game swaps or pools that mesh.
 *   2. Bright pixels where the ship is - a screenshot of a small box at the projected hull, decoded,
 *      counting pixels above a luma floor. Space is black; a lit hull is not.
 *
 * Both must agree before the first frame is kept, and both are recorded per frame, so a strip that
 * lost the ship halfway can never again look like a strip that kept it.
 */
export async function waitForHullsDrawn(page, {
  maxWaitMs = 240000, pollMs = 400, minHostilesWithParts = 3, brightFloor = 40, minBrightPx = 25,
  log = () => {},
} = {}) {
  const started = Date.now();
  let last = {
    drawn: false, playerDraws: 0, hostileDraws: 0, hostilesWithParts: 0,
    brightPx: 0, hullPx: 0, simTime: 0, pass: 'shipping-camera',
  };
  let announced = false;
  let useAny = false;
  while (Date.now() - started < maxWaitMs) {
    await installDrawHooks(page);
    await page.evaluate((a) => { if (window.__stripTally) window.__stripTally(a); }, useAny); // zero
    await page.waitForTimeout(pollMs);

    const read = await page.evaluate(() => {
      const st = window.SF.state;
      const r = st.render || {};
      const cam = r.camera;
      const THREE = window.SF.THREE;
      const p = st.entities && st.playerId != null ? st.entities.get(st.playerId) : null;
      const t = window.__stripTally
        ? window.__stripTally(window.__stripUseAny === true)
        : { player: 0, hostiles: 0, hostilesDrawing: 0, anySeen: 0, pass: 'none' };
      const out = {
        playerDraws: t.player || 0,
        hostileDraws: t.hostiles || 0,
        hostilesWithParts: t.hostilesDrawing || 0,
        anySeen: t.anySeen || 0,
        pass: t.pass || 'none',
        simTime: Number((st.simTime || 0).toFixed(3)),
        clip: null,
        hullPx: 0,
      };
      if (cam && p && THREE) {
        const v = new THREE.Vector3(p.pos.x, p.pos.y || 0, p.pos.z).project(cam);
        const e = new THREE.Vector3(p.pos.x + (p.radius || 8), p.pos.y || 0, p.pos.z).project(cam);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const cx = (v.x * 0.5 + 0.5) * w;
        const cy = (0.5 - v.y * 0.5) * h;
        const rpx = Math.abs((e.x - v.x) * 0.5 * w);
        out.hullPx = Number((rpx * 2).toFixed(1));
        const box = Math.max(48, Math.min(320, rpx * 3));
        if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1) {
          const x0 = Math.max(0, Math.round(cx - box / 2));
          const y0 = Math.max(0, Math.round(cy - box / 2));
          out.clip = {
            x: x0,
            y: y0,
            width: Math.max(4, Math.round(Math.min(box, w - x0))),
            height: Math.max(4, Math.round(Math.min(box, h - y0))),
          };
        }
      }
      return out;
    });

    let brightPx = 0;
    let boxPx = read.clip ? read.clip.width * read.clip.height : 0;
    if (read.clip) {
      try {
        const shot = await page.screenshot({ clip: read.clip, type: 'png', timeout: 15000 });
        const { PNG } = await import('pngjs');
        const png = PNG.sync.read(shot);
        for (let i = 0; i < png.data.length; i += 4) {
          const luma = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
          if (luma >= brightFloor) brightPx++;
        }
      } catch { /* a shot that will not decode is simply no evidence on this poll */ }
    }

    last = Object.assign({}, read, { brightPx, boxPx, drawn: false });

    // Sixty seconds is longer than the renderer has ever taken to draw the first part on this
    // machine. If nothing has matched the shipping camera by then but SOMETHING is drawing, the
    // camera assumption is wrong for this build; say so out loud and keep going on the weaker
    // evidence rather than timing out on an arena that is plainly full of ships.
    if (!useAny && read.playerDraws === 0 && read.anySeen > 0 && Date.now() - started > 60000) {
      useAny = true;
      await page.evaluate(() => { window.__stripUseAny = true; });
      log('no draw matched the shipping camera in 60s though parts ARE drawing — '
        + 'falling back to counting every pass, and recording that in the manifest');
    }
    if (read.playerDraws > 0 && !announced) {
      announced = true;
      log(`the renderer began drawing the ship at sim ${read.simTime.toFixed(1)}s`);
    }
    if (read.playerDraws > 0 && read.hostilesWithParts >= minHostilesWithParts && brightPx >= minBrightPx) {
      last.drawn = true;
      last.waitedS = (Date.now() - started) / 1000;
      return last;
    }
  }
  last.waitedS = (Date.now() - started) / 1000;
  return last;
}

/**
 * Do two runs of the same seed agree on when things happened?
 *
 * Compares moment kinds and run-relative ticks. Exported so the determinism done-when is a
 * function, not a paragraph.
 */
export function compareStripEventTicks(manifestA, manifestB) {
  const key = (m) => `${m.type}@${m.tick}`;
  const a = (manifestA.moments || []).map(key);
  const b = (manifestB.moments || []).map(key);
  const mismatches = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) mismatches.push({ index: i, a: a[i] ?? null, b: b[i] ?? null });
  }
  return { identical: mismatches.length === 0, countA: a.length, countB: b.length, mismatches };
}

/**
 * The CSS that takes every word off the glass.
 *
 * A hand-written selector list is always one screen behind the game. IMPACT's strips (2026-09-04)
 * still carried a contract card with `hudText: 'off'`, and the run this file's own diagnostic made
 * ended with a NONLETHAL CUSTODY panel over the arena, because a mission prompt that arrives at
 * second nine is not covered by a list written for the HUD that existed at second zero. So this
 * list is the fast path and `sweepHudText` below is the guarantee.
 */
export const HUD_TEXT_OFF_CSS = `
  #hud, #toasts, #alerts, #boot-overlay, #cinematic-splash, #modal-backdrop { display: none !important; }
  #screens { display: none !important; }
  .sf-crun, .sf-caption, .sf-voice-floor, .sf-floor-pill, .sf-subtitle { display: none !important; }
  /* mission and contract furniture that arrives mid-run */
  #sf-recovery-encounter, .sf-recovery--unique, .sf-recovery--receipt { display: none !important; }
  #contracts, #objectives, #mission-card, .sf-contract, .sf-contract-card, .sf-objective,
  .sf-mission-card, .sf-briefing, .sf-toast, .sf-banner, .sf-prompt, .sf-callout,
  .sf-radial, .sf-tooltip { display: none !important; }
`;

/**
 * Hide every element on the overlay that is currently showing a word, and report what it hid.
 *
 * This is the part that cannot fall behind the game. It walks the text nodes under `#ui-root`, and
 * hides the element each visible one belongs to — skipping anything that contains the canvas, so
 * the picture itself is never touched. Run it after the stylesheet and again during the run: a
 * toast that appears at second nine is on the frames whether or not it existed at second zero.
 *
 * @returns {Promise<{hidden: Array<{text:string, selector:string}>, verified: boolean,
 *                    leftovers: Array<{text:string, selector:string}>}>}
 */
export async function sweepHudText(page, { onlyIfChanged = false } = {}) {
  return page.evaluate((onlyIfChanged) => {
    const root = document.getElementById('ui-root');
    const canvas = document.getElementById('gl-canvas');
    // MEASURED 2026-09-05: walking every text node under #ui-root with getComputedStyle once a
    // second cost the game ~15 points of real time (0.63 against ~0.80 with nobody sweeping). The
    // walk is the guarantee, so it is not removed; instead an observer records whether anything
    // under the overlay CHANGED since the last sweep, and a mid-run sweep that finds nothing
    // changed returns at once. The two full walks (before the first frame, after the last) never
    // take this shortcut.
    if (root && !window.__stripUiObserver && typeof MutationObserver === 'function') {
      window.__stripUiChanged = true;
      // The HUD keeps writing its readouts every frame while the stylesheet has it display:none,
      // so a mutation under a root the stylesheet already hides is not a change to the glass.
      const hiddenRoots = [...document.querySelectorAll(
        '#hud, #toasts, #alerts, #boot-overlay, #cinematic-splash, #modal-backdrop, #screens',
      )];
      window.__stripUiObserver = new MutationObserver((records) => {
        for (const rec of records) {
          const t = rec.target && rec.target.nodeType === 3 ? rec.target.parentElement : rec.target;
          if (t && hiddenRoots.some((r) => r === t || r.contains(t))) continue;
          window.__stripUiChanged = true;
          return;
        }
      });
      window.__stripUiObserver.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
    }
    if (onlyIfChanged && window.__stripUiObserver && window.__stripUiChanged !== true) {
      return { hidden: [], verified: true, leftovers: [], skipped: true };
    }
    window.__stripUiChanged = false;
    const describe = (el) => (el.id ? `#${el.id}` : (typeof el.className === 'string' && el.className)
      ? `.${el.className.split(/\s+/).filter(Boolean).join('.')}`
      : el.tagName);
    const visibleTextOwners = () => {
      const found = [];
      if (!root) return found;
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        const text = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const el = n.parentElement;
        if (!el) continue;
        if (canvas && el.contains(canvas)) continue;   // never hide the picture
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (el.closest('.sr-only')) continue;
        found.push({ el, text: text.slice(0, 60), selector: describe(el) });
      }
      return found;
    };

    const hidden = [];
    // Two passes: hiding a caption can reveal the panel behind it.
    for (let pass = 0; pass < 2; pass++) {
      for (const item of visibleTextOwners()) {
        item.el.style.setProperty('display', 'none', 'important');
        hidden.push({ text: item.text, selector: item.selector });
      }
    }
    const leftovers = visibleTextOwners().map((x) => ({ text: x.text, selector: x.selector })).slice(0, 10);
    return { hidden: hidden.slice(0, 40), verified: leftovers.length === 0, leftovers, skipped: false };
  }, onlyIfChanged);
}

/**
 * Capture one frame strip on the real player route.
 *
 * Throws on any failure. There is no "ok: true" consolation path: a strip that does not show the
 * game is worse than no strip, because someone will grade it.
 *
 * @param {object} options
 * @param {string} [options.bench] 'crucible' | 'flight' | 'verbs' — labels the strip only
 * @param {string} [options.scenarioId] key of STRIP_SCENARIOS
 * @param {string} [options.loadoutId] hull card data-starter-id ('energy_baseline' | 'physics_toolkit' | 'massline_rig')
 * @param {number} [options.seed]
 * @param {string} [options.outDir] frame root (default .devshots/fun-loop/strips)
 * @param {string} [options.manifestDir] receipt root for manifest + contact sheet
 * @param {boolean} [options.headed] show the window
 * @param {number} [options.durationS] seconds of gameplay to photograph
 * @param {boolean} [options.verbose]
 */
export const SAFE_LEAF_TOKEN_RE = /^[a-zA-Z0-9._-]+$/;

function containmentRel(rootPath, childPath) {
  const rel = relative(rootPath, childPath);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return null;
  return rel;
}

/**
 * Require a nonempty safe leaf token (letters, digits, dot, underscore, hyphen;
 * reject '.', '..', separators, drive/absolute forms, and traversal).
 */
export function assertSafeLeafToken(val, label = 'path segment') {
  if (typeof val !== 'string' || !val || !SAFE_LEAF_TOKEN_RE.test(val) || val === '.' || val === '..') {
    throw new Error(`unsafe ${label}: "${val}" (must be a nonempty leaf token matching ${SAFE_LEAF_TOKEN_RE} and not '.' or '..')`);
  }
  if (val.includes('/') || val.includes('\\') || val.includes(':')) {
    throw new Error(`unsafe ${label}: "${val}" contains path separators or drive specifier`);
  }
  return val;
}

/**
 * Prove childPath is a lexical strict descendant of rootDir.
 */
export function assertStrictDescendant(childPath, rootDir, label = 'directory') {
  const resolvedRoot = resolve(rootDir);
  const resolvedChild = resolve(childPath);
  const rel = containmentRel(resolvedRoot, resolvedChild);
  if (!rel) {
    throw new Error(`${label} "${resolvedChild}" is not a strict descendant of authorized root "${resolvedRoot}"`);
  }
  if (resolve(resolvedRoot, rel) !== resolvedChild) {
    throw new Error(`${label} "${resolvedChild}" failed resolution containment against root "${resolvedRoot}"`);
  }
  return resolvedChild;
}

/**
 * Prove every existing prefix of childPath, after realpath, stays inside the real authorized root.
 * Catches a junction/symlink on an ancestor before mkdir would follow it outside.
 */
export function assertRealpathChainContained(childPath, rootDir, label = 'directory') {
  const resolvedRoot = resolve(rootDir);
  const resolvedChild = assertStrictDescendant(childPath, resolvedRoot, label);
  if (!existsSync(resolvedRoot)) return { realRoot: resolvedRoot, realChild: resolvedChild };
  let realRoot;
  try {
    realRoot = realpathSync(resolvedRoot);
  } catch (err) {
    throw new Error(`${label} authorized root realpath failed (${resolvedRoot}): ${err.message}`);
  }
  const rel = containmentRel(resolvedRoot, resolvedChild);
  const parts = rel.split(/[/\\]/).filter(Boolean);
  let acc = resolvedRoot;
  for (const part of parts) {
    acc = resolve(acc, part);
    if (!existsSync(acc)) break;
    let realAcc;
    try {
      realAcc = realpathSync(acc);
    } catch (err) {
      throw new Error(`${label} realpath failed at "${acc}": ${err.message}`);
    }
    if (!containmentRel(realRoot, realAcc)) {
      throw new Error(`${label} "${acc}" is a reparse/symlink escape from "${realRoot}" to "${realAcc}"`);
    }
  }
  return { realRoot, realChild: resolvedChild };
}

/**
 * After the directory exists, prove its realpath remains a strict descendant of the real root.
 */
export function assertRealpathDescendant(childPath, rootDir, label = 'directory') {
  const resolvedRoot = resolve(rootDir);
  const resolvedChild = assertStrictDescendant(childPath, resolvedRoot, label);
  let realRoot;
  let realChild;
  try {
    realRoot = realpathSync(resolvedRoot);
    realChild = realpathSync(resolvedChild);
  } catch (err) {
    throw new Error(`${label} realpath failed (${resolvedChild} under ${resolvedRoot}): ${err.message}`);
  }
  if (!containmentRel(realRoot, realChild)) {
    throw new Error(`${label} "${realChild}" is not a realpath descendant of authorized root "${realRoot}"`);
  }
  return { realRoot, realChild };
}

/**
 * Safely clean stale frames and manifest in targetDir.
 * Unlinks only basename entries returned from the already-contained, realpath-verified
 * target directory. Each joined deletion target must independently remain inside that directory.
 */
export function cleanTargetDirectory(targetDir, authorizedRoot) {
  const resolvedTarget = assertStrictDescendant(targetDir, authorizedRoot, 'targetDir');
  if (!existsSync(resolvedTarget)) return;
  const { realChild } = assertRealpathDescendant(resolvedTarget, authorizedRoot, 'targetDir');
  let existing;
  try {
    existing = readdirSync(realChild);
  } catch (err) {
    throw new Error(`failed to read target directory for cleanup (${realChild}): ${err.message}`);
  }
  for (const entry of existing) {
    if (typeof entry !== 'string' || !entry || basename(entry) !== entry || entry === '.' || entry === '..') {
      throw new Error(`unsafe directory entry returned from target directory: "${entry}"`);
    }
    const filePath = resolve(realChild, entry);
    const rel = containmentRel(realChild, filePath);
    if (!rel || rel !== entry) {
      throw new Error(`deletion target "${filePath}" escaped target directory "${realChild}"`);
    }
    const lower = entry.toLowerCase();
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower === 'strip-manifest.json') {
      unlinkSync(filePath);
    }
  }
}

/**
 * The real click-through (scripts/check-crucible-route.mjs), from a booted page to a Crucible run
 * with live hostiles: title cinematic -> main menu -> Crucible -> swarm ruleset -> hull card ->
 * seed -> "Hold the line" -> flight mode -> run phase active -> a live enemy. Exported so a probe
 * can stand in the same room the strip is photographed in without copying the route.
 *
 * @param {import('playwright').Page} page
 * @param {{ hullId: string, seed: number|string, log?: Function }} options
 */
export async function driveRealCrucibleRoute(page, { hullId, seed, log = () => {} }) {
  // 1. The title cinematic owns focus and defers the main menu until it is dismissed. Clicking
  //    it is what a player does; waiting out its 18 s auto-dismiss is what the old capture
  //    accidentally never did. bringToFront first: the dismissal fence starts suspended when the
  //    document does not have focus, and a suspended fence ignores the click.
  await page.bringToFront();
  await page.evaluate(() => {
    const el = document.getElementById('cinematic-splash');
    if (el) el.click();
  });
  // The splash lingers ~700 ms fading out (intro.css .is-closing); the menu wait covers it.
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="mainMenu"]');
    return !!el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 45000 });
  log('main menu');

  // 2. Menu buttons stay disabled until their screen module finishes its dynamic import.
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('#screens button')]
      .find((x) => x.textContent.replace(/\s+/g, ' ').trim() === 'Crucible');
    return !!b && !b.disabled;
  }, null, { timeout: 45000 });
  const doorOpened = await clickButtonByText(page, 'Crucible');
  if (!doorOpened) throw new Error('the Crucible button did not click');
  await page.waitForFunction(
    () => document.querySelector('#screens .sf-crd-hull') && document.querySelector('#screens .sf-crd-seed input'),
    null, { timeout: 20000 },
  );
  log('crucible door');

  // 3. Ruleset: swarm is the default and is what the button plays; select it explicitly anyway.
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('#screens .sf-crd-mode')].find((b) => b.dataset.ruleset === 'swarm');
    if (card) card.click();
  });

  // 4. Hull and seed. The hull cards carry data-starter-id, so the loadout is selected by id,
  //    never by matching a label that a copy pass could rewrite.
  const hullPicked = await page.evaluate((wanted) => {
    const cards = [...document.querySelectorAll('#screens .sf-crd-hull')];
    const card = cards.find((b) => b.dataset.starterId === wanted);
    if (!card) return { ok: false, available: cards.map((c) => c.dataset.starterId) };
    card.click();
    return { ok: true, available: cards.map((c) => c.dataset.starterId) };
  }, hullId);
  if (!hullPicked.ok) {
    throw new Error(`hull '${hullId}' is not on the Crucible door; it offers: ${hullPicked.available.join(', ')}`);
  }
  await page.evaluate((s) => { document.querySelector('#screens .sf-crd-seed input').value = String(s); }, seed);

  // 5. Launch. The verb is the swarm ruleset's own button text.
  if (!(await clickButtonByText(page, 'Hold the line'))) throw new Error('"Hold the line" did not click');

  // ── The wait chain: mode, then phase, then a live enemy ────────────────────────────────────
  // Photographing before the third condition gives an empty arena, and an empty arena is exactly
  // the picture that lets a strip pass without a game in it.
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 120000 });
  await page.waitForFunction(
    () => window.SF.state.run && window.SF.state.run.phase === 'active',
    null, { timeout: 90000 },
  );
  await page.waitForFunction(
    () => window.SF.state.entityList.some((e) => e.alive && e.data && e.data.runCohort === 'survival'),
    null, { timeout: 60000 },
  );
  await page.waitForSelector('#gl-canvas', { timeout: 15000 });
  log('in flight with live hostiles');
}

export async function captureFrameStrip({
  bench = 'crucible',
  scenarioId = 'swarm_idle',
  loadoutId = null,
  seed = 4242,
  candidateId = null,
  outDir = DEFAULT_STRIP_DIR,
  manifestDir = DEFAULT_MANIFEST_DIR,
  headed = false,
  durationS = null,
  verbose = false,
  serverPort = 8520,
  screencastEveryNthFrame = SCREENCAST_EVERY_NTH_FRAME,
  /** Extra Chrome switches (a GPU backend, say) appended after CHROME_ARGS; recorded in the manifest. */
  extraChromeArgs = [],
  /**
   * Where the served game keeps player saves. Defaults to an empty directory under the strip so a
   * capture never reads or writes the owner's real saves (server.js mounts the real store otherwise).
   */
  playerStoreDir = null,
} = {}) {
  const safeBench = assertSafeLeafToken(bench, 'bench');
  const safeScenarioId = assertSafeLeafToken(scenarioId, 'scenarioId');
  const scenario = STRIP_SCENARIOS[safeScenarioId];
  if (!scenario) {
    throw new Error(`unknown strip scenario '${safeScenarioId}'; known: ${Object.keys(STRIP_SCENARIOS).join(', ')}`);
  }
  const sourceIdentity = computeProductionSourceIdentity(ROOT);
  const harnessDigest = computeFunLoopHarnessDigest(ROOT);
  const rawTag = candidateId || `${(sourceIdentity.gitHead || 'head').slice(0, 8)}${sourceIdentity.productionDirty ? `-dirty-${sourceIdentity.productionDiffHash.slice(0, 8)}` : ''}`;
  const safeSourceTag = assertSafeLeafToken(rawTag, 'candidateId/sourceTag');
  const hullId = assertSafeLeafToken(loadoutId || scenario.loadoutId, 'loadoutId');
  const safeSeed = assertSafeLeafToken(String(seed), 'seed');
  const seconds = durationS || scenario.durationS;
  const stripName = `${safeScenarioId}-${hullId}-s${safeSeed}`;
  assertSafeLeafToken(stripName, 'stripName');

  const resolvedOutDir = resolve(outDir);
  const resolvedManifestDir = resolve(manifestDir);

  const targetDir = resolve(resolvedOutDir, safeBench, safeSourceTag, stripName);
  const receiptDir = resolve(resolvedManifestDir, safeBench, safeSourceTag, stripName);

  assertStrictDescendant(targetDir, resolvedOutDir, 'targetDir');
  assertStrictDescendant(receiptDir, resolvedManifestDir, 'receiptDir');
  assertRealpathChainContained(targetDir, resolvedOutDir, 'targetDir');
  assertRealpathChainContained(receiptDir, resolvedManifestDir, 'receiptDir');

  mkdirSync(resolvedOutDir, { recursive: true });
  mkdirSync(resolvedManifestDir, { recursive: true });
  mkdirSync(targetDir, { recursive: true });
  mkdirSync(receiptDir, { recursive: true });

  assertRealpathDescendant(targetDir, resolvedOutDir, 'targetDir');
  assertRealpathDescendant(receiptDir, resolvedManifestDir, 'receiptDir');

  cleanTargetDirectory(targetDir, resolvedOutDir);

  const log = (...a) => { if (verbose) console.log('   [strip]', ...a); };

  let server = null;
  let browser = null;
  try {
    // An empty SPACEFACE_PLAYER_STORE_DIR is the server's explicit unmount: the capture's browser
    // context is fresh every run and never touches the owner's real save drawer.
    server = await startDevServer(serverPort, {
      env: { SPACEFACE_PLAYER_STORE_DIR: playerStoreDir == null ? '' : String(playerStoreDir) },
    });
    const { chromium } = await loadPlaywright();
    const chromeArgs = [...CHROME_ARGS, ...(Array.isArray(extraChromeArgs) ? extraChromeArgs : [])];
    browser = await chromium.launch({ headless: !headed, args: chromeArgs });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String((err && err.message) || err)));

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 90000 });
    // Which GPU drew these pictures. A strip made on a software rasteriser is a different strip,
    // and a critic judging what the frames look like is entitled to know which one it got.
    const webgl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return { webgl: false };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        webgl: true,
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '(no debug ext)',
        parallelShaderCompile: !!gl.getExtension('KHR_parallel_shader_compile'),
      };
    });
    log('booted');

    await driveRealCrucibleRoute(page, { hullId, seed, log });

    // ── HUD text off, and proof that it is off ────────────────────────────────────────────────
    await page.addStyleTag({ content: HUD_TEXT_OFF_CSS });
    const hudSweepStart = await sweepHudText(page);
    if (hudSweepStart.hidden.length) {
      log(`hud sweep hid ${hudSweepStart.hidden.length} text elements the stylesheet missed`);
    }
    const hudCheck = await page.evaluate(() => {
      const root = document.getElementById('ui-root');
      if (!root) return { verified: true, leftovers: [] };
      const leftovers = [];
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        const text = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const el = n.parentElement;
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (el.closest('.sr-only')) continue;
        leftovers.push({ text: text.slice(0, 60), selector: el.className || el.id || el.tagName });
      }
      return { verified: leftovers.length === 0, leftovers: leftovers.slice(0, 10) };
    });
    log(`hud text off: ${hudCheck.verified ? 'verified clean' : `${hudCheck.leftovers.length} leftovers`}`);

    // ── Moment markers off the real bus ───────────────────────────────────────────────────────
    await page.evaluate((events) => {
      window.__stripMoments = [];
      window.__stripShotsFired = 0;
      window.SF.bus.on('combat:fire', (p) => {
        if (p && p.ownerId != null && p.ownerId === window.SF.state.playerId) window.__stripShotsFired += 1;
      });
      window.__stripRunStartTick = window.SF.state.tick;
      // What kind of thing the OTHER party was: 'asteroid', 'ship', 'station', ... A moment that
      // says a ship met a rock is context the frames themselves carry; it never says what the rule
      // did about it — that is the critic's question, not the manifest's answer.
      const typeOf = (id) => {
        const st = window.SF.state;
        const e = id != null && st.entities ? st.entities.get(id) : null;
        return e && e.type ? String(e.type) : null;
      };
      for (const name of events) {
        window.SF.bus.on(name, (p) => {
          const st = window.SF.state;
          if (name === 'projectile:hit' && !(p && p.ownerId != null && p.ownerId === st.playerId)) return;
          let surface = null;
          if (name === 'physics:impact' && p) {
            const a = typeOf(p.aId);
            const b = typeOf(p.bId);
            surface = p.playerInvolved
              ? (p.aId === st.playerId ? b : a)
              : [a, b].filter(Boolean).join('|') || null;
          } else if (name === 'combat:collisionConsequence' && p && p.surface) {
            surface = String(p.surface);
          } else if (name === 'projectile:hit' && p) {
            surface = typeOf(p.targetId);
          }
          const packet = p && p.damagePacket;
          const impulse = packet && (packet.impulse ?? packet.momentum);
          window.__stripMoments.push({
            type: name,
            tick: Math.max(0, Math.trunc(st.tick) - window.__stripRunStartTick),
            simTime: Number(st.simTime.toFixed(4)),
            playerInvolved: name === 'projectile:hit' ? true : !!(p && p.playerInvolved),
            magnitude: Number(((p && (p.dp ?? p.impulse ?? p.exchangedMomentum ?? impulse ?? p.damage)) || 0).toFixed(3)),
            surface,
          });
        });
      }
      return window.__stripMoments.length;
    }, MOMENT_EVENTS);

    const origin = await page.evaluate(() => ({
      runStartTick: window.__stripRunStartTick,
      runStartSimTime: Number(window.SF.state.simTime.toFixed(4)),
      arenaId: window.SF.state.run.arenaId,
      ruleset: window.SF.state.run.ruleset,
      seed: window.SF.state.run.seed,
      kind: window.SF.state.run.kind,
    }));

    // ── The camera we are photographing, measured rather than asserted ────────────────────────
    const camera = await page.evaluate(() => {
      const cam = window.SF.state.render && window.SF.state.render.camera;
      if (!cam) return { available: false };
      const fovDeg = Number(cam.fov) || 0;
      const height = Number(cam.position && cam.position.y) || 0;
      const visibleDepthWU = 2 * height * Math.tan((fovDeg * Math.PI) / 360);
      return {
        available: true,
        heightWU: Number(height.toFixed(2)),
        fovDeg: Number(fovDeg.toFixed(2)),
        aspect: Number((Number(cam.aspect) || 0).toFixed(4)),
        visibleDepthWU: Number(visibleDepthWU.toFixed(2)),
        controller: window.SF.state.render.cameraCtrl ? 'cameraCtrl' : 'unknown',
      };
    });

    // ── Wait for the SHIPS, and throw if they never arrive ────────────────────────────────────
    // Running at normal speed is not the same as having a ship on screen. See waitForHullsDrawn:
    // the first repaired strip was 403 photographs of an empty arena taken at 90 % of real time.
    const hulls = await waitForHullsDrawn(page, { log });
    if (!hulls.drawn) {
      throw new Error(
        `the renderer never drew the ships: after ${hulls.waitedS.toFixed(0)}s the player's authored `
        + `parts drew ${hulls.playerDraws} times, ${hulls.hostilesWithParts} hostiles had parts `
        + `drawing, and the box at the hull held ${hulls.brightPx} lit pixels. A strip photographed `
        + 'now would be an empty arena, and an empty arena that says PASS is the failure this '
        + 'instrument exists to catch.',
      );
    }
    log(`ships drawn after ${hulls.waitedS.toFixed(1)}s (sim ${hulls.simTime.toFixed(1)}s): `
      + `hull ${hulls.hullPx.toFixed(0)}px, ${hulls.brightPx} lit pixels on it, `
      + `${hulls.hostilesWithParts} hostiles drawing`);

    // A scenario's warmup pays one-off admission costs (the first shot's muzzle and impact
    // families) before the settle wait, so the strip is of the verb and not of the game's first
    // hiccup. It runs through the same input path as the tape and is recorded in the manifest.
    let cdp = null;
    const warmup = [...(scenario.warmup || [])].sort((a, b) => a.atS - b.atS);
    const warmupEvents = [];
    if (warmup.length) {
      const warmDriver = createInputDriver(page, { getCdp: () => cdp, log });
      const w0 = Date.now();
      let wi = 0;
      while (wi < warmup.length) {
        const elapsed = (Date.now() - w0) / 1000;
        if (warmup[wi].atS > elapsed) { await page.waitForTimeout(50); continue; }
        const step = warmup[wi++];
        try {
          await warmDriver.runStep(step);
          warmupEvents.push({ atS: step.atS, input: describeTapeStep(step) });
        } catch (e) {
          log(`warmup step failed: ${e.message}`);
        }
      }
      await warmDriver.releaseAll();
      log(`warmup done: ${warmupEvents.map((e) => e.input).join('; ')}`);
    }

    // Hull admission triggers deferred shader work. A fast empty arena before that work
    // is not readiness: the observed 72% window dropped to 14% after hulls arrived.
    const settle = await waitForRealtime(page, { log });
    if (!settle.reachedFloor) throw new Error('The drawn game did not sustain normal speed; capture was not started');
    log('drawn game sustained normal speed for ' + settle.stableWindows + ' windows');

    // ── Record one state sample per drawn frame, inside the page ──────────────────────────────
    // A per-frame `page.evaluate` round trip is what made the first version cost seconds a frame.
    // The page records itself on requestAnimationFrame; node reads the whole array once at the end.
    await page.evaluate(() => {
      window.__stripSamples = [];
      window.__stripRecording = true;
      const THREE = window.SF.THREE;
      const proj = THREE ? new THREE.Vector3() : null;
      const rec = () => {
        if (!window.__stripRecording) return;
        const st = window.SF.state;
        const cam = st.render && st.render.camera;
        const p = st.entities && st.playerId != null ? st.entities.get(st.playerId) : null;
        const speed = p && p.vel ? Math.hypot(p.vel.x || 0, p.vel.z || 0) : null;
        const hostiles = st.entityList.filter((e) => e.alive && e.data && e.data.runCohort === 'survival');
        // Where the ship and the enemies actually are ON SCREEN. A strip whose hull is off frame
        // is not a shipping-camera strip, and only a projection can say so.
        const onScreen = (ent) => {
          if (!proj || !cam || !ent || !ent.pos) return null;
          proj.set(ent.pos.x, ent.pos.y || 0, ent.pos.z).project(cam);
          const inside = Math.abs(proj.x) <= 1 && Math.abs(proj.y) <= 1 && proj.z < 1;
          return { inside, x: Number((proj.x * 0.5 + 0.5).toFixed(3)), y: Number((0.5 - proj.y * 0.5).toFixed(3)) };
        };
        const ps = onScreen(p);
        // What the renderer DREW since the previous sample, not what projects into the frustum.
        // The hooks were installed by waitForHullsDrawn; __stripTally zeroes as it reads and asks
        // where each hooked mesh is NOW, so a pooled or LOD-swapped part reports to the right ship.
        const tally = window.__stripTally
          ? window.__stripTally()
          : { player: 0, hostiles: 0, hostilesDrawing: 0 };
        const hullPartsDrawn = tally.player || 0;
        const hostilePartsDrawn = tally.hostiles || 0;
        const hostilesDrawing = tally.hostilesDrawing || 0;
        window.__stripSamples.push({
          playerRot: p && Number.isFinite(p.rot) ? Number(p.rot.toFixed(4)) : null,
          tetherActive: !!(st.player && st.player.tether && st.player.tether.active),
          hullPartsDrawn,
          hostilePartsDrawn,
          hostilesDrawing,
          wallMs: Date.now(),
          tick: Math.max(0, Math.trunc(st.tick) - window.__stripRunStartTick),
          simTime: Number(st.simTime.toFixed(4)),
          phase: (st.run && st.run.phase) || null,
          wave: (st.run && st.run.wave) || null,
          mode: st.mode,
          hostilesAlive: hostiles.length,
          hostilesOnScreen: hostiles.reduce((n, e) => n + ((onScreen(e) || {}).inside ? 1 : 0), 0),
          playerSpeed: speed == null ? null : Number(speed.toFixed(2)),
          playerAlive: !!(p && p.alive),
          playerOnScreen: ps ? ps.inside : null,
          playerScreenXY: ps ? [ps.x, ps.y] : null,
        });
        requestAnimationFrame(rec);
      };
      requestAnimationFrame(rec);
    });
    // The recorder is itself a per-frame cost; measure it rather than assume it is free.
    const realtimeAfterRecorder = await measureRealtime(page, 2000);
    log(`with the in-page recorder running the game runs at ${(realtimeAfterRecorder * 100).toFixed(0)}% of real time`);

    // ── Stream frames off the compositor (passive; does not stall the renderer) ────────────────
    // MEASURED: an element PNG screenshot costs ~2,100 ms and drops the game to 43 % of real time.
    // A CDP screencast is passive — the compositor hands over frames it already produced — and held
    // ~12 fps at 71 % of real time in the same probe.
    cdp = await context.newCDPSession(page);
    const raw = [];
    cdp.on('Page.screencastFrame', (f) => {
      raw.push({ wallMs: Date.now(), data: f.data });
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    // What the game runs at with nobody photographing it — measured, not assumed, so the cost of
    // the capture itself is always a number in the receipt rather than an argument.
    const realtimeBeforeScreencast = await measureRealtime(page, 3000);
    log(`with the debugger attached but no screencast the game runs at ${(realtimeBeforeScreencast * 100).toFixed(0)}% of real time`);

    const everyNthFrame = Math.max(1, Math.trunc(Number(screencastEveryNthFrame) || 1));
    await cdp.send('Page.startScreencast', {
      format: FRAME_FORMAT, quality: FRAME_QUALITY, maxWidth: 1280, maxHeight: 720, everyNthFrame,
    });

    const tape = [...(scenario.tape || [])].sort((a, b) => a.atS - b.atS);
    let tapeIdx = 0;
    // What the pilot's hands did, stamped with the sim time it happened at, so a critic can line a
    // key press up with the frames (the tape is scheduled by wall clock; frames are indexed by
    // simTime). This is the scenario's own definition, the same kind of fact as the arena and the
    // hull; it never says what the game did in answer.
    const inputEvents = [];
    // The input driver: keys and the cursor through the real input path, the cursor kept on the
    // nearest hostile or rock when a tape step asks, and the press itself dispatched so that it
    // still reaches the canvas while the screencast is running (see createInputDriver).
    const driver = createInputDriver(page, { getCdp: () => cdp, log });
    let lastSweepS = -1;
    let hudSweptDuringRun = 0;
    let stoppedBecause = 'duration reached';
    const wallStart = Date.now();
    const simAtCaptureStart = await page.evaluate(() => window.SF.state.simTime);

    while ((Date.now() - wallStart) / 1000 < seconds) {
      const elapsedS = (Date.now() - wallStart) / 1000;
      // The input tape goes through the real input path — keyboard and mouse events, never a
      // state write. A tape that pokes the sim directly is not a player and proves nothing.
      while (tapeIdx < tape.length && tape[tapeIdx].atS <= elapsedS) {
        const step = tape[tapeIdx++];
        try {
          await driver.runStep(step);
          const stamp = await page.evaluate(() => ({
            simTime: Number(window.SF.state.simTime.toFixed(3)),
            tick: Math.max(0, Math.trunc(window.SF.state.tick) - window.__stripRunStartTick),
          }));
          inputEvents.push({
            atS: step.atS,
            simTime: stamp.simTime,
            tick: stamp.tick,
            input: describeTapeStep(step),
          });
        } catch (e) {
          log(`input step failed: ${e.message}`);
        }
      }
      await driver.pollAim();
      const live = await page.evaluate(() => ({
        mode: window.SF.state.mode,
        phase: (window.SF.state.run && window.SF.state.run.phase) || null,
      }));
      // A dead or finished run must not keep photographing: those frames are a results screen.
      if (live.mode !== 'flight') { stoppedBecause = `mode left flight (${live.mode})`; break; }
      if (live.phase !== 'active') { stoppedBecause = `run phase left active (${live.phase})`; break; }
      // A contract card, a custody panel or a toast that appears now is on every frame after it.
      // Sweeping once a second costs nothing and is the only thing that keeps the glass clean for
      // the whole strip rather than for its first instant.
      if (Math.floor(elapsedS) !== lastSweepS) {
        lastSweepS = Math.floor(elapsedS);
        // A LOD swap mid-run introduces a mesh nobody is counting; hook it before it matters.
        await installDrawHooks(page);
        const midSweep = await sweepHudText(page, { onlyIfChanged: true });
        if (midSweep.hidden.length) {
          hudSweptDuringRun += midSweep.hidden.length;
          log(`hud sweep at ${elapsedS.toFixed(0)}s hid ${midSweep.hidden.length}: `
            + midSweep.hidden.map((h) => h.text).join(' | '));
        }
      }
      await page.waitForTimeout(250);
    }

    const captureWallS = (Date.now() - wallStart) / 1000;
    const simAtCaptureEnd = await page.evaluate(() => window.SF.state.simTime);
    const realtimeFraction = captureWallS > 0 ? (simAtCaptureEnd - simAtCaptureStart) / captureWallS : 0;

    await cdp.send('Page.stopScreencast').catch(() => {});
    await driver.releaseAll();
    // With the screencast stopped and the debugger still attached: if the game springs back, the
    // encoding was the cost; if it stays slow, something else in the run (a wave, a stall) was.
    const realtimeAfterScreencast = await measureRealtime(page, 3000);
    log(`with the screencast stopped the game runs at ${(realtimeAfterScreencast * 100).toFixed(0)}% of real time`);

    const pageSamples = await page.evaluate(() => {
      window.__stripRecording = false;
      return window.__stripSamples || [];
    });
    if (raw.length === 0) throw new Error('the screencast delivered zero frames');
    if (pageSamples.length === 0) throw new Error('the in-page recorder produced zero samples');

    // Align each streamed frame to the drawn frame it belongs to, by wall clock. Both clocks are
    // this machine's, so the residual is delivery latency; it is recorded, not assumed away.
    const samples = [];
    let alignWorstMs = 0;
    for (const frame of raw) {
      let best = null;
      let bestDelta = Infinity;
      for (const s of pageSamples) {
        const d = Math.abs(s.wallMs - frame.wallMs);
        if (d < bestDelta) { bestDelta = d; best = s; }
      }
      if (!best || bestDelta > 250) continue;
      if (best.phase !== 'active' || best.mode !== 'flight') continue;
      alignWorstMs = Math.max(alignWorstMs, bestDelta);
      samples.push({ ...best, alignMs: bestDelta, bytes: Buffer.from(frame.data, 'base64') });
    }
    samples.sort((a, b) => a.wallMs - b.wallMs);
    if (samples.length === 0) throw new Error('no streamed frame could be aligned to a live sample');

    const rawMoments = await page.evaluate(() => window.__stripMoments || []);
    const playerShotsFired = await page.evaluate(() => window.__stripShotsFired || 0);
    // TWO lists, because they answer two different questions and conflating them broke both.
    //
    //   `moments`       — every moment since the run began, including the minutes spent waiting for
    //                     the renderer to admit the hulls. This is the run's own event stream, and
    //                     it is what `compareStripEventTicks` compares: two runs of one seed must
    //                     agree about when things happened, and that is a fact about the SIM, which
    //                     starts at tick 0, not about the window someone photographed.
    //   `momentsInSpan` — the ones a viewer of these frames can actually see. Retention, the
    //                     `nearMoment` flag and the critic all use this one. Before the split, a
    //                     collision from ninety seconds before the first frame marked every frame
    //                     "near a moment", so the 8 fps burst silently became the baseline.
    const moments = condenseMoments(rawMoments);
    const spanFrom = samples[0].simTime - MOMENT_LEAD_S;
    const spanTo = samples[samples.length - 1].simTime + MOMENT_TAIL_S;
    const momentsInSpan = moments.filter((m) => m.simTime >= spanFrom && m.simTime <= spanTo);

    // ── Retain 4 fps baseline / 8 fps around moments, then write ──────────────────────────────
    const keep = retentionMask(samples, momentsInSpan);
    const frames = [];
    let outIndex = 0;
    for (let i = 0; i < samples.length; i++) {
      if (!keep[i]) continue;
      const s = samples[i];
      const name = `frame_${String(outIndex).padStart(3, '0')}.${FRAME_FORMAT === 'jpeg' ? 'jpg' : 'png'}`;
      writeFileSync(join(targetDir, name), s.bytes);
      frames.push({
        index: outIndex,
        file: name,
        tick: s.tick,
        simTime: s.simTime,
        // Wall-clock seconds since the first streamed frame, so slow motion can be located, not
        // just averaged: simTime against wallS says how fast the game was running right here.
        wallS: Number(((s.wallMs - samples[0].wallMs) / 1000).toFixed(3)),
        phase: s.phase,
        wave: s.wave,
        hostilesAlive: s.hostilesAlive,
        hostilesOnScreen: s.hostilesOnScreen,
        playerSpeed: s.playerSpeed,
        playerOnScreen: s.playerOnScreen,
        playerScreenXY: s.playerScreenXY,
        playerRot: s.playerRot ?? null,
        tetherActive: s.tetherActive === true,
        // playerOnScreen is a frustum claim; these two are render evidence.
        hullPartsDrawn: s.hullPartsDrawn ?? null,
        hostilesDrawing: s.hostilesDrawing ?? null,
        alignMs: s.alignMs,
        nearMoment: momentsInSpan.some((m) => s.simTime >= m.simTime - MOMENT_LEAD_S && s.simTime <= m.simTime + MOMENT_TAIL_S),
      });
      outIndex++;
    }

    // Monotone ticks are a manifest invariant, not a hope: assert it here so a broken clock is a
    // failed capture rather than a critic's confusion.
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].tick < frames[i - 1].tick) {
        throw new Error(`manifest ticks are not monotone at frame ${i} (${frames[i - 1].tick} -> ${frames[i].tick})`);
      }
    }

    // ── A strip with no ship in it must not become a manifest ─────────────────────────────────
    // Not "most frames"; the median. One lucky frame is not a strip, and a run that lost the ship
    // for half its length is not a shipping-camera pass of a fight.
    const drawnPerFrame = frames.map((f) => f.hullPartsDrawn || 0).sort((a, b) => a - b);
    const medianHullDraws = drawnPerFrame.length ? drawnPerFrame[Math.floor(drawnPerFrame.length / 2)] : 0;
    const framesWithHull = frames.filter((f) => (f.hullPartsDrawn || 0) > 0).length;
    if (medianHullDraws <= 0) {
      throw new Error(
        `the ship was not drawn in most of the ${frames.length} retained frames `
        + `(${framesWithHull} had it). This is the empty-arena strip again; refusing to write a manifest.`,
      );
    }

    // HUD text was verified clean before the run. Toasts arrive DURING it, so verify again at the
    // end: a caption that appeared at second nine is on the frames whether or not it was there at
    // second zero.
    const hudCheckEnd = await sweepHudText(page);
    if (!hudCheckEnd.verified) {
      log(`hud text leaked during the run: ${hudCheckEnd.leftovers.map((l) => l.text).join(' | ')}`);
    }

    const spanS = frames.length > 1 ? frames[frames.length - 1].simTime - frames[0].simTime : 0;
    const contactSheet = await writeContactSheet(context, targetDir, frames, join(receiptDir, 'contact-sheet.png'));
    const realtimeSegments = realtimeBySegment(frames);
    const visibleJitter = measureVisibleJitter(frames, momentsInSpan, inputEvents);
    const tetherFrames = frames.filter((f) => f.tetherActive).length;

    const manifest = {
      schema: 'spaceface.frameStripManifest.v2',
      bench,
      scenarioId,
      scenarioLabel: scenario.label,
      loadoutId: hullId,
      sourceIdentity,
      harnessDigest,
      arenaId: origin.arenaId,
      ruleset: origin.ruleset,
      seed: origin.seed,
      runKind: origin.kind,
      route: 'real player click-through (title -> Crucible door -> hull/seed -> Hold the line)',
      camera: 'shipping_chase',
      cameraMeasured: camera,
      hudText: 'off',
      hudTextVerified: hudCheck.verified && hudCheckEnd.verified,
      hudTextLeftovers: hudCheck.leftovers.concat(hudCheckEnd.leftovers),
      hudTextVerifiedAtStart: hudCheck.verified,
      hudTextVerifiedAtEnd: hudCheckEnd.verified,
      hudTextSweptAtStart: hudSweepStart.hidden.map((h) => `${h.selector}: ${h.text}`),
      hudTextSweptDuringRun: hudSweptDuringRun,
      webglRenderer: webgl.renderer || 'unknown',
      parallelShaderCompile: !!webgl.parallelShaderCompile,
      // The ships, proved rather than projected. `hullWait` is how long the renderer took to admit
      // the authored parts after the run started running at speed; `hullDrawn` is what the retained
      // frames actually show.
      hullWait: {
        waitedS: Number((hulls.waitedS || 0).toFixed(2)),
        drawnAtSimTime: hulls.simTime,
        hullPx: hulls.hullPx,
        litPixelsOnHull: hulls.brightPx,
        litPixelsBoxArea: hulls.boxPx || null,
        hostilesDrawing: hulls.hostilesWithParts,
        evidence: 'three.js onAfterRender on the authored LOD parts, counted only for the on-screen pass '
          + 'through the shipping camera, attributed to whichever ship the mesh is on at read time, '
          + '+ lit pixels in a box at the projected hull',
        // Recorded rather than solved: three.js frustum-culls but does not occlusion-cull, so a hull
        // behind an asteroid still counts as drawn, and a bright rock inside the box still counts as
        // lit. Both signals would have to be fooled at once, and the frames are looked at by eye
        // before a strip is announced.
        knownLimits: 'no occlusion test; the lit-pixel box does not separate hull from background',
      },
      hullDrawn: {
        medianPartsPerFrame: medianHullDraws,
        framesWithHull,
        framesTotal: frames.length,
      },
      captureMethod: `cdp screencast, ${FRAME_FORMAT}${FRAME_FORMAT === 'jpeg' ? ` q${FRAME_QUALITY}` : ''}`
        + ' (passive; the compositor hands over frames it already drew)',
      frameFormat: FRAME_FORMAT,
      frameQuality: FRAME_FORMAT === 'jpeg' ? FRAME_QUALITY : null,
      screencastEveryNthFrame: everyNthFrame,
      chromeArgs,
      // How much of the slowdown is the game and how much is the photographer, stage by stage:
      // the drawn game settled with nobody watching, then with the in-page recorder, then with the
      // debugger attached, then with the screencast encoding. Each is simTime over wall clock.
      realtimeStages: {
        settled: Number(settle.fraction.toFixed(3)),
        afterRecorder: Number(realtimeAfterRecorder.toFixed(3)),
        beforeScreencast: Number(realtimeBeforeScreencast.toFixed(3)),
        duringScreencast: Number(realtimeFraction.toFixed(3)),
        afterScreencast: Number(realtimeAfterScreencast.toFixed(3)),
      },
      realtimeBeforeScreencast: Number(realtimeBeforeScreencast.toFixed(3)),
      sampleHz: SAMPLE_HZ,
      baselineFps: 4,
      momentFps: SAMPLE_HZ,
      momentLeadS: MOMENT_LEAD_S,
      momentTailS: MOMENT_TAIL_S,
      simHz: 60,
      runStartTick: origin.runStartTick,
      tickBasis: 'run-relative (state.tick minus the tick at launch)',
      requestedDurationS: seconds,
      capturedSpanS: Number(spanS.toFixed(3)),
      // "At normal speed" as a number rather than a promise. Below NORMAL_SPEED_FLOOR the strip is
      // slow motion and a critic judging turn rate or reaction time from it would be judging the
      // capture, not the game.
      settleWaitS: Number(settle.waitedS.toFixed(2)),
      settleFraction: Number(settle.fraction.toFixed(3)),
      realtimeFraction: Number(realtimeFraction.toFixed(3)),
      normalSpeed: realtimeFraction >= NORMAL_SPEED_FLOOR,
      normalSpeedFloor: NORMAL_SPEED_FLOOR,
      // Where the strip ran slow, in five-second wall-clock segments, so a strip under the floor
      // can be diagnosed (the boost that spawns a new rock field, a first-fire stall) rather than
      // recaptured blind.
      realtimeSegments,
      // How many shots the player fired during the strip (combat:fire owned by the player) — a
      // shove strip with zero is a strip of nothing, whatever its frames show.
      playerShotsFired,
      // Frames on which the Massline was live, for the rope tape.
      tetherActiveFrames: tetherFrames,
      // B13's visible-jitter clause, measured from the pictures: after each contact the player was
      // in, does the hull's heading or its motion on the glass reverse within half a second?
      visibleJitter,
      streamedFrames: raw.length,
      deliveredFps: Number((raw.length / Math.max(captureWallS, 1e-6)).toFixed(2)),
      pageSamples: pageSamples.length,
      alignWorstMs,
      stoppedBecause,
      sampledCount: samples.length,
      framesCount: frames.length,
      momentsCount: moments.length,
      momentsInSpanCount: momentsInSpan.length,
      rawMomentsCount: rawMoments.length,
      momentFilter: `physics:impact kept only when it involves the player or exchanges >= ${MOMENT_IMPACT_FLOOR} momentum; moments within ${MOMENT_MERGE_S}s merged`,
      pageErrors,
      capturedAt: new Date().toISOString(),
      stripDir: targetDir,
      receiptDir,
      contactSheet,
      inputTape: tape,
      inputEvents,
      warmup: warmupEvents,
      pressMethod: driver.pressMethod,
      moments,
      momentsInSpan,
      frames,
    };
    writeFileSync(join(targetDir, 'strip-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    writeFileSync(join(receiptDir, 'strip-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    return { ok: true, targetDir, receiptDir, manifest, framesCount: frames.length };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.kill();
  }
}

/**
 * simTime advanced over wall clock, per wall-clock segment of the retained frames. Pure.
 *
 * @param {Array<{simTime:number, wallS:number}>} frames
 * @param {number} [segmentS]
 * @returns {Array<{fromWallS:number, toWallS:number, realtime:number}>}
 */
export function realtimeBySegment(frames, segmentS = 5) {
  const out = [];
  if (!Array.isArray(frames) || frames.length < 2) return out;
  const last = frames[frames.length - 1];
  for (let from = 0; from < last.wallS; from += segmentS) {
    const to = from + segmentS;
    const inside = frames.filter((f) => f.wallS >= from && f.wallS <= to);
    if (inside.length < 2) continue;
    const a = inside[0];
    const b = inside[inside.length - 1];
    const wall = b.wallS - a.wallS;
    if (!(wall > 0)) continue;
    out.push({ fromWallS: from, toWallS: Number(b.wallS.toFixed(2)), realtime: Number(((b.simTime - a.simTime) / wall).toFixed(3)) });
  }
  return out;
}

/**
 * Where the nearest live hostile (or rock) is on the glass, and the cursor moved onto it.
 * Real pointer events, never a state write; null when nothing of that kind is on screen.
 */
export async function aimAtNearest(page, kind) {
  const target = await page.evaluate((kind) => {
    const st = window.SF.state;
    const THREE = window.SF.THREE;
    const cam = st.render && st.render.camera;
    const p = st.entities && st.playerId != null ? st.entities.get(st.playerId) : null;
    if (!THREE || !cam || !p || !p.pos) return null;
    const v = new THREE.Vector3();
    let best = null;
    for (const e of st.entityList) {
      if (!e.alive || !e.pos || e.id === st.playerId) continue;
      if (kind === 'asteroid' ? e.type !== 'asteroid' : !(e.data && e.data.runCohort === 'survival')) continue;
      v.set(e.pos.x, e.pos.y || 0, e.pos.z).project(cam);
      if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z >= 1) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (!best || d < best.d) {
        best = { d, x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (0.5 - v.y * 0.5) * window.innerHeight };
      }
    }
    return best;
  }, kind);
  if (target) await page.mouse.move(target.x, target.y);
  return target;
}

/**
 * The press. MEASURED 2026-09-05: while a CDP screencast is running on the page, Playwright's
 * page.mouse.down() is unreliable — three seconds of a held button aimed at a hostile produced zero
 * shots (state.input.fire stayed false) in one boot, where the same press with no screencast
 * produced five shots and five hits, and a press dispatched through the screencast's own debugger
 * session produced three of three. The press therefore goes through that session when one exists.
 * It is still a pointer event into the page and still the canvas listener; never a state write.
 * The manifest records which path was used.
 */
export const PRESS_METHOD = Object.freeze({ playwright: 'playwright-mouse', cdp: 'cdp-session-mouse' });

export function createInputDriver(page, { getCdp = () => null, log = () => {} } = {}) {
  const state = { aimMode: null, pointer: { x: 880, y: 300 }, pressMethod: null };
  const moveTo = async (x, y) => {
    state.pointer = { x, y };
    await page.mouse.move(x, y);
  };
  const aimForMode = async () => {
    const kind = state.aimMode === 'nearestHostile' ? 'hostile' : state.aimMode === 'nearestAsteroid' ? 'asteroid' : null;
    if (!kind) return null;
    const t = await aimAtNearest(page, kind);
    if (t) state.pointer = { x: t.x, y: t.y };
    return t;
  };
  const pressDown = async () => {
    const cdp = getCdp();
    const { x, y } = state.pointer;
    if (cdp) {
      state.pressMethod = PRESS_METHOD.cdp;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    } else {
      state.pressMethod = PRESS_METHOD.playwright;
      await page.mouse.down();
    }
  };
  const pressUp = async () => {
    const cdp = getCdp();
    const { x, y } = state.pointer;
    if (cdp) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }).catch(() => {});
    } else {
      await page.mouse.up().catch(() => {});
    }
  };
  return {
    state,
    get pressMethod() { return state.pressMethod; },
    async runStep(step) {
      if (step.keyDown) await page.keyboard.down(step.keyDown);
      if (step.keyUp) await page.keyboard.up(step.keyUp);
      if (Array.isArray(step.mouseMove)) await moveTo(step.mouseMove[0], step.mouseMove[1]);
      if ('aim' in step) {
        state.aimMode = step.aim || null;
        await aimForMode();
      }
      if (step.mouseDown) {
        if (!(await aimForMode()) && !Array.isArray(step.mouseMove)) await moveTo(880, 300);
        await pressDown();
      }
      if (step.mouseUp) await pressUp();
    },
    async pollAim() {
      if (state.aimMode) await aimForMode();
    },
    async releaseAll() {
      for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space']) { try { await page.keyboard.up(k); } catch { /* not held */ } }
      await pressUp();
      try { await page.mouse.up(); } catch { /* not held */ }
      log('inputs released');
    },
  };
}

/** Half a second after a contact is where a wobble would show. */
export const VISIBLE_JITTER_WINDOW_S = 0.5;
// How long after a key transition the glass is still showing the pilot's hands rather than the
// hull's own behaviour. A reversal inside this shadow is the pilot.
export const COMMANDED_INPUT_LEAD_S = 0.15;
// `SANE_MAX_YAW_RATE` in src/core/sg02DynamicBodyOwner.js — the absolute yaw ceiling every body
// except the player is held to. A frame-to-frame rotation implying more than this cannot be read
// off a strip: the wrapped sample is one of infinitely many rotations that would look identical.
export const READABLE_MAX_YAW_RATE = 6.0; // rad/s

function wrapAngle(a) {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

/**
 * B13 (FEEL_CONTRACT §B): "never produces visible jitter". Measured from the retained frames, the
 * way a viewer sees it: for each contact the player was in, the frames inside the next half second;
 * a heading reversal is the hull's yaw changing direction between consecutive frames, a motion
 * reversal is the hull's movement on the glass turning back on itself. Pure over the manifest.
 *
 * @returns {{measured:boolean, windows:number, headingReversals:number, screenReversals:number, events:number, windowS:number, cadenceFpsMin:number|null, note:string}}
 */
export function measureVisibleJitter(frames, momentsInSpan, inputEvents) {
  const firstT = Array.isArray(frames) && frames.length ? frames[0].simTime : -Infinity;
  // Only contacts a viewer can see the aftermath of: inside the photographed span. The moments list
  // carries eight seconds of lead for retention, and a contact before the first frame has no window.
  const contacts = (momentsInSpan || []).filter((m) => m && m.playerInvolved && m.simTime >= firstT
    && (m.type === 'physics:impact' || m.type === 'combat:collisionConsequence'));
  const out = {
    measured: false,
    windows: 0,
    headingReversals: 0,
    screenReversals: 0,
    commandedHeadingReversals: 0,
    commandedScreenReversals: 0,
    unreadableSteps: 0,
    unreadableWindows: 0,
    events: 0,
    windowS: VISIBLE_JITTER_WINDOW_S,
    cadenceFpsMin: null,
    commandedLeadS: COMMANDED_INPUT_LEAD_S,
    unreadableAboveRadS: READABLE_MAX_YAW_RATE,
    note: '',
  };
  if (!Array.isArray(frames) || frames.length < 3) { out.note = 'too few frames'; return out; }
  if (contacts.length === 0) { out.measured = true; out.note = 'no contact involved the player inside the strip'; return out; }
  // The pilot's own hands, from the scenario's own tape. A reversal that lines up with the pilot
  // letting go of a turn key is the pilot, not a wobble the contact put in the hull, and counting
  // it as jitter grades the tape instead of the game.
  const yawKeyTimes = commandedInputTimes(inputEvents, ['turn left', 'turn right']);
  const motionKeyTimes = commandedInputTimes(inputEvents, ['reverse/brake', 'forward']);
  let cadenceMin = null;
  for (const m of contacts) {
    const t = Number(m.simTime) || 0;
    const w = frames.filter((f) => f.simTime > t && f.simTime <= t + VISIBLE_JITTER_WINDOW_S);
    if (w.length < 3) continue;
    out.windows += 1;
    const fps = (w.length - 1) / Math.max(1e-6, w[w.length - 1].simTime - w[0].simTime);
    cadenceMin = cadenceMin == null ? fps : Math.min(cadenceMin, fps);
    let headingRev = 0;
    let screenRev = 0;
    let commandedHeadingRev = 0;
    let commandedScreenRev = 0;
    let unreadable = 0;
    let prevDRot = null;
    let prevDx = null;
    let prevDy = null;
    for (let i = 1; i < w.length; i++) {
      const a = w[i - 1];
      const b = w[i];
      if (Number.isFinite(a.playerRot) && Number.isFinite(b.playerRot)) {
        const dRot = wrapAngle(b.playerRot - a.playerRot);
        const gap = Math.max(1e-6, b.simTime - a.simTime);
        // Beyond this the wrapped sample is not a measurement of the rotation: the hull could have
        // turned that far, or that far plus any number of whole turns, and the frames cannot tell.
        // Measured on the live build 2026-09-05: a starter pulse hit spins the player hull to
        // 160 rad/s, which at a strip's 7.5 fps is 21 radians between frames.
        const unreadableStep = Math.abs(dRot) / gap > READABLE_MAX_YAW_RATE;
        if (unreadableStep) unreadable += 1;
        else if (prevDRot != null && Math.abs(dRot) > 1e-3 && Math.abs(prevDRot) > 1e-3
          && Math.sign(dRot) !== Math.sign(prevDRot)) {
          if (straddlesCommandedInput(yawKeyTimes, a.simTime, b.simTime)) commandedHeadingRev += 1;
          else headingRev += 1;
        }
        if (!unreadableStep && Math.abs(dRot) > 1e-3) prevDRot = dRot;
      }
      if (Array.isArray(a.playerScreenXY) && Array.isArray(b.playerScreenXY)) {
        const dx = b.playerScreenXY[0] - a.playerScreenXY[0];
        const dy = b.playerScreenXY[1] - a.playerScreenXY[1];
        const moved = Math.hypot(dx, dy) > 0.004;
        if (prevDx != null && moved && (dx * prevDx + dy * prevDy) < 0) {
          if (straddlesCommandedInput(motionKeyTimes, a.simTime, b.simTime)) commandedScreenRev += 1;
          else screenRev += 1;
        }
        if (moved) { prevDx = dx; prevDy = dy; }
      }
    }
    out.headingReversals += headingRev;
    out.screenReversals += screenRev;
    out.commandedHeadingReversals += commandedHeadingRev;
    out.commandedScreenReversals += commandedScreenRev;
    out.unreadableSteps += unreadable;
    if (unreadable > 0) out.unreadableWindows += 1;
    if (headingRev > 0 || screenRev > 0) out.events += 1;
  }
  // Fail-closed, the same shape as the three-frame rule: a window the cadence could not read is
  // not a window that showed no wobble. It is a window nobody looked at.
  out.measured = out.windows > 0 && out.unreadableWindows === 0;
  out.cadenceFpsMin = cadenceMin == null ? null : Number(cadenceMin.toFixed(2));
  if (out.windows === 0) out.note = 'contacts happened but no window held three frames';
  else if (out.unreadableWindows > 0) {
    out.note = `${out.unreadableWindows} of ${out.windows} contact window(s) contain a rotation step `
      + `above ${READABLE_MAX_YAW_RATE} rad/s — cadence below Nyquist for that rate, so the hull's `
      + 'turn cannot be recovered from these frames: unmeasured, never a pass';
  } else {
    out.note = `${out.windows} contact window(s) of ${VISIBLE_JITTER_WINDOW_S}s at >= ${out.cadenceFpsMin} fps; `
      + `a reversal inside a window is a wobble a viewer sees (${out.commandedHeadingReversals} heading and `
      + `${out.commandedScreenReversals} motion reversal(s) lined up with the pilot's own key transitions `
      + `within ${COMMANDED_INPUT_LEAD_S}s and are the pilot, not jitter)`;
  }
  return out;
}

/** Sim times of the tape steps whose description names any of these controls. */
function commandedInputTimes(inputEvents, names) {
  const out = [];
  for (const e of Array.isArray(inputEvents) ? inputEvents : []) {
    if (!e || !Number.isFinite(e.simTime) || typeof e.input !== 'string') continue;
    for (const name of names) {
      if (e.input.includes(name)) { out.push(e.simTime); break; }
    }
  }
  return out;
}

/**
 * True when a key transition happened between these two frames, or up to COMMANDED_INPUT_LEAD_S
 * before the first of them — the window in which the reversal on the glass is the pilot's hands
 * arriving, not the hull wobbling.
 */
function straddlesCommandedInput(times, aT, bT) {
  for (const t of times) {
    if (t >= aT - COMMANDED_INPUT_LEAD_S && t <= bT) return true;
  }
  return false;
}

/** A tape step in the words a pilot would use: "forward held", "boost released", "fire held". */
export function describeTapeStep(step) {
  const names = {
    KeyW: 'forward', KeyS: 'reverse/brake', KeyA: 'turn left', KeyD: 'turn right',
    ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'Massline (latch/cut)', KeyF: 'Massline (latch/cut)',
  };
  const parts = [];
  if (step.keyDown) parts.push(`${names[step.keyDown] || step.keyDown} held`);
  if (step.keyUp) parts.push(`${names[step.keyUp] || step.keyUp} released`);
  if (Array.isArray(step.mouseMove)) parts.push('aim moved');
  if ('aim' in step) {
    parts.push(step.aim === 'nearestHostile' ? 'cursor kept on the nearest hostile'
      : step.aim === 'nearestAsteroid' ? 'cursor kept on the nearest rock' : 'cursor parked');
  }
  if (step.keyDown === 'Space' || step.keyUp === 'Space') {
    return parts.map((x) => x.replace(/^Space /, 'Massline ')).join(', ');
  }
  if (step.mouseDown) parts.push('fire held');
  if (step.mouseUp) parts.push('fire released');
  return parts.join(', ') || 'nothing';
}

async function clickButtonByText(page, label) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('#screens button')];
    const b = all.find((x) => norm(x.textContent) === norm(wanted))
      || all.find((x) => norm(x.textContent).includes(norm(wanted)));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, label);
}

/**
 * One contact sheet, six across and two down, so a reviewer can see the whole strip at a glance
 * without opening twenty files. Built by compositing data URIs in a blank page — no image
 * dependency enters the repo for a thumbnail grid.
 */
async function writeContactSheet(context, stripDir, frames, outPath) {
  if (frames.length === 0) return null;
  const picks = [];
  for (let i = 0; i < 12; i++) {
    const idx = frames.length === 1 ? 0 : Math.round((i * (frames.length - 1)) / 11);
    if (!picks.includes(idx)) picks.push(idx);
  }
  const { readFileSync } = await import('node:fs');
  const cells = picks.map((idx) => {
    const f = frames[idx];
    const b64 = readFileSync(join(stripDir, f.file)).toString('base64');
    const mime = f.file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    return `<figure><img src="data:${mime};base64,${b64}"><figcaption>${f.index} · ${f.simTime.toFixed(1)}s${f.nearMoment ? ' ·' : ''}</figcaption></figure>`;
  }).join('');
  const sheet = await context.newPage();
  try {
    await sheet.setViewportSize({ width: 1224, height: 430 });
    await sheet.setContent(`<style>
      body{margin:0;background:#05070d;display:grid;grid-template-columns:repeat(6,200px);gap:2px;padding:2px}
      figure{margin:0;position:relative}
      img{width:200px;height:113px;display:block}
      figcaption{position:absolute;left:2px;bottom:2px;color:#7af7d0;font:9px monospace;background:rgba(0,0,0,.6);padding:0 3px}
    </style>${cells}`);
    await sheet.screenshot({ path: outPath, fullPage: true });
    return outPath;
  } finally {
    await sheet.close().catch(() => {});
  }
}
