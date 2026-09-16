import {
  GRAVITY_MARK_STATUS_ID,
  MOMENTUM_SINK_STATUS_ID,
} from '../data/combatDefs.js';

export const MAX_MOMENTUM_SINK_OVERLAYS = 6;

/** Collect both PQ-026 target states in one retained HUD traversal. */
export function fillActiveMassCouplingTargets(
  state,
  attackerId,
  gravityOut,
  momentumOut,
  gravityLimit,
  momentumLimit,
) {
  const gravity = Array.isArray(gravityOut) ? gravityOut : [];
  const momentum = Array.isArray(momentumOut) ? momentumOut : [];
  gravity.length = 0;
  momentum.length = 0;
  const runtimes = state && state.combat && state.combat.entities;
  const getEntity = state && state.entities && typeof state.entities.get === 'function'
    ? (id) => state.entities.get(id) || state.entities.get(Number(id))
    : null;
  if (!runtimes || !getEntity || attackerId == null) return 0;
  const tick = Number.isInteger(state.tick) ? state.tick : 0;
  const gravityMax = Math.max(0, Math.floor(Number(gravityLimit) || 0));
  const momentumMax = Math.max(0, Math.floor(Number(momentumLimit) || 0));
  for (const id in runtimes) {
    if (gravity.length >= gravityMax && momentum.length >= momentumMax) break;
    const runtime = runtimes[id];
    if (!runtime || !runtime.statuses) continue;
    const entity = getEntity(id);
    if (!entity || entity.alive === false) continue;
    const gravityMark = runtime.statuses[GRAVITY_MARK_STATUS_ID];
    if (gravity.length < gravityMax && authoredActive(gravityMark, attackerId, tick)) gravity.push(entity);
    const momentumSink = runtime.statuses[MOMENTUM_SINK_STATUS_ID];
    if (momentum.length < momentumMax && authoredActive(momentumSink, attackerId, tick)) momentum.push(entity);
  }
  return gravity.length + momentum.length;
}

function authoredActive(status, attackerId, tick) {
  return !!status && status.expiresTick > tick && String(status.attackerId) === String(attackerId);
}
