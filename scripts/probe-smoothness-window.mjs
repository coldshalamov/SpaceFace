#!/usr/bin/env node
// Headed rAF window on the real player route. Samples even if hitch-budget settle is noisy.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = process.env.SF_PROBE_ROOT || fileURLToPath(new URL('../', import.meta.url));
const argv = Object.fromEntries(process.argv.slice(2).flatMap((arg, i, all) => {
  if (!arg.startsWith('--')) return [];
  const key = arg.slice(2);
  const next = all[i + 1];
  if (!next || next.startsWith('--')) return [[key, true]];
  return [[key, next]];
}));

const WIDTH = Number(argv.width || 1280);
const HEIGHT = Number(argv.height || 800);
const DURATION_MS = Number(argv.duration || 8000);
const WARMUP_MS = Number(argv.warmup || 3000);
const OUT = argv.out || '.devshots/perf/smoothness-window.json';
const SEED = Number(argv.seed || 47) >>> 0;

const { chromium } = await loadPlaywright();

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function startServer() {
  const port = await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on('error', reject);
  });
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port) },
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 20000);
    const onData = (buf) => {
      if (String(buf).includes('SpaceFace') || String(buf).includes(String(port))) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => reject(new Error(`server exited ${code}`)));
    setTimeout(resolve, 1500);
  });
  return { child, baseUrl };
}

const server = await startServer();
let browser;
try {
  browser = await chromium.launch({
    headless: false,
    args: ['--use-gl=angle', '--use-angle=d3d11', `--window-size=${WIDTH},${HEIGHT}`],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 90000 });
  await page.evaluate((seed) => {
    window.SF.bus.emit('game:new', { name: 'Smoothness Window', seed });
    window.SF.bus.emit('ui:closeAll', {});
  }, SEED);
  await page.waitForFunction(() => {
    const s = window.SF && window.SF.state;
    return !!(s && s.mode === 'flight' && s.render && s.render.renderer);
  }, null, { timeout: 120000 });
  await page.waitForFunction(() => {
    const s = window.SF && window.SF.state;
    return Number.isFinite(s && s.render && s.render.firstPlayableFrameAt);
  }, null, { timeout: 90000 }).catch(() => {});

  const report = await page.evaluate(async ({ warmupMs, durationMs }) => {
    const frames = [];
    let last = performance.now();
    let start = last;
    const info = () => {
      const s = window.SF.state;
      const d = window.SF.loop && window.SF.loop.getDiagnostics ? window.SF.loop.getDiagnostics() : {};
      const gl = s.render && s.render.renderer && s.render.renderer.info && s.render.renderer.info.render;
      const report = s.render && s.render.diagnostics && typeof s.render.diagnostics.getReport === 'function'
        ? s.render.diagnostics.getReport()
        : null;
      const gpu = s.render && s.render.gpu;
      const ev = s.render && s.render.entityViewSync;
      return {
        simTime: s.simTime,
        tick: s.tick,
        rendererFrame: gl && gl.frame,
        drawCalls: report && report.render && report.render.calls || gl && gl.calls || 0,
        triangles: report && report.render && report.render.triangles || gl && gl.triangles || 0,
        fullSynced: ev && ev.fullSynced || 0,
        culled: ev && ev.culled || 0,
        renderUpdates: d.renderUpdates || 0,
        contextLost: s.render.contextLost === true,
        lastFrameError: d.lastFrameError || null,
        gpu: gpu && (gpu.renderer || gpu.unmaskedRenderer || gpu.vendor) || null,
        software: gpu && gpu.software === true,
        posX: (window.SF.state.entities.get(window.SF.state.playerId) || {}).pos?.x || 0,
        posZ: (window.SF.state.entities.get(window.SF.state.playerId) || {}).pos?.z || 0,
      };
    };
    const canvasHash = () => {
      const canvas = document.getElementById('gl-canvas');
      if (!canvas || typeof canvas.toDataURL !== 'function') return 0;
      const text = canvas.toDataURL('image/png').slice(0, 8000);
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };
    const first = { ...info(), canvasHash: canvasHash() };
    await new Promise((resolve) => {
      function step(now) {
        const dt = now - last;
        last = now;
        if (now - start >= warmupMs) frames.push(dt);
        if (now - start >= warmupMs + durationMs) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
    const lastSnap = { ...info(), canvasHash: canvasHash() };
    return { first, last: lastSnap, frames };
  }, { warmupMs: WARMUP_MS, durationMs: DURATION_MS });

  const sorted = [...report.frames].sort((a, b) => a - b);
  const hitchCount = report.frames.filter((ms) => ms > 32).length;
  const out = {
    schema: 'spaceface.smoothnessWindow.v1',
    generatedAt: new Date().toISOString(),
    runner: { width: WIDTH, height: HEIGHT, warmupMs: WARMUP_MS, durationMs: DURATION_MS, seed: SEED },
    gpu: report.last.gpu,
    software: report.last.software === true,
    contextLost: report.last.contextLost === true,
    lastFrameError: report.last.lastFrameError,
    simAdvanced: report.last.simTime > report.first.simTime,
    rendererAdvanced: Number(report.last.rendererFrame) > Number(report.first.rendererFrame),
    movement: report.last.posX !== report.first.posX || report.last.posZ !== report.first.posZ
      || report.last.simTime > report.first.simTime,
    drawCalls: report.last.drawCalls || 0,
    triangles: report.last.triangles || 0,
    fullSynced: report.last.fullSynced || 0,
    culled: report.last.culled || 0,
    canvasChanged: report.last.canvasHash !== report.first.canvasHash,
    firstCanvasHash: report.first.canvasHash,
    lastCanvasHash: report.last.canvasHash,
    frameMs: {
      samples: sorted.length,
      avg: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      worst: sorted.length ? sorted[sorted.length - 1] : 0,
      hitchCount,
    },
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.frameMs, null, 2));
  console.log('gpu', out.gpu, 'software', out.software, 'sim', out.simAdvanced, 'render', out.rendererAdvanced);
  console.log('report', OUT);
  process.exitCode = out.software || !out.simAdvanced || !out.rendererAdvanced || out.contextLost ? 2 : 0;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server.child) server.child.kill();
}
