import { add, clamp, compare, distance, dot, finite, mix, point, unit, unitValue } from './math.js';

export const MIND_VERBS = Object.freeze(['press', 'flank_left', 'flank_right', 'bait', 'cover', 'punish', 'withdraw', 'panic', 'regroup']);
const EPS = 1e-9;
const retreating = (peer) => peer.verb === 'withdraw' || peer.verb === 'panic' || (peer.verb === 'bait' && peer.phase === 'break');

export function updateMorale(record, obs, peers, dt, tuning) {
  const support = Math.min(1, Math.max(obs.friends.length, peers.length) / 3);
  const threat = obs.targeted ? 1 : obs.target ? 0.35 : 0;
  const targetFear = unitValue(
    (1 - obs.hull) * tuning.injuryWeight + threat * tuning.threatWeight
    + obs.incoming * 0.28 + obs.casualties * 0.30 + record.shock
    + (1 - support) * tuning.isolationWeight
    - record.traits.courage * tuning.confidenceWeight - support * tuning.allyCalm,
  );
  const rate = targetFear > record.fear ? tuning.fearRise : tuning.fearFall;
  record.fear += clamp(targetFear - record.fear, -rate * dt, rate * dt);
  record.fear = unitValue(record.fear);
  record.support = support;
}

/** A pilot may only challenge a *received* claim, never inspect another pilot's mind. */
function claimedBySuperior(record, peers, verb, targetId, chargeId = null) {
  return peers.some((peer) => peer.targetId === targetId && peer.verb === verb
    && (chargeId == null || peer.chargeId === chargeId)
    && (peer.bid > record.initiative + EPS || (Math.abs(peer.bid - record.initiative) <= EPS && compare(peer.key, record.key) < 0)));
}

/** An opportunity must be justified by visible velocity, not knowledge of the opponent policy. */
export function readPursuit(obs, peers, tuning) {
  if (!obs.target) return null;
  const velocity = obs.target.vel;
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < tuning.pursuitSpeed) return null;
  const heading = unit(velocity.x, velocity.z);
  for (const peer of peers) {
    if (!retreating(peer) || peer.targetId !== obs.target.id) continue;
    // A turn across the lane is not commitment. Visible target-lock evidence must agree.
    if (obs.target.targetId !== peer.id) continue;
    if (peer.verb === 'panic') continue; // a panic is not a coordinated lure
    const line = unit(peer.pos.x - obs.target.pos.x, peer.pos.z - obs.target.pos.z);
    const alignment = dot(heading, line);
    // An independent read: target is physically chasing the departing wingmate and is reachable.
    if (alignment < tuning.pursuitAlignment || obs.range > tuning.punishReach) continue;
    if (distance(peer.pos, obs.target.pos) < 35) continue;
    return { peer, alignment, speed };
  }
  return null;
}

export function choosePlan(record, obs, peers, now, tuning) {
  const targetId = obs.target?.id ?? obs.known?.id ?? null;
  const current = record.plan;
  if (obs.disabled) return { verb: 'regroup', score: 2, reason: 'drive_unavailable', charge: null };
  if (obs.authority === 'retreat' || obs.hull <= tuning.criticalHull) {
    return { verb: 'withdraw', score: 2, reason: obs.authority === 'retreat' ? 'retreat_order' : 'critical_hull', charge: null };
  }
  if (record.fear >= tuning.panicFear && record.traits.discipline < 0.46) {
    return { verb: 'panic', score: 1.8, reason: 'discipline_broken', charge: null };
  }
  if (!obs.target) return { verb: 'regroup', score: 1.4, reason: 'contact_not_current', charge: null };

  const candidates = [];
  const put = (verb, score, reason, charge = null, read = null) => candidates.push({ verb, score, reason, charge, read });
  const t = record.traits;
  const underPressure = obs.targeted || obs.incoming > 0 || record.shock > 0.15;
  const sameTargetPeers = peers.filter((peer) => peer.targetId === targetId);
  const liveSupport = Math.max(obs.friends.length, sameTargetPeers.length);
  const fixExists = sameTargetPeers.some((peer) => peer.verb === 'press' || peer.verb === 'cover');
  const roleCost = (verb, chargeId = null) => claimedBySuperior(record, peers, verb, targetId, chargeId) ? tuning.occupiedLanePenalty : 0;
  put('press', tuning.pressBase + t.aggression * tuning.aggressionWeight
    + (obs.targeted ? tuning.fixationBonus : 0) + (!fixExists ? 0.17 : 0)
    - record.fear * 0.24 - roleCost('press'), 'hold_attention');
  if (liveSupport > 0 && obs.hull > tuning.lowHull) {
    for (const sign of [-1, 1]) {
      const verb = sign < 0 ? 'flank_left' : 'flank_right';
      put(verb, tuning.flankBase + t.discipline * tuning.teamworkWeight
        + (fixExists ? tuning.flankReadyBonus : 0) + (sign === record.side ? 0.03 : 0)
        - record.fear * 0.18 - roleCost(verb), 'open_crossfire_lane');
    }
  }
  if (liveSupport >= 2 && obs.targeted && obs.hull > tuning.lowHull + 0.04
      && t.cunning > 0.55 && ((current?.verb === 'bait' && now < current.endsAt) || now + EPS >= record.baitReadyAt)) {
    put('bait', tuning.baitBase + t.cunning * tuning.cunningWeight + tuning.attentionBonus
      + (obs.hull < 0.75 ? 0.12 : 0) - roleCost('bait'), 'offer_a_chase');
  }
  for (const peer of sameTargetPeers) {
    if (!retreating(peer) || obs.hull <= tuning.lowHull + 0.06 || record.fear > tuning.withdrawFear) continue;
    // Panic gets aid, not magical tactical cooperation. A damaged friend is more urgent than a feint.
    put('cover', tuning.coverBase + t.loyalty * tuning.loyaltyWeight
      + (peer.hull <= tuning.lowHull ? tuning.casualtyBonus : 0.06)
      - roleCost('cover', peer.id), 'cover_departing_wingmate', peer);
  }
  const read = readPursuit(obs, sameTargetPeers, tuning);
  if (read && obs.hull > tuning.lowHull && record.fear < tuning.withdrawFear) {
    put('punish', tuning.punishBase + t.cunning * 0.15 - roleCost('punish'), 'read_visible_pursuit', read.peer, read);
  }
  put('withdraw', tuning.withdrawBase + record.fear * tuning.survivalWeight
    + (obs.hull <= tuning.lowHull ? 0.74 : 0) + (obs.energy < 0.15 ? 0.15 : 0),
  obs.hull <= tuning.lowHull ? 'hull_preservation' : 'pressure_exceeds_resolve');

  // A readable mistake: an undisciplined aggressor finishes a short commitment despite a
  // newly-bad situation. Critical-hull/ordered retreat above always wins; no random aim wobble.
  const stubborn = current && (current.verb === 'press' || current.verb.startsWith('flank'))
    && t.discipline < 0.40 && t.aggression > 0.66 && underPressure
    && now - current.startedAt < tuning.stubbornDuration;
  if (stubborn) {
    const held = candidates.find((candidate) => candidate.verb === current.verb);
    if (held) held.score += 0.65;
  }
  for (const candidate of candidates) {
    if (current?.verb === candidate.verb) candidate.score += tuning.retentionBonus;
  }
  candidates.sort((a, b) => b.score - a.score || compare(a.verb, b.verb)
    || compare(a.charge?.key || '', b.charge?.key || ''));
  record.scores = candidates.map(({ verb, score, reason, charge }) => ({ verb, score, reason, chargeId: charge?.id ?? null }));
  const best = candidates[0];
  const held = current && candidates.find((candidate) => candidate.verb === current.verb
    && (candidate.charge?.id ?? null) === current.chargeId);
  const survival = best.verb === 'withdraw' && (obs.hull <= tuning.lowHull || record.fear >= tuning.withdrawFear);
  const yielding = current && claimedBySuperior(record, peers, current.verb, targetId, current.chargeId);
  const expired = current && now + EPS >= current.endsAt;
  if (!survival && !yielding && !expired && held && best.verb !== held.verb) {
    const committed = now - current.startedAt < tuning.minCommit * (0.75 + t.patience * 0.5);
    if (committed || best.score < held.score + tuning.switchMargin) return { ...held, reason: stubborn ? 'overcommitted_under_pressure' : 'commitment_hysteresis' };
  }
  return stubborn && best.verb === current.verb
    ? { ...best, reason: 'overcommitted_under_pressure' } : best;
}

export function makePlan(record, choice, obs, peers, now, tuning) {
  const toward = obs.known ? unit(obs.known.pos.x - obs.pos.x, obs.known.pos.z - obs.pos.z) : unit(-obs.vel.x, -obs.vel.z);
  const side = choice.verb === 'flank_left' ? -1 : choice.verb === 'flank_right' ? 1 : record.side;
  const axis = point(toward);
  const perpendicular = { x: -axis.z * side, z: axis.x * side };
  const goal = add(add(obs.pos, axis, -tuning.breakDistance), perpendicular, 32);
  // A covering ship states its own retreat lane. This is not a centroid command to the wing.
  const fallback = peers.find((peer) => peer.verb === 'cover' && peer.chargeId === obs.id);
  if (fallback && dot(unit(fallback.pos.x - obs.pos.x, fallback.pos.z - obs.pos.z), axis) < 0) {
    goal.x = fallback.pos.x - axis.x * tuning.breakDistance * 0.6;
    goal.z = fallback.pos.z - axis.z * tuning.breakDistance * 0.6;
  }
  const verb = choice.verb;
  const duration = verb === 'bait' ? tuning.offerDuration + tuning.baitDuration
    : verb.startsWith('flank') ? tuning.flankDuration
    : verb === 'punish' ? tuning.punishDuration
    : verb === 'cover' ? tuning.coverDuration
    : verb === 'panic' ? tuning.panicDuration
    : verb === 'withdraw' ? 5.5 : tuning.minCommit * 2;
  const plan = {
    serial: ++record.planSerial, verb, targetId: obs.known?.id ?? null,
    chargeId: choice.charge?.id ?? null, startedAt: now, phaseAt: now, endsAt: now + duration,
    phase: verb === 'bait' ? 'offer' : verb.startsWith('flank') || verb === 'punish' ? 'tell'
      : verb === 'withdraw' || verb === 'panic' ? 'break' : 'engage',
    axis, side, anchor: point(obs.pos), fallback: goal,
    intercept: obs.target ? add(obs.target.pos, obs.target.vel, 0.65) : point(obs.pos),
    reason: choice.reason, score: choice.score,
  };
  if (verb === 'bait') record.baitReadyAt = now + tuning.offerDuration + tuning.baitDuration + tuning.baitCooldown;
  return plan;
}

export function advancePlan(record, obs, now, tuning) {
  const plan = record.plan;
  if (!plan) return false;
  const before = plan.phase;
  if (plan.verb === 'bait' && plan.phase === 'offer' && now - plan.startedAt + EPS >= tuning.offerDuration) {
    plan.phase = 'break'; plan.phaseAt = now;
  }
  if ((plan.verb.startsWith('flank') || plan.verb === 'punish') && plan.phase === 'tell'
    && now - plan.startedAt + EPS >= tuning.telegraph) { plan.phase = 'cross'; plan.phaseAt = now; }
  if (plan.verb === 'withdraw') {
    const danger = obs.targeted || obs.incoming > 0 || record.fear > tuning.recoverFear
      || (obs.target && obs.range < obs.preferredRange * 1.5);
    // Fallbacks are waypoints, not an obligation to stop in an active firing lane.
    if (danger && (plan.phase === 'rally' || distance(obs.pos, plan.fallback) <= tuning.arrivalRadius * 2)) {
      plan.fallback = add(obs.pos, plan.axis, -tuning.breakDistance);
      plan.phase = 'break'; plan.phaseAt = now;
      plan.endsAt = Math.max(plan.endsAt, now + tuning.recoveryDuration);
    } else if (!danger && plan.phase === 'break' && distance(obs.pos, plan.fallback) <= tuning.arrivalRadius) {
      plan.phase = 'rally'; plan.phaseAt = now; plan.endsAt = now + tuning.recoveryDuration;
    }
  }
  return before !== plan.phase;
}

/** Tactical waypoints only. The SG-02 planner remains the authority on forces and collision. */
export function steerPlan(record, obs, peers, now, tuning) {
  const plan = record.plan;
  if (!plan) return null;
  const target = obs.target || obs.known;
  const axis = plan.axis;
  const perpendicular = { x: -axis.z * plan.side, z: axis.x * plan.side };
  let goal = point(obs.pos);
  let maneuverKind = 'formation';
  let fire = false;
  let faceTarget = true;
  let ownManeuver = true;
  const range = obs.preferredRange;
  switch (plan.verb) {
    case 'press':
      goal = target ? add(target.pos, axis, -range) : point(obs.formationSlot);
      maneuverKind = 'orbit'; fire = true; ownManeuver = false; break;
    case 'flank_left': case 'flank_right':
      goal = target ? add(add(target.pos, axis, -range * 0.48), perpendicular, tuning.flankOffset) : point(plan.anchor);
      fire = plan.phase === 'cross'; break;
    case 'bait':
      goal = plan.phase === 'offer' ? add(plan.anchor, axis, 55) : point(plan.fallback);
      faceTarget = plan.phase === 'offer'; maneuverKind = plan.phase === 'offer' ? 'formation' : 'retreat'; break;
    case 'cover': {
      const charge = peers.find((peer) => peer.id === plan.chargeId);
      // Radio establishes the intent; local vision refines the geometry, never the target's health.
      const visibleCharge = obs.friends.find((friend) => friend.id === plan.chargeId);
      const chargePos = visibleCharge?.pos || charge?.pos || plan.anchor;
      const threat = target?.pos;
      const lane = threat ? unit(chargePos.x - threat.x, chargePos.z - threat.z) : axis;
      const laneSide = { x: -lane.z * plan.side, z: lane.x * plan.side };
      // A loyal guardian accepts real exposure. This is geometric interposition, not aggro magic.
      const urgent = charge && charge.hull <= tuning.lowHull && record.traits.loyalty >= 0.75;
      goal = threat ? add(mix(threat, chargePos, 0.68), laneSide, urgent ? 0 : tuning.coverOffset) : point(obs.formationSlot);
      fire = true; break;
    }
    case 'punish': goal = add(plan.intercept, perpendicular, 45); fire = plan.phase === 'cross'; break;
    case 'withdraw': goal = point(plan.fallback); faceTarget = plan.phase === 'rally';
      maneuverKind = plan.phase === 'rally' ? 'formation' : 'retreat'; break;
    case 'panic': goal = point(plan.fallback); faceTarget = false; maneuverKind = 'retreat'; break;
    case 'regroup': {
      const anchor = peers.find((peer) => peer.verb === 'cover' || peer.verb === 'press');
      goal = anchor ? add(anchor.pos, axis, -90) : point(obs.formationSlot);
      faceTarget = false; break;
    }
  }
  return {
    entityId: obs.id, serial: plan.serial, verb: plan.verb, phase: plan.phase, reason: plan.reason,
    targetId: obs.target?.id ?? null, chargeId: plan.chargeId,
    goal, maneuverKind, faceTarget, ownManeuver,
    fireAllowed: fire && !!obs.target && obs.authority === 'combat' && !obs.disabled
      && obs.energy > 0.02 && obs.heat < 0.98,
    emergency: plan.verb === 'panic' || obs.hull <= tuning.criticalHull || obs.authority === 'retreat',
    fear: record.fear, confidence: obs.target?.confidence ?? 0,
    startedAt: plan.startedAt, phaseAt: plan.phaseAt,
    tellUntil: plan.startedAt + tuning.telegraph,
    validUntil: Math.min(now + tuning.maxSensorAge, obs.validUntil),
  };
}
