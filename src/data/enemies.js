// src/data/enemies.js – 8 canonical enemy archetypes.
// 3-layer model: shield -> armor -> hull. Stats are BASE (pre-dangerTier scaling).
// weapon IDs use wpn_ prefix; loot drop IDs use cmdty_ prefix; shipId uses ship_ prefix.
// Pure data, no imports.
//
// VISUALS: each enemy carries a `silhouette` field consumed ONLY by the render track
// (src/render/visualFactory.js). When present it overrides the ship-def family lookup so the
// enemy reads as its OWN hostile silhouette — not a recolored player hull. Values map to the
// ENEMY_FAMILY_BUILDERS table. shipId still drives gameplay stats; silhouette drives appearance.

export const ENEMY_TYPES = [
  {
    id: 'wasp_swarmer', name: 'Wasp Swarmer', shipId: 'ship_wasp',
    silhouette: 'drone_swarm',
    aiArchetype: 'swarmer', levelRange: [1, 3],
    hull: 60, armor: 10, armorFlat: 1, shield: 30, shieldRegen: 5, cap: 60, capRegen: 20,
    maxSpeed: 240, accel: 240, turnRate: 4.2, collisionRadius: 12, mass: 16,
    weapons: [{ id: 'wpn_pulse_laser_s', dmgOverride: 5, rofOverride: 4 }],
    behavior: 'strafe/orbit, packs of 3-6',
    bountyCr: 120, shipClass: 'fighter',
    loot: {
      creditsRange: [20, 60],
      drops: [{ id: 'cmdty_scrap_metal', chance: 0.5, qtyRange: [1, 3] }],
    },
  },
  {
    id: 'lancer_sniper', name: 'Lancer Sniper', shipId: 'ship_wasp',
    silhouette: 'sniper_lance',
    aiArchetype: 'sniper', levelRange: [2, 5],
    hull: 90, armor: 20, armorFlat: 2, shield: 80, shieldRegen: 6, cap: 120, capRegen: 22,
    maxSpeed: 180, accel: 120, turnRate: 2.0, collisionRadius: 14, mass: 24,
    weapons: [{ id: 'wpn_railgun_m', dmgOverride: 40, rofOverride: 0.7, projSpeedOverride: 700, rangeOverride: 1100 }],
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
    silhouette: 'bruiser_armor',
    aiArchetype: 'brawler', levelRange: [3, 7],
    hull: 420, armor: 160, armorFlat: 8, shield: 160, shieldRegen: 12, cap: 180, capRegen: 24,
    maxSpeed: 160, accel: 130, turnRate: 2.2, collisionRadius: 20, mass: 70,
    weapons: [{ id: 'wpn_autocannon_m' }, { id: 'wpn_autocannon_m' }, { id: 'wpn_pulse_laser_s' }],
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
    silhouette: 'trader_haul',
    aiArchetype: 'fleeing_trader', levelRange: [1, 6],
    hull: 200, armor: 60, armorFlat: 4, shield: 120, shieldRegen: 8, cap: 100, capRegen: 14,
    maxSpeed: 190, accel: 90, turnRate: 1.6, collisionRadius: 18, mass: 55,
    weapons: [{ id: 'wpn_flak_turret_s', defensiveOnly: true }],
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
    silhouette: 'pirate_swoop',
    aiArchetype: 'pirate', levelRange: [1, 8],
    hull: 260, armor: 90, armorFlat: 5, shield: 140, shieldRegen: 10, cap: 160, capRegen: 22,
    maxSpeed: 200, accel: 160, turnRate: 2.6, collisionRadius: 18, mass: 60,
    weapons: [{ id: 'wpn_autocannon_s' }, { id: 'wpn_pulse_laser_s' }, { id: 'wpn_missile_rack_m', occasional: true }],
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
    silhouette: 'corsair_blade',
    aiArchetype: 'pirate', levelRange: [4, 10],
    hull: 340, armor: 120, armorFlat: 7, shield: 200, shieldRegen: 12, cap: 200, capRegen: 26,
    maxSpeed: 210, accel: 170, turnRate: 2.8, collisionRadius: 18, mass: 64,
    weapons: [{ id: 'wpn_autocannon_m' }, { id: 'wpn_plasma_cannon_m', occasional: true }],
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
    silhouette: 'patrol_interdict',
    aiArchetype: 'brawler', levelRange: [3, 9],
    hull: 380, armor: 140, armorFlat: 7, shield: 240, shieldRegen: 14, cap: 220, capRegen: 28,
    maxSpeed: 200, accel: 160, turnRate: 2.6, collisionRadius: 18, mass: 70,
    weapons: [{ id: 'wpn_pulse_laser_m' }, { id: 'wpn_flak_turret_s' }],
    behavior: 'lawful patrol; hostile only if player wanted; assists at Trusted+ rep',
    bountyCr: 0, factionLawful: true, shipClass: 'gunship',
    loot: {
      creditsRange: [0, 0],
      drops: [{ id: 'cmdty_munitions', chance: 0.3, qtyRange: [1, 3] }],
    },
  },
  {
    id: 'dreadnought_boss', name: "Dreadnought 'Iron Maw'", shipId: 'ship_leviathan',
    silhouette: 'dreadnought_enemy',
    aiArchetype: 'miniboss_capital', levelRange: [10, 15],
    hull: 6000, armor: 2200, armorFlat: 25, shield: 2400, shieldRegen: 60, shieldRegenDelay: 6, cap: 2000, capRegen: 40,
    maxSpeed: 70, accel: 30, turnRate: 0.4, collisionRadius: 60, mass: 2000,
    weapons: [
      { id: 'wpn_torpedo_l',      count: 2, turret: true },
      { id: 'wpn_heavy_beam_l',   count: 2, turret: true },
      { id: 'wpn_autocannon_m',   count: 6, turret: true },
      { id: 'wpn_flak_turret_s',  count: 4, turret: true },
    ],
    subsystems: { turretHp: 300, spawnsSwarmers: true, phases: [0.66, 0.33] },
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
];
