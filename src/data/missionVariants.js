// Deterministic mission variants layered onto the ordinary mission offer grammar.
// Pure data/helpers only: missions remains the board/lifecycle owner, cargo remains the inventory
// writer, and physics remains the motion/contact owner.
import { missionConditionById, serializableMissionCondition } from './missionConditions.js';

export const QUIET_DELIVERY_VARIANT_ID = 'quiet_delivery';
export const QUIET_DELIVERY_RECOVERY_SOURCE = 'quietDeliveryRecovery';
export const QUIET_DELIVERY_DRAW_MODULO = 3;
export const QUIET_DELIVERY_TERM_IDS = Object.freeze(['steady_hands', 'fragile_intact']);
export const PEST_CONTROL_VARIANT_ID = 'pest_control';
export const PEST_CONTROL_FOLLOWUP_SOURCE = 'pestControlFollowup';
export const PEST_CONTROL_DRAW_MODULO = 3;
export const PEST_CONTROL_ARCHETYPE_ID = 'wasp_swarmer';

/** One in three ordinary cargo-delivery rolls becomes Quiet Delivery, without consuming board RNG. */
export function shouldRollQuietDelivery(hashValue) {
  return (Number(hashValue) >>> 0) % QUIET_DELIVERY_DRAW_MODULO === 0;
}

/** Canonical serializable condition rows. The condition catalog remains the rules/copy authority. */
export function quietDeliveryTerms() {
  return QUIET_DELIVERY_TERM_IDS
    .map((id) => serializableMissionCondition(id))
    .filter(Boolean);
}

/** Stamp the player-visible variant onto a normal, fully priced cargo_delivery offer. */
export function applyQuietDeliveryVariant(offer) {
  if (!offer || offer.type !== 'cargo_delivery') return offer;
  const clauses = quietDeliveryTerms();
  const termBrief = QUIET_DELIVERY_TERM_IDS
    .map((id) => missionConditionById(id))
    .map((condition) => condition && condition.brief)
    .filter(Boolean)
    .join(' ');
  const baseBrief = String(offer.brief || '').trim();
  return {
    ...offer,
    title: `Quiet Delivery — ${offer.title}`,
    brief: `${baseBrief}${baseBrief ? ' ' : ''}${termBrief}`,
    variantId: QUIET_DELIVERY_VARIANT_ID,
    preloadedCargo: true,
    params: {
      ...(offer.params || {}),
      missionVariant: QUIET_DELIVERY_VARIANT_ID,
    },
    clauses,
  };
}

export function isQuietDelivery(value) {
  return !!(value && (
    value.variantId === QUIET_DELIVERY_VARIANT_ID
    || value.params && value.params.missionVariant === QUIET_DELIVERY_VARIANT_ID
  ));
}

export function quietDeliveryRecoveryOfferId(mission) {
  const sourceId = mission && (mission.sourceOfferId || mission.id);
  return sourceId ? `mo_quiet_recovery_${String(sourceId)}` : null;
}

export function isQuietDeliveryRecovery(value) {
  return !!(value && value.source === QUIET_DELIVERY_RECOVERY_SOURCE
    && value.params && value.params.quietDeliveryRecovery);
}

/** One in three ordinary patrol rolls becomes Pest Control, without consuming board RNG. */
export function shouldRollPestControl(hashValue) {
  return (Number(hashValue) >>> 0) % PEST_CONTROL_DRAW_MODULO === 0;
}

/** Stamp one ordinary patrol offer as an all-wasp claim job. */
export function applyPestControlVariant(offer, claimName = 'the claim') {
  if (!offer || offer.type !== 'patrol_clear') return offer;
  const clearCount = Math.max(2, Math.floor(Number(offer.params && offer.params.clearCount) || 2));
  return {
    ...offer,
    title: `Pest Control — Wasp Nest near ${claimName}`,
    brief: `A wasp nest is eating ${claimName}'s yield. Clear ${clearCount} live signatures before it spreads.`,
    duration_s: Math.max(1, Number(offer.time_limit_s) || 1),
    variantId: PEST_CONTROL_VARIANT_ID,
    params: {
      ...(offer.params || {}),
      missionVariant: PEST_CONTROL_VARIANT_ID,
      pestControl: {
        archetypeId: PEST_CONTROL_ARCHETYPE_ID,
        claimName,
        generation: 0,
      },
    },
  };
}

export function isPestControl(value) {
  return !!(value && (
    value.variantId === PEST_CONTROL_VARIANT_ID
    || value.params && value.params.missionVariant === PEST_CONTROL_VARIANT_ID
  ));
}

export function pestControlFollowupOfferId(mission) {
  const sourceId = mission && (mission.sourceOfferId || mission.id);
  return sourceId ? `mo_pest_spread_${String(sourceId)}` : null;
}

export function isPestControlFollowup(value) {
  return !!(value && value.source === PEST_CONTROL_FOLLOWUP_SOURCE
    && value.params && value.params.pestControl
    && Number(value.params.pestControl.generation) === 1);
}
