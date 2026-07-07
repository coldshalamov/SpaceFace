// commodityMoralTags.js — BP-12 packet CARGO_REPUTATION_GLYPH ("Cargo Conscience") data addendum.
//
// The hold has a MORAL COLOR. Medicine reads as goodwill to the Frontier; weapons read as a Concord
// frown; contraband reads as Quiet favor. This is a LEAN, never a rep change (the packet's named
// failure mode: implying a delta the sim won't apply). The actual deltas still come ONLY from the
// shipped contraband:scanned / mission:completed paths — this map is read-only display data.
//
// One source of truth (the packet's "data addendum" rule): the moralTag lives HERE and is merged onto
// each commodity record at load (the same pattern COMMODITY_FLAVOR uses in commodities.js:84-88), so
// the 43 balance rows stay balance-only. moralTag is OPTIONAL — a commodity with no entry is neutral.
//
// moralTag values (enumerated — a tag outside this set renders NOTHING, never invented sentiment):
//   'humanitarian' — relief/medicine/sustenance: the Frontier (independents) leans warm.
//   'military'     — weapons/munitions/war materiel: Concord (lawful) leans approving, Frontier wary.
//   'contraband'   — narcotics/stolen goods: the Quiet (smugglers) lean favorable, Concord hostile.
//   'luxury'       — art/luxury: Meridian (corporate) leans approving.
//   'industrial'   — fuel/ores/refined: Drift (miners) leans approving.
// Neutral commodities (ores, gases, components, salvage) carry no moralTag — they are amoral cargo.

export const COMMODITY_MORAL_TAGS = Object.freeze({
  // Humanitarian — Frontier goodwill
  cmdty_medical: 'humanitarian',
  cmdty_food: 'humanitarian',
  cmdty_ice_water: 'humanitarian',

  // Military — Concord approving, Frontier wary
  cmdty_weapons: 'military',
  cmdty_munitions: 'military',
  cmdty_impulse_charge: 'military',

  // Contraband — Quiet favor, Concord hostile
  cmdty_narcotics: 'contraband',
  cmdty_stolen_goods: 'contraband',

  // Luxury — Meridian approving
  cmdty_luxury_goods: 'luxury',
  cmdty_art: 'luxury',

  // Industrial — Drift approving
  cmdty_fuel_cells: 'industrial',
  cmdty_refined_metals: 'industrial',
  cmdty_alloys: 'industrial',
  cmdty_polymers: 'industrial',
});

// The enumerated set (the conscience module keys off THIS — anything else is neutral/unknown).
export const MORAL_TAGS = Object.freeze(['humanitarian', 'military', 'contraband', 'luxury', 'industrial']);

export default COMMODITY_MORAL_TAGS;
