// Editorial grammar. Each shape cites logged events that share a causality id.
// Distance between samples is never consulted.

import { SHAPE_IDS, actorByRole, sameActor } from './contract.js';

export const SHAPE_LABELS = Object.freeze({
  chain_collision: 'Chain collision',
  impossible_tether_cut: 'Impossible tether cut',
  accidental_collateral: 'Accidental collateral',
  dramatic_lawful_intervention: 'Dramatic lawful intervention',
  giant_sling: 'Giant sling',
  last_second_rescue: 'Last-second rescue',
  near_miss: 'Near miss',
  volatile_cargo_catastrophe: 'Volatile cargo catastrophe',
  moving_blockade: 'Moving blockade',
  reversal: 'Reversal',
  freak_ricochet: 'Freak ricochet',
  unplanned_recovery: 'Unplanned recovery',
});

const CAUSE_KINDS = new Set(['kill', 'collision', 'sling', 'shot', 'tether_cut']);
const SLING_FOLLOW = new Set(['collision', 'kill']);
const CARGO_TRIGGER = new Set(['collision', 'tether_cut', 'kill', 'shot', 'sling']);
const BLOCKADE_ATTEMPT = new Set(['transit', 'collision', 'reversal']);
const REVERSAL_OUTCOME = new Set(['kill', 'escape']);
const RICOCHET_STRIKE = new Set(['collision', 'kill']);

function subjectOf(event) {
  return actorByRole(event, 'subject');
}

function actorOf(event) {
  return actorByRole(event, 'actor');
}

function byTick(a, b) {
  return a.tick - b.tick || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function groupByCausality(events) {
  const groups = new Map();
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const key = event.causalityId || '';
    const list = groups.get(key);
    if (list) list.push(event);
    else groups.set(key, [event]);
  }
  return groups;
}

function priorOnChain(events, causalityId, tick) {
  const out = [];
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.causalityId === causalityId && event.tick < tick) out.push(event);
  }
  out.sort(byTick);
  return out;
}

function laterOnChain(events, causalityId, tick, within) {
  const out = [];
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.causalityId !== causalityId || event.tick < tick) continue;
    if (within != null && event.tick - tick > within) continue;
    out.push(event);
  }
  out.sort(byTick);
  return out;
}

function clarity(event, subject) {
  if (!event.causalityId || !subject) return 0;
  return 1;
}

function reject(shape, reason, events) {
  const ids = events.map((event) => event.id);
  const tick = events.length ? events[events.length - 1].tick : 0;
  return { shape, reason, eventIds: ids, tick };
}

function matchOf(shape, payoffEvent, fields) {
  const subject = fields.subject || subjectOf(payoffEvent);
  const secondary = fields.secondary || actorOf(payoffEvent);
  return {
    shape,
    payoffTick: fields.payoffTick != null ? fields.payoffTick : payoffEvent.tick,
    causalityId: payoffEvent.causalityId,
    subject,
    secondary,
    payoff: fields.payoff,
    causalClarity: fields.causalClarity != null ? fields.causalClarity : clarity(payoffEvent, subject),
    reason: fields.reason,
    eventIds: fields.eventIds,
  };
}

function matchChain(events) {
  const collisions = events.filter((event) => event.kind === 'collision' && event.payload.impact === true);
  const matches = [];
  const rejects = [];
  const groups = groupByCausality(collisions);
  groups.forEach((list, causalityId) => {
    const ordered = list.slice().sort(byTick);
    if (!causalityId) {
      rejects.push(reject('chain_collision', 'chain_collision:no-causality', ordered));
      return;
    }
    const subjects = [];
    for (let i = 0; i < ordered.length; i += 1) {
      const subject = subjectOf(ordered[i]);
      if (subject && !subjects.some((existing) => sameActor(existing, subject))) subjects.push(subject);
    }
    if (ordered.length < 2 || subjects.length < 2) {
      rejects.push(reject('chain_collision', 'chain_collision:single-contact', ordered));
      return;
    }
    const payoff = ordered[ordered.length - 1];
    matches.push(matchOf('chain_collision', payoff, {
      subject: subjectOf(payoff),
      secondary: subjectOf(ordered[0]),
      payoff: Math.min(1, 0.72 + 0.08 * Math.min(3, ordered.length - 2)),
      reason: `Logged collisions ${ordered.map((event) => event.id).join(', ')} share causality ${causalityId}.`,
      eventIds: ordered.map((event) => event.id),
    }));
  });
  return { matches, rejects };
}

function matchTether(events) {
  const cuts = events.filter((event) => event.kind === 'tether_cut');
  const matches = [];
  const rejects = [];
  for (let i = 0; i < cuts.length; i += 1) {
    const event = cuts[i];
    const tension = event.payload.tension;
    const rating = event.payload.rating;
    const impossible = event.payload.impossible === true
      || (typeof tension === 'number' && typeof rating === 'number' && rating > 0 && tension > rating);
    if (!impossible) {
      rejects.push(reject('impossible_tether_cut', 'tether_cut:not-impossible', [event]));
      continue;
    }
    if (!event.causalityId) {
      rejects.push(reject('impossible_tether_cut', 'tether_cut:no-causality', [event]));
      continue;
    }
    const ratio = typeof tension === 'number' && typeof rating === 'number' && rating > 0
      ? tension / rating
      : 2;
    matches.push(matchOf('impossible_tether_cut', event, {
      payoff: ratio >= 2 ? 0.9 : 0.75,
      reason: `Logged tether cut ${event.id} on causality ${event.causalityId} exceeds the logged rating.`,
      eventIds: [event.id],
    }));
  }
  return { matches, rejects };
}

function matchCollateral(events) {
  const rows = events.filter((event) => event.kind === 'collateral');
  const matches = [];
  const rejects = [];
  for (let i = 0; i < rows.length; i += 1) {
    const event = rows[i];
    if (event.payload.intended !== false) {
      rejects.push(reject('accidental_collateral', 'collateral:intended-target', [event]));
      continue;
    }
    if (event.payload.playerCaused !== true) {
      rejects.push(reject('accidental_collateral', 'collateral:not-player-caused', [event]));
      continue;
    }
    if (!event.causalityId) {
      rejects.push(reject('accidental_collateral', 'collateral:no-cause', [event]));
      continue;
    }
    const prior = priorOnChain(events, event.causalityId, event.tick);
    const cause = prior.find((item) => CAUSE_KINDS.has(item.kind));
    if (!cause) {
      rejects.push(reject('accidental_collateral', 'collateral:no-cause', [event]));
      continue;
    }
    const victim = subjectOf(event);
    const causeSubject = subjectOf(cause);
    if (victim && causeSubject && sameActor(victim, causeSubject)) {
      rejects.push(reject('accidental_collateral', 'collateral:intended-target', [event, cause]));
      continue;
    }
    matches.push(matchOf('accidental_collateral', event, {
      secondary: causeSubject || actorOf(cause),
      payoff: 0.88,
      reason: `Logged collateral ${event.id} follows ${cause.id} on causality ${event.causalityId}; the victim was not the logged target.`,
      eventIds: [cause.id, event.id],
    }));
  }
  return { matches, rejects };
}

function matchLaw(events) {
  const rows = events.filter((event) => event.kind === 'lawful_intervention');
  const matches = [];
  const rejects = [];
  for (let i = 0; i < rows.length; i += 1) {
    const event = rows[i];
    const authority = event.payload.authority;
    if (typeof authority !== 'string' || !authority) {
      rejects.push(reject('dramatic_lawful_intervention', 'lawful:no-authority', [event]));
      continue;
    }
    if (!event.causalityId) {
      rejects.push(reject('dramatic_lawful_intervention', 'lawful:no-preceding-cause', [event]));
      continue;
    }
    const prior = priorOnChain(events, event.causalityId, event.tick);
    const cause = prior.find((item) => item.kind === 'wanted' || item.kind === 'scan' || item.kind === 'kill');
    if (!cause) {
      rejects.push(reject('dramatic_lawful_intervention', 'lawful:no-preceding-cause', [event]));
      continue;
    }
    const level = typeof event.payload.level === 'number' ? event.payload.level : 0;
    matches.push(matchOf('dramatic_lawful_intervention', event, {
      secondary: subjectOf(cause) || actorOf(cause),
      payoff: Math.min(1, 0.7 + Math.min(0.2, level / 20)),
      reason: `Logged intervention ${event.id} (${authority}) follows ${cause.kind} ${cause.id} on causality ${event.causalityId}.`,
      eventIds: [cause.id, event.id],
    }));
  }
  return { matches, rejects };
}

function matchSling(events) {
  const rows = events.filter((event) => event.kind === 'sling');
  const matches = [];
  const rejects = [];
  for (let i = 0; i < rows.length; i += 1) {
    const event = rows[i];
    const speed = event.payload.speed;
    const mass = event.payload.mass;
    if (typeof speed !== 'number' || speed < 180 || typeof mass !== 'number' || mass < 1) {
      rejects.push(reject('giant_sling', 'sling:not-giant', [event]));
      continue;
    }
    if (!event.causalityId) {
      rejects.push(reject('giant_sling', 'sling:no-impact', [event]));
      continue;
    }
    const later = laterOnChain(events, event.causalityId, event.tick, 8 * 60);
    const impact = later.find((item) => SLING_FOLLOW.has(item.kind) && item.id !== event.id);
    if (!impact) {
      rejects.push(reject('giant_sling', 'sling:no-impact', [event]));
      continue;
    }
    matches.push(matchOf('giant_sling', impact, {
      subject: subjectOf(event) || subjectOf(impact),
      secondary: actorOf(event),
      payoffTick: impact.tick,
      payoff: Math.min(1, speed / 400),
      reason: `Logged sling ${event.id} at ${speed} WU/s is followed by ${impact.kind} ${impact.id} on causality ${event.causalityId}.`,
      eventIds: [event.id, impact.id],
    }));
  }
  return { matches, rejects };
}

function diedBefore(events, subject, tick) {
  if (!subject) return false;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.kind !== 'kill' || event.tick > tick) continue;
    if (sameActor(subjectOf(event), subject)) return true;
  }
  return false;
}

function matchRescue(events) {
  const rows = events.filter((event) => event.kind === 'rescue');
  const matches = [];
  const rejects = [];
  for (let i = 0; i < rows.length; i += 1) {
    const event = rows[i];
    const subject = subjectOf(event);
    if (!event.causalityId || !subject) {
      rejects.push(reject('last_second_rescue', 'rescue:no-logged-threat', [event]));
      continue;
    }
    if (diedBefore(events, subject, event.tick)) {
      rejects.push(reject('last_second_rescue', 'rescue:subject-already-dead', [event]));
      continue;
    }
    const prior = priorOnChain(events, event.causalityId, event.tick);
    const threat = prior.find((item) => {
      if (item.kind !== 'threat' && item.kind !== 'damage') return false;
      if (item.tick < event.tick - 180) return false;
      return sameActor(subjectOf(item), subject);
    });
    if (!threat) {
      rejects.push(reject('last_second_rescue', 'rescue:no-logged-threat', [event]));
      continue;
    }
    const gap = event.tick - threat.tick;
    matches.push(matchOf('last_second_rescue', event, {
      secondary: actorOf(threat) || actorOf(event),
      payoff: gap <= 60 ? 0.92 : 0.7,
      reason: `Logged rescue ${event.id} answers threat ${threat.id} on causality ${event.causalityId} for ${subject.id} generation ${subject.generation}.`,
      eventIds: [threat.id, event.id],
    }));
  }
  return { matches, rejects };
}

function matchNear(events) {
  const rows = events.filter((event) => event.kind === 'near_miss');
  const matches = [];
  const rejects = [];
  for (let i = 0; i < rows.length; i += 1) {
    const event = rows[i];
    const clearance = event.payload.clearance;
    if (typeof clearance !== 'number' || !(clearance > 0) || clearance > 12) {
      rejects.push(reject('near_miss', 'near_miss:no-clearance', [event]));
      continue;
    }
    if (event.payload.hit !== false) {
      rejects.push(reject('near_miss', 'near_miss:was-a-hit', [event]));
      continue;
    }
    if (!event.causalityId) {
      rejects.push(reject('near_miss', 'near_miss:no-causality', [event]));
      continue;
    }
    const hit = events.some((item) => item.kind === 'collision'
      && item.causalityId === event.causalityId
      && Math.abs(item.tick - event.tick) <= 2);
    if (hit) {
      rejects.push(reject('near_miss', 'near_miss:was-a-hit', [event]));
      continue;
    }
    matches.push(matchOf('near_miss', event, {
      payoff: clearance < 4 ? 0.8 : 0.6,
      reason: `Logged near miss ${event.id} cleared by ${clearance} WU on causality ${event.causalityId}.`,
      eventIds: [event.id],
    }));
  }
  return { matches, rejects };
}

function matchCargo(events) {
  const rows = events.filter((event) => event.kind === 'cargo_catastrophe');
  const matches = [];
  const rejects = [];
  for (let i = 0; i < rows.length; i += 1) {
    const event = rows[i];
    if (event.payload.volatile !== true) {
      rejects.push(reject('volatile_cargo_catastrophe', 'cargo:not-volatile', [event]));
      continue;
    }
    const qty = event.payload.qty;
    const burst = event.payload.burst === true;
    if (burst !== true && !(typeof qty === 'number' && qty > 0)) {
      rejects.push(reject('volatile_cargo_catastrophe', 'cargo:no-quantity', [event]));
      continue;
    }
    if (!event.causalityId) {
      rejects.push(reject('volatile_cargo_catastrophe', 'cargo:no-trigger', [event]));
      continue;
    }
    const prior = priorOnChain(events, event.causalityId, event.tick);
    const trigger = prior.find((item) => CARGO_TRIGGER.has(item.kind));
    if (!trigger) {
      rejects.push(reject('volatile_cargo_catastrophe', 'cargo:no-trigger', [event]));
      continue;
    }
    matches.push(matchOf('volatile_cargo_catastrophe', event, {
      secondary: subjectOf(trigger) || actorOf(trigger),
      payoff: 0.85,
      reason: `Logged volatile cargo ${event.id} follows ${trigger.kind} ${trigger.id} on causality ${event.causalityId}.`,
      eventIds: [trigger.id, event.id],
    }));
  }
  return { matches, rejects };
}

function matchBlockade(events) {
  const rows = events.filter((event) => event.kind === 'blockade');
  const matches = [];
  const rejects = [];
  for (let i = 0; i < rows.length; i += 1) {
    const event = rows[i];
    if (event.payload.moving !== true) {
      rejects.push(reject('moving_blockade', 'blockade:not-moving', [event]));
      continue;
    }
    const count = event.payload.blockerCount;
    if (typeof count !== 'number' || count < 2) {
      rejects.push(reject('moving_blockade', 'blockade:too-few', [event]));
      continue;
    }
    if (!event.causalityId) {
      rejects.push(reject('moving_blockade', 'blockade:no-attempt', [event]));
      continue;
    }
    const attempt = events.find((item) => item.causalityId === event.causalityId
      && BLOCKADE_ATTEMPT.has(item.kind)
      && item.tick >= event.tick - 120);
    if (!attempt) {
      rejects.push(reject('moving_blockade', 'blockade:no-attempt', [event]));
      continue;
    }
    const payoff = attempt.tick > event.tick ? attempt : event;
    matches.push(matchOf('moving_blockade', payoff, {
      subject: subjectOf(attempt) || subjectOf(event),
      secondary: actorByRole(event, 'blocker') || actorOf(event),
      payoffTick: payoff.tick,
      payoff: 0.66,
      causalClarity: clarity(event, subjectOf(attempt) || subjectOf(event)),
      reason: `Logged moving blockade ${event.id} (${count} blockers) meets ${attempt.kind} ${attempt.id} on causality ${event.causalityId}.`,
      eventIds: [event.id, attempt.id],
    }));
  }
  return { matches, rejects };
}

function matchReversal(events) {
  const rows = events.filter((event) => event.kind === 'reversal');
  const matches = [];
  const rejects = [];
  for (let i = 0; i < rows.length; i += 1) {
    const event = rows[i];
    if (event.payload.flipped !== true || event.payload.fromRole === event.payload.toRole
      || typeof event.payload.fromRole !== 'string' || typeof event.payload.toRole !== 'string') {
      rejects.push(reject('reversal', 'reversal:not-flipped', [event]));
      continue;
    }
    if (!event.causalityId) {
      rejects.push(reject('reversal', 'reversal:no-outcome', [event]));
      continue;
    }
    const aggressor = actorOf(event);
    const later = laterOnChain(events, event.causalityId, event.tick + 1, 12 * 60);
    const outcome = later.find((item) => REVERSAL_OUTCOME.has(item.kind) && sameActor(subjectOf(item), aggressor));
    if (!outcome) {
      rejects.push(reject('reversal', 'reversal:no-outcome', [event]));
      continue;
    }
    matches.push(matchOf('reversal', outcome, {
      subject: subjectOf(outcome),
      secondary: subjectOf(event),
      payoffTick: outcome.tick,
      payoff: 0.95,
      reason: `Logged reversal ${event.id} (${event.payload.fromRole} to ${event.payload.toRole}) lands on ${outcome.kind} ${outcome.id}.`,
      eventIds: [event.id, outcome.id],
    }));
  }
  return { matches, rejects };
}

function matchRicochet(events) {
  const rows = events.filter((event) => event.kind === 'ricochet');
  const matches = [];
  const rejects = [];
  for (let i = 0; i < rows.length; i += 1) {
    const event = rows[i];
    const bounces = event.payload.bounces;
    if (typeof bounces !== 'number' || bounces < 2) {
      rejects.push(reject('freak_ricochet', 'ricochet:too-few-bounces', [event]));
      continue;
    }
    if (event.payload.improbable !== true) {
      rejects.push(reject('freak_ricochet', 'ricochet:not-improbable', [event]));
      continue;
    }
    if (!event.causalityId) {
      rejects.push(reject('freak_ricochet', 'ricochet:no-strike', [event]));
      continue;
    }
    const later = laterOnChain(events, event.causalityId, event.tick, 5 * 60);
    const strike = later.find((item) => RICOCHET_STRIKE.has(item.kind) && item.payload.via === 'ricochet');
    if (!strike && event.payload.struck !== true) {
      rejects.push(reject('freak_ricochet', 'ricochet:no-strike', [event]));
      continue;
    }
    const payoff = strike || event;
    matches.push(matchOf('freak_ricochet', payoff, {
      subject: subjectOf(payoff) || subjectOf(event),
      secondary: actorOf(event),
      payoffTick: payoff.tick,
      payoff: bounces >= 3 ? 0.84 : 0.7,
      reason: `Logged ricochet ${event.id} bounced ${bounces} times on causality ${event.causalityId}.`,
      eventIds: strike ? [event.id, strike.id] : [event.id],
    }));
  }
  return { matches, rejects };
}

function matchRecovery(events) {
  const rows = events.filter((event) => event.kind === 'recovery');
  const matches = [];
  const rejects = [];
  for (let i = 0; i < rows.length; i += 1) {
    const event = rows[i];
    if (event.payload.planned === true) {
      rejects.push(reject('unplanned_recovery', 'recovery:planned', [event]));
      continue;
    }
    if (event.payload.planned !== false) {
      rejects.push(reject('unplanned_recovery', 'recovery:intent-unknown', [event]));
      continue;
    }
    if (!event.causalityId) {
      rejects.push(reject('unplanned_recovery', 'recovery:no-preceding-loss', [event]));
      continue;
    }
    const prior = priorOnChain(events, event.causalityId, event.tick);
    const loss = prior.find((item) => item.kind === 'cargo_catastrophe' || item.kind === 'collateral' || item.kind === 'kill');
    if (!loss) {
      rejects.push(reject('unplanned_recovery', 'recovery:no-preceding-loss', [event]));
      continue;
    }
    matches.push(matchOf('unplanned_recovery', event, {
      secondary: subjectOf(loss) || actorOf(loss),
      payoff: 0.8,
      reason: `Logged unplanned recovery ${event.id} follows ${loss.kind} ${loss.id} on causality ${event.causalityId}.`,
      eventIds: [loss.id, event.id],
    }));
  }
  return { matches, rejects };
}

const MATCHERS = Object.freeze([
  matchChain,
  matchTether,
  matchCollateral,
  matchLaw,
  matchSling,
  matchRescue,
  matchNear,
  matchCargo,
  matchBlockade,
  matchReversal,
  matchRicochet,
  matchRecovery,
]);

export function matchGrammar(events) {
  const matches = [];
  const rejects = [];
  const list = Array.isArray(events) ? events : [];
  for (let i = 0; i < MATCHERS.length; i += 1) {
    const result = MATCHERS[i](list);
    for (let m = 0; m < result.matches.length; m += 1) matches.push(result.matches[m]);
    for (let r = 0; r < result.rejects.length; r += 1) rejects.push(result.rejects[r]);
  }
  matches.sort((a, b) => a.payoffTick - b.payoffTick || (a.shape < b.shape ? -1 : a.shape > b.shape ? 1 : 0));
  return { matches, rejects, shapes: SHAPE_IDS };
}
