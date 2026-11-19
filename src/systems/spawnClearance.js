// OVH-09a / R11 (design/overhaul/03_COMBAT.md §5): the calm world. One shared spawn-admission
// contract for every NPC and loose-rock spawner. A candidate point is clear only when:
//   1. no live body — and no dormant asteroid-field record — sits inside the clearance
//      radius `2 × body radius + 40 WU`, and
//   2. nothing's straight-line predicted path reaches the point within 2 s (the spawn's own
//      velocity counts too: a body that will be born moving must not be born on a course).
// A blocked request retries a bounded, deterministic candidate walk instead of spawning
// onto a body or a collision course. Swarm gate arrivals keep their own swept search in
// swarmSafety.js — gates are geometry, not a generic seat.
import { SIM_TIER, PRESENTATION_TIER } from '../world/activityClassification.js';
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';

export const SPAWN_CLEAR_RADIUS_MULT = 2;
export const SPAWN_CLEAR_MARGIN_WU = 40;
export const SPAWN_PATH_PREDICT_S = 2;
export const SPAWN_CLEAR_MAX_ATTEMPTS = 12;

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = 2.399963229728653;
const EPS = 1e-9;
const SOLIDS = new Set(['asteroid', 'wreck', 'station', 'ship', 'drone']);
const finite = (n, fallback = 0) => (Number.isFinite(n) ? n : fallback);

/** The R11 clearance radius a spawn of `bodyRadius` owes every live body. */
export function spawnClearanceRadius(bodyRadius) {
  return SPAWN_CLEAR_RADIUS_MULT * Math.max(0, finite(bodyRadius)) + SPAWN_CLEAR_MARGIN_WU;
}

/**
 * The disc one obstacle occupies for admission: the LARGER of its authored radius and its
 * resolved native collider. Same rule as swarmSafety.clearanceFootprint — a dormant field
 * record or a reserved candidate measures like the body it is about to be.
 */
function obstacleFootprint(row) {
  const authored = finite(row && row.radius, 0);
  const native = resolvePhysicsBodySpec(row)?.radius;
  return Math.max(authored, Number.isFinite(native) ? native : 0);
}

function normalizeSkip(ignore) {
  if (!ignore) return null;
  if (typeof ignore === 'function') return ignore;
  if (ignore instanceof Set) {
    return (row) => ignore.has(row) || (row && row.id != null && ignore.has(row.id));
  }
  if (Array.isArray(ignore)) {
    const set = new Set();
    for (const row of ignore) {
      set.add(row);
      if (row && row.id != null) set.add(row.id);
    }
    return (row) => set.has(row) || (row && row.id != null && set.has(row.id));
  }
  const ref = ignore;
  return (row) => row === ref || (row && ref && row.id != null && row.id === ref.id);
}

/** Solid occupants only — any live body the solver would push apart is an obstacle. */
function isObstacle(row, skip) {
  if (!row || row.alive === false || row.collides === false || !row.pos) return false;
  if (skip && skip(row)) return false;
  if (SOLIDS.has(row.type)) return true;
  const spec = row.physicsBody;
  return !!(spec && spec.schemaVersion === 1 && spec.material !== 'massline_sensor');
}

/**
 * Closest-approach test of two discs over `horizon` seconds of straight-line relative
 * motion. The candidate is the point (x, z) carrying spawn velocity `vel`; the obstacle
 * moves by its own stored velocity. Relative speed ~0 collapses to the plain disc test —
 * a static body inside the clearance fails exactly like a crossing one.
 */
function clearsObstacle(x, z, vel, clearance, horizon, obstacle) {
  const rx = finite(obstacle.pos.x) - x;
  const rz = finite(obstacle.pos.z) - z;
  const vx = finite(obstacle.vel && obstacle.vel.x) - finite(vel && vel.x);
  const vz = finite(obstacle.vel && obstacle.vel.z) - finite(vel && vel.z);
  const speed2 = vx * vx + vz * vz;
  const t = speed2 > 1e-12
    ? Math.max(0, Math.min(horizon, -(rx * vx + rz * vz) / speed2))
    : 0;
  const dx = rx + vx * t;
  const dz = rz + vz * t;
  const reach = clearance + obstacleFootprint(obstacle);
  return dx * dx + dz * dz >= reach * reach - EPS;
}

/**
 * True when a body of `request.radius` born at (x, z) with velocity `request.vel` would
 * neither overlap a live body inside `2r + 40` nor sit on a 2 s collision course with one.
 *
 * request: { x, z, radius, vel?, horizon?, clearance?, ignore?, reserved?,
 *            includeDormantFieldRocks? }
 *   ignore:    entity | id | predicate | Set | Array — rows skipped (e.g. the requester
 *              itself, or a durable row being relocated).
 *   reserved:  extra obstacle rows (same-batch accepted bodies that are not entities yet).
 *   includeDormantFieldRocks (default true): shelf records count as obstacles — a body
 *              born inside a dormant rock becomes a depenetration yeet on promote.
 */
export function spawnPointIsClear(state, request = {}) {
  if (!Number.isFinite(request.x) || !Number.isFinite(request.z)) return false;
  const radius = finite(request.radius);
  const clearance = Number.isFinite(request.clearance)
    ? Math.max(0, request.clearance)
    : spawnClearanceRadius(radius);
  const horizon = Number.isFinite(request.horizon)
    ? Math.max(0, request.horizon)
    : SPAWN_PATH_PREDICT_S;
  const vel = request.vel || null;
  const skip = normalizeSkip(request.ignore);
  const entities = state && state.entities;
  const occupants = entities && typeof entities.values === 'function'
    ? entities.values()
    : (state && state.entityList) || [];
  for (const entity of occupants) {
    if (!isObstacle(entity, skip)) continue;
    if (!clearsObstacle(request.x, request.z, vel, clearance, horizon, entity)) return false;
  }
  if (request.includeDormantFieldRocks !== false) {
    const rocks = state && state.world && state.world.asteroidField
      && state.world.asteroidField.rocks;
    if (Array.isArray(rocks)) {
      for (const rec of rocks) {
        if (!rec || rec.alive === false || rec.liveEntityId != null || !rec.pos) continue;
        if (skip && skip(rec)) continue;
        if (!clearsObstacle(request.x, request.z, vel, clearance, horizon, rec)) return false;
      }
    }
  }
  for (const row of request.reserved || []) {
    if (!row || !row.pos) continue;
    if (!clearsObstacle(request.x, request.z, vel, clearance, horizon, row)) return false;
  }
  return true;
}

/**
 * Bounded deterministic retry around a blocked spawn point. Attempt 0 is always the
 * requested point — an already-clear request keeps its exact spot and consumes no rng.
 * Later attempts come from `request.candidateAt(attempt, rng)` when the caller owns the
 * geometry (a ring, a lane, a frozen seam), or from the shared expanding-ring walk which
 * draws one rng() per candidate from `request.rng` (default `state.rng`). Exhausted walks
 * return null; the caller decides between a legacy fallback and not spawning.
 *
 * Returns { x, z, attempt } or null.
 */
export function findClearSpawnPoint(state, request = {}) {
  const base = { x: request.x, z: request.z };
  if (!Number.isFinite(base.x) || !Number.isFinite(base.z)) return null;
  const attempts = Math.max(1, Math.floor(finite(request.attempts, SPAWN_CLEAR_MAX_ATTEMPTS)));
  const candidateAt = typeof request.candidateAt === 'function' ? request.candidateAt : null;
  const rng = typeof request.rng === 'function' ? request.rng
    : (state && typeof state.rng === 'function' ? state.rng : null);
  const clearance = Number.isFinite(request.clearance)
    ? Math.max(0, request.clearance)
    : spawnClearanceRadius(finite(request.radius));
  for (let attempt = 0; attempt < attempts; attempt++) {
    let pos;
    if (attempt === 0) {
      pos = base;
    } else if (candidateAt) {
      const proposed = candidateAt(attempt, rng);
      if (!proposed || !Number.isFinite(proposed.x) || !Number.isFinite(proposed.z)) break;
      pos = proposed;
    } else {
      // Shared expanding-ring walk: rings grow by one clearance per six candidates; the
      // bearing comes from the caller's deterministic stream (or a golden-angle fallback
      // when no stream exists — pure geometry, still deterministic).
      const angle = rng ? rng() * TAU : attempt * GOLDEN_ANGLE;
      const band = 1 + Math.floor((attempt - 1) / 6);
      const step = clearance * band + ((attempt - 1) % 6) * 4;
      pos = { x: base.x + Math.cos(angle) * step, z: base.z + Math.sin(angle) * step };
    }
    if (spawnPointIsClear(state, { ...request, x: pos.x, z: pos.z })) {
      return { x: pos.x, z: pos.z, attempt };
    }
  }
  return null;
}

/**
 * Spec-level admission: run the shared contract on an already-built spawn spec and move
 * spec.pos to the admitted candidate. Returns true when a seat exists (the requested point
 * counts — an unchanged spec is still admitted) and false on an exhausted walk, leaving the
 * spec untouched so the caller decides between its own fallback and not spawning.
 *
 * request: any spawnPointIsClear field to override (rng, attempts, reserved, ignore, ...).
 */
export function resolveClearSpawnPos(state, spec, request = {}) {
  const pos = spec && spec.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  const clear = findClearSpawnPoint(state, {
    ...request,
    x: pos.x,
    z: pos.z,
    radius: Number.isFinite(request.radius)
      ? request.radius
      : (Number.isFinite(spec.radius) ? spec.radius : 10),
    vel: request.vel !== undefined ? request.vel : (spec.vel || null),
  });
  if (!clear) return false;
  pos.x = clear.x;
  pos.z = clear.z;
  return true;
}

/**
 * The rest stamp of ruling R11 item 1 on a live loose-rock entity: zero linear velocity
 * (angular velocity stays — presentation spin) and the dormant activity record that makes
 * the native body owner create its Rapier body already asleep. Rocks on the dormant
 * shelf carry no body at all — this mark is for bodies born live (keep-live anchors,
 * regrowth seams, debris, promotion). The next classify pass restamps tier from truth:
 * a rock born beside the pilot is near-tier and honest awake physics; a rock born far
 * stays dormant and does not integrate until something touches it.
 */
export function markFieldRockAtRest(entity, options = {}) {
  if (!entity || entity.alive === false) return entity;
  if (entity.vel && typeof entity.vel === 'object') {
    entity.vel.x = 0;
    entity.vel.z = 0;
    if (Number.isFinite(entity.vel.y)) entity.vel.y = 0;
  }
  entity.physicsSleeping = true;
  if (entity.activity == null) {
    const simTime = Number.isFinite(options.simTime) ? options.simTime : 0;
    Object.defineProperty(entity, 'activity', {
      value: {
        simTier: SIM_TIER.S3_DORMANT,
        presentationTier: PRESENTATION_TIER.R3_UNLOADED,
        nextEventAtT: -1,
        pins: [],
        pinnedExact: false,
        lastExactT: -1,
        lastObservedT: simTime,
        graceUntilT: -1,
      },
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }
  return entity;
}
