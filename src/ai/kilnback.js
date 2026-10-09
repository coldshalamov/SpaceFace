import { ManeuverKind } from './contracts.js';
import { KILNBACK as C, kilnbackCoolant } from '../data/kilnback.js';

// The existing ManeuverPlanner/flight owner consumes this intent. No second force controller.
export function kilnbackDecision(decision, state) {
  const e = state.entities.get(decision?.entityId), row = e?.data?.kilnback;
  if (e?.data?.lootTableId !== C.enemyId || !row) return decision;
  const retreat = row.phase === 'retreat' || (row.phase === 'approach' && kilnbackCoolant(row) === 0);
  const hold = ['preheat', 'burn', 'vent'].includes(row.phase);
  const aim = row.aimPoint || e.pos;
  const angle = hold ? row.aimAngle : Math.atan2(aim.z - e.pos.z, aim.x - e.pos.x);
  const slot = retreat ? { x: e.pos.x - Math.cos(angle) * 350, z: e.pos.z - Math.sin(angle) * 350 }
    : hold ? { ...e.pos } : { x: aim.x - Math.cos(angle) * 130, z: aim.z - Math.sin(angle) * 130 };
  return { ...decision, targetId: null, fire: false, allowedActionId: null,
    maneuver: { ...(decision.maneuver || {}), entityId: e.id,
      kind: retreat ? ManeuverKind.RETREAT : ManeuverKind.FORMATION,
      targetId: null, formationSlot: slot, formationVelocity: { x: 0, z: 0 },
      breakFormation: true, faceAngle: angle, speedLimit: hold ? 12 : 45 },
  };
}
