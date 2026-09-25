import { stableId } from './contracts.js';
import {
  OPTIC_MAX_FAMILY,
  OPTIC_MAX_GENERATION,
  OPTIC_RAY_COUNT,
  OPTIC_RAY_RADIUS,
  opticHeadings,
  opticMaterialOf,
  traceOpticRay,
} from '../combat/opticField.js';
import { WEAPONS } from '../data/weapons.js';

export const FRIENDLY_FIRE_CORRIDOR_WU = 6;
const CLEAR = Object.freeze({ clear: true, blockerId: null, reason: null });

/**
 * Pure ballistic-lane gate. The firing adapter supplies its exact lead angle; this function checks
 * the finite segment from the shooter to the target range against allied ship/drone hulls. It does
 * not change targeting or maneuver state, so an obstructed pilot holds fire instead of jittering.
 */
export function assessFriendlyFireLane({ shooter, target, aimAngle, entities, corridor = FRIENDLY_FIRE_CORRIDOR_WU } = {}) {
  if (!shooter || !shooter.pos || !target || !target.pos || !Number.isFinite(aimAngle)) return CLEAR;
  const dx = target.pos.x - shooter.pos.x;
  const dz = target.pos.z - shooter.pos.z;
  const targetRange = Math.hypot(dx, dz);
  if (!(targetRange > 1e-6)) return CLEAR;
  const dirX = Math.cos(aimAngle);
  const dirZ = Math.sin(aimAngle);
  const source = Array.isArray(entities)
    ? entities
    : (entities && typeof entities.values === 'function' ? entities.values() : []);
  let blocker = null;
  let bestAlong = Infinity;
  for (const ally of source) {
    if (!ally || ally.alive === false || ally.id === shooter.id || ally.id === target.id) continue;
    if (ally.type !== 'ship' && ally.type !== 'drone') continue;
    if (ally.team == null || ally.team !== shooter.team) continue;
    const ax = ally.pos.x - shooter.pos.x;
    const az = ally.pos.z - shooter.pos.z;
    const along = ax * dirX + az * dirZ;
    const muzzleClear = Math.max(1, Number(shooter.radius) || 0);
    const laneEnd = targetRange + Math.max(0, Number(target.radius) || 0);
    if (along <= muzzleClear || along >= laneEnd) continue;
    const lateralSq = Math.max(0, ax * ax + az * az - along * along);
    const clearance = Math.max(0, Number(ally.radius) || 0) + Math.max(0, corridor);
    if (lateralSq > clearance * clearance) continue;
    if (along < bestAlong || (along === bestAlong && stableId(ally.id) < stableId(blocker && blocker.id))) {
      blocker = ally;
      bestAlong = along;
    }
  }
  if (!blocker) return CLEAR;
  return Object.freeze({ clear: false, blockerId: blocker.id, reason: 'ally_in_lane' });
}

const WEAPON_DEF_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));
const OPTIC_HEADINGS = opticHeadings(OPTIC_RAY_COUNT);
export const OPTIC_SPLINTER_RETURN_REASON = 'optic_splinter_return';

/**
 * Does this mount's volley contain an energy bolt? Mirrors weapons.js's resolution
 * (`w.damageType || def.damageType || 'kinetic'`). A defensive-only mount cannot be part of an
 * offensive salvo, and hitscan/continuous beams never spawn a bolt entity, so neither can light
 * the lattice. Kinetic/explosive ships are unaffected by the gate — their rounds do not prism.
 */
export function firesEnergyVolley(weapons) {
  if (!Array.isArray(weapons)) return false;
  for (const w of weapons) {
    if (!w || w.defensiveOnly === true) continue;
    const def = WEAPON_DEF_BY_ID.get(w.defId || w.id || w.weaponId);
    const tracking = w.tracking || (def && def.tracking);
    if (tracking === 'hitscan' || (def && def.continuous) || w.continuous === true) continue;
    const type = w.damageType || (def && def.damageType) || 'kinetic';
    if (type === 'energy') return true;
  }
  return false;
}

function opticLaneIterable(entities) {
  if (Array.isArray(entities)) return entities;
  if (entities && typeof entities.values === 'function') return entities.values();
  return [];
}

/** Anything a bolt or splinter can strike: a live colliding body with a real hull circle. */
function splinterBody(entity) {
  return !!entity
    && entity.alive !== false
    && entity.type !== 'projectile'
    && entity.collides !== false
    && !!entity.pos
    && (Number(entity.radius) || 0) > 0;
}

/**
 * Optic fire discipline — the "don't light the field in your own face" gate. When an
 * energy-armed shooter's firing lane strikes a pale diamond, that diamond throws an eight-way
 * splinter ring (and chained diamonds re-prism down the fuse, one prism per surface per shot —
 * the same book-keeping `settleOpticContact` applies at impact). This gate replays that cascade
 * with the grammar's own `traceOpticRay` and holds fire when a live splinter corridor lands on
 * the shooter's own position or a same-team hull. A ring that dies in the stone border, or one
 * that reaches the target, is a safe shot and stays clear.
 *
 * `entities` is every body a bolt or splinter could meet — the live collidable index or the
 * entity list in minimal states. Iterated twice; never copied. Only reachable from
 * `applyAIFiringIntent`, which owns aimAngle.
 */
export function assessOpticSplinterReturn({ shooter, target, aimAngle, entities, weapons } = {}) {
  if (!shooter || !shooter.pos || !target || !target.pos || !Number.isFinite(aimAngle)) return CLEAR;
  if (!firesEnergyVolley(weapons)) return CLEAR;
  const dx = target.pos.x - shooter.pos.x;
  const dz = target.pos.z - shooter.pos.z;
  const targetRange = Math.hypot(dx, dz);
  if (!(targetRange > 1e-6)) return CLEAR;
  const dirX = Math.cos(aimAngle);
  const dirZ = Math.sin(aimAngle);
  const muzzleClear = Math.max(1, Number(shooter.radius) || 0);
  const laneEnd = targetRange + Math.max(0, Number(target.radius) || 0);

  // First contact on the firing lane. A bolt absorbed by stone or stopped by any nearer body
  // never reaches a diamond, so only the closest hit on the segment decides.
  let firstOptic = null;
  let firstOpticAlong = Infinity;
  let firstSolidAlong = Infinity;
  for (const body of opticLaneIterable(entities)) {
    if (!splinterBody(body) || body === shooter || body === target) continue;
    const bx = body.pos.x - shooter.pos.x;
    const bz = body.pos.z - shooter.pos.z;
    const along = bx * dirX + bz * dirZ;
    if (along <= muzzleClear || along >= laneEnd || along >= firstSolidAlong) continue;
    const lateralSq = Math.max(0, bx * bx + bz * bz - along * along);
    const reach = (Number(body.radius) || 0) + OPTIC_RAY_RADIUS;
    if (lateralSq > reach * reach) continue;
    firstSolidAlong = along;
    if (opticMaterialOf(body)) {
      firstOptic = body;
      firstOpticAlong = along;
    }
  }
  if (!firstOptic || firstOpticAlong > firstSolidAlong) return CLEAR;
  const material = opticMaterialOf(firstOptic);
  if (!material || material.response !== 'prism') return CLEAR;

  // The shot prisms `firstOptic`. Map every lane-solid body into the flat {x,z,radius} shape the
  // optic tracer consumes, then walk the cascade exactly like the family book: each diamond
  // fires once, splinters under OPTIC_MAX_GENERATION re-prism the next diamond they meet.
  const bodies = [];
  for (const entity of opticLaneIterable(entities)) {
    if (!splinterBody(entity)) continue;
    bodies.push({
      x: entity.pos.x,
      z: entity.pos.z,
      radius: Number(entity.radius) || 0,
      entity,
    });
  }
  const originIndex = bodies.findIndex((body) => body.entity === firstOptic);
  if (originIndex < 0) return CLEAR;

  const visited = new Set();
  const queue = [{ index: originIndex, rayGeneration: 1 }];
  let spawned = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { index, rayGeneration } = queue[cursor];
    if (visited.has(index)) continue;
    visited.add(index);
    // planOpticContact emits the first `count` headings of the ring and spends them from the
    // family budget — a dried-up family prisms nothing further down the chain.
    const count = Math.min(OPTIC_HEADINGS.length, Math.max(0, OPTIC_MAX_FAMILY - spawned));
    if (count <= 0) break;
    spawned += count;
    for (let h = 0; h < count; h++) {
      const hit = traceOpticRay(bodies, index, OPTIC_HEADINGS[h]);
      if (hit < 0) continue;
      const hitEntity = bodies[hit].entity;
      if (hitEntity === shooter
        || ((hitEntity.type === 'ship' || hitEntity.type === 'drone')
          && hitEntity.team != null && hitEntity.team === shooter.team)) {
        return Object.freeze({
          clear: false,
          blockerId: firstOptic.id != null ? firstOptic.id : null,
          reason: OPTIC_SPLINTER_RETURN_REASON,
        });
      }
      if (rayGeneration < OPTIC_MAX_GENERATION) {
        const hitMaterial = opticMaterialOf(hitEntity);
        if (hitMaterial && hitMaterial.response === 'prism' && !visited.has(hit)) {
          queue.push({ index: hit, rayGeneration: rayGeneration + 1 });
        }
      }
    }
  }
  return CLEAR;
}
