#!/usr/bin/env node
// SpaceFace Chrome/CDP performance profiler.
//
// This is evidence, not a quality-reduction path: it never changes video settings, render scale,
// bloom, shadows, particle quality, or physics. It starts a deterministic live flight, waits for
// authored assets to settle, samples the real browser frame loop and app diagnostics, then writes a
// JSON report that future optimization work can compare.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = parseArgs(process.argv.slice(2));

const WIDTH = Number(argv.width || 1280);
const HEIGHT = Number(argv.height || 800);
const SEED = Number(argv.seed || 47) >>> 0;
const WARMUP_MS = Number(argv.warmup || 3000);
const DURATION_MS = Number(argv.duration || 9000);
// The game can legitimately spend up to 45s waiting for release-authored visuals before entering
// flight. Keep the probe wait above that so profiling fails on measured budgets, not a startup race.
const PLAYABLE_TIMEOUT_MS = Number(argv.playableTimeoutMs || argv['playable-timeout-ms'] || 90000);
const RUNTIME_SAMPLE_MS = Number(argv.runtimeSampleMs || argv['runtime-sample-ms'] || 250);
const OUT = argv.out || '.devshots/perf/performance-profile.json';
const SHOT = argv.shot || '.devshots/perf/performance-profile-crowded-flight.jpg';
const STRICT = !!argv.strict;
const FRAME_FLOOR_MS = Number(argv.frameFloorMs || 34.3);
const FRAME_TARGET_MS = Number(argv.frameTargetMs || 16.7);
const FRAME_CALLBACK_BUDGET_MS = Number(argv.frameCallbackMs || argv['frame-callback-ms'] || FRAME_TARGET_MS);
const FRAME_UNTRACKED_BUDGET_MS = Number(argv.frameUntrackedMs || argv['frame-untracked-ms'] || 4);
const RENDER_PHASE_BUDGET_MS = Number(argv.renderPhaseMs || 16);
const SIM_PHASE_BUDGET_MS = Number(argv.simPhaseMs || 4);
const SIM_FRAME_BUDGET_MS = Number(argv.simFrameMs || argv['sim-frame-ms'] || 8);
const UI_PHASE_BUDGET_MS = Number(argv.uiPhaseMs || 2);
const HEAP_GROWTH_BUDGET_MB = Number(argv.heapGrowthMb || 30);
const LOOP_SHED_BACKLOG_FRAME_BUDGET = Number(argv.shedBacklogFrames || argv['shed-backlog-frames'] || 5);
const SPATIAL_HASH_REBUILD_RATE_BUDGET = Number(argv.spatialHashRebuildsPerSecond || argv['spatial-hash-rebuilds-per-second'] || 15);
const SPATIAL_HASH_QUERY_RATE_BUDGET = Number(argv.spatialHashQueriesPerSecond || argv['spatial-hash-queries-per-second'] || 55);
const SPATIAL_HASH_CANDIDATE_RATE_BUDGET = Number(argv.spatialHashCandidatesPerSecond || argv['spatial-hash-candidates-per-second'] || 2500);
const DRAW_CALL_BUDGET = Number(argv.drawCalls || 600);
const VISIBLE_MESH_BUDGET = Number(argv.visibleMeshes || argv['visible-meshes'] || 220);
const SHIP_DYNAMIC_MESH_BUDGET = Number(argv.shipDynamicMeshes || argv['ship-dynamic-meshes'] || 96);
const MATERIAL_KEY_BUDGET = Number(argv.materialKeys || argv['material-keys'] || 64);
const SHIP_CANOPY_SURFACE_BUDGET = Number(argv.shipCanopySurfaces || argv['ship-canopy-surfaces'] || 18);
const SHIP_FAN_SURFACE_BUDGET = Number(argv.shipFanSurfaces || argv['ship-fan-surfaces'] || 30);
const BLOOM_FULL_FRAME_PASS_BUDGET = Number(argv.bloomFullFramePasses || argv['bloom-full-frame-passes'] || 2);
const BLOOM_PASS_BUDGET = Number(argv.bloomPasses || argv['bloom-passes'] || 3);
const DIAGNOSTIC_VARIANTS = !!(argv.diagnosticVariants || argv['diagnostic-variants']);
const DIAGNOSTIC_VARIANT_MS = Number(argv.diagnosticVariantMs || argv['diagnostic-variant-ms'] || 2500);
const DIAGNOSTIC_MIN_RAF_SAMPLES = Number(argv.diagnosticMinRafSamples || argv['diagnostic-min-raf-samples'] || 20);
const ANGLE = argv.angle ? String(argv.angle) : '';
const HEADED = !!(argv.headed || argv.headful || argv.headless === 'false');
const EXTRA_BROWSER_ARGS = [
  ANGLE ? `--use-angle=${ANGLE}` : null,
].filter(Boolean);

const report = {
  schema: 'spaceface.performanceProfile.v1',
  generatedAt: new Date().toISOString(),
  runner: {
    width: WIDTH,
    height: HEIGHT,
    seed: SEED,
    warmupMs: WARMUP_MS,
    durationMs: DURATION_MS,
    runtimeSampleMs: RUNTIME_SAMPLE_MS,
    strict: STRICT,
    diagnosticVariants: DIAGNOSTIC_VARIANTS,
    diagnosticMinRafSamples: DIAGNOSTIC_MIN_RAF_SAMPLES,
    headless: !HEADED,
    angle: ANGLE || null,
    extraBrowserArgs: EXTRA_BROWSER_ARGS,
  },
  qualityPreserving: {
    settingsOverridesApplied: false,
    forbiddenShortcuts: [
      'renderScale',
      'pixelRatioCap',
      'bloom',
      'shadows',
      'particleQuality',
      'physicsSimplification',
    ],
  },
  environment: detectExternalPerfEnvironment(),
  scenarios: [],
  summary: null,
};

let server = null;
let chrome = null;
let chromeProfileDir = null;
let ws = null;

try {
  server = await startFreshServer();
  const debugPort = await findFreePort(9821);
  chrome = spawnChrome(debugPort);
  const cdp = await connectCdp(debugPort);
  ws = cdp.ws;

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Performance.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}",
  });

  const pageIssues = collectPageIssues(cdp);
  await cdp.send('Page.navigate', { url: withDebugFlight(server.baseUrl) });
  await waitFor(cdp, isBootReady, 15000, 'SpaceFace debug runtime');
  await evalVoid(cdp, `(() => {
    window.SF.bus.emit('game:new', { name: 'Perf Profile', seed: ${SEED} });
    window.SF.bus.emit('ui:closeAll', {});
  })()`);
  const playable = await waitFor(cdp, isPlayable, PLAYABLE_TIMEOUT_MS, 'seeded flight session');
  await dismissOnboardingIntro(cdp);
  const scenario = await runCrowdedFlightScenario(cdp, {
    pageIssues,
    startTick: playable.tick,
  });
  report.scenarios.push(scenario);

  report.summary = summarizeReport(report.scenarios);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.log(`[perf-profile] report: ${OUT}`);
  console.log(`[perf-profile] screenshot: ${SHOT} ${(statSync(SHOT).size / 1024).toFixed(1)} KB`);
  console.log(`[perf-profile] budget summary: ${report.summary.pass ? 'PASS' : 'FAIL'} (${report.summary.failedBudgets.length} failed)`);

  if (STRICT && !report.summary.pass) process.exitCode = 1;
} finally {
  try { if (ws) ws.close(); } catch (_) {}
  try { if (chrome) chrome.kill(); } catch (_) {}
  try { if (server && server.kill) server.kill(); } catch (_) {}
  try { if (chromeProfileDir) rmSync(chromeProfileDir, { recursive: true, force: true }); } catch (_) {}
}

async function runCrowdedFlightScenario(cdp, { pageIssues, startTick }) {
  const scenarioName = 'crowded-flight';
  const assetWarmup = await waitForAuthoredAssetsSteady(cdp);
  await waitFor(cdp, () => getTick(cdp, Math.max(startTick + 2, assetWarmup.tick + 1)), 10000, 'advancing flight ticks');

  const baselineState = await readQualityState(cdp);
  await sleep(WARMUP_MS);
  await resetRuntimeDiagnostics(cdp);
  const chromeStart = await readChromeMetrics(cdp);
  const sampled = await sampleRuntime(cdp, DURATION_MS);
  const chromeEnd = await readChromeMetrics(cdp);
  const finalState = await readQualityState(cdp);
  const screenshot = await captureScreenshot(cdp, SHOT);
  const diagnosticVariants = DIAGNOSTIC_VARIANTS ? await runDiagnosticVariants(cdp) : [];

  const samples = sampled.samples.filter((sample) => sample.ready);
  assert.ok(samples.length >= 2, `expected at least 2 runtime samples; got ${samples.length}`);
  assert.ok(sampled.raf.frames.length >= 2, `expected at least 2 rAF frame samples; got ${sampled.raf.frames.length}`);

  const finalSample = samples[samples.length - 1];
  const renderCalls = seriesStats(samples.map((sample) => sample.render.calls));
  const triangles = seriesStats(samples.map((sample) => sample.render.triangles));
  const diagFrameP95 = finalSample.frameMs.p95;
  const raf = frameStats(sampled.raf.frames);
  const heapGrowthMB = heapGrowthFrom(sampled.heap, chromeStart, chromeEnd);
  const phaseP95 = phaseP95s(finalSample.perf);
  const sceneStats = sampled.sceneStats;
  const settingsChanged = JSON.stringify(baselineState.settingsVideo) !== JSON.stringify(finalState.settingsVideo);
  const callbackP95 = callbackP95s(finalSample.perf);
  const diagnosticSamples = Math.max(
    samples.length,
    Number(finalSample.perf && finalSample.perf.frame && finalSample.perf.frame.samples) || 0,
    Number(finalSample.perf && finalSample.perf.frameCallback && finalSample.perf.frameCallback.samples) || 0,
    Number(finalSample.perf && finalSample.perf.phases && finalSample.perf.phases.render && finalSample.perf.phases.render.samples) || 0,
  );
  const budgets = evaluateBudgets({
    rafFrameP95: raf.p95,
    diagnosticFrameP95: diagFrameP95,
    renderCallsPeak: renderCalls.max,
    heapGrowthMB,
    phaseP95,
    callbackP95,
    sceneStats,
    finalSample,
    diagnosticSamples,
    rafSamples: sampled.raf.frames.length,
  });
  const bottleneck = classifyBottleneck({
    rafFrameP95: raf.p95,
    diagnosticFrameP95: diagFrameP95,
    phaseP95,
    callbackP95,
    sceneStats,
    renderCallsPeak: renderCalls.max,
    finalSample,
    diagnosticVariants,
  });

  return {
    name: scenarioName,
    pass: budgets.every((budget) => budget.pass || budget.severity === 'stretch'),
    seed: SEED,
    url: withDebugFlight(server.baseUrl),
    startTick,
    endTick: finalState.tick,
    assetWarmup,
    sampleWindow: {
      warmupMs: WARMUP_MS,
      durationMs: DURATION_MS,
      runtimeSamples: samples.length,
      diagnosticSamples,
      rafSamples: sampled.raf.frames.length,
    },
    budgets,
    rafFrameMs: raf,
    diagnosticFrameMs: finalSample.frameMs,
    render: {
      calls: renderCalls,
      triangles,
      finalCalls: finalSample.render.calls,
      finalTriangles: finalSample.render.triangles,
    },
    memory: {
      final: finalSample.memory,
      heap: sampled.heap,
      heapGrowthMB,
      chromeStart,
      chromeEnd,
    },
    probeReadMs: seriesStats(samples.map((sample) => sample.probeReadMs)),
    phases: phaseP95,
    callback: callbackP95,
    post: finalSample.post || null,
    perf: {
      loop: finalSample.perf && finalSample.perf.loop || null,
      counters: finalSample.perf && finalSample.perf.counters || null,
      entities: finalSample.perf && finalSample.perf.entities || null,
      settings: finalSample.perf && finalSample.perf.settings || null,
      topSystems: topSystemStats(finalSample.perf),
    },
    counts: finalSample.counts,
    sceneStats,
    bottleneck,
    authoredPoolUtilization: sceneStats.authoredPools,
    qualityAssertions: {
      settingsBefore: baselineState.settingsVideo,
      settingsAfter: finalState.settingsVideo,
      settingsChanged,
      noValueReducingOverrides: true,
      pass: !settingsChanged,
    },
    browser: finalState.browser,
    pageIssues: {
      errors: pageIssues.errorIssues(),
      warnings: pageIssues.warningIssues(),
    },
    screenshot,
    diagnosticVariants,
  };
}

async function sampleRuntime(cdp, durationMs) {
  return evalJson(cdp, `new Promise((resolve) => {
    const started = performance.now();
    const rafFrames = [];
    const samples = [];
    const heapSamples = [];
    let lastRaf = null;
    let settled = false;
    let intervalId = null;
    let lastDiagAt = -Infinity;

    const readHeap = () => {
      const mem = performance && performance.memory ? performance.memory : null;
      return mem ? {
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
      } : null;
    };

    const readCompositorShells = () => {
      const sf = window.SF || null;
      const state = sf && sf.state || {};
      const modalOpen = document.body.classList.contains('ui-modal-open');
      const selectors = ['#screens', '#modal-backdrop', '#sf-dock-overlay', '#vignette', '#boot-overlay', '#hud'];
      const shells = {};
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const cs = getComputedStyle(el);
        shells[selector] = {
          display: cs.display,
          visibility: cs.visibility,
          opacity: Number(cs.opacity) || 0,
          pointerEvents: cs.pointerEvents,
          hiddenAttr: !!(el.hidden || el.hasAttribute('hidden')),
          activeClass: el.classList.contains('active'),
          backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
          filter: cs.filter || 'none',
          boxShadow: cs.boxShadow && cs.boxShadow !== 'none' ? true : false,
        };
      }
      const backdrop = shells['#modal-backdrop'];
      const dockFade = shells['#sf-dock-overlay'];
      const bootOverlay = shells['#boot-overlay'];
      const legacyVignette = shells['#vignette'];
      const flightNoModal = state.mode === 'flight' && !modalOpen;
      const inactiveDockFadeDisplayed = flightNoModal && dockFade && !dockFade.activeClass && dockFade.display !== 'none' ? 1 : 0;
      const inactiveBootOverlayDisplayed = flightNoModal && bootOverlay && bootOverlay.display !== 'none' && bootOverlay.visibility !== 'hidden' ? 1 : 0;
      const legacyVignetteDisplayed = flightNoModal && legacyVignette && legacyVignette.display !== 'none' ? 1 : 0;
      return {
        mode: state.mode || null,
        modalOpen,
        shells,
        hiddenBackdropActive: flightNoModal && backdrop && backdrop.display !== 'none' && backdrop.visibility !== 'hidden' ? 1 : 0,
        inactiveDockFadeDisplayed,
        inactiveBootOverlayDisplayed,
        deadVignetteShells: legacyVignette ? 1 : 0,
        inactiveFullscreenShellsDisplayed: inactiveDockFadeDisplayed + inactiveBootOverlayDisplayed + legacyVignetteDisplayed,
      };
    };

    const readDiag = () => {
      const readStarted = performance.now();
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      if (!diag || typeof diag.getReport !== 'function') return { ready: false };
      const d = diag.getReport();
      const perf = (window.__SPACEFACE_PERF__ && typeof window.__SPACEFACE_PERF__.getReport === 'function')
        ? window.__SPACEFACE_PERF__.getReport()
        : (d.perf || {});
      return {
        ready: true,
        atMs: performance.now() - started,
        fps: d.fps,
        fpsAvg: d.fpsAvg,
        frameMs: d.frameMs || {},
        render: d.render || {},
        memory: d.memory || {},
        counts: d.counts || {},
        post: d.post || {},
        perf,
        compositor: readCompositorShells(),
        heap: readHeap(),
        probeReadMs: performance.now() - readStarted,
      };
    };

    const pushDiag = (force = false) => {
      const elapsed = performance.now() - started;
      if (!force && elapsed - lastDiagAt < ${JSON.stringify(RUNTIME_SAMPLE_MS)}) return;
      lastDiagAt = elapsed;
      const sample = readDiag();
      samples.push(sample);
      if (sample.heap) heapSamples.push({ atMs: elapsed, ...sample.heap });
    };

    const sceneBreakdown = () => {
      const sf = window.SF || null;
      const state = sf && sf.state || null;
      const renderSys = state && state.render || null;
      const scene = renderSys && renderSys.scene;
      const ownerTypes = new WeakMap();
      if (state && Array.isArray(state.entityList)) {
        for (const entity of state.entityList) {
          if (!entity || !entity.mesh || typeof entity.mesh.traverse !== 'function') continue;
          const type = entity.type || 'entity:unknown';
          entity.mesh.traverse((object) => ownerTypes.set(object, type));
        }
      }
      const visibleMeshByCategory = {};
      const visibleShipMeshByRole = {};
      const visibleShipMeshByPart = {};
      const visibleShipMeshByRoleAndPart = {};
      const visibleShipMeshSamples = [];
      const materialKeys = new Set();
      const materialKeyCounts = {};
      const materialKeyCountsByCategory = {};
      const shipMaterialKeyCounts = {};
      const increment = (map, key) => {
        map[key] = (map[key] || 0) + 1;
      };
      const addCategory = (key) => {
        increment(visibleMeshByCategory, key);
      };
      const materialKey = (material) => {
        if (!material) return 'none';
        const name = material.name || material.type || 'material';
        const transparent = material.transparent ? ':transparent' : ':opaque';
        const blending = material.blending != null ? ':blend' + material.blending : '';
        return name + transparent + blending;
      };
      const materialList = (object) => Array.isArray(object.material) ? object.material : [object.material];
      const compactPartUrl = (url) => {
        if (!url) return 'unknown';
        const parts = String(url).split(/[\\\\/]/).filter(Boolean);
        return parts.slice(-2).join('/');
      };
      const shipMeshRoleKey = (object) => {
        const tags = object && object.userData && object.userData.spacefaceTags || {};
        const reasons = [];
        if (tags.instance === false) reasons.push('instance:false');
        if (tags.canopy) reasons.push('canopy');
        if (tags.drive) reasons.push('drive:' + tags.drive);
        if (tags.damageRole) reasons.push('damageRole:' + tags.damageRole);
        if (tags.vfxRole) reasons.push('vfxRole:' + tags.vfxRole);
        if (tags.decal) reasons.push('decal');
        for (const material of materialList(object)) {
          if (!material) continue;
          if (material.transparent) reasons.push('transparent');
          if (Number.isFinite(material.transmission) && material.transmission > 0) reasons.push('transmission');
          if (material.depthWrite === false) reasons.push('depthWrite:false');
        }
        if (!reasons.length) reasons.push('unclassified');
        return [...new Set(reasons)].join('+');
      };
      const stats = {
        objects: 0,
        visibleObjects: 0,
        meshes: 0,
        visibleMeshes: 0,
        visibleNonPoolMeshes: 0,
        instancedMeshes: 0,
        castShadowObjects: 0,
        visibleMeshByCategory,
        visibleShipMeshByRole,
        visibleShipMeshByPart,
        visibleShipMeshByRoleAndPart,
        visibleShipMeshSamples,
        visibleMaterialKeys: [],
        visibleMaterialKeysByCategory: [],
        visibleShipMaterialKeys: [],
        visibleMaterialKeyCount: 0,
        authoredShipStates: {},
        authoredStaticBatches: {
          visible: 0,
          hidden: 0,
          total: 0,
        },
        authoredPools: {
          totalChunks: 0,
          visibleChunks: 0,
          emptyChunks: 0,
          visibleInstances: 0,
          capacity: 0,
          averageVisibleInstancesPerVisibleChunk: 0,
          lowOccupancyVisibleChunks: 0,
          chunkCounts: [],
        },
      };
      if (scene && typeof scene.traverse === 'function') {
        scene.traverse((object) => {
          if (!object) return;
          stats.objects++;
          if (object.visible !== false) stats.visibleObjects++;
          if (object.isMesh || object.isInstancedMesh) {
            stats.meshes++;
            if (object.visible !== false) stats.visibleMeshes++;
          }
          if (object.isInstancedMesh) stats.instancedMeshes++;
          if (object.castShadow) stats.castShadowObjects++;
          if ((object.isMesh || object.isInstancedMesh) && object.visible !== false) {
            let category = ownerTypes.get(object);
            if (object.userData && object.userData.spacefaceStaticBatch) category = 'ship:authoredStaticBatch';
            else if (object.userData && object.userData.spacefaceInstancePool) category = 'ship:authoredInstancePool';
            else if (object.userData && object.userData.sharedContactShadow) category = 'contactShadow';
            else if (!category) category = object.isInstancedMesh ? 'unowned:instanced' : 'unowned:mesh';
            addCategory(category);
            let roleKey = null;
            let partKey = null;
            if (category === 'ship' && object.isMesh) {
              roleKey = shipMeshRoleKey(object);
              partKey = compactPartUrl(object.userData && object.userData.spacefacePartUrl);
              increment(visibleShipMeshByRole, roleKey);
              increment(visibleShipMeshByPart, partKey);
              increment(visibleShipMeshByRoleAndPart, roleKey + ' | ' + partKey);
              if (visibleShipMeshSamples.length < 24) {
                visibleShipMeshSamples.push({
                  name: object.name || '',
                  part: partKey,
                  role: roleKey,
                });
              }
            }
            const materials = materialList(object);
            for (const material of materials) {
              const key = materialKey(material);
              materialKeys.add(key);
              increment(materialKeyCounts, key);
              increment(materialKeyCountsByCategory, category + ' | ' + key);
              if (category === 'ship' && roleKey && partKey) {
                increment(shipMaterialKeyCounts, partKey + ' | ' + roleKey + ' | ' + key);
              }
            }
          }
          if (object.isInstancedMesh && object.userData && object.userData.spacefaceInstancePool) {
            const count = object.count || 0;
            const capacity = object.instanceMatrix && object.instanceMatrix.count || 0;
            stats.authoredPools.totalChunks++;
            stats.authoredPools.capacity += capacity;
            stats.authoredPools.chunkCounts.push(count);
            if (count > 0 && object.visible !== false) {
              stats.authoredPools.visibleChunks++;
              stats.authoredPools.visibleInstances += count;
              if (count <= 3) stats.authoredPools.lowOccupancyVisibleChunks++;
            } else {
              stats.authoredPools.emptyChunks++;
            }
          } else if ((object.isMesh || object.isInstancedMesh) && object.visible !== false) {
            stats.visibleNonPoolMeshes++;
          }
          if (object.isMesh && object.userData && object.userData.spacefaceStaticBatch) {
            stats.authoredStaticBatches.total++;
            if (object.visible !== false) stats.authoredStaticBatches.visible++;
            else stats.authoredStaticBatches.hidden++;
          }
        });
      }
      stats.visibleMaterialKeys = Object.entries(materialKeyCounts)
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .slice(0, 32)
        .map(([key, count]) => ({ key, count }));
      stats.visibleMaterialKeysByCategory = Object.entries(materialKeyCountsByCategory)
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .slice(0, 32)
        .map(([key, count]) => ({ key, count }));
      stats.visibleShipMaterialKeys = Object.entries(shipMaterialKeyCounts)
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .slice(0, 48)
        .map(([key, count]) => ({ key, count }));
      if (state && Array.isArray(state.entityList)) {
        for (const entity of state.entityList) {
          if (!entity || entity.type !== 'ship' || entity.alive === false || !entity.mesh) continue;
          const assetState = entity.mesh.userData && entity.mesh.userData.authoredAssetState || 'unknown';
          stats.authoredShipStates[assetState] = (stats.authoredShipStates[assetState] || 0) + 1;
        }
      }
      if (stats.authoredPools.visibleChunks > 0) {
        stats.authoredPools.averageVisibleInstancesPerVisibleChunk =
          stats.authoredPools.visibleInstances / stats.authoredPools.visibleChunks;
      }
      stats.authoredPools.chunkCounts.sort((a, b) => a - b);
      stats.visibleMaterialKeyCount = materialKeys.size;
      return stats;
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      if (intervalId != null) clearInterval(intervalId);
      pushDiag(true);
      resolve({
        raf: { frames: rafFrames },
        samples,
        heap: heapSamples,
        sceneStats: sceneBreakdown(),
      });
    };

    const step = (now) => {
      if (settled) return;
      if (lastRaf != null) rafFrames.push(now - lastRaf);
      lastRaf = now;
      const elapsed = performance.now() - started;
      pushDiag();
      if (elapsed >= ${JSON.stringify(durationMs)}) {
        finish();
      } else {
        requestAnimationFrame(step);
      }
    };
    pushDiag(true);
    intervalId = setInterval(pushDiag, ${JSON.stringify(RUNTIME_SAMPLE_MS)});
    setTimeout(finish, ${JSON.stringify(durationMs)} + 100);
    requestAnimationFrame(step);
  })`);
}

async function runDiagnosticVariants(cdp) {
  const variants = [];
  const definitions = [
    {
      name: 'hud-hidden-compositor-isolation',
      note: 'Diagnostic only: hides the DOM HUD shell to isolate CSS/compositor cost; not a gameplay or quality fix.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-hud';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '#ui-root{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-hud');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'hud-flight-layer-hidden',
      note: 'Diagnostic only: hides only the always-mounted flight HUD layer, leaving root/screen shells intact.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-hud-layer';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '#hud{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-hud-layer');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'root-nonhud-overlays-hidden',
      note: 'Diagnostic only: hides non-HUD root overlays to isolate always-mounted compositor shells.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-root-nonhud-overlays';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '#control-hints,#sf-dock-overlay,#modal-backdrop,#vignette,#boot-overlay,#toasts,#alerts{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-root-nonhud-overlays');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'control-hints-hidden',
      note: 'Diagnostic only: hides the flight control hint bar to isolate its blur/shadow/fade compositor cost.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-control-hints';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '#control-hints{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-control-hints');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'control-hints-effects-off',
      note: 'Diagnostic only: keeps the hint bar present while stripping blur/shadow/transitions from that one overlay.',
      apply: `(() => {
        const id = 'sf-perf-variant-control-hints-effects-off';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = [
          '#control-hints{',
          'text-shadow:none!important;',
          'box-shadow:none!important;',
          'filter:none!important;',
          'backdrop-filter:none!important;',
          '-webkit-backdrop-filter:none!important;',
          'animation:none!important;',
          'transition:none!important;',
          '}'
        ].join('');
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-control-hints-effects-off');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'dock-fade-overlay-hidden',
      note: 'Diagnostic only: hides the docking fade overlay to catch inactive fullscreen transition-layer cost.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-dock-fade';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '#sf-dock-overlay{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-dock-fade');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'inactive-fullscreen-shells-hidden',
      note: 'Diagnostic only: hides modal/vignette/boot fullscreen shells to catch faded-but-composited layers.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-inactive-fullscreen-shells';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '#modal-backdrop,#vignette,#boot-overlay{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-inactive-fullscreen-shells');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'hud-radar-target-hidden',
      note: 'Diagnostic only: hides the radar/target right-dock layer to isolate canvas and target compositor cost.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-radar-target';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '.sf-rightdock{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-radar-target');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'hud-radar-only-hidden',
      note: 'Diagnostic only: hides only the radar canvas/legend wrapper to isolate radar redraw/compositor cost.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-radar-only';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '.sf-radar-wrap{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-radar-only');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'hud-target-panel-hidden',
      note: 'Diagnostic only: hides only the target readout panel to isolate target DOM/compositor cost.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-target-panel';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '.sf-target{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-target-panel');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'hud-radar-effects-off',
      note: 'Diagnostic only: keeps the radar visible while stripping CSS shadows/filters/transitions from the right-dock radar layer.',
      apply: `(() => {
        const id = 'sf-perf-variant-radar-effects-off';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = [
          '.sf-radar-wrap,.sf-radar-wrap *, .sf-rightdock{',
          'text-shadow:none!important;',
          'box-shadow:none!important;',
          'filter:none!important;',
          'backdrop-filter:none!important;',
          '-webkit-backdrop-filter:none!important;',
          'animation:none!important;',
          'transition:none!important;',
          '}'
        ].join('');
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-radar-effects-off');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'hud-bottom-cluster-hidden',
      note: 'Diagnostic only: hides the bottom status/action layers to isolate text/stat compositor cost.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-bottom-cluster';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '.sf-bars,.sf-cluster,#action-bar,.sf-wpn-heats,.sf-cap-readout{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-bottom-cluster');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'hud-top-nav-hidden',
      note: 'Diagnostic only: hides mission/nav/objective overlays to isolate top-HUD text and arrows.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-top-nav';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '.sf-mission-tracker,.sf-objectives,.sf-nav-readout,.sf-objarrow{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-top-nav');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'hud-reticle-overlays-hidden',
      note: 'Diagnostic only: hides reticle/lock/damage/floating overlays to isolate per-frame HUD markers.',
      apply: `(() => {
        const id = 'sf-perf-variant-hide-reticle-overlays';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '#aim-reticle,.sf-lockring,.sf-lockdiamond,.sf-damage-indicator,.sf-floating-text{visibility:hidden!important;pointer-events:none!important;}';
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-hide-reticle-overlays');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'ui-effects-off-diagnostic',
      note: 'Diagnostic only: removes expensive HUD shadows/filters/animations to isolate compositor effects; not a visual-quality fix.',
      apply: `(() => {
        const id = 'sf-perf-variant-ui-effects-off';
        if (document.getElementById(id)) return { applied: true, reused: true };
        const style = document.createElement('style');
        style.id = id;
        style.textContent = [
          '#ui-root,#ui-root *,#hud,#hud *,#modal-backdrop,#vignette{',
          'text-shadow:none!important;',
          'box-shadow:none!important;',
          'filter:none!important;',
          'backdrop-filter:none!important;',
          '-webkit-backdrop-filter:none!important;',
          'animation:none!important;',
          'transition:none!important;',
          '}'
        ].join('');
        document.head.appendChild(style);
        return { applied: true };
      })()`,
      restore: `(() => {
        const style = document.getElementById('sf-perf-variant-ui-effects-off');
        if (style) style.remove();
        return { restored: true };
      })()`,
    },
    {
      name: 'webgl-submit-noop-diagnostic',
      note: 'Diagnostic only: skips WebGL render submissions to isolate scene update/sim from GPU present cost; not a visual-quality fix.',
      apply: `(() => {
        const renderer = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.renderer;
        if (!renderer) return { applied: false, reason: 'renderer_missing' };
        window.__SF_PERF_VARIANT_RESTORE__ = window.__SF_PERF_VARIANT_RESTORE__ || {};
        const saved = window.__SF_PERF_VARIANT_RESTORE__;
        if (!saved.webglSubmitNoop) {
          saved.webglSubmitNoop = {
            render: renderer.render,
            setRenderTarget: renderer.setRenderTarget,
            clear: renderer.clear,
          };
        }
        renderer.render = function () {};
        renderer.setRenderTarget = function () {};
        renderer.clear = function () {};
        return { applied: true };
      })()`,
      restore: `(() => {
        const renderer = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.renderer;
        const saved = window.__SF_PERF_VARIANT_RESTORE__ && window.__SF_PERF_VARIANT_RESTORE__.webglSubmitNoop;
        if (renderer && saved) {
          renderer.render = saved.render;
          renderer.setRenderTarget = saved.setRenderTarget;
          renderer.clear = saved.clear;
          renderer.setRenderTarget(null);
        }
        return { restored: true };
      })()`,
    },
    {
      name: 'sim-paused-render-only',
      note: 'Diagnostic only: pauses simulation so remaining frame time is render/GPU/UI/present work.',
      apply: `(() => {
        const sf = window.SF || null;
        const state = sf && sf.state;
        if (!state) return { applied: false };
        window.__SF_PERF_VARIANT_RESTORE__ = window.__SF_PERF_VARIANT_RESTORE__ || {};
        window.__SF_PERF_VARIANT_RESTORE__.timeScale = state.timeScale;
        state.timeScale = 0;
        return { applied: true, timeScale: state.timeScale };
      })()`,
      restore: `(() => {
        const state = window.SF && window.SF.state;
        const saved = window.__SF_PERF_VARIANT_RESTORE__ || {};
        if (state && saved.timeScale !== undefined) state.timeScale = saved.timeScale;
        return { restored: true, timeScale: state && state.timeScale };
      })()`,
    },
    {
      name: 'bloom-off-straight-render',
      note: 'Diagnostic only: disables the post bloom path to measure post-processing cost; not a quality-preserving fix.',
      apply: `(() => {
        const sf = window.SF || null;
        const state = sf && sf.state;
        const video = state && state.settings && state.settings.video;
        const bloom = state && state.render && state.render.bloom;
        if (!state || !video) return { applied: false };
        window.__SF_PERF_VARIANT_RESTORE__ = window.__SF_PERF_VARIANT_RESTORE__ || {};
        window.__SF_PERF_VARIANT_RESTORE__.bloom = video.bloom;
        video.bloom = false;
        if (bloom && typeof bloom.setOptions === 'function') bloom.setOptions({ bloom: false });
        return { applied: true, bloom: video.bloom };
      })()`,
      restore: `(() => {
        const state = window.SF && window.SF.state;
        const video = state && state.settings && state.settings.video;
        const bloom = state && state.render && state.render.bloom;
        const saved = window.__SF_PERF_VARIANT_RESTORE__ || {};
        if (video && saved.bloom !== undefined) video.bloom = saved.bloom;
        if (bloom && typeof bloom.setOptions === 'function') bloom.setOptions({ bloom: video ? video.bloom : true });
        return { restored: true, bloom: video && video.bloom };
      })()`,
    },
    {
      name: 'bloom-post-grade-off',
      note: 'Diagnostic only: keeps bloom enabled while stripping grain/vignette/color-grade from the composite shader.',
      apply: `(() => {
        const sf = window.SF || null;
        const state = sf && sf.state;
        const bloom = state && state.render && state.render.bloom;
        if (!bloom || typeof bloom.setOptions !== 'function') return { applied: false, reason: 'bloom_missing' };
        bloom.setOptions({ grain: 0, vignette: 0, grade: 0 });
        return { applied: true };
      })()`,
      restore: `(() => {
        const bloom = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.bloom;
        if (bloom && typeof bloom.setOptions === 'function') bloom.setOptions({ grain: 0.35, vignette: 0.85, grade: 0.55 });
        return { restored: true };
      })()`,
    },
    {
      name: 'bloom-grain-off',
      note: 'Diagnostic only: keeps bloom/grade/vignette enabled while stripping the animated grain sample.',
      apply: `(() => {
        const sf = window.SF || null;
        const state = sf && sf.state;
        const bloom = state && state.render && state.render.bloom;
        if (!bloom || typeof bloom.setOptions !== 'function') return { applied: false, reason: 'bloom_missing' };
        bloom.setOptions({ grain: 0 });
        return { applied: true };
      })()`,
      restore: `(() => {
        const bloom = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.bloom;
        if (bloom && typeof bloom.setOptions === 'function') bloom.setOptions({ grain: 0.35 });
        return { restored: true };
      })()`,
    },
    {
      name: 'render-graph-on-diagnostic',
      note: 'Diagnostic only: routes through the authored render graph to compare post pipelines; not a settings/default change.',
      apply: `(() => {
        const state = window.SF && window.SF.state;
        const video = state && state.settings && state.settings.video;
        if (!state || !video) return { applied: false };
        window.__SF_PERF_VARIANT_RESTORE__ = window.__SF_PERF_VARIANT_RESTORE__ || {};
        window.__SF_PERF_VARIANT_RESTORE__.renderGraph = video.renderGraph;
        video.renderGraph = true;
        return { applied: true, renderGraph: video.renderGraph };
      })()`,
      restore: `(() => {
        const state = window.SF && window.SF.state;
        const video = state && state.settings && state.settings.video;
        const saved = window.__SF_PERF_VARIANT_RESTORE__ || {};
        if (video && saved.renderGraph !== undefined) video.renderGraph = saved.renderGraph;
        return { restored: true, renderGraph: video && video.renderGraph };
      })()`,
    },
    {
      name: 'sim-paused-bloom-off',
      note: 'Diagnostic only: pauses simulation and skips bloom together to isolate base scene/render submission cost.',
      apply: `(() => {
        const sf = window.SF || null;
        const state = sf && sf.state;
        const video = state && state.settings && state.settings.video;
        if (!state || !video) return { applied: false };
        window.__SF_PERF_VARIANT_RESTORE__ = window.__SF_PERF_VARIANT_RESTORE__ || {};
        window.__SF_PERF_VARIANT_RESTORE__.timeScale = state.timeScale;
        window.__SF_PERF_VARIANT_RESTORE__.bloom = video.bloom;
        state.timeScale = 0;
        video.bloom = false;
        return { applied: true, timeScale: state.timeScale, bloom: video.bloom };
      })()`,
      restore: `(() => {
        const state = window.SF && window.SF.state;
        const video = state && state.settings && state.settings.video;
        const saved = window.__SF_PERF_VARIANT_RESTORE__ || {};
        if (state && saved.timeScale !== undefined) state.timeScale = saved.timeScale;
        if (video && saved.bloom !== undefined) video.bloom = saved.bloom;
        return { restored: true, timeScale: state && state.timeScale, bloom: video && video.bloom };
      })()`,
    },
  ];

  for (const definition of definitions) {
    const applied = await evalJson(cdp, definition.apply);
    await sleep(250);
    await resetRuntimeDiagnostics(cdp);
    const sampled = await sampleRuntime(cdp, DIAGNOSTIC_VARIANT_MS);
    const samples = sampled.samples.filter((sample) => sample.ready);
    const finalSample = samples[samples.length - 1] || {};
    variants.push({
      name: definition.name,
      note: definition.note,
      applied,
      sampleWindowMs: DIAGNOSTIC_VARIANT_MS,
      rafFrameMs: frameStats(sampled.raf.frames),
      diagnosticFrameMs: finalSample.frameMs || {},
      phases: phaseP95s(finalSample.perf),
      callback: callbackP95s(finalSample.perf),
      render: {
        calls: seriesStats(samples.map((sample) => sample.render && sample.render.calls)),
        triangles: seriesStats(samples.map((sample) => sample.render && sample.render.triangles)),
      },
      post: finalSample.post || null,
      perf: {
        loop: finalSample.perf && finalSample.perf.loop || null,
        topSystems: topSystemStats(finalSample.perf, 6),
      },
      sceneStats: sampled.sceneStats,
    });
    await evalJson(cdp, definition.restore);
    await sleep(250);
  }
  await resetRuntimeDiagnostics(cdp);
  return variants;
}

async function resetRuntimeDiagnostics(cdp) {
  const reset = await evalJson(cdp, `new Promise((resolve) => requestAnimationFrame(() => {
    const diag = window.__THREE_GAME_DIAGNOSTICS__;
    const perf = window.__SPACEFACE_PERF__;
    if (diag && typeof diag.reset === 'function') diag.reset();
    if (perf && typeof perf.reset === 'function') perf.reset();
    resolve({
      diagnostics: !!(diag && typeof diag.reset === 'function'),
      perfRuntime: !!(perf && typeof perf.reset === 'function'),
    });
  }))`);
  assert.ok(reset.diagnostics, 'renderer diagnostics reset must be available');
  assert.ok(reset.perfRuntime, 'perf runtime reset must be available');
  await sleep(300);
}

async function dismissOnboardingIntro(cdp) {
  await evalJson(cdp, `new Promise((resolve) => {
    const clickBegin = () => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((button) => /begin/i.test(button.textContent || ''));
      if (!btn) return false;
      btn.click();
      return true;
    };
    if (!clickBegin()) { resolve(false); return; }
    requestAnimationFrame(() => resolve(true));
  })`);
  await sleep(150);
}

async function waitForAuthoredAssetsSteady(cdp) {
  let last = null;
  for (let i = 0; i < 180; i++) {
    last = await evalJson(cdp, `(async () => {
      const sf = window.SF || null;
      const state = sf && sf.state || null;
      const scene = state && state.render && state.render.scene || null;
      let queue = { pending: 0, running: false };
      try {
        const partsLibrary = await import('./src/render/partsLibrary.js');
        if (partsLibrary && typeof partsLibrary.getAuthoredUpgradeQueueStats === 'function') {
          queue = partsLibrary.getAuthoredUpgradeQueueStats(scene);
        }
      } catch (_) {}
      const ships = state && Array.isArray(state.entityList)
        ? state.entityList.filter((entity) => entity && entity.type === 'ship' && entity.alive !== false && entity.mesh)
        : [];
      const states = {};
      for (const ship of ships) {
        const assetState = ship.mesh && ship.mesh.userData && ship.mesh.userData.authoredAssetState || 'unknown';
        states[assetState] = (states[assetState] || 0) + 1;
      }
      const authored = states.authored || 0;
      const loading = states.loading || 0;
      const nonAuthored = ships.length - authored;
      return {
        ready: ships.length >= 5 && nonAuthored === 0 && loading === 0 && queue.pending === 0 && queue.running === false,
        tick: state && state.tick || 0,
        shipCount: ships.length,
        authored,
        nonAuthored,
        states,
        queue,
      };
    })()`);
    if (last && last.ready) return last;
    await sleep(250);
  }
  throw new Error(`timeout waiting for authored assets to settle; last=${JSON.stringify(last)}`);
}

async function readQualityState(cdp) {
  return evalJson(cdp, `(() => {
    const sf = window.SF || null;
    const state = sf && sf.state || {};
    const canvas = document.getElementById('gl-canvas');
    let gpu = null;
    try {
      const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null;
    } catch (_) {}
    return {
      tick: state.tick || 0,
      mode: state.mode || null,
      settingsVideo: state.settings && state.settings.video ? {
        renderScale: state.settings.video.renderScale,
        pixelRatioCap: state.settings.video.pixelRatioCap,
        bloom: state.settings.video.bloom,
        bloomStrength: state.settings.video.bloomStrength,
        bloomThreshold: state.settings.video.bloomThreshold,
        shadows: state.settings.video.shadows,
        particleQuality: state.settings.video.particleQuality,
        fov: state.settings.video.fov,
        motionReduce: state.settings.video.motionReduce,
      } : null,
      browser: {
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
        gpu,
      },
    };
  })()`);
}

async function readChromeMetrics(cdp) {
  const result = await cdp.send('Performance.getMetrics');
  const metrics = {};
  for (const entry of result.metrics || []) {
    if ([
      'Timestamp',
      'Documents',
      'Frames',
      'JSEventListeners',
      'LayoutObjects',
      'Nodes',
      'Resources',
      'TaskDuration',
      'ScriptDuration',
      'LayoutDuration',
      'RecalcStyleDuration',
      'JSHeapUsedSize',
      'JSHeapTotalSize',
    ].includes(entry.name)) {
      metrics[entry.name] = entry.value;
    }
  }
  return metrics;
}

function evaluateBudgets({ rafFrameP95, diagnosticFrameP95, renderCallsPeak, heapGrowthMB, phaseP95, callbackP95, sceneStats, finalSample, diagnosticSamples, rafSamples }) {
  const budgets = [
    budget('sample.raf.count.min', rafSamples, '>=', 60, 'enough rAF samples for stable frame evidence'),
    budget('sample.runtime.count.min', diagnosticSamples, '>=', 20, 'enough diagnostics samples for stable phase/render evidence'),
    budget('raf.frame.p95.floor', rafFrameP95, '<=', FRAME_FLOOR_MS, '30fps floor from real requestAnimationFrame samples'),
    budget('diagnostics.frame.p95.floor', diagnosticFrameP95, '<=', FRAME_FLOOR_MS, 'renderer diagnostic p95 floor'),
    budget('frame.callback.p95', callbackP95.callback, '<=', FRAME_CALLBACK_BUDGET_MS,
      'total game JS requestAnimationFrame callback should fit inside the 60fps frame budget'),
    budget('frame.untracked.p95', callbackP95.untracked, '<=', FRAME_UNTRACKED_BUDGET_MS,
      'unattributed frame callback time should stay small; otherwise add more phase instrumentation'),
    budget('render.calls.peak', renderCallsPeak, '<=', DRAW_CALL_BUDGET, 'bounded draw submissions in crowded flight'),
    budget('phase.render.p95', phaseP95.render, '<=', RENDER_PHASE_BUDGET_MS, 'render phase p95'),
    budget('phase.sim.p95', phaseP95.sim, '<=', SIM_PHASE_BUDGET_MS, 'single fixed simulation step p95'),
    budget('phase.simFrame.p95', phaseP95.simFrame, '<=', SIM_FRAME_BUDGET_MS,
      'bounded total simulation catch-up work inside one rendered frame'),
    budget('phase.ui.p95', phaseP95.ui, '<=', UI_PHASE_BUDGET_MS, 'UI phase p95'),
    budget('loop.shedBacklogFrames.max', loopDiagnostic(finalSample, 'shedBacklogFrames'), '<=', LOOP_SHED_BACKLOG_FRAME_BUDGET,
      'fixed-step loop should not continuously discard simulation time during normal play'),
    budget('spatialHash.rebuildsPerSecond.max', spatialHashRate(finalSample, 'rebuilds'), '<=', SPATIAL_HASH_REBUILD_RATE_BUDGET,
      'static/full broadphase should not rebuild every tick when the cached static layer is valid'),
    budget('spatialHash.queriesPerSecond.max', spatialHashRate(finalSample, 'queries'), '<=', SPATIAL_HASH_QUERY_RATE_BUDGET,
      'AI, physics, and sensors should not spam broadphase radius queries'),
    budget('spatialHash.candidatesPerSecond.max', spatialHashRate(finalSample, 'candidates'), '<=', SPATIAL_HASH_CANDIDATE_RATE_BUDGET,
      'broadphase candidate visits should stay bounded by indexed/adaptive spatial filtering'),
    budget('heap.growth.mb', heapGrowthMB, '<=', HEAP_GROWTH_BUDGET_MB, 'bounded heap growth during sample window'),
    budget('content.entities.min', finalSample.counts.entities, '>=', 5, 'scene is populated enough to be meaningful'),
    budget('content.authoredShipFallbacks.max', nonAuthoredShipCount(sceneStats), '<=', 0,
      'live ship meshes should be authored assets, not procedural fallback boundaries'),
    budget('authored.pool.visibleChunks.max', sceneStats.authoredPools.visibleChunks, '<=', 150, 'authored pool chunk count should not explode'),
    budget('scene.visibleMeshes.max', sceneStats.visibleMeshes, '<=', VISIBLE_MESH_BUDGET,
      'visible mesh submissions should be batched/instanced instead of many tiny objects'),
    budget('scene.shipDynamicMeshes.max', visibleCategoryCount(sceneStats, 'ship'), '<=', SHIP_DYNAMIC_MESH_BUDGET,
      'authored ship static detail should be batched; only stateful pieces stay dynamic'),
    budget('scene.materialKeys.max', sceneStats.visibleMaterialKeyCount, '<=', MATERIAL_KEY_BUDGET,
      'visible material variants should be shared enough to avoid shader/draw churn'),
    budget('scene.shipCanopySurfaces.max', shipRoleCount(sceneStats, (role) => role.includes('canopy')), '<=', SHIP_CANOPY_SURFACE_BUDGET,
      'cockpit glass should not fragment into many per-ship transparent surfaces'),
    budget('scene.shipFanSurfaces.max', shipRoleCount(sceneStats, (role) => role.includes('drive:fan')), '<=', SHIP_FAN_SURFACE_BUDGET,
      'engine fan/drive surfaces should not be split into duplicate renderables'),
    budget('post.bloomFullFramePasses.max', postDiagnostic(finalSample, 'fullFramePasses'), '<=', BLOOM_FULL_FRAME_PASS_BUDGET,
      'bloom should keep full-frame passes bounded'),
    budget('post.bloomPasses.max', postDiagnostic(finalSample, 'bloomPasses'), '<=', BLOOM_PASS_BUDGET,
      'bloom down/up sample passes should stay bounded'),
    budget('post.legacyAnalyticGrain.max', legacyAnalyticGrainDiagnostic(finalSample), '<=', 0,
      'film grain should use the optimized quantized composite path, not the old per-refresh analytic grain hash'),
    budget('post.grainFps.max', postDiagnostic(finalSample, 'grainFps'), '<=', 15,
      'film grain should animate at a film-like cadence instead of changing every rendered frame'),
    budget('ui.hiddenBackdropActive.max', compositorDiagnostic(finalSample, 'hiddenBackdropActive'), '<=', 0,
      'closed modal backdrop should not remain as an active fullscreen blur/compositor layer during flight'),
    budget('ui.inactiveDockFadeDisplayed.max', compositorDiagnostic(finalSample, 'inactiveDockFadeDisplayed'), '<=', 0,
      'inactive docking fade overlay should be display:none outside dock/undock transitions'),
    budget('ui.deadVignetteShells.max', compositorDiagnostic(finalSample, 'deadVignetteShells'), '<=', 0,
      'legacy fullscreen vignette shell should not exist; live damage vignette is pooled under #hud'),
    budget('ui.inactiveFullscreenShellsDisplayed.max', compositorDiagnostic(finalSample, 'inactiveFullscreenShellsDisplayed'), '<=', 0,
      'inactive fullscreen transition shells should not stay displayed during normal flight'),
  ];
  budgets.push({
    name: 'raf.frame.p95.target',
    value: round(rafFrameP95),
    op: '<=',
    limit: FRAME_TARGET_MS,
    pass: Number.isFinite(rafFrameP95) && rafFrameP95 <= FRAME_TARGET_MS,
    severity: 'required',
    note: '60fps target from real requestAnimationFrame samples',
  });
  return budgets;
}

function budget(name, value, op, limit, note) {
  const finite = Number.isFinite(value);
  const pass = finite && (op === '<=' ? value <= limit : value >= limit);
  return {
    name,
    value: round(value),
    op,
    limit,
    pass,
    severity: 'required',
    note,
  };
}

function nonAuthoredShipCount(sceneStats) {
  const states = sceneStats && sceneStats.authoredShipStates || {};
  let count = 0;
  for (const [state, value] of Object.entries(states)) {
    if (state !== 'authored') count += Number(value) || 0;
  }
  return count;
}

function visibleCategoryCount(sceneStats, category) {
  const counts = sceneStats && sceneStats.visibleMeshByCategory || {};
  return Number(counts[category] || 0);
}

function shipRoleCount(sceneStats, predicate) {
  const counts = sceneStats && sceneStats.visibleShipMeshByRole || {};
  let total = 0;
  for (const [role, count] of Object.entries(counts)) {
    if (predicate(String(role))) total += Number(count) || 0;
  }
  return total;
}

function postDiagnostic(finalSample, key) {
  if (!finalSample || !finalSample.post) return NaN;
  const bloom = finalSample.post.bloom;
  if (!bloom) return 0;
  return Number(bloom[key]);
}

function legacyAnalyticGrainDiagnostic(finalSample) {
  if (!finalSample || !finalSample.post || !finalSample.post.bloom) return NaN;
  return finalSample.post.bloom.grainSource === 'analytic' ? 1 : 0;
}

function compositorDiagnostic(finalSample, key) {
  if (!finalSample || !finalSample.compositor) return NaN;
  return Number(finalSample.compositor[key]);
}

function loopDiagnostic(finalSample, key) {
  const loop = finalSample && finalSample.perf && finalSample.perf.loop;
  if (!loop) return NaN;
  return Number(loop[key]);
}

function spatialHashRate(finalSample, key) {
  const counter = finalSample && finalSample.perf && finalSample.perf.counters && finalSample.perf.counters.spatialHash;
  return spatialHashRateFromCounter(counter, key);
}

function spatialHashRateFromCounter(counter, key) {
  const value = counter && counter[key];
  if (!Number.isFinite(value)) return NaN;
  return value / Math.max(0.001, DURATION_MS / 1000);
}

function summarizeReport(scenarios) {
  const failedBudgets = [];
  for (const scenario of scenarios) {
    for (const budget of scenario.budgets || []) {
      if (budget.severity === 'required' && !budget.pass) {
        failedBudgets.push({ scenario: scenario.name, budget: budget.name, value: budget.value, limit: budget.limit });
      }
    }
    if (scenario.qualityAssertions && !scenario.qualityAssertions.pass) {
      failedBudgets.push({ scenario: scenario.name, budget: 'quality.settingsChanged', value: true, limit: false });
    }
  }
  return {
    pass: failedBudgets.length === 0,
    failedBudgets,
    scenarios: scenarios.map((scenario) => ({
      name: scenario.name,
      pass: scenario.pass,
      rafFrameP95: scenario.rafFrameMs.p95,
      diagnosticFrameP95: round(scenario.diagnosticFrameMs.p95),
      renderCallsPeak: scenario.render.calls.max,
      trianglesPeak: scenario.render.triangles.max,
      heapGrowthMB: scenario.memory.heapGrowthMB,
      callback: scenario.callback || null,
      loop: scenario.perf && scenario.perf.loop,
      broadphase: scenario.perf && scenario.perf.counters && scenario.perf.counters.spatialHash ? {
        ...scenario.perf.counters.spatialHash,
        rebuildsPerSecond: round(spatialHashRateFromCounter(scenario.perf.counters.spatialHash, 'rebuilds')),
        dynamicRebuildsPerSecond: round(spatialHashRateFromCounter(scenario.perf.counters.spatialHash, 'dynamicRebuilds')),
        queriesPerSecond: round(spatialHashRateFromCounter(scenario.perf.counters.spatialHash, 'queries')),
        candidatesPerSecond: round(spatialHashRateFromCounter(scenario.perf.counters.spatialHash, 'candidates')),
      } : null,
      authoredPools: {
        visibleChunks: scenario.authoredPoolUtilization.visibleChunks,
        visibleInstances: scenario.authoredPoolUtilization.visibleInstances,
        averageVisibleInstancesPerVisibleChunk: round(scenario.authoredPoolUtilization.averageVisibleInstancesPerVisibleChunk),
        lowOccupancyVisibleChunks: scenario.authoredPoolUtilization.lowOccupancyVisibleChunks,
      },
      authoredStaticBatches: scenario.sceneStats && scenario.sceneStats.authoredStaticBatches,
      sceneStructure: {
        visibleMeshes: scenario.sceneStats && scenario.sceneStats.visibleMeshes,
        shipDynamicMeshes: visibleCategoryCount(scenario.sceneStats, 'ship'),
        materialKeys: scenario.sceneStats && scenario.sceneStats.visibleMaterialKeyCount,
        shipCanopySurfaces: shipRoleCount(scenario.sceneStats, (role) => role.includes('canopy')),
        shipFanSurfaces: shipRoleCount(scenario.sceneStats, (role) => role.includes('drive:fan')),
        shipMeshByRole: scenario.sceneStats && scenario.sceneStats.visibleShipMeshByRole,
        shipMeshByPart: scenario.sceneStats && scenario.sceneStats.visibleShipMeshByPart,
        shipMeshByRoleAndPart: scenario.sceneStats && scenario.sceneStats.visibleShipMeshByRoleAndPart,
        topMaterialKeys: scenario.sceneStats && scenario.sceneStats.visibleMaterialKeys
          ? scenario.sceneStats.visibleMaterialKeys.slice(0, 12)
          : [],
        topMaterialKeysByCategory: scenario.sceneStats && scenario.sceneStats.visibleMaterialKeysByCategory
          ? scenario.sceneStats.visibleMaterialKeysByCategory.slice(0, 12)
          : [],
        topShipMaterialKeys: scenario.sceneStats && scenario.sceneStats.visibleShipMaterialKeys
          ? scenario.sceneStats.visibleShipMaterialKeys.slice(0, 16)
          : [],
      },
      bottleneck: scenario.bottleneck || null,
    })),
  };
}

function classifyBottleneck({ rafFrameP95, diagnosticFrameP95, phaseP95, callbackP95, sceneStats, renderCallsPeak, finalSample, diagnosticVariants }) {
  const variants = new Map((diagnosticVariants || []).map((variant) => [variant.name, variant]));
  const hudHidden = variants.get('hud-hidden-compositor-isolation');
  const hudLayerHidden = variants.get('hud-flight-layer-hidden');
  const rootNonHudHidden = variants.get('root-nonhud-overlays-hidden');
  const controlHintsHidden = variants.get('control-hints-hidden');
  const controlHintsEffectsOff = variants.get('control-hints-effects-off');
  const dockFadeHidden = variants.get('dock-fade-overlay-hidden');
  const inactiveShellsHidden = variants.get('inactive-fullscreen-shells-hidden');
  const hudRadarHidden = variants.get('hud-radar-target-hidden');
  const hudRadarOnlyHidden = variants.get('hud-radar-only-hidden');
  const hudTargetPanelHidden = variants.get('hud-target-panel-hidden');
  const hudRadarEffectsOff = variants.get('hud-radar-effects-off');
  const hudBottomHidden = variants.get('hud-bottom-cluster-hidden');
  const hudTopHidden = variants.get('hud-top-nav-hidden');
  const hudReticleHidden = variants.get('hud-reticle-overlays-hidden');
  const noop = variants.get('webgl-submit-noop-diagnostic');
  const simPaused = variants.get('sim-paused-render-only');
  const uiEffectsOff = variants.get('ui-effects-off-diagnostic');
  const bloomOff = variants.get('bloom-off-straight-render');
  const bloomPostGradeOff = variants.get('bloom-post-grade-off');
  const bloomGrainOff = variants.get('bloom-grain-off');
  const renderGraphOn = variants.get('render-graph-on-diagnostic');
  const simPausedBloomOff = variants.get('sim-paused-bloom-off');
  const evidence = [
    diagnosisMetric('baseline.raf.p95', rafFrameP95, 'real browser requestAnimationFrame p95'),
    diagnosisMetric('baseline.diagnostics.p95', diagnosticFrameP95, 'renderer diagnostics p95'),
    diagnosisMetric('frame.callback.p95', callbackP95 && callbackP95.callback, 'total game JS requestAnimationFrame callback p95'),
    diagnosisMetric('frame.untracked.p95', callbackP95 && callbackP95.untracked, 'callback time not accounted for by sim/render/vfx/feel/ui phases'),
    diagnosisMetric('phase.simFrame.p95', phaseP95 && phaseP95.simFrame, 'total sim work inside one rendered frame'),
    diagnosisMetric('phase.render.p95', phaseP95 && phaseP95.render, 'JavaScript render phase p95'),
    diagnosisMetric('phase.ui.p95', phaseP95 && phaseP95.ui, 'JavaScript UI phase p95'),
    diagnosisMetric('loop.shedBacklogFrames', loopDiagnostic(finalSample, 'shedBacklogFrames'), 'render frames that discarded fixed-step sim backlog'),
    diagnosisMetric('render.calls.peak', renderCallsPeak, 'draw calls submitted by the scene'),
    diagnosisMetric('scene.materialKeys', sceneStats && sceneStats.visibleMaterialKeyCount, 'visible material variant count'),
    variantMetric(hudHidden, 'hud-hidden.raf.p95', 'rAF p95 when the DOM HUD shell is hidden diagnostically'),
    variantMetric(hudLayerHidden, 'hud-layer-hidden.raf.p95', 'rAF p95 when only the flight HUD layer is hidden diagnostically'),
    variantMetric(rootNonHudHidden, 'root-nonhud-overlays-hidden.raf.p95', 'rAF p95 when non-HUD root overlays are hidden diagnostically'),
    variantMetric(controlHintsHidden, 'control-hints-hidden.raf.p95', 'rAF p95 when the control hint overlay is hidden diagnostically'),
    variantMetric(controlHintsEffectsOff, 'control-hints-effects-off.raf.p95', 'rAF p95 when only control hint blur/shadow/transitions are stripped diagnostically'),
    variantMetric(dockFadeHidden, 'dock-fade-overlay-hidden.raf.p95', 'rAF p95 when the docking fade overlay is hidden diagnostically'),
    variantMetric(inactiveShellsHidden, 'inactive-fullscreen-shells-hidden.raf.p95', 'rAF p95 when inactive fullscreen shells are hidden diagnostically'),
    variantMetric(hudRadarHidden, 'hud-radar-target-hidden.raf.p95', 'rAF p95 when radar and target HUD are hidden diagnostically'),
    variantMetric(hudRadarOnlyHidden, 'hud-radar-only-hidden.raf.p95', 'rAF p95 when only the radar canvas/legend wrapper is hidden diagnostically'),
    variantMetric(hudTargetPanelHidden, 'hud-target-panel-hidden.raf.p95', 'rAF p95 when only the target readout panel is hidden diagnostically'),
    variantMetric(hudRadarEffectsOff, 'hud-radar-effects-off.raf.p95', 'rAF p95 when radar CSS shadows/filters/transitions are stripped diagnostically'),
    variantMetric(hudBottomHidden, 'hud-bottom-cluster-hidden.raf.p95', 'rAF p95 when bottom status/action HUD is hidden diagnostically'),
    variantMetric(hudTopHidden, 'hud-top-nav-hidden.raf.p95', 'rAF p95 when top mission/nav HUD is hidden diagnostically'),
    variantMetric(hudReticleHidden, 'hud-reticle-overlays-hidden.raf.p95', 'rAF p95 when reticle/combat marker HUD is hidden diagnostically'),
    variantMetric(noop, 'webgl-submit-noop.raf.p95', 'rAF p95 when WebGL submissions are skipped'),
    variantMetric(simPaused, 'sim-paused.raf.p95', 'rAF p95 when simulation is paused'),
    variantMetric(uiEffectsOff, 'ui-effects-off.raf.p95', 'rAF p95 when CSS shadows/filters/animations are stripped diagnostically'),
    variantMetric(bloomOff, 'bloom-off.raf.p95', 'rAF p95 when bloom is stripped diagnostically'),
    variantMetric(bloomPostGradeOff, 'bloom-post-grade-off.raf.p95', 'rAF p95 when bloom remains enabled but grade/vignette/grain are stripped diagnostically'),
    variantMetric(bloomGrainOff, 'bloom-grain-off.raf.p95', 'rAF p95 when bloom remains enabled but grain is stripped diagnostically'),
    variantMetric(renderGraphOn, 'render-graph-on.raf.p95', 'rAF p95 when the authored render graph is enabled diagnostically'),
    variantMetric(simPausedBloomOff, 'sim-paused-bloom-off.raf.p95', 'rAF p95 when simulation is paused and bloom is stripped diagnostically'),
  ].filter(Boolean);

  const labels = [];
  const ruledOut = [];
  const nextContracts = [];
  const hudHiddenP95 = variantFrameP95(hudHidden);
  const hudLayerHiddenP95 = variantFrameP95(hudLayerHidden);
  const rootNonHudHiddenP95 = variantFrameP95(rootNonHudHidden);
  const controlHintsHiddenP95 = variantFrameP95(controlHintsHidden);
  const controlHintsEffectsOffP95 = variantFrameP95(controlHintsEffectsOff);
  const dockFadeHiddenP95 = variantFrameP95(dockFadeHidden);
  const inactiveShellsHiddenP95 = variantFrameP95(inactiveShellsHidden);
  const hudRadarHiddenP95 = variantFrameP95(hudRadarHidden);
  const hudRadarOnlyHiddenP95 = variantFrameP95(hudRadarOnlyHidden);
  const hudTargetPanelHiddenP95 = variantFrameP95(hudTargetPanelHidden);
  const hudRadarEffectsOffP95 = variantFrameP95(hudRadarEffectsOff);
  const hudBottomHiddenP95 = variantFrameP95(hudBottomHidden);
  const hudTopHiddenP95 = variantFrameP95(hudTopHidden);
  const hudReticleHiddenP95 = variantFrameP95(hudReticleHidden);
  const noopP95 = variantFrameP95(noop);
  const simPausedP95 = variantFrameP95(simPaused);
  const uiEffectsOffP95 = variantFrameP95(uiEffectsOff);
  const bloomOffP95 = variantFrameP95(bloomOff);
  const bloomPostGradeOffP95 = variantFrameP95(bloomPostGradeOff);
  const bloomGrainOffP95 = variantFrameP95(bloomGrainOff);
  const renderGraphOnP95 = variantFrameP95(renderGraphOn);
  const simPausedBloomOffP95 = variantFrameP95(simPausedBloomOff);
  const materialKeys = sceneStats && sceneStats.visibleMaterialKeyCount;
  const shedBacklogFrames = loopDiagnostic(finalSample, 'shedBacklogFrames');
  const callbackFrameP95 = callbackP95 && callbackP95.callback;
  const callbackUntrackedP95 = callbackP95 && callbackP95.untracked;

  if (Number.isFinite(phaseP95 && phaseP95.simFrame) && phaseP95.simFrame <= SIM_FRAME_BUDGET_MS) {
    ruledOut.push('simulation-frame-budget');
  }
  if (Number.isFinite(phaseP95 && phaseP95.ui) && phaseP95.ui <= UI_PHASE_BUDGET_MS) {
    ruledOut.push('ui-javascript-budget');
  }
  if (Number.isFinite(renderCallsPeak) && renderCallsPeak <= DRAW_CALL_BUDGET) {
    ruledOut.push('raw-draw-call-count-budget');
  }
  if (Number.isFinite(callbackFrameP95) && callbackFrameP95 <= FRAME_CALLBACK_BUDGET_MS) {
    ruledOut.push('game-js-callback-budget');
  }

  if (
    Number.isFinite(rafFrameP95)
    && Number.isFinite(noopP95)
    && rafFrameP95 > FRAME_TARGET_MS
    && noopP95 <= FRAME_TARGET_MS + 1
    && (rafFrameP95 - noopP95) >= 10
  ) {
    labels.push('render-submit-present');
    nextContracts.push('Keep authored visuals enabled, but reduce GPU submit/present pressure: shared materials, fewer shader/material variants, cheaper transparent/fullscreen compositing.');
  }
  if (
    Number.isFinite(simPausedP95)
    && Number.isFinite(rafFrameP95)
    && simPausedP95 > FRAME_FLOOR_MS
    && Number.isFinite(phaseP95 && phaseP95.simFrame)
    && phaseP95.simFrame <= SIM_FRAME_BUDGET_MS
  ) {
    ruledOut.push('simulation-as-primary-cause');
  }
  if (Number.isFinite(shedBacklogFrames) && shedBacklogFrames > LOOP_SHED_BACKLOG_FRAME_BUDGET) {
    labels.push('loop-backlog-shedding');
    nextContracts.push('Use bounded fixed-step catch-up so normal 30fps presentation does not silently discard simulation time.');
  }
  if (Number.isFinite(callbackFrameP95) && callbackFrameP95 > FRAME_CALLBACK_BUDGET_MS) {
    labels.push('game-js-frame-callback');
    nextContracts.push('Split the frame callback further and remove the largest JS-side per-frame owner before chasing renderer or asset changes.');
  }
  if (Number.isFinite(callbackUntrackedP95) && callbackUntrackedP95 > FRAME_UNTRACKED_BUDGET_MS) {
    labels.push('untracked-frame-callback-work');
    nextContracts.push('Add a named phase counter around the remaining frame callback work before optimizing blind.');
  }
  if (Number.isFinite(materialKeys) && materialKeys > MATERIAL_KEY_BUDGET) {
    labels.push('material-fragmentation');
    nextContracts.push(`Reduce visible material variants to <= ${MATERIAL_KEY_BUDGET} by canonical material roles and asset/export material sharing, not by dropping authored meshes.`);
  }
  if (
    Number.isFinite(uiEffectsOffP95)
    && Number.isFinite(rafFrameP95)
    && rafFrameP95 > FRAME_FLOOR_MS
    && uiEffectsOffP95 <= FRAME_FLOOR_MS
  ) {
    labels.push('ui-compositor-effects-secondary');
    nextContracts.push('Preserve HUD styling while bounding compositor cost with containment, explicit transitions, and fewer full-viewport filter/shadow invalidations.');
  }
  const rootOverlayP95s = [
    rootNonHudHiddenP95,
    controlHintsHiddenP95,
    controlHintsEffectsOffP95,
    dockFadeHiddenP95,
    inactiveShellsHiddenP95,
  ].filter(Number.isFinite);
  if (
    rootOverlayP95s.length
    && Number.isFinite(rafFrameP95)
    && rafFrameP95 > FRAME_FLOOR_MS
    && Math.min(...rootOverlayP95s) <= FRAME_FLOOR_MS
  ) {
    labels.push('ui-root-overlay-compositor-secondary');
    nextContracts.push('Keep root overlays wired, but do not leave faded fullscreen/blur layers composited during flight; hide or unmount them after transitions and update hint visibility only on state changes.');
  }
  if (
    (Number.isFinite(hudHiddenP95) || Number.isFinite(hudLayerHiddenP95))
    && Number.isFinite(rafFrameP95)
    && rafFrameP95 > FRAME_FLOOR_MS
    && Math.min(
      Number.isFinite(hudHiddenP95) ? hudHiddenP95 : Infinity,
      Number.isFinite(hudLayerHiddenP95) ? hudLayerHiddenP95 : Infinity,
    ) <= FRAME_FLOOR_MS
    && !labels.includes('ui-compositor-effects-secondary')
  ) {
    labels.push('ui-layer-compositor-secondary');
    nextContracts.push('Keep the HUD visible, but make its flight shell cheaper to composite: no hidden fullscreen filters, bounded layers, and value-change-only DOM updates.');
  }
  const hudRegionP95s = [
    hudRadarHiddenP95,
    hudRadarOnlyHiddenP95,
    hudTargetPanelHiddenP95,
    hudRadarEffectsOffP95,
    hudBottomHiddenP95,
    hudTopHiddenP95,
    hudReticleHiddenP95,
  ].filter(Number.isFinite);
  if (
    hudRegionP95s.length
    && Number.isFinite(rafFrameP95)
    && rafFrameP95 > FRAME_FLOOR_MS
    && Math.min(...hudRegionP95s) <= FRAME_FLOOR_MS
    && !labels.includes('ui-layer-compositor-secondary')
  ) {
    labels.push('ui-region-compositor-secondary');
    nextContracts.push('Use the HUD region isolation diagnostics to simplify the specific expensive overlay while preserving the player-facing HUD.');
  }
  if (
    ((Number.isFinite(bloomOffP95) && bloomOffP95 <= FRAME_FLOOR_MS)
      || (Number.isFinite(simPausedP95) && Number.isFinite(simPausedBloomOffP95) && (simPausedP95 - simPausedBloomOffP95) >= 10))
    && Number.isFinite(rafFrameP95)
    && rafFrameP95 > FRAME_FLOOR_MS
  ) {
    labels.push('post-processing-secondary');
    nextContracts.push('Optimize the bloom/render-target graph structurally; do not make bloom-off the player-facing fix.');
  }
  if (
    Number.isFinite(bloomPostGradeOffP95)
    && Number.isFinite(rafFrameP95)
    && rafFrameP95 > FRAME_FLOOR_MS
    && bloomPostGradeOffP95 <= FRAME_FLOOR_MS
  ) {
    labels.push('post-composite-shader-secondary');
    nextContracts.push('Keep the cinematic grade reachable, but simplify the full-screen composite shader or move expensive grain/grade work into a cheaper lookup path.');
  }
  if (
    Number.isFinite(renderGraphOnP95)
    && Number.isFinite(rafFrameP95)
    && renderGraphOnP95 < rafFrameP95 - 5
  ) {
    labels.push('render-graph-candidate');
    nextContracts.push('If the render graph wins consistently, promote one maintained post path instead of shipping parallel bloom/renderGraph implementations with different defaults.');
  }

  if (!labels.length && Number.isFinite(rafFrameP95) && rafFrameP95 > FRAME_FLOOR_MS) {
    labels.push('unclassified-frame-pacing');
    nextContracts.push('Add one diagnostic variant at a time until the failing frame bucket is isolated.');
  }

  return {
    primary: labels[0] || 'within-budget',
    labels,
    confidence: labels.includes('render-submit-present') ? 'high' : (labels.length ? 'medium' : 'low'),
    ruledOut,
    nextContracts,
    evidence,
  };
}

function diagnosisMetric(metric, value, note) {
  return Number.isFinite(value) ? { metric, value: round(value), note } : null;
}

function variantMetric(variant, metric, note) {
  return diagnosisMetric(metric, variantFrameP95(variant), note);
}

function variantFrameP95(variant) {
  const frame = variant && variant.rafFrameMs;
  if (!frame || !(Number(frame.samples) >= DIAGNOSTIC_MIN_RAF_SAMPLES)) return NaN;
  return frame.p95;
}

function frameStats(frames) {
  const values = frames.filter((value) => Number.isFinite(value) && value >= 0);
  return {
    samples: values.length,
    avg: round(avg(values)),
    min: round(values.length ? Math.min(...values) : NaN),
    max: round(values.length ? Math.max(...values) : NaN),
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    p99: round(percentile(values, 0.99)),
    over16_7: values.filter((value) => value > 16.7).length,
    over34_3: values.filter((value) => value > 34.3).length,
    over50: values.filter((value) => value > 50).length,
  };
}

function seriesStats(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  return {
    samples: nums.length,
    avg: round(avg(nums)),
    min: round(nums.length ? Math.min(...nums) : NaN),
    max: round(nums.length ? Math.max(...nums) : NaN),
    p95: round(percentile(nums, 0.95)),
  };
}

function phaseP95s(perf) {
  const phases = perf && perf.phases || {};
  return {
    sim: round(phases.sim && phases.sim.p95),
    simFrame: round(phases.simFrame && phases.simFrame.p95),
    render: round(phases.render && phases.render.p95),
    vfx: round(phases.vfx && phases.vfx.p95),
    feel: round(phases.feel && phases.feel.p95),
    ui: round(phases.ui && phases.ui.p95),
  };
}

function callbackP95s(perf) {
  return {
    callback: round(perf && perf.frameCallback && perf.frameCallback.p95),
    untracked: round(perf && perf.frameUntracked && perf.frameUntracked.p95),
  };
}

function topSystemStats(perf, limit = 12) {
  const systems = perf && perf.systems || {};
  return Object.entries(systems)
    .map(([name, stat]) => ({
      name,
      p95: round(stat && stat.p95),
      avg: round(stat && stat.avg),
      max: round(stat && stat.max),
      samples: stat && stat.samples || 0,
    }))
    .filter((entry) => Number.isFinite(entry.p95) || Number.isFinite(entry.max))
    .sort((a, b) => (b.p95 - a.p95) || (b.max - a.max))
    .slice(0, limit);
}

function detectExternalPerfEnvironment() {
  const releaseLockDir = join(ROOT, 'assets/ships/release.__lock');
  const releaseBuildingDir = join(ROOT, 'assets/ships/release.__building');
  const lockOwnerPath = join(releaseLockDir, 'owner.json');
  const lockOwner = readJsonIfExists(lockOwnerPath);
  const releaseBuilding = statIfExists(releaseBuildingDir);
  const processHints = detectAssetProcessHints();
  const lockOwnerRunning = !!(lockOwner && Number.isInteger(lockOwner.pid) && lockOwner.pid > 0 && isProcessRunning(lockOwner.pid));
  const releaseBuildingFresh = !!(releaseBuilding && Date.now() - releaseBuilding.mtimeMs < 120000);
  const activeAssetPipeline = !!(lockOwnerRunning || releaseBuildingFresh || processHints.length);
  const notes = [];
  if (lockOwnerRunning) notes.push('assets/ships/release.__lock/owner.json is present and owner pid is running');
  else if (lockOwner) notes.push('assets/ships/release.__lock/owner.json is stale; owner pid is not running');
  if (releaseBuildingFresh) notes.push('assets/ships/release.__building was modified recently');
  else if (releaseBuilding) notes.push('assets/ships/release.__building is present but not recently modified');
  if (processHints.length) notes.push('Blender/export process hints are present');
  return {
    activeAssetPipeline,
    releaseLock: lockOwner ? {
      owner: lockOwner,
      ownerRunning: lockOwnerRunning,
      path: 'assets/ships/release.__lock/owner.json',
    } : null,
    releaseBuilding: releaseBuilding ? {
      path: 'assets/ships/release.__building',
      mtimeMs: releaseBuilding.mtimeMs,
      fresh: releaseBuildingFresh,
    } : null,
    processHints,
    notes,
  };
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return { unreadable: true, error: String(err && err.message || err) };
  }
}

function statIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    const stat = statSync(path);
    return { mtimeMs: stat.mtimeMs };
  } catch (_) {
    return null;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

function detectAssetProcessHints() {
  if (process.platform !== 'win32') return [];
  const result = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 || !result.stdout) return [];
  const interesting = new Set(['blender.exe', 'blender-mcp.exe']);
  const out = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = parseCsvLine(line);
    const image = String(row[0] || '').toLowerCase();
    if (!interesting.has(image)) continue;
    out.push({
      imageName: row[0],
      pid: Number(row[1]) || row[1],
      sessionName: row[2] || null,
      memoryUsage: row[4] || null,
    });
  }
  return out;
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function heapGrowthFrom(heapSamples, chromeStart, chromeEnd) {
  if (heapSamples.length >= 5) {
    const values = heapSamples
      .map((sample) => sample && sample.usedJSHeapSize)
      .filter((value) => Number.isFinite(value));
    const windowSize = Math.max(3, Math.ceil(values.length * 0.2));
    const first = median(values.slice(0, windowSize));
    const last = median(values.slice(-windowSize));
    if (Number.isFinite(first) && Number.isFinite(last)) return round((last - first) / 1048576);
  } else if (heapSamples.length >= 2) {
    const first = heapSamples[0].usedJSHeapSize;
    const last = heapSamples[heapSamples.length - 1].usedJSHeapSize;
    if (Number.isFinite(first) && Number.isFinite(last)) return round((last - first) / 1048576);
  }
  const first = chromeStart && chromeStart.JSHeapUsedSize;
  const last = chromeEnd && chromeEnd.JSHeapUsedSize;
  if (Number.isFinite(first) && Number.isFinite(last)) return round((last - first) / 1048576);
  return null;
}

function median(values) {
  return percentile(values, 0.5);
}

async function captureScreenshot(cdp, file) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  mkdirSync(dirname(file), { recursive: true });
  const buffer = Buffer.from(shot.data, 'base64');
  writeFileSync(file, buffer);
  return {
    path: file,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

function collectPageIssues(cdp) {
  const issues = [];
  const warnings = [];
  cdp.onMessage((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const text = msg.params && msg.params.exceptionDetails
        ? (msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text || 'exception')
        : 'exception';
      issues.push({ type: 'pageerror', text });
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((arg) => arg.value || arg.description || '').join(' ');
      if (msg.params.type === 'error') {
        const issue = { type: 'error', text };
        if (!isIgnorablePageIssue(issue)) issues.push(issue);
      } else if (msg.params.type === 'warning') {
        warnings.push({ type: 'warning', text });
      }
    } else if (msg.method === 'Log.entryAdded' && msg.params && msg.params.entry) {
      const entry = msg.params.entry;
      const item = { type: entry.level || 'log', text: entry.text || '' };
      if (entry.level === 'error') {
        if (!isIgnorablePageIssue(item)) issues.push(item);
      } else if (entry.level === 'warning') {
        warnings.push(item);
      }
    }
  });
  return {
    errorIssues() { return issues.slice(0, 12); },
    warningIssues() { return warnings.slice(0, 16); },
  };
}

function isIgnorablePageIssue(issue) {
  const text = String(issue && issue.text || '').trim();
  return /^(?:THREE\.)+WebGLProgram: Shader Error (?:0|1282) - VALIDATE_STATUS false/.test(text)
    && /Program Info Log:\s*$/.test(text);
}

function isBootReady(cdp) {
  return evalJson(cdp, `(() => ({
    ready: !!(window.SF && window.SF.state && window.SF.bus && window.SF.bus.emit && window.SF.state.render && window.SF.state.render.renderer),
    hasSF: !!window.SF,
    mode: window.SF && window.SF.state && window.SF.state.mode || null,
    tick: window.SF && window.SF.state && window.SF.state.tick || 0,
  }))()`);
}

function isPlayable(cdp) {
  return evalJson(cdp, `(() => {
    const sf = window.SF || null;
    const state = sf && sf.state || null;
    const player = state && state.entities && state.entities.get(state.playerId);
    const ships = state && Array.isArray(state.entityList)
      ? state.entityList.filter((entity) => entity && entity.type === 'ship' && entity.alive !== false)
      : [];
    const assetStates = {};
    for (const ship of ships) {
      const assetState = ship.mesh && ship.mesh.userData && ship.mesh.userData.authoredAssetState || (ship.mesh ? 'unknown' : 'missingMesh');
      assetStates[assetState] = (assetStates[assetState] || 0) + 1;
    }
    return {
      ready: !!(state && state.mode === 'flight' && player && player.alive !== false && player.mesh),
      tick: state && state.tick || 0,
      mode: state && state.mode || null,
      playerId: state && state.playerId || null,
      playerAlive: !!(player && player.alive !== false),
      playerHasMesh: !!(player && player.mesh),
      shipCount: ships.length,
      assetStates,
      screenStack: state && state.ui && Array.isArray(state.ui.screenStack) ? state.ui.screenStack.slice() : [],
    };
  })()`);
}

function getTick(cdp, minimum) {
  return evalJson(cdp, `(() => ({ tick: window.SF && window.SF.state ? window.SF.state.tick : 0 }))()`)
    .then((value) => ({ ready: value.tick >= minimum, tick: value.tick, minimum }));
}

async function waitFor(cdp, predicate, timeoutMs, label) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await predicate(cdp);
    if (last && !(typeof last === 'object' && last.ready === false)) return last;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${label}; last=${JSON.stringify(last)}`);
}

async function evalVoid(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(describeException(result.exceptionDetails));
}

async function evalJson(cdp, expression) {
  const wrapped = `Promise.resolve(${expression}).then((value) => JSON.stringify(value))`;
  const result = await cdp.send('Runtime.evaluate', {
    expression: wrapped,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(describeException(result.exceptionDetails));
  return JSON.parse(result.result && result.result.value || '{}');
}

function describeException(details) {
  return details && (details.exception && details.exception.description || details.text) || 'Runtime.evaluate failed';
}

async function startFreshServer() {
  const port = await findFreePort(8621);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-5000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await sleep(250);
  }
  child.kill();
  throw new Error(`Dev server did not become reachable at ${url}`);
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}

async function findFreePort(start) {
  for (let port = start; port < start + 200; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free local port found starting at ${start}`);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

function spawnChrome(debugPort) {
  const chromePath = findChrome();
  chromeProfileDir = mkdtempSync(join(tmpdir(), 'spaceface-perf-chrome-'));
  return spawn(chromePath, [
    HEADED ? null : '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${chromeProfileDir}`,
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--hide-scrollbars',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--remote-debugging-port=${debugPort}`,
    ...EXTRA_BROWSER_ARGS,
    'about:blank',
  ].filter(Boolean), {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: !HEADED,
  });
}

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Chrome or Edge executable not found for performance profile');
  return found;
}

async function connectCdp(debugPort) {
  let wsUrl = null;
  for (let i = 0; i < 80; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const page = tabs.find((tab) => tab.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch (_) {}
    await sleep(150);
  }
  assert.ok(wsUrl, 'no Chrome DevTools Protocol page target found');
  assert.ok(globalThis.WebSocket, 'global WebSocket is required for CDP probes');

  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
    for (const listener of listeners) listener(msg);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result || {});
    }
  });

  return {
    ws: socket,
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

function withDebugFlight(url) {
  const u = new URL(url);
  u.searchParams.set('debug', 'flight');
  return String(u);
}

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function percentile(values, p) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return NaN;
  const idx = Math.min(nums.length - 1, Math.floor(p * (nums.length - 1)));
  return nums[idx];
}

function avg(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : NaN;
}

function round(value) {
  if (!Number.isFinite(value)) return value == null ? null : value;
  return Number(value.toFixed(2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
