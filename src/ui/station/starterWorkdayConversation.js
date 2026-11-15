import { firstBuoyReceivingReceipt } from '../../missions/starterBuoyAftermath.js';
import { heliosCampaignStage } from './heliosCampaignHandoff.js';
import { sellableCargoQuantity } from '../../systems/cargo.js';
import {
  activeOwnedShip,
  shipCarriesModule,
  starterJobForShip,
  starterJobStepsDone,
} from '../../data/starterJobs.js';

const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';
const IRON = 'cmdty_ore_iron';
const CHOICE = 'helios_local_work';
const integer = n => Number.isSafeInteger(n) && n >= 0;
const WORK = Object.freeze({
  starter_hitch: Object.freeze({ name: 'Hitch', tool: 'Drill Amp' }),
  starter_pelican: Object.freeze({ name: 'Pelican', tool: 'Heavy-Duty Winch' }),
  starter_wasp: Object.freeze({ name: 'Wasp', tool: 'Ram Plate' }),
});

function atDesk(state, stationId) {
  return stationId === STATION
    && state?.ui?.docked === true
    && state.ui.dockedStationId === STATION;
}

function starterTickets(state) {
  const active = Array.isArray(state?.missions?.active) ? state.missions.active : [];
  return active.filter((mission) => mission?.status === 'active'
    && Object.prototype.hasOwnProperty.call(WORK, mission?.params?.starterJobId));
}

function currentPosting(state, job, step) {
  const slots = state?.missions?.boards?.[STATION]?.slots;
  if (!Array.isArray(slots)) return null;
  const exact = slots.filter((mission) => mission
    && mission.source === 'starterJob'
    && mission.params?.starterJobId === job.id
    && mission.params?.starterStep === step.step
    && mission.params?.requiredModule === job.requiredModule
    && mission.type === step.type
    && mission.destStationId === STATION
    && mission.destSectorId === SECTOR
    && typeof mission.id === 'string'
    && mission.id.trim()
    && typeof mission.title === 'string'
    && mission.title.trim()
    && typeof mission.brief === 'string'
    && mission.brief.trim());
  // A dialogue must not choose between duplicate or stale board rows.
  return exact.length === 1 ? exact[0] : null;
}

// The first shift ends at the same desk that posted it. Read canonical ticket,
// cargo and trade receipts; never turn a conversation into a second settlement.
export function firstShiftReceipt(state, stationId) {
  if (stationId !== STATION || !state?.ui?.docked || state.ui.dockedStationId !== STATION
    || state.world?.currentSectorId !== SECTOR || state.save?.restoring
    || state.run?.kind && !['adventure', 'campaign'].includes(state.run.kind)
    || !Number.isFinite(state.simTime) || activeOwnedShip(state)?.defId !== 'ship_kestrel') return null;
  const done = state.missions?.starterJobStep?.starter_hitch ?? 0;
  const active = state.missions?.active;
  if (![0, 1].includes(done) || !Array.isArray(state.missions?.receipts)
    || (active != null && !Array.isArray(active))
    || active?.some(m => m?.status === 'active'
      && m.params?.starterJobId === 'starter_hitch' && m.params.starterStep === 1)) return null;
  const rows = state.missions.receipts.filter(r => r?.source === 'starterJob'
    && r.sourceOfferId === 'starter-starter_hitch-1' && r.type === 'mining_quota'
    && r.stationId === STATION && r.destStationId === STATION && r.destSectorId === SECTOR
    && typeof r.missionId === 'string' && r.missionId.trim()
    && r.id === `${r.missionId}:${r.outcome}` && Number.isFinite(r.at_s)
    && r.at_s >= 0 && r.at_s <= state.simTime && integer(r.rewardCr)
    && ['completed', 'failed', 'expired', 'abandoned'].includes(r.outcome));
  rows.sort((a, b) => b.at_s - a.at_s);
  const receipt = rows[0];
  if (!receipt || rows.filter(r => r.at_s === receipt.at_s).length !== 1
    || state.missions.receipts.filter(r => r?.missionId === receipt.missionId).length !== 1
    || (done === 1 ? receipt.outcome !== 'completed' || receipt.rewardCr <= 0
      : receipt.outcome === 'completed' || receipt.rewardCr !== 0)) return null;
  return receipt;
}

function latestIronSale(state, receipt) {
  const ledger = state.player?.tradeLedger;
  if (!Array.isArray(ledger)) return null;
  const rows = ledger.filter(r => r?.stationId === STATION && r.commodityId === IRON
    && r.side === 'sell' && typeof r.receiptId === 'string' && r.receiptId.trim()
    && integer(r.tradeSequence) && r.tradeSequence > 0 && integer(r.qty) && r.qty > 0
    && integer(r.total) && r.total > 0 && Number.isFinite(r.seenAt)
    && r.seenAt > receipt.at_s && r.seenAt <= state.simTime
    && ledger.filter(other => other?.receiptId === r.receiptId
      || other?.tradeSequence === r.tradeSequence).length === 1);
  return rows.sort((a, b) => b.tradeSequence - a.tradeSequence)[0] || null;
}

function marketSlip(state, receipt) {
  const free = sellableCargoQuantity(state, IRON);
  return integer(free) && free > 0 ? { receiptId: receipt.id, at_s: receipt.at_s,
    outcome: receipt.outcome, freeIron: free } : null;
}

export function kesslerStarterWorkChoice(state, stationId) {
  return atDesk(state, stationId)
    ? { id: CHOICE, label: firstShiftReceipt(state, stationId)
        ? 'About my first iron ticket.' : 'Any local work for my ship?' }
    : null;
}

// Read-only presentation of the active hull's already-posted Helios ticket. The mission board,
// mission acceptance, and mission settlement owners remain authoritative for posting, fitting,
// payment, progress, and the per-hull counter.
function localWorkReply(state, stationId, choiceId) {
  if (choiceId !== CHOICE) return null;
  if (!atDesk(state, stationId)) {
    return { text: 'Come back to the Helios desk. I need the current board in front of us.' };
  }

  const ship = activeOwnedShip(state);
  const job = ship && starterJobForShip(ship.defId);
  const tickets = starterTickets(state);
  if (tickets.length > 1) {
    return { text: 'More than one local ticket is still open. Check the Mission Log before signing another.' };
  }
  const active = tickets[0] || null;
  if (active && active.params.starterJobId !== (job && job.id)) {
    const other = WORK[active.params.starterJobId];
    return { text: `You still have a ${other.name} ticket open. Changing hulls does not settle it. Check that ticket in the Mission Log before taking more local work.` };
  }
  if (!job) {
    return { text: 'No local starter ticket is assigned to this hull. Check Contracts for work your current fit can take.' };
  }

  const voice = WORK[job.id];
  const done = starterJobStepsDone(state, job.id);
  if (done > job.steps.length) {
    return { text: 'That work record does not match my ticket book. Check the Mission Log before signing another.' };
  }
  const receiving = job.id === 'starter_pelican'
    ? firstBuoyReceivingReceipt(state, state.simTime) : null;
  const buoy = receiving?.starterBuoyRecovery;
  // Read the same accepted, time-bounded receipt as the station's receiving scene. A legacy
  // step counter alone cannot invent a physical handback, nor can an older ticket speak for
  // the current book. This is dialogue only: no new receipt, scene, payment or progress.
  const handback = buoy?.step === done
    ? `Kessler turns the receiving slip toward you. “${['44-C', 'Claim-rim', 'Outer-yard'][done - 1]} buoy. ${buoy.completionMethod === 'sling_in' ? 'Sling-in' : 'Tow-in'} accepted. The berth has it now.” `
    : '';
  const memory = handback + (done
    ? `Your ${voice.name} ticket ${done} is settled. I kept the entry.`
    : `No settled ${voice.name} ticket beside your name yet.`);

  if (active) {
    return { text: `${memory} You already have a local ticket open. Track it in the Mission Log and follow that ticket’s instructions. An open ticket is not a settlement.` };
  }
  if (done === job.steps.length) {
    return { text: `${memory} The local ticket book has no later step. Other postings stay on the Contracts board.` };
  }
  if (!shipCarriesModule(ship, job.requiredModule)) {
    return { text: `${memory} This work needs your ${voice.tool} fitted. Check the ship’s fittings before taking another ticket.` };
  }

  const step = job.steps[done];
  const offer = currentPosting(state, job, step);
  if (!offer) {
    return { text: `${memory} I do not have one current next-step ticket on this board yet. Open Contracts to check the posting; an unfinished job is not a settled one.` };
  }

  return {
    text: `${memory} The Helios board has this ${voice.name} ticket: “${offer.title.trim()}.” ${offer.brief.trim()} Accept + Track if you want the posted job; the Mission Log carries its route and progress.`,
    missionOffer: offer,
  };
}

export function kesslerStarterWorkReply(state, stationId, choiceId) {
  const original = localWorkReply(state, stationId, choiceId);
  if (choiceId !== CHOICE || !original) return original;
  const receipt = firstShiftReceipt(state, stationId);
  if (!receipt) return original;
  const slip = marketSlip(state, receipt), sale = latestIronSale(state, receipt);
  const held = state.player?.cargo?.items?.[IRON] || 0;
  const pay = receipt.outcome === 'completed'
    ? `Kessler lays a finger across the first column. “Your cutting ticket: ${receipt.rewardCr} cr paid. That bought your work at the face, not the ore in your hold.”`
    : `Kessler leaves the first column uninitialled. “Your first cutting ticket is ${receipt.outcome}. No ticket pay. A half-worked face does not become a finished shift because you came home.”`;
  const stock = slip
    ? `${slip.freeIron}u free iron are still aboard. You can keep them or review a separate sale at Market.`
    : held > 0 ? 'Iron is aboard, but none is free to sell. Reserved cargo stays with its contract.'
      : 'No iron is aboard now. An empty hold by itself is not a delivery receipt.';
  const sold = sale
    ? `He turns the second slip toward you. “The latest Helios iron sale after that ticket: ${sale.qty}u for ${sale.total} cr. That stock reached the buyer. Two columns, two receipts. Keep both.”`
    : '“No later Helios iron sale is on this recent ledger. Cutting, collecting and selling are three different things.”';
  const next = original.missionOffer
    ? `The next posting is “${original.missionOffer.title}.” Read its terms below before accepting.`
    : state.missions?.active?.some(m => m?.status === 'active' && m.params?.starterJobId)
      ? 'Your next local ticket is still open. Track it in the Mission Log; this conversation does not settle it.'
      : 'Ask about local work again when the next posting and your fittings are ready.';
  const campaign = heliosCampaignStage(state, stationId)
    ? ' Kessler leaves a second file on the desk. “Ask me about 47-A when you want the other book. Another local cutting ticket will not close it.”' : '';
  return { text: `${pay} ${stock} ${sold} ${next}${campaign}`, firstShiftReceipt: receipt.id,
    ...(original.missionOffer ? { missionOffer: original.missionOffer } : {}),
    ...(slip ? { firstShiftMarket: slip } : {}) };
}

export function firstShiftMarketCurrent(state, stationId, slip) {
  const receipt = firstShiftReceipt(state, stationId);
  const current = receipt && marketSlip(state, receipt);
  return !!(slip && current && Object.keys(current).every(key => current[key] === slip[key]));
}

export function openFirstShiftMarket(ctx, stationId, slip) {
  if (!ctx?.bus?.emit || !firstShiftMarketCurrent(ctx.state, stationId, slip)) return false;
  // Navigation only. The existing Market quotes, confirms and commits the sale.
  ctx.bus.emit('station:navigate', { destination: 'market',
    options: { tradeMode: 'sell', commodityId: IRON } });
  return true;
}

