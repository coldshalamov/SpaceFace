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
export const ENEMY_TYPES = [
  {
    id: 'wasp_swarmer', name: 'Wasp Swarmer', shipId: 'ship_wasp',
    silhouette: 'drone_swarm', factionId: 'faction_reach',
    aiArchetype: 'swarmer', levelRange: [1, 3],
    combatDoctrineId: 'interceptor_flyby',
    hull: 55, armor: 8, armorFlat: 0, shield: 25, shieldRegen: 5, cap: 60, capRegen: 20,
    // A readable approach and a weak hull keep early packs answerable with movement and recoil.
    combatSpeed: 105,
    maxSpeed: 118, accel: 96, turnRate: 2.35, collisionRadius: 12, mass: 16,
    // A short pack strike needs a burst, not two isolated rounds. Doctrine closes the gun
    // between passes; rounds stay below the starter's pulse damage and the hull stays fragile.
    weapons: [{ id: 'wpn_pulse_laser_s', dmgOverride: 6, rofOverride: 8 }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 180, leashRadius: 2200 },
    physicalClass: 'ammunition',
    telegraph: { bark: 'warn', line: 'The pack turns as one — the whole swarm burns in together.', cue: 'engine_flare' },
    behavior: 'strafe/orbit, packs of 3-6',
    bountyCr: 120, shipClass: 'fighter',
    loot: {
      creditsRange: [20, 60],
      drops: [{ id: 'cmdty_scrap_metal', chance: 0.5, qtyRange: [1, 3] }],
    },
  },
  {
    id: 'lancer_sniper', name: 'Lancer Sniper', shipId: 'ship_wasp',
    silhouette: 'sniper_lance', factionId: 'faction_reach',
    aiArchetype: 'sniper', levelRange: [2, 5],
    combatDoctrineId: 'ranged_disengager',
    hull: 70, armor: 12, armorFlat: 1, shield: 50, shieldRegen: 6, cap: 120, capRegen: 22,
    maxSpeed: 126, accel: 84, turnRate: 1.5, collisionRadius: 14, mass: 24,
    weapons: [{ id: 'wpn_railgun_m', dmgOverride: 40, rofOverride: 0.7, projSpeedOverride: 700, rangeOverride: 1100 }],
    aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: 280, leashRadius: 3000 },
    physicalClass: 'ammunition',
    telegraph: { bark: 'warn', line: 'A rail lance charging at standoff. Break its line or close under cover.', cue: 'weapon_charge' },
    behavior: 'kite at max range, retreat when closed',
    bountyCr: 260, shipClass: 'fighter',
    loot: {
      creditsRange: [60, 140],
      drops: [
        { id: 'cmdty_electronics', chance: 0.4, qtyRange: [1, 2] },
        { id: 'cmdty_scrap_metal',  chance: 0.6, qtyRange: [2, 4] },
      ],
    },
  },
  {
    id: 'detonator_dart', name: 'Detonator Dart', shipId: 'ship_wasp',
    silhouette: 'detonator_dart', factionId: 'faction_reach',
    aiArchetype: 'kamikaze', levelRange: [2, 5],
    combatDoctrineId: 'detonator_run',
    // A warhead with an engine strapped to it: fastest hull on the roster, inside the throw
    // class (mass <= 32), and deliberately killable in a couple of pulse hits — the fight is
    // WHERE it dies, not whether. Difficulty lives in the blast, never in hit points.
    hull: 34, armor: 4, armorFlat: 0, shield: 0, shieldRegen: 0, cap: 40, capRegen: 20,
    combatSpeed: 150,
    maxSpeed: 168, accel: 132, turnRate: 2.55, collisionRadius: 10, mass: 20,
    weapons: [],
    // ImpulseCharges owns this fuse: proximity pops it near any hostile hull and death pops it
    // wherever it lands — tethering it into a wingman converts the whole package. The blast is
    // indiscriminate, so the numbers are the lesson: be somewhere else, or put it somewhere else.
    detonator: { blastRadius: 96, damage: 60, impulse: 520, triggerRange: 56 },
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 60, leashRadius: 2600 },
    physicalClass: 'ammunition',
    telegraph: {
      bark: 'warn',
      line: 'Fuse burning. That dart is a flying bomb — shove it, sling it, or put it down before it arrives.',
      cue: 'detonator_fuse',
    },
    counterHint: 'low_mass_shove_tether_or_kill_at_range_blast_hits_everyone',
    behavior: 'closes fast on one straight run, telegraphs a fuse, detonates on proximity or death',
    bountyCr: 140, shipClass: 'drone',
    loot: {
      creditsRange: [15, 50],
      drops: [{ id: 'cmdty_scrap_metal', chance: 0.4, qtyRange: [1, 2] }],
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
    physicalClass: 'terrain',
    telegraph: { bark: 'warn', line: 'The bruiser is squaring its prow for a committed run. Slip the pass and take the flank.', cue: 'engine_flare' },
    counterHint: 'It commits to each pass whole — slip the run and take the flank while it hauls around.',
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
    aiDoctrine: { defaultActivity: 'transit', roe: 'defensive', preferredRange: 280, leashRadius: 2600 },
    physicalClass: 'terrain',
    telegraph: { bark: 'scan', line: 'A hold full of something worth hauling. Pressed, it burns for the lane.', cue: 'engine_flare' },
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
    reinforcements: {
      packageId: 'reaver_swarm_screen',
      type: 'wasp_swarmer', count: [1, 2], hullThreshold: 0.3,
    },
    physicalClass: 'terrain',
    telegraph: { bark: 'warn', line: 'A pirate hull stalking the lane — it presses, calls the swarm, runs when broken.', cue: 'pirate_stalk' },
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
    aiArchetype: 'pirate', levelRange: [4, 10],
    combatDoctrineId: 'interceptor_flyby',
    hull: 180, armor: 45, armorFlat: 2, shield: 80, shieldRegen: 12, shieldRegenCapable: true, cap: 200, capRegen: 26,
    // INF-026: throwable interceptor. Was mass 64 — nearly 3x its ship_hornet hull (24), so the
    // reference concussion shove never broke the helm-loss floor (u < 0.14, T = 0) and a throw-floor
    // swing exceeded the production line's break budget: it could never be ammunition. Now hull 24
    // + 8 for the permanent autocannon M — the lancer standard (wasp 16 + 8 railgun M = 24).
    maxSpeed: 147, accel: 119, turnRate: 2.1, collisionRadius: 18, mass: 32,
    weapons: [{ id: 'wpn_autocannon_m' }, { id: 'wpn_plasma_cannon_m', occasional: true }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 260, leashRadius: 2800 },
    physicalClass: 'ammunition',
    telegraph: { bark: 'warn', line: 'The ace is lining a pass. Throw mass at it — do not chase its guns.', cue: 'weapon_charge' },
    behavior: 'mid-tier pirate elite, frontier ambush packs',
    bountyCr: 620, shipClass: 'gunship',
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
    aiDoctrine: { defaultActivity: 'patrol_route', roe: 'lawful_wanted_only', preferredRange: 320, leashRadius: 2600 },
    // The interceptor and the customs cutter share the Hornet hull and patrol_interdict
    // silhouette — the physical read has to be carried by geometry, not a paint job. The
    // pursuit prow is plated for running down a wanted ship head-on; the stern is exposed
    // for exactly as long as an overshoot takes to come back around.
    directionalArmor: { frontArcDeg: 120, frontMult: 0.65, rearArcDeg: 130, rearMult: 1.25 },
    physicalClass: 'terrain',
    telegraph: { bark: 'warn', line: 'Interceptor squaring its plated prow for pursuit. Cross the pass and work the stern.', cue: 'engine_flare' },
    counterHint: 'cross_the_pass_shoot_the_stern_while_it_turns_back',
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
    aiArchetype: 'miniboss_capital', levelRange: [10, 15],
    combatDoctrineId: 'capital_broadside',
    hull: 6000, armor: 2200, armorFlat: 3, shield: 2400, shieldRegen: 60, shieldRegenCapable: true, shieldRegenDelay: 6, cap: 2000, capRegen: 40,
    maxSpeed: 49, accel: 21, turnRate: 0.3, collisionRadius: 60, mass: 2000,
    weapons: [
      { id: 'wpn_torpedo_l',      count: 2, turret: true },
      { id: 'wpn_heavy_beam_l',   count: 2, turret: true },
      { id: 'wpn_autocannon_m',   count: 6, turret: true },
      { id: 'wpn_flak_turret_s',  count: 4, turret: true },
    ],
    aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: 260, leashRadius: 3400 },
    physicalClass: 'terrain',
    telegraph: {
      bark: 'warn',
      line: 'Iron Maw is rolling broadside. Cross its bow before the batteries align.',
      cue: 'broadside_charge',
    },
    counterHint: 'Cross the bow or stern during the charge; the next salvo shifts to the opposite flank.',
    // FB-020: every mount is a destructible turret subsystem — shoot the guns off the rails and
    // the fight phases on physical mount loss. First edge vents the screen; the last edge is the
    // desperation battery. The old hull-fraction `phases` table is gone: the health bar no longer
    // drives the fight, the guns do.
    subsystems: { turretHp: 300, phaseAtTurretsLost: [4, 10] },
    reinforcements: {
      packageId: 'iron_maw_screen',
      // The screen vents when the first turret edge falls (4 mounts) — the authored beat —
      // with the hull threshold kept as the mercy trigger for a hull that bypasses its guns.
      type: 'wasp_swarmer', count: [2, 4], turretsLostAtLeast: 4, hullThreshold: 0.35,
    },
    // FB-020: the bow is an armored plate until the second turret edge tears it — shots inside
    // the prow arc bank off (bossSurface), and only then does the PROW RIB window open for bonus
    // damage. The class default (rear reactor vent) would punish the authored counterHint.
    prowSurface: { arcDeg: 70, material: 'iron_plate' },
    weakPoint: { label: 'PROW RIB', arcCenter: 0, arcHalfWidth: 0.40, bonusMult: 1.35, hint: 'BOW', opensAtTurretEdge: 2 },
    behavior: 'slow fortress, destructible turrets, vents swarmers on mount loss, desperation battery at the second edge',
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
    combatDoctrineId: 'mine_layer_wake',
    hull: 110, armor: 28, armorFlat: 1, shield: 45, shieldRegen: 8, cap: 150, capRegen: 20,
    maxSpeed: 105, accel: 72, turnRate: 1.45, collisionRadius: 18, mass: 58,
    weapons: [
      { id: 'wpn_autocannon_s' },
      { id: 'wpn_missile_rack_m', occasional: true },
      { id: 'wpn_flak_turret_s', defensiveOnly: true },
    ],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 240, leashRadius: 2500 },
    physicalClass: 'specialist',
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
    // FB-018: the screen is the row's identity, not an override table entry — the escort holds
    // its ward-facing slot in every spawn path, survival waves included.
    combatDoctrineId: 'escort_screen',
    hull: 200, armor: 55, armorFlat: 2, shield: 80, shieldRegen: 11, shieldRegenCapable: true, cap: 190, capRegen: 24,
    maxSpeed: 100, accel: 80, turnRate: 1.5, collisionRadius: 20, mass: 75,
    weapons: [
      { id: 'wpn_flak_turret_s' },
      { id: 'wpn_flak_turret_s' },
      { id: 'wpn_autocannon_m' },
    ],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 240, leashRadius: 2200 },
    physicalClass: 'specialist',
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
    aiDoctrine: { defaultActivity: 'patrol_route', roe: 'lawful_wanted_only', preferredRange: 320, leashRadius: 2600 },
    // Same Hornet hull and patrol_interdict silhouette as the interceptor — the cutter's
    // differentiator is its plated boarding prow. Within a narrow 90° nose arc an eligible
    // ricochet shot banks off the plate instead of landing; every other contact is the
    // ordinary hull. The boss-surface machinery resolves the verdict per contact.
    prowSurface: { arcDeg: 90, material: 'plate' },
    physicalClass: 'specialist',
    telegraph: { bark: 'scan', line: 'Customs sweep resolving. Answer it clean or the plated prow comes aboard.', cue: 'scan_sweep' },
    counterHint: 'bank_shots_off_room_plate_or_attack_the_flanks',
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
    // FB-017: not a faster wasp — a guardian. The zealot bodies the lane between its marked
    // packmate and whatever is pressing it, so a Choir pack reads as screen-plus-strikers,
    // not more of the same swarm. Hull parity with the wasp keeps the difference behavioral.
    combatDoctrineId: 'escort_screen',
    hull: 55, armor: 10, armorFlat: 0, shield: 40, shieldRegen: 6, cap: 90, capRegen: 22,
    maxSpeed: 125, accel: 105, turnRate: 2.5, collisionRadius: 12, mass: 17,
    weapons: [
      { id: 'wpn_pulse_laser_s', dmgOverride: 4, rofOverride: 2.6 },
      { id: 'wpn_missile_rack_m', occasional: true },
    ],
    aiDoctrine: { defaultActivity: 'screen', roe: 'weapons_free', preferredRange: 200, leashRadius: 2300 },
    // The dart to the ward's defense runs nose-first: a narrow boarding plate banks clean shots
    // while it interposes — peel it off the marked hull before working the pack.
    prowSurface: { arcDeg: 90, material: 'plate' },
    // A guardian role on a throw-weight hull: mass says ammunition, and the honest counter is
    // pitching it aside or burning through it to the ward — the role shows in doctrine, not class.
    physicalClass: 'ammunition',
    telegraph: { bark: 'warn', line: 'The Choir shields its marked own — the zealot bodies the lane to the ward.', cue: 'engine_flare' },
    behavior: 'ideological pack guardian; screens the marked ally, darts at whatever breaches it',
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
    // FB-017: the stalker variant — same hull as the lancer, a different problem. It only opens
    // a firing corridor from beyond the player's lock band and relocates to the opposite flank
    // after every shot.
    combatDoctrineId: 'ranged_stalker',
    hull: 70, armor: 15, armorFlat: 1, shield: 55, shieldRegen: 8, cap: 140, capRegen: 24,
    maxSpeed: 130, accel: 90, turnRate: 1.7, collisionRadius: 13, mass: 22,
    weapons: [
      { id: 'wpn_railgun_m', dmgOverride: 36, rofOverride: 0.65, projSpeedOverride: 720, rangeOverride: 1050 },
      { id: 'wpn_emp_disruptor_m', occasional: true },
    ],
    aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: 620, leashRadius: 3200 },
    // The stealth work is doctrine, not mass: the body is still throw-weight, and break-lock +
    // close-under-cover is the counter either way. Ammunition is the honest physical read.
    physicalClass: 'ammunition',
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
    physicalClass: 'specialist',
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
    id: 'warden_escort', name: 'Warden Escort', shipId: 'ship_bastion',
    silhouette: 'bruiser_armor', factionId: 'faction_vael',
    aiArchetype: 'guardian', levelRange: [4, 9],
    combatDoctrineId: 'escort_screen',
    hull: 300, armor: 90, armorFlat: 3, shield: 110, shieldRegen: 13, shieldRegenCapable: true,
    cap: 190, capRegen: 26,
    maxSpeed: 96, accel: 78, turnRate: 1.4, collisionRadius: 21, mass: 96,
    weapons: [{ id: 'wpn_autocannon_m' }, { id: 'wpn_pulse_laser_s' }],
    aiDoctrine: { defaultActivity: 'screen', roe: 'weapons_free', preferredRange: 150, leashRadius: 2600 },
    physicalClass: 'specialist',
    telegraph: { bark: 'warn', line: 'Enemy screen deploying. The warden is guarding the pack, not hunting you.', cue: 'engine_flare' },
    counterHint: 'outrange_or_ignore_until_pack_commits',
    behavior: 'plants a screen between the nearest packmate and the pressing threat; darts only when the ward is breached',
    bountyCr: 560, shipClass: 'guardian',
    loot: {
      creditsRange: [140, 340],
      drops: [
        { id: 'cmdty_scrap_metal', chance: 0.6, qtyRange: [3, 7] },
        { id: 'cmdty_electronics', chance: 0.3, qtyRange: [1, 3] },
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
      presentationTag: 'environmental',
    },
    physicalClass: 'specialist',
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
  // PQ-133.04: Foundry wave-ten ram. Reuses the live committed-brawler doctrine,
  // Bastion body and weapon/kill owners. Support comes from the wave's six budgeted
  // swarmers, never an unbudgeted reinforcement hook. Directional reflective armor
  // and external rear machinery require the shared surface/subsystem owners.
  // INF-025 implements the prow/stern split as authored directionalArmor on the shared
  // damage router; stern hits additionally fall on the standard aft drive-subsystem volume.
  {
    id: 'mirrorjaw_foreman', name: 'Mirrorjaw Foreman', shipId: 'ship_bastion',
    silhouette: 'bruiser_armor', factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [4, 4],
    combatDoctrineId: 'brawler_commit',
    hull: 720, armor: 120, armorFlat: 2, shield: 160, shieldRegen: 0,
    cap: 240, capRegen: 26,
    maxSpeed: 84, accel: 52, turnRate: 0.55, collisionRadius: 32, mass: 420,
    weapons: [
      { id: 'wpn_concussion_cannon_m' },
      { id: 'wpn_pulse_laser_s', dmgOverride: 6, rofOverride: 2.4 },
    ],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 220, leashRadius: 2400 },
    // INF-025: the positioning problem. The mirror prow sheds head-on fire (frontMult) while the
    // exposed stern machinery takes bonus damage (rearMult), so circling or baiting a pass and
    // shooting the stern changes the outcome; face-tanking does not. Routed by the shared damage
    // router off hit geometry; rear hits additionally strike the aft drive subsystem volume.
    directionalArmor: { frontArcDeg: 150, frontMult: 0.25, rearArcDeg: 150, rearMult: 1.6 },
    // PQ-133.04 R4: the prow is authored SURFACE machinery, not just a damage multiplier. Within
    // the same 150° forward arc the directional armor already sheds, an eligible ricochet shot
    // BANKS off the mirror plate (surfaceResponseFor('plate') = reflect, the Foundry room's own
    // material); outside the arc the contact is ordinary armor and the shot is consumed. The
    // verdict is resolved per contact by src/combat/bossSurface.js off this authoring — the same
    // normalized-arc convention as resolveDirectionalArmor (+X local is the nose). Zero bounty and
    // no loot stay exactly as authored below.
    prowSurface: { arcDeg: 150, material: 'plate' },
    // Surface identity of the hull itself, so a physics-issued receipt at this body carries the
    // authored material instead of the shapeless default. Fail-closed elsewhere: an entity without
    // this stamp still resolves the verdict, but the kernel refuses the bank on a non-reflective
    // receipt — damage, never a fabricated bounce.
    surfaceMaterial: 'plate',
    physicalClass: 'specialist',
    telegraph: {
      bark: 'warn', cue: 'engine_flare',
      line: 'Foreman committing. Mirror prow sheds head-on fire — cross its charge and work the stern.',
    },
    counterHint: 'Cross its committed pass and shoot the stern through the slow turn; head-on fire sheds off the prow. Or throw a swarmer into the hull.',
    behavior: 'heavy committed ram; slow recovery turn, concussion pressure and six wave-owned escorts',
    // Zero pay is load-bearing: the survival boundary test pins boss kills at zero campaign
    // economy, and combat.js pays d.bountyCr/d.loot without a run-ownership gate. Open-route
    // foreman pay needs a cohort-scoped payout seam first — do not price this row directly.
    bountyCr: 0, shipClass: 'gunship',
    loot: null,
  },
  // PQ-133.07 (CRU-043): the Foundry FINALE. Wave thirty does not replay the wave-ten Foreman —
  // the Mirrorjaw core returns as the Forge Regent, under a wider crown than the Foreman's prow.
  //
  // It is a DIFFERENT PROBLEM, not a bigger health bar (master plan §14 "no HP inflation"): its
  // defensive numbers are the Foreman's, and what changed is the geometry and the gun.
  //   * directionalArmor / prowSurface arc 150° -> 180°: the crown sheds more of the head-on
  //     hemisphere, so the correct answer is to cross its committed pass and work the stern — a
  //     wider no-bank zone, not a thicker wall.
  //   * the light pulse repeater becomes a sustained furnace beam: the finale reads as the room's
  //     own heat turned on the player, matching the wave's "furnace control" identity.
  // The rotating crown / plate machinery is an authored presentation asset (GPU lane); the systems
  // identity, telegraph and kill geometry ship here. Zero pay and no loot stay as for the Foreman:
  // combat pays d.bountyCr/d.loot without a run-ownership gate, and this is a survival boss.
  {
    id: 'forge_regent', name: 'Forge Regent', shipId: 'ship_bastion',
    silhouette: 'bruiser_armor', factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [4, 4],
    combatDoctrineId: 'brawler_commit',
    hull: 720, armor: 120, armorFlat: 2, shield: 160, shieldRegen: 0,
    cap: 240, capRegen: 26,
    maxSpeed: 84, accel: 52, turnRate: 0.55, collisionRadius: 32, mass: 420,
    weapons: [
      { id: 'wpn_concussion_cannon_m' },
      { id: 'wpn_beam_laser_m' },
    ],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 220, leashRadius: 2400 },
    directionalArmor: { frontArcDeg: 180, frontMult: 0.2, rearArcDeg: 180, rearMult: 1.7 },
    prowSurface: { arcDeg: 180, material: 'plate' },
    surfaceMaterial: 'plate',
    // Presentation-only dressing for the render lane (src/render/forgeRegentCrown.js): the wider
    // crown the systems side authors as 180° directional armor reads in the room as a collar of
    // mirror plates rotating around the bow. Combat numbers stay untouched by this field.
    bossDressing: { kind: 'forge_crown' },
    physicalClass: 'specialist',
    telegraph: {
      bark: 'warn', cue: 'engine_flare',
      line: 'Forge Regent takes the furnace. Mirror crown wider than the Foreman — cross the pass and work the stern.',
    },
    counterHint: 'The crown sheds the whole front half. Cross its committed pass and shoot the stern, or bank a shot off the room plate into the exposed back.',
    behavior: 'finale committed ram under the furnace crown; wider mirror plate, sustained furnace beam and the room\'s own system',
    bountyCr: 0, shipClass: 'gunship',
    loot: null,
  },
  // SWARM-07 B3 — the Brood champions (SWARM_EXPANSION §4 B3). Both are REAL combat entities:
  // they materialize through the same wave package path as the Foreman and hand their hull to
  // the authored score the wave owner starts (`capitalBoss:start`). Ordinary brood stay light
  // bodies in the second population; these two are its named set-pieces. Zero pay and no loot
  // for the same reason the Foreman and Regent carry none: combat pays d.bountyCr/d.loot without
  // a run-ownership gate, and a survival boss must not leak campaign economy.
  //
  // THE BROOD QUEEN. Not a bigger wasp — the room's mother. She is ponderous until the hunt:
  // the three egg sacs are her guns AND her weak points (turret mounts, destructible through
  // the ordinary subsystem machinery — a dead sac goes silent), and the sacs hang off her
  // stern so the weak arc and the mounts tell one story. Her flood is the brood cohort itself:
  // her wave's plan fields nothing but mites at full population.
  {
    id: 'brood_queen', name: 'Brood Queen', shipId: 'ship_saucer',
    silhouette: 'drone_swarm', factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [4, 4],
    combatDoctrineId: 'pack_pursuit',
    hull: 900, armor: 140, armorFlat: 2, shield: 0, shieldRegen: 0,
    cap: 300, capRegen: 30,
    maxSpeed: 46, accel: 30, turnRate: 1.0, collisionRadius: 34, mass: 520,
    weapons: [
      // The three sacs: each turret mount is a destructible subsystem (subsystems.turretHp),
      // so "break the sacs" is a literal verb — a dead mount goes silent through the ordinary
      // weaponBankReadiness gate, and she enters her last act spitting nothing.
      { id: 'wpn_plasma_cannon_m', count: 3, turret: true, dmgOverride: 9, rofOverride: 0.7 },
    ],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 260, leashRadius: 2400 },
    subsystems: { turretHp: 220 },
    // FB-020 weak-point pattern (the Iron Maw's prow rib), moved to her stern: the egg sacs
    // hang off the back — her back is the soft part, and the same arc the mounts occupy.
    weakPoint: {
      label: 'BROOD SAC', arcCenter: Math.PI, arcHalfWidth: 0.62,
      bonusMult: 1.55, hint: 'The sacs hang off her stern. Cross the lunge and work her back.',
    },
    physicalClass: 'specialist',
    telegraph: {
      bark: 'warn', cue: 'pd_curtain',
      line: 'The broodmother floods the room. Her sacs are the weak points — her own brood is ammunition.',
    },
    counterHint: 'The sacs are her guns and her soft arc — cross her committed lunge, work the stern, and feed the flood back to her.',
    behavior: 'broodmother: floods the room with mites, spits acid fans off three sac mounts, then hunts when the sacs are broken',
    bountyCr: 0, shipClass: 'gunship',
    loot: null,
  },
  //
  // THE TENDRIL. A giant segmented worm through the asteroid field — the head is this real
  // hull (a committed weave that cannot turn mid-pass), and its trailing body is the brood
  // engine's segment chain: light bodies that follow the head, split when a middle segment
  // dies, and collapse when the head does. Sling it into itself: feed the weave a rock.
  {
    id: 'brood_tendril', name: 'The Tendril', shipId: 'ship_hornet',
    silhouette: 'drone_swarm', factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [4, 4],
    combatDoctrineId: 'brawler_commit',
    hull: 640, armor: 100, armorFlat: 1, shield: 0, shieldRegen: 0,
    cap: 260, capRegen: 26,
    maxSpeed: 95, accel: 60, turnRate: 1.4, collisionRadius: 26, mass: 300,
    weapons: [
      // A light sting so the head is never free to ignore you between weaves — the body
      // trailing it is the real weapon.
      { id: 'wpn_pulse_laser_s', dmgOverride: 7, rofOverride: 1.6 },
    ],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 190, leashRadius: 2400 },
    physicalClass: 'specialist',
    telegraph: {
      bark: 'warn', cue: 'engine_flare',
      line: 'A worm works the field. It cannot turn mid-weave — put a rock on the line.',
    },
    counterHint: 'The weave is committed before it starts — sidestep and feed it a rock; break a middle segment and the body splits and hunts on its own.',
    behavior: 'segmented worm: committed weave passes with a trailing chain that splits when a mid segment dies and collapses when the head does',
    bountyCr: 0, shipClass: 'gunship',
    loot: null,
  },
  // THE LATTICE WARDEN. Mid-game capital hunt (src/data/missions.js CAPITAL_HUNTS): a rogue
  // lane-marking automaton that re-stakes salvage lanes with a breakable tether-lattice. Its
  // three node stakes are mission-owned actors, not this row's hardware — the authored score
  // (src/data/encounters/capital-boss/lattice-warden.js) drives the fight. The forge body
  // arrives through data.assetRef (decorateCapitalBossSpawnSpec), so shipId stays a stat donor.
  {
    id: 'lattice_warden', name: 'Lattice Warden', shipId: 'ship_bastion',
    silhouette: 'bruiser_armor', factionId: 'faction_mts',
    aiArchetype: 'miniboss_capital', levelRange: [4, 7],
    combatDoctrineId: 'capital_broadside_lattice_warden',
    hull: 560, armor: 0, armorFlat: 1, shield: 0, shieldRegen: 0,
    cap: 320, capRegen: 30,
    maxSpeed: 52, accel: 40, turnRate: 0.8, collisionRadius: 26, mass: 340,
    weapons: [
      { id: 'wpn_autocannon_m', turret: true },
      { id: 'wpn_autocannon_m', turret: true },
      { id: 'wpn_railgun_m' },
    ],
    aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: 280, leashRadius: 2600 },
    physicalClass: 'specialist',
    // Presentation-only dressing for the render lane (src/render/latticeWardenTethers.js):
    // the stake-collar ring and projector vanes already read on the forge body; the dressing
    // draws the tether beams, node glow and lance charge. Combat numbers stay untouched.
    bossDressing: { kind: 'lattice_warden' },
    telegraph: {
      bark: 'warn', cue: 'weapon_charge',
      line: 'A survey automaton is staking the lane. Three stakes make a cell — break one.',
    },
    counterHint: 'Break any one lattice stake before the tell ends — the collapse cancels and the Warden winds down open.',
    behavior: 'patient trap architect: stakes a triangle around you, holds fire inside the cell, collapses it with a phase lance; one dead stake staggers it',
    bountyCr: 4200, shipClass: 'capital',
    loot: {
      creditsRange: [600, 1400],
      guaranteed: [{ id: 'cmdty_warden_stake_core', qtyRange: [1, 1] }],
      drops: [
        { id: 'cmdty_electronics', chance: 0.7, qtyRange: [1, 3] },
        { id: 'cmdty_alloys', chance: 0.5, qtyRange: [2, 4] },
      ],
    },
  },
];
