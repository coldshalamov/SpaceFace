// Pure authored-presentation runway policy shared by the renderer and performance evidence.
// Keep this module free of Three.js and browser globals so focused contract tests can exercise the
// same prediction used by the live renderer.

import {
  authoredImmediateRadius,
  authoredLookaheadSeconds,
  authoredPrefetchRadius,
  glassCornerWu,
  isCriticalStartingHub,
  tableTravelSpeed,
} from './tabletopPolicy.js';

export const AUTHORED_ASSET_PREFETCH_RADIUS = authoredPrefetchRadius();
export const AUTHORED_ASSET_IMMEDIATE_RADIUS = authoredImmediateRadius();
export const AUTHORED_ASSET_LOOKAHEAD_SECONDS = authoredLookaheadSeconds();
export { isCriticalStartingHub };

/**
 * True when an entity is already eligible for authored admission, or will become eligible inside
 * a bounded observation horizon. The renderer passes a zero horizon; performance capture passes
 * its upcoming sample duration so an inbound boundary cannot begin decoding inside measurement.
 */
export function willEntityEnterAuthoredUpgradeRunway(entity, state, {
  radius = null,
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

  const travel = tableTravelSpeed(state);
  const numericRadius = Number(radius);
  const prefetch = radius == null || !Number.isFinite(numericRadius)
    ? authoredPrefetchRadius(travel)
    : numericRadius;
  const immediate = authoredImmediateRadius(travel);
  const lookahead = authoredLookaheadSeconds();

  const dx = Number(entity.pos.x) - Number(player.pos.x);
  const dz = Number(entity.pos.z) - Number(player.pos.z);
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance)) return false;
  const visual = Math.max(0, Number(entity.radius) || 0);
  const surface = Math.max(0, distance - visual);
  if (surface <= immediate) return true;
  const zoom = Number(state && state.camera && state.camera.zoom);
  const tilt = Number(state && state.camera && state.camera.tilt);
  const glass = glassCornerWu(
    Number.isFinite(zoom) ? zoom : 144,
    50,
    16 / 9,
    Number.isFinite(tilt) ? tilt : 60,
  );
  if (surface <= glass) return true;
  if (distance <= 0) return false;

  const relativeX = (Number(player.vel?.x) || 0) - (Number(entity.vel?.x) || 0);
  const relativeZ = (Number(player.vel?.z) || 0) - (Number(entity.vel?.z) || 0);
  const closingSpeed = (dx * relativeX + dz * relativeZ) / distance;
  if (closingSpeed <= 1) return false;

  const horizon = Math.max(0, Number(horizonSeconds) || 0);
  const futureDistance = Math.max(0, distance - closingSpeed * horizon);
  return futureDistance <= prefetch
    && futureDistance - closingSpeed * lookahead <= immediate;
}

function playerEntity(state) {
  if (state?.entities && typeof state.entities.get === 'function') {
    const player = state.entities.get(state.playerId);
    if (player) return player;
  }
  return (state?.entityList || []).find((candidate) => candidate?.id === state?.playerId) || null;
}


