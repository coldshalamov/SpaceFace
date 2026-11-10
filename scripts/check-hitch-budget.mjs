#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { cpus } from 'node:os';
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
// Over-budget means a missed present at the cadence the loop is actually on: 1.5 × (1000 / live
// frame cap), or 1.5 × display refresh when uncapped. A healthy capped 30 Hz frame (33.3 ms) is
// not a hitch. Pass --frame-budget-ms to pin an explicit bar.
const FRAME_BUDGET_MS = Number(argv.frameBudgetMs || argv['frame-budget-ms'] || 0);
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
  const issues = collectPageIssues(page, { playerStoreMounted: false });

  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      localStorage.setItem('sf.firstRunIntroSeen', '1');
    } catch (_) {}
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
  // Wall-time acceptance is only valid on a quiet host. Record the CPU-busy ratio across the
  // measured window so a contended run is labelled instead of read as a clean pass/fail.
  const hostLoadStart = readCpuTimes();
  const sample = await sampleHitches(page, {
    warmupMs: WARMUP_MS,
    durationMs: DURATION_MS,
    frameBudgetMs: FRAME_BUDGET_MS,
    pumpDuringSettle: !!(argv['pump-during-settle'] || argv.pumpDuringSettle),
  });
  const hostLoad = summarizeHostLoad(hostLoadStart);
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
    && sample.presented.samples > 0
    && sample.presented.p95 <= 40
    && sample.frameMs.unexpectedOverBudget === 0
    && sample.programEvents.length === 0
    && (!sample.presentedHolds
      || (sample.presentedHolds.gapsOver100 === 0 && sample.presentedHolds.heldDeltaMs <= 100))
    && !(Number(hostLoad.busyPct) >= 70)
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
      frameBudgetMs: sample.frameBudgetMs,
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
    hostLoad,
    systemProfile: sample.systemProfile,
    frameMs: sample.frameMs,
    presented: sample.presented,
    presentedHolds: sample.presentedHolds,
    settleWait: sample.settleWait,
    settleQueue: sample.settleQueue || null,
    histogram: sample.histogram,
    spikes: sample.spikes.slice(0, 20),
    unexpectedSpikes: sample.unexpectedSpikes,
    programEvents: sample.programEvents,
    unresolvedProgramEvents: sample.unresolvedProgramEvents,
    topSpikeSources: sample.topSpikeSources,
    renderWarmup,
    diagnostics: sample.diagnostics,
    pageIssues: { errors: pageErrors, warnings: pageWarnings },
    failureEvidence: buildFailureEvidence({
      frameBudgetMs: sample.frameBudgetMs,
      frameMs: sample.frameMs,
      presented: sample.presented,
      presentedHolds: sample.presentedHolds,
      settleWait: sample.settleWait,
      settleQueue: sample.settleQueue,
      spikes: sample.spikes,
      topSpikeSources: sample.topSpikeSources,
      programEvents: sample.programEvents,
      pageErrors,
      hostLoad,
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
  return page.evaluate(({ warmupMs, durationMs, frameBudgetMs, pumpDuringSettle }) => new Promise((resolve) => {
    const started = performance.now();
    const frames = [];
    const spikes = [];
    let last = null;
    let sampleStart = null;
    let presentedHoldStart = null;
    const presentIntervals = [];
    let lastPresentFrame = 0;
    let settledAt = null;
    let finished = false;
    let watchdog = null;
    let settleWait = 'warmup';
    let rigidBatchWaitStartedAt = null;
    let warmupPumpStopped = false;
    let previousProgramCount = 0;
    let previousProgramKeys = new Set();
    const programEvents = [];
    const unresolvedProgramEvents = [];
    let settleQueue = null;
    let effectiveFrameBudgetMs = Number(frameBudgetMs) > 0 ? Number(frameBudgetMs) : 0;

    // The live presentation cap is the player's cadence. Resolve it once when sampling begins so a
    // dynamic-resolution or relief change later cannot move the goalposts mid-run.
    function resolveFrameBudgetMs() {
      if (effectiveFrameBudgetMs > 0) return effectiveFrameBudgetMs;
      const renderState = window.SF && window.SF.state && window.SF.state.render;
      const cap = Number(renderState && renderState.frameCap) || 0;
      const displayHz = Number(renderState && renderState.displayHz) || 60;
      const cadenceMs = cap > 0 ? 1000 / cap : 1000 / displayHz;
      effectiveFrameBudgetMs = Math.round(cadenceMs * 1.5 * 10) / 10;
      return effectiveFrameBudgetMs;
    }

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
      const budgetMs = resolveFrameBudgetMs();
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
        overBudget: frames.filter((value) => value > budgetMs).length,
        unexpectedOverBudget: unexpectedSpikes.length,
        schedulerOnlyOverBudget: spikes.length - unexpectedSpikes.length,
        over40: frames.filter((value) => value > 40).length,
        over50: frames.filter((value) => value > 50).length,
      };
      const diagnostics = readDiagnostics();
      settleQueue = settleQueue || authoredQueueSnapshot();
      const lane = window.SF?.simLaneDiag?.() || null;
      const systemProfile = lane?.workerSystemProfile
        ? {
          step: lane.workerSystemProfile.step,
          ticksMeasured: lane.workerSystemProfile.ticksMeasured,
          skippedTicks: lane.workerSystemProfile.skippedTicks,
          totalMeasuredMs: lane.workerSystemProfile.totalMeasuredMs,
          topLevelMeasuredMs: lane.workerSystemProfile.topLevelMeasuredMs,
          systems: Array.isArray(lane.workerSystemProfile.systems)
            ? lane.workerSystemProfile.systems.slice(0, 20) : [],
        }
        : null;
      const sortedPresents = presentIntervals.slice().sort((a, b) => a - b);
      const presented = {
        samples: presentIntervals.length,
        p50: round(percentile(sortedPresents, 0.50)),
        p95: round(percentile(sortedPresents, 0.95)),
        max: round(sortedPresents.length ? sortedPresents[sortedPresents.length - 1] : 0),
        over40: presentIntervals.filter((value) => value > 40).length,
        over50: presentIntervals.filter((value) => value > 50).length,
        over66: presentIntervals.filter((value) => value > 66.7).length,
      };
      const presentedEnd = presentedHoldSnapshot();
      const episodesInSample = presentedEnd && Array.isArray(presentedEnd.episodes)
        ? presentedEnd.episodes.filter((episode) => Number(episode.atMs) >= sampleStart)
        : [];
      const maxEpisodeMs = episodesInSample.reduce((max, episode) => (
        Number(episode.heldMs) > max ? Number(episode.heldMs) : max), 0);
      const heldDelta = presentedHoldStart && presentedEnd
        ? Math.max(0, (presentedEnd.maxHeldMs || 0) - (presentedHoldStart.maxHeldMs || 0))
        : 0;
      const presentedHolds = presentedHoldStart && presentedEnd ? {
        gapsOver100: Math.max(0, (presentedEnd.gapsOver100 || 0) - (presentedHoldStart.gapsOver100 || 0)),
        heldDeltaMs: Math.max(maxEpisodeMs, heldDelta),
        episodes: episodesInSample.slice(-4),
      } : null;
      resolve({
        frameMs,
        frameBudgetMs: budgetMs,
        presented,
        presentedHolds,
        systemProfile,
        settleWait,
        settleQueue,
        programEvents,
        unresolvedProgramEvents,
        unexpectedSpikes: unexpectedSpikes.slice(0, 40),
        histogram: histogram(frames),
        spikes: spikes.sort((a, b) => b.ms - a.ms),
        topSpikeSources: topSpikeSources(diagnostics.perf),
        diagnostics,
      });
    }

    function stopWarmupPump() {
      if (warmupPumpStopped) return;
      warmupPumpStopped = true;
      try { if (window.SF) window.SF.bus.emit('mining:stop', {}); } catch (_) {}
    }

    function tick(now) {
      if (finished) return;
      if (sampleStart == null) {
        const elapsed = now - started;
        // Warm combat/mining GPU programs first, then STOP pumping and wait for the
        // authored-upgrade queue to drain. Pumping during the settle gate keeps
        // retargeting enemies, which re-admits authored jobs every 120ms, so
        // `running` never stays false and the check samples zero frames.
        if (elapsed < warmupMs) {
          pumpStress(now);
          settleWait = `stress-warmup:${Math.round(elapsed)}/${warmupMs}`;
          settledAt = null;
        } else {
          if (pumpDuringSettle) pumpStress(now);
          else stopWarmupPump();
          if (runtimeSettled()) {
            if (settledAt == null) settledAt = now;
            // WarmupMs is the stress-pump window. After that pump stops, a short idle
            // is enough to prove admission drained. Requiring another full warmupMs of
            // idle races the watchdog and samples nothing.
            const stableMs = Math.min(1000, warmupMs);
            const stableWarmupMs = now - settledAt;
            if (stableWarmupMs < stableMs) {
              settleWait = `post-settle-warmup:${Math.round(stableWarmupMs)}/${stableMs}`;
            } else {
              const stress = window.__SF_HITCH_STRESS__;
              if (stress) stress.nextBurstAt = now + 120;
              sampleStart = now;
              presentedHoldStart = presentedHoldSnapshot();
              lastPresentFrame = Number(window.SF?.state?.render?.renderer?.info?.render?.frame) || 0;
              resolveFrameBudgetMs();
              last = now;
              resetRuntimeProbes();
              watchdog = setTimeout(finish, durationMs + 1000);
            }
          } else {
            settledAt = null;
            settleQueue = authoredQueueSnapshot();
          }
        }
      } else {
        pumpStress(now);
        monitorPrograms(now);
        // Acceptance is the PRESENTED cadence, not callback cadence. A 30 fps cap still runs a
        // 60 Hz rAF; a callback miss is only a hitch if the present interval grew. lastPresentDtMs
        // is stamped per presented frame, so record one sample per render frame.
        const presentFrame = Number(window.SF?.state?.render?.renderer?.info?.render?.frame);
        if (Number.isFinite(presentFrame) && presentFrame > lastPresentFrame) {
          lastPresentFrame = presentFrame;
          const presentMs = Number(window.SF?.state?.render?.lastPresentDtMs);
          if (Number.isFinite(presentMs) && presentMs > 0 && presentMs < 2000) {
            presentIntervals.push(presentMs);
          }
        }
        const dt = now - last;
        frames.push(dt);
        if (dt > resolveFrameBudgetMs()) {
          const perf = window.__SPACEFACE_PERF__?.getReport?.() || {};
          const phases = perf.phases || {};
          const renderState = window.SF?.state?.render || null;
          const upgrade = renderState?.scene?.userData?.authoredUpgradeDiagnostics || null;
          const callbackMs = Number(perf.frameCallback?.last);
          const lastJob = Array.isArray(upgrade?.jobs) ? upgrade.jobs.at(-1) || null : null;
          // Snapshot the job at spike time: the live object keeps mutating (endedAtMs/phases land
          // later), so serializing it at finish made a just-ended job look recent.
          const lastJobSnapshot = lastJob ? {
            ...lastJob,
            phases: lastJob.phases && typeof lastJob.phases === 'object'
              ? { ...lastJob.phases } : null,
          } : null;
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
          else if (callbackMs > resolveFrameBudgetMs()) attribution.push('game-callback-over-budget');
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
              lastJob: lastJobSnapshot,
              lastPartLoad,
            } : null,
            recentResources,
            // App-owned means the measured callback itself exceeded the frame budget. An active
            // authored job or a nearby resource fetch is a correlate, not proof that this frame's
            // 44 ms gap came from our code; scheduler-only frames stay in their own bucket.
            unexpected: Number.isFinite(callbackMs) && callbackMs > resolveFrameBudgetMs(),
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

    watchdog = setTimeout(finish, warmupMs + warmupMs + durationMs + 30000);
    requestAnimationFrame(tick);

    function presentedHoldSnapshot() {
      try {
        const d = window.SF?.loop?.getDiagnostics?.() || {};
        return {
          gapsOver100: Number(d.presentedGapsOver100) || 0,
          maxHeldMs: Number(d.maxHeldPresentMs) || 0,
          episodes: Array.isArray(d.heldPresentEpisodes) ? d.heldPresentEpisodes.slice() : [],
        };
      } catch (_) { return null; }
    }

    function authoredQueueSnapshot() {
      const scene = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.scene;
      let queue = { pending: 0, running: false };
      try {
        const queueStats = window.__SF_GET_AUTHORED_UPGRADE_QUEUE_STATS__;
        if (typeof queueStats === 'function') queue = queueStats(scene) || queue;
      } catch (_) {}
      const diag = scene && scene.userData && scene.userData.authoredUpgradeDiagnostics || {};
      const lastJob = Array.isArray(diag.jobs) && diag.jobs.length ? diag.jobs[diag.jobs.length - 1] : null;
      return {
        pending: Number(queue.pending) || 0,
        running: !!queue.running,
        activeJobs: Number(diag.activeJobs) || 0,
        lastJobKey: lastJob && lastJob.key || null,
        lastJobStatus: lastJob && lastJob.status || null,
      };
    }

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
      // A disposal is not a shader link. Only additions are "new GPU programs during sample";
      // recording drops as events made a healthy batch/root retirement look like a hitch.
      previousProgramCount = programs.length;
      previousProgramKeys = new Set(keys);
      if (addedKeys.length === 0) return;
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
            // A program link is only actionable if the artifact names the family that paid it.
            // The object name is usually empty, so record the ancestor chain that carries the
            // owner's qualifier (SF_<family> / entity root) and the material's own name.
            const chain = [];
            for (let node = object; node && chain.length < 6; node = node.parent) {
              chain.push(node.name || node.type || '?');
            }
            const idMatch = /^Asteroid_(\d+)$/.exec(object.name || '');
            const ownerEntity = idMatch && state?.entities?.get
              ? state.entities.get(Number(idMatch[1])) : null;
            owners.push({
              object: object.name || object.type,
              objectType: object.type,
              parentChain: chain.slice(1),
              entityTypeId: ownerEntity?.data?.typeId || null,
              entityType: ownerEntity?.type || null,
              material: material.name || material.type,
              materialType: material.type,
              materialUuid: material.uuid || null,
              materialUserData: material.userData && typeof material.userData === 'object'
                ? {
                  role: material.userData.spacefaceSharedMaterialRole || null,
                  family: material.userData.spacefaceProgramFamily || null,
                  abi: material.userData.spacefaceMaterialAbiVersion || null,
                  illustrated: material.userData.spacefaceIllustratedSurface === true,
                } : null,
              geometry: object.geometry?.name || null,
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
      if (owners.length === 0) {
        // A cache entry with no live owner is not a draw hitch, but dropping it entirely hides
        // recompiles that the program-count diff did see. Keep it as separate audit evidence.
        if (unresolvedProgramEvents.length < 8) {
          unresolvedProgramEvents.push({
            atMs: round(sampleStart == null ? 0 : now - sampleStart),
            count: programs.length,
            addedKeys,
          });
        }
        return;
      }
      programEvents.push({
        atMs: round(sampleStart == null ? 0 : now - sampleStart),
        count: programs.length,
        addedKeys,
        owners,
      });
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
      // The retained rigid batch is part of the render structure: its first activation links a
      // program. Let it become active before sampling instead of counting the warm-up link as a
      // post-warmup hitch.
      const rigidBatch = state.render && state.render.rigidOpaqueBatch;
      if (rigidBatch && (rigidBatch.status === 'preparing' || rigidBatch.status === 'settling')) {
        if (rigidBatchWaitStartedAt == null) rigidBatchWaitStartedAt = performance.now();
        if (performance.now() - rigidBatchWaitStartedAt < 12000) {
          settleWait = `rigid-batch:${rigidBatch.status}`;
          return false;
        }
      } else {
        rigidBatchWaitStartedAt = null;
      }
      let queue = { pending: 0, running: false };
      let activeAdmissions = 0;
      try {
        const scene = state.render && state.render.scene;
        const queueStats = window.__SF_GET_AUTHORED_UPGRADE_QUEUE_STATS__;
        if (typeof queueStats === 'function') {
          queue = queueStats(scene) || queue;
        }
        // The queue can report idle while a job is still inside its compose/compile/commit legs.
        // Sampling then starts inside a known main-thread admission — the artifact then blames the
        // first frame's gap on "external scheduling". Wait for the job itself, not just the queue.
        activeAdmissions = Number(scene?.userData?.authoredUpgradeDiagnostics?.activeJobs) || 0;
        if (queue.pending > 0 || queue.running || activeAdmissions > 0) {
          settleWait = `authored-queue:${queue.pending}:${queue.running ? 1 : 0}:${activeAdmissions}`;
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
        if (!entity.mesh) {
          const admissionBusy = meshQueueRemaining > 0
            || !!render._meshReconcileDirty
            || queue.pending > 0
            || queue.running
            || activeAdmissions > 0;
          if (admissionBusy) {
            settleWait = `mesh-missing:${entity.type || 'unknown'}:${entity.id}`;
            return false;
          }
          continue;
        }
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

function readCpuTimes() {
  try {
    const list = cpus();
    if (!Array.isArray(list) || list.length === 0) return { logicalCpus: 0, idle: 0, total: 0 };
    let idle = 0;
    let total = 0;
    for (const cpu of list) {
      const times = cpu && cpu.times ? cpu.times : {};
      const busy = (times.user || 0) + (times.nice || 0) + (times.sys || 0) + (times.irq || 0);
      idle += times.idle || 0;
      total += busy + (times.idle || 0);
    }
    return { logicalCpus: list.length, idle, total };
  } catch (_) {
    return { logicalCpus: 0, idle: 0, total: 0 };
  }
}

function summarizeHostLoad(start) {
  const end = readCpuTimes();
  const idleDelta = end.idle - (start?.idle || 0);
  const totalDelta = end.total - (start?.total || 0);
  const measured = start?.logicalCpus > 0 && end.logicalCpus === start.logicalCpus && totalDelta > 0;
  return {
    available: measured,
    busyPct: measured ? Math.round(1000 * (1 - idleDelta / totalDelta)) / 10 : null,
    logicalCpus: end.logicalCpus,
  };
}

function printReport(report) {
  console.log(`[hitch-budget] scenario=${report.scenario.baseScenario} enemies=${report.scenario.enemies} asteroids=${report.scenario.asteroids}`);
  console.log(`[hitch-budget] frames=${report.frameMs.samples} avg=${report.frameMs.avg}ms p95=${report.frameMs.p95}ms p99=${report.frameMs.p99}ms worst=${report.frameMs.max}ms`);
  console.log(`[hitch-budget] settle=${report.settleWait}`);
  console.log(`[hitch-budget] host busy=${report.hostLoad?.busyPct != null ? `${report.hostLoad.busyPct}%` : 'n/a'} (contended at >=70%)`);
  if (report.presentedHolds) {
    console.log(`[hitch-budget] presented gaps>=100ms=${report.presentedHolds.gapsOver100}`
      + ` maxRepeatedMomentHold=${Math.round(report.presentedHolds.heldDeltaMs)}ms`);
  }
  if (report.systemProfile?.step) {
    const step = report.systemProfile.step;
    console.log(`[hitch-budget] worker step ms: p50=${step.p50} p95=${step.p95} p99=${step.p99}`
      + ` max=${step.max} last=${step.lastMs}`);
    for (const row of (report.systemProfile.systems || []).slice(0, 10)) {
      console.log(`  ${String(row.id).padEnd(34)} share=${(row.share * 100).toFixed(1)}%`
        + ` perTick=${row.meanMsPerTick}ms p95=${row.p95}ms calls=${row.calls}`);
    }
  }
  if (report.settleQueue) {
    console.log(`[hitch-budget] settleQueue pending=${report.settleQueue.pending} running=${report.settleQueue.running} activeJobs=${report.settleQueue.activeJobs} last=${report.settleQueue.lastJobKey || '-'} ${report.settleQueue.lastJobStatus || ''}`);
  }
  console.log(`[hitch-budget] >${report.runner.frameBudgetMs}ms=${report.frameMs.overBudget} unexpected=${report.frameMs.unexpectedOverBudget} scheduler-only=${report.frameMs.schedulerOnlyOverBudget} >40ms=${report.frameMs.over40} >50ms=${report.frameMs.over50}`);
  if (report.programEvents.length) {
    console.log('[hitch-budget] new GPU programs during sample:');
    for (const event of report.programEvents) {
      const owners = event.owners.map((owner) => `${owner.object}/${owner.material}`).join(', ') || 'unresolved';
      console.log(`  +${event.atMs}ms programs=${event.count} owners=${owners}`);
    }
  }
  if (report.unresolvedProgramEvents?.length) {
    console.log(`[hitch-budget] unresolved program additions (no live owner): ${report.unresolvedProgramEvents.length}`);
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
  frameBudgetMs, frameMs, presented, presentedHolds, settleWait, settleQueue, spikes,
  topSpikeSources, programEvents, pageErrors, hostLoad, out,
}) {
  const reasons = [];
  if (settleWait !== 'settled') {
    const queueNote = settleQueue
      ? ` (pending=${settleQueue.pending} running=${settleQueue.running} activeJobs=${settleQueue.activeJobs})`
      : '';
    reasons.push(`runtime did not settle before sampling: ${settleWait}${queueNote}`);
  }
  if (frameMs.samples === 0) reasons.push('no post-warmup frames were sampled');
  if (!presented || presented.samples === 0) {
    reasons.push('no presented frames were recorded; the cadence claim is unmeasured');
  } else if (presented.p95 > 40) {
    reasons.push(`presented p95 ${presented.p95} ms exceeded the 30 fps cadence bar (40 ms)`);
  }
  if (frameMs.unexpectedOverBudget > 0) {
    reasons.push(`${frameMs.unexpectedOverBudget} application-owned post-warmup frames exceeded ${frameBudgetMs} ms`);
  }
  if (presentedHolds && presentedHolds.gapsOver100 > 0) {
    reasons.push(`${presentedHolds.gapsOver100} presented gap(s) of >=100 ms occurred during the sample`);
  }
  if (presentedHolds && presentedHolds.heldDeltaMs > 100) {
    reasons.push(`the presented world repeated a moment for ${Math.round(presentedHolds.heldDeltaMs)} ms`);
  }
  if (programEvents.length > 0) reasons.push(`${programEvents.length} new GPU program events appeared after warm-up`);
  if (Number(hostLoad?.busyPct) >= 70) {
    reasons.push(`host CPU was ${hostLoad.busyPct}% busy during the sample — not a valid acceptance window`);
  }
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
  const child = spawn(process.execPath, ['server.js', String(port)], { env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
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
  // E2 per-system worker profile on the same run. The lane reads this at init; without it the
  // step cost is a single number with no owner and the next edit is a guess.
  u.searchParams.set('simProfile', '1');
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
