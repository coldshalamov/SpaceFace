// PQ-019B — pure arbiter proof.
//
// Nothing here constructs a simulation, a bus, an entity, or a renderer. If any assertion in this
// file could only pass with live coupling, the arbiter is not pure and the packet's central claim
// ("selection never uses callback order, wall time, live entity id, or randomness") is unproven.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HEIST_ARBITER_SCHEMA,
  HEIST_CANDIDATE_KINDS,
  HEIST_EFFECT_SLOTS,
  HEIST_PROGRESS_CHAIN,
  HEIST_TERMINAL_PRECEDENCE,
  applyTransition,
  arbiterInvariants,
  candidateIdFor,
  commitTerminal,
  createArbiter,
  effectApplied,
  isValidTransition,
  normalizeCandidate,
  prepareTerminal,
  recordEffect,
  restoreArbiter,
  selectOutcome,
  serializeArbiter,
  stepArbiter,
  submitCandidate,
} from '../src/missions/heistArbiter.js';

const MISSION = 'mission_pq019_heist';
const PAYLOAD = 'pq019a_cargo_capsule';

function arb(createdAtTick = 0) {
  return createArbiter({ missionId: MISSION, payloadStableId: PAYLOAD, createdAtTick });
}

function report(kind, sourceStableId, causalTick = 10, proof = undefined) {
  return {
    missionId: MISSION, payloadStableId: PAYLOAD, kind, causalTick, sourceStableId, proof,
  };
}

/** Every ordering of `items`. Used to prove callback order cannot reach the result. */
function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const tail of permutations(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

function roundTrip(arbiter) {
  // A real save boundary: the record leaves the process as text and comes back as data.
  const restored = restoreArbiter(JSON.parse(JSON.stringify(serializeArbiter(arbiter))));
  assert.ok(restored, 'arbiter must survive a JSON save boundary');
  return restored;
}

// ── transition validator ────────────────────────────────────────────────────────────────────────

test('progress chain advances one link at a time and never runs backwards', () => {
  for (let i = 0; i < HEIST_PROGRESS_CHAIN.length; i++) {
    const from = HEIST_PROGRESS_CHAIN[i];
    assert.equal(isValidTransition(from, from), true, `${from} -> ${from} (replay re-assert)`);
    assert.equal(isValidTransition(from, 'resolution_pending'), true, `${from} -> resolution_pending`);
    for (let j = 0; j < HEIST_PROGRESS_CHAIN.length; j++) {
      const to = HEIST_PROGRESS_CHAIN[j];
      if (i === j) continue;
      assert.equal(isValidTransition(from, to), j === i + 1, `${from} -> ${to}`);
    }
  }
});

test('terminal is immutable and only resolution_pending reaches it', () => {
  assert.equal(isValidTransition('resolution_pending', 'terminal'), true);
  for (const phase of HEIST_PROGRESS_CHAIN) {
    assert.equal(isValidTransition(phase, 'terminal'), false, `${phase} may not jump to terminal`);
    assert.equal(isValidTransition('terminal', phase), false, 'terminal is immutable');
  }
  assert.equal(isValidTransition('terminal', 'resolution_pending'), false);
  assert.equal(isValidTransition('resolution_pending', 'launched'), false);
  assert.equal(isValidTransition('scheduled', 'nonsense'), false);
});

test('applyTransition refuses an illegal step without mutating phase', () => {
  const a = arb();
  assert.equal(applyTransition(a, 'possessed').ok, false);
  assert.equal(a.phase, 'scheduled');
  assert.equal(applyTransition(a, 'launched').ok, true);
  assert.equal(a.phase, 'launched');
});

// ── normalizer ──────────────────────────────────────────────────────────────────────────────────

test('candidateId is exactly hash(missionId, payloadStableId, kind, causalTick, sourceStableId)', () => {
  const expected = candidateIdFor({
    missionId: MISSION, payloadStableId: PAYLOAD, kind: 'fenced_success',
    causalTick: 42, sourceStableId: 'fence_receiver',
  });
  const got = normalizeCandidate(report('fenced_success', 'fence_receiver', 42));
  assert.equal(got.ok, true);
  assert.equal(got.candidate.candidateId, expected);
  // Identity ignores proof: the same fact decorated differently is the same candidate.
  const twin = normalizeCandidate(report('fenced_success', 'fence_receiver', 42, { dp: 999 }));
  assert.equal(twin.candidate.candidateId, expected);
});

test('the kind vocabulary is total and closed; an unknown kind is rejected, never dropped silently', () => {
  assert.equal(HEIST_CANDIDATE_KINDS.length, HEIST_TERMINAL_PRECEDENCE.length + 1);
  for (const kind of HEIST_CANDIDATE_KINDS) {
    assert.equal(normalizeCandidate(report(kind, 'src')).ok, true, `${kind} must be accepted`);
  }
  // Facility/physics vocabulary is deliberately NOT arbiter vocabulary.
  for (const kind of ['lawful_catch_contact', 'fence_contact', 'destroyed', '', 'FENCED_SUCCESS']) {
    const out = normalizeCandidate(report(kind, 'src'));
    assert.equal(out.ok, false, `${kind} must be refused`);
    assert.equal(out.reason, 'unknown_kind');
  }
});

test('malformed reports are refused by reason, and never throw', () => {
  const cases = [
    [null, 'not_an_object'],
    [[], 'not_an_object'],
    [{ ...report('expired', 's'), missionId: '' }, 'invalid_mission_id'],
    [{ ...report('expired', 's'), payloadStableId: 42 }, 'invalid_payload_id'],
    [{ ...report('expired', 's'), sourceStableId: '   ' }, 'invalid_source_id'],
    [{ ...report('expired', 's'), causalTick: 1.5 }, 'invalid_causal_tick'],
    [{ ...report('expired', 's'), causalTick: -1 }, 'invalid_causal_tick'],
    [{ ...report('expired', 's'), proof: 'nope' }, 'invalid_proof'],
    // `hash32` joins on '|', so an id carrying '|' could impersonate another id's hash.
    [{ ...report('expired', 'a|b') }, 'invalid_source_id'],
  ];
  for (const [input, reason] of cases) {
    const out = normalizeCandidate(input);
    assert.equal(out.ok, false);
    assert.equal(out.reason, reason, JSON.stringify(input));
  }
});

test('a forged candidateId that disagrees with its content hash is refused', () => {
  const honest = report('payload_destroyed', 'combat', 7);
  const real = candidateIdFor(honest);
  assert.equal(normalizeCandidate({ ...honest, candidateId: real }).ok, true);
  const forged = normalizeCandidate({ ...honest, candidateId: 'hc_attacker' });
  assert.equal(forged.ok, false);
  assert.equal(forged.reason, 'forged_candidate_id');
});

// ── selector: order independence ────────────────────────────────────────────────────────────────

test('every callback permutation of competing same-tick candidates yields the identical winner and identical bytes', () => {
  const inputs = [
    report('fenced_success', 'fence_receiver', 100),
    report('lawful_confiscation', 'patrol_a', 100),
    report('payload_destroyed', 'combat', 100),
    report('possession', 'massline', 100),
  ];
  const orders = permutations(inputs);
  assert.equal(orders.length, 24);

  let expectedBytes = null;
  let expectedWinner = null;
  for (const order of orders) {
    const a = arb();
    for (const input of order) submitCandidate(a, input);
    const out = stepArbiter(a, 101);
    assert.ok(out.receipt, 'a terminal candidate must decide');
    // Precedence: destroyed outranks confiscated outranks fenced; possession never competes.
    assert.equal(out.receipt.outcome, 'payload_destroyed');
    const bytes = JSON.stringify(serializeArbiter(a));
    if (expectedBytes === null) { expectedBytes = bytes; expectedWinner = out.receipt.receiptId; }
    assert.equal(bytes, expectedBytes, 'insertion order must not reach serialized state');
    assert.equal(out.receipt.receiptId, expectedWinner);
  }
});

test('the pinned terminal precedence chain holds pairwise at one tick', () => {
  for (let i = 0; i < HEIST_TERMINAL_PRECEDENCE.length; i++) {
    for (let j = i + 1; j < HEIST_TERMINAL_PRECEDENCE.length; j++) {
      const strong = HEIST_TERMINAL_PRECEDENCE[i];
      const weak = HEIST_TERMINAL_PRECEDENCE[j];
      for (const order of [[strong, weak], [weak, strong]]) {
        const a = arb();
        for (const kind of order) submitCandidate(a, report(kind, `src_${kind}`, 50));
        const out = stepArbiter(a, 51);
        assert.equal(out.receipt.outcome, strong, `${strong} must outrank ${weak}`);
      }
    }
  }
});

test('the packet chain is encoded verbatim and abandoned ranks last by recorded ruling', () => {
  assert.deepEqual(HEIST_TERMINAL_PRECEDENCE.slice(0, 6), [
    'payload_destroyed',
    'lawful_confiscation',
    'fenced_success',
    'lawful_arrival_observed',
    'expired',
    'unresolved_absent',
  ]);
  assert.equal(HEIST_TERMINAL_PRECEDENCE[6], 'abandoned');
  assert.equal(HEIST_TERMINAL_PRECEDENCE.length, 7);
});

test('remaining ties break on stable candidateId, not on arrival', () => {
  // Same kind, same tick, different sources: only candidateId can separate them.
  const sources = ['patrol_zulu', 'patrol_alpha', 'patrol_mike'];
  const ids = sources.map((s) => candidateIdFor({
    missionId: MISSION, payloadStableId: PAYLOAD, kind: 'lawful_confiscation',
    causalTick: 30, sourceStableId: s,
  }));
  const lowest = ids.slice().sort()[0];
  for (const order of permutations(sources)) {
    const a = arb();
    for (const s of order) submitCandidate(a, report('lawful_confiscation', s, 30));
    const out = stepArbiter(a, 31);
    assert.equal(out.receipt.winnerCandidateId, lowest);
  }
});

test('an earlier possession never suppresses a later terminal fact', () => {
  // Regression: ranking possession in the same lane as terminals stranded a decided heist in
  // `possessed` because earliest-causal-first put the nonterminal report at the head of the list.
  for (const order of permutations([
    report('possession', 'massline', 40),
    report('lawful_confiscation', 'patrol_a', 41),
  ])) {
    const a = arb();
    applyTransition(a, 'launched');
    for (const input of order) submitCandidate(a, input);
    const out = stepArbiter(a, 42);
    assert.ok(out.receipt, 'a terminal candidate must still decide');
    assert.equal(out.receipt.outcome, 'lawful_confiscation');
  }
});

test('when several possessions compete, the most recent one is reported', () => {
  const a = arb();
  applyTransition(a, 'launched');
  for (const order of permutations([
    report('possession', 'massline', 10),
    report('possession', 'tether', 12),
    report('possession', 'dock', 11),
  ])) {
    const fresh = arb();
    applyTransition(fresh, 'launched');
    for (const input of order) submitCandidate(fresh, input);
    const out = stepArbiter(fresh, 13);
    assert.equal(out.possession.causalTick, 12);
    assert.equal(out.possession.sourceStableId, 'tether');
  }
});

test('the earliest causal tick wins across ticks; a later report cannot overturn a settled fact', () => {
  for (const order of permutations([
    report('payload_destroyed', 'combat', 105),
    report('expired', 'clock', 100),
  ])) {
    const a = arb();
    for (const input of order) submitCandidate(a, input);
    const out = stepArbiter(a, 106);
    assert.equal(out.receipt.outcome, 'expired');
    assert.equal(out.receipt.causalTick, 100);
  }
});

test('a decision is never taken in the reporting tick; it becomes eligible at causalTick + 1', () => {
  const a = arb();
  submitCandidate(a, report('fenced_success', 'fence_receiver', 200));
  assert.equal(stepArbiter(a, 200).receipt, null, 'same-step decision is forbidden');
  assert.equal(selectOutcome(a.candidates, 200).decided, false);
  assert.equal(selectOutcome(a.candidates, 201).decided, true);
  assert.ok(stepArbiter(a, 201).receipt);
});

test('nonterminal possession applies only when no terminal candidate wins', () => {
  const withTerminal = arb();
  submitCandidate(withTerminal, report('possession', 'massline', 10));
  submitCandidate(withTerminal, report('unresolved_absent', 'reconciler', 10));
  const decided = stepArbiter(withTerminal, 11);
  assert.equal(decided.possession, null);
  assert.equal(decided.receipt.outcome, 'unresolved_absent');
  assert.equal(withTerminal.phase, 'resolution_pending');

  const possessionOnly = arb();
  applyTransition(possessionOnly, 'launched');
  submitCandidate(possessionOnly, report('possession', 'massline', 10));
  const progressed = stepArbiter(possessionOnly, 11);
  assert.equal(progressed.receipt, null);
  assert.ok(progressed.possession);
  assert.equal(possessionOnly.phase, 'possessed');
});

// ── duplicates, staleness, freezing ─────────────────────────────────────────────────────────────

test('duplicate delivery of the same fact counts once', () => {
  const a = arb();
  const first = submitCandidate(a, report('fenced_success', 'fence_receiver', 60));
  assert.equal(first.accepted, true);
  for (let i = 0; i < 5; i++) {
    const again = submitCandidate(a, report('fenced_success', 'fence_receiver', 60, { dp: i }));
    assert.equal(again.accepted, false);
    assert.equal(again.reason, 'duplicate');
    assert.equal(again.candidate.candidateId, first.candidate.candidateId);
  }
  assert.equal(a.candidates.length, 1);
});

test('a report for another mission or another payload cannot enter this journal', () => {
  const a = arb();
  assert.equal(submitCandidate(a, { ...report('fenced_success', 'f', 5), missionId: 'other_mission' }).reason, 'wrong_mission');
  assert.equal(submitCandidate(a, { ...report('fenced_success', 'f', 5), payloadStableId: 'other_pod' }).reason, 'wrong_payload');
  assert.equal(a.candidates.length, 0);
  assert.equal(a.rejected.length, 2);
});

test('a report arriving after its window closed is refused as stale and recorded', () => {
  const a = arb();
  stepArbiter(a, 300); // closes everything through tick 299
  const late = submitCandidate(a, report('fenced_success', 'fence_receiver', 250));
  assert.equal(late.accepted, false);
  assert.equal(late.reason, 'stale_tick');
  assert.equal(a.rejected.at(-1).reason, 'stale_tick');
  // A report stamped inside the still-open window is fine.
  assert.equal(submitCandidate(a, report('fenced_success', 'fence_receiver', 300)).accepted, true);
});

test('the journal freezes at terminal: no later report can re-open a decided outcome', () => {
  const a = arb();
  submitCandidate(a, report('fenced_success', 'fence_receiver', 10));
  const decided = stepArbiter(a, 11);
  assert.equal(decided.receipt.outcome, 'fenced_success');
  const after = submitCandidate(a, report('payload_destroyed', 'combat', 12));
  assert.equal(after.accepted, false);
  assert.equal(after.reason, 'journal_frozen');
  assert.equal(stepArbiter(a, 13).receipt.outcome, 'fenced_success');
  assert.equal(arbiterInvariants(a).terminalReceiptCount, 1);
});

// ── terminal compare-and-set, replay, effect journal ────────────────────────────────────────────

test('prepareTerminal is compare-and-set: the second call resumes the same receipt', () => {
  const a = arb();
  submitCandidate(a, report('lawful_arrival_observed', 'lawful_catcher', 20));
  const first = prepareTerminal(a, 21);
  assert.equal(first.prepared, true);
  const second = prepareTerminal(a, 21);
  assert.equal(second.prepared, false);
  assert.equal(second.reason, 'already_prepared');
  assert.equal(second.receipt.receiptId, first.receipt.receiptId);
  assert.equal(second.resumed, true);
});

test('commit is exactly once and re-commit is a recorded no-op', () => {
  const a = arb();
  submitCandidate(a, report('fenced_success', 'fence_receiver', 20));
  const { receipt } = prepareTerminal(a, 21);
  assert.equal(receipt.status, 'prepared');
  assert.equal(commitTerminal(a, receipt.receiptId).committed, true);
  assert.equal(a.receipt.status, 'committed');
  assert.equal(a.phase, 'terminal');
  const again = commitTerminal(a, receipt.receiptId);
  assert.equal(again.committed, false);
  assert.equal(again.reason, 'already_committed');
  assert.equal(commitTerminal(a, 'heist:receipt:someoneelse').reason, 'receipt_mismatch');
});

test('effect keys cover every owner slot and each is granted to exactly one caller', () => {
  const a = arb();
  submitCandidate(a, report('fenced_success', 'fence_receiver', 20));
  const { receipt } = prepareTerminal(a, 21);
  for (const slot of HEIST_EFFECT_SLOTS) {
    assert.equal(typeof receipt.effectKeys[slot], 'string', `${slot} key must exist`);
    assert.ok(receipt.effectKeys[slot].startsWith(receipt.receiptId));
  }
  const key = receipt.effectKeys.receiverCommit;
  assert.equal(recordEffect(a, key, { effectId: 'receiver_commit_1', tick: 21 }).applied, true);
  for (let i = 0; i < 4; i++) {
    const dup = recordEffect(a, key, { effectId: 'receiver_commit_2', tick: 99 });
    assert.equal(dup.applied, false);
    assert.equal(dup.record.effectId, 'receiver_commit_1', 'the original record is authoritative');
  }
  assert.equal(effectApplied(a, receipt.effectKeys.economyReward), false);
  assert.equal(arbiterInvariants(a).receiverCommitCount, 1);
  assert.equal(arbiterInvariants(a).economyRewardCount, 0);
});

// ── save boundaries ─────────────────────────────────────────────────────────────────────────────

test('a save boundary mid-arbitration preserves the buffer and the pending decision exactly', () => {
  const a = arb();
  applyTransition(a, 'launched');
  submitCandidate(a, report('possession', 'massline', 40));
  submitCandidate(a, report('lawful_confiscation', 'patrol_a', 41));
  const before = JSON.stringify(serializeArbiter(a));
  const restored = roundTrip(a);
  assert.equal(JSON.stringify(serializeArbiter(restored)), before);
  // Both halves reach the same terminal from the same buffer.
  assert.equal(stepArbiter(a, 42).receipt.outcome, 'lawful_confiscation');
  assert.equal(stepArbiter(restored, 42).receipt.outcome, 'lawful_confiscation');
  assert.equal(
    JSON.stringify(serializeArbiter(a)),
    JSON.stringify(serializeArbiter(restored)),
  );
});

test('crash after prepare resumes the SAME receipt; replay never selects a new winner', () => {
  const a = arb();
  submitCandidate(a, report('lawful_arrival_observed', 'lawful_catcher', 70));
  const prepared = prepareTerminal(a, 71).receipt;
  assert.equal(prepared.status, 'prepared');

  // The process dies here — only the prepared record survives.
  const resumed = roundTrip(a);
  assert.equal(resumed.receipt.receiptId, prepared.receiptId);
  assert.equal(resumed.receipt.status, 'prepared');
  assert.equal(resumed.receipt.outcome, 'lawful_arrival_observed');

  // A stronger candidate showing up after the crash must NOT change the outcome.
  assert.equal(submitCandidate(resumed, report('payload_destroyed', 'combat', 72)).reason, 'journal_frozen');
  assert.equal(prepareTerminal(resumed, 73).receipt.receiptId, prepared.receiptId);
  assert.equal(commitTerminal(resumed, prepared.receiptId).committed, true);
  assert.equal(arbiterInvariants(resumed).terminalReceiptCount, 1);
  assert.equal(arbiterInvariants(resumed).terminalOutcome, 'lawful_arrival_observed');
});

test('the effect journal survives the save boundary, so a committed effect is never re-applied', () => {
  const a = arb();
  submitCandidate(a, report('fenced_success', 'fence_receiver', 80));
  const { receipt } = prepareTerminal(a, 81);
  recordEffect(a, receipt.effectKeys.economyReward, { effectId: 'payout_1', tick: 81 });
  const resumed = roundTrip(a);
  assert.equal(effectApplied(resumed, receipt.effectKeys.economyReward), true);
  const retry = recordEffect(resumed, receipt.effectKeys.economyReward, { effectId: 'payout_2' });
  assert.equal(retry.applied, false);
  assert.equal(retry.record.effectId, 'payout_1');
  assert.equal(arbiterInvariants(resumed).economyRewardCount, 1);
});

test('a tampered save cannot smuggle a forged candidate or an unknown kind past restore', () => {
  const a = arb();
  submitCandidate(a, report('expired', 'clock', 90));
  const snapshot = serializeArbiter(a);
  snapshot.candidates.push({
    candidateId: 'hc_attacker', missionId: MISSION, payloadStableId: PAYLOAD,
    kind: 'fenced_success', causalTick: 90, sourceStableId: 'attacker', proof: {}, terminal: true,
  });
  snapshot.candidates.push({
    candidateId: candidateIdFor({
      missionId: MISSION, payloadStableId: PAYLOAD, kind: 'jackpot',
      causalTick: 90, sourceStableId: 'attacker',
    }),
    missionId: MISSION, payloadStableId: PAYLOAD, kind: 'jackpot',
    causalTick: 90, sourceStableId: 'attacker', proof: {}, terminal: true,
  });
  const restored = restoreArbiter(JSON.parse(JSON.stringify(snapshot)));
  assert.equal(restored.candidates.length, 1);
  assert.equal(restored.candidates[0].kind, 'expired');
  assert.equal(stepArbiter(restored, 91).receipt.outcome, 'expired');
});

test('a decided record whose receipt is unreadable is refused outright, never restored unfrozen', () => {
  // Phase and receipt restore independently. A record that claims a decision was reached but cannot
  // produce a readable receipt would otherwise come back UNFROZEN: the journal accepts new
  // candidates and prepareTerminal mints a SECOND receipt, with new effect keys that no longer match
  // the effects already applied. That is a double-payout, and it can even change the outcome.
  const decided = arb();
  submitCandidate(decided, report('expired', 'clock', 10));
  stepArbiter(decided, 11);
  commitTerminal(decided, decided.receipt.receiptId);
  const snapshot = serializeArbiter(decided);
  assert.equal(snapshot.phase, 'terminal');

  for (const [label, tampered] of [
    ['receipt dropped', { ...snapshot, receipt: null }],
    ['receipt missing', { ...snapshot, receipt: undefined }],
    ['unknown outcome', { ...snapshot, receipt: { ...snapshot.receipt, outcome: 'jackpot' } }],
    ['blank receiptId', { ...snapshot, receipt: { ...snapshot.receipt, receiptId: '' } }],
    ['blank winner', { ...snapshot, receipt: { ...snapshot.receipt, winnerCandidateId: '' } }],
    ['bad causalTick', { ...snapshot, receipt: { ...snapshot.receipt, causalTick: -3 } }],
    ['resolution_pending, no receipt',
      { ...snapshot, phase: 'resolution_pending', receipt: null }],
  ]) {
    const restored = restoreArbiter(JSON.parse(JSON.stringify(tampered)));
    assert.equal(restored, null, `${label} must refuse the whole record`);
  }

  // The honest record still restores, and stays frozen.
  const good = restoreArbiter(JSON.parse(JSON.stringify(snapshot)));
  assert.equal(good.receipt.outcome, 'expired');
  assert.equal(submitCandidate(good, report('payload_destroyed', 'attacker', 50)).reason,
    'journal_frozen');
  assert.equal(prepareTerminal(good, 51).receipt.receiptId, snapshot.receipt.receiptId);
});

test('an undecided record with a dropped receipt still restores normally', () => {
  // Fail-closed must not become fail-paranoid: a genuinely undecided arbiter has no receipt by
  // definition, and refusing it would strand every mid-flight heist on load.
  const pending = arb();
  applyTransition(pending, 'launched');
  submitCandidate(pending, report('possession', 'massline', 10));
  const snapshot = serializeArbiter(pending);
  assert.equal(snapshot.receipt, null);
  const restored = restoreArbiter(JSON.parse(JSON.stringify(snapshot)));
  assert.ok(restored, 'a pending arbiter must survive a save');
  assert.equal(restored.phase, 'launched');
  assert.equal(restored.candidates.length, 1);
});

test('ORDERING PRECONDITION: submit before you step, or the report is recorded as stale', () => {
  // Selection is order-independent; ADMISSION is not. This pins the footgun PQ-019C must avoid.
  const correct = arb();
  submitCandidate(correct, report('fenced_success', 'fence_receiver', 40)); // submit ...
  const decided = stepArbiter(correct, 41); // ... then step
  assert.equal(decided.receipt.outcome, 'fenced_success');

  const wrong = arb();
  stepArbiter(wrong, 41); // step first (e.g. a consumer that polls after stepping) ...
  const late = submitCandidate(wrong, report('fenced_success', 'fence_receiver', 40)); // ... then submit
  assert.equal(late.accepted, false);
  assert.equal(late.reason, 'stale_tick');
  assert.equal(stepArbiter(wrong, 42).receipt, null, 'the heist would fall through with no terminal');
  // The drop is diagnosable rather than silent — that is what makes the precondition enforceable.
  assert.equal(wrong.rejected.at(-1).reason, 'stale_tick');
  assert.equal(wrong.rejected.at(-1).causalTick, 40);
});

test('causalTick is a PRIVILEGE: an under-stamped late report outranks a newer true fact', () => {
  // Documents precondition 2. C must stamp from the causing event, never a cached clock.
  const a = arb();
  submitCandidate(a, report('payload_destroyed', 'combat', 100)); // the true, newer fact
  submitCandidate(a, report('abandoned', 'sloppy_reporter', 60)); // stamped too early
  assert.equal(stepArbiter(a, 101).receipt.outcome, 'abandoned',
    'an earlier stamp wins even against the strongest precedence — stamp honestly');
});

test('restore refuses a record that is not this schema', () => {
  assert.equal(restoreArbiter(null), null);
  assert.equal(restoreArbiter({ schema: 'something.else.v1' }), null);
  assert.equal(restoreArbiter({ ...serializeArbiter(arb()), missionId: '' }), null);
  assert.equal(serializeArbiter(arb()).schema, HEIST_ARBITER_SCHEMA);
});

test('the module is pure: no candidate, receipt, or effect depends on wall time or randomness', () => {
  // Two independently constructed runs, separated by real elapsed time, must agree byte for byte.
  const build = () => {
    const a = arb();
    applyTransition(a, 'launched');
    submitCandidate(a, report('possession', 'massline', 10));
    stepArbiter(a, 11);
    submitCandidate(a, report('fenced_success', 'fence_receiver', 20));
    const { receipt } = prepareTerminal(a, 21);
    recordEffect(a, receipt.effectKeys.missionSettlement, { effectId: 'settle', tick: 21 });
    commitTerminal(a, receipt.receiptId);
    return JSON.stringify(serializeArbiter(a));
  };
  const first = build();
  const start = Date.now();
  while (Date.now() === start) { /* cross a real millisecond boundary */ }
  assert.equal(build(), first);
});
