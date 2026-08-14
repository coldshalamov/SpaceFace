// Presentation sync banding.
//
// The live cull box is viewport + a ~900 WU travel runway so trails, shadows, and fast crossers
// do not pop. Closures (runtime/damage/drive/world-site) cannot change a readable pixel on a
// ship that is still hundreds of world units off-screen. Inner band keeps today's full path;
// middle band poses every frame and refreshes closures on a deterministic cadence.

export const ENTITY_VIEW_BAND = Object.freeze({
  INNER: 'inner',
  MIDDLE: 'middle',
});

// 1.0 is the live on-screen box. Larger values widen the expensive inner band
// into the off-screen runway and re-submit ships the player cannot see.
export const INNER_VIEW_BAND_SCALE = 1;
export const MIDDLE_SYNC_PERIOD_TICKS = 4;

export function viewHalfExtents(zoom, fovDeg, aspect, scale = 1) {
  const zoomValue = Number.isFinite(zoom) ? zoom : 88;
  const fov = Number.isFinite(fovDeg) ? fovDeg : 50;
  const aspectValue = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const halfV = Math.tan((fov * Math.PI / 180) * 0.5) * zoomValue * 0.72 * scale;
  return { halfX: halfV * aspectValue, halfZ: halfV };
}

export function classifyEntityViewBand(options = {}) {
  if (options.isPlayer === true || options.forceInner === true) return ENTITY_VIEW_BAND.INNER;
  const absDx = Math.abs(Number(options.dx) || 0);
  const absDz = Math.abs(Number(options.dz) || 0);
  const view = viewHalfExtents(options.zoom, options.fov, options.aspect, INNER_VIEW_BAND_SCALE);
  const halfX = Number.isFinite(Number(options.innerHalfX)) ? Number(options.innerHalfX) : view.halfX;
  const halfZ = Number.isFinite(Number(options.innerHalfZ)) ? Number(options.innerHalfZ) : view.halfZ;
  if (absDx <= halfX && absDz <= halfZ) return ENTITY_VIEW_BAND.INNER;
  return ENTITY_VIEW_BAND.MIDDLE;
}

export function shouldFullSyncMiddleBand(tick, slot) {
  const period = MIDDLE_SYNC_PERIOD_TICKS;
  const t = Number.isInteger(tick) ? tick : Math.floor(Number(tick) || 0);
  const s = Number.isInteger(slot) ? slot : Math.floor(Number(slot) || 0);
  return ((t + s) % period + period) % period === 0;
}

export function shouldRunEntityClosures(band, tick, slot, options = {}) {
  if (options.forceInner === true || band === ENTITY_VIEW_BAND.INNER) return true;
  return shouldFullSyncMiddleBand(tick, slot);
}
