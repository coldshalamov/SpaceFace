// Presentation sources that are not combat-list entities.
// Field rocks, dressing rows, and far-actor rows keep reserved ids and may draw, but they are not
// GameState.entityList members until promote (mine / ram / tether / decode-runway traffic).

import { clearEntityRuntime } from '../core/entity.js';
import { ASTEROID_FIELD_CELL, getAsteroidFieldRock, queryAsteroidField } from './asteroidField.js';
import { getDressingRow } from './dressingTable.js';
import { getFarActor, promoteFarActor, queryFarActors } from './farActorTable.js';
import {
  authoredPrefetchRadius,
  farLedgerScanRadius,
  glassCornerWu,
  residencyPrefetchRadius,
  tableLookAtOrigin,
  tablePrefetchZoomFromState,
  tableTravelSpeed,
  timeToEnterRadiusSeconds,
  TABLE_COLLECT_HORIZON_SECONDS,
  TABLE_DECODE_RUNWAY_SECONDS,
  TABLE_PROMOTE_HORIZON_SECONDS,
} from '../render/tabletopPolicy.js';
import { projectileSkipsVisualFactoryMesh } from '../render/weapons/recipes.js';
import { itineraryPositionInto } from './worldCatchup.js';
import { ENEMY_TYPES } from '../data/enemies.js';

const _farPromoteScratch = [];
const _rockQueryScratch = [];
const _farPromoteIds = [];
const _meshRockScratch = [];
const _meshFarScratch = [];
const _meshSpatialKey = {
  state: null,
  field: null,
  far: null,
  originX: NaN,
  originZ: NaN,
  radius: NaN,
  fieldVersion: -1,
  farVersion: -1,
};

export function isPresentationLedgerRow(entity) {
  return !!(entity && (
    entity.farResident === true
    || entity.fieldResident === true
    || entity.dressingResident === true
  ));
}

// Shelf-time pos for dormant ledger rows freezes at shelf; the sim's own freshness sweep
// catches them up the same way — itinerary when the row carries an intent, ballistic
// otherwise. Returns a shared scratch — callers must consume it before the next call.
const _ledgerPredPos = { x: 0, z: 0 };
export function ledgerAwarePos(entity, state) {
  if (!isPresentationLedgerRow(entity) || !Number.isFinite(entity.lastExactT)) return entity.pos;
  const simTime = Number.isFinite(state && state.simTime)
    ? state.simTime
    : ((state && state.tick) | 0) / 60;
  const drift = Math.max(0, simTime - entity.lastExactT);
  if (!(drift > 0)) return entity.pos;
  if (entity.intent) {
    const along = itineraryPositionInto(entity.intent, simTime, _ledgerPredPos);
    if (along) return along;
  }
  _ledgerPredPos.x = (Number(entity.pos.x) || 0) + (Number(entity.vel && entity.vel.x) || 0) * drift;
  _ledgerPredPos.z = (Number(entity.pos.z) || 0) + (Number(entity.vel && entity.vel.z) || 0) * drift;
  return _ledgerPredPos;
}

export function resolveWorldPresentationEntity(state, id) {
  if (id == null || !state) return null;
  const live = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id)
    : null;
  if (live && live.alive !== false) return live;
  const rock = getAsteroidFieldRock(state, id);
  if (rock && rock.alive !== false && rock.liveEntityId == null) return rock;
  const dressing = getDressingRow(state, id);
  if (dressing && dressing.alive !== false) return dressing;
  const far = getFarActor(state, id);
  if (far && far.alive !== false) return far;
  return live && live.alive !== false ? live : null;
}

function pushAlive(out, row) {
  if (!row || row.alive === false || row._noMesh) return;
  if (row.type === 'projectile' && projectileSkipsVisualFactoryMesh(row)) return;
  out.push(row);
}

export function collectJournalPresentationEntities(state, out = []) {
  out.length = 0;
  const list = state && state.entityList;
  if (list) {
    for (let i = 0; i < list.length; i++) pushAlive(out, list[i]);
  }
  const dressing = state && state.world && state.world.dressing;
  if (dressing && Array.isArray(dressing.rows)) {
    for (let i = 0; i < dressing.rows.length; i++) pushAlive(out, dressing.rows[i]);
  }
  return out;
}

/** Same prefetch horizon `isEntityRenderRelevant` uses for ledger rows. */
function presentationCollectRadius(state) {
  const speed = tableTravelSpeed(state);
  const camera = (state && state.camera) || {};
  const video = (state && state.settings && state.settings.video) || {};
  const prefetchZoom = tablePrefetchZoomFromState(state);
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  return residencyPrefetchRadius(speed, prefetchZoom, fov, aspect, tilt);
}

/** The live table corner the collect pass is feeding — same envelope as the radius. */
function presentationGlassCorner(state) {
  const camera = (state && state.camera) || {};
  const video = (state && state.settings && state.settings.video) || {};
  const prefetchZoom = tablePrefetchZoomFromState(state);
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  return glassCornerWu(prefetchZoom, fov, aspect, tilt);
}

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Ballistic-now position for a ledger row. Shelf-time `pos` is stale for anything
 * that kept moving; far rows also carry `vel`, so project both ends before the
 * collect/admit tests see them.
 */
function ledgerPredictedPos(rec, simTime, out) {
  const drift = Math.max(0, finite(simTime) - finite(rec && rec.lastExactT));
  out.x = finite(rec && rec.pos && rec.pos.x) + finite(rec && rec.vel && rec.vel.x) * drift;
  out.z = finite(rec && rec.pos && rec.pos.z) + finite(rec && rec.vel && rec.vel.z) * drift;
  return out;
}

const _ledgerPredictedScratch = { x: 0, z: 0 };

function meshSpatialKeyMatches(state, walkX, walkZ, walkRadius) {
  const world = state && state.world;
  const field = world && world.asteroidField;
  const far = world && world.farActors;
  const key = _meshSpatialKey;
  return key.state === state
    && key.field === field
    && key.far === far
    && key.originX === walkX
    && key.originZ === walkZ
    && key.radius === walkRadius
    && key.fieldVersion === (field && Number.isFinite(field.version) ? field.version : 0)
    && key.farVersion === (far && Number.isFinite(far.version) ? far.version : 0);
}

function rememberMeshSpatialKey(state, walkX, walkZ, walkRadius) {
  const world = state && state.world;
  const field = world && world.asteroidField;
  const far = world && world.farActors;
  _meshSpatialKey.state = state;
  _meshSpatialKey.field = field;
  _meshSpatialKey.far = far;
  _meshSpatialKey.originX = walkX;
  _meshSpatialKey.originZ = walkZ;
  _meshSpatialKey.radius = walkRadius;
  _meshSpatialKey.fieldVersion = field && Number.isFinite(field.version) ? field.version : 0;
  _meshSpatialKey.farVersion = far && Number.isFinite(far.version) ? far.version : 0;
}

const _meshWalkOrigin = { x: 0, z: 0 };

const _ledgerCollectOrigin = { x: 0, z: 0 };

function appendNearbyLedgerRows(state, out) {
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!player || !player.pos) return;
  // Collect and keep must share one origin. The keep radius (entityWithinPlayerRadius →
  // tableLookAtDelta) measures from the live look-at, which velocity-lead pushes ahead of
  // the hull; a player-centered collect disc then feeds rows the keep radius already
  // dropped and skips rows it still holds — the leading-edge pop the on-glass-disposals
  // counter exists to prove is gone.
  const origin = tableLookAtOrigin(state, player.pos, _ledgerCollectOrigin);
  const radius = presentationCollectRadius(state);
  if (!(radius > 0)) return;
  // The scan disc must hold every row that can still reach the glass inside the
  // longest admit window — hulls ride the decode runway, which exceeds both the
  // collect and promote horizons, so sizing to either would strand a fast inbound
  // ship between "scannable" and "admissible". The per-row time-to-glass test below
  // decides admission, so the disc leaning wide does not wake receding traffic. The
  // far table's freshness sweep keys this same disc so collect and sim stay in step.
  const scanRadius = farLedgerScanRadius(state);
  // The collect disc moves with the look-at every frame, so keying the memo on the
  // exact origin meant it never hit while the player travelled — every poll walked
  // every grid cell inside the multi-thousand-WU decode runway disc. Walk a quantized
  // cell centre padded by the cell's half-diagonal instead: any live origin inside the
  // cell is covered by the same superset, and the per-row tests below still filter
  // against the exact origin on every call. The walk radius is bucketed the same way
  // so small speed changes do not churn the key either.
  const walkX = (Math.floor(origin.x / ASTEROID_FIELD_CELL) + 0.5) * ASTEROID_FIELD_CELL;
  const walkZ = (Math.floor(origin.z / ASTEROID_FIELD_CELL) + 0.5) * ASTEROID_FIELD_CELL;
  const radiusPad = Math.ceil(ASTEROID_FIELD_CELL * Math.SQRT1_2);
  const walkRadius = Math.ceil((scanRadius + radiusPad) / 500) * 500;
  if (!meshSpatialKeyMatches(state, walkX, walkZ, walkRadius)) {
    _meshWalkOrigin.x = walkX;
    _meshWalkOrigin.z = walkZ;
    queryAsteroidField(state, _meshWalkOrigin, walkRadius, _meshRockScratch);
    queryFarActors(state, _meshWalkOrigin, walkRadius, _meshFarScratch);
    rememberMeshSpatialKey(state, walkX, walkZ, walkRadius);
  }
  const pvx = finite(player.vel && player.vel.x);
  const pvz = finite(player.vel && player.vel.z);
  const simTime = Number.isFinite(state.simTime) ? state.simTime : (state.tick | 0) / 60;
  const glassR = presentationGlassCorner(state);
  const radius2 = radius * radius;
  for (let i = 0; i < _meshRockScratch.length; i++) {
    const rec = _meshRockScratch[i];
    if (!rec || rec.alive === false || rec.liveEntityId != null || !rec.pos) continue;
    // Shelf-time pos + "static row" relative velocity was wrong for drifting rocks: the record
    // carries vel/lastExactT (asteroidField) but the test measured from the frozen pos and
    // ignored the rock's own motion, so a rock already closing fast read as stationary and
    // admitted late. Same ballistic extrapolation the far-actor branch uses; vel=0 rocks
    // reduce to the old math exactly.
    const eff = ledgerPredictedPos(rec, simTime, _ledgerPredictedScratch);
    const relX = eff.x - origin.x;
    const relZ = eff.z - origin.z;
    if (relX * relX + relZ * relZ <= radius2) {
      out.push(rec);
      continue;
    }
    const relVx = finite(rec.vel && rec.vel.x) - pvx;
    const relVz = finite(rec.vel && rec.vel.z) - pvz;
    const tEnter = timeToEnterRadiusSeconds(
      relX, relZ, relVx, relVz,
      glassR + finite(rec.radius),
      TABLE_COLLECT_HORIZON_SECONDS,
    );
    if (tEnter <= TABLE_COLLECT_HORIZON_SECONDS) out.push(rec);
  }
  const live = state.entities;
  for (let i = 0; i < _meshFarScratch.length; i++) {
    const rec = _meshFarScratch[i];
    if (!rec || rec.alive === false) continue;
    if (live && typeof live.has === 'function' && live.has(rec.id)) continue;
    const eff = ledgerPredictedPos(rec, simTime, _ledgerPredictedScratch);
    const relX = eff.x - origin.x;
    const relZ = eff.z - origin.z;
    if (relX * relX + relZ * relZ <= radius2) {
      out.push(rec);
      continue;
    }
    const relVx = finite(rec.vel && rec.vel.x) - pvx;
    const relVz = finite(rec.vel && rec.vel.z) - pvz;
    // Ship-like rows ride the decode runway: their authored GLB decode is the long
    // pole, so the collect must surface them early enough for the prefetch kick to
    // finish before contact. Boundary builds still gate on the tighter promote
    // horizon inside isEntityRenderRelevant.
    const tEnter = timeToEnterRadiusSeconds(
      relX, relZ, relVx, relVz,
      glassR + finite(rec.radius, 8),
      TABLE_DECODE_RUNWAY_SECONDS,
    );
    if (tEnter <= TABLE_DECODE_RUNWAY_SECONDS) out.push(rec);
  }
}

export function collectMeshPresentationEntities(state, out = []) {
  collectJournalPresentationEntities(state, out);
  appendNearbyLedgerRows(state, out);
  return out;
}

/**
 * Ask Lane A helpers to rematerialize anything inside the authored decode runway
 * (TABLE_AUTHORED_DECODE_SECONDS × current top speed). Does not invent membership.
 * Field rocks already draw from the ledger — mass-promoting them would refill entityList.
 */
function admitPromotedToRunwayFrame(state, id) {
  const frame = state && state.render && state.render.activityFrame;
  if (!frame || id == null) return;
  let runway = frame.renderRunwayIds;
  if (!runway) {
    runway = [];
    frame.renderRunwayIds = runway;
  }
  if (typeof runway.add === 'function') {
    runway.add(id);
    return;
  }
  if (Array.isArray(runway) && !runway.includes(id)) runway.push(id);
}

export function requestDecodeRunwayPromote(state, helpers) {
  const result = {
    farSeen: 0,
    farPromoted: 0,
    rocksSeen: 0,
    rocksPromoted: 0,
    helpersMissing: !(helpers && typeof helpers.spawnEntity === 'function'),
  };
  if (!state) return result;
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const origin = player && player.pos;
  if (!origin) return result;
  const decodeR = authoredPrefetchRadius(tableTravelSpeed(state));
  const farHits = queryFarActors(state, origin, decodeR, _farPromoteScratch);
  result.farSeen = farHits.length;
  _farPromoteIds.length = 0;
  // Promote stays a sim-tier decision: rows beyond the disc get their decode and
  // mesh from the ledger via the approach-aware collect/relevance path instead —
  // spawning a live body this far out would re-shelve next tick and thrash.
  for (let i = 0; i < farHits.length; i++) {
    const rec = farHits[i];
    if (rec && rec.id != null) _farPromoteIds.push(rec.id);
  }
  if (!result.helpersMissing) {
    for (let i = 0; i < _farPromoteIds.length; i++) {
      const ent = promoteFarActor(state, _farPromoteIds[i], helpers);
      if (!ent) continue;
      result.farPromoted += 1;
      admitPromotedToRunwayFrame(state, ent.id);
    }
  }
  const rockHits = queryAsteroidField(state, origin, decodeR, _rockQueryScratch);
  result.rocksSeen = rockHits.length;
  return result;
}



const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, row]));

/**
 * Lane C — wave-planned hull decode keys. Real next-contact keys from the wave
 * schedule/packages/swarm roster only (no dummy catalog). Silhouette matters:
 * wasp_swarmer decodes ashline_dart, not wasp_production.
 */
export function enemyHullDecodeKey(enemyId, factionId = null, trafficRole = null) {
  if (typeof enemyId !== 'string' || enemyId.length === 0) return null;
  const def = ENEMY_BY_ID.get(enemyId);
  if (!def || typeof def.shipId !== 'string' || !def.shipId) return null;
  const silhouette = typeof def.silhouette === 'string' ? def.silhouette : '';
  const faction = typeof factionId === 'string' && factionId ? factionId : null;
  const role = typeof trafficRole === 'string' && trafficRole ? trafficRole : null;
  // Faction kits swap the resolved whole-ship file (applyFactionWholeShipKit), and wasp kits
  // additionally gate on the traffic role — both axes must separate the decode key or one
  // squad's warm silently covers a different livery.
  const token = `${def.shipId}|${silhouette}`
    + (faction ? `|f:${faction}` : '')
    + (role ? `|r:${role}` : '');
  return Object.freeze({
    defId: def.shipId,
    silhouette,
    enemyId,
    factionId: faction,
    trafficRole: role,
    key: token,
  });
}

/**
 * Same decode key for a squad row that already carries a complete ship spec: the spec's own
 * defId selects the hull (no enemy-id indirection), faction still separates kitted files.
 */
export function shipDefHullDecodeKey(defId, factionId = null) {
  if (typeof defId !== 'string' || !defId) return null;
  const faction = typeof factionId === 'string' && factionId ? factionId : null;
  return Object.freeze({
    defId,
    silhouette: '',
    enemyId: null,
    factionId: faction,
    trafficRole: null,
    key: `${defId}|` + (faction ? `|f:${faction}` : ''),
  });
}

export function collectWaveHullDecodeKeys(plan) {
  const keys = new Map();
  const takeEnemy = (entry) => {
    const key = entry && enemyHullDecodeKey(entry.enemyId, entry.factionId, entry.trafficRole);
    if (!key || keys.has(key.key)) return;
    keys.set(key.key, key);
  };
  if (!plan || plan.ok === false) return [];
  const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
  for (const entry of schedule) takeEnemy(entry);
  const packages = Array.isArray(plan.packages) ? plan.packages : [];
  for (const pkg of packages) takeEnemy(pkg);
  const swarmRoster = plan.swarm && Array.isArray(plan.swarm.roster) ? plan.swarm.roster : [];
  for (const entry of swarmRoster) takeEnemy(entry);
  return [...keys.values()];
}

/** Stub entity whose authoredPreloadPlan matches a live wave hull of this key. */
export function makeWaveHullDecodeStub(hullKey) {
  if (!hullKey || typeof hullKey.defId !== 'string' || !hullKey.defId) return null;
  const silhouette = typeof hullKey.silhouette === 'string' ? hullKey.silhouette : '';
  const data = { defId: hullKey.defId };
  if (silhouette) data.silhouette = silhouette;
  // Live spawns resolve whole ships by lootTableId before silhouette — carry the enemy id so
  // the stub's authoredPreloadPlan follows the same selection.
  if (typeof hullKey.enemyId === 'string' && hullKey.enemyId) data.lootTableId = hullKey.enemyId;
  // Faction kits swap both the hull file and the 'place'-slot kill hulk
  // (applyFactionWholeShipKit / hulkPackagedFileForEntity) — the stub must carry the squad's
  // faction and traffic role or every warm resolves the un-kitted file.
  if (typeof hullKey.factionId === 'string' && hullKey.factionId) data.factionId = hullKey.factionId;
  if (typeof hullKey.trafficRole === 'string' && hullKey.trafficRole) data.trafficRole = hullKey.trafficRole;
  return {
    id: `wave-hull-decode:${hullKey.key || hullKey.defId}`,
    type: 'ship',
    alive: true,
    factionId: typeof hullKey.factionId === 'string' && hullKey.factionId
      ? hullKey.factionId : null,
    pos: { x: 0, z: 0 },
    data,
  };
}

/**
 * Remember planned wave hull keys on state.render so residency consumers can
 * prioritize decode/admission without inventing a parallel prewarm path.
 */
export function noteWaveHullRunwayKeys(state, hullKeys) {
  if (!state) return [];
  const render = state.render || (state.render = {});
  const next = new Set();
  const list = Array.isArray(hullKeys) ? hullKeys : [];
  for (const key of list) {
    if (!key || typeof key.defId !== 'string' || !key.defId) continue;
    const silhouette = typeof key.silhouette === 'string' ? key.silhouette : '';
    next.add(`${key.defId}|${silhouette}`);
  }
  render.waveHullRunwayKeys = next;
  return [...next];
}

export function clearWaveHullRunwayKeys(state) {
  if (!state || !state.render) return;
  state.render.waveHullRunwayKeys = null;
}

export function entityMatchesWaveHullRunway(entity, state) {
  const keys = state && state.render && state.render.waveHullRunwayKeys;
  if (!keys || typeof keys.has !== 'function' || !entity || entity.type !== 'ship') return false;
  const data = entity.data || {};
  const defId = typeof data.defId === 'string' ? data.defId : '';
  if (!defId) return false;
  const silhouette = typeof data.silhouette === 'string' ? data.silhouette : '';
  return keys.has(`${defId}|${silhouette}`);
}

export function resetWorldPresentationTables(state) {
  if (!state || !state.world) return;
  // Rows are presentation entities: dropping the table without clearing their render
  // attachments leaves every mesh tree reachable through any stale row retainer.
  const dressing = state.world.dressing;
  if (dressing && Array.isArray(dressing.rows)) {
    for (let i = 0; i < dressing.rows.length; i++) clearEntityRuntime(dressing.rows[i]);
  }
  const field = state.world.asteroidField;
  if (field && Array.isArray(field.rocks)) {
    for (let i = 0; i < field.rocks.length; i++) clearEntityRuntime(field.rocks[i]);
  }
  const far = state.world.farActors;
  if (far && Array.isArray(far.rows)) {
    for (let i = 0; i < far.rows.length; i++) clearEntityRuntime(far.rows[i]);
  }
  state.world.asteroidField = null;
  state.world.dressing = null;
  clearWaveHullRunwayKeys(state);
}
