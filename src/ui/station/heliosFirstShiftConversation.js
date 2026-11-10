// The first shift ends at the same desk that posted it. Read canonical ticket,
// cargo and trade receipts; never turn a conversation into a second settlement.
import { activeOwnedShip } from '../../data/starterJobs.js';
import { sellableCargoQuantity } from '../../systems/cargoReadModel.js';
import {
  kesslerStarterWorkChoice as localWorkChoice,
  kesslerStarterWorkReply as localWorkReply,
} from './starterWorkdayConversation.js';

const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';
const IRON = 'cmdty_ore_iron';
const CHOICE = 'helios_local_work';
const integer = n => Number.isSafeInteger(n) && n >= 0;

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
  const original = localWorkChoice(state, stationId);
  return original && firstShiftReceipt(state, stationId)
    ? { ...original, label: 'About my first iron ticket.' } : original;
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
  return { text: `${pay} ${stock} ${sold} ${next}`, firstShiftReceipt: receipt.id,
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
