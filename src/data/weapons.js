// src/data/weapons.js – canonical weapon modules.
// IDs use wpn_ prefix per ARCHITECTURE §0.4. requiresTech refs use tech_ prefix.
// ammo refs use cmdty_ prefix. The only import is userContent.js, which merges validated
// user-dropped JSON records onto the shipped table (PQ-172.00 — see bottom of file).
// Combat fields: dmg, rof(/s), dps(derived), damageType, projSpeed(wu/s),
//   range(wu), tracking, energyCost(cap/shot or cap/s for continuous).
// PQ-009 impulse identity: impulsePerHit is world-space momentum at a full authored hit;
// continuous weapons scale it by their per-tick damage fraction. tumbleTorque is the maximum
// authored angular impulse for an off-center hit. impulseProvenance is the stable receipt tag.
// PQ-176.02 mount classes: `mount` is 'gun' (aimed), 'turret' (aims itself), 'launcher' (tubes,
//   mines) or 'spinal' (the barrel is the ship's spine). Missing -> derived from `tracking`
//   (auto_turret -> turret, homing/deploy -> launcher, else gun). See HARDPOINT_ACCEPTS below.

// A hull hardpoint is a 'ring' (facing 'turret') or 'fixed' (every other facing). The ring only
// carries what a traversing cradle can swing: aimed guns and dedicated turrets. Launchers and
// spinal guns need a fixed hardpoint. An aimed gun on a ring aims itself, and the traverse gear
// costs it output: the fixed twin out-damages it by the authored margin, so aim skill is paid.
export const WEAPON_MOUNT_CLASSES = Object.freeze(['gun', 'turret', 'launcher', 'spinal']);
export const HARDPOINT_ACCEPTS = Object.freeze({
  fixed: Object.freeze(['gun', 'turret', 'launcher', 'spinal']),
  ring: Object.freeze(['gun', 'turret']),
});
/** Share of dmg and splash an aimed gun keeps when a turret ring does the aiming. 0.75 -> the
 *  same gun on a fixed hardpoint out-damages its ring twin by a third. */
export const TURRET_RING_OUTPUT = 0.75;

import {
  userContentCandidates, claimUserContentId, acceptUserContent, rejectUserContent,
} from './userContent.js';
import { EMERGENT_WEAPON_DEFS } from './emergentPrimitives.js';
import { SAUCER_WEAPONS } from './saucer.js';

const SHIPPED_WEAPONS = [
  ...SAUCER_WEAPONS,
  {
    id: 'wpn_snarl_s', name: 'Snarl Webcaster', slotType: 'weapon', size: 'S', tier: 3,
    mass: 4, price: 38000, requiresTech: 'tech_fire_control',
    dmg: 3, rof: 0.8, dps: 2.4, damageType: 'ion', energyCost: 10,
    projSpeed: 320, range: 240, tracking: 'fixed', spreadDeg: 0.5,
    heatPerShot: 12, heatMax: 100, heatDissip: 18,
    impulsePerHit: 6, tumbleTorque: 0.2, impulseProvenance: 'snarl_catch',
  },
  // --- SMALL (S slot) ---
  {
    id: 'wpn_pulse_laser_s', name: 'Pulse Laser S', slotType: 'weapon', size: 'S', tier: 1, mass: 2, price: 4500,
    sentence: 'A reliable starter bolt: steady damage, and enough push to slide a light hull off its line.',
    // Starter reliability: a long, readable engagement burst rather than five-shot lockout or
    // infinite fire. Heat is the kit-balance lever against the physics kit — Pulse still dumps
    // a real burst (dmg 5 at 5.5 rps), then a short forced vent, instead of grinding the room
    // forever. Impulse is 5 % of Wasp cruise (mass 16, governed 105 WU/s) per full hit: 84 momentum.
    // ROW 482 (ROCK-GUN, build_map §33.1) "guns become the nudge and the finisher": dmg was 8
    // (dps 44) — that killed a swarm-tier hull (Wasp 55/8/25) in ~2.4 s, FASTER than a committed
    // thrown boulder per hull (~1.8 s at 2 kills/throw), so the optimal swarm play was standing
    // off and grinding. dmg 5 (dps 27.5) puts the starter bolt at ~2× the throw cadence on the
    // wave-1–5 mass hulls — the nudge/finisher role; committed mass is the killer. Swarm rule 1
    // holds: no enemy HP was padded to force this. NPC copies of this gun carry their own
    // dmgOverride in src/data/enemies.js (wasp 6, zealot 4, reaver 6), so NPC lethality is
    // unchanged. Pinned by test/zc-a34-guns-nudge.test.mjs.
    dmg: 5, rof: 5.5, dps: 27.5, damageType: 'energy', energyCost: 2,
    projSpeed: 320, range: 240, tracking: 'fixed', spreadDeg: 0.6,
    heatPerShot: 8, heatMax: 100, heatDissip: 12,
    impulsePerHit: 84, tumbleTorque: 0.05, impulseProvenance: 'starter_pulse_plink',
  },
  {
    id: 'wpn_autocannon_s', name: 'Autocannon S', slotType: 'weapon', size: 'S', tier: 1, mass: 4, price: 5200,
    sentence: 'Armor-chewing slugs that knock light hulls around while they bite.',
    dmg: 14, rof: 2.2, dps: 31, damageType: 'kinetic', energyCost: 1.5,
    projSpeed: 320, range: 240, tracking: 'fixed', spreadDeg: 2.2,
    heatPerShot: 9, heatMax: 100, heatDissip: 28, armorPierce: 0.5,
    impulsePerHit: 28, tumbleTorque: 4, impulseProvenance: 'small_autocannon_slug',
  },
  {
    id: 'wpn_flak_turret_s', name: 'Flak/PD Turret S', slotType: 'weapon', size: 'S', tier: 2, mass: 3, price: 11000,
    mount: 'turret',
    dmg: 4, rof: 8.0, dps: 32, damageType: 'kinetic', energyCost: 1,
    projSpeed: 320, range: 240, tracking: 'auto_turret', turretArcDeg: 180,
    intercepts: true,
    // FB-018: the flag is real — the PD servo loop in countermeasures.js reads these. One
    // battery-wide shot per cooldown inside the turret arc, chance per shot, each kill charging
    // energyCost through the same fields the gun spends when it fires. Not perfect: a fast
    // salvo outlasts the cadence and a flank/rear shot sits outside the arc.
    interceptChance: 0.6, interceptCooldownS: 0.5,
    impulsePerHit: 5, tumbleTorque: 0.6, impulseProvenance: 'flak_fragment',
  },
  {
    // SMALL CONCUSSION CANNON — the light-hardpoint momentum weapon for scouts, interceptors,
    // and starter hulls (Hitch, Kestrel, Wasp) that cannot mount medium hardware. A hit punches
    // a light target with 520 momentum (520 ÷ 16 = 32.5 wu/s on a Wasp, ~31 % of governed cruise),
    // enough to shove it off an attack vector, tumble its firing arc, or slide it into an asteroid.
    // Heavy hulls (mass 120+) shrug it (4.3 wu/s). Trades away almost all damage (dmg 5 at 1.2 rps = 6.0 dps)
    // for directional authority and environmental kills.
    id: 'wpn_concussion_cannon_s', name: 'Concussion Cannon S', slotType: 'weapon', size: 'S', tier: 1, mass: 3, price: 9500,
    sentence: 'A light kicker slug that trades raw damage for pure momentum: one punch sends a light fighter tumbling into a rock.',
    // ROW 482 (ROCK-GUN, build_map §33.1), 2026-10-23: dmg was 6 (dps 7.2). The starter pulse's
    // retune to the nudge role (dmg 8 -> 5, dps 44 -> 27.5) moved the WF-05 authored bar
    // "concussion dps < 25% of the starter's" to 6.875, so the concussion follows its own
    // identity — "the collision is the payoff" — down one notch rather than sitting above the
    // fraction. The shove (impulsePerHit 520, tumbleTorque 35) is untouched: this gun's job is
    // the nudge that starts the impact kill, exactly row 482's guns role. Pinned by
    // test/concussion-cannon-s.test.mjs and test/zc-a34-guns-nudge.test.mjs.
    dmg: 5, rof: 1.2, dps: 6.0, damageType: 'kinetic', energyCost: 3,
    projSpeed: 320, range: 240, tracking: 'fixed', spreadDeg: 1.0,
    heatPerShot: 10, heatMax: 100, heatDissip: 24,
    impulsePerHit: 520, environmentImpulsePerHit: 1024, tumbleTorque: 35, impulseProvenance: 'concussion_slug_s',
  },

  // --- MEDIUM (M slot) ---
  {
    id: 'wpn_pulse_laser_m', name: 'Pulse Laser M', slotType: 'weapon', size: 'M', tier: 2, mass: 5, price: 14000, requiresTech: 'tech_beam_focusing',
    sentence: 'The starter bolt, one size heavier: every hit shoves a light hull visibly.',
    dmg: 12, rof: 6.0, dps: 72, damageType: 'energy', energyCost: 4,
    projSpeed: 340, range: 260, tracking: 'fixed', spreadDeg: 0.6,
    // Impulse is 7.5 % of Wasp cruise (mass 16, governed 105 WU/s) per full hit: 126 momentum —
    // the starter plink scaled up with the damage (S: 84). Every direct upgrade in the kit
    // raises the shove with the DPS; the energy family is no exception.
    impulsePerHit: 126, tumbleTorque: 0.12, impulseProvenance: 'medium_pulse_bolt',
  },
  {
    id: 'wpn_bank_stream_m', name: 'Bank Stream M', slotType: 'weapon', size: 'M', tier: 2, mass: 7, price: 16000, requiresTech: 'tech_kinetic_drivers',
    sentence: 'A bright fixed stream. Banks off stone. Each shot is light; the ribbon is the gun.',
    dmg: 5.14, rof: 14, dps: 71.96, damageType: 'kinetic', energyCost: 0.6,
    projSpeed: 520, range: 280, tracking: 'fixed', spreadDeg: 0.8,
    heatPerShot: 4, heatMax: 100, heatDissip: 36, armorPierce: 0.35,
    impulsePerHit: 12, tumbleTorque: 1.2, impulseProvenance: 'bank_stream',
  },
  {
    id: 'wpn_autocannon_m', name: 'Heavy Autocannon M', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 19000, requiresTech: 'tech_kinetic_drivers',
    sentence: 'A heavier slug: rock-and-shove on lights, honest damage on plates.',
    dmg: 18, rof: 4.0, dps: 72, damageType: 'kinetic', energyCost: 2,
    projSpeed: 340, range: 260, tracking: 'fixed', spreadDeg: 1.6,
    heatPerShot: 14, heatMax: 100, heatDissip: 28, armorPierce: 0.5,
    impulsePerHit: 48, tumbleTorque: 7, impulseProvenance: 'heavy_autocannon_slug',
  },
  {
    id: 'unique_ironsong_ac', baseId: 'wpn_autocannon_m', name: 'Ironsong AC', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 0,
    sentence: 'The heavy slug tuned faster and tighter: same rock-and-shove, more of it per second.',
    dmg: 16.2, rof: 4.8, dps: 77.76, damageType: 'kinetic', energyCost: 2,
    projSpeed: 340, range: 260, tracking: 'fixed', spreadDeg: 1.0,
    heatPerShot: 14, heatMax: 100, heatDissip: 28, armorPierce: 0.5,
    purchasable: false, unique: true, salvageOnly: true,
    variantBonuses: { rateOfFirePct: 0.20, damagePct: -0.10, spreadDeg: 1.0 },
    impulsePerHit: 44, tumbleTorque: 8, impulseProvenance: 'ironsong_burst_slug',
  },
  {
    id: 'wpn_beam_laser_m', name: 'Beam Laser M', slotType: 'weapon', size: 'M', tier: 3, mass: 7, price: 22000, requiresTech: 'tech_beam_focusing',
    sentence: 'A continuous cut that leans on whatever it holds.',
    dmg: 60, rof: 0, dps: 60, damageType: 'energy', energyCost: 14,
    projSpeed: Infinity, range: 240, tracking: 'hitscan',
    continuous: true, heatPerSec: 55, heatMax: 100, heatDissip: 22,
    impulsePerHit: 10, tumbleTorque: 0.8, impulseProvenance: 'light_beam_pressure',
  },
  {
    id: 'unique_veil_cutter', baseId: 'wpn_beam_laser_m', name: 'Veil-Cutter', slotType: 'weapon', size: 'M', tier: 3, mass: 7, price: 0,
    sentence: 'The beam tuned longer and cleaner: the same patient cut, leaning harder.',
    dmg: 60, rof: 0, dps: 60, damageType: 'energy', energyCost: 14,
    projSpeed: Infinity, range: 276, tracking: 'hitscan', spreadDeg: 0.3,
    continuous: true, heatPerSec: 66, heatMax: 100, heatDissip: 22,
    purchasable: false, unique: true, salvageOnly: true,
    variantBonuses: { rangePct: 0.15, spreadDeg: 0.3, heatPerSecPct: 0.20 },
    impulsePerHit: 12, tumbleTorque: 1.2, impulseProvenance: 'veil_cutter_pressure',
  },
  {
    id: 'wpn_railgun_m', name: 'Railgun M', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 21000, requiresTech: 'tech_kinetic_drivers',
    sentence: 'A long, honest spear: punches plates at range and staggers whatever survives.',
    mount: 'spinal',
    dmg: 60, rof: 0.8, dps: 48, damageType: 'kinetic', energyCost: 14,
    projSpeed: 700, range: 1100, tracking: 'fixed', armorPierce: 0.5,
    impulsePerHit: 168, tumbleTorque: 16, impulseProvenance: 'railgun_penetrator',
  },
  {
    id: 'wpn_plasma_cannon_m', name: 'Plasma Cannon M', slotType: 'weapon', size: 'M', tier: 3, mass: 8, price: 42000, requiresTech: 'tech_plasma_dynamics',
    sentence: 'Heavy luminous slugs that lean on a hull while they melt it.',
    dmg: 34, rof: 3.0, dps: 102, damageType: 'thermal', energyCost: 9,
    projSpeed: 340, range: 260, tracking: 'fixed', splashRadius: 30,
    impulsePerHit: 36, tumbleTorque: 5, impulseProvenance: 'plasma_pressure',
  },
  {
    id: 'wpn_missile_rack_m', name: 'Missile Rack M', slotType: 'weapon', size: 'M', tier: 2, mass: 7, price: 24000, requiresTech: 'tech_guided_ordnance',
    sentence: 'Fire-and-forget hunters: each hit carries a real shoulder, and they keep coming.',
    mount: 'launcher',
    dmg: 70, splashDmg: 35, splashRadius: 40, rof: 0.8, dps: 56, damageType: 'explosive', energyCost: 4,
    projSpeed: 320, projSpeedMin: 180, range: 280, tracking: 'homing', turnRate: 1.5, lockTimeS: 1.2,
    impulsePerHit: 150, tumbleTorque: 22, impulseProvenance: 'missile_detonation',
  },
  {
    id: 'unique_nestbreaker_rack', baseId: 'wpn_missile_rack_m', name: 'Nestbreaker Rack', slotType: 'weapon', size: 'M', tier: 2, mass: 7, price: 0,
    sentence: 'The missile rack tuned for volume: more hunters in the air and more shoulder per second, each hit a little lighter.',
    mount: 'launcher',
    dmg: 49, splashDmg: 24.5, splashRadius: 40, rof: 0.8, dps: 78.4, damageType: 'explosive', energyCost: 4,
    projSpeed: 320, projSpeedMin: 180, range: 280, tracking: 'homing', turnRate: 1.5, lockTimeS: 1.2,
    splitCount: 2, submunitions: { count: 2, damageMult: 0.70 },
    purchasable: false, unique: true, salvageOnly: true,
    variantBonuses: { submunitionCount: 2, perMissileDamagePct: -0.30 },
    impulsePerHit: 92, tumbleTorque: 15, impulseProvenance: 'nestbreaker_submunition',
  },

  // --- LARGE (L slot) ---
  {
    id: 'wpn_heavy_beam_l', name: 'Heavy Beam L', slotType: 'weapon', size: 'L', tier: 4, mass: 16, price: 130000, requiresTech: 'tech_capital_weapons',
    dmg: 160, rof: 0, dps: 160, damageType: 'energy', energyCost: 22,
    projSpeed: Infinity, range: 900, tracking: 'hitscan',
    continuous: true, heatPerSec: 50, heatMax: 100, heatDissip: 20,
    impulsePerHit: 30, tumbleTorque: 2.5, impulseProvenance: 'heavy_beam_pressure',
    // RW-01: a sustained siege-class beam answers on the shooter too. Full strength reaches the
    // hull (player_maneuver provenance); a taut winch brace against a massive anchor routes the
    // along-line component into line load instead.
    recoilImpulsePerSec: 2000,
  },
  {
    id: 'unique_lighthouse_heavy_beam', baseId: 'wpn_heavy_beam_l', name: 'Lighthouse Heavy Beam', slotType: 'weapon', size: 'L', tier: 4, mass: 16, price: 0,
    dmg: 200, rof: 0, dps: 200, damageType: 'energy', energyCost: 22,
    projSpeed: Infinity, range: 1035, tracking: 'hitscan',
    continuous: true, heatPerSec: 67.5, heatMax: 100, heatDissip: 20,
    purchasable: false, unique: true, salvageOnly: true,
    variantBonuses: { damagePct: 0.25, rangePct: 0.15, heatPerSecPct: 0.35 },
    impulsePerHit: 38, tumbleTorque: 3.5, impulseProvenance: 'lighthouse_beam_pressure',
    recoilImpulsePerSec: 2500,
  },
  {
    id: 'wpn_torpedo_l', name: 'Torpedo L', slotType: 'weapon', size: 'L', tier: 4, mass: 24, price: 60000, requiresTech: 'tech_capital_weapons',
    mount: 'launcher',
    dmg: 320, splashDmg: 120, splashRadius: 70, rof: 0.25, dps: 80, damageType: 'explosive', energyCost: 10,
    projSpeed: 240, projSpeedMin: 140, range: 1400, tracking: 'homing', turnRate: 1.4, lockTimeS: 2.5,
    impulsePerHit: 320, tumbleTorque: 48, impulseProvenance: 'torpedo_detonation',
  },
  {
    id: 'wpn_siege_lance_l', name: 'Siege Lance L', slotType: 'weapon', size: 'L', tier: 5, mass: 24, price: 310000, requiresTech: 'tech_flagship_command',
    mount: 'spinal',
    dmg: 420, rof: 0.5, dps: 210, damageType: 'kinetic', energyCost: 40,
    projSpeed: 600, range: 1600, tracking: 'fixed', armorPierce: 0.5,
    impulsePerHit: 420, tumbleTorque: 64, impulseProvenance: 'siege_lance_impact',
    // RW-01: one spinal shot, one real shove on the firing hull — braceable through a taut line.
    recoilImpulse: 340,
  },
  {
    // EMP Disruptor (spec §9 weapon-verb variety): a distinct DISABLE verb. Unlike hull weapons, it
    // routes ALL damage to subsystems (subsystemShare 1.0) and bypasses hull entirely — its purpose
    // is to cripple capability (drive/weapon/sensor/power), not to destroy the ship. EMP damage is
    // heavily resisted by armor but ignores shields (it couples through them), making it the
    // counter to shield-turtling and the enabler of capture/disable play.
    id: 'wpn_emp_disruptor_m', name: 'EMP Disruptor M', slotType: 'weapon', size: 'M', tier: 3, mass: 6, price: 36000, requiresTech: 'tech_plasma_dynamics',
    sentence: 'A rude, crackling blow: shields buckle and the shot leans on the hull behind them.',
    dmg: 45, rof: 1.5, dps: 68, damageType: 'emp', energyCost: 11,
    projSpeed: 340, range: 260, tracking: 'fixed', spreadDeg: 1.0,
    subsystemShare: 1.0, shieldBypass: 1.0,
    impulsePerHit: 14, tumbleTorque: 10, impulseProvenance: 'emp_attitude_spike',
  },
  {
    // GRAVITY MARKER — low-damage setup tool for the existing Well/Repulsor/Cone kernel. A landed
    // shot leaves a six-second simulation status that triples well/sink coupling; merely selecting
    // a target does nothing. The cyan disruption projectile and persistent contracting world marker
    // make the state readable without adding an asset or changing the default fit.
    // Retired from sale (owner 2026-10-22): the PULL power marks the locked target it lands on. Owned copies keep working;
    // the Crucible draft is the swarm seam's to align.
    retiredInto: 'pull',
    id: 'wpn_gravity_marker_s', name: 'Gravity Marker S', slotType: 'weapon', size: 'S', tier: 2, mass: 3, price: 18000, requiresTech: 'tech_graviton_drives',
    sentence: 'Marks a hull so wells and sinks grip it three times as hard.',
    dmg: 3, rof: 0.25, dps: 0.75, damageType: 'emp', energyCost: 7,
    projSpeed: 320, range: 240, tracking: 'fixed', spreadDeg: 0.5,
    impulsePerHit: 1, tumbleTorque: 0.08, impulseProvenance: 'gravity_marker_ping',
    statuses: [{ id: 'status_gravity_marked', stacks: 1 }],
  },
  {
    // MOMENTUM SINK — two reads from one latch. A landed hit on a ship still binds that target to
    // the shooter's translational frame (combat kernel damper). A landed hit on a rock plants a
    // bungee on the shooter: burn away to store receding speed, then release (second trigger or
    // the four-second window) and slingshot back at ≥ 2× that speed. The setup round stays a ping;
    // the weapon never writes speed caps, brakes, facing, or controls.
    // Retired from sale (owner 2026-10-22): the Line latches a target and slingshots off a rock. Owned copies keep working;
    // the Crucible draft is the swarm seam's to align.
    retiredInto: 'line',
    id: 'wpn_momentum_sink_s', name: 'Momentum Sink S', slotType: 'weapon', size: 'S', tier: 2, mass: 3, price: 21000, requiresTech: 'tech_graviton_drives',
    sentence: 'Latches a target to your frame — or slingshots you off a rock.',
    dmg: 3, rof: 0.2, dps: 0.6, damageType: 'emp', energyCost: 9,
    projSpeed: 320, range: 240, tracking: 'fixed', spreadDeg: 0.45,
    impulsePerHit: 1, tumbleTorque: 0.08, impulseProvenance: 'momentum_sink_latch',
    statuses: [{ id: 'status_momentum_sink', stacks: 1 }],
  },
  {
    // INERTIAL SHUNT — the ram plate. A fitted hull that hits another ship dumps its closing
    // speed into them, mass-bounded: a wasp flies a screen, you stop; a gunship shrugs. The
    // ping is only a catalog hit-confirm; the payoff is the contact, never a DPS grind.
    // Retired from sale (owner 2026-10-22): the ram plate module turns closing speed into the hit. Owned copies keep working;
    // the Crucible draft is the swarm seam's to align.
    retiredInto: 'mod_ram_plate',
    id: 'wpn_inertial_shunt_s', name: 'Inertial Shunt S', slotType: 'weapon', size: 'S', tier: 2, mass: 4, price: 24000, requiresTech: 'tech_graviton_drives',
    sentence: 'The ram plate: your closing speed becomes their problem.',
    dmg: 3, rof: 0.2, dps: 0.6, damageType: 'kinetic', energyCost: 8,
    projSpeed: 320, range: 240, tracking: 'fixed', spreadDeg: 0.6,
    impulsePerHit: 1, tumbleTorque: 0.08, impulseProvenance: 'inertial_shunt_ping',
  },

  // --- PHYSICS-FIRST FAMILY (SF-10 / STEP 9): three setup/payoff verbs on the PQ-009 impulse
  // kernel. They read mechanically distinct in flight (see src/render/vfxProfiles.js) and are the
  // light-tier rebalance lever: a light hull (Wasp mass 16, Hornet 24) is picked up and put into
  // terrain, not ground down as an HP sponge, while a mass-anchored heavy (150+) shrugs the same
  // shove. Impulse APPLICATION and the contact payoff are owned by the kernel + collisionConsequences
  // + physics authority; these defs only DECLARE identity (impulsePerHit / tumbleTorque / stable
  // provenance) per PQ-009. Each carries price>0 so it reaches the outfitting shop, and each has a
  // distinct impulseProvenance so its receipt and its VFX identity never collapse onto another family.
  {
    // CONCUSSION CANNON — a heavy, slow, low-damage slug whose payload is MOMENTUM, not damage. A hit
    // shoves the target along the slug line (impulsePerHit ÷ target mass): 920 ÷ 16 = 57.5 wu/s on a
    // Wasp (~54.76 % of governed cruise 105), enough to clear one visible depth in 2 s. 920 ÷ 150
    // ≈ 6.13 wu/s on a gunship stays below tumbleDeltaV (18). The kill comes from the environment,
    // not the gun (STEP 9 forbidden shortcut #1). Helm-loss duration is the universal hitstun law.
    id: 'wpn_concussion_cannon_m', name: 'Concussion Cannon M', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 26000, requiresTech: 'tech_kinetic_drivers',
    sentence: 'The payload is momentum: one hit throws a light hull a screen.',
    dmg: 12, rof: 1.0, dps: 12, damageType: 'kinetic', energyCost: 6,
    projSpeed: 340, range: 260, tracking: 'fixed', spreadDeg: 1.2,
    heatPerShot: 16, heatMax: 100, heatDissip: 26,
    impulsePerHit: 920, environmentImpulsePerHit: 1024, tumbleTorque: 60, impulseProvenance: 'concussion_slug',
  },
  {
    // VECTOR MINE — deployable ordnance whose payload is a RADIAL IMPULSE, not a burn: zero hull
    // damage (design Q9), its cost paid entirely in capacitor + heat at deploy. It lobs off the nose,
    // arms after mineArmS, then any ship/drone that enters mineTriggerRadius — INCLUDING the owner —
    // detonates it, shoving every body inside mineBlastRadius outward with a mass-scaled kick. Enemies
    // scatter; a pilot who drops one and dives back through it gets blast-yourself mobility (STEP 9
    // forbidden shortcut #3: a mine that does not move the player). Fired via the weapons DEPLOY verb,
    // never as a projectile — impulsePerHit is the blast momentum the detonation imparts through the
    // physics authority (756 at centre = 45 % of Wasp cruise). dmg 0 is honest: the mine throws,
    // it does not damage.
    id: 'wpn_vector_mine_m', name: 'Vector Mine M', slotType: 'weapon', size: 'M', tier: 2, mass: 7, price: 22000, requiresTech: 'tech_guided_ordnance',
    sentence: 'A dropped scatter charge: shoves every hull nearby, damages none.',
    mount: 'launcher',
    dmg: 0, rof: 0.5, dps: 0, damageType: 'kinetic', energyCost: 22,
    projSpeed: 90, range: 260, tracking: 'deploy',
    heatPerShot: 34, heatMax: 100, heatDissip: 22,
    deployKind: 'vector_mine', mineArmS: 1.4, mineTriggerRadius: 60, mineBlastRadius: 150, mineLifeS: 30, mineMaxActive: 3,
    impulsePerHit: 756, tumbleTorque: 24, impulseProvenance: 'vector_mine_pulse',
  },
  {
    // GRAVITY WELLHEAD — a deployed sustained pull, not a detonation. Same DEPLOY fire path and
    // entity lifecycle as the vector mine (arms after mineArmS, dies at mineLifeS), but instead of
    // one radial kick it drags every ship/drone inside mineBlastRadius toward itself for its whole
    // life at up to mineWellPull WU/s² with distance falloff — INCLUDING the owner, because the
    // well does not know friend from mass. dmg 0 is honest: nothing here damages; the fight is
    // repositioned, then finished with whatever else you carry. Fired on the same key as the mine.
    // Retired from sale (owner 2026-10-22): the PULL power is the well. Owned copies keep working;
    // the Crucible draft is the swarm seam's to align.
    retiredInto: 'pull',
    id: 'wpn_gravity_well_m', name: 'Gravity Wellhead M', slotType: 'weapon', size: 'M', tier: 3, mass: 8, price: 38000, requiresTech: 'tech_graviton_drives',
    sentence: 'A sustained pull that drags the whole fight toward one point.',
    mount: 'launcher',
    dmg: 0, rof: 0.25, dps: 0, damageType: 'kinetic', energyCost: 26,
    projSpeed: 90, range: 260, tracking: 'deploy',
    heatPerShot: 30, heatMax: 100, heatDissip: 20,
    deployKind: 'gravity_well', mineArmS: 1.2, mineTriggerRadius: 0, mineBlastRadius: 300, mineLifeS: 6, mineMaxActive: 2,
    mineWellPull: 62, tumbleTorque: 0, impulseProvenance: 'gravity_well_pull',
  },
  {
    // RCS DISRUPTOR — a subsystem-coupling spike that couples through shields like the EMP disruptor
    // (subsystemShare/shieldBypass) and, for a bounded window (rcsDisruptS), suppresses the target's
    // attitude control: it drifts, cannot hold a firing line, and slides into your tether arc. It
    // REUSES the existing tumble-owner pattern — weapons runs last before physics, so it overwrites
    // the AI's control command for the window and damps intent (no new status-effect framework) — and
    // it is triggered off the PQ-009 provenance the hit leaves ('rcs_disruptor_spike'). Distinct from
    // the concussion cannon: it does NOT throw the ship, it removes its steering. Low hull damage —
    // this is a disable verb, not a killer.
    id: 'wpn_rcs_disruptor_m', name: 'RCS Disruptor M', slotType: 'weapon', size: 'M', tier: 3, mass: 6, price: 34000, requiresTech: 'tech_plasma_dynamics',
    sentence: 'Steals the target’s steering for seconds: a hull that cannot aim is almost ammunition.',
    dmg: 16, rof: 1.4, dps: 22.4, damageType: 'emp', energyCost: 10,
    projSpeed: 340, range: 260, tracking: 'fixed', spreadDeg: 1.0,
    subsystemShare: 0.85, shieldBypass: 1.0, rcsDisruptS: 1.6,
    impulsePerHit: 10, tumbleTorque: 4, impulseProvenance: 'rcs_disruptor_spike',
  },
  {
    // PQ-133.11 — Foundry salvage pulse. Bank Shot + Bank Relay are baked so Hitch (one utility)
    // can still fly volley+bank+chain when Twin Mount occupies the utility slot.
    id: 'unique_mirrorjaw_pulse', baseId: 'wpn_pulse_laser_s', name: 'Mirrorjaw Pulse', slotType: 'weapon', size: 'S', tier: 2, mass: 2, price: 0,
    sentence: 'The starter bolt reborn meaner: the same push, faster and meaner on the follow-up.',
    // dmg follows the row-482 rock-gun retune of its base (was 8): the unique stays the starter
    // bolt (heat 5 + Bank Shot/Relay), not a return of the pre-tune grind gun.
    dmg: 5, rof: 5.5, dps: 27.5, damageType: 'energy', energyCost: 2,
    projSpeed: 320, range: 240, tracking: 'fixed', spreadDeg: 0.6,
    heatPerShot: 5, heatMax: 100, heatDissip: 12,
    impulsePerHit: 84, tumbleTorque: 0.05, impulseProvenance: 'starter_pulse_plink',
    purchasable: false, unique: true, salvageOnly: true,
    attackTraits: ['mod_bank_shot', 'mod_bank_relay'],
  },

  // ─── SEED-SW-17 … 23 — Swarm/Crucible armory weapons ──────────────────────────────
  // Seven authored armory verbs. Structural fields (`volley`, `hullRicochet`, `swarmSeekers`,
  // `mortarShell`, `debrisOrbit`, `returnArc`) are consumed by src/systems/weapons.js at the
  // existing spawn/hit/tick seams; chain, bounce, pierce and fan geometry ride the compiled
  // AttackSpec machinery (emergentChain / emergentBounces / attackTraits).
  {
    // SEED-SW-18 — ricochet sawblades that carom between hostile bodies (NOT rock banks:
    // `hullRicochet` spends the same authored bounce budget on entity contacts).
    id: 'wpn_disc_launcher_m', name: 'Disc Launcher', slotType: 'weapon', size: 'M', tier: 3, mass: 6, price: 34000,
    dmg: 14, rof: 1.6, dps: 22.4, damageType: 'kinetic', energyCost: 9,
    projSpeed: 300, range: 420, tracking: 'fixed',
    heatPerShot: 12, heatMax: 60, heatDissip: 14,
    impulsePerHit: 18, tumbleTorque: 10, impulseProvenance: 'disc_ricochet',
    hullRicochet: true,
    attackTraits: [['mod_bank_shot', 3], 'mod_smart_bank'],
    lineageGenerationMax: 3,
    sentence: 'A sawblade that caroms off one hull into the next until the edge is spent.',
    swarmReason: 'The disc keeps a hit for every hull it can reach.',
  },
  {
    // SEED-SW-19 — one trigger fans out six small guided missiles, each hunting its own hull.
    id: 'wpn_micro_barrage_m', name: 'Micro-missile Barrage', slotType: 'weapon', size: 'M', tier: 3, mass: 7, price: 36000,
    requiresTech: 'tech_guided_ordnance',
    dmg: 4, rof: 0.9, dps: 21.6, damageType: 'explosive', energyCost: 12,
    projSpeed: 300, projSpeedMin: 160, range: 300, tracking: 'homing', turnRate: 2.2, lockTimeS: 0.8,
    heatPerShot: 14, heatMax: 60, heatDissip: 14,
    impulsePerHit: 8, tumbleTorque: 3, impulseProvenance: 'micro_seeker_burst',
    volley: { count: 6, spreadDeg: 60 }, swarmSeekers: true,
    sentence: 'One trigger — a fan of small missiles that pick their own hulls.',
    swarmReason: 'A pull releases a whole flight; the pack shares the volley.',
  },
  {
    // SEED-SW-20 — a short-range fan of plasma bolts: five roots across a cone, dead past its reach.
    id: 'wpn_plasma_cone_s', name: 'Plasma Cone', slotType: 'weapon', size: 'S', tier: 2, mass: 4, price: 26000,
    dmg: 5, rof: 1.8, dps: 45, damageType: 'thermal', energyCost: 9,
    projSpeed: 260, range: 150, tracking: 'fixed',
    heatPerShot: 13, heatMax: 60, heatDissip: 16,
    impulsePerHit: 6, tumbleTorque: 1, impulseProvenance: 'plasma_cone_fan',
    volley: { count: 5, spreadDeg: 44 },
    sentence: 'A fan of plasma bolts that dies inside knife range.',
    swarmReason: 'A cone of plasma for the fights that get close.',
  },
  {
    // SEED-SW-21 — a lobbed shell; its landing point runs a brief pull field, then detonates.
    id: 'wpn_singularity_mortar_m', name: 'Singularity Mortar', slotType: 'weapon', size: 'M', tier: 4, mass: 8, price: 42000,
    dmg: 6, rof: 0.7, dps: 4.2, damageType: 'explosive', energyCost: 14,
    projSpeed: 190, range: 260, tracking: 'fixed',
    heatPerShot: 16, heatMax: 60, heatDissip: 12,
    impulsePerHit: 10, tumbleTorque: 4, impulseProvenance: 'singularity_mortar',
    mortarShell: { pullS: 1.1, pullRadius: 170, pull: 95, blastRadius: 150, blastDmg: 24, impulse: 460 },
    sentence: 'A lobbed shell that drags the pack into a knot, then pops.',
    swarmReason: 'The shell lands, the room slides inward, then it bursts.',
  },
  {
    // SEED-SW-22 — claims loose rocks near the ship into a shield ring riding the latch constraint.
    id: 'wpn_debris_orbit_s', name: 'Debris Orbit', slotType: 'weapon', size: 'S', tier: 3, mass: 5, price: 32000,
    dmg: 4, rof: 1.4, dps: 5.6, damageType: 'kinetic', energyCost: 6,
    projSpeed: 300, range: 280, tracking: 'fixed',
    heatPerShot: 8, heatMax: 60, heatDissip: 14,
    impulsePerHit: 10, tumbleTorque: 2, impulseProvenance: 'debris_orbit_ring',
    debrisOrbit: { maxRocks: 4, captureRadius: 170, ringRadius: 34, rockSpeed: 2.4 },
    sentence: 'Loose rocks near the hull get lashed into a circling shield.',
    swarmReason: 'The room’s own debris becomes your armour ring.',
  },
  {
    // SEED-SW-23 — flies out, carves back through the thrower once, hits on each pass.
    id: 'wpn_glaive_s', name: 'Glaive', slotType: 'weapon', size: 'S', tier: 3, mass: 4, price: 33000,
    dmg: 12, rof: 1.1, dps: 13.2, damageType: 'kinetic', energyCost: 8,
    projSpeed: 320, range: 300, tracking: 'fixed',
    heatPerShot: 11, heatMax: 60, heatDissip: 14,
    impulsePerHit: 14, tumbleTorque: 8, impulseProvenance: 'glaive_return',
    returnArc: { legRange: 140 },
    attackTraits: [['mod_piercing_core', 2]],
    lineageGenerationMax: 2,
    sentence: 'Flies out, carves back through you — a hit on each pass.',
    swarmReason: 'The bolt comes back; whatever stands in the return path eats it.',
  },
  ...EMERGENT_WEAPON_DEFS,
];

// ─────────────────────────────── user content (PQ-172.00) ───────────────────────────────
// User-dropped JSON weapon records merge onto the shipped table here, at module-eval time, so
// every consumer that snapshots WEAPONS (ships.js Maps etc.) sees the complete set. Validation
// is the same contract the shipped records above satisfy by hand: required combat fields, the
// same vocab sets, known keys only (a misspelled key must fail loudly, not load as a weaker gun).
// Rejected records are reported per-mod via listUserMods() — they never reach WEAPONS.

const USER_WEAPON_KEYS = new Set([
  'id', 'name', 'slotType', 'size', 'tier', 'mass', 'price', 'requiresTech', 'baseId',
  'dmg', 'dps', 'rof', 'damageType', 'energyCost', 'projSpeed', 'projSpeedMin', 'range',
  'tracking', 'spreadDeg', 'mount', 'turretArcDeg', 'lockTimeS', 'turnRate',
  'heatPerShot', 'heatPerSec', 'heatMax', 'heatDissip', 'continuous',
  'impulsePerHit', 'environmentImpulsePerHit', 'tumbleTorque', 'impulseProvenance',
  'armorPierce', 'shieldBypass', 'subsystemShare', 'rcsDisruptS',
  'splashDmg', 'splashRadius', 'splitCount', 'submunitions',
  'ammo', 'intercepts', 'statuses', 'attackTraits',
  'deployKind', 'mineArmS', 'mineTriggerRadius', 'mineBlastRadius', 'mineLifeS', 'mineMaxActive', 'mineWellPull',
  'purchasable', 'unique', 'salvageOnly', 'variantBonuses',
  'sentence',
]);
export { USER_WEAPON_KEYS };

// The point-of-sale shove metric: impulsePerHit earns a row on the outfitting screen only when
// it is a real part of the weapon's answer (>= 10 momentum). Setup-tool pings (1) and flak
// fragments (5) read honest without it — their verbs are the status, the contact, or the burst.
export const SHOVE_METRIC_MIN = 10;
export function shoveMetricValue(def) {
  const n = Number(def && def.impulsePerHit);
  return Number.isFinite(n) && n >= SHOVE_METRIC_MIN ? n : null;
}
const USER_WEAPON_DAMAGE_TYPES = new Set(['energy', 'kinetic', 'explosive', 'thermal', 'ion', 'emp']);
const USER_WEAPON_TRACKING = new Set(['fixed', 'auto_turret', 'homing', 'hitscan', 'deploy']);
const USER_WEAPON_SIZES = new Set(['S', 'M', 'L']);

function userWeaponProblem(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return 'record must be an object';
  for (const key of Object.keys(rec)) {
    if (!USER_WEAPON_KEYS.has(key)) return `unknown field "${key}"`;
  }
  if (typeof rec.id !== 'string' || !/^(wpn|unique)_[a-z0-9_]+$/.test(rec.id)) {
    return 'id must match wpn_* or unique_*';
  }
  if (typeof rec.name !== 'string' || !rec.name.trim()) return 'name is required';
  if (rec.slotType !== 'weapon') return 'slotType must be "weapon" (module records belong in modules/)';
  if (!USER_WEAPON_SIZES.has(rec.size)) return 'size must be S, M, or L';
  if (!Number.isInteger(rec.tier) || rec.tier < 1 || rec.tier > 5) return 'tier must be an integer 1-5';
  for (const f of ['mass', 'price', 'dmg', 'rof', 'energyCost', 'projSpeed', 'range']) {
    if (typeof rec[f] !== 'number' || !Number.isFinite(rec[f]) || rec[f] < 0) {
      return `${f} must be a non-negative number`;
    }
  }
  if (!rec.rof) return 'rof must be > 0';
  if (!USER_WEAPON_DAMAGE_TYPES.has(rec.damageType)) {
    return `damageType must be one of ${[...USER_WEAPON_DAMAGE_TYPES].join(', ')}`;
  }
  if (!USER_WEAPON_TRACKING.has(rec.tracking)) {
    return `tracking must be one of ${[...USER_WEAPON_TRACKING].join(', ')}`;
  }
  if (rec.mount != null && !WEAPON_MOUNT_CLASSES.includes(rec.mount)) {
    return `mount must be one of ${WEAPON_MOUNT_CLASSES.join(', ')}`;
  }
  if (rec.requiresTech != null && (typeof rec.requiresTech !== 'string' || !rec.requiresTech.startsWith('tech_'))) {
    return 'requiresTech must be a tech_* id';
  }
  if (rec.ammo != null && (typeof rec.ammo !== 'string' || !rec.ammo.startsWith('cmdty_'))) {
    return 'ammo must be a cmdty_* id';
  }
  if (rec.baseId != null && typeof rec.baseId !== 'string') return 'baseId must be a string id';
  for (const f of ['purchasable', 'unique', 'salvageOnly', 'continuous', 'intercepts']) {
    if (rec[f] != null && typeof rec[f] !== 'boolean') return `${f} must be a boolean`;
  }
  for (const f of ['statuses', 'attackTraits', 'submunitions']) {
    if (rec[f] != null && !Array.isArray(rec[f])) return `${f} must be an array`;
  }
  if (rec.variantBonuses != null && (typeof rec.variantBonuses !== 'object' || Array.isArray(rec.variantBonuses))) {
    return 'variantBonuses must be an object';
  }
  return null;
}

function mergeUserWeapons(base) {
  const candidates = userContentCandidates('weapons');
  if (!candidates.length) return base;   // no payload → the shipped array, untouched
  const takenIds = new Set(base.map((w) => w.id));
  const merged = [...base];
  for (const cand of candidates) {
    const rec = cand.record;
    const problem = userWeaponProblem(rec)
      || claimUserContentId('weapons', rec.id, cand.modId, takenIds)
      || (rec.baseId && !takenIds.has(rec.baseId) && !merged.some((w) => w.id === rec.baseId)
        ? `baseId "${rec.baseId}" does not resolve to a known weapon` : null);
    if (problem) {
      rejectUserContent(cand.modId, 'weapons', rec && rec.id, problem, cand.file);
      continue;
    }
    merged.push(rec);
    acceptUserContent(cand.modId, 'weapons', rec.id, cand.file);
  }
  return merged;
}

export const WEAPONS = mergeUserWeapons(SHIPPED_WEAPONS);
