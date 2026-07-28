// PQ-025 Phase-1 session contract tests: actor/observer/judge capability separation, checkpoint
// schemas, and the streaming-evidence buffer.
//
// Adversarial ids covered here (see test/pq025-acceptance-contracts.test.mjs for the full
// enumeration): ADV-05a, ADV-05b, ADV-06a, ADV-06b, ADV-06c, ADV-15.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTOR_PUBLIC_VERBS, ACTOR_FORBIDDEN_SURFACES,
  createActorCapability, isActor,
  createObserverCapability, isObserver, assertObserverPurity,
  createJudgeCapability, isJudge, assertJudgeDidNotMutate,
  assertInformationFlow,
  CHECKPOINT_SETS, CHECKPOINT_MEANING, createCheckpointRecord, validateCheckpointSequence, checkpointSetFor,
  createEvidenceBuffer, appendEvidence, assertEvidenceIntegrity,
  classifyActorAction, validateActionTape,
} from '../scripts/lib/goldCorridorAcceptanceSession.mjs';

import {
  createAttemptLedger, appendAttempt, SEED_DERIVATION_VERSION, deriveHeldOutSeed, parityPairId,
} from '../scripts/lib/goldCorridorAcceptanceContracts.mjs';

const CANDIDATE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4';
const HARNESS = 'b'.repeat(64);
const SEED_INPUT = Object.freeze({
  heldOutSalt: 'salt', candidateCommit: CANDIDATE, career: 'hauler', horizonMin: 30,
  scenarioClass: 'success', cellIndex: 0,
});

function identity() {
  return {
    candidateCommit: CANDIDATE,
    dependencyReceiptHashes: {},
    harnessHash: HARNESS,
    runId: 'run-1',
    career: 'hauler',
    horizonMin: 30,
    scenarioClass: 'success',
    runtimeKind: 'browser',
    seed: deriveHeldOutSeed(SEED_INPUT).seed,
    seedDerivationVersion: SEED_DERIVATION_VERSION,
    parityPairId: parityPairId(SEED_INPUT),
    profileClass: 'target',
    hardwareProfileId: 'hw-1',
    executionProfileId: 'ex-1',
    captureId: 'cap-1',
    attemptOrdinal: 1,
  };
}

const publicSurface = () => ({
  click: () => {}, press: () => {}, type: () => {},
  readVisibleText: () => 'Undock', readAccessibleName: () => 'Undock button',
  enterSeed: () => {},
});

const observerCapability = () => createObserverCapability({
  observerId: 'obs-1',
  read: {
    ownerEvents: () => [],
    projections: () => ({}),
    timeScale: () => 1,
    performance: () => ({}),
  },
});

// =============================================================================================
// Actor
// =============================================================================================

test('actor: a public-surface-only actor constructs and exposes only public verbs', () => {
  const actor = createActorCapability({ policyId: 'hauler-public-v1', publicSurface: publicSurface() });
  assert.equal(isActor(actor), true);
  for (const verb of actor.verbs) assert.ok(ACTOR_PUBLIC_VERBS.includes(verb));
  assert.equal(typeof actor.surface.click, 'function');
  assert.equal(actor.surface.state, undefined);
  assert.throws(() => createActorCapability({ publicSurface: publicSurface() }), /actor-requires-policy-id/);
});

test('ADV-05a: an actor that references the observer is rejected at construction', () => {
  const observer = observerCapability();
  // Direct: handed the observer under its own name.
  assert.throws(
    () => createActorCapability({ policyId: 'p', publicSurface: { ...publicSurface(), observer } }),
    /actor-may-not-hold-hidden-state:observer/,
  );
  // Indirect: the observer smuggled inside an otherwise-legal public verb slot.
  assert.throws(
    () => createActorCapability({ policyId: 'p', publicSurface: { readPixels: { peek: { deep: observer } } } }),
    /actor-may-not-reference-observer/,
  );
});

test('ADV-05b: an actor holding hidden state is rejected', () => {
  for (const forbidden of ACTOR_FORBIDDEN_SURFACES) {
    if (forbidden === 'observer') continue; // covered by ADV-05a
    assert.throws(
      () => createActorCapability({ policyId: 'p', publicSurface: { ...publicSurface(), [forbidden]: {} } }),
      new RegExp(`actor-may-not-hold-hidden-state:${forbidden}`),
      `holding ${forbidden} must be rejected`,
    );
  }
  // Anything that is not a declared public verb is refused even if it is not on the hidden list.
  assert.throws(
    () => createActorCapability({ policyId: 'p', publicSurface: { peekFutureOutcome: () => {} } }),
    /actor-surface-not-a-public-verb:peekFutureOutcome/,
  );
});

test('information flow: a legal actor/observer pair passes the audit', () => {
  const actor = createActorCapability({ policyId: 'p', publicSurface: publicSurface() });
  const observer = observerCapability();
  const result = assertInformationFlow({ actor, observer });
  assert.equal(result.ok, true, result.violations.join(','));
});

// =============================================================================================
// Observer
// =============================================================================================

test('observer: read channels only, and mutating surfaces are rejected', () => {
  const observer = observerCapability();
  assert.equal(isObserver(observer), true);
  assert.equal(observer.readOnly, true);
  assert.equal(assertObserverPurity(observer).ok, true);

  assert.throws(() => createObserverCapability({ observerId: 'o', read: { emit: () => {} } }), /observer-must-be-read-only:emit/);
  assert.throws(() => createObserverCapability({ observerId: 'o', read: { setTimeScale: () => {} } }), /observer-must-be-read-only:setTimeScale/);
  assert.throws(() => createObserverCapability({ observerId: 'o', read: { actor: {} } }), /observer-must-be-read-only:actor/);
  assert.throws(() => createObserverCapability({ observerId: 'o', read: { somethingNew: () => {} } }), /observer-unknown-read-channel/);
  assert.throws(() => createObserverCapability({ read: {} }), /observer-requires-id/);
});

test('observer purity audit rejects a non-observer and a forged read-only flag', () => {
  assert.equal(assertObserverPurity({}).ok, false);
  assert.equal(assertObserverPurity(null).violations.includes('not-an-observer'), true);
});

// =============================================================================================
// Judge
// =============================================================================================

test('judge: receives a frozen ledger snapshot and has no append path', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: identity(), verdict: 'fail', failureClass: 'PRODUCT_NAV' });
  const judge = createJudgeCapability({ judgeId: 'judge-1', ledger });
  assert.equal(isJudge(judge), true);
  assert.equal(judge.append, undefined);
  assert.equal(judge.appendAttempt, undefined);
  const snapshot = judge.readLedger();
  assert.equal(snapshot.entries.length, 1);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => { 'use strict'; snapshot.entries.push({}); }, TypeError);
});

test('judge: a mutating validator is rejected at construction', () => {
  const ledger = createAttemptLedger();
  for (const surface of ['append', 'appendAttempt', 'delete', 'relabel', 'setVerdict']) {
    assert.throws(
      () => createJudgeCapability({ judgeId: 'j', ledger, validators: { [surface]: () => {} } }),
      new RegExp(`judge-may-not-mutate-the-ledger:${surface}`),
    );
  }
  assert.throws(() => createJudgeCapability({ judgeId: 'j' }), /judge-requires-ledger-snapshot/);
});

test('judge: legitimate ledger growth is allowed, but a rewritten prefix is caught', () => {
  let ledger = createAttemptLedger();
  ledger = appendAttempt(ledger, { identity: identity(), verdict: 'fail', failureClass: 'PRODUCT_SAVE' });
  const judge = createJudgeCapability({ judgeId: 'j', ledger });

  const grown = appendAttempt(ledger, { identity: identity(), verdict: 'pass' });
  assert.equal(assertJudgeDidNotMutate(judge, grown).ok, true);

  // The judge's inconvenient red attempt is quietly turned green underneath it.
  const forgedEntries = grown.entries.map((entry) => ({ ...entry }));
  forgedEntries[0] = { ...forgedEntries[0], verdict: 'pass', failureClass: null };
  const forged = { schema: grown.schema, entries: forgedEntries, headHash: grown.headHash };
  const result = assertJudgeDidNotMutate(judge, forged);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'ledger-mutated-under-judge');
});

// =============================================================================================
// Checkpoints
// =============================================================================================

test('checkpoints: the 30-minute and 90-minute sets match the packet exactly', () => {
  assert.deepEqual([...CHECKPOINT_SETS[30]], ['C0', 'C1', 'coldReloadContinue', 'C2']);
  assert.deepEqual([...CHECKPOINT_SETS[90]], ['C0', 'C1', 'C2a', 'C2b', 'C3', 'C4', 'finalColdReloadContinue']);
  assert.equal(checkpointSetFor(45), null);
  for (const id of CHECKPOINT_SETS[90]) assert.ok(CHECKPOINT_MEANING[id], `${id} needs a declared meaning`);
});

test('checkpoints: a complete ordered 90-minute sequence validates', () => {
  const records = CHECKPOINT_SETS[90].map((id, index) => createCheckpointRecord({
    id, horizonMin: 90, nativeMonotonicMs: index * 600_000, semanticDigest: `digest-${id}`,
  }));
  const result = validateCheckpointSequence(90, records);
  assert.equal(result.ok, true, result.errors.join(','));
});

test('checkpoints: a missing cold-reload/Continue and an out-of-order sequence are rejected', () => {
  const withoutContinue = CHECKPOINT_SETS[30]
    .filter((id) => id !== 'coldReloadContinue')
    .map((id, index) => createCheckpointRecord({ id, horizonMin: 30, nativeMonotonicMs: index * 1000, semanticDigest: `d-${id}` }));
  const missing = validateCheckpointSequence(30, withoutContinue);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.includes('missing-checkpoint:coldReloadContinue'));

  const shuffled = [
    createCheckpointRecord({ id: 'C1', horizonMin: 30, nativeMonotonicMs: 1000, semanticDigest: 'd1' }),
    createCheckpointRecord({ id: 'C0', horizonMin: 30, nativeMonotonicMs: 2000, semanticDigest: 'd0' }),
    createCheckpointRecord({ id: 'coldReloadContinue', horizonMin: 30, nativeMonotonicMs: 3000, semanticDigest: 'dr' }),
    createCheckpointRecord({ id: 'C2', horizonMin: 30, nativeMonotonicMs: 4000, semanticDigest: 'd2' }),
  ];
  assert.ok(validateCheckpointSequence(30, shuffled).errors.includes('checkpoints-out-of-order'));
});

test('checkpoints: a record needs a native timestamp, a digest, and a legal id for its horizon', () => {
  assert.throws(() => createCheckpointRecord({ id: 'C4', horizonMin: 30, nativeMonotonicMs: 1, semanticDigest: 'd' }),
    /checkpoint-not-in-set-for-horizon:C4@30/);
  assert.throws(() => createCheckpointRecord({ id: 'C0', horizonMin: 30, semanticDigest: 'd' }),
    /checkpoint-requires-native-monotonic-timestamp/);
  assert.throws(() => createCheckpointRecord({ id: 'C0', horizonMin: 30, nativeMonotonicMs: 1 }),
    /checkpoint-requires-semantic-digest/);
});

test('checkpoints: time may not run backwards between records', () => {
  const records = [
    createCheckpointRecord({ id: 'C0', horizonMin: 30, nativeMonotonicMs: 5000, semanticDigest: 'a' }),
    createCheckpointRecord({ id: 'C1', horizonMin: 30, nativeMonotonicMs: 1000, semanticDigest: 'b' }),
    createCheckpointRecord({ id: 'coldReloadContinue', horizonMin: 30, nativeMonotonicMs: 6000, semanticDigest: 'c' }),
    createCheckpointRecord({ id: 'C2', horizonMin: 30, nativeMonotonicMs: 7000, semanticDigest: 'd' }),
  ];
  assert.ok(validateCheckpointSequence(30, records).errors.some((e) => e.startsWith('checkpoint-time-went-backwards-at')));
});

// =============================================================================================
// Streaming evidence buffer
// =============================================================================================

test('evidence buffer: normal accumulation below capacity keeps full integrity', () => {
  const buffer = createEvidenceBuffer({ capacity: 8 });
  for (let i = 0; i < 6; i += 1) assert.equal(appendEvidence(buffer, { i }).ok, true);
  const integrity = assertEvidenceIntegrity(buffer);
  assert.equal(integrity.ok, true);
  assert.equal(integrity.totalAccepted, 6);
  assert.equal(buffer.highWaterReached, true, 'high-water is observable before capacity');
});

test('ADV-15: a bounded buffer that would erase evidence fails instead of silently dropping', () => {
  const buffer = createEvidenceBuffer({ capacity: 3 });
  for (let i = 0; i < 3; i += 1) assert.equal(appendEvidence(buffer, { i }).ok, true);
  const overflow = appendEvidence(buffer, { i: 3 });
  assert.equal(overflow.ok, false);
  assert.equal(overflow.reason, 'evidence-buffer-overflow-would-erase-evidence');
  assert.equal(buffer.evidenceLossDetected, true);
  // It did NOT quietly become a ring buffer: the retained entries are the ORIGINAL ones.
  assert.equal(buffer.entries.length, 3);
  assert.deepEqual(buffer.entries.map((e) => e.i), [0, 1, 2]);

  const integrity = assertEvidenceIntegrity(buffer);
  assert.equal(integrity.ok, false);
  assert.equal(integrity.reason, 'bounded-buffer-erased-evidence');
  assert.equal(integrity.droppedCount, 1);
});

test('evidence buffer: declared bounded high-water drains to a durable sink without losing evidence', () => {
  const drained = [];
  const buffer = createEvidenceBuffer({ capacity: 3, sink: (batch) => drained.push(...batch) });
  for (let i = 0; i < 7; i += 1) assert.equal(appendEvidence(buffer, { i }).ok, true);
  const integrity = assertEvidenceIntegrity(buffer);
  assert.equal(integrity.ok, true, integrity.reason);
  assert.equal(buffer.evidenceLossDetected, false);
  // Every record is accounted for: drained + still-buffered == everything appended.
  assert.equal(drained.length + buffer.entries.length, 7);
  assert.deepEqual([...drained, ...buffer.entries].map((e) => e.i), [0, 1, 2, 3, 4, 5, 6]);
});

test('evidence buffer: a missing buffer is not treated as a clean one', () => {
  assert.equal(assertEvidenceIntegrity(null).ok, false);
  assert.equal(assertEvidenceIntegrity(null).reason, 'missing-evidence-buffer');
  assert.throws(() => createEvidenceBuffer({ capacity: 0 }), /bad-capacity/);
});

// =============================================================================================
// Injection
// =============================================================================================

test('ADV-06a: direct transition injection is rejected', () => {
  const result = classifyActorAction({ kind: 'transition-inject', to: 'flight' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'direct-injection-rejected:transition-inject');
  assert.equal(classifyActorAction({ kind: 'mode-set', mode: 'flight' }).ok, false);
});

test('ADV-06b: direct state injection is rejected', () => {
  for (const kind of ['state-write', 'credit-write', 'cargo-write', 'mission-write', 'teleport', 'sector-set']) {
    const result = classifyActorAction({ kind });
    assert.equal(result.ok, false, `${kind} must be rejected`);
    assert.equal(result.reason, `direct-injection-rejected:${kind}`);
  }
});

test('ADV-06c: direct event injection and time compression are rejected', () => {
  assert.equal(classifyActorAction({ kind: 'event-inject', event: 'tether:attached' }).reason, 'direct-injection-rejected:event-inject');
  assert.equal(classifyActorAction({ kind: 'time-compression', scale: 8 }).reason, 'direct-injection-rejected:time-compression');
});

test('action tape: ordinary public play validates and a single injected action fails the tape', () => {
  const clean = validateActionTape([
    { kind: 'click' }, { kind: 'press' }, { kind: 'readVisibleText' }, { kind: 'enterSeed' },
  ]);
  assert.equal(clean.ok, true);

  const dirty = validateActionTape([
    { kind: 'click' }, { kind: 'event-inject', event: 'massline:releaseValidated' }, { kind: 'press' },
  ]);
  assert.equal(dirty.ok, false);
  assert.equal(dirty.rejections.length, 1);
  assert.equal(dirty.rejections[0].index, 1);
  assert.match(dirty.rejections[0].reason, /direct-injection-rejected:event-inject/);
});
