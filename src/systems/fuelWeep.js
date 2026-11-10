// A cracked hull does not hold a tank. Below the band the gauge weeps until
// the plating is back, or until the ship is in a berth.

export const FUEL_WEEP_HULL_FRAC = 0.35;
export const FUEL_WEEP_PER_S = 1.25;

export const FUEL_WEEP_START = 'The tank is weeping through the hull.';
export const FUEL_WEEP_SEAL = 'The weep sealed.';

export function fuelWeepRate(player) {
  if (!player || player.alive === false) return 0;
  if (player.flags && (player.flags.docked || player.flags.invuln)) return 0;
  const max = Number(player.hullMax);
  const hull = Number(player.hull);
  if (!(max > 0) || !(hull >= 0)) return 0;
  if (hull / max >= FUEL_WEEP_HULL_FRAC) return 0;
  return FUEL_WEEP_PER_S;
}

export function stepFuelWeep(host, dt, state) {
  const out = { leaked: 0, started: false, sealed: false };
  if (!(dt > 0) || !state || !state.fuel) return out;
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const book = host._fuelWeepBook || (host._fuelWeepBook = { weeping: false });
  const docked = !!(state.ui && state.ui.docked);
  const rate = docked ? 0 : fuelWeepRate(player);
  const held = Math.max(0, Number(state.fuel.current) || 0);
  if (rate > 0 && held > 0) {
    const leak = Math.min(held, rate * dt);
    if (leak > 0 && typeof host._spendFuel === 'function') {
      host._spendFuel(leak);
      out.leaked = leak;
      if (!book.weeping) {
        book.weeping = true;
        out.started = true;
        if (host.bus && typeof host.bus.emit === 'function') {
          host.bus.emit('toast', { text: FUEL_WEEP_START, kind: 'warn', ttl: 3.5 });
        }
      }
    }
    return out;
  }
  // A dry tank still has an open hull. Only a repair or a berth (rate 0) seals it.
  if (book.weeping && !(rate > 0)) {
    book.weeping = false;
    out.sealed = true;
    if (host.bus && typeof host.bus.emit === 'function') {
      host.bus.emit('toast', { text: FUEL_WEEP_SEAL, kind: 'info', ttl: 2.5 });
    }
  }
  return out;
}
