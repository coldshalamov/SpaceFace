// Deterministic mission variants layered onto the ordinary mission offer grammar.
// Pure data/helpers only: missions remains the board/lifecycle owner, cargo remains the inventory
// writer, and physics remains the motion/contact owner.
import { missionConditionById, serializableMissionCondition } from './missionConditions.js';

export const QUIET_DELIVERY_VARIANT_ID = 'quiet_delivery';
export const QUIET_DELIVERY_RECOVERY_SOURCE = 'quietDeliveryRecovery';
export const QUIET_DELIVERY_DRAW_MODULO = 3;
export const QUIET_DELIVERY_TERM_IDS = Object.freeze(['steady_hands', 'fragile_intact']);

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
