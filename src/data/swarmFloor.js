// A01-04/A01-05 — the Foundry floor's buyable pads (arena helios_core, Lane 2).
//
// 12_SWARM_THE_PIT: the player spends mid-round BY FLYING THROUGH things in the room — kills
// pay Scrap, and the floor carries the places that spend it while the fight is still on. Every
// purchasable object is lit, priced readably from across the room, and marked on the radar.
//
// 15_ARENA_FLOORS §1 (Ricochet Foundry):
//   * PULSE LASER by the south gate        — 500
//   * CONCUSSION CANNON in the northeast corner between the bank plates — 500
//   * THE CRATE, a movable pad that sells a random compatible gun — 950; after three pulls it
//     lifts off and settles at one of three authored spots, never the same one twice in a row.
//   * THE FORGE on the north wall behind the furnace — 5000: upgrades the gun you hold,
//     once per gun per run.
//   * Two TAPS mid-floor, west and east — run-long modifiers at stepping prices; the pair
//     shares one four-purchase till for the run. Casting Hall and Scrap Yard taps are
//     deferred until those doors exist.
//
// Coordinates are offsets from the room anchor (`at` in the install frame — the arena follows
// the player, so an offset is the same spot in the room no matter where the fight re-anchors).
// Bearings follow GATE_BEARINGS in waveMaterialization.js: +z is south (rear), +x/−z is NE.
// The fight ring is SWARM_DEBRIS_FIGHT_RADIUS ≈ 400; ~310 puts a pad on the wall line, inside
// it but out of the through-lane. Crate spots stay mid-room, ≥80 WU clear of the freight lane's
// centreline so a passing string never sweeps a label.

export const SWARM_FLOOR_PAD_KIND = 'swarm_floor_pad';

export const SWARM_FLOOR_WALL_GUN_PRICE = 500;
export const SWARM_FLOOR_CRATE_PRICE = 950;
/** The Crate relocates after every Nth paid pull. */
export const SWARM_FLOOR_CRATE_PULLS_PER_MOVE = 3;

/** Contact radius of a pad body — the fly-through trigger zone. */
export const SWARM_FLOOR_PAD_RADIUS = 12;
/** The Crate reads bigger than a gun pad: it is a crate, not a floor plate. */
export const SWARM_FLOOR_CRATE_RADIUS = 14;

/**
 * After one collection attempt the ordinary acceptance retry (0.75 s) gates the next. A pad is
 * a till, not loot — a successful purchase arms a slightly longer embargo so crossing the pad
 * does not immediately buy a second time while the hull is still inside the trigger zone.
 */
export const SWARM_FLOOR_PAD_RETRY_S = 1.4;

/** The pad's denial flash lives this long, in sim seconds. */
export const SWARM_FLOOR_REFUSAL_FLASH_S = 0.6;
/** The Crate's lift-off hop: sim seconds from spot to spot. */
export const SWARM_FLOOR_CRATE_MOVE_S = 1.6;

/** A wall gun's label: the gun's name and its price, in the room's own voice. */
export function wallGunLabel(name, price = SWARM_FLOOR_WALL_GUN_PRICE) {
  return `${String(name || '').toUpperCase()} · ${price}`;
}

export const SWARM_FLOOR_CRATE_LABEL = `THE CRATE · ${SWARM_FLOOR_CRATE_PRICE}`;

/** The Forge reads bigger than a gun pad: it is a furnace-side anvil, not a floor plate. */
export const SWARM_FLOOR_FORGE_RADIUS = 16;

/**
 * Authored pad layout per arena. Each wall gun fixes its defId and its spot; the Crate owns a
 * spot list its pad hops between; the Forge and the two Taps fix their kind and their spots —
 * what a tap sells is rolled per round, never authored here. `swarmFloorPlanFor` is the only
 * reader — arenas without a row mount nothing.
 */
export const SWARM_FLOOR_PLANS = Object.freeze({
  helios_core: Object.freeze({
    wallGuns: Object.freeze([
      Object.freeze({ id: 'foundry-gun-south', defId: 'wpn_pulse_laser_s', dx: 0, dz: 310 }),
      Object.freeze({ id: 'foundry-gun-ne', defId: 'wpn_concussion_cannon_s', dx: 220, dz: -220 }),
    ]),
    crateSpots: Object.freeze([
      Object.freeze({ dx: 190, dz: 90 }),
      Object.freeze({ dx: -220, dz: -140 }),
      Object.freeze({ dx: 20, dz: 230 }),
    ]),
    // A01-05 — the Forge sits on the north wall, behind the furnace from the south-gate
    // approach; the two Taps stand mid-floor flanking the fight line, ≥80 WU clear of the
    // freight lane's centreline just like the Crate spots.
    forge: Object.freeze({ id: 'foundry-forge', dx: 0, dz: -300 }),
    taps: Object.freeze([
      Object.freeze({ id: 'foundry-tap-west', dx: -300, dz: 110 }),
      Object.freeze({ id: 'foundry-tap-east', dx: 300, dz: 110 }),
    ]),
  }),
});

export function swarmFloorPlanFor(arenaId) {
  return SWARM_FLOOR_PLANS[arenaId] || null;
}
