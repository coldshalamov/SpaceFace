// OPENING-1b training wheels (lead decision): the tutorial's first loose rock cannot strain-break its
// line until the pilot has thrown once. The flag is owned by onboarding (state.onboarding.firstThrowWheels,
// set when the rescue cast is staged, cleared on the first massline:throw). It only withholds the
// strain/overload break reasons - cut, release, target loss and every other end still work, so the
// pilot can always throw. Pure read; the tether rules (combat/attachments.js) consult it.
export const TRAINING_WHEEL_BREAK_REASONS = Object.freeze(new Set([
  'threshold', 'brace_overload', 'overload', 'sustained-overload', 'catastrophic-overload', 'snap',
  // Seen in the first measured opening: the line snapped as an over-class load, then a passing NPC tractor took it.
  'line_overclass_snap', 'npc_tractor_phase',
]));

export function trainingWheelsHold(state, targetEntity, reason) {
  const ob = state && state.onboarding;
  if (!ob || ob.active !== true || ob.finished === true || ob.firstThrowSeen === true) return false;
  if (ob.beatDoneAt && ob.beatDoneAt.raid != null) return false; // the raid is the next lesson: wheels are long off
  if (!TRAINING_WHEEL_BREAK_REASONS.has(String(reason))) return false;
  return !!(targetEntity && targetEntity.data && targetEntity.data.rescueRole === 'rock');
}
