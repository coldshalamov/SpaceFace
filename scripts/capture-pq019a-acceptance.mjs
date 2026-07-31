#!/usr/bin/env node
// PQ-019A presentation stills — the heist facilities and capsule on the ordinary player route.
//
// Boots the canonical New Game route, flies the player to Tethys Junction where the heistFacilities
// owner materializes the launcher, lawful catcher and fence, then photographs each one at matched
// close/default/far GAME-CAMERA framings. It also schedules a real launch so the player-visible
// T-minus cue and the physical capsule are both captured on the live route.
//
// THESE ARE PRESENTATION STILLS. This script measures nothing and must never be cited as
// performance, residency, draw-count or GPU-admission evidence — those rows belong to the packet
// holding the performance-evidence lease. It deliberately records no frame timings for that reason.
//
// The camera control idiom (state.camera.zoom + the camera:zoom bus event) is the one already used
// by the accepted geological-landmark evidence. The close/default/far distances are derived from
// each subject's own radius rather than copied as absolute zoom values, because these subjects
// differ in size by 4x and a fixed zoom triple frames them incomparably.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import pq019aCapsulePresentationManifest from './validation-manifests/pq019a-capsule-presentation.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'pq019a-acceptance');
const MANIFEST = path.join(OUT, 'manifest.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const SECTOR_ID = 'sector_tethys_junction';
const CAPTURE_SEED = 0x50513139; // "PQ19"
const SCHEDULE_ID = 'pq019a-capture-route';
const ADMISSION_TIMEOUT_MS = Math.max(5_000, Number(process.env.SPACEFACE_ADMISSION_TIMEOUT_MS) || 120_000);
const MIN_PNG_BYTES = 15_000;

// Matched framings, expressed as a multiple of the SUBJECT's own radius rather than as absolute
// zoom. A 24 WU facility and a 6 WU capsule then read comparably instead of one overflowing the
// frame while the other becomes a speck. `zoomRadii` sets camera distance; `offsetRadii` sets how
// far the player parks from the subject so its hull does not occlude it.
//
// Absolute zoom is NOT hardcoded here because the camera's visible extent scales with zoom (the
// visible half-height is roughly a third of the zoom value), so a fixed 48/72/140 triple frames a
// 16 WU asteroid and a 24 WU outpost completely differently. The harness projects the subject to
// screen space after positioning and refuses to ship a still where it is out of frame.
const FRAMINGS = Object.freeze([
  Object.freeze({ name: 'close', zoomRadii: 3.0, offsetRadii: 1.3 }),
  Object.freeze({ name: 'default', zoomRadii: 5.5, offsetRadii: 2.0 }),
  Object.freeze({ name: 'far', zoomRadii: 11.0, offsetRadii: 3.2 }),
]);
const CAMERA_ZOOM_MAX = 330;   // src/render/camera.js
const NDC_LIMIT = 0.62;        // subject must sit inside this fraction of the frame

const FACILITIES = Object.freeze([
  Object.freeze({ id: 'heist_launcher', role: 'heist_launcher_visual', label: 'Tethys Surface Launcher' }),
  Object.freeze({ id: 'lawful_catcher', role: 'lawful_catcher_visual', label: 'Concord Lawful Catcher' }),
  Object.freeze({ id: 'fence_receiver', role: 'fence_receiver_visual', label: 'Quiet Fence Receiver' }),
]);

function systemBrowser() {
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync) || null;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

async function screenshot(page, name, entry) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, type: 'png' });
  const info = await stat(file);
  const bytes = await readFile(file);
  assert.equal(
    bytes.subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a',
    `${relative(file)} must be a real PNG`,
  );
  assert.ok(info.size >= MIN_PNG_BYTES, `${relative(file)} is too small (${info.size} bytes) to show anything`);
  return {
    ...entry,
    file: relative(file),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

// Authored place assets are admitted only inside the renderer's prefetch runway (immediate radius
// 1000 WU around the player, 2400 on an approach vector — see isEntityAuthoredUpgradeRelevant in
// src/render/renderer.js). The three facilities sit thousands of WU apart, so evidence has to be
// gathered the way a player would gather it: fly to a facility, let it decode, photograph it, move
// on. Waiting for all of them to be ready at once never happens by design.
async function findEntity(page, role) {
  return page.waitForFunction((wanted) => {
    const entity = window.SF.state.entityList.find((candidate) => (
      candidate?.alive !== false && candidate.data?.heistFacilityRole === wanted
    ));
    return entity ? entity.id : null;
  }, role, { timeout: 60_000 }).then((handle) => handle.jsonValue());
}

async function waitForAdmission(page, targetId, { requireAuthored }) {
  await page.waitForFunction(({ targetId, requireAuthored }) => {
    const entity = window.SF.state.entities.get(targetId);
    if (!entity || entity.presentationAdmission !== 'ready') return false;
    if (!requireAuthored) return true;
    return String(entity.mesh?.userData?.authoredAssetState || '').startsWith('authored');
  }, { targetId, requireAuthored }, { timeout: ADMISSION_TIMEOUT_MS });
}

// Place the player so `targetId` sits in frame at the requested framing, then let the renderer
// settle and report exactly what was on screen.
async function frameSubject(page, targetId, framing) {
  return page.evaluate(async ({ targetId, framing, zoomMax, ndcLimit }) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const target = state.entities.get(targetId);
    if (!target?.pos) throw new Error(`missing capture subject ${targetId}`);

    const cameraObject = () => (
      state.render?.cameraCtrl?.obj
      || state.render?.cameraCtrl?.camera
      || state.render?.camera
      || null
    );
    // The renderer runs on a floating frame origin (camera.js globalToFrame), so the camera lives in
    // frame-local space while entity.pos is global. Projecting entity.pos directly yields garbage.
    // The mesh's scene-graph world position is already in the camera's space, so use that.
    const project = () => {
      const cam = cameraObject();
      if (!cam || !window.SF.THREE || !target.mesh?.getWorldPosition) return null;
      const v = new window.SF.THREE.Vector3();
      target.mesh.getWorldPosition(v);
      v.project(cam);
      return { x: v.x, y: v.y };
    };
    const settle = async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    };

    const radius = Number(target.data?.placeRadius || target.radius || 12);
    const zoom = Math.min(zoomMax, Math.max(24, radius * framing.zoomRadii));
    state.camera.zoom = zoom;
    window.SF.bus.emit('camera:zoom', { level: zoom });

    // Park off the subject's shoulder, then verify with the real projection and close the distance
    // until it is genuinely on screen. Guessing an offset is what put earlier stills off-frame.
    // Approach direction. The Tethys launcher is a SURFACE installation sitting ~56 WU off The
    // Anvil's body, so a naive diagonal approach parks the player inside the planet's reentry band
    // and photographs plasma instead of the facility. Approach outward from the nearest planetary
    // body when there is one, so the subject is framed against the planet rather than through it.
    const body = state.entityList
      .filter((e) => e?.alive !== false && Number(e.radius) > 200 && e.id !== target.id)
      .map((e) => ({ e, d: Math.hypot(e.pos.x - target.pos.x, e.pos.z - target.pos.z) }))
      .sort((a, b) => a.d - b.d)[0];
    let dir = { x: -1, z: -0.36 };
    if (body && body.d < 4000) {
      const ox = target.pos.x - body.e.pos.x;
      const oz = target.pos.z - body.e.pos.z;
      const len = Math.hypot(ox, oz) || 1;
      dir = { x: ox / len, z: oz / len };
    }
    const dirLen = Math.hypot(dir.x, dir.z) || 1;
    dir = { x: dir.x / dirLen, z: dir.z / dirLen };

    let offset = radius * framing.offsetRadii;
    let ndc = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const x = target.pos.x + dir.x * offset;
      const z = target.pos.z + dir.z * offset;
      if (typeof player.pos.set === 'function') player.pos.set(x, 0, z);
      else { player.pos.x = x; player.pos.z = z; }
      player.prevPos?.copy?.(player.pos);
      if (player.vel?.set) player.vel.set(0, 0, 0);
      else { player.vel.x = 0; player.vel.z = 0; }
      player.rot = 0;
      player.prevRot = 0;
      player.flags = { ...(player.flags || {}), noInterp: true };
      state.camera.zoom = zoom;
      state.render?.cameraCtrl?.snapToPlayer?.();
      await settle(attempt === 0 ? 900 : 350);
      ndc = project();
      if (!ndc) break;                                    // no projection available; report and let the caller judge
      if (Math.abs(ndc.x) <= ndcLimit && Math.abs(ndc.y) <= ndcLimit) break;
      offset *= 0.62;
    }
    await settle(500);

    let visibleMeshes = 0;
    target.mesh?.traverse?.((object) => {
      if (object.isMesh && object.visible !== false) visibleMeshes++;
    });
    return {
      subjectId: targetId,
      subjectRadius: radius,
      subjectPos: { x: target.pos.x, z: target.pos.z },
      playerPos: { x: player.pos.x, z: player.pos.z },
      playerOffset: offset,
      subjectNdc: ndc,
      cameraZoom: state.camera.zoom,
      presentationAdmission: target.presentationAdmission || null,
      authoredAssetState: target.mesh?.userData?.authoredAssetState || null,
      authoredReadableFallbackRetained: target.mesh?.userData?.authoredReadableFallbackRetained ?? null,
      placeId: target.data?.placeId || null,
      authoredPayloadAssetId: target.data?.authoredPayloadAssetId || null,
      visibleMeshes,
      sectorId: state.world?.currentSectorId || null,
      simTime: state.simTime,
    };
  }, { targetId, framing, zoomMax: CAMERA_ZOOM_MAX, ndcLimit: NDC_LIMIT });
}

// Track the frozen subject with the ordinary game camera, leaving the player exactly where it
// stands. The presentation runner continues to call cameraCtrl.follow() on wall-clock frames even
// while simulation time is stopped, so a one-shot lookAt() would be overwritten before the
// screenshot. This temporary hook preserves the normal follow update, then re-aims that same live
// camera at the capsule mesh's frame-local world position on every frame.
async function trackFrozenSubject(page, targetId, framing) {
  return page.evaluate(async ({ targetId, framing, zoomMax }) => {
    const state = window.SF.state;
    const target = state.entities.get(targetId);
    const player = state.entities.get(state.playerId);
    if (!target?.pos) throw new Error(`missing capture subject ${targetId}`);
    if (!player?.pos) throw new Error('missing player while framing frozen capsule');

    const ctrl = state.render?.cameraCtrl;
    const cam = ctrl?.obj || state.render?.camera || null;
    if (!ctrl?.follow || !cam || !window.SF.THREE || !target.mesh?.getWorldPosition) {
      throw new Error(`capture camera cannot track frozen subject ${targetId}`);
    }

    const radius = Number(target.radius || 6);
    const zoom = Math.min(zoomMax, Math.max(45, radius * framing.zoomRadii));
    state.camera.zoom = zoom;
    window.SF.bus.emit('camera:zoom', { level: zoom });

    let tracker = window.__pq019aFrozenSubjectTracking;
    if (!tracker) {
      const originalFollow = ctrl.follow;
      const focus = new window.SF.THREE.Vector3();
      tracker = {
        ctrl,
        originalFollow,
        targetId,
        zoom,
        apply() {
          const tracked = state.entities.get(this.targetId);
          if (!tracked?.mesh?.getWorldPosition) return;
          tracked.mesh.updateWorldMatrix?.(true, true);
          tracked.mesh.getWorldPosition(focus);
          const tiltRad = (Number(state.camera?.tilt) || 60) * Math.PI / 180;
          cam.position.set(
            focus.x,
            focus.y + this.zoom * Math.sin(tiltRad),
            focus.z - this.zoom * Math.cos(tiltRad),
          );
          cam.lookAt(focus);
          cam.updateMatrixWorld(true);
        },
      };
      ctrl.follow = function pq019aFrozenSubjectFollow(frameDt) {
        originalFollow.call(ctrl, frameDt);
        tracker.apply();
      };
      window.__pq019aFrozenSubjectTracking = tracker;
    } else if (tracker.ctrl !== ctrl) {
      throw new Error('capture camera controller changed while frozen-subject tracking was active');
    }
    tracker.targetId = targetId;
    tracker.zoom = zoom;
    tracker.apply();

    await new Promise((resolve) => setTimeout(resolve, 450));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    tracker.apply();
    const projected = new window.SF.THREE.Vector3();
    target.mesh.getWorldPosition(projected);
    projected.project(cam);
    const ndc = { x: projected.x, y: projected.y };
    const separation = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
    let visibleMeshes = 0;
    target.mesh?.traverse?.((object) => {
      if (object.isMesh && object.visible !== false) visibleMeshes++;
    });
    return {
      subjectId: targetId,
      subjectRadius: radius,
      subjectPos: { x: target.pos.x, z: target.pos.z },
      playerPos: { x: player.pos.x, z: player.pos.z },
      separationFromPlayer: separation,
      subjectNdc: ndc,
      cameraZoom: state.camera.zoom,
      presentationAdmission: target.presentationAdmission || null,
      authoredAssetState: target.mesh?.userData?.authoredAssetState || null,
      authoredPayloadAssetId: target.data?.authoredPayloadAssetId || null,
      visibleMeshes,
      sectorId: state.world?.currentSectorId || null,
      simTime: state.simTime,
    };
  }, { targetId, framing, zoomMax: CAMERA_ZOOM_MAX });
}

async function clearFrozenSubjectTracking(page) {
  await page.evaluate(() => {
    const tracker = window.__pq019aFrozenSubjectTracking;
    if (!tracker) return;
    tracker.ctrl.follow = tracker.originalFollow;
    delete window.__pq019aFrozenSubjectTracking;
    tracker.ctrl.snapToPlayer?.();
  });
}

// A still whose subject is off-frame is not evidence. Fail loudly instead of shipping it.
function assertInFrame(receipt, label) {
  assert.ok(receipt.subjectNdc, `${label}: camera projection unavailable, cannot prove the subject is in frame`);
  assert.ok(
    Math.abs(receipt.subjectNdc.x) <= NDC_LIMIT && Math.abs(receipt.subjectNdc.y) <= NDC_LIMIT,
    `${label}: subject is out of frame at ndc ${JSON.stringify(receipt.subjectNdc)}`,
  );
}

const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: OUT,
  manifest: pq019aCapsulePresentationManifest,
  tokenOrPath: process.env.SF_BROKER_CLAIM,
  root: ROOT,
  requiredRuntimeKind: 'browser',
});
if (!brokerGate.ok) {
  console.error(`PQ-019A presentation capture blocked: ${brokerGate.reason}`);
  process.exit(2);
}

await mkdir(OUT, { recursive: true });
const server = await acquireVisualProbeServer({
  explicitUrl: process.env.SPACEFACE_CAPTURE_URL || null,
  root: ROOT,
});
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: systemBrowser(),
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const page = await context.newPage();
const pageErrors = [];
const consoleMessages = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('console', (message) => {
  if (message.type() === 'warning' || message.type() === 'error') {
    consoleMessages.push({ type: message.type(), text: message.text() });
  }
});

const captures = [];
let cueLog = [];

try {
  // ── canonical New Game route ──────────────────────────────────────────────────────────────────
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry), null, { timeout: 45_000 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.fill('#sf-ng-seed', String(CAPTURE_SEED));
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90_000 });
  const recordedSeed = await page.evaluate(() => window.SF.state.meta?.seed ?? null);
  assert.equal(recordedSeed, CAPTURE_SEED, 'New Game must consume the declared capture seed');
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return player?.presentationAdmission === 'ready';
  }, null, { timeout: ADMISSION_TIMEOUT_MS });

  // ── travel to the authored heist route and record the cue stream ──────────────────────────────
  await page.evaluate((sectorId) => {
    window.__pq019cues = [];
    window.SF.bus.on('heist:launchCue', (payload) => window.__pq019cues.push(payload));
    window.SF.registry.get('world').enterSector(sectorId);
  }, SECTOR_ID);

  // ── the three facilities, matched close/default/far ────────────────────────────────────────────
  const launcherId = await findEntity(page, 'heist_launcher_visual');
  for (const facility of FACILITIES) {
    const subjectId = await findEntity(page, facility.role);
    // Fly there first, THEN wait for the authored asset to decode.
    await frameSubject(page, subjectId, FRAMINGS[1]);
    await waitForAdmission(page, subjectId, { requireAuthored: true });
    for (const framing of FRAMINGS) {
      const receipt = await frameSubject(page, subjectId, framing);
      assert.equal(receipt.presentationAdmission, 'ready', `${facility.id} must be admitted, not pending`);
      assert.ok(receipt.visibleMeshes > 0, `${facility.id} must present visible geometry at ${framing.name}`);
      assertInFrame(receipt, `${facility.id}/${framing.name}`);
      captures.push(await screenshot(page, `${facility.id}-${framing.name}.png`, {
        subject: facility.id,
        label: facility.label,
        framing: framing.name,
        framingRadii: framing.radii,
        route: `New Game -> ${SECTOR_ID} -> ${facility.id}`,
        seed: CAPTURE_SEED,
        receipt,
      }));
    }
  }

  // ── schedule a real launch: the player-visible T-minus cue, then the physical capsule ──────────
  // Stand off along the launch corridor rather than at the launcher itself. The authored launcher
  // sits only ~56 WU off The Anvil's body, and parking there puts the player inside the planet's
  // danger envelope, whose priority-110 "BURN NOW OR BREAK UP" floor correctly outranks an
  // objective-tier schedule cue. That is the one-voice law working, not a defect — so the cue is
  // photographed from the corridor, which is also where the capsule will pass.
  const vantage = await page.evaluate(() => {
    const state = window.SF.state;
    const launcher = state.entityList.find((e) => e.data?.heistFacilityRole === 'heist_launcher_head');
    const catcher = state.entityList.find((e) => e.data?.heistFacilityRole === 'lawful_catcher_head');
    const player = state.entities.get(state.playerId);
    const x = launcher.pos.x + (catcher.pos.x - launcher.pos.x) * 0.6;
    const z = launcher.pos.z + (catcher.pos.z - launcher.pos.z) * 0.6;
    player.pos.set ? player.pos.set(x, 0, z) : Object.assign(player.pos, { x, z });
    player.prevPos?.copy?.(player.pos);
    player.vel?.set?.(0, 0, 0);
    state.render?.cameraCtrl?.snapToPlayer?.();
    return { x, z, distanceFromLauncher: Math.hypot(x - launcher.pos.x, z - launcher.pos.z) };
  });
  await page.waitForTimeout(1_500);

  await page.evaluate(({ scheduleId }) => {
    const state = window.SF.state;
    window.SF.bus.emit('heist:requestLaunchSchedule', {
      scheduleId,
      // Far enough out that the whole authored countdown (30/15/5) runs on the live route, so a
      // transient higher-priority line cannot cost us every chance to photograph the cue.
      launchAtSimT: state.simTime + 31,
    });
  }, { scheduleId: SCHEDULE_ID });

  // The cue reaches the player as the one-voice floor pill; wait for it to actually be on screen.
  await page.waitForFunction(
    () => /cargo launch in/i.test(document.querySelector('#alerts')?.textContent || ''),
    null,
    { timeout: 45_000, polling: 100 },
  );
  const cuePillText = await page.evaluate(() => document.querySelector('.sf-alert--floor')?.textContent?.trim() || '');
  captures.push(await screenshot(page, 'launch-cue-tminus.png', {
    subject: 'launch_schedule_cue',
    label: 'player-visible T-minus launch cue on the one-voice floor',
    framing: 'default',
    route: `New Game -> ${SECTOR_ID} -> heist:requestLaunchSchedule`,
    seed: CAPTURE_SEED,
    receipt: { pillText: cuePillText, vantage },
  }));

  const capsuleId = await findEntity(page, 'cargo_capsule');

  // Let it clear the launcher, then hold the WORLD still so all three framings photograph one
  // genuine in-flight moment. Zeroing entity.vel does not work here: the capsule is a real Rapier
  // dynamic body and the physics owner writes its velocity back every step. The time-scale service
  // is the sanctioned seam for exactly this (it is the sole owner of the scalar, and the same one
  // bullet-time uses), so the capsule keeps its live in-flight position, orientation and speed —
  // the clock is what stops. The manifest records the freeze and the measured speed at that moment.
  // Wait for it to fly to US rather than teleporting to it. The player is already parked on the
  // launch corridor, so the capsule passes close by, and the camera then only has to move tens of
  // WU. That matters: a long teleport re-centres the renderer's floating frame origin, and with the
  // clock stopped the mesh sync that would rebase the scene does not run, so a frozen-then-teleported
  // subject projects from a stale frame. Intercepting where the player stands avoids the problem
  // entirely instead of working around it.
  // Track the capsule to its CLOSEST APPROACH and stop the clock there, rather than teleporting to
  // it. Two reasons this is the right shape: a long teleport re-centres the renderer's floating
  // frame origin, and with the clock stopped the mesh sync that rebases the scene does not run, so a
  // frozen-then-teleported subject projects from a stale frame. Freezing at closest approach means
  // the three framings differ only by zoom, with the player never moving.
  // Order matters here, and both halves were learned the hard way:
  //   * Approach with the clock RUNNING. Authored admission is driven by the render loop, and the
  //     teleport also rebases the renderer's floating frame origin and re-syncs meshes. Do either
  //     of those under a stopped clock and the scene desynchronizes from entity positions.
  //   * Only THEN stop the clock, and frame the rest with zoom alone. The capsule is a real Rapier
  //     dynamic body at ~120 WU/s, so it crosses a tight frame faster than a screenshot completes;
  //     entity.vel cannot be zeroed because the physics owner rewrites it every step. The
  //     time-scale service is the sanctioned sole owner of that scalar (the bullet-time seam), so
  //     the capsule keeps its live in-flight position, orientation and speed — the clock is what
  //     stops.
  // Let it get well clear of the planet, not just clear of the launcher. The Anvil has a ~470 WU
  // body and the surface launcher sits ~520 WU from its centre, so the first seconds of the launch
  // corridor are still inside the atmospheric hazard band: approaching there puts the player in
  // reentry and fills the frame with plasma instead of the capsule. At ~120 WU/s, ten seconds of
  // flight puts the capsule roughly 1200 WU downrange and safely outside the band.
  await page.waitForTimeout(10_000);
  await frameSubject(page, capsuleId, FRAMINGS[1]);      // fly to it (clock running)
  await waitForAdmission(page, capsuleId, { requireAuthored: false });
  await frameSubject(page, capsuleId, FRAMINGS[1]);      // re-converge now that the pod is admitted

  const capsuleFlight = await page.evaluate((id) => {
    const state = window.SF.state;
    const capsule = state.entities.get(id);
    const player = state.entities.get(state.playerId);
    const launcher = state.entityList.find((e) => e.data?.heistFacilityRole === 'heist_launcher_head');
    const flight = {
      travelledFromLauncher: launcher
        ? Math.hypot(capsule.pos.x - launcher.pos.x, capsule.pos.z - launcher.pos.z)
        : null,
      speedAtFreeze: Math.hypot(capsule.vel?.x || 0, capsule.vel?.z || 0),
      separationAtFreeze: Math.hypot(capsule.pos.x - player.pos.x, capsule.pos.z - player.pos.z),
      heldBy: 'timeEffects scale 0 (clock stopped, body untouched)',
    };
    window.SF.timeEffects.set('pq019a-capture', { scale: 0 });
    flight.timeScale = state.timeScale;
    return flight;
  }, capsuleId);
  assert.ok(
    capsuleFlight.travelledFromLauncher > 100,
    `capsule must be genuinely in flight, travelled ${capsuleFlight.travelledFromLauncher}`,
  );

  try {
    // Camera-only framings: the player does not move, so nothing can shift the frame origin. The
    // temporary follow hook keeps the frozen live capsule at camera focus across screenshot frames.
    for (const framing of FRAMINGS) {
      const receipt = await trackFrozenSubject(page, capsuleId, framing);
      assert.equal(receipt.presentationAdmission, 'ready', 'the in-flight capsule must be admitted');
      assert.ok(receipt.visibleMeshes > 0, `capsule must present visible geometry at ${framing.name}`);
      assertInFrame(receipt, `cargo_capsule/${framing.name}`);
      captures.push(await screenshot(page, `cargo-capsule-inflight-${framing.name}.png`, {
        subject: 'cargo_capsule',
        label: 'in-flight authored cargo capsule at closest approach (clock stopped for the still)',
        framing: framing.name,
        route: `New Game -> ${SECTOR_ID} -> scheduled launch -> in flight`,
        seed: CAPTURE_SEED,
        clockStoppedForStill: true,
        projectionInFrame: true,
        flight: capsuleFlight,
        receipt,
      }));
    }
  } finally {
    await clearFrozenSubjectTracking(page);
    await page.evaluate(() => window.SF.timeEffects.clear('pq019a-capture'));
  }

  cueLog = await page.evaluate(() => window.__pq019cues || []);

  const manifest = {
    packet: 'PQ-019',
    leafId: 'PQ-019.facility-embodiment',
    schema: 'spaceface.pq019a.presentationStills.v1',
    evidenceClass: 'presentation-stills',
    notMeasured: [
      'frame timing', 'draw calls', 'shader program counts', 'GPU admission/residency',
      'matched traffic performance', 'Electron parity',
    ],
    note: 'Presentation stills only. This manifest is not performance evidence and records no timings.',
    seed: CAPTURE_SEED,
    declaredSeed: CAPTURE_SEED,
    recordedSeed,
    seedControl: 'applied through visible New Game seed input and verified from state.meta.seed',
    sectorId: SECTOR_ID,
    scheduleId: SCHEDULE_ID,
    viewport: VIEWPORT,
    cameraPolicy: 'ordinary game camera; static facilities use player-relative framing and the frozen live capsule is tracked at mesh world position',
    framings: FRAMINGS,
    route: 'main menu -> New Game -> Launch -> world.enterSector(sector_tethys_junction) -> heist:requestLaunchSchedule',
    launchCueMoments: cueLog.map((cue) => ({ moment: cue.moment, tMinusS: cue.tMinusS, text: cue.text })),
    captures,
    pageErrors,
    consoleMessages,
  };
  assert.equal(pageErrors.length, 0, `no page errors:\n${pageErrors.join('\n')}`);
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`PQ-019A presentation stills OK: ${captures.length} captures`);
  for (const capture of captures) console.log(`  ${capture.file}  (${capture.bytes} bytes)  ${capture.subject}/${capture.framing}`);
  console.log(`  cue moments observed: ${cueLog.map((c) => c.moment).join(', ') || '(none)'}`);
  console.log(`Manifest: ${relative(MANIFEST)}`);
} catch (error) {
  console.error('PQ-019A presentation capture FAILED:', error?.stack || error);
  console.error('Console warnings/errors:', JSON.stringify(consoleMessages.slice(0, 40), null, 2));
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close?.().catch(() => {});
}
