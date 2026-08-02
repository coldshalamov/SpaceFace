import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PQ024_H3_BUDGETS,
  PQ024_H3_PIPELINE_SETTLE_TIMEOUT_MS,
  PQ024_H3_PROFILE_IDS,
  PQ024_H3_RECEIPT_SCHEMA,
  validatePq024H3PerformanceReceipt,
} from '../scripts/lib/pq024H3Performance.mjs';
import manifest from '../scripts/validation-manifests/pq024-h3-performance.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

const ROOT = new URL('../', import.meta.url);
const ACTOR_SOURCE = readFileSync(
  new URL('../scripts/probe-pq024-asteroid-claim.mjs', import.meta.url),
  'utf8',
);
const WRAPPER_SOURCE = readFileSync(
  new URL('../scripts/capture-pq024-h3-performance.mjs', import.meta.url),
  'utf8',
);
const VIDEO = Object.freeze({
  bloom: true,
  bloomStrength: 0.35,
  shadows: false,
  particleQuality: 'medium',
  renderScale: 0.85,
  dynamicResolution: false,
  motionReduce: false,
});

function samples(frameMs = 16.6, count = 300) {
  return Array.from({ length: count }, (_, index) => ({
    atMs: index * frameMs,
    frameMs,
    phaseTag: 'flight_steady',
    tick: 1200 + index,
    mode: 'flight',
    timeScale: 1,
    docked: false,
    jumpState: 'IDLE',
    playerControlExposed: true,
    visibility: 'visible',
    stepsThisFrame: 1,
    shedBacklog: false,
    shedSteps: 0,
  }));
}

function gpuTerminals(frameMs = 9) {
  const rows = [];
  for (let frame = 1; frame <= 50; frame += 1) {
    for (const [label, elapsedMs] of [
      ['bloomScene', frameMs - 1.4],
      ['bloomDownsample', 0.4],
      ['bloomComposite', 1],
    ]) rows.push({ state: 'completed', displayFrameId: frame, label, elapsedMs });
  }
  return rows;
}

function routeFacts(profileId, index) {
  const target = profileId === 'producing-one-relay-target';
  return {
    profileId,
    repetition: index,
    pairId: `pq024-h3-pair-${index}`,
    recordedSeed: 24024,
    sectorId: 'sector_helios_prime',
    mode: 'flight',
    docked: false,
    playerControlExposed: true,
    asteroidTargetId: 91,
    siteId: 'site_1',
    survey: { visibleText: 'Assay 2/5', revealed: 2, cells: 5 },
    core: {
      siteId: 'site_1', anchored: true, lifecycle: target ? 'producing' : 'committed',
      machineId: 101, cell: { col: 14, row: 1 },
    },
    pose: { x: 122, z: -44, rot: 0.25, cameraZoom: 88, selectedTargetId: 91 },
    performanceIsolation: {
      playerDefeatSuppressed: true,
      playerContactSuppressed: true,
      npcCombatRetained: true,
      ambientVfxRetained: true,
    },
    site: target
      ? { lifecycle: 'producing', anchored: true, machineCount: 2, coreCount: 1, extractorCount: 1 }
      : { lifecycle: 'committed', anchored: true, machineCount: 1, coreCount: 1, extractorCount: 0 },
    production: target
      ? { receipt: { outputId: 'cmdty_silicate', positiveQuantity: 1 }, eventCount: 1 }
      : { receipt: null, eventCount: 0 },
    relay: target
      ? {
        count: 1,
        entityId: 201,
        placeId: 'place_claim_outpost_relay',
        siteId: 'site_1',
        presentationAdmission: 'ready',
        assetState: 'authored',
      }
      : { count: 0 },
    timeEffects: { measurementStartMs: 0, measurementEndMs: 5_000, samples: [], events: [] },
  };
}

function repetition(profileId, index, frameMs = profileId === PQ024_H3_PROFILE_IDS[0] ? 16.6 : 16.8) {
  const rawSamples = samples(frameMs);
  return {
    index,
    routeFacts: routeFacts(profileId, index),
    rawSamples,
    attribution: {
      frameMs: {
        sampleCount: rawSamples.length,
        p50: frameMs,
        p95: frameMs,
        p99: frameMs,
        max: frameMs,
        hitchesOver32Ms: 0,
      },
      cpu: {
        phases: {
          sim: { p95: 3.1 }, render: { p95: 4.8 }, vfx: { p95: 0.7 }, ui: { p95: 0.4 },
        },
        systems: { asteroidSites: { p95: 0.2 }, worldSiteRuntime: { p95: 0.1 } },
      },
      draw: { calls: 72, triangles: 240000, geometries: 88, textures: 112, programs: 91 },
      pipeline: { warmup: { pass: true, timedOut: false, stableMs: 5000 } },
      settings: {
        start: { video: { ...VIDEO }, dynResScale: 1, timeScale: 1 },
        end: { video: { ...VIDEO }, dynResScale: 1, timeScale: 1 },
      },
      gpuTimers: {
        available: true,
        enabled: true,
        captureValid: true,
        lastDisjoint: false,
        pending: 0,
        drain: { drained: true, timedOut: false, pending: 0 },
        queryCounts: { attempted: 450, issued: 450, completed: 450, dropped: 0, rejected: 0 },
        terminals: gpuTerminals(),
      },
      measurementIsolation: {
        frameTimingGpuTimersEnabled: false,
        gpuAttributionSeparated: true,
        gpuAttributionFrameCount: 150,
        gpuAttributionDurationMs: 2500,
        settingsStable: true,
        routeStable: true,
      },
      memory: {
        comparableState: { pass: true },
        renderer: { delta: { geometries: 0, textures: 0, programs: 0, renderTargets: 0 } },
      },
    },
  };
}

function receipt() {
  return {
    schema: PQ024_H3_RECEIPT_SCHEMA,
    disposition: 'PASS',
    fixedSeed: 24024,
    viewport: { width: 1830, height: 973, deviceScaleFactor: 1 },
    runtime: 'browser-chromium-headed',
    gpu: { available: true, renderer: 'ANGLE (Intel, D3D11)' },
    qualityPreserving: {
      settingsOverridesApplied: false,
      defaultQualityRetained: true,
      playerDefeatIsolationDisclosed: true,
      playerContactIsolationDisclosed: true,
      relayVisualQualityClaimed: false,
      performanceImprovementClaimed: false,
      absoluteTargetClaimed: false,
      absoluteBudgetWaiverGranted: false,
    },
    broker: { primaryAcceptance: true, diagnostic: false, claimId: '1234-abcdef' },
    route: {
      pairCount: 3,
      declaredRoute: 'New Game -> public asteroid claim -> committed Core floor -> public extractor -> producing relay target',
      retainedEvidenceReferences: [
        'design/program/roadmap/receipts/PQ-024-survey-h1-capture-REPORT.md',
      ],
      pairs: [1, 2, 3].map((index) => ({
        pairId: `pq024-h3-pair-${index}`,
        repetition: index,
        recordedSeed: 24024,
        sameContext: true,
        publicRoute: true,
        cleanup: {
          playerSafetyRestored: true,
          timeEffectListenersRemoved: true,
          masslineReleased: true,
        },
      })),
    },
    profiles: PQ024_H3_PROFILE_IDS.map((id) => ({
      id,
      repetitions: [1, 2, 3].map((index) => repetition(id, index)),
    })),
    pageIssues: [],
    cleanup: { browserClosed: true, serverClosed: true },
  };
}

test('PQ-024 H3 accepts three same-context committed-floor and producing-relay pairs', () => {
  const result = validatePq024H3PerformanceReceipt(receipt());
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.profiles[0].median.p95, 16.6);
  assert.equal(result.profiles[1].median.p95, 16.8);
  assert.equal(result.hitchAttribution.gpuFrameEnvelope.target.medianP95, 9);
});

test('PQ-024 H3 fails closed on lifecycle, receipt, and relay substitutions', () => {
  const invalid = receipt();
  invalid.profiles[0].repetitions[0].routeFacts.site.lifecycle = 'producing';
  invalid.profiles[1].repetitions[0].routeFacts.production.receipt.positiveQuantity = 0;
  invalid.profiles[1].repetitions[1].routeFacts.relay.count = 2;
  invalid.profiles[1].repetitions[2].routeFacts.relay.presentationAdmission = 'pending';
  const failures = validatePq024H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /floor must be one committed Core/);
  assert.match(failures, /authoritative positive production event/);
  assert.match(failures, /exactly one admitted authored exterior relay/);
});

test('PQ-024 H3 requires the same asteroid, site, Core, pose, camera, and settings', () => {
  const invalid = receipt();
  invalid.profiles[1].repetitions[0].routeFacts.siteId = 'site_other';
  invalid.profiles[1].repetitions[1].routeFacts.core.cell.col += 1;
  invalid.profiles[1].repetitions[2].routeFacts.pose.x += 1;
  invalid.profiles[1].repetitions[2].attribution.settings.start.video.bloom = false;
  invalid.profiles[1].repetitions[2].attribution.settings.end.video.bloom = false;
  const failures = validatePq024H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /changed asteroid, site, survey, or Core identity/);
  assert.match(failures, /changed player pose, camera, or target selection/);
  assert.match(failures, /uses different settings/);
});

test('PQ-024 H3 recomputes raw timing and requires visible controllable flight', () => {
  const invalid = receipt();
  invalid.profiles[0].repetitions[0].attribution.frameMs.p95 = 99;
  invalid.profiles[0].repetitions[1].rawSamples.length = 30;
  invalid.profiles[0].repetitions[2].rawSamples[4].visibility = 'hidden';
  const failures = validatePq024H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /does not match recomputed raw intervals/);
  assert.match(failures, /at least 120 raw frame intervals/);
  assert.match(failures, /left visible controllable flight/);
});

test('PQ-024 H3 rejects software GPU, diagnostic claims, quality shortcuts, and incomplete cleanup', () => {
  const invalid = receipt();
  invalid.gpu.renderer = 'Google SwiftShader';
  invalid.broker.primaryAcceptance = false;
  invalid.broker.diagnostic = true;
  invalid.qualityPreserving.relayVisualQualityClaimed = true;
  invalid.cleanup.browserClosed = false;
  invalid.route.pairs[0].cleanup.playerSafetyRestored = false;
  const failures = validatePq024H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /hardware GPU/);
  assert.match(failures, /primary broker acceptance/);
  assert.match(failures, /must not claim relay visual quality/);
  assert.match(failures, /cleanup/);
  assert.match(failures, /did not restore benchmark isolation/);
});

test('PQ-024 H3 admits only a bounded source-attributed gameplay hit-stop pulse', () => {
  const accepted = receipt();
  const run = accepted.profiles[1].repetitions[0];
  Object.assign(run.rawSamples[10], { timeScale: 0.12 });
  run.routeFacts.timeEffects = {
    samples: [{
      atMs: run.rawSamples[10].atMs,
      tick: run.rawSamples[10].tick,
      scale: 0.12,
      source: 'feel:hit-stop',
    }],
    events: [{
      atMs: run.rawSamples[10].atMs - 10,
      event: 'combat:damage',
      hitStopActive: true,
    }],
  };
  let result = validatePq024H3PerformanceReceipt(accepted);
  assert.equal(result.pass, true, result.failures.join('\n'));

  const unattributed = structuredClone(accepted);
  unattributed.profiles[1].repetitions[0].routeFacts.timeEffects.samples[0].source = 'unattributed';
  result = validatePq024H3PerformanceReceipt(unattributed);
  assert.match(result.failures.join('\n'), /not source-attributed/);

  const overlong = receipt();
  const overlongRun = overlong.profiles[1].repetitions[0];
  overlongRun.routeFacts.timeEffects = { samples: [], events: [] };
  for (let index = 0; index < 7; index += 1) {
    overlongRun.rawSamples[index].timeScale = 0.12;
    overlongRun.routeFacts.timeEffects.samples.push({
      atMs: overlongRun.rawSamples[index].atMs,
      tick: overlongRun.rawSamples[index].tick,
      scale: 0.12,
      source: 'feel:hit-stop',
    });
    overlongRun.routeFacts.timeEffects.events.push({
      atMs: overlongRun.rawSamples[index].atMs,
      event: 'combat:damage',
      hitStopActive: true,
    });
  }
  assert.match(validatePq024H3PerformanceReceipt(overlong).failures.join('\n'), /bounded gameplay hit-stop/);
});

test('PQ-024 H3 requires separated exact GPU attribution and correlated frame groups', () => {
  const invalid = receipt();
  invalid.profiles[1].repetitions[0].attribution.measurementIsolation.frameTimingGpuTimersEnabled = true;
  invalid.profiles[1].repetitions[1].attribution.gpuTimers.queryCounts.completed = 449;
  invalid.profiles[1].repetitions[2].attribution.gpuTimers.terminals = [];
  const failures = validatePq024H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /isolated GPU attribution/);
  assert.match(failures, /complete correlated GPU frames/);
});

test('PQ-024 H3 rejects matched timing, product-hitch, long-frame, and backlog regressions', () => {
  const invalid = receipt();
  for (const run of invalid.profiles[1].repetitions) {
    run.rawSamples = samples(18);
    Object.assign(run.attribution.frameMs, {
      sampleCount: 300, p50: 18, p95: 18, p99: 18, max: 18, hitchesOver32Ms: 0,
    });
  }
  Object.assign(invalid.profiles[1].repetitions[0].rawSamples[20], {
    frameMs: 55, callbackMs: 30, simFrameMs: 3, presentationMs: 2,
  });
  invalid.profiles[1].repetitions[0].attribution.frameMs.max = 55;
  invalid.profiles[1].repetitions[0].attribution.frameMs.hitchesOver32Ms = 1;
  invalid.profiles[1].repetitions[1].rawSamples[30].shedBacklog = true;
  const failures = validatePq024H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /median p95 regresses/);
  assert.match(failures, /product-attributed hitch count increases/);
  assert.match(failures, /frames above 50 ms/);
  assert.match(failures, /backlog-shedding/);
});

test('PQ-024 H3 permits bounded external scheduling but rejects systematic renderer admission', () => {
  const accepted = receipt();
  for (let index = 0; index < 2; index += 1) {
    const run = accepted.profiles[1].repetitions[index];
    Object.assign(run.rawSamples[20], {
      frameMs: 33.3,
      callbackMs: 7,
      simFrameMs: 4,
      presentationMs: 2,
      externalCallbackGapMs: 25,
      callbackDispatchLagMs: 0.5,
      shedBacklog: false,
    });
    run.attribution.frameMs.max = 33.3;
    run.attribution.frameMs.hitchesOver32Ms = 1;
  }
  let result = validatePq024H3PerformanceReceipt(accepted);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.hitchAttribution.target.externalScheduling, 2);
  assert.equal(result.hitchAttribution.target.productAttributed, 0);

  const admitted = receipt();
  for (const run of admitted.profiles[1].repetitions) {
    run.attribution.memory.renderer.delta.geometries = 1;
  }
  result = validatePq024H3PerformanceReceipt(admitted);
  assert.match(result.failures.join('\n'), /median renderer geometries admission exceeds/);
});

test('PQ-024 H3 keeps the absolute target separate from matched feature acceptance', () => {
  const slow = receipt();
  for (const profile of slow.profiles) {
    for (const run of profile.repetitions) {
      run.rawSamples = samples(20);
      Object.assign(run.attribution.frameMs, {
        sampleCount: 300, p50: 20, p95: 20, p99: 20, max: 20, hitchesOver32Ms: 0,
      });
    }
  }
  const result = validatePq024H3PerformanceReceipt(slow);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.absoluteBudget.pass, false);
  assert.equal(PQ024_H3_BUDGETS.targetSamplingEnvelopeP95Ms, 17.5);
});

test('PQ-024 H3 is one brokered cell over the accepted public actor', () => {
  assert.equal(manifest.id, 'pq024-h3-performance');
  assert.equal(manifest.runtimeKind, 'browser');
  assert.equal(manifest.mode, 'acceptance');
  assert.deepEqual(manifest.commandArgs, ['scripts/capture-pq024-h3-performance.mjs']);
  assert.equal(manifest.runtimeProfile, 'target-desktop-default-quality');
  assert.equal(manifest.maxLaunchesPerCandidate, 1);
  assert.equal(manifest.requireFastReceipt, true);
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.cleanupPolicy, 'kill-tree');
  assert.ok(manifest.harnessSourcePaths.includes('scripts/probe-pq024-asteroid-claim.mjs'));
  assert.ok(manifest.harnessSourcePaths.includes('scripts/lib/releaseSoakProbe.mjs'));
  assert.equal(PQ024_H3_PIPELINE_SETTLE_TIMEOUT_MS, 30_000);
  assert.match(WRAPPER_SOURCE, /--h3-performance/);
  assert.match(WRAPPER_SOURCE, /probe-pq024-asteroid-claim\.mjs/);
  assert.match(ACTOR_SOURCE, /runPq024H3PerformancePair/);
  assert.match(ACTOR_SOURCE, /phaseTag: 'flight_steady'/);
  assert.match(ACTOR_SOURCE, /planExtractorPlacement\(page, core, \{ fromAvatar: true \}\)/);
  assert.doesNotMatch(ACTOR_SOURCE, /world\.enterSector|siteSys\.installMachine|_ensureBeacon|_emitProductionReceipt/);
});

test('the tracked registry resolves pq024-h3-performance', async () => {
  const registered = await loadValidationManifestById({
    root: fileURLToPath(ROOT),
    id: 'pq024-h3-performance',
  });
  assert.equal(registered.id, manifest.id);
  assert.match(registered.__trackedManifest.relativePath, /pq024-h3-performance\.mjs$/);
});
