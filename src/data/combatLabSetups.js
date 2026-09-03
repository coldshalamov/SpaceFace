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
  // THE MASSLINE RIG (PQ-135). The Drifter is the only ungated hull with TWO M-size utility slots,
  // which is the only place the massline heads — Elastic Whip, Monofilament Sweep, Transverse
  // Snare, Tractor — can actually be fitted. Every other starter can carry the physics WEAPONS but
  // not the physics ROPE, so the whole "latch it and sling it into a rock" half of the game had no
  // door into the Crucible at all. It also mounts a rear gun, which is a different flying problem
  // in a room where the swarm is behind you as often as in front.
  {
    id: 'massline_rig',
    label: 'Massline Rig',
    hullId: 'ship_drifter',
    // The Drifter's weapon capacity is 16 and two M guns cost 18, so the rear mount takes the S
    // marker rather than a second heavy — which is also the better rig: the thing you want pointing
    // backwards in a swarm is a tag on whatever is chasing you, not a slower gun.
    loadout: [
      { slotIndex: 0, defId: 'wpn_concussion_cannon_m' },
      { slotIndex: 1, defId: 'wpn_gravity_marker_s' },
      { slotIndex: 7, defId: 'mod_elastic_whip_m' },
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
    // THE ARENA IS SOMEWHERE ELSE NOW (PQ-135).
    //
    // (400, 0) is the tutorial spawn: 230 units from a wreck and a beacon, 970 from Helios Station,
    // on the authored POI corridor, inside the starter asteroid seam, and in the middle of the
    // sector's ambient freight lane. A live screenshot of wave one had a ringed planet filling a
    // quarter of the screen, a station, eighteen ambient ships in the contact list and POI
    // discovery toasts firing over the fight. The Crucible was being played in somebody's front
    // garden.
    //
    // This corner is empty by measurement: 3,000+ units from every station, gate and authored
    // asteroid field, and still well inside the sector's 3,500 world radius. The arena's own
    // geometry (swarmArena.js) is then the only thing in it, which is the point — the room the
    // player fights in should be the room this mode built.
    spawnPos: { x: -1900, z: -2200 },
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
