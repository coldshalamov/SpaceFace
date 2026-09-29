// Dense world-pose SoA beside GameState — companion to core/combatTable.js.
// Entity objects remain save/authority; the activity pass's discovery-authority
// scan reads these columns instead of touching every entity's object per pass.
//
// Unlike packCombatTable (packed in preStep), packPoseTable is called lazily at
// the classify boundary where the columns are consumed, so they observe the same
// pose values a live entityList walk would. presenceRadius is re-derived for every
// pose-dirty row and on every rebuild; a silent data.*Radius mutation on a still
// entity stays stale until the next roster rebuild — the same freshness contract
// combatTable ships for its radius column.

import { DIRTY, hasDirty, collectDirtyIds } from '../core/dirtyJournal.js';
import { entityPresenceRadius } from './activityClassification.js';

export const POSE_TABLE_SCHEMA = 'spaceface.poseTable.v1';

export const POSE_TABLE_FLAG_ALIVE = 1 << 0;

function grow(table, capacity) {
  table.capacity = capacity;
  table.id = new Uint32Array(capacity);
  table.x = new Float64Array(capacity);
  table.z = new Float64Array(capacity);
  table.presenceRadius = new Float64Array(capacity);
  table.flags = new Uint8Array(capacity);
}

export function ensurePoseTable(state, capacity = 64) {
  if (!state || typeof state !== 'object') return null;
  let table = state.poseTable;
  if (table && table.schema === POSE_TABLE_SCHEMA && table.id instanceof Uint32Array) {
    return table;
  }
  table = {
    schema: POSE_TABLE_SCHEMA,
    count: 0,
    capacity: 0,
    tick: -1,
    source: null,
    rowById: new Map(),
    _idlessCount: 0,
  };
  grow(table, Math.max(8, capacity));
  state.poseTable = table;
  return table;
}

function writeRow(table, row, entity) {
  table.id[row] = entity.id >>> 0;
  table.x[row] = Number.isFinite(entity.pos.x) ? entity.pos.x : 0;
  table.z[row] = Number.isFinite(entity.pos.z) ? entity.pos.z : 0;
  table.presenceRadius[row] = entityPresenceRadius(entity);
  table.flags[row] = entity.alive !== false ? POSE_TABLE_FLAG_ALIVE : 0;
}

export function packPoseTable(state) {
  const table = ensurePoseTable(state);
  if (!table) return null;
  const tick = state.tick | 0;
  const list = Array.isArray(state.entityList) ? state.entityList : [];
  const index = state.entityIndex;
  const indexVersion = index && Number.isInteger(index.version) ? index.version : null;
  const entities = state.entities;
  const membershipDirty = hasDirty(state, DIRTY.MEMBERSHIP);
  const poseDirty = hasDirty(state, DIRTY.POSE);
  // Roster drift outlives the per-tick dirty journal (see combatTable): the index
  // ref/version pair catches sanctioned append/remove, the list ref/length pair
  // catches raw edits that never reach the index, and an entities-map swap means
  // every id resolves to a different object.
  const rosterDrifted = table.packedOnce === true && (
    table.source !== list
    || table._listLength !== list.length
    || table._entitiesRef !== entities
    || table._indexRef !== index
    || (indexVersion !== null && table._indexVersion !== indexVersion)
  );
  const rebuild = !table.packedOnce || membershipDirty || rosterDrifted;
  if (!rebuild && !poseDirty) {
    table.tick = tick;
    return table;
  }
  // Pose-only dirty: refresh rows in place. Died/no-pos rows lose their alive flag
  // but keep order — the scan's Set dedupe is id-keyed and order stays list-stable.
  if (!rebuild && poseDirty) {
    const rowById = table.rowById;
    if (entities && typeof entities.get === 'function' && rowById) {
      const dirtyIds = collectDirtyIds(
        state,
        DIRTY.POSE,
        table._poseDirtyScratch || (table._poseDirtyScratch = []),
      );
      for (let i = 0; i < dirtyIds.length; i++) {
        const id = dirtyIds[i];
        const row = rowById.get(id >>> 0);
        if (row == null || row >= table.count) continue;
        const entity = entities.get(id);
        if (!entity || entity.alive === false || !entity.pos) {
          table.flags[row] = 0;
          continue;
        }
        writeRow(table, row, entity);
      }
      table.tick = tick;
      return table;
    }
  }
  const n = list.length;
  if (n > table.capacity) {
    let next = table.capacity || 8;
    while (next < n) next *= 2;
    grow(table, next);
  }
  let w = 0;
  let idless = 0;
  const rowById = table.rowById || (table.rowById = new Map());
  rowById.clear();
  for (let i = 0; i < n; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false || !entity.pos) continue;
    if (entity.id == null) { idless++; continue; }
    writeRow(table, w, entity);
    rowById.set(table.id[w], w);
    w++;
  }
  table.count = w;
  table._idlessCount = idless;
  table.tick = tick;
  table.packedOnce = true;
  table.source = list;
  table._listLength = list.length;
  table._entitiesRef = entities;
  table._indexRef = index;
  table._indexVersion = indexVersion;
  return table;
}

// Column-order replay of the entityList discovery scan in
// activityRuntime.selectClassifyEntities: same filters (alive flag, seen set),
// same disc test (finite-normalized coords, discover + presenceRadius), same
// add() semantics — the map lookup is identical to how the live walk resolves
// requested/exact/near ids, so a torn row yields undefined and add() drops it.
export function poseTableDiscoveryScan(table, entitiesById, seen, add, discover, origin) {
  const ids = table.id;
  const xs = table.x;
  const zs = table.z;
  const pres = table.presenceRadius;
  const flags = table.flags;
  const rows = table.count;
  const ox = origin.x;
  const oz = origin.z;
  for (let i = 0; i < rows; i++) {
    if ((flags[i] & POSE_TABLE_FLAG_ALIVE) === 0) continue;
    const id = ids[i];
    if (seen.has(id)) continue;
    const limit = discover + pres[i];
    const dx = xs[i] - ox;
    const dz = zs[i] - oz;
    if (dx * dx + dz * dz <= limit * limit) add(entitiesById.get(id));
  }
}
