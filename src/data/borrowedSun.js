export const BORROWED_SUN = Object.freeze({
  carrierId: 'borrowed_sun', stationId: 'station_borrowed_sun', owner: 'borrowedSun',
  assetId: 'SF_STATION_BORROWED_SUN', deployTicks: 720, openTicks: 36000,
  foldTicks: 600, transitTicks: 7200, hailRange: 600, radius: 110,
  services: Object.freeze(['trade', 'refuel', 'repair']),
  showcase: Object.freeze(['cmdty_food', 'cmdty_electronics', 'cmdty_comp_hullplate']),
});
// These are safe fixed berths, not a path or permission to move an occupied station.
export const BORROWED_SUN_BERTHS = Object.freeze([
  Object.freeze({ sectorId: 'sector_tethys_junction', local: Object.freeze({ x: -250, z: 1600 }), name: 'Tethys quiet berth' }),
  Object.freeze({ sectorId: 'sector_ceres_belt', local: Object.freeze({ x: -2150, z: -1280 }), name: 'Ceres south berth' }),
]);
export const BORROWED_SUN_PHASES = Object.freeze(['arrive', 'deploy', 'open', 'close_pending', 'fold', 'transit', 'lost']);
export function freshBorrowedSun() {
  return { schema: 1, carrierId: BORROWED_SUN.carrierId, visitId: 1, itineraryLeg: 0,
    phase: 'arrive', phaseStartTick: 0, deadlineTick: null, serviceAnchorId: BORROWED_SUN.stationId,
    introduced: false, firstServiceVisit: false, lost: false, arrivalNoticeVisit: 0,
    closingNoticeVisit: 0, lastTrade: null };
}
export function normalizeBorrowedSun(raw, tick = 0) {
  const r = freshBorrowedSun();
  if (raw?.schema !== 1 || raw.carrierId !== r.carrierId) return r;
  const integer = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= max;
  r.visitId = integer(raw.visitId) && raw.visitId > 0 ? raw.visitId : 1;
  r.itineraryLeg = integer(raw.itineraryLeg, 1) ? raw.itineraryLeg : 0;
  r.phase = BORROWED_SUN_PHASES.includes(raw.phase) ? raw.phase : 'arrive';
  r.phaseStartTick = integer(raw.phaseStartTick) && raw.phaseStartTick <= tick ? raw.phaseStartTick : tick;
  r.deadlineTick = integer(raw.deadlineTick) ? raw.deadlineTick : null;
  if (r.deadlineTick != null && r.deadlineTick < r.phaseStartTick) r.deadlineTick = r.phaseStartTick;
  for (const key of ['introduced', 'firstServiceVisit', 'lost']) r[key] = raw[key] === true;
  if (r.lost || r.phase === 'lost') { r.lost = true; r.phase = 'lost'; r.deadlineTick = null; }
  r.arrivalNoticeVisit = integer(raw.arrivalNoticeVisit, r.visitId) ? raw.arrivalNoticeVisit : 0;
  r.closingNoticeVisit = integer(raw.closingNoticeVisit, r.visitId) ? raw.closingNoticeVisit : 0;
  const t = raw.lastTrade;
  if (t && typeof t.receiptId === 'string' && t.receiptId.length <= 160
    && ['buy', 'sell'].includes(t.side) && Number.isFinite(t.qty) && t.qty > 0
    && typeof t.commodityId === 'string' && integer(t.visitId, r.visitId)) r.lastTrade = { ...t };
  return r;
}
