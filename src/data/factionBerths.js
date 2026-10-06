// CR-BERTH-1 — faction berths: an address and a memory (build_map.md §23.2 CR-BERTH).
//
// A berth is a place a faction works that survives between visits. The crib — the rented
// apron's furniture — is always on the pad; the consigned hulk only stands on the strip-line
// once the desk receipt exists. The receipt is written by factionPresence.js off the existing
// `service:completed` event: a `redeem_rights` payout at the berth's station is the yard desk
// buying the player's claim on a wreck already in the yards' books. On the next sector
// materialize world.js `_spawnFactionBerths` parks the hulk on the line — a real ropeable body
// (masslineTetherable), so stealing back the wreck you sold is a physical choice, not a flag.
//
// Positions are sector-local against the sector's own station anchor row, converted to
// galactic-global once at spawn (the same conversion `_spawnStations`, `_spawnPOIs`,
// `_spawnHeliosRopeCache` and `_spawnKettleLinePayoff` use). Crib `dx/dz` and the hulk's `dx/dz`
// are relative to `offsetLocal` — the apron's centre.
//
// Determinism: authored positions, no RNG, no wall time. The hulk's worldRecord identityKey is
// seed-stable, so the same body returns across sector residency until a player terminal outcome
// (destroyed/captured) tombstones the record.

export const FACTION_BERTH_SCHEMA_VERSION = 1;

export const FACTION_BERTHS = Object.freeze([
  Object.freeze({
    id: 'berth_pitborn_consign_line',
    name: 'The Consignment Line',
    factionId: 'faction_pitborn',
    sectorId: 'sector_vesta_forge',
    stationId: 'station_forge',
    anchor: Object.freeze({ type: 'station', id: 'station_forge' }),
    // station_forge (-480, 720) + this = (-60, 380): the breaking-apron south-east of the
    // foundry, off the Helios-gate inbound leg where towed hulks arrive. Verified clearances
    // (sector-local WU, apron centre unless noted): 540 off the foundry berth, 767 off the
    // outlying yard, ~1348 off the Runaway Ladle (-1200, 1100), ~1414 off the shear jaws at
    // (250, -1000) — far outside its 130 hazard radius — ~985 off the f_vesta_1 radiation
    // floor, 229 off the f_vesta_2 slag rim and 217 off the f_vesta_3 crystal rim measured to
    // the nearest piece, outside the storm-lane sheet extent, and ~732 off the Resonant
    // Cathedral's 170 dressing exclusion. Inside the sector's 4300 radius.
    offsetLocal: Object.freeze({ x: 420, z: -340 }),
    // The keyed receipt: factionPresence writes serviceReceipts[receiptKey] on each
    // redeem_rights payout at stationId. The strip-line reads it as the gate for the hulk.
    receiptKey: 'berthConsign:berth_pitborn_consign_line',
    // The rented apron itself: the strip-line furniture stands whether or not a hull is parked.
    // A truss pair is the line the hulks ride, the cage is the sorted catch at the line's end,
    // the rack holds cut plate, and two worklight towers keep the cut lit around the clock.
    // Radii match OCCUPATIONAL_PLACE_RADIUS / the kit table for the same bodies.
    crib: Object.freeze([
      Object.freeze({ placeId: 'place_conveyor_truss', dx: -40, dz: 0, rot: 0, radius: 20 }),
      Object.freeze({ placeId: 'place_conveyor_truss', dx: 44, dz: 0, rot: 0, radius: 20 }),
      Object.freeze({ placeId: 'place_scrap_cage', dx: 96, dz: 26, rot: 0.7, radius: 16 }),
      Object.freeze({ placeId: 'place_hull_rack', dx: -16, dz: -46, rot: 1.9, radius: 16 }),
      Object.freeze({ placeId: 'place_worklight_tower', dx: 10, dz: -30, rot: 0.2, radius: 12 }),
      Object.freeze({ placeId: 'place_worklight_tower', dx: 70, dz: 34, rot: 2.8, radius: 12 }),
    ]),
    // The wreck your claim paid out on, parked on the line's intake end being cut. An ore
    // hopper section: heavy enough that hauling her back off the line is a real tow, light
    // enough that the Massline can try.
    hulk: Object.freeze({
      placeId: 'place_aftermath_wreck_ore_freighter_hopper',
      name: 'Consigned Hulk — the wreck your claim rights paid out on',
      dx: -96, dz: 8,
      rot: 2.6,
      radius: 26,
      mass: 280,
      wreckClass: 'consigned_hulk',
    }),
    why: 'The Pitborn rent the strip-line off the foundry: a sold claim parks here as a hull under the cutters.',
  }),
  Object.freeze({
    // CR-BERTH-2 — the second berth, a different memory: the Pitborn cut what you sell, the
    // Understory feed it to the growth. The wreck-buyer desk at Expanse Refinery appraises a
    // hull the loss ledger can prove; the appraisal is the feed order and the slip grows a
    // fresh body around it. Crib is the organic kit, not industrial furniture — a digested
    // hull's calcified collar already stands there, so the empty slip still reads what it is.
    id: 'berth_understory_afterwake_slip',
    name: 'The Afterwake Slip',
    factionId: 'faction_understory',
    sectorId: 'sector_charon_expanse',
    stationId: 'station_expanse',
    anchor: Object.freeze({ type: 'station', id: 'station_expanse' }),
    // station_expanse (880, -640) + this = (580, -940): a quiet pad south-west of the refinery
    // hull, inside the same authored radiation disc the station sits in — the deep-belt intake
    // was built in that weather and the Understory feed their hulls in its shadow. Verified
    // clearances (sector-local WU, apron centre unless noted): 424 off the refinery hull,
    // ~150 off the Lung Marker beacon (480, -1100) at the nearest crib piece, 854 off the
    // f_charon_2 field rim (1120, 280, r480), >1200 off f_charon_1/f_charon_3 rims, outside the
    // dense_asteroid disc at (-600, 500) r650, >2900 off all three gates, ~1211 off the Cinder
    // Nursery site and >1900 off every hull-garden / lattice anomaly. Inside the 4800 radius.
    offsetLocal: Object.freeze({ x: -300, z: -300 }),
    // The keyed receipt: the wreck-buyer desk writes serviceReceipts[receiptKey] when an
    // appraisal names a hull the ledger proves (factionPresence._onServiceAction,
    // understory_wreck_buy branch — a fed appraisal is also a feed order). An empty-ledger
    // appraisal buys nothing physical; the slip reads the row's existence, not its count.
    receiptKey: 'berthFeed:berth_understory_afterwake_slip',
    // The rented slip: a tendril cradle the fed hull lies in, the cyst colony working under it,
    // a membrane sheet keeping the growth to the pad, and the pieces that prove the process —
    // a calcified collar from a hull long finished and the memory knot the slip kept. All are
    // alien_growth_* modules (procedural organic kit, no GLB — partsLibrary's place branch
    // admits them by prefix); radii match the industrial crib's scale.
    crib: Object.freeze([
      Object.freeze({ placeId: 'alien_growth_tendril_cluster', dx: -45, dz: -20, rot: 0.4, radius: 20 }),
      Object.freeze({ placeId: 'alien_growth_tendril_cluster', dx: 50, dz: -28, rot: 2.9, radius: 20 }),
      Object.freeze({ placeId: 'alien_growth_cyst_cluster', dx: -10, dz: -60, rot: 0, radius: 16 }),
      Object.freeze({ placeId: 'alien_growth_filament_sheet', dx: 25, dz: 50, rot: 1.1, radius: 22 }),
      Object.freeze({ placeId: 'alien_growth_calcified_collar', dx: -110, dz: -10, rot: 2.2, radius: 18 }),
      Object.freeze({ placeId: 'alien_growth_memory_knot', dx: 85, dz: 35, rot: 0, radius: 14 }),
    ]),
    // The hull the appraisal fed, laid into the cradle arms mid-digest. Aft engine section —
    // heavy enough that hauling it back off the slip is a real tow, and it scans as a fresh
    // wreck because that is exactly what it was.
    hulk: Object.freeze({
      placeId: 'place_aftermath_aft_engine_section',
      name: 'Fed Hull — the wreck the wreck-buyer sent to the slip',
      dx: 5, dz: -25,
      rot: 1.2,
      radius: 30,
      mass: 320,
      wreckClass: 'fresh',
    }),
    why: 'The Understory keep the slip off the refinery: an appraised hull is laid into the growth, and the slip keeps what the wreck remembers.',
  }),
]);

const BERTH_BY_STATION = new Map(FACTION_BERTHS.map((berth) => [berth.stationId, berth]));
const BERTH_BY_ID = new Map(FACTION_BERTHS.map((berth) => [berth.id, berth]));

export function factionBerthForStation(stationId) {
  return BERTH_BY_STATION.get(String(stationId || '')) || null;
}

export function factionBerthById(berthId) {
  return BERTH_BY_ID.get(String(berthId || '')) || null;
}
