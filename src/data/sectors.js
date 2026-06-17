// src/data/sectors.js – 10-sector core->frontier graph.
// Sector IDs use sector_ prefix; station IDs use station_ prefix; faction IDs use faction_ prefix.
// Per ARCHITECTURE §0.8:
//   dangerTier(s) = clamp(round((1 - s.security) * 5), 0, 5)
//   wealthIndex(s) = clamp(0.3 + 0.16*tier + 0.10*(1-security), 0.3, 1.6)
//   dangerIndex(s) = clamp(0.05 + 0.22*tier + 0.25*(1-security), 0, 1.0)
// Pure data + pure math helpers, no imports.

export const STATION_TYPES = ['trade_hub', 'refinery', 'mining', 'fab', 'military', 'blackmarket', 'research'];
export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];

export const SECTORS = [
  {
    id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98,
    factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
    // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
    // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
    trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
    neighbors: ['sector_ceres_belt', 'sector_tethys_junction', 'sector_vesta_forge'],
    stations: [
      { id: 'station_helios',     name: 'Helios Station',  type: 'trade_hub', factionId: 'faction_scn', size: 'L', services: ['trade','shipyard','refuel','repair','missions'] },
      { id: 'station_coalition',  name: 'Coalition HQ',    type: 'military',  factionId: 'faction_scn', size: 'M', services: ['missions','repair','refuel'] },
    ],
    // A small safe asteroid cluster so new pilots can learn mining at home (no hostiles here).
    fields: [ { id: 'f_helios_starter', type: 'ast_common_rock', countWeight: 1.0 } ],
    hazards: [],
    pois: [
      { id: 'poi_tutorial', type: 'beacon', name: 'Tutorial Beacon' },
      { id: 'poi_memorial', type: 'beacon', name: 'Memorial Array' },
    ],
  },
  {
    id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72,
    factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
    trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
    neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
    stations: [
      { id: 'station_ceres',   name: 'Ceres Refinery', type: 'refinery', factionId: 'faction_dmc', size: 'M', services: ['trade','refuel','repair','ore_buy','refine'] },
      { id: 'station_beltout', name: 'Belt Outpost',   type: 'mining',   factionId: 'faction_dmc', size: 'S', services: ['trade','missions','ore_buy'] },
    ],
    fields: [
      { id: 'f_ceres_1', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_ceres_2', type: 'ast_common_rock', countWeight: 1.0 },
      { id: 'f_ceres_3', type: 'ast_metallic',    countWeight: 0.8 },
    ],
    hazards: [ { type: 'dense_asteroid', center: { x: 600, z: -400 }, radius: 700, intensity: 0.5 } ],
    pois: [
      { id: 'poi_driller', type: 'derelict', name: 'Abandoned Driller' },
      { id: 'poi_survey',  type: 'cache',    name: 'Survey Cache' },
    ],
  },
  {
    id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65,
    factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
    trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
    neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
    stations: [
      { id: 'station_tethys',  name: 'Tethys Trade Hub', type: 'trade_hub', factionId: 'faction_mts', size: 'L', services: ['trade','shipyard','refuel','repair','missions'] },
      { id: 'station_customs', name: 'Customs Gate',      type: 'military',  factionId: 'faction_scn', size: 'S', services: ['toll','scan','refuel'] },
    ],
    fields: [ { id: 'f_tethys_1', type: 'ast_common_rock', countWeight: 1.0 } ],
    hazards: [],
    pois: [
      { id: 'poi_blackmkt', type: 'cache', name: 'Black Market Contact', hidden: true, factionId: 'faction_quiet' },
    ],
  },
  {
    id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60,
    factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
    trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
    neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
    stations: [
      { id: 'station_forge',  name: 'Forge Foundry', type: 'fab',    factionId: 'faction_dmc',   size: 'M', services: ['trade','shipyard','repair','refine','module_craft'] },
      { id: 'station_depot3', name: 'Refuel Depot',  type: 'mining', factionId: 'faction_choir', size: 'S', services: ['refuel'] },
    ],
    fields: [
      { id: 'f_vesta_1', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_vesta_2', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_vesta_3', type: 'ast_crystalline', countWeight: 0.6 },
    ],
    hazards: [ { type: 'radiation', center: { x: -800, z: 500 }, radius: 600, intensity: 0.4 } ],
    pois: [ { id: 'poi_freighter', type: 'derelict', name: 'Derelict Freighter' } ],
  },
  {
    id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42,
    factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
    trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
    neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
    stations: [
      { id: 'station_drift',    name: 'Drift Market', type: 'trade_hub',   factionId: 'faction_mts',   size: 'M', services: ['trade','refuel','repair','missions'] },
      { id: 'station_smuggler', name: 'Smuggler Den', type: 'blackmarket', factionId: 'faction_quiet', size: 'S', services: ['black_market','missions','refuel'] },
    ],
    fields: [
      { id: 'f_pallas_1', type: 'ast_metallic', countWeight: 1.0 },
      { id: 'f_pallas_2', type: 'ast_icy',       countWeight: 0.9 },
      { id: 'f_pallas_3', type: 'ast_icy',       countWeight: 0.7 },
    ],
    hazards: [ { type: 'nebula', center: { x: 400, z: 600 }, radius: 800, intensity: 0.4 } ],
    pois: [
      { id: 'poi_pwreck', type: 'wreck', name: 'Pirate Wreckage' },
      { id: 'poi_hcache', type: 'cache', name: 'Hidden Cache', hidden: true },
    ],
  },
  {
    id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35,
    factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
    trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
    neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
    stations: [
      { id: 'station_reach', name: 'Reach Station', type: 'trade_hub', factionId: 'faction_free', size: 'M', services: ['trade','repair','refuel','missions'], contested: true },
    ],
    fields: [
      { id: 'f_io_1', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_io_2', type: 'ast_crystalline', countWeight: 0.8 },
    ],
    hazards: [
      { type: 'dense_asteroid', center: { x: -500, z: -300 }, radius: 700, intensity: 0.5 },
      { type: 'nebula',         center: { x: 700,  z: 400  }, radius: 900, intensity: 0.45 },
    ],
    pois: [
      { id: 'poi_merc',    type: 'colony',   name: 'Mercenary Outpost', factionId: 'faction_quiet' },
      { id: 'poi_cruiser', type: 'derelict', name: 'Derelict Cruiser' },
    ],
  },
  {
    id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30,
    factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
    trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
    neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
    stations: [
      { id: 'station_expanse', name: 'Expanse Refinery', type: 'refinery', factionId: 'faction_dmc', size: 'M', services: ['ore_buy','refuel','repair','refine'] },
    ],
    fields: [
      { id: 'f_charon_1', type: 'ast_rare_exotic', countWeight: 0.7 },
      { id: 'f_charon_2', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_charon_3', type: 'ast_rare_exotic', countWeight: 0.6 },
    ],
    hazards: [
      { type: 'radiation',      center: { x: 300,  z: -700 }, radius: 700, intensity: 0.5 },
      { type: 'dense_asteroid', center: { x: -600, z: 500  }, radius: 650, intensity: 0.5 },
    ],
    pois: [ { id: 'poi_colony', type: 'colony', name: 'Abandoned Mining Colony' } ],
  },
  {
    id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08,
    factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
    trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
    neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
    stations: [
      { id: 'station_sker', name: 'Sker Bazaar', type: 'blackmarket', factionId: 'faction_reach', size: 'M', services: ['black_market','repair','refuel','missions'], repGated: true },
    ],
    fields: [ { id: 'f_sker_1', type: 'ast_rare_exotic', countWeight: 0.8 } ],
    hazards: [
      { type: 'dense_asteroid', center: { x: 500,  z: 300  }, radius: 800, intensity: 0.6 },
      { type: 'dense_asteroid', center: { x: -500, z: -400 }, radius: 700, intensity: 0.6 },
    ],
    pois: [
      { id: 'poi_bounty', type: 'wreck', name: 'Bounty Wrecks' },
      { id: 'poi_stash',  type: 'cache', name: 'Stash Cache', hidden: true },
    ],
  },
  {
    id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12,
    factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
    trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
    neighbors: ['sector_io_reach', 'sector_sker_haven'],
    wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
    stations: [
      { id: 'station_veil', name: 'Research Station Veil', type: 'research', factionId: 'faction_free', size: 'M', services: ['scan_tech','missions','repair'] },
    ],
    fields: [ { id: 'f_veil_1', type: 'ast_gas_cloud', countWeight: 1.0 } ],
    hazards: [
      { type: 'nebula',    center: { x: 0,   z: 0    }, radius: 3000, intensity: 0.9 },
      { type: 'radiation', center: { x: 200, z: -200 }, radius: 600,  intensity: 0.6 },
    ],
    pois: [
      { id: 'poi_anomaly',  type: 'anomaly',  name: 'Anomaly Signal' },
      { id: 'poi_wormhole', type: 'wormhole', name: 'Wormhole', gatedBy: 'tech:tech_long_range_survey' },
    ],
  },
  {
    id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05,
    factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
    trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
    neighbors: ['sector_charon_expanse'],
    stations: [
      { id: 'station_ashcache', name: 'Ruined Cache Station', type: 'blackmarket', factionId: 'faction_vael', size: 'S', services: ['repair','refuel'], repGated: true },
    ],
    fields: [
      { id: 'f_ash_1', type: 'ast_rare_exotic', countWeight: 1.0 },
      { id: 'f_ash_2', type: 'ast_rare_exotic', countWeight: 1.0 },
    ],
    hazards: [
      { type: 'radiation', center: { x: 0,   z: 0   }, radius: 2000, intensity: 0.8, moving: true },
      { type: 'debris',    center: { x: 400, z: 300 }, radius: 800,  intensity: 0.5 },
    ],
    pois: [
      { id: 'poi_boss',  type: 'anomaly', name: 'Boss Arena Signal' },
      { id: 'poi_vault', type: 'cache',   name: 'Ancient Vault', hidden: true },
    ],
  },
];

// Security helper functions per ARCHITECTURE §0.8.
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

export function dangerTier(sector) {
  return clamp(Math.round((1 - sector.security) * 5), 0, 5);
}

export function wealthIndex(sector) {
  const tier = sector.tier;
  return clamp(0.3 + 0.16 * tier + 0.10 * (1 - sector.security), 0.3, 1.6);
}

export function dangerIndex(sector) {
  const tier = sector.tier;
  return clamp(0.05 + 0.22 * tier + 0.25 * (1 - sector.security), 0, 1.0);
}
