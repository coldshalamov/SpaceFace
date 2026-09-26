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
import { BUBBLE_MULTIPLIERS, BUBBLE_SIZE_FACTOR } from './stationBubbles.js';
import { HELIOS_STARTER_PROTECTION_RADIUS_WU } from './sectorCoordinates.js';

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

/** The mark speaks when the player closes inside this approach band — a hail on the stalk,
 * well inside scanner contact, not on first acquisition. */
export const MARK_HAIL_RANGE_WU = 2200;

/**
 * POI types that can never be a mark's lair: anomalies are authored story sites (obelisk, boss
 * arena, sealed archives) and wormholes are gated transit — a public writ does not park a wanted
 * person inside another system's set piece.
 */
const MARK_POI_BLOCKED_TYPES = new Set(['anomaly', 'wormhole']);

/**
 * A POI stays out of the writ pool when it is hidden, owned by another runtime, locked behind a
 * boss or tech gate, or itself a discovery (scan/manual investigation/recovery/discoveryPlate):
 * the board must not leak what the player has not found, and must not trespass authored content.
 * In a sector with no hostile spawns (the tutorial home), beacon POIs — the teaching waypoints —
 * are additionally off-limits; a mark there holds at a work site or gate instead.
 */
function markPoiEligible(poi, sectorDef) {
  if (!poi || !poi.id || !poi.name) return false;
  if (MARK_POI_BLOCKED_TYPES.has(poi.type)) return false;
  if (sectorDef && sectorDef.enemyDensity === 0 && poi.type === 'beacon') return false;
  if (poi.hidden || poi.runtimeOwner || poi.unlockAfterBossId || poi.gatedBy) return false;
  if (poi.requiresActiveScan || poi.manualInvestigation || poi.recoveryEncounter || poi.discoveryPlate) return false;
  return true;
}

/**
 * Station factions that project a lawful no-fire bubble — mirror of
 * engagementAuthority.LAWFUL_STATION_FACTIONS (kept local: data modules stay leaf-ward).
 */
const MARK_LAWFUL_STATION_FACTIONS = new Set(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free']);

/**
 * A writ does not post a mark inside lawful protection — a hostile holding a station bubble can
 * never return fire, which turns the hunt into an execution. Rebuilds the same volumes
 * engagementAuthority.protectedStationAt computes, in pure data: dockRadius is a function of
 * station size (world.js), the patrol bubble is dockRadius × patrol multiplier × size factor,
 * the protection floor is 600 WU, and station_helios owns the 1400 WU starter sanctuary.
 * Returns local-space {x, z, radius} volumes.
 */
function lawfulProtectionVolumes(sectorId, sectorDef) {
  const volumes = [];
  const anchorById = new Map(((SECTOR_ANCHORS[sectorId] && SECTOR_ANCHORS[sectorId].stations) || [])
    .map((anchor) => [anchor && anchor.id, anchor]));
  for (const station of (sectorDef && sectorDef.stations) || []) {
    if (!station || !station.id) continue;
    const lawful = MARK_LAWFUL_STATION_FACTIONS.has(station.factionId);
    const starterSanctuary = station.id === 'station_helios';
    if (!lawful && !starterSanctuary) continue;
    const pos = anchorById.get(station.id) && anchorById.get(station.id).pos;
    if (!pos) continue;
    const size = station.size || 'M';
    const dockRadius = size === 'L' ? 90 : size === 'S' ? 60 : 72;
    const patrol = dockRadius * BUBBLE_MULTIPLIERS.patrol * (BUBBLE_SIZE_FACTOR[size] || BUBBLE_SIZE_FACTOR.M);
    const radius = starterSanctuary
      ? Math.max(HELIOS_STARTER_PROTECTION_RADIUS_WU, patrol)
      : Math.max(600, patrol);
    volumes.push({ x: pos.x, z: pos.z, radius });
  }
  return volumes;
}

/** True when the whole scatter disc for a candidate stays clear of lawful protection —
 * padding by the spawn scatter radius since the mark lands up to that far off-center. */
function clearOfLawfulVolumes(localX, localZ, scatter, volumes) {
  for (const v of volumes) {
    const dx = localX - v.x;
    const dz = localZ - v.z;
    const reach = v.radius + scatter;
    if (dx * dx + dz * dz < reach * reach) return false;
  }
  return true;
}

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
  const sectorPois = (sectorDef && sectorDef.pois) || [];
  const lawfulVolumes = lawfulProtectionVolumes(sectorId, sectorDef);
  // A POI that another site unlocks only after its boss falls is an occupied arena, not a lair.
  const bossGateIds = new Set(sectorPois.map((poi) => poi && poi.unlockAfterBossId).filter(Boolean));
  const poiNameById = new Map(sectorPois
    .filter((poi) => markPoiEligible(poi, sectorDef) && !bossGateIds.has(poi.id))
    .map((poi) => [poi.id, poi.name]));
  for (const anchorPoi of (anchors && anchors.pois) || []) {
    const name = anchorPoi && poiNameById.get(anchorPoi.id);
    const pos = anchorPoi && anchorPoi.pos;
    if (name && pos && clearOfLawfulVolumes(pos.x, pos.z, 200, lawfulVolumes)) {
      candidates.push({ anchorId: anchorPoi.id, anchorRadius: 200, placeName: name });
    }
  }
  for (const zone of zonesForSector(sectorId)) {
    if (!zone || !zone.id || !zone.name || !zone.center || !BOUNTY_MARK_ZONE_TYPES.includes(zone.type)) continue;
    // Mirror of the zone scatter in missionStoryTargetSpawnPos — the mark lands up to this far
    // off-center, so a center this close to lawful ground can still spawn a protected mark.
    const scatter = Math.max(40, Math.min(240, (zone.radius || 400) * 0.35));
    if (clearOfLawfulVolumes(zone.center.x, zone.center.z, scatter, lawfulVolumes)) {
      candidates.push({ zoneId: zone.id, placeName: zone.name });
    }
  }
  for (const gate of (anchors && anchors.gates) || []) {
    if (!gate || !gate.to || !gate.pos) continue;
    const neighborName = _sectorNameById.get(gate.to);
    // anchorMinRadius keeps the scatter off the ~35 WU gate collision proxy.
    if (clearOfLawfulVolumes(gate.pos.x, gate.pos.z, 300, lawfulVolumes)) {
      candidates.push({ anchorId: gate.to, anchorRadius: 300, anchorMinRadius: 80,
        placeName: neighborName ? `the ${neighborName} gate` : 'the far gate' });
    }
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
