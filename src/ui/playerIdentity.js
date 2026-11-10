// playerIdentity.js — the pilot's display identity, read-only over state.
//
// One place that answers "what does the world call this pilot": the wanted poster, the wire's
// feat headlines, and any surface that must name the player's own hull and callsign.

/**
 * playerCallsign(state) — the name the pilot answers to: the active ship's given name
 * (renameable via ship:nameChanged), else the hull's display name, else 'Wren'.
 */
export function playerCallsign(state) {
  const player = state && state.player;
  const owned = player && Array.isArray(player.ownedShips)
    && player.ownedShips[player.activeShipIndex | 0];
  if (owned && typeof owned.name === 'string' && owned.name.trim()) return owned.name.trim();
  const def = owned && owned.def;
  if (def && typeof def.name === 'string' && def.name.trim()) return def.name.trim();
  if (owned && typeof owned.shipId === 'string' && owned.shipId.trim()) {
    return owned.shipId.replace(/^ship_/, '').replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return 'Wren';
}

/** playerHullName(state) — the active hull's display name for warrant postings. */
export function playerHullName(state) {
  const player = state && state.player;
  const owned = player && Array.isArray(player.ownedShips)
    && player.ownedShips[player.activeShipIndex | 0];
  const def = owned && owned.def;
  if (def && typeof def.name === 'string' && def.name.trim()) return def.name.trim();
  if (owned && typeof owned.shipId === 'string') {
    return owned.shipId.replace(/^ship_/, '').replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return 'hull';
}
