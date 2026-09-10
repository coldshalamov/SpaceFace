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
    blurb: 'Drop behind your flight path. Pursuers trigger a blast that throws the pack into the room.',
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
    blurb: 'Hits leave a hull heavy. The well reaches it from farther away.',
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
    blurb: 'Hits stiffen a hull so the next blow does more.',
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
    blurb: 'The line comes back faster than they can pull away.',
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
    kind: 'verb', shape: null,
    blurb: 'One line laid across the lane they are coming down.',
  },
  {
    id: 'spool', defId: 'mod_massline_spool_m', verb: 'Spool',
    kind: 'verb', shape: 'line_load',
    blurb: 'A longer line, so the sling has farther to build speed.',
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
