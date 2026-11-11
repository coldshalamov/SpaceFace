// Book 6's crewed charter is a one-use service, not an autonomous-fleet tech unlock.
// Pure admission and receipt reads. Automation owns the purchase; story owns the annotation.
import { TRADERS } from '../data/automation.js';
import { normalizePatrolObservations, patrolPaperworkComparison } from './patrolPaperwork.js';
export const SEED_CHARTER_STATION = 'station_beltout';
export const SEED_CHARTER_SECTOR = 'sector_ceres_belt';
export const SEED_CHARTER_DEF = 'trader_hauler_l';
const definition = () => TRADERS.find(row => row.id === SEED_CHARTER_DEF);
const validId = id => Number.isSafeInteger(id) && id > 0
  || typeof id === 'string' && /^[A-Za-z0-9_:-]{1,80}$/.test(id);

export function normalizeSeedCharter(row) {
  if (!row || row.version !== 1 || !validId(row.assetId)
    || row.defId !== SEED_CHARTER_DEF || row.stationId !== SEED_CHARTER_STATION
    || !Number.isFinite(row.issuedAt) || row.issuedAt < 0
    || !Number.isFinite(row.costCr) || row.costCr <= 0) return null;
  return { version: 1, assetId: row.assetId, defId: row.defId,
    stationId: row.stationId, issuedAt: row.issuedAt, costCr: row.costCr };
}

export function seedCharterOffer(state) {
  const story = state?.story, a = state?.automation;
  // A damaged/unknown saved admission still spends this one-use offer. Never reset it to reissue.
  if (story?.beatIndex !== 6 || story.flags?.beat_5_done !== true
    || story.flags?.empire_seed_complete || a?.meta?.seedCharter != null
    || ['drones', 'traders', 'outposts'].some(key => a?.[key]?.length)) return null;
  const def = definition();
  const atDesk = state.ui?.docked === true && state.ui.dockedStationId === SEED_CHARTER_STATION
    && state.world?.currentSectorId === SEED_CHARTER_SECTOR;
  return { costCr: def.hireCost, upkeepPerMin: def.upkeepPerMin, cycleTime: def.cycleTime,
    atDesk, affordable: Number(state.player?.credits) >= def.hireCost };
}

export function seedCharterPaidReceipt(state, event) {
  const charter = normalizeSeedCharter(state?.automation?.meta?.seedCharter);
  if (!charter || event?.kind !== 'trader' || event.id !== charter.assetId
    || event.defId !== charter.defId) return null;
  const trader = state.automation.traders?.find(row => row.id === charter.assetId && row.defId === charter.defId);
  const receipt = trader?.lastReceipt;
  if (!receipt || receipt.result !== 'paid' || !(Number.isFinite(receipt.credited) && receipt.credited > 0)
    || !Number.isSafeInteger(receipt.n) || receipt.n < 1 || trader.cycles !== receipt.n
    || ['n', 'from', 'to', 'good', 'credited', 'result'].some(key => receipt[key] !== event.receipt?.[key])) return null;
  return { version: 1, assetId: charter.assetId, cycle: receipt.n,
    amount: receipt.credited, from: receipt.from, to: receipt.to, good: receipt.good,
    at: Math.max(0, Number(state.simTime) || 0), clearingName: 'VALE HOLDINGS LLC' };
}

export function seedRemittanceComparison(state) {
  if (patrolPaperworkComparison(state)) return 'Both wreck labels name Vale Holdings. So does this payment. The records are still sealed.';
  const rows = normalizePatrolObservations(state?.aftermathWrecks?.patrolObservations);
  if (rows.cap_sable_iask || rows.cap_redcut_sorrel) return 'The wreck label you read names Vale Holdings. So does this payment. The records are still sealed.';
  return 'This is the clearing name on your payment, not a record of what the cargo contained.';
}

export function seedCharterRecord(state) {
  const charter = normalizeSeedCharter(state?.automation?.meta?.seedCharter);
  if (!charter) return null;
  const trader = state.automation.traders?.find(row => row.id === charter.assetId && row.defId === charter.defId);
  const receipt = state.story?.flags?.seed_charter_remittance;
  const paid = receipt?.version === 1 && receipt.assetId === charter.assetId
    && Number.isSafeInteger(receipt.cycle) && receipt.cycle > 0
    && Number.isFinite(receipt.amount) && receipt.amount > 0 && receipt.clearingName === 'VALE HOLDINGS LLC';
  const status = trader ? 'The crewed Hauler remains on your books.'
    : 'The Hauler is no longer on your books. The charter fee is not refunded; this first-charter offer is spent.';
  const boundary = state.story?.flags?.weighing_receipt?.outcome === 'cleared_unverified'
    ? ' The Weighing remains unverified.' : '';
  return { title: paid ? 'First remittance · Vale Holdings' : 'Belt Outpost · crewed charter',
    body: paid ? `${receipt.amount.toLocaleString()} cr reached your wallet on cycle ${receipt.cycle}. Clearing: VALE HOLDINGS LLC. ${seedRemittanceComparison(state)}${boundary} ${status}`
      : `${charter.costCr.toLocaleString()} cr paid for one crewed Hauler. No research was unlocked. ${status} ${trader ? 'The first paid cycle is still pending. Read the cycle receipt below; reroute if there is no spread. Upkeep and loss risk remain yours.' : 'No paid charter receipt has been recorded.'}` };
}
