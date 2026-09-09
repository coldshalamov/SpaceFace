// Swarm draft additions (PQ-135) — what "upgrade every five waves" actually gives you.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// The arc's draft pool is fourteen WEAPONS, and the starter hull holds three. On a thirty-wave arc
// with a draft after every wave that is fine: you are constantly re-answering the question of what
// your three guns should be. In an endless swarm run it is not. After three picks the hull is full
// and every later draft is a sideways swap forever, while enemy levels keep climbing — so the run
// stops being about how well you play and starts being about when the numbers run out.
//
// The fix is not a percentage. It is the ATTACK TRAIT catalog that already ships
// (src/data/attackTraits.js, compiled by combat/attackSpec.js): fittable modules that change what
// every shot you fire DOES. A Piercing Core makes shots carry through the first hull. A Forked Core
// splits them. Relay Arc jumps a hit to the next hull in reach. Bank Shot makes them ricochet off
// rock — which in an arena carrying a real debris field turns the room itself into a firing angle,
// and is the single most on-theme upgrade in the game.
//
// Those live in UTILITY, SHIELD and ENGINE slots, which the weapon-only pool could never reach. So
// a swarm hull fills seven slots over a run instead of three, and every one of them is a verb the
// player can name rather than a number they have to trust.
//
// RULES
// -----
//   * Every id here is a live module in src/data/modules.js with a live entry in the attack-trait
//     catalog or a live consumer system. Nothing is invented.
//   * No percentages in the copy — same rule the weapon pool follows. The blurb says what changes
//     on screen.
//   * `fits` decides where a card can land; this file never asserts a slot. A hull without a
//     utility slot simply never sees the utility cards.
//   * The arc is untouched. This pool is appended only for the swarm ruleset.

export const SWARM_DRAFT_SCHEMA_VERSION = 1;

/**
 * The trait pool. Ordered so the shots-do-more-things family leads: those are the cards that make
 * a full hull feel like a growing build rather than a finished one.
 */
export const SWARM_DRAFT_OFFERS = Object.freeze([
  {
    id: 'bank', defId: 'mod_bank_shot', verb: 'Bank',
    blurb: 'Your shots bounce off rock. Every wall in the arena becomes a firing angle.',
  },
  {
    id: 'pierce_core', defId: 'mod_piercing_core', verb: 'Punch',
    blurb: 'Shots carry through the first hull and keep going into whatever is behind it.',
  },
  {
    id: 'fork', defId: 'mod_forked_core', verb: 'Fork',
    blurb: 'Every shot splits on the way out. One trigger pull, two things to hit.',
  },
  {
    id: 'twin', defId: 'mod_twin_mount', verb: 'Twin',
    blurb: 'Every gun grows a second barrel.',
  },
  {
    id: 'relay', defId: 'mod_relay_arc', verb: 'Arc',
    blurb: 'A hit jumps to the next hull in reach. Tight formations kill themselves.',
  },
  {
    id: 'gravity_payload', defId: 'mod_gravity_tag', verb: 'Weight',
    blurb: 'Everything you hit is left heavy — the room pulls on it far harder afterwards.',
  },
  {
    id: 'ion', defId: 'mod_ion_payload', verb: 'Short',
    blurb: 'Hits bleed into systems, not just plating.',
  },
  {
    id: 'incendiary', defId: 'mod_incendiary_payload', verb: 'Burn',
    blurb: 'Hits keep burning after the shot has gone.',
  },
  {
    id: 'cryo', defId: 'mod_cryo_payload', verb: 'Freeze',
    blurb: 'Hits stiffen a hull, so the next thing that hits it does more.',
  },
  {
    id: 'herald', defId: 'mod_herald_fan', verb: 'Fan',
    blurb: 'Your shots spread as they travel — worse against one hull, far better against eight.',
  },
  {
    id: 'ram', defId: 'mod_ram_plate', verb: 'Ram',
    blurb: 'A reinforced prow. Flying through something stops being your problem.',
  },
  {
    id: 'sink', defId: 'mod_thermal_sink_s', verb: 'Cool',
    blurb: 'Heat leaves the guns faster, so you stop having to let go of the trigger.',
  },
  {
    id: 'charges', defId: 'mod_charge_rack', verb: 'Charges',
    blurb: 'Impulse charges on the rack — a shove big enough to move what is on top of you.',
  },
  {
    id: 'booster', defId: 'mod_shield_booster_s', verb: 'Screen',
    blurb: 'A heavier screen between the swarm and your hull.',
  },
  {
    id: 'hardener', defId: 'mod_shield_hardener_m', verb: 'Harden',
    blurb: 'The screen stops shrugging off one kind of fire and starts shrugging off all of it.',
  },
  {
    id: 'capacitor', defId: 'mod_shield_capacitor_m', verb: 'Bank Screen',
    blurb: 'A deeper screen that takes longer to break and longer to come back.',
  },
  {
    id: 'burner', defId: 'mod_afterburner_m', verb: 'Burst',
    blurb: 'A hard shove on demand. The way out of a closing ring.',
  },
  {
    id: 'nanobots', defId: 'mod_repair_nanobots_m', verb: 'Knit',
    blurb: 'The hull closes its own wounds between fights.',
  },
  {
    id: 'targeting', defId: 'mod_targeting_computer_m', verb: 'Lead',
    blurb: 'The guns lead their targets for you.',
  },
  {
    id: 'fusion', defId: 'mod_engine_fusion_m', verb: 'Drive',
    blurb: 'More thrust under you. The whole fight gets faster.',
  },
  {
    id: 'tractor', defId: 'mod_tractor_beam_m', verb: 'Pull',
    blurb: 'A line you can put on a hull and haul — bring the fight where you want it.',
  },
  {
    id: 'whip', defId: 'mod_elastic_whip_m', verb: 'Whip',
    blurb: 'A springy line. What you latch, you can sling into something solid.',
  },
  {
    id: 'sweep', defId: 'mod_monofilament_sweep_m', verb: 'Sweep',
    blurb: 'A taut line that cuts whatever crosses it. Fly the rope through the swarm.',
  },
  {
    id: 'snare', defId: 'mod_transverse_snare_m', verb: 'Snare',
    blurb: 'One line laid across the lane they are coming down.',
  },
  {
    id: 'spool', defId: 'mod_massline_spool_m', verb: 'Spool',
    blurb: 'A longer line, so the thing you are slinging has further to build speed.',
  },
  {
    id: 'chaff', defId: 'mod_chaff_dispenser_m', verb: 'Chaff',
    blurb: 'A cloud that breaks every missile lock behind you at once.',
  },
]);

/** Every defId this pool can offer, for validators and tests. */
export const SWARM_DRAFT_DEF_IDS = Object.freeze(SWARM_DRAFT_OFFERS.map((o) => o.defId));
