// Environmental optic grammar. An energy bolt that hits a tagged asteroid is absorbed,
// reflected, or split into a ring. Physics still owns the contact; this module only
// decides what that contact means and where the ring leaves the rock.
//
// Diamonds sit on an 8-way lattice so each splinter flies into the next cell or into a
// stone that eats it. A diamond fires once per shot family, so a field burns like a fuse —
// and each cell that threw its ring goes dark ('spent') until OPTIC_SPEND_QUIET sim-seconds
// pass with no optic contact on it, when it rekindles to live crystal.

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
  // A diamond that has fired goes dark — same collider, same rock, but it eats bolts like
  // stone until it rekindles. Not authored in recipes; only recordOpticSpend writes it.
  spent: Object.freeze({
    id: 'spent',
    response: 'absorb',
    typeId: 'ast_crystalline',
    tint: 0x3a4a58,
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
// A spent prism rekindles after this many sim-seconds without an optic energy hit on it —
// the field heals on the away-clock, never mid-volley. Two minutes matches the ore-field
// respawn scale (90–200 s): long enough that a burned gallery stays dark through the fight
// that lit it, short enough that a pilot who leaves and comes back finds live crystal.
export const OPTIC_SPEND_QUIET = 120;

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

// Missiles are ordnance, not light: the lattice still answers them (a diamond throws its ring,
// stone eats the hull), but a mirror has no energy bolt to bounce — the missile just dies there.
export function isOpticOrdnance(projectile) {
  const data = projectile && projectile.data;
  return !!(data && data.kind === 'missile');
}

// A continuous beam has no projectile body; weapons hands the grammar a bolt-shaped shim
// (opticBeamBolt) stamped kind:'beam' so the contact can split or eat the ray, while a mirror
// can never "reflect" a beam back — there is no travelling body to send home.
export function isOpticBeamContact(projectile) {
  const data = projectile && projectile.data;
  return !!(data && data.kind === 'beam');
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

// ── Spend + rekindle ────────────────────────────────────────────────────────
// A diamond that throws its ring is spent: it keeps the same body but reads 'spent' and eats
// bolts until OPTIC_SPEND_QUIET sim-seconds pass with no optic contact on it. The live timer
// sits on the entity (data.opticSpentAt); the durable copy rides the save on
// state.world.opticSpent — { [opticStructureId]: { [opticCell]: spentAt } } — because sector
// lattices are recipe-spawned, never serialized as entities. Arena lattice cells have no
// homeSectorId and stay runtime-only: a swarm run is not saved.

/** Lazily create/return the durable spend ledger (state.world.opticSpent). Null without world. */
export function opticSpendLedger(state) {
  const world = state && state.world;
  if (!world || typeof world !== 'object') return null;
  const ledger = world.opticSpent;
  if (ledger && typeof ledger === 'object' && !Array.isArray(ledger)) return ledger;
  world.opticSpent = {};
  return world.opticSpent;
}

/** Serialize-safe read of a loaded ledger: keeps only finite sim-time stamps. */
export function normalizeOpticSpendLedger(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const structureId of Object.keys(raw)) {
    const cells = raw[structureId];
    if (!cells || typeof cells !== 'object' || Array.isArray(cells)) continue;
    for (const cell of Object.keys(cells)) {
      const spentAt = cells[cell];
      if (!Number.isFinite(spentAt)) continue;
      const bucket = out[structureId] || (out[structureId] = {});
      bucket[cell] = spentAt;
    }
  }
  return out;
}

function clearLedgerCell(ledger, structureId, cell) {
  if (!ledger || structureId == null || cell == null) return;
  const cells = ledger[structureId];
  if (!cells || typeof cells !== 'object') return;
  delete cells[cell];
  if (Object.keys(cells).length === 0) delete ledger[structureId];
}

/**
 * Mark a diamond spent at `simTime`. Idempotent — a fresh spend on a dark crystal restarts
 * its quiet clock (an absorbed bolt is a re-discharge, not quiet). Writes the durable ledger
 * when the entity is a sector-owned lattice cell. Returns the spend record, or null when the
 * target is not a spendable optic cell.
 */
export function recordOpticSpend(target, simTime, ledger) {
  const data = target && target.data;
  if (!data) return null;
  const material = opticMaterialOf(target);
  if (!material || (material.id !== 'diamond' && material.id !== 'spent')) return null;
  const spentAt = Number.isFinite(simTime) ? simTime : 0;
  data.opticMaterial = 'spent';
  data.opticSpentAt = spentAt;
  if (data.tint != null) data.tint = OPTIC_MATERIALS.spent.tint;
  const structureId = typeof data.opticStructureId === 'string' ? data.opticStructureId : null;
  const cell = typeof data.opticCell === 'string' ? data.opticCell : null;
  if (ledger && structureId && cell && data.homeSectorId) {
    const cells = ledger[structureId] || (ledger[structureId] = {});
    cells[cell] = spentAt;
  }
  return { structureId, cell, spentAt, targetId: target.id == null ? null : target.id };
}

/** True while a spent cell has been quiet long enough to come back live. */
export function opticRekindleDue(entity, simTime) {
  const data = entity && entity.data;
  if (!data || data.opticMaterial !== 'spent') return false;
  const spentAt = Number.isFinite(data.opticSpentAt) ? data.opticSpentAt : 0;
  const now = Number.isFinite(simTime) ? simTime : 0;
  return now - spentAt >= OPTIC_SPEND_QUIET;
}

/** Restore a spent cell to live diamond and drop its durable ledger entry. */
export function rekindleOpticCell(entity, ledger) {
  const data = entity && entity.data;
  if (!data || data.opticMaterial !== 'spent') return false;
  data.opticMaterial = 'diamond';
  data.tint = OPTIC_MATERIALS.diamond.tint;
  delete data.opticSpentAt;
  clearLedgerCell(ledger, data.opticStructureId, data.opticCell);
  return true;
}

/** The 'optic:rekindled' payload — renderer/audio can tell dark from lit from healing. */
export function opticRekindleRecord(entity) {
  const data = entity && entity.data || {};
  return {
    targetId: entity && entity.id != null ? entity.id : null,
    structureId: data.opticStructureId || null,
    cell: data.opticCell || null,
    materialId: 'diamond',
    pos: entity && entity.pos ? { x: entity.pos.x, z: entity.pos.z } : null,
  };
}

/**
 * Rekindle pass over a small iterable of spent candidates — the weapons watchlist, not the
 * whole population. Emits 'optic:rekindled' per healed cell when `emit` is given and returns
 * the rekindled records.
 */
export function tickOpticRekindle(entities, simTime, ledger, emit) {
  const rekindled = [];
  if (!entities || typeof entities[Symbol.iterator] !== 'function') return rekindled;
  for (const entity of entities) {
    if (!opticRekindleDue(entity, simTime)) continue;
    const record = opticRekindleRecord(entity);
    if (!rekindleOpticCell(entity, ledger)) continue;
    rekindled.push(record);
    if (typeof emit === 'function') emit('optic:rekindled', record);
  }
  return rekindled;
}

/** One-shot scan for entities restored dark (sector entry / save load) to rebuild the watch. */
export function collectOpticSpentIds(state) {
  const ids = new Set();
  const list = state && state.entityList;
  if (!Array.isArray(list)) return ids;
  for (const entity of list) {
    if (entity && entity.id != null && entity.data && entity.data.opticMaterial === 'spent') {
      ids.add(entity.id);
    }
  }
  return ids;
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
 * Decide one optic contact — energy bolt, continuous-beam shim, or missile ordnance.
 * Does not spawn and does not mark the book. `book` is read ({ spawned, visited }).
 */
export function planOpticContact({
  material,
  projectile,
  target,
  payload,
  book,
} = {}) {
  if (!material || !target) return null;
  const bolt = isOpticEnergyBolt(projectile);
  const ordnance = isOpticOrdnance(projectile);
  if (!bolt && !ordnance) return null;
  const response = material.response;
  if (response === 'absorb') {
    return { kind: 'absorb', reason: material.id === 'spent' ? 'spent' : 'stone', materialId: material.id };
  }
  if (response === 'reflect') {
    // The mirror bounces light, not mass: a missile detonates on the skin and a continuous
    // beam has no body to send back — both end at the surface like a stone hit.
    if (ordnance || isOpticBeamContact(projectile)) {
      return { kind: 'absorb', reason: 'metal', materialId: material.id };
    }
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
 *
 * `ctx` is optional: { simTime, ledger, emit }. With a finite simTime the settle also owns
 * spend bookkeeping — a prism discharge marks the cell spent (durable ledger mirror included),
 * an absorbed hit on a spent cell restarts its quiet clock, and a spent cell whose window has
 * already elapsed rekindles before the plan runs (emits 'optic:rekindled' via ctx.emit). A
 * settle without ctx is the pure-planning path used by AI replay and harnesses: no clocks move.
 */
export function settleOpticContact(projectile, target, payload, book, ctx) {
  const simTime = ctx && Number.isFinite(ctx.simTime) ? ctx.simTime : null;
  const ledger = ctx ? ctx.ledger : null;
  const emit = ctx && typeof ctx.emit === 'function' ? ctx.emit : null;
  let material = opticMaterialOf(target);
  if (simTime != null && material && material.id === 'spent' && opticRekindleDue(target, simTime)) {
    // The dark crystal healed while nothing touched it — this bolt meets live diamond.
    const record = opticRekindleRecord(target);
    if (rekindleOpticCell(target, ledger) && emit) emit('optic:rekindled', record);
    material = opticMaterialOf(target);
  }
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
    // The field burned: this prism goes dark until its quiet stretch completes.
    if (simTime != null) {
      const spend = recordOpticSpend(target, simTime, ledger);
      if (spend) plan.spentAt = spend.spentAt;
    }
  } else if (plan.kind === 'absorb' && material && material.id === 'spent' && simTime != null) {
    // A dark cell that keeps eating bolts is not quiet — restart its discharge timer.
    const spend = recordOpticSpend(target, simTime, ledger);
    if (spend) plan.spentAt = spend.spentAt;
  }
  return plan;
}

// ── Continuous-beam contacts ────────────────────────────────────────────────
// A beam weapon pushes a transient from→to ray into state.combat.beams every firing tick;
// combat owns "what does the ray meet first". When the first body on the ray is an optic
// surface, weapons settles it through this module with the same book/spend rules as a bolt.

/**
 * Where a beam segment first crosses an optic body — the ENTRY point on the surface
 * (radius + OPTIC_RAY_RADIUS), not the closest-approach point inside the rock, so a beam
 * that terminates here visibly stops at the skin. Returns { t, pos, normal } or null.
 */
export function opticBeamHit(beam, target) {
  if (!beam || !beam.from || !beam.to || !target || !target.pos) return null;
  const fx = Number(beam.from.x) || 0;
  const fz = Number(beam.from.z) || 0;
  const tx = Number(beam.to.x) || 0;
  const tz = Number(beam.to.z) || 0;
  const cx = Number(target.pos.x) || 0;
  const cz = Number(target.pos.z) || 0;
  const radius = (Number(target.radius) || 0) + OPTIC_RAY_RADIUS;
  // A muzzle already inside the skin contacts where it stands, not at the far exit.
  const relX = fx - cx;
  const relZ = fz - cz;
  if (relX * relX + relZ * relZ <= radius * radius) {
    const pos = { x: fx, z: fz };
    return { t: 0, pos, normal: outwardNormal(target, pos) };
  }
  const t = segmentCircleT(fx, fz, tx, tz, cx, cz, radius);
  if (t == null) return null;
  const pos = { x: fx + (tx - fx) * t, z: fz + (tz - fz) * t };
  return { t, pos, normal: outwardNormal(target, pos) };
}

/**
 * The bolt-shaped shim a beam contact is settled with. A continuous beam has no projectile
 * body; the grammar still needs the thing that arrived — position at the contact, velocity
 * down the ray, the mount's burst family (`beam.opticFamilyId`, stamped by weapons when the
 * ray is pushed). One mount-hold is one shot family: the first tick on a live diamond throws
 * the ring and spends it, every later tick of that hold reads a spent/dark cell (and the same
 * book.visited mark) and absorbs — never a per-tick splinter storm.
 */
export function opticBeamBolt(beam, contact, owner) {
  const from = beam && beam.from ? beam.from : { x: 0, z: 0 };
  const to = beam && beam.to ? beam.to : from;
  const dx = (Number(to.x) || 0) - (Number(from.x) || 0);
  const dz = (Number(to.z) || 0) - (Number(from.z) || 0);
  const len = Math.hypot(dx, dz) || 1;
  const pos = contact && contact.pos ? contact.pos : from;
  return {
    id: `beam:${beam && beam.beamKey != null ? beam.beamKey : (beam && beam.ownerId) || 'beam'}`,
    type: 'projectile',
    pos: { x: Number(pos.x) || 0, z: Number(pos.z) || 0 },
    vel: { x: (dx / len) * OPTIC_RAY_SPEED, z: (dz / len) * OPTIC_RAY_SPEED },
    radius: OPTIC_RAY_RADIUS,
    ownerId: beam && beam.ownerId != null ? beam.ownerId : null,
    team: owner && Number.isFinite(owner.team) ? owner.team : 0,
    factionId: beam && beam.factionId != null ? beam.factionId : (owner ? owner.factionId : null),
    data: {
      damage: beam && Number.isFinite(beam.dpsThisTick) ? beam.dpsThisTick : 0,
      damageType: beam && beam.dmgType ? beam.dmgType : 'energy',
      damagePacket: beam && beam.damagePacket ? beam.damagePacket : null,
      kind: 'beam',
      weaponId: beam && beam.weaponId != null ? beam.weaponId : null,
      opticFamilyId: beam && typeof beam.opticFamilyId === 'string' ? beam.opticFamilyId : undefined,
      opticGeneration: 0,
      spawnPos: { x: Number(from.x) || 0, z: Number(from.z) || 0 },
      maxDistance: OPTIC_RAY_RANGE,
    },
  };
}
