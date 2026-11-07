// Worker-step acceptance probe (master-plan campaign E2).
//
// Measures the authoritative step on the owner's machine through the worker lane's own
// telemetry on two real routes:
//   adventure — New Game, flight through the busy asteroid field (boost + weave + fire)
//   swarm     — title → Swarm, round 1 in flight (≥150 bodies once the wave materialises)
//
// Reports worker reply work (stepsMs) percentiles and, when `?simProfile=1` is reachable,
// the realm's per-system profile. Writes .devshots/sim-step-acceptance/<label>/.
//
//   node scripts/probe-step-acceptance.mjs --label=before --seconds=45

import { mkdir, writeFile } from 'node:fs/promises';
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
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';
import { installFirstLightPromptHandler } from './player-truth/routes.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = new Map();
for (const raw of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(raw);
  if (m) argv.set(m[1], m[2] === undefined ? 'true' : m[2]);
}
const LABEL = argv.get('label') || 'run';
const SECONDS = Number(argv.get('seconds') || 45);
const ROUTE = argv.get('route') || 'both';
const OUT = path.join(ROOT, '.devshots', 'sim-step-acceptance', LABEL);

const log = (s) => console.log(`[${new Date().toISOString()}] ${s}`);
const quantile = (sorted, q) => (sorted.length
  ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  : 0);
function summarise(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return {
    n: sorted.length,
    meanMs: Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 1000) / 1000,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    max: sorted[sorted.length - 1],
  };
}

const { _electron: electron } = await loadPlaywright();
const launch = createIsolatedElectronLaunch({
  root: ROOT,
  taskId: `sim-step-${LABEL}`,
  timeout: 240_000,
  baseEnv: { ...process.env },
});
log('launching isolated Electron');
const app = await electron.launch(launch.options);
const childProcess = app.process();
const processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
const page = await app.firstWindow({ timeout: 240_000 });
installCspSafePlaywrightPolling(page);
await installFirstLightPromptHandler(page, (label, _ok, detail) => log(`${label}: ${detail}`));

const canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
  bootstrapTimeoutMs: 15_000,
  pollIntervalMs: 75,
  allowAnyLoopbackPort: true,
});
const rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(45_000));
log(`root url ${rootUrl}`);
await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
await page.waitForLoadState('domcontentloaded', { timeout: 240_000 });
await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 180_000 });

await page.evaluate(() => {
  const perf = window.SF?.state?.perfRuntime;
  perf?.reset?.();
  perf?.setHitchAttributionEnabled?.(true);
});

// Collector: one sample per 100 ms of reply work + scene census.
async function startCollector() {
  await page.evaluate(() => {
    const series = [];
    window.__SF_STEP_SERIES__ = series;
    const t0 = performance.now();
    window.__SF_STEP_TIMER__ = setInterval(() => {
      try {
        const diag = typeof window.SF?.simLaneDiag === 'function' ? window.SF.simLaneDiag() : null;
        const work = diag?.workerLastReplyWork || null;
        const st = window.SF?.state;
        series.push({
          t: Math.round(performance.now() - t0),
          workMs: work?.workMs ?? null,
          stepsMs: work?.stepsMs ?? null,
          stepsExecuted: work?.stepsExecuted ?? null,
          packMs: work?.packMs ?? null,
          entities: st?.entities?.size ?? null,
          tick: st?.tick ?? null,
          mode: st?.mode ?? null,
          runKind: st?.run?.kind ?? null,
        });
      } catch (_) { /* page busy */ }
    }, 100);
  });
}
async function stopCollector() {
  return page.evaluate(() => {
    clearInterval(window.__SF_STEP_TIMER__);
    return window.__SF_STEP_SERIES__ || [];
  });
}

const results = {};

// Per-step normalization: one reply covers up to 4 fixed steps (catch-up batch), so the
// acceptance bars are `stepsMs / stepsExecuted` — the cost of ONE authoritative step.
function perStep(series) {
  const out = [];
  for (const s of series) {
    const n = Number.isFinite(s.stepsExecuted) && s.stepsExecuted > 0 ? s.stepsExecuted : null;
    if (!n || !Number.isFinite(s.stepsMs)) continue;
    out.push(s.stepsMs / n);
  }
  return out;
}

async function adventureRun() {
  log('adventure: New Game');
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 60_000 });
  await page.fill('#sf-ng-seed', '47');
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 60_000 });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const mode = await page.evaluate(() => window.SF?.state?.mode || null).catch(() => null);
    if (mode === 'flight') break;
    await page.waitForTimeout(1000);
  }
  log('adventure: in flight');
  await page.locator('#gl-canvas').click({ timeout: 10_000 }).catch(() => {});
  await startCollector();
  const end = Date.now() + SECONDS * 1000;
  let phase = 0;
  while (Date.now() < end) {
    phase += 1;
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(2500);
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(900);
    await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1400);
    await page.keyboard.up('KeyD');
    await page.keyboard.press('ControlLeft+Space').catch(() => {});
    await page.waitForTimeout(1800);
    await page.keyboard.press('Space').catch(() => {});
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.waitForTimeout?.(0);
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(400);
    if (phase % 3 === 0) log(`adventure: phase ${phase}`);
  }
  const series = await stopCollector();
  results.adventure = {
    series,
    steps: summarise(perStep(series)),
    work: summarise(series.map((s) => s.workMs)),
    entities: series.map((s) => s.entities).filter(Number.isFinite).sort((a, b) => a - b).pop() || null,
  };
  log(`adventure: steps ${JSON.stringify(results.adventure.steps)} entities ${results.adventure.entities}`);
}

async function swarmRun() {
  log('swarm: clicking Swarm from the title');
  const swarmButton = page.getByRole('button', { name: /^Swarm$/i });
  if (await swarmButton.count() === 0) {
    // Fall back to a text match: the title may render the door as a menu row.
    const byText = page.locator('button:has-text("Swarm"), [role="menuitem"]:has-text("Swarm"), a:has-text("Swarm")').first();
    await byText.click({ timeout: 60_000 });
  } else {
    await swarmButton.first().click({ timeout: 60_000 });
  }
  const deadline = Date.now() + 240_000;
  let ready = false;
  while (Date.now() < deadline) {
    const probe = await page.evaluate(() => ({
      mode: window.SF?.state?.mode || null,
      kind: window.SF?.state?.run?.kind || null,
      phase: window.SF?.state?.run?.phase || null,
      entities: window.SF?.state?.entities?.size || 0,
    })).catch(() => null);
    if (probe && probe.mode === 'flight' && probe.kind === 'survival' && probe.entities >= 20) { ready = true; break; }
    await page.waitForTimeout(1000);
  }
  if (!ready) { log('swarm: never reached a live round'); results.swarm = { error: 'not-reached' }; return; }
  log('swarm: round live');
  await page.locator('#gl-canvas').click({ timeout: 10_000 }).catch(() => {});
  await startCollector();
  const end = Date.now() + SECONDS * 1000;
  let phase = 0;
  while (Date.now() < end) {
    phase += 1;
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyD');
    await page.keyboard.press('Space').catch(() => {});
    await page.waitForTimeout(800);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(400);
    if (phase % 3 === 0) log(`swarm: phase ${phase}`);
  }
  const series = await stopCollector();
  results.swarm = {
    series,
    steps: summarise(perStep(series)),
    work: summarise(series.map((s) => s.workMs)),
    entities: series.map((s) => s.entities).filter(Number.isFinite).sort((a, b) => a - b).pop() || null,
  };
  log(`swarm: steps ${JSON.stringify(results.swarm.steps)} entities ${results.swarm.entities}`);
}

try {
  if (ROUTE === 'both' || ROUTE === 'adventure') await adventureRun();
  if (ROUTE === 'both' || ROUTE === 'swarm') await swarmRun();
} finally {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'acceptance.json'), `${JSON.stringify({
    schema: 'spaceface.stepAcceptance.v1',
    label: LABEL,
    capturedAt: new Date().toISOString(),
    route: ROUTE,
    seconds: SECONDS,
    results,
  }, null, 2)}\n`);
  log(`wrote ${path.relative(ROOT, path.join(OUT, 'acceptance.json'))}`);
  await closeOwnedElectronRuntime({ electronApp: app, processMonitor, childProcess });
}
