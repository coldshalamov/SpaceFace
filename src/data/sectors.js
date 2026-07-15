// src/data/sectors.js – canonical 24-sector persistent galaxy graph.
// Sector IDs use sector_ prefix; station IDs use station_ prefix; faction IDs use faction_ prefix.
// Fixed geography (stations/gates/fields/POIs) merged from sectorAnchors.js — see design/world-identity/PIPELINE.md.
import { applySectorAnchors } from './sectorAnchors.js';
import { FRONTIER_CORE_NEIGHBOR_PATCHES, FRONTIER_SECTORS } from './frontierRegions/index.js';
import { applyClaimableBodySites } from './claimableBodies.js';
import { applyPlanetStateAssignments } from './planetStates.js';
// Per ARCHITECTURE §0.8:
//   dangerTier(s) = clamp(round((1 - s.security) * 5), 0, 5)
//   wealthIndex(s) = clamp(0.3 + 0.16*tier + 0.10*(1-security), 0.3, 1.6)
//   dangerIndex(s) = clamp(0.05 + 0.22*tier + 0.25*(1-security), 0, 1.0)
// Pure data + pure math helpers, no imports.

export const STATION_TYPES = ['trade_hub', 'refinery', 'mining', 'fab', 'military', 'blackmarket', 'research'];
export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];

export const SECTOR_PALETTE_CLASSES = {
  // Helios / core — Top-50 rank-10 sky kit: cooler deeper void, cyan fill, readable fog depth.
  core: {
    key: 0xd8e8ff, rim: 0x7a6cff, fill: 0x4ad8ff, ambient: 0x384868,
    fog: 0x081228, fogDensity: 0.00022, nebulaTint: 0x2450a0, dust: 0x8ec0e8,
  },
  belt: {
    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
  },
  fringe: {
    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
  },
  anomaly: {
    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
  },
};

const CORE_SECTORS = [
  {
    id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
    factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
    palette: SECTOR_PALETTE_CLASSES.core,
    // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
    // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
    trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
    neighbors: ['sector_ceres_belt', 'sector_tethys_junction', 'sector_vesta_forge'],
    stations: [
      { id: 'station_helios',     name: 'Helios Station',  type: 'trade_hub', factionId: 'faction_scn', size: 'L', services: ['trade','shipyard','refuel','repair','missions'] },
      { id: 'station_coalition',  name: 'Coalition HQ',    type: 'military',  factionId: 'faction_scn', size: 'M', services: ['missions','repair','refuel'] },
    ],
    // A small safe asteroid claim close to the spawn point so new pilots can learn mining before
    // the wider sector opens up (no hostiles here).
    // Overnight B2 density: starter belt is findable and larger; secondary field near Coalition HQ.
    fields: [
      {
        id: 'f_helios_starter', type: 'ast_common_rock', countWeight: 1.0,
        center: { x: 720, z: -260 }, clusterRadius: 380, count: 42,
      },
      {
        id: 'f_helios_outer', type: 'ast_common_rock', countWeight: 0.7,
        center: { x: -900, z: 640 }, clusterRadius: 320, count: 28,
      },
    ],
    hazards: [],
    pois: [
      { id: 'poi_tutorial', type: 'beacon', name: 'Tutorial Beacon' },
      { id: 'poi_memorial', type: 'beacon', name: 'Memorial Array' },
      { id: 'poi_helios_yard', type: 'derelict', name: 'Outer Yard Derelict' },
    ],
  },
  {
    id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
    factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
    palette: SECTOR_PALETTE_CLASSES.belt,
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
    id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
    factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
    palette: SECTOR_PALETTE_CLASSES.core,
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
    id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
    factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
    palette: SECTOR_PALETTE_CLASSES.belt,
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
    id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
    factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
    palette: SECTOR_PALETTE_CLASSES.fringe,
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
    id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
    factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
    palette: SECTOR_PALETTE_CLASSES.fringe,
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
      // V2 §6 / M3: a claimable industrial moon — a body the player can claim and build on.
      { id: 'poi_claim_pallas', type: 'colony', name: 'Pallas Industrial Moon', claimable: true, size: 'M' },
    ],
  },
  {
    id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
    factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
    palette: SECTOR_PALETTE_CLASSES.belt,
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
    pois: [ { id: 'poi_colony', type: 'colony', name: 'Abandoned Mining Colony', claimable: true, size: 'S' } ],
  },
  {
    id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
    factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
    palette: SECTOR_PALETTE_CLASSES.fringe,
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
    id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
    factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
    palette: SECTOR_PALETTE_CLASSES.anomaly,
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
    id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
    factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
    palette: SECTOR_PALETTE_CLASSES.anomaly,
    trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
    neighbors: ['sector_charon_expanse'],
    stations: [
      { id: 'station_ashcache', name: 'Ruined Cache Station', type: 'blackmarket', factionId: 'faction_vael', size: 'S', services: ['repair','refuel','missions'], repGated: true },
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

export const SECTORS = [
  ...CORE_SECTORS.map((sector) => {
    const additions = FRONTIER_CORE_NEIGHBOR_PATCHES[sector.id];
    return additions
      ? { ...sector, neighbors: [...sector.neighbors, ...additions] }
      : sector;
  }),
  ...FRONTIER_SECTORS,
].map(applySectorAnchors).map(applyClaimableBodySites).map(applyPlanetStateAssignments);

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

export function surveyDataPrice(sector) {
  const tier = Math.max(0, Number(sector && sector.tier) || 0);
  return Math.round(750 + tier * 1250);
}
