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
  // Lacquer & Starlight: warm keys, blue-violet shadows, dark negative space.
  core: {
    // Sun-warmed inhabited machinery; cooler reflected light separates its shadow planes.
    key: 0xffe2bd, rim: 0x82baf0, fill: 0xa3b4dd, ambient: 0x45516f,
    fog: 0x05070b, fogDensity: 0, nebulaTint: 0x2450a0, dust: 0x8ec0e8,
  },
  belt: {
    key: 0xffd59a, rim: 0x71a4bf, fill: 0xbca58d, ambient: 0x594a52,
    fog: 0x090705, fogDensity: 0.00002, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
  },
  fringe: {
    key: 0xffb07a, rim: 0x9875ce, fill: 0xbc91a6, ambient: 0x51435d,
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
        id: 'f_helios_outer', type: 'ast_metallic', countWeight: 0.7,
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
      {
        id: 'poi_helios_yard',
        type: 'derelict',
        name: 'Outer Yard Derelict',
        discoveryPlate: {
          title: 'Outer Yard Decommission Frame',
          body: 'The stripped structural rib of an early transport berth, towed into the outer debris cluster when Helios Station expanded. Cold welds and cutting torch scars mark where the modular gantry was salvaged.',
        },
      },
      // Lane furniture (design/fiction/LANE_FURNITURE.md). Deliberately placed ON the corridor a
      // new pilot actually flies — spawn, tutorial beacon, starter seam — because the camera can
      // only see ~50 world units of ground plane and clutter parked anywhere else is radar content.
      { id: 'poi_helios_lane_pin', type: 'beacon', name: 'Corridor Pin 44-C' },
      { id: 'poi_helios_tally', type: 'beacon', name: 'Helios Weigh-Point' },
      { id: 'poi_helios_claim_mark', type: 'beacon', name: 'Starter Seam Claim' },
      {
        id: 'poi_helios_locker',
        type: 'cache',
        scannerSignalKind: 'cache',
        name: 'Bonded Cold Locker',
        discoveryPlate: {
          title: 'Bonded Cold Locker',
          body: 'A pressurized ore-sample locker anchored to the starter seam bedrock. Heavy Concord inspection seals from the initial Helios survey remain intact over an untouched specimen compartment.',
        },
      },
      { id: 'poi_helios_ash_pin', type: 'derelict', name: 'Ash Pin — SPAN-HOLD' },
      { id: 'poi_helios_whistle', type: 'derelict', name: 'Outer Yard Whistle' },
      {
        // The chart names the real wreck, not a second derelict prop: the unique-wreck
        // program owns the body (rumor -> bearing ring -> fixed position), so this row
        // carries no pos and runtimeOwner keeps _spawnPOIs from minting a decoy beside it.
        id: 'poi_helios_choir_tender',
        type: 'wreck',
        name: 'Relief-Freighter Choir-Tender',
        uniqueWreckId: 'wreck_choir_tender',
        runtimeOwner: 'uniqueWrecks',
      },
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
      {
        id: 'poi_blackmkt', type: 'cache', name: 'Black Market Contact', hidden: true,
        factionId: 'faction_quiet', requiresActiveScan: true, scannerSignalKind: 'ambush',
        manualInvestigation: true,
      },
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
      { id: 'station_depot3', name: 'Refuel Depot',  type: 'mining', factionId: 'faction_choir', size: 'S', services: ['refuel', 'missions'],
        chartNote: 'Pumps for the slag crews, and a posted board. The Choir posts shift work in verses.' },
    ],
    fields: [
      { id: 'f_vesta_1', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_vesta_2', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_vesta_3', type: 'ast_crystalline', countWeight: 0.6 },
    ],
    hazards: [ { type: 'radiation', center: { x: -540, z: -480 }, radius: 600, intensity: 0.4 } ],
    pois: [
      { id: 'poi_freighter', type: 'derelict', name: 'Derelict Freighter' },
      {
        id: 'poi_vesta_slag_relay', type: 'beacon', name: 'Slag-Choir Relay', factionId: 'faction_choir',
        requiresActiveScan: true, scannerSignalKind: 'ore', manualInvestigation: true,
      },
      {
        id: 'poi_vesta_ore_cache', type: 'cache', name: 'Shift-End Ore Cache', hidden: true,
        factionId: 'faction_dmc', requiresActiveScan: true, scannerSignalKind: 'ore',
        manualInvestigation: true,
      },
      // PQ-153.02 hero landmark (depth program C13e, lore `landmark_c13e_resonant_cathedral`).
      // Anchors zone_vesta_forge beside the foundry it was raised against. `pos` is inline
      // sector-local (the frontier-region precedent) because sectorAnchors.js is a contended table
      // this packet does not own; applySectorAnchors leaves unanchored pois untouched. A `pos` on
      // the record means _spawnPOIs scatters nothing for it.
      {
        id: 'poi_vesta_resonant_cathedral',
        type: 'anomaly',
        name: 'The Resonant Cathedral',
        landmark: true,
        pos: { x: -1050, z: 1180 },
        landmarkGlb: 'place_maintenance_gantry',
        visualRadius: 30,
        factionId: 'faction_choir',
        scannerSignalKind: 'archive',
        flavorTargetRef: 'landmark_c13e_resonant_cathedral',
        dressingExclusionRadius: 300,
        discoveryPlate: {
          title: 'The Resonant Cathedral',
          body: 'Twin spires and a resonance arch raised where the Choir first sang inside a '
            + 'foundry\u2019s own roar \u2014 its harmonic still tuned to the Forge\u2019s old shift rhythm.',
        },
      },
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
      {
        id: 'poi_pwreck', type: 'wreck', name: 'Pirate Wreckage',
        requiresActiveScan: true, scannerSignalKind: 'salvage', scannerSignalPriority: 96,
        manualInvestigation: true,
      },
      {
        id: 'poi_hcache', type: 'cache', name: 'Hidden Cache', hidden: true,
        requiresActiveScan: true, scannerSignalKind: 'salvage', scannerSignalPriority: 96,
        manualInvestigation: true,
      },
      {
        id: 'poi_quiessence',
        type: 'anomaly',
        name: 'The Quiessence',
        landmark: true,
        scannerSignalKind: 'archive',
        visualRadius: 24,
        scanRange: 900,
        flavorTargetRef: 'landmark_c14_quiessence',
        bandProximityRadius: 1600,
        bandLandmarkFleet: 17,
        dressingExclusionRadius: 700,
        discoveryPlate: {
          title: 'The Quiessence Census',
          body: 'Seventeen intact freighters hold formation around one violet buoy. Every hull reports a different living-crew count; every bunk is warm; no transmitter answers by name.',
        },
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
      {
        id: 'poi_cruiser', type: 'derelict', name: 'Derelict Cruiser',
        flavorTargetRef: 'landmark_c1_wreck_cathedral_concord_vigilant',
        discoveryPlate: {
          title: 'The Wreck Cathedral',
          body: 'The Concord Vigilant held this lane nine hours while civilians jumped behind her. Concord claims the bow and the Frontier claims the stern, so neither tows her — scavengers nest in the engine bells instead.',
        },
      },
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
    // WORLD-07 — the Bazaar is the Reach's market stop, not hollow frontier: a light apron of
    // haulers/smugglers/couriers clusters near station_sker. enemyDensity stays authored.
    trafficPerMin: 9, enemyDensity: 0.70, enemyLevel: [7, 11],
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
      // PQ-153.02 hero landmark (depth program C13d, lore `landmark_c13d_skerris_throne`).
      // Anchors zone_sker_haven (Skerris Deep) on the approach to the Bazaar: a fortress welded
      // from captured hulls, so the shared dead-hulk silhouette is the honest one. Inline `pos`
      // for the same reason as the Vesta landmark above.
      {
        id: 'poi_sker_throne',
        type: 'colony',
        name: 'The Skerris Throne',
        landmark: true,
        pos: { x: -1500, z: 1350 },
        landmarkGlb: 'place_dead_hulk',
        visualRadius: 34,
        factionId: 'faction_reach',
        scannerSignalKind: 'archive',
        flavorTargetRef: 'landmark_c13d_skerris_throne',
        dressingExclusionRadius: 300,
        discoveryPlate: {
          title: 'The Skerris Throne',
          body: 'A fortress welded from captured hulls, every plate a raid trophy with a story on '
            + 'scan. No architect designed the Throne \u2014 survivors kept welding.',
        },
      },
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
        flavorTargetRef: 'landmark_c5_iron_maw',
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
      {
        id: 'poi_vault_maw', type: 'anomaly', name: 'The Vault Maw',
        factionId: 'faction_vael',
        scannerSignalKind: 'archive',
        repeatableScannerSignal: true,
        flavorTargetRef: 'landmark_c4_vault_maw',
        discoveryPlate: {
          title: 'The Vault Maw',
          body: 'A heavily armored pre-collapse archive sealed behind interlocking petal-plates. The locking seam bears thousands of false cryptographic keyways tied to ancient defensive countermeasures, guarding historical ledgers expunged from all modern sector registries.',
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

// ── PQ-170.01 — station growth ladders ──────────────────────────────────────────────────────────
// A station physically expands because of player-supplied throughput: goods the player sells at
// its market and freight the player's Trade Relay convoys land there. claims.js owns the durable
// per-station ledger (state.claims.stationGrowth) and the stamping; this table only authors WHAT
// each station type grows and at WHAT cumulative throughput. It is a separate constant on purpose:
// world copies every station record into runtime state and the data checks validate the station
// shape, so growth never rides on the station record itself.
//
// Rung 1 is sized for one session on the starter hull: a Kestrel hold is 250 volume and every raw
// ore is 1.0 vol/u, so one full load plus a partial second sold at the same station crosses it.
// Later rungs are the endgame pull — a relay feeding one station over hours of play.
//
// Each rung: id, name, tag (short label stamped onto the live station's name), throughputU
// (cumulative units), relayFeeCut (the player's relay convoys sold at a grown station keep more of
// the sale), powerBonus (feeds the owning faction's war power in factions.js), line (dock/news copy;
// tokens {station} {module} {units}).
const GROWTH_RUNG_1_U = 150;
const GROWTH_RUNG_2_U = 450;
const GROWTH_RUNG_3_U = 1000;

function growthRung(id, name, tag, throughputU, relayFeeCut, powerBonus, line) {
  return Object.freeze({ id, name, tag, throughputU, relayFeeCut, powerBonus, line });
}

export const STATION_GROWTH_LADDERS = Object.freeze({
  trade_hub: Object.freeze([
    growthRung('growth_bonded_annex', 'Bonded Freight Annex', 'BONDED ANNEX', GROWTH_RUNG_1_U, 0.05, 2,
      '{station} opens a Bonded Freight Annex — {units}u of your freight paid for the plating.'),
    growthRung('growth_exchange_ring', 'Exchange Ring', 'EXCHANGE RING', GROWTH_RUNG_2_U, 0.10, 4,
      '{station} rings a second exchange floor around the annex your deliveries built.'),
    growthRung('growth_lane_authority', 'Lane Authority Office', 'LANE AUTHORITY', GROWTH_RUNG_3_U, 0.15, 6,
      '{station} charters a Lane Authority Office — your route is now the one the charts are drawn from.'),
  ]),
  refinery: Object.freeze([
    growthRung('growth_bulk_intake', 'Bulk Intake Dock', 'BULK INTAKE', GROWTH_RUNG_1_U, 0.05, 2,
      '{station} fits a Bulk Intake Dock — {units}u of your ore kept the crackers hot long enough to earn it.'),
    growthRung('growth_second_cracker', 'Second Cracking Line', 'SECOND LINE', GROWTH_RUNG_2_U, 0.10, 4,
      '{station} lights a second cracking line on the back of your deliveries.'),
    growthRung('growth_slag_gantry', 'Slag Export Gantry', 'EXPORT GANTRY', GROWTH_RUNG_3_U, 0.15, 6,
      '{station} raises a Slag Export Gantry — the refinery now ships what your hauls made.'),
  ]),
  mining: Object.freeze([
    growthRung('growth_ore_scale', 'Ore Scale Annex', 'SCALE ANNEX', GROWTH_RUNG_1_U, 0.05, 2,
      '{station} bolts on an Ore Scale Annex — {units}u across your scale bought the second weigh-bay.'),
    growthRung('growth_crusher_deck', 'Crusher Deck', 'CRUSHER DECK', GROWTH_RUNG_2_U, 0.10, 4,
      '{station} opens a Crusher Deck; rock crews credit your hauls for the shift.'),
    growthRung('growth_loading_arm', 'Bulk Loading Arm', 'LOADING ARM', GROWTH_RUNG_3_U, 0.15, 6,
      '{station} swings out a Bulk Loading Arm — built for the tonnage you keep bringing.'),
  ]),
  fab: Object.freeze([
    growthRung('growth_receiving_bay', 'Parts Receiving Bay', 'RECEIVING BAY', GROWTH_RUNG_1_U, 0.05, 2,
      '{station} opens a Parts Receiving Bay — {units}u of your alloy and fittings filled the first racks.'),
    growthRung('growth_assembly_two', 'Assembly Hall Two', 'HALL TWO', GROWTH_RUNG_2_U, 0.10, 4,
      '{station} seals Assembly Hall Two, fed by the line you keep supplying.'),
    growthRung('growth_fitting_yard', 'Certified Fitting Yard', 'FITTING YARD', GROWTH_RUNG_3_U, 0.15, 6,
      '{station} certifies a Fitting Yard — the foundry now builds on your throughput.'),
  ]),
  military: Object.freeze([
    growthRung('growth_provisioning_wing', 'Provisioning Wing', 'PROVISIONING', GROWTH_RUNG_1_U, 0.05, 2,
      '{station} commissions a Provisioning Wing — {units}u of your supply stocked the first lockers.'),
    growthRung('growth_patrol_hangar', 'Patrol Hangar Annex', 'PATROL HANGAR', GROWTH_RUNG_2_U, 0.10, 4,
      '{station} opens a Patrol Hangar Annex on the strength of your deliveries.'),
    growthRung('growth_tender_berth', 'Fleet Tender Berth', 'TENDER BERTH', GROWTH_RUNG_3_U, 0.15, 6,
      '{station} lays a Fleet Tender Berth — the desk now counts your route as logistics.'),
  ]),
  blackmarket: Object.freeze([
    growthRung('growth_unlisted_warehouse', 'Unlisted Warehouse', 'UNLISTED STORE', GROWTH_RUNG_1_U, 0.05, 2,
      '{station} quietly adds an Unlisted Warehouse — {units}u of your freight moved through without a manifest.'),
    growthRung('growth_back_channel_berth', 'Back-Channel Berth', 'BACK BERTH', GROWTH_RUNG_2_U, 0.10, 4,
      '{station} cuts a Back-Channel Berth for the hulls that keep feeding it.'),
    growthRung('growth_quiet_vault', 'Quiet Ledger Vault', 'LEDGER VAULT', GROWTH_RUNG_3_U, 0.15, 6,
      '{station} seals a Quiet Ledger Vault — your route is the one nobody writes down.'),
  ]),
  research: Object.freeze([
    growthRung('growth_sample_lab', 'Sample Intake Lab', 'INTAKE LAB', GROWTH_RUNG_1_U, 0.05, 2,
      '{station} opens a Sample Intake Lab — {units}u of your cargo gave the instruments something to read.'),
    growthRung('growth_instrument_deck', 'Second Instrument Deck', 'INSTRUMENT DECK', GROWTH_RUNG_2_U, 0.10, 4,
      '{station} powers a Second Instrument Deck on the supply line you run.'),
    growthRung('growth_field_annex', 'Field Station Annex', 'FIELD ANNEX', GROWTH_RUNG_3_U, 0.15, 6,
      '{station} builds a Field Station Annex — the station now depends on what you bring.'),
  ]),
});

const EMPTY_GROWTH_LADDER = Object.freeze([]);
export const STATION_GROWTH_DEFAULT_TYPE = 'trade_hub';

/** The authored growth ladder for a station record (or a live station's `data`). */
export function stationGrowthLadderFor(station) {
  if (!station) return EMPTY_GROWTH_LADDER;
  const type = station.type || station.stationTypeId;
  return STATION_GROWTH_LADDERS[type] || STATION_GROWTH_LADDERS[STATION_GROWTH_DEFAULT_TYPE] || EMPTY_GROWTH_LADDER;
}

/** How many rungs a cumulative throughput has earned on a ladder. Pure. */
export function stationGrowthRungFor(ladder, throughputU) {
  const units = Math.max(0, Number(throughputU) || 0);
  let rung = 0;
  for (const step of ladder || EMPTY_GROWTH_LADDER) {
    if (units < step.throughputU) break;
    rung += 1;
  }
  return rung;
}

function trophyHead(tier, id, name, masslineHeadId, baseId, defaultAceId) {
  return Object.freeze({ tier, id, name, masslineHeadId, baseId, defaultAceId });
}

// PQ-170.03 — one legendary Massline head per ace promotion tier. Lineage is who you took it from.
export const ACE_TROPHY_HEADS = Object.freeze([
  trophyHead(1, 'unique_no_cut_filament', 'No-Cut Filament', 'monofilament_sweep', 'mod_monofilament_sweep_m', 'ace_yara_no_cut'),
  trophyHead(2, 'unique_toll_saint_bridle', 'Toll-Saint Bridle', 'twin_bridle', 'mod_twin_bridle_m', 'ace_toll_saint_venn'),
  trophyHead(3, 'unique_broken_ring_whip', 'Broken-Ring Whip', 'elastic_whip', 'mod_elastic_whip_m', 'ace_mako_broken_ring'),
]);
const ACE_TROPHY_BY_MODULE = new Map(ACE_TROPHY_HEADS.map((row) => [row.id, row]));
const ACE_TROPHY_BY_TIER = new Map(ACE_TROPHY_HEADS.map((row) => [row.tier, row]));

export function aceTrophyHeadByModuleId(id) {
  return ACE_TROPHY_BY_MODULE.get(id) || null;
}

export function aceTrophyHeadByTier(tier) {
  return ACE_TROPHY_BY_TIER.get(tier | 0) || null;
}

/** Fitted trophy plus lineage from the claims ledger, if the player is wearing one. */
export function trophyFromFittings(fittings, ledger) {
  if (!Array.isArray(fittings)) return null;
  for (const id of fittings) {
    if (typeof id !== 'string') continue;
    const def = aceTrophyHeadByModuleId(id);
    if (!def) continue;
    const rec = ledger && ledger.byModuleId && ledger.byModuleId[id];
    return {
      tier: def.tier,
      id: def.id,
      name: def.name,
      masslineHeadId: def.masslineHeadId,
      baseId: def.baseId,
      defaultAceId: def.defaultAceId,
      aceId: rec && rec.aceId || def.defaultAceId,
      aceName: rec && rec.aceName || null,
    };
  }
  return null;
}
