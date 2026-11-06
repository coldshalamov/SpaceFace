// Crucible account-level unlock catalog (PQ-133.10a / CRU-055).
//
// Possibility, never power. Every entry widens the option set — another starter verb, a
// challenge ruleset, a cosmetic mark. None of them write damage, hull, speed, credits, XP,
// or score. A skilled first-run player can win with the default Hitch Pulse kit; later
// accounts have more ways to play the same fight, not a bigger number on that kit.
//
// Pure frozen data. No bus, no storage, no RNG.

import { SURVIVAL_ARC_LENGTH } from './survivalActs.js';

export const SURVIVAL_UNLOCK_SCHEMA_VERSION = 1;
export const SURVIVAL_DEFAULT_STARTER_ID = 'starter_hitch_pulse';
export const SURVIVAL_DEFAULT_HULL_ID = 'ship_kestrel';
export const SURVIVAL_DEFAULT_WEAPON_ID = 'wpn_pulse_laser_s';

/** Axes a returning account is forbidden to raise over a fresh one. */
export const SURVIVAL_POWER_AXES = Object.freeze([
  'damage', 'hull', 'shield', 'speed', 'credits', 'xp', 'score',
]);

export const ZERO_POWER = Object.freeze(Object.fromEntries(
  SURVIVAL_POWER_AXES.map((axis) => [axis, 0]),
));

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

function entry(def) {
  return freezeDeep({
    power: ZERO_POWER,
    defaultUnlocked: false,
    grants: {},
    earn: null,
    ...def,
  });
}

function starter(id, label, defId, verb, blurb) {
  return freezeDeep({
    id,
    label,
    hullId: SURVIVAL_DEFAULT_HULL_ID,
    weaponId: defId,
    verb,
    blurb,
  });
}

/**
 * Starting kits from the legacy account unlock catalog. Each uses the Hitch hull;
 * weapon performance comes from the canonical weapon definitions below the launch layer.
 */
export const SURVIVAL_STARTERS = freezeDeep([
  starter(
    'starter_hitch_pulse',
    'Hitch Pulse',
    'wpn_pulse_laser_s',
    'Cadence',
    'The public kit. A readable energy repeater — the first-run gun.',
  ),
  starter(
    'starter_hitch_tag',
    'Hitch Tag',
    'wpn_gravity_marker_s',
    'Tag',
    'Starts already marking hulls for the room\'s gravity, instead of shooting them down.',
  ),
  starter(
    'starter_hitch_bind',
    'Hitch Bind',
    'wpn_momentum_sink_s',
    'Bind',
    'Starts latched to the target\'s frame of motion. A different first lesson, not a thicker hull.',
  ),
  starter(
    'starter_hitch_screen',
    'Hitch Screen',
    'wpn_flak_turret_s',
    'Screen',
    'Starts answering incoming ordnance. Lower direct damage than Pulse; a different job.',
  ),
  starter(
    'starter_hitch_sidearm',
    'Hitch Sidearm',
    'wpn_autocannon_s',
    'Sidearm',
    'Starts with a light kinetic repeater. Lower cadence than Pulse; a different feel.',
  ),
]);

export const SURVIVAL_STARTER_BY_ID = Object.freeze(Object.fromEntries(
  SURVIVAL_STARTERS.map((row) => [row.id, row]),
));

/**
 * Account unlocks. `grants` names options; `earn` is the only way an id becomes earned.
 * `defaultUnlocked` rows are available on a fresh profile without being stored as earned
 * — nothing in this file self-grants on load.
 */
export const DOOR_PUBLIC_STARTERS = Object.freeze([
  'ricochet_runner',
  'energy_baseline',
  'veil_step',
  'boomerang_bomb_run',
  'pinball_rush',
  'kinetic_baseline',
  'mirror_demonstrator',
]);

export const SURVIVAL_UNLOCK_CATALOG = freezeDeep([
  entry({
    id: 'unlock_kit_ricochet',
    kind: 'starter',
    label: 'Ricochet Runner',
    blurb: 'The public kit. Bank a stream, shove the pack, boost through.',
    defaultUnlocked: true,
    grants: { starters: ['ricochet_runner'] },
  }),
  entry({
    id: 'unlock_kit_energy',
    kind: 'starter',
    label: 'Baseline Energy',
    blurb: 'A plain pulse. Always available, so a first run can just shoot.',
    defaultUnlocked: true,
    grants: { starters: ['energy_baseline'] },
  }),
  entry({
    id: 'unlock_kit_veil_step',
    kind: 'starter',
    label: 'Veil Step',
    blurb: 'A phase jump that spends the boost capacitor. Always available, so the first run can cross a fight.',
    defaultUnlocked: true,
    grants: { starters: ['veil_step'] },
  }),
  entry({
    id: 'unlock_kit_boomerang_bomb_run',
    kind: 'starter',
    label: 'Boomerang Bomb Run',
    blurb: 'A physical banking sortie with one real bomb and a certified phase return. Always available.',
    defaultUnlocked: true,
    grants: { starters: ['boomerang_bomb_run'] },
  }),
  entry({
    id: 'unlock_kit_pinball_rush',
    kind: 'starter',
    label: 'Pinball Rush',
    blurb: 'Hold Boost at a live hostile and release a real charged dash. Contacts resolve through normal physics and combat.',
    defaultUnlocked: true,
    grants: { starters: ['pinball_rush'] },
  }),
  entry({
    id: 'unlock_kit_kinetic',
    kind: 'starter',
    label: 'Baseline Kinetic',
    blurb: 'A plain autocannon. Always available, so a first run can just shoot.',
    defaultUnlocked: true,
    grants: { starters: ['kinetic_baseline'] },
  }),
  // PQ-133.04 R4 — the Foundry Block's teaching kit. Public like the other baseline rows: a
  // demonstration of the bank verb is possibility, not power, and the row carries the zero
  // vector like every other catalog entry.
  entry({
    id: 'unlock_kit_mirror',
    kind: 'starter',
    label: 'Mirror Demonstrator',
    blurb: 'One pulse gun with Bank Shot and Smart Bank. Always available, so a first run can learn the bank.',
    defaultUnlocked: true,
    grants: { starters: ['mirror_demonstrator'] },
  }),
  entry({
    id: 'unlock_kit_web',
    kind: 'starter',
    label: 'Web Weaver',
    blurb: 'Start already holding the web.',
    earn: { kind: 'pick_and_waves', verb: 'Web', minWaves: 5 },
    grants: { starters: ['web_weaver'] },
  }),
  entry({
    id: 'unlock_kit_physics',
    kind: 'starter',
    label: 'Physics Toolkit',
    blurb: 'Start already holding tag and bind.',
    earn: { kind: 'pick_and_waves', verb: 'Tag', minWaves: 5 },
    grants: { starters: ['physics_toolkit'] },
  }),
  entry({
    id: 'unlock_kit_massline',
    kind: 'starter',
    label: 'Massline Rig',
    blurb: 'Start on the rope hull.',
    earn: { kind: 'pick_and_waves', verb: 'Whip', minWaves: 8 },
    grants: { starters: ['massline_rig'] },
  }),
  entry({
    id: 'unlock_kit_bolt',
    kind: 'starter',
    label: 'Bolt',
    blurb: 'The fast, clumsy Hornet. Same gun, different drive.',
    earn: { kind: 'waves_cleared', min: 10 },
    grants: { starters: ['hornet_fast_clumsy'] },
  }),
  entry({
    id: 'unlock_kit_hinge',
    kind: 'starter',
    label: 'Hinge',
    blurb: 'The nimble, slow Hornet. Same gun, different bells.',
    earn: { kind: 'waves_cleared', min: 15 },
    grants: { starters: ['hornet_nimble_slow'] },
  }),
  entry({
    id: 'unlock_boss_circuit',
    kind: 'mode',
    label: 'Boss Circuit',
    blurb: 'Five champions, one after another. No drafts between them.',
    earn: { kind: 'waves_cleared', min: 10 },
    grants: { modes: ['boss_circuit'] },
  }),
  entry({
    id: 'unlock_mutator_shutter',
    kind: 'mutator',
    label: 'Alternating Shutters',
    blurb: 'The Foundry shutters run the alternating cadence for the whole arc. Same seed, a different room.',
    earn: { kind: 'waves_cleared', min: 10 },
    grants: { mutators: ['shutter_alternating'] },
  }),
  entry({
    id: 'unlock_mutator_draftless',
    kind: 'mutator',
    label: 'Draftless',
    blurb: 'No mid-run weapon offers. A control ruleset, not a stronger kit.',
    earn: { kind: 'authored_victory' },
    grants: { mutators: ['draftless'] },
  }),
  entry({
    id: 'unlock_mutator_no_reroll',
    kind: 'mutator',
    label: 'No Re-roll',
    blurb: 'The three cards you are dealt are the three cards you keep.',
    earn: { kind: 'authored_victory' },
    grants: { mutators: ['no_reroll'] },
  }),
  entry({
    id: 'unlock_mutator_physics_only',
    kind: 'mutator',
    label: 'Physics Only',
    blurb: 'Drafts may only offer throw / tag / bind / mine / unsteer. A narrower pool, not a bigger gun.',
    earn: { kind: 'victory_and_physics_pick' },
    grants: { mutators: ['physics_only'] },
  }),
  entry({
    // RC-CRUCIBLE-DOOR (row 481) — Wreck Ballast: the door's dead-hull debris field, earned
    // on the same climb the other mutators are.
    id: 'unlock_mutator_wreck_ballast',
    kind: 'mutator',
    label: 'Wreck Ballast',
    blurb: 'The room comes littered with dead hulls. They throw like everything else.',
    earn: { kind: 'waves_cleared', min: 10 },
    grants: { mutators: ['wreck_ballast'] },
  }),
  entry({
    id: 'unlock_trial_one_hull',
    kind: 'trial',
    label: 'One Hull',
    blurb: 'The hull you launch is the hull you finish. Hitch stays Hitch.',
    earn: { kind: 'waves_cleared', min: 10 },
    grants: { trials: ['trial_one_hull'] },
  }),
  entry({
    id: 'unlock_trial_one_weapon',
    kind: 'trial',
    label: 'One Weapon',
    blurb: 'The gun you launch is the gun you finish. Drafts do not add a second verb.',
    earn: { kind: 'waves_cleared', min: 10 },
    grants: { trials: ['trial_one_weapon'] },
  }),
  entry({
    id: 'unlock_mark_foundry',
    kind: 'cosmetic',
    label: 'Foundry Clearance',
    blurb: 'A mark for finishing the authored arc. No combat effect.',
    earn: { kind: 'authored_victory' },
    grants: { cosmetics: ['mark_foundry_clearance'] },
  }),
  entry({
    id: 'unlock_mark_act_ii',
    kind: 'lore',
    label: 'Act II Provenance',
    blurb: 'A note that you reached the second act. No combat effect.',
    earn: { kind: 'deepest_wave', min: 20 },
    grants: { lore: ['foundry_act_ii'] },
  }),
  entry({
    id: 'unlock_mark_act_iii',
    kind: 'lore',
    label: 'Act III Provenance',
    blurb: 'A note that you finished the authored thirty. No combat effect.',
    earn: { kind: 'authored_victory' },
    grants: { lore: ['foundry_act_iii'] },
  }),
]);

export const SURVIVAL_UNLOCK_BY_ID = Object.freeze(Object.fromEntries(
  SURVIVAL_UNLOCK_CATALOG.map((row) => [row.id, row]),
));

export const SURVIVAL_AUTHORED_VICTORY_WAVES = SURVIVAL_ARC_LENGTH;
