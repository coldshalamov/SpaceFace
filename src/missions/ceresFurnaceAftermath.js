// A transient inspection after the authored Ceres furnace detail settles. The physical lots and
// their settlement remain owned by the mission worksite; this read-only projection only qualifies
// that exact completed receipt for the existing station-side repair-drone scene.
export const CERES_FURNACE_INSPECTION_WINDOW_S = 180;
const RECENT_RECEIPT_LIMIT = 10;
const CERES_STATION_ID = 'station_ceres';
const CERES_SECTOR_ID = 'sector_ceres_belt';

function furnaceResult(record) {
  if (!record || record.version !== 1 || typeof record.missionId !== 'string'
    || !record.missionId.trim()
    || (Object.hasOwn(record, 'invalid') && record.invalid !== false)
    || !Array.isArray(record.lots) || record.lots.length !== 3) return null;

  const slots = [false, false, false];
  let received = 0;
  let lost = 0;
  for (const lot of record.lots) {
    if (!lot || !Number.isSafeInteger(lot.slot) || lot.slot < 0 || lot.slot >= slots.length
      || slots[lot.slot]
      || (Object.hasOwn(lot, 'received') && typeof lot.received !== 'boolean')
      || (Object.hasOwn(lot, 'lost') && typeof lot.lost !== 'boolean')) return null;
    slots[lot.slot] = true;
    const wasReceived = lot.received === true;
    const wasLost = lot.lost === true;
    // At settlement every authored slot has one and only one terminal cargo outcome.
    if (wasReceived === wasLost) return null;
    if (wasReceived) received++;
    else lost++;
  }
  if (!slots.every(Boolean) || received + lost !== 3) return null;
  return { received, lost };
}

/**
 * Read the one retired physical worksite and its exact canonical mission receipt. This never
 * calls furnaceLots (which materializes/mutates active mission state), and never consumes either
 * record. A zero-credit all-lost settlement is valid evidence of completed site clearance.
 */
export function ceresFurnaceInspectionReceipt(state, now) {
  if (state?.run?.kind === 'survival'
    || state?.world?.currentSectorId !== CERES_SECTOR_ID
    || !Number.isFinite(now)) return null;
  const ledger = state?.missions?.furnaceWorksiteAftermath;
  const result = furnaceResult(ledger);
  if (!result) return null;

  const rows = state?.missions?.receipts;
  if (!Array.isArray(rows)) return null;
  let receipt = null;
  for (const row of rows.slice(0, RECENT_RECEIPT_LIMIT)) {
    if (row?.missionId !== ledger.missionId) continue;
    // Canonical settlement de-dupes missionId+outcome. Multiple rows with this identity are an
    // ambiguous/malformed ledger, not permission to replay an older copy.
    if (receipt) return null;
    receipt = row;
  }
  if (!receipt || receipt.id !== `${ledger.missionId}:completed`
    || receipt.outcome !== 'completed' || receipt.type !== 'patrol_clear'
    || receipt.factionId !== 'faction_dmc'
    || receipt.destStationId !== CERES_STATION_ID
    || receipt.destSectorId !== CERES_SECTOR_ID
    || !Number.isFinite(receipt.rewardCr) || receipt.rewardCr < 0
    || !Number.isFinite(receipt.at_s) || receipt.at_s < 0
    || now < receipt.at_s
    || now >= receipt.at_s + CERES_FURNACE_INSPECTION_WINDOW_S) return null;

  return {
    missionId: ledger.missionId,
    at_s: receipt.at_s,
    rewardCr: receipt.rewardCr,
    received: result.received,
    lost: result.lost,
  };
}

/** Build one existing budget-free inspection scene at the actual Ceres Refinery anchor. */
export function ceresFurnaceInspectionItem(state, station, now) {
  const stationId = station?.data?.stationId ?? station?.stationId ?? station?.id;
  const stationSector = station?.data?.sectorId ?? station?.homeSectorId ?? station?.sectorId;
  if (stationId !== CERES_STATION_ID || station?.type !== 'station'
    || station.id == null || station.alive === false
    || stationSector != null && stationSector !== CERES_SECTOR_ID
    || !Number.isFinite(station.pos?.x) || !Number.isFinite(station.pos?.z)) return null;

  const receipt = ceresFurnaceInspectionReceipt(state, now);
  if (!receipt) return null;
  return {
    eventId: `sse:ceres-furnace-inspection:${receipt.missionId}`,
    kind: 'repair_drone',
    budget: 0,
    path: 'hull-crawl',
    bearing: 0,
    dueAt: now,
    durationS: Math.min(90, receipt.at_s + CERES_FURNACE_INSPECTION_WINDOW_S - now),
    sectorId: CERES_SECTOR_ID,
    stationId: String(station.id),
    ceresFurnaceMissionId: receipt.missionId,
  };
}
