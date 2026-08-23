// Deterministic chain selection + hop (PQ-133.05 / CRU-032).
// Pure: same seed-equivalent field, same hop. Score, then distance, then id.
// Never insertion order, never a roll. Hops pay the shared lineage proc budget
// and refuse a revisited target.

import {
  PROC_COSTS,
  canAct,
  inheritAllowedActions,
  recordTargetHit,
  trySpawnDescendant,
} from './attackLineage.js';
import { selectTargets } from './attackTargeting.js';

function distSq(a, b) {
  const dx = (a && a.x || 0) - (b && b.x || 0);
  const dz = (a && a.z || 0) - (b && b.z || 0);
  return dx * dx + dz * dz;
}

function chainOf(spec) {
  return spec && spec.propagation && spec.propagation.chain
    ? spec.propagation.chain
    : null;
}

/**
 * Pick the next chain target from a caller-supplied field.
 * Range is a hard filter; ordering is selectTargets (score, distSq, id).
 */
export function selectChainTarget(candidates, options = {}) {
  const range = Number.isFinite(options.range) && options.range > 0 ? options.range : 0;
  const origin = options.sourcePos || { x: 0, z: 0 };
  const excludeId = options.excludeId;
  const rangeSq = range * range;
  const list = Array.isArray(candidates) ? candidates : [];
  const inRange = [];
  for (let i = 0; i < list.length; i++) {
    const candidate = list[i];
    if (!candidate || candidate.id == null) continue;
    if (excludeId != null && candidate.id === excludeId) continue;
    const pos = candidate.pos || { x: 0, z: 0 };
    const d2 = distSq(pos, origin);
    if (!(d2 > 0) || d2 > rangeSq) continue;
    inRange.push(candidate);
  }
  return selectTargets(inRange, {
    count: 1,
    sourcePos: origin,
    visited: options.visited,
    requireStatus: options.requireStatus || null,
  })[0] || null;
}

/**
 * One bounded hop from an entity contact. Pays PROC_COSTS.chain, inherits
 * chainChildren actions, and records the destination on the shared visited set.
 */
export function tryChain(parent, spec, contact = {}, candidates = []) {
  if (!parent) return { ok: false, reason: 'no_lineage', suppressed: true };
  if (!canAct(parent, 'chain_if_eligible')) {
    if (parent.budget) {
      parent.budget.suppressed += 1;
      parent.budget.suppressReasons.push('not_inherited');
    }
    return { ok: false, reason: 'not_inherited', suppressed: true };
  }
  if (parent.remaining.chains <= 0) {
    return { ok: false, reason: 'no_remaining_chains' };
  }
  const chain = chainOf(spec);
  if (!chain || !(chain.count > 0)) {
    return { ok: false, reason: 'no_chain' };
  }
  if (chain.requireBounce && !parent.hasBounced) {
    return { ok: false, reason: 'requires_bounce' };
  }

  const origin = contact.pos || contact.point || contact.sourcePos || { x: 0, z: 0 };
  const fromId = contact.targetId;
  const next = selectChainTarget(candidates, {
    sourcePos: origin,
    range: chain.range,
    visited: parent.visitedTargets,
    requireStatus: chain.prerequisiteStatus || null,
    excludeId: fromId,
  });
  if (!next) return { ok: false, reason: 'no_target' };

  parent.remaining.chains -= 1;
  const tick = Number.isInteger(contact.tick) ? contact.tick : parent.createdTick;
  const childActions = inheritAllowedActions(spec, 'chainChildren');
  const childBounces = childActions.includes('ricochet') ? parent.remaining.bounces : 0;
  const spawned = trySpawnDescendant(parent, {
    spec,
    inheritKind: 'chainChildren',
    allowedActions: childActions,
    cost: PROC_COSTS.chain,
    tick,
    remaining: {
      bounces: childBounces,
      chains: parent.remaining.chains,
      pierces: 0,
      splits: 0,
    },
  });
  if (!spawned.ok) {
    parent.remaining.chains += 1;
    return {
      ok: false,
      reason: spawned.reason,
      suppressed: true,
      children: [],
    };
  }

  recordTargetHit(spawned.runtime, next.id, tick);
  return {
    ok: true,
    target: next,
    runtime: spawned.runtime,
    fromId: fromId != null ? fromId : null,
    cost: spawned.cost,
  };
}
