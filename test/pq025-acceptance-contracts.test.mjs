// PQ-025 Phase-1 pure contract tests.
//
// Two jobs:
//   1. positive coverage of every schema / derivation / aggregation path;
//   2. the ADVERSARIAL CONTRACT MINIMUM. The packet's "Adversarial contract minimum" section lists
//      17 bullets; several are compound, so each bullet is given a stable id ADV-01..ADV-17 and each
//      independently gameable SUB-CONDITION gets its own rejection test (ADV-07a..e and so on).
//      Every one asserts the contract REJECTS the gaming attempt.
//
// Enumeration (bullet -> ids), verbatim from the packet:
//   1  runtime included in seed derivation or parity seeds differ ............ ADV-01a, ADV-01b
//   2  scenario/profile relabeled after observation ......................... ADV-02a, ADV-02b
//   3  required failure/recovery cell omitted ............................... ADV-03
//   4  failed/invalid attempt deleted or replaced .......................... ADV-04a, ADV-04b
//   5  actor reads observer/hidden state ................................... ADV-05a, ADV-05b  (session suite)
//   6  direct transition/state/event injection ............................. ADV-06a..c        (session suite)
//   7  native duration short / pause-unfocus-loading counted / timeScale != 1 /
//      sim reconciliation failure / focused idling ......................... ADV-07a..e
//   8  purchase without charge/ownership/legal fit/capability/Continue ..... ADV-08a..e
//   9  research/preview counted as purchase ................................ ADV-09
//   10 Massline attempt without authoritative attach success ............... ADV-10
//   11 target evaluated at floor threshold / floor blindly zero-gated >32ms . ADV-11a, ADV-11b (+ADV-11c diagnostic)
//   12 missing p99/max/missed-vsync/multi-step/residency/save blocking ...... ADV-12a..f
//   13 capture reused across cells .......................................... ADV-13
//   14 quality reduced ...................................................... ADV-14
//   15 bounded event buffer erases evidence ................................. ADV-15            (session suite)
//   16 stale media/receipt/save reused ...................................... ADV-16a..c
//   17 unknown owner evidence treated as warning/pass ....................... ADV-17

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SEMANTIC_OUTCOME_MAP, validateSemanticMap, absentSemanticRows, degradedSemanticRows, semanticRow,
  CAREERS, HORIZONS_MIN, RUNTIME_KINDS,
  SEED_DERIVATION_VERSION, SEED_DERIVATION_FORBIDDEN_KEYS, deriveHeldOutSeed, parityPairId,
  createSeedCommitment, verifySeedReveal,
  validateAttemptIdentity, deriveRunId, cellKey,
  createAttemptLedger, appendAttempt, verifyLedgerContinuity, verifyLedgerIntegrity, attemptsForCell,
  FAILURE_CLASSES, isHardFailureClass, evaluateRerunRequest,
  PROFILE_THRESHOLDS, freezeProfileAssignment, evaluatePerformanceSample, evaluateResourceStability,
  assertQualityUnchanged,
  reconcileNativeDuration,
  normalizeOwnerEvidence, evaluateMasslineClaim, evaluatePurchaseClaim,
  createFingerprintRegistry, registerCapture,
  createQualificationMatrix, validateMatrixCompleteness, assertNoRelabel,
} from '../scripts/lib/goldCorridorAcceptanceContracts.mjs';

const CANDIDATE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4';
const CANDIDATE_2 = 'f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3';
const HARNESS = 'b'.repeat(64);
const HARNESS_2 = 'c'.repeat(64);

const SEED_INPUT = Object.freeze({
  heldOutSalt: 'held-out-salt-value',
  candidateCommit: CANDIDATE,
  career: 'hauler',
  horizonMin: 30,
  scenarioClass: 'success',
  cellIndex: 0,
});

function baseIdentity(overrides = {}) {
  const { seed } = deriveHeldOutSeed(SEED_INPUT);
  return {
    candidateCommit: CANDIDATE,
    dependencyReceiptHashes: { 'PQ-019': 'd'.repeat(64) },
    harnessHash: HARNESS,
    runId: 'run-0001',
    career: 'hauler',
    horizonMin: 30,
    scenarioClass: 'success',
    runtimeKind: 'browser',
    seed,
    seedDerivationVersion: SEED_DERIVATION_VERSION,
    parityPairId: parityPairId(SEED_INPUT),
    profileClass: 'target',
    hardwareProfileId: 'hw-reference-01',
    executionProfileId: 'exec-reference-01',
    captureId: 'capture-0001',
    attemptOrdinal: 1,
    ...overrides,
  };
}

function perfSample(overrides = {}) {
  return {
    p50Ms: 8.2, p95Ms: 14.1, p99Ms: 19.8, maxMs: 41.0,
    rawThresholdCounts: { over16_7Ms: 120, over32Ms: 4 },
    missedVsync: 6, multiStepFrames: 2, backlog: 0,
    phaseCosts: { sim: 4.1, render: 7.2 },
    entityCounts: { ships: 22, projectiles: 8 },
    residencyBaseline: 180_000_000, residencyPeak: 240_000_000, residencyEnd: 195_000_000,
    saveBlockingMs: 3.4,
    ...overrides,
  };
}

function goodDuration(overrides = {}) {
  return {
    horizonMin: 30,
    nativeMonotonicMs: 31 * 60_000,
    pausedMs: 0, unfocusedMs: 0, loadingMs: 0,
    simTimeS: 31 * 60,
    timeScaleSamples: [1, 1, 1, 1],
    idleSpansMs: [2_000, 5_000],
    monotonicClock: 'performance.now',
    ...overrides,
  };
}

function fullMatrix() {
  return createQualificationMatrix({
    frozenAtIso: '2026-07-28T00:00:00Z',
    rubricHash: 'r'.repeat(64),
    cells: [
      { career: 'hauler', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
      { career: 'hunter', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target' },
      { career: 'prospector', horizonMin: 30, scenarioClass: 'failure-recovery', runtimeKind: 'browser', profileClass: 'floor' },
      { career: 'hauler', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target' },
      { career: 'hunter', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
      { career: 'prospector', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'floor' },
    ],
  });
}

// =============================================================================================
// PHASE 0 — semantic map
// =============================================================================================

test('phase0: semantic map is structurally valid and every row carries a raw source reference', () => {
  const result = validateSemanticMap();
  assert.equal(result.ok, true, `semantic map errors: ${result.errors.join('; ')}`);
  for (const row of SEMANTIC_OUTCOME_MAP) assert.ok(row.rawRef && row.rawRef.length > 0);
});

test('phase0: every required semantic outcome family is represented', () => {
  const outcomes = SEMANTIC_OUTCOME_MAP.map((row) => row.outcome);
  for (const required of [
    'economy.meaningfulness', 'progression.careerLoop', 'purchase.legal', 'fit.legal',
    'capability.delta', 'combat.encounter', 'failure.recovery', 'save.write', 'save.coldContinue',
    'worldSite.outcome', 'cathedral.outcome', 'ledger.pages', 'asteroidOps.outcome',
    'massline.attachAuthoritative', 'massline.releaseAuthoritative',
  ]) {
    assert.ok(outcomes.includes(required), `semantic map is missing required outcome: ${required}`);
  }
});

test('phase0: absent owner facts are recorded honestly, not faked', () => {
  const absent = absentSemanticRows();
  const names = absent.map((row) => row.outcome);
  // These are the Phase-0 stop-condition findings located by reading the live source.
  for (const expected of ['perf.p50', 'perf.p99', 'perf.missedVsync', 'perf.residency', 'perf.drawTriangleCounts']) {
    assert.ok(names.includes(expected), `expected ${expected} to be recorded as an absent owner fact`);
  }
  for (const row of absent) {
    assert.equal(row.confidence, 'absent');
    assert.ok(row.note && row.note.includes('STOP-CONDITION'), `${row.outcome} must be flagged as a stop-condition finding`);
  }
});

test('phase0: the degraded massline selection receipt is recorded and is not the attach authority', () => {
  const degraded = degradedSemanticRows().map((row) => row.outcome);
  assert.ok(degraded.includes('massline.selectionReceipt'));
  const authority = semanticRow('massline.attachAuthoritative');
  assert.equal(authority.confidence, 'verified');
  assert.equal(authority.module, 'src/combat/attachments.js');
  assert.equal(authority.symbol, 'tether:attached');
});

// =============================================================================================
// Seed derivation + commit-reveal
// =============================================================================================

test('seed derivation is deterministic and versioned', () => {
  const a = deriveHeldOutSeed(SEED_INPUT);
  const b = deriveHeldOutSeed({ ...SEED_INPUT });
  assert.equal(a.seed, b.seed);
  assert.equal(a.seedDerivationVersion, SEED_DERIVATION_VERSION);
  assert.ok(Number.isInteger(a.seed) && a.seed > 0);
});

test('seed derivation changes with the held-out salt and with the cell', () => {
  const base = deriveHeldOutSeed(SEED_INPUT).seed;
  assert.notEqual(deriveHeldOutSeed({ ...SEED_INPUT, heldOutSalt: 'other-salt' }).seed, base);
  assert.notEqual(deriveHeldOutSeed({ ...SEED_INPUT, cellIndex: 1 }).seed, base);
  assert.notEqual(deriveHeldOutSeed({ ...SEED_INPUT, career: 'hunter' }).seed, base);
});

test('ADV-01a: runtime included in seed derivation is rejected', () => {
  assert.throws(
    () => deriveHeldOutSeed({ ...SEED_INPUT, runtimeKind: 'browser' }),
    /seed-derivation-forbidden-input: runtimeKind/,
  );
  // The whole forbidden family is refused, not just the headline key.
  for (const key of SEED_DERIVATION_FORBIDDEN_KEYS) {
    assert.throws(() => deriveHeldOutSeed({ ...SEED_INPUT, [key]: 'x' }), new RegExp(`seed-derivation-forbidden-input: ${key}`));
  }
});

test('ADV-01b: parity seeds must NOT differ across runtimes', () => {
  // Same cell, two runtimes: the derivation cannot see runtime at all, so the seeds are identical
  // and the parity pair id matches. A harness that derived per-runtime seeds would break here.
  const browserSeed = deriveHeldOutSeed(SEED_INPUT).seed;
  const electronSeed = deriveHeldOutSeed(SEED_INPUT).seed;
  assert.equal(browserSeed, electronSeed);
  const pairA = parityPairId(SEED_INPUT);
  const pairB = parityPairId({ ...SEED_INPUT });
  assert.equal(pairA, pairB);
  // And a DIFFERENT cell is a different pair, so parity cannot be claimed across unrelated cells.
  assert.notEqual(parityPairId({ ...SEED_INPUT, cellIndex: 3 }), pairA);
});

test('seed derivation rejects unknown inputs and malformed identity', () => {
  assert.throws(() => deriveHeldOutSeed({ ...SEED_INPUT, somethingElse: 1 }), /unknown-input/);
  assert.throws(() => deriveHeldOutSeed({ ...SEED_INPUT, candidateCommit: 'nope' }), /bad-candidate-commit/);
  assert.throws(() => deriveHeldOutSeed({ ...SEED_INPUT, career: 'smuggler' }), /bad-career/);
  assert.throws(() => deriveHeldOutSeed({ ...SEED_INPUT, horizonMin: 45 }), /bad-horizon/);
  const { heldOutSalt, ...withoutSalt } = SEED_INPUT;
  assert.throws(() => deriveHeldOutSeed(withoutSalt), /missing-input: heldOutSalt/);
});

test('commit-reveal: a matching reveal verifies and a swapped salt does not', () => {
  const commitment = createSeedCommitment({ heldOutSalt: 'salt-A', nonce: 'nonce-A' });
  assert.equal(verifySeedReveal(commitment, { heldOutSalt: 'salt-A', nonce: 'nonce-A' }).ok, true);
  assert.equal(verifySeedReveal(commitment, { heldOutSalt: 'salt-B', nonce: 'nonce-A' }).ok, false);
  assert.equal(verifySeedReveal(commitment, { heldOutSalt: 'salt-A', nonce: 'nonce-B' }).reason, 'reveal-does-not-match-commitment');
  assert.equal(verifySeedReveal(commitment, { heldOutSalt: 'salt-A' }).reason, 'incomplete-reveal');
});

// =============================================================================================
// Attempt identity
// =============================================================================================

test('attempt identity: a complete identity validates and covers exactly the packet JSON', () => {
  const result = validateAttemptIdentity(baseIdentity());
  assert.equal(result.ok, true, result.errors.join(','));
  assert.ok(deriveRunId(baseIdentity()).length > 0);
  assert.equal(cellKey(baseIdentity()), 'hauler|30|success|browser|target');
});

test('attempt identity: missing, unexpected, and malformed fields are rejected', () => {
  const { seed, ...noSeed } = baseIdentity();
  assert.deepEqual(validateAttemptIdentity(noSeed).errors.includes('missing:seed'), true);
  assert.equal(validateAttemptIdentity({ ...baseIdentity(), extra: 1 }).errors.includes('unexpected:extra'), true);
  assert.equal(validateAttemptIdentity({ ...baseIdentity(), candidateCommit: 'short' }).errors.includes('bad:candidateCommit'), true);
  assert.equal(validateAttemptIdentity({ ...baseIdentity(), harnessHash: 'nope' }).errors.includes('bad:harnessHash'), true);
  assert.equal(validateAttemptIdentity({ ...baseIdentity(), runtimeKind: 'wasm' }).errors.includes('bad:runtimeKind'), true);
  assert.equal(validateAttemptIdentity({ ...baseIdentity(), seedDerivationVersion: 'v0' }).errors.includes('bad:seedDerivationVersion'), true);
  assert.equal(validateAttemptIdentity({ ...baseIdentity(), attemptOrdinal: 0 }).errors.includes('bad:attemptOrdinal'), true);
  assert.equal(validateAttemptIdentity({ ...baseIdentity(), dependencyReceiptHashes: { 'PQ-019': 'nope' } })
    .errors.includes('bad:dependencyReceiptHashes.PQ-019'), true);
});

// =============================================================================================
// Append-only attempt ledger
// =============================================================================================

test('ledger: appending returns a new ledger and never mutates the previous one', () => {
  const l0 = createAttemptLedger();
  const l1 = appendAttempt(l0, { identity: baseIdentity(), verdict: 'pass' });
  assert.equal(l0.entries.length, 0);
  assert.equal(l1.entries.length, 1);
  assert.equal(l1.entries[0].attemptOrdinal, 1);
  assert.equal(verifyLedgerIntegrity(l1).ok, true);
});

test('ledger: invalid and failed attempts are RETAINED alongside a later pass', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: baseIdentity(), verdict: 'invalid', failureClass: 'QUALIFICATION' });
  ledger = appendAttempt(ledger, { identity: baseIdentity({ candidateCommit: CANDIDATE_2 }), verdict: 'fail', failureClass: 'ENVIRONMENT' });
  ledger = appendAttempt(ledger, { identity: baseIdentity({ candidateCommit: CANDIDATE_2 }), verdict: 'pass' });
  assert.equal(ledger.entries.length, 3);
  assert.deepEqual(ledger.entries.map((e) => e.verdict), ['invalid', 'fail', 'pass']);
  assert.deepEqual(ledger.entries.map((e) => e.attemptOrdinal), [1, 2, 3]);
  assert.equal(verifyLedgerIntegrity(ledger).ok, true);
});

test('ledger: ordinals are assigned by the ledger, not claimed by the caller', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: baseIdentity({ attemptOrdinal: 99 }), verdict: 'pass' });
  assert.equal(ledger.entries[0].attemptOrdinal, 1);
  assert.equal(ledger.entries[0].identity.attemptOrdinal, 1);
});

test('ledger: a non-pass verdict must carry a failure class', () => {
  const ledger = createAttemptLedger();
  assert.throws(() => appendAttempt(ledger, { identity: baseIdentity(), verdict: 'fail' }), /non-pass-requires-failure-class/);
  assert.throws(() => appendAttempt(ledger, { identity: baseIdentity(), verdict: 'bogus' }), /bad-verdict/);
});

test('ADV-04a: a deleted failed/invalid attempt is rejected', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: baseIdentity(), verdict: 'fail', failureClass: 'PRODUCT_ECONOMY' });
  ledger = appendAttempt(ledger, { identity: baseIdentity({ candidateCommit: CANDIDATE_2 }), verdict: 'pass' });
  // Someone drops the red attempt and keeps only the green one.
  const scrubbed = { schema: ledger.schema, entries: [ledger.entries[1]], headHash: ledger.headHash };
  const result = verifyLedgerContinuity(ledger, scrubbed);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'attempt-deleted');
});

test('ADV-04b: a replaced attempt is rejected', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: baseIdentity(), verdict: 'fail', failureClass: 'PRODUCT_COMBAT' });
  ledger = appendAttempt(ledger, { identity: baseIdentity({ candidateCommit: CANDIDATE_2 }), verdict: 'pass' });
  const forgedEntries = ledger.entries.map((entry) => ({ ...entry }));
  forgedEntries[0] = { ...forgedEntries[0], verdict: 'pass', failureClass: null };
  const forged = { schema: ledger.schema, entries: forgedEntries, headHash: ledger.headHash };
  const continuity = verifyLedgerContinuity(ledger, forged);
  assert.equal(continuity.ok, false);
  assert.equal(continuity.reason, 'attempt-replaced-at-ordinal-1');
  // The hash chain independently catches the same forgery.
  const integrity = verifyLedgerIntegrity(forged);
  assert.equal(integrity.ok, false);
  assert.match(integrity.reason, /hash-chain-broken-at-ordinal-1/);
});

test('ledger: an attempt cannot be relabelled into a different matrix cell', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: baseIdentity(), verdict: 'fail', failureClass: 'PRODUCT_PARITY' });
  // Move a red hauler/browser attempt onto the hunter/electron cell so the red lands elsewhere.
  const forgedEntries = ledger.entries.map((entry) => ({ ...entry, cellKey: 'hunter|30|success|electron|target' }));
  const forged = { schema: ledger.schema, entries: forgedEntries, headHash: ledger.headHash };
  const result = verifyLedgerIntegrity(forged);
  assert.equal(result.ok, false);
  assert.match(result.reason, /cell-key-does-not-match-identity-at-ordinal-1/);
});

test('ledger: an entry whose identity ordinal disagrees with its slot is rejected', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: baseIdentity(), verdict: 'pass' });
  const forgedEntries = ledger.entries.map((entry) => ({ ...entry, identity: { ...entry.identity, attemptOrdinal: 7 } }));
  const forged = { schema: ledger.schema, entries: forgedEntries, headHash: ledger.headHash };
  assert.match(verifyLedgerIntegrity(forged).reason, /identity-ordinal-mismatch-at-1/);
});

test('ledger: legitimate growth (append) passes continuity', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: baseIdentity(), verdict: 'fail', failureClass: 'ENVIRONMENT' });
  const grown = appendAttempt(ledger, { identity: baseIdentity(), verdict: 'pass' });
  assert.equal(verifyLedgerContinuity(ledger, grown).ok, true);
  assert.equal(attemptsForCell(grown, cellKey(baseIdentity())).length, 2);
});

// =============================================================================================
// Failure taxonomy + rerun policy
// =============================================================================================

test('failure taxonomy: every packet class exists and hard classes are marked hard', () => {
  for (const cls of ['QUALIFICATION', 'ENVIRONMENT', 'HARNESS', 'HUMAN_JUDGMENT', 'UNKNOWN',
    'PRODUCT_ONBOARDING', 'PRODUCT_NAV', 'PRODUCT_ECONOMY', 'PRODUCT_PROGRESSION', 'PRODUCT_COMBAT',
    'PRODUCT_MASSLINE', 'PRODUCT_SAVE', 'PRODUCT_A11Y', 'PRODUCT_PERF', 'PRODUCT_PARITY']) {
    assert.ok(FAILURE_CLASSES.includes(cls), `missing failure class ${cls}`);
  }
  assert.equal(isHardFailureClass('UNKNOWN'), true);
  assert.equal(isHardFailureClass('HUMAN_JUDGMENT'), true);
  assert.equal(isHardFailureClass('PRODUCT_MASSLINE'), true);
  assert.equal(isHardFailureClass('ENVIRONMENT'), false);
  assert.equal(isHardFailureClass('HARNESS'), false);
});

test('rerun policy: no unchanged-candidate rerun after a product failure (no best-of-N)', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: baseIdentity(), verdict: 'fail', failureClass: 'PRODUCT_ECONOMY' });
  const denied = evaluateRerunRequest({
    ledger, cellKey: cellKey(baseIdentity()), priorFailureClass: 'PRODUCT_ECONOMY',
    candidateCommit: CANDIDATE, harnessHash: HARNESS,
  });
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'product-failure-requires-new-candidate');

  const allowed = evaluateRerunRequest({
    ledger, cellKey: cellKey(baseIdentity()), priorFailureClass: 'PRODUCT_ECONOMY',
    candidateCommit: CANDIDATE_2, harnessHash: HARNESS,
  });
  assert.equal(allowed.allowed, true);
});

test('rerun policy: UNKNOWN is terminal and HUMAN_JUDGMENT needs a new candidate', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: baseIdentity(), verdict: 'fail', failureClass: 'UNKNOWN' });
  const key = cellKey(baseIdentity());
  assert.equal(evaluateRerunRequest({ ledger, cellKey: key, priorFailureClass: 'UNKNOWN', candidateCommit: CANDIDATE_2, harnessHash: HARNESS_2 }).allowed, false);
  assert.equal(evaluateRerunRequest({ ledger, cellKey: key, priorFailureClass: 'HUMAN_JUDGMENT', candidateCommit: CANDIDATE, harnessHash: HARNESS }).reason,
    'human-judgment-failure-requires-new-candidate');
});

test('rerun policy: ENVIRONMENT allows exactly one predeclared replacement', () => {
  const key = cellKey(baseIdentity());
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: baseIdentity(), verdict: 'fail', failureClass: 'ENVIRONMENT' });
  assert.equal(evaluateRerunRequest({ ledger, cellKey: key, priorFailureClass: 'ENVIRONMENT', candidateCommit: CANDIDATE, harnessHash: HARNESS }).allowed, true);
  ledger = appendAttempt(ledger, { identity: baseIdentity(), verdict: 'fail', failureClass: 'ENVIRONMENT' });
  const exhausted = evaluateRerunRequest({ ledger, cellKey: key, priorFailureClass: 'ENVIRONMENT', candidateCommit: CANDIDATE, harnessHash: HARNESS });
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.reason, 'environment-replacement-budget-exhausted');
});

test('rerun policy: a HARNESS fix needs a new harness hash and only invalidates affected evidence paths', () => {
  const key = cellKey(baseIdentity());
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, {
    identity: baseIdentity(), verdict: 'fail', failureClass: 'HARNESS', evidencePaths: ['observer/perf'],
  });
  assert.equal(evaluateRerunRequest({
    ledger, cellKey: key, priorFailureClass: 'HARNESS', candidateCommit: CANDIDATE, harnessHash: HARNESS,
    affectedEvidencePaths: ['observer/perf'],
  }).reason, 'harness-failure-requires-new-harness-hash');

  assert.equal(evaluateRerunRequest({
    ledger, cellKey: key, priorFailureClass: 'HARNESS', candidateCommit: CANDIDATE, harnessHash: HARNESS_2,
    affectedEvidencePaths: ['observer/media'],
  }).reason, 'harness-fix-did-not-affect-this-cell-evidence-path');

  assert.equal(evaluateRerunRequest({
    ledger, cellKey: key, priorFailureClass: 'HARNESS', candidateCommit: CANDIDATE, harnessHash: HARNESS_2,
    affectedEvidencePaths: ['observer/perf'],
  }).allowed, true);
});

// =============================================================================================
// Performance profile contract
// =============================================================================================

test('profile assignment is frozen before the run and never inferred from measured cadence', () => {
  const assignment = freezeProfileAssignment({ profileClass: 'target', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1' });
  assert.equal(assignment.profileClass, 'target');
  assert.equal(assignment.acceptanceEligible, true);
  assert.throws(
    () => freezeProfileAssignment({ profileClass: 'floor', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1', measuredFps: 58 }),
    /must-not-consult-measured-fps/,
  );
  assert.throws(() => freezeProfileAssignment({ profileClass: 'turbo', hardwareProfileId: 'hw', executionProfileId: 'ex' }), /bad-class/);
});

test('performance: a complete target sample under 16.7ms passes', () => {
  const assignment = freezeProfileAssignment({ profileClass: 'target', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1' });
  const result = evaluatePerformanceSample(assignment, perfSample());
  assert.equal(result.ok, true, result.reason);
  assert.equal(PROFILE_THRESHOLDS.target.p95Ms, 16.7);
});

test('ADV-11a: target evaluated at the floor threshold is rejected', () => {
  const assignment = freezeProfileAssignment({ profileClass: 'target', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1' });
  const result = evaluatePerformanceSample(assignment, perfSample({ p95Ms: 28.0 }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target-evaluated-at-floor-threshold');
});

test('ADV-11b: floor must not blindly zero-gate raw >32ms, and it still reports the raw count', () => {
  const assignment = freezeProfileAssignment({ profileClass: 'floor', hardwareProfileId: 'hw-2', executionProfileId: 'ex-2' });
  const gated = evaluatePerformanceSample(assignment, perfSample({ p95Ms: 30.0, floorZeroGateRawOver32: true }));
  assert.equal(gated.ok, false);
  assert.equal(gated.reason, 'floor-must-not-blindly-zero-gate-raw-over-32ms');

  const proper = evaluatePerformanceSample(assignment, perfSample({ p95Ms: 30.0, rawThresholdCounts: { over32Ms: 9 } }));
  assert.equal(proper.ok, true, proper.reason);
  assert.equal(proper.rawOver32Reported, 9, 'raw >32ms count must remain reported, not suppressed');
  assert.equal(PROFILE_THRESHOLDS.floor.p95Ms, 33.3);
});

test('ADV-11c: a diagnostic profile is never acceptance-eligible', () => {
  const assignment = freezeProfileAssignment({ profileClass: 'diagnostic', hardwareProfileId: 'hw-3', executionProfileId: 'ex-3' });
  assert.equal(assignment.acceptanceEligible, false);
  const result = evaluatePerformanceSample(assignment, perfSample({ p95Ms: 4.0 }));
  assert.equal(result.ok, false);
  assert.equal(result.acceptanceEligible, false);
  assert.equal(result.reason, 'diagnostic-profile-is-never-acceptance-eligible');
});

test('ADV-12a..f: a sample missing any required metric is rejected', () => {
  const assignment = freezeProfileAssignment({ profileClass: 'target', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1' });
  const cases = {
    'ADV-12a': 'p99Ms',
    'ADV-12b': 'maxMs',
    'ADV-12c': 'missedVsync',
    'ADV-12d': 'multiStepFrames',
    'ADV-12e': 'residencyPeak',
    'ADV-12f': 'saveBlockingMs',
  };
  for (const [id, metric] of Object.entries(cases)) {
    const sample = perfSample();
    delete sample[metric];
    const result = evaluatePerformanceSample(assignment, sample);
    assert.equal(result.ok, false, `${id}: missing ${metric} must reject`);
    assert.match(result.reason, new RegExp(`missing-required-metric:.*${metric}`), `${id}: ${result.reason}`);
  }
  // p50 and the remaining residency points are equally required.
  for (const metric of ['p50Ms', 'residencyBaseline', 'residencyEnd', 'backlog', 'phaseCosts', 'rawThresholdCounts', 'entityCounts']) {
    const sample = perfSample();
    delete sample[metric];
    assert.equal(evaluatePerformanceSample(assignment, sample).ok, false, `missing ${metric} must reject`);
  }
});

test('ADV-14: reducing default quality to pass is rejected', () => {
  const assignment = freezeProfileAssignment({ profileClass: 'target', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1' });
  const result = evaluatePerformanceSample(assignment, perfSample({ p95Ms: 9.0, qualityReduced: true }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'quality-reduced-to-pass');
  // Independent settings comparison catches a silently changed setting too.
  const frozen = { shadows: 'high', bloom: true, resolutionScale: 1 };
  assert.equal(assertQualityUnchanged(frozen, { ...frozen }).ok, true);
  assert.equal(assertQualityUnchanged(frozen, { ...frozen, resolutionScale: 0.75 }).reason, 'default-quality-or-settings-changed');
});

test('long-session stability: monotonic growth without a declared bound is rejected', () => {
  const clean = evaluateResourceStability({
    series: { listeners: [10, 12, 11, 12, 11] }, declaredHighWater: {},
  });
  assert.equal(clean.ok, true);
  const leaking = evaluateResourceStability({
    series: { timers: [4, 9, 14, 22, 31] }, declaredHighWater: {},
  });
  assert.equal(leaking.ok, false);
  assert.match(leaking.violations.join(','), /timers:monotonic-growth-without-declared-bound/);
  const overHighWater = evaluateResourceStability({
    series: { savePayloadBytes: [100, 200, 900] }, declaredHighWater: { savePayloadBytes: 500 },
  });
  assert.equal(overHighWater.ok, false);
});

// =============================================================================================
// Native duration + sim reconciliation
// =============================================================================================

test('native duration: a clean focused 30-minute run reconciles', () => {
  const result = reconcileNativeDuration(goodDuration());
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.focusedPlayableMs, 31 * 60_000);
});

test('ADV-07a: a short native duration is rejected', () => {
  const result = reconcileNativeDuration(goodDuration({ nativeMonotonicMs: 20 * 60_000, simTimeS: 20 * 60 }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'native-duration-short');
});

test('ADV-07b: paused / unfocused / loading time is excluded, never counted', () => {
  const result = reconcileNativeDuration(goodDuration({
    nativeMonotonicMs: 31 * 60_000, pausedMs: 3 * 60_000, unfocusedMs: 60_000, loadingMs: 60_000, simTimeS: 26 * 60,
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'native-duration-short');
  // 31 - 3 - 1 - 1 = 26 focused minutes: the excluded time did not inflate the total.
  assert.equal(result.focusedPlayableMs, 26 * 60_000);
});

test('ADV-07c: timeScale not exactly one is rejected', () => {
  assert.equal(reconcileNativeDuration(goodDuration({ timeScaleSamples: [1, 1, 1.5, 1] })).reason, 'time-scale-not-exactly-one');
  assert.equal(reconcileNativeDuration(goodDuration({ timeScaleSamples: [1, 0.999999] })).reason, 'time-scale-not-exactly-one');
  assert.equal(reconcileNativeDuration(goodDuration({ timeScaleSamples: [] })).reason, 'missing-time-scale-samples');
});

test('ADV-07d: sim-time reconciliation failure is rejected', () => {
  const result = reconcileNativeDuration(goodDuration({ simTimeS: 45 * 60 }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'sim-reconciliation-failure');
});

test('ADV-07e: focused idling is rejected', () => {
  const result = reconcileNativeDuration(goodDuration({ idleSpansMs: [5_000, 15 * 60_000] }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'focused-idling-detected');
});

test('native duration must come from a monotonic clock', () => {
  assert.equal(reconcileNativeDuration(goodDuration({ monotonicClock: 'Date.now' })).reason,
    'duration-must-come-from-a-monotonic-clock');
});

// =============================================================================================
// Owner evidence, purchase chain, massline
// =============================================================================================

test('owner evidence: a verified observation with a raw reference is satisfied', () => {
  const evidence = normalizeOwnerEvidence({
    outcome: 'massline.attachAuthoritative',
    observation: { type: 'tether:attached', attachmentId: 'att-1', targetId: 'ent-9' },
    rawRef: 'src/combat/attachments.js:212',
    confidence: 'verified',
  });
  assert.equal(evidence.satisfied, true);
  assert.equal(evidence.confidence, 'verified');
});

test('ADV-17: unknown owner evidence is never a warning or a pass', () => {
  const unknown = normalizeOwnerEvidence({
    outcome: 'economy.meaningfulness', observation: { type: 'economy:tradeCompleted' },
    rawRef: 'src/systems/economy.js:1047', confidence: 'unknown',
  });
  assert.equal(unknown.satisfied, false);
  assert.equal(unknown.confidence, 'unknown');
  assert.equal(unknown.reason, 'unknown-owner-evidence-is-never-a-pass');

  // An outcome whose owner fact does not exist cannot be talked into a pass by claiming `verified`.
  const absent = normalizeOwnerEvidence({
    outcome: 'perf.p99', observation: { value: 21 }, rawRef: 'made-up', confidence: 'verified',
  });
  assert.equal(absent.satisfied, false);
  assert.equal(absent.reason, 'owner-fact-absent-at-this-revision');

  // A claim with no observation, and one with no raw reference, are both unknown.
  assert.equal(normalizeOwnerEvidence({ outcome: 'save.write', rawRef: 'src/save/saveSystem.js:707', confidence: 'verified' }).satisfied, false);
  assert.equal(normalizeOwnerEvidence({ outcome: 'save.write', observation: {}, confidence: 'verified' }).reason, 'missing-raw-reference');
  assert.equal(normalizeOwnerEvidence({ outcome: 'not.a.real.outcome', observation: {}, rawRef: 'x', confidence: 'verified' }).reason, 'outcome-not-in-semantic-map');
});

test('ADV-10: a Massline attempt without authoritative attach success is rejected', () => {
  const attemptOnly = evaluateMasslineClaim({
    events: [
      { type: 'tether:latchDenied', reason: 'cooldown' },
      { type: 'tether:latchDenied', reason: 'attachment_authority_unavailable' },
    ],
  });
  assert.equal(attemptOnly.ok, false);
  assert.equal(attemptOnly.reason, 'massline-attempt-without-authoritative-attach');
  assert.equal(attemptOnly.deniedCount, 2);

  assert.equal(evaluateMasslineClaim({ events: [] }).reason, 'no-authoritative-attach-evidence');
  // An attach event that cannot identify what it attached to is not authoritative either.
  assert.equal(evaluateMasslineClaim({ events: [{ type: 'tether:attached' }] }).reason, 'attach-event-missing-attachment-identity');

  const success = evaluateMasslineClaim({
    events: [{ type: 'tether:latchDenied' }, { type: 'tether:attached', attachmentId: 'att-2', targetId: 'ent-4' }],
  });
  assert.equal(success.ok, true);
  assert.equal(success.attachCount, 1);
});

test('purchase: the complete legal chain passes', () => {
  const claim = {
    kind: 'purchase', charged: true, owned: true, fitted: true, capabilityDelta: true,
    persistedThroughContinue: true, chargeCount: 1, ownershipCount: 1, capabilityDeltaMagnitude: 12.5,
  };
  assert.equal(evaluatePurchaseClaim(claim).ok, true);
});

test('ADV-08a..e: a purchase missing any chain step is rejected', () => {
  const complete = {
    kind: 'purchase', charged: true, owned: true, fitted: true, capabilityDelta: true,
    persistedThroughContinue: true, chargeCount: 1, ownershipCount: 1, capabilityDeltaMagnitude: 12.5,
  };
  const steps = {
    'ADV-08a': 'charged',
    'ADV-08b': 'owned',
    'ADV-08c': 'fitted',
    'ADV-08d': 'capabilityDelta',
    'ADV-08e': 'persistedThroughContinue',
  };
  for (const [id, step] of Object.entries(steps)) {
    const broken = { ...complete, [step]: false };
    const result = evaluatePurchaseClaim(broken);
    assert.equal(result.ok, false, `${id}: missing ${step} must reject`);
    assert.match(result.reason, /purchase-chain-incomplete/, `${id}: ${result.reason}`);
  }
  // Charged twice / owned twice / an unmeasurable delta are separately rejected.
  assert.equal(evaluatePurchaseClaim({ ...complete, chargeCount: 2 }).reason, 'purchase-must-be-charged-exactly-once');
  assert.equal(evaluatePurchaseClaim({ ...complete, ownershipCount: 2 }).reason, 'purchase-must-be-owned-exactly-once');
  assert.equal(evaluatePurchaseClaim({ ...complete, capabilityDeltaMagnitude: 0 }).reason, 'capability-delta-must-be-measurable');
});

test('ADV-09: research / preview / affordability is not a purchase', () => {
  for (const surrogate of ['researched', 'previewed', 'affordable']) {
    const result = evaluatePurchaseClaim({
      kind: 'purchase', [surrogate]: true, charged: false, owned: true, fitted: true,
      capabilityDelta: true, persistedThroughContinue: true,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /research-or-preview-is-not-a-purchase/);
  }
  assert.match(evaluatePurchaseClaim({ kind: 'research' }).reason, /non-purchase-event-cannot-satisfy-purchase/);
});

// =============================================================================================
// Capture fingerprints
// =============================================================================================

test('fingerprints: distinct captures for distinct cells register cleanly', () => {
  const registry = createFingerprintRegistry();
  const base = { sourceFingerprint: 'src-1', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1' };
  assert.equal(registerCapture(registry, { ...base, captureId: 'c1', cellKey: 'k1', attemptOrdinal: 1, contentHash: 'h1' }).ok, true);
  assert.equal(registerCapture(registry, { ...base, captureId: 'c2', cellKey: 'k2', attemptOrdinal: 1, contentHash: 'h2' }).ok, true);
});

test('ADV-13: one capture cannot satisfy two cells', () => {
  const registry = createFingerprintRegistry();
  const base = { sourceFingerprint: 'src-1', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1' };
  registerCapture(registry, { ...base, captureId: 'shared', cellKey: 'hauler|30|success|browser|target', attemptOrdinal: 1, contentHash: 'h1' });
  const reused = registerCapture(registry, { ...base, captureId: 'shared', cellKey: 'hunter|30|success|electron|target', attemptOrdinal: 1, contentHash: 'h9' });
  assert.equal(reused.ok, false);
  assert.equal(reused.reason, 'capture-reused-across-cells');
});

test('ADV-16a..c: stale media / receipt / save content cannot be re-submitted under a new id', () => {
  const base = { sourceFingerprint: 'src-1', hardwareProfileId: 'hw-1', executionProfileId: 'ex-1' };
  for (const [id, kind] of Object.entries({ 'ADV-16a': 'media', 'ADV-16b': 'receipt', 'ADV-16c': 'save' })) {
    const registry = createFingerprintRegistry();
    const contentHash = `content-of-${kind}`;
    assert.equal(registerCapture(registry, { ...base, captureId: `${kind}-1`, cellKey: 'k1', attemptOrdinal: 1, contentHash }).ok, true);
    const stale = registerCapture(registry, { ...base, captureId: `${kind}-2`, cellKey: 'k2', attemptOrdinal: 1, contentHash });
    assert.equal(stale.ok, false, `${id}: identical ${kind} content under a new id must reject`);
    assert.equal(stale.reason, 'stale-capture-content-reused');
    assert.equal(stale.firstCaptureId, `${kind}-1`);
  }
});

test('fingerprints: incomplete identity is rejected', () => {
  const registry = createFingerprintRegistry();
  const base = { captureId: 'c', cellKey: 'k', attemptOrdinal: 1, contentHash: 'h', sourceFingerprint: 's', hardwareProfileId: 'hw', executionProfileId: 'ex' };
  for (const field of ['captureId', 'cellKey', 'contentHash', 'sourceFingerprint', 'hardwareProfileId', 'executionProfileId']) {
    const broken = { ...base };
    delete broken[field];
    assert.equal(registerCapture(createFingerprintRegistry(), broken).ok, false, `missing ${field} must reject`);
  }
  assert.equal(registerCapture(registry, base).ok, true);
});

// =============================================================================================
// Matrix
// =============================================================================================

test('matrix: a complete matrix validates', () => {
  const result = validateMatrixCompleteness(fullMatrix());
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(fullMatrix().cells.length, 6);
  for (const career of CAREERS) assert.ok(fullMatrix().cells.some((cell) => cell.career === career));
  for (const horizon of HORIZONS_MIN) assert.ok(fullMatrix().cells.some((cell) => cell.horizonMin === horizon));
  for (const runtime of RUNTIME_KINDS) assert.ok(fullMatrix().cells.some((cell) => cell.runtimeKind === runtime));
});

test('ADV-03: a matrix omitting the required failure/recovery cell is rejected', () => {
  const matrix = createQualificationMatrix({
    cells: [
      { career: 'hauler', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
      { career: 'hunter', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target' },
      { career: 'prospector', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
      { career: 'hauler', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target' },
      { career: 'hunter', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
      { career: 'prospector', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target' },
    ],
  });
  const result = validateMatrixCompleteness(matrix);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('required-failure-recovery-cell-omitted'));
});

test('matrix: a missing career, an unrepresented runtime, and a diagnostic required cell are rejected', () => {
  const missingCareer = createQualificationMatrix({
    cells: [{ career: 'hauler', horizonMin: 30, scenarioClass: 'failure-recovery', runtimeKind: 'browser', profileClass: 'target' }],
  });
  const result = validateMatrixCompleteness(missingCareer);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('missing-required-cell:hunter')));
  assert.ok(result.errors.some((e) => e.includes('runtime-not-represented-at-30min:electron')));

  const diagnosticRequired = createQualificationMatrix({
    cells: [{ career: 'hauler', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'diagnostic' }],
  });
  assert.ok(validateMatrixCompleteness(diagnosticRequired).errors.includes('diagnostic-profile-cell-cannot-be-required-for-acceptance'));
});

test('ADV-02a: a scenario relabeled after observation is rejected', () => {
  const frozen = fullMatrix().cells[2]; // prospector 30min failure-recovery
  const observed = { ...frozen, scenarioClass: 'success' };
  const result = assertNoRelabel(frozen, observed);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('scenario-relabeled-after-observation'));
});

test('ADV-02b: a profile relabeled after observation is rejected', () => {
  const frozen = fullMatrix().cells[0]; // target
  const observed = { ...frozen, profileClass: 'floor' };
  const result = assertNoRelabel(frozen, observed);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('profile-relabeled-after-observation'));
  // Career and horizon are equally frozen.
  assert.ok(assertNoRelabel(frozen, { ...frozen, career: 'hunter' }).errors.includes('career-relabeled-after-observation'));
  assert.ok(assertNoRelabel(frozen, { ...frozen, horizonMin: 90 }).errors.includes('horizon-relabeled-after-observation'));
  assert.equal(assertNoRelabel(frozen, { ...frozen }).ok, true);
});
