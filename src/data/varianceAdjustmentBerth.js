// Ambient VARIANCE ADJUSTMENT berth at Vesta Forge. This is a static inspection ship,
// not a player purchase, reward hull, or proof of the bespoke Tessera shell/weld animation.
export const VARIANCE_ADJUSTMENT_BERTH = Object.freeze({
  actorId: 'variance_adjustment_berth',
  sectorId: 'sector_vesta_forge',
  stationId: 'station_vesta_outlying_yard',
  shipDefId: 'ship_hawser',
  hullDefId: 'ship_hawser',
  worldRecordId: 'vesta:variance-adjustment:berth',
  identityKey: 'variance-adjustment:vesta-forge:outlying-yard',
  persistenceOwner: 'varianceAdjustmentBerth',
  displayName: 'VARIANCE ADJUSTMENT',
  callsign: 'VARIANCE ADJUSTMENT',
  hullRadiusWu: 22,
  berthSlackWu: 40,
  nearbyBodyMarginWu: 6,
  slateColumnMarginWu: 8,
  storyFlags: Object.freeze({
    seen: 'variance_adjustment_berth_seen',
    lost: 'variance_adjustment_berth_lost',
  }),
  arrivalLine: 'VARIANCE ADJUSTMENT is moored off the yard apron. Hail to read its registry.',
  statusLine: 'STATUS · INSPECTION HOLD · Slate’s ledger pillar is across the yard. A repair restoring at least 8 hull adds one to its readout; refuel and smaller patches do not.',
  identifyLine: 'IDENTIFY · WORKSHOP RECORD · TESSERA-VARIANT · RASK → BIMA → SLATE. The record describes the doubled seam holding through three pressure spikes, then failing at four.',
});

export function isVarianceAdjustmentBerthEntity(entity) {
  const d = entity?.data;
  return !!(entity?.type === 'ship' && entity.alive !== false && entity.isPlayer !== true
    && d?.varianceAdjustmentId === VARIANCE_ADJUSTMENT_BERTH.actorId
    && d?.worldRecordId === VARIANCE_ADJUSTMENT_BERTH.worldRecordId
    && d?.identityKey === VARIANCE_ADJUSTMENT_BERTH.identityKey
    && d?.persistenceOwner === VARIANCE_ADJUSTMENT_BERTH.persistenceOwner
    && d?.defId === VARIANCE_ADJUSTMENT_BERTH.shipDefId
    && d?.hullDefId === VARIANCE_ADJUSTMENT_BERTH.hullDefId);
}

