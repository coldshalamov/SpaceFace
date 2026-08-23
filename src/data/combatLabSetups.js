// Combat Lab catalogs — starter hull/loadout packages, enemy packages, and arena prototypes.
// Pure frozen data. No systems imports and no runtime writes after module init.
// Arena geometry is intentionally sector/position mapping only (authored arenas are later work).

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

export const COMBAT_LAB_STARTER_PACKAGES = freezeDeep([
  {
    id: 'energy_baseline',
    label: 'Baseline Energy',
    hullId: 'ship_kestrel',
    loadout: [
      { slotIndex: 0, defId: 'wpn_pulse_laser_s' },
    ],
  },
  {
    id: 'kinetic_baseline',
    label: 'Baseline Kinetic',
    hullId: 'ship_hornet',
    loadout: [
      { slotIndex: 0, defId: 'wpn_autocannon_m' },
    ],
  },
  {
    id: 'physics_toolkit',
    label: 'Physics Toolkit',
    hullId: 'ship_hornet',
    loadout: [
      { slotIndex: 0, defId: 'wpn_concussion_cannon_m' },
      { slotIndex: 1, defId: 'wpn_gravity_marker_s' },
      { slotIndex: 2, defId: 'wpn_momentum_sink_s' },
    ],
  },
]);

export const COMBAT_LAB_ENEMY_PACKAGES = freezeDeep([
  {
    id: 'physics_swarm',
    label: 'Physics Swarm',
    // Parity with today's Sandbox physics_swarm: 10 lights + 2 mediums (1 reaver + 1 corsair).
    entries: [
      { enemyId: 'wasp_swarmer', count: 10, level: 1 },
      { enemyId: 'reaver_pirate', count: 1, level: 2 },
      { enemyId: 'corsair_raider', count: 1, level: 2 },
    ],
    maxConcurrent: 12,
    spawnDistance: 230,
  },
  {
    id: 'wasp_flight',
    label: 'Wasp Flight',
    entries: [
      { enemyId: 'wasp_swarmer', count: 6, level: 1 },
    ],
    maxConcurrent: 6,
    spawnDistance: 260,
  },
  {
    id: 'mixed_screen',
    label: 'Mixed Screen',
    entries: [
      { enemyId: 'wasp_swarmer', count: 4, level: 1 },
      { enemyId: 'lancer_sniper', count: 2, level: 2 },
      { enemyId: 'reaver_pirate', count: 2, level: 2 },
    ],
    maxConcurrent: 8,
    spawnDistance: 280,
  },
  {
    id: 'sniper_pair',
    label: 'Lancer Pair',
    entries: [
      { enemyId: 'lancer_sniper', count: 2, level: 3 },
    ],
    maxConcurrent: 2,
    spawnDistance: 700,
  },
]);

export const COMBAT_LAB_ARENAS = freezeDeep([
  {
    id: 'helios_core',
    label: 'Helios Core',
    sectorId: 'sector_helios_prime',
    spawnPos: { x: 400, z: 0 },
  },
  {
    id: 'ceres_belt',
    label: 'Ceres Mining Belt',
    sectorId: 'sector_ceres_belt',
    spawnPos: { x: 500, z: -700 },
  },
  {
    id: 'tethys_hub',
    label: 'Tethys Exchange',
    sectorId: 'sector_tethys_junction',
    spawnPos: { x: 1050, z: 380 },
  },
  {
    id: 'lagrange_crucible',
    label: 'Lagrange Crucible',
    sectorId: 'sector_helios_prime',
    spawnPos: { x: -500, z: 800 },
  },
  {
    id: 'cinder_sluice',
    label: 'Cinder Sluice',
    sectorId: 'sector_ceres_belt',
    spawnPos: { x: -300, z: 200 },
  },
  {
    id: 'cryo_drift',
    label: 'Cryo Drift',
    sectorId: 'sector_vesta_forge',
    spawnPos: { x: 680, z: 320 },
  },
  {
    id: 'storm_lattice',
    label: 'Storm Lattice',
    sectorId: 'sector_tethys_junction',
    spawnPos: { x: -640, z: -1180 },
  },
]);
