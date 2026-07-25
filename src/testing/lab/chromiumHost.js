// Node-side Playwright driver for the Chromium authoritative-runtime host (Phase 4 §15).
// Manual-step parity surface — not a broker acceptance. Hard timeout + descendant cleanup.

import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadPlaywright } from '../../../scripts/lib/load-playwright.mjs';
import { killProcessTree } from '../../../scripts/lib/validationProcessControl.mjs';
import { hashDeterministicSurface } from './checkpoint.js';
import { hashInputTape } from './inputTape.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const HOST_PAGE = '/src/testing/lab/chromiumHostPage.html';

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Run a compiled canonical scenario inside Chromium via Playwright.
 * @param {object} canonical
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function runChromiumLabScenario(canonical, options = {}) {
  const timeoutMs = Math.max(5_000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();
  let server = null;
  let browser = null;
  let timedOut = false;
  let timer = null;
  let launchCount = 0;

  const cleanup = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (browser) {
      try { await browser.close(); } catch (_) { /* best-effort */ }
      browser = null;
    }
    if (server && server.child && server.child.pid) {
      try { await killProcessTree(server.child.pid); } catch (_) { /* best-effort */ }
      server = null;
    }
  };

  try {
    const hardDeadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(Object.assign(new Error(`chromiumHost timed out after ${timeoutMs}ms`), {
          code: 'timeout',
          status: 'infra_error',
        }));
      }, timeoutMs);
      timer.unref?.();
    });

    const work = (async () => {
      server = options.baseUrl
        ? { child: null, baseUrl: options.baseUrl }
        : await startFreshServer(options.root || ROOT);

      const { chromium } = await loadPlaywright();
      browser = await chromium.launch({
        headless: options.headless !== false,
      });
      launchCount = 1;
      const page = await browser.newPage({
        viewport: { width: 800, height: 600 },
        deviceScaleFactor: 1,
      });

      const url = new URL(HOST_PAGE, server.baseUrl).href;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(30_000, timeoutMs) });
      await page.waitForFunction(
        () => !!(window.__SF_BROWSER_LAB__ && window.__SF_BROWSER_LAB__.ready && window.__SF_BROWSER_LAB__.runBrowserLabScenario),
        null,
        { timeout: Math.min(30_000, timeoutMs) },
      );

      const scenarioDigest = options.scenarioDigest || null;
      const inputDigest = options.inputDigest || hashInputTape(canonical.inputTape);
      const checkpointEvery = options.checkpointEvery;
      const checkpointTicks = options.checkpointTicks;

      const result = await page.evaluate(
        async ({ canonical: can, scenarioDigest: sd, inputDigest: id, checkpointEvery: ce, checkpointTicks: ct }) => {
          return window.__SF_BROWSER_LAB__.runBrowserLabScenario(can, {
            scenarioDigest: sd,
            inputDigest: id,
            checkpointEvery: ce,
            checkpointTicks: ct,
          });
        },
        {
          canonical,
          scenarioDigest,
          inputDigest,
          checkpointEvery,
          checkpointTicks,
        },
      );

      if (!result || !result.ok) {
        return {
          ok: false,
          status: result?.status || 'infra',
          error: result?.error || 'chromium scenario failed',
          stack: result?.stack,
          browserLaunches: launchCount,
          durationMs: Date.now() - startedAt,
        };
      }

      // Hash surfaces on Node with the same digest as buildDeterministicCoveredCheckpoint.
      const series = (result.series || []).map((point) => ({
        tick: point.tick | 0,
        surface: point.surface,
        hash: hashDeterministicSurface(point.surface),
      }));
      const finalHash = result.finalSurface
        ? hashDeterministicSurface(result.finalSurface)
        : (series.length ? series[series.length - 1].hash : null);

      return {
        ok: true,
        status: 'pass',
        schema: 'spaceface.labChromiumHostResult.v1',
        scenarioId: result.scenarioId,
        seed: result.seed,
        ticks: result.ticks,
        scenarioDigest: result.scenarioDigest ?? scenarioDigest,
        inputDigest: result.inputDigest ?? inputDigest,
        fingerprint: result.fingerprint,
        rendering: { detached: true },
        series,
        finalHash,
        finalSurface: result.finalSurface,
        exactWithin: { crossRuntime: false },
        browserLaunches: launchCount,
        durationMs: Date.now() - startedAt,
      };
    })();

    const out = await Promise.race([work, hardDeadline]);
    await cleanup();
    return out;
  } catch (err) {
    await cleanup();
    return {
      ok: false,
      status: timedOut || err?.code === 'timeout' ? 'timeout' : 'infra_error',
      exitClass: 3,
      error: err && err.message ? err.message : String(err),
      browserLaunches: launchCount,
      durationMs: Date.now() - startedAt,
      timedOut,
    };
  }
}

/**
 * Run the same Chromium scenario twice and compare series hashes (within-runtime determinism).
 */
export async function repeatChromiumLabScenario(canonical, options = {}) {
  const a = await runChromiumLabScenario(canonical, options);
  if (!a.ok) return { ok: false, status: a.status, error: a.error, runs: [a] };
  const b = await runChromiumLabScenario(canonical, options);
  if (!b.ok) return { ok: false, status: b.status, error: b.error, runs: [a, b] };

  const len = Math.min(a.series.length, b.series.length);
  let match = a.series.length === b.series.length;
  let firstBad = null;
  for (let i = 0; i < len; i++) {
    if (a.series[i].hash !== b.series[i].hash) {
      match = false;
      firstBad = { tick: a.series[i].tick, index: i, hashA: a.series[i].hash, hashB: b.series[i].hash };
      break;
    }
  }
  return {
    ok: match,
    status: match ? 'pass' : 'fail',
    deterministic: match,
    firstBad,
    browserLaunches: (a.browserLaunches | 0) + (b.browserLaunches | 0),
    finalHash: a.finalHash,
    runs: 2,
  };
}

async function startFreshServer(root) {
  const port = await freePort();
  const child = spawn(process.execPath, [join(root, 'server.js')], {
    cwd: root,
    env: { ...process.env, PORT: String(port), SF_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  let stderr = '';
  child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode != null) {
      throw new Error(`lab server exited early (${child.exitCode}): ${stderr.slice(-1000)}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return { child, baseUrl, port };
    } catch (_) { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  try { await killProcessTree(child.pid); } catch (_) { /* ignore */ }
  throw new Error(`lab server failed to start: ${stderr.slice(-1000)}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

export { HOST_PAGE, ROOT as CHROMIUM_HOST_ROOT };
