import { collectMobileCameraWitness } from './lib/mobileCameraWitness.mjs';
import {
  createMobileResponseLedger,
  observedWorkerFailures,
  recordMobileRequestFailure,
  recordMobileResponse,
  resolveWorkerContractUrls,
  runMobileWorkerContract,
} from './lib/mobileWorkerContract.mjs';
// Real-route startup/control acceptance (world visibility requires separate evidence): fresh profile, real menu taps, no debug/state/storage injection.
// MOBILE_PROBE_URL=https://... MOBILE_PROBE_ENGINE=webkit node scripts/probe-deployed-mobile.mjs
// Raw local servers must be started with SPACEFACE_PLAYER_STORE_DIR='' so this actor never touches a shared save drawer.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const url = new URL(process.env.MOBILE_PROBE_URL || 'https://spaceface-play-demo.vercel.app/');
if (!['https:', 'http:'].includes(url.protocol)) throw new Error('HTTP(S) deployment URL required');
const engine = process.env.MOBILE_PROBE_ENGINE || 'webkit';
if (!['webkit', 'chromium'].includes(engine)) throw new Error('Engine must be webkit or chromium');
const out = resolve(process.env.MOBILE_PROBE_OUT || `.devshots/mobile-deployment/${engine}`);
const checkContinue = process.env.MOBILE_PROBE_CONTINUE === '1';
await mkdir(out, { recursive: true });
const report = { url: url.href, engine, startedAt: new Date().toISOString(), passed: false,
  acceptance: { startupAndControls: 'pending', continue: checkContinue ? 'pending' : 'not-requested',
    rendererHealth: 'pending', worldVisibility: 'unverified' },
  continue: { requested: checkContinue, status: checkContinue ? 'pending' : 'not-requested' },
  rendererErrors: [], rendererErrorCount: 0,
  ...createMobileResponseLedger(), pageErrors: [], console: [], stages: [], observations: [], lifecycle: [] };
const MAX_RENDERER_ERROR_SAMPLES = 32;
// Concrete WebGL failures are renderer-health evidence. Ordinary warnings remain
// diagnostics, while error-level INVALID/context-loss messages fail the run.
function isConcreteRendererConsoleError(type, text) {
  if (type !== 'error') return false;
  const value = String(text || '');
  if (!/(?:WebGL|GL_INVALID|CONTEXT_LOST_WEBGL)/i.test(value)) return false;
  return /(?:CONTEXT_LOST_WEBGL|GL_INVALID_[A-Z_]+|WebGL[^\n]*(?:INVALID_[A-Z_]+|CONTEXT_LOST_WEBGL)|WebGL[^\n]*(?:context\s+(?:was\s+)?lost)|WebGL[^\n]*(?:draw(?:Range)?Elements(?:Instanced)?|Vertex buffer|out of bounds|OUT_OF_MEMORY))/i.test(value);
}
function noteRendererError(target, text, route, stage, source = 'console') {
  target.rendererErrorCount++;
  if (target.rendererErrors.length < MAX_RENDERER_ERROR_SAMPLES) {
    target.rendererErrors.push({ route, actorStage: stage, at: new Date().toISOString(), source,
      text: String(text || '').slice(0, 3000) });
  }
}
function finalizeRendererHealth(target) {
  target.acceptance.rendererHealth = target.rendererErrorCount ? 'failed'
    : target.acceptance.startupAndControls === 'passed' ? 'passed' : 'unverified';
  if (target.rendererErrorCount) {
    target.passed = false;
    target.failure ||= `Renderer health failed: ${target.rendererErrorCount} concrete WebGL error(s); see rendererErrors`;
    return false;
  }
  return true;
}
let browser;
let activeRoute = 'new-game';
let actorStage = 'boot-menu';
report.activeRoute = activeRoute;
report.actorStage = actorStage;
const setActorStage = stage => {
  actorStage = stage;
  report.activeRoute = activeRoute;
  report.actorStage = actorStage;
};
const setRoute = route => {
  activeRoute = route;
  report.activeRoute = activeRoute;
  report.actorStage = actorStage;
};
async function boundedBrowserRead(read, timeoutMs = 20000) {
  let timer;
  try {
    return await Promise.race([read(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Mobile renderer stopped answering for ${timeoutMs / 1000} seconds`)), timeoutMs);
      timer.unref();
    })]);
  } finally { clearTimeout(timer); }
}
function assertContinuePageHealth(pageErrors, baseline = 0) {
  const observed = Array.isArray(pageErrors) ? pageErrors.length : 0;
  if (observed > baseline)
    throw new Error(`Continue produced ${observed - baseline} page error(s)`);
}
function installStartupObserver() {
  window.__SF_MOBILE_STARTUP_OBSERVER__?.stop?.();
  const bus = window.SF?.bus;
  const events = [], unsubs = [];
  let lastPublicClick = null;
  const record = (type, payload = {}) => {
    if (events.length >= 64) events.shift();
    events.push({ type, at: performance.now(), ...payload });
  };
  if (typeof bus?.on === 'function') {
    for (const type of ['game:startFailed', 'save:error', 'save:completed', 'mode:changed', 'game:loadingProgress']) {
      unsubs.push(bus.on(type, payload => {
        const row = {};
        for (const key of ['code', 'stage', 'error', 'text', 'retryable', 'reason', 'mode', 'previousMode',
          'id', 'label', 'detail', 'transition', 'progress', 'slot']) {
          const value = payload?.[key];
          if (typeof value === 'string') row[key] = value.slice(0, 3000);
          else if (typeof value === 'number' || typeof value === 'boolean') row[key] = value;
        }
        record(type, row);
      }));
    }
  }
  const contextEvent = event => record(event.type, { canvasId: event.target?.id || null,
    canvasClass: typeof event.target?.className === 'string' ? event.target.className : null,
    width: event.target?.width ?? null, height: event.target?.height ?? null,
    statusMessage: String(event.statusMessage || '').slice(0, 1000) });
  for (const type of ['webglcontextlost', 'webglcontextrestored', 'webglcontextcreationerror']) {
    document.addEventListener(type, contextEvent, true);
    unsubs.push(() => document.removeEventListener(type, contextEvent, true));
  }
  const publicClick = event => {
    const control = event.target?.closest?.('button[data-action], .sf-ng-launch');
    if (!control) return;
    lastPublicClick = { at: performance.now(), action: control.getAttribute('data-action')
      || (control.classList.contains('sf-ng-launch') ? 'launch' : null),
      text: String(control.textContent || '').slice(0, 200), disabled: control.disabled === true,
      ariaDisabled: control.getAttribute('aria-disabled'), isTrusted: event.isTrusted,
      clientX: event.clientX, clientY: event.clientY,
      mode: window.__SF_WITNESS__?.snapshot?.()?.mode ?? window.SF?.state?.mode ?? null,
      simLaneEventsBeforeClick: Array.isArray(window.__SF_LANE_APPLIED)
        ? window.__SF_LANE_APPLIED.slice(-96).filter(type => typeof type === 'string').map(type => type.slice(0, 200)) : [] };
  };
  document.addEventListener('click', publicClick, true);
  unsubs.push(() => document.removeEventListener('click', publicClick, true));
  window.__SF_MOBILE_STARTUP_OBSERVER__ = {
    snapshot: () => ({ busAvailable: typeof bus?.on === 'function', events: events.slice(),
      lastPublicClick: lastPublicClick ? { ...lastPublicClick,
        simLaneEventsBeforeClick: lastPublicClick.simLaneEventsBeforeClick.slice() } : null }),
    stop() { for (const off of unsubs) if (typeof off === 'function') off(); },
  };
}
async function waitForPublicSave(page, { slot, afterAt, timeoutMs = 90000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await boundedBrowserRead(() => page.evaluate(({ slot, startedAt }) => {
      const events = window.__SF_MOBILE_STARTUP_OBSERVER__?.snapshot?.()?.events || [];
      const saved = events.findLast(event => event.type === 'save:completed'
        && event.slot === slot && event.at >= startedAt);
      if (saved) return { saved: { source: 'save:completed', slot, ...saved } };
      const failed = events.findLast(event => event.type === 'save:error' && event.at >= startedAt);
      if (failed) return { failed };
      const raw = localStorage.getItem('sf.save.' + slot);
      if (raw) {
        try {
          const envelope = JSON.parse(raw);
          if (envelope && (envelope.fmt === 'spaceface-save' || envelope.fmt === 'spaceface-save-gz')) {
            return { saved: { source: 'storage-envelope', slot, format: envelope.fmt,
              savedAt: envelope.savedAt || null } };
          }
        } catch (_) { /* keep waiting for the complete envelope */ }
      }
      return null;
    }, { slot, startedAt: afterAt }), 5000);
    if (result?.saved) return result.saved;
    if (result?.failed) {
      const failed = result.failed;
      throw new Error(`Public Save failed: ${failed.text || failed.error || failed.reason || 'save:error'}`);
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Public Save did not emit a matching save:completed within ${timeoutMs / 1000} seconds`);
}
async function waitForContinueEnabled(page, timeoutMs = 60000) {
  try {
    await page.waitForFunction(() => {
      const control = document.querySelector('[data-screen="mainMenu"] button[data-action="continue"]');
      return !!control && !control.disabled && control.getAttribute('aria-disabled') !== 'true';
    }, null, { timeout: timeoutMs });
  } catch (error) {
    throw new Error(`Continue remained disabled after reload for ${timeoutMs / 1000} seconds: ${error?.message || error}`);
  }
}
const snapshotBase = page => boundedBrowserRead(() => page.evaluate(() => {
  const shown = e => !e.hidden && e.getBoundingClientRect().width > 0
    && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
  // Observer only; the actor below still uses the public menu and touch controls.
  const render = window.SF?.state?.render;
  const frame = window.__SF_WITNESS__?.snapshot?.();
  const graphics = window.__THREE_GAME_DIAGNOSTICS__?.getReport?.();
  return {
    launchButton: (() => { const e = document.querySelector('.sf-ng-launch'); return e ? { text: e.textContent, disabled: e.disabled, ariaDisabled: e.getAttribute('aria-disabled') } : null; })(),
    continueButton: (() => { const e = document.querySelector('[data-screen="mainMenu"] button[data-action="continue"]'); return e ? { text: e.textContent, disabled: e.disabled, ariaDisabled: e.getAttribute('aria-disabled'), visible: shown(e) } : null; })(),
    continueVeil: (() => { const e = document.querySelector('.sf-continue-fade'); return e ? { open: e.classList.contains('open'), visible: shown(e) && Number(getComputedStyle(e).opacity) > 0 } : null; })(),
    title: document.title, mobile: document.documentElement.dataset.sfMobile || null,
    flight: document.documentElement.dataset.sfMobileFlight || null,
    capabilities: { coarse: matchMedia('(pointer: coarse)').matches, anyCoarse: matchMedia('(any-pointer: coarse)').matches,
      touchPoints: navigator.maxTouchPoints ?? null, touchEvents: 'ontouchstart' in window,
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency ?? null },
    loading: [...document.querySelectorAll('[data-loading-label], [data-loading-detail]')].filter(shown).map(e => e.textContent),
    screens: [...document.querySelectorAll('[data-screen]')].filter(shown).map(e => e.dataset.screen),
    alerts: [...document.querySelectorAll('[role="alert"], .boot-error')].filter(shown).map(e => e.textContent),
    toastLive: (document.getElementById('toast-live')?.textContent || '').slice(0, 3000),
    toasts: [...document.querySelectorAll('.sf-toast__text')].slice(-4).map(e => (e.textContent || '').slice(0, 3000)),
    startupObserver: window.__SF_MOBILE_STARTUP_OBSERVER__?.snapshot?.() || null,
    simLaneEvents: Array.isArray(window.__SF_LANE_APPLIED)
      ? window.__SF_LANE_APPLIED.slice(-96).filter(type => typeof type === 'string').map(type => type.slice(0, 200)) : null,
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
const snapshot = async (page, includeCamera = false) => {
  const result = await snapshotBase(page);
  if (includeCamera) {
    const observerStartedAt = performance.now();
    result.cameraWitness = await boundedBrowserRead(() => page.evaluate(collectMobileCameraWitness))
      .catch(error => ({ available: false, reason: 'camera-witness-read-failed', error: String(error?.message || error) }));
    // Observer round-trip cost, not gameplay/frame performance and never a pass criterion.
    result.cameraWitness.observerElapsedMs = Math.max(0, performance.now() - observerStartedAt);
  }
  return result;
};
const visible = async (page, selector) => boundedBrowserRead(() => page.locator(selector).first().isVisible()).catch(() => false);
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
    const text = message.text();
    if (isConcreteRendererConsoleError(message.type(), text))
      noteRendererError(report, text, activeRoute, actorStage);
    if (message.type() === 'log' && /\[render\] GPU:|\[opening-cook\]/.test(text))
      console.log(`[mobile:${engine}] ${text}`);
    if (['error', 'warning'].includes(message.type()) && !/was preloaded using link preload/.test(text)) {
      if (report.console.length >= 250) report.console.shift();
      report.console.push({ route: activeRoute, actorStage, type: message.type(), text: text.slice(0, 3000) });
      console.log(`[mobile:${engine}:${message.type()}] ${text.slice(0, 2000)}`);
    }
  });
  page.on('requestfailed', request => {
    recordMobileRequestFailure(report, {
      url: request.url(),
      error: request.failure()?.errorText,
      resourceType: request.resourceType?.() || null,
      actorStage,
      timestamp: new Date().toISOString(),
    });
  });
  page.on('response', response => {
    recordMobileResponse(report, { url: response.url(), status: response.status(),
      type: response.request().resourceType(), mime: response.headers()['content-type'], bytes: response.headers()['content-length'] });
  });
  const navigation = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  report.navigation = { status: navigation?.status(), url: page.url() }; report.html = await boundedBrowserRead(() => page.content());
  const menu = '[data-screen="mainMenu"] button[data-action="newGame"]';
  const waitForMenu = async () => {
    const beforeMenu = Date.now();
    const deadline = beforeMenu + 180000;
    while (Date.now() < deadline) {
      if (await visible(page, menu)) return;
      if (await visible(page, '#cinematic-splash .cine-begin'))
        await tapControl('#cinematic-splash .cine-begin').catch(() => {});
      const motion = page.locator('[data-screen="motionAsk"] button').filter({ hasText: /^Full/i }).first();
      if (await boundedBrowserRead(() => motion.isVisible()).catch(() => false)) await tapControl(motion);
      await page.waitForTimeout(1000);
    }
    throw new Error('Main menu never became playable within 180 seconds');
  };
  const waitForFlight = async (route, launchAt) => {
    const label = route === 'continue' ? 'Continue' : 'New Game';
    const click = report.continueClick;
    const acceptedContinue = route === 'continue' && click?.action === 'continue'
      && click.isTrusted === true && !click.disabled && click.ariaDisabled !== 'true';
    let previousEvents = acceptedContinue ? click.simLaneEventsBeforeClick || [] : [];
    let leftMenu = false;
    let previousTick = null;
    let previousSimTime = null;
    let advanced = route !== 'continue';
    const publicRecoveryFeedback = state => [...new Set([...(state?.alerts || []), state?.toastLive,
      ...(state?.toasts || [])].map(text => String(text || '').trim()).filter(Boolean))];
    const routeRows = () => report.console.filter(entry => entry.route === route);
    while (Date.now() - launchAt < 300000) {
      await page.waitForTimeout(2000);
      const state = await snapshot(page);
      const mode = state.runtime?.frame?.mode;
      if (state.flight === '1' || (mode && mode !== 'menu')) leftMenu = true;
      if (route === 'continue') {
        const tick = Number(state.runtime?.frame?.tick);
        const simTime = Number(state.runtime?.frame?.simTime ?? state.runtime?.frame?.time);
        if (Number.isFinite(tick)) {
          if (Number.isFinite(previousTick) && tick > previousTick) advanced = true;
          previousTick = tick;
        }
        if (Number.isFinite(simTime)) {
          if (Number.isFinite(previousSimTime) && simTime > previousSimTime) advanced = true;
          previousSimTime = simTime;
        }
      }
      report.observations.push({ route, elapsedMs: Date.now() - launchAt, ...state });
      if (report.observations.length % 5 === 1) {
        console.log(JSON.stringify({ engine, route, elapsedMs: Date.now() - launchAt,
          loading: state.loading, flight: state.flight, gpu: state.runtime?.gpu,
          parallelCompile: state.runtime?.parallelCompile, admission: state.runtime?.admission,
          lastCookStep: state.runtime?.cook?.at(-1) }));
        await writeFile(join(out, 'progress.json'), JSON.stringify(report, null, 2));
      }
      let appendedEvents = [];
      if (acceptedContinue && Array.isArray(state.simLaneEvents)) {
        let overlap = Math.min(previousEvents.length, state.simLaneEvents.length);
        for (; overlap > 0; overlap--) {
          let matches = true;
          for (let i = 0; i < overlap; i++) {
            if (previousEvents[previousEvents.length - overlap + i] !== state.simLaneEvents[i]) { matches = false; break; }
          }
          if (matches) break;
        }
        appendedEvents = state.simLaneEvents.slice(overlap);
        previousEvents = state.simLaneEvents;
      }
      if (acceptedContinue && (appendedEvents.includes('save:error')
          || state.startupObserver?.events?.some(event => event.type === 'save:error' && event.at > click.at))) {
        const feedback = publicRecoveryFeedback(state);
        report.continueRejection = { elapsedMs: Date.now() - launchAt, feedback, appendedEvents,
          debugBusAvailable: state.startupObserver?.busAvailable === true };
        throw new Error(`Continue received a new save:error after its accepted click${feedback.length
          ? ': ' + feedback.join(' | ') : '; save feedback unavailable'}`);
      }
      if (routeRows().some(entry => /\[SpaceFace\].*(?:startup failed|save restore failed)/.test(entry.text))
          || state.startupObserver?.events?.some(event => event.type === 'game:startFailed')) {
        const feedback = publicRecoveryFeedback(state);
        report.startupFailureObservation = { route, elapsedMs: Date.now() - launchAt, feedback,
          debugBusAvailable: state.startupObserver?.busAvailable === true };
        throw new Error(`${label} reported a startup-readiness failure${feedback.length
          ? `: ${feedback.join(' | ')}` : '; no visible public recovery text was found'}; see structured errors and failed asset URLs`);
      }
      if (/SimulationRunner is closed/.test(state.runtime?.frame?.lastFrameError || '')
          || routeRows().some(entry => /SimulationRunner is closed|PRESENTATION STALLED/.test(entry.text)))
        throw new Error('Game reported a terminal simulation or presentation failure; see runtime and console');
      if (!state.loading.length && state.launchButton && !state.launchButton.disabled
          && state.alerts.some(text => /could not finish loading|did not finish preparing|could not start/i.test(text)))
        throw new Error(`${label} refused mobile startup: ${state.alerts.filter(Boolean).join(' ')}`);
      if (state.flight === '1' && !state.loading.length
          && Number.isFinite(state.runtime?.post?.firstPlayableFrameAt) && advanced) return Date.now() - launchAt;
      if (leftMenu && (mode === 'menu' || state.screens?.includes('mainMenu')) && !state.loading.length && Date.now() - launchAt > 5000
          && await visible(page, menu)) {
        const feedback = publicRecoveryFeedback(state);
        report.returnedToMenu = { route, elapsedMs: Date.now() - launchAt, feedback };
        throw new Error(`${label} returned to the main menu without entering flight${feedback.length
          ? ': ' + feedback.join(' | ') : '; no visible public recovery text was found'}`);
      }
    }
    if (route === 'continue' && !advanced)
      throw new Error('Continue did not observe an advancing simulation tick or simTime after reload');
    throw new Error(`${label} did not reach mobile flight UI with the loading shell cleared within five minutes`);
  };
  setActorStage('boot-menu');
  await waitForMenu();
  await page.screenshot({ path: join(out, '01-menu.png') });
  if (!(await visible(page, menu))) throw new Error('Main menu never became playable');
  await boundedBrowserRead(() => page.evaluate(installStartupObserver));
  report.stages.push({ stage: 'menu', ...await snapshot(page) });
  console.log(`[mobile:${engine}] menu ready`);
  setActorStage('new-game-menu');
  await tapControl(menu);
  await page.locator('.sf-ng-launch').waitFor({ state: 'visible', timeout: 30000 });
  report.stages.push({ stage: 'new-game', ...await snapshot(page) });
  console.log(`[mobile:${engine}] launching`);
  await page.screenshot({ path: join(out, '02-new-game.png') });
  setActorStage('new-game-launch');
  await tapControl('.sf-ng-launch');
  report.launchMs = await waitForFlight('new-game', Date.now());
  report.stages.push({ stage: 'flight', ...await snapshot(page, true) });
  await page.screenshot({ path: join(out, '03-flight.png') });
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
  const landscape = await snapshot(page, true); report.stages.push({ stage: 'landscape', ...landscape });
  if (landscape.flight !== '1') throw new Error('Touch flight did not survive rotation');
  await page.screenshot({ path: join(out, '06-landscape.png') });
  for (const selector of ['.mf-gun', '.mf-tether', '.mf-pause']) {
    const box = await page.locator(selector).boundingBox();
    if (!box || box.x < 0 || box.y < 0 || box.x + box.width > 845 || box.y + box.height > 391)
      throw new Error(`Control clipped after rotation: ${selector} ${JSON.stringify(box)}`);
  }
  if (report.pageErrors.length) throw new Error(`${report.pageErrors.length} unhandled page error(s)`);
  const pageUrl = new URL(page.url());
  const detectedReleaseBase = report.html?.match(/(?:https?:\/\/[^"']+)?(\/_releases\/[^"']+\/)main\.js/)?.[1] || '';
  const releaseBase = process.env.MOBILE_WORKER_RELEASE_BASE || detectedReleaseBase;
  const mode = process.env.MOBILE_WORKER_MODE || (releaseBase ? 'pinned' : 'retail');
  if (!['raw', 'retail', 'pinned'].includes(mode)) throw new Error(`Unknown MOBILE_WORKER_MODE: ${mode}`);
  if (mode === 'pinned' && !releaseBase) throw new Error('Pinned worker mode requires MOBILE_WORKER_RELEASE_BASE or a pinned main.js URL');
  const workerUrls = resolveWorkerContractUrls({ moduleUrl: pageUrl.href, production: mode !== 'raw',
    documentBase: pageUrl.href, releaseBase: mode === 'pinned' ? releaseBase : '' });
  report.workerUrls = workerUrls;
  report.workerObservedFailures = observedWorkerFailures(report.responses, workerUrls, report.workerResponseFailures);
  // A lazy worker may have no response entry at all.  The native contract is
  // authoritative in that case; observed bad status/MIME remains a failure.
  report.workerContract = await runMobileWorkerContract(page, { workerUrls });
  if (report.workerObservedFailures.length) {
    throw new Error(`Observed runtime worker response failure: ${JSON.stringify(report.workerObservedFailures)}`);
  }
  if (report.criticalResponseCount || report.criticalRequestFailureCount) {
    throw new Error(`Runtime script, model or decoder returned ${report.criticalResponseCount
      + report.criticalRequestFailureCount} critical HTTP failure(s)`);
  }
  report.acceptance.startupAndControls = 'passed';
  report.acceptance.workerContract = 'passed';
  setActorStage('new-game-post-rotation');
  if (checkContinue) {
    const continuePageErrorsBefore = report.pageErrors.length;
    setRoute('continue');
    setActorStage('continue-save-open-pause');
    await page.locator('.mf-pause').tap();
    await page.locator('[data-screen="pause"]').waitFor({ state: 'visible' });
    setActorStage('continue-save-open-menu');
    await tapControl(page.locator('[data-screen="pause"] button').filter({ hasText: /^Save$/i }).first());
    await page.locator('[data-screen="saveLoad"]').waitFor({ state: 'visible' });
    setActorStage('continue-save-select-empty');
    const emptyRows = page.locator('[data-screen="saveLoad"] .sf-slot.empty');
    await emptyRows.first().waitFor({ state: 'visible' });
    let emptySlot = null, saveSlot = null;
    for (let i = 0, count = await emptyRows.count(); i < count; i++) {
      const candidate = emptyRows.nth(i);
      const id = await candidate.getAttribute('data-id');
      if (!id) continue;
      const hasStoredEnvelope = await boundedBrowserRead(() => page.evaluate(slot =>
        localStorage.getItem('sf.save.' + slot) !== null, id));
      if (!hasStoredEnvelope) { emptySlot = candidate; saveSlot = id; break; }
    }
    if (!emptySlot) throw new Error('No empty Save slot without a stored envelope was available');
    report.saveSlot = saveSlot;
    await tapControl(emptySlot);
    const saveAt = await boundedBrowserRead(() => page.evaluate(() => performance.now()));
    setActorStage('continue-save-write');
    await tapControl('[data-screen="saveLoad"] button[data-action="save"]');
    report.saveClick = await boundedBrowserRead(() => page.evaluate(() =>
      window.__SF_MOBILE_STARTUP_OBSERVER__?.snapshot?.()?.lastPublicClick || null));
    if (report.saveClick?.action !== 'save' || report.saveClick.isTrusted !== true)
      throw new Error('Save here public touch was not delivered to the Save control');
    setActorStage('continue-save-receipt');
    report.saveReceipt = await waitForPublicSave(page, { slot: saveSlot, afterAt: saveAt });
    report.stages.push({ stage: 'continue-save-completed', saveReceipt: report.saveReceipt, ...await snapshot(page) });
    setActorStage('continue-reload');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForMenu();
    setActorStage('continue-menu');
    await boundedBrowserRead(() => page.evaluate(installStartupObserver));
    report.stages.push({ stage: 'continue-menu', ...await snapshot(page) });
    await page.screenshot({ path: join(out, '07-continue-menu.png') });
    setActorStage('continue-enabled-wait');
    await waitForContinueEnabled(page);
    setActorStage('continue-launch');
    await tapControl('[data-screen="mainMenu"] button[data-action="continue"]');
    const continueClick = await boundedBrowserRead(() => page.evaluate(() =>
      window.__SF_MOBILE_STARTUP_OBSERVER__?.snapshot?.()?.lastPublicClick || null));
    report.continueClick = continueClick;
    if (continueClick?.action !== 'continue' || continueClick.isTrusted !== true
        || continueClick.disabled || continueClick.ariaDisabled === 'true')
      throw new Error('Continue public tap was not delivered to an enabled Continue control');
    report.continueLaunchMs = await waitForFlight('continue', Date.now());
    setActorStage('continue-flight-controls');
    report.stages.push({ stage: 'continue-flight', ...await snapshot(page, true) });
    await page.screenshot({ path: join(out, '08-continue-flight.png') });
    for (const selector of ['.mf-gun', '.mf-tether', '.mf-pause']) {
      if (!(await visible(page, selector))) throw new Error(`Continue is missing a visible touch control: ${selector}`);
    }
    assertContinuePageHealth(report.pageErrors, continuePageErrorsBefore);
    report.workerObservedFailures = observedWorkerFailures(report.responses, report.workerUrls, report.workerResponseFailures);
    report.continueHttp = { responseCount: report.responseCount, criticalResponseCount: report.criticalResponseCount,
      criticalRequestFailureCount: report.criticalRequestFailureCount, workerResponseFailureCount: report.workerResponseFailureCount };
    if (report.workerObservedFailures.length) {
      throw new Error(`Continue observed runtime worker response failure: ${JSON.stringify(report.workerObservedFailures)}`);
    }
    if (report.criticalResponseCount || report.criticalRequestFailureCount) {
      throw new Error(`Continue observed ${report.criticalResponseCount + report.criticalRequestFailureCount} critical HTTP failure(s)`);
    }
    report.acceptance.continue = 'passed';
    report.continue.status = 'passed';
  }
  report.passed = true; // Requested route(s) passed; world visibility remains unverified.
} catch (error) {
  if (activeRoute === 'continue') {
    report.acceptance.continue = 'failed';
    report.continue.status = 'failed';
  } else {
    report.acceptance.startupAndControls = 'failed';
    if (checkContinue) {
      report.acceptance.continue = 'not-run-new-game-failed';
      report.continue.status = 'not-run-new-game-failed';
    }
  }
  report.activeRoute = activeRoute;
  report.actorStage = actorStage;
  report.failure = String(error?.stack || error);
  const page = browser?.contexts()[0]?.pages()[0];
  if (page && !page.isClosed()) {
    report.final = await snapshot(page, true).catch(() => null);
    await page.screenshot({ path: join(out, 'failure.png'), timeout: 15000 }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  const contextFailures = new Set();
  for (const state of [...report.stages, ...report.observations, report.final].filter(Boolean)) {
    for (const event of state.startupObserver?.events || []) {
      if (event.canvasId === 'gl-canvas' && ['webglcontextlost', 'webglcontextcreationerror'].includes(event.type))
        contextFailures.add(`main canvas ${event.type}: ${event.statusMessage || 'no driver message'}`);
    }
  }
  for (const text of contextFailures)
    noteRendererError(report, text, report.activeRoute, report.actorStage, 'runtime-context');
  finalizeRendererHealth(report);
  // Persist diagnostics before a crashed renderer can stall browser shutdown.
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await Promise.race([browser?.close(), new Promise(resolve => {
    const timer = setTimeout(resolve, 5000); timer.unref();
  })]);
  console.log(JSON.stringify({ engine, passed: report.passed, launchMs: report.launchMs,
    failure: report.failure, final: report.final, pageErrors: report.pageErrors,
    failedHttp: report.criticalResponses, criticalResponseCount: report.criticalResponseCount,
    workerResponseFailures: report.workerResponseFailures, rendererErrorCount: report.rendererErrorCount,
    rendererErrors: report.rendererErrors,
    failedRequests: report.criticalRequestFailures, criticalRequestFailureCount: report.criticalRequestFailureCount }, null, 2));
}
