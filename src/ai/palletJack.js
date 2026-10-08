import { ManeuverKind } from './contracts.js';
import { PALLET_JACK } from '../data/palletJack.js';

// One maneuver/flight owner. This shapes its intent, never writes a force or velocity.
export function palletJackDecision(decision, state) {
  const e = state.entities.get(decision?.entityId), view = e?.data?.palletJack;
  if (e?.data?.lootTableId !== PALLET_JACK.enemyId || !view) return decision;
  const hold = ['target', 'grab', 'acquiring', 'negotiating', 'drop'].includes(view.phase);
  const slot = view.flightPoint || e.pos;
  return { ...decision, targetId: null, fire: false, allowedActionId: null,
    maneuver: { ...(decision.maneuver || {}), entityId: e.id, kind: ManeuverKind.FORMATION,
      targetId: view.targetEntityId ?? null, formationSlot: { ...slot }, flightPoint: { ...slot },
      formationVelocity: hold ? { x: 0, z: 0 } : view.flightVelocity || { x: 0, z: 0 },
      enemyMindOwned: true, breakFormation: true, formationBound: 0,
      faceAngle: view.faceAngle ?? e.rot, speedLimit: hold ? 8 : view.loaded ? 35 : 55,
      reason: 'pallet-jack-physical-freight' },
  };
}
