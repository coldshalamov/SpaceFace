import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PQ020_H3_BUDGETS,
  PQ020_H3_PIPELINE_SETTLE_TIMEOUT_MS,
  PQ020_H3_PROFILE_IDS,
  PQ020_H3_RECEIPT_SCHEMA,
  validatePq020H3PerformanceReceipt,
} from '../scripts/lib/pq020CeresH3Performance.mjs';
import manifest from '../scripts/validation-manifests/pq020-h3-performance.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

const ROOT = new URL('../', import.meta.url);

const ACTOR_SOURCE = readFileSync(
  new URL('../scripts/capture-pq020-h3-performance.mjs', import.meta.url),
  'utf8',
);
const ROUTE_SOURCE = readFileSync(
  new URL('../scripts/lib/pq020CeresFunctionalRoute.mjs', import.meta.url),
  'utf8',
);

const VIDEO = Object.freeze({
  bloom: true,
  bloomStrength: 0.35,
  shadows: false,
  particleQuality: 'medium',
  renderScale: 0.85,
  dynamicResolution: false,
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

function routeFacts(profileId, index) {
  const cathedral = profileId === 'cathedral-visible-target';
  return {
    profileId,
    repetition: index,
    pairId: `pq020-h3-pair-${index}`,
    recordedSeed: 47,
    sectorId: 'sector_ceres_belt',
    mode: 'flight',
    docked: false,
    trafficRuntime: 'ordinary-sector-traffic',
    ambientTrafficIds: [91, 92, 93, 94, 95],
    ambientTrafficCount: 5,
    entityCount: 338,
    colliderCount: 300,
    spatialHash: { queries: 1250, candidates: 8200 },
    mapOpenMs: 220,
    sectorEntryMs: 480,
    cathedral: {
      siteId: 'world_site_wreck_cathedral',
      rootEntityId: 201,
      entityCount: 15,
      admittedComponentCount: 7,
      rootAdmission: 'ready',
      rootAssetState: 'authored',
      appliedLod: cathedral ? 'LOD0' : null,
      inFrame: cathedral,
      cameraZoom: cathedral ? 72 : null,
      distanceToPlayer: cathedral ? 180 : 3200,
    },
    performanceSubject: cathedral
      ? { role: 'cathedral-root', entityId: 201, admission: 'ready', assetState: 'authored' }
      : { role: 'ceres-entry-floor', entityId: 1, admission: 'ready', assetState: 'authored' },
  };
}

function repetition(profileId, index, frameMs = profileId === 'ceres-entry-floor' ? 16.6 : 16.8) {
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
          sim: { p95: 3.1 },
          render: { p95: 4.8 },
          vfx: { p95: 0.7 },
          ui: { p95: 0.4 },
        },
        systems: { worldSiteRuntime: { p95: 0.2 }, traffic: { p95: 0.3 } },
      },
      draw: { calls: 72, triangles: 240000, geometries: 88, textures: 112, programs: 91 },
      pipeline: { warmup: { pass: true, timedOut: false, stableMs: 5000 } },
      settings: {
        start: { video: { ...VIDEO }, dynResScale: 1, timeScale: 1 },
        end: { video: { ...VIDEO }, dynResScale: 1, timeScale: 1 },
      },
      gpuTimers: { available: true, captureValid: true, lastDisjoint: false },
      memory: { comparableState: { pass: true } },
    },
  };
}

function receipt() {
  return {
    schema: PQ020_H3_RECEIPT_SCHEMA,
    disposition: 'PASS',
    fixedSeed: 47,
    viewport: { width: 1830, height: 973, deviceScaleFactor: 1 },
    runtime: 'browser-chromium-headed',
    gpu: { available: true, renderer: 'ANGLE (Intel, D3D11)' },
    qualityPreserving: {
      settingsOverridesApplied: false,
      defaultQualityRetained: true,
      performanceImprovementClaimed: false,
      absoluteTargetClaimed: false,
      absoluteBudgetWaiverGranted: false,
    },
    broker: { primaryAcceptance: true, diagnostic: false, claimId: '1234-abcdef' },
    route: {
      pairCount: 3,
      declaredRoute: 'New Game -> public Ceres jump -> endpoint floor -> public Cathedral waypoint -> default framing',
      retainedEvidenceReferences: [
        'design/program/roadmap/receipts/PQ-020-ceres-h1-capture-REPORT.md',
        'design/program/roadmap/receipts/PQ-020-h2-pocket-cathedral-REPORT.md',
      ],
      pairs: [1, 2, 3].map((index) => ({
        pairId: `pq020-h3-pair-${index}`,
        repetition: index,
        recordedSeed: 47,
        publicRoute: true,
      })),
    },
    profiles: PQ020_H3_PROFILE_IDS.map((id) => ({
      id,
      repetitions: [1, 2, 3].map((index) => repetition(id, index)),
    })),
    pageIssues: [],
    cleanup: { browserClosed: true, serverClosed: true },
  };
}

test('PQ-020 H3 accepts three same-context Ceres entry and Cathedral target pairs', () => {
  const result = validatePq020H3PerformanceReceipt(receipt());
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.deepEqual(result.profiles.map((profile) => profile.id), [...PQ020_H3_PROFILE_IDS]);
  assert.equal(result.profiles[0].median.p95, 16.6);
  assert.equal(result.profiles[1].median.p95, 16.8);
});

test('PQ-020 H3 fails closed on missing profiles, repetitions, raw intervals, or continuity', () => {
  const invalid = receipt();
  invalid.profiles.pop();
  assert.match(validatePq020H3PerformanceReceipt(invalid).failures.join('\n'), /cathedral-visible-target/);

  const thin = receipt();
  thin.profiles[0].repetitions[0].rawSamples = samples(16.6, 30);
  assert.match(validatePq020H3PerformanceReceipt(thin).failures.join('\n'), /at least 120 raw frame intervals/);

  const covered = receipt();
  covered.profiles[1].repetitions[0].rawSamples[4].visibility = 'hidden';
  assert.match(validatePq020H3PerformanceReceipt(covered).failures.join('\n'), /visible controllable flight/);
});

test('PQ-020 H3 requires exact Ceres, Cathedral, admission, framing, and LOD facts', () => {
  const invalid = receipt();
  invalid.profiles[0].repetitions[0].routeFacts.sectorId = 'sector_helios_prime';
  invalid.profiles[1].repetitions[1].routeFacts.cathedral.inFrame = false;
  invalid.profiles[1].repetitions[2].routeFacts.cathedral.appliedLod = null;
  const failures = validatePq020H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /sector_ceres_belt/);
  assert.match(failures, /Cathedral must be in frame/);
  assert.match(failures, /applied LOD/);
});

test('PQ-020 H3 predeclares map-open and sector-entry thresholds', () => {
  const invalid = receipt();
  invalid.profiles[0].repetitions[0].routeFacts.mapOpenMs = PQ020_H3_BUDGETS.maxMapOpenMs + 1;
  invalid.profiles[0].repetitions[1].routeFacts.sectorEntryMs = PQ020_H3_BUDGETS.maxSectorEntryMs + 1;
  const failures = validatePq020H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /map-open span exceeds/);
  assert.match(failures, /sector-entry span exceeds/);
});

test('PQ-020 H3 rejects target p95, p99, hitch, long-frame, and backlog regressions', () => {
  const invalid = receipt();
  for (const run of invalid.profiles[1].repetitions) {
    run.rawSamples = samples(18);
    run.attribution.frameMs = {
      sampleCount: 300, p50: 18, p95: 18, p99: 18, max: 18, hitchesOver32Ms: 0,
    };
  }
  invalid.profiles[1].repetitions[0].rawSamples[20].frameMs = 55;
  invalid.profiles[1].repetitions[0].attribution.frameMs.max = 55;
  invalid.profiles[1].repetitions[1].rawSamples[30].shedBacklog = true;
  const failures = validatePq020H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /median p95 regresses by more than/);
  assert.match(failures, />50 ms frame count increases/);
  assert.match(failures, /backlog shedding increases/);
});

test('PQ-020 H3 rejects software GPU, quality mutation, diagnostic evidence, or a fake delta', () => {
  const invalid = receipt();
  invalid.gpu.renderer = 'Google SwiftShader';
  invalid.profiles[0].repetitions[0].attribution.settings.end.video.bloom = false;
  invalid.broker.primaryAcceptance = false;
  invalid.broker.diagnostic = true;
  invalid.qualityPreserving.performanceImprovementClaimed = true;
  const failures = validatePq020H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /hardware GPU/);
  assert.match(failures, /settings changed/);
  assert.match(failures, /primary broker acceptance/);
  assert.match(failures, /must not claim an optimization improvement/);
});

test('PQ-020 H3 keeps the absolute target separate from matched feature acceptance', () => {
  const red = receipt();
  for (const profile of red.profiles) {
    for (const run of profile.repetitions) {
      run.rawSamples = samples(33.4, 150);
      run.attribution.frameMs = {
        sampleCount: 150, p50: 33.4, p95: 33.4, p99: 33.4, max: 33.4, hitchesOver32Ms: 150,
      };
    }
  }
  const result = validatePq020H3PerformanceReceipt(red);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.absoluteBudget.pass, false);
});

test('PQ-020 H3 is a one-use brokered cell over the accepted public route drivers', () => {
  assert.equal(manifest.id, 'pq020-h3-performance');
  assert.equal(manifest.runtimeKind, 'browser');
  assert.equal(manifest.mode, 'acceptance');
  assert.deepEqual(manifest.commandArgs, ['scripts/capture-pq020-h3-performance.mjs']);
  assert.equal(manifest.runtimeProfile, 'target-desktop-default-quality');
  assert.equal(manifest.maxLaunchesPerCandidate, 1);
  assert.equal(manifest.requireFastReceipt, true);
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.cleanupPolicy, 'kill-tree');
  assert.ok(manifest.harnessSourcePaths.includes('scripts/lib/pq020CeresFunctionalRoute.mjs'));
  assert.ok(manifest.harnessSourcePaths.includes('scripts/lib/releaseSoakProbe.mjs'));
  assert.equal(PQ020_H3_PIPELINE_SETTLE_TIMEOUT_MS, 30_000);
  assert.match(ACTOR_SOURCE, /for \(let repetition = 1; repetition <= PQ020_H3_REPETITIONS/);
  assert.match(ACTOR_SOURCE, /runPq020H3PerformancePair/);
  assert.match(ACTOR_SOURCE, /pq020FunctionalRouteDrivers/);
  assert.doesNotMatch(ACTOR_SOURCE, /world\.enterSector|player\.pos\s*=|camera\.zoom\s*=/,
    'the H3 actor must use the accepted public route rather than direct gameplay mutation');
  assert.match(ROUTE_SOURCE, /pq020FunctionalRouteDrivers/,
    'the H1 route must expose one shared public-driver surface to H3');
});

test('the tracked registry resolves pq020-h3-performance', async () => {
  const registered = await loadValidationManifestById({
    root: fileURLToPath(ROOT),
    id: 'pq020-h3-performance',
  });
  assert.equal(registered.id, manifest.id);
  assert.match(registered.__trackedManifest.relativePath, /pq020-h3-performance\.mjs$/);
});
