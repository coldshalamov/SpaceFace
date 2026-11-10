// One existing customs-bound service uses the existing count lane. No title or cargo ledger.
import { PRIORITY_COURIER_SERVICE as SERVICE, isPriorityCourierItinerary } from './laneContacts.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';
export const TETHYS_TALLY = Object.freeze({
  id: 'tethys:tally-passage:v1', sectorId: 'sector_tethys_junction',
  oneOffId: 'oneoff_tethys_tally_keg', customsId: 'station_customs',
  reach: 18, clearance: 20,
  marks: Object.freeze([
    Object.freeze({ id: 'scan', x: -1066.5, z: -851 }),
    Object.freeze({ id: 'wait', x: -970, z: -1010 }),
    Object.freeze({ id: 'clear', x: -790, z: -1010 }),
  ]),
});
export function tallyMarks() {
  return TETHYS_TALLY.marks.map(mark => ({ id: `${TETHYS_TALLY.id}:${mark.id}`,
    pos: sectorLocalToGlobalForSector(mark, TETHYS_TALLY.sectorId), label: `Tally ${mark.id}` }));
}

/** Timetable uses demonstrated native cruise, not controller ceilings. The reaction
 * velocity-error controller settles below its 96/40 WU/s commands under native drag. */
export function tallyRouteDuration(origin, destination, sprintSpeed = 96) {
  const points = [origin, ...tallyMarks().map(m => m.pos), destination];
  return points.slice(1).reduce((total, point, i) => total
    + Math.hypot(point.x - points[i].x, point.z - points[i].z) / (i === 0 ? Math.min(sprintSpeed, 64) : 26), 0);
}

// An exact service identity, not a route-shaped object or a recycled numeric entity id.
export function isTallyCourier(entity) {
  const d = entity?.data;
  return entity?.type === 'ship' && d?.trafficRole === 'courier'
    && d.namedLaneContactId === SERVICE.contactId
    && (d.defId || d.hullDefId || d.shipDefId) === 'ship_kestrel'
    && d.homeSectorId === SERVICE.sectorId
    && typeof d.worldRecordId === 'string' && d.worldRecordId.length > 0
    && isPriorityCourierItinerary(d.itinerary);
}
export function tallyPauseId(entity) {
  return isTallyCourier(entity) ? `${TETHYS_TALLY.id}:${entity.data.worldRecordId}:${entity.data.itinerary.legSeq}` : null;
}
