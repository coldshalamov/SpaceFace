// Chart/discovery surface for SWITCHBACK. UI-safe: no sim owners imported here.
// The offer itself stays proximity-gated in runtime.js — this only lets a pilot
// who has reached the Ceres Belt see where the coupled freight departs.
import { SWITCHBACK } from './catalog.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';

export function getSwitchbackMapMarkers(state, sectorId) {
  if (sectorId !== SWITCHBACK.sectorId) return [];
  const reached = state?.world?.currentSectorId === SWITCHBACK.sectorId
    || Number(state?.world?.discovery?.[SWITCHBACK.sectorId]?.visitedCount) > 0;
  if (!reached) return [];
  const settled = (state?.convoyRaid?.receipts || []).length > 0;
  const pos = sectorLocalToGlobalForSector(SWITCHBACK.origin, SWITCHBACK.sectorId);
  return [{
    id: 'switchback_freight_departure',
    kind: 'site',
    label: settled ? 'Freight switchback — settled' : 'Freight switchback — coupled hauler',
    pos: { x: pos.x, z: pos.z },
    sectorId,
    discovered: true,
  }];
}
