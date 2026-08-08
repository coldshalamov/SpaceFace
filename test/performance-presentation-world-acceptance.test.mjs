import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PERFORMANCE_PRESENTATION_WORLD_MAX_SAMPLE_COUNT_DELTA,
  evaluatePresentationWorldPair,
  evaluatePresentationWorldRuntime,
} from '../scripts/lib/performancePresentationWorldAcceptance.mjs';

const B = 10;
const DIGEST = (character) => character.repeat(64);

test('literal 5B publication criterion passes but incomplete packet coverage remains partial', () => {
  const result = evaluatePresentationWorldRuntime(runtimeFixture('browser'));
  assert.equal(result.criterionPass, true, result.criterionFailures.join('; '));
  assert.equal(result.status, 'partial');
  assert.equal(result.pass, false);
  assert.equal(result.coverage.samePopulationSemanticParity, true);
  assert.equal(result.coverage.static5x, true);
  assert.equal(result.coverage.moving5x, false);
  assert.equal(result.coverage.farCulled5x, false);
  assert.equal(result.coverage.packetComplete, false);
  assert.deepEqual(result.openCriteria, [
    'moving-5x',
    'far-culled-5x',
    'churn-5x',
    'rebase-5x',
    'context-5x',
    'dense-combat',
    'travel',
    'damage-effects',
    'authored-admission',
    'save-continue',
    'exact-attachments-dynamic-closures',
    'downstream-pool-output',
    'presentation-rebuild',
    'presentation-context-loss-soak',
    'legacy-adapter-failure-atomicity',
    'image-temporal-parity',
  ]);
  assert.equal(result.metrics.baselineActive, B);
  assert.equal(result.metrics.denseSpawnCount, B * 4);
  assert.equal(result.metrics.denseTargetActive, B * 5);
  assert.equal(result.metrics.entityViewSyncSampleCountDelta, 0);
});

test('dense p95, sample exposure, shipped timeScale, and same-B parity fail closed', () => {
  const mutations = [
    ['generic validation fallback', (doc) => { doc.baseValidation.pass = false; doc.pass = true; }, /generic closure/],
    ['dense p95', (doc) => { windowBy(doc, 'presentation_world_dense_5x').cpu.renderWork.entityViewSync.p95 = 1.01; }, /slower/],
    ['sample exposure', (doc) => {
      windowBy(doc, 'presentation_world_dense_5x').cpu.renderWork.entityViewSync.samples +=
        PERFORMANCE_PRESENTATION_WORLD_MAX_SAMPLE_COUNT_DELTA + 1;
    }, /sample exposure/],
    ['paused shipped value', (doc) => {
      const window = windowBy(doc, 'presentation_world_dense_5x');
      window.scenarioPreparation.presentationWorld.shippedTimeScale = 0;
      window.scenarioPreparation.readiness.presentationWorld.shippedTimeScale = 0;
      window.scenarioPreparation.readiness.presentationWorld.timeScale = 0;
      window.settings.start.timeScale = 0;
      window.settings.end.timeScale = 0;
      window.rawSamples.forEach((sample) => { sample.timeScale = 0; });
    }, /shipped timeScale/],
    ['same-B parity', (doc) => {
      windowBy(doc, 'presentation_world_legacy_current')
        .scenarioPreparation.presentationWorld.legacyAdapter.samePopulationParity.legacy.records[0].lodLevel = 'lod2';
    }, /same-B/],
  ];
  for (const [name, mutate, fingerprint] of mutations) {
    const document = runtimeFixture('browser');
    mutate(document);
    const result = evaluatePresentationWorldRuntime(document);
    assert.equal(result.criterionPass, false, name);
    assert.equal(result.status, 'fail', name);
    assert.match(result.criterionFailures.join('\n'), fingerprint, name);
  }
});

test('exact 4B injection, churn generations, rebase pose, and cleanup are mandatory', () => {
  const mutations = [
    ['4B injection', (doc) => {
      windowBy(doc, 'presentation_world_dense_5x').scenarioPreparation.presentationWorld.spawnCount--;
    }, /exactly 4B/],
    ['churn generation', (doc) => {
      windowBy(doc, 'presentation_world_churn').scenarioPreparation.churn.settlement.generationsAdvanced = false;
    }, /retire\/reuse/],
    ['rebase local pose', (doc) => {
      windowBy(doc, 'presentation_world_rebase')
        .scenarioPreparation.readiness.presentationWorld.rebase.sample[0].local.x += 1;
    }, /render membrane/],
    ['cleanup', (doc) => {
      windowBy(doc, 'presentation_world_dense_5x').restoration.scenario.presentationWorld.resourcesReturned = false;
    }, /return presentation counts/],
  ];
  for (const [name, mutate, fingerprint] of mutations) {
    const document = runtimeFixture('browser');
    mutate(document);
    const result = evaluatePresentationWorldRuntime(document);
    assert.equal(result.criterionPass, false, name);
    assert.match(result.criterionFailures.join('\n'), fingerprint, name);
  }
});

test('raw churn lifecycle and publisher deltas fail closed when any field is missing or contradictory', () => {
  const worldKeys = [
    'allocations', 'retirements', 'spatialMoves', 'rebuilds', 'growths',
    'staleHandleRejects', 'duplicateIdRejects', 'chainGuardTrips',
  ];
  const publisherKeys = ['fullRebuilds', 'fallbackRebuilds', 'rangeFailures', 'applyFailures'];
  for (const key of worldKeys) {
    const document = runtimeFixture('browser');
    delete windowBy(document, 'presentation_world_churn')
      .scenarioPreparation.churn.settlement.counterDeltas[key];
    const result = evaluatePresentationWorldRuntime(document);
    assert.equal(result.criterionPass, false, `missing churn counter ${key}`);
    assert.match(result.criterionFailures.join('\n'), /churn did not retire\/reuse/);
  }
  for (const key of publisherKeys) {
    const document = runtimeFixture('browser');
    delete windowBy(document, 'presentation_world_churn')
      .scenarioPreparation.churn.settlement.publisherDeltas[key];
    const result = evaluatePresentationWorldRuntime(document);
    assert.equal(result.criterionPass, false, `missing publisher counter ${key}`);
  }
  const wrongSpatialMove = runtimeFixture('browser');
  windowBy(wrongSpatialMove, 'presentation_world_churn')
    .scenarioPreparation.churn.settlement.counterDeltas.spatialMoves--;
  assert.equal(evaluatePresentationWorldRuntime(wrongSpatialMove).criterionPass, false);

  const missingAbsence = runtimeFixture('browser');
  delete windowBy(missingAbsence, 'presentation_world_churn')
    .scenarioPreparation.churn.settlement.retiredAbsence[0].contactShadowPool;
  assert.equal(evaluatePresentationWorldRuntime(missingAbsence).criterionPass, false);

  for (const mutate of [
    (settlement) => { settlement.publisherAfter.lastError = 'publisher-failed'; },
    (settlement) => { delete settlement.publisherBefore.lastError; },
  ]) {
    const document = runtimeFixture('browser');
    mutate(windowBy(document, 'presentation_world_churn').scenarioPreparation.churn.settlement);
    assert.equal(evaluatePresentationWorldRuntime(document).criterionPass, false,
      'churn must bind the raw publisher error state even when producer booleans remain true');
  }
});

test('cleanup and rebase require finite raw snapshots and every named restoration field', () => {
  const commonChecks = [
    'presentationCountsRestored', 'presentationMeshesRestored', 'presentationResourcesIdle',
    'presentationLifecycleBalanced', 'presentationCapacityBounded', 'presentationNoRebuildOrError',
  ];
  for (const key of commonChecks) {
    const document = runtimeFixture('browser');
    delete windowBy(document, 'presentation_world_dense_5x').restoration.scenario.checks[key];
    assert.equal(evaluatePresentationWorldRuntime(document).criterionPass, false, `missing cleanup check ${key}`);
  }
  for (const [route, key] of [
    ['presentation_world_legacy_current', 'legacyAdapterRestored'],
    ['presentation_world_rebase', 'frameOriginRestored'],
  ]) {
    const document = runtimeFixture('browser');
    delete windowBy(document, route).restoration.scenario.checks[key];
    assert.equal(evaluatePresentationWorldRuntime(document).criterionPass, false, `missing ${key}`);
  }
  for (const [section, key] of [
    ['baseline', 'active'], ['baseline', 'capacity'], ['final', 'bound'], ['final', 'free'],
  ]) {
    const document = runtimeFixture('browser');
    delete windowBy(document, 'presentation_world_dense_5x')
      .restoration.scenario.presentationWorld[section][key];
    assert.equal(evaluatePresentationWorldRuntime(document).criterionPass, false, `missing cleanup ${section}.${key}`);
  }
  const missingRestored = runtimeFixture('browser');
  delete windowBy(missingRestored, 'presentation_world_dense_5x').restoration.scenario.restored;
  assert.equal(evaluatePresentationWorldRuntime(missingRestored).criterionPass, false);

  for (const mutate of [
    (cleanup) => { cleanup.final.publisher.lastError = 'publisher-failed'; },
    (cleanup) => { delete cleanup.baseline.publisher.lastError; },
  ]) {
    const document = runtimeFixture('browser');
    mutate(windowBy(document, 'presentation_world_dense_5x')
      .restoration.scenario.presentationWorld);
    assert.equal(evaluatePresentationWorldRuntime(document).criterionPass, false,
      'cleanup must bind the raw publisher error state even when restoration checks remain true');
  }

  for (const [section, key] of [
    ['diagnosticsBefore', 'spatialMoves'], ['publisherBefore', 'applyFailures'],
  ]) {
    const document = runtimeFixture('browser');
    delete windowBy(document, 'presentation_world_rebase')
      .scenarioPreparation.presentationWorld.rebase[section][key];
    assert.equal(evaluatePresentationWorldRuntime(document).criterionPass, false, `missing rebase ${section}.${key}`);
  }
  const missingRebasePublisherError = runtimeFixture('browser');
  delete windowBy(missingRebasePublisherError, 'presentation_world_rebase')
    .scenarioPreparation.presentationWorld.rebase.publisherBefore.lastError;
  assert.equal(evaluatePresentationWorldRuntime(missingRebasePublisherError).criterionPass, false);
});

test('same-B parity binds exact baseline population and alpha', () => {
  for (const mutate of [
    (parity) => { parity.population++; },
    (parity) => { parity.poseAlpha = 0.5; },
  ]) {
    const document = runtimeFixture('browser');
    mutate(windowBy(document, 'presentation_world_legacy_current')
      .scenarioPreparation.presentationWorld.legacyAdapter.samePopulationParity);
    assert.equal(evaluatePresentationWorldRuntime(document).criterionPass, false);
  }
});

test('unscoped terminal pass flags cannot close route-bound packet cells', () => {
  const document = runtimeFixture('browser');
  document.presentationWorldEvidence = {
    moving5x: { pass: true },
    imageTemporalParity: { pass: true },
  };
  const result = evaluatePresentationWorldRuntime(document);
  assert.equal(result.coverage.moving5x, false);
  assert.equal(result.coverage.imageTemporalParity, false);
  assert.equal(result.coverage.packetComplete, false);
  assert.ok(result.openCriteria.includes('moving-5x'));
  assert.ok(result.openCriteria.includes('image-temporal-parity'));
});

test('terminal cells require route-scoped references to verified real-shaped artifacts', () => {
  const document = runtimeFixture('browser');
  const routeTag = 'presentation_world_dense_5x_moving';
  const movingPreparation = densePreparation();
  movingPreparation.presentationWorld.coverage.motion = 'moving';
  document.windows.push(specializedWindow(
    routeTag,
    document.windows[0].scene.start,
    0.9,
    movingPreparation,
  ));
  const candidateDigest = DIGEST('b');
  const verified = {
    kind: 'screenshot',
    path: '.devshots/perf/presentation-world/browser/dense.png',
    bytes: 4096,
    sha256: DIGEST('3'),
  };
  document.authority = { digests: { candidateDigest } };
  document.artifacts = [verified];
  document.presentationWorldEvidence = {
    moving5x: {
      pass: true,
      runtimeKind: 'browser',
      candidateDigest,
      routeTags: [routeTag],
      artifacts: [{}],
    },
  };
  assert.equal(evaluatePresentationWorldRuntime(document).coverage.moving5x, false,
    'a nonempty but unbound artifact bag cannot close a terminal cell');

  document.presentationWorldEvidence.moving5x.artifacts = [{
    ...verified,
    routeTag,
  }];
  assert.equal(evaluatePresentationWorldRuntime(document).coverage.moving5x, true,
    'a route-scoped reference must resolve to the document artifact without requiring routeTag on the verified artifact');

  document.presentationWorldEvidence.moving5x.artifacts[0].sha256 = DIGEST('4');
  assert.equal(evaluatePresentationWorldRuntime(document).coverage.moving5x, false,
    'a route-scoped reference with a different content hash is not verified');
});

test('the current static mixed-culling dense route cannot close moving or far 5x cells', () => {
  for (const key of ['moving5x', 'farCulled5x']) {
    const document = runtimeFixture('browser');
    const candidateDigest = DIGEST('b');
    const routeTag = 'presentation_world_dense_5x';
    const verified = {
      kind: 'screenshot',
      path: `.devshots/perf/presentation-world/browser/${key}-static.png`,
      bytes: 4096,
      sha256: DIGEST('3'),
    };
    document.authority = { digests: { candidateDigest } };
    document.artifacts = [verified];
    document.presentationWorldEvidence = {
      [key]: {
        pass: true,
        runtimeKind: 'browser',
        candidateDigest,
        routeTags: [routeTag],
        artifacts: [{ ...verified, routeTag }],
      },
    };
    assert.equal(evaluatePresentationWorldRuntime(document).coverage.terminalEvidence[key], false,
      'the current static/current-camera-mixed window cannot substitute for a distinct moving or far-culled route');
  }
});

test('future 5x route evidence must be settled at shipped timeScale', () => {
  const makeDocument = () => {
    const document = runtimeFixture('browser');
    const routeTag = 'presentation_world_dense_5x_moving';
    const preparation = densePreparation();
    preparation.presentationWorld.coverage.motion = 'moving';
    document.windows.push(specializedWindow(
      routeTag,
      document.windows[0].scene.start,
      0.9,
      preparation,
    ));
    const candidateDigest = DIGEST('b');
    const verified = {
      kind: 'trace',
      path: '.devshots/perf/presentation-world/browser/moving-5x.json',
      bytes: 4096,
      sha256: DIGEST('3'),
    };
    document.authority = { digests: { candidateDigest } };
    document.artifacts = [verified];
    document.presentationWorldEvidence = {
      moving5x: {
        pass: true,
        runtimeKind: 'browser',
        candidateDigest,
        routeTags: [routeTag],
        artifacts: [{ ...verified, routeTag }],
      },
    };
    return { document, preparation, routeTag };
  };

  const unsettled = makeDocument();
  unsettled.preparation.baselineSettle.settled = false;
  assert.equal(evaluatePresentationWorldRuntime(unsettled.document)
    .coverage.terminalEvidence.moving5x, false);

  const paused = makeDocument();
  const window = windowBy(paused.document, paused.routeTag);
  paused.preparation.presentationWorld.shippedTimeScale = 0;
  paused.preparation.readiness.presentationWorld.shippedTimeScale = 0;
  paused.preparation.readiness.presentationWorld.timeScale = 0;
  window.settings.start.timeScale = 0;
  window.settings.end.timeScale = 0;
  window.rawSamples.forEach((sample) => { sample.timeScale = 0; });
  assert.equal(evaluatePresentationWorldRuntime(paused.document)
    .coverage.terminalEvidence.moving5x, false);
});

test('current low-scale churn, rebase, and context routes cannot close their 5x cells', () => {
  for (const [key, routeTag] of [
    ['churn5x', 'presentation_world_churn'],
    ['rebase5x', 'presentation_world_rebase'],
    ['context5x', 'context_recover_steady'],
  ]) {
    const document = runtimeFixture('browser');
    const candidateDigest = DIGEST('b');
    const verified = {
      kind: 'screenshot',
      path: `.devshots/perf/presentation-world/browser/${key}.png`,
      bytes: 4096,
      sha256: DIGEST('3'),
    };
    document.authority = { digests: { candidateDigest } };
    document.artifacts = [verified];
    document.presentationWorldEvidence = {
      [key]: {
        pass: true,
        runtimeKind: 'browser',
        candidateDigest,
        routeTags: [routeTag],
        artifacts: [{ ...verified, routeTag }],
      },
    };
    assert.equal(evaluatePresentationWorldRuntime(document).coverage.terminalEvidence[key], false,
      `${routeTag} must prove exact 4B admission and settled 5B publication before closing ${key}`);
  }
});

test('ordinary legacy evidence cannot close executable adapter failure atomicity', () => {
  const document = runtimeFixture('browser');
  const routeTag = 'presentation_world_legacy_failure_atomicity';
  const preparation = legacyPreparation();
  document.windows.push(specializedWindow(
    routeTag,
    document.windows[0].scene.start,
    1,
    preparation,
  ));
  const candidateDigest = DIGEST('b');
  const verified = {
    kind: 'trace',
    path: '.devshots/perf/presentation-world/browser/legacy-failure.json',
    bytes: 4096,
    sha256: DIGEST('3'),
  };
  document.authority = { digests: { candidateDigest } };
  document.artifacts = [verified];
  document.presentationWorldEvidence = {
    legacyAdapterFailureAtomicity: {
      pass: true,
      runtimeKind: 'browser',
      candidateDigest,
      routeTags: [routeTag],
      artifacts: [{ ...verified, routeTag }],
    },
  };
  assert.equal(evaluatePresentationWorldRuntime(document)
    .coverage.terminalEvidence.legacyAdapterFailureAtomicity, false,
  'a named failure route without an executable recovery receipt remains open');

  preparation.legacyAdapterFailureAtomicity = {
    injectedFailureObserved: true,
    descriptorRestored: true,
    queriesReset: true,
    frameReset: true,
    denseFallbackSucceeded: true,
    journalRetainedUntilRestored: true,
    finalRestorationSucceeded: true,
  };
  assert.equal(evaluatePresentationWorldRuntime(document)
    .coverage.terminalEvidence.legacyAdapterFailureAtomicity, true,
  'all executable failure and recovery fields plus a verified route artifact close only this cell');

  const ordinary = runtimeFixture('browser');
  ordinary.authority = { digests: { candidateDigest } };
  ordinary.artifacts = [verified];
  ordinary.presentationWorldEvidence = {
    legacyAdapterFailureAtomicity: {
      pass: true,
      runtimeKind: 'browser',
      candidateDigest,
      routeTags: ['presentation_world_legacy_current'],
      artifacts: [{ ...verified, routeTag: 'presentation_world_legacy_current' }],
    },
  };
  assert.equal(evaluatePresentationWorldRuntime(ordinary)
    .coverage.terminalEvidence.legacyAdapterFailureAtomicity, false,
  'the ordinary successful legacy comparator cannot substitute for injected failure evidence');
});

test('paired Browser and source Electron preserve candidate identity without a packaged claim', () => {
  const sourceCandidateDigest = DIGEST('a');
  const worktreeDigest = DIGEST('d');
  const browserCandidateDigest = DIGEST('b');
  const electronCandidateDigest = DIGEST('c');
  const browserDocument = runtimeFixture('browser');
  const electronDocument = runtimeFixture('electron');
  const browserEvidence = authorityEvidence('browser', 'claim-browser', browserCandidateDigest, sourceCandidateDigest, worktreeDigest);
  const electronEvidence = authorityEvidence('electron', 'claim-electron', electronCandidateDigest, sourceCandidateDigest, worktreeDigest);
  browserDocument.authority = attributionAuthority(browserEvidence);
  electronDocument.authority = attributionAuthority(electronEvidence);
  const result = evaluatePresentationWorldPair({
    browserEvidence,
    electronEvidence,
    browserDocument,
    electronDocument,
    browserLedger: consumedLedger(browserEvidence),
    electronLedger: consumedLedger(electronEvidence),
    currentFingerprint: { id: 'current', digest: worktreeDigest },
  });
  assert.equal(result.criterionPass, true, result.failures.join('; '));
  assert.equal(result.status, 'partial');
  assert.equal(result.pass, false);
  assert.equal(result.electronScope, 'source-native-electron');
  assert.equal(result.packagedElectronClaim, false);
});

test('paired authority fails closed on digest, seed, viewport, GPU, settings, and route drift', () => {
  const makePair = () => {
    const sourceCandidateDigest = DIGEST('a');
    const worktreeDigest = DIGEST('d');
    const browserCandidateDigest = DIGEST('b');
    const electronCandidateDigest = DIGEST('c');
    const browserDocument = runtimeFixture('browser');
    const electronDocument = runtimeFixture('electron');
    const browserEvidence = authorityEvidence('browser', 'claim-browser', browserCandidateDigest, sourceCandidateDigest, worktreeDigest);
    const electronEvidence = authorityEvidence('electron', 'claim-electron', electronCandidateDigest, sourceCandidateDigest, worktreeDigest);
    browserDocument.authority = attributionAuthority(browserEvidence);
    electronDocument.authority = attributionAuthority(electronEvidence);
    return {
      browserEvidence, electronEvidence, browserDocument, electronDocument,
      browserLedger: consumedLedger(browserEvidence),
      electronLedger: consumedLedger(electronEvidence),
      currentFingerprint: { id: 'current', digest: worktreeDigest },
    };
  };
  const mutations = [
    (pair) => { pair.electronEvidence.digests.saveDigest = DIGEST('9'); },
    (pair) => { pair.electronDocument.environment.seed = 48; },
    (pair) => { pair.electronDocument.environment.viewport.devicePixelRatio = 2; },
    (pair) => { pair.electronDocument.environment.gpu.renderer = 'Different GPU'; },
    (pair) => { pair.electronDocument.environment.defaultSettings.video.renderScale = 0.75; },
    (pair) => { pair.electronDocument.windows[0].scenarioDefinition.id = 'different-route'; },
    (pair) => {
      pair.browserEvidence.sourceCandidateDigest = DIGEST('9');
      pair.browserEvidence.digests.sourceCandidateDigest = DIGEST('9');
      pair.electronEvidence.sourceCandidateDigest = DIGEST('9');
      pair.electronEvidence.digests.sourceCandidateDigest = DIGEST('9');
    },
    (pair) => {
      pair.browserEvidence.digests.saveDigest = DIGEST('9');
      pair.electronEvidence.digests.saveDigest = DIGEST('9');
    },
  ];
  for (const mutate of mutations) {
    const pair = makePair();
    mutate(pair);
    assert.equal(evaluatePresentationWorldPair(pair).criterionPass, false);
  }
});

function runtimeFixture(runtimeKind) {
  const scene = {
    objects: 100,
    visibleObjects: 80,
    meshes: 50,
    visibleMeshes: 40,
    visibleInstances: 40,
    castShadowObjects: 0,
    visibleMeshByCategory: { ship: 4 },
    visibleShipMeshByRole: { hull: 4 },
    visibleShipMeshByPart: { kestrel: 4 },
    surfaces: { opaque: 40, transparent: 2 },
    roles: { canopy: 1, plume: 1, fan: 0, signal: 1, decal: 0, shadowCaster: 0 },
    authoredShipStates: { authored: 4 },
    authoredShipAdmission: { relevant: 4, ready: 4, pending: 0, fallback: 0, missingMesh: 0 },
    authoredStaticBatches: { visible: 0, hidden: 0, total: 0 },
    authoredPools: { totalChunks: 0, visibleChunks: 0, emptyChunks: 0, visibleInstances: 0, capacity: 0 },
    stationPlaceHlod: { stationEntities: 1, placeEntities: 0, detailedVisible: 1, proxyVisible: 0 },
  };
  const windows = [
    baseWindow('flight_steady', scene, 0.4),
    specializedWindow('presentation_world_legacy_current', scene, 1, legacyPreparation()),
    specializedWindow('presentation_world_dense_5x', scene, 0.9, densePreparation()),
    specializedWindow('presentation_world_churn', scene, 0.7, churnPreparation()),
    specializedWindow('presentation_world_rebase', scene, 0.6, rebasePreparation()),
    baseWindow('context_recover_steady', scene, 0.4),
  ];
  return {
    pass: true,
    baseValidation: { pass: true, failures: [] },
    runtimeKind,
    primaryAcceptance: true,
    environment: {
      runtimeKind,
      seed: 47,
      viewport: { width: 1280, height: 720, configuredWidth: 1280, configuredHeight: 720, devicePixelRatio: 1 },
      gpu: {
        api: 'webgl2', vendor: 'Intel', renderer: 'Intel D3D11', version: 'WebGL 2.0',
        shadingLanguageVersion: 'WebGL GLSL ES 3.00', source: 'game-renderer',
      },
      browser: { platform: 'Win32', language: 'en-US', hardwareConcurrency: 16, deviceMemoryGb: 16 },
      defaultSettings: { video: { bloom: true, particleQuality: 'high', renderScale: 1 } },
      ...(runtimeKind === 'electron' ? { electronRuntime: { packaged: false, appIsPackaged: false } } : {}),
    },
    windows,
  };
}

function baseWindow(routeTag, scene, p95) {
  const settings = { video: { bloom: true, particleQuality: 'high', renderScale: 1 }, timeScale: 1 };
  return {
    routeTag,
    diagnosticVariant: 'baseline',
    settings: { start: structuredClone(settings), end: structuredClone(settings) },
    rawSamples: Array.from({ length: 120 }, () => ({ timeScale: 1 })),
    cpu: { renderWork: { entityViewSync: { p95, samples: 300 } } },
    scene: { start: structuredClone(scene), end: structuredClone(scene) },
    scenarioDefinition: { id: routeTag, presentationWorldAcceptance: true },
    restoration: { restored: true },
  };
}

function specializedWindow(routeTag, scene, p95, scenarioPreparation) {
  const window = baseWindow(routeTag, scene, p95);
  window.scenarioPreparation = scenarioPreparation;
  window.restoration.scenario = cleanupReceipt(
    scenarioPreparation.presentationWorld.baseline,
    scenarioPreparation.readiness.presentationWorld.diagnostics,
    routeTag,
  );
  return window;
}

function baseline() {
  return {
    active: B,
    bound: B,
    meshes: B,
    capacity: 64,
    free: 0,
    diagnostics: diagnostics({ active: B, bound: B, capacity: 64, highWater: B }),
    publisher: publisher(),
    frameOrigin: { x: 0, z: 0, seq: 1 },
  };
}

function settled() {
  return { settled: true, active: B, bound: B, meshes: B, timeScale: 1 };
}

function ready(active = B) {
  let capacity = 64;
  let growths = 1;
  while (capacity < active) {
    capacity *= 2;
    growths++;
  }
  const injected = Math.max(0, active - B);
  return {
    authoredShips: active - B,
    renderedShips: active - B,
    presentationWorld: {
      active,
      bound: active,
      meshes: active,
      targetActive: active,
      retiredAbsent: true,
      frameOriginSeq: 1,
      membraneSeq: 1,
      shippedTimeScale: 1,
      timeScale: 1,
      timeScalePreserved: true,
      diagnostics: diagnostics({
        active,
        bound: active,
        capacity,
        highWater: active,
        allocations: B + injected,
        growths,
        spatialMoves: B + injected,
      }),
      publisher: publisher(),
    },
  };
}

function legacyPreparation() {
  const semantics = {
    records: [{
      id: '1', root: 'root-1', visible: true, viewCulled: false,
      radius: 24, renderOrder: 0,
      pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
      lodLevel: 'lod0',
      categories: { contactShadow: true, shipAuxiliary: true, authored: true, asteroidInstance: false },
      closures: {
        shieldVisible: false, shieldRoot: 'shield-1', hullRoot: 'hull-1', authoredAssetState: 'authored',
        hlodDetailedVisible: 1, hlodProxyVisible: 0, hlodSwapped: false,
      },
      descendants: [{
        uuid: 'root-1', parent: null, name: 'Kestrel', mesh: false, visible: true,
        renderOrder: 0, geometry: null, materials: [], position: { x: 0, y: 0, z: 0 },
      }],
    }],
    logicalPools: { contactShadows: ['1'], shipAuxiliary: ['1'], authored: ['1'], asteroidInstances: [] },
    camera: { x: 0, y: 25, z: 30, qx: 0, qy: 0, qz: 0, qw: 1, fov: 50, aspect: 1.77778 },
  };
  return {
    baselineSettle: settled(),
    readiness: ready(B),
    presentationWorld: {
      mode: 'legacy-current', baseline: baseline(), spawnCount: 0, targetActive: B,
      shippedTimeScale: 1,
      coverage: { population: 'current', motion: 'static', culling: 'current-camera-mixed' },
      legacyAdapter: {
        installed: true,
        identity: 'renderer.syncEntityViews@75238d15^',
        source: 'live-current-GameState-and-mesh-map',
        permanentSelector: false,
        samePopulationParity: { pass: true, poseAlpha: 1, population: B, dense: structuredClone(semantics), legacy: structuredClone(semantics) },
      },
    },
  };
}

function densePreparation() {
  return {
    baselineSettle: settled(),
    readiness: ready(B * 5),
    presentationWorld: {
      mode: 'dense-5x', baseline: baseline(), spawnCount: B * 4, targetActive: B * 5,
      shippedTimeScale: 1,
      coverage: { population: '5x', motion: 'static', culling: 'current-camera-mixed' },
    },
  };
}

function churnPreparation() {
  const preparation = {
    baselineSettle: settled(),
    readiness: ready(B * 2),
    presentationWorld: {
      mode: 'churn', baseline: baseline(), spawnCount: B, targetActive: B * 2,
      shippedTimeScale: 1,
      coverage: { population: 'current', motion: 'static', culling: 'current-camera-mixed' },
    },
  };
  preparation.churn = {
    churnCount: 5,
    settlement: {
      counterDeltas: {
        allocations: 5, retirements: 5, spatialMoves: 5, rebuilds: 0, growths: 0,
        staleHandleRejects: 0, duplicateIdRejects: 0, chainGuardTrips: 0,
      },
      publisherDeltas: { fullRebuilds: 0, fallbackRebuilds: 0, rangeFailures: 0, applyFailures: 0 },
      publisherBefore: publisher(),
      publisherAfter: publisher(),
      diagnosticsAfter: diagnostics({
        active: B * 2, bound: B * 2, free: 0, capacity: 64, highWater: B * 2,
        allocations: B + B + 5, retirements: 5, spatialMoves: B + B + 5,
      }),
      meshes: B * 2,
      exactCycle: true,
      capacityStable: true,
      highWaterStable: true,
      noUnexpectedWorldMutation: true,
      noPublisherFailure: true,
      generationsAdvanced: true,
      retiredRootsDetached: true,
      retiredAbsence: Array.from({ length: 5 }, (_, index) => ({
        id: index + 100,
        world: true,
        mesh: true,
        frame: true,
        contactShadowPool: true,
        asteroidPool: true,
      })),
    },
  };
  preparation.readiness.presentationWorld.diagnostics = structuredClone(
    preparation.churn.settlement.diagnosticsAfter,
  );
  return preparation;
}

function rebasePreparation() {
  const preparation = {
    baselineSettle: settled(),
    readiness: ready(B),
    presentationWorld: {
      mode: 'rebase', baseline: baseline(), spawnCount: 0, targetActive: B,
      shippedTimeScale: 1,
      coverage: { population: 'current', motion: 'static', culling: 'current-camera-mixed' },
      rebase: {
        applied: true,
        before: { x: 0, z: 0, seq: 1 },
        target: { x: 4096, z: -4096, seq: 2 },
        sampleBefore: [{ id: 1, root: 'root-1', world: { x: 100, z: 200 }, local: { x: 100, z: 200 } }],
        diagnosticsBefore: diagnostics({ active: B, bound: B, capacity: 64, highWater: B }),
        publisherBefore: publisher(),
      },
    },
  };
  preparation.readiness.presentationWorld.frameOriginSeq = 2;
  preparation.readiness.presentationWorld.membraneSeq = 2;
  preparation.readiness.presentationWorld.rebase = {
    sample: [{ id: 1, root: 'root-1', world: { x: 100, z: 200 }, local: { x: -3996, z: 4296 } }],
    diagnostics: diagnostics({ active: B, bound: B, capacity: 64, highWater: B }),
    publisher: publisher(),
  };
  return preparation;
}

function cleanupReceipt(base, readyDiagnostics, routeTag) {
  const retired = readyDiagnostics.allocations - base.diagnostics.allocations
    + base.diagnostics.retirements;
  const checks = {
    presentationCountsRestored: true,
    presentationMeshesRestored: true,
    presentationResourcesIdle: true,
    presentationLifecycleBalanced: true,
    presentationCapacityBounded: true,
    presentationNoRebuildOrError: true,
  };
  if (routeTag === 'presentation_world_legacy_current') checks.legacyAdapterRestored = true;
  if (routeTag === 'presentation_world_rebase') checks.frameOriginRestored = true;
  return {
    restored: true,
    checks,
    remainingInjectedIds: [],
    presentationWorld: {
      baseline: structuredClone(base),
      final: {
        active: B,
        bound: B,
        meshes: B,
        capacity: readyDiagnostics.capacity,
        free: readyDiagnostics.highWater - B,
        diagnostics: diagnostics({
          active: B,
          bound: B,
          capacity: readyDiagnostics.capacity,
          free: readyDiagnostics.highWater - B,
          highWater: readyDiagnostics.highWater,
          allocations: readyDiagnostics.allocations,
          retirements: retired,
          growths: readyDiagnostics.growths,
          spatialMoves: readyDiagnostics.spatialMoves,
        }),
        publisher: publisher(),
      },
      resourcesReturned: true,
    },
  };
}

function diagnostics(overrides = {}) {
  return {
    active: 0, bound: 0, capacity: 64, free: 0, highWater: 0,
    allocations: 10, retirements: 0, rebuilds: 0, growths: 1,
    staleHandleRejects: 0, duplicateIdRejects: 0, spatialMoves: 0,
    chainGuardTrips: 0, maxRadiusRecomputes: 0,
    ...overrides,
  };
}

function publisher() {
  return {
    appliedRecords: 0, spawnRecords: 0, destroyRecords: 0, transformRecords: 0,
    visualRecords: 0, idempotentFrames: 0, fullRebuilds: 0, fallbackRebuilds: 0,
    rangeFailures: 0, applyFailures: 0, lastError: null,
  };
}

function authorityEvidence(runtimeKind, claimId, candidateDigest, sourceCandidateDigest, worktreeDigest) {
  return {
    pass: true,
    primaryAcceptance: true,
    runtimeKind,
    claimId,
    candidateDigest,
    sourceCandidateDigest,
    digests: {
      candidateDigest,
      sourceCandidateDigest,
      scenarioManifestDigest: DIGEST('e'),
      saveDigest: DIGEST('f'),
      inputTapeDigest: DIGEST('1'),
      cameraManifestDigest: DIGEST('2'),
    },
    closure: { worktree: { id: 'current', digest: worktreeDigest } },
  };
}

function attributionAuthority(evidence) {
  return {
    claimId: evidence.claimId,
    digests: structuredClone(evidence.digests),
  };
}

function consumedLedger(evidence) {
  return {
    claimId: evidence.claimId,
    runtimeKind: evidence.runtimeKind,
    candidateDigest: evidence.candidateDigest,
    digests: structuredClone(evidence.digests),
  };
}

function windowBy(document, routeTag) {
  return document.windows.find((window) => window.routeTag === routeTag);
}
