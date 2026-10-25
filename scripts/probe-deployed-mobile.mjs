import { collectMobileCameraWitness } from './lib/mobileCameraWitness.mjs';
import { installMobileDrawErrorObserver } from './lib/mobileDrawErrorObserver.mjs';
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
// MOBILE_PROBE_CONTINUE=1 also reloads the same browser context and taps the public Continue route.
// MOBILE_PROBE_THROTTLE=handset applies handset timing acceptance (4x CPU + Slow-4G-class network)
//   through CDP — Chromium only; tokens cpu:<n> and net:slow4g|fast3g|slow3g|off may be combined
//   comma-separated (e.g. cpu:6,net:off). The 3G profiles are stress tokens, not the acceptance bar.
// MOBILE_PROBE_CONTEXT_LOSS=1 injects a WEBGL_lose_context driver reset mid-flight and requires the
//   public route to pause, rebuild, resume the simulation, and keep touch controls (D188 renderer recovery).
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
const throttleRequest = process.env.MOBILE_PROBE_THROTTLE || 'off';
const contextLossExercise = process.env.MOBILE_PROBE_CONTEXT_LOSS === '1';
const mobileDeviceName = 'iPhone 14';
const mobileDeviceProfile = devices[mobileDeviceName];
// Chromium's literal-loopback path is pathologically slow on some loaded Windows hosts — local
// acceptance saw domcontentloaded at 19-45 s against a server curl reaches in 30 ms, while the
// same page over a mapped hostname lands in ~0.1 s. Local loopback targets are navigated
// through a fixed mapped hostname so the ordinary network path is used (D188 local acceptance).
const LOOPBACK_PROBE_HOST = 'spaceface-probe-loopback.test';
const isLoopbackTarget = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
// The mapped hostname exists so CDP *network* emulation reaches the loopback target (Chromium
// exempts literal loopback from network conditions). CPU-only throttle keeps 127.0.0.1: the
// .test hostname over plain http is an insecure context, where the game's SHA-256 package
// verification loses crypto.subtle and boot crashes before the menu — an artifact of the probe
// environment, not the deployment (production is https).
const throttleNeedsMappedHost = /net:(?!off)/.test(throttleRequest) || /handset/.test(throttleRequest);
const probeUrl = (() => {
  if (!isLoopbackTarget || engine !== 'chromium' || !throttleNeedsMappedHost) return url;
  const mapped = new URL(url.href);
  mapped.hostname = LOOPBACK_PROBE_HOST;
  return mapped;
})();
if (channel && engine !== 'chromium') throw new Error('MOBILE_PROBE_CHANNEL is supported only for Chromium');
// Handset-class timing acceptance (D188): Chrome DevTools network presets, bytes/second.
// `handset` is the acceptance profile — 4x CPU slowdown (DevTools mid-tier mobile) plus a
// Slow-4G-class pipe (4 Mbps down / 3 Mbps up / 100 ms RTT), a conservative real-phone
// cellular day. The 3G presets stay available as stress tokens: the cold boot plan is ~78 MB
// of render packages, so a 1.6 Mbps pipe cannot finish a first attempt inside the startup
// budget no matter how healthy the code is — that is a budget fact, not a defect.
const HANDSET_NETWORK_PROFILES = {
  slow4g: { latency: 100, downloadThroughput: 4e6 / 8, uploadThroughput: 3e6 / 8 },
  fast3g: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 },
  slow3g: { latency: 400, downloadThroughput: 400e3 / 8, uploadThroughput: 400e3 / 8 },
};
function parseMobileThrottle(value, engine) {
  const text = String(value || '').trim();
  if (!text || text === 'off') return null;
  if (engine !== 'chromium')
    throw new Error('MOBILE_PROBE_THROTTLE requires the Chromium engine (CDP emulation); rerun with MOBILE_PROBE_ENGINE=chromium');
  let cpuRate = null, networkName = null, networkOff = false;
  for (const token of text.split(',').map(part => part.trim()).filter(Boolean)) {
    if (token === 'handset') { cpuRate = 4; if (!networkOff) networkName = 'slow4g'; continue; }
    const cpu = /^cpu:(\d+(?:\.\d+)?)$/.exec(token);
    if (cpu) {
      const rate = Number(cpu[1]);
      if (!(rate > 1) || rate > 100) throw new Error(`Invalid CPU throttle rate (must be 1-100): ${token}`);
      cpuRate = rate; continue;
    }
    const net = /^net:(slow4g|fast3g|slow3g|off)$/.exec(token);
    if (net) {
      if (net[1] === 'off') { networkOff = true; networkName = null; }
      else networkName = net[1];
      continue;
    }
    throw new Error(`Unknown MOBILE_PROBE_THROTTLE token "${token}" — use handset, cpu:<n>, net:slow4g|fast3g|slow3g|off`);
  }
  return { cpuRate, network: networkName ? HANDSET_NETWORK_PROFILES[networkName] : null };
}
const throttle = parseMobileThrottle(throttleRequest, engine);
await mkdir(out, { recursive: true });
const report = { url: url.href, engine, startedAt: new Date().toISOString(), passed: false,
  launch: { headless: !headed, channel }, drawErrorProbe, drawErrorMode,
  throttle: { requested: throttleRequest, cpuRate: throttle ? throttle.cpuRate : null,
    network: throttle ? throttle.network : null, applied: false },
  contextLossExercise: { requested: contextLossExercise },
  mobileProfile: { requested: { name: mobileDeviceName, isMobile: mobileDeviceProfile.isMobile === true,
    hasTouch: mobileDeviceProfile.hasTouch === true, viewport: mobileDeviceProfile.viewport,
    deviceScaleFactor: mobileDeviceProfile.deviceScaleFactor }, effective: null, mismatches: [] },
  acceptance: { startupAndControls: 'pending', mobileCapabilities: 'pending', continue: checkContinue ? 'pending' : 'not-requested',
    workerContract: 'pending', rendererHealth: 'pending',
    rendererRecovery: contextLossExercise ? 'pending' : 'not-requested', worldVisibility: 'unverified' },
  continue: { requested: checkContinue, status: checkContinue ? 'pending' : 'not-requested' },
  ...createMobileResponseLedger(), pageErrors: [], console: [], stages: [], observations: [], lifecycle: [],
  startupErrors: [], runtimeMessages: [], rendererErrors: [], rendererErrorCount: 0,
  menuWaitObservations: [], finalDiagnosticErrors: [] };
const pendingDiagnosticReads = new Set();
let activeRoute = 'new-game';
let actorStage = 'boot-menu';
function recordMobileCapabilities(capabilities) {
  if (!capabilities) return;
  const mismatches = [];
  if (report.mobileProfile.requested.hasTouch && !(Number(capabilities.touchPoints) > 0))
    mismatches.push('requested touch support but navigator.maxTouchPoints is not positive');
  if (report.mobileProfile.requested.isMobile && capabilities.mobileUserAgent !== true)
    mismatches.push('requested mobile profile but the effective user agent is not mobile');
  report.mobileProfile.effective = {
    maxTouchPoints: capabilities.touchPoints,
    touchEvents: capabilities.touchEvents,
    coarsePointer: capabilities.coarse,
    anyCoarsePointer: capabilities.anyCoarse,
    mobileUserAgent: capabilities.mobileUserAgent,
    userAgent: capabilities.userAgent,
    platform: capabilities.platform,
    viewport: { width: capabilities.width, height: capabilities.height },
    deviceScaleFactor: capabilities.dpr,
  };
  report.mobileProfile.mismatches = mismatches;
  report.acceptance.mobileCapabilities = mismatches.length ? 'mismatch' : 'passed';
}
const MAX_RENDERER_ERROR_SAMPLES = 32;
// Concrete error-level GL failures gate health; ordinary warnings remain diagnostics.
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
      const saved = events.findLast(event => event.type === 'save:completed'
        && event.slot === slot && event.at >= startedAt);
      if (saved) return { saved: { source: 'save:completed', slot, ...saved } };
      const failed = events.findLast(event => event.type === 'save:error'
        && event.slot === slot && event.at >= startedAt);
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
function assertContinuePageHealth(pageErrors, baseline = 0) {
  const observed = Array.isArray(pageErrors) ? pageErrors.length : 0;
  if (observed > baseline)
    throw new Error(`Continue produced ${observed - baseline} page error(s)`);
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
      mobileUserAgent: navigator.userAgentData?.mobile ?? /(?:Mobile|iPhone|iPad|Android)/i.test(navigator.userAgent),
      userAgent: navigator.userAgent, platform: navigator.platform,
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
  recordMobileCapabilities(result.capabilities);
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
// D188 renderer-recovery exercise: a driver-class WEBGL_lose_context reset on the live
// main canvas, driven only through public DOM + standard WebGL — no debug API. The game
// must observe the loss, pause the sim, rebuild GPU resources after restoration, resume
// the sim, and keep the player's touch controls.
const injectContextLoss = page => boundedBrowserRead(() => page.evaluate(() => {
  const canvas = document.getElementById('gl-canvas');
  const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
  const ext = gl && typeof gl.getExtension === 'function' ? gl.getExtension('WEBGL_lose_context') : null;
  if (!ext || typeof ext.loseContext !== 'function') return { available: false };
  ext.loseContext();
  return { available: true, contextLost: typeof gl.isContextLost === 'function' ? gl.isContextLost() : null };
}));
const restoreInjectedContextLoss = page => boundedBrowserRead(() => page.evaluate(() => {
  const canvas = document.getElementById('gl-canvas');
  const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
  const ext = gl && typeof gl.getExtension === 'function' ? gl.getExtension('WEBGL_lose_context') : null;
  if (!ext || typeof ext.restoreContext !== 'function') return { restored: false };
  ext.restoreContext();
  return { restored: true };
}));
async function exerciseRendererRecovery(page, { report, timeoutMs = 120000 } = {}) {
  const startedAt = Date.now();
  const before = await snapshot(page, true);
  const beforeTick = Number(before.runtime?.frame?.tick);
  const beforeRecovery = before.runtime?.context?.recovery || null;
  const exercise = report.contextLossExercise = {
    requested: true, injectedAt: new Date().toISOString(),
    before: { tick: Number.isFinite(beforeTick) ? beforeTick : null, recovery: beforeRecovery },
    loss: null, restore: null, lossObserved: null, observations: [], recovered: false,
  };
  const loss = await injectContextLoss(page);
  exercise.loss = { ...loss, at: new Date().toISOString() };
  if (!loss.available) throw new Error('WEBGL_lose_context is unavailable; cannot exercise context-loss recovery');
  await page.waitForTimeout(1000);
  exercise.lossObserved = await snapshot(page, true);
  const restore = await restoreInjectedContextLoss(page);
  exercise.restore = { ...restore, at: new Date().toISOString() };
  if (!restore.restored) throw new Error('restoreContext() unavailable after the injected loss');
  const deadline = Date.now() + timeoutMs;
  let recoveredState = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1500);
    const state = await snapshot(page, true);
    if (exercise.observations.length < 24) {
      exercise.observations.push({ elapsedMs: Date.now() - startedAt, ...state });
    }
    const recovery = state.runtime?.context?.recovery;
    const lossesSeen = !recovery || recovery.losses >= (beforeRecovery?.losses || 0) + 1;
    const restoresSeen = !!recovery && recovery.restores >= (beforeRecovery?.restores || 0) + 1
      && recovery.pending !== true;
    const contextBack = state.runtime?.context?.lost !== true;
    const tick = Number(state.runtime?.frame?.tick);
    const simResumed = !Number.isFinite(beforeTick) || !Number.isFinite(tick) || tick > beforeTick;
    if (lossesSeen && restoresSeen && contextBack && simResumed) { recoveredState = state; break; }
  }
  if (!recoveredState) {
    exercise.lastObservation = exercise.observations.at(-1) || null;
    throw new Error(`Injected WebGL context loss did not fully recover within ${timeoutMs / 1000} seconds `
      + '(loss/restore receipts, context back, or sim resume missing); see contextLossExercise');
  }
  exercise.recovered = true;
  exercise.recoveryElapsedMs = Date.now() - startedAt;
  exercise.recoveredTick = Number(recoveredState.runtime?.frame?.tick);
  await page.screenshot({ path: join(out, '05b-context-recovered.png') });
  for (const selector of ['.mf-gun', '.mf-tether', '.mf-pause']) {
    if (!(await visible(page, selector))) {
      throw new Error(`Touch control missing after context recovery: ${selector}`);
    }
  }
  report.acceptance.rendererRecovery = 'passed';
  return exercise;
}
const visible = async (page, selector) => boundedBrowserRead(() => page.locator(selector).first().isVisible()).catch(() => false);
try {
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: !headed,
    ...(channel ? { channel } : {}),
    ...(engine === 'chromium' ? { args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio',
      ...(isLoopbackTarget ? [`--host-resolver-rules=MAP ${LOOPBACK_PROBE_HOST} 127.0.0.1`] : [])] } : {}) });
  const context = await browser.newContext({ ...mobileDeviceProfile, serviceWorkers: 'block',
    // Official Vercel E2E header: exclude preview-only feedback UI, not game code
    // or deployment protection. Production visitors do not normally load this toolbar.
    extraHTTPHeaders: { 'x-vercel-skip-toolbar': '1' } });
  if (drawErrorProbe) await context.addInitScript(installMobileDrawErrorObserver,
    { startArmed: drawErrorMode === '1' });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  if (throttle) {
    try {
      const cdp = await context.newCDPSession(page);
      if (throttle.cpuRate) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle.cpuRate });
      if (throttle.network) {
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, ...throttle.network });
      }
      report.throttle.applied = true;
    } catch (error) {
      report.throttle.error = String(error?.message || error);
      throw new Error(`Handset throttle could not be applied: ${report.throttle.error}`);
    }
  }
  const tapControl = async selector => {
    const control = typeof selector === 'string' ? page.locator(selector).first() : selector;
    await control.waitFor({ state: 'visible' });
    try {
      // Locator tap computes its point at dispatch time and re-targets itself while a moving
      // title/ORRERY instrument slides away — the manual bounding-box path measured the box
      // and tapped stale coordinates whenever the animation moved on between the two steps
      // (the throttled local run's New Game tap landed on empty space that way).
      await control.tap({ timeout: 20000 });
      return;
    } catch { /* fall through to the touchscreen tap below */ }
    // Under handset-class CPU throttle the animated menu never settles enough for the
    // scroll helper's stability gate; scrolling is best-effort (the tap reads the live box).
    await control.scrollIntoViewIfNeeded({ timeout: 500 }).catch(() => {});
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
    if (isConcreteRendererConsoleError(message.type(), text)) noteRendererError(report, text, route, stage);
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
    recordMobileRequestFailure(report, {
      url: request.url(), error: request.failure()?.errorText,
      resourceType: request.resourceType?.() || null, actorStage,
      timestamp: new Date().toISOString(),
    });
  });
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame() && report.lifecycle.length < 64)
      report.lifecycle.push({ event: 'main-frame-navigation', url: frame.url(), at: new Date().toISOString() });
  });
  page.on('response', response => {
    recordMobileResponse(report, { url: response.url(), status: response.status(),
      type: response.request().resourceType(), mime: response.headers()['content-type'], bytes: response.headers()['content-length'] });
  });
  // A throttled handset run downloads the document on emulated Slow-4G-class conditions;
  // the unthrottled 60 s navigation budget does not describe that route.
  const navigation = await page.goto(probeUrl.href, { waitUntil: 'domcontentloaded', timeout: throttle ? 180000 : 60000 });
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
    // Row 473: the fresh-profile "First light" offer opens a shared confirm over the title.
    // It is a real player question with real answers — a public actor answers it like a player.
    const firstLightPlay = [...document.querySelectorAll('#sf-confirm-root button, .sf-confirm button')]
      .find(element => /^Play$/i.test((element.textContent || '').trim())) || null;
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
      firstLightPlayVisible: visible(firstLightPlay),
      cinematicVisible: visible(cinematic),
      cinematicBeginVisible: visible(cinematicBegin),
      witnessReadError,
      witnessFrame: frame ? { mode: frame.mode ?? null, tick: frame.tick ?? null,
        playerId: frame.playerId ?? null, loading: frame.loading ?? null } : null,
    };
  }), timeoutMs);
  const waitForMenu = async () => {
    const beforeMenu = Date.now();
    // The menu deadline is a ceiling on the boot cook, not a wait. A throttled handset pays
    // the same cook several times over — and the unbundled local dev route pays it again —
    // so the ceiling follows the device class.
    const deadline = beforeMenu + (throttle ? 360000 : 180000);
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
      // The title under a First-light offer is not playable — the dialog owns the screen until
      // it is answered, so keep looping (the handler above taps Play) before calling the menu ready.
      if (state.available !== false && state.mainMenuVisible && state.newGameButtonVisible
        && !state.firstLightPlayVisible) return;
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
      if (state.available !== false && state.firstLightPlayVisible) {
        const play = page.locator('#sf-confirm-root button, .sf-confirm button')
          .filter({ hasText: /^Play$/i }).first();
        try { await tapControl(play); report.firstLightAnswered = true; }
        catch (error) { state.firstLightTapError = String(error?.message || error); }
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
    const publicRecoveryFeedback = state => [...new Set([...(state?.alerts || []), state?.toastLive,
      ...(state?.toasts || [])].map(text => String(text || '').trim()).filter(Boolean))];
    let observations = 0;
    let leftMenu = false;
    let previousTick = null;
    let previousSimTime = null;
    let advanced = route !== 'continue';
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
        const feedback = publicRecoveryFeedback(state);
        report.continueRejection = { elapsedMs: Date.now() - launchAt, feedback, appendedEvents,
          debugBusAvailable: state.startupObserver?.busAvailable === true };
        throw new Error(`Continue received a new save:error after its accepted click${feedback.length
          ? ': ' + feedback.join(' | ') : '; save feedback unavailable'}`);
      }
      const consoleRows = report.console.filter(entry => entry.route === route);
      if (consoleRows.some(entry => /\[SpaceFace\].*(?:startup failed|save restore failed)/.test(entry.text))
          || state.startupObserver?.events?.some(event => event.type === 'game:startFailed'
            || (route !== 'continue' && event.type === 'save:error' && event.reason === 'load_failed'))) {
        const feedback = publicRecoveryFeedback(state);
        report.startupFailureObservation = { route, elapsedMs: Date.now() - launchAt, feedback,
          debugBusAvailable: state.startupObserver?.busAvailable === true };
        throw new Error(`${label} reported a startup-readiness failure${feedback.length
          ? `: ${feedback.join(' | ')}` : '; no visible public recovery text was found'}; see structured errors and failed asset URLs`);
      }
      if (/SimulationRunner is closed/.test(state.runtime?.frame?.lastFrameError || '')
          || consoleRows.some(entry => /SimulationRunner is closed|PRESENTATION STALLED/.test(entry.text)))
        throw new Error('Game reported a terminal simulation or presentation failure; see runtime and console');
      if (!state.loading.length && state.launchButton && !state.launchButton.disabled
          && state.alerts.some(text => /could not finish loading|did not finish preparing|could not start/i.test(text)))
        throw new Error(`Game refused mobile startup: ${state.alerts.filter(Boolean).join(' ')}`);
      if (state.flight === '1' && !state.loading.length
          && Number.isFinite(state.runtime?.post?.firstPlayableFrameAt) && advanced) return Date.now() - launchAt;
      if (leftMenu && mode === 'menu' && !state.loading.length
          && Date.now() - launchAt > 5000 && await visible(page, menu)) {
        const feedback = publicRecoveryFeedback(state);
        report.returnedToMenu = { route, elapsedMs: Date.now() - launchAt, feedback,
          debugBusAvailable: state.startupObserver?.busAvailable === true };
        throw new Error(`${label} returned to the main menu without entering flight${feedback.length
          ? `: ${feedback.join(' | ')}` : '; no visible public recovery text was found'}`);
      }
    }
    if (route === 'continue' && !advanced)
      throw new Error('Continue did not observe an advancing simulation tick or simTime after reload');
    throw new Error(`${label} did not reach mobile flight UI with the loading shell cleared within five minutes`);
  };
  await waitForMenu();
  await page.screenshot({ path: join(out, '01-menu.png') }).catch(error => report.finalDiagnosticErrors.push({ kind: 'stage-screenshot', name: '01-menu.png', at: new Date().toISOString(), error: String(error?.message || error) }));
  await boundedBrowserRead(() => page.evaluate(installStartupObserver));
  report.stages.push({ stage: 'menu', ...await snapshot(page) });
  console.log(`[mobile:${engine}] menu ready`);
  actorStage = 'new-game-menu';
  await tapControl(menu);
  // Screen reveals are CPU/first-paint work; a throttled handset reveals them proportionally
  // later, so the actor's visibility budget follows the emulated device class.
  await page.locator('.sf-ng-launch').waitFor({ state: 'visible', timeout: throttle ? 120000 : 30000 });
  report.stages.push({ stage: 'new-game', ...await snapshot(page) });
  console.log(`[mobile:${engine}] launching`);
  await page.screenshot({ path: join(out, '02-new-game.png') }).catch(error => report.finalDiagnosticErrors.push({ kind: 'stage-screenshot', name: '02-new-game.png', at: new Date().toISOString(), error: String(error?.message || error) }));
  actorStage = 'new-game-launch';
  await tapControl('.sf-ng-launch');
  report.launchMs = await waitForFlight('new-game', Date.now());
  actorStage = 'new-game-flight-controls';
  report.stages.push({ stage: 'flight', ...await snapshot(page, true) });
  await page.screenshot({ path: join(out, '03-flight.png') }).catch(error => report.finalDiagnosticErrors.push({ kind: 'stage-screenshot', name: '03-flight.png', at: new Date().toISOString(), error: String(error?.message || error) }));
  // Only the player-facing DOM is read. Keyboard labels alone are not mobile acceptance.
  for (const selector of ['.mf-gun', '.mf-tether', '.mf-edge', '.mf-pause']) {
    if (!(await visible(page, selector))) throw new Error(`Missing visible touch control: ${selector}`);
  }
  actorStage = 'new-game-powers';
  await tapControl('.mf-edge');
  await page.locator('.mf-wheel').waitFor({ state: 'visible' });
  await page.screenshot({ path: join(out, '04-powers.png') }).catch(error => report.finalDiagnosticErrors.push({ kind: 'stage-screenshot', name: '04-powers.png', at: new Date().toISOString(), error: String(error?.message || error) }));
  await page.touchscreen.tap(100, 320);
  await page.locator('.mf-wheel').waitFor({ state: 'hidden' });
  actorStage = 'new-game-pause';
  await tapControl('.mf-pause');
  await page.locator('[data-screen="pause"]').waitFor({ state: 'visible' });
  report.stages.push({ stage: 'pause', ...await snapshot(page) });
  await page.screenshot({ path: join(out, '05-pause.png') }).catch(error => report.finalDiagnosticErrors.push({ kind: 'stage-screenshot', name: '05-pause.png', at: new Date().toISOString(), error: String(error?.message || error) }));
  actorStage = 'new-game-resume';
  await page.locator('[data-screen="pause"] button').filter({ hasText: /^Resume/i }).first().tap();
  await page.locator('[data-screen="pause"]').waitFor({ state: 'hidden' });
  if (contextLossExercise) {
    actorStage = 'new-game-context-loss';
    await exerciseRendererRecovery(page, { report });
  }
  actorStage = 'new-game-rotation';
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(1500);
  const landscape = await snapshot(page, true); report.stages.push({ stage: 'landscape', ...landscape });
  if (landscape.flight !== '1') throw new Error('Touch flight did not survive rotation');
  await page.screenshot({ path: join(out, '06-landscape.png') }).catch(error => report.finalDiagnosticErrors.push({ kind: 'stage-screenshot', name: '06-landscape.png', at: new Date().toISOString(), error: String(error?.message || error) }));
  for (const selector of ['.mf-gun', '.mf-tether', '.mf-pause']) {
    const box = await page.locator(selector).boundingBox();
    if (!box || box.x < 0 || box.y < 0 || box.x + box.width > 845 || box.y + box.height > 391)
      throw new Error(`Control clipped after rotation: ${selector} ${JSON.stringify(box)}`);
  }
  if (report.pageErrors.length) throw new Error(`${report.pageErrors.length} unhandled page error(s)`);
  actorStage = 'new-game-worker-contract';
  const pageUrl = new URL(page.url());
  const detectedReleaseBase = report.html?.match(/(?:https?:\/\/[^"']+)?(\/_releases\/[^"']+\/)main\.js/)?.[1] || '';
  const releaseBase = process.env.MOBILE_WORKER_RELEASE_BASE || detectedReleaseBase;
  const workerMode = process.env.MOBILE_WORKER_MODE || (releaseBase ? 'pinned' : 'retail');
  if (!['raw', 'retail', 'pinned'].includes(workerMode)) throw new Error(`Unknown MOBILE_WORKER_MODE: ${workerMode}`);
  if (workerMode === 'pinned' && !releaseBase)
    throw new Error('Pinned worker mode requires MOBILE_WORKER_RELEASE_BASE or a pinned main.js URL');
  const workerUrls = resolveWorkerContractUrls({ moduleUrl: pageUrl.href, production: workerMode !== 'raw',
    documentBase: pageUrl.href, releaseBase: workerMode === 'pinned' ? releaseBase : '' });
  report.workerUrls = workerUrls;
  report.workerObservedFailures = observedWorkerFailures(report.responses, workerUrls,
    report.workerResponseFailures, report.workerResponseSuccesses);
  // A lazy worker may not have produced a response during startup. Exercise the real
  // deployment URL in a native Worker and verify its transfer and reply contract.
  report.workerContract = await runMobileWorkerContract(page, { workerUrls });
  if (report.workerObservedFailures.length)
    throw new Error(`Observed runtime worker response failure: ${JSON.stringify(report.workerObservedFailures)}`);
  if (report.criticalResponseCount || report.criticalRequestFailureCount)
    throw new Error(`Runtime script, model or decoder returned ${report.criticalResponseCount
      + report.criticalRequestFailureCount} critical HTTP failure(s)`);
  report.acceptance.startupAndControls = 'passed';
  report.acceptance.workerContract = 'passed';
  if (checkContinue) {
    const continuePageErrorsBefore = report.pageErrors.length;
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
    await page.reload({ waitUntil: 'domcontentloaded', timeout: throttle ? 180000 : 60000 });
    await waitForMenu();
    actorStage = 'continue-menu';
    await boundedBrowserRead(() => page.evaluate(installStartupObserver));
    report.stages.push({ stage: 'continue-menu', ...await snapshot(page) });
    await page.screenshot({ path: join(out, '07-continue-menu.png') }).catch(error => report.finalDiagnosticErrors.push({ kind: 'stage-screenshot', name: '07-continue-menu.png', at: new Date().toISOString(), error: String(error?.message || error) }));
    actorStage = 'continue-enabled-wait';
    await waitForContinueEnabled(page);
    actorStage = 'continue-launch';
    await tapControl('[data-screen="mainMenu"] button[data-action="continue"]');
    const continueClick = await boundedBrowserRead(() => page.evaluate(() =>
      window.__SF_MOBILE_STARTUP_OBSERVER__?.snapshot?.()?.lastPublicClick || null));
    report.continueClick = continueClick;
    if (continueClick?.action !== 'continue' || continueClick.isTrusted !== true
        || continueClick.disabled || continueClick.ariaDisabled === 'true')
      throw new Error('Continue public tap was not delivered to an enabled Continue control');
    report.continueLaunchMs = await waitForFlight('continue', Date.now());
    actorStage = 'continue-flight-controls';
    report.stages.push({ stage: 'continue-flight', ...await snapshot(page, true) });
    await page.screenshot({ path: join(out, '08-continue-flight.png') }).catch(error => report.finalDiagnosticErrors.push({ kind: 'stage-screenshot', name: '08-continue-flight.png', at: new Date().toISOString(), error: String(error?.message || error) }));
    for (const selector of ['.mf-gun', '.mf-tether', '.mf-pause']) {
      if (!(await visible(page, selector))) throw new Error(`Continue is missing a visible touch control: ${selector}`);
    }
    assertContinuePageHealth(report.pageErrors, continuePageErrorsBefore);
    report.workerObservedFailures = observedWorkerFailures(report.responses, report.workerUrls,
      report.workerResponseFailures, report.workerResponseSuccesses);
    report.continueHttp = { responseCount: report.responseCount,
      criticalResponseCount: report.criticalResponseCount,
      criticalRequestFailureCount: report.criticalRequestFailureCount,
      workerResponseFailureCount: report.workerResponseFailureCount };
    if (report.workerObservedFailures.length)
      throw new Error(`Continue observed runtime worker response failure: ${JSON.stringify(report.workerObservedFailures)}`);
    if (report.criticalResponseCount || report.criticalRequestFailureCount)
      throw new Error(`Continue observed ${report.criticalResponseCount + report.criticalRequestFailureCount} critical HTTP failure(s)`);
    report.acceptance.continue = 'passed';
    report.continue.status = 'passed';
  }
  report.passed = report.acceptance.mobileCapabilities === 'passed'; // Renderer health is applied below; world visibility remains unverified.
  if (report.acceptance.mobileCapabilities === 'mismatch') {
    report.failure = `Mobile device capability mismatch: ${report.mobileProfile.mismatches.join('; ')}`;
    process.exitCode = 1;
  }
} catch (error) {
  report.failedStage = actorStage;
  if (contextLossExercise && report.acceptance.rendererRecovery !== 'passed') {
    report.acceptance.rendererRecovery = 'failed';
  }
  if (activeRoute === 'continue') {
    report.acceptance.continue = 'failed';
    report.continue.status = 'failed';
  }
  else {
    report.acceptance.startupAndControls = 'failed';
    if (report.acceptance.workerContract === 'pending') {
      report.acceptance.workerContract = actorStage === 'new-game-worker-contract' ? 'failed' : 'not-run';
    }
    if (checkContinue) {
      report.acceptance.continue = 'not-run-new-game-failed';
      report.continue.status = 'not-run-new-game-failed';
    }
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
  // An injected loss that fully recovered (receipts + sim resume) is acceptance evidence,
  // not a renderer failure; anything unresolved stays a failure.
  const injectedLossRecovered = report.contextLossExercise?.recovered === true;
  let observedInvalidDraws = 0;
  // Preview contexts are deliberately retired; only loss of the main game canvas fails health.
  for (const state of [...report.stages, ...report.observations, report.final].filter(Boolean)) {
    if (drawErrorProbe) observedInvalidDraws = Math.max(observedInvalidDraws,
      state.drawErrors?.invalidDraws || (state.drawErrors?.witnesses?.length ? 1 : 0));
    if (!injectedLossRecovered && state.runtime?.context?.lost === true)
      contextFailures.add('main WebGL context reported lost');
    for (const event of state.startupObserver?.events || []) {
      if (event.canvasId === 'gl-canvas'
          && (event.type === 'webglcontextcreationerror'
            || (event.type === 'webglcontextlost' && !injectedLossRecovered)))
        contextFailures.add(`main canvas ${event.type}: ${event.statusMessage || 'no driver message'}`);
    }
  }
  for (const text of contextFailures) noteRendererError(report, text, activeRoute, actorStage, 'runtime-context');
  if (observedInvalidDraws) noteRendererError(report,
    `Indexed draw observer recorded INVALID_OPERATION (${observedInvalidDraws} invalid draw(s)); see drawErrors witnesses`,
    activeRoute, actorStage, 'draw-observer');
  if (!finalizeRendererHealth(report)) process.exitCode = 1;
  // Persist diagnostics before a crashed renderer can stall browser shutdown.
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await Promise.race([browser?.close(), new Promise(resolve => {
    const timer = setTimeout(resolve, 5000); timer.unref();
  })]);
  console.log(JSON.stringify({ engine, passed: report.passed, acceptance: report.acceptance,
    throttle: report.throttle, contextLossExercise: report.contextLossExercise,
    launchMs: report.launchMs, continueLaunchMs: report.continueLaunchMs, rendererErrorCount: report.rendererErrorCount,
    failure: report.failure, final: report.final, pageErrors: report.pageErrors,
    failedHttp: report.criticalResponses, criticalResponseCount: report.criticalResponseCount,
    workerResponseFailures: report.workerResponseFailures, rendererErrors: report.rendererErrors,
    failedRequests: report.criticalRequestFailures,
    criticalRequestFailureCount: report.criticalRequestFailureCount }, null, 2));
}
