// inf-fit-milestone — the Shipworks receipt names the capability a fit just unlocked, at the
// moment it lands. The fit flow knew how to say "LOADOUT RECALCULATED" and nothing else: a
// player who bolts on their first cargo magnet, cloak, or drone bay watched a mechanical line
// scroll past while the hull quietly learned a new verb. The capability vocabulary already
// exists (shipBandModels.capabilityDefinitions — "Scoop cargo without stopping", "Read quieter
// than you are"), so the milestone is a pure diff over that vocabulary.
//
// The before-snapshot rides the same UI-owned expectation seam as the market's trade
// expectation (state.ui, scratch, consumed exactly once, TTL-bounded): the Shipworks screen
// stamps the hull's capability ids before it dispatches a fit intent, and the station receipt
// diffs the live fit against it. One slot, one consumption — a stale stamp can never attach to
// a later unrelated fit. No persistent field: this never touches the save.

import { getDerivedStats } from '../../systems/ships.js';
import { capabilityDefinitions } from './shipBandModels.js';

export const FIT_CAPABILITY_EXPECTATION_KEY = 'fitCapabilityExpectation';
const FIT_EXPECTATION_TTL_S = 10;

function capabilityIds(state) {
  const derived = getDerivedStats(state.hullDefId, state.fittings, state.player);
  return derived ? capabilityDefinitions(derived).map((row) => row.id) : [];
}

/**
 * Stamp the hull's capability ids before a fit intent dispatches. Pure over the given fit —
 * the caller reads the viewed hull's CURRENT fittings (pre-fit). Returns the stamp or null.
 */
export function stampFitCapabilityExpectation(state, { hullDefId, slotIndex, fittings, player }) {
  const slot = Number(slotIndex);
  if (!state || typeof state !== 'object' || !hullDefId || !Number.isInteger(slot) || slot < 0) return null;
  if (!state.ui || typeof state.ui !== 'object') state.ui = {};
  const stamp = {
    hullDefId: String(hullDefId),
    slotIndex: slot,
    ids: capabilityIds({ hullDefId: String(hullDefId), fittings: Array.isArray(fittings) ? fittings : [], player: player || null }),
    at: Number(state.simTime) || 0,
  };
  state.ui[FIT_CAPABILITY_EXPECTATION_KEY] = stamp;
  return stamp;
}

/** The owned hull a fit receipt names, or null when the event cannot name one. */
function ownedHullForEvent(state, event) {
  const player = state && state.player;
  const ships = player && Array.isArray(player.ownedShips) ? player.ownedShips : [];
  const byIndex = Number(event.shipIndex);
  if (Number.isInteger(byIndex) && byIndex >= 0) return ships[byIndex] || null;
  if (event.shipId != null && event.shipId === state.playerId) {
    return ships[player.activeShipIndex] || null;
  }
  const defId = String(event.defId || '');
  const slotIndex = Number(event.slotIndex);
  if (!defId || !Number.isInteger(slotIndex)) return null;
  const matches = ships.filter((ship) => ship && Array.isArray(ship.fittings) && ship.fittings[slotIndex] === defId);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Consume the expectation and name what the fit unlocked, or null. The slot is consumed exactly
 * once whatever the outcome, so a dead or mismatched stamp can never attach to a later fit.
 */
export function consumeFitCapabilityMilestone(state, event = {}) {
  const ui = state && typeof state === 'object' ? state.ui : null;
  const stamp = ui && typeof ui === 'object' ? ui[FIT_CAPABILITY_EXPECTATION_KEY] : null;
  if (ui && typeof ui === 'object' && ui[FIT_CAPABILITY_EXPECTATION_KEY] !== undefined) {
    ui[FIT_CAPABILITY_EXPECTATION_KEY] = null;
  }
  if (!stamp || typeof stamp !== 'object') return null;
  const now = Number(state && state.simTime) || 0;
  const age = now - (Number(stamp.at) || 0);
  if (!(age >= 0) || age > FIT_EXPECTATION_TTL_S) return null;
  if (Number(stamp.slotIndex) !== Number(event.slotIndex)) return null;
  const hull = ownedHullForEvent(state, event);
  if (!hull || String(hull.defId || '') !== String(stamp.hullDefId)) return null;
  const derived = getDerivedStats(hull.defId, hull.fittings, state.player);
  const before = new Set(Array.isArray(stamp.ids) ? stamp.ids : []);
  const gained = derived
    ? capabilityDefinitions(derived).find((row) => !before.has(row.id)) || null
    : null;
  return gained ? { id: gained.id, verb: gained.verb } : null;
}
