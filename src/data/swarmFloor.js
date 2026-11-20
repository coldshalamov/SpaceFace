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
export const SWARM_FLOOR_INTERACT_REACH = 112;
export const SWARM_FLOOR_ARM_S = 4;
export const SWARM_FLOOR_ARM_REQUEST = 'swarm:floorPadArmRequested';

export function swarmFloorPadQuote(entity) {
  const offer = entity?.data?.swarmFloorPad;
  if (!entity || entity.alive === false || entity.data?.kind !== SWARM_FLOOR_PAD_KIND
    || !offer?.padId || offer.moving || !Number.isFinite(offer.price)) return null;
  return { entityId: entity.id, generation: entity.occupantGeneration ?? null,
    price: offer.price, label: offer.label, fit: offer.fitPreview ?? null };
}

export function nearestSwarmFloorPad(state) {
  const run = state?.run;
  if (run?.kind !== 'survival' || run.ruleset !== 'swarm' || run.phase !== 'active' || !swarmFloorPlanFor(run.arenaId)) return null;
  const pilot = state.entities?.get(state.playerId);
  if (!pilot?.pos || pilot.alive === false) return null;
  let nearest = null;
  let best = SWARM_FLOOR_INTERACT_REACH ** 2;
  for (const entity of state.entities.values()) {
    if (!entity?.pos || entity.alive === false || entity.data?.kind !== SWARM_FLOOR_PAD_KIND) continue;
    const distance = (entity.pos.x - pilot.pos.x) ** 2 + (entity.pos.z - pilot.pos.z) ** 2;
    if (distance > best || (distance === best && nearest && entity.id >= nearest.id)) continue;
    if (swarmFloorPadQuote(entity)) { nearest = entity; best = distance; }
  }
  return nearest;
}

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
      // PIT-01 — `wave` is the pad's debut round ('Second Helpings' lights the first gun;
      // the second follows a round later): a spec with no wave sells from round 1.
      Object.freeze({ id: 'foundry-gun-south', defId: 'wpn_pulse_laser_s', dx: 0, dz: 310, wave: 2 }),
      Object.freeze({ id: 'foundry-gun-ne', defId: 'wpn_concussion_cannon_s', dx: 220, dz: -220, wave: 3 }),
    ]),
    crateSpots: Object.freeze([
      Object.freeze({ dx: 195, dz: -5 }),
      Object.freeze({ dx: -220, dz: -140 }),
      Object.freeze({ dx: 20, dz: 230 }),
    ]),
    // A01-05 — the Forge sits on the north wall, behind the furnace from the south-gate
    // approach; the two Taps stand mid-floor flanking the fight line, ≥80 WU clear of the
    // freight lane's centreline just like the Crate spots.
    forge: Object.freeze({ id: 'foundry-forge', dx: 0, dz: -300 }),
    taps: Object.freeze([
      Object.freeze({ id: 'foundry-tap-west', dx: -320, dz: 120 }),
      Object.freeze({ id: 'foundry-tap-east', dx: 320, dz: 120 }),
    ]),
  }),
});

export function swarmFloorPlanFor(arenaId) {
  return SWARM_FLOOR_PLANS[arenaId] || null;
}

/**
 * 15_ARENA_FLOORS (composition rules): a shop is a landmark and nothing else stands on it. The
 * apron is the extra clear radius around a pad body; the ring planner adds each rock's own radius
 * and its separation on top, so a rock edge ends up about 60 WU from a pad centre.
 */
export const SWARM_FLOOR_APRON_WU = 14;

/** Pad bodies of an arena as [{ x, z, radius }] offsets from the room anchor (empty without a plan). */
export function swarmFloorKeepClear(arenaId) {
  const plan = swarmFloorPlanFor(arenaId);
  if (!plan) return [];
  const spot = (s, radius) => ({ x: s.dx, z: s.dz, radius: radius + SWARM_FLOOR_APRON_WU });
  return [
    ...plan.wallGuns.map((g) => spot(g, SWARM_FLOOR_PAD_RADIUS)),
    ...plan.crateSpots.map((c) => spot(c, SWARM_FLOOR_CRATE_RADIUS)),
    ...(plan.forge ? [spot(plan.forge, SWARM_FLOOR_FORGE_RADIUS)] : []),
    ...(plan.taps || []).map((t) => spot(t, SWARM_FLOOR_PAD_RADIUS)),
  ];
}

/**
 * Each shop lights itself (src/render/nocturne reads `data.nocturne`): a small hot source whose
 * halo lands on the floor around it, with the surroundings left in shade. Wall guns and the Forge
 * also carry a short haze volume (the engine holds four at once; the furnace takes the fourth).
 * Offsets are metres above the pad. Phones skip NOCTURNE; the pad is still readable without it.
 */
// The engine keeps three resident point lights for the whole screen, shared with explosion flashes
// (priority 2-3). A shop or the furnace beside the player outranks a distant one by priority and
// importance; plates and gate posts are priority 1 and only show when nothing hotter is near.
const PAD_HAZE = Object.freeze({ radii: Object.freeze([5, 2.2, 5]), density: 0.0016, color: 0xffc58a, anisotropy: 0.3, extinction: 1, noise: 0.3 });
const FORGE_HAZE = Object.freeze({ radii: Object.freeze([6, 2.4, 6]), density: 0.0022, color: 0xff9a5a, anisotropy: 0.4, extinction: 1, noise: 0.4 });
// Only the wall guns, the Forge and the furnace take an 'industrial' composition (haze + a colour probe;
// the engine holds four probes). The rest use 'dock': a light and nothing else.
const PAD_NOCTURNE = Object.freeze({
  wall_gun: Object.freeze({ profile: 'industrial', lights: Object.freeze([Object.freeze({ id: 'shop', profile: 'shop_amber', offset: Object.freeze([0, 22, 0]), intensity: 22000, range: 190, priority: 3, importance: 1.5 })]), medium: PAD_HAZE }),
  crate: Object.freeze({ profile: 'dock', lights: Object.freeze([Object.freeze({ id: 'shop', profile: 'shop_amber', offset: Object.freeze([0, 20, 0]), intensity: 16000, range: 160, priority: 3, importance: 1.5 })]), medium: false }),
  forge: Object.freeze({ profile: 'industrial', lights: Object.freeze([Object.freeze({ id: 'shop', profile: 'forge_hot', offset: Object.freeze([0, 24, 0]), intensity: 40000, range: 250, priority: 3, importance: 1.8 })]), medium: FORGE_HAZE }),
  tap: Object.freeze({ profile: 'dock', lights: Object.freeze([Object.freeze({ id: 'shop', profile: 'work_cyan', offset: Object.freeze([0, 20, 0]), intensity: 12000, range: 150 })]), medium: false }),
});

export function swarmPadNocturne(kind) {
  return PAD_NOCTURNE[kind] || null;
}

/**
 * Each shop draws an existing authored body instead of the generic pickup gem (render reads
 * `data.packagedPropFile / packagedPropSlot / packagedPropRadius`, the same packaged-prop route the
 * 47-A story props use; the model fits a sphere of `radius` WU). Nothing new is authored here:
 *   wall gun - the dual turret from the weapons set      Crate - the cargo container
 *   Forge    - the drill platform (nothing in the repo is a furnace; see the Codex findings)
 *   Tap      - the slurry tank with its pipe run
 */
const PAD_BODY = Object.freeze({
  wall_gun: Object.freeze({ file: 'weapons/weapon_turret_dual.glb', slot: 'place', radius: 12 }),
  crate: Object.freeze({ file: 'pods/pod_cargo_container.glb', slot: 'pod', radius: 12 }),
  forge: Object.freeze({ file: 'places/place_drill_platform.glb', slot: 'place', radius: 15 }),
  tap: Object.freeze({ file: 'places/place_slurry_tank.glb', slot: 'place', radius: 11 }),
});

export function swarmPadBody(kind) {
  return PAD_BODY[kind] || null;
}
