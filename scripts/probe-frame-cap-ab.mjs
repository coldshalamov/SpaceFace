#!/usr/bin/env node
// A/B runtime probe: baseline flight frames vs frameCap=30 and renderScale=0.6 on the live route.
// Reuses the witness launch harness; measures the game's own hitch classifier, not wall guesses.
import { writeFile, mkdir } from 'node:fs/promises';
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
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SAMPLE_MS = Number(process.env.SPACEFACE_AB_SAMPLE_MS || 12_000);
const SETTLE_MS = Number(process.env.SPACEFACE_AB_SETTLE_MS || 6_000);
const FIXED_SEED = 47;
const WHICH = process.env.SPACEFACE_AB_WHICH || 'both'; // 'cap' | 'scale' | 'both' | 'none'

async function waitUntilFlight(targetPage, timeoutMs = 180_000) {
  await targetPage.waitForFunction(() => {
    const state = window.SF?.state;
    return state?.mode === 'flight' && !!state.entities?.get?.(state.playerId)?.pos;
  }, null, { timeout: timeoutMs, polling: 250 });
}

async function armPerf(targetPage) {
  const ok = await targetPage.evaluate(() => {
    const perf = window.SF?.state?.perfRuntime;
    if (!perf) return false;
    perf.reset?.();
    perf.setRenderWorkEnabled?.(true);
    perf.setHitchAttributionEnabled?.(true);
    perf.setSystemTimingEnabled?.(true);
    perf.setSimAttributionEnabled?.(true);
    return typeof perf.getHitchHistogram === 'function';
  });
  if (!ok) throw new Error('perfRuntime instrumentation unavailable');
}

async function sample(targetPage, label) {
  await targetPage.evaluate(() => { window.SF?.state?.perfRuntime?.reset?.(); });
  const t0 = await targetPage.evaluate(() => performance.now());
  await targetPage.waitForTimeout(SAMPLE_MS);
  const end = await targetPage.evaluate(() => {
    const perf = window.SF?.state?.perfRuntime;
    const w = window.__SF_WITNESS__;
    const hist = perf?.getHitchHistogram?.() || null;
    const costs = {};
    for (const c of (w?.last?.costs || [])) costs[c.name] = { p95: c.p95, avg: c.avg, max: c.max };
    return {
      t: performance.now(),
      rendererFrame: w?.last?.rendererFrame ?? null,
      drawCalls: w?.last?.drawCalls ?? null,
      dynResScale: window.SF?.state?.render?.dynResScale ?? null,
      frameCap: window.SF?.state?.render?.frameCap ?? null,
      hist,
      costs,
    };
  });
  return { label, elapsedMs: end.t - t0, ...end };
}

async function applyVideo(targetPage, patch) {
  return targetPage.evaluate((p) => {
    const sf = window.SF;
    const video = sf?.state?.settings?.video;
    if (!sf?.bus || !video) return false;
    Object.assign(video, p);
    sf.bus.emit('settings:changed', { section: 'video', patch: { ...p } });
    return Object.entries(p).every(([k, v]) => video[k] === v);
  }, patch);
}

const { _electron: electron } = await loadPlaywright();
let app = null;
let childProcess = null;
let launch = null;
let processMonitor = null;
let canonicalUrlTracker = null;
let rootUrl = null;
let page = null;
const out = { startedAt: new Date().toISOString(), samples: [] };

try {
  launch = createIsolatedElectronLaunch({
    root: ROOT,
    taskId: 'frame-cap-ab',
    timeout: 180_000,
    baseEnv: { ...process.env, SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' },
  });
  console.log('launching isolated Electron');
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
  rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(20_000));

  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 90_000 });
  console.log('booted; new game');
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  const seedInput = page.locator('#sf-ng-seed');
  if (await seedInput.count()) await seedInput.fill(String(FIXED_SEED));
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await waitUntilFlight(page);
  console.log('in flight; settling');
  await page.waitForTimeout(SETTLE_MS);
  await armPerf(page);

  out.samples.push(await sample(page, 'baseline'));

  if (WHICH === 'cap' || WHICH === 'both') {
    const ok = await applyVideo(page, { frameCap: 30 });
    console.log('frameCap=30 applied:', ok);
    await page.waitForTimeout(2000);
    await armPerf(page);
    out.samples.push(await sample(page, 'frameCap30'));
    await applyVideo(page, { frameCap: 0 });
  }
  if (WHICH === 'scale' || WHICH === 'both') {
    const ok = await applyVideo(page, { renderScale: 0.6 });
    console.log('renderScale=0.6 applied:', ok);
    await page.waitForTimeout(2000);
    await armPerf(page);
    out.samples.push(await sample(page, 'renderScale0.6'));
    await applyVideo(page, { renderScale: 1 });
  }
  if (WHICH === 'both') {
    const ok = await applyVideo(page, { frameCap: 30, renderScale: 0.6 });
    console.log('cap+scale applied:', ok);
    await page.waitForTimeout(2000);
    await armPerf(page);
    out.samples.push(await sample(page, 'cap30+scale0.6'));
  }
} catch (error) {
  out.error = String(error && error.stack || error);
  console.error(out.error);
} finally {
  try {
    if (app) {
      await closeOwnedElectronRuntime({
        page, electronApp: app, childProcess, canonicalUrlTracker, processMonitor, rootUrl,
      });
    }
  } catch (e) { console.error('cleanup:', e.message); }
  try { if (launch && typeof launch.cleanup === 'function') launch.cleanup({ runtimeClosed: true }); } catch (_) {}
  const dir = path.join(ROOT, '.devshots', 'runtime-witness');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'framecap-ab.json'), JSON.stringify(out, null, 1));
  for (const s of out.samples) {
    const h = s.hist || {};
    console.log(`${s.label}: ${((s.elapsedMs || 0) / 1000).toFixed(1)}s frames=${h.frames} hitches=${h.hitches} owners=${JSON.stringify(h.counts || {})}`);
    console.log(`   costs: ${JSON.stringify(s.costs)} dynRes=${s.dynResScale} cap=${s.frameCap}`);
  }
}
