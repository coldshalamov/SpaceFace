// Compact asteroid field. Dormant rocks are not GameState combat entities.
// Promote into entityList for mine / ram / tether, NPC mining picks, and a
// projectile that actually reaches the rock — including one that has left the frame.

import { allocateEntityId, makeEntity, clearEntityRuntime } from '../core/entity.js';
import { syncEntitySectorMembership } from '../core/coreSystem.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { OPTIC_STRUCTURES } from '../data/opticStructures.js';
import { OPTIC_LATTICE_SPACING } from '../combat/opticField.js';
import { initializePresentationAdmission } from '../core/presentationAdmission.js';
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { authoredPrefetchRadius, tableTravelSpeed } from '../render/tabletopPolicy.js';
import { NEAR_ENTER_PAD_WU, NEAR_EXIT_PAD_WU } from './activityClassification.js';
import { indexedTypeScan, entityIndexLaneVersion } from './livingWorldViews.js';
import { advanceResourceBody } from './worldCatchup.js';
import { racingAsteroidSpec } from './racingCorridor.js';
import { markAuxRowDirty, markAuxRowRemoved } from './auxRowJournal.js';

export const ASTEROID_FIELD_SCHEMA = 'spaceface.asteroidField.v1';
export const ASTEROID_FIELD_CELL = 220;
const CANONICAL_OPTIC_STRUCTURES = new Set(OPTIC_STRUCTURES.map(spec => spec.id));

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

export function ensureAsteroidField(state) {
  if (!state || typeof state !== 'object') return null;
  const world = state.world || (state.world = {});
  let field = world.asteroidField;
  if (field && field.schema === ASTEROID_FIELD_SCHEMA && Array.isArray(field.rocks)) {
    if (!(field.byId instanceof Map)) field.byId = new Map(field.rocks.map((row) => [row.id, row]));
    if (!(field.dirtyPoseIds instanceof Set)) field.dirtyPoseIds = new Set();
    if (!(field.grid instanceof Map)) rebuildGrid(field);
    return field;
  }
  field = {
    schema: ASTEROID_FIELD_SCHEMA,
    version: 0,
    rocks: [],
    byId: new Map(),
    dirtyPoseIds: new Set(),
    grid: new Map(),
    // Ledger-collect walk markers (presentationSources sizes the rock query disc
    // from these): high-water dormant-row |vel| and the lowest lastExactT among
    // rows that ever carried drift, so a shelved rock's stored↔ballistic pos gap
    // stays covered by the walk disc. Conservative both ways — never decrease.
    maxRockSpeed: 0,
    minDriftRockLastExactT: null,
  };
  world.asteroidField = field;
  return field;
}

// High-water drift markers for the ledger walk disc. Called wherever a field row
// gains or refreshes vel (insert, ballistic catch-up). A row that slows keeps the
// older, larger marker — that only ever widens the query disc, so it stays a safe
// superset of the rows the collect verdict can admit.
function noteFieldRockMotion(field, rec) {
  if (!field || !rec) return;
  const vx = finite(rec.vel && rec.vel.x);
  const vz = finite(rec.vel && rec.vel.z);
  const speed = (vx !== 0 || vz !== 0) ? Math.hypot(vx, vz) : 0;
  if (!(speed > 0)) return;
  if (!(Number.isFinite(field.maxRockSpeed) && field.maxRockSpeed >= speed)) {
    field.maxRockSpeed = speed;
  }
  if (!Number.isFinite(field.minDriftRockLastExactT)
    || rec.lastExactT < field.minDriftRockLastExactT) {
    field.minDriftRockLastExactT = rec.lastExactT;
  }
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
  spec = racingAsteroidSpec(state, spec);
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
  field.dirtyPoseIds.add(id);
  noteFieldRockMotion(field, rec);
  field.version++;
  markAuxRowDirty(field, id);
  return rec;
}

export function getAsteroidFieldRock(state, id) {
  const field = state && state.world && state.world.asteroidField;
  if (!field || !field.byId) return null;
  return field.byId.get(id) || null;
}

// Chunked twin: yields per grid column (cell path) or per `batchRows` scanned
// keys (oversize-disc path) so a corridor-wide refill can ride a slice clock.
// `out` accumulates across suspensions; the caller commits its memo key only
// on completion. Row order (therefore `out` contents) is identical to the
// sync drain.
export function* queryAsteroidFieldSteps(state, pos, radius, out = [], batchRows = 1024) {
  out.length = 0;
  const field = state && state.world && state.world.asteroidField;
  if (!field || !pos || !Number.isFinite(radius) || !(radius > 0)) return out;
  const grid = field.grid;
  if (!grid || grid.size === 0) return out;
  const x = finite(pos.x);
  const z = finite(pos.z);
  const r = radius;
  const minC = Math.floor((x - r) / ASTEROID_FIELD_CELL);
  const maxC = Math.floor((x + r) / ASTEROID_FIELD_CELL);
  const minR = Math.floor((z - r) / ASTEROID_FIELD_CELL);
  const maxR = Math.floor((z + r) / ASTEROID_FIELD_CELL);
  const inspectBucket = (bucket) => {
    if (!bucket) return;
    for (let i = 0; i < bucket.length; i++) {
      const rec = bucket[i];
      if (!rec || rec.alive === false || rec.liveEntityId != null || !rec.pos) continue;
      const dx = rec.pos.x - x;
      const dz = rec.pos.z - z;
      const reach = r + finite(rec.radius);
      // reach >= r always (rec.radius >= 0.5), so a second d2 <= r*r branch is dead.
      if (dx * dx + dz * dz <= reach * reach) out.push(rec);
    }
  };
  const cellSpan = (maxC - minC + 1) * (maxR - minR + 1);
  const batch = Number.isFinite(batchRows) ? Math.max(1, batchRows | 0) : Infinity;
  if (!Number.isSafeInteger(minC) || !Number.isSafeInteger(maxC)
      || !Number.isSafeInteger(minR) || !Number.isSafeInteger(maxR)
      || !Number.isFinite(cellSpan) || cellSpan > grid.size) {
    const keys = [];
    let scanned = 0;
    for (const key of grid.keys()) {
      const cx = Math.floor(key / CELL_KEY_STRIDE) - CELL_KEY_OFFSET;
      const cz = (key % CELL_KEY_STRIDE) - CELL_KEY_OFFSET;
      if (cx >= minC && cx <= maxC && cz >= minR && cz <= maxR) keys.push(key);
      if (++scanned % batch === 0) yield;
    }
    keys.sort((a, b) => a - b);
    for (let i = 0; i < keys.length; i++) {
      inspectBucket(grid.get(keys[i]));
      if ((i + 1) % batch === 0) yield;
    }
    return out;
  }
  for (let cx = minC; cx <= maxC; cx++) {
    // Numeric key, same encoding as cellKey(): (cx + OFFSET) * STRIDE + (cz + OFFSET).
    const rowBase = (cx + CELL_KEY_OFFSET) * CELL_KEY_STRIDE + CELL_KEY_OFFSET;
    for (let cz = minR; cz <= maxR; cz++) {
      inspectBucket(grid.get(rowBase + cz));
    }
    yield;
  }
  return out;
}

// Nearest-first whole-field twin: emits every live unpromoted record exactly
// once, bucketed outward from the player's cell by Chebyshev ring. The collect
// is chunked (key scan + a yield every `batchRows` emitted records) so a
// whole-field walk rides a slice clock; the O(R log R) distance sort it
// replaces couldn't suspend. `maxRadius` stops emission once a ring's
// minimum center distance exceeds it (+CELL slack covers centers anywhere
// inside a boundary cell plus rec.radius reach — the margin over-selects,
// never under). Ordering is nearest-first by cell — the field's own radius
// queries already accept mint-cell imprecision for drifted rocks, and the
// caller's promote contract is coverage over the key space with proximity
// preference only.
export function* queryAsteroidFieldNearestSteps(state, pos, out = [], batchRows = 1024,
    maxRadius = Infinity) {
  out.length = 0;
  const field = state && state.world && state.world.asteroidField;
  if (!field || !pos) return out;
  const grid = field.grid;
  if (!grid || grid.size === 0) return out;
  const x = finite(pos.x);
  const z = finite(pos.z);
  const px = Math.floor(x / ASTEROID_FIELD_CELL);
  const pz = Math.floor(z / ASTEROID_FIELD_CELL);
  const batch = Number.isFinite(batchRows) ? Math.max(1, batchRows | 0) : Infinity;
  const radiusCap = Number.isFinite(maxRadius) ? finite(maxRadius) : Infinity;
  const rings = new Map();
  let scanned = 0;
  for (const key of grid.keys()) {
    const cx = Math.floor(key / CELL_KEY_STRIDE) - CELL_KEY_OFFSET;
    const cz = (key % CELL_KEY_STRIDE) - CELL_KEY_OFFSET;
    const ring = Math.max(Math.abs(cx - px), Math.abs(cz - pz));
    let keys = rings.get(ring);
    if (!keys) { keys = []; rings.set(ring, keys); }
    keys.push(key);
    if (++scanned % batch === 0) yield;
  }
  const order = [...rings.keys()].sort((a, b) => a - b);
  let emitted = 0;
  for (let i = 0; i < order.length; i++) {
    const ring = order[i];
    // Ring k's records sit at least (k-1)*CELL away — a record can only be
    // in-radius while (k-1)*CELL <= radiusCap + rec.radius <= radiusCap + CELL.
    if (radiusCap !== Infinity && (ring - 1) * ASTEROID_FIELD_CELL > radiusCap + ASTEROID_FIELD_CELL) break;
    for (const key of rings.get(ring)) {
      const bucket = grid.get(key);
      if (!bucket) continue;
      for (const rec of bucket) {
        if (!rec || rec.alive === false || rec.liveEntityId != null || !rec.pos) continue;
        out.push(rec);
        if (++emitted % batch === 0) yield;
      }
    }
    yield;
  }
  return out;
}

export function queryAsteroidField(state, pos, radius, out = []) {
  const iterator = queryAsteroidFieldSteps(state, pos, radius, out, Infinity);
  for (;;) {
    if (iterator.next().done) break;
  }
  return out;
}

// ── Massline obstruction (AL-HF-08, SEED-HF-08) ──────────────────────────────────────────────
// A Massline cannot pass through rock, a live wreck, or a station hull. These are read-only
// geometry queries used by latch ADMISSION only: they never promote a record, never advance it,
// never initialize physics metadata, and never touch the field version, so asking "is this line
// clear?" cannot change what the world is doing. The tether system must never consult them about
// a line it already carries — an obstruction is a reason not to start a latch, never a reason to
// sever one. Ships and drones stay out: they are dodgeable clutter, not terrain. Wrecks and
// stations use their stored pose; only dormant field rocks keep the ballistic drift below.
const MASSLINE_SEGMENT_EPS = 1e-9;
// Parameter tolerance along the unit chord. The attachment segment is OPEN at both endpoints, so a
// disc that only touches one of them is not an obstruction — the rock sits inside the target's own
// skin, not between the two bodies.
const MASSLINE_T_EPS = 1e-9;

/** The collision disc a massline has to clear for this rock. A live body carries the radius the
 * physics authority minted it with; a dormant record has not been promoted yet, so use the same
 * ordinary/optic collider rules promotion will apply. */
function masslineObstacleRadius(rock) {
  const body = rock && rock.physicsBody;
  const bodyRadius = body && typeof body === 'object' ? finite(body.radius, NaN) : NaN;
  if (Number.isFinite(bodyRadius) && bodyRadius > 0) return bodyRadius;
  const visual = Math.max(0.5, finite(rock && rock.radius, 8));
  if (!rock || rock.fieldResident !== true) return visual;
  const data = rock.data && typeof rock.data === 'object' ? rock.data : {};
  return isOpticRockData(data)
    ? opticColliderRadius(data, visual)
    : asteroidColliderRadius(data.typeId, visual);
}

/** Current XZ of an obstacle without modifying it. Dormant rows drift ballistically between
 * exact catch-ups, so their stored pos can be stale; the live XZ is stored pos + vel × elapsed
 * sim time, matching catchUpFieldRock's advanceResourceBody input. */
function masslineObstacleXZ(rock, simTime, out) {
  const px = finite(rock && rock.pos && rock.pos.x);
  const pz = finite(rock && rock.pos && rock.pos.z);
  // Drift is the dormant-rock catch-up only. A wreck or station hull, even one mistakenly
  // stamped field-resident, stays on its stored pose — the drift formula itself is unchanged.
  if (!rock || rock.fieldResident !== true || rock.type !== 'asteroid') {
    out.x = px;
    out.z = pz;
    return out;
  }
  const fromT = Number.isFinite(rock.lastExactT) ? rock.lastExactT : simTime;
  const elapsed = simTime - fromT;
  if (!(elapsed > 0)) {
    out.x = px;
    out.z = pz;
    return out;
  }
  out.x = px + finite(rock.vel && rock.vel.x) * elapsed;
  out.z = pz + finite(rock.vel && rock.vel.z) * elapsed;
  return out;
}

function masslineObstacleEligible(rock) {
  if (!rock || rock.alive === false) return false;
  const type = rock.type;
  // Live wrecks and station hulls block like rock. Ships and drones do not.
  if (type !== 'asteroid' && type !== 'wreck' && type !== 'station') return false;
  if (rock.collides === false || rock.physicsBody === false) return false;
  return true;
}

function discOverlapsBounds(x, z, radius, minX, minZ, maxX, maxZ) {
  const cx = x < minX ? minX : (x > maxX ? maxX : x);
  const cz = z < minZ ? minZ : (z > maxZ ? maxZ : z);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz <= radius * radius;
}

/**
 * Collect the rocks whose collision discs overlap `bounds` ({ minX, minZ, maxX, maxZ }).
 * Clears and reuses `out`; returns obstacle references. Live asteroids come from the
 * authoritative entity collection; dormant rows are scanned linearly because they drift
 * without re-gridding (a stored-cell query would miss one that left its cell).
 */
export function collectMasslineObstructionRocks(state, bounds, out = []) {
  const rocks = Array.isArray(out) ? out : [];
  rocks.length = 0;
  if (!state || !bounds) return rocks;
  const minX = finite(bounds.minX, NaN);
  const minZ = finite(bounds.minZ, NaN);
  const maxX = finite(bounds.maxX, NaN);
  const maxZ = finite(bounds.maxZ, NaN);
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)
      || !Number.isFinite(maxX) || !Number.isFinite(maxZ)
      || maxX < minX || maxZ < minZ) return rocks;
  const simTime = Number.isFinite(state.simTime) ? state.simTime : 0;
  const xz = { x: 0, z: 0 };

  const live = indexedTypeScan(state, 'asteroids');
  for (let i = 0; i < live.length; i++) {
    const entity = live[i];
    // Hulls are a separate pass. An unready index serves entityList for every bucket, and
    // eligibility now includes wrecks and stations — keeping this loop asteroid-only stops
    // that fallback from recording the same hull twice.
    if (!entity || entity.type !== 'asteroid') continue;
    if (!masslineObstacleEligible(entity) || !entity.pos) continue;
    const radius = masslineObstacleRadius(entity);
    if (!(radius > 0)) continue;
    if (!discOverlapsBounds(finite(entity.pos.x), finite(entity.pos.z), radius,
      minX, minZ, maxX, maxZ)) continue;
    rocks.push(entity);
  }

  // Live wrecks and station hulls. An unready index makes every bucket the same entityList,
  // so that case is one pass — a ready index keeps wrecks and stations in separate buckets.
  appendLiveMasslineHulls(state, rocks, minX, minZ, maxX, maxZ);

  const field = state.world && state.world.asteroidField;
  const dormant = field && Array.isArray(field.rocks) ? field.rocks : null;
  if (!dormant) return rocks;
  for (let i = 0; i < dormant.length; i++) {
    const rec = dormant[i];
    // Dormant drift stays asteroid-only. A non-rock row in the field is not a hull obstacle.
    if (!rec || rec.type !== 'asteroid') continue;
    // A promoted row keeps its identity on the live entity; it is no longer a dormant obstacle.
    if (!masslineObstacleEligible(rec) || rec.liveEntityId != null || !rec.pos) continue;
    const radius = masslineObstacleRadius(rec);
    if (!(radius > 0)) continue;
    masslineObstacleXZ(rec, simTime, xz);
    if (!discOverlapsBounds(xz.x, xz.z, radius, minX, minZ, maxX, maxZ)) continue;
    rocks.push(rec);
  }
  return rocks;
}

function appendLiveMasslineHulls(state, rocks, minX, minZ, maxX, maxZ) {
  const index = state && state.entityIndex;
  const indexed = !!(index && index.__spacefaceEntityIndexV1 && index.ready === true
    && (Array.isArray(index.wrecks) || Array.isArray(index.stations)));
  const lists = indexed
    ? [index.wrecks, index.stations]
    : [state && state.entityList];
  for (let b = 0; b < lists.length; b++) {
    const list = lists[b];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i++) {
      const entity = list[i];
      if (!entity || (entity.type !== 'wreck' && entity.type !== 'station')) continue;
      if (!masslineObstacleEligible(entity) || !entity.pos) continue;
      const radius = masslineObstacleRadius(entity);
      if (!(radius > 0)) continue;
      if (!discOverlapsBounds(finite(entity.pos.x), finite(entity.pos.z), radius,
        minX, minZ, maxX, maxZ)) continue;
      rocks.push(entity);
    }
  }
}

/** Endpoint identities that can never obstruct their own line — including a dormant record and
 * the live body it was (or will be) promoted to, which share an id. */
function masslineEndpointIds(player, target) {
  const ids = new Set();
  if (player && player.id != null) ids.add(player.id);
  if (player && player.liveEntityId != null) ids.add(player.liveEntityId);
  if (target && target.id != null) ids.add(target.id);
  if (target && target.liveEntityId != null) ids.add(target.liveEntityId);
  return ids;
}

/**
 * Does the open attachment segment from `sourceWorld` to `targetWorld` pass through rock,
 * a live wreck, or a station hull?
 * Pure geometry: quadratic segment-vs-disc against the open span, no cable thickness, no
 * sampling, no tuning. A tangent that lands inside the segment blocks; a disc that only touches
 * an endpoint, or lies wholly before or after it, does not. Zero-length finite segments are
 * clear; malformed endpoints fail closed.
 */
export function isMasslineObstructed({
  state, player, target, sourceWorld, targetWorld, obstacles,
} = {}) {
  const sx = finite(sourceWorld && sourceWorld.x, NaN);
  const sz = finite(sourceWorld && sourceWorld.z, NaN);
  const tx = finite(targetWorld && targetWorld.x, NaN);
  const tz = finite(targetWorld && targetWorld.z, NaN);
  if (!Number.isFinite(sx) || !Number.isFinite(sz)
      || !Number.isFinite(tx) || !Number.isFinite(tz)) {
    return true;
  }
  const dx = tx - sx;
  const dz = tz - sz;
  const span = Math.hypot(dx, dz);
  if (!(span > MASSLINE_SEGMENT_EPS)) return false;
  const ux = dx / span;
  const uz = dz / span;
  const simTime = Number.isFinite(state && state.simTime) ? state.simTime : 0;
  const excluded = masslineEndpointIds(player, target);
  const list = Array.isArray(obstacles)
    ? obstacles
    : collectMasslineObstructionRocks(state, {
      minX: Math.min(sx, tx),
      minZ: Math.min(sz, tz),
      maxX: Math.max(sx, tx),
      maxZ: Math.max(sz, tz),
    });
  const xz = { x: 0, z: 0 };
  for (let i = 0; i < list.length; i++) {
    const rock = list[i];
    if (!masslineObstacleEligible(rock)) continue;
    if (rock.id != null && excluded.has(rock.id)) continue;
    if (rock.liveEntityId != null && excluded.has(rock.liveEntityId)) continue;
    const radius = masslineObstacleRadius(rock);
    if (!(radius > 0)) continue;
    masslineObstacleXZ(rock, simTime, xz);
    const px = xz.x - sx;
    const pz = xz.z - sz;
    // Quadratic segment-vs-disc on the OPEN span: the disc's intersection interval is
    // [along - half, along + half] in unit-direction world units, and only an overlap with
    // (0, span) blocks. A rock that only touches an endpoint is clear; one that overlaps the
    // interior — including a tangent landing strictly inside — blocks.
    const along = px * ux + pz * uz;
    const perp2 = px * px + pz * pz - along * along;
    const radius2 = radius * radius;
    if (perp2 > radius2) continue;
    const half = Math.sqrt(Math.max(0, radius2 - perp2));
    if (along + half <= MASSLINE_T_EPS) continue;
    if (along - half >= span - MASSLINE_T_EPS) continue;
    return true;
  }
  return false;
}

function removeFieldRecord(field, rec) {
  if (!field || !rec) return false;
  const idx = field.rocks.indexOf(rec);
  if (idx >= 0) field.rocks.splice(idx, 1);
  field.byId.delete(rec.id);
  gridRemove(field, rec);
  field.version++;
  rec.alive = false;
  markAuxRowRemoved(field, rec.id);
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

function catchUpFieldRock(field, rec, simTime) {
  if (!rec) return rec;
  const toT = Number.isFinite(simTime) ? simTime : 0;
  const fromT = Number.isFinite(rec.lastExactT) ? rec.lastExactT : toT;
  if (!(toT > fromT)) {
    rec.lastExactT = toT;
    noteFieldRockMotion(field, rec);
    markAuxRowDirty(field, rec.id);
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
  if (field && field.dirtyPoseIds instanceof Set) field.dirtyPoseIds.add(rec.id);
  noteFieldRockMotion(field, rec);
  if (field && Number.isFinite(field.version)) field.version++;
  markAuxRowDirty(field, rec.id);
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
  // Lattice cells carry opticStructureId. Ordinary ore also stamps opticMaterial
  // ('metal' / 'diamond') as a surface tag — that must not shelve a field rock.
  return !!(data && typeof data.opticStructureId === 'string' && data.opticStructureId);
}

function opticColliderRadius(data, radius) {
  const visualRadius = Math.max(0.5, finite(radius, 8));
  if (data.opticMaterial !== 'stone') return visualRadius;
  let pitch = data.opticLatticeSpacing;
  // Old world caches predate pitch metadata. Only the canonical compiler's known rows
  // inherit its spacing; an unrecognized/custom structure must supply its own pitch.
  if (!(Number.isFinite(pitch) && pitch > 0)) {
    const canonical = CANONICAL_OPTIC_STRUCTURES.has(data.opticStructureId)
      || /^scatter:.+:[0-9]+$/.test(data.opticStructureId);
    if (!canonical) return visualRadius;
    pitch = OPTIC_LATTICE_SPACING;
  }
  // The visual stone seam laps, but its dynamic native bodies must not interpenetrate at rest.
  return Math.min(visualRadius, pitch / 2);
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
  catchUpFieldRock(ensureAsteroidField(state), rec, simTime);
  const data = rec.data && typeof rec.data === 'object' ? { ...rec.data } : {};
  delete data.fieldResident;
  const optic = isOpticRockData(data);
  const hull = Number.isFinite(data.oreHP) ? data.oreHP
    : (Number.isFinite(rec.hull) ? rec.hull : (optic ? 1e6 : undefined));
  const hullMax = Number.isFinite(data.oreHPMax) ? data.oreHPMax
    : (Number.isFinite(rec.hullMax) ? rec.hullMax : (optic ? 1e6 : undefined));
  // Optic lattices are authored against entity.radius; bump colliders must not seal the mouth.
  const colliderR = optic
    ? opticColliderRadius(data, rec.radius)
    : asteroidColliderRadius(data.typeId, rec.radius);
  const physicsBody = { radius: colliderR };
  if (optic && colliderR < rec.radius) {
    // Collider calibration must not resize the stone's density-derived native mass or inertia.
    const previous = resolvePhysicsBodySpec({ ...rec, data, physicsBody: { radius: rec.radius } });
    physicsBody.mass = previous.mass;
    physicsBody.inertiaY = previous.inertiaY;
  }
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
    physicsBody,
    data,
  });
  if (!ent) return null;
  if (rec.homeSectorId) {
    ent.homeSectorId = rec.homeSectorId;
    if (ent.data) ent.data.homeSectorId = rec.homeSectorId;
  }
  syncEntitySectorMembership(state && state.entityIndex, ent);
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
  // The demote removes before the field row claims the id, so the removal path sees a
  // recyclable id and drops the player's lock — re-arm it on the row that still resolves
  // (the reserved claim needs the body gone first, so a reorder cannot fix this).
  const wasTargeted = !!(state.player && state.player.targetId === id);
  if (remove) remove(id, { immediate: true, reason: String(reason || 'optic-shelve') });
  else entity.alive = false;
  snapshot.data.opticShelveReason = String(reason || 'optic-shelve');
  const row = insertAsteroidFieldRock(state, snapshot);
  if (wasTargeted && row && row.id === id) state.player.targetId = id;
  return row;
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
// Per-tick promote/demote budgets: crossing a dense optic pocket used to run
// every in-disc promote (catchUp + ship-scan + spawnEntity + ~24-listener
// entity:spawned fan + Rapier mint) inside ONE sim step — the same burst class
// the first-flight cook paces 4-per-yield and far-actors gate on
// budget.request. Deferred records stay field-resident (identical sim reads)
// until their tick — indistinguishable from slightly-later boundary entry.
const OPTIC_PROMOTE_PER_TICK = 4;
const OPTIC_DEMOTE_PER_TICK = 4;

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
    // Past the per-tick budget the record stays field-resident — it simulates
    // identically and promotes on a later tick instead of stacking spawn
    // transactions inside this one.
    if (promoted >= OPTIC_PROMOTE_PER_TICK) continue;
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
    // Symmetric budget: a mass exit shelves N more bodies next tick rather
    // than paying N removal fans inside this step.
    if (shelved >= OPTIC_DEMOTE_PER_TICK) continue;
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
