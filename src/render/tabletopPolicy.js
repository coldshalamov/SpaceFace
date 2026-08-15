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

export const TABLE_HEARING_PAN_WU = 200;

/** Hearing follows the max-zoom table box, not a 900 WU horizon. */
export function tableHearingFarWu(
  zoom = 330,
  fovDeg = 50,
  aspect = 16 / 9,
  tiltDeg = 60,
  speed = TABLE_REFERENCE_SPEED_WU,
) {
  const extents = submitCullHalfExtents(zoom, fovDeg, aspect, speed, tiltDeg);
  return Math.hypot(extents.halfX, extents.halfZ);
}

export const TABLE_HEARING_FAR_WU = tableHearingFarWu();

/**
 * Passive AI/traffic may sleep beyond the largest table a player can open.
 * Hostiles and the player stay awake regardless of this number.
 */
export function tableAiAuthorityWu(
  zoom = 330,
  fovDeg = 50,
  aspect = 16 / 9,
  tiltDeg = 60,
  speed = TABLE_REFERENCE_SPEED_WU,
) {
  return tableHearingFarWu(zoom, fovDeg, aspect, tiltDeg, speed);
}

export const TABLE_AI_AUTHORITY_WU = tableAiAuthorityWu();

/**
 * Worst-case deterministic aspect for sim cadence. The live camera uses the
 * raw window ratio with no clamp, so 32:9 under-covers a triple-wide desktop.
 * 48:9 is three 16:9 panes. Still a table at default zoom. Not a live viewport.
 */
export const TABLE_SIM_ASPECT = 48 / 9;

/** Live table envelope. Prefetch uses the wider of live and requested zoom. */
export function tableCameraEnvelope(state) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const live = Number.isFinite(camera.liveZoom) ? camera.liveZoom : NaN;
  const requested = Number.isFinite(camera.zoom) ? camera.zoom : NaN;
  const zoom = Math.max(
    Number.isFinite(live) ? live : 0,
    Number.isFinite(requested) ? requested : 0,
  ) || 144;
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  return { zoom, fov, aspect, tilt };
}

export function tableAiAuthorityWuFromState(state) {
  const cam = tableCameraEnvelope(state);
  return tableAiAuthorityWu(cam.zoom, cam.fov, cam.aspect, cam.tilt);
}

/**
 * Sim-side table envelope. Traffic and bark may not read liveZoom / renderer
 * fov / viewport aspect — those are presentation and would make seeded runs
 * depend on refresh rate and window size.
 */
export function tableSimAuthorityWuFromState(state) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const zoom = Number.isFinite(camera.zoom) ? camera.zoom : 144;
  const fov = Number.isFinite(video.fov) ? video.fov : 50;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  return tableAiAuthorityWu(zoom, fov, TABLE_SIM_ASPECT, tilt);
}

/**
 * Cosmetic VFX follow the same live table as hearing/AI. Off-table trails and
 * station-side lights stay map facts; on-glass VFX is unchanged.
 */
export function tableVfxDrawWuFromState(state) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const live = Number.isFinite(camera.liveZoom) ? camera.liveZoom : NaN;
  const requested = Number.isFinite(camera.zoom) ? camera.zoom : NaN;
  const zoom = Number.isFinite(live) ? live : (Number.isFinite(requested) ? requested : 144);
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  return tableHearingFarWu(zoom, fov, aspect, tilt);
}

export function shouldDrawTableVfx(dx, dz, drawWu) {
  const limit = Number.isFinite(drawWu) && drawWu > 0 ? drawWu : TABLE_HEARING_FAR_WU;
  const x = Number(dx) || 0;
  const z = Number(dz) || 0;
  return (x * x + z * z) <= limit * limit;
}

/** Fitted-tractor inner band. Player-centered; never mixed into the glass radius. */
export const TABLE_LOOT_MAGNET_CAP_WU = 580;

/**
 * Loot-magnet trails need two origins. The tractor cap is the player; the
 * glass cull is the live look-at. Mixing them into one min() drops on-glass
 * trails when combat/tether shoves the camera.
 */
export function shouldDrawLootMagnetTrail(playerDx, playerDz, focusDx, focusDz, tableWu) {
  if (!shouldDrawTableVfx(playerDx, playerDz, TABLE_LOOT_MAGNET_CAP_WU)) return false;
  return shouldDrawTableVfx(focusDx, focusDz, tableWu);
}

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

/**
 * Ground-plane half extents of the tilted chase camera. The old 0.72 sync-band
 * helper under-counted the far corners of a 60° look-down frustum.
 */
export function glassHalfExtents(zoom, fovDeg, aspect, tiltDeg = 60) {
  const distance = Number.isFinite(zoom) ? zoom : 88;
  const fov = Number.isFinite(fovDeg) ? fovDeg : 50;
  const aspectValue = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const tilt = (Number.isFinite(tiltDeg) ? tiltDeg : 60) * Math.PI / 180;
  const camY = distance * Math.sin(tilt);
  const camZ = -distance * Math.cos(tilt);
  const flen = Math.hypot(camY, -camZ) || 1;
  const fwx = 0;
  const fwy = -camY / flen;
  const fwz = -camZ / flen;
  let rx = fwz;
  let ry = 0;
  let rz = -fwx;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  rx /= rlen;
  ry /= rlen;
  rz /= rlen;
  const ux = ry * fwz - rz * fwy;
  const uy = rz * fwx - rx * fwz;
  const uz = rx * fwy - ry * fwx;
  const tanHalf = Math.tan((fov * Math.PI / 180) * 0.5);
  let maxX = 0;
  let maxZ = 0;
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [ndcX, ndcY] of corners) {
    const dx = fwx + rx * ndcX * tanHalf * aspectValue + ux * ndcY * tanHalf;
    const dy = fwy + ry * ndcX * tanHalf * aspectValue + uy * ndcY * tanHalf;
    const dz = fwz + rz * ndcX * tanHalf * aspectValue + uz * ndcY * tanHalf;
    if (!(dy < -1e-6)) continue;
    const hit = -camY / dy;
    if (!(hit > 0)) continue;
    maxX = Math.max(maxX, Math.abs(dx * hit));
    maxZ = Math.max(maxZ, Math.abs(camZ + dz * hit));
  }
  if (!(maxX > 0 && maxZ > 0)) return viewHalfExtents(distance, fov, aspectValue, 1);
  return { halfX: maxX, halfZ: maxZ };
}

export function submitRunwayWu(speed = TABLE_REFERENCE_SPEED_WU) {
  return approachDistanceWu(TABLE_SUBMIT_APPROACH_SECONDS, speed);
}

export function glassCornerWu(zoom, fovDeg, aspect, tiltDeg = 60) {
  const glass = glassHalfExtents(zoom, fovDeg, aspect, tiltDeg);
  return Math.hypot(glass.halfX, glass.halfZ);
}

export function residencyPrefetchRadius(
  speed = TABLE_REFERENCE_SPEED_WU,
  zoom = 144,
  fovDeg = 50,
  aspect = 16 / 9,
  tiltDeg = 60,
) {
  return glassCornerWu(zoom, fovDeg, aspect, tiltDeg)
    + approachDistanceWu(TABLE_RESIDENCY_PREFETCH_SECONDS, speed);
}

export function residencyEvictRadius(
  speed = TABLE_REFERENCE_SPEED_WU,
  zoom = 144,
  fovDeg = 50,
  aspect = 16 / 9,
  tiltDeg = 60,
) {
  return glassCornerWu(zoom, fovDeg, aspect, tiltDeg)
    + approachDistanceWu(TABLE_RESIDENCY_EVICT_SECONDS, speed);
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
export function submitCullHalfExtents(
  zoom,
  fovDeg,
  aspect,
  speed = TABLE_REFERENCE_SPEED_WU,
  tiltDeg = 60,
) {
  const glass = glassHalfExtents(zoom, fovDeg, aspect, tiltDeg);
  const runway = submitRunwayWu(speed);
  return {
    glass,
    runway,
    halfX: glass.halfX + runway,
    halfZ: glass.halfZ + runway,
  };
}

export function tableShadowCastRadius(zoom, fovDeg, aspect, tiltDeg = 60) {
  const glass = glassHalfExtents(zoom, fovDeg, aspect, tiltDeg);
  return Math.max(glass.halfX, glass.halfZ) + TABLE_SHADOW_SKIRT_WU;
}

/**
 * Caster band must fit inside the key-light ortho. A larger number would flip
 * far hulls to castShadow even though they sit outside the ±300 light box.
 */
export function tableShadowCasterRadius(
  zoom,
  fovDeg,
  aspect,
  tiltDeg = 60,
  cap = 300,
) {
  const radius = tableShadowCastRadius(zoom, fovDeg, aspect, tiltDeg);
  const limit = Number.isFinite(Number(cap)) && Number(cap) > 0 ? Number(cap) : 300;
  return Math.min(limit, Math.max(80, radius));
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
