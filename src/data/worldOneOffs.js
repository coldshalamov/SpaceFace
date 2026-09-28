// PQ-143.02 — texture one-offs (design/program/roadmap/active/PQ-143.md, leaf .02): the six
// original set pieces plus the CR-TEXTURE runaway ladle at Vesta Forge.
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
