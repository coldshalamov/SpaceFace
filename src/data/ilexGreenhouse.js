import { ILEX_ARK, ILEX_VAULT_IDS, validIlexOutcome } from './ilexArk.js';

const sameLines = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((id, i) => id === b[i]);
const atOrBefore = (at, now) => Number.isFinite(at) && at >= 0 && at <= now;

/** Bounded, read-only aftermath of the existing accepted voyage and committed owners. */
export function projectIlexGreenhouse(state) {
  const voyage = state?.ilexArk, receipt = voyage?.settlement, now = state?.simTime;
  if (voyage?.phase !== 'settled' || !validIlexOutcome(receipt)
    || !Number.isFinite(now) || !atOrBefore(receipt.at, now)
    || !ILEX_VAULT_IDS.every(id => ['delivered', 'destroyed', 'lost'].includes(voyage.vaults?.[id]?.status))) return null;
  const arrived = ILEX_VAULT_IDS.filter(id => voyage.vaults[id].status === 'delivered');
  if (!sameLines(arrived, receipt.deliveredVaultIds)) return null;
  const key = `${receipt.id}:first-harvest`;
  const committed = state.economy?.committedIntents?.[key], harvest = committed?.result;
  const harvested = validIlexOutcome(committed?.receipt)
    && committed.receipt.at === receipt.at
    && sameLines(committed.receipt.deliveredVaultIds, arrived)
    && harvest?.receiptId === key && harvest.stationId === ILEX_ARK.stationId
    && harvest.commodityId === 'cmdty_food' && sameLines(harvest.deliveredVaultIds, arrived)
    && harvest.qty === arrived.length * ILEX_ARK.provisionsPerVault
    && atOrBefore(harvest.at, now) && harvest.at >= receipt.harvestAt;
  const reward = state.missions?.ilexArkReward;
  const credited = reward?.receiptId === receipt.id && sameLines(reward.deliveredVaultIds, arrived)
    && Number.isSafeInteger(reward.creditedCr) && reward.creditedCr >= 0 && reward.creditedCr <= receipt.rewardCr
    && atOrBefore(reward.at, now) && reward.at >= receipt.at;
  return { deliveredVaultIds: [...arrived], harvested: !!harvested,
    harvestQty: harvested ? harvest.qty : 0, creditedCr: credited ? reward.creditedCr : null };
}

export function ilexGreenhouseFor(state) {
  // Authority reads its accepted voyage; the station facade gets only this finite view.
  if (state?.ilexArk !== undefined) return projectIlexGreenhouse(state);
  return state?.ilexGreenhousePublic || null;
}

export function ilexGreenhouseReply(state) {
  const planting = ilexGreenhouseFor(state);
  if (!planting) return null;
  const n = planting.deliveredVaultIds.length;
  const lines = n === 0
    ? 'No Ilex vault arrived. There is no planting or first harvest from this voyage.'
    : n === ILEX_VAULT_IDS.length
      ? 'All six Ilex seed lines were accepted for the Ceres greenhouse.'
      : `${n}/6 Ilex seed lines were accepted for the Ceres greenhouse. The ${ILEX_VAULT_IDS.length - n} missing lines cannot be replaced.`;
  const crop = !n ? '' : planting.harvested
    ? ` The recorded first harvest added ${planting.harvestQty}u Provisions to the Ceres market. Check the Market for current availability; those provisions may already have been traded.`
    : ' No first harvest from these lines is recorded yet.';
  const payment = planting.creditedCr === null ? '' : ` The filed voyage credited you ${planting.creditedCr} cr.`;
  return lines + crop + payment;
}
