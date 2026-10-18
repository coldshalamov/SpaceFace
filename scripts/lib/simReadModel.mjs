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

import { resolveOrchardForecast } from '../../src/world/anvilOrchardForecast.js';
import { ANVIL_ORCHARD } from '../../src/data/anvilOrchard.js';
import { isOrchardPod } from '../../src/data/anvilOrchardIdentity.js';
import { sha256Hex } from '../../src/runtime/runtimeFingerprint.js';
import { nowNs } from './simRealm.mjs';
import { projectNpcJobsById } from './npcJobsMirror.mjs';
import { latestPlayerImpactFromTrace } from '../../src/combat/presentationImpact.js';
import { initializePresentationAdmission } from '../../src/core/presentationAdmission.js';
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

// The wire carries scalars; HUD readers use the live entity's nested boost reservoir.
function foldBoostVitals(row, fields) {
  if (fields.boostEnergy === undefined && fields.boostMax === undefined) return;
  if (!row.boost || typeof row.boost !== 'object') row.boost = {};
  if (fields.boostEnergy !== undefined) row.boost.energy = fields.boostEnergy;
  if (fields.boostMax !== undefined) row.boost.max = fields.boostMax;
}

// Work flags change after spawn; keep the machine data object held by visuals.
function foldMachineVitals(row, fields) {
  if (fields.machineRepairing === undefined && fields.machineWorking === undefined) return;
  if (!row.data || typeof row.data !== 'object') row.data = {};
  if (!row.data.machine || typeof row.data.machine !== 'object') row.data.machine = {};
  if (fields.machineRepairing !== undefined) row.data.machine.repairing = fields.machineRepairing;
  if (fields.machineWorking !== undefined) row.data.machine.working = fields.machineWorking;
}

// Mines arm after their spawn; the halo counts the authoritative nested flag.
function foldMineVitals(row, fields) {
  if (fields.mineArmed === undefined) return;
  if (!row.data || typeof row.data !== 'object') row.data = {};
  row.data.armed = fields.mineArmed;
}

// Retain one small presentation object per deployment so VFX can follow later replies.
function foldCountermeasureVitals(row, fields) {
  if (fields.cmEffectId === undefined) return;
  if (!row.data || typeof row.data !== 'object') row.data = {};
  const cm = row.data.cm || (row.data.cm = {});
  cm.effectT = fields.cmEffectT;
  if (fields.cmEffectId === null) { cm.effect = null; return; }
  if (cm.effect?.presentationId !== fields.cmEffectId) {
    cm.effect = { presentationId: fields.cmEffectId, cfg: { kind: fields.cmEffectKind } };
  }
  cm.effect.originX = fields.cmEffectX;
  cm.effect.originZ = fields.cmEffectZ;
}

export function createReadModel() {
  return {
    entities: new Map(),   // entityId -> projected entity row (journal-covered)
    weaponVfxProjectiles: new Map(), // visual-factory-skipped shots, for the weapon presenter only
    aux: new Map(),        // rowId -> aux row (far | rock | dressing)
    auxCells: new Map(),   // numeric cellKey -> Set(rowId)
    auxVersion: 0,
    meshKey: { walkX: NaN, walkZ: NaN, walkRadius: NaN, auxVersion: -1 },
    meshScratch: [],
    domains: new Map(),    // domain key -> mirror facade (stage 4; mutate-in-place)
  };
}

export function applyWeaponVfxProjectiles(readModel, projectileInfos) {
  const seen = new Set();
  for (const info of projectileInfos || []) {
    if (!info || !Number.isSafeInteger(info.entityId)) continue;
    const id = info.entityId;
    seen.add(id);
    let row = readModel.weaponVfxProjectiles.get(id);
    if (!row) {
      row = { id, type: 'projectile', pos: {}, prevPos: {}, vel: {}, data: {} };
      readModel.weaponVfxProjectiles.set(id, row);
    }
    row.type = 'projectile';
    row.alive = info.alive !== false;
    row.team = Number.isFinite(info.team) ? info.team : 0;
    row.ownerId = Number.isSafeInteger(info.ownerId) ? info.ownerId : null;
    row.pos.x = finite(info.x);
    row.pos.y = finite(info.y);
    row.pos.z = finite(info.z);
    row.prevPos.x = finite(info.prevX, row.pos.x);
    row.prevPos.y = finite(info.prevY, row.pos.y);
    row.prevPos.z = finite(info.prevZ, row.pos.z);
    row.vel.x = finite(info.vx);
    row.vel.y = finite(info.vy);
    row.vel.z = finite(info.vz);
    row.rot = finite(info.rot);
    row.radius = finite(info.radius);
    row.data.weaponId = typeof info.weaponId === 'string' ? info.weaponId : null;
  }
  for (const id of readModel.weaponVfxProjectiles.keys()) {
    if (!seen.has(id)) readModel.weaponVfxProjectiles.delete(id);
  }
}

export function applySpawnInfos(readModel, spawnInfos) {
  for (const info of spawnInfos || []) {
    if (!info || !Number.isSafeInteger(info.entityId)) continue;
    const row = {
      id: info.entityId,
      type: info.type,
      alive: info.alive !== false,
      team: info.team,
      factionId: info.factionId,
      pos: { x: info.x || 0, y: finite(info.y, 0), z: info.z || 0 },
      prevPos: null,
      vel: { x: finite(info.vx, 0), z: finite(info.vz, 0) },
      rot: finite(info.rot, 0),
      radius: info.radius || 0,
      isPlayer: info.isPlayer === true,
      farResident: info.farResident === true,
      fieldResident: info.fieldResident === true,
      sectorId: info.sectorId || null,
      flags: info.flags || {},
      data: info.data && typeof info.data === 'object'
        ? canonicalClone(info.data)
        : {
          callsign: info.callsign,
          name: info.name,
          trafficRole: info.trafficRole,
          role: info.role,
        },
      activity: { presentationTier: info.presentationTier || 0 },
    };
    // Stage-8 vitals: per-entity scalar fields the renderer/UI read off the live
    // entity (hull, shield, fuel, and friends). Shipped on spawn and refreshed by
    // the vitals diff channel; absent fields stay undefined rather than 0.
    if (info.vitals && typeof info.vitals === 'object') {
      Object.assign(row, canonicalClone(info.vitals));
      foldBoostVitals(row, info.vitals);
      foldMachineVitals(row, info.vitals);
      foldMineVitals(row, info.vitals);
      foldCountermeasureVitals(row, info.vitals);
    }
    // A re-delivered spawn (init replay, rebuild) must not mint a fresh row
    // object: the render realm holds entity refs across the hop (admission
    // jobs capture admissionEntity at enqueue and stamp presentationAdmission
    // onto it at commit). Replacing the object strands the live row while a
    // dead twin collects the stamp — entity identity is the map slot, the way
    // entityList swap semantics preserve row identity on the main lane.
    const existing = readModel.entities.get(info.entityId);
    const life = Number.isSafeInteger(info.occupantGeneration) ? info.occupantGeneration : null;
    const newOccupant = existing && life != null && existing.occupantGeneration != null
      && existing.occupantGeneration !== life;
    if (newOccupant) existing.alive = false; // Captured admissions now lose their old owner.
    const target = existing && typeof existing === 'object' && !newOccupant ? existing : row;
    if (life != null) Object.defineProperty(target, 'occupantGeneration', {
      value: life, writable: true, configurable: true, enumerable: false,
    });
    if (target === existing) {
      delete row.prevPos;
      Object.assign(existing, row);
      // A stamped admission verdict outranks the fresh spawn's 'pending' —
      // presentationAdmission isn't a mirrored field, so the render realm
      // owns whatever is already there once it exists.
      if (existing.presentationAdmission == null) initializePresentationAdmission(existing);
    } else {
      // The row is the worker lane's spawnEntity product — same authored-
      // presentation contract: admit-required rows start 'pending' so the
      // render realm's admit path (boundaryLiveEntity resolves this same
      // map) can stamp them 'ready' exactly as on the main lane.
      initializePresentationAdmission(row);
      readModel.entities.set(info.entityId, row);
    }
  }
}

/**
 * Stage-8: update facade pose from a drained journal transform record — pos,
 * prevPos, and the yaw/bank/pitch rotation tuple. The journal IS the pose truth
 * the presentation lane consumes, so the facade answers the same values.
 */
export function applyFacadePose(readModel, entityId, pose) {
  const row = readModel && readModel.entities.get(entityId);
  if (!row || !pose || typeof pose !== 'object') return;
  if (!row.prevPos) row.prevPos = { x: row.pos.x, y: row.pos.y, z: row.pos.z };
  if (Number.isFinite(pose.x)) { row.prevPos.x = row.pos.x; row.pos.x = pose.x; }
  if (Number.isFinite(pose.y)) { row.prevPos.y = row.pos.y; row.pos.y = pose.y; }
  if (Number.isFinite(pose.z)) { row.prevPos.z = row.pos.z; row.pos.z = pose.z; }
  if (Number.isFinite(pose.rot)) row.rot = pose.rot;
  if (Number.isFinite(pose.prevX)) row.prevPos.x = pose.prevX;
  if (Number.isFinite(pose.prevY)) row.prevPos.y = pose.prevY;
  if (Number.isFinite(pose.prevZ)) row.prevPos.z = pose.prevZ;
  if (Number.isFinite(pose.prevRot)) row.prevRot = pose.prevRot;
  if (Number.isFinite(pose.bank)) row.bank = pose.bank;
  if (Number.isFinite(pose.pitch)) row.pitch = pose.pitch;
}

/**
 * Stage-8: apply the vitals diff channel — [entityId, fields] pairs replacing
 * named scalar fields on the facade row (null entity ids / unknown facades skip).
 */
export function applyEntityVitals(readModel, vitals) {
  if (!Array.isArray(vitals) || !vitals.length) return;
  for (const entry of vitals) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const id = entry[0];
    const fields = entry[1];
    if (!Number.isSafeInteger(id) || !fields || typeof fields !== 'object') continue;
    const row = readModel.entities.get(id);
    if (!row) continue;
    for (const key of Object.keys(fields)) {
      const v = fields[key];
      if (v === undefined) delete row[key];
      else row[key] = v;
    }
    foldBoostVitals(row, fields);
    foldMachineVitals(row, fields);
    foldMineVitals(row, fields);
    foldCountermeasureVitals(row, fields);
    // Vitals ship velocity as flat vx/vz while presentation readers (HUD speed
    // tape, playable checks) consume the nested `vel` vector the live entity
    // carries — refold so both views stay coherent.
    if (fields.vx !== undefined || fields.vz !== undefined) {
      if (!row.vel || typeof row.vel !== 'object') row.vel = { x: 0, y: 0, z: 0 };
      if (fields.vx !== undefined) row.vel.x = fields.vx;
      if (fields.vz !== undefined) row.vel.z = fields.vz;
    }
  }
}

// Journal DESTROY == state.entities.delete (fired at removal, inside the same
// tick sweep, before the collect probe). Delete keeps `entities.has` parity with
// the live far-row check (`state.entities.has(rec.id)`).
export function applyDestroyIds(readModel, ids) {
  for (const id of ids || []) {
    if (!Number.isSafeInteger(id)) continue;
    const row = readModel.entities.get(id);
    if (row) row.alive = false;
    readModel.entities.delete(id);
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

// ---------------------------------------------------------------------------
// S1 Phase-B stage 4 — domain mirrors (read model v2).
//
// The render+UI lane reads sim-owned state keys beyond the journal-covered
// presentation set. After the flip those reads must hit main-side facades, so
// the worker ships canonical snapshots of every mirrored key whenever its
// canonical signature changes. Facades are mutated in place on the main side —
// consumers hold references across ticks, identity is the contract.
//
// Mirrored key set (stage-4 census; UI+render reads merged). Top-level state
// keys plus the non-aux world.* subkeys. NOT mirrored, deliberately:
//   entities/entityList/entityIndex (v1 read model), world.asteroidField /
//   farActors / dressing (aux channel), settings (command envelopes),
//   render/ui/meshes/camera/perfRuntime/assets/pools/diagnostics/stats/slots
//   (render-local — they move WITH the render lane), bus (event bridge),
//   rng (worker-only — a main-side draw would fork the stream), timeScale /
//   flight / jump / scenario / traffic / claims / crafting / careers /
//   conflicts / aiEncounter / interventions (outside the census set).
// ---------------------------------------------------------------------------

// Stage-6 narrowed census (item C): mirror only what the render/UI lane
// provably reads. Whole roots carry dynamic consumers (player.cargo, economy.*,
// missions.active, factions[id].rep, combat.attachments, bare `state.onboarding`
// object reads, meta.seed/playtimeS, run.kind/ruleset, input.* live controls,
// fuel.current/max, aceMemory[id], cursor on the asteroid screen, sandbox,
// mode/simTime/tick/playerId/ruleset scalars). Dotted keys mirror just the
// consumed subtree — resolveDomainValue walks every segment.
//
// Dropped vs the stage-4 set: world.sectorId and world.currentSector (dead
// keys — neither ever exists on gameState), and the untouched halves of the
// narrowed roots (sectorSim.* minus .field, npcJobs.* minus .byId,
// factionPresence.* minus .boarding, automation internals, drill internals,
// save internals, world.records internals besides .byId).
export const DOMAIN_MIRROR_KEYS = Object.freeze([
  // whole-root mirrors
  'mode', 'simTime', 'tick', 'playerId', 'ruleset',
  'player', 'missions', 'nav', 'economy', 'story', 'factions', 'combat',
  'input', 'fuel', 'aceMemory', 'sandbox', 'onboarding', 'meta', 'run',
  'cursor',
  // Bounded live pod facts only: the leaf projector excludes other planet authority.
  'planet.ships', 'planet.orchardForecast',
  'spectrumPublic', 'physicsVenuePublic', 'orbitalGalleryLedger', 'kineticLeague',
  'survivalDraftPublic', 'survivalResultsPublic', 'careers',
  'physicsVenueSession', 'world.wreckCourtRulings',
  'replay.latestPoseSample', 'mercyServicePublic', 'wreckCourtPublic',
  // leaf-path mirrors (root stays on the facade; only the subtree ships)
  'flightRuntime.angularIntent',
  'sectorSim.field', 'npcJobs.byId', 'npcJobs.revision', 'factionPresence.boarding',
  'automation.meta', 'automation.traders', 'automation.fleet',
  // The site map, machinery HUD and cargo transfer UI read these authoritative
  // records; presentation-owned siblings remain local to the main realm.
  'sites.byId', 'sites.order', 'sites.worldById', 'sites.worldOrder', 'automation.drones',
  'drill.scan', 'drill.active', 'drill.tilesCleared', 'drill.field',
  'drill.asteroidId',
  'save.slots', 'save.currentSlot',
  // Stage-E facade coverage: the claims facade's read view needs the whole root
  // (galaxyMap reads state.claims.stationGrowth directly, not just bodies), and
  // the industry screen reads state.crafting.queues.
  'claims', 'crafting',
  'world.currentSectorId', 'world.sectors', 'world.discovery',
  'world.frameOrigin', 'world.frameOriginSeq', 'world.frontierRumors',
  'world.scanPings', 'world.activeSector', 'world.records.byId',
  'world.vestaOreCache', 'world.pallasHiddenCache',
  // Fold-authored ui.* fields the worker owns but main still reads: docked gates
  // presentationFreeze/uiStage/doDock re-entry, and the soak probe reads the
  // facade's ui.docked. Without these mirrors the fold write never reaches main.
  'ui.docked', 'ui.dockedStationId', 'ui.objectSelection',
  // Sim-authored the same way: acceptMission tracks state.ui.trackedMissionId
  // and the HUD tracker, galaxy map and comms read it on the facade.
  'ui.trackedMissionId',
  // acceptMission also pushes missions.active — facade readers (Mission Log,
  // HUD tracked panel, contracts Accepted section) need it inside the accept
  // beat, not the whole-root missions leaf's next cold-leaf window.
  'missions.active', 'missions.completed', 'missions.failed',
  // machineGate/machine-route standing for the main-side computeRoute facade
  // (routePlanner reads machineAccess + machineProtocol only).
  'world.alienEcology',
  // Native store status settles Continue and is read synchronously by save event listeners.
  'save.sharedStoreStatus',
]);

// Per-key canonical-serialization ship cap (report-only): any single mirrored
// value whose signature exceeds this is flagged in the run diagnostics.
export const DOMAIN_SHIP_CAP_BYTES = 256 * 1024;

// Live-state accessor for a mirrored key. Every segment walks off the state
// root — 'world.currentSectorId' reaches state.world.currentSectorId, and the
// stage-6 leaf keys ('sectorSim.field', 'drill.scan', 'world.records.byId')
// walk their full path. A dead segment resolves to undefined: the differ then
// treats the leaf as absent rather than throwing on a missing container.
export function resolveDomainValue(state, key) {
  if (!state) return undefined;
  let node = state;
  const start = key.indexOf('.');
  if (start < 0) return node[key];
  for (const seg of key.split('.')) {
    if (node == null) return undefined;
    node = node[seg];
  }
  return node;
}

// Path granularity: mirrored roots are diffed at leaf-path level, not whole-key.
// A whole-key diff forces a full canonical walk of the largest roots every tick
// (economy ≈ 3.9 MB, measured stage-4 census) — ~75 ms/tick. Expansion descends
// into plain-object children up to the declared depth so big roots split into
// per-leaf paths (economy.markets.<station>, combat.attachments, ...).
// Cadence tiers (measured stage-4 census): leaf paths > DOMAIN_COLD_BYTES
// re-sign every DOMAIN_COLD_TICKS passes; > DOMAIN_WARM_BYTES every
// DOMAIN_WARM_TICKS; smaller leaves every pass. The probe always reports the
// last-signed digest per leaf path, so it stays consistent with the facade
// state between cold/warm re-signs (facades trail live by the tier interval
// at worst — the signed digest still describes the shipped content).
export const DOMAIN_EXPAND = Object.freeze({ economy: 2, combat: 1, story: 1, input: 1, meta: 1, player: 1, run: 1 });
// player: 1 — the wallet/cargo fields the UI reads hot (player.credits,
// player.cargo) sign every pass instead of trailing the monolithic player
// leaf's cold-tier 60-tick interval: a settled trade used to leave the facade
// showing pre-trade credits for up to a full cold period.
// run: 1 — phase identity travels with the body reply; other top-level run
// values keep their existing slow cadence and nested bags remain bounded leaves.
// Path-prefix expansion overrides: a matching prefix raises the expansion
// depth for that subtree. None active — measured 2026-10: expanding
// economy.markets one more level (per-commodity rows) balloons the leaf set
// from ~150 to ~1300 and the fixed per-pass walk (~1µs/leaf) costs more than
// the ship bytes it saves. Kept as a tuning knob for stage 5+.

export const DOMAIN_COLD_BYTES = 4 * 1024;
export const DOMAIN_COLD_TICKS = 60;
export const DOMAIN_WARM_BYTES = 1024;
export const DOMAIN_WARM_TICKS = 10;
// Expanded containers re-enumerate their children on this cadence instead of
// every pass (add/remove detection trails by the interval; leaf signing inside
// the known set keeps its own tier cadence). Warm leaves and enumerations are
// staggered round-robin by node slot so per-pass cost stays flat. Cold leaves
// use the same staggering: signing every market/history leaf on one pass
// stalls the worker's next pose reply even if the average cost looks small.
// The old aligned offset remains available for explicit diagnostic comparisons.
export const DOMAIN_ENUM_TICKS = 10;
export const DOMAIN_COLD_OFFSET = DOMAIN_COLD_TICKS >> 1;
// Stage-6 per-domain freshness budgets (item C): leaf paths under a listed
// root re-sign no more often than N passes. The effective interval is
// max(sizeTier, cadence) — cadence only ever RELAXES a leaf (markets refresh
// ~6x/s, slow UI bags ~1x/s); a cold leaf keeps its 60-pass freshness budget.
// Roots not listed keep the size-tier schedule unchanged.
export const DOMAIN_CADENCE = Object.freeze({
  economy: 10, missions: 10, story: 10, factions: 30,
  sectorSim: 10, npcJobs: 30, 'npcJobs.revision': 1, factionPresence: 10, automation: 30,
  sites: 10,
  onboarding: 10, meta: 30, run: 30, save: 10, aceMemory: 60,
  'save.sharedStoreStatus': 1,
  // Native phase identity shares the body reply's clock. A paced intro label over already-live
  // field motion misrepresents the public round; score/history retain the run root cadence.
  'run.kind': 1, 'run.ruleset': 1, 'run.phase': 1, 'run.wave': 1,
  // The completion census is sampled alongside phase by player-truth and the HUD. Keep the
  // resolved count on the same reply as cleanup so a finished wave cannot present a stale kill
  // total after its phase has already advanced.
  'run.resolvedThreat': 1,
  // The HUD also reads the planned count while a wave is active. Ship a changed budget with the
  // next domain reply; unlike spawnedThreat this is a small plan value, not a recurring census.
  'run.threatBudget': 1,
  // The accept beat must reach the facade inside its own publish window, not the
  // missions root cadence — Mission Log / HUD / contracts render off the mirror.
  'missions.active': 1,
  'world.sectors': 10, 'world.discovery': 10, 'world.records': 60,
  'world.frontierRumors': 10, 'world.scanPings': 10, 'world.activeSector': 10,
  'world.vestaOreCache': 60, 'world.pallasHiddenCache': 60,
});
// Every Nth probe ships the full slot/digest set instead of the changed-set
// delta: a periodic whole-facade re-verification that also re-checks for
// facade paths the live state no longer has.
export const DOMAIN_PROBE_SWEEP_TICKS = 60;

// Cadence keys name the mirrored root OR a dot-prefix of it — 'sectorSim' binds
// 'sectorSim.field', 'world.records' binds 'world.records.byId'. Longest prefix
// wins — a leaf entry may tighten OR relax the root it sits under.
const DOMAIN_CADENCE_KEYS = Object.keys(DOMAIN_CADENCE);
function domainCadenceFor(rootKey) {
  let ticks = 0;
  let bestLen = -1;
  for (const key of DOMAIN_CADENCE_KEYS) {
    if (key.length <= bestLen) continue;
    if (rootKey === key || rootKey.startsWith(`${key}.`)) {
      bestLen = key.length;
      ticks = DOMAIN_CADENCE[key];
    }
  }
  return ticks;
}

// Mutable mirroring profile (stage-7 item B): the differ consumes this in the
// worker realm; the facade probe/checker consumes it in the main realm. Both
// realms must install the SAME profile before the first diff pass or the probe
// path sets diverge — the runner ships it on the init directive so the two
// realms can't drift. The station profile keeps the stage-6 shape and adds
// only the bounded live-market projection.
//   expandPaths: [{segs, depth}] — prefix expansion overrides (was the frozen
//     DOMAIN_EXPAND_PATHS knob; a matching prefix raises expand depth).
//   leafViews: [{segs, leafSegs, drop, project, deferFirstSign, firstSignTicks,
//     minCadenceTicks}] — leaf projections: at a leaf path of length leafSegs
//     matching prefix segs, sign/ship the projected leaf; `drop` removes named
//     keys from one object and `project` selects a named bounded projection.
//   combatTraceProjection: when true, replace combat.trace with the bounded
//     player-impact receipt used by the pause screen; false retains the full
//     trace for diagnostics.
//     deferFirstSign spreads
//     first-signs onto a slot schedule (firstSignTicks ticks — defaults to the
//     root cadence, DOMAIN_COLD_TICKS flattens a mass-mint hardest).
//     minCadenceTicks is an explicit lower bound between ordinary re-signs;
//     it does not delay the first mint or structural deletion.
//   staggerCold: defaults true; explicit false restores the aligned
//     DOMAIN_COLD_OFFSET burst for historical diagnostic comparisons.
const activeDomainConfig = {
  expandPaths: [], leafViews: [], staggerCold: true, combatTraceProjection: false,
};
const NPC_JOBS_MIRROR_RULE = Object.freeze({ project: 'npcJobs' });
const COMBAT_TRACE_PRESENTATION_RULE = Object.freeze({ project: 'combatPause' });
const ORCHARD_FORECAST_MIRROR_RULE = Object.freeze({ project: 'orchardForecast' });
const ORCHARD_EXPOSURE_MIRROR_RULE = Object.freeze({ project: 'orchardExposure' });

// Named diagnostic wire profiles. The ordinary runtime installs the station
// profile before the first differ is created and ships the same object to the
// worker realm. The station profile projects listing history out of the live
// mirror; the market UI backfills those authoritative rings through the
// marketHistory RPC. The history-bearing commodity profile remains available
// for diagnostics that keep inline history.
export const DOMAIN_MIRROR_PROFILE_NAMES = Object.freeze([
  'station', 'commodity', 'commodity-nohist',
]);

export function createDomainMirroringProfile(name = 'station') {
  const profile = String(name || 'station');
  if (profile === 'station') return {
    // Keep the production station-level shape (economy.markets.<station> is
    // still one leaf) while removing only the per-listing chart cache. The
    // worker's authoritative market/history objects are never changed.
    leafViews: [{
      segs: ['economy', 'markets'], leafSegs: 3,
      project: 'marketLive', minCadenceTicks: DOMAIN_COLD_TICKS,
    }],
    staggerCold: true,
    combatTraceProjection: true,
  };
  if (profile !== 'commodity' && profile !== 'commodity-nohist') {
    throw new RangeError(`unknown domain mirror profile: ${profile}`);
  }
  return {
    expandPaths: [
      { segs: ['economy', 'markets'], depth: 3 },
      { segs: ['economy', 'cycles'], depth: 3 },
    ],
    leafViews: [
      {
        segs: ['economy', 'markets'], leafSegs: 4,
        drop: profile === 'commodity-nohist' ? ['history'] : [],
        deferFirstSign: true, firstSignTicks: 60,
      },
      {
        segs: ['economy', 'cycles'], leafSegs: 4,
        drop: [], deferFirstSign: true, firstSignTicks: 60,
      },
    ],
    staggerCold: true,
    combatTraceProjection: true,
  };
}

export function configureDomainMirroring(config = {}) {
  activeDomainConfig.expandPaths = Array.isArray(config.expandPaths) ? config.expandPaths : [];
  activeDomainConfig.leafViews = Array.isArray(config.leafViews) ? config.leafViews : [];
  activeDomainConfig.staggerCold = config.staggerCold !== false;
  activeDomainConfig.combatTraceProjection = config.combatTraceProjection === true;
}

// Find the leaf-view rule covering a leaf path, or null. leafSegs must equal
// the full segment count (rule prefix + path suffix) so a rule can't reach
// deeper into a subtree than it declared.
function domainLeafViewFor(segs) {
  if (segs.length === 1 && segs[0] === 'planet.orchardForecast') return ORCHARD_FORECAST_MIRROR_RULE;
  if (segs.length === 1 && segs[0] === 'planet.ships') return ORCHARD_EXPOSURE_MIRROR_RULE;
  if (activeDomainConfig.combatTraceProjection && isCombatTracePath(segs)) {
    return COMBAT_TRACE_PRESENTATION_RULE;
  }
  // DOMAIN_MIRROR_KEYS keeps dotted leaf paths as one logical root on the worker wire; the main
  // lane splits that segment while grafting it into state.npcJobs.byId.
  if ((segs.length === 1 && segs[0] === 'npcJobs.byId')
      || (segs.length === 2 && segs[0] === 'npcJobs' && segs[1] === 'byId')) {
    return NPC_JOBS_MIRROR_RULE;
  }
  for (const rule of activeDomainConfig.leafViews) {
    if (segs.length !== rule.leafSegs) continue;
    const p = rule.segs;
    let match = true;
    for (let i = 0; i < p.length; i++) {
      if (segs[i] !== p[i]) { match = false; break; }
    }
    if (match) return rule;
  }
  return null;
}

function isNpcJobsByIdPath(segs) {
  return (segs.length === 1 && segs[0] === 'npcJobs.byId')
    || (segs.length === 2 && segs[0] === 'npcJobs' && segs[1] === 'byId');
}

// Shallow key-drop projection for a leaf-view rule. Returns a copy minus the
// dropped keys — never mutates the live value; callers sign/clone the result
// so the facade stores exactly the projected (shipped) content.
function projectMarketLive(v) {
  if (!isCanonicalObject(v)) return v;
  const commodityIds = Object.keys(v);
  let hasHistory = false;
  for (const commodityId of commodityIds) {
    const listing = v[commodityId];
    if (isCanonicalObject(listing) && Object.hasOwn(listing, 'history')) {
      hasHistory = true;
      break;
    }
  }
  if (!hasHistory) return v;
  const out = {};
  for (const commodityId of commodityIds) {
    const listing = v[commodityId];
    if (!isCanonicalObject(listing) || !Object.hasOwn(listing, 'history')) {
      out[commodityId] = listing;
      continue;
    }
    const projected = {};
    for (const key of Object.keys(listing)) {
      if (key !== 'history') projected[key] = listing[key];
    }
    out[commodityId] = projected;
  }
  return out;
}

function projectCombatTraceForPause(v, playerId) {
  if (!isCanonicalObject(v) || !Array.isArray(v.events)) return v;
  return {
    playerId: playerId == null ? null : playerId,
    latestPlayerImpact: latestPlayerImpactFromTrace(v, playerId),
  };
}

function projectOrchardExposure(state, records) {
  const out = {};
  if (!state?.planet?.active || state.planet.siteId !== ANVIL_ORCHARD.planetId
    || state.world?.currentSectorId !== ANVIL_ORCHARD.sectorId || !isCanonicalObject(records)) return out;
  let count = 0;
  for (const id of Object.keys(records)) {
    if (count >= ANVIL_ORCHARD.socketCount) break;
    const entity = state.entities?.get?.(Number(id));
    const rec = records[id];
    if (!entity || !isOrchardPod(entity) || entity.physicsBody.dynamic !== true
      || entity.data.masslineTetherable !== true || !Number.isSafeInteger(entity.occupantGeneration)
      || entity.occupantGeneration < 1 || rec?.occupantGeneration !== entity.occupantGeneration
      || !Number.isFinite(rec.lastThermalAt) || rec.lastThermalAt < 0 || rec.lastThermalAt > state.simTime
      || !Number.isFinite(rec.heat) || rec.heat < 0 || rec.heat > 1
      || !['outside', 'influence', 'sling', 'skim', 'danger', 'reentry'].includes(rec.region)
      || ![null, 'skim', 'commit', 'breakup', 'descent'].includes(rec.stage)) continue;
    out[id] = { occupantGeneration: rec.occupantGeneration, lotId: entity.data.worldRecordId,
      heat: rec.heat, stage: rec.stage, region: rec.region, lastThermalAt: rec.lastThermalAt };
    count++;
  }
  return out;
}

function projectDomainLeaf(rule, v, state) {
  // npcJobs.byId is authoritative in the worker but a presentation mirror on the main side.
  // Project before canonicalization so the expensive planner/cargo/sidecar fields do not enter
  // the signed string or structured-clone update.  The worker state itself is never modified.
  if (rule?.project === 'orchardForecast') return resolveOrchardForecast(state);
  if (rule?.project === 'orchardExposure') return projectOrchardExposure(state, v);
  if (rule && rule.project === 'npcJobs') return projectNpcJobsById(v);
  if (rule && rule.project === 'marketLive') return projectMarketLive(v);
  if (rule && rule.project === 'combatPause') return projectCombatTraceForPause(v, state && state.playerId);
  if (!rule || !Array.isArray(rule.drop) || !isCanonicalObject(v)) return v;
  let has = false;
  for (const k of rule.drop) {
    if (Object.hasOwn(v, k)) { has = true; break; }
  }
  if (!has) return v;
  const out = {};
  for (const k of Object.keys(v)) if (!rule.drop.includes(k)) out[k] = v[k];
  return out;
}

function expandDepthFor(segs) {
  // These roots are bounded presentation projections, even when a diagnostic
  // profile expands every root. Expanding their raw sources would bypass the
  // projector, and the facade must retain the same atomic projected path.
  if (segs[0] === 'planet.ships' || segs[0] === 'planet.orchardForecast') return 0;
  let depth = DOMAIN_EXPAND[segs[0]] || 0;
  for (const rule of activeDomainConfig.expandPaths) {
    const p = rule.segs;
    if (p.length >= segs.length) continue;
    let match = true;
    for (let i = 0; i < p.length; i++) {
      if (segs[i] !== p[i]) { match = false; break; }
    }
    if (match && rule.depth > depth) depth = rule.depth;
  }
  return depth;
}

// True for values the canonical object branch serializes as `o:{...}` — plain
// objects AND class instances (own enumerable fields only). These are the only
// kinds the differ descends into for path expansion.
function isCanonicalObject(v) {
  return v !== null && typeof v === 'object'
    && !Array.isArray(v) && !(v instanceof Map) && !(v instanceof Set)
    && !(v instanceof Date) && !(v instanceof RegExp)
    && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer);
}

// Combat trace is an append-only producer-owned record.  Its public shape is
// deliberately checked before using the watermark: loaded/diagnostic objects
// with an unknown field or malformed producer field continue through the
// ordinary exact canonical walk.  The watermark is only a work-elision hint;
// it never crosses the wire and never replaces the full signature/payload.
const COMBAT_TRACE_KEYS = Object.freeze([
  'nextSeq', 'capacity', 'events', 'dropped', 'hashU32', 'digest',
]);
const COMBAT_TRACE_KEY_SET = new Set(COMBAT_TRACE_KEYS);

function combatTraceWatermark(trace, previous = null, playerId = null) {
  if (!isCanonicalObject(trace) || !Array.isArray(trace.events)) return null;
  const keys = Object.keys(trace);
  if (keys.length !== COMBAT_TRACE_KEYS.length
      || keys.some((key) => !COMBAT_TRACE_KEY_SET.has(key))) return null;
  if (!Number.isSafeInteger(trace.nextSeq) || trace.nextSeq < 1
      || !Number.isSafeInteger(trace.capacity) || trace.capacity < 1
      || !Number.isSafeInteger(trace.dropped) || trace.dropped < 0
      || !Number.isInteger(trace.hashU32) || trace.hashU32 < 0 || trace.hashU32 > 0xffffffff
      || typeof trace.digest !== 'string' || !/^[0-9a-f]{8}$/.test(trace.digest)
      || trace.events.length > trace.capacity) return null;

  const events = trace.events;
  const firstEvent = events[0];
  const lastEvent = events.length ? events[events.length - 1] : undefined;
  // appendCombatTrace creates canonical plain event objects and never edits an
  // existing event.  Validate a new/replaced event array once; subsequent
  // unchanged passes use identity plus the producer watermarks below.
  const eventArrayReplaced = !previous || previous.trace !== trace || previous.events !== events
    || previous.eventLength !== events.length
    || previous.firstEvent !== firstEvent || previous.lastEvent !== lastEvent;
  if (eventArrayReplaced) {
    for (const event of events) {
      if (!isCanonicalObject(event)) return null;
    }
  }
  return {
    trace,
    events,
    playerId: playerId == null ? null : playerId,
    eventLength: events.length,
    firstEvent,
    lastEvent,
    nextSeq: trace.nextSeq,
    dropped: trace.dropped,
    capacity: trace.capacity,
    hashU32: trace.hashU32,
    digest: trace.digest,
  };
}

function sameCombatTraceWatermark(a, b) {
  if (!a || !b
      || a.trace !== b.trace
      || a.events !== b.events
      || a.playerId !== b.playerId
      || a.eventLength !== b.eventLength
      || a.firstEvent !== b.firstEvent
      || a.lastEvent !== b.lastEvent
      || a.nextSeq !== b.nextSeq
      || a.dropped !== b.dropped
      || a.capacity !== b.capacity
      || a.hashU32 !== b.hashU32
      || a.digest !== b.digest) return false;
  if (!Array.isArray(a.eventRefs) || a.eventRefs.length !== b.eventLength) return false;
  for (let i = 0; i < b.events.length; i++) {
    if (a.eventRefs[i] !== b.events[i]) return false;
  }
  return true;
}

function isCombatTracePath(segs) {
  return segs.length === 2 && segs[0] === 'combat' && segs[1] === 'trace';
}

// sha256 hex (truncated to 64-bit) of a canonical signature string — what
// crosses the wire in the probe. 16 hex chars per path keeps the per-tick
// probe under a few KB; collision risk is nil at ~150-path scale.
export function domainSigDigest(sig) {
  return sha256Hex(sig).slice(0, 16);
}

// --- canonical signature ----------------------------------------------------
//
// Deterministic serialization of a value's canonical (transport) form:
//   numbers/bigints/strings/booleans/null → typed literal tokens
//   plain objects & class instances       → own-enumerable sorted-key tuple
//   arrays                                → elements in order
//   Map                                   → entries sorted by key signature
//   Set                                   → values sorted by signature
//   Date/RegExp                           → tagged literal
//   typed arrays                          → ctor tag + elements in order
//   functions/undefined/symbols           → '@@opaque'
//   true back-edge revisits (cycles)      → '@@cycle'
// Shared references that are NOT ancestors of the current node re-sign by
// content (the signature describes data, not sharing topology — mutate-in-place
// facades legitimately hold different identity graphs than the live objects).
// `seen` is the ancestor set: add on descend, delete on ascend.
// The same traversal shapes canonicalClone, so a facade re-signs byte-identical
// to the live value it mirrors.

const SIG_OPAQUE = '@@opaque';
const SIG_CYCLE = '@@cycle';

export function writeDomainSignature(value, parts, seen) {
  if (value === null) {
    parts.push('null');
    return;
  }
  const t = typeof value;
  if (t === 'number') {
    parts.push('n:', Number.isNaN(value) ? 'NaN'
      : Object.is(value, -0) ? '-0'
        : Number.isFinite(value) ? String(value)
          : String(value));
    return;
  }
  if (t === 'string') {
    parts.push('s:', JSON.stringify(value));
    return;
  }
  if (t === 'boolean') {
    parts.push('b:', String(value));
    return;
  }
  if (t === 'bigint') {
    parts.push('g:', String(value));
    return;
  }
  if (t !== 'object') {
    parts.push(SIG_OPAQUE);
    return;
  }
  if (seen.has(value)) {
    parts.push(SIG_CYCLE);
    return;
  }
  if (Array.isArray(value)) {
    seen.add(value);
    parts.push('a:[');
    for (let i = 0; i < value.length; i++) {
      if (i) parts.push(',');
      writeDomainSignature(value[i], parts, seen);
    }
    parts.push(']');
    seen.delete(value);
    return;
  }
  if (value instanceof Map) {
    seen.add(value);
    const entries = [];
    for (const [k, v] of value) {
      const keyParts = [];
      writeDomainSignature(k, keyParts, seen);
      entries.push([keyParts.join(''), v]);
    }
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    parts.push('m:{');
    for (let i = 0; i < entries.length; i++) {
      if (i) parts.push(',');
      parts.push(entries[i][0], '=>');
      writeDomainSignature(entries[i][1], parts, seen);
    }
    parts.push('}');
    seen.delete(value);
    return;
  }
  if (value instanceof Set) {
    seen.add(value);
    const sigs = [];
    for (const item of value) {
      const itemParts = [];
      writeDomainSignature(item, itemParts, seen);
      sigs.push(itemParts.join(''));
    }
    sigs.sort();
    parts.push('e:{', sigs.join(','), '}');
    seen.delete(value);
    return;
  }
  if (value instanceof Date) {
    parts.push('d:', String(value.getTime()));
    return;
  }
  if (value instanceof RegExp) {
    parts.push('r:', value.source, '/', value.flags);
    return;
  }
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      parts.push('y:DataView:[', String(value.byteLength), ']');
      return;
    }
    parts.push('y:', value.constructor.name, ':[');
    for (let i = 0; i < value.length; i++) {
      if (i) parts.push(',');
      writeDomainSignature(value[i], parts, seen);
    }
    parts.push(']');
    return;
  }
  seen.add(value);
  const keys = Object.keys(value).sort();
  parts.push('o:{');
  for (let i = 0; i < keys.length; i++) {
    if (i) parts.push(',');
    parts.push(JSON.stringify(keys[i]), '=');
    let field;
    try {
      field = value[keys[i]];
    } catch (_) {
      field = undefined; // throwing getter — opaque leaf
    }
    writeDomainSignature(field, parts, seen);
  }
  parts.push('}');
  seen.delete(value);
}

// Canonical signature of a value. `scratch` is a caller-retained object the
// helper fills with {parts, seen} so repeat calls allocate nothing but the
// joined result string.
export function canonicalSignature(value, scratch) {
  const ctx = scratch || {};
  const parts = ctx.parts || (ctx.parts = []);
  const seen = ctx.seen || (ctx.seen = new Set());
  parts.length = 0;
  seen.clear();
  writeDomainSignature(value, parts, seen);
  return parts.join('');
}

// --- canonical clone --------------------------------------------------------
//
// Transport-safe deep copy with the same traversal as the signature: functions
// and other opaque leaves become `undefined`, class instances become plain
// objects of their own enumerable fields, cycles/shared refs are preserved as
// shared references (structured clone carries the graph verbatim).

function cloneDomainValue(value, seen) {
  if (value === null) return null;
  const t = typeof value;
  if (t === 'number' || t === 'string' || t === 'boolean' || t === 'bigint') {
    return value;
  }
  if (t !== 'object') return undefined;
  let out = seen.get(value);
  if (out !== undefined) return out;
  if (Array.isArray(value)) {
    out = new Array(value.length);
    seen.set(value, out);
    for (let i = 0; i < value.length; i++) {
      out[i] = cloneDomainValue(value[i], seen);
    }
    return out;
  }
  if (value instanceof Map) {
    out = new Map();
    seen.set(value, out);
    for (const [k, v] of value) {
      out.set(cloneDomainValue(k, seen), cloneDomainValue(v, seen));
    }
    return out;
  }
  if (value instanceof Set) {
    out = new Set();
    seen.set(value, out);
    for (const item of value) out.add(cloneDomainValue(item, seen));
    return out;
  }
  if (value instanceof Date) {
    out = new Date(value.getTime());
    seen.set(value, out);
    return out;
  }
  if (value instanceof RegExp) {
    out = new RegExp(value.source, value.flags);
    seen.set(value, out);
    return out;
  }
  if (ArrayBuffer.isView(value)) {
    out = value instanceof DataView
      ? new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
      : value.slice();
    seen.set(value, out);
    return out;
  }
  if (value instanceof ArrayBuffer) {
    out = value.slice(0);
    seen.set(value, out);
    return out;
  }
  out = {};
  seen.set(value, out);
  for (const k of Object.keys(value)) {
    let field;
    try {
      field = value[k];
    } catch (_) {
      field = undefined;
    }
    out[k] = cloneDomainValue(field, seen);
  }
  return out;
}

// Canonical transport clone. `scratch` is a caller-retained object holding
// {seen}; the returned graph is structured-clone safe (no functions, no live
// class instances — everything below is plain data).
export function canonicalClone(value, scratch) {
  const ctx = scratch || {};
  const seen = ctx.seen || (ctx.seen = new Map());
  seen.clear();
  return cloneDomainValue(value, seen);
}

// --- mutate-in-place merge --------------------------------------------------
//
// Deep-assign a shipped canonical value into the stored facade. Same-kind
// containers are edited in place so facade identity survives across updates;
// anything else (primitive, kind change, first ship) replaces.
//
// `touched` tracks facade objects already mutated by THIS update application:
// when the same facade node is reached a second time (facade graph has sharing
// the shipped graph does not — or vice versa), merging again would alias the
// second path onto the first. The second visit replaces instead, which can
// break sharing but never corrupts content (content-based signatures make
// sharing topology invisible to the probe).

function isContainer(value) {
  return value !== null && typeof value === 'object';
}

export function deepAssignInPlace(target, source, touched) {
  if (target === source) return target;
  if (!isContainer(target) || !isContainer(source)) return source;
  if (touched) {
    if (touched.has(target)) return source;
    touched.add(target);
  }
  if (Array.isArray(source)) {
    if (!Array.isArray(target)) return source;
    for (let i = 0; i < source.length; i++) {
      target[i] = deepAssignInPlace(target[i], source[i], touched);
    }
    target.length = source.length;
    return target;
  }
  if (source instanceof Map) {
    if (!(target instanceof Map)) return source;
    for (const k of target.keys()) {
      if (!source.has(k)) target.delete(k);
    }
    for (const [k, v] of source) {
      target.set(k, deepAssignInPlace(target.get(k), v, touched));
    }
    return target;
  }
  if (source instanceof Set) {
    if (!(target instanceof Set)) return source;
    target.clear();
    for (const item of source) target.add(item);
    return target;
  }
  if (source instanceof Date) {
    if (!(target instanceof Date)) return source;
    target.setTime(source.getTime());
    return target;
  }
  if (ArrayBuffer.isView(source) || source instanceof ArrayBuffer) {
    if (target.constructor === source.constructor
        && target.length === source.length
        && typeof target.set === 'function') {
      target.set(source);
      return target;
    }
    return source;
  }
  if (Array.isArray(target) || target instanceof Map || target instanceof Set
      || target instanceof Date || ArrayBuffer.isView(target)
      || target instanceof ArrayBuffer) {
    return source; // container kind changed — replacement is the only merge
  }
  const targetKeys = Object.keys(target);
  for (const k of targetKeys) {
    if (!Object.prototype.hasOwnProperty.call(source, k)) delete target[k];
  }
  for (const k of Object.keys(source)) {
    target[k] = deepAssignInPlace(target[k], source[k], touched);
  }
  return target;
}

// True when two shipped/facade values are the same container kind — the case
// where mutate-in-place must hold (identity is not preserved across kind
// changes by design; a kind change is a legitimate swap).
export function sameDomainContainerKind(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b);
  if (a instanceof Map || b instanceof Map) return a instanceof Map && b instanceof Map;
  if (a instanceof Set || b instanceof Set) return a instanceof Set && b instanceof Set;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date;
  const aView = ArrayBuffer.isView(a);
  const bView = ArrayBuffer.isView(b);
  if (aView || bView) return aView && bView && a.constructor === b.constructor;
  return isContainer(a) && isContainer(b)
    && !(a instanceof ArrayBuffer) && !(b instanceof ArrayBuffer);
}

// --- domain path differ -----------------------------------------------------
//
// Worker-side per-pass differ. Maintains a path table: expanded (container)
// nodes enumerate their live children each pass; leaf nodes sign on their
// cadence (hot every pass, cold every DOMAIN_COLD_TICKS passes) and ship a
// canonical clone when the signature changes. The probe is the digest set of every
// leaf path — the runner replays the same walk over its facades and compares.
//
// Node records: { leaf, kids:Map<string,node>|null, digest, bytes, lastSign, segs }.
// paths is keyed by the joined path string; segs is the segment array where
// segs[0] is the mirrored root key (which itself may contain dots, e.g.
// 'world.currentSectorId').

function domainWireChildSegs(segs, aliased, child, name) {
  return aliased || child.segs[0] !== segs[0]
    ? segs.concat(name) : child.segs;
}

export function createDomainDiffer(options = {}) {
  // Stage-6 instrumentation gate (item F3): the probe slot table + digest sets
  // exist only for --probe domains runs. Production ticks pass probe:false and
  // pay zero slot bookkeeping / zero probe alloc; diff updates are identical
  // either way (probe content never fed the shipped updates).
  const probeEnabled = options.probe === true;
  const paths = new Map();
  // Roots are created lazily in DOMAIN_MIRROR_KEYS order. That interleaving is
  // part of the wire cadence contract because each node's creation slot seeds
  // its staggered signing phase.
  const rootNodes = new Array(DOMAIN_MIRROR_KEYS.length);
  const rootAliasSegs = new Array(DOMAIN_MIRROR_KEYS.length);
  const sigScratch = {};
  const cloneScratch = {};
  let nextSlot = 0;
  // Probe slot table: leaf paths interned to stable integer slots so the
  // per-tick probe ships [slot, digest] pairs instead of path strings.
  // probeSlots[slot] = path (null while the slot is free). pendingAdds /
  // pendingRemovals ride the next probe reply; probeGen bumps on table churn.
  const probeSlots = [];
  const freeSlots = [];
  const pendingAdds = [];
  const pendingRemovals = [];
  let probeGen = 0;

  function assignProbeSlot(node, path) {
    if (!probeEnabled) return;
    const slot = freeSlots.length ? freeSlots.pop() : probeSlots.length;
    probeSlots[slot] = path;
    node.probeSlot = slot;
    pendingAdds.push([slot, node.segs]);
    probeGen++;
  }

  function releaseProbeSlot(node) {
    if (!probeEnabled || node.probeSlot == null) return;
    probeSlots[node.probeSlot] = null;
    freeSlots.push(node.probeSlot);
    pendingRemovals.push(node.probeSlot);
    node.probeSlot = null;
    probeGen++;
  }

  function dropNode(node) {
    if (!node) return;
    if (node.kids) {
      for (const child of node.kids.values()) dropNode(child);
      node.kids = null;
    }
    node.alive = false;
    releaseProbeSlot(node);
    if (paths.get(node.path) === node) paths.delete(node.path);
  }

  function createNode(path, segs) {
    const node = {
      path,
      segs,
      alive: true,
      leaf: true,
      kids: null,
      digest: null,
      signature: null,
      bytes: 0,
      lastSign: -1,
      lastEnum: null,
      slot: nextSlot++,
      probeSlot: null,
      probeChanged: false,
      // These values depend only on the path. Keep them on the node so the
      // hot walk does not repeatedly classify the same path.
      ownerSnapshot: segs[0] === 'survivalDraftPublic' || segs[0] === 'survivalResultsPublic',
      isCombatTrace: isCombatTracePath(segs),
      isNpcJobsById: isNpcJobsByIdPath(segs),
      isRunSpawnedThreat: segs[0] === 'run' && segs[1] === 'spawnedThreat',
      cadence: domainCadenceFor(segs[0] === 'run' && segs.length === 2 ? path : segs[0]),
    };
    if (node.isCombatTrace) {
      node.combatTraceWatermark = null;
      node.combatTraceEventRefs = null;
    }
    paths.set(path, node);
    return node;
  }

  // A path can be discovered through an expanded parent before its dotted
  // mirror key reaches the root loop. Resolve that alias only while creating
  // a node; hot visits use the parent/root's retained node reference directly.
  function getOrCreateNode(path, segs) {
    return paths.get(path) || createNode(path, segs);
  }

  // Dotted mirror roots can revisit a node with a different segment boundary
  // after an expanded parent created it. Cache that rare alias view once so
  // metadata keeps the old walk(segs) semantics without classifying on every
  // hot visit; canonical visits use the node's creation-time metadata directly.
  function staticMetadataFor(node, segs) {
    if (segs === node.segs) return node;
    const aliasKey = `${segs[0]}\u0000${segs.length}\u0000${segs[1] ?? ''}`;
    let metadata = node.aliasMetadata && node.aliasMetadata.get(aliasKey);
    if (metadata) return metadata;
    metadata = {
      ownerSnapshot: segs[0] === 'survivalDraftPublic' || segs[0] === 'survivalResultsPublic',
      isCombatTrace: isCombatTracePath(segs),
      isNpcJobsById: isNpcJobsByIdPath(segs),
      isRunSpawnedThreat: segs[0] === 'run' && segs[1] === 'spawnedThreat',
      cadence: domainCadenceFor(segs[0] === 'run' && segs.length === 2 ? node.path : segs[0]),
    };
    if (!node.aliasMetadata) node.aliasMetadata = new Map();
    node.aliasMetadata.set(aliasKey, metadata);
    return metadata;
  }

  function walk(node, v, tick, updates, stats, npcJobsRevision, runContext, state,
    walkSegs = node.segs) {
    const playerId = state && state.playerId;
    const path = node.path;
    const segs = walkSegs;
    const aliased = segs !== node.segs;
    const metadata = staticMetadataFor(node, segs);
    // These owners publish detached immutable snapshots only at settlement. A fresh result
    // or stock/hold receipt must arrive before its event opens a screen, even for a cold leaf.
    const freshOwnerSnapshot = metadata.ownerSnapshot && node.ownerSnapshotSource !== v;
    if (metadata.ownerSnapshot) node.ownerSnapshotSource = v;
    if (isCanonicalObject(v) && segs.length - 1 < expandDepthFor(segs)) {
      if (node.leaf) {
        releaseProbeSlot(node); // leaf -> container
        if (segs[0] === 'run' && segs.length === 1) {
          // A reset/null run must enumerate the new identity on its first reply.
          node.lastEnum = null;
          node.lastSign = -1;
          node.digest = null;
        }
      }
      node.leaf = false;
      const enumDue = freshOwnerSnapshot || node.lastEnum == null
        || tick % DOMAIN_ENUM_TICKS === node.slot % DOMAIN_ENUM_TICKS;
      if (enumDue) {
        const previousKids = node.kids;
        const nextKids = new Map();
        for (const c of Object.keys(v)) {
          let child = previousKids && previousKids.get(c);
          let childSegs;
          if (child) {
            childSegs = domainWireChildSegs(segs, aliased, child, c);
          } else {
            childSegs = segs.concat(c);
            child = getOrCreateNode(`${path}.${c}`, childSegs);
          }
          nextKids.set(c, child);
          walk(child, v[c], tick, updates, stats, npcJobsRevision, runContext, state, childSegs);
        }
        if (previousKids) {
          for (const [c, child] of previousKids) {
            if (!nextKids.has(c)) {
              updates.push({ segs: domainWireChildSegs(segs, aliased, child, c), del: true });
              dropNode(child);
            }
          }
        }
        node.kids = nextKids;
        node.lastEnum = tick;
      } else {
        // Between enumerations walk the known set only: absent children delete
        // eagerly (a present-undefined child will be re-discovered next enum);
        // new children wait for the enumeration pass.
        for (const [c, child] of node.kids) {
          const cv = v[c];
          if (cv === undefined) {
            updates.push({ segs: domainWireChildSegs(segs, aliased, child, c), del: true });
            dropNode(child);
            node.kids.delete(c);
          } else {
            walk(child, cv, tick, updates, stats, npcJobsRevision, runContext, state,
              domainWireChildSegs(segs, aliased, child, c));
          }
        }
      }
      return;
    }
    if (node.kids) {
      // Was expanded, value no longer a canonical object — collapse: every
      // former child path deletes, then this node diffs as a leaf.
      for (const [c, child] of node.kids) {
        updates.push({ segs: domainWireChildSegs(segs, aliased, child, c), del: true });
        dropNode(child);
      }
      node.kids = null;
      if (segs[0] === 'run' && segs.length === 1) {
        // A previously shipped null still has to replace a newer expanded run.
        node.lastSign = -1;
        node.digest = null;
      }
    }
    node.leaf = true;
    const leafRule = domainLeafViewFor(segs);
    const isCombatTrace = metadata.isCombatTrace;
    // Do not retain a replaced live trace/event array until its next cold slot.
    // The replacement still follows the normal cadence, but dropping the old
    // references here keeps reset/load graphs collectible immediately.
    if (isCombatTrace && node.combatTraceWatermark
        && (!v || typeof v !== 'object'
          || node.combatTraceWatermark.trace !== v
          || node.combatTraceWatermark.events !== v.events)) {
      node.combatTraceWatermark = null;
      node.combatTraceEventRefs = null;
    }
    // npcJobsRuntime already increments this small revision on create/delete/reset.  Use that
    // existing lifecycle signal to bypass the large-leaf cadence for structural changes, while
    // leaving ordinary phase/progress changes on their bounded cold cadence.  This avoids a
    // per-tick Object.keys membership scan and keeps the authoritative worker object untouched.
    const npcJobsRevisionChanged = metadata.isNpcJobsById
      && Number.isSafeInteger(npcJobsRevision)
      && node.npcJobsRevision !== npcJobsRevision;
    if (metadata.isNpcJobsById && Number.isSafeInteger(npcJobsRevision)) {
      node.npcJobsRevision = npcJobsRevision;
    }
    const normalizedPlayerId = playerId == null ? null : playerId;
    const combatTracePlayerChanged = isCombatTrace && node.combatTraceWatermark
      && node.combatTraceWatermark.playerId !== normalizedPlayerId;
    const cadence = metadata.cadence;
    const minCadenceTicks = leafRule && Number.isFinite(leafRule.minCadenceTicks)
      ? Math.max(1, Math.floor(leafRule.minCadenceTicks)) : 0;
    // A replaced station object is a reset/rebind boundary. Keep its first
    // mint immediate even when the old path had a recent market-live sign;
    // ordinary in-place market updates still use the explicit lower bound.
    const marketLiveSourceChanged = leafRule && leafRule.project === 'marketLive'
      && node.lastSign >= 0 && node.marketLiveSource !== v;
    // The first admitted threat in an active wave is a bootstrap edge, not a
    // recurring progress sample.  A new game can leave the run root already
    // expanded with spawnedThreat=0; if the worker then reaches active and
    // admits its opening batch before the paced slot for this leaf, the phase
    // update can arrive while the public census remains zero for the whole
    // presentation window.  Ship that one positive edge immediately, while
    // keeping later within-wave count changes on the existing root cadence.
    let runAdmissionBootstrap = false;
    if (metadata.isRunSpawnedThreat) {
      const activeWave = runContext && runContext.phase === 'active'
        && Number.isSafeInteger(runContext.wave) ? runContext.wave : null;
      if (activeWave === null) {
        node.runAdmissionWave = null;
      } else if (Number.isFinite(v) && v > 0 && node.runAdmissionWave !== activeWave) {
        node.runAdmissionWave = activeWave;
        runAdmissionBootstrap = true;
      }
    }
    if (node.lastSign >= 0 && !node.urgentSign && !freshOwnerSnapshot && !npcJobsRevisionChanged
        && !runAdmissionBootstrap && !marketLiveSourceChanged && !combatTracePlayerChanged) {
      const tierTicks = node.bytes > DOMAIN_COLD_BYTES ? DOMAIN_COLD_TICKS
        : node.bytes > DOMAIN_WARM_BYTES ? DOMAIN_WARM_TICKS : 1;
      // minCadenceTicks is a true minimum after a sign, rather than a slot
      // phase. This keeps a projected market below 4 KiB from falling back to
      // the economy's 10-pass cadence (six times the intended signing rate).
      if (minCadenceTicks > 1 && tick - node.lastSign < minCadenceTicks) return;
      const interval = Math.max(tierTicks, cadence, minCadenceTicks);
      if (interval > 1) {
        // Keep the same maximum freshness interval while spreading recurring
        // large canonical/signature walks across replies. Initial values still
        // ship immediately below; only an explicit diagnostic profile aligns.
        if (!activeDomainConfig.staggerCold
            && tierTicks === DOMAIN_COLD_TICKS && interval === DOMAIN_COLD_TICKS) {
          if (tick % DOMAIN_COLD_TICKS !== DOMAIN_COLD_OFFSET) return;
        } else if (tick % interval !== node.slot % interval) {
          return;
        }
      }
    } else if (!freshOwnerSnapshot && leafRule && leafRule.deferFirstSign) {
      // Mass-mint smoothing for leaf-view rules: a first sign waits for the
      // leaf's slot instead of firing immediately, spreading mint bursts
      // (e.g. station markets materializing on one economy:tick) over
      // firstSignTicks — default the root cadence. Kept paths only — non-rule
      // leaves still mint eagerly.
      const interval = Math.max(1, leafRule.firstSignTicks || cadence);
      if (interval > 1 && tick % interval !== node.slot % interval) return;
    }
    const previousCombatTraceWatermark = isCombatTrace
      ? node.combatTraceWatermark : null;
    const currentCombatTraceWatermark = isCombatTrace
      ? combatTraceWatermark(v, previousCombatTraceWatermark, normalizedPlayerId) : null;
    // combat.trace is a large append-only leaf. When its producer watermark,
    // event identities, and player identity are unchanged, the canonical
    // signature and retained presentation payload are already on this node.
    // Advance the freshness clock without re-walking the record; any append,
    // trim, replacement, reset, malformed shape, unknown field, or player
    // switch falls through to the exact path below.
    if (currentCombatTraceWatermark
        && node.lastSign >= 0
        && sameCombatTraceWatermark(previousCombatTraceWatermark, currentCombatTraceWatermark)) {
      node.lastSign = tick;
      return;
    }
    const pv = projectDomainLeaf(leafRule, v, state);
    const sig = canonicalSignature(pv, sigScratch);
    // Production sends the canonical value, never its hash. Compare the retained
    // text directly instead of UTF-8 encoding and SHA-256 hashing every leaf on
    // every due reply. The optional parity probe still gets the same digest,
    // computed only when its source changes. This keeps complete payloads and
    // freshness unchanged, and exact text equality cannot hide a hash collision.
    const changed = node.lastSign < 0 || sig !== node.signature;
    stats.signedBytes += sig.length;
    node.urgentSign = false;
    node.lastSign = tick;
    node.bytes = sig.length;
    if (leafRule && leafRule.project === 'marketLive') node.marketLiveSource = v;
    if (currentCombatTraceWatermark) {
      const eventRefs = node.combatTraceEventRefs || [];
      eventRefs.length = currentCombatTraceWatermark.events.length;
      for (let i = 0; i < eventRefs.length; i++) {
        eventRefs[i] = currentCombatTraceWatermark.events[i];
      }
      currentCombatTraceWatermark.eventRefs = eventRefs;
      node.combatTraceEventRefs = eventRefs;
    } else {
      node.combatTraceEventRefs = null;
    }
    node.combatTraceWatermark = currentCombatTraceWatermark;
    const freshSlot = node.probeSlot == null;
    if (freshSlot) assignProbeSlot(node, path);
    if (changed) {
      node.signature = sig;
      node.digest = probeEnabled ? domainSigDigest(sig) : null;
      node.probeChanged = true;
      updates.push({ segs, v: canonicalClone(pv, cloneScratch), bytes: sig.length });
      stats.shipBytes += sig.length;
      stats.ships++;
      if (sig.length > DOMAIN_SHIP_CAP_BYTES && stats.oversize.length < 32) {
        stats.oversize.push({ path, bytes: sig.length, tick });
      }
    } else if (freshSlot) {
      node.probeChanged = true; // runner needs this digest for the new slot
    }
  }

  return {
    paths,
    // An owner event may require one mutable leaf before its normal cold slot. Keep the
    // previous signature: an unchanged value still ships nothing, and the next diff resumes
    // the usual cadence. A lazy leaf needs no flag before its first (already eager) sign.
    invalidateLeaf(path) {
      const node = paths.get(path);
      if (!node || !node.leaf) return false;
      node.urgentSign = true;
      return true;
    },
    diff(state, tick) {
      const start = nowNs();
      const updates = [];
      const stats = { shipBytes: 0, ships: 0, signedBytes: 0, oversize: [] };
      const npcJobsRevision = resolveDomainValue(state, 'npcJobs.revision');
      const runContext = resolveDomainValue(state, 'run');
      for (let rootIndex = 0; rootIndex < DOMAIN_MIRROR_KEYS.length; rootIndex++) {
        const key = DOMAIN_MIRROR_KEYS[rootIndex];
        let rootNode = rootNodes[rootIndex];
        if (!rootNode || !rootNode.alive) {
          rootNode = getOrCreateNode(key, [key]);
          rootNodes[rootIndex] = rootNode;
        }
        let walkSegs = rootNode.segs;
        if (walkSegs.length !== 1 || walkSegs[0] !== key) {
          walkSegs = rootAliasSegs[rootIndex];
          if (!walkSegs) walkSegs = rootAliasSegs[rootIndex] = [key];
        }
        walk(rootNode, resolveDomainValue(state, key), tick, updates, stats, npcJobsRevision,
          runContext, state, walkSegs);
      }
      const sweep = tick % DOMAIN_PROBE_SWEEP_TICKS === 0;
      let probe = null;
      if (probeEnabled) {
        const s = [];
        const h = [];
        for (const n of paths.values()) {
          if (!n.leaf || n.probeSlot == null) continue;
          if (sweep || n.probeChanged) {
            s.push(n.probeSlot);
            h.push(n.digest);
            n.probeChanged = false;
          }
        }
        probe = {
          gen: probeGen,
          sweep,
          a: pendingAdds.splice(0),
          r: pendingRemovals.splice(0),
          s,
          h,
        };
      }
      stats.diffMs = Number(nowNs() - start) / 1e6;
      return { updates, probe, ...stats };
    },
  };
}

// Apply one shipped path update into the facades map. Multi-segment updates
// resolve under the mirrored root (segs[0]); intermediate nodes are created as
// needed; the leaf slot is deep-assigned in place. {del:true} removes the leaf
// property. Root facade identity is preserved — the root object is mutated,
// never swapped, except by a root-level del (which the differ never emits for
// mirrored keys) or a root-level kind change (a legitimate swap).
export function applyDomainPathUpdate(domains, u, touched) {
  if (!u || !Array.isArray(u.segs) || u.segs.length === 0) return;
  const root = u.segs[0];
  if (u.segs.length === 1) {
    if (u.del) { domains.delete(root); return; }
    domains.set(root, deepAssignInPlace(domains.get(root), u.v, touched));
    return;
  }
  let node = domains.get(root);
  if (u.del) {
    if (!isCanonicalObject(node)) return;
    for (let i = 1; i < u.segs.length - 1; i++) {
      node = node[u.segs[i]];
      if (!isCanonicalObject(node)) return;
    }
    delete node[u.segs[u.segs.length - 1]];
    return;
  }
  if (!isCanonicalObject(node)) {
    node = {};
    domains.set(root, node);
  }
  for (let i = 1; i < u.segs.length - 1; i++) {
    let next = node[u.segs[i]];
    if (!isCanonicalObject(next)) {
      next = {};
      node[u.segs[i]] = next;
    }
    node = next;
  }
  const last = u.segs[u.segs.length - 1];
  node[last] = deepAssignInPlace(node[last], u.v, touched);
}

// Runner-side probe replay: walks the facade map with the same expansion rules
// the differ applies to live state and digests every leaf path. Set-equality of
// paths plus digest equality is gate F2.
export function facadeDomainProbe(domains, scratch) {
  const probe = {};
  for (const key of DOMAIN_MIRROR_KEYS) {
    if (!domains.has(key)) continue;
    walkFacade(domains.get(key), key, [key], probe, scratch);
  }
  return probe;
}

function walkFacade(v, path, segs, probe, scratch) {
  if (isCanonicalObject(v) && segs.length - 1 < expandDepthFor(segs)) {
    for (const k of Object.keys(v)) {
      walkFacade(v[k], `${path}.${k}`, segs.concat(k), probe, scratch);
    }
    return;
  }
  probe[path] = domainSigDigest(canonicalSignature(v, scratch));
}

// Resolve a dotted leaf path to the facade value's probe digest (undefined
// when the facade does not hold the path).
function facadeDigestAt(domains, segs, scratch) {
  let node = domains.get(segs[0]);
  for (let i = 1; i < segs.length; i++) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[segs[i]];
  }
  return domainSigDigest(canonicalSignature(node, scratch));
}

// Runner-side probe consumer: mirrors the worker's slot table from add/remove
// entries and verifies shipped digests against the facades. Between sweeps it
// re-signs only the paths the worker probed (the ones that changed); a sweep
// re-verifies every facade leaf and checks for extra facade paths.
export function createDomainProbeChecker(domains) {
  const slotSegs = [];
  const slotPath = [];
  const scratch = {};
  let gen = 0;
  return {
    consume(probe) {
      const res = { checks: 0, sweep: !!probe.sweep, events: [] };
      if (!probe) return res;
      if (Number.isSafeInteger(probe.gen) && probe.gen > gen) gen = probe.gen;
      for (const slot of probe.r || []) { slotSegs[slot] = null; slotPath[slot] = null; }
      for (const [slot, segs] of probe.a || []) {
        slotSegs[slot] = segs;
        slotPath[slot] = segs.join('.');
      }
      if (probe.sweep) {
        const facadeProbe = facadeDomainProbe(domains, scratch);
        const livePaths = new Set();
        for (const p of slotPath) if (p != null) livePaths.add(p);
        for (const path of Object.keys(facadeProbe)) {
          if (!livePaths.has(path)) {
            res.checks++;
            res.events.push({ kind: 'extra-facade-path', path });
          }
        }
        for (let i = 0; i < probe.s.length; i++) {
          const path = slotPath[probe.s[i]];
          res.checks++;
          if (path == null) {
            res.events.push({ kind: 'unbound-slot', slot: probe.s[i], liveDigest: probe.h[i] });
            continue;
          }
          const model = facadeProbe[path];
          if (model === undefined) {
            res.events.push({ kind: 'missing-facade-path', path, liveDigest: probe.h[i] });
          } else if (model !== probe.h[i]) {
            res.events.push({ kind: 'digest', path, modelDigest: model, liveDigest: probe.h[i] });
          }
        }
        return res;
      }
      for (let i = 0; i < probe.s.length; i++) {
        const segs = slotSegs[probe.s[i]];
        res.checks++;
        if (segs == null) {
          res.events.push({ kind: 'unbound-slot', slot: probe.s[i], liveDigest: probe.h[i] });
          continue;
        }
        const model = facadeDigestAt(domains, segs, scratch);
        if (model === undefined) {
          res.events.push({ kind: 'missing-facade-path', path: segs.join('.'), liveDigest: probe.h[i] });
        } else if (model !== probe.h[i]) {
          res.events.push({ kind: 'digest', path: segs.join('.'), modelDigest: model, liveDigest: probe.h[i] });
        }
      }
      return res;
    },
  };
}

// Facade accessor — the post-flip stand-in for `state.<key>` /
// `state.world.<sub>` reads. Undefined before the first ship (or when the live
// value itself is opaque/undefined).
export function readModelDomain(readModel, key) {
  return readModel && readModel.domains ? readModel.domains.get(key) : undefined;
}
