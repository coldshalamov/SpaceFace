// probe-dynres-zoom — does the adaptive-resolution ladder collapse at far zoom?
// Boots a fresh profile to the title, presses SWARM, reaches flight, then holds
// thrust+boost so the chase camera opens. Samples liveZoom / dynResScale / frame
// ms every 250 ms and captures the view at the deepest scale reached.
// Read-only observer: public controls in, window.SF reads out.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { waitForPageCondition } from './lib/playwrightCspPolling.mjs';
import { launchChromium } from './player-truth/browser.mjs';
import { startBenchServer } from './lib/benchServer.mjs';
import { bootToMenu, waitBootOverlayGone, answerFirstRunPrompt } from './player-truth/routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.devshots', 'dynres-zoom');
const SAMPLES_MS = 60_000;

mkdirSync(OUT, { recursive: true });
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
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') (report.console ||= []).push(`${m.type()}: ${m.text()}`.slice(0, 200)); });
  try {
    await bootToMenu(page, server.baseUrl, step);
  } catch (bootErr) {
    // Slow-box race: the menu can mount near the deadline with the First light
    // prompt already up. Answer the prompt publicly and confirm the menu before
    // declaring boot a failure.
    await page.screenshot({ path: path.join(OUT, 'boot-late.png') }).catch(() => {});
    await answerFirstRunPrompt(page, step).catch(() => {});
    const menuUp = await waitForPageCondition(page,
      () => { const el = document.querySelector('[data-screen="mainMenu"]');
        return !!(window.SF && window.SF.state && el && getComputedStyle(el).display !== 'none'); },
      null, { timeout: 60_000 }).then(() => true).catch(() => false);
    if (!menuUp) {
      await page.screenshot({ path: path.join(OUT, 'boot-failed.png') }).catch(() => {});
      throw bootErr;
    }
    step('main menu', true, 'menu visible after the late first-run prompt');
  }
  await page.locator('#screens button[data-action="swarm"]:visible').click({ timeout: 60_000 });
  try {
    await waitForPageCondition(page, () => window.SF?.state?.mode === 'flight', null, { timeout: 240_000 });
  } catch (flightErr) {
    report.parked = await page.evaluate(() => ({
      mode: window.SF?.state?.mode,
      phase: window.SF?.state?.run?.phase,
      kind: window.SF?.state?.run?.kind,
      ruleset: window.SF?.state?.run?.ruleset,
      topScreen: window.SF?.screens?.top?.id || null,
      bootOverlay: !!document.querySelector('#bootOverlay:not(.gone)'),
      dialog: !!document.querySelector('[role="dialog"], .sf-dialog'),
    })).catch((e) => ({ evaluateError: String(e) }));
    await page.screenshot({ path: path.join(OUT, 'parked.png') }).catch(() => {});
    throw flightErr;
  }
  await waitBootOverlayGone(page, 90_000);
  await page.waitForTimeout(1500);
  step('flight', true, 'round 1 airborne');

  const gpu = await page.evaluate(() => ({
    tier: window.SF?.state?.render?.gpu?.tier,
    renderer: window.SF?.state?.render?.gpu?.renderer,
    software: window.SF?.state?.render?.gpu?.software === true,
    dynResAllowed: window.SF?.state?.render?.dynResAllowed,
    scale: window.SF?.state?.render?.dynResScale,
    pixelRatio: window.SF?.state?.render?.pixelRatio ?? null,
    displayHz: window.SF?.state?.render?.displayHz,
    frameCap: window.SF?.state?.render?.frameCap,
    video: window.SF?.state?.settings?.video ? {
      qualityMode: window.SF.state.settings.video.qualityMode,
      dynamicResolution: window.SF.state.settings.video.dynamicResolution,
      sharpen: window.SF.state.settings.video.sharpen,
      renderScale: window.SF.state.settings.video.renderScale,
      frameCap: window.SF.state.settings.video.frameCap,
    } : null,
  }));
  report.gpu = gpu;
  step('gpu', true, `tier ${gpu.tier} · software=${gpu.software} · dynRes=${gpu.dynResAllowed} · scale ${gpu.scale} · mode ${gpu.video?.qualityMode}`);

  // Hold thrust + boost so the speed-linked camera opens to its widest. Samples read the
  // mirror's render bag: liveZoom is the camera's presented zoom; dynResScale is the ladder.
  await page.evaluate(() => {
    window.__DYN_SAMPLES__ = [];
    window.__DYN_TICK__ = setInterval(() => {
      const r = window.SF?.state?.render || {};
      const cam = window.SF?.state?.camera || {};
      window.__DYN_SAMPLES__.push({
        t: Math.round(performance.now()),
        zoom: Number.isFinite(cam.liveZoom) ? +cam.liveZoom.toFixed(2) : null,
        base: Number.isFinite(cam.baseZoom) ? +cam.baseZoom.toFixed(2) : null,
        scale: Number.isFinite(r.dynResScale) ? +r.dynResScale.toFixed(3) : null,
        ms: Number.isFinite(r.frameMs) ? +r.frameMs.toFixed(1) : null,
      });
    }, 250);
  });
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  await page.screenshot({ path: path.join(OUT, 'zoomout-early.png') }).catch(() => {});

  await page.waitForTimeout(SAMPLES_MS);
  const samples = await page.evaluate(() => { clearInterval(window.__DYN_TICK__); return window.__DYN_SAMPLES__ || []; });
  report.samples = samples;
  await page.screenshot({ path: path.join(OUT, 'zoomout-late.png') });
  await page.keyboard.up('KeyW'); await page.keyboard.up('Space');

  const zooms = samples.map((s) => s.zoom).filter(Number.isFinite);
  const scales = samples.map((s) => s.scale).filter(Number.isFinite);
  const minScale = scales.length ? Math.min(...scales) : null;
  const maxZoom = zooms.length ? Math.max(...zooms) : null;
  const atMaxZoom = samples.filter((s) => Number.isFinite(s.zoom) && Number.isFinite(s.scale) && s.zoom >= (maxZoom - 0.01));
  const scaleAtMaxZoom = atMaxZoom.length ? Math.min(...atMaxZoom.map((s) => s.scale)) : null;
  report.summary = { samples: samples.length, maxZoom, minScale, scaleAtMaxZoom, lastScale: scales[scales.length - 1] };
  step('zoom reached', true, `max liveZoom ${maxZoom} (base ${samples[0]?.base})`);
  step('scale at far zoom', minScale != null && minScale < 0.8,
    `min dynResScale ${minScale} · scale at widest zoom ${scaleAtMaxZoom} · final ${report.summary.lastScale}`);
} catch (err) {
  step('route error', false, String(err && err.message || err).slice(0, 400));
  report.error = String(err && err.stack || err);
} finally {
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
const failed = report.steps.filter((s) => s.ok === false);
console.log(failed.length ? `FAIL ${failed.length} step(s)` : 'PASS — scale held at far zoom');
process.exit(failed.length ? 1 : 0);
