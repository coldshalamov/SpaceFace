// probe-swarm-quick-start — S4's route check: boot a fresh profile to the title, click the
// SWARM verb, and record the run's phase journal until round 1 is live. Asserts:
//   1. the run begins (kind survival, ruleset swarm),
//   2. the draft/armory stop is never entered,
//   3. click → first 'active' phase lands under the 15 s budget.
// Read-only observer: it presses a public button and watches window.SF, nothing else.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { waitForPageCondition } from './lib/playwrightCspPolling.mjs';
import { launchChromium } from './player-truth/browser.mjs';
import { startBenchServer } from './lib/benchServer.mjs';
import { bootToMenu, installFirstLightPromptHandler, waitBootOverlayGone } from './player-truth/routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.devshots', 'swarm', 's4-route');
const BUDGET_MS = 15_000;

const server = await startBenchServer();
const { chromium } = await loadPlaywright();
let browser = null;
const report = { steps: [] };
const step = (name, ok, detail) => {
  report.steps.push({ name, ok, detail });
  console.log(`${ok ? 'ok ' : 'XX '} ${name} — ${detail}`);
};

try {
  ({ browser } = await launchChromium(chromium, {
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  }));
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => step('page error', false, String(e.message || e).slice(0, 300)));
  await bootToMenu(page, server.baseUrl, step);
  step('title', true, 'main menu visible');

  // Journal every run phase the moment it changes — a draft visit cannot hide between polls.
  await page.evaluate(() => {
    window.__SF_PHASES__ = [];
    const rec = (p) => { if (p && !window.__SF_PHASES__.includes(p)) window.__SF_PHASES__.push(p); };
    window.SF?.bus?.on?.('run:phaseChanged', (pl) => rec(pl && (pl.phase || pl.next || pl.nextPhase)));
    window.__SF_TOASTS__ = [];
    window.SF?.bus?.on?.('toast', (pl) => window.__SF_TOASTS__.push((pl && pl.text) || pl));
    window.__SF_PHASE_TICK__ = setInterval(() => rec(window.SF?.state?.run?.phase), 50);
  });

  const clickedAt = Date.now();
  await page.locator('#screens button[data-action="swarm"]:visible').click({ timeout: 60_000 });
  step('press', true, 'SWARM clicked');

  let reached = true;
  try {
    await waitForPageCondition(page,
      () => window.SF?.state?.run?.phase === 'active' || window.SF?.state?.run?.phase === 'wave_intro',
      null, { timeout: 240_000 });
  } catch { reached = false; }
  const firstFightAt = Date.now();
  const snap = await page.evaluate(() => ({
    phases: window.__SF_PHASES__ || [],
    phase: window.SF?.state?.run?.phase,
    kind: window.SF?.state?.run?.kind,
    ruleset: window.SF?.state?.run?.ruleset,
    arenaId: window.SF?.state?.run?.arenaId,
    mode: window.SF?.state?.mode,
    topScreen: window.SF?.screens?.top?.id || window.SF?.screens?.current || null,
    toasts: (window.__SF_TOASTS__ || []).slice(-8),
    telemetry: window.SF?.state?.run?.telemetry || {},
    wave: window.SF?.state?.run?.wave,
  })).catch((e) => ({ evaluateError: String(e && e.message || e) }));
  report.snap = snap;
  report.clickToFightMs = firstFightAt - clickedAt;

  if (!reached) await page.screenshot({ path: path.join(OUT, 'parked.png') }).catch(() => {});
  step('reaches the fight', reached, `phase ${snap.phase} · mode ${snap.mode} · screen ${snap.topScreen}`);
  step('run begins', snap.kind === 'survival' && snap.ruleset === 'swarm',
    `kind ${snap.kind} · ruleset ${snap.ruleset} · arena ${snap.arenaId}`);
  step('no armory stop', !snap.phases.includes('draft') && snap.phase !== 'draft',
    `phase journal: ${snap.phases.join(' → ') || '(empty)'} · now ${snap.phase}`);
  // window.SF.state mirrors the worker's run: kind/ruleset/phase project, telemetry fields and
  // arenaId do not. The skipped draft IS the evidence the flag landed — recorded, not asserted.
  step('telemetry note', true, `mirrored openArmoryBeforeRound1=${snap.telemetry.openArmoryBeforeRound1} (mirror drops it; phase journal is the proof)`);
  step('click to fight under 15 s', report.clickToFightMs < BUDGET_MS,
    `${(report.clickToFightMs / 1000).toFixed(1)} s from press to ${snap.phase}`);

  // Phase 'active' precedes the veil lifting; the screenshot waits for the boot overlay to be
  // actually gone so the capture is round 1 airborne, not the loading card.
  try {
    await waitForPageCondition(page, () => window.SF?.state?.mode === 'flight', null, { timeout: 240_000 });
    await waitBootOverlayGone(page, 60_000);
    await page.waitForTimeout(2500);
    step('flight mode', true, 'veil lifted — player in flight');
  } catch { step('flight mode', false, 'the veil never lifted'); }
  await page.screenshot({ path: path.join(OUT, 'swarm-round1-flight.png') });

  // Warm leg: the plan's "under 15 s warm" is the relaunched press — module graph compiled,
  // assets cached, shaders warm. Reload to the title and press again.
  await page.evaluate(() => clearInterval(window.__SF_PHASE_TICK__));
  await page.reload({ waitUntil: 'commit' });
  await bootToMenu(page, server.baseUrl, step);
  await page.evaluate(() => {
    window.__SF_PHASES__ = [];
    const rec = (p) => { if (p && !window.__SF_PHASES__.includes(p)) window.__SF_PHASES__.push(p); };
    window.SF?.bus?.on?.('run:phaseChanged', (pl) => rec(pl && (pl.phase || pl.next || pl.nextPhase)));
    window.__SF_PHASE_TICK__ = setInterval(() => rec(window.SF?.state?.run?.phase), 50);
  });
  const warmAt = Date.now();
  await page.locator('#screens button[data-action="swarm"]:visible').click({ timeout: 60_000 });
  await waitForPageCondition(page,
    () => window.SF?.state?.run?.phase === 'active' || window.SF?.state?.run?.phase === 'wave_intro',
    null, { timeout: 240_000 });
  report.warmClickToFightMs = Date.now() - warmAt;
  const warmSnap = await page.evaluate(() => ({
    phases: window.__SF_PHASES__ || [],
    phase: window.SF?.state?.run?.phase,
  }));
  report.warmSnap = warmSnap;
  step('warm press to fight under 15 s', report.warmClickToFightMs < BUDGET_MS,
    `${(report.warmClickToFightMs / 1000).toFixed(1)} s · journal ${warmSnap.phases.join(' → ')}`);
} catch (err) {
  step('route error', false, String(err && err.message || err).slice(0, 400));
  report.error = String(err && err.stack || err);
} finally {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
const failed = report.steps.filter((s) => s.ok === false);
console.log(failed.length ? `FAIL ${failed.length} step(s)` : 'PASS — one press to the fight');
process.exit(failed.length ? 1 : 0);
