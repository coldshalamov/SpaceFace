// Swarm draft additions (PQ-135 / PQ-175.02) — what "upgrade every five waves" actually gives you.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// The arc's draft pool is weapons, and the starter hull holds three. On a thirty-wave arc with a
// draft after every wave that is fine: you are constantly re-answering the question of what your
// three guns should be. In an endless swarm run it is not. After three picks the hull is full and
// every later draft is a sideways swap forever, while enemy levels keep climbing.
//
// The fix is not a percentage. It is fittings that change a verb's shape: a heavier line, a wider
// well, a faster reel, a ram plate, a whip snap. Attack traits (src/data/attackTraits.js) change
// what every shot DOES. Massline heads and the Hitch-legal winch change the line. A ram plate
// makes the hull the weapon. Number cards stay in the minority — at most one in three.
//
// Those live in UTILITY, SHIELD and ENGINE slots, which the weapon-only pool could never reach.
// `fits` decides where a card can land. Hitch cannot take M concussion or M utility heads; those
// cards stay in the pool for hulls that can, and Hitch simply never sees them.
//
// RULES
// -----
//   * Every id here is a live module in src/data/modules.js. Nothing is invented.
//   * `kind` is verb or number. Verb cards name a shape when they change one.
//   * Blurbs are one line. No percentages, no +stat.
//   * The arc is untouched. This pool is appended only for the swarm ruleset.
//   * Kind strings stay literal here so this file never imports survivalDraft (that file imports us).

import { SWARM_RULESET } from './swarmMode.js';

export const SWARM_DRAFT_SCHEMA_VERSION = 1;

/**
 * The trait pool. Verb-shape cards lead. Number cards stay at the tail so the audit can name them.
 */
export const SWARM_DRAFT_OFFERS = Object.freeze([
  {
    id: 'snarl', defId: 'wpn_snarl_s', verb: 'Web', kind: 'verb', shape: null,
    blurb: 'Hits stitch nearby enemies together. Their thrust fights their partners; a shove swings the knot.',
  },
  {
    id: 'repulsion_trap', defId: 'mod_repulsion_trap_s', verb: 'Trap',
    kind: 'verb', shape: null,
    blurb: 'Brake and throw to drop a trap behind your flight path; a plain throw is still your sticky plate. Pursuers trigger a blast that throws the pack into the room.',
  },
  {
    id: 'bank', defId: 'mod_bank_shot', verb: 'Bank',
    kind: 'verb', shape: null,
    blurb: 'Your shots bounce off rock. Every wall becomes a firing angle.',
  },
  {
    id: 'pierce_core', defId: 'mod_piercing_core', verb: 'Punch',
    kind: 'verb', shape: null,
    blurb: 'Shots carry through the first hull into whatever is behind it.',
  },
  {
    id: 'fork', defId: 'mod_forked_core', verb: 'Fork',
    kind: 'verb', shape: null,
    blurb: 'Every shot splits. One trigger pull, two things to hit.',
  },
  {
    id: 'twin', defId: 'mod_twin_mount', verb: 'Twin',
    kind: 'verb', shape: null,
    blurb: 'Every gun grows a second barrel.',
  },
  {
    id: 'relay', defId: 'mod_relay_arc', verb: 'Arc',
    kind: 'verb', shape: null,
    blurb: 'A hit jumps to the next hull in reach. Tight packs kill themselves.',
  },
  {
    id: 'gravity_payload', defId: 'mod_gravity_tag', verb: 'Weight',
    kind: 'verb', shape: 'well',
    blurb: 'Hits mark a hull so the well takes that one.',
  },
  {
    id: 'ion', defId: 'mod_ion_payload', verb: 'Short',
    kind: 'verb', shape: null,
    blurb: 'Hits bleed into systems, not just plating.',
  },
  {
    id: 'incendiary', defId: 'mod_incendiary_payload', verb: 'Burn',
    kind: 'verb', shape: null,
    blurb: 'Hits keep burning after the shot has gone.',
  },
  {
    id: 'cryo', defId: 'mod_cryo_payload', verb: 'Freeze',
    kind: 'verb', shape: null,
    blurb: 'Hits freeze a hull stiff so the next blow lands on something that cannot yield.',
  },
  {
    id: 'herald', defId: 'mod_herald_fan', verb: 'Fan',
    kind: 'verb', shape: null,
    blurb: 'Shots spread as they travel — worse on one, better on eight.',
  },
  {
    id: 'ram', defId: 'mod_ram_plate', verb: 'Ram',
    kind: 'verb', shape: 'ram',
    blurb: 'A ram plate. Flying through something stops being your problem.',
  },
  {
    id: 'reel', defId: 'mod_winch_hd', verb: 'Reel',
    kind: 'verb', shape: 'reel',
    blurb: 'The line hauls them to you. You are the winch, not the bait.',
  },
  {
    id: 'charges', defId: 'mod_charge_rack', verb: 'Charges',
    kind: 'verb', shape: null,
    blurb: 'Impulse charges on the rack — a shove for whatever is on top of you.',
  },
  {
    id: 'burner', defId: 'mod_afterburner_m', verb: 'Burst',
    kind: 'verb', shape: null,
    blurb: 'A hard shove on demand. The way out of a closing ring.',
  },
  {
    id: 'tractor', defId: 'mod_tractor_beam_m', verb: 'Pull',
    kind: 'verb', shape: null,
    blurb: 'A line you put on a hull and haul.',
  },
  {
    id: 'whip', defId: 'mod_elastic_whip_m', verb: 'Whip',
    kind: 'verb', shape: 'whip',
    blurb: 'A springy line. Latch, stretch, snap them into something solid.',
  },
  {
    id: 'sweep', defId: 'mod_monofilament_sweep_m', verb: 'Sweep',
    kind: 'verb', shape: null,
    blurb: 'A taut line that cuts whatever crosses it.',
  },
  {
    id: 'snare', defId: 'mod_transverse_snare_m', verb: 'Snare',
    kind: 'verb', shape: 'line_load',
    blurb: 'One line laid across the lane they are coming down.',
  },
  // FB-021 — the four live emergent weapons (src/data/emergentPrimitives.js) join the shelf as
  // verb cards. Each sentence names its primitive. `fromWave` is the debut gate the wave planner
  // already speaks: the detonator is the first emergent toy on the shelf and the primer does not
  // arrive until after it — a primer with nothing to blow up is a card that lies.
  {
    id: 'sticky', defId: 'wpn_sticky_detonator', verb: 'Trap',
    kind: 'verb', shape: null, fromWave: 3,
    blurb: 'Sticks a charge to a hull — you call the moment it goes.',
  },
  {
    id: 'driver', defId: 'wpn_mass_driver', verb: 'Throw',
    kind: 'verb', shape: null, fromWave: 5,
    blurb: 'Drives a mass slug through whatever it meets — the shove is the shot.',
  },
  {
    id: 'primer', defId: 'wpn_conductive_primer', verb: 'Arc',
    kind: 'verb', shape: null, fromWave: 7,
    blurb: 'Primes a hull so the next hit jumps the gap to its neighbours.',
  },
  {
    id: 'cooker', defId: 'wpn_thermal_cooker', verb: 'Burn',
    kind: 'verb', shape: null, fromWave: 9,
    blurb: 'Cooks a target from the inside until its own fuel joins the fire.',
  },
  {
    id: 'spool', defId: 'mod_massline_spool_m', verb: 'Spool',
    kind: 'number', shape: null,
    blurb: 'A longer sling line. Speed lives in the rope.',
  },
  {
    id: 'chaff', defId: 'mod_chaff_dispenser_m', verb: 'Chaff',
    kind: 'verb', shape: null,
    blurb: 'A cloud that breaks every missile lock behind you at once.',
  },
  {
    id: 'booster', defId: 'mod_shield_booster_s', verb: 'Screen',
    kind: 'number', shape: null,
    blurb: 'A heavier screen between the swarm and your hull.',
  },
  {
    id: 'sink', defId: 'mod_thermal_sink_s', verb: 'Cool',
    kind: 'number', shape: null,
    blurb: 'Heat leaves the guns so you can hold the trigger.',
  },
  {
    id: 'hardener', defId: 'mod_shield_hardener_m', verb: 'Harden',
    kind: 'number', shape: null,
    blurb: 'The screen shrugs every flavor of fire, not just one.',
  },
  {
    id: 'fusion', defId: 'mod_engine_fusion_m', verb: 'Drive',
    kind: 'number', shape: null,
    blurb: 'More thrust under you. The whole fight gets faster.',
  },
]);

/** Every defId this pool can offer, for validators and tests. */
export const SWARM_DRAFT_DEF_IDS = Object.freeze(SWARM_DRAFT_OFFERS.map((o) => o.defId));

// ── the room-control legendaries (build-map row 270) ───────────────────────────────────────────
//
// A LEGENDARY IS NOT A FITTING. It takes no hardpoint, it is not a module, and it never joins the
// scored draft pool above. A legendary is a run-long change to the ROOM: the armory sells it from
// the service counter, the run remembers it as a `swarm_legendary` record, and the runtime reads
// that record to know the room has changed.
//
// `fromWave` counts CLEARED waves: the opening armory sits at wave 0, so a legendary gated at 3
// reaches the shelf from the armory that follows the third cleared wave. Prices are run credits,
// spent through the run wallet like every other armory row.

export const SWARM_LEGENDARY_RECORD_KIND = 'swarm_legendary';

const SWARM_ROOM_LEGENDARIES_BASE = Object.freeze([
  Object.freeze({
    id: 'domino',
    offerId: 'legendary_domino',
    name: 'Domino',
    verb: 'Domino',
    price: 76,
    fromWave: 3,
    category: 'Service',
    slotLabel: 'Legendary · lasts this run · uses no hardpoint',
    blurb: 'Every credited kill shoves nearby bodies outward.',
  }),
  Object.freeze({
    id: 'graviton_heart',
    offerId: 'legendary_graviton_heart',
    name: 'Graviton Heart',
    verb: 'Graviton Heart',
    price: 112,
    fromWave: 5,
    category: 'Service',
    slotLabel: 'Legendary · lasts this run · uses no hardpoint',
    blurb: 'A weak gravity well follows your ship and pulls nearby bodies inward.',
  }),
]);

// SEED-SW-08/11/12 — the throw-and-room legendaries join the same service counter: the throw
// economy (volatile hulls), the cover (bumper walls) and the kill (second sun) are room-long
// changes bought like every other legendary and read from the run's own ledger.
export const SWARM_ROOM_LEGENDARIES = Object.freeze(SWARM_ROOM_LEGENDARIES_BASE.concat([
  Object.freeze({
    id: 'volatile_hulls',
    offerId: 'legendary_volatile_hulls',
    name: 'Volatile Hulls',
    verb: 'Volatile Hulls',
    price: 120,
    fromWave: 4,
    category: 'Service',
    slotLabel: 'Legendary · lasts this run · uses no hardpoint',
    blurb: 'Anything you throw detonates on its first solid impact, credited to you.',
  }),
  Object.freeze({
    id: 'bumper_walls',
    offerId: 'legendary_bumper_walls',
    name: 'Bumper Walls',
    verb: 'Bumper Walls',
    price: 100,
    fromWave: 3,
    category: 'Service',
    slotLabel: 'Legendary · lasts this run · uses no hardpoint',
    blurb: 'Arena cover throws the pack back like a pinball table. Your own contacts unchanged.',
  }),
  Object.freeze({
    id: 'second_sun',
    offerId: 'legendary_second_sun',
    name: 'Second Sun',
    verb: 'Second Sun',
    price: 140,
    fromWave: 5,
    category: 'Service',
    slotLabel: 'Legendary · lasts this run · uses no hardpoint',
    blurb: 'Every kill ignites whatever stood close to it — ships and brood alike.',
  }),
]));

const LEGENDARY_BY_ID = new Map(SWARM_ROOM_LEGENDARIES.map((entry) => [entry.id, entry]));

/** The catalog row for one legendary id, or null for an id the catalog does not name. */
export function swarmLegendaryById(id) {
  return typeof id === 'string' ? (LEGENDARY_BY_ID.get(id) || null) : null;
}

/**
 * The legendaries THIS run owns.
 *
 * Reads only recognized `swarm_legendary` records out of the run's own modifier ledger, and
 * returns their ids, deduplicated, in first-seen order. Everything else is ignored: a missing run,
 * a malformed run, a non-Swarm run, a record of another kind, an unknown legendary id. Ownership
 * is a receipt the run keeps, never a guess.
 */
export function ownedSwarmLegendaryIds(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return [];
  if (run.ruleset !== SWARM_RULESET) return [];
  const modifiers = Array.isArray(run.modifiers) ? run.modifiers : [];
  const ids = [];
  const seen = new Set();
  for (const record of modifiers) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    if (record.kind !== SWARM_LEGENDARY_RECORD_KIND) continue;
    const id = record.legendaryId;
    if (typeof id !== 'string' || !LEGENDARY_BY_ID.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

// ── the call-in charges (SEED-SW-01..07) ────────────────────────────────────────────────────────
//
// A call-in charge is SPENT STOCK, not a fitting and not a room upgrade: the armory sells the
// charge, the run remembers how many it holds as `swarm_callin` records (count summed across
// rows of the same callinId), and one fire spends exactly one. Like the legendaries they ride
// the run's own modifier ledger — nothing here reads a save, and a charge lives exactly as long
// as the run that bought it. `fromWave` counts CLEARED waves (the opening armory sits at 0).

export const SWARM_CALLIN_RECORD_KIND = 'swarm_callin';

// ── the stacking passives (SEED-SW-14) ────────────────────────────────────────────────────────
//
// A stacking passive is SPENT STOCK of a room effect: the armory sells repeat copies of one
// passive (each copy applies its effect exactly once — the effect readers multiply by the held
// count), the stack caps small, and the copies ride the run's own modifier ledger as
// `swarm_passive` records — never the Hangar profile, which stays earned profile gear.

export const SWARM_PASSIVE_RECORD_KIND = 'swarm_passive';

/** The stack cap: a passive is a rack, not a vault. */
export const SWARM_PASSIVE_STACK_MAX = 5;

export const SWARM_PASSIVE_CATALOG = Object.freeze([
  Object.freeze({
    id: 'plated_hull',
    offerId: 'passive_plated_hull',
    name: 'Plated Hull',
    verb: 'Plate',
    price: 48,
    fromWave: 1,
    perCopyHull: 14,
    blurb: '+14 hull per plate, stacked to five. Scrap welded straight onto the frame.',
  }),
]);

const PASSIVE_BY_ID = new Map(SWARM_PASSIVE_CATALOG.map((entry) => [entry.id, entry]));

/** The catalog row for one passive id, or null. */
export function swarmPassiveById(id) {
  return typeof id === 'string' ? (PASSIVE_BY_ID.get(id) || null) : null;
}

/** How many copies of one passive THIS run holds (sum across ledger rows). */
export function swarmPassiveCount(run, passiveId) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return 0;
  if (typeof passiveId !== 'string' || !PASSIVE_BY_ID.has(passiveId)) return 0;
  if (run.ruleset !== SWARM_RULESET) return 0;
  const modifiers = Array.isArray(run.modifiers) ? run.modifiers : [];
  let total = 0;
  for (const record of modifiers) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    if (record.kind !== SWARM_PASSIVE_RECORD_KIND || record.passiveId !== passiveId) continue;
    const n = Number(record.count);
    if (Number.isFinite(n) && n > 0) total += Math.floor(n);
  }
  return total;
}

/** The hull bonus the run's plated-hull stack grants, once per copy. */
export function swarmPassiveHullBonus(run) {
  const entry = PASSIVE_BY_ID.get('plated_hull');
  return entry ? swarmPassiveCount(run, 'plated_hull') * entry.perCopyHull : 0;
}


/** Restock cap per charge type: stock is a rack, not a vault. */
export const SWARM_CALLIN_MAX_PER_TYPE = 3;

export const SWARM_CALLIN_CATALOG = Object.freeze([
  Object.freeze({
    id: 'smart_bomb',
    offerId: 'callin_smart_bomb',
    name: 'Smart Bomb',
    verb: 'Bomb',
    price: 64,
    fromWave: 1,
    category: 'Service',
    slotLabel: 'Call-in charge · one Bomb press · spends one',
    blurb: 'One Bomb press detonates a room-clearing blast that throws and breaks the pack, never you.',
  }),
  Object.freeze({
    id: 'orbital_lance',
    offerId: 'callin_orbital_lance',
    name: 'Orbital Lance',
    verb: 'Lance',
    price: 90,
    fromWave: 2,
    category: 'Service',
    slotLabel: 'Call-in charge · telegraphed strike · spends one',
    blurb: 'Paints the aim point, then a beam column lands a real hit and a shove on everything in it.',
  }),
  Object.freeze({
    id: 'turret_drop',
    offerId: 'callin_turret_drop',
    name: 'Turret Drop',
    verb: 'Turret',
    price: 96,
    fromWave: 2,
    category: 'Service',
    slotLabel: 'Call-in charge · fights this wave · spends one',
    blurb: 'Drops an allied turret that fights beside you until the wave clears, then strikes its colors.',
  }),
  Object.freeze({
    id: 'drone_wing',
    offerId: 'callin_drone_wing',
    name: 'Drone Wing',
    verb: 'Wing',
    price: 104,
    fromWave: 3,
    category: 'Service',
    slotLabel: 'Call-in charge · four escorts · spends one',
    blurb: 'Launches four escort drones that shoot the pack for the wave and leave with it.',
  }),
  Object.freeze({
    id: 'shield_dome',
    offerId: 'callin_shield_dome',
    name: 'Shield Dome',
    verb: 'Dome',
    price: 84,
    fromWave: 2,
    category: 'Service',
    slotLabel: 'Call-in charge · plants where you stand · spends one',
    blurb: 'Plants a fixed dome that stops the pack and its shots at the rim while yours leave. Runs on a clock.',
  }),
  Object.freeze({
    id: 'decoy',
    offerId: 'callin_decoy',
    name: 'Decoy',
    verb: 'Decoy',
    price: 56,
    fromWave: 1,
    category: 'Service',
    slotLabel: 'Call-in charge · throwable lure · spends one',
    blurb: 'A thrown lure the pack cannot resist. It dies like debris when the battery does.',
  }),
]);

const CALLIN_BY_ID = new Map(SWARM_CALLIN_CATALOG.map((entry) => [entry.id, entry]));

/** The catalog row for one call-in id, or null for an id the catalog does not name. */
export function swarmCallinById(id) {
  return typeof id === 'string' ? (CALLIN_BY_ID.get(id) || null) : null;
}

/**
 * How many of one charge THIS run holds: the sum of counts across recognized `swarm_callin`
 * records of that id. Restocks append rows; the count is the truth, not any single row.
 */
export function swarmCallinCount(run, callinId) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return 0;
  if (typeof callinId !== 'string' || !CALLIN_BY_ID.has(callinId)) return 0;
  if (run.ruleset !== SWARM_RULESET) return 0;
  const modifiers = Array.isArray(run.modifiers) ? run.modifiers : [];
  let total = 0;
  for (const record of modifiers) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    if (record.kind !== SWARM_CALLIN_RECORD_KIND) continue;
    if (record.callinId !== callinId) continue;
    const n = Number(record.count);
    if (Number.isFinite(n) && n > 0) total += Math.floor(n);
  }
  return total;
}

/**
 * Spend one charge of `callinId` from the run's own ledger: rows are consumed FIFO (a restock
 * never short-changes an older row), and the row that reaches zero is removed. Returns the count
 * held after the spend — the caller compares before/after to know the fire was real.
 */
export function spendSwarmCallin(run, callinId) {
  if (!run || !Array.isArray(run.modifiers)) return 0;
  const rows = run.modifiers.filter((record) => record && typeof record === 'object'
    && !Array.isArray(record) && record.kind === SWARM_CALLIN_RECORD_KIND && record.callinId === callinId);
  for (const row of rows) {
    const n = Number(row.count);
    if (!(Number.isFinite(n) && n > 0)) continue;
    const left = Math.floor(n) - 1;
    if (left > 0) row.count = left;
    else run.modifiers.splice(run.modifiers.indexOf(row), 1);
    return swarmCallinCount(run, callinId);
  }
  return swarmCallinCount(run, callinId);
}
