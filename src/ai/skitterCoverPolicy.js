// Pure deterministic Skitter cover selection and spring predicates. World mutation, physics,
// presentation, and AI runtime ownership remain in their respective systems.
import { distance2, hashUnit, stableId } from './contracts.js';
import { SKITTER_ROCK_NEST } from '../data/swarmerFamily.js';

export const SKITTER_SPRING_RADIUS_WU = 900;
export const SKITTER_ROCK_MOVE_THRESHOLD_WU = 12;
export const SKITTER_RETURN_RADIUS_WU = 46;
export const SKITTER_DEPARTURE_RADIUS_WU = 120;
export const SKITTER_MIN_RETURN_TICKS = 60;

/**
 * Select one stable rock from a spatially bounded candidate set and derive the hull point on the
 * side opposite the player. Input order never matters and no RNG stream is consumed.
 */
export function selectSkitterCover({
  seed = 1,
  entityId,
  squadId = null,
  anchor,
  playerPos,
  rocks,
  hullRadiusWu = 0,
  excludeRockId = null,
} = {}) {
  if (entityId == null || !anchor || !Array.isArray(rocks)) return null;
  const maxDistanceSq = SKITTER_ROCK_NEST.searchRadiusWu * SKITTER_ROCK_NEST.searchRadiusWu;
  const eligible = [];
  for (const rock of rocks) {
    if (!rock || rock.id == null || rock.id === excludeRockId || rock.alive === false || rock.type !== 'asteroid') continue;
    const radius = positive(rock.radius, 0);
    if (radius < SKITTER_ROCK_NEST.minRockRadiusWu || !rock.pos || distanceSq(anchor, rock.pos) > maxDistanceSq) continue;
    eligible.push(rock);
  }
  eligible.sort((a, b) => stableId(a.id).localeCompare(stableId(b.id)));
  if (eligible.length > SKITTER_ROCK_NEST.maxCandidateRocks) eligible.length = SKITTER_ROCK_NEST.maxCandidateRocks;
  if (!eligible.length) return null;

  // Prefer a rock whose far-side berth does not begin inside its own spring radius. This preserves
  // the authored warning window when a field supplies both near and far rocks; all candidates remain
  // deterministic fallbacks when a cramped field has no such berth.
  const assignments = eligible.map((rock) => assignmentForRock(rock, playerPos, hullRadiusWu, seed, entityId));
  const safe = assignments.filter((assignment) => !playerPos
    || distance2(playerPos, assignment.coverPoint) > SKITTER_SPRING_RADIUS_WU);
  const pool = safe.length ? safe : assignments;
  const index = Math.min(pool.length - 1, Math.floor(hashUnit(seed, squadId, entityId, 'skitter_cover') * pool.length));
  return Object.freeze({
    ...pool[index],
    candidateCount: eligible.length,
  });
}

/** Return the first material trigger for a nested Skitter, with cover failure winning proximity. */
export function skitterSpringReason({ cover, rock, playerPos, events } = {}) {
  if (!cover || !cover.coverPoint) return null;
  if (!rock || rock.alive === false) return 'cover_broken';
  if (!rock.pos || distance2(rock.pos, cover.rockOrigin) > SKITTER_ROCK_MOVE_THRESHOLD_WU) return 'cover_moved';
  if (Array.isArray(events) && events.some((event) => event && event.type === 'damage_received')) return 'nest_shot';
  if (playerPos && distance2(playerPos, cover.coverPoint) <= SKITTER_SPRING_RADIUS_WU) return 'player_close';
  return null;
}

export function skitterReachedCover(pos, coverPoint) {
  return !!pos && !!coverPoint && distance2(pos, coverPoint) <= SKITTER_RETURN_RADIUS_WU;
}

export function skitterDepartedCover(pos, coverPoint) {
  return !!pos && !!coverPoint && distance2(pos, coverPoint) >= SKITTER_DEPARTURE_RADIUS_WU;
}

function assignmentForRock(rock, playerPos, hullRadiusWu, seed, entityId) {
  const rockX = finite(rock.pos && rock.pos.x);
  const rockZ = finite(rock.pos && rock.pos.z);
  let dx = rockX - finite(playerPos && playerPos.x, rockX);
  let dz = rockZ - finite(playerPos && playerPos.z, rockZ);
  let length = Math.hypot(dx, dz);
  if (length <= 1e-6) {
    const angle = hashUnit(seed, entityId, rock.id, 'skitter_far_side') * Math.PI * 2;
    dx = Math.cos(angle);
    dz = Math.sin(angle);
    length = 1;
  }
  const standoff = positive(rock.radius, SKITTER_ROCK_NEST.minRockRadiusWu)
    + SKITTER_ROCK_NEST.standoffPadWu + Math.max(0, finite(hullRadiusWu));
  return Object.freeze({
    rockId: rock.id,
    rockOrigin: Object.freeze({ x: rockX, z: rockZ }),
    coverPoint: Object.freeze({ x: rockX + dx / length * standoff, z: rockZ + dz / length * standoff }),
    rockRadiusWu: positive(rock.radius, SKITTER_ROCK_NEST.minRockRadiusWu),
  });
}

function distanceSq(a, b) {
  const dx = finite(a && a.x) - finite(b && b.x);
  const dz = finite(a && a.z) - finite(b && b.z);
  return dx * dx + dz * dz;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
