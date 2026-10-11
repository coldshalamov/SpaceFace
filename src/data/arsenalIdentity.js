// Player-facing arsenal identities. Exact stable IDs; no guessing from a weapon's name.
// This presentation catalog changes neither fitting legality nor simulation tuning.
const rows = [
  ['wpn_snarl_s', 'web', 'Pin two bodies with a web and let their struggle pull the fight apart.'],
  ['wpn_pulse_laser_s', 'pulse', 'Quick, precise bolts that nudge light hulls. Keep the nose on target and leave room to cool.'],
  ['wpn_pulse_laser_m', 'pulse-heavy', 'Heavier pulse bolts with a stronger shove. A steady aim beats spraying the room.'],
  ['unique_mirrorjaw_pulse', 'pulse-mirror', 'A fast pulse volley with a sharper follow-up. Keep pressure on a single opening.'],
  ['wpn_autocannon_s', 'slug', 'Armor-biting slugs kick light hulls sideways. Aim off-center to spoil their firing line.'],
  ['wpn_autocannon_m', 'slug-heavy', 'Heavy slugs bite armor and rock light ships. Work the recoil in measured bursts.'],
  ['unique_ironsong_ac', 'slug-ironsong', 'A tighter, faster heavy volley. Less bite per slug, more pressure between openings.'],
  ['wpn_flak_turret_s', 'flak', 'A tracking flak turret that also intercepts incoming missiles. Its firing arc leaves your rear exposed.'],
  ['wpn_concussion_cannon_s', 'concussion', 'Punch light hulls into rocks. Direct damage is low; the collision is the payoff.'],
  ['wpn_concussion_cannon_m', 'concussion-heavy', 'A heavy momentum punch. Line up a ship, a rock and the impact you want to cause.'],
  ['wpn_bank_stream_m', 'bank', 'A fast stream that ricochets off stone. Use the wall to reach around a firing line.'],
  ['wpn_beam_laser_m', 'beam', 'Hold a continuous cutting beam on the target. Break contact to let the gun cool.'],
  ['unique_veil_cutter', 'beam-veil', 'A longer-reaching precision beam. It holds a clean cut but heats faster than the stock laser.'],
  ['wpn_heavy_beam_l', 'beam-heavy', 'A long-range sustained burn. Keep the target under the beam and watch your capacitor.'],
  ['unique_lighthouse_heavy_beam', 'beam-lighthouse', 'A brighter, longer heavy beam with a harder heat bill. Commit to an opening, then vent.'],
  ['wpn_railgun_m', 'rail', 'A fast armor-piercing spear with a solid kick. Lead the target; a missed shot has a long pause.'],
  ['wpn_siege_lance_l', 'siege', 'A huge spinal penetrator. Turn the whole ship to line up its devastating, slow-cycling shot.'],
  ['wpn_plasma_cannon_m', 'plasma', 'Luminous slugs burst into a hot splash. Clustered targets pay for each other.'],
  ['wpn_missile_rack_m', 'missile', 'Guided missiles chase a locked target and explode on contact. Give the lock time to settle.'],
  ['unique_nestbreaker_rack', 'missile-nest', 'Paired submunitions chase the same opening. Each warhead is lighter; the combined salvo is heavier.'],
  ['wpn_torpedo_l', 'torpedo', 'A slow-turning heavy warhead with a broad blast. Best against a large target with little room to dodge.'],
  ['wpn_emp_disruptor_m', 'emp', 'Bypasses shields to disable ship systems. Use the opening to ram, capture or switch to a hull-damaging weapon.'],
  ['wpn_gravity_marker_s', 'marker', 'Tag a body so wells and sinks grip it harder. The mark prepares your next move; it is not a killing shot.'],
  ['wpn_momentum_sink_s', 'sink', 'Latch a ship to your motion, or tag a rock and burn away. Trigger again to release the stored slingshot.'],
  ['wpn_inertial_shunt_s', 'shunt', 'A fitted ram plate transfers your closing speed into the other hull. The collision does the work.'],
  ['wpn_vector_mine_m', 'vector-mine', 'Drop a scatter charge that throws nearby bodies apart. It deals no direct damage; hard landings still hurt.'],
  ['wpn_gravity_well_m', 'wellhead', 'Draw a fight into a sustained gravity well. Follow the clump with a blast or a heavy body.'],
  ['wpn_rcs_disruptor_m', 'rcs', 'Interrupt steering and leave the target drifting. Strike before its helm recovers.'],
  ['wpn_sticky_detonator', 'sticky', 'Plant charges on hulls or scenery, then detonate them together. The blast throws fragments and can cook volatile targets.'],
  ['wpn_conductive_primer', 'primer', 'Coat a body so shocks can arc through nearby conductive targets. Bunch them together before the payoff.'],
  ['tool_grav_anchor', 'grav-anchor', 'Shoot two different bodies to spring-link them. The line contracts and turns their mass into a collision.'],
  ['wpn_thermal_cooker', 'cooker', 'Hold heat on a target: rock fractures, fuel cooks and hot machinery fails. A brief touch only starts the job.'],
  ['wpn_mass_driver', 'mass-driver', 'Launch a massive slug that kicks you backward and the target forward. Damage comes from the physical aftermath.'],
  ['tool_polarity_inverter', 'polarity', 'Shots alternate positive and negative charge. Opposites pull together; matching poles push apart.'],
  ['tool_viscosity_field', 'viscosity', 'Lay a short-lived gel field ahead of the nose. Crossing bodies lose motion; heat can ignite the trap.'],
  ['tool_hardlight_prism', 'prism', 'Place an angled reflector ahead of you. Bank a cutting beam through it or make a nearby surface reflective.'],
  ['tool_thruster_hijacker', 'hijacker', 'Attach a rogue thruster that spins and drives its host. Let the room finish what the dart starts.'],
  ['tool_seismic_gong', 'gong', 'Turn a struck body into a pulsing shock source. A heavy host makes the surrounding pile jump.'],
  ['tool_quantum_sympathy', 'sympathy', 'Shoot two different bodies to link their impulses. Hit one and the other shares the kick.'],
  ['bomb_frag', 'frag', 'A drifting fragment cassette. Clear its blast before proximity, fuze or your detonator sets it off.'],
  ['bomb_concussion', 'drum', 'A wide radial shove with no direct damage. Place it beside a pile and let the collisions finish the job.'],
  ['bomb_singularity', 'singularity', 'A moving gravity source gathers a clump, crushes it, then collapses. Follow its drift before committing a second blast.'],
  ['bomb_goo', 'tar', 'A clinging tar field kills thrust and corrodes caught hulls. Leave it across a pursuer’s line.'],
  ['bomb_emp', 'static', 'An ion pulse reaches through shields and knocks out subsystems. Follow with a hull-breaking attack.'],
  ['bomb_thermite', 'thermite', 'A hot splash leaves targets burning after the blast. Cluster them before releasing the canister.'],
  ['bomb_scrambler', 'havoc', 'A sideways blast tumbles hulls and interrupts their aim. Use the spin to open a collision.'],
  ['bomb_anchor', 'ballast', 'A ballast pulse makes caught ships heavy and sluggish. Their momentum becomes harder to turn.'],
  ['power_charge', 'charge', 'Throw an impulse charge that sticks to a body. Detonate it when the shove will cause a collision.'],
  ['power_detonate', 'detonate', 'Trigger armed charges and drift bombs together. Clear the blast before committing.'],
  ['power_massline', 'massline', 'Latch a body, reel and swing. Release the line to spend the momentum you built.'],
  ['field_seed_standard', 'seed', 'Launch a temporary anchor toward the aim point. Hitch to it before the anchor expires.'],
  ['field_well_standard', 'well', 'Place a well at the aim point and pull loose bodies into a pile. The emitter can be destroyed.'],
  ['field_repulsor_standard', 'repulsor', 'Drop a repulsor under the ship. Its expanding shove clears space and piles bodies at the edge.'],
  ['field_cone_standard', 'cone', 'Toggle a forward gravity plow. Sweep bodies into each other; turn it off when you want the lane back.'],
  ['field_skim_standard', 'skim', 'Toggle the scoop sheet and graze a planet’s harvest band. Open space has nothing to collect.'],
  ['field_anchor_snare_standard', 'snare', 'Catch bodies around an anchor and drag them into its orbit. Use the gathering mass as a hazard.'],
  ['power_gyre', 'gyre', 'Hold to gather rocks and wrecks into a growing ball. Release to bowl it through the fight; cargo stays collectible.'],
  ['power_scan', 'scan', 'Pulse the scanner to expose contacts and resource seams. A return tells you where to work next.'],
  ['power_bullet_time', 'time', 'Slow the moment to line up a precise move. Release to spend the motion you prepared.'],
  ['mod_gravity_bumper_s', 'bumper', 'Boost into a body to throw it from the nose. More closing speed means a harder shove.'],
  ['mod_gravity_bumper_s_mk2', 'bumper-heavy', 'Boost with a wider, stronger gravity bumper. The upgrade stays active while your boost is burning.'],
  ['mod_fire_lance_s', 'fire-lance', 'Boost to light a narrow burning lance on the nose. Drive it through a target while the boost lasts.'],
  ['mod_fire_lance_s_mk2', 'fire-lance-heavy', 'Boost with a longer, hotter nose lance. Keep contact while the boost meter is paying for it.'],
  ['mod_grip_bumper_s', 'grip', 'Boost to catch a light hostile on the nose. Carry it into the pile, then release boost to let it go.'],
  ['mod_grip_bumper_s_mk2', 'grip-heavy', 'Boost with a wider grip to catch and carry a hostile hull. Release boost to release the catch.'],
];

export const ARSENAL_IDENTITIES = Object.freeze(Object.fromEntries(rows.map(([id, glyph, sentence]) =>
  [id, Object.freeze({ id, glyph, sentence })])));

export function arsenalIdentity(id) {
  return ARSENAL_IDENTITIES[typeof id === 'string' ? id : id?.defId || id?.id] || null;
}

/** Authored meaning wins over stale copy; unknown/modded equipment keeps its own description. */
export function arsenalSentence(def) {
  return arsenalIdentity(def)?.sentence || def?.sentence || def?.description || '';
}
