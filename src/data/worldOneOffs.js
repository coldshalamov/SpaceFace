// PQ-143.02 — texture one-offs (design/program/roadmap/active/PQ-143.md, leaf .02): the six
// original set pieces plus the CR-TEXTURE runaway ladle at Vesta Forge, then the CR-TEXTURE-1
// coverage pass — one reachable one-off per named sector.
//
// The universe needs a handful of memorable, NON-systemic set pieces: things a player flies past
// once and remembers, with no mission, no economy and no scan gate attached. "Not everything
// needs to be systemically important" (design/VISION.md Part II).
//
// Consumption: src/systems/world.js `_spawnWorldOneOffs` spawns each record's prop cluster at the
// authored sector-local position every time the sector activates — no seed, no epoch, no rng: a
// one-off is always exactly where it is. Props are the existing non-colliding dressing substrate
// (`_spawnPlaceProp`), so the set pieces cost no new draw systems and are killed with the rest of
// the sector's dressing on deactivation. The courier is not a prop: she is a named lane contact
// flying the `express` traffic role (lane_cinder_run_courier in laneContacts.js), stamped as a
// deterministic fixture of the start sector by traffic.js.
//
// Reachability: every anchor is on the default route — Helios Prime (the start) and its gate
// neighbours (Ceres Belt, Tethys Junction, Vesta Forge). PlaceIds reference existing packaged
// props only (verified by test/world-one-offs.test.mjs against the packaged GLBs); no new art,
// no owner call.

export const WORLD_ONE_OFFS = Object.freeze([
  Object.freeze({
    id: 'oneoff_abandoned_tug',
    name: 'The Long Berth — an abandoned yard tug',
    placeId: 'place_dead_hulk',
    sectorId: 'sector_ceres_belt',
    // Beside the refinery: station_ceres is "Ceres Refinery" (sectorAnchors.js), on the side
    // away from the f_ceres_2 rock field so no seed buries her in rocks.
    anchor: { type: 'station', id: 'station_ceres' },
    offsetLocal: Object.freeze({ x: -260, z: 240 }),
    rot: 2.1,
    spin: 0.32,
    radius: 22,
    // The yard tug is the one set piece with body agency: the player's existing rope/shove can
    // move it, and worldRecords carries that same body identity across sector residency.
    physicalBody: Object.freeze({ mass: 180 }),
    why: 'She set down for a refit the yard never finished; she turns a degree a season.',
  }),
  Object.freeze({
    id: 'oneoff_strut_shrine',
    name: 'The Strut Shrine',
    placeId: 'place_memorial_array',
    sectorId: 'sector_ceres_belt',
    // Across the refinery lane from the tug: belt crews hang ribbons on a torn-off truss on the
    // far side of the approach, where every hauler passing the refinery sees it.
    anchor: { type: 'station', id: 'station_ceres' },
    offsetLocal: Object.freeze({ x: 980, z: 1140 }),
    rot: 0.8,
    spin: 0,
    radius: 18,
    why: 'Plates and ribbons on a torn-off truss; the belt crews add one every year.',
  }),
  Object.freeze({
    id: 'oneoff_ram_pirate',
    name: 'Ramrod — a pirate charge-hulk wearing a ridiculous ram',
    placeId: 'place_aftermath_wreck_corvette_forward__stripped_heavy',
    sectorId: 'sector_ceres_belt',
    anchor: { type: 'station', id: 'station_ceres' },
    offsetLocal: Object.freeze({ x: -620, z: 540 }),
    rot: 4.4,
    spin: 0,
    radius: 20,
    why: 'Someone welded a refinery spine onto the bow and charged a convoy with it. Once.',
  }),
  Object.freeze({
    id: 'oneoff_old_pod_field',
    name: 'The Grey Family Pods — a decades-old pod field',
    placeId: 'place_habitat_pod_derelict',
    sectorId: 'sector_ceres_belt',
    anchor: { type: 'station', id: 'station_ceres' },
    offsetLocal: Object.freeze({ x: 820, z: -700 }),
    rot: 1.2,
    spin: 0,
    radius: 34,
    cluster: Object.freeze({
      // A drifting scatter of the family's long-dead habitat pods and breached cargo shells:
      // deterministic offsets (no rng — a one-off is always exactly this field).
      props: Object.freeze([
        Object.freeze({ placeId: 'place_habitat_pod_derelict', dx: 0, dz: 0, rot: 1.2, radius: 12 }),
        Object.freeze({ placeId: 'place_habitat_pod_derelict', dx: 46, dz: 22, rot: 4.0, radius: 12 }),
        Object.freeze({ placeId: 'place_habitat_pod_derelict', dx: -38, dz: 55, rot: 2.6, radius: 12 }),
        Object.freeze({ placeId: 'place_cargo_pod_standard_breached', dx: 74, dz: -34, rot: 0.4, radius: 8 }),
        Object.freeze({ placeId: 'place_cargo_pod_standard_breached', dx: -70, dz: -20, rot: 3.5, radius: 8 }),
        Object.freeze({ placeId: 'place_cargo_pod_hazmat', dx: 18, dz: 96, rot: 5.1, radius: 8 }),
        Object.freeze({ placeId: 'place_cargo_pod_hazmat', dx: -18, dz: -96, rot: 2.2, radius: 8 }),
      ]),
    }),
    why: 'Three generations of one family, cold and dark since the first bust; nobody claims them.',
  }),
  Object.freeze({
    id: 'oneoff_great_tanker',
    name: 'Mass of Another Age — a very large derelict bulk tanker',
    placeId: 'place_aftermath_wreck_ore_freighter_bow__derelict',
    sectorId: 'sector_helios_prime',
    anchor: { type: 'station', id: 'station_helios' },
    offsetLocal: Object.freeze({ x: -1500, z: 980 }),
    rot: 0.4,
    spin: 0,
    radius: 60,
    why: 'The bow alone out-masses everything the yard has launched since; she makes everything feel small.',
  }),
  Object.freeze({
    // CR-TEXTURE — one ropeable hulk on the foundry approach at Vesta Forge. A packaged
    // slurry bank stands in for the dropped slag ladle: same industrial-vessel read, no new
    // art. It drifts on the clean side of the approach, clear of the rock fields, the slag
    // glow, the ore winnow, and the dead freighter's pocket.
    id: 'oneoff_runaway_ladle',
    name: 'The Runaway Ladle — a foundry slag ladle that slipped its crane',
    placeId: 'place_slurry_tank',
    sectorId: 'sector_vesta_forge',
    anchor: { type: 'station', id: 'station_forge' },
    offsetLocal: Object.freeze({ x: -720, z: 380 }),
    rot: 1.9,
    spin: 0.1,
    radius: 20,
    // Heavier than the yard tug, so the rope swings it like the poured-steel drum it is.
    physicalBody: Object.freeze({ mass: 240 }),
    why: 'It slipped the crane on a double shift; the foundry logged it as scrap and the crews still steer around it.',
  }),
  Object.freeze({
    // WORLD-13 — one always-there dressing piece at the Tethys customs gate, from a place that
    // already exists. No new GLB and no mission.
    id: 'oneoff_tethys_customs_lamp',
    name: 'The Customs Lamp',
    placeId: 'place_memorial_array',
    sectorId: 'sector_tethys_junction',
    anchor: { type: 'station', id: 'station_customs' },
    offsetLocal: Object.freeze({ x: 90, z: -40 }),
    rot: 0.6,
    spin: 0,
    radius: 16,
    why: 'A memorial array parked off the customs gate, lit so the lane can find the toll.',
  }),
  Object.freeze({
    // 2026-09-28 INFERENCE — the contested floor's own texture. A customs pinnace died holding
    // the Reach dock early in the fighting; whoever holds the dock this week keeps her lit
    // rather than salvage her, because the pylon beside her is the only approach marker every
    // flag agrees on. First frontier one-off: reachable the way the frontier is — a real
    // anchor inside its own sector's radius.
    id: 'oneoff_held_dock_pinnace',
    name: 'The Held Dock — a customs pinnace that died holding it',
    placeId: 'place_aftermath_aft_cockpit_section',
    sectorId: 'sector_io_reach',
    anchor: { type: 'station', id: 'station_reach' },
    offsetLocal: Object.freeze({ x: -620, z: -560 }),
    rot: 2.6,
    spin: 0.18,
    radius: 20,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_customs_pylon', dx: 34, dz: -18, rot: 0.4, radius: 8 }),
        Object.freeze({ placeId: 'place_memorial_array', dx: -26, dz: 30, rot: 1.1, radius: 10 }),
      ]),
    }),
    why: 'She held the dock for the last flag that owned it. Every flag since keeps her lamps burning — the pylon is the only marker both sides obey.',
  }),
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // CV-QUIET - detour texture ON THE LEGS, not at the places. The eight set pieces above are
  // anchored beside stations; the flight BETWEEN jobs was still empty glass and a marker. These
  // four sit in the open transit of the default route - the hop a new pilot flies fifty times, and
  // the three gate runs out of Helios Prime - and they are the four things a detour is worth here:
  // a body, a job already underway, a signal, and a joke the physics tells. Non-systemic on
  // purpose: no mission, no scan gate, no economy hook. Rare enough to stay specific.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  Object.freeze({
    // A BODY - a heavy thing sitting in the middle of the shortest hop in the game. You rope it or
    // you go around it; either way the hop is a place now instead of a line on the glass.
    id: 'oneoff_spare_keg',
    name: 'The Spare Keg — a bulk container set down mid-hop',
    placeId: 'place_ore_bulk_container',
    sectorId: 'sector_helios_prime',
    anchor: { type: 'station', id: 'station_helios' },
    // (1280,-420) + (-240,120) = (1040,-300): 322 WU off the Sanctioned Claim and 268 WU off the
    // Helios berth, which is the hop itself. Slightly out of the direct line, so it is a detour.
    offsetLocal: Object.freeze({ x: -240, z: 120 }),
    rot: 1.3,
    spin: 0.12,
    radius: 12,
    physicalBody: Object.freeze({ mass: 90 }),
    why: 'The yard lends it out and nobody logs the return. Every green pilot has had to go around it once.',
  }),
  Object.freeze({
    // A JOB ALREADY UNDERWAY - a transfer clamped mid-load with the drone half a bead through the
    // seam and the worklight still burning. Nobody is flying it. That is the point: you arrived in
    // the middle of their shift and the shift does not care.
    id: 'oneoff_half_shift',
    name: 'The Half-Shift — a transfer still mid-load, crew gone to dinner',
    placeId: 'place_transfer_arm',
    sectorId: 'sector_helios_prime',
    anchor: { type: 'station', id: 'station_helios' },
    // On the Vesta gate run, the industrial leg where work is the fiction: (770, 900).
    offsetLocal: Object.freeze({ x: -510, z: 1320 }),
    rot: 2.4,
    spin: 0,
    radius: 16,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_ore_bulk_container', dx: 44, dz: -26, rot: 0.7, radius: 10 }),
        Object.freeze({ placeId: 'place_welding_drone', dx: -30, dz: 36, rot: 1.9, radius: 6 }),
        Object.freeze({ placeId: 'place_worklight_tower', dx: 14, dz: 50, rot: 0.2, radius: 8 }),
      ]),
    }),
    why: 'The arm is still clamped, the drone still has half a bead to lay, and the worklight is still on. Whoever ran this shift is coming back.',
  }),
  Object.freeze({
    // A SIGNAL - a transponder that still answers every hail with a registry number nobody owns.
    // The customs service leaves it up because the lane steers by the reply, which is the only
    // reason a lie is still standing on the toll run.
    id: 'oneoff_answering_buoy',
    name: 'The Answering Buoy — a transponder replying for a hull that broke up years ago',
    placeId: 'place_transponder_gate',
    sectorId: 'sector_helios_prime',
    anchor: { type: 'station', id: 'station_helios' },
    // On the Tethys gate run, the toll leg where a signal is the fiction: (1890, 690).
    offsetLocal: Object.freeze({ x: 610, z: 1110 }),
    rot: 0.9,
    spin: 0.08,
    radius: 18,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_nav_buoy', dx: -40, dz: 22, rot: 1.4, radius: 8 }),
      ]),
    }),
    why: 'It answers every hail with a registry number nobody owns. The lane still steers by the reply, so nobody takes it down.',
  }),
  Object.freeze({
    // A JOKE THE PHYSICS TELLS - a mixed load spilled a decade ago that sorted itself by weight.
    // Heavy pods clumped, light ones strung out down the lane. No system did that; the universe
    // did, and it is funnier than anything a script would have written.
    id: 'oneoff_the_settling',
    name: 'The Settling — a spilled load that filed itself by weight',
    placeId: 'place_cargo_pod_standard',
    sectorId: 'sector_helios_prime',
    anchor: { type: 'station', id: 'station_helios' },
    // On the Ceres gate run, out past the derelict tanker so the two detours read apart: (-920, 780).
    offsetLocal: Object.freeze({ x: -2200, z: 1200 }),
    rot: 0.3,
    spin: 0.05,
    radius: 10,
    cluster: Object.freeze({
      // Heavy at the head of the clump, light strung out behind: spacing widens with distance.
      props: Object.freeze([
        Object.freeze({ placeId: 'place_ore_bulk_container', dx: 26, dz: 14, rot: 1.1, radius: 10 }),
        Object.freeze({ placeId: 'place_cargo_pod_standard_breached', dx: 74, dz: -30, rot: 2.2, radius: 8 }),
        Object.freeze({ placeId: 'place_cargo_pod_hazmat', dx: 148, dz: 52, rot: 0.5, radius: 7 }),
      ]),
    }),
    why: 'He dumped a mixed load here a decade ago. The heavy pods clumped, the light ones strung out down the lane, and physics never mentioned it to anyone.',
  }),
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // CR-TEXTURE-1 — per-sector coverage. Every named sector gets one reachable one-off on the same
  // substrate as the starter set: a real anchor, real packaged props, no mission, no scan gate.
  // Each carries an authored bar lead at one of its own sector's stations (AUTHORED_DOCK_RUMORS in
  // frontierRumors.js), so a stranger can dock, ask for rumors, and fly to it — Charon rides the
  // existing Expanse lead. Six carry a physicalBody where the rope is the joke: the evidence, the
  // shelf, the pour, the choir pod, the held note, and the disputed keg can all be moved by the
  // Massline.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  Object.freeze({
    // Pallas Drift — the cleaner's haul-out: a stripped bow being walked into the fog so no scan
    // ever finds the deal. Ropeable: you can pull the evidence back out of the nebula rim.
    id: 'oneoff_the_erased',
    name: 'The Erased — a hull being dragged into the fog',
    placeId: 'place_aftermath_wreck_ore_freighter_bow__stripped',
    sectorId: 'sector_pallas_drift',
    anchor: { type: 'station', id: 'station_smuggler' },
    // station_smuggler (-1080, 540) + this = (-380, 560): on the west rim of the nebula at
    // (400, 600, r800), where the cleaner's work is aimed.
    offsetLocal: Object.freeze({ x: 700, z: 20 }),
    rot: 3.4,
    spin: 0.06,
    radius: 26,
    physicalBody: Object.freeze({ mass: 260 }),
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_salvage_clamp', dx: -42, dz: 18, rot: 1.1, radius: 8 }),
        Object.freeze({ placeId: 'place_conveyor_truss', dx: -70, dz: -30, rot: 2.9, radius: 10 }),
        Object.freeze({ placeId: 'place_worklight_tower', dx: -52, dz: 44, rot: 0.5, radius: 8 }),
      ]),
    }),
    why: 'Someone paid the Den to lose a hull; the clamp crew walks her into the fog a length a day.',
  }),
  Object.freeze({
    // Charon Expanse — the hunters' tally: a post on the radiation lane where every paid writ
    // hangs a hull plate. Reachability rides the existing Expanse bar lead (extended).
    id: 'oneoff_tag_post',
    name: "The Tag Post — a hunter's tally on the radiation lane",
    placeId: 'place_tally_post',
    sectorId: 'sector_charon_expanse',
    anchor: { type: 'station', id: 'station_expanse' },
    // station_expanse (880, -640) + this = (380, -1140): beside the Lung marker (480, -1100),
    // on the radiation lane where every hunter passes.
    offsetLocal: Object.freeze({ x: -500, z: -500 }),
    rot: 0.9,
    spin: 0,
    radius: 14,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_aftermath_frag_grating_sheet', dx: 30, dz: -14, rot: 2.2, radius: 6 }),
        Object.freeze({ placeId: 'place_aftermath_frag_plate_curl', dx: -24, dz: 20, rot: 4.1, radius: 6 }),
        Object.freeze({ placeId: 'place_aftermath_frag_strut_shard', dx: 12, dz: 38, rot: 1.6, radius: 5 }),
        Object.freeze({ placeId: 'place_worklight_tower', dx: -36, dz: -30, rot: 0.3, radius: 8 }),
      ]),
    }),
    why: 'Every plate is a paid writ. The hunters hang them where the lane can count.',
  }),
  Object.freeze({
    // Sker Haven — the Reach keeps its seizures where everyone can see them. The shelf itself is
    // ropeable: steal back everything at once, if you have the nerve.
    id: 'oneoff_impound_shelf',
    name: 'The Impound Shelf — everything the Reach ever seized, welded to a rack',
    placeId: 'place_scrap_cage',
    sectorId: 'sector_sker_haven',
    anchor: { type: 'station', id: 'station_sker' },
    // station_sker (-540, 680) + this = (60, 260): between the two asteroid hazards, on the
    // approach everyone flies to the bazaar.
    offsetLocal: Object.freeze({ x: 600, z: -420 }),
    rot: 1.7,
    spin: 0.05,
    radius: 18,
    physicalBody: Object.freeze({ mass: 150 }),
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_container_rack_abandoned', dx: 48, dz: 12, rot: 0.6, radius: 12 }),
        Object.freeze({ placeId: 'place_cargo_pod_hazmat', dx: -30, dz: 40, rot: 2.8, radius: 8 }),
        Object.freeze({ placeId: 'place_customs_pylon', dx: 20, dz: -46, rot: 5.0, radius: 8 }),
      ]),
    }),
    why: 'Seized pods, a cargo rack, and one customs pylon nobody admits to taking. Sorted by insult.',
  }),
  Object.freeze({
    // Veil Nebula — a shrine welded to a machine, per the spec's own example: the researchers
    // welded the memorial to a comms mast so the storm surge rings it like a bell.
    id: 'oneoff_surge_shrine',
    name: 'The Surge Shrine — a memorial welded to a comms mast that rings in the storm',
    placeId: 'place_comms_array',
    sectorId: 'sector_veil_nebula',
    anchor: { type: 'station', id: 'station_veil' },
    // station_veil (420, -1120) + this = (-240, -720): inside the fog's north-west reaches,
    // off the approach to the storm lane.
    offsetLocal: Object.freeze({ x: -660, z: 400 }),
    rot: 2.4,
    spin: 0.15,
    radius: 16,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_memorial_array', dx: -34, dz: 22, rot: 1.0, radius: 10 }),
        Object.freeze({ placeId: 'place_observation_blister', dx: 28, dz: -40, rot: 5.5, radius: 8 }),
      ]),
    }),
    why: 'The researchers welded the memorial to the mast so the surge could ring it. It rings.',
  }),
  Object.freeze({
    // Ashfall Reach — Kurtz's "eleven years counting the same mass" gets its mass: a dead liner
    // so large the locals navigate by her shadow. Too big to rope; the point is the scale.
    id: 'oneoff_the_ledger',
    name: 'The Ledger — a dead liner the Reach counts mass by',
    placeId: 'place_aftermath_wreck_liner_drum__derelict',
    sectorId: 'sector_ashfall_reach',
    anchor: { type: 'station', id: 'station_ashcache' },
    // station_ashcache (-820, 480) + this = (300, 300): on the debris floor west of the cache.
    offsetLocal: Object.freeze({ x: 1120, z: -180 }),
    rot: 1.1,
    spin: 0.02,
    radius: 60,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_aftermath_wreck_liner_bow', dx: 140, dz: -60, rot: 2.8, radius: 52 }),
        Object.freeze({ placeId: 'place_aftermath_wreck_liner_boatbay', dx: -120, dz: 80, rot: 0.9, radius: 30 }),
      ]),
    }),
    why: 'Eleven years and nothing out here has moved but her shadow. Kurtz checks anyway.',
  }),
  Object.freeze({
    // Nyx March — a gate that never worked, made holy anyway.
    id: 'oneoff_false_gate',
    name: 'The False Gate — a jump ring that never spun, welded into a memorial',
    placeId: 'place_gate_jump_ring',
    sectorId: 'sector_nyx_march',
    anchor: { type: 'station', id: 'station_nyx_march' },
    // station_nyx_march (-880, 540) + this = (-200, -240): open march floor, off the nebula rim.
    offsetLocal: Object.freeze({ x: 680, z: -780 }),
    rot: 0.5,
    spin: 0,
    radius: 24,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_memorial_array', dx: -40, dz: 30, rot: 1.8, radius: 10 }),
        Object.freeze({ placeId: 'place_lane_pin', dx: 52, dz: -18, rot: 0.2, radius: 6 }),
      ]),
    }),
    why: 'The ring never took a ship anywhere; the crews made it a shrine anyway. Fuel pellets still show up on the rim.',
  }),
  Object.freeze({
    // Hyperion Cut — the machine died in the middle of its own sentence.
    id: 'oneoff_half_cut',
    name: 'The Half-Cut — a drill platform that died mid-bite',
    placeId: 'place_drill_platform_cold',
    sectorId: 'sector_hyperion_cut',
    anchor: { type: 'station', id: 'station_hyperion_cut' },
    // station_hyperion_cut (-640, 480) + this = (-60, 60): mid-sector, away from the driller poi.
    offsetLocal: Object.freeze({ x: 580, z: -420 }),
    rot: 2.9,
    spin: 0,
    radius: 22,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_asteroid_seamed', dx: 36, dz: -20, rot: 1.3, radius: 14 }),
        Object.freeze({ placeId: 'place_crusher_module', dx: -44, dz: 26, rot: 4.0, radius: 12 }),
        Object.freeze({ placeId: 'place_extraction_mast', dx: 60, dz: 34, rot: 0.7, radius: 10 }),
      ]),
    }),
    why: 'The bite is still in the rock. The crew left mid-shift and the rock kept the tools.',
  }),
  Object.freeze({
    // Kepler Scar — the survivor of a battle nobody remembers: one standing mast inside a ring
    // of corvette wreckage, out on the irradiated floor.
    id: 'oneoff_unbroken',
    name: 'The Unbroken — a mast still standing inside a ring of dead corvettes',
    placeId: 'place_pirate_sensor_mast',
    sectorId: 'sector_kepler_scar',
    anchor: { type: 'station', id: 'station_kepler_scar' },
    // station_kepler_scar (-520, 720) + this = (120, -180): beside the radiation hazard floor.
    offsetLocal: Object.freeze({ x: 640, z: -900 }),
    rot: 0.2,
    spin: 0.04,
    radius: 14,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_aftermath_wreck_corvette_turret', dx: 88, dz: -30, rot: 2.1, radius: 14 }),
        Object.freeze({ placeId: 'place_aftermath_deb_corvette_armor_belt', dx: -96, dz: 44, rot: 5.2, radius: 16 }),
        Object.freeze({ placeId: 'place_aftermath_frag_rib_cluster', dx: 20, dz: 110, rot: 1.9, radius: 10 }),
        Object.freeze({ placeId: 'place_aftermath_wreck_corvette_engine', dx: -60, dz: -120, rot: 3.7, radius: 14 }),
      ]),
    }),
    why: 'Whatever the battle was about, the mast won. The ring is what it cost everyone else.',
  }),
  Object.freeze({
    // Orcus Shadow — a ring nobody made: debris pinned in a slow tide around the anomaly.
    id: 'oneoff_the_tide',
    name: 'The Tide — debris pinned in a slow ring around the shadow',
    placeId: 'place_transponder_gate',
    sectorId: 'sector_orcus_shadow',
    anchor: { type: 'station', id: 'station_orcus_shadow' },
    // station_orcus_shadow (420, -960) + this = (-140, -380): on the anomaly's rim.
    offsetLocal: Object.freeze({ x: -560, z: 580 }),
    rot: 1.4,
    spin: 0.05,
    radius: 16,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_aftermath_frag_pipe_tangle', dx: 120, dz: 40, rot: 0.8, radius: 8 }),
        Object.freeze({ placeId: 'place_aftermath_frag_grating_sheet', dx: 200, dz: -60, rot: 2.5, radius: 8 }),
        Object.freeze({ placeId: 'place_aftermath_deb_corvette_barbette_ring', dx: -160, dz: 80, rot: 4.4, radius: 12 }),
      ]),
    }),
    why: 'Nobody put the ring there. The shadow did. The gate marks where to watch it turn.',
  }),
  Object.freeze({
    // Rhea Cinder — a spill that stopped being a spill: the pour froze mid-air, and the
    // downhill trail is still sitting there. The tank is ropeable and heavier than it looks.
    id: 'oneoff_the_pour',
    name: 'The Pour — a slag stream frozen mid-air',
    placeId: 'place_slurry_tank',
    sectorId: 'sector_rhea_cinder',
    anchor: { type: 'station', id: 'station_rhea_cinder' },
    // station_rhea_cinder (-640, 520) + this = (240, 120): north-east of the cinder line.
    offsetLocal: Object.freeze({ x: 880, z: -400 }),
    rot: 2.7,
    spin: 0.08,
    radius: 18,
    physicalBody: Object.freeze({ mass: 240 }),
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_ore_bulk_container', dx: 70, dz: 80, rot: 1.5, radius: 10 }),
        Object.freeze({ placeId: 'place_ore_bulk_container', dx: 130, dz: 120, rot: 0.9, radius: 10 }),
        Object.freeze({ placeId: 'place_aftermath_frag_strut_shard', dx: 30, dz: 150, rot: 3.0, radius: 6 }),
      ]),
    }),
    why: 'The tank tipped on the pour and the pour just stopped. The spill trails downhill forever.',
  }),
  Object.freeze({
    // Haumea Rift — the shift left mid-bite and the fissure kept the tools.
    id: 'oneoff_seam_light',
    name: 'The Seam-Light — a worklight still burning on the fissure lip',
    placeId: 'place_worklight_tower',
    sectorId: 'sector_haumea_rift',
    anchor: { type: 'station', id: 'station_haumea_rift' },
    // station_haumea_rift (420, -780) + this = (-140, 300): on the fissure lip (poi at 0, 180).
    offsetLocal: Object.freeze({ x: -560, z: 1080 }),
    rot: 0.4,
    spin: 0,
    radius: 10,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_extraction_mast', dx: 24, dz: -18, rot: 2.2, radius: 10 }),
        Object.freeze({ placeId: 'place_asteroid_seamed', dx: -30, dz: 20, rot: 4.6, radius: 14 }),
        Object.freeze({ placeId: 'place_power_skid_patched', dx: 52, dz: 16, rot: 1.1, radius: 8 }),
      ]),
    }),
    why: 'The shift left mid-bite. The fissure kept the drill, the mast, and the light bill.',
  }),
  Object.freeze({
    // Eris Margin — laundry for crews that never came home: dead habs strung on an old tether
    // line inside the west fog. The last pod on the line is ropeable.
    id: 'oneoff_drift_choir',
    name: 'The Drift Choir — dead habs strung on a tether line',
    placeId: 'place_habitat_pod_derelict',
    sectorId: 'sector_eris_margin',
    anchor: { type: 'station', id: 'station_eris_margin' },
    // station_eris_margin (-820, 360) + this = (200, 320): at the nebula's west rim.
    offsetLocal: Object.freeze({ x: 1020, z: -40 }),
    rot: 1.9,
    spin: 0.07,
    radius: 14,
    physicalBody: Object.freeze({ mass: 55 }),
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_aftermath_frag_cable_bundle', dx: 32, dz: 2, rot: 0.2, radius: 6 }),
        Object.freeze({ placeId: 'place_habitat_pod_derelict', dx: 64, dz: 8, rot: 2.9, radius: 12 }),
        Object.freeze({ placeId: 'place_aftermath_frag_cable_bundle', dx: 98, dz: -2, rot: 0.7, radius: 6 }),
        Object.freeze({ placeId: 'place_habitat_pod_derelict', dx: 130, dz: -6, rot: 4.4, radius: 12 }),
        Object.freeze({ placeId: 'place_aftermath_frag_cable_bundle', dx: 166, dz: 3, rot: 1.2, radius: 6 }),
        Object.freeze({ placeId: 'place_habitat_pod_derelict', dx: 198, dz: 10, rot: 1.5, radius: 12 }),
      ]),
    }),
    why: 'Three pods on one line, strung like laundry. The line is older than the writs; nobody reels it in.',
  }),
  Object.freeze({
    // Phoebe Echo — the sector is named for a return; this array never got the memo that the
    // channel is dead.
    id: 'oneoff_the_answer',
    name: 'The Answer — a comms array still talking to nobody',
    placeId: 'place_comms_array',
    sectorId: 'sector_phoebe_echo',
    anchor: { type: 'station', id: 'station_phoebe_echo' },
    // station_phoebe_echo (280, -960) + this = (-300, -300): open floor south-west of the station.
    offsetLocal: Object.freeze({ x: -580, z: 660 }),
    rot: 2.0,
    spin: 0.1,
    radius: 16,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_nav_buoy', dx: 44, dz: -20, rot: 0.9, radius: 8 }),
        Object.freeze({ placeId: 'place_transponder_gate', dx: -36, dz: 44, rot: 3.3, radius: 14 }),
      ]),
    }),
    why: 'She repeats her last transmission on a channel the network retired. The buoy answers anyway.',
  }),
  Object.freeze({
    // Nereid Shoal — a handshake that never landed: the coupling is still out, mid-dock.
    id: 'oneoff_open_hand',
    name: 'The Open Hand — a tanker coupling mid-dock with nobody',
    placeId: 'place_tanker_coupling',
    sectorId: 'sector_nereid_shoal',
    anchor: { type: 'station', id: 'station_nereid' },
    // station_nereid (960, -380) + this = (1340, 60): east of the market, off the wreck approach.
    offsetLocal: Object.freeze({ x: 380, z: 440 }),
    rot: 1.2,
    spin: 0,
    radius: 16,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_freight_platform', dx: -50, dz: 30, rot: 2.7, radius: 14 }),
        Object.freeze({ placeId: 'place_hull_rack', dx: 40, dz: -50, rot: 0.4, radius: 12 }),
        Object.freeze({ placeId: 'place_lane_pin', dx: -16, dz: 66, rot: 1.0, radius: 6 }),
      ]),
    }),
    why: 'The handshake is still out. The tanker that was supposed to take it broke up a decade ago.',
  }),
  Object.freeze({
    // Proteus Well — hiding in the obvious place: a stash rack parked inside a dead boatbay's
    // shadow, visible from the approach if you look twice.
    id: 'oneoff_double_take',
    name: "The Double Take — a stash rack parked in a dead boatbay's shadow",
    placeId: 'place_container_rack_abandoned',
    sectorId: 'sector_proteus_well',
    anchor: { type: 'station', id: 'station_proteus' },
    // station_proteus (-640, 520) + this = (40, 820): south-east, clear of the fog rim.
    offsetLocal: Object.freeze({ x: 680, z: 300 }),
    rot: 0.8,
    spin: 0,
    radius: 12,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_aftermath_wreck_liner_boatbay', dx: 60, dz: -20, rot: 2.0, radius: 30 }),
        Object.freeze({ placeId: 'place_ore_bulk_container', dx: -28, dz: 18, rot: 1.4, radius: 10 }),
        Object.freeze({ placeId: 'place_cold_locker', dx: 18, dz: 42, rot: 3.9, radius: 8 }),
      ]),
    }),
    why: "First crew through hid the stash in the hulk's shadow. Second crew found it. The name is the whole story.",
  }),
  Object.freeze({
    // Triton Wake — the watcher gets offerings: pods and tally plates left at the anomaly's rim.
    id: 'oneoff_watchers_tithe',
    name: "The Watcher's Tithe — offerings left at the anomaly's rim",
    placeId: 'place_memorial_array',
    sectorId: 'sector_triton_wake',
    anchor: { type: 'station', id: 'station_triton' },
    // station_triton (480, -980) + this = (-160, 340): on the anomaly's south rim.
    offsetLocal: Object.freeze({ x: -640, z: 1320 }),
    rot: 0.7,
    spin: 0.03,
    radius: 12,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_tally_post', dx: 36, dz: -24, rot: 2.4, radius: 8 }),
        Object.freeze({ placeId: 'place_cargo_pod_standard', dx: -28, dz: 30, rot: 1.2, radius: 8 }),
        Object.freeze({ placeId: 'place_cargo_pod_standard_breached', dx: -60, dz: -8, rot: 4.8, radius: 8 }),
        Object.freeze({ placeId: 'place_whistle', dx: 14, dz: 44, rot: 0.6, radius: 6 }),
      ]),
    }),
    why: 'Pilots leave pods and plates for the watcher. Take one if you like. Nobody does.',
  }),
  Object.freeze({
    // Eunomia Gulf — a delivery that outlived its recipient. The container itself is the body:
    // ropeable, so a pilot can finally carry the note home if she wants the closure.
    id: 'oneoff_held_note',
    name: 'The Held Note — a container addressed to a dead crew',
    placeId: 'place_ore_bulk_container',
    sectorId: 'sector_eunomia_gulf',
    anchor: { type: 'station', id: 'station_eunomia' },
    // station_eunomia (640, -420) + this = (-760, 320): beside the old ledger poi (-920, 480).
    offsetLocal: Object.freeze({ x: -1400, z: 740 }),
    rot: 1.6,
    spin: 0.05,
    radius: 10,
    physicalBody: Object.freeze({ mass: 90 }),
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_freight_platform', dx: -30, dz: 14, rot: 0.3, radius: 18 }),
        Object.freeze({ placeId: 'place_lane_pin', dx: -44, dz: 20, rot: 1.9, radius: 6 }),
        Object.freeze({ placeId: 'place_claim_mark', dx: 52, dz: 36, rot: 2.6, radius: 6 }),
      ]),
    }),
    why: 'Delivered, signed-for, never collected. The recipient died two contracts ago; the note stays pinned.',
  }),
  Object.freeze({
    // Sedna Dark — a survey marker for a route the dark never let anyone finish.
    id: 'oneoff_the_pin',
    name: 'The Pin — a lane marker pointing at a route that was never finished',
    placeId: 'place_lane_pin',
    sectorId: 'sector_sedna_dark',
    anchor: { type: 'station', id: 'station_sedna' },
    // station_sedna (-480, 620) + this = (700, -480): out near the cadence signal (860, -640).
    offsetLocal: Object.freeze({ x: 1180, z: -1100 }),
    rot: 3.1,
    spin: 0.06,
    radius: 8,
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_ash_pin', dx: 40, dz: -20, rot: 1.7, radius: 6 }),
        Object.freeze({ placeId: 'place_transponder_gate', dx: -34, dz: 30, rot: 0.9, radius: 14 }),
      ]),
    }),
    why: 'Somebody surveyed a lane the dark never let anyone fly. The pin still points the way.',
  }),
  Object.freeze({
    // Dione Lane — the charted straggler: a bulk container tagged by the customs crew AND the
    // lane crew, with two liens and no manifest. Ropeable, which is more than either crew will do.
    id: 'oneoff_the_dispute',
    name: 'The Dispute — a bulk container impounded by both crews at once',
    placeId: 'place_ore_bulk_container',
    sectorId: 'sector_dione_lane',
    anchor: { type: 'station', id: 'station_dione' },
    // station_dione (920, 280) + this = (170, -350): mid-lane between the market and the customs
    // gate, where both crews' claims overlap.
    offsetLocal: Object.freeze({ x: -750, z: -630 }),
    rot: 0.9,
    spin: 0.11,
    radius: 12,
    physicalBody: Object.freeze({ mass: 90 }),
    cluster: Object.freeze({
      props: Object.freeze([
        Object.freeze({ placeId: 'place_claim_mark', dx: 26, dz: 14, rot: 0.8, radius: 6 }),
        Object.freeze({ placeId: 'place_claim_mark', dx: -22, dz: -18, rot: 2.3, radius: 6 }),
        Object.freeze({ placeId: 'place_traffic_signal', dx: 40, dz: -30, rot: 1.5, radius: 8 }),
        Object.freeze({ placeId: 'place_lane_pin', dx: -38, dz: 28, rot: 3.7, radius: 6 }),
      ]),
    }),
    why: 'The customs crew tagged it, the lane crew tagged it back, and both claim the tow. Two liens, no manifest.',
  }),
]);

// One ropeable cache beside a named Helios landmark. Not one of the six texture props:
// those stay non-colliding dressing. This record is a jettisoned cargo pod the beam
// already knows how to split, parked 120 WU east of The Candle Fleet (latch is 390).
export const HELIOS_ROPE_CACHE = Object.freeze({
  id: 'oneoff_helios_candle_cache',
  name: 'Candle Fleet sample pod',
  placeId: 'place_cargo_pod_standard',
  sectorId: 'sector_helios_prime',
  landmarkPoiId: 'poi_memorial',
  anchor: Object.freeze({ type: 'station', id: 'station_helios' }),
  // station_helios (1280, -420) + this offset = (1800, -820), 120 WU east of
  // poi_memorial The Candle Fleet at (1680, -820).
  offsetLocal: Object.freeze({ x: 520, z: -400 }),
  commodityId: 'cmdty_ore_iron',
  amount: 1,
  radius: 8,
});

// The courier one-off ("a courier far too fast") is not a prop: it is a named lane contact
// flying the `express` traffic role — see lane_cinder_run_courier in src/data/laneContacts.js,
// whose live motion really is far too fast for her hull. Kept beside the other contacts so
// traffic.js owns one contacts registry; this file owns the placed set pieces.
