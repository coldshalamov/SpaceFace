// Read-only chart approach for the cradle while it is parked in its authored yard.
// The contact remains the actual cradle; the flight destination is the open Apron.
import { LANTERN_WARD_SECTOR, LANTERN_WARD_BODY_CONTRACTS, lanternWardPoint } from './lanternWardLayout.js';
import { isLanternWardHardwareEntity, lanternWardCanonicalAnchor } from './lanternWardHardware.js';

export function lanternWardCradleApproach(state, entity) {
  const data = entity?.data;
  if (state?.world?.currentSectorId !== LANTERN_WARD_SECTOR
    || !isLanternWardHardwareEntity(entity) || data.lanternWardRole !== 'cradle'
    || state.entities?.get(entity.id) !== entity || entity.alive === false || !(entity.hull > 0)
    || data.lanternWardInvalid === true || data.homeSectorId !== LANTERN_WARD_SECTOR
    || data.sectorId !== LANTERN_WARD_SECTOR || data.lanternWardCustody?.holder !== 'ward'
    || !Number.isFinite(entity.pos?.x) || !Number.isFinite(entity.pos?.z)
    || !Number.isFinite(entity.vel?.x) || !Number.isFinite(entity.vel?.z)
    || Math.hypot(entity.vel.x, entity.vel.z) > 1) return null;
  const anchor = lanternWardCanonicalAnchor();
  if (!anchor) return null;
  const yard = lanternWardPoint(anchor, 'cradle');
  // Once carried out of the original pocket, the equipment must be tracked where it went.
  const yardRadius = LANTERN_WARD_BODY_CONTRACTS.cradle.radius * 2;
  if (Math.hypot(entity.pos.x - yard.x, entity.pos.z - yard.z) > yardRadius) return null;
  return { pos: lanternWardPoint(anchor, 'approach'), arrivalRadius: 40,
    label: 'Lantern Ward · Apron approach' };
}
