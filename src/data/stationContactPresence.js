// Physical berth -> existing character -> existing work and memory. This is a projection,
// not an actor/quest store. Scanner authenticates the body; missions owns every contract.
import { SECTORS } from './sectors.js';
import { canonicalContactsForStation, LANTERN_WARD_RESIDENT } from './stationResidents.js';
import { stationContactMemoryFor } from './stationContacts.js';
import { depthContactsForStation, DEPTH_PROGRAM_CONTACTS } from '../story/campaign47a/embodiedDialogue.js';
import { missionDockAttention } from '../missions/missionAttention.js';
import { lanternWardDialogueFacts, lanternWardLiveNessa } from './lanternWardHail.js';
import { lanternWardWorkGuidance } from './lanternWardGuidance.js';
import { selectLanternWardDialogue } from '../missions/lanternWardStory.js';

const STATIONS = new Map(SECTORS.flatMap(sector => (sector.stations || [])
  .map(station => [station.id, { station, sectorId: sector.id }])));
export const RESIDENT_HAIL_TTL_S = 30;
export const RESIDENT_WORK_SIGNALS = Object.freeze({
  available: Object.freeze({ glyph: '!', label: 'Work available' }),
  active: Object.freeze({ glyph: '◇', label: 'Work in progress' }),
  ready: Object.freeze({ glyph: '✓', label: 'Ready to settle' }),
});

export function lanternWardResidentFor(state) {
  const actor = lanternWardLiveNessa(state);
  if (!actor) return null;
  const facts = lanternWardDialogueFacts(state);
  return { ...LANTERN_WARD_RESIDENT, physicalTargetId: actor.id,
    factionId: actor.factionId || actor.data?.factionId || LANTERN_WARD_RESIDENT.factionId,
    line: selectLanternWardDialogue(facts, {
      revisit: (state?.missions?.lanternWardConversation?.visits || 0) > 1,
    }).text };
}

export function residentsForStation(state, stationId) {
  const residents = canonicalContactsForStation(stationId);
  for (const card of depthContactsForStation(stationId, state)) {
    residents.push({ id: card.id, canonicalKey: card.id, name: card.name,
      role: card.role, roleLabel: card.roleLabel, factionId: card.factionId,
      line: card.blurb, trackerId: card.trackerId });
  }
  if (stationId === 'station_helios') {
    const nessa = lanternWardResidentFor(state);
    if (nessa) residents.push(nessa);
  }
  return residents;
}

function closedChannelReason(state, stationId) {
  const card = DEPTH_PROGRAM_CONTACTS.find(entry => entry.stationHints.includes(stationId));
  if (!card) return 'No resident is taking calls at this berth.';
  const gate = card.gate || {};
  if ((Number(state.story?.beatIndex) || 0) < (Number(gate.minBeat) || 0)) {
    return 'This private channel opens as the campaign advances. Public station services remain separate.';
  }
  if (gate.minRep && (Number(state.factions?.[gate.minRep.factionId]?.rep) || 0) < gate.minRep.value) {
    const name = gate.minRep.factionId.replace(/^faction_/, '').replaceAll('_', ' ');
    return `${card.name} requires ${gate.minRep.value} ${name} standing before taking your call.`;
  }
  if (gate.minUniqueWrecks) return `${card.name} asks for ${gate.minUniqueWrecks} explored wrecks before opening this channel.`;
  return 'No resident is taking calls at this berth.';
}

export function stationResidentChannel(state, entity) {
  if (!entity || entity.type !== 'station' || entity.alive === false
    || (entity.hull != null && entity.hull <= 0) || state?.entities?.get(entity.id) !== entity) return null;
  const stationId = entity.data?.stationId;
  const entry = STATIONS.get(stationId);
  if (!entry || state.world?.currentSectorId !== entry.sectorId) return null;
  const residents = residentsForStation(state, stationId);
  return { stationId, stationName: entry.station.name, sectorId: entry.sectorId,
    residents, closedReason: residents.length ? null : closedChannelReason(state, stationId) };
}

export function stationResidentWork(state, stationId, offerEligibility = null) {
  const attention = missionDockAttention(state, stationId, { localOnly: true,
    offerEligible: offerEligibility ? offer => offerEligibility(offer).ok === true : undefined });
  if (!attention) return null;
  const status = attention.kind === 'turn_in' ? 'ready'
    : attention.kind === 'accept' ? 'available' : 'active';
  const signal = RESIDENT_WORK_SIGNALS[status];
  const list = attention.surface === 'board'
    ? state.missions?.boards?.[stationId]?.slots : state.missions?.active;
  const mission = (list || []).find(row => row && String(row.id ?? row.missionId) === attention.focusMissionId);
  if (!mission) return null;
  const eligibility = attention.surface === 'board' && offerEligibility ? offerEligibility(mission) : null;
  return { ...attention, status, ...signal, mission, eligibility };
}

export function residentWorkSignature(work) {
  return work ? JSON.stringify([work.focusMissionId, work.status, work.reason,
    work.eligibility?.acceptCostCr, work.eligibility?.remoteSafe]) : '';
}

export function stationResidentLine(state, stationId, resident) {
  if (resident.id === LANTERN_WARD_RESIDENT.id) return lanternWardWorkGuidance(state).lines.join(' ');
  // The latest committed receipt is a truthful acknowledgment, including failure and recovery;
  // selecting this optional conversation never pays or advances its original contract again.
  const receipt = !resident.trackerId && (state.missions?.receipts || []).find(row => row
    && (row.stationId === stationId || row.destStationId === stationId));
  if (receipt) {
    if (receipt.outcome === 'completed') return `Your work on “${receipt.title || 'the contract'}” is filed. The recorded settlement stands.`;
    if (['failed', 'expired', 'abandoned'].includes(receipt.outcome)) return `“${receipt.title || 'The contract'}” is closed (${receipt.outcome}). Check current work for a recovery or another route.`;
  }
  const memory = stationContactMemoryFor(state, resident.id);
  if (memory?.met && resident.canonicalKey && !resident.trackerId) {
    const deed = state.stationLife?.deeds?.[STATIONS.get(stationId)?.sectorId];
    if (deed?.text && Number(state.simTime) - Number(deed.simTime) <= 1800) return deed.text;
  }
  return resident.line || 'The channel is open. Ask about the work, or approach the berth for station services.';
}

/** Bounded conversation over the one scanner hail. Up to three actions, no focus/pause/camera writes. */
export function createStationResidentOffer(state, availability, requestId, options = {}) {
  const channel = stationResidentChannel(state, availability?.entity);
  if (!channel) return null;
  const now = Number(state.simTime) || 0;
  if (!channel.residents.length) return {
    requestId, targetId: availability.targetId, kind: 'resident', residentChannel: true,
    stationId: channel.stationId, contactId: null, expiresAt: now + RESIDENT_HAIL_TTL_S,
    lines: [`${channel.stationName} · RESIDENT CHANNEL`, channel.closedReason],
    actions: [{ id: 'resident_berth', label: 'LOCATE BERTH' }],
  };
  let index = options.contactId == null ? 0 : channel.residents.findIndex(row => row.id === options.contactId);
  if (index < 0) return null; // A gated/moved resident must not silently become a different person.
  if (options.next) index = (index + 1) % channel.residents.length;
  const resident = channel.residents[index];
  const work = stationResidentWork(state, channel.stationId, options.offerEligibility);
  const section = options.next ? 'intro' : options.section || 'intro';
  const workText = work ? `${work.glyph} ${work.label} · ${work.title}. ${work.reason}`
    : 'No current work at this berth. Station services and local conversation remain available.';
  let line = section === 'work' ? workText : stationResidentLine(state, channel.stationId, resident);
  const actions = [];
  if (resident.id === LANTERN_WARD_RESIDENT.id) {
    actions.push({ id: 'resident_find', label: 'LOCATE NESSA’S LAUNCH' });
  } else if (section === 'work' && work?.status === 'available') {
    const reward = Math.max(0, Math.round(Number(work.mission.reward_cr) || 0));
    const cost = Math.max(0, Math.round(Number(work.eligibility?.acceptCostCr) || 0));
    line = `${work.glyph} ${work.title} · ${reward} cr reward${cost ? ` · ${cost} cr due on acceptance` : ''}. ${work.eligibility?.requiresDock ? 'Dock to receive cargo or review the special terms.' : work.mission.brief || work.reason}`;
    actions.push(work.eligibility?.remoteSafe === true
      ? { id: 'resident_accept', label: `ACCEPT · ${reward} CR` }
      : { id: 'resident_berth', label: 'APPROACH FOR WORK' });
  } else if (section === 'work' && work?.status === 'ready') {
    actions.push({ id: 'resident_berth', label: 'APPROACH TO SETTLE' });
  } else if (section === 'work' && work?.status === 'active') {
    actions.push({ id: 'resident_track', label: 'TRACK THIS WORK' });
  } else actions.push({ id: 'resident_work', label: work ? `${work.glyph} ${work.label.toUpperCase()}` : 'ASK ABOUT WORK' });
  actions.push({ id: section === 'local' ? 'resident_work' : 'resident_local',
    label: section === 'local' ? 'ASK ABOUT WORK' : 'LOCAL WORD' });
  if (channel.residents.length > 1) actions.push({ id: 'resident_next', label: 'NEXT RESIDENT' });
  else if (!actions.some(row => row.id === 'resident_berth')) actions.push({ id: 'resident_berth', label: 'LOCATE BERTH' });
  return { requestId, targetId: availability.targetId, kind: 'resident', residentChannel: true,
    stationId: channel.stationId, contactId: resident.id, residentName: resident.name,
    residentRole: resident.roleLabel, residentFactionId: resident.factionId,
    canonicalKey: resident.canonicalKey, residentRoleId: resident.role,
    expiresAt: now + RESIDENT_HAIL_TTL_S, section,
    missionId: work?.focusMissionId || null,
    workStatus: work?.status || null, workGlyph: work?.glyph || '', workLabel: work?.label || '',
    workSignature: residentWorkSignature(work),
    lines: [`${resident.name} · ${resident.roleLabel}`, line],
    actions: [...new Map(actions.map(action => [action.id, action])).values()].slice(0, 3),
  };
}

export function residentAtHail(state, offer) {
  const channel = stationResidentChannel(state, state.entities?.get(offer?.targetId));
  if (!channel || channel.stationId !== offer?.stationId) return null;
  return channel.residents.find(row => row.id === offer.contactId) || null;
}
