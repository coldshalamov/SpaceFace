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
// The acceptance route uses Chrome's normal presentation pacing. Uncapped submission is useful for
// throughput diagnosis, but it intentionally saturates the renderer/driver and is not a valid
// player-frame hitch gate.
const UNCAPPED = !!(argv.uncapped || argv['uncapped-rendering']);
// Diagnostic bisect: disable the dynamic-resolution controller for the run, to separate hitches it
// causes (render-target reallocation on every scale change) from hitches it merely reacts to.
const NO_DYNRES = !!(argv.noDynres || argv['no-dynres']);
// Diagnostic bisect: freeze the deep-field background (hide + stop updates) to separate its
// bake/rebuild costs from the rest of the frame.
const NO_BG = !!(argv.noBg || argv['no-bg']);
// Diagnostic-only split of --no-bg. These flags preserve the other half of the subsystem so the
// probe can distinguish CPU-side backdrop updates from GPU/full-screen background submission.
const NO_BG_UPDATE = !!(argv.noBgUpdate || argv['no-bg-update']);
const NO_BG_DRAW = !!(argv.noBgDraw || argv['no-bg-draw']);
const NO_BG_TILES = !!(argv.noBgTiles || argv['no-bg-tiles']);
const NO_BG_STARS = !!(argv.noBgStars || argv['no-bg-stars']);
const NO_BG_HEROES = !!(argv.noBgHeroes || argv['no-bg-heroes']);
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
  console.log('[hitch-budget] renderer ready');
  await page.waitForFunction(() => {
    const overlay = document.getElementById('boot-overlay');
    return !overlay || overlay.classList.contains('hidden') || getComputedStyle(overlay).visibility === 'hidden';
  }, null, { timeout: 90000 });
  await page.evaluate((seed) => {
    window.SF.bus.emit('game:new', { name: 'Hitch Budget', seed });
    window.SF.bus.emit('ui:closeAll', {});
  }, SEED);
  console.log('[hitch-budget] new-game transition requested');
  if (NO_DYNRES) {
    await page.evaluate(() => {
      window.SF.state.settings.video.dynamicResolution = false;
      window.SF.bus.emit('settings:changed', { section: 'video', key: 'dynamicResolution' });
    });
  }
  if (NO_BG || NO_BG_UPDATE || NO_BG_DRAW || NO_BG_TILES || NO_BG_STARS || NO_BG_HEROES) {
    await page.evaluate((flags) => {
      const bg = window.SF.state.render.spaceBg;
      if (bg) {
        if ((flags.noBg || flags.noBgDraw) && bg.group) bg.group.visible = false;
        if (flags.noBgTiles) {
          for (const layer of bg.layers || []) if (layer && layer.mesh) layer.mesh.visible = false;
        }
        if (flags.noBgStars) {
          if (bg.stars && bg.stars.pts) bg.stars.pts.visible = false;
          if (bg.flares && bg.flares.mesh) bg.flares.mesh.visible = false;
        }
        if (flags.noBgHeroes) {
          for (const planet of bg.planets || []) if (planet && planet.sprite) planet.sprite.visible = false;
          if (bg.wormhole && bg.wormhole.mesh) bg.wormhole.mesh.visible = false;
          if (bg.comet && bg.comet.sprite) bg.comet.sprite.visible = false;
        }
        if (flags.noBg || flags.noBgUpdate) {
          bg.update = () => {};
          bg.onResize = () => {};
        }
      }
    }, {
      noBg: NO_BG,
      noBgUpdate: NO_BG_UPDATE,
      noBgDraw: NO_BG_DRAW,
      noBgTiles: NO_BG_TILES,
      noBgStars: NO_BG_STARS,
      noBgHeroes: NO_BG_HEROES,
    });
  }
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.mesh);
  }, null, { timeout: 90000 });
  console.log('[hitch-budget] flight route ready');
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
  console.log('[hitch-budget] stress scenario installed');
  await waitForStressAssets(page);
  console.log('[hitch-budget] relevant stress assets ready');
  const renderWarmup = await waitForRenderWarmup(page);
  console.log('[hitch-budget] render warm-up ready');
  await warmStressPipelines(page);
  console.log('[hitch-budget] stress pipelines ready');
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
  const pass = sample.settleWait === 'settled'
    && sample.frameMs.samples > 0
    && sample.frameMs.unexpectedOverBudget === 0
    && sample.programEvents.length === 0
    && pageErrors.length === 0;
  const report = {
    schema: 'spaceface.hitchBudget.v1',
    generatedAt: new Date().toISOString(),
    runner: {
      width: WIDTH,
      height: HEIGHT,
      seed: SEED,
      warmupMs: WARMUP_MS,
      durationMs: DURATION_MS,
      frameBudgetMs: FRAME_BUDGET_MS,
      headless: !HEADED,
      uncapped: UNCAPPED,
      diagnostics: {
        noDynres: NO_DYNRES,
        noBg: NO_BG,
        noBgUpdate: NO_BG_UPDATE,
        noBgDraw: NO_BG_DRAW,
        noBgTiles: NO_BG_TILES,
        noBgStars: NO_BG_STARS,
        noBgHeroes: NO_BG_HEROES,
      },
    },
    scenario: stress,
    frameMs: sample.frameMs,
    settleWait: sample.settleWait,
    histogram: sample.histogram,
    spikes: sample.spikes.slice(0, 20),
    programEvents: sample.programEvents,
    topSpikeSources: sample.topSpikeSources,
    renderWarmup,
    diagnostics: sample.diagnostics,
    pageIssues: { errors: pageErrors, warnings: pageWarnings },
    failureEvidence: buildFailureEvidence({
      frameBudgetMs: FRAME_BUDGET_MS,
      frameMs: sample.frameMs,
      settleWait: sample.settleWait,
      spikes: sample.spikes,
      topSpikeSources: sample.topSpikeSources,
      programEvents: sample.programEvents,
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
    const meshQueueRemaining = render && Array.isArray(render._meshBuildQueue)
      ? Math.max(0, render._meshBuildQueue.length - (render._meshBuildQueueHead || 0))
      : 0;
    if (meshQueueRemaining > 0) return false;
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
    const backgroundPipelinePrecompile = await promiseStatus(renderState.backgroundPipelinePrecompileReady);
    const exactPipelineWarmup = await promiseStatus(renderState.exactPipelineWarmupReady);
    if (!authoredPartLibrary.settled || !pipelinePrecompile.settled
      || !backgroundPipelinePrecompile.settled || !exactPipelineWarmup.settled) return false;
    const scene = state && state.render && state.render.scene;
    let queue = { pending: 0, running: false };
    try {
      const partsLibrary = await import('./src/render/partsLibrary.js');
      if (partsLibrary && typeof partsLibrary.getAuthoredUpgradeQueueStats === 'function') {
        queue = partsLibrary.getAuthoredUpgradeQueueStats(scene);
      }
      const rendererModule = await import('./src/render/renderer.js');
      window.__SF_IS_AUTHORED_UPGRADE_RELEVANT__ = rendererModule.isEntityAuthoredUpgradeRelevant;
    } catch (_) {}
    if (queue.pending > 0 || queue.running) return false;
    for (const id of stress.enemyIds || []) {
      const entity = state.entities.get(id);
      if (!entity || entity.alive === false) continue;
      const mesh = entity.mesh;
      if (!mesh) return false;
      const assetState = mesh.userData && mesh.userData.authoredAssetState;
      const relevant = typeof window.__SF_IS_AUTHORED_UPGRADE_RELEVANT__ === 'function'
        ? window.__SF_IS_AUTHORED_UPGRADE_RELEVANT__(entity, state)
        : entity.id === state.playerId || state.player && state.player.targetId === entity.id;
      if (relevant && assetState && assetState !== 'authored') return false;
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
    const backgroundPipelinePrecompile = await wait(
      render && render.backgroundPipelinePrecompileReady,
      'backgroundPipelinePrecompileReady',
    );
    const exactPipelineWarmup = await wait(render && render.exactPipelineWarmupReady, 'exactPipelineWarmupReady');
    window.__SF_RENDER_WARMUP_READY__ = authoredPartLibrary.settled
      && pipelinePrecompile.settled
      && backgroundPipelinePrecompile.settled
      && exactPipelineWarmup.settled;
    return { authoredPartLibrary, pipelinePrecompile, backgroundPipelinePrecompile, exactPipelineWarmup };
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
  const queues = await page.evaluate(async () => {
    const sf = window.SF;
    const state = sf && sf.state;
    const render = state && state.render;
    const renderSys = sf && sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('render') : null;
    const meshQueueRemaining = renderSys && Array.isArray(renderSys._meshBuildQueue)
      ? Math.max(0, renderSys._meshBuildQueue.length - (renderSys._meshBuildQueueHead || 0))
      : 0;
    let authoredUpgradeQueue = { pending: 0, running: false };
    let precompileKeepAlive = { retainedCanopyVariants: 0, variants: [] };
    try {
      const queueStats = window.__SF_GET_AUTHORED_UPGRADE_QUEUE_STATS__;
      if (typeof queueStats === 'function') authoredUpgradeQueue = queueStats(render && render.scene);
    } catch (_) {}
    try {
      const precompile = await import('./src/render/precompile.js');
      if (typeof precompile.getPrecompileKeepAliveDiagnostics === 'function') {
        precompileKeepAlive = precompile.getPrecompileKeepAliveDiagnostics(render && render.renderer);
      }
    } catch (_) {}
    return {
      authoredUpgradeQueue,
      meshQueueRemaining,
      meshReconcileDirty: !!(renderSys && renderSys._meshReconcileDirty),
      precompileKeepAlive,
    };
  });
  return { ...promises, ...queues };
}

async function warmStressPipelines(page) {
  await page.evaluate(async () => {
    const sf = window.SF;
    const state = sf && sf.state;
    const render = state && state.render;
    const wait = async (promise) => {
      if (promise && typeof promise.then === 'function') {
        await promise.catch(() => null);
      }
    };
    await wait(render && render.authoredPartLibraryReady);
    await wait(render && render.pipelinePrecompileReady);
    await wait(render && render.backgroundPipelinePrecompileReady);
    await wait(render && render.exactPipelineWarmupReady);
    if (render && typeof render.compileCurrentPipelines === 'function') {
      await render.compileCurrentPipelines().catch(() => null);
    }
    if (render && typeof render.warmPostProcess === 'function') {
      render.warmPostProcess();
    }
  });
  await page.waitForTimeout(250);
}

async function sampleHitches(page, opts) {
  return page.evaluate(({ warmupMs, durationMs, frameBudgetMs }) => new Promise((resolve) => {
    const frames = [];
    const spikes = [];
    let last = null;
    let sampleStart = null;
    let settledAt = null;
    let finished = false;
    let watchdog = null;
    let settleWait = 'warmup';
    let previousProgramCount = 0;
    let previousProgramKeys = new Set();
    const programEvents = [];

    function resetRuntimeProbes() {
      try { if (window.__THREE_GAME_DIAGNOSTICS__ && window.__THREE_GAME_DIAGNOSTICS__.reset) window.__THREE_GAME_DIAGNOSTICS__.reset(); } catch (_) {}
      try { if (window.__SPACEFACE_PERF__ && window.__SPACEFACE_PERF__.reset) window.__SPACEFACE_PERF__.reset(); } catch (_) {}
      const renderer = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.renderer;
      const programs = renderer && renderer.info && Array.isArray(renderer.info.programs)
        ? renderer.info.programs : [];
      previousProgramCount = programs.length;
      previousProgramKeys = new Set(programs.map(programKey));
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
      const unexpectedSpikes = spikes.filter((spike) => spike.unexpected === true);
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
        unexpectedOverBudget: unexpectedSpikes.length,
        schedulerOnlyOverBudget: spikes.length - unexpectedSpikes.length,
        over40: frames.filter((value) => value > 40).length,
        over50: frames.filter((value) => value > 50).length,
      };
      const diagnostics = readDiagnostics();
      resolve({
        frameMs,
        settleWait,
        programEvents,
        histogram: histogram(frames),
        spikes: spikes.sort((a, b) => b.ms - a.ms),
        topSpikeSources: topSpikeSources(diagnostics.perf),
        diagnostics,
      });
    }

    function tick(now) {
      if (finished) return;
      if (sampleStart == null) {
        pumpStress(now);
        if (runtimeSettled()) {
          if (settledAt == null) settledAt = now;
          const stableWarmupMs = now - settledAt;
          if (stableWarmupMs < warmupMs) {
            settleWait = `post-settle-warmup:${Math.round(stableWarmupMs)}/${warmupMs}`;
          } else {
            const stress = window.__SF_HITCH_STRESS__;
            if (stress) stress.nextBurstAt = now + 120;
            sampleStart = now;
            last = now;
            resetRuntimeProbes();
            watchdog = setTimeout(finish, durationMs + 1000);
          }
        } else {
          settledAt = null;
        }
      } else {
        pumpStress(now);
        monitorPrograms(now);
        const dt = now - last;
        frames.push(dt);
        if (dt > frameBudgetMs) {
          const perf = window.__SPACEFACE_PERF__?.getReport?.() || {};
          const phases = perf.phases || {};
          const renderState = window.SF?.state?.render || null;
          const upgrade = renderState?.scene?.userData?.authoredUpgradeDiagnostics || null;
          const callbackMs = Number(perf.frameCallback?.last);
          const lastJob = Array.isArray(upgrade?.jobs) ? upgrade.jobs.at(-1) || null : null;
          const lastPartLoad = Array.isArray(upgrade?.partLoads) ? upgrade.partLoads.at(-1) || null : null;
          const recentResources = performance.getEntriesByType('resource')
            .filter((entry) => /\.(?:glb|png|jpg|ktx2|json)(?:\?|$)/i.test(String(entry.name || ''))
              && Number.isFinite(entry.responseEnd) && now - entry.responseEnd <= 1000)
            .slice(-8)
            .map((entry) => ({
              name: String(entry.name || '').split('/').slice(-2).join('/'),
              responseEnd: round(entry.responseEnd),
              durationMs: round(entry.duration),
            }));
          const attribution = [];
          if (!Number.isFinite(callbackMs)) attribution.push('missing-callback-evidence');
          else if (callbackMs > frameBudgetMs) attribution.push('game-callback-over-budget');
          if (Number(upgrade?.activeJobs) > 0) attribution.push('authored-admission-active');
          if (Number.isFinite(lastJob?.endedAtMs) && now - lastJob.endedAtMs <= 1000) {
            attribution.push('authored-admission-recent');
          }
          if (Number.isFinite(lastPartLoad?.endedAtMs) && now - lastPartLoad.endedAtMs <= 1000) {
            attribution.push('authored-decode-recent');
          }
          if (recentResources.length > 0) attribution.push('asset-resource-recent');
          spikes.push({
            atMs: round(now - sampleStart),
            ms: round(dt),
            entityCount: window.SF && window.SF.state && window.SF.state.entityList ? window.SF.state.entityList.length : 0,
            callbackMs: round(callbackMs),
            untrackedCallbackMs: round(perf.frameUntracked?.last),
            phases: {
              simFrameMs: round(phases.simFrame?.last),
              renderMs: round(phases.render?.last),
              vfxMs: round(phases.vfx?.last),
              feelMs: round(phases.feel?.last),
              uiMs: round(phases.ui?.last),
            },
            programs: renderState?.renderer?.info?.programs?.length ?? null,
            authoredUpgrade: upgrade ? {
              activeJobs: upgrade.activeJobs,
              maxConcurrentJobs: upgrade.maxConcurrentJobs,
              maxConcurrentDecode: upgrade.maxConcurrentDecode,
              lastJob,
              lastPartLoad,
            } : null,
            recentResources,
            unexpected: attribution.length > 0,
            attribution: attribution.length > 0 ? attribution : ['scheduler-only'],
            stress: window.__SF_HITCH_STRESS__ ? {
              nextWeapon: window.__SF_HITCH_STRESS__.nextWeapon,
              nextAsteroid: window.__SF_HITCH_STRESS__.nextAsteroid,
              nextEnemy: window.__SF_HITCH_STRESS__.nextEnemy,
            } : null,
          });
        }
        last = now;
      }
      if (sampleStart != null && now - sampleStart >= durationMs) finish();
      else requestAnimationFrame(tick);
    }

    watchdog = setTimeout(finish, warmupMs + durationMs + 30000);
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

    function monitorPrograms(now) {
      const state = window.SF && window.SF.state;
      const renderer = state && state.render && state.render.renderer;
      const programs = renderer && renderer.info && Array.isArray(renderer.info.programs)
        ? renderer.info.programs : [];
      if (programs.length === previousProgramCount) return;
      const keys = programs.map(programKey);
      const addedKeys = keys.filter((key) => !previousProgramKeys.has(key));
      const owners = [];
      const addedSet = new Set(addedKeys);
      const scene = state && state.render && state.render.scene;
      if (scene && typeof scene.traverse === 'function') {
        scene.traverse((object) => {
          if (owners.length >= 24) return;
          const materials = Array.isArray(object.material)
            ? object.material : object.material ? [object.material] : [];
          for (const material of materials) {
            const properties = renderer.properties && renderer.properties.get
              ? renderer.properties.get(material) : null;
            const currentKey = properties && properties.currentProgram
              ? programKey(properties.currentProgram) : null;
            if (!currentKey || !addedSet.has(currentKey)) continue;
            owners.push({
              object: object.name || object.type,
              objectType: object.type,
              material: material.name || material.type,
              materialType: material.type,
              transparent: !!material.transparent,
              blending: material.blending,
              side: material.side,
              depthWrite: material.depthWrite,
              maps: {
                map: !!material.map,
                normalMap: !!material.normalMap,
                aoMap: !!material.aoMap,
                roughnessMap: !!material.roughnessMap,
                metalnessMap: !!material.metalnessMap,
              },
            });
          }
        });
      }
      programEvents.push({
        atMs: round(sampleStart == null ? 0 : now - sampleStart),
        count: programs.length,
        addedKeys,
        owners,
      });
      previousProgramCount = programs.length;
      previousProgramKeys = new Set(keys);
    }

    function programKey(program) {
      return String(program && (program.cacheKey || program.name || program.id));
    }

    function runtimeSettled() {
      const sf = window.SF;
      const state = sf && sf.state;
      const render = sf && sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('render') : null;
      if (!state || !render) { settleWait = 'runtime-missing'; return false; }
      const meshQueueRemaining = Array.isArray(render._meshBuildQueue)
        ? Math.max(0, render._meshBuildQueue.length - (render._meshBuildQueueHead || 0))
        : 0;
      if (meshQueueRemaining > 0) { settleWait = `mesh-queue:${meshQueueRemaining}`; return false; }
      if (render._meshReconcileDirty) { settleWait = 'mesh-reconcile'; return false; }
      if (window.__SF_RENDER_WARMUP_READY__ === false) { settleWait = 'render-warmup'; return false; }
      try {
        const queueStats = window.__SF_GET_AUTHORED_UPGRADE_QUEUE_STATS__;
        const queue = typeof queueStats === 'function'
          ? queueStats(state.render && state.render.scene)
          : { pending: 0, running: false };
        if (queue.pending > 0 || queue.running) {
          settleWait = `authored-queue:${queue.pending}:${queue.running ? 1 : 0}`;
          return false;
        }
      } catch (_) {}
      const stress = window.__SF_HITCH_STRESS__ || {};
      const requiredIds = new Set([
        state.playerId,
        ...(stress.enemyIds || []),
        ...(stress.asteroidIds || []),
      ]);
      for (const id of requiredIds) {
        const entity = state.entities && state.entities.get(id);
        if (!entity || entity.alive === false || entity._noMesh) continue;
        if (!entity.mesh) { settleWait = `mesh-missing:${entity.type || 'unknown'}:${entity.id}`; return false; }
        if (entity.type === 'ship') {
          const assetState = entity.mesh.userData && entity.mesh.userData.authoredAssetState;
          const relevant = typeof window.__SF_IS_AUTHORED_UPGRADE_RELEVANT__ === 'function'
            ? window.__SF_IS_AUTHORED_UPGRADE_RELEVANT__(entity, state)
            : entity.id === state.playerId || state.player && state.player.targetId === entity.id;
          if (relevant && assetState && assetState !== 'authored') {
            settleWait = `authored-state:${entity.id}:${assetState}`;
            return false;
          }
        }
      }
      settleWait = 'settled';
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
  console.log(`[hitch-budget] settle=${report.settleWait}`);
  console.log(`[hitch-budget] >${report.runner.frameBudgetMs}ms=${report.frameMs.overBudget} unexpected=${report.frameMs.unexpectedOverBudget} scheduler-only=${report.frameMs.schedulerOnlyOverBudget} >40ms=${report.frameMs.over40} >50ms=${report.frameMs.over50}`);
  if (report.programEvents.length) {
    console.log('[hitch-budget] new GPU programs during sample:');
    for (const event of report.programEvents) {
      const owners = event.owners.map((owner) => `${owner.object}/${owner.material}`).join(', ') || 'unresolved';
      console.log(`  +${event.atMs}ms programs=${event.count} owners=${owners}`);
    }
  }
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

function buildFailureEvidence({
  frameBudgetMs, frameMs, settleWait, spikes, topSpikeSources, programEvents, pageErrors, out,
}) {
  const reasons = [];
  if (settleWait !== 'settled') reasons.push(`runtime did not settle before sampling: ${settleWait}`);
  if (frameMs.samples === 0) reasons.push('no post-warmup frames were sampled');
  if (frameMs.unexpectedOverBudget > 0) {
    reasons.push(`${frameMs.unexpectedOverBudget} application-owned post-warmup frames exceeded ${frameBudgetMs} ms`);
  }
  if (programEvents.length > 0) reasons.push(`${programEvents.length} new GPU program events appeared after warm-up`);
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
    ...(UNCAPPED ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []),
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
