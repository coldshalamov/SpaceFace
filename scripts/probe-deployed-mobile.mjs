// Real-route acceptance: fresh profile, real menu taps, no debug/state/storage injection.
// MOBILE_PROBE_URL=https://... MOBILE_PROBE_ENGINE=webkit node scripts/probe-deployed-mobile.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const url = new URL(process.env.MOBILE_PROBE_URL || 'https://spaceface-play-demo.vercel.app/');
if (!['https:', 'http:'].includes(url.protocol)) throw new Error('HTTP(S) deployment URL required');
const engine = process.env.MOBILE_PROBE_ENGINE || 'webkit';
if (!['webkit', 'chromium'].includes(engine)) throw new Error('Engine must be webkit or chromium');
const out = resolve(process.env.MOBILE_PROBE_OUT || `.devshots/mobile-deployment/${engine}`);
await mkdir(out, { recursive: true });
const report = { url: url.href, engine, startedAt: new Date().toISOString(), passed: false,
  responses: [], requestFailures: [], pageErrors: [], console: [], stages: [], observations: [], lifecycle: [] };
let browser;
async function boundedBrowserRead(read, timeoutMs = 20000) {
  let timer;
  try {
    return await Promise.race([read(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Mobile renderer stopped answering for ${timeoutMs / 1000} seconds`)), timeoutMs);
      timer.unref();
    })]);
  } finally { clearTimeout(timer); }
}
const snapshot = page => boundedBrowserRead(() => page.evaluate(() => {
  const shown = e => !e.hidden && e.getBoundingClientRect().width > 0
    && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
  // Observer only; the actor below still uses the public menu and touch controls.
  const render = window.SF?.state?.render;
  const frame = window.__SF_WITNESS__?.snapshot?.();
  const graphics = window.__THREE_GAME_DIAGNOSTICS__?.getReport?.();
  return {
    launchButton: (() => { const e = document.querySelector('.sf-ng-launch'); return e ? { text: e.textContent, disabled: e.disabled, ariaDisabled: e.getAttribute('aria-disabled') } : null; })(),
    title: document.title, mobile: document.documentElement.dataset.sfMobile || null,
    flight: document.documentElement.dataset.sfMobileFlight || null,
    capabilities: { coarse: matchMedia('(pointer: coarse)').matches, anyCoarse: matchMedia('(any-pointer: coarse)').matches,
      touchPoints: navigator.maxTouchPoints ?? null, touchEvents: 'ontouchstart' in window,
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency ?? null },
    loading: [...document.querySelectorAll('[data-loading-label], [data-loading-detail]')].filter(shown).map(e => e.textContent),
    screens: [...document.querySelectorAll('[data-screen]')].filter(shown).map(e => e.dataset.screen),
    alerts: [...document.querySelectorAll('[role="alert"], .boot-error')].filter(shown).map(e => e.textContent),
    runtime: render || frame ? {
      gpu: render?.gpu,
      parallelCompile: render ? !!render.renderer?.extensions?.get('KHR_parallel_shader_compile') : undefined,
      admission: render?.requiredPackageAdmission,
      cook: render?.openingCookLedger,
      frame,
      render: graphics?.render,
      post: graphics?.post,
    } : null,
  };
}));
const visible = async (page, selector) => boundedBrowserRead(() => page.locator(selector).first().isVisible()).catch(() => false);
const critical = response => response.status >= 400 && (
  /\.(?:glb|wasm|m?js)(?:\?|$)/.test(response.url) || /\/assets\/ships\/motions\/.*\.json(?:\?|$)/.test(response.url));
try {
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
    ...(engine === 'chromium' ? { args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] } : {}) });
  const context = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block',
    // Official Vercel E2E header: exclude preview-only feedback UI, not game code
    // or deployment protection. Production visitors do not normally load this toolbar.
    extraHTTPHeaders: { 'x-vercel-skip-toolbar': '1' } });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  const tapControl = async selector => {
    const control = typeof selector === 'string' ? page.locator(selector).first() : selector;
    await control.waitFor({ state: 'visible' });
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    if (!box) throw new Error(`Mobile control has no visible bounds: ${selector}`);
    // Moving title/ORRERY instruments never become "stable". A player taps their current position.
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };
  page.on('crash', () => report.lifecycle.push({ event: 'page-crash', at: new Date().toISOString() }));
  page.on('close', () => report.lifecycle.push({ event: 'page-close', at: new Date().toISOString() }));
  page.on('pageerror', error => report.pageErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    if (message.type() === 'log' && /\[render\] GPU:|\[opening-cook\]/.test(message.text()))
      console.log(`[mobile:${engine}] ${message.text()}`);
    if (['error', 'warning'].includes(message.type()) && !/was preloaded using link preload/.test(message.text())) {
      if (report.console.length >= 250) report.console.shift();
      report.console.push({ type: message.type(), text: message.text().slice(0, 3000) });
      console.log(`[mobile:${engine}:${message.type()}] ${message.text().slice(0, 2000)}`);
    }
  });
  page.on('requestfailed', request => {
    if (report.requestFailures.length < 500) report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', response => {
    if (report.responses.length < 3000) report.responses.push({ url: response.url(), status: response.status(),
      type: response.request().resourceType(), mime: response.headers()['content-type'], bytes: response.headers()['content-length'] });
  });
  const navigation = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  report.navigation = { status: navigation?.status(), url: page.url() }; report.html = await boundedBrowserRead(() => page.content());
  const menu = '[data-screen="mainMenu"] button[data-action="newGame"]';
  const beforeMenu = Date.now();
  while (!(await visible(page, menu)) && Date.now() - beforeMenu < 180000) {
    if (await visible(page, '#cinematic-splash .cine-begin'))
      await tapControl('#cinematic-splash .cine-begin').catch(() => {});
    const motion = page.locator('[data-screen="motionAsk"] button').filter({ hasText: /^Full/i }).first();
    if (await boundedBrowserRead(() => motion.isVisible()).catch(() => false)) await tapControl(motion);
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: join(out, '01-menu.png') });
  if (!(await visible(page, menu))) throw new Error('Main menu never became playable');
  report.stages.push({ stage: 'menu', ...await snapshot(page) });
  console.log(`[mobile:${engine}] menu ready`);
  await tapControl(menu);
  await page.locator('.sf-ng-launch').waitFor({ state: 'visible', timeout: 30000 });
  report.stages.push({ stage: 'new-game', ...await snapshot(page) });
  console.log(`[mobile:${engine}] launching`);
  await page.screenshot({ path: join(out, '02-new-game.png') });
  await tapControl('.sf-ng-launch');
  const launchAt = Date.now(); let reachedFlight = false;
  while (Date.now() - launchAt < 300000) {
    await page.waitForTimeout(2000);
    const state = await snapshot(page); report.observations.push({ elapsedMs: Date.now() - launchAt, ...state });
    if (report.observations.length % 5 === 1) {
      console.log(JSON.stringify({ engine, elapsedMs: Date.now() - launchAt,
        loading: state.loading, flight: state.flight,
        gpu: state.runtime?.gpu, parallelCompile: state.runtime?.parallelCompile,
        admission: state.runtime?.admission, lastCookStep: state.runtime?.cook?.at(-1) }));
      await writeFile(join(out, 'progress.json'), JSON.stringify(report, null, 2));
    }
    if (report.console.some(entry => /\[SpaceFace\] new game startup failed/.test(entry.text)))
      throw new Error('Game reported a startup-readiness failure; see console and failed asset URLs');
    if (/SimulationRunner is closed/.test(state.runtime?.frame?.lastFrameError || '')
        || report.console.some(entry => /SimulationRunner is closed|PRESENTATION STALLED/.test(entry.text)))
      throw new Error('Game reported a terminal simulation or presentation failure; see runtime and console');
    if (!state.loading.length && state.launchButton && !state.launchButton.disabled
        && state.alerts.some(text => /could not finish loading|did not finish preparing|could not start/i.test(text)))
      throw new Error(`Game refused mobile startup: ${state.alerts.filter(Boolean).join(' ')}`);
    if (state.flight === '1' && !state.loading.length
        && Number.isFinite(state.runtime?.post?.firstPlayableFrameAt)) {
      reachedFlight = true; break;
    }
    if (Date.now() - launchAt > 5000 && await visible(page, menu))
      throw new Error('New Game returned to the main menu without entering flight');
  }
  report.launchMs = Date.now() - launchAt;
  await page.screenshot({ path: join(out, '03-flight.png') });
  if (!reachedFlight) throw new Error('New Game did not reach unobstructed mobile flight within five minutes');
  // Only the player-facing DOM is read. Keyboard labels alone are not mobile acceptance.
  for (const selector of ['.mf-gun', '.mf-tether', '.mf-edge', '.mf-pause']) {
    if (!(await visible(page, selector))) throw new Error(`Missing visible touch control: ${selector}`);
  }
  await page.locator('.mf-edge').tap();
  await page.locator('.mf-wheel').waitFor({ state: 'visible' });
  await page.screenshot({ path: join(out, '04-powers.png') });
  await page.touchscreen.tap(100, 320);
  await page.locator('.mf-wheel').waitFor({ state: 'hidden' });
  await page.locator('.mf-pause').tap();
  await page.locator('[data-screen="pause"]').waitFor({ state: 'visible' });
  report.stages.push({ stage: 'pause', ...await snapshot(page) });
  await page.screenshot({ path: join(out, '05-pause.png') });
  await page.locator('[data-screen="pause"] button').filter({ hasText: /^Resume/i }).first().tap();
  await page.locator('[data-screen="pause"]').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(1500);
  const landscape = await snapshot(page); report.stages.push({ stage: 'landscape', ...landscape });
  if (landscape.flight !== '1') throw new Error('Touch flight did not survive rotation');
  await page.screenshot({ path: join(out, '06-landscape.png') });
  for (const selector of ['.mf-gun', '.mf-tether', '.mf-pause']) {
    const box = await page.locator(selector).boundingBox();
    if (!box || box.x < 0 || box.y < 0 || box.x + box.width > 845 || box.y + box.height > 391)
      throw new Error(`Control clipped after rotation: ${selector} ${JSON.stringify(box)}`);
  }
  if (report.pageErrors.length) throw new Error(`${report.pageErrors.length} unhandled page error(s)`);
  if (report.responses.some(critical)) throw new Error('Runtime script, model or decoder returned an HTTP error');
  for (const name of ['renderPackageDigestWorker.js', 'glbPrepassWorker.js']) {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const worker = report.responses.find(r => {
      const path = new URL(r.url).pathname;
      return r.status === 200 && (path.endsWith(`/workers/${name}`)
        || (local && path.endsWith(`/src/render/${name}`)));
    });
    if (!worker || !/(javascript|ecmascript)/i.test(worker.mime || ''))
      throw new Error(`Worker not loaded with JavaScript MIME: ${name}`);
  }
  report.passed = true;
} catch (error) {
  report.failure = String(error?.stack || error);
  const page = browser?.contexts()[0]?.pages()[0];
  if (page && !page.isClosed()) {
    report.final = await snapshot(page).catch(() => null);
    await page.screenshot({ path: join(out, 'failure.png'), timeout: 15000 }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  // Persist diagnostics before a crashed renderer can stall browser shutdown.
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await Promise.race([browser?.close(), new Promise(resolve => {
    const timer = setTimeout(resolve, 5000); timer.unref();
  })]);
  console.log(JSON.stringify({ engine, passed: report.passed, launchMs: report.launchMs,
    failure: report.failure, final: report.final, pageErrors: report.pageErrors,
    failedHttp: report.responses.filter(r => r.status >= 400) }, null, 2));
}
