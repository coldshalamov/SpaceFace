// wingBrace.js — FLT-02 Wingman brace data. Pure data/helpers, no game-state authority.
//
// One contextual order — "anchor / brace target": a wingman holding an ATTACK wing order on
// an enemy heavy tethers it still (or swings it toward the player) so the player's
// follow-up cut lands. This file owns the eligibility predicate and the callsign table;
// systems/wingmen.js owns the kernel latch, propulsion intent and stunt/morale wiring.

// A brace target is an enemy heavy hull: live, hostile to the player, massive enough to
// be worth bracing. Warden is mass 150; Wasp is 16. Require at least four times
// the wingman's mass as well, so a heavy wingman never braces a peer.
export const BRACE_MIN_MASS = 150;
export const BRACE_MAX_WU = 1200;
export const BRACE_MIN_MASS_RATIO = 4;
export const BRACE_LATCH_WU = 120;

export function braceEligibleTarget(state, target, wingman) {
  if (!target || target.alive === false || !target.pos) return false;
  if (target.type !== 'ship' && target.type !== 'drone') return false;
  if (target.id === state.playerId) return false;
  if (target.team !== 1) return false;
  const mass = Number(target.mass);
  if (!Number.isFinite(mass) || mass < BRACE_MIN_MASS) return false;
  if (!wingman || !(wingman.mass > 0) || mass < wingman.mass * BRACE_MIN_MASS_RATIO) return false;
  return true;
}

// Earned callsigns for a wingman that holds a brace through a witnessed shared stunt.
// Plain display words — never ids. Deterministic pick by ledger id hash, no rng draws.
export const BRACE_CALLSIGNS = Object.freeze([
  'Anchor',
  'Vice',
  'Tackle',
  'Clamp',
  'Snub',
  'Brace',
]);

export function braceCallsignFor(fleetId) {
  const text = String(fleetId == null ? 'wing' : fleetId);
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  const list = BRACE_CALLSIGNS;
  return list[Math.abs(hash) % list.length];
}
