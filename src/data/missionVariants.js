// Deterministic mission variants layered onto the ordinary mission offer grammar.
// Pure data/helpers only: missions remains the board/lifecycle owner, cargo remains the inventory
// writer, and physics remains the motion/contact owner.
import { missionConditionById, serializableMissionCondition } from './missionConditions.js';
import { clauseById } from './contractClauses.js';

export const QUIET_DELIVERY_VARIANT_ID = 'quiet_delivery';
export const QUIET_DELIVERY_RECOVERY_SOURCE = 'quietDeliveryRecovery';
export const QUIET_DELIVERY_DRAW_MODULO = 3;
export const QUIET_DELIVERY_TERM_IDS = Object.freeze(['steady_hands', 'fragile_intact']);
export const PEST_CONTROL_VARIANT_ID = 'pest_control';
export const PEST_CONTROL_FOLLOWUP_SOURCE = 'pestControlFollowup';
export const PEST_CONTROL_DRAW_MODULO = 3;
export const PEST_CONTROL_ARCHETYPE_ID = 'wasp_swarmer';
export const DEBRIS_RECOVERY_VARIANT_ID = 'debris_recovery';
export const DEBRIS_RECOVERY_FOLLOWUP_SOURCE = 'debrisRecoveryFollowup';
export const DEBRIS_RECOVERY_DRAW_MODULO = 3;
export const DISABLE_DONT_KILL_VARIANT_ID = 'disable_dont_kill';
export const DISABLE_DONT_KILL_DRAW_MODULO = 3;
export const LOUD_DELIVERY_VARIANT_ID = 'loud_delivery';
export const LOUD_DELIVERY_DRAW_MODULO = 3;
export const WRECK_TOW_VARIANT_ID = 'wreck_tow';
export const WRECK_TOW_DRAW_MODULO = 3;
export const ROCK_DIVERSION_VARIANT_ID = 'rock_diversion';
export const ROCK_DIVERSION_DRAW_MODULO = 3;
export const ATMOSPHERE_RESCUE_VARIANT_ID = 'atmosphere_rescue';
export const ATMOSPHERE_RESCUE_DRAW_MODULO = 3;
export const ATMOSPHERE_RESCUE_SITE_ID = 'planet_tethys_anvil';
export const ATMOSPHERE_RESCUE_ZONE_ID = 'zone_tethys_anvil';
export const ATMOSPHERE_RESCUE_DEST_SECTOR_ID = 'sector_tethys_junction';

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

/** One in three ordinary salvage rolls becomes Debris Recovery without consuming board RNG. */
export function shouldRollDebrisRecovery(hashValue) {
  return (Number(hashValue) >>> 0) % DEBRIS_RECOVERY_DRAW_MODULO === 0;
}

export function debrisRecoveryPods(commodityId, quantity, requestedCount) {
  const total = Math.max(2, Math.floor(Number(quantity) || 2));
  const count = Math.min(total, Math.max(2, Math.floor(Number(requestedCount) || 2)));
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, slot) => ({
    slot,
    commodityId,
    amount: base + (slot < remainder ? 1 : 0),
  }));
}

/** Stamp one ordinary salvage offer as a multi-body recovery field. */
export function applyDebrisRecoveryVariant(offer, fieldName = 'the marked field', podCount = 2) {
  if (!offer || offer.type !== 'salvage_retrieval') return offer;
  const params = offer.params || {};
  const pods = debrisRecoveryPods(params.cmdtyId, params.qty, podCount);
  return {
    ...offer,
    destStationId: null,
    title: `Debris Recovery — ${pods.length} Tumbling Pods near ${fieldName}`,
    brief: `Pull ${pods.length} specific pods from a tumbling debris field near ${fieldName}.`,
    duration_s: Math.max(1, Number(offer.time_limit_s) || 1),
    variantId: DEBRIS_RECOVERY_VARIANT_ID,
    params: {
      ...params,
      missionVariant: DEBRIS_RECOVERY_VARIANT_ID,
      debrisRecovery: {
        fieldName,
        generation: 0,
        pods,
      },
    },
  };
}

export function isDebrisRecovery(value) {
  return !!(value && (
    value.variantId === DEBRIS_RECOVERY_VARIANT_ID
    || value.params && value.params.missionVariant === DEBRIS_RECOVERY_VARIANT_ID
  ));
}

export function debrisRecoveryFollowupOfferId(mission) {
  const sourceId = mission && (mission.sourceOfferId || mission.id);
  return sourceId ? `mo_debris_fragments_${String(sourceId)}` : null;
}

export function isDebrisRecoveryFollowup(value) {
  return !!(value && value.source === DEBRIS_RECOVERY_FOLLOWUP_SOURCE
    && value.params && value.params.debrisRecovery
    && Number(value.params.debrisRecovery.generation) === 1);
}

/** One in three ordinary bounty rolls becomes a nonlethal capture warrant. */
export function shouldRollDisableDontKill(hashValue) {
  return (Number(hashValue) >>> 0) % DISABLE_DONT_KILL_DRAW_MODULO === 0;
}

/** Pin the existing No Kills term onto a fully priced ordinary bounty offer. */
export function applyDisableDontKillVariant(offer, destinationName = 'the marked sector') {
  if (!offer || offer.type !== 'bounty_hunt') return offer;
  const clause = clauseById('no_kills');
  const noKills = clause ? [{
    id: clause.id,
    event: clause.event,
    label: clause.label,
    prose: clause.prose,
    rewardMult: clause.rewardMult,
  }] : [];
  return {
    ...offer,
    title: `Disable, Don’t Kill — Take the Warrant Alive near ${destinationName}`,
    brief: `Disable the quarry's drive, reel it under Massline, and tow it into lawful custody.`,
    variantId: DISABLE_DONT_KILL_VARIANT_ID,
    params: {
      ...(offer.params || {}),
      missionVariant: DISABLE_DONT_KILL_VARIANT_ID,
      disableDontKill: { generation: 0 },
    },
    clauses: noKills,
  };
}

export function isDisableDontKill(value) {
  return !!(value && (
    value.variantId === DISABLE_DONT_KILL_VARIANT_ID
    || value.params && value.params.missionVariant === DISABLE_DONT_KILL_VARIANT_ID
  ));
}

export function disableDontKillFollowupOfferId(mission) {
  const sourceId = mission && (mission.sourceOfferId || mission.id);
  return sourceId ? `mo_capture_black_box_${String(sourceId)}` : null;
}

/** One in three remaining lawful bounty rolls becomes a heavy disabled-hull tow. */
export function shouldRollWreckTow(hashValue) {
  return (Number(hashValue) >>> 0) % WRECK_TOW_DRAW_MODULO === 0;
}

/** Reframe a priced lawful bounty as a drive-dead hull recovery using the same custody route. */
export function applyWreckTowVariant(offer, destinationName = 'the marked recovery yard') {
  if (!offer || offer.type !== 'bounty_hunt') return offer;
  return {
    ...offer,
    title: `Wreck Tow — Disabled Mule to ${destinationName}`,
    brief: `Her drive is dead and scavengers are inbound. Take the heavy hull under Massline to ${destinationName}.`,
    variantId: WRECK_TOW_VARIANT_ID,
    params: {
      ...(offer.params || {}),
      missionVariant: WRECK_TOW_VARIANT_ID,
      wreckTow: {
        generation: 0,
        hullDefId: 'ship_mule',
        hullName: 'Disabled Recovery Mule',
      },
    },
    clauses: [],
  };
}

export function isWreckTow(value) {
  return !!(value && (
    value.variantId === WRECK_TOW_VARIANT_ID
    || value.params && value.params.missionVariant === WRECK_TOW_VARIANT_ID
  ));
}

export function wreckTowFollowupOfferId(mission) {
  const sourceId = mission && (mission.sourceOfferId || mission.id);
  return sourceId ? `mo_wreck_tow_black_box_${String(sourceId)}` : null;
}

/** One in three ordinary recon rolls becomes the contracted form of Plan 20's falling-rock event. */
export function shouldRollRockDiversion(hashValue) {
  return (Number(hashValue) >>> 0) % ROCK_DIVERSION_DRAW_MODULO === 0;
}

/** Name the physical emergency on the ordinary board before the player accepts it. */
export function applyRockDiversionVariant(offer, destinationName = 'the marked approach') {
  if (!offer || offer.type !== 'recon_scan') return offer;
  return {
    ...offer,
    title: `Rock Diversion — Collision Course near ${destinationName}`,
    brief: `A falling rock is minutes from the burn line. Turn it with charges, mass-driver fire, or a Massline tow-burn.`,
    duration_s: Math.max(1, Number(offer.time_limit_s) || 1),
    variantId: ROCK_DIVERSION_VARIANT_ID,
    params: {
      ...(offer.params || {}),
      missionVariant: ROCK_DIVERSION_VARIANT_ID,
      rockDiversion: { generation: 0, encounterId: null, outcome: null },
    },
    clauses: [],
  };
}

export function isRockDiversion(value) {
  return !!(value && (
    value.variantId === ROCK_DIVERSION_VARIANT_ID
    || value.params && value.params.missionVariant === ROCK_DIVERSION_VARIANT_ID
  ));
}

export function rockDiversionFollowupOfferId(mission) {
  const sourceId = mission && (mission.sourceOfferId || mission.id);
  return sourceId ? `mo_rock_diversion_recorder_${String(sourceId)}` : null;
}

/** One in three ordinary recon rolls becomes the physical rescue at The Anvil. */
export function shouldRollAtmosphereRescue(hashValue) {
  return (Number(hashValue) >>> 0) % ATMOSPHERE_RESCUE_DRAW_MODULO === 0;
}

/** Name the tumbling hull and burn line on the ordinary board before acceptance. */
export function applyAtmosphereRescueVariant(offer) {
  if (!offer || offer.type !== 'recon_scan') return offer;
  return {
    ...offer,
    destStationId: null,
    destSectorId: ATMOSPHERE_RESCUE_DEST_SECTOR_ID,
    title: 'Atmosphere Rescue — Tumbling Ship at The Anvil',
    brief: "She's tumbling, two minutes from the burn line. Take her under Massline and pull her clear.",
    // The atmosphere is the hard clock. A second mission-owned timer would duplicate that authority.
    duration_s: null,
    variantId: ATMOSPHERE_RESCUE_VARIANT_ID,
    params: {
      ...(offer.params || {}),
      missionVariant: ATMOSPHERE_RESCUE_VARIANT_ID,
      atmosphereRescue: {
        generation: 0,
        siteId: ATMOSPHERE_RESCUE_SITE_ID,
        zoneId: ATMOSPHERE_RESCUE_ZONE_ID,
        targetDefId: 'ship_kestrel',
        targetName: 'Stricken Hitch',
        tetherLatched: false,
        outcome: null,
      },
    },
    clauses: [],
  };
}

export function isAtmosphereRescue(value) {
  return !!(value && (
    value.variantId === ATMOSPHERE_RESCUE_VARIANT_ID
    || value.params && value.params.missionVariant === ATMOSPHERE_RESCUE_VARIANT_ID
  ));
}

export function atmosphereRescueFollowupOfferId(mission) {
  const sourceId = mission && (mission.sourceOfferId || mission.id);
  return sourceId ? `mo_atmosphere_black_box_${String(sourceId)}` : null;
}

/** One in three ordinary smuggling rolls becomes a physical scan-net delivery. */
export function shouldRollLoudDelivery(hashValue) {
  return (Number(hashValue) >>> 0) % LOUD_DELIVERY_DRAW_MODULO === 0;
}

/** Stamp the Loud physical situation onto a normal, fully priced smuggling offer. */
export function applyLoudDeliveryVariant(offer) {
  if (!offer || offer.type !== 'smuggling_run') return offer;
  return {
    ...offer,
    title: `Loud Delivery — ${offer.title}`,
    brief: `Contraband through a live customs scan net. Clear it cold, in an ion storm, or with a physical decoy.`,
    duration_s: Math.max(1, Number(offer.time_limit_s) || 1),
    variantId: LOUD_DELIVERY_VARIANT_ID,
    preloadedCargo: true,
    params: {
      ...(offer.params || {}),
      missionVariant: LOUD_DELIVERY_VARIANT_ID,
      loudDelivery: {
        generation: 0,
        scanNetCleared: false,
        method: null,
        encounterId: null,
      },
    },
    clauses: [],
  };
}

export function isLoudDelivery(value) {
  return !!(value && (
    value.variantId === LOUD_DELIVERY_VARIANT_ID
    || value.params && value.params.missionVariant === LOUD_DELIVERY_VARIANT_ID
  ));
}

export function loudDeliveryFollowupOfferId(mission) {
  const sourceId = mission && (mission.sourceOfferId || mission.id);
  return sourceId ? `mo_loud_burned_drop_${String(sourceId)}` : null;
}
