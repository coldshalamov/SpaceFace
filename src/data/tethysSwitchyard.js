import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

export const TETHYS_SWITCHYARD = Object.freeze({ owner: 'tethysSwitchyard', id: 'tethys-switchyard:v1',
  sectorId: 'sector_tethys_junction', localPos: Object.freeze({ x: 1300, z: 1900 }),
  commodityId: 'cmdty_food', qty: 6, palletMass: 24, sledMass: 40,
  cycleS: 8, transferS: 2, clearS: 1, jamS: .4, offerRange: 220,
  receiverSpeed: 1.5, rewardCr: 380, returnRewardCr: 120, towDeadlineS: 210,
  yardAssetId: 'SF_PLACE_TETHYS_SWITCHYARD', gantryAssetId: 'SF_PROP_TETHYS_GANTRY',
  sledAssetId: 'SF_PROP_TETHYS_SLED', palletAssetId: 'SF_PROP_TETHYS_PALLET' });
export const TETHYS_RECEIVERS = Object.freeze([
  Object.freeze({ id: 'receiver_a', label: 'A · TRADE HUB', stationId: 'station_tethys', inspect: false }),
  Object.freeze({ id: 'receiver_b', label: 'B · CUSTOMS DIVERSION', stationId: 'station_customs', inspect: true }),
  Object.freeze({ id: 'receiver_c', label: 'C · RETURN TO DISPATCH', stationId: null, inspect: false }),
]);
export const TETHYS_SOURCE_PARTS = Object.freeze(['yard', 'gantry', 'sled', 'pallet', 'hauler']);
export function switchyardWorldId(part) { return `${TETHYS_SWITCHYARD.id}:${part}`; }
export function switchyardGlobalPos() {
  return sectorLocalToGlobalForSector(TETHYS_SWITCHYARD.localPos, TETHYS_SWITCHYARD.sectorId);
}
const clone = value => structuredClone(value);
export function freshTethysSwitchyard() {
  return { version: 1, revision: 0, introduced: false, phase: 'WAIT_TASK', phaseAt: 0,
    selectedReceiverId: 'receiver_a', reservation: null, clearAt: null, jamAt: null, jamCauseIds: [],
    controller: 'crew', startedAt: null, leaseId: `${TETHYS_SWITCHYARD.id}:original-tow`,
    inspection: null, transfer: null, pendingCustody: null, receipt: null,
    milestones: [], parts: Object.fromEntries(TETHYS_SOURCE_PARTS.map(id => [id,
      { status: 'unspawned', pose: null, hull: id === 'yard' ? 320 : id === 'hauler' ? 150 : 60 }])) };
}
const phases = new Set(['WAIT_TASK', 'RESERVE_BERTH', 'VERIFY_CLEAR', 'CYCLE', 'TRANSFER', 'RELEASE', 'JAM', 'BYPASS']);
const statuses = new Set(['unspawned', 'live', 'shelved', 'destroyed', 'delivered', 'returned', 'lost']);
export function normalizeTethysSwitchyard(raw) {
  const row = freshTethysSwitchyard(); if (!raw || raw.version !== 1) return row;
  row.introduced = raw.introduced === true; row.revision = Math.max(0, Math.floor(Number(raw.revision) || 0));
  row.phase = phases.has(raw.phase) ? raw.phase : 'WAIT_TASK';
  row.phaseAt = Number.isFinite(raw.phaseAt) && raw.phaseAt >= 0 ? raw.phaseAt : 0;
  row.selectedReceiverId = TETHYS_RECEIVERS.some(r => r.id === raw.selectedReceiverId) ? raw.selectedReceiverId : 'receiver_a';
  row.controller = raw.controller === 'player' ? 'player' : 'crew';
  row.startedAt = Number.isFinite(raw.startedAt) && raw.startedAt >= 0 ? raw.startedAt : null;
  row.milestones = [...new Set((raw.milestones || []).filter(s => ['jam', 'clear', 'inspected', 'diverted', 'returned', 'delivered', 'bypass'].includes(s)))];
  for (const id of TETHYS_SOURCE_PARTS) {
    const p = raw.parts?.[id]; if (!p || !statuses.has(p.status)) continue;
    row.parts[id].status = p.status; row.parts[id].hull = Math.max(0, Math.min(row.parts[id].hull, Number(p.hull) || 0));
    if (p.pose && ['x', 'z', 'vx', 'vz', 'rot', 'spin'].every(k => Number.isFinite(p.pose[k]))) row.parts[id].pose = clone(p.pose);
    if (!(row.parts[id].hull > 0) && !['delivered', 'returned'].includes(p.status)) row.parts[id].status = 'destroyed';
  }
  if (raw.inspection?.sourceId === switchyardWorldId('pallet') && typeof raw.inspection.fingerprint === 'string'
    && Number.isFinite(raw.inspection.at) && raw.inspection.at >= 0) row.inspection = clone(raw.inspection);
  if (raw.reservation?.sourceId === switchyardWorldId('pallet') && TETHYS_RECEIVERS.some(r => r.id === raw.reservation.receiverId)) row.reservation = clone(raw.reservation);
  if (validSwitchyardReceipt(raw.receipt)) { row.receipt = clone(raw.receipt); row.phase = 'RELEASE'; }
  if (validSwitchyardCustody(raw.pendingCustody)) row.pendingCustody = clone(raw.pendingCustody);
  // A saved progress clock is never fresh native clearance or an active transfer.
  if (['CYCLE', 'TRANSFER', 'VERIFY_CLEAR', 'JAM'].includes(row.phase)) row.phase = 'RESERVE_BERTH';
  return row;
}
export function switchyardManifestFingerprint(entity) {
  if (!entity || entity.data?.worldRecordId !== switchyardWorldId('pallet')) return null;
  const m = entity.data.switchyardManifest;
  if (m?.id !== `${TETHYS_SWITCHYARD.id}:manifest` || m.commodityId !== TETHYS_SWITCHYARD.commodityId
    || m.qty !== TETHYS_SWITCHYARD.qty || !Number.isInteger(m.revision) || m.revision < 0) return null;
  return JSON.stringify([m.id, m.commodityId, m.qty, m.revision, entity.data.claimId || null,
    entity.data.claimRevision ?? null, entity.data.custodyRevision ?? null]);
}
export function validSwitchyardCustody(r) {
  const receiver = TETHYS_RECEIVERS.find(x => x.id === r?.receiverId);
  return !!receiver && r.id === `${TETHYS_SWITCHYARD.id}:custody` && r.sourceId === switchyardWorldId('pallet')
    && r.commodityId === TETHYS_SWITCHYARD.commodityId && r.qty === TETHYS_SWITCHYARD.qty
    && r.stationId === receiver.stationId && typeof r.fingerprint === 'string'
    && Number.isFinite(r.at) && r.at >= 0 && typeof r.byPlayer === 'boolean';
}
export function validSwitchyardReceipt(r) {
  return validSwitchyardCustody(r) && ['delivered', 'returned'].includes(r.outcome)
    && r.outcome === (r.stationId ? 'delivered' : 'returned')
    && r.rewardCr === (r.byPlayer ? (r.stationId ? TETHYS_SWITCHYARD.rewardCr : TETHYS_SWITCHYARD.returnRewardCr) : 0);
}
const owners = new WeakMap();
export function registerSwitchyardOwner(state, owner) { if (owner) owners.set(state, owner); else owners.delete(state); }
export function isSwitchyardPalletTarget(state, entity) { return owners.get(state)?.isCurrentPallet(entity) === true; }
export function tethysSwitchyardNativeCommand(state, entity) { return owners.get(state)?.nativeCommand(entity) || null; }
export function tethysSwitchyardScannerReading(state, entity) { return owners.get(state)?.scannerReading(entity) || null; }
