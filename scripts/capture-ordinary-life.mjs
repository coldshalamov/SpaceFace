// PQ-143.01 ordinary-life observation on the public Ceres reference route.
//
// It observes only: it does not spawn, steer, relocate, or otherwise manufacture civilian activity.
// Everything it reports is read off live sim state or the shipping bus during the window, at normal
// speed, with HUD text swept off — the packet asks whether the quiet behaviours are legible WITHOUT
// HUD narration, so the capture must not be able to cheat by reading a label.
//
// It answers the done-when with a number rather than a recommendation to go and look: the six quiet
// behaviours (work, waiting, transfer, repair, travel, and a tug with a load physically on the line)
// each have a definition in `QUIET_BEHAVIOURS` below, and the run fails if any of them never
// happened.
//
//   node scripts/capture-ordinary-life.mjs                 # 5 minutes, headed
//   node scripts/capture-ordinary-life.mjs --seconds=60     # shorter diagnostic window
import { appendFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHROME_ARGS,
  HUD_TEXT_OFF_CSS,
  startDevServer,
  sweepHudText,
  waitForRealtime,
} from './lib/bench/frameStripCapture.mjs';
import { disableCeresTutorialThroughPublicSettings } from './lib/ceresFiveMinuteAcceptance.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { computeProductionSourceIdentity } from './measure-fun-loop.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const secondsArgument = process.argv.find((arg) => arg.startsWith('--seconds='));
const requestedSeconds = secondsArgument == null ? 300 : Number(secondsArgument.slice('--seconds='.length));
if (!Number.isInteger(requestedSeconds) || requestedSeconds < 1 || requestedSeconds > 300) {
  throw new Error('--seconds must be an integer from 1 through 300');
}
const OBSERVATION_SECONDS = requestedSeconds;
const TICK_RATE_HZ = 60;
const headed = !process.argv.includes('--headless');
const graphRequested = process.argv.includes('--graph');
const openingOnly = process.argv.includes('--opening-only');
if (openingOnly && OBSERVATION_SECONDS !== 5) {
  throw new Error('--opening-only is diagnostic only and requires --seconds=5');
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

async function waitForVisibleScreen(page, id, timeout = 30_000) {
  await page.waitForFunction((screenId) => {
    const element = document.querySelector(`[data-screen="${screenId}"]`);
    if (!element || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0.01 && rect.width > 20 && rect.height > 10;
  }, id, { timeout });
}

async function enterCeresReferencePocket(page) {
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 90_000 });
  if (await page.locator('#cinematic-splash').isVisible().catch(() => false)) await page.keyboard.press('Space');
  await waitForVisibleScreen(page, 'mainMenu');
  const tutorial = await disableCeresTutorialThroughPublicSettings(page);
  const graph = await setRenderGraphThroughPublicSettings(page, graphRequested);
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click({ timeout: 20_000 });
  await waitForVisibleScreen(page, 'sandbox');
  await page.getByRole('button', { name: /^Ceres Reference Pocket\b/ }).click({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state?.playerId);
    return state?.mode === 'flight' && state?.world?.currentSectorId === 'sector_ceres_belt'
      && state?.meta?.seed === 47 && player?.alive !== false && Number(player?.hull) > 0
      && !document.body.classList.contains('ui-modal-open');
  }, null, { timeout: 180_000 });
  return { tutorial, graph };
}

async function setRenderGraphThroughPublicSettings(page, enabled) {
  if (!enabled) {
    return { pass: true, source: 'default-settings', requested: false, changed: false, publicPath: [] };
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click({ timeout: 20_000 });
  await waitForVisibleScreen(page, 'settings');
  await page.getByRole('tab', { name: 'Video', exact: true }).click({ timeout: 20_000 });
  const toggle = page.getByLabel('Render graph (GTAO + bloom)', { exact: true });
  const before = await toggle.getAttribute('aria-pressed');
  if (before !== 'true' && before !== 'false') throw new Error('public Render graph control lacks exact pressed state');
  if ((before === 'true') !== enabled) await toggle.click({ timeout: 20_000 });
  await page.waitForFunction((next) => window.SF?.state?.settings?.video?.renderGraph === next, enabled,
    { timeout: 20_000 });
  await page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 20_000 });
  await waitForVisibleScreen(page, 'mainMenu');
  return {
    pass: true,
    source: 'public-settings-ui',
    requested: enabled,
    changed: (before === 'true') !== enabled,
    publicPath: ['Main Menu', 'Settings', 'Video', `Render graph (GTAO + bloom): ${enabled ? 'On' : 'Off'}`, 'Back'],
  };
}

// Diagnostic-only: identify the exact instanced, normal-less object that creates a late normal
// program on the graph's first real normal pass. Capture after WebGLRenderer's actual draw so
// `currentProgram` is the program that just bound, without changing scene or material state.
async function installGraphNormalDrawDiagnostic(page) {
  return page.evaluate(() => {
    const renderer = window.SF?.state?.render?.renderer;
    if (!renderer || typeof renderer.renderBufferDirect !== 'function') {
      throw new Error('graph normal diagnostic requires renderer.renderBufferDirect');
    }
    if (window.__PQ143_GRAPH_NORMAL_DRAWS__) {
      throw new Error('graph normal diagnostic already installed');
    }
    const original = renderer.renderBufferDirect;
    const rows = [];
    const trace = { rows, restore: null };
    const primitive = (value, limit = 180) => value == null ? null : String(value).slice(0, limit);
    renderer.renderBufferDirect = function graphNormalDrawDiagnostic(...args) {
      const [camera, scene, geometry, material, object] = args;
      const render = window.SF?.state?.render;
      const graph = render?.renderGraph;
      const isNormalPass = graph?.normalTarget
        && this.getRenderTarget?.() === graph.normalTarget;
      const result = original.apply(this, args);
      if (isNormalPass && material === graph.normalMaterial
        && object?.isInstancedMesh && !geometry?.getAttribute?.('normal') && rows.length < 64) {
        const plan = render?.openingSubmissionPlan;
        const plannedIndex = Array.isArray(plan?.compileSubjects)
          ? plan.compileSubjects.indexOf(object)
          : -1;
        const currentProgram = this.properties?.get?.(material)?.currentProgram;
        rows.push({
          tick: Number.isFinite(Number(window.SF?.state?.tick)) ? Number(window.SF.state.tick) : null,
          object: primitive(object.name || object.type),
          objectUuid: primitive(object.uuid),
          parent: primitive(object.parent?.name || object.parent?.type),
          planned: plannedIndex >= 0,
          plannedIndex: plannedIndex >= 0 ? plannedIndex : null,
          visible: object.visible !== false,
          count: Number.isFinite(Number(object.count)) ? Number(object.count) : null,
          geometry: primitive(geometry?.name || geometry?.uuid),
          attributes: Object.keys(geometry?.attributes || {}).sort(),
          sourceMaterials: (Array.isArray(object.material) ? object.material : [object.material])
            .filter(Boolean).map((entry) => ({
              name: primitive(entry.name || entry.type),
              type: primitive(entry.type),
              allowOverride: entry.allowOverride === true,
            })),
          normalProgramKey: primitive(currentProgram?.cacheKey, 1200),
        });
      }
      return result;
    };
    trace.restore = () => { renderer.renderBufferDirect = original; };
    window.__PQ143_GRAPH_NORMAL_DRAWS__ = trace;
    return { installed: true };
  });
}

async function readGraphNormalDrawDiagnostic(page, { restore = false } = {}) {
  if (!page || page.isClosed()) return null;
  return page.evaluate((shouldRestore) => {
    const trace = window.__PQ143_GRAPH_NORMAL_DRAWS__;
    if (!trace) return null;
    const result = { rows: trace.rows.slice() };
    if (shouldRestore && typeof trace.restore === 'function') {
      trace.restore();
      delete window.__PQ143_GRAPH_NORMAL_DRAWS__;
      result.restored = true;
    }
    return result;
  }, restore).catch(() => null);
}

async function installObserver(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const bus = window.SF?.bus;
    const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const text = (value, limit = 160) => typeof value === 'string' ? value.slice(0, limit) : null;
    const scalar = (value) => typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)
      ? value
      : null;
    if (!state || !bus) throw new Error('ordinary-life observer requires live game state and bus');
    if (window.__PQ143_ORDINARY_LIFE__) throw new Error('ordinary-life observer already installed');
    const trace = { receipts: [], off: null };
    trace.off = bus.on('traffic:jobActionReceipt', (payload = {}) => {
      trace.receipts.push({
        observedTick: finite(Number(state.tick)), observedSimTimeS: finite(Number(state.simTime)),
        schema: text(payload.schema), receiptId: text(payload.receiptId), actionId: text(payload.actionId),
        sectorId: text(payload.sectorId), routeId: text(payload.routeId), jobId: text(payload.jobId),
        jobKind: text(payload.jobKind), action: text(payload.action),
        sequence: Number.isSafeInteger(payload.sequence) ? payload.sequence : null,
        kernelSequence: Number.isSafeInteger(payload.kernelSequence) ? payload.kernelSequence : null,
        actorSlotId: text(payload.actorSlotId), actorId: scalar(payload.actorId),
        targetRef: text(payload.targetRef), targetKind: text(payload.targetKind), targetId: scalar(payload.targetId),
        effectType: text(payload.effectType), effectApplied: payload.effectApplied === true,
      });
      if (trace.receipts.length > 2_000) trace.receipts.splice(0, trace.receipts.length - 2_000);
    });
    window.__PQ143_ORDINARY_LIFE__ = trace;
  });
}

async function sampleObserver(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const trace = window.__PQ143_ORDINARY_LIFE__;
    const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const text = (value, limit = 160) => typeof value === 'string' ? value.slice(0, limit) : null;
    // EVERY WORKING HULL, not only the eight authored cast slots. The earlier sampler filtered on
    // `activityActorSlotId`, which is the Ceres acceptance census key — so ambient traffic, which is
    // most of the ordinary life on the route, was invisible to it, and so is the demand-dispatched
    // yard tug, which carries no slot id at all. A worker here is anything holding a job or a
    // traffic role.
    const actors = (state?.entityList || []).filter((entity) => entity?.alive !== false
      && (entity.data?.activityActorSlotId || entity.data?.ceresActivityJobOwned === true
        || entity.data?.jobId || entity.data?.trafficRole)).map((entity) => ({
      slotId: text(entity.data?.activityActorSlotId),
      worldRecordId: text(entity.data?.worldRecordId),
      role: text(entity.data?.trafficRole ?? entity.data?.role),
      jobId: text(entity.data?.jobId),
      jobKind: text(entity.data?.jobKind),
      phase: text(entity.data?.jobPhase ?? entity.data?.trafficPhase ?? entity.ai?.state),
      status: text(entity.data?.ceresHandoffStatus ?? entity.data?.status ?? entity.data?.activityStatus),
      x: finite(Number(entity.pos?.x)), z: finite(Number(entity.pos?.z)),
      vx: finite(Number(entity.vel?.x)), vz: finite(Number(entity.vel?.z)), hull: finite(Number(entity.hull)),
      cargoQty: finite(Number(entity.data?.cargoManifest?.totalQty ?? 0)),
      // The physical tow, read from the live attachment join rather than inferred from proximity.
      towAttachmentId: finite(Number(entity.data?.npcTowAttachmentId ?? NaN)),
    })).sort((a, b) => String(a.worldRecordId || a.slotId).localeCompare(String(b.worldRecordId || b.slotId)));
    // The loads themselves: a tug's booked lot is a real body, so it is counted as one.
    const loads = (state?.entityList || []).filter((entity) => entity?.alive !== false
      && (entity.data?.yardTugLot === true || entity.data?.npcTowedByJobId != null)).map((entity) => ({
      id: text(String(entity.id)),
      towedByJobId: text(entity.data?.npcTowedByJobId),
      x: finite(Number(entity.pos?.x)), z: finite(Number(entity.pos?.z)),
      radius: finite(Number(entity.radius)),
    }));
    const player = state?.entities?.get(state?.playerId);
    const row = {
      tick: finite(Number(state?.tick)), simTimeS: finite(Number(state?.simTime)), mode: text(state?.mode),
      sectorId: text(state?.world?.currentSectorId), timeScale: finite(window.SF.timeEffects.getEffectiveScale()), wallMs: finite(performance.now()),
      player: { x: finite(Number(player?.pos?.x)), z: finite(Number(player?.pos?.z)), hull: finite(Number(player?.hull)) },
      actors, loads,
    };
    return row;
  });
}

async function drainReceipts(page) {
  if (!page || page.isClosed()) return [];
  return page.evaluate(() => {
    const trace = window.__PQ143_ORDINARY_LIFE__;
    return trace ? trace.receipts.splice(0) : [];
  }).catch(() => []);
}

async function finishObserver(page) {
  if (!page || page.isClosed()) return [];
  return page.evaluate(() => {
    const trace = window.__PQ143_ORDINARY_LIFE__;
    if (!trace) return [];
    if (typeof trace.off === 'function') trace.off();
    delete window.__PQ143_ORDINARY_LIFE__;
    return trace.receipts.splice(0);
  }).catch(() => []);
}

async function readOpeningLiveness(page) {
  return page.evaluate(() => {
    const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const text = (value, limit = 8000) => typeof value === 'string' ? value.slice(0, limit) : null;
    const state = window.SF?.state;
    const render = state?.render || {};
    const diagnostics = render.diagnostics || {};
    const renderer = render.renderer;
    const completed = diagnostics.info || renderer?.info?.render || null;
    let authored = null;
    try { authored = window.SF?.authoredVisualReadiness?.() || null; } catch (_) {}
    const validation = render.openingSubmissionValidation || null;
    const preSubmit = render.openingSubmissionPreSubmitValidation || null;
    const currentProgramKeys = Array.isArray(renderer?.info?.programs)
      ? [...new Set(renderer.info.programs.map((program) => String(program?.cacheKey || '')).filter(Boolean))]
      : [];
    const requiredProgramKeys = Array.isArray(render.openingSubmissionReceipt?.required?.programCacheKeys)
      ? render.openingSubmissionReceipt.required.programCacheKeys.map((key) => String(key)).filter(Boolean)
      : [];
    const beforeProgramKeys = Array.isArray(render.openingSubmissionReceipt?.before?.programCacheKeys)
      ? render.openingSubmissionReceipt.before.programCacheKeys.map((key) => String(key)).filter(Boolean)
      : [];
    const currentSet = new Set(currentProgramKeys);
    const requiredSet = new Set(requiredProgramKeys);
    const summarizeKeys = (keys) => keys.slice(0, 8).map((key) => text(key));
    const firstVisible = render.openingFirstVisibleGpuCounts || validation?.firstVisibleGpuCounts || null;
    const late = firstVisible?.lateAdmissions || null;
    const admissionRows = Array.isArray(late?.lateAdmissions) ? late.lateAdmissions.slice(0, 8).map((row) => (
      `${text(row?.root, 120) || 'root'}>${text(row?.object, 120) || 'object'}:${text(row?.materialType, 80) || 'material'}:${row?.planned === true ? 'planned' : 'late'}:${row?.geometryAdmitted === true ? 'geometry' : 'program'}`
    )) : [];
    return {
      tick: finite(state?.tick), simTimeS: finite(state?.simTime), mode: text(state?.mode),
      lifecycle: text(window.SF?.loop?.getLifecycleState?.() || diagnostics.lifecycleState),
      suspended: window.SF?.loop?.isSuspended?.() === true,
      renderUpdates: finite(diagnostics.renderUpdates), executedFrames: finite(diagnostics.executedFrames),
      frameErrorCount: finite(diagnostics.frameErrorCount), lastFrameError: text(diagnostics.lastFrameError),
      contextLost: render.contextLost === true,
      renderGraph: {
        requested: state?.settings?.video?.renderGraph === true,
        available: !!render.renderGraph,
      },
      renderer: {
        frame: finite(completed?.frame), calls: finite(completed?.calls),
        geometries: finite(renderer?.info?.memory?.geometries), textures: finite(renderer?.info?.memory?.textures),
        programs: Array.isArray(renderer?.info?.programs) ? renderer.info.programs.length : null,
      },
      authoredReadiness: authored ? {
        ready: authored.ready === true, pipelineReady: authored.pipelineReady === true,
        playerStatus: text(authored.playerStatus), startingHubStatus: text(authored.startingHubStatus),
        openingPending: Array.isArray(authored.openingPending) ? authored.openingPending.length : null,
        blockingRoles: [...new Set((authored.flightReadyBlockers || []).map((blocker) => (
          blocker?.role ? String(blocker.role) : blocker?.layer ? `place:${String(blocker.layer)}` : 'unknown'
        )))].sort(),
      } : null,
      openingSubmission: validation ? {
        ok: validation.ok === true, reason: text(validation.reason),
        delta: {
          programs: finite(validation.delta?.programs), geometries: finite(validation.delta?.geometries),
          textures: finite(validation.delta?.textures),
        },
        uncapturedProgramKeys: summarizeKeys(validation.uncapturedProgramKeys || []),
        firstVisible: firstVisible ? {
          beforePrograms: finite(firstVisible.before?.programs), afterPrograms: finite(firstVisible.after?.programs),
          beforeGeometries: finite(firstVisible.before?.geometries), afterGeometries: finite(firstVisible.after?.geometries),
          deltaPrograms: finite(firstVisible.delta?.programs), deltaGeometries: finite(firstVisible.delta?.geometries),
          unexplained: late?.unexplained === true,
          newProgramKeys: summarizeKeys(late?.newProgramKeys || []),
          newProgramFamilies: summarizeKeys(late?.newProgramFamilyKeys || []),
          unattributedProgramKeys: summarizeKeys(late?.unattributedProgramKeys || []),
          admissions: admissionRows,
        } : null,
      } : null,
      openingPreSubmit: preSubmit ? {
        ok: preSubmit.ok === true, reason: text(preSubmit.reason),
      } : null,
      programCache: {
        requiredCount: requiredProgramKeys.length,
        currentCount: currentProgramKeys.length,
        requiredKeys: summarizeKeys(requiredProgramKeys),
        beforeKeys: summarizeKeys(beforeProgramKeys),
        currentKeys: summarizeKeys(currentProgramKeys),
        missingRequired: summarizeKeys(requiredProgramKeys.filter((key) => !currentSet.has(key))),
        unexpectedCurrent: summarizeKeys(currentProgramKeys.filter((key) => !requiredSet.has(key))),
      },
    };
  });
}

// The six quiet behaviours the packet's done-when names, each defined by what the SIM already
// publishes, so nothing here is scored from a screenshot. A behaviour counts as seen when a real
// worker was in that state for at least one observed second.
const QUIET_BEHAVIOURS = Object.freeze({
  // Somebody is doing the job itself: extracting, surveying, cutting, repairing on station.
  work: (a) => a.phase === 'work' || a.phase === 'unload' || a.phase === 'load',
  // Holding for a berth, a resource, or a queue rather than moving.
  waiting: (a) => a.phase === 'commission' || a.phase === 'dock' || a.phase === 'idle'
    || (Math.hypot(a.vx || 0, a.vz || 0) < 1.5 && !!a.jobId),
  // A cargo hand-off actually booked on a hull.
  transfer: (a) => (a.phase === 'load' || a.phase === 'unload') && (a.cargoQty || 0) > 0,
  // The service professions on a call. The Ceres cast's repair hand is an authored slot
  // (`ceres_refinery_tender`) whose traffic role is not `tender`, so the slot id counts too —
  // measured 2026-09-06: a 60 s window showed the tender working and scored `repair` as absent
  // because only the role was checked.
  repair: (a) => a.role === 'tender' || a.jobKind === 'tender' || a.role === 'rescue'
    || /tender|repair|rescue/.test(String(a.slotId || '')),
  // Somebody crossing the pocket to get somewhere.
  travel: (a) => (a.phase === 'transit' || a.phase === 'depart' || a.phase === 'approach')
    && Math.hypot(a.vx || 0, a.vz || 0) > 2,
  // The tug with a load physically on the line. Judged against the LOAD, not against a marker on
  // the hull: `towedByJobId` names the exact job doing the towing, is what the cleanup path keys on,
  // and is stamped on a body the physics owner is actually moving. `addSample` supplies the set of
  // job ids currently towing something, so this is a join and not a proximity guess.
  tugLoad: (a, towingJobIds) => a.role === 'tug' && !!a.jobId && towingJobIds.has(a.jobId),
});

function createObservationSummary() {
  return {
    samples: 0, receipts: 0, roles: new Set(), actors: new Set(), actions: new Set(), effects: new Set(), positions: new Map(),
    behaviourSeconds: Object.fromEntries(Object.keys(QUIET_BEHAVIOURS).map((k) => [k, 0])),
    towSeconds: 0, loadsSeen: new Set(), maxLoadTravelWU: 0, loadFirst: new Map(),
    activeWorkersPerSample: [],
  };
}

function addSample(summary, row) {
  summary.samples += 1;
  const seenThisSecond = new Set();
  let activeWorkers = 0;
  const towingJobIds = new Set((row.loads || [])
    .map((load) => load.towedByJobId).filter(Boolean));
  for (const actor of row.actors || []) {
    if (actor.jobId) activeWorkers += 1;
    for (const [name, test] of Object.entries(QUIET_BEHAVIOURS)) {
      if (!seenThisSecond.has(name) && test(actor, towingJobIds)) seenThisSecond.add(name);
    }
    if (actor.role === 'tug' && actor.jobId && towingJobIds.has(actor.jobId)) summary.towSeconds += 1;
  }
  for (const name of seenThisSecond) summary.behaviourSeconds[name] += 1;
  summary.activeWorkersPerSample.push(activeWorkers);
  for (const load of row.loads || []) {
    if (!load.id) continue;
    summary.loadsSeen.add(load.id);
    const first = summary.loadFirst.get(load.id) || { x: load.x, z: load.z };
    summary.loadFirst.set(load.id, first);
    if (Number.isFinite(load.x) && Number.isFinite(first.x)) {
      summary.maxLoadTravelWU = Math.max(summary.maxLoadTravelWU,
        Math.hypot(load.x - first.x, load.z - first.z));
    }
  }
  for (const actor of row.actors || []) {
    if (actor.role) summary.roles.add(actor.role);
    if (actor.slotId) summary.actors.add(actor.slotId);
    if (!actor.slotId || !Number.isFinite(actor.x) || !Number.isFinite(actor.z)) continue;
    const first = summary.positions.get(actor.slotId) || { x: actor.x, z: actor.z, moved: 0 };
    first.moved = Math.max(first.moved, Math.hypot(actor.x - first.x, actor.z - first.z));
    summary.positions.set(actor.slotId, first);
  }
}

function addReceipts(summary, receipts) {
  for (const receipt of receipts) {
    summary.receipts += 1;
    if (receipt.action) summary.actions.add(receipt.action);
    if (receipt.effectType) summary.effects.add(receipt.effectType);
  }
}

function observationSummary(summary) {
  const seconds = Math.max(1, summary.samples);
  const behaviours = Object.fromEntries(Object.entries(summary.behaviourSeconds).map(([k, v]) => [
    k, { seconds: v, shareOfWindow: Number((v / seconds).toFixed(3)), seen: v > 0 },
  ]));
  const missing = Object.entries(behaviours).filter(([, v]) => !v.seen).map(([k]) => k);
  const workers = summary.activeWorkersPerSample;
  const meanWorkers = workers.length
    ? Number((workers.reduce((a, b) => a + b, 0) / workers.length).toFixed(2)) : 0;
  return {
    samples: summary.samples, receipts: summary.receipts,
    actorSlots: [...summary.actors].sort(), roles: [...summary.roles].sort(),
    actionNames: [...summary.actions].sort(), effectTypes: [...summary.effects].sort(),
    largestActorDisplacementWU: Math.max(0, ...[...summary.positions.values()].map((entry) => entry.moved)),
    // The rhythm, as numbers. Every one of these is read off live sim state during the window.
    quietBehaviours: behaviours,
    behavioursMissing: missing,
    activeWorkers: { mean: meanWorkers, min: Math.min(...workers, 0), max: Math.max(...workers, 0) },
    tow: {
      secondsUnderTow: summary.towSeconds,
      distinctLoads: summary.loadsSeen.size,
      maxLoadTravelWU: Math.round(summary.maxLoadTravelWU),
    },
    // The verdict this observer exists to give. A capture that does not show all six quiet
    // behaviours has not shown the packet's rhythm, whatever the video looks like.
    verdict: missing.length === 0 ? 'all-quiet-behaviours-observed' : `missing: ${missing.join(', ')}`,
    pass: missing.length === 0,
  };
}

async function main() {
  const runId = `${Date.now()}-${process.pid}`;
  const outputDir = join(ROOT, '.devshots', 'pq143', `ordinary-life-${runId}`);
  const playerStoreDir = join(outputDir, 'player-store');
  const videoDir = join(outputDir, 'video');
  await Promise.all([mkdir(playerStoreDir, { recursive: true }), mkdir(videoDir, { recursive: true })]);
  const manifest = { schema: 'spaceface.pq143.ordinaryLifeObservation.v1', runId, observationSeconds: OBSERVATION_SECONDS, source: computeProductionSourceIdentity(ROOT), route: 'public Main Menu > Settings > Sandbox > Ceres Reference Pocket', camera: 'default shipping camera; no camera override', hudText: 'off', setup: 'isolated SPACEFACE_PLAYER_STORE_DIR', graphRequested, openingOnly, acceptance: openingOnly ? 'diagnostic-only' : 'observation-candidate', errors: [], errorCount: 0, errorsDropped: 0 };
  const tracePath = join(outputDir, 'trace.ndjson');
  const traceSummary = createObservationSummary();
  let server; let browser; let context; let page; let video = null; let start = null; let end = null;
  const appendTrace = async (type, value) => appendFile(tracePath, `${JSON.stringify({ type, ...value })}\n`, 'utf8');
  const errorRows = new Map();
  const recordError = (kind, value) => {
    manifest.errorCount += 1;
    const message = String(value?.message || value).slice(0, 8_000);
    const key = `${kind}\0${message}`;
    const existing = errorRows.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    if (manifest.errors.length >= 24) {
      manifest.errorsDropped += 1;
      return;
    }
    const row = { kind, message, count: 1 };
    errorRows.set(key, row);
    manifest.errors.push(row);
  };
  await appendTrace('header', { schema: 'spaceface.pq143.ordinaryLifeTrace.v1', runId, source: manifest.source });
  try {
    server = await startDevServer(8790, { env: { SPACEFACE_PLAYER_STORE_DIR: playerStoreDir } });
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: !headed, args: CHROME_ARGS });
    context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } } });
    page = await context.newPage();
    page.on('pageerror', (error) => recordError('pageerror', error));
    page.on('console', (message) => { if (message.type() === 'error') recordError('console', message.text()); });
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (graphRequested) {
      await page.waitForFunction(() => (
        typeof window.SF?.state?.render?.renderer?.renderBufferDirect === 'function'
      ), null, { timeout: 90_000 });
      manifest.graphNormalDiagnostic = await installGraphNormalDrawDiagnostic(page);
    }
    const routeSettings = await enterCeresReferencePocket(page);
    manifest.tutorial = routeSettings.tutorial;
    manifest.graphSettings = routeSettings.graph;
    manifest.hardware = await page.evaluate(() => {
      const gl = window.SF.state.render?.renderer?.getContext?.();
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return { webgl: !!gl, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable' };
    });
    manifest.opening = await readOpeningLiveness(page);
    console.log(json({ diagnostic: { opening: manifest.opening, errors: manifest.errors, errorCount: manifest.errorCount, errorsDropped: manifest.errorsDropped } }));
    if (!openingOnly) {
      await page.waitForFunction(() => {
        const readiness = window.SF?.authoredVisualReadiness?.();
        const preSubmit = window.SF?.state?.render?.openingSubmissionPreSubmitValidation;
        return readiness?.playerStatus === 'authored'
          && Array.isArray(readiness?.openingPending) && readiness.openingPending.length === 0
          && preSubmit?.ok === true;
      }, null, { timeout: 180_000 });
    }
    manifest.playableOpening = await readOpeningLiveness(page);
    await page.addStyleTag({ content: HUD_TEXT_OFF_CSS });
    manifest.hudStart = await sweepHudText(page);
    manifest.realtime = await waitForRealtime(page, { log: (line) => console.log(line) });
    if (!manifest.realtime.reachedFloor) throw new Error('Reference site did not reach normal speed before observation');
    await installObserver(page);
    start = await sampleObserver(page);
    await appendTrace('sample', start);
    addSample(traceSummary, start);
    manifest.start = start;
    const endSimTime = start.simTimeS + OBSERVATION_SECONDS;
    for (let next = start.simTimeS + 1; next <= endSimTime; next += 1) {
      await page.waitForFunction((target) => Number(window.SF?.state?.simTime) >= target, next, { timeout: 30_000 });
      end = await sampleObserver(page);
      await appendTrace('sample', end);
      addSample(traceSummary, end);
      const receipts = await drainReceipts(page);
      for (const receipt of receipts) await appendTrace('receipt', receipt);
      addReceipts(traceSummary, receipts);
      await sweepHudText(page, { onlyIfChanged: true });
    }
    const finalReceipts = await finishObserver(page);
    for (const receipt of finalReceipts) await appendTrace('receipt', receipt);
    addReceipts(traceSummary, finalReceipts);
    manifest.end = end;
    manifest.videoObservationStartOffsetS = start.wallMs / 1000;
    manifest.observationWallSeconds = (manifest.end.wallMs - start.wallMs) / 1000;
    manifest.realtimeFraction = (manifest.end.simTimeS - start.simTimeS) / manifest.observationWallSeconds;
    if (manifest.realtimeFraction < 0.6) throw new Error('Recorded ordinary-life window was below normal speed: ' + manifest.realtimeFraction);
    manifest.hudEnd = await sweepHudText(page);
    manifest.endOpening = await readOpeningLiveness(page);
    if (graphRequested) manifest.graphNormalDraws = await readGraphNormalDrawDiagnostic(page, { restore: true });
    const screenshotPath = join(outputDir, 'final.png');
    await page.screenshot({ path: screenshotPath });
    manifest.screenshot = { path: relative(ROOT, screenshotPath).replaceAll('\\', '/'), bytes: (await stat(screenshotPath)).size };
  } catch (error) {
    manifest.endOpening = await readOpeningLiveness(page).catch(() => null);
    if (graphRequested) manifest.graphNormalDraws = await readGraphNormalDrawDiagnostic(page, { restore: true });
    manifest.failure = { message: String(error?.message || error).slice(0, 1_000), stack: typeof error?.stack === 'string' ? error.stack.slice(0, 4_000) : null };
    const finalReceipts = await finishObserver(page);
    for (const receipt of finalReceipts) await appendTrace('receipt', receipt);
    addReceipts(traceSummary, finalReceipts);
  } finally {
    if (page && !page.isClosed()) video = page.video();
    if (context) await context.close().catch((error) => recordError('context-close', error));
    if (browser) await browser.close().catch((error) => recordError('browser-close', error));
    if (server) server.kill();
  }
  if (video) {
    const absolute = await video.path().catch(() => null);
    if (absolute) manifest.video = { path: relative(ROOT, absolute).replaceAll('\\', '/'), bytes: (await stat(absolute)).size };
  }
  manifest.trace = { path: relative(ROOT, tracePath).replaceAll('\\', '/'), samples: traceSummary.samples, receipts: traceSummary.receipts };
  manifest.summary = observationSummary(traceSummary);
  await writeFile(join(outputDir, 'manifest.json'), `${json(manifest)}\n`);
  console.log(json({ outputDir: relative(ROOT, outputDir), failure: manifest.failure ?? null, summary: manifest.summary, video: manifest.video ?? null }));
  if (manifest.failure) {
    process.exitCode = 1;
    return;
  }
  // A run that completed but never showed one of the six quiet behaviours has not shown the
  // packet's rhythm. Say so with an exit code, not only in the JSON, so it cannot be reported as a
  // pass by whoever reads only the last line. `--opening-only` is a diagnostic and never judges.
  if (!openingOnly && manifest.summary && manifest.summary.pass !== true) process.exitCode = 2;
}

await main();
