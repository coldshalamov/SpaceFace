// One local story told at existing addresses. This module reads owner receipts;
// it never creates a mission, moves a ship, stops traffic or rewards a conversation.
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
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
  if (r?.version !== 1 || r.storyId !== ID) return { phase: 'unvisited', lights: null, met: false, plan: null };
  const q = r.rescue;
  const rescued = q?.receiptId === `${ID}:barge-arrival:01` && q.storyId === ID
    && q.bargeIdentity === `${ID}:barge` && q.receiverIdentity === `${ID}:receiver`
    && q.count === 1 && q.committed === true && Number.isSafeInteger(q.tick) && q.tick >= 0
    && Number.isFinite(q.simTime) && q.simTime >= 0
    && ['lamps_seated', 'lamps_unseated', 'unobserved'].includes(q.approach);
  return { phase: rescued ? 'rescued' : r.objects?.barge?.lost ? 'lost' : 'waiting',
    met: r.conversation?.met === true,
    plan: ['barge', 'lights'].includes(r.conversation?.plan) ? r.conversation.plan : null };
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
    || !ceresArrivalChoices(state, stationId, contact).some(c => c.id === choiceId))
    return { text: 'Ask at the Helios desk or the Ceres Refinery bar. I need the local berth record.' };
  const r = ceresArrivalRead(state), helios = stationId === 'station_helios';
  if (choiceId.endsWith('map')) return { text: state.world?.currentSectorId === CUT.sectorId
    ? 'Kroll’s receiving apron is selected on the system chart. Fly there and slow down to hear the berth radio. The chart opens only; the course is yours to set.'
    : 'Ceres is selected on the star chart. Choose Plot Course if you want a route; opening the chart has not plotted or engaged one. Once you arrive, choose Ninth Mouth · Kroll’s berth on the Ceres system chart, or ask the refinery host.' };
  if (r.phase === 'rescued') return { text: helios
    ? 'Kroll filed the crew transfer. One barge brought home, not another load sold. That entry is yours. The lamps are a separate job; ask her at the mast if you want to finish the line.'
    : 'Kroll’s crew-transfer entry came through. One barge home. Here we argue about ore weight all shift, but nobody asks what a crew weighs. Go back to her mast if you want to check the remaining lights.' };
  if (r.phase === 'lost') return { text: 'The original barge was lost before a safe arrival was recorded. Kroll has no crew-transfer entry to file. The service cut is still there; the surviving lights can still be put to work. I will not call that a rescue.' };
  return { text: helios
    ? 'Take the Ceres gate, then follow the refinery’s flare rack and weigh pin. Ore work pays there; Second Measure still has its own yard slip. Dessa Kroll is on a receiving mast off that traffic, holding one Ironback’s shift open. The crew is in the service cut. She wants the boat back before anyone talks tonnage. I can show you Ceres on the star chart.'
    : 'The refinery buys what comes out of the rock. Kroll worries about who comes out. One Ironback is waiting in the Ninth Mouth service cut; she keeps a receiving mast outside and put worklights out for the passage. You can tow the boat straight out or put light along the passage first. No desk signature needed. I can mark her apron.' };
}

export function krollArrivalLine(status, met) {
  if (status.status === 'rescued') return 'Your barge’s crew transfer is still on my board. Come to the mast if you want a word; the lights are separate work.';
  if (status.status === 'lost') return 'That boat never made my apron. There is no crew transfer to report. Keep clear of the loose gear.';
  return met
    ? 'Kroll here. The same barge is waiting. Your Line, your choice of approach; I am still on the receiving mast.'
    : 'Dessa Kroll, receiving mast. One Ironback waiting in the service cut. I will not close its shift on a missing boat. Slow down and call me, or take the Line straight in.';
}
export function krollStoryScene(status, topic = 'arrival', plan = null) {
  if (status.status === 'rescued') {
    if (topic === 'people') return { headline: 'THE CREW, NOT THE TONNAGE', detail: '“The transfer is confirmed. That is the entry I needed. The refinery can argue about the load tomorrow.” Kroll taps the berth record. “You brought the same boat out. I have not forgotten.”' };
    return { headline: 'ONE BARGE HOME', detail: `“Crew transfer confirmed. Now I can close that boat’s shift.” Kroll leaves the entry on the board. ${status.lights === 3 ? '“All three worklights are seated too. Keep the cut clear for the next crew.”' : `“${status.lights} of the three worklights are seated. The rescue stands either way. If you stay, finish the lamp line; if you go, go easy.”`}` };
  }
  if (status.status === 'lost') return { headline: 'NO SAFE ARRIVAL', detail: '“I cannot enter a crew transfer that never happened.” Kroll keeps the radio on. “The boat is lost. If you work here now, mind the surviving lights and the loose rock. There is still a passage to leave safe.”' };
  if (status.status === 'unavailable') return { headline: 'WAIT FOR THE BOAT’S SIGNAL', detail: '“I do not have the original boat resolved on this channel. I will not promise an arrival from silence. Keep the approach clear.”' };
  if (topic === 'people') return { headline: 'WHY THE SHIFT STAYS OPEN', detail: '“They leave a light burning at Cathedral Vigil for crews who did not come back. I will not make this boat another vigil.” Kroll watches the cut, not the refinery. “The buyers want tonnage. I want a crew-transfer entry. Bring the boat here, not to the ore scales.”' };
  if (topic === 'work') return { headline: 'TWO WAYS INTO THE SAME JOB', detail: '“The boat can come straight through. If you want more light, use a worklight that still needs seating. Neither needs my permission.” Kroll points to the far shoulder. “That end stays open. If your pull shifts the fallen rock, ease off and look. You can reverse out.”' };
  return { headline: 'KROLL’S OPEN SHIFT', detail: '“The Ironback is still inside. My apron stays clear for the boat. The worklights belong to this cut; use whichever still need seating.” Kroll breaks off to listen to the channel. '
    + (plan === 'lights' ? '“You were working the lamps. That still helps; it does not have to come before the rescue.”'
      : plan === 'barge' ? '“You were going for the boat. The lights can wait. Change your approach if you need to.”'
        : '“I do not need you to sign anything. Tell me where you want to start, or just fly.”') };
}

// A chart address, not a duplicate POI entity. Preserve the world's RNG stream,
// admission rules, native bodies and the original receiver at this apron.
export function ceresArrivalChartTarget(state, sectorId) {
  if (sectorId !== CUT.sectorId || state?.run?.kind && !['adventure', 'campaign'].includes(state.run.kind)) return null;
  const r = ceresArrivalRead(state), pos = worldPoint(CUT.berth.local);
  const unavailable = state?.npcJobs?.ceresNinthMouth?.objects?.receiver?.lost === true;
  return { id: `${ID}:receiving-apron`, kind: 'poi', poiType: 'beacon', sectorId,
    name: 'Ninth Mouth · Kroll’s berth', x: pos.x, z: pos.z,
    drawPos: globalToSectorLocalForSector(pos, sectorId), entityId: null, named: true,
    statusLine: unavailable ? 'Radio unavailable' : r.phase === 'rescued' ? 'Crew transfer filed · worklights remain separate'
      : r.phase === 'lost' ? 'No safe arrival filed' : 'Call Kroll · barge and worklights',
    chartNote: 'A receiving apron outside the service cut. Slow near the mast to hear Kroll. The boat can come out directly; the loose lights are optional preparation.',
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
  return intent.focus === 'system' && intent.pos?.x === target.x && intent.pos?.z === target.z ? target : null;
}
