#!/usr/bin/env node

// A bounded native combat cadence probe.  It walks the public Crucible route, measures the
// first three live rounds without installing the player-truth reader, and writes only cadence
// summaries.  This closes the gap between the early-combat profile and the sustained wave-2/3
// route without adding a second game path or changing simulation state.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import {
  awaitElectronInitialCanonicalLoad,
  cleanupIsolatedElectronProfile,
  launchIsolatedElectronApplication,
} from './lib/releaseSoakProbe.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';
import { installCspSafePlaywrightPolling, installFrameKeepalive } from './lib/playwrightCspPolling.mjs';
import { installGameCadenceProbe, summarizeGameCadence } from './lib/gameCadenceProbe.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  armoryLaunchWord,
  bootToMenu,
  clickText,
  crucibleToArmory,
  readLoadError,
  waitForPreparationLaunch,
  waitUntilFlight,
} from './player-truth/routes.mjs';
import { fightBeat } from './player-truth/driver.mjs';
import { captureHostPowerState } from './lib/performancePowerState.mjs';
import {
  computeSourceSetDigest,
  digestSourcePaths,
  listSrcJsSourcePaths,
} from './lib/validationFingerprint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadSourceOverlayManifest } = createRequire(import.meta.url)('./lib/gameServer.cjs');
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, '.devshots', 'combat-cadence-electron');
const DEFAULT_SEED = 4242;
const DEFAULT_ROUND_MS = 20_000;
const MAX_ROUNDS = 3;
const ROUND_FINISH_TIMEOUT_MS = 180_000;

function usage() {
  return [
    'Usage: node scripts/probe-combat-cadence-electron.mjs [options]',
    '',
    '  --mode=swarm|gauntlet       Public Crucible ruleset (default: swarm)',
    '  --arena=NAME                Public arena label (default: door selection)',
    '  --seed=N                   Public Crucible seed (default: 4242)',
    '  --rounds=1..3              Number of public rounds to measure (default: 3)',
    '  --round-ms=N               Cadence window per round (default: 20000)',
    '  --profile-round=1..3       Optional main CDP + worker-cost diagnostic for one round',
    '  --out=DIR                  Ignored output directory',
    '  --task-id=NAME             Isolated Electron profile label',
    '  --baseline-source=PATH     Existing validated .devshots source overlay manifest',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    mode: 'swarm', arena: null, seed: DEFAULT_SEED, rounds: MAX_ROUNDS, roundMs: DEFAULT_ROUND_MS,
    profileRound: null,
    out: null, taskId: 'combat-cadence-electron', baselineSource: null, help: false,
  };
  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') { args.help = true; continue; }
    const match = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!match) throw new Error(`unknown argument: ${raw}`);
    const [, key, value] = match;
    if (key === 'mode') args.mode = String(value || '');
    else if (key === 'arena') args.arena = String(value || '') || null;
    else if (key === 'seed') args.seed = Number(value);
    else if (key === 'rounds') args.rounds = Number(value);
    else if (key === 'round-ms') args.roundMs = Number(value);
    else if (key === 'profile-round') args.profileRound = Number(value);
    else if (key === 'out') args.out = String(value || '') || null;
    else if (key === 'task-id') args.taskId = String(value || '') || args.taskId;
    else if (key === 'baseline-source') args.baselineSource = String(value || '') || null;
    else throw new Error(`unknown argument: --${key}`);
  }
  if (!['swarm', 'gauntlet'].includes(args.mode)) throw new Error('--mode must be swarm or gauntlet');
  if (!Number.isSafeInteger(args.seed) || args.seed <= 0 || args.seed > 0xffffffff) {
    throw new Error('--seed must be a positive safe integer <= 0xffffffff');
  }
  if (!Number.isSafeInteger(args.rounds) || args.rounds < 1 || args.rounds > MAX_ROUNDS) {
    throw new Error(`--rounds must be an integer in 1..${MAX_ROUNDS}`);
  }
  if (!Number.isSafeInteger(args.roundMs) || args.roundMs < 1_000 || args.roundMs > 120_000) {
    throw new Error('--round-ms must be an integer in 1000..120000');
  }
  if (args.profileRound != null
    && (!Number.isSafeInteger(args.profileRound) || args.profileRound < 1 || args.profileRound > MAX_ROUNDS)) {
    throw new Error(`--profile-round must be an integer in 1..${MAX_ROUNDS}`);
  }
  if (!Number.isSafeInteger(args.taskId.length) || args.taskId.length === 0) {
    throw new Error('--task-id must not be empty');
  }
  return args;
}

function safeTaskId(value) {
  return String(value || 'combat-cadence-electron')
    .replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    || 'combat-cadence-electron';
}

function runDirectory(outputRoot, taskId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(outputRoot, `${safeTaskId(taskId)}-${stamp}-${process.pid}`);
}

function resolveBaselineManifest(value) {
  if (!value) return null;
  const resolved = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, resolved).replace(/\\/g, '/');
  if (!relative || relative.startsWith('../') || !relative.startsWith('.devshots/')) {
    throw new Error('--baseline-source must point to an ignored manifest under .devshots/');
  }
  if (!existsSync(resolved)) throw new Error(`baseline source manifest does not exist: ${relative}`);
  return { resolved, relative };
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Digest the source bytes the isolated server will actually serve.  The current tree is the
 * default source set, while a historical run replaces only the validated overlay entries and
 * keeps every other runtime file canonical.  This deliberately excludes docs, test outputs,
 * assets, and this probe itself so the receipt binds the game runtime rather than the harness.
 */
async function digestServedRuntimeSource(baseline) {
  const runtimePaths = [
    'index.html',
    ...await listSrcJsSourcePaths(ROOT),
    'scripts/lib/simWorkerHost.mjs',
    'scripts/lib/simReadModel.mjs',
  ];
  if (!baseline) {
    return {
      digest: await digestSourcePaths(ROOT, runtimePaths),
      pathCount: runtimePaths.length,
    };
  }
  const overlay = loadSourceOverlayManifest(baseline.resolved);
  const sourceTexts = {};
  for (const relativePath of runtimePaths) {
    const entry = overlay.entries.get(relativePath);
    sourceTexts[relativePath] = entry
      ? entry.body.toString('utf8')
      : await readFile(path.join(ROOT, relativePath), 'utf8');
  }
  return {
    // The overlay's per-file and aggregate hashes were validated by the shared server loader;
    // this digest binds the merged bytes (pinned historical entries + canonical current files).
    digest: computeSourceSetDigest(sourceTexts),
    pathCount: runtimePaths.length,
    overlay: {
      sourceCommit: overlay.identity.sourceCommit,
      sourceOverlayDigest: overlay.identity.sourceOverlayDigest,
      fileCount: overlay.identity.fileCount,
      totalBytes: overlay.identity.totalBytes,
    },
  };
}

function errorRecord(error) {
  if (!error) return null;
  return {
    name: String(error.name || 'Error'),
    message: String(error.message || error).slice(0, 2_000),
    stack: error.stack ? String(error.stack).slice(0, 6_000) : null,
  };
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

/**
 * Keep the combat receipt bounded while retaining the counters that explain a
 * worker/main threat-count disagreement.  The worker probe has gained fields
 * over time, so accept either a nested run object or the same counters at the
 * probe root without making the diagnostic seam part of the game contract.
 */
function runProgressSnapshot(run, fallback = null) {
  const nested = run && typeof run === 'object' ? run : null;
  const root = fallback && typeof fallback === 'object' ? fallback : null;
  const value = (name) => nested?.[name] ?? root?.[name];
  return {
    phase: nested?.phase ?? root?.phase ?? null,
    wave: finiteOrNull(value('wave')),
    threatBudget: finiteOrNull(value('threatBudget')),
    spawnedThreat: finiteOrNull(value('spawnedThreat')),
    resolvedThreat: finiteOrNull(value('resolvedThreat')),
    activeThreats: finiteOrNull(value('activeThreats')),
    aliveThreats: finiteOrNull(value('aliveThreats')),
    kills: finiteOrNull(value('kills')),
    playerKills: finiteOrNull(value('playerKills')),
    deaths: finiteOrNull(value('deaths')),
    remainingThreat: finiteOrNull(value('remainingThreat')),
  };
}

async function readRoundState(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const run = state?.run;
    const screenManager = window.SF?.ctx?.screenManager;
    return {
      mode: state?.mode ?? null,
      phase: run?.phase ?? null,
      kind: run?.kind ?? null,
      wave: Number.isFinite(run?.wave) ? run.wave : null,
      sim: Number.isFinite(state?.simTime) ? state.simTime : null,
      tick: Number.isFinite(state?.tick) ? state.tick : null,
      timeScale: Number.isFinite(state?.timeScale) ? state.timeScale : null,
      run: run ? {
        phase: run.phase ?? null,
        wave: Number.isFinite(run.wave) ? run.wave : null,
        threatBudget: Number.isFinite(run.threatBudget) ? run.threatBudget : null,
        spawnedThreat: Number.isFinite(run.spawnedThreat) ? run.spawnedThreat : null,
        resolvedThreat: Number.isFinite(run.resolvedThreat) ? run.resolvedThreat : null,
        activeThreats: Number.isFinite(run.activeThreats) ? run.activeThreats : null,
        aliveThreats: Number.isFinite(run.aliveThreats) ? run.aliveThreats : null,
        kills: Number.isFinite(run.kills) ? run.kills : null,
        playerKills: Number.isFinite(run.playerKills) ? run.playerKills : null,
        deaths: Number.isFinite(run.deaths) ? run.deaths : null,
        remainingThreat: Number.isFinite(run.remainingThreat) ? run.remainingThreat : null,
      } : null,
      top: typeof screenManager?.top === 'function' ? screenManager.top() : null,
    };
  }).catch(() => ({
    mode: null, phase: null, kind: null, wave: null, sim: null, tick: null, timeScale: null,
    run: null, top: null,
  }));
}

// This RPC is deliberately sampled outside installGameCadenceProbe/stop.  It
// is a bounded causal receipt, not a per-frame observer and cannot affect the
// cadence numbers being measured.
async function readWorkerRunState(page) {
  try {
    const response = await page.evaluate(async () => {
      const { laneRpc } = await import('/src/core/simLaneCommands.js');
      const reply = await laneRpc('probeState', {});
      if (!reply || reply.ok !== true) {
        return { ok: false, error: reply?.error || 'probeState RPC failed' };
      }
      const result = reply.result && typeof reply.result === 'object' ? reply.result : {};
      const run = result.run && typeof result.run === 'object'
        ? result.run
        : (result.runState && typeof result.runState === 'object' ? result.runState : null);
      const finite = (value) => Number.isFinite(value) ? value : null;
      const value = (name) => run?.[name] ?? result[name];
      return {
        ok: true,
        tick: finite(result.tick),
        simTime: finite(result.simTime),
        mode: result.mode ?? null,
        phase: run?.phase ?? result.phase ?? null,
        wave: finite(value('wave')),
        threatBudget: finite(value('threatBudget')),
        spawnedThreat: finite(value('spawnedThreat')),
        resolvedThreat: finite(value('resolvedThreat')),
        activeThreats: finite(value('activeThreats')),
        aliveThreats: finite(value('aliveThreats')),
        kills: finite(value('kills')),
        playerKills: finite(value('playerKills')),
        deaths: finite(value('deaths')),
        remainingThreat: finite(value('remainingThreat')),
      };
    });
    return response?.ok === true ? response : {
      ok: false,
      error: response?.error || 'probeState returned no result',
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 500) };
  }
}

async function waitForActiveRound(page, wave, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const quote = await readLoadError(page);
    if (quote) throw new Error(`public combat route load failure: ${quote}`);
    last = await readRoundState(page);
    if (last.mode === 'flight' && last.phase === 'active' && (wave == null || last.wave === wave)) return last;
    await page.waitForTimeout(Math.min(250, Math.max(1, deadline - Date.now())));
  }
  throw new Error(`round ${wave ?? '?'} did not become active before timeout: ${JSON.stringify(last)}`);
}

/**
 * Do not let the cadence baseline include the public route's initial mirror catch-up.  The
 * renderer already exposes the completed-world submission counter used by the runtime witness;
 * wait for that counter and a positive main-thread tick before measureRound installs its probe.
 * This is a readiness gate only: it does not read or write private simulation state.
 */
async function waitForFirstFlightWorldSubmission(page, timeoutMs) {
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const tick = Number(state?.tick);
    const submissions = Number(state?.render?.worldSubmittedFrames);
    return state?.mode === 'flight'
      && Number.isFinite(tick) && tick > 0
      && Number.isFinite(submissions) && submissions > 0;
  }, null, { timeout: timeoutMs });
}

async function waitForNextRoundControl(page, expectedWave, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const quote = await readLoadError(page);
    if (quote) throw new Error(`public combat route load failure: ${quote}`);
    last = await readRoundState(page);
    if (last.phase === 'active' && last.wave >= expectedWave) return { alreadyActive: true, state: last };
    if (last.phase === 'ended' || last.phase === 'victory') {
      throw new Error(`Crucible ended before round ${expectedWave}: ${JSON.stringify(last)}`);
    }
    const word = ['draft', 'cleanup', 'refit'].includes(last.phase)
      ? await armoryLaunchWord(page).catch(() => null) : null;
    if (word) return { alreadyActive: false, word, state: last };
    await page.waitForTimeout(Math.min(250, Math.max(1, deadline - Date.now())));
  }
  throw new Error(`next-round control did not appear for round ${expectedWave}: ${JSON.stringify(last)}`);
}

function publicRoundSummary({
  wave, requestedMs, startedAt, endedAt, start, end, workerStart, workerEnd, record,
  error = null, diagnostic = null,
}) {
  const summary = record ? summarizeGameCadence(record) : null;
  return {
    wave,
    requestedWindowMs: requestedMs,
    wallWindowMs: summary?.wallMs ?? Math.max(0, endedAt - startedAt),
    stateAtStart: start,
    stateAtEnd: end,
    runProgress: {
      main: {
        start: runProgressSnapshot(start?.run),
        end: runProgressSnapshot(end?.run),
      },
      worker: {
        start: workerStart || { ok: false, error: 'worker probe unavailable' },
        end: workerEnd || { ok: false, error: 'worker probe unavailable' },
      },
    },
    drawFps: summary?.browserFps ?? null,
    successfulSubmitFps: summary?.worldSubmitFps ?? null,
    freshSnapshotFps: summary?.worldMotionFps ?? null,
    simWallRatio: summary?.simWallRatio ?? null,
    callbackGapsMs: summary?.callbackGaps ?? null,
    freshSnapshotGapsMs: summary?.motionSubmissionGaps ?? null,
    maxSimStaleMs: summary?.maxSimStaleMs ?? null,
    maxWorldStaleMs: summary?.maxWorldStaleMs ?? null,
    healthyCallbacksFrozenWorld: summary?.healthyCallbacksFrozenWorld ?? null,
    healthyCallbacksFrozenSimulation: summary?.healthyCallbacksFrozenSimulation ?? null,
    submissionObserved: summary?.submissionObserved ?? false,
    evidenceLayer: summary?.evidenceLayer || 'cadence sampler unavailable',
    diagnostic,
    error: error ? errorRecord(error) : null,
  };
}

async function measureRound(page, wave, requestedMs, log, { diagnostic = null } = {}) {
  const start = await readRoundState(page);
  const workerStart = await readWorkerRunState(page);
  const startedAt = Date.now();
  let beat = 0;
  let pilotError = null;
  let profileError = null;
  let profileStartedAt = null;
  let profileEndedAt = null;
  let profile = null;
  if (diagnostic?.cdp) {
    try {
      await diagnostic.cdp.send('Profiler.start');
      profileStartedAt = Date.now();
    } catch (error) {
      profileError = error;
    }
  }
  try {
    await page.evaluate(installGameCadenceProbe);
    while (Date.now() - startedAt < requestedMs) {
      const state = await readRoundState(page);
      if (state.phase !== 'active' || state.wave !== wave) break;
      try {
        await fightBeat(page, beat++);
      } catch (error) {
        pilotError = error;
        break;
      }
    }
  } catch (error) {
    pilotError ||= error;
  }
  // The stop call is the only cadence read. It restores drawPreparedFrame immediately and does
  // not retain any observer, screenshot, pixel census, or player-truth trace.
  if (diagnostic?.cdp && profileError == null) {
    try {
      const response = await diagnostic.cdp.send('Profiler.stop');
      profileEndedAt = Date.now();
      profile = response?.profile || null;
      if (profile && diagnostic.outputDir) {
        await writeFile(path.join(diagnostic.outputDir, `round-${wave}-main.cpuprofile`), `${JSON.stringify(profile)}\n`, 'utf8');
      }
    } catch (error) {
      profileError = error;
    }
  }
  let workerCost = null;
  let workerCostError = null;
  if (diagnostic?.workerCost) {
    try {
      workerCost = await page.evaluate(async () => {
        const { laneRpc } = await import('/src/core/simLaneCommands.js');
        return laneRpc('probePerformance', {});
      });
      if (diagnostic.outputDir) {
        await writeFile(path.join(diagnostic.outputDir, `round-${wave}-worker-cost.json`), `${JSON.stringify(workerCost, null, 1)}\n`, 'utf8');
      }
    } catch (error) {
      workerCostError = error;
    }
  }
  const record = await page.evaluate(() => window.__SF_GAME_CADENCE__?.stop?.() || null).catch(() => null);
  const end = await readRoundState(page);
  const workerEnd = await readWorkerRunState(page);
  const endedAt = Date.now();
  const diagnosticResult = diagnostic ? {
    kind: 'opt-in-main-cpu-and-worker-cost',
    requested: true,
    profileFile: profile ? `round-${wave}-main.cpuprofile` : null,
    workerCostFile: workerCost ? `round-${wave}-worker-cost.json` : null,
    profileWindowMs: profileStartedAt != null && profileEndedAt != null ? profileEndedAt - profileStartedAt : null,
    profileError: profileError ? errorRecord(profileError) : null,
    workerCostError: workerCostError ? errorRecord(workerCostError) : null,
    workerCost,
  } : null;
  const result = publicRoundSummary({
    wave, requestedMs, startedAt, endedAt, start, end, workerStart, workerEnd, record, error: pilotError,
    diagnostic: diagnosticResult,
  });
  log(`round ${wave}: draw=${result.drawFps == null ? 'n/a' : result.drawFps.toFixed(2)} fps `
    + `fresh=${result.freshSnapshotFps == null ? 'n/a' : result.freshSnapshotFps.toFixed(2)} fps `
    + `sim/wall=${result.simWallRatio == null ? 'n/a' : result.simWallRatio.toFixed(3)} `
    + `window=${Math.round(result.wallWindowMs)}ms`);
  return result;
}

async function finishRound(page, wave, log) {
  const deadline = Date.now() + ROUND_FINISH_TIMEOUT_MS;
  let beat = 0;
  let last = await readRoundState(page);
  while (Date.now() < deadline) {
    if (last.phase !== 'active' || last.wave !== wave) return last;
    try {
      await fightBeat(page, beat++);
    } catch (error) {
      throw new Error(`public fight pilot failed while finishing round ${wave}: ${error.message || error}`);
    }
    last = await readRoundState(page);
  }
  log(`round ${wave} finish state: ${JSON.stringify(last)}`);
  throw new Error(`round ${wave} did not resolve within ${ROUND_FINISH_TIMEOUT_MS}ms`);
}

async function readServedSourceIdentity(page, baseline) {
  const servedOverlay = baseline
    ? await page.evaluate(async () => {
      const response = await fetch('/__source_overlay_identity', { cache: 'no-store' });
      if (!response.ok) throw new Error(`source overlay identity endpoint returned ${response.status}`);
      return response.json();
    })
    : null;
  const compactOverlay = servedOverlay ? {
    sourceOverlayDigest: servedOverlay.sourceOverlayDigest || null,
    fileCount: Number.isSafeInteger(servedOverlay.fileCount) ? servedOverlay.fileCount : null,
    totalBytes: Number.isSafeInteger(servedOverlay.totalBytes) ? servedOverlay.totalBytes : null,
  } : null;
  return {
    commit: gitHead(),
    baselineManifest: baseline?.relative || null,
    servedOverlay: compactOverlay,
  };
}

function sourceLogIdentity(identity) {
  return {
    commit: identity?.commit || null,
    baselineManifest: identity?.baselineManifest || null,
    sourceDigest: identity?.sourceDigest || null,
    servedOverlay: identity?.servedOverlay ? {
      sourceOverlayDigest: identity.servedOverlay.sourceOverlayDigest || null,
      fileCount: identity.servedOverlay.fileCount ?? null,
      totalBytes: identity.servedOverlay.totalBytes ?? null,
    } : null,
  };
}

export async function runCombatCadenceProbe({
  args = parseArgs(),
  outputDir = null,
  log = console.log,
} = {}) {
  const baseline = resolveBaselineManifest(args.baselineSource);
  const resolvedOutputDir = path.resolve(outputDir || (args.out ? path.resolve(ROOT, args.out) : runDirectory(DEFAULT_OUTPUT_ROOT, args.taskId)));
  await mkdir(resolvedOutputDir, { recursive: true });
  const logLines = [];
  const writeLog = (message) => {
    const line = `${new Date().toISOString()} ${message}`;
    logLines.push(line);
    log(`[combat-cadence-electron] ${message}`);
  };
  const rounds = [];
  const route = { mode: args.mode, ruleset: args.mode === 'gauntlet' ? 'scored' : 'swarm', arena: args.arena, seed: args.seed };
  const source = {
    requested: baseline?.relative || null,
    identity: {
      commit: gitHead(),
      baselineManifest: baseline?.relative || null,
      servedOverlay: null,
      sourceDigest: null,
      sourceDigestAfter: null,
      sourceStable: null,
      sourcePathCount: null,
    },
  };
  let electronApp = null;
  let childProcess = null;
  let page = null;
  let isolatedLaunch = null;
  let processMonitor = null;
  let pageIssueTracker = null;
  let canonicalUrlTracker = null;
  let cdp = null;
  let rootUrl = null;
  let cleanupReport = null;
  let profileCleanup = false;
  let powerStateStart = null;
  let powerStateEnd = null;
  let primaryError = null;
  try {
    const sourceAtStart = await digestServedRuntimeSource(baseline);
    source.identity.sourceDigest = sourceAtStart.digest;
    source.identity.sourcePathCount = sourceAtStart.pathCount;
    source.identity.servedOverlay = sourceAtStart.overlay || null;
    const { _electron: electron } = await loadPlaywright();
    const baseEnv = {
      ...process.env,
      SPACEFACE_PLAYER_STORE_DIR: '',
      ...(baseline ? { SPACEFACE_BASELINE_SOURCE_MANIFEST: baseline.resolved } : {}),
    };
    isolatedLaunch = createIsolatedElectronLaunch({
      root: ROOT, taskId: safeTaskId(args.taskId), timeout: 240_000, baseEnv,
    });
    electronApp = await launchIsolatedElectronApplication(electron, isolatedLaunch);
    childProcess = electronApp.process();
    processMonitor = createElectronProcessMonitor({ electronApp, childProcess });
    pageIssueTracker = createStrictElectronApplicationIssueTracker(electronApp, {
      playerStoreMounted: false, allowCancelledMedia: true,
    });
    page = await electronApp.firstWindow({ timeout: 90_000 });
    powerStateStart = await captureHostPowerState(page);
    writeLog(`host power start ${JSON.stringify(powerStateStart)}`);
    await pageIssueTracker.bindAndBackfillPage(page);
    installCspSafePlaywrightPolling(page);
    await installFrameKeepalive(page);
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
      bootstrapTimeoutMs: 10_000, pollIntervalMs: 75, allowAnyLoopbackPort: true,
    });
    rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(10_000));
    await awaitElectronInitialCanonicalLoad(page, electronApp, rootUrl);
    source.identity = {
      ...source.identity,
      ...(await readServedSourceIdentity(page, baseline)),
      sourceDigest: source.identity.sourceDigest,
      sourceDigestAfter: source.identity.sourceDigestAfter,
      sourceStable: source.identity.sourceStable,
      sourcePathCount: source.identity.sourcePathCount,
    };
    writeLog(`canonical root ${rootUrl}; source ${JSON.stringify(sourceLogIdentity(source.identity))}`);
    if (args.profileRound != null) {
      cdp = await page.context().newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
      writeLog(`opt-in diagnostic armed for public round ${args.profileRound} (500us main CDP samples + worker-cost RPC)`);
    }

    await bootToMenu(page, rootUrl, (name, ok, detail) => writeLog(`route ${name}: ${ok} ${detail || ''}`));
    await crucibleToArmory(page, {
      ruleset: route.ruleset, arena: args.arena, seed: args.seed,
    }, (name, ok, detail) => writeLog(`route ${name}: ${ok} ${detail || ''}`));

    if (args.mode === 'swarm') {
      await waitForPreparationLaunch(page, { timeoutMs: 300_000 });
      const firstWord = await armoryLaunchWord(page);
      if (!firstWord) throw new Error('public Crucible preparation had no launch control');
      await clickText(page, firstWord, { timeout: 30_000 });
    }
    await waitUntilFlight(page, { timeout: 300_000, active: true });
    // Reuse the public authored-flight readiness contract after the route says flight is active.
    // The extra completed-world gate below keeps the first cadence sample out of cold startup.
    await page.waitForFunction(flightReadyInPage, null, { timeout: 300_000 });
    await waitForFirstFlightWorldSubmission(page, 300_000);
    await waitForActiveRound(page, 1, 120_000);

    for (let wave = 1; wave <= args.rounds; wave++) {
      const measured = await measureRound(page, wave, args.roundMs, writeLog, {
        diagnostic: args.profileRound === wave
          ? { cdp, workerCost: true, outputDir: resolvedOutputDir }
          : null,
      });
      rounds.push(measured);
      const afterWindow = await readRoundState(page);
      if (wave >= args.rounds) break;
      const settled = afterWindow.phase === 'active' && afterWindow.wave > wave
        ? afterWindow : await finishRound(page, wave, writeLog);
      if (settled.phase === 'active' && settled.wave >= wave + 1) continue;
      const next = await waitForNextRoundControl(page, wave + 1, 180_000);
      if (!next.alreadyActive) await clickText(page, next.word, { timeout: 30_000 });
      await waitForActiveRound(page, wave + 1, 120_000);
    }
  } catch (error) {
    primaryError = error;
    writeLog(`FAIL ${error.message || error}`);
  } finally {
    if (page) {
      powerStateEnd = await captureHostPowerState(page);
      writeLog(`host power end ${JSON.stringify(powerStateEnd)}`);
    }
    try {
      const sourceAtEnd = await digestServedRuntimeSource(baseline);
      source.identity.sourceDigestAfter = sourceAtEnd.digest;
      source.identity.sourceStable = source.identity.sourceDigest === sourceAtEnd.digest;
      source.identity.sourcePathCountAfter = sourceAtEnd.pathCount;
      if (source.identity.sourceStable !== true) {
        writeLog(`source changed during capture; diagnostic only (${source.identity.sourceDigest || 'unknown'} -> ${sourceAtEnd.digest})`);
      }
    } catch (error) {
      source.identity.sourceDigestAfter = null;
      source.identity.sourceStable = false;
      source.identity.sourceDigestAfterError = errorRecord(error);
      writeLog(`source digest after capture failed: ${error.message || error}`);
    }
    try { await cdp?.detach?.(); } catch (_) { /* best effort before app close */ }
    try {
      if (electronApp) {
        cleanupReport = await closeOwnedElectronRuntime({
          page, electronApp, childProcess, canonicalUrlTracker, processMonitor, rootUrl,
        });
      }
    } catch (error) {
      primaryError ||= error;
      writeLog(`cleanup FAIL ${error.message || error}`);
    }
    if (isolatedLaunch && cleanupReport) {
      try { profileCleanup = cleanupIsolatedElectronProfile(isolatedLaunch, cleanupReport); }
      catch (error) { primaryError ||= error; writeLog(`profile cleanup FAIL ${error.message || error}`); }
    }
    const issues = pageIssueTracker?.stop?.() || [];
    const receipt = {
      schema: 'spaceface.combatCadenceElectron.v1',
      status: primaryError ? 'fail' : 'pass',
      generatedAt: new Date().toISOString(),
      route,
      requestedWindowMs: args.roundMs,
      diagnostics: {
        profileRound: args.profileRound,
        profileLabel: args.profileRound == null ? null : 'opt-in-main-cpu-and-worker-cost',
      },
      rounds,
      source,
      powerState: { start: powerStateStart, end: powerStateEnd },
      runtime: { rootUrl, pid: childProcess?.pid ?? null, isolated: true },
      issues: issues.slice(-32).map((issue) => ({ source: issue.source || null, level: issue.level || null, text: String(issue.text || '').slice(0, 500) })),
      cleanup: { report: cleanupReport, profileCleanup },
      error: errorRecord(primaryError),
    };
    await writeFile(path.join(resolvedOutputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 1)}\n`, 'utf8');
    await writeFile(path.join(resolvedOutputDir, 'run.log'), `${logLines.join('\n')}\n`, 'utf8');
    return { ...receipt, outputDir: resolvedOutputDir };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
  } else {
    const result = await runCombatCadenceProbe({ args });
    console.log(`[combat-cadence-electron] ${result.status.toUpperCase()} receipt: ${path.relative(ROOT, path.join(result.outputDir, 'receipt.json')).replace(/\\/g, '/')}`);
    if (result.status !== 'pass') process.exitCode = 1;
  }
}
