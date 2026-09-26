// Far ships and wrecks beyond the combat table. They stay as compact records and
// rematerialize when the player approaches, or when a projectile's flight reaches
// them. They are not GameState combat entities while shelved.

import { clearEntityRuntime } from '../core/entity.js';
import { authoredPrefetchRadius, tableTravelSpeed } from '../render/tabletopPolicy.js';
import { SIM_TIER, NEAR_ENTER_PAD_WU, NEAR_EXIT_PAD_WU } from './activityClassification.js';
import { ensureActivityClassified, physicsReachWuFromState } from './activityRuntime.js';
import { getAsteroidFieldRock } from './asteroidField.js';
import { getDressingRow } from './dressingTable.js';
import { advanceWorldRecord, normalizeIntent } from './worldCatchup.js';
import { resolveFarEncounters } from './farEncounterOutcomes.js';

export const FAR_ACTOR_SCHEMA = 'spaceface.farActors.v1';
export const FAR_ACTOR_CELL = 400;

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

function isExactTier(tier) {
  return tier === SIM_TIER.S0_EXACT || tier === SIM_TIER.S1_NEAR;
}

export function ensureFarActorTable(state) {
  if (!state || typeof state !== 'object') return null;
  const world = state.world || (state.world = {});
  let table = world.farActors;
  if (table && table.schema === FAR_ACTOR_SCHEMA && Array.isArray(table.rows)) {
    if (!(table.byId instanceof Map)) table.byId = new Map(table.rows.map((row) => [row.id, row]));
    if (!(table.grid instanceof Map)) rebuildGrid(table);
    return table;
  }
  table = {
    schema: FAR_ACTOR_SCHEMA,
    version: 0,
    rows: [],
    byId: new Map(),
    grid: new Map(),
  };
  world.farActors = table;
  return table;
}

export function resetFarActors(state) {
  const table = state && state.world && state.world.farActors;
  if (table && Array.isArray(table.rows)) {
    for (let i = 0; i < table.rows.length; i++) clearEntityRuntime(table.rows[i]);
  }
  if (state && state.world) state.world.farActors = null;
}

function cloneTree(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneTree);
  const out = {};
  for (const k in value) out[k] = cloneTree(value[k]);
  return out;
}

// Shelved actors are part of the save. Without the rows, a save taken while an actor is
// virtualized loses the shelve marker: on load the durable record rematerializes a live entity,
// and the next serialize captures a fat record where the pre-save snapshot held a thin one
// (save/reload hash equivalence). `rows` is plain data; byId/grid are rebuilt from it by
// ensureFarActorTable on first touch.
// Shelved rows double as presentation entities: resolveWorldPresentationEntity returns the row
// itself, so the mesh loop stamps live runtime references onto it (`e.mesh = m`,
// `e.view = { root: m }`, `_noMesh`, grid `_cell`). Those are live Object3D graphs — a recursive
// clone walks the whole children/matrix tree and can stack-overflow, and none of it could ever
// round-trip through the save's JSON anyway. Same contract worldRecords.js applies to
// liveEntityId: runtime-only fields are never serialized.
const FAR_ROW_RUNTIME_KEYS = new Set(['mesh', 'view', 'liveEntityId', 'rematerializedTick']);

function isRuntimeRenderResource(value) {
  return !!(value && typeof value === 'object'
    && (value.isObject3D === true || value.isTexture === true
      || value.isBufferGeometry === true || value.isMaterial === true));
}

export function serializeFarActorTable(table) {
  if (!table || table.schema !== FAR_ACTOR_SCHEMA || !Array.isArray(table.rows)) return null;
  const rows = [];
  for (const row of table.rows) {
    if (!row || row.alive === false) continue;
    const copy = {};
    for (const k in row) {
      if (k.charCodeAt(0) === 0x5f) continue; // '_' — _cell, _noMesh, other private runtime stamps
      if (FAR_ROW_RUNTIME_KEYS.has(k)) continue;
      const v = row[k];
      if (isRuntimeRenderResource(v)) continue;
      copy[k] = cloneTree(v);
    }
    rows.push(copy);
  }
  if (!rows.length) return null;
  return { schema: FAR_ACTOR_SCHEMA, version: table.version | 0, rows };
}

export function restoreFarActorTable(state, data) {
  if (!state || typeof state !== 'object') return null;
  const world = state.world || (state.world = {});
  if (!data || data.schema !== FAR_ACTOR_SCHEMA || !Array.isArray(data.rows) || !data.rows.length) {
    resetFarActors(state);
    return null;
  }
  resetFarActors(state);
  world.farActors = {
    schema: FAR_ACTOR_SCHEMA,
    version: Number.isSafeInteger(data.version) ? data.version : 0,
    rows: data.rows.filter((row) => row && row.alive !== false && Number.isSafeInteger(row.id)),
  };
  // Shelved ids stay reserved through allocateEntityId's ledger check — no counter bump needed
  // here (bumping nextEntityId would shift the post-load spawn order and break save hash parity).
  return ensureFarActorTable(state);
}

// True when a durable record's live state is carried by a shelved far-actor row. The record
// must not rematerialize a second live entity on sector entry/restore.
export function farActorHoldsWorldRecord(state, recordId) {
  if (!recordId) return false;
  const table = state && state.world && state.world.farActors;
  const rows = table && table.rows;
  if (!rows) return false;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.alive !== false && row.data && row.data.worldRecordId === recordId) return true;
  }
  return false;
}

// Numeric grid keys (same encoding asteroidField uses). queryFarActors walks every
// overlapped cell per call — the per-tick decode-runway disc is thousands of WU wide,
// so a `${cx}:${cz}` string per cell per tick was pure GC churn. Bijective for
// |cell| < 1,048,576 — far past the authored map edge (~±45k WU).
const CELL_KEY_OFFSET = 1048576;
const CELL_KEY_STRIDE = 2097152; // 2 * CELL_KEY_OFFSET

function cellKey(x, z) {
  return (Math.floor(x / FAR_ACTOR_CELL) + CELL_KEY_OFFSET) * CELL_KEY_STRIDE
    + (Math.floor(z / FAR_ACTOR_CELL) + CELL_KEY_OFFSET);
}

function gridAdd(table, rec) {
  const key = cellKey(finite(rec.pos && rec.pos.x), finite(rec.pos && rec.pos.z));
  rec._cell = key;
  let bucket = table.grid.get(key);
  if (!bucket) {
    bucket = [];
    table.grid.set(key, bucket);
  }
  bucket.push(rec);
}

function gridRemove(table, rec) {
  const key = rec && rec._cell;
  // Numeric keys: cell (-CELL_KEY_OFFSET, -CELL_KEY_OFFSET) encodes to 0 — test
  // for absence, not truthiness.
  if (key == null || !table.grid) return;
  const bucket = table.grid.get(key);
  if (!bucket) return;
  const idx = bucket.indexOf(rec);
  if (idx >= 0) bucket.splice(idx, 1);
  if (bucket.length === 0) table.grid.delete(key);
}

function rebuildGrid(table) {
  table.grid = new Map();
  for (let i = 0; i < table.rows.length; i++) gridAdd(table, table.rows[i]);
}

export function farActorCensus(state) {
  const table = state && state.world && state.world.farActors;
  const far = table && Array.isArray(table.rows) ? table.rows.length : 0;
  let liveShips = 0;
  let liveWrecks = 0;
  for (const e of state && state.entityList || []) {
    if (!e || e.alive === false) continue;
    if (e.type === 'ship' || e.type === 'drone') liveShips++;
    else if (e.type === 'wreck') liveWrecks++;
  }
  return { farActors: far, liveShips, liveWrecks };
}

export function getFarActor(state, id) {
  const table = state && state.world && state.world.farActors;
  if (!table || !table.byId) return null;
  return table.byId.get(id) || null;
}

function survivalHold(state) {
  const run = state && state.run;
  if (!run) return false;
  const kind = run.kind || run.mode;
  return kind === 'survival' || kind === 'swarm' || run.ruleset === 'swarm';
}

export function shouldVirtualizeFarActor(entity, state) {
  if (!entity || entity.alive === false) return false;
  if (entity.isPlayer === true || entity.id === state.playerId) return false;
  if (survivalHold(state)) return false;
  const type = entity.type;
  if (type !== 'ship' && type !== 'drone' && type !== 'wreck') return false;
  const flags = entity.flags || {};
  const data = entity.data || {};
  if (flags.persistent || flags.missionPinned || data.missionPinned || data.missionId) return false;
  if (data.isBoss || data.namedAceId || data.uniqueWreckId || data.uniqueWreck) return false;
  if (data.activityActorSlotId || data.wingman || data.role === 'wingman') return false;
  if (flags.tethered || data.tethered) return false;
  if (state.player && state.player.tether && state.player.tether.targetId === entity.id) return false;
  const activity = entity.activity;
  if (!activity || !activity.simTier) return false;
  if (activity.pinnedExact || isExactTier(activity.simTier)) return false;
  return activity.simTier === SIM_TIER.S2_ABSTRACT
    || activity.simTier === SIM_TIER.S3_DORMANT
    || activity.simTier === SIM_TIER.S4_AGGREGATE;
}

function pickHullDefId(data) {
  if (!data || typeof data !== 'object') return null;
  return data.hullDefId || data.shipDefId || data.defId || data.typeId || null;
}

function leanIdentityData(entity) {
  const d = entity && entity.data && typeof entity.data === 'object' ? entity.data : {};
  const out = {};
  const hullDefId = pickHullDefId(d);
  if (hullDefId) {
    out.hullDefId = hullDefId;
    if (d.shipDefId) out.shipDefId = d.shipDefId;
    if (d.defId) out.defId = d.defId;
  }
  if (d.jobId != null) out.jobId = d.jobId;
  if (d.trafficRole != null) out.trafficRole = d.trafficRole;
  if (d.wreckClass != null) out.wreckClass = d.wreckClass;
  if (d.homeSectorId != null) out.homeSectorId = d.homeSectorId;
  if (d.sectorId != null) out.sectorId = d.sectorId;
  if (d.worldSiteId != null) out.worldSiteId = d.worldSiteId;
  if (d.worldRecordId != null) out.worldRecordId = d.worldRecordId;
  if (d.worldSiteComponentId != null) out.worldSiteComponentId = d.worldSiteComponentId;
  if (d.worldObjectId != null) out.worldObjectId = d.worldObjectId;
  if (d.kind != null) out.kind = d.kind;
  if (d.role != null) out.role = d.role;
  if (d.persistenceOwner != null) out.persistenceOwner = d.persistenceOwner;
  if (d.nextEventAtT != null) out.nextEventAtT = d.nextEventAtT;
  // The durable AI descriptor (archetype/doctrine) must survive shelve→promote: captureEntityRecord
  // reads it, and entitySpecFromRecord only default-fills when the record carries none — dropping it
  // here makes the post-reload record differ from the pre-save one (save/reload hash equivalence).
  const ai = d.ai && typeof d.ai === 'object' ? d.ai
    : (entity && entity.ai && typeof entity.ai === 'object' ? entity.ai : null);
  if (ai) out.ai = ai;
  return out;
}

function snapshotActor(entity, simTime) {
  const data = entity.data || {};
  const activity = entity.activity || {};
  const lastExactT = Number.isFinite(activity.lastExactT) ? activity.lastExactT : simTime;
  const nextEventAtT = Number.isFinite(activity.nextEventAtT)
    ? activity.nextEventAtT
    : (Number.isFinite(data.nextEventAtT) ? data.nextEventAtT : -1);
  const intent = normalizeIntent(data.intent || entity.intent);
  const route = data.route && typeof data.route === 'object' ? data.route : (data.itinerary || null);
  return {
    id: entity.id,
    type: entity.type,
    alive: true,
    farResident: true,
    pos: { x: finite(entity.pos && entity.pos.x), z: finite(entity.pos && entity.pos.z) },
    vel: { x: finite(entity.vel && entity.vel.x), z: finite(entity.vel && entity.vel.z) },
    rot: finite(entity.rot),
    angVel: finite(entity.angVel),
    radius: Math.max(0.5, finite(entity.radius, 8)),
    mass: finite(entity.mass, 20),
    hull: finite(entity.hull, data.hull),
    hullMax: finite(entity.hullMax, data.hullMax),
    shield: finite(entity.shield),
    shieldMax: finite(entity.shieldMax),
    team: entity.team,
    factionId: entity.factionId || data.factionId || null,
    homeSectorId: entity.homeSectorId || data.homeSectorId || data.sectorId || null,
    hullDefId: pickHullDefId(data),
    intent,
    route,
    lastExactT,
    nextEventAtT,
    collides: entity.collides !== false && entity.type !== 'wreck' ? true : !!entity.collides,
    data: leanIdentityData(entity),
    jobId: data.jobId || null,
    trafficRole: data.trafficRole || null,
    virtualizedAt: simTime,
  };
}

export function catchUpFarRecord(rec, simTime) {
  if (!rec || typeof rec !== 'object') return rec;
  const toT = Number.isFinite(simTime) ? simTime : 0;
  const fromT = Number.isFinite(rec.lastExactT) ? rec.lastExactT : toT;
  if (!(toT > fromT)) {
    rec.lastExactT = toT;
    return rec;
  }
  const advanced = advanceWorldRecord(rec, fromT, toT);
  if (!advanced) {
    rec.lastExactT = toT;
    return rec;
  }
  rec.pos = advanced.pos ? { x: finite(advanced.pos.x), z: finite(advanced.pos.z) } : rec.pos;
  rec.vel = advanced.vel ? { x: finite(advanced.vel.x), z: finite(advanced.vel.z) } : rec.vel;
  rec.rot = finite(advanced.rot, rec.rot);
  rec.angVel = finite(advanced.angVel, rec.angVel);
  if (Number.isFinite(advanced.hull)) rec.hull = advanced.hull;
  if (Number.isFinite(advanced.shield)) rec.shield = advanced.shield;
  rec.lastExactT = toT;
  rec.lastObservedT = toT;
  return rec;
}

export function insertFarActor(state, entity, simTime = 0) {
  const table = ensureFarActorTable(state);
  const rec = snapshotActor(entity, simTime);
  if (table.byId.has(rec.id)) {
    const existing = table.byId.get(rec.id);
    const idx = table.rows.indexOf(existing);
    if (idx >= 0) table.rows.splice(idx, 1);
    gridRemove(table, existing);
    clearEntityRuntime(existing);
  }
  table.rows.push(rec);
  table.byId.set(rec.id, rec);
  gridAdd(table, rec);
  table.version++;
  return rec;
}

// A parked or short-loop session (the release soak's dock/trade route, a station camper)
// shelves every actor that wanders past the exit radius and never promotes it back, and
// dropFarActorSector only fires on a sector leave that route never takes. Live traffic is
// bounded by the spawn budget, but its SHELVED rows were not: rows accumulated in the save
// forever — the one unbounded save-growth source left after the convoy-cap fix
// (PQ-033.02 attribution: ~0.2-0.6 KB/cycle, every other grower plateaued).
export const FAR_ROW_BUDGET = 128;

// An unanchored id-carrying row is only SPENT after it has anchored nothing for a full
// recent-memory window. A freshly shelved hull's record can land moments after the shelve
// (the world capture pass walks live entities on its own cadence), so an immediate sweep
// eats legitimate transients. Mirrors RECENT_MEMORY_WINDOW_S without importing the world
// records module into the far table.
export const FAR_ROW_ORPHAN_GRACE_S = 180;

function rowCarriesAnchorIds(rec, data) {
  const jobId = rec.jobId != null ? rec.jobId : (data.jobId != null ? data.jobId : null);
  const recordId = rec.worldRecordId != null ? rec.worldRecordId
    : (data.worldRecordId != null ? data.worldRecordId : null);
  return { jobId, recordId };
}

// A row is durable while it anchors something that still exists: the npcJobs bag relinks
// jobs by worldRecordId against rematerialized hulls, and a live world record carries the
// rematerialization contract — evicting those rows would orphan the job (the exact
// phantom-job growth the convoy-cap fix closed).
//
// Authored/owned bodies are durable BEFORE any bag lookup: a hull whose persistence belongs
// to another owner (world-site components stamp persistenceOwner:'asteroidSites',
// worldSiteRuntime.js entitySpec) carries a component id in data.worldRecordId that
// captureEntityRecord REFUSES by design (worldRecords.js skips every owner but
// 'worldRecords') — it can never be a records-bag key, so "unresolvable" for it does not
// mean "spent". The first PQ-033.02 sweep missed this and deleted authored Ceres site
// wrecks (check:pq020:ceres-topology went red: materializedEntities 1 vs 15).
//
// When an owner bag is absent entirely (focused harnesses without that system), the anchor
// cannot be verified and the conservative 9/19 exemption holds.
function farRowIsDurable(rec, state) {
  if (!rec) return false;
  const data = rec.data && typeof rec.data === 'object' ? rec.data : {};
  if (data.persistenceOwner != null && data.persistenceOwner !== 'worldRecords') return true;
  if (data.worldSiteId != null || data.worldSiteComponentId != null) return true;
  const { jobId, recordId } = rowCarriesAnchorIds(rec, data);
  if (jobId == null && recordId == null) return false;
  const jobs = state && state.npcJobs && state.npcJobs.byId;
  const records = state && state.world && state.world.records && state.world.records.byId;
  if (jobId != null) {
    if (!jobs) return true; // unverifiable: keep the exemption
    if (Object.prototype.hasOwnProperty.call(jobs, jobId)) return true;
  }
  if (recordId != null) {
    if (!records) return true; // unverifiable: keep the exemption
    if (Object.prototype.hasOwnProperty.call(records, recordId)) return true;
  }
  return false; // verifiably anchored to nothing
}

/** True only for an unanchored id-carrying row whose grace window has fully elapsed. */
function farRowIsSpentOrphan(rec, state, now) {
  const data = rec.data && typeof rec.data === 'object' ? rec.data : {};
  if (farRowIsDurable(rec, state)) return false;
  const { jobId, recordId } = rowCarriesAnchorIds(rec, data);
  if (jobId == null && recordId == null) return false; // plain row: the budget walk decides
  const shelfT = Number(rec.virtualizedAt);
  if (!Number.isFinite(shelfT) || !(now - shelfT > FAR_ROW_ORPHAN_GRACE_S)) return false;
  return true;
}

/** Oldest-first, deterministic (rows is insertion-ordered and restore preserves the order). */
export function enforceFarRowBudget(state) {
  const table = state && state.world && state.world.farActors;
  if (!table || !Array.isArray(table.rows) || !table.rows.length) return 0;
  const now = Number.isFinite(state && state.simTime) ? state.simTime : 0;
  let evicted = 0;
  // Spent orphans die on every pass, budget or not: their rematerialization contracts are
  // provably void AND their grace window has closed, and a slow shelving session that never
  // crosses FAR_ROW_BUDGET would otherwise accumulate them under the ceiling. Allocation-free
  // walk, insertion order.
  for (let i = table.rows.length - 1; i >= 0; i--) {
    const rec = table.rows[i];
    if (!farRowIsSpentOrphan(rec, state, now)) continue;
    removeFarRecord(table, rec);
    evicted += 1;
  }
  if (table.rows.length <= FAR_ROW_BUDGET) return evicted;
  let i = 0;
  while (table.rows.length > FAR_ROW_BUDGET && i < table.rows.length) {
    const rec = table.rows[i];
    if (farRowIsDurable(rec, state)) {
      i += 1;
      continue;
    }
    removeFarRecord(table, rec);
    evicted += 1;
  }
  return evicted;
}

function removeFarRecord(table, rec) {
  if (!table || !rec) return false;
  const idx = table.rows.indexOf(rec);
  if (idx >= 0) table.rows.splice(idx, 1);
  table.byId.delete(rec.id);
  gridRemove(table, rec);
  table.version++;
  rec.alive = false;
  clearEntityRuntime(rec);
  return true;
}

export function dropFarActorSector(state, sectorId) {
  const table = state && state.world && state.world.farActors;
  if (!table || !sectorId) return 0;
  let dropped = 0;
  for (let i = table.rows.length - 1; i >= 0; i--) {
    const rec = table.rows[i];
    const home = rec && (rec.homeSectorId || (rec.data && rec.data.homeSectorId));
    if (home !== sectorId) continue;
    removeFarRecord(table, rec);
    dropped++;
  }
  return dropped;
}

export function queryFarActors(state, pos, radius, out = []) {
  out.length = 0;
  const table = state && state.world && state.world.farActors;
  if (!table || !pos || !(radius > 0)) return out;
  const x = finite(pos.x);
  const z = finite(pos.z);
  const r = radius;
  const r2 = r * r;
  const minC = Math.floor((x - r) / FAR_ACTOR_CELL);
  const maxC = Math.floor((x + r) / FAR_ACTOR_CELL);
  const minR = Math.floor((z - r) / FAR_ACTOR_CELL);
  const maxR = Math.floor((z + r) / FAR_ACTOR_CELL);
  for (let cx = minC; cx <= maxC; cx++) {
    const rowBase = (cx + CELL_KEY_OFFSET) * CELL_KEY_STRIDE + CELL_KEY_OFFSET;
    for (let cz = minR; cz <= maxR; cz++) {
      const bucket = table.grid && table.grid.get(rowBase + cz);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const rec = bucket[i];
        if (!rec || rec.alive === false || !rec.pos) continue;
        const dx = rec.pos.x - x;
        const dz = rec.pos.z - z;
        if (dx * dx + dz * dz <= r2) out.push(rec);
      }
    }
  }
  return out;
}

export function promoteFarActor(state, id, helpers) {
  if (!state || id == null) return null;
  const live = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id)
    : null;
  if (live && live.alive !== false) {
    // Core no longer recycles a shelved id, but an explicit-id spawn can still land on one. The
    // live entity wins; evict the stale row now so it cannot remain an alias in the world ledger.
    const table = state.world && state.world.farActors;
    const stale = table && table.byId && table.byId.get(id);
    if (stale) removeFarRecord(table, stale);
    return live;
  }
  const rec = getFarActor(state, id);
  if (!rec || rec.alive === false) return live;
  const spawn = helpers && typeof helpers.spawnEntity === 'function' ? helpers.spawnEntity : null;
  if (!spawn) return null;
  const simTime = Number.isFinite(state.simTime) ? state.simTime : (state.tick | 0) / 60;
  catchUpFarRecord(rec, simTime);
  // The renderer resolves an id to one presentation row, so never raise a body onto an id a
  // dressing prop or field rock holds; take a fresh one instead.
  const reserved = Number.isSafeInteger(rec.id) && rec.id > 0
    && !(state.entities && state.entities.has(rec.id))
    && !getDressingRow(state, rec.id)
    && !getAsteroidFieldRock(state, rec.id)
    ? rec.id
    : 0;
  const data = rec.data && typeof rec.data === 'object' ? { ...rec.data } : {};
  if (rec.hullDefId && data.hullDefId == null) data.hullDefId = rec.hullDefId;
  // leanIdentityData can shelve a hull whose only identity was shipDefId/typeId; promotion must
  // re-canonicalize it onto defId or the ship returns without a whole-ship selector (D29).
  if (rec.type === 'ship' && data.defId == null && data.hullDefId) data.defId = data.hullDefId;
  if (rec.intent) data.intent = rec.intent;
  if (rec.route) data.route = rec.route;
  if (rec.jobId != null) data.jobId = rec.jobId;
  if (rec.trafficRole != null) data.trafficRole = rec.trafficRole;
  if (Number.isFinite(rec.nextEventAtT)) data.nextEventAtT = rec.nextEventAtT;
  if (rec.homeSectorId) data.homeSectorId = rec.homeSectorId;
  const spec = {
    id: reserved || undefined,
    type: rec.type,
    pos: { x: rec.pos.x, z: rec.pos.z },
    vel: { x: rec.vel.x, z: rec.vel.z },
    rot: rec.rot,
    angVel: rec.angVel,
    radius: rec.radius,
    mass: rec.mass,
    hull: rec.hull,
    hullMax: rec.hullMax,
    shield: rec.shield,
    shieldMax: rec.shieldMax,
    team: rec.team,
    factionId: rec.factionId,
    collides: rec.collides,
    data,
  };
  const ent = spawn(spec);
  if (!ent) return null;
  if (rec.homeSectorId) {
    ent.homeSectorId = rec.homeSectorId;
    if (ent.data) ent.data.homeSectorId = rec.homeSectorId;
  }
  if (ent.activity) ent.activity.lastExactT = simTime;
  removeFarRecord(ensureFarActorTable(state), rec);
  return ent;
}

function tableRadii(state, player) {
  const reach = physicsReachWuFromState(state, player);
  const decodeR = authoredPrefetchRadius(tableTravelSpeed(state));
  const enter = Math.max(reach + NEAR_ENTER_PAD_WU, decodeR);
  const exit = Math.max(
    reach + NEAR_EXIT_PAD_WU,
    decodeR + (NEAR_EXIT_PAD_WU - NEAR_ENTER_PAD_WU),
  );
  return { enter, exit };
}

function dist2(a, b) {
  const dx = finite(a && a.x) - finite(b && b.x);
  const dz = finite(a && a.z) - finite(b && b.z);
  return dx * dx + dz * dz;
}

function pushAliveIds(list, out) {
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false || entity.id == null) continue;
    out.push(entity.id);
  }
}

/**
 * Leftover S2/S3/S4 keep their stamp but drop off this-tick abstract/dormant
 * buckets under production incremental classify. Shelving must still see them.
 */
function collectFarActorCandidateIds(state, out) {
  out.length = 0;
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    pushAliveIds(index.shipLike, out);
    pushAliveIds(index.wrecks, out);
    return out;
  }
  const list = (state && state.entityList) || [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false || entity.id == null) continue;
    const type = entity.type;
    if (type === 'ship' || type === 'drone' || type === 'wreck') out.push(entity.id);
  }
  return out;
}

export function tickFarActors(state, helpers, bus) {
  if (!state || state.mode !== 'flight' || survivalHold(state)) return { shelved: 0, restored: 0 };
  ensureActivityClassified(state);
  const player = state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!player || !player.pos) return { shelved: 0, restored: 0 };
  const radii = tableRadii(state, player);
  const exit2 = radii.exit * radii.exit;
  const enter2 = radii.enter * radii.enter;
  const simTime = Number.isFinite(state.simTime) ? state.simTime : (state.tick | 0) / 60;
  let shelved = 0;
  let restored = 0;

  const farIds = tickFarActors._idScratch || (tickFarActors._idScratch = []);
  collectFarActorCandidateIds(state, farIds);
  const entities = state.entities;
  for (let i = farIds.length - 1; i >= 0; i--) {
    const entity = entities && typeof entities.get === 'function'
      ? entities.get(farIds[i])
      : null;
    if (!shouldVirtualizeFarActor(entity, state)) continue;
    if (dist2(entity.pos, player.pos) <= exit2) continue;
    const rec = insertFarActor(state, entity, simTime);
    const remove = helpers && typeof helpers.removeEntity === 'function' ? helpers.removeEntity : null;
    if (remove) remove(entity.id, { immediate: true, reason: 'virtualize' });
    else entity.alive = false;
    if (bus && typeof bus.emit === 'function') {
      bus.emit('world:farActorShelved', {
        id: rec.id,
        type: rec.type,
        jobId: rec.jobId,
        trafficRole: rec.trafficRole,
        homeSectorId: rec.homeSectorId,
      });
    }
    shelved++;
  }

  const hits = queryFarActors(state, player.pos, radii.enter, tickFarActors._scratch || (tickFarActors._scratch = []));
  for (let i = 0; i < hits.length; i++) {
    const rec = hits[i];
    if (!rec || dist2(rec.pos, player.pos) > enter2) continue;
    const recId = rec.id;
    const jobId = rec.jobId;
    const trafficRole = rec.trafficRole;
    const ent = promoteFarActor(state, recId, helpers);
    if (!ent) continue;
    restored++;
    if (bus && typeof bus.emit === 'function') {
      bus.emit('world:farActorRestored', {
        id: ent.id,
        type: ent.type,
        jobId,
        trafficRole,
        entity: ent,
      });
    }
  }
  resolveFarEncounters(state, simTime);
  enforceFarRowBudget(state);
  return { shelved, restored };
}

export function farActorTableRadius(state) {
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  return tableRadii(state, player);
}
