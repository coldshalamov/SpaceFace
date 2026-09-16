import { GRAVITY_MARK_STATUS_ID } from '../data/combatDefs.js';

export const MAX_GRAVITY_MARK_OVERLAYS = 6;

/**
 * Fill a retained array with live entities carrying a Gravity Mark authored by `attackerId`.
 * Walks the combat status table, not the fat entity list.
 */
export function fillActiveGravityMarkTargets(
  state,
  attackerId,
  out,
  limit = MAX_GRAVITY_MARK_OVERLAYS,
) {
  const targets = Array.isArray(out) ? out : [];
  targets.length = 0;
  const runtimes = state && state.combat && state.combat.entities;
  const entities = state && state.entities;
  const getEntity = entities && typeof entities.get === 'function'
    ? (id) => entities.get(id) || entities.get(Number(id))
    : null;
  if (!runtimes || !getEntity || attackerId == null) return targets;
  const tick = Number.isInteger(state.tick) ? state.tick : 0;
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  for (const id in runtimes) {
    if (targets.length >= max) break;
    const runtime = runtimes[id];
    const status = runtime && runtime.statuses && runtime.statuses[GRAVITY_MARK_STATUS_ID];
    if (!status || status.expiresTick <= tick) continue;
    if (String(status.attackerId) !== String(attackerId)) continue;
    const entity = getEntity(id);
    if (!entity || entity.alive === false) continue;
    targets.push(entity);
  }
  return targets;
}
