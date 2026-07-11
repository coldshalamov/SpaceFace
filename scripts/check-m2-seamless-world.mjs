#!/usr/bin/env node
// M2 live acceptance: seamless world / floating-origin membrane on the normal player route.
//
// Proves (browser Chrome + Electron, same authored assets, default settings):
//   1. normal boot reaches flight with flightV3 / sg06-tactical / rapier-dynamic + authored assets
//   2. authoritative player global XZ can reach beyond 8192 wu and remains continuous
//   3. world.frameOrigin changes on the live fixed-tick path; frameOriginSeq increments exactly
//   4. Three mesh + Rapier body stay frame-local/bounded near camera while entity.pos stays far
//   5. worldToScreen + raycastToPlane round-trip at non-zero origin is within tolerance
//   6. save → Continue restores the same global pose and re-derives a bounded runtime frame
//   7. browser and Electron receipts agree on defaults/assets/global pose/origin semantics
//   8. JSON evidence + one screenshot per route under .devshots/m2-floating-origin/
//
// Uses evaluation surfaces only to reposition the already-booted player so the live systems
// exercise the real origin membrane. Does not boot a special gameplay mode, disable assets,
// lower quality, or edit production source / package.json / goldens.
//
// Run: node scripts/check-m2-seamless-world.mjs

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeOwnedResources } from './lib/alphaLiveBaselineContracts.mjs';
import { closeOwnedElectronRuntime } from './lib/alphaLiveBaselineElectronContracts.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'm2-floating-origin');
const REPORT_PATH = path.join(OUT_DIR, 'm2-seamless-world.json');

const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const SAVE_SLOT = 'm2-seamless-world';
const FAR_GLOBAL = Object.freeze({ x: 12_500, z: -3_200 }); // beyond FRAME_REBASE_THRESHOLD_WU (8192)
const EXPECTED_ORIGIN = Object.freeze({ x: 12_288, z: -4_096 }); // snap to FRAME_ORIGIN_QUANTUM_WU (4096)
const LOCAL_BOUND = 8_192;
const ROUNDTRIP_TOL_WU = 8;
const POSE_TOL_WU = 2.5;
const ROUTE_TIMEOUT_MS = 240_000;
const FLIGHT_TIMEOUT_MS = 150_000;
const REBASE_TIMEOUT_MS = 45_000;
const OVERALL_TIMEOUT_MS = 12 * 60_000;

const log = (line) => console.log(`[m2-seamless] ${line}`);

main().catch(async (error) => {
  console.error(`[m2-seamless] FAIL ${error && error.stack || error}`);
  process.exitCode = 1;
});

async function main() {
  const overallDeadline = Date.now() + OVERALL_TIMEOUT_MS;
  await mkdir(OUT_DIR, { recursive: true });

  let browserReceipt = null;
  let electronReceipt = null;
  let comparison = null;
  let primaryError = null;

  try {
    browserReceipt = await withOverallDeadline(
      overallDeadline,
      'browser route',
      () => runBrowserRoute(),
    );
    electronReceipt = await withOverallDeadline(
      overallDeadline,
      'electron route',
      () => runElectronRoute(),
    );
    comparison = compareReceipts(browserReceipt, electronReceipt);
    assert.deepEqual(comparison.failures, [], `browser/Electron receipts disagree: ${JSON.stringify(comparison)}`);

    const report = {
      schema: 'spaceface.m2SeamlessWorld.v1',
      generatedAt: new Date().toISOString(),
      pass: true,
      constants: {
        farGlobal: FAR_GLOBAL,
        expectedOrigin: EXPECTED_ORIGIN,
        localBound: LOCAL_BOUND,
        roundTripTolWu: ROUNDTRIP_TOL_WU,
        poseTolWu: POSE_TOL_WU,
        saveSlot: SAVE_SLOT,
      },
      browser: browserReceipt,
      electron: electronReceipt,
      comparison,
    };
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    log(`PASS ${REPORT_PATH}`);
    console.log(JSON.stringify({
      pass: true,
      report: path.relative(ROOT, REPORT_PATH).replace(/\\/g, '/'),
      browserShot: browserReceipt.screenshot,
      electronShot: electronReceipt.screenshot,
      comparison,
    }, null, 2));
  } catch (error) {
    primaryError = error;
    const failReport = {
      schema: 'spaceface.m2SeamlessWorld.v1',
      generatedAt: new Date().toISOString(),
      pass: false,
      error: serializeError(error),
      browser: browserReceipt,
      electron: electronReceipt,
      comparison,
    };
    await writeFile(REPORT_PATH, `${JSON.stringify(failReport, null, 2)}\n`, 'utf8').catch(() => {});
    throw error;
  } finally {
    if (primaryError) log(`cleanup complete after failure: ${primaryError.message || primaryError}`);
  }
}

async function runBrowserRoute() {
  let ownedServer = null;
  let browser = null;
  let context = null;
  let page = null;
  const pageErrors = [];

  try {
    ownedServer = await acquireVisualProbeServer({ root: ROOT });
    assert.equal(ownedServer.ownsServer, true, 'browser probe must own the ephemeral loopback server');
    log(`browser server ${ownedServer.baseUrl}`);

    const executablePath = findSystemBrowser();
    assert(executablePath, 'headed system Chrome or Edge is required for the browser M2 probe');
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({
      headless: false,
      executablePath,
      args: [
        '--incognito',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        '--force-device-scale-factor=1',
      ],
    });
    context = await browser.newContext({
      viewport: VIEWPORT,
      screen: VIEWPORT,
      deviceScaleFactor: 1,
      locale: 'en-US',
      colorScheme: 'dark',
    });
    page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);

    await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    assert.equal(new URL(page.url()).search, '', 'browser must use the canonical root without query flags');

    const receipt = await exerciseSeamlessWorld(page, {
      route: 'browser',
      screenshotName: 'browser-far-origin.png',
      expectedRootUrl: ownedServer.baseUrl,
      log: (line) => log(`[browser] ${line}`),
    });
    receipt.pageErrors = pageErrors.slice();
    assert.deepEqual(pageErrors, [], `browser route emitted page errors: ${pageErrors.join('\n')}`);
    return receipt;
  } finally {
    await closeOwnedResources({ page, context, browser, server: ownedServer }).catch((error) => {
      log(`[browser] cleanup warning: ${error && error.message || error}`);
    });
  }
}

async function runElectronRoute() {
  let electronApp = null;
  let childProcess = null;
  let page = null;
  const pageErrors = [];

  try {
    const { _electron: electron } = await loadPlaywright();
    electronApp = await electron.launch({ args: ['.'], cwd: ROOT, timeout: 90_000 });
    childProcess = electronApp.process();
    assert(childProcess, 'Playwright Electron launch must expose the owned child process');
    log(`electron pid=${childProcess.pid || 'unknown'}`);

    page = await electronApp.firstWindow({ timeout: 90_000 });
    page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
    await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 90_000 });
    assert.equal(new URL(page.url()).search, '', 'Electron must use the canonical root without query flags');

    const receipt = await exerciseSeamlessWorld(page, {
      route: 'electron',
      screenshotName: 'electron-far-origin.png',
      expectedRootUrl: page.url(),
      log: (line) => log(`[electron] ${line}`),
    });
    receipt.pageErrors = pageErrors.slice();
    assert.deepEqual(pageErrors, [], `electron route emitted page errors: ${pageErrors.join('\n')}`);
    return receipt;
  } finally {
    await closeOwnedElectronRuntime({ page, electronApp, childProcess }).catch((error) => {
      log(`[electron] cleanup warning: ${error && error.message || error}`);
    });
  }
}

/**
 * Shared live acceptance path for one player-facing runtime (browser or Electron).
 * Boots via the normal New Game → Launch UI, then uses SF evaluation surfaces only to
 * place the already-booted player far enough for the real floating-origin systems.
 */
async function exerciseSeamlessWorld(page, { route, screenshotName, expectedRootUrl, log: routeLog }) {
  const deadline = Date.now() + ROUTE_TIMEOUT_MS;
  const steps = [];
  const mark = (name, detail = {}) => {
    const record = { name, at: new Date().toISOString(), ...detail };
    steps.push(record);
    routeLog(`${name}${detail.note ? ` — ${detail.note}` : ''}`);
    return record;
  };

  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, { timeout: 60_000 });
  assertCanonicalRoot(page, expectedRootUrl, 'boot-ready');
  mark('sf-ready');

  await dismissIntroIfPresent(page);
  mark('intro-settled');

  await waitForVisibleScreen(page, 'mainMenu', 30_000);
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await waitForVisibleScreen(page, 'newGame', 30_000);
  mark('new-game-visible');

  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: FLIGHT_TIMEOUT_MS });
  mark('flight-ready');

  const boot = await page.evaluate(readBootSnapshotInPage);
  assert.equal(boot.mode, 'flight', 'Launch must enter flight');
  assert.equal(boot.defaults.flightBackend, 'v3', 'default flight backend must be v3 (flightV3)');
  assert.equal(boot.defaults.aiBackend, 'sg06-tactical', 'default AI backend must be sg06-tactical');
  assert.equal(boot.defaults.physicsBackend, 'rapier-dynamic', 'default physics backend must be rapier-dynamic');
  assert.equal(boot.authored.ready, true, 'authored ship assets must be ready on the normal route');
  assert.equal(boot.coordinateSchema, 'global_v1', 'world coordinate schema must be global_v1');
  mark('boot-defaults-ok', { defaults: boot.defaults, authored: boot.authored });

  await page.waitForFunction(() => {
    const physics = window.SF?.registry?.get?.('physics');
    return !!(physics && physics._diag && physics._diag.sg02Ready === true && physics._sg02);
  }, null, { timeout: 60_000 });
  mark('rapier-ready');

  const preFar = await page.evaluate(readPoseBundleInPage);
  assert.ok(Number.isFinite(preFar.global.x) && Number.isFinite(preFar.global.z), 'pre-far global pose must be finite');

  // Evaluation surface only: seat the already-booted player beyond the rebase threshold so the
  // live fixed-tick world._tickFrameOrigin + physics/render membranes exercise for real.
  const teleport = await page.evaluate(({ far, slot }) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    if (!player || !player.pos) throw new Error('player missing for far placement');
    const before = {
      x: player.pos.x,
      z: player.pos.z,
      frameOrigin: { ...(state.world.frameOrigin || { x: 0, z: 0 }) },
      frameOriginSeq: state.world.frameOriginSeq | 0,
      tick: state.tick | 0,
    };
    player.pos.x = far.x;
    player.pos.z = far.z;
    if (player.prevPos) {
      player.prevPos.x = far.x;
      player.prevPos.z = far.z;
    }
    player.vel = player.vel || { x: 0, z: 0 };
    player.vel.x = 0;
    player.vel.z = 0;
    player.flags = player.flags || {};
    player.flags.noInterp = true;
    // Keep intent quiet while the membrane settles.
    if (state.input) {
      state.input.moveX = 0;
      state.input.moveZ = 0;
      state.input.boost = false;
      state.input.brake = false;
    }
    return { before, far, slot };
  }, { far: FAR_GLOBAL, slot: SAVE_SLOT });
  mark('player-placed-far', { before: teleport.before, far: FAR_GLOBAL });

  await page.waitForFunction(({ expectedOrigin, minSeq }) => {
    const state = window.SF?.state;
    if (!state || state.mode !== 'flight') return false;
    const origin = state.world?.frameOrigin;
    const seq = state.world?.frameOriginSeq | 0;
    return seq >= minSeq
      && origin
      && Math.abs(origin.x - expectedOrigin.x) < 1e-6
      && Math.abs(origin.z - expectedOrigin.z) < 1e-6;
  }, {
    expectedOrigin: EXPECTED_ORIGIN,
    minSeq: (teleport.before.frameOriginSeq | 0) + 1,
  }, { timeout: REBASE_TIMEOUT_MS });
  mark('origin-rebased');

  // Clear noInterp after the first membrane apply so subsequent continuous motion is natural.
  await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    if (player?.flags) player.flags.noInterp = false;
  });

  // Continuity sample: drift the authoritative global a small amount over several sim ticks.
  const continuity = await page.evaluate(async () => {
    const samples = [];
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const startTick = state.tick | 0;
    const startGlobal = { x: player.pos.x, z: player.pos.z };
    // Mild deterministic velocity so the live integrator (not a second teleport) advances pose.
    player.vel.x = 12;
    player.vel.z = -4;
    const deadline = performance.now() + 4_000;
    while ((state.tick | 0) < startTick + 45 && performance.now() < deadline) {
      samples.push({
        tick: state.tick | 0,
        x: player.pos.x,
        z: player.pos.z,
        originX: state.world.frameOrigin.x,
        originZ: state.world.frameOrigin.z,
        seq: state.world.frameOriginSeq | 0,
      });
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
    player.vel.x = 0;
    player.vel.z = 0;
    const endGlobal = { x: player.pos.x, z: player.pos.z };
    let maxStep = 0;
    for (let i = 1; i < samples.length; i++) {
      const dx = samples[i].x - samples[i - 1].x;
      const dz = samples[i].z - samples[i - 1].z;
      maxStep = Math.max(maxStep, Math.hypot(dx, dz));
    }
    return {
      startTick,
      endTick: state.tick | 0,
      startGlobal,
      endGlobal,
      sampleCount: samples.length,
      maxStep,
      originStable: samples.every((s) => s.seq === samples[0].seq
        && s.originX === samples[0].originX
        && s.originZ === samples[0].originZ),
      farBeyondThreshold: Math.hypot(endGlobal.x, endGlobal.z) > 8192,
    };
  });
  assert.ok(continuity.sampleCount >= 5, `continuity sample too short: ${continuity.sampleCount}`);
  assert.ok(continuity.farBeyondThreshold, 'player global must remain beyond 8192 wu after drift');
  // Discontinuous double-offset or origin bleed would produce a multi-kilometer step in one frame.
  assert.ok(continuity.maxStep < 80, `global pose discontinuous (maxStep=${continuity.maxStep})`);
  assert.ok(continuity.originStable, 'frame origin must remain stable during short continuous drift');
  mark('global-continuous', continuity);

  const farPose = await page.evaluate(readPoseBundleInPage);
  assertPoseMembrane(farPose, {
    expectedGlobalNear: FAR_GLOBAL,
    expectedOrigin: EXPECTED_ORIGIN,
    minSeq: (teleport.before.frameOriginSeq | 0) + 1,
    label: 'far-live',
  });
  mark('membrane-bounded', {
    global: farPose.global,
    meshLocal: farPose.meshLocal,
    rapierLocal: farPose.rapierLocal,
    frameOrigin: farPose.frameOrigin,
    frameOriginSeq: farPose.frameOriginSeq,
  });

  const roundTrip = await page.evaluate(({ tol }) => {
    const helpers = window.SF.helpers;
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    if (!helpers?.worldToScreen || !helpers?.raycastToPlane) {
      return { ok: false, reason: 'helpers.worldToScreen/raycastToPlane missing' };
    }
    const screen = helpers.worldToScreen({ x: player.pos.x, y: 0, z: player.pos.z });
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    const ndc = {
      x: (screen.x / w) * 2 - 1,
      y: -((screen.y / h) * 2 - 1),
    };
    const hit = helpers.raycastToPlane(ndc);
    const err = Math.hypot(hit.x - player.pos.x, hit.z - player.pos.z);
    return {
      ok: err <= tol,
      err,
      tol,
      screen,
      ndc,
      hit,
      global: { x: player.pos.x, z: player.pos.z },
      frameOrigin: { ...state.world.frameOrigin },
      onScreen: screen.onScreen === true,
    };
  }, { tol: ROUNDTRIP_TOL_WU });
  assert.equal(roundTrip.ok, true, `worldToScreen/raycast round-trip failed: ${JSON.stringify(roundTrip)}`);
  mark('round-trip-ok', roundTrip);

  const screenshotPath = path.join(OUT_DIR, screenshotName);
  await page.screenshot({ path: screenshotPath, type: 'png', animations: 'allow' });
  mark('screenshot', { path: screenshotName });

  // Persist authoritative global pose via the real save system, then Continue from the title route.
  await page.evaluate((slot) => {
    window.SF.bus.emit('game:save', { slot });
  }, SAVE_SLOT);
  await page.waitForFunction((slot) => {
    try {
      return !!localStorage.getItem(`sf.save.${slot}`);
    } catch {
      return false;
    }
  }, SAVE_SLOT, { timeout: 20_000 });
  const savedEnvelope = await page.evaluate((slot) => {
    const raw = localStorage.getItem(`sf.save.${slot}`);
    const env = raw ? JSON.parse(raw) : null;
    const player = env?.data?.entities?.player;
    return {
      hasEnvelope: !!env,
      version: env?.version ?? null,
      playerPos: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
      // frame must not be required from disk; if present it is not the restore authority
      savedFrameOrigin: env?.data?.world?.frameOrigin ?? null,
      coordinateSchema: env?.data?.world?.coordinateSchema ?? null,
    };
  }, SAVE_SLOT);
  assert.equal(savedEnvelope.hasEnvelope, true, 'save envelope must exist');
  assert.ok(savedEnvelope.playerPos, 'save must persist player global pos');
  assert.ok(Math.abs(savedEnvelope.playerPos.x - farPose.global.x) < POSE_TOL_WU,
    `saved global x drifted: ${JSON.stringify(savedEnvelope.playerPos)}`);
  assert.ok(Math.abs(savedEnvelope.playerPos.z - farPose.global.z) < POSE_TOL_WU,
    `saved global z drifted: ${JSON.stringify(savedEnvelope.playerPos)}`);
  mark('saved', savedEnvelope);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, { timeout: 60_000 });
  assert.equal(new URL(page.url()).search, '', 'Continue route must remain on the canonical player root');
  await dismissIntroIfPresent(page);
  await waitForVisibleScreen(page, 'mainMenu', 30_000);

  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.trim() === 'Continue');
    return !!button && !button.disabled;
  }, null, { timeout: 20_000 });
  await continueButton.click({ timeout: 30_000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: FLIGHT_TIMEOUT_MS });
  mark('continued-flight');

  // Load resets runtime frameOrigin to zero; live fixed-tick path must re-derive without double-offset.
  await page.waitForFunction(({ expectedOrigin, expectedGlobal, poseTol }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    if (!state || !player || state.mode !== 'flight') return false;
    const origin = state.world?.frameOrigin;
    const seq = state.world?.frameOriginSeq | 0;
    const globalOk = Math.abs(player.pos.x - expectedGlobal.x) < poseTol
      && Math.abs(player.pos.z - expectedGlobal.z) < poseTol;
    const originOk = origin
      && Math.abs(origin.x - expectedOrigin.x) < 1e-6
      && Math.abs(origin.z - expectedOrigin.z) < 1e-6
      && seq >= 1;
    return globalOk && originOk;
  }, {
    expectedOrigin: EXPECTED_ORIGIN,
    expectedGlobal: { x: farPose.global.x, z: farPose.global.z },
    poseTol: POSE_TOL_WU,
  }, { timeout: REBASE_TIMEOUT_MS });

  await page.waitForFunction(() => {
    const physics = window.SF?.registry?.get?.('physics');
    return !!(physics && physics._diag && physics._diag.sg02Ready === true && physics._sg02);
  }, null, { timeout: 60_000 });

  const continued = await page.evaluate(readPoseBundleInPage);
  assertPoseMembrane(continued, {
    expectedGlobalNear: { x: farPose.global.x, z: farPose.global.z },
    expectedOrigin: EXPECTED_ORIGIN,
    minSeq: 1,
    label: 'continue',
  });
  // Double-offset detector: mesh local must equal global - origin, not global - 2*origin.
  const doubleOffsetX = continued.global.x - 2 * continued.frameOrigin.x;
  const doubleOffsetZ = continued.global.z - 2 * continued.frameOrigin.z;
  assert.ok(Math.abs(continued.meshLocal.x - doubleOffsetX) > 1
    || Math.abs(continued.meshLocal.z - doubleOffsetZ) > 1
    || Math.hypot(continued.frameOrigin.x, continued.frameOrigin.z) < 1,
  'mesh local must not match a double-subtracted origin projection');
  mark('continue-ok', {
    global: continued.global,
    frameOrigin: continued.frameOrigin,
    frameOriginSeq: continued.frameOriginSeq,
    meshLocal: continued.meshLocal,
    rapierLocal: continued.rapierLocal,
  });

  assert.ok(Date.now() < deadline, `route ${route} exceeded ${ROUTE_TIMEOUT_MS}ms budget`);

  return {
    route,
    screenshot: path.relative(ROOT, screenshotPath).replace(/\\/g, '/'),
    boot,
    teleport: {
      before: teleport.before,
      far: FAR_GLOBAL,
      expectedOrigin: EXPECTED_ORIGIN,
    },
    continuity,
    farPose: compactPose(farPose),
    roundTrip: {
      err: roundTrip.err,
      tol: roundTrip.tol,
      onScreen: roundTrip.onScreen,
      hit: roundTrip.hit,
      global: roundTrip.global,
      frameOrigin: roundTrip.frameOrigin,
    },
    savedEnvelope,
    continued: compactPose(continued),
    steps,
  };
}
function assertPoseMembrane(pose, { expectedGlobalNear, expectedOrigin, minSeq, label }) {
  assert.equal(pose.mode, 'flight', `${label}: mode must be flight`);
  assert.ok(pose.global, `${label}: global pose missing`);
  assert.ok(Math.hypot(pose.global.x, pose.global.z) > 8192, `${label}: global must exceed 8192 wu`);
  assert.ok(Math.abs(pose.global.x - expectedGlobalNear.x) < 200,
    `${label}: global x not near expected (${pose.global.x} vs ${expectedGlobalNear.x})`);
  assert.ok(Math.abs(pose.global.z - expectedGlobalNear.z) < 200,
    `${label}: global z not near expected (${pose.global.z} vs ${expectedGlobalNear.z})`);
  assert.ok(Math.abs(pose.frameOrigin.x - expectedOrigin.x) < 1e-6, `${label}: frameOrigin.x`);
  assert.ok(Math.abs(pose.frameOrigin.z - expectedOrigin.z) < 1e-6, `${label}: frameOrigin.z`);
  assert.ok((pose.frameOriginSeq | 0) >= minSeq, `${label}: frameOriginSeq ${pose.frameOriginSeq} < ${minSeq}`);

  assert.ok(pose.meshLocal, `${label}: mesh local missing`);
  assert.ok(Math.abs(pose.meshLocal.x) < LOCAL_BOUND, `${label}: mesh local.x unbound ${pose.meshLocal.x}`);
  assert.ok(Math.abs(pose.meshLocal.z) < LOCAL_BOUND, `${label}: mesh local.z unbound ${pose.meshLocal.z}`);
  const expectMeshX = pose.global.x - pose.frameOrigin.x;
  const expectMeshZ = pose.global.z - pose.frameOrigin.z;
  assert.ok(Math.abs(pose.meshLocal.x - expectMeshX) < 1.5,
    `${label}: mesh local x mismatch ${pose.meshLocal.x} vs ${expectMeshX}`);
  assert.ok(Math.abs(pose.meshLocal.z - expectMeshZ) < 1.5,
    `${label}: mesh local z mismatch ${pose.meshLocal.z} vs ${expectMeshZ}`);

  assert.ok(pose.rapierLocal, `${label}: rapier local missing (sg02 not ready?)`);
  assert.ok(Math.abs(pose.rapierLocal.x) < LOCAL_BOUND, `${label}: rapier local.x unbound ${pose.rapierLocal.x}`);
  assert.ok(Math.abs(pose.rapierLocal.z) < LOCAL_BOUND, `${label}: rapier local.z unbound ${pose.rapierLocal.z}`);
  assert.ok(Math.abs(pose.rapierLocal.x - expectMeshX) < 2.5,
    `${label}: rapier local x mismatch ${pose.rapierLocal.x} vs ${expectMeshX}`);
  assert.ok(Math.abs(pose.rapierLocal.z - expectMeshZ) < 2.5,
    `${label}: rapier local z mismatch ${pose.rapierLocal.z} vs ${expectMeshZ}`);

  assert.ok(pose.camera, `${label}: camera missing`);
  // Camera focus / position should stay near frame-local player (bounded), not galactic global.
  const camXZ = pose.camera.focus || pose.camera.position;
  assert.ok(camXZ, `${label}: camera focus/position missing`);
  assert.ok(Math.abs(camXZ.x) < LOCAL_BOUND + 500, `${label}: camera x unbound ${camXZ.x}`);
  assert.ok(Math.abs(camXZ.z) < LOCAL_BOUND + 500, `${label}: camera z unbound ${camXZ.z}`);
  assert.ok(Math.hypot(camXZ.x - pose.meshLocal.x, camXZ.z - pose.meshLocal.z) < 400,
    `${label}: camera not near player mesh local`);
}

function compareReceipts(browser, electron) {
  const failures = [];
  const check = (name, a, b, tol = 0) => {
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a - b) > tol) failures.push(`${name}: browser=${a} electron=${b} tol=${tol}`);
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) failures.push(`${name}: browser=${JSON.stringify(a)} electron=${JSON.stringify(b)}`);
  };

  check('defaults.flightBackend', browser.boot.defaults.flightBackend, electron.boot.defaults.flightBackend);
  check('defaults.aiBackend', browser.boot.defaults.aiBackend, electron.boot.defaults.aiBackend);
  check('defaults.physicsBackend', browser.boot.defaults.physicsBackend, electron.boot.defaults.physicsBackend);
  check('authored.ready', browser.boot.authored.ready, electron.boot.authored.ready);
  check('authored.wholeShip', browser.boot.authored.wholeShip, electron.boot.authored.wholeShip);
  check('coordinateSchema', browser.boot.coordinateSchema, electron.boot.coordinateSchema);

  check('far.frameOrigin.x', browser.farPose.frameOrigin.x, electron.farPose.frameOrigin.x, 1e-6);
  check('far.frameOrigin.z', browser.farPose.frameOrigin.z, electron.farPose.frameOrigin.z, 1e-6);
  check('far.global.x', browser.farPose.global.x, electron.farPose.global.x, 250);
  check('far.global.z', browser.farPose.global.z, electron.farPose.global.z, 250);
  check('far.frameOriginSeq>=1', browser.farPose.frameOriginSeq >= 1, electron.farPose.frameOriginSeq >= 1);

  check('continue.frameOrigin.x', browser.continued.frameOrigin.x, electron.continued.frameOrigin.x, 1e-6);
  check('continue.frameOrigin.z', browser.continued.frameOrigin.z, electron.continued.frameOrigin.z, 1e-6);
  check('continue.global.x', browser.continued.global.x, electron.continued.global.x, 250);
  check('continue.global.z', browser.continued.global.z, electron.continued.global.z, 250);

  check('roundTrip.ok-class', browser.roundTrip.err <= ROUNDTRIP_TOL_WU, electron.roundTrip.err <= ROUNDTRIP_TOL_WU);

  return {
    pass: failures.length === 0,
    failures,
    browserOrigin: browser.farPose.frameOrigin,
    electronOrigin: electron.farPose.frameOrigin,
    browserGlobal: browser.farPose.global,
    electronGlobal: electron.farPose.global,
  };
}

function compactPose(pose) {
  return {
    mode: pose.mode,
    tick: pose.tick,
    global: pose.global,
    frameOrigin: pose.frameOrigin,
    frameOriginSeq: pose.frameOriginSeq,
    meshLocal: pose.meshLocal,
    rapierLocal: pose.rapierLocal,
    camera: pose.camera,
    defaults: pose.defaults,
    authored: pose.authored,
    coordinateSchema: pose.coordinateSchema,
  };
}

// ---- page-side helpers (serialized into the browser/Electron world) ----

function flightReadyInPage() {
  const state = window.SF?.state;
  if (!state || state.mode !== 'flight') return false;
  const player = state.entities?.get(state.playerId);
  if (!player || player.alive === false) return false;
  const data = player.mesh?.userData || {};
  const authoredReady = data.authoredAssetState === 'authored'
    && data.authoredVisualRoot === 'authored-root'
    && data.authoredReadableFallbackRetained === false;
  const modalOpen = document.body.classList.contains('ui-modal-open');
  const splash = document.getElementById('cinematic-splash');
  const splashVisible = !!(splash && !splash.hidden && getComputedStyle(splash).display !== 'none'
    && Number(getComputedStyle(splash).opacity || 1) > 0.01);
  return authoredReady && !modalOpen && !splashVisible;
}

function readBootSnapshotInPage() {
  const state = window.SF.state;
  const player = state.entities.get(state.playerId);
  const data = player?.mesh?.userData || {};
  const gameplay = state.settings?.gameplay || {};
  const slots = Object.values(data.authoredSlots || {}).flat();
  return {
    mode: state.mode,
    tick: state.tick | 0,
    coordinateSchema: state.world?.coordinateSchema || null,
    frameOrigin: { ...(state.world?.frameOrigin || { x: 0, z: 0 }) },
    frameOriginSeq: state.world?.frameOriginSeq | 0,
    defaults: {
      flightBackend: gameplay.flightBackend || null,
      aiBackend: gameplay.aiBackend || null,
      physicsBackend: gameplay.physicsBackend || null,
    },
    registry: {
      flight: window.SF.registry?.get?.('flight')?.name || null,
      ai: window.SF.registry?.get?.('ai')?.name || null,
      physics: window.SF.registry?.get?.('physics')?.name || null,
    },
    authored: {
      ready: data.authoredAssetState === 'authored'
        && data.authoredVisualRoot === 'authored-root'
        && data.authoredReadableFallbackRetained === false,
      state: data.authoredAssetState || null,
      root: data.authoredVisualRoot || null,
      fallbackRetained: data.authoredReadableFallbackRetained === true,
      wholeShip: slots.some((url) => String(url).includes('/wholeships/kestrel.glb')
        || String(url).includes('/wholeships/')),
      slots: slots.slice(0, 8),
    },
    global: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
  };
}

function readPoseBundleInPage() {
  const state = window.SF.state;
  const player = state.entities.get(state.playerId);
  const physics = window.SF.registry?.get?.('physics');
  const owner = physics?._sg02;
  let rapierLocal = null;
  if (owner?.records) {
    const rec = owner.records.get(state.playerId) || owner.records.get(player?.id);
    if (rec?.body?.translation) {
      const t = rec.body.translation();
      rapierLocal = { x: t.x, y: t.y, z: t.z };
    }
  }
  const mesh = player?.mesh;
  const meshLocal = mesh?.position
    ? { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }
    : null;
  const cam = state.camera || {};
  const camObj = state.render?.camera || null;
  const focus = cam.focus
    ? { x: cam.focus.x, z: cam.focus.z }
    : (camObj?.position ? { x: camObj.position.x, z: camObj.position.z } : null);
  const data = mesh?.userData || {};
  const gameplay = state.settings?.gameplay || {};
  return {
    mode: state.mode,
    tick: state.tick | 0,
    coordinateSchema: state.world?.coordinateSchema || null,
    global: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
    frameOrigin: { ...(state.world?.frameOrigin || { x: 0, z: 0 }) },
    frameOriginSeq: state.world?.frameOriginSeq | 0,
    meshLocal,
    rapierLocal,
    camera: {
      focus,
      position: camObj?.position ? { x: camObj.position.x, y: camObj.position.y, z: camObj.position.z } : null,
      zoom: cam.zoom ?? null,
    },
    defaults: {
      flightBackend: gameplay.flightBackend || null,
      aiBackend: gameplay.aiBackend || null,
      physicsBackend: gameplay.physicsBackend || null,
    },
    authored: {
      ready: data.authoredAssetState === 'authored'
        && data.authoredVisualRoot === 'authored-root'
        && data.authoredReadableFallbackRetained === false,
      state: data.authoredAssetState || null,
    },
    physicsDiag: physics?._diag
      ? {
        backend: physics._diag.backend || null,
        sg02Ready: physics._diag.sg02Ready === true,
        sg02Bodies: physics._diag.sg02Bodies | 0,
      }
      : null,
  };
}

// ---- host-side utilities ----

async function dismissIntroIfPresent(page) {
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  }
  // Boot overlay / first-run chrome if present.
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot-overlay');
    if (!boot) return true;
    const style = getComputedStyle(boot);
    return boot.hidden || style.display === 'none' || Number(style.opacity || 1) <= 0.01;
  }, null, { timeout: 30_000 }).catch(() => {});
}

async function waitForVisibleScreen(page, screenName, timeoutMs) {
  await page.waitForFunction((name) => {
    const el = document.querySelector(`[data-screen="${name}"]`);
    if (!el || el.hidden) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01
      && rect.width > 1 && rect.height > 1;
  }, screenName, { timeout: timeoutMs });
}

function assertCanonicalRoot(page, expectedRootUrl, boundary) {
  const actual = page.url();
  const actualUrl = new URL(actual);
  const expectedUrl = new URL(expectedRootUrl);
  assert.equal(actualUrl.origin, expectedUrl.origin, `${boundary}: origin mismatch ${actual} vs ${expectedRootUrl}`);
  assert.equal(actualUrl.search, '', `${boundary}: query flags forbidden on player route`);
}

function findSystemBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

async function withOverallDeadline(deadline, label, fn) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error(`overall deadline exhausted before ${label}`);
  let timer = null;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`overall deadline hit during ${label}`)), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: String(error.message || error),
    stack: error.stack ? String(error.stack).split('\n').slice(0, 24) : null,
  };
}
