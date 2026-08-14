// Tabletop render policy for a tilted top-down chase camera.
//
// SpaceFace is a table, not a horizon flight sim. Default glass is ~170x100 WU;
// maximum zoom-out is still only a few hundred units across. Submit, residency,
// and shadows follow glass + a short measured approach runway (fast-ship travel
// in a fraction of a second), never a multi-thousand-unit fake-visible box.
//
// Pure functions only. The renderer and probes share these numbers so tests can
// drive the same policy the live path uses.

import { viewHalfExtents } from './entityViewSyncBand.js';

/** Typical live maxSpeed (engine.topSpeed * SPEED_SCALE) used when state has no ship. */
export const TABLE_REFERENCE_SPEED_WU = 160;

/** How far ahead a submitted root may sit so a fast crosser cannot pop. */
export const TABLE_SUBMIT_APPROACH_SECONDS = 0.75;

/** Mesh decode/build runway. Long enough for the two-build/frame drain. */
export const TABLE_RESIDENCY_PREFETCH_SECONDS = 2.0;

/** Evict a little past prefetch so a ship oscillating on the lip does not thrash. */
export const TABLE_RESIDENCY_EVICT_SECONDS = 2.5;

/** Authored GLB decode may take a couple of seconds; start before the mesh runway. */
export const TABLE_AUTHORED_DECODE_SECONDS = 4.0;

/** Immediate authored radius: already next to the glass. */
export const TABLE_AUTHORED_IMMEDIATE_SECONDS = 1.25;

/** Extra world units around the glass that can still throw a readable key-light shadow. */
export const TABLE_SHADOW_SKIRT_WU = 80;

/** Voices farther than this cannot be heard on the table. Replaces the old 900 WU horizon.
 *  Must cover the max-zoom submit box so an on-glass ship never goes silent. */
export const TABLE_HEARING_FAR_WU = 400;
export const TABLE_HEARING_PAN_WU = 200;

export const TABLE_BAND = Object.freeze({
  GLASS: 'glass',
  RUNWAY: 'runway',
  BEYOND: 'beyond',
});

export function approachDistanceWu(seconds, speed = TABLE_REFERENCE_SPEED_WU) {
  const time = Math.max(0, Number(seconds) || 0);
  const travel = Math.max(0, Number(speed) || 0);
  return time * (travel > 0 ? travel : TABLE_REFERENCE_SPEED_WU);
}

export function tableTravelSpeed(state) {
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const vel = player && player.vel;
  const live = vel
    ? Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0)
    : 0;
  const maxSpeed = Number(player && player.maxSpeed) || 0;
  return Math.max(TABLE_REFERENCE_SPEED_WU, live, maxSpeed);
}

export function glassHalfExtents(zoom, fovDeg, aspect) {
  return viewHalfExtents(zoom, fovDeg, aspect, 1);
}

export function submitRunwayWu(speed = TABLE_REFERENCE_SPEED_WU) {
  return approachDistanceWu(TABLE_SUBMIT_APPROACH_SECONDS, speed);
}

export function residencyPrefetchRadius(speed = TABLE_REFERENCE_SPEED_WU) {
  return approachDistanceWu(TABLE_RESIDENCY_PREFETCH_SECONDS, speed);
}

export function residencyEvictRadius(speed = TABLE_REFERENCE_SPEED_WU) {
  return approachDistanceWu(TABLE_RESIDENCY_EVICT_SECONDS, speed);
}

export function authoredPrefetchRadius(speed = TABLE_REFERENCE_SPEED_WU) {
  return approachDistanceWu(TABLE_AUTHORED_DECODE_SECONDS, speed);
}

export function authoredImmediateRadius(speed = TABLE_REFERENCE_SPEED_WU) {
  return approachDistanceWu(TABLE_AUTHORED_IMMEDIATE_SECONDS, speed);
}

export function authoredLookaheadSeconds() {
  return TABLE_AUTHORED_DECODE_SECONDS;
}

/**
 * Hidden/submit box: the readable glass plus a short approach runway.
 * Replaces the old max(900, zoom*8) fake-visible margin.
 */
export function submitCullHalfExtents(zoom, fovDeg, aspect, speed = TABLE_REFERENCE_SPEED_WU) {
  const glass = glassHalfExtents(zoom, fovDeg, aspect);
  const runway = submitRunwayWu(speed);
  return {
    glass,
    runway,
    halfX: glass.halfX + runway,
    halfZ: glass.halfZ + runway,
  };
}

export function tableHearingFarWu() {
  return TABLE_HEARING_FAR_WU;
}

export function tableShadowCastRadius(zoom, fovDeg, aspect) {
  const glass = glassHalfExtents(zoom, fovDeg, aspect);
  return Math.max(glass.halfX, glass.halfZ) + TABLE_SHADOW_SKIRT_WU;
}

export function classifyTableBand(options = {}) {
  const radius = Math.max(0, Number(options.radius) || 0);
  const absDx = Math.max(0, Math.abs(Number(options.dx) || 0) - radius);
  const absDz = Math.max(0, Math.abs(Number(options.dz) || 0) - radius);
  const glassX = Number.isFinite(Number(options.glassHalfX)) ? Number(options.glassHalfX) : 0;
  const glassZ = Number.isFinite(Number(options.glassHalfZ)) ? Number(options.glassHalfZ) : 0;
  const runway = Math.max(0, Number(options.runwayWu) || 0);
  if (absDx <= glassX && absDz <= glassZ) return TABLE_BAND.GLASS;
  if (absDx <= glassX + runway && absDz <= glassZ + runway) return TABLE_BAND.RUNWAY;
  return TABLE_BAND.BEYOND;
}

/**
 * Persistent landmarks (stations, planets, fx) are map facts until they can
 * enter the table. The Helios opening hub is still a loading-time exception
 * via authored admission, not a whole-sector mesh keep-alive.
 */
export function isCriticalStartingHub(entity) {
  if (!entity || entity.type !== 'station') return false;
  const data = entity.data || {};
  if (entity.id === 'station_helios' || data.stationId === 'station_helios') return true;
  const token = String(data.archetypeGlb || data.placeId || '')
    .replace(/^places\//, '')
    .replace(/\.glb$/, '');
  return token === 'place_station_trade_hub' && data.sectorId === 'sector_helios_prime';
}

export function shouldKeepPersistentLandmarkResident(entity, options = {}) {
  if (!entity) return false;
  if (options.forceRender === true || options.neverCull === true) return true;
  if (options.withinResidency === true) return true;
  if (options.mode === 'loading' && isCriticalStartingHub(entity)) return true;
  return false;
}

export function emptyTableCensus() {
  return {
    glass: 0,
    runway: 0,
    beyond: 0,
    resident: 0,
    submitted: 0,
    landmarks: 0,
  };
}

/**
 * Count live entities into glass / runway / beyond. `submitted` is glass+runway
 * plus forced roots. Used by PQ-061 probes and renderer diagnostics.
 */
export function censusTableBands(entities, options = {}) {
  const counts = emptyTableCensus();
  const list = Array.isArray(entities) ? entities : [];
  const glassHalfX = Number(options.glassHalfX) || 0;
  const glassHalfZ = Number(options.glassHalfZ) || 0;
  const runwayWu = Number(options.runwayWu) || 0;
  const originX = Number(options.originX) || 0;
  const originZ = Number(options.originZ) || 0;
  const playerId = options.playerId;
  for (const entity of list) {
    if (!entity || entity.alive === false) continue;
    const type = entity.type;
    if (type === 'station' || type === 'planet' || type === 'fx') counts.landmarks += 1;
    const forced = entity.id === playerId
      || entity.isPlayer === true
      || !!(entity.flags && (entity.flags.forceRender || entity.flags.neverCull));
    const pos = entity.pos;
    const dx = pos && Number.isFinite(pos.x) ? pos.x - originX : 0;
    const dz = pos && Number.isFinite(pos.z) ? pos.z - originZ : 0;
    const radius = Math.max(0, Number(entity.radius) || 0);
    const band = forced
      ? TABLE_BAND.GLASS
      : classifyTableBand({ dx, dz, glassHalfX, glassHalfZ, runwayWu, radius });
    counts[band] += 1;
    if (band === TABLE_BAND.GLASS || band === TABLE_BAND.RUNWAY) counts.submitted += 1;
    if (options.residentIds && options.residentIds.has(entity.id)) counts.resident += 1;
  }
  return counts;
}
