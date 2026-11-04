// Read-only physical obstacles across the core-entity and cold-dressing domains.
import { queryNearbyEntities } from './spatialQuery.js';
import { physicsBodyNativeReady, resolvePhysicsBodySpec } from './physicsAuthority.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';
import { resolveCollisionProxyManifest, proxyOuterRadiusWu, proxyScaleFor } from '../data/collisionProxyManifests.js';

function nativeDressingSpec(e) {
  if (!e || e.alive === false || !e.pos || e.collides === false || !physicsBodyNativeReady(e)
    || !e.physicsBody || typeof e.physicsBody !== 'object') return null;
  const spec = resolvePhysicsBodySpec(e);
  return spec && !PHYSICS_MATERIALS[spec.material]?.ghost ? spec : null;
}

export function physicalObstacleRadius(e) {
  if (!e || e.alive === false || e.collides === false || !e.pos
    || e.type === 'projectile' || e.type === 'pickup') return null;
  if (e.type === 'fx') {
    const spec = nativeDressingSpec(e);
    if (!spec) return null;
    const manifest = resolveCollisionProxyManifest(e);
    let hullReach = 0;
    for (const vertex of manifest?.compactHull || []) {
      if (Number.isFinite(vertex.x) && Number.isFinite(vertex.z)) {
        hullReach = Math.max(hullReach, Math.hypot(vertex.x, vertex.z));
      }
    }
    return Math.max(Number.isFinite(e.radius) ? e.radius : 0, spec.radius,
      manifest ? Math.max(proxyOuterRadiusWu(manifest, e), hullReach * proxyScaleFor(e, manifest)) : 0);
  }
  const radius = Number.isFinite(e.radius) ? e.radius : 0;
  return radius > 0 || ['station', 'asteroid', 'wreck', 'ship'].includes(e.type) ? radius : null;
}

// Bound views describe contacts without replacing the original row or its life token.
export function physicalObstacleBody(e, bounds, index) {
  const radius = physicalObstacleRadius(e);
  if (radius == null) return null;
  if (e.type !== 'fx') return e;
  const bound = bounds[index] || (bounds[index] = {});
  bound.id = e.id;
  bound.type = e.type;
  bound.alive = e.alive;
  bound.occupantGeneration = e.occupantGeneration;
  bound.pos = e.pos;
  bound.vel = e.vel;
  bound.radius = radius;
  return bound;
}

const COHORTS = new WeakMap();
const EMPTY = Object.freeze([]);

// Dressing insertion/removal and home/pose changes are journalled by table.version.
// Cache only sector membership; mutable admission/material/pose are read on every call.
// The returned scratch array is consumed synchronously, never retained by a caller.
export function currentSolidDressingRows(state) {
  const table = state?.world?.dressing;
  if (!table || !Array.isArray(table.rows)) return EMPTY;
  const sectorId = state.world.currentSectorId || null;
  let cache = COHORTS.get(table);
  if (!cache || cache.version !== table.version || cache.rows !== table.rows
    || cache.length !== table.rows.length || cache.sectorId !== sectorId) {
    cache = { version: table.version, rows: table.rows, length: table.rows.length, sectorId, cohort: [], live: [] };
    for (const row of table.rows) {
      const home = row?.homeSectorId || row?.data?.homeSectorId;
      if (row && (!sectorId || !home || home === sectorId)) cache.cohort.push(row);
    }
    COHORTS.set(table, cache);
  }
  cache.live.length = 0;
  for (const row of cache.cohort) if (row.collides === true && nativeDressingSpec(row)) cache.live.push(row);
  return cache.live;
}

const SEEN = new Set();
export function queryNearbyPhysicalObstacles(state, pos, radius, out) {
  const core = queryNearbyEntities(state, pos, radius, out);
  if (core !== out) {
    out.length = 0;
    for (const entity of core) out.push(entity);
  }
  SEEN.clear();
  for (const entity of out) if (entity) SEEN.add(entity.id);
  for (const row of currentSolidDressingRows(state)) {
    if (SEEN.has(row.id)) continue;
    const reach = radius + physicalObstacleRadius(row);
    const dx = row.pos.x - pos.x, dz = row.pos.z - pos.z;
    if (dx * dx + dz * dz > reach * reach) continue;
    out.push(row);
    SEEN.add(row.id);
  }
  return out;
}
