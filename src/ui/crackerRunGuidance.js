// Read-only arrival context for the existing destination instrument. This does
// not advance a course, remember a visit or choose a nearest body.
import {
  VX_FREE_DRIVE_SECTOR_ID, VX_FREE_DRIVE_POI,
  VX_FREE_DRIVE_ENTRY_GUIDANCE, VX_FREE_DRIVE_STRUCTURES,
} from '../data/vxFreeDriveRing.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { WORLD_ONE_OFFS } from '../data/worldOneOffs.js';
import { stableRecordId } from '../world/worldRecords.js';
import { resolveActionLabel } from '../systems/input.js';

const mouthDefinition = VX_FREE_DRIVE_STRUCTURES.find(row => row.id === VX_FREE_DRIVE_ENTRY_GUIDANCE.mouthId);
const finitePos = pos => Number.isFinite(pos?.x) && Number.isFinite(pos?.z);
const loadDefinition = WORLD_ONE_OFFS.find(row => row.id === 'oneoff_cracker_loose_ore_tub');
const loadIdentityKey = `worldOneOff:${loadDefinition.id}`;

// A public working load, not a general scan exception for wrecks. The live Map
// occupant and the world's authored record identity must both agree. A fresh
// one-off has this identity before its first durable capture row is written.
export function isCrackerRunWorkLoad(state, entity) {
  const data = entity?.data;
  if (state?.world?.currentSectorId !== VX_FREE_DRIVE_SECTOR_ID
      || !Number.isFinite(state.meta?.seed) || !entity || entity.alive === false
      || entity.type !== 'wreck' || !finitePos(entity.pos)
      || state.entities?.get(entity.id) !== entity
      || !Number.isSafeInteger(entity.occupantGeneration) || entity.occupantGeneration <= 0
      || data?.worldOneOff !== true || data.oneOffId !== loadDefinition.id
      || data.identityKey !== loadIdentityKey || data.placeId !== loadDefinition.placeId
      || data.homeSectorId !== VX_FREE_DRIVE_SECTOR_ID || data.sectorId !== VX_FREE_DRIVE_SECTOR_ID
      || data.masslineTetherable !== true) return false;
  const recordId = stableRecordId(state.meta.seed, VX_FREE_DRIVE_SECTOR_ID, 'wreck', loadIdentityKey);
  if (data.worldRecordId !== recordId) return false;
  const record = state.world.records?.byId?.[recordId];
  return !record || (record.recordId === recordId && record.identityKey === loadIdentityKey
    && record.kind === 'wreck' && record.alive !== false
    && record.outcome !== 'destroyed' && record.outcome !== 'defeated');
}

export function crackerRunWorkLoadRead(state, entity) {
  if (!isCrackerRunWorkLoad(state, entity)) return null;
  const key = resolveActionLabel(state, 'tether');
  return {
    name: loadDefinition.name,
    classLine: 'Movable yard load',
    note: key
      ? `Aim at the tub and tap ${key} to latch. Thrust gently to tow; tap ${key} again to cut. Or hold the salvage beam on the intact load to recover Iron Ore; this dismantles the tub.`
      : 'Bind the Line control in Settings to latch or cut. Or hold the salvage beam on the intact load to recover Iron Ore; this dismantles the tub.',
  };
}

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
  return mouth ? { ...VX_FREE_DRIVE_ENTRY_GUIDANCE, mouth, entry: waypoint } : null;
}
