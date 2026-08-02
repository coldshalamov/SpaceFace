#!/usr/bin/env node

// PQ-020 H3 — one brokered target-profile Browser cell. Every repetition starts through visible
// New Game, uses the accepted public map/jump/autopilot drivers, samples ordinary Ceres endpoint
// entry, then samples the admitted/default-framed Wreck Cathedral in the same context.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  PQ020_CATHEDRAL_SITE_ID,
  PQ020_CERES_SECTOR_ID,
  PQ020_HELIOS_SECTOR_ID,
  PQ020_ROUTE_TARGETS,
  assertEndpointApproach,
  pq020FunctionalRouteDrivers,
} from './lib/pq020CeresFunctionalRoute.mjs';
import {
  PQ020_H3_PIPELINE_SETTLE_TIMEOUT_MS,
  PQ020_H3_PROFILE_IDS,
  PQ020_H3_RECEIPT_SCHEMA,
  PQ020_H3_REPETITIONS,
  classifyPq020H3ProbeFailure,
  validatePq020H3IncompleteReceipt,
  validatePq020H3PerformanceReceipt,
} from './lib/pq020CeresH3Performance.mjs';
import { sampleRafWindow } from './lib/releaseSoakProbe.mjs';
import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import manifest, {
  createPq020H3PerformanceManifest,
  PQ020_H3_FIXED_SEED,
  PQ020_H3_VIEWPORT,
} from './validation-manifests/pq020-h3-performance.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_ROOT = path.resolve(ROOT, manifest.artifactRoot);
const RECEIPT_PATH = path.join(ARTIFACT_ROOT, 'performance-receipt.json');
const DIAGNOSTIC = process.argv.includes('--diagnostic');
const FIXED_SEED = Number(process.env.SF_PROBE_SEED) > 0
  ? Number(process.env.SF_PROBE_SEED)
  : PQ020_H3_FIXED_SEED;

const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest: createPq020H3PerformanceManifest(),
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[pq020-h3-performance] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error('[pq020-h3-performance] invoke via: node scripts/validation-broker-cli.mjs --manifest pq020-h3-performance');
  console.error('[pq020-h3-performance] or pass --diagnostic for non-promoting local inspection');
  process.exit(2);
}

await mkdir(ARTIFACT_ROOT, { recursive: true });

let server = null;
let browser = null;
let activePage = null;
let activePhase = 'bootstrap';
let receipt = null;
let gpu = null;
let browserClosed = false;
let serverClosed = false;
const completed = [];

try {
  server = await acquireVisualProbeServer({ root: ROOT });
  const executablePath = findSystemBrowser();
  assert(executablePath, 'headed Chrome or Edge is required for PQ-020 H3 acceptance');
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: false,
    executablePath,
    args: [
      '--incognito',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      `--window-size=${PQ020_H3_VIEWPORT.width},${PQ020_H3_VIEWPORT.height}`,
      '--force-device-scale-factor=1',
    ],
  });

  const pairs = [];
  for (let repetition = 1; repetition <= PQ020_H3_REPETITIONS; repetition += 1) {
    activePhase = `pq020-h3-pair-${repetition}`;
    const context = await browser.newContext({
      viewport: { width: PQ020_H3_VIEWPORT.width, height: PQ020_H3_VIEWPORT.height },
      screen: { width: PQ020_H3_VIEWPORT.width, height: PQ020_H3_VIEWPORT.height },
      deviceScaleFactor: PQ020_H3_VIEWPORT.deviceScaleFactor,
      locale: 'en-US',
      colorScheme: 'dark',
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);
    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    });
    const issueTracker = collectPageIssues(page, { includeWarnings: false });
    const screenshots = [];
    const screenshot = async (name) => {
      const record = await capturePng(page, name);
      screenshots.push(record);
      return record;
    };

    try {
      const pair = await runPq020H3PerformancePair({
        page,
        rootUrl: server.baseUrl,
        repetition,
        screenshot,
      });
      const pageIssues = issueTracker.errorIssues();
      assert.deepEqual(pageIssues, [], `pair ${repetition}: the live route emitted page errors`);
      pair.pageIssues = pageIssues;
      pair.screenshots = screenshots;
      pairs.push(pair);
      completed.push({ repetition, pairId: pair.route.pairId, pageIssues, screenshots });
    } catch (error) {
      await page.screenshot({
        path: path.join(ARTIFACT_ROOT, `failure-pair-${repetition}.png`),
        type: 'png',
        animations: 'allow',
      }).catch(() => {});
      error.routePhase ||= activePhase;
      throw error;
    } finally {
      activePage = null;
      await context.close().catch(() => {});
    }
  }

  receipt = {
    schema: PQ020_H3_RECEIPT_SCHEMA,
    disposition: 'PASS',
    fixedSeed: FIXED_SEED,
    viewport: { ...PQ020_H3_VIEWPORT },
    runtime: 'browser-chromium-headed',
    gpu,
    qualityPreserving: {
      settingsOverridesApplied: false,
      defaultQualityRetained: true,
      performanceImprovementClaimed: false,
      absoluteTargetClaimed: false,
      absoluteBudgetWaiverGranted: false,
    },
    broker: {
      reason: brokerGate.reason,
      diagnostic: !!brokerGate.diagnostic,
      primaryAcceptance: !!brokerGate.primaryAcceptance,
      claimId: brokerGate.claim?.claimId || brokerGate.claim?.id || null,
    },
    route: {
      pairCount: pairs.length,
      declaredRoute:
        'New Game -> public Helios-to-Ceres map jump -> ordinary endpoint-entry floor '
        + '-> public Wreck Cathedral map waypoint -> natural autopilot arrival -> public default framing',
      retainedEvidenceReferences: [
        'design/program/roadmap/receipts/PQ-020-ceres-h1-capture-REPORT.md',
        'design/program/roadmap/receipts/PQ-020-h2-pocket-cathedral-REPORT.md',
      ],
      pairs: pairs.map((pair) => pair.route),
    },
    profiles: [
      { id: PQ020_H3_PROFILE_IDS[0], repetitions: pairs.map((pair) => pair.floor) },
      { id: PQ020_H3_PROFILE_IDS[1], repetitions: pairs.map((pair) => pair.target) },
    ],
    pageIssues: pairs.flatMap((pair) => pair.pageIssues),
    screenshots: pairs.flatMap((pair) => pair.screenshots),
    cleanup: { browserClosed: false, serverClosed: false },
  };
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({
      path: path.join(ARTIFACT_ROOT, 'failure-active.png'),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
  }
  const classification = classifyPq020H3ProbeFailure(error, {
    phase: activePhase,
    completedPairCount: completed.length,
  });
  receipt = {
    schema: PQ020_H3_RECEIPT_SCHEMA,
    runtime: 'browser-chromium-headed',
    disposition: 'FAIL',
    ...classification,
    problems: [classification.problem],
    stack: error?.stack || null,
    fixedSeed: FIXED_SEED,
    gpu,
    completed,
  };
} finally {
  if (browser) {
    try { await browser.close(); browserClosed = true; } catch (_) { browserClosed = false; }
  } else browserClosed = true;
  if (server) {
    try { await server.close(); serverClosed = true; } catch (_) { serverClosed = false; }
  } else serverClosed = true;
}

receipt.cleanup = { browserClosed, serverClosed };
const validation = receipt.productEvidenceValid === false
  ? validatePq020H3IncompleteReceipt(receipt)
  : validatePq020H3PerformanceReceipt(receipt);
receipt.validation = validation;
if (!validation.pass) {
  receipt.disposition = 'FAIL';
  receipt.problems = [...new Set([...(receipt.problems || []), ...validation.failures])];
}

await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

if (receipt.disposition !== 'PASS') {
  console.error(`[pq020-h3-performance] FAIL in ${receipt.phase || 'validation'}`);
  for (const problem of receipt.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('[pq020-h3-performance] PASS — three matched Ceres entry and Cathedral target windows');
if (receipt.validation?.absoluteBudget?.pass !== true) {
  console.log('[pq020-h3-performance] ABSOLUTE TARGET OPEN — matched feature result passes without a target waiver');
}
console.log(`  receipt: ${repoRel(RECEIPT_PATH)}`);

async function runPq020H3PerformancePair({ page, rootUrl, repetition, screenshot }) {
  const pairId = `pq020-h3-pair-${repetition}`;
  const boot = await pq020FunctionalRouteDrivers.bootSeededFlight(page, rootUrl, FIXED_SEED);
  const pairGpu = await pq020FunctionalRouteDrivers.readGpu(page);
  assert.equal(pairGpu.available, true, `pair ${repetition}: WebGL must be available`);
  assert.doesNotMatch(pairGpu.renderer || '', /SwiftShader|llvmpipe|software/i,
    `pair ${repetition}: acceptance requires the real GPU path, got ${pairGpu.renderer}`);
  if (!gpu) gpu = pairGpu;
  else assert.equal(pairGpu.renderer, gpu.renderer, `pair ${repetition}: GPU renderer changed`);
  await pq020FunctionalRouteDrivers.installObservers(page);
  await installH3TimingObservers(page);

  const mapOpenMs = await measurePublicMapOpen(page);
  await pq020FunctionalRouteDrivers.selectMapTarget(page, {
    ...PQ020_ROUTE_TARGETS.ceresSector,
    method: 'keyboard',
    activate: true,
    screenshot,
    screenshotName: `pair-${repetition}-ceres-map.png`,
  });
  const endpoint = await pq020FunctionalRouteDrivers.waitForJumpArrival(page, {
    sourceSectorId: PQ020_HELIOS_SECTOR_ID,
    targetSectorId: PQ020_CERES_SECTOR_ID,
  });
  assertEndpointApproach(endpoint, PQ020_HELIOS_SECTOR_ID);
  const sectorEntryMs = await readSectorEntrySpan(page);
  await pq020FunctionalRouteDrivers.waitForShipSettled(page);

  const floorWindow = await sampleRafWindow(page, {
    phaseTag: 'flight_steady',
    warmupMs: 2_000,
    pipelineStableMs: 5_000,
    pipelineSettleTimeoutMs: PQ020_H3_PIPELINE_SETTLE_TIMEOUT_MS,
    sampleMs: 5_000,
    enableGpuTimers: false,
    requireAuthoredFlight: true,
    requireDocked: false,
  });
  await attachSeparatedGpuAttribution(page, floorWindow);
  const floorFacts = await readPq020H3RouteFacts(page, {
    profileId: PQ020_H3_PROFILE_IDS[0],
    repetition,
    pairId,
    mapOpenMs,
    sectorEntryMs,
  });
  await screenshot(`pair-${repetition}-ceres-entry-floor.png`);

  await pq020FunctionalRouteDrivers.selectMapTarget(page, {
    ...PQ020_ROUTE_TARGETS.cathedral,
    method: 'pointer',
    activate: true,
    screenshot,
    screenshotName: `pair-${repetition}-cathedral-map.png`,
  });
  const admission = await pq020FunctionalRouteDrivers.waitForCathedralAdmission(page);
  const arrival = await pq020FunctionalRouteDrivers.waitForAutopilotArrival(
    page,
    PQ020_ROUTE_TARGETS.cathedral,
  );
  await pq020FunctionalRouteDrivers.waitForShipSettled(page);
  const framing = await pq020FunctionalRouteDrivers.waitForCathedralFraming(page, {
    name: 'default',
    cameraZoom: 72,
  });

  const targetWindow = await sampleRafWindow(page, {
    phaseTag: 'station_visible_steady',
    warmupMs: 2_000,
    pipelineStableMs: 5_000,
    pipelineSettleTimeoutMs: PQ020_H3_PIPELINE_SETTLE_TIMEOUT_MS,
    sampleMs: 5_000,
    enableGpuTimers: false,
    requireAuthoredFlight: true,
    requireDocked: false,
  });
  await attachSeparatedGpuAttribution(page, targetWindow);
  const targetFacts = await readPq020H3RouteFacts(page, {
    profileId: PQ020_H3_PROFILE_IDS[1],
    repetition,
    pairId,
    mapOpenMs,
    sectorEntryMs,
  });
  await screenshot(`pair-${repetition}-cathedral-visible-target.png`);

  return {
    route: {
      pairId,
      repetition,
      recordedSeed: boot.recordedSeed,
      publicRoute: true,
      endpoint,
      mapOpenMs,
      sectorEntryMs,
      cathedralAdmission: admission,
      cathedralArrival: arrival,
      cathedralFraming: framing,
      declaredCompressions: [
        'the accepted public route stops after the first Helios-to-Ceres direction; retained H1 owns save/Continue and the Tethys return',
        'the accepted public route drives only the Cathedral target after the entry-floor sample; retained H1 owns the other three pocket arrivals',
      ],
    },
    floor: {
      index: repetition,
      routeFacts: floorFacts,
      rawSamples: floorWindow.samples,
      attribution: floorWindow.attribution,
    },
    target: {
      index: repetition,
      routeFacts: targetFacts,
      rawSamples: targetWindow.samples,
      attribution: targetWindow.attribution,
    },
  };
}

async function measurePublicMapOpen(page) {
  const startedAtMs = await page.evaluate(() => performance.now());
  await page.keyboard.press('KeyN');
  await page.locator('[data-screen="galaxyMap"]').first().waitFor({ state: 'visible', timeout: 30_000 });
  const endedAtMs = await page.evaluate(() => performance.now());
  await page.keyboard.press('Escape');
  await page.locator('[data-screen="galaxyMap"]').first().waitFor({ state: 'hidden', timeout: 30_000 });
  return endedAtMs - startedAtMs;
}

async function attachSeparatedGpuAttribution(page, timingWindow) {
  const gpuCapture = await page.evaluate(async ({ requiredFrames }) => {
    const state = window.SF?.state;
    const timers = state?.render?.gpuTimers;
    assertGpuTimerCapability(timers);
    const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const settingsSlice = () => JSON.stringify({
      video: state?.settings?.video || null,
      dynResScale: Number.isFinite(state?.render?.dynResScale) ? state.render.dynResScale : null,
      timeScale: Number.isFinite(state?.timeScale) ? state.timeScale : null,
    });
    const routeSlice = () => JSON.stringify({
      mode: state?.mode || null,
      docked: state?.ui?.docked === true,
      jumpState: state?.jump?.state || null,
      visibility: document.visibilityState,
    });
    const settingsStart = settingsSlice();
    const routeStart = routeSlice();
    const startedAt = performance.now();
    let frameCount = 0;
    let drain = null;
    let report = null;
    try {
      timers.reset();
      timers.setEnabled(true);
      while (frameCount < requiredFrames) {
        await raf();
        frameCount += 1;
      }
      drain = await timers.drainPending({
        maxPolls: 120,
        timeoutMs: 2_000,
        yieldFn: raf,
      });
      report = timers.getReport();
    } finally {
      timers.setEnabled(false);
    }
    return {
      frameCount,
      durationMs: performance.now() - startedAt,
      settingsStable: settingsSlice() === settingsStart,
      routeStable: routeSlice() === routeStart,
      gpuTimers: {
        available: report?.available === true,
        status: report?.status || (report?.available ? 'available' : 'unavailable'),
        reason: report?.reason || null,
        extension: report?.extension || null,
        enabled: report?.enabled === true,
        lastDisjoint: report?.lastDisjoint === true,
        pending: report?.pending,
        lastInvalidation: report?.lastInvalidation || null,
        queryCounts: report?.queryCounts || null,
        captureValid: report?.captureValid === true,
        drain,
        terminals: report?.terminals || null,
        passes: report?.passes || null,
      },
    };

    function assertGpuTimerCapability(candidate) {
      if (!candidate
          || typeof candidate.reset !== 'function'
          || typeof candidate.setEnabled !== 'function'
          || typeof candidate.drainPending !== 'function'
          || typeof candidate.getReport !== 'function') {
        throw new Error('PQ-020 H3 requires the live GPU timer capability');
      }
    }
  }, { requiredFrames: 150 });

  timingWindow.attribution.gpuTimers = gpuCapture.gpuTimers;
  timingWindow.attribution.measurementIsolation = {
    frameTimingGpuTimersEnabled: false,
    gpuAttributionSeparated: true,
    gpuAttributionFrameCount: gpuCapture.frameCount,
    gpuAttributionDurationMs: gpuCapture.durationMs,
    settingsStable: gpuCapture.settingsStable,
    routeStable: gpuCapture.routeStable,
  };
}

async function installH3TimingObservers(page) {
  await page.evaluate(() => {
    const bus = window.SF?.bus;
    if (!bus || window.__PQ020_H3_TRACE_INSTALLED__) return;
    const trace = window.__PQ020_H3_TRACE__ = { events: [] };
    window.__PQ020_H3_TRACE_INSTALLED__ = true;
    for (const event of ['sector:enter', 'jump:arrive']) {
      bus.on(event, (payload) => {
        trace.events.push({
          event,
          tick: window.SF?.state?.tick ?? null,
          atMs: performance.now(),
          sectorId: payload?.sectorId ?? null,
        });
        if (trace.events.length > 16) trace.events.shift();
      });
    }
  });
}

async function readSectorEntrySpan(page) {
  const timing = await page.evaluate((sectorId) => {
    const events = window.__PQ020_H3_TRACE__?.events || [];
    const entered = [...events].reverse().find((row) => row.event === 'sector:enter'
      && (!row.sectorId || row.sectorId === sectorId));
    const arrived = [...events].reverse().find((row) => row.event === 'jump:arrive'
      && (!row.sectorId || row.sectorId === sectorId));
    return {
      enteredAtMs: entered?.atMs ?? null,
      arrivedAtMs: arrived?.atMs ?? null,
      enteredTick: entered?.tick ?? null,
      arrivedTick: arrived?.tick ?? null,
    };
  }, PQ020_CERES_SECTOR_ID);
  assert.ok(Number.isFinite(timing.enteredAtMs), 'public Ceres route emitted no timed sector:enter');
  assert.ok(Number.isFinite(timing.arrivedAtMs), 'public Ceres route emitted no timed jump:arrive');
  const spanMs = timing.arrivedAtMs - timing.enteredAtMs;
  assert.ok(spanMs >= 0, `sector-entry event order inverted by ${spanMs} ms`);
  return spanMs;
}

async function readPq020H3RouteFacts(page, {
  profileId,
  repetition,
  pairId,
  mapOpenMs,
  sectorEntryMs,
}) {
  return page.evaluate((input) => {
    const state = window.SF.state;
    const perfOwner = window.__SPACEFACE_PERF__ || state.perfRuntime;
    const perf = typeof perfOwner?.getReport === 'function' ? perfOwner.getReport() : null;
    const alive = state.entityList.filter((entity) => entity?.alive !== false);
    const player = state.entities.get(state.playerId);
    const cathedralEntities = alive.filter((entity) => (
      entity.data?.worldSiteId === input.siteId
    ));
    const cathedralRoot = alive.find((entity) => (
      entity.data?.worldRecordId === `${input.siteId}/root`
    )) || null;
    const rootMesh = cathedralRoot?.mesh || cathedralRoot?.view?.root || null;
    const rootRawAssetState = rootMesh?.userData?.authoredAssetState || null;
    const activeStaticBatches = [];
    const activeDepthPrepasses = [];
    let cathedralDepthTopology = null;
    rootMesh?.traverse?.((object) => {
      if (!object || object.visible === false) return;
      if (!cathedralDepthTopology && object.userData?.cathedralDepthTopology) {
        cathedralDepthTopology = object.userData.cathedralDepthTopology;
      }
      if (!object.isMesh) return;
      if (object.userData?.spacefaceStaticBatch) activeStaticBatches.push(object);
      if (object.userData?.spacefaceDepthPrepass) activeDepthPrepasses.push(object);
    });
    const geometrySummary = (objects) => objects.reduce((summary, object) => {
      const geometry = object.geometry;
      const positions = geometry?.getAttribute?.('position');
      const count = Number(geometry?.index?.count || positions?.count || 0);
      summary.drawables += 1;
      summary.indexedDrawables += geometry?.index ? 1 : 0;
      summary.uniqueVertices += Number(positions?.count || 0);
      summary.triangleIndices += count;
      summary.triangles += count / 3;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const role = String(material?.userData?.spacefaceMaterialRole || '').trim().toLowerCase();
        if (role && material?.userData?.spacefacePackedOrmSingleSample === true) {
          summary.packedOrmSingleSampleMaterialRoles.push(role);
        }
        if (role && material?.userData?.spacefaceCathedralOrdinaryOpenDepth === true) {
          summary.ordinaryOpenDepthMaterialRoles.push(role);
        }
        if (material?.userData?.spacefaceMinimalPositionDepthShader === true) {
          summary.minimalPositionDepthShaderDrawables += 1;
        }
      }
      if (object.userData?.spacefaceDepthRole) {
        const role = object.userData.spacefaceDepthRole;
        summary.roles.push(role);
        summary.trianglesByRole[role] = (summary.trianglesByRole[role] || 0) + count / 3;
      }
      return summary;
    }, {
      drawables: 0,
      indexedDrawables: 0,
      uniqueVertices: 0,
      triangleIndices: 0,
      triangles: 0,
      packedOrmSingleSampleMaterialRoles: [],
      ordinaryOpenDepthMaterialRoles: [],
      minimalPositionDepthShaderDrawables: 0,
      roles: [],
      trianglesByRole: {},
    });
    const colorGeometry = geometrySummary(activeStaticBatches);
    const depthGeometry = geometrySummary(activeDepthPrepasses);
    colorGeometry.packedOrmSingleSampleMaterialRoles.sort();
    colorGeometry.ordinaryOpenDepthMaterialRoles.sort();
    depthGeometry.packedOrmSingleSampleMaterialRoles.sort();
    depthGeometry.ordinaryOpenDepthMaterialRoles.sort();
    depthGeometry.roles.sort();
    const admittedComponentCount = cathedralEntities.filter((entity) => (
      entity.data?.role === 'world_site_component'
      && entity.data?.worldSitePresentationAdmitted === true
    )).length;
    const target = input.profileId === 'cathedral-visible-target';
    let projection = null;
    if (rootMesh?.position?.clone && state.render?.camera) {
      try {
        rootMesh.updateWorldMatrix?.(true, false);
        state.render.camera.updateMatrixWorld?.(true);
        const point = rootMesh.position.clone();
        rootMesh.getWorldPosition?.(point);
        point.project(state.render.camera);
        projection = {
          x: point.x,
          y: point.y,
          z: point.z,
          inFrame: Math.abs(point.x) <= 0.96 && Math.abs(point.y) <= 0.96
            && point.z >= -1 && point.z <= 1,
        };
      } catch (_) { projection = null; }
    }
    const subject = target ? cathedralRoot : player;
    const subjectMesh = subject?.mesh || subject?.view?.root || null;
    const subjectRawAssetState = subjectMesh?.userData?.authoredAssetState || null;
    const ambientTrafficIds = alive
      .filter((entity) => !!entity.data?.trafficRole)
      .map((entity) => entity.id)
      .sort((left, right) => String(left).localeCompare(String(right)));
    const appliedLod = rootMesh?.userData?.lod?.level || null;
    const activeDepthTopology = cathedralDepthTopology ? {
      geometry: cathedralDepthTopology.geometry || null,
      activeLod: appliedLod,
      report: cathedralDepthTopology.byLod?.[appliedLod] || null,
    } : null;
    return {
      profileId: input.profileId,
      repetition: input.repetition,
      pairId: input.pairId,
      recordedSeed: state.meta?.seed ?? null,
      sectorId: state.world?.currentSectorId || null,
      mode: state.mode || null,
      docked: state.ui?.docked === true,
      trafficRuntime: 'ordinary-sector-traffic',
      ambientTrafficIds,
      ambientTrafficCount: ambientTrafficIds.length,
      entityCount: alive.length,
      colliderCount: alive.filter((entity) => entity.collides === true).length,
      spatialHash: {
        queries: Number(perf?.counters?.spatialHash?.queries) || 0,
        candidates: Number(perf?.counters?.spatialHash?.candidates) || 0,
      },
      mapOpenMs: input.mapOpenMs,
      sectorEntryMs: input.sectorEntryMs,
      cathedral: {
        siteId: input.siteId,
        rootEntityId: cathedralRoot?.id ?? null,
        entityCount: cathedralEntities.length,
        admittedComponentCount,
        rootAdmission: cathedralRoot?.presentationAdmission || null,
        rootAssetState: String(rootRawAssetState || '').startsWith('authored')
          ? 'authored'
          : rootRawAssetState,
        appliedLod,
        inFrame: projection?.inFrame === true,
        projection,
        cameraZoom: target ? Number(state.camera?.zoom) : null,
        distanceToPlayer: cathedralRoot && player
          ? Math.hypot(cathedralRoot.pos.x - player.pos.x, cathedralRoot.pos.z - player.pos.z)
          : null,
        geometry: {
          color: colorGeometry,
          depthPrepass: depthGeometry,
          depthTopology: activeDepthTopology,
          prepassSharesColorAttributes: activeDepthPrepasses.length > 0
            && activeDepthPrepasses.every((prepass) => activeStaticBatches.some(
              (source) => source.geometry?.getAttribute?.('position')
                === prepass.geometry?.getAttribute?.('position'),
            )),
        },
      },
      performanceSubject: {
        role: target ? 'cathedral-root' : 'ceres-entry-floor',
        entityId: subject?.id ?? null,
        admission: subject?.presentationAdmission || null,
        assetState: String(subjectRawAssetState || '').startsWith('authored')
          ? 'authored'
          : subjectRawAssetState,
        rawAssetState: subjectRawAssetState,
      },
    };
  }, {
    profileId,
    repetition,
    pairId,
    mapOpenMs,
    sectorEntryMs,
    siteId: PQ020_CATHEDRAL_SITE_ID,
  });
}

async function capturePng(page, name) {
  const file = path.join(ARTIFACT_ROOT, name);
  await page.screenshot({ path: file, type: 'png', animations: 'allow' });
  const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} must be a real PNG`);
  return {
    path: repoRel(file),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function repoRel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function findSystemBrowser() {
  const candidates = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    : process.platform === 'darwin'
      ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
      : ['/usr/bin/google-chrome', '/usr/bin/microsoft-edge', '/usr/bin/chromium'];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}
