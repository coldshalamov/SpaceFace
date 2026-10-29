import { ManeuverKind } from './contracts.js';
import { PALLET_JACK } from '../data/palletJack.js';

// One maneuver/flight owner. This shapes its intent, never writes a force or velocity.
export function palletJackDecision(decision, state, entityId = decision?.entityId) {
  const e = state.entities.get(entityId), view = e?.data?.palletJack;
  if (e?.data?.lootTableId !== PALLET_JACK.enemyId || !view) return decision;
  const hold = ['negotiating', 'drop'].includes(view.phase);
  const windup = ['target', 'grab', 'acquiring'].includes(view.phase);
  const slot = view.flightPoint || e.pos;
  return { ...decision, targetId: null, fire: false, allowedActionId: null,
    maneuver: { ...(decision.maneuver || {}), entityId: e.id, kind: ManeuverKind.FORMATION,
      // Outside sensor range, direct the owner at the live cargo-relative slot using the
      // existing intercept envelope. Once the cargo is sensed, the formation contact-seek
      // branch below uses its measured velocity for the final physical approach.
      targetId: view.phase === 'approach' || windup ? view.targetEntityId ?? null : null,
      formationSlot: { ...slot },
      flightPoint: view.phase === 'approach' || windup ? { ...slot } : null,
      seekContactWhenAvailable: view.phase === 'approach',
      matchFormationVelocity: windup,
      formationVelocity: hold ? { x: 0, z: 0 } : view.flightVelocity || { x: 0, z: 0 },
      enemyMindOwned: true, breakFormation: true, formationBound: 0,
      faceAngle: view.faceAngle ?? e.rot, speedLimit: hold ? 8 : view.loaded ? 35 : 55,
      reason: 'pallet-jack-physical-freight' },
  };
}
