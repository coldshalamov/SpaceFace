// Far ships and wrecks beyond the combat table. They stay as compact records and
// rematerialize when the player approaches. They are not GameState combat entities
// while shelved.

import { authoredPrefetchRadius, tableTravelSpeed } from '../render/tabletopPolicy.js';
import { SIM_TIER, NEAR_ENTER_PAD_WU, NEAR_EXIT_PAD_WU } from './activityClassification.js';
import { ensureActivityClassified, physicsReachWuFromState } from './activityRuntime.js';
import { advanceWorldRecord, normalizeIntent } from './worldCatchup.js';

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
  if (state && state.world) state.world.farActors = null;
}

function cellKey(x, z) {
  return `${Math.floor(x / FAR_ACTOR_CELL)}:${Math.floor(z / FAR_ACTOR_CELL)}`;
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
  if (!key || !table.grid) return;
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
  }
  table.rows.push(rec);
  table.byId.set(rec.id, rec);
  gridAdd(table, rec);
  table.version++;
  return rec;
}

function removeFarRecord(table, rec) {
  if (!table || !rec) return false;
  const idx = table.rows.indexOf(rec);
  if (idx >= 0) table.rows.splice(idx, 1);
  table.byId.delete(rec.id);
  gridRemove(table, rec);
  table.version++;
  rec.alive = false;
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
    for (let cz = minR; cz <= maxR; cz++) {
      const bucket = table.grid && table.grid.get(`${cx}:${cz}`);
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
  if (live && live.alive !== false) return live;
  const rec = getFarActor(state, id);
  if (!rec || rec.alive === false) return live;
  const spawn = helpers && typeof helpers.spawnEntity === 'function' ? helpers.spawnEntity : null;
  if (!spawn) return null;
  const simTime = Number.isFinite(state.simTime) ? state.simTime : (state.tick | 0) / 60;
  catchUpFarRecord(rec, simTime);
  const reserved = Number.isSafeInteger(rec.id) && rec.id > 0 && !(state.entities && state.entities.has(rec.id))
    ? rec.id
    : 0;
  const data = rec.data && typeof rec.data === 'object' ? { ...rec.data } : {};
  if (rec.hullDefId && data.hullDefId == null) data.hullDefId = rec.hullDefId;
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
  return { shelved, restored };
}

export function farActorTableRadius(state) {
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  return tableRadii(state, player);
}
