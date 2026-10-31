// A short receiving operation, not a repaired-lane flag or another mission owner.
// Revision 1 is deliberate: a future authored buoy must qualify on its own evidence.
export const FIRST_BUOY_RECEIVING_WINDOW_S = 180;

export function firstBuoyReceiptFields(m, outcome) {
  const p = m?.params;
  if (outcome !== 'completed' || m?.source !== 'starterJob' || m.type !== 'tow_recovery'
    || m.destStationId !== 'station_helios' || m.destSectorId !== 'sector_helios_prime'
    || p?.starterWorkdayVersion !== 1 || p.starterJobId !== 'starter_pelican'
    || p.starterStep !== 1 || p.requiredModule !== 'mod_winch_hd'
    || !['tow_in', 'sling_in'].includes(p.completionMethod)) return {};
  return { starterBuoyRecovery: { version: 1, jobId: 'starter_pelican', step: 1,
    completionMethod: p.completionMethod } };
}

export function firstBuoyReceivingReceipt(state, now) {
  // Campaign receiving stays excluded until the run owner clears survival, even after it ends.
  if (state?.run?.kind === 'survival') return null;
  if (state?.world?.currentSectorId !== 'sector_helios_prime' || !Number.isFinite(now)) return null;
  const receipts = state.missions?.receipts;
  if (!Array.isArray(receipts)) return null;
  // The canonical recent-receipt owner caps this at ten; bound malformed inputs too.
  for (const r of receipts.slice(0, 10)) {
    const marker = r?.starterBuoyRecovery;
    if (!r || typeof r.missionId !== 'string' || !r.missionId
      || r.outcome !== 'completed' || r.source !== 'starterJob' || r.type !== 'tow_recovery'
      || r.destStationId !== 'station_helios' || r.destSectorId !== 'sector_helios_prime'
      || marker?.version !== 1 || marker.jobId !== 'starter_pelican' || marker.step !== 1
      || !['tow_in', 'sling_in'].includes(marker.completionMethod)
      || !Number.isFinite(r.rewardCr) || r.rewardCr <= 0
      || !Number.isFinite(r.at_s) || r.at_s < 0 || now < r.at_s
      || now >= r.at_s + FIRST_BUOY_RECEIVING_WINDOW_S) continue;
    return r;
  }
  return null;
}

export function firstBuoyReceivingItem(state, station, now) {
  if ((station?.data?.stationId ?? station?.stationId ?? station?.id) !== 'station_helios'
    || station.id == null || station.alive === false || !station.pos) return null;
  const receipt = firstBuoyReceivingReceipt(state, now);
  if (!receipt) return null;
  return { eventId: `sse:44c-receiving:${receipt.missionId}`, kind: 'repair_drone',
    budget: 0, path: 'hull-crawl', bearing: 0, dueAt: now,
    durationS: Math.min(90, receipt.at_s + FIRST_BUOY_RECEIVING_WINDOW_S - now),
    sectorId: 'sector_helios_prime', stationId: String(station.id),
    receivingMissionId: receipt.missionId };
}
