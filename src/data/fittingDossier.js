// Fitting dossier (swarm setup UX): what every armory/draft pick actually IS.
//
// The offer card carries a verb and one authored line; the dossier carries the rest —
// a plain-language description of the behavior, a usage note, the mechanical figures,
// and the showcase clip captured from the live sim (assets/ui/fitting-media/).
//
// `detail` = what it does, in play. `tip` = when it's the right pick. Both stay out of
// the offer's `blurb` field so the draft-shape audit keeps reading one clean line.
//
// Pure data + pure derivation: no bus, no DOM, no RNG.

import { WEAPONS } from './weapons.js';
import { MODULES } from './modules.js';
import { SHIPS } from './ships.js';
import { FITTING_MEDIA_IDS } from './fittingMediaManifest.js';

const WEAPON_BY_ID = new Map(WEAPONS.map((d) => [d.id, d]));
const MODULE_BY_ID = new Map(MODULES.map((d) => [d.id, d]));
const SHIP_BY_ID = new Map(SHIPS.map((d) => [d.id, d]));

// Same root-relative URL pattern as hullPosters: survives file:// and bundling alike.
const FITTING_MEDIA_ROOT = new URL('../../assets/ui/fitting-media/', import.meta.url).href;

/** Clip + poster for a fitting, only when the showcase actually captured one —
 *  manifest-driven so a fitting with no clip falls straight through to the schematic. */
export function fittingMedia(defId) {
  if (typeof defId !== 'string' || !defId || !FITTING_MEDIA_IDS.has(defId)) return null;
  return {
    clip: `${FITTING_MEDIA_ROOT}${defId}.webm`,
    poster: `${FITTING_MEDIA_ROOT}${defId}.png`,
  };
}

// ---------------------------------------------------------------------------
// Authored dossier copy. One entry per swarm-shelf defId; `detail` and `tip` are
// what the inspector shows under the clip. Keep each a sentence or two — the stat
// chips carry the numbers.
// ---------------------------------------------------------------------------

export const FITTING_DOSSIER = Object.freeze({
  // ---- weapons ---------------------------------------------------------------
  wpn_snarl_s: {
    detail: 'Fires a slow adhesive web that tangles hulls which pass through it. Webbed enemies drag against each other and are easy to shove.',
    tip: 'Control weapon — web a pack first, then anything that pushes them around works twice as hard.',
  },
  wpn_pulse_laser_s: {
    detail: 'Rapid energy bolts in a straight line. Reliable damage at knife range, with a light push behind each hit.',
    tip: 'The honest starter gun — cheap to run and easy to aim.',
  },
  wpn_autocannon_s: {
    tip: 'Low tier but the push adds up — small ships get juggled while you hold the trigger.',
  },
  wpn_flak_turret_s: {
    detail: 'A self-aiming turret that answers whatever is in reach — incoming shots and missiles included.',
    tip: 'It shoots on its own. Park it in the bay and let it screen while you fly.',
  },
  wpn_concussion_cannon_s: {
    tip: 'Bounce them off the terrain; the rock finishes the kill.',
  },
  wpn_pulse_laser_m: {
    detail: 'The pulse laser one size up: faster bolts, more push per hit, and a real appetite for capacitor.',
    tip: 'The default answer to "what do I put on a medium hardpoint".',
  },
  wpn_bank_stream_m: {
    detail: 'A ribbon of light projectiles that ricochet off stone and hull alike. Each pellet is weak — the stream is the point.',
    tip: 'Shoot around corners. A wall between you and the pack is a firing angle, not cover.',
  },
  wpn_autocannon_m: {
    detail: 'Heavy armor-chewing slugs in a continuous stream. Honest damage on plated hulls, real knockback on light ones.',
    tip: 'Pair it with a heatsink — the drum runs hot under a long hold.',
  },
  wpn_beam_laser_m: {
    detail: 'A held cutting beam that pays out damage every second the line stays on target.',
    tip: 'Lead less, hold longer — sweep it through a swarm line and keep it burning.',
  },
  wpn_railgun_m: {
    detail: 'A hypervelocity slug that punches through armor and keeps going out to four times gun range.',
    tip: 'The long-arm pick — engage packs before they can reach you.',
  },
  wpn_plasma_cannon_m: {
    detail: 'Heavy luminous slugs with splash. A hit leaves the hull cooking — burning damage lingers after impact.',
    tip: 'The highest dps on the shelf per shot; splash means near-misses still count.',
  },
  wpn_missile_rack_m: {
    detail: 'Lock on and release a homing missile that steers itself into the target — works even after you stop pointing at it.',
    tip: 'Lock takes about a second. Fire a pair and turn away — they finish the chase themselves.',
  },
  wpn_heavy_beam_l: {
    detail: 'A capital-scale continuous lance. Damage rolls in as long as the beam is held on the hull.',
    tip: 'The big-hull answer — burn down a boss or a station while you hold the line.',
  },
  wpn_torpedo_l: {
    detail: 'A long-range homing torpedo with a fat warhead. Slow to lock, slower to fly, devastating on arrival.',
    tip: 'Fire from deep range and let it run — it out-reaches everything on the field.',
  },
  wpn_siege_lance_l: {
    detail: 'A fixed spinal slug — the hardest single hit in the catalog, at extreme range.',
    tip: 'Aim the ship, not the reticle. One shot opens a fight at a screen\'s distance.',
  },
  wpn_emp_disruptor_m: {
    detail: 'An ionizing burst that couples through shields: sensors and guns flicker dark before the hull even reads damage.',
    tip: 'Open with it — a blinded, disarmed target is half a kill already.',
  },
  wpn_gravity_marker_s: {
    detail: 'A tagging round: the marked hull is gripped three times as hard by every well and gravity field nearby.',
    tip: 'Paint one hull, drop a well, watch it pin the marked target while the rest scatter.',
  },
  wpn_momentum_sink_s: {
    detail: 'A binding shot that couples the target\'s momentum to yours — or slingshots you off an anchor mass.',
    tip: 'A boarding tool and an escape trick in one gun.',
  },
  wpn_inertial_shunt_s: {
    detail: 'Turns your closing speed into damage — the faster you arrive, the harder the hit lands.',
    tip: 'Boost into the shot: speed is the ammunition.',
  },
  wpn_concussion_cannon_m: {
    detail: 'A heavy throw charge that hurls a light hull across the screen — the wall behind it finishes the job.',
    tip: 'Position so the throw lands on rock; momentum does the killing.',
  },
  wpn_vector_mine_m: {
    detail: 'Drops a smart charge that detonates into a directional shove — throws the whole lane, friend and foe alike.',
    tip: 'Seeding your own wake punishes pursuers; the blast is honest about who\'s standing in it.',
  },
  wpn_gravity_well_m: {
    detail: 'Deploys a sustained gravity sink that drags every nearby hull toward the pocket — a slow pull that owns the fight.',
    tip: 'Drop it mid-pack and fly the edge: the swarm bunches up where your guns want them.',
  },
  wpn_rcs_disruptor_m: {
    detail: 'Ionizes the target\'s steering thrusters — for a few seconds it cannot turn or hold a line.',
    tip: 'A drifting enemy takes every hit you send it and shoves like a wreck.',
  },
  wpn_sticky_detonator: {
    detail: 'Fires a charge that sticks to the hull it touches — then detonates on your signal.',
    tip: 'Stick the swarm\'s biggest hull, let it carry the bomb home to its friends, then key the blast.',
  },
  wpn_conductive_primer: {
    detail: 'A charge that coats the target in a conductive film — follow-on hits spread through the pack\'s hulls.',
    tip: 'Prime first, then hit it with anything electric: the pack shares the pain.',
  },
  tool_grav_anchor: {
    detail: 'Plants a gravometric spike that pins whatever it hits in place — a hull that cannot move cannot dodge.',
    tip: 'Anchor a light hull, then take your time lining up the follow-through.',
  },
  wpn_thermal_cooker: {
    detail: 'A held microwave lance that bakes the target\'s systems — shields hold but the hull cooks underneath.',
    tip: 'Sustained fire punishes shielded targets; the damage ignores the screen.',
  },
  wpn_mass_driver: {
    detail: 'A long-rod kinetic slug: all momentum, minimal payload. Pure knockback at range.',
    tip: 'Push a hull off a ledge or into traffic — collision damage does the rest.',
  },
  tool_polarity_inverter: {
    detail: 'Inverts the target\'s massline coupling — a hull you\'re towing gets repelled instead of dragged.',
    tip: 'Flip a tow into a launch: the tethered body shoots away under its own stored momentum.',
  },
  tool_viscosity_field: {
    detail: 'A projector that thickens the space around the target — its engines fight twice as hard for half the speed.',
    tip: 'Slow the pack leader; the swarm piles up behind it where your guns are waiting.',
  },
  tool_hardlight_prism: {
    detail: 'Splits a held beam into refracted lines that rake a wider arc — one mount, three angles.',
    tip: 'Hold the beam steady and the prism sweeps the field for you.',
  },
  tool_thruster_hijacker: {
    detail: 'Overrides the target\'s thrust vector — it accelerates in the direction you choose, not theirs.',
    tip: 'Shove a hostile into a wall or into the middle of its own pack.',
  },
  tool_seismic_gong: {
    detail: 'A concussive ring that detonates on impact — the blast staggers every hull in reach.',
    tip: 'The get-off-me answer when a swarm has settled onto your tail.',
  },
  tool_quantum_sympathy: {
    detail: 'Links two hulls entangled at the quantum layer — damage done to one bleeds into the other.',
    tip: 'Mark the toughest hull; every hit on the swarm counts twice.',
  },
  // ---- shields ---------------------------------------------------------------
  mod_shield_booster_s: {
    tip: 'The first defensive pick on any hull; a screen that comes back is one you can spend.',
  },
  mod_shield_capacitor_m: {
    detail: 'A medium capacitor bank — the shield soaks more and regains faster while it is up.',
    tip: 'Right for the ship that expects to take hits rather than avoid them.',
  },
  mod_shield_aegis_l: {
    tip: 'For the hull that parks in the middle of the swarm and takes the hit on purpose.',
  },
  // ---- engines ----------------------------------------------------------------
  mod_engine_ion_m: {
    detail: 'The yard drive — baseline thrust, baseline speed. Nothing to write about, everything to rely on.',
    tip: 'Keep it if the credits buy a better gun instead.',
  },
  mod_engine_fusion_m: {
    detail: 'More push under the keel and a higher cruising ceiling — the whole fight runs faster.',
    tip: 'Speed is its own defense; a hull that outruns the pack never gets swarmed.',
  },
  mod_engine_warp_l: {
    detail: 'The long-run drive: much faster travel between fights, without changing how you handle inside one.',
    tip: 'On a large hull it is the difference between arriving and arriving first.',
  },
  // ---- thrusters --------------------------------------------------------------
  mod_thruster_stripped_s: {
    tip: 'Save the slot money and live with the drift; or pay up if you need the answer.',
  },
  mod_thruster_vernier_m: {
    tip: 'How a gun platform keeps its aim inside a swarm — the turn is the targeting.',
  },
  mod_thruster_gimbal_l: {
    detail: 'The strongest manoeuvring set on the shelf. Turn, strafe and brake all answer harder than stock.',
    tip: 'On a capital hull, this is what makes the difference between a wall and a fighter.',
  },
  // ---- cargo ------------------------------------------------------------------
  mod_cargo_pod_m: {
    detail: 'More room in the hold — bolted-on stowage that adds capacity at the cost of mass.',
    tip: 'Buy the hold when you keep leaving salvage on the field.',
  },
  mod_cargo_expander_l: {
    detail: 'A much larger hold — the big freighter upgrade for runs that haul everything home.',
    tip: 'The mass is what you feel once it is full; fit a drive to match.',
  },
  mod_cargo_compactor_l: {
    tip: 'Best on a hull that already carries a lot — the percentage scales with the base.',
  },
  mod_smuggler_hold: {
    tip: 'For runs where the manifest is nobody\'s business.',
  },
  mod_smuggler_hold_m: {
    detail: 'A deeper hidden hold — a third of the manifest disappears under a routine scan.',
    tip: 'The quiet way to carry what the law calls contraband.',
  },
  // ---- mining -----------------------------------------------------------------
  mod_mining_laser_s: {
    detail: 'A small extraction beam that bites ore from a rock — hold it on the seam until it vents.',
    tip: 'The starter prospecting tool; cheap, light, and always paying for itself.',
  },
  mod_mining_beam_m: {
    detail: 'A heavier cutter — faster bite, farther reach, more ore per second of hold.',
    tip: 'The upgrade when a trip means coming back loaded, not just coming back.',
  },
  mod_mining_pulverizer_l: {
    tip: 'For the mining barge that lives on the rock belt.',
  },
  mod_mining_industrial_l: {
    tip: 'Fit it once and the run becomes a mining operation, not a mining trip.',
  },
  // ---- countermeasures / defense utility --------------------------------------
  mod_chaff_dispenser_m: {
    detail: 'A radar-chaff burst that breaks every missile lock on you and diverts the shots in flight.',
    tip: 'Fire it the second a missile lights up — a split-second early beats a second late.',
  },
  mod_ecm_jammer_l: {
    tip: 'The capital-ship answer to a torpedo wave; heavy enough to only fit where it counts.',
  },
  mod_decoy_buoy_s: {
    detail: 'A beacon that broadcasts a false contact — seeker heads go to it instead of you.',
    tip: 'Drop it while you run; the missile spends its fuel on a ghost.',
  },
  mod_heat_lure_s: {
    detail: 'A charge-thrown beacon that burns hotter than your reactor — predators and missiles chase the lie.',
    tip: 'Throw it behind you on the way out and the pack follows the wrong scent.',
  },
  mod_pds_servo_s: {
    detail: 'A point-defense servo that auto-fires on anything incoming inside its ring — shots and missiles alike.',
    tip: 'It works while you do not — the close screen that never sleeps.',
  },
  // ---- hull-burst utilities ---------------------------------------------------
  mod_gravity_bumper_s: {
    tip: 'The faster you arrive the farther they fly; boost into a pack and scatter it.',
  },
  mod_fire_lance_s: {
    tip: 'Fly straight at a hull and hold the line — light and medium hulls die, heavies ignite.',
  },
  mod_grip_bumper_s: {
    tip: 'Ram things with the catch, then key it again to let go.',
  },
  mod_gravity_bumper_s_mk2: {
    tip: 'Same play — get there faster, stay longer, throw harder.',
  },
  mod_fire_lance_s_mk2: {
    tip: 'A bigger window to run the prow through the pack.',
  },
  mod_grip_bumper_s_mk2: {
    tip: 'Catch a hull early and carry it through the whole pack.',
  },
  // ---- massline / tether --------------------------------------------------------
  mod_tractor_beam_m: {
    detail: 'A graviton line that grabs ore, cargo and wrecks without stopping on them — and works on light hulls too.',
    tip: 'Latch with the tether key; the line does the hauling while you keep flying.',
  },
  mod_elastic_whip_m: {
    tip: 'Latch, swing wide, and cut at the top of the arc — the snap is the punch.',
  },
  mod_frame_coupler_m: {
    tip: 'For hauling big salvage: the load becomes part of the ship\'s frame.',
  },
  mod_monofilament_sweep_m: {
    tip: 'Swing through the pack\'s lanes; anything that crosses the line pays for it.',
  },
  mod_transverse_snare_m: {
    tip: 'Lay it in their path; the swarm runs into its own tripwire.',
  },
  mod_twin_bridle_m: {
    tip: 'Two anchors tied at short range make a knot the pack cannot untangle.',
  },
  mod_massline_spool_m: {
    tip: 'More rope means more arc; the speed lives in the swing, not the motor.',
  },
  mod_massline_spool_l: {
    tip: 'On a big hull it turns the tether into a long-range tool, not a close one.',
  },
  mod_winch_hd: {
    detail: 'A heavy winch — the line reels in faster and reaches farther before it snaps tight.',
    tip: 'When a heavy hostile is closing and you cannot out-turn it — reel the fight to your range.',
  },
  mod_swing_drive_m: {
    tip: 'Latch a heavy mass, boost, and the whole ship slingshots around it.',
  },
  mod_swing_drive_s: {
    tip: 'The cheap way to make a light hull do the massline trick.',
  },
  mod_mass_flail_rig_m: {
    tip: 'Tow a wreck, swing it through the pack, and let the physics do the damage.',
  },
  // ---- cloak / stealth ----------------------------------------------------------
  mod_cloak_mk1: {
    tip: 'Stay dark while the swarm hunts a contact that is not there; drop it when you need the guns.',
  },
  mod_cloak_mk2: {
    tip: 'The professional\'s cloak; the drain is worth the invisibility.',
  },
  // ---- ordnance racks -----------------------------------------------------------
  mod_charge_rack: {
    detail: 'A rack of impulse charges you can throw and set off — a shove in a can.',
    tip: 'Throw one into the pack and detonate when they cluster; or drop one behind you to break a pursuit.',
  },
  mod_charge_vector_rack: {
    tip: 'The aft throw turns a chase into a trap — kick it out and detonate in their faces.',
  },
  // ---- sensors / utility --------------------------------------------------------
  mod_cargo_scanner_s: {
    detail: 'A hold reader — scans what another ship is carrying before you decide to take it.',
    tip: 'For the pirate\'s calculus: know the manifest before you commit.',
  },
  mod_market_data_s: {
    tip: 'Fit it when you are buying or hauling; the market intel pays for the slot.',
  },
  mod_sensor_array_l: {
    detail: 'A deep-scan array — sees contacts much farther out and earns bonus research on a survey.',
    tip: 'The explorer\'s eye; the sector opens up around you.',
  },
  mod_survey_suite: {
    tip: 'For the long-range prospector: the anomaly fix comes faster.',
  },
  mod_drill_amp: {
    tip: 'For the miner who wants the seam to last, not just the bite.',
  },
  mod_sensor_scrambler_s: {
    detail: 'A return damper — your hull reads quieter on a scan than the ship you actually fly.',
    tip: 'A smaller signature means you slip a scan that would otherwise flag you.',
  },
  mod_sensor_scrambler_m: {
    detail: 'A much stronger return damper — a scan has to get uncomfortably close to read you at all.',
    tip: 'For the hull that wants to be a ghost on other people\'s instruments.',
  },
  mod_filter_stack_s: {
    detail: 'A biofilm filter that throttles contamination accrual — the hull stays cleaner, longer.',
    tip: 'For long hauls through fauna sectors; the plates stay yours.',
  },
  mod_filter_stack_m: {
    detail: 'A deeper biofilm filter — accrual drops to a fifth of stock while the stack is fitted.',
    tip: 'The long-version fix for a contaminated sector run.',
  },
  mod_bio_spectral_pass_s: {
    detail: 'A spectral pass head that resolves organisms on a scan instead of a bare contact.',
    tip: 'The xenologist\'s tool — know what is in the water before you commit.',
  },
  mod_field_coherence_meter: {
    detail: 'A coherence probe that reports a site\'s standing field once a second while you are in it.',
    tip: 'For reading the machine\'s weather — the field tells you what the site is doing.',
  },
  mod_quarantine_locker_s: {
    detail: 'An airtight cargo seal — biohazard lots stop feeding hull exposure while they ride in the hold.',
    tip: 'For hauling the things that should not breathe on the manifest.',
  },
  mod_hull_purge_ring_m: {
    detail: 'A purge ring that fires once per berth — a fouled hull leaves the dock clean.',
    tip: 'For the run that keeps coming back dirty; the plates reset on the pad.',
  },
  mod_quiet_mask_s: {
    detail: 'An emission damper — the hull presents a quieter mass/heat signature to fauna.',
    tip: 'The stealth pick for ecology sectors; predators hunt someone else.',
  },
  mod_relay_needle_s: {
    detail: 'A relay probe that resolves coherent emitters — a scanned organism reports its broadcast status.',
    tip: 'For reading the fauna\'s network; a relay organism tells you what it is relaying.',
  },
  mod_capture_cradle_m: {
    detail: 'A live-capture cradle — releasing a latched organism puts a specimen in the hold instead of letting it drift.',
    tip: 'For the specimen run: catch it alive, sell it sealed.',
  },
  mod_precursor_handshake_s: {
    detail: 'A salvaged handshake transponder — the machine protocol reads your compliance twice as fast.',
    tip: 'For the run that keeps knocking on a machine site; the hold halves.',
  },
  mod_containment_seal_s: {
    detail: 'Registry quarantine paperwork — stations that would refuse biohazard lots accept them under sealed custody.',
    tip: 'The legal-way-out for a contaminated cargo run.',
  },
  mod_filament_contrast_s: {
    detail: 'A contrast filter that lets phantom contacts read false — the scanner stops lying to itself.',
    tip: 'For sectors where the pings lie more than they tell.',
  },
  mod_host_cartography_s: {
    detail: 'A host-memory tap — approaching a machine site reveals its map and arrival bands.',
    tip: 'For the run that wants the site\'s own intelligence, not just the contact.',
  },
  mod_echo_recorder_s: {
    detail: 'A recorder that logs ecology encounters into the site record — the deep-read tool for a long survey.',
    tip: 'For the researcher: every encounter becomes data, not just a memory.',
  },
  mod_resonant_massline_m: {
    detail: 'A massline coil tuned to dead-matter frequency — a strike does not wake dormant fauna.',
    tip: 'For the mining op in a live sector: the rock cracks without the swarm waking.',
  },
  mod_quiet_equation_s: {
    detail: 'A directive decoder — the machine\'s own words get appended with the human read.',
    tip: 'For the protocol run: the machines say what they mean instead of what they command.',
  },
  mod_lattice_coupler_s: {
    detail: 'A lattice echo that reads a site\'s standing directive on first approach — grammar by listening.',
    tip: 'For the scout who wants the site\'s orders before it wants you.',
  },
  // ---- misc utility -------------------------------------------------------------
  mod_repulsion_trap_s: {
    tip: 'Seed your wake; the pursuer triggers it and gets thrown off the line.',
  },
  mod_afterburner_m: {
    detail: 'A hard shove on demand — a short burst of top speed on a cooldown.',
    tip: 'The way out of a closing ring, or the way into a kill you are chasing.',
  },
  mod_repair_nanobots_m: {
    detail: 'A hull-knitting swarm — the plates repair themselves between fights.',
    tip: 'For the long run: the hull comes back to the fight instead of staying gone.',
  },
  mod_targeting_computer_m: {
    tip: 'The quiet multiplier on a full battery; a percentage on a gun is a lot on a rack.',
  },
  mod_shield_hardener_m: {
    detail: 'A hardener that takes a cut out of every hit — the shield shrugs all flavors of fire.',
    tip: 'For the hull that expects to take fire from every direction at once.',
  },
  mod_triangulation_suite_s: {
    tip: 'For the surveyor — anomalies resolve a pulse sooner, out of harm\'s way.',
  },
  mod_thermal_sink_s: {
    tip: 'For the trigger-happy build: the guns stay hot less.',
  },
  mod_thermal_sink_m: {
    tip: 'For the ship that wants to keep firing past the first vent.',
  },
  mod_drone_bay_l: {
    detail: 'A drone cradle that launches a fighter on its own — a second hull in the water.',
    tip: 'The drone fights its own fight; you get a wing that never tires.',
  },
  mod_jump_drive_m: {
    detail: 'A jump booster that lets the hull fold farther than its own drive allows.',
    tip: 'For the long-jump run: a bigger step between fights.',
  },
  mod_ram_plate: {
    tip: 'When the pack chases tight enough to bump — every collision they start becomes damage they take.',
  },
  mod_loot_magnet_s: {
    tip: 'For the cleanup pass: the field feeds itself.',
  },
  // ---- weapon trait rigs --------------------------------------------------------
  mod_bank_shot: {
    detail: 'Shots bounce off rock — every wall becomes a firing angle.',
    tip: 'Fit it where there is cover; the ricochet is free damage on the pack.',
  },
  mod_smart_bank: {
    tip: 'The bank that hunts: shoot the wall and the pack catches the turn.',
  },
  mod_piercing_core: {
    tip: 'For the tight pack: one pull hits the hull behind the hull you aimed at.',
  },
  mod_forked_core: {
    tip: 'For when you want more area than aim; the swarm takes both halves.',
  },
  mod_twin_mount: {
    tip: 'For the battery that wants more volume; the gun runs hotter for the same trigger.',
  },
  mod_triad_mount: {
    tip: 'For the close-range wall of fire; the heat cost is the trade.',
  },
  mod_relay_arc: {
    tip: 'For the swarm that wants to stay close together.',
  },
  mod_bank_relay: {
    tip: 'For the bank-shot build that wants the ricochet to be the thing that hits.',
  },
  mod_gravity_tag: {
    detail: 'A hit marks the hull so gravity fields and wells grip it harder.',
    tip: 'For the well-and-bank build: paint first, then drop the field.',
  },
  mod_ion_payload: {
    detail: 'A hit leaves the target ionized — follow-on systems damage bleeds through.',
    tip: 'For the setup gun: prime the target, then let the second shot do more than it should.',
  },
  mod_incendiary_payload: {
    detail: 'A hit sets the target burning — damage continues after the shot has gone.',
    tip: 'For the long hold: the hit keeps paying after the trigger lets go.',
  },
  mod_cryo_payload: {
    detail: 'A hit locks the target in cryo — the next blow lands on something that cannot yield.',
    tip: 'For the one-two punch: freeze first, then finish.',
  },
  mod_cryo_gyros: {
    tip: 'For the swarm that wants to swarm you: the orbit does the catching.',
  },
  mod_tether_capacitor: {
    tip: 'For the massline build: latch first, then the guns pay more.',
  },
  mod_conductive_path: {
    tip: 'For the conductive-primer build: the arc only goes where the film is.',
  },
  mod_storm_carom: {
    tip: 'For the build that wants the wall to do the work.',
  },
  mod_herald_fan: {
    tip: 'For the pack, not the target; the fan owns a lane, not a point.',
  },
});

/** The hulls offered on the swarm shelf, in dossier form. */
export const HULL_DOSSIER = Object.freeze({
  ship_kestrel: { detail: 'The starter hull. Light, cheap, and unremarkable — the baseline every other hull is measured against.', tip: 'The right answer when the budget is the constraint.' },
  ship_pelican: { detail: 'A mining barge with teeth — more mining bays and a bigger hold than the Hitch.', tip: 'For the prospector run that still wants to fight.' },
  ship_wasp: { detail: 'A twin-gun light fighter — the cheapest way to field a second hardpoint.', tip: 'For the gun-heavy build on a small budget.' },
  ship_mule: { detail: 'A cargo mule — three holds, light armament, the freight answer.', tip: 'For the run that expects to come back loaded.' },
  ship_drifter: { detail: 'A twin-gun, twin-utility platform — the massline playground hull.', tip: 'For the build that wants a tether and a spare bay for the rig that goes with it.' },
  ship_hornet: { detail: 'A three-gun interceptor — fast, thin-skinned, and all bite.', tip: 'For the run that wants to kill before it gets killed.' },
  ship_ironback: { detail: 'A mining barge with four L mining bays — the industrial extractor platform.', tip: 'For the run that wants to break rocks, not heads.' },
  ship_hawser: { detail: 'A tow rig — three utility bays and a hull built to pull.', tip: 'For the massline build that wants to haul, not just swing.' },
  ship_bastion: { detail: 'A four-gun gunship with a shield bank — the first hull that soaks a fight.', tip: 'For the build that wants to stand in the middle of the pack.' },
  ship_atlas: { detail: 'A capital freighter — six L cargo bays, the biggest hold on the shelf.', tip: 'For the run that is really a logistics operation.' },
  ship_ranger: { detail: 'A long-range skirmisher — three guns and four L utility bays for the scanner/stealth kit.', tip: 'For the ghost run that wants to see before it is seen.' },
  ship_warden: { detail: 'A heavy patrol hull — four L guns and a shield that takes a hit.', tip: 'For the capital build that wants to be the wall.' },
  ship_colossus: { detail: 'Six L guns and five L utility bays — the full combat platform.', tip: 'For the run that wants every toy at once.' },
  ship_leviathan: { detail: 'The biggest thing on the shelf — eight L guns and a small fleet\'s worth of utility.', tip: 'For the run that wants to be the boss.' },
  ship_saucer: { detail: 'A shield-heavy capital — the survivability pick over raw volume.', tip: 'For the run that wants to outlast the swarm, not outgun it.' },
});

// ---------------------------------------------------------------------------
// Stat chips — derived from the def, never authored twice. Each entry is
// {label, value}; the UI renders them as a compact spec sheet.
// ---------------------------------------------------------------------------

function num(v, dp = 0) {
  if (!Number.isFinite(v)) return null;
  const r = Number(v.toFixed(dp));
  return r === 0 ? '0' : String(r);
}

function pct(v) {
  if (!Number.isFinite(v)) return null;
  return `${Math.round(v * 100)}%`;
}

// A chip that only restates zero is noise on the card ("Heat 0/shot" tells the
// reader nothing they didn't assume). Skips '0', '0.0/shot', '+0%', and so on.
function deadZero(value) {
  const m = String(value).match(/^[-+−×]?\s*(\d*\.?\d+)/);
  return !!m && parseFloat(m[1]) === 0;
}

/** Weapon spec chips. */
const TRACKING_LABEL = { fixed: 'Fixed', auto_turret: 'Auto-turret', hitscan: 'Hitscan', homing: 'Homing', deploy: 'Deployed' };
function weaponStats(def) {
  const out = [];
  const push = (label, value) => { if (value != null && value !== '' && !deadZero(value)) out.push({ label, value }); };
  push('Damage', num(def.dmg));
  push('Type', def.damageType ? String(def.damageType).replace(/^\w/, (c) => c.toUpperCase()) : null);
  push('DPS', num(def.dps));
  push('Rate', def.rof != null ? `${num(def.rof, 1)}/s` : null);
  push('Proj. speed', num(def.projSpeed));
  push('Range', num(def.range));
  push('Tracking', TRACKING_LABEL[def.tracking] || def.tracking);
  push('Lock', def.lockTimeS != null ? `${num(def.lockTimeS, 1)} s` : null);
  push('Splash', num(def.splashDmg));
  push('Splash radius', num(def.splashRadius));
  push('Impulse', num(def.impulsePerHit));
  push('Spread', def.spreadDeg != null ? `${num(def.spreadDeg, 1)}°` : null);
  push('Pierce', def.armorPierce != null ? pct(def.armorPierce) : null);
  push('Homing turn', def.tracking === 'homing' && def.turnRate != null ? `×${num(def.turnRate, 1)}` : null);
  push('Arc', def.turretArcDeg != null ? `${num(def.turretArcDeg)}°` : null);
  push('Intercept', def.interceptChance != null ? pct(def.interceptChance) : null);
  push('Intercept cd', def.interceptCooldownS != null ? `${num(def.interceptCooldownS, 1)} s` : null);
  push('Shield bypass', def.shieldBypass != null ? pct(def.shieldBypass) : null);
  push('Subsystem', def.subsystemShare != null ? pct(def.subsystemShare) : null);
  push('RCS disrupt', def.rcsDisruptS != null ? `${num(def.rcsDisruptS, 1)} s` : null);
  push('Pull', num(def.mineWellPull));
  push('Arms in', def.mineArmS != null ? `${num(def.mineArmS, 1)} s` : null);
  push('Trigger', def.mineTriggerRadius != null && def.mineTriggerRadius > 0 ? num(def.mineTriggerRadius) : null);
  push('Blast radius', num(def.mineBlastRadius));
  push('Life', def.mineLifeS != null ? `${num(def.mineLifeS)} s` : null);
  push('Max active', num(def.mineMaxActive));
  push('Heat', def.heatPerShot != null ? `${num(def.heatPerShot)}/shot` : (def.heatPerSec != null ? `${num(def.heatPerSec)}/s` : null));
  push('Cooling', def.heatDissip != null ? `${num(def.heatDissip)}/s` : null);
  push('Energy', def.energyCost != null ? `${num(def.energyCost)}${def.continuous ? '/s' : '/shot'}` : null);
  push('Mass', num(def.mass));
  push('Statuses', (def.statuses || []).map((s) => String(s.id || s)
    .replace(/^status_/, '').replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())).join(', ') || null);
  return out;
}

/** Module spec chips — a label per meaningful mods key. */
function moduleStats(def) {
  const out = [];
  const push = (label, value) => { if (value != null && value !== '' && !deadZero(value)) out.push({ label, value }); };
  const m = def.mods || {};
  push('Shield', m.shieldFlat != null ? `+${num(m.shieldFlat)}` : null);
  push('Shield regen', m.shieldRegenFlat != null ? `+${num(m.shieldRegenFlat)}/s` : null);
  push('Top speed', m.topSpeed != null ? num(m.topSpeed) : null);
  push('Accel', m.accelMult != null && m.accelMult !== 1 ? `×${num(m.accelMult, 2)}` : null);
  push('Turn', m.turnMult != null && m.turnMult !== 1 ? `×${num(m.turnMult, 2)}` : null);
  push('Strafe', m.strafeMult != null && m.strafeMult !== 1 ? `×${num(m.strafeMult, 2)}` : null);
  push('Brake', m.brakeMult != null && m.brakeMult !== 1 ? `×${num(m.brakeMult, 2)}` : null);
  push('Travel', m.travelCeilingMult != null && m.travelCeilingMult !== 1 ? `×${num(m.travelCeilingMult, 2)}` : null);
  push('Cargo', m.cargoFlat != null ? `+${num(m.cargoFlat)}` : null);
  push('Cargo cap', m.cargoCapPct != null ? `+${pct(m.cargoCapPct)}` : null);
  push('Hidden cargo', m.hiddenCargoPct != null ? pct(m.hiddenCargoPct) : null);
  push('Radar', m.radarRangePct != null ? `+${pct(m.radarRangePct)}` : null);
  push('Scan radius', m.scannerRadiusMult != null ? `×${num(m.scannerRadiusMult, 2)}` : null);
  push('Ping persist', m.pingPersistMult != null ? `×${num(m.pingPersistMult, 2)}` : null);
  push('Weapon range', m.weaponRangePct != null ? `+${pct(m.weaponRangePct)}` : null);
  push('Weapon dmg', m.weaponDmgPct != null ? `+${pct(m.weaponDmgPct)}` : null);
  push('Heat sink', m.weaponHeatDissipPct != null ? `+${pct(m.weaponHeatDissipPct)}` : null);
  push('Magnet range', m.magnetRange != null ? num(m.magnetRange) : null);
  push('Massline head', m.masslineHeadId
    ? String(m.masslineHeadId).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null);
  push('Tether reel', m.tetherReelRateMult != null ? `×${num(m.tetherReelRateMult, 2)}` : null);
  push('Tether spool', m.tetherSpoolMult != null ? `×${num(m.tetherSpoolMult, 2)}` : null);
  push('Damage resist', m.damageReductionPct != null ? `−${pct(m.damageReductionPct)}` : null);
  push('Cloak radius', m.cloakBaseRadius != null ? num(m.cloakBaseRadius) : null);
  push('Cloak drain', m.cloakDrainPerS != null ? `${num(m.cloakDrainPerS, 3)}/s` : null);
  push('Cloak recharge', m.cloakRechargePerS != null ? `${num(m.cloakRechargePerS, 3)}/s` : null);
  push('Drone bay', m.droneBay != null ? String(m.droneBay) : null);
  push('Jump tier', m.jumpDriveTier != null ? `T${m.jumpDriveTier}` : null);
  push('Boost speed', m.boostTopSpeedPct != null ? `+${pct(m.boostTopSpeedPct)}` : null);
  push('Boost dur', m.boostDurS != null ? `${num(m.boostDurS)} s` : null);
  push('Boost cd', m.boostCdS != null ? `${num(m.boostCdS)} s` : null);
  push('Hull repair', m.hullRepairOOC != null ? `+${num(m.hullRepairOOC, 1)}/s` : null);
  push('Bio filter', m.bioFilterMult != null ? `×${num(m.bioFilterMult, 2)}` : null);
  push('Stealth bio', m.stealthBioMult != null ? `×${num(m.stealthBioMult, 2)}` : null);
  push('Point defense', m.pointDefense ? `${num(m.pointDefense.radius)} · ${num(m.pointDefense.cooldownS, 1)}s` : null);
  push('Countermeasure', m.countermeasure ? `${m.countermeasure.kind} · ${num(m.countermeasure.radius)} · ${num(m.countermeasure.cooldownS, 0)}s cd` : null);
  push('Mining DPS', def.dps != null && def.slotType === 'mining' ? num(def.dps) : null);
  push('Mining range', def.range != null && def.slotType === 'mining' ? num(def.range) : null);
  push('Rare ore', def.rareOreChance != null ? pct(def.rareOreChance) : null);
  push('Ore flow', def.directToCargo === true ? 'straight to cargo' : null);
  push('Energy draw', def.energyDraw != null ? `${num(def.energyDraw)}/s` : null);
  push('Charge rack', m.impulseChargeCapacity != null ? `${m.impulseChargeCapacity} charges` : null);
  push('Loot range', m.lootMagnetRange != null ? num(m.lootMagnetRange) : null);
  push('Scan range', m.scanRangeMult != null ? `×${num(m.scanRangeMult, 2)}` : null);
  push('Anomaly fix', m.anomalyPingReduction != null ? `−${m.anomalyPingReduction} scan` : null);
  push('Bio scan', m.bioScanTier != null ? `+${m.bioScanTier} tier` : null);
  push('Capture survival', m.captureSurvivalMult != null ? `×${num(m.captureSurvivalMult, 2)}` : null);
  push('Rich core', m.richCoreRingPctBonus != null ? `+${pct(m.richCoreRingPctBonus)}` : null);
  push('Survey RP', m.scanRpBonus != null ? `+${num(m.scanRpBonus)}` : null);
  push('Scan detection', m.scannerCloak != null ? `−${pct(m.scannerCloak)}` : null);
  push('Hull burst', m.hullBurst ? `${m.hullBurst} · rank ${m.hullBurstRank || 1}` : null);
  push('Ram damage', m.ramDamageDealtMult != null && m.ramDamageDealtMult !== 1 ? `×${num(m.ramDamageDealtMult, 2)}` : null);
  push('Tow flail', m.towFlail === true ? 'rigged' : null);
  // Boolean mod keys with no numeric chip of their own (scanner flags, swing drive,
  // tractor specials) — name them so a flag-only card is self-explanatory.
  const flags = Object.keys(m)
    .filter((k) => m[k] === true && k !== 'towFlail')
    // camelCase internals -> readable chips: 'repulsionTrap' -> 'Repulsion trap'.
    .map((k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()));
  push('Flags', flags.length ? flags.join(' · ') : null);
  // A def whose mods are all identity (the stock thruster cluster) has no numeric stat
  // to quote — the truthful chip is that it grants the hull's unmodified handling.
  if (out.length === 0) out.push({ label: 'Handling', value: 'stock baseline' });
  return out;
}

/** Hull spec chips. */
function hullStats(def) {
  const out = [];
  const push = (label, value) => { if (value != null && value !== '' && !deadZero(value)) out.push({ label, value }); };
  push('Hull', num(def.hull));
  push('Shield', num(def.shield));
  push('Shield regen', num(def.baseShieldRegen));
  push('Mass', num(def.mass));
  push('Energy cap', num(def.energyCap));
  push('Energy regen', num(def.energyRegen));
  push('Cargo', num(def.cargo));
  push('Outfit space', num(def.outfitSpace));
  push('Handling', def.handling != null ? `×${num(def.handling, 2)}` : null);
  push('Boost pool', def.boost && def.boost.max != null ? num(def.boost.max) : null);
  push('Weapon cap', num(def.weaponCapacity));
  push('Engine cap', num(def.engineCapacity));
  push('Hardpoints', def.slots ? String(Object.values(def.slots).flat().length) : null);
  return out;
}

/**
 * Authored text for the armory's service counter — the same {detail, tip} contract the
 * fitting dossier keeps, so the reading column reads a service like it reads a fitting.
 */
const SERVICE_DOSSIER = {
  svc_weld: {
    detail: 'A dockside crew re-welds the hull seams and flushes armor plating back to spec — both pools restored in full the moment the credit clears. The counter only puts it up while the hull is actually hurt.',
    tip: 'The cheapest armor in the shop when the next pack would catch you under-plated; a sound hull never needs it.',
  },
  svc_ordnance: {
    detail: 'Impulse charges racked from the counter to the hold, up to the six-crate ceiling. Every hull throws them from the unfitted launcher; a fitted rack only raises how many can be flying at once.',
    tip: 'Ammunition, not a fitting — any hull can lob a plate, and a rack build burns through the hold fastest.',
  },
};

/**
 * The dossier for one counter service offer ({id: 'svc_*', service, price, name}).
 * Same shape as dossierFor, stats quoted live so a re-priced offer never reads stale.
 * Returns null for an offer that is not a service the counter knows.
 */
export function serviceDossier(offer) {
  if (!offer || offer.kind !== 'service' || typeof offer.id !== 'string') return null;
  const authored = SERVICE_DOSSIER[offer.id];
  if (!authored) return null;
  const stats = [{ label: 'Cost', value: `${Number(offer.price) || 0} cr` }];
  if (offer.service === 'weld') {
    stats.push({ label: 'Restores', value: 'hull + armor full' });
    stats.push({ label: 'Gate', value: 'only while hurt' });
  } else if (offer.service === 'ordnance') {
    stats.push({ label: 'Hold', value: 'to 6 charges' });
    stats.push({ label: 'Deployed', value: '4 · 8 racked' });
    stats.push({ label: 'Gate', value: 'only below cap' });
  }
  stats.push({ label: 'Applied', value: 'instant' });
  return Object.freeze({
    defId: offer.id,
    name: offer.name || offer.id,
    kind: 'service',
    detail: authored.detail,
    tip: authored.tip,
    stats: Object.freeze(stats),
    media: null,
  });
}

/**
 * The dossier for one defId (weapon, module or hull).
 * Returns { defId, name, kind, detail, tip, stats, media } or null for an unknown id.
 */
export function dossierFor(defId) {
  if (typeof defId !== 'string' || !defId) return null;
  const w = WEAPON_BY_ID.get(defId);
  const m = MODULE_BY_ID.get(defId);
  const h = SHIP_BY_ID.get(defId);
  const def = w || m || h;
  if (!def) return null;
  const authored = FITTING_DOSSIER[defId] || HULL_DOSSIER[defId] || {};
  const kind = w ? 'weapon' : m ? 'module' : 'hull';
  const stats = w ? weaponStats(w) : m ? moduleStats(m) : hullStats(h);
  return Object.freeze({
    defId,
    name: def.name || defId,
    kind,
    detail: authored.detail || def.sentence || '',
    tip: authored.tip || '',
    stats: Object.freeze(stats),
    media: kind === 'hull' ? null : fittingMedia(defId),
  });
}
