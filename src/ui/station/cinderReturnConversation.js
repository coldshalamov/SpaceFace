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
    ? 'Rook holds the closed Cinder account against the relay. “Zero in the column. Still your account.”'
    : read.delivered
    ? 'The desk relay clicks. “Hull, not just the name. Closed.”'
    : 'Rook leaves a space where the hull receipt should be. “Lane clear. Delivery column empty.”';
  return contact;
}
export function cinderReturnChoices(read) {
  return [
    ['return_account', read.delivered === null ? 'Read my closed Cinder account.' : read.delivered ? 'What did my delivery settle?' : 'The lane is clear. Why no contract pay?'],
    ['return_compost', read.compostComplete ? 'The garden grew. What changes now?' : 'What can the receiving garden use?'],
    ...(read.currentCompost && read.approach ? [['return_garden', 'Mark Rookside’s west approach.']] : []),
    ['return_journal', 'Open my current next step.'],
  ];
}
export function cinderReturnReply(ctx, read, action) {
  const answer = text => ({ text, cinderDepartureAnswer: true });
  if (action === 'return_account' && read.delivered === null) return answer('The relay shows Rook’s closed page: zero contract pay. “Your account, still. We can read it.” The copy does not say what happened to each hull; it will not call them delivered, and it will not send you after a replacement the record cannot name. The lane clearance stands.');
  if (action === 'return_account') return answer(read.delivered
    ? `“Three cleared, one hull received.” The book shows ${read.rewardCr} cr in contract pay, already settled; the pad bought the hull separately. Neither pays twice for a remembered receipt.`
    : '“Three cleared. No hull in my book.” The account closed at zero contract pay. Lost, stripped, sold elsewhere or driven out of the lane: none is the receipt you signed for, and no invented fourth Wasp gets sent.');
  if (action === 'return_journal') {
    ctx.bus?.emit('ui:pushScreen', { id: 'missionLog', source: 'station-bar:cinder-return' });
    return answer('Rook turns the current page toward you. “Follow what is open. This stays closed.”');
  }
  if (action === 'return_garden') {
    ctx.bus?.emit('ui:setCourse', { pos: { ...read.approach }, sectorId: UNDERSTORY_RECEIVER.sectorId,
      stationId: null, targetEntityId: null, label: `${UNDERSTORY_RECEIVER.name} · west approach`,
      reason: 'Approach outside the living mouth. Bring real loose feed or free cargo; keep the cockpit clear. Choosing this course does not supply material or credit growth.',
      autopilot: false, source: 'station-bar:cinder-return' });
    return answer('“West approach, outside the mouth. Marked.” Rook taps the tow column. “The receiver keeps what it eats.”');
  }
  const run = read.paid ? `Your ${read.fed}t run is already paid; it will not pay again.`
    : `The separate paid run has ${read.fed}/${UNDERSTORY_COMPOST_RUN.targetMass}t recorded. It pays only at ${UNDERSTORY_COMPOST_RUN.targetMass}t, ${UNDERSTORY_COMPOST_RUN.creditPerTonne} cr per actual tonne, once.`;
  if (read.compostComplete) return answer(`“You fed it, and it grew.” A changed garden, not another dead name. ${run} The Journal has the current next step; you can return to the garden without redoing Cinder.`);
  const status = read.receiver === 'destroyed'
    ? 'The receiving garden was destroyed. New feed can regrow it, but the old growth is not restored for free. '
    : read.receiver === 'unavailable' || !read.approach
      ? 'The receiving garden is not available now. I cannot promise an intake there; check the Journal before leaving. ' : '';
  return answer(`${status}“A loose wreck or a free pod. Keep your cockpit out.” Tow the load into the living mat from the west. Material sold at my pad or Quiet Line is gone; it cannot feed the garden too. Keep contract cargo aboard. The first real player-fed growth opens the next part of the route. ${run}`);
}
