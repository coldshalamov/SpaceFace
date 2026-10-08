// Shared setting writer for settings-independent flight controls and the circuit board.
import { activeSteerLock, normalizeSteeringView, resolveSteeringView } from '../systems/racingSteer.js';
export function setSteeringView(state, bus, value) {
  if (!state) return null;
  const next = normalizeSteeringView(value);
  if (!state.settings) state.settings = {};
  if (!state.settings.gameplay) state.settings.gameplay = {};
  state.settings.gameplay.steeringView = next;
  bus?.emit?.('settings:changed', { section: 'gameplay', key: 'steeringView', value: next });
  return next;
}
export function toggleSteeringView(state, bus) {
  if (!state || state.mode !== 'flight' || state.ui?.docked || state.render?.photoMode?.active) return false;
  const player = state.entities?.get?.(state.playerId);
  if (player?.alive === false) return false;
  if (activeSteerLock(state)) {
    bus?.emit?.('toast', { text: 'This mission section owns the chase view. Your preferred view returns afterward.', kind: 'info', ttl: 3 });
    return false;
  }
  setSteeringView(state, bus, resolveSteeringView(state) === 'racing' ? 'overhead' : 'racing');
  return true;
}

let result = null;
export function rememberRacingResult(payload) {
  if (!payload?.racingContractId || !Number.isFinite(payload.raceElapsedS)) return;
  result = { ...payload, raceLapTimesS: (payload.raceLapTimesS || []).slice(0,100) };
}
export function lastRacingResult() { return result; }
