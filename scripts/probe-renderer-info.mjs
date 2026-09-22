#!/usr/bin/env node
// Headed or headless Playwright probe for Three.js renderer.info telemetry.
// Measures draw calls, triangles, geometry/texture allocation stability, and mid-flight shader compilations.

import { createServer, get as httpRequestGet } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'renderer-info');
const PORT = Number(process.env.SPACEFACE_PORT || 8123);
const HEADFUL = process.argv.includes('--headful');
const DURATION_S = Number(process.argv.find((a) => a.startsWith('--duration='))?.split('=')[1] || 15);
const TIMEOUT_MS = 40_000;

async function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = httpGet(`http://127.0.0.1:${port}/`, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

function httpGet(url, cb) {
  return httpRequestGet(url, cb);
}

async function ensureLocalServer() {
  const running = await isServerRunning(PORT);
  if (running) {
    console.log(`[perf:renderer-info] Using existing server on port ${PORT}`);
    return null;
  }
  console.log(`[perf:renderer-info] Starting local server on port ${PORT}...`);
  const srv = spawn('node', ['server.js', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isServerRunning(PORT)) {
      console.log('[perf:renderer-info] Server is up.');
      return srv;
    }
  }
  throw new Error(`Server failed to start on port ${PORT}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const serverProcess = await ensureLocalServer();

  let browser = null;
  try {
    const { chromium } = await loadPlaywright(ROOT);
    console.log(`[perf:renderer-info] Launching Chromium (${HEADFUL ? 'headed' : 'headless'})...`);
    browser = await chromium.launch({
      headless: !HEADFUL,
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      const txt = msg.text();
      if (txt.includes('[SpaceFace]') || txt.includes('[render]')) {
        console.log(`[browser] ${txt}`);
      }
    });

    const targetUrl = `http://127.0.0.1:${PORT}/?perfmonitor=1&seed=47`;
    console.log(`[perf:renderer-info] Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

    await page.waitForSelector('#gl-canvas', { timeout: 15_000 });
    console.log('[perf:renderer-info] Waiting for SpaceFace boot...');
    await page.waitForFunction(() => window.SF && window.SF.state, { timeout: 20_000 });

    console.log('[perf:renderer-info] Starting flight...');
    await page.evaluate(() => {
      if (window.SF.bus && typeof window.SF.bus.emit === 'function') {
        window.SF.bus.emit('game:new', { seed: 47 });
      }
    });

    // Authored-visual readiness can take well over a minute on software/integrated WebGL.
    await page.waitForFunction(
      () => window.SF.state && (window.SF.state.mode === 'flight' || window.SF.state.mode === 'gameover'),
      { timeout: 180_000, polling: 500 },
    );
    const mode = await page.evaluate(() => window.SF.state.mode);
    if (mode !== 'flight') throw new Error(`New game did not reach flight (mode=${mode})`);

    // Enable renderer info monitor
    await page.evaluate(() => {
      if (window.SF.perf && window.SF.perf.renderInfo) {
        window.SF.perf.renderInfo.enable();
        window.SF.perf.renderInfo.reset();
        window.SF.perf.renderInfo.markWarmupComplete();
      }
    });

    console.log(`[perf:renderer-info] Sampling telemetry over ${DURATION_S} seconds of flight...`);
    const startTime = Date.now();
    const snapshots = [];

    while (Date.now() - startTime < DURATION_S * 1000) {
      await page.waitForTimeout(1000);
      const snap = await page.evaluate(() => {
        if (!window.SF || !window.SF.perf || !window.SF.perf.renderInfo) return null;
        return window.SF.perf.renderInfo.getSummary(60);
      });
      if (snap) snapshots.push({ elapsedS: Math.round((Date.now() - startTime) / 1000), ...snap });
    }

    const finalSummary = await page.evaluate(() => {
      return {
        summary: window.SF.perf.renderInfo.getSummary(),
        history: window.SF.perf.renderInfo.history,
        anomalies: window.SF.perf.renderInfo.anomalies,
      };
    });

    const telemetryPath = path.join(OUT_DIR, 'telemetry.json');
    await writeFile(telemetryPath, JSON.stringify(finalSummary, null, 2), 'utf8');

    const s = finalSummary.summary;
    const anomalies = finalSummary.anomalies || [];
    const shaderCompiles = anomalies.filter((a) => a.type === 'mid_flight_shader_compilation');

    const passCalls = s.drawCalls.p95 <= 250;
    const passShaders = shaderCompiles.length === 0;

    const reportMd = [
      '# Three.js `renderer.info` Performance Report',
      '',
      `- **Date**: ${new Date().toISOString()}`,
      `- **Duration**: ${DURATION_S} seconds`,
      `- **Total Frames Sampled**: ${s.sampleCount}`,
      '',
      '## Telemetry Summary',
      '',
      '| Metric | Min | Average | p50 (Median) | p95 | Max | Budget | Status |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      `| **Draw Calls** | ${s.drawCalls.min} | ${s.drawCalls.avg} | ${s.drawCalls.p50} | ${s.drawCalls.p95} | ${s.drawCalls.max} | <= 250 | ${passCalls ? '✅ PASS' : '❌ FAIL'} |`,
      `| **Triangles** | ${s.triangles.min.toLocaleString()} | ${s.triangles.avg.toLocaleString()} | ${s.triangles.p50.toLocaleString()} | ${s.triangles.p95.toLocaleString()} | ${s.triangles.max.toLocaleString()} | <= 300,000 | ${s.triangles.p95 <= 300000 ? '✅ PASS' : '⚠️ HIGH'} |`,
      '',
      '## Resource Allocation Stability',
      '',
      `- **Active Geometries**: ${s.memory.geometries}`,
      `- **Active Textures**: ${s.memory.textures}`,
      `- **Active Shader Programs**: ${s.memory.programs}`,
      `- **Late Mid-Flight Shader Compilations**: **${shaderCompiles.length}** ${passShaders ? '✅ (Zero late links)' : '❌ (Causes frame hitches!)'}`,
      '',
      '## Detected Anomalies',
      '',
      anomalies.length === 0
        ? 'No performance anomalies detected during the sampling window.'
        : anomalies.map((a) => `- Frame ${a.frame} [${a.type}]: ${a.description}`).join('\n'),
      '',
    ].join('\n');

    const reportPath = path.join(OUT_DIR, 'report.md');
    await writeFile(reportPath, reportMd, 'utf8');
    console.log(`[perf:renderer-info] Saved report to ${reportPath}`);

    console.log('\n--- Telemetry Highlights ---');
    console.log(`Draw Calls: p50=${s.drawCalls.p50}, p95=${s.drawCalls.p95}, max=${s.drawCalls.max}`);
    console.log(`Triangles: p50=${s.triangles.p50.toLocaleString()}, p95=${s.triangles.p95.toLocaleString()}`);
    console.log(`Late Shader Compiles: ${shaderCompiles.length}`);
    console.log(`Report: ${reportPath}`);
  } finally {
    if (browser) await browser.close();
    if (serverProcess) serverProcess.kill();
  }
}

main().catch((err) => {
  console.error('[perf:renderer-info] Execution failed:', err);
  process.exit(1);
});
