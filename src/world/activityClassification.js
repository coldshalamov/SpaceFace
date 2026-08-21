// Deterministic activity classification. Pure. Does not deactivate bodies or
// strip AI — Phase 1 only names pins and tiers so later deactivation is legal.

export const SIM_TIER = Object.freeze({
  S0_EXACT: 'S0_EXACT',
  S1_NEAR: 'S1_NEAR',
  S2_ABSTRACT: 'S2_ABSTRACT',
  S3_DORMANT: 'S3_DORMANT',
  S4_AGGREGATE: 'S4_AGGREGATE',
});

export const PRESENTATION_TIER = Object.freeze({
  R0_GLASS: 'R0_GLASS',
  R1_RUNWAY: 'R1_RUNWAY',
  R2_METADATA: 'R2_METADATA',
  R3_UNLOADED: 'R3_UNLOADED',
});

export const PIN_REASON = Object.freeze({
  PLAYER: 'PLAYER',
  CURRENT_TARGET: 'CURRENT_TARGET',
  RECENTLY_DAMAGED_BY_PLAYER: 'RECENTLY_DAMAGED_BY_PLAYER',
  RECENTLY_DAMAGED_PLAYER: 'RECENTLY_DAMAGED_PLAYER',
  HOSTILE_AGGRO: 'HOSTILE_AGGRO',
  PROJECTILE_THREAT: 'PROJECTILE_THREAT',
  TETHER_OR_ATTACHMENT_COMPONENT: 'TETHER_OR_ATTACHMENT_COMPONENT',
  DOCKING_OR_LANDING: 'DOCKING_OR_LANDING',
  MISSION_CRITICAL: 'MISSION_CRITICAL',
  ESCORT_OR_FOLLOW_RELATION: 'ESCORT_OR_FOLLOW_RELATION',
  HAIL_OR_SCRIPTED_CONVERSATION: 'HAIL_OR_SCRIPTED_CONVERSATION',
  PLAYER_MINING_TARGET: 'PLAYER_MINING_TARGET',
  PLAYER_SCANNED_AND_TRACKED: 'PLAYER_SCANNED_AND_TRACKED',
  IMMINENT_COLLISION: 'IMMINENT_COLLISION',
  VISIBLE_ON_GLASS: 'VISIBLE_ON_GLASS',
});

const PIN_SET = new Set(Object.values(PIN_REASON));

export const COLLISION_LOOKAHEAD_S = 0.75;
export const PHYSICS_SAFETY_PAD_WU = 24;
export const NEAR_ENTER_PAD_WU = 80;
export const NEAR_EXIT_PAD_WU = 140;
export const DEFAULT_GRACE_S = 2;

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

function hypot2(ax, az, bx, bz) {
  const dx = finite(ax) - finite(bx);
  const dz = finite(az) - finite(bz);
  return dx * dx + dz * dz;
}

export function physicsReachWu(options = {}) {
  const glassDiag = Math.max(0, finite(options.glassDiagonalWu));
  const speed = Math.max(0, finite(options.maxRelativeSpeedWu));
  const look = Math.max(0, finite(options.collisionLookaheadS, COLLISION_LOOKAHEAD_S));
  const collider = Math.max(0, finite(options.largestColliderRadiusWu));
  const pad = options.safetyPadWu == null ? PHYSICS_SAFETY_PAD_WU : Math.max(0, finite(options.safetyPadWu));
  return glassDiag + speed * (look || COLLISION_LOOKAHEAD_S) + collider + pad;
}

export function normalizePinReasons(list) {
  const out = [];
  const seen = new Set();
  const src = Array.isArray(list) ? list : [];
  for (let i = 0; i < src.length; i++) {
    const reason = src[i];
    if (!PIN_SET.has(reason) || seen.has(reason)) continue;
    seen.add(reason);
    out.push(reason);
  }
  out.sort();
  return out;
}

/**
 * Collect explicit pins. Never infers independently from unrelated systems —
 * callers pass the facts they already own.
 */
export function resolvePins(entity, context = {}) {
  const pins = [];
  if (!entity) return pins;
  const playerId = context.playerId;
  if (entity.isPlayer === true || entity.id === playerId) pins.push(PIN_REASON.PLAYER);
  if (context.currentTargetId != null && entity.id === context.currentTargetId) {
    pins.push(PIN_REASON.CURRENT_TARGET);
  }
  if (context.visibleOnGlass === true) pins.push(PIN_REASON.VISIBLE_ON_GLASS);
  if (context.hostileAggro === true) pins.push(PIN_REASON.HOSTILE_AGGRO);
  if (context.projectileThreat === true) pins.push(PIN_REASON.PROJECTILE_THREAT);
  if (context.tetherOrAttachment === true) pins.push(PIN_REASON.TETHER_OR_ATTACHMENT_COMPONENT);
  if (context.dockingOrLanding === true) pins.push(PIN_REASON.DOCKING_OR_LANDING);
  if (context.missionCritical === true) pins.push(PIN_REASON.MISSION_CRITICAL);
  if (context.escortOrFollow === true) pins.push(PIN_REASON.ESCORT_OR_FOLLOW_RELATION);
  if (context.hailOrConversation === true) pins.push(PIN_REASON.HAIL_OR_SCRIPTED_CONVERSATION);
  if (context.playerMiningTarget === true) pins.push(PIN_REASON.PLAYER_MINING_TARGET);
  if (context.playerScannedAndTracked === true) pins.push(PIN_REASON.PLAYER_SCANNED_AND_TRACKED);
  if (context.imminentCollision === true) pins.push(PIN_REASON.IMMINENT_COLLISION);
  const now = finite(context.simTime);
  const damagedByPlayerUntil = finite(context.damagedByPlayerUntilT, -1);
  const damagedPlayerUntil = finite(context.damagedPlayerUntilT, -1);
  if (damagedByPlayerUntil >= 0 && now <= damagedByPlayerUntil) {
    pins.push(PIN_REASON.RECENTLY_DAMAGED_BY_PLAYER);
  }
  if (damagedPlayerUntil >= 0 && now <= damagedPlayerUntil) {
    pins.push(PIN_REASON.RECENTLY_DAMAGED_PLAYER);
  }
  const d = entity.data || {};
  const flags = entity.flags || {};
  if (flags.missionPinned || d.missionPinned || d.missionId || d.missionTag) {
    pins.push(PIN_REASON.MISSION_CRITICAL);
  }
  return normalizePinReasons(pins);
}

export function resolvePresentationTier(options = {}) {
  if (options.onGlass === true) return PRESENTATION_TIER.R0_GLASS;
  if (options.onRunway === true) return PRESENTATION_TIER.R1_RUNWAY;
  if (options.mapOrRadar === true) return PRESENTATION_TIER.R2_METADATA;
  return PRESENTATION_TIER.R3_UNLOADED;
}

export function resolveSimTier(entity, pins, context = {}) {
  const reasons = normalizePinReasons(pins);
  if (reasons.length > 0) return SIM_TIER.S0_EXACT;
  if (entity && entity.isPlayer === true) return SIM_TIER.S0_EXACT;
  if (context.aggregateOnly === true) return SIM_TIER.S4_AGGREGATE;
  if (context.dormant === true) return SIM_TIER.S3_DORMANT;

  const origin = context.origin;
  const pos = entity && entity.pos;
  const dist2 = origin && pos ? hypot2(pos.x, pos.z, origin.x, origin.z) : Infinity;
  const reach = Math.max(0, finite(context.physicsReachWu));
  const enter = reach + NEAR_ENTER_PAD_WU;
  const exit = reach + NEAR_EXIT_PAD_WU;
  const prior = context.priorSimTier;
  const graceUntil = finite(context.graceUntilT, -1);
  const now = finite(context.simTime);

  if (prior === SIM_TIER.S0_EXACT || prior === SIM_TIER.S1_NEAR) {
    if (now <= graceUntil) return prior;
    if (dist2 <= exit * exit) return SIM_TIER.S1_NEAR;
  }
  if (Number.isFinite(dist2) && dist2 <= enter * enter) return SIM_TIER.S1_NEAR;
  if (context.hasItinerary === true || (entity && entity.data && entity.data.itinerary)) {
    return SIM_TIER.S2_ABSTRACT;
  }
  return SIM_TIER.S3_DORMANT;
}

export function classifyActivity(entity, context = {}) {
  const pins = resolvePins(entity, context);
  const simTier = resolveSimTier(entity, pins, context);
  const presentationTier = resolvePresentationTier(context);
  return {
    pins,
    simTier,
    presentationTier,
    pinnedExact: pins.length > 0,
  };
}
