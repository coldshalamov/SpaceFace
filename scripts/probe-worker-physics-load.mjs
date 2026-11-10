// Temporary diagnostic: worker-side physics cost under heavy tether/boost/contact load.
// Boots isolated Electron, drives public inputs into the asteroid field while latching
// and cutting, samples SF.simLaneDiag().workerLastReplyWork, and captures a CDP CPU
// profile of the SIM WORKER target (auto-attach).
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
} from './scripts/lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './scripts/lib/electronTestIsolation.mjs';
import { loadPlaywright } from './scripts/lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './scripts/lib/playwrightCspPolling.mjs';
import { installFirstLightPromptHandler } from './scripts/player-truth/routes.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'worker-physics-probe');
const RUN_MS = Number(process.env.HEAVY_PROBE_MS || 60_000);

const log = (s) => console.log(`[${new Date().toISOString()}] ${s}`);

function summarizeCpuProfile(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const selfUs = new Map();
  const samples = profile.samples || [];
  const deltas = profile.timeDeltas || [];
  for (let i = 0; i < samples.length; i += 1) {
    const us = Number(deltas[i + 1]) || 0;
    selfUs.set(samples[i], (selfUs.get(samples[i]) || 0) + us);
  }
  const bySite = new Map();
  const byFile = new Map();
  let totalUs = 0;
  for (const [id, us] of selfUs) {
    const f = byId.get(id)?.callFrame || {};
    const file = String(f.url || '').split('?')[0].split('/').slice(-2).join('/') || '(native)';
    const site = `${f.functionName || '(anon)'} @ ${file}:${(f.lineNumber ?? -1) + 1}`;
    bySite.set(site, (bySite.get(site) || 0) + us);
    byFile.set(file, (byFile.get(file) || 0) + us);
    totalUs += us;
  }
  const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50)
    .map(([name, us]) => ({ [k]: name, ms: Math.round(us / 1000) }));
  return { totalMs: Math.round(totalUs / 1000), topSelf: top(bySite, 'site'), topFiles: top(byFile, 'file') };
}

const { _electron: electron } = await loadPlaywright();
const launch = createIsolatedElectronLaunch({
  root: ROOT,
  taskId: 'worker-physics-probe',
  timeout: 180_000,
  baseEnv: { ...process.env },
});
log('launching isolated Electron');
const app = await electron.launch(launch.options);
const childProcess = app.process();
const processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
const page = await app.firstWindow({ timeout: 180_000 });
installCspSafePlaywrightPolling(page);
await installFirstLightPromptHandler(page, (label, _ok, detail) => log(`${label}: ${detail}`));

// CDP: auto-attach so the sim worker target becomes attachable.
const cdp = await page.context().newCDPSession(page);
await cdp.send('Target.setAutoAttach', { autoAttach: true, flatten: true, waitForDebuggerOnStart: false });
const workerSessions = new Map();
cdp.on('Target.attachedToTarget', async (ev) => {
  const { targetInfo, sessionId } = ev;
  if (targetInfo.type === 'worker') {
    workerSessions.set(sessionId, targetInfo);
    log(`worker attached: ${targetInfo.url || targetInfo.title}`);
  }
});
cdp.on('Target.detachedFromTarget', (ev) => { workerSessions.delete(ev.sessionId); });

const canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
  bootstrapTimeoutMs: 10_000,
  pollIntervalMs: 75,
  allowAnyLoopbackPort: true,
});
const rootUrl = assertIsolatedElectronRootUrl(
  await canonicalUrlTracker.waitForCanonicalRoot(30_000),
);
log(`root url ${rootUrl}`);
await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
await page.waitForLoadState('domcontentloaded', { timeout: 180_000 });
await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 120_000 });
// Arm main-lane perf flags (renderWork + hitch attribution).
await page.evaluate(() => {
  const perf = window.SF?.state?.perfRuntime;
  perf?.reset?.();
  perf?.setRenderWorkEnabled?.(true);
  perf?.setHitchAttributionEnabled?.(true);
  perf?.setSystemTimingEnabled?.(true);
  perf?.setSystemTimingFullCoverage?.(true);
  perf?.setSimAttributionEnabled?.(true);
});

await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
await page.fill('#sf-ng-seed', '47');
await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
log('waiting for flight');
const flightDeadline = Date.now() + 180_000;
let inFlight = false;
while (Date.now() < flightDeadline) {
  const mode = await page.evaluate(() => window.SF?.state?.mode || null).catch(() => null);
  if (mode === 'flight') { inFlight = true; break; }
  await page.waitForTimeout(1000);
}
if (!inFlight) throw new Error('never entered flight');
log('entered flight');
await page.locator('#gl-canvas').click({ timeout: 10_000 }).catch(() => {});

// In-page collector: every 40ms snapshot of worker reply work + lane diagnostics.
await page.evaluate(() => {
  const series = [];
  window.__SF_WORKER_SERIES__ = series;
  const t0 = performance.now();
  const timer = setInterval(() => {
    try {
      const diag = typeof window.SF?.simLaneDiag === 'function' ? window.SF.simLaneDiag() : null;
      const work = diag?.workerLastReplyWork || diag?.workerWork || null;
      const st = window.SF?.state;
      series.push({
        t: Math.round(performance.now() - t0),
        workMs: work?.workMs ?? null, packMs: work?.packMs ?? null,
        domainDiffMs: work?.domainDiffMs ?? null, boundaryMs: work?.boundaryMs ?? null,
        journalRecords: work?.journalRecords ?? null,
        tick: st?.tick ?? null, simTime: st?.simTime ?? null,
        entities: st?.entities?.size ?? null,
        tether: st?.player?.tether?.active === true ? 1 : 0,
        tetherCount: st?.player?.tetherCount ?? null,
        heap: performance?.memory?.usedJSHeapSize ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      });
    } catch (_) {}
  }, 40);
  window.__SF_WORKER_SERIES_TIMER__ = timer;
});

// Heavy physics drive: boost into the field, latch + tow + cut repeatedly, weave.
const actions = async () => {
  const phases = Math.ceil(RUN_MS / 12_000);
  for (let cycle = 0; cycle < phases; cycle += 1) {
    log(`drive cycle ${cycle + 1}/${phases}: boost toward field`);
    await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(3000);
    // latch nearest
    await page.keyboard.press('ControlLeft+Space');
    await page.waitForTimeout(300);
    const latched = await page.evaluate(() => window.SF?.state?.player?.tether?.active === true).catch(() => false);
    log(`  latch -> ${latched}`);
    // tow while still boosting through the field (contacts against rocks)
    await page.keyboard.down('BracketLeft');
    await page.waitForTimeout(2500);
    // weave while towing
    await page.keyboard.down('KeyA'); await page.waitForTimeout(900);
    await page.keyboard.up('KeyA');
    await page.waitForTimeout(1200);
    // cut and keep boosting
    await page.keyboard.press('Space');
    await page.keyboard.up('BracketLeft'); await page.keyboard.up('ShiftLeft');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    // brief coast
    await page.waitForTimeout(1000);
  }
};

// Worker CPU profile: attach to the sim worker target once found.
let workerProf = null;
const workerProfDeadline = Date.now() + 15_000;
while (Date.now() < workerProfDeadline && workerSessions.size === 0) {
  await page.waitForTimeout(250);
}
for (const [sessionId] of workerSessions) {
  try {
    const ws = await page.context().newCDPSession(page); // page-level session for routing
    await cdp.send('Profiler.enable', {}, sessionId);
    await cdp.send('Profiler.start', {}, sessionId);
    workerProf = sessionId;
    log(`worker CPU profiling started (session ${sessionId})`);
    break;
  } catch (e) { log(`worker profiler failed: ${e.message}`); }
}

await actions();

if (workerProf) {
  try {
    const { profile } = await cdp.send('Profiler.stop', {}, workerProf);
    const summary = summarizeCpuProfile(profile);
    await mkdir(OUT, { recursive: true });
    await writeFile(path.join(OUT, 'worker-cpuprofile.json'), JSON.stringify(profile));
    await writeFile(path.join(OUT, 'worker-cpu-summary.json'), JSON.stringify(summary, null, 2));
    log(`worker profile: ${summary.totalMs} ms sampled`);
    for (const row of summary.topSelf.slice(0, 25)) log(`  self ${row.ms} ms  ${row.site}`);
    for (const row of summary.topFiles.slice(0, 15)) log(`  file ${row.ms} ms  ${row.file}`);
  } catch (e) { log(`worker profile stop failed: ${e.message}`); }
}

const series = await page.evaluate(() => {
  clearInterval(window.__SF_WORKER_SERIES_TIMER__);
  return window.__SF_WORKER_SERIES__ || [];
});
const perfReport = await page.evaluate(() => window.__SPACEFACE_PERF__?.getReport?.() || null);
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'worker-reply-series.json'), JSON.stringify(series));
await writeFile(path.join(OUT, 'main-perf-report.json'), JSON.stringify(perfReport));

// Summarize worker workMs.
const works = series.map((s) => s.workMs).filter(Number.isFinite).sort((a, b) => a - b);
const packs = series.map((s) => s.packMs).filter(Number.isFinite).sort((a, b) => a - b);
const quant = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(q * arr.length))] : null;
log(`worker workMs: n=${works.length} p50=${quant(works, 0.5)} p95=${quant(works, 0.95)} p99=${quant(works, 0.99)} max=${works[works.length - 1] ?? 'n/a'}`);
log(`worker packMs: n=${packs.length} p50=${quant(packs, 0.5)} p95=${quant(packs, 0.95)} max=${packs[packs.length - 1] ?? 'n/a'}`);
const spikes = series.filter((s) => Number.isFinite(s.workMs) && s.workMs > 30);
log(`workMs >30ms samples: ${spikes.length}`);
for (const s of spikes.slice(0, 20)) log(`  t=${s.t}ms workMs=${s.workMs.toFixed(1)} packMs=${s.packMs?.toFixed(1)} entities=${s.entities} tether=${s.tether}`);

await closeOwnedElectronRuntime({ electronApp: app, processMonitor, childProcess });
log('done');
