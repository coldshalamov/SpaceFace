// Read-only arrival context for the existing destination instrument. This does
// not advance a course, remember a visit or choose a nearest body.
import {
  VX_FREE_DRIVE_SECTOR_ID, VX_FREE_DRIVE_POI,
  VX_FREE_DRIVE_ENTRY_GUIDANCE, VX_FREE_DRIVE_STRUCTURES,
} from '../data/vxFreeDriveRing.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';

const mouthDefinition = VX_FREE_DRIVE_STRUCTURES.find(row => row.id === VX_FREE_DRIVE_ENTRY_GUIDANCE.mouthId);
const finitePos = pos => Number.isFinite(pos?.x) && Number.isFinite(pos?.z);

export function crackerRunEntryGuidance(state, waypoint) {
  if (state?.mode !== 'flight' || state.world?.currentSectorId !== VX_FREE_DRIVE_SECTOR_ID
      || state.ui?.docked || waypoint !== state.nav?.waypoint || waypoint?.kind !== 'local'
      || (waypoint.sectorId && waypoint.sectorId !== VX_FREE_DRIVE_SECTOR_ID)
      || waypoint.targetEntityId != null || waypoint.presentationEntityId != null || waypoint.stable
      || waypoint.missionId != null || !finitePos(waypoint.pos)) return null;
  const player = state.entities?.get(state.playerId);
  if (!player || player.alive === false || player.flags?.docked || !finitePos(player.pos)) return null;
  // Old saves retain a coordinate fix without a POI id. Resolve that exact fix
  // against the canonical named POI; a display label or nearby arbitrary mark
  // is never enough to turn ordinary navigation into venue guidance.
  const poi = state.world.sectors?.[VX_FREE_DRIVE_SECTOR_ID]?.pois
    ?.find(row => row.id === VX_FREE_DRIVE_POI.id && row.runtimeOwner === VX_FREE_DRIVE_POI.runtimeOwner);
  if (!poi || !finitePos(poi.pos)) return null;
  const fix = sectorLocalToGlobalForSector(poi.pos, VX_FREE_DRIVE_SECTOR_ID);
  if (Math.abs(waypoint.pos.x - fix.x) > 1e-6 || Math.abs(waypoint.pos.z - fix.z) > 1e-6
      || Math.hypot(player.pos.x - fix.x, player.pos.z - fix.z) > VX_FREE_DRIVE_ENTRY_GUIDANCE.nearPoiRadius) return null;

  let mouth = null;
  const accept = body => {
    const data = body?.data;
    if (body?.alive === false || body?._noMesh === true || body?.type !== 'fx' || !finitePos(body?.pos)
        || data?.vxFreeDrivePoiId !== poi.id || data.vxFreeDriveId !== mouthDefinition.id
        || data.worldDressing !== true || data.worldOneOff !== true
        || data.placeId !== mouthDefinition.placeId || data.name !== mouthDefinition.name
        || data.homeSectorId !== VX_FREE_DRIVE_SECTOR_ID || data.sectorId !== VX_FREE_DRIVE_SECTOR_ID
        || body.radius !== mouthDefinition.radius) return true;
    if (mouth && mouth !== body) return false;
    mouth = body;
    return true;
  };
  // The worker path folds dressing into current entity facades. The in-realm
  // path retains the same originals in the canonical dressing table.
  for (const body of state.entities?.values() || []) if (!accept(body)) return null;
  const table = state.world.dressing;
  for (const body of table?.rows || []) {
    if (table.byId?.get(body.id) !== body
        || (state.entities?.has(body.id) && state.entities.get(body.id) !== body)) continue;
    if (!accept(body)) return null;
  }
  return mouth ? { ...VX_FREE_DRIVE_ENTRY_GUIDANCE, mouth } : null;
}
