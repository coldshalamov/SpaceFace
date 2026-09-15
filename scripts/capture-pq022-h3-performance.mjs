#!/usr/bin/env node

// PQ-022 H3 — matched corridor-asset performance, residency, LOD, and cleanup.
//
// One headed Browser context on fixed seed 47 runs three route cycles over the eleven accepted exact
// corridor identities. Every sector visit samples an ordinary floor window on entry and on exit (no
// accepted identity drawn in frame) and one target window per identity (admitted, default-framed under
// the shipping chase camera). Each target also records admission latency, per-identity draw, triangle,
// material, and program facts, render-package residency bytes, and natural LOD selection at
// close/default/far/distant standoffs. Resource snapshots after every window and at each cycle end
// test whether repeated cycles return to a stable band. Foreign host CPU is sampled for the whole run
// and attributed per window. Timing follows PQ-020 H3: sampleRafWindow with GPU timer queries off,
// then a separate drained GPU attribution segment.
//
// Diagnostic-only iteration flags (refused on a brokered run): --cycles=N, --identities=a,b, --shots.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  PQ022_H3_BUDGETS,
  PQ022_H3_CYCLES,
  PQ022_H3_FIXED_SEED,
  PQ022_H3_IDENTITIES,
  PQ022_H3_PIPELINE_SETTLE_TIMEOUT_MS,
  PQ022_H3_RECEIPT_SCHEMA,
  PQ022_H3_RESULT_CLASSES,
  PQ022_H3_SECTOR_ORDER,
  PQ022_H3_VIEWPORT,
  classifyPq022H3ProbeFailure,
  pq022H3IdentitiesForSector,
  pq022H3WindowId,
  validatePq022H3IncompleteReceipt,
  validatePq022H3PerformanceReceipt,
} from './lib/pq022CorridorH3Performance.mjs';
import {
  PQ022_H3_RELAY_SITE_ID,
  PQ022_H3_ROUTE_DECLARATION,
  attachSeparatedGpuAttribution,
  bootSeededFlight,
  ensureRelayFixture,
  ensureTrafficFixtures,
  enterSectorOwner,
  installPq022H3PageHelpers,
  planTrafficFixtureLayout,
  readGpuContract,
  retireTrafficFixtures,
  waitForAnimationFrames,
  waitForSubjectAdmission,
} from './lib/pq022CorridorH3Route.mjs';
import {
  collectOwnedProcessTreePids,
  sampleRafWindow,
  waitForOwnedProcessTreeExit,
} from './lib/releaseSoakProbe.mjs';
import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import manifest, { createPq022H3PerformanceManifest } from './validation-manifests/pq022-h3-performance.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_ROOT = path.resolve(ROOT, manifest.artifactRoot);
const RECEIPT_PATH = path.join(ARTIFACT_ROOT, 'performance-receipt.json');
const PROGRESS_PATH = path.join(ARTIFACT_ROOT, 'progress.jsonl');
const DIAGNOSTIC = process.argv.includes('--diagnostic');
const SHOTS = process.argv.includes('--shots');
const CYCLES = readIntOption('--cycles') ?? PQ022_H3_CYCLES;
const IDENTITY_FILTER = readListOption('--identities');
// Relay collar presentation id policy: "clean" (acceptance) re-issues the beacon onto a collision-free id;
// "observe" (diagnostic only) keeps whatever id the owner allocator issued and records what the product binds.
const RELAY_ID_POLICY = (process.argv.find((arg) => arg.startsWith('--relay-id-policy=')) || '--relay-id-policy=clean')
  .slice('--relay-id-policy='.length);
assert(['clean', 'observe'].includes(RELAY_ID_POLICY), `unsupported --relay-id-policy=${RELAY_ID_POLICY}`);
const FIXED_SEED = Number(process.env.SF_PROBE_SEED) > 0 ? Number(process.env.SF_PROBE_SEED) : PQ022_H3_FIXED_SEED;
const HOST_SAMPLE_INTERVAL_MS = 2_000;
const POSE_MAX_DRIFT_WU = 4;
const POSE_MAX_SPEED_WU_S = 20;
// Before the Browser launches, wait (bounded) for other processes' Browser-class load to fall under
// the declared contention thresholds; the outcome is recorded, never assumed.
const QUIET_GATE_MAX_WAIT_MS = process.argv.includes('--no-quiet-gate') ? 0 : 600_000;
const QUIET_GATE_SAMPLES = 5;
const BROWSER_CLASS = /^(?:chrome|msedge|msedgewebview2|electron|blender|blender-launcher|blender-mcp)$/i;
// The shared tree is edited live by other agents, so a boot can briefly load a half-written module. Only
// that transient parse/link class is retried (fresh context, bounded, every attempt recorded).
const BOOT_MAX_ATTEMPTS = 4;
const BOOT_RETRY_WAIT_MS = 30_000;
const TRANSIENT_MODULE_ERROR = /SyntaxError|Unexpected (?:token|identifier|end of input|string|number|reserved word)|Invalid or unexpected token|does not provide an export named|Duplicate export|has already been declared|Cannot use import statement|missing \) after argument list/i;

if (!DIAGNOSTIC) {
  assert.equal(CYCLES, PQ022_H3_CYCLES, '--cycles is a diagnostic-only iteration flag');
  assert.equal(IDENTITY_FILTER, null, '--identities is a diagnostic-only iteration flag');
  assert.equal(SHOTS, false, '--shots is a diagnostic-only iteration flag');
  assert.equal(RELAY_ID_POLICY, 'clean', '--relay-id-policy=observe is a diagnostic-only flag');
}

const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest: createPq022H3PerformanceManifest(),
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[pq022-h3-performance] BROKER_CLAIM_REQUIRED: ${brokerGate.reason} (${brokerGate.detail || 'no detail'})`);
  console.error('[pq022-h3-performance] invoke via: node scripts/validation-broker-cli.mjs --manifest pq022-h3-performance');
  console.error('[pq022-h3-performance] or pass --diagnostic for non-promoting local inspection');
  process.exit(2);
}

await mkdir(ARTIFACT_ROOT, { recursive: true });
if (SHOTS) await mkdir(path.join(ARTIFACT_ROOT, 'shots'), { recursive: true });
await writeFile(PROGRESS_PATH, '', 'utf8');

const startedAtEpochMs = Date.now();
const identityInputs = await readIdentityInputs();
const identityInputByKey = new Map(identityInputs.map((row) => [row.key, row]));
const residencyKeysByIdentity = Object.fromEntries(identityInputs.map((row) => [row.key, row.renderPackage.residencyKey]));

const ownedPids = new Set([process.pid]);
const hostSampler = startHostLoadSampler({ intervalMs: HOST_SAMPLE_INTERVAL_MS });
ownedPids.add(hostSampler.pid);
await hostSampler.waitForSamples(3, 20_000);
const preflightHostLoad = summarizeHostSpan(hostSampler.samples, 0, hostSampler.samples.length - 1, ownedPids);
const hostQuietGate = QUIET_GATE_MAX_WAIT_MS > 0
  ? await waitForQuietHost({ maxWaitMs: QUIET_GATE_MAX_WAIT_MS, quietSamples: QUIET_GATE_SAMPLES })
  : { enabled: false };
if (hostQuietGate.enabled) {
  console.log(`[pq022-h3] host quiet gate: quiet=${hostQuietGate.quiet} waited=${Math.round(hostQuietGate.waitedMs / 1000)}s`);
}

let server = null;
let browser = null;
let context = null;
let page = null;
let issueTracker = null;
let receipt = null;
let gpu = null;
let recordedSeed = null;
let activePhase = 'bootstrap';
let timeOrigin = null;
let browserClosed = false;
let serverClosed = false;
let processTreeExit = null;
const windows = [];
const identityFacts = [];
const snapshots = [];
const cycleEnds = [];
const sectorEntries = [];
const fixtures = [];
const discardedWindows = [];
const admissionTimeouts = [];
const fixtureLosses = [];
const relayWatches = [];
const relayObservations = [];
let activeRelay = null;
const bootAttempts = [];
const issuedTrafficRecordIds = new Set();
let trafficIssuance = 0;
const processTrees = [];

try {
  server = await acquireVisualProbeServer({ root: ROOT });
  const executablePath = findSystemBrowser();
  assert(executablePath, 'headed Chrome or Edge is required for PQ-022 H3');
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
      `--window-size=${PQ022_H3_VIEWPORT.width},${PQ022_H3_VIEWPORT.height}`,
      '--force-device-scale-factor=1',
    ],
  });
  for (let attempt = 1; ; attempt += 1) {
    context = await browser.newContext({
      viewport: { width: PQ022_H3_VIEWPORT.width, height: PQ022_H3_VIEWPORT.height },
      screen: { width: PQ022_H3_VIEWPORT.width, height: PQ022_H3_VIEWPORT.height },
      deviceScaleFactor: PQ022_H3_VIEWPORT.deviceScaleFactor,
      locale: 'en-US',
      colorScheme: 'dark',
      reducedMotion: 'no-preference',
    });
    page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);
    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    });
    issueTracker = collectPageIssues(page, { includeWarnings: false });

    activePhase = 'seeded-new-game';
    try {
      recordedSeed = await bootSeededFlight(page, server.baseUrl, FIXED_SEED);
      bootAttempts.push({ attempt, ok: true, atEpochMs: Date.now() });
      break;
    } catch (error) {
      const issues = summarizeIssues(issueTracker.errorIssues());
      const transientModuleError = issues.some((issue) => TRANSIENT_MODULE_ERROR.test(String(issue?.text ?? issue?.message ?? '')));
      bootAttempts.push({
        attempt,
        ok: false,
        atEpochMs: Date.now(),
        error: String(error?.message || error).slice(0, 400),
        issues: issues.slice(0, 5),
        transientModuleError,
      });
      if (!transientModuleError || attempt >= BOOT_MAX_ATTEMPTS) throw error;
      await progress({ event: 'boot-retry', attempt, issues: issues.slice(0, 3) });
      await context.close().catch(() => {});
      context = null;
      page = null;
      issueTracker = null;
      await delay(BOOT_RETRY_WAIT_MS);
    }
  }
  assert.equal(recordedSeed, FIXED_SEED, 'New Game must consume the fixed seed');
  const bootReadyPerfMs = await page.evaluate(() => performance.now());
  timeOrigin = await page.evaluate(() => performance.timeOrigin);

  activePhase = 'gpu-contract';
  gpu = await readGpuContract(page);
  assert.equal(gpu.available, true, 'PQ-022 H3 requires WebGL');
  assert.doesNotMatch(gpu.renderer || '', /SwiftShader|llvmpipe|software/i,
    `PQ-022 H3 requires the real GPU path, got ${gpu.renderer}`);

  await installPq022H3PageHelpers(page, PQ022_H3_IDENTITIES.map((row) => ({
    key: row.key,
    releaseFile: row.releaseFile,
    slot: row.slot,
  })));
  await recordProcessTree('boot');
  snapshots.push(await resourceSnapshot('boot', 0));

  const lastEntryBySector = new Map([[PQ022_H3_SECTOR_ORDER[0], {
    sectorId: PQ022_H3_SECTOR_ORDER[0],
    fromSectorId: null,
    moved: false,
    kind: 'new-game-spawn',
    calledAtPerfMs: bootReadyPerfMs,
  }]]);
  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    for (const sectorId of PQ022_H3_SECTOR_ORDER) {
      activePhase = `c${cycle}:${sectorId}:enter`;
      const currentSectorId = await page.evaluate(() => window.SF.state.world.currentSectorId);
      if (currentSectorId !== sectorId) {
        const entry = await enterSectorOwner(page, sectorId);
        lastEntryBySector.set(sectorId, { ...entry, kind: 'world-owner-enter' });
      }
      const entry = lastEntryBySector.get(sectorId);
      sectorEntries.push({
        cycle,
        ...entry,
        stationPositions: await page.evaluate(() => window.__PQ022_H3__.stationPositions()),
      });

      activePhase = `c${cycle}:${sectorId}:floor-pose`;
      await page.evaluate((opts) => window.__PQ022_H3__.pipelineSettle(opts), { stableMs: 2_000, timeoutMs: 60_000 });
      const trafficSector = pq022H3IdentitiesForSector(sectorId).some((row) => row.subject.kind === 'traffic-fixture');
      if (trafficSector && issuedTrafficRecordIds.size > 0) {
        // A straggler from an earlier visit (live, or shelved in the far-actor table) is promoted and retired
        // before any window here, so no floor or target ever carries a previous cycle's fixture.
        activePhase = `c${cycle}:${sectorId}:fixture-sweep`;
        const sweep = await retireTrafficFixtures(page, {
          worldRecordIds: [...issuedTrafficRecordIds],
          reason: 'pq022-h3-fixture-sweep',
        });
        fixtures.push({ cycle, kind: 'corridor-traffic-sweep', phase: 'visit-start', ...sweep });
        await progress({ event: 'fixture-sweep', cycle, retired: sweep.retired.length, promotedFarRows: sweep.promotedFarRows.length });
        activePhase = `c${cycle}:${sectorId}:floor-pose`;
      }
      const floorChoice = await page.evaluate(() => window.__PQ022_H3__.chooseFloorPose());
      assert(floorChoice.pose, `no collision-safe floor pose in ${sectorId}`);
      const floorPose = { x: floorChoice.pose.x, z: floorChoice.pose.z };
      const floorInPlacement = await settlePose(floorPose, sectorId, `c${cycle}:${sectorId}:floor-in`);
      await runWindow({
        cycle,
        sectorId,
        kind: 'floor-in',
        pose: {
          ...floorChoice.pose,
          candidates: floorChoice.candidates,
          ring: floorChoice.ring,
          drift: floorInPlacement.drift,
        },
      });

      const fixtureContext = { relaySiteId: PQ022_H3_RELAY_SITE_ID, trafficIds: null, trafficRecordIds: null };
      for (const identity of pq022H3IdentitiesForSector(sectorId)) {
        if (IDENTITY_FILTER && !IDENTITY_FILTER.includes(identity.key)) continue;
        if (identity.subject.kind === 'relay-fixture') {
          await issueRelayFixture({ cycle, identity });
          await measureRelayTarget({ cycle, identity, entry, fixtureContext });
          continue;
        }
        if (identity.subject.kind === 'traffic-fixture') {
          if (!fixtureContext.trafficIds) await issueTrafficFixtures({ cycle, identity, fixtureContext });
          let intact = await readTrafficIntact(identity, fixtureContext);
          for (let reissue = 0; !intact.intact && reissue < 2; reissue += 1) {
            await issueTrafficFixtures({ cycle, identity, fixtureContext, reissueFor: identity.subject.role, reason: intact.reason });
            intact = await readTrafficIntact(identity, fixtureContext);
          }
          assert(intact.intact, `${identity.key} fixture identity could not be kept intact: ${intact.reason}`);
          await measureTrafficTarget({ cycle, identity, entry, fixtureContext });
          continue;
        }
        await measureTarget({ cycle, identity, entry, fixtureContext });
      }

      if (fixtureContext.trafficIds) {
        // Retire this visit's fixtures while they are still live beside the player, so none is shelved,
        // captured into a durable record, or restored into a later cycle, and floor-out matches floor-in.
        activePhase = `c${cycle}:${sectorId}:fixture-retire`;
        const retire = await retireTrafficFixtures(page, {
          worldRecordIds: [...issuedTrafficRecordIds],
          reason: 'pq022-h3-fixture-retire',
        });
        fixtures.push({ cycle, kind: 'corridor-traffic-retire', phase: 'visit-end', ...retire });
        await progress({ event: 'fixture-retire', cycle, retired: retire.retired.length, promotedFarRows: retire.promotedFarRows.length });
      }

      activePhase = `c${cycle}:${sectorId}:floor-out`;
      const floorOutPlacement = await settlePose(floorPose, sectorId, `c${cycle}:${sectorId}:floor-out`);
      await runWindow({
        cycle,
        sectorId,
        kind: 'floor-out',
        pose: { ...floorChoice.pose, reusedFromFloorIn: true, drift: floorOutPlacement.drift },
      });
    }

    activePhase = `c${cycle}:cycle-end`;
    const endEntry = await enterSectorOwner(page, PQ022_H3_SECTOR_ORDER[0]);
    lastEntryBySector.set(PQ022_H3_SECTOR_ORDER[0], { ...endEntry, kind: 'world-owner-enter' });
    const endSettle = await page.evaluate((opts) => window.__PQ022_H3__.pipelineSettle(opts), { stableMs: 5_000, timeoutMs: 120_000 });
    const endSnapshot = await resourceSnapshot(`c${cycle}:cycle-end`, cycle);
    endSnapshot.settle = endSettle;
    snapshots.push(endSnapshot);
    cycleEnds.push({ cycle, snapshot: endSnapshot });
    await recordProcessTree(`c${cycle}:cycle-end`);
    await progress({ event: 'cycle-end', cycle, snapshot: pickSnapshot(endSnapshot) });
  }

  const pageIssues = summarizeIssues(issueTracker.errorIssues());
  receipt = {
    schema: PQ022_H3_RECEIPT_SCHEMA,
    disposition: 'MEASURED',
    fixedSeed: FIXED_SEED,
    recordedSeed,
    viewport: { ...PQ022_H3_VIEWPORT },
    runtime: 'browser-chromium-headed',
    gpu,
    qualityPreserving: {
      settingsOverridesApplied: false,
      defaultQualityRetained: true,
      performanceImprovementClaimed: false,
      absoluteTargetClaimed: false,
      absoluteBudgetWaiverGranted: false,
      cullingOrLodOverridesApplied: false,
    },
    broker: brokerEvidence(brokerGate),
    diagnosticIteration: { cycles: CYCLES, identityFilter: IDENTITY_FILTER, shots: SHOTS, relayIdPolicy: RELAY_ID_POLICY },
    route: {
      cycleCount: CYCLES,
      singleContext: true,
      declaredRoute: PQ022_H3_ROUTE_DECLARATION.declaredRoute,
      compressions: PQ022_H3_ROUTE_DECLARATION.compressions,
      retainedEvidenceReferences: PQ022_H3_ROUTE_DECLARATION.retainedEvidenceReferences,
      sectorEntries,
      fixtures,
      discardedWindows,
      admissionTimeouts,
      fixtureLosses,
      bootAttempts,
      relayIdPolicy: RELAY_ID_POLICY,
      relayWatches,
      relayObservations,
    },
    identities: identityInputs,
    windows,
    identityFacts,
    resources: { snapshots, cycleEnds },
    pageIssues,
    cleanup: { browserClosed: false, serverClosed: false, hostSamplerStopped: false },
  };
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(ARTIFACT_ROOT, 'failure-active.png'), type: 'png', animations: 'allow' }).catch(() => {});
  }
  const classification = classifyPq022H3ProbeFailure(error, {
    phase: activePhase,
    completedWindowCount: windows.length,
  });
  const failureState = page && !page.isClosed()
    ? await page.evaluate(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state?.playerId);
      return {
        mode: state?.mode ?? null,
        sectorId: state?.world?.currentSectorId ?? null,
        player: player ? { x: player.pos.x, z: player.pos.z, hull: player.hull, alive: player.alive !== false } : null,
        jumpState: state?.jump?.state ?? null,
        docked: state?.ui?.docked === true,
      };
    }).catch((readError) => ({ readError: String(readError) }))
    : null;
  receipt = {
    schema: PQ022_H3_RECEIPT_SCHEMA,
    runtime: 'browser-chromium-headed',
    disposition: 'FAIL',
    ...classification,
    problems: [classification.problem],
    stack: error?.stack || null,
    failureState,
    fixedSeed: FIXED_SEED,
    recordedSeed,
    gpu,
    broker: brokerEvidence(brokerGate),
    completedWindows: windows.map((row) => ({ windowId: row.windowId, p95: row.attribution?.frameMs?.p95 ?? null })),
    route: {
      cycleCount: CYCLES,
      sectorEntries,
      fixtures,
      discardedWindows,
      admissionTimeouts,
      fixtureLosses,
      bootAttempts,
      relayIdPolicy: RELAY_ID_POLICY,
      relayWatches,
      relayObservations,
    },
    identityFacts,
    resources: { snapshots, cycleEnds },
    pageIssues: issueTracker ? summarizeIssues(issueTracker.errorIssues()) : [],
  };
} finally {
  const chromeRoots = processTrees.length
    ? [...new Set(processTrees.flatMap((row) => row.chromeRoots))]
    : [];
  const chromePids = [...new Set(processTrees.flatMap((row) => row.chromePids))];
  await context?.close().catch(() => {});
  if (browser) {
    try { await browser.close(); browserClosed = true; } catch (_) { browserClosed = false; }
  } else browserClosed = true;
  if (server) {
    try { await server.close(); serverClosed = true; } catch (_) { serverClosed = false; }
  } else serverClosed = true;
  if (process.platform === 'win32' && chromeRoots.length > 0) {
    processTreeExit = [];
    for (const rootPid of chromeRoots) {
      processTreeExit.push(await waitForOwnedProcessTreeExit({
        rootPid,
        initialPids: chromePids,
        timeoutMs: 10_000,
        pollMs: 500,
      }).catch((error) => ({ available: false, pass: false, rootPid, error: String(error?.message || error) })));
    }
  }
}

const hostSamplerStopped = await hostSampler.stop();
receipt.cleanup = {
  browserClosed,
  serverClosed,
  hostSamplerStopped,
  ownedProcessTreeExited: Array.isArray(processTreeExit) ? processTreeExit.every((row) => row.pass === true) : null,
  processTreeExit,
};
receipt.hostLoad = buildHostLoad({ preflightHostLoad, windows, identityFacts, ownedPids });
receipt.hostLoad.quietGate = hostQuietGate;
receipt.durationMs = Date.now() - startedAtEpochMs;

let validation;
if (receipt.productEvidenceValid === false) {
  validation = validatePq022H3IncompleteReceipt(receipt);
  receipt.disposition = 'FAIL';
} else {
  validation = validatePq022H3PerformanceReceipt(receipt);
  receipt.resultClass = validation.resultClass;
  receipt.disposition = validation.resultClass === PQ022_H3_RESULT_CLASSES.PASS
    ? 'PASS'
    : validation.resultClass === PQ022_H3_RESULT_CLASSES.DIAGNOSTIC_PASS
      ? 'DIAGNOSTIC_PASS'
      : 'FAIL';
  if (receipt.disposition === 'FAIL') receipt.problems = validation.failures;
}
receipt.validation = validation;

await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

console.log(`[pq022-h3-performance] ${receipt.disposition}${receipt.resultClass ? ` (${receipt.resultClass})` : ''}`);
for (const problem of (receipt.problems || []).slice(0, 40)) console.log(`  - ${problem}`);
if (Array.isArray(validation.matched)) {
  for (const row of validation.matched) {
    console.log(`  ${row.key.padEnd(18)} p95 target ${fmt(row.targetMedianP95Ms)} floor ${fmt(row.floorMedianP95Ms)} delta ${fmt(row.medianDeltaP95Ms)} | >50 product ${row.targetProductAttributedAbove50Ms} | hitches ${row.targetProductAttributedHitches}/${row.floorProductAttributedHitchRef}`);
  }
}
console.log(`  receipt: ${repoRel(RECEIPT_PATH)}`);
process.exit(receipt.disposition === 'PASS' || receipt.disposition === 'DIAGNOSTIC_PASS' ? 0 : 1);

// ---------------------------------------------------------------------------------------------

async function measureTarget({ cycle, identity, entry, fixtureContext }) {
  const input = identityInputByKey.get(identity.key);
  activePhase = `c${cycle}:${identity.key}:locate`;
  const subjectId = await locateSubject(identity, fixtureContext);

  activePhase = `c${cycle}:${identity.key}:approach`;
  const firstPlan = await page.evaluate((id) => window.__PQ022_H3__.planFraming(id), subjectId);
  const approachStartedAtPerfMs = await page.evaluate(() => performance.now());
  const approachPlacement = await placeStable({
    plan: firstPlan,
    standoff: firstPlan.default.standoff,
    sectorId: identity.sectorId,
    label: `c${cycle}:${identity.key}:approach`,
  });
  const admission = await waitForSubjectAdmission(page, {
    subjectId,
    releaseFile: identity.releaseFile,
    approachStartedAtPerfMs,
    anchorPose: approachPlacement.position,
    sectorId: identity.sectorId,
  });
  // The admission wait runs outside any timed window; its epoch range lets host load be attributed to it.
  const admissionEndPerfMs = admission.path === 'timeout'
    ? Number(admission.lastState?.atPerfMs)
    : Number(admission.readyAtPerfMs);
  const admissionEpochRange = Number.isFinite(timeOrigin) && Number.isFinite(approachStartedAtPerfMs)
    && Number.isFinite(admissionEndPerfMs)
    ? { startMs: timeOrigin + approachStartedAtPerfMs, endMs: timeOrigin + Math.max(admissionEndPerfMs, approachStartedAtPerfMs) }
    : null;
  if (admission.path === 'timeout') {
    // The subject stayed present, posed, and pending through the ceiling. That is a measured product
    // outcome for this identity and cycle: record it with what is resident, skip the target window and
    // LOD framings, and continue the route so the other identities, floors, and cleanup band stay valid.
    const timeoutSectorId = await page.evaluate(() => window.SF.state.world.currentSectorId);
    assert.equal(timeoutSectorId, identity.sectorId,
      `${identity.key} approach changed sector membership to ${timeoutSectorId}`);
    const windowId = pq022H3WindowId({ cycle, sectorId: identity.sectorId, kind: 'target', identityKey: identity.key });
    const subject = await page.evaluate(({ id, file }) => window.__PQ022_H3__.subjectFacts(id, file), {
      id: subjectId,
      file: identity.releaseFile,
    });
    const timeoutJob = await page.evaluate(({ id, file }) => window.__PQ022_H3__.ownerJob(id, file), { id: subjectId, file: identity.releaseFile });
    const timeoutEntries = await page.evaluate(({ dir, file }) => window.__PQ022_H3__.resourceEntries(dir, file), {
      dir: identity.renderPackage,
      file: identity.releaseFile,
    });
    const timeoutResources = await page.evaluate(({ id, key }) => window.__PQ022_H3__.identityResources(id, key), {
      id: subjectId,
      key: input.renderPackage.residencyKey,
    });
    admissionTimeouts.push({
      windowId,
      identityKey: identity.key,
      cycle,
      subjectId,
      timedOutAfterMs: admission.timedOutAfterMs,
      ceilingMs: admission.ceilingMs,
      explicitRequestAccepted: admission.explicitRequestAccepted ?? null,
      lastState: admission.lastState,
    });
    identityFacts.push({
      key: identity.key,
      cycle,
      sectorId: identity.sectorId,
      subjectId,
      subjectGlobalPos: subject?.globalPos ?? null,
      subjectHomeSectorId: subject?.homeSectorId ?? null,
      admission: {
        ready: false,
        assetState: subject?.assetState ?? null,
        rawAssetState: subject?.rawAssetState ?? null,
        assetMode: subject?.assetMode ?? null,
        fallbackRetained: subject?.fallbackRetained ?? null,
        releaseBound: subject?.releaseBound === true,
        path: 'timeout',
        approachToReadyMs: null,
        timedOutAfterMs: admission.timedOutAfterMs,
        ceilingMs: admission.ceilingMs,
        sectorEntryToReadyMs: null,
        sectorEntryKind: entry?.kind ?? null,
        explicitRequestAtPerfMs: admission.explicitRequestAtPerfMs ?? null,
        explicitRequestAccepted: admission.explicitRequestAccepted ?? null,
        lastState: admission.lastState,
        epochRange: admissionEpochRange,
        ownerJob: timeoutJob,
        resourceEntries: timeoutEntries,
      },
      resources: timeoutResources,
      lod: null,
      framing: { approachAttempts: approachPlacement.attempts },
    });
    await progress({
      event: 'admission-timeout',
      cycle,
      key: identity.key,
      windowId,
      timedOutAfterMs: round(admission.timedOutAfterMs),
      admission: admission.lastState?.admission ?? null,
      rawAssetState: admission.lastState?.rawAssetState ?? null,
    });
    return;
  }
  const approachSectorId = await page.evaluate(() => window.SF.state.world.currentSectorId);
  assert.equal(approachSectorId, identity.sectorId,
    `${identity.key} approach changed sector membership to ${approachSectorId}`);
  const ownerJob = await page.evaluate(({ id, file }) => window.__PQ022_H3__.ownerJob(id, file), { id: subjectId, file: identity.releaseFile });
  const resourceEntries = await page.evaluate(({ dir, file }) => window.__PQ022_H3__.resourceEntries(dir, file), {
    dir: identity.renderPackage,
    file: identity.releaseFile,
  });

  activePhase = `c${cycle}:${identity.key}:frame`;
  const plan = await page.evaluate((id) => window.__PQ022_H3__.planFraming(id), subjectId);
  let framePlacement = await placeStable({
    plan,
    standoff: Math.max(plan.default.standoff, approachPlacement.standoff),
    sectorId: identity.sectorId,
    label: `c${cycle}:${identity.key}:default`,
  });
  let windowRow = null;
  // A window in which the player was struck (docking traffic, drifting bodies) is contaminated by
  // contact work and cannot be product evidence. It is discarded, recorded, and re-run from a
  // standoff 60 WU further out; the retry decision reads only the impact census, never timing.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    windowRow = await runWindow({
      cycle,
      sectorId: identity.sectorId,
      kind: 'target',
      identity,
      subjectId,
      pose: {
        ...framePlacement.position,
        standoff: framePlacement.standoff,
        plannedStandoff: plan.default.standoff,
        framedStandoffs: plan.framedStandoffs,
        placementAttempts: framePlacement.attempts,
        windowAttempt: attempt + 1,
      },
    });
    const impactsDuring = Number(windowRow.routeFacts.frame.end.playerImpacts)
      - Number(windowRow.routeFacts.frame.start.playerImpacts);
    if (!(impactsDuring > 0) || attempt === 2) break;
    windows.pop();
    discardedWindows.push({
      windowId: windowRow.windowId,
      attempt: attempt + 1,
      reason: 'player-impacts-during-window',
      impactsDuring,
      lastImpact: windowRow.routeFacts.frame.end.lastPlayerImpact || null,
      standoff: framePlacement.standoff,
    });
    framePlacement = await placeStable({
      plan,
      standoff: framePlacement.standoff + 60,
      sectorId: identity.sectorId,
      label: `c${cycle}:${identity.key}:default-retry-${attempt + 1}`,
    });
  }
  const resources = await page.evaluate(({ id, key }) => window.__PQ022_H3__.identityResources(id, key), {
    id: subjectId,
    key: input.renderPackage.residencyKey,
  });

  activePhase = `c${cycle}:${identity.key}:lod`;
  const startSubject = windowRow.routeFacts.frame.start.subject;
  const endSubject = windowRow.routeFacts.frame.end.subject;
  const framings = {
    default: {
      level: endSubject?.lodLevel ?? null,
      px: endSubject?.lodPx ?? null,
      standoff: framePlacement.standoff,
      plannedCameraDistance: plan.default.cameraDistance,
      cameraDistance: endSubject?.cameraDistance ?? null,
      inFrame: endSubject?.inFrame === true,
      drawn: endSubject?.drawn === true,
      centerNdc: endSubject?.centerNdc ?? null,
    },
  };
  // Close starts at the planned minimum separation and steps out until collision-free. Far and
  // distant start beyond the collision-free default standoff so a large collision envelope cannot
  // collapse them onto the default pose. The renderer re-resolves LOD only for bodies it still
  // processes, so each reading records whether its projected width actually changed.
  let previousPx = framings.default.px;
  for (const framing of ['close', 'far', 'distant']) {
    const target = plan[framing];
    const startStandoff = framing === 'close'
      ? target.standoff
      : framing === 'far'
        ? Math.max(target.standoff, framePlacement.standoff + 60)
        : Math.max(target.standoff, framePlacement.standoff + 600);
    const placement = await placeStable({
      plan,
      standoff: startStandoff,
      sectorId: identity.sectorId,
      label: `c${cycle}:${identity.key}:lod-${framing}`,
    });
    await waitForAnimationFrames(page, 12);
    const facts = await page.evaluate(({ id, file }) => window.__PQ022_H3__.subjectFacts(id, file), {
      id: subjectId,
      file: identity.releaseFile,
    });
    framings[framing] = {
      level: facts.lodLevel,
      px: facts.lodPx,
      resolvedByRenderer: facts.lodResolvedByRenderer === true,
      pooledPresentation: facts.pooledPresentation === true,
      pxChangedSincePrevious: Number.isFinite(facts.lodPx) && Number.isFinite(previousPx)
        ? Math.abs(facts.lodPx - previousPx) > 1e-6
        : null,
      standoff: placement.standoff,
      plannedStandoff: target.standoff,
      placementAttempts: placement.attempts.length,
      plannedCameraDistance: target.cameraDistance,
      cameraDistance: facts.cameraDistance,
      inFrame: facts.inFrame,
      drawn: facts.drawn === true,
      centerNdc: facts.centerNdc,
    };
    previousPx = facts.lodPx;
  }
  await placeStable({
    plan,
    standoff: framePlacement.standoff,
    sectorId: identity.sectorId,
    label: `c${cycle}:${identity.key}:return`,
  });
  if (SHOTS) {
    await waitForAnimationFrames(page, 20);
    await page.screenshot({
      path: path.join(ARTIFACT_ROOT, 'shots', `${windowRow.windowId.replace(/[^a-z0-9_-]+/gi, '_')}.png`),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
  }

  identityFacts.push({
    key: identity.key,
    cycle,
    sectorId: identity.sectorId,
    subjectId,
    subjectGlobalPos: startSubject?.globalPos ?? null,
    subjectHomeSectorId: startSubject?.homeSectorId ?? null,
    admission: {
      ready: startSubject?.admission === 'ready' && endSubject?.admission === 'ready',
      assetState: startSubject?.assetState ?? null,
      assetMode: startSubject?.assetMode ?? null,
      fallbackRetained: startSubject?.fallbackRetained ?? null,
      releaseBound: startSubject?.releaseBound === true && endSubject?.releaseBound === true,
      path: admission.path,
      approachToReadyMs: admission.approachToReadyMs,
      sectorEntryToReadyMs: Number.isFinite(entry?.calledAtPerfMs) ? admission.readyAtPerfMs - entry.calledAtPerfMs : null,
      sectorEntryKind: entry?.kind ?? null,
      explicitRequestAtPerfMs: admission.explicitRequestAtPerfMs ?? null,
      epochRange: admissionEpochRange,
      ownerJob,
      resourceEntries,
    },
    resources,
    lod: {
      order: ['default', 'close', 'far', 'distant'],
      window: { start: startSubject?.lodLevel ?? null, end: endSubject?.lodLevel ?? null },
      framings,
      h1ForcedStillLevels: { close: 'lod0', default: 'lod1', far: 'lod2' },
    },
    framing: {
      approachAttempts: approachPlacement.attempts,
      defaultAttempts: framePlacement.attempts,
      minSeparation: plan.minSeparation,
      visualRadius: plan.visualRadius,
      framedStandoffs: plan.framedStandoffs,
      cameraForward: plan.cameraForward,
      cameraOffset: plan.cameraOffset,
    },
  });
  await progress({
    event: 'identity',
    cycle,
    key: identity.key,
    path: admission.path,
    approachToReadyMs: round(admission.approachToReadyMs),
    lod: Object.fromEntries(Object.entries(framings).map(([name, row]) => [name, `${row.level}@${round(row.px)}px`])),
    gpuResidentBytes: resources.residency?.gpuResidentBytes ?? null,
    triangles: resources.triangles,
    drawGroups: resources.drawGroups,
    visibleMeshes: resources.visibleMeshes,
  });
}

async function runWindow({ cycle, sectorId, kind, identity = null, subjectId = null, pose = null }) {
  const windowId = pq022H3WindowId({ cycle, sectorId, kind, identityKey: identity?.key || null });
  activePhase = windowId;
  // The relay id watch samples in the page; it never runs inside a timing window.
  if (identity?.subject?.kind === 'relay-fixture') await stopRelayWatch('window-start');
  await page.bringToFront().catch(() => {});
  const settle = await page.evaluate((opts) => window.__PQ022_H3__.pipelineSettle(opts), { stableMs: 1_500, timeoutMs: 90_000 });
  const releaseFile = identity?.releaseFile || null;
  const start = await page.evaluate(({ id, file }) => window.__PQ022_H3__.census(id, file), { id: subjectId, file: releaseFile });
  const timing = await sampleRafWindow(page, {
    phaseTag: kind === 'target' ? 'station_visible_steady' : 'flight_steady',
    warmupMs: 2_000,
    pipelineStableMs: 5_000,
    pipelineSettleTimeoutMs: PQ022_H3_PIPELINE_SETTLE_TIMEOUT_MS,
    sampleMs: 5_000,
    enableGpuTimers: false,
    requireAuthoredFlight: true,
    requireDocked: false,
  });
  const end = await page.evaluate(({ id, file }) => window.__PQ022_H3__.census(id, file), { id: subjectId, file: releaseFile });
  await attachSeparatedGpuAttribution(page, timing);
  const samples = timing.samples || [];
  const epochRange = samples.length
    ? { startMs: timeOrigin + samples[0].atMs, endMs: timeOrigin + samples[samples.length - 1].atMs }
    : null;
  const row = {
    windowId,
    rawSamples: samples,
    attribution: timing.attribution,
    epochRange,
    routeFacts: {
      windowId,
      cycle,
      sectorId,
      kind,
      identityKey: identity?.key ?? null,
      subjectId,
      recordedSeed,
      mode: end.mode,
      docked: end.docked,
      cameraZoom: start.cameraZoom,
      cameraFov: start.cameraFov,
      pose,
      preSettle: settle,
      frame: { start, end },
    },
  };
  windows.push(row);
  const snapshot = await resourceSnapshot(windowId, cycle);
  snapshots.push(snapshot);
  await progress({
    event: 'window',
    windowId,
    samples: timing.attribution?.frameMs?.sampleCount ?? null,
    p50: round(timing.attribution?.frameMs?.p50),
    p95: round(timing.attribution?.frameMs?.p95),
    p99: round(timing.attribution?.frameMs?.p99),
    max: round(timing.attribution?.frameMs?.max),
    over32: timing.attribution?.frameMs?.hitchesOver32Ms ?? null,
    calls: timing.attribution?.draw?.calls ?? null,
    triangles: timing.attribution?.draw?.triangles ?? null,
    warmupPass: timing.attribution?.pipeline?.warmup?.pass ?? null,
    inFrameStart: start.identitiesInFrame,
    inFrameEnd: end.identitiesInFrame,
    subjectInFrame: identity ? [start.subject?.inFrame, end.subject?.inFrame] : null,
    subjectDrawn: identity ? [start.subject?.drawn, end.subject?.drawn] : null,
    preSettle: { settled: settle.settled, ms: round(settle.elapsedMs) },
    gpuResidentBytes: snapshot.gpuResidentBytes,
    textures: snapshot.textures,
    heapMb: snapshot.heapUsedBytes ? Math.round(snapshot.heapUsedBytes / 1048576) : null,
  });
  return row;
}

async function locateSubject(identity, fixtureContext) {
  const handle = await page.waitForFunction(({ row, contextValue }) => {
    const id = window.__PQ022_H3__.locate(row, contextValue);
    return id == null ? false : id;
  }, { row: { key: identity.key, sectorId: identity.sectorId, subject: identity.subject }, contextValue: fixtureContext }, {
    timeout: 60_000,
    polling: 250,
  });
  return handle.jsonValue();
}

async function placePlayer(position, expectedSectorId) {
  assert(expectedSectorId, 'every pose placement must name the sector it has to stay in');
  const placed = await page.evaluate(({ x, z }) => window.__PQ022_H3__.placePlayer(x, z), position);
  await waitForAnimationFrames(page, 4);
  const sectorId = await page.evaluate(() => window.SF.state.world.currentSectorId);
  assert.equal(sectorId, expectedSectorId,
    `pose ${Math.round(position.x)},${Math.round(position.z)} changed sector membership to ${sectorId}`);
  return placed;
}

// A pose that overlaps a real collider is depenetrated by physics and can launch the ship across the
// map: one diagnostic pose about 67 WU from the Helios trade hub centre flung the player 2.5 million
// WU into another sector. Every pose is verified still before anything is measured, and an unstable
// target pose steps outward along the same framing axis.
async function readPoseDrift(position) {
  return page.evaluate(async ({ x, z }) => {
    const before = window.__PQ022_H3__.impacts().count;
    for (let index = 0; index < 12; index += 1) {
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    }
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const after = window.__PQ022_H3__.impacts();
    return {
      displacement: Math.hypot(player.pos.x - x, player.pos.z - z),
      speed: Math.hypot(player.vel?.x || 0, player.vel?.z || 0),
      hull: Number(player.hull),
      impacts: after.count - before,
      lastImpact: after.count > before ? after.last : null,
      sectorId: state.world.currentSectorId,
    };
  }, position);
}

async function settlePose(position, sectorId, label) {
  await placePlayer(position, sectorId);
  const drift = await readPoseDrift(position);
  if (drift.displacement > POSE_MAX_DRIFT_WU || drift.speed > POSE_MAX_SPEED_WU_S
      || drift.impacts > 0 || drift.sectorId !== sectorId) {
    throw new Error(`${label}: pose ${Math.round(position.x)},${Math.round(position.z)} is not stable: ${JSON.stringify(drift)}`);
  }
  return { position, drift };
}

// The relay collar beacon is a harness-issued dressing row whose presentation id is shared with entities,
// far-actor rows, and field rocks. Issuance applies the relay id policy, and the id is watched from issue until
// its target window opens so any change of ownership is recorded with its census.
async function issueRelayFixture({ cycle, identity, reissueFor = null, reason = null }) {
  activePhase = `c${cycle}:${identity.key}:${reissueFor ? 'fixture-reissue' : 'fixture'}`;
  await stopRelayWatch(reissueFor ? 'reissue' : 'issue');
  const relay = await ensureRelayFixture(page, PQ022_H3_RELAY_SITE_ID, {
    policy: RELAY_ID_POLICY,
    releaseFile: identity.releaseFile,
  });
  assert(!relay.error, `relay fixture failed: ${relay.error} ${JSON.stringify(relay.collided || []).slice(0, 600)}`);
  fixtures.push({ cycle, kind: 'relay-collar', reissueFor, reason, ...relay });
  await progress({
    event: 'relay-fixture',
    cycle,
    relayKey: relay.relayKey,
    policy: relay.policy,
    reused: relay.reused,
    issueAttempts: relay.issueAttempts,
    collisions: relay.collided.map((row) => ({
      id: row.id,
      otherHolders: row.ownership?.otherHolders ?? null,
      mesh: row.ownership?.mesh?.body ?? null,
    })),
    clean: relay.ownership?.clean ?? null,
    otherHolders: relay.ownership?.otherHolders ?? null,
  });
  await page.evaluate(({ key, file }) => window.__PQ022_H3__.startIdWatch(key, file), {
    key: relay.relayKey,
    file: identity.releaseFile,
  });
  activeRelay = { cycle, key: relay.relayKey, identityKey: identity.key };
  return relay;
}

async function stopRelayWatch(reason) {
  if (!activeRelay || !page || page.isClosed()) return null;
  const current = activeRelay;
  activeRelay = null;
  const watch = await page.evaluate(({ key, why }) => window.__PQ022_H3__.stopIdWatch(key, why), {
    key: current.key,
    why: reason,
  }).catch((error) => ({ key: current.key, stopReason: reason, error: String(error?.message || error) }));
  if (watch) relayWatches.push({ cycle: current.cycle, identityKey: current.identityKey, ...watch });
  return watch;
}

// A relay collar whose presentation id stops being its own during measurement (another table takes the id, or a
// foreign mesh or slot lands under it) voids only that measurement under the clean policy: the window, facts, and
// snapshot are discarded, the loss is recorded with the ownership census, and the relay is re-issued on a
// collision-free id at most twice. The observe policy records the binding and never re-issues.
async function measureRelayTarget({ cycle, identity, entry, fixtureContext }) {
  const windowId = pq022H3WindowId({ cycle, sectorId: identity.sectorId, kind: 'target', identityKey: identity.key });
  for (let attempt = 1; ; attempt += 1) {
    let failure = null;
    try {
      await measureTarget({ cycle, identity, entry, fixtureContext });
    } catch (error) {
      failure = error;
    }
    await stopRelayWatch(failure ? 'measurement-failed' : 'measured');
    const relayKey = fixtures.filter((row) => row.kind === 'relay-collar').at(-1)?.relayKey ?? null;
    const binding = relayKey
      ? await page.evaluate(({ key, site, file }) => window.__PQ022_H3__.relayBindingIntact(key, site, file), {
        key: relayKey,
        site: PQ022_H3_RELAY_SITE_ID,
        file: identity.releaseFile,
      }).catch((error) => ({ intact: null, reason: `relay binding unreadable: ${error?.message || error}` }))
      : { intact: false, reason: 'no relay fixture was issued' };
    if (RELAY_ID_POLICY === 'observe') {
      relayObservations.push({
        windowId,
        attempt,
        relayKey,
        binding,
        error: failure ? String(failure.message || failure).slice(0, 400) : null,
      });
      await progress({ event: 'relay-observation', windowId, relayKey, intact: binding.intact, reason: binding.reason });
      if (failure) throw failure;
      return;
    }
    if (!failure && binding.intact === true) return;
    if (binding.intact !== false) {
      throw failure || new Error(`${identity.key} relay binding unreadable after measurement: ${binding.reason}`);
    }
    const discarded = discardMeasurement({ windowId, identityKey: identity.key, cycle });
    fixtureLosses.push({
      windowId,
      identityKey: identity.key,
      role: 'relay',
      cycle,
      attempt,
      entityId: relayKey,
      intactReason: binding.reason,
      ownership: binding.ownership ?? null,
      error: failure ? String(failure.message || failure).slice(0, 400) : null,
      discarded,
    });
    await progress({ event: 'fixture-loss', windowId, attempt, relayKey, intactReason: binding.reason });
    if (attempt > 2) {
      throw failure || new Error(`${identity.key} relay binding was lost during measurement ${attempt} times: ${binding.reason}`);
    }
    await issueRelayFixture({ cycle, identity, reissueFor: 'relay', reason: `binding lost during measurement: ${binding.reason}` });
  }
}

// Traffic fixtures are harness-owned bodies. Each issuance stamps a unique durable sequence (so no two
// fixtures ever share a worldRecordId), records the record ids it issued, and approaches the fan first.
async function issueTrafficFixtures({ cycle, identity, fixtureContext, reissueFor = null, reason = null }) {
  activePhase = `c${cycle}:${identity.key}:${reissueFor ? 'fixture-reissue' : 'fixture'}`;
  const anchorPose = await approachTrafficAnchor(cycle, identity);
  trafficIssuance += 1;
  const traffic = await ensureTrafficFixtures(page, fixtureContext.trafficRecordIds, anchorPose.layout, trafficIssuance);
  for (const row of Object.values(traffic)) {
    if (row?.worldRecordId) issuedTrafficRecordIds.add(row.worldRecordId);
  }
  fixtures.push({ cycle, kind: 'corridor-traffic-bodies', issuance: trafficIssuance, reissueFor, reason, anchorPose, roles: traffic });
  fixtureContext.trafficIds = Object.fromEntries(Object.entries(traffic).map(([role, row]) => [role, row.entityId]));
  fixtureContext.trafficRecordIds = Object.fromEntries(Object.entries(traffic).map(([role, row]) => [role, row.worldRecordId]));
  await progress({
    event: 'fixtures',
    cycle,
    issuance: trafficIssuance,
    reissueFor,
    reason,
    roles: Object.fromEntries(Object.entries(traffic).map(([role, row]) => [role, {
      id: row.entityId,
      reused: row.reused,
      worldRecordId: row.worldRecordId,
      durableSeq: row.durableSeq ?? null,
    }])),
  });
  return traffic;
}

async function readTrafficIntact(identity, fixtureContext) {
  const role = identity.subject.role;
  return page.evaluate(({ r, id, rec, file }) => window.__PQ022_H3__.trafficFixtureIntact(r, id, rec, file), {
    r: role,
    id: fixtureContext.trafficIds?.[role] ?? null,
    rec: fixtureContext.trafficRecordIds?.[role] ?? null,
    file: identity.releaseFile,
  });
}

function spliceWhere(list, predicate) {
  let removed = 0;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (predicate(list[index])) {
      list.splice(index, 1);
      removed += 1;
    }
  }
  return removed;
}

function discardMeasurement({ windowId, identityKey, cycle }) {
  return {
    windows: spliceWhere(windows, (row) => row.windowId === windowId),
    identityFacts: spliceWhere(identityFacts, (row) => row.key === identityKey && row.cycle === cycle),
    admissionTimeouts: spliceWhere(admissionTimeouts, (row) => row.windowId === windowId),
    discardedWindows: spliceWhere(discardedWindows, (row) => row.windowId === windowId),
    snapshots: spliceWhere(snapshots, (row) => row.label === windowId),
  };
}

// A harness-owned traffic fixture that is lost or adopted during its own measurement voids only that
// measurement: its window, facts, and snapshot are discarded, the loss is recorded with the owners' destroy
// events, and the identity is re-measured on a re-issued fixture at most twice. A measurement that fails
// while its fixture is still intact is a real failure and is rethrown.
async function measureTrafficTarget({ cycle, identity, entry, fixtureContext }) {
  const windowId = pq022H3WindowId({ cycle, sectorId: identity.sectorId, kind: 'target', identityKey: identity.key });
  for (let attempt = 1; ; attempt += 1) {
    let failure = null;
    try {
      await measureTarget({ cycle, identity, entry, fixtureContext });
    } catch (error) {
      failure = error;
    }
    const intact = await readTrafficIntact(identity, fixtureContext)
      .catch((readError) => ({ intact: null, reason: `fixture state unreadable: ${readError?.message || readError}` }));
    if (!failure && intact.intact === true) return;
    if (intact.intact !== false) {
      throw failure || new Error(`${identity.key} fixture state unreadable after measurement: ${intact.reason}`);
    }
    const role = identity.subject.role;
    const entityId = fixtureContext.trafficIds?.[role] ?? null;
    const destroyEvents = await page.evaluate((ids) => window.__PQ022_H3__.destroyedEvents(ids), [entityId]).catch(() => []);
    const discarded = discardMeasurement({ windowId, identityKey: identity.key, cycle });
    fixtureLosses.push({
      windowId,
      identityKey: identity.key,
      role,
      cycle,
      attempt,
      entityId,
      worldRecordId: fixtureContext.trafficRecordIds?.[role] ?? null,
      intactReason: intact.reason,
      error: failure ? String(failure.message || failure).slice(0, 400) : null,
      destroyEvents,
      discarded,
    });
    await progress({ event: 'fixture-loss', windowId, attempt, entityId, intactReason: intact.reason, destroyEvents });
    if (attempt > 2) {
      throw failure || new Error(`${identity.key} fixture was lost during measurement ${attempt} times: ${intact.reason}`);
    }
    await issueTrafficFixtures({ cycle, identity, fixtureContext, reissueFor: role, reason: `lost during measurement: ${intact.reason}` });
    const reissued = await readTrafficIntact(identity, fixtureContext);
    assert(reissued.intact, `${identity.key} re-issued fixture is not intact: ${reissued.reason}`);
  }
}

// Far-actor residency (farActorTable.tickFarActors) shelves any ship beyond its exit radius from the
// player (about 1.25 km at flight speed) on the next simulation tick, so traffic fixtures are issued
// and re-issued with the player posed collision-free at the centroid of their planned fan layout.
async function approachTrafficAnchor(cycle, identity) {
  const layout = await planTrafficFixtureLayout(page);
  const placement = await placeStable({
    plan: { centerGlobal: { x: layout.centroid.x, z: layout.centroid.z }, cameraForward: { x: 0, z: 1 } },
    standoff: 0,
    sectorId: identity.sectorId,
    label: `c${cycle}:${identity.key}:traffic-anchor`,
  });
  return {
    layout,
    standoff: placement.standoff,
    position: placement.position,
    attempts: placement.attempts.length,
  };
}

async function placeStable({ plan, standoff, sectorId, label, maxAttempts = 10, stepWu = 30 }) {
  const attempts = [];
  let current = standoff;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const position = {
      x: plan.centerGlobal.x - plan.cameraForward.x * current,
      z: plan.centerGlobal.z - plan.cameraForward.z * current,
    };
    await placePlayer(position, sectorId);
    const drift = await readPoseDrift(position);
    attempts.push({
      standoff: current,
      displacement: round(drift.displacement),
      speed: round(drift.speed),
      impacts: drift.impacts,
      impactOtherId: drift.lastImpact?.otherId ?? null,
      hull: drift.hull,
    });
    if (drift.sectorId !== sectorId) {
      throw new Error(`${label}: pose left ${sectorId} for ${drift.sectorId}: ${JSON.stringify(attempts)}`);
    }
    if (drift.displacement <= POSE_MAX_DRIFT_WU && drift.speed <= POSE_MAX_SPEED_WU_S && drift.impacts === 0) {
      return { position, standoff: current, attempts };
    }
    current += stepWu;
  }
  throw new Error(`${label}: no stable pose after ${maxAttempts} attempts: ${JSON.stringify(attempts)}`);
}

async function resourceSnapshot(label, cycle) {
  return page.evaluate(({ snapshotLabel, snapshotCycle, keys }) => (
    window.__PQ022_H3__.resourceSnapshot(snapshotLabel, snapshotCycle, keys)
  ), { snapshotLabel: label, snapshotCycle: cycle, keys: residencyKeysByIdentity });
}

async function recordProcessTree(label) {
  const snapshot = await readProcessTreeSnapshot();
  const owned = collectOwnedProcessTreePids(snapshot, process.pid);
  for (const pid of owned) ownedPids.add(pid);
  const byPid = new Map(snapshot.map((row) => [row.pid, row]));
  const chromePids = owned.filter((pid) => BROWSER_CLASS.test(String(byPid.get(pid)?.name || '').replace(/\.exe$/i, '')));
  const chromeRoots = chromePids.filter((pid) => byPid.get(pid)?.parentPid === process.pid
    || !chromePids.includes(byPid.get(pid)?.parentPid));
  processTrees.push({ label, ownedCount: owned.length, chromePids, chromeRoots });
}

async function readIdentityInputs() {
  const [partsRaw, releaseRaw, pilotsRaw] = await Promise.all([
    readFile(path.join(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'),
    readFile(path.join(ROOT, 'assets/ships/release/release_manifest.json'), 'utf8'),
    readFile(path.join(ROOT, 'assets/ships/render-packages/pilots.json'), 'utf8'),
  ]);
  const parts = JSON.parse(partsRaw);
  const release = JSON.parse(releaseRaw);
  const pilots = JSON.parse(pilotsRaw);
  const { WORLD_SITE_ASSET_BINDINGS } = await import(pathToFileURL(path.join(ROOT, 'src/data/worldSiteAssetBindings.js')).href);
  const rows = [];
  for (const identity of PQ022_H3_IDENTITIES) {
    const releaseRow = release.assets.find((row) => row.id === identity.manifestId);
    const sourceRow = parts.parts.find((row) => row.id === identity.manifestId);
    assert(releaseRow, `release manifest row missing: ${identity.manifestId}`);
    assert(sourceRow, `source manifest row missing: ${identity.manifestId}`);
    const [releaseFacts, sourceFacts] = await Promise.all([fileFacts(releaseRow.release), fileFacts(releaseRow.source)]);
    const metadataPath = `assets/ships/release/render-packages/${identity.renderPackage}/render-package.json`;
    const pkg = JSON.parse(await readFile(path.join(ROOT, metadataPath), 'utf8'));
    const renderPath = path.posix.join(path.posix.dirname(metadataPath), pkg.render.uri);
    const provenance = pkg.source || pkg.sources || pkg.provenance || {};
    const renderFacts = await fileFacts(renderPath);
    const pilot = (pilots.pilots || []).find((row) => row.key === identity.renderPackage) || null;
    const binding = WORLD_SITE_ASSET_BINDINGS[identity.assetId] || null;
    const live = {
      source: releaseRow.source,
      release: releaseRow.release,
      sourceSha256: String(releaseRow.sourceSha256 || '').toLowerCase(),
      releaseSha256: String(releaseRow.releaseSha256 || '').toLowerCase(),
      sourceBytes: releaseRow.sourceBytes,
      releaseBytes: releaseRow.releaseBytes,
      onDiskReleaseSha256: releaseFacts.sha256,
      onDiskReleaseBytes: releaseFacts.bytes,
      onDiskSourceSha256: sourceFacts.sha256,
      onDiskSourceBytes: sourceFacts.bytes,
      partsManifestSourceBytes: sourceRow.bytes ?? null,
    };
    const renderPackage = {
      dir: identity.renderPackage,
      metadataPath,
      assetId: pkg.assetId,
      contentHash: pkg.contentHash,
      runtimeHash: pkg.runtimeHash ?? null,
      residencyKey: `render-package:${pkg.contentHash}`,
      renderBytes: pkg.render?.bytes ?? null,
      renderSha256: pkg.render?.sha256 ?? null,
      onDiskRenderSha256: renderFacts.sha256,
      onDiskRenderBytes: renderFacts.bytes,
      sourceGlbSha256: provenance.sourceGlb?.sha256 ?? null,
      sourceGlbBytes: provenance.sourceGlb?.bytes ?? null,
      pilotReleaseSha256: pilot?.releaseSha256 ?? null,
      geometryEntries: Array.isArray(pkg.geometry) ? pkg.geometry.length : null,
      materialEntries: Array.isArray(pkg.materials) ? pkg.materials.length : null,
    };
    rows.push({
      key: identity.key,
      assetId: identity.assetId,
      manifestId: identity.manifestId,
      sectorId: identity.sectorId,
      slot: identity.slot,
      releaseFile: identity.releaseFile,
      accepted: { releaseSha256: identity.acceptedReleaseSha256, ...identity.acceptance },
      live,
      renderPackage,
      worldSiteBinding: binding ? { sourceSha256: binding.source.sha256, releaseSha256: binding.release.sha256 } : null,
      hashBinding: {
        liveMatchesAccepted: live.releaseSha256 === identity.acceptedReleaseSha256,
        diskMatchesManifest: live.onDiskReleaseSha256 === live.releaseSha256,
        sourceDiskMatchesManifest: live.onDiskSourceSha256 === live.sourceSha256,
        packageMatchesLive: renderPackage.sourceGlbSha256 === live.releaseSha256,
        renderGlbMatchesPackage: renderPackage.onDiskRenderSha256 === renderPackage.renderSha256,
        pilotMatchesLive: renderPackage.pilotReleaseSha256 === live.releaseSha256,
        worldSiteBindingMatchesLive: binding ? binding.release.sha256 === live.releaseSha256 : null,
      },
    });
  }
  return rows;
}

async function fileFacts(relPath) {
  const absolute = path.join(ROOT, relPath);
  if (!existsSync(absolute)) return { exists: false, bytes: null, sha256: null };
  const bytes = await readFile(absolute);
  return { exists: true, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function startHostLoadSampler({ intervalMs }) {
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    `while ($true) { $t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); $rows = Get-Process | ForEach-Object { [string]$_.Id + ',' + $_.ProcessName + ',' + $(if ($null -eq $_.CPU) { '0' } else { ([double]$_.CPU).ToString('R', [Globalization.CultureInfo]::InvariantCulture) }) }; [Console]::Out.WriteLine([string]$t + '|' + ($rows -join ';')); [Console]::Out.Flush(); Start-Sleep -Milliseconds ${intervalMs} }`,
  ].join('; ');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const samples = [];
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    const bar = line.indexOf('|');
    if (bar < 0) return;
    const t = Number(line.slice(0, bar));
    if (!Number.isFinite(t)) return;
    const procs = new Map();
    for (const part of line.slice(bar + 1).split(';')) {
      const first = part.indexOf(',');
      const last = part.lastIndexOf(',');
      if (first < 0 || last <= first) continue;
      const pid = Number(part.slice(0, first));
      const cpu = Number(part.slice(last + 1));
      if (Number.isInteger(pid) && Number.isFinite(cpu)) procs.set(pid, { name: part.slice(first + 1, last), cpu });
    }
    samples.push({ t, procs });
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  return {
    pid: child.pid,
    samples,
    stderr: () => stderr,
    async waitForSamples(count, timeoutMs) {
      const startedAt = Date.now();
      while (samples.length < count && Date.now() - startedAt < timeoutMs) await delay(200);
      return samples.length >= count;
    },
    async stop() {
      if (child.exitCode != null) return true;
      const exited = new Promise((resolveExit) => child.once('exit', () => resolveExit(true)));
      child.kill();
      return Promise.race([exited, delay(5_000).then(() => child.exitCode != null || child.killed)]);
    },
  };
}

async function readProcessTreeSnapshot() {
  const script = "Get-CimInstance Win32_Process | ForEach-Object { [string]$_.ProcessId + ',' + [string]$_.ParentProcessId + ',' + $_.Name }";
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  ownedPids.add(child.pid);
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });
  await new Promise((resolveExit) => child.once('exit', resolveExit));
  return stdout.split(/\r?\n/).map((line) => {
    const first = line.indexOf(',');
    const second = line.indexOf(',', first + 1);
    if (first < 0 || second < 0) return null;
    return {
      pid: Number(line.slice(0, first)),
      parentPid: Number(line.slice(first + 1, second)),
      name: line.slice(second + 1).trim(),
    };
  }).filter((row) => row && Number.isInteger(row.pid) && Number.isInteger(row.parentPid));
}

async function waitForQuietHost({ maxWaitMs, quietSamples }) {
  const startedAt = Date.now();
  let span = null;
  while (Date.now() - startedAt <= maxWaitMs) {
    const samples = hostSampler.samples;
    if (samples.length > quietSamples) {
      const toIndex = samples.length - 1;
      span = summarizeHostSpan(samples, toIndex - quietSamples, toIndex, ownedPids);
      if (span
          && span.maxForeignBrowserProcessCores <= PQ022_H3_BUDGETS.hostForeignBrowserProcessCores
          && span.foreignBrowserCores <= PQ022_H3_BUDGETS.hostForeignBrowserAggregateCores
          && span.foreignCores <= PQ022_H3_BUDGETS.hostForeignAnyAggregateCores) {
        return { enabled: true, quiet: true, waitedMs: Date.now() - startedAt, maxWaitMs, span };
      }
    }
    await delay(HOST_SAMPLE_INTERVAL_MS);
  }
  return { enabled: true, quiet: false, waitedMs: Date.now() - startedAt, maxWaitMs, span };
}

function summarizeHostSpan(samples, fromIndex, toIndex, owned) {
  if (!Array.isArray(samples) || toIndex <= fromIndex || !samples[fromIndex] || !samples[toIndex]) return null;
  const before = samples[fromIndex];
  const after = samples[toIndex];
  const seconds = (after.t - before.t) / 1_000;
  if (!(seconds > 0)) return null;
  const rows = [];
  for (const [pid, proc] of after.procs) {
    if (owned.has(pid) || /^idle$/i.test(proc.name)) continue;
    const prior = before.procs.get(pid);
    const delta = prior && prior.name === proc.name ? proc.cpu - prior.cpu : 0;
    if (!(delta > 0)) continue;
    rows.push({ pid, name: proc.name, cores: delta / seconds });
  }
  rows.sort((a, b) => b.cores - a.cores);
  const browserRows = rows.filter((row) => BROWSER_CLASS.test(row.name));
  return {
    sampleCount: toIndex - fromIndex,
    fromEpochMs: before.t,
    toEpochMs: after.t,
    spanMs: after.t - before.t,
    foreignCores: round3(rows.reduce((total, row) => total + row.cores, 0)),
    foreignBrowserCores: round3(browserRows.reduce((total, row) => total + row.cores, 0)),
    maxForeignBrowserProcessCores: round3(browserRows.reduce((max, row) => Math.max(max, row.cores), 0)),
    top: rows.slice(0, 6).map((row) => ({ name: row.name, pid: row.pid, cores: round3(row.cores) })),
  };
}

function buildHostLoad({ preflightHostLoad: preflight, windows: windowRows, identityFacts: factRows = [], ownedPids: owned }) {
  const samples = hostSampler.samples;
  // Host span for an epoch range: from the last 2 s sample at or before its start (the sample taken before the
  // timed window opens) to the first sample at or after its end.
  const spanFor = (range) => {
    if (!range || !Number.isFinite(range.startMs) || !Number.isFinite(range.endMs)) return null;
    let fromIndex = 0;
    for (let index = 0; index < samples.length; index += 1) {
      if (samples[index].t <= range.startMs) fromIndex = index;
      else break;
    }
    let toIndex = samples.length - 1;
    for (let index = fromIndex; index < samples.length; index += 1) {
      if (samples[index].t >= range.endMs) { toIndex = index; break; }
    }
    return summarizeHostSpan(samples, fromIndex, toIndex, owned);
  };
  const byWindow = {};
  for (const row of windowRows) {
    if (!row.epochRange) continue;
    const summary = spanFor(row.epochRange);
    if (summary) byWindow[row.windowId] = summary;
  }
  // Admission waits run outside timed windows. Each identity/cycle admission gets its own host span so an
  // admission budget failure is judged against the host load present while it waited.
  const byAdmission = {};
  for (const row of Array.isArray(factRows) ? factRows : []) {
    const range = row?.admission?.epochRange;
    if (!range) continue;
    const windowId = pq022H3WindowId({ cycle: row.cycle, sectorId: row.sectorId, kind: 'target', identityKey: row.key });
    const summary = spanFor(range);
    if (summary) byAdmission[`admission:${windowId}`] = summary;
  }
  const run = summarizeHostSpan(samples, 0, samples.length - 1, owned);
  return {
    available: samples.length >= 2 && Object.keys(byWindow).length === windowRows.filter((row) => row.epochRange).length,
    logicalCores: (globalThis.navigator?.hardwareConcurrency) || null,
    sampleIntervalMs: HOST_SAMPLE_INTERVAL_MS,
    sampleCount: samples.length,
    sampler: { command: 'powershell Get-Process loop', stderr: hostSampler.stderr().slice(0, 2_000) },
    ownedPidCount: owned.size,
    preflight,
    run,
    windows: byWindow,
    admissions: byAdmission,
  };
}

function brokerEvidence(gate) {
  const claim = gate?.claim || null;
  return {
    reason: gate?.reason ?? null,
    diagnostic: gate?.diagnostic === true,
    primaryAcceptance: gate?.primaryAcceptance === true,
    claimId: claim?.claimId || claim?.id || null,
    mode: claim?.mode ?? null,
    candidateDigest: claim?.digests?.candidateDigest ?? claim?.receipt?.candidateDigest ?? null,
    manifestDigest: claim?.digests?.manifestDigest ?? null,
    inputDigest: claim?.digests?.inputDigest ?? null,
  };
}

async function progress(row) {
  const line = JSON.stringify({ atS: Math.round((Date.now() - startedAtEpochMs) / 100) / 10, ...row });
  console.log(`[pq022-h3] ${line}`);
  await appendFile(PROGRESS_PATH, `${line}\n`, 'utf8').catch(() => {});
}

function pickSnapshot(snapshot) {
  const out = {};
  for (const key of ['geometries', 'textures', 'programs', 'residentAssets', 'residentResources', 'gpuResidentBytes',
    'cpuPackageBytes', 'pendingRequests', 'heapUsedBytes', 'entityCount', 'sceneObjects']) out[key] = snapshot?.[key] ?? null;
  return out;
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
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/microsoft-edge', '/usr/bin/chromium'];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function readIntOption(name) {
  const match = process.argv.slice(2).find((arg) => arg.startsWith(`${name}=`));
  if (!match) return null;
  const value = Number(match.slice(name.length + 1));
  assert(Number.isInteger(value) && value >= 1 && value <= PQ022_H3_CYCLES, `${name} must be an integer between 1 and ${PQ022_H3_CYCLES}`);
  return value;
}

function readListOption(name) {
  const match = process.argv.slice(2).find((arg) => arg.startsWith(`${name}=`));
  if (!match) return null;
  const list = match.slice(name.length + 1).split(',').map((value) => value.trim()).filter(Boolean);
  for (const key of list) assert(PQ022_H3_IDENTITIES.some((row) => row.key === key), `unknown identity ${key}`);
  return list;
}

function repoRel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : value ?? null;
}

function round3(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value;
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(2) : 'n/a';
}
