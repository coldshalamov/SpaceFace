import { stableArrivalIntentId, stableManifestId } from '../economy/freightCausality.js';

const SECTOR = 'sector_helios_prime';
const STATION = 'station_helios';
const SLOT = 'helios_starter_ore_carrier';
const ROLE = 'ore_carrier';

function sameHold(a, b) {
  return a && b && a.manifestId === b.manifestId && a.freighterKey === b.freighterKey
    && a.role === b.role && a.totalQty === b.totalQty
    && JSON.stringify(a.lines) === JSON.stringify(b.lines);
}

// An optional Hail reads the traffic owner's current work leg, never a remembered entity id.
// The empty manifest is work N+1 only after accepted unload of work N. A spill retains work N
// and its lot/custody stamps, so it cannot borrow the preceding trip's relief.
export function heliosFreightHailLine(state, entity) {
  const data = entity?.data;
  if (state?.world?.currentSectorId !== SECTOR || !entity || entity.alive === false
      || entity.type !== 'ship' || entity.team !== 2 || state.entities?.get(entity.id) !== entity
      || data?.activityActorSlotId !== SLOT || data.trafficRole !== ROLE
      || typeof data.worldRecordId !== 'string' || !data.worldRecordId) return null;
  const worldRecordId = data.worldRecordId;
  const rec = state.traffic?.freighters?.find(row => row?.id === entity.id && row.role === ROLE);
  const seq = rec?.dockSeq;
  if (!rec || !Number.isSafeInteger(seq) || seq < 0
      || rec.worldRecordId != null && rec.worldRecordId !== worldRecordId
      || data.freightDockSeq != null && data.freightDockSeq !== seq) return null;
  const manifest = data.cargoManifest;
  const seed = state.meta?.seed || 1;
  if (!sameHold(manifest, rec.manifest) || manifest.role !== ROLE
      || manifest.freighterKey !== `${worldRecordId}:work:${seq}`
      || manifest.manifestId !== stableManifestId(seed, manifest.freighterKey, ROLE)
      || !Number.isSafeInteger(manifest.totalQty) || manifest.totalQty < 0
      || !Array.isArray(manifest.lines)
      || manifest.lines.some(line => !line || typeof line.commodityId !== 'string'
        || !Number.isSafeInteger(line.qty) || line.qty <= 0)
      || manifest.lines.reduce((sum, line) => sum + line.qty, 0) !== manifest.totalQty) return null;

  if (manifest.totalQty > 0) {
    const raid = state.encounterDirector?.live?.[data.ai?.encounterId];
    const adopted = raid?.data?.adoptedCarrier;
    if (raid?.shapeId === 'opening_hauler_raid' && raid.phase === 'conflict'
        && raid.roles?.[entity.id] === 'hauler' && adopted?.released !== true
        && adopted?.entityId === entity.id && adopted.generation === entity.occupantGeneration
        && adopted.worldRecordId === worldRecordId && adopted.manifestId === manifest.manifestId) {
      return 'Keep them off this load.';
    }
    return 'Let me get this lot in.';
  }

  const emptyReply = 'Nothing aboard yet.';
  const tallies = state.traffic?.heliosFreightTallies;
  if (seq === 0 || manifest.lines.length || manifest.lotId || manifest.custody || manifest.lotSource
      || data.cargoDumped || rec.cargoDumped || !Array.isArray(tallies)
      || tallies.some(row => row?.manifestId === manifest.manifestId)) return emptyReply;
  const previousId = stableManifestId(seed, `${worldRecordId}:work:${seq - 1}`, ROLE);
  const tally = tallies.find(row => row?.manifestId === previousId
    && row.carrierWorldRecordId === worldRecordId && row.sectorId === SECTOR
    && row.destinationId === STATION && row.disposition === 'delivered'
    && Number.isSafeInteger(row.totalQty) && row.totalQty > 0);
  if (!tally || !state.traffic.appliedArrivalIds?.includes(
    stableArrivalIntentId(seed, worldRecordId, STATION, seq - 1),
  )) return emptyReply;
  const causes = Object.values(state.aftermathWrecks?.causes || {}).filter(cause =>
    cause?.shapeId === 'opening_hauler_raid' && cause.sectorId === SECTOR
    && cause.manifestId === previousId && cause.carrierWorldRecordId === worldRecordId);
  if (causes.some(cause => cause.outcome === 'robbed' || cause.outcome === 'hauler_destroyed')) {
    return emptyReply;
  }
  const assisted = causes.some(cause => cause.outcome === 'defended'
    && cause.adoptedWorkingBarge === true && cause.resolutionMethod === 'physical_escape'
    && cause.totalQty === tally.totalQty && cause.commodityId === tally.commodityId);
  return assisted ? 'You kept that load aboard. Empty. Lovely.' : 'Empty. Lovely.';
}
