#!/usr/bin/env node
// Headed Electron runtime witness: fly a few seconds and write what actually happened.
// Agents should read .devshots/runtime-witness/report.md instead of guessing from source.
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
import { classifyRuntimeWitness, formatRuntimeWitnessReport } from '../src/core/runtimeWitness.js';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'runtime-witness');
const SAMPLE_MS = Number(process.env.SPACEFACE_WITNESS_MS || 20_000);
const SAMPLE_EVERY_MS = 500;
const FIXED_SEED = 47;

await mkdir(OUT, { recursive: true });

const logs = [];
const consoleHits = [];
const pageErrors = [];
const snapshots = [];
const canvasFrames = [];
let censusInstrumentation = null;

function log(line) {
  const text = `[${new Date().toISOString()}] ${line}`;
  logs.push(text);
  console.log(text);
}

const TABLE_CENSUS_FIELDS = Object.freeze([
  'glass',
  'runway',
  'beyond',
  'submitted',
  'resident',
  'landmarks',
]);

function summarizeTableCensus(samples) {
  const rows = samples
    .map((sample) => sample && sample.tableCensus)
    .filter((row) => row && row.available === true);
  if (rows.length === 0) return { available: false, sampleCount: 0 };
  const ranges = {};
  for (const field of TABLE_CENSUS_FIELDS) {
    const values = rows.map((row) => Number(row[field])).filter(Number.isFinite);
    ranges[field] = values.length > 0
      ? { min: Math.min(...values), max: Math.max(...values) }
      : { min: null, max: null };
  }
  return {
    available: true,
    sampleCount: rows.length,
    first: rows[0],
    last: rows[rows.length - 1],
    ranges,
  };
}

function formatTableCensusSection(summary, route) {
  const lines = [
    '',
    '## Tabletop census (PQ-129.01)',
    `- route: New Game seed ${route.seed}, held thrust, ${route.sampleMs} ms at ${route.sampleEveryMs} ms cadence`,
    `- sim delta: ${route.simDelta.toFixed(2)} s; executed-frame delta: ${route.executedFrameDelta}`,
    `- bounded instrumentation: renderWork ${route.instrumentation?.previousRenderWorkEnabled === true ? 'already on' : 'enabled for this probe only'}; prior state restored before shutdown: ${route.instrumentation?.restored === true}`,
  ];
  if (!summary.available) {
    lines.push('- census unavailable: the live renderer did not publish a probe-gated table sample');
    return lines.join('\n');
  }
  const last = summary.last;
  lines.push(
    `- last population: glass ${last.glass}, runway ${last.runway}, beyond ${last.beyond}, submitted ${last.submitted}, resident ${last.resident}, landmarks ${last.landmarks}`,
    `- policy envelope: glass half-extents ${last.glassHalfX} x ${last.glassHalfZ} WU; runway ${last.runwayWu} WU`,
    `- observed ranges: ${TABLE_CENSUS_FIELDS.map((field) => `${field} ${summary.ranges[field].min}–${summary.ranges[field].max}`).join('; ')}`,
    '- submitted is the tabletop policy population (glass + runway + forced roots), not WebGL draw calls.',
  );
  return lines.join('\n');
}

function readWitnessInPage() {
  const witness = window.__SF_WITNESS__;
  const s = window.SF?.state;
  let sample = null;
  if (witness && typeof witness.snapshot === 'function') sample = witness.snapshot();
  const d = window.SF?.loop?.getDiagnostics?.() || {};
  const p = s?.entities?.get?.(s.playerId);
  const info = s?.render?.renderer?.info?.render || null;
  if (!sample) sample = {
    wallMs: Date.now(),
    mode: s?.mode || null,
    simTime: Number(s?.simTime) || 0,
    tick: Number(s?.tick) || 0,
    timeScale: Number(s?.timeScale) || 0,
    hasPos: !!(p?.pos),
    posX: Number(p?.pos?.x) || 0,
    posZ: Number(p?.pos?.z) || 0,
    speed: p?.vel ? Math.hypot(Number(p.vel.x) || 0, Number(p.vel.z) || 0) : 0,
    lifecycle: window.SF?.loop?.getLifecycleState?.() || d.lifecycleState || null,
    suspended: window.SF?.loop?.isSuspended?.() === true,
    documentHidden: document.hidden === true,
    executedFrames: d.executedFrames || 0,
    renderUpdates: d.renderUpdates || 0,
    rendererFrame: Number(info?.frame),
    rendererFrameObserved: Number.isFinite(Number(info?.frame)),
    drawCalls: Number(info?.calls) || 0,
    contextLost: s?.render?.contextLost === true,
    lastFrameError: d.lastFrameError || null,
    frameErrorCount: d.frameErrorCount || 0,
    hitch: false,
    costs: [],
  };
  const table = s?.render?.entityViewSync || null;
  const landmarkCount = Array.isArray(s?.entityList)
    ? s.entityList.reduce((count, entity) => (
      entity
        && entity.alive !== false
        && (entity.type === 'station' || entity.type === 'planet' || entity.type === 'fx')
        ? count + 1
        : count
    ), 0)
    : null;
  const numberOrNull = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  sample.tableCensus = {
    available: !!table
      && Number.isFinite(Number(table.tableGlass))
      && Number.isFinite(Number(table.tableRunway))
      && Number.isFinite(Number(table.tableBeyond)),
    glass: numberOrNull(table?.tableGlass),
    runway: numberOrNull(table?.tableRunway),
    beyond: numberOrNull(table?.tableBeyond),
    submitted: numberOrNull(table?.tableSubmitted),
    resident: numberOrNull(table?.tableResident),
    landmarks: numberOrNull(table?.tableLandmarks ?? landmarkCount),
    glassHalfX: numberOrNull(table?.glassHalfX),
    glassHalfZ: numberOrNull(table?.glassHalfZ),
    runwayWu: numberOrNull(table?.runwayWu),
    renderWorkEnabled: s?.perfRuntime?.renderWorkEnabled === true,
    hitchAttributionEnabled: s?.perfRuntime?.hitchAttributionEnabled === true,
  };
  return sample;
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

async function dismissCinematic(targetPage) {
  const splash = targetPage.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await targetPage.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  }
}

async function launchUntilFlight(targetPage, timeoutMs = 120_000) {
  await targetPage.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await targetPage.evaluate(readWitnessInPage).catch((error) => ({ dumpError: String(error) }));
    if (status.mode === 'flight') return status;
    if (status.mode === 'loading') log(`loading sim=${status.simTime} frames=${status.executedFrames}`);
    await targetPage.waitForTimeout(1000);
  }
  throw new Error('New Game never entered flight');
}

let app = null;
let childProcess = null;
let page = null;
let launch = null;
let processMonitor = null;
let canonicalUrlTracker = null;
let rootUrl = null;
let primaryError = null;
let cleanupReport = null;
let cleanupError = null;
let gpu = null;

try {
  const { _electron: electron } = await loadPlaywright();
  launch = createIsolatedElectronLaunch({
    root: ROOT,
    taskId: 'runtime-witness',
    timeout: 180_000,
    baseEnv: {
      ...process.env,
      SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1',
    },
  });
  log('launching isolated Electron');
  app = await electron.launch(launch.options);
  childProcess = app.process();
  processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
  page = await app.firstWindow({ timeout: 180_000 });
  installCspSafePlaywrightPolling(page);
  const urlDeadline = Date.now() + 20_000;
  while (Date.now() < urlDeadline) {
    const liveUrl = page.url();
    if (liveUrl === 'about:blank' || /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(liveUrl)) break;
    await page.waitForTimeout(75);
  }
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  rootUrl = assertIsolatedElectronRootUrl(
    await canonicalUrlTracker.waitForCanonicalRoot(20_000),
  );
  page.on('console', (msg) => {
    const text = msg.text();
    if (
      msg.type() === 'error'
      || /\[loop\]|context lost|frame error|WebGL|GPU/i.test(text)
    ) {
      consoleHits.push(`[console.${msg.type()}] ${text}`);
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err && err.stack || err));
  });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.waitForLoadState('domcontentloaded', { timeout: 180_000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 90_000 });
  await dismissCinematic(page);
  gpu = await page.evaluate(() => window.SF?.state?.render?.gpu
    ? { renderer: window.SF.state.render.gpu.renderer, tier: window.SF.state.render.gpu.tier }
    : null);

  log('new game');
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await page.fill('#sf-ng-seed', String(FIXED_SEED));
  const entered = await launchUntilFlight(page);
  log(`entered flight ${JSON.stringify({ mode: entered.mode, simTime: entered.simTime })}`);

  censusInstrumentation = await page.evaluate(() => {
    const perf = window.SF?.state?.perfRuntime;
    const previousRenderWorkEnabled = perf?.renderWorkEnabled === true;
    const available = typeof perf?.setRenderWorkEnabled === 'function';
    if (available) perf.setRenderWorkEnabled(true);
    return {
      available,
      previousRenderWorkEnabled,
      renderWorkEnabled: perf?.renderWorkEnabled === true,
    };
  });
  if (censusInstrumentation?.renderWorkEnabled !== true) {
    throw new Error('Runtime witness could not enable the bounded tabletop census gate');
  }
  await page.waitForTimeout(250);

  await page.locator('#gl-canvas').click({ timeout: 10_000 }).catch(() => {});
  await page.keyboard.down('KeyW');
  const started = Date.now();
  let shotIndex = 0;
  while (Date.now() - started < SAMPLE_MS) {
    const elapsedMs = Date.now() - started;
    const row = await page.evaluate(readWitnessInPage).catch((error) => ({
      wallMs: Date.now(),
      evaluateError: String(error && error.message || error),
    }));
    row.elapsedMs = elapsedMs;
    snapshots.push(row);
    if (elapsedMs >= shotIndex * (SAMPLE_MS / 2)) {
      const shotPath = path.join(OUT, `t${String(shotIndex).padStart(2, '0')}.png`);
      await captureCanvasFrame(page, shotPath, elapsedMs).catch((err) => log(`screenshot failed: ${err}`));
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
} finally {
  await page?.keyboard.up('KeyW').catch(() => {});
  if (page && censusInstrumentation?.available === true) {
    const restoredState = await page.evaluate((previousRenderWorkEnabled) => {
      const perf = window.SF?.state?.perfRuntime;
      perf?.setRenderWorkEnabled?.(previousRenderWorkEnabled === true);
      return perf?.renderWorkEnabled === true;
    }, censusInstrumentation.previousRenderWorkEnabled).catch(() => null);
    censusInstrumentation.restored = restoredState === censusInstrumentation.previousRenderWorkEnabled;
  }
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
      if (cleanupReport?.pass !== true) {
        cleanupError = new Error(`Electron cleanup failed: ${(cleanupReport?.failures || []).join('; ')}`);
      }
    } catch (error) {
      cleanupError = error;
    }
  }
  if (launch && typeof launch.cleanup === 'function' && cleanupReport?.pass === true) {
    try { launch.cleanup({ runtimeClosed: true }); } catch (error) { cleanupError = error; }
  }
}

const moving = snapshots.filter((row) => !row.evaluateError);
const canvasHashes = canvasFrames.map((frame) => frame.hash);
const verdict = classifyRuntimeWitness(moving, { canvasHashes });
const tableCensus = summarizeTableCensus(moving);
const firstMoving = moving[0] || null;
const lastMoving = moving[moving.length - 1] || null;
const route = {
  seed: FIXED_SEED,
  sampleMs: SAMPLE_MS,
  sampleEveryMs: SAMPLE_EVERY_MS,
  simDelta: (Number(lastMoving?.simTime) || 0) - (Number(firstMoving?.simTime) || 0),
  executedFrameDelta: (Number(lastMoving?.executedFrames) || 0) - (Number(firstMoving?.executedFrames) || 0),
  instrumentation: censusInstrumentation,
};
const markdown = `${formatRuntimeWitnessReport({
  verdict,
  samples: moving,
  canvasHashes,
  consoleHits,
  pageErrors,
  gpu,
})}${formatTableCensusSection(tableCensus, route)}\n`;
const report = {
  schema: 'spaceface.runtimeWitness.probe.v1',
  verdict,
  sampleCount: snapshots.length,
  first: snapshots[0] || null,
  last: snapshots[snapshots.length - 1] || null,
  canvasFrames,
  pageErrors,
  consoleHits,
  logs,
  gpu,
  route,
  tableCensus,
  error: primaryError ? String(primaryError && primaryError.stack || primaryError) : null,
  cleanupError: cleanupError ? String(cleanupError && cleanupError.stack || cleanupError) : null,
};
await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
await writeFile(path.join(OUT, 'report.md'), markdown);
log(markdown);
log(`report ${path.join(OUT, 'report.md')}`);

if (primaryError || cleanupError) process.exitCode = 1;
else if (verdict.ok !== true) process.exitCode = 2;
