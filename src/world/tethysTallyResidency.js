// The count lane is a live job prerequisite. Its one original body must remain
// observable until the courier physically passes; no receipt or saved pin grants clearance.
import { TETHYS_TALLY as C, tallyMarks, isTallyCourier } from '../data/tethysTallyPassage.js';
import { PRIORITY_COURIER_SERVICE as SERVICE, PRIORITY_COURIER_JOB_SCHEMA } from '../data/laneContacts.js';
import { stableRecordId, RECORD_KIND } from './worldRecords.js';
import { indexedWorldRecordEntity } from './livingWorldViews.js';

const COUNT_MARKS = tallyMarks();
const PENDING_PHASES = new Set(['commission', 'depart', 'transit', 'approach', 'work', 'load', 'hold']);

export function tallyKegRecordId(state) {
  return stableRecordId(state.meta?.seed || 1, C.sectorId, RECORD_KIND.WRECK, `worldOneOff:${C.oneOffId}`);
}

function samePoint(a, b) {
  return !!a && !!b && Number.isFinite(a.x) && Number.isFinite(a.z)
    && Number.isFinite(b.x) && Number.isFinite(b.z) && Math.hypot(a.x - b.x, a.z - b.z) <= .01;
}

function currentStationEndpoint(state, point, stationId) {
  const index = state.entityIndex;
  const stations = index?.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index.stations)
    ? index.stations : state.entityList || [];
  for (const station of stations) {
    if (station?.alive === false || station?.type !== 'station' || station.data?.stationId !== stationId
      || state.entities?.get(station.id) !== station) continue;
    return samePoint(point, station.pos);
  }
  return false;
}

export function pendingTallyClearanceBody(state) {
  if (state.mode !== 'flight' || state.world?.currentSectorId !== C.sectorId) return null;
  const recordId = tallyKegRecordId(state);
  const keg = indexedWorldRecordEntity(state, recordId);
  const data = keg?.data;
  if (!keg || keg.alive === false || keg.type !== 'wreck' || state.entities?.get(keg.id) !== keg
    || data?.worldRecordId !== recordId || data.worldOneOff !== true || data.oneOffId !== C.oneOffId
    || data.identityKey !== `worldOneOff:${C.oneOffId}` || data.homeSectorId !== C.sectorId) return null;
  const jobs = state.npcJobs?.byId;
  for (const id in jobs) {
    const entry = jobs[id], job = entry?.job, marker = job?.payload?.priorityCourierService;
    if (entry?.control || job?.corrupt === true || marker?.tallyPassage !== C.id || marker.schema !== PRIORITY_COURIER_JOB_SCHEMA
      || marker.serviceId !== SERVICE.id || !Number.isInteger(job.routeIndex) || job.routeIndex < 0
      || job.routeIndex >= 3 || !PENDING_PHASES.has(job.phase)) continue;
    const courier = state.entities?.get(entry.entityId), itinerary = courier?.data?.itinerary;
    if (!courier || courier.alive === false || !isTallyCourier(courier)
      || courier.data.jobId !== id || entry.worldRecordId !== courier.data.worldRecordId
      || marker.legSeq !== itinerary.legSeq || itinerary.countRouteId !== C.id
      || itinerary.destinationStationId !== C.customsId) continue;
    if (job.route?.length !== 5 || job.route[0]?.id !== `origin:${itinerary.originStationId}`
      || job.route[4]?.id !== `dest:${itinerary.destinationStationId}`
      || COUNT_MARKS.some((m, i) => job.route[i + 1]?.id !== m.id
        || !samePoint(job.route[i + 1]?.pos, m.pos))) continue;
    // The physical owner rejects missing/current-station or endpoint mismatches;
    // an unadvanceable route must not leave a permanent residency demand behind.
    if (!currentStationEndpoint(state, job.route[0].pos, itinerary.originStationId)
      || !currentStationEndpoint(state, job.route[4].pos, itinerary.destinationStationId)) continue;
    return keg;
  }
  return null;
}
