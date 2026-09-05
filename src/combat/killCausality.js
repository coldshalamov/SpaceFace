// Semantic kill causality shared by campaign combat and consequence readers.
//
// `entity:killed.presentation` owns a richer immutable presentation receipt: vectors, impact
// telemetry, and hit geometry. That receipt is deliberately transient. This module extracts only
// the compact facts simulation systems may retain or serialize without smuggling render-shaped
// data into GameState.

export const KillCause = Object.freeze({
  GENERIC: 'generic',
  KINETIC: 'kinetic',
  EXPLOSIVE: 'explosive',
  TERRAIN_COLLISION: 'terrain_collision',
  SHIP_COLLISION: 'ship_collision',
});

const CANONICAL_CAUSES = new Set(Object.values(KillCause));

// The surfaces the collision-consequence receipt admits (src/systems/collisionConsequences.js
// collisionPresentationSurface): a station is not a rock, and the durable record must say which.
export const KillSurface = Object.freeze({
  TERRAIN: 'terrain',
  CRAFT: 'craft',
  STRUCTURE: 'structure',
});

const CANONICAL_SURFACES = new Set(Object.values(KillSurface));

const FAMILY_BY_KILL_CAUSE = Object.freeze({
  [KillCause.GENERIC]: 'direct',
  [KillCause.KINETIC]: 'direct',
  [KillCause.EXPLOSIVE]: 'explosive',
  [KillCause.TERRAIN_COLLISION]: 'terrain',
  [KillCause.SHIP_COLLISION]: 'collision',
});

export function isCanonicalKillCause(value) {
  return typeof value === 'string' && CANONICAL_CAUSES.has(value);
}

export function isCanonicalKillSurface(value) {
  return typeof value === 'string' && CANONICAL_SURFACES.has(value);
}

export function normalizeKillCause(value) {
  return isCanonicalKillCause(value) ? value : KillCause.GENERIC;
}

export function killCauseFromPayload(payload) {
  const presentation = payload && payload.presentation;
  const candidates = [
    presentation && presentation.cause,
    payload && payload.cause,
  ];
  for (const candidate of candidates) {
    if (isCanonicalKillCause(candidate)) return candidate;
  }
  return KillCause.GENERIC;
}

export function compactKillCausality(payload, playerId = null) {
  const presentation = payload && payload.presentation;
  const cause = killCauseFromPayload(payload);
  const playerCaused = presentation && typeof presentation.playerCaused === 'boolean'
    ? presentation.playerCaused
    : playerId != null && !!payload && payload.killerId === playerId;
  // Prefer the receipt's own surface (terrain | craft | structure); derive from the cause only
  // when the emitter did not say. Deriving always would record a station kill as a rock kill.
  const receiptSurface = presentation && presentation.surface;
  const surface = isCanonicalKillSurface(receiptSurface)
    ? receiptSurface
    : cause === KillCause.TERRAIN_COLLISION
      ? KillSurface.TERRAIN
      : cause === KillCause.SHIP_COLLISION ? KillSurface.CRAFT : null;

  return Object.freeze({
    version: 1,
    cause,
    playerCaused,
    surface,
  });
}

export function killCauseFamily(cause) {
  return FAMILY_BY_KILL_CAUSE[normalizeKillCause(cause)];
}
