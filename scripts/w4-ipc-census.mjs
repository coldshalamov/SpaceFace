#!/usr/bin/env node
// W4 lane probe: measured IPC call census for the Electron shell.
// Launches the game under scripts/w4-ipc-census-main.cjs (which wraps ipcMain and every
// WebContents send surface before electron/main.cjs loads), flies the real game for a
// settle window, fires real lifecycle events (minimize/restore), benchmarks the preload
// bridge invoke round-trip from inside the page, then writes design/perf/w4-electron-ipc-census.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createIsolatedElectronLaunch } from './lib/electronTestIsolation.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';
import { provisionElectronRuntime } from './lib/electronRuntimeProvisioning.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPORT_PATH = path.join(ROOT, 'design', 'perf', 'w4-electron-ipc-census.json');
const CENSUS_MAIN = path.join(ROOT, 'scripts', 'w4-ipc-census-main.cjs');
const FLIGHT_TIMEOUT_MS = Number(process.env.SF_W4_IPC_FLIGHT_TIMEOUT_MS) || 120000;
const SETTLE_MS = Number(process.env.SF_W4_IPC_SETTLE_MS) || 8000;
const BENCH_ITERS = Number(process.env.SF_W4_IPC_BENCH_ITERS) || 400;

provisionElectronRuntime({ root: ROOT });
const { _electron: electron } = await loadPlaywright();

let app = null;
let isolatedLaunch = null;
let failures = [];
const censusSnapshots = {};

const readCensus = async (label) => {
  const snap = await app.evaluate(() => globalThis.__w4IpcCensus || null);
  censusSnapshots[label] = snap;
  return snap;
};

try {
  isolatedLaunch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'w4-ipc-census' });
  const options = { ...isolatedLaunch.options, args: [CENSUS_MAIN] };
  app = await electron.launch(options);

  const page = await app.firstWindow({ timeout: 90000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 90000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 90000 });

  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 10_000 });
  }
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: FLIGHT_TIMEOUT_MS });

  // Real flight frames: the presentation loop runs at display cadence here.
  await page.waitForTimeout(SETTLE_MS);
  await readCensus('after-flight-settle');

  // Fire real main->renderer lifecycle sends (hide/minimize/show/restore/focus/blur).
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.minimize(); });
  await page.waitForTimeout(400);
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.restore(); w?.focus(); });
  await page.waitForTimeout(400);
  await readCensus('after-lifecycle-events');

  // Preload-bridge invoke cost, measured from inside the real page (main world).
  const bridgeBench = await page.evaluate(async (iters) => {
    const out = { iters };
    const shell = window.spacefaceShell || null;
    if (!shell) { out.error = 'window.spacefaceShell missing'; return out; }
    const time = async (fn) => {
      for (let i = 0; i < 25; i++) await fn(); // warm both JIT and IPC path
      const t0 = performance.now();
      for (let i = 0; i < iters; i++) await fn();
      return (performance.now() - t0) / iters;
    };
    out.invokePerfMetricsMs = await time(() => shell.perfMetrics());
    out.invokeBuildInfoMs = await time(() => shell.buildInfo());
    const localApi = { f: async () => ({ ok: true }) };
    out.baselineAsyncCallMs = await time(() => localApi.f());
    const payload = { pid: 1, type: 'renderer', cpuPercent: 0.4, workingSetKiB: 123456 };
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) structuredClone([payload, payload, payload]);
    out.baselineStructuredCloneMs = (performance.now() - t0) / iters;
    return out;
  }, BENCH_ITERS);

  await readCensus('after-bridge-bench');

  const report = {
    schema: 'spaceface.w4IpcCensus.v1',
    generatedAt: new Date().toISOString(),
    electron: await app.evaluate(() => process.versions.electron),
    chrome: await app.evaluate(() => process.versions.chrome),
    settleMs: SETTLE_MS,
    bridgeBench,
    census: censusSnapshots,
    failures,
  };
  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(`[w4-ipc-census] wrote ${REPORT_PATH}`);
  console.log(JSON.stringify({ bridgeBench, census: censusSnapshots['after-bridge-bench'] }, null, 2));
} catch (error) {
  failures.push(String(error && error.stack || error));
  console.error('[w4-ipc-census] failed:', error);
  process.exitCode = 1;
} finally {
  if (app) { try { await app.close(); } catch {} }
  if (isolatedLaunch) isolatedLaunch.cleanup({ runtimeClosed: true });
}
