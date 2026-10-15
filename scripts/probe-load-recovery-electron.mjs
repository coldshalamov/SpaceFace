// Focused public save/load recovery probe.
//
// This deliberately stops at authored flight and exercises only the public keyboard save/load
// path. It reuses the release soak's isolated Electron bootstrap, but does not run its dock,
// market, navigation, or long recovery warmups. A failed authored-visual gate is captured at the
// first known failure (or bounded timeout) so a broken load cannot spend another 210 seconds in a
// wait that can no longer change the diagnosis.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeOwnedElectronRuntime } from './lib/alphaLiveBaselineElectronContracts.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';
import {
  cleanupIsolatedElectronProfile,
  launchElectron,
} from './lib/releaseSoakProbe.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, '.devshots', 'load-recovery-electron');
const DEFAULT_LOAD_TIMEOUT_MS = 60_000;
const DEFAULT_SAVE_TIMEOUT_MS = 20_000;

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  return raw == null ? fallback : raw.slice(prefix.length);
}

function boundedInteger(value, fallback, { min, max }) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function boundedText(value, maximum = 1000) {
  const text = String(value ?? '');
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}

function boundedJson(value, depth = 0) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return boundedText(value, 1200);
  if (depth >= 2) return `[${typeof value}]`;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => boundedJson(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 16).map(([key, item]) => [
      boundedText(key, 120),
      boundedJson(item, depth + 1),
    ]));
  }
  return boundedText(value, 1200);
}

function errorRecord(error) {
  return {
    name: String(error?.name || 'Error'),
    message: boundedText(error?.message || error),
    stack: boundedText(error?.stack || '', 2000),
  };
}

function isoNow() {
  return new Date().toISOString();
}

async function installLoadObservers(page) {
  await page.evaluate(() => {
    if (window.__SF_LOAD_RECOVERY__) return;
    const record = {
      saves: 0,
      loads: 0,
      saveErrors: [],
      loadErrors: [],
    };
    window.__SF_LOAD_RECOVERY__ = record;
    const bus = window.SF?.bus;
    if (!bus || typeof bus.on !== 'function') {
      record.loadErrors.push({ reason: 'SF.bus observer seam unavailable' });
      return;
    }
    bus.on('save:completed', (payload = {}) => {
      if (payload.autosave === true) return;
      record.saves += 1;
    });
    bus.on('save:error', (payload = {}) => {
      if (record.saveErrors.length >= 16) return;
      record.saveErrors.push({
        slot: payload.slot || null,
        reason: payload.reason || payload.failure || 'unknown',
      });
    });
    bus.on('save:loaded', (payload = {}) => {
      record.loads += 1;
      record.lastLoadedSlot = payload.slot || null;
    });
  });
}

function attachConsoleErrorArgs(page) {
  const consoleErrors = [];
  const onConsole = async (message) => {
    if (message.type() !== 'error' || consoleErrors.length >= 32) return;
    const args = [];
    for (const handle of message.args().slice(0, 8)) {
      try {
        args.push(boundedJson(await handle.jsonValue()));
      } catch {
        args.push('[unserializable-console-arg]');
      }
    }
    consoleErrors.push({
      at: isoNow(),
      text: boundedText(message.text(), 1600),
      args,
    });
  };
  page.on('console', onConsole);
  return { consoleErrors, detach: () => page.off('console', onConsole) };
}

async function readLoadStatus(page, baselineLoadCount = 0) {
  return page.evaluate((expectedLoads) => {
    const state = window.SF?.state;
    const events = window.__SF_LOAD_RECOVERY__ || {};
    const requests = typeof window.SF?.timeEffects?.describeRequests === 'function'
      ? window.SF.timeEffects.describeRequests()
      : {};
    const bodyText = String(document.body?.innerText || '');
    const toastFailure = /Loaded game assets failed to load|The error was logged|authored visual/i.test(bodyText);
    const runtimeFailure = state?.mode === 'menu' && !!requests?.['runtime:start-failed'];
    const loaded = state?.mode === 'flight' && Number(events.loads || 0) > expectedLoads;
    return {
      loaded,
      knownFailure: toastFailure || runtimeFailure,
      mode: state?.mode || null,
      tick: Number(state?.tick || 0),
      simTime: Number(state?.simTime || 0),
      timeScale: Number(state?.timeScale ?? state?.clock?.timeScale ?? 0),
      loadingProgress: Number(state?.loadingProgress ?? NaN),
      loadCount: Number(events.loads || 0),
      saveCount: Number(events.saves || 0),
      saveErrors: Array.isArray(events.saveErrors) ? events.saveErrors.slice(0, 16) : [],
      loadErrors: Array.isArray(events.loadErrors) ? events.loadErrors.slice(0, 16) : [],
      timeRequests: requests && typeof requests === 'object' ? Object.fromEntries(
        Object.entries(requests).slice(0, 16).map(([key, value]) => [key, value?.scale ?? value]),
      ) : {},
    };
  }, baselineLoadCount);
}

async function captureReadiness(page, reason) {
  const snapshot = await page.evaluate((captureReason) => {
    const state = window.SF?.state;
    let readiness = null;
    let readinessError = null;
    try {
      readiness = typeof window.SF?.authoredVisualReadiness === 'function'
        ? window.SF.authoredVisualReadiness()
        : null;
    } catch (error) {
      readinessError = String(error?.message || error);
    }
    const map = (value) => {
      if (value == null || typeof value !== 'object') return value;
      const out = {};
      for (const key of ['kind', 'role', 'id', 'type', 'defId', 'status', 'hook', 'promised']) {
        if (value[key] !== undefined) out[key] = value[key];
      }
      return out;
    };
    const list = (value) => Array.isArray(value) ? value.slice(0, 64).map(map) : value;
    return {
      capturedAt: new Date().toISOString(),
      reason: captureReason,
      mode: state?.mode || null,
      tick: Number(state?.tick || 0),
      simTime: Number(state?.simTime || 0),
      timeScale: Number(state?.timeScale ?? state?.clock?.timeScale ?? 0),
      loadingProgress: Number(state?.loadingProgress ?? NaN),
      readiness: readiness ? {
        ready: readiness.ready === true,
        pipelineReady: readiness.pipelineReady === true,
        flightReadyBlockers: list(readiness.flightReadyBlockers),
        openingAssets: list(readiness.openingAssets),
        openingPending: list(readiness.openingPending),
        openingPipelinePending: list(readiness.openingPipelinePending),
        openingGatePending: list(readiness.openingGatePending),
        openingGatePipelinePending: list(readiness.openingGatePipelinePending),
      } : null,
      readinessError,
    };
  }, reason);
  return snapshot;
}

async function waitForSave(page, baselineSaveCount, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await readLoadStatus(page, 0);
    if (status.saveErrors.length > 0) {
      throw new Error(`public quick-save failed: ${JSON.stringify(status.saveErrors)}`);
    }
    if (status.saveCount > baselineSaveCount && await page.evaluate(() => !!localStorage.getItem('sf.save.quick'))) {
      return status;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`public quick-save timed out after ${timeoutMs}ms`);
}

async function waitForLoad(page, baselineLoadCount, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;
  while (Date.now() < deadline) {
    lastStatus = await readLoadStatus(page, baselineLoadCount);
    if (lastStatus.loaded) return { outcome: 'flight', status: lastStatus };
    if (lastStatus.knownFailure) return { outcome: 'known-failure', status: lastStatus };
    await page.waitForTimeout(150);
  }
  return { outcome: 'timeout', status: lastStatus || await readLoadStatus(page, baselineLoadCount) };
}

async function startPublicNewGame(page, { flightTimeoutMs = 240_000 } = {}) {
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 90_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 15_000 });
  }
  await page.locator('[data-screen="mainMenu"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-screen="mainMenu"] button[data-action="newGame"]').click({ timeout: 30_000 });
  await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-screen="newGame"] button[data-action="launch"]').click({ timeout: 30_000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: flightTimeoutMs });
}

async function runCycles(page, { cycles, loadTimeoutMs, saveTimeoutMs, consoleErrors }) {
  await installLoadObservers(page);
  const records = [];
  let firstFailure = null;
  for (let index = 1; index <= cycles; index += 1) {
    const before = await readLoadStatus(page, 0);
    const record = { cycle: index, startedAt: isoNow(), before };
    await page.keyboard.press('F5');
    record.saved = await waitForSave(page, before.saveCount, saveTimeoutMs);
    // Public input creates a distinct post-save state so the load observes an actual restore.
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyW');
    const beforeLoad = await readLoadStatus(page, 0);
    await page.keyboard.press('F9');
    const loaded = await waitForLoad(page, beforeLoad.loadCount, loadTimeoutMs);
    record.load = loaded;
    record.finishedAt = isoNow();
    records.push(record);
    if (loaded.outcome !== 'flight') {
      const readiness = await captureReadiness(page, `${loaded.outcome}-cycle-${index}`);
      firstFailure = { cycle: index, outcome: loaded.outcome, status: loaded.status, readiness };
      // Console argument extraction runs in a Playwright event callback; give it one turn before
      // serializing the first-failure receipt, without adding another gameplay wait.
      await page.waitForTimeout(25);
      break;
    }
  }
  return { records, firstFailure, consoleErrors: consoleErrors.slice(0, 32) };
}

async function main() {
  const cycles = boundedInteger(readOption('cycles', '3'), 3, { min: 2, max: 3 });
  const loadTimeoutMs = boundedInteger(readOption('load-timeout-ms', String(DEFAULT_LOAD_TIMEOUT_MS)), DEFAULT_LOAD_TIMEOUT_MS, { min: 5_000, max: 240_000 });
  const saveTimeoutMs = boundedInteger(readOption('save-timeout-ms', String(DEFAULT_SAVE_TIMEOUT_MS)), DEFAULT_SAVE_TIMEOUT_MS, { min: 5_000, max: 60_000 });
  const taskId = `load-recovery-${Date.now()}`;
  const outputDir = path.resolve(readOption('output', path.join(DEFAULT_OUTPUT_ROOT, taskId)));
  await mkdir(outputDir, { recursive: true });

  const evidence = {
    schema: 'spaceface.loadRecoveryDiagnostic.v1',
    taskId,
    startedAt: isoNow(),
    cyclesRequested: cycles,
    loadTimeoutMs,
    saveTimeoutMs,
    route: 'public-new-game-flight-save-load',
    injectedState: false,
    privateWorldWrites: false,
    cycles: [],
    firstFailure: null,
    consoleErrors: [],
    routeError: null,
    cleanup: null,
  };

  let launched = null;
  let consoleTap = null;
  try {
    launched = await launchElectron(REPO_ROOT, () => {}, taskId);
    consoleTap = attachConsoleErrorArgs(launched.page);
    await startPublicNewGame(launched.page);
    const result = await runCycles(launched.page, {
      cycles,
      loadTimeoutMs,
      saveTimeoutMs,
      consoleErrors: consoleTap.consoleErrors,
    });
    evidence.cycles = result.records;
    evidence.firstFailure = result.firstFailure;
    evidence.consoleErrors = result.consoleErrors;
  } catch (error) {
    evidence.routeError = errorRecord(error);
    evidence.consoleErrors = consoleTap?.consoleErrors?.slice(0, 32) || [];
    if (launched?.page) {
      evidence.firstFailure ||= {
        cycle: evidence.cycles.length + 1,
        outcome: 'route-error',
        readiness: await captureReadiness(launched.page, 'route-error').catch((readError) => ({ error: errorRecord(readError) })),
      };
    }
  } finally {
    if (consoleTap) consoleTap.detach();
    if (launched) {
      const cleanupReport = await closeOwnedElectronRuntime(launched).catch((error) => ({
        pass: false,
        failures: [errorRecord(error)],
      }));
      evidence.cleanup = cleanupReport;
      cleanupIsolatedElectronProfile(launched.isolatedLaunch, cleanupReport);
    }
    evidence.finishedAt = isoNow();
    evidence.pass = !evidence.routeError && !evidence.firstFailure && evidence.cycles.length === cycles;
    await writeFile(path.join(outputDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }

  process.stdout.write(`${JSON.stringify({
    outputDir,
    pass: evidence.pass,
    cyclesCompleted: evidence.cycles.length,
    firstFailure: evidence.firstFailure,
    routeError: evidence.routeError,
  }, null, 2)}\n`);
  if (!evidence.pass) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(errorRecord(error))}\n`);
    process.exitCode = 1;
  });
}

