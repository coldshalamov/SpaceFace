// Multishot / pierce / split topology (PQ-133 / CRU-022 … CRU-024).
// Pure: plans volleys and bounded descendants from an immutable AttackSpec + shared lineage.

import {
  PROC_COSTS,
  canAct,
  inheritAllowedActions,
  recordTargetHit,
  tryConsumeProc,
  trySpawnDescendant,
} from './attackLineage.js';
import { selectTargets } from './attackTargeting.js';
import { selectChainTarget, tryChain } from './attackChain.js';

const DEG = Math.PI / 180;

function splitCountOf(spec) {
  const split = spec && spec.propagation && spec.propagation.split;
  return split && Number.isInteger(split.count) ? split.count : 0;
}

function pierceOf(spec) {
  return spec && spec.propagation && Number.isInteger(spec.propagation.pierce)
    ? spec.propagation.pierce
    : 0;
}

/**
 * Deterministic sibling angles for a root volley. rootCount 1 → a single 0 offset,
 * so the weapons fire path can stay bit-identical to the uncompiled shot.
 */
export function describeVolley(spec) {
  const emitter = spec && spec.emitter ? spec.emitter : {};
  const rootCount = Number.isInteger(emitter.rootCount) && emitter.rootCount > 0
    ? emitter.rootCount
    : 1;
  const spreadDeg = Number.isFinite(emitter.spreadDeg) ? emitter.spreadDeg : 0;
  const intervalTicks = Number.isInteger(emitter.intervalTicks) ? emitter.intervalTicks : 0;
  const roots = [];
  const denom = Math.max(1, rootCount - 1);
  for (let i = 0; i < rootCount; i++) {
    const offsetDeg = rootCount === 1 ? 0 : ((i - (rootCount - 1) / 2) * (spreadDeg / denom));
    roots.push({
      index: i,
      generation: 0,
      offsetDeg,
      offsetRad: offsetDeg * DEG,
      delayTicks: intervalTicks > 0 ? i * intervalTicks : 0,
    });
  }
  return {
    rootCount,
    spreadDeg,
    intervalTicks,
    roots,
    pierce: pierceOf(spec),
    splitCount: splitCountOf(spec),
  };
}

/**
 * Emit a root volley against the shared proc budget. The first root is free (the activation).
 * Extra siblings each cost PROC_COSTS.rootSibling and are suppressed when the budget is gone.
 */
export function emitVolley(spec, lineage) {
  const planned = describeVolley(spec);
  const emitted = [];
  const suppressed = [];
  const cap = lineage && lineage.budget && lineage.budget.constraints
    ? lineage.budget.constraints.activeFamilyCap
    : Infinity;
  for (let i = 0; i < planned.roots.length; i++) {
    const root = planned.roots[i];
    if (i > 0) {
      if (lineage && lineage.budget && lineage.budget.familySize >= cap) {
        lineage.budget.suppressed += 1;
        lineage.budget.suppressReasons.push('active_family_cap');
        suppressed.push({ index: i, reason: 'active_family_cap' });
        continue;
      }
      const paid = tryConsumeProc(lineage, PROC_COSTS.rootSibling, 'root_sibling');
      if (!paid.ok) {
        suppressed.push({ index: i, reason: paid.reason });
        continue;
      }
      if (lineage && lineage.budget) lineage.budget.familySize += 1;
    }
    emitted.push(root);
  }
  return { ...planned, emitted, suppressed, heatScale: spec && spec.costs ? spec.costs.heatScale : 1 };
}

/**
 * Entity-contact pierce. Applies re-hit protection, then spends one pierce to continue.
 * Exhausted pierce → the projectile is consumed after this hit. Does not spend proc budget.
 */
export function tryPierce(runtime, contact) {
  if (!runtime) return { ok: false, continue: false, reason: 'no_lineage' };
  const targetId = contact && contact.targetId;
  const tick = contact && Number.isInteger(contact.tick) ? contact.tick : 0;
  if (targetId == null) return { ok: false, continue: false, reason: 'no_target' };

  const hit = recordTargetHit(runtime, targetId, tick);
  if (!hit.ok) {
    return { ok: false, continue: true, reason: hit.reason, applyPayload: false };
  }

  if (runtime.remaining.pierces > 0) {
    runtime.remaining.pierces -= 1;
    return { ok: true, continue: true, reason: 'pierce', applyPayload: true, remaining: runtime.remaining.pierces };
  }
  return { ok: true, continue: false, reason: 'consumed', applyPayload: true, remaining: 0 };
}

/**
 * Split on an authored trigger. Children share budget + visited set, inherit payload actions,
 * and do NOT inherit split (trait inheritance.splitChildren is false on Forked Core).
 */
export function trySplit(parent, spec, contact = {}) {
  if (!parent) return { ok: false, children: [], suppressed: 1, reason: 'no_lineage' };
  if (!canAct(parent, 'split')) {
    parent.budget.suppressed += 1;
    parent.budget.suppressReasons.push('not_inherited');
    return { ok: false, children: [], suppressed: 1, reason: 'not_inherited' };
  }
  if (parent.remaining.splits <= 0) {
    return { ok: false, children: [], suppressed: 0, reason: 'no_remaining_splits' };
  }

  const want = parent.remaining.splits;
  parent.remaining.splits = 0;
  const tick = Number.isInteger(contact.tick) ? contact.tick : parent.createdTick;
  const children = [];
  const suppressed = [];
  const childActions = inheritAllowedActions(spec, 'splitChildren');
  const payloadScale = spec && spec.propagation && spec.propagation.split
    && Number.isFinite(spec.propagation.split.payloadScale)
    ? spec.propagation.split.payloadScale
    : 0.55;
  const childBounces = childActions.includes('ricochet') ? parent.remaining.bounces : 0;

  for (let i = 0; i < want; i++) {
    const spawned = trySpawnDescendant(parent, {
      spec,
      inheritKind: 'splitChildren',
      allowedActions: childActions,
      cost: PROC_COSTS.splitChild,
      tick,
      remaining: { bounces: childBounces, chains: 0, pierces: 0, splits: 0 },
    });
    if (!spawned.ok) {
      suppressed.push({ index: i, reason: spawned.reason });
      continue;
    }
    children.push({
      runtime: spawned.runtime,
      index: i,
      payloadScale,
    });
  }

  return {
    ok: children.length > 0,
    children,
    suppressed: suppressed.length,
    suppressReasons: suppressed.map((row) => row.reason),
    payloadScale,
  };
}

/**
 * Bounce continuation against the shared budget. Physics reflection is
 * `resolveRicochet` in surfaceReflection.js; this only spends remaining.bounces
 * plus one proc, or refuses.
 */
export function tryBounce(runtime) {
  if (!runtime) return { ok: false, reason: 'no_lineage' };
  if (!canAct(runtime, 'ricochet')) return { ok: false, reason: 'not_inherited', suppressed: true };
  if (runtime.remaining.bounces <= 0) return { ok: false, reason: 'no_remaining_bounces' };
  const paid = tryConsumeProc(runtime, PROC_COSTS.bounce, 'bounce');
  if (!paid.ok) return paid;
  runtime.remaining.bounces -= 1;
  runtime.hasBounced = true;
  return { ok: true, remaining: runtime.remaining.bounces };
}

export { selectTargets, selectChainTarget, tryChain };
