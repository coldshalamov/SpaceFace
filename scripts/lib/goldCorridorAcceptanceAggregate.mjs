// PQ-025 — held-out Gold Corridor qualification: PURE aggregate validator + receipt publisher.
//
// Takes a frozen matrix, the append-only attempt ledger, normalized owner evidence, human verdicts,
// and the capture fingerprint registry; emits per-cell verdicts and an immutable aggregate receipt.
//
// Decision rules this module exists to make unavoidable:
//   * one hard failure, one UNKNOWN, or one missing required cell fails qualification;
//   * averages are DIAGNOSTIC ONLY and can never lift a failed cell;
//   * a human verdict cannot waive a hard technical failure, and a critical human failure is fatal;
//   * the harness never promotes itself — the receipt states a verdict, the controller decides.

import {
  canonicalJson, sha256Hex, deepFreeze,
  MATRIX_SCHEMA, LEDGER_SCHEMA,
  isHardFailureClass, validateMatrixCompleteness, verifyLedgerIntegrity, attemptsForCell,
} from './goldCorridorAcceptanceContracts.mjs';

export const AGGREGATE_SCHEMA = 'pq025.aggregate-receipt.v1';

const CELL_STATES = Object.freeze(['pass', 'fail', 'unknown', 'missing']);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Resolve one matrix cell against the ledger. The TERMINAL attempt decides — an earlier red is
 * retained but does not by itself doom a cell whose rerun was legally authorized; conversely a
 * later green can never erase a retained red from the record.
 */
export function resolveCell(matrix, ledger, cell) {
  const attempts = attemptsForCell(ledger, cell.cellKey);
  if (attempts.length === 0) {
    return deepFreeze({ cellKey: cell.cellKey, state: 'missing', reason: 'no-attempt-for-required-cell', attemptOrdinals: Object.freeze([]) });
  }
  const ordinals = attempts.map((entry) => entry.attemptOrdinal);
  const terminal = attempts[attempts.length - 1];

  if (terminal.verdict === 'pass') {
    return deepFreeze({
      cellKey: cell.cellKey, state: 'pass', reason: null,
      attemptOrdinals: Object.freeze(ordinals), terminalOrdinal: terminal.attemptOrdinal,
      retainedFailures: Object.freeze(attempts.filter((a) => a.verdict !== 'pass').map((a) => a.attemptOrdinal)),
    });
  }
  const state = terminal.failureClass === 'UNKNOWN' ? 'unknown' : 'fail';
  return deepFreeze({
    cellKey: cell.cellKey, state, reason: terminal.failureClass,
    hard: isHardFailureClass(terminal.failureClass),
    attemptOrdinals: Object.freeze(ordinals), terminalOrdinal: terminal.attemptOrdinal,
  });
}

/**
 * Human rubric handling. Critical questions are frozen before held-out runs; a critical failure is
 * an acceptance failure, and no human verdict may waive a hard technical failure.
 */
export function evaluateHumanVerdicts({ rubricHash, verdicts = [] } = {}) {
  const errors = [];
  if (!nonEmptyString(rubricHash)) errors.push('human-rubric-not-frozen');
  const waivers = verdicts.filter((verdict) => verdict && verdict.waivesTechnicalFailure === true);
  if (waivers.length > 0) errors.push('human-judgment-cannot-waive-hard-technical-failure');
  const criticalFails = verdicts.filter((verdict) => verdict && verdict.critical === true && verdict.pass !== true);
  for (const fail of criticalFails) errors.push(`critical-human-judgment-failure:${fail.questionId || 'unnamed'}`);
  const missingRubric = verdicts.filter((verdict) => verdict && verdict.rubricHash && verdict.rubricHash !== rubricHash);
  if (missingRubric.length > 0) errors.push('human-verdict-rubric-hash-mismatch');
  return { ok: errors.length === 0, errors: Object.freeze(errors), criticalFailureCount: criticalFails.length };
}

/**
 * Full aggregate validation. Returns a structured verdict; it does NOT decide milestone promotion.
 */
export function validateAggregate({
  matrix,
  ledger,
  ownerEvidence = [],
  humanRubricHash = null,
  humanVerdicts = [],
  dependencyReceiptHashes = {},
  expectedDependencyReceiptHashes = null,
  diagnosticAverages = null,
} = {}) {
  const blockers = [];

  if (!matrix || matrix.schema !== MATRIX_SCHEMA) blockers.push('bad-matrix-schema');
  if (!ledger || ledger.schema !== LEDGER_SCHEMA) blockers.push('bad-ledger-schema');
  if (blockers.length > 0) {
    return deepFreeze({ ok: false, verdict: 'FAIL', blockers: Object.freeze(blockers), cells: Object.freeze([]) });
  }

  const integrity = verifyLedgerIntegrity(ledger);
  if (!integrity.ok) blockers.push(`ledger-integrity:${integrity.reason}`);

  const completeness = validateMatrixCompleteness(matrix);
  for (const error of completeness.errors) blockers.push(`matrix:${error}`);

  // Dependency receipt hashes must be exact when an expectation is declared.
  if (expectedDependencyReceiptHashes) {
    for (const [dep, expected] of Object.entries(expectedDependencyReceiptHashes)) {
      if (dependencyReceiptHashes[dep] !== expected) blockers.push(`dependency-receipt-mismatch:${dep}`);
    }
  }

  // Owner evidence: any unsatisfied or unknown-confidence row is a hard blocker.
  for (const evidence of ownerEvidence) {
    if (!evidence || evidence.satisfied !== true) {
      blockers.push(`owner-evidence-unresolved:${evidence?.outcome || 'unnamed'}:${evidence?.reason || 'unknown'}`);
    } else if (evidence.confidence !== 'verified') {
      blockers.push(`owner-evidence-not-verified:${evidence.outcome}`);
    }
  }

  const requiredCells = matrix.cells.filter((cell) => cell.required);
  const cells = requiredCells.map((cell) => resolveCell(matrix, ledger, cell));
  for (const resolved of cells) {
    if (resolved.state === 'missing') blockers.push(`missing-required-cell:${resolved.cellKey}`);
    else if (resolved.state === 'unknown') blockers.push(`unknown-cell:${resolved.cellKey}`);
    else if (resolved.state === 'fail') blockers.push(`failed-cell:${resolved.cellKey}:${resolved.reason}`);
  }

  const human = evaluateHumanVerdicts({ rubricHash: humanRubricHash, verdicts: humanVerdicts });
  for (const error of human.errors) blockers.push(`human:${error}`);

  const ok = blockers.length === 0;
  return deepFreeze({
    ok,
    verdict: ok ? 'PASS' : 'FAIL',
    blockers: Object.freeze(blockers),
    cells: Object.freeze(cells),
    counts: Object.freeze({
      required: requiredCells.length,
      pass: cells.filter((cell) => cell.state === 'pass').length,
      fail: cells.filter((cell) => cell.state === 'fail').length,
      unknown: cells.filter((cell) => cell.state === 'unknown').length,
      missing: cells.filter((cell) => cell.state === 'missing').length,
    }),
    // Averages are carried for DIAGNOSIS ONLY and are deliberately not consulted above.
    diagnostics: deepFreeze({ averages: diagnosticAverages, note: 'diagnostic-only: averages never lift a failed, unknown, or missing cell' }),
    retainedAttemptCount: ledger.entries.length,
  });
}

/**
 * Publish the immutable aggregate receipt. The receipt binds the exact candidate, harness, matrix,
 * ledger head, and artifact set; its own hash covers all of it.
 */
export function publishAggregateReceipt({
  validation,
  candidateCommit,
  harnessHash,
  matrix,
  ledger,
  artifacts = [],
  publishedAtIso = null,
} = {}) {
  if (!validation || !Object.isFrozen(validation)) throw new Error('aggregate-receipt-requires-frozen-validation');
  if (!/^[0-9a-f]{40}$/.test(String(candidateCommit))) throw new Error('aggregate-receipt-bad-candidate-commit');
  if (!/^[0-9a-f]{64}$/.test(String(harnessHash))) throw new Error('aggregate-receipt-bad-harness-hash');

  const body = {
    schema: AGGREGATE_SCHEMA,
    candidateCommit,
    harnessHash,
    matrixHash: sha256Hex(canonicalJson(matrix)),
    ledgerHeadHash: ledger.headHash,
    retainedAttemptCount: ledger.entries.length,
    verdict: validation.verdict,
    blockers: [...validation.blockers],
    counts: { ...validation.counts },
    cells: validation.cells.map((cell) => ({ cellKey: cell.cellKey, state: cell.state, reason: cell.reason ?? null })),
    artifacts: [...artifacts],
    publishedAtIso,
    // The harness states a verdict; it never promotes a milestone.
    promotion: 'controller-decides',
  };
  return deepFreeze({ ...body, receiptHash: sha256Hex(canonicalJson(body)) });
}

/** Re-verify a published receipt against its own content. */
export function verifyAggregateReceipt(receipt) {
  if (!receipt || receipt.schema !== AGGREGATE_SCHEMA) return { ok: false, reason: 'bad-receipt-schema' };
  const { receiptHash, ...body } = receipt;
  const recomputed = sha256Hex(canonicalJson(body));
  if (recomputed !== receiptHash) return { ok: false, reason: 'receipt-hash-mismatch' };
  return { ok: true, reason: null };
}

export default { validateAggregate, publishAggregateReceipt, verifyAggregateReceipt, resolveCell };
