// Transient per-request association: never serialized into GameState or held after a screen dies.
const clocks = new WeakMap();
export function bindStationLifeClock(request, clock) {
  if (request && typeof request === 'object') clocks.set(request, clock);
}
export function stationLifeClockFor(request) {
  return request && typeof request === 'object' ? clocks.get(request) || null : null;
}
