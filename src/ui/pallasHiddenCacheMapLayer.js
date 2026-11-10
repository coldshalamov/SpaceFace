// Read-only map projection for the Pallas black-wake cache discovery.
// The wreck clue exposes an approximate ring. Only physical cache investigation exposes a fixed
// return/course point; this layer never derives either from authored static POI coordinates.

import { PALLAS_HIDDEN_CACHE, normalizePallasHiddenCacheState } from '../data/pallasHiddenCache.js';

function finitePoint(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.z))) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

export function pallasHiddenCacheMapReadouts(state, sectorId = null) {
  const own = normalizePallasHiddenCacheState(state && state.world && state.world.pallasHiddenCache);
  if (own.phase === 'unfound' || !own.search) return [];
  if (sectorId != null && String(sectorId) !== PALLAS_HIDDEN_CACHE.sectorId) return [];
  const center = finitePoint(own.search.center);
  if (!center) return [];
  const fixedPos = own.phase === 'searching' ? null : finitePoint(own.cache && own.cache.fixedPos);
  const terminal = ['recovered', 'reported', 'criminal_used'].includes(own.phase);
  const statusLabel = own.phase === 'searching' ? 'BLACK-WAKE SEARCH'
    : own.phase === 'choice' ? 'CACHE DECISION'
      : terminal ? 'CACHE RECORDED' : 'CACHE FIXED';
  return [{
    wreckId: own.recordId,
    cacheRecordId: own.recordId,
    name: 'Black-Wake Weapons Cache',
    sectorId: PALLAS_HIDDEN_CACHE.sectorId,
    phase: own.phase,
    coordSpace: 'global_v1',
    center,
    radius: fixedPos ? 0 : Math.max(1, Number(own.search.radius) || PALLAS_HIDDEN_CACHE.searchRadiusWu),
    fixedPos,
    manualSearch: !fixedPos,
    courseDisabled: !fixedPos,
    selectable: true,
    statusLabel,
    objective: fixedPos
      ? 'Set a return course to the physically fixed cache.'
      : 'Fly the black-wake search patch manually and pulse the scanner for the sealed weapons cache.',
    detail: fixedPos
      ? `Physical cache fixed. Disposition: ${String(own.choiceId || 'awaiting choice').replace(/_/g, ' ')}.`
      : 'A manifest fragment from Pirate Wreckage narrowed the cache to an approximate ring. No waypoint has been set.',
    courseTarget: fixedPos ? {
      kind: 'bearing',
      id: own.recordId,
      name: 'Black-Wake Weapons Cache',
      x: fixedPos.x,
      z: fixedPos.z,
    } : null,
  }];
}

export function pallasHiddenCacheMapTarget(readout) {
  if (!readout || readout.cacheRecordId !== PALLAS_HIDDEN_CACHE.recordId
    || readout.selectable !== true || readout.courseDisabled !== true) return null;
  const center = finitePoint(readout.center);
  if (!center) return null;
  return {
    id: readout.cacheRecordId,
    kind: 'bearing',
    name: readout.name,
    sectorId: readout.sectorId,
    x: center.x,
    z: center.z,
    center,
    radius: readout.radius,
    statusLabel: readout.statusLabel,
    detail: readout.detail,
    objective: readout.objective,
    manualSearch: true,
    courseDisabled: true,
  };
}

export default pallasHiddenCacheMapReadouts;
