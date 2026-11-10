// PQ-025 Phase 1 pure contracts. No game launch.
//
// Proves the validation-manifest schemas and the adversarial gates: a deleted attempt, a scenario
// relabel, a profile class chosen from measured FPS, an average hiding a failed hard cell, an
// unknown observation converted to a pass, and an actor reading observer hidden state.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import qualificationManifest from '../scripts/validation-manifests/pq025-gold-corridor-qualification.mjs';
import smokeManifest from '../scripts/validation-manifests/pq025-gold-corridor-smoke.mjs';
import {
  ACCESSIBILITY_REQUIRED_CHECKS,
  AGGREGATE_SCHEMA,
  ATTEMPT_SCHEMA,
  ATTEMPT_SCHEMA_DOCUMENT,
  AGGREGATE_SCHEMA_DOCUMENT,
  CHECKPOINT_SETS,
  PHASE1_LAUNCHES_GAME,
  PHASE1_REGISTRY_ENABLED,
  REQUIRED_PERFORMANCE_METRICS,
  RUN_SCHEMA,
  RUN_SCHEMA_DOCUMENT,
  actorReadObserverState,
  aggregateHardCells,
  appendRunAttempt,
  assignProfileClass,
  attemptRecordFromEntry,
  auditRevealedSeeds,
  commitQualificationRun,
  createActorCapability,
  createCheckpointRecord,
  createJudgeCapability,
  createObserverCapability,
  createPhase1FingerprintRegistry,
  deriveRuntimeIndependentSeed,
  evaluateAccessibilityContract,
  evaluateCheckpointContract,
  evaluateMediaContract,
  evaluateParityContract,
  evaluatePerformanceContract,
  evaluateQualityLock,
  evaluateSaveContract,
  judgeAttemptRetention,
  judgeHumanVerdicts,
  judgeOwnerEvidence,
  judgeParitySeeds,
  judgeScenarioRelabel,
  openAttemptLedger,
  publishQualificationReceipt,
  reconcileMonotonicDuration,
  registerAttemptFingerprints,
  rejectInjectedAction,
  revealQualificationRun,
  validateAttemptRecord,
  validateRunRecord,
  verifyCommitReveal,
  verifyQualificationReceipt,
} from '../scripts/validation-manifests/pq025-phase1-contracts.mjs';

const CANDIDATE = 'a'.repeat(40);
const HARNESS = 'b'.repeat(64);
const RUBRIC = 'e'.repeat(64);
const SALT = 'salt-phase1';
const NONCE = 'nonce-phase1';
const FROZEN_AT = '2026-09-26T00:00:00Z';
const CRITICAL = Object.freeze(['R1-discoverability', 'R8-route-coherence']);

const MATRIX_CELLS = Object.freeze([
  { career: 'hauler', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
  { career: 'hunter', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target' },
  { career: 'prospector', horizonMin: 30, scenarioClass: 'failure-recovery', runtimeKind: 'browser', profileClass: 'floor' },
  { career: 'hauler', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target' },
  { career: 'hunter', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
  { career: 'prospector', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'floor' },
]);

function runInput(overrides = {}) {
  return {
    candidateCommit: CANDIDATE,
    harnessHash: HARNESS,
    dependencyReceiptHashes: { 'PQ-019': 'd'.repeat(64) },
    heldOutSalt: SALT,
    nonce: NONCE,
    frozenAtIso: FROZEN_AT,
    profileClass: 'target',
    hardwareProfileId: 'sf-qual-hw-shared-workstation',
    executionProfileId: 'default-quality-windowed-1440x900',
    sourceFingerprint: 'source-fp-001',
    rubricHash: RUBRIC,
    criticalQuestionIds: [...CRITICAL],
    cells: [{ career: 'hauler', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' }],
    ...overrides,
  };
}

function revealedRun(overrides = {}) {
  const committed = commitQualificationRun(runInput(overrides));
  const revealed = revealQualificationRun(committed, { heldOutSalt: SALT, nonce: NONCE });
  assert.equal(revealed.ok, true, revealed.reason);
  return revealed.run;
}

function ledgerFor(run, mutate = null) {
  let ledger = openAttemptLedger();
  run.cellPlan.forEach((cell, index) => {
    const fail = mutate && mutate.index === index;
    ledger = appendRunAttempt(ledger, {
      run,
      cellIndex: index,
      captureId: `capture-${index}`,
      verdict: fail ? 'fail' : 'pass',
      failureClass: fail ? mutate.failureClass : null,
      evidencePaths: [`evidence-${cell.cellKey}.json`],
    });
  });
  return ledger;
}

function verifiedEconomy() {
  return judgeOwnerEvidence({
    outcome: 'economy.meaningfulness',
    observation: { type: 'economy:tradeCompleted' },
    rawRef: 'src/systems/economy.js:1047',
    confidence: 'verified',
  });
}

function humanAnswers() {
  return CRITICAL.map((questionId) => ({ questionId, critical: true, pass: true, rubricHash: RUBRIC }));
}

function aggregateArgs(run, ledger, extras = {}) {
  return {
    matrix: run.matrix,
    ledger,
    ownerEvidence: [verifiedEconomy()],
    humanRubricHash: RUBRIC,
    humanVerdicts: humanAnswers(),
    dependencyReceiptHashes: { 'PQ-019': 'd'.repeat(64) },
    expectedDependencyReceiptHashes: { 'PQ-019': 'd'.repeat(64) },
    ...extras,
  };
}

function perfSample(overrides = {}) {
  return {
    p50Ms: 8.2,
    p95Ms: 14.1,
    p99Ms: 19.8,
    maxMs: 41,
    rawThresholdCounts: { over16_7Ms: 120, over32Ms: 4 },
    missedVsync: 6,
    multiStepFrames: 2,
    backlog: 0,
    phaseCosts: { sim: 4.1, render: 7.2 },
    entityCounts: { ships: 22 },
    residencyBaseline: 180_000_000,
    residencyPeak: 240_000_000,
    residencyEnd: 195_000_000,
    drawTriangleCounts: { drawCallsTotal: 1200, trianglesTotal: 240_000 },
    saveBlockingMs: 3.4,
    ...overrides,
  };
}

function durationSample(overrides = {}) {
  return {
    horizonMin: 30,
    nativeMonotonicMs: 31 * 60_000,
    pausedMs: 0,
    unfocusedMs: 0,
    loadingMs: 0,
    simTimeS: 31 * 60,
    timeScaleSamples: [1, 1, 1],
    idleSpansMs: [2_000],
    monotonicClock: 'performance.now',
    ...overrides,
  };
}

test('phase 1 does not launch and does not enable qualification manifests', () => {
  assert.equal(PHASE1_LAUNCHES_GAME, false);
  assert.equal(PHASE1_REGISTRY_ENABLED, false);
  assert.equal(qualificationManifest.registryEnabled, false);
  assert.equal(smokeManifest.registryEnabled, false);
  const source = readFileSync(fileURLToPath(new URL('../scripts/validation-manifests/pq025-phase1-contracts.mjs', import.meta.url)), 'utf8');
  assert.equal(source.includes('playwright'), false);
  assert.equal(source.includes('child_process'), false);
  assert.equal(source.includes('execSync'), false);
  assert.equal(source.includes('createGameServer'), false);
});

test('run, attempt, and aggregate schemas reject malformed records and seal a real run', () => {
  assert.equal(RUN_SCHEMA_DOCUMENT.id, RUN_SCHEMA);
  assert.equal(ATTEMPT_SCHEMA_DOCUMENT.id, ATTEMPT_SCHEMA);
  assert.equal(AGGREGATE_SCHEMA_DOCUMENT.id, AGGREGATE_SCHEMA);
  assert.equal(validateRunRecord({}).ok, false);
  const run = revealedRun();
  assert.equal(validateRunRecord(run).ok, true, validateRunRecord(run).errors.join(','));
  assert.equal(JSON.stringify(run).includes(SALT), false);
  assert.equal(validateRunRecord({ ...run, measuredFps: 144 }).errors.includes('forbidden:measuredFps'), true);
  assert.equal(validateRunRecord({ ...run, heldOutSalt: SALT }).errors.includes('forbidden:heldOutSalt'), true);
  const ledger = ledgerFor(run);
  const attempt = attemptRecordFromEntry(ledger.entries[0]);
  assert.equal(validateAttemptRecord(attempt).ok, true, validateAttemptRecord(attempt).errors.join(','));
  assert.equal(validateAttemptRecord({ schema: ATTEMPT_SCHEMA, identity: {}, verdict: 'win', failureClass: null, evidencePaths: [] }).ok, false);
});

test('seed derivation is runtime-independent and commit-reveal rejects a swapped salt', () => {
  const run = revealedRun({
    cells: [
      { career: 'hauler', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
      { career: 'hauler', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target', derivationCellIndex: 0 },
    ],
  });
  assert.equal(run.cellPlan[0].seed, run.cellPlan[1].seed);
  assert.equal(run.cellPlan[0].parityPairId, run.cellPlan[1].parityPairId);
  assert.notEqual(run.cellPlan[0].runtimeKind, run.cellPlan[1].runtimeKind);
  assert.equal(auditRevealedSeeds(run, { heldOutSalt: SALT, nonce: NONCE }).ok, true);
  const seedInputs = {
    heldOutSalt: SALT,
    candidateCommit: CANDIDATE,
    career: 'hauler',
    horizonMin: 30,
    scenarioClass: 'success',
    cellIndex: 0,
  };
  assert.equal(deriveRuntimeIndependentSeed(seedInputs).seed, run.cellPlan[0].seed);
  assert.throws(() => deriveRuntimeIndependentSeed({ ...seedInputs, runtimeKind: 'browser' }), /seed-derivation-forbidden-input: runtimeKind/);
  const committed = commitQualificationRun(runInput());
  assert.equal(verifyCommitReveal(committed.seedCommitment, { heldOutSalt: SALT, nonce: NONCE }).ok, true);
  const swapped = revealQualificationRun(committed, { heldOutSalt: 'other-salt', nonce: NONCE });
  assert.equal(swapped.ok, false);
  assert.equal(swapped.reason, 'reveal-does-not-match-commitment');
  assert.equal(judgeParitySeeds({
    left: { seed: 1, parityPairId: 'p', seedInputs: { runtimeKind: 'browser' } },
    right: { seed: 1, parityPairId: 'p', seedInputs: {} },
  }).reason, 'runtime-included-in-seed-derivation:runtimeKind');
  assert.equal(judgeParitySeeds({ left: { seed: 1, parityPairId: 'p' }, right: { seed: 2, parityPairId: 'p' } }).reason, 'parity-seeds-differ');
});

test('an inconvenient attempt cannot be deleted or replaced', () => {
  const run = revealedRun();
  let ledger = openAttemptLedger();
  ledger = appendRunAttempt(ledger, {
    run, cellIndex: 0, captureId: 'cap-fail', verdict: 'fail', failureClass: 'PRODUCT_NAV', evidencePaths: ['nav.json'],
  });
  const deleted = { schema: ledger.schema, entries: [], headHash: ledger.headHash };
  const deletion = judgeAttemptRetention(ledger, deleted);
  assert.equal(deletion.ok, false);
  assert.equal(deletion.reason, 'deleting-an-inconvenient-attempt-is-rejected');
  const replaced = {
    schema: ledger.schema,
    entries: ledger.entries.map((entry) => ({ ...entry, verdict: 'pass', failureClass: null })),
    headHash: ledger.headHash,
  };
  assert.equal(judgeAttemptRetention(ledger, replaced).reason, 'replacing-a-retained-attempt-is-rejected');
  const grown = appendRunAttempt(ledger, {
    run, cellIndex: 0, captureId: 'cap-later', verdict: 'pass', evidencePaths: ['later.json'],
  });
  assert.equal(judgeAttemptRetention(ledger, grown).ok, true);
  assert.equal(grown.entries[0].verdict, 'fail');
  assert.equal(grown.entries.length, 2);
  const judge = createJudgeCapability({ judgeId: 'judge-1', ledger });
  assert.equal(judge.delete, undefined);
  assert.equal(judge.appendAttempt, undefined);
  assert.throws(() => createJudgeCapability({ judgeId: 'judge-1', ledger, validators: { delete: () => {} } }), /judge-may-not-mutate-the-ledger:delete/);
});

test('a scenario cannot be relabeled after observation', () => {
  const run = revealedRun();
  const cell = run.cellPlan[0];
  const judged = judgeScenarioRelabel(cell, { ...cell, scenarioClass: 'failure-recovery' });
  assert.equal(judged.ok, false);
  assert.equal(judged.reason, 'scenario-relabeled-after-observation');
  assert.throws(() => appendRunAttempt(openAttemptLedger(), {
    run,
    cellIndex: 0,
    captureId: 'cap-relabel',
    verdict: 'pass',
    scenarioClass: 'failure-recovery',
  }), /scenario-relabeled-after-observation/);
  assert.equal(judgeScenarioRelabel(cell, { ...cell, profileClass: 'floor' }).reason, 'profile-relabeled-after-observation');
});

test('profile class is frozen before the run and cannot be chosen from measured FPS', () => {
  for (const profileClass of ['target', 'floor', 'diagnostic']) {
    const assigned = assignProfileClass({
      profileClass,
      hardwareProfileId: 'hw-1',
      executionProfileId: 'ex-1',
      frozenAtIso: FROZEN_AT,
    });
    assert.equal(assigned.profileClass, profileClass);
    assert.equal(assigned.acceptanceEligible, profileClass !== 'diagnostic');
    assert.throws(() => assignProfileClass({
      profileClass,
      hardwareProfileId: 'hw-1',
      executionProfileId: 'ex-1',
      frozenAtIso: FROZEN_AT,
      measuredFps: 40,
    }), /profile-class-must-not-be-chosen-from-measured-cadence/);
  }
  assert.throws(() => commitQualificationRun(runInput({ measuredFps: 28, profileClass: 'floor' })), /profile-class-must-not-be-chosen-from-measured-cadence/);
  assert.throws(() => commitQualificationRun(runInput({ frozenAtIso: '' })), /profile-assignment-must-be-frozen-before-run/);
  assert.equal(commitQualificationRun(runInput({ profileClass: 'diagnostic' })).acceptanceEligible, false);
  assert.equal(commitQualificationRun(runInput({ profileClass: 'floor' })).acceptanceEligible, true);
});

test('an actor cannot read observer hidden state', () => {
  const secret = 'OBSERVER_HIDDEN_OWNER_EVENT';
  const observer = createObserverCapability({
    observerId: 'obs-1',
    read: { ownerEvents: () => secret },
  });
  assert.throws(() => createActorCapability({
    policyId: 'public',
    publicSurface: { click: () => {}, observer },
  }), /actor-may-not-hold-hidden-state:observer/);
  assert.throws(() => createActorCapability({
    policyId: 'public',
    publicSurface: { readPixels: { nested: observer } },
  }), /actor-may-not-reference-observer/);
  const actor = createActorCapability({ policyId: 'public', publicSurface: { click: () => 'clicked' } });
  const read = actorReadObserverState(actor, observer, 'ownerEvents');
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'actor-may-not-read-observer-hidden-state');
  assert.equal(read.value, undefined);
  assert.equal(JSON.stringify(read).includes(secret), false);
  assert.equal(rejectInjectedAction({ kind: 'state-write' }).ok, false);
  assert.equal(rejectInjectedAction({ kind: 'transition-inject' }).ok, false);
  assert.equal(rejectInjectedAction({ kind: 'event-inject' }).ok, false);
  assert.equal(rejectInjectedAction({ kind: 'click' }).ok, true);
});

test('native monotonic duration reconciles sim time and rejects short, scaled, or drifted runs', () => {
  assert.equal(reconcileMonotonicDuration(durationSample()).ok, true);
  assert.equal(reconcileMonotonicDuration(durationSample({ nativeMonotonicMs: 20 * 60_000, simTimeS: 20 * 60 })).reason, 'native-duration-short');
  assert.equal(reconcileMonotonicDuration(durationSample({ pausedMs: 10 * 60_000 })).reason, 'native-duration-short');
  assert.equal(reconcileMonotonicDuration(durationSample({ timeScaleSamples: [1, 2] })).reason, 'time-scale-not-exactly-one');
  assert.equal(reconcileMonotonicDuration(durationSample({ simTimeS: 10 })).reason, 'sim-reconciliation-failure');
  assert.equal(reconcileMonotonicDuration(durationSample({ monotonicClock: 'Date.now' })).reason, 'duration-must-come-from-a-monotonic-clock');
});

test('owner evidence keeps a raw reference and never converts unknown into a pass', () => {
  const verified = verifiedEconomy();
  assert.equal(verified.satisfied, true);
  assert.equal(verified.confidence, 'verified');
  assert.equal(verified.rawRef, 'src/systems/economy.js:1047');
  assert.ok(verified.ownerRef);
  const coerced = judgeOwnerEvidence({
    outcome: 'economy.meaningfulness',
    observation: { type: 'economy:tradeCompleted' },
    rawRef: 'src/systems/economy.js:1047',
    confidence: 'unknown',
    coerceUnknownToPass: true,
    treatUnknownAsWarning: true,
  });
  assert.equal(coerced.satisfied, false);
  assert.equal(coerced.confidence, 'unknown');
  assert.equal(coerced.warning, false);
  assert.equal(coerced.reason, 'unknown-cannot-be-converted-to-pass');
  const degraded = judgeOwnerEvidence({
    outcome: 'economy.meaningfulness',
    observation: { type: 'economy:tradeCompleted' },
    rawRef: 'src/systems/economy.js:1047',
    confidence: 'degraded',
  });
  assert.equal(degraded.satisfied, false);
  assert.equal(degraded.confidence, 'unknown');
  const missingRef = judgeOwnerEvidence({
    outcome: 'economy.meaningfulness',
    observation: { type: 'economy:tradeCompleted' },
    confidence: 'verified',
  });
  assert.equal(missingRef.satisfied, false);
  assert.equal(missingRef.confidence, 'unknown');
  assert.equal(missingRef.reason, 'missing-raw-reference');
});

test('checkpoint, save, parity, performance, accessibility, and media contracts fail closed', () => {
  const thirty = CHECKPOINT_SETS[30].map((id, index) => createCheckpointRecord({
    id, horizonMin: 30, nativeMonotonicMs: (index + 1) * 1000, semanticDigest: `digest-${id}`,
  }));
  assert.equal(evaluateCheckpointContract(30, thirty).ok, true);
  const missingContinue = evaluateCheckpointContract(30, thirty.filter((record) => record.id !== 'coldReloadContinue'));
  assert.equal(missingContinue.ok, false);
  assert.ok(missingContinue.errors.includes('missing-checkpoint:coldReloadContinue'));
  const ninetyIds = CHECKPOINT_SETS[90].filter((id) => id !== 'finalColdReloadContinue');
  const ninety = ninetyIds.map((id, index) => createCheckpointRecord({
    id, horizonMin: 90, nativeMonotonicMs: (index + 1) * 1000, semanticDigest: `digest-${id}`,
  }));
  assert.equal(evaluateCheckpointContract(90, ninety).ok, false);

  const save = {
    horizonMin: 30,
    wroteSave: true,
    coldContinue: true,
    preSaveDigest: 'digest',
    postContinueDigest: 'digest',
    meaningfulActionAfterContinue: true,
    contentHash: 'save-hash-1',
  };
  assert.equal(evaluateSaveContract(save).ok, true);
  assert.equal(evaluateSaveContract({ ...save, priorContentHashes: ['save-hash-1'] }).errors.includes('stale-save-reused'), true);
  assert.equal(evaluateSaveContract({ ...save, postContinueDigest: 'other' }).errors.includes('continue-digest-mismatch'), true);
  assert.equal(evaluateSaveContract({ ...save, hotReload: true }).errors.includes('continue-was-not-cold'), true);
  assert.equal(evaluateSaveContract({ ...save, horizonMin: 90 }).errors.includes('purchase-did-not-persist-through-continue'), true);
  assert.equal(evaluateSaveContract({ ...save, horizonMin: 90, purchasePersisted: true, parity: true }).errors.includes('parity-save-was-not-an-isolated-copy'), true);

  const left = {
    runtimeKind: 'browser',
    career: 'hauler',
    horizonMin: 30,
    scenarioClass: 'success',
    seed: 123,
    parityPairId: 'pair-1',
    checkpointDigests: ['c0', 'c1'],
    saveContentHash: 'save-hash-1',
  };
  assert.equal(evaluateParityContract({ left, right: { ...left, runtimeKind: 'electron' } }).ok, true);
  assert.equal(evaluateParityContract({ left, right: { ...left, runtimeKind: 'electron', seed: 999 } }).errors.includes('parity-seeds-differ'), true);
  assert.equal(evaluateParityContract({ left, right: { ...left } }).errors.includes('parity-runtimes-not-distinct'), true);

  const assignment = assignProfileClass({
    profileClass: 'target', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1', frozenAtIso: FROZEN_AT,
  });
  assert.equal(evaluatePerformanceContract(assignment, perfSample()).ok, true);
  assert.equal(REQUIRED_PERFORMANCE_METRICS.includes('p99Ms'), true);
  assert.equal(evaluatePerformanceContract(assignment, perfSample({ p95Ms: 20 })).reason, 'target-evaluated-at-floor-threshold');
  assert.match(evaluatePerformanceContract(assignment, perfSample({ p99Ms: undefined })).reason, /missing-required-metric:p99Ms/);
  const diagnostic = assignProfileClass({
    profileClass: 'diagnostic', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1', frozenAtIso: FROZEN_AT,
  });
  assert.equal(evaluatePerformanceContract(diagnostic, perfSample()).reason, 'diagnostic-profile-is-never-acceptance-eligible');
  const floor = assignProfileClass({
    profileClass: 'floor', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1', frozenAtIso: FROZEN_AT,
  });
  assert.equal(evaluatePerformanceContract(floor, perfSample({ p95Ms: 30 })).ok, true);
  assert.equal(evaluatePerformanceContract(floor, perfSample({ p95Ms: 30, floorZeroGateRawOver32: true })).reason, 'floor-must-not-blindly-zero-gate-raw-over-32ms');
  assert.equal(evaluatePerformanceContract(assignment, perfSample({ qualityReduced: true })).reason, 'quality-reduced-to-pass');
  assert.equal(evaluateQualityLock({ quality: 'default' }, { quality: 'low' }).ok, false);
  assert.equal(evaluatePerformanceContract(assignment, perfSample({ series: { entities: [1, 2, 3, 4] } })).ok, false);

  const accessibility = {};
  for (const check of ACCESSIBILITY_REQUIRED_CHECKS) accessibility[check] = true;
  assert.equal(evaluateAccessibilityContract('default', accessibility).ok, true);
  assert.equal(evaluateAccessibilityContract('default', { ...accessibility, contrastRatio: false }).ok, false);

  const registry = createPhase1FingerprintRegistry();
  const media = {
    registrationReceiptRetained: true,
    mediaDeleted: true,
    captureId: 'cap-media-1',
    contentHash: '1'.repeat(64),
    candidateCommit: CANDIDATE,
    cellKey: 'hauler|30|success|browser|target',
    attemptOrdinal: 1,
    sourceFingerprint: 'source-fp-001',
    hardwareProfileId: 'hw-1',
    executionProfileId: 'ex-1',
    frozenSourceFingerprint: 'source-fp-001',
    frozenHardwareProfileId: 'hw-1',
    frozenExecutionProfileId: 'ex-1',
  };
  assert.equal(evaluateMediaContract({ ...media, mediaBytesRetained: true }).errors.includes('media-must-be-ephemeral'), true);
  assert.equal(evaluateMediaContract({ ...media, mediaPath: 'captures/cell.mp4' }).errors.includes('media-must-not-be-stored'), true);
  assert.equal(evaluateMediaContract({ ...media, alsoSatisfies: [{ runtimeKind: 'electron' }] }).errors.includes('one-capture-cannot-satisfy-multiple-attempts'), true);
  assert.equal(evaluateMediaContract(media, registry).ok, true);
  assert.equal(evaluateMediaContract({
    ...media, captureId: 'cap-media-2', attemptOrdinal: 2, contentHash: '1'.repeat(64),
  }, registry).errors.includes('stale-capture-content-reused'), true);
});

test('capture, source, hardware, and execution fingerprints stay unique and stable', () => {
  const registry = createPhase1FingerprintRegistry();
  const base = {
    candidateCommit: CANDIDATE,
    cellKey: 'hauler|30|success|browser|target',
    attemptOrdinal: 1,
    contentHash: 'a'.repeat(64),
    captureId: 'cap-fp-1',
    sourceFingerprint: 'source-fp-001',
    hardwareProfileId: 'hw-1',
    executionProfileId: 'ex-1',
    frozenSourceFingerprint: 'source-fp-001',
    frozenHardwareProfileId: 'hw-1',
    frozenExecutionProfileId: 'ex-1',
  };
  assert.equal(registerAttemptFingerprints(registry, base).ok, true);
  assert.equal(registerAttemptFingerprints(registry, { ...base, cellKey: 'hunter|30|success|electron|target', attemptOrdinal: 2 }).reason, 'capture-reused-across-cells');
  assert.equal(registerAttemptFingerprints(registry, {
    ...base,
    captureId: 'cap-fp-2',
    contentHash: 'b'.repeat(64),
    sourceFingerprint: 'source-fp-002',
    frozenSourceFingerprint: 'source-fp-002',
    attemptOrdinal: 2,
    cellKey: 'hunter|30|success|electron|target',
  }).reason, 'source-fingerprint-changed-during-qualification');
  assert.equal(registerAttemptFingerprints(createPhase1FingerprintRegistry(), {
    ...base, hardwareProfileId: 'hw-other',
  }).reason, 'hardware-fingerprint-does-not-match-frozen-profile');
  assert.equal(registerAttemptFingerprints(createPhase1FingerprintRegistry(), {
    ...base, captureId: 'same', sourceFingerprint: 'same', hardwareProfileId: 'same', executionProfileId: 'same',
    frozenSourceFingerprint: 'same', frozenHardwareProfileId: 'same', frozenExecutionProfileId: 'same',
  }).reason, 'fingerprints-are-not-unique');
});

test('hard-cell aggregation and human verdicts do not average or waive a failure', () => {
  const run = revealedRun({ cells: MATRIX_CELLS.map((cell) => ({ ...cell })) });
  const passing = aggregateHardCells(aggregateArgs(run, ledgerFor(run)));
  assert.equal(passing.ok, true, passing.blockers.join('; '));
  assert.equal(passing.verdict, 'PASS');
  assert.equal(passing.schema, AGGREGATE_SCHEMA);
  assert.equal(passing.counts.pass, 6);

  const averaged = aggregateHardCells(aggregateArgs(run, ledgerFor(run, { index: 0, failureClass: 'PRODUCT_PERF' }), {
    averageFailedCellsAway: true,
    diagnosticAverages: { meanP95Ms: 8.1, passRate: 5 / 6 },
  }));
  assert.equal(averaged.ok, false);
  assert.equal(averaged.verdict, 'FAIL');
  assert.equal(averaged.counts.fail, 1);
  assert.ok(averaged.blockers.includes('averaging-away-a-failed-hard-cell-is-rejected'));
  assert.ok(averaged.blockers.some((blocker) => blocker.startsWith('failed-cell:hauler|30|success|browser|target')));
  assert.equal(averaged.diagnostics.averages.passRate, 5 / 6);

  const unknownCell = aggregateHardCells(aggregateArgs(run, ledgerFor(run, { index: 1, failureClass: 'UNKNOWN' }), {
    unknownAsPass: true,
  }));
  assert.equal(unknownCell.ok, false);
  assert.equal(unknownCell.verdict, 'FAIL');
  assert.ok(unknownCell.blockers.includes('unknown-cannot-be-converted-to-pass'));
  assert.ok(unknownCell.blockers.some((blocker) => blocker.startsWith('unknown-cell:')));

  const unknownEvidence = judgeOwnerEvidence({
    outcome: 'ledger.pages',
    observation: { pages: 3 },
    rawRef: 'src/systems/shipLedger.js:528',
    confidence: 'unknown',
    treatUnknownAsPass: true,
  });
  const unknownRow = aggregateHardCells(aggregateArgs(run, ledgerFor(run), {
    ownerEvidence: [unknownEvidence],
    unknownAsPass: true,
  }));
  assert.equal(unknownEvidence.satisfied, false);
  assert.equal(unknownRow.verdict, 'FAIL');
  assert.ok(unknownRow.blockers.includes('unknown-cannot-be-converted-to-pass'));

  const waiver = judgeHumanVerdicts({
    rubricHash: RUBRIC,
    criticalQuestionIds: [...CRITICAL],
    verdicts: [
      { questionId: 'R1-discoverability', critical: true, pass: true, rubricHash: RUBRIC, waivesTechnicalFailure: true },
      { questionId: 'R8-route-coherence', critical: true, pass: true, rubricHash: RUBRIC },
    ],
  });
  assert.equal(waiver.ok, false);
  assert.ok(waiver.errors.includes('human-judgment-cannot-waive-hard-technical-failure'));
  const unanswered = judgeHumanVerdicts({ rubricHash: RUBRIC, criticalQuestionIds: [...CRITICAL], verdicts: [] });
  assert.equal(unanswered.ok, false);
  assert.ok(unanswered.errors.includes('critical-question-unanswered:R1-discoverability'));

  const receipt = publishQualificationReceipt({
    validation: passing,
    candidateCommit: CANDIDATE,
    harnessHash: HARNESS,
    matrix: run.matrix,
    ledger: ledgerFor(run),
    artifacts: ['attempt-ledger.json'],
    publishedAtIso: FROZEN_AT,
  });
  assert.equal(receipt.schema, AGGREGATE_SCHEMA);
  assert.equal(receipt.promotion, 'controller-decides');
  assert.equal(verifyQualificationReceipt(receipt).ok, true);
  assert.equal(verifyQualificationReceipt({ ...receipt, verdict: 'PASS', promotion: 'self-promoted' }).ok, false);
});
