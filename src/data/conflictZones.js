// Shared contested-sector catalog.
//
// Factions remains the sole writer of conflict state. Economy and UI are read-only consumers that
// need the same pair -> sector mapping to explain persistent war demand without inventing a second
// conflict authority or simulating off-screen ships.

export const CONTESTED_SECTOR_BY_PAIR = Object.freeze({
  'faction_reach:faction_scn': 'sector_helios_prime',
  'faction_dmc:faction_mts': 'sector_tethys_junction',
  'faction_reach:faction_vael': 'sector_ashfall_reach',
  'faction_quiet:faction_scn': 'sector_io_reach',
  'faction_dmc:faction_reach': 'sector_charon_expanse',
});

const PAIRS_BY_SECTOR = new Map();
for (const [pairKey, sectorId] of Object.entries(CONTESTED_SECTOR_BY_PAIR)) {
  const list = PAIRS_BY_SECTOR.get(sectorId) || [];
  list.push(pairKey);
  PAIRS_BY_SECTOR.set(sectorId, list);
}
for (const list of PAIRS_BY_SECTOR.values()) Object.freeze(list);

export function contestedSectorForPair(pairKey) {
  return CONTESTED_SECTOR_BY_PAIR[pairKey] || null;
}

export function conflictPairsForSector(sectorId) {
  return PAIRS_BY_SECTOR.get(sectorId) || [];
}
