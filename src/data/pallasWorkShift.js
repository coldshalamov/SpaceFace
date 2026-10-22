import { activityPocketsForSector } from './sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';
import { stableRecordId, RECORD_KIND } from '../world/worldRecords.js';

export const PALLAS_SHIFT = Object.freeze({
  schema: 2,
  sectorId: 'sector_pallas_drift',
  stationId: 'station_smuggler',
  id: 'pallas:sker-run:v1',
  hauler: 'pallas_ambush_hauler',
  escort: 'pallas_ambush_escort',
  joinRange: 85,
  guardRange: 180,
  reach: 22,
});

export function pallasShiftSlot(id) {
  return activityPocketsForSector(PALLAS_SHIFT.sectorId)
    .flatMap(pocket => pocket.actorSlots.map(slot => ({ pocket, slot })))
    .find(entry => entry.slot.id === id);
}

export function pallasShiftRecordId(state, id) {
  const entry = pallasShiftSlot(id);
  return entry ? stableRecordId(state.meta?.seed || 1, PALLAS_SHIFT.sectorId,
    RECORD_KIND.CONVOY, entry.slot.worldRecordSlotId) : null;
}

export function pallasShiftMarks() {
  const { pocket, slot } = pallasShiftSlot(PALLAS_SHIFT.hauler);
  return slot.route.marks.map(mark => sectorLocalToGlobalForSector({
    x: pocket.activityAnchor.localPos.x + mark.offset.x,
    z: pocket.activityAnchor.localPos.z + mark.offset.z,
  }, PALLAS_SHIFT.sectorId));
}

export function freshPallasShift(seed) {
  return {
    schema: 2, id: PALLAS_SHIFT.id, seed, phase: 'waiting', leg: 0,
    origin: null, joined: false, arrived: false, lostRole: null, notices: [], dwell: 0,
  };
}

export function normalizePallasShift(raw, seed) {
  const row = freshPallasShift(seed);
  // The v1 clock-only four-handoff story never certified movement or cargo. It grants nothing.
  if (raw?.schema !== 2 || raw.id !== row.id || raw.seed !== seed) return row;
  if (!['waiting', 'joining', 'running', 'arrived', 'lost'].includes(raw.phase)) return row;
  row.phase = raw.phase;
  row.leg = Number.isInteger(raw.leg) ? Math.max(0, Math.min(2, raw.leg)) : 0;
  if (raw.origin && ['x', 'z'].every(key => Number.isFinite(raw.origin[key])
    && Math.abs(raw.origin[key]) < 1e7)) {
    row.origin = { x: raw.origin.x, z: raw.origin.z };
  }
  row.joined = raw.joined === true;
  row.arrived = raw.phase === 'arrived' && raw.arrived === true && row.joined;
  row.lostRole = ['hauler', 'escort'].includes(raw.lostRole) ? raw.lostRole : null;
  if ((row.phase === 'arrived' && !row.arrived)
    || (row.phase === 'lost' && !row.lostRole)
    || (!row.origin && ['joining', 'running'].includes(row.phase))) return freshPallasShift(seed);
  row.notices = [...new Set((Array.isArray(raw.notices) ? raw.notices : [])
    .filter(value => ['joining', 'running', 'arrived', 'lost'].includes(value)))];
  // Continuous physical dwell must be observed again after Continue, not completed by offline time.
  return row;
}

export function pallasShiftActor(state, id) {
  const expected = pallasShiftRecordId(state, id);
  const entry = pallasShiftSlot(id);
  const candidates = (state.entityList || [])
    .filter(entity => entity.alive !== false && entity.data?.worldRecordId === expected);
  if (!entry || candidates.length !== 1) return null;
  const entity = candidates[0], data = entity.data;
  return entity.type === 'ship' && entity.hull > 0 && data.activityActorSlotId === id
    && data.authoredActivityCast === true && data.identityKey === entry.slot.worldRecordSlotId
    && data.homeSectorId === PALLAS_SHIFT.sectorId && state.entities?.get(entity.id) === entity
    ? entity : null;
}

// Read only a current job bound to one original cast hull. Shared with the UI read model;
// a stale numeric ID or unrelated FLEE record must not describe this crew's condition.
export function pallasShiftJob(state, entity) {
  const slot = entity?.data?.activityActorSlotId;
  if (![PALLAS_SHIFT.hauler, PALLAS_SHIFT.escort].includes(slot)
    || pallasShiftActor(state, slot) !== entity) return null;
  const id = entity.data.jobId;
  const entry = id && state.npcJobs?.byId?.[id];
  const kind = slot === PALLAS_SHIFT.hauler ? 'hauler' : 'patrol';
  return entry && entry.entityId === entity.id && entry.worldRecordId === entity.data.worldRecordId
    && entry.sectorId === PALLAS_SHIFT.sectorId && entry.job?.id === id
    && id === `job:${entity.data.worldRecordId}` && entry.job.kind === kind
    && !entry.job.corrupt && entry.job.materialized !== false ? entry : null;
}

export function pallasShiftOwnsMovement(state, entry, entity) {
  const role = entity?.data?.activityActorSlotId === PALLAS_SHIFT.hauler ? 'hauler' : 'escort';
  return pallasShiftJob(state, entity) === entry && entry?.job?.payload?.pallasWorkShift === PALLAS_SHIFT.id
    && entry.job.payload.role === role;
}

export function pallasShiftStatus(state, entity) {
  const row = state?.traffic?.pallasWorkLoop;
  const id = entity?.data?.activityActorSlotId;
  if (!state || ![PALLAS_SHIFT.hauler, PALLAS_SHIFT.escort].includes(id)
    || row?.schema !== 2 || row.id !== PALLAS_SHIFT.id || row.seed !== state.meta?.seed
    || state.world?.currentSectorId !== PALLAS_SHIFT.sectorId
    || pallasShiftActor(state, id) !== entity) return null;
  if (!['arrived', 'lost'].includes(row.phase)
    && [PALLAS_SHIFT.hauler, PALLAS_SHIFT.escort].some(slot =>
      pallasShiftJob(state, pallasShiftActor(state, slot))?.job.phase === 'flee')) {
    return { label: 'SKER RUN UNDER THREAT',
      text: 'Our crew is avoiding danger. The passage is on hold; keep clear of the fleeing hulls.' };
  }
  const label = row.phase === 'arrived' ? 'SMUGGLER DEN ARRIVAL'
    : row.phase === 'lost' ? 'SKER RUN INTERRUPTED'
      : row.phase === 'running' ? (row.holding ? 'HOLD FOR ESCORT' : 'ESCORTED SKER RUN')
        : 'WAITING FOR ESCORT';
  const text = row.phase === 'arrived'
    ? 'We made it to Smuggler Den at Hollow Hub. Back on our regular route.'
    : row.phase === 'lost' ? `Our ${row.lostRole} is gone. We are calling the run off.`
      : row.phase === 'running' && row.holding
        ? 'Holding here until our escort comes back alongside. Keep the route clear for both of us.'
        : row.phase === 'running'
        ? 'We are taking the Sker marks to Smuggler Den at Hollow Hub. Keep the two hulls together; clear threats without firing on the crew.'
        : 'The hauler is holding while its patrol comes alongside. You can fly with us through the Sker run. This is company, not a paying job.';
  return { label, text };
}
