import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { PNG } from 'pngjs';

import { collectPageIssues, isIgnorableWebglValidation, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const outDir = join(ROOT, '.devshots');
const { chromium } = await loadPlaywright();

const requestedBaseUrl = process.env.SF_PROBE_URL || '';
let server = requestedBaseUrl ? await ensureServer(requestedBaseUrl) : await startFreshServer();
const baseUrl = requestedBaseUrl || server.baseUrl;
const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: 'desktop', width: 1280, height: 720, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
];
const results = [];
const MAX_VISUAL_PROBE_ATTEMPTS = 3;
const FLIGHT_START_TIMEOUT_MS = 70000;
const cleanRuns = readPositiveIntArg(['--clean-runs', '--runs'], 1);
const writeShots = !process.argv.includes('--no-write');
const strictWarnings = process.argv.includes('--strict-warnings');
const includeWarningDetails = strictWarnings || process.argv.includes('--include-warning-details');
const compactOutput = process.argv.includes('--compact-output') || cleanRuns > 1;

try {
  for (let runIndex = 1; runIndex <= cleanRuns; runIndex++) {
    for (const viewport of viewports) {
      logProgress(`run ${runIndex}/${cleanRuns} ${viewport.name}`);
      results.push(await runViewportProbeWithRetry(browser, viewport, runIndex));
    }
  }
} finally {
  await browser.close();
  if (server && server.kill) server.kill();
}

const ok = results.every((r) => r.ok);
console.log(JSON.stringify({
  ok,
  baseUrl,
  cleanRuns,
  strictWarnings,
  compactOutput,
  results: compactOutput ? results.map(compactProbeResult) : results,
}, null, 2));
if (!ok) process.exitCode = 1;

async function runViewportProbeWithRetry(browser, viewport, runIndex) {
  const attempts = [];
  let lastResult = null;
  for (let i = 0; i < MAX_VISUAL_PROBE_ATTEMPTS; i++) {
    let result;
    try {
      result = await runViewportProbe(browser, viewport, runIndex);
    } catch (err) {
      result = failedProbeResult(viewport, runIndex, err);
    }
    lastResult = result;
    attempts.push(summarizeProbeAttempt(result, i + 1));
    if (result.ok) return { ...result, attempts };
    if (!isRetriableVisualProbeFailure(result)) return { ...result, attempts };
  }
  return { ...lastResult, attempts };
}

async function runViewportProbe(browser, viewport, runIndex) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: viewport.deviceScaleFactor, isMobile: !!viewport.isMobile });
  const pageIssues = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });

  try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  const url = withDebugFlight(baseUrl);
  await gotoWithRetry(page, url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 15000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Flight Probe' }));
  await page.waitForFunction(
    () => window.SF.state.mode === 'flight'
      && window.SF.state.playerId
      && window.SF.state.entities.get(window.SF.state.playerId)
      && window.SF.state.entities.get(window.SF.state.playerId).mesh,
    null,
    { timeout: FLIGHT_START_TIMEOUT_MS },
  );
  await page.waitForTimeout(500);
  await dismissTutorial(page);
  await page.waitForTimeout(250);
  await isolateFlightProbeScene(page);
  await waitForSimTicks(page, 5);

  const initial = await sampleShip(page);
  await page.keyboard.down('ArrowRight');
  await waitForSimTicks(page, 30);
  const right = await sampleShip(page);
  await page.keyboard.up('ArrowRight');
  await waitForSimTicks(page, 6);
  const releaseStart = await sampleShip(page);
  const releaseStartRot = releaseStart.rot;
  await waitForSimTicks(page, 42);
  const release = await sampleShip(page, releaseStartRot);

  await page.keyboard.down('ArrowLeft');
  await waitForSimTicks(page, 30);
  const left = await sampleShip(page);
  await page.keyboard.up('ArrowLeft');
  await waitForSimTicks(page, 42);
  const leftRelease = await sampleShip(page);
  await page.keyboard.down('KeyE');
  await waitForSimTicks(page, 21);
  const strafe = await sampleShip(page);
  await page.keyboard.up('KeyE');
  await waitForSimTicks(page, 9);

  await page.keyboard.down('KeyW');
  await waitForSimTicks(page, 39);
  const throttle = await sampleShip(page);
  await page.keyboard.down('ShiftLeft');
  await waitForSimTicks(page, 39);
  const boost = await sampleShip(page);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  await waitForSimTicks(page, 54);
  const reverse = await sampleShip(page);
  await page.keyboard.up('KeyS');
  await waitForSimTicks(page, 9);

  await resetPlayerForProbe(page, { mode: 'assisted', rot: 0, vel: { x: 0, z: 0 }, boostEnergy: 100 });
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(80);
  await page.keyboard.up('ShiftLeft');
  await waitForSimTicks(page, 15);
  const tapDash = await sampleShip(page, null, { includeNearby: true });

  await resetPlayerForProbe(page, { mode: 'assisted', rot: 0, vel: { x: 0, z: 95 }, boostEnergy: 100 });
  await waitForSimTicks(page, 45);
  const assistedModeDiagnostics = await getFlightDiagnostics(page);
  const assistedMode = await sampleShip(page);
  await resetPlayerForProbe(page, { mode: 'newtonian', rot: 0, vel: { x: 0, z: 95 }, boostEnergy: 100 });
  await waitForSimTicks(page, 45);
  const newtonianMode = await sampleShip(page);
  const modeDiagnostics = await getFlightDiagnostics(page);
  await resetPlayerForProbe(page, { mode: 'assisted', rot: 0, vel: { x: 0, z: 0 }, boostEnergy: 100 });
  await waitForSimTicks(page, 9);

  const diagnostics = await getFlightDiagnostics(page);
  const sg02Diagnostics = await enableSg02DynamicBackend(page);
  const canvasShot = await screenshotCanvas(page);
  const pixels = await sampleCanvas(page, canvasShot);
  const suffix = cleanRuns > 1 ? `-run${runIndex}` : '';
  let screenshot = null;
  if (writeShots) {
    await mkdir(outDir, { recursive: true });
    screenshot = join(outDir, `flight-probe-${viewport.name}${suffix}.png`);
    await writeFile(screenshot, canvasShot);
  }

  const issues = pageIssues.issues;
  const ignoredIssues = pageIssues.ignoredIssues;
  const errorIssues = pageIssues.errorIssues();
  const warningIssues = pageIssues.warningIssues();
  const warningSummary = {
    strict: strictWarnings,
    count: warningIssues.length,
    clean: warningIssues.length === 0,
    ignoredProbeWarnings: ignoredIssues.length,
  };

  const checks = {
    rightBanksRight: right.bank > 0 && right.hullRotX > 0,
    leftBanksLeft: left.bank < 0 && left.hullRotX < 0,
    releaseStopsSpin: Math.abs(release.angVel) < 0.02 && Math.abs(release.rotDeltaAfterRelease) < 0.16,
    strafeDoesNotYaw: Math.abs(strafe.rot - leftRelease.rot) < 0.08,
    throttleMovesShip: throttle.forwardSpeed > 18 && throttle.speed > strafe.speed,
    boostAccelerates: boost.speed > throttle.speed + 8 && boost.boosting === true,
    reverseUsesBrakeIntent: reverse.inputBrake === true,
    reverseBrakes: reverse.speed < boost.speed * 0.78,
    tapDashFires: (tapDash.speed > 55 || tapDash.distanceFromReset > 35)
      && tapDash.dashCdT > 1
      && tapDash.boosting === false
      && tapDash.boostEnergy < tapDash.boostMax * 0.5,
    runtimeModeSwitchAffectsAssist: !!modeDiagnostics
      && modeDiagnostics.mode === 'newtonian'
      && !!assistedModeDiagnostics
      && assistedModeDiagnostics.mode === 'assisted'
      && assistedMode.flightMode === 'assisted'
      && newtonianMode.flightMode === 'newtonian'
      && assistedModeDiagnostics.assistStrength > 0
      && modeDiagnostics.assistStrength < assistedModeDiagnostics.assistStrength * 0.25,
    diagnosticsAvailable: !!diagnostics && diagnostics.mode === 'assisted',
    sg02DynamicReady: !!sg02Diagnostics
      && sg02Diagnostics.backend === 'rapier-dynamic'
      && sg02Diagnostics.rapierReady === true
      && sg02Diagnostics.sg02Ready === true
      && sg02Diagnostics.sg02Bodies > 0
      && sg02Diagnostics.snapshotBodies > 0,
    canvasNonBlank: pixels.nonDark > 0 && pixels.maxLum > 45 && pixels.dataUrlLen > 10000,
    noPageErrors: errorIssues.length === 0,
    noConsoleWarnings: !strictWarnings || warningSummary.clean,
  };

  return {
    run: runIndex,
    viewport: viewport.name,
    ok: Object.values(checks).every(Boolean),
    checks,
    initial,
    right,
    releaseStart,
    release,
    left,
    leftRelease,
    strafe,
    throttle,
    boost,
    reverse,
    tapDash,
    assistedModeDiagnostics,
    assistedMode,
    newtonianMode,
    modeDiagnostics,
    diagnostics,
    sg02Diagnostics,
    pixels,
    warningSummary,
    issueCount: issues.length,
    ignoredIssueCount: ignoredIssues.length,
    issues: summarizeIssues(includeWarningDetails ? issues : errorIssues),
    ignoredIssues: includeWarningDetails ? summarizeIssues(ignoredIssues) : [],
    screenshot,
  };
  } finally {
    if (!page.isClosed()) {
      try { await page.close(); } catch (_) {}
    }
  }
}

function logProgress(message) {
  if (process.env.SF_PROBE_QUIET === '1') return;
  process.stderr.write(`[flight-probe] ${message}\n`);
}

function compactProbeResult(result) {
  const compact = {
    run: result.run,
    viewport: result.viewport,
    ok: result.ok,
    failedChecks: failedCheckNames(result.checks),
    checks: result.checks,
    warningSummary: result.warningSummary,
    issueCount: result.issueCount,
    ignoredIssueCount: result.ignoredIssueCount,
    issues: result.issues,
    ignoredIssues: result.ignoredIssues,
    pixels: result.pixels && {
      width: result.pixels.width,
      height: result.pixels.height,
      nonDark: result.pixels.nonDark,
      maxLum: result.pixels.maxLum,
      dataUrlLen: result.pixels.dataUrlLen,
    },
    diagnostics: result.diagnostics && {
      mode: result.diagnostics.mode,
      speed: result.diagnostics.speed,
      assistStrength: result.diagnostics.assistStrength,
      physicsBackend: result.diagnostics.physicsBackend,
      tickMs: result.diagnostics.tickMs,
    },
    flightSamples: {
      boost: compactShipSample(result.boost),
      reverse: compactShipSample(result.reverse),
      tapDash: compactShipSample(result.tapDash),
    },
    sg02Diagnostics: result.sg02Diagnostics && {
      backend: result.sg02Diagnostics.backend,
      rapierReady: result.sg02Diagnostics.rapierReady,
      sg02Ready: result.sg02Diagnostics.sg02Ready,
      sg02Bodies: result.sg02Diagnostics.sg02Bodies,
      snapshotBodies: result.sg02Diagnostics.snapshotBodies,
      tickMs: result.sg02Diagnostics.tickMs,
    },
    screenshot: result.screenshot,
  };
  if (result.attempts && result.attempts.length > 1) compact.attempts = result.attempts;
  return compact;
}

function failedCheckNames(checks) {
  return Object.entries(checks || {})
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
}

function failedProbeResult(viewport, runIndex, err) {
  const message = String(err && err.stack || err && err.message || err || 'unknown probe failure');
  return {
    run: runIndex,
    viewport: viewport && viewport.name || 'unknown',
    ok: false,
    retriable: isRetriableProbeError(message),
    checks: {
      probeCompleted: false,
      noPageErrors: false,
      noConsoleWarnings: false,
      canvasNonBlank: false,
      sg02DynamicReady: false,
    },
    warningSummary: { strict: strictWarnings, count: 0, clean: false, ignoredProbeWarnings: 0 },
    issueCount: 1,
    ignoredIssueCount: 0,
    issues: [{ type: 'probeerror', text: message }],
    ignoredIssues: [],
    pixels: null,
    diagnostics: null,
    sg02Diagnostics: null,
  };
}

function compactShipSample(sample) {
  if (!sample) return null;
  return {
    speed: round(sample.speed, 3),
    forwardSpeed: round(sample.forwardSpeed, 3),
    lateralSpeed: round(sample.lateralSpeed, 3),
    boosting: !!sample.boosting,
    inputMoveZ: round(sample.inputMoveZ, 3),
    inputBrake: !!sample.inputBrake,
    tick: sample.tick,
    simTime: round(sample.simTime, 3),
    vel: sample.vel && { x: round(sample.vel.x, 3), z: round(sample.vel.z, 3) },
    pos: sample.pos && { x: round(sample.pos.x, 3), z: round(sample.pos.z, 3) },
    distanceFromReset: round(sample.distanceFromReset, 3),
    dashCdT: round(sample.dashCdT, 3),
    boostEnergy: round(sample.boostEnergy, 3),
    nearest: Array.isArray(sample.nearby) && sample.nearby[0]
      ? {
        id: sample.nearby[0].id,
        type: sample.nearby[0].type,
        distance: round(sample.nearby[0].distance, 3),
      }
      : null,
  };
}

function round(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  const scale = 10 ** digits;
  return Math.round(n * scale) / scale;
}

function summarizeProbeAttempt(result, attempt) {
  return {
    attempt,
    ok: result.ok,
    failedChecks: failedCheckNames(result.checks),
    issueCount: result.issueCount || 0,
    ignoredIssueCount: result.ignoredIssueCount || 0,
    issues: summarizeIssues(result.issues || []),
  };
}

function isRetriableVisualProbeFailure(result) {
  if (result && result.retriable === true) return true;
  const checks = result && result.checks || {};
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failedChecks.length === 1
    && failedChecks[0] === 'noConsoleWarnings'
    && checks.noPageErrors === true
    && checks.canvasNonBlank === true
    && checks.sg02DynamicReady === true
    && Array.isArray(result.issues)
    && result.issues.length > 0
    && result.issues.every(isRetriableWebglContextLossWarning)) {
    return true;
  }
  if (failedChecks.length > 0
    && failedChecks.every((name) => name === 'noPageErrors' || name === 'noConsoleWarnings')
    && checks.canvasNonBlank === true
    && checks.sg02DynamicReady === true
    && Array.isArray(result.issues)
    && result.issues.length > 0
    && result.issues.every(isRetriableLocalAssetLoadIssue)) {
    return true;
  }
  return failedChecks.length === 1
    && failedChecks[0] === 'noPageErrors'
    && checks.noConsoleWarnings === true
    && checks.canvasNonBlank === true
    && checks.sg02DynamicReady === true
    && Array.isArray(result.issues)
    && result.issues.length > 0
    && result.issues.every(isIgnorableWebglValidation);
}

function isRetriableProbeError(message) {
  return /Timeout \d+ms exceeded|Target page, context or browser has been closed|Execution context was destroyed/i.test(String(message || ''));
}

function isRetriableWebglContextLossWarning(issue) {
  if (!issue || issue.type !== 'warning') return false;
  const text = String(issue.text || '');
  return /CONTEXT_LOST_WEBGL|WebGL context lost|WebGL context restored|useProgram: program not valid|delete: object does not belong to this context/i.test(text);
}

function isRetriableLocalAssetLoadIssue(issue) {
  if (!issue) return false;
  const text = String(issue.text || '');
  if (issue.type === 'error') {
    return /Failed to load resource: net::ERR_CONNECTION_REFUSED/i.test(text);
  }
  if (issue.type !== 'warning') return false;
  return /Failed to fetch dynamically imported module: http:\/\/127\.0\.0\.1:\d+\//i.test(text);
}

async function dismissTutorial(page) {
  try {
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some((b) => /begin/i.test(b.textContent || '')),
      null,
      { timeout: 3000 },
    );
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /begin/i.test(b.textContent || ''));
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (clicked) {
      await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => /begin/i.test(b.textContent || '')),
        null,
        { timeout: 5000 },
      );
    }
  } catch (_) {
    // Some save states or future onboarding flows may skip the modal; the probe still samples the game below.
  }
}

async function resetPlayerForProbe(page, { mode = 'assisted', rot = 0, vel = { x: 0, z: 0 }, boostEnergy = 100 } = {}) {
  await page.evaluate(({ mode, rot, vel, boostEnergy }) => {
    const sf = window.SF;
    const state = sf.state;
    const p = state.entities.get(state.playerId);
    if (!p) return;
    state.settings.controls.flightMode = mode;
    Object.assign(state.input, {
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      boost: false,
      brake: false,
      fire: false,
      fireGroup: null,
    });
    p.rot = rot;
    p.prevRot = rot;
    p.angVel = 0;
    p.bank = 0;
    p.prevBank = 0;
    p.bankVel = 0;
    p.flags.boosting = false;
    p.vel.x = vel.x;
    p.vel.y = 0;
    p.vel.z = vel.z;
    if (p.pos) {
      if (typeof p.pos.set === 'function') p.pos.set(0, 0, 0);
      else {
        p.pos.x = 0;
        p.pos.y = 0;
        p.pos.z = 0;
      }
    }
    if (p.prevPos) {
      if (typeof p.prevPos.copy === 'function' && p.pos) p.prevPos.copy(p.pos);
      else {
        p.prevPos.x = 0;
        p.prevPos.y = 0;
        p.prevPos.z = 0;
      }
    }
    if (p.physicsBody) p.physicsBody.revision = (Number.isFinite(p.physicsBody.revision) ? p.physicsBody.revision : 0) + 1;
    if (p.data && p.data.propulsionRuntime) p.data.propulsionRuntime = null;
    p.boost = Object.assign(p.boost || {}, {
      energy: boostEnergy,
      max: 100,
      drainRate: 38,
      regenRate: 22,
      dashImpulse: 150,
      dashCd: 2,
      dashCdT: 0,
      _boostArmed: true,
      _boostHoldT: 0,
      _dashCandidate: false,
    });
    const flight = sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('flight') : null;
    if (flight) {
      flight._prevBoost = false;
      flight._suppressBoostUntilRelease = false;
    }
  }, { mode, rot, vel, boostEnergy });
  await isolateFlightProbeScene(page);
  await waitForPhysicsReset(page, vel);
  await waitForSimTicks(page, 5);
}

async function isolateFlightProbeScene(page) {
  await page.evaluate(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    if (!state || !state.entities) return;
    const dynamicTypes = new Set(['ship', 'drone', 'projectile', 'payload', 'wreck', 'pickup']);
    let hidden = 0;
    for (const entity of state.entities.values()) {
      if (!entity || entity.id === state.playerId) continue;
      if (!dynamicTypes.has(entity.type)) continue;
      entity.alive = false;
      entity.collides = false;
      if (entity.data) {
        entity.data.intent = null;
        if (entity.data.ai && typeof entity.data.ai === 'object') entity.data.ai.passive = true;
      }
      if (entity.vel) {
        entity.vel.x = 0;
        entity.vel.y = 0;
        entity.vel.z = 0;
      }
      if (entity.pos) {
        const lane = hidden++;
        entity.pos.x = 50000 + lane * 100;
        entity.pos.y = 0;
        entity.pos.z = 50000 + lane * 100;
      }
      if (entity.physicsBody) {
        entity.physicsBody.revision = (Number.isFinite(entity.physicsBody.revision) ? entity.physicsBody.revision : 0) + 1;
      }
    }
  });
}

async function waitForPhysicsReset(page, vel) {
  try {
    await page.waitForFunction(
      ({ vel }) => {
        const sf = window.SF;
        const state = sf && sf.state;
        const snapshot = state && state.physicsRuntime && state.physicsRuntime.sg02Snapshot;
        if (!Array.isArray(snapshot)) return false;
        const body = snapshot.find((entry) => entry && entry.id === state.playerId);
        if (!body) return false;
        const x = Number(body.x) || 0;
        const z = Number(body.z) || 0;
        const vx = Number(body.vx) || 0;
        const vz = Number(body.vz) || 0;
        return Math.hypot(x, z) < 1.5 && Math.hypot(vx - vel.x, vz - vel.z) < 1.5;
      },
      { vel },
      { timeout: 1800 },
    );
  } catch (_) {
    // Non-dynamic fallback paths still get the sim-tick wait below.
  }
}

async function getFlightDiagnostics(page) {
  return page.evaluate(() => {
    const diag = window.__SF_FLIGHT_DIAGNOSTICS__ || window.__SF_FLIGHT_V3__;
    const report = diag && typeof diag.getReport === 'function' ? diag.getReport() : null;
    if (!report) return null;
    if (!report.mode && report.assistMode) report.mode = report.assistMode;
    if (!Number.isFinite(report.assistStrength) && report.assistLocal) {
      report.assistStrength = Math.hypot(Number(report.assistLocal.forward) || 0, Number(report.assistLocal.lateral) || 0);
    }
    return report;
  });
}

async function enableSg02DynamicBackend(page) {
  await page.evaluate(() => {
    window.SF.state.physicsRuntime = window.SF.state.physicsRuntime || {};
    window.SF.state.physicsRuntime.publishSg02Snapshot = true;
    window.SF.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  });
  try {
    await page.waitForFunction(
      () => {
        const diag = window.SF && window.SF.state && window.SF.state.physicsRuntime && window.SF.state.physicsRuntime.diagnostics;
        const snapshot = window.SF && window.SF.state && window.SF.state.physicsRuntime && window.SF.state.physicsRuntime.sg02Snapshot;
        return !!(diag
          && diag.backend === 'rapier-dynamic'
          && diag.rapierReady === true
          && diag.sg02Ready === true
          && diag.sg02Bodies > 0
          && Array.isArray(snapshot)
          && snapshot.length > 0);
      },
      null,
      { timeout: 15000 },
    );
  } catch (_) {
    // Return the best diagnostics snapshot below so the failing report shows why readiness did not land.
  }
  return page.evaluate(() => {
    const state = window.SF && window.SF.state;
    const runtime = state && state.physicsRuntime;
    const diag = runtime && runtime.diagnostics;
    const snapshot = runtime && Array.isArray(runtime.sg02Snapshot) ? runtime.sg02Snapshot : [];
    return diag ? {
      ...diag,
      snapshotBodies: snapshot.length,
      playerBody: snapshot.find((body) => body && body.id === state.playerId) || null,
    } : null;
  });
}

async function sampleShip(page, releaseStartRot = null, options = {}) {
  return page.evaluate(({ startRot, includeNearby }) => {
    const state = window.SF.state;
    const p = state.entities.get(state.playerId);
    const nearby = includeNearby
      ? Array.from(state.entities.values())
        .filter((entity) => entity && entity !== p && entity.alive !== false && entity.collides !== false && entity.pos && (entity.radius || 0) > 0)
        .map((entity) => ({
          id: entity.id,
          type: entity.type,
          x: entity.pos.x,
          z: entity.pos.z,
          vx: entity.vel && entity.vel.x || 0,
          vz: entity.vel && entity.vel.z || 0,
          radius: entity.radius || 0,
          distance: Math.hypot((entity.pos.x || 0) - (p.pos.x || 0), (entity.pos.z || 0) - (p.pos.z || 0)),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 6)
      : [];
    return {
      pos: { x: p.pos.x, z: p.pos.z },
      distanceFromReset: Math.hypot(p.pos.x || 0, p.pos.z || 0),
      rot: p.rot,
      rotDeltaAfterRelease: startRot == null ? 0 : p.rot - startRot,
      angVel: p.angVel,
      bank: p.bank,
      hullRotX: p.mesh && p.mesh.userData.hull && p.mesh.userData.hull.rotation.x,
      speed: Math.hypot(p.vel.x, p.vel.z),
      forwardSpeed: p.vel.x * Math.cos(p.rot) + p.vel.z * Math.sin(p.rot),
      lateralSpeed: p.vel.x * -Math.sin(p.rot) + p.vel.z * Math.cos(p.rot),
      boosting: !!(p.flags && p.flags.boosting),
      boostEnergy: p.boost && p.boost.energy,
      boostMax: p.boost && p.boost.max,
      dashCdT: p.boost && p.boost.dashCdT,
      flightMode: window.SF.state.settings && window.SF.state.settings.controls && window.SF.state.settings.controls.flightMode,
      inputMoveZ: window.SF.state.input && window.SF.state.input.moveZ,
      inputBrake: !!(window.SF.state.input && window.SF.state.input.brake),
      tick: window.SF.state.tick,
      simTime: window.SF.state.simTime,
      vel: { x: p.vel.x, z: p.vel.z },
      nearby,
    };
  }, { startRot: releaseStartRot, includeNearby: !!options.includeNearby });
}

async function waitForSimTicks(page, ticks, timeoutMs = null) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    const viewport = page.viewportSize && page.viewportSize();
    const mobileViewport = viewport && viewport.width <= 500;
    timeoutMs = Math.max(mobileViewport ? 12000 : 6000, ticks * (mobileViewport ? 900 : 350));
  }
  const start = await page.evaluate(() => window.SF && window.SF.state ? window.SF.state.tick : 0);
  try {
    await page.waitForFunction(
      ({ startTick, tickCount }) => window.SF && window.SF.state && window.SF.state.tick >= startTick + tickCount,
      { startTick: start, tickCount: ticks },
      { timeout: timeoutMs },
    );
  } catch (error) {
    const snapshot = await page.evaluate(({ startTick, tickCount }) => {
      const sf = window.SF || null;
      const state = sf && sf.state || null;
      const player = state && state.entities && state.entities.get(state.playerId) || null;
      const perf = state && state.perfRuntime && typeof state.perfRuntime.getReport === 'function'
        ? state.perfRuntime.getReport()
        : null;
      return {
        startTick,
        targetTick: startTick + tickCount,
        tick: state && state.tick || 0,
        mode: state && state.mode || null,
        timeScale: state && state.timeScale,
        accumulator: state && state.accumulator,
        entityCount: state && state.entityList && state.entityList.length || 0,
        playerId: state && state.playerId || 0,
        playerAlive: player ? player.alive !== false : false,
        playerHasMesh: !!(player && player.mesh),
        input: state && state.input ? {
          moveX: state.input.moveX,
          moveZ: state.input.moveZ,
          turnIntent: state.input.turnIntent,
          boost: !!state.input.boost,
          brake: !!state.input.brake,
        } : null,
        screen: state && state.ui ? {
          modal: state.ui.modal || null,
          screen: state.ui.screen || null,
          stack: Array.isArray(state.ui.stack) ? state.ui.stack.slice() : null,
        } : null,
        perf: perf && perf.loop ? {
          frames: perf.loop.frames,
          steps: perf.loop.steps,
          shedBacklog: perf.loop.shedBacklog,
        } : null,
      };
    }, { startTick: start, tickCount: ticks }).catch((snapshotError) => ({
      snapshotError: String(snapshotError && snapshotError.message || snapshotError),
    }));
    if (snapshot && Number.isFinite(snapshot.tick) && Number.isFinite(snapshot.targetTick)
      && snapshot.tick >= snapshot.targetTick) {
      return;
    }
    throw new Error(`${error && error.message ? error.message : String(error)}; simTickSnapshot=${JSON.stringify(snapshot)}`);
  }
}

async function sampleCanvas(page, screenshotBuffer = null) {
  const backbuffer = await page.evaluate(() => {
    const canvas = document.getElementById('gl-canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const w = canvas.width;
    const h = canvas.height;
    const px = new Uint8Array(4);
    let nonDark = 0;
    let maxLum = 0;
    let samples = 0;
    for (let yi = 0; yi < 12; yi++) {
      for (let xi = 0; xi < 12; xi++) {
        const x = Math.floor((xi + 0.5) * w / 12);
        const y = Math.floor((yi + 0.5) * h / 12);
        gl.readPixels(x, h - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const lum = px[0] + px[1] + px[2];
        if (lum > 45) nonDark++;
        if (lum > maxLum) maxLum = lum;
        samples++;
      }
    }
    return { source: 'webgl-readPixels', width: w, height: h, samples, nonDark, maxLum, dataUrlLen: canvas.toDataURL('image/png').length };
  });
  if (backbuffer.nonDark > 0 && backbuffer.maxLum > 45) return backbuffer;
  if (!screenshotBuffer) return backbuffer;
  const screenshot = samplePngPixels(screenshotBuffer);
  return screenshot.nonDark > 0 && screenshot.maxLum > backbuffer.maxLum ? screenshot : backbuffer;
}

async function screenshotCanvas(page) {
  const box = await page.locator('#gl-canvas').boundingBox();
  if (!box) return page.screenshot({ type: 'png' });
  const viewport = page.viewportSize() || { width: Math.ceil(box.x + box.width), height: Math.ceil(box.y + box.height) };
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.max(1, Math.min(Math.ceil(box.width), viewport.width - x));
  const height = Math.max(1, Math.min(Math.ceil(box.height), viewport.height - y));
  return page.screenshot({ type: 'png', clip: { x, y, width, height } });
}

function samplePngPixels(buffer) {
  const png = PNG.sync.read(buffer);
  let nonDark = 0;
  let maxLum = 0;
  let samples = 0;
  for (let yi = 0; yi < 12; yi++) {
    for (let xi = 0; xi < 12; xi++) {
      const x = Math.min(png.width - 1, Math.max(0, Math.floor((xi + 0.5) * png.width / 12)));
      const y = Math.min(png.height - 1, Math.max(0, Math.floor((yi + 0.5) * png.height / 12)));
      const offset = (png.width * y + x) * 4;
      const lum = png.data[offset] + png.data[offset + 1] + png.data[offset + 2];
      if (lum > 45) nonDark++;
      if (lum > maxLum) maxLum = lum;
      samples++;
    }
  }
  return { source: 'canvas-screenshot', width: png.width, height: png.height, samples, nonDark, maxLum, dataUrlLen: buffer.length };
}

async function ensureServer(url) {
  if (await reachable(url)) return null;
  const u = new URL(url);
  const port = u.port || '8124';
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return child;
}

async function startFreshServer() {
  const port = await findFreePort(8124);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(String(port));
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const capture = (chunk) => {
    output = (output + String(chunk)).slice(-4000);
  };
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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 60; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for flight visual probe');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}

function withDebugFlight(url) {
  const u = new URL(url);
  u.searchParams.set('debug', 'flight');
  return String(u);
}

function readPositiveIntArg(names, fallback) {
  for (const name of names) {
    const ix = process.argv.indexOf(name);
    const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
    const raw = ix >= 0 ? process.argv[ix + 1] : inline && inline.slice(name.length + 1);
    if (raw == null) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      throw new RangeError(`${name} must be a positive integer`);
    }
    return n;
  }
  return fallback;
}

async function gotoWithRetry(page, url, opts) {
  let lastErr = null;
  for (let i = 0; i < 5; i++) {
    try {
      return await page.goto(url, opts);
    } catch (err) {
      lastErr = err;
      if (!String(err && err.message || err).includes('ERR_CONNECTION_REFUSED') || i === 4) throw err;
      await recoverProbeServer(url);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastErr;
}

async function recoverProbeServer(url) {
  if (await reachable(url)) return;
  const u = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) return;
  const port = u.port || '8124';
  if (server && server.kill) server.kill();
  const child = spawnProbeServer(port);
  await waitForReachable(`${u.protocol}//${u.hostname}:${port}/`, child);
  server = requestedBaseUrl ? child : { baseUrl, kill: () => child.kill() };
}
