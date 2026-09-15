// BREAKAWAY — fail-closed receiver settlement gate, promoted from the BREAKAWAY implementation packet.
//
// A GATE, not a terminal arbiter or an economy writer. Its inputs are replies from the single-writer
// physical receiver owner (`heistFacilities`), never user-supplied claims. A delivery may settle only
// on a fresh matching commit, or on an idempotent replay backed by a matching durable commit record.
// A bare `already_committed` string is not proof.

const MATCH_KEYS = Object.freeze(['receiptId', 'payloadStableId', 'facilityId']);

function matches(actual, expected) {
  return !!actual && MATCH_KEYS.every((k) => (
    typeof expected?.[k] === 'string' && expected[k].length > 0 && actual[k] === expected[k]
  ));
}

export function receiverCommitGate(expected, reply, durableCommit = null) {
  if (reply?.committed === true && reply?.handoff?.status === 'committed' && matches(reply.handoff, expected)) {
    return Object.freeze({ maySettle: true, replayed: false, reason: 'physical_commit' });
  }
  if (reply?.reason === 'already_committed' && reply?.handoff?.status === 'committed'
    && matches(reply.handoff, expected)
    && durableCommit?.status === 'committed' && matches(durableCommit, expected)) {
    return Object.freeze({ maySettle: true, replayed: true, reason: 'durable_physical_commit' });
  }
  return Object.freeze({ maySettle: false, replayed: false, reason: 'physical_commit_required' });
}

/**
 * Re-selection is forbidden after any irreversible delivery effect. Existing law incidents are never
 * rolled back. An ingredient for an owner-side withdrawal decision; it does not reach into any record.
 */
export function canWithdrawUncommittedDelivery({
  receiptStatus, receiverConsumed, missionSettled, rewardApplied, factionOutcomeApplied,
}) {
  return receiptStatus === 'prepared' && receiverConsumed === false && missionSettled === false
    && rewardApplied === false && factionOutcomeApplied === false;
}
