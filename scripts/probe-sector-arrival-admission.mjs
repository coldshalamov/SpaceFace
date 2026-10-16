#!/usr/bin/env node
// Sector arrival admission probe.
//
// The player jumps Helios -> Ceres through the real gate seam and the arriving sector's authored
// bodies must publish. Before this probe existed, the live-sector cook re-armed the opening's two
// publication guards (`firstFlightHandoffHold` + `openingGraphPublicationFrozen`) on a path that
// never returns to `loading`, so nothing at the destination ever reached
// `presentationAdmission: 'ready'` — the station 207 WU from the arrival point stayed `pending`
// for the whole session and the player arrived at an empty field of rock.
//
// Contract asserted here: every entity within RANGE_WU of the player that entered the authored
// admission path is `ready` by ARRIVE_BUDGET_S seconds of sim time after arrival. That budget is
// the packet's twenty-second bar, and the run prints a WARN whenever it lands past five, because
// the arrival band is supposed to reveal the near body on its own rather than waiting for the
// sector's certified set.
//
//   node scripts/probe-sector-arrival-admission.mjs                 # gate jump, headed (real GPU)
//   node scripts/probe-sector-arrival-admission.mjs --teleport      # world.enterSector directly
//   node scripts/probe-sector-arrival-admission.mjs --continue      # F9 save at Ceres, then load
//   node scripts/probe-sector-arrival-admission.mjs --diagnose      # dump the render hold flags
//   node scripts/probe-sector-arrival-admission.mjs --shot out.png  # still at the shipping camera
//
// Headed is the default because the admission machinery only runs with a real
// `state.render.scene`; `--headless` is available for triage, not for proof. CI runners have
// no X server, so the probe goes headless there automatically (`process.env.CI`) — the same
// software-GL path every sibling browser check takes — while local runs keep the real GPU.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_SECTOR = 'sector_ceres_belt';
const RANGE_WU = 340;
/** Sim seconds after arrival the census is read at. The first is the goal, the last is the alarm. */
const SAMPLE_SECONDS = [5, 20, 45, 60, 90, 120];

const argv = process.argv.slice(2);
const readOption = (flag, fallback = null) => {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) return fallback;
  return argv[index + 1];
};
// Headed is the local default for real-GPU proof (see header). On a CI runner there is no
// X server, so a headed launch dies at ozone_platform_x11 before the page exists — the same
// `$DISPLAY` failure sibling headed-default probes hit. `CI` is set by GitHub Actions (and
// every other CI host); `--headless` stays the explicit opt-in anywhere.
const HEADLESS = argv.includes('--headless') || !!process.env.CI;
const VIA_TELEPORT = argv.includes('--teleport');
/**
 * `--teleport` drops the player into the destination through `world.enterSector` without the gate
 * handoff, so the arriving population is materialized the ordinary way rather than staged behind
 * the jump. Measured on the reference iGPU it lands at +45 s, unchanged by the arrival band. It is
 * a compatibility seam, not the player route, so it carries its own bar instead of loosening the
 * one the gate and Continue actually meet.
 */
const DEFAULT_BUDGET_S = VIA_TELEPORT ? 60 : 20;
/**
 * Sim seconds after arrival by which every admitted body inside RANGE_WU must be published.
 *
 * On the gate and Continue routes this is the packet's bar, not a slow-machine allowance: the
 * bodies on the glass within about five seconds, everything in camera reach by twenty. Arrival
 * bodies admit nearest-first on the live range to the player, and a body inside the arrival band is
 * revealed the moment its own preparation is ready, so on the reference Intel iGPU (ANGLE / Intel
 * Graphics 0x00007D45, D3D11) a gate jump lands the jump ring 207 WU off the arrival point at the
 * +5 s sample in three runs of three, and Continue likewise. The twenty is the slack over that; the
 * WARN below is the five. Pass `--budget` to hold a machine to a different number.
 */
const ARRIVE_BUDGET_S = Math.max(
  1,
  Number(readOption('--budget', String(DEFAULT_BUDGET_S))) || DEFAULT_BUDGET_S,
);
// The bar is calibrated on hardware GL in sim seconds while decode/compile spend wall time —
// on a software rasterizer the serial admission queue cannot drain inside twenty sim seconds
// even when every job is healthy, so the run measures the environment instead of the contract.
// The teleport seam's sixty-second compatibility bar already encodes that class of allowance;
// software hosts get the same. An explicit --budget still wins.
const ARRIVE_BUDGET_EXPLICIT = /(^|\s)--budget(?:=|\s|$)/.test(process.argv.slice(2).join(' '));
const SOFTWARE_GPU_RE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;
const softwareArriveBudgetS = (gpuString) =>
  Math.max(ARRIVE_BUDGET_S, SOFTWARE_GPU_RE.test(String(gpuString || '')) ? 60 : 0);
const VIA_CONTINUE = argv.includes('--continue');
const DIAGNOSE = argv.includes('--diagnose');
const SHOT = readOption('--shot');
const SEED = Number(readOption('--seed', '4242')) || 4242;
const EXPLICIT_URL = readOption('--url', '');
/**
 * Sim seconds of ordinary flight before the jump is requested. The default is the player route:
 * you spawn at Helios and fly to the gate, which cannot happen inside the opening's 20 s
 * first-flight settle window. `--jump-at 0` jumps on the first flight frame — the stress row that
 * lands the arrival inside that window.
 */
const JUMP_AT_SIM_S = Math.max(0, Number(readOption('--jump-at', '25')) || 0);
/**
 * Wall-clock budget for document load and app-surface (window.SF) publication. Renderer bring-up —
 * including WebGL context creation — precedes it, and on software GL that sits behind serialized
 * shader work. Same phases and budgets the sibling startup check measures
 * (check-asset-startup-readiness `documentLoad`/`appSurfaceReady`). The env overrides exist so a
 * pathologically contended host can triage past the phase without weakening the CI defaults.
 */
const NAV_TIMEOUT_MS = Number(process.env.SF_ARRIVAL_NAV_MS) || 60_000;
const APP_SURFACE_TIMEOUT_MS = Number(process.env.SF_ARRIVAL_BOOT_MS) || 90_000;
/**
 * Wall-clock budget for menu readiness: the title flow mounts the main menu only after the loading
 * shell hands off and the `mainMenu`/`newGame` screens finish dynamic registration — on a contended
 * software-GL host both sit behind the GPU queue drain, so the mounted-and-armed gate below is the
 * real readiness signal. A bare locator.click timeout cannot see either cause and dies on its own
 * visibility poll (the CI failure this replaces). Same measured phase as the sibling's `menuReady`.
 */
const MENU_READY_TIMEOUT_MS = Number(process.env.SF_ARRIVAL_MENU_MS) || 90_000;

const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((candidate) => existsSync(candidate));

const t0 = Date.now();
const stamp = (label) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

const server = await acquireVisualProbeServer({ explicitUrl: EXPLICIT_URL, root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: HEADLESS,
  ...(browserPath ? { executablePath: browserPath } : {}),
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
// Skip the title cinematic on every navigation (the Continue reload included). A Space press
// cannot stand in for it: the splash mounts only after the loading shell hands off, so an early
// key lands before the input fence exists, gets swallowed, and the splash then holds the menu
// until its own 18 s timer — the gate below waits on the mounted menu instead.
const SIM_LANE_ARG = (() => {
  const i = process.argv.indexOf('--sim-lane');
  return i > 0 ? process.argv[i + 1] : null;
})();
await page.addInitScript((lane) => {
  try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  if (lane) { try { localStorage.setItem('sf.simLane', lane); } catch (_) {} }
}, SIM_LANE_ARG);
const logs = [];
page.on('console', (message) => {
  const text = message.text();
  if (/opening|cook|admission|sector|pending|prewarm|prepare/i.test(text)) logs.push(text.slice(0, 240));
});

const censusScript = (range) => {
  const state = window.SF.state;
  const player = state.entities.get(state.playerId);
  const rows = (state.entityList || [])
    .filter((entity) => entity
      && entity.alive !== false
      && entity.id !== state.playerId
      && Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) <= range)
    .map((entity) => ({
      id: entity.id,
      type: entity.type,
      d: Math.round(Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z)),
      adm: entity.presentationAdmission ?? null,
      authored: (entity.mesh && entity.mesh.userData && entity.mesh.userData.authoredAssetState) || null,
      // The prewarm staging filter reads exactly these three; a body materialized without one of
      // them is invisible to the arriving sector's prepare-then-publish contract.
      sec: entity.homeSectorId || (entity.data && (entity.data.homeSectorId || entity.data.sectorId)) || null,
      tier: (entity.activity && entity.activity.presentationTier) || null,
      place: (entity.data && (entity.data.placeId || entity.data.stationId || entity.data.archetypeGlb)) || null,
    }));
  const tally = {};
  for (const row of rows) {
    const key = `${row.type}:${row.adm}`;
    tally[key] = (tally[key] || 0) + 1;
  }
  // Sector-wide, so a body just outside the ranged census still shows whether the arriving
  // sector publishes at all. `pending` (the assertion set) stays ranged.
  const sectorTally = {};
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false || entity.presentationAdmission == null) continue;
    const key = `${entity.type}:${entity.presentationAdmission}`;
    sectorTally[key] = (sectorTally[key] || 0) + 1;
  }
  return {
    simTime: state.simTime,
    sector: state.world.currentSectorId,
    playerAdm: player.presentationAdmission ?? null,
    pending: rows.filter((row) => row.adm != null && row.adm !== 'ready'),
    tally,
    sectorTally,
    rows,
  };
};

// Test-only observation changes data descriptors to accessors temporarily. It never
// instruments existing accessors or non-writable/non-configurable properties.
function installArrivalTransitionTrace() {
  const limit = 96;
  const rows = [];
  const restores = [];
  const identities = new WeakMap();
  let sequence = 0;
  let omitted = 0;
  let nextIdentity = 1;
  const id = (value) => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return value ?? null;
    if (!identities.has(value)) identities.set(value, nextIdentity++);
    return identities.get(value);
  };
  const sf = window.SF;
  let owner = null;
  try { owner = sf.registry.get('render'); } catch (_) { /* Explicit unavailable owner. */ }
  let state = owner?.state || sf.state;
  let render = state.render;
  const watched = new WeakMap();
  const context = () => ({
    tick: state.tick, simTime: state.simTime, mode: state.mode,
    sector: state.world?.currentSectorId ?? null,
    enterSerial: state.world?.enterSerial ?? null,
    world: id(state.world), render: id(state.render), owner: id(owner),
    ownerStateMatchesSf: owner?.state === window.SF.state,
    ownerStatePresent: !!owner?.state,
    enterSerialPresent: !!state.world && Object.hasOwn(state.world, 'enterSerial'),
    cookGeneration: owner?._liveSectorCookGeneration ?? null,
    deferredHold: owner?._firstFlightDeferredHold ?? null,
  });
  const record = (event, details = {}) => {
    try {
      const row = { sequence: ++sequence, event, ...context(), ...details };
      if (rows.length === limit) { rows.shift(); omitted += 1; }
      rows.push(row);
    } catch (_) { /* Observation must never replace application behavior. */ }
  };
  const stack = () => {
    try { return String(new Error().stack || '').split('\n').slice(2, 6).map((s) => s.slice(0, 220)); }
    catch (_) { return []; }
  };
  const watch = (object, key, label) => {
    if (object && watched.get(object)?.has(key)) return;
    const descriptor = object && Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.writable || !descriptor.configurable) {
      record('unsupported-descriptor', { field: label, boundObject: id(object), present: !!descriptor });
      return;
    }
    if (!watched.has(object)) watched.set(object, new Set());
    watched.get(object).add(key);
    let value = descriptor.value;
    const getter = () => value;
    const setter = (next) => {
      const previous = value;
      value = next;
      record('write', { field: label, boundObject: id(object), previous: id(previous), next: id(next), callers: stack() });
    };
    Object.defineProperty(object, key, { configurable: true, enumerable: descriptor.enumerable, get: getter, set: setter });
    record('bound-descriptor', { field: label, boundObject: id(object), initial: id(value) });
    restores.push(() => {
      const current = Object.getOwnPropertyDescriptor(object, key);
      if (current?.get !== getter || current?.set !== setter) { record('cleanup-replaced', { field: label, boundObject: id(object) }); return; }
      Object.defineProperty(object, key, { ...descriptor, value });
    });
  };
  const bindPresentFields = () => {
    try { owner = window.SF.registry.get('render'); } catch (_) { owner = null; }
    state = owner?.state || window.SF.state;
    render = state.render;
    for (const key of ['openingGraphPublicationFrozen', 'sectorShellAdmission', 'firstFlightDeferredHoldUntil']) {
      watch(render, key, `render.${key}`);
    }
    for (const key of ['_firstFlightDeferredHold', '_liveSectorCookGeneration']) watch(owner, key, `owner.${key}`);
  };
  bindPresentFields();
  for (const [key, prefix] of [
    ['resumeDeferredPipelineAdmissions', 'resume'],
    ['prepareOpeningFirstPicture', 'first-picture'],
  ]) {
    const descriptor = render && Object.getOwnPropertyDescriptor(render, key);
    if (descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'function'
        && descriptor.writable && descriptor.configurable) {
      const resumeOwner = render;
      const original = descriptor.value;
      const wrapped = function (...args) {
        record(`${prefix}-enter`, { boundObject: id(resumeOwner), callers: stack() });
        try {
          const result = Reflect.apply(original, this, args);
          record(`${prefix}-return`, { boundObject: id(resumeOwner), result: id(result) });
          return result;
        } catch (error) {
          record(`${prefix}-throw`, { boundObject: id(resumeOwner), errorIdentity: id(error) });
          throw error;
        }
      };
      Object.defineProperty(render, key, { ...descriptor, value: wrapped });
      restores.push(() => {
        if (resumeOwner[key] === wrapped) Object.defineProperty(resumeOwner, key, descriptor);
        else record('cleanup-replaced', { field: key, boundObject: id(resumeOwner) });
      });
    } else record('unsupported-descriptor', { field: key });
  }
  let originRebound = false;
  const trace = {
    snapshot(label) {
      if (label === 'origin' && !originRebound) {
        originRebound = true;
        try { bindPresentFields(); } catch (_) { record('bind-error', { label }); }
      }
      record('marker', { label });
      try {
        const result = { limit, omitted, outputOmitted: 0, rows: rows.slice(), current: context() };
        while (result.rows.length && JSON.stringify(result).length > 24000) { result.rows.shift(); result.outputOmitted += 1; }
        return result;
      } catch (_) { return { traceError: 'snapshot unavailable' }; }
    },
    cleanup() { for (const restore of restores.reverse()) { try { restore(); } catch (_) { record('cleanup-error'); } } restores.length = 0; },
  };
  window.__sfArrivalTransitionTrace = trace;
  record('installed');
  return { installed: true, limit };
}

async function boundedTraceOperation(page, action) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => page.evaluate(action)),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ traceError: 'operation timed out' }), 1000); }),
    ]);
  } catch (_) { return { traceError: 'operation failed' }; }
  finally { clearTimeout(timer); }
}

const diagnoseScript = (traceMarker = 'diagnostic') => {
  const render = window.SF.state.render || {};
  const scene = render.scene;
  const queue = scene && scene.userData && scene.userData.authoredUpgradeDiagnostics;
  let system = null;
  try { system = window.SF.registry.get('render'); } catch { system = null; }
  const prewarm = (record) => (record
    ? {
      sectorId: record.sectorId,
      active: record.active === true,
      requests: (record.requests || []).length,
      boundaryRecords: record.boundaryRecords ? record.boundaryRecords.size : 0,
      liveBoundaryPromises: record.liveBoundaryPromises ? record.liveBoundaryPromises.size : 0,
      populationSeeded: record.populationSeeded === true,
    }
    : null);
  return {
    transitionTrace: window.__sfArrivalTransitionTrace?.snapshot(traceMarker) ?? null,
    authoredSectorPrewarmPendingId: system ? (system._authoredSectorPrewarmPendingId ?? null) : 'no-system',
    incomingSectorPrewarm: system ? prewarm(system._incomingSectorPrewarm) : null,
    currentSectorPrewarm: system ? prewarm(system._currentSectorPrewarm) : null,
    pendingSectorPrewarm: system ? prewarm(system._authoredSectorPrewarmPending) : null,
    boundaryPreparations: system && system._sectorBoundaryPreparations
      ? system._sectorBoundaryPreparations.inspect()
      : null,
    boundaryFailures: system && system._sectorBoundaryPreparations
      ? system._sectorBoundaryPreparations.inspectFailures().slice(-6)
      : null,
    meshCount: system && system._meshes ? system._meshes.size : null,
    openingGraphPublicationFrozen: render.openingGraphPublicationFrozen === true,
    hasPublicationGate: typeof render.waitForOpeningGraphPublicationRelease === 'function',
    deferNoncriticalMeshStreaming: render.deferNoncriticalMeshStreaming === true,
    sectorShellAdmission: render.sectorShellAdmission === true,
    liveSectorGpuAdmission: render.liveSectorGpuAdmission === true,
    firstFlightResidencyHoldUntil: render.firstFlightResidencyHoldUntil ?? null,
    firstFlightDeferredHoldUntil: render.firstFlightDeferredHoldUntil ?? null,
    // Publication is only half of "the arriving sector draws". These say whether the pose mirror
    // kept up with the entity table the jump replaced.
    presentationDuplicateIdRejects: render.presentationWorld?.duplicateIdRejects ?? null,
    presentationStaleHandleRejects: render.presentationWorld?.staleHandleRejects ?? null,
    presentationActive: render.presentationWorld?.active ?? null,
    sessionLiveSectorCookedId: render.sessionLiveSectorCookedId ?? null,
    upgradeQueue: queue
      ? {
        activeJobs: queue.activeJobs,
        jobs: (queue.jobs || []).map((job) => `${job.key}:${job.status}`),
      }
      : null,
  };
};

// Failure evidence is best-effort: a stalled page or broken inspector must never
// replace the original admission assertion. Each snapshot has a one-second ceiling.
async function captureArrivalDiagnostics(page, traceMarker = 'diagnostic') {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => page.evaluate(diagnoseScript, traceMarker)),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ diagnosticError: 'snapshot timed out after 1000ms' }), 1000);
      }),
    ]);
  } catch (error) {
    return { diagnosticError: String(error?.message || error).slice(0, 512) };
  } finally {
    clearTimeout(timer);
  }
}

function logArrivalDiagnostics(label, snapshot) {
  try {
    const text = JSON.stringify(snapshot);
    const limit = 32768;
    console.log(label, text.length <= limit ? text : JSON.stringify({
      diagnosticTruncated: true,
      omittedCharacters: text.length - limit,
      prefix: text.slice(0, limit),
    }));
  } catch (_) { /* Preserve the admission assertion even if diagnostic output fails. */ }
}

/**
 * Menu readiness gate: the main menu is painted, the boot overlay has released the glass, and the
 * named action's button is mounted and armed (aria-disabled drops only once its target screen is
 * registered — a refused click otherwise raises a "still initializing" toast and the flow stalls
 * on the next wait). This is what the old bare `getByRole('button').click({timeout:30s})` could
 * not express, and why it timed out on CI while the menu was still queued behind boot work.
 */
async function waitForMenuAction(page, action) {
  await page.waitForFunction((actionId) => {
    const menu = document.querySelector('[data-screen="mainMenu"]');
    if (!menu) return false;
    const menuStyle = getComputedStyle(menu);
    const menuRect = menu.getBoundingClientRect();
    if (menuStyle.display === 'none' || menuStyle.visibility === 'hidden'
      || menuRect.width <= 20 || menuRect.height <= 10) return false;
    const boot = document.getElementById('boot-overlay');
    if (boot) {
      const bootStyle = getComputedStyle(boot);
      const bootGone = boot.classList.contains('hidden')
        || bootStyle.pointerEvents === 'none' || bootStyle.display === 'none'
        || bootStyle.visibility === 'hidden';
      if (!bootGone) return false;
    }
    const button = menu.querySelector(`button[data-action="${actionId}"]`);
    return !!button && button.getAttribute('aria-disabled') !== 'true';
  }, action, { timeout: MENU_READY_TIMEOUT_MS });
}

async function waitForScreenVisible(page, id, timeoutMs = 30_000) {
  await page.waitForFunction((screenId) => {
    const el = document.querySelector(`[data-screen="${screenId}"]`);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, id, { timeout: timeoutMs });
}

let failure = null;
try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: APP_SURFACE_TIMEOUT_MS });
  await waitForMenuAction(page, 'newGame');
  // Every actionability wait on the menu path shares the menu budget, not Playwright's implicit
  // 30 s: the gate above only proves the button was mounted and armed at poll time — the click's
  // own stability/hit-test polls still need two produced frames, which a contended software-GL
  // host can starve for tens of seconds while the menu finishes its registration transitions.
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: MENU_READY_TIMEOUT_MS });
  await waitForScreenVisible(page, 'newGame', MENU_READY_TIMEOUT_MS);
  const traceInstallation = await boundedTraceOperation(page, installArrivalTransitionTrace);
  console.log('arrival trace installation:', JSON.stringify(traceInstallation));
  await page.fill('#sf-ng-seed', String(SEED), { timeout: MENU_READY_TIMEOUT_MS });
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: MENU_READY_TIMEOUT_MS });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 180_000 });
  stamp('flight');
  await page.waitForFunction(() => {
    const state = window.SF.state;
    return state.entities.get(state.playerId)?.presentationAdmission === 'ready';
  }, null, { timeout: 180_000 });
  stamp('player admitted at the origin sector');

  const gpu = await page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch (error) { return String(error); }
  });
  console.log('GPU:', gpu, '| seed:', await page.evaluate(() => window.SF.state.meta.seed));
  const arriveBudgetS = ARRIVE_BUDGET_EXPLICIT ? ARRIVE_BUDGET_S : softwareArriveBudgetS(gpu);
  if (arriveBudgetS !== ARRIVE_BUDGET_S) {
    console.log(`arrival budget ${ARRIVE_BUDGET_S}s -> ${arriveBudgetS}s (software GL)`);
  }
  const origin = await page.evaluate(censusScript, RANGE_WU);
  console.log('ORIGIN census within', RANGE_WU, 'WU:', JSON.stringify(origin.tally),
    '| sector-wide:', JSON.stringify(origin.sectorTally));
  const originDiagnostics = await captureArrivalDiagnostics(page, 'origin');
  if (DIAGNOSE) logArrivalDiagnostics('  diagnose origin:', originDiagnostics);

  if (JUMP_AT_SIM_S > 0) {
    await page.waitForFunction((target) => window.SF.state.simTime >= target,
      JUMP_AT_SIM_S, { timeout: 300_000 });
    stamp(`flew ${JUMP_AT_SIM_S}s of sim before requesting the jump`);
  }

  if (VIA_TELEPORT) {
    await page.evaluate((sectorId) => window.SF.registry.get('world').enterSector(sectorId), TARGET_SECTOR);
    stamp('teleport enterSector requested');
  } else {
    await page.evaluate((sectorId) => {
      window.__sfArrivalTransitionTrace?.snapshot('before-jump');
      return window.SF.bus.emit('world:requestJump', { targetSectorId: sectorId, via: 'gate' });
    }, TARGET_SECTOR);
    stamp('world:requestJump emitted');
  }
  await page.waitForFunction((sectorId) => window.SF.state.world.currentSectorId === sectorId
    && window.SF.state.mode === 'flight', TARGET_SECTOR, { timeout: 240_000 });
  stamp(`arrived in ${TARGET_SECTOR}`);

  if (VIA_CONTINUE) {
    // Save in the destination sector, then reload the page and Continue into it. The load path
    // must publish the same bodies the jump path does.
    await page.waitForFunction(() => window.SF.state.simTime > 0, null, { timeout: MENU_READY_TIMEOUT_MS });
    // The F5 keybinding's own event. `save:request` does not exist; emitting it wrote nothing and
    // the reload then Continued into the ORIGIN sector, which is a silent false pass.
    await page.evaluate(() => window.SF.bus.emit('game:save', { slot: 'quick' }));
    const savedSector = await page.waitForFunction(() => {
      const raw = localStorage.getItem('sf.save.quick');
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed?.data?.world?.currentSectorId || parsed?.world?.currentSectorId || 'unknown';
      } catch { return 'unparsed'; }
    }, null, { timeout: MENU_READY_TIMEOUT_MS }).then((handle) => handle.jsonValue());
    assert.equal(savedSector, TARGET_SECTOR,
      `the quick save must be written in ${TARGET_SECTOR}, not ${savedSector}`);
    stamp(`quick save written at the destination (${savedSector})`);
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await page.waitForFunction(() => !!window.SF?.state, null, { timeout: APP_SURFACE_TIMEOUT_MS });
    // Continue stays armed-but-disabled until the shared save store syncs; a click that lands in
    // the "Checking saves" window is a silent no-op and the flight wait below would burn its whole
    // budget for nothing. The gate waits for the armed button, not just the mounted menu.
    await waitForMenuAction(page, 'continue');
    await page.getByRole('button', { name: /^Continue$/i }).click({ timeout: MENU_READY_TIMEOUT_MS });
    await page.waitForFunction((sectorId) => window.SF.state.mode === 'flight'
      && window.SF.state.world.currentSectorId === sectorId, TARGET_SECTOR, { timeout: 240_000 });
    stamp('continued into the destination sector');
  }

  const simArrive = await page.evaluate(() => {
    window.__sfArrivalTransitionTrace?.snapshot('arrival');
    return window.SF.state.simTime;
  });
  const samples = [];
  for (const wait of SAMPLE_SECONDS) {
    if (wait > arriveBudgetS) break;
    await page.waitForFunction((target) => window.SF.state.simTime >= target,
      simArrive + wait, { timeout: 300_000 });
    const census = await page.evaluate(censusScript, RANGE_WU);
    samples.push({ wait, census });
    console.log(`ARRIVAL +${wait}s sim (player ${census.playerAdm}):`, JSON.stringify(census.tally),
      '| sector-wide:', JSON.stringify(census.sectorTally));
    if (DIAGNOSE) {
      console.log(`  diagnose +${wait}s:`, JSON.stringify(await page.evaluate(diagnoseScript)));
    }
    // Stop at the sample it lands on: the landing sample IS the number, and waiting past it only
    // burns CI wall clock.
    if (census.pending.length === 0) break;
  }
  const last = samples[samples.length - 1].census;
  console.log('rows:', JSON.stringify(last.rows));

  if (SHOT) {
    mkdirSync(path.dirname(path.resolve(SHOT)), { recursive: true });
    await page.screenshot({ path: path.resolve(SHOT) });
    stamp(`still written to ${path.resolve(SHOT)}`);
  }

  const withinBudget = samples.filter((sample) => sample.wait <= arriveBudgetS);
  const budget = withinBudget[withinBudget.length - 1] || samples[samples.length - 1];
  const stranded = budget.census.pending;
  if (stranded.length > 0) {
    logArrivalDiagnostics('  diagnose failure origin:', originDiagnostics);
    logArrivalDiagnostics('  diagnose failure arrival:', await captureArrivalDiagnostics(page));
  }
  assert.equal(
    stranded.length,
    0,
    `authored bodies must publish within ${arriveBudgetS}s of arriving in ${TARGET_SECTOR}; `
      + `still unpublished: ${JSON.stringify(stranded)}`,
  );
  const published = samples.find((sample) => sample.census.pending.length === 0)
    || samples[samples.length - 1];
  console.log(`PUBLISHED at +${published.wait}s sim (budget ${arriveBudgetS}s)`);
  if (published.wait > 5) {
    // The assert holds the twenty-second bar. This line is the five: the reference iGPU lands the
    // near body at the +5 s sample, so anything later means the near band lost its head start —
    // the reveal fell back to the certified set, or the live-range admission grading stopped
    // promoting the body on the player's bow.
    console.log(`WARN sector arrival published at +${published.wait}s, past the 5s bar`);
  }
  console.log('PASS sector arrival publishes the destination');
} catch (error) {
  failure = error;
  console.error('PROBE FAIL', error?.stack || error);
  console.log('--- console tail ---');
  for (const line of logs.slice(-30)) console.log('  ', line);
  process.exitCode = 1;
} finally {
  await boundedTraceOperation(page, () => window.__sfArrivalTransitionTrace?.cleanup());
  if (!failure && DIAGNOSE) {
    console.log('--- console tail ---');
    for (const line of logs.slice(-30)) console.log('  ', line);
  }
  // Both closes are bounded: a wedged software-GL browser or a lingering keep-alive socket
  // must not hold the event loop past the command timeout (the CI SIGKILL reads as failure
  // even after the PASS line printed).
  const bounded = (promise) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, 10_000))]);
  await bounded(browser.close()).catch(() => {});
  if (typeof server.close === 'function') await bounded(server.close()).catch(() => {});
}
process.exit(process.exitCode ?? 0);
