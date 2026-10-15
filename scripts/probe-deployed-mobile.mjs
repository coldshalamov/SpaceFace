import { collectMobileCameraWitness } from './lib/mobileCameraWitness.mjs';
import { installMobileDrawErrorObserver } from './lib/mobileDrawErrorObserver.mjs';
// Real-route startup/control acceptance (world visibility requires separate evidence): fresh profile, real menu taps, no debug/state/storage injection.
// MOBILE_PROBE_URL=https://... MOBILE_PROBE_ENGINE=webkit node scripts/probe-deployed-mobile.mjs
// MOBILE_PROBE_CONTINUE=1 also reloads the same browser context and taps the public Continue route.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const url = new URL(process.env.MOBILE_PROBE_URL || 'https://spaceface-play-demo.vercel.app/');
if (!['https:', 'http:'].includes(url.protocol)) throw new Error('HTTP(S) deployment URL required');
const engine = process.env.MOBILE_PROBE_ENGINE || 'webkit';
if (!['webkit', 'chromium'].includes(engine)) throw new Error('Engine must be webkit or chromium');
const out = resolve(process.env.MOBILE_PROBE_OUT || `.devshots/mobile-deployment/${engine}`);
const checkContinue = process.env.MOBILE_PROBE_CONTINUE === '1';
const drawErrorMode = process.env.MOBILE_PROBE_DRAW_ERRORS || 'off';
const drawErrorProbe = ['1', 'on-error'].includes(drawErrorMode);
const headed = process.env.MOBILE_PROBE_HEADED === '1';
const channel = process.env.MOBILE_PROBE_CHANNEL || null;
if (channel && engine !== 'chromium') throw new Error('MOBILE_PROBE_CHANNEL is supported only for Chromium');
await mkdir(out, { recursive: true });
const report = { url: url.href, engine, startedAt: new Date().toISOString(), passed: false,
  launch: { headless: !headed, channel }, drawErrorProbe, drawErrorMode,
  acceptance: { startupAndControls: 'pending', continue: checkContinue ? 'pending' : 'not-requested',
    rendererHealth: 'pending', worldVisibility: 'unverified' },
  responses: [], requestFailures: [], pageErrors: [], console: [], stages: [], observations: [], lifecycle: [],
  startupErrors: [], runtimeMessages: [], rendererErrors: [], rendererErrorCount: 0,
  menuWaitObservations: [], finalDiagnosticErrors: [] };
const pendingDiagnosticReads = new Set();
let activeRoute = 'new-game';
let actorStage = 'boot-menu';
// Concrete GL failures only: ordinary warnings and intentional preview-context disposal are not gates.
const rendererError = text => /(?:WebGL|GL_INVALID|CONTEXT_LOST_WEBGL)/i.test(text)
  && /(?:drawElements.*(?:Vertex buffer is not big enough|out of bounds)|INVALID_.*(?:generateMipmap|mipmap|texture|framebuffer)|(?:generateMipmap|mipmap|texture|framebuffer).*(?:INVALID_|incomplete|not (?:valid|renderable)|unsupported)|OUT_OF_MEMORY)/i.test(text);
const noteRendererError = (text, source = 'console') => {
  report.rendererErrorCount++;
  if (report.rendererErrors.length < 32) report.rendererErrors.push({ route: activeRoute,
    actorStage, at: new Date().toISOString(), source, text: text.slice(0, 3000) });
};
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
      // Capture before the target action runs, so old errors cannot become new rejections.
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
      const saved = events.findLast(event => event.type === 'save:completed' && event.at >= startedAt);
      if (saved) return { saved: { source: 'save:completed', slot, ...saved } };
      const failed = events.findLast(event => event.type === 'save:error' && event.at >= startedAt);
      if (failed) return { failed };
      // Retail builds strip SF.bus. The selected row was verified empty before the public tap;
      // observing its new, real envelope is the durable-write receipt on that route.
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
  throw new Error(`Public Save did not emit save:completed within ${timeoutMs / 1000} seconds`);
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
  const lane = window.SF?.simLaneDiag?.();
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
    drawErrors: globalThis.__SF_MOBILE_DRAW_ERRORS__?.snapshot?.() || null,
    runtime: render || frame ? {
      gpu: render?.gpu,
      parallelCompile: render ? !!render.renderer?.extensions?.get('KHR_parallel_shader_compile') : undefined,
      debugStateAvailable: !!render,
      admission: render?.requiredPackageAdmission ?? null,
      cook: Array.isArray(render?.openingCookLedger) ? render.openingCookLedger.slice(-24) : null,
      context: { lost: frame?.contextLost ?? render?.contextLost ?? null,
        recovery: render?.contextRecovery ? { losses: render.contextRecovery.losses,
          restores: render.contextRecovery.restores, pending: render.contextRecovery.pending,
          generation: render.contextRecovery.generation, lastError: render.contextRecovery.lastError } : null },
      simLane: lane ? { lane: lane.lane, laneReady: lane.laneReady, closed: lane.closed,
        error: lane.error, errorSite: lane.errorSite, closeCauseMessage: lane.closeCauseMessage,
        closeCauseSite: lane.closeCauseSite, pendingRpcs: lane.pendingRpcs } : null,
      frame,
      render: graphics?.render,
      memory: graphics?.memory,
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
async function captureFailureDiagnostics(page, { report, snapshot, screenshotPath }) {
  try { report.final = await snapshot(page, true); }
  catch (diagnosticError) {
    report.final = null;
    report.finalDiagnosticErrors.push({ kind: 'final-snapshot', at: new Date().toISOString(),
      error: String(diagnosticError?.stack || diagnosticError) });
  }
  try { await page.screenshot({ path: screenshotPath, timeout: 15000 }); }
  catch (diagnosticError) {
    report.finalDiagnosticErrors.push({ kind: 'failure-screenshot', at: new Date().toISOString(),
      error: String(diagnosticError?.stack || diagnosticError) });
  }
}
const visible = async (page, selector) => boundedBrowserRead(() => page.locator(selector).first().isVisible()).catch(() => false);
const critical = response => response.status >= 400 && (
  /\.(?:glb|wasm|m?js)(?:\?|$)/.test(response.url) || /\/assets\/ships\/motions\/.*\.json(?:\?|$)/.test(response.url));
try {
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: !headed,
    ...(channel ? { channel } : {}),
    ...(engine === 'chromium' ? { args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] } : {}) });
  const context = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block',
    // Official Vercel E2E header: exclude preview-only feedback UI, not game code
    // or deployment protection. Production visitors do not normally load this toolbar.
    extraHTTPHeaders: { 'x-vercel-skip-toolbar': '1' } });
  if (drawErrorProbe) await context.addInitScript(installMobileDrawErrorObserver,
    { startArmed: drawErrorMode === '1' });
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
    const route = activeRoute;
    const stage = actorStage, at = new Date().toISOString();
    if (rendererError(text)) noteRendererError(text);
    if (drawErrorMode === 'on-error' && !report.drawErrorArm
        && ['error', 'warning'].includes(message.type())
        && /(?:WebGL|GL_INVALID_OPERATION)/i.test(text)
        && /(?:gl)?draw(?:Range)?Elements(?:Instanced)?/i.test(text)
        && /INVALID_OPERATION|Vertex buffer is not big enough|out of bounds/i.test(text)) {
      const trigger = { route, actorStage: stage, at, text: text.slice(0, 3000) };
      report.drawErrorArm = { ...trigger };
      const read = boundedBrowserRead(() => page.evaluate(trigger => {
        const observer = globalThis.__SF_MOBILE_DRAW_ERRORS__;
        observer?.arm?.(trigger);
        return observer?.snapshot?.() || { available: false, reason: 'draw-observer-unavailable', ownership: 'unknown' };
      }, trigger)).then(observer => { report.drawErrorArm.observer = observer; }).catch(error => {
        report.drawErrorArm.unavailable = String(error?.message || error);
      });
      pendingDiagnosticReads.add(read);
      void read.finally(() => pendingDiagnosticReads.delete(read));
    }
    if (/\[render\] GPU:|\[opening-cook\]|\[startup\]|startup failed|\[simLane\]|PRESENTATION STALLED|WebGL.*context/i.test(text)) {
      if (report.runtimeMessages.length >= 64) report.runtimeMessages.shift();
      report.runtimeMessages.push({ route, actorStage: stage, at, type: message.type(), text: text.slice(0, 4000) });
    }
    if (/\[SpaceFace\].*(?:startup failed|save restore failed)|\[startup\].*(?:cook failed|warmup failed|preparation failed)|SimulationRunner is closed|PRESENTATION STALLED/.test(text)) {
      // Error.message text drops custom readiness code/stage in production. Read the original
      // console arguments; this observes the release route without enabling its mutable debug API.
      const read = boundedBrowserRead(() => Promise.all(message.args().slice(0, 5).map(arg => arg.evaluate(value => {
        if (!value || typeof value !== 'object') return null;
        const error = (v, depth) => {
          const result = {};
          for (const key of ['name', 'message', 'code', 'stage', 'stack', 'retryable']) {
            const field = v?.[key];
            if (typeof field === 'string') result[key] = field.slice(0, key === 'stack' ? 6000 : 3000);
            else if (typeof field === 'boolean') result[key] = field;
          }
          if (depth && v?.cause) result.cause = typeof v.cause === 'object'
            ? error(v.cause, depth - 1) : String(v.cause).slice(0, 3000);
          return result;
        };
        return error(value, 2);
      })))).then(args => {
        if (report.startupErrors.length < 16) report.startupErrors.push({ route, actorStage: stage, at, source: 'console-error-arguments',
          text: text.slice(0, 3000), errors: args.filter(value => value && Object.keys(value).length) });
      }).catch(error => {
        if (report.startupErrors.length < 16) report.startupErrors.push({ route, actorStage: stage, at, source: 'console-error-arguments',
          text: text.slice(0, 3000), unavailable: String(error?.message || error) });
      });
      pendingDiagnosticReads.add(read);
      void read.finally(() => pendingDiagnosticReads.delete(read));
    }
    if (message.type() === 'log' && /\[render\] GPU:|\[opening-cook\]/.test(message.text()))
      console.log(`[mobile:${engine}] ${message.text()}`);
    if (['error', 'warning'].includes(message.type()) && !/was preloaded using link preload/.test(message.text())) {
      if (report.console.length >= 250) report.console.shift();
      report.console.push({ route, actorStage: stage, at, type: message.type(), text: message.text().slice(0, 3000) });
      console.log(`[mobile:${engine}:${message.type()}] ${message.text().slice(0, 2000)}`);
    }
  });
  page.on('requestfailed', request => {
    if (report.requestFailures.length < 500) report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame() && report.lifecycle.length < 64)
      report.lifecycle.push({ event: 'main-frame-navigation', url: frame.url(), at: new Date().toISOString() });
  });
  page.on('response', response => {
    if (report.responses.length < 3000) report.responses.push({ url: response.url(), status: response.status(),
      type: response.request().resourceType(), mime: response.headers()['content-type'], bytes: response.headers()['content-length'] });
  });
  const navigation = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  report.navigation = { status: navigation?.status(), url: page.url() }; report.html = await boundedBrowserRead(() => page.content());
  const menu = '[data-screen="mainMenu"] button[data-action="newGame"]';
  const inspectMenuState = async (page, timeoutMs = 5000) => boundedBrowserRead(() => page.evaluate(() => {
    const visible = element => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const mainMenu = document.querySelector('[data-screen="mainMenu"]');
    const newGameButtons = [...document.querySelectorAll('[data-screen="mainMenu"] button[data-action="newGame"]')];
    const motionAsk = document.querySelector('[data-screen="motionAsk"]');
    const cinematic = document.querySelector('#cinematic-splash');
    const cinematicBegin = document.querySelector('#cinematic-splash .cine-begin');
    const motionFull = [...document.querySelectorAll('[data-screen="motionAsk"] button')]
      .find(element => /^Full/i.test(element.textContent || '')) || null;
    let frame = null, witnessReadError = null;
    try { frame = window.__SF_WITNESS__?.snapshot?.() || null; }
    catch (error) { witnessReadError = String(error?.stack || error); }
    return {
      available: true,
      timeOrigin: performance.timeOrigin,
      readyState: document.readyState,
      newGameButtonCount: newGameButtons.length,
      newGameButtonVisible: newGameButtons.some(visible),
      mainMenuVisible: visible(mainMenu),
      motionAskVisible: visible(motionAsk),
      motionFullVisible: visible(motionFull),
      cinematicVisible: visible(cinematic),
      cinematicBeginVisible: visible(cinematicBegin),
      witnessReadError,
      witnessFrame: frame ? { mode: frame.mode ?? null, tick: frame.tick ?? null,
        playerId: frame.playerId ?? null, loading: frame.loading ?? null } : null,
    };
  }), timeoutMs);
  const waitForMenu = async () => {
    const beforeMenu = Date.now();
    const deadline = beforeMenu + 180000;
    let nextObservationAt = beforeMenu;
    let lastState = null;
    while (Date.now() < deadline) {
      const remainingMs = deadline - Date.now();
      let state;
      try {
        state = await inspectMenuState(page, Math.min(5000, remainingMs));
        lastState = state;
        if (state.witnessReadError) report.menuWitnessReadError = state.witnessReadError;
      } catch (error) {
        state = { available: false, error: String(error?.stack || error) };
        lastState = state;
      }
      if (state.available !== false && state.mainMenuVisible && state.newGameButtonVisible) return;
      if (Date.now() >= nextObservationAt) {
        const observation = { route: activeRoute, actorStage, elapsedMs: Date.now() - beforeMenu,
          at: new Date().toISOString(), ...state };
        report.menuWaitObservations.push(observation);
        if (report.menuWaitObservations.length > 24) report.menuWaitObservations.shift();
        console.log(`[mobile:${engine}] menu wait ${JSON.stringify(observation)}`);
        await writeFile(join(out, 'progress.json'), JSON.stringify(report, null, 2));
        nextObservationAt = Date.now() + 10000;
      }
      if (state.available !== false && state.cinematicBeginVisible) {
        try { await tapControl('#cinematic-splash .cine-begin'); }
        catch (error) { state.cinematicTapError = String(error?.message || error); }
      }
      if (state.available !== false && state.motionFullVisible) {
        const motion = page.locator('[data-screen="motionAsk"] button').filter({ hasText: /^Full/i }).first();
        try { await tapControl(motion); }
        catch (error) { state.motionAskTapError = String(error?.message || error); }
      }
      await page.waitForTimeout(Math.min(1000, Math.max(1, deadline - Date.now())));
    }
    const detail = lastState
      ? `; last DOM/frame observation: ${JSON.stringify(lastState)}`
      : '; no DOM/frame observation completed';
    throw new Error(`Main menu never became playable within 180 seconds${detail}`);
  };
  const waitForFlight = async (route, launchAt) => {
    const label = route === 'continue' ? 'Continue' : 'New Game';
    let observations = 0;
    let leftMenu = false;
    const click = report.continueClick;
    const acceptedContinue = route === 'continue' && click?.action === 'continue'
      && click.isTrusted === true && !click.disabled && click.ariaDisabled !== 'true';
    let previousEvents = acceptedContinue ? click.simLaneEventsBeforeClick
      ?? report.stages?.findLast(stage => stage.stage === 'continue-menu')?.simLaneEvents ?? [] : [];
    while (Date.now() - launchAt < 300000) {
      await page.waitForTimeout(2000);
      const state = await snapshot(page);
      const mode = state.runtime?.frame?.mode;
      if (mode && mode !== 'menu') leftMenu = true;
      report.observations.push({ route, elapsedMs: Date.now() - launchAt, ...state });
      if (observations++ % 5 === 0) {
        console.log(JSON.stringify({ engine, route, elapsedMs: Date.now() - launchAt,
          loading: state.loading, flight: state.flight,
          gpu: state.runtime?.gpu, parallelCompile: state.runtime?.parallelCompile,
          admission: state.runtime?.admission, lastCookStep: state.runtime?.cook?.at(-1) }));
        await writeFile(join(out, 'progress.json'), JSON.stringify(report, null, 2));
      }
      let appendedEvents = [];
      if (acceptedContinue && Array.isArray(state.simLaneEvents)) {
        // This buffer is a bounded suffix: match its overlap so old errors stay historical.
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
        const feedback = [...new Set([state.toastLive, ...(state.toasts || [])].filter(Boolean))];
        report.continueRejection = { elapsedMs: Date.now() - launchAt, feedback, appendedEvents };
        throw new Error(`Continue received a new save:error after its accepted click${feedback.length
          ? ': ' + feedback.join(' | ') : '; save feedback unavailable'}`);
      }
      const consoleRows = report.console.filter(entry => entry.route === route);
      if (consoleRows.some(entry => /\[SpaceFace\].*(?:startup failed|save restore failed)/.test(entry.text))
          || state.startupObserver?.events?.some(event => event.type === 'game:startFailed'
            || (route !== 'continue' && event.type === 'save:error' && event.reason === 'load_failed')))
        throw new Error(`${label} reported a startup-readiness failure; see structured errors and failed asset URLs`);
      if (/SimulationRunner is closed/.test(state.runtime?.frame?.lastFrameError || '')
          || consoleRows.some(entry => /SimulationRunner is closed|PRESENTATION STALLED/.test(entry.text)))
        throw new Error('Game reported a terminal simulation or presentation failure; see runtime and console');
      if (!state.loading.length && state.launchButton && !state.launchButton.disabled
          && state.alerts.some(text => /could not finish loading|did not finish preparing|could not start/i.test(text)))
        throw new Error(`Game refused mobile startup: ${state.alerts.filter(Boolean).join(' ')}`);
      if (state.flight === '1' && !state.loading.length
          && Number.isFinite(state.runtime?.post?.firstPlayableFrameAt)) return Date.now() - launchAt;
      if (leftMenu && mode === 'menu' && !state.loading.length
          && Date.now() - launchAt > 5000 && await visible(page, menu))
        throw new Error(`${label} returned to the main menu without entering flight`);
    }
    throw new Error(`${label} did not reach mobile flight UI with the loading shell cleared within five minutes`);
  };
  await waitForMenu();
  await page.screenshot({ path: join(out, '01-menu.png') });
  await boundedBrowserRead(() => page.evaluate(installStartupObserver));
  report.stages.push({ stage: 'menu', ...await snapshot(page) });
  console.log(`[mobile:${engine}] menu ready`);
  actorStage = 'new-game-menu';
  await tapControl(menu);
  await page.locator('.sf-ng-launch').waitFor({ state: 'visible', timeout: 30000 });
  report.stages.push({ stage: 'new-game', ...await snapshot(page) });
  console.log(`[mobile:${engine}] launching`);
  await page.screenshot({ path: join(out, '02-new-game.png') });
  actorStage = 'new-game-launch';
  await tapControl('.sf-ng-launch');
  report.launchMs = await waitForFlight('new-game', Date.now());
  actorStage = 'new-game-flight-controls';
  report.stages.push({ stage: 'flight', ...await snapshot(page, true) });
  await page.screenshot({ path: join(out, '03-flight.png') });
  // Only the player-facing DOM is read. Keyboard labels alone are not mobile acceptance.
  for (const selector of ['.mf-gun', '.mf-tether', '.mf-edge', '.mf-pause']) {
    if (!(await visible(page, selector))) throw new Error(`Missing visible touch control: ${selector}`);
  }
  actorStage = 'new-game-powers';
  await page.locator('.mf-edge').tap();
  await page.locator('.mf-wheel').waitFor({ state: 'visible' });
  await page.screenshot({ path: join(out, '04-powers.png') });
  await page.touchscreen.tap(100, 320);
  await page.locator('.mf-wheel').waitFor({ state: 'hidden' });
  actorStage = 'new-game-pause';
  await page.locator('.mf-pause').tap();
  await page.locator('[data-screen="pause"]').waitFor({ state: 'visible' });
  report.stages.push({ stage: 'pause', ...await snapshot(page) });
  await page.screenshot({ path: join(out, '05-pause.png') });
  actorStage = 'new-game-resume';
  await page.locator('[data-screen="pause"] button').filter({ hasText: /^Resume/i }).first().tap();
  await page.locator('[data-screen="pause"]').waitFor({ state: 'hidden' });
  actorStage = 'new-game-rotation';
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
  if (report.responses.some(critical)) throw new Error('Runtime script, model or decoder returned an HTTP error');
  actorStage = 'new-game-post-rotation';
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
  report.acceptance.startupAndControls = 'passed';
  if (checkContinue) {
    activeRoute = 'continue';
    actorStage = 'continue-save-open-pause';
    await page.locator('.mf-pause').tap();
    await page.locator('[data-screen="pause"]').waitFor({ state: 'visible' });
    actorStage = 'continue-save-open-menu';
    await tapControl(page.locator('[data-screen="pause"] button').filter({ hasText: /^Save$/i }).first());
    await page.locator('[data-screen="saveLoad"]').waitFor({ state: 'visible' });
    actorStage = 'continue-save-select-empty';
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
    actorStage = 'continue-save-write';
    await tapControl('[data-screen="saveLoad"] button[data-action="save"]');
    report.saveClick = await boundedBrowserRead(() => page.evaluate(() =>
      window.__SF_MOBILE_STARTUP_OBSERVER__?.snapshot?.()?.lastPublicClick || null));
    if (report.saveClick?.action !== 'save' || report.saveClick.isTrusted !== true)
      throw new Error('Save here public touch was not delivered to the Save control');
    actorStage = 'continue-save-receipt';
    report.saveReceipt = await waitForPublicSave(page, { slot: saveSlot, afterAt: saveAt });
    report.stages.push({ stage: 'continue-save-completed', saveReceipt: report.saveReceipt, ...await snapshot(page) });
    actorStage = 'continue-reload';
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForMenu();
    actorStage = 'continue-menu';
    await boundedBrowserRead(() => page.evaluate(installStartupObserver));
    report.stages.push({ stage: 'continue-menu', ...await snapshot(page) });
    await page.screenshot({ path: join(out, '07-continue-menu.png') });
    actorStage = 'continue-enabled-wait';
    await waitForContinueEnabled(page);
    actorStage = 'continue-launch';
    await tapControl('[data-screen="mainMenu"] button[data-action="continue"]');
    const continueClick = await boundedBrowserRead(() => page.evaluate(() =>
      window.__SF_MOBILE_STARTUP_OBSERVER__?.snapshot?.()?.lastPublicClick || null));
    report.continueClick = continueClick;
    if (continueClick?.action !== 'continue' || continueClick.disabled || continueClick.ariaDisabled === 'true')
      throw new Error('Continue public tap was not delivered to an enabled Continue control');
    report.continueLaunchMs = await waitForFlight('continue', Date.now());
    actorStage = 'continue-flight-controls';
    report.stages.push({ stage: 'continue-flight', ...await snapshot(page, true) });
    await page.screenshot({ path: join(out, '08-continue-flight.png') });
    for (const selector of ['.mf-gun', '.mf-tether', '.mf-pause']) {
      if (!(await visible(page, selector))) throw new Error(`Continue is missing a visible touch control: ${selector}`);
    }
    if (report.pageErrors.length) throw new Error(`${report.pageErrors.length} unhandled page error(s)`);
    if (report.responses.some(critical)) throw new Error('Runtime script, model or decoder returned an HTTP error');
    report.acceptance.continue = 'passed';
  }
  report.passed = true; // Renderer health is applied below; world visibility remains unverified.
} catch (error) {
  report.failedStage = actorStage;
  if (activeRoute === 'continue') report.acceptance.continue = 'failed';
  else {
    report.acceptance.startupAndControls = 'failed';
    if (checkContinue) report.acceptance.continue = 'not-run-new-game-failed';
  }
  report.failure = String(error?.stack || error);
  const page = browser?.contexts()[0]?.pages()[0];
  if (page && !page.isClosed()) {
    await captureFailureDiagnostics(page, { report, snapshot, screenshotPath: join(out, 'failure.png') });
  }
  process.exitCode = 1;
} finally {
  await Promise.allSettled([...pendingDiagnosticReads]);
  const contextFailures = new Set();
  let observedInvalidDraws = 0;
  // Preview contexts are deliberately retired; only loss of the main game canvas fails health.
  for (const state of [...report.stages, ...report.observations, report.final].filter(Boolean)) {
    if (drawErrorProbe) observedInvalidDraws = Math.max(observedInvalidDraws,
      state.drawErrors?.invalidDraws || (state.drawErrors?.witnesses?.length ? 1 : 0));
    if (state.runtime?.context?.lost === true) contextFailures.add('main WebGL context reported lost');
    for (const event of state.startupObserver?.events || []) {
      if (event.canvasId === 'gl-canvas' && ['webglcontextlost', 'webglcontextcreationerror'].includes(event.type))
        contextFailures.add(`main canvas ${event.type}: ${event.statusMessage || 'no driver message'}`);
    }
  }
  for (const text of contextFailures) noteRendererError(text, 'runtime-context');
  if (observedInvalidDraws) noteRendererError(
    `Indexed draw observer recorded INVALID_OPERATION (${observedInvalidDraws} invalid draw(s)); see drawErrors witnesses`,
    'draw-observer');
  report.acceptance.rendererHealth = report.rendererErrorCount ? 'failed'
    : report.acceptance.startupAndControls === 'passed' ? 'passed' : 'unverified';
  if (report.rendererErrorCount) {
    report.passed = false;
    report.failure ||= `Renderer health failed: ${report.rendererErrorCount} concrete WebGL error(s); see rendererErrors`;
    process.exitCode = 1;
  }
  // Persist diagnostics before a crashed renderer can stall browser shutdown.
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await Promise.race([browser?.close(), new Promise(resolve => {
    const timer = setTimeout(resolve, 5000); timer.unref();
  })]);
  console.log(JSON.stringify({ engine, passed: report.passed, acceptance: report.acceptance,
    launchMs: report.launchMs, continueLaunchMs: report.continueLaunchMs, rendererErrorCount: report.rendererErrorCount,
    failure: report.failure, final: report.final, pageErrors: report.pageErrors,
    failedHttp: report.responses.filter(r => r.status >= 400) }, null, 2));
}
