// Node-side Playwright driver for the Chromium authoritative-runtime host (Phase 4 §15).
// Manual-step parity surface — not a broker acceptance. Hard timeout + descendant cleanup.
// P2: public runChromiumLabScenario(canonical) is zero-DI; injectable options are internal-only.

import { spawn } from 'node:child_process';
import { get as httpGet } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadPlaywright } from '../../../scripts/lib/load-playwright.mjs';
import { killProcessTree } from '../../../scripts/lib/validationProcessControl.mjs';
import { hashDeterministicSurface } from './checkpoint.js';
import { hashInputTape } from './inputTape.js';
import { assertChromiumParitySupported } from './browserScenarioHost.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const HOST_PAGE = '/src/testing/lab/chromiumHostPage.html';

const DEFAULT_TIMEOUT_MS = 120_000;
const DOCUMENT_READY_TIMEOUT_MS = 90_000;
const HOST_READY_TIMEOUT_MS = 90_000;

/**
 * PUBLIC certifying Chromium path — accepts ONLY a compiled canonical.
 * No systems / equivalence / skipMultiRunEquivalence injection.
 *
 * @param {object} canonical
 * @returns {Promise<object>}
 */
export async function runChromiumLabScenario(canonical) {
  // P2: reject any second-argument DI.
  if (arguments.length > 1 && arguments[1] != null) {
    return {
      ok: false,
      status: 'invalid-config',
      certifying: false,
      nonPromoting: false,
      error: 'runChromiumLabScenario accepts only (canonical) — options injection is forbidden; '
        + 'use runChromiumLabScenarioInternal for non-certifying tests or parent child-arms',
      browserLaunches: 0,
      durationMs: 0,
    };
  }
  const internal = await runChromiumLabScenarioInternal(canonical, {});
  return promoteChromiumCertifyingResult(internal);
}

function promoteChromiumCertifyingResult(internal) {
  if (!internal || typeof internal !== 'object') {
    return {
      ok: false,
      status: 'infra',
      certifying: false,
      nonPromoting: false,
      error: 'internal chromium runner returned no result',
      browserLaunches: 0,
      durationMs: 0,
    };
  }
  const { nonPromoting: _np, ...rest } = internal;
  return {
    ...rest,
    nonPromoting: false,
    certifying: true,
  };
}

function markChromiumNonPromoting(result) {
  if (!result || typeof result !== 'object') {
    return {
      ok: false,
      status: 'infra',
      nonPromoting: true,
      certifying: false,
      error: 'internal chromium runner returned no result',
      browserLaunches: 0,
      durationMs: 0,
    };
  }
  return {
    ...result,
    nonPromoting: true,
    certifying: false,
  };
}

/**
 * INTERNAL non-certifying Chromium runner — operational + test seams.
 * Always nonPromoting. Parent differential arms and tests use this path.
 *
 * @param {object} canonical
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function runChromiumLabScenarioInternal(canonical, options = {}) {
  return markChromiumNonPromoting(await runChromiumLabScenarioInternalBody(canonical, options));
}

/**
 * @param {object} canonical
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function runChromiumLabScenarioInternalBody(canonical, options = {}) {
  const scenarioDigest = options.scenarioDigest || null;
  let inputDigest = options.inputDigest || null;
  if (!inputDigest && canonical && typeof canonical === 'object'
    && canonical.inputTape && typeof canonical.inputTape === 'object') {
    try { inputDigest = hashInputTape(canonical.inputTape); } catch (_) { /* identity unavailable */ }
  }

  // Reject before launching a browser when the host cannot mirror the Node bundle.
  if (options.skipSupportCheck !== true) {
    const support = assertChromiumParitySupported(canonical);
    if (!support.ok) {
      return {
        ok: false,
        status: support.status,
        error: support.reason,
        chromiumSupport: support,
        scenarioDigest,
        inputDigest,
        browserLaunches: 0,
        durationMs: 0,
      };
    }
  }

  const timeoutMs = Math.max(5_000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();
  let server = null;
  let browser = null;
  let timedOut = false;
  let timer = null;
  let launchCount = 0;
  const pageDiagnostics = {
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
  };

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
      page.on('pageerror', (error) => pushDiagnostic(
        pageDiagnostics.pageErrors,
        error && error.stack ? error.stack : (error && error.message ? error.message : String(error)),
      ));
      page.on('console', (message) => {
        if (message.type() === 'error') pushDiagnostic(pageDiagnostics.consoleErrors, message.text());
      });
      page.on('requestfailed', (request) => pushDiagnostic(
        pageDiagnostics.requestFailures,
        `${request.url()} (${request.failure()?.errorText || 'unknown failure'})`,
      ));

      const url = new URL(HOST_PAGE, server.baseUrl).href;
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(DOCUMENT_READY_TIMEOUT_MS, timeoutMs),
      });
      await page.waitForFunction(
        () => {
          const host = window.__SF_BROWSER_LAB__;
          if (host && host.status === 'error') {
            throw new Error(`browser host module failed: ${host.error || 'unknown error'}`);
          }
          return !!(host && host.ready
            && (host.runBrowserLabScenarioInternal || host.runBrowserLabScenario));
        },
        null,
        { timeout: Math.min(HOST_READY_TIMEOUT_MS, timeoutMs) },
      );

      inputDigest = inputDigest || hashInputTape(canonical.inputTape);
      const checkpointEvery = options.checkpointEvery;
      const checkpointTicks = options.checkpointTicks;

      // Internal host path: call browser internal runner (never public zero-DI entry with DI).
      const skipMultiRunEquivalence = options.skipMultiRunEquivalence === true;
      const result = await page.evaluate(
        async ({
          canonical: can,
          scenarioDigest: sd,
          inputDigest: id,
          checkpointEvery: ce,
          checkpointTicks: ct,
          skipMultiRunEquivalence: skipEq,
          equivalence: eq,
          systems: sys,
        }) => {
          const host = window.__SF_BROWSER_LAB__;
          const runInternal = host.runBrowserLabScenarioInternal || host.runBrowserLabScenario;
          // Prefer internal API; fall back only if host page is older (still non-certifying arm).
          if (host.runBrowserLabScenarioInternal) {
            return runInternal(can, {
              scenarioDigest: sd,
              inputDigest: id,
              checkpointEvery: ce,
              checkpointTicks: ct,
              skipMultiRunEquivalence: skipEq,
              equivalence: eq,
              systems: sys,
            });
          }
          // Legacy host: public entry rejects options — call with zero DI only.
          return host.runBrowserLabScenario(can);
        },
        {
          canonical,
          scenarioDigest,
          inputDigest,
          checkpointEvery,
          checkpointTicks,
          skipMultiRunEquivalence,
          // Only internal chromium path may forward these (still nonPromoting overall).
          equivalence: options.equivalence,
          systems: options.systems,
        },
      );

      if (!result) {
        return {
          ok: false,
          status: 'infra',
          error: 'chromium scenario returned no result',
          scenarioDigest,
          inputDigest,
          browserLaunches: launchCount,
          durationMs: Date.now() - startedAt,
        };
      }

      // Host-level reject (unsupported/infra) — no comparable series/oracle.
      if (
        result.status === 'unsupported'
        || result.status === 'infra'
        || result.status === 'invalid-config'
      ) {
        return {
          ok: false,
          status: result.status,
          error: result.error || 'chromium scenario failed',
          stack: result.stack,
          oracle: result.oracle || null,
          scenarioDigest: result.scenarioDigest ?? scenarioDigest,
          inputDigest: result.inputDigest ?? inputDigest,
          browserLaunches: launchCount,
          durationMs: Date.now() - startedAt,
        };
      }

      // Hash surfaces on Node with the same digest as buildDeterministicCoveredCheckpoint.
      // Still hash when oracle fails so differentialReplay can report arm-oracle-fail with series.
      const series = (result.series || []).map((point) => ({
        tick: point.tick | 0,
        surface: point.surface,
        hash: hashDeterministicSurface(point.surface),
      }));
      const finalHash = result.finalSurface
        ? hashDeterministicSurface(result.finalSurface)
        : (series.length ? series[series.length - 1].hash : null);

      // FIX 7: ok mirrors Chromium oracle (evaluateOracles in browserScenarioHost), not host-only success.
      const oracle = result.oracle || null;
      const oracleOk = oracle ? !!oracle.ok : false;

      return {
        ok: oracleOk,
        status: oracleOk ? 'pass' : 'fail',
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
        oracle,
        exactWithin: { crossRuntime: false },
        browserLaunches: launchCount,
        durationMs: Date.now() - startedAt,
        error: oracleOk ? undefined : (result.error || 'chromium oracle failed'),
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
      error: `${err && err.message ? err.message : String(err)}${formatPageDiagnostics(pageDiagnostics)}`,
      scenarioDigest,
      inputDigest,
      browserLaunches: launchCount,
      durationMs: Date.now() - startedAt,
      timedOut,
    };
  }
}

function pushDiagnostic(list, value) {
  if (list.length < 12) list.push(String(value).slice(0, 2_000));
}

function formatPageDiagnostics(diagnostics) {
  const parts = [];
  if (diagnostics.pageErrors.length > 0) parts.push(`pageerror=${JSON.stringify(diagnostics.pageErrors)}`);
  if (diagnostics.consoleErrors.length > 0) parts.push(`console=${JSON.stringify(diagnostics.consoleErrors)}`);
  if (diagnostics.requestFailures.length > 0) parts.push(`requestfailed=${JSON.stringify(diagnostics.requestFailures)}`);
  return parts.length > 0 ? `; browser diagnostics: ${parts.join('; ')}` : '';
}

/**
 * Run the same Chromium scenario twice and compare series hashes (within-runtime determinism).
 * Uses the internal non-certifying path (parent-style check, not a public certifying entry).
 */
export async function repeatChromiumLabScenario(canonical, options = {}) {
  const a = await runChromiumLabScenarioInternal(canonical, options);
  if (!a.ok) return { ok: false, status: a.status, error: a.error, runs: [a], nonPromoting: true };
  const b = await runChromiumLabScenarioInternal(canonical, options);
  if (!b.ok) return { ok: false, status: b.status, error: b.error, runs: [a, b], nonPromoting: true };

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
    nonPromoting: true,
    certifying: false,
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
      if (await probeServer(baseUrl)) return { child, baseUrl, port };
    } catch (_) { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  try { await killProcessTree(child.pid); } catch (_) { /* ignore */ }
  throw new Error(`lab server failed to start: ${stderr.slice(-1000)}`);
}

function probeServer(baseUrl) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const request = httpGet(baseUrl, { timeout: 1_000 }, (response) => {
      const ok = response.statusCode >= 200 && response.statusCode < 400;
      response.resume();
      response.once('end', () => finish(ok));
      response.once('error', () => finish(false));
    });
    request.once('timeout', () => {
      request.destroy();
      finish(false);
    });
    request.once('error', () => finish(false));
  });
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
