// PQ-143.02 — six texture one-offs (design/program/roadmap/active/PQ-143.md, leaf .02).
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
// Reachability: every anchor is on the default route — Helios Prime (the start) and Ceres Belt
// (the first hop). PlaceIds reference existing packaged props only (verified by
// test/world-one-offs.test.mjs against the packaged GLBs); no new art, no owner call.

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
]);

// The courier one-off ("a courier far too fast") is not a prop: it is a named lane contact
// flying the `express` traffic role — see lane_cinder_run_courier in src/data/laneContacts.js,
// whose live motion really is far too fast for her hull. Kept beside the other contacts so
// traffic.js owns one contacts registry; this file owns the placed set pieces.
