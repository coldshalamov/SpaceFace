// Pure authored-presentation runway policy shared by the renderer and performance evidence.
// Keep this module free of Three.js and browser globals so focused contract tests can exercise the
// same prediction used by the live renderer.

export const AUTHORED_ASSET_PREFETCH_RADIUS = 2400;
export const AUTHORED_ASSET_IMMEDIATE_RADIUS = 1000;
export const AUTHORED_ASSET_LOOKAHEAD_SECONDS = 10;

/**
 * True when an entity is already eligible for authored admission, or will become eligible inside
 * a bounded observation horizon. The renderer passes a zero horizon; performance capture passes
 * its upcoming sample duration so an inbound boundary cannot begin decoding inside measurement.
 */
export function willEntityEnterAuthoredUpgradeRunway(entity, state, {
  radius = AUTHORED_ASSET_PREFETCH_RADIUS,
  horizonSeconds = 0,
} = {}) {
  if (!entity || entity.alive === false) return false;
  if (entity.id === state?.playerId || entity.isPlayer === true) return true;
  if (entity.flags?.forceRender || entity.flags?.neverCull) return true;

  const player = playerEntity(state);
  const targetId = state?.player?.targetId != null
    ? state.player.targetId
    : player?.targetId;
  if (targetId != null && entity.id === targetId) return true;
  if (isCriticalStartingHub(entity)) return true;
  if (!player?.pos || !entity.pos) return false;

  const dx = Number(entity.pos.x) - Number(player.pos.x);
  const dz = Number(entity.pos.z) - Number(player.pos.z);
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance)) return false;
  if (distance <= AUTHORED_ASSET_IMMEDIATE_RADIUS) return true;
  if (distance <= 0) return false;

  const relativeX = (Number(player.vel?.x) || 0) - (Number(entity.vel?.x) || 0);
  const relativeZ = (Number(player.vel?.z) || 0) - (Number(entity.vel?.z) || 0);
  const closingSpeed = (dx * relativeX + dz * relativeZ) / distance;
  if (closingSpeed <= 1) return false;

  const horizon = Math.max(0, Number(horizonSeconds) || 0);
  const futureDistance = Math.max(0, distance - closingSpeed * horizon);
  return futureDistance <= radius
    && futureDistance - closingSpeed * AUTHORED_ASSET_LOOKAHEAD_SECONDS
      <= AUTHORED_ASSET_IMMEDIATE_RADIUS;
}

function playerEntity(state) {
  if (state?.entities && typeof state.entities.get === 'function') {
    const player = state.entities.get(state.playerId);
    if (player) return player;
  }
  return (state?.entityList || []).find((candidate) => candidate?.id === state?.playerId) || null;
}

function isCriticalStartingHub(entity) {
  if (!entity || entity.type !== 'station') return false;
  const data = entity.data || {};
  if (entity.id === 'station_helios' || data.stationId === 'station_helios') return true;
  const token = String(data.archetypeGlb || data.placeId || '')
    .replace(/^places\//, '')
    .replace(/\.glb$/, '');
  return token === 'place_station_trade_hub' && data.sectorId === 'sector_helios_prime';
}
