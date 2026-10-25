// M2b EAST frontier cluster — self-contained, canonical-compatible sector records.
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

/** EAST M2b region IDs in stable integration order. */
export const EAST_SECTOR_IDS = Object.freeze([
  'sector_nereid_shoal',
  'sector_proteus_well',
  'sector_triton_wake',
]);

/** Map-graph origin cells (map.x, map.y) — global XZ = cell * LATTICE_WU. */
export const EAST_ORIGIN_CELLS = Object.freeze({
  sector_nereid_shoal: Object.freeze({ x: 9, y: 3 }),
  sector_proteus_well: Object.freeze({ x: 11, y: 6 }),
  sector_triton_wake: Object.freeze({ x: 12, y: 10 }),
});

/** Explicit 4096-lattice galactic-global origins. */
export const EAST_ORIGINS = Object.freeze({
  sector_nereid_shoal: Object.freeze({
    x: 9 * LATTICE_WU,
    z: 3 * LATTICE_WU,
  }),
  sector_proteus_well: Object.freeze({
    x: 11 * LATTICE_WU,
    z: 6 * LATTICE_WU,
  }),
  sector_triton_wake: Object.freeze({
    x: 12 * LATTICE_WU,
    z: 10 * LATTICE_WU,
  }),
});

/** Palette blocks mirrored from SECTOR_PALETTE_CLASSES (no shared import). */
const PALETTE_FRINGE = Object.freeze({
  key: 0xffb07a,
  rim: 0x9875ce,
  fill: 0xbc91a6,
  ambient: 0x51435d,
  fog: 0x090504,
  fogDensity: 0.00003,
  nebulaTint: 0x8a1e1e,
  dust: 0xc15032,
});

const PALETTE_ANOMALY = Object.freeze({
  key: 0xc8b6ff,
  rim: 0x54ffb0,
  fill: 0x4ddc92,
  ambient: 0x494760,
  fog: 0x08050d,
  fogDensity: 0.00012,
  nebulaTint: 0x5a1e8a,
  dust: 0x79ffc8,
});

/**
 * Canonical-compatible sector cards for the EAST cluster.
 * neighbors include intra-cluster edges + external story-sector stubs for later graph integration.
 */
export const EAST_SECTORS = Object.freeze([
  Object.freeze({
    id: 'sector_nereid_shoal',
    name: 'Nereid Shoal',
    tier: 2,
    security: 0.30,
    charted: false,
    factionId: 'faction_free',
    industries: { mining: true },
    position: Object.freeze({ x: 9, y: 3 }),
    worldRadius: 4700,
    paletteClass: 'fringe',
    palette: PALETTE_FRINGE,
    trafficPerMin: 4,
    enemyDensity: 0.48,
    enemyLevel: Object.freeze([5, 8]),
    neighbors: Object.freeze([
      'sector_io_reach',
      'sector_tethys_junction',
      'sector_proteus_well',
    ]),
    stations: Object.freeze([
      Object.freeze({
        id: 'station_nereid',
        name: 'Nereid Waystation',
        type: 'trade_hub',
        factionId: 'faction_free',
        size: 'M',
        services: Object.freeze(['trade', 'repair', 'refuel', 'missions']),
        chartNote: 'Open docks on the east run: freight, repairs, and contracts under very thin law.',
      }),
      Object.freeze({
        id: 'station_nereid_claim',
        name: 'Shoal Claim',
        type: 'mining',
        factionId: 'faction_dmc',
        size: 'S',
        services: Object.freeze(['trade', 'ore_buy', 'refuel']),
        chartNote: 'Independent ice crews sell ore same-shift under a Collective cut.',
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_nereid_1', type: 'ast_icy', countWeight: 1.0 }),
      Object.freeze({ id: 'f_nereid_2', type: 'ast_common_rock', countWeight: 0.85 }),
    ]),
    hazards: Object.freeze([
      Object.freeze({
        type: 'dense_asteroid',
        center: Object.freeze({ x: 520, z: -680 }),
        radius: 720,
        intensity: 0.48,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({ id: 'poi_nereid_wreck', type: 'wreck', name: 'Ice-Hull Wreck' }),
      Object.freeze({
        id: 'poi_nereid_shoal_memorial',
        type: 'beacon',
        name: 'Shoal Ledger Marker',
        discoveryPlate: Object.freeze({
          title: 'Shoal Ledger Marker',
          body: "The shoal salvors' own marker, set by law — the rime kept the count, the marker keeps the names: O. Ferro, K. Ferro, and the apprentice nobody carded. Cut lines on the holds say they were opened after the crew were already ice.",
        }),
      }),
      Object.freeze({
        id: 'poi_nereid_cache',
        type: 'cache',
        name: 'Shoal Cache',
        hidden: true,
      }),
      // ATTENTION S-14 (7/14) — shoal bookkeeping in ice: the salvors' rime board,
      // and the independents' flag flying under the Collective cut.
      Object.freeze({
        id: 'poi_nereid_rime_board',
        type: 'beacon',
        name: 'Rime Board',
        discoveryPlate: Object.freeze({
          title: 'Rime Board',
          body: 'A standing board on the ice field\u2019s rim where the salvors scratch claim-lines through the same rime that keeps their count. A line holds until the ice grows over it, which is the shoal\u2019s whole idea of a filing period.',
        }),
      }),
      Object.freeze({
        id: 'poi_nereid_independent_flag',
        type: 'beacon',
        name: 'Independent Flag',
        discoveryPlate: Object.freeze({
          title: 'Independent Flag',
          body: 'A hand-sewn claim flag on the common seam\u2019s edge, one of a dozen the ice crews fly under the Collective\u2019s cut. The colors are filed at the Shoal Claim desk and nowhere else — on the shoal, a flag is a signature, not a flag.',
        }),
      }),
    ]),
  }),

  Object.freeze({
    id: 'sector_proteus_well',
    name: 'Proteus Well',
    tier: 3,
    security: 0.16,
    charted: false,
    factionId: 'faction_quiet',
    threat: 'quiet',
    position: Object.freeze({ x: 11, y: 6 }),
    worldRadius: 5000,
    paletteClass: 'fringe',
    palette: PALETTE_FRINGE,
    trafficPerMin: 2,
    enemyDensity: 0.62,
    enemyLevel: Object.freeze([7, 11]),
    neighbors: Object.freeze([
      'sector_nereid_shoal',
      'sector_triton_wake',
      'sector_veil_nebula',
    ]),
    stations: Object.freeze([
      Object.freeze({
        id: 'station_proteus',
        name: 'Proteus Den',
        type: 'blackmarket',
        factionId: 'faction_quiet',
        size: 'M',
        services: Object.freeze(['black_market', 'repair', 'refuel', 'missions']),
        chartNote: 'Quiet standing opens the berth; at the well-mouth, active pulses find what sensors miss.',
        repGated: true,
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_proteus_1', type: 'ast_metallic', countWeight: 1.0 }),
      Object.freeze({ id: 'f_proteus_2', type: 'ast_crystalline', countWeight: 0.75 }),
    ]),
    hazards: Object.freeze([
      Object.freeze({
        type: 'nebula',
        center: Object.freeze({ x: -420, z: 540 }),
        radius: 900,
        intensity: 0.55,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_proteus_stash',
        type: 'cache',
        name: 'Below-Deck Cache',
        hidden: true,
        factionId: 'faction_quiet',
        requiresActiveScan: true,
        discoveryPlate: Object.freeze({
          title: 'Below-Deck Cache',
          body: 'An active pulse found Quiet bearer cases sealed beneath the Funnel debris floor. Passive proximity sensors passed over the same return.',
        }),
      }),
      Object.freeze({
        id: 'poi_proteus_hulk',
        type: 'derelict',
        name: 'The Funnel',
        scannerSignalKind: 'archive',
        repeatableScannerSignal: true,
        flavorTargetRef: 'landmark_c10_funnel',
        discoveryPlate: Object.freeze({
          title: 'The Funnel',
          body: 'The Quiet cut a civilian freighter into a single-file throat. Violet guide strips lead toward a debris floor that returns more mass than the visible hull explains.',
        }),
      }),
      Object.freeze({
        id: 'poi_proteus_buoy',
        type: 'beacon',
        name: 'Well Range Buoy',
      }),
      // ATTENTION S-14 (11/14) — the den's own marks: violet strip-paint on the
      // metallic seam, and the post where bearer cases stage before the funnel run.
      Object.freeze({
        id: 'poi_proteus_strip_marks',
        type: 'beacon',
        name: 'Strip Marks',
        discoveryPlate: Object.freeze({
          title: 'Strip Marks',
          body: 'Violet strip-paint on the metallic seam\u2019s rim, same hand and color as the Funnel\u2019s guide strips. The strips mark rock the den\u2019s runners have already spoken for; a stone wearing the violet is a stone you are invited not to assay.',
        }),
      }),
      Object.freeze({
        id: 'poi_proteus_bearer_post',
        type: 'beacon',
        name: 'Bearer Post',
        discoveryPlate: Object.freeze({
          title: 'Bearer Post',
          body: 'A lock-post at the crystalline seam\u2019s edge where bearer cases stage before the funnel run. The chalk beside it marks who is owed — no names, no cargo, only the count, which is the only part the den files as evidence.',
        }),
      }),
    ]),
  }),

  Object.freeze({
    id: 'sector_triton_wake',
    name: 'Triton Wake',
    tier: 3,
    security: 0.10,
    charted: false,
    factionId: 'faction_vael',
    threat: 'vael',
    industries: { research: true },
    position: Object.freeze({ x: 12, y: 10 }),
    worldRadius: 5300,
    paletteClass: 'anomaly',
    palette: PALETTE_ANOMALY,
    trafficPerMin: 0,
    enemyDensity: 0.70,
    enemyLevel: Object.freeze([8, 13]),
    neighbors: Object.freeze([
      'sector_proteus_well',
      'sector_veil_nebula',
    ]),
    stations: Object.freeze([
      Object.freeze({
        id: 'station_triton',
        name: 'Triton Wake Lab',
        type: 'research',
        factionId: 'faction_free',
        size: 'M',
        services: Object.freeze(['scan_tech', 'missions', 'repair', 'refuel']),
        chartNote: 'Wake readings, repairs, and dangerous survey work under Vael sufferance.',
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_triton_1', type: 'ast_gas_cloud', countWeight: 1.0 }),
      Object.freeze({ id: 'f_triton_2', type: 'ast_rare_exotic', countWeight: 0.65 }),
      // 04 "Throw: wake debris" — dead metal dragged along the departure lane (row 540).
      Object.freeze({ id: 'f_triton_3', type: 'ast_metallic', countWeight: 0.55 }),
    ]),
    hazards: Object.freeze([
      Object.freeze({
        type: 'radiation',
        center: Object.freeze({ x: 180, z: -220 }),
        radius: 780,
        intensity: 0.62,
      }),
      Object.freeze({
        type: 'nebula',
        center: Object.freeze({ x: -600, z: 800 }),
        radius: 1100,
        intensity: 0.7,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_triton_anomaly',
        type: 'anomaly',
        name: 'Wake Anomaly',
        discoveryPlate: Object.freeze({
          title: 'The Wake Anomaly',
          body: 'A star once occupied the Tide-Locked Watcher\u2019s gaze; this is the wake it left. Nothing here reflects light \u2014 the distortion bends it around something that departed eighty million years ago and is, by every instrument, still departing.',
        }),
      }),
      Object.freeze({
        id: 'poi_triton_beacon',
        type: 'beacon',
        name: 'Wake Marker',
      }),
      Object.freeze({
        id: 'poi_triton_wreck',
        type: 'wreck',
        name: 'Wake-Runner Hull',
      }),
      Object.freeze({
        id: 'poi_triton_wake_memorial',
        type: 'beacon',
        name: 'Wake-Bell Marker',
        discoveryPlate: Object.freeze({
          title: 'Wake-Bell Marker',
          body: 'A bell buoy with its clapper pulled, tuned to sit silent on the wake drift. The plate names only the captain — Reva Ils; the wake does not give the other three back. Kill-marks line the spine like stitching, too regular to be rock.',
        }),
      }),
      Object.freeze({
        id: 'poi_triton_watcher',
        type: 'anomaly',
        name: 'The Tide-Locked Watcher',
        factionId: 'faction_vael',
        scannerSignalKind: 'archive',
        repeatableScannerSignal: true,
        flavorTargetRef: 'landmark_c15_tide_locked_watcher',
        discoveryPlate: Object.freeze({
          title: 'The Tide-Locked Watcher',
          body: 'Monolithic megalith shaped into an aperture oriented toward empty dark space. Spectrometry dates the carving eighty million years back, aligned with a vanished stellar cradle. Close sensor passes confirm persistent localized dampening fields along its focal axis.',
        }),
      }),
      Object.freeze({
        id: 'poi_triton_field_lab',
        type: 'anomaly',
        name: 'Triton Field Lab',
        pos: { x: 1600, z: -700 },
        factionId: 'faction_archive',
        discoveryPlate: Object.freeze({
          title: 'Triton Field Lab',
          body: 'A research platform in the Archive’s colors, set down in the Wake where the instruments disagree with one another. Its signal slips in and out of lock — a lab logging something it cannot show. Triangulate before you close range.',
        }),
      }),
      // ATTENTION S-14 (14/14) — the wake's instruments: a drift buoy the field lab
      // parked on the debris seam, and a survey that was never finished.
      Object.freeze({
        id: 'poi_triton_drift_log',
        type: 'beacon',
        name: 'Drift Log Buoy',
        discoveryPlate: Object.freeze({
          title: 'Drift Log Buoy',
          body: 'A field-lab telemetry buoy parked at the wake-debris seam\u2019s rim, logging how fast the dead metal still travels. Eighty million years after departure the debris is still arriving somewhere; the buoy takes the measurement personally.',
        }),
      }),
      Object.freeze({
        id: 'poi_triton_abandoned_survey',
        type: 'derelict',
        name: 'Abandoned Survey',
        discoveryPlate: Object.freeze({
          title: 'Abandoned Survey',
          body: 'Half a survey grid scratched into the exotic seam — stake holes, one bearing line, no completion stamp. The team that started it filed the seam as measured; the instruments that disagreed were filed as equipment.',
        }),
      }),
    ]),
  }),
]);

/**
 * Local station/gate/field/POI anchors (sector-local XZ).
 * Intra-cluster gates are reciprocal; external gates are stubs for later story-graph wiring.
 */
export const EAST_ANCHORS = Object.freeze({
  sector_nereid_shoal: Object.freeze({
    stations: Object.freeze([
      Object.freeze({
        id: 'station_nereid',
        pos: Object.freeze({ x: 960, z: -380 }),
        archetypeGlb: 'place_station_trade_hub',
        landmark: true,
      }),
      Object.freeze({
        id: 'station_nereid_claim',
        pos: Object.freeze({ x: -780, z: 920 }),
        archetypeGlb: 'place_claim_outpost_base',
      }),
    ]),
    gates: Object.freeze([
      // external → Io Reach (5,5)
      Object.freeze({
        to: 'sector_io_reach',
        pos: Object.freeze({ x: -3447, z: 1724 }),
        external: true,
      }),
      // external → Tethys Junction (3,2)
      Object.freeze({
        to: 'sector_tethys_junction',
        pos: Object.freeze({ x: -3802, z: -634 }),
        external: true,
      }),
      // internal → Proteus Well (11,6)
      Object.freeze({
        to: 'sector_proteus_well',
        pos: Object.freeze({ x: 2138, z: 3207 }),
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({
        id: 'f_nereid_1',
        center: Object.freeze({ x: 420, z: -640 }),
        clusterRadius: 440,
      }),
      Object.freeze({
        id: 'f_nereid_2',
        center: Object.freeze({ x: -920, z: 380 }),
        clusterRadius: 400,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_nereid_wreck',
        pos: Object.freeze({ x: 1280, z: 720 }),
        landmarkGlb: 'place_dead_hulk',
        landmark: true,
      }),
      Object.freeze({
        id: 'poi_nereid_shoal_memorial',
        pos: Object.freeze({ x: 1160, z: 780 }),
        landmarkGlb: 'place_nav_buoy',
      }),
      Object.freeze({
        id: 'poi_nereid_cache',
        pos: Object.freeze({ x: -1420, z: -280 }),
        landmarkGlb: 'place_debris_chunk',
      }),
      Object.freeze({
        // ATTENTION S-14 — f_nereid_1 rim (center 420,-640, r440).
        id: 'poi_nereid_rime_board',
        pos: Object.freeze({ x: 484, z: -576 }),
        landmarkGlb: 'place_tally_post',
        visualRadius: 9,
      }),
      Object.freeze({
        // ATTENTION S-14 — f_nereid_2 rim (center -920,380, r400).
        id: 'poi_nereid_independent_flag',
        pos: Object.freeze({ x: -856, z: 444 }),
        landmarkGlb: 'place_claim_mark',
        visualRadius: 5,
      }),
    ]),
  }),

  sector_proteus_well: Object.freeze({
    stations: Object.freeze([
      Object.freeze({
        id: 'station_proteus',
        pos: Object.freeze({ x: -640, z: 520 }),
        archetypeGlb: 'place_station_blackmarket',
        landmark: true,
      }),
    ]),
    gates: Object.freeze([
      // internal → Nereid Shoal (9,3)
      Object.freeze({
        to: 'sector_nereid_shoal',
        pos: Object.freeze({ x: -2274, z: -3411 }),
      }),
      // internal → Triton Wake (12,10)
      Object.freeze({
        to: 'sector_triton_wake',
        pos: Object.freeze({ x: 994, z: 3978 }),
      }),
      // external → Veil Nebula (7,9)
      Object.freeze({
        to: 'sector_veil_nebula',
        pos: Object.freeze({ x: -3280, z: 2460 }),
        external: true,
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({
        id: 'f_proteus_1',
        center: Object.freeze({ x: 680, z: -420 }),
        clusterRadius: 460,
      }),
      Object.freeze({
        id: 'f_proteus_2',
        center: Object.freeze({ x: -1080, z: -640 }),
        clusterRadius: 380,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_proteus_stash',
        pos: Object.freeze({ x: 1120, z: 935 }),
        landmarkGlb: 'place_debris_chunk',
      }),
      Object.freeze({
        id: 'poi_proteus_hulk',
        pos: Object.freeze({ x: 1120, z: 860 }),
        landmarkGlb: 'place_dead_hulk',
        landmark: true,
      }),
      Object.freeze({
        id: 'poi_proteus_buoy',
        pos: Object.freeze({ x: 320, z: -980 }),
        landmarkGlb: 'place_lane_beacon',
      }),
      Object.freeze({
        // ATTENTION S-14 — f_proteus_1 rim (center 680,-420, r460).
        id: 'poi_proteus_strip_marks',
        pos: Object.freeze({ x: 740, z: -364 }),
        landmarkGlb: 'place_asteroid_graffiti',
        visualRadius: 16,
      }),
      Object.freeze({
        // ATTENTION S-14 — f_proteus_2 rim (center -1080,-640, r380).
        id: 'poi_proteus_bearer_post',
        pos: Object.freeze({ x: -1016, z: -576 }),
        landmarkGlb: 'place_cold_locker',
        visualRadius: 11,
      }),
    ]),
  }),

  sector_triton_wake: Object.freeze({
    stations: Object.freeze([
      Object.freeze({
        id: 'station_triton',
        pos: Object.freeze({ x: 480, z: -980 }),
        archetypeGlb: 'place_station_research',
        landmark: true,
      }),
    ]),
    gates: Object.freeze([
      // internal → Proteus Well (11,6)
      Object.freeze({
        to: 'sector_proteus_well',
        pos: Object.freeze({ x: -1054, z: -4216 }),
      }),
      // external → Veil Nebula (7,9)
      Object.freeze({
        to: 'sector_veil_nebula',
        pos: Object.freeze({ x: -4262, z: -852 }),
        external: true,
      }),
    ]),
    fields: Object.freeze([
      Object.freeze({
        id: 'f_triton_1',
        center: Object.freeze({ x: -320, z: 560 }),
        clusterRadius: 520,
      }),
      Object.freeze({
        id: 'f_triton_2',
        center: Object.freeze({ x: 940, z: 280 }),
        clusterRadius: 400,
      }),
      // Wake debris on the lane between the marker and the radiation glow.
      Object.freeze({
        id: 'f_triton_3',
        center: Object.freeze({ x: -980, z: -380 }),
        clusterRadius: 420,
      }),
    ]),
    pois: Object.freeze([
      Object.freeze({
        id: 'poi_triton_anomaly',
        pos: Object.freeze({ x: 40, z: 120 }),
        landmarkGlb: 'place_asteroid_seamed',
        landmark: true,
      }),
      Object.freeze({
        id: 'poi_triton_beacon',
        pos: Object.freeze({ x: -1260, z: -540 }),
        landmarkGlb: 'place_lane_beacon',
      }),
      Object.freeze({
        id: 'poi_triton_wreck',
        pos: Object.freeze({ x: 1080, z: 720 }),
        landmarkGlb: 'place_dead_hulk',
      }),
      Object.freeze({
        id: 'poi_triton_wake_memorial',
        pos: Object.freeze({ x: 960, z: 790 }),
        landmarkGlb: 'place_nav_buoy',
      }),
      Object.freeze({
        id: 'poi_triton_watcher',
        pos: Object.freeze({ x: -1700, z: 1500 }),
        landmarkGlb: 'place_triton_aperture_monolith',
        landmark: true,
        // The aperture's local +X face looks at the wake anomaly.
        rot: Math.atan2(120 - 1500, 40 - (-1700)),
        placeTargetRadius: 36,
        visualRadius: 36,
      }),
      // The Archive's field lab (sector row above): the scannable research platform needs a body
      // to stand on, or its discovery plate points at empty space.
      Object.freeze({
        id: 'poi_triton_field_lab',
        pos: Object.freeze({ x: 1600, z: -700 }),
        // The lab's instrument mast. The inspection platform this first named has a release GLB but no
        // production source or parts-manifest row, so the atlas gate could not resolve it (D193).
        landmarkGlb: 'place_sensor_mast',
      }),
      Object.freeze({
        // ATTENTION S-14 — f_triton_3 rim (center -980,-380, r420).
        id: 'poi_triton_drift_log',
        pos: Object.freeze({ x: -916, z: -316 }),
        landmarkGlb: 'place_nav_buoy',
        visualRadius: 10,
      }),
      Object.freeze({
        // ATTENTION S-14 — f_triton_2 rim (center 940,280, r400).
        id: 'poi_triton_abandoned_survey',
        pos: Object.freeze({ x: 876, z: 344 }),
        landmarkGlb: 'place_ash_pin',
        visualRadius: 6,
      }),
    ]),
  }),
});

/**
 * Named zones (>=1 per region). Types/vocab from sectorZones.js ZONE_TYPES.
 * Centers align to local anchors above.
 */
export const EAST_ZONES = Object.freeze({
  sector_nereid_shoal: Object.freeze([
    Object.freeze({
      id: 'zone_nereid_core',
      name: 'Nereid Way',
      type: 'civilian_core',
      factionId: 'faction_free',
      reason: 'A Free Frontier waystation on the east approach — thin law, open docks.',
      center: Object.freeze({ x: 960, z: -380 }),
      radius: 1100,
      threat: 1,
    }),
    Object.freeze({
      id: 'zone_nereid_shoal',
      name: 'Ice Shoal Seams',
      type: 'mining_belt',
      factionId: 'faction_dmc',
      reason: 'Icy rock worked by independents under a Collective cut.',
      center: Object.freeze({ x: 420, z: -640 }),
      radius: 720,
      threat: 1,
    }),
    Object.freeze({
      id: 'zone_nereid_ambush',
      name: 'Shoal Shadow',
      type: 'ambush_lane',
      factionId: 'faction_reach',
      reason: 'Reach skiffs stage behind dense rock for loaded ore haulers.',
      center: Object.freeze({ x: 1280, z: 720 }),
      radius: 560,
      threat: 3,
      presence: Object.freeze({
        role: 'pirates',
        archetypes: Object.freeze(['reaver_pirate', 'wasp_swarmer']),
        size: Object.freeze([2, 4]),
        doctrine: 'scavenger',
        formation: 'wedge',
        context: 'zone_hostile',
        hostile: true,
      }),
    }),
  ]),

  sector_proteus_well: Object.freeze([
    Object.freeze({
      id: 'zone_proteus_den',
      name: 'The Well Den',
      type: 'outlaw_zone',
      factionId: 'faction_quiet',
      reason: 'Quiet brokers fence east-run contraband off the books.',
      center: Object.freeze({ x: -640, z: 520 }),
      radius: 1000,
      threat: 2,
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
      id: 'zone_proteus_choke',
      name: 'Well-Mouth Choke',
      type: 'ambush_lane',
      factionId: 'faction_reach',
      reason: 'Anything that drops from Nereid is scanned, then sold or stripped.',
      center: Object.freeze({ x: 1120, z: 860 }),
      radius: 680,
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
    Object.freeze({
      id: 'zone_proteus_seams',
      name: 'Well Seams',
      type: 'mining_belt',
      factionId: 'faction_quiet',
      reason: 'Metallic crystal seams worked by crews who do not ask questions.',
      center: Object.freeze({ x: 680, z: -420 }),
      radius: 640,
      threat: 2,
    }),
  ]),

  sector_triton_wake: Object.freeze([
    Object.freeze({
      id: 'zone_triton_lab',
      name: 'Wake Lab Approach',
      type: 'civilian_core',
      factionId: 'faction_free',
      reason: 'Free Frontier scientists study the wake under Vael sufferance.',
      center: Object.freeze({ x: 480, z: -980 }),
      radius: 900,
      threat: 2,
    }),
    Object.freeze({
      id: 'zone_triton_anomaly',
      name: 'The Wake',
      type: 'anomaly_deep',
      factionId: 'faction_vael',
      reason: 'Sensors ghost and autopilot drifts; the Vael guard what waits inside.',
      center: Object.freeze({ x: 40, z: 120 }),
      radius: 860,
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
      id: 'zone_triton_glow',
      name: 'Wake Glow',
      type: 'radiation_field',
      factionId: 'faction_vael',
      reason: 'Hard radiation blooms along the wake spine — shields thin fast.',
      center: Object.freeze({ x: 180, z: -220 }),
      radius: 700,
      threat: 2,
    }),
  ]),
});

/**
 * Reciprocal gate descriptor list for later canonical integration.
 * Internal pairs must both exist; external pairs document the story-side stub required.
 */
export const EAST_GATE_DESCRIPTORS = Object.freeze([
  Object.freeze({
    from: 'sector_nereid_shoal',
    to: 'sector_proteus_well',
    internal: true,
  }),
  Object.freeze({
    from: 'sector_proteus_well',
    to: 'sector_nereid_shoal',
    internal: true,
  }),
  Object.freeze({
    from: 'sector_proteus_well',
    to: 'sector_triton_wake',
    internal: true,
  }),
  Object.freeze({
    from: 'sector_triton_wake',
    to: 'sector_proteus_well',
    internal: true,
  }),
  Object.freeze({
    from: 'sector_nereid_shoal',
    to: 'sector_io_reach',
    internal: false,
    note: 'Story-side reciprocal gate pending integration',
  }),
  Object.freeze({
    from: 'sector_nereid_shoal',
    to: 'sector_tethys_junction',
    internal: false,
    note: 'Story-side reciprocal gate pending integration',
  }),
  Object.freeze({
    from: 'sector_proteus_well',
    to: 'sector_veil_nebula',
    internal: false,
    note: 'Story-side reciprocal gate pending integration',
  }),
  Object.freeze({
    from: 'sector_triton_wake',
    to: 'sector_veil_nebula',
    internal: false,
    note: 'Story-side reciprocal gate pending integration',
  }),
]);

/** Self-contained cluster record for M2b EAST. */
export const EAST_CLUSTER = Object.freeze({
  id: 'frontier_cluster_east',
  version: 1,
  latticeWu: LATTICE_WU,
  sectorIds: EAST_SECTOR_IDS,
  frozenOriginalSectorIds: FROZEN_ORIGINAL_SECTOR_IDS,
  originCells: EAST_ORIGIN_CELLS,
  origins: EAST_ORIGINS,
  sectors: EAST_SECTORS,
  anchors: EAST_ANCHORS,
  zones: EAST_ZONES,
  gateDescriptors: EAST_GATE_DESCRIPTORS,
});

export default EAST_CLUSTER;
