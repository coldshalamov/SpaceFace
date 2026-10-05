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
    // (sector-local WU): 540 off the foundry berth, 727 off the outlying yard, ~1260 off the
    // Runaway Ladle (-1200, 1100), ~1370 off the shear jaws at (250, -1000) — far outside its
    // 130 hazard radius — 1057 off the f_vesta_1 radiation floor, 229 off the f_vesta_2 slag
    // rim, 217 off the f_vesta_3 crystal rim, outside the storm-lane sheet extent, and 749 off
    // the Resonant Cathedral's 170 dressing exclusion. Inside the sector's 4300 radius.
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
]);

const BERTH_BY_STATION = new Map(FACTION_BERTHS.map((berth) => [berth.stationId, berth]));
const BERTH_BY_ID = new Map(FACTION_BERTHS.map((berth) => [berth.id, berth]));

export function factionBerthForStation(stationId) {
  return BERTH_BY_STATION.get(String(stationId || '')) || null;
}

export function factionBerthById(berthId) {
  return BERTH_BY_ID.get(String(berthId || '')) || null;
}
