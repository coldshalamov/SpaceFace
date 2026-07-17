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
  {
    id: 'lancer_sniper', name: 'Lancer Sniper', shipId: 'ship_wasp',
    silhouette: 'sniper_lance', factionId: 'faction_reach',
    aiArchetype: 'sniper', levelRange: [2, 5],
    combatDoctrineId: 'ranged_disengager',
    hull: 70, armor: 12, armorFlat: 1, shield: 50, shieldRegen: 6, cap: 120, capRegen: 22,
    maxSpeed: 126, accel: 84, turnRate: 1.5, collisionRadius: 14, mass: 24,
    weapons: [{ id: 'wpn_railgun_m', dmgOverride: 40, rofOverride: 0.7, projSpeedOverride: 700, rangeOverride: 1100 }],
    aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: 760, leashRadius: 3000 },
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
    id: 'bruiser_brawler', name: 'Bruiser Brawler', shipId: 'ship_bastion',
    silhouette: 'bruiser_armor', factionId: 'faction_reach',
    aiArchetype: 'brawler', levelRange: [3, 7],
    combatDoctrineId: 'interceptor_flyby',
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
    combatDoctrineId: 'tether_control_raider',
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
    aiArchetype: 'pirate', levelRange: [4, 10],
    combatDoctrineId: 'tether_control_raider',
    hull: 180, armor: 45, armorFlat: 2, shield: 80, shieldRegen: 12, shieldRegenCapable: true, cap: 200, capRegen: 26,
    maxSpeed: 147, accel: 119, turnRate: 2.1, collisionRadius: 18, mass: 64,
    weapons: [{ id: 'wpn_autocannon_m' }, { id: 'wpn_plasma_cannon_m', occasional: true }],
    aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 320, leashRadius: 2800 },
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
    aiArchetype: 'miniboss_capital', levelRange: [10, 15],
    combatDoctrineId: 'ranged_disengager',
    hull: 6000, armor: 2200, armorFlat: 25, shield: 2400, shieldRegen: 60, shieldRegenCapable: true, shieldRegenDelay: 6, cap: 2000, capRegen: 40,
    maxSpeed: 49, accel: 21, turnRate: 0.3, collisionRadius: 60, mass: 2000,
    weapons: [
      { id: 'wpn_torpedo_l',      count: 2, turret: true },
      { id: 'wpn_heavy_beam_l',   count: 2, turret: true },
      { id: 'wpn_autocannon_m',   count: 6, turret: true },
      { id: 'wpn_flak_turret_s',  count: 4, turret: true },
    ],
    aiDoctrine: { defaultActivity: 'reposition', roe: 'weapons_free', preferredRange: 620, leashRadius: 3400 },
    subsystems: { turretHp: 300, spawnsSwarmers: true, phases: [0.66, 0.33] },
    reinforcements: { type: 'wasp_swarmer', count: [2, 4], hullThreshold: 0.5 },
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
    combatDoctrineId: 'tether_control_raider',
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
];
