import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { strictWorktreeFingerprint } from './releaseSoakContracts.mjs';
import { readConsumedClaimLedgerEntry } from './validationBroker.mjs';
import { loadValidationManifestById } from './validationManifestRegistry.mjs';

export const PERFORMANCE_PRESENTATION_WORLD_ACCEPTANCE_SCHEMA =
  'spaceface.performancePresentationWorldAcceptance.v1';
export const PERFORMANCE_PRESENTATION_WORLD_MAX_SAMPLE_COUNT_DELTA = 3;

export const PERFORMANCE_PRESENTATION_WORLD_ROUTES = Object.freeze([
  'flight_steady',
  'presentation_world_legacy_current',
  'presentation_world_dense_5x',
  'presentation_world_churn',
  'presentation_world_rebase',
  'context_recover_steady',
]);

const RUNTIMES = Object.freeze(['browser', 'electron']);
const MANIFEST_PREFIX = 'performance-presentation-world-';
const RETIRED_ABSENCE_KEYS = Object.freeze([
  'world', 'mesh', 'frame', 'contactShadowPool', 'asteroidPool',
]);
const WORLD_COUNTER_KEYS = Object.freeze([
  'active', 'bound', 'capacity', 'highWater', 'free',
  'allocations', 'retirements', 'rebuilds', 'growths', 'spatialMoves',
  'staleHandleRejects', 'duplicateIdRejects', 'chainGuardTrips',
]);
const PUBLISHER_COUNTER_KEYS = Object.freeze([
  'fullRebuilds', 'fallbackRebuilds', 'rangeFailures', 'applyFailures',
]);
const AUTHORITY_DIGEST_KEYS = Object.freeze([
  'sourceCandidateDigest',
  'scenarioManifestDigest',
  'saveDigest',
  'inputTapeDigest',
  'cameraManifestDigest',
]);
const COMMON_RESTORE_CHECKS = Object.freeze([
  'presentationCountsRestored',
  'presentationMeshesRestored',
  'presentationResourcesIdle',
  'presentationLifecycleBalanced',
  'presentationCapacityBounded',
  'presentationNoRebuildOrError',
]);
const TERMINAL_EVIDENCE_CELLS = Object.freeze([
  ['moving-5x', 'moving5x', ['presentation_world_dense_5x_moving'], { requireFiveX: true, motion: 'moving' }],
  ['far-culled-5x', 'farCulled5x', ['presentation_world_dense_5x_far_culled'], { requireFiveX: true, culling: 'far-culled' }],
  ['churn-5x', 'churn5x', ['presentation_world_churn'], { requireFiveX: true }],
  ['rebase-5x', 'rebase5x', ['presentation_world_rebase'], { requireFiveX: true }],
  ['context-5x', 'context5x', ['context_recover_steady'], { requireFiveX: true }],
  ['dense-combat', 'denseCombat', ['combat_vfx_burst']],
  ['travel', 'travel', ['presentation_world_rebase']],
  ['damage-effects', 'damageEffects', ['combat_vfx_burst']],
  ['authored-admission', 'authoredAdmission', ['presentation_world_dense_5x']],
  ['save-continue', 'saveContinue', ['autosave_under_load']],
  ['exact-attachments-dynamic-closures', 'attachmentsDynamicClosures', ['presentation_world_dense_5x']],
  ['downstream-pool-output', 'downstreamPoolOutput', ['presentation_world_dense_5x']],
  ['presentation-rebuild', 'presentationRebuild', ['context_recover_steady']],
  ['presentation-context-loss-soak', 'presentationContextLossSoak', ['context_recover_steady']],
  [
    'legacy-adapter-failure-atomicity',
    'legacyAdapterFailureAtomicity',
    ['presentation_world_legacy_failure_atomicity'],
    { requireLegacyFailureAtomicity: true },
  ],
  ['image-temporal-parity', 'imageTemporalParity', ['presentation_world_legacy_current', 'presentation_world_dense_5x']],
]);

export function evaluatePresentationWorldRuntime(document, { runtimeKind = 'browser' } = {}) {
  const failures = [];
  const windows = new Map((document?.windows || []).map((window) => [window?.routeTag, window]));
  for (const route of PERFORMANCE_PRESENTATION_WORLD_ROUTES) {
    if (!windows.has(route)) failures.push(`${route} window is missing`);
  }
  if (document?.baseValidation?.pass !== true) {
    failures.push('attribution document must pass its generic closure contract');
  }
  if (document?.runtimeKind !== runtimeKind) failures.push('attribution runtime identity is invalid');
  if (document?.primaryAcceptance !== true) failures.push('runtime evidence must be primary acceptance');

  for (const route of PERFORMANCE_PRESENTATION_WORLD_ROUTES) {
    const window = windows.get(route);
    if (!window) continue;
    if (window.diagnosticVariant !== 'baseline') failures.push(`${route} must retain shipped baseline settings`);
    if (window.restoration?.restored !== true) failures.push(`${route} did not restore exactly`);
    if (stableJson(window.settings?.start) !== stableJson(window.settings?.end)) {
      failures.push(`${route} changed quality/settings during measurement`);
    }
    const timer = window.cpu?.renderWork?.entityViewSync;
    const samples = finite(timer?.samples);
    const p95 = finite(timer?.p95);
    if (!timer || !(p95 > 0) || !(samples >= 60 && samples <= 2048)) {
      failures.push(`${route} lacks entityViewSync renderWork telemetry`);
    }
  }

  const legacy = windows.get('presentation_world_legacy_current');
  const dense = windows.get('presentation_world_dense_5x');
  const churn = windows.get('presentation_world_churn');
  const rebase = windows.get('presentation_world_rebase');
  const legacyPresentation = legacy?.scenarioPreparation?.presentationWorld;
  const densePresentation = dense?.scenarioPreparation?.presentationWorld;
  const denseReady = dense?.scenarioPreparation?.readiness;
  const churnPresentation = churn?.scenarioPreparation?.presentationWorld;
  const churnReady = churn?.scenarioPreparation?.readiness;
  const churnReceipt = churn?.scenarioPreparation?.churn;
  const rebasePresentation = rebase?.scenarioPreparation?.presentationWorld;
  const rebaseReady = rebase?.scenarioPreparation?.readiness;
  let specializedStable = true;
  let specializedTimeScalePreserved = true;

  for (const [label, window] of [['legacy-current', legacy], ['dense-5x', dense], ['churn', churn], ['rebase', rebase]]) {
    if (stableJson(structuralProjection(window?.scene?.start)) !== stableJson(structuralProjection(window?.scene?.end))) {
      failures.push(`${label} changed structural presentation semantics inside its settled window`);
      specializedStable = false;
    }
    const presentation = window?.scenarioPreparation?.presentationWorld;
    const readiness = window?.scenarioPreparation?.readiness?.presentationWorld;
    const settled = window?.scenarioPreparation?.baselineSettle;
    const shippedTimeScale = presentation?.shippedTimeScale;
    const baseline = presentation?.baseline;
    if (settled?.settled !== true
        || finite(settled?.active) !== finite(baseline?.active)
        || finite(settled?.bound) !== finite(baseline?.bound)
        || finite(settled?.meshes) !== finite(baseline?.meshes)
        || finite(baseline?.active) !== finite(baseline?.bound)
        || finite(baseline?.bound) !== finite(baseline?.meshes)) {
      failures.push(`${label} did not capture B after the pre-injection PresentationWorld settle barrier`);
    }
    if (shippedTimeScale !== 1
        || readiness?.timeScalePreserved !== true
        || readiness?.shippedTimeScale !== shippedTimeScale
        || readiness?.timeScale !== shippedTimeScale
        || window?.settings?.start?.timeScale !== shippedTimeScale
        || window?.settings?.end?.timeScale !== shippedTimeScale
        || !Array.isArray(window?.rawSamples)
        || window.rawSamples.length === 0
        || window.rawSamples.some((sample) => sample?.timeScale !== shippedTimeScale)) {
      failures.push(`${label} did not preserve shipped timeScale through journal readiness and measurement`);
      specializedTimeScalePreserved = false;
    }
  }

  if (legacyPresentation?.legacyAdapter?.installed !== true
      || legacyPresentation.legacyAdapter.identity !== 'renderer.syncEntityViews@75238d15^'
      || legacyPresentation.legacyAdapter.source !== 'live-current-GameState-and-mesh-map'
      || legacyPresentation.legacyAdapter.permanentSelector !== false) {
    failures.push('legacy-current window lacks the reviewed temporary broad adapter identity');
  }
  const baselineActive = finite(legacyPresentation?.baseline?.active);
  const baselineBound = finite(legacyPresentation?.baseline?.bound);
  const baselineMeshes = finite(legacyPresentation?.baseline?.meshes);
  const samePopulationParity = legacyPresentation?.legacyAdapter?.samePopulationParity;
  const samePopulationParityPass = samePopulationParity?.pass === true
    && samePopulationParity?.poseAlpha === 1
    && finite(samePopulationParity?.population) === baselineBound
    && baselineBound > 0
    && stableJson(samePopulationParity?.dense) === stableJson(samePopulationParity?.legacy)
    && Array.isArray(samePopulationParity?.dense?.records)
    && samePopulationParity.dense.records.length > 0;
  if (!samePopulationParityPass) {
    failures.push('legacy-current lacks alpha=1 same-B ordered root/descendant/pose/visibility/LOD/category semantic parity');
  }
  const denseBaselineActive = finite(densePresentation?.baseline?.active);
  const denseBaselineBound = finite(densePresentation?.baseline?.bound);
  const denseBaselineMeshes = finite(densePresentation?.baseline?.meshes);
  const denseSpawnCount = finite(densePresentation?.spawnCount);
  const denseTargetActive = finite(densePresentation?.targetActive);
  if (!(baselineBound > 0)
      || baselineActive !== baselineBound || baselineMeshes !== baselineBound
      || denseBaselineActive !== baselineBound
      || denseBaselineBound !== baselineBound
      || denseBaselineMeshes !== baselineBound) {
    failures.push('legacy-current and dense-5x must share one settled positive active=bound=meshes baseline B');
  }
  const exactDensePopulation = denseSpawnCount === baselineBound * 4
    && denseTargetActive === baselineBound * 5;
  if (!exactDensePopulation) {
    failures.push('dense-5x must add exactly 4B authored ships to the live B baseline');
  }
  const denseReadyAtExactTarget = finite(denseReady?.authoredShips) === denseSpawnCount
      && finite(denseReady?.renderedShips) === denseSpawnCount
      && finite(denseReady?.presentationWorld?.active) === denseTargetActive
      && finite(denseReady?.presentationWorld?.bound) === denseTargetActive
      && finite(denseReady?.presentationWorld?.meshes) === denseTargetActive
      && finite(denseReady?.presentationWorld?.targetActive) === denseTargetActive;
  if (!denseReadyAtExactTarget) {
    failures.push('dense-5x authored meshes, journal publication, or world count did not reach the exact target');
  }
  const denseBaselineDiagnostics = densePresentation?.baseline?.diagnostics;
  const denseReadyDiagnostics = denseReady?.presentationWorld?.diagnostics;
  const denseGrowth = expectedGrowth(
    finite(denseBaselineDiagnostics?.capacity),
    denseTargetActive,
  );
  const denseAdmissionLifecyclePass = exactDensePopulation
    && diagnosticsInternallyConsistent(denseBaselineDiagnostics, {
      active: denseBaselineActive,
      bound: denseBaselineBound,
    })
    && diagnosticsInternallyConsistent(denseReadyDiagnostics, {
      active: denseTargetActive,
      bound: denseTargetActive,
    })
    && denseGrowth != null
    && finite(denseReadyDiagnostics?.allocations) - finite(denseBaselineDiagnostics?.allocations) === denseSpawnCount
    && finite(denseReadyDiagnostics?.growths) - finite(denseBaselineDiagnostics?.growths) === denseGrowth.count
    && finite(denseReadyDiagnostics?.capacity) === denseGrowth.capacity
    && finite(denseReadyDiagnostics?.highWater)
      === Math.max(finite(denseBaselineDiagnostics?.highWater), denseTargetActive)
    && zeroCounterDelta(denseBaselineDiagnostics, denseReadyDiagnostics, [
      'rebuilds', 'staleHandleRejects', 'duplicateIdRejects', 'chainGuardTrips',
    ]);
  if (!denseAdmissionLifecyclePass) {
    failures.push('dense-5x allocation, doubling growth, high-water, or diagnostic lifecycle is not exact');
  }
  const churnSettlement = churnReceipt?.settlement;
  const churnCount = finite(churnReceipt?.churnCount);
  const churnCounters = churnSettlement?.counterDeltas;
  const churnPublisher = churnSettlement?.publisherDeltas;
  const churnTarget = finite(churnPresentation?.targetActive);
  const churnRetiredAbsent = Array.isArray(churnSettlement?.retiredAbsence)
    && churnSettlement.retiredAbsence.length === churnCount
    && churnSettlement.retiredAbsence.every((entry) => RETIRED_ABSENCE_KEYS
      .every((key) => entry?.[key] === true));
  const churnLifecyclePass = churnCount > 0
    && churnReady?.presentationWorld?.retiredAbsent === true
    && finite(churnReady?.presentationWorld?.active) === churnTarget
    && finite(churnReady?.presentationWorld?.bound) === churnTarget
    && finite(churnReady?.presentationWorld?.meshes) === churnTarget
    && finite(churnSettlement?.diagnosticsAfter?.active) === churnTarget
    && finite(churnSettlement?.diagnosticsAfter?.bound) === churnTarget
    && finite(churnSettlement?.meshes) === churnTarget
    && diagnosticsInternallyConsistent(churnSettlement?.diagnosticsAfter, {
      active: churnTarget,
      bound: churnTarget,
    })
    && diagnosticsInternallyConsistent(churnSettlement?.diagnosticsBefore, {
      active: churnTarget,
      bound: churnTarget,
    })
    && zeroCounterDelta(churnSettlement?.diagnosticsBefore, churnSettlement?.diagnosticsAfter, [
      'active', 'bound', 'capacity', 'highWater', 'free',
    ])
    && counterDeltasMatchSnapshots(
      churnSettlement?.diagnosticsBefore, churnSettlement?.diagnosticsAfter, churnCounters,
      ['allocations', 'retirements', 'spatialMoves', 'rebuilds', 'growths',
        'staleHandleRejects', 'duplicateIdRejects', 'chainGuardTrips'],
    )
    && counterDeltasMatchSnapshots(
      churnSettlement?.publisherBefore, churnSettlement?.publisherAfter, churnPublisher,
      PUBLISHER_COUNTER_KEYS,
    )
    && finite(churnCounters?.allocations) === churnCount
    && finite(churnCounters?.retirements) === churnCount
    && finite(churnCounters?.spatialMoves) === churnCount
    && ['rebuilds', 'growths', 'staleHandleRejects', 'duplicateIdRejects', 'chainGuardTrips']
      .every((key) => finite(churnCounters?.[key]) === 0)
    && PUBLISHER_COUNTER_KEYS.every((key) => finite(churnPublisher?.[key]) === 0)
    && samePublisherError(churnSettlement?.publisherBefore, churnSettlement?.publisherAfter)
    && churnSettlement?.exactCycle === true
    && churnSettlement?.capacityStable === true
    && churnSettlement?.highWaterStable === true
    && churnSettlement?.noUnexpectedWorldMutation === true
    && churnSettlement?.noPublisherFailure === true
    && churnSettlement?.generationsAdvanced === true
    && churnSettlement?.retiredRootsDetached === true
    && churnRetiredAbsent;
  if (!churnLifecyclePass) {
    failures.push('churn did not retire/reuse live publication handles at a stable target count');
  }
  const rebaseSemanticsPass = evaluateRebaseSemantics(
    rebasePresentation?.rebase,
    rebaseReady?.presentationWorld?.rebase,
  );
  if (rebasePresentation?.rebase?.applied !== true
      || rebaseReady?.presentationWorld?.frameOriginSeq !== rebaseReady?.presentationWorld?.membraneSeq
      || !rebaseSemanticsPass) {
    failures.push('rebase did not reach the render membrane under the scenario journal');
  }
  for (const [label, window] of [['legacy-current', legacy], ['dense-5x', dense], ['churn', churn], ['rebase', rebase]]) {
    const scenarioRestore = window?.restoration?.scenario;
    const baseline = scenarioRestore?.presentationWorld?.baseline;
    const final = scenarioRestore?.presentationWorld?.final;
    const baselineCounts = numericSnapshot(baseline, ['active', 'bound', 'meshes', 'capacity']);
    const finalCounts = numericSnapshot(final, ['active', 'bound', 'meshes', 'capacity', 'free']);
    const baselineDiagnostics = baseline?.diagnostics;
    const finalDiagnostics = final?.diagnostics;
    const readyDiagnostics = window?.scenarioPreparation?.readiness?.presentationWorld?.diagnostics;
    const requiredChecks = [
      ...COMMON_RESTORE_CHECKS,
      ...(label === 'legacy-current' ? ['legacyAdapterRestored'] : []),
      ...(label === 'rebase' ? ['frameOriginRestored'] : []),
    ];
    const rawLifecycleBalanced = hasFiniteCounters(baselineDiagnostics, ['allocations', 'retirements'])
      && hasFiniteCounters(finalDiagnostics, ['allocations', 'retirements'])
      && finite(finalDiagnostics.allocations) - finite(baselineDiagnostics.allocations)
        === finite(finalDiagnostics.retirements) - finite(baselineDiagnostics.retirements);
    const cleanupPass = scenarioRestore?.restored === true
        && scenarioRestore?.presentationWorld?.resourcesReturned === true
        && baselineCounts != null
        && finalCounts != null
        && finalCounts.active === baselineCounts.active
        && finalCounts.bound === baselineCounts.bound
        && finalCounts.meshes === baselineCounts.meshes
        && finalCounts.capacity >= baselineCounts.capacity
        && diagnosticsInternallyConsistent(finalDiagnostics, {
          active: finalCounts.active,
          bound: finalCounts.bound,
        })
        && finite(finalDiagnostics?.capacity) === finalCounts.capacity
        && finite(finalDiagnostics?.free) === finalCounts.free
        && rawLifecycleBalanced
        && readyDiagnostics != null
        && finite(finalDiagnostics?.capacity) === finite(readyDiagnostics?.capacity)
        && finite(finalDiagnostics?.highWater) === finite(readyDiagnostics?.highWater)
        && finite(finalDiagnostics?.growths) === finite(readyDiagnostics?.growths)
        && zeroCounterDelta(baselineDiagnostics, finalDiagnostics, [
          'rebuilds', 'staleHandleRejects', 'duplicateIdRejects', 'chainGuardTrips',
        ])
        && zeroCounterDelta(baseline?.publisher, final?.publisher, PUBLISHER_COUNTER_KEYS)
        && samePublisherError(baseline?.publisher, final?.publisher)
        && Array.isArray(scenarioRestore?.remainingInjectedIds)
        && scenarioRestore.remainingInjectedIds.length === 0
        && requiredChecks.every((key) => scenarioRestore?.checks?.[key] === true);
    if (!cleanupPass) {
      failures.push(`${label} did not return presentation counts/meshes/jobs to its baseline`);
    }
  }

  const legacyP95 = finite(legacy?.cpu?.renderWork?.entityViewSync?.p95);
  const denseP95 = finite(dense?.cpu?.renderWork?.entityViewSync?.p95);
  const legacySamples = finite(legacy?.cpu?.renderWork?.entityViewSync?.samples);
  const denseSamples = finite(dense?.cpu?.renderWork?.entityViewSync?.samples);
  const sampleCountDelta = Number.isFinite(legacySamples) && Number.isFinite(denseSamples)
    ? Math.abs(legacySamples - denseSamples)
    : null;
  if (!Number.isFinite(sampleCountDelta)
      || sampleCountDelta > PERFORMANCE_PRESENTATION_WORLD_MAX_SAMPLE_COUNT_DELTA) {
    failures.push(`legacy/dense entityViewSync sample exposure differs by more than ${PERFORMANCE_PRESENTATION_WORLD_MAX_SAMPLE_COUNT_DELTA}`);
  }
  if (legacyP95 == null || denseP95 == null || denseP95 > legacyP95) {
    failures.push('dense 5x entity-view publication is slower than legacy current-population publication');
  }

  const denseCoverage = densePresentation?.coverage;
  const static5x = exactDensePopulation
    && denseReadyAtExactTarget
    && denseAdmissionLifecyclePass
    && denseCoverage?.population === '5x'
    && denseCoverage?.motion === 'static'
    && specializedStable
    && specializedTimeScalePreserved;
  const terminalCoverage = Object.fromEntries(TERMINAL_EVIDENCE_CELLS.map(([, key, routes, requirements]) => [
    key,
    routeScopedEvidencePass(document, key, routes, requirements),
  ]));
  const moving5x = terminalCoverage.moving5x;
  const farCulled5x = terminalCoverage.farCulled5x;
  const imageTemporalParity = terminalCoverage.imageTemporalParity;
  const packagedElectron = runtimeKind === 'electron'
    && routeScopedEvidencePass(document, 'packagedElectron', ['context_recover_steady'])
    && document?.environment?.electronRuntime?.packaged === true
    && document?.environment?.electronRuntime?.appIsPackaged === true;
  const commonRuntimeComplete = samePopulationParityPass
    && static5x
    && churnLifecyclePass
    && rebaseSemanticsPass
    && TERMINAL_EVIDENCE_CELLS.every(([, key]) => terminalCoverage[key] === true);
  const packetComplete = commonRuntimeComplete && (runtimeKind !== 'electron' || packagedElectron);
  const openCriteria = [
    ...TERMINAL_EVIDENCE_CELLS
      .filter(([, key]) => terminalCoverage[key] !== true)
      .map(([label]) => label),
    ...(runtimeKind !== 'electron' || packagedElectron ? [] : ['packaged-electron']),
  ];
  const criterionFailures = [...new Set(failures)];
  const criterionPass = criterionFailures.length === 0;
  if (!packetComplete) failures.push(`packet acceptance remains open: ${openCriteria.join(', ')}`);

  return {
    schema: PERFORMANCE_PRESENTATION_WORLD_ACCEPTANCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    runtimeKind,
    status: failures.length === 0 ? 'pass' : criterionPass ? 'partial' : 'fail',
    pass: failures.length === 0,
    criterionPass,
    criterion: 'dense-5x-entityViewSync-p95-lte-legacy-current',
    coverage: {
      samePopulationSemanticParity: samePopulationParityPass,
      static5x,
      moving5x,
      farCulled5x,
      churnLifecycle: churnLifecyclePass,
      rebaseSemantics: rebaseSemanticsPass,
      denseAdmissionLifecycle: denseAdmissionLifecyclePass,
      imageTemporalParity,
      terminalEvidence: terminalCoverage,
      packagedElectron,
      packetComplete,
    },
    openCriteria,
    samplingPolicy: {
      durationMs: 5_000,
      maxEntityViewSyncSampleCountDelta: PERFORMANCE_PRESENTATION_WORLD_MAX_SAMPLE_COUNT_DELTA,
    },
    metrics: {
      baselineActive: baselineBound,
      denseSpawnCount,
      denseTargetActive,
      legacyEntityViewSyncP95Ms: legacyP95,
      denseEntityViewSyncP95Ms: denseP95,
      denseMinusLegacyP95Ms: legacyP95 == null || denseP95 == null ? null : denseP95 - legacyP95,
      legacyEntityViewSyncSamples: legacySamples,
      denseEntityViewSyncSamples: denseSamples,
      entityViewSyncSampleCountDelta: sampleCountDelta,
      churnCount: finite(churnReceipt?.churnCount),
    },
    criterionFailures,
    failures: [...new Set(failures)],
  };
}

export function evaluatePresentationWorldPair({
  browserEvidence,
  electronEvidence,
  browserDocument,
  electronDocument,
  browserLedger,
  electronLedger,
  currentFingerprint,
} = {}) {
  const browser = evaluatePresentationWorldRuntime(browserDocument, { runtimeKind: 'browser' });
  const electron = evaluatePresentationWorldRuntime(electronDocument, { runtimeKind: 'electron' });
  const failures = [...browser.failures, ...electron.failures];
  validateEvidence('browser', browserEvidence, browserDocument, browserLedger, currentFingerprint, failures);
  validateEvidence('electron', electronEvidence, electronDocument, electronLedger, currentFingerprint, failures);
  if (!digest(browserEvidence?.sourceCandidateDigest)
      || browserEvidence?.sourceCandidateDigest !== electronEvidence?.sourceCandidateDigest) {
    failures.push('Browser and Electron must share one sourceCandidateDigest');
  }
  if (!digest(browserEvidence?.candidateDigest)
      || !digest(electronEvidence?.candidateDigest)
      || browserEvidence.candidateDigest === electronEvidence.candidateDigest) {
    failures.push('Browser and Electron must retain distinct runtime candidate digests');
  }
  if (browser.metrics.baselineActive !== electron.metrics.baselineActive
      || browser.metrics.denseTargetActive !== electron.metrics.denseTargetActive) {
    failures.push('Browser and Electron population identities differ');
  }
  validatePairedAuthority({ browserEvidence, electronEvidence, browserDocument, electronDocument }, failures);
  const criterionPass = browser.criterionPass === true && electron.criterionPass === true
    && failures.every((failure) => browser.failures.includes(failure) || electron.failures.includes(failure));
  return {
    schema: PERFORMANCE_PRESENTATION_WORLD_ACCEPTANCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 ? 'pass' : criterionPass ? 'partial' : 'fail',
    pass: failures.length === 0,
    criterionPass,
    sourceCandidateDigest: browserEvidence?.sourceCandidateDigest === electronEvidence?.sourceCandidateDigest
      ? browserEvidence?.sourceCandidateDigest : null,
    runtimes: { browser, electron },
    electronScope: 'source-native-electron',
    packagedElectronClaim: false,
    failures: [...new Set(failures)],
  };
}

export async function checkPerformancePresentationWorldEvidence({ root } = {}) {
  const repoRoot = path.resolve(root || '.');
  const currentFingerprint = await strictWorktreeFingerprint(repoRoot);
  const loaded = [];
  for (const runtimeKind of RUNTIMES) loaded.push(await loadRuntimeEvidence(repoRoot, runtimeKind));
  const missing = loaded.filter((entry) => entry.missing);
  if (missing.length) {
    return {
      status: 'pending',
      currentWorktreeId: currentFingerprint.id,
      runtimes: loaded.map((entry) => ({ runtime: entry.runtime, status: entry.missing ? 'pending' : 'present' })),
      failures: missing.map((entry) => `${entry.runtime}: presentation-world evidence is absent`),
      comparison: null,
    };
  }
  const comparison = evaluatePresentationWorldPair({
    browserEvidence: loaded[0].evidence,
    electronEvidence: loaded[1].evidence,
    browserDocument: loaded[0].document,
    electronDocument: loaded[1].document,
    browserLedger: loaded[0].ledger,
    electronLedger: loaded[1].ledger,
    currentFingerprint,
  });
  return {
    status: comparison.status,
    currentWorktreeId: currentFingerprint.id,
    runtimes: loaded.map((entry) => ({
      runtime: entry.runtime,
      status: comparison.runtimes?.[entry.runtime]?.status || comparison.status,
      evidencePath: entry.evidencePath,
    })),
    failures: comparison.failures,
    comparison,
  };
}

async function loadRuntimeEvidence(root, runtimeKind) {
  const manifest = await loadValidationManifestById({ root, id: `${MANIFEST_PREFIX}${runtimeKind}` });
  const artifactRoot = path.resolve(root, manifest.artifactRoot);
  const evidencePath = path.join(artifactRoot, runtimeKind, 'evidence.json');
  let evidence;
  try {
    evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return { runtime: runtimeKind, missing: true, evidencePath };
    throw error;
  }
  const attributionPath = resolveContained(root, evidence?.artifacts?.attribution);
  const document = attributionPath ? JSON.parse(await readFile(attributionPath, 'utf8')) : null;
  const ledger = await readConsumedClaimLedgerEntry(artifactRoot, evidence.claimId);
  return { runtime: runtimeKind, missing: false, evidencePath, evidence, document, ledger };
}

function validateEvidence(runtimeKind, evidence, document, ledger, currentFingerprint, failures) {
  const label = runtimeKind === 'browser' ? 'Browser' : 'Electron';
  if (evidence?.pass !== true || evidence?.primaryAcceptance !== true || evidence?.runtimeKind !== runtimeKind) {
    failures.push(`${label} authority evidence is invalid`);
  }
  if (!evidence?.claimId || ledger?.claimId !== evidence.claimId
      || ledger?.runtimeKind !== runtimeKind
      || ledger?.candidateDigest !== evidence?.candidateDigest) {
    failures.push(`${label} evidence does not resolve against its consumed claim`);
  }
  if (document?.authority?.claimId !== evidence?.claimId
      || document?.authority?.digests?.candidateDigest !== evidence?.candidateDigest) {
    failures.push(`${label} attribution artifact does not bind its authority evidence`);
  }
  for (const key of AUTHORITY_DIGEST_KEYS) {
    const evidenceValue = key === 'sourceCandidateDigest'
      ? evidence?.sourceCandidateDigest
      : evidence?.digests?.[key];
    if (!digest(evidenceValue)
        || document?.authority?.digests?.[key] !== evidenceValue
        || ledger?.digests?.[key] !== evidenceValue
        || (key === 'sourceCandidateDigest' && evidence?.digests?.[key] !== evidenceValue)) {
      failures.push(`${label} ${key} does not bind evidence, attribution authority, and consumed claim`);
    }
  }
  if (evidence?.closure?.worktree?.id !== currentFingerprint?.id
      || evidence?.closure?.worktree?.digest !== currentFingerprint?.digest) {
    failures.push(`${label} evidence is not bound to the current clean worktree`);
  }
}

function validatePairedAuthority({ browserEvidence, electronEvidence, browserDocument, electronDocument }, failures) {
  const sharedDigestKeys = [
    'scenarioManifestDigest', 'saveDigest', 'inputTapeDigest', 'cameraManifestDigest',
  ];
  for (const key of sharedDigestKeys) {
    const browserValue = browserEvidence?.digests?.[key];
    const electronValue = electronEvidence?.digests?.[key];
    if (!digest(browserValue) || browserValue !== electronValue) {
      failures.push(`Browser and Electron ${key} identities differ or are missing`);
    }
  }
  if (browserDocument?.environment?.seed !== 47 || electronDocument?.environment?.seed !== 47) {
    failures.push('Browser and Electron must use fixed seed 47');
  }
  for (const [label, projection] of [
    ['viewport/DPR', viewportProjection],
    ['GPU', gpuProjection],
    ['machine', machineProjection],
    ['default settings', defaultSettingsProjection],
    ['route/window', routeWindowProjection],
  ]) {
    const browserValue = projection(browserDocument);
    const electronValue = projection(electronDocument);
    if (browserValue == null || electronValue == null || stableJson(browserValue) !== stableJson(electronValue)) {
      failures.push(`Browser and Electron ${label} identities differ or are missing`);
    }
  }
}

function resolveContained(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) return null;
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? null : resolved;
}

function finite(value) {
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function digest(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function structuralProjection(scene) {
  if (!scene || typeof scene !== 'object') return null;
  return {
    objects: scene.objects,
    visibleObjects: scene.visibleObjects,
    meshes: scene.meshes,
    visibleMeshes: scene.visibleMeshes,
    visibleInstances: scene.visibleInstances,
    castShadowObjects: scene.castShadowObjects,
    visibleMeshByCategory: scene.visibleMeshByCategory,
    visibleShipMeshByRole: scene.visibleShipMeshByRole,
    visibleShipMeshByPart: scene.visibleShipMeshByPart,
    surfaces: scene.surfaces,
    roles: scene.roles,
    authoredShipStates: scene.authoredShipStates,
    authoredShipAdmission: scene.authoredShipAdmission,
    authoredStaticBatches: scene.authoredStaticBatches,
    authoredPools: scene.authoredPools,
    stationPlaceHlod: scene.stationPlaceHlod,
  };
}

function routeScopedEvidencePass(document, key, requiredRoutes, {
  requireFiveX = false,
  motion = null,
  culling = null,
  requireLegacyFailureAtomicity = false,
} = {}) {
  const evidence = document?.presentationWorldEvidence?.[key];
  const candidateDigest = document?.authority?.digests?.candidateDigest;
  const verifiedArtifacts = new Map((document?.artifacts || [])
    .filter((artifact) => validVerifiedArtifactDescriptor(artifact))
    .map((artifact) => [artifact.path, artifact]));
  const artifacts = evidence?.artifacts;
  return evidence?.pass === true
    && evidence?.runtimeKind === document?.runtimeKind
    && digest(candidateDigest)
    && evidence?.candidateDigest === candidateDigest
    && Array.isArray(evidence?.routeTags)
    && requiredRoutes.every((route) => evidence.routeTags.includes(route))
    && requiredRoutes.every((route) => routeMeetsEvidenceRequirements(document, route, {
      requireFiveX,
      motion,
      culling,
      requireLegacyFailureAtomicity,
    }))
    && Array.isArray(artifacts)
    && artifacts.length > 0
    && artifacts.every((artifact) => {
      if (!validRouteArtifactDescriptor(artifact) || !evidence.routeTags.includes(artifact.routeTag)) return false;
      const verified = verifiedArtifacts.get(artifact.path);
      return verified != null
        && verified.kind === artifact.kind
        && finite(verified.bytes) === finite(artifact.bytes)
        && verified.sha256 === artifact.sha256;
    })
    && requiredRoutes.every((route) => artifacts.some((artifact) => artifact.routeTag === route));
}

function routeMeetsEvidenceRequirements(document, routeTag, {
  requireFiveX = false,
  motion = null,
  culling = null,
  requireLegacyFailureAtomicity = false,
} = {}) {
  const window = (document?.windows || []).find((entry) => entry?.routeTag === routeTag);
  if (!window) return false;
  const preparation = window?.scenarioPreparation;
  const presentation = preparation?.presentationWorld;
  if (motion != null && presentation?.coverage?.motion !== motion) return false;
  if (culling != null && presentation?.coverage?.culling !== culling) return false;
  if (requireLegacyFailureAtomicity) {
    const receipt = preparation?.legacyAdapterFailureAtomicity;
    if (![
      'injectedFailureObserved',
      'descriptorRestored',
      'queriesReset',
      'frameReset',
      'denseFallbackSucceeded',
      'journalRetainedUntilRestored',
      'finalRestorationSucceeded',
    ].every((key) => receipt?.[key] === true)) return false;
  }
  if (!requireFiveX) return true;
  const baseline = presentation?.baseline;
  const ready = preparation?.readiness?.presentationWorld;
  const settled = preparation?.baselineSettle;
  const base = finite(baseline?.active);
  return base > 0
    && finite(baseline?.bound) === base
    && finite(baseline?.meshes) === base
    && settled?.settled === true
    && finite(settled?.active) === base
    && finite(settled?.bound) === base
    && finite(settled?.meshes) === base
    && finite(settled?.timeScale) === 1
    && finite(presentation?.spawnCount) === base * 4
    && finite(presentation?.targetActive) === base * 5
    && finite(presentation?.shippedTimeScale) === 1
    && finite(ready?.active) === base * 5
    && finite(ready?.bound) === base * 5
    && finite(ready?.meshes) === base * 5
    && finite(ready?.shippedTimeScale) === 1
    && finite(ready?.timeScale) === 1
    && ready?.timeScalePreserved === true
    && finite(window?.settings?.start?.timeScale) === 1
    && finite(window?.settings?.end?.timeScale) === 1
    && Array.isArray(window?.rawSamples)
    && window.rawSamples.length > 0
    && window.rawSamples.every((sample) => finite(sample?.timeScale) === 1);
}

function validVerifiedArtifactDescriptor(artifact) {
  return artifact != null
    && typeof artifact.kind === 'string' && artifact.kind.trim().length > 0
    && typeof artifact.path === 'string' && artifact.path.trim().length > 0
    && finite(artifact.bytes) > 0
    && digest(artifact.sha256);
}

function validRouteArtifactDescriptor(artifact) {
  return validVerifiedArtifactDescriptor(artifact)
    && typeof artifact.routeTag === 'string' && artifact.routeTag.trim().length > 0;
}

function diagnosticsInternallyConsistent(diagnostics, { active, bound } = {}) {
  if (!hasFiniteCounters(diagnostics, WORLD_COUNTER_KEYS)) return false;
  const actualActive = finite(diagnostics.active);
  const actualBound = finite(diagnostics.bound);
  const capacity = finite(diagnostics.capacity);
  const highWater = finite(diagnostics.highWater);
  const free = finite(diagnostics.free);
  return (active == null || actualActive === active)
    && (bound == null || actualBound === bound)
    && actualActive + free === highWater
    && capacity >= highWater;
}

function expectedGrowth(capacity, target) {
  if (!(Number.isInteger(capacity) && capacity > 0) || !(Number.isInteger(target) && target > 0)) return null;
  let next = capacity;
  let count = 0;
  while (next < target) {
    next *= 2;
    count++;
  }
  return { count, capacity: next };
}

function hasFiniteCounters(source, keys) {
  return source != null && keys.every((key) => finite(source?.[key]) != null);
}

function zeroCounterDelta(before, after, keys) {
  return hasFiniteCounters(before, keys)
    && hasFiniteCounters(after, keys)
    && keys.every((key) => finite(after[key]) - finite(before[key]) === 0);
}

// Producer summaries cannot override the raw lifecycle snapshots they summarize.
function counterDeltasMatchSnapshots(before, after, deltas, keys) {
  return hasFiniteCounters(before, keys)
    && hasFiniteCounters(after, keys)
    && hasFiniteCounters(deltas, keys)
    && keys.every((key) => finite(after[key]) - finite(before[key]) === finite(deltas[key]));
}

function samePublisherError(before, after) {
  return before != null && after != null
    && Object.hasOwn(before, 'lastError')
    && Object.hasOwn(after, 'lastError')
    && before.lastError === after.lastError;
}

function numericSnapshot(source, keys) {
  if (!source || !keys.every((key) => finite(source[key]) != null)) return null;
  return Object.fromEntries(keys.map((key) => [key, finite(source[key])]));
}

function machineProjection(document) {
  const browser = document?.environment?.browser;
  if (!browser || !String(browser.platform || '').trim() || !String(browser.language || '').trim()
      || !(finite(browser.hardwareConcurrency) > 0)) return null;
  return {
    platform: browser.platform ?? null,
    language: browser.language ?? null,
    hardwareConcurrency: finite(browser.hardwareConcurrency),
  };
}

function viewportProjection(document) {
  const viewport = document?.environment?.viewport;
  if (!(finite(viewport?.width) > 0) || !(finite(viewport?.height) > 0)
      || !(finite(viewport?.devicePixelRatio) > 0)) return null;
  return {
    width: finite(viewport.width),
    height: finite(viewport.height),
    configuredWidth: finite(viewport.configuredWidth),
    configuredHeight: finite(viewport.configuredHeight),
    devicePixelRatio: finite(viewport.devicePixelRatio),
  };
}

function gpuProjection(document) {
  const gpu = document?.environment?.gpu;
  if (gpu?.source !== 'game-renderer' || !String(gpu.vendor || '').trim()
      || !String(gpu.renderer || '').trim() || !String(gpu.version || '').trim()) return null;
  return {
    api: gpu.api || null,
    vendor: gpu.vendor,
    renderer: gpu.renderer,
    version: gpu.version,
    shadingLanguageVersion: gpu.shadingLanguageVersion || null,
  };
}

function defaultSettingsProjection(document) {
  const settings = document?.environment?.defaultSettings;
  return settings?.video && typeof settings.video === 'object' ? settings : null;
}

function routeWindowProjection(document) {
  if (!Array.isArray(document?.windows) || document.windows.length === 0) return null;
  return document.windows.map((window) => ({
    routeTag: window?.routeTag || null,
    scenarioId: window?.scenarioId || window?.routeTag || null,
    diagnosticVariant: window?.diagnosticVariant || null,
    scenarioDefinition: window?.scenarioDefinition || null,
    settings: window?.settings || null,
  }));
}

function evaluateRebaseSemantics(rebase, after) {
  if (rebase?.applied !== true || !after) return false;
  const beforeSample = rebase.sampleBefore;
  const afterSample = after.sample;
  if (!Array.isArray(beforeSample) || !beforeSample.length
      || !Array.isArray(afterSample) || afterSample.length !== beforeSample.length) return false;
  const beforeX = finite(rebase.before?.x);
  const beforeZ = finite(rebase.before?.z);
  const targetX = finite(rebase.target?.x);
  const targetZ = finite(rebase.target?.z);
  if (beforeX == null || beforeZ == null || targetX == null || targetZ == null) return false;
  const dx = beforeX - targetX;
  const dz = beforeZ - targetZ;
  for (let index = 0; index < beforeSample.length; index++) {
    const before = beforeSample[index];
    const next = afterSample[index];
    if (before?.id !== next?.id || before?.root !== next?.root
        || !close(before?.world?.x, next?.world?.x)
        || !close(before?.world?.z, next?.world?.z)
        || !close(finite(before?.local?.x) + dx, next?.local?.x)
        || !close(finite(before?.local?.z) + dz, next?.local?.z)) return false;
  }
  const worldKeys = [
    'active', 'bound', 'capacity', 'highWater', 'free',
    'allocations', 'retirements', 'rebuilds', 'growths', 'spatialMoves',
    'staleHandleRejects', 'duplicateIdRejects', 'chainGuardTrips',
  ];
  if (!hasFiniteCounters(rebase.diagnosticsBefore, worldKeys)
      || !hasFiniteCounters(after.diagnostics, worldKeys)
      || worldKeys.some((key) => finite(rebase.diagnosticsBefore[key]) !== finite(after.diagnostics[key]))) {
    return false;
  }
  const publisherKeys = ['fullRebuilds', 'fallbackRebuilds', 'rangeFailures', 'applyFailures'];
  return hasFiniteCounters(rebase.publisherBefore, publisherKeys)
    && hasFiniteCounters(after.publisher, publisherKeys)
    && publisherKeys.every((key) => finite(rebase.publisherBefore[key]) === finite(after.publisher[key]))
    && samePublisherError(rebase.publisherBefore, after.publisher);
}

function close(left, right, epsilon = 1e-5) {
  const a = finite(left);
  const b = finite(right);
  return a != null && b != null && Math.abs(a - b) <= epsilon;
}
