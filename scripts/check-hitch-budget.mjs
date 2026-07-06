#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = parseArgs(process.argv.slice(2));
const WIDTH = Number(argv.width || 1280);
const HEIGHT = Number(argv.height || 800);
const SEED = Number(argv.seed || 47) >>> 0;
const WARMUP_MS = Number(argv.warmup || 5000);
const DURATION_MS = Number(argv.duration || 60000);
const FRAME_BUDGET_MS = Number(argv.frameBudgetMs || argv['frame-budget-ms'] || 32);
const OUT = argv.out || '.devshots/perf/hitch-budget.json';
const HEADED = !!(argv.headed || argv.headful || argv.headless === 'false');
// Diagnostic bisect: disable the dynamic-resolution controller for the run, to separate hitches it
// causes (render-target reallocation on every scale change) from hitches it merely reacts to.
const NO_DYNRES = !!(argv.noDynres || argv['no-dynres']);
// Diagnostic bisect: freeze the deep-field background (hide + stop updates) to separate its
// bake/rebuild costs from the rest of the frame.
const NO_BG = !!(argv.noBg || argv['no-bg']);
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await launchProbeBrowser();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(withDebugFlight(server.baseUrl), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.state.render && window.SF.state.render.renderer, null, { timeout: 90000 });
  await page.waitForFunction(() => {
    const overlay = document.getElementById('boot-overlay');
    return !overlay || overlay.classList.contains('hidden') || getComputedStyle(overlay).visibility === 'hidden';
  }, null, { timeout: 90000 });
  await page.evaluate((seed) => {
    window.SF.bus.emit('game:new', { name: 'Hitch Budget', seed });
    window.SF.bus.emit('ui:closeAll', {});
  }, SEED);
  if (NO_DYNRES) {
    await page.evaluate(() => {
      window.SF.state.settings.video.dynamicResolution = false;
      window.SF.bus.emit('settings:changed', { section: 'video', key: 'dynamicResolution' });
    });
  }
  if (NO_BG) {
    await page.evaluate(() => {
      const bg = window.SF.state.render.spaceBg;
      if (bg) {
        if (bg.group) bg.group.visible = false;
        bg.update = () => {};
        bg.onResize = () => {};
      }
    });
  }
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.mesh);
  }, null, { timeout: 90000 });
  await dismissOnboarding(page);
  // Attribute between-frame stalls: longtask entries prove main-thread blockage (GC, GLB parse,
  // JSON work); their absence during a long rAF gap means the stall is GPU/compositor-side.
  // Resource entries timestamp asset fetches so stalls can be correlated with what just loaded.
  await page.evaluate(() => {
    window.__HITCH_LONGTASKS__ = [];
    window.__HITCH_RESOURCES__ = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__HITCH_LONGTASKS__.push({ start: Math.round(e.startTime), ms: Math.round(e.duration) });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch (_) {}
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!/\.(glb|png|jpg|ktx2|json)(\?|$)/i.test(e.name)) continue;
          window.__HITCH_RESOURCES__.push({ end: Math.round(e.responseEnd), ms: Math.round(e.duration), url: e.name.split('/').slice(-2).join('/') });
        }
      }).observe({ entryTypes: ['resource'], buffered: true });
    } catch (_) {}
  });
  const stress = await installStressScenario(page);
  await waitForStressAssets(page);
  const renderWarmup = await waitForRenderWarmup(page);
  await warmStressPipelines(page);
  await waitForStressAssets(page);
  const sample = await sampleHitches(page, { warmupMs: WARMUP_MS, durationMs: DURATION_MS, frameBudgetMs: FRAME_BUDGET_MS });
  const attribution = await page.evaluate(() => ({
    longtasks: (window.__HITCH_LONGTASKS__ || []).filter((t) => t.ms >= 50).slice(-40),
    resources: (window.__HITCH_RESOURCES__ || []).slice(-40),
  }));
  console.log('[hitch-budget] main-thread longtasks >=50ms:', JSON.stringify(attribution.longtasks));
  console.log('[hitch-budget] recent asset fetches:', JSON.stringify(attribution.resources.slice(-15)));

  const pageErrors = issues.errorIssues();
  const pageWarnings = issues.warningIssues().slice(0, 12);
  const pass = sample.frameMs.overBudget === 0 && pageErrors.length === 0;
  const report = {
    schema: 'spaceface.hitchBudget.v1',
    generatedAt: new Date().toISOString(),
    runner: { width: WIDTH, height: HEIGHT, seed: SEED, warmupMs: WARMUP_MS, durationMs: DURATION_MS, frameBudgetMs: FRAME_BUDGET_MS, headless: !HEADED },
    scenario: stress,
    frameMs: sample.frameMs,
    histogram: sample.histogram,
    spikes: sample.spikes.slice(0, 20),
    topSpikeSources: sample.topSpikeSources,
    renderWarmup,
    diagnostics: sample.diagnostics,
    pageIssues: { errors: pageErrors, warnings: pageWarnings },
    failureEvidence: buildFailureEvidence({
      frameBudgetMs: FRAME_BUDGET_MS,
      frameMs: sample.frameMs,
      spikes: sample.spikes,
      topSpikeSources: sample.topSpikeSources,
      pageErrors,
      out: OUT,
    }),
    pass,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));

  printReport(report);
  if (!report.pass) process.exitCode = 1;
} finally {
  await closeProbeBrowser(browser);
  await stopProbeServer(server);
}

async function installStressScenario(page) {
  return page.evaluate(({ seed }) => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    if (!player) throw new Error('player not available for hitch stress setup');

    const byDistance = (a, b) => distSq(a, player) - distSq(b, player);
    const asteroidIds = state.entityList
      .filter((entity) => entity && entity.alive !== false && entity.type === 'asteroid')
      .sort(byDistance)
      .slice(0, 10)
      .map((entity) => entity.id);
    const enemyIds = state.entityList
      .filter((entity) => entity && entity.alive !== false && entity.type === 'ship' && entity.id !== player.id && entity.team !== player.team)
      .sort(byDistance)
      .slice(0, 6)
      .map((entity) => entity.id);
    state.player.targetId = enemyIds[0] || null;
    window.__SF_HITCH_STRESS__ = {
      asteroidIds,
      enemyIds,
      nextAsteroid: 0,
      nextEnemy: 0,
      nextWeapon: 0,
      nextBurstAt: 0,
      nextMiningStartAt: 0,
      weapons: ['wpn_pulse_laser_m', 'wpn_autocannon_m', 'wpn_plasma_cannon_m', 'wpn_railgun_m', 'wpn_missile_rack_m', 'wpn_heavy_beam_l'],
    };
    return {
      baseScenario: state.scenario && state.scenario.active && state.scenario.active.id || 'debug-flight',
      asteroids: asteroidIds.length,
      enemies: enemyIds.length,
      seed,
      video: { ...((state.settings && state.settings.video) || {}) },
      entityCount: state.entityList.length,
      injectedEntities: 0,
    };

    function distSq(entity, origin) {
      const dx = (entity.pos && entity.pos.x || 0) - (origin.pos && origin.pos.x || 0);
      const dz = (entity.pos && entity.pos.z || 0) - (origin.pos && origin.pos.z || 0);
      return dx * dx + dz * dz;
    }
  }, { seed: SEED });
}

async function waitForStressAssets(page) {
  await page.waitForFunction(async () => {
    const sf = window.SF;
    const stress = window.__SF_HITCH_STRESS__;
    if (!sf || !stress) return false;
    const state = sf.state;
    const render = sf.registry && sf.registry.get && sf.registry.get('render');
    if (render && render._meshBuildQueue && render._meshBuildQueue.length > 0) return false;
    if (render && render._meshReconcileDirty) return false;
    const renderState = state && state.render || {};
    const promiseStatus = async (promise) => {
      if (!promise || typeof promise.then !== 'function') return { present: false, settled: true };
      return Promise.race([
        promise.then(() => ({ present: true, settled: true, ok: true }), () => ({ present: true, settled: true, ok: false })),
        new Promise((resolve) => setTimeout(() => resolve({ present: true, settled: false }), 1000)),
      ]);
    };
    const authoredPartLibrary = await promiseStatus(renderState.authoredPartLibraryReady);
    const pipelinePrecompile = await promiseStatus(renderState.pipelinePrecompileReady);
    if (!authoredPartLibrary.settled || !pipelinePrecompile.settled) return false;
    const scene = state && state.render && state.render.scene;
    let queue = { pending: 0, running: false };
    try {
      const partsLibrary = await import('./src/render/partsLibrary.js');
      if (partsLibrary && typeof partsLibrary.getAuthoredUpgradeQueueStats === 'function') {
        queue = partsLibrary.getAuthoredUpgradeQueueStats(scene);
      }
    } catch (_) {}
    if (queue.pending > 0 || queue.running) return false;
    for (const id of stress.enemyIds || []) {
      const entity = state.entities.get(id);
      if (!entity || entity.alive === false) continue;
      const mesh = entity.mesh;
      if (!mesh) return false;
      const assetState = mesh.userData && mesh.userData.authoredAssetState;
      if (assetState && assetState !== 'authored') return false;
    }
    return true;
  }, null, { timeout: 90000 });
}

async function waitForRenderWarmup(page) {
  const promises = await page.evaluate(async () => {
    window.__SF_RENDER_WARMUP_READY__ = false;
    const sf = window.SF;
    const render = sf && sf.state && sf.state.render;
    try {
      const partsLibrary = await import('./src/render/partsLibrary.js');
      if (partsLibrary && typeof partsLibrary.getAuthoredUpgradeQueueStats === 'function') {
        window.__SF_GET_AUTHORED_UPGRADE_QUEUE_STATS__ = partsLibrary.getAuthoredUpgradeQueueStats;
      }
    } catch (_) {}
    const wait = async (promise, label) => {
      if (!promise || typeof promise.then !== 'function') return { label, present: false, settled: true };
      return Promise.race([
        promise.then(() => ({ label, present: true, settled: true, ok: true }), () => ({ label, present: true, settled: true, ok: false })),
        new Promise((resolve) => setTimeout(() => resolve({ label, present: true, settled: false, timeout: true }), 90000)),
      ]);
    };
    const authoredPartLibrary = await wait(render && render.authoredPartLibraryReady, 'authoredPartLibraryReady');
    const pipelinePrecompile = await wait(render && render.pipelinePrecompileReady, 'pipelinePrecompileReady');
    window.__SF_RENDER_WARMUP_READY__ = authoredPartLibrary.settled && pipelinePrecompile.settled;
    return { authoredPartLibrary, pipelinePrecompile };
  });
  await page.waitForFunction(async () => {
    const sf = window.SF;
    const state = sf && sf.state;
    const render = state && state.render;
    const renderSys = sf && sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('render') : null;
    if (!render) return false;
    if (window.__SF_RENDER_WARMUP_READY__ === false) return false;
    const meshQueueRemaining = renderSys && Array.isArray(renderSys._meshBuildQueue)
      ? Math.max(0, renderSys._meshBuildQueue.length - (renderSys._meshBuildQueueHead || 0))
      : 0;
    if (meshQueueRemaining > 0 || (renderSys && renderSys._meshReconcileDirty)) return false;
    let queue = { pending: 0, running: false };
    try {
      const queueStats = window.__SF_GET_AUTHORED_UPGRADE_QUEUE_STATS__;
      if (typeof queueStats === 'function') {
        queue = queueStats(render.scene);
      }
    } catch (_) {}
    return queue.pending === 0 && queue.running === false;
  }, null, { timeout: 90000 });
  const queues = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const render = state && state.render;
    const renderSys = sf && sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('render') : null;
    const meshQueueRemaining = renderSys && Array.isArray(renderSys._meshBuildQueue)
      ? Math.max(0, renderSys._meshBuildQueue.length - (renderSys._meshBuildQueueHead || 0))
      : 0;
    let authoredUpgradeQueue = { pending: 0, running: false };
    try {
      const queueStats = window.__SF_GET_AUTHORED_UPGRADE_QUEUE_STATS__;
      if (typeof queueStats === 'function') authoredUpgradeQueue = queueStats(render && render.scene);
    } catch (_) {}
    return {
      authoredUpgradeQueue,
      meshQueueRemaining,
      meshReconcileDirty: !!(renderSys && renderSys._meshReconcileDirty),
    };
  });
  return { ...promises, ...queues };
}

async function warmStressPipelines(page) {
  await page.evaluate(async () => {
    const sf = window.SF;
    const state = sf && sf.state;
    const render = state && state.render;
    const renderer = render && render.renderer;
    const scene = render && render.scene;
    const camera = render && render.camera;
    const wait = async (promise) => {
      if (promise && typeof promise.then === 'function') {
        await promise.catch(() => null);
      }
    };
    await wait(render && render.authoredPartLibraryReady);
    await wait(render && render.pipelinePrecompileReady);
    if (renderer && scene && camera && typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(scene, camera, scene).catch(() => null);
    }
    if (render && typeof render.warmPostProcess === 'function') {
      render.warmPostProcess();
    }
  });
  await page.waitForTimeout(250);
}

async function sampleHitches(page, opts) {
  return page.evaluate(({ warmupMs, durationMs, frameBudgetMs }) => new Promise((resolve) => {
    const started = performance.now();
    const frames = [];
    const spikes = [];
    let last = null;
    let sampleStart = null;
    let finished = false;
    let watchdog = null;

    function resetRuntimeProbes() {
      try { if (window.__THREE_GAME_DIAGNOSTICS__ && window.__THREE_GAME_DIAGNOSTICS__.reset) window.__THREE_GAME_DIAGNOSTICS__.reset(); } catch (_) {}
      try { if (window.__SPACEFACE_PERF__ && window.__SPACEFACE_PERF__.reset) window.__SPACEFACE_PERF__.reset(); } catch (_) {}
    }

    function pumpStress(now) {
      const sf = window.SF;
      const stress = window.__SF_HITCH_STRESS__;
      if (!sf || !stress || now < stress.nextBurstAt) return;
      stress.nextBurstAt = now + 120;
      const state = sf.state;
      const player = state.entities.get(state.playerId);
      if (!player) return;
      const asteroidId = stress.asteroidIds[stress.nextAsteroid++ % Math.max(1, stress.asteroidIds.length)];
      const enemyId = stress.enemyIds[stress.nextEnemy++ % Math.max(1, stress.enemyIds.length)];
      const asteroid = state.entities.get(asteroidId);
      const enemy = state.entities.get(enemyId);
      if (enemy) state.player.targetId = enemy.id;
      if (asteroid) {
        if (now >= stress.nextMiningStartAt) {
          stress.nextMiningStartAt = now + 1400;
          sf.bus.emit('mining:start', { targetId: asteroid.id });
        }
        sf.bus.emit('mining:tick', { targetId: asteroid.id, oreId: asteroid.data && asteroid.data.typeId || 'ast_metallic' });
        if ((stress.nextAsteroid % 5) === 0) {
          sf.bus.emit('mining:yield', { targetId: asteroid.id, oreId: asteroid.data && asteroid.data.typeId || 'ast_metallic', qty: 2 });
        }
      }
      const target = enemy || asteroid || player;
      const dx = (target.pos.x || 0) - player.pos.x;
      const dz = (target.pos.z || 0) - player.pos.z;
      const dir = Math.atan2(dz, dx);
      const weaponId = stress.weapons[stress.nextWeapon++ % stress.weapons.length];
      const origin = { x: player.pos.x + Math.cos(dir) * 18, z: player.pos.z + Math.sin(dir) * 18 };
      sf.bus.emit('combat:fire', { ownerId: player.id, weaponId, hardpointIdx: 0, origin, dir });
      sf.bus.emit('projectile:hit', { ownerId: player.id, targetId: target.id, weaponId, damageType: weaponId.includes('plasma') ? 'thermal' : 'energy', pos: { x: target.pos.x, z: target.pos.z } });
    }

    function finish() {
      if (finished) return;
      finished = true;
      if (watchdog != null) clearTimeout(watchdog);
      try { if (window.SF) window.SF.bus.emit('mining:stop', {}); } catch (_) {}
      const sorted = frames.slice().sort((a, b) => a - b);
      const frameMs = {
        samples: frames.length,
        avg: round(avg(frames)),
        min: round(frames.length ? sorted[0] : 0),
        max: round(frames.length ? sorted[sorted.length - 1] : 0),
        p50: round(percentile(sorted, 0.50)),
        p95: round(percentile(sorted, 0.95)),
        p99: round(percentile(sorted, 0.99)),
        over16_7: frames.filter((value) => value > 16.7).length,
        over24: frames.filter((value) => value > 24).length,
        overBudget: frames.filter((value) => value > frameBudgetMs).length,
        over40: frames.filter((value) => value > 40).length,
        over50: frames.filter((value) => value > 50).length,
      };
      const diagnostics = readDiagnostics();
      resolve({
        frameMs,
        histogram: histogram(frames),
        spikes: spikes.sort((a, b) => b.ms - a.ms),
        topSpikeSources: topSpikeSources(diagnostics.perf),
        diagnostics,
      });
    }

    function tick(now) {
      if (finished) return;
      const elapsed = now - started;
      if (sampleStart == null) {
        if (elapsed < warmupMs) {
          pumpStress(now);
        } else if (runtimeSettled()) {
          const stress = window.__SF_HITCH_STRESS__;
          if (stress) stress.nextBurstAt = now + 120;
          sampleStart = now;
          last = now;
          resetRuntimeProbes();
          watchdog = setTimeout(finish, durationMs + 1000);
        }
      } else {
        pumpStress(now);
        const dt = now - last;
        frames.push(dt);
        if (dt > frameBudgetMs) {
          spikes.push({
            atMs: round(now - sampleStart),
            ms: round(dt),
            entityCount: window.SF && window.SF.state && window.SF.state.entityList ? window.SF.state.entityList.length : 0,
          });
        }
        last = now;
      }
      if (sampleStart != null && now - sampleStart >= durationMs) finish();
      else requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);

    function readDiagnostics() {
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      const d = diag && typeof diag.getReport === 'function' ? diag.getReport() : {};
      const perf = window.__SPACEFACE_PERF__ && typeof window.__SPACEFACE_PERF__.getReport === 'function'
        ? window.__SPACEFACE_PERF__.getReport()
        : d.perf || {};
      return {
        frameMs: d.frameMs || {},
        render: d.render || {},
        memory: d.memory || {},
        counts: d.counts || {},
        perf,
      };
    }

    function runtimeSettled() {
      const sf = window.SF;
      const state = sf && sf.state;
      const render = sf && sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('render') : null;
      if (!state || !render) return false;
      if (render._meshBuildQueue && render._meshBuildQueue.length > 0) return false;
      if (render._meshReconcileDirty) return false;
      if (window.__SF_RENDER_WARMUP_READY__ === false) return false;
      try {
        const queueStats = window.__SF_GET_AUTHORED_UPGRADE_QUEUE_STATS__;
        const queue = typeof queueStats === 'function'
          ? queueStats(state.render && state.render.scene)
          : { pending: 0, running: false };
        if (queue.pending > 0 || queue.running) return false;
      } catch (_) {}
      for (const entity of state.entityList || []) {
        if (!entity || entity.alive === false || entity._noMesh || entity.type === 'fx') continue;
        if (!entity.mesh) return false;
        if (entity.type === 'ship') {
          const assetState = entity.mesh.userData && entity.mesh.userData.authoredAssetState;
          if (assetState && assetState !== 'authored') return false;
        }
      }
      return true;
    }

    function topSpikeSources(perf) {
      const phases = perf && perf.phases || {};
      const out = [
        { name: 'render', ms: phases.render && phases.render.max },
        { name: 'vfx', ms: phases.vfx && phases.vfx.max },
        { name: 'sim-frame', ms: phases.simFrame && phases.simFrame.max },
        { name: 'ui', ms: phases.ui && phases.ui.max },
        { name: 'feel', ms: phases.feel && phases.feel.max },
        { name: 'untracked-callback', ms: perf && perf.frameUntracked && perf.frameUntracked.max },
      ].filter((entry) => Number.isFinite(entry.ms));
      return out.sort((a, b) => b.ms - a.ms).slice(0, 3).map((entry) => ({ name: entry.name, ms: round(entry.ms) }));
    }

    function histogram(values) {
      const bins = [
        { label: '0-8', max: 8, count: 0 },
        { label: '8-12', max: 12, count: 0 },
        { label: '12-16.7', max: 16.7, count: 0 },
        { label: '16.7-24', max: 24, count: 0 },
        { label: '24-32', max: 32, count: 0 },
        { label: '32-40', max: 40, count: 0 },
        { label: '40-50', max: 50, count: 0 },
        { label: '50+', max: Infinity, count: 0 },
      ];
      for (const value of values) {
        const bin = bins.find((entry) => value <= entry.max) || bins[bins.length - 1];
        bin.count++;
      }
      return bins;
    }

    function avg(values) {
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    }

    function percentile(sorted, p) {
      if (!sorted.length) return 0;
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
      return sorted[idx];
    }

    function round(value) {
      return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
    }
  }), opts);
}

async function dismissOnboarding(page) {
  await page.evaluate(() => {
    try {
      window.SF.bus.emit('ui:closeAll', {});
      window.SF.bus.emit('onboarding:dismiss', {});
    } catch (_) {}
  });
}

function printReport(report) {
  console.log(`[hitch-budget] scenario=${report.scenario.baseScenario} enemies=${report.scenario.enemies} asteroids=${report.scenario.asteroids}`);
  console.log(`[hitch-budget] frames=${report.frameMs.samples} avg=${report.frameMs.avg}ms p95=${report.frameMs.p95}ms p99=${report.frameMs.p99}ms worst=${report.frameMs.max}ms`);
  console.log(`[hitch-budget] >${report.runner.frameBudgetMs}ms=${report.frameMs.overBudget} >40ms=${report.frameMs.over40} >50ms=${report.frameMs.over50}`);
  console.log('[hitch-budget] histogram:');
  for (const bin of report.histogram) console.log(`  ${bin.label.padEnd(8)} ${bin.count}`);
  if (!report.pass) {
    console.log('[hitch-budget] failure evidence:');
    for (const reason of report.failureEvidence.reasons) console.log(`  ${reason}`);
    if (report.failureEvidence.topSpikes.length) {
      console.log('[hitch-budget] top over-budget frames:');
      for (const spike of report.failureEvidence.topSpikes) {
        console.log(`  +${spike.atMs}ms ${spike.ms}ms entities=${spike.entityCount}`);
      }
    }
    console.log('[hitch-budget] top spike sources:');
    for (const source of report.topSpikeSources) console.log(`  ${source.name.padEnd(18)} ${source.ms}ms`);
    if (report.failureEvidence.pageErrors.length) {
      console.log('[hitch-budget] page errors:');
      for (const issue of report.failureEvidence.pageErrors) console.log(`  ${issue}`);
    }
  }
  console.log(`[hitch-budget] report: ${OUT}`);
}

function buildFailureEvidence({ frameBudgetMs, frameMs, spikes, topSpikeSources, pageErrors, out }) {
  const reasons = [];
  if (frameMs.overBudget > 0) reasons.push(`${frameMs.overBudget} post-warmup frames exceeded ${frameBudgetMs} ms`);
  if (pageErrors.length > 0) reasons.push(`${pageErrors.length} browser page errors were reported`);
  if (!reasons.length) reasons.push('no failure recorded');
  return {
    reasons,
    report: out,
    worstFrameMs: frameMs.max,
    p95FrameMs: frameMs.p95,
    p99FrameMs: frameMs.p99,
    topSpikes: spikes.slice().sort((a, b) => b.ms - a.ms).slice(0, 8),
    topSpikeSources,
    pageErrors: pageErrors.slice(0, 5).map(formatPageIssue),
  };
}

function formatPageIssue(issue) {
  if (!issue) return 'unknown page error';
  if (typeof issue === 'string') return issue;
  return issue.text || issue.message || issue.errorText || JSON.stringify(issue);
}

async function startFreshServer() {
  const port = await findFreePort(8721);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, child, kill: () => child.kill() };
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
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

function withDebugFlight(url) {
  const u = new URL(url);
  u.searchParams.set('debug', 'flight');
  return String(u);
}

async function launchProbeBrowser() {
  const args = [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-frame-rate-limit',
    '--disable-gpu-vsync',
    '--disable-features=CalculateNativeWinOcclusion',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    `--window-size=${WIDTH},${HEIGHT}`,
  ];
  const executablePath = findSystemBrowser();
  if (executablePath) {
    try {
      const launched = await chromium.launch({ headless: !HEADED, executablePath, args });
      attachProbeProcess(launched);
      return launched;
    } catch (error) {
      console.warn(`[hitch-budget] system browser launch failed; falling back to bundled Chromium: ${error && error.message ? error.message : error}`);
    }
  }
  const launched = await chromium.launch({ headless: !HEADED, args });
  attachProbeProcess(launched);
  return launched;
}

function attachProbeProcess(launched) {
  try {
    if (launched && typeof launched.process === 'function') launched._probeProcess = launched.process();
  } catch (_) {}
}

function findSystemBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

async function closeProbeBrowser(target) {
  if (!target) return;
  const proc = target._probeProcess || null;
  try {
    await Promise.race([
      target.close(),
      sleep(5000),
    ]);
  } catch (_) {}
  if (proc && proc.exitCode == null && proc.signalCode == null) await terminateChild(proc);
}

async function stopProbeServer(target) {
  if (!target) return;
  if (target.child) {
    await terminateChild(target.child);
    return;
  }
  if (typeof target.kill === 'function') {
    try { target.kill(); } catch (_) {}
  }
}

async function terminateChild(child) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  if (process.platform === 'win32' && child.pid) {
    try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
    await waitForChildExit(child, 2500);
    return;
  }
  try { child.kill(); } catch (_) {}
  await waitForChildExit(child, 2500);
  if (child.exitCode != null || child.signalCode != null) return;
  try { child.kill('SIGKILL'); } catch (_) {}
  await waitForChildExit(child, 1000);
}

async function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(timeoutMs),
  ]);
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq >= 0) out[arg.slice(2, eq)] = arg.slice(eq + 1);
    else {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        out[arg.slice(2)] = next;
        i++;
      } else {
        out[arg.slice(2)] = true;
      }
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
