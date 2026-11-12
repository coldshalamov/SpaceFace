// Read-only map projection for the Vesta ore-cache discovery.
// The relay clue exposes an approximate ring. Only physical cache investigation exposes a fixed
// return/course point; this layer never infers either from authored static POI coordinates.

import { VESTA_ORE_CACHE, normalizeVestaOreCacheState } from '../data/vestaOreCache.js';

function finitePoint(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.z))) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

export function vestaOreCacheMapReadouts(state, sectorId = null) {
  const own = normalizeVestaOreCacheState(state && state.world && state.world.vestaOreCache);
  if (own.phase === 'unfound' || !own.search) return [];
  if (sectorId != null && String(sectorId) !== VESTA_ORE_CACHE.sectorId) return [];
  const center = finitePoint(own.search.center);
  if (!center) return [];
  const fixedPos = own.phase === 'searching' ? null : finitePoint(own.cache && own.cache.fixedPos);
  const terminal = ['preserved', 'reported', 'taken'].includes(own.phase);
  const statusLabel = own.phase === 'searching' ? 'RESIDUE SEARCH'
    : own.phase === 'choice' ? 'CACHE DECISION'
      : terminal ? 'CACHE RECORDED' : 'CACHE FIXED';
  return [{
    wreckId: own.recordId,
    cacheRecordId: own.recordId,
    name: 'Shift-End Ore Cache',
    sectorId: VESTA_ORE_CACHE.sectorId,
    phase: own.phase,
    coordSpace: 'global_v1',
    center,
    radius: fixedPos ? 0 : Math.max(1, Number(own.search.radius) || VESTA_ORE_CACHE.searchRadiusWu),
    fixedPos,
    manualSearch: !fixedPos,
    courseDisabled: !fixedPos,
    selectable: true,
    statusLabel,
    objective: fixedPos
      ? 'Set a return course to the physically fixed cache.'
      : 'Fly the residue patch manually and pulse the scanner for the sealed ore mass.',
    detail: fixedPos
      ? `Physical cache fixed. Disposition: ${String(own.choiceId || 'awaiting choice').replace(/_/g, ' ')}.`
      : 'Ore residue recovered from the Slag-Choir Relay. The ring is approximate and sets no waypoint.',
    courseTarget: fixedPos ? {
      kind: 'bearing',
      id: own.recordId,
      name: 'Shift-End Ore Cache',
      x: fixedPos.x,
      z: fixedPos.z,
    } : null,
  }];
}

export function vestaOreCacheMapTarget(readout) {
  if (!readout || readout.cacheRecordId !== VESTA_ORE_CACHE.recordId
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

export default vestaOreCacheMapReadouts;
