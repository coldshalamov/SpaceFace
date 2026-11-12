// Payload resolution for compiled AttackSpecs (PQ-133.05 / CRU-033 … CRU-035).
// Pure: consumes combatDefs status ids and their authored effects. Does not schedule
// statuses, does not write fields, does not own Massline attachment.

import {
  GRAVITY_MARK_STATUS_ID,
  STATUS_DEFS,
} from '../data/combatDefs.js';

export const TETHER_ANCHOR_PAYLOAD_SCALE_CAP = 2;

export const CAUSAL_CHANNEL = Object.freeze({
  DIRECT: 'DIRECT',
  CHAIN: 'CHAIN',
  BANK: 'BANK',
  STATUS: 'STATUS',
  TETHER: 'TETHER',
  FIELD: 'FIELD',
});

const STATUS_BY_ID = new Map(STATUS_DEFS.map((def) => [def.id, def]));

function damageTotal(channels) {
  let total = 0;
  const bag = channels && typeof channels === 'object' ? channels : {};
  for (const key of Object.keys(bag).sort()) total += Number(bag[key]) || 0;
  return total;
}

/**
 * Scale and tag a compiled payload for one contact. Tether amplification only
 * applies when the contact target is the live Massline anchor.
 */
export function resolvePayload(spec, context = {}) {
  const payload = spec && Array.isArray(spec.payload) ? spec.payload : [];
  let scale = 1;
  const tags = [];
  const generation = Number.isInteger(context.generation) ? context.generation : 0;
  if (generation > 0) tags.push(CAUSAL_CHANNEL.CHAIN);
  else if (context.hasBounced) tags.push(CAUSAL_CHANNEL.BANK);
  else tags.push(CAUSAL_CHANNEL.DIRECT);

  const authoredTether = spec && spec.costs ? spec.costs.tetherAnchorPayloadScale : 0;
  if (
    Number.isFinite(authoredTether)
    && authoredTether > 1
    && context.targetId != null
    && context.tetherAnchorId != null
    && context.targetId === context.tetherAnchorId
  ) {
    scale *= Math.min(authoredTether, TETHER_ANCHOR_PAYLOAD_SCALE_CAP);
    tags.push(CAUSAL_CHANNEL.TETHER);
  }

  const channels = {};
  const statuses = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.kind === 'damage' && entry.channels) {
      for (const key of Object.keys(entry.channels)) {
        channels[key] = (channels[key] || 0) + (Number(entry.channels[key]) || 0) * scale;
      }
    } else if (entry.kind === 'status' && typeof entry.statusId === 'string') {
      const stacks = Number.isInteger(entry.stacks) && entry.stacks > 0 ? entry.stacks : 1;
      statuses.push({ id: entry.statusId, stacks });
      tags.push(CAUSAL_CHANNEL.STATUS);
      if (entry.statusId === GRAVITY_MARK_STATUS_ID) tags.push(CAUSAL_CHANNEL.FIELD);
    }
  }

  const unique = [];
  const seen = new Set();
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    unique.push(tag);
  }
  unique.sort();
  return { channels, statuses, scale, tags: unique, total: damageTotal(channels) };
}

/** Coupling multiplier authored on Gravity Marked — the same number fields.js consumes. */
export function fieldCouplingForStatusIds(statusIds) {
  let mult = 1;
  const list = Array.isArray(statusIds) ? statusIds : [];
  for (let i = 0; i < list.length; i++) {
    const def = STATUS_BY_ID.get(list[i]);
    const coupling = def && def.effects && def.effects.multipliers
      ? def.effects.multipliers.fieldCoupling
      : null;
    if (Number.isFinite(coupling)) mult *= coupling;
  }
  return mult;
}

/**
 * Periodic ticks the status service will fire for one application, matching
 * statuses.js: first tick at applied+every, last while expiresTick > next.
 */
export function statusPeriodicEvents(statusId, appliedTick = 0) {
  const def = STATUS_BY_ID.get(statusId);
  if (!def || !def.periodic || !(def.periodic.everyTicks > 0)) return [];
  const duration = Number.isInteger(def.durationTicks) ? def.durationTicks : 0;
  const every = def.periodic.everyTicks;
  const expiresTick = appliedTick + duration;
  let next = appliedTick + every;
  const events = [];
  while (next <= expiresTick && expiresTick > next) {
    events.push({ tick: next, packet: def.periodic.packet });
    next += every;
  }
  return events;
}

export function statusPeriodicDamageTotal(statusId, stacks = 1) {
  const scale = Number.isInteger(stacks) && stacks > 0 ? stacks : 1;
  const events = statusPeriodicEvents(statusId);
  let total = 0;
  for (const event of events) {
    total += damageTotal(event.packet && event.packet.channels) * scale;
  }
  return total;
}

export function emptyCausalDistribution() {
  return {
    [CAUSAL_CHANNEL.DIRECT]: 0,
    [CAUSAL_CHANNEL.CHAIN]: 0,
    [CAUSAL_CHANNEL.BANK]: 0,
    [CAUSAL_CHANNEL.STATUS]: 0,
    [CAUSAL_CHANNEL.TETHER]: 0,
    [CAUSAL_CHANNEL.FIELD]: 0,
  };
}

export function addResolvedToDistribution(dist, resolved) {
  const bag = dist || emptyCausalDistribution();
  const amount = resolved && Number.isFinite(resolved.total) ? resolved.total : 0;
  const tags = resolved && Array.isArray(resolved.tags) ? resolved.tags : [];
  if (tags.includes(CAUSAL_CHANNEL.CHAIN)) bag[CAUSAL_CHANNEL.CHAIN] += amount;
  else if (tags.includes(CAUSAL_CHANNEL.BANK)) bag[CAUSAL_CHANNEL.BANK] += amount;
  else bag[CAUSAL_CHANNEL.DIRECT] += amount;
  if (tags.includes(CAUSAL_CHANNEL.TETHER)) bag[CAUSAL_CHANNEL.TETHER] += amount;
  const statuses = resolved && Array.isArray(resolved.statuses) ? resolved.statuses : [];
  for (const status of statuses) {
    bag[CAUSAL_CHANNEL.STATUS] += statusPeriodicDamageTotal(status.id, status.stacks);
    if (status.id === GRAVITY_MARK_STATUS_ID) {
      bag[CAUSAL_CHANNEL.FIELD] += fieldCouplingForStatusIds([status.id]);
    }
  }
  return bag;
}
