import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeFrameSamples } from '../scripts/lib/performanceClosureContracts.mjs';
import {
  PQ023_H3_PROFILE_IDS,
  PQ023_H3_RECEIPT_SCHEMA,
  validatePq023H3PerformanceReceipt,
} from '../scripts/lib/pq023H3Performance.mjs';

function samples(frameMs = 16.7, count = 300) {
  return Array.from({ length: count }, (_, index) => ({
    index,
    frameMs,
    callbackMs: 1.2,
    simFrameMs: 0.6,
    presentationMs: 1.4,
    externalCallbackGapMs: 0,
    callbackDispatchLagMs: 0,
    backlogCause: null,
    shedBacklog: false,
    mode: 'flight',
    docked: false,
    playerControlExposed: true,
    visibility: 'visible',
    timeScale: 1,
  }));
}

function liveFrameSummary(rawSamples) {
  const summary = summarizeFrameSamples(rawSamples);
  return {
    sampleCount: summary.sampleCount,
    p50: summary.p50,
    p95: summary.p95,
    p99: summary.p99,
    max: summary.max,
    hitchesOver32Ms: summary.framesAbove32Ms,
  };
}

function gpuTerminals(totalMs = 9.9, frameCount = 42) {
  const labels = [
    ['bloomScene', totalMs - 2.9],
    ['bloomDownsample', 0.8],
    ['bloomComposite', 2.1],
  ];
  const terminals = [];
  let queryId = 1;
  for (let frame = 1; frame <= frameCount; frame += 1) {
    for (const [label, elapsedMs] of labels) {
      terminals.push({
        queryId: queryId++,
        label,
        state: 'completed',
        displayFrameId: frame,
        renderFrameId: frame,
        simTick: frame,
        elapsedMs,
        reason: null,
      });
    }
  }
  return terminals;
}

function attribution(rawSamples) {
  const settings = {
    video: { particleQuality: 'medium', motionReduce: false },
    accessibility: { flashReduce: false },
    dynResScale: 1,
    timeScale: 1,
  };
  return {
    frameMs: liveFrameSummary(rawSamples),
    pipeline: { warmup: { pass: true, timedOut: false } },
    memory: {
      comparableState: { pass: true },
      renderer: { delta: { geometries: 0, textures: 0, programs: 0, renderTargets: 0 } },
    },
    settings: { start: settings, end: structuredClone(settings) },
    draw: { calls: 54, triangles: 42_000, geometries: 64, textures: 92, programs: 88 },
    cpu: {
      phases: {
        sim: { p95: 0.7 }, render: { p95: 3.4 }, vfx: { p95: 1.5 }, ui: { p95: 0.4 },
      },
      systems: { vfx: { p95: 1.5 } },
    },
    gpuTimers: {
      available: true,
      captureValid: true,
      enabled: true,
      lastDisjoint: false,
      pending: 0,
      queryCounts: { attempted: 450, issued: 450, completed: 450, dropped: 0, rejected: 0 },
      drain: { drained: true, pending: 0 },
      passes: {
        bloomScene: { max: 8.2 },
        bloomDownsample: { max: 0.5 },
        bloomUpsample: { max: 0 },
        bloomComposite: { max: 1.2 },
      },
      terminals: gpuTerminals(),
    },
    measurementIsolation: {
      frameTimingGpuTimersEnabled: false,
      gpuAttributionSeparated: true,
      gpuAttributionFrameCount: 150,
      gpuAttributionDurationMs: 2_505,
      settingsStable: true,
      routeStable: true,
    },
    resourceDelta: { geometries: 0, textures: 0, programs: 0, renderTargets: 0 },
  };
}

function poolCapacities() {
  return { particles: 3_000, sprites: 256, trailStreaks: 96, combatBeams: 16, explosions: 24 };
}

function routeFacts(profileId, repetition) {
  const target = profileId === PQ023_H3_PROFILE_IDS[1];
  return {
    profileId,
    repetition,
    pairId: `pq023-h3-pair-${repetition}`,
    recordedSeed: 47,
    sectorId: 'sector_helios_prime',
    mode: 'flight',
    docked: false,
    playerControlExposed: true,
    player: { entityId: 1, admission: 'ready', assetState: 'authored' },
    pose: { x: 10, z: 20, rot: 0.25, cameraZoom: 88, selectedTargetId: null },
    spatialContract: { sourceEntityId: 1, fittedWeaponId: 'wpn_autocannon_m', pathLength: 31.5 },
    performanceIsolation: {
      playerDefeatSuppressed: true,
      playerContactSuppressed: true,
      npcCombatRetained: true,
      ambientVfxRetained: true,
    },
    poolCapacities: poolCapacities(),
    livePools: target
      ? { particles: 58, sprites: 68, trailStreaks: 34, combatBeams: 1, explosions: 6 }
      : { particles: 0, sprites: 0, trailStreaks: 0, combatBeams: 0, explosions: 0 },
    dense: target ? {
      active: true,
      source: 'accepted-pq023-dense-representative',
      pulseCount: 9,
      beamRefreshCount: 70,
      criticalAttempted: 27,
      criticalEmitted: 27,
      criticalSuppressed: 0,
      flavorAttempted: 90,
      flavorSuppressed: 48,
      peakPools: { particles: 72, sprites: 81, trailStreaks: 41, combatBeams: 1, explosions: 6 },
    } : {
      active: false,
      source: null,
      pulseCount: 0,
      beamRefreshCount: 0,
      criticalAttempted: 0,
      criticalEmitted: 0,
      criticalSuppressed: 0,
      flavorAttempted: 0,
      flavorSuppressed: 0,
      peakPools: { particles: 0, sprites: 0, trailStreaks: 0, combatBeams: 0, explosions: 0 },
    },
  };
}

function cleanPair(repetition) {
  return {
    pairId: `pq023-h3-pair-${repetition}`,
    repetition,
    sameContext: true,
    source: 'accepted-pq023-dense-representative',
    preflight: {
      denseSurfacesWarmed: true,
      pulseCount: 1,
      peakPools: { particles: 72, sprites: 81, trailStreaks: 41, combatBeams: 1, explosions: 6 },
      cleanupPools: { particles: 0, sprites: 0, trailStreaks: 0, combatBeams: 0, explosions: 0 },
      poolCapacities: poolCapacities(),
    },
    cleanup: {
      driverStopped: true,
      targetRemoved: true,
      playerSafetyRestored: true,
      livePools: { particles: 0, sprites: 0, trailStreaks: 0, combatBeams: 0, explosions: 0 },
      poolCapacities: poolCapacities(),
    },
  };
}

function validReceipt() {
  const floor = [];
  const target = [];
  const pairs = [];
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    const floorSamples = samples(16.7);
    const targetSamples = samples(16.8);
    floor.push({
      index: repetition,
      rawSamples: floorSamples,
      attribution: attribution(floorSamples),
      routeFacts: routeFacts(PQ023_H3_PROFILE_IDS[0], repetition),
    });
    target.push({
      index: repetition,
      rawSamples: targetSamples,
      attribution: attribution(targetSamples),
      routeFacts: routeFacts(PQ023_H3_PROFILE_IDS[1], repetition),
    });
    pairs.push(cleanPair(repetition));
  }
  return {
    schema: PQ023_H3_RECEIPT_SCHEMA,
    disposition: 'PASS',
    fixedSeed: 47,
    viewport: { width: 1830, height: 973, deviceScaleFactor: 1 },
    runtime: 'browser-chromium-headed',
    gpu: { available: true, renderer: 'ANGLE (Intel, D3D11)' },
    qualityPreserving: {
      settingsOverridesApplied: false,
      defaultQualityRetained: true,
      playerDefeatIsolationDisclosed: true,
      playerContactIsolationDisclosed: true,
      performanceImprovementClaimed: false,
      absoluteTargetClaimed: false,
      absoluteBudgetWaiverGranted: false,
    },
    broker: { primaryAcceptance: true, diagnostic: false, claimId: 'claim-1' },
    route: { pairCount: 3, pairs },
    profiles: [
      { id: PQ023_H3_PROFILE_IDS[0], repetitions: floor },
      { id: PQ023_H3_PROFILE_IDS[1], repetitions: target },
    ],
    pageIssues: [],
    cleanup: { browserClosed: true, serverClosed: true },
  };
}

test('PQ-023 H3 accepts a bound three-pair dense cue receipt', () => {
  const result = validatePq023H3PerformanceReceipt(validReceipt());
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.absoluteBudget.pass, true);
});

test('PQ-023 H3 accepts the real owner summary shape and a valid 30 fps-class sample count', () => {
  const receipt = validReceipt();
  for (const profile of receipt.profiles) {
    for (const run of profile.repetitions) {
      run.rawSamples = samples(profile.id === PQ023_H3_PROFILE_IDS[0] ? 33.3 : 33.4, 150);
      run.attribution.frameMs = liveFrameSummary(run.rawSamples);
    }
  }
  const result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.absoluteBudget.pass, false);
});

test('PQ-023 H3 rejects an unwarmed route or a multiplied dense representative', () => {
  const receipt = validReceipt();
  receipt.route.pairs[0].preflight.denseSurfacesWarmed = false;
  receipt.profiles[1].repetitions[1].routeFacts.dense.peakPools.explosions = 12;
  const result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('preflight')));
  assert.ok(result.failures.some((row) => row.includes('multiplies')));
});

test('PQ-023 H3 separates one ambient whole-pool burst from systematic dense multiplication', () => {
  const receipt = validReceipt();
  const target = receipt.profiles[1].repetitions;
  [254, 271, 331].forEach((value, index) => {
    target[index].routeFacts.dense.peakPools.particles = value;
  });

  let result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.hitchAttribution.densePoolEnvelope.particles, 271);

  for (const run of target) run.routeFacts.dense.peakPools.particles = 331;
  result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('median particles peak')));
});

test('PQ-023 H3 binds renderer admission to the matched ambient floor', () => {
  const receipt = validReceipt();
  for (let index = 0; index < 3; index += 1) {
    receipt.profiles[0].repetitions[index].attribution.memory.renderer.delta = {
      geometries: 8, textures: 1, programs: 0, renderTargets: 0,
    };
    receipt.profiles[1].repetitions[index].attribution.memory.renderer.delta = {
      geometries: 1, textures: 0, programs: 0, renderTargets: 0,
    };
  }
  let result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, true, result.failures.join('\n'));

  receipt.profiles[1].repetitions[0].attribution.memory.renderer.delta.geometries = 9;
  receipt.profiles[1].repetitions[1].attribution.memory.renderer.delta.geometries = 9;
  result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('renderer geometry admission')));
});

test('PQ-023 H3 uses three-run admission medians for unrelated late ambient assets', () => {
  const receipt = validReceipt();
  const floor = receipt.profiles[0].repetitions;
  const target = receipt.profiles[1].repetitions;
  [1, 0, 8].forEach((value, index) => {
    floor[index].attribution.memory.renderer.delta.geometries = value;
  });
  [3, 0, 0].forEach((value, index) => {
    target[index].attribution.memory.renderer.delta.geometries = value;
  });
  target[2].attribution.memory.renderer.delta.textures = 1;

  const result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.deepEqual(result.hitchAttribution.rendererAdmission, {
    floor: { geometries: 1, textures: 0, programs: 0, renderTargets: 0 },
    target: { geometries: 0, textures: 0, programs: 0, renderTargets: 0 },
  });
});

test('PQ-023 H3 groups GPU terminals by exact frame and uses the three-run median', () => {
  const receipt = validReceipt();
  receipt.profiles[1].repetitions[0].attribution.gpuTimers.terminals = gpuTerminals(20.2);
  receipt.profiles[1].repetitions[1].attribution.gpuTimers.terminals = gpuTerminals(15.5);
  receipt.profiles[1].repetitions[2].attribution.gpuTimers.terminals = gpuTerminals(16.6);
  let result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, true, result.failures.join('\n'));

  for (const run of receipt.profiles[1].repetitions) {
    run.attribution.gpuTimers.terminals = gpuTerminals(18.5);
  }
  result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('correlated GPU-frame median p95')));
});

test('PQ-023 H3 trusts bounded owner times over the fixed-step backlog label', () => {
  const receipt = validReceipt();
  for (const profile of receipt.profiles) {
    for (const run of profile.repetitions) {
      run.rawSamples = samples(33.4, 150).map((sample) => ({
        ...sample,
        callbackMs: 14,
        simFrameMs: 8,
        presentationMs: 6,
        externalCallbackGapMs: 12,
        callbackDispatchLagMs: 1,
        backlogCause: 'simulation',
        stepsThisFrame: 2,
      }));
      run.attribution.frameMs = liveFrameSummary(run.rawSamples);
    }
  }
  const result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.hitchAttribution.floor.productAttributed, 0);
  assert.equal(result.hitchAttribution.target.externalScheduling, 450);
});

test('PQ-023 H3 fails closed when the target is not the accepted dense composition', () => {
  const receipt = validReceipt();
  const facts = receipt.profiles[1].repetitions[0].routeFacts;
  facts.dense.pulseCount = 0;
  facts.dense.criticalSuppressed = 1;
  facts.dense.peakPools.combatBeams = 0;
  const result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('dense pulse')));
  assert.ok(result.failures.some((row) => row.includes('critical cue')));
  assert.ok(result.failures.some((row) => row.includes('connected beam')));
});

test('PQ-023 H3 rejects pool-capacity drift and incomplete cleanup', () => {
  const receipt = validReceipt();
  receipt.profiles[1].repetitions[1].routeFacts.poolCapacities.sprites = 128;
  receipt.route.pairs[1].cleanup.livePools.sprites = 1;
  const result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('pool capacities')));
  assert.ok(result.failures.some((row) => row.includes('cleanup')));
});

test('PQ-023 H3 recomputes raw timing and rejects route discontinuity', () => {
  const receipt = validReceipt();
  const run = receipt.profiles[0].repetitions[2];
  run.attribution.frameMs.p95 = 99;
  run.rawSamples[5].visibility = 'hidden';
  const result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('does not match recomputed')));
  assert.ok(result.failures.some((row) => row.includes('visible controllable flight')));
});

test('PQ-023 H3 admits only a bounded source-attributed gameplay hit-stop pulse', () => {
  const receipt = validReceipt();
  const run = receipt.profiles[0].repetitions[0];
  run.rawSamples[127] = {
    ...run.rawSamples[127],
    atMs: 35_088.5,
    tick: 984,
    timeScale: 0.12,
  };
  run.routeFacts.timeEffects = {
    measurementStartMs: 32_950,
    measurementEndMs: 37_950,
    samples: [{
      atMs: 35_088.5,
      tick: 984,
      scale: 0.12,
      source: 'feel:hit-stop',
      remainingMs: 23.2,
    }],
    events: [{
      atMs: 35_084.1,
      tick: 984,
      event: 'combat:damage',
      hitStopActive: true,
      brokeShield: true,
    }],
  };
  run.attribution.frameMs = liveFrameSummary(run.rawSamples);

  let result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, true, result.failures.join('\n'));

  run.routeFacts.timeEffects.samples[0].source = 'unattributed';
  result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('source-attributed')));

  run.routeFacts.timeEffects.samples[0].source = 'feel:hit-stop';
  for (let index = 0; index < 7; index += 1) {
    run.rawSamples[index] = {
      ...run.rawSamples[index],
      atMs: 33_000 + index * 16.7,
      tick: 850 + index,
      timeScale: 0.12,
    };
    run.routeFacts.timeEffects.samples.push({
      atMs: 33_000 + index * 16.7,
      tick: 850 + index,
      scale: 0.12,
      source: 'feel:hit-stop',
      remainingMs: 100 - index * 16.7,
    });
  }
  run.attribution.frameMs = liveFrameSummary(run.rawSamples);
  result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('bounded gameplay hit-stop')));
});

test('PQ-023 H3 requires isolated and fully drained GPU attribution', () => {
  const receipt = validReceipt();
  const attributionRow = receipt.profiles[1].repetitions[2].attribution;
  attributionRow.measurementIsolation.frameTimingGpuTimersEnabled = true;
  attributionRow.gpuTimers.queryCounts.completed = 449;
  const result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('isolated GPU attribution')));
});

test('PQ-023 H3 rejects matched target regression without weakening quality', () => {
  const receipt = validReceipt();
  for (const run of receipt.profiles[1].repetitions) {
    run.rawSamples = samples(18.2);
    run.attribution.frameMs = liveFrameSummary(run.rawSamples);
  }
  receipt.qualityPreserving.settingsOverridesApplied = true;
  const result = validatePq023H3PerformanceReceipt(receipt);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('median p95')));
  assert.ok(result.failures.some((row) => row.includes('default quality')));
});
