// src/data/enemies.js – canonical enemy role defs (base 8 + variety roles).
// 3-layer model: shield -> armor -> hull. Stats are BASE (pre-dangerTier scaling).
// shieldRegenCapable: only advanced hulls mount regenerating deflector modules; early enemies
// keep shields as a one-time buffer but shieldRegen is ignored unless this flag is true.
// weapon IDs use wpn_ prefix; loot drop IDs use cmdty_ prefix; shipId uses ship_ prefix.
// Pure data, no imports.
//
// VISUALS: each enemy carries a `silhouette` field consumed ONLY by the render track
// (src/render/visualFactory.js). When present it overrides the ship-def family lookup so the
// enemy reads as its OWN hostile silhouette — not a recolored player hull. Values map to the
// ENEMY_FAMILY_BUILDERS table. shipId still drives gameplay stats; silhouette drives appearance.

// Early-game TTK contract (starter Pulse Laser S, dmg 8, ~5.5 rps, perfect hits):
//   wasp ~3s, reaver ~8–10s, corsair ~15s, bruiser tanky but never immune.
// armorFlat must stay well below starter shot damage — flat DR ≥ dmg zeroes residual damage
// after the shield layer and made bruisers literally unkillable with the Hitch gun.
export const MEDIUM_FAMILY_ENEMY_IDS = Object.freeze([
  'marauder_brawler',
  'lancer_sniper',
  'hostile_interceptor',
  'bulwark_escort',
  'corsair_raider',
  'torcher_denial',
]);

export const ENEMY_TYPES = [
  {
    id: 'mote_swarmer', name: 'Mote', shipId: 'ship_wasp',
    silhouette: 'mote_quad', factionId: 'faction_reach',
    aiArchetype: 'swarmer', levelRange: [1, 3], fixedCombatStats: true,
    combatDoctrineId: 'interceptor_flyby',
    hull: 12, armor: 0, armorFlat: 0, shield: 0, shieldRegen: 0, cap: 20, capRegen: 8,
    maxSpeed: 110, accel: 88, turnRate: 2.5, collisionRadius: 5, mass: 6,
    weapons: [{ id: 'wpn_pulse_laser_s', dmgOverride: 1, rofOverride: 0.6 }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 145, leashRadius: 1900 },
    behavior: 'loose cloud flybys; fragile alone, readable as a moving pack',
    bountyCr: 0, shipClass: 'drone', loot: null,
  },
  {
    id: 'wasp_swarmer', name: 'Wasp Swarmer', shipId: 'ship_wasp',
    silhouette: 'drone_swarm', factionId: 'faction_reach',
    aiArchetype: 'swarmer', levelRange: [1, 3], fixedCombatStats: true,
    combatDoctrineId: 'interceptor_flyby',
    hull: 55, armor: 8, armorFlat: 0, shield: 25, shieldRegen: 5, cap: 60, capRegen: 20,
    // Overnight B1 fairness: slower zip, softer DPS so early fights are readable.
    maxSpeed: 118, accel: 96, turnRate: 2.35, collisionRadius: 12, mass: 16,
    weapons: [{ id: 'wpn_pulse_laser_s', dmgOverride: 3, rofOverride: 2.4 }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 180, leashRadius: 2200 },
    behavior: 'strafe/orbit, packs of 3-6',
    bountyCr: 120, shipClass: 'fighter',
    loot: {
      creditsRange: [20, 60],
      drops: [{ id: 'cmdty_scrap_metal', chance: 0.5, qtyRange: [1, 3] }],
    },
  },
  // ── PR95 wave 1: the rest of the swarmer family (design/arcade-core/12_SWARMER_FAMILY.md) ──
  // The shared design grammar for these four — capability, counter verb, tell channels, loot read
  // and the mass/tumble invariants — lives in src/data/swarmerFamily.js, which imports THIS file.
  // Nothing below scales with level: harder sectors send different COMPOSITIONS, never an
  // inflated copy of the same hull.
  //
  // TTK against the starter Pulse Laser S (dmg 8, ~5.5 rps, perfect hits) is the whole light-tier
  // budget: effective pool = shield + armor + hull.
  {
    // DART — pure speed. Its threat is the closing rate and the fact that it is never where your
    // lead was; the counter is to stop chasing and cross its lane, because turnRate 1.35 means it
    // cannot re-aim inside its own pass. Thinnest hull in the game on purpose: 22 = three starter
    // pulses, matching the authored "dies to 2-3 hits" read. No shield, no armor — nothing to
    // grind, so a clean burst is a clean kill and a missed burst costs a whole re-approach.
    id: 'dart_swarmer', name: 'Dart', shipId: 'ship_wasp',
    silhouette: 'dart_needle', factionId: 'faction_reach',
    aiArchetype: 'swarmer', levelRange: [1, 4], fixedCombatStats: true,
    combatDoctrineId: 'interceptor_flyby',
    hull: 22, armor: 0, armorFlat: 0, shield: 0, shieldRegen: 0, cap: 40, capRegen: 14,
    // Fastest light hull in the catalog (Corsair 147 is the previous ceiling) and the worst turner
    // in its own class — that pairing IS the entry. accel is high so the re-approach reads as a
    // committed run-up rather than a drift.
    maxSpeed: 172, accel: 154, turnRate: 1.35, collisionRadius: 8, mass: 10,
    weapons: [{ id: 'wpn_pulse_laser_s', dmgOverride: 3, rofOverride: 1.5 }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 150, leashRadius: 2400 },
    telegraph: { bark: 'warn', line: 'Darts on the run-in. They cannot turn — cross the lane.', cue: 'engine_flare' },
    counterHint: 'cross_the_lane_do_not_chase',
    behavior: 'high-velocity straight passes in loose files of 4-7; never orbits, extends wide and comes back',
    bountyCr: 90, shipClass: 'fighter',
    loot: {
      // They carry payroll: the credit line is the read, materials are almost absent.
      creditsRange: [70, 170],
      drops: [{ id: 'cmdty_scrap_metal', chance: 0.18, qtyRange: [1, 2] }],
    },
  },
  {
    // FLEA — a weak hull-anchored snare with a visible wind-up, then a real flee. It reuses the
    // EXISTING anchor-snare field idiom (src/data/fields.js anchorSnare) at a fraction of the
    // controller's authority: radius 118 vs 235, strength 62 vs 185, damping 1.15 vs 3.2, and it
    // may only hold four bodies. That is a tickle you fly out of, not a lock.
    //
    // Runtime consumers must anchor the field to the Flea's hull, respect this family cap, and
    // activate it only during the authored spool/hold cycle. Those requirements travel with the
    // spawn record; the behavior packet is responsible for making them true on the live route.
    id: 'flea_swarmer', name: 'Flea', shipId: 'ship_wasp',
    silhouette: 'flea_grapnel', factionId: 'faction_reach',
    aiArchetype: 'swarmer', levelRange: [2, 5], fixedCombatStats: true,
    combatDoctrineId: 'field_anchor_controller',
    hull: 55, armor: 6, armorFlat: 0, shield: 18, shieldRegen: 0, cap: 70, capRegen: 20,
    maxSpeed: 124, accel: 102, turnRate: 2.6, collisionRadius: 10, mass: 12,
    weapons: [{ id: 'wpn_pulse_laser_s', dmgOverride: 2, rofOverride: 1.1 }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 210, leashRadius: 2200 },
    fieldAnchor: {
      defKey: 'anchorSnare',
      spinupTicks: 45,   // 0.75 s of readable wind-up before the radius has any authority at all
      radius: 118,
      strength: 62,
      damping: 1.15,
      maxAffected: 4,
      presentationTag: 'hostile',
      // Pack-scale bound: the sector's field slots are shared with the player's Well/Repulsor, and
      // a five-Flea pack would otherwise take every one. The field behavior must honor this cap.
      familyCap: 2,
      familyKey: 'flea_snare',
    },
    telegraph: { bark: 'warn', line: 'Flea spooling a drag rig. Shove it or shoot it — do not sit in it.', cue: 'field_spool' },
    counterHint: 'displace_the_anchor_or_kill_it',
    behavior: 'closes, plants a weak drag field with a visible wind-up, holds it briefly, then genuinely runs',
    bountyCr: 140, shipClass: 'fighter',
    loot: {
      creditsRange: [30, 90],
      drops: [
        { id: 'cmdty_electronics', chance: 0.45, qtyRange: [1, 2] },
        { id: 'cmdty_comp_circuitry', chance: 0.3, qtyRange: [1, 2] },
      ],
    },
  },
  {
    // SKITTER — terrain hugger. The terrainAmbush record is the contract for a dedicated encounter
    // behavior: deterministic far-side rock placement, a passive dust tell, and a spring only when
    // the player closes, shoots, or removes the cover. The catalog does not claim that behavior is
    // present merely because the data exists.
    //
    // The counter is to take the cover away — break, tether or shove the rock — which is why its
    // stat line is unremarkable. It is not tanky; it is *behind something*.
    id: 'skitter_swarmer', name: 'Skitter', shipId: 'ship_wasp',
    silhouette: 'skitter_lowprofile', factionId: 'faction_reach',
    aiArchetype: 'swarmer', levelRange: [2, 6], fixedCombatStats: true,
    combatDoctrineId: 'interceptor_flyby',
    hull: 60, armor: 10, armorFlat: 0, shield: 15, shieldRegen: 0, cap: 80, capRegen: 20,
    maxSpeed: 106, accel: 94, turnRate: 2.85, collisionRadius: 11, mass: 14,
    weapons: [{ id: 'wpn_pulse_laser_s', dmgOverride: 3, rofOverride: 2.0 }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 190, leashRadius: 1800 },
    // Dedicated rock-nest behavior consumes this; absent means an ordinary spawn ring.
    terrainAmbush: { nest: 'rock', hugRadiusWu: 190 },
    telegraph: { bark: 'warn', line: 'Dust off the rocks — Skitters are nested in the field.', cue: 'rock_dust' },
    counterHint: 'strip_the_cover_break_or_move_the_rock',
    behavior: 'nests behind asteroids, opens from cover, threads back into the field between passes',
    bountyCr: 160, shipClass: 'fighter',
    loot: {
      // They live in rocks, so they carry rock.
      creditsRange: [20, 70],
      drops: [
        { id: 'cmdty_ore_iron', chance: 0.6, qtyRange: [2, 5] },
        { id: 'cmdty_silicate', chance: 0.45, qtyRange: [2, 6] },
      ],
    },
  },
  {
    // EMBER — volatile. deathCookOff is the runtime contract for a future bounded radial impulse
    // through the existing physics-authority/provenance path. It specifies zero blast damage: the
    // Ember should add a place to stand, not hidden DPS. The behavior packet owns that execution.
    //
    // brawler_commit is the honest doctrine here: it must want to be CLOSE, or its death is never
    // near anything worth moving.
    id: 'ember_swarmer', name: 'Ember', shipId: 'ship_wasp',
    silhouette: 'ember_corecage', factionId: 'faction_reach',
    aiArchetype: 'swarmer', levelRange: [2, 6], fixedCombatStats: true,
    combatDoctrineId: 'brawler_commit',
    hull: 50, armor: 6, armorFlat: 0, shield: 20, shieldRegen: 0, cap: 70, capRegen: 18,
    maxSpeed: 110, accel: 88, turnRate: 2.05, collisionRadius: 11, mass: 15,
    weapons: [{ id: 'wpn_pulse_laser_s', dmgOverride: 2, rofOverride: 1.8 }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 170, leashRadius: 2000 },
    // Mirrors the authored EMBER_COOK_OFF record; kept inline because enemies.js is import-free.
    deathCookOff: {
      radiusWu: 130,
      impulse: 340,
      maxAffected: 12,
      provenance: 'ember_cook_off',
      cueId: 'swarmer_ember_cook_off',
    },
    telegraph: { bark: 'warn', line: 'Ember core is live. Choose where that one dies.', cue: 'engine_flare' },
    counterHint: 'aim_the_blast_pop_it_next_to_something',
    behavior: 'presses to knife range and stays; its reactor cook-off shoves nearby bodies on death',
    bountyCr: 170, shipClass: 'fighter',
    loot: {
      // It burns its own materials on the way out; the payout is in credits.
      creditsRange: [90, 220],
      drops: [{ id: 'cmdty_scrap_metal', chance: 0.22, qtyRange: [1, 2] }],
    },
  },
  // ── PR95 wave 2: medium-family admission (design/arcade-core/13_MEDIUM_FAMILY.md) ──
  // These rows establish stable ids, fixed combat budgets, setup verbs, rewards, and the common
  // visible-retreat handoff. `mediumSetup.runtime` and `visibleRetreat.runtime` are deliberately
  // `unwired`: later behavior/presentation packets must consume them before claiming the verbs or
  // cues on the player route. Difficulty comes from encounter composition, never level inflation.
  {
    id: 'marauder_brawler', name: 'Marauder', shipId: 'ship_bastion',
    factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [3, 8], fixedCombatStats: true,
    combatDoctrineId: 'brawler_commit',
    hull: 145, armor: 45, armorFlat: 1, shield: 45, shieldRegen: 0, cap: 145, capRegen: 22,
    maxSpeed: 105, accel: 84, turnRate: 1.75, collisionRadius: 18, mass: 40,
    weapons: [{ id: 'wpn_autocannon_m' }, { id: 'wpn_pulse_laser_s', dmgOverride: 5 }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 220, leashRadius: 2400 },
    mediumSetup: {
      capability: 'close_shotgun_pressure', counterVerb: 'disrupt_rcs_then_terrain_shove', runtime: 'unwired',
    },
    visibleRetreat: {
      hullFraction: 0.3, smokeCue: 'retreat_smoke', dumpCue: 'retreat_parts_dump',
      bark: 'Marauder is dumping mass and breaking off.', runtime: 'unwired',
    },
    behavior: 'future medium setup: close pressure, then a readable low-hull retreat',
    bountyCr: 360, shipClass: 'corvette', killRewardTier: 'medium',
    loot: {
      creditsRange: [120, 260],
      drops: [
        { id: 'cmdty_munitions', chance: 0.65, qtyRange: [2, 4] },
        { id: 'cmdty_comp_hullplate', chance: 0.35, qtyRange: [1, 2] },
      ],
    },
  },
  {
    id: 'lancer_sniper', name: 'Lancer Sniper', shipId: 'ship_wasp',
    silhouette: 'sniper_lance', factionId: 'faction_reach',
    aiArchetype: 'sniper', levelRange: [2, 5], fixedCombatStats: true,
    combatDoctrineId: 'ranged_disengager',
    hull: 70, armor: 12, armorFlat: 1, shield: 50, shieldRegen: 6, cap: 120, capRegen: 22,
    maxSpeed: 126, accel: 84, turnRate: 1.5, collisionRadius: 14, mass: 35,
    weapons: [{ id: 'wpn_railgun_m', dmgOverride: 40, rofOverride: 0.7, projSpeedOverride: 700, rangeOverride: 1100 }],
    aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: 760, leashRadius: 3000 },
    mediumSetup: {
      capability: 'rail_reposition', counterVerb: 'close_under_turn_rate_or_well_clump', runtime: 'unwired',
    },
    visibleRetreat: {
      hullFraction: 0.3, smokeCue: 'retreat_smoke', dumpCue: 'retreat_munitions_dump',
      bark: 'Lancer is venting charge and withdrawing.', runtime: 'unwired',
    },
    behavior: 'kite at max range, retreat when closed',
    bountyCr: 260, shipClass: 'fighter', killRewardTier: 'medium',
    loot: {
      creditsRange: [60, 140],
      drops: [
        { id: 'cmdty_electronics', chance: 0.4, qtyRange: [1, 2] },
        { id: 'cmdty_scrap_metal',  chance: 0.6, qtyRange: [2, 4] },
        { id: 'cmdty_munitions',    chance: 0.35, qtyRange: [1, 3] },
      ],
    },
  },
  {
    id: 'hostile_interceptor', name: 'Interceptor', shipId: 'ship_hornet',
    factionId: 'faction_reach',
    aiArchetype: 'pirate', levelRange: [3, 8], fixedCombatStats: true,
    combatDoctrineId: 'interceptor_flyby',
    hull: 92, armor: 18, armorFlat: 1, shield: 42, shieldRegen: 0, cap: 135, capRegen: 24,
    maxSpeed: 158, accel: 132, turnRate: 1.82, collisionRadius: 15, mass: 25,
    weapons: [{ id: 'wpn_autocannon_s' }, { id: 'wpn_pulse_laser_s', dmgOverride: 5 }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 250, leashRadius: 2900 },
    mediumSetup: {
      capability: 'escape_lane_cutoff', counterVerb: 'momentum_sink_then_terrain_walk', runtime: 'unwired',
    },
    visibleRetreat: {
      hullFraction: 0.3, smokeCue: 'retreat_smoke', dumpCue: 'retreat_munitions_dump',
      bark: 'Interceptor drive is shedding load. It is running.', runtime: 'unwired',
    },
    behavior: 'future medium setup: chase and cut escape, then visibly flee at low hull',
    bountyCr: 310, shipClass: 'fighter', killRewardTier: 'medium',
    loot: {
      creditsRange: [90, 210],
      drops: [
        { id: 'cmdty_munitions', chance: 0.55, qtyRange: [2, 4] },
        { id: 'cmdty_comp_circuitry', chance: 0.35, qtyRange: [1, 2] },
      ],
    },
  },
  {
    id: 'bulwark_escort', name: 'Bulwark', shipId: 'ship_bastion',
    factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [4, 9], fixedCombatStats: true,
    combatDoctrineId: 'brawler_commit',
    hull: 155, armor: 55, armorFlat: 2, shield: 125, shieldRegen: 9, shieldRegenCapable: true, cap: 190, capRegen: 26,
    maxSpeed: 88, accel: 58, turnRate: 0.95, collisionRadius: 21, mass: 55,
    weapons: [{ id: 'wpn_pulse_laser_m' }, { id: 'wpn_flak_turret_s', defensiveOnly: true }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 360, leashRadius: 2300 },
    mediumSetup: {
      capability: 'wing_shield_projection', counterVerb: 'emp_strip_or_vector_separate', runtime: 'unwired',
    },
    visibleRetreat: {
      hullFraction: 0.3, smokeCue: 'retreat_smoke', dumpCue: 'retreat_field_parts_dump',
      bark: 'Bulwark link is down. Escort is withdrawing.', runtime: 'unwired',
    },
    behavior: 'future medium setup: project wing shields until stripped or physically separated',
    bountyCr: 470, shipClass: 'corvette', killRewardTier: 'medium',
    loot: {
      creditsRange: [160, 340],
      drops: [
        { id: 'cmdty_comp_circuitry', chance: 0.65, qtyRange: [2, 4] },
        { id: 'cmdty_comp_hullplate', chance: 0.55, qtyRange: [1, 3] },
      ],
    },
  },
  {
    id: 'torcher_denial', name: 'Torcher', shipId: 'ship_drifter',
    factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [3, 8], fixedCombatStats: true,
    combatDoctrineId: 'brawler_commit',
    hull: 118, armor: 28, armorFlat: 1, shield: 54, shieldRegen: 0, cap: 165, capRegen: 25,
    maxSpeed: 116, accel: 90, turnRate: 1.55, collisionRadius: 17, mass: 38,
    weapons: [{ id: 'wpn_plasma_cannon_m', occasional: true }, { id: 'wpn_pulse_laser_s', dmgOverride: 4 }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 290, leashRadius: 2500 },
    mediumSetup: {
      capability: 'plasma_trail_denial', counterVerb: 'bait_trail_then_shove_through_it', runtime: 'unwired',
    },
    visibleRetreat: {
      hullFraction: 0.3, smokeCue: 'retreat_smoke', dumpCue: 'retreat_coolant_dump',
      bark: 'Torcher is dumping coolant and breaking away.', runtime: 'unwired',
    },
    behavior: 'future medium setup: herd with plasma trails and visibly flee at low hull',
    bountyCr: 390, shipClass: 'corvette', killRewardTier: 'medium',
    loot: {
      creditsRange: [130, 290],
      drops: [
        { id: 'cmdty_munitions', chance: 0.55, qtyRange: [2, 5] },
        { id: 'cmdty_comp_circuitry', chance: 0.4, qtyRange: [1, 2] },
      ],
    },
  },
  // ── PR95 wave 3: heavy-family identity (design/arcade-core/14_HEAVY_AND_CAPITAL.md) ──
  // Stable physical-part recipes live in heavyFamily.js and are copied onto spawn data by combat.
  // Every recipe/part behavior is explicitly `runtime: unwired`: these rows establish identity,
  // invariant combat budgets and reward continuity, not detachable parts or new encounter behavior.
  {
    id: 'heavy_gunship', name: 'Gunship', shipId: 'ship_bastion',
    factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [6, 12], fixedCombatStats: true,
    combatDoctrineId: 'brawler_commit',
    hull: 450, armor: 220, armorFlat: 5, shield: 300, shieldRegen: 8, shieldRegenCapable: true,
    cap: 300, capRegen: 30,
    maxSpeed: 72, accel: 42, turnRate: 0.62, collisionRadius: 31, mass: 150,
    weapons: [
      { id: 'wpn_autocannon_m', turret: true },
      { id: 'wpn_autocannon_m', turret: true },
      { id: 'wpn_flak_turret_s', turret: true },
    ],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 390, leashRadius: 2600 },
    heavyPartRecipeId: 'heavy_parts_gunship_v1',
    behavior: 'unwired heavy recipe: turret boat intended to become a drifting barge when stripped',
    counterHint: 'strip_turrets_then_shove_or_ignore',
    bountyCr: 980, shipClass: 'gunship', killRewardTier: 'heavy',
    loot: {
      creditsRange: [260, 680],
      drops: [
        { id: 'cmdty_munitions', chance: 0.7, qtyRange: [3, 7] },
        { id: 'cmdty_alloys', chance: 0.55, qtyRange: [2, 5] },
      ],
    },
  },
  {
    id: 'heavy_ramscoop', name: 'Ramscoop', shipId: 'ship_bastion',
    factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [5, 11], fixedCombatStats: true,
    combatDoctrineId: 'brawler_commit',
    hull: 440, armor: 260, armorFlat: 6, shield: 220, shieldRegen: 0, cap: 280, capRegen: 28,
    maxSpeed: 96, accel: 78, turnRate: 0.42, collisionRadius: 29, mass: 90,
    weapons: [{ id: 'wpn_missile_rack_m', occasional: true }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 150, leashRadius: 2600 },
    heavyPartRecipeId: 'heavy_parts_ramscoop_v1',
    behavior: 'unwired heavy recipe: committed ram intended to overshoot into geometry when dodged',
    counterHint: 'dodge_then_use_terrain_against_its_mass',
    bountyCr: 820, shipClass: 'gunship', killRewardTier: 'heavy',
    loot: {
      creditsRange: [210, 540],
      drops: [
        { id: 'cmdty_comp_hullplate', chance: 0.7, qtyRange: [2, 5] },
        { id: 'cmdty_impulse_charge', chance: 0.35, qtyRange: [1, 3] },
      ],
    },
  },
  {
    id: 'heavy_carrier_lite', name: 'Carrier-lite', shipId: 'ship_atlas',
    factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [7, 13], fixedCombatStats: true,
    combatDoctrineId: 'capital_broadside',
    hull: 500, armor: 180, armorFlat: 4, shield: 320, shieldRegen: 10, shieldRegenCapable: true,
    cap: 340, capRegen: 34,
    maxSpeed: 64, accel: 36, turnRate: 0.48, collisionRadius: 34, mass: 120,
    weapons: [
      { id: 'wpn_flak_turret_s', turret: true },
      { id: 'wpn_pulse_laser_m', turret: true },
    ],
    aiDoctrine: { defaultActivity: 'screen', roe: 'weapons_free', preferredRange: 470, leashRadius: 2800 },
    heavyPartRecipeId: 'heavy_parts_carrier_lite_v1',
    behavior: 'unwired heavy recipe: paired launch bays intended to own a bounded mote/wasp screen',
    counterHint: 'destroy_launch_bays_before_the_screen_grows',
    bountyCr: 1120, shipClass: 'gunship', killRewardTier: 'heavy',
    loot: {
      creditsRange: [300, 760],
      drops: [
        { id: 'cmdty_comp_circuitry', chance: 0.7, qtyRange: [2, 5] },
        { id: 'cmdty_electronics', chance: 0.55, qtyRange: [2, 6] },
      ],
    },
  },
  {
    id: 'heavy_foundry', name: 'Foundry', shipId: 'ship_atlas',
    factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [6, 12], fixedCombatStats: true,
    combatDoctrineId: 'brawler_commit',
    hull: 520, armor: 320, armorFlat: 6, shield: 160, shieldRegen: 0, cap: 320, capRegen: 30,
    maxSpeed: 58, accel: 40, turnRate: 0.55, collisionRadius: 33, mass: 110,
    weapons: [
      { id: 'wpn_plasma_cannon_m' },
      { id: 'wpn_plasma_cannon_m' },
      { id: 'wpn_missile_rack_m', occasional: true },
    ],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 230, leashRadius: 2500 },
    heavyPartRecipeId: 'heavy_parts_foundry_v1',
    behavior: 'unwired heavy recipe: close-range cutters and charged-ore rack intended for lane denial',
    counterHint: 'bait_the_mine_line_then_strip_cutters',
    bountyCr: 1040, shipClass: 'gunship', killRewardTier: 'heavy',
    loot: {
      creditsRange: [280, 700],
      drops: [
        { id: 'cmdty_ore_iron', chance: 0.8, qtyRange: [4, 10] },
        { id: 'cmdty_alloys', chance: 0.65, qtyRange: [2, 6] },
      ],
    },
  },
  {
    id: 'bruiser_brawler', name: 'Bruiser Brawler', shipId: 'ship_bastion',
    silhouette: 'bruiser_armor', factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [3, 7],
    combatDoctrineId: 'brawler_commit',
    hull: 280, armor: 80, armorFlat: 3, shield: 90, shieldRegen: 12, shieldRegenCapable: true, cap: 180, capRegen: 24,
    maxSpeed: 112, accel: 91, turnRate: 1.65, collisionRadius: 20, mass: 70,
    weapons: [{ id: 'wpn_autocannon_m' }, { id: 'wpn_autocannon_m' }, { id: 'wpn_pulse_laser_s' }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 240, leashRadius: 2400 },
    behavior: 'close to <250wu, circle-strafe, relentless pursue',
    bountyCr: 520, shipClass: 'gunship',
    loot: {
      creditsRange: [120, 300],
      drops: [
        { id: 'cmdty_ore_iron',    chance: 0.6, qtyRange: [3, 8] },
        { id: 'wpn_autocannon_m',  chance: 0.05, qtyRange: [1, 1] },
      ],
    },
  },
  {
    id: 'mule_trader', name: 'Fleeing Trader', shipId: 'ship_mule',
    silhouette: 'trader_haul', factionId: 'faction_free',
    aiArchetype: 'fleeing_trader', levelRange: [1, 6],
    combatDoctrineId: null,
    hull: 140, armor: 30, armorFlat: 1, shield: 60, shieldRegen: 8, cap: 100, capRegen: 14,
    maxSpeed: 133, accel: 63, turnRate: 1.2, collisionRadius: 18, mass: 55,
    weapons: [{ id: 'wpn_flak_turret_s', defensiveOnly: true }],
    aiDoctrine: { defaultActivity: 'transit', roe: 'defensive', preferredRange: 420, leashRadius: 2600 },
    behavior: 'flee to nearest station/lane, boost when threatened, shoots only if cornered',
    bountyCr: 0, illegalToKill: true, shipClass: 'frigate',
    loot: {
      creditsRange: [200, 800],
      drops: [
        { id: 'cmdty_consumer_goods', chance: 0.5, qtyRange: [4, 12] },
        { id: 'cmdty_refined_metals', chance: 0.4, qtyRange: [3, 8] },
        { id: 'cmdty_electronics',    chance: 0.25, qtyRange: [2, 5] },
      ],
    },
  },
  {
    id: 'reaver_pirate', name: 'Reaver Pirate', shipId: 'ship_drifter',
    silhouette: 'pirate_swoop', factionId: 'faction_reach',
    aiArchetype: 'pirate', levelRange: [1, 8],
    combatDoctrineId: 'interceptor_flyby',
    hull: 120, armor: 30, armorFlat: 1, shield: 50, shieldRegen: 10, cap: 160, capRegen: 22,
    maxSpeed: 112, accel: 78, turnRate: 1.55, collisionRadius: 18, mass: 60,
    weapons: [{ id: 'wpn_autocannon_s' }, { id: 'wpn_pulse_laser_s', dmgOverride: 6 }, { id: 'wpn_missile_rack_m', occasional: true }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 260, leashRadius: 2600 },
    reinforcements: { type: 'wasp_swarmer', count: [1, 2], hullThreshold: 0.3 },
    behavior: 'aggressive pursue+attack, calls 1-2 swarmers, flees at <20% hull',
    bountyCr: 340, shipClass: 'gunship',
    loot: {
      creditsRange: [100, 400],
      drops: [
        { id: 'cmdty_stolen_goods',  chance: 0.5, qtyRange: [2, 6] },
        { id: 'wpn_pulse_laser_s',   chance: 0.08, qtyRange: [1, 1] },
      ],
    },
  },
  {
    id: 'corsair_raider', name: 'Corsair Raider', shipId: 'ship_hornet',
    silhouette: 'corsair_blade', factionId: 'faction_reach',
    aiArchetype: 'pirate', levelRange: [4, 10], fixedCombatStats: true,
    combatDoctrineId: 'interceptor_flyby',
    hull: 180, armor: 45, armorFlat: 2, shield: 80, shieldRegen: 12, shieldRegenCapable: true, cap: 200, capRegen: 26,
    maxSpeed: 147, accel: 119, turnRate: 2.1, collisionRadius: 18, mass: 45,
    weapons: [{ id: 'wpn_autocannon_m' }, { id: 'wpn_plasma_cannon_m', occasional: true }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 320, leashRadius: 2800 },
    mediumSetup: {
      capability: 'cargo_tow_theft', counterVerb: 'break_tow_then_catch_spill', runtime: 'unwired',
    },
    visibleRetreat: {
      hullFraction: 0.3, smokeCue: 'retreat_smoke', dumpCue: 'retreat_cargo_spill',
      bark: 'Corsair has the cargo. Break the tow before it clears the lane.', runtime: 'unwired',
    },
    behavior: 'mid-tier pirate elite, frontier ambush packs',
    bountyCr: 620, shipClass: 'gunship', killRewardTier: 'medium',
    loot: {
      creditsRange: [200, 600],
      drops: [
        { id: 'cmdty_stolen_goods',  chance: 0.5, qtyRange: [3, 8] },
        { id: 'cmdty_alloys',        chance: 0.35, qtyRange: [2, 6] },
        { id: 'wpn_plasma_cannon_m', chance: 0.06, qtyRange: [1, 1] },
      ],
    },
  },
  {
    id: 'patrol_lawman', name: 'Patrol Interceptor', shipId: 'ship_hornet',
    silhouette: 'patrol_interdict', factionId: 'faction_scn',
    aiArchetype: 'brawler', levelRange: [3, 9],
    combatDoctrineId: 'interceptor_flyby',
    hull: 200, armor: 50, armorFlat: 2, shield: 100, shieldRegen: 14, shieldRegenCapable: true, cap: 220, capRegen: 28,
    maxSpeed: 140, accel: 112, turnRate: 1.95, collisionRadius: 18, mass: 70,
    weapons: [{ id: 'wpn_pulse_laser_m' }, { id: 'wpn_flak_turret_s' }],
    aiDoctrine: { defaultActivity: 'patrol_route', roe: 'lawful_wanted_only', preferredRange: 520, leashRadius: 2600 },
    behavior: 'lawful patrol; hostile only if player wanted; assists at Trusted+ rep',
    bountyCr: 0, factionLawful: true, shipClass: 'gunship',
    loot: {
      creditsRange: [0, 0],
      drops: [{ id: 'cmdty_munitions', chance: 0.3, qtyRange: [1, 3] }],
    },
  },
  {
    id: 'dreadnought_boss', name: "Dreadnought 'Iron Maw'", shipId: 'ship_leviathan',
    silhouette: 'dreadnought_enemy', factionId: 'faction_vael',
    aiArchetype: 'miniboss_capital', levelRange: [10, 15], fixedCombatStats: true,
    combatDoctrineId: 'capital_broadside',
    hull: 6000, armor: 2200, armorFlat: 25, shield: 2400, shieldRegen: 60, shieldRegenCapable: true, shieldRegenDelay: 6, cap: 2000, capRegen: 40,
    maxSpeed: 49, accel: 21, turnRate: 0.3, collisionRadius: 60, mass: 2000,
    weapons: [
      { id: 'wpn_torpedo_l',      count: 2, turret: true },
      { id: 'wpn_heavy_beam_l',   count: 2, turret: true },
      { id: 'wpn_autocannon_m',   count: 6, turret: true },
      { id: 'wpn_flak_turret_s',  count: 4, turret: true },
    ],
    aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: 620, leashRadius: 3400 },
    telegraph: {
      bark: 'warn',
      line: 'Iron Maw is rolling broadside. Cross its bow before the batteries align.',
      cue: 'broadside_charge',
    },
    counterHint: 'Cross the bow or stern during the charge; the next salvo shifts to the opposite flank.',
    heavyPartRecipeId: 'capital_parts_iron_maw_v1',
    subsystems: { turretHp: 300, spawnsSwarmers: true, phases: [0.66, 0.33] },
    reinforcements: {
      packageId: 'iron_maw_screen',
      type: 'wasp_swarmer', count: [2, 4], hullThreshold: 0.5,
    },
    behavior: 'slow fortress, destructible turrets, spawns swarmers, phases at 66%/33%',
    bountyCr: 12000, shipClass: 'capital',
    loot: {
      creditsRange: [4000, 9000],
      guaranteed: [{ id: 'cmdty_exotic_xenium', qtyRange: [10, 25] }],
      drops: [
        { id: 'cmdty_quantum_cores', chance: 1.0, qtyRange: [1, 3] },
        { id: 'wpn_siege_lance_l',   chance: 0.5, qtyRange: [1, 1] },
      ],
      blueprint: true,
    },
  },
  // ── Variety roles (append-only; reuse existing AI archetypes / doctrines / silhouettes) ──
  {
    id: 'mine_layer_jackal', name: 'Mine-Layer Jackal', shipId: 'ship_drifter',
    silhouette: 'pirate_swoop', factionId: 'faction_reach',
    aiArchetype: 'pirate', levelRange: [3, 8],
    combatDoctrineId: 'ranged_disengager',
    hull: 110, armor: 28, armorFlat: 1, shield: 45, shieldRegen: 8, cap: 150, capRegen: 20,
    maxSpeed: 105, accel: 72, turnRate: 1.45, collisionRadius: 18, mass: 58,
    weapons: [
      { id: 'wpn_autocannon_s' },
      { id: 'wpn_missile_rack_m', occasional: true },
      { id: 'wpn_flak_turret_s', defensiveOnly: true },
    ],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 300, leashRadius: 2500 },
    telegraph: { bark: 'warn', line: 'Wake is salted. Turn now or fly through our work.', cue: 'wake_mines' },
    counterHint: 'cut_tether_or_clear_wake',
    behavior: 'mines the wake, prefers cargo and wrecks over clean kills, breaks when outnumbered',
    bountyCr: 380, shipClass: 'gunship',
    loot: {
      creditsRange: [90, 280],
      drops: [
        { id: 'cmdty_stolen_goods', chance: 0.45, qtyRange: [2, 5] },
        { id: 'cmdty_scrap_metal', chance: 0.55, qtyRange: [2, 6] },
        { id: 'wpn_missile_rack_m', chance: 0.05, qtyRange: [1, 1] },
      ],
    },
  },
  {
    id: 'pd_screen_escort', name: 'Point-Defense Screen', shipId: 'ship_bastion',
    silhouette: 'bruiser_armor', factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [4, 9],
    combatDoctrineId: 'interceptor_flyby',
    hull: 200, armor: 55, armorFlat: 2, shield: 80, shieldRegen: 11, shieldRegenCapable: true, cap: 190, capRegen: 24,
    maxSpeed: 100, accel: 80, turnRate: 1.5, collisionRadius: 20, mass: 75,
    weapons: [
      { id: 'wpn_flak_turret_s' },
      { id: 'wpn_flak_turret_s' },
      { id: 'wpn_autocannon_m' },
    ],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 280, leashRadius: 2200 },
    telegraph: { bark: 'warn', line: 'Point-defense curtain spinning up. Hold missiles.', cue: 'pd_curtain' },
    counterHint: 'hold_missiles_use_kinetics_peel_escort',
    behavior: 'screens a leader or wreck claim; shreds missiles and light craft at mid range',
    bountyCr: 480, shipClass: 'gunship',
    loot: {
      creditsRange: [110, 320],
      drops: [
        { id: 'cmdty_munitions', chance: 0.5, qtyRange: [2, 5] },
        { id: 'cmdty_alloys', chance: 0.35, qtyRange: [1, 4] },
        { id: 'wpn_flak_turret_s', chance: 0.06, qtyRange: [1, 1] },
      ],
    },
  },
  {
    id: 'customs_cutter', name: 'Customs Cutter', shipId: 'ship_hornet',
    silhouette: 'patrol_interdict', factionId: 'faction_scn',
    aiArchetype: 'brawler', levelRange: [2, 7],
    combatDoctrineId: 'interceptor_flyby',
    hull: 160, armor: 40, armorFlat: 1, shield: 90, shieldRegen: 12, shieldRegenCapable: true, cap: 200, capRegen: 26,
    maxSpeed: 135, accel: 108, turnRate: 1.9, collisionRadius: 18, mass: 62,
    weapons: [
      { id: 'wpn_pulse_laser_m' },
      { id: 'wpn_emp_disruptor_m', occasional: true },
      { id: 'wpn_flak_turret_s', defensiveOnly: true },
    ],
    aiDoctrine: { defaultActivity: 'patrol_route', roe: 'lawful_wanted_only', preferredRange: 480, leashRadius: 2600 },
    behavior: 'lawful interdiction cutter; hostile only if wanted or contraband scan fails; assists Trusted+ pilots',
    bountyCr: 0, factionLawful: true, shipClass: 'gunship',
    loot: {
      creditsRange: [0, 0],
      drops: [{ id: 'cmdty_electronics', chance: 0.25, qtyRange: [1, 2] }],
    },
  },
  {
    id: 'choir_zealot', name: 'Choir Zealot', shipId: 'ship_wasp',
    silhouette: 'drone_swarm', factionId: 'faction_choir',
    aiArchetype: 'swarmer', levelRange: [3, 8],
    combatDoctrineId: 'interceptor_flyby',
    hull: 70, armor: 10, armorFlat: 0, shield: 40, shieldRegen: 6, cap: 90, capRegen: 22,
    maxSpeed: 125, accel: 105, turnRate: 2.5, collisionRadius: 12, mass: 17,
    weapons: [
      { id: 'wpn_pulse_laser_s', dmgOverride: 4, rofOverride: 2.6 },
      { id: 'wpn_missile_rack_m', occasional: true },
    ],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 200, leashRadius: 2300 },
    behavior: 'ideological pack fighter; ignores cargo, hunts marked symbols and nonbelievers',
    bountyCr: 200, shipClass: 'fighter',
    loot: {
      creditsRange: [30, 90],
      drops: [
        { id: 'cmdty_scrap_metal', chance: 0.4, qtyRange: [1, 3] },
        { id: 'cmdty_medical', chance: 0.2, qtyRange: [1, 2] },
      ],
    },
  },
  {
    id: 'quiet_ghost', name: 'Quiet Ghost', shipId: 'ship_wasp',
    silhouette: 'sniper_lance', factionId: 'faction_quiet',
    aiArchetype: 'sniper', levelRange: [4, 10],
    combatDoctrineId: 'ranged_disengager',
    hull: 85, armor: 15, armorFlat: 1, shield: 55, shieldRegen: 8, cap: 140, capRegen: 24,
    maxSpeed: 130, accel: 90, turnRate: 1.7, collisionRadius: 13, mass: 22,
    weapons: [
      { id: 'wpn_railgun_m', dmgOverride: 36, rofOverride: 0.65, projSpeedOverride: 720, rangeOverride: 1050 },
      { id: 'wpn_emp_disruptor_m', occasional: true },
    ],
    aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: 780, leashRadius: 3200 },
    telegraph: { bark: 'scan', line: 'Ghost already has the shot.', cue: 'sensor_ghost' },
    counterHint: 'break_lock_close_under_cover',
    behavior: 'low-signature sniper; disengages after first alpha, returns from a new bearing',
    bountyCr: 420, shipClass: 'fighter',
    loot: {
      creditsRange: [80, 220],
      drops: [
        { id: 'cmdty_stolen_goods', chance: 0.4, qtyRange: [1, 4] },
        { id: 'cmdty_electronics', chance: 0.35, qtyRange: [1, 3] },
        { id: 'wpn_railgun_m', chance: 0.04, qtyRange: [1, 1] },
      ],
    },
  },
  // ── PR95 wave 4: missing specialist identities (Plan 15) ──
  // These are fixed-stat production identities and ordinary encounter anchors. Their planned
  // specialist verbs and world tells remain explicitly unwired; admission must not be mistaken for
  // radar smear, a repair drone, or kiter acceptance behavior.
  {
    id: 'jammer_specialist', name: 'Jammer', shipId: 'ship_hornet',
    factionId: 'faction_reach',
    aiArchetype: 'sniper', levelRange: [3, 8], fixedCombatStats: true,
    combatDoctrineId: 'ranged_disengager',
    hull: 96, armor: 20, armorFlat: 1, shield: 58, shieldRegen: 0, cap: 130, capRegen: 22,
    maxSpeed: 122, accel: 88, turnRate: 1.55, collisionRadius: 16, mass: 42,
    weapons: [{ id: 'wpn_pulse_laser_s', dmgOverride: 4, rofOverride: 1.4 }],
    aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: 520, leashRadius: 2700 },
    specialistBehavior: {
      capability: 'presentation_only_contact_smear', runtime: 'unwired',
      invariant: 'simulation_contacts_remain_exact',
    },
    specialistWorldTell: { cue: 'antenna_fan_and_static_shimmer', runtime: 'unwired' },
    counterHint: 'kill_or_close_inside_fuzz',
    behavior: 'ordinary ranged hull pending a presentation-only radar-smear specialist runtime',
    bountyCr: 410, shipClass: 'corvette', killRewardTier: 'medium',
    loot: {
      creditsRange: [110, 250],
      drops: [
        { id: 'cmdty_electronics', chance: 0.7, qtyRange: [2, 4] },
        { id: 'cmdty_comp_circuitry', chance: 0.4, qtyRange: [1, 2] },
      ],
    },
  },
  {
    id: 'hostile_repair_tender', name: 'Hostile Repair Tender', shipId: 'ship_drifter',
    factionId: 'faction_reach',
    aiArchetype: 'pirate', levelRange: [4, 9], fixedCombatStats: true,
    combatDoctrineId: 'ranged_disengager',
    hull: 128, armor: 35, armorFlat: 1, shield: 62, shieldRegen: 0, cap: 175, capRegen: 26,
    maxSpeed: 94, accel: 62, turnRate: 1.15, collisionRadius: 19, mass: 55,
    weapons: [
      { id: 'wpn_autocannon_s', dmgOverride: 4, rofOverride: 1.4 },
      { id: 'wpn_flak_turret_s', defensiveOnly: true },
    ],
    aiDoctrine: { defaultActivity: 'screen', roe: 'weapons_free', preferredRange: 440, leashRadius: 2400 },
    specialistBehavior: { capability: 'bounded_hull_repair_drone', runtime: 'unwired' },
    specialistWorldTell: { cue: 'green_weld_flashes_on_repair_target', runtime: 'unwired' },
    counterHint: 'kill_or_catch_tender_and_drone_in_well',
    behavior: 'ordinary screening hull pending a bounded repair-drone specialist runtime',
    bountyCr: 460, shipClass: 'corvette', killRewardTier: 'medium',
    loot: {
      creditsRange: [130, 290],
      drops: [
        { id: 'cmdty_medical', chance: 0.55, qtyRange: [1, 3] },
        { id: 'cmdty_comp_hullplate', chance: 0.5, qtyRange: [1, 3] },
      ],
    },
  },
  {
    id: 'harrier_kiter', name: 'Harrier', shipId: 'ship_hornet',
    factionId: 'faction_reach',
    aiArchetype: 'sniper', levelRange: [3, 8], fixedCombatStats: true,
    combatDoctrineId: 'ranged_disengager',
    hull: 78, armor: 14, armorFlat: 0, shield: 36, shieldRegen: 0, cap: 115, capRegen: 23,
    maxSpeed: 146, accel: 112, turnRate: 1.35, collisionRadius: 14, mass: 28,
    weapons: [{
      id: 'wpn_pulse_laser_s', dmgOverride: 2, rofOverride: 0.7,
      projSpeedOverride: 620, rangeOverride: 880,
    }],
    aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: 760, leashRadius: 3200 },
    specialistBehavior: { capability: 'low_dps_long_range_disengage', runtime: 'unwired' },
    specialistWorldTell: { cue: 'distant_tracer_flashes', runtime: 'unwired' },
    counterHint: 'ignore_and_kill_wing',
    behavior: 'low-DPS ranged hull pending a dedicated kite-and-disengage acceptance runtime',
    bountyCr: 300, shipClass: 'fighter', killRewardTier: 'medium',
    loot: {
      creditsRange: [80, 190],
      drops: [
        { id: 'cmdty_munitions', chance: 0.5, qtyRange: [1, 3] },
        { id: 'cmdty_scrap_metal', chance: 0.4, qtyRange: [1, 3] },
      ],
    },
  },
  {
    id: 'tether_control_raider', name: 'Tether-Control Raider', shipId: 'ship_hornet',
    silhouette: 'corsair_blade', factionId: 'faction_reach',
    aiArchetype: 'pirate', levelRange: [5, 11],
    combatDoctrineId: 'tether_control_raider',
    hull: 170, armor: 42, armorFlat: 2, shield: 85, shieldRegen: 11, shieldRegenCapable: true,
    cap: 210, capRegen: 28,
    maxSpeed: 132, accel: 96, turnRate: 1.75, collisionRadius: 18, mass: 78,
    weapons: [{ id: 'wpn_autocannon_m' }, { id: 'wpn_emp_disruptor_m', occasional: true }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 260, leashRadius: 2800 },
    rareSpecialist: true,
    telegraph: { bark: 'warn', line: 'Enemy Massline spooling. Displace, break anchor, or outmass it.', cue: 'attach_spool' },
    counterHint: 'displace_break_anchor_or_outmass',
    behavior: 'rare specialist; telegraphs a Massline attach then contests the player line until displaced, broken, or outmassed',
    bountyCr: 700, shipClass: 'gunship',
    loot: {
      creditsRange: [180, 520],
      drops: [
        { id: 'cmdty_stolen_goods', chance: 0.5, qtyRange: [3, 8] },
        { id: 'cmdty_electronics', chance: 0.35, qtyRange: [1, 4] },
        { id: 'cmdty_quantum_cores', chance: 0.06, qtyRange: [1, 1] },
      ],
    },
  },
  {
    id: 'field_anchor_controller', name: 'Anchor Controller', shipId: 'ship_bastion',
    silhouette: 'bruiser_armor', factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [5, 11],
    combatDoctrineId: 'field_anchor_controller',
    hull: 360, armor: 105, armorFlat: 3, shield: 120, shieldRegen: 10, shieldRegenCapable: true,
    cap: 210, capRegen: 24,
    maxSpeed: 48, accel: 30, turnRate: 0.65, collisionRadius: 32, mass: 420,
    weapons: [
      { id: 'wpn_flak_turret_s', defensiveOnly: true },
      { id: 'wpn_autocannon_m' },
    ],
    aiDoctrine: { defaultActivity: 'screen', roe: 'weapons_free', preferredRange: 480, leashRadius: 2800 },
    fieldAnchor: {
      defKey: 'anchorSnare',
      spinupTicks: 45,
      radius: 235,
      strength: 185,
      damping: 3.2,
      maxAffected: 12,
      presentationTag: 'hostile',
    },
    telegraph: { bark: 'warn', line: 'Anchor field winding. Break radius or move the hull.', cue: 'field_spool' },
    counterHint: 'kill_or_massline_displace_anchor_leave_radius',
    behavior: 'slow command hull; drags a snare field that breaks when the hull dies or moves with it when thrown',
    bountyCr: 780, shipClass: 'gunship',
    loot: {
      creditsRange: [180, 520],
      drops: [
        { id: 'cmdty_alloys', chance: 0.5, qtyRange: [2, 6] },
        { id: 'cmdty_electronics', chance: 0.35, qtyRange: [1, 4] },
        { id: 'cmdty_quantum_cores', chance: 0.08, qtyRange: [1, 1] },
      ],
    },
  },
];
