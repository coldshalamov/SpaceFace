// One desk, two books: the paid local shift and the existing 47-A campaign.
// This presenter reads receipts; missions, world and stationContacts remain the writers.
import { stationContactMemoryFor } from '../../data/stationContacts.js';
import { kesslerScaleWaypoint } from '../../systems/kesslerScaleWorksite.js';

const HOME = 'station_helios';
const SECTOR = 'sector_helios_prime';
const RECOVERY = 'campaign47a:b0:recovery';
const ALLOYS = 'campaign47a:b1:alloy_run';
const FILE = 'helios_47a_file';
const ORIGINAL = 'helios_47a_original';
const positive = n => Number.isSafeInteger(n) && n > 0;
const finitePoint = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);

function atDesk(s, stationId) {
  return stationId === HOME && s?.ui?.docked === true && s.ui.dockedStationId === HOME
    && s.world?.currentSectorId === SECTOR && !s.save?.restoring
    && (!s.run?.kind || ['adventure', 'campaign'].includes(s.run.kind))
    && Number.isFinite(s.simTime) && s.simTime >= 0;
}
function completed(s, beat) {
  const list = s.story?.campaign47a?.stepProgress?.[String(beat)]?.completed;
  return Array.isArray(list) ? list : [];
}
function paidFirstShift(s) {
  if (!positive(s.missions?.starterJobStep?.starter_hitch) || !Array.isArray(s.missions?.receipts)
    || s.missions.active.some(m => m?.status === 'active'
      && m.params?.starterJobId === 'starter_hitch' && m.params.starterStep === 1)) return false;
  const rows = s.missions.receipts.filter(r => r?.source === 'starterJob'
    && r.sourceOfferId === 'starter-starter_hitch-1');
  // An abandoned earlier attempt is harmless, but ambiguous completed receipts are not.
  const paid = rows.filter(r => r.outcome === 'completed');
  if (paid.length !== 1) return false;
  const r = paid[0];
  return typeof r.missionId === 'string' && !!r.missionId.trim() && r.id === `${r.missionId}:completed`
    && r.type === 'mining_quota' && r.stationId === HOME && r.destStationId === HOME
    && r.destSectorId === SECTOR && positive(r.rewardCr) && Number.isFinite(r.at_s)
    && r.at_s >= 0 && r.at_s <= s.simTime
    && s.missions.receipts.filter(other => other?.missionId === r.missionId).length === 1;
}
function originalKept(s) {
  return stationContactMemoryFor(s, 'contact_station_helios_kessler')?.flags?.[`choice_${ORIGINAL}`] === true;
}
function soleMission(s, tag) {
  const rows = s.missions.active.filter(m => m?.status === 'active' && m.storyTag === tag);
  if (rows.length !== 1) return null;
  const m = rows[0];
  return typeof m.id === 'string' && !!m.id.trim() && typeof m.title === 'string' && !!m.title.trim()
    && s.missions.active.filter(other => other?.id === m.id).length === 1 ? m : null;
}
function alloyOffer(s) {
  const slots = s.missions?.boards?.[HOME]?.slots;
  if (!Array.isArray(slots)) return null;
  const matches = slots.filter(o => o?.storyTag === ALLOYS);
  if (matches.length !== 1) return null;
  const o = matches[0];
  return typeof o.id === 'string' && !!o.id.trim() && typeof o.title === 'string' && !!o.title.trim()
    && o.type === 'cargo_delivery' && o.stationId === HOME && o.destStationId === 'station_tethys'
    && o.destSectorId === 'sector_tethys_junction' && o.preloadedCargo === true
    && slots.filter(other => other?.id === o.id).length === 1
    && o.params?.cmdtyId === 'cmdty_alloys' && positive(o.params.qty)
    && Number.isSafeInteger(o.reward_cr) && o.reward_cr >= 0 ? o : null;
}
function scaleRead(s) {
  const r = s.story?.flags?.kessler_comparison_watch?.first;
  return s.story?.flags?.kessler_comparison_watch?.version === 1 && Number.isFinite(r?.plate) && Number.isFinite(r?.stamp) && r.plate > 0 && r.plate < r.stamp
    && positive(r.count) ? r : null;
}

export function heliosCampaignStage(s, stationId) {
  if (!atDesk(s, stationId) || !Array.isArray(s.missions?.active)) return null;
  const beat = s.story?.beatIndex;
  const coldDone = ['mine', 'skim', 'dock'].every(id => completed(s, 0).includes(id));
  if (beat === 0) {
    if (!paidFirstShift(s)) return null;
    const mission = soleMission(s, RECOVERY);
    if (!mission || mission.type !== 'salvage_retrieval' || mission.destStationId !== HOME
      || mission.destSectorId !== SECTOR || mission.params?.cmdtyId !== 'cmdty_47a_assay_sample') return null;
    return { stage: mission.params.sampleRecovered === true ? 'sample_return' : 'sample_outbound', mission };
  }
  if (beat !== 1 || !coldDone || s.story.flags?.contract_47a_payment_withheld !== true) return null;
  const steps = completed(s, 1);
  if (!steps.includes('alloy_run')) {
    const matches = s.missions.active.filter(m => m?.status === 'active' && m.storyTag === ALLOYS);
    if (matches.length) {
      const mission = soleMission(s, ALLOYS);
      return mission?.destStationId === 'station_tethys' && mission.destSectorId === 'sector_tethys_junction'
        ? { stage: 'alloy_outbound', mission } : null;
    }
    const offer = alloyOffer(s);
    return offer ? { stage: 'alloy_ready', offer } : { stage: 'alloy_wait' };
  }
  if (!steps.includes('scale_4')) {
    const course = kesslerScaleWaypoint(s);
    return course && finitePoint(course.pos) ? { stage: 'scale_outbound', course } : null;
  }
  const reading = scaleRead(s);
  return reading ? { stage: 'scale_return', reading } : { stage: 'scale_recorded' };
}
function actionFor(s, f) {
  if (!f) return null;
  const identity = { seed: s.meta?.seed ?? null, stage: f.stage };
  if (f.mission) return { ...identity, kind: 'mission', missionId: f.mission.id,
    storyTag: f.mission.storyTag, title: f.mission.title,
    // The fixed sample source and recovery state are part of the shown assignment.
    fingerprint: JSON.stringify([f.mission.acceptedAt_s ?? null, f.mission.params?.sampleSource ?? null,
      f.mission.params?.samplePos ?? null, f.mission.params?.sampleRecovered === true,
      f.mission.params?.skimResolved === true]) };
  if (f.offer) return { ...identity, kind: 'offer', missionId: f.offer.id,
    fingerprint: JSON.stringify(f.offer) };
  if (f.course) return { ...identity, kind: 'course', sectorId: f.course.sectorId,
    pos: { ...f.course.pos }, label: f.course.label, reason: f.course.reason };
  return null;
}
export function heliosCampaignChoices(s, stationId) {
  const f = heliosCampaignStage(s, stationId);
  if (!f) return [];
  return [{ id: FILE, label: f.stage === 'scale_return' ? 'Show the Scale 4 reading.'
    : f.stage.startsWith('alloy') ? 'What comes after the withheld payment?' : 'What about Contract 47-A?' },
  ...(!originalKept(s) && !f.stage.startsWith('scale')
    ? [{ id: ORIGINAL, label: 'Leave the old weight on my copy.' }] : [])];
}
export function heliosCampaignReply(s, stationId, choiceId) {
  if (![FILE, ORIGINAL].includes(choiceId)) return null;
  const f = heliosCampaignStage(s, stationId);
  if (!f) return { text: 'Kessler closes the file. “That copy is out of date. Bring me the current contract.”' };
  const kept = originalKept(s);
  const opening = choiceId === ORIGINAL
    ? '“The old figure stays on your copy. A note, not a payment.” Kessler puts his thumb on the seal twice. '
    : kept ? 'Kessler keeps the old figure uncovered. “You asked me to leave it there.” '
      : paidFirstShift(s) ? 'Kessler draws a second file out from under the paid cutting ticket. '
        : 'Kessler draws the next posting out from under the receiving slip. ';
  let text;
  switch (f.stage) {
    case 'sample_outbound':
      text = '“The iron job paid for your cut. This is Contract 47-A: a marked mass-variance sample, not another iron quota. 12.4 tonnes on the acceptance line. Vale’s authorization, reference 44-C. Mine the marked source in Helios Prime and bring the recovered sample back here. Your Mission Log has the fix. The contract promises no immediate payout; do not spend money you have not been paid.”'; break;
    case 'sample_return':
      text = f.mission.params.skimResolved === true
        ? '“The sample recovery is recorded. So is the Skim: 12.4 tonnes, escorts lost. Those are separate entries. Re-dock at Helios so the receiving desk can close the contract. I cannot clear the payment from this chair.”'
        : '“Sample recovery is recorded. Bring the contract through the Helios receiving desk. If you were already berthed when the record changed, launch and re-dock. A conversation is not a delivery.”'; break;
    case 'alloy_ready':
      text = `“47-A is received. Freight payment withheld; the old file is still pending. ${paidFirstShift(s) ? 'Your cutting wages remain yours.' : 'This posting does not settle the old claim.'}” He lays another posting beside it. “${f.offer.params.qty} units of sealed alloys, loaded on acceptance. Helios to Tethys Junction, the Tycho receiving berth. ${f.offer.reward_cr} credits on this posting. Read the terms before you sign. After delivery, weigh your own freight at Scale 4. Keep that slip beside the old figure.”`; break;
    case 'alloy_outbound':
      text = '“The sealed-alloy run is already signed. Take the reserved load to Tethys Junction. Those alloys belong to the delivery; do not sell or jettison them. After the receiving handoff, Scale 4 can weigh a separate pod of your own freight. You do not need to buy the delivered load back.”'; break;
    case 'alloy_wait':
      text = '“47-A is received, freight payment withheld. The next work is the sealed-alloy run to Tethys, but I have no single current posting to put in front of you. Check Contracts. I will not write a second ticket to cover a missing one.”'; break;
    case 'scale_outbound':
      text = '“Tethys received the alloys. Now take your own fresh jettisoned cargo pod to Scale 4, beside the weigh-slip racks. The delivered alloys are gone; do not look for that same crate. Keep the pod inside the open ring, at 8 WU/s or below, until the plate reads it. Read the stamp too. Release its line and collect your freight when you are finished.”'; break;
    case 'scale_return':
      text = `“Your stamp: ${f.reading.stamp.toFixed(1)} tonnes. My plate: ${f.reading.plate.toFixed(1)}.” His thumb stops on the seal. ${kept ? '“You kept the first figure. Now you have a second document to disagree with.”' : '“Keep both figures. One is not a correction of the other.”'} “The variance is in the record. It does not release 47-A’s withheld freight payment. The next posting is the Furnace Detail at Tethys; read its armament and cargo requirements before leaving for Ceres.”`; break;
    default:
      text = '“The Scale 4 step is recorded, but I have no paired numbers on this copy. I will not invent them. The next contract is the Furnace Detail on the Tethys board.”';
  }
  return { text: opening + text, campaignHandoffAnswer: true,
    ...(f.offer ? { missionOffer: f.offer } : {}),
    ...(actionFor(s, f) ? { campaignHandoff: actionFor(s, f) } : {}) };
}
export function heliosCampaignActionCurrent(s, stationId, action) {
  const current = actionFor(s, heliosCampaignStage(s, stationId));
  return !!(action && current && JSON.stringify(action) === JSON.stringify(current));
}
export function takeHeliosCampaignAction(ctx, stationId, action) {
  if (!ctx?.bus?.emit || !heliosCampaignActionCurrent(ctx.state, stationId, action)
    || action.kind === 'offer') return false;
  if (action.kind === 'mission') {
    ctx.bus.emit('ui:trackMission', { missionId: action.missionId });
    ctx.bus.emit('ui:pushScreen', { id: 'missionLog', source: 'station-bar' });
  } else {
    ctx.bus.emit('ui:setCourse', { pos: { ...action.pos }, sectorId: action.sectorId,
      label: action.label, reason: action.reason, autopilot: false, source: 'station-bar:kessler' });
  }
  return true;
}
