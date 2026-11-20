// src/data/gunFamilies.js – OVH-08a: the §3.1 gun-curve families as data.
// Design authority: design/overhaul/03_COMBAT.md §3.1 (ruling R5: every gun trades damage for
// kick; kick = momentum delivered per second of fire). Every weapon id in src/data/weapons.js is
// mapped to one of the seven families by its stats and its own sentence; the bands are the §3.1
// "starting target vs a Wasp (16 t) at mid range" column as numbers, for a bench to measure
// against (scripts/bench-gun-curve.mjs). This file is pure data — it tunes nothing.

import { INERTIAL_SHUNT_TUNING } from './combatDefs.js';

/** The screen-depth unit FEEL_CONTRACT B5 prices shove displacement in: the visible chase-camera
 * depth. Canonical value is combatDefs' INERTIAL_SHUNT_TUNING.screenDepthWu ("FEEL_CONTRACT B3:
 * one screen is 126 WU") — one owner, no second number. */
export const SCREEN_DEPTH_WU = INERTIAL_SHUNT_TUNING.screenDepthWu;

/** The seven §3.1 families, in table order. */
export const GUN_FAMILIES = Object.freeze([
  'hose', 'pew', 'burn', 'needle', 'thump', 'boom', 'trick',
]);

// Each band's `kick` clause names the metric the §3.1 sentence actually prices:
//   displacementDepthAtEnd          — Hose: "moves it ≤ 0.1 screen depth" over the kill window.
//   displacementDepthPerS           — Pew/Burn: displacement per second of fire, in depths.
//   singleHitDisplacement2SDepth    — Thump: "one hit sends it ≥ 1 depth in 2 s" (FEEL_CONTRACT B5).
// A "~" target is widened ±50 % into a band; families §3.1 leaves unnumbered (Boom "scatters a
// pack", Trick "see §10 the Tumbler") carry null clauses — measured, never banded.
export const GUN_FAMILY_BANDS = Object.freeze({
  hose: Object.freeze({
    family: 'hose',
    source: 'design/overhaul/03_COMBAT.md §3.1 row Hose',
    ttk: Object.freeze({ min: null, max: 1.0 }),
    shotsToKill: null,
    kick: Object.freeze({ metric: 'displacementDepthAtEnd', min: null, max: 0.1 }),
    note: 'kills in ≤ 1.0 s of fire; moves it ≤ 0.1 screen depth',
  }),
  pew: Object.freeze({
    family: 'pew',
    source: 'design/overhaul/03_COMBAT.md §3.1 row Pew',
    ttk: Object.freeze({ min: 1.5, max: 2.0 }),
    shotsToKill: null,
    kick: Object.freeze({ metric: 'displacementDepthPerS', min: 0.15, max: 0.45 }),
    note: 'kills in 1.5–2.0 s; walks it back ~0.3 depth per second (~ widened ±50 %)',
  }),
  burn: Object.freeze({
    family: 'burn',
    source: 'design/overhaul/03_COMBAT.md §3.1 row Burn',
    ttk: Object.freeze({ min: 1.0, max: 2.0 }),
    shotsToKill: null,
    kick: Object.freeze({ metric: 'displacementDepthPerS', min: null, max: 0.1 }),
    note: 'kills in ~1.5 s (±0.5 s); none — it melts (kick ceiling as Hose’s ~none)',
  }),
  needle: Object.freeze({
    family: 'needle',
    source: 'design/overhaul/03_COMBAT.md §3.1 row Needle',
    ttk: null,
    shotsToKill: Object.freeze({ max: 1 }),
    kick: null,
    note: 'one shot kills it and passes through two more; through-and-pin has no §3.1 displacement number',
  }),
  thump: Object.freeze({
    family: 'thump',
    source: 'design/overhaul/03_COMBAT.md §3.1 row Thump (FEEL_CONTRACT B5)',
    ttk: Object.freeze({ min: 3.0, max: null }),
    shotsToKill: null,
    kick: Object.freeze({ metric: 'singleHitDisplacement2SDepth', min: 1.0, max: null }),
    note: 'by bullet alone ≥ 3 s; one hit sends it ≥ 1 depth in 2 s',
  }),
  boom: Object.freeze({
    family: 'boom',
    source: 'design/overhaul/03_COMBAT.md §3.1 row Boom',
    ttk: null,
    shotsToKill: null,
    kick: null,
    note: '"scatters a pack" — §3.1 gives Boom no per-Wasp number; measured, not banded',
  }),
  trick: Object.freeze({
    family: 'trick',
    source: 'design/overhaul/03_COMBAT.md §3.1 row Trick → §10 the Tumbler',
    ttk: null,
    shotsToKill: null,
    kick: null,
    note: 'none or little damage, special — measured, not banded',
  }),
});

// The mapping is authored judgment ("by its stats and description", OVH-08a §1), not derived:
// the same dmg/impulse pair can sit in different families when the sentence says so.
// test/ovh-08a-gun-families.test.mjs keeps this table in lockstep with WEAPONS.
export const GUN_FAMILY_BY_WEAPON_ID = Object.freeze({
  // ── Hose: constant damage, ~no knockback ("soak them with constant damage but not knock them
  //    back visibly at all") — rapid streams whose ribbon, not the single round, is the gun.
  wpn_bank_stream_m: 'hose',       // 14 rps stream; impulse 12 per light shot is presentation.
  wpn_flak_turret_s: 'hose',       // 8 rps PD battery, impulse 5 — a constant soak, no shove.
  wpn_saucer_death_ray: 'hose',    // continuous 360 dps alien beam; pressure is incidental.

  // ── Pew: the pistol curve — medium damage, small kick, walks a light hull back.
  wpn_pulse_laser_s: 'pew',        // named the Pew family by its own R5 comment in weapons.js.
  unique_mirrorjaw_pulse: 'pew',   // the starter bolt reborn; same curve, cooler heat.
  wpn_pulse_laser_m: 'pew',        // the starter bolt one size heavier — same verb, more of it.
  wpn_autocannon_s: 'pew',         // "armor-chewing slugs that knock light hulls around" — small kick.
  wpn_autocannon_m: 'pew',         // the heavier slug, same rock-and-shove-on-lights sentence.
  unique_ironsong_ac: 'pew',       // the heavy slug tuned faster and tighter — same family, meaner.

  // ── Burn: medium damage over time, no kick — it melts.
  wpn_beam_laser_m: 'burn',        // "a continuous cut that leans on whatever it holds".
  unique_veil_cutter: 'burn',      // the same patient cut, longer and cleaner.
  wpn_thermal_cooker: 'burn',      // continuous thermal cook — the melt verb literally.
  wpn_plasma_cannon_m: 'burn',     // thermal slugs that "melt" while they lean.
  wpn_plasma_cone_s: 'burn',       // the close-range thermal fan.
  wpn_heavy_beam_l: 'burn',        // siege-class continuous cut.
  unique_lighthouse_heavy_beam: 'burn', // the siege cut tuned hotter.

  // ── Needle: high damage per shot, through-and-pin.
  wpn_railgun_m: 'needle',         // the spinal penetrator: punches plates, staggers the rest.
  wpn_siege_lance_l: 'needle',     // the flagship spinal — one authored spear.

  // ── Thump: low damage, very high kick — "the cannon gun that wallops them".
  wpn_concussion_cannon_s: 'thump',// the light kicker slug; the collision is the payoff.
  wpn_concussion_cannon_m: 'thump',// the canonical momentum weapon (impulse 920).
  wpn_mass_driver: 'thump',        // a pure momentum slug (dmg 0) — wallops, never grinds.
  tool_seismic_gong: 'thump',      // impulse 220 "rings on a slam" — kick is the whole payload.

  // ── Boom: medium area damage, high radial kick — scatters a pack.
  wpn_missile_rack_m: 'boom',      // hunters with "a real shoulder" per hit.
  unique_nestbreaker_rack: 'boom', // the rack tuned for volume.
  wpn_torpedo_l: 'boom',           // the capital-area detonation.
  wpn_singularity_mortar_m: 'boom',// knots the pack, then pops.
  wpn_sticky_detonator: 'boom',    // the sticky charge and its shrapnel split.
  wpn_vector_mine_m: 'boom',       // radial impulse, zero damage — "scatters a pack" exactly.
  wpn_micro_barrage_m: 'boom',     // a fan of small seekers.
  wpn_saucer_annihilator: 'boom',  // heavy splash rounds.

  // ── Trick: none or little damage, special — the outcome is not on the damage/kick axes.
  wpn_snarl_s: 'trick',            // the ion webcaster: catch, not kill.
  wpn_gravity_marker_s: 'trick',   // marks a hull so wells grip it harder.
  wpn_tumbler_m: 'trick',          // 03 §10 the Tumbler: zero damage, sends them tumbling into the room.
  wpn_momentum_sink_s: 'trick',    // latch/slingshot setup ping.
  wpn_inertial_shunt_s: 'trick',   // the ram plate; the contact is the hit.
  wpn_gravity_well_m: 'trick',     // a sustained pull, never a detonation.
  wpn_rcs_disruptor_m: 'trick',    // steals steering — disable, not kill.
  wpn_emp_disruptor_m: 'trick',    // all damage to subsystems; a disable verb by authorship.
  wpn_glaive_s: 'trick',           // return-arc geometry; a hit on each pass.
  wpn_disc_launcher_m: 'trick',    // ricochet sawblades — the carom is the gun.
  wpn_debris_orbit_s: 'trick',     // claims rocks into a shield ring.
  wpn_conductive_primer: 'trick',  // emp chain primer.
  wpn_arc_caster: 'trick',         // the arc that jumps the pack.
  tool_grav_anchor: 'trick',       // the grav anchor tool.
  tool_polarity_inverter: 'trick', // inverted field — retired into the Shove power.
  tool_viscosity_field: 'trick',   // the clinging field.
  tool_hardlight_prism: 'trick',   // the prism’s cover/cousin behaviour.
  tool_thruster_hijacker: 'trick', // fires a held ship’s own thrusters.
  tool_quantum_sympathy: 'trick',  // linked bodies share momentum.
});

/** Family for a weapon id, or null — the single read helper consumers should use. */
export function gunFamilyOf(weaponId) {
  return GUN_FAMILY_BY_WEAPON_ID[weaponId] || null;
}

// Owner polish list: the shop shows rate, punch, reach and kick, plus how long the gun fires
// before it overheats. One pure read the shop screen and the draft cards can share. Heat pacing
// mirrors src/systems/weapons.js (player dissipation runs 15 % hot). `sustainS` is null for a
// gun that never overheats when held (the reason is `sustainReason`).
const PLAYER_HEAT_PACING = 1.15;
export function weaponShopFigures(def) {
  if (!def || typeof def !== 'object') return null;
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const rof = n(def.rof);
  const continuous = def.continuous === true;
  const rate = continuous ? null : rof;
  const punch = n(def.dmg);
  const dps = continuous ? punch : n(def.dps) || punch * rof;
  const reach = n(def.range);
  const kick = n(def.impulsePerHit);
  const heatMax = n(def.heatMax);
  const heatIn = continuous ? n(def.heatPerSec) : n(def.heatPerShot) * rof;
  const heatOut = n(def.heatDissip) * PLAYER_HEAT_PACING;
  let sustainS = null;
  let sustainReason = null;
  if (!(heatMax > 0) || !(heatIn > 0)) sustainReason = 'no heat';
  else if (heatIn <= heatOut) sustainReason = 'cools faster than it heats';
  else sustainS = Math.round((heatMax / (heatIn - heatOut)) * 10) / 10;
  return Object.freeze({
    family: gunFamilyOf(def.id), rate, punch, dps: Math.round(dps * 10) / 10, reach, kick, sustainS, sustainReason,
  });
}
