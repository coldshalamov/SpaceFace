// BREAKAWAY — the fail-closed receiver settlement gate (ported from the BREAKAWAY packet suite).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  receiverCommitGate,
  canWithdrawUncommittedDelivery,
} from '../src/physicalCargo/breakaway/settlementGate.js';

const expected = { receiptId: 'receipt1', payloadStableId: 'payload_sp07', facilityId: 'fence_receiver' };
const handoff = { ...expected, status: 'committed' };

test('delivery requires a matching successful physical commit', () => {
  assert.equal(receiverCommitGate(expected, { committed: true, handoff }).maySettle, true);
});

test('a refused prepare is never permission to pay', () => {
  assert.equal(receiverCommitGate(expected, { prepared: false, reason: 'payload_absent' }).maySettle, false);
});

test('a failed commit is never permission to pay', () => {
  assert.equal(receiverCommitGate(expected, { committed: false, reason: 'payload_absent' }).maySettle, false);
});

test('receipt id reuse for a different load is rejected', () => {
  const other = { committed: true, handoff: { ...handoff, payloadStableId: 'other' } };
  assert.equal(receiverCommitGate(expected, other).maySettle, false);
});

test('a duplicate handoff needs a matching durable owner acknowledgement', () => {
  const reply = { committed: false, reason: 'already_committed', handoff };
  assert.equal(receiverCommitGate(expected, reply).maySettle, false);
  const replay = receiverCommitGate(expected, reply, handoff);
  assert.equal(replay.maySettle, true);
  assert.equal(replay.replayed, true);
});

test('unknown, null and malformed acknowledgements fail closed', () => {
  for (const reply of [undefined, null, {}, true, { committed: true }]) {
    assert.equal(receiverCommitGate(expected, reply).maySettle, false);
  }
  assert.equal(receiverCommitGate({}, { committed: true, handoff }).maySettle, false,
    'an empty expectation cannot match anything');
});

test('the uncommitted withdrawal guard fails if any irreversible delivery effect occurred', () => {
  const safe = {
    receiptStatus: 'prepared', receiverConsumed: false, missionSettled: false,
    rewardApplied: false, factionOutcomeApplied: false,
  };
  assert.equal(canWithdrawUncommittedDelivery(safe), true);
  for (const key of ['receiverConsumed', 'missionSettled', 'rewardApplied', 'factionOutcomeApplied']) {
    assert.equal(canWithdrawUncommittedDelivery({ ...safe, [key]: true }), false, key);
  }
  assert.equal(canWithdrawUncommittedDelivery({ ...safe, receiptStatus: 'committed' }), false);
});
