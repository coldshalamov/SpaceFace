// src/data/frontierRegions/north.js
// M2b NORTH frontier cluster — self-contained canonical-compatible region pack.
//
// Not wired into live SECTORS / SECTOR_ANCHORS / SECTOR_ZONES / SECTOR_GLOBAL_ORIGINS.
// Integration is a later graph-gate task. This file freezes the original 10 story
// region IDs and ships four additive frontier sectors with:
//   - sector cards (same shape as src/data/sectors.js)
//   - 4096-lattice galactic origins (same mapping as sectorCoordinates.js)
//   - local station/gate/field/POI anchors (same shape as sectorAnchors.js)
//   - named zones (same shape as sectorZones.js)
//
// Pure data. No non-deterministic RNG. No runtime deps. Deterministic IDs only.
// Gate local XZ use the live bearingGate convention (GATE_R=0.82 toward neighbor map node).

/** Lattice spacing (world units) between adjacent map-graph nodes — matches SECTOR_ORIGIN_LATTICE_WU. */
export const LATTICE_WU = 4096;

/** Gate ring fraction of worldRadius — matches sectorAnchors.js GATE_R. */
export const GATE_R = 0.82;

/**
 * Frozen original 10 authored story-region IDs.
 * This pack must never redefine, relocate, or overwrite these.
 */
export const FROZEN_CORE_SECTOR_IDS = Object.freeze([
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

/** Stable ordered sector IDs in this cluster (deterministic scan order). */
export const NORTH_SECTOR_IDS = Object.freeze([
  'sector_rhea_cinder',
  'sector_haumea_rift',
  'sector_eris_margin',
  'sector_phoebe_echo',
]);

/** Assigned map origin cells {x,y} — map.y maps to galactic Z. */
export const NORTH_ORIGIN_CELLS = Object.freeze({
  sector_rhea_cinder: Object.freeze({ x: -6, y: 12 }),
  sector_haumea_rift: Object.freeze({ x: -3, y: 14 }),
  sector_eris_margin: Object.freeze({ x: 1, y: 14 }),
  sector_phoebe_echo: Object.freeze({ x: 2, y: 18 }),
});

/** Inline copies of SECTOR_PALETTE_CLASSES (core/belt/fringe/anomaly) — no shared import. */
export const NORTH_PALETTE = Object.freeze({
  belt: Object.freeze({
    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
    fog: 0x090705, fogDensity: 0.00002, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
  }),
  fringe: Object.freeze({
    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
    fog: 0x090504, fogDensity: 0.00003, nebulaTint: 0x8a1e1e, dust: 0xc15032,
  }),
  anomaly: Object.freeze({
    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
    fog: 0x08050d, fogDensity: 0.00012, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
  }),
});

/**
 * 4096-lattice galactic origins: globalX = cell.x * LATTICE, globalZ = cell.y * LATTICE.
 */
export const NORTH_ORIGINS = Object.freeze({
  sector_rhea_cinder: Object.freeze({
    x: NORTH_ORIGIN_CELLS.sector_rhea_cinder.x * LATTICE_WU,
    z: NORTH_ORIGIN_CELLS.sector_rhea_cinder.y * LATTICE_WU,
  }),
  sector_haumea_rift: Object.freeze({
    x: NORTH_ORIGIN_CELLS.sector_haumea_rift.x * LATTICE_WU,
    z: NORTH_ORIGIN_CELLS.sector_haumea_rift.y * LATTICE_WU,
  }),
  sector_eris_margin: Object.freeze({
    x: NORTH_ORIGIN_CELLS.sector_eris_margin.x * LATTICE_WU,
    z: NORTH_ORIGIN_CELLS.sector_eris_margin.y * LATTICE_WU,
  }),
  sector_phoebe_echo: Object.freeze({
    x: NORTH_ORIGIN_CELLS.sector_phoebe_echo.x * LATTICE_WU,
    z: NORTH_ORIGIN_CELLS.sector_phoebe_echo.y * LATTICE_WU,
  }),
});

/**
 * Sector cards — same fields as live SECTORS entries (pre-anchor merge).
 * neighbors include intra-cluster edges + integration stubs to the frozen core.
 */
export const NORTH_SECTORS = Object.freeze([
  Object.freeze({
    id: 'sector_rhea_cinder',
    name: 'Rhea Cinder',
    tier: 3,
    security: 0.14,
    charted: false,
    factionId: 'faction_dmc',
    position: Object.freeze({ ...NORTH_ORIGIN_CELLS.sector_rhea_cinder }),
    worldRadius: 5000,
    paletteKey: 'belt',
    palette: NORTH_PALETTE.belt,
    trafficPerMin: 2,
    enemyDensity: 0.55,
    enemyLevel: Object.freeze([6, 10]),
    neighbors: Object.freeze([
      'sector_haumea_rift',
      'sector_sker_haven', // integration stub → frozen core
    ]),
    stations: Object.freeze([
      Object.freeze({
        id: 'station_rhea_cinder',
        name: 'Cinder Claim',
        type: 'mining',
        factionId: 'faction_dmc',
        size: 'M',
        services: Object.freeze(['trade', 'ore_buy', 'refuel', 'repair', 'missions']),
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_rhea_1', type: 'ast_metallic', countWeight: 1.0 }),
      Object.freeze({ id: 'f_rhea_2', type: 'ast_rare_exotic', countWeight: 0.7 }),
    ]),
    hazards: Object.freeze([
      Object.freeze({
        type: 'radiation',
        center: Object.freeze({ x: 420, z: -680 }),
        radius: 720,
        intensity: 0.55,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({ id: 'poi_rhea_slag', type: 'derelict', name: 'Slag Hauler Hulk' }),
      Object.freeze({ id: 'poi_rhea_claim', type: 'cache', name: 'Burned Survey Cache', hidden: true }),
    ]),
  }),

  Object.freeze({
    id: 'sector_haumea_rift',
    name: 'Haumea Rift',
    tier: 3,
    security: 0.18,
    charted: false,
    factionId: 'faction_free',
    position: Object.freeze({ ...NORTH_ORIGIN_CELLS.sector_haumea_rift }),
    worldRadius: 5100,
    paletteKey: 'fringe',
    palette: NORTH_PALETTE.fringe,
    trafficPerMin: 3,
    enemyDensity: 0.48,
    enemyLevel: Object.freeze([6, 11]),
    neighbors: Object.freeze([
      'sector_rhea_cinder',
      'sector_eris_margin',
      'sector_phoebe_echo',
    ]),
    stations: Object.freeze([
      Object.freeze({
        id: 'station_haumea_rift',
        name: 'Rift Observatory',
        type: 'research',
        factionId: 'faction_free',
        size: 'M',
        services: Object.freeze(['scan_tech', 'missions', 'repair', 'refuel']),
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_haumea_1', type: 'ast_icy', countWeight: 1.0 }),
      Object.freeze({ id: 'f_haumea_2', type: 'ast_crystalline', countWeight: 0.8 }),
    ]),
    hazards: Object.freeze([
      Object.freeze({
        type: 'dense_asteroid',
        center: Object.freeze({ x: -540, z: 380 }),
        radius: 780,
        intensity: 0.5,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({ id: 'poi_haumea_fissure', type: 'anomaly', name: 'Ice Fissure Signal' }),
      Object.freeze({ id: 'poi_haumea_buoy', type: 'beacon', name: 'Rift Range Buoy' }),
      Object.freeze({ id: 'poi_haumea_probe', type: 'derelict', name: 'Rift Probe Shell' }),
    ]),
  }),

  Object.freeze({
    id: 'sector_eris_margin',
    name: 'Eris Margin',
    tier: 3,
    security: 0.10,
    charted: false,
    factionId: 'faction_quiet',
    position: Object.freeze({ ...NORTH_ORIGIN_CELLS.sector_eris_margin }),
    worldRadius: 5200,
    paletteKey: 'fringe',
    palette: NORTH_PALETTE.fringe,
    trafficPerMin: 1,
    enemyDensity: 0.62,
    enemyLevel: Object.freeze([7, 12]),
    neighbors: Object.freeze([
      'sector_haumea_rift',
      'sector_phoebe_echo',
      'sector_ashfall_reach', // integration stub → frozen core
    ]),
    stations: Object.freeze([
      Object.freeze({
        id: 'station_eris_margin',
        name: 'Margin Fence',
        type: 'blackmarket',
        factionId: 'faction_quiet',
        size: 'S',
        services: Object.freeze(['black_market', 'repair', 'refuel', 'missions']),
        repGated: true,
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_eris_1', type: 'ast_metallic', countWeight: 1.0 }),
      Object.freeze({ id: 'f_eris_2', type: 'ast_common_rock', countWeight: 0.9 }),
    ]),
    hazards: Object.freeze([
      Object.freeze({
        type: 'nebula',
        center: Object.freeze({ x: 360, z: 520 }),
        radius: 900,
        intensity: 0.48,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({ id: 'poi_eris_drop', type: 'cache', name: 'Quiet Drop Point', hidden: true }),
      Object.freeze({ id: 'poi_eris_wreck', type: 'wreck', name: 'Toll-Runner Wreck' }),
      Object.freeze({ id: 'poi_eris_dead_drop', type: 'cache', name: 'Margin Dead Drop', hidden: true, factionId: 'faction_quiet' }),
    ]),
  }),

  Object.freeze({
    id: 'sector_phoebe_echo',
    name: 'Phoebe Echo',
    tier: 4,
    security: 0.06,
    charted: false,
    factionId: 'faction_vael',
    position: Object.freeze({ ...NORTH_ORIGIN_CELLS.sector_phoebe_echo }),
    worldRadius: 5500,
    paletteKey: 'anomaly',
    palette: NORTH_PALETTE.anomaly,
    trafficPerMin: 0,
    enemyDensity: 0.75,
    enemyLevel: Object.freeze([9, 14]),
    neighbors: Object.freeze([
      'sector_haumea_rift',
      'sector_eris_margin',
    ]),
    stations: Object.freeze([
      Object.freeze({
        id: 'station_phoebe_echo',
        name: 'Echo Shrine',
        type: 'research',
        factionId: 'faction_vael',
        size: 'S',
        services: Object.freeze(['scan_tech', 'repair', 'refuel']),
        repGated: true,
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_phoebe_1', type: 'ast_rare_exotic', countWeight: 1.0 }),
      Object.freeze({ id: 'f_phoebe_2', type: 'ast_gas_cloud', countWeight: 0.85 }),
    ]),
    hazards: Object.freeze([
      Object.freeze({
        type: 'radiation',
        center: Object.freeze({ x: 0, z: 0 }),
        radius: 1400,
        intensity: 0.7,
      }),
      Object.freeze({
        type: 'debris',
        center: Object.freeze({ x: -720, z: 840 }),
        radius: 620,
        intensity: 0.5,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({ id: 'poi_phoebe_echo', type: 'anomaly', name: 'Echo Resonance' }),
      Object.freeze({ id: 'poi_phoebe_vault', type: 'cache', name: 'Silent Vault', hidden: true }),
    ]),
  }),
]);

/**
 * Local anchors — same overlay shape as SECTOR_ANCHORS.
 * Gate positions are bearing-derived (deterministic, no RNG jitter).
 */
export const NORTH_ANCHORS = Object.freeze({
  sector_rhea_cinder: Object.freeze({
    stations: Object.freeze([
      Object.freeze({
        id: 'station_rhea_cinder',
        pos: Object.freeze({ x: -640, z: 520 }),
        archetypeGlb: 'place_station_mining',
        landmark: true,
      }),
    ]),
    gates: Object.freeze([
      Object.freeze({ to: 'sector_haumea_rift', pos: Object.freeze({ x: 3411, z: 2274 }) }),
      // Integration descriptor: reciprocal core gate lands in a later shared merge.
      Object.freeze({
        to: 'sector_sker_haven',
        pos: Object.freeze({ x: -994, z: -3978 }),
        integration: true,
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_rhea_1', center: Object.freeze({ x: 480, z: -320 }), clusterRadius: 440 }),
      Object.freeze({ id: 'f_rhea_2', center: Object.freeze({ x: -920, z: -640 }), clusterRadius: 380 }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_rhea_slag',
        pos: Object.freeze({ x: 1180, z: 640 }),
        landmarkGlb: 'place_dead_hulk',
        landmark: true,
      }),
      Object.freeze({
        id: 'poi_rhea_claim',
        pos: Object.freeze({ x: -1380, z: -280 }),
        landmarkGlb: 'place_debris_chunk',
      }),
    ]),
  }),

  sector_haumea_rift: Object.freeze({
    stations: Object.freeze([
      Object.freeze({
        id: 'station_haumea_rift',
        pos: Object.freeze({ x: 420, z: -780 }),
        archetypeGlb: 'place_station_research',
        landmark: true,
      }),
    ]),
    gates: Object.freeze([
      Object.freeze({ to: 'sector_rhea_cinder', pos: Object.freeze({ x: -3480, z: -2320 }) }),
      Object.freeze({ to: 'sector_eris_margin', pos: Object.freeze({ x: 4182, z: 0 }) }),
      Object.freeze({ to: 'sector_phoebe_echo', pos: Object.freeze({ x: 3266, z: 2612 }) }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_haumea_1', center: Object.freeze({ x: -380, z: 520 }), clusterRadius: 460 }),
      Object.freeze({ id: 'f_haumea_2', center: Object.freeze({ x: 860, z: 240 }), clusterRadius: 400 }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_haumea_fissure',
        pos: Object.freeze({ x: 0, z: 180 }),
        landmarkGlb: 'place_asteroid_seamed',
        landmark: true,
      }),
      Object.freeze({
        id: 'poi_haumea_buoy',
        pos: Object.freeze({ x: -1240, z: -520 }),
        landmarkGlb: 'place_lane_beacon',
      }),
      Object.freeze({
        id: 'poi_haumea_probe',
        pos: Object.freeze({ x: 960, z: -640 }),
        landmarkGlb: 'place_debris_chunk',
      }),
    ]),
  }),

  sector_eris_margin: Object.freeze({
    stations: Object.freeze([
      Object.freeze({
        id: 'station_eris_margin',
        pos: Object.freeze({ x: -820, z: 360 }),
        archetypeGlb: 'place_station_blackmarket',
        landmark: true,
      }),
    ]),
    gates: Object.freeze([
      Object.freeze({ to: 'sector_haumea_rift', pos: Object.freeze({ x: -4264, z: 0 }) }),
      Object.freeze({ to: 'sector_phoebe_echo', pos: Object.freeze({ x: 1034, z: 4137 }) }),
      Object.freeze({
        to: 'sector_ashfall_reach',
        pos: Object.freeze({ x: 3015, z: -3015 }),
        integration: true,
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_eris_1', center: Object.freeze({ x: 540, z: -420 }), clusterRadius: 450 }),
      Object.freeze({ id: 'f_eris_2', center: Object.freeze({ x: -480, z: -880 }), clusterRadius: 400 }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_eris_drop',
        pos: Object.freeze({ x: -1420, z: -360 }),
        landmarkGlb: 'place_debris_chunk',
      }),
      Object.freeze({
        id: 'poi_eris_wreck',
        pos: Object.freeze({ x: 1280, z: 720 }),
        landmarkGlb: 'place_dead_hulk',
        landmark: true,
      }),
      Object.freeze({
        id: 'poi_eris_dead_drop',
        pos: Object.freeze({ x: 420, z: -1100 }),
        landmarkGlb: 'place_debris_chunk',
      }),
    ]),
  }),

  sector_phoebe_echo: Object.freeze({
    stations: Object.freeze([
      Object.freeze({
        id: 'station_phoebe_echo',
        pos: Object.freeze({ x: 280, z: -960 }),
        archetypeGlb: 'place_station_research',
        landmark: true,
      }),
    ]),
    gates: Object.freeze([
      Object.freeze({ to: 'sector_haumea_rift', pos: Object.freeze({ x: -3522, z: -2817 }) }),
      Object.freeze({ to: 'sector_eris_margin', pos: Object.freeze({ x: -1094, z: -4375 }) }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_phoebe_1', center: Object.freeze({ x: 640, z: 320 }), clusterRadius: 480 }),
      Object.freeze({ id: 'f_phoebe_2', center: Object.freeze({ x: -880, z: -240 }), clusterRadius: 520 }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_phoebe_echo',
        pos: Object.freeze({ x: 0, z: 0 }),
        landmarkGlb: 'place_asteroid_seamed',
        landmark: true,
      }),
      Object.freeze({
        id: 'poi_phoebe_vault',
        pos: Object.freeze({ x: -1480, z: 520 }),
        landmarkGlb: 'place_debris_chunk',
      }),
    ]),
  }),
});

/**
 * Named zones — same entry shape as SECTOR_ZONES.
 * Centers align to local anchors so labels sit on real content.
 */
export const NORTH_ZONES = Object.freeze({
  sector_rhea_cinder: Object.freeze([
    Object.freeze({
      id: 'zone_rhea_claim',
      name: 'Cinder Claim',
      type: 'mining_belt',
      factionId: 'faction_dmc',
      reason: 'Collective miners work scorched rock under thin escort this far north of Sker.',
      center: Object.freeze({ x: 200, z: -200 }),
      radius: 1100,
    }),
    Object.freeze({
      id: 'zone_rhea_slag',
      name: 'Slag Glow',
      type: 'radiation_field',
      factionId: 'faction_dmc',
      reason: 'Reactor slag from failed refining still glows; shields thin out fast.',
      center: Object.freeze({ x: 420, z: -680 }),
      radius: 720,
      threat: 2,
    }),
    Object.freeze({
      id: 'zone_rhea_ambush',
      name: 'Sker-Facing Ambush',
      type: 'ambush_lane',
      factionId: 'faction_reach',
      reason: 'Reach packs hunt ore haulers on the Sker integration approach.',
      center: Object.freeze({ x: -700, z: -1800 }),
      radius: 700,
      threat: 3,
      presence: Object.freeze({
        role: 'pirates',
        archetypes: Object.freeze(['corsair_raider', 'reaver_pirate']),
        size: Object.freeze([2, 4]),
        doctrine: 'scavenger',
        formation: 'wedge',
        context: 'zone_hostile',
        hostile: true,
      }),
    }),
  ]),

  sector_haumea_rift: Object.freeze([
    Object.freeze({
      id: 'zone_haumea_obs',
      name: 'Rift Observatory',
      type: 'civilian_core',
      factionId: 'faction_free',
      reason: 'Free Frontier scientists chart the ice fissures; traffic is thin and cautious.',
      center: Object.freeze({ x: 420, z: -780 }),
      radius: 900,
    }),
    Object.freeze({
      id: 'zone_haumea_ice',
      name: 'Fracture Seams',
      type: 'mining_belt',
      factionId: 'faction_free',
      reason: 'Icy crystalline seams open where the rift shear cut the rock.',
      center: Object.freeze({ x: 200, z: 380 }),
      radius: 1000,
    }),
    Object.freeze({
      id: 'zone_haumea_fissure',
      name: 'Ice Fissure',
      type: 'anomaly_deep',
      factionId: 'faction_free',
      reason: 'Sensors ghost along the fissure line — the signal that drew the observatory north.',
      center: Object.freeze({ x: 0, z: 180 }),
      radius: 520,
      threat: 2,
    }),
  ]),

  sector_eris_margin: Object.freeze([
    Object.freeze({
      id: 'zone_eris_fence',
      name: 'Margin Fence',
      type: 'outlaw_zone',
      factionId: 'faction_quiet',
      reason: 'The Quiet fence contraband off the Ashfall approach; papers stop at the gate.',
      center: Object.freeze({ x: -820, z: 360 }),
      radius: 1000,
      presence: Object.freeze({
        role: 'smugglers',
        archetypes: Object.freeze(['reaver_pirate']),
        size: Object.freeze([1, 3]),
        doctrine: 'scavenger',
        formation: 'loose',
        context: 'zone_hostile',
        hostile: true,
        factionId: 'faction_quiet',
      }),
    }),
    Object.freeze({
      id: 'zone_eris_fog',
      name: 'Margin Fog',
      type: 'nebula_fog',
      factionId: 'faction_quiet',
      reason: 'Sensor-soft fog covers drop points and wrecks alike.',
      center: Object.freeze({ x: 360, z: 520 }),
      radius: 900,
      threat: 1,
    }),
    Object.freeze({
      id: 'zone_eris_ambush',
      name: 'Ashfall Approach Camp',
      type: 'ambush_lane',
      factionId: 'faction_reach',
      reason: 'Anything heading south toward Ashfall is scanned, then offered a choice.',
      center: Object.freeze({ x: 1600, z: -1600 }),
      radius: 780,
      threat: 3,
      presence: Object.freeze({
        role: 'pirates',
        archetypes: Object.freeze(['corsair_raider', 'reaver_pirate', 'wasp_swarmer']),
        size: Object.freeze([3, 5]),
        doctrine: 'scavenger',
        formation: 'wedge',
        context: 'zone_hostile',
        hostile: true,
      }),
    }),
  ]),

  sector_phoebe_echo: Object.freeze([
    Object.freeze({
      id: 'zone_phoebe_shrine',
      name: 'Echo Shrine',
      type: 'anomaly_deep',
      factionId: 'faction_vael',
      reason: 'Vael watch the resonance — whatever answers the echo is not for sale.',
      center: Object.freeze({ x: 0, z: 0 }),
      radius: 1100,
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
      id: 'zone_phoebe_edge',
      name: 'Cold Edge Seams',
      type: 'mining_belt',
      factionId: 'faction_vael',
      reason: 'Exotic rock and gas clouds at the north rim — high yield, no rescue.',
      center: Object.freeze({ x: -200, z: 100 }),
      radius: 1000,
    }),
  ]),
});

/**
 * Explicit reciprocal gate edge descriptors for later canonical integration.
 * Intra-cluster edges must appear once with sorted endpoints; integration edges
 * mark core destinations that still need reciprocal core-side gates.
 */
export const NORTH_GATE_EDGES = Object.freeze([
  Object.freeze({
    a: 'sector_rhea_cinder',
    b: 'sector_haumea_rift',
    integration: false,
    aLocal: Object.freeze({ x: 3411, z: 2274 }),
    bLocal: Object.freeze({ x: -3480, z: -2320 }),
  }),
  Object.freeze({
    a: 'sector_haumea_rift',
    b: 'sector_eris_margin',
    integration: false,
    aLocal: Object.freeze({ x: 4182, z: 0 }),
    bLocal: Object.freeze({ x: -4264, z: 0 }),
  }),
  Object.freeze({
    a: 'sector_haumea_rift',
    b: 'sector_phoebe_echo',
    integration: false,
    aLocal: Object.freeze({ x: 3266, z: 2612 }),
    bLocal: Object.freeze({ x: -3522, z: -2817 }),
  }),
  Object.freeze({
    a: 'sector_eris_margin',
    b: 'sector_phoebe_echo',
    integration: false,
    aLocal: Object.freeze({ x: 1034, z: 4137 }),
    bLocal: Object.freeze({ x: -1094, z: -4375 }),
  }),
  Object.freeze({
    a: 'sector_rhea_cinder',
    b: 'sector_sker_haven',
    integration: true,
    aLocal: Object.freeze({ x: -994, z: -3978 }),
    bLocal: null, // core-side reciprocal deferred
  }),
  Object.freeze({
    a: 'sector_eris_margin',
    b: 'sector_ashfall_reach',
    integration: true,
    aLocal: Object.freeze({ x: 3015, z: -3015 }),
    bLocal: null,
  }),
]);

/** Cluster package root — self-contained export for tests and later merge. */
export const NORTH_CLUSTER = Object.freeze({
  id: 'north',
  latticeWu: LATTICE_WU,
  gateR: GATE_R,
  frozenCoreSectorIds: FROZEN_CORE_SECTOR_IDS,
  sectorIds: NORTH_SECTOR_IDS,
  originCells: NORTH_ORIGIN_CELLS,
  origins: NORTH_ORIGINS,
  sectors: NORTH_SECTORS,
  anchors: NORTH_ANCHORS,
  zones: NORTH_ZONES,
  gateEdges: NORTH_GATE_EDGES,
  palette: NORTH_PALETTE,
});

export default NORTH_CLUSTER;
