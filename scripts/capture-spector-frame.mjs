#!/usr/bin/env node
// Headed or headless Playwright tool to capture a full WebGL frame using Spector.js.
// Outputs .devshots/spector/spector-capture.json and an analyzed summary report.

import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { bootToMenu, adventureToFlight } from './player-truth/routes.mjs';
import { startBenchServer } from './lib/benchServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { loadSourceOverlayManifest } = createRequire(import.meta.url)('./lib/gameServer.cjs');
// Use the shared validated source overlay; assets and the public flight route stay canonical.
const baselineSourceArg = process.argv.find(a => a.startsWith('--baseline-source='))?.slice('--baseline-source='.length);
const baselineSourcePath = baselineSourceArg ? path.resolve(ROOT, baselineSourceArg) : null;
let baselineSourceOverlay = null;
let baselineSourceRelative = null;
if (baselineSourcePath) {
  baselineSourceRelative = path.relative(ROOT, baselineSourcePath).replace(/\\/g, '/');
  if (!baselineSourceRelative.startsWith('.devshots/')) {
    throw new Error('--baseline-source must point to an ignored manifest under .devshots/');
  }
  try {
    execFileSync('git', ['check-ignore', '--quiet', '--', baselineSourceRelative], { cwd: ROOT });
  } catch {
    throw new Error('--baseline-source manifest must be ignored by Git');
  }
  baselineSourceOverlay = loadSourceOverlayManifest(baselineSourcePath);
}
const outputArg = process.argv.find(a => a.startsWith('--out='))?.slice(6);
const OUT_DIR = path.resolve(ROOT, outputArg || path.join('.devshots', 'spector', new Date().toISOString().replace(/[:.]/g, '-')));
if (!OUT_DIR.startsWith(path.join(ROOT, '.devshots') + path.sep)) throw new Error('--out must stay under .devshots');
const HEADFUL = process.argv.includes('--headful');
const ROUTE = process.argv.find((a) => a.startsWith('--route='))?.split('=')[1] || 'flight';
if (!['flight', 'menu'].includes(ROUTE)) throw new Error('--route must be flight or menu');
const numberOption = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(name + '='))?.slice(name.length + 1);
  return raw == null ? fallback : Number(raw);
};
const WIDTH = numberOption('--width', 1280), HEIGHT = numberOption('--height', 720);
const DPR = numberOption('--dpr', 1), TRAVEL_MS = numberOption('--travel-ms', 0);
if (!Number.isInteger(WIDTH) || WIDTH <= 0 || !Number.isInteger(HEIGHT) || HEIGHT <= 0
  || !Number.isFinite(DPR) || DPR <= 0 || !Number.isFinite(TRAVEL_MS) || TRAVEL_MS < 0) {
  throw new Error('Expected positive integer width/height, positive dpr and nonnegative travel-ms');
}

export function analyzeSpectorCapture(capture) {
  const commands = capture.commands || [];
  let drawCalls = 0;
  let instancedDrawCalls = 0;
  let multiDrawCalls = 0;
  let logicalDrawCalls = 0;
  let useProgramCalls = 0;
  let textureBinds = 0;
  let stateChanges = 0;

  const callsByProgram = new Map();
  let currentProgram = 'unknown';

  for (const cmd of commands) {
    const name = cmd.name || '';
    if (name === 'useProgram') {
      useProgramCalls++;
      const program = cmd.commandArguments?.[0];
      currentProgram = program?.__SPECTOR_Object_TAG?.displayText
        || (typeof program === 'string' ? program : 'program_' + useProgramCalls);
    } else if (name.startsWith('draw') || name.startsWith('multiDraw')) {
      drawCalls++;
      if (name.includes('Instanced')) instancedDrawCalls++;
      if (name.startsWith('multiDraw')) {
        multiDrawCalls++;
        logicalDrawCalls += Number(cmd.commandArguments?.at(-1)) || 0;
      } else logicalDrawCalls++;
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
    multiDrawCalls,
    logicalDrawCalls,
    useProgramCalls,
    textureBinds,
    stateChanges,
    callsByProgram: Object.fromEntries(callsByProgram),
  };
}

async function main() {
  await mkdir(path.dirname(OUT_DIR), { recursive: true });
  await mkdir(OUT_DIR, { recursive: false });
  const server = await startBenchServer({ sourceOverlay: baselineSourcePath });

  let browser = null;
  try {
    const readOverlayIdentity = async () => {
      if (!baselineSourceOverlay) return null;
      const response = await fetch(`${server.baseUrl}__source_overlay_identity`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Source overlay identity endpoint returned ${response.status}`);
      const identity = await response.json();
      if (identity.sourceOverlayDigest !== baselineSourceOverlay.identity.sourceOverlayDigest
        || identity.sourceCommit !== baselineSourceOverlay.identity.sourceCommit) {
        throw new Error('Served source overlay differs from validated baseline manifest');
      }
      const { sourceCommit, sourceOverlayDigest, fileCount, totalBytes } = identity;
      return { sourceCommit, sourceOverlayDigest, fileCount, totalBytes };
    };
    const servedOverlayStart = await readOverlayIdentity();
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
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: DPR,
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      const txt = msg.text();
      if (txt.includes('[SpaceFace]') || txt.includes('[render]')) {
        console.log(`[browser] ${txt}`);
      }
    });

    const targetUrl = `${server.baseUrl}?spector=1&seed=47`;
    console.log(`[perf:spector] Navigating to ${targetUrl}...`);
    console.log('[perf:spector] Waiting for SpaceFace boot...');
    await bootToMenu(page, targetUrl, (name, _ok, detail) => console.log(`[perf:spector] ${name}: ${detail}`));

    let launchedRunSeed = null;
    // If starting a flight run
    if (ROUTE === 'flight') {
      console.log('[perf:spector] Starting flight scene...');
      const launch = await adventureToFlight(page, (name, _ok, detail) => console.log(`[perf:spector] ${name}: ${detail}`), { seed: 47 });
      launchedRunSeed = launch.runSeed;
      // Wait for flight mode — authored-visual readiness can take a while on software WebGL.
      await page.waitForFunction(() => {
        const state = window.SF?.state;
        return state?.mode === 'flight' && state.render?.flightVeilHoldsSim !== true
          && Number.isFinite(state.render?.firstPlayableFrameAt);
      }, null, { timeout: 180_000, polling: 500 });
      if (TRAVEL_MS > 0) {
        await page.keyboard.down('w');
        try { await page.waitForTimeout(TRAVEL_MS); }
        finally { await page.keyboard.up('w'); }
      }
      // Let flight run for 3 seconds so models and particles are populated
      await page.waitForTimeout(3000);
    } else {
      await page.waitForTimeout(2000);
    }

    console.log('[perf:spector] Triggering Spector WebGL frame capture...');
    const metadata = await page.evaluate(() => {
      const st = window.SF.state, gl = st.render.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { mode: st.mode, seed: st.meta?.seed ?? null, simTime: st.simTime, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
        userAgent: navigator.userAgent, settings: st.settings, viewport: [innerWidth, innerHeight],
        buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], authority: 'single-frame GL diagnostic; capture disturbs timing' };
    });
    if (launchedRunSeed != null) metadata.seed = launchedRunSeed;
    metadata.captureProfile = { route: ROUTE, width: WIDTH, height: HEIGHT, dpr: DPR,
      travelMs: TRAVEL_MS, settleMs: ROUTE === 'flight' ? 3000 : 2000 };
    metadata.sourceOverlay = baselineSourceOverlay ? {
      manifest: baselineSourceRelative,
      ...servedOverlayStart,
      servedStart: servedOverlayStart,
      servedEnd: null,
      stable: null,
    } : null;
    await writeFile(path.join(OUT_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2));
    const capture = await page.evaluate(async () => {
      if (!window.SF || !window.SF.perf || !window.SF.perf.spector) {
        throw new Error('Spector integration not found on window.SF');
      }
      return await window.SF.perf.spector.capture({ download: false, timeoutMs: 15000 });
    });

    console.log(`[perf:spector] Frame capture successful! (${capture.commands?.length || 0} GL commands)`);
    if (metadata.sourceOverlay) {
      metadata.sourceOverlay.servedEnd = await readOverlayIdentity();
      metadata.sourceOverlay.stable = JSON.stringify(servedOverlayStart)
        === JSON.stringify(metadata.sourceOverlay.servedEnd);
      await writeFile(path.join(OUT_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2));
    }

    const jsonPath = path.join(OUT_DIR, 'spector-capture.json');
    await writeFile(jsonPath, JSON.stringify(capture, null, 2), 'utf8');
    console.log(`[perf:spector] Saved raw capture to ${jsonPath}`);

    const analysis = analyzeSpectorCapture(capture);
    const completeFrame = capture.spacefaceBoundary?.successfulWorldDraw === true
      && capture.spacefaceBoundary.truncated === false;
    if (!completeFrame) process.exitCode = 2;

    const reportMd = [
      '# Spector.js Frame Capture Analysis',
      '',
      `- **Date**: ${new Date().toISOString()}`,
      `- **Route**: ${ROUTE}`,
      `- **Frame coverage**: ${completeFrame ? 'complete successful world draw' : 'INCOMPLETE; command limit or submission boundary unobserved'}`,
      `- **Total WebGL Commands**: ${analysis.totalCommands}`,
      `- **Total Draw Calls**: **${analysis.drawCalls}** (${analysis.instancedDrawCalls} instanced)`,
      `- **Multi-draw Calls**: ${analysis.multiDrawCalls}; logical subdraws including ordinary calls: ${analysis.logicalDrawCalls}`,
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
      '## Interpretation',
      '',
      !completeFrame ? 'INCOMPLETE: bounded commands cannot establish whole-frame totals.'
        : 'Complete-frame counts identify batching, material ordering and texture traffic; they do not establish frame cost.',
      'Use the captured shaders, targets and uniforms with CPU/GPU timings. This instrument does not certify FPS, hitch reduction or picture quality.',
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
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[perf:spector] Execution failed:', err);
    process.exit(1);
  });
}
