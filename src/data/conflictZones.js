// Shared contested-sector catalog.
//
// Factions remains the sole writer of conflict state. Economy and UI are read-only consumers that
// need the same pair -> sector mapping to explain persistent war demand without inventing a second
// conflict authority or simulating off-screen ships.
//
// The escalation half of this module is the presentation ladder over that same single authority:
// given a factions-owned conflict record ({ state: 'cold'|'tense'|'war', tension, momentum }) the
// readers below answer what the war looks like on the lane — pickets, escort wings, radio pressure,
// aftermath anchors. No reader mutates anything, and none duplicate the tension thresholds: the
// record's own `state` field (written by factions) is authoritative.

import { hash32 } from '../core/rng.js';
import { sectorGlobalOrigin } from './sectorCoordinates.js';

export const CONTESTED_SECTOR_BY_PAIR = Object.freeze({
  'faction_reach:faction_scn': 'sector_helios_prime',
  'faction_dmc:faction_mts': 'sector_tethys_junction',
  'faction_reach:faction_vael': 'sector_ashfall_reach',
  'faction_quiet:faction_scn': 'sector_io_reach',
  'faction_dmc:faction_reach': 'sector_charon_expanse',
});

// What each war stage looks like from the cockpit. pickets are lane garrisons (passive loiterers),
// escortWing is a formed escort flight that stages alongside them, pressure feeds radio boost.
export const CONFLICT_ESCALATION = Object.freeze({
  cold: Object.freeze({ pickets: 0, escortWing: 0, pressure: 0 }),
  tense: Object.freeze({ pickets: 1, escortWing: 0, pressure: 0.45 }),
  war: Object.freeze({ pickets: 2, escortWing: 3, pressure: 1 }),
});

/** Stage + visible signature for a factions-owned conflict record (missing record reads cold). */
export function escalationForConflict(conflict) {
  const state = conflict && typeof conflict === 'object' ? String(conflict.state || '') : '';
  const stage = CONFLICT_ESCALATION[state] ? state : 'cold';
  return Object.freeze({ stage, ...CONFLICT_ESCALATION[stage] });
}

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

/** 0..1 radio pressure for a sector: its hottest conflict's pressure value (war fronts are loud). */
export function conflictPressureForSector(conflicts, sectorId) {
  let pressure = 0;
  for (const pairKey of conflictPairsForSector(sectorId)) {
    const { pressure: value } = escalationForConflict(conflicts && conflicts[pairKey]);
    if (value > pressure) pressure = value;
  }
  return pressure;
}

/** Deterministic aftermath anchor inside a contested sector: where the flip wreckage sits. */
export function conflictAftermathAnchor(pairKey, sectorId, seed = 0) {
  const origin = sectorGlobalOrigin(sectorId) || { x: 0, z: 0 };
  const h = hash32(seed, pairKey, sectorId, 'conflict-aftermath');
  const angle = (h / 0x100000000) * Math.PI * 2;
  const radius = 260 + (h % 340);
  return Object.freeze({
    x: Math.round((origin.x + Math.cos(angle) * radius) * 1000) / 1000,
    z: Math.round((origin.z + Math.sin(angle) * radius) * 1000) / 1000,
  });
}

const FRONT_STATE_RANK = Object.freeze({ cold: 1, tense: 2, war: 3 });

/** The faction's live war front: its hottest contested pair, ranked by live conflict state
 *  (war > tense > cold > none), then tension, with a deterministic pair-key tie-break. Returns
 *  null when the faction holds no contested sector — callers fall back to home lanes. Read-only
 *  over the conflicts map; factions remains the sole writer of conflict state. */
export function activeFrontForFaction(conflicts, factionId) {
  if (factionId == null) return null;
  let best = null;
  for (const pairKey of Object.keys(CONTESTED_SECTOR_BY_PAIR)) {
    const [a, b] = pairKey.split(':');
    if (a !== factionId && b !== factionId) continue;
    const live = conflicts && conflicts[pairKey];
    const rank = live ? (FRONT_STATE_RANK[live.state] || 0) : 0;
    const tension = live && Number.isFinite(live.tension) ? live.tension : 0;
    if (!best || rank > best.rank
      || (rank === best.rank && (tension > best.tension
        || (tension === best.tension && pairKey < best.pairKey)))) {
      best = { pairKey, rank, tension };
    }
  }
  return best
    ? Object.freeze({ pairKey: best.pairKey, sectorId: CONTESTED_SECTOR_BY_PAIR[best.pairKey] })
    : null;
}
