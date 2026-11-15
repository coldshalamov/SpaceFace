// One local story told at existing addresses. This module reads owner receipts;
// it never creates a mission, moves a ship, stops traffic or rewards a conversation.
import { sectorLocalToGlobalForSector, globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
import { CERES_NINTH_MOUTH as CUT, worldPoint } from '../data/ceresNinthMouth.js';

export const CERES_ARRIVAL_PREFIX = 'ceres_arrival_';
const ID = CUT.id;
const STATIONS = new Set(['station_helios', 'station_ceres']);
export function ceresArrivalContact(stationId, contact) {
  return stationId === 'station_helios' && contact?.canonicalKey === 'kessler'
    || stationId === 'station_ceres' && contact?.id === 'contact_station_ceres_0' && contact.role === 'barkeep';
}
export function ceresArrivalAtDesk(state, stationId, contact) {
  return STATIONS.has(stationId) && ceresArrivalContact(stationId, contact)
    && state?.ui?.docked === true && state.ui.dockedStationId === stationId;
}
export function ceresArrivalRead(state) {
  const r = state?.npcJobs?.ceresNinthMouth;
  if (r?.version !== 1 || r.storyId !== ID) return { phase: 'unvisited' };
  const q = r.rescue;
  const rescued = q?.receiptId === `${ID}:barge-arrival:01` && q.storyId === ID
    && q.bargeIdentity === `${ID}:barge` && q.receiverIdentity === `${ID}:receiver`
    && q.count === 1 && q.committed === true && Number.isSafeInteger(q.tick) && q.tick >= 0
    && Number.isFinite(q.simTime) && q.simTime >= 0
    && ['lamps_seated', 'lamps_unseated', 'unobserved'].includes(q.approach);
  return { phase: rescued ? 'rescued' : r.objects?.barge?.lost ? 'lost' : 'waiting' };
}
export function ceresArrivalChoices(state, stationId, contact) {
  if (!ceresArrivalContact(stationId, contact)) return [];
  const r = ceresArrivalRead(state);
  return [
    { id: `${CERES_ARRIVAL_PREFIX}people`, label: r.phase === 'rescued' ? 'Did Kroll get her crew home?' : 'Who is holding the Ninth Mouth shift?' },
    { id: `${CERES_ARRIVAL_PREFIX}map`, label: stationId === 'station_helios' ? 'Show Ceres on the star chart' : 'Show Kroll’s rescue berth on the map' },
  ];
}
export function ceresArrivalMapOffer(state, stationId, contact) {
  if (!ceresArrivalAtDesk(state, stationId, contact)) return null;
  return state.world?.currentSectorId === CUT.sectorId
    ? { focus: 'system', sectorId: CUT.sectorId, pos: worldPoint(CUT.berth.local),
      label: 'Dessa Kroll · Ninth Mouth receiving apron', source: 'station-bar:ceres-arrival' }
    : { focus: 'galaxy', sectorId: CUT.sectorId, label: 'Ceres Belt', source: 'station-bar:ceres-arrival' };
}
export function ceresArrivalReply(state, stationId, contact, choiceId) {
  if (!String(choiceId).startsWith(CERES_ARRIVAL_PREFIX)) return null;
  if (!ceresArrivalAtDesk(state, stationId, contact)
    || !ceresArrivalChoices(state, stationId, contact).some((c) => c.id === choiceId))
    return { text: 'Wrong desk. The refinery host knows.' };
  const r = ceresArrivalRead(state), helios = stationId === 'station_helios';
  if (choiceId.endsWith('map')) return { text: state.world?.currentSectorId === CUT.sectorId
    ? 'Her apron, marked. Flying stays yours.'
    : 'Ceres, marked. The route is yours.' };
  if (r.phase === 'rescued') return { text: helios
    ? 'Crew came home. Your entry stands.'
    : 'One boat home. Count came out even.' };
  if (r.phase === 'lost') return { text: 'Boat’s gone. No transfer filed.' };
  return { text: helios
    ? 'A boat inside. Kroll holds the count.'
    : 'One boat inside. Kroll’s on the mast.' };
}

// A chart address, not a duplicate POI entity. Preserve the world's RNG stream,
// admission rules, native bodies and the original receiver at this apron.
export function ceresArrivalChartTarget(state, sectorId) {
  if (sectorId !== CUT.sectorId
    || (state?.run?.kind && !['adventure', 'campaign'].includes(state.run.kind))) return null;
  const r = ceresArrivalRead(state), pos = worldPoint(CUT.berth.local);
  const unavailable = state?.npcJobs?.ceresNinthMouth?.objects?.receiver?.lost === true;
  return { id: `${ID}:receiving-apron`, kind: 'poi', poiType: 'beacon', sectorId,
    name: 'Ninth Mouth · Kroll’s berth', x: pos.x, z: pos.z,
    drawPos: globalToSectorLocalForSector(pos, sectorId), entityId: null, named: true,
    statusLine: unavailable ? 'Radio unavailable' : r.phase === 'rescued' ? 'Crew transfer filed'
      : r.phase === 'lost' ? 'No safe arrival filed' : 'Call Kroll · boat and lights',
    chartNote: 'Slow near the mast to hear Kroll.',
    searchText: 'Dessa Kroll Ninth Mouth rescue service cut receiving apron worklights',
  };
}
export function ceresArrivalMapTarget(state, intent) {
  if (intent?.source !== 'station-bar:ceres-arrival' || intent.sectorId !== CUT.sectorId
    || intent.missionId || intent.stationId) return null;
  const target = ceresArrivalChartTarget(state, intent.sectorId);
  if (!target) return null;
  if (state.world?.currentSectorId !== CUT.sectorId)
    return intent.focus === 'galaxy' && !intent.pos
      ? { id: CUT.sectorId, kind: 'sector', sectorId: CUT.sectorId, name: 'Ceres Belt' } : null;
  return intent.focus === 'system' && intent.pos?.x === target.x && intent.pos?.z === target.z
    ? target : null;
}
