// Pure authored-presentation runway policy shared by the renderer and performance evidence.
// Keep this module free of Three.js and browser globals so focused contract tests can exercise the
// same prediction used by the live renderer.

import {
  authoredImmediateRadius,
  authoredLookaheadSeconds,
  authoredPrefetchRadius,
  glassCornerWu,
  isCriticalStartingHub,
  tableLookAtDelta,
  tableTravelSpeed,
} from './tabletopPolicy.js';
import { entityPresenceRadius } from '../world/activityClassification.js';
import { isPresentationLedgerRow } from '../world/presentationSources.js';
import { itineraryVelocityInto } from '../world/worldCatchup.js';

const _authoredLookDelta = { x: 0, z: 0 };
const _rowSchedVel = { x: 0, z: 0 };

// Ledger rows carry their motion in the itinerary schedule — advanceWorldRecord zeroes the
// stored vel — so the closing-speed clause must read the cruise velocity there, else inbound
// traffic predicts as static and the runway fires ~2-4 s late.
function closingVelocity(entity, state) {
  if (isPresentationLedgerRow(entity) && entity.intent && Number.isFinite(entity.lastExactT)) {
    const simTime = Number.isFinite(state && state.simTime)
      ? state.simTime
      : ((state && state.tick) | 0) / 60;
    const along = itineraryVelocityInto(entity.intent, simTime, _rowSchedVel);
    if (along) return along;
  }
  return { x: Number(entity.vel?.x) || 0, z: Number(entity.vel?.z) || 0 };
}

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

  const look = tableLookAtDelta(state, player.pos, entity.pos, _authoredLookDelta);
  const dx = Number(look.x);
  const dz = Number(look.z);
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance)) return false;
  const visual = entityPresenceRadius(entity);
  const surface = Math.max(0, distance - visual);
  if (surface <= immediate) return true;
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const requested = Number(camera.zoom);
  const live = Number(camera.liveZoom);
  const zoom = Math.max(
    Number.isFinite(live) ? live : 0,
    Number.isFinite(requested) ? requested : 0,
  ) || 144;
  const tilt = Number.isFinite(Number(camera.tilt)) ? Number(camera.tilt) : 60;
  const fov = Number.isFinite(Number(camera.fov))
    ? Number(camera.fov)
    : (Number.isFinite(Number(video.fov)) ? Number(video.fov) : 50);
  const aspect = Number.isFinite(Number(camera.aspect)) && Number(camera.aspect) > 0
    ? Number(camera.aspect)
    : 16 / 9;
  const glass = glassCornerWu(zoom, fov, aspect, tilt);
  if (surface <= glass) return true;
  if (distance <= 0) return false;

  const entityVel = closingVelocity(entity, state);
  const relativeX = (Number(player.vel?.x) || 0) - entityVel.x;
  const relativeZ = (Number(player.vel?.z) || 0) - entityVel.z;
  const closingSpeed = (dx * relativeX + dz * relativeZ) / distance;
  // Already inside the 4s authored decode radius: start decode even if the contact is sliding
  // along the rim (closing speed <= 1). That skip was a late-pop hole for crossing traffic.
  if (surface <= prefetch) return true;
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


