// regionalEconomyProfiles.js — ECON-P1 authored regional production/consumption identities.
//
// Pure data only. One frozen profile per live sector (24). Commodity IDs and station roles
// must match the shipped catalogs (commodities.js producedBy/consumedBy + SECTORS station types).
// Consumers live in src/economy/regionalSupply.js; this file never touches credits/cargo/stock
// or spawns entities.
//
// Schema: spaceface.regionalEconomyProfile.v1

/** Stable schema id for validators and future save-side consumers. */
export const REGIONAL_ECONOMY_SCHEMA_ID = 'spaceface.regionalEconomyProfile.v1';

/** Station role vocabulary (mirrors sectors.js STATION_TYPES / commodities producedBy|consumedBy). */
export const STATION_ROLES = Object.freeze([
  'trade_hub', 'refinery', 'mining', 'fab', 'military', 'blackmarket', 'research',
]);

/**
 * Baseline pressure magnitude bounds used when materializing recipes (unitless stock pressure).
 * Keep inside economy event pressure comfort band (~0.3–0.7) with headroom.
 */
export const REGIONAL_PRESSURE_BOUNDS = Object.freeze({
  min: -0.85,
  max: 0.85,
  unitsMin: 1,
  unitsMax: 12,
});

/** Max produce / consume lines per region (recipe cap is 2× this). */
export const MAX_LINES_PER_SIDE = 4;

/**
 * @typedef {Readonly<{ commodityId: string, weight: number }>} RegionalCommodityLine
 * @typedef {Readonly<{
 *   sectorId: string,
 *   identityKey: string,
 *   primaryRole: string,
 *   secondaryRoles: ReadonlyArray<string>,
 *   produces: ReadonlyArray<RegionalCommodityLine>,
 *   consumes: ReadonlyArray<RegionalCommodityLine>,
 *   pressureBias: number,
 * }>} RegionalEconomyProfile
 */

function line(commodityId, weight) {
  return Object.freeze({ commodityId, weight });
}

function profile(def) {
  return Object.freeze({
    sectorId: def.sectorId,
    identityKey: def.identityKey,
    primaryRole: def.primaryRole,
    secondaryRoles: Object.freeze([...(def.secondaryRoles || [])]),
    produces: Object.freeze((def.produces || []).map((p) => line(p.commodityId, p.weight))),
    consumes: Object.freeze((def.consumes || []).map((c) => line(c.commodityId, c.weight))),
    pressureBias: def.pressureBias,
  });
}

/**
 * Authored 24-region identities. Each region has a distinct identityKey and a unique
 * produce∪consume signature so similar station-type clusters (blackmarket / research belts)
 * still read as different economies. Commodity lines are constrained to roles the sector's
 * stations can hold (validated by regionalSupply / check-economy-regional-supply).
 */
export const REGIONAL_ECONOMY_PROFILES = Object.freeze([
  // ── Story core (10) ────────────────────────────────────────────────────────────────────────
  profile({
    sectorId: 'sector_helios_prime',
    identityKey: 'core_trade_capital',
    primaryRole: 'trade_hub',
    secondaryRoles: ['military'],
    pressureBias: 0.55,
    produces: [
      { commodityId: 'cmdty_food', weight: 0.95 },
      { commodityId: 'cmdty_luxury_goods', weight: 0.70 },
      { commodityId: 'cmdty_art', weight: 0.55 },
    ],
    consumes: [
      { commodityId: 'cmdty_fuel_cells', weight: 0.85 },
      { commodityId: 'cmdty_munitions', weight: 0.65 },
      { commodityId: 'cmdty_classified_salvage', weight: 0.50 },
    ],
  }),
  profile({
    sectorId: 'sector_ceres_belt',
    identityKey: 'belt_ore_refinery',
    primaryRole: 'refinery',
    secondaryRoles: ['mining'],
    pressureBias: 0.62,
    produces: [
      { commodityId: 'cmdty_ore_iron', weight: 0.95 },
      { commodityId: 'cmdty_refined_metals', weight: 0.90 },
      { commodityId: 'cmdty_fuel_cells', weight: 0.75 },
      { commodityId: 'cmdty_jump_fuel_canister', weight: 0.60 },
    ],
    consumes: [
      { commodityId: 'cmdty_food', weight: 0.80 },
      { commodityId: 'cmdty_consumer_goods', weight: 0.55 },
    ],
  }),
  profile({
    sectorId: 'sector_tethys_junction',
    identityKey: 'junction_customs_corridor',
    primaryRole: 'trade_hub',
    secondaryRoles: ['military'],
    pressureBias: 0.58,
    produces: [
      { commodityId: 'cmdty_consumer_goods', weight: 0.85 },
      { commodityId: 'cmdty_weapons', weight: 0.70 },
      { commodityId: 'cmdty_munitions', weight: 0.50 },
    ],
    consumes: [
      { commodityId: 'cmdty_fuel_cells', weight: 0.90 },
      { commodityId: 'cmdty_microchips', weight: 0.65 },
      { commodityId: 'cmdty_electronics', weight: 0.55 },
    ],
  }),
  profile({
    sectorId: 'sector_vesta_forge',
    identityKey: 'forge_fab_complex',
    primaryRole: 'fab',
    secondaryRoles: ['mining'],
    pressureBias: 0.64,
    produces: [
      { commodityId: 'cmdty_comp_hullplate', weight: 0.95 },
      { commodityId: 'cmdty_comp_circuitry', weight: 0.85 },
      { commodityId: 'cmdty_explosive_compound', weight: 0.75 },
      { commodityId: 'cmdty_textiles', weight: 0.55 },
    ],
    consumes: [
      { commodityId: 'cmdty_refined_metals', weight: 0.90 },
      { commodityId: 'cmdty_alloys', weight: 0.70 },
      { commodityId: 'cmdty_polymers', weight: 0.50 },
    ],
  }),
  profile({
    sectorId: 'sector_pallas_drift',
    identityKey: 'drift_grey_market',
    primaryRole: 'trade_hub',
    secondaryRoles: ['blackmarket'],
    pressureBias: 0.60,
    produces: [
      { commodityId: 'cmdty_luxury_goods', weight: 0.80 },
      { commodityId: 'cmdty_art', weight: 0.50 },
    ],
    consumes: [
      { commodityId: 'cmdty_food', weight: 0.75 },
      { commodityId: 'cmdty_stolen_goods', weight: 0.55 },
      { commodityId: 'cmdty_ice_water', weight: 0.45 },
      { commodityId: 'cmdty_textiles', weight: 0.40 },
    ],
  }),
  profile({
    sectorId: 'sector_io_reach',
    identityKey: 'reach_frontier_hub',
    primaryRole: 'trade_hub',
    secondaryRoles: [],
    pressureBias: 0.52,
    produces: [
      { commodityId: 'cmdty_food', weight: 0.80 },
      { commodityId: 'cmdty_consumer_goods', weight: 0.65 },
    ],
    consumes: [
      { commodityId: 'cmdty_medical', weight: 0.85 },
      { commodityId: 'cmdty_fuel_cells', weight: 0.70 },
      { commodityId: 'cmdty_ice_water', weight: 0.55 },
      { commodityId: 'cmdty_jump_fuel_canister', weight: 0.40 },
    ],
  }),
  profile({
    sectorId: 'sector_charon_expanse',
    identityKey: 'expanse_deep_refinery',
    primaryRole: 'refinery',
    secondaryRoles: [],
    pressureBias: 0.66,
    produces: [
      { commodityId: 'cmdty_refined_metals', weight: 0.95 },
      { commodityId: 'cmdty_alloys', weight: 0.80 },
      { commodityId: 'cmdty_polymers', weight: 0.70 },
      { commodityId: 'cmdty_fuel_cells', weight: 0.60 },
    ],
    consumes: [
      { commodityId: 'cmdty_ore_iron', weight: 0.85 },
      { commodityId: 'cmdty_ore_platinoid', weight: 0.70 },
      { commodityId: 'cmdty_volatiles', weight: 0.55 },
    ],
  }),
  profile({
    sectorId: 'sector_sker_haven',
    identityKey: 'sker_bazaar_den',
    primaryRole: 'blackmarket',
    secondaryRoles: [],
    pressureBias: 0.68,
    produces: [
      { commodityId: 'cmdty_narcotics', weight: 0.95 },
      { commodityId: 'cmdty_classified_salvage', weight: 0.60 },
    ],
    consumes: [
      { commodityId: 'cmdty_stolen_goods', weight: 0.85 },
      { commodityId: 'cmdty_weapons', weight: 0.70 },
      { commodityId: 'cmdty_luxury_goods', weight: 0.50 },
    ],
  }),
  profile({
    sectorId: 'sector_veil_nebula',
    identityKey: 'veil_anomaly_lab',
    primaryRole: 'research',
    secondaryRoles: [],
    pressureBias: 0.63,
    produces: [
      { commodityId: 'cmdty_quantum_cores', weight: 0.95 },
      { commodityId: 'cmdty_medical', weight: 0.75 },
    ],
    consumes: [
      { commodityId: 'cmdty_exotic_xenium', weight: 0.90 },
      { commodityId: 'cmdty_gas_helium3', weight: 0.70 },
      { commodityId: 'cmdty_crystal_lumin', weight: 0.55 },
      { commodityId: 'cmdty_comp_circuitry', weight: 0.45 },
    ],
  }),
  profile({
    sectorId: 'sector_ashfall_reach',
    identityKey: 'ashfall_war_cache',
    primaryRole: 'blackmarket',
    secondaryRoles: [],
    pressureBias: 0.72,
    produces: [
      { commodityId: 'cmdty_classified_salvage', weight: 0.95 },
      { commodityId: 'cmdty_stolen_goods', weight: 0.70 },
      { commodityId: 'cmdty_exotic_amazonite', weight: 0.55 },
    ],
    consumes: [
      { commodityId: 'cmdty_munitions', weight: 0.90 },
      { commodityId: 'cmdty_explosive_compound', weight: 0.75 },
      { commodityId: 'cmdty_impulse_charge', weight: 0.55 },
    ],
  }),

  // ── Frontier west ──────────────────────────────────────────────────────────────────────────
  profile({
    sectorId: 'sector_nyx_march',
    identityKey: 'nyx_smuggler_march',
    primaryRole: 'blackmarket',
    secondaryRoles: [],
    pressureBias: 0.61,
    produces: [
      { commodityId: 'cmdty_narcotics', weight: 0.85 },
      { commodityId: 'cmdty_classified_salvage', weight: 0.55 },
    ],
    consumes: [
      { commodityId: 'cmdty_weapons', weight: 0.80 },
      { commodityId: 'cmdty_impulse_charge', weight: 0.65 },
      { commodityId: 'cmdty_food', weight: 0.50 },
    ],
  }),
  profile({
    sectorId: 'sector_hyperion_cut',
    identityKey: 'hyperion_cut_refinery',
    primaryRole: 'refinery',
    secondaryRoles: ['mining'],
    pressureBias: 0.60,
    produces: [
      { commodityId: 'cmdty_ore_platinoid', weight: 0.90 },
      { commodityId: 'cmdty_gas_hydrogen', weight: 0.80 },
      { commodityId: 'cmdty_fuel_cells', weight: 0.75 },
      { commodityId: 'cmdty_scrap_metal', weight: 0.50 },
    ],
    consumes: [
      { commodityId: 'cmdty_food', weight: 0.70 },
      { commodityId: 'cmdty_medical', weight: 0.55 },
    ],
  }),
  profile({
    sectorId: 'sector_kepler_scar',
    identityKey: 'kepler_fence_ring',
    primaryRole: 'blackmarket',
    secondaryRoles: [],
    pressureBias: 0.59,
    produces: [
      { commodityId: 'cmdty_stolen_goods', weight: 0.95 },
    ],
    consumes: [
      { commodityId: 'cmdty_luxury_goods', weight: 0.80 },
      { commodityId: 'cmdty_art', weight: 0.65 },
      { commodityId: 'cmdty_narcotics', weight: 0.45 },
    ],
  }),
  profile({
    sectorId: 'sector_orcus_shadow',
    identityKey: 'orcus_shadow_lab',
    primaryRole: 'research',
    secondaryRoles: [],
    pressureBias: 0.67,
    produces: [
      { commodityId: 'cmdty_quantum_cores', weight: 0.90 },
    ],
    consumes: [
      { commodityId: 'cmdty_exotic_xenium', weight: 0.95 },
      { commodityId: 'cmdty_crystal_lumin', weight: 0.75 },
      { commodityId: 'cmdty_exotic_amazonite', weight: 0.50 },
    ],
  }),

  // ── Frontier north ─────────────────────────────────────────────────────────────────────────
  profile({
    sectorId: 'sector_rhea_cinder',
    identityKey: 'rhea_cinder_mines',
    primaryRole: 'mining',
    secondaryRoles: [],
    pressureBias: 0.65,
    produces: [
      { commodityId: 'cmdty_ore_iron', weight: 0.90 },
      { commodityId: 'cmdty_silicate', weight: 0.80 },
      { commodityId: 'cmdty_scrap_metal', weight: 0.70 },
      { commodityId: 'cmdty_ore_bronzium', weight: 0.55 },
    ],
    consumes: [
      { commodityId: 'cmdty_fuel_cells', weight: 0.85 },
      { commodityId: 'cmdty_food', weight: 0.70 },
      { commodityId: 'cmdty_consumer_goods', weight: 0.45 },
    ],
  }),
  profile({
    sectorId: 'sector_haumea_rift',
    identityKey: 'haumea_isotope_lab',
    primaryRole: 'research',
    secondaryRoles: [],
    pressureBias: 0.58,
    produces: [
      { commodityId: 'cmdty_medical', weight: 0.90 },
      { commodityId: 'cmdty_quantum_cores', weight: 0.60 },
    ],
    consumes: [
      { commodityId: 'cmdty_gas_helium3', weight: 0.95 },
      { commodityId: 'cmdty_crystal_silica', weight: 0.70 },
      { commodityId: 'cmdty_ice_water', weight: 0.50 },
    ],
  }),
  profile({
    sectorId: 'sector_eris_margin',
    identityKey: 'eris_margin_den',
    primaryRole: 'blackmarket',
    secondaryRoles: [],
    pressureBias: 0.64,
    produces: [
      { commodityId: 'cmdty_narcotics', weight: 0.80 },
      { commodityId: 'cmdty_classified_salvage', weight: 0.75 },
    ],
    consumes: [
      { commodityId: 'cmdty_munitions', weight: 0.80 },
      { commodityId: 'cmdty_food', weight: 0.65 },
      { commodityId: 'cmdty_weapons', weight: 0.50 },
    ],
  }),
  profile({
    sectorId: 'sector_phoebe_echo',
    identityKey: 'phoebe_echo_observatory',
    primaryRole: 'research',
    secondaryRoles: [],
    pressureBias: 0.70,
    produces: [
      { commodityId: 'cmdty_quantum_cores', weight: 0.85 },
      { commodityId: 'cmdty_medical', weight: 0.55 },
    ],
    consumes: [
      { commodityId: 'cmdty_exotic_amazonite', weight: 0.95 },
      { commodityId: 'cmdty_exotic_xenium', weight: 0.70 },
      { commodityId: 'cmdty_comp_circuitry', weight: 0.50 },
    ],
  }),

  // ── Frontier east ──────────────────────────────────────────────────────────────────────────
  profile({
    sectorId: 'sector_nereid_shoal',
    identityKey: 'nereid_shoal_exchange',
    primaryRole: 'trade_hub',
    secondaryRoles: ['mining'],
    pressureBias: 0.57,
    produces: [
      { commodityId: 'cmdty_ore_copper', weight: 0.85 },
      { commodityId: 'cmdty_ice_water', weight: 0.80 },
      { commodityId: 'cmdty_crystal_lumin', weight: 0.60 },
      { commodityId: 'cmdty_volatiles', weight: 0.50 },
    ],
    consumes: [
      { commodityId: 'cmdty_fuel_cells', weight: 0.75 },
      { commodityId: 'cmdty_medical', weight: 0.60 },
      { commodityId: 'cmdty_electronics', weight: 0.45 },
    ],
  }),
  profile({
    sectorId: 'sector_proteus_well',
    identityKey: 'proteus_well_fence',
    primaryRole: 'blackmarket',
    secondaryRoles: [],
    pressureBias: 0.56,
    produces: [
      { commodityId: 'cmdty_stolen_goods', weight: 0.85 },
      { commodityId: 'cmdty_classified_salvage', weight: 0.70 },
    ],
    consumes: [
      { commodityId: 'cmdty_luxury_goods', weight: 0.75 },
      { commodityId: 'cmdty_impulse_charge', weight: 0.55 },
      { commodityId: 'cmdty_narcotics', weight: 0.50 },
    ],
  }),
  profile({
    sectorId: 'sector_triton_wake',
    identityKey: 'triton_wake_medlab',
    primaryRole: 'research',
    secondaryRoles: [],
    pressureBias: 0.59,
    produces: [
      { commodityId: 'cmdty_medical', weight: 0.95 },
    ],
    consumes: [
      { commodityId: 'cmdty_comp_circuitry', weight: 0.85 },
      { commodityId: 'cmdty_microchips', weight: 0.75 },
      { commodityId: 'cmdty_crystal_silica', weight: 0.55 },
      { commodityId: 'cmdty_gas_helium3', weight: 0.45 },
    ],
  }),
  profile({
    sectorId: 'sector_eunomia_gulf',
    identityKey: 'eunomia_gulf_arsenal',
    primaryRole: 'blackmarket',
    secondaryRoles: [],
    pressureBias: 0.66,
    produces: [
      { commodityId: 'cmdty_narcotics', weight: 0.70 },
      { commodityId: 'cmdty_stolen_goods', weight: 0.65 },
    ],
    consumes: [
      { commodityId: 'cmdty_impulse_charge', weight: 0.90 },
      { commodityId: 'cmdty_weapons', weight: 0.80 },
      { commodityId: 'cmdty_munitions', weight: 0.60 },
    ],
  }),

  // ── Frontier south ─────────────────────────────────────────────────────────────────────────
  profile({
    sectorId: 'sector_sedna_dark',
    identityKey: 'sedna_dark_array',
    primaryRole: 'research',
    secondaryRoles: [],
    pressureBias: 0.71,
    produces: [
      { commodityId: 'cmdty_quantum_cores', weight: 0.95 },
    ],
    consumes: [
      { commodityId: 'cmdty_exotic_xenium', weight: 0.90 },
      { commodityId: 'cmdty_crystal_lumin', weight: 0.80 },
      { commodityId: 'cmdty_gas_helium3', weight: 0.55 },
    ],
  }),
  profile({
    sectorId: 'sector_dione_lane',
    identityKey: 'dione_lane_patrol_hub',
    primaryRole: 'trade_hub',
    secondaryRoles: ['military'],
    pressureBias: 0.54,
    produces: [
      { commodityId: 'cmdty_food', weight: 0.75 },
      { commodityId: 'cmdty_munitions', weight: 0.85 },
      { commodityId: 'cmdty_weapons', weight: 0.55 },
    ],
    consumes: [
      { commodityId: 'cmdty_fuel_cells', weight: 0.80 },
      { commodityId: 'cmdty_refined_metals', weight: 0.70 },
      { commodityId: 'cmdty_comp_hullplate', weight: 0.50 },
    ],
  }),
]);

/** sectorId → profile (built once). */
export const REGIONAL_ECONOMY_BY_ID = Object.freeze(
  Object.fromEntries(REGIONAL_ECONOMY_PROFILES.map((p) => [p.sectorId, p])),
);

/** Deterministic sector id list matching profile authoring order. */
export const REGIONAL_ECONOMY_SECTOR_IDS = Object.freeze(
  REGIONAL_ECONOMY_PROFILES.map((p) => p.sectorId),
);

export function getRegionalEconomyProfile(sectorId) {
  if (!sectorId || typeof sectorId !== 'string') return null;
  return REGIONAL_ECONOMY_BY_ID[sectorId] || null;
}
