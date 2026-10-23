// Called only by ships.settleVesselYardOperation: part of the ships ownership membrane.
import { componentCondition, componentDefinition, componentSubsystemId } from './market.js';

export function settleOwnedVesselYardOperation(owner, payload = {}) {
  const { state, bus } = owner;
  const p = state?.player;
  const index = p?.ownedShips?.findIndex((s) => s.vesselId === payload.vesselId) ?? -1;
  const owned = p?.ownedShips?.[index];
  if (!owned) return { ok: false, reason: 'Vessel is no longer in your custody' };
  if (!state.ui?.docked || !state.ui.dockedStationId) return { ok: false, reason: 'A receiving berth is required' };
  const vessel = state.shipjack?.vesselsById?.[payload.vesselId];
  if (!vessel || vessel.custodian !== 'player') return { ok: false, reason: 'Custody changed' };
  const active = index === p.activeShipIndex;
  if (!active && (vessel.location?.kind !== 'berth' || vessel.location.stationId !== state.ui.dockedStationId)) {
    return { ok: false, reason: 'Deliver this vessel to the receiving berth first' };
  }
  if (payload.action === 'sell' || payload.action === 'return') {
    if (active) return { ok: false, reason: 'Change ships before releasing this hull' };
    if (Object.values(owned.cargo?.items || {}).some((v) => Number(v) > 0)) {
      return { ok: false, reason: 'Empty the vessel cargo hold before release' };
    }
    // Consume the hull WITH its installed instances; no hidden module refund.
    const instanceIds = Object.values(owned.fittedInstances || {}).map((m) => m?.instanceId).filter(Boolean);
    p.ownedShips.splice(index, 1);
    if (p.activeShipIndex > index) p.activeShipIndex--;
    bus.emit('ship:released', { vesselId: payload.vesselId, defId: owned.defId,
      reason: payload.action, operationId: payload.operationId, instanceIds });
    return { ok: true, instanceIds };
  }
  const slotIndex = payload.slotIndex;
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || !owned.fittings?.[slotIndex]) {
    return { ok: false, reason: 'That hardpoint is empty' };
  }
  const definition = componentDefinition(owned.fittings[slotIndex]);
  if (payload.action === 'extract') {
    const expectedInstanceId = owner._reconcileFittedInstance(owned, slotIndex)?.instanceId;
    if (!owner.unfitModule({ shipIndex: index, slotIndex })) return { ok: false, reason: 'Module cannot be removed without overflowing cargo' };
    const instance = p.moduleInventory.find((m) => m.instanceId === expectedInstanceId);
    if (!instance) return { ok: false, reason: 'The extracted instance was moved by another inventory operation' };
    // The existing instance is moved, never reminted. Preserve its complete provenance.
    instance.condition = componentCondition(instance.condition);
    const provenance = typeof instance.provenance === 'object' && instance.provenance ? instance.provenance : {};
    instance.provenance = { ...provenance,
      sourceVesselId: provenance.sourceVesselId || provenance.vesselId || payload.vesselId,
      extractionOperationId: payload.operationId,
      titleAtExtraction: provenance.titleAtExtraction || provenance.titleAtCapture || vessel.title };
    if (definition?.slotType === 'engine') owned.shipjackDriveRemoved = true;
    if (String(instance.defId).startsWith('wpn_')) owned.shipjackNoLegacyWeapon = true;
    owner.recomputeIfActive(index, owned.fittings);
    return { ok: true, instanceId: instance.instanceId, defId: instance.defId };
  }
  if (payload.action === 'repair_module') {
    const instance = owner._reconcileFittedInstance(owned, slotIndex);
    if (!instance) return { ok: false, reason: 'Module identity unavailable' };
    instance.condition = 1;
    owner.recomputeIfActive(index, owned.fittings);
    return { ok: true, instanceId: instance.instanceId, subsystemId: componentSubsystemId(instance.defId) };
  }
  return { ok: false, reason: 'Unsupported shipworks operation' };
}
