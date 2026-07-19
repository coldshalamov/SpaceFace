#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '.devshots', 'graphics', 'thruster-acceptance');
const REPORT = resolve(OUT, 'electron-route.json');
const CRUISE_SHOT = resolve(OUT, 'electron-cruise.png');
const RCS_SHOT = resolve(OUT, 'electron-hard-turn-rcs.png');
const TASK_ID = 'thruster-electron-route';
const CAPTURE_TIME_SOURCE = 'capture:thruster-electron-route';

await mkdir(OUT, { recursive: true });
const { _electron: electron } = await loadPlaywright();
const isolated = createIsolatedElectronLaunch({ root: ROOT, taskId: TASK_ID });
let app;
let runtimeClosed = false;

try {
  app = await electron.launch(isolated.options);
  const page = await app.firstWindow({ timeout: 90_000 });
  const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 90_000 });
  const rootUrl = assertIsolatedElectronRootUrl(page.url());

  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight'
      && player?.isPlayer === true
      && player?.mesh?.userData?.authoredAssetState === 'authored'
      && player?.mesh?.userData?.authoredVisualRoot === 'authored-root'
      && player?.mesh?.userData?.authoredReadableFallbackRetained === false;
  }, null, { timeout: 120_000 });
  await dismissTutorial(page);
  await page.evaluate(() => {
    const state = window.SF.state;
    state.settings.video.engineTrails = true;
    state.settings.video.energyMaterials = true;
    window.SF.bus.emit('settings:changed', { section: 'video', key: 'engineTrails' });
  });

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1_200);
  const cruiseFrame = await captureThrusterFrame(page, CRUISE_SHOT);
  const cruise = cruiseFrame.projection;
  const cruisePixels = measureProjectedSignal(cruiseFrame.png, cruise.layers, cruise.viewport);

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(80);
  const hardTurnFrame = await captureThrusterFrame(page, RCS_SHOT);
  const hardTurn = hardTurnFrame.projection;
  const rcsPixels = measureProjectedSignal(hardTurnFrame.png, hardTurn.rcs.instances, hardTurn.viewport);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('KeyW');

  const diagnostics = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const energy = window.SF.registry?.get?.('vfx')?._energy;
    return {
      mode: state.mode,
      playerDefId: player?.data?.defId || null,
      authoredAssetState: player?.mesh?.userData?.authoredAssetState || null,
      settings: {
        engineTrails: state.settings?.video?.engineTrails,
        energyMaterials: state.settings?.video?.energyMaterials,
      },
      plumeRecipeId: energy?.plumeSystem?.recipe?.id || null,
      rcsRecipeId: energy?.rcsSystem?.recipe?.id || null,
      plumeFrameAllocations: energy?.plumeSystem?.pool?.frameAllocations ?? null,
      rcsFrameAllocations: energy?.rcsSystem?.pool?.frameAllocations ?? null,
      gpu: state.render?.gpu || null,
    };
  });
  const errors = issues.errorIssues();

  assert.equal(diagnostics.mode, 'flight');
  assert.equal(diagnostics.playerDefId, 'ship_kestrel');
  assert.equal(diagnostics.authoredAssetState, 'authored');
  assert.equal(diagnostics.settings.engineTrails, true);
  assert.equal(diagnostics.plumeRecipeId, 'hitch_kestrel_main_plume');
  assert.equal(diagnostics.rcsRecipeId, 'hitch_kestrel_rcs_impulse');
  assert.equal(diagnostics.plumeFrameAllocations, 0);
  assert.equal(diagnostics.rcsFrameAllocations, 0);
  assert.ok(cruise.layers.length >= 4, `expected four plume roles, got ${cruise.layers.length}`);
  assert.ok(cruise.lengthPx >= 35, `Electron plume projected to only ${cruise.lengthPx}px`);
  assert.ok(cruisePixels.signalPixels >= 24, `Electron plume produced only ${cruisePixels.signalPixels} signal pixels`);
  assert.equal(cruiseFrame.frameSync.resume?.restored, true, 'Electron render loop was not restored after cruise capture');
  assert.ok(hardTurn.rcs.instances.length >= 2, `Electron RCS produced ${hardTurn.rcs.instances.length} jets`);
  assert.ok(Math.max(0, ...hardTurn.rcs.instances.map((entry) => entry.lengthPx)) >= 8,
    'Electron RCS jets projected below the readable threshold');
  assert.ok(rcsPixels.signalPixels >= 6, `Electron RCS produced only ${rcsPixels.signalPixels} signal pixels`);
  assert.equal(hardTurnFrame.frameSync.resume?.restored, true, 'Electron render loop was not restored after RCS capture');
  assert.deepEqual(errors, [], `Electron route page errors: ${JSON.stringify(summarizeIssues(errors))}`);

  const result = {
    schema: 'spaceface.thrusterElectronRoute.v1',
    rootUrl,
    diagnostics,
    cruise: {
      screenshot: CRUISE_SHOT,
      projection: cruise,
      pixelEvidence: cruisePixels,
      frameSync: cruiseFrame.frameSync,
    },
    hardTurn: {
      screenshot: RCS_SHOT,
      projection: hardTurn,
      pixelEvidence: rcsPixels,
      frameSync: hardTurnFrame.frameSync,
    },
    issues: summarizeIssues(errors),
  };
  await writeFile(REPORT, `${JSON.stringify(result, null, 2)}\n`);
  console.log('Kestrel Electron thruster/RCS route: PASS');
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (app) {
    await app.close().catch(() => {});
    runtimeClosed = true;
  }
  isolated.cleanup({ runtimeClosed });
}

async function dismissTutorial(page) {
  await page.evaluate(() => {
    for (const selector of ['.tutorial-overlay', '[data-screen="tutorial"]', '.sf-tutorial']) {
      const root = document.querySelector(selector);
      const button = root && [...root.querySelectorAll('button')]
        .find((node) => /skip|dismiss|close|got it/i.test(node.textContent || ''));
      if (button) button.click();
    }
  });
}

async function captureThrusterFrame(page, screenshotPath) {
  const frozen = await freezeRenderedFrame(page);
  const frameSync = { ...frozen, resume: null };
  try {
    const projection = await readThrusterProjection(page);
    const png = await page.screenshot({ path: screenshotPath, type: 'png' });
    return { projection, png, frameSync };
  } finally {
    frameSync.resume = await resumeRenderedFrame(page);
  }
}

async function freezeRenderedFrame(page) {
  return page.evaluate(async (source) => {
    const sf = window.SF;
    const timeEffects = sf?.timeEffects || sf?.ctx?.timeEffects;
    if (!sf?.state || !timeEffects?.set || !timeEffects?.clear) {
      throw new Error('Electron thruster capture requires the public timeEffects authority');
    }
    if (window.__SF_THRUSTER_ELECTRON_FRAME__) {
      throw new Error('Electron thruster frame barrier is already active');
    }
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const pending = new Map();
    let nextSyntheticId = -1;
    window.__SF_THRUSTER_ELECTRON_FRAME__ = {
      originalRequestAnimationFrame,
      originalCancelAnimationFrame,
      pending,
    };
    timeEffects.set(source, { scale: 0 });
    try {
      window.requestAnimationFrame = (callback) => {
        const id = nextSyntheticId--;
        pending.set(id, callback);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        if (id < 0) pending.delete(id);
        else originalCancelAnimationFrame.call(window, id);
      };
      await new Promise((resolve) => originalRequestAnimationFrame.call(window, resolve));
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (pending.size === 0) throw new Error('Electron thruster frame barrier did not intercept the render loop');
      return {
        frozen: true,
        effectiveScale: timeEffects.getEffectiveScale?.() ?? sf.state.timeScale,
        heldAnimationFrameCallbacks: pending.size,
      };
    } catch (error) {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      window.__SF_THRUSTER_ELECTRON_FRAME__ = null;
      timeEffects.clear(source);
      throw error;
    }
  }, CAPTURE_TIME_SOURCE);
}

async function resumeRenderedFrame(page) {
  return page.evaluate((source) => {
    const sf = window.SF;
    const timeEffects = sf?.timeEffects || sf?.ctx?.timeEffects;
    const barrier = window.__SF_THRUSTER_ELECTRON_FRAME__;
    if (!barrier) {
      timeEffects?.clear?.(source);
      return { restored: false, reason: 'frame barrier was not active' };
    }
    const callbacks = [...barrier.pending.values()];
    window.requestAnimationFrame = barrier.originalRequestAnimationFrame;
    window.cancelAnimationFrame = barrier.originalCancelAnimationFrame;
    window.__SF_THRUSTER_ELECTRON_FRAME__ = null;
    for (const callback of callbacks) barrier.originalRequestAnimationFrame.call(window, callback);
    const effectiveScale = timeEffects.clear(source);
    return { restored: true, resumedAnimationFrameCallbacks: callbacks.length, effectiveScale };
  }, CAPTURE_TIME_SOURCE);
}

async function readThrusterProjection(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const camera = sf.state.render.camera;
    const energy = sf.registry?.get?.('vfx')?._energy;
    const plume = energy?.plumeSystem;
    const rcs = energy?.rcsSystem;
    const width = innerWidth;
    const height = innerHeight;
    const Vec3 = camera.position.constructor;
    const toScreen = (point) => {
      const ndc = point.clone().project(camera);
      return { x: (ndc.x * 0.5 + 0.5) * width, y: (-ndc.y * 0.5 + 0.5) * height };
    };
    const projectBatch = (system, batch, index = 0, visibleTail = 1) => {
      const o = index * 3;
      const s = index * 4;
      const nozzle = new Vec3(batch.offset[o], batch.offset[o + 1], batch.offset[o + 2]);
      const axis = new Vec3(batch.axisScale[s], batch.axisScale[s + 1], batch.axisScale[s + 2]).normalize();
      const tip = nozzle.clone().addScaledVector(axis, -batch.axisScale[s + 3] * visibleTail);
      nozzle.applyMatrix4(system.group.matrixWorld);
      tip.applyMatrix4(system.group.matrixWorld);
      const start = toScreen(nozzle);
      const end = toScreen(tip);
      return { nozzle: start, tip: end, lengthPx: Math.hypot(end.x - start.x, end.y - start.y) };
    };

    plume?.group?.updateMatrixWorld(true);
    rcs?.group?.updateMatrixWorld(true);
    const layers = (plume?.layerBatches || [])
      .filter((batch) => batch.role !== 'distortion' && batch.mesh?.count > 0)
      .map((batch) => ({
        role: batch.role,
        ...projectBatch(plume, batch, 0, batch.role === 'core' ? 0.76 : batch.role === 'inner' ? 0.9 : 0.84),
      }));
    const rcsBatch = rcs?.layerBatches?.find((batch) => batch.role === 'core' && batch.mesh?.count > 0)
      || rcs?.layerBatches?.find((batch) => batch.mesh?.count > 0);
    const rcsInstances = [];
    for (let index = 0; index < (rcsBatch?.mesh?.count || 0); index++) {
      rcsInstances.push(projectBatch(rcs, rcsBatch, index));
    }
    return {
      viewport: { width, height, devicePixelRatio },
      visible: !!(plume?.group?.visible && layers.length),
      lengthPx: Math.max(0, ...layers.map((entry) => entry.lengthPx)),
      layers,
      rcs: { visible: !!(rcs?.group?.visible && rcsInstances.length), instances: rcsInstances },
    };
  });
}

function measureProjectedSignal(buffer, projections, viewport) {
  const png = PNG.sync.read(buffer);
  const scaleX = png.width / Math.max(1, viewport?.width || png.width);
  const scaleY = png.height / Math.max(1, viewport?.height || png.height);
  let sampledPixels = 0;
  let signalPixels = 0;
  for (const projection of projections) {
    const ax = projection.nozzle.x * scaleX;
    const ay = projection.nozzle.y * scaleY;
    const bx = projection.tip.x * scaleX;
    const by = projection.tip.y * scaleY;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = Math.max(1, dx * dx + dy * dy);
    const radius = Math.max(6, Math.min(24, projection.lengthPx * 0.1 * Math.max(scaleX, scaleY)));
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
    const maxX = Math.min(png.width - 1, Math.ceil(Math.max(ax, bx) + radius));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - radius));
    const maxY = Math.min(png.height - 1, Math.ceil(Math.max(ay, by) + radius));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = ((x - ax) * dx + (y - ay) * dy) / lenSq;
        if (t < 0.12 || t > 1.04) continue;
        const px = ax + dx * t;
        const py = ay + dy * t;
        if (Math.hypot(x - px, y - py) > radius) continue;
        const offset = (y * png.width + x) * 4;
        const r = png.data[offset];
        const g = png.data[offset + 1];
        const b = png.data[offset + 2];
        sampledPixels++;
        if (g >= 48 && b >= 58 && g > r * 1.12 && b > r * 1.08) signalPixels++;
      }
    }
  }
  return { sampledPixels, signalPixels, screenshot: { width: png.width, height: png.height }, scaleX, scaleY };
}
