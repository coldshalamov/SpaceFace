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
  const surface = cause === KillCause.TERRAIN_COLLISION
    ? 'terrain'
    : cause === KillCause.SHIP_COLLISION ? 'craft' : null;

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
