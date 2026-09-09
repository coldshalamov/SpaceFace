import { GRAVITY_MARK_STATUS_ID } from '../data/combatDefs.js';

export const MAX_GRAVITY_MARK_OVERLAYS = 6;

/**
 * Fill a retained array with live entities carrying a Gravity Mark authored by `attackerId`.
 * The scan follows entityList order and allocates nothing in the HUD cadence path.
 */
export function fillActiveGravityMarkTargets(
  state,
  attackerId,
  out,
  limit = MAX_GRAVITY_MARK_OVERLAYS,
) {
  const targets = Array.isArray(out) ? out : [];
  targets.length = 0;
  const entities = state && state.entityList;
  const runtimes = state && state.combat && state.combat.entities;
  if (!Array.isArray(entities) || !runtimes || attackerId == null) return targets;
  const tick = Number.isInteger(state.tick) ? state.tick : 0;
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  for (let i = 0; i < entities.length && targets.length < max; i++) {
    const entity = entities[i];
    if (!entity || entity.alive === false || entity.id == null) continue;
    const runtime = runtimes[String(entity.id)];
    const status = runtime && runtime.statuses && runtime.statuses[GRAVITY_MARK_STATUS_ID];
    if (!status || status.expiresTick <= tick) continue;
    if (String(status.attackerId) !== String(attackerId)) continue;
    targets.push(entity);
  }
  return targets;
}
