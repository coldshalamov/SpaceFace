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
import { SURVIVAL_EVOLUTIONS } from './survivalEvolutions.js';
import { ATTACK_TRAIT_BY_ID } from './attackTraits.js';
import { FACTION_META } from './factions.js';
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
// chips carry the numbers. Salvage/unique defs never reach the armory shelf, but
// their entries still earn their keep: the prep manifest quotes dossier detail for
// whatever the hull has fitted, salvage rigs included.
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
    detail: 'A short-cycle slug drum — each hit chews a little armor and shoves a light hull off its line.',
    tip: 'Low tier but the push adds up — small ships get juggled while you hold the trigger.',
  },
  wpn_flak_turret_s: {
    detail: 'A self-aiming turret that answers whatever is in reach — incoming shots and missiles included.',
    tip: 'It shoots on its own. Park it in the bay and let it screen while you fly.',
  },
  wpn_concussion_cannon_s: {
    detail: 'The slug lands as a shove, not a shell — light hulls tumble and lose their heading on impact.',
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
    tip: 'The highest per-shot dps an M mount can field; splash means near-misses still count.',
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
    detail: 'A deployed sink, not a beam — it plants where you drop it, pulls the pack inward for six seconds, and two can be live at once.',
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
    detail: 'A heavier screen over the stock line — more capacity up front, and the rebuild keeps running between hits.',
    tip: 'The first defensive pick on any hull; a screen that comes back is one you can spend.',
  },
  mod_shield_capacitor_m: {
    detail: 'A medium capacitor bank — the shield soaks more and regains faster while it is up.',
    tip: 'Right for the ship that expects to take hits rather than avoid them.',
  },
  mod_shield_aegis_l: {
    detail: 'A capital-grade shield bank — it soaks a whole exchange before breaking, then rebuilds once the shooting stops.',
    tip: 'For the hull that parks in the middle of the swarm and takes the hit on purpose.',
  },
  // ---- engines ----------------------------------------------------------------
  mod_engine_ion_m: {
    detail: 'The yard drive — baseline thrust, baseline speed. Nothing to write about, everything to rely on.',
    tip: 'Keep it if the credits buy a better gun instead.',
  },
  mod_engine_fusion_m: {
    detail: 'Ninety-five flat out and thirty percent more push — the engine that makes the whole map feel closer.',
    tip: 'Speed is its own defense; a hull that outruns the pack never gets swarmed.',
  },
  mod_engine_warp_l: {
    detail: 'The long-run drive: much faster travel between fights, without changing how you handle inside one.',
    tip: 'On a large hull it is the difference between arriving and arriving first.',
  },
  // ---- thrusters --------------------------------------------------------------
  mod_thruster_stripped_s: {
    detail: 'Steering stripped to compliance minimums — turn, strafe and brake all answer weaker than stock.',
    tip: 'Save the slot money and live with the drift; or pay up if you need the answer.',
  },
  mod_thruster_vernier_m: {
    detail: 'Forty-two percent harder turn, half the strafe again, a third more brake — the measured set between the yard cluster and the gimbals.',
    tip: 'How a gun platform keeps its aim inside a swarm — the turn is the targeting.',
  },
  mod_thruster_gimbal_l: {
    detail: 'Seventy percent harder turn, near double the strafe, half-again the brake — the numbers that make a capital hull answer like a corvette.',
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
    detail: 'A hold re-pack: flat capacity on top, plus a percentage squeeze on everything the hull already carries.',
    tip: 'Best on a hull that already carries a lot — the percentage scales with the base.',
  },
  mod_smuggler_hold: {
    detail: 'Eight more crates on the manifest, and a fifth of the hold reads as empty space when the inspection runs.',
    tip: 'For runs where the manifest is nobody\'s business.',
  },
  mod_smuggler_hold_m: {
    detail: 'A deeper hidden hold — a third of the manifest disappears under a routine scan.',
    tip: 'The quiet way to carry what the law calls contraband.',
  },
  // ---- mining -----------------------------------------------------------------
  mod_mining_laser_s: {
    detail: 'Eighteen a second at two-forty range — the starter beam that pays for itself off the first belt.',
    tip: 'The starter prospecting tool; cheap, light, and always paying for itself.',
  },
  mod_mining_beam_m: {
    detail: 'A heavier cutter — faster bite, farther reach, more ore per second of hold.',
    tip: 'The upgrade when a trip means coming back loaded, not just coming back.',
  },
  mod_mining_pulverizer_l: {
    detail: 'The heavy bite — faster than the beam on common seams, and it sometimes cracks a rare pocket.',
    tip: 'For the mining barge that lives on the rock belt.',
  },
  mod_mining_industrial_l: {
    detail: 'Seventy a second at four-twenty meters, plumbed straight into the hold — the extractor that turns a trip into an operation.',
    tip: 'Fit it once and the run becomes a mining operation, not a mining trip.',
  },
  // ---- countermeasures / defense utility --------------------------------------
  mod_chaff_dispenser_m: {
    detail: 'A three-eighty chaff cloud for three and a half seconds — locks on you drop outright and shots already in flight scatter off course.',
    tip: 'Fire it the second a missile lights up — a split-second early beats a second late.',
  },
  mod_ecm_jammer_l: {
    detail: 'A heavy jammer — missiles inside its ring lose their steering for a few seconds.',
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
    detail: 'A burst field on the prow — while the burst runs, every hostile hull the nose touches gets thrown.',
    tip: 'Boost into a pack and scatter it — arrival speed is the payload.',
  },
  mod_fire_lance_s: {
    detail: 'A burst burner on the prow — while the burst runs, a narrow flame lance cooks whatever the nose touches.',
    tip: 'Hold the nose on a hull and commit — the lance only burns what stays in front of it.',
  },
  mod_grip_bumper_s: {
    detail: 'A burst catch on the prow — the first light hull the nose meets sticks to it until the key lets go.',
    tip: 'Pays when the hull you catch is the payload — ram with it, shield the nose, or haul it home.',
  },
  mod_gravity_bumper_s_mk2: {
    detail: 'The boost wedge that hurls whatever the nose meets — rank two holds the cone open longer, reaches farther, and lands the throw harder.',
    tip: 'Same play — get there faster, stay longer, throw harder.',
  },
  mod_fire_lance_s_mk2: {
    detail: 'The second-rank lance — the burn window holds longer and the flame bites hotter.',
    tip: 'A bigger window to run the prow through the pack.',
  },
  mod_grip_bumper_s_mk2: {
    detail: 'The catch wedge — the first light hull inside the cone sticks to the prow until the boost lets go; rank two reaches farther and holds on longer.',
    tip: 'Catch a hull early and carry it through the whole pack.',
  },
  // ---- massline / tether --------------------------------------------------------
  mod_tractor_beam_m: {
    detail: 'Twelve hundred meters of pull and a head that grips light hulls as easily as ore — the salvage comes to you while you keep flying.',
    tip: 'Latch with the tether key; the line does the hauling while you keep flying.',
  },
  mod_elastic_whip_m: {
    detail: 'The springiest head on the board — extension you earn becomes real tension, and the cut releases you at whatever speed the return stroke built.',
    tip: 'Latch, swing wide, and cut at the top of the arc — the snap is the punch.',
  },
  mod_frame_coupler_m: {
    detail: 'The rigid hitch — a towed load exchanges momentum with the hull while the line is taut instead of levering it sideways.',
    tip: 'For hauling big salvage: the load becomes part of the ship\'s frame.',
  },
  mod_monofilament_sweep_m: {
    detail: 'A monofilament line that cuts whatever tether it crosses and staggers the hull holding it.',
    tip: 'Swing through the pack\'s lanes; anything that crosses the line pays for it.',
  },
  mod_transverse_snare_m: {
    detail: 'Area denial, not an aimed grapnel — the head fires on anything fast that crosses the line, so the lane you close is the one the swarm was already using.',
    tip: 'Lay it in their path; the swarm runs into its own tripwire.',
  },
  mod_twin_bridle_m: {
    detail: 'Two short anchors that tie a pair of hulls together — bound targets tumble against each other.',
    tip: 'Two anchors tied at short range make a knot the pack cannot untangle.',
  },
  mod_massline_spool_m: {
    detail: 'A longer spool — the tether reaches well past the stock line before it snaps tight.',
    tip: 'More rope means more arc; the speed lives in the swing, not the motor.',
  },
  mod_massline_spool_l: {
    detail: 'Six times the stock line on the drum — the swing arc starts so far out the fight is still a dot on the scope.',
    tip: 'On a big hull it turns the tether into a long-range tool, not a close one.',
  },
  mod_sanction_spool: {
    detail: 'The Navy\'s own tow line — four times the stock tether on the drum, a step past the Industrial Spool.',
    tip: 'For the M-frame massline build: the deepest reach an M utility bay carries.',
  },
  mod_winch_hd: {
    detail: 'Nearly double the reel speed and half-again the line on the drum — the catch lands sooner and the swing starts farther out.',
    tip: 'When a heavy hostile is closing and you cannot out-turn it — reel the fight to your range.',
  },
  mod_swing_drive_m: {
    detail: 'With a tether latched the drive bends the whole dash onto the line\'s tangent and uprates it — same boost key, same energy cost, a completely different verb.',
    tip: 'Latch a heavy mass, boost, and the whole ship slingshots around it.',
  },
  mod_swing_drive_s: {
    detail: 'The swing drive in a small-bay frame — the massline trick for hulls without an M slot.',
    tip: 'The cheap way to make a light hull do the massline trick.',
  },
  mod_mass_flail_rig_m: {
    detail: 'Every contact while you tow a real load carries the load\'s mass — the wreck on the line is the weapon and your hull is only the handle.',
    tip: 'Tow a wreck, swing it through the pack, and let the physics do the damage.',
  },
  // ---- cloak / stealth ----------------------------------------------------------
  mod_cloak_mk1: {
    detail: 'An emission shroud — contacts lose the hull at much closer range while the cloak holds; the drain runs the whole time.',
    tip: 'Stay dark while the swarm hunts a contact that is not there; drop it when you need the guns.',
  },
  mod_cloak_mk2: {
    detail: 'A deeper shroud — the signature drops harder, and the cloak rebuilds faster after a break.',
    tip: 'The professional\'s cloak; the drain is worth the invisibility.',
  },
  // ---- ordnance racks -----------------------------------------------------------
  mod_charge_rack: {
    detail: 'Eight remote charges ride the rack and none of them go off until you call it — the shove waits for the swarm to be inside it.',
    tip: 'Throw one into the pack and detonate when they cluster; or drop one behind you to break a pursuit.',
  },
  mod_charge_vector_rack: {
    detail: 'The impulse rack with an aft throw tube — kick a charge out behind while you run.',
    tip: 'The aft throw turns a chase into a trap — kick it out and detonate in their faces.',
  },
  // ---- sensors / utility --------------------------------------------------------
  mod_cargo_scanner_s: {
    detail: 'A hold reader — scans what another ship is carrying before you decide to take it.',
    tip: 'For the pirate\'s calculus: know the manifest before you commit.',
  },
  mod_market_data_s: {
    detail: 'Every station you pass files its live quotes to the map — route planning stops guessing what the next berth pays.',
    tip: 'Fit it when you are buying or hauling; the market intel pays for the slot.',
  },
  mod_sensor_array_l: {
    detail: 'The survey investment — contacts resolve sixty percent farther out, and every charted site pays two extra research on the way home.',
    tip: 'The explorer\'s eye; the sector opens up around you.',
  },
  mod_survey_suite: {
    detail: 'The prospector\'s package — a third more radar reach, half-again the scan radius, and pings that hold twice as long while you run them down.',
    tip: 'For the long-range prospector: the anomaly fix comes faster.',
  },
  mod_drill_amp: {
    detail: 'Four percent more rich-core window on every seam — a small bonus on one rock, a second fortune across a whole belt.',
    tip: 'For the miner who wants the seam to last, not just the bite.',
  },
  mod_sensor_scrambler_s: {
    detail: 'A quarter off the signature a patrol inspection resolves — the borderline scan rolls start landing in your favor.',
    tip: 'A smaller signature means you slip a scan that would otherwise flag you.',
  },
  mod_sensor_scrambler_m: {
    detail: 'Half off the signature a patrol inspection resolves — the check that would flag a loaded hold comes back clean at knife range.',
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
    detail: 'False-fauna sites mint pings the scanner believes; the contrast pass tags the phantoms so only real contacts hold a lock.',
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
    detail: 'A dropped charge that waits for a hull to cross it, then detonates into a directional throw.',
    tip: 'Seed your wake; the pursuer triggers it and gets thrown off the line.',
  },
  mod_afterburner_m: {
    detail: 'A hard shove on demand — a short burst of top speed on a cooldown.',
    tip: 'The way out of a closing ring, or the way into a kill you are chasing.',
  },
  mod_splitburner_m: {
    detail: 'The Reach\'s runner burner — over half again on the top speed for six seconds at a stretch, ready again in ten.',
    tip: 'For the door-out build: outrun the whole ring, not just the patrol behind it.',
  },
  mod_repair_nanobots_m: {
    detail: 'Four hull a second knits itself while you are out of the fight — the damage you limped out with is gone before the next swarm forms.',
    tip: 'For the long run: the hull comes back to the fight instead of staying gone.',
  },
  mod_targeting_computer_m: {
    detail: 'Fire-control assist — the battery reaches farther and hits harder by a flat percentage.',
    tip: 'The quiet multiplier on a full battery; a percentage on a gun is a lot on a rack.',
  },
  mod_shield_hardener_m: {
    detail: 'A hardener that takes a cut out of every hit — the shield shrugs all flavors of fire.',
    tip: 'For the hull that expects to take fire from every direction at once.',
  },
  mod_triangulation_suite_s: {
    detail: 'An onboard bearing solver — an anomaly fix closes a scan pass sooner.',
    tip: 'For the surveyor — anomalies resolve a pulse sooner, out of harm\'s way.',
  },
  mod_thermal_sink_s: {
    detail: 'A quarter more heat shed every second on each mounted gun — the overheat lockout arrives a full burst later than they expect.',
    tip: 'For the trigger-happy build: the guns stay hot less.',
  },
  mod_thermal_sink_m: {
    detail: 'A boosted heatsink — the same loop pushed harder for a longer firing window.',
    tip: 'For the ship that wants to keep firing past the first vent.',
  },
  mod_drone_bay_l: {
    detail: 'A drone cradle that launches a fighter on its own — a second hull in the water.',
    tip: 'The drone fights its own fight; you get a wing that never tires.',
  },
  mod_jump_drive_m: {
    detail: 'The T2 fold — the jump charges in five and a half seconds instead of eight, sips fifteen percent less fuel, and lights a quieter signature getting out.',
    tip: 'For the long-jump run: a bigger step between fights.',
  },
  mod_ram_plate: {
    detail: 'Impact plating — ram damage the hull deals scales up, so a deliberate bump pays.',
    tip: 'When the pack chases tight enough to bump — every collision they start becomes damage they take.',
  },
  mod_loot_magnet_s: {
    detail: 'Everything salvageable inside four-twenty meters drifts home unaided — pods and shards board themselves while you keep flying.',
    tip: 'For the cleanup pass: the field feeds itself.',
  },
  mod_deep_scoop_array_m: {
    detail: 'A two-kilometer pickup reach — ore a full field out drifts home without a pass over every rock.',
    tip: 'For the hauler run: sweep the whole ring on one line instead of orbiting every shard.',
  },
  // ---- weapon trait rigs --------------------------------------------------------
  mod_bank_shot: {
    detail: 'Shots bounce off rock — every wall becomes a firing angle.',
    tip: 'Fit it where there is cover; the ricochet is free damage on the pack.',
  },
  mod_smart_bank: {
    detail: 'Bounced shots steer themselves — one turn per bounce, inside a fixed cone toward the nearest hostile.',
    tip: 'The bank that hunts: shoot the wall and the pack catches the turn.',
  },
  mod_piercing_core: {
    detail: 'The shot keeps flying through the hull it hits — the next body in line takes the same round. Rank three pierces three deep.',
    tip: 'For the tight pack: one pull hits the hull behind the hull you aimed at.',
  },
  mod_forked_core: {
    detail: 'First contact hatches the round into two weaker children — one aimed hit becomes a small volley.',
    tip: 'For when you want more area than aim; the swarm takes both halves.',
  },
  mod_twin_mount: {
    detail: 'The extra round is a root sibling at reduced payload — volume per pull goes up, per-shot weight goes down.',
    tip: 'For the battery that wants more volume; the gun runs hotter for the same trigger.',
  },
  mod_triad_mount: {
    detail: 'Three root rounds where there was one — wider coverage per pull at a steeper heat cost.',
    tip: 'For the close-range wall of fire; the heat cost is the trade.',
  },
  mod_relay_arc: {
    detail: 'The first contact hops to two more hulls in range — a single hit starts a small chain.',
    tip: 'For the swarm that wants to stay close together.',
  },
  mod_bank_relay: {
    detail: 'Bounced contacts can start a chain; direct hits cannot — ricochet and arc in one rig.',
    tip: 'For the bank-shot build that wants the ricochet to be the thing that hits.',
  },
  mod_gravity_tag: {
    detail: 'A hit marks the hull so gravity fields and wells grip it harder.',
    tip: 'For the well-and-bank build: paint first, then drop the field.',
  },
  mod_ion_payload: {
    detail: 'Ion stacks choke the target\'s capacitor regen to seventy percent and prime every conductive follow-up — the opener the arc weapons are built for.',
    tip: 'For the setup gun: prime the target, then let the second shot do more than it should.',
  },
  mod_incendiary_payload: {
    detail: 'Burning stacks to three and keeps ticking while your sights are already on the next hull — the damage that pays for walking away.',
    tip: 'For the long hold: the hit keeps paying after the trigger lets go.',
  },
  mod_cryo_payload: {
    detail: 'Each cryo stack saps the locked hull\'s control — it cannot juke, so the finishing blow is aimed at a fixed point.',
    tip: 'For the one-two punch: freeze first, then finish.',
  },
  mod_cryo_gyros: {
    detail: 'Two field nodes orbit the hull and freeze what passes close — the ring does nothing unless you fly a node onto the target.',
    tip: 'For the swarm that wants to swarm you: the orbit does the catching.',
  },
  mod_tether_capacitor: {
    detail: 'Shots against the massline anchor hit up to half again as hard — the capacitor only pays on the tethered hull.',
    tip: 'For the massline build: latch first, then the guns pay more.',
  },
  mod_conductive_path: {
    detail: 'Chains jump only to ionized hulls — prime the pack first and the arc goes where the film is.',
    tip: 'For the conductive-primer build: ionize the pack — the chain only jumps to painted hulls.',
  },
  mod_storm_carom: {
    detail: 'Bounced hits chain through ionized hulls — one bounce, two hops, and a direct hit never starts it.',
    tip: 'For the build that wants the wall to do the work.',
  },
  mod_herald_fan: {
    detail: 'A wider volley cone with no extra rounds and no damage change — coverage costs a tick of heat.',
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

function prettyStatus(statusId) {
  return String(statusId)
    .replace(/^status_/, '').replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Grammar-rig stack entries -> readable chips: the buyer-facing answer to "what does
// this trait change". [label, unit, textOverride?] — mode supplies the sign
// (add='+', mul='×', set=bare). A mul entry at 1 is an identity declaration, not a
// change, and is skipped at the call site.
const TRAIT_STACK_CHIPS = {
  'emitter.rootCount':                     ['Rounds'],
  'emitter.spreadDeg':                     ['Spread', '°'],
  'emitter.rofMult':                       ['Rate'],
  'emitter.projSpeedMult':                 ['Shot speed'],
  'propagation.pierce':                    ['Pierce'],
  'propagation.split.count':               ['Split children'],
  'propagation.split.payloadScale':        ['Split dmg'],
  'propagation.chain.count':               ['Chain hops'],
  'propagation.chain.range':               ['Chain range'],
  'propagation.chain.requireBounce':       ['Chain rule', '', () => 'needs a bounce'],
  'propagation.orbit.count':               ['Orbit nodes'],
  'propagation.orbit.radius':              ['Orbit radius'],
  'propagation.orbit.effectRadius':        ['Node radius'],
  'propagation.orbit.periodTicks':         ['Orbit period', ' ticks'],
  'trajectory.bounces':                    ['Bounces'],
  'trajectory.speed':                      ['Shot speed'],
  'trajectory.inheritedVelocity':          ['Inherit velocity'],
  'trajectory.afterBounceSteer.coneDeg':   ['Bank cone', '°'],
  'trajectory.afterBounceSteer.maxTurnDeg':['Bank steer', '°'],
  'costs.payloadScale':                    ['Payload'],
  'costs.heatScale':                       ['Heat'],
  'costs.tetherAnchorPayloadScale':        ['Tethered dmg'],
};

// Stack targets whose value is a multiplier scale — a set entry at ×1.5 buffs and
// at ×0.55 penalizes, while a bare rounded integer renders both as "1"/"2" and
// lies about which direction the change runs.
const SCALE_STACK_TARGETS = new Set([
  'emitter.rofMult',
  'emitter.projSpeedMult',
  'propagation.split.payloadScale',
  'costs.payloadScale',
  'costs.heatScale',
  'costs.tetherAnchorPayloadScale',
]);

function traitStackValue(entry) {
  const v = entry.perRank;
  if (entry.mode === 'add') return `+${num(v)}`;
  if (entry.mode === 'mul' || SCALE_STACK_TARGETS.has(entry.target)) return `×${num(v, 2)}`;
  return num(v, 2);
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
  push('DPS', num(def.dps, 1));
  push('Rate', def.rof != null ? `${num(def.rof, 1)}/s` : null);
  push('Proj. speed', num(def.projSpeed));
  push('Range', num(def.range));
  push('Tracking', TRACKING_LABEL[def.tracking] || def.tracking);
  push('Lock', def.lockTimeS != null ? `${num(def.lockTimeS, 1)} s` : null);
  push('Splash', num(def.splashDmg));
  push('Splash radius', num(def.splashRadius));
  push('Impulse', num(def.impulsePerHit));
  push('Tumble', num(def.tumbleTorque));
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
  push('Splits', def.emergentSplit ? `×${num(def.emergentSplit.count)}` : null);
  push('Arcs', def.emergentChain ? `${num(def.emergentChain.count)} · R${num(def.emergentChain.range)}` : null);
  push('Bounces', def.emergentBounces != null ? num(def.emergentBounces) : null);
  push('Generations', def.lineageGenerationMax != null ? num(def.lineageGenerationMax) : null);
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
  const evo = SURVIVAL_EVOLUTIONS.find((e) => e.defId === def.id);
  // Rep-exclusive hardware reads as purchasable until the click refuses it — name
  // the standing requirement up front, same convention as the service counter's Gate.
  if (def.exclusivity && typeof def.exclusivity === 'object') {
    const exMeta = FACTION_META.find((f) => f && f.id === def.exclusivity.factionId);
    push('Gate', `Requires Allied — ${(exMeta && (exMeta.name || exMeta.short)) || 'its faction'}`);
  }
  push('Synthesis', evo
    ? evo.consumes.map((id) => MODULE_BY_ID.get(id)?.name || id).join(' + ')
    : null);
  // Grammar-rig traits: surface the stack deltas as chips — Rounds/Spread/Heat/Pierce/
  // Bounces/Chain/Orbit are the numbers that decide the pick, otherwise the card can
  // only say Mass and Energy draw.
  const trait = ATTACK_TRAIT_BY_ID[def.id];
  if (trait) {
    if (trait.maxRank > 1) push('Rank', `up to ${trait.maxRank}`);
    for (const s of Array.isArray(trait.stack) ? trait.stack : []) {
      if (!s || (s.mode === 'mul' && s.perRank === 1)) continue;
      const spec = TRAIT_STACK_CHIPS[s.target];
      if (!spec) continue;
      const [label, unit = '', text] = spec;
      push(label, text ? text(s.perRank) : `${traitStackValue(s)}${unit}`);
    }
    const applies = (trait.payload || [])
      .filter((p) => p && p.kind === 'status' && p.statusId)
      .map((p) => prettyStatus(p.statusId));
    push('Applies', applies.length ? applies.join(', ') : null);
    const chainReq = trait.propagation && trait.propagation.chain && trait.propagation.chain.prerequisiteStatus;
    push('Chain target', chainReq ? `${prettyStatus(chainReq)} only` : null);
  }
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
  push('Mining DPS', def.dps != null && def.slotType === 'mining' ? num(def.dps, 1) : null);
  push('Mining range', def.range != null && def.slotType === 'mining' ? num(def.range) : null);
  push('Rare ore', def.rareOreChance != null ? pct(def.rareOreChance) : null);
  push('Ore flow', def.directToCargo === true ? 'straight to cargo' : null);
  push('Mass', num(def.mass));
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
export const SERVICE_DOSSIER = {
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
    stats.push({ label: 'Deployed', value: '4 unfitted · 8 with rack' });
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
