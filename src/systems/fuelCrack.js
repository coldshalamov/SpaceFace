// Crack one free fuel cell into the flight tank, or cook it if the hull is burning.
// Plans only. World applies the fuel write, cargo.removeCargo applies the hold,
// and the combat kernel applies the cook. No Three.js, no Math.random, no clock.

import { sellableCargoQty } from './cargo.js';

export const FUEL_CELL_ID = 'cmdty_fuel_cells';
export const FUEL_CELL_SIP = 8;
export const FUEL_CELL_COOK = 18;

function playerEntity(state) {
  if (!state || state.playerId == null || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(state.playerId) || null;
}

/** True when the live combatant runtime still has an unexpired burn on the player. */
export function hullIsBurning(state) {
  const player = playerEntity(state);
  if (!player) return false;
  const warm = state.combat && state.combat.entities;
  const runtime = warm ? warm[String(player.id)] : null;
  const active = runtime && runtime.statuses && runtime.statuses.status_burning;
  if (!active) return false;
  return Number(active.expiresTick) > (Number(state.tick) || 0);
}

/**
 * What one Crack click would do. `refuse` writes nothing. `fill` is one cell
 * and a full sip. `cook` spends shield or hull and does not fill the tank.
 */
export function planFuelCrack(state) {
  const free = sellableCargoQty(state, FUEL_CELL_ID);
  if (!(free > 0)) {
    return { mode: 'refuse', reason: 'No free fuel cell to crack' };
  }
  if (hullIsBurning(state)) {
    return {
      mode: 'cook',
      damage: FUEL_CELL_COOK,
      reason: 'A burning hull cooks the cell against whatever is still up',
    };
  }
  const fuel = state && state.fuel;
  const room = Math.max(0, (Number(fuel && fuel.max) || 0) - (Number(fuel && fuel.current) || 0));
  if (room < FUEL_CELL_SIP) {
    return { mode: 'refuse', reason: 'The tank cannot take a whole cell' };
  }
  return { mode: 'fill', sip: FUEL_CELL_SIP };
}
