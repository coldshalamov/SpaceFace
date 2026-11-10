// A small arrival script for the existing Archive survey. It reads the research owner's
// bearings/aftermath, never awards progress or implies that navigation references are bodies.
export const TRITON_RESEARCH_ZONE = 'authored:poi_triton_field_lab';
export function isTritonResearch(row) {
  return row?.sectorId === 'sector_triton_wake' && row.zoneId === TRITON_RESEARCH_ZONE
    && row.familyId === 'anomaly_research';
}

export function tritonResearchLine(row, phase, aftermath) {
  if (!isTritonResearch(row)) return null;
  const lead = aftermath?.leadEmitted === true && row.stationId === 'station_triton';
  if (phase === 'outcome') return 'ARCHIVE FIELD LAB · Three bearings agree. Stabilized echo recorded.'
    + (lead ? ' Research lead sent to Triton Wake Lab’s contracts desk.' : ' No research lead posted to a desk.');
  if (phase === 'aftermath') return 'ARCHIVE FIELD LAB · The stabilized echo still holds. The Archive now has a reference for instruments that disagree.';
  if (phase === 'expired') return 'ARCHIVE FIELD LAB · The old echo has faded. The instruments need three fresh bearings; your earlier work remains recorded.';
  const next = row.progress > 0 ? ' Circle the mast for a new baseline.' : ' Start 240 WU from the mast toward Wake Lab.';
  if (phase === 'approach') return 'ARCHIVE FIELD LAB · Optional: scan 3 positions within 300 WU of the mast, 180 WU apart.' + next;
  if (phase === 'rejected') return 'FIELD LAB · Same baseline; no new reading. Move 180 WU from earlier readings; stay within 300 WU of the mast.' + next;
  if (phase === 'progress') return `FIELD LAB · Bearing ${row.progress}/3 logged. Keep readings 180 WU apart, within 300 WU of the mast.` + next;
  return null;
}

export function tritonResearchInRange(state, own, row) {
  if (!isTritonResearch(row) || row._presenceSuspended || state.mode !== 'flight'
      || state.ui?.docked || state.onboarding?.active && !state.onboarding.finished
      || state.world?.currentSectorId !== row.sectorId || own.activeSectorId !== row.sectorId) return false;
  const body = state.entities?.get(row.anchorEntityId);
  const player = state.entities?.get(state.playerId);
  return !!body && body.alive !== false && body.data?.poiId === 'poi_triton_field_lab'
    && !!player && player.alive !== false && Number.isFinite(player.pos?.x)
    && Number.isFinite(player.pos?.z)
    && Math.hypot(player.pos.x-row.zoneCenter.x, player.pos.z-row.zoneCenter.z) <= row.zoneRadius;
}

export function tritonArrivalPhase(state, own, row) {
  if (!isTritonResearch(row)) return null;
  const inside = tritonResearchInRange(state, own, row);
  const wasInside = row._tritonInside === true;
  row._tritonInside = inside;
  if (!inside) { delete row._tritonPending; delete row._tritonSurface; return null; }
  if (wasInside && !row._tritonPending) return null;
  const echo = own.aftermath[row.behaviorId];
  const liveEcho = echo?.kind === 'stabilized_echo' && echo.expiresDay > Math.floor((state.simTime || 0)/600);
  const oldReceipt = own.receipts.some(r => r.behaviorId === row.behaviorId && r.outcome === 'stabilized');
  const phase = liveEcho ? 'aftermath' : row.status === 'aftermath' || row.status === 'resolved'
    ? null : oldReceipt ? 'expired' : 'approach';
  if (!phase) return null;
  // Fixed keys in the existing durable guidance ledger: bounded to three per place.
  // Queue acceptance is NOT delivery. Only a matching voice:surface consumes the key.
  const key = phase === 'approach' ? row.behaviorId : `${row.behaviorId}:triton:${phase}`;
  if (own.entered[key]) { delete row._tritonPending; return null; }
  const now = Number(state.simTime) || 0;
  if (row._tritonPending && now >= row._tritonPending.at && now-row._tritonPending.at < 8) return null;
  row._tritonPending = { phase, key, at: now };
  return phase;
}
