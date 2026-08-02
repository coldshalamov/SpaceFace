import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PQ019_H3_FACILITY_VISUAL_ROLES,
  PQ019_H3_PROFILE_IDS,
  PQ019_H3_RECEIPT_SCHEMA,
  validatePq019H3PerformanceReceipt,
} from '../scripts/lib/pq019H3Performance.mjs';
import manifest from '../scripts/validation-manifests/pq019-h3-performance.mjs';

const PROBE_SOURCE = readFileSync(new URL('../scripts/probe-pq019-surface-heist.mjs', import.meta.url), 'utf8');

const VIDEO = Object.freeze({
  bloom: true,
  bloomStrength: 0.72,
  shadows: true,
  particleQuality: 'high',
  renderScale: 1,
  pixelRatioCap: 1,
});

function samples(frameMs = 16.6, count = 300) {
  return Array.from({ length: count }, (_, index) => ({
    atMs: index * frameMs,
    frameMs,
    phaseTag: 'flight_steady',
    tick: 1000 + index,
    mode: 'flight',
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
  const loaded = profileId === 'traffic-loaded-heist';
  return {
    profileId,
    repetition: index,
    pairId: `pq019-h3-pair-${index}`,
    recordedSeed: 19019,
    sectorId: 'sector_tethys_junction',
    mode: 'flight',
    docked: false,
    facilityRoles: [
      { entityId: 101, role: 'heist_launcher_visual', admission: 'ready', assetState: 'authored' },
      { entityId: 102, role: 'lawful_catcher_visual', admission: 'pending', assetState: null },
      { entityId: 103, role: 'fence_receiver_visual', admission: 'pending', assetState: null },
    ],
    performanceSubject: {
      entityId: loaded ? 201 : 101,
      role: loaded ? 'cargo_capsule' : 'heist_launcher_visual',
      admission: 'ready',
      assetState: 'authored',
    },
    trafficRuntime: 'ordinary-sector-traffic',
    ambientTrafficIds: [301, 302, 303, 304, 305],
    ambientTrafficCount: 5,
    entityCount: loaded ? 340 : 332,
    colliderCount: loaded ? 286 : 281,
    spatialHash: { queries: loaded ? 1400 : 1200, candidates: loaded ? 6200 : 5100 },
    activeHeistCount: loaded ? 1 : 0,
    capsulePresent: loaded,
    capsuleAdmission: loaded ? 'ready' : null,
    capsuleAssetState: loaded ? 'authored' : null,
    possessed: loaded,
    lawIncidentReceiptId: loaded ? 'law:receipt:1' : null,
    responderLeaseCount: loaded ? 1 : 0,
    heat: loaded ? 0.4 : 0,
  };
}

function repetition(profileId, index, frameMs = profileId === 'facility-normal' ? 16.6 : 17) {
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
          sim: { p95: 2.1 },
          render: { p95: 4.2 },
          vfx: { p95: 0.8 },
          feel: { p95: 0.1 },
          ui: { p95: 0.3 },
        },
        systems: { traffic: { p95: 0.2 }, missions: { p95: 0.1 } },
      },
      draw: { calls: 61, triangles: 220000, geometries: 74, textures: 96, programs: 108 },
      pipeline: {
        warmup: { pass: true, timedOut: false, stableMs: 5000 },
        programs: { delta: { added: [], removed: [], changed: [] } },
      },
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
    schema: PQ019_H3_RECEIPT_SCHEMA,
    disposition: 'PASS',
    fixedSeed: 19019,
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
      declaredRoute: 'New Game -> Tethys facility flight -> station DOM accept -> witnessed live capsule heist',
      retainedEvidenceReferences: ['design/program/roadmap/receipts/PQ-019-capsule-h1-capture-REPORT.md'],
      pairs: [1, 2, 3].map((index) => ({
        pairId: `pq019-h3-pair-${index}`,
        repetition: index,
        recordedSeed: 19019,
      })),
    },
    profiles: PQ019_H3_PROFILE_IDS.map((id) => ({
      id,
      repetitions: [1, 2, 3].map((index) => repetition(id, index)),
    })),
    pageIssues: [],
    cleanup: { browserClosed: true, serverClosed: true },
  };
}

test('PQ-019 H3 accepts three matched normal and loaded windows with full owner facts', () => {
  const result = validatePq019H3PerformanceReceipt(receipt());
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.deepEqual(result.profiles.map((profile) => profile.id), [...PQ019_H3_PROFILE_IDS]);
  assert.equal(result.profiles[0].median.p95, 16.6);
  assert.equal(result.profiles[1].median.p95, 17);
  assert.deepEqual(PQ019_H3_FACILITY_VISUAL_ROLES, [
    'heist_launcher_visual',
    'lawful_catcher_visual',
    'fence_receiver_visual',
  ]);
});

test('PQ-019 H3 rejects missing profiles, repetitions, or raw intervals', () => {
  const missingProfile = receipt();
  missingProfile.profiles.pop();
  assert.match(validatePq019H3PerformanceReceipt(missingProfile).failures.join('\n'), /traffic-loaded-heist/);

  const missingRun = receipt();
  missingRun.profiles[0].repetitions.pop();
  assert.match(validatePq019H3PerformanceReceipt(missingRun).failures.join('\n'), /exactly 3 repetitions/);

  const thin = receipt();
  thin.profiles[0].repetitions[0].rawSamples = samples(16.6, 30);
  assert.match(validatePq019H3PerformanceReceipt(thin).failures.join('\n'), /at least 120 raw frame intervals/);
});

test('PQ-019 H3 rejects stale route identity and an unproved loaded heist', () => {
  const stale = receipt();
  stale.profiles[0].repetitions[0].routeFacts.sectorId = 'sector_helios_prime';
  stale.profiles[1].repetitions[1].routeFacts.responderLeaseCount = 0;
  const failures = validatePq019H3PerformanceReceipt(stale).failures.join('\n');
  assert.match(failures, /sector_tethys_junction/);
  assert.match(failures, /responder lease/);
});

test('PQ-019 H3 matches isolated pairs without requiring distant facilities to be admitted together', () => {
  const valid = receipt();
  assert.equal(validatePq019H3PerformanceReceipt(valid).pass, true);

  valid.profiles[1].repetitions[0].routeFacts.pairId = 'pq019-h3-pair-elsewhere';
  assert.match(
    validatePq019H3PerformanceReceipt(valid).failures.join('\n'),
    /route pair identity differs|route identity changed/,
  );
});

test('PQ-019 H3 rejects software rendering, quality changes, and diagnostic claims', () => {
  const invalid = receipt();
  invalid.gpu.renderer = 'Google SwiftShader';
  invalid.profiles[0].repetitions[0].attribution.settings.end.video.bloom = false;
  invalid.broker.primaryAcceptance = false;
  invalid.broker.diagnostic = true;
  const failures = validatePq019H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /hardware GPU/);
  assert.match(failures, /settings changed/);
  assert.match(failures, /primary broker acceptance/);
});

test('PQ-019 H3 recomputes raw percentiles and fails floor, hitch, or backlog regressions', () => {
  const invalid = receipt();
  invalid.profiles[0].repetitions[0].rawSamples = samples(18);
  invalid.profiles[0].repetitions[0].attribution.frameMs.p95 = 18;
  invalid.profiles[1].repetitions[1].rawSamples = samples(34);
  invalid.profiles[1].repetitions[1].attribution.frameMs.p95 = 34;
  invalid.profiles[1].repetitions[2].rawSamples[100].frameMs = 55;
  invalid.profiles[1].repetitions[2].rawSamples[120].shedBacklog = true;
  const failures = validatePq019H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /loaded-route p95 exceeds/);
  assert.match(failures, />50 ms frame count increases/);
  assert.match(failures, /backlog shedding increases/);
});

test('PQ-019 H3 fails a loaded-route p95 or hitch regression against its matched normal route', () => {
  const invalid = receipt();
  for (const run of invalid.profiles[1].repetitions) {
    run.rawSamples = samples(17.6);
    run.attribution.frameMs.p50 = 17.6;
    run.attribution.frameMs.p95 = 17.6;
    run.attribution.frameMs.p99 = 17.6;
    run.attribution.frameMs.max = 17.6;
  }
  invalid.profiles[1].repetitions[1].rawSamples[100].frameMs = 40;
  invalid.profiles[1].repetitions[1].attribution.frameMs.max = 40;
  invalid.profiles[1].repetitions[1].attribution.frameMs.hitchesOver32Ms = 1;
  const failures = validatePq019H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /regresses more than 5%/);
  assert.match(failures, /hitch count increases/);
});

test('PQ-019 H3 refuses to launder profile load differences into an optimization claim', () => {
  const invalid = receipt();
  invalid.qualityPreserving.performanceImprovementClaimed = true;
  assert.match(validatePq019H3PerformanceReceipt(invalid).failures.join('\n'), /must not claim an optimization improvement/);
});

test('PQ-019 H3 accepts a no-regression feature result while reporting a red absolute target', () => {
  const baselineMiss = receipt();
  for (const profile of baselineMiss.profiles) {
    for (const run of profile.repetitions) {
      run.rawSamples = samples(33.4, 150);
      run.attribution.frameMs = {
        sampleCount: 150,
        p50: 33.4,
        p95: 33.4,
        p99: 33.4,
        max: 33.4,
        hitchesOver32Ms: 150,
      };
    }
  }
  const result = validatePq019H3PerformanceReceipt(baselineMiss);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.absoluteBudget.pass, false);
  assert.match(result.absoluteBudget.failures.join('\n'), /misses the 16.7 ms target/);
});

test('PQ-019 H3 is a one-use brokered target-profile cell with exact source invalidation', () => {
  assert.equal(manifest.id, 'pq019-h3-performance');
  assert.equal(manifest.runtimeKind, 'browser');
  assert.equal(manifest.mode, 'acceptance');
  assert.deepEqual(manifest.commandArgs, ['scripts/capture-pq019-h3-performance.mjs']);
  assert.equal(manifest.runtimeProfile, 'target-desktop-default-quality');
  assert.equal(manifest.maxLaunchesPerCandidate, 1);
  assert.equal(manifest.requireFastReceipt, true);
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.cleanupPolicy, 'kill-tree');
  assert.ok(manifest.fastGateCommands.includes('node --test test/pq019-h3-performance.test.mjs'));
  assert.ok(manifest.productionSourcePaths.includes('src/systems/heistFacilities.js'));
  assert.ok(manifest.productionSourcePaths.includes('src/systems/traffic.js'));
  assert.ok(manifest.harnessSourcePaths.includes('scripts/probe-pq019-surface-heist.mjs'));
  assert.ok(manifest.harnessSourcePaths.includes('scripts/lib/releaseSoakProbe.mjs'));
  assert.match(PROBE_SOURCE, /for \(let repetition = 1; repetition <= PQ019_H3_REPETITIONS/,
    'each repetition must receive an isolated fixed-seed context');
  assert.match(PROBE_SOURCE, /runScenario\(`h3-matched-performance-\$\{repetition\}`/,
    'the normal and loaded arms must share one named pair context');
  assert.match(PROBE_SOURCE,
    /if \(!DIAGNOSTIC && !CONTINUATION_ONLY && !H3_PERFORMANCE\)[\s\S]*?process\.exit\(2\)/,
    'the H3 mode must be explicit without reopening the retired full H1 route');
});
