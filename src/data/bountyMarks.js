// src/data/bountyMarks.js — the writ wall names a person at a place.
//
// Board-rolled bounty_hunt offers used to be anonymous and placeless: "a wanted target" that
// materialized on a ring around the player wherever they happened to be. The career-origin
// contracts already proved the named-mark seam works — a `storyTarget` carrying {name, label,
// zoneId|anchorId} stamps identity on the hull and puts it inside a named landmark or zone.
// This module extends that fantasy to the ordinary bounty board: pure data, deterministic on
// (seed, offerId), zero rng draws, so two rolls of the same board agree and every other rolled
// offer field stays bit-identical.
//
// missions.js is the sole runtime owner — it calls rollBountyMark during _rollOffer, spreads the
// result into offer.storyTarget, and lets the existing spawn/stamp/settle path do the rest.

import { hash32 } from '../core/rng.js';
import { SECTOR_ANCHORS } from './sectorAnchors.js';
import { zonesForSector } from './sectorZones.js';
import { SECTORS } from './sectors.js';

/**
 * Wanted-poster person names, in the game's register ('Rook Nine', 'Red Ledger', 'Mira Bluepack').
 * Mix of plain names and road-names; the writ label uppercases whichever is drawn.
 */
export const MARK_NAMES = Object.freeze([
  'Vess Arando',
  'Pell Quire',
  'Tam of the Ledger',
  'Osk "Half-Burn" Revik',
  'Ines Kald',
  'Roon Ablemar',
  'Cass Widowline',
  'Dren Sokol',
  'Hett Marrow',
  'Jule Vanno',
  'Petra Nine-Hull',
  'Abram Coldline',
  'Sef Quarry',
  'Ida Vreck',
  'Koll Brant',
  'Nessa Drift-Born',
  'Ulric Fenn',
  'Marl Tosi',
  'Gale Underwake',
  'Brant Hollow',
  'Yves Korda',
  'Sel Roan',
  'Dim Tarlo',
  'Agnes Fieldwork',
  'Corin Ashwell',
  'Pike Sorrow',
  'Lena Voss-Bara',
  'Hollis Merk',
  'Fenn Abrit',
  'Odile Kane',
]);

/**
 * The mark's one-shot reaction when the player closes to scanner-contact range. No {name} token —
 * the comms popup's sender field already carries it. Register: a person who has read their own
 * wanted poster more than once.
 */
export const MARK_HAIL_LINES = Object.freeze([
  'That transponder. I know what the board sent.',
  'Collect or be collected, courier.',
  'Tell the wall I seen you coming.',
  'Third hull this season. The pay must be good.',
  'My face on a posting again. Flattering.',
  'You read the writ. Now read the room.',
  'They priced me cheap. You will feel the difference.',
  'Dead was cheaper than quiet. Their arithmetic, not mine.',
]);

/**
 * Zone types a wanted person can plausibly lurk in. Excluded: civilian_core, refinery_approach,
 * patrol_corridor, border_checkpoint, colony, planetary_mass — a posted mark holes up off the
 * lawful doorstep, not inside a dock bubble or a customs lane.
 */
export const BOUNTY_MARK_ZONE_TYPES = Object.freeze([
  'derelict_field',
  'ambush_lane',
  'mining_belt',
  'outlaw_zone',
  'anomaly_deep',
  'nebula_fog',
  'radiation_field',
  'trade_lane',
]);

const _sectorNameById = new Map(SECTORS.map((sec) => [sec.id, sec && sec.name]));

/**
 * The same risk-tier archetype pool missions._spawnTargetsFor draws anonymous bounties from —
 * single source so the hull the posting implies is always a hull the spawn table could produce.
 */
export function markArchetypePoolFor(riskTier) {
  const tier = Math.max(0, Math.round(Number(riskTier) || 0));
  return tier <= 1
    ? ['wasp_swarmer', 'wasp_swarmer', 'reaver_pirate']
    : tier <= 2
      ? ['wasp_swarmer', 'reaver_pirate', 'reaver_pirate']
      : tier <= 3
        ? ['reaver_pirate', 'reaver_pirate', 'corsair_raider', 'wasp_swarmer']
        : ['reaver_pirate', 'corsair_raider', 'corsair_raider', 'bruiser_brawler'];
}

/**
 * Ordered place candidates for the mark: named POIs first (strongest fiction), then lurk-able
 * named zones, then the sector's gates. Field anchors have no authored names, so they are skipped;
 * stations are skipped deliberately — a writ does not hang over a berth.
 * Returns null when the sector offers no named place at all.
 */
function markPlaceCandidates(sectorId, sectorDef) {
  const candidates = [];
  const anchors = SECTOR_ANCHORS[sectorId];
  const poiNameById = new Map(((sectorDef && sectorDef.pois) || [])
    .filter((poi) => poi && poi.id && poi.name)
    .map((poi) => [poi.id, poi.name]));
  for (const anchorPoi of (anchors && anchors.pois) || []) {
    const name = anchorPoi && poiNameById.get(anchorPoi.id);
    if (name) candidates.push({ anchorId: anchorPoi.id, anchorRadius: 200, placeName: name });
  }
  for (const zone of zonesForSector(sectorId)) {
    if (zone && zone.id && zone.name && BOUNTY_MARK_ZONE_TYPES.includes(zone.type)) {
      candidates.push({ zoneId: zone.id, placeName: zone.name });
    }
  }
  for (const gate of (anchors && anchors.gates) || []) {
    if (!gate || !gate.to) continue;
    const neighborName = _sectorNameById.get(gate.to) || 'the neighbor';
    candidates.push({ anchorId: gate.to, anchorRadius: 300, placeName: `the ${neighborName} gate` });
  }
  return candidates;
}

/**
 * Roll the mark for a board-generated bounty offer. Deterministic on (seed, offerId) — a hash,
 * never an rng draw — so re-rolling the same board reproduces the same writ.
 *
 * Returns { id, name, label, role, archetype, factionId, anchorId?, zoneId?, anchorRadius?,
 * placeName? } — callers spread it into offer.storyTarget (drop placeName; it lives in
 * params.markPlace). When the sector has no named place the mark still returns with a name and
 * hull, and the spawn path falls back to the player ring exactly as an anonymous bounty would.
 */
export function rollBountyMark({ seed, offerId, sectorId, riskTier = 0, sectorDef = null } = {}) {
  if (!offerId || !sectorId) return null;
  const h0 = hash32(seed || 1, offerId, 'bounty-mark');
  const name = MARK_NAMES[h0 % MARK_NAMES.length];
  const pool = markArchetypePoolFor(riskTier);
  const archetype = pool[hash32(h0, 'hull') % pool.length];
  const places = markPlaceCandidates(sectorId, sectorDef);
  const place = places.length ? places[hash32(h0, 'place') % places.length] : null;
  return {
    id: `mark:${offerId}`,
    name,
    label: `${name.toUpperCase()} — WARRANT`,
    role: 'board_writ',
    archetype,
    factionId: 'faction_reach',
    ...(place || {}),
  };
}

/** The mark's seeded approach line — one per mission, stable across save/load. */
export function bountyMarkHail(seed, missionId) {
  return MARK_HAIL_LINES[hash32(seed || 1, missionId || 'mark', 'bounty-mark-hail') % MARK_HAIL_LINES.length];
}
