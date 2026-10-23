// The same mass envelope cruise already treats as a lock: a body at least 60 WU
// across, inside 180 WU. A drive fold will not form there. Gate transit is a lane,
// not a fold, and does not ask this question.
import { queryNearbyEntities } from '../core/spatialQuery.js';

export const JUMP_MASS_LOCK_RADIUS = 180;
export const JUMP_MASS_LOCK_BODY = 60;

export function driveJumpMassLocked(state) {
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!player || player.alive === false || !player.pos) return false;
  const scratch = [];
  const fallback = [];
  if (state.entities && typeof state.entities.forEach === 'function') {
    state.entities.forEach((entity) => { if (entity) fallback.push(entity); });
  }
  const list = queryNearbyEntities(state, player.pos, JUMP_MASS_LOCK_RADIUS, scratch, fallback);
  const reach = JUMP_MASS_LOCK_RADIUS * JUMP_MASS_LOCK_RADIUS;
  for (let i = 0; i < list.length; i++) {
    const body = list[i];
    if (!body || body === player || body.alive === false || !body.pos) continue;
    if ((body.radius || 0) < JUMP_MASS_LOCK_BODY) continue;
    const dx = body.pos.x - player.pos.x;
    const dz = body.pos.z - player.pos.z;
    if (dx * dx + dz * dz <= reach) return true;
  }
  return false;
}
