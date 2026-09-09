// Compact asteroid field. Dormant rocks are not GameState combat entities.
// Promote into entityList only for mine / ram / tether (and NPC mining picks).

import { allocateEntityId, makeEntity } from '../core/entity.js';
import { initializePresentationAdmission } from '../core/presentationAdmission.js';

export const ASTEROID_FIELD_SCHEMA = 'spaceface.asteroidField.v1';
export const ASTEROID_FIELD_CELL = 220;

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

export function ensureAsteroidField(state) {
  if (!state || typeof state !== 'object') return null;
  const world = state.world || (state.world = {});
  let field = world.asteroidField;
  if (field && field.schema === ASTEROID_FIELD_SCHEMA && Array.isArray(field.rocks)) {
    if (!(field.byId instanceof Map)) field.byId = new Map(field.rocks.map((row) => [row.id, row]));
    if (!(field.grid instanceof Map)) rebuildGrid(field);
    return field;
  }
  field = {
    schema: ASTEROID_FIELD_SCHEMA,
    version: 0,
    rocks: [],
    byId: new Map(),
    grid: new Map(),
  };
  world.asteroidField = field;
  return field;
}

export function shouldKeepLiveAsteroid(options = {}) {
  if (options.activityBinding && options.activityBinding.id) return true;
  if (options.collisionAnchorBinding && options.collisionAnchorBinding.id) return true;
  if (options.authoredGeologyPlaceId) return true;
  return false;
}

function cellKey(x, z) {
  return `${Math.floor(x / ASTEROID_FIELD_CELL)}:${Math.floor(z / ASTEROID_FIELD_CELL)}`;
}

function gridAdd(field, rec) {
  const key = cellKey(finite(rec.pos && rec.pos.x), finite(rec.pos && rec.pos.z));
  rec._cell = key;
  let bucket = field.grid.get(key);
  if (!bucket) {
    bucket = [];
    field.grid.set(key, bucket);
  }
  bucket.push(rec);
}

function gridRemove(field, rec) {
  const key = rec && rec._cell;
  if (!key || !field.grid) return;
  const bucket = field.grid.get(key);
  if (!bucket) return;
  const idx = bucket.indexOf(rec);
  if (idx >= 0) bucket.splice(idx, 1);
  if (bucket.length === 0) field.grid.delete(key);
}

function rebuildGrid(field) {
  field.grid = new Map();
  for (let i = 0; i < field.rocks.length; i++) gridAdd(field, field.rocks[i]);
}

function allocatePresentationId(state, occupied, reserved = 0) {
  if (Number.isSafeInteger(reserved) && reserved > 0
    && !occupied.has(reserved)
    && !(state && state.entities && state.entities.has(reserved))) {
    return reserved;
  }
  if (Number.isSafeInteger(state && state.nextEntityId) && state.nextEntityId >= 1) {
    return allocateEntityId(state);
  }
  let id = 1;
  while (occupied.has(id) || (state && state.entities && state.entities.has(id))) id++;
  return id;
}

export function insertAsteroidFieldRock(state, spec = {}) {
  const field = ensureAsteroidField(state);
  const id = allocatePresentationId(state, field.byId, spec.id);
  const rec = {
    id,
    type: 'asteroid',
    alive: true,
    fieldResident: true,
    liveEntityId: null,
    pos: { x: finite(spec.pos && spec.pos.x), z: finite(spec.pos && spec.pos.z) },
    vel: { x: 0, z: 0 },
    rot: finite(spec.rot),
    angVel: finite(spec.angVel),
    radius: Math.max(0.5, finite(spec.radius, 8)),
    mass: finite(spec.mass, 400),
    hull: finite(spec.hull, spec.data && spec.data.oreHP),
    hullMax: finite(spec.hullMax, spec.data && spec.data.oreHPMax),
    collides: true,
    homeSectorId: spec.homeSectorId || (spec.data && spec.data.homeSectorId) || null,
    data: spec.data && typeof spec.data === 'object' ? spec.data : {},
  };
  field.rocks.push(rec);
  field.byId.set(id, rec);
  gridAdd(field, rec);
  field.version++;
  return rec;
}

export function getAsteroidFieldRock(state, id) {
  const field = state && state.world && state.world.asteroidField;
  if (!field || !field.byId) return null;
  return field.byId.get(id) || null;
}

export function queryAsteroidField(state, pos, radius, out = []) {
  out.length = 0;
  const field = state && state.world && state.world.asteroidField;
  if (!field || !pos || !(radius > 0)) return out;
  const x = finite(pos.x);
  const z = finite(pos.z);
  const r = radius;
  const r2 = r * r;
  const minC = Math.floor((x - r) / ASTEROID_FIELD_CELL);
  const maxC = Math.floor((x + r) / ASTEROID_FIELD_CELL);
  const minR = Math.floor((z - r) / ASTEROID_FIELD_CELL);
  const maxR = Math.floor((z + r) / ASTEROID_FIELD_CELL);
  for (let cx = minC; cx <= maxC; cx++) {
    for (let cz = minR; cz <= maxR; cz++) {
      const bucket = field.grid && field.grid.get(`${cx}:${cz}`);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const rec = bucket[i];
        if (!rec || rec.alive === false || rec.liveEntityId != null || !rec.pos) continue;
        const dx = rec.pos.x - x;
        const dz = rec.pos.z - z;
        const reach = r + finite(rec.radius);
        if (dx * dx + dz * dz <= reach * reach || dx * dx + dz * dz <= r2) out.push(rec);
      }
    }
  }
  return out;
}

function removeFieldRecord(field, rec) {
  if (!field || !rec) return false;
  const idx = field.rocks.indexOf(rec);
  if (idx >= 0) field.rocks.splice(idx, 1);
  field.byId.delete(rec.id);
  gridRemove(field, rec);
  field.version++;
  rec.alive = false;
  return true;
}

export function dropAsteroidFieldSector(state, sectorId) {
  const field = state && state.world && state.world.asteroidField;
  if (!field || !sectorId) return 0;
  let dropped = 0;
  for (let i = field.rocks.length - 1; i >= 0; i--) {
    const rec = field.rocks[i];
    const home = rec && (rec.homeSectorId || (rec.data && rec.data.homeSectorId));
    if (home !== sectorId) continue;
    removeFieldRecord(field, rec);
    dropped++;
  }
  return dropped;
}

export function promoteAsteroidFieldRock(state, id, helpers, reason = 'promote') {
  if (!state || id == null) return null;
  const live = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id)
    : null;
  if (live && live.alive !== false && live.type === 'asteroid') return live;
  const rec = getAsteroidFieldRock(state, id);
  if (!rec || rec.alive === false) return live;
  if (rec.liveEntityId != null) {
    const existing = state.entities.get(rec.liveEntityId);
    if (existing && existing.alive !== false) return existing;
  }
  const spawn = helpers && typeof helpers.spawnEntity === 'function'
    ? helpers.spawnEntity
    : null;
  if (!spawn) return null;
  const data = rec.data && typeof rec.data === 'object' ? { ...rec.data } : {};
  delete data.fieldResident;
  const ent = spawn({
    id: rec.id,
    type: 'asteroid',
    pos: { x: rec.pos.x, z: rec.pos.z },
    vel: rec.vel ? { x: rec.vel.x, z: rec.vel.z } : { x: 0, z: 0 },
    rot: rec.rot,
    angVel: rec.angVel,
    radius: rec.radius,
    mass: rec.mass,
    hull: data.oreHP,
    hullMax: data.oreHPMax,
    collides: true,
    data,
  });
  if (!ent) return null;
  if (rec.homeSectorId) {
    ent.homeSectorId = rec.homeSectorId;
    if (ent.data) ent.data.homeSectorId = rec.homeSectorId;
  }
  rec.liveEntityId = ent.id;
  rec.promoteReason = String(reason || 'promote');
  removeFieldRecord(ensureAsteroidField(state), rec);
  return ent;
}

export function asteroidFieldCensus(state) {
  const field = state && state.world && state.world.asteroidField;
  const rocks = field && Array.isArray(field.rocks) ? field.rocks.length : 0;
  let live = 0;
  const index = state && state.entityIndex;
  if (index && Array.isArray(index.asteroids)) live = index.asteroids.length;
  else {
    for (const e of state && state.entityList || []) {
      if (e && e.alive !== false && e.type === 'asteroid') live++;
    }
  }
  return { fieldRocks: rocks, liveAsteroids: live };
}

export function makeReservedAsteroidEntity(spec) {
  const e = makeEntity(spec);
  initializePresentationAdmission(e);
  return e;
}
