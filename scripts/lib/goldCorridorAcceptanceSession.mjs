// PQ-025 — held-out Gold Corridor qualification: PURE session contracts (Phase 1).
//
// Actor / Observer / Judge capability separation, checkpoint schemas, and the streaming-evidence
// buffer contract. This module contains NO process, browser, Electron, Playwright, timer, or
// filesystem code — the Phase-2+ adapters supply those and must consume these interfaces.
//
// The separation is enforced STRUCTURALLY, at construction time, rather than by convention:
//   * an actor capability rejects any surface that transitively reaches an observer;
//   * an actor may only hold public-surface verbs (what a real player can see and control);
//   * an observer is read-only and carries no emit/mutate path;
//   * a judge receives a frozen ledger view and has no append path at all.

import { deepFreeze, canonicalJson, sha256Hex, HORIZONS_MIN } from './goldCorridorAcceptanceContracts.mjs';

const OBSERVER_BRAND = Symbol.for('pq025.observer');
const ACTOR_BRAND = Symbol.for('pq025.actor');
const JUDGE_BRAND = Symbol.for('pq025.judge');

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// ---------------------------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------------------------

/**
 * The complete set of verbs an actor may hold. Everything here is something a public player can do
 * with eyes, keyboard, pointer, controller, or the seed entry field. Anything NOT on this list —
 * `state`, `bus`, `registry`, `eventTrace`, `telemetry`, `observer` — is hidden state and is
 * rejected at construction.
 */
export const ACTOR_PUBLIC_VERBS = Object.freeze([
  'click', 'press', 'type', 'pointerMove', 'scroll',
  'readVisibleText', 'readAccessibleName', 'readFocusedElement', 'readPixels',
  'enterSeed', 'waitForVisible',
]);

/** Surfaces that identify hidden state. Holding any of these makes an actor illegal. */
export const ACTOR_FORBIDDEN_SURFACES = Object.freeze([
  'state', 'bus', 'registry', 'eventTrace', 'telemetry', 'helpers', 'ctx', 'observer',
  'simSnapshot', 'ownerEvents', 'heldOutAnswer', 'expectedOutcome', 'labBridge', 'SF',
]);

function reachesObserver(value, depth = 0, seen = new Set()) {
  if (depth > 4 || value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (value[OBSERVER_BRAND] === true) return true;
  for (const key of Object.keys(value)) {
    if (reachesObserver(value[key], depth + 1, seen)) return true;
  }
  return false;
}

/**
 * Build an actor capability. Throws on any information-flow violation rather than returning a
 * degraded object, so a violation cannot be ignored by a caller that does not check a result flag.
 */
export function createActorCapability({ policyId, publicSurface = {} } = {}) {
  if (!nonEmptyString(policyId)) throw new Error('actor-requires-policy-id');
  if (!publicSurface || typeof publicSurface !== 'object') throw new Error('actor-requires-public-surface');

  for (const key of Object.keys(publicSurface)) {
    if (ACTOR_FORBIDDEN_SURFACES.includes(key)) {
      throw new Error(`actor-may-not-hold-hidden-state:${key}`);
    }
    if (!ACTOR_PUBLIC_VERBS.includes(key)) {
      throw new Error(`actor-surface-not-a-public-verb:${key}`);
    }
  }
  if (reachesObserver(publicSurface)) {
    throw new Error('actor-may-not-reference-observer');
  }

  const surface = {};
  for (const verb of ACTOR_PUBLIC_VERBS) {
    if (typeof publicSurface[verb] === 'function') surface[verb] = publicSurface[verb];
  }
  return deepFreeze({
    [ACTOR_BRAND]: true,
    kind: 'actor',
    policyId,
    surface: Object.freeze(surface),
    verbs: Object.freeze(Object.keys(surface)),
  });
}

export function isActor(value) {
  return !!value && value[ACTOR_BRAND] === true;
}

// ---------------------------------------------------------------------------------------------
// Observer
// ---------------------------------------------------------------------------------------------

/** Everything an observer is permitted to collect, read-only. */
export const OBSERVER_READ_CHANNELS = Object.freeze([
  'ownerEvents', 'projections', 'saveReceipts', 'errors', 'focusVisibility', 'timeScale',
  'processHealth', 'gpuHealth', 'performance', 'media',
]);

/** Mutating surfaces an observer must never carry. */
export const OBSERVER_FORBIDDEN_SURFACES = Object.freeze([
  'emit', 'dispatch', 'setTimeScale', 'mutate', 'call', 'invoke', 'write', 'inject', 'actor',
]);

export function createObserverCapability({ observerId, read = {} } = {}) {
  if (!nonEmptyString(observerId)) throw new Error('observer-requires-id');
  for (const key of Object.keys(read)) {
    if (OBSERVER_FORBIDDEN_SURFACES.includes(key)) throw new Error(`observer-must-be-read-only:${key}`);
    if (!OBSERVER_READ_CHANNELS.includes(key)) throw new Error(`observer-unknown-read-channel:${key}`);
  }
  const channels = {};
  for (const channel of OBSERVER_READ_CHANNELS) {
    if (typeof read[channel] === 'function') channels[channel] = read[channel];
  }
  return deepFreeze({
    [OBSERVER_BRAND]: true,
    kind: 'observer',
    observerId,
    readOnly: true,
    read: Object.freeze(channels),
    channels: Object.freeze(Object.keys(channels)),
  });
}

export function isObserver(value) {
  return !!value && value[OBSERVER_BRAND] === true;
}

/** Independent audit of an already-constructed observer. */
export function assertObserverPurity(observer) {
  const violations = [];
  if (!isObserver(observer)) violations.push('not-an-observer');
  else {
    if (observer.readOnly !== true) violations.push('observer-not-marked-read-only');
    for (const key of OBSERVER_FORBIDDEN_SURFACES) {
      if (typeof observer[key] === 'function' || typeof observer.read?.[key] === 'function') {
        violations.push(`observer-carries-mutating-surface:${key}`);
      }
    }
  }
  return { ok: violations.length === 0, violations: Object.freeze(violations) };
}

/**
 * The one legal bridge between the domains: the actor may NOT read the observer, so any attempt to
 * hand observer data to an actor is rejected here as well as at construction.
 */
export function assertInformationFlow({ actor, observer } = {}) {
  const violations = [];
  if (actor && !isActor(actor)) violations.push('bad-actor-capability');
  if (observer && !isObserver(observer)) violations.push('bad-observer-capability');
  if (actor && observer && reachesObserver(actor)) violations.push('actor-references-observer');
  if (actor) {
    for (const verb of actor.verbs || []) {
      if (!ACTOR_PUBLIC_VERBS.includes(verb)) violations.push(`actor-holds-non-public-verb:${verb}`);
    }
  }
  return { ok: violations.length === 0, violations: Object.freeze(violations) };
}

// ---------------------------------------------------------------------------------------------
// Judge
// ---------------------------------------------------------------------------------------------

/**
 * A judge validates. It receives a frozen SNAPSHOT of the ledger and has no append/delete/relabel
 * path: the returned capability exposes only `readLedger` plus pure validators supplied by the
 * caller. Passing a mutator in is a construction error.
 */
export const JUDGE_FORBIDDEN_SURFACES = Object.freeze([
  'append', 'appendAttempt', 'delete', 'remove', 'relabel', 'setVerdict', 'mutate', 'write', 'emit',
]);

export function createJudgeCapability({ judgeId, ledger, validators = {} } = {}) {
  if (!nonEmptyString(judgeId)) throw new Error('judge-requires-id');
  if (!ledger || !Array.isArray(ledger.entries)) throw new Error('judge-requires-ledger-snapshot');
  for (const key of Object.keys(validators)) {
    if (JUDGE_FORBIDDEN_SURFACES.includes(key)) throw new Error(`judge-may-not-mutate-the-ledger:${key}`);
  }
  const snapshot = deepFreeze(JSON.parse(JSON.stringify({ schema: ledger.schema, entries: ledger.entries, headHash: ledger.headHash })));
  return deepFreeze({
    [JUDGE_BRAND]: true,
    kind: 'judge',
    judgeId,
    readLedger: () => snapshot,
    ledgerHash: sha256Hex(canonicalJson(snapshot)),
    validators: deepFreeze({ ...validators }),
  });
}

export function isJudge(value) {
  return !!value && value[JUDGE_BRAND] === true;
}

/** Prove a judge did not alter the ledger it was given. */
export function assertJudgeDidNotMutate(judge, currentLedger) {
  if (!isJudge(judge)) return { ok: false, reason: 'not-a-judge' };
  const snapshot = judge.readLedger();
  const currentHash = sha256Hex(canonicalJson({
    schema: currentLedger.schema, entries: currentLedger.entries, headHash: currentLedger.headHash,
  }));
  if (currentHash !== judge.ledgerHash) {
    // The ledger legitimately grows; a judge must not be the cause. Growth is only acceptable when
    // the judge's snapshot remains an exact prefix.
    const prefixIntact = snapshot.entries.every((entry, i) => canonicalJson(entry) === canonicalJson(currentLedger.entries[i]));
    if (!prefixIntact) return { ok: false, reason: 'ledger-mutated-under-judge' };
  }
  return { ok: true, reason: null };
}

// ---------------------------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------------------------

export const CHECKPOINT_SETS = deepFreeze({
  30: ['C0', 'C1', 'coldReloadContinue', 'C2'],
  90: ['C0', 'C1', 'C2a', 'C2b', 'C3', 'C4', 'finalColdReloadContinue'],
});

export const CHECKPOINT_MEANING = deepFreeze({
  C0: 'new-game identity',
  C1: 'first completed career loop',
  C2: 'post-Continue meaningful action + semantic digest',
  C2a: 'immediately before legal purchase/fit',
  C2b: 'immediately after charge/ownership/fit/activation/capability delta',
  C3: 'after combat/adverse recovery',
  C4: 'final corridor sector or predeclared late-session point',
  coldReloadContinue: 'cold reload -> Continue',
  finalColdReloadContinue: 'final cold reload -> Continue -> verify purchase/fit/capability + meaningful action',
});

export function createCheckpointRecord({ id, horizonMin, nativeMonotonicMs, semanticDigest, evidenceRefs = [] } = {}) {
  if (!CHECKPOINT_SETS[horizonMin] || !CHECKPOINT_SETS[horizonMin].includes(id)) {
    throw new Error(`checkpoint-not-in-set-for-horizon:${id}@${horizonMin}`);
  }
  if (!Number.isFinite(nativeMonotonicMs)) throw new Error('checkpoint-requires-native-monotonic-timestamp');
  if (!nonEmptyString(semanticDigest)) throw new Error('checkpoint-requires-semantic-digest');
  return deepFreeze({
    id, horizonMin, nativeMonotonicMs, semanticDigest, evidenceRefs: Object.freeze([...evidenceRefs]),
  });
}

/**
 * The declared checkpoint set must be complete and in order. A missing cold-reload/Continue or an
 * out-of-order sequence is a rejection, never a warning.
 */
export function validateCheckpointSequence(horizonMin, records = []) {
  const expected = CHECKPOINT_SETS[horizonMin];
  if (!expected) return { ok: false, errors: Object.freeze(['unknown-horizon']) };
  const errors = [];
  const seen = records.map((record) => record.id);
  for (const id of expected) {
    if (!seen.includes(id)) errors.push(`missing-checkpoint:${id}`);
  }
  const filtered = seen.filter((id) => expected.includes(id));
  const ordered = expected.filter((id) => filtered.includes(id));
  if (canonicalJson(filtered) !== canonicalJson(ordered)) errors.push('checkpoints-out-of-order');
  for (let i = 1; i < records.length; i += 1) {
    if (records[i].nativeMonotonicMs < records[i - 1].nativeMonotonicMs) errors.push(`checkpoint-time-went-backwards-at:${records[i].id}`);
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

export function checkpointSetFor(horizonMin) {
  if (!HORIZONS_MIN.includes(horizonMin)) return null;
  return CHECKPOINT_SETS[horizonMin];
}

// ---------------------------------------------------------------------------------------------
// Streaming evidence buffer — bounded, but it may never ERASE evidence
// ---------------------------------------------------------------------------------------------

/**
 * A bounded ring buffer would silently destroy the evidence that proves a failure. This buffer is
 * bounded in MEMORY but not in TRUTH: when capacity is exceeded it refuses to pretend, raising
 * `evidenceLossDetected` and recording how much was lost. Any attempt that carries a lossy buffer
 * fails; the declared remedy is to stream to durable storage, not to drop.
 */
export function createEvidenceBuffer({ capacity = 1024, highWaterRatio = 0.8, sink = null } = {}) {
  if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('evidence-buffer-bad-capacity');
  return {
    capacity,
    highWater: Math.floor(capacity * highWaterRatio),
    entries: [],
    totalAccepted: 0,
    droppedCount: 0,
    evidenceLossDetected: false,
    highWaterReached: false,
    drainedCount: 0,
    sink: typeof sink === 'function' ? sink : null,
  };
}

export function appendEvidence(buffer, record) {
  if (!buffer) throw new Error('evidence-buffer-required');
  if (buffer.entries.length >= buffer.capacity) {
    if (buffer.sink) {
      // Bounded high-water behaviour that does NOT erase: drain to a durable sink first.
      const drained = buffer.entries.splice(0, buffer.entries.length);
      buffer.drainedCount += drained.length;
      buffer.sink(drained);
    } else {
      buffer.droppedCount += 1;
      buffer.evidenceLossDetected = true;
      return { ok: false, reason: 'evidence-buffer-overflow-would-erase-evidence' };
    }
  }
  buffer.entries.push(record);
  buffer.totalAccepted += 1;
  if (buffer.entries.length >= buffer.highWater) buffer.highWaterReached = true;
  return { ok: true, reason: null };
}

/** A buffer that lost anything can never back a passing attempt. */
export function assertEvidenceIntegrity(buffer) {
  if (!buffer) return { ok: false, reason: 'missing-evidence-buffer' };
  if (buffer.evidenceLossDetected || buffer.droppedCount > 0) {
    return { ok: false, reason: 'bounded-buffer-erased-evidence', droppedCount: buffer.droppedCount };
  }
  return { ok: true, reason: null, totalAccepted: buffer.totalAccepted, drainedCount: buffer.drainedCount };
}

// ---------------------------------------------------------------------------------------------
// Injection detection — the actor must not bypass the public surface
// ---------------------------------------------------------------------------------------------

/** Action kinds that are never a public-surface player action. */
export const INJECTION_ACTION_KINDS = Object.freeze([
  'state-write', 'event-inject', 'transition-inject', 'teleport', 'credit-write', 'cargo-write',
  'mission-write', 'mode-set', 'time-compression', 'sector-set',
]);

export function classifyActorAction(action = {}) {
  if (INJECTION_ACTION_KINDS.includes(action.kind)) {
    return { ok: false, reason: `direct-injection-rejected:${action.kind}` };
  }
  if (!ACTOR_PUBLIC_VERBS.includes(action.kind)) {
    return { ok: false, reason: `action-is-not-a-public-verb:${action.kind}` };
  }
  return { ok: true, reason: null };
}

export function validateActionTape(actions = []) {
  const rejections = [];
  actions.forEach((action, index) => {
    const verdict = classifyActorAction(action);
    if (!verdict.ok) rejections.push({ index, reason: verdict.reason });
  });
  return { ok: rejections.length === 0, rejections: Object.freeze(rejections) };
}

export default {
  createActorCapability,
  createObserverCapability,
  createJudgeCapability,
  assertInformationFlow,
  validateCheckpointSequence,
  createEvidenceBuffer,
  appendEvidence,
  assertEvidenceIntegrity,
};
