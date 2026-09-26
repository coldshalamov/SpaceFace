// PQ-025 Phase 1 — pure contracts and adversarial fixtures.
//
// Observational acceptance only. This module does not launch the game, start a broker manifest,
// or promote a milestone. It seals run/attempt/aggregate records, derives held-out seeds without
// runtime input, and rejects the gaming moves Phase 1 exists to make impossible.
//
// Seed commit-reveal: the sealed run stores the commitment hash, never the salt. Reveal checks
// that hash and only then derives seeds. Profile class is an input frozen before the run;
// measured cadence is refused so a class cannot be chosen from FPS.

import {
  ATTEMPT_IDENTITY_KEYS,
  CAREERS,
  COMMITMENT_VERSION,
  FAILURE_CLASSES,
  HORIZONS_MIN,
  LEDGER_SCHEMA,
  PROFILE_CLASSES,
  RUNTIME_KINDS,
  SCENARIO_CLASSES,
  VERDICTS,
  appendAttempt,
  assertNoRelabel,
  assertQualityUnchanged,
  canonicalJson,
  cellKey,
  createAttemptLedger,
  createFingerprintRegistry,
  createQualificationMatrix,
  createSeedCommitment,
  deepFreeze,
  deriveHeldOutSeed,
  deriveRunId,
  evaluateAccessibilitySample,
  evaluatePerformanceSample,
  evaluateResourceStability,
  freezeProfileAssignment,
  normalizeOwnerEvidence,
  parityPairId,
  reconcileNativeDuration,
  registerCapture,
  validateAttemptIdentity,
  verifyLedgerContinuity,
  verifySeedReveal,
  ACCESSIBILITY_REQUIRED_CHECKS,
  REQUIRED_PERFORMANCE_METRICS,
} from '../lib/goldCorridorAcceptanceContracts.mjs';

import {
  AGGREGATE_SCHEMA,
  evaluateHumanVerdicts,
  publishAggregateReceipt,
  validateAggregate,
  verifyAggregateReceipt,
} from '../lib/goldCorridorAcceptanceAggregate.mjs';

import {
  ACTOR_FORBIDDEN_SURFACES,
  CHECKPOINT_SETS,
  assertInformationFlow,
  assertJudgeDidNotMutate,
  classifyActorAction,
  createActorCapability,
  createCheckpointRecord,
  createJudgeCapability,
  createObserverCapability,
  validateCheckpointSequence,
} from '../lib/goldCorridorAcceptanceSession.mjs';

export const PHASE1_SCHEMA = 'pq025.phase1.v1';
export const RUN_SCHEMA = 'pq025.run.v1';
export const ATTEMPT_SCHEMA = 'pq025.attempt.v1';
export const PHASE1_LAUNCHES_GAME = false;
export const PHASE1_REGISTRY_ENABLED = false;

export {
  AGGREGATE_SCHEMA,
  ATTEMPT_IDENTITY_KEYS,
  ACCESSIBILITY_REQUIRED_CHECKS,
  CHECKPOINT_SETS,
  FAILURE_CLASSES,
  LEDGER_SCHEMA,
  PROFILE_CLASSES,
  REQUIRED_PERFORMANCE_METRICS,
  VERDICTS,
  assertJudgeDidNotMutate,
  createActorCapability,
  createCheckpointRecord,
  createJudgeCapability,
  createObserverCapability,
  ACTOR_FORBIDDEN_SURFACES,
};

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const CADENCE_KEYS = Object.freeze(['measuredFps', 'measuredP95Ms', 'measuredFrameMs', 'inferredFromMeasurement']);
const FORBIDDEN_RUN_KEYS = new Set(['heldOutSalt', ...CADENCE_KEYS]);

export const RUN_SCHEMA_DOCUMENT = Object.freeze({
  id: RUN_SCHEMA,
  required: Object.freeze([
    'schema', 'candidateCommit', 'harnessHash', 'dependencyReceiptHashes', 'seedCommitment',
    'profileAssignment', 'sourceFingerprint', 'hardwareFingerprint', 'executionFingerprint',
    'matrix', 'derivationPlan', 'revealed',
  ]),
  profileClasses: PROFILE_CLASSES,
  forbids: Object.freeze([...FORBIDDEN_RUN_KEYS]),
});

export const ATTEMPT_SCHEMA_DOCUMENT = Object.freeze({
  id: ATTEMPT_SCHEMA,
  identityKeys: ATTEMPT_IDENTITY_KEYS,
  verdicts: VERDICTS,
});

export const AGGREGATE_SCHEMA_DOCUMENT = Object.freeze({
  id: AGGREGATE_SCHEMA,
  rule: 'one failed, unknown, or missing required cell fails qualification; averages diagnose only; unknown is never a pass',
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertDependencyHashes(hashes) {
  if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)) {
    throw new Error('run-bad-dependency-receipt-hashes');
  }
  for (const [name, hash] of Object.entries(hashes)) {
    if (!HEX64.test(String(hash))) throw new Error(`run-bad-dependency-receipt-hash:${name}`);
  }
}

function findForbiddenKeys(value, banned, seen = new Set(), found = []) {
  if (value === null || typeof value !== 'object') return found;
  if (seen.has(value)) return found;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) findForbiddenKeys(entry, banned, seen, found);
    return found;
  }
  for (const key of Object.keys(value)) {
    if (banned.has(key) && value[key] !== undefined) found.push(key);
    findForbiddenKeys(value[key], banned, seen, found);
  }
  return found;
}

function assertCellVocabulary(cell) {
  if (!CAREERS.includes(cell.career)) throw new Error('run-bad-career');
  if (!HORIZONS_MIN.includes(cell.horizonMin)) throw new Error('run-bad-horizon');
  if (!SCENARIO_CLASSES.includes(cell.scenarioClass)) throw new Error('run-bad-scenario');
  if (!RUNTIME_KINDS.includes(cell.runtimeKind)) throw new Error('run-bad-runtime');
  if (!PROFILE_CLASSES.includes(cell.profileClass)) throw new Error('run-bad-profile-class');
  if (cell.seedInputs !== undefined) throw new Error('run-seeds-are-derived-not-supplied');
  if (cell.derivationCellIndex !== undefined
    && (!Number.isInteger(cell.derivationCellIndex) || cell.derivationCellIndex < 0)) {
    throw new Error('run-bad-derivation-cell-index');
  }
}

/**
 * Freeze target, floor, or diagnostic before any run. Measured FPS / frame time is refused so the
 * class cannot be inferred from the sample it will later be judged against.
 */
export function assignProfileClass(input = {}) {
  for (const key of CADENCE_KEYS) {
    if (input[key] !== undefined) throw new Error('profile-class-must-not-be-chosen-from-measured-cadence');
  }
  if (typeof input.profileClass === 'function') {
    throw new Error('profile-class-must-not-be-chosen-from-measured-cadence');
  }
  return freezeProfileAssignment({
    profileClass: input.profileClass,
    hardwareProfileId: input.hardwareProfileId,
    executionProfileId: input.executionProfileId,
    frozenAtIso: input.frozenAtIso,
  });
}

export function validateRunRecord(run = {}) {
  const errors = [];
  if (run.schema !== RUN_SCHEMA) errors.push('bad-run-schema');
  for (const key of findForbiddenKeys(run, FORBIDDEN_RUN_KEYS)) errors.push(`forbidden:${key}`);
  if (run.candidateCommit !== undefined && !HEX40.test(String(run.candidateCommit))) errors.push('bad-candidate-commit');
  if (run.harnessHash !== undefined && !HEX64.test(String(run.harnessHash))) errors.push('bad-harness-hash');
  if (!run.seedCommitment || run.seedCommitment.schema !== COMMITMENT_VERSION) errors.push('bad-seed-commitment');
  if (!nonEmptyString(run.sourceFingerprint)) errors.push('missing-source-fingerprint');
  if (!nonEmptyString(run.hardwareFingerprint)) errors.push('missing-hardware-fingerprint');
  if (!nonEmptyString(run.executionFingerprint)) errors.push('missing-execution-fingerprint');
  const profile = run.profileAssignment;
  if (!profile || !PROFILE_CLASSES.includes(profile.profileClass)) errors.push('bad-profile-assignment');
  else if (!nonEmptyString(profile.frozenAtIso)) errors.push('profile-not-frozen-before-run');
  if (!Array.isArray(run.derivationPlan)) errors.push('missing-derivation-plan');
  if (run.revealed === true) {
    if (!Array.isArray(run.cellPlan) || run.cellPlan.length !== run.derivationPlan.length) {
      errors.push('revealed-run-missing-cell-plan');
    }
  } else if (run.cellPlan !== null) errors.push('unrevealed-run-must-not-carry-seeds');
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/**
 * Commit a qualification run. The salt is hashed into seedCommitment and then dropped: it is not a
 * field on the sealed record.
 */
export function commitQualificationRun(input = {}) {
  if (!nonEmptyString(input.frozenAtIso)) throw new Error('profile-assignment-must-be-frozen-before-run');
  if (!HEX40.test(String(input.candidateCommit))) throw new Error('run-bad-candidate-commit');
  if (!HEX64.test(String(input.harnessHash))) throw new Error('run-bad-harness-hash');
  if (!nonEmptyString(input.sourceFingerprint)) throw new Error('run-missing-source-fingerprint');
  if (!Array.isArray(input.cells) || input.cells.length === 0) throw new Error('run-requires-cells');
  assertDependencyHashes(input.dependencyReceiptHashes);
  for (const cell of input.cells) assertCellVocabulary(cell);

  const profileAssignment = assignProfileClass({
    profileClass: input.profileClass,
    hardwareProfileId: input.hardwareProfileId,
    executionProfileId: input.executionProfileId,
    frozenAtIso: input.frozenAtIso,
    measuredFps: input.measuredFps,
    measuredP95Ms: input.measuredP95Ms,
    measuredFrameMs: input.measuredFrameMs,
    inferredFromMeasurement: input.inferredFromMeasurement,
  });
  const seedCommitment = createSeedCommitment({
    heldOutSalt: input.heldOutSalt,
    nonce: input.nonce,
    declaredAtIso: input.frozenAtIso,
  });
  const matrix = createQualificationMatrix({
    cells: input.cells,
    frozenAtIso: input.frozenAtIso,
    rubricHash: input.rubricHash || null,
    criticalQuestionIds: input.criticalQuestionIds || [],
  });
  const derivationPlan = input.cells.map((cell, index) => Object.freeze({
    cellIndex: index,
    derivationCellIndex: cell.derivationCellIndex ?? index,
    career: matrix.cells[index].career,
    horizonMin: matrix.cells[index].horizonMin,
    scenarioClass: matrix.cells[index].scenarioClass,
    runtimeKind: matrix.cells[index].runtimeKind,
    profileClass: matrix.cells[index].profileClass,
    cellKey: matrix.cells[index].cellKey,
    required: matrix.cells[index].required,
  }));
  const run = deepFreeze({
    schema: RUN_SCHEMA,
    candidateCommit: String(input.candidateCommit),
    harnessHash: String(input.harnessHash),
    dependencyReceiptHashes: { ...input.dependencyReceiptHashes },
    seedCommitment,
    profileAssignment,
    sourceFingerprint: input.sourceFingerprint,
    hardwareFingerprint: profileAssignment.hardwareProfileId,
    executionFingerprint: profileAssignment.executionProfileId,
    matrix,
    derivationPlan,
    revealed: false,
    cellPlan: null,
    acceptanceEligible: profileAssignment.acceptanceEligible === true,
  });
  const check = validateRunRecord(run);
  if (!check.ok) throw new Error(`run-record-invalid:${check.errors.join(',')}`);
  return run;
}

/** Verify the reveal against the commitment, then derive every cell seed. Runtime is not an input. */
export function revealQualificationRun(run, reveal = {}) {
  if (!run || run.schema !== RUN_SCHEMA) return { ok: false, reason: 'bad-run-schema', run: run || null };
  const check = verifySeedReveal(run.seedCommitment, reveal);
  if (!check.ok) return { ok: false, reason: check.reason, run };
  const cellPlan = run.derivationPlan.map((cell) => {
    const seedInputs = {
      heldOutSalt: reveal.heldOutSalt,
      candidateCommit: run.candidateCommit,
      career: cell.career,
      horizonMin: cell.horizonMin,
      scenarioClass: cell.scenarioClass,
      cellIndex: cell.derivationCellIndex,
    };
    const derived = deriveHeldOutSeed(seedInputs);
    return Object.freeze({
      ...cell,
      seed: derived.seed,
      seedDerivationVersion: derived.seedDerivationVersion,
      seedDigest: derived.digest,
      parityPairId: parityPairId(seedInputs),
    });
  });
  const revealed = deepFreeze({ ...run, revealed: true, cellPlan });
  const valid = validateRunRecord(revealed);
  if (!valid.ok) return { ok: false, reason: `revealed-run-invalid:${valid.errors.join(',')}`, run };
  return { ok: true, reason: null, run: revealed };
}

export function verifyCommitReveal(commitment, reveal) {
  return verifySeedReveal(commitment, reveal);
}

/** Runtime, profile, capture, and cadence keys are forbidden derivation inputs and throw. */
export function deriveRuntimeIndependentSeed(input = {}) {
  return deriveHeldOutSeed(input);
}

export function auditRevealedSeeds(run, reveal) {
  const check = verifySeedReveal(run?.seedCommitment, reveal);
  if (!check.ok) return check;
  if (!Array.isArray(run.cellPlan)) return { ok: false, reason: 'run-not-revealed' };
  for (const cell of run.cellPlan) {
    const seedInputs = {
      heldOutSalt: reveal.heldOutSalt,
      candidateCommit: run.candidateCommit,
      career: cell.career,
      horizonMin: cell.horizonMin,
      scenarioClass: cell.scenarioClass,
      cellIndex: cell.derivationCellIndex,
    };
    const derived = deriveHeldOutSeed(seedInputs);
    if (derived.seed !== cell.seed) return { ok: false, reason: 'seed-does-not-match-commitment' };
    if (parityPairId(seedInputs) !== cell.parityPairId) return { ok: false, reason: 'parity-id-does-not-match-commitment' };
  }
  return { ok: true, reason: null };
}

export function judgeParitySeeds({ left, right } = {}) {
  for (const side of [left, right]) {
    if (!side?.seedInputs) continue;
    for (const key of ['runtimeKind', 'runtime', 'measuredFps', 'profileClass']) {
      if (Object.prototype.hasOwnProperty.call(side.seedInputs, key)) {
        return { ok: false, reason: `runtime-included-in-seed-derivation:${key}` };
      }
    }
  }
  if (left?.seed === undefined || right?.seed === undefined || left.seed !== right.seed) {
    return { ok: false, reason: 'parity-seeds-differ' };
  }
  if (left.parityPairId !== right.parityPairId) return { ok: false, reason: 'parity-pair-id-differs' };
  return { ok: true, reason: null };
}

export function openAttemptLedger() {
  return createAttemptLedger();
}

function assertNotRelabeled(cell, observed) {
  if (observed.scenarioClass !== undefined && observed.scenarioClass !== cell.scenarioClass) {
    throw new Error('scenario-relabeled-after-observation');
  }
  if (observed.profileClass !== undefined && observed.profileClass !== cell.profileClass) {
    throw new Error('profile-relabeled-after-observation');
  }
  if (observed.career !== undefined && observed.career !== cell.career) {
    throw new Error('career-relabeled-after-observation');
  }
  if (observed.horizonMin !== undefined && observed.horizonMin !== cell.horizonMin) {
    throw new Error('horizon-relabeled-after-observation');
  }
  if (observed.runtimeKind !== undefined && observed.runtimeKind !== cell.runtimeKind) {
    throw new Error('runtime-relabeled-after-observation');
  }
}

/** Append one attempt. Ordinal and scenario come from the ledger and the revealed cell, not the caller. */
export function appendRunAttempt(ledger, {
  run, cellIndex, captureId, verdict, failureClass = null, evidencePaths = [],
  scenarioClass, profileClass, career, horizonMin, runtimeKind,
} = {}) {
  if (!run || run.schema !== RUN_SCHEMA || run.revealed !== true || !Array.isArray(run.cellPlan)) {
    throw new Error('attempt-requires-revealed-run');
  }
  const cell = run.cellPlan[cellIndex];
  if (!cell) throw new Error('attempt-cell-not-in-run');
  assertNotRelabeled(cell, { scenarioClass, profileClass, career, horizonMin, runtimeKind });
  if (!nonEmptyString(captureId)) throw new Error('attempt-missing-capture');
  const attemptOrdinal = ledger.entries.length + 1;
  const identity = {
    candidateCommit: run.candidateCommit,
    dependencyReceiptHashes: run.dependencyReceiptHashes,
    harnessHash: run.harnessHash,
    runId: 'pending',
    career: cell.career,
    horizonMin: cell.horizonMin,
    scenarioClass: cell.scenarioClass,
    runtimeKind: cell.runtimeKind,
    seed: cell.seed,
    seedDerivationVersion: cell.seedDerivationVersion,
    parityPairId: cell.parityPairId,
    profileClass: cell.profileClass,
    hardwareProfileId: run.profileAssignment.hardwareProfileId,
    executionProfileId: run.profileAssignment.executionProfileId,
    captureId,
    attemptOrdinal,
  };
  identity.runId = deriveRunId(identity);
  return appendAttempt(ledger, { identity, verdict, failureClass, evidencePaths });
}

export function attemptRecordFromEntry(entry) {
  return deepFreeze({
    schema: ATTEMPT_SCHEMA,
    identity: entry.identity,
    verdict: entry.verdict,
    failureClass: entry.failureClass,
    evidencePaths: entry.evidencePaths,
  });
}

export function validateAttemptRecord(record = {}) {
  const errors = [];
  if (record.schema !== ATTEMPT_SCHEMA) errors.push('bad-attempt-schema');
  const identity = validateAttemptIdentity(record.identity || {});
  if (!identity.ok) errors.push(...identity.errors);
  if (!VERDICTS.includes(record.verdict)) errors.push('bad-verdict');
  if (record.verdict !== 'pass' && (record.failureClass === null || record.failureClass === undefined)) {
    errors.push('non-pass-requires-failure-class');
  }
  if (record.failureClass != null && !FAILURE_CLASSES.includes(record.failureClass)) errors.push('bad-failure-class');
  if (!Array.isArray(record.evidencePaths)) errors.push('bad-evidence-paths');
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/**
 * Append-only proof. A shorter ledger deleted an attempt; a rewritten prefix replaced one.
 * Neither is a legal successor.
 */
export function judgeAttemptRetention(previous, proposed) {
  const result = verifyLedgerContinuity(previous, proposed);
  if (result.ok) return { ok: true, reason: null };
  if (result.reason === 'attempt-deleted') {
    return { ok: false, reason: 'deleting-an-inconvenient-attempt-is-rejected' };
  }
  if (typeof result.reason === 'string' && result.reason.startsWith('attempt-replaced')) {
    return { ok: false, reason: 'replacing-a-retained-attempt-is-rejected' };
  }
  return { ok: false, reason: result.reason };
}

export function judgeScenarioRelabel(frozenCell, observedIdentity) {
  const result = assertNoRelabel(frozenCell, observedIdentity);
  if (result.ok) return { ok: true, reason: null, errors: result.errors };
  return { ok: false, reason: result.errors[0], errors: result.errors };
}

/**
 * The actor never receives observer channel values. This does not invoke the observer read.
 */
export function actorReadObserverState(actor, observer, channel = 'ownerEvents') {
  const flow = assertInformationFlow({ actor, observer });
  return {
    ok: false,
    reason: 'actor-may-not-read-observer-hidden-state',
    channel,
    value: undefined,
    flowOk: flow.ok,
  };
}

export function rejectInjectedAction(action) {
  return classifyActorAction(action);
}

export function reconcileMonotonicDuration(sample) {
  return reconcileNativeDuration(sample);
}

/**
 * Normalize one owner observation. Output confidence is only `verified` or `unknown`.
 * A coerce / warning flag cannot promote unknown to a pass.
 */
export function judgeOwnerEvidence(input = {}) {
  const normalized = normalizeOwnerEvidence(input);
  const coerce = input.coerceUnknownToPass === true
    || input.treatUnknownAsPass === true
    || input.treatUnknownAsWarning === true;
  if ((coerce && normalized.confidence !== 'verified') || (normalized.satisfied === true && normalized.confidence !== 'verified')) {
    return deepFreeze({
      outcome: normalized.outcome ?? input.outcome ?? null,
      satisfied: false,
      confidence: 'unknown',
      reason: 'unknown-cannot-be-converted-to-pass',
      rawRef: normalized.rawRef ?? input.rawRef ?? null,
      ownerRef: normalized.ownerRef ?? null,
      warning: false,
    });
  }
  return normalized;
}

export function evaluateCheckpointContract(horizonMin, records = []) {
  return validateCheckpointSequence(horizonMin, records);
}

export function evaluateSaveContract({
  horizonMin,
  wroteSave = false,
  coldContinue = false,
  hotReload = false,
  preSaveDigest = null,
  postContinueDigest = null,
  meaningfulActionAfterContinue = false,
  purchasePersisted = null,
  contentHash = null,
  priorContentHashes = [],
  parity = false,
  isolatedCopy = null,
} = {}) {
  const errors = [];
  if (!HORIZONS_MIN.includes(horizonMin)) errors.push('bad-horizon');
  if (wroteSave !== true) errors.push('save-not-written');
  if (coldContinue !== true || hotReload === true) errors.push('continue-was-not-cold');
  if (!nonEmptyString(preSaveDigest) || !nonEmptyString(postContinueDigest)) errors.push('save-digest-missing');
  else if (preSaveDigest !== postContinueDigest) errors.push('continue-digest-mismatch');
  if (meaningfulActionAfterContinue !== true) errors.push('no-meaningful-action-after-continue');
  if (!nonEmptyString(contentHash)) errors.push('save-content-hash-missing');
  if (Array.isArray(priorContentHashes) && priorContentHashes.includes(contentHash)) errors.push('stale-save-reused');
  if (horizonMin === 90 && purchasePersisted !== true) errors.push('purchase-did-not-persist-through-continue');
  if (parity === true && isolatedCopy !== true) errors.push('parity-save-was-not-an-isolated-copy');
  return { ok: errors.length === 0, schema: 'pq025.save-contract.v1', errors: Object.freeze(errors) };
}

export function evaluateParityContract({ left, right } = {}) {
  const errors = [];
  if (!left || !right) return { ok: false, schema: 'pq025.parity-contract.v1', errors: Object.freeze(['parity-pair-incomplete']) };
  if (left.runtimeKind === right.runtimeKind) errors.push('parity-runtimes-not-distinct');
  if (!RUNTIME_KINDS.includes(left.runtimeKind) || !RUNTIME_KINDS.includes(right.runtimeKind)) errors.push('parity-bad-runtime');
  const seeds = judgeParitySeeds({ left, right });
  if (!seeds.ok) errors.push(seeds.reason);
  if (left.scenarioClass !== right.scenarioClass) errors.push('parity-scenario-mismatch');
  if (left.career !== right.career || left.horizonMin !== right.horizonMin) errors.push('parity-cell-mismatch');
  if (canonicalJson(left.checkpointDigests ?? null) !== canonicalJson(right.checkpointDigests ?? null)) {
    errors.push('parity-checkpoint-digests-diverge');
  }
  if (!nonEmptyString(left.saveContentHash) || left.saveContentHash !== right.saveContentHash) {
    errors.push('parity-save-not-equivalent');
  }
  return { ok: errors.length === 0, schema: 'pq025.parity-contract.v1', errors: Object.freeze(errors) };
}

export function evaluatePerformanceContract(assignment, sample = {}) {
  if (sample.profileClass !== undefined && assignment && sample.profileClass !== assignment.profileClass) {
    return { ok: false, acceptanceEligible: false, reason: 'profile-class-chosen-from-measured-cadence' };
  }
  const performance = evaluatePerformanceSample(assignment, sample);
  if (sample.series || sample.declaredHighWater) {
    const stability = evaluateResourceStability({
      series: sample.series || {},
      declaredHighWater: sample.declaredHighWater || {},
    });
    if (!stability.ok) {
      return { ok: false, acceptanceEligible: performance.acceptanceEligible === true, reason: stability.violations[0], violations: stability.violations };
    }
  }
  return performance;
}

export function evaluateLongSessionResources(args) {
  return evaluateResourceStability(args);
}

export function evaluateAccessibilityContract(accessibilityProfile, sample = {}) {
  return evaluateAccessibilitySample(accessibilityProfile, sample);
}

export function evaluateQualityLock(frozenQuality, observedQuality) {
  return assertQualityUnchanged(frozenQuality, observedQuality);
}

export function createPhase1FingerprintRegistry() {
  const registry = createFingerprintRegistry();
  registry.sourcesByCandidate = new Map();
  return registry;
}

/**
 * Capture id is unique per attempt. Source, hardware, and execution fingerprints are the other
 * three identities: each must be present, distinct from the capture id and from each other, and
 * stable against the frozen run. A second source fingerprint for the same candidate is a mid-run
 * source change, not a new qualification.
 */
export function registerAttemptFingerprints(registry, spec = {}) {
  if (!registry) return { ok: false, reason: 'fingerprint-registry-required' };
  const captureId = spec.captureId;
  const sourceFingerprint = spec.sourceFingerprint;
  const hardwareProfileId = spec.hardwareProfileId;
  const executionProfileId = spec.executionProfileId;
  const distinct = new Set([captureId, sourceFingerprint, hardwareProfileId, executionProfileId]);
  if ([captureId, sourceFingerprint, hardwareProfileId, executionProfileId].some((value) => !nonEmptyString(value))
    || distinct.size !== 4) {
    return { ok: false, reason: 'fingerprints-are-not-unique' };
  }
  if (!nonEmptyString(spec.candidateCommit)) return { ok: false, reason: 'missing-candidate-commit' };
  if (spec.frozenSourceFingerprint !== sourceFingerprint) {
    return { ok: false, reason: 'source-fingerprint-does-not-match-frozen-run' };
  }
  if (spec.frozenHardwareProfileId !== hardwareProfileId) {
    return { ok: false, reason: 'hardware-fingerprint-does-not-match-frozen-profile' };
  }
  if (spec.frozenExecutionProfileId !== executionProfileId) {
    return { ok: false, reason: 'execution-fingerprint-does-not-match-frozen-profile' };
  }
  if (!registry.sourcesByCandidate) registry.sourcesByCandidate = new Map();
  const seenSource = registry.sourcesByCandidate.get(spec.candidateCommit);
  if (seenSource && seenSource !== sourceFingerprint) {
    return { ok: false, reason: 'source-fingerprint-changed-during-qualification' };
  }
  const registered = registerCapture(registry, {
    captureId,
    cellKey: spec.cellKey,
    attemptOrdinal: spec.attemptOrdinal,
    contentHash: spec.contentHash,
    sourceFingerprint,
    hardwareProfileId,
    executionProfileId,
  });
  if (!registered.ok) return registered;
  registry.sourcesByCandidate.set(spec.candidateCommit, sourceFingerprint);
  return registered;
}

export function evaluateMediaContract(media = {}, registry = null) {
  const errors = [];
  if (media.registrationReceiptRetained !== true) errors.push('media-registration-receipt-missing');
  if (media.mediaDeleted !== true || media.mediaBytesRetained === true) errors.push('media-must-be-ephemeral');
  if (nonEmptyString(media.mediaPath)) errors.push('media-must-not-be-stored');
  if (!nonEmptyString(media.captureId)) errors.push('media-capture-id-missing');
  if (!nonEmptyString(media.contentHash)) errors.push('media-content-hash-missing');
  if (Array.isArray(media.alsoSatisfies) && media.alsoSatisfies.length > 0) {
    errors.push('one-capture-cannot-satisfy-multiple-attempts');
  }
  if (errors.length > 0) return { ok: false, schema: 'pq025.media-contract.v1', errors: Object.freeze(errors) };
  if (registry) {
    const registered = registerAttemptFingerprints(registry, media);
    if (!registered.ok) return { ok: false, schema: 'pq025.media-contract.v1', errors: Object.freeze([registered.reason]) };
  }
  return { ok: true, schema: 'pq025.media-contract.v1', errors: Object.freeze([]) };
}

export function judgeHumanVerdicts({ rubricHash, verdicts = [], criticalQuestionIds = [] } = {}) {
  const unknownErrors = [];
  const normalized = verdicts.map((verdict) => {
    if (!verdict) return verdict;
    if (verdict.confidence === 'unknown' || verdict.pass === 'unknown') {
      unknownErrors.push(`unknown-human-verdict-cannot-pass:${verdict.questionId || 'unnamed'}`);
      return { ...verdict, pass: false };
    }
    return verdict;
  });
  const result = evaluateHumanVerdicts({ rubricHash, verdicts: normalized, criticalQuestionIds });
  return {
    ok: result.ok && unknownErrors.length === 0,
    errors: Object.freeze([...unknownErrors, ...result.errors]),
    criticalFailureCount: result.criticalFailureCount,
  };
}

function unknownEvidencePresent(evidence) {
  return (evidence || []).some((row) => !row || row.satisfied !== true || row.confidence !== 'verified');
}

/**
 * One hard cell fails the qualification. Diagnostic averages are copied through and never change
 * the verdict. `unknownAsPass` / `averageFailedCellsAway` are attack flags and cannot flip FAIL.
 */
export function aggregateHardCells(args = {}) {
  const rawVerdicts = args.humanVerdicts || [];
  const unknownHuman = rawVerdicts.some((verdict) => verdict && (verdict.confidence === 'unknown' || verdict.pass === 'unknown'));
  const humanVerdicts = rawVerdicts.map((verdict) => {
    if (verdict && (verdict.confidence === 'unknown' || verdict.pass === 'unknown')) return { ...verdict, pass: false };
    return verdict;
  });
  const validation = validateAggregate({ ...args, humanVerdicts });
  const blockers = [...(validation.blockers || [])];
  const cells = validation.cells || [];
  const hard = cells.filter((cell) => cell.state !== 'pass');
  if (args.averageFailedCellsAway === true && hard.length > 0) {
    blockers.unshift('averaging-away-a-failed-hard-cell-is-rejected');
  }
  if (args.unknownAsPass === true && (hard.some((cell) => cell.state === 'unknown') || unknownEvidencePresent(args.ownerEvidence) || unknownHuman)) {
    blockers.unshift('unknown-cannot-be-converted-to-pass');
  }
  if (unknownHuman && !blockers.some((blocker) => blocker.startsWith('unknown-human-verdict-cannot-pass'))) {
    blockers.push('unknown-human-verdict-cannot-pass');
  }
  const human = judgeHumanVerdicts({
    rubricHash: args.humanRubricHash,
    verdicts: rawVerdicts,
    criticalQuestionIds: args.matrix?.criticalQuestionIds || [],
  });
  const ok = blockers.length === 0;
  return deepFreeze({
    schema: AGGREGATE_SCHEMA,
    ok,
    verdict: ok ? 'PASS' : 'FAIL',
    blockers,
    cells,
    counts: validation.counts || null,
    diagnostics: validation.diagnostics || null,
    retainedAttemptCount: validation.retainedAttemptCount ?? null,
    human,
  });
}

export function publishQualificationReceipt({ validation, candidateCommit, harnessHash, matrix, ledger, artifacts, publishedAtIso } = {}) {
  const frozen = validation && Object.isFrozen(validation) ? validation : deepFreeze(validation);
  return publishAggregateReceipt({
    validation: frozen, candidateCommit, harnessHash, matrix, ledger, artifacts, publishedAtIso,
  });
}

export function verifyQualificationReceipt(receipt) {
  return verifyAggregateReceipt(receipt);
}

export function phase1CellKey(identity) {
  return cellKey(identity);
}

export default Object.freeze({
  schema: PHASE1_SCHEMA,
  launchesGame: PHASE1_LAUNCHES_GAME,
  registryEnabled: PHASE1_REGISTRY_ENABLED,
  commitQualificationRun,
  revealQualificationRun,
  aggregateHardCells,
});
