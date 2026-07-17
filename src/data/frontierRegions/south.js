// M2b SOUTH/EAST frontier cluster — self-contained, canonical-compatible sector records.
// Additive only: does not mutate the original 10 authored story sectors.
// Gate positions use the same bearing rule as sectorAnchors.js (GATE_R=0.82 toward neighbor map cell).
// Pure data. No imports, no Math.random, no runtime deps.

/** Lattice spacing matching SECTOR_ORIGIN_LATTICE_WU / FRAME_ORIGIN_QUANTUM_WU. */
export const LATTICE_WU = 4096;

/** Original 10 authored story-region IDs — frozen reference for integration guards. */
export const FROZEN_ORIGINAL_SECTOR_IDS = Object.freeze([
  'sector_helios_prime',
  'sector_ceres_belt',
  'sector_tethys_junction',
  'sector_vesta_forge',
  'sector_pallas_drift',
  'sector_io_reach',
  'sector_charon_expanse',
  'sector_sker_haven',
  'sector_veil_nebula',
  'sector_ashfall_reach',
]);

/** SOUTH/EAST M2b region IDs in stable integration order. */
export const SOUTH_SECTOR_IDS = Object.freeze([
  'sector_eunomia_gulf',
  'sector_sedna_dark',
  'sector_dione_lane',
]);

/** Map-graph origin cells (map.x, map.y) — global XZ = cell * LATTICE_WU. */
export const SOUTH_ORIGIN_CELLS = Object.freeze({
  sector_eunomia_gulf: Object.freeze({ x: 10, y: 14 }),
  sector_sedna_dark: Object.freeze({ x: 5, y: 15 }),
  sector_dione_lane: Object.freeze({ x: 8, y: -1 }),
});

/** Explicit 4096-lattice galactic-global origins. */
export const SOUTH_ORIGINS = Object.freeze({
  sector_eunomia_gulf: Object.freeze({
    x: 10 * LATTICE_WU,
    z: 14 * LATTICE_WU,
  }),
  sector_sedna_dark: Object.freeze({
    x: 5 * LATTICE_WU,
    z: 15 * LATTICE_WU,
  }),
  sector_dione_lane: Object.freeze({
    x: 8 * LATTICE_WU,
    z: -1 * LATTICE_WU,
  }),
});

/** Palette blocks mirrored from SECTOR_PALETTE_CLASSES (no shared import). */
const PALETTE_CORE = Object.freeze({
  key: 0xd8e8ff,
  rim: 0x7a6cff,
  fill: 0x4ad8ff,
  ambient: 0x384868,
  fog: 0x081228,
  fogDensity: 0.00022,
  nebulaTint: 0x2450a0,
  dust: 0x8ec0e8,
});

const PALETTE_FRINGE = Object.freeze({
  key: 0xffb07a,
  rim: 0xff3f2d,
  fill: 0xffaa66,
  ambient: 0x584343,
  fog: 0x2a0d0a,
  fogDensity: 0.00042,
  nebulaTint: 0x8a1e1e,
  dust: 0xc15032,
});

const PALETTE_ANOMALY = Object.freeze({
  key: 0xc8b6ff,
  rim: 0x54ffb0,
  fill: 0x4ddc92,
  ambient: 0x494760,
  fog: 0x160d2c,
  fogDensity: 0.00036,
  nebulaTint: 0x5a1e8a,
  dust: 0x79ffc8,
});

/**
 * Canonical-compatible sector cards for the SOUTH/EAST cluster.
 * neighbors include intra-cluster edges + external story-sector stubs for later graph integration.
 * Cross-cluster edges (triton/eris/nereid) are deferred to the graph-gate integration pass.
 */
export const SOUTH_SECTORS = Object.freeze([
  Object.freeze({
    id: 'sector_eunomia_gulf',
    name: 'Eunomia Gulf',
    tier: 3,
    security: 0.10,
    charted: false,
    factionId: 'faction_vael',
    position: Object.freeze({ x: 10, y: 14 }),
    worldRadius: 5200,
    paletteClass: 'fringe',
    palette: PALETTE_FRINGE,
    trafficPerMin: 1,
    enemyDensity: 0.70,
    enemyLevel: Object.freeze([8, 12]),
    neighbors: Object.freeze([
      'sector_sedna_dark',
    ]),
    stations: Object.freeze([
      Object.freeze({
        id: 'station_eunomia',
        name: 'Eunomia Fence',
        type: 'blackmarket',
        factionId: 'faction_vael',
        size: 'S',
        services: Object.freeze(['black_market', 'repair']),
        repGated: true,
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_eunomia_1', type: 'ast_rare_exotic', countWeight: 1.0 }),
    ]),
    hazards: Object.freeze([
      Object.freeze({
        type: 'debris',
        center: Object.freeze({ x: 480, z: -360 }),
        radius: 700,
        intensity: 0.5,
      }),
      Object.freeze({
        type: 'radiation',
        center: Object.freeze({ x: -620, z: 540 }),
        radius: 640,
        intensity: 0.55,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_eunomia_hulk',
        type: 'derelict',
        name: 'Gulf Hulk',
      }),
      Object.freeze({
        id: 'poi_eunomia_ledger',
        type: 'beacon',
        name: 'Gulf Ledger Plate',
        factionId: 'faction_vael',
      }),
      Object.freeze({
        id: 'poi_eunomia_debris',
        type: 'wreck',
        name: 'Paint-Scar Debris',
      }),
    ]),
  }),

  Object.freeze({
    id: 'sector_sedna_dark',
    name: 'Sedna Dark',
    tier: 4,
    security: 0.06,
    charted: false,
    factionId: 'faction_vael',
    position: Object.freeze({ x: 5, y: 15 }),
    worldRadius: 5400,
    paletteClass: 'anomaly',
    palette: PALETTE_ANOMALY,
    trafficPerMin: 0,
    enemyDensity: 0.78,
    enemyLevel: Object.freeze([10, 14]),
    neighbors: Object.freeze([
      'sector_eunomia_gulf',
      'sector_ashfall_reach',
    ]),
    stations: Object.freeze([
      Object.freeze({
        id: 'station_sedna',
        name: 'Sedna Survey Post',
        type: 'research',
        factionId: 'faction_vael',
        size: 'S',
        services: Object.freeze(['scan_tech', 'repair']),
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_sedna_1', type: 'ast_rare_exotic', countWeight: 1.0 }),
    ]),
    hazards: Object.freeze([
      Object.freeze({
        type: 'radiation',
        center: Object.freeze({ x: 120, z: -180 }),
        radius: 900,
        intensity: 0.72,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_sedna_vault',
        type: 'cache',
        name: 'Sedna Vault',
        hidden: true,
      }),
      Object.freeze({
        id: 'poi_sedna_cadence',
        type: 'beacon',
        name: 'Dark Cadence Beacon',
        factionId: 'faction_vael',
      }),
    ]),
  }),

  Object.freeze({
    id: 'sector_dione_lane',
    name: 'Dione Lane',
    tier: 1,
    security: 0.68,
    charted: true,
    factionId: 'faction_mts',
    position: Object.freeze({ x: 8, y: -1 }),
    worldRadius: 4300,
    paletteClass: 'core',
    palette: PALETTE_CORE,
    trafficPerMin: 10,
    enemyDensity: 0.30,
    enemyLevel: Object.freeze([2, 5]),
    neighbors: Object.freeze([
      'sector_tethys_junction',
    ]),
    stations: Object.freeze([
      Object.freeze({
        id: 'station_dione',
        name: 'Dione Exchange',
        type: 'trade_hub',
        factionId: 'faction_mts',
        size: 'M',
        services: Object.freeze(['trade', 'refuel', 'missions']),
      }),
      Object.freeze({
        id: 'station_dione_customs',
        name: 'Dione Customs',
        type: 'military',
        factionId: 'faction_scn',
        size: 'S',
        services: Object.freeze(['toll', 'scan', 'refuel']),
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_dione_1', type: 'ast_common_rock', countWeight: 1.0 }),
    ]),
    hazards: Object.freeze([]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_dione_relay',
        type: 'beacon',
        name: 'Lane Relay',
      }),
    ]),
  }),
]);

/**
 * Local station/gate/field/POI anchors (sector-local XZ).
 * Intra-cluster gates are reciprocal; external gates are stubs for later story-graph wiring.
 */
export const SOUTH_ANCHORS = Object.freeze({
  sector_eunomia_gulf: Object.freeze({
    stations: Object.freeze([
      Object.freeze({
        id: 'station_eunomia',
        pos: Object.freeze({ x: 640, z: -420 }),
        archetypeGlb: 'place_station_blackmarket',
        landmark: true,
      }),
    ]),
    gates: Object.freeze([
      // internal → Sedna Dark (5,15)
      Object.freeze({
        to: 'sector_sedna_dark',
        pos: Object.freeze({ x: -4181, z: 836 }),
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({
        id: 'f_eunomia_1',
        center: Object.freeze({ x: 200, z: 380 }),
        clusterRadius: 400,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_eunomia_hulk',
        pos: Object.freeze({ x: 1180, z: 720 }),
        landmarkGlb: 'place_dead_hulk',
        landmark: true,
      }),
      Object.freeze({
        id: 'poi_eunomia_ledger',
        pos: Object.freeze({ x: -920, z: 480 }),
        landmarkGlb: 'place_nav_buoy',
      }),
      Object.freeze({
        id: 'poi_eunomia_debris',
        pos: Object.freeze({ x: 640, z: -880 }),
        landmarkGlb: 'place_debris_chunk',
      }),
    ]),
  }),

  sector_sedna_dark: Object.freeze({
    stations: Object.freeze([
      Object.freeze({
        id: 'station_sedna',
        pos: Object.freeze({ x: -480, z: 620 }),
        archetypeGlb: 'place_station_research',
        landmark: true,
      }),
    ]),
    gates: Object.freeze([
      // internal → Eunomia Gulf (10,14)
      Object.freeze({
        to: 'sector_eunomia_gulf',
        pos: Object.freeze({ x: 4342, z: -868 }),
      }),
      // external → Ashfall Reach (4,11)
      Object.freeze({
        to: 'sector_ashfall_reach',
        pos: Object.freeze({ x: -1074, z: -4296 }),
        external: true,
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({
        id: 'f_sedna_1',
        center: Object.freeze({ x: 720, z: -280 }),
        clusterRadius: 420,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_sedna_vault',
        pos: Object.freeze({ x: -1320, z: 280 }),
        landmarkGlb: 'place_debris_chunk',
      }),
      Object.freeze({
        id: 'poi_sedna_cadence',
        pos: Object.freeze({ x: 860, z: -640 }),
        landmarkGlb: 'place_nav_buoy',
        landmark: true,
      }),
    ]),
  }),

  sector_dione_lane: Object.freeze({
    stations: Object.freeze([
      Object.freeze({
        id: 'station_dione',
        pos: Object.freeze({ x: 920, z: 280 }),
        archetypeGlb: 'place_station_trade_hub',
        landmark: true,
      }),
      Object.freeze({
        id: 'station_dione_customs',
        pos: Object.freeze({ x: -580, z: -980 }),
        archetypeGlb: 'place_station_military',
      }),
    ]),
    gates: Object.freeze([
      // external → Tethys Junction (3,2)
      Object.freeze({
        to: 'sector_tethys_junction',
        pos: Object.freeze({ x: -3024, z: 1814 }),
        external: true,
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({
        id: 'f_dione_1',
        center: Object.freeze({ x: -320, z: 540 }),
        clusterRadius: 420,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_dione_relay',
        pos: Object.freeze({ x: 320, z: -420 }),
        landmarkGlb: 'place_lane_beacon',
        landmark: true,
      }),
    ]),
  }),
});

/**
 * Named zones (>=1 per region). Types/vocab from sectorZones.js ZONE_TYPES.
 * Centers align to local anchors above.
 */
export const SOUTH_ZONES = Object.freeze({
  sector_eunomia_gulf: Object.freeze([
    Object.freeze({
      id: 'zone_eunomia_fence',
      name: 'Eunomia Fence',
      type: 'outlaw_zone',
      factionId: 'faction_vael',
      reason: 'A Vael-licensed black fence linking Sedna dark to the east wake run.',
      center: Object.freeze({ x: 640, z: -420 }),
      radius: 900,
      threat: 3,
      presence: Object.freeze({
        role: 'vael',
        archetypes: Object.freeze(['lancer_sniper', 'bruiser_brawler']),
        size: Object.freeze([1, 3]),
        doctrine: 'balanced',
        formation: 'ring',
        context: 'zone_hostile',
        hostile: true,
        factionId: 'faction_vael',
      }),
    }),
    Object.freeze({
      id: 'zone_eunomia_hulk',
      name: 'Gulf Hulk Drift',
      type: 'derelict_field',
      factionId: 'faction_vael',
      reason: 'A stripped freighter marks the gulf choke — scavengers still pick the ribs.',
      center: Object.freeze({ x: 1180, z: 720 }),
      radius: 520,
      threat: 2,
      presence: Object.freeze({
        role: 'scavengers',
        archetypes: Object.freeze(['wasp_swarmer', 'reaver_pirate']),
        size: Object.freeze([1, 2]),
        doctrine: 'scavenger',
        formation: 'loose',
        context: 'zone_hostile',
        hostile: true,
      }),
    }),
  ]),

  sector_sedna_dark: Object.freeze([
    Object.freeze({
      id: 'zone_sedna_survey',
      name: 'Sedna Survey',
      type: 'civilian_core',
      factionId: 'faction_vael',
      reason: 'A thin research post on the dark rim — sensors first, hospitality never.',
      center: Object.freeze({ x: -480, z: 620 }),
      radius: 820,
      threat: 2,
    }),
    Object.freeze({
      id: 'zone_sedna_vault',
      name: 'Sedna Vault',
      type: 'anomaly_deep',
      factionId: 'faction_vael',
      reason: 'A sealed survey cache past Ashfall — the reason anyone flies this dark.',
      center: Object.freeze({ x: -1320, z: 280 }),
      radius: 480,
      threat: 3,
      presence: Object.freeze({
        role: 'vael',
        archetypes: Object.freeze(['lancer_sniper', 'bruiser_brawler']),
        size: Object.freeze([1, 2]),
        doctrine: 'balanced',
        formation: 'ring',
        context: 'zone_hostile',
        hostile: true,
        factionId: 'faction_vael',
      }),
    }),
    Object.freeze({
      id: 'zone_sedna_glow',
      name: 'Dark Glow',
      type: 'radiation_field',
      factionId: 'faction_vael',
      reason: 'Hard radiation blooms along the dark spine — shields thin fast.',
      center: Object.freeze({ x: 120, z: -180 }),
      radius: 720,
      threat: 2,
    }),
  ]),

  sector_dione_lane: Object.freeze([
    Object.freeze({
      id: 'zone_dione_exchange',
      name: 'Dione Exchange',
      type: 'trade_lane',
      factionId: 'faction_mts',
      reason: 'Meridian\'s lawful southern customs spur — tolls fund the patrols.',
      center: Object.freeze({ x: 920, z: 280 }),
      radius: 1100,
      threat: 1,
    }),
    Object.freeze({
      id: 'zone_dione_customs',
      name: 'Lane Customs',
      type: 'border_checkpoint',
      factionId: 'faction_scn',
      reason: 'Concord scans inbound cargo here before it reaches the core exchange.',
      center: Object.freeze({ x: -580, z: -980 }),
      radius: 720,
      threat: 1,
      presence: Object.freeze({
        role: 'patrol',
        archetypes: Object.freeze(['patrol_lawman']),
        size: Object.freeze([2, 3]),
        doctrine: 'official',
        formation: 'wedge',
        context: 'patrol',
        hostile: false,
        factionId: 'faction_scn',
      }),
    }),
    Object.freeze({
      id: 'zone_dione_relay',
      name: 'Lane Relay',
      type: 'patrol_corridor',
      factionId: 'faction_mts',
      reason: 'A lit beacon lane for southbound convoys that prefer paperwork to pirates.',
      center: Object.freeze({ x: 320, z: -420 }),
      radius: 560,
      threat: 1,
    }),
  ]),
});

/**
 * Reciprocal gate descriptor list for later canonical integration.
 * Internal pairs must both exist; external pairs document the story-side stub required.
 */
export const SOUTH_GATE_DESCRIPTORS = Object.freeze([
  Object.freeze({
    from: 'sector_eunomia_gulf',
    to: 'sector_sedna_dark',
    internal: true,
  }),
  Object.freeze({
    from: 'sector_sedna_dark',
    to: 'sector_eunomia_gulf',
    internal: true,
  }),
  Object.freeze({
    from: 'sector_sedna_dark',
    to: 'sector_ashfall_reach',
    internal: false,
    note: 'Story-side reciprocal gate pending integration',
  }),
  Object.freeze({
    from: 'sector_dione_lane',
    to: 'sector_tethys_junction',
    internal: false,
    note: 'Story-side reciprocal gate pending integration',
  }),
]);

/** Self-contained cluster record for M2b SOUTH/EAST. */
export const SOUTH_CLUSTER = Object.freeze({
  id: 'frontier_cluster_south',
  version: 1,
  latticeWu: LATTICE_WU,
  sectorIds: SOUTH_SECTOR_IDS,
  frozenOriginalSectorIds: FROZEN_ORIGINAL_SECTOR_IDS,
  originCells: SOUTH_ORIGIN_CELLS,
  origins: SOUTH_ORIGINS,
  sectors: SOUTH_SECTORS,
  anchors: SOUTH_ANCHORS,
  zones: SOUTH_ZONES,
  gateDescriptors: SOUTH_GATE_DESCRIPTORS,
});

export default SOUTH_CLUSTER;
