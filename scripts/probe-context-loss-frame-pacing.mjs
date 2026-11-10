#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url)).replace(/\\scripts$/, '').replace(/\/scripts$/, '');
const PACKET_DIR = join(ROOT, '.campaign', 'PERF-FRAME-PACING-CONTEXT-TEARDOWN-CODEX-LEAD-001');
const REPORT_PATH = join(PACKET_DIR, 'context-loss-frame-pacing-report.json');
const SCREENSHOT_DIR = join(PACKET_DIR, 'devshots');

const SCHEMA = 'spaceface.contextLossFramePacing.v1';
const TASK_ID = 'perf-frame-pacing-context-teardown';

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--width') out.width = Number(argv[++i]);
    else if (key === '--height') out.height = Number(argv[++i]);
    else if (key === '--warmup') out.warmup = Number(argv[++i]);
    else if (key === '--window') out.window = Number(argv[++i]);
    else if (key === '--out') out.out = argv[++i];
    else if (key === '--headed') out.headed = true;
  }
  return out;
}
const args = parseArgs();
const REPORT_OUT = args.out || REPORT_PATH;

const WIDTH = Number(args.width ?? process.env.SF_PROBE_WIDTH ?? 1440);
const HEIGHT = Number(args.height ?? process.env.SF_PROBE_HEIGHT ?? 900);
const WARMUP_MS = Number(args.warmup ?? process.env.SF_PROBE_WARMUP_MS ?? 3000);
const WINDOW_MS = Number(args.window ?? process.env.SF_PROBE_WINDOW_MS ?? 5000);
const FLIGHT_TIMEOUT_MS = Number(process.env.SF_PROBE_FLIGHT_TIMEOUT_MS || 150000);
const RESTORE_TIMEOUT_MS = Number(process.env.SF_PROBE_RESTORE_TIMEOUT_MS || 30000);
const HEADED = args.headed === true || process.env.SF_PROBE_HEADED === '1';

function ensureDirs() {
  mkdirSync(PACKET_DIR, { recursive: true });
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  mkdirSync(dirname(REPORT_OUT), { recursive: true });
}

function findSystemBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function makeReportSkeleton(status, extra = {}) {
  return {
    schema: SCHEMA,
    taskId: TASK_ID,
    generatedAt: new Date().toISOString(),
    status,
    pass: false,
    blockedReason: extra.blockedReason || null,
    blockedEvidence: extra.blockedEvidence || null,
    environment: {
      browser: { executablePath: null, version: null, headed: HEADED },
      gpu: { vendor: '', renderer: '', tier: '', software: null },
      viewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
      settings: null,
      fixture: 'canonical-route presentation-only authored Kestrel + trade-hub station',
      measurementCaveat: 'Headless browser cadence is not hardware FPS; acceptance uses internal CPU render timings and lifecycle invariants.',
    },
    windows: [],
    contextLoss: {
      available: false,
      lostEvent: false,
      restoredEvent: false,
      recovered: false,
      meshRecovered: false,
      rootIdentityStable: false,
      visualRecovery: false,
      frameAdvanced: false,
    },
    issues: {
      wrongContextWarnings: 0,
      genericDeleteWrongContext: 0,
      deleteVertexArrayWrongContext: 0,
      consoleErrors: 0,
      pageErrors: 0,
      httpErrors: 0,
      requestFailures: 0,
    },
    screenshots: {},
    ...extra,
  };
}

function writeReport(report) {
  writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));
  console.log(`[probe-context-loss-frame-pacing] report: ${REPORT_OUT}`);
}

async function writeRawTelemetry(errorTelemetry, contextLoss, perfTelemetry) {
  writeFileSync(join(PACKET_DIR, 'error-telemetry-raw.json'), JSON.stringify(errorTelemetry, null, 2));
  writeFileSync(join(PACKET_DIR, 'context-loss-telemetry-raw.json'), JSON.stringify(contextLoss, null, 2));
  writeFileSync(join(PACKET_DIR, 'performance-telemetry-raw.json'), JSON.stringify(perfTelemetry, null, 2));
}

function repoRel(absolutePath) {
  return relative(ROOT, absolutePath).replace(/\\/g, '/');
}

function stats(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) {
    return { samples: 0, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null, over32Ms: 0 };
  }
  const n = nums.length;
  const idx = (p) => Math.min(n - 1, Math.floor(p * (n - 1)));
  return {
    samples: n,
    p50Ms: nums[idx(0.5)],
    p95Ms: nums[idx(0.95)],
    p99Ms: nums[idx(0.99)],
    maxMs: nums[n - 1],
    over32Ms: nums.filter((v) => v > 32).length,
  };
}

async function screenshotStats(filePath) {
  const { data, info } = await sharp(filePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let luminanceTotal = 0;
  let nonBlack = 0;
  let bright = 0;
  const pixels = info.width * info.height;
  for (let offset = 0; offset < data.length; offset += channels) {
    const y = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
    luminanceTotal += y;
    if (y >= 10) nonBlack++;
    if (y >= 32) bright++;
  }
  return {
    width: info.width,
    height: info.height,
    meanLuminance: pixels ? luminanceTotal / pixels : 0,
    nonBlackFraction: pixels ? nonBlack / pixels : 0,
    brightFraction: pixels ? bright / pixels : 0,
  };
}

const WRONG_CONTEXT_RE = /object does not belong to this context/i;
const GENERIC_DELETE_RE = /INVALID_OPERATION:\s*delete\s*:/i;
const DELETE_VAO_RE = /INVALID_OPERATION:\s*deleteVertexArray\s*:/i;

const PROBE_INSTALLATION = String.raw`
(function installContextLossProbe() {
  if (window.__SF_CONTEXT_LOSS_PROBE__) return;

  const probe = {
    phase: 'idle',
    frames: [],
    rendererInfo: [],
    samples: [],
    warnings: [],
    errors: [],
    lostEvent: false,
    restoredEvent: false,
    recovered: false,
  };

  let rafId = null;
  let lastRaf = null;
  let sampleStart = -1;
  let active = false;

  function pushFrame(now) {
    if (!active) return;
    if (lastRaf != null) {
      const perf = window.SF && window.SF.state && window.SF.state.perfRuntime;
      const report = perf && typeof perf.getReport === 'function' ? perf.getReport() : null;
      probe.frames.push({
        atMs: now - sampleStart,
        frameMs: now - lastRaf,
        internalRenderMs: Number(report && report.phases && report.phases.render && report.phases.render.last),
        frameCallbackMs: Number(report && report.frameCallback && report.frameCallback.last),
      });
    }
    lastRaf = now;
    rafId = requestAnimationFrame(pushFrame);
  }

  probe.startWindow = (label) => {
    probe.phase = label;
    probe.frames = [];
    probe.rendererInfo = [];
    lastRaf = null;
    sampleStart = performance.now();
    active = true;
    rafId = requestAnimationFrame(pushFrame);
    probe._infoInterval = setInterval(() => {
      const sf = window.SF || {};
      const renderer = sf.state && sf.state.render && sf.state.render.renderer;
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      const report = diag && typeof diag.getReport === 'function' ? diag.getReport() : null;
      if (!renderer) return;
      const info = renderer.info;
      probe.rendererInfo.push({
        atMs: performance.now() - sampleStart,
        calls: report && Number.isFinite(report.render && report.render.calls) ? report.render.calls : info.render.calls,
        triangles: report && Number.isFinite(report.render && report.render.triangles) ? report.render.triangles : info.render.triangles,
        points: info.render.points,
        lines: info.render.lines,
        geometries: report && Number.isFinite(report.memory && report.memory.geometries) ? report.memory.geometries : info.memory.geometries,
        textures: report && Number.isFinite(report.memory && report.memory.textures) ? report.memory.textures : info.memory.textures,
        programs: report && Number.isFinite(report.memory && report.memory.programs) ? report.memory.programs : (info.programs ? (Array.isArray(info.programs) ? info.programs.length : info.programs) : 0),
        renderPath: report && report.render && report.render.path ? report.render.path : null,
      });
    }, 250);
  };

  probe.stopWindow = () => {
    active = false;
    if (rafId != null) cancelAnimationFrame(rafId);
    if (probe._infoInterval) clearInterval(probe._infoInterval);
    probe.samples.push({ phase: probe.phase, frames: probe.frames.slice(), rendererInfo: probe.rendererInfo.slice() });
  };

  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...args) => {
    probe.warnings.push(args.map(String).join(' '));
    origWarn.apply(console, args);
  };
  console.error = (...args) => {
    probe.errors.push(args.map(String).join(' '));
    origError.apply(console, args);
  };

  const checkRecovered = () => {
    const sf = window.SF || {};
    const recovery = sf.state && sf.state.render && sf.state.render.contextRecovery;
    probe.lostEvent = !!(recovery && recovery.losses > 0);
    probe.restoredEvent = !!(recovery && recovery.restores > 0);
    probe.recovered = !!(recovery && !recovery.pending && recovery.generation > 0 && !recovery.lastError);
  };
  setInterval(checkRecovered, 100);

  probe.loseContext = () => {
    const c = document.getElementById('gl-canvas');
    if (!c) throw new Error('gl-canvas not found');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) throw new Error('no WebGL context on gl-canvas');
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) throw new Error('WEBGL_lose_context extension not available');
    ext.loseContext();
    return true;
  };

  probe.restoreContext = () => {
    const c = document.getElementById('gl-canvas');
    if (!c) throw new Error('gl-canvas not found');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) throw new Error('no WebGL context on gl-canvas');
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) throw new Error('WEBGL_lose_context extension not available');
    ext.restoreContext();
    return true;
  };

  probe.triggerContextLossAndRestore = (restoreDelayMs = 350) => {
    const c = document.getElementById('gl-canvas');
    if (!c) throw new Error('gl-canvas not found');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) throw new Error('no WebGL context on gl-canvas');
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) throw new Error('WEBGL_lose_context extension not available');
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), restoreDelayMs);
    return true;
  };

  probe.snapshotScene = () => {
    const sf = window.SF || {};
    const state = sf.state || {};
    const renderSystem = sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('render') : null;
    const roots = renderSystem && renderSystem._meshes ? [...renderSystem._meshes.entries()] : [];
    const recovery = state.render && state.render.contextRecovery;
    const renderer = state.render && state.render.renderer;
    const info = renderer && renderer.info;
    let authoredShips = 0;
    let authoredPlaces = 0;
    let visibleRenderables = 0;
    let fallbackRenderables = 0;
    let playerMeshUuid = null;
    const rootIds = [];

    for (const [id, root] of roots) {
      rootIds.push(String(id));
      const entity = state.entities && typeof state.entities.get === 'function' ? state.entities.get(id) : null;
      let authored = root && root.userData && root.userData.authoredAssetState === 'authored';
      let renderables = 0;
      let fallbacks = 0;
      if (root && typeof root.traverse === 'function') root.traverse((node) => {
        if (node && node.userData && node.userData.authoredAssetState === 'authored') authored = true;
        if (node && node.visible !== false && (node.isMesh || node.isPoints || node.isSprite || node.isLine)) {
          renderables++;
          if (node.userData && node.userData.readableFallback === true) fallbacks++;
        }
      });
      visibleRenderables += renderables;
      fallbackRenderables += fallbacks;
      if (entity && entity.type === 'ship' && authored) authoredShips++;
      if (entity && (entity.type === 'station' || entity.type === 'gate') && authored) authoredPlaces++;
      if (id === state.playerId && root) playerMeshUuid = root.uuid || null;
    }

    return {
      meshRoots: roots.length,
      rootIds: rootIds.sort(),
      authoredShips,
      authoredPlaces,
      visibleRenderables,
      fallbackRenderables,
      playerMeshUuid,
      sceneChildren: renderSystem && renderSystem.scene ? renderSystem.scene.children.length : null,
      listenerCounts: { ...(window.__SF_CONTEXT_LISTENER_COUNTS__ || {}) },
      recovery: recovery ? { ...recovery } : null,
      memory: info ? {
        geometries: info.memory && info.memory.geometries || 0,
        textures: info.memory && info.memory.textures || 0,
        programs: info.programs ? info.programs.length : 0,
      } : null,
    };
  };

  probe.capturePixelProof = () => {
    const c = document.getElementById('gl-canvas');
    if (!c) return null;
    const w = c.width || c.clientWidth;
    const h = c.height || c.clientHeight;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    let rgba = [0, 0, 0, 0];
    let brightness = 0;
    if (gl) {
      const pixels = new Uint8Array(4);
      gl.readPixels(cx - 1, cy - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      rgba = [pixels[0], pixels[1], pixels[2], pixels[3]];
      brightness = (pixels[0] + pixels[1] + pixels[2]) / 3;
    }
    // Fallback / cross-check: a recoverable canvas produces a non-empty PNG.
    let dataUrlBytes = 0;
    try {
      const dataUrl = c.toDataURL('image/png');
      dataUrlBytes = dataUrl ? dataUrl.length : 0;
    } catch (_) { /* toDataURL may throw while context is lost */ }
    return {
      center: { x: cx, y: cy },
      rgba,
      brightness,
      dataUrlBytes,
      timestamp: performance.now(),
    };
  };

  probe.readSettings = () => {
    const sf = window.SF || {};
    const state = sf.state || {};
    const render = state.render || {};
    return {
      mode: state.mode || null,
      docked: !!state.ui && state.ui.docked,
      video: state.settings && state.settings.video ? { ...state.settings.video } : null,
      pixelRatio: render.renderer ? render.renderer.getPixelRatio() : null,
      dynResScale: Number(state.render && state.render.dynResScale),
    };
  };

  window.__SF_CONTEXT_LOSS_PROBE__ = probe;
})();
`;

async function runProbe() {
  ensureDirs();

  let pw;
  let pwAttempts = [];
  try {
    pw = await loadPlaywright();
  } catch (err) {
    pwAttempts = String(err.message || err).split('\n');
  }
  const executablePath = findSystemBrowser();

  if (!pw || !executablePath) {
    const blocked = makeReportSkeleton('blocked', {
      blockedReason: 'Playwright or a system Chrome/Edge browser is unavailable',
      blockedEvidence: { playwrightLoaded: !!pw, browserPath: executablePath, playwrightAttempts: pwAttempts },
    });
    writeReport(blocked);
    console.error('[probe-context-loss-frame-pacing] BLOCKED: Playwright/Chrome unavailable');
    for (const attempt of pwAttempts) console.error(`  ${attempt}`);
    process.exitCode = 77;
    return;
  }

  const report = makeReportSkeleton('pending');
  report.environment.browser.executablePath = executablePath;
  report.environment.browser.headed = HEADED;

  let server = null;
  let browser = null;
  let context = null;
  let page = null;
  const consoleIssues = [];
  const pageErrors = [];
  const requestFailures = [];
  const httpErrors = [];

  try {
    server = await acquireVisualProbeServer({ root: ROOT });
    assert.equal(server.ownsServer, true, 'probe must own the canonical in-process server');
    assert.equal(server.server?.listening, true, 'canonical in-process server must be listening');
    console.log(`[probe-context-loss-frame-pacing] server ${server.baseUrl}`);

    browser = await pw.chromium.launch({
      headless: !HEADED,
      executablePath,
      args: [
        '--incognito',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        `--window-size=${WIDTH},${HEIGHT}`,
        '--force-device-scale-factor=1',
      ],
    });
    report.environment.browser.version = browser.version();

    context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      screen: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      locale: 'en-US',
      colorScheme: 'dark',
    });
    await context.addInitScript(() => {
      const counts = { webglcontextlost: 0, webglcontextrestored: 0 };
      const original = HTMLCanvasElement.prototype.addEventListener;
      HTMLCanvasElement.prototype.addEventListener = function trackedContextListener(type, listener, options) {
        if (type === 'webglcontextlost' || type === 'webglcontextrestored') counts[type]++;
        return original.call(this, type, listener, options);
      };
      window.__SF_CONTEXT_LISTENER_COUNTS__ = counts;
    });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000);

    page.on('console', (message) => {
      const text = message.text();
      const level = message.type();
      consoleIssues.push({ at: new Date().toISOString(), level, text });
    });
    page.on('pageerror', (error) => {
      pageErrors.push(String(error?.message || error));
    });
    page.on('requestfailed', (request) => {
      requestFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'unknown'}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        httpErrors.push(`HTTP ${response.status()} ${response.url()}`);
      }
    });

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.bringToFront();

    await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 30000 });

    const splash = page.locator('#cinematic-splash');
    if (await splash.isVisible().catch(() => false)) {
      await page.keyboard.press('Space');
      await splash.waitFor({ state: 'hidden', timeout: 5000 });
    }

    await page.waitForSelector('[data-screen="mainMenu"]', { state: 'visible', timeout: 30000 });
    // Install instrumentation, then mount two real authored presentation entities on the canonical
    // game route. This isolates renderer recovery from campaign/traffic readiness while another
    // asset lane publishes unrelated ships; no alternate launcher or graphics settings are used.
    await page.evaluate(PROBE_INSTALLATION);
    await page.evaluate(async () => {
      const { makeShipEntitySpec } = await import('/src/systems/ships.js');
      const sf = window.SF;
      const state = sf.state;
      const renderSystem = sf.registry.get('render');
      const ship = makeShipEntitySpec('ship_kestrel', {
        isPlayer: true,
        team: 0,
        factionId: 'faction_free',
        pos: { x: -34, z: 0 },
        rot: 0,
      });
      Object.assign(ship, {
        id: '__context_probe_kestrel__',
        alive: true,
        vel: { x: 0, z: 0 },
        flags: { noInterp: true },
      });
      const station = {
        id: '__context_probe_station__',
        type: 'station',
        alive: true,
        pos: { x: 70, z: 35 },
        rot: 0,
        radius: 72,
        flags: { noInterp: true },
        team: 1,
        factionId: 'faction_helios',
        data: {
          archetypeGlb: 'place_station_trade_hub',
          placeScale: 72 / 14,
          visualRadius: 72,
          dockRadius: 72,
          paletteClass: 'core',
        },
      };

      renderSystem.clearAllMeshes(false);
      state.entities.clear();
      state.entityList.length = 0;
      for (const entity of [ship, station]) {
        state.entities.set(entity.id, entity);
        state.entityList.push(entity);
      }
      state.playerId = ship.id;
      state.timeScale = 0;
      if (state.ui) state.ui.docked = false;
      renderSystem._meshReconcileDirty = true;
      renderSystem._initialMeshReconcileComplete = false;
    });
    await page.waitForFunction(() => {
      const snap = window.__SF_CONTEXT_LOSS_PROBE__ && window.__SF_CONTEXT_LOSS_PROBE__.snapshotScene();
      return snap && snap.authoredShips >= 1 && snap.authoredPlaces >= 1 && snap.visibleRenderables > 0;
    }, null, { timeout: FLIGHT_TIMEOUT_MS });

    const gpuObservation = await page.evaluate(() => {
      const canvas = document.getElementById('gl-canvas');
      const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      if (!gl) return { hasContext: false };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const stateGpu = window.SF?.state?.render?.gpu || null;
      return {
        hasContext: true,
        vendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '') : String(gl.getParameter(gl.VENDOR) || ''),
        renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : String(gl.getParameter(gl.RENDERER) || ''),
        runtimeGpu: stateGpu ? {
          vendor: stateGpu.vendor || '',
          renderer: stateGpu.renderer || '',
          tier: stateGpu.tier || '',
          software: typeof stateGpu.software === 'boolean' ? stateGpu.software : null,
        } : null,
      };
    });
    report.environment.gpu = {
      vendor: gpuObservation.vendor || '',
      renderer: gpuObservation.renderer || '',
      tier: gpuObservation.runtimeGpu?.tier || '',
      software: gpuObservation.runtimeGpu?.software ?? null,
    };

    const baselineSettings = await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.readSettings());
    const baselineScene = await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.snapshotScene());
    const contextBeforeLost = await page.evaluate(() => {
      const canvas = document.getElementById('gl-canvas');
      const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      return gl ? gl.isContextLost() : null;
    });
    report.environment.settings = baselineSettings.video;

    // A: baseline steady flight.
    await new Promise((r) => setTimeout(r, WARMUP_MS));
    const screenshotA = join(SCREENSHOT_DIR, 'A-baseline.png');
    await page.screenshot({ path: screenshotA, type: 'png' });
    await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.startWindow('A'));
    await new Promise((r) => setTimeout(r, WINDOW_MS));
    const sampleA = await page.evaluate(() => {
      window.__SF_CONTEXT_LOSS_PROBE__.stopWindow();
      return window.__SF_CONTEXT_LOSS_PROBE__.samples[window.__SF_CONTEXT_LOSS_PROBE__.samples.length - 1];
    });
    const pixelA = await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.capturePixelProof());
    const settingsA = await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.readSettings());

    // B: real context loss + recovery.
    await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.triggerContextLossAndRestore(350));
    await page.waitForFunction(() => window.__SF_CONTEXT_LOSS_PROBE__.lostEvent, { timeout: 5000 });
    await page.waitForFunction(() => window.__SF_CONTEXT_LOSS_PROBE__.restoredEvent, { timeout: RESTORE_TIMEOUT_MS });
    await page.waitForFunction(() => window.__SF_CONTEXT_LOSS_PROBE__.recovered, { timeout: RESTORE_TIMEOUT_MS });
    await page.waitForFunction((before) => {
      const snap = window.__SF_CONTEXT_LOSS_PROBE__.snapshotScene();
      return snap.playerMeshUuid && snap.playerMeshUuid === before.playerMeshUuid
        && snap.authoredShips >= before.authoredShips
        && snap.authoredPlaces >= before.authoredPlaces
        && snap.rootIds.length === before.rootIds.length
        && snap.rootIds.every((id, index) => id === before.rootIds[index]);
    }, baselineScene, { timeout: FLIGHT_TIMEOUT_MS });
    const screenshotBStart = join(SCREENSHOT_DIR, 'B-start.png');
    await page.screenshot({ path: screenshotBStart, type: 'png' });
    const pixelBStart = await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.capturePixelProof());
    const settingsBStart = await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.readSettings());

    await new Promise((r) => setTimeout(r, WARMUP_MS));
    const screenshotBEnd = join(SCREENSHOT_DIR, 'B-end.png');
    await page.screenshot({ path: screenshotBEnd, type: 'png' });
    await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.startWindow('B'));
    await new Promise((r) => setTimeout(r, WINDOW_MS));
    const sampleB = await page.evaluate(() => {
      window.__SF_CONTEXT_LOSS_PROBE__.stopWindow();
      return window.__SF_CONTEXT_LOSS_PROBE__.samples[window.__SF_CONTEXT_LOSS_PROBE__.samples.length - 1];
    });
    const pixelB = await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.capturePixelProof());
    const settingsB = await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.readSettings());

    // A2: return to baseline.
    await new Promise((r) => setTimeout(r, WARMUP_MS));
    const screenshotA2 = join(SCREENSHOT_DIR, 'A2-return.png');
    await page.screenshot({ path: screenshotA2, type: 'png' });
    await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.startWindow('A2'));
    await new Promise((r) => setTimeout(r, WINDOW_MS));
    const sampleA2 = await page.evaluate(() => {
      window.__SF_CONTEXT_LOSS_PROBE__.stopWindow();
      return window.__SF_CONTEXT_LOSS_PROBE__.samples[window.__SF_CONTEXT_LOSS_PROBE__.samples.length - 1];
    });
    const pixelA2 = await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.capturePixelProof());
    const settingsA2 = await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.readSettings());
    const recoveredScene = await page.evaluate(() => window.__SF_CONTEXT_LOSS_PROBE__.snapshotScene());
    const contextAfterLost = await page.evaluate(() => {
      const canvas = document.getElementById('gl-canvas');
      const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      return gl ? gl.isContextLost() : null;
    });
    const imageA = await screenshotStats(screenshotA);
    const imageBStart = await screenshotStats(screenshotBStart);
    const imageB = await screenshotStats(screenshotBEnd);
    const imageA2 = await screenshotStats(screenshotA2);

    // Retrieve browser-side warnings/errors.
    const probeCapture = await page.evaluate(() => ({
      warnings: window.__SF_CONTEXT_LOSS_PROBE__.warnings,
      errors: window.__SF_CONTEXT_LOSS_PROBE__.errors,
      lostEvent: window.__SF_CONTEXT_LOSS_PROBE__.lostEvent,
      restoredEvent: window.__SF_CONTEXT_LOSS_PROBE__.restoredEvent,
      recovered: window.__SF_CONTEXT_LOSS_PROBE__.recovered,
    }));

    // Combine Playwright-observed console issues with probe-captured warnings.
    const allWarnings = [
      ...consoleIssues.filter((i) => i.level === 'warning').map((i) => i.text),
      ...probeCapture.warnings,
    ];
    const allErrors = [
      ...consoleIssues.filter((i) => i.level === 'error').map((i) => i.text),
      ...probeCapture.errors,
      ...pageErrors,
    ];

    const wrongContextWarnings = allWarnings.filter((w) => WRONG_CONTEXT_RE.test(w));
    const genericDeleteWrongContext = allWarnings.filter((w) => GENERIC_DELETE_RE.test(w)).length;
    const deleteVertexArrayWrongContext = allWarnings.filter((w) => DELETE_VAO_RE.test(w)).length;

    function buildWindow(sample, pixel, settings, screenshot, image) {
      const frameMs = sample.frames.map((f) => f.frameMs);
      const internalRenderMs = sample.frames.map((f) => f.internalRenderMs);
      const frameCallbackMs = sample.frames.map((f) => f.frameCallbackMs);
      const lastInfo = sample.rendererInfo[sample.rendererInfo.length - 1] || {};
      return {
        phase: sample.phase,
        ...stats(frameMs),
        cadence: stats(frameMs),
        internalRender: stats(internalRenderMs),
        frameCallback: stats(frameCallbackMs),
        rendererInfo: {
          calls: lastInfo.calls ?? null,
          triangles: lastInfo.triangles ?? null,
          geometries: lastInfo.geometries ?? null,
          textures: lastInfo.textures ?? null,
          programs: lastInfo.programs ?? null,
        },
        pixelProof: pixel,
        image,
        settings: settings.video,
        pixelRatio: settings.pixelRatio,
        screenshot: repoRel(screenshot),
      };
    }

    report.windows = [
      buildWindow(sampleA, pixelA, settingsA, screenshotA, imageA),
      buildWindow(sampleB, pixelB, settingsB, screenshotBEnd, imageB),
      buildWindow(sampleA2, pixelA2, settingsA2, screenshotA2, imageA2),
    ];

    report.contextLoss = {
      available: true,
      before: contextBeforeLost,
      after: contextAfterLost,
      lostEvent: probeCapture.lostEvent,
      restoredEvent: probeCapture.restoredEvent,
      recovered: probeCapture.recovered,
      meshRecovered: !!baselineScene.playerMeshUuid
        && !!recoveredScene.playerMeshUuid
        && baselineScene.playerMeshUuid === recoveredScene.playerMeshUuid
        && recoveredScene.authoredShips >= baselineScene.authoredShips
        && recoveredScene.authoredPlaces >= baselineScene.authoredPlaces,
      rootIdentityStable: !!baselineScene.playerMeshUuid
        && baselineScene.playerMeshUuid === recoveredScene.playerMeshUuid,
      frameAdvanced: sampleB.frames.length >= 50,
      baselineScene,
      recoveredScene,
    };

    report.issues = {
      wrongContextWarnings: wrongContextWarnings.length,
      genericDeleteWrongContext,
      deleteVertexArrayWrongContext,
      consoleErrors: allErrors.length,
      pageErrors: pageErrors.length,
      httpErrors: httpErrors.length,
      requestFailures: requestFailures.length,
    };

    report.screenshots = {
      A_end: repoRel(screenshotA),
      B_start: repoRel(screenshotBStart),
      B_end: repoRel(screenshotBEnd),
      A2_end: repoRel(screenshotA2),
    };

    // Visible-pixel recovery proof: canvas PNG data URL is non-empty after restore and A2 matches A.
    const bytesA = pixelA?.dataUrlBytes ?? 0;
    const bytesA2 = pixelA2?.dataUrlBytes ?? 0;
    const bytesBStart = pixelBStart?.dataUrlBytes ?? 0;
    const MIN_PIXEL_BYTES = 1000;
    const pixelRecovery = bytesA >= MIN_PIXEL_BYTES && bytesA2 >= MIN_PIXEL_BYTES
      && Math.abs(bytesA2 - bytesA) / bytesA <= 0.25;
    const bStartVisible = bytesBStart >= MIN_PIXEL_BYTES
      && imageBStart.meanLuminance >= imageA.meanLuminance * 0.6
      && imageBStart.nonBlackFraction >= imageA.nonBlackFraction * 0.6;
    const visualRecovery = imageB.meanLuminance >= imageA.meanLuminance * 0.8
      && imageB.nonBlackFraction >= imageA.nonBlackFraction * 0.8
      && imageA2.meanLuminance >= imageA.meanLuminance * 0.8
      && imageA2.nonBlackFraction >= imageA.nonBlackFraction * 0.8;
    report.contextLoss.visualRecovery = visualRecovery;
    report.contextLoss.screenshotStats = { baseline: imageA, recoveryStart: imageBStart, recoveryEnd: imageB, return: imageA2 };

    // Settings parity.
    const settingsParity = JSON.stringify(settingsA.video) === JSON.stringify(settingsB.video)
      && JSON.stringify(settingsB.video) === JSON.stringify(settingsA2.video)
      && settingsA.pixelRatio === settingsA2.pixelRatio;

    const authoredQualityRecovered = baselineScene.authoredShips >= 1
      && baselineScene.authoredPlaces >= 1
      && recoveredScene.authoredShips >= baselineScene.authoredShips
      && recoveredScene.authoredPlaces >= baselineScene.authoredPlaces
      && recoveredScene.visibleRenderables > 0;
    const rootMembershipStable = JSON.stringify(baselineScene.rootIds) === JSON.stringify(recoveredScene.rootIds);
    const listenerCountsStable = JSON.stringify(baselineScene.listenerCounts) === JSON.stringify(recoveredScene.listenerCounts);
    const noProgramDuplication = recoveredScene.memory.programs <= baselineScene.memory.programs + 8;
    const noGeometryRunaway = recoveredScene.memory.geometries <= baselineScene.memory.geometries + 16;
    const internalTimingMeasured = report.windows.every((window) =>
      window.internalRender.samples >= 50
      && Number.isFinite(window.internalRender.p95Ms)
      && Number.isFinite(window.internalRender.p99Ms));

    const pass = probeCapture.recovered
      && bStartVisible
      && pixelRecovery
      && visualRecovery
      && settingsParity
      && authoredQualityRecovered
      && rootMembershipStable
      && listenerCountsStable
      && noProgramDuplication
      && noGeometryRunaway
      && internalTimingMeasured
      && wrongContextWarnings.length === 0
      && allErrors.length === 0
      && pageErrors.length === 0
      && httpErrors.length === 0
      && requestFailures.length === 0;

    report.status = pass ? 'pass' : 'fail';
    report.pass = pass;
    report.checks = {
      recovered: probeCapture.recovered,
      bStartVisible,
      pixelRecovery,
      visualRecovery,
      settingsParity,
      authoredQualityRecovered,
      rootMembershipStable,
      listenerCountsStable,
      noProgramDuplication,
      noGeometryRunaway,
      internalTimingMeasured,
      noWrongContextWarnings: wrongContextWarnings.length === 0,
      noErrors: allErrors.length === 0 && pageErrors.length === 0 && httpErrors.length === 0 && requestFailures.length === 0,
    };

    // Write raw telemetry for the contract test.
    const perfTelemetry = {
      frameMs: {
        sampleCount: sampleA.frames.length + sampleB.frames.length + sampleA2.frames.length,
        ...stats([...sampleA.frames, ...sampleB.frames, ...sampleA2.frames].map((f) => f.frameMs)),
      },
      samples: [
        ...sampleA.frames.map((f) => ({ ...f, phaseTag: 'flight_steady' })),
        ...sampleB.frames.map((f) => ({ ...f, phaseTag: 'context_recover_steady' })),
        ...sampleA2.frames.map((f) => ({ ...f, phaseTag: 'return_baseline' })),
      ],
      windows: report.windows.map((window) => ({
        phase: window.phase,
        cadence: window.cadence,
        internalRender: window.internalRender,
        frameCallback: window.frameCallback,
      })),
    };
    const errorTelemetry = {
      pageErrors,
      requestFailures,
      httpErrors,
      consoleErrors: allErrors,
      glErrors: [],
      warnings: allWarnings,
    };
    const contextLossTelemetry = {
      ...report.contextLoss,
      pixelProof: bStartVisible && pixelRecovery && authoredQualityRecovered,
    };
    await writeRawTelemetry(errorTelemetry, contextLossTelemetry, perfTelemetry);

    writeReport(report);
    console.log(`[probe-context-loss-frame-pacing] ${pass ? 'PASS' : 'FAIL'} ` +
      `wrong-context=${wrongContextWarnings.length} genericDelete=${genericDeleteWrongContext} vao=${deleteVertexArrayWrongContext}`);
    if (!pass) process.exitCode = 1;
  } catch (error) {
    report.status = 'fail';
    report.pass = false;
    report.error = { message: error.message, stack: error.stack };
    report.errorEvidence = {
      consoleIssues,
      pageErrors,
      httpErrors,
      requestFailures,
    };
    report.issues = {
      wrongContextWarnings: 0,
      genericDeleteWrongContext: 0,
      deleteVertexArrayWrongContext: 0,
      consoleErrors: consoleIssues.filter((i) => i.level === 'error').length,
      pageErrors: pageErrors.length,
      httpErrors: httpErrors.length,
      requestFailures: requestFailures.length,
    };
    writeReport(report);
    console.error(`[probe-context-loss-frame-pacing] FAIL at probe: ${error.message || error}`);
    process.exitCode = 1;
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }
}

runProbe();
