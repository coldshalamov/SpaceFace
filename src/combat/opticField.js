// Environmental optic grammar. An energy bolt that hits a tagged asteroid is absorbed,
// reflected, or split into a ring. Physics still owns the contact; this module only
// decides what that contact means and where the ring leaves the rock.
//
// Diamonds sit on an 8-way lattice so each splinter flies into the next cell or into a
// stone that eats it. A diamond fires once per shot family, so a field burns like a fuse
// and then goes quiet until the next bolt.

import { applyReflectedVelocity, reflectVelocity } from '../core/surfaceContact.js';
import { armAttackContinue, requestAttackContinue } from './attackHit.js';

export const OPTIC_MATERIALS = Object.freeze({
  stone: Object.freeze({
    id: 'stone',
    response: 'absorb',
    typeId: 'ast_common_rock',
    tint: 0x6b6358,
    radius: 34,
    surfaceMaterial: 'rock',
  }),
  metal: Object.freeze({
    id: 'metal',
    response: 'reflect',
    typeId: 'ast_metallic',
    tint: 0xd5dee8,
    radius: 16,
    surfaceMaterial: 'mirror',
  }),
  diamond: Object.freeze({
    id: 'diamond',
    response: 'prism',
    typeId: 'ast_crystalline',
    tint: 0xe7fbff,
    radius: 13,
    surfaceMaterial: 'optic_diamond',
  }),
});

export const OPTIC_RAY_COUNT = 8;
export const OPTIC_MAX_GENERATION = 14;
export const OPTIC_MAX_FAMILY = 160;
export const OPTIC_DAMAGE_SCALE = 0.92;
// Long enough to cross a combat-zoom table and still have travel left after one
// bounce. The ping-pong test still kills the ray: each reflect spends the
// distance already flown, and this budget runs out inside a few seconds.
export const OPTIC_RAY_RANGE = 1600;
export const OPTIC_RAY_RADIUS = 2.2;
export const OPTIC_RAY_SPEED = 220;
export const OPTIC_LATTICE_SPACING = 64;
export const OPTIC_RAY_CLEARANCE = 1.5;

const TAU = Math.PI * 2;

export function opticMaterialOf(entity) {
  const id = entity && entity.data && entity.data.opticMaterial;
  const material = typeof id === 'string' ? OPTIC_MATERIALS[id] : null;
  return material || null;
}

export function isOpticEnergyBolt(projectile) {
  const data = projectile && projectile.data;
  if (!data) return false;
  if (data.kind === 'missile') return false;
  const damageType = data.damageType || 'kinetic';
  return damageType === 'energy';
}

export function opticGenerationOf(projectile) {
  const generation = projectile && projectile.data && projectile.data.opticGeneration;
  return Number.isInteger(generation) && generation > 0 ? generation : 0;
}

export function opticFamilyIdOf(projectile) {
  const stamped = projectile && projectile.data && projectile.data.opticFamilyId;
  if (typeof stamped === 'string' && stamped) return stamped;
  const id = projectile && projectile.id != null ? projectile.id : 'bolt';
  return `optic:${id}`;
}

export function opticBookFor(store, familyId) {
  if (!store || typeof store.get !== 'function') {
    throw new TypeError('optic book store must be a Map');
  }
  let row = store.get(familyId);
  if (!row) {
    row = { spawned: 0, visited: new Set() };
    store.set(familyId, row);
  }
  return row;
}

/** Book keys must be stable across number/string entity ids. */
export function opticSurfaceKey(target) {
  if (!target || target.id == null) return null;
  return String(target.id);
}

export function opticHeadings(count = OPTIC_RAY_COUNT) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  const headings = [];
  for (let i = 0; i < n; i++) headings.push((i / n) * TAU);
  return headings;
}

export function opticRayOrigin(center, targetRadius, heading, childRadius = OPTIC_RAY_RADIUS) {
  const pad = Math.max(0, Number(targetRadius) || 0) + childRadius + OPTIC_RAY_CLEARANCE;
  return {
    heading,
    x: (Number(center && center.x) || 0) + Math.cos(heading) * pad,
    z: (Number(center && center.z) || 0) + Math.sin(heading) * pad,
  };
}

function outwardNormal(target, point) {
  const cx = target && target.pos ? Number(target.pos.x) || 0 : 0;
  const cz = target && target.pos ? Number(target.pos.z) || 0 : 0;
  let nx = (point && Number(point.x) || 0) - cx;
  let nz = (point && Number(point.z) || 0) - cz;
  const length = Math.hypot(nx, nz);
  if (!(length > 1e-8)) return { x: 1, z: 0 };
  return { x: nx / length, z: nz / length };
}

function segmentCircleT(sx, sz, ex, ez, cx, cz, radius) {
  const dx = ex - sx;
  const dz = ez - sz;
  const len2 = dx * dx + dz * dz;
  if (!(len2 > 1e-9)) return null;
  const relX = sx - cx;
  const relZ = sz - cz;
  const b = 2 * (relX * dx + relZ * dz);
  const c = relX * relX + relZ * relZ - radius * radius;
  const disc = b * b - 4 * len2 * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t0 = (-b - root) / (2 * len2);
  const t1 = (-b + root) / (2 * len2);
  if (t0 >= 0 && t0 <= 1) return t0;
  if (t1 >= 0 && t1 <= 1) return t1;
  return null;
}

/** First other body a splinter would meet. -1 means the ray leaves the set. */
export function traceOpticRay(bodies, originIndex, heading, reach = OPTIC_RAY_RANGE) {
  const origin = bodies && bodies[originIndex];
  if (!origin) return -1;
  const start = opticRayOrigin(origin, origin.radius, heading);
  const ex = start.x + Math.cos(heading) * reach;
  const ez = start.z + Math.sin(heading) * reach;
  let best = -1;
  let bestT = Infinity;
  for (let i = 0; i < bodies.length; i++) {
    if (i === originIndex) continue;
    const body = bodies[i];
    const t = segmentCircleT(
      start.x,
      start.z,
      ex,
      ez,
      body.x,
      body.z,
      (Number(body.radius) || 0) + OPTIC_RAY_RADIUS,
    );
    if (t != null && t < bestT) {
      bestT = t;
      best = i;
    }
  }
  return best;
}

/**
 * Decide one energy-bolt contact. Does not spawn and does not mark the book.
 * `book` is read ({ spawned, visited }).
 */
export function planOpticContact({
  material,
  projectile,
  target,
  payload,
  book,
} = {}) {
  if (!material || !isOpticEnergyBolt(projectile) || !target) return null;
  const response = material.response;
  if (response === 'absorb') return { kind: 'absorb', reason: 'stone', materialId: material.id };
  if (response === 'reflect') {
    const normal = payload && payload.normal
      ? { x: Number(payload.normal.x) || 0, z: Number(payload.normal.z) || 0 }
      : outwardNormal(target, payload && payload.pos);
    const velocity = reflectVelocity(projectile.vel || { x: 0, z: 0 }, normal);
    return { kind: 'reflect', reason: 'metal', materialId: material.id, velocity, normal };
  }
  if (response !== 'prism') return null;

  const generation = opticGenerationOf(projectile);
  const surfaceId = opticSurfaceKey(target);
  if (surfaceId == null) return { kind: 'absorb', reason: 'spent', materialId: material.id };
  if (book && book.visited && book.visited.has(surfaceId)) {
    return { kind: 'absorb', reason: 'spent', materialId: material.id };
  }
  if (generation >= OPTIC_MAX_GENERATION) {
    return { kind: 'absorb', reason: 'generation', materialId: material.id };
  }
  const spawned = book && Number.isInteger(book.spawned) ? book.spawned : 0;
  const room = OPTIC_MAX_FAMILY - spawned;
  if (room <= 0) return { kind: 'absorb', reason: 'family', materialId: material.id };

  const count = Math.min(OPTIC_RAY_COUNT, room);
  const headings = opticHeadings(count);
  const center = target.pos || { x: 0, z: 0 };
  const rays = [];
  const nextGeneration = generation + 1;
  const familyId = opticFamilyIdOf(projectile);
  for (let i = 0; i < headings.length; i++) {
    const origin = opticRayOrigin(center, target.radius, headings[i]);
    rays.push({
      index: i,
      heading: origin.heading,
      x: origin.x,
      z: origin.z,
      generation: nextGeneration,
      familyId,
      damageScale: OPTIC_DAMAGE_SCALE,
    });
  }
  return { kind: 'prism', reason: 'diamond', materialId: material.id, rays, generation: nextGeneration };
}

function scaledChannels(packet, scale) {
  if (!packet || typeof packet !== 'object') return packet;
  const channels = { ...(packet.channels || {}) };
  const keys = Object.keys(channels);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    channels[key] = (Number(channels[key]) || 0) * scale;
  }
  return {
    ...packet,
    channels,
    statuses: Array.isArray(packet.statuses) ? packet.statuses.map((status) => ({ ...status })) : [],
  };
}

/** Spawn spec for one splinter. The weapons owner is what actually creates the entity. */
export function opticChildSpec(parent, ray) {
  const scale = ray && Number.isFinite(ray.damageScale) ? ray.damageScale : OPTIC_DAMAGE_SCALE;
  const data = { ...((parent && parent.data) || {}) };
  data.damage = (Number(data.damage) || 0) * scale;
  if (data.damagePacket) data.damagePacket = scaledChannels(data.damagePacket, scale);
  delete data.attackRuntime;
  delete data.targetId;
  delete data.turnRate;
  delete data.projAccel;
  delete data.projSpeed;
  delete data.armed;
  delete data.splashRadius;
  delete data.splashDmg;
  data.kind = 'bullet';
  data.damageType = 'energy';
  data.opticFamilyId = ray.familyId;
  data.opticGeneration = ray.generation;
  data.spawnPos = { x: ray.x, z: ray.z };
  data.maxDistance = OPTIC_RAY_RANGE;
  data.ownerId = parent ? parent.ownerId : null;
  const heading = ray.heading;
  const speed = OPTIC_RAY_SPEED;
  return {
    type: 'projectile',
    pos: { x: ray.x, z: ray.z },
    vel: { x: Math.cos(heading) * speed, z: Math.sin(heading) * speed },
    rot: heading,
    radius: OPTIC_RAY_RADIUS,
    mass: 0.1,
    team: parent ? parent.team : 0,
    ownerId: parent ? parent.ownerId : null,
    factionId: parent ? parent.factionId : null,
    ttl: Math.max(0.35, OPTIC_RAY_RANGE / speed),
    collides: true,
    data,
  };
}

function placeOutside(projectile, target, normal) {
  const pad = (Number(target && target.radius) || 0) + (Number(projectile && projectile.radius) || 0) + OPTIC_RAY_CLEARANCE;
  const nx = normal && Number.isFinite(normal.x) ? normal.x : 1;
  const nz = normal && Number.isFinite(normal.z) ? normal.z : 0;
  const length = Math.hypot(nx, nz) || 1;
  projectile.pos.x = target.pos.x + (nx / length) * pad;
  projectile.pos.z = target.pos.z + (nz / length) * pad;
}

/**
 * Keep a reflected bolt on a finite travel budget. Physics measures distance from
 * spawnPos; resetting the origin to the bounce exit and shrinking maxDistance by
 * distance already spent stops metal↔metal ping-pong inside the old range bubble.
 * Missing spawnPos/maxDistance get OPTIC_RAY_RANGE so the sweep limit actually runs.
 * Returns false when no travel remains — caller must not arm continue.
 */
export function bindOpticReflectTravel(projectile) {
  if (!projectile || !projectile.pos) return false;
  const data = projectile.data || (projectile.data = {});
  const px = Number(projectile.pos.x) || 0;
  const pz = Number(projectile.pos.z) || 0;
  const origin = data.spawnPos;
  let maxDistance = Number(data.maxDistance);
  if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.z) && maxDistance > 0) {
    const traveled = Math.hypot(px - origin.x, pz - origin.z);
    maxDistance = Math.max(0, maxDistance - traveled);
  } else if (!(maxDistance > 0)) {
    maxDistance = OPTIC_RAY_RANGE;
  }
  data.spawnPos = { x: px, z: pz };
  data.maxDistance = maxDistance;
  // physics treats maxDistance <= 0 as "no limit"; refuse continue instead.
  return maxDistance > 0;
}

/**
 * Apply one planned contact to the bolt that hit. Marks the family book.
 * Returns the plan, or null when this contact is not an optic energy bolt.
 * Prism children are not spawned here.
 */
export function settleOpticContact(projectile, target, payload, book) {
  const material = opticMaterialOf(target);
  const plan = planOpticContact({ material, projectile, target, payload, book });
  if (!plan) return null;
  if (plan.kind === 'reflect') {
    applyReflectedVelocity(projectile, plan.velocity);
    placeOutside(projectile, target, plan.normal);
    if (bindOpticReflectTravel(projectile)) {
      armAttackContinue(projectile);
      requestAttackContinue(projectile);
    }
  } else if (plan.kind === 'prism' && book) {
    const surfaceId = opticSurfaceKey(target);
    if (book.visited && surfaceId != null) book.visited.add(surfaceId);
    book.spawned = (Number.isInteger(book.spawned) ? book.spawned : 0) + plan.rays.length;
  }
  return plan;
}
