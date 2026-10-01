// Compact asteroid field. Dormant rocks are not GameState combat entities.
// Promote into entityList for mine / ram / tether, NPC mining picks, and a
// projectile that actually reaches the rock — including one that has left the frame.

import { allocateEntityId, makeEntity, clearEntityRuntime } from '../core/entity.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { initializePresentationAdmission } from '../core/presentationAdmission.js';
import { authoredPrefetchRadius, tableTravelSpeed } from '../render/tabletopPolicy.js';
import { NEAR_ENTER_PAD_WU, NEAR_EXIT_PAD_WU } from './activityClassification.js';
import { indexedTypeScan, entityIndexLaneVersion } from './livingWorldViews.js';
import { advanceResourceBody } from './worldCatchup.js';

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

// Numeric grid keys. queryAsteroidField walks every overlapped cell per call, so a `${cx}:${cz}`
// string per cell per query was pure GC churn. Both components are Math.floor'd integers; the
// offset/stride pair keeps the encoding bijective for |cell| < 1,048,576 — about ±230M WU,
// orders of magnitude past the authored map edge (~±45k WU) and past where single-precision
// positions have already broken down.
const CELL_KEY_OFFSET = 1048576;
const CELL_KEY_STRIDE = 2097152; // 2 * CELL_KEY_OFFSET

function cellKey(x, z) {
  return (Math.floor(x / ASTEROID_FIELD_CELL) + CELL_KEY_OFFSET) * CELL_KEY_STRIDE
    + (Math.floor(z / ASTEROID_FIELD_CELL) + CELL_KEY_OFFSET);
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
  // Numeric keys: cell (-CELL_KEY_OFFSET, -CELL_KEY_OFFSET) encodes to 0, which is falsy —
  // test for absence, not truthiness.
  if (key == null || !field.grid) return;
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
    // A caller-supplied id still claims the authoritative allocator slot. Without this,
    // the next automatic allocation can return the same id and overwrite `byId`.
    if (Array.isArray(state && state.freeIds)) {
      for (let i = state.freeIds.length - 1; i >= 0; i--) {
        if (state.freeIds[i] === reserved) state.freeIds.splice(i, 1);
      }
    }
    if (Number.isSafeInteger(state && state.nextEntityId)
      && state.nextEntityId <= reserved
      && reserved < Number.MAX_SAFE_INTEGER) {
      state.nextEntityId = reserved + 1;
    }
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
  const simTime = Number.isFinite(state && state.simTime) ? state.simTime : 0;
  const rec = {
    id,
    type: 'asteroid',
    alive: true,
    fieldResident: true,
    liveEntityId: null,
    pos: { x: finite(spec.pos && spec.pos.x), z: finite(spec.pos && spec.pos.z) },
    vel: { x: finite(spec.vel && spec.vel.x), z: finite(spec.vel && spec.vel.z) },
    rot: finite(spec.rot),
    angVel: finite(spec.angVel),
    radius: Math.max(0.5, finite(spec.radius, 8)),
    mass: finite(spec.mass, 400),
    hull: finite(spec.hull, spec.data && spec.data.oreHP),
    hullMax: finite(spec.hullMax, spec.data && spec.data.oreHPMax),
    lastExactT: Number.isFinite(spec.lastExactT) ? spec.lastExactT : simTime,
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
    // Numeric key, same encoding as cellKey(): (cx + OFFSET) * STRIDE + (cz + OFFSET).
    const rowBase = (cx + CELL_KEY_OFFSET) * CELL_KEY_STRIDE + CELL_KEY_OFFSET;
    for (let cz = minR; cz <= maxR; cz++) {
      const bucket = field.grid && field.grid.get(rowBase + cz);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const rec = bucket[i];
        if (!rec || rec.alive === false || rec.liveEntityId != null || !rec.pos) continue;
        const dx = rec.pos.x - x;
        const dz = rec.pos.z - z;
        const reach = r + finite(rec.radius);
        const d2 = dx * dx + dz * dz;
        if (d2 <= reach * reach || d2 <= r2) out.push(rec);
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
  clearEntityRuntime(rec);
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

function catchUpFieldRock(rec, simTime) {
  if (!rec) return rec;
  const toT = Number.isFinite(simTime) ? simTime : 0;
  const fromT = Number.isFinite(rec.lastExactT) ? rec.lastExactT : toT;
  if (!(toT > fromT)) {
    rec.lastExactT = toT;
    return rec;
  }
  const advanced = advanceResourceBody({
    pos: rec.pos,
    vel: rec.vel,
    rot: rec.rot,
    angVel: rec.angVel,
    oreHp: rec.hull,
    oreHpMax: rec.hullMax,
    lastObservedT: fromT,
  }, fromT, toT);
  if (advanced) {
    rec.pos = advanced.pos ? { x: finite(advanced.pos.x), z: finite(advanced.pos.z) } : rec.pos;
    rec.vel = advanced.vel ? { x: finite(advanced.vel.x), z: finite(advanced.vel.z) } : rec.vel;
    rec.rot = finite(advanced.rot, rec.rot);
    rec.angVel = finite(advanced.angVel, rec.angVel);
  }
  rec.lastExactT = toT;
  return rec;
}

// Admission-time overlap guard (the seed-4242 fling class, D50): the promoted body carries the
// authored scaled collider, so materializing a record whose disc already overlaps a live hull
// hands the physics owner an interpenetration it resolves with an unclamped positional shove —
// the hull is yeeted off the sector. A shallow overlap resolves by spawning at the hull's
// collider skin; a centered, deep, or unsolvable one refuses admission and leaves the record
// dormant for its caller to skip. The total shift is bounded at one collider radius: past that,
// the rock would visibly teleport from its drawn dormant position, which is its own defect —
// refuse instead. The `ram` path is exempt: its trigger already fires at the collider skin and
// the designed ram bump is velocity-clamped (A6), so a record-position spawn is the contract.
const ASTEROID_ADMIT_SKIN = 0.05;

function resolveAdmitOverlap(state, pos, colliderR, reason) {
  if (reason === 'ram') return pos;
  let x = pos.x;
  let z = pos.z;
  const entities = indexedTypeScan(state, 'ships');
  for (let pass = 0; pass < 3; pass++) {
    let worst = null;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e || e.alive === false || e.type !== 'ship' || !e.pos) continue;
      const dx = x - e.pos.x;
      const dz = z - e.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const need = colliderR + (e.radius || 6) + ASTEROID_ADMIT_SKIN;
      if (d < need && (!worst || d < worst.d)) worst = { e, dx, dz, d, need };
    }
    if (!worst) {
      const shifted = Math.hypot(x - pos.x, z - pos.z);
      return shifted <= colliderR ? { x, z } : null;
    }
    if (worst.d <= 1e-4) return null;
    const push = worst.need / worst.d;
    x = worst.e.pos.x + worst.dx * push;
    z = worst.e.pos.z + worst.dz * push;
  }
  return null;
}

function isOpticRockData(data) {
  return !!(data && typeof data.opticMaterial === 'string' && data.opticMaterial);
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
  const simTime = Number.isFinite(state.simTime) ? state.simTime : (state.tick | 0) / 60;
  catchUpFieldRock(rec, simTime);
  const data = rec.data && typeof rec.data === 'object' ? { ...rec.data } : {};
  delete data.fieldResident;
  const optic = isOpticRockData(data);
  const hull = Number.isFinite(data.oreHP) ? data.oreHP
    : (Number.isFinite(rec.hull) ? rec.hull : (optic ? 1e6 : undefined));
  const hullMax = Number.isFinite(data.oreHPMax) ? data.oreHPMax
    : (Number.isFinite(rec.hullMax) ? rec.hullMax : (optic ? 1e6 : undefined));
  // Optic lattices are authored against entity.radius; bump colliders must not seal the mouth.
  const colliderR = optic
    ? Math.max(0.5, finite(rec.radius, 8))
    : asteroidColliderRadius(data.typeId, rec.radius);
  const admitPos = resolveAdmitOverlap(state, rec.pos, colliderR, reason);
  if (!admitPos) return null;
  const ent = spawn({
    id: rec.id,
    type: 'asteroid',
    pos: { x: admitPos.x, z: admitPos.z },
    vel: rec.vel ? { x: rec.vel.x, z: rec.vel.z } : { x: 0, z: 0 },
    rot: rec.rot,
    angVel: rec.angVel,
    radius: rec.radius,
    mass: rec.mass,
    hull,
    hullMax,
    collides: true,
    physicsBody: { radius: colliderR },
    data,
  });
  if (!ent) return null;
  if (rec.homeSectorId) {
    ent.homeSectorId = rec.homeSectorId;
    if (ent.data) ent.data.homeSectorId = rec.homeSectorId;
  }
  if (ent.activity) ent.activity.lastExactT = simTime;
  rec.liveEntityId = ent.id;
  rec.promoteReason = String(reason || 'promote');
  removeFieldRecord(ensureAsteroidField(state), rec);
  return ent;
}

/** Shelve a live optic lattice body back into the compact field (far-actor style). */
export function demoteOpticAsteroidToField(state, entity, helpers, reason = 'optic-shelve') {
  if (!state || !entity || entity.type !== 'asteroid') return null;
  if (!isOpticRockData(entity.data)) return null;
  const id = entity.id;
  const snapshot = {
    id,
    pos: entity.pos ? { x: finite(entity.pos.x), z: finite(entity.pos.z) } : { x: 0, z: 0 },
    vel: entity.vel ? { x: finite(entity.vel.x), z: finite(entity.vel.z) } : { x: 0, z: 0 },
    rot: finite(entity.rot),
    angVel: finite(entity.angVel),
    radius: Math.max(0.5, finite(entity.radius, 8)),
    mass: finite(entity.mass, 400),
    hull: Number.isFinite(entity.hull) ? entity.hull : 1e6,
    hullMax: Number.isFinite(entity.hullMax) ? entity.hullMax : 1e6,
    homeSectorId: entity.homeSectorId || (entity.data && entity.data.homeSectorId) || null,
    data: entity.data && typeof entity.data === 'object' ? { ...entity.data } : {},
  };
  const remove = helpers && typeof helpers.removeEntity === 'function' ? helpers.removeEntity : null;
  if (remove) remove(id, { immediate: true, reason: String(reason || 'optic-shelve') });
  else entity.alive = false;
  snapshot.data.opticShelveReason = String(reason || 'optic-shelve');
  return insertAsteroidFieldRock(state, snapshot);
}

function opticTableRadii(state, player) {
  const speed = tableTravelSpeed(state);
  const decodeR = authoredPrefetchRadius(speed);
  const enter = Math.max(decodeR, 1);
  const exit = enter + (NEAR_EXIT_PAD_WU - NEAR_ENTER_PAD_WU);
  return { enter, exit, enter2: enter * enter, exit2: exit * exit };
}

/** Bench A/B: production default ON. Quiet latch skips optic query+shelve when no interest. */
let OPTIC_FAR_QUIET_LATCH = true;
export function setOpticFarQuietLatchForBench(enabled) {
  OPTIC_FAR_QUIET_LATCH = enabled !== false;
}
export function getOpticFarQuietLatchForBench() {
  return OPTIC_FAR_QUIET_LATCH !== false;
}

/** Membership / field-version rescan while latched (0.5 s @ 60 Hz). */
const OPTIC_FAR_QUIET_RESCAN_TICKS = 30;

function entityIndexVersion(state) {
  const index = state && state.entityIndex;
  return index && index.__spacefaceEntityIndexV1 && Number.isFinite(index.version)
    ? index.version
    : null;
}

/** Membership lanes for the optic-quiet latch — the interest census reads asteroids
 * only, so projectile/pickup/ship churn can't wake it. */
const OPTIC_FAR_QUIET_LANES = ['asteroids'];

function opticMembershipVersion(state) {
  const lane = entityIndexLaneVersion(state, OPTIC_FAR_QUIET_LANES);
  return lane === -1 ? entityIndexVersion(state) : lane;
}

function publishOpticQuiet(state, latched) {
  const world = state && state.world;
  if (!world) return;
  const rt = world.opticFieldRuntime || (world.opticFieldRuntime = {});
  rt.quietLatched = !!latched;
}

/**
 * Optic lattices stay field-resident until the player enters the authored decode
 * disc, then promote like far actors. Beyond exit they shelve again so a quiet
 * Ceres pocket does not keep ~40 combat asteroids warm for a gallery kilometers away.
 */
export function tickOpticFieldRocks(state, helpers) {
  if (!state || state.mode !== 'flight') return { promoted: 0, shelved: 0 };
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!player || !player.pos) return { promoted: 0, shelved: 0 };

  // Quiet settled flight: when no optic lattice sits in the decode disc and no live
  // optic body needs exit-shelve, production still paid queryAsteroidField (large
  // authored-prefetch disc) + entityList optic scan every tick. Latch after an empty
  // interest probe; wake on asteroidField.version, entity-index membership, player
  // move beyond a fraction of enter, or a 0.5 s rescan.
  const field = state.world && state.world.asteroidField;
  const fieldVersion = field && Number.isFinite(field.version) ? field.version : null;
  const membership = opticMembershipVersion(state);
  const px = finite(player.pos.x);
  const pz = finite(player.pos.z);
  if (OPTIC_FAR_QUIET_LATCH !== false) {
    const quiet = tickOpticFieldRocks._quiet;
    const tick = state.tick | 0;
    if (quiet
      && quiet.fieldVersion === fieldVersion
      && quiet.membership === membership
      && ((tick - (quiet.armedTick | 0)) < OPTIC_FAR_QUIET_RESCAN_TICKS)) {
      const mdx = px - quiet.x;
      const mdz = pz - quiet.z;
      if (mdx * mdx + mdz * mdz <= quiet.wakeMove2) {
        publishOpticQuiet(state, true);
        return { promoted: 0, shelved: 0 };
      }
    }
  } else if (tickOpticFieldRocks._quiet) {
    tickOpticFieldRocks._quiet = null;
  }

  const radii = opticTableRadii(state, player);
  let promoted = 0;
  let shelved = 0;
  let opticInterest = false;

  const hits = queryAsteroidField(state, player.pos, radii.enter, tickOpticFieldRocks._scratch || (tickOpticFieldRocks._scratch = []));
  for (let i = 0; i < hits.length; i++) {
    const rec = hits[i];
    if (!rec || !isOpticRockData(rec.data) || !rec.pos) continue;
    const dx = rec.pos.x - px;
    const dz = rec.pos.z - pz;
    if (dx * dx + dz * dz > radii.enter2) continue;
    opticInterest = true;
    const ent = promoteAsteroidFieldRock(state, rec.id, helpers, 'optic-approach');
    if (ent) promoted += 1;
  }

  // Prefer the indexed asteroid list — the fat entityList walk re-visits every ship/station/
  // projectile on every demote pass while the index already carries exactly this filter.
  const index = state.entityIndex;
  const list = (index && Array.isArray(index.asteroids)) ? index.asteroids : (state.entityList || []);
  for (let i = list.length - 1; i >= 0; i--) {
    const entity = list[i];
    if (!entity || entity.alive === false || entity.type !== 'asteroid') continue;
    if (!isOpticRockData(entity.data) || !entity.pos) continue;
    opticInterest = true;
    const dx = entity.pos.x - px;
    const dz = entity.pos.z - pz;
    if (dx * dx + dz * dz <= radii.exit2) continue;
    if (demoteOpticAsteroidToField(state, entity, helpers, 'optic-exit')) shelved += 1;
  }

  if (OPTIC_FAR_QUIET_LATCH !== false && promoted === 0 && shelved === 0 && !opticInterest) {
    const wakeR = Math.max(32, radii.enter * 0.15);
    tickOpticFieldRocks._quiet = {
      fieldVersion,
      membership,
      armedTick: state.tick | 0,
      x: px,
      z: pz,
      wakeMove2: wakeR * wakeR,
    };
    publishOpticQuiet(state, true);
  } else {
    tickOpticFieldRocks._quiet = null;
    publishOpticQuiet(state, false);
  }
  return { promoted, shelved };
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
