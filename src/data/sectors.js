// src/data/sectors.js – canonical 24-sector persistent galaxy graph.
// Sector IDs use sector_ prefix; station IDs use station_ prefix; faction IDs use faction_ prefix.
// Fixed geography (stations/gates/fields/POIs) merged from sectorAnchors.js — see design/world-identity/PIPELINE.md.
import {
  applySectorAnchors,
  CERES_WRECK_CATHEDRAL_LOCAL_POS,
} from './sectorAnchors.js';
import { FRONTIER_CORE_NEIGHBOR_PATCHES, FRONTIER_SECTORS } from './frontierRegions/index.js';
import { applyClaimableBodySites } from './claimableBodies.js';
import { applyPlanetStateAssignments } from './planetStates.js';
import { appendPq019FacilityPois } from './heistFacilities.js';
// Per ARCHITECTURE §0.8:
//   dangerTier(s) = clamp(round((1 - s.security) * 5), 0, 5)
//   wealthIndex(s) = clamp(0.3 + 0.16*tier + 0.10*(1-security), 0.3, 1.6)
//   dangerIndex(s) = clamp(0.05 + 0.22*tier + 0.25*(1-security), 0, 1.0)
// Pure data + pure math helpers, no imports.

export const STATION_TYPES = ['trade_hub', 'refinery', 'mining', 'fab', 'military', 'blackmarket', 'research'];
export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];

export const SECTOR_PALETTE_CLASSES = {
  // Helios / core — neutral photographic rig with true-black negative space.
  core: {
    // Civilized space uses a neutral photographic rig. Sector identity comes from authored
    // landmarks and localized background structure, not a cyan wash painted over every hull.
    key: 0xe8edf4, rim: 0x8fa4bf, fill: 0xb8c2cc, ambient: 0x3e4652,
    fog: 0x05070b, fogDensity: 0, nebulaTint: 0x2450a0, dust: 0x8ec0e8,
  },
  belt: {
    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
    fog: 0x090705, fogDensity: 0.00002, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
  },
  fringe: {
    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
    fog: 0x090504, fogDensity: 0.00003, nebulaTint: 0x8a1e1e, dust: 0xc15032,
  },
  anomaly: {
    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
    fog: 0x08050d, fogDensity: 0.00012, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
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
      { id: 'station_helios',     name: 'Helios Station',  type: 'trade_hub', factionId: 'faction_scn', size: 'L', services: ['trade','shipyard','refuel','repair','missions'],
        // Helios keeps a standing shortage book for the starter seam's iron. This changes only the
        // listing's stock equilibrium; the commodity price curve and every other market stay shared.
        marketEquilibriumFactors: { cmdty_ore_iron: 0.09 },
        chartNote: "Everything in stock, everything watched. Fair prices, constant questions." },
      { id: 'station_coalition',  name: 'Coalition HQ',    type: 'military',  factionId: 'faction_scn', size: 'M', services: ['missions','repair','refuel'],
        chartNote: "Concord's desk. Clean contracts, and a clean record while you're docked." },
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
      {
        id: 'poi_memorial',
        type: 'beacon',
        name: 'The Candle Fleet',
        scannerSignalKind: 'archive',
        flavorTargetRef: 'landmark_c3_candle_fleet',
        discoveryPlate: {
          title: 'What Was the Pit?',
          body: "Twenty-four candles burn around a deliberately dark twenty-fifth plinth. Its black-box record carries one telemetry smear on the Pit convoy's final course.",
        },
      },
      { id: 'poi_helios_yard', type: 'derelict', name: 'Outer Yard Derelict' },
      // Lane furniture (design/fiction/LANE_FURNITURE.md). Deliberately placed ON the corridor a
      // new pilot actually flies — spawn, tutorial beacon, starter seam — because the camera can
      // only see ~50 world units of ground plane and clutter parked anywhere else is radar content.
      { id: 'poi_helios_lane_pin', type: 'beacon', name: 'Corridor Pin 44-C' },
      { id: 'poi_helios_tally', type: 'beacon', name: 'Helios Weigh-Point' },
      { id: 'poi_helios_claim_mark', type: 'beacon', name: 'Starter Seam Claim' },
      { id: 'poi_helios_locker', type: 'derelict', name: 'Bonded Cold Locker' },
      { id: 'poi_helios_ash_pin', type: 'derelict', name: 'Ash Pin — SPAN-HOLD' },
      { id: 'poi_helios_whistle', type: 'derelict', name: 'Outer Yard Whistle' },
    ],
  },
  {
    id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
    factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
    industries: { mining: true, refinery: true },
    palette: SECTOR_PALETTE_CLASSES.belt,
    // First-hop starter pocket: ordinary ambient danger stays readable while the player is still
    // learning the corridor. Tier-2 sectors restore the full combat band and authored elites.
    trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [1, 2],
    neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
    stations: [
      { id: 'station_ceres',   name: 'Ceres Refinery', type: 'refinery', factionId: 'faction_dmc', size: 'M', services: ['trade','refuel','repair','ore_buy','refine'],
        chartNote: 'Refinery row — buys ore dear, sells plates cheap.' },
      { id: 'station_beltout', name: 'Belt Outpost',   type: 'mining',   factionId: 'faction_dmc', size: 'S', services: ['trade','missions','ore_buy'],
        chartNote: 'Rock crews and a scale. Ore moves same-shift; nothing else does.' },
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
      {
        id: 'poi_ceres_throughline',
        type: 'beacon',
        name: 'Throughline Weigh Beacon',
        factionId: 'faction_dmc',
      },
      {
        id: 'world_site_wreck_cathedral', type: 'wreck', name: 'Wreck Cathedral',
        anchor: CERES_WRECK_CATHEDRAL_LOCAL_POS,
        runtimeOwner: 'asteroidSites',
      },
    ],
  },
  {
    id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
    factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
    palette: SECTOR_PALETTE_CLASSES.core,
    trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [1, 2],
    neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
    stations: [
      { id: 'station_tethys',  name: 'Tethys Trade Hub', type: 'trade_hub', factionId: 'faction_mts', size: 'L',
        missionProfile: 'contracts_hub', boardAnchorType: 'escort',
        dispatchLabel: 'JUNCTION DISPATCH', dispatchConflictKey: 'faction_dmc:faction_mts',
        services: ['trade','shipyard','refuel','repair','missions'],
        chartNote: 'Convoys, patrols, and sealed freight change hands under the live DMC–MTS front board.' },
      { id: 'station_customs', name: 'Customs Gate',      type: 'military',  factionId: 'faction_scn', size: 'S', services: ['toll','scan','refuel'],
        chartNote: 'Toll plate and a scanner. Everything transits; nothing transits unread.' },
    ],
    fields: [ { id: 'f_tethys_1', type: 'ast_common_rock', countWeight: 1.0 } ],
    hazards: [],
    pois: [
      { id: 'poi_blackmkt', type: 'cache', name: 'Black Market Contact', hidden: true, factionId: 'faction_quiet' },
      { id: 'poi_tethys_weigh', type: 'beacon', name: 'Weigh-Slip Buoy', factionId: 'faction_mts' },
      { id: 'poi_tethys_customs_log', type: 'beacon', name: 'Customs Log Relay', factionId: 'faction_scn' },
    ],
  },
  {
    id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
    factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
    palette: SECTOR_PALETTE_CLASSES.belt,
    trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [1, 2],
    neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
    stations: [
      { id: 'station_forge',  name: 'Forge Foundry', type: 'fab',    factionId: 'faction_dmc',   size: 'M', services: ['trade','shipyard','repair','refine','module_craft'],
        chartNote: 'Plate and fittings out the door. Bring alloy, leave with modules.' },
      { id: 'station_depot3', name: 'Refuel Depot',  type: 'mining', factionId: 'faction_choir', size: 'S', services: ['refuel'] },
    ],
    fields: [
      { id: 'f_vesta_1', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_vesta_2', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_vesta_3', type: 'ast_crystalline', countWeight: 0.6 },
    ],
    hazards: [ { type: 'radiation', center: { x: -800, z: 500 }, radius: 600, intensity: 0.4 } ],
    pois: [
      { id: 'poi_freighter', type: 'derelict', name: 'Derelict Freighter' },
      { id: 'poi_vesta_slag_relay', type: 'beacon', name: 'Slag-Choir Relay', factionId: 'faction_choir' },
      { id: 'poi_vesta_ore_cache', type: 'cache', name: 'Shift-End Ore Cache', hidden: true, factionId: 'faction_dmc' },
    ],
  },
  {
    id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
    factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
    palette: SECTOR_PALETTE_CLASSES.fringe,
    trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
    neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
    stations: [
      { id: 'station_drift',    name: 'Drift Market', type: 'trade_hub',   factionId: 'faction_mts',   size: 'M', services: ['trade','refuel','repair','missions'],
        chartNote: 'Open board, thin oversight. Good rates on cargo nobody wants logged.' },
      { id: 'station_smuggler', name: 'Smuggler Den', type: 'blackmarket', factionId: 'faction_quiet', size: 'S', services: ['black_market','missions','refuel'],
        chartNote: 'No manifest, no memory. The Quiet keep the lights on, the records off.' },
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
      {
        id: 'poi_quiessence',
        type: 'anomaly',
        name: 'The Quiessence',
        landmark: true,
        visualRadius: 24,
        scanRange: 900,
        flavorTargetRef: 'landmark_c14_quiessence',
        bandProximityRadius: 1600,
        bandLandmarkFleet: 17,
        dressingExclusionRadius: 700,
      },
    ],
  },
  {
    id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
    factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
    palette: SECTOR_PALETTE_CLASSES.fringe,
    trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
    neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
    stations: [
      { id: 'station_reach', name: 'Reach Station', type: 'trade_hub', factionId: 'faction_free', size: 'M', services: ['trade','repair','refuel','missions'], contested: true,
        chartNote: 'Contested floor. Prices swing with whoever holds the docks this week.' },
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
      { id: 'station_expanse', name: 'Expanse Refinery', type: 'refinery', factionId: 'faction_dmc', size: 'M',
        missionProfile: 'bounty_board', boardAnchorType: 'bounty_hunt',
        services: ['ore_buy','refuel','repair','refine','missions','scan_tech'],
        chartNote: 'Deep-belt intake and hunter exchange. The writ wall tracks raiders, wrecks, and radiation-lane patrols.' },
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
    pois: [
      { id: 'poi_colony', type: 'colony', name: 'Abandoned Mining Colony', claimable: true, size: 'S' },
      { id: 'poi_charon_lung_marker', type: 'beacon', name: 'Lung Marker', factionId: 'faction_dmc' },
      {
        id: 'poi_charon_tether_wreck', type: 'wreck', name: 'Snapped-Tether Hab-Pod',
        scannerSignalKind: 'distress', survivorPod: true, recoveryEncounter: true,
        flavorTargetRef: 'landmark_c7_lung_of_charon',
      },
    ],
  },
  {
    id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
    factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
    palette: SECTOR_PALETTE_CLASSES.fringe,
    trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
    neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
    stations: [
      { id: 'station_sker', name: 'Sker Bazaar', type: 'blackmarket', factionId: 'faction_reach', size: 'M', services: ['black_market','repair','refuel','missions'], repGated: true,
        chartNote: "Reach hospitality — you're vouched for or you're cargo. Rates follow standing." },
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
      { id: 'station_veil', name: 'Research Station Veil', type: 'research', factionId: 'faction_free', size: 'M', services: ['scan_tech','missions','repair'],
        chartNote: "Instruments first, hospitality never. Sells readings it won't explain." },
    ],
    fields: [ { id: 'f_veil_1', type: 'ast_gas_cloud', countWeight: 1.0 } ],
    hazards: [
      { type: 'nebula',    center: { x: 0,   z: 0    }, radius: 3000, intensity: 0.9 },
      { type: 'radiation', center: { x: 200, z: -200 }, radius: 600,  intensity: 0.6 },
    ],
    pois: [
      {
        id: 'poi_anomaly', type: 'anomaly', name: 'The Resonance Obelisk', hidden: true,
        triangulation: { requiredPings: 3, minBaselineWu: 350, minBearingDeltaDeg: 8 },
        flavorTargetRef: 'landmark_c2_resonance_obelisk',
        resonanceScanResponse: true,
      },
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
      { id: 'station_ashcache', name: 'Ruined Cache Station', type: 'blackmarket', factionId: 'faction_vael', size: 'S', services: ['repair','refuel','missions'], repGated: true,
        chartNote: "Vael salvage, half-lit. Buys what shouldn't exist at what it shouldn't cost." },
    ],
    fields: [
      { id: 'f_ash_1', type: 'ast_rare_exotic', countWeight: 1.0 },
      { id: 'f_ash_2', type: 'ast_rare_exotic', countWeight: 1.0 },
    ],
    hazards: [
      {
        id: 'hazard_ashfall_burn', type: 'radiation', center: { x: 0, z: 0 }, radius: 2000,
        intensity: 0.8, moving: true,
        afterBossDefeat: { poiId: 'poi_boss', intensity: 0.35 },
      },
      { type: 'debris',    center: { x: 400, z: 300 }, radius: 800,  intensity: 0.5 },
    ],
    pois: [
      {
        id: 'poi_boss', type: 'anomaly', name: 'Boss Arena Signal',
        discoveryPlate: {
          title: 'Iron Maw Defeated',
          body: 'The Vael-grown Deep-Mother that guarded Ashfall\'s vault is dead. Its silent arena signal now marks a navigable grave.',
        },
        defeatNews: {
          kind: 'combat-aftermath',
          text: 'ASHFALL RELAY: the Iron Maw is dead. Salvagers are already racing for the vault coordinates released from its arena signal.',
        },
      },
      {
        id: 'poi_vault', type: 'cache', name: 'Ancient Vault', hidden: true,
        unlockAfterBossId: 'poi_boss',
        discoveryPlate: {
          title: 'The Deep-Mother Vault',
          body: 'Behind the Iron Maw was no treasury, but a growth archive: hull-seed genealogies, failed warship molts, and one empty cradle still warm enough to register on the scanner.',
        },
      },
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
]
  .map(appendPq019FacilityPois)
  .map(applySectorAnchors)
  .map(applyClaimableBodySites)
  .map(applyPlanetStateAssignments);

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
