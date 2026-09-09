// Survival arena catalog for the ten-wave shell (PQ-133.02 / CRU-009).
//
// The queue row for PQ-133.02 names `src/data/survivalArenas.js` as the greybox-arena
// owner. The authored prototypes live in `src/data/combatLabSetups.js` as
// COMBAT_LAB_ARENAS (shared with Combat Lab, leaf .01); this module is the Survival
// view over that catalog: lookup by id, the Phase-2 exercised set, and the spawn
// mapping the materializer needs. Pure data + pure helpers: no bus, no registry,
// no state, no side effects.

import { COMBAT_LAB_ARENAS } from './combatLabSetups.js';

export const SURVIVAL_ARENA_SCHEMA_VERSION = 1;

/** Every arena a Survival run may launch in. Identity is owned by combatLabSetups.js. */
export const SURVIVAL_ARENAS = COMBAT_LAB_ARENAS;

/** Arenas with a route capture behind them. Phase 2 exercised `helios_core`. */
export const SURVIVAL_EXERCISED_ARENAS = Object.freeze(['helios_core']);

const ARENA_BY_ID = new Map(SURVIVAL_ARENAS.map((arena) => [arena.id, arena]));

/** The arena record for `arenaId`, or null when unknown. */
export function survivalArenaById(arenaId) {
  if (typeof arenaId !== 'string' || arenaId.length === 0) return null;
  return ARENA_BY_ID.get(arenaId) || null;
}

/** Sector + spawn mapping the run launch needs. Null when the arena is unknown.
 * `pos` is null unless BOTH coordinates are finite — a half-written spawn point
 * must read as "no mapping", never as a NaN coordinate. */
export function survivalArenaSpawn(arenaId) {
  const arena = survivalArenaById(arenaId);
  if (!arena) return null;
  const raw = arena.spawnPos;
  const x = raw && (typeof raw.x === 'number' || typeof raw.x === 'string') ? Number(raw.x) : NaN;
  const z = raw && (typeof raw.z === 'number' || typeof raw.z === 'string') ? Number(raw.z) : NaN;
  return {
    sectorId: arena.sectorId || null,
    pos: Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null,
  };
}
