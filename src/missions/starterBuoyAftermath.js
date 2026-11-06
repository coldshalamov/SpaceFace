// A short station receiving scene tied to the physical settlement receipt for the authored
// Pelican buoy tickets. This is presentation provenance, not a repaired-lane flag or reward.
export const FIRST_BUOY_RECEIVING_WINDOW_S = 180;

const PELICAN_BUOY_STEPS = new Set([1, 2, 3]);

export function firstBuoyReceiptFields(mission, outcome) {
  const params = mission && mission.params;
  if (outcome !== 'completed' || mission?.source !== 'starterJob' || mission.type !== 'tow_recovery'
    || mission.destStationId !== 'station_helios' || mission.destSectorId !== 'sector_helios_prime'
    || params?.starterWorkdayVersion !== 1 || params.starterJobId !== 'starter_pelican'
    || !PELICAN_BUOY_STEPS.has(params.starterStep) || params.requiredModule !== 'mod_winch_hd'
    || !['tow_in', 'sling_in'].includes(params.completionMethod)) return {};

  return {
    starterBuoyRecovery: {
      version: 1,
      jobId: 'starter_pelican',
      step: params.starterStep,
      completionMethod: params.completionMethod,
    },
  };
}

export function firstBuoyReceivingReceipt(state, now) {
  if (state?.run?.kind === 'survival' || state?.world?.currentSectorId !== 'sector_helios_prime'
    || !Number.isFinite(now)) return null;
  const receipts = state.missions?.receipts;
  if (!Array.isArray(receipts)) return null;

  let latest = null;
  for (const receipt of receipts.slice(0, 10)) {
    const marker = receipt?.starterBuoyRecovery;
    if (!receipt || typeof receipt.missionId !== 'string' || !receipt.missionId
      || receipt.outcome !== 'completed' || receipt.source !== 'starterJob' || receipt.type !== 'tow_recovery'
      || receipt.destStationId !== 'station_helios' || receipt.destSectorId !== 'sector_helios_prime'
      || marker?.version !== 1 || marker.jobId !== 'starter_pelican' || !PELICAN_BUOY_STEPS.has(marker.step)
      || !['tow_in', 'sling_in'].includes(marker.completionMethod)
      || !Number.isFinite(receipt.rewardCr) || receipt.rewardCr <= 0
      || !Number.isFinite(receipt.at_s) || receipt.at_s < 0 || now < receipt.at_s
      || now >= receipt.at_s + FIRST_BUOY_RECEIVING_WINDOW_S) continue;

    if (!latest || receipt.at_s > latest.at_s
      || (receipt.at_s === latest.at_s && receipt.missionId < latest.missionId)) latest = receipt;
  }
  return latest;
}

export function firstBuoyReceivingItem(state, station, now) {
  if ((station?.data?.stationId ?? station?.stationId ?? station?.id) !== 'station_helios'
    || station.id == null || station.alive === false || !station.pos) return null;
  const receipt = firstBuoyReceivingReceipt(state, now);
  if (!receipt) return null;

  return {
    eventId: `sse:44c-receiving:${receipt.missionId}`,
    kind: 'repair_drone',
    budget: 0,
    path: 'hull-crawl',
    bearing: 0,
    dueAt: now,
    durationS: Math.min(90, receipt.at_s + FIRST_BUOY_RECEIVING_WINDOW_S - now),
    sectorId: 'sector_helios_prime',
    stationId: String(station.id),
    receivingMissionId: receipt.missionId,
  };
}
