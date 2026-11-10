// Counterweight Circuit — transparent medals, personal bests, one-time rewards.
//
// Every result states ONE concrete reason: arrival speed, pod damage, a missed
// gate, or an improved time. No unexplained composite scores. Medals are pure
// functions of elapsed time and measured condition; the one-time completion
// credit settlement is requested here; the economy owner confirms payment.

const MEDAL_ORDER = ['none', 'bronze', 'silver', 'gold'];

export function medalForTime(def, timeS) {
  if (!def || !Number.isFinite(timeS)) return 'none';
  const m = def.medals || {};
  if (timeS <= m.gold) return 'gold';
  if (timeS <= m.silver) return 'silver';
  if (timeS <= m.bronze) return 'bronze';
  return 'none'; // a real completion slower than bronze still unlocks
}

function medalRank(medal) { return MEDAL_ORDER.indexOf(medal); }
export function medalAtMost(medal, cap) {
  return medalRank(medal) > medalRank(cap) ? cap : medal;
}

/**
 * Final medal for a completed attempt — the time medal, capped by measured
 * condition where the event authors a condition ceiling (FRAGILE FREIGHT).
 * reason/reasonDetail are the one concrete explanation on the result card.
 */
export function medalForCompletion(def, attempt, conditionInput) {
  const timeMedal = medalForTime(def, attempt.elapsedS);
  let medal = timeMedal, reason = 'time', detail = attempt.elapsedS;
  const measured = conditionInput ?? attempt.mem?.conditions;
  let condition = typeof measured === 'number' ? measured : null;
  if (def.id === 'split_decision') {
    const a = measured?.load_a, b = measured?.load_b;
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return { medal: 'none', reason: 'condition_unconfirmed', reasonDetail: null, timeS: attempt.elapsedS };
    }
    condition = Math.min(a, b);
  } else if (def.id === 'fragile_freight' && measured && typeof measured === 'object') {
    condition = measured.pod;
  }
  const caps = def.id === 'split_decision' ? {gold: .95, silver: .80} : def.conditionCaps;
  if (caps && Number.isFinite(condition)) {
    const cap = condition < caps.silver ? 'bronze' : condition < caps.gold ? 'silver' : 'gold';
    if (medalRank(medal) > medalRank(cap)) {
      medal = cap; reason = def.id === 'split_decision' ? 'handling_damage' : 'pod_damage'; detail = condition;
    }
  } else if (caps && !Number.isFinite(condition)) {
    return { medal: 'none', reason: 'condition_unconfirmed', reasonDetail: null, timeS: attempt.elapsedS };
  }
  if (timeMedal === 'none') { reason = 'slow_arrival'; detail = attempt.elapsedS; }
  return { medal, reason, reasonDetail: detail, timeS: attempt.elapsedS };
}

export function failureReason(attempt) {
  const map = {
    destroyed: 'load_destroyed',
    missed_gate: 'missed_gate',
    missed: 'missed_window',
    lost: 'load_lost',
    entered_basin: 'entered_basin_ring',
    left_venue: 'left_venue',
    cancelled: 'cancelled',
    interrupted: 'interrupted_unconfirmed',
  };
  return map[attempt.reason] || attempt.reason || 'failed';
}

/**
 * Apply a finished attempt to the per-event record row. Returns the result card
 * the runtime presents plus a stable reward request when settlement is due.
 * The economy caller owns idempotent payment and marks paid after acceptance.
 */
export function applyResultToRecord(record, def, attempt, conditionFrac) {
  const out = { record, result: null, paid: false };
  if (!record) return out;
  const completed = attempt.phase === 'complete';
  const attemptKey = `${attempt.eventId}:${attempt.attemptId}`;
  if (record.lastAttemptKey === attemptKey) { out.result = record.lastResult || null; return out; }
  record.lastAttemptKey = attemptKey;

  if (completed) {
    const scoring = medalForCompletion(def, attempt, conditionFrac);
    const prevBest = record.bestTimeS;
    const isBest = !Number.isFinite(prevBest) || scoring.timeS < prevBest;
    const reason = isBest && Number.isFinite(prevBest) && scoring.reason === 'time' ? 'improved_time' : scoring.reason;
    record.completions += 1;
    record.lastTimeS = scoring.timeS;
    record.lastMedal = scoring.medal;
    record.lastAt = attempt.finishedAt;
    if (isBest) {
      record.bestTimeS = scoring.timeS;
      record.bestMedal = scoring.medal;
      out.improvedBest = true;
    }
    if (medalRank(scoring.medal) > medalRank(record.bestMedal) && !isBest) {
      record.bestMedal = scoring.medal;
    }
    out.result = {
      eventId: def.id, outcome: 'complete', medal: scoring.medal,
      timeS: scoring.timeS, reason, reasonDetail: reason === 'improved_time' ? prevBest : scoring.reasonDetail,
      practice: attempt.practice === true,
      arrivalSpeed: Number.isFinite(attempt.mem?.arrivalSpeed) ? attempt.mem.arrivalSpeed : null,
    };
    // Request settlement; only the economy-owning caller may mark paid after
    // an accepted idempotent grant. The stable key identifies the event award.
    if (!attempt.practice && !record.paid && def.rewardCr > 0) {
      out.rewardRequested = true;
      out.rewardCr = def.rewardCr;
      out.rewardKey = `counterweight:first-completion:${def.id}`;
    }
  } else {
    out.result = {
      eventId: def.id, outcome: attempt.phase, medal: null,
      timeS: attempt.elapsedS, reason: failureReason(attempt), reasonDetail: attempt.reasonDetail,
      practice: attempt.practice === true,
    };
  }
  record.lastResult = out.result;
  return out;
}

export function freshEventRecord() {
  return {
    completions: 0, attempts: 0,
    bestTimeS: null, bestMedal: null,
    lastTimeS: null, lastMedal: null, lastAt: null,
    paid: false, lastAttemptKey: null, lastResult: null,
  };
}

/** The 'next useful skill' line shown on records/results — authored per event. */
export function nextSkillFor(def) {
  return def.nextSkill || null;
}
