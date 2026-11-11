// inf-closed-file-board — the contracts board names the last file you lost: why it closed, what it
// cost, and where the next try is.
//
// missions.js is the single writer of the settled-file record: every failed, expired or abandoned
// contract leaves a receipt in `state.missions.receipts` (newest first) carrying its reason, the
// stake it forfeited, the standing it cost, and — when PQ-138.04 mutated the failure into a live
// successor — the refiled leg's id. The toast and the debrief popup fire once, mid-flight, and are
// gone; the board's "Yours" column then read "No active missions" as if nothing had happened.
//
// This read is pure over that owner's receipts and the live active list / board. It writes nothing,
// claims no cause the receipt does not carry, and names a next try only when one is really there
// (a refiled leg in Yours, an authored recovery on a set-piece receipt, the same house's work on
// this board). A newer completion, or a file older than the record window, reads nothing.
import { localizeText } from '../../localization/sourceText.js';
import { FACTION_META } from '../../data/factions.js';

/** The opening recovery is installed, not accepted. Its receipt keeps the offer id and drops the tag. */
const COLD_START_OFFER_ID = 'contract_47a_b0_recovery';
/** Three ledger days (600 s each): past that the board's record has moved on. */
export const CLOSED_FILE_WINDOW_S = 1800;

const FACTION_SHORT = new Map((FACTION_META || []).map((f) => [f.id, f.short || f.name || '']));

/** A campaign beat installed at the start is not the player pressing Accept.
 *  Reads both shapes the record takes: a live mission (`id`) and a settled receipt (`missionId`). */
export function isPlayerDeskJob(mission) {
  if (!mission) return false;
  const tag = typeof mission.storyTag === 'string' ? mission.storyTag : '';
  if (tag.startsWith('campaign47a:')) return false;
  const offerId = typeof mission.sourceOfferId === 'string' ? mission.sourceOfferId : '';
  if (offerId === COLD_START_OFFER_ID) return false;
  for (const key of ['id', 'missionId']) {
    const id = typeof mission[key] === 'string' ? mission[key] : '';
    if (id === COLD_START_OFFER_ID || id.startsWith(`${COLD_START_OFFER_ID}:`)) return false;
  }
  return true;
}

function whole(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** Why the file closed, in the receipt's own reason vocabulary. Unknown reasons read generically. */
export function closedFileCause(outcome, reason) {
  const r = String(reason || '');
  if (outcome === 'expired' || r === 'deadline') return localizeText('The deadline passed before you delivered.');
  if (r === 'abandoned') return localizeText('You walked away from it.');
  if (r === 'target_lost') return localizeText('Someone else destroyed the mark before you closed in.');
  if (r === 'failed_external') return localizeText('Someone else destroyed what the job needed.');
  if (r === 'escort_abandoned') return localizeText('The convoy was left outside your escort cover.');
  if (r === 'escortee_lost') return localizeText('The ship you were escorting was destroyed.');
  if (r === 'ship_lost' || r === 'hull_destroyed') return localizeText('Your ship went down with the job aboard.');
  if (r === 'busted') return localizeText('A customs scan found the cargo.');
  if (r === 'passenger_transport_destroyed') return localizeText('The passengers were lost.');
  if (['pods_lost', 'payload_destroyed', 'speed_payload_lost', 'all_lots_lost', 'seed_asset_lost', 'core_lost'].includes(r)) {
    return localizeText('The cargo was lost before delivery.');
  }
  if (r.startsWith('clause_broken:')) return localizeText('A contract clause was broken.');
  if (r.startsWith('race_')) return localizeText('The run broke the course rules.');
  if (r.startsWith('wake_')) return localizeText('The handoff on the wake failed.');
  if (r.startsWith('spine_break_')) return localizeText('The salvage could not be recovered.');
  return localizeText('The contract failed.');
}

/** What it cost, from the settlement the receipt captured. A void says so instead of a charge. */
export function closedFileCost(receipt) {
  const lost = Math.max(0, whole(receipt && receipt.collateralLostCr));
  const refunded = Math.max(0, whole(receipt && receipt.collateralRefundCr));
  const rep = whole(receipt && receipt.repDelta);
  const reason = String(receipt && receipt.reason || '');
  const voided = reason === 'target_lost' || reason === 'failed_external';
  if (voided && rep >= 0 && lost === 0) {
    return refunded > 0
      ? localizeText('Voided, not your fault: {amount} cr deposit refunded and no standing lost.', { amount: refunded.toLocaleString('en-US') })
      : localizeText('Voided, not your fault: no standing lost.');
  }
  const house = FACTION_SHORT.get(receipt && receipt.factionId) || '';
  const amount = lost.toLocaleString('en-US');
  if (lost > 0 && rep < 0 && house) {
    return localizeText('It cost you a {amount} cr stake and {delta} {house} standing.', { amount, delta: rep, house: house.toUpperCase() });
  }
  if (lost > 0) return localizeText('It cost you a {amount} cr stake.', { amount });
  if (rep < 0 && house) return localizeText('It cost you {delta} {house} standing.', { delta: rep, house: house.toUpperCase() });
  return localizeText('It cost you nothing but the time.');
}

function boardSlots(state, stationId) {
  const boards = state && state.missions && state.missions.boards;
  const board = boards && stationId ? boards[stationId] : null;
  return board && Array.isArray(board.slots) ? board.slots.filter(Boolean) : [];
}

/** Where the next try is — only a next that really exists. Null when there is none to name. */
export function closedFileNext(state, receipt, stationId) {
  const active = state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  const successorId = receipt && receipt.mutatedToMissionId != null ? String(receipt.mutatedToMissionId) : '';
  if (successorId) {
    const successor = active.find((m) => m && String(m.id) === successorId && (m.status == null || m.status === 'active'));
    const title = successor && cleanText(successor.title);
    if (title) return localizeText('The client refiled it as {title}. It is in Yours.', { title });
  }
  const recovery = cleanText(receipt && receipt.recoveryText);
  if (recovery) return recovery;
  const factionId = receipt && receipt.factionId;
  const house = FACTION_SHORT.get(factionId) || '';
  if (factionId && house) {
    const same = boardSlots(state, stationId).filter((offer) => offer.factionId === factionId).length;
    if (same === 1) return localizeText('{house} has 1 more job on this board.', { house });
    if (same > 1) return localizeText('{house} has {count} more jobs on this board.', { house, count: same });
  }
  return null;
}

/**
 * The board's read of the last file the pilot lost, or null.
 *
 * @returns {null|{ missionId: string, outcome: 'failed'|'expired', voided: boolean,
 *   title: string, cause: string, cost: string, next: string|null }}
 */
export function closedFileRead(state, stationId) {
  const receipts = state && state.missions && Array.isArray(state.missions.receipts) ? state.missions.receipts : [];
  const newest = receipts.find((r) => r && isPlayerDeskJob(r));
  if (!newest) return null;
  if (newest.outcome !== 'failed' && newest.outcome !== 'expired') return null;
  // Settlement bookkeeping, not a loss the pilot can learn from.
  if (newest.reason === 'disposition_filed' || newest.reason === 'obligation_already_settled') return null;
  const now = Number(state && state.simTime) || 0;
  const at = Number(newest.at_s);
  if (Number.isFinite(at) && now - at > CLOSED_FILE_WINDOW_S) return null;
  const title = cleanText(newest.title) || localizeText('Your last contract');
  const reason = String(newest.reason || '');
  return {
    missionId: String(newest.missionId || ''),
    outcome: newest.outcome,
    voided: reason === 'target_lost' || reason === 'failed_external',
    title,
    cause: closedFileCause(newest.outcome, reason),
    cost: closedFileCost(newest),
    next: closedFileNext(state, newest, stationId),
  };
}
