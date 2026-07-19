// src/data/authoredPlaces.js — additive authored places that live outside the big per-sector tables.
//
// WHY THIS FILE EXISTS. `sectorZones.js` and `sectorAnchors.js` are large, hot, frequently-contended
// files. A place that is authored as one self-contained record — a survey mark, a lane fixture, a
// one-off landmark — does not need to be threaded into the middle of a 300-line sector table where
// it collides with every other content writer. This module is the additive seam for exactly that:
// author the record here, append it through `appendAuthoredZones`, and the derived Atlas picks it up
// with no further wiring.
//
// WHAT THIS FILE IS NOT. It is NOT a second registry and NOT an "atlas data file" (rejected by
// design/program/atlas/01_DECISIONS.md D9.1). Nothing here carries a global coordinate, a discovery
// state, or an atlas node id. These are ordinary authored sector-local zone records in the ordinary
// zone schema — the same shape `sectorZones.js` already uses — merged into the same `SECTOR_ZONES`
// map that has always been the authored source. The Atlas derives from that map exactly as before.
// If this file were deleted and its record pasted back into `sectorZones.js`, nothing downstream
// would observe a difference. That property is the test of whether a seam is a seam or a registry.
//
// THE REGISTRATION PATH THIS DEMONSTRATES is documented in src/data/PLACE_REGISTRATION.md, and the
// gate that proves a place landed is `npm run check:atlas-integrity`.
//
// Determinism: pure data + one pure merge helper. No imports, no RNG, no Date, no side effects.

/**
 * Driftmark Survey — the worked example for src/data/PLACE_REGISTRATION.md.
 *
 * Deliberate design choices, each of which is the reason this record is the worked example rather
 * than an arbitrary one:
 *
 *  * SECTOR. `sector_tethys_junction` has global origin (12288, 8192). A place authored in Helios
 *    Prime proves nothing about frame handling, because Helios' origin IS (0,0) — that is precisely
 *    why the original projection defect survived (see 01_DECISIONS.md D2.1 and ledger RC-1). Both
 *    components of this record's sector-local centre are nonzero AND negative, so a conversion that
 *    drops the origin, or that adds it with the wrong sign, lands somewhere provably wrong.
 *      sector-local (-2050, -1370)  ->  global (10238, 6822)
 *
 *  * PLACEMENT. It sits on the inbound Helios -> Tethys chord, just outside the Customs Checkpoint,
 *    so it is a place the default textile route actually passes rather than set dressing in a corner.
 *    Its disc overlaps no existing Tethys zone (nearest is the Quiet Cache at ~1911 WU against a
 *    1000 WU sum-of-radii), so `zoneAt` stays unambiguous.
 *
 *  * NO `presence`. `planZoneSpawns` (sectorZones.js) filters on `presence`, so a zone without one
 *    contributes no spawns and cannot move combat behaviour or the deterministic 47a golden. An
 *    ordinary map-visible place must not have to justify itself to the simulation to exist.
 *
 *  * NO bespoke asset. There is no hand-authored hologram for this place and there must not need to
 *    be one — `src/core/atlasProxy.js` resolves it to a parametric procedural disc. This is the
 *    single most important property the worked example demonstrates: adding ordinary content must
 *    never be gated on an artist first modelling it.
 *
 * `threat: 1` overrides the `anomaly_deep` archetype default of 3. The Concord surveys this mark;
 * it is strange, not dangerous, and the threat tier is what the HUD reads.
 */
export const ZONE_TETHYS_DRIFTMARK = Object.freeze({
  id: 'zone_tethys_driftmark',
  name: 'Driftmark Survey',
  type: 'anomaly_deep',
  factionId: 'faction_archive',
  reason: 'A cluster of survey buoys pinned around a mass reading that will not hold still — the '
    + 'Archive re-measures it every pass and the numbers keep drifting.',
  center: Object.freeze({ x: -2050, z: -1370 }),
  radius: 480,
  threat: 1,
});

/**
 * sectorId -> additional authored zone records, appended to the per-sector tables.
 * Keyed by sector so the merge stays a pure append and can never shadow an existing sector's list.
 */
export const AUTHORED_PLACE_ZONES = Object.freeze({
  sector_tethys_junction: Object.freeze([ZONE_TETHYS_DRIFTMARK]),
});

/**
 * Append additive zone records onto an existing sectorId -> zone[] map.
 *
 * This is an APPEND, deliberately not an object spread. `{ ...base, ...additions }` would replace
 * `sector_tethys_junction`'s entire authored zone list with this file's single record, silently
 * deleting four shipped zones — a spread is the obvious-looking merge and it is the wrong one.
 *
 * Duplicate ids are NOT collapsed here. Two places sharing a stable id is an authoring bug, and
 * `scripts/check-atlas-integrity.mjs` names the offenders; quietly deduping would hide it.
 *
 * @param {Record<string, object[]>} base
 * @param {Record<string, object[]>} additions
 * @returns {Record<string, object[]>} a new map; `base` is not mutated
 */
export function appendAuthoredZones(base, additions = AUTHORED_PLACE_ZONES) {
  const merged = { ...base };
  for (const sectorId of Object.keys(additions || {}).sort()) {
    const extra = additions[sectorId];
    if (!Array.isArray(extra) || !extra.length) continue;
    merged[sectorId] = [...(merged[sectorId] || []), ...extra];
  }
  return merged;
}
