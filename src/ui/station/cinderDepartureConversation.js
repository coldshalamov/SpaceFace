import { cinderReturnRead, cinderReturnContact, cinderReturnChoices, cinderReturnReply } from './cinderReturnConversation.js';
// The disposal slip meets the bounty book. These are projections and UI intents;
// missions, law, economy and aftermath retain every consequential writer.
import { furnaceDetailRead } from '../../missions/furnaceArrivalScene.js';
import { authoredCinderRoute, cinderAccounting, CINDER_TAG } from '../../missions/cinderRoute.js';
import { isPlayerWanted } from '../../systems/heat.js';
import { SECTORS } from '../../data/sectors.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';

const PREFIX = 'cinder_departure:';
const DESK = 'station_tethys';
const CERES = 'station_ceres';
const SECTOR = { [DESK]: 'sector_tethys_junction', [CERES]: 'sector_ceres_belt' };
const positive = n => Number.isFinite(n) && n > 0;

export function cinderCeresFine(state) {
  const key = 'warrant:wanted:station_ceres:scan';
  const row = state?.lawSecurity?.composed?.[key];
  return row?.key === key && row.kind === 'warrant' && row.causeId === 'wanted:station_ceres:scan'
    && row.status === 'open' && positive(row.remainingCr) ? row.remainingCr : null;
}

export function cinderDepartureRead(state, stationId, contact) {
  const returned = cinderReturnRead(state, stationId, contact);
  if (returned) return returned;
  const host = stationId === CERES && contact?.id === 'contact_station_ceres_0' && contact.role === 'barkeep';
  const rook = stationId === DESK && contact?.id === 'contact_station_tethys_rook' && contact.canonicalKey === 'rook';
  if ((!host && !rook) || state?.ui?.docked !== true || state.ui.dockedStationId !== stationId
    || state.world?.currentSectorId !== SECTOR[stationId] || state.save?.restoring
    || (state.run?.kind && !['adventure', 'campaign'].includes(state.run.kind))
    || state.story?.beatIndex !== 2 || !Array.isArray(state.missions?.active)) return null;
  const furnace = furnaceDetailRead(state);
  const steps = state.story.campaign47a?.stepProgress?.['2']?.completed || [];
  if (!furnace?.settled || !Array.isArray(steps) || steps.includes('cinder_board')) return null;
  const active = state.missions.active.filter(m => m?.storyTag === CINDER_TAG && m.status === 'active');
  if (active.length > 1) return null;
  let job = active[0] || null, offer = null;
  if (job && (!authoredCinderRoute(job) || !cinderAccounting(job, state).valid
    || typeof job.id !== 'string' || !job.id || job.type !== 'patrol_clear'
    || job.destSectorId !== 'sector_charon_expanse' || job.destStationId !== 'station_expanse'
    || state.missions.active.filter(m => m?.id === job.id).length !== 1)) return null;
  if (!job && rook) {
    const slots = state.missions.boards?.[DESK]?.slots || [];
    const matches = slots.filter(o => o?.storyTag === CINDER_TAG);
    if (matches.length > 1) return null;
    const o = matches[0];
    if (o && (!authoredCinderRoute(o) || typeof o.id !== 'string' || !o.id
      || o.type !== 'patrol_clear' || o.stationId !== DESK
      || o.destSectorId !== 'sector_charon_expanse' || o.destStationId !== 'station_expanse'
      || !Number.isSafeInteger(o.reward_cr) || o.reward_cr < 0
      || slots.filter(row => row?.id === o.id).length !== 1)) return null;
    offer = o || null;
  }
  // Stable records only. Moving target poses and ticking heat do not invalidate a reader
  // every frame; the relevant WANTED boundary and receipt/contract changes do.
  return { place: host ? 'ceres' : 'rook', furnace, fineCr: cinderCeresFine(state),
    wanted: isPlayerWanted(state), withheld: state.story.flags?.contract_47a_payment_withheld === true,
    job: job ? { id: job.id, acceptedAt: job.acceptedAt_s ?? null,
      cleared: new Set(job.completedTargetSlots || []).size, delivered: cinderAccounting(job, state).delivered } : null,
    offer: offer ? JSON.parse(JSON.stringify(offer)) : null };
}
function idFor(state, read, action) {
  return PREFIX + action + ':' + encodeURIComponent(JSON.stringify([state.meta?.seed ?? null, read]));
}
export function cinderDepartureContact(state, stationId) {
  const returned = cinderReturnContact(state, stationId);
  if (returned) return returned;
  const contact = { id: 'contact_station_tethys_rook', canonicalKey: 'rook', name: 'Rook',
    role: 'bounty_hunter', roleLabel: 'Bounty Broker · desk relay', factionId: 'faction_scn',
    line: 'Rook’s voice comes through the desk relay. “Three names. Bring me one hull with its name still on it.”' };
  return cinderDepartureRead(state, stationId, contact) ? contact : null;
}
export function isCinderDepartureChoice(id) { return typeof id === 'string' && id.startsWith(PREFIX); }
export function cinderDepartureChoices(state, stationId, contact) {
  const read = cinderDepartureRead(state, stationId, contact);
  if (!read) return [];
  const choice = (action, label) => ({ id: idFor(state, read, action), label });
  if (read.place === 'return') return cinderReturnChoices(read).map(([action, label]) => choice(action, label));
  if (read.place === 'ceres') return [choice('next', 'Who is offering the next job?'),
    choice(read.job ? 'track' : 'desk', read.job ? 'Track my Cinder contract.' : 'Mark Rook’s desk at Tethys.')];
  return [choice('read', read.job ? 'Read back my Cinder contract.' : 'What do you want from the Cinder lane?'),
    choice('proof', 'Why bring a whole hull?'),
    choice(read.job ? 'track' : 'offer', read.job ? 'Track the real Cinder marks.' : 'Show me the exact posting.')];
}
export function cinderDepartureOfferCurrent(state, stationId, contact, token) {
  return !!(token && token.stationId === stationId && token.contactId === contact?.id
    && token.choiceId?.startsWith(PREFIX + 'offer:')
    && cinderDepartureChoices(state, stationId, contact).some(choice => choice.id === token.choiceId));
}
export function cinderDepartureReply(ctx, stationId, contact, choiceId) {
  if (!isCinderDepartureChoice(choiceId)) return null;
  const state = ctx?.state, read = cinderDepartureRead(state, stationId, contact);
  const answer = text => ({ text, cinderDepartureAnswer: true });
  if (!read || !cinderDepartureChoices(state, stationId, contact).some(c => c.id === choiceId)) {
    return answer('The current slip is different. Ask again before choosing a destination or a contract.');
  }
  const action = choiceId.slice(PREFIX.length).split(':')[0];
  if (read.place === 'return') return cinderReturnReply(ctx, read, action);
  const legal = read.wanted
    ? 'Your current WANTED status will keep Rook’s receiving ring dark. Resolve that through the law’s own choices before delivery; a bounty signature is not clearance.'
    : 'Rook’s ring is not refusing you for WANTED status now. That is not a promise that every fine has been paid.';
  const fine = read.fineCr ? `The Ceres scan fine still shows ${read.fineCr} cr unpaid. ` : '';
  const held = read.withheld ? '47-A’s freight payment is still withheld. ' : '';
  if (action === 'desk') {
    const sector = SECTORS.find(s => s.id === SECTOR[DESK]);
    const station = sector?.stations?.find(s => s.id === DESK);
    if (!station?.pos) return answer('The host cannot verify the Tethys berth on this chart. Check the Mission Log.');
    ctx.bus?.emit('ui:setCourse', { pos: sectorLocalToGlobalForSector(station.pos, sector.id), sectorId: sector.id,
      stationId: DESK, label: 'Tethys · Rook’s Cinder posting',
      reason: 'Dock Tethys and speak to Rook in the Bar. Read the Cinder contract before accepting it.',
      autopilot: false, source: 'station-bar:ceres-cinder' });
    return answer('“Tethys Trade Hub, Rook’s desk in the Bar. Marked on your chart. He posts there; his receiving ring is at Expanse Refinery in Charon. Those are two different stops. Prepare at Tethys before committing to the lane.”');
  }
  if (action === 'track') {
    ctx.bus?.emit('ui:trackMission', { missionId: read.job.id });
    ctx.bus?.emit('ui:pushScreen', { id: 'missionLog', source: 'station-bar:cinder' });
    return answer(`“Your signed Cinder contract is tracked: ${read.job.cleared}/3 marks cleared, ${read.job.delivered ? 'Rook delivery recorded' : 'Rook delivery still outstanding'}. The Mission Log follows the real surviving marks and hulls. ${legal}”`);
  }
  if (action === 'next') {
    const r = read.furnace;
    const worms = r.casketLosses ? `${r.casketLosses} Casket ${r.casketLosses === 1 ? 'worm loss is' : 'worm losses are'} recorded. That slip does not identify whose blast caused them. `
      : 'No Casket worm losses are recorded. ';
    return answer(`The host keeps the disposal slip beside your glass. “${r.received}/3 pods received, ${r.lost} lost; ${r.rewardCr} cr recorded. ${worms}${fine}${held}Rook is posting Cinder work at Tethys: three armed Wasps on Charon’s Ashfall approach, and one identifiable hull brought to his ring at Expanse. These are ships that fight, not repair mites. He pays for the clearance and the proof. Read his terms before you sign. ${legal}”`);
  }
  if (action === 'proof') return answer(`A finger taps on Rook’s end of the desk relay. “One name, two payers. The hull gives the name weight. My booth buys the physical hull separately; the contract needs all three clearances and one of those actual hulls at my ring. The smaller Quiet Line ring will buy it too, but their payment is no Rook receipt. They take the hull. Keep another for my book or lose the contract’s delivery pay. Strip or destroy every marked hull and the clearance closes for zero contract pay. ${legal}”`);
  const terms = 'Cinder One, Two and Three hold the Ashfall approach in Charon. Clear all three and keep one real hull intact. Bring it to my 100-WU ring at Expanse at 8 WU/s or slower. Clearance and delivery can happen in either order. Your Line has to move the actual wreck; signing does not upgrade it.';
  if (action === 'offer') {
    if (!read.offer) return answer('“No single current Cinder posting is on this board. Check Contracts. I will not issue a second copy from this chair.”');
    return { ...answer(`The desk relay prints Rook’s current posting. “${read.offer.title}. ${read.offer.reward_cr} cr contract pay for all three clearances and one matching Rook delivery; the booth prices the hull separately. ${terms} ${fine}${legal} Read the preflight and choose Accept + Track when ready.”`), missionOffer: read.offer, cinderDepartureOffer: { stationId, contactId: contact.id, choiceId } };
  }
  const r = read.furnace;
  return answer(`Over the desk relay, Rook reads only the bottom line of the old slip. “DMC recorded ${r.rewardCr} cr for ${r.received} received pods, not the ${r.lost} lost ones. That is their book. ${held}Mine has three names. ${terms} ${fine}${legal}”`);
}
