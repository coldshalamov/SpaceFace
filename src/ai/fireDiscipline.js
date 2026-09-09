import { stableId } from './contracts.js';

export const FRIENDLY_FIRE_CORRIDOR_WU = 6;
const CLEAR = Object.freeze({ clear: true, blockerId: null, reason: null });

/**
 * Pure ballistic-lane gate. The firing adapter supplies its exact lead angle; this function checks
 * the finite segment from the shooter to the target range against allied ship/drone hulls. It does
 * not change targeting or maneuver state, so an obstructed pilot holds fire instead of jittering.
 */
export function assessFriendlyFireLane({ shooter, target, aimAngle, entities, corridor = FRIENDLY_FIRE_CORRIDOR_WU } = {}) {
  if (!shooter || !shooter.pos || !target || !target.pos || !Number.isFinite(aimAngle)) return CLEAR;
  const dx = target.pos.x - shooter.pos.x;
  const dz = target.pos.z - shooter.pos.z;
  const targetRange = Math.hypot(dx, dz);
  if (!(targetRange > 1e-6)) return CLEAR;
  const dirX = Math.cos(aimAngle);
  const dirZ = Math.sin(aimAngle);
  const source = Array.isArray(entities)
    ? entities
    : (entities && typeof entities.values === 'function' ? entities.values() : []);
  let blocker = null;
  let bestAlong = Infinity;
  for (const ally of source) {
    if (!ally || ally.alive === false || ally.id === shooter.id || ally.id === target.id) continue;
    if (ally.type !== 'ship' && ally.type !== 'drone') continue;
    if (ally.team == null || ally.team !== shooter.team) continue;
    const ax = ally.pos.x - shooter.pos.x;
    const az = ally.pos.z - shooter.pos.z;
    const along = ax * dirX + az * dirZ;
    const muzzleClear = Math.max(1, Number(shooter.radius) || 0);
    const laneEnd = targetRange + Math.max(0, Number(target.radius) || 0);
    if (along <= muzzleClear || along >= laneEnd) continue;
    const lateralSq = Math.max(0, ax * ax + az * az - along * along);
    const clearance = Math.max(0, Number(ally.radius) || 0) + Math.max(0, corridor);
    if (lateralSq > clearance * clearance) continue;
    if (along < bestAlong || (along === bestAlong && stableId(ally.id) < stableId(blocker && blocker.id))) {
      blocker = ally;
      bestAlong = along;
    }
  }
  if (!blocker) return CLEAR;
  return Object.freeze({ clear: false, blockerId: blocker.id, reason: 'ally_in_lane' });
}
