#!/usr/bin/env node
// Normal-route Kestrel thruster/RCS acceptance capture.
// Records matched fixed-camera states plus one continuous motion clip from the real game route.

import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'graphics', 'thruster-acceptance');
const BASE_URL = process.env.SF_PROBE_URL || '';
const WIDTH = 1440;
const HEIGHT = 900;
const CAPTURE_TIME_SOURCE = 'capture:thruster-acceptance-frame';
const execFileAsync = promisify(execFile);

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for thruster acceptance capture');

const ownedServer = await acquireVisualProbeServer({ explicitUrl: BASE_URL, root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const recordingStartedAt = Date.now();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
});
const page = await context.newPage();
const issues = [];
page.on('pageerror', (error) => issues.push({ type: 'pageerror', text: error?.stack || error?.message || String(error) }));
page.on('console', (message) => {
  if (message.type() === 'error') issues.push({ type: 'console.error', text: message.text() });
});

let videoPath = null;
let gameplayVideoOffsetSeconds = 0;
let motionEvidence = null;
let report = null;
const captures = [];
try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Thruster Acceptance', seed: 47 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf && sf.state && sf.state.entities.get(sf.state.playerId);
    return sf.state.mode === 'flight'
      && player && player.mesh
      && player.data?.defId === 'ship_kestrel'
      && String(player.mesh.userData?.authoredAssetState || '').startsWith('authored');
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);
  await page.waitForTimeout(1000);
  gameplayVideoOffsetSeconds = Math.max(0, (Date.now() - recordingStartedAt) / 1000);

  await capture('01-idle.png', 'engine idle');

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(260);
  await capture('02-initial-acceleration.png', 'initial acceleration');
  await page.waitForTimeout(1000);
  await capture('03-sustained-cruise.png', 'sustained cruise');

  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(520);
  await capture('04-high-throttle.png', 'high-throttle turbo');
  await page.keyboard.up('ShiftLeft');

  await page.keyboard.down('ArrowRight');
  // Capture inside the short RCS impulse envelope; the previous 380 ms delay sampled
  // between bursts and produced a false-negative visual even though the ship was turning.
  await page.waitForTimeout(80);
  await capture('05-hard-turn-rcs.png', 'hard turn with RCS');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(450);

  // Regression route for legacy profiles: disabling the older HDR-energy-material experiment must
  // not erase the ship's primary engine feedback while Engine trails remains enabled.
  await page.evaluate(() => {
    const state = window.SF.state;
    state.settings.video.engineTrails = true;
    state.settings.video.energyMaterials = false;
    window.SF.bus.emit('settings:changed', { section: 'video', key: 'energyMaterials' });
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(420);
  await capture('06-legacy-energy-toggle-off.png', 'engine trail with legacy HDR-energy toggle off');
  await page.keyboard.up('KeyW');

  await page.evaluate(() => {
    const state = window.SF.state;
    state.settings.video.energyMaterials = true;
    // motionPreference is the persisted authority; applyAccessibility derives video.motionReduce.
    // Writing only the derived boolean is intentionally normalized back to the saved preference.
    state.settings.accessibility.motionPreference = 'reduce';
    state.settings.accessibility.flashReduce = true;
    window.SF.bus.emit('settings:changed', { section: 'accessibility', key: 'motionPreference' });
  });
  await page.waitForFunction(() => window.SF?.state?.settings?.video?.motionReduce === true);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(420);
  await capture('07-reduced-motion-flash.png', 'reduced motion and flash');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('KeyW');

  const diagnostics = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    const vfx = sf.registry?.get?.('vfx');
    const energy = vfx && vfx._energy;
    const plume = energy && energy.plumeSystem;
    const rcs = energy && energy.rcsSystem;
    return {
      route: { mode: state.mode, sectorId: state.world?.currentSectorId || null },
      settings: {
        video: {
          engineTrails: state.settings?.video?.engineTrails,
          energyMaterials: state.settings?.video?.energyMaterials,
          particleQuality: state.settings?.video?.particleQuality,
          motionReduce: state.settings?.video?.motionReduce,
        },
        accessibility: {
          flashReduce: state.settings?.accessibility?.flashReduce,
        },
      },
      player: {
        id: player?.id || null,
        defId: player?.data?.defId || null,
        authoredAssetState: player?.mesh?.userData?.authoredAssetState || null,
        authoredVisualRoot: player?.mesh?.userData?.authoredVisualRoot || null,
      },
      vfx: {
        plumeRecipeId: plume?.recipe?.id || null,
        rcsRecipeId: rcs?.recipe?.id || null,
        plumeLayers: plume?.layerBatches?.map((batch) => ({
          role: batch.role,
          drawCount: batch.mesh?.count || 0,
          textureId: batch.material?.userData?.textureId || null,
          blending: batch.material?.blending ?? null,
          depthTest: batch.material?.depthTest ?? null,
          depthWrite: batch.material?.depthWrite ?? null,
        })) || [],
        rcsLayers: rcs?.layerBatches?.map((batch) => ({
          role: batch.role,
          drawCount: batch.mesh?.count || 0,
          textureId: batch.material?.userData?.textureId || null,
        })) || [],
        legacyLiveParticles: vfx?._liveCount || 0,
        legacyLiveTrailStreaks: vfx?._liveTrailStreakCount || 0,
        plumeFrameAllocations: plume?.pool?.frameAllocations ?? null,
        rcsFrameAllocations: rcs?.pool?.frameAllocations ?? null,
      },
      renderer: state.render?.renderer?.info ? {
        calls: state.render.renderer.info.render.calls,
        triangles: state.render.renderer.info.render.triangles,
        geometries: state.render.renderer.info.memory.geometries,
        textures: state.render.renderer.info.memory.textures,
        programs: state.render.renderer.info.programs?.length || 0,
      } : null,
    };
  });
  report = {
    schema: 'spaceface.thrusterAcceptance.v1',
    baseUrl: ownedServer.baseUrl,
    viewport: { width: WIDTH, height: HEIGHT },
    captures,
    diagnostics,
    visualEvidence: summarizeVisualEvidence(captures),
    issues,
    ok: issues.length === 0
      && diagnostics.player.defId === 'ship_kestrel'
      && String(diagnostics.player.authoredAssetState || '').startsWith('authored')
      && diagnostics.vfx.plumeRecipeId === 'hitch_kestrel_main_plume'
      && diagnostics.vfx.rcsRecipeId === 'hitch_kestrel_rcs_impulse'
      && diagnostics.settings.video.engineTrails === true
      && diagnostics.vfx.plumeFrameAllocations === 0
      && diagnostics.vfx.rcsFrameAllocations === 0
      && summarizeVisualEvidence(captures).ok,
  };
} finally {
  const video = page.video();
  await context.close().catch(() => {});
  if (video) {
    try {
      const rawPath = await video.path();
      videoPath = path.join(OUT, 'thruster-normal-route.webm');
      const fullPath = path.join(OUT, 'thruster-normal-route-full.webm');
      if (path.resolve(rawPath) !== path.resolve(fullPath)) await rename(rawPath, fullPath);
      motionEvidence = await trimGameplayVideo(fullPath, videoPath, gameplayVideoOffsetSeconds);
    } catch (_) {}
  }
  await browser.close().catch(() => {});
  await ownedServer.close().catch(() => {});
  if (report) {
    report.motionEvidence = motionEvidence;
    if (!motionEvidence?.ok) report.ok = false;
    await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    console.log(JSON.stringify(report, null, 2));
  }
  if (videoPath) console.log(`video ${videoPath}`);
}

async function capture(file, scenario) {
  const fullPath = path.join(OUT, file);
  const frozenFrame = await freezeRenderedFrame(page);
  let captureRecord = null;
  try {
    const projectedPlume = await readProjectedPlume(page);
    const actualSettings = await page.evaluate(() => ({
      particleQuality: window.SF?.state?.settings?.video?.particleQuality || null,
      motionReduce: !!window.SF?.state?.settings?.video?.motionReduce,
      flashReduce: !!window.SF?.state?.settings?.accessibility?.flashReduce,
    }));
    const png = await page.screenshot({ path: fullPath, fullPage: false });
    const projectionAfterScreenshot = await readProjectedPlume(page);
    const layerPixelEvidence = (projectedPlume?.layers || []).map((layer) => ({
      role: layer.role,
      ...measurePlumePixels(png, layer),
    }));
    const pixelEvidence = aggregatePixelEvidence(layerPixelEvidence);
    const rcsPixelEvidence = (projectedPlume?.rcs?.instances || []).map((instance) => (
      measurePlumePixels(png, instance)
    ));
    captureRecord = {
      path: fullPath,
      scenario,
      camera: 'normal gameplay chase camera',
      settings: actualSettings,
      projectedPlume,
      pixelEvidence,
      layerPixelEvidence,
      rcsPixelEvidence,
      frameSync: {
        ...frozenFrame,
        projectionDeltaPx: maxProjectionDelta(projectedPlume, projectionAfterScreenshot),
      },
    };
  } finally {
    const resumedFrame = await resumeRenderedFrame(page);
    if (captureRecord) captureRecord.frameSync.resume = resumedFrame;
  }
  captures.push(captureRecord);
}

async function freezeRenderedFrame(targetPage) {
  return targetPage.evaluate(async (source) => {
    const sf = window.SF;
    const timeEffects = sf?.timeEffects || sf?.ctx?.timeEffects;
    if (!sf?.state || !timeEffects?.set || !timeEffects?.clear) {
      throw new Error('thruster capture requires the public timeEffects authority');
    }
    if (window.__SF_THRUSTER_CAPTURE_FRAME__) {
      throw new Error('thruster capture frame barrier is already active');
    }

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const pending = new Map();
    let nextSyntheticId = -1;
    const barrier = {
      originalRequestAnimationFrame,
      originalCancelAnimationFrame,
      pending,
    };
    window.__SF_THRUSTER_CAPTURE_FRAME__ = barrier;
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

      const renderFrameBefore = sf.state.render?.renderer?.info?.render?.frame ?? null;
      await new Promise((resolve) => {
        // The game loop already has a native RAF pending. It presents one final frame with the
        // simulation paused, then its next callback is held by the barrier above. This callback was
        // registered later, so resolving it means that final camera/render update has completed.
        originalRequestAnimationFrame.call(window, resolve);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (pending.size === 0) {
        throw new Error('thruster capture frame barrier did not intercept the live render loop');
      }
      return {
        frozen: true,
        effectiveScale: timeEffects.getEffectiveScale?.() ?? sf.state.timeScale,
        renderFrameBefore,
        renderFrameAfter: sf.state.render?.renderer?.info?.render?.frame ?? null,
        heldAnimationFrameCallbacks: pending.size,
      };
    } catch (error) {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      window.__SF_THRUSTER_CAPTURE_FRAME__ = null;
      timeEffects.clear(source);
      throw error;
    }
  }, CAPTURE_TIME_SOURCE);
}

async function resumeRenderedFrame(targetPage) {
  return targetPage.evaluate((source) => {
    const sf = window.SF;
    const timeEffects = sf?.timeEffects || sf?.ctx?.timeEffects;
    const barrier = window.__SF_THRUSTER_CAPTURE_FRAME__;
    if (!barrier) {
      timeEffects?.clear?.(source);
      return { restored: false, reason: 'frame barrier was not active' };
    }

    const callbacks = [...barrier.pending.values()];
    window.requestAnimationFrame = barrier.originalRequestAnimationFrame;
    window.cancelAnimationFrame = barrier.originalCancelAnimationFrame;
    window.__SF_THRUSTER_CAPTURE_FRAME__ = null;
    for (const callback of callbacks) {
      barrier.originalRequestAnimationFrame.call(window, callback);
    }
    const effectiveScale = timeEffects.clear(source);
    return {
      restored: true,
      resumedAnimationFrameCallbacks: callbacks.length,
      effectiveScale,
    };
  }, CAPTURE_TIME_SOURCE);
}

function maxProjectionDelta(before, after) {
  const points = (projection) => [
    ...(projection?.layers || []).flatMap((layer) => [layer.nozzle, layer.tip]),
    ...(projection?.rcs?.instances || []).flatMap((instance) => [instance.nozzle, instance.tip]),
  ];
  const beforePoints = points(before);
  const afterPoints = points(after);
  if (beforePoints.length !== afterPoints.length) return Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (let i = 0; i < beforePoints.length; i++) {
    maximum = Math.max(maximum, Math.hypot(
      afterPoints[i].x - beforePoints[i].x,
      afterPoints[i].y - beforePoints[i].y,
    ));
  }
  return maximum;
}

async function readProjectedPlume(targetPage) {
  return targetPage.evaluate(({ width, height }) => {
    const sf = window.SF;
    const camera = sf?.state?.render?.camera;
    const energy = sf?.registry?.get?.('vfx')?._energy;
    const plume = energy?.plumeSystem;
    const rcsSystem = energy?.rcsSystem;
    const activeBatches = plume?.layerBatches?.filter((entry) => entry.role !== 'distortion' && entry.mesh?.count > 0) || [];
    if (!camera || !activeBatches.length || !plume?.group?.visible) {
      return { visible: false, role: null, lengthPx: 0, layers: [] };
    }
    const Vec3 = camera.position.constructor;
    plume.group.updateMatrixWorld(true);
    const toScreen = (point) => {
      const ndc = point.clone().project(camera);
      return { x: (ndc.x * 0.5 + 0.5) * width, y: (-ndc.y * 0.5 + 0.5) * height };
    };
    const layers = activeBatches.map((entry) => {
      const nozzle = new Vec3(entry.offset[0], entry.offset[1], entry.offset[2]);
      const axis = new Vec3(entry.axisScale[0], entry.axisScale[1], entry.axisScale[2]).normalize();
      const visibleTail = entry.role === 'core' ? 0.76 : entry.role === 'inner' ? 0.9 : 0.84;
      const tip = nozzle.clone().addScaledVector(axis, -entry.axisScale[3] * visibleTail);
      nozzle.applyMatrix4(plume.group.matrixWorld);
      tip.applyMatrix4(plume.group.matrixWorld);
      const start = toScreen(nozzle);
      const end = toScreen(tip);
      return {
        role: entry.role,
        nozzle: start,
        tip: end,
        lengthPx: Math.hypot(end.x - start.x, end.y - start.y),
        drawCount: entry.mesh.count,
        worldLength: entry.axisScale[3],
        worldWidth: entry.params[0],
      };
    });
    const primary = layers.find((entry) => entry.role === 'inner') || layers[0];
    const rcsBatch = rcsSystem?.layerBatches?.find((entry) => entry.role === 'core' && entry.mesh?.count > 0)
      || rcsSystem?.layerBatches?.find((entry) => entry.mesh?.count > 0);
    const rcsInstances = [];
    if (rcsBatch && rcsSystem?.group?.visible) {
      rcsSystem.group.updateMatrixWorld(true);
      for (let i = 0; i < rcsBatch.mesh.count; i++) {
        const o = i * 3;
        const s = i * 4;
        const rcsNozzle = new Vec3(rcsBatch.offset[o], rcsBatch.offset[o + 1], rcsBatch.offset[o + 2]);
        const rcsAxis = new Vec3(
          rcsBatch.axisScale[s],
          rcsBatch.axisScale[s + 1],
          rcsBatch.axisScale[s + 2],
        ).normalize();
        const rcsTip = rcsNozzle.clone().addScaledVector(rcsAxis, -rcsBatch.axisScale[s + 3]);
        rcsNozzle.applyMatrix4(rcsSystem.group.matrixWorld);
        rcsTip.applyMatrix4(rcsSystem.group.matrixWorld);
        const start = toScreen(rcsNozzle);
        const end = toScreen(rcsTip);
        rcsInstances.push({
          nozzle: start,
          tip: end,
          lengthPx: Math.hypot(end.x - start.x, end.y - start.y),
        });
      }
    }
    return {
      visible: true,
      role: primary.role,
      nozzle: primary.nozzle,
      tip: primary.tip,
      lengthPx: Math.max(...layers.map((entry) => entry.lengthPx)),
      drawCount: primary.drawCount,
      worldLength: primary.worldLength,
      worldWidth: primary.worldWidth,
      layers,
      rcs: {
        visible: !!(rcsSystem?.group?.visible && rcsInstances.length),
        role: rcsBatch?.role || null,
        drawCount: rcsBatch?.mesh?.count || 0,
        instances: rcsInstances,
      },
    };
  }, { width: WIDTH, height: HEIGHT });
}

function measurePlumePixels(buffer, projected) {
  const png = PNG.sync.read(buffer);
  const ax = projected.nozzle.x;
  const ay = projected.nozzle.y;
  const bx = projected.tip.x;
  const by = projected.tip.y;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = Math.max(1, dx * dx + dy * dy);
  // Projection and screenshot share a frozen rendered frame, so this corridor follows the actual
  // exhaust width instead of compensating for chase-camera movement with a ship-sized search area.
  const radius = Math.max(6, Math.min(24, projected.lengthPx * 0.1));
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
  const maxX = Math.min(png.width - 1, Math.ceil(Math.max(ax, bx) + radius));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - radius));
  const maxY = Math.min(png.height - 1, Math.ceil(Math.max(ay, by) + radius));
  let sampledPixels = 0;
  let cyanPixels = 0;
  let luminousPixels = 0;
  let contrastPixels = 0;
  let accumulatedContrast = 0;
  let signalPixels = 0;
  let signalAxisDistance = 0;
  let signalAxisDistanceMax = 0;
  let signalTMinimum = 1;
  let signalTMaximum = 0;
  const invLength = 1 / Math.sqrt(lenSq);
  const normalX = -dy * invLength;
  const normalY = dx * invLength;
  const comparisonOffset = Math.max(10, radius * 1.65);
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
      const localLuma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      let backgroundLuma = 0;
      let backgroundSamples = 0;
      for (const side of [-1, 1]) {
        const sampleX = Math.round(x + normalX * comparisonOffset * side);
        const sampleY = Math.round(y + normalY * comparisonOffset * side);
        if (sampleX < 0 || sampleX >= png.width || sampleY < 0 || sampleY >= png.height) continue;
        const sampleOffset = (sampleY * png.width + sampleX) * 4;
        backgroundLuma += png.data[sampleOffset] * 0.2126
          + png.data[sampleOffset + 1] * 0.7152
          + png.data[sampleOffset + 2] * 0.0722;
        backgroundSamples++;
      }
      const localContrast = backgroundSamples ? localLuma - (backgroundLuma / backgroundSamples) : 0;
      sampledPixels++;
      if (Math.max(r, g, b) >= 62) luminousPixels++;
      const cyan = g >= 48 && b >= 58 && g > r * 1.12 && b > r * 1.08;
      if (cyan) cyanPixels++;
      // Reduced-flash deliberately lowers absolute radiance. Preserve a strict visible-signal
      // check by comparing the projected exhaust axis with paired off-axis background samples
      // instead of silently requiring the default HDR brightness in accessibility modes.
      const contrasting = localContrast >= 9 && b >= r + 3 && g >= r + 2;
      if (contrasting) contrastPixels++;
      if (cyan || contrasting) {
        const axisDistance = Math.hypot(x - px, y - py);
        signalPixels++;
        signalAxisDistance += axisDistance;
        signalAxisDistanceMax = Math.max(signalAxisDistanceMax, axisDistance);
        signalTMinimum = Math.min(signalTMinimum, t);
        signalTMaximum = Math.max(signalTMaximum, t);
      }
      accumulatedContrast += Math.max(0, localContrast);
    }
  }
  return {
    sampledPixels,
    cyanPixels,
    luminousPixels,
    contrastPixels,
    meanPositiveContrast: sampledPixels ? accumulatedContrast / sampledPixels : 0,
    cyanFraction: sampledPixels ? cyanPixels / sampledPixels : 0,
    corridorRadiusPx: radius,
    signalPixels,
    signalMeanAxisDistancePx: signalPixels ? signalAxisDistance / signalPixels : null,
    signalMaxAxisDistancePx: signalPixels ? signalAxisDistanceMax : null,
    signalAxisCoverage: signalPixels ? [signalTMinimum, signalTMaximum] : null,
  };
}

function emptyPixelEvidence() {
  return {
    sampledPixels: 0,
    cyanPixels: 0,
    luminousPixels: 0,
    contrastPixels: 0,
    meanPositiveContrast: 0,
    cyanFraction: 0,
    signalPixels: 0,
  };
}

function aggregatePixelEvidence(entries) {
  if (!entries.length) return emptyPixelEvidence();
  const out = emptyPixelEvidence();
  for (const entry of entries) {
    out.sampledPixels += entry.sampledPixels || 0;
    out.cyanPixels += entry.cyanPixels || 0;
    out.luminousPixels += entry.luminousPixels || 0;
    out.contrastPixels += entry.contrastPixels || 0;
    out.meanPositiveContrast += entry.meanPositiveContrast || 0;
    out.signalPixels += entry.signalPixels || 0;
  }
  out.meanPositiveContrast /= entries.length;
  out.cyanFraction = out.sampledPixels ? out.cyanPixels / out.sampledPixels : 0;
  return out;
}

async function trimGameplayVideo(fullPath, outputPath, offsetSeconds) {
  const earlyFramePath = path.join(OUT, 'thruster-normal-route-early.png');
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-ss', offsetSeconds.toFixed(3), '-i', fullPath,
      '-an', '-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', outputPath,
    ], { windowsHide: true });
    await execFileAsync('ffmpeg', [
      '-y', '-ss', '0.75', '-i', outputPath, '-frames:v', '1', earlyFramePath,
    ], { windowsHide: true });
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', outputPath,
    ], { windowsHide: true });
    const durationSeconds = Number.parseFloat(stdout);
    return {
      ok: Number.isFinite(durationSeconds) && durationSeconds >= 5 && existsSync(earlyFramePath),
      path: outputPath,
      sourcePath: fullPath,
      trimmedBootSeconds: offsetSeconds,
      durationSeconds,
      earlyFramePath,
    };
  } catch (error) {
    issues.push({ type: 'motion-capture', text: error?.message || String(error) });
    return { ok: false, path: outputPath, sourcePath: fullPath, trimmedBootSeconds: offsetSeconds };
  }
}

function summarizeVisualEvidence(frames) {
  const requiredScenarios = [
    'initial acceleration',
    'sustained cruise',
    'high-throttle turbo',
    'engine trail with legacy HDR-energy toggle off',
    'reduced motion and flash',
  ];
  const required = requiredScenarios.map((scenario) => frames.find((frame) => frame.scenario === scenario));
  const failures = [];
  for (let i = 0; i < required.length; i++) {
    const frame = required[i];
    const scenario = requiredScenarios[i];
    if (!frame) {
      failures.push(`${scenario}: missing capture`);
      continue;
    }
    if (!frame.projectedPlume?.visible || frame.projectedPlume.lengthPx < 35) {
      failures.push(`${scenario}: projected plume footprint ${frame.projectedPlume?.lengthPx || 0}px`);
    }
    if (!frame.frameSync?.frozen || frame.frameSync.projectionDeltaPx > 0.05) {
      failures.push(`${scenario}: projection moved ${frame.frameSync?.projectionDeltaPx ?? 'unknown'}px during screenshot`);
    }
    if (!frame.frameSync?.resume?.restored) {
      failures.push(`${scenario}: render loop was not restored after capture`);
    }
    const cyanPixels = frame.pixelEvidence?.cyanPixels || 0;
    const contrastPixels = frame.pixelEvidence?.contrastPixels || 0;
    if (Math.max(cyanPixels, contrastPixels) < 24) {
      failures.push(`${scenario}: only ${cyanPixels} cyan / ${contrastPixels} locally contrasting exhaust pixels`);
    }
    if (scenario === 'reduced motion and flash'
      && (!frame.settings?.motionReduce || !frame.settings?.flashReduce)) {
      failures.push(`reduced motion and flash: settings were not live (${JSON.stringify(frame.settings)})`);
    }
    const readableRoles = (frame.layerPixelEvidence || [])
      .filter((entry) => Math.max(entry.cyanPixels || 0, entry.contrastPixels || 0) >= 8)
      .map((entry) => entry.role);
    if (scenario !== 'reduced motion and flash' && readableRoles.length < 3) {
      failures.push(`${scenario}: only ${readableRoles.join(', ') || 'zero'} structurally readable plume roles`);
    }
  }
  const hardTurn = frames.find((frame) => frame.scenario === 'hard turn with RCS');
  const rcsLengths = hardTurn?.projectedPlume?.rcs?.instances?.map((entry) => entry.lengthPx) || [];
  const rcsCyanPixels = (hardTurn?.rcsPixelEvidence || [])
    .reduce((sum, entry) => sum + (entry.cyanPixels || 0), 0);
  if (!hardTurn?.projectedPlume?.rcs?.visible || rcsLengths.length < 2 || Math.max(0, ...rcsLengths) < 8) {
    failures.push(`hard turn with RCS: projected jets missing or too small (${rcsLengths.join(', ')}px)`);
  }
  if (rcsCyanPixels < 6) {
    failures.push(`hard turn with RCS: only ${rcsCyanPixels} cyan jet pixels`);
  }
  return { ok: failures.length === 0, failures };
}

async function dismissTutorial(targetPage) {
  await targetPage.evaluate(() => {
    for (const selector of ['.tutorial-overlay', '[data-screen="tutorial"]', '.sf-tutorial']) {
      const root = document.querySelector(selector);
      const button = root && [...root.querySelectorAll('button')].find((node) => /skip|dismiss|close|got it/i.test(node.textContent || ''));
      if (button) button.click();
    }
  });
}

function findSystemBrowser() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}
