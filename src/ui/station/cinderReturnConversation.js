// Rook remembers a settled job through the campaign and payment owners' receipts.
// No new quest, money, material, reputation or conversation ledger is written here.
import { CINDER_TAG } from '../../missions/cinderRoute.js';
import { UNDERSTORY_RECEIVER, receiverApproach, receiverStatus } from '../../data/understoryReceiver.js';
import { UNDERSTORY_COMPOST_RUN } from '../../data/factions/understory.js';

const STATIONS = { station_tethys: 'sector_tethys_junction', station_expanse: 'sector_charon_expanse' };
export function cinderReturnRead(state, stationId, contact) {
  if (!STATIONS[stationId] || contact?.id !== `contact_${stationId}_rook` || contact.canonicalKey !== 'rook'
    || state?.ui?.docked !== true || state.ui.dockedStationId !== stationId
    || state.world?.currentSectorId !== STATIONS[stationId] || state.save?.restoring
    || (state.run?.kind && !['adventure', 'campaign'].includes(state.run.kind))) return null;
  const campaign = state.story?.campaign47a;
  const completed = campaign?.stepProgress?.['2']?.completed;
  if (!Array.isArray(completed) || !completed.includes('cinder_board')
    || (state.missions?.active || []).some(m => m?.storyTag === CINDER_TAG)
    || state.missions?.cinderRetry?.storyTag === CINDER_TAG) return null;
  const steps = (Array.isArray(campaign.receipts) ? campaign.receipts : []).filter(r =>
    r?.kind === 'step_progress' && r.beatIndex === 2 && r.stepId === 'cinder_board');
  if (steps.length !== 1) return null;
  const step = steps[0];
  if (step.signal !== 'mission:completed' || !Number.isFinite(step.atSimTime)
    || step.atSimTime < 0 || !Number.isFinite(state.simTime) || step.atSimTime > state.simTime
    || !(step.completionMethod === null || ['clear_and_tow', 'tow_under_fire', 'clearance_only'].includes(step.completionMethod))) return null;
  // Existing step receipts do not carry missionId. Join only a unique canonical
  // settlement at the same simulation instant and the authored route's exact termini.
  // Missing/ambiguous old history gets no invented personal account.
  const receipts = (Array.isArray(state.missions?.receipts) ? state.missions.receipts : [])
    .filter(r => r?.at_s === step.atSimTime && r.type === 'patrol_clear'
      && r.source === 'campaign47a.embodied' && r.stationId === 'station_tethys'
      && r.destStationId === 'station_expanse' && r.destSectorId === STATIONS.station_expanse);
  if (receipts.length !== 1) return null;
  const receipt = receipts[0], delivered = step.completionMethod === null ? null : step.completionMethod !== 'clearance_only';
  if (typeof receipt.missionId !== 'string' || !receipt.missionId
    || receipt.id !== `${receipt.missionId}:completed` || receipt.outcome !== 'completed'
    || !Number.isSafeInteger(receipt.rewardCr) || receipt.rewardCr < 0
    || (!delivered && receipt.rewardCr !== 0)) return null;
  const receiver = receiverStatus(state), data = receiver.garden?.data
    || state.understory?.authoredReceiver?.terminalGardenData || {};
  const gardenPos = receiver.garden?.pos;
  const approach = receiver.garden ? (Number.isFinite(gardenPos?.x) && Number.isFinite(gardenPos?.z)
    ? { x: gardenPos.x + UNDERSTORY_RECEIVER.approachOffset.x, z: gardenPos.z + UNDERSTORY_RECEIVER.approachOffset.z } : null)
    : receiverApproach();
  return { place: 'return', missionId: receipt.missionId, receiptId: receipt.id, at: receipt.at_s,
    method: step.completionMethod, delivered, rewardCr: receipt.rewardCr,
    compostComplete: completed.includes('compost'), currentCompost: state.story.beatIndex === 2 && !completed.includes('compost'),
    receiver: receiver.status, approach: receiver.status === 'unavailable' ? null : approach,
    fed: Math.max(0, Number(data.compostFedMass) || 0), paid: data.compostRunComplete === true };
}
export function cinderReturnContact(state, stationId) {
  const contact = { id: `contact_${stationId}_rook`, canonicalKey: 'rook', name: 'Rook',
    role: 'bounty_hunter', roleLabel: 'Bounty Broker · desk relay', factionId: 'faction_scn' };
  const read = cinderReturnRead(state, stationId, contact);
  if (!read) return null;
  contact.line = read.delivered === null
    ? 'Rook holds the closed Cinder account against the relay. “Zero in the payment column. It is still your account. We can read it.”'
    : read.delivered
    ? 'The desk relay clicks. “You brought the hull, not just the name. That part of the book is closed.”'
    : 'Rook leaves a space where the hull receipt should be. “The lane is clear. The delivery column is empty. Both stay in the book.”';
  return contact;
}
export function cinderReturnChoices(read) {
  return [
    ['return_account', read.delivered === null ? 'Read my closed Cinder account.' : read.delivered ? 'What did my delivery settle?' : 'The lane is clear. Why no contract pay?'],
    ['return_book', 'Who is paying you twice?'],
    ['return_compost', read.compostComplete ? 'The garden grew. What changes now?' : 'What can the receiving garden use?'],
    ...(read.currentCompost && read.approach ? [['return_garden', 'Mark Rookside’s west approach.']] : []),
    ['return_journal', 'Open my current next step.'],
  ];
}
export function cinderReturnReply(ctx, read, action) {
  const answer = text => ({ text, cinderDepartureAnswer: true });
  if (action === 'return_account' && read.delivered === null) return answer('“The Cinder account closed with zero contract pay. This copy does not say what happened to each hull. I will not call them delivered, or send you after a replacement the record cannot name.” He turns the page. “The lane clearance stands. The receiving garden is different work, not a second attempt to collect this payment.”');
  if (action === 'return_account') return answer(read.delivered
    ? `“All three lane clearances and a matching hull receipt. ${read.rewardCr} cr in contract pay, already settled. The pad bought the hull separately. I do not pay either one again because you came back to ask.” Rook pauses. “You got the material here. The book can say that much without improving on it.”`
    : '“Three clearances, zero contract pay. No marked hull reached my book. Lost, stripped, sold elsewhere or driven out of the lane: those are not the receipt you signed for. I am not sending you back for an invented fourth Wasp.” He closes the empty delivery column. “The next work does not require you to undo this one.”');
  if (action === 'return_book') return answer('“One pays to clear a lane. One pays for a name they can close.” The relay goes quiet for a moment. “You think that is the same service. Convenient of you.” His thumb covers the second column. “Your contract settlement is yours. My other invoice is not a second reward waiting for you.”');
  if (action === 'return_journal') {
    ctx.bus?.emit('ui:pushScreen', { id: 'missionLog', source: 'station-bar:cinder-return' });
    return answer('Rook turns the current page toward you. “Follow what is open. The old job stays closed.”');
  }
  if (action === 'return_garden') {
    ctx.bus?.emit('ui:setCourse', { pos: { ...read.approach }, sectorId: UNDERSTORY_RECEIVER.sectorId,
      stationId: null, targetEntityId: null, label: `${UNDERSTORY_RECEIVER.name} · west approach`,
      reason: 'Approach outside the living mouth. Bring real loose feed or free cargo; keep the cockpit clear. Choosing this course does not supply material or credit growth.',
      autopilot: false, source: 'station-bar:cinder-return' });
    return answer('“West side of Rookside, outside the mouth. Marked, not flown.” Rook taps the tow column. “This time the receiver keeps what it eats. Keep your cockpit out of the mat.”');
  }
  const run = read.paid ? `Your ${read.fed}t run is already paid; it will not pay again.`
    : `The separate paid run has ${read.fed}/${UNDERSTORY_COMPOST_RUN.targetMass}t recorded. It pays only at ${UNDERSTORY_COMPOST_RUN.targetMass}t, ${UNDERSTORY_COMPOST_RUN.creditPerTonne} cr per actual tonne, once.`;
  if (read.compostComplete) return answer(`“You fed it, and it grew. That is in the book. A changed garden, not another dead name.” ${run} “The Journal has the current next step; you can return to the garden without redoing Cinder.”`);
  const status = read.receiver === 'destroyed'
    ? 'The receiving garden was destroyed. New feed can regrow it, but the old growth is not restored for free. '
    : read.receiver === 'unavailable' || !read.approach
      ? 'The receiving garden is not available now. I cannot promise an intake there; check the Journal before leaving. ' : '';
  return answer(`“${status}A loose wreck or a pod of your free cargo. Do not throw your ship into it. Tow the load into the living mat from the west and keep your cockpit outside. Material sold at my pad or Quiet Line is gone; it cannot feed the garden too. Keep contract cargo aboard.” He taps a green mark, not a price. “The first real player-fed growth opens the next part of the route. ${run}”`);
}
