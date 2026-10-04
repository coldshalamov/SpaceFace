// SWARM-01 runtime. The Hangar writes the Crucible profile and the run wallet. Adventure credits stay put.

import { hangarRank, migrateHangar } from '../data/swarmHangar.js';
import { swarmEarnedHullDefIds } from '../data/swarmCrossover.js';

export function applyHangarToPlayer(state, hangar) {
  const bag = migrateHangar(hangar);
  if (!state) return false;
  const player = state.player;
  if (player && Array.isArray(player.ownedShips)) {
    for (const hullId of bag.ownedHulls) {
      if (/saucer/i.test(hullId)) continue;
      const already = player.ownedShips.some((row) => row && (row.defId === hullId || row === hullId));
      if (!already) player.ownedShips.push({ defId: hullId, fittings: [] });
    }
    // SWARM-06: the earned crossover hulls — the Saucer rides the ledger, not the Hangar's
    // bought list (Bounty can never buy it; the Zone 3 boss is the only counter it answers).
    // Once earned, the disc is flyable inside the mode that proved it.
    for (const defId of swarmEarnedHullDefIds()) {
      const already = player.ownedShips.some((row) => row && (row.defId === defId || row === defId));
      if (!already) player.ownedShips.push({ defId, fittings: [] });
    }
  }
  const entity = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!entity) return true;
  entity.data = entity.data || {};
  if (entity.data.hangarApplied === true) return true;
  const hullMul = 1 + hangarRank(bag, 'plating') * 0.05;
  const shieldMul = 1 + hangarRank(bag, 'shield') * 0.05;
  if (Number.isFinite(entity.hullMax) && hullMul > 1) {
    entity.hullMax = Math.round(entity.hullMax * hullMul);
    if (Number.isFinite(entity.hull)) entity.hull = Math.min(entity.hullMax, Math.round(entity.hull * hullMul));
  }
  const shieldMax = Number.isFinite(entity.shieldMax) ? entity.shieldMax : entity.shieldsMax;
  if (Number.isFinite(shieldMax) && shieldMul > 1) {
    const next = Math.round(shieldMax * shieldMul);
    if (Number.isFinite(entity.shieldMax)) entity.shieldMax = next;
    if (Number.isFinite(entity.shieldsMax)) entity.shieldsMax = next;
    if (Number.isFinite(entity.shield)) entity.shield = Math.min(next, Math.round(entity.shield * shieldMul));
  }
  entity.data.hangarApplied = true;
  entity.data.hangarMagnetMul = 1 + hangarRank(bag, 'magnet') * 0.15;
  return true;
}
