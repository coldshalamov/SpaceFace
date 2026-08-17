// Read-only Plan 44 join: ordinary contacts can recognize the flown hull's filed name and the
// history already owned by Ships/Living Hull. No parallel reputation ledger is created here.
import { normalizeLivingHull, livingHullGrimeAt } from '../core/livingHull.js';
import { activePlayerShipRegistryIdentity } from './shipRegistry.js';

const RESPECT_LINES = Object.freeze({
  faction_dmc: (name) => `${name} · THAT HULL'S SEEN WORK.`,
  faction_free: (name) => `${name} · STILL FLYING. RESPECT.`,
  faction_reach: (name) => `${name} · SCARS COUNT.`,
  faction_pitborn: (name) => `${name} · SCARS COUNT.`,
  faction_mts: (name) => `${name} · WORK RECORD NOTED.`,
  faction_scn: (name) => `${name} · DAMAGE HISTORY ON FILE.`,
  faction_vael: (name) => `${name} · THE MARKS ARE WITNESSED.`,
});
const UNNAMED_RESPECT_LINES = Object.freeze({
  faction_dmc: "THAT HULL'S SEEN WORK.",
  faction_free: 'STILL FLYING. RESPECT.',
  faction_reach: 'SCARS COUNT.',
  faction_pitborn: 'SCARS COUNT.',
  faction_mts: 'WORK RECORD NOTED.',
  faction_scn: 'DAMAGE HISTORY ON FILE.',
  faction_vael: 'THE MARKS ARE WITNESSED.',
});

/**
 * Return one compact Hail line. A clean named hull receives registry acknowledgement; once the
 * same durable hull has visible history, factions answer that reputation in their own register.
 * An unnamed scarred hull can still earn the specified respect bark without inventing a name.
 */
export function playerShipIdentityHailLine(state, responderFactionId = null) {
  const identity = activePlayerShipRegistryIdentity(state);
  const owned = activeOwnedShip(state);
  const now = Number(state && state.simTime) || 0;
  const livingHull = normalizeLivingHull(owned && owned.livingHull, now);
  const visibleHistory = livingHull.killTally
    + livingHull.repairPatches * 2
    + livingHull.heatScorch * 2
    + (livingHull.graffitiLine ? 1 : 0)
    + (livingHullGrimeAt(livingHull, now) >= 0.27 ? 1 : 0);
  if (visibleHistory < 3) {
    return identity.isNamed ? `REGISTRY ${identity.displayName.toUpperCase()} CONFIRMED.` : null;
  }
  if (!identity.isNamed) {
    return UNNAMED_RESPECT_LINES[String(responderFactionId || '').toLowerCase()]
      || 'FIELD HISTORY RECOGNIZED.';
  }
  const subject = identity.displayName.toUpperCase();
  const authored = RESPECT_LINES[String(responderFactionId || '').toLowerCase()];
  return authored ? authored(subject) : `${subject} · FIELD HISTORY RECOGNIZED.`;
}

function activeOwnedShip(state) {
  const player = state && state.player;
  if (!player || !Array.isArray(player.ownedShips)) return null;
  const index = Number.isInteger(player.activeShipIndex) ? player.activeShipIndex : 0;
  return player.ownedShips[index] || null;
}
