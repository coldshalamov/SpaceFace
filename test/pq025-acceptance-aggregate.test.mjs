// PQ-025 Phase-1 aggregate validator + receipt publisher tests.
//
// The decision rules under test: one hard failure / unknown / missing cell fails qualification;
// averages are diagnostic only; human judgment cannot waive a hard technical failure; the harness
// never promotes itself.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAggregate, publishAggregateReceipt, verifyAggregateReceipt, resolveCell,
  evaluateHumanVerdicts, auditRerunLegality, auditCaptureUniqueness, AGGREGATE_SCHEMA,
} from '../scripts/lib/goldCorridorAcceptanceAggregate.mjs';

import {
  createQualificationMatrix, createAttemptLedger, appendAttempt,
  deriveHeldOutSeed, parityPairId, SEED_DERIVATION_VERSION, normalizeOwnerEvidence, cellKey,
} from '../scripts/lib/goldCorridorAcceptanceContracts.mjs';

const CANDIDATE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4';
const HARNESS = 'b'.repeat(64);
const RUBRIC = 'r'.repeat(64);

const CELLS = Object.freeze([
  { career: 'hauler', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
  { career: 'hunter', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target' },
  { career: 'prospector', horizonMin: 30, scenarioClass: 'failure-recovery', runtimeKind: 'browser', profileClass: 'floor' },
  { career: 'hauler', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target' },
  { career: 'hunter', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
  { career: 'prospector', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'floor' },
]);

const CRITICAL_QUESTIONS = Object.freeze(['discoverability', 'fairness', 'recovery-comprehensibility', 'coherence']);

function matrix() {
  return createQualificationMatrix({
    frozenAtIso: '2026-07-28T00:00:00Z', rubricHash: RUBRIC,
    criticalQuestionIds: [...CRITICAL_QUESTIONS],
    cells: CELLS.map((c) => ({ ...c })),
  });
}

/** Every frozen critical question answered and passing, unless a specific override says otherwise. */
function humanAnswers(overrides = {}) {
  return CRITICAL_QUESTIONS.map((questionId) => ({
    questionId, critical: true, pass: true, rubricHash: RUBRIC, ...(overrides[questionId] || {}),
  }));
}

function identityFor(cell, index, overrides = {}) {
  const seedInput = {
    heldOutSalt: 'held-out', candidateCommit: CANDIDATE, career: cell.career,
    horizonMin: cell.horizonMin, scenarioClass: cell.scenarioClass, cellIndex: index,
  };
  return {
    candidateCommit: CANDIDATE,
    dependencyReceiptHashes: { 'PQ-024': 'e'.repeat(64) },
    harnessHash: HARNESS,
    runId: `run-${index}`,
    career: cell.career,
    horizonMin: cell.horizonMin,
    scenarioClass: cell.scenarioClass,
    runtimeKind: cell.runtimeKind,
    seed: deriveHeldOutSeed(seedInput).seed,
    seedDerivationVersion: SEED_DERIVATION_VERSION,
    parityPairId: parityPairId(seedInput),
    profileClass: cell.profileClass,
    hardwareProfileId: 'hw-ref',
    executionProfileId: 'ex-ref',
    captureId: `capture-${index}`,
    attemptOrdinal: 1,
    ...overrides,
  };
}

/** A ledger where every matrix cell has a terminal pass. */
function passingLedger(mutate = null) {
  let ledger = createAttemptLedger();
  CELLS.forEach((cell, index) => {
    const override = mutate && mutate.index === index ? mutate : null;
    if (override && override.skip) return;
    ledger = appendAttempt(ledger, {
      identity: identityFor(cell, index),
      verdict: override ? override.verdict : 'pass',
      failureClass: override ? override.failureClass : null,
    });
  });
  return ledger;
}

function verifiedEvidence() {
  return [
    normalizeOwnerEvidence({ outcome: 'economy.meaningfulness', observation: { type: 'economy:tradeCompleted' }, rawRef: 'src/systems/economy.js:1047', confidence: 'verified' }),
    normalizeOwnerEvidence({ outcome: 'massline.attachAuthoritative', observation: { attachmentId: 'a1', targetId: 't1' }, rawRef: 'src/combat/attachments.js:212', confidence: 'verified' }),
    normalizeOwnerEvidence({ outcome: 'save.coldContinue', observation: { slot: 'auto' }, rawRef: 'src/save/saveSystem.js:2129', confidence: 'verified' }),
  ];
}

function baseArgs(overrides = {}) {
  return {
    matrix: matrix(),
    ledger: passingLedger(),
    ownerEvidence: verifiedEvidence(),
    humanRubricHash: RUBRIC,
    humanVerdicts: humanAnswers(),
    dependencyReceiptHashes: { 'PQ-024': 'e'.repeat(64) },
    expectedDependencyReceiptHashes: { 'PQ-024': 'e'.repeat(64) },
    ...overrides,
  };
}

// =============================================================================================

test('aggregate: a complete, fully green matrix passes', () => {
  const result = validateAggregate(baseArgs());
  assert.equal(result.ok, true, result.blockers.join('; '));
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.counts.required, 6);
  assert.equal(result.counts.pass, 6);
  assert.equal(result.retainedAttemptCount, 6);
});

test('aggregate: ONE hard failed cell fails the whole qualification', () => {
  const result = validateAggregate(baseArgs({
    ledger: passingLedger({ index: 3, verdict: 'fail', failureClass: 'PRODUCT_MASSLINE' }),
  }));
  assert.equal(result.ok, false);
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.counts.fail, 1);
  assert.equal(result.counts.pass, 5);
  assert.ok(result.blockers.some((b) => b.startsWith('failed-cell:hauler|90|success|electron|target')));
});

test('aggregate: ONE unknown cell fails the whole qualification', () => {
  const result = validateAggregate(baseArgs({
    ledger: passingLedger({ index: 1, verdict: 'fail', failureClass: 'UNKNOWN' }),
  }));
  assert.equal(result.ok, false);
  assert.equal(result.counts.unknown, 1);
  assert.ok(result.blockers.some((b) => b.startsWith('unknown-cell:')));
});

test('aggregate: ONE missing cell fails the whole qualification', () => {
  const result = validateAggregate(baseArgs({ ledger: passingLedger({ index: 4, skip: true }) }));
  assert.equal(result.ok, false);
  assert.equal(result.counts.missing, 1);
  assert.ok(result.blockers.some((b) => b.startsWith('missing-required-cell:hunter|90|success|browser|target')));
});

test('aggregate: averages are diagnostic only and never lift a failed cell', () => {
  const result = validateAggregate(baseArgs({
    ledger: passingLedger({ index: 0, verdict: 'fail', failureClass: 'PRODUCT_PERF' }),
    diagnosticAverages: { meanP95Ms: 8.1, passRate: 0.83 },
  }));
  assert.equal(result.ok, false, 'a flattering average must not rescue a failed hard cell');
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.diagnostics.averages.passRate, 0.83);
  assert.match(result.diagnostics.note, /never lift a failed/);
});

test('aggregate: unresolved or unverified owner evidence blocks', () => {
  const unknownEvidence = normalizeOwnerEvidence({
    outcome: 'ledger.pages', observation: { pages: 3 }, rawRef: 'src/systems/shipLedger.js:528', confidence: 'unknown',
  });
  const result = validateAggregate(baseArgs({ ownerEvidence: [...verifiedEvidence(), unknownEvidence] }));
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.startsWith('owner-evidence-unresolved:ledger.pages')));
});

test('aggregate: a dependency receipt hash mismatch blocks', () => {
  const result = validateAggregate(baseArgs({ dependencyReceiptHashes: { 'PQ-024': 'f'.repeat(64) } }));
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('dependency-receipt-mismatch:PQ-024'));
});

test('aggregate: a tampered ledger blocks on integrity before anything else can pass', () => {
  // A genuinely red cell is laundered into a green one after the fact.
  const ledger = passingLedger({ index: 2, verdict: 'fail', failureClass: 'PRODUCT_COMBAT' });
  const forgedEntries = ledger.entries.map((entry) => ({ ...entry }));
  forgedEntries[2] = { ...forgedEntries[2], verdict: 'pass', failureClass: null };
  const forged = { schema: ledger.schema, entries: forgedEntries, headHash: ledger.headHash };

  // Without the chain the laundering would look clean: the cell now resolves to a terminal pass.
  assert.equal(forged.entries[2].verdict, 'pass');

  const result = validateAggregate(baseArgs({ ledger: forged }));
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.startsWith('ledger-integrity:')), result.blockers.join('; '));
});

test('aggregate: an incomplete matrix blocks even when every present cell is green', () => {
  const partial = createQualificationMatrix({ cells: [CELLS[0]] });
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: identityFor(CELLS[0], 0), verdict: 'pass' });
  const result = validateAggregate(baseArgs({ matrix: partial, ledger }));
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.startsWith('matrix:')));
});

// =============================================================================================
// Human judgment
// =============================================================================================

test('human judgment: a frozen rubric with every critical question answered is clean', () => {
  const result = evaluateHumanVerdicts({
    rubricHash: RUBRIC, criticalQuestionIds: [...CRITICAL_QUESTIONS], verdicts: humanAnswers(),
  });
  assert.equal(result.ok, true, result.errors.join(','));
});

test('human judgment: NO human verdict at all can never be a pass', () => {
  // The whole matrix is green; nobody judged anything. This must not qualify.
  const result = validateAggregate(baseArgs({ humanVerdicts: [] }));
  assert.equal(result.ok, false);
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.blockers.includes('human:no-human-verdict-recorded'));
  for (const questionId of CRITICAL_QUESTIONS) {
    assert.ok(result.blockers.includes(`human:critical-question-unanswered:${questionId}`), `${questionId} must be reported unanswered`);
  }
});

test('human judgment: an unanswered critical question blocks even when the answered ones pass', () => {
  const partial = humanAnswers().filter((verdict) => verdict.questionId !== 'fairness');
  const result = validateAggregate(baseArgs({ humanVerdicts: partial }));
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('human:critical-question-unanswered:fairness'));
});

test('human judgment: an unfrozen critical question set blocks', () => {
  const unfrozen = createQualificationMatrix({ rubricHash: RUBRIC, cells: CELLS.map((c) => ({ ...c })) });
  const result = validateAggregate(baseArgs({ matrix: unfrozen }));
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('human:critical-rubric-questions-not-frozen'));
});

test('human judgment: a critical failure is an acceptance failure', () => {
  const result = validateAggregate(baseArgs({
    humanVerdicts: humanAnswers({ 'recovery-comprehensibility': { pass: false } }),
  }));
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.includes('critical-human-judgment-failure:recovery-comprehensibility')));
});

test('human judgment: a human verdict cannot waive a hard technical failure', () => {
  const result = validateAggregate(baseArgs({
    ledger: passingLedger({ index: 5, verdict: 'fail', failureClass: 'PRODUCT_SAVE' }),
    humanVerdicts: humanAnswers({ coherence: { waivesTechnicalFailure: true } }),
  }));
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.includes('human-judgment-cannot-waive-hard-technical-failure')));
  // The technical failure is still reported in its own right.
  assert.ok(result.blockers.some((b) => b.startsWith('failed-cell:')));
});

test('human judgment: an unfrozen rubric and a mismatched rubric hash both block', () => {
  assert.ok(evaluateHumanVerdicts({ rubricHash: null, verdicts: [] }).errors.includes('human-rubric-not-frozen'));
  assert.ok(evaluateHumanVerdicts({
    rubricHash: RUBRIC, criticalQuestionIds: ['q'],
    verdicts: [{ questionId: 'q', critical: false, pass: true, rubricHash: 'z'.repeat(64) }],
  }).errors.includes('human-verdict-rubric-hash-mismatch'));
});

// =============================================================================================
// Rerun legality enforced at DECISION time (no best-of-N)
// =============================================================================================

test('rerun legality: fail -> fail -> pass on an UNCHANGED candidate is rejected as best-of-N', () => {
  // Without this audit the cell resolves to a terminal pass and the whole matrix publishes PASS.
  let ledger = createAttemptLedger();
  CELLS.forEach((cell, index) => {
    if (index === 0) {
      ledger = appendAttempt(ledger, { identity: identityFor(cell, index, { captureId: 'cap-0a' }), verdict: 'fail', failureClass: 'PRODUCT_ECONOMY' });
      ledger = appendAttempt(ledger, { identity: identityFor(cell, index, { captureId: 'cap-0b' }), verdict: 'fail', failureClass: 'PRODUCT_ECONOMY' });
      ledger = appendAttempt(ledger, { identity: identityFor(cell, index, { captureId: 'cap-0c' }), verdict: 'pass' });
      return;
    }
    ledger = appendAttempt(ledger, { identity: identityFor(cell, index), verdict: 'pass' });
  });

  // The terminal attempt really is a pass — the cell state alone would not catch this.
  const resolved = resolveCell(matrix(), ledger, { ...CELLS[0], cellKey: cellKey(CELLS[0]), required: true });
  assert.equal(resolved.state, 'pass');

  const result = validateAggregate(baseArgs({ ledger }));
  assert.equal(result.ok, false, 'best-of-N must not qualify');
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.blockers.some((b) => b.startsWith('illegal-rerun:hauler|30|success|browser|target:product-failure-requires-new-candidate')),
    result.blockers.join('; '));
});

test('rerun legality: a legal ENVIRONMENT replacement and a new-candidate retry are accepted', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: identityFor(CELLS[0], 0, { captureId: 'c1' }), verdict: 'fail', failureClass: 'ENVIRONMENT' });
  ledger = appendAttempt(ledger, { identity: identityFor(CELLS[0], 0, { captureId: 'c2' }), verdict: 'pass' });
  const audit = auditRerunLegality(ledger, cellKey(CELLS[0]));
  assert.equal(audit.ok, true, audit.violations.join(','));
});

test('rerun legality: another attempt after a passing attempt is rejected', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: identityFor(CELLS[0], 0, { captureId: 'c1' }), verdict: 'pass' });
  ledger = appendAttempt(ledger, { identity: identityFor(CELLS[0], 0, { captureId: 'c2' }), verdict: 'pass' });
  const audit = auditRerunLegality(ledger, cellKey(CELLS[0]));
  assert.equal(audit.ok, false);
  assert.match(audit.violations.join(','), /attempt-after-a-passing-attempt-at-ordinal-2/);
});

test('capture uniqueness is enforced at verdict time, not only at registration', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: identityFor(CELLS[0], 0, { captureId: 'shared-capture' }), verdict: 'pass' });
  ledger = appendAttempt(ledger, { identity: identityFor(CELLS[1], 1, { captureId: 'shared-capture' }), verdict: 'pass' });
  const audit = auditCaptureUniqueness(ledger);
  assert.equal(audit.ok, false);
  assert.match(audit.violations.join(','), /capture-reused:shared-capture:ordinals-1-and-2/);

  const result = validateAggregate(baseArgs({ ledger }));
  assert.ok(result.blockers.some((b) => b.startsWith('capture:capture-reused:shared-capture')));
});

test('capture uniqueness: a clean ledger has no capture violations', () => {
  assert.equal(auditCaptureUniqueness(passingLedger()).ok, true);
});

// =============================================================================================
// Cell resolution + retention
// =============================================================================================

test('resolveCell: a retained earlier failure is reported alongside a legal terminal pass', () => {
  const cell = { ...CELLS[0], cellKey: cellKey(CELLS[0]), required: true };
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: identityFor(CELLS[0], 0), verdict: 'fail', failureClass: 'ENVIRONMENT' });
  ledger = appendAttempt(ledger, { identity: identityFor(CELLS[0], 0), verdict: 'pass' });
  const resolved = resolveCell(matrix(), ledger, cell);
  assert.equal(resolved.state, 'pass');
  assert.deepEqual([...resolved.attemptOrdinals], [1, 2]);
  assert.deepEqual([...resolved.retainedFailures], [1], 'the red attempt is retained in the record');
});

// =============================================================================================
// Receipt publishing
// =============================================================================================

test('receipt: publishing binds candidate/harness/matrix/ledger and verifies against its own hash', () => {
  const args = baseArgs();
  const validation = validateAggregate(args);
  const receipt = publishAggregateReceipt({
    validation, candidateCommit: CANDIDATE, harnessHash: HARNESS,
    matrix: args.matrix, ledger: args.ledger,
    artifacts: ['.devshots/pq025/cell-0/trace.json'],
    publishedAtIso: '2026-07-28T12:00:00Z',
  });
  assert.equal(receipt.schema, AGGREGATE_SCHEMA);
  assert.equal(receipt.verdict, 'PASS');
  assert.equal(receipt.candidateCommit, CANDIDATE);
  assert.equal(receipt.ledgerHeadHash, args.ledger.headHash);
  assert.equal(receipt.retainedAttemptCount, 6);
  assert.equal(verifyAggregateReceipt(receipt).ok, true);
  assert.equal(Object.isFrozen(receipt), true);
});

test('receipt: the harness states a verdict but never promotes a milestone', () => {
  const args = baseArgs();
  const receipt = publishAggregateReceipt({
    validation: validateAggregate(args), candidateCommit: CANDIDATE, harnessHash: HARNESS,
    matrix: args.matrix, ledger: args.ledger,
  });
  assert.equal(receipt.promotion, 'controller-decides');
  assert.equal(receipt.promote, undefined);
  assert.equal(receipt.milestone, undefined);
});

test('receipt: a tampered receipt fails verification', () => {
  const args = baseArgs();
  const receipt = publishAggregateReceipt({
    validation: validateAggregate(args), candidateCommit: CANDIDATE, harnessHash: HARNESS,
    matrix: args.matrix, ledger: args.ledger,
  });
  const forged = { ...receipt, verdict: 'PASS', blockers: [], counts: { ...receipt.counts, fail: 0 } };
  // Flip a FAIL receipt's verdict without recomputing the hash.
  const failArgs = baseArgs({ ledger: passingLedger({ index: 0, verdict: 'fail', failureClass: 'PRODUCT_NAV' }) });
  const failReceipt = publishAggregateReceipt({
    validation: validateAggregate(failArgs), candidateCommit: CANDIDATE, harnessHash: HARNESS,
    matrix: failArgs.matrix, ledger: failArgs.ledger,
  });
  assert.equal(failReceipt.verdict, 'FAIL');
  const laundered = { ...failReceipt, verdict: 'PASS', blockers: [] };
  assert.equal(verifyAggregateReceipt(laundered).ok, false);
  assert.equal(verifyAggregateReceipt(laundered).reason, 'receipt-hash-mismatch');
  assert.equal(verifyAggregateReceipt(forged).ok, true, 'an untouched receipt body still verifies');
});

test('receipt: publishing rejects a malformed candidate or harness identity', () => {
  const args = baseArgs();
  const validation = validateAggregate(args);
  assert.throws(() => publishAggregateReceipt({
    validation, candidateCommit: 'nope', harnessHash: HARNESS, matrix: args.matrix, ledger: args.ledger,
  }), /bad-candidate-commit/);
  assert.throws(() => publishAggregateReceipt({
    validation, candidateCommit: CANDIDATE, harnessHash: 'nope', matrix: args.matrix, ledger: args.ledger,
  }), /bad-harness-hash/);
  assert.throws(() => publishAggregateReceipt({
    validation: { ok: true }, candidateCommit: CANDIDATE, harnessHash: HARNESS, matrix: args.matrix, ledger: args.ledger,
  }), /requires-frozen-validation/);
});
