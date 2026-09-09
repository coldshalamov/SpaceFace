// Presentation sources that are not combat-list entities.
// Field rocks, dressing rows, and far-actor rows keep reserved ids and may draw, but they are not
// GameState.entityList members until promote (mine / ram / tether / decode-runway traffic).

import { getAsteroidFieldRock, queryAsteroidField } from './asteroidField.js';
import { getDressingRow } from './dressingTable.js';
import { getFarActor, promoteFarActor, queryFarActors } from './farActorTable.js';
import { authoredPrefetchRadius, residencyPrefetchRadius, tableTravelSpeed } from '../render/tabletopPolicy.js';

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
  originSeq: -1,
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
  if (row && row.alive !== false) out.push(row);
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

function presentationCollectOrigin(state) {
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  return player && player.pos ? player.pos : null;
}

/** Same prefetch horizon `isEntityRenderRelevant` uses for ledger rows. */
function presentationCollectRadius(state) {
  const speed = tableTravelSpeed(state);
  const camera = (state && state.camera) || {};
  const video = (state && state.settings && state.settings.video) || {};
  const requested = Number.isFinite(camera.zoom) ? camera.zoom : NaN;
  const live = Number.isFinite(camera.liveZoom) ? camera.liveZoom : NaN;
  const zoom = Number.isFinite(live) ? live : (Number.isFinite(requested) ? requested : 144);
  const prefetchZoom = Math.max(
    Number.isFinite(live) ? live : 0,
    Number.isFinite(requested) ? requested : 0,
  ) || zoom;
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  return residencyPrefetchRadius(speed, prefetchZoom, fov, aspect, tilt);
}

function meshSpatialKeyMatches(state, origin, radius) {
  const world = state && state.world;
  const field = world && world.asteroidField;
  const far = world && world.farActors;
  const key = _meshSpatialKey;
  return key.state === state
    && key.field === field
    && key.far === far
    && key.originX === origin.x
    && key.originZ === origin.z
    && key.radius === radius
    && key.originSeq === ((world && world.frameOriginSeq) | 0)
    && key.fieldVersion === (field && Number.isFinite(field.version) ? field.version : 0)
    && key.farVersion === (far && Number.isFinite(far.version) ? far.version : 0);
}

function rememberMeshSpatialKey(state, origin, radius) {
  const world = state && state.world;
  const field = world && world.asteroidField;
  const far = world && world.farActors;
  _meshSpatialKey.state = state;
  _meshSpatialKey.field = field;
  _meshSpatialKey.far = far;
  _meshSpatialKey.originX = origin.x;
  _meshSpatialKey.originZ = origin.z;
  _meshSpatialKey.radius = radius;
  _meshSpatialKey.originSeq = (world && world.frameOriginSeq) | 0;
  _meshSpatialKey.fieldVersion = field && Number.isFinite(field.version) ? field.version : 0;
  _meshSpatialKey.farVersion = far && Number.isFinite(far.version) ? far.version : 0;
}

function appendNearbyLedgerRows(state, out) {
  const origin = presentationCollectOrigin(state);
  if (!origin) return;
  const radius = presentationCollectRadius(state);
  if (!(radius > 0)) return;
  if (!meshSpatialKeyMatches(state, origin, radius)) {
    queryAsteroidField(state, origin, radius, _meshRockScratch);
    queryFarActors(state, origin, radius, _meshFarScratch);
    rememberMeshSpatialKey(state, origin, radius);
  }
  for (let i = 0; i < _meshRockScratch.length; i++) {
    const rec = _meshRockScratch[i];
    if (!rec || rec.alive === false || rec.liveEntityId != null) continue;
    out.push(rec);
  }
  const live = state.entities;
  for (let i = 0; i < _meshFarScratch.length; i++) {
    const rec = _meshFarScratch[i];
    if (!rec || rec.alive === false) continue;
    if (live && typeof live.has === 'function' && live.has(rec.id)) continue;
    out.push(rec);
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

export function resetWorldPresentationTables(state) {
  if (!state || !state.world) return;
  state.world.asteroidField = null;
  state.world.dressing = null;
}
