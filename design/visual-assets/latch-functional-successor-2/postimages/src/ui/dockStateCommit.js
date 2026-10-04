import { dockIntentStatus } from '../core/dockIntent.js';
// uiRoot remains the accepted flight -> station UI transition owner. Preserve the initiating
// actor identity instead of relabelling a delayed message as whichever ship is current now.
export function commitDockedUiState(state, payload, bus) {
  if (!payload || typeof payload !== 'object') return false;
  if (dockIntentStatus(state, payload) === 'stale') return false;
  const stationId = payload?.stationId || null;
  const ship = state.entities?.get?.(state.playerId);
  if (payload?.shipId != null && payload.shipId !== state.playerId) return false;
  if (payload?.shipGeneration != null && payload.shipGeneration !== ship?.occupantGeneration) return false;
  const ui = state.ui || (state.ui = {});
  const changed = ui.docked !== true || ui.dockedStationId !== stationId;
  ui.docked = true;
  ui.dockedStationId = stationId;
  if (changed && bus && typeof bus.emit === 'function') {
    // Legacy untagged callers keep ordinary docking compatibility, but their missing actor
    // identity is not upgraded into a confirmed Latch acknowledgement.
    bus.emit('dock:committed', payload);
  }
  return true;
}
