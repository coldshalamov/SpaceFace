#!/usr/bin/env node
// Headed or headless Playwright tool to capture a full WebGL frame using Spector.js.
// Outputs .devshots/spector/spector-capture.json and an analyzed summary report.

import { createServer } from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'spector');
const PORT = Number(process.env.SPACEFACE_PORT || 8123);
const HEADFUL = process.argv.includes('--headful');
const ROUTE = process.argv.find((a) => a.startsWith('--route='))?.split('=')[1] || 'flight';
const TIMEOUT_MS = 30_000;

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
  import('node:http').then(({ get }) => get(url, cb));
}

async function ensureLocalServer() {
  const running = await isServerRunning(PORT);
  if (running) {
    console.log(`[perf:spector] Using existing server on port ${PORT}`);
    return null;
  }
  console.log(`[perf:spector] Starting local server on port ${PORT}...`);
  const srv = spawn('node', ['server.js', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  });
  // Wait up to 10s for server to respond
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isServerRunning(PORT)) {
      console.log('[perf:spector] Server is up.');
      return srv;
    }
  }
  throw new Error(`Server failed to start on port ${PORT}`);
}

function analyzeSpectorCapture(capture) {
  const commands = capture.commands || [];
  let drawCalls = 0;
  let instancedDrawCalls = 0;
  let useProgramCalls = 0;
  let textureBinds = 0;
  let stateChanges = 0;

  const callsByProgram = new Map();
  let currentProgram = 'unknown';

  for (const cmd of commands) {
    const name = cmd.name || '';
    if (name === 'useProgram') {
      useProgramCalls++;
      currentProgram = cmd.commandArguments?.[0] || 'program_' + useProgramCalls;
    } else if (name.startsWith('draw')) {
      drawCalls++;
      if (name.includes('Instanced')) instancedDrawCalls++;
      callsByProgram.set(currentProgram, (callsByProgram.get(currentProgram) || 0) + 1);
    } else if (name === 'bindTexture') {
      textureBinds++;
    } else if (name === 'enable' || name === 'disable' || name === 'blendFunc' || name === 'depthMask') {
      stateChanges++;
    }
  }

  return {
    totalCommands: commands.length,
    drawCalls,
    instancedDrawCalls,
    useProgramCalls,
    textureBinds,
    stateChanges,
    callsByProgram: Object.fromEntries(callsByProgram),
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const serverProcess = await ensureLocalServer();

  let browser = null;
  try {
    const { chromium } = await loadPlaywright(ROOT);
    console.log(`[perf:spector] Launching Chromium (${HEADFUL ? 'headed' : 'headless'})...`);
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

    const targetUrl = `http://127.0.0.1:${PORT}/?spector=1&seed=47`;
    console.log(`[perf:spector] Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

    // Wait for canvas
    await page.waitForSelector('#gl-canvas', { timeout: 15_000 });

    // Wait for game to finish boot
    console.log('[perf:spector] Waiting for SpaceFace boot...');
    await page.waitForFunction(() => window.SF && window.SF.state, { timeout: 20_000 });

    // If starting a flight run
    if (ROUTE === 'flight') {
      console.log('[perf:spector] Starting flight scene...');
      await page.evaluate(() => {
        if (window.SF.helpers && typeof window.SF.helpers.startNewGame === 'function') {
          window.SF.helpers.startNewGame({ seed: 47 });
        }
      });
      // Wait for flight mode
      await page.waitForFunction(() => window.SF.state && window.SF.state.mode === 'flight', { timeout: 15_000 });
      // Let flight run for 3 seconds so models and particles are populated
      await page.waitForTimeout(3000);
    } else {
      await page.waitForTimeout(2000);
    }

    console.log('[perf:spector] Triggering Spector WebGL frame capture...');
    const capture = await page.evaluate(async () => {
      if (!window.SF || !window.SF.perf || !window.SF.perf.spector) {
        throw new Error('Spector integration not found on window.SF');
      }
      return await window.SF.perf.spector.capture({ download: false, timeoutMs: 15000 });
    });

    console.log(`[perf:spector] Frame capture successful! (${capture.commands?.length || 0} GL commands)`);

    const jsonPath = path.join(OUT_DIR, 'spector-capture.json');
    await writeFile(jsonPath, JSON.stringify(capture, null, 2), 'utf8');
    console.log(`[perf:spector] Saved raw capture to ${jsonPath}`);

    const analysis = analyzeSpectorCapture(capture);

    const reportMd = [
      '# Spector.js Frame Capture Analysis',
      '',
      `- **Date**: ${new Date().toISOString()}`,
      `- **Route**: ${ROUTE}`,
      `- **Total WebGL Commands**: ${analysis.totalCommands}`,
      `- **Total Draw Calls**: **${analysis.drawCalls}** (${analysis.instancedDrawCalls} instanced)`,
      `- **Program Switches (\`useProgram\`)**: ${analysis.useProgramCalls}`,
      `- **Texture Bindings (\`bindTexture\`)**: ${analysis.textureBinds}`,
      `- **State Changes**: ${analysis.stateChanges}`,
      '',
      '## Draw Calls Per Shader Program',
      '',
      '| Shader Program / Group | Draw Calls | % of Total |',
      '| --- | --- | --- |',
      ...Object.entries(analysis.callsByProgram).map(([prog, count]) => {
        const pct = ((count / Math.max(1, analysis.drawCalls)) * 100).toFixed(1);
        return `| \`${prog}\` | ${count} | ${pct}% |`;
      }),
      '',
      '## Performance Diagnosis & Budget Check',
      '',
      analysis.drawCalls > 250
        ? `⚠️ **WARNING**: Frame draw calls (${analysis.drawCalls}) exceed the 200 budget ceiling. Check for unbatched meshes or missing instancing.`
        : `✅ **PASS**: Frame draw calls (${analysis.drawCalls}) are within the 200 call budget.`,
      analysis.useProgramCalls > 30
        ? `⚠️ **WARNING**: High shader program switches (${analysis.useProgramCalls}). Group draws by material/program to reduce driver overhead.`
        : `✅ **PASS**: Program switches (${analysis.useProgramCalls}) are healthy.`,
      '',
    ].join('\n');

    const reportPath = path.join(OUT_DIR, 'report.md');
    await writeFile(reportPath, reportMd, 'utf8');
    console.log(`[perf:spector] Analysis report saved to ${reportPath}`);

    console.log('\n--- Frame Summary ---');
    console.log(`Draw Calls: ${analysis.drawCalls} (Instanced: ${analysis.instancedDrawCalls})`);
    console.log(`Program Switches: ${analysis.useProgramCalls}`);
    console.log(`Texture Binds: ${analysis.textureBinds}`);
    console.log(`Report: ${reportPath}`);
  } finally {
    if (browser) await browser.close();
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

main().catch((err) => {
  console.error('[perf:spector] Execution failed:', err);
  process.exit(1);
});
