#!/usr/bin/env node
// Headed Electron Continue freeze diagnostic.
// Isolated path: New Game → F5 → reload → Continue. --player-profile uses the real Continue only.
// Samples sim/loop/GPU every 500ms and writes .devshots/continue-freeze/report.json.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { classifyContinueFreeze } from './lib/continueFreezeDiagnostics.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PLAYER_PROFILE = process.argv.includes('--player-profile');
const OUT = path.join(ROOT, '.devshots', 'continue-freeze', PLAYER_PROFILE ? 'player-profile' : 'isolated');
const SAMPLE_MS = 40_000;
const SAMPLE_EVERY_MS = 500;
const FIXED_SEED = 47;

await mkdir(OUT, { recursive: true });

const logs = [];
const consoleHits = [];
const pageErrors = [];
const snapshots = [];
const evaluateTimings = [];
const canvasFrames = [];

function log(line) {
  const text = `[${new Date().toISOString()}] ${line}`;
  logs.push(text);
  console.log(text);
}

async function captureCanvasFrame(targetPage, shotPath, elapsedMs) {
  await targetPage.locator('#gl-canvas').screenshot({
    path: shotPath,
    type: 'png',
    style: '#ui-root { visibility: hidden !important; }',
  });
  const hash = createHash('sha256').update(await readFile(shotPath)).digest('hex');
  canvasFrames.push({ elapsedMs, path: shotPath, hash });
  return hash;
}

function snapshotInPage() {
  const s = window.SF?.state;
  const loop = window.SF?.loop;
  const d = loop?.getDiagnostics?.() || null;
  const p = s?.entities?.get?.(s.playerId);
  const vel = p?.vel;
  const ranges = s?.render?.dynamicBufferRanges || null;
  const recovery = s?.render?.contextRecovery || null;
  const diagnosticProbe = s?.render?.diagnostics || null;
  const diagnosticReport = diagnosticProbe?.getReport?.() || null;
  const diag = diagnosticProbe?.info || diagnosticProbe;
  const liveRenderer = s?.render?.renderer || null;
  const rendererFrame = liveRenderer?.info?.render?.frame ?? null;
  const directContextLost = (() => {
    try {
      const gl = liveRenderer?.getContext?.();
      return gl && typeof gl.isContextLost === 'function' ? gl.isContextLost() === true : null;
    } catch (_) {
      return true;
    }
  })();
  const prewarm = (() => {
    try {
      return s?.render?.sectorBoundaryPrewarm?.inspect?.() || null;
    } catch (_) {
      return { inspectError: true };
    }
  })();
  const playerStatus = p?.mesh?.userData?.authoredAssetState || null;
  let authoredPending = 0;
  let authoredReady = 0;
  let shipCount = 0;
  const ships = Array.isArray(s?.entityList) ? s.entityList : [];
  for (const ship of ships) {
    if (ship?.type !== 'ship' || ship?.alive === false) continue;
    shipCount += 1;
    const st = ship?.mesh?.userData?.authoredAssetState || 'missing';
    if (st === 'authored' || st === 'authored-with-cleanup-error') authoredReady += 1;
    else authoredPending += 1;
  }
  return {
    wallMs: Date.now(),
    mode: s?.mode || null,
    simTime: Number(s?.simTime) || 0,
    tick: Number(s?.tick) || 0,
    timeScale: Number(s?.timeScale),
    timeEffectScale: window.SF?.timeEffects?.getEffectiveScale?.() ?? null,
    pos: p?.pos ? { x: Number(p.pos.x), z: Number(p.pos.z) } : null,
    posFinite: p?.pos ? Number.isFinite(p.pos.x) && Number.isFinite(p.pos.z) : null,
    speed: vel ? Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0) : null,
    hull: p?.hull ?? null,
    playerAuthored: playerStatus,
    shipCount,
    authoredReady,
    authoredPending,
    suspended: loop?.isSuspended?.() === true,
    lifecycle: loop?.getLifecycleState?.() || null,
    executedFrames: d?.executedFrames ?? null,
    requestedFrames: d?.requestedFrames ?? null,
    renderUpdates: d?.renderUpdates ?? null,
    rendererFrame,
    lastLifecycleReason: d?.lastLifecycleReason || null,
    visibilityState: d?.visibilityState || document.visibilityState || null,
    documentHidden: document.hidden === true,
    contextLost: directContextLost === true || recovery?.pending === true
      || !!recovery?.lastError || s?.render?.contextLost === true,
    directContextLost,
    contextLosses: recovery?.losses ?? null,
    contextRestores: recovery?.restores ?? null,
    dynamicInvalid: ranges?.invalid === true,
    dynamicLastError: ranges?.lastError || null,
    retiredOwners: ranges?.retiredOwners ?? null,
    postPath: diagnosticReport?.post?.activePath ?? null,
    renderGraphEnabled: s?.settings?.video?.renderGraph === true,
    drawCalls: diag?.drawCalls ?? diag?.calls ?? null,
    triangles: diag?.triangles ?? diag?.tris ?? null,
    // Pixel readback forces a synchronous GPU flush and produced false-stable results on ANGLE.
    // UI-hidden compositor screenshots below are the independent presentation observer.
    canvasSignature: null,
    prewarmActive: prewarm?.activeCount ?? prewarm?.active ?? null,
    prewarmPending: prewarm?.pendingCount ?? prewarm?.pending ?? null,
    pipelinePending: !!(s?.render?.pipelinePrecompileReady && typeof s.render.pipelinePrecompileReady.then === 'function'),
  };
}

async function dismissCinematic(targetPage) {
  const splash = targetPage.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await targetPage.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  }
}

async function focusElectronWindow(electronApp, targetPage) {
  try {
    const bw = await electronApp.browserWindow(targetPage);
    await bw.evaluate((win) => {
      win.show();
      win.focus();
      if (typeof win.moveTop === 'function') win.moveTop();
    });
  } catch (error) {
    log(`focus failed: ${error && error.message ? error.message : error}`);
  }
  await targetPage.bringToFront().catch(() => {});
}

function dumpReadinessInPage() {
  const s = window.SF?.state;
  const ready = window.SF?.authoredVisualReadiness?.() || null;
  const player = s?.entities?.get?.(s.playerId);
  const d = window.SF?.loop?.getDiagnostics?.() || null;
  const states = {};
  const list = Array.isArray(s?.entityList) ? s.entityList : [];
  for (const entity of list) {
    if (!entity || entity.alive === false) continue;
    const st = entity.mesh?.userData?.authoredAssetState || (entity.mesh ? 'mesh-no-state' : 'no-mesh');
    const key = `${entity.type}:${st}`;
    states[key] = (states[key] || 0) + 1;
  }
  return {
    mode: s?.mode || null,
    simTime: Number(s?.simTime) || 0,
    playerId: s?.playerId ?? null,
    entityCount: list.length,
    playerStatus: player?.mesh?.userData?.authoredAssetState || null,
    admission: player?.presentationAdmission || null,
    executedFrames: d?.executedFrames ?? null,
    lifecycle: window.SF?.loop?.getLifecycleState?.() || null,
    documentHidden: document.hidden === true,
    gpu: s?.render?.gpu ? { renderer: s.render.gpu.renderer, tier: s.render.gpu.tier } : null,
    states,
    readiness: ready && {
      pipelineReady: ready.pipelineReady,
      ready: ready.ready,
      playerStatus: ready.playerStatus,
      startingHubStatus: ready.startingHubStatus,
      startingHubRequired: ready.startingHubRequired,
      openingCount: Array.isArray(ready.openingAssets) ? ready.openingAssets.length : 0,
      openingPending: (ready.openingPending || []).slice(0, 12),
      openingPipelinePending: (ready.openingPipelinePending || []).slice(0, 12),
    },
  };
}

async function launchUntilFlight(targetPage, { attempts = 3, timeoutMs = 120_000 } = {}) {
  let lastDump = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    log(`launch attempt ${attempt}/${attempts}`);
    lastDump = null;
    await targetPage.evaluate(() => {
      window.__startFailed = null;
      const bus = window.SF?.bus;
      if (!bus?.on) return;
      const stop = bus.on('game:startFailed', (payload) => {
        window.__startFailed = payload || { failed: true };
        try { stop(); } catch (_) {}
      });
    });
    await targetPage.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
    const deadline = Date.now() + timeoutMs;
    let entered = false;
    let lastPulse = 0;
    while (Date.now() < deadline) {
      const status = await targetPage.evaluate(() => ({
        mode: window.SF?.state?.mode || null,
        hasPlayer: !!(window.SF?.state?.playerId && window.SF?.state?.entities?.get?.(window.SF.state.playerId)),
        startFailed: window.__startFailed || null,
      }));
      const now = Date.now();
      if (now - lastPulse >= 5000) {
        lastPulse = now;
        const pulse = await targetPage.evaluate(dumpReadinessInPage).catch((error) => ({ dumpError: String(error) }));
        log(`launch pulse ${JSON.stringify(pulse)}`);
      }
      if (status.mode === 'flight' && status.hasPlayer) {
        entered = true;
        break;
      }
      if (status.startFailed) {
        lastDump = await targetPage.evaluate(dumpReadinessInPage).catch((error) => ({ dumpError: String(error) }));
        log(`startFailed ${JSON.stringify({ payload: status.startFailed, dump: lastDump })}`);
        break;
      }
      await targetPage.waitForTimeout(250);
    }
    lastDump = lastDump || await targetPage.evaluate(dumpReadinessInPage).catch((error) => ({ dumpError: String(error) }));
    if (entered || lastDump?.mode === 'flight') {
      log(`entered flight ${JSON.stringify(lastDump)}`);
      return lastDump;
    }
    if (attempt === attempts) {
      throw new Error(`New Game never entered flight: ${JSON.stringify(lastDump)}`);
    }
    log('retrying Launch after start failure');
    await targetPage.waitForTimeout(1500);
  }
  return lastDump;
}

function createPlayerProfileElectronLaunch(timeout = 180_000) {
  const env = { ...process.env };
  for (const key of [
    'SPACEFACE_ELECTRON_TEST_MODE',
    'SPACEFACE_ELECTRON_TEST_PORT',
    'SPACEFACE_ELECTRON_TEST_USER_DATA',
    'SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION',
  ]) delete env[key];
  return {
    mode: 'player-profile',
    options: { args: ['.'], cwd: ROOT, timeout, env },
  };
}

function assertPlayerElectronRootUrl(actualUrl) {
  const url = new URL(actualUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '41788'
    || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error(`player Electron must use the canonical save origin, got ${url.href}`);
  }
  return url.href;
}

let app = null;
let childProcess = null;
let page = null;
let launch = null;
let processMonitor = null;
let canonicalUrlTracker = null;
let rootUrl = null;
let primaryError = null;
let continueLoadMs = null;
let cleanupReport = null;
let cleanupError = null;

try {
  const { _electron: electron } = await loadPlaywright();
  launch = PLAYER_PROFILE
    ? createPlayerProfileElectronLaunch()
    : createIsolatedElectronLaunch({
      root: ROOT,
      taskId: 'continue-freeze',
      timeout: 180_000,
      baseEnv: {
        ...process.env,
        SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1',
      },
    });
  log(`launching ${launch.mode} Electron`);
  app = await electron.launch(launch.options);
  childProcess = app.process();
  processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
  page = await app.firstWindow({ timeout: 180_000 });
  installCspSafePlaywrightPolling(page);
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  const observedRootUrl = await canonicalUrlTracker.waitForCanonicalRoot(20_000);
  rootUrl = PLAYER_PROFILE
    ? assertPlayerElectronRootUrl(observedRootUrl)
    : assertIsolatedElectronRootUrl(observedRootUrl);
  page.on('console', (msg) => {
    const text = msg.text();
    if (
      msg.type() === 'error'
      || /\[loop\]|context lost|dynamic buffer|frame error|save:|WebGL|GPU|authored visuals|SpaceFace|sector:enter|prewarm/i.test(text)
    ) {
      const line = `[console.${msg.type()}] ${text}`;
      consoleHits.push(line);
      logs.push(line);
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err && err.stack || err));
    log(`pageerror ${err && err.message ? err.message : err}`);
  });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.waitForLoadState('domcontentloaded', { timeout: 180_000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus && window.SF?.ctx, null, { timeout: 90_000 });
  await dismissCinematic(page);
  await focusElectronWindow(app, page);

  if (!PLAYER_PROFILE) {
    log('new game');
    await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
    await page.fill('#sf-ng-seed', String(FIXED_SEED));
    await launchUntilFlight(page);
    log('flight ready; F5 save');
    await page.keyboard.press('F5');
    await page.waitForFunction(() => !!localStorage.getItem('sf.save.quick'), null, { timeout: 30_000 });

    log('reload for cold Continue');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForFunction(() => window.SF?.state && window.SF?.bus && window.SF?.ctx, null, { timeout: 90_000 });
    await dismissCinematic(page);
  } else {
    log('using the canonical player save profile; no seed or save replacement');
  }
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor({ state: 'visible', timeout: 30_000 });
  log('continue');
  const continueStartedAt = Date.now();
  await continueButton.click();
  const continueDeadline = Date.now() + 180_000;
  let continueDump = null;
  while (Date.now() < continueDeadline) {
    continueDump = await page.evaluate(dumpReadinessInPage).catch((error) => ({ dumpError: String(error) }));
    log(`continue pulse ${JSON.stringify(continueDump)}`);
    if (continueDump?.mode === 'flight' && continueDump.playerId) break;
    await page.waitForTimeout(2000);
  }
  if (continueDump?.mode !== 'flight') {
    throw new Error(`Continue never entered flight: ${JSON.stringify(continueDump)}`);
  }
  continueLoadMs = Date.now() - continueStartedAt;
  log(`continue entered flight in ${continueLoadMs}ms`);
  log('continue flight ready; holding thrust and sampling 40s');

  await page.bringToFront();
  await page.locator('#gl-canvas').click({ timeout: 10_000 }).catch(() => {});
  await page.keyboard.down('KeyW');

  const started = Date.now();
  let shotIndex = 0;
  while (Date.now() - started < SAMPLE_MS) {
    const evalStarted = Date.now();
    let row = null;
    try {
      row = await page.evaluate(snapshotInPage);
    } catch (error) {
      row = {
        wallMs: Date.now(),
        evaluateError: String(error && error.message || error),
      };
      log(`evaluate failed at t=${Date.now() - started}ms: ${row.evaluateError}`);
    }
    const evalMs = Date.now() - evalStarted;
    evaluateTimings.push({ elapsedMs: Date.now() - started, evalMs });
    if (row) {
      row.elapsedMs = Date.now() - started;
      row.evalMs = evalMs;
      snapshots.push(row);
      if (snapshots.length === 1 || snapshots.length % 4 === 0 || evalMs > 1000) {
        log(`t=${row.elapsedMs}ms eval=${evalMs}ms sim=${Number(row.simTime).toFixed(2)} tick=${row.tick} frames=${row.executedFrames} renderUpdates=${row.renderUpdates} rendererFrame=${row.rendererFrame} canvas=${row.canvasSignature} susp=${row.suspended} hidden=${row.documentHidden} life=${row.lifecycle} spd=${Number(row.speed || 0).toFixed(1)} ts=${row.timeScale} lost=${row.contextLost}`);
      }
    }
    const elapsed = Date.now() - started;
    if (elapsed >= shotIndex * 10_000) {
      const shotPath = path.join(OUT, `t${String(shotIndex * 10).padStart(2, '0')}s.png`);
      await captureCanvasFrame(page, shotPath, elapsed)
        .catch((err) => log(`canvas screenshot failed: ${err}`));
      log(`screenshot ${shotPath}`);
      shotIndex += 1;
    }
    await page.waitForTimeout(SAMPLE_EVERY_MS);
  }
  await page.keyboard.up('KeyW').catch(() => {});
  const finalShot = path.join(OUT, 't-final.png');
  await captureCanvasFrame(page, finalShot, Date.now() - started).catch(() => {});
} catch (error) {
  primaryError = error;
  log(`probe failed: ${error && error.stack ? error.stack : error}`);
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(OUT, 'failure.png'), type: 'png' }).catch(() => {});
  }
} finally {
  await page?.keyboard.up('KeyW').catch(() => {});
  const verdict = classifyContinueFreeze(
    snapshots.filter((row) => !row.evaluateError),
    { canvasFrameHashes: canvasFrames.map((frame) => frame.hash) },
  );
  log(`verdict ${JSON.stringify(verdict)}`);
  if (app) {
    try {
      cleanupReport = await closeOwnedElectronRuntime({
        page,
        electronApp: app,
        childProcess,
        canonicalUrlTracker,
        processMonitor,
        rootUrl,
      });
      log(`cleanup pass=${cleanupReport?.pass} failures=${(cleanupReport?.failures || []).join('; ')}`);
      if (cleanupReport?.pass !== true) {
        cleanupError = new Error(`Electron cleanup failed: ${(cleanupReport?.failures || []).join('; ') || 'unknown failure'}`);
      }
    } catch (error) {
      cleanupError = error;
      log(`cleanup threw ${error}`);
    }
  }
  if (launch && typeof launch.cleanup === 'function' && cleanupReport?.pass === true) {
    try {
      launch.cleanup({ runtimeClosed: true });
    } catch (error) {
      cleanupError = error;
      log(`profile cleanup ${error}`);
    }
  }
  const report = {
    profile: launch?.mode || (PLAYER_PROFILE ? 'player-profile' : 'isolated-evidence'),
    continueLoadMs,
    verdict,
    sampleCount: snapshots.length,
    first: snapshots[0] || null,
    last: snapshots[snapshots.length - 1] || null,
    slowEvaluates: evaluateTimings.filter((row) => row.evalMs > 1000),
    snapshots,
    canvasFrames,
    pageErrors,
    consoleHits,
    logs,
    error: primaryError ? String(primaryError && primaryError.stack || primaryError) : null,
    cleanup: cleanupReport,
    cleanupError: cleanupError ? String(cleanupError && cleanupError.stack || cleanupError) : null,
    rootUrl,
  };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  log(`report ${path.join(OUT, 'report.json')}`);
}

if (primaryError || cleanupError) process.exitCode = 1;
if (!primaryError && !cleanupError) {
  const moving = snapshots.filter((row) => !row.evaluateError);
  const verdict = classifyContinueFreeze(moving, {
    canvasFrameHashes: canvasFrames.map((frame) => frame.hash),
  });
  if (verdict.frozen !== false || verdict.kind !== 'sim-body-and-canvas-moving') process.exitCode = 2;
}
