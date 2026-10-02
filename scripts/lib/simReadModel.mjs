// S1 Phase-B stage 3 — main-side read model v1.
//
// Reconstructs what the present lane reads from live sim state, fed entirely by
// transported data: journal spawn/destroy records + entity-info blocks (entities
// Map) and the aux-row channel (ledger rows: far actors, field rocks, dressing
// rows that are not GameState.entityList members).
//
// The collect query is windowed exactly like appendNearbyLedgerRows: a quantized
// cell walk memoized on (walkX, walkZ, walkRadius, auxVersion), then per-row
// ballistic projection + collect-radius / time-to-enter predicates run against
// the exact origin every call. The worker ships the resolved collect inputs
// (origin, radii, simTime, player velocity) each tick in `collectProbe`, so the
// read-model collect is an apples-to-apples set-equality check against the live
// walk's id set (gate F).
//
// Membership semantics mirror the live state exactly:
//   - entities Map ~ state.entities: spawn info inserts; journal DESTROY deletes
//     (removal-time, matching state.entities.delete — killed-but-unswept rows
//     cannot exist at collect time because the corpse sweep + recordDestroy run
//     inside the tick before the collect probe).
//   - pushAlive parity: every entry that crossed the journal already passed
//     entityIsJournaled (no _noMesh, no visual-factory-skip projectile), so the
//     read-model journaled set = live collect's entityList contribution.
//   - aux rows ~ ledger rows: alive/liveEntityId gates applied per row kind the
//     same way queryAsteroidField/queryFarActors + appendNearbyLedgerRows apply
//     them; dressing rows ride the same aux channel but keep pushAlive's
//     _noMesh filter and dedupe against journaled ids.

import { ASTEROID_FIELD_CELL } from '../../src/world/asteroidField.js';
import {
  timeToEnterRadiusSeconds,
  TABLE_COLLECT_HORIZON_SECONDS,
  TABLE_DECODE_RUNWAY_SECONDS,
} from '../../src/render/tabletopPolicy.js';

// Same numeric cell encoding as the live grids (bijective for |cell| < 1,048,576).
const CELL_KEY_OFFSET = 1048576;
const CELL_KEY_STRIDE = 2097152;
const READ_MODEL_CELL = ASTEROID_FIELD_CELL;

function cellKeyOf(x, z) {
  return (Math.floor(x / READ_MODEL_CELL) + CELL_KEY_OFFSET) * CELL_KEY_STRIDE
    + (Math.floor(z / READ_MODEL_CELL) + CELL_KEY_OFFSET);
}

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

export function createReadModel() {
  return {
    entities: new Map(),   // entityId -> projected entity row (journal-covered)
    aux: new Map(),        // rowId -> aux row (far | rock | dressing)
    auxCells: new Map(),   // numeric cellKey -> Set(rowId)
    auxVersion: 0,
    meshKey: { walkX: NaN, walkZ: NaN, walkRadius: NaN, auxVersion: -1 },
    meshScratch: [],
  };
}

export function applySpawnInfos(readModel, spawnInfos) {
  for (const info of spawnInfos || []) {
    if (!info || !Number.isSafeInteger(info.entityId)) continue;
    readModel.entities.set(info.entityId, {
      id: info.entityId,
      type: info.type,
      alive: info.alive !== false,
      team: info.team,
      factionId: info.factionId,
      pos: { x: info.x || 0, y: 0, z: info.z || 0 },
      radius: info.radius || 0,
      isPlayer: info.isPlayer === true,
      farResident: info.farResident === true,
      fieldResident: info.fieldResident === true,
      sectorId: info.sectorId || null,
      flags: info.flags || {},
      data: {
        callsign: info.callsign,
        name: info.name,
        trafficRole: info.trafficRole,
        role: info.role,
      },
      activity: { presentationTier: info.presentationTier || 0 },
    });
  }
}

// Journal DESTROY == state.entities.delete (fired at removal, inside the same
// tick sweep, before the collect probe). Delete keeps `entities.has` parity with
// the live far-row check (`state.entities.has(rec.id)`).
export function applyDestroyIds(readModel, ids) {
  for (const id of ids || []) {
    if (Number.isSafeInteger(id)) readModel.entities.delete(id);
  }
}

export function applyAuxUpserts(readModel, upserts) {
  if (!Array.isArray(upserts) || !upserts.length) return;
  for (const u of upserts) {
    if (!u || !Number.isSafeInteger(u.id)) continue;
    const cell = cellKeyOf(finite(u.x), finite(u.z));
    const prev = readModel.aux.get(u.id);
    if (prev && prev.cell !== cell) {
      const bucket = readModel.auxCells.get(prev.cell);
      if (bucket) {
        bucket.delete(u.id);
        if (bucket.size === 0) readModel.auxCells.delete(prev.cell);
      }
    }
    const row = {
      id: u.id,
      kind: u.kind,
      type: u.type,
      alive: u.alive !== false,
      pos: { x: finite(u.x), z: finite(u.z) },
      vel: { x: finite(u.vx), z: finite(u.vz) },
      rot: finite(u.rot),
      radius: finite(u.radius),
      lastExactT: Number.isFinite(u.lastExactT) ? u.lastExactT : null,
      liveEntityId: u.liveEntityId == null ? null : u.liveEntityId,
      _noMesh: u.noMesh === true,
      sectorId: u.sectorId || null,
      cell,
    };
    if (!prev) {
      let bucket = readModel.auxCells.get(cell);
      if (!bucket) {
        bucket = new Set();
        readModel.auxCells.set(cell, bucket);
      }
      bucket.add(u.id);
    } else if (prev.cell !== cell) {
      let bucket = readModel.auxCells.get(cell);
      if (!bucket) {
        bucket = new Set();
        readModel.auxCells.set(cell, bucket);
      }
      bucket.add(u.id);
    }
    readModel.aux.set(u.id, row);
    readModel.auxVersion++;
  }
}

export function applyAuxRemovals(readModel, ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  for (const id of ids) {
    const prev = readModel.aux.get(id);
    if (!prev) continue;
    const bucket = readModel.auxCells.get(prev.cell);
    if (bucket) {
      bucket.delete(id);
      if (bucket.size === 0) readModel.auxCells.delete(prev.cell);
    }
    readModel.aux.delete(id);
    readModel.auxVersion++;
  }
}

// Mirror of resolveWorldPresentationEntity's precedence for read-model consumers
// (entities → rock → dressing → far → live-fallback).
export function readModelResolve(readModel, id) {
  if (id == null || !readModel) return null;
  const live = readModel.entities.get(id);
  if (live && live.alive !== false) return live;
  const aux = readModel.aux.get(id);
  if (aux && aux.alive !== false) {
    if (aux.kind === 'rock' && aux.liveEntityId == null) return aux;
    if (aux.kind === 'dressing') return aux;
    if (aux.kind === 'far') return aux;
  }
  return live && live.alive !== false ? live : null;
}

// Disc query over the aux grid — the "windowed query" the stage replaces
// appendNearbyLedgerRows' live-table scans with. Mirrors queryAsteroidField's
// cell walk + per-row disc filter (reach union: d2 <= (r + radius)^2 || d2 <= r2).
// Far rows query the same grid — the live code's row-scan shortcut is a cost
// decision, not a membership difference, so one windowed walk covers both.
function auxQueryDisc(readModel, walkX, walkZ, walkRadius, out) {
  out.length = 0;
  const r = walkRadius;
  const r2 = r * r;
  const minC = Math.floor((walkX - r) / READ_MODEL_CELL);
  const maxC = Math.floor((walkX + r) / READ_MODEL_CELL);
  const minR = Math.floor((walkZ - r) / READ_MODEL_CELL);
  const maxR = Math.floor((walkZ + r) / READ_MODEL_CELL);
  for (let cx = minC; cx <= maxC; cx++) {
    const rowBase = (cx + CELL_KEY_OFFSET) * CELL_KEY_STRIDE + CELL_KEY_OFFSET;
    for (let cz = minR; cz <= maxR; cz++) {
      const bucket = readModel.auxCells.get(rowBase + cz);
      if (!bucket) continue;
      for (const id of bucket) {
        const row = readModel.aux.get(id);
        if (!row) continue;
        const dx = row.pos.x - walkX;
        const dz = row.pos.z - walkZ;
        const d2 = dx * dx + dz * dz;
        const reach = r + finite(row.radius);
        if (d2 <= reach * reach || d2 <= r2) out.push(row);
      }
    }
  }
  return out;
}

const _eff = { x: 0, z: 0 };
function ledgerPredicted(row, simTime) {
  const drift = Math.max(0, finite(simTime) - finite(row.lastExactT));
  _eff.x = finite(row.pos.x) + finite(row.vel.x) * drift;
  _eff.z = finite(row.pos.z) + finite(row.vel.z) * drift;
  return _eff;
}

/**
 * Read-model twin of collectMeshPresentationEntities — returns an id SET (not
 * row objects) for digest comparison against the worker's live collect.
 *
 * `inputs` = the worker-shipped collectProbe block:
 *   { originX, originZ, collectRadius, scanRadius, glassCorner, simTime,
 *     pvx, pvz }
 * origin is the resolved tableLookAtOrigin (focus+frameOrigin math stays
 * worker-side; the resolved scalar crosses — the read model never sees
 * camera.focus directly).
 */
export function readModelCollectIds(readModel, inputs, out = []) {
  out.length = 0;
  const seen = new Set();
  for (const e of readModel.entities.values()) {
    if (e && e.alive !== false && e._noMesh !== true && !seen.has(e.id)) {
      seen.add(e.id);
      out.push(e.id);
    }
  }
  const {
    originX, originZ, collectRadius, scanRadius, glassCorner, simTime,
  } = inputs || {};
  const pvx = finite(inputs && inputs.pvx);
  const pvz = finite(inputs && inputs.pvz);
  // Dressing rows: live collect pushes them via collectJournalPresentationEntities'
  // dressing.rows loop (pushAlive semantics) — dedup against journaled ids.
  for (const row of readModel.aux.values()) {
    if (row.kind !== 'dressing') continue;
    if (row.alive === false || row._noMesh || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row.id);
  }
  if (!(collectRadius > 0)) return out;
  // Quantized walk — identical lattice math to appendNearbyLedgerRows so the
  // memo covers the same superset; per-row predicates still run every call.
  const walkX = (Math.floor(finite(originX) / ASTEROID_FIELD_CELL) + 0.5) * ASTEROID_FIELD_CELL;
  const walkZ = (Math.floor(finite(originZ) / ASTEROID_FIELD_CELL) + 0.5) * ASTEROID_FIELD_CELL;
  const radiusPad = Math.ceil(ASTEROID_FIELD_CELL * Math.SQRT1_2);
  const walkRadius = Math.ceil((finite(scanRadius) + radiusPad) / 500) * 500;
  const key = readModel.meshKey;
  if (!(key.walkX === walkX && key.walkZ === walkZ
        && key.walkRadius === walkRadius && key.auxVersion === readModel.auxVersion)) {
    auxQueryDisc(readModel, walkX, walkZ, walkRadius, readModel.meshScratch);
    key.walkX = walkX;
    key.walkZ = walkZ;
    key.walkRadius = walkRadius;
    key.auxVersion = readModel.auxVersion;
  }
  const radius2 = collectRadius * collectRadius;
  for (let i = 0; i < readModel.meshScratch.length; i++) {
    const row = readModel.meshScratch[i];
    if (!row || seen.has(row.id)) continue;
    if (row.kind === 'rock') {
      // queryAsteroidField already filtered liveEntityId/alive at query time;
      // the aux grid keeps them so the collect applies the same gates here.
      if (row.alive === false || row.liveEntityId != null) continue;
      const eff = ledgerPredicted(row, simTime);
      const relX = eff.x - originX;
      const relZ = eff.z - originZ;
      if (relX * relX + relZ * relZ <= radius2) {
        seen.add(row.id);
        out.push(row.id);
        continue;
      }
      const relVx = finite(row.vel.x) - pvx;
      const relVz = finite(row.vel.z) - pvz;
      const tEnter = timeToEnterRadiusSeconds(
        relX, relZ, relVx, relVz,
        glassCorner + finite(row.radius),
        TABLE_COLLECT_HORIZON_SECONDS,
      );
      if (tEnter <= TABLE_COLLECT_HORIZON_SECONDS) {
        seen.add(row.id);
        out.push(row.id);
      }
    } else if (row.kind === 'far') {
      if (row.alive === false) continue;
      // Live: `live.has(rec.id)` — read model: journaled-entity membership.
      if (readModel.entities.has(row.id)) continue;
      const eff = ledgerPredicted(row, simTime);
      const relX = eff.x - originX;
      const relZ = eff.z - originZ;
      if (relX * relX + relZ * relZ <= radius2) {
        seen.add(row.id);
        out.push(row.id);
        continue;
      }
      const relVx = finite(row.vel.x) - pvx;
      const relVz = finite(row.vel.z) - pvz;
      const tEnter = timeToEnterRadiusSeconds(
        relX, relZ, relVx, relVz,
        glassCorner + finite(row.radius, 8),
        TABLE_DECODE_RUNWAY_SECONDS,
      );
      if (tEnter <= TABLE_DECODE_RUNWAY_SECONDS) {
        seen.add(row.id);
        out.push(row.id);
      }
    }
  }
  return out;
}

/**
 * Set digest shared by both lanes: worker digests the live collect's ids, main
 * digests readModelCollectIds — equal digests prove the read-model collect
 * returns the same set. FNV-1a over the sorted id list; ids are safe-integers
 * (f64) so sort must be numeric.
 */
export function digestIds(ids) {
  const sorted = (ids || []).slice().sort((a, b) => a - b);
  let h = 0x811c9dc5;
  for (const id of sorted) {
    const s = String(id);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2c;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
