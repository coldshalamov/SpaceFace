#!/usr/bin/env node
// Fast WebGL GPU path sanity check — hardware vs software rendering.
// Read-only: does not change game settings, bloom, dynamic resolution, or visual quality.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = parseArgs(process.argv.slice(2));
const WIDTH = Number(argv.width || 1280);
const HEIGHT = Number(argv.height || 800);
const OUT = argv.out || '.devshots/perf/gpu-path.json';
const HEADED = !!(argv.headed || argv.headful || argv.headless === 'false');
const STRICT = argv.strict !== 'false' && argv.strict !== false;

// Keep aligned with src/render/adaptiveQuality.js SOFTWARE_RE.
const SOFTWARE_RE = /swiftshader|llvmpipe|software|basic render|microsoft basic|softpipe|mesa offscreen|apple software/i;

const FAILURE_MESSAGE = 'SpaceFace is using software WebGL. This is not an art-quality problem. Enable browser hardware acceleration or use the desktop launcher with a hardware GPU context.';

const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await launchProbeBrowser();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });

  await page.goto(withDebugFlight(server.baseUrl), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const sf = window.SF;
    return !!(sf && sf.state && sf.state.render && sf.state.render.renderer);
  }, null, { timeout: 90000 });

  await page.waitForFunction(() => {
    const gpu = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.gpu;
    return !!(gpu && (gpu.renderer || gpu.tier));
  }, null, { timeout: 90000 });

  const sample = await page.evaluate(() => {
    const state = window.SF.state;
    const renderer = state.render.renderer;
    const gpu = state.render.gpu ? { ...state.render.gpu } : null;
    const webgl = {
      debugInfoAvailable: false,
      unmaskedRenderer: null,
      unmaskedVendor: null,
      maskedRenderer: null,
      maskedVendor: null,
      version: null,
      shadingLanguageVersion: null,
    };

    try {
      const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          webgl.debugInfoAvailable = true;
          webgl.unmaskedRenderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
          webgl.unmaskedVendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '');
        }
        webgl.maskedRenderer = String(gl.getParameter(gl.RENDERER) || '');
        webgl.maskedVendor = String(gl.getParameter(gl.VENDOR) || '');
        webgl.version = String(gl.getParameter(gl.VERSION) || '');
        webgl.shadingLanguageVersion = String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || '');
      }
    } catch (err) {
      webgl.error = String(err && err.message ? err.message : err);
    }

    const video = state.settings && state.settings.video ? { ...state.settings.video } : null;
    return {
      gpu,
      webgl,
      softwareRendererFlag: !!state.render.softwareRenderer,
      dynResScale: state.render.dynResScale,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio,
      },
      userAgent: navigator.userAgent,
      video,
      mode: state.mode,
    };
  });

  const softwareHits = collectSoftwareHits(sample);
  const pass = !sample.gpu?.software && softwareHits.length === 0;

  const report = {
    schema: 'spaceface.gpuPath.v1',
    generatedAt: new Date().toISOString(),
    runner: {
      width: WIDTH,
      height: HEIGHT,
      headless: !HEADED,
      strict: STRICT,
      browser: findSystemBrowser() ? 'installed-chrome-edge' : 'bundled-chromium',
    },
    pass,
    hardwareWebGL: pass,
    gpu: sample.gpu,
    webgl: sample.webgl,
    softwareRendererFlag: sample.softwareRendererFlag,
    dynResScale: sample.dynResScale,
    viewport: sample.viewport,
    userAgent: sample.userAgent,
    mode: sample.mode,
    video: sample.video,
    softwareHits,
    qualityPreserving: {
      settingsChangedByProbe: false,
      note: 'Probe is read-only; any runtime software-renderer adaptations are reported, not triggered by this script.',
    },
    message: pass
      ? 'Hardware WebGL path detected.'
      : FAILURE_MESSAGE,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.log(`[gpu-path] report: ${OUT}`);
  console.log(`[gpu-path] summary: ${pass ? 'PASS (hardware WebGL)' : 'FAIL (software WebGL)'}`);
  if (!pass) {
    console.error(`[gpu-path] ${FAILURE_MESSAGE}`);
    if (softwareHits.length) console.error(`[gpu-path] software markers: ${softwareHits.join('; ')}`);
  }

  if (STRICT && !pass) process.exitCode = 1;
} finally {
  await closeProbeBrowser(browser);
  await stopProbeServer(server);
}

function collectSoftwareHits(sample) {
  const hits = [];
  const fields = [
    ['state.render.gpu.renderer', sample.gpu && sample.gpu.renderer],
    ['state.render.gpu.vendor', sample.gpu && sample.gpu.vendor],
    ['webgl.unmaskedRenderer', sample.webgl && sample.webgl.unmaskedRenderer],
    ['webgl.unmaskedVendor', sample.webgl && sample.webgl.unmaskedVendor],
    ['webgl.maskedRenderer', sample.webgl && sample.webgl.maskedRenderer],
    ['webgl.maskedVendor', sample.webgl && sample.webgl.maskedVendor],
  ];
  for (const [label, value] of fields) {
    const text = String(value || '');
    if (text && SOFTWARE_RE.test(text)) hits.push(`${label}: ${text}`);
  }
  if (sample.gpu && sample.gpu.software) hits.push('state.render.gpu.software: true');
  if (sample.softwareRendererFlag) hits.push('state.render.softwareRenderer: true');
  return hits;
}

async function startFreshServer() {
  const port = await findFreePort(8821);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, child, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-5000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await sleep(250);
  }
  child.kill();
  throw new Error(`Dev server did not become reachable at ${url}`);
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}

async function findFreePort(start) {
  for (let port = start; port < start + 200; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free local port found starting at ${start}`);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

function withDebugFlight(url) {
  const u = new URL(url);
  u.searchParams.set('debug', 'flight');
  return String(u);
}

async function launchProbeBrowser() {
  const args = [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    `--window-size=${WIDTH},${HEIGHT}`,
  ];
  const executablePath = findSystemBrowser();
  if (executablePath) {
    try {
      const launched = await chromium.launch({ headless: !HEADED, executablePath, args });
      attachProbeProcess(launched);
      return launched;
    } catch (error) {
      console.warn(`[gpu-path] system browser launch failed; falling back to bundled Chromium: ${error && error.message ? error.message : error}`);
    }
  }
  const launched = await chromium.launch({ headless: !HEADED, args });
  attachProbeProcess(launched);
  return launched;
}

function findSystemBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function attachProbeProcess(launched) {
  try {
    if (launched && typeof launched.process === 'function') launched._probeProcess = launched.process();
  } catch (_) {}
}

async function closeProbeBrowser(target) {
  if (!target) return;
  const proc = target._probeProcess || null;
  try {
    await Promise.race([target.close(), sleep(5000)]);
  } catch (_) {}
  if (proc && proc.exitCode == null && proc.signalCode == null) await terminateChild(proc);
}

async function stopProbeServer(target) {
  if (!target) return;
  if (target.child) {
    await terminateChild(target.child);
    return;
  }
  if (typeof target.kill === 'function') {
    try { target.kill(); } catch (_) {}
  }
}

async function terminateChild(child) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  if (process.platform === 'win32' && child.pid) {
    try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
    await waitForChildExit(child, 2500);
    return;
  }
  try { child.kill(); } catch (_) {}
  await waitForChildExit(child, 2500);
  if (child.exitCode != null || child.signalCode != null) return;
  try { child.kill('SIGKILL'); } catch (_) {}
  await waitForChildExit(child, 1000);
}

async function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(timeoutMs),
  ]);
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq >= 0) out[arg.slice(2, eq)] = arg.slice(eq + 1);
    else {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        out[arg.slice(2)] = next;
        i++;
      } else {
        out[arg.slice(2)] = true;
      }
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}